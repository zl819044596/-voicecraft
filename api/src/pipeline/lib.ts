/**
 * 步骤 runner + 队列引擎共享工具（Phase 4，TS 移植 v2 steps/lib.js）。
 *
 * MinIO 布局（PRD §4.2/§4.3 / 04 §4）：
 *   tasks/<taskId>/shots/shot-0N.png
 *   tasks/<taskId>/clips/clip-0N.mp4
 *   tasks/<taskId>/audio/vo-0N.<mp3|wav>
 *   tasks/<taskId>/subtitles.srt   final.mp4
 *   tasks/<taskId>/storyboard.json  script.md
 *   tasks/<taskId>/export/project-export-YYYYMMDD.zip
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { DB } from './types.js';
import { minio, BUCKET } from '../minio.js';

export { BUCKET };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function sha256hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ---------------------------------------------------------------------------
// MinIO helpers
// ---------------------------------------------------------------------------

export async function uploadToMinio(
  client: typeof minio,
  key: string,
  buffer: Buffer,
  contentType?: string,
): Promise<string> {
  await client.putObject(BUCKET, key, buffer, buffer.length, {
    'Content-Type': contentType || 'application/octet-stream',
  });
  return key;
}

export async function downloadFromMinio(client: typeof minio, key: string): Promise<Buffer> {
  const stream = await client.getObject(BUCKET, key);
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export async function listMinioPrefix(client: typeof minio, prefix: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const names: string[] = [];
    const stream = client.listObjectsV2(BUCKET, prefix, true);
    stream.on('data', (obj) => {
      if (obj.name) names.push(obj.name);
    });
    stream.on('end', () => resolve(names.sort()));
    stream.on('error', reject);
  });
}

export async function objectExists(client: typeof minio, key: string): Promise<boolean> {
  try {
    await client.statObject(BUCKET, key);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// step_results helpers（UPSERT on (task_id, step)，幂等）
// ---------------------------------------------------------------------------

interface StepStatusFields {
  status?: string;
  payload?: unknown;
  error?: string | null;
  started_at?: Date | null;
  finished_at?: Date | null;
}

export async function upsertStepStatus(
  pg: DB,
  taskId: string,
  step: number,
  fields: StepStatusFields,
): Promise<void> {
  const cols = ['task_id', 'step'];
  const vals: unknown[] = [taskId, step];
  const updates: string[] = [];
  const settable: (keyof StepStatusFields)[] = ['status', 'payload', 'error', 'started_at', 'finished_at'];
  let i = 3;
  for (const k of settable) {
    if (fields[k] === undefined) continue;
    cols.push(k);
    vals.push(fields[k]);
    updates.push(`${k} = $${i}`);
    i += 1;
  }
  await pg.query(
    `INSERT INTO step_results (${cols.join(', ')})
     VALUES (${cols.map((_, n) => `$${n + 1}`).join(', ')})
     ON CONFLICT (task_id, step) DO UPDATE SET ${updates.join(', ')}`,
    vals,
  );
}

export async function markStepRunning(pg: DB, taskId: string, step: number): Promise<void> {
  await upsertStepStatus(pg, taskId, step, { status: 'running', started_at: new Date(), finished_at: null, error: null });
}

export async function markStepDone(pg: DB, taskId: string, step: number, payload: unknown): Promise<void> {
  await upsertStepStatus(pg, taskId, step, { status: 'done', payload, finished_at: new Date(), error: null });
}

export async function markStepFailed(pg: DB, taskId: string, step: number, error: unknown): Promise<void> {
  await upsertStepStatus(pg, taskId, step, {
    status: 'failed',
    error: String(error || 'unknown error').slice(0, 2000),
    finished_at: new Date(),
  });
}

export async function markStepSkipped(pg: DB, taskId: string, step: number): Promise<void> {
  await upsertStepStatus(pg, taskId, step, { status: 'skipped', finished_at: new Date(), error: null });
}

/** 已 done 步骤的 payload map（step → payload）。 */
export async function getPrevPayloads(pg: DB, taskId: string): Promise<Record<number, Record<string, unknown>>> {
  const { rows } = await pg.query(
    `SELECT step, payload FROM step_results WHERE task_id = $1 AND status = 'done' ORDER BY step`,
    [taskId],
  );
  const map: Record<number, Record<string, unknown>> = {};
  for (const row of rows) map[row.step] = row.payload;
  return map;
}

