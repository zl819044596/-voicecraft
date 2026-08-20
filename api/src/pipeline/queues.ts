/**
 * 步骤队列消费 + 步骤调度（Phase 4，TS 移植 v2 pipeline/queues.js）。
 *
 * 队列：
 *   avs:steps:p0 — Pro 托管（高优）
 *   avs:steps:p1 — Starter/按次 托管
 *   avs:steps:p2 — BYOK
 *   avs:steps:delayed — ZSET 延迟队列（rerun 清洗后延时入队）
 * 消费：优先级轮询 blpop（p0→p1→p2），幂等守卫见 runStep。
 */

import type { DB, PipelineCtx, StepJob, StepRunResult, TaskRow } from './types.js';
import type { Client as MinioClient } from 'minio';
import type { Redis } from 'ioredis';
import * as state from './state.js';
import * as lib from './lib.js';
import { l1 } from './steps/l1.js';
import { l15 } from './steps/l15.js';
import { l2 } from './steps/l2.js';
import { l3 } from './steps/l3.js';
import { l4 } from './steps/l4.js';
import { l5 } from './steps/l5.js';
import { l6 } from './steps/l6.js';
import { l7 } from './steps/l7.js';
import { l8 } from './steps/l8.js';
import { l9 } from './steps/l9.js';
import { l10 } from './steps/l10.js';

export interface StepRunnerInput {
  pg: DB;
  redis: Redis;
  minio: MinioClient;
  task: TaskRow;
  prev: Record<number, Record<string, unknown>>;
  reason?: string;
}

export interface StepRunner {
  run(input: StepRunnerInput): Promise<StepRunResult>;
}

const RUNNERS: Record<number, StepRunner> = {
  1: l1,
  15: l15,
  2: l2,
  3: l3,
  4: l4,
  5: l5,
  6: l6,
  7: l7,
  8: l8,
  9: l9,
  10: l10,
};

const PRIORITY_KEYS = ['avs:steps:p0', 'avs:steps:p1', 'avs:steps:p2'];

// 并发 worker 数（env STEP_WORKER_CONCURRENCY 可调，clamp 1..8）。慢步骤只占自己槽位，
// 其余消费者继续抢队列里的其它任务，避免单 worker 串行卡死。
// （PIPELINE_TASK_41：L5 i2v 已下线恒 skip，慢步骤只剩 TTS 每镜轮询。）
const STEP_WORKER_CONCURRENCY = Math.min(8, Math.max(1, Number(process.env.STEP_WORKER_CONCURRENCY || 3)));

// 延迟入队（毫秒级）：zadd avs:steps:delayed，到期由 startDelayedLoop 转投优先级队列。
export async function enqueueDelayed(redis: Redis, job: Record<string, unknown>, delayMs?: number): Promise<void> {
  await redis.zadd('avs:steps:delayed', Date.now() + (delayMs || 0), JSON.stringify(job));
}

