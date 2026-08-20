/**
 * API contract types (03-接口文档). Type-only view of the JSON wire contract.
 * Runtime copies are returned by the API; the web app consumes these directly.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export type Locale = 'en' | 'zh';
export type ContentLanguage = 'en' | 'zh' | 'other';

// ---------------------------------------------------------------------------
// Auth / users
// ---------------------------------------------------------------------------

export type UserTier = 'free' | 'starter' | 'pro';
export type UserStatus = 'active' | 'disabled' | 'deleted';

export interface User {
  id: string;
  email: string;
  nickname: string | null;
  locale: Locale;
  age_confirmed: boolean;
  tier: UserTier;
  status: UserStatus;
  created_at: string;
}

/** GET /api/auth/me — session + credit state + active subscription. */
export interface AuthMe {
  user: User;
  credits: {
    credits: number;
    trial_credits: number;
    trial_granted: boolean;
    free_reruns_per_task: number;
    equivalents: { static_count: number; i2v_count: number };
  };
  subscription: {
    plan: string;
    status: string;
    current_period_end: string;
  } | null;
}

export interface LoginRequestBody {
  email: string;
  locale?: Locale;
}

export interface MagicLinkVerifyBody {
  token: string;
  age_confirmed?: boolean;
}

export interface GoogleAuthBody {
  /** OAuth2 authorization-code flow token returned by the Google sign-in button. */
  credential?: string;
  redirect_uri?: string;
}

// ---------------------------------------------------------------------------
// Credentials (BYOK, C4 — merged single table)
// ---------------------------------------------------------------------------

export type CredentialScope = 'user' | 'platform';
export type ProviderClass = 'llm' | 'image' | 'tts' | 'i2v';
export type CredentialStatus = 'active' | 'disabled' | 'revoked';

/** GET /api/credentials — masked only, never the plaintext key (R1). */
export interface Credential {
  id: string;
  owner_scope: CredentialScope;
  provider: string;
  provider_class: ProviderClass | null;
  label: string;
  key_masked: string;
  base_url: string | null;
  status: CredentialStatus;
  created_at: string;
}

export interface CreateCredentialBody {
  provider: string;
  provider_class: ProviderClass;
  label?: string;
  key: string;
  base_url?: string;
}

// ---------------------------------------------------------------------------
// Model configs (C4/C12)
// ---------------------------------------------------------------------------

export interface ModelConfig {
  id: string;
  provider_class: ProviderClass;
  name: string;
  credential_id: string | null;
  base_url: string | null;
  model: string;
  voice: string | null;
  enabled: boolean;
  is_default: boolean;
}

export interface CreateModelConfigBody {
  provider_class: ProviderClass;
  name: string;
  credential_id?: string;
  base_url?: string;
  model: string;
  voice?: string;
  enabled?: boolean;
  is_default?: boolean;
}

export interface ModelPreset {
  id: string;
  provider_class: ProviderClass;
  name: string;
  provider: string;
  model: string;
  mechanism: 'A' | 'B';
  base_url: string | null;
  voices?: string[];
  languages?: string[];
  commercial: boolean;
}

// ---------------------------------------------------------------------------
// Library: prompts / products / benchmarks / media assets / bgm
// ---------------------------------------------------------------------------

export type PromptType =
  | 'product_parse'
  | 'benchmark_analysis'
  | 'script'
  | 'title'
  | 'style'
  | 'storyboard'
  | 'compliance';

export interface Prompt {
  id: string;
  type: PromptType;
  name: string;
  scenario: string | null;
  body: string;
  tags: string[];
  enabled: boolean;
  is_default: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  category: string | null;
  price: string | null;
  commission_rate: string | null;
  product_url: string | null;
  detail_text: string | null;
  visibility: 'all' | 'private' | 'me';
  status: 'active' | 'inactive';
  gen_count: number;
  created_at: string;
}

export interface Benchmark {
  id: string;
  account: string | null;
  title: string;
  video_url: string | null;
  source_text: string | null;
  product_id: string | null;
  duration: number | null;
  visibility: 'all' | 'private' | 'me';
  created_at: string;
}

