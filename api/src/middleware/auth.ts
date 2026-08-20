/**
 * 认证中间件集合：
 *   - requireAuth / optionalAuth：来自 session 核心（Redis cookie 会话）。
 *   - requireAgeConfirmed：18+ 门禁（00-CONTRACT 注册门槛）。
 *   - scopedOwner：资源归属校验辅助 —— 校验资源 user_id 与当前登录用户一致，
 *     不一致返回 403 FORBIDDEN（03-接口文档 越权红线）。
 */

import type { RequestHandler } from 'express';
import { requireAuth, optionalAuth } from '../session.js';
import { apiError } from '@avs/shared';
import { query } from '../db.js';

export { requireAuth, optionalAuth };

/** 未确认 18+ 的账号拒绝进入内容生成功能（实时读 DB，而非会话快照）。 */
export const requireAgeConfirmed: RequestHandler = (req, _res, next) => {
  (async () => {
    if (!req.userId) throw apiError(401, 'AUTH_REQUIRED', 'Authentication required');
    const r = await query(`SELECT age_confirmed FROM users WHERE id = $1`, [req.userId]);
    if ((r.rowCount ?? 0) > 0 && r.rows[0].age_confirmed) return next();
    throw apiError(403, 'FORBIDDEN', 'Age confirmation (18+) required');
  })().catch(next);
};

/**
 * 归属校验：给定资源行的 ownerId，与当前用户比对。
 * 用于需要 403 语义（而非 404 隐藏存在）的资源端点。
 */
export function ensureOwnership(resourceOwnerId: string | null | undefined, reqUserId: string | null | undefined): void {
  if (!reqUserId) throw apiError(401, 'AUTH_REQUIRED', 'Authentication required');
  if (resourceOwnerId !== reqUserId) {
    throw apiError(403, 'FORBIDDEN', 'You do not have access to this resource');
  }
}
