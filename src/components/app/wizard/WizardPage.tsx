"use client";

// WizardPage — shared task-detail wizard (PIPELINE_TASK_12/13).
//
// A faithful re-skin of the static prototype `shop-video-clone/pages/task-detail.html`:
//   · left rail of 6 pipeline stages (S1 文案 … S6 生成视频) with per-stage status
//     styling (done / active / skipped / pending); each stage maps to one or more
//     backend steps + a primary wizard node (RAIL_STAGES_S6_* in app-data.ts)
//   · right content panel showing the selected stage's node editor
//   · panel-head action bar (半自动 / 全自动 / status chip / 回到本步修改)
//   · a re-skinned 重新生成 modal (直接重新生成 / 按要求调整)
//
// Every advanced feature from Task 11 is preserved unchanged — the API calls,
// request bodies and handlers are byte-identical to the former
// `app/projects/[id]/page.tsx`: regenerate, script versions, per-shot
// candidates, reference-image upload, voice replacement, BGM upload, subtitle
// rhythm settings, storyboard editing, and the download-export streaming link.
//
// The component is driven by an optional `taskId` (pin a specific task) and an
// optional `projectId` (pin a project). When `taskId` is omitted the component
// follows the project's latest task (used by the project detail page); when it
// is given (the tasks/[id] page) it stays pinned to that task.
//
// React #310: hooks must run unconditionally — the loading/error early returns
// below come after every hook so the hook count never changes between renders.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectStatusBadge, Spinner } from "@/components/app-ui";
import { Btn } from "@/components/app/proto";
import { apiRaw, parseErrorBody, type ApiErrorBody } from "@/lib/api-client";
import { StageCard } from "./StageCard";
import { ShotGrid } from "./ShotGrid";
import { StoryboardTable } from "./StoryboardTable";
import {
  RAIL_STAGES_S6_I2V,
  RAIL_STAGES_S6_STATIC,
  RULE_KIND_LABELS,
  STORYBOARD_PRESETS,
  WIZARD_NODES_I2V,
  WIZARD_NODES_STATIC,
  type ModelClass,
  type ModelConfig,
  type RailStage,
  type Rule,
  type RuleKind,
  type StepStatus,
  type TaskConfig,
  type TaskDetail,
  type WizardNode,
  type WizardNodeStatus,
} from "@/lib/app-data";
import { useTranslation, type TFunc } from "@/i18n";
import { useSetTopMeta } from "@/components/app/layout/TopMeta";

const MODEL_CLASSES: ModelClass[] = ["llm", "image", "tts", "i2v"];

