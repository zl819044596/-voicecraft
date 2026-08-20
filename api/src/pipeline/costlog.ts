/**
 * api_cost_log 写入（append-only 财务账；schema 触发器禁 UPDATE/DELETE）。
 * 每个 provider 调用记一行；成本账绝不能打断流水线 → 失败仅告警。
 */

import type { DB } from './types.js';

export interface CostLogEntry {
  taskId: string;
  step: number;
  track: string;
  provider: string;
  model: string | null;
  units: number;
  unitPriceUsd: number | null;
  costUsd: number | null;
}

export async function insertCostLog(pg: DB, entry: CostLogEntry): Promise<void> {
  if (!pg || !entry.taskId) return;
  try {
    await pg.query(
      `INSERT INTO api_cost_log
         (task_id, step, track, provider, model, units, unit_price_usd, cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.taskId,
        Number(entry.step) || 1,
        entry.track === 'managed' ? 'managed' : 'byok',
        String(entry.provider || 'unknown').slice(0, 100),
        String(entry.model || '').slice(0, 200),
        entry.units,
        entry.unitPriceUsd,
        entry.costUsd,
      ],
    );
  } catch (err) {
    console.warn(`[costlog] insert failed for task ${entry.taskId} step ${entry.step}: ${(err as Error).message}`);
  }
}
