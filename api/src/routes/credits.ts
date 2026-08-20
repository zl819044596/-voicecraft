/**
 * 积分账户与流水（Phase 6，03-接口文档 §9.4 / §9.5）。
 *
 *   GET /api/credits         — 账户总览（可用/体验积分 + 等效条数 + 订阅 + 免费重跑）
 *   GET /api/credits/ledger  — 积分流水（?kind=&task_id= + 分页）
 *
 * 等效条数口径（§9.4）：static_count = ⌊(credits + trial_credits)/60⌋，
 * i2v_count = ⌊(credits + trial_credits)/300⌋（300 积分 = 1 i2v = 5 static）。
 */

import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../session.js';
import { asyncHandler, pagination } from '../utils.js';
import { getCreditState } from '../credits.js';

export const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const state = await getCreditState(uid);
    const sub = await query(
      `SELECT plan, status, current_period_end FROM subscriptions
        WHERE user_id = $1 AND status = 'active'
        ORDER BY current_period_end DESC LIMIT 1`,
      [uid],
    );

    const usable = state.credits + state.trial_credits;
    res.json({
      credits: state.credits,
      trial_credits: state.trial_credits,
      trial_granted: state.trial_granted,
      equivalents: {
        static_count: Math.floor(usable / 60),
        i2v_count: Math.floor(usable / 300),
      },
      subscription: (sub.rowCount ?? 0) > 0
        ? {
            plan: sub.rows[0].plan,
            status: sub.rows[0].status,
            current_period_end: sub.rows[0].current_period_end,
          }
        : null,
      free_reruns_per_task: state.free_reruns_per_task,
    });
  }),
);

router.get(
  '/ledger',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const { page, size, offset } = pagination(req);
    const kind = String(req.query.kind ?? '').trim();
    const taskId = String(req.query.task_id ?? '').trim();

    const params: unknown[] = [uid];
    let where = 'WHERE user_id = $1';
    if (kind) {
      params.push(kind);
      where += ` AND kind = $${params.length}`;
    }
    if (taskId) {
      params.push(taskId);
      where += ` AND task_id = $${params.length}`;
    }

    const [data, count] = await Promise.all([
      query(
        `SELECT id, task_id, kind, amount, balance_after, note, created_at
           FROM credit_ledger ${where}
          ORDER BY created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, size, offset],
      ),
      query(`SELECT count(*)::int AS total FROM credit_ledger ${where}`, params),
    ]);

    res.json({
      items: data.rows.map((r) => ({
        id: r.id,
        task_id: r.task_id,
        kind: r.kind,
        amount: Number(r.amount),
        balance_after: r.balance_after === null ? null : Number(r.balance_after),
        note: r.note,
        created_at: r.created_at,
      })),
      page,
      size,
      total: count.rows[0].total,
    });
  }),
);
