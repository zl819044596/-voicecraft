"use client";

// B-stage cost helpers shared by the workbench (pre-run estimate) and the
// detail page (post-run breakdown). The numbers mirror api/src/config/costs.js
// — keep the two in sync when prices change.

import {
  MODEL_OPTIONS,
  type CostBreakdown,
  type ModelOverride,
} from "@/lib/app-data";

export const CNY_PER_USD = 7.2;

// The workbench passes a per-class model selection (entry id or name) to the
// estimate; it is informational for pricing, so we accept the loose shape.
type ModelSelectionLike = Partial<Record<string, string>>;

// Reference pricing (USD), same values as the backend cost table.
const PRICING = {
  llm: { inputPer1M: 0.6, outputPer1M: 2, callInput: 1200, callOutput: 800 },
  image: { perImage: 0.35 },
  tts: { per1kChars: 0.15 },
  i2v: { perClip: 1.2 },
};

/** Rough shot-count prediction from the source text length (chars). */
export function predictShots(sourceText: string): number {
  const len = (sourceText || "").length;
  // Shorter prompts → fewer shots; clamp 3..6 like the backend.
  const n = len <= 0 ? 4 : Math.min(6, Math.max(3, Math.ceil(len / 55)));
  return n;
}

/**
 * Pre-run estimate for the workbench ("Know Before You Generate").
 * Uses the selected models + predicted shot count; i2v mode adds clip cost.
 * `modelOverride` is currently informational (per-class pricing may differ once
 * more models ship) — reserved for future per-model price deltas.
 */
export function estimateCost(
  sourceText: string,
  synthesis: "static" | "i2v",
  _modelOverride: ModelOverride | ModelSelectionLike,
): {
  images: number;
  voices: number;
  i2vClips: number;
  llmCalls: number;
  estimatedCostUsd: number;
  estimatedCostCny: number;
  estimatedMinutes: number;
} {
  const shots = predictShots(sourceText);
  const llmCalls = 4; // S1/S2/S3/S9
  void _modelOverride; // reserved for per-model price deltas
  const images = shots;
  const voices = shots;
  const i2vClips = synthesis === "i2v" ? shots : 0;

  // LLM: 4 calls, approximate tokens each (same constants as the backend).
  const llmCny =
    llmCalls *
    ((PRICING.llm.callInput / 1e6) * PRICING.llm.inputPer1M +
      (PRICING.llm.callOutput / 1e6) * PRICING.llm.outputPer1M);
  const imageCny = images * PRICING.image.perImage;
  const ttsCny = (voices * 55 * PRICING.tts.per1kChars) / 1000; // ~55 chars/shot
  const i2vCny = i2vClips * PRICING.i2v.perClip;
  const totalCny = llmCny + imageCny + ttsCny + i2vCny;

  // Rough wall-clock: LLM ~15s/call, image ~20s, tts ~3s, i2v ~5min/clip.
  const minutes =
    Math.round(
      (llmCalls * 15 + images * 20 + voices * 3 + i2vClips * 300) / 60,
    ) || 1;

  return {
    images,
    voices,
    i2vClips,
    llmCalls,
    estimatedCostCny: Math.round(totalCny * 100) / 100,
    estimatedCostUsd: Math.round((totalCny / CNY_PER_USD) * 100) / 100,
    estimatedMinutes: minutes,
  };
}

/**
 * Post-run breakdown formatting — renders the backend's cost object.
 * Returns display rows for the detail page cost card.
 */
export function breakdownRows(cost: CostBreakdown | null): Array<{
  step: number;
  label: string;
  usage: string;
  costUsd: string;
}> {
  if (!cost || !cost.items || cost.items.length === 0) return [];
  const stepLabel: Record<number, string> = {
    1: "S1 选题",
    2: "S2 文案",
    3: "S3 分镜",
    4: "S4 逐镜生图",
    5: "S5 配音",
    7: "S7 合成(i2v)",
    8: "S8 复检",
    9: "S9 开放导出",
  };
  return cost.items.map((item) => {
    let usageStr = "";
    if (item.usage && typeof item.usage === "object") {
      const u = item.usage as Record<string, unknown>;
      if ("input_tokens" in u || "output_tokens" in u) {
        usageStr = `${Number(u.input_tokens) || 0} in / ${Number(u.output_tokens) || 0} out tokens`;
      } else if ("count" in u) {
        usageStr = `${Number(u.count)} 条`;
      } else if ("chars" in u) {
        usageStr = `${Number(u.chars)} chars`;
      }
    }
    return {
      step: item.step,
      label: stepLabel[item.step] ?? `S${item.step}`,
      usage: usageStr,
      costUsd: `$${((item.estimated_cost_cny || 0) / CNY_PER_USD).toFixed(2)}`,
    };
  });
}

/** Sanity: the options actually deployed (for the "Auto" select placeholder). */
export function defaultModelOptions(): ModelOverride {
  return {
    llm: MODEL_OPTIONS.llm[0],
    image: MODEL_OPTIONS.image[0],
    tts: MODEL_OPTIONS.tts[0],
    i2v: MODEL_OPTIONS.i2v[0],
  };
}
