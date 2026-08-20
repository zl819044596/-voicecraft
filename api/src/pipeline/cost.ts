/**
 * 成本核算（Phase 4，TS 移植 v2 pipeline/cost.js）。
 * 单价来自 docs/05-模型接入清单 §价格表（2026-08-08 实测）。
 *   llm  : token（input/output 分价）
 *   image: 张
 *   tts  : 字符
 *   i2v  : 秒
 *
 * PIPELINE_TASK_41（2026-08-17）：i2v 已下线，流水线不再产生 i2v 成本。
 * 静态流程成本 = llm（L1/L2/L3/L9 文案·分镜·复检）+ image（L4 逐镜）
 *              + tts（L6 配音）三项，估算逻辑保持正确。i2v 单价保留
 *              供历史 api_cost_log 行回显，不再被新任务调用。
 */

export const PRICES = {
  llm_in: { unit: 'token', pricePerUnit: 0.14e-6 },
  llm_out: { unit: 'token', pricePerUnit: 0.28e-6 },
  image: { unit: 'image', pricePerUnit: 0.025 },
  tts: { unit: 'char', pricePerUnit: 19.1e-6 },
  i2v: { unit: 'second', pricePerUnit: 0.09 }, // 已下线，保留供历史回显
} as const;

export const UNIT_OF: Record<string, string> = {
  llm: 'token',
  image: 'image',
  tts: 'char',
  i2v: 'second', // 已下线，保留供历史回显
};

export type LlmUnits = { input_tokens: number; output_tokens: number };

/** 单类单价（llm 返回 token input 单价；调用方经 estimateCost 计算分价和）。 */
export function priceFor(cls: string, _units?: number, _model?: string): number | null {
  const u = String(cls).toLowerCase();
  if (u === 'llm') return PRICES.llm_in.pricePerUnit;
  const p = (PRICES as Record<string, { pricePerUnit: number }>)[u];
  return p ? p.pricePerUnit : null;
}

/** 估算一次调用的 cost_usd。llm → {input_tokens,output_tokens}，其它 → 标量。 */
export function estimateCost(cls: string, units: number | LlmUnits): number | null {
  const u = String(cls).toLowerCase();
  if (u === 'llm' && units && typeof units === 'object') {
    const input = Number((units as LlmUnits).input_tokens) || 0;
    const output = Number((units as LlmUnits).output_tokens) || 0;
    return input * PRICES.llm_in.pricePerUnit + output * PRICES.llm_out.pricePerUnit;
  }
  const p = (PRICES as Record<string, { pricePerUnit: number }>)[u];
  if (!p) return null;
  const n = Number(units) || 0;
  return n * p.pricePerUnit;
}

/** api_cost_log.units 列值：llm → 总 token 数，其它 → 标量。 */
export function unitsPayload(cls: string, units: number | LlmUnits): number {
  const u = String(cls).toLowerCase();
  if (u === 'llm') {
    return (Number((units as LlmUnits).input_tokens) || 0) + (Number((units as LlmUnits).output_tokens) || 0);
  }
  return Number(units) || 0;
}