// User-facing node title key per node id (static & i2v share ids 1-5, then
// id 6 is clips-for-i2v / composition-for-static, id 7 is composition).
const NODE_TITLE_KEYS: Record<number, (synthesis: "static" | "i2v") => string> = {
  1: () => "pipeline.topicParsing",
  2: () => "pipeline.scriptGeneration",
  3: () => "pipeline.storyboard",
  4: () => "pipeline.shotImages",
  5: () => "pipeline.voiceoverSubtitles",
  6: (s) => (s === "i2v" ? "pipeline.aiMotionClips" : "pipeline.composition"),
  7: () => "pipeline.composition",
  8: () => "pipeline.reviewCheck",
  9: () => "pipeline.exportZip",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Step 2（L2 文案）的提示模板 type 键：用户文案内容统一存 config.prompts.script
// （与 quick 页同键，L2 注入 {{custom_prompt}}），模板覆盖存
// config.templates['文案模板']（type 字符串键，后端 promptOverride 按 type 查询）。
const L2_TEMPLATE_TYPE = "文案模板";

type ShotEdit = {
  index: number;
  duration: number;
  scene: string;
  script: string;
  voiceover: string;
  subtitle: string;
  prompt: string;
  title: string;
  aspect: string;
  motion: string;
  ref_key: string | null;
  candidates?: Array<{ key: string; is_default: boolean }>;
  clip_candidates?: Array<{ key: string; is_default: boolean }>;
};

// A script version as returned by POST /api/tasks/:id/script/versions and
// stored in task.config.script_versions. Fields follow the backend ScriptVersion
// contract: version_id / note / selected / created_at (NOT id / is_selected).
type ScriptVersionItem = {
  version_id: string;
  note: string | null;
  selected: boolean;
  created_at: string;
};

// PIPELINE_TASK_13 — subtitle config surfaced in the wizard (S4 配音与字幕) and
// sent to the backend via POST /api/tasks/:id/subtitle-settings. Mirrors the
// backend whitelist: enabled / position / font_size / max_chars_per_line.
type SubtitleSettings = {
  enabled?: boolean;
  position?: "top" | "center" | "bottom";
  font_size?: number;
  max_chars_per_line?: number;
};

export function WizardPage({ taskId, projectId }: { taskId?: string; projectId?: string }) {
  const { t } = useTranslation();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);

  // C3 — 任务详情 top-meta（原型：`static · managed 托管档 · run mode: semi`），
  // 由 taskDetail 动态组合并覆盖 TopBar 静态映射。
  const detailMeta = useMemo(() => {
    if (!taskDetail) return null;
    const track =
      taskDetail.track === "managed"
        ? "managed 托管档"
        : taskDetail.track === "byok"
          ? "BYOK"
          : (taskDetail.track ?? "");
    return `${taskDetail.mode} · ${track} · run mode: ${taskDetail.run_mode}`;
  }, [taskDetail]);
  useSetTopMeta(detailMeta);

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  // 功能引导（琥珀色提示，非错误）：上传参考图/配音、clip 候选等「即将开放」
  // 的能力给出下一步建议，避免看起来像故障。
  const [runInfo, setRunInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Run configuration (next run): run mode. The composition mode is fixed by the
  // task (quick-gen page) — the run reuses the task's existing synthesis mode.
  const [runMode, setRunMode] = useState<"semi" | "auto">("auto");

  // Task 6: live enabled model_configs entries per class.
  const [modelConfigs, setModelConfigs] = useState<Record<ModelClass, ModelConfig[]>>({
    llm: [],
    image: [],
    tts: [],
    i2v: [],
  });

  // Prompt-center templates (for per-node prompt switching on the detail page).
  type PromptListItem = {
    id: string;
    type: string;
    name: string;
    body: string;
    enabled: boolean;
    is_default?: boolean;
    updated_at?: string;
  };
  const [prompts, setPrompts] = useState<Array<PromptListItem>>([]);
  // CORE-FEATURES — 可配置规则列表（节点内「生成规则」面板数据源）。
  const [rules, setRules] = useState<Array<Rule>>([]);

  // Wizard selection: which of the 9 pipeline steps is selected in the rail.
  const [selectedStep, setSelectedStep] = useState<number>(1);
  // Nodes whose downstream was edited but not yet re-run (→ stale badge).
  const [staleNodes, setStaleNodes] = useState<Set<number>>(new Set());

  // Editable content buffers.
  const [scriptText, setScriptText] = useState("");
  const [scriptVersions, setScriptVersions] = useState<ScriptVersionItem[]>([]);
  const [shotEdits, setShotEdits] = useState<ShotEdit[] | null>(null);
  const [ttsEntryId, setTtsEntryId] = useState<string>("");
  const [subtitleText, setSubtitleText] = useState("");
  const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>({});
  const [enlargedShot, setEnlargedShot] = useState<number | null>(null);
  const [bgmKey, setBgmKey] = useState<string | null>(null);

  // PIPELINE_TASK_11: regenerate modal — { node, scope, index?, mode } drives
  // the "直接重新生成 / 按要求调整" dialog.
  const [regModal, setRegModal] = useState<{
    node: number;
    scope: "all" | "single";
    index?: number;
    mode: "direct" | "with-prompt";
    prompt?: string;
  } | null>(null);

  // Tracks the active step so we can auto-select it on status transitions.
  const lastActiveStepRef = useRef<number | null>(null);

  const refreshTaskDetail = useCallback(
    async (tid?: string) => {
      const id = tid ?? taskId;
      if (!id) return;
      try {
        const res = await apiRaw(`/api/tasks/${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as TaskDetail;
        setTaskDetail(data);
      } catch {
        // Non-fatal — the wizard still works without the task detail.
      }
    },
    [taskId],
  );

  // V2: 刷新任务详情（GET /api/tasks/:id 直接返回扁平任务对象，无嵌套 .task）。
  const refresh = useCallback(async () => {
    try {
      await refreshTaskDetail();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [refreshTaskDetail, t]);

  // Initial load: a pinned task loads directly; with only a project id we
  // resolve the project's latest task via GET /api/tasks?project_id=… (v2 has
  // no GET /api/projects/:id), then load that task.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let detail: TaskDetail | null = null;
        if (taskId) {
          const res = await apiRaw(`/api/tasks/${encodeURIComponent(taskId)}`, {
            cache: "no-store",
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          detail = (await res.json()) as TaskDetail;
          if (!cancelled) setTaskDetail(detail);
        } else if (projectId) {
          const listRes = await apiRaw(
            `/api/tasks?project_id=${encodeURIComponent(projectId)}`,
            { cache: "no-store" },
          );
          if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
          const list = (await listRes.json()) as { items?: Array<{ id: string }> };
          const latestId = list.items?.[0]?.id;
          if (!latestId) {
            if (!cancelled) setError(t("app.projectNotFound"));
            return;
          }
          const res = await apiRaw(`/api/tasks/${encodeURIComponent(latestId)}`, {
            cache: "no-store",
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          detail = (await res.json()) as TaskDetail;
          if (!cancelled) setTaskDetail(detail);
        }
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("app.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, projectId, t]);

  // Task 6: load enabled model_configs entries for the model dropdowns.
  useEffect(() => {
    apiRaw("/api/model-configs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.items ?? (Array.isArray(d) ? d : []);
        const byClass: Record<ModelClass, ModelConfig[]> = { llm: [], image: [], tts: [], i2v: [] };
        for (const cls of MODEL_CLASSES) {
          byClass[cls] = list.filter((e: ModelConfig) => e.provider_class === cls && e.enabled);
        }
        setModelConfigs(byClass);
      })
      .catch(() => setModelConfigs({ llm: [], image: [], tts: [], i2v: [] }));
  }, []);

  // Load prompt-center templates so each node can offer a template switch.
  useEffect(() => {
    apiRaw("/api/prompts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.items ?? (Array.isArray(d) ? d : []);
        setPrompts(list);
      })
      .catch(() => setPrompts([]));
    // CORE-FEATURES — 规则列表（4 类可配规则，任务详情「生成规则」面板数据源）。
    apiRaw("/api/rules", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.items ?? (Array.isArray(d) ? d : []);
        setRules(list);
      })
      .catch(() => setRules([]));
  }, []);

  // Poll while a run is in flight OR the task is semi-paused (waiting).
  useEffect(() => {
    if (!taskDetail) return;
    const isActive =
      taskDetail.status === "running" ||
      taskDetail.status === "queued" ||
      taskDetail.status === "waiting";
    if (!isActive) return;
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [taskDetail, refresh]);

  // Node list depends on the task's composition mode.
  const task = taskDetail;
  const taskConfig = task?.config ?? null;
  // B1 — config.title 为任务名补充字段（TaskConfig 类型未声明），页面用它作标题。
  const taskCfg = taskConfig as (TaskConfig & { title?: string }) | null;
  const taskSynthesis: "static" | "i2v" = taskDetail?.mode ?? "static";
  const nodes: WizardNode[] = taskSynthesis === "i2v" ? WIZARD_NODES_I2V : WIZARD_NODES_STATIC;
  // PIPELINE_TASK_13 — S1-S6 rail stages. Each stage covers backend steps (for
  // status) and a primary wizard node (for the editor panel); backend step/node
  // numbers are unchanged — API calls (save node / regenerate / rerun) still use
  // them.
  const stages: RailStage[] = taskSynthesis === "i2v" ? RAIL_STAGES_S6_I2V : RAIL_STAGES_S6_STATIC;
  const totalBackendSteps = taskSynthesis === "i2v" ? 10 : 9;
  const steps = useMemo(
    () => taskDetail?.steps ?? [],
    [taskDetail],
  );
  const stepByNumber = useMemo(() => {
    const m: Record<number, StepStatus> = {};
    for (const s of steps) m[s.step] = s.status;
    return m;
  }, [steps]);

  // Derive a node's status from the underlying step statuses + task state.
  const nodeStatus = useCallback(
    (node: WizardNode): WizardNodeStatus => {
      if (staleNodes.has(node.id)) return "stale";
      const cur = task?.current_step ?? 1;
      const tStatus = task?.status ?? "draft";

      if (node.steps.includes(cur)) {
        if (tStatus === "waiting") return "waiting";
        if (tStatus === "running") return "running";
        if (tStatus === "failed") return "failed";
      }
      if (node.steps.some((s) => stepByNumber[s] === "running")) return "running";
      if (node.steps.some((s) => stepByNumber[s] === "failed")) return "failed";
      if (node.steps.every((s) => stepByNumber[s] === "done")) return "done";
      if (node.steps.every((s) => s < cur)) return "done";
      return "pending";
    },
    [staleNodes, task, stepByNumber],
  );

  // Auto-select the active stage when the task advances or pauses — map the
  // backend current_step to the S1-S6 stage that covers it. The S5 review gate
  // has no own backend step; its pause point (current_step = total-2, waiting)
  // is also covered by the S6 composition stage, so the gate check comes first
  // to surface the 复核 panel until the user confirms.
  /* eslint-disable react-hooks/set-state-in-effect -- deliberate auto-selection sync from backend task progress (preserved from the original wizard) */
  useEffect(() => {
    const cur = task?.current_step;
    if (!cur) return;
    if (task?.status !== "done") {
      if (lastActiveStepRef.current !== cur) {
        lastActiveStepRef.current = cur;
        const gate = (task?.status === "waiting" && cur === totalBackendSteps - 2)
          ? stages.find((s) => s.gate)
          : undefined;
        if (gate) setSelectedStep(gate.id);
        else {
          const stage = stages.find((s) => s.steps.includes(cur));
          if (stage) setSelectedStep(stage.id);
        }
      }
    }
  }, [task?.current_step, task?.status, stages, totalBackendSteps]);

  // Sync editable buffers when the task detail (or active node) changes.
  /* eslint-disable react-hooks/set-state-in-effect -- deliberate sync of fetched task data into editor buffers (preserved from the original wizard) */
  useEffect(() => {
    if (!taskDetail) return;
    const config = taskDetail.config ?? {};
    const s2 = taskDetail.steps.find((s) => s.step === 2);
    const script = (s2?.payload as { script?: string } | null)?.script;
    // Show only the actually generated script. Never fall back to
    // config.source_text (the creation-time prompt) — that made the
    // 文案 node display the prompt as if it were the script.
    if (script) setScriptText(script);
    else setScriptText("");
    setScriptVersions((config.script_versions as unknown as ScriptVersionItem[] | undefined) ?? []);
    if (taskDetail.storyboard?.shots) {
      setShotEdits(
        taskDetail.storyboard.shots.map((s) => ({
          index: s.index,
          duration: s.duration,
          scene: s.scene,
          script: s.script,
          voiceover: s.voiceover,
          subtitle: s.subtitle ?? s.script ?? "",
          prompt: s.prompt,
          title: s.title ?? t("taskDetail.shotFallback", { n: s.index }),
          aspect: s.aspect ?? "16:9",
          motion: s.motion ?? "",
          ref_key: s.ref_key ?? null,
          candidates: s.candidates,
          clip_candidates: s.clip_candidates,
        })),
      );
    } else {
      setShotEdits(null);
    }
    const ttsEntries = modelConfigs.tts ?? [];
    const cfgVoice = config.tts?.voice;
    const defaultVoice = ttsEntries.find((e) => e.is_default)?.voice ?? ttsEntries[0]?.voice ?? "";
    const currentVoice = cfgVoice ?? defaultVoice;
    const entry = ttsEntries.find((e) => e.voice === currentVoice) ?? ttsEntries[0];
    setTtsEntryId(entry?.id ?? "");
    if (config.subtitles?.text) setSubtitleText(config.subtitles.text);
    else if (taskDetail.storyboard?.shots) {
      setSubtitleText(
        taskDetail.storyboard.shots
          .map((s) => s.voiceover || s.script || "")
          .filter((txt) => txt.trim() !== "")
          .join("\n"),
      );
    }
    setSubtitleSettings(config.subtitle ?? {});
    setBgmKey(config.bgm_key ?? null);
  }, [taskDetail, modelConfigs.tts, t]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // -------------------------------------------------------------------------
  // Run / continue
  // -------------------------------------------------------------------------

  const handleRun = async () => {
    if (running || !taskDetail || isActive) return;
    setRunning(true);
    setRunError(null);
    setRunInfo(null);
    try {
      // V2: 无 POST /api/projects/:id/run；整程重跑 = POST /:id/rerun from_step 1。
      const res = await apiRaw(`/api/tasks/${encodeURIComponent(taskDetail.id)}/rerun`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_step: 1, scope: "step" }),
      });
      const data = (await res.json().catch(() => null)) as
        | { status?: string; error?: string }
        | null;
      if (!res.ok || data?.status !== "queued") {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      clearStale();
      await refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.runTriggerFailed"));
    } finally {
      setRunning(false);
    }
  };

  // 向导「选模板/存提示词」的真实持久化：PUT /api/tasks/:id/config 写入
  // task.config.templates / prompts（V2-P7 新增端点），刷新后 resolvedPrompt
  // 即读到新值，不再只是本地记忆。
  const persistTaskConfig = async (patch: Record<string, unknown>) => {
    if (!taskDetail || busy) return false;
    setBusy(true);
    setRunError(null);
    setRunInfo(null);
    try {
      const res = await apiRaw(
        `/api/tasks/${encodeURIComponent(taskDetail.id)}/config`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const data = (await res.json().catch(() => null)) as ApiErrorBody | null;
      if (!res.ok) {
        const { message } = parseErrorBody(data ?? {});
        throw new Error(message || `HTTP ${res.status}`);
      }
      await refresh();
      return true;
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.saveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handlePickTemplate = async (step: number, templateId: string | null) => {
    // Step 2（L2 文案）用 type 键（'文案模板'）写 config.templates，其余步骤沿用
    // 数字键（历史行为）——后端 promptOverride 按 type 字符串查询。
    const key: number | string = step === 2 ? L2_TEMPLATE_TYPE : step;
    const next = { ...(taskConfig?.templates ?? {}), [key]: templateId };
    await persistTaskConfig({ templates: next });
  };

  // Save the edited prompt text as this step's custom prompt (config.prompts).
  const handleSavePrompt = async (step: number, text: string) => {
    // Step 2 的编辑文案属「内容输入」，统一存 config.prompts.script（与 quick 页
    // 同键，L2 步骤注入 {{custom_prompt}}）；其余步骤沿用数字键（历史行为）。
    const key = step === 2 ? "script" : String(step);
    const next = { ...(taskConfig?.prompts ?? {}), [key]: text };
    await persistTaskConfig({ prompts: next });
  };

  // Save the edited text as a NEW prompt-center template (另存为), then select it.
  const handleSavePromptAs = async (
    step: number,
    type: string,
    name: string,
    text: string,
  ): Promise<boolean> => {
    if (!taskDetail) return false;
    try {
      const res = await apiRaw("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: name.trim() || `自定义-S${step}`,
          body: text,
          enabled: true,
        }),
      });
      if (!res.ok) return false;
      const d = (await res.json().catch(() => null)) as { id?: string } | null;
      // Reload the template list so the new template shows up in the picker.
      const pr = await apiRaw("/api/prompts", { cache: "no-store" });
      const pd = (await pr.json().catch(() => null)) as
        | { items?: Array<PromptListItem> }
        | Array<PromptListItem>
        | null;
      const list = Array.isArray(pd) ? pd : (pd?.items ?? []);
      setPrompts(list);
      // Select the newly saved template for this step (like 另存为 → switch to it).
      if (d?.id) await handlePickTemplate(step, d.id);
      return true;
    } catch {
      return false;
    }
  };

  // CORE-FEATURES — 切换某类规则：写入 task.config.rules[kind]（null 取消 → 系统默认）。
  const handlePickRule = async (kind: RuleKind, ruleId: string | null) => {
    const next = { ...(taskConfig?.rules ?? {}), [kind]: ruleId };
    await persistTaskConfig({ rules: next });
  };

  const handleContinue = async () => {
    if (!taskDetail || busy) return;
    setBusy(true);
    setRunError(null);
    setRunInfo(null);
    try {
      const res = await apiRaw(
        `/api/tasks/${encodeURIComponent(taskDetail.id)}/continue`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "continue" }),
        },
      );
      const data = (await res.json().catch(() => null)) as { status?: string; error?: string } | null;
      // V2 响应 {id, status:'running', current_step}（无 ok 字段）。
      if (!res.ok || data?.status !== "running") {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.continueFailed"));
    } finally {
      setBusy(false);
    }
  };

  // -------------------------------------------------------------------------
  // Node edit + rerun
  // -------------------------------------------------------------------------

  const markStale = (fromNode: number) => {
    setStaleNodes((prev) => {
      const next = new Set(prev);
      for (const n of nodes) if (n.id >= fromNode) next.add(n.id);
      return next;
    });
  };

  const clearStale = () => setStaleNodes(new Set());

  // 按后端返回的 stale_steps（脚本改动后 [3..10]、分镜 [4..10]…）精确标记
  // 对应阶段节点为 stale，而不是把 0 起全部标脏。
  const markStaleSteps = (steps: number[]) => {
    if (!Array.isArray(steps) || steps.length === 0) return;
    setStaleNodes((prev) => {
      const next = new Set(prev);
      for (const n of nodes) {
        if (n.steps.some((s) => steps.includes(s))) next.add(n.id);
      }
      return next;
    });
  };

  const saveNodeAndMaybeRerun = async (node: number, content: Record<string, unknown>) => {
    if (!taskDetail) return;
    setBusy(true);
    setRunError(null);
    setRunInfo(null);
    try {
      // V2: node 名映射 + payload 形状（PUT /api/tasks/:id/node）。
      const nodeName = node === 2 ? "script" : node === 3 || node === 4 ? "storyboard" : "voice";
      let payload: Record<string, unknown> = { ...content };
      if (node === 2) {
        // 后端 script 节点存 script_paragraphs（按空行拆段），并 merge prev[2]。
        const script = String(content.script ?? "");
        payload = {
          ...content,
          script_paragraphs: script
            .split(/\n\s*\n+/)
            .map((p) => p.trim())
            .filter(Boolean),
        };
      }
      if (node === 5) {
        // 后端 voice 节点接受 {shots:[{index,voiceover}]}；逐镜配音句。
        const lines = String(content.subtitle ?? "")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        payload = {
          shots: (shotEdits ?? []).map((s, i) => ({
            index: s.index,
            voiceover: lines[i] ?? s.voiceover,
          })),
        };
      }
      const res = await apiRaw(
        `/api/tasks/${encodeURIComponent(taskDetail.id)}/node`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ node: nodeName, payload }),
        },
      );
      const data = (await res.json().catch(() => null)) as ApiErrorBody & {
        status?: string;
        rerun_from?: number;
      } | null;
      if (!res.ok || data?.status !== "ok") {
        const { message } = parseErrorBody(data ?? {});
        throw new Error(message || `HTTP ${res.status}`);
      }
      // 节点已受控写入 → 下游标记 stale，等待用户「回到本步修改」或自动重跑。
      markStale(node + 1);
      await refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const doRerun = async (from: number) => {
    if (!taskDetail) return;
    setBusy(true);
    setRunError(null);
    setRunInfo(null);
    try {
      // V2: POST /:id/rerun {from_step, scope:'step'} → {id,status:'queued',…}。
      const res = await apiRaw(
        `/api/tasks/${encodeURIComponent(taskDetail.id)}/rerun`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from_step: from, scope: "step" }),
        },
      );
      const data = (await res.json().catch(() => null)) as ApiErrorBody & {
        status?: string;
        current_step?: number;
      } | null;
      if (!res.ok || data?.status !== "queued") {
        const { message } = parseErrorBody(data ?? {});
        throw new Error(message || `HTTP ${res.status}`);
      }
      clearStale();
      await refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.rerunFailed"));
    } finally {
      setBusy(false);
    }
  };

  // -------------------------------------------------------------------------
  // PIPELINE_TASK_11 — node regeneration + version/candidate actions
  // -------------------------------------------------------------------------

  const handleRegenerate = async () => {
    if (!taskDetail || !regModal || busy) return;
    setBusy(true);
    setRunError(null);
    setRunInfo(null);
    const { node, scope, index, mode } = regModal;
    const instruction = mode === "with-prompt" ? (regModal.prompt ?? "").trim() : undefined;
    try {
      const tid = encodeURIComponent(taskDetail.id);
      const mk = async (path: string, body?: Record<string, unknown>) => {
        const res = await apiRaw(`/api/tasks/${tid}${path}`, {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = (await res.json().catch(() => null)) as ApiErrorBody & Record<string, unknown> | null;
        if (!res.ok) {
          const { message } = parseErrorBody(data ?? {});
          throw new Error(message || `HTTP ${res.status}`);
        }
        return data as (ApiErrorBody & Record<string, unknown>) | null;
      };

      // V2 端点分发（不存在 v1 的 /tasks/:id/regenerate）：
      //   node2 脚本 → script/regenerate；node3 分镜 → storyboard/regenerate；
      //   node4 生图 / node5 配音 / node6(i2v) 片段 → rerun 或单镜 regenerate；
      //   单镜 → shots/:index/regenerate、voice/regenerate、clips/:index/regenerate。
      let data: (ApiErrorBody & Record<string, unknown>) | null = null;
      if (node === 2 && scope === "all") {
        data = await mk("/script/regenerate", instruction ? { instruction } : {});
      } else if (node === 3 && scope === "all") {
        data = await mk("/storyboard/regenerate", instruction ? { instruction } : {});
      } else if (node === 3 && scope === "single" && index) {
        data = await mk(`/shots/${index}/regenerate`, instruction ? { prompt_override: instruction } : {});
      } else if (node === 4 && scope === "all") {
        data = await mk("/rerun", { from_step: 4, scope: "step" });
      } else if (node === 4 && scope === "single" && index) {
        data = await mk(`/shots/${index}/regenerate`, instruction ? { prompt_override: instruction } : {});
      } else if (node === 5 && scope === "all") {
        // S6 配音起整步重跑（含下游字幕/合成/导出/复检）。
        data = await mk("/rerun", { from_step: 6, scope: "step" });
      } else if (node === 5 && scope === "single" && index) {
        data = await mk("/voice/regenerate", { index });
      } else if (node === 6 && scope === "all" && taskSynthesis === "i2v") {
        // i2v: S5 生成视频起整步重跑（全部片段）。
        data = await mk("/rerun", { from_step: 5, scope: "step" });
      } else if (node === 6 && scope === "single" && index && taskSynthesis === "i2v") {
        data = await mk(`/clips/${index}/regenerate`);
      } else {
        throw new Error(t("pipeline.regenUnsupported"));
      }

      setRegModal(null);
      // script/regenerate 同步重写 step2 + 自动记录新版本，响应为
      // {id, step:2, status:'running', new_version_id, stale_steps:[3..10]}，
      // 不含 script 文本 — 新文案经下方 refresh() 从 step2 payload 读回。
      // 各 regenerate 端点返回 stale_steps（脚本 [3..10]、分镜 [4..10]、单镜 …），
      // 按返回值精确标记；rerun/候选确认等无 stale_steps 时沿用旧逻辑
      // （queued/payload/storyboard → 清 stale，否则全部标脏）。
      const respStale = (data as { stale_steps?: number[] } | null)?.stale_steps;
      if (Array.isArray(respStale) && respStale.length > 0) {
        markStaleSteps(respStale);
      } else if ((data as { status?: string } | null)?.status === "queued" || (data as { payload?: unknown }).payload || (data as { storyboard?: unknown }).storyboard) {
        clearStale();
      } else {
        markStale(0);
      }
      await refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.rerunFailed"));
    } finally {
      setBusy(false);
    }
  };

  const saveScriptVersion = async () => {
    if (!taskDetail || !scriptText.trim() || busy) return;
    setBusy(true);
    setRunError(null);
    setRunInfo(null);
    try {
      // V2 契约：POST /:id/script/versions {op:'save', text, note?} → 存版本并
      // 应用为当前脚本 → {versions:[{version_id,note,selected,created_at}], stale_steps}。
      const res = await apiRaw(
        `/api/tasks/${encodeURIComponent(taskDetail.id)}/script/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "save", text: scriptText.trim() }),
        },
      );
      const data = (await res.json().catch(() => null)) as ApiErrorBody & {
        versions?: ScriptVersionItem[];
        stale_steps?: number[];
      } | null;
      if (!res.ok) {
        const { message } = parseErrorBody(data ?? {});
        throw new Error(message || `HTTP ${res.status}`);
      }
      if (data?.versions) setScriptVersions(data.versions);
      markStaleSteps(data?.stale_steps ?? []);
      await refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const selectScriptVersion = async (versionId: string) => {
    if (!taskDetail || busy) return;
    setBusy(true);
    setRunError(null);
    setRunInfo(null);
    try {
      // V2 契约：POST /:id/script/versions {op:'select', version_id} → 应用该版本
      // → {versions:[{version_id,note,selected,created_at}], stale_steps}。
      const res = await apiRaw(
        `/api/tasks/${encodeURIComponent(taskDetail.id)}/script/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "select", version_id: versionId }),
        },
      );
      const data = (await res.json().catch(() => null)) as ApiErrorBody & {
        versions?: ScriptVersionItem[];
        stale_steps?: number[];
      } | null;
      if (!res.ok) {
        const { message } = parseErrorBody(data ?? {});
        throw new Error(message || `HTTP ${res.status}`);
      }
      if (data?.versions) setScriptVersions(data.versions);
      markStaleSteps(data?.stale_steps ?? []);
      await refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const selectCandidate = async (index: number, key: string, kind: "image" | "clip") => {
    if (!taskDetail || busy) return;
    // V2 后端 candidates 端点只处理 image（shot.candidates），clip 候选无确认端点
    // （API 缺口——见 P6 复查缺口清单），前端给出功能引导而非报错。
    if (kind === "clip") {
      setRunError(null);
      setRunInfo(t("taskDetail.clipCandidateGuide"));
      return;
    }
    setBusy(true);
    setRunError(null);
    setRunInfo(null);
    try {
      const res = await apiRaw(
        `/api/tasks/${encodeURIComponent(taskDetail.id)}/shots/${index}/candidates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm", key }),
        },
      );
      const data = (await res.json().catch(() => null)) as ApiErrorBody & {
        default_key?: string;
        candidates?: Array<{ key: string; is_default: boolean }>;
      } | null;
      if (!res.ok) {
        const { message } = parseErrorBody(data ?? {});
        throw new Error(message || `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const uploadShotRef = async (index: number, file: File) => {
    // V2 后端无 /shots/:index/ref 上传端点（API 缺口——见 P6 复查缺口清单），
    // 前端给出功能引导而非报错。
    void index; void file;
    setRunError(null);
    setRunInfo(t("taskDetail.uploadRefGuide"));
  };

  const uploadShotVoice = async (index: number, file: File) => {
    // V2 后端无 /shots/:index/voice 上传端点（API 缺口——见 P6 复查缺口清单），
    // 前端给出功能引导而非报错。
    void index; void file;
    setRunError(null);
    setRunInfo(t("taskDetail.uploadVoiceGuide"));
  };

  const uploadBgm = async (file: File) => {
    if (!taskDetail || busy) return;
    setBusy(true);
    setRunError(null);
    setRunInfo(null);
    try {
      const buf = await file.arrayBuffer();
      // V2: POST /api/bgm（二进制 + X-BGM-Filename）→ 201 {bgm_key,url,size,duration}。
      // 后端无任务级绑定端点 → 上传后仅本地记忆（API 缺口——见 P6 复查缺口清单）。
      const res = await apiRaw("/api/bgm", {
        method: "POST",
        headers: { "X-BGM-Filename": file.name },
        body: buf,
      });
      const data = (await res.json().catch(() => null)) as { bgm_key?: string; error?: string } | null;
      if (!res.ok || !data?.bgm_key) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setBgmKey(data.bgm_key);
      await refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const removeBgm = async () => {
    // V2 后端无移除 BGM 端点 → 仅本地清除（API 缺口——见 P6 复查缺口清单）。
    setBgmKey(null);
  };

  const saveSubtitleSettings = async () => {
    if (!taskDetail || busy) return;
    setBusy(true);
    setRunError(null);
    setRunInfo(null);
    try {
      // V2: POST /:id/subtitle-settings → {id, config, stale_steps}。
      // position 仅接受 'top'|'bottom'（前端 'center' 归到 'bottom'）。
      const s = subtitleSettings;
      const res = await apiRaw(
        `/api/tasks/${encodeURIComponent(taskDetail.id)}/subtitle-settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chars_per_line: s.max_chars_per_line ?? 20,
            font_size: s.font_size ?? 48,
            position: s.position === "top" ? "top" : "bottom",
            subtitle_burn: s.enabled !== false,
          }),
        },
      );
      const data = (await res.json().catch(() => null)) as ApiErrorBody & {
        config?: {
          subtitle?: SubtitleSettings;
          synthesis?: { subtitle_burn?: boolean };
        };
      } | null;
      if (!res.ok) {
        const { message } = parseErrorBody(data ?? {});
        throw new Error(message || `HTTP ${res.status}`);
      }
      const sub = data?.config?.subtitle;
      if (sub) {
        setSubtitleSettings({
          enabled: data?.config?.synthesis?.subtitle_burn ?? sub.enabled ?? true,
          max_chars_per_line: sub.max_chars_per_line,
          font_size: sub.font_size,
          position: sub.position ?? "bottom",
        });
      }
      await refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  // -------------------------------------------------------------------------
  // Derived UI state
  // -------------------------------------------------------------------------

  const currentStatus = task?.status ?? "draft";
  const isWaiting = currentStatus === "waiting";
  const isActive = currentStatus === "running" || currentStatus === "queued" || isWaiting;
  const canRun = !!taskDetail && !isActive && !running;

  // V2: assets 为扁平列表 [{id,type,index,url,size,checksum}]，url 可直接使用。
  // 前端类型 → 后端 asset.type：shots→shot、video→mp4、clips→clip、audio→audio、refs→ref。
  const assetUrl = (type: "shots" | "audio" | "clips" | "video" | "refs", file: string) => {
    const assetType =
      type === "shots" ? "shot" :
      type === "video" ? "mp4" :
      type === "clips" ? "clip" :
      type === "audio" ? "audio" :
      type === "refs" ? "ref" : null;
    if (!assetType) return null;
    const a = taskDetail?.assets.find(
      (x) => x.type === assetType && String(x.url).split("/").pop() === file,
    );
    return a?.url ?? null;
  };

  const hasAsset = (type: string, needle: string) =>
    taskDetail?.assets.some((a) => a.type === type && a.url.includes(needle)) ?? false;

  const finalVideoUrl = hasAsset("mp4", "final.mp4") ? assetUrl("video", "final.mp4") : null;
  const exportRow = taskDetail?.export ?? null;

  const handleDownloadExport = async () => {
    if (!taskDetail) return;
    try {
      const a = document.createElement("a");
      a.href = `/api/export/${encodeURIComponent(taskDetail.id)}`;
      a.download = "project-export.zip";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.downloadFailed"));
    }
  };

  // CORE-FEATURES — 每环节 zip 下载（script/split/images/audio/clips）。
  // 后端 GET /api/export/stage/:taskId/:stage 实时打包；直接触发浏览器下载。
  const handleDownloadStageZip = async (stage: "script" | "split" | "images" | "audio" | "clips") => {
    if (!taskDetail) return;
    try {
      const a = document.createElement("a");
      a.href = `/api/export/stage/${encodeURIComponent(taskDetail.id)}/${stage}`;
      a.download = `${stage}.zip`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.downloadFailed"));
    }
  };

  // Rail helpers (S1-S6 stage status, tag text, styling, panel hint).
  // A stage's status is derived from the backend steps it covers: any running /
  // waiting / failed / skipped step wins; all covered steps done (or all strictly
  // behind the task's current_step) → done; the current step inside the stage
  // follows the task status; otherwise queued.
  const stageStatus = (stage: RailStage): StepStatus => {
    // PIPELINE_TASK_13 — the S5 review gate covers no backend step; derive its
    // status from the task pause point instead. gateStep = total-2: static=7,
    // i2v=8 — the pipeline pauses there in "waiting" until the user confirms.
    if (stage.gate) {
      const cur = task?.current_step ?? 0;
      const tStatus = task?.status ?? "draft";
      const gateStep = totalBackendSteps - 2;
      if (cur === gateStep) {
        if (tStatus === "waiting") return "waiting";
        if (tStatus === "running") return "done"; // composition already advancing
        if (tStatus === "failed") return "failed";
      }
      if (stepByNumber[gateStep] === "done" || cur > gateStep) return "done";
      return "queued";
    }
    const covered = stage.steps;
    for (const s of covered) {
      const st = stepByNumber[s];
      if (st === "running") return "running";
      if (st === "waiting") return "waiting";
      if (st === "failed") return "failed";
      if (st === "skipped") return "skipped";
      if (st === "cancelled") return "cancelled";
    }
    if (covered.every((s) => stepByNumber[s] === "done")) return "done";
    const cur = task?.current_step ?? 0;
    if (covered.every((s) => s < cur)) return "done";
    if (covered.includes(cur)) {
      const tStatus = task?.status ?? "draft";
      if (tStatus === "waiting") return "waiting";
      if (tStatus === "running") return "running";
      if (tStatus === "failed") return "failed";
    }
    return "queued";
  };

  const stepTag = (st: StepStatus): string => {
    switch (st) {
      case "done":
        return t("pipelineStatus.done");
      case "running":
        return t("pipelineStatus.running");
      case "waiting":
        return t("pipelineStatus.waiting");
      case "failed":
        return t("pipelineStatus.failed");
      case "skipped":
        return t("pipelineStatus.skipped");
      case "cancelled":
        return t("pipelineStatus.cancelled");
      default:
        return t("taskDetail.pendingConfirm");
    }
  };

  // -------------------------------------------------------------------------
  // Batch B — 六阶段全览向导（原型 task-detail.html）：
  //   · 右侧内容区六阶段纵向铺开，每阶段一个可折叠 StageCard
  //   · 左 rail 改为锚点导航（点击滚动到对应阶段卡片并展开）
  //   · 顶部 4 统计列 + 底部 sticky 操作条
  // -------------------------------------------------------------------------

  // 每阶段卡片的折叠态（默认展开当前活动阶段 + 分镜/画面两个主编辑面）。
  const [expandedStages, setExpandedStages] = useState<Set<number>>(
    () => new Set([1, 2, 3]),
  );
  const initialExpandDone = useRef(false);

  useEffect(() => {
    if (!taskDetail || initialExpandDone.current) return;
    initialExpandDone.current = true;
    const cur = task?.current_step ?? 1;
    let active: number | undefined;
    if (task?.status === "waiting" && cur === totalBackendSteps - 2) {
      active = stages.find((s) => s.gate)?.id;
    } else {
      active = stages.find((s) => s.steps.includes(cur))?.id;
    }
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (active) next.add(active);
      // 任务完成 → 展开交付（合成/导出）看结果；否则保留分镜/画面两主面。
      if (task?.status === "done") {
        next.delete(2);
        next.delete(3);
        next.add(6);
      }
      return next;
    });
  }, [taskDetail, task, stages, totalBackendSteps]);

  const toggleStage = useCallback((id: number) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const scrollToStage = useCallback((id: number) => {
    setSelectedStep(id);
    setExpandedStages((prev) => new Set(prev).add(id));
    document.getElementById(`stage-${id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  // B3 — 取消任务（现有端点 POST /continue {action:'cancel'}，仅 paused 可取消；
  // 非 paused 时后端 409，展示真实错误）。
  const handleCancel = async () => {
    if (!taskDetail || busy) return;
    if (!window.confirm(t("taskDetail.confirmCancelTask"))) return;
    setBusy(true);
    setRunError(null);
    setRunInfo(null);
    try {
      const res = await apiRaw(
        `/api/tasks/${encodeURIComponent(taskDetail.id)}/continue`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        },
      );
      const data = (await res.json().catch(() => null)) as ApiErrorBody & {
        status?: string;
      } | null;
      if (!res.ok) {
        const { message } = parseErrorBody(data ?? {});
        throw new Error(message || `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("app.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  // B1 — 页头任务名：config.title ?? 文案前段 + 画幅后缀（原型「Summer skincare
  // promo — 9:16」）。task 详情无项目名，用 config.title/source_text 兜底。
  const taskTitle = useMemo(() => {
    const cfg = taskCfg;
    const base = cfg?.title?.trim() || cfg?.source_text?.trim() || "";
    const aspect = taskConfig?.synthesis?.aspect ?? taskConfig?.aspect ?? "";
    const name =
      base.length > 0
        ? (base.length > 52 ? `${base.slice(0, 52)}…` : base)
        : `Run ${taskDetail?.id.slice(0, 8) ?? "…"}`;
    return aspect ? `${name} — ${aspect}` : name;
  }, [taskCfg, taskConfig, taskDetail?.id]);

  // B1 — 统计列数据（credits / steps 来自 GET /api/tasks/:id）。
  const frozenCredits = taskDetail?.credits?.frozen ?? 0;
  const rerunsUsed = taskDetail?.credits?.reruns_used ?? 0;
  const rerunsFree = taskDetail?.credits?.reruns_free ?? 3;
  const rerunPrice =
    taskDetail?.credits?.rerun_price?.[taskSynthesis] ??
    (taskSynthesis === "i2v" ? 80 : 20);
  const stepsDone = steps.filter((s) => s.status === "done").length;
  const gateStep = totalBackendSteps - 2;
  // 原型「创建冻结（1 条 static）」的 mode 文案。
  const synthesisLabel = taskSynthesis === "i2v" ? "1 条 i2v" : "1 条 static";
  const waitingAtGate =
    isWaiting && (task?.current_step ?? 0) === gateStep;
  const stepsSubText =
    taskSynthesis === "static"
      ? t("taskDetail.stepsSubStatic", { step: waitingAtGate ? gateStep + 1 : task?.current_step ?? 1 })
      : t("taskDetail.stepsSub", { step: waitingAtGate ? gateStep + 1 : task?.current_step ?? 1 });
  const statusSubText = waitingAtGate
    ? t("taskDetail.statusPaused", { step: gateStep + 1, mode: taskConfig?.run_mode ?? "semi" })
    : t("taskDetail.statusRunning");

  // rail 锚点导航的每阶段状态 chips（原型 rail-item：stage-name + stage-steps +
  // stage-status 每后端步一个 .st chip）。
  const railStepChips = (stage: RailStage) => {
    const chips: Array<{ label: string; status: StepStatus }> = [];
    if (stage.id === 1) {
      chips.push({ label: t("rail.l1"), status: chipStatus(1) });
      if (task?.track === "managed") chips.push({ label: t("rail.l15"), status: chipStatus(1) });
      chips.push({ label: t("rail.l2"), status: chipStatus(2) });
    } else if (stage.gate) {
      chips.push({ label: t("rail.l8"), status: waitingAtGate ? "waiting" : chipStatus(8) });
    } else {
      for (const s of stage.steps) {
        // i2v 的 L5 归到画面阶段（原型「i2v 时 + L5 clips」）；交付阶段只显示 L9/L10。
        if (taskSynthesis === "i2v" && stage.id === 6 && s === 5) continue;
        if (taskSynthesis === "i2v" && stage.id === 3 && s === 5) continue;
        chips.push({ label: t(`rail.l${s}` as "rail.l1"), status: chipStatus(s) });
      }
      if (taskSynthesis === "i2v" && stage.id === 3) {
        chips.push({ label: t("rail.l5"), status: chipStatus(5) });
      }
    }
    return chips;
  };

  const chipStatus = (stepNum: number): StepStatus => {
    const st = stepByNumber[stepNum];
    if (st && st !== "queued") return st;
    const cur = task?.current_step ?? 0;
    if (stepNum < cur) return "done";
    return "queued";
  };

  const stClass = (st: string): string => {
    switch (st) {
      case "done": return "st-done";
      case "running":
      case "waiting": return "st-run";
      case "failed": return "st-fail";
      case "skipped":
      case "cancelled": return "st-skip";
      default: return "st-queued";
    }
  };

  // StepStatus → WizardNodeStatus（EmptyNode 只用 WizardNodeStatus 子集）。
  const toNodeStatus = (st: StepStatus): WizardNodeStatus => {
    switch (st) {
      case "done": return "done";
      case "running": return "running";
      case "waiting": return "waiting";
      case "failed": return "failed";
      default: return "pending";
    }
  };

  // 每阶段 node-body 的复用 props（六阶段各自独立实例）。
  const renderNode = (nodeDef: WizardNode) => (
    <NodeContent
      node={nodeDef}
      status={nodeStatus(nodeDef)}
      synthesis={taskSynthesis}
      taskDetail={taskDetail}
      assetUrl={assetUrl}
      hasAsset={hasAsset}
      finalVideoUrl={finalVideoUrl}
      exportRow={exportRow}
      scriptText={scriptText}
      setScriptText={setScriptText}
      scriptVersions={scriptVersions}
      shotEdits={shotEdits}
      setShotEdits={setShotEdits}
      ttsEntries={modelConfigs.tts}
      ttsEntryId={ttsEntryId}
      setTtsEntryId={setTtsEntryId}
      subtitleText={subtitleText}
      setSubtitleText={setSubtitleText}
      subtitleSettings={subtitleSettings}
      setSubtitleSettings={setSubtitleSettings}
      bgmKey={bgmKey}
      enlargedShot={enlargedShot}
      setEnlargedShot={setEnlargedShot}
      setRegModal={setRegModal}
      busy={busy}
      onSaveNode={saveNodeAndMaybeRerun}
      onSaveScriptVersion={saveScriptVersion}
      onSelectScriptVersion={selectScriptVersion}
      onSelectCandidate={selectCandidate}
      onUploadShotRef={uploadShotRef}
      onUploadShotVoice={uploadShotVoice}
      onUploadBgm={uploadBgm}
      onRemoveBgm={removeBgm}
      onSaveSubtitleSettings={saveSubtitleSettings}
      onDownloadExport={handleDownloadExport}
      onRerunFromL4={() => doRerun(4)}
      templates={taskConfig?.templates ?? {}}
      configPrompts={taskConfig?.prompts ?? {}}
      prompts={prompts}
      onPickTemplate={handlePickTemplate}
      onSavePrompt={handleSavePrompt}
      onSavePromptAs={handleSavePromptAs}
      rules={rules}
      onPickRule={handlePickRule}
      onDownloadStageZip={handleDownloadStageZip}
    />
  );

  const stageTitleKey: Record<number, string> = {
    1: "taskDetail.nodeScript",
    2: "taskDetail.nodeStoryboard",
    3: "taskDetail.nodeVisuals",
    4: "taskDetail.nodeAudio",
    5: "taskDetail.nodeCompose",
    6: "taskDetail.nodeDelivery",
  };

  // 阶段头部 meta（原型 node-head .meta）：脚本版本 / 免费重跑计次 / 音频 / 交付。
  const stageMeta = (stage: RailStage): string | null => {
    switch (stage.id) {
      case 1: {
        const s2 = steps.find((s) => s.step === 2);
        const script = (s2?.payload as { script?: string } | null)?.script;
        return script ? t("taskDetail.scriptMeta", { n: (taskConfig?.script_versions?.length ?? 0) + 1 }) : null;
      }
      case 3:
        return t("taskDetail.visualsMeta", {
          free: rerunsFree,
          used: rerunsUsed,
          price: rerunPrice,
          mode: taskSynthesis,
        });
      case 4: {
        const voCount = taskDetail?.assets.filter((a) => a.type === "audio").length ?? 0;
        return voCount > 0
          ? t("taskDetail.audioMetaDetail", { vo: `vo-01…${pad(voCount)}.mp3` })
          : null;
      }
      case 6:
        return t("taskDetail.deliveryMeta", { ts: taskDetail?.created_at.slice(0, 10) ?? "" });
      default:
        return null;
    }
  };

  // 六阶段各卡片的节点定义（static/i2v 共用 id 1-5，id 6 因模式而异）。
  const scriptNodeDef = nodes.find((n) => n.id === 2) ?? nodes[0];
  const storyNodeDef = nodes.find((n) => n.id === 3) ?? nodes[0];
  const visualNodeDef = nodes.find((n) => n.id === 4) ?? nodes[0];
  const audioNodeDef = nodes.find((n) => n.id === 5) ?? nodes[0];
  // i2v：L5 单镜 clips 归到③画面阶段（原型「i2v 时 + L5 clips」）。
  const clipNodeDef = taskSynthesis === "i2v" ? (nodes.find((n) => n.id === 6) ?? null) : null;

  // 阶段是否有 stale（下游产物被编辑未重跑）。
  const stageHasStale = (stage: RailStage) => {
    if (staleNodes.size > 0) return true;
    if (stage.gate) return false;
    return steps.some((s) => stage.steps.includes(s.step) && s.stale);
  };

  // 阶段卡片头部状态 chips（主状态 + stale）。
  const stageChips = (stageId: number) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return null;
    const st = stageStatus(stage);
    const chips = [<span key="main" className={`st ${stClass(st)}`}>{stepTag(st)}</span>];
    if (stageHasStale(stage)) {
      chips.push(<span key="stale" className="st st-stale">{t("rail.stale")}</span>);
    }
    return chips;
  };

  // rail stage-steps 行（原型 rail-item .stage-steps）。
  const stageStepsText = (stage: RailStage): string => {
    if (stage.id === 1) {
      const managed = task?.track === "managed";
      return managed
        ? `${t("rail.l1")} · ${t("rail.l15")} · ${t("rail.l2")}`
        : `${t("rail.l1")} · ${t("rail.l2")}`;
    }
    if (stage.gate) return t("rail.steps5");
    if (stage.id === 2) return t("rail.steps2");
    if (stage.id === 3) return t("rail.steps3");
    if (stage.id === 4) return t("rail.steps4");
    return t("rail.steps6");
  };

  // ⑤ 合成 / ⑥ 交付 的专用内容（final.mp4 预览 + 导出，原型 385-413）。
  const composeBody = (
    <div>
      <p className="small faint">{t("taskDetail.composeMeta")}</p>
      {finalVideoUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          controls
          preload="metadata"
          src={finalVideoUrl}
          className="mt-3 w-full rounded-lg border border-border bg-black"
        />
      ) : (
        <EmptyNode status={toNodeStatus(stageStatus(stages.find((s) => s.id === 5) ?? stages[0]))} t={t} />
      )}
    </div>
  );

  const deliveryBody = (
    <div>
      {finalVideoUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          controls
          preload="metadata"
          src={finalVideoUrl}
          className="w-full rounded-lg border border-border bg-black"
        />
      ) : null}
      {exportRow ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleDownloadExport()}
            className="btn btn-primary btn-sm"
          >
            {t("pipeline.downloadExportZip")}
          </button>
          <span className="small faint">
            {t("pipeline.exportId", { id: exportRow.export_id.slice(0, 8) })}
          </span>
        </div>
      ) : finalVideoUrl ? (
        <p className="mt-3 small faint">{t("pipeline.finalMp4Hint")}</p>
      ) : (
        <EmptyNode status={toNodeStatus(stageStatus(stages.find((s) => s.id === 6) ?? stages[0]))} t={t} />
      )}
    </div>
  );

  // -------------------------------------------------------------------------
  // Render (hooks above must all run before any early return — React #310)
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-text-secondary">
        <Spinner /> {t("app.loading")}
      </div>
    );
  }

  if (error || !taskDetail) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-xl border border-error/30 bg-error-bg px-4 py-3 text-sm text-error">
          {error ?? t("app.projectNotFound")}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full">
      {/* 页头：任务名（config.title / source_text + 画幅）+ 状态徽章 + 创建时间 + 运行信息 */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold text-text-primary">{taskTitle}</h1>
          {taskCfg?.source_text && !taskCfg?.title ? (
            <p className="mt-1 max-w-xl text-sm leading-6 text-text-secondary">
              {taskCfg?.source_text}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ProjectStatusBadge status={currentStatus} />
            <span className="text-xs text-text-tertiary">
              {new Date(taskDetail.created_at).toLocaleString()}
            </span>
            {task ? (
              <span className="text-xs text-text-tertiary">
                run {task.id.slice(0, 8)} · step {task.current_step}
                /{totalBackendSteps} · {taskConfig?.run_mode ?? "auto"}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            {isWaiting && taskDetail ? (
              <Btn variant="primary" onClick={() => void handleContinue()} disabled={busy}>
                {busy ? "…" : t("pipeline.continueStep")}
              </Btn>
            ) : null}
            <Btn variant="default" onClick={() => void handleRun()} disabled={!canRun}>
              {running ? t("pipeline.starting") : t("pipeline.runPipeline")}
            </Btn>
          </div>
          {canRun ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-tertiary">{t("pipeline.runMode")}</span>
              <div className="seg">
                <span
                  role="button"
                  className={runMode === "auto" ? "on" : ""}
                  onClick={() => setRunMode("auto")}
                >
                  {t("taskNew.runModeAuto")}
                </span>
                <span
                  role="button"
                  className={runMode === "semi" ? "on" : ""}
                  onClick={() => setRunMode("semi")}
                >
                  {t("taskNew.runModeSemi")}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {runError ? (
        <div className="api-err" style={{ marginTop: 14 }}>
          <span>{runError}</span>
        </div>
      ) : runInfo ? (
        <div className="banner" style={{ marginBottom: 14 }}>
          <span className="dot dot-run" />
          <span>{runInfo}</span>
        </div>
      ) : null}

      {/* B1 — 顶部 4 统计列（原型 task-detail.html 46-67：Status / 冻结积分 / 免费重跑 / Steps） */}
      <div className="stats" style={{ marginTop: 18 }}>
        <div className="stat">
          <div className="k">{t("taskDetail.statusLabel")}</div>
          <div className="v" style={{ fontSize: 14, marginTop: 6 }}>
            <span className={`st ${stClass(currentStatus)}`}>
              {t(`pipelineStatus.${currentStatus}`)}
            </span>
          </div>
          <div className="s">{statusSubText}</div>
        </div>
        <div className="stat">
          <div className="k">{t("taskDetail.frozenCredits")}</div>
          <div className="v">{frozenCredits}</div>
          <div className="s">{t("taskDetail.frozenSub", { mode: synthesisLabel })}</div>
        </div>
        <div className="stat">
          <div className="k">{t("taskDetail.freeReruns")}</div>
          <div className="v">{rerunsUsed} <em>/ {rerunsFree} used</em></div>
          <div className="s">{t("taskDetail.rerunPriceSub", { price: rerunPrice, mode: taskSynthesis })}</div>
        </div>
        <div className="stat">
          <div className="k">{t("taskDetail.stepsLabel")}</div>
          <div className="v">{stepsDone} <em>/ {totalBackendSteps}</em></div>
          <div className="s">{stepsSubText}</div>
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", margin: "-8px 0 14px" }}>
        <span className="note">{t("taskDetail.notePolling")}</span>
      </div>

      {/* B2 — 六阶段同屏全览：左 rail 锚点导航 + 右纵向 StageCard（①…⑥） */}
      <div className="wizard">
        {/* 左 rail（原型 75-121）：stage-num 圆圈 + stage-steps + stage-status chips */}
        <nav className="rail">
          {stages.map((stage) => {
            const st = stageStatus(stage);
            const active = stage.id === selectedStep;
            return (
              <div
                key={stage.id}
                className={`rail-item${active ? " active" : ""}`}
                onClick={() => scrollToStage(stage.id)}
              >
                <div className="stage-name">
                  <span className="stage-num">{stage.id}</span>
                  {t(stage.titleKey)}
                </div>
                <div className="stage-steps">{stageStepsText(stage)}</div>
                <div className="stage-status">
                  {railStepChips(stage).map((c, i) => (
                    <span key={i} className={`st ${stClass(c.status)}`}>{c.label}</span>
                  ))}
                  {stageHasStale(stage) ? (
                    <span className="st st-stale">{t("rail.stale")}</span>
                  ) : null}
                </div>
                {stage.id === 1 && task?.track === "managed" ? (
                  <div className="stage-steps" style={{ marginTop: 4 }}>{t("rail.l15note")}</div>
                ) : null}
              </div>
            );
          })}
        </nav>

        {/* 右列纵向：①文案 → ②分镜 → ③画面 → ④声音 → L8 复核门 → ⑤合成 → ⑥交付 */}
        <section>
          {/* ① 文案（折叠） */}
          <StageCard
            id={1}
            num="①"
            title={t(stageTitleKey[1])}
            status={stageChips(1)}
            meta={stageMeta(stages.find((s) => s.id === 1) ?? stages[0])}
            collapsed={!expandedStages.has(1)}
            onToggle={() => toggleStage(1)}
          >
            {renderNode(scriptNodeDef)}
          </StageCard>

          {/* ② 分镜（默认展开：7 列表格） */}
          <StageCard
            id={2}
            num="②"
            title={t(stageTitleKey[2])}
            status={stageChips(2)}
            headerNote={<span className="note">{t("taskDetail.noteStoryboard")}</span>}
            actions={
              <button
                type="button"
                className="btn-text"
                onClick={() => setRegModal({ node: 3, scope: "all", mode: "direct" })}
              >
                {t("taskDetail.btnRegenerateAll")}
              </button>
            }
            collapsed={!expandedStages.has(2)}
            onToggle={() => toggleStage(2)}
          >
            {renderNode(storyNodeDef)}
          </StageCard>

          {/* ③ 画面（默认展开：4 列 shot-grid；i2v 附加 L5 clips） */}
          <StageCard
            id={3}
            num="③"
            title={t(stageTitleKey[3])}
            status={stageChips(3)}
            meta={stageMeta(stages.find((s) => s.id === 3) ?? stages[0])}
            actions={
              <button
                type="button"
                className="btn-text"
                onClick={() => setRegModal({ node: 4, scope: "all", mode: "direct" })}
              >
                {t("taskDetail.btnRegenerateAllVisuals")}
              </button>
            }
            collapsed={!expandedStages.has(3)}
            onToggle={() => toggleStage(3)}
          >
            {renderNode(visualNodeDef)}
            {clipNodeDef ? renderNode(clipNodeDef) : null}
          </StageCard>

          {/* ④ 声音（折叠） */}
          <StageCard
            id={4}
            num="④"
            title={t(stageTitleKey[4])}
            status={stageChips(4)}
            meta={stageMeta(stages.find((s) => s.id === 4) ?? stages[0])}
            collapsed={!expandedStages.has(4)}
            onToggle={() => toggleStage(4)}
          >
            {renderNode(audioNodeDef)}
          </StageCard>

          {/* L8 合成前复核门（固定区块，原型 354-382） */}
          <div id="stage-5" className="gate">
            <div className="gate-head">
              <span className="dot dot-run" />
              {t("taskDetail.gateTitle")}
              <span className="spacer" />
              <span className="note">{t("taskDetail.gateNote")}</span>
            </div>
            <div className="gate-body" style={{ padding: 14 }}>
              <GatePanel
                status={waitingAtGate ? "waiting" : stageStatus(stages.find((s) => s.id === 5) ?? stages[0])}
                synthesis={taskSynthesis}
                isWaiting={waitingAtGate}
                busy={busy}
                taskDetail={taskDetail}
                subtitleSettings={subtitleSettings}
                setSubtitleSettings={setSubtitleSettings}
                onSaveSubtitleSettings={saveSubtitleSettings}
                onContinue={handleContinue}
                onBackToVoice={() => scrollToStage(4)}
                ttsEntries={modelConfigs.tts}
                ttsEntryId={ttsEntryId}
                bgmKey={bgmKey}
              />
            </div>
          </div>

          {/* ⑤ 合成（折叠，final.mp4 预览；锚点避免与 L8 门 id 冲突） */}
          <StageCard
            id={5}
            num="⑤"
            title={t(stageTitleKey[5])}
            status={stageChips(5)}
            collapsed={!expandedStages.has(5)}
            onToggle={() => toggleStage(5)}
            anchorId="stage-5-compose"
          >
            {composeBody}
          </StageCard>

          {/* ⑥ 交付（折叠，导出 + 30 天保留期） */}
          <StageCard
            id={6}
            num="⑥"
            title={t(stageTitleKey[6])}
            status={stageChips(6)}
            meta={stageMeta(stages.find((s) => s.id === 6) ?? stages[0])}
            collapsed={!expandedStages.has(6)}
            onToggle={() => toggleStage(6)}
          >
            {deliveryBody}
          </StageCard>

          {/* B3 — 底部 sticky 操作条（原型 406-413：取消任务 + 冻结积分 + 查看流水） */}
          <div className="sticky-bar" style={{ marginTop: 18 }}>
            {isActive ? (
              <button
                type="button"
                className="btn-text danger"
                onClick={() => void handleCancel()}
                disabled={busy}
              >
                {t("taskDetail.btnCancelTask")}
              </button>
            ) : (
              <span className="small faint">{t("taskDetail.cancelHint")}</span>
            )}
            <span className="spacer" />
            <span className="sum-item">
              {t("taskDetail.frozenSum", { n: frozenCredits })} · 成本流水 api_cost_log
            </span>
            <a className="btn-text" href="/app/billing">
              {t("taskDetail.viewLedger")}
            </a>
          </div>
        </section>
      </div>

      {/* PIPELINE_TASK_11 — regenerate modal (直接重新生成 / 按要求调整) */}
      {regModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setRegModal(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-bg-subtle p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-text-primary">
              {regModal.scope === "single" && regModal.index
                ? t("pipeline.regenModalTitleShot", { n: regModal.index })
                : t("pipeline.regenModalTitleAll")}
              {" · "}
              {t("pipeline.regenModalTitle")}
            </h3>
            <p className="mt-1 text-xs text-text-tertiary">
              {t("taskDetail.regModalDesc")}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setRegModal({ ...regModal, mode: "direct", prompt: "" })}
                className={`rounded-lg border p-3 text-left transition ${
                  regModal.mode === "direct"
                    ? "border-brand bg-brand-subtle"
                    : "border-border hover:border-brand/40"
                }`}
              >
                <div className="text-sm font-semibold text-text-primary">{t("taskDetail.regDirect")}</div>
                <div className="mt-1 text-xs text-text-tertiary">
                  {t("taskDetail.regDirectDesc")}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRegModal({ ...regModal, mode: "with-prompt" })}
                className={`rounded-lg border p-3 text-left transition ${
                  regModal.mode === "with-prompt"
                    ? "border-brand bg-brand-subtle"
                    : "border-border hover:border-brand/40"
                }`}
              >
                <div className="text-sm font-semibold text-text-primary">{t("taskDetail.regWithPrompt")}</div>
                <div className="mt-1 text-xs text-text-tertiary">
                  {t("taskDetail.regWithPromptDesc")}
                </div>
              </button>
            </div>
            {regModal.mode === "with-prompt" ? (
              <textarea
                value={regModal.prompt ?? ""}
                onChange={(e) => setRegModal({ ...regModal, prompt: e.target.value })}
                rows={3}
                placeholder={t("taskDetail.regPromptPlaceholder")}
                className="mt-3 input disabled:opacity-40 resize-y"
                autoFocus
              />
            ) : null}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRegModal(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition hover:border-brand/50 hover:text-text-primary disabled:opacity-40"
              >
                {t("pipeline.regenCancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRegenerate()}
                className="btn btn-primary"
              >
                {busy ? t("pipeline.regenRunning") : t("pipeline.regenRun")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right-pane content for a single wizard node
// ---------------------------------------------------------------------------

function NodeContent(props: {
  node: WizardNode;
  status: WizardNodeStatus;
  synthesis: "static" | "i2v";
  taskDetail: TaskDetail | null;
  assetUrl: (type: "shots" | "audio" | "clips" | "video" | "refs", file: string) => string | null;
  hasAsset: (type: string, needle: string) => boolean;
  finalVideoUrl: string | null;
  exportRow: { export_id: string; expires_at: string | null } | null;
  scriptText: string;
  setScriptText: (v: string) => void;
  scriptVersions: ScriptVersionItem[];
  shotEdits: ShotEdit[] | null;
  setShotEdits: (v: ShotEdit[] | null) => void;
  ttsEntries: ModelConfig[];
  ttsEntryId: string;
  setTtsEntryId: (v: string) => void;
  subtitleText: string;
  setSubtitleText: (v: string) => void;
  subtitleSettings: SubtitleSettings;
  setSubtitleSettings: (
    v:
      | SubtitleSettings
      | ((p: SubtitleSettings) => SubtitleSettings),
  ) => void;
  bgmKey: string | null;
  enlargedShot: number | null;
  setEnlargedShot: (v: number | null) => void;
  setRegModal: (v: {
    node: number;
    scope: "all" | "single";
    index?: number;
    mode: "direct" | "with-prompt";
    prompt?: string;
  } | null) => void;
  busy: boolean;
  onSaveNode: (node: number, content: Record<string, unknown>) => Promise<void>;
  onSaveScriptVersion: () => Promise<void>;
  onSelectScriptVersion: (versionId: string) => Promise<void>;
  onSelectCandidate: (index: number, key: string, kind: "image" | "clip") => Promise<void>;
  onUploadShotRef: (index: number, file: File) => Promise<void>;
  onUploadShotVoice: (index: number, file: File) => Promise<void>;
  onUploadBgm: (file: File) => Promise<void>;
  onRemoveBgm: () => Promise<void>;
  onSaveSubtitleSettings: () => Promise<void>;
  onDownloadExport: () => Promise<void>;
  /** B4 — ②分镜表格「从 L4 重跑」：回到 L4 并触发单步重跑（POST /rerun {from:4}） */
  onRerunFromL4: () => void;
  templates: Record<number, string | null>;
  configPrompts: Record<string, string | null>;
  prompts: Array<{
    id: string;
    type: string;
    name: string;
    body: string;
    enabled: boolean;
    is_default?: boolean;
    updated_at?: string;
  }>;
  onPickTemplate: (step: number, id: string | null) => Promise<void>;
  onSavePrompt: (step: number, text: string) => Promise<void>;
  onSavePromptAs: (step: number, type: string, name: string, text: string) => Promise<boolean>;
  /** CORE-FEATURES — 可配置规则列表 + 切换（config.rules[kind] = ruleId | null） */
  rules: Rule[];
  onPickRule: (kind: RuleKind, ruleId: string | null) => Promise<void>;
  /** CORE-FEATURES — 每环节 zip 下载（script/split/images/audio/clips） */
  onDownloadStageZip: (stage: "script" | "split" | "images" | "audio" | "clips") => void;
}) {
  const { t } = useTranslation();
  const {
    node,
    status,
    synthesis,
    taskDetail,
    assetUrl,
    hasAsset,
    finalVideoUrl,
    exportRow,
    scriptText,
    setScriptText,
    scriptVersions,
    shotEdits,
    setShotEdits,
    ttsEntries,
    ttsEntryId,
    setTtsEntryId,
    subtitleText,
    setSubtitleText,
    subtitleSettings,
    setSubtitleSettings,
    bgmKey,
    enlargedShot,
    setEnlargedShot,
    setRegModal,
    busy,
    onSaveNode,
    onSaveScriptVersion,
    onSelectScriptVersion,
    onSelectCandidate,
    onUploadShotRef,
    onUploadShotVoice,
    onUploadBgm,
    onRemoveBgm,
    onSaveSubtitleSettings,
    onDownloadExport,
    onRerunFromL4,
    templates,
    configPrompts,
    prompts,
    onPickTemplate,
    onSavePrompt,
    onSavePromptAs,
    rules,
    onPickRule,
    onDownloadStageZip,
  } = props;

  const [selShot, setSelShot] = useState(0);

  // 每段提示词编辑：草稿/另存为名称/保存状态。
  const [promptDraft, setPromptDraft] = useState<Record<number, string>>({});
  const [promptAsName, setPromptAsName] = useState<Record<number, string>>({});
  const [promptSavedFlag, setPromptSavedFlag] = useState<Record<number, boolean>>({});

  // 每段提示词模板切换：步骤 → 模板中心分类（与后端 prompt-templates.js 一致）。
  const STEP_TEMPLATE_TYPES: Record<number, string[]> = {
    1: ["商品解析", "对标分析"],
    2: ["文案模板", "标题生成"],
    3: ["分镜拆解"],
    4: ["画面风格"],
    9: ["合规规则"],
  };
  // templates 入参以数字键类型声明，实际运行时含字符串 type 键（storyboard/
  // style/文案模板 等）；此处展宽为字符串键以便按 '文案模板' 读取 step 2。
  const templatesByType = templates as Record<string, string | null | undefined>;
  // 某段当前生效的提示词：自定义 > 所选模板 > 分类默认。
  // 分类默认与后端 getStepTemplatePrompt 保持一致：每个分类取
  // 「默认模板优先，否则最新启用」的一条，多个分类用空行拼接。
  const resolvedPrompt = (step: number) => {
    if (step === 2) {
      // L2 文案：内容输入在 config.prompts.script，模板覆盖在
      // config.templates['文案模板']（type 键），与后端 promptOverride 对齐。
      const custom = configPrompts?.script;
      if (custom) return custom;
      const tid = templatesByType[L2_TEMPLATE_TYPE];
      if (tid) {
        const tpl = prompts.find((p) => p.id === tid);
        if (tpl) return tpl.body ?? "";
      }
    } else {
      const custom = configPrompts?.[String(step)];
      if (custom) return custom;
      const tid = templates[step];
      if (tid) {
        const tpl = prompts.find((p) => p.id === tid);
        if (tpl) return tpl.body ?? "";
      }
    }
    const types = STEP_TEMPLATE_TYPES[step] || [];
    const parts: string[] = [];
    for (const type of types) {
      const ofType = prompts.filter((p) => p.type === type && p.enabled !== false);
      if (ofType.length === 0) continue;
      const def =
        ofType.find((p) => p.is_default) ??
        ofType.reduce((a, b) => (String(a.updated_at) > String(b.updated_at) ? a : b));
      if (def?.body) parts.push(def.body);
    }
    return parts.join("\n\n");
  };
  const renderTemplatePicker = (step: number) => {
    const types = STEP_TEMPLATE_TYPES[step];
    if (!types || types.length === 0) return null;
    const tpls = prompts.filter((p) => types.includes(p.type) && p.enabled !== false);
    // Step 2 的模板选择存 templates['文案模板']（type 键），读取同步。
    const currentTpl = step === 2 ? templatesByType[L2_TEMPLATE_TYPE] : templates[step];
    const resolved = resolvedPrompt(step);
    const draft = promptDraft[step] ?? resolved;
    const dirty = draft !== resolved;
    const saved = promptSavedFlag[step];
    const doSave = async () => {
      await onSavePrompt(step, draft);
      setPromptDraft((d) => { const n = { ...d }; delete n[step]; return n; });
      setPromptSavedFlag((f) => ({ ...f, [step]: true }));
    };
    const doSaveAs = async () => {
      const ok = await onSavePromptAs(step, types[0], promptAsName[step] ?? "", draft);
      if (ok) {
        setPromptAsName((d) => { const n = { ...d }; delete n[step]; return n; });
        setPromptSavedFlag((f) => ({ ...f, [step]: true }));
      }
    };
    return (
      <div className="mb-3 space-y-2 rounded-lg border border-border bg-bg-muted/40 p-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="shrink-0 text-text-tertiary">{t("pipeline.templatePicker")}</span>
          <select
            value={currentTpl ?? ""}
            disabled={busy}
            onChange={(e) => void onPickTemplate(step, e.target.value || null)}
            className={`${selectClass} flex-1`}
          >
            <option value="">{t("pipeline.templateDefault")}</option>
            {tpls.map((p) => (
              <option key={p.id} value={p.id}>
                {p.type} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          rows={4}
          value={draft}
          disabled={busy}
          onChange={(e) => setPromptDraft((d) => ({ ...d, [step]: e.target.value }))}
          className={`${inputClass} w-full resize-none`}
          placeholder={t("pipeline.promptEditorPlaceholder")}
        />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => void doSave()}
            className="rounded-md bg-brand px-3 py-1.5 font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("pipeline.savePrompt")}
          </button>
          <input
            value={promptAsName[step] ?? ""}
            disabled={busy}
            onChange={(e) => setPromptAsName((d) => ({ ...d, [step]: e.target.value }))}
            placeholder={t("pipeline.templateName")}
            className={`${inputClass} w-40`}
          />
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() => void doSaveAs()}
            className="rounded-md border border-border px-3 py-1.5 font-medium text-text-secondary transition hover:bg-bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("pipeline.saveAsTemplate")}
          </button>
          {saved ? (
            <span className="text-success">✓ {t("pipeline.promptSaved")}</span>
          ) : dirty ? (
            <span className="text-warning">{t("pipeline.promptUnsaved")}</span>
          ) : null}
        </div>
      </div>
    );
  };

  const stepPayload = (step: number) => {
    const s = taskDetail?.steps.find((x) => x.step === step);
    return (s?.payload as Record<string, unknown> | null) ?? null;
  };

  const renderHeader = () => (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div>
        <h2 className="text-base font-semibold text-text-primary">
          {node.id}. {t(NODE_TITLE_KEYS[node.id](synthesis))}
        </h2>
        <p className="text-xs text-text-tertiary">{node.subtitle}</p>
      </div>
      {status === "stale" ? (
        <span className="rounded border border-stale/40 bg-stale-bg/60 px-2.5 py-0.5 text-xs font-medium text-stale">
          {t("pipeline.staleBadge")}
        </span>
      ) : null}
    </div>
  );

  const inputClass =
    "input disabled:opacity-40";
  const selectClass =
    "rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-text-primary outline-none transition focus:border-brand disabled:opacity-40";
  const primaryBtnClass = (busyState?: boolean, disabledState?: boolean) =>
    `btn btn-primary ${
      busyState || disabledState ? "disabled:opacity-40" : ""
    }`;
  const warnBtnClass = (busyState?: boolean) =>
    `rounded-lg bg-warning px-4 py-2 text-sm font-medium text-black transition hover:bg-warning/80 disabled:opacity-40 ${
      busyState ? "disabled:opacity-40" : ""
    }`;
  const ghostBtnClass =
    "rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition hover:border-brand/50 hover:text-text-primary disabled:opacity-40";

  // S2 分镜提示词 preset dropdown (PIPELINE_TASK_13). Selecting a preset writes
  // its body as the step-3 custom prompt (config.prompts[3]), which the backend
  // storyboard step uses. A fresh task (nothing resolved) soft-defaults to
  // 通用解说 without persisting; a resolved-but-unknown prompt shows "自定义".
  const renderStoryboardPresetPicker = () => {
    const resolved = resolvedPrompt(3);
    const matched = STORYBOARD_PRESETS.find((p) => p.body === resolved);
    const value = matched?.id ?? (resolved ? "__custom__" : "general");
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-bg-muted/40 p-3">
        <span className="shrink-0 text-xs text-text-tertiary">{t("storyboardPreset.label")}</span>
        <select
          value={value}
          disabled={busy}
          onChange={(e) => {
            const id = e.target.value;
            if (id === "__custom__") return;
            const preset = STORYBOARD_PRESETS.find((p) => p.id === id);
            if (preset) void onSavePrompt(3, preset.body);
          }}
          className={`${selectClass} flex-1`}
        >
          {STORYBOARD_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {t(p.titleKey)}
            </option>
          ))}
          {resolved ? (
            <option value="__custom__">{t("storyboardPreset.custom")}</option>
          ) : null}
        </select>
      </div>
    );
  };

  // CORE-FEATURES — 单类生成规则切换（config.rules[kind]；空 = 系统默认）。
  // 按设计节点归属：node2→rewrite、node3→split、node4→image、node6(i2v)→i2v。
  const renderRulePicker = (kind: RuleKind) => {
    const cur = taskDetail?.config?.rules?.[kind];
    const kindRules = rules.filter((r) => r.kind === kind && r.enabled);
    return (
      <div className="mb-3 rounded-lg border border-border bg-bg-muted/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-text-secondary">
            {t(RULE_KIND_LABELS[kind])}
          </span>
          <span className="text-[11px] text-text-tertiary">{t("taskDetail.rulesPanelHint")}</span>
        </div>
        <select
          value={cur ?? ""}
          disabled={busy}
          onChange={(e) => void onPickRule(kind, e.target.value || null)}
          className={`${selectClass} w-full`}
        >
          <option value="">{t("taskDetail.rulesDefault")}</option>
          {kindRules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.is_default ? " (default)" : ""}
            </option>
          ))}
        </select>
      </div>
    );
  };

  // Node 1 — topic card (read-only).
  if (node.id === 1) {
    const p = stepPayload(1);
    return (
      <div>
        {renderHeader()}
        {renderTemplatePicker(1)}
        {p ? (
          <div className="mt-4 space-y-3 text-sm">
            <InfoRow label={t("pipeline.topic")} value={String(p.topic ?? "—")} />
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t("pipeline.keyPoints")}</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-text-secondary">
                {(Array.isArray(p.key_points) ? p.key_points : []).map((k, i) => (
                  <li key={i}>{String(k)}</li>
                ))}
              </ul>
            </div>
            <InfoRow label={t("pipeline.targetDuration")} value={`${p.target_duration ?? "—"}s`} />
            <InfoRow label={t("pipeline.audience")} value={String(p.audience ?? "—")} />
          </div>
        ) : (
          <EmptyNode status={status} t={t} />
        )}
      </div>
    );
  }

  // Node 2 — script editing + regeneration + versioning (PIPELINE_TASK_11 B).
  if (node.id === 2) {
    return (
      <div>
        {renderHeader()}
        {renderTemplatePicker(2)}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setRegModal({ node: 2, scope: "all", mode: "direct" })
            }
            className={warnBtnClass(busy)}
          >
            {t("pipeline.regenAllScript")}
          </button>
          <button
            type="button"
            disabled={busy || !scriptText.trim()}
            onClick={() => onSaveScriptVersion()}
            className={ghostBtnClass}
          >
            {t("pipeline.saveVersion")}
          </button>
          <button
            type="button"
            onClick={() => onDownloadStageZip("script")}
            className={ghostBtnClass}
          >
            {t("taskDetail.downloadZip")}
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-text-secondary">
          {t("pipeline.scriptEditHint")}
        </p>
        <textarea
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          rows={10}
          disabled={busy}
          placeholder={t("pipeline.scriptPlaceholder")}
          className={`mt-3 ${inputClass} resize-y font-mono`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !scriptText.trim()}
            onClick={() => onSaveNode(2, { source_text: scriptText.trim(), script: scriptText.trim() })}
            className={primaryBtnClass(busy)}
          >
            {busy ? t("common.saving") : t("pipeline.saveRegenerate")}
          </button>
          {node.steps.some((s) => stepPayload(s)) ? (
            <span className="text-xs text-text-tertiary">{t("pipeline.savedTextIsSource")}</span>
          ) : null}
        </div>

        {/* Saved script versions (B) */}
        <div className="mt-5 border-t border-border pt-4">
          <label className="mb-2 block text-xs font-medium text-text-secondary">
            {t("pipeline.versionList")}
          </label>
          {scriptVersions.length > 0 ? (
            <ul className="space-y-2">
              {scriptVersions.map((v) => (
                <li
                  key={v.version_id}
                  className={`flex items-start justify-between gap-3 rounded-lg border p-2.5 ${
                    v.selected ? "border-brand/50 bg-brand-subtle/30" : "border-border"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 text-xs font-semibold text-text-primary">
                        {v.version_id}
                      </span>
                      <span className="line-clamp-2 min-w-0 text-xs leading-5 text-text-secondary">
                        {v.note ?? "—"}
                      </span>
                    </div>
                    <span className="mt-1 block text-[10px] text-text-tertiary">
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {v.selected ? (
                      <span className="rounded border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
                        {t("pipeline.versionSelected")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onSelectScriptVersion(v.version_id)}
                        className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary transition hover:border-brand/50 hover:text-text-primary disabled:opacity-40"
                      >
                        {t("pipeline.versionSelect")}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-tertiary">{t("pipeline.noVersions")}</p>
          )}
        </div>
      </div>
    );
  }

  // Node 3 — storyboard shot editing (PIPELINE_TASK_11 C + 13 preset) — 两栏:
  // 左分镜题目列表 / 右内容编辑; 顶部为分镜提示词预设下拉.
  // Node 3 — ②分镜 Storyboard：7 列表格（原型 task-detail.html 153-203）。
  // 每镜 inline 编辑（标题/时长/场景/配音）+ 展开详情（prompt/script/aspect/
  // motion/subtitle/删镜）；stale 提示「下游画面已生成，改动后需从 L4 重跑」。
  if (node.id === 3) {
    const snapShots = (stepPayload(3)?.shots as
      | Array<{ index: number; scene?: string; script?: string; title?: string; voiceover?: string }>
      | null) ?? null;
    const stFor = (idx: number): "done" | "stale" | "pending" => {
      const s = shotEdits?.find((x) => x.index === idx);
      const hasImg = taskDetail?.assets.some((a) => a.type === "shot" && a.index === idx) ?? false;
      if (!s || !hasImg) return "pending";
      const snap = snapShots?.find((x) => x.index === idx);
      const edited =
        !!snap &&
        (s.scene !== snap.scene ||
          s.script !== snap.script ||
          s.title !== snap.title ||
          s.voiceover !== snap.voiceover);
      return edited ? "stale" : "done";
    };
    const patchShot = (index: number, patch: Partial<ShotEdit>) => {
      if (!shotEdits) return;
      const next = [...shotEdits];
      const i = next.findIndex((x) => x.index === index);
      if (i < 0) return;
      next[i] = { ...next[i], ...patch };
      setShotEdits(next);
    };
    return (
      <div>
        {renderHeader()}
        {renderStoryboardPresetPicker()}
        {renderTemplatePicker(3)}
        {shotEdits && shotEdits.length > 0 ? (
          <>
            <StoryboardTable
              t={t}
              shots={shotEdits.map((s) => ({
                index: s.index,
                duration: s.duration,
                scene: s.scene,
                script: s.script,
                voiceover: s.voiceover,
                subtitle: s.subtitle,
                prompt: s.prompt,
                title: s.title,
                aspect: s.aspect,
                motion: s.motion,
              }))}
              onPatchShot={patchShot}
              onAddShot={() => {
                if (!shotEdits) return;
                const next = [
                  ...shotEdits,
                  {
                    index: shotEdits.length + 1,
                    duration: 5,
                    scene: "",
                    script: "",
                    voiceover: "",
                    subtitle: "",
                    prompt: "",
                    title: "",
                    aspect: "16:9",
                    motion: "",
                    ref_key: null,
                  },
                ];
                setShotEdits(next.map((s, n) => ({ ...s, index: n + 1 })));
              }}
              onDeleteShot={(index) => {
                if (!shotEdits) return;
                setShotEdits(shotEdits.filter((s) => s.index !== index).map((s, n) => ({ ...s, index: n + 1 })));
              }}
              onRegenShot={(index) => setRegModal({ node: 3, scope: "single", index, mode: "direct" })}
              onRerunShot={() => onRerunFromL4()}
              shotStatus={stFor}
              hasAsset={(index) => taskDetail?.assets.some((a) => a.type === "shot" && a.index === index) ?? false}
              canDelete={(shotEdits?.length ?? 0) > 1}
            />
            <div className="mt-3">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onSaveNode(
                    3,
                    {
                      shots: shotEdits.map((s, n) => ({
                        index: n + 1,
                        duration: s.duration,
                        scene: s.scene,
                        script: s.script,
                        voiceover: s.voiceover,
                        subtitle: s.subtitle,
                        prompt: s.prompt,
                        title: s.title,
                        aspect: s.aspect,
                        motion: s.motion,
                      })),
                    },
                  )
                }
                className={primaryBtnClass(busy)}
              >
                {busy ? t("common.saving") : t("pipeline.saveRegenerate")}
              </button>
              <button
                type="button"
                onClick={() => onDownloadStageZip("split")}
                className={ghostBtnClass}
              >
                {t("taskDetail.downloadZip")}
              </button>
            </div>
          </>
        ) : (
          <EmptyNode status={status} t={t} />
        )}
      </div>
    );
  }

  // Node 4 — shot image grid — 两栏: 左镜头缩略图列表 / 右选中镜头大图+候选图+参数.
  // Node 4 — ③画面 Visuals：4 列 shot-grid（原型 task-detail.html 217-284）。
  // 每镜 16:9 缩略 + tag + cap + Regen/Candidates(N)；点击放大；候选横条 Select 选用。
  if (node.id === 4) {
    const shotKeys = taskDetail?.assets.filter((a) => a.type === "shot") ?? [];
    const hasAny = shotKeys.length > 0;
    const candidateImg = (key: string) => {
      const file = key.split("/").pop() ?? "";
      return assetUrl("shots", file);
    };
    const curImgFor = (idx: number) => {
      const s = shotEdits?.find((x) => x.index === idx);
      const cands = s?.candidates ?? [];
      const curKey = cands.find((c) => c.is_default)?.key;
      return curKey ? candidateImg(curKey) : assetUrl("shots", `shot-${pad(idx)}.png`);
    };
    // stale：L4 快照后标题/提示词/画幅被改动，需 Regen/重跑才生效。
    const snapShots = (stepPayload(4)?.shots as
      | Array<{ index: number; title?: string; prompt?: string; aspect?: string }>
      | null) ?? null;
    const isStale = (idx: number) => {
      const s = shotEdits?.find((x) => x.index === idx);
      const hasImg = taskDetail?.assets.some((a) => a.type === "shot" && a.index === idx) ?? false;
      if (!s || !hasImg) return false;
      const snap = snapShots?.find((x) => x.index === idx);
      return !!snap && (s.title !== snap.title || s.prompt !== snap.prompt || s.aspect !== snap.aspect);
    };
    return (
      <div>
        {renderHeader()}
        {renderTemplatePicker(4)}
        {hasAny && shotEdits && shotEdits.length > 0 ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setRegModal({ node: 4, scope: "all", mode: "direct" })}
                className={warnBtnClass(busy)}
              >
                {t("pipeline.regenAllShots")}
              </button>
              <p className="text-xs text-text-tertiary">{t("pipeline.regenerateAllShotsHint")}</p>
              <button
                type="button"
                onClick={() => onDownloadStageZip("images")}
                className={ghostBtnClass}
              >
                {t("taskDetail.downloadZip")}
              </button>
              <span className="spacer" />
              <span className="note">{t("taskDetail.noteVisuals")}</span>
            </div>
            <ShotGrid
              t={t}
              shots={shotEdits.map((s) => ({
                index: s.index,
                title: s.title,
                duration: s.duration,
                candidates: s.candidates,
                ref_key: s.ref_key,
              }))}
              curImgFor={curImgFor}
              candidateImg={candidateImg}
              isStale={isStale}
              onRegen={(index) => setRegModal({ node: 4, scope: "single", index, mode: "direct" })}
              onSelectCandidate={(index, key) => void onSelectCandidate(index, key, "image")}
              onUploadRef={(index, file) => void onUploadShotRef(index, file)}
              onEnlarge={setEnlargedShot}
            />
          </>
        ) : (
          <EmptyNode status={status} t={t} />
        )}
        {/* Lightbox */}
        {enlargedShot !== null ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setEnlargedShot(null)}
          >
            <div className="max-h-[85vh] max-w-[85vw]" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={curImgFor(enlargedShot) ?? ""}
                alt={`shot ${enlargedShot}`}
                className="max-h-[85vh] max-w-[85vw] rounded-lg border border-border object-contain"
              />
              <button
                type="button"
                onClick={() => setEnlargedShot(null)}
                className="mt-3 block text-xs font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary"
              >
                {t("pipeline.closePreview")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // Node 5 — voiceover + subtitles (PIPELINE_TASK_11 E).
  if (node.id === 5) {
    const audioAssets = (taskDetail?.assets ?? []).filter((a) => a.type === "audio");
    const audioFor = (idx: number) => {
      const file = `vo-${pad(idx)}.`;
      return audioAssets.find((a) => a.url.includes(file));
    };
    const voiceForShot = (idx: number) =>
      shotEdits?.find((s) => s.index === idx)?.voiceover ?? "";
    return (
      <div>
        {renderHeader()}
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setRegModal({ node: 5, scope: "all", mode: "direct" })
              }
              className={warnBtnClass(busy)}
            >
              {t("pipeline.regenAllVoice")}
            </button>
            <button
              type="button"
              onClick={() => onDownloadStageZip("audio")}
              className={ghostBtnClass}
            >
              {t("taskDetail.downloadZip")}
            </button>
            <p className="text-xs text-text-tertiary">
              {t("pipeline.integratedAuditionHint")}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {t("pipeline.voiceRole")}
            </label>
            {ttsEntries.length > 0 ? (
              <select
                value={ttsEntryId}
                onChange={(e) => setTtsEntryId(e.target.value)}
                disabled={busy}
                className={`w-full max-w-sm ${selectClass}`}
              >
                {ttsEntries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} {e.voice ? `· ${e.voice}` : ""}
                    {e.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-text-tertiary">{t("pipeline.noTtsModels")}</p>
            )}
          </div>

          {shotEdits && shotEdits.length > 0 ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                {t("pipeline.voiceoverClips")}
              </label>
              <div className="space-y-2">
                {shotEdits.map((shot) => {
                  const audio = audioFor(shot.index);
                  return (
                    <div key={shot.index} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-text-secondary">
                          {shot.title || t("pipeline.shotN", { n: shot.index, duration: shot.duration })}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setRegModal({ node: 5, scope: "single", index: shot.index, mode: "direct" })
                            }
                            className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary transition hover:border-brand/50 hover:text-text-primary disabled:opacity-40"
                          >
                            {t("pipeline.regenShotVoice")}
                          </button>
                          <label className="cursor-pointer rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary transition hover:border-brand/50 hover:text-text-primary">
                            {t("pipeline.uploadVoice")}
                            <input
                              type="file"
                              accept="audio/*"
                              className="hidden"
                              disabled={busy}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void onUploadShotVoice(shot.index, f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-text-tertiary">
                        {voiceForShot(shot.index)}
                      </p>
                      {audio ? (
                        <audio
                          controls
                          preload="none"
                          src={audio.url}
                          className="mt-1.5 h-8 w-full"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : audioAssets.length > 0 ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                {t("pipeline.voiceoverClips")}
              </label>
              <div className="space-y-1.5">
                {audioAssets.map((a) => (
                  <audio
                    key={a.id}
                    controls
                    preload="none"
                    src={a.url}
                    className="h-8 w-full max-w-sm"
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-tertiary">{t("pipeline.noAudio")}</p>
          )}

          <div className="rounded-lg border border-border p-3">
            <label className="mb-2 block text-xs font-medium text-text-secondary">
              {t("pipeline.subtitleRhythm")}
            </label>
            {/* PIPELINE_TASK_13 — subtitle on/off + position (burned into the
                final video by the render worker; enabled=false skips burning) */}
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={subtitleSettings.enabled !== false}
                  onChange={(e) =>
                    setSubtitleSettings((p) => ({ ...p, enabled: e.target.checked }))
                  }
                  className="h-4 w-4 accent-brand"
                />
                {t("pipeline.subtitleEnabled")}
              </label>
              <div>
                <label className="mb-1 block text-[11px] text-text-tertiary">
                  {t("pipeline.subtitlePosition")}
                </label>
                <select
                  value={subtitleSettings.position ?? "bottom"}
                  onChange={(e) =>
                    setSubtitleSettings((p) => ({
                      ...p,
                      position: e.target.value as "top" | "center" | "bottom",
                    }))
                  }
                  className={selectClass}
                >
                  <option value="top">{t("pipeline.subtitlePosTop")}</option>
                  <option value="center">{t("pipeline.subtitlePosCenter")}</option>
                  <option value="bottom">{t("pipeline.subtitlePosBottom")}</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="mb-1 block text-[11px] text-text-tertiary">
                  {t("pipeline.subtitleFontSize")}
                </label>
                <input
                  type="number"
                  min={12}
                  max={96}
                  value={subtitleSettings.font_size ?? 48}
                  onChange={(e) =>
                    setSubtitleSettings((p) => ({
                      ...p,
                      font_size: Number(e.target.value) || undefined,
                    }))
                  }
                  className="w-24 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-text-tertiary">
                  {t("pipeline.subtitleMaxChars")}
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={subtitleSettings.max_chars_per_line ?? 20}
                  onChange={(e) =>
                    setSubtitleSettings((p) => ({
                      ...p,
                      max_chars_per_line: Number(e.target.value) || undefined,
                    }))
                  }
                  className="w-24 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-brand"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSaveSubtitleSettings()}
                className={ghostBtnClass}
              >
                {busy ? t("common.saving") : t("pipeline.saveSettings")}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <label className="mb-2 block text-xs font-medium text-text-secondary">
              {t("pipeline.bgmLabel")}
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {bgmKey ? (
                <>
                  <audio
                    controls
                    preload="none"
                    src={`/api/bgm/${(bgmKey.split("/").pop() ?? "").split("?")[0]}?u=${
                      (bgmKey.match(/users\/([^/]+)\/bgm\//) ?? [])[1] ?? ""
                    }`}
                    className="h-8 w-56"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onRemoveBgm()}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary transition hover:border-error/50 hover:text-error disabled:opacity-40"
                  >
                    {t("pipeline.bgmRemove")}
                  </button>
                </>
              ) : (
                <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-brand/50 hover:text-text-primary">
                  {t("pipeline.bgmUpload")}
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUploadBgm(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              <span className="text-[11px] text-text-tertiary">{t("pipeline.bgmPlayHint")}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const entry = ttsEntries.find((e) => e.id === ttsEntryId);
              const content: Record<string, unknown> = {
                subtitle: subtitleText,
              };
              if (entry?.voice) content.voice = entry.voice;
              onSaveNode(5, content);
            }}
            className={primaryBtnClass(busy)}
          >
            {busy ? t("common.saving") : t("pipeline.saveRegenerate")}
          </button>
        </div>
      </div>
    );
  }

  // Node 6 — i2v: animated clips — 两栏: 左镜头列表 / 右选中镜头视频+参数.
  const isClipNode = synthesis === "i2v" && node.id === 6;
  if (isClipNode) {
    const clips = taskDetail?.assets.filter((a) => a.type === "clip") ?? [];
    const renderClipHeader = () => (
      <>
        {renderHeader()}
      </>
    );
    const hasAny = clips.length > 0;
    const clipAssetFor = (idx: number) => {
      const file = `clip-${pad(idx)}-`;
      const c = clips.find((a) => a.url.includes(file));
      if (c) return c.url;
      const canonical = clips.find((a) => a.url.endsWith(`clip-${pad(idx)}.mp4`));
      return canonical ? canonical.url : null;
    };
    const clipUrlFor = (key: string) => {
      const file = key.split("/").pop() ?? "";
      return assetUrl("clips", file);
    };
    const curClipFor = (idx: number) => {
      const s = shotEdits?.find((x) => x.index === idx);
      const cands = s?.clip_candidates ?? [];
      const curKey = cands.find((c) => c.is_default)?.key;
      return curKey ? clipUrlFor(curKey) : clipAssetFor(idx);
    };
    return (
      <div>
        {renderClipHeader()}
        {/* PIPELINE_TASK_13 — composed final video + export (S6 生成视频: i2v
            mode also previews the finished video once composition ran) */}
        {finalVideoUrl ? (
          <div className="mt-4">
            <video
              controls
              preload="metadata"
              src={finalVideoUrl}
              className="w-full rounded-lg border border-border bg-black"
            />
            {exportRow ? (
              <div className="mt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onDownloadExport}
                  className={primaryBtnClass(busy)}
                >
                  {t("pipeline.downloadExportZip")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {hasAny ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setRegModal({ node: 6, scope: "all", mode: "direct" })
                }
                className={warnBtnClass(busy)}
              >
                {t("pipeline.regenAllClips")}
              </button>
              <button
                type="button"
                onClick={() => onDownloadStageZip("clips")}
                className={ghostBtnClass}
              >
                {t("taskDetail.downloadZip")}
              </button>
              <p className="text-xs text-text-tertiary">{t("pipeline.clipsHint")}</p>
            </div>
            <div className="mt-3 flex items-start gap-4">
              {/* 左栏: 镜头列表 */}
              <div
                className="w-56 shrink-0 space-y-1.5 rounded-lg border border-border p-2"
                style={{ width: 224 }}
              >
                {shotEdits?.map((shot, i) => {
                  const idx = selShot >= (shotEdits?.length ?? 0) ? (shotEdits?.length ?? 0) - 1 : selShot;
                  const isSel = i === idx;
                  return (
                    <button
                      key={shot.index}
                      type="button"
                      onClick={() => setSelShot(i)}
                      className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition ${
                        isSel
                          ? "border-brand/60 bg-brand-subtle"
                          : "border-border hover:border-brand/40"
                      }`}
                    >
                      {curClipFor(shot.index) ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video
                          src={curClipFor(shot.index) ?? ""}
                          preload="metadata"
                          muted
                          className="h-10 w-16 shrink-0 rounded border border-border bg-black object-contain"
                        />
                      ) : (
                        <div className="h-10 w-16 shrink-0 rounded border border-border bg-bg-muted/40" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-text-tertiary">
                          {t("pipeline.shotN", { n: i + 1, duration: shot.duration })}
                        </div>
                        <div className="truncate text-xs font-medium text-text-primary">
                          {shot.title?.trim() || t("pipeline.shotTitlePlaceholder")}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* 右栏: 选中镜头视频 + 参数 */}
              <div className="min-w-0 flex-1 rounded-lg border border-border p-3">
                {(() => {
                  const i = selShot >= (shotEdits?.length ?? 0) ? (shotEdits?.length ?? 0) - 1 : selShot;
                  const shot = shotEdits?.[i];
                  if (!shot) return null;
                  const idx = shot.index;
                  const cands = shot.clip_candidates ?? [];
                  const curUrl = curClipFor(idx);
                  return (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-text-tertiary">
                          {t("pipeline.shotN", { n: i + 1, duration: shot.duration })}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setRegModal({ node: 6, scope: "single", index: idx, mode: "direct" })
                            }
                            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary transition hover:border-brand/50 hover:text-text-primary disabled:opacity-40"
                          >
                            {t("pipeline.regenShotClip")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              onSaveNode(
                                6,
                                {
                                  shots: shotEdits?.map((s) => ({
                                    index: s.index,
                                    motion: s.motion,
                                    title: s.title,
                                  })),
                                },
                              )
                            }
                            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary transition hover:border-brand/50 hover:text-text-primary disabled:opacity-40"
                          >
                            {busy ? t("common.saving") : t("common.save")}
                          </button>
                        </div>
                      </div>
                      {/* 视频播放 */}
                      {curUrl ? (
                        <video
                          controls
                          preload="metadata"
                          src={curUrl}
                          className="mt-2 aspect-video w-full rounded-lg border border-border bg-black object-contain"
                        />
                      ) : (
                        <div className="mt-2 aspect-video w-full rounded-lg border border-dashed border-border" />
                      )}
                      {/* 标题 */}
                      <input
                        value={shot.title}
                        onChange={(e) => {
                          const next = [...(shotEdits ?? [])];
                          next[i] = { ...next[i], title: e.target.value };
                          setShotEdits(next);
                        }}
                        placeholder={t("pipeline.shotTitlePlaceholder")}
                        className={`mt-2 ${inputClass} text-xs`}
                      />
                      {/* 运镜/动作提示 */}
                      <label className="mt-3 block text-[11px] font-semibold text-text-tertiary">
                        {t("pipeline.shotMotion")}
                      </label>
                      <textarea
                        value={shot.motion}
                        onChange={(e) => {
                          const next = [...(shotEdits ?? [])];
                          next[i] = { ...next[i], motion: e.target.value };
                          setShotEdits(next);
                        }}
                        rows={2}
                        placeholder={t("pipeline.shotMotion")}
                        className={`mt-1 ${inputClass} resize-y text-xs`}
                      />
                      {/* 候选 clip */}
                      {cands.length > 0 ? (
                        <div className="mt-2 border-t border-border pt-2">
                          <p className="text-[11px] text-text-tertiary">{t("pipeline.clipCandidates")}</p>
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {cands.map((c) => (
                              <button
                                key={c.key}
                                type="button"
                                disabled={busy}
                                onClick={() => void onSelectCandidate(idx, c.key, "clip")}
                                className={`overflow-hidden rounded border ${
                                  c.is_default
                                    ? "border-brand ring-1 ring-brand"
                                    : "border-border opacity-70 hover:opacity-100"
                                }`}
                                title={t("pipeline.clipCandidatesHint")}
                              >
                                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                <video
                                  src={clipUrlFor(c.key) ?? ""}
                                  preload="metadata"
                                  muted
                                  className="h-12 w-20 bg-black object-contain"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
          </>
        ) : (
          <EmptyNode status={status} t={t} />
        )}
      </div>
    );
  }

  // S7 合成（预览）/ S8 复检（无下载）/ S9 开放导出（预览 + 下载）。
  if (node.id === 8) {
    const review = (stepPayload(8)?.review as { passed?: boolean; feedback?: string } | null) ?? null;
    return (
      <div>
        {renderHeader()}
        {renderTemplatePicker(9)}
        {review ? (
          <div className="mt-4 rounded-lg border border-border bg-bg-muted/40 p-4">
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2.5 py-0.5 text-xs font-semibold ${
                  review.passed ? "bg-success/15 text-success" : "bg-error/15 text-error"
                }`}
              >
                {review.passed ? `✓ ${t("pipeline.reviewPassed")}` : `✗ ${t("pipeline.reviewFailed")}`}
              </span>
            </div>
            {review.feedback ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{review.feedback}</p>
            ) : null}
          </div>
        ) : (
          <EmptyNode status={status} t={t} />
        )}
      </div>
    );
  }
  return (
    <div>
      {renderHeader()}
      {finalVideoUrl ? (
        <>
          <video
            controls
            preload="metadata"
            src={finalVideoUrl}
            className="mt-4 w-full rounded-lg border border-border bg-black"
          />
          {exportRow ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={onDownloadExport}
                className={primaryBtnClass(busy)}
              >
                {t("pipeline.downloadExportZip")}
              </button>
              <span className="text-xs text-text-tertiary">
                {t("pipeline.exportId", { id: exportRow.export_id.slice(0, 8) })}
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <EmptyNode status={status} t={t} />
          {taskDetail?.assets.some((a) => a.type === "mp4") ? (
            <p className="mt-2 text-xs text-text-tertiary">
              {t("pipeline.finalMp4Hint")}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// S5 复核 gate panel (PIPELINE_TASK_13) — shown when the pipeline pauses right
// before composition (current_step = totalSteps-2, status=waiting). Summarizes
// the ready assets (voiceover / BGM / clips / subtitles), lets the user tweak
// the subtitle burn-in settings on the spot, then confirms to resume.
// ---------------------------------------------------------------------------

function GatePanel(props: {
  status: StepStatus;
  synthesis: "static" | "i2v";
  isWaiting: boolean;
  busy: boolean;
  taskDetail: TaskDetail | null;
  subtitleSettings: SubtitleSettings;
  setSubtitleSettings: (
    v: SubtitleSettings | ((p: SubtitleSettings) => SubtitleSettings),
  ) => void;
  onSaveSubtitleSettings: () => Promise<void>;
  onContinue: () => Promise<void>;
  onBackToVoice: () => void;
  ttsEntries: ModelConfig[];
  ttsEntryId: string;
  bgmKey: string | null;
}) {
  const { t } = useTranslation();
  const {
    status,
    synthesis,
    isWaiting,
    busy,
    taskDetail,
    subtitleSettings,
    setSubtitleSettings,
    onSaveSubtitleSettings,
    onContinue,
    onBackToVoice,
    ttsEntries,
    ttsEntryId,
    bgmKey,
  } = props;

  const selectClass =
    "rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-text-primary outline-none transition focus:border-brand disabled:opacity-40";
  const primaryBtnClass = (busyState?: boolean) =>
    `btn btn-primary ${
      busyState ? "disabled:opacity-40" : ""
    }`;
  const ghostBtnClass =
    "rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition hover:border-brand/50 hover:text-text-primary disabled:opacity-40";

  const voiceName = ttsEntries.find((e) => e.id === ttsEntryId)?.voice ?? t("pipeline.gateNotSet");
  const audioCount = taskDetail?.assets.filter((a) => a.type === "audio").length ?? 0;
  const clipCount = taskDetail?.assets.filter((a) => a.type === "clip").length ?? 0;
  const subsEnabled = subtitleSettings.enabled !== false;
  const subPosLabel =
    subtitleSettings.position === "top"
      ? t("pipeline.subtitlePosTop")
      : subtitleSettings.position === "center"
        ? t("pipeline.subtitlePosCenter")
        : t("pipeline.subtitlePosBottom");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-warning/30 bg-warning-bg/40 p-4">
        <p className="text-sm leading-6 text-text-secondary">{t("pipeline.gateDesc")}</p>
        <div className="mt-4 space-y-2">
          <InfoRow
            label={t("pipeline.gateAudio")}
            value={`${voiceName} · ${audioCount > 0 ? t("pipeline.gateAudioCount", { n: audioCount }) : t("pipeline.gateNotGenerated")}`}
          />
          <InfoRow label={t("pipeline.gateBgm")} value={bgmKey ? t("pipeline.gateOn") : t("pipeline.gateOff")} />
          {synthesis === "i2v" ? (
            <InfoRow
              label={t("pipeline.gateClips")}
              value={clipCount > 0 ? t("pipeline.gateClipsCount", { n: clipCount }) : t("pipeline.gateNotGenerated")}
            />
          ) : null}
          <InfoRow
            label={t("pipeline.subtitleEnabled")}
            value={subsEnabled ? `${t("pipeline.gateOn")} · ${subPosLabel}` : t("pipeline.gateOff")}
          />
        </div>
      </div>

      {/* Quick subtitle burn-in tweak before composition */}
      <div className="rounded-lg border border-border p-3">
        <label className="mb-2 block text-xs font-medium text-text-secondary">
          {t("pipeline.subtitleRhythm")}
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={subsEnabled}
              onChange={(e) =>
                setSubtitleSettings((p) => ({ ...p, enabled: e.target.checked }))
              }
              className="h-4 w-4 accent-brand"
            />
            {t("pipeline.subtitleEnabled")}
          </label>
          <div>
            <label className="mb-1 block text-[11px] text-text-tertiary">
              {t("pipeline.subtitlePosition")}
            </label>
            <select
              value={subtitleSettings.position ?? "bottom"}
              onChange={(e) =>
                setSubtitleSettings((p) => ({
                  ...p,
                  position: e.target.value as "top" | "center" | "bottom",
                }))
              }
              className={selectClass}
            >
              <option value="top">{t("pipeline.subtitlePosTop")}</option>
              <option value="center">{t("pipeline.subtitlePosCenter")}</option>
              <option value="bottom">{t("pipeline.subtitlePosBottom")}</option>
            </select>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSaveSubtitleSettings()}
            className={ghostBtnClass}
          >
            {busy ? t("common.saving") : t("pipeline.saveSettings")}
          </button>
        </div>
      </div>

      {/* Confirm / back actions */}
      {isWaiting ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onContinue()}
            className={primaryBtnClass(busy)}
          >
            {busy ? t("common.saving") : t("pipeline.gateConfirmCompose")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onBackToVoice}
            className={ghostBtnClass}
          >
            {t("pipeline.gateBackToVoice")}
          </button>
        </div>
      ) : (
        <p className="text-xs text-text-tertiary">
          {status === "failed" ? t("taskDetail.hintFailed") : t("taskDetail.hintDone")}
        </p>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-32 shrink-0 text-xs font-medium text-text-tertiary">{label}</span>
      <span className="text-sm text-text-secondary">{value}</span>
    </div>
  );
}

function EmptyNode({ status, t }: { status: WizardNodeStatus; t: TFunc }) {
  if (status === "done") {
    return (
      <div className="rounded-lg border border-border bg-bg-muted px-4 py-10 text-center text-sm text-text-tertiary">
        {t("pipeline.nodeComplete")}
      </div>
    );
  }
  if (status === "waiting") {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning-bg/40 px-4 py-10 text-center text-sm text-warning">
        {t("pipeline.pausedBeforeStep")}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-bg-muted px-4 py-10 text-center text-sm text-text-tertiary">
      {t("pipeline.nodeNotRun")}
    </div>
  );
}
