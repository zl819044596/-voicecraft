/**
 * 流水线 LLM 封装（Phase 4，TS 移植 v2 pipeline/llm.js）。
 *
 * chatJson 走 06 §9.4 的三级业务重试阶梯：
 *   1. 原始 prompt（STEP_PARAMS 参数）
 *   2. 相同 prompt，SYS 末尾追加 RETRY_HINT
 *   3. P-FIX 自动修复调用（temperature=0.0，max_tokens 扩容，喂 broken output）
 *   4. 调用方 degrade() 兜底（标记 degraded:true）
 *
 * 每次真实调用经 costlog 记一行 api_cost_log（mock 也用 usageRef 回填估算）。
 */

import { chatCompletion, type ChatOpts, type ProviderRef, type Usage } from '../providers/runtime.js';
import { RETRY_HINT, P_FIX_ZH, P_FIX_EN, TARGET_SCHEMAS, renderPrompt, escapeTripleQuoted, promptOverride } from './prompts.js';
import { estimateCost, priceFor, unitsPayload } from './cost.js';
import { insertCostLog } from './costlog.js';
import type { DB, TaskRow } from './types.js';

const contentLang = (task: TaskRow): 'en' | 'zh' =>
  String(task?.config?.content_language || 'zh') === 'en' ? 'en' : 'zh';

/** schema 里的类型标注词（非字段名）。 */
const SCHEMA_TYPE_WORDS = new Set(['string', 'number', 'boolean']);

/** 从 TARGET_SCHEMAS 文本提取顶层必填字段：去掉 [...] 数组块（内嵌字段不校验），
 *  去掉 "string"/"number"/boolean 类型标注（历史 bug：把类型词当字段名导致
 *  所有正常输出校验失败 → 全步骤误降级，2026-08-13 修复）。 */
function topLevelFields(schema: string): string[] {
  const cleaned = schema.replace(/\[[\s\S]*?\]/g, '[]');
  return [...cleaned.matchAll(/"(\w+)"/g)].map((m) => m[1]).filter((k) => !SCHEMA_TYPE_WORDS.has(k));
}

/** 按 TARGET_SCHEMAS 字符串做顶层字段存在性校验（深度内容由步骤自校验）。 */
export function validateShape(schemaKey: string, obj: unknown): { ok: boolean; error?: string } {
  const schema = TARGET_SCHEMAS[schemaKey];
  if (!schema) return { ok: true };
  const required = topLevelFields(schema);
  const o = (obj ?? {}) as Record<string, unknown>;
  const missing = required.filter((k) => o[k] === undefined || o[k] === null);
  if (missing.length > 0) return { ok: false, error: `missing fields: ${missing.join(', ')}` };
  return { ok: true };
}

interface ChatJsonOpts {
  pg: DB;
  task: TaskRow;
  provider: ProviderRef;
  sysPrompt?: string;
  usrPrompt?: string;
  mockKey?: string | null;
  params?: { temperature?: number; maxTokens?: number; json?: boolean };
  model?: string | null;
  schemaKey?: string;
  messages?: Array<{ role: string; content: string }>;
  degrade?: (lastErr: Error | null) => Promise<unknown> | unknown;
  /** 毫秒时间戳；透传 chatCompletion，超过则不再发起/重试。 */
  deadlineAt?: number;
}

async function callOnce(opts: ChatJsonOpts): Promise<unknown> {
  const { pg, task, provider, mockKey, params, model } = opts;
  const msgs =
    opts.messages ||
    ([
      { role: 'system', content: opts.sysPrompt },
      { role: 'user', content: opts.usrPrompt },
    ].filter((m) => m.content !== undefined && m.content !== null) as Array<{ role: string; content: string }>);
  const usageRef: Partial<Usage> = {};
  const out = await chatCompletion({
    provider,
    model: model || provider?.model || null,
    messages: msgs,
    json: !!(params && params.json),
    mockKey: mockKey ?? undefined,
    usageRef,
    deadlineAt: opts.deadlineAt,
  });
  const track = String(task?.track || 'byok');
  const step = Number(task?.step || 1);
  await insertCostLog(pg, {
    taskId: task?.id,
    step,
    track,
    provider: provider?.providerName || (provider?.mode === 'mock' ? 'mock' : 'llm'),
    model: model || provider?.model || null,
    units: unitsPayload('llm', usageRef as Usage),
    unitPriceUsd: priceFor('llm'),
    costUsd: estimateCost('llm', usageRef as Usage),
  });
  return out;
}

function parseJson(out: unknown, schemaKey: string | undefined): unknown {
  const obj = typeof out === 'string' ? JSON.parse(out) : out;
  if (schemaKey) {
    const shape = validateShape(schemaKey, obj);
    if (!shape.ok) throw new Error(`shape: ${shape.error}`);
  }
  return obj;
}

/** chatJson 单步总预算：超过直接 degrade，避免 chatCompletion×chatJson 重试风暴（最坏 ~18min）。 */
const STEP_LLM_BUDGET_MS = 180_000;

