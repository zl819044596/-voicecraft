/**
 * 流水线状态机 + 队列编排（Phase 4，TS 移植 v2 pipeline/state.js）。
 *
 * 职责：
 *   - 从 DB 装载任务运行上下文（loadTaskForStep：tasks JOIN projects JOIN users，
 *     带 owner_id / prompt / source_type / tier）
 *   - tasks 状态推进：queued → running → done/failed/cancelled
 *   - 暂停语义（semi / review_gate / compliance_review / initial）：不改 status
 *     （schema CHECK 仅 queued|running|done|failed|cancelled），用
 *     config.paused + config.pause_kind + config.pause_resume_step 表达
 *   - finalizeStep：单步收尾的单一出口（记结果 → 合规分流 → 托管 L1 补合规 →
 *     终态 → 复核门 → semi → 入队）
 *   - 优先级（p0 Pro 托管 / p1 Starter·按次托管 / p2 BYOK）与 stale 计算
 *
 * 注意：v2 projects.status CHECK 仅 ('active','archived')，任务状态不镜像到 projects。
 */

import type { DB, PipelineCtx, TaskRow, StepJob } from './types.js';
import { Redis } from 'ioredis';
import {
  markStepDone,
  markStepSkipped,
  markStepFailed,
} from './lib.js';
import { settleTask, refundForTask } from '../credits.js';

// 编辑 → 下游 stale 依赖图（reverse edges）：step 被编辑后，哪些下游步骤
// finished_at 晚于编辑时刻即为 stale（UI 徽章 + 单步重跑依据）。
export const STALE_DOWNSTREAM: Record<number, number[]> = {
  2: [3, 7],
  3: [4, 6],
  4: [5, 8],
  5: [8],
  6: [7, 8],
  7: [8],
  8: [9, 10],
};

// 装载任务 + 运行上下文。
export async function loadTaskForStep(pg: DB, taskId: string): Promise<TaskRow | null> {
  const { rows } = await pg.query(
    `SELECT t.*, p.user_id AS owner_id, p.prompt, p.source_type, u.tier
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN users u   ON u.id = p.user_id
      WHERE t.id = $1`,
    [taskId],
  );
  return (rows[0] as TaskRow) || null;
}

// 顶层浅合并 config。
export async function patchTaskConfig(pg: DB, taskId: string, patch: Record<string, unknown>): Promise<void> {
  await pg.query(
    `UPDATE tasks SET config = config || $2::jsonb, updated_at = now() WHERE id = $1`,
    [taskId, JSON.stringify(patch)],
  );
}

// 任务当前处于暂停态？config.paused === true。
export function isPaused(task: TaskRow): boolean {
  return task.config?.paused === true;
}

export async function markTaskRunning(pg: DB, taskId: string): Promise<void> {
  await pg.query(`UPDATE tasks SET status = 'running', updated_at = now() WHERE id = $1`, [taskId]);
}

// 步骤失败 → 整任务 failed（step_results 记 failed，tasks.status=failed）。
export async function failTask(pg: DB, taskId: string, step: number, error: unknown): Promise<void> {
  await markStepFailed(pg, taskId, step, error);
  await pg.query(`UPDATE tasks SET status = 'failed', updated_at = now() WHERE id = $1`, [taskId]);
  // 失败全额解冻（fire-and-forget；内部幂等，只处理托管档且有冻结）。
  refundForTask(taskId).catch(() => {});
}

// 暂停：写 config 三字段 + current_step=resumeStep（status 不动）。
export async function pauseTask(pg: DB, taskId: string, kind: string, resumeStep: number): Promise<void> {
  await pg.query(
    `UPDATE tasks
        SET config = jsonb_set(
              jsonb_set(
                jsonb_set(config, '{paused}', 'true'::jsonb),
                '{pause_kind}', $2::jsonb),
              '{pause_resume_step}', $3::jsonb),
            current_step = $3::int,
            updated_at = now()
      WHERE id = $1`,
    [taskId, JSON.stringify(kind), String(resumeStep)],
  );
}

// 继续：清三字段，返回 { step, kind }（kind 供路由区分 review_gate → 置 review_passed）。
export async function resumeTask(
  pg: DB,
  taskId: string,
): Promise<{ step: number; kind: string | null } | null> {
  const { rows } = await pg.query(
    `SELECT config->>'pause_kind' AS kind, (config->>'pause_resume_step')::int AS step
       FROM tasks WHERE id = $1`,
    [taskId],
  );
  const step = rows[0]?.step;
  if (!step) return null;
  await pg.query(
    `UPDATE tasks
        SET config = config - 'paused' - 'pause_kind' - 'pause_resume_step',
            updated_at = now()
      WHERE id = $1`,
    [taskId],
  );
  return { step, kind: rows[0]?.kind || null };
}

