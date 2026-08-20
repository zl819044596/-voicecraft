/**
 * L6 配音 TTS（逐镜）（Phase 4，TS 移植 v2 steps/l6.js）。
 *
 * 输入：storyboard.json（voiceover）+ config.tts.{voice,speed,volume}
 * 输出：payload { kind:'voice', shots:[{index,key,duration}], warnings }
 * 产物：MinIO tasks/<id>/audio/vo-0N.mp3 → assets(type='audio')。
 * 策略：单镜 callTTS 失败 → 重试 1 次 → 仍失败用 mockWavBuffer 兜底写该镜
 *       （warnings 记录），不中断整步；duration 用 ffprobe 实测。
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import * as lib from '../lib.js';
import { resolveProviderFor, callTTS, poolFrom, makeReporter } from '../providers.js';
import { mockWavBuffer } from '../../providers/runtime.js';
import type { StepRunnerInput } from '../queues.js';

function probeDuration(filePath: string): number | null {
  try {
    const r = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { timeout: 10000 },
    );
    const s = String(r.stdout || '').trim();
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  } catch {
    return null;
  }
}

export const l6 = {
  async run(ctx: StepRunnerInput) {
    const { pg, redis, minio, task } = ctx;
    const config = task.config || {};
    const aspect = String((config.synthesis as Record<string, unknown>)?.aspect || '16:9');
    const ttsCfg = (config.tts || {}) as Record<string, unknown>;

    const storyboard = await lib.readStoryboard(minio, task.id, aspect);
    if (!storyboard || storyboard.shots.length === 0) {
      throw new Error('storyboard 缺失或为空（L6 前置依赖不满足）');
    }

    const pool = poolFrom(pg, redis);
    const provider = await resolveProviderFor(pg, pool, task, 'tts');
    const report = makeReporter(pool, provider);
    const voice = provider?.voice || String(ttsCfg.voice || 'longjiqi');
    const speed = Number(ttsCfg.speed) || 1;
    const volume = Number(ttsCfg.volume) || 50;

    const shots: Array<{ index: number; key: string; duration: number | null }> = [];
    const warnings: Array<{ index: number; status: string; reason: string }> = [];

    for (const shot of storyboard.shots) {
      const index = Number(shot.index);
      const text = String(shot.voiceover || shot.script || '');
      const key = `tasks/${task.id}/audio/vo-${String(index).padStart(2, '0')}.mp3`;
      const entry = { index, key, duration: null as number | null };

      let buf: Buffer | null = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const b = await callTTS({ pg, task, provider, voice, text, speed, volume, report });
          if (!b || b.length === 0) throw new Error('TTS 返回空音频');
          buf = b;
          break;
        } catch (err) {
          if (attempt === 2) {
            console.warn(`[l6] shot ${index} TTS failed after retry — mock fallback: ${(err as Error).message}`);
            buf = mockWavBuffer(text, volume);
            warnings.push({ index, status: 'fallback', reason: String((err as Error).message || '').slice(0, 300) });
          } else {
            await lib.sleep(500);
          }
        }
      }

      const tmp = `/tmp/avs-vo-${task.id}-${index}.wav`;
      try {
        writeFileSync(tmp, buf!);
        entry.duration = probeDuration(tmp) ?? null;
        try {
          unlinkSync(tmp);
        } catch {
          /* ignore */
        }
      } catch {
        entry.duration = null;
      }

      await lib.uploadToMinio(minio, key, buf!, 'audio/mpeg');
      await lib.insertAsset(pg, task.id, 'audio', key, buf!.length);
      shots.push(entry);
    }

    return { payload: { kind: 'voice', shots, warnings } };
  },
};
