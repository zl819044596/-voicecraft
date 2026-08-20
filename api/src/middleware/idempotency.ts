/**
 * 全局 Idempotency-Key 中间件（00-CONTRACT §6 / 03-接口文档 §1.3）。
 *
 *   客户端对 POST/PUT/PATCH/DELETE 携带 `Idempotency-Key: <任意字符串>`;
 *   服务端以 (user_id, method, path, key) 做 key，在 Redis 缓存首次 2xx 响应，
 *   相同 key 的重复请求直接回放缓存响应（`Idempotency-Replayed: true`）。
 *   4xx/5xx 不缓存 → 客户端修正后可安全重试。
 *
 *   Redis 不可用时降级为直通（幂等保证退化为尽力而为，不阻塞业务）。
 */

import type { RequestHandler } from 'express';
import { redis } from '../redis.js';
import { sha256 } from '../utils.js';

const PREFIX = 'avs:idem:';
const TTL = 24 * 3600; // 24h — 足够覆盖重试窗口

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface CachedEntry {
  status: number;
  body: string; // JSON string
}

export const idempotency: RequestHandler = (req, res, next) => {
  const raw = req.headers['idempotency-key'];
  if (!raw || typeof raw !== 'string' || raw.length > 64) return next();
  if (!MUTATING.has(req.method)) return next();

  const uid = req.userId ?? 'anon';
  const path = req.path;
  const redisKey = `${PREFIX}${sha256(`${uid}|${req.method}|${path}|${raw}`)}`;
  req.idempotencyKey = raw;
  res.setHeader('Idempotency-Key', raw);

  (async () => {
    try {
      const cachedRaw = await redis.get(redisKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as CachedEntry;
        req.idempotencyReplay = true;
        res.setHeader('Idempotency-Replayed', 'true');
        res.status(cached.status).type('application/json').send(cached.body);
        return;
      }
    } catch {
      /* Redis down → fall through and run the handler */
    }

    // Buffer the response body so we can cache it on finish.
    const send = res.send.bind(res);
    const json = res.json.bind(res);
    let bodyRaw: string | null = null;
    res.send = ((b: unknown) => {
      bodyRaw = typeof b === 'string' ? b : JSON.stringify(b);
      return send(b);
    }) as typeof res.send;
    res.json = ((b: unknown) => {
      bodyRaw = JSON.stringify(b);
      return json(b);
    }) as typeof res.json;

    res.on('finish', () => {
      const status = res.statusCode;
      if (status >= 200 && status < 300 && bodyRaw != null) {
        redis.set(redisKey, JSON.stringify({ status, body: bodyRaw } satisfies CachedEntry), 'EX', TTL)
          .catch(() => {});
      }
    });
    next();
  })().catch(() => next());
};
