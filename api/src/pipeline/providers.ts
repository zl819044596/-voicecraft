/**
 * 流水线 provider 解析 + 调用封装（Phase 4，TS 移植 v2 pipeline/providers.js）。
 *
 * 解析（双轨，02 架构 §6）：
 *   - managed：平台 Key 池（keypool：credentials owner_scope='platform' + platform_key_pool
 *              RPM/熔断，按 provider_class 取可用 Key，同类 Key 故障切换）。
 *   - byok   ：用户自己的 model_configs 条目（is_default → 首个 enabled），凭证解密。
 *   - MOCK_PROVIDERS=true 短路为 { mode:'mock' }（确定性伪造产物）。
 *
 * 每次调用经 api_cost_log 记一行（双轨都记；BYOK 也按真实成本估算）。
 */

import type { DB, TaskRow } from './types.js';
import { mockEnabled, generateImage, siliconflowImage, synthesizeTts, generateI2V, negativePromptCapable, type ProviderRef } from '../providers/runtime.js';
import { decryptKey } from '../crypto.js';
import { isUuid } from '../utils.js';
import { createKeyPool, type KeyPool, type PooledKey } from './keypool.js';
import type { Redis } from 'ioredis';
import { estimateCost, priceFor } from './cost.js';
import { insertCostLog } from './costlog.js';

/** 由 ctx 的 pg/redis 构造 KeyPool 适配器（步骤 runner 内使用）。 */
export function poolFrom(pg: DB, redis: Redis): KeyPool {
  return createKeyPool(pg, redis);
}

/** 生成调用上报回调：把 provider 调用结果回报给 Key 池（managed 档熔断/RPM 依据）。 */
export function makeReporter(pool: KeyPool, provider: ProviderRef): (ok: boolean, err?: unknown) => Promise<void> {
  return (ok: boolean, err?: unknown) => reportPoolOutcome(pool, provider, ok, err);
}

// ---------------------------------------------------------------------------
// BYOK model_configs 解析
// ---------------------------------------------------------------------------

interface ByokEntry {
  id: string;
  provider_class: string;
  name: string;
  credential_id: string | null;
  base_url: string | null;
  model: string | null;
  voice: string | null;
  enabled: boolean;
  is_default: boolean;
  key_ciphertext?: string | null;
  key_salt?: string | null;
  provider?: string | null;
}

/** 取用户某个 class 的生效配置（spec=显式 model_config_id，否则 is_default → 首个 enabled）。 */
async function resolveByokEntry(pg: DB, uid: string, cls: string, spec?: { model_config_id?: string } | null): Promise<ByokEntry | null> {
  if (spec?.model_config_id) {
    const { rows } = await pg.query(
      `SELECT mc.*, c.key_ciphertext, c.key_salt, c.provider
         FROM model_configs mc
         LEFT JOIN credentials c ON c.id = mc.credential_id
        WHERE mc.id = $1 AND mc.user_id = $2`,
      [spec.model_config_id, uid],
    );
    return (rows[0] as ByokEntry) || null;
  }
  const { rows } = await pg.query(
    `SELECT mc.*, c.key_ciphertext, c.key_salt, c.provider
       FROM model_configs mc
       LEFT JOIN credentials c ON c.id = mc.credential_id
      WHERE mc.user_id = $1 AND mc.provider_class = $2 AND mc.enabled = true
      ORDER BY mc.is_default DESC, mc.created_at DESC
      LIMIT 1`,
    [uid, cls],
  );
  return (rows[0] as ByokEntry) || null;
}

function pooledToRef(p: PooledKey): ProviderRef {
  return {
    mode: 'real',
    key: p.key,
    baseUrl: p.baseUrl,
    providerName: p.providerName,
    voice: p.voice,
    entryName: p.label,
    model: p.model,
    _credentialId: p.credentialId,
    // PIPELINE_TASK_45：按 model 名声明 negative_prompt 结构化能力（默认 false，wingray 未确认）。
    supportsNegativePrompt: negativePromptCapable(p.model),
  };
}

function byokToRef(entry: ByokEntry, key: string): ProviderRef {
  return {
    mode: 'real',
    key,
    baseUrl: entry.base_url,
    providerName: entry.provider || 'wingray',
    voice: entry.voice || null,
    entryName: entry.name,
    model: entry.model,
    // PIPELINE_TASK_45：按 model 名声明 negative_prompt 结构化能力（默认 false，wingray 未确认）。
    supportsNegativePrompt: negativePromptCapable(entry.model),
  };
}