export interface MediaAsset {
  id: string;
  type: 'image' | 'audio' | 'video';
  name: string;
  url: string;
  size: number | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface BgmTrack {
  id: string;
  name: string;
  url: string;
  size: number | null;
  duration: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type ProjectSourceType = 'text' | 'url' | 'topic' | 'product';

export interface Project {
  id: string;
  title: string;
  source_type: ProjectSourceType;
  prompt: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface CreateProjectBody {
  title: string;
  source_type: ProjectSourceType;
  prompt?: string;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskMode = 'static' | 'i2v';
export type TaskTrack = 'byok' | 'managed';
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type RunMode = 'semi' | 'auto';
export type StepStatus = 'queued' | 'running' | 'done' | 'failed' | 'skipped' | 'cancelled';

export interface TaskSummary {
  id: string;
  project_id: string;
  mode: TaskMode;
  track: TaskTrack;
  status: TaskStatus;
  current_step: number;
  run_mode: RunMode;
  created_at: string;
  updated_at: string;
  /** aggregated from step_results (filled in list views) */
  progress?: number;
  title?: string | null;
}

export interface TaskConfig {
  content_language?: ContentLanguage;
  title?: string;
  templates?: {
    script?: string;
    style?: string;
    storyboard?: string;
  };
  synthesis?: {
    bgm?: string | null;
    subtitle_settings?: {
      enabled: boolean;
      position?: string;
      style?: string;
      max_lines?: number;
    };
  };
  models?: Record<string, string>;
  [key: string]: unknown;
}

export interface StepResultView {
  step: number;
  status: StepStatus;
  payload: Record<string, unknown>;
  error: string | null;
  retries: number;
  started_at: string | null;
  finished_at: string | null;
}

export interface AssetView {
  id: string;
  type: 'shot' | 'clip' | 'audio' | 'srt' | 'mp4' | 'zip';
  minio_key: string;
  size: number | null;
  checksum: string | null;
}

export interface ExportView {
  id: string;
  minio_key: string;
  zip_hash: string;
  expires_at: string;
}

/** GET /api/tasks/:id — the full task detail aggregation. */
export interface TaskDetail {
  id: string;
  project_id: string;
  project_title: string | null;
  mode: TaskMode;
  track: TaskTrack;
  status: TaskStatus;
  current_step: number;
  run_mode: RunMode;
  config: TaskConfig;
  credits_frozen: number;
  credits_settled: number;
  created_at: string;
  updated_at: string;
  steps: StepResultView[];
  assets: AssetView[];
  export: ExportView | null;
  cost_estimate: number | null;
  stale: boolean;
  can_continue: boolean;
  review_gate_pending: boolean;
}

export interface CreateTaskBody {
  project_id?: string;
  mode?: TaskMode; // default static
  track?: TaskTrack; // default byok (C2: BYOK free first-class; managed requires credits)
  run_mode?: RunMode; // default semi
  config?: TaskConfig;
}

export interface CreateTaskResult {
  task: TaskDetail;
  cost_estimate: {
    credits: number;
    currency: 'USD';
    free_reruns: number;
  };
}

export interface NodeEditBody {
  kind: 'script' | 'storyboard' | 'voice' | 'subtitle' | 'shot' | 'clip';
  value: unknown;
  index?: number;
}

// ---------------------------------------------------------------------------
// Billing / credits
// ---------------------------------------------------------------------------

export type PlanKind = 'trial' | 'byok' | 'starter' | 'pro' | 'payg_static' | 'payg_i2v';

/** §9.1 plan entry as returned by GET /api/billing/plans. */
export interface BillingPlan {
  sku: string; // plan id (starter/pro/payg_static/payg_i2v/byok)
  name: string;
  price_usd: string; // money as string (03 §9)
  interval: 'month' | null;
  credits:
    | string
    | { amount: number; equivalents: string; permanent: boolean }
    | { monthly: number; equivalents: string };
  free_reruns: number | null;
  features?: string[];
  rules?: string[];
}

/** §9.1 GET /api/billing/plans — plan catalog + top-level rules. */
export interface PlansResponse {
  plans: BillingPlan[];
  rules: {
    credit_anchor: string;
    price_list: {
      static_video: number;
      i2v_video: number;
      static_rerun: number;
      i2v_rerun: number;
    };
    credit_equivalence: string;
    monthly_credits_expire: boolean;
    payg_credits_expire: boolean;
    trial: { credits: number; one_time: boolean };
  };
}

export interface OrderView {
  id: string;
  creem_order_id: string | null;
  kind: 'subscription' | 'pay_per_use';
  sku: string;
  amount_usd: string | null; // money as string (03 §9)
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';
  created_at: string;
}

/** §9.4 GET /api/credits — account balance + equivalents + subscription. */
export interface CreditState {
  credits: number;
  trial_credits: number;
  trial_granted: boolean;
  equivalents: { static_count: number; i2v_count: number };
  subscription: {
    plan: string;
    status: string;
    current_period_end: string;
  } | null;
  free_reruns_per_task: number;
}

export interface CreditLedgerEntry {
  id: string;
  task_id: string | null;
  kind: string;
  amount: number;
  balance_after: number;
  note: string | null;
  created_at: string;
}

export interface CheckoutBody {
  kind: 'subscription' | 'pay_per_use';
  sku: 'starter' | 'pro' | 'payg_static' | 'payg_i2v';
  success_url?: string;
  cancel_url?: string;
}

/** §9.2 POST /api/billing/checkout → 201. */
export interface CheckoutResult {
  order_id: string;
  checkout_url: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Export / account
// ---------------------------------------------------------------------------

export interface ExportView {
  id: string;
  task_id: string;
  minio_key: string;
  zip_hash: string;
  expires_at: string;
}

/** §10.3 PUT /api/account/profile — only nickname (≤120) and locale (en|zh) are writable. */
export interface AccountProfileBody {
  nickname?: string;
  locale?: Locale;
}

// ---------------------------------------------------------------------------
// Report abuse
// ---------------------------------------------------------------------------

export type AbuseReason = 'copyright' | 'illegal' | 'spam' | 'privacy' | 'other';

export interface ReportAbuseBody {
  reason: AbuseReason;
  details?: string;
  contact?: string;
  idempotency_key: string;
}

export interface ReportAbuseResult {
  id: string;
  status: 'open' | 'triaged' | 'closed';
  created_at: string;
}
