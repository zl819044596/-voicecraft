/**
 * 流水线共享类型（Phase 4）。ctx 是步骤运行上下文（pg/redis/minio + 任务行）。
 */

import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import type { Client as MinioClient } from 'minio';

export type DB = Pool | PoolClient;

export interface PipelineCtx {
  pg: DB;
  redis: Redis;
  minio: MinioClient;
}

/** tasks 表完整行（loadTaskForStep 附带的 owner/tier/prompt/source_type）。 */
export interface TaskRow {
  id: string;
  project_id: string;
  mode: 'static' | 'i2v';
  track: 'byok' | 'managed';
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  current_step: number;
  run_mode: 'semi' | 'auto';
  config: Record<string, unknown>;
  credits_frozen: number;
  credits_settled: number;
  created_at: Date;
  updated_at: Date;
  // join 附加列
  owner_id?: string;
  prompt?: string;
  source_type?: string;
  tier?: string;
  // 运行期注入（当前 step，供 api_cost_log 使用）
  step?: number;
}

/** 步骤 runner 返回：等待 render 回执 / 跳过 / 正常 payload。 */
export interface StepRunResult {
  payload?: Record<string, unknown>;
  skipped?: boolean;
  waitingForRender?: boolean;
}

/** 队列 job 形状。 */
export interface StepJob {
  taskId: string;
  step: number;
  reason?: string;
  force?: boolean;
  priority?: string;
}