// ---------------------------------------------------------------------------
// assets 写入（每个 (task, minio_key) 一行；重跑重建同 key 时先删后插）
// ---------------------------------------------------------------------------

export async function insertAsset(
  pg: DB,
  taskId: string,
  type: 'shot' | 'clip' | 'audio' | 'srt' | 'mp4' | 'zip',
  minioKey: string,
  size: number | null,
): Promise<void> {
  await pg.query(`DELETE FROM assets WHERE task_id = $1 AND minio_key = $2`, [taskId, minioKey]);
  await pg.query(`INSERT INTO assets (task_id, type, minio_key, size) VALUES ($1, $2, $3, $4)`, [
    taskId,
    type,
    minioKey,
    size ?? null,
  ]);
}

// ---------------------------------------------------------------------------
// Storyboard helpers（storyboard.json 为分镜唯一事实来源）
// ---------------------------------------------------------------------------

export const SHOT_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4'];

export interface ShotCandidate {
  key: string;
  is_default?: boolean;
}

export interface NormalizedShot {
  index: number;
  duration: number;
  scene: string;
  script: string;
  voiceover: string;
  subtitle: string;
  prompt: string;
  title: string;
  aspect: string;
  motion: string;
  ref_key: string | null;
  candidates: ShotCandidate[];
  clip_candidates: ShotCandidate[];
}

export function normalizeShot(raw: Record<string, unknown>, index: number, fallbackAspect: string): NormalizedShot {
  const idx = Number(raw.index) || index;
  return {
    index: idx,
    duration: Math.max(1, Number(raw.duration) || 5),
    scene: String(raw.scene || ''),
    script: String(raw.script || raw.title || ''),
    voiceover: String(raw.voiceover || raw.script || ''),
    subtitle: String(raw.subtitle || raw.script || ''),
    prompt: String(raw.prompt || ''),
    title: String(raw.title || '').trim() || `镜头 ${idx}`,
    aspect: String(raw.aspect || fallbackAspect || '16:9'),
    motion: String(raw.motion || '').trim(),
    ref_key: String(raw.ref_key || '') || null,
    candidates: Array.isArray(raw.candidates)
      ? (raw.candidates as ShotCandidate[]).filter((c) => c && typeof c.key === 'string')
      : [],
    clip_candidates: Array.isArray(raw.clip_candidates)
      ? (raw.clip_candidates as ShotCandidate[]).filter((c) => c && typeof c.key === 'string')
      : [],
  };
}

export function canonicalKeys(taskId: string, index: number): { image: string; clip: string; audio: string | null } {
  const p = String(index).padStart(2, '0');
  return {
    image: `tasks/${taskId}/shots/shot-${p}.png`,
    clip: `tasks/${taskId}/clips/clip-${p}.mp4`,
    audio: null,
  };
}

export async function dropMinioPrefix(client: typeof minio, keyPrefix: string): Promise<void> {
  if (!client) return;
  try {
    const names = await listMinioPrefix(client, keyPrefix);
    for (const k of names) {
      try {
        await client.removeObject(BUCKET, k);
      } catch (e) {
        console.warn(`[lib] dropMinioPrefix: failed to remove ${k}: ${(e as Error).message}`);
      }
    }
  } catch {
    /* best-effort */
  }
}

export async function dropMinioObject(client: typeof minio, key: string): Promise<void> {
  if (!client || !key) return;
  try {
    await client.removeObject(BUCKET, key);
  } catch (e) {
    console.warn(`[lib] dropMinioObject: failed to remove ${key}: ${(e as Error).message}`);
  }
}

