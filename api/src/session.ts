/**
 * 认证与会话核心（Phase 2）。TS 移植 v2 验证过的实现，并补充 locale（C13）。
 *
 *   - HttpOnly cookie：sid = `avs-` + 256-bit 随机；会话载荷存 Redis
 *     `avs:sess:<sid>`，30 天 TTL。sid 足够长，无需 HMAC 签名
 *     （SESSION_SECRET 保留作未来扩展）。
 *   - requireAuth / optionalAuth：cookie → Redis → 注入 req.user / req.userId。
 *   - 用户 upsert（Google sub / email）+ 一次性 120 积分试用发放，同一事务内：
 *     credit_accounts（trial_granted=true）+ credit_ledger `grant_trial`。
 *     Redis 设备/邮箱 fast-path 标记 + DB trial_granted 双保险。
 */

import type { Request, RequestHandler, Response } from 'express';
import crypto from 'node:crypto';
import { redis } from './redis.js';
import { withTransaction, query } from './db.js';
import { apiError } from '@avs/shared';

export const SESSION_COOKIE = 'avs_session';
export const SESSION_TTL = 2592000; // 30 days (seconds)
const SESSION_PREFIX = 'avs:sess:';
export const TRIAL_CREDITS = 120; // signup trial grant

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

// ---------------------------------------------------------------------------
// Cookie handling (no cookie-parser dependency)
// ---------------------------------------------------------------------------

export function parseCookies(req: Request): Record<string, string> {
  const header = String(req.headers.cookie ?? '');
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) out[name] = value;
  }
  return out;
}

export function readSessionSid(req: Request): string | null {
  return parseCookies(req)[SESSION_COOKIE] || null;
}

// Secure flag only in production / behind an https origin — otherwise local
// curl verification silently drops the cookie on the next request.
function cookieIsSecure(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    String(process.env.BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || '').startsWith('https://')
  );
}

