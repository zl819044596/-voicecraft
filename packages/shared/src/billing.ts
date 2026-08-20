/**
 * Billing & credits catalog (00-CONTRACT §4 / C11). Single source of truth for
 * prices, credit grants, consumption prices and free-rerun quotas.
 */

export const CREDIT_USD_ANCHOR = 0.01; // 1 credit = $0.01

/** Consumption prices (credits). */
export const CONSUMPTION = {
  static_final: 60,
  i2v_final: 300,
  static_rerun: 20,
  i2v_rerun: 80,
} as const;

/** 1 i2v = 5 static equivalents. */
export const I2V_STATIC_EQUIV = 5;

/** Free reruns per task by plan (00-CONTRACT §4.1). */
export const FREE_RERUNS: Record<string, number> = {
  trial: 2,
  payg_static: 2,
  payg_i2v: 2,
  starter: 3,
  pro: 5,
  byok: Infinity, // BYOK unlimited
};

/** Plans, strictly per 00-CONTRACT §4.1 (v2.1 积分制). */
export interface PlanDef {
  id: string;
  sku: string | null;
  nameEn: string;
  nameZh: string;
  interval: 'monthly' | 'once' | null;
  priceUsd: string | null; // money as string (03 §9)
  grantCredits: number | null;
  freeReruns: number;
  features: string[];
  rules: string[];
}

export const PLANS: PlanDef[] = [
  {
    id: 'byok',
    sku: null,
    nameEn: 'Bring Your Own Key',
    nameZh: 'BYOK 自带 Key',
    interval: null,
    priceUsd: null,
    grantCredits: null,
    freeReruns: Infinity,
    features: ['4 类通道自带 Key（llm/image/tts/i2v）', '无限任务', '全功能'],
    rules: ['不计积分、不计量', '全局限流'],
  },
  {
    id: 'trial',
    sku: null,
    nameEn: 'Trial',
    nameZh: '体验',
    interval: null,
    priceUsd: null,
    grantCredits: 120,
    freeReruns: 2,
    features: ['注册即赠 120 体验积分（≈2 条 static）', '一次性发放，限一设备'],
    rules: ['仅托管档可用', '到期不结转'],
  },
  {
    id: 'starter',
    sku: 'starter_monthly',
    nameEn: 'Starter',
    nameZh: 'Starter',
    interval: 'monthly',
    priceUsd: '9.90',
    grantCredits: 900,
    freeReruns: 3,
    features: ['900 积分/月（≈15 static 或 3 i2v）', '托管 Key 池代付', '月度积分不结转'],
    rules: ['免费重跑 3 次/条', '超出按 20/80 积分计'],
  },
  {
    id: 'pro',
    sku: 'pro_monthly',
    nameEn: 'Pro',
    nameZh: 'Pro',
    interval: 'monthly',
    priceUsd: '29.90',
    grantCredits: 3000,
    freeReruns: 5,
    features: ['3000 积分/月（≈50 static 或 10 i2v）', '托管优先队列（p0）', '月度积分不结转'],
    rules: ['免费重跑 5 次/条', '超出按 20/80 积分计'],
  },
  {
    id: 'payg_static',
    sku: 'static_once',
    nameEn: 'Pay-as-you-go · Static',
    nameZh: '按次 · Static',
    interval: 'once',
    priceUsd: '1.90',
    grantCredits: 190,
    freeReruns: 2,
    features: ['190 积分（1 static 成片 + 余量）', '积分永久有效', '无需订阅'],
    rules: ['免费重跑 2 次/条'],
  },
  {
    id: 'payg_i2v',
    sku: 'i2v_once',
    nameEn: 'Pay-as-you-go · Image-to-video',
    nameZh: '按次 · 图生视频',
    interval: 'once',
    priceUsd: '7.90',
    grantCredits: 790,
    freeReruns: 2,
    features: ['790 积分（1 i2v 成片 + 余量）', '积分永久有效', '无需订阅'],
    rules: ['免费重跑 2 次/条', 'i2v 环节成本高，按次价为利润锚'],
  },
];

export function planById(id: string): PlanDef | undefined {
  return PLANS.find((p) => p.id === id);
}

/** Which plan's free-rerun quota applies to a user right now. */
export function freeRerunsForPlan(plan: string | null): number {
  if (plan && plan in FREE_RERUNS) return FREE_RERUNS[plan];
  return FREE_RERUNS.trial; // default = trial quota
}

/** Consumer plan equivalent for the billing page (00-CONTRACT §4.1 equivalents). */
export function equivalentCounts(plan: string): { static: number; i2v: number } {
  switch (plan) {
    case 'starter':
      return { static: 15, i2v: 3 };
    case 'pro':
      return { static: 50, i2v: 10 };
    case 'payg_static':
      return { static: 1, i2v: 0 };
    case 'payg_i2v':
      return { static: 0, i2v: 1 };
    default:
      return { static: 0, i2v: 0 };
  }
}

/** Consume price of a final video or a rerun, by mode (credits). */
export function finalCostCredits(mode: 'static' | 'i2v'): number {
  return mode === 'i2v' ? CONSUMPTION.i2v_final : CONSUMPTION.static_final;
}

export function rerunCostCredits(mode: 'static' | 'i2v'): number {
  return mode === 'i2v' ? CONSUMPTION.i2v_rerun : CONSUMPTION.static_rerun;
}
