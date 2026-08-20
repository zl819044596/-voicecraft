/**
 * 渲染下发（api → avs:render）与回执落库（avs:render:done）（Phase 4，TS 移植 v2 render.js）。
 *
 * 协议（render/worker/index.js，02-架构 §5）：
 *   job   : { taskId, type: 'srt'|'compose'|'compose-i2v', subtitleText?,
 *             subtitle: {enabled, font_size, position, max_chars_per_line},
 *             bgmKey?, warnings? }
 *   srt 回执:  { ok:true, srtKey:'tasks/<id>/subtitles.srt', segments:[{index,duration}] }
 *   compose  : { ok:true, mp4Key:'tasks/<id>/final.mp4', size, duration, bgm:'mixed'|'none' }
 *   compose-i2v: 同 compose + mode:'i2v', fallbackShots, warnings
 *   幂等重投:  { ok:true, mp4Key, size, duration:null, note:'idempotent' }
 *   失败:      { ok:false, error }
 *
 * 类型 → 步骤：srt=7（L7 字幕），compose/compose-i2v=8（L8 合成）。
 * 幂等 U11：重投回执不重复落库/计费——处理前查 step done + 产物 key 已存在即跳过。
 */

import type { PipelineCtx, TaskRow } from './types.js';
import type { Redis } from 'ioredis';
import * as state from './state.js';
import * as lib from './lib.js';

export function renderStepOf(type: string): number {
  return type === 'srt' ? 7 : 8;
}

// 下发渲染 job 到 avs:render（幂等由 worker 侧 final.mp4 已存在判定）。
export function enqueueRender(redis: Redis, job: Record<string, unknown>): Promise<number> {
  return redis.rpush('avs:render', JSON.stringify(job));
}

// 组装 L7 字幕 job 的 subtitle 字段（config.subtitle + config.synthesis）。
export function subtitleJobField(task: TaskRow): Record<string, unknown> {
  const synth = (task.config?.synthesis || {}) as Record<string, unknown>;
  const sub = (task.config?.subtitle || {}) as Record<string, unknown>;
  return {
    enabled: synth.subtitle_burn !== false,
    font_size: sub.font_size,
    position: sub.position,
    max_chars_per_line: sub.chars_per_line,
  };
}

export interface RenderResult {
  taskId?: string;
  type?: string;
  ok?: boolean;
  error?: string;
  srtKey?: string;
  segments?: Array<{ index: number; duration: number }>;
  mp4Key?: string;
  size?: number | null;
  duration?: number | null;
  bgm?: string;
  mode?: string;
  fallbackShots?: unknown;
  warnings?: unknown;
}

export async function handleRenderResult(ctx: PipelineCtx, result: RenderResult): Promise<void> {
  const { pg, redis } = ctx;
  const { taskId, type, ok } = result || {};
  if (!taskId || !type) return;
  const step = renderStepOf(type);

  // 失败：任务 fail（markStepFailed(step) + tasks.status='failed'）
  if (!ok) {
    const task = await state.loadTaskForStep(pg, taskId);
    if (!task) return;
    console.error(`[pipeline] render ${type} failed for task ${taskId}:`, result.error);
    await state.failTask(pg, taskId, step, result.error || `render ${type} failed`);
    return;
  }

  // 幂等 U11：步骤已 done 且产物 key 已在 → 重投回执直接跳过
  const existing = await state.stepResult(pg, taskId, step);
  if (existing && existing.status === 'done') {
    const key = step === 7 ? existing.payload?.srt_key : existing.payload?.mp4_key;
    if (key) {
      console.log(`[pipeline] render result idempotent skip (${type} ${taskId} step ${step})`);
      return;
    }
  }

  // 任务可能已终态（cancelled）→ 丢弃
  const task = await state.loadTaskForStep(pg, taskId);
  if (!task) return;
  if (task.status === 'cancelled' || task.status === 'failed' || task.status === 'done') {
    console.warn(`[pipeline] render result for ${taskId} dropped (task ${task.status})`);
    return;
  }

  if (step === 7) {
    if (!result.srtKey) throw new Error('render srt 结果缺少 srt_key');
    await lib.insertAsset(pg, taskId, 'srt', result.srtKey, null);
    await state.finalizeStep(ctx, task, 7, {
      kind: 'subtitle',
      srt_key: result.srtKey,
      segments: Array.isArray(result.segments) ? result.segments : [],
      cues: null,
    });
    return;
  }

  // step 8：compose / compose-i2v
  const payload: Record<string, unknown> = {
    kind: type === 'compose-i2v' ? 'compose_i2v' : 'compose',
    mp4_key: result.mp4Key,
    size: result.size ?? null,
    duration: result.duration ?? null,
    bgm: result.bgm || 'none',
  };
  if (result.mode) payload.mode = result.mode;
  if (result.fallbackShots) payload.fallback_shots = result.fallbackShots;
  if (result.warnings) payload.warnings = result.warnings;
  if (!result.mp4Key) throw new Error('render compose 结果缺少 mp4_key');
  await lib.insertAsset(pg, taskId, 'mp4', result.mp4Key, result.size ?? null);
  await state.finalizeStep(ctx, task, 8, payload);
}

// 回执消费循环。
export async function startRenderResultLoop(ctx: PipelineCtx): Promise<never> {
  const { redis } = ctx;
  const sub = redis.duplicate();
  sub.on('error', () => {
    /* duplicate 必须挂 error 监听，否则连接失败触发未捕获 'error' 事件 */
  });
  console.log('[pipeline] render-result worker started (avs:render:done)');
  for (;;) {
    try {
      const res = await sub.blpop('avs:render:done', 10);
      if (!res) continue;
      let result: RenderResult;
      try {
        result = JSON.parse(res[1]) as RenderResult;
      } catch {
        console.warn('[pipeline] render-result loop: bad payload, dropped:', res[1]);
        continue;
      }
      await handleRenderResult(ctx, result);
    } catch (err) {
      console.error('[pipeline] render-result loop error:', (err as Error).message);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
