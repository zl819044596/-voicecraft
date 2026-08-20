/**
 * Magic-link 邮箱认证（Phase 2）。TS 移植 v2 验证实现。
 *
 *   POST /api/auth/magic-link        → request() 铸造一次性 token
 *   POST /api/auth/magic-link/verify → verify() 消费它
 *
 * 存储：Redis。原始 token 永不落库，只存 SHA-256 哈希（Redis 倾倒也无法重放）。
 *   avs:magic:<sha256(token)>   载荷，TTL 900s（契约 expires_in）
 *   avs:magic:used:<sha256>     已消费墓碑，TTL 30min（防重放）
 *   avs:rl:magic:email:<hash>   每邮箱 1 req/60s
 *   avs:rl:magic:ip:<ip>        每 IP 10 req/60s
 *
 * 邮件器为可注入 seam：SMTP env → 真实 Nodemailer；否则 dev 控制台回显链接
 * （本地验证无需 SMTP）。
 */

import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { redis } from './redis.js';
import { config } from './config.js';

const nodeRequire = createRequire(import.meta.url);

export const TOKEN_TTL = 900; // seconds — 契约 `expires_in: 900`
const USED_TOMBSTONE_TTL = 1800; // seconds
const EMAIL_LIMIT_WINDOW = 60; // seconds
const EMAIL_MAX_PER_WINDOW = 1;
const IP_LIMIT_WINDOW = 60; // seconds
const IP_MAX_PER_WINDOW = 10;
const TOKEN_RE = /^ml_[a-f0-9]{64}$/;

function sha256(input: string): string {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

interface MagicLinkError extends Error {
  code: string;
  retryAfter?: number;
}

function magicError(code: string, message: string, retryAfter?: number): MagicLinkError {
  const err = new Error(message) as MagicLinkError;
  err.code = code;
  err.retryAfter = retryAfter;
  return err;
}

export interface MagicMailer {
  send: (opts: { to: string; token: string }) => Promise<void>;
}

// Dev sink：打印验证链接 + 可粘贴 curl（本地/CI 无需 SMTP）。
function devMailer(): MagicMailer {
  return {
    send: async ({ to, token }) => {
      console.log(
        `[magic-link] DEV magic link for ${to}, expires in ${TOKEN_TTL}s: token=${token}`,
      );
      console.log(
        `[magic-link]   curl -X POST localhost:4000/api/auth/magic-link/verify ` +
          `-H 'Content-Type: application/json' -d '{"token":"${token}"}'`,
      );
    },
  };
}

// SMTP transport — 仅当 env 完整且 nodemailer 可加载时启用（lazy require）。
function smtpMailer(): MagicMailer | null {
  const { smtp } = config;
  if (!smtp.host) return null;
  let nodemailer: typeof import('nodemailer') | null = null;
  try {
    // ESM 下无全局 require —— 用 createRequire(import.meta.url) 惰性加载。
    nodemailer = nodeRequire('nodemailer');
  } catch {
    return null;
  }
  if (!nodemailer) return null;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  const loginUrl = `${config.siteUrl}/login?token=`;
  return {
    send: async ({ to, token }) => {
      await transporter.sendMail({
        from: smtp.from || 'AI Video Studio <no-reply@localhost>',
        to,
        subject: 'Your AI Video Studio login link',
        text:
          `Sign in to AI Video Studio with this one-time link ` +
          `(valid for ${TOKEN_TTL / 60} minutes):\n\n` +
          `${loginUrl}${token}\n\n` +
          `If you did not request this, you can safely ignore this email.`,
        html:
          `<p>Sign in to <strong>AI Video Studio</strong> with this one-time link ` +
          `(valid for ${TOKEN_TTL / 60} minutes):</p>` +
          `<p><a href="${loginUrl}${token}">Log in</a></p>` +
          `<p>If you did not request this, you can safely ignore this email.</p>`,
      });
    },
  };
}

export function createMailer(): MagicMailer {
  if (config.smtp.host) {
    const real = smtpMailer();
    if (real) return real;
    console.log('[magic-link] SMTP_HOST set but nodemailer unavailable — using DEV mailer');
  }
  return devMailer();
}

export function createMagicLink(mailer: MagicMailer) {
  async function request(opts: { email: string; ageConfirmed?: boolean; ip?: string }) {
    const normEmail = String(opts.email || '').trim().toLowerCase();
    if (!normEmail) throw magicError('INVALID', 'Invalid email address');

    // 每邮箱节流：60s 内 1 次。
    const emailKey = `avs:rl:magic:email:${sha256(normEmail)}`;
    const emailCount = await redis.incr(emailKey);
    if (emailCount === 1) await redis.expire(emailKey, EMAIL_LIMIT_WINDOW);
    if (emailCount > EMAIL_MAX_PER_WINDOW) {
      const ttl = await redis.ttl(emailKey).catch(() => EMAIL_LIMIT_WINDOW);
      throw magicError('EMAIL_RATE', 'Too many requests, please retry later', Math.max(ttl, 1));
    }

    // 每 IP 节流：60s 内 10 次。
    const ipKey = `avs:rl:magic:ip:${String(opts.ip || 'unknown')}`;
    const ipCount = await redis.incr(ipKey);
    if (ipCount === 1) await redis.expire(ipKey, IP_LIMIT_WINDOW);
    if (ipCount > IP_MAX_PER_WINDOW) {
      const ttl = await redis.ttl(ipKey).catch(() => IP_LIMIT_WINDOW);
      throw magicError('IP_RATE', 'Too many requests, please retry later', Math.max(ttl, 1));
    }

    const token = `ml_${crypto.randomBytes(32).toString('hex')}`;
    const payload = JSON.stringify({
      email: normEmail,
      ageConfirmed: opts.ageConfirmed === true,
      createdAt: Date.now(),
    });
    await redis.set(`avs:magic:${sha256(token)}`, payload, 'EX', TOKEN_TTL);

    await mailer.send({ to: normEmail, token });
    return { sent: true, expiresIn: TOKEN_TTL };
  }

  async function verify(token: string) {
    const raw = String(token || '');
    if (!TOKEN_RE.test(raw)) throw magicError('INVALID', 'Invalid magic link token');
    const hash = sha256(raw);

    const used = await redis.exists(`avs:magic:used:${hash}`);
    if (used) throw magicError('REUSED', 'Magic link token already used');

    // 原子消费：并发 verify 只有一个拿到载荷。
    const payload = await redis.getdel(`avs:magic:${hash}`);
    if (!payload) {
      const usedNow = await redis.exists(`avs:magic:used:${hash}`);
      if (usedNow) throw magicError('REUSED', 'Magic link token already used');
      throw magicError('EXPIRED', 'Magic link has expired');
    }

    await redis.set(`avs:magic:used:${hash}`, '1', 'EX', USED_TOMBSTONE_TTL);

    let data: { email?: string; ageConfirmed?: boolean };
    try {
      data = JSON.parse(payload);
    } catch {
      throw magicError('INVALID', 'Invalid magic link token');
    }
    if (!data || !data.email) throw magicError('INVALID', 'Invalid magic link token');
    return { email: data.email, ageConfirmed: data.ageConfirmed === true };
  }

  return { request, verify };
}
