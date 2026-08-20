/**
 * 流水线引擎入口（Phase 4，TS 移植 v2 pipeline/index.js）。
 *
 * 被 api/src/index.ts 引用：
 *   - 启动消费循环：步骤队列（startStepLoop）+ 延迟队列（startDelayedLoop）
 *     + 渲染回执（startRenderResultLoop）
 *   - enqueueNewTask：任务创建后接线的单一入口（routes/tasks 与
 *     routes/projects 的 auto_run 共用）
 *
 * 创建后接线（硬性要求）：
 *   - run_mode='auto'  → 计算优先级，入队 avs:steps:<priority> step=1（L1）
 *   - run_mode='semi'  → 不入队：config 写 paused/pause_kind='initial'/
 *     pause_resume_step=1，停在 L1 等 POST /continue 放行
 */

import type { DB, TaskRow } from './types.js';
import type { Redis } from 'ioredis';
import * as state from './state.js';
import { startStepLoop, startDelayedLoop } from './queues.js';
import { startRenderResultLoop } from './render.js';

// 任务创建后接线。task 为 createTask 的 RETURNING * 行。
export async function enqueueNewTask(pg: DB, redis: Redis | null, task: TaskRow): Promise<void> {
  if (!redis) return;
  if (String(task?.run_mode) === 'semi') {
    await state.patchTaskConfig(pg, task.id, {
      paused: true,
      pause_kind: 'initial',
      pause_resume_step: 1,
    });
    return; // 不入队；status 保持 'queued'，等 continue 入队 step 1
  }
  const priority = await state.priorityKey(pg, task);
  await state.enqueueStep(redis, { taskId: task.id, step: 1, priority });
}

export { startStepLoop, startDelayedLoop, startRenderResultLoop };