// 最大逻辑步编号：10（00-CONTRACT §3.1：L10 开放导出仍是最后一执行步）。
// PIPELINE_TASK_41：i2v 已下线，L5 恒 skip，任务只在 1,2,3,4,6,7,8,9,10 落行。
export const MAX_LOGIC_STEP = 10;

// 展示步总数：收敛为固定 6 节点（PIPELINE_TASK_41）。
// 不再区分 static/i2v——i2v 已下线。用于 progress 分母与 done 时 current_step 收口，
// 不是终态判断依据（终态仍看 next > MAX_LOGIC_STEP）。
export function totalStepsFor(_task: TaskRow): number {
  return 6;
}

// 下一步：L5 恒跳过（5→6，i2v 已下线），其余步进 1。
export function nextStepOf(step: number, _mode: string): number {
  if (step === 5) return 6;
  return step + 1;
}

// 内部逻辑步号 → 展示节点（1..6）：
//   ①文案=L1/L1.5/L2(1,2) · ②分镜拆解=L3(3) · ③逐镜生图=L4(4) ·
//   ④配音=L6(6) · ⑤字幕=L7(7) · ⑥合成导出=L8/L9/L10(8,9,10)
// 用于 progress 与 steps 展示聚合（前端 6 节点口径）。
export function displayNodeOf(step: number): number {
  const s = Number(step) || 1;
  if (s <= 2) return 1; // 1 / 15 / 2
  if (s === 3) return 2;
  if (s === 4) return 3;
  if (s === 6) return 4;
  if (s === 7) return 5;
  return 6; // 8 / 9 / 10（含历史遗留 5）
}

/** 前端 progress（0..1）：当前逻辑步所在展示节点 / 6。 */
export function progressOf(step: number): number {
  return Math.max(0, Math.min(1, displayNodeOf(step) / 6));
}

// 队列优先级：BYOK → p2；托管按 users.tier → pro p0 / 其它 p1。
// （tier 已由 loadTaskForStep JOIN 装载，无需二次查询。）
export async function priorityKey(pg: DB, task: TaskRow): Promise<'p0' | 'p1' | 'p2'> {
  if (String(task.track) !== 'managed') return 'p2';
  return task.tier === 'pro' ? 'p0' : 'p1';
}

export type PriorityKey = 'p0' | 'p1' | 'p2';

// 入队一个步骤 job（调用方负责算好 priority）。
export function enqueueStep(redis: Redis, job: StepJob): Promise<number> {
  const priority = job.priority || 'p1';
  const body: Record<string, unknown> = { taskId: job.taskId, step: job.step };
  if (job.reason) body.reason = job.reason;
  if (job.force) body.force = true;
  return redis.rpush(`avs:steps:${priority}`, JSON.stringify(body));
}

// 读取单步结果行（无 → null）。
export async function stepResult(
  pg: DB,
  taskId: string,
  step: number,
): Promise<{ status: string; payload: Record<string, unknown> | null; error: string | null } | null> {
  const { rows } = await pg.query(
    `SELECT status, payload, error FROM step_results WHERE task_id = $1 AND step = $2`,
    [taskId, step],
  );
  return rows[0] || null;
}

// 更新 current_step（存内部逻辑步号，供 requeueOrphanTasks 复位重入队；progress
// 由 GET 端按 displayNodeOf 现算，不直接依赖本列）。clamp 上限为 MAX_LOGIC_STEP
// 而非展示步数 6——重跑/自愈按逻辑步入队，收 6 会让 step8+ 的任务误复位到 step6。
export async function updateProgress(pg: DB, task: TaskRow, next: number): Promise<void> {
  const cur = Math.max(1, Math.min(next, MAX_LOGIC_STEP));
  await pg.query(`UPDATE tasks SET current_step = $2, updated_at = now() WHERE id = $1`, [task.id, cur]);
}

