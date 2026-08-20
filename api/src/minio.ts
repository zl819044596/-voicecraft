/**
 * MinIO (S3-compatible) singleton. Bucket `avs-assets`.
 * Layout (04-数据库文档 §4):
 *   tasks/<taskId>/{shots,clips,audio}/…   subtitles.srt  final.mp4
 *   storyboard.json  script.md
 *   export/project-export-YYYYMMDD-<taskId>.zip
 *   users/<uid>/bgm/<uuid>.<ext>          users/<uid>/media/<uuid>.<ext>
 */

import { Client as MinioClient } from 'minio';
import { config } from './config.js';

export const BUCKET = config.minio.bucket;

export const minio = new MinioClient({
  endPoint: config.minio.endpoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

export async function ensureBucket(): Promise<void> {
  const exists = await minio.bucketExists(BUCKET);
  if (!exists) {
    await minio.makeBucket(BUCKET);
  }
}

export async function pingMinio(): Promise<boolean> {
  try {
    await ensureBucket();
    return true;
  } catch {
    return false;
  }
}

export function taskPrefix(taskId: string): string {
  return `tasks/${taskId}`;
}

export function shotKey(taskId: string, index: number): string {
  return `tasks/${taskId}/shots/shot-${String(index).padStart(2, '0')}.png`;
}

export function clipKey(taskId: string, index: number): string {
  return `tasks/${taskId}/clips/clip-${String(index).padStart(2, '0')}.mp4`;
}

export function audioKey(taskId: string, index: number): string {
  return `tasks/${taskId}/audio/voice-${String(index).padStart(2, '0')}.mp3`;
}

export function srtKey(taskId: string): string {
  return `tasks/${taskId}/subtitles.srt`;
}

export function finalMp4Key(taskId: string): string {
  return `tasks/${taskId}/final.mp4`;
}

export function scriptMdKey(taskId: string): string {
  return `tasks/${taskId}/script.md`;
}

export function storyboardJsonKey(taskId: string): string {
  return `tasks/${taskId}/storyboard.json`;
}

export function exportZipKey(taskId: string): string {
  return `tasks/${taskId}/export/project-export-${new Date().toISOString().slice(0, 10)}-${taskId}.zip`;
}

export function bgmKey(userId: string, filename: string): string {
  return `users/${userId}/bgm/${filename}`;
}

export function mediaKey(userId: string, filename: string): string {
  return `users/${userId}/media/${filename}`;
}