export async function readStoryboard(
  client: typeof minio,
  taskId: string,
  fallbackAspect: string,
): Promise<{ shots: NormalizedShot[]; generated_at?: string } | null> {
  if (!client) return null;
  try {
    const buf = await downloadFromMinio(client, `tasks/${taskId}/storyboard.json`);
    const parsed = JSON.parse(buf.toString('utf8')) as { shots?: unknown[]; generated_at?: string };
    const shots = Array.isArray(parsed?.shots) ? parsed.shots : [];
    return {
      shots: shots.map((s, i) => normalizeShot(s as Record<string, unknown>, i + 1, fallbackAspect)),
      generated_at: parsed?.generated_at,
    };
  } catch {
    return null;
  }
}

export async function writeStoryboard(client: typeof minio, taskId: string, storyboard: unknown): Promise<boolean> {
  if (!client) return false;
  try {
    await uploadToMinio(
      client,
      `tasks/${taskId}/storyboard.json`,
      Buffer.from(JSON.stringify(storyboard, null, 2), 'utf8'),
      'application/json',
    );
    return true;
  } catch (err) {
    console.warn(`[lib] writeStoryboard failed for ${taskId}: ${(err as Error).message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// 图片中心裁剪（P5-D2）：real provider 输出与目标比例不符 → 居中裁剪。
// ---------------------------------------------------------------------------

const FFMPEG_BIN = process.env.FFMPEG_BINARY || '/usr/bin/ffmpeg';

function runProcess(cmd: string, args: string[], timeout = 60000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (err as { code?: number }).code ?? 1 : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function imageDims(buf: Buffer): { width: number; height: number } | null {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off += 1;
        continue;
      }
      const marker = buf[off + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
        off += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return null;
      const len = buf.readUInt16BE(off + 2);
      const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (sof) return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      off += 2 + len;
    }
    return null;
  }
  return null;
}

export async function cropImageToAspect(buf: Buffer, aspect: string): Promise<Buffer> {
  if (!buf || !aspect) return buf;
  const m = /^(\d+)\s*[:xX]\s*(\d+)$/.exec(String(aspect).trim());
  if (!m) return buf;
  const target = Number(m[1]) / Number(m[2]);
  const dims = imageDims(buf);
  if (!dims) return buf;
  const actual = dims.width / dims.height;
  if (Math.abs(actual - target) <= 0.02) return buf;

  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg' : 'png';
  const inPath = path.join(os.tmpdir(), `avs-crop-${tag}-in.${ext}`);
  const outPath = path.join(os.tmpdir(), `avs-crop-${tag}.png`);
  try {
    fs.writeFileSync(inPath, buf);
    let w: number;
    let h: number;
    if (actual > target) {
      w = Math.round(dims.height * target);
      h = dims.height;
    } else {
      w = dims.width;
      h = Math.round(dims.width / target);
    }
    const x = Math.max(0, Math.floor((dims.width - w) / 2));
    const y = Math.max(0, Math.floor((dims.height - h) / 2));
    const r = await runProcess(
      FFMPEG_BIN,
      ['-y', '-i', inPath, '-vf', `crop=${w}:${h}:${x}:${y}`, '-frames:v', '1', '-update', '1', outPath],
      60000,
    );
    if (r.code !== 0) {
      console.warn(`[lib] cropImageToAspect: ffmpeg failed: ${r.stderr.slice(0, 300)}`);
      return buf;
    }
    const cropped = fs.readFileSync(outPath);
    console.log(`[lib] cropImageToAspect: ${dims.width}x${dims.height} → ${w}x${h} (${aspect})`);
    return cropped;
  } catch (err) {
    console.warn(`[lib] cropImageToAspect: ${(err as Error).message}`);
    return buf;
  } finally {
    for (const p of [inPath, outPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* best-effort */
      }
    }
  }
}

export { minio as minioClient };
