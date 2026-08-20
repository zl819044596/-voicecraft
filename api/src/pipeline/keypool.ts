/**
 * 平台 Key 池（Phase 4，C2 / 02 架构 §6.3）。
 *
 * 托管档从 credentials(owner_scope='platform') 读取平台 Key，运行态记录在
 * platform_key_pool（RPM 限额 + 熔断器）。实时计数放 Redis avs:rpm:*，表为持久快照。
 *
 * 选择逻辑：同一 provider_class 的可用 Key 中，跳过 open 熔断 + RPM 已达上限的，
 * 按 created_at DESC 取第一个可用；同类 Key 故障切换（报告失败 → 计数 → 熔断）。
 *
 * 熔断器：closed → open（失败阈值）→ half_open（冷却期后允许 1 次试探）→
 *         试探成功回 closed / 失败回 open。
 */

import type { DB } from './types.js';
import type { Redis } from 'ioredis';
import { decryptKey } from '../crypto.js';

const FAIL_THRESHOLD = 5; // 同 Key 窗口内失败次数 ≥ 5 → open
const FAIL_TTL_SEC = 60; // 失败计数窗口
const CB_COOLDOWN_MS = 30_000; // open 后冷却 30s 进入 half_open

export interface PooledKey {
  credentialId: string;
  key: string;
  baseUrl: string | null;
  providerName: string | null;
  label: string | null;
  model: string | null;
  voice: string | null;
  rpmLimit: number;
}

interface PoolRow {
  credential_id: string;
  key_ciphertext: string;
  key_salt: string;
  base_url: string | null;
  provider: string | null;
  label: string | null;
  rpm_limit: number;
  circuit_status: 'closed' | 'open' | 'half_open';
  last_error: string | null;
}

const rpmKey = (credentialId: string) => `avs:rpm:${credentialId}`;
const failKey = (credentialId: string) => `avs:rpm:${credentialId}:fail`;
const openAtKey = (credentialId: string) => `avs:rpm:${credentialId}:open_at`;

// ---------------------------------------------------------------------------
// RPM 固定窗口令牌桶：avs:rpm:<id> 计数器，窗口 60s，限额 rpm_limit。
// ---------------------------------------------------------------------------

async function rpmAllows(redis: Redis, credentialId: string, rpmLimit: number): Promise<boolean> {
  try {
    const key = rpmKey(credentialId);
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 60);
    return n <= rpmLimit;
  } catch {
    // Redis 抖动 → 放行（限流是软约束，不能因 Redis 挂了阻塞流水线）。
    return true;
  }
}

async function resetFailures(redis: Redis, credentialId: string): Promise<void> {
  try {
    await redis.del(failKey(credentialId));
    await redis.del(openAtKey(credentialId));
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// 熔断器状态
// ---------------------------------------------------------------------------

/** 冷却期已过 → 允许试探（half_open）。 */
async function transitionOpenToHalfOpen(pg: DB, credentialId: string): Promise<void> {
  try {
    await pg.query(`UPDATE platform_key_pool SET circuit_status = 'half_open', updated_at = now() WHERE credential_id = $1`, [
      credentialId,
    ]);
  } catch {
    /* best-effort */
  }
}

/** 试探成功 → 回 closed 并清失败计数。 */
export async function reportKeySuccess(pg: DB, redis: Redis, credentialId: string): Promise<void> {
  await resetFailures(redis, credentialId);
  try {
    await pg.query(
      `UPDATE platform_key_pool
          SET circuit_status = 'closed', last_error = NULL, updated_at = now()
        WHERE credential_id = $1 AND circuit_status <> 'closed'`,
      [credentialId],
    );
  } catch {
    /* best-effort */
  }
}

/** 调用失败 → 计数；达阈值 → open（last_error 落库，不落 Key/用户内容）。 */
export async function reportKeyFailure(pg: DB, redis: Redis, credentialId: string, error: unknown): Promise<void> {
  const summary = String(error instanceof Error ? error.message : error).slice(0, 300);
  try {
    const n = await redis.incr(failKey(credentialId));
    if (n === 1) await redis.expire(failKey(credentialId), FAIL_TTL_SEC);
    if (n >= FAIL_THRESHOLD) {
      await redis.set(openAtKey(credentialId), String(Date.now()), 'EX', Math.ceil(CB_COOLDOWN_MS / 1000) + 60);
      await pg.query(
        `UPDATE platform_key_pool
            SET circuit_status = 'open', last_error = $2, updated_at = now()
          WHERE credential_id = $1`,
        [credentialId, summary],
      );
    }
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// 选择：返回该 class 的一个可用平台 Key（无可用 → null）。
// ---------------------------------------------------------------------------

async function loadPoolRows(pg: DB, cls: string): Promise<PoolRow[]> {
  const { rows } = await pg.query(
    `SELECT pkp.credential_id, pkp.rpm_limit, pkp.circuit_status, pkp.last_error,
            c.key_ciphertext, c.key_salt, c.base_url, c.provider, c.label
       FROM platform_key_pool pkp
       JOIN credentials c ON c.id = pkp.credential_id
      WHERE pkp.provider_class = $1
        AND c.owner_scope = 'platform'
        AND c.status = 'active'
      ORDER BY pkp.circuit_status, c.created_at DESC`,
    [cls],
  );
  return rows as PoolRow[];
}

export async function acquirePlatformKey(pg: DB, redis: Redis, cls: string): Promise<PooledKey | null> {
  const rows = await loadPoolRows(pg, cls);
  if (rows.length === 0) return null;

  for (const row of rows) {
    // 熔断：open 且冷却期未过 → 跳过；冷却期已过 → 转 half_open 并允许这次试探。
    if (row.circuit_status === 'open') {
      try {
        const openedAt = Number(await redis.get(openAtKey(row.credential_id))) || 0;
        const elapsed = Date.now() - openedAt;
        if (elapsed < CB_COOLDOWN_MS) continue;
        await transitionOpenToHalfOpen(pg, row.credential_id);
      } catch {
        continue;
      }
    }
    if (!(await rpmAllows(redis, row.credential_id, row.rpm_limit))) continue;

    let key: string;
    try {
      key = decryptKey(row.key_ciphertext, row.key_salt);
    } catch {
      console.warn(`[keypool] decrypt failed for platform key ${row.credential_id} — skipping`);
      continue;
    }
    return {
      credentialId: row.credential_id,
      key,
      baseUrl: row.base_url,
      providerName: row.provider || 'wingray',
      label: row.label,
      // 平台 Key 不携带 model/voice（04 §2.2/§2.4 无此列）；托管档默认模型
      // 由 providers/runtime 按类兜底（LLM_MODEL / IMAGE_MODEL / TTS_MODEL / I2V_MODEL）。
      model: null,
      voice: null,
      rpmLimit: row.rpm_limit,
    };
  }
  console.warn(`[keypool] no available platform key for class '${cls}' (${rows.length} candidate(s) exhausted)`);
  return null;
}

// ---------------------------------------------------------------------------
// KeyPool 适配器（providers.ts 使用）：acquire / success / failure 三方法。
// ---------------------------------------------------------------------------

export interface KeyPool {
  acquire(cls: string): Promise<PooledKey | null>;
  success(credentialId: string): Promise<void>;
  failure(credentialId: string, error: unknown): Promise<void>;
}

export function createKeyPool(pg: DB, redis: Redis): KeyPool {
  return {
    acquire: (cls: string) => acquirePlatformKey(pg, redis, cls),
    success: (id: string) => reportKeySuccess(pg, redis, id),
    failure: (id: string, err: unknown) => reportKeyFailure(pg, redis, id, err),
  };
}
