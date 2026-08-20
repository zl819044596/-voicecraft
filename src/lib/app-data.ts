// Shared types + constants for the app workbench (/app and /app/projects/[id]).
//
// These mirror the backend API contract (api/src/routes/projects.js + tasks.js).
// A project is a container; the 9-step pipeline lives in a `task` (one run)
// with 9 `steps` (step_results rows). The frontend renders whatever the API
// returns — the API is the source of truth.

export type StepStatus =
  | "queued"
  | "running"
  | "waiting"
  | "done"
  | "failed"
  | "skipped"
  | "cancelled";

export type TaskStep = {
  task_id: string | null;
  step: number; // 1-9 (static) / 1-10 (i2v)
  name: string; // S1 选题 … S9 复检
  status: StepStatus;
  payload: Record<string, unknown> | null;
  error: string | null;
  retries: number;
  started_at: string | null;
  finished_at: string | null;
  // V2 pipeline (P4+): stale — the step's inputs were edited after it ran
  // (config.node_edits), so it must be re-run; kind — only step 1 in managed
  // mode is 'compliance_precheck', otherwise null.
  stale?: boolean;
  kind?: string | null;
};

// B-stage: model_override (whitelisted ids, "Auto" = omit the key).
export type ModelOverride = Partial<{
  llm: string;
  image: string;
  tts: string;
  i2v: string;
}>;

// Task 6: per-class model selection written into task.config.models. Each class
// selects one enabled model_configs entry — by id (preferred) or by name.
export type ModelSelectionSpec =
  | { model_config_id?: string; id?: string; name?: string }
  | string
  | null;
export type ModelSelection = Partial<{
  llm: ModelSelectionSpec;
  image: ModelSelectionSpec;
  tts: ModelSelectionSpec;
  i2v: ModelSelectionSpec;
}>;