/** 从 config.models[cls] 提取 model_config_id（兼容 string UUID 或 { model_config_id } 对象）。 */
function extractModelConfigId(spec: unknown): string {
  if (spec == null) return '';
  if (typeof spec === 'object') {
    const s = spec as { model_config_id?: unknown; id?: unknown };
    return String(s.model_config_id ?? s.id ?? '').trim();
  }
  return String(spec).trim();
}

// ---------------------------------------------------------------------------
// 解析入口
// ---------------------------------------------------------------------------

/**
 * 解析 (task, cls) 的 provider。pool 为平台 Key 池适配器（managed 档用；
 * mock/byok 忽略）。spec 覆盖 config 派生的配置（regenerate 显式传 model_config_id）。
 */
export async function resolveProviderFor(
  pg: DB,
  pool: KeyPool,
  task: TaskRow,
  cls: string,
  spec?: { model_config_id?: string } | null,
): Promise<ProviderRef> {
  if (mockEnabled()) return { mode: 'mock' };

  if (String(task?.track) === 'managed') {
    // 托管档：config.models 显式指定该 class 的 model_config_id 时尊重用户选择，
    // 走 BYOK 解析（解密用户凭证）；配置不可用 → 抛错，不静默回落平台池。
    // 未显式指定才回平台 Key 池兜底。
    const models = (task?.config?.models ?? {}) as Record<string, unknown>;
    const modelConfigId = extractModelConfigId(models[cls]);
    if (modelConfigId) {
      if (!isUuid(modelConfigId)) {
        throw new Error(`managed 档 ${cls} 显式指定的模型配置不可用（config.models.${cls}=${modelConfigId} 不是有效 model_configs id），请在 设置-模型配置 中修复`);
      }
      const uid = task?.owner_id || '';
      const entry = await resolveByokEntry(pg, uid, cls, { model_config_id: modelConfigId });
      if (!entry || !entry.credential_id || !entry.key_ciphertext || !entry.key_salt) {
        throw new Error(`managed 档 ${cls} 显式指定的模型配置不可用（model_configs ${modelConfigId} 缺失或未绑定完整凭证），请在 设置-模型配置 中修复`);
      }
      let key: string;
      try {
        key = decryptKey(entry.key_ciphertext, entry.key_salt);
      } catch {
        throw new Error(`managed ${cls} key 解密失败（ENC_KEY 更换？请重新配置 Key）`);
      }
      return byokToRef(entry, key);
    }

    const pooled = await pool.acquire(cls);
    if (!pooled) {
      throw new Error(`managed 档缺少可用的平台 Key（${cls}：未配置或全部限流/熔断）`);
    }
    return pooledToRef(pooled);
  }

  const uid = task?.owner_id || '';
  const entry = await resolveByokEntry(pg, uid, cls, spec);
  if (!entry) {
    throw new Error(`BYOK 档缺少 ${cls} 模型配置（请在 设置-模型配置 中为 ${cls} 配置可用 Key）`);
  }
  if (!entry.credential_id || !entry.key_ciphertext || !entry.key_salt) {
    throw new Error(`BYOK ${cls} 配置未绑定凭证（model_configs ${entry.id} 缺少 credential_id）`);
  }
  let key: string;
  try {
    key = decryptKey(entry.key_ciphertext, entry.key_salt);
  } catch {
    throw new Error(`BYOK ${cls} key 解密失败（ENC_KEY 更换？请重新配置 Key）`);
  }
  return byokToRef(entry, key);
}

// ---------------------------------------------------------------------------
// 调用封装（cost 记录 + managed Key 池成功/失败上报）
// ---------------------------------------------------------------------------

async function logCall(
  pg: DB,
  task: TaskRow,
  cls: string,
  provider: ProviderRef,
  model: string | null,
  units: number,
  unitPrice: number | null,
  cost: number | null,
): Promise<void> {
  await insertCostLog(pg, {
    taskId: task?.id,
    step: Number(task?.step || 1),
    track: task?.track || 'byok',
    provider: provider?.providerName || (provider?.mode === 'mock' ? 'mock' : cls),
    model: model || null,
    units,
    unitPriceUsd: unitPrice,
    costUsd: cost,
  });
}