export function setSessionCookie(res: Response, sid: string): void {
  const secure = cookieIsSecure();
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}${secure ? '; Secure' : ''}`,
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export async function createSession(opts: {
  userId: string;
  email?: string | null;
  tier?: string | null;
  locale?: string | null;
  ip?: string | null;
}): Promise<string> {
  const sid = `avs-${crypto.randomBytes(24).toString('hex')}`;
  const payload = JSON.stringify({
    userId: opts.userId,
    email: opts.email ?? null,
    tier: opts.tier ?? 'free',
    locale: opts.locale ?? null,
    ip: opts.ip || null,
    createdAt: Date.now(),
  });
  await redis.set(`${SESSION_PREFIX}${sid}`, payload, 'EX', SESSION_TTL);
  return sid;
}

export interface SessionPayload {
  userId: string;
  email: string | null;
  tier: string | null;
  locale: string | null;
  ip: string | null;
  createdAt: number;
}

export async function getSession(sid: string | null): Promise<SessionPayload | null> {
  if (!sid) return null;
  try {
    const raw = await redis.get(`${SESSION_PREFIX}${sid}`);
    if (!raw) return null;
    const session = JSON.parse(raw) as SessionPayload;
    return session && session.userId ? session : null;
  } catch {
    return null;
  }
}

export async function destroySession(sid: string | null): Promise<void> {
  if (!sid) return;
  try {
    await redis.del(`${SESSION_PREFIX}${sid}`);
  } catch {
    /* best effort */
  }
}

interface AuthUser {
  id: string;
  email: string | null;
  nickname: string | null;
  locale: string | null;
  tier: 'free' | 'starter' | 'pro';
  ageConfirmed: boolean;
}

function attachUser(req: Request, sid: string, session: SessionPayload): void {
  req.sessionSid = sid;
  req.userId = session.userId;
  req.user = {
    id: session.userId,
    email: session.email ?? null,
    nickname: null,
    locale: session.locale ?? null,
    tier: (session.tier as AuthUser['tier']) ?? 'free',
    ageConfirmed: true,
  };
}

// Sliding renewal — best effort, never fails a request over an EXPIRE hiccup.
function renewSession(sid: string): void {
  redis.expire(`${SESSION_PREFIX}${sid}`, SESSION_TTL).catch(() => {});
}

function unauthorized(res: Response): void {
  res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
}

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------

export const requireAuth: RequestHandler = (req, res, next) => {
  (async () => {
    const sid = readSessionSid(req);
    const session = sid ? await getSession(sid) : null;
    if (!session) return unauthorized(res);
    attachUser(req, sid!, session);
    renewSession(sid!);
    next();
  })().catch(() => unauthorized(res));
};

export const optionalAuth: RequestHandler = (req, _res, next) => {
  (async () => {
    req.user = null;
    const sid = readSessionSid(req);
    const session = sid ? await getSession(sid) : null;
    if (session) {
      attachUser(req, sid!, session);
      renewSession(sid!);
    }
    next();
  })().catch(() => next());
};

// ---------------------------------------------------------------------------
// DB helpers — user upsert + trial grant inside one transaction
// ---------------------------------------------------------------------------

function loadUser(client: { query: typeof query }, id: string) {
  return client
    .query(
      `SELECT id, email, nickname, tier, locale, age_confirmed FROM users WHERE id = $1`,
      [id],
    )
    .then((r) => r.rows[0] as {
      id: string;
      email: string;
      nickname: string | null;
      tier: 'free' | 'starter' | 'pro';
      locale: string | null;
      age_confirmed: boolean;
    });
}

async function upsertByGoogle(
  client: { query: typeof query },
  opts: { googleSub: string; email: string; nickname: string | null; ageConfirmed: boolean },
) {
  // 1. Match by google_sub (the OAuth identity).
  let r = await client.query(`SELECT id FROM users WHERE google_sub = $1`, [opts.googleSub]);
  if (r.rows.length) {
    await client.query(
      `UPDATE users
          SET email = $2,
              nickname = $3,
              age_confirmed = (age_confirmed OR $4),
              status = 'active'
        WHERE id = $1`,
      [r.rows[0].id, opts.email, opts.nickname, opts.ageConfirmed],
    );
    return { user: await loadUser(client, r.rows[0].id), isNewUser: false };
  }

  // 2. Match by email (magic-link user logging in via Google).
  r = await client.query(`SELECT id FROM users WHERE email = $1`, [opts.email]);
  if (r.rows.length) {
    await client.query(
      `UPDATE users
          SET google_sub = $2,
              nickname = $3,
              age_confirmed = (age_confirmed OR $4),
              status = 'active'
        WHERE id = $1`,
      [r.rows[0].id, opts.googleSub, opts.nickname, opts.ageConfirmed],
    );
    return { user: await loadUser(client, r.rows[0].id), isNewUser: false };
  }

  // 3. Fresh registration.
  try {
    const ins = await client.query(
      `INSERT INTO users (email, google_sub, nickname, age_confirmed)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [opts.email, opts.googleSub, opts.nickname, opts.ageConfirmed],
    );
    return { user: await loadUser(client, ins.rows[0].id), isNewUser: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const bySub = await client.query(`SELECT id FROM users WHERE google_sub = $1`, [opts.googleSub]);
    if (bySub.rows.length) {
      return { user: await loadUser(client, bySub.rows[0].id), isNewUser: false };
    }
    const byEmail = await client.query(`SELECT id FROM users WHERE email = $1`, [opts.email]);
    if (byEmail.rows.length) {
      return { user: await loadUser(client, byEmail.rows[0].id), isNewUser: false };
    }
    throw err;
  }
}