// 单步调度（job = { taskId, step, reason?, force? }）。幂等与守卫：
//   1. 任务不存在 / 终态（done|failed|cancelled）→ 丢弃
//   2. 任务暂停中 → 丢弃（continue 才会重新入队）
//   3. 步骤已有结果行且非 force → 丢弃；例外：compliance job 且 step1 行
//      是 L1 的 topic（kind!=='compliance_precheck'）→ 照跑 l15（UPSERT 覆盖）
export async function runStep(ctx: PipelineCtx, job: StepJob): Promise<void> {
  const { pg } = ctx;
  const task = await state.loadTaskForStep(pg, job.taskId);
  if (!task) {
    console.warn(`[pipeline] runStep: task ${job.taskId} not found — drop job`, job);
    return;
  }
  if (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') {
    console.warn(`[pipeline] runStep: task ${task.id} is ${task.status} — drop job`, job);
    return;
  }
  if (state.isPaused(task)) {
    console.warn(`[pipeline] runStep: task ${task.id} paused — drop stray job`, job);
    return;
  }

  const step = Number(job.step);
  const isCompliance = job.reason === 'compliance';
  // 注入逻辑步号供 cost 流水（api_cost_log.step）与 runners 使用
  task.step = step;
  const runner = isCompliance ? RUNNERS[15] : RUNNERS[step];
  if (!runner) {
    console.warn(`[pipeline] runStep: no runner for step ${step} (reason=${job.reason}) — drop`);
    return;
  }

  // 幂等：步骤已落结果行且非 force → 丢弃（compliance 特例见上）
  if (!job.force) {
    const existing = await state.stepResult(pg, task.id, step);
    if (existing) {
      const isL1WithoutCompliance = isCompliance && existing.payload?.kind !== 'compliance_precheck';
      if (!isL1WithoutCompliance) {
        console.warn(`[pipeline] runStep: step ${step} already ${existing.status} — drop`, job);
        return;
      }
    }
  }

  await lib.markStepRunning(pg, task.id, step);
  await state.markTaskRunning(pg, task.id);

  // step 级 watchdog：runner.run 内任一 fetch/TLS 挂死（wingray 网络劣化常见）都会导致
  // worker 无限挂起、任务永久 running。超时 → 抛错 → failTask，避免卡死。
  const STEP_TIMEOUT_MS = 45 * 60 * 1000; // 45 分钟（TTS 长文本 + 生图多镜轮询留足余量）
  let watchdog: NodeJS.Timeout | undefined;
  try {
    const prev = await lib.getPrevPayloads(pg, task.id);
    const result = await Promise.race([
      runner.run({
        pg,
        redis: ctx.redis,
        minio: ctx.minio,
        task,
        prev,
        reason: isCompliance ? 'compliance' : undefined,
      }),
      new Promise<never>((_, rej) => {
        watchdog = setTimeout(
          () => rej(new Error(`step ${step} watchdog timeout (>${STEP_TIMEOUT_MS / 60000}min)`)),
          STEP_TIMEOUT_MS,
        );
      }),
    ]);
    if (watchdog) clearTimeout(watchdog);
    if (result.waitingForRender) return; // L7/L8：等 render worker 回执，finalize 由回执侧完成
    if (result.skipped) {
      await state.finalizeStep(ctx, task, step, undefined, { skipped: true });
      return;
    }
    await state.finalizeStep(ctx, task, step, result.payload || {}, {
      compliance: isCompliance,
    });
  } catch (err) {
    if (watchdog) clearTimeout(watchdog);
    console.error(`[pipeline] runStep step ${step} failed for task ${task.id}:`, err);
    await state.failTask(pg, task.id, step, err && (err as Error).message ? (err as Error).message : String(err));
  }
}

// ---------------------------------------------------------------------------
// 启动自愈：api 重启会杀掉内存中的执行进程 → 已 blpop 弹出但未 finalize 的 running
// 任务成为孤儿。启动时扫一遍，重置为 queued 并按其 current_step force 重新入队
// （step_results 已有 running 行，幂等守卫会丢弃非 force job → 必须 force:true）。
// 对标 ArcReel requeue_running() / list_orphan_tasks_on_start()（ADR 0007 自愈）。
// ---------------------------------------------------------------------------

// 自愈辅助：查任务 track/tier 算优先级，force 入队当前步（查询失败默认 p1）。
async function enqueueStepForTask(ctx: PipelineCtx, taskId: string, step: number): Promise<void> {
  const { pg, redis } = ctx;
  let priority: string = 'p1';
  try {
    const { rows } = await pg.query(
      `SELECT t.track, u.tier
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         JOIN users u   ON u.id = p.user_id
        WHERE t.id = $1`,
      [taskId],
    );
    const row = rows[0];
    if (row && row.track !== 'managed') priority = 'p2';
    else if (row && row.tier === 'pro') priority = 'p0';
  } catch (err) {
    console.warn(`[pipeline] self-heal: priority lookup failed for ${taskId}, default p1:`, (err as Error).message);
  }
  state.enqueueStep(redis, { taskId, step, priority, force: true });
}

