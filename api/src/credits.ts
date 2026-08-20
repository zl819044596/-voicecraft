/**
 * 积分账户核心（C11：1 积分 = $0.01）。TS 移植并统一了计划解析：
 * freeze / settle / refund / rerun / grant / plan resolution / free-rerun quota.
 *
 * 幂等：credit_ledger_task_once UNIQUE(task_id, kind) 保证每任务 freeze/settle/refund
 * 至多一行；重复投递撞 23505 即安全跳过（R-幂等红线）。
 */

import type { PoolClient } from 'pg';
import { query as q, withTransaction } from './db.js';
import { FREE_RERUNS } from '@avs/shared';
import { apiError } from '@avs/shared';

export type { PoolClient };

// 订阅状态映射（Creem → 内部）。
export const SUB_STATUS_MAP: Record<string, string> = {
  active: 'active',
  trialing: 'active',
  past_due: 'past_due',
  paused: 'past_due',
  unpaid: 'past_due',
  canceled: 'canceled',
  scheduled_cancel: 'canceled',
  expired: 'expired',
};

export type ResolvedPlan = 'starter' | 'pro' | 'payg_static' | 'payg_i2v' | null;

/** 重跑免费额度（按 users.tier 展示口径；单一来源 = shared.FREE_RERUNS 的计划值）。 */
export const TIER_RERUNS_FREE: Record<string, number> = { free: 2, starter: 3, pro: 5 };
/** 计费重跑单价（积分）：static 20 / i2v 80（00-CONTRACT §4.2）。 */
export const RERUN_PRICES: Record<string, number> = { static: 20, i2v: 80 };

interface TaskForCredits {
  id: string;
  project_id: string;
  mode: string;
  track: string;
  status: string;
  credits_frozen: number;
  credits_settled: number;
  config: Record<string, unknown> | null;
  owner_id: string;
}

async function loadTaskForCredits(taskId: string): Promise<TaskForCredits | null> {
  const { rows } = await q(
    `SELECT t.*, p.user_id AS owner_id
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.id = $1`,
    [taskId],
  );
  return (rows[0] as TaskForCredits) || null;
}

function parseFreezeSplit(note: string | null): { trial: number } {
  const m = String(note || '').match(/trial:(\d+)/);
  return { trial: m ? Number(m[1]) || 0 : 0 };
}

// ---------------------------------------------------------------------------
// Plan resolution — determines free-rerun quota and priority (p0/p1/p2).
// ---------------------------------------------------------------------------

/**
 * Resolve the user's current effective plan:
 *   - active subscription → starter / pro
 *   - latest paid pay-as-you-go order → payg_static / payg_i2v
 *   - otherwise → null (trial quota applies)
 */
