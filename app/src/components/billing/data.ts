/* 积分账单数据与 mock（billing.md）—— 价格数字与流水枚举严格对齐 PRD */

export type LedgerKind =
  | 'grant_subscription'
  | 'grant_trial'
  | 'topup'
  | 'freeze'
  | 'settle'
  | 'consume_static'
  | 'consume_i2v'
  | 'refund'
  | 'rerun_static'
  | 'rerun_i2v'
  | 'expire'

export interface LedgerRow {
  id: string
  time: string
  kind: LedgerKind
  amount: number
  ref?: string
  note?: string
  /** real 模式：后端 ledger 自带余额快照（demo 模式由页面连续推算） */
  balanceAfter?: number
}

/** kind 语义色（billing.md §4） */
export const KIND_COLOR: Record<LedgerKind, string> = {
  grant_subscription: 'var(--ok)',
  grant_trial: 'var(--ok)',
  topup: 'var(--ok)',
  freeze: 'var(--managed)',
  settle: 'var(--text-2)',
  consume_static: 'var(--text-2)',
  consume_i2v: 'var(--text-2)',
  refund: 'var(--byok)',
  rerun_static: 'var(--stale)',
  rerun_i2v: 'var(--stale)',
  expire: 'var(--dim)',
}

/** 流水筛选分组 → 包含的 kind */
export const KIND_FILTERS: { id: string; label: string; kinds: LedgerKind[] }[] = [
  { id: 'all', label: '全部', kinds: [] },
  { id: 'grant', label: 'grant', kinds: ['grant_subscription', 'grant_trial'] },
  { id: 'freeze', label: 'freeze', kinds: ['freeze'] },
  { id: 'settle', label: 'settle', kinds: ['settle'] },
  { id: 'refund', label: 'refund', kinds: ['refund'] },
  { id: 'consume', label: 'consume', kinds: ['consume_static', 'consume_i2v'] },
  { id: 'rerun', label: 'rerun', kinds: ['rerun_static', 'rerun_i2v'] },
  { id: 'expire', label: 'expire', kinds: ['expire'] },
]

/** 预置流水（新 → 旧，billing.md §4）；balance_after 以当前余额为锚点连续推算 */
export const INITIAL_LEDGER: LedgerRow[] = [
  { id: 'lg-01', time: '2025-08-18 14:22', kind: 'rerun_i2v', amount: -80, ref: '#T-1040' },
  { id: 'lg-02', time: '2025-08-17 21:05', kind: 'settle', amount: -300, ref: '#T-1040' },
  { id: 'lg-03', time: '2025-08-17 20:48', kind: 'freeze', amount: -300, ref: '#T-1040' },
  { id: 'lg-04', time: '2025-08-15 11:30', kind: 'topup', amount: 790, note: '按次 i2v' },
  { id: 'lg-05', time: '2025-08-12 09:14', kind: 'refund', amount: 60, ref: '#T-1038', note: 'failed 解冻' },
  { id: 'lg-06', time: '2025-08-10 16:40', kind: 'consume_static', amount: -60, ref: '#T-1037' },
  { id: 'lg-07', time: '2025-08-08 00:01', kind: 'grant_subscription', amount: 900, note: 'Starter' },
  { id: 'lg-08', time: '2025-08-05 13:27', kind: 'rerun_static', amount: -20, ref: '#T-1036' },
  { id: 'lg-09', time: '2025-08-05 12:02', kind: 'consume_static', amount: -60, ref: '#T-1036' },
  { id: 'lg-10', time: '2025-08-01 10:00', kind: 'grant_trial', amount: 120, note: '体验积分' },
  { id: 'lg-11', time: '2025-07-30 23:59', kind: 'expire', amount: -120, note: '体验积分用尽标记' },
  { id: 'lg-12', time: '2025-07-28 15:45', kind: 'topup', amount: 190, note: '按次 static' },
]

export interface Plan {
  id: string
  name: string
  price: string
  credits: number
  creditsLabel: string
  desc: string
  popular?: boolean
}

export const PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', price: '$9.9/月', credits: 900, creditsLabel: '900 积分/月', desc: '≈15 static 或 3 i2v · 免费重跑 3 次' },
  { id: 'pro', name: 'Pro', price: '$29.9/月', credits: 3000, creditsLabel: '3000 积分/月', desc: '≈50 static 或 10 i2v · 免费重跑 5 次 · 优先队列', popular: true },
  { id: 'once-static', name: '按次 · static', price: '$1.9', credits: 190, creditsLabel: '190 积分（永久有效）', desc: '1 static + 余量 · 免费重跑 2 次' },
  { id: 'once-i2v', name: '按次 · i2v', price: '$7.9', credits: 790, creditsLabel: '790 积分（永久有效）', desc: '1 i2v + 余量 · 免费重跑 2 次' },
]