async function upsertByEmail(
  client: { query: typeof query },
  opts: { email: string; nickname: string | null; ageConfirmed: boolean },
) {
  // 1. Match by email.
  const r = await client.query(`SELECT id FROM users WHERE email = $1`, [opts.email]);
  if (r.rows.length) {
    await client.query(
      `UPDATE users
          SET nickname = $2,
              age_confirmed = (age_confirmed OR $3),
              status = 'active'
        WHERE id = $1`,
      [r.rows[0].id, opts.nickname, opts.ageConfirmed],
    );
    return { user: await loadUser(client, r.rows[0].id), isNewUser: false };
  }

  // 2. Fresh registration.
  try {
    const ins = await client.query(
      `INSERT INTO users (email, nickname, age_confirmed)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [opts.email, opts.nickname, opts.ageConfirmed],
    );
    return { user: await loadUser(client, ins.rows[0].id), isNewUser: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const byEmail = await client.query(`SELECT id FROM users WHERE email = $1`, [opts.email]);
    if (byEmail.rows.length) {
      return { user: await loadUser(client, byEmail.rows[0].id), isNewUser: false };
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean((err as { code?: string })?.code === '23505');
}

// ---------------------------------------------------------------------------
// Trial credit grant — one-time per account (DB flag is the truth; Redis
// device/email markers are a fast-path anti-abuse limit).
// ---------------------------------------------------------------------------

export async function issueTrialCredits(opts: {
  userId: string;
  email?: string | null;
  deviceId?: string | null;
  client?: { query: typeof query };
}): Promise<{ granted: boolean; trialCredits: number }> {
  const doGrant = async (c: { query: typeof query }) => {
    let markerOk = true;
    try {
      const normEmail = String(opts.email || '').trim().toLowerCase();
      if (normEmail) {
        const k = `avs:trial:email:${sha256(normEmail)}`;
        if ((await redis.set(k, '1', 'EX', SESSION_TTL, 'NX')) !== 'OK') markerOk = false;
      }
      if (markerOk && opts.deviceId) {
        const k = `avs:trial:dev:${sha256(String(opts.deviceId))}`;
        if ((await redis.set(k, '1', 'EX', SESSION_TTL, 'NX')) !== 'OK') markerOk = false;
      }
    } catch {
      /* Redis down → fall through to DB-only check */
    }

    if (!markerOk) return { granted: false, trialCredits: 0 };

    const r = await c.query(
      `INSERT INTO credit_accounts (user_id, credits, trial_credits, trial_granted)
       VALUES ($1, 0, $2, true)
       ON CONFLICT (user_id) DO UPDATE SET
         trial_credits = credit_accounts.trial_credits + $2,
         trial_granted = true
       WHERE credit_accounts.trial_granted = false
       RETURNING credits, trial_credits, trial_granted`,
      [opts.userId, TRIAL_CREDITS],
    );

    // WHERE false → no row touched → rowCount 0 → already granted before.
    if (r.rowCount === 0) return { granted: false, trialCredits: 0 };

    const row = r.rows[0];
    // Append-only ledger row (credit_ledger rejects UPDATE/DELETE).
    await c.query(
      `INSERT INTO credit_ledger (user_id, kind, amount, balance_after, note)
       VALUES ($1, 'grant_trial', $2, $3, $4)`,
      [opts.userId, TRIAL_CREDITS, row.credits, 'signup trial grant'],
    );
    return { granted: true, trialCredits: TRIAL_CREDITS };
  };

  if (opts.client) return doGrant(opts.client);
  return withTransaction(doGrant);
}

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Public user entry points (login channels)
// ---------------------------------------------------------------------------

export async function ensureUserByGoogle(opts: {
  googleSub: string;
  email: string;
  nickname?: string | null;
  ageConfirmed?: boolean;
  deviceId?: string | null;
}) {
  const normalized = normalizeEmail(opts.email);
  if (!opts.googleSub || !normalized) {
    throw apiError(400, 'VALIDATION_ERROR', 'googleSub and email are required');
  }
  const age = opts.ageConfirmed === true;
  return withTransaction(async (client) => {
    const { user, isNewUser } = await upsertByGoogle(client, {
      googleSub: opts.googleSub,
      email: normalized,
      nickname: opts.nickname || null,
      ageConfirmed: age,
    });
    const trial = await issueTrialCredits({
      userId: user.id,
      email: normalized,
      deviceId: opts.deviceId,
      client,
    });
    return { user, isNewUser, trial };
  });
}

export async function ensureUserByEmail(opts: {
  email: string;
  ageConfirmed?: boolean;
  deviceId?: string | null;
}) {
  const normalized = normalizeEmail(opts.email);
  if (!normalized) {
    throw apiError(400, 'VALIDATION_ERROR', 'email is required');
  }
  const age = opts.ageConfirmed === true;
  return withTransaction(async (client) => {
    const { user, isNewUser } = await upsertByEmail(client, {
      email: normalized,
      nickname: normalized.split('@')[0] || null,
      ageConfirmed: age,
    });
    const trial = await issueTrialCredits({
      userId: user.id,
      email: normalized,
      deviceId: opts.deviceId,
      client,
    });
    return { user, isNewUser, trial };
  });
}
