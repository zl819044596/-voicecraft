/**
 * 认证路由（Phase 2，00-CONTRACT §5.1 / 03-接口文档 §2）：
 *
 *   POST /api/auth/google            发起 Google OAuth → authorize_url
 *   POST /api/auth/google/callback   交换 code → 会话（Set-Cookie）
 *   POST /api/auth/magic-link        邮箱一次性链接（限流 + 防枚举）
 *   POST /api/auth/magic-link/verify 消费 token → 会话（Set-Cookie）
 *   POST /api/auth/logout            销毁会话（幂等）
 *   GET  /api/auth/me                当前用户 + 积分 + 订阅 + free_reruns_per_task
 */

import { Router, Request, Response } from 'express';
import { redis } from '../redis.js';
import { query } from '../db.js';
import { asyncHandler, clientIp, sha256 } from '../utils.js';
import {
  requireAuth,
  optionalAuth,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  ensureUserByGoogle,
  ensureUserByEmail,
} from '../session.js';
import { createMagicLink, createMailer, TOKEN_TTL } from '../magicLink.js';
import {
  googleIsConfigured,
  createAuthorizeUrl,
  exchangeGoogleCode,
  googleUserInfo,
} from '../oauth.js';
import { getCreditState } from '../credits.js';
import { apiError } from '@avs/shared';

export const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATE_TTL = 600; // seconds — OAuth state（CSRF）生命周期
const CODE_DEDUP_TTL = 600_000; // ms — authorization-code 幂等标记