// 编辑 → stale 步骤集合（config.node_edits [{step, at}]）。
// 下游步骤在编辑时刻之前完成 → 用的是旧数据 → stale（"已编辑未重跑"徽章）；
// 编辑之后才完成（显式 rerun 重建过）→ 不 stale。
export async function computeStale(pg: DB, taskId: string): Promise<Set<number>> {
  const { rows } = await pg.query(`SELECT config FROM tasks WHERE id = $1`, [taskId]);
  const config = rows[0]?.config || {};
  const stale = new Set<number>();
  const edits = Array.isArray(config.node_edits) ? (config.node_edits as Array<{ step: number; at: string }>) : [];
  if (edits.length === 0) return stale;

  const done = await pg.query(
    `SELECT step, finished_at FROM step_results
      WHERE task_id = $1 AND status = 'done' AND finished_at IS NOT NULL`,
    [taskId],
  );
  const finishedAt: Record<number, number> = {};
  for (const r of done.rows) finishedAt[r.step] = new Date(r.finished_at).getTime();

  for (const e of edits) {
    const at = new Date(e.at).getTime();
    if (Number.isNaN(at)) continue;
    for (const s of STALE_DOWNSTREAM[e.step] || []) {
      if (finishedAt[s] && finishedAt[s] < at) stale.add(s);
    }
  }
  return stale;
}

// ---------------------------------------------------------------------------
// finalizeStep — 单步收尾单一出口
//
// ctx = { pg, redis, minio }；task 为 loadTaskForStep 的完整行。
// opts: { skipped, compliance }
//   compliance=true：payload.verdict 分流 reject→fail / review→pause / pass→继续
// 顺序：记结果 → 合规分流 → 托管 L1 补合规 → 终态 → 复核门 → semi → 入队
// ---------------------------------------------------------------------------
export interface FinalizeOpts {
  skipped?: boolean;
  compliance?: boolean;
}

export async function finalizeStep(
  ctx: PipelineCtx,
  task: TaskRow,
  step: number,
  payload?: Record<string, unknown>,
  opts: FinalizeOpts = {},
): Promise<void> {
  const { pg, redis } = ctx;
  const { skipped = false, compliance = false } = opts;

  // 1. 记单步结果
  if (skipped) await markStepSkipped(pg, task.id, step);
  else await markStepDone(pg, task.id, step, payload || {});

  // 2. 合规预审（L1.5）分流
  if (compliance) {
    const verdict = payload?.verdict;
    if (verdict === 'reject') {
      await failTask(pg, task.id, step, payload?.reason || '合规预审未通过');
      return;
    }
    if (verdict === 'review') {
      await pauseTask(pg, task.id, 'compliance_review', 2);
      return;
    }
    // pass → 落入正常推进（next = nextStepOf(1) = 2）
  }

  const mode = String(task.mode || 'static');
  let next = nextStepOf(step, mode);

  // 3. 托管档 L1 文案生成完成后 → 补发合规预审（step=1, reason=compliance）
  if (!compliance && String(task.track) === 'managed' && step === 1) {
    const done = await pg.query(
      `SELECT 1 FROM step_results
        WHERE task_id = $1 AND step = 1 AND status = 'done'
          AND payload->>'kind' = 'compliance_precheck'`,
      [task.id],
    );
    if (done.rowCount === 0) {
      const priority = await priorityKey(pg, task);
      enqueueStep(redis, { taskId: task.id, step: 1, priority, reason: 'compliance' });
      await updateProgress(pg, task, 1);
      return;
    }
  }

  // 4. 终态：next 超过最大逻辑步编号（10）即整任务 done。
  //    L9 完成后 next=10 → L10 照常入队；step 10 完成后 next=11 → done。
  //    current_step 收在 MAX_LOGIC_STEP(10)（=展示节点6），保证 GET progress 恰为 1。
  //    不能收 6——6 是展示节点数，current_step 是内部逻辑步号，progressOf(6)=配音节点=0.67。
  if (next > MAX_LOGIC_STEP) {
    await pg.query(`UPDATE tasks SET status = 'done', current_step = $2, updated_at = now() WHERE id = $1`, [
      task.id,
      MAX_LOGIC_STEP,
    ]);
    // done 结算（fire-and-forget，不阻塞流水线；按实际成本结算、多余解冻）。
    settleTask(task.id).catch(() => {});
    return;
  }

  // 5. 复核门：L8 合成前（默认开；review_passed 后不再停）
  if (next === 8 && task.config?.review_gate !== false && !task.config?.review_passed) {
    await pauseTask(pg, task.id, 'review_gate', 8);
    return;
  }

  // 6. semi 模式：每步后停等 continue
  if (task.run_mode === 'semi') {
    await pauseTask(pg, task.id, 'semi', next);
    return;
  }

  // 7. auto 推进
  const priority = await priorityKey(pg, task);
  enqueueStep(redis, { taskId: task.id, step: next, priority });
  await updateProgress(pg, task, next);
}