/** 上报 Key 池结果：成功 → 熔断器回 closed；失败 → 计数（达阈值熔断）。 */
export async function reportPoolOutcome(pool: KeyPool, provider: ProviderRef, ok: boolean, err?: unknown): Promise<void> {
  const credentialId = provider?._credentialId;
  if (!credentialId) return;
  try {
    if (ok) await pool.success(credentialId);
    else await pool.failure(credentialId, err);
  } catch {
    /* best-effort */
  }
}

export interface ImageCallOpts {
  pg: DB;
  task: TaskRow;
  provider: ProviderRef;
  prompt: string;
  size?: string;
  variant?: number;
  report?: (ok: boolean, err?: unknown) => Promise<void>;
  /** PIPELINE_TASK_45 负面词：provider 支持 negative_prompt 字段 → 结构化传入；
   *  否则注入正面 prompt 尾部（"Avoid: ..."），由模板正文约束兜底。 */
  negativePrompt?: string;
  /** PIPELINE_TASK_47：固定 seed（同任务全镜头同值），透传到 wingray parameters.seed。 */
  seed?: number;
}

export async function callImage(opts: ImageCallOpts): Promise<Buffer> {
  const { pg, task, provider } = opts;
  const model = provider?.model || null;
  let buf: Buffer;
  const baseUrl = provider?.baseUrl || '';
  // PIPELINE_TASK_50：SiliconFlow 同步生图通道分发（baseUrl 判定；否则走 generateImage/wingray 不变）。
  const isSiliconflow = !!(provider && provider.mode === 'real' && baseUrl.includes('siliconflow.cn'));
  // 适配层（不改生图主流程/重试逻辑）：SiliconFlow 原生支持 negative_prompt 结构化字段
  // → 结构化传入；其余仅当 provider 声明 supportsNegativePrompt 时结构化，否则负面词注入 prompt 尾部。
  const structured = isSiliconflow || !!(provider?.supportsNegativePrompt && opts.negativePrompt);
  const prompt = !structured && opts.negativePrompt ? `${opts.prompt}\n\nAvoid: ${opts.negativePrompt}` : opts.prompt;
  try {
    if (isSiliconflow) {
      buf = await siliconflowImage({
        key: provider.key!,
        prompt,
        model,
        baseUrl,
        size: opts.size,
        negativePrompt: structured ? opts.negativePrompt : undefined,
        seed: opts.seed,
      });
    } else {
      buf = await generateImage({
        provider,
        prompt,
        size: opts.size,
        variant: opts.variant,
        model,
        negativePrompt: structured ? opts.negativePrompt : undefined,
        seed: opts.seed,
      });
    }
  } catch (err) {
    await opts.report?.(false, err);
    throw err;
  }
  await opts.report?.(true);
  await logCall(pg, task, 'image', provider, model, 1, priceFor('image'), estimateCost('image', 1));
  return buf;
}

export interface TtsCallOpts {
  pg: DB;
  task: TaskRow;
  provider: ProviderRef;
  voice?: string | null;
  text: string;
  speed?: number;
  volume?: number;
  report?: (ok: boolean, err?: unknown) => Promise<void>;
}

export async function callTTS(opts: TtsCallOpts): Promise<Buffer> {
  const { pg, task, provider } = opts;
  const model = provider?.model || null;
  const voice = provider?.mode === 'mock' ? opts.voice : provider?.voice || opts.voice || null;
  let buf: Buffer;
  try {
    buf = await synthesizeTts({ provider, voice, text: opts.text, model, speed: opts.speed, volume: opts.volume });
  } catch (err) {
    await opts.report?.(false, err);
    throw err;
  }
  await opts.report?.(true);
  const chars = String(opts.text || '').length;
  await logCall(pg, task, 'tts', provider, model, chars, priceFor('tts'), estimateCost('tts', chars));
  return buf;
}

export interface I2VCallOpts {
  pg: DB;
  task: TaskRow;
  provider: ProviderRef;
  imageBuffer: Buffer;
  text: string;
  report?: (ok: boolean, err?: unknown) => Promise<void>;
}

export async function callI2V(opts: I2VCallOpts): Promise<Buffer> {
  const { pg, task, provider } = opts;
  const model = provider?.model || null;
  let buf: Buffer;
  try {
    buf = await generateI2V({ provider, imageBuffer: opts.imageBuffer, text: opts.text, model });
  } catch (err) {
    await opts.report?.(false, err);
    throw err;
  }
  await opts.report?.(true);
  const seconds = 5;
  await logCall(pg, task, 'i2v', provider, model, seconds, priceFor('i2v'), estimateCost('i2v', seconds));
  return buf;
}
