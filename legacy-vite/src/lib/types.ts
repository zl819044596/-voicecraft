/**
 * 后端契约类型（PIPELINE_TASK_15 阶段① P1）。
 *
 * 字段名/响应结构逐一对照 api/src/routes/*.ts 源码现状编写（契约铁律），
 * 非 2xx 统一 `{ error: { code, message, details? } }`（见 api/src/lib/api.ts ApiError）。
 * 分页响应统一 `{ items, page, size, total }`。
 */

// ---------- 通用 ----------

export interface Page<T> {
  items: T[]
  page: number
  size: number
  total: number
}

export type Tier = 'free' | 'starter' | 'pro'
export type Track = 'byok' | 'managed'
export type GenMode = 'static' | 'i2v'
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export type StepStatus = TaskStatus | 'skipped'
export type Visibility = 'all' | 'private' | 'me'

// ---------- 认证 / 账户（api/src/routes/auth.ts / credits.ts / account.ts） ----------

export interface AuthUser {
  id: string
  email: string | null
  nickname: string | null
  tier: Tier
  locale: 'zh' | 'en' | null
  age_confirmed: boolean
  status: string
  created_at: string
}

export interface Subscription {
  plan: string
  status: string
  current_period_end: string | null
}

/** GET /api/auth/me */
export interface MeResponse {
  user: AuthUser
  credits: {
    credits: number
    trial_credits: number
    trial_granted: boolean
    free_reruns_per_task: number
    equivalents: { static_count: number; i2v_count: number }
  }
  subscription: Subscription | null
}

/** POST /api/auth/magic-link/verify 与 /api/auth/google/callback 的会话响应 */
export interface AuthLoginResponse {
  user: {
    id: string
    email: string
    nickname: string | null
    tier: Tier
    is_new_user: boolean
    trial: { granted: boolean; trial_credits: number }
  }
}

/** POST /api/auth/magic-link */
export interface MagicLinkSentResponse {
  sent: true
  expires_in: number
}

/** POST /api/auth/google */
export interface GoogleStartResponse {
  authorize_url: string
  state: string
}

/** POST /api/auth/logout · DELETE /api/account · 各类 DELETE */
export interface OkResponse {
  ok: true
  deleted_at?: string
}

// ---------- 积分（api/src/routes/credits.ts） ----------

export interface CreditsResponse {
  credits: number
  trial_credits: number
  trial_granted: boolean
  equivalents: { static_count: number; i2v_count: number }
  subscription: Subscription | null
  free_reruns_per_task: number
}

export interface CreditLedgerItem {
  id: string
  task_id: string | null
  kind: string
  amount: number
  balance_after: number | null
  note: string | null
  created_at: string
}

// ---------- 项目（api/src/routes/projects.ts） ----------

export interface Project {
  id: string
  title: string
  source_type: 'text' | 'url' | 'topic' | 'product'
  prompt: string | null
  status: string
  task_count?: number
  created_at: string
  updated_at: string
}

// ---------- 任务（api/src/routes/tasks.ts） ----------

export interface TaskListItem {
  id: string
  project_id: string
  mode: GenMode
  track: Track
  status: TaskStatus
  current_step: number
  progress: number
  config: Record<string, unknown>
  credits_frozen: number
  credits_settled: number
  created_at: string
  updated_at: string
  elapsed_seconds: number
}

export interface TaskStepResult {
  step: number
  kind: string | null
  name: string
  status: StepStatus
  stale: boolean
  retries: number
  payload: Record<string, unknown>
  error: string | null
  started_at: string | null
  finished_at: string | null
}

export interface TaskAsset {
  id: string
  type: string
  index: number
  url: string
  size: number | null
  checksum: string | null
}

export interface TaskCostStep {
  step: number
  track: Track
  provider: string
  model: string
  units: number
  cost_usd: number | string
}