/** chatJson — 完整重试阶梯。返回 { ...obj, degraded? }。 */
export async function chatJson(opts: ChatJsonOpts): Promise<Record<string, unknown>> {
  const { pg, task, provider, sysPrompt, usrPrompt, mockKey, params, model, schemaKey, degrade } = opts;
  const lang = contentLang(task);
  const startedAt = Date.now();
  const deadlineAt = startedAt + STEP_LLM_BUDGET_MS; // 沿用 TASK_23 的 180_000，让预算成为硬性上限
  const overBudget = () => Date.now() - startedAt > STEP_LLM_BUDGET_MS;

  let lastErr: Error | null = null;
  let lastOut: unknown = null;

  // attempt 1 — 原始 prompt
  if (!overBudget()) {
    try {
      const out = await callOnce({ ...opts, deadlineAt });
      lastOut = out;
      if (params && params.json) return parseJson(out, schemaKey) as Record<string, unknown>;
      // 非 json 模式（wingray json_object 不可靠）：模型按 prompt 仍会输出 JSON 文本——尝试提取
      if (typeof out === 'string' && out.trim().length > 0) {
        try {
          return parseJson(out, schemaKey) as Record<string, unknown>;
        } catch {
          return out as unknown as Record<string, unknown>;
        }
      }
      return out as Record<string, unknown>;
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[llm] chatJson ${opts.schemaKey ?? ''} attempt 1 failed: ${(err as Error).message}`);
    }
  }

  // attempt 2 — RETRY_HINT 追加
  if (!overBudget()) {
    try {
      const hint = renderPrompt(RETRY_HINT, { error: String(lastErr?.message || lastErr).slice(0, 500) });
      const out = await callOnce({
        pg,
        task,
        provider,
        sysPrompt: `${sysPrompt}\n\n${hint}`,
        usrPrompt,
        mockKey,
        params,
        model,
        schemaKey,
        deadlineAt,
      });
      lastOut = out;
      if (params && params.json) return parseJson(out, schemaKey) as Record<string, unknown>;
      return out as Record<string, unknown>;
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[llm] chatJson ${opts.schemaKey ?? ''} attempt 2 failed: ${(err as Error).message}`);
    }
  }

  // attempt 3 — P-FIX 修复调用
  if (!overBudget()) {
    try {
      const fixTemplate = lang === 'en' ? P_FIX_EN : P_FIX_ZH;
      const fixContent = renderPrompt(fixTemplate, {
        target_schema: TARGET_SCHEMAS[schemaKey || ''] || '',
        broken_output: escapeTripleQuoted(typeof lastOut === 'string' ? lastOut : JSON.stringify(lastOut || '')),
        parse_error: String(lastErr?.message || lastErr).slice(0, 500),
      });
      const out = await callOnce({
        pg,
        task,
        provider,
        messages: [{ role: 'user', content: fixContent }],
        mockKey,
        params: { json: !!(params && params.json), temperature: 0.0, maxTokens: (params?.maxTokens || 2000) + 500 },
        model,
        schemaKey,
        deadlineAt,
      });
      if (params && params.json) return parseJson(out, schemaKey) as Record<string, unknown>;
      if (typeof out === 'string' && out.trim().length > 0) {
        try {
          return parseJson(out, schemaKey) as Record<string, unknown>;
        } catch {
          return out as unknown as Record<string, unknown>;
        }
      }
      return out as Record<string, unknown>;
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[llm] chatJson ${opts.schemaKey ?? ''} attempt 3 failed: ${(err as Error).message}`);
    }
  }

  // Final — 调用方 degrade 兜底
  if (typeof degrade === 'function') {
    const fallback = await degrade(lastErr);
    if (fallback && typeof fallback === 'object') (fallback as Record<string, unknown>).degraded = true;
    return (fallback ?? {}) as Record<string, unknown>;
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// 系统提示词解析（06 §0.3 三级覆盖）
// ---------------------------------------------------------------------------

// 整段替换 SYS 的步骤类型（其余步骤的覆盖为 {{custom_prompt}} 注入，见各步骤）。
// l2 增加 '文案模板'：prompts 表 type='文案模板'（或 config.prompts['文案模板']）
// 的模板完全替换 P_L2_SYS_ZH/EN；用户文案内容仍经 {{custom_prompt}} 注入（见 l2.ts）。
const FULL_REPLACE_TYPES: Record<string, string[]> = {
  l1: ['script'],
  l2: ['script'],
  l3: ['storyboard'],
  l15: ['compliance'],
};

/** 返回该步骤生效的 SYS（整段替换类型命中 config 覆盖时用覆盖全文，否则系统默认）。 */
export async function effectiveSysPrompt(
  pg: DB,
  task: TaskRow,
  step: string,
  fallbackZh: string,
  fallbackEn: string,
): Promise<string> {
  const lang = contentLang(task);
  const overrideTypes = FULL_REPLACE_TYPES[step] || [];
  for (const type of overrideTypes) {
    const override = await promptOverride(pg, task?.config, type);
    if (override) return override;
    // 无任务快照时回退：用户启用的默认模板（type + enabled，user 优先）
    if (pg) {
      try {
        const { rows } = await pg.query(
          `SELECT body FROM prompts WHERE type = $1 AND enabled = true
           ORDER BY (user_id = $2) DESC NULLS LAST, is_default DESC, created_at DESC LIMIT 1`,
          [type, task?.owner_id ?? null],
        );
        if (rows.length > 0 && rows[0].body && rows[0].body.trim()) {
          return (rows[0].body as string).trim();
        }
      } catch {
        // DB 查询失败静默回退代码内置模板
      }
    }
  }
  return lang === 'en' ? fallbackEn : fallbackZh;
}

/** 步骤 {{custom_prompt}} 注入内容：config.prompts[type] → templates[type] → config.custom_prompt。 */
export async function customPromptFor(pg: DB, task: TaskRow, type: string): Promise<string> {
  const override = await promptOverride(pg, task?.config, type);
  if (override) return override;
  return String(task?.config?.custom_prompt || '');
}

export { contentLang };