// Task 6: one model_configs entry as returned by GET /api/model-configs.
// key_masked only — the backend never sends ciphertext/plaintext.
export type ModelConfig = {
  id: string;
  provider_class: ModelClass;
  name: string;
  base_url: string | null;
  model: string;
  key_masked: string;
  voice: string | null;
  enabled: boolean;
  is_default: boolean;
  credential_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ModelClass = "llm" | "image" | "tts" | "i2v";

// B-stage: creation-time estimate persisted in task.config.cost_estimate.
export type CostEstimate = {
  images: number;
  voices: number;
  i2vClips: number;
  llmCalls: number;
  estimatedCostUsd: number;
  estimatedCostCny: number;
  estimatedMinutes: number;
};

// B-stage: per-step usage + computed line cost returned by GET /tasks/:id.
export type CostItem = {
  step: number;
  usage: Record<string, unknown>;
  unit: string | null;
  estimated_cost_cny: number;
  estimated: boolean;
};

export type CostBreakdown = {
  estimated: boolean;
  total_cny: number;
  total_usd: number;
  currency: string;
  items: CostItem[];
};

// Deployed model catalog (2026-08-08, wingray account) — fallback options for
// the workbench when no model_configs entries exist yet. The live source of
// truth is GET /api/model-configs (enabled entries); this constant only
// mirrors api/src/config/costs.js AVAILABLE_MODELS for the legacy Auto path.
export const MODEL_OPTIONS: Record<keyof ModelOverride, string[]> = {
  llm: ["DeepSeek-V4-Flash-0731", "DeepSeek-V4-Pro"],
  image: ["Z-Image-Turbo"],
  tts: ["cosyvoice-v2"],
  i2v: ["Kling-V1-6-I2V", "Wan2.2-I2V-Plus"],
};

export const MODEL_LABELS: Record<keyof ModelOverride, string> = {
  llm: "LLM（文案/分镜/复检）",
  image: "生图",
  tts: "配音 TTS",
  i2v: "图生视频 i2v",
};

export type ProjectStatus =
  | "draft"
  | "queued"
  | "running"
  | "waiting"
  | "done"
  | "failed"
  | "cancelled";

export type Project = {
  id: string;
  user_id: string;
  title: string;
  source_type: string;
  prompt: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  progress: number; // percent of steps done (0-100)
  task_count?: number;
  task?: { id: string; status: string; current_step: number; progress: number } | null;
  steps?: TaskStep[];
};

// V2: GET /api/projects list item (api/src/routes/projects.js) — a slim
// summary; the detail page is served by the tasks routes instead (there is no
// GET /api/projects/:id).
export type ProjectSummary = {
  id: string;
  title: string;
  source_type: string;
  prompt: string | null;
  status: "active" | "archived";
  task_count: number;
  created_at: string;
};

// V2: GET /api/tasks list item — flat, no config / no run_mode.
export type TaskListItem = {
  id: string;
  project_id: string;
  mode: "static" | "i2v";
  track: string | null;
  status: ProjectStatus;
  current_step: number;
  progress: number;
  credits_frozen: number;
  credits_settled: number;
  created_at: string;
  elapsed_seconds: number;
};

// PIPELINE_TASK_11: a storyboard shot as persisted in storyboard.json. The
// wizard's per-shot features read these fields (title / subtitle / aspect /
// candidate lists / ref image). Legacy shots without them still load.
export type StoryboardShot = {
  index: number;
  duration: number;
  scene: string;
  script: string;
  voiceover: string;
  subtitle: string;
  prompt: string;
  title: string;
  aspect: string;
  motion?: string;
  ref_key?: string | null;
  candidates?: Array<{ key: string; is_default: boolean }>;
  clip_candidates?: Array<{ key: string; is_default: boolean }>;
};

// A saved script version (config.script_versions entry).
// NOTE: the backend (POST /tasks/:id/script/versions) returns
// {id, content, hook, cta, created_at} — the frontend maps `content` → `text`
// and has no is_selected (selection is {action:'apply', version_id}).
export type ScriptVersion = {
  id: string;
  text: string;
  created_at: string;
  is_selected: boolean;
};

// V2 task.config (GET /api/tasks/:id → `config`). Synthesis carries aspect /
// subtitle_burn; models carries per-class model selection; script_versions is
// the saved-script list; subtitle holds the subtitle-settings config.
export type TaskConfig = {
  content_language?: string;
  synthesis?: { aspect?: string; subtitle_burn?: boolean };
  aspect?: string;
  model_override?: ModelOverride;
  models?: ModelSelection;
  storyboard_order?: number[];
  cost_estimate?: CostEstimate;
  source_text?: string;
  run_mode?: "semi" | "auto";
  // Semi-auto pause semantics (api/src/pipeline/state.js): paused=true with
  // pause_kind 'initial' | 'review_gate' | 'compliance_review' + resume step.
  paused?: boolean;
  pause_kind?: "initial" | "review_gate" | "compliance_review" | string;
  pause_resume_step?: number;
  review_passed?: boolean;
  review_gate?: boolean;
  tts?: { voice?: string; speed?: number };
  subtitles?: { text?: string };
  script_versions?: ScriptVersion[];
  bgm_key?: string;
  subtitle?: {
    enabled?: boolean;
    position?: "top" | "bottom";
    font_size?: number;
    chars_per_line?: number;
  };
  // Per-node prompt template overrides: { step: promptId }.
  templates?: Record<string, string | null>;
  // Per-step custom prompt text: { step: text } (takes priority over templates).
  prompts?: Record<string, string | null>;
  // CORE-FEATURES: per-kind rule snapshot { kind: ruleId } — the rules selected
  // at task creation; pipeline resolves body per config.rules[kind] (unset → system default).
  rules?: Record<string, string | null>;
};

// V2 per-step usage line in GET /api/tasks/:id → cost.by_step.
export type CostUsageLine = {
  step: number;
  track: string;
  provider: string;
  model: string;
  units: number;
  cost_usd: number;
};

// A full task detail payload (GET /api/tasks/:id) — flat V2 shape:
// {id, project_id, mode, track, run_mode, status, current_step, progress,
//  config, cost_estimate, steps, storyboard, assets, export, cost, credits,
//  created_at}.
export type TaskDetail = {
  id: string;
  project_id: string;
  mode: "static" | "i2v";
  track: string | null;
  run_mode: "semi" | "auto";
  status: ProjectStatus;
  current_step: number;
  progress: number;
  config: TaskConfig | null;
  cost_estimate?: CostEstimate | null;
  steps: TaskStep[];
  storyboard: {
    shots: StoryboardShot[];
    generated_at?: string;
    aspect?: string;
    preset?: string;
  } | null;
  assets: Array<{
    id: number;
    type: string;
    index: number | null;
    url: string;
    size: number | null;
    checksum: string | null;
    created_at?: string;
  }>;
  export: { export_id: string; expires_at: string | null } | null;
  cost: {
    api_cost_total_usd: number;
    by_step: CostUsageLine[];
  } | null;
  credits: {
    frozen: number;
    settled: number;
    reruns_used: number;
    reruns_free: number;
    rerun_price: { static: number; i2v: number } | null;
  } | null;
  created_at: string;
};

// Task 8: wizard node definitions. A node groups one or more backend steps;
// the left rail renders these per task.config.synthesis. Node status is derived
// from the underlying steps' statuses (done if every mapped step is done, etc.).
export type WizardNode = {
  id: number; // 1-7, user-facing node number
  title: string;
  subtitle: string;
  steps: number[]; // backend steps this node maps to
  editable: boolean;
};

export const WIZARD_NODES_STATIC: WizardNode[] = [
  { id: 1, title: "Topic Parsing", subtitle: "S1", steps: [1], editable: false },
  { id: 2, title: "Script Generation", subtitle: "S2", steps: [2], editable: true },
  { id: 3, title: "Storyboard", subtitle: "S3", steps: [3], editable: true },
  { id: 4, title: "Shot Images", subtitle: "S4", steps: [4], editable: false },
  { id: 5, title: "Voiceover & Subtitles", subtitle: "S6+S7", steps: [6, 7], editable: true },
  { id: 6, title: "Composition", subtitle: "S8", steps: [8], editable: false },
  { id: 8, title: "Review", subtitle: "S9", steps: [9], editable: false },
  { id: 9, title: "Export", subtitle: "S10", steps: [10], editable: false },
];

export const WIZARD_NODES_I2V: WizardNode[] = [
  { id: 1, title: "Topic Parsing", subtitle: "S1", steps: [1], editable: false },
  { id: 2, title: "Script Generation", subtitle: "S2", steps: [2], editable: true },
  { id: 3, title: "Storyboard", subtitle: "S3", steps: [3], editable: true },
  { id: 4, title: "Shot Images", subtitle: "S4", steps: [4], editable: false },
  { id: 5, title: "Voiceover & Subtitles", subtitle: "S6+S7", steps: [6, 7], editable: true },
  { id: 6, title: "AI Motion Clips", subtitle: "S5", steps: [5], editable: false },
  { id: 7, title: "Composition", subtitle: "S8", steps: [8], editable: false },
  { id: 8, title: "Review", subtitle: "S9", steps: [9], editable: false },
  { id: 9, title: "Export", subtitle: "S10", steps: [10], editable: false },
];

// PIPELINE_TASK_13 — S1–S6 rail stage definitions. The task detail page renders
// a 6-stage rail (S1 文案 … S6 生成视频) instead of the raw 9/10 backend steps.
// Each stage maps to one-or-more backend steps (for status derivation) and a
// primary wizard node id (for the editor panel). Backend step/node numbers are
// unchanged — API calls (save node / regenerate / rerun) still use them.
export type RailStage = {
  id: number; // 1-6
  titleKey: string; // i18n key for the stage name (rail.stageScript …)
  rangeKey: string; // i18n key for the "L1–L2"-style range line (rail.rangeScript …)
  steps: number[]; // backend steps this stage covers
  nodeId: number; // primary wizard node id for the editor
  rerunFrom: number; // backend step to re-run from on "回到本步修改"
  gate?: true; // PIPELINE_TASK_13: review-gate stage (S5) — no own step, the
  // pipeline pauses before the composition step for human sign-off.
};

export const RAIL_STAGES_S6_STATIC: RailStage[] = [
  { id: 1, titleKey: "rail.stageScript", rangeKey: "rail.rangeScript", steps: [2], nodeId: 2, rerunFrom: 2 },
  { id: 2, titleKey: "rail.stageStoryboard", rangeKey: "rail.rangeStoryboard", steps: [3], nodeId: 3, rerunFrom: 3 },
  { id: 3, titleKey: "rail.stageVisuals", rangeKey: "rail.rangeVisuals", steps: [4], nodeId: 4, rerunFrom: 4 },
  { id: 4, titleKey: "rail.stageAudio", rangeKey: "rail.rangeAudio", steps: [6, 7], nodeId: 5, rerunFrom: 6 },
  // S5 复核 is a gate: the pipeline pauses with current_step=8 (both static and
  // i2v use unified 1-10 numbering) — right before composition. No backend step
  // belongs to it.
  { id: 5, titleKey: "rail.stageCompose", rangeKey: "rail.rangeCompose", steps: [], nodeId: 8, gate: true, rerunFrom: 6 },
  { id: 6, titleKey: "rail.stageDelivery", rangeKey: "rail.rangeDelivery", steps: [8, 9, 10], nodeId: 6, rerunFrom: 8 },
];

export const RAIL_STAGES_S6_I2V: RailStage[] = [
  { id: 1, titleKey: "rail.stageScript", rangeKey: "rail.rangeScript", steps: [2], nodeId: 2, rerunFrom: 2 },
  { id: 2, titleKey: "rail.stageStoryboard", rangeKey: "rail.rangeStoryboard", steps: [3], nodeId: 3, rerunFrom: 3 },
  { id: 3, titleKey: "rail.stageVisuals", rangeKey: "rail.rangeVisuals", steps: [4], nodeId: 4, rerunFrom: 4 },
  { id: 4, titleKey: "rail.stageAudio", rangeKey: "rail.rangeAudio", steps: [6, 7], nodeId: 5, rerunFrom: 6 },
  { id: 5, titleKey: "rail.stageCompose", rangeKey: "rail.rangeCompose", steps: [], nodeId: 8, gate: true, rerunFrom: 6 },
  { id: 6, titleKey: "rail.stageDelivery", rangeKey: "rail.rangeDelivery", steps: [5, 8, 9, 10], nodeId: 6, rerunFrom: 5 },
];

// PIPELINE_TASK_13 — S2 分镜提示词 presets. The storyboard step (backend step 3)
// resolves its prompt from config.templates[3] → config.prompts[3]; these presets
// are written as the step-3 custom prompt when selected in the S2 editor.
export type StoryboardPreset = {
  id: string; // "general" | "ecommerce" | "story"
  titleKey: string; // i18n key for the preset name
  body: string; // the split prompt given to the LLM
};

export const STORYBOARD_PRESETS: StoryboardPreset[] = [
  {
    id: "general",
    titleKey: "storyboardPreset.general",
    body:
      "你是专业短视频分镜导演。将文案按叙事顺序拆分为 6-12 个镜头，输出分镜 JSON 数组，每个镜头必须包含：title(镜头标题，一句话概括画面)、scene(画面描述)、script(内容/该镜文案句，必须是文案中的可读句子，直接摘自原文，不要写成提示词)、voiceover(配音句，与 script 一致或口语化改写)、subtitle(字幕，与配音一致的屏幕文字，可短于配音)、prompt(图片提示词，英文，含主体/场景/光线/景别，与 script 严格分开)、aspect(图片比例)。要求镜头衔接流畅、节奏均匀，时长总和约等于目标时长。",
  },
  {
    id: "ecommerce",
    titleKey: "storyboardPreset.ecommerce",
    body:
      "你是电商带货短视频分镜师。将带货文案按「钩子开场 → 卖点展示 → 场景演示 → 行动号召」拆分为 6-12 个镜头，每个镜头突出产品卖点与用户利益，输出分镜 JSON 数组，每个镜头必须包含：title、scene、script(内容/该镜文案句，可读句子，直接摘自文案)、voiceover(配音句)、subtitle(字幕)、prompt(图片提示词，英文，突出产品与使用场景，与 script 严格分开)、aspect(图片比例)。",
  },
  {
    id: "story",
    titleKey: "storyboardPreset.story",
    body:
      "你是短视频叙事导演。将文案拆分为「起承转合」的故事节奏镜头，制造情绪起伏与结尾反转，输出分镜 JSON 数组，每个镜头必须包含：title、scene、script(内容/该镜文案句，可读句子，直接摘自文案)、voiceover(配音句)、subtitle(字幕)、prompt(图片提示词，英文，含人物表情/环境氛围/景别，与 script 严格分开)、aspect(图片比例)。",
  },
];

export type WizardNodeStatus = "done" | "running" | "waiting" | "stale" | "pending" | "failed";

// PRD §4.2 — display names for the 10 steps (unified numbering for both modes;
// step 5 = i2v generation, skipped on the static mode).
export const STEP_NAMES: Record<number, string> = {
  1: "S1 选题",
  2: "S2 文案",
  3: "S3 分镜",
  4: "S4 逐镜生图",
  5: "S5 生成视频",
  6: "S6 配音",
  7: "S7 字幕",
  8: "S8 合成",
  9: "S9 复检",
  10: "S10 开放导出",
};

// Alias kept for readability at call sites; identical to STEP_NAMES in v2.
export const I2V_STEP_NAMES: Record<number, string> = STEP_NAMES;

// PIPELINE_TASK_10: prompts center entry as returned by GET /api/prompts.
// NOTE: the backend `type` enum is English (product_parse / benchmark_analysis
// / script / title / style / storyboard / compliance) — display labels come
// from i18n via PROMPT_TYPE_LABELS.
export type PromptType =
  | "product_parse"
  | "benchmark_analysis"
  | "script"
  | "title"
  | "style"
  | "storyboard"
  | "compliance";

export type Prompt = {
  id: string;
  user_id: string;
  type: PromptType;
  name: string;
  scenario: string | null;
  body: string;
  tags: string[];
  enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export const PROMPT_TYPES: PromptType[] = [
  "product_parse",
  "benchmark_analysis",
  "script",
  "title",
  "style",
  "storyboard",
  "compliance",
];

// Prompt type → i18n label key (display names, zh/en).
export const PROMPT_TYPE_LABELS: Record<PromptType, string> = {
  product_parse: "prompts.type_product",
  benchmark_analysis: "prompts.type_benchmark",
  script: "prompts.type_template",
  title: "prompts.type_title",
  style: "prompts.type_style",
  storyboard: "prompts.type_storyboard",
  compliance: "prompts.type_compliance",
};

// ── CORE-FEATURES: 可配置规则（rewrite / split / image / i2v）───────────────
export type RuleKind = "rewrite" | "split" | "image" | "i2v";

export type Rule = {
  id: string;
  user_id: string;
  kind: RuleKind;
  name: string;
  body: string;
  enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export const RULE_KINDS: RuleKind[] = ["rewrite", "split", "image", "i2v"];

// Rule kind → i18n label key (display names, zh/en).
export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  rewrite: "rules.kind_rewrite",
  split: "rules.kind_split",
  image: "rules.kind_image",
  i2v: "rules.kind_i2v",
};

// Tailwind classes for each step status. Shared by the status badge across the
// workbench so the states always look the same on cards and the timeline.
// DESIGN-BRIEF v2.2 §B：低饱和状态色（运行 #d4a24c / 完成 #7aa87a /
// 失败 #c25b4e / 跳过 #5f5a53），8px 圆点 + 细边框文字标签，不用彩虹大药丸。
export const STATUS_STYLE: Record<StepStatus, { badge: string; dot: string }> = {
  queued: {
    badge: "border-[#5f5a53] text-[#98938a]",
    dot: "bg-[#5f5a53]",
  },
  running: {
    badge: "border-[#d4a24c] text-[#d4a24c]",
    dot: "bg-[#d4a24c]",
  },
  waiting: {
    badge: "border-[#d4a24c] text-[#d4a24c]",
    dot: "bg-[#d4a24c]",
  },
  done: {
    badge: "border-[#7aa87a] text-[#7aa87a]",
    dot: "bg-[#7aa87a]",
  },
  failed: {
    badge: "border-[#c25b4e] text-[#c25b4e]",
    dot: "bg-[#c25b4e]",
  },
  skipped: {
    badge: "border-[#5f5a53] text-[#98938a]",
    dot: "bg-[#5f5a53]",
  },
  cancelled: {
    badge: "border-[#5f5a53] text-[#5f5a53] line-through",
    dot: "bg-[#5f5a53]",
  },
};