export async function requeueOrphanTasks(ctx: PipelineCtx): Promise<number> {
  const { pg } = ctx;
  // 找 running 任务（跳过 L7/L8 已 done 的——render 回执可能在途）
  const { rows } = await pg.query(
    `SELECT t.id, t.current_step,
            (SELECT status FROM step_results sr WHERE sr.task_id = t.id AND sr.step = t.current_step) AS step_status
       FROM tasks t
      WHERE t.status = 'running'`,
  );
  let recovered = 0;
  for (const r of rows) {
    const step = Number(r.current_step) || 1;
    // 边界：L7/L8 等待 render 回执中，本步已 done → 不重跑，交给 render-result worker
    if ((step === 7 || step === 8) && r.step_status === 'done') continue;
    await pg.query(
      `UPDATE tasks SET status='queued', config = jsonb_set(config, '{paused}', 'false')
        WHERE id = $1 AND status = 'running'`, // status 守卫：防与 index.ts orphan sweep(→failed) 竞态复活
      [r.id],
    );
    await enqueueStepForTask(ctx, r.id, step); // force:true
    recovered += 1;
  }
  if (recovered > 0) console.log(`[pipeline] self-heal: recovered ${recovered} running task(s)`);
  return recovered;
}

// 主循环：N 个并发消费者各自 blpop 三个优先级队列（ioredis 数组形式 → [key, value]）。
// 同一任务的步骤天然串行（finalizeStep 后才入队下一步；runStep 幂等守卫 +
// markStepRunning 防重入），无需额外锁；单消费者错误 1s 退避，互不影响。
export async function startStepLoop(ctx: PipelineCtx): Promise<never> {
  const { redis } = ctx;
  // 启动自愈：先回收 running 任务（只执行一次，在并发消费者启动前）
  try {
    await requeueOrphanTasks(ctx);
  } catch (err) {
    console.error('[pipeline] self-heal error:', (err as Error).message);
  }
  const consumers = Array.from({ length: STEP_WORKER_CONCURRENCY }, async (_, i) => {
    const sub = redis.duplicate();
    sub.on('error', () => {
      /* duplicate 必须挂 error 监听，否则连接失败触发未捕获 'error' 事件 */
    });
    console.log(`[pipeline] step worker #${i + 1} started (avs:steps:p0/p1/p2)`);
    for (;;) {
      try {
        const res = await sub.blpop(PRIORITY_KEYS, 10);
        if (!res) continue;
        const raw = res[1];
        let job: StepJob;
        try {
          job = JSON.parse(raw) as StepJob;
        } catch {
          console.warn('[pipeline] step loop: bad job payload, dropped:', raw);
          continue;
        }
        await runStep(ctx, job);
      } catch (err) {
        console.error(`[pipeline] step worker #${i + 1} error:`, (err as Error).message);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  });
  await Promise.all(consumers);
  throw new Error('step loop exited'); // 不可达，占位
}

// 延迟队列搬运：每 5s 取到期 job，转投对应优先级队列。
export async function startDelayedLoop(ctx: PipelineCtx): Promise<never> {
  const { redis } = ctx;
  const key = 'avs:steps:delayed';
  console.log('[pipeline] delayed-queue worker started (avs:steps:delayed)');
  for (;;) {
    try {
      const now = Date.now();
      const due = await redis.zrangebyscore(key, 0, now);
      for (const raw of due) {
        let job: { priority?: string } | null = null;
        try {
          job = JSON.parse(raw) as { priority?: string };
        } catch {
          /* keep raw invalid — just zrem below */
        }
        await redis.zrem(key, raw);
        const priority = job && job.priority ? job.priority : 'p1';
        await redis.rpush(`avs:steps:${priority}`, raw);
      }
    } catch (err) {
      console.error('[pipeline] delayed loop error:', (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}
