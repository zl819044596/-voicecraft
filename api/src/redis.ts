/**
 * Redis singleton (ioredis). Queues, sessions, rate limits, key-pool RPM
 * counters, webhook/trial/GDPR locks all live here (04-数据库文档 §3).
 */

import { Redis } from 'ioredis';
import { config } from './config.js';

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  maxRetriesPerRequest: 2,
  lazyConnect: true,
});

// 必须有 error 监听，否则连接失败会触发未捕获的 'error' 事件（进程崩溃风险）。
redis.on('error', (err) => {
  if (redis.status !== 'wait') {
    console.warn(`[redis] ${err instanceof Error ? err.message : String(err)}`);
  }
});

export async function pingRedis(): Promise<boolean> {
  try {
    if (redis.status === 'wait') await redis.connect();
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Distributed lock helper (used for webhook events, GDPR, trial markers)
// ---------------------------------------------------------------------------

/** NX-style lock with TTL. Returns a release function or null if not acquired. */
export async function acquireLock(key: string, ttlSeconds: number): Promise<(() => Promise<void>) | null> {
  const ok = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
  if (ok !== 'OK') return null;
  return async () => {
    await redis.del(key).catch(() => {});
  };
}