// ---------------------------------------------------------------------------
// POST /api/auth/google — 发起 OAuth；返回 authorize URL + state。
// ---------------------------------------------------------------------------
router.post(
  '/google',
  asyncHandler(async (_req, res: Response) => {
    if (!googleIsConfigured()) {
      throw apiError(500, 'OAUTH_NOT_CONFIGURED', 'Google OAuth is not configured');
    }
    const state = sha256(`${Date.now()}:${Math.random()}`).slice(0, 32);
    await redis.set(`avs:oauth:state:${state}`, '1', 'EX', STATE_TTL);
    const authorizeUrl = createAuthorizeUrl(state);
    res.json({ authorize_url: authorizeUrl, state });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/google/callback — code+state+age_confirmed → 会话。
// ---------------------------------------------------------------------------
router.post(
  '/google/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (body.age_confirmed !== true) {
      throw apiError(403, 'FORBIDDEN', 'Age confirmation is required');
    }
    if (!googleIsConfigured()) {
      throw apiError(500, 'OAUTH_NOT_CONFIGURED', 'Google OAuth is not configured');
    }
    const state = String(body.state ?? '');
    const code = String(body.code ?? '');

    // CSRF：state 必须是我们签发过的一次性值。
    const stateOk = await redis.getdel(`avs:oauth:state:${state}`);
    if (!stateOk) throw apiError(400, 'BAD_REQUEST', 'OAuth state missing or expired');

    // 授权码单次使用；重放 code 在触达 Google 前即被拒。
    const codeKey = `avs:oauth:code:${sha256(code)}`;
    const dedup = await redis.set(codeKey, '1', 'PX', CODE_DEDUP_TTL, 'NX').catch(() => 'OK');
    if (dedup !== 'OK') throw apiError(409, 'CONFLICT', 'Authorization code already used');

    let identity: Awaited<ReturnType<typeof googleUserInfo>>;
    try {
      const token = await exchangeGoogleCode(code);
      identity = await googleUserInfo(token.access_token);
    } catch (err) {
      console.error(`[auth] google exchange failed: ${(err as Error).message}`);
      throw apiError(502, 'PROVIDER_UNAVAILABLE', 'Failed to exchange OAuth code');
    }

    const result = await ensureUserByGoogle({
      googleSub: identity.sub,
      email: identity.email,
      nickname: identity.name,
      ageConfirmed: true,
      deviceId: body.device_id ? String(body.device_id) : null,
    });
    const sid = await createSession({
      userId: result.user.id,
      email: result.user.email,
      tier: result.user.tier,
      locale: result.user.locale,
      ip: clientIp(req),
    });
    setSessionCookie(res, sid);
    res.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        nickname: result.user.nickname,
        tier: result.user.tier,
        is_new_user: result.isNewUser,
        trial: { granted: result.trial.granted, trial_credits: result.trial.trialCredits },
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/magic-link — 铸造 + 发送一次性邮箱 token。
// 注册/未注册地址返回一致结构（防枚举）。
// ---------------------------------------------------------------------------
router.post(
  '/magic-link',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (body.age_confirmed !== true) {
      throw apiError(403, 'FORBIDDEN', 'Age confirmation is required');
    }
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw apiError(400, 'BAD_REQUEST', 'Invalid email address');

    const magic = createMagicLink(createMailer());
    try {
      await magic.request({ email, ageConfirmed: true, ip: clientIp(req) });
    } catch (err) {
      const e = err as { code?: string; retryAfter?: number };
      if (e.code === 'EMAIL_RATE' || e.code === 'IP_RATE') {
        res.setHeader('Retry-After', String(e.retryAfter ?? 1));
        throw apiError(429, 'RATE_LIMITED', 'Too many requests, please retry later');
      }
      console.error(`[auth] magic-link request failed: ${(err as Error).message}`);
      throw apiError(500, 'INTERNAL', 'Internal server error');
    }

    res.json({ sent: true, expires_in: TOKEN_TTL });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/magic-link/verify — 消费 token → 会话。
// ---------------------------------------------------------------------------
router.post(
  '/magic-link/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const magic = createMagicLink(createMailer());
    let verified: { email: string; ageConfirmed: boolean };
    try {
      verified = await magic.verify(String(req.body?.token ?? ''));
    } catch (err) {
      const e = err as { code?: string };
      switch (e.code) {
        case 'REUSED':
          throw apiError(409, 'CONFLICT', 'Magic link token already used');
        case 'EXPIRED':
          throw apiError(410, 'MAGIC_LINK_EXPIRED', 'Magic link has expired');
        case 'INVALID':
        default:
          throw apiError(400, 'BAD_REQUEST', 'Invalid magic link token');
      }
    }

    // R5：未确认年龄的链接永远不能铸造会话。
    if (verified.ageConfirmed !== true) {
      throw apiError(403, 'FORBIDDEN', 'Age confirmation is required');
    }

    const result = await ensureUserByEmail({
      email: verified.email,
      ageConfirmed: true,
      deviceId: req.body?.device_id ? String(req.body.device_id) : null,
    });
    const sid = await createSession({
      userId: result.user.id,
      email: result.user.email,
      tier: result.user.tier,
      locale: result.user.locale,
      ip: clientIp(req),
    });
    setSessionCookie(res, sid);
    res.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        nickname: result.user.nickname,
        tier: result.user.tier,
        is_new_user: result.isNewUser,
        trial: { granted: result.trial.granted, trial_credits: result.trial.trialCredits },
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/logout — 销毁会话；幂等（optionalAuth）。
// ---------------------------------------------------------------------------
router.post(
  '/logout',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    if (req.sessionSid) await destroySession(req.sessionSid);
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/auth/me — 当前用户 + 积分概览 + 订阅 + free_reruns_per_task。
// ---------------------------------------------------------------------------
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const [u, credit, sub] = await Promise.all([
      query(
        `SELECT id, email, nickname, tier, locale, age_confirmed, status, created_at
           FROM users WHERE id = $1`,
        [uid],
      ),
      getCreditState(uid),
      query(
        `SELECT plan, status, current_period_end
           FROM subscriptions
          WHERE user_id = $1 AND status = 'active'
          ORDER BY current_period_end DESC
          LIMIT 1`,
        [uid],
      ),
    ]);

    if (u.rowCount === 0) throw apiError(401, 'UNAUTHORIZED', 'Not authenticated');
    const row = u.rows[0];
    const subRow = sub.rows[0] ?? null;

    res.json({
      user: {
        id: row.id,
        email: row.email,
        nickname: row.nickname,
        tier: row.tier,
        locale: row.locale,
        age_confirmed: row.age_confirmed,
        status: row.status,
        created_at: row.created_at,
      },
      credits: {
        credits: credit.credits,
        trial_credits: credit.trial_credits,
        trial_granted: credit.trial_granted,
        free_reruns_per_task: credit.free_reruns_per_task,
        equivalents: {
          static_count: Math.floor(credit.credits / 60),
          i2v_count: Math.floor(credit.credits / 300),
        },
      },
      subscription: subRow
        ? {
            plan: subRow.plan,
            status: subRow.status,
            current_period_end: subRow.current_period_end,
          }
        : null,
    });
  }),
);
