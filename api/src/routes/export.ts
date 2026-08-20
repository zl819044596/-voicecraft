/**
 * 开放导出下载（Phase 7，03-接口文档 §8 / 00-CONTRACT C7）。
 *
 *   GET /api/export/:id — 流式下载 L10 生成的 zip（MP4 + storyboard.json +
 *   script.md + 素材 + SRT + LICENSE），保留 30 天。
 *
 * 契约：
 *   - 归属校验（exports → tasks → projects → user，非本人 403 FORBIDDEN）
 *   - 过期校验（expires_at = 创建 + 30 天 → 410 EXPORT_EXPIRED + details.expired_at）
 *   - 响应头 Content-Type/Content-Disposition/X-Export-Expires-At/X-Checksum-SHA256
 *   - 对象流式输出（MinIO getObject → pipe），不整包缓冲
 */

import { Router, Request, Response } from 'express';
import { basename } from 'node:path';
import archiver from 'archiver';
import { query } from '../db.js';
import { minio, BUCKET } from '../minio.js';
import { requireAuth } from '../session.js';
import { asyncHandler, isUuid } from '../utils.js';
import * as lib from '../pipeline/lib.js';
import { apiError } from '@avs/shared';

export const router = Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// CORE-FEATURES：每环节 zip 下载
//   GET /api/export/stage/:taskId/:stage
//     stage ∈ script（文案）| split（拆分结果）| images（图片）| audio（语音）
//            | clips（i2v 片段）
//   归属校验（tasks JOIN projects）+ 实时从 MinIO/DB 打包流式返回；
//   缺失产物记入 X-Missing-Files（不 5xx），全缺 → 404。
// ---------------------------------------------------------------------------

const STAGE_NAMES = ['script', 'split', 'images', 'audio', 'clips'] as const;
type StageName = (typeof STAGE_NAMES)[number];

const ASSET_TYPE_BY_STAGE: Record<Exclude<StageName, 'script' | 'split'>, string> = {
  images: 'shot',
  audio: 'audio',
  clips: 'clip',
};

router.get(
  '/stage/:taskId/:stage',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const taskId = String(req.params.taskId ?? '');
    const stage = String(req.params.stage ?? '');
    if (!isUuid(taskId)) throw apiError(422, 'VALIDATION_ERROR', 'taskId must be a valid UUID');
    if (!(STAGE_NAMES as readonly string[]).includes(stage)) {
      throw apiError(422, 'VALIDATION_ERROR', `stage must be one of: ${STAGE_NAMES.join(', ')}`);
    }

    const { rows } = await query(
      `SELECT t.config, p.user_id AS owner_id
         FROM tasks t JOIN projects p ON p.id = t.project_id
        WHERE t.id = $1`,
      [taskId],
    );
    const row = rows[0];
    if (!row) throw apiError(404, 'NOT_FOUND', 'task not found');
    if (row.owner_id !== uid) throw apiError(403, 'FORBIDDEN', 'task does not belong to this account');
    const config = (row.config ?? {}) as Record<string, unknown>;

    const files: Array<{ name: string; buffer: Buffer }> = [];
    const missing: string[] = [];
    const add = async (key: string | null, name: string) => {
      if (!key) {
        missing.push(name);
        return;
      }
      try {
        const buf = await lib.downloadFromMinio(minio, key);
        if (buf && buf.length > 0) files.push({ name, buffer: buf });
        else missing.push(name);
      } catch {
        missing.push(name);
      }
    };

    if (stage === 'script') {
      await add(`tasks/${taskId}/script.md`, 'script.md');
      const versions = Array.isArray(config.script_versions) ? config.script_versions : [];
      files.push({
        name: 'script_versions.json',
        buffer: Buffer.from(JSON.stringify(versions, null, 2), 'utf8'),
      });
      // 当前生效文案（L2 payload script）
      const cur = String((config as { current_script?: unknown }).current_script ?? '');
      if (cur) files.push({ name: 'script.txt', buffer: Buffer.from(cur, 'utf8') });
    } else if (stage === 'split') {
      await add(`tasks/${taskId}/storyboard.json`, 'storyboard.json');
      try {
        const buf = await lib.downloadFromMinio(minio, `tasks/${taskId}/storyboard.json`);
        const sb = JSON.parse(buf.toString('utf8')) as { shots?: Array<Record<string, unknown>> };
        const lines = (Array.isArray(sb.shots) ? sb.shots : []).map((s, i) => {
          const n = Number(s.index) || i + 1;
          return [
            `## 镜头 ${n}${s.title ? ` · ${s.title}` : ''}`,
            '',
            `- script: ${String(s.script ?? '')}`,
            `- voiceover: ${String(s.voiceover ?? '')}`,
            `- subtitle: ${String(s.subtitle ?? '')}`,
            `- prompt: ${String(s.prompt ?? '')}`,
          ].join('\n');
        });
        files.push({ name: 'shots.md', buffer: Buffer.from(lines.join('\n\n'), 'utf8') });
      } catch {
        /* storyboard.json 缺失已在 add 记 missing */
      }
    } else {
      const assetType = ASSET_TYPE_BY_STAGE[stage as Exclude<StageName, 'script' | 'split'>];
      const { rows: assetRows } = await query(
        `SELECT minio_key FROM assets WHERE task_id = $1 AND type = $2 ORDER BY minio_key`,
        [taskId, assetType],
      );
      for (const a of assetRows) {
        const key = String(a.minio_key);
        await add(key, String(key.split('/').pop() || key));
      }
    }

    if (files.length === 0) {
      throw apiError(404, 'NOT_FOUND', `no ${stage} artifacts for this task`, { missing });
    }

    const filename = `${taskId.slice(0, 8)}-${stage}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (missing.length > 0) res.setHeader('X-Missing-Files', missing.join(','));
    const zip = archiver('zip', { zlib: { level: 6 } });
    zip.pipe(res);
    for (const f of files) zip.append(f.buffer, { name: f.name });
    await zip.finalize();
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');

    const { rows } = await query(
      `SELECT e.id, e.task_id, e.minio_key, e.zip_hash, e.expires_at,
              p.user_id AS owner_id
         FROM exports e
         JOIN tasks t ON t.id = e.task_id
         JOIN projects p ON p.id = t.project_id
        WHERE e.id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) throw apiError(404, 'NOT_FOUND', 'export not found');
    if (row.owner_id !== uid) throw apiError(403, 'FORBIDDEN', 'export does not belong to this account');

    const expiresAt = new Date(row.expires_at);
    if (expiresAt.getTime() <= Date.now()) {
      throw apiError(410, 'EXPORT_EXPIRED', '导出文件已过期（保留 30 天），请在任务详情页重新导出', {
        expired_at: expiresAt.toISOString(),
      });
    }

    const filename = basename(String(row.minio_key));
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Export-Expires-At', expiresAt.toISOString());
    res.setHeader('X-Checksum-SHA256', String(row.zip_hash));

    try {
      const stream = await minio.getObject(BUCKET, row.minio_key);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (err) {
      console.error(`[export] stream failed for ${row.minio_key}:`, (err as Error).message);
      if (!res.headersSent) {
        throw apiError(404, 'NOT_FOUND', 'export object missing on storage');
      }
      res.destroy();
    }
  }),
);
