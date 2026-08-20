/**
 * 滥用举报（Phase 3，03-接口文档 §5.6 / R4）：
 *   POST /api/report-abuse  提交举报（reason 枚举 + idempotency_key 唯一防重）
 *
 * 幂等：report_abuse.idempotency_key 唯一约束；重复提交返回首单结果（204 形状）。
 * 限流：reportAbuseRateLimit 10/min（user + IP）。
 */

import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { optionalAuth } from '../session.js';
import { reportAbuseRateLimit } from '../middleware/ratelimit.js';
import { asyncHandler } from '../utils.js';
import { apiError } from '@avs/shared';

export const router = Router();

// 03-接口文档 §5.6：认证「否（匿名可报）」。optionalAuth 仅在有会话时注入
// req.userId（本表无 user_id 列，纯匿名落库）；IP 限流见 reportAbuseRateLimit。
const REASONS = new Set(['copyright', 'illegal', 'spam', 'privacy', 'other']);

router.post(
  '/',
  optionalAuth,
  reportAbuseRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const reason = String(body.reason ?? '');
    const details = body.details === undefined || body.details === null ? null : String(body.details).slice(0, 2000);
    const contact = body.contact === undefined || body.contact === null ? null : String(body.contact).slice(0, 320);
    const idemKey = String(body.idempotency_key ?? '').trim();
    if (!idemKey || idemKey.length > 128) {
      throw apiError(422, 'VALIDATION_ERROR', 'idempotency_key is required (max 128 chars)');
    }
    if (!REASONS.has(reason)) {
      throw apiError(422, 'VALIDATION_ERROR', `reason must be one of: ${[...REASONS].join(', ')}`);
    }

    // 幂等：已有同 idempotency_key 记录 → 返回首单。
    const existing = await query(
      `SELECT id, status, created_at FROM report_abuse WHERE idempotency_key = $1`,
      [idemKey],
    );
    if ((existing.rowCount ?? 0) > 0) {
      res.status(200).json({ id: existing.rows[0].id, status: existing.rows[0].status, created_at: existing.rows[0].created_at, replayed: true });
      return;
    }

    try {
      const { rows } = await query(
        `INSERT INTO report_abuse (idempotency_key, reason, details, contact, status)
         VALUES ($1, $2, $3, $4, 'open')
         RETURNING id, status, created_at`,
        [idemKey, reason, details, contact],
      );
      res.status(201).json({ id: rows[0].id, status: rows[0].status, created_at: rows[0].created_at });
    } catch (err) {
      if ((err as { code?: string })?.code === '23505') {
        // 并发重复 → 返回首单。
        const r = await query(`SELECT id, status, created_at FROM report_abuse WHERE idempotency_key = $1`, [idemKey]);
        res.status(200).json({ id: r.rows[0].id, status: r.rows[0].status, created_at: r.rows[0].created_at, replayed: true });
        return;
      }
      throw err;
    }
  }),
);
