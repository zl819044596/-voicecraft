/**
 * BGM 素材（Phase 3，03-接口文档 §5.5）：
 *   POST /api/bgm        上传原始音频 → 201 { bgm_key, url, size, duration }
 *   GET  /api/bgm        列表（MinIO 对象，内存分页）
 *   GET  /api/bgm/:file  流式回放（Range → 206）
 *
 * 仅 mp3/wav（Content-Type 或 ?filename= / X-BGM-Filename）；>20MB → 413。
 * 本路由须在全局 express.json 之前挂载（POST 读取原始字节流）。
 */

import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../session.js';
import { minio, BUCKET, bgmKey } from '../minio.js';
import { asyncHandler, pagination } from '../utils.js';
import { apiError } from '@avs/shared';

export const router = Router();

const MAX_BGM_BYTES = 20 * 1024 * 1024;
const AUDIO_CONTENT_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav']);
const ALLOWED_EXT = new Set(['mp3', 'wav']);

router.use(requireAuth);

function contentExt(contentType: string): string | null {
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (type === 'audio/mpeg' || type === 'audio/mp3') return 'mp3';
  if (type === 'audio/wav' || type === 'audio/x-wav') return 'wav';
  return null;
}

function extFromName(name: string): string | null {
  const m = String(name || '').match(/\.([A-Za-z0-9]{2,5})$/);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : null;
}

// 时长估算（纯 Node，无 ffprobe）。WAV：fmt.byteRate + data.size。
const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

function estimateDuration(buf: Buffer, ext: string): number | null {
  try {
    if (ext === 'wav') {
      if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
      let byteRate = 0;
      let dataSize = 0;
      let off = 12;
      while (off + 8 <= buf.length) {
        const id = buf.toString('ascii', off, off + 4);
        const size = buf.readUInt32LE(off + 4);
        if (id === 'fmt ') {
          byteRate = buf.readUInt32LE(off + 16);
          if (byteRate === 0) return null;
        } else if (id === 'data') {
          dataSize = size;
          break;
        }
        off += 8 + size + (size % 2);
      }
      if (byteRate <= 0 || dataSize <= 0) return null;
      return Number((dataSize / byteRate).toFixed(2));
    }
    if (ext === 'mp3') {
      let i = 0;
      for (; i + 4 <= buf.length; i += 1) {
        if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) break;
      }
      if (i + 4 > buf.length) return null;
      const b1 = buf[i + 1];
      const b2 = buf[i + 2];
      const versionBits = (b1 >> 3) & 0x03;
      const layerBits = (b1 >> 1) & 0x03;
      const bitrateIndex = (b2 >> 4) & 0x0f;
      if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15) return null;
      const table = versionBits === 3 ? MPEG1_L3_BITRATES : MPEG2_L3_BITRATES;
      const kbps = table[bitrateIndex];
      if (!kbps) return null;
      return Number(((buf.length * 8) / (kbps * 1000)).toFixed(2));
    }
  } catch {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/bgm — 上传原始音频（body = 文件字节流）。
// ---------------------------------------------------------------------------
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    let ext = contentExt(contentType);
    const filename = String(req.query.filename ?? req.headers['x-bgm-filename'] ?? '');
    if (!ext) {
      ext = extFromName(filename);
      if (!ext) {
        throw apiError(422, 'VALIDATION_ERROR', 'Unsupported audio format: only mp3/wav are accepted (set Content-Type: audio/mpeg|audio/wav or ?filename=)');
      }
    }

    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > MAX_BGM_BYTES) {
        tooLarge = true;
        break;
      }
      chunks.push(chunk);
    }
    if (tooLarge) throw apiError(413, 'BAD_REQUEST', 'BGM file must be ≤ 20 MB');
    const buf = Buffer.concat(chunks);
    if (buf.length === 0) throw apiError(422, 'VALIDATION_ERROR', 'Empty file');

    const uid = req.userId!;
    const key = bgmKey(uid, `${crypto.randomUUID()}.${ext}`);
    const mime = ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
    await minio.putObject(BUCKET, key, buf, buf.length, { 'Content-Type': mime });

    res.status(201).json({
      bgm_key: key,
      url: `/api/bgm/${key.split('/').pop()}`,
      size: buf.length,
      duration: estimateDuration(buf, ext),
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/bgm — 列表（内存分页；单用户 BGM 集合较小）。
// ---------------------------------------------------------------------------
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const { page, size } = pagination(req);
    const prefix = `users/${uid}/bgm/`;
    const items: Array<{ key: string; url: string; size: number | null; last_modified: Date | null }> = [];
    const stream = minio.listObjectsV2(BUCKET, prefix, true);
    for await (const obj of stream) {
      if (!obj || !obj.name) continue;
      items.push({
        key: obj.name,
        url: `/api/bgm/${obj.name.split('/').pop()}`,
        size: obj.size ?? null,
        last_modified: obj.lastModified ?? null,
      });
    }
    items.sort((a, b) => (Number(b.last_modified) || 0) - (Number(a.last_modified) || 0));
    const total = items.length;
    const offset = (page - 1) * size;
    res.json({ items: items.slice(offset, offset + size), page, size, total });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/bgm/:file — 流式回放（支持 Range → 206）。
// ---------------------------------------------------------------------------
router.get(
  '/:file',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const file = String(req.params.file ?? '');
    if (!/^[A-Za-z0-9._-]+$/.test(file)) throw apiError(404, 'NOT_FOUND', 'BGM not found');
    const key = `users/${uid}/bgm/${file}`;

    let stat;
    try {
      stat = await minio.statObject(BUCKET, key);
    } catch {
      throw apiError(404, 'NOT_FOUND', 'BGM not found');
    }
    const size = stat.size;
    const mime = file.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';

    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=300');

    const range = String(req.headers.range ?? '');
    const m = range.match(/^bytes=(\d*)-(\d*)$/);
    try {
      if (!m) {
        res.setHeader('Content-Length', String(size));
        const stream = await minio.getPartialObject(BUCKET, key, 0, 0);
        stream.on('error', () => res.destroy());
        stream.pipe(res);
        return;
      }
      const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
      const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= size) {
        res.setHeader('Content-Range', `bytes */${size}`);
        res.status(416).json({ error: { code: 'RANGE_NOT_SATISFIABLE', message: 'Range not satisfiable' } });
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      const stream = await minio.getPartialObject(BUCKET, key, start, end - start + 1);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (err) {
      console.error(`[bgm] stream failed: ${(err as Error).message}`);
      if (!res.headersSent) throw apiError(500, 'INTERNAL', 'Stream failed');
      res.destroy();
    }
  }),
);