/** GET /api/tasks/:id */
export interface TaskDetail {
  id: string
  project_id: string
  mode: GenMode
  track: Track
  run_mode: 'semi' | 'auto'
  status: TaskStatus
  current_step: number
  progress: number
  config: Record<string, unknown>
  cost_estimate: { provider_cost_usd: string; credits_required: number; note: string }
  steps: TaskStepResult[]
  storyboard: unknown
  assets: TaskAsset[]
  export: { export_id: string; expires_at: string } | null
  cost: { api_cost_total_usd: number | string; by_step: TaskCostStep[] }
  credits: {
    frozen: number
    settled: number
    reruns_used: number
    reruns_free: number | null
    rerun_price: Record<string, number> | null
  }
  created_at: string
}

// ---------- 商品库（api/src/routes/products.ts） ----------

export interface Product {
  id: string
  name: string
  category: string | null
  price: string | null
  commission_rate: string | null
  product_url: string | null
  detail_text: string | null
  visibility: Visibility
  status: 'active' | 'inactive'
  gen_count: number
  created_at: string
}

// ---------- 对标库（api/src/routes/benchmarks.ts） ----------

export interface Benchmark {
  id: string
  account: string | null
  title: string
  video_url: string | null
  source_text: string | null
  product_id: string | null
  duration: number | null
  visibility: Visibility
  created_at: string
}

// ---------- 提示词（api/src/routes/prompts.ts） ----------

export interface Prompt {
  id: string
  type: string
  name: string
  scenario: string | null
  body: string
  tags: string[]
  enabled: boolean
  is_default: boolean
  /** 系统默认模板（user_id 为空）为只读：不可修改/删除（2026-08-19 用户规则） */
  user_id: string | null
  created_at: string
}

// ---------- 模型配置（api/src/routes/model-configs.ts） ----------

export interface ModelConfig {
  id: string
  provider_class: string
  name: string
  credential_id: string | null
  key_masked: string | null
  base_url: string | null
  model: string
  voice: string | null
  enabled: boolean
  is_default: boolean
  created_at: string
}

// ---------- 素材库（api/src/routes/assets.ts） ----------

export interface MediaAsset {
  id: string
  user_id: string
  type: 'image' | 'audio' | 'video'
  name: string
  url: string
  size: number | null
  meta: Record<string, unknown>
  created_at: string
}

// ---------- 账号（api/src/routes/account.ts） ----------

export interface ProfileUpdateResponse {
  user: AuthUser & { updated_at: string }
}

// ---------- 凭据（api/src/routes/credentials.ts） ----------

export interface Credential {
  id: string
  owner_scope: string
  provider: string
  label: string
  key_masked: string
  base_url: string | null
  status: string
  created_at: string
}

// ---------- 任务列表扩展（api/src/routes/tasks.ts GET /） ----------

export interface TaskListResponse extends Page<TaskListItem> {
  month_total: number
  last_7_days: { date: string; count: number }[]
}

// ---------- 模型配置（api/src/routes/model-configs.ts） ----------

export interface ModelConfigPreset {
  id: string
  provider_class: string
  name: string
  provider: string
  model: string
  mechanism: string
  base_url: string | null
  voices?: string[]
  languages?: string[]
  commercial?: boolean
}

export interface PresetsResponse {
  presets: Record<string, ModelConfigPreset[]>
  mechanisms: { A: string; B: string; unsupported_note: string }
}

export interface ProbeResult {
  ok: boolean
  latency_ms: number | null
  note: string | null
}

// ---------- 计费（api/src/routes/billing.ts） ----------

export interface BillingPlan {
  sku: string
  name: string
  price_usd: string
  interval: string | null
  credits: unknown
  free_reruns: number | null
  features?: string[]
  rules?: string[]
}

export interface BillingPlansResponse {
  plans: BillingPlan[]
  rules: {
    credit_anchor: string
    price_list: Record<string, unknown>
    credit_equivalence: string
    monthly_credits_expire: boolean
    payg_credits_expire: boolean
    trial: { credits: number; one_time: boolean }
  }
}

export interface Order {
  id: string
  kind: string
  sku: string
  amount_usd: string | null
  status: string
  creem_order_id: string | null
  created_at: string
}

export interface OrdersResponse extends Page<Order> {}
