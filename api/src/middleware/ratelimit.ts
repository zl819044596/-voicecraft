/**
 * Redis 滑动窗口限流（03-接口文档 §1.5 / 00-CONTRACT §C14）：
 *   - 登录态用户：60 req/min（keyed by user_id）
 *   - 匿名：10 req/min/IP
 *   - report-abuse：10 req/min（user_id + IP）
 *
 * 响应头 X-RateLimit-* + Retry-After；超限 429 `{ error: { code: 'RATE_LIMITED' } }`。
 * Redis 不可用 → 直通（不因限流系统故障阻断业务）。
 */

import type { Request, RequestHandler } from 'express';
import { redis } from '../redis.js';
import { clientIp, randomToken } from '../utils.js';

interface WindowOpts {
  prefix: string;
  limit: number;
  windowMs: number;
  keyFn: (req: Request) => string;
}

function slidingWindow(opts: WindowOpts): RequestHandler {
  return (req, res, next) => {
    const member = `${Date.now()}:${randomToken(4)}`;
    const rkey = `${opts.prefix}${opts.keyFn(req)}`;
    const windowStart = Date.now() - opts.windowMs;

    (async () => {
      try {
        const pipe = redis.multi();
        pipe.zremrangebyscore(rkey, 0, windowStart);
        pipe.zadd(rkey, Date.now(), member);
        pipe.zcard(rkey);
        pipe.pexpire(rkey, opts.windowMs);
        const results = await pipe.exec();
        const count = Number(results?.[2]?.[1] ?? 0);

        res.setHeader('X-RateLimit-Limit', String(opts.limit));
        if (count > opts.limit) {
          await redis.zrem(rkey, member).catch(() => {});
          const retryAfter = Math.ceil(opts.windowMs / 1000);
          res.setHeader('X-RateLimit-Remaining', '0');
          res.setHeader('Retry-After', String(retryAfter));
          res.status(429).json({
            error: {
              code: 'RATE_LIMITED',
              message: 'Rate limit exceeded',
              details: { retryAfter },
            },
          });
          return;
        }
        res.setHeader('X-RateLimit-Remaining', String(opts.limit - count));
        next();
      } catch {
        next(); // Redis down → allow
      }
    })().catch(() => next());
  };
}

/** 全局限流：登录态按用户，匿名按 IP。 */
export const globalRateLimit: RequestHandler = (req, res, next) => {
  // Webhook 已由签名验真（401 INVALID_SIGNATURE），不再叠加匿名 IP 限流，
  // 避免支付服务商重投被 429 丢弃。仅豁免 /api/webhooks 路径。
  if (req.path.startsWith('/api/webhooks/') || req.path.startsWith('/webhooks/')) {
    return next();
  }
  if (req.userId) {
    return slidingWindow({
      prefix: 'avs:rl:u:',
      limit: 60,
      windowMs: 60_000,
      keyFn: (r) => String(r.userId),
    })(req, res, next);
  }
  return slidingWindow({
    prefix: 'avs:rl:ip:',
    limit: 10,
    windowMs: 60_000,
    keyFn: (r) => clientIp(r),
  })(req, res, next);
};

/** 举报滥用：10 req/min（user + IP）。 */
export const reportAbuseRateLimit = slidingWindow({
  prefix: 'avs:rl:abuse:',
  limit: 10,
  windowMs: 60_000,
  keyFn: (req) => `${req.userId ?? 'anon'}|${clientIp(req)}`,
});

/** 魔法链接邮件：每个 email 10 req/min。 */
export const magicLinkRateLimit = slidingWindow({
  prefix: 'avs:rl:ml:',
  limit: 10,
  windowMs: 60_000,
  keyFn: (req) => String(req.body?.email ?? 'unknown').toLowerCase(),
});