export async function resolveUserPlan(userId: string): Promise<ResolvedPlan> {
  const sub = await q(
    `SELECT plan FROM subscriptions WHERE user_id = $1 AND status = 'active'
     ORDER BY current_period_end DESC LIMIT 1`,
    [userId],
  );
  if ((sub.rowCount ?? 0) > 0) return (sub.rows[0].plan as ResolvedPlan);
  const payg = await q(
    `SELECT sku FROM orders WHERE user_id = $1 AND kind = 'pay_per_use' AND status = 'paid'
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if ((payg.rowCount ?? 0) > 0) {
    if (payg.rows[0].sku === 'static_once') return 'payg_static';
    if (payg.rows[0].sku === 'i2v_once') return 'payg_i2v';
  }
  return null;
}

/** Free reruns per task for the current plan (BYOK = Infinity). */
export async function freeRerunsForUser(userId: string): Promise<number> {
  const plan = await resolveUserPlan(userId);
  return plan ? (FREE_RERUNS[plan] ?? 2) : FREE_RERUNS.trial;
}

/** Priority queue tier for the task's track (Pro managed > Starter/payg > BYOK). */
export async function queuePriority(userId: string): Promise<0 | 1 | 2> {
  const plan = await resolveUserPlan(userId);
  if (plan === 'pro') return 0;
  if (plan === 'starter' || plan === 'payg_static' || plan === 'payg_i2v') return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// A. 冻结 — 托管档任务创建（调用方在同一事务内先 INSERT tasks 再 freeze）。
// ---------------------------------------------------------------------------
export async function freezeForTask(
  client: PoolClient,
  { userId, taskId, amount, mode }: { userId: string; taskId: string; amount: number; mode: string },
): Promise<{ frozen: number; credits_after: number; trial_credits_after: number }> {
  const req = Math.round(Number(amount) || 0);
  if (req <= 0) return { frozen: 0, credits_after: 0, trial_credits_after: 0 };

  const acc = await client.query(
    `SELECT credits, trial_credits FROM credit_accounts WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  if (acc.rowCount === 0) {
    throw apiError(402, 'INSUFFICIENT_CREDITS', 'insufficient credits for managed track', {
      required: req,
      available: 0,
    });
  }
  const credits = Number(acc.rows[0].credits) || 0;
  const trial = Number(acc.rows[0].trial_credits) || 0;
  if (credits + trial < req) {
    throw apiError(402, 'INSUFFICIENT_CREDITS', 'insufficient credits for managed track', {
      required: req,
      available: credits + trial,
    });
  }

  const trialTake = Math.min(trial, req);
  const creditsTake = req - trialTake;
  const upd = await client.query(
    `UPDATE credit_accounts
        SET trial_credits = trial_credits - $2,
            credits = credits - $3,
            updated_at = now()
      WHERE user_id = $1 AND trial_credits >= $2 AND credits >= $3
      RETURNING credits, trial_credits`,
    [userId, trialTake, creditsTake],
  );
  if (upd.rowCount === 0) {
    throw apiError(402, 'INSUFFICIENT_CREDITS', 'insufficient credits for managed track', {
      required: req,
      available: credits + trial,
    });
  }
  const balanceAfter = Number(upd.rows[0].credits) || 0;
  const trialAfter = Number(upd.rows[0].trial_credits) || 0;
  await client.query(
    `INSERT INTO credit_ledger (user_id, task_id, kind, amount, balance_after, note)
     VALUES ($1, $2, 'freeze', $3, $4, $5)`,
    [userId, taskId, -req, balanceAfter, `trial:${trialTake} credits:${creditsTake} mode:${mode}`],
  );
  await client.query(
    `UPDATE tasks SET credits_frozen = $2, updated_at = now()
      WHERE id = $1 AND credits_frozen = 0`,
    [taskId, req],
  );
  return { frozen: req, credits_after: balanceAfter, trial_credits_after: trialAfter };
}

// ---------------------------------------------------------------------------
// B. 结算 — 任务 done 后按 api_cost_log 实际成本结算，多余解冻回补。
// ---------------------------------------------------------------------------
export async function settleTask(taskId: string): Promise<void> {
  try {
    const task = await loadTaskForCredits(taskId);
    if (!task || task.track !== 'managed' || task.status !== 'done') return;
    const frozen = Number(task.credits_frozen) || 0;
    if (frozen <= 0) return;
    const userId = task.owner_id;

    await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT 1 FROM credit_ledger WHERE task_id = $1 AND kind IN ('settle','refund') LIMIT 1`,
        [taskId],
      );
      if ((existing.rowCount ?? 0) > 0) return;

      const freezeRow = await client.query(
        `SELECT note FROM credit_ledger WHERE task_id = $1 AND kind = 'freeze' LIMIT 1`,
        [taskId],
      );
      const trialBack = (freezeRow.rowCount ?? 0) > 0 ? parseFreezeSplit(freezeRow.rows[0].note).trial : 0;

      const cost = await client.query(
        `SELECT coalesce(sum(cost_usd), 0)::float8 AS total FROM api_cost_log WHERE task_id = $1`,
        [taskId],
      );
      const actualCents = Math.min(Math.round((Number(cost.rows[0]?.total) || 0) * 100), frozen);
      const diff = frozen - actualCents;

      const refundTrial = Math.max(0, trialBack - actualCents);
      const refundCredits = Math.max(0, diff - refundTrial);

      let balanceAfter: number;
      if (diff > 0) {
        const upd = await client.query(
          `UPDATE credit_accounts
              SET trial_credits = trial_credits + $2,
                  credits = credits + $3,
                  updated_at = now()
            WHERE user_id = $1
            RETURNING credits`,
          [userId, refundTrial, refundCredits],
        );
        if (upd.rowCount === 0) throw new Error(`settleTask: credit_accounts missing for user ${userId}`);
        balanceAfter = Number(upd.rows[0].credits) || 0;
      } else {
        const bal = await client.query(`SELECT credits FROM credit_accounts WHERE user_id = $1`, [userId]);
        balanceAfter = Number(bal.rows[0]?.credits) || 0;
      }

      await client.query(
        `INSERT INTO credit_ledger (user_id, task_id, kind, amount, balance_after, note)
         VALUES ($1, $2, 'settle', $3, $4, $5)`,
        [userId, taskId, diff, balanceAfter, `actual_cents:${actualCents} trial_back:${refundTrial}`],
      );
      await client.query(
        `UPDATE tasks SET credits_settled = $2, updated_at = now()
          WHERE id = $1 AND status = 'done'`,
        [taskId, actualCents],
      );
    });
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') return; // 幂等
    console.warn(`[credits] settleTask ${taskId} failed: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// C. 退款 — 任务 failed/cancelled：frozen - settled 全额解冻。
// ---------------------------------------------------------------------------
export async function refundForTask(taskId: string): Promise<void> {
  try {
    const task = await loadTaskForCredits(taskId);
    if (!task || task.track !== 'managed') return;
    const frozen = Number(task.credits_frozen) || 0;
    if (frozen <= 0) return;
    const userId = task.owner_id;

    await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT 1 FROM credit_ledger WHERE task_id = $1 AND kind IN ('settle','refund') LIMIT 1`,
        [taskId],
      );
      if ((existing.rowCount ?? 0) > 0) return;

      const freezeRow = await client.query(
        `SELECT note FROM credit_ledger WHERE task_id = $1 AND kind = 'freeze' LIMIT 1`,
        [taskId],
      );
      const trialBack = (freezeRow.rowCount ?? 0) > 0 ? parseFreezeSplit(freezeRow.rows[0].note).trial : 0;
      const settled = Number(task.credits_settled) || 0;
      const toRefund = frozen - settled;
      if (toRefund <= 0) return;

      const creditsBack = Math.max(0, toRefund - trialBack);
      const upd = await client.query(
        `UPDATE credit_accounts
            SET trial_credits = trial_credits + $2,
                credits = credits + $3,
                updated_at = now()
          WHERE user_id = $1
          RETURNING credits`,
        [userId, trialBack, creditsBack],
      );
      if (upd.rowCount === 0) throw new Error(`refundForTask: credit_accounts missing for user ${userId}`);
      const balanceAfter = Number(upd.rows[0].credits) || 0;
      await client.query(
        `INSERT INTO credit_ledger (user_id, task_id, kind, amount, balance_after, note)
         VALUES ($1, $2, 'refund', $3, $4, $5)`,
        [userId, taskId, toRefund, balanceAfter, `trial_back:${trialBack}`],
      );
      await client.query(
        `UPDATE tasks SET credits_frozen = 0, credits_settled = 0, updated_at = now()
          WHERE id = $1`,
        [taskId],
      );
    });
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') return;
    console.warn(`[credits] refundForTask ${taskId} failed: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// D. 重跑计费 — 托管档超免费次数后按次扣费（static 20 / i2v 80）。
// 返回计费明细供 rerun 端点回显：charged_credits（免费次数内 0）、
// credits_after（扣减后 credit_accounts.credits）、reruns_free（档位免费额度，
// BYOK=-1 无限）、reruns_used（本次重跑前的累计次数，调用方自增后即"本次后"）。
// 注意：必须在 rerun 自增 config.rerun_count 之前调用（本函数以旧值判免费档）。
// ---------------------------------------------------------------------------
export async function chargeForRerun(
  taskId: string,
  mode: 'static' | 'i2v',
): Promise<{ charged_credits: number; credits_after: number | null; reruns_free: number; reruns_used: number }> {
  const task = await loadTaskForCredits(taskId);
  // BYOK：不计量（charged 恒 0；reruns_used 不计；free=-1 表示无限）。
  if (!task || task.track !== 'managed') {
    return { charged_credits: 0, credits_after: null, reruns_free: -1, reruns_used: 0 };
  }
  const m = mode === 'i2v' ? 'i2v' : 'static';
  const used = Number((task.config as Record<string, unknown>)?.rerun_count) || 0;
  const free = await freeRerunsForUser(task.owner_id);
  if (used < free) {
    // 免费额度内不扣费。
    const acc = await q(`SELECT credits FROM credit_accounts WHERE user_id = $1`, [task.owner_id]);
    return { charged_credits: 0, credits_after: Number(acc.rows[0]?.credits) || 0, reruns_free: free, reruns_used: used };
  }

  const price = RERUN_PRICES[m] ?? 20;
  let creditsAfter = 0;
  await withTransaction(async (client) => {
    const acc = await client.query(
      `SELECT credits, trial_credits FROM credit_accounts WHERE user_id = $1 FOR UPDATE`,
      [task.owner_id],
    );
    if (acc.rowCount === 0) {
      throw apiError(402, 'INSUFFICIENT_CREDITS', 'insufficient credits for rerun', {
        required: price,
        available: 0,
      });
    }
    const credits = Number(acc.rows[0].credits) || 0;
    const trial = Number(acc.rows[0].trial_credits) || 0;
    if (credits + trial < price) {
      throw apiError(402, 'INSUFFICIENT_CREDITS', 'insufficient credits for rerun', {
        required: price,
        available: credits + trial,
      });
    }
    const trialTake = Math.min(trial, price);
    const creditsTake = price - trialTake;
    const upd = await client.query(
      `UPDATE credit_accounts
          SET trial_credits = trial_credits - $2,
              credits = credits - $3,
              updated_at = now()
        WHERE user_id = $1 AND trial_credits >= $2 AND credits >= $3
        RETURNING credits`,
      [task.owner_id, trialTake, creditsTake],
    );
    if (upd.rowCount === 0) {
      throw apiError(402, 'INSUFFICIENT_CREDITS', 'insufficient credits for rerun', {
        required: price,
        available: credits + trial,
      });
    }
    await client.query(
      `INSERT INTO credit_ledger (user_id, task_id, kind, amount, balance_after, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [task.owner_id, task.id, `rerun_${m}`, -price, Number(upd.rows[0].credits) || 0,
       `trial:${trialTake} credits:${creditsTake} rerun_count:${used}`],
    );
    creditsAfter = Number(upd.rows[0].credits) || 0;
  });
  return { charged_credits: price, credits_after: creditsAfter, reruns_free: free, reruns_used: used };
}

// ---------------------------------------------------------------------------
// E. 发放积分 — 支付入账（topup / grant_subscription），必须在事务内调用。
// ---------------------------------------------------------------------------
export async function grantCredits(
  client: PoolClient,
  { userId, kind, amount, note }: { userId: string; kind: 'topup' | 'grant_subscription'; amount: number; note?: string | null },
): Promise<{ granted: number; credits: number }> {
  const a = Math.round(Number(amount) || 0);
  if (a <= 0) return { granted: 0, credits: 0 };
  if (kind !== 'topup' && kind !== 'grant_subscription') {
    throw new Error(`grantCredits: invalid kind "${kind}"`);
  }
  const r = await client.query(
    `INSERT INTO credit_accounts (user_id, credits, trial_credits, trial_granted)
     VALUES ($1, $2, 0, false)
     ON CONFLICT (user_id) DO UPDATE SET
       credits = credit_accounts.credits + EXCLUDED.credits,
       updated_at = now()
     RETURNING credits`,
    [userId, a],
  );
  const balanceAfter = Number(r.rows[0].credits) || 0;
  await client.query(
    `INSERT INTO credit_ledger (user_id, kind, amount, balance_after, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, kind, a, balanceAfter, note || null],
  );
  return { granted: a, credits: balanceAfter };
}

// ---------------------------------------------------------------------------
// F. 订阅镜像 + tier 同步（webhook 用）。
// ---------------------------------------------------------------------------
export async function syncSubscriptionAndTier(
  client: PoolClient,
  { userId, creemSubId, status, currentPeriodEnd, plan }: {
    userId: string;
    creemSubId: string | null;
    status: string;
    currentPeriodEnd?: string | Date;
    plan?: string;
  },
): Promise<string | null> {
  const subStatus = SUB_STATUS_MAP[String(status || '').toLowerCase()] || 'active';
  const periodEnd = currentPeriodEnd
    ? new Date(currentPeriodEnd)
    : new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const subPlan = plan || 'pro';

  if (subStatus === 'active') {
    await client.query(
      `UPDATE subscriptions SET status = 'canceled', updated_at = now()
        WHERE user_id = $1 AND status = 'active'
          AND (creem_sub_id IS DISTINCT FROM $2::text)`,
      [userId, creemSubId || null],
    );
  }

  let rowId: string | null = null;
  if (creemSubId) {
    const r = await client.query(
      `INSERT INTO subscriptions (user_id, creem_sub_id, plan, status, current_period_end)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (creem_sub_id) DO UPDATE SET
         status = EXCLUDED.status, plan = EXCLUDED.plan,
         current_period_end = EXCLUDED.current_period_end, updated_at = now()
       RETURNING id`,
      [userId, creemSubId, subPlan, subStatus, periodEnd],
    );
    rowId = r.rows[0].id;
  } else {
    const r = await client.query(
      `UPDATE subscriptions SET status = $2, plan = $3, current_period_end = $4, updated_at = now()
        WHERE user_id = $1 AND status = 'active'
        RETURNING id`,
      [userId, subStatus, subPlan, periodEnd],
    );
    if (r.rowCount === 0) {
      const ins = await client.query(
        `INSERT INTO subscriptions (user_id, creem_sub_id, plan, status, current_period_end)
         VALUES ($1, NULL, $2, $3, $4) RETURNING id`,
        [userId, subPlan, subStatus, periodEnd],
      );
      rowId = ins.rows[0].id;
    } else {
      rowId = r.rows[0].id;
    }
  }

  if (subStatus === 'active') {
    await client.query(`UPDATE users SET tier = 'pro', updated_at = now() WHERE id = $1`, [userId]);
  } else {
    const act = await client.query(
      `SELECT 1 FROM subscriptions WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [userId],
    );
    if (act.rowCount === 0) {
      await client.query(`UPDATE users SET tier = 'free', updated_at = now() WHERE id = $1`, [userId]);
    }
  }
  return rowId;
}

// ---------------------------------------------------------------------------
// G. 账户查询 — GET /api/credits 与 /api/auth/me 共用。
// ---------------------------------------------------------------------------
export async function getCreditState(userId: string): Promise<{
  credits: number;
  trial_credits: number;
  trial_granted: boolean;
  free_reruns_per_task: number;
  plan: ResolvedPlan;
}> {
  const [acc, plan] = await Promise.all([
    q(`SELECT credits, trial_credits, trial_granted FROM credit_accounts WHERE user_id = $1`, [userId]),
    resolveUserPlan(userId),
  ]);
  const free = plan ? (FREE_RERUNS[plan] ?? 2) : FREE_RERUNS.trial;
  return {
    credits: Number(acc.rows[0]?.credits) || 0,
    trial_credits: Number(acc.rows[0]?.trial_credits) || 0,
    trial_granted: Boolean(acc.rows[0]?.trial_granted) || false,
    free_reruns_per_task: free === Infinity ? -1 : free, // -1 = unlimited (BYOK display)
    plan,
  };
}
