"use client";

// PIPELINE_TASK_12 — 快速生成视频 (/app/quick). The former /app workbench form
// (PIPELINE_TASK_10) moved here verbatim — every API call / piece of state is
// identical — and restyled pixel-faithfully to the static quick.html layout:
//
//  • top hint line (平台免费额度 0/2 · 自备 Key 不限)
//  • warn bar when an LLM / 生图 / TTS channel is missing (links → /app/models)
//  • 4 numbered form blocks: 1 文案来源 (3 tabs) · 2 画面设置 · 3 配音设置 ·
//    3.5 视频设置 toggle · 4 成片设置
//  • sticky bottom action bar with summary chips + the generate button
//
// TTS 试听 reuses POST /api/model-configs/preview, BGM upload POSTs to
// /api/bgm, and 【开始生成视频】→ POST /api/projects { auto_run: true, task }
// → router.push('/app/tasks/[id]').

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiRaw } from "@/lib/api-client";
import type { ModelClass, ModelConfig, Prompt, Rule, RuleKind } from "@/lib/app-data";
import { useTranslation } from "@/i18n";
import { Btn, Card, Field, Input, Select, Textarea } from "@/components/app/proto";
import { RULE_KIND_LABELS, RULE_KINDS, STORYBOARD_PRESETS } from "@/lib/app-data";

const MODEL_CLASSES: ModelClass[] = ["llm", "image", "tts", "i2v"];
const AUTO = "__auto__";

/** 平台托管默认模型（wingray 部署实测可用；托管档 models 由后端忽略，此仅 UI 展示） */
const PLATFORM_DEFAULT: Record<ModelClass, string> = {
  llm: "DeepSeek-V4-Flash-0731",
  image: "Z-Image-Turbo",
  tts: "cosyvoice-v2",
  i2v: "Kling-V1-6-I2V",
};
// 固定试听文案（后端 POST /api/model-configs/preview 的 text 必填 ≤200）。
const PREVIEW_TEXT = "这是一段 AI 配音试听：欢迎使用 AI Video Studio，快速生成你的专属视频。";

type SourceTab = "direct" | "rewrite" | "create";
type Tab = "text" | "creative";

// PIPELINE_TASK_13 ③ AI 创业 — 商品库选品。
type ProductOption = { id: string; name: string; detail_text: string | null };

const chipClass = (active: boolean) =>
  `inline-flex rounded-lg border px-3 py-1 text-[13px] transition select-none ${
    active
      ? "border-brand bg-brand-subtle text-brand"
      : "border-border-strong bg-bg-subtle text-text-primary hover:border-brand"
  }`;

function AspectChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  // 后端 ASPECTS 支持 9:16/16:9/1:1/4:3/4:5；常显 4 档，"更多" 展开 4:5。
  const base = ["9:16", "16:9", "1:1", "4:3"];
  const moreOpen = !base.includes(value);
  const chips = moreOpen ? [...base, "4:5"] : [...base, t("quick.more")];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o === t("quick.more") ? "4:5" : o)}
          className={chipClass(o === value)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export default function QuickGenPage() {
  const { t } = useTranslation();
  const router = useRouter();

  // Entry form state. sourceTab mirrors the static 3-card group; direct → the
  // "text" path, rewrite + create → the "creative" path (identical API flow).
  const [sourceTab, setSourceTab] = useState<SourceTab>("rewrite");
  const tab: Tab = sourceTab === "direct" ? "text" : "creative";
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [creativePrompt, setCreativePrompt] = useState("");
  const [creativePromptName, setCreativePromptName] = useState("");

  // PIPELINE_TASK_13 ③ AI 创业 — 商品库选品（选品后其 detail_text 作为 S1 事实来源）。
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productId, setProductId] = useState<string>("");

  // 配音渠道 · 字幕配置（S4 字幕开关/字号/位置）+ 人声增益（音量 0–100，50=原始音量）。
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [subtitleFontSize, setSubtitleFontSize] = useState(12);
  const [subtitlePosition, setSubtitlePosition] = useState<string>("bottom");
  const [voiceGain, setVoiceGain] = useState<number>(50);

  // Shared config state.
  const [llmId, setLlmId] = useState<string>(AUTO);
  const [imageId, setImageId] = useState<string>(AUTO);
  const [ttsId, setTtsId] = useState<string>(AUTO);
  const [voice, setVoice] = useState<string>("");
  const [speed, setSpeed] = useState<number>(1);
  const [videoModelId, setVideoModelId] = useState<string>(AUTO);
  const [videoEnabled, setVideoEnabled] = useState(false);
  // 画面/成片比例（提交时 i2v 用 videoAspect，static 用 imageAspect；filmAspect 仅展示）。
  const [imageAspect, setImageAspect] = useState("9:16");
  const [filmAspect, setFilmAspect] = useState("9:16");
  const [videoAspect, setVideoAspect] = useState("9:16");
  // 画面设置：分镜拆解（S3）/画面风格（S4）模板选择（存模板 id，空=默认）。
  const [storyboardTplId, setStoryboardTplId] = useState<string>("");
  const [styleTplId, setStyleTplId] = useState<string>("");
  // C1 — 分镜预设 chips（general / ecommerce / story），未选模板时其 body 作为 S3 提示词。
  const [storyboardPreset, setStoryboardPreset] = useState("general");
  // CORE-FEATURES — 可配置规则：4 类各可选一条（rewrite/split/image/i2v），
  // 空 = 系统默认；创建任务时快照进 task.config.rules。
  const [ruleSel, setRuleSel] = useState<Record<RuleKind, string>>({
    rewrite: "",
    split: "",
    image: "",
    i2v: "",
  });
  // C1 — AI 改写 tab 的对标链接（Benchmark video URL），填写后 source_type=url。
  const [benchmarkUrl, setBenchmarkUrl] = useState("");

  // BGM.
  const [bgmKey, setBgmKey] = useState<string>("");
  const [bgmName, setBgmName] = useState<string>("");
  const [bgmUploading, setBgmUploading] = useState(false);
  const bgmInputRef = useRef<HTMLInputElement | null>(null);

  // Preview.
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewMsg, setPreviewMsg] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Submission.
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // 功能引导（琥珀色提示，非错误）：任务提醒/保存草稿暂未开放时的说明。
  const [notice, setNotice] = useState<string | null>(null);

  // Live model_configs entries per class + prompt defaults.
  const [byClass, setByClass] = useState<Record<ModelClass, ModelConfig[]>>({
    llm: [],
    image: [],
    tts: [],
    i2v: [],
  });
  // C1 — 模型配置加载完成标记（避免首帧空列表误报"通道缺失"）。
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  // CORE-FEATURES — 规则列表（4 类可配规则，quick 页选择器数据源）。
  const [rules, setRules] = useState<Rule[]>([]);
  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  useEffect(() => {
    apiFetch<{ items: ModelConfig[] }>("/api/model-configs", { cache: "no-store" })
      .then((d) => {
        const list = d?.items ?? [];
        const byClassNext: Record<ModelClass, ModelConfig[]> = { llm: [], image: [], tts: [], i2v: [] };
        for (const cls of MODEL_CLASSES) {
          byClassNext[cls] = list.filter((e) => e.provider_class === cls && e.enabled);
        }
        setByClass(byClassNext);
        // Preselect defaults.
        const def = (cls: ModelClass) =>
          byClassNext[cls].find((e) => e.is_default)?.id ?? byClassNext[cls][0]?.id ?? AUTO;
        setLlmId(def("llm"));
        setImageId(def("image"));
        setTtsId(def("tts"));
        setVideoModelId(def("i2v"));
        const ttsDefault = byClassNext.tts.find((e) => e.is_default) ?? byClassNext.tts[0];
        setVoice(ttsDefault?.voice ?? "");
        setModelsLoaded(true);
      })
      .catch(() => setModelsLoaded(true));
    apiFetch<{ items: Prompt[] }>("/api/prompts", { cache: "no-store" })
      .then((d) => {
        if (d?.items) setPrompts(d.items);
      })
      .catch(() => {});
    // CORE-FEATURES — 规则列表加载；预选各类的 is_default（未定义默认则留空走系统默认）。
    apiFetch<{ items: Rule[] }>("/api/rules", { cache: "no-store" })
      .then((d) => {
        const list = d?.items ?? [];
        setRules(list);
        setRuleSel((prev) => {
          const next: Record<RuleKind, string> = { ...prev };
          for (const k of RULE_KINDS) {
            const def = list.find((r) => r.kind === k && r.is_default && r.enabled);
            if (def && !next[k]) next[k] = def.id;
          }
          return next;
        });
      })
      .catch(() => {});
    // ③ AI 创业 — 商品库选品。
    apiFetch<{ items: Array<{ id: string; name: string; detail_text: string | null; status?: string }> }>(
      "/api/products",
      { cache: "no-store" },
    )
      .then((d) => {
        if (d?.items) {
          setProducts(d.items.filter((p) => p.status !== "inactive"));
        }
      })
      .catch(() => {});
  }, []);

  const ttsEntry = useMemo(
    () => byClass.tts.find((e) => e.id === ttsId) ?? null,
    [byClass.tts, ttsId],
  );

  // 是否已有任一自配模型 —— 区分纯托管档（全空）与混合/BYOK 档。
  const hasAnyConfig = useMemo(
    () => MODEL_CLASSES.some((cls) => byClass[cls].length > 0),
    [byClass],
  );

  // C1 — 通道缺失校验（llm / image / tts / i2v；i2v 仅在开启视频生成时校验）。
  // 原型 quick.html banner：`Missing channel 通道缺失 — 未配置默认 {cls} 模型… 前往模型配置 →`。
  // 语义「非托管可用才提示」：
  //   纯托管档（无任何自配模型）由平台 Key 池覆盖 llm/image/tts → 缺失不告警；
  //   但 i2v 即使托管档也需本人 i2v 配置（后端 403 I2V_NOT_AVAILABLE）→ 缺失即提示；
  //   混合/BYOK 档（有任一自配模型）要求四类全配齐 → 缺失类全部提示。
  const missingChannels = useMemo(() => {
    const list: ModelClass[] = [];
    for (const cls of MODEL_CLASSES) {
      if (cls === "i2v" && !videoEnabled) continue;
      if (byClass[cls].length === 0 && (hasAnyConfig || cls === "i2v")) list.push(cls);
    }
    return list;
  }, [byClass, videoEnabled, hasAnyConfig]);

  // C1 — 预计消耗积分（COST_ESTIMATES：static 60 / i2v 300）。
  const estCredits = videoEnabled ? 300 : 60;

  const CHANNEL_LABEL_KEY: Record<ModelClass, string> = {
    llm: "quick.llmChannel",
    image: "quick.imageChannel",
    tts: "quick.ttsChannel",
    i2v: "quick.videoChannel",
  };

  // 试听可选音色：后端 model-configs 无独立 tts_voices 枚举，以当前 TTS
  // 配置自身的 voice 为准（可留空走配置默认）。
  const voiceOptions = useMemo(() => {
    const list: string[] = [];
    if (ttsEntry?.voice && !list.includes(ttsEntry.voice)) list.unshift(ttsEntry.voice);
    return list;
  }, [ttsEntry]);

  const defaultPrompts = useMemo(() => {
    const byType = new Map<string, Prompt>();
    for (const p of prompts) {
      if (!p.enabled) continue;
      const cur = byType.get(p.type);
      if (!cur || (p.is_default && !cur.is_default)) byType.set(p.type, p);
    }
    return byType;
  }, [prompts]);

  const creativeDefaultPrompt = defaultPrompts.get("script");
  // 模板中心"文案模板"分类下的全部启用模板（可下拉选择任意一个）。
  const copyTemplates = useMemo(
    () => (prompts ?? []).filter((p) => p.type === "script" && p.enabled),
    [prompts],
  );
  // 画面设置模板（S4 画面风格）。
  const styleTemplates = useMemo(
    () => (prompts ?? []).filter((p) => p.type === "style" && p.enabled),
    [prompts],
  );

  // -------------------------------------------------------------------------
  // Handlers (identical to the former /app workbench form)
  // -------------------------------------------------------------------------

  const handlePreview = async () => {
    if (previewBusy) return;
    setPreviewBusy(true);
    setPreviewMsg(null);
    try {
      if (!ttsEntry) {
        setPreviewMsg(t("app.quickGenNoTts"));
        return;
      }
      const res = await apiRaw("/api/model-configs/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ttsEntry.id,
          voice: voice || ttsEntry.voice || undefined,
          text: PREVIEW_TEXT,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: { message?: string }; message?: string }
          | null;
        throw new Error(data?.error?.message ?? data?.message ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = previewAudioRef.current;
      if (audio) {
        audio.src = url;
        await audio.play().catch(() => {});
      }
      setPreviewMsg(t("app.quickGenPreviewOk"));
    } catch (err) {
      setPreviewMsg(
        t("app.quickGenPreviewFail", { msg: err instanceof Error ? err.message : "error" }),
      );
    } finally {
      setPreviewBusy(false);
    }
  };

  const handleBgmUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgmUploading(true);
    setFormError(null);
    try {
      const buf = await file.arrayBuffer();
      // 后端响应 { bgm_key, url, size, duration }（非 key/filename）。
      const data = await apiFetch<{ bgm_key: string; duration?: number | null }>("/api/bgm", {
        method: "POST",
        headers: {
          "X-BGM-Filename": file.name,
        },
        body: buf,
      });
      setBgmKey(data.bgm_key);
      setBgmName(file.name);
    } catch {
      setFormError(t("app.quickGenBgmFail"));
    } finally {
      setBgmUploading(false);
      if (bgmInputRef.current) bgmInputRef.current.value = "";
    }
  };

  const handlePickPrompt = (type: string) => {
    const p = defaultPrompts.get(type);
    if (p) {
      setCreativePrompt(p.body);
      setCreativePromptName(p.name);
    } else {
      setCreativePromptName("");
    }
  };

  // PIPELINE_TASK_13 ③ AI 创业 — 选品后把商品详情原文作为文案生成的事实来源。
  const handleProductChange = (id: string) => {
    setProductId(id);
    const product = products.find((p) => p.id === id);
    setSourceText(product?.detail_text ?? "");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    // C1 — 对标链接（AI 改写 tab）优先作为 source_type=url 的 prompt 来源。
    const promptText = benchmarkUrl.trim() || (tab === "text" ? text.trim() : sourceText.trim());
    // 标题留空则客户端兜底取文案前 50 字（后端 title 必填 ≤200）。
    if (!promptText) {
      setFormError(t("app.quickGenEmptyText"));
      return;
    }

    setCreating(true);
    setFormError(null);
    setNotice(null);
    try {
      // V2 契约：POST /api/projects { title, prompt, source_type, auto_run, task }。
      const taskConfig: Record<string, unknown> = {
        content_language: "en",
        synthesis: { aspect: videoEnabled ? videoAspect : imageAspect, subtitle_burn: subtitleEnabled },
        models: {},
      };
      // BYOK 档要求 config.models.{llm,image,tts[,i2v]} 全量显式传（后端
      // MISSING_PROVIDER_CONFIG 校验）；用户只选了部分模型时，未选类补默认
      // 配置；若某类完全没有可用配置则提示，而非静默降级为 managed。
      const required: ModelClass[] = ["llm", "image", "tts", ...(videoEnabled ? (["i2v"] as ModelClass[]) : [])];
      const chosenMap: Record<ModelClass, string> = {
        llm: llmId,
        image: imageId,
        tts: ttsId,
        i2v: videoModelId,
      };
      const models: Record<string, { model_config_id: string }> = {};
      let hasChoice = false;
      for (const cls of required) {
        const chosen = chosenMap[cls];
        if (chosen && chosen !== AUTO) {
          hasChoice = true;
          models[cls] = { model_config_id: chosen };
        }
      }
      if (hasChoice) {
        for (const cls of required) {
          if (models[cls]) continue;
          const pick = byClass[cls]?.find((e) => e.is_default)?.id ?? byClass[cls]?.[0]?.id;
          if (!pick) {
            setFormError(t("quick.byokIncomplete"));
            setCreating(false);
            return;
          }
          models[cls] = { model_config_id: pick };
        }
      }
      taskConfig.models = models;
      // 配音参数：L6 消费 config.tts.{voice,speed,volume}（旧 s5 引擎未接线，用 volume 不用 gain）。
      taskConfig.tts = { voice: voice || undefined, speed, volume: voiceGain };
      if (bgmKey) taskConfig.bgm_key = bgmKey;
      taskConfig.subtitle = { enabled: subtitleEnabled, font_size: subtitleFontSize, position: subtitlePosition };
      const tplSel: Record<string, string> = {};
      if (storyboardTplId) tplSel.storyboard = storyboardTplId;
      if (styleTplId) tplSel.style = styleTplId;
      if (Object.keys(tplSel).length > 0) taskConfig.templates = tplSel;
      const promptSel: Record<string, string> = {};
      if (tab === "creative" && creativePrompt.trim()) promptSel.script = creativePrompt.trim();
      if (!storyboardTplId) {
        // C1 — 分镜预设 chips 选中项作为 S3 提示词（general 默认）。
        const preset = STORYBOARD_PRESETS.find((p) => p.id === storyboardPreset);
        if (preset) promptSel.storyboard = preset.body;
      }
      if (Object.keys(promptSel).length > 0) taskConfig.prompts = promptSel;
      // CORE-FEATURES — 规则快照：{ kind: ruleId }，仅记录用户明确勾选的规则
      // （未选 → 不写字段 → 流水线走系统默认）。
      const ruleSnap: Record<string, string> = {};
      for (const k of RULE_KINDS) {
        const id = ruleSel[k];
        if (id) ruleSnap[k] = id;
      }
      if (Object.keys(ruleSnap).length > 0) taskConfig.rules = ruleSnap;
      if (sourceTab === "create" && productId) taskConfig.product_id = productId;
      if (benchmarkUrl.trim()) taskConfig.benchmark_url = benchmarkUrl.trim();
      const finalTitle = title.trim() || promptText.slice(0, 50);
      const body: Record<string, unknown> = {
        title: finalTitle,
        prompt: promptText,
        source_type: benchmarkUrl.trim() ? "url" : sourceTab === "create" ? "product" : "text",
        auto_run: true,
        task: {
          mode: videoEnabled ? "i2v" : "static",
          track: hasChoice ? "byok" : "managed",
          run_mode: "auto",
          config: taskConfig,
        },
      };
      if (sourceTab === "create" && productId) body.product_id = productId;
      const data = await apiFetch<{ project: { id: string }; task?: { id: string } }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.push(`/app/tasks/${data.task?.id ?? data.project.id}`);
    } catch (err) {
      setFormError(
        t("app.quickGenCreateFail", { msg: err instanceof Error ? err.message : "error" }),
      );
    } finally {
      setCreating(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const modelSelect = (
    id: string,
    setter: (v: string) => void,
    cls: ModelClass,
    emptyKey: string,
  ) => {
    // 纯托管档（无任何自配模型）：下拉只展示平台托管默认模型，值保持 AUTO
    // （语义=平台托管自动调度；后端托管档忽略 models，此模型名仅 UI 展示）。
    if (!hasAnyConfig && byClass[cls].length === 0) {
      return (
        <Select value={id} onChange={(e) => setter(e.target.value)}>
          <option value={AUTO}>
            {PLATFORM_DEFAULT[cls]} ({t("quick.platformManaged")})
          </option>
        </Select>
      );
    }
    return (
      <Select value={id} onChange={(e) => setter(e.target.value)}>
        <option value={AUTO}>{t("pipeline.autoDefault")}</option>
        {byClass[cls].map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
            {e.is_default ? " (default)" : ""}
          </option>
        ))}
        {byClass[cls].length === 0 ? (
          <option value="" disabled>
            {t(emptyKey)}
          </option>
        ) : null}
      </Select>
    );
  };

  const tagRed = <span className="text-xs font-semibold text-error">{t("quick.required")}</span>;
  const tagGreen = <span className="text-xs font-semibold text-success">{t("quick.hasDefault")}</span>;
  const blockTitle = (no: string, label: string, tag?: React.ReactNode) => (
    <div className="mb-3 flex items-center justify-between">
      <div className="text-[15px] font-bold">
        <span className="text-brand">{no}</span> <span className="text-text-primary">{label}</span>
      </div>
      {tag}
    </div>
  );

  const tabClass = (active: boolean) =>
    `rounded border px-4 py-3.5 text-left transition ${
      active
        ? "border-brand bg-brand-subtle"
        : "border-border bg-bg-subtle hover:border-brand/60"
    }`;

  const sourceTabs = [
    { key: "direct" as SourceTab, label: t("app.quickGenTabText"), desc: t("quick.tabDirectDesc") },
    { key: "rewrite" as SourceTab, label: t("app.quickGenTabCreative"), desc: t("quick.tabRewriteDesc") },
    { key: "create" as SourceTab, label: t("quick.tabCreate"), desc: t("quick.tabCreateDesc") },
  ];
  const generateLabel = creating
    ? t("app.quickGenStarting")
    : sourceTab === "direct"
      ? t("app.quickGenStart")
      : t("quick.generateAiCreate");

  // C1 — 底部 sticky 汇总条（原型 quick.html）：aspect · 预设 · mode · 字幕 · 预计消耗。
  const summaryMode = videoEnabled ? "i2v" : "static";
  const summaryItems = [
    { node: <b key="a">{videoEnabled ? videoAspect : imageAspect}</b> },
    { node: <span key="p">{storyboardPreset} 预设</span> },
    { node: <b key="m">{summaryMode}</b> },
    { node: <span key="s">字幕 {subtitleEnabled ? "on" : "off"}</span> },
    {
      node: (
        <span key="e">
          {t("quick.estimatedLine", { credits: estCredits, count: 1, mode: summaryMode })}
        </span>
      ),
    },
  ];

  // ② AI 二创 / ③ AI 创业 共用：二创提示词（下拉选模板 + 可编辑预览）。
  const creativePromptBlock = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("quick.creativePrompt")}>
        <div className="flex gap-2">
          <Select
            value={creativePromptName || ""}
            onChange={(e) => {
              const name = e.target.value;
              if (!name) {
                setCreativePromptName("");
                setCreativePrompt("");
                return;
              }
              const p = copyTemplates.find((t) => t.name === name);
              if (p) {
                setCreativePrompt(p.body);
                setCreativePromptName(p.name);
              }
            }}
            className="flex-1"
          >
            <option value="">{t("quick.creativeDefault")}</option>
            {copyTemplates.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </Select>
          {creativeDefaultPrompt ? (
            <Btn
              size="sm"
              type="button"
              onClick={() => handlePickPrompt("script")}
              title={creativeDefaultPrompt.name}
            >
              {t("app.quickGenPickPrompt")}
            </Btn>
          ) : null}
        </div>
      </Field>
      <Field label={t("quick.promptPreview")}>
        <Textarea
          value={creativePrompt}
          onChange={(e) => setCreativePrompt(e.target.value)}
          className="h-[180px] min-h-[180px]"
          placeholder={t("quick.promptPreviewPlaceholder")}
        />
      </Field>
    </div>
  );

  return (
    <div className="mx-auto w-full pb-4">
      {/* ── 顶部快捷按钮 ── */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          <Btn size="sm" onClick={() => setNotice(t("quick.taskNotifyComingSoon"))}>
            {t("quick.taskNotify")}
          </Btn>
          <Btn size="sm" onClick={() => setNotice(t("quick.saveComingSoon"))}>
            {t("common.saved")}
          </Btn>
          <Btn size="sm" href="/app">{t("quick.backWorkbench")}</Btn>
        </div>
      </div>

      {/* ── 页面标题 ── */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-tight text-text-primary">
            {t("nav.quick")}
          </h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-5 text-text-secondary">
            {t("quick.pageDesc")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Btn href="/app/tasks/new">{t("quick.advancedCreate")}</Btn>
        </div>
      </header>

      <audio ref={previewAudioRef} className="hidden" />

      <form onSubmit={handleCreate} className="space-y-5">
        {/* C1 — 通道缺失警告条（原型 quick.html banner；非警戒色，链接 → /app/models） */}
        {modelsLoaded && missingChannels.length > 0 ? (
          <div className="banner" role="status">
            <span className="dot dot-run" />
            <span>
              <b>{t("quick.missingChannel")}</b> — {t("quick.missingChannelList", { channels: missingChannels.map((c) => t(CHANNEL_LABEL_KEY[c])).join(" / ") })}
              <a href="/app/models">{t("quick.missingChannelGo")} →</a>
            </span>
            <span className="spacer" />
            <span className="note">{t("quick.missingChannelNote")}</span>
          </div>
        ) : null}

        {/* ──────────────── 工作流 A/B（CORE-FEATURES：A 文案→…→合成视频；B = A + 图生视频） ──────────────── */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[15px] font-bold text-text-primary">{t("quick.workflowTitle")}</div>
            <span className={`text-xs font-semibold ${videoEnabled ? "text-success" : "text-text-tertiary"}`}>
              {videoEnabled ? t("quick.workflowBOn") : t("quick.workflowAOn")}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { key: "A", label: t("quick.workflowALabel"), desc: t("quick.workflowADesc") },
              { key: "B", label: t("quick.workflowBLabel"), desc: t("quick.workflowBDesc") },
            ].map((wf) => (
              <button
                key={wf.key}
                type="button"
                onClick={() => {
                  const next = wf.key === "B";
                  setVideoEnabled(next);
                  if (next && (videoModelId === AUTO || !videoModelId)) {
                    const def = byClass.i2v.find((e) => e.is_default) ?? byClass.i2v[0];
                    if (def) setVideoModelId(def.id);
                  }
                }}
                className={tabClass(videoEnabled === (wf.key === "B"))}
              >
                <div className="text-sm font-semibold text-text-primary">{wf.label}</div>
                <div className="mt-0.5 text-xs text-text-secondary">{wf.desc}</div>
              </button>
            ))}
          </div>
        </Card>

        {/* ───────────────── 1 文案来源 ───────────────── */}
        <Card>
          {blockTitle("1", t("quick.blockSource"), tagRed)}
          <div className="grid gap-2 sm:grid-cols-3">
            {sourceTabs.map((st) => (
              <button
                key={st.key}
                type="button"
                onClick={() => setSourceTab(st.key)}
                className={tabClass(sourceTab === st.key)}
              >
                <div className="text-sm font-semibold text-text-primary">{st.label}</div>
                <div className="mt-0.5 text-xs text-text-secondary">{st.desc}</div>
              </button>
            ))}
          </div>

          {sourceTab === "direct" ? (
            <div className="mt-4">
              <Field label={t("quick.videoTitleOptional")}>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("quick.autoExtractPlaceholder")}
                  maxLength={200}
                />
              </Field>
              <Field label={t("quick.fullVoiceover")}>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("quick.fullVoiceoverPlaceholder")}
                  rows={6}
                  maxLength={20000}
                />
              </Field>
            </div>
          ) : sourceTab === "rewrite" ? (
            <div className="mt-4">
              <Field label={t("quick.videoTitleOptional")}>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("quick.autoExtractPlaceholder")}
                  maxLength={200}
                />
              </Field>
              <Field label={t("quick.rewriteSource")}>
                <Textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder={t("quick.rewriteSourcePlaceholder")}
                  rows={6}
                  maxLength={20000}
                />
              </Field>
              {/* C1 — 对标链接（AI 改写 tab）：填写后 source_type=url */}
              <Field label={t("quick.benchmarkUrl")}>
                <Input
                  value={benchmarkUrl}
                  onChange={(e) => setBenchmarkUrl(e.target.value)}
                  placeholder={t("quick.benchmarkUrlPlaceholder")}
                  maxLength={2000}
                />
              </Field>
              {creativePromptBlock}
            </div>
          ) : (
            <div className="mt-4">
              <Field label={t("quick.videoTitleOptional")}>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("quick.autoExtractPlaceholder")}
                  maxLength={200}
                />
              </Field>
              <Field label={t("quick.productSelect")}>
                <div className="flex gap-2">
                  <Select
                    value={productId}
                    onChange={(e) => handleProductChange(e.target.value)}
                    className="flex-1"
                  >
                    <option value="">{t("quick.productSelectPlaceholder")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    {products.length === 0 ? (
                      <option value="" disabled>{t("app.quickGenNoModels")}</option>
                    ) : null}
                  </Select>
                  <Btn size="sm" type="button" href="/app/products">{t("quick.productBrowse")}</Btn>
                </div>
              </Field>
              {productId ? (
                <p className="mb-3 text-xs leading-5 text-text-secondary">
                  {t("quick.productPickHint")}
                </p>
              ) : null}
              {/* C1 — 对标链接（AI 创作 tab 与选品并列，与原型 g2 一致） */}
              <Field label={t("quick.benchmarkUrl")}>
                <Input
                  value={benchmarkUrl}
                  onChange={(e) => setBenchmarkUrl(e.target.value)}
                  placeholder={t("quick.benchmarkUrlPlaceholder")}
                  maxLength={2000}
                />
              </Field>
              <Field label={t("quick.rewriteSource")}>
                <Textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder={t("quick.rewriteSourcePlaceholder")}
                  rows={6}
                  maxLength={20000}
                />
              </Field>
              {creativePromptBlock}
            </div>
          )}
        </Card>

        {/* ───────────────── 2 画面设置 ───────────────── */}
        <Card>
          {blockTitle("2", t("quick.blockVisual"), tagGreen)}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("quick.llmChannel")}>
              {modelSelect(llmId, setLlmId, "llm", "app.quickGenNoLlm")}
            </Field>
            {/* C1 — 分镜预设 chips（general / ecommerce / story），对应 STORYBOARD_PRESETS */}
            <Field label={t("quick.storyboardPreset")}>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {STORYBOARD_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setStoryboardPreset(p.id)}
                    className={chipClass(storyboardPreset === p.id)}
                  >
                    {t(p.titleKey)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t("quick.styleTemplate")}>
              <div className="flex gap-2">
                <Select
                  className="flex-1"
                  value={styleTplId}
                  onChange={(e) => setStyleTplId(e.target.value)}
                >
                  <option value="">{t("quick.defaultStyle")}</option>
                  {styleTemplates.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
                <Btn
                  size="sm"
                  type="button"
                  disabled={!styleTplId}
                  onClick={() => {
                    const p = styleTemplates.find((t) => t.id === styleTplId);
                    if (p) window.alert(p.body);
                  }}
                >
                  {t("quick.viewPrompt")}
                </Btn>
              </div>
            </Field>
          </div>
          <div className="mt-2 grid gap-4 sm:grid-cols-3">
            <Field label={t("quick.imageChannel")}>
              {modelSelect(imageId, setImageId, "image", "app.quickGenNoImage")}
            </Field>
            <Field label={t("quick.imageAspect")}>
              <AspectChips value={imageAspect} onChange={setImageAspect} />
            </Field>
            <Field label={t("quick.filmAspect")}>
              <AspectChips value={filmAspect} onChange={setFilmAspect} />
            </Field>
          </div>
        </Card>

        {/* ───────────────── 3 配音设置 ───────────────── */}
        <Card>
          {blockTitle("3", t("quick.blockVoice"), tagGreen)}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("quick.ttsChannel")}>
              {modelSelect(ttsId, setTtsId, "tts", "app.quickGenNoTts")}
            </Field>
            <Field label={t("app.quickGenVoice")}>
              <Select
                value={voiceOptions.includes(voice) ? voice : ""}
                onChange={(e) => setVoice(e.target.value)}
              >
                <option value="">—</option>
                {voiceOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("app.quickGenSpeed")}>
              <Input
                type="number"
                min={0.5}
                max={2}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
            </Field>
            <Field label={t("quick.voiceGain")}>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={voiceGain}
                  onChange={(e) => setVoiceGain(Number(e.target.value))}
                  className="flex-1"
                  title={t("quick.voiceGainHint")}
                />
                <Btn size="sm" type="button" onClick={handlePreview} disabled={previewBusy || !ttsEntry}>
                  {previewBusy ? t("app.quickGenPreviewing") : t("quick.previewVoice")}
                </Btn>
              </div>
            </Field>
          </div>
          {previewMsg ? (
            <p className="mt-2 text-xs text-text-tertiary">{previewMsg}</p>
          ) : null}
          {/* 字幕配置（配音渠道 · 字幕开关 + S4 字号/位置） */}
          <div
            className="mt-4 grid gap-4 sm:grid-cols-3"
            style={{ opacity: subtitleEnabled ? 1 : 0.5 }}
          >
            <Field label={t("quick.subtitleSwitch")}>
              <div className="flex h-[38px] items-center gap-2.5">
                <span className={`text-xs font-semibold ${subtitleEnabled ? "text-success" : "text-text-tertiary"}`}>
                  {subtitleEnabled ? t("quick.videoOn") : t("quick.videoOff")}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={subtitleEnabled}
                  onClick={() => setSubtitleEnabled(!subtitleEnabled)}
                  className={`relative h-6 w-11 rounded-full transition ${
                    subtitleEnabled ? "bg-brand" : "bg-border-strong"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                      subtitleEnabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            </Field>
            <Field label={t("quick.subtitleFontSize")}>
              <Select
                value={subtitleFontSize}
                onChange={(e) => setSubtitleFontSize(Number(e.target.value))}
                disabled={!subtitleEnabled}
              >
                {[12, 16, 20, 24, 32].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("quick.subtitlePosition")}>
              <Select
                value={subtitlePosition}
                onChange={(e) => setSubtitlePosition(e.target.value)}
                disabled={!subtitleEnabled}
              >
                <option value="bottom">{t("quick.subtitlePosBottom")}</option>
                <option value="middle">{t("quick.subtitlePosMiddle")}</option>
                <option value="top">{t("quick.subtitlePosTop")}</option>
              </Select>
            </Field>
          </div>
        </Card>

        {/* ───────────────── 3.5 视频设置 ───────────────── */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[15px] font-bold text-text-primary">{t("quick.videoSettings")}</div>
            <div className="flex items-center gap-2.5">
              <span className={`text-xs font-semibold ${videoEnabled ? "text-success" : "text-text-tertiary"}`}>
                {videoEnabled ? t("quick.videoOn") : t("quick.videoOff")}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={videoEnabled}
                onClick={() => {
                  const next = !videoEnabled;
                  setVideoEnabled(next);
                  if (next && (videoModelId === AUTO || !videoModelId)) {
                    const def = byClass.i2v.find((e) => e.is_default) ?? byClass.i2v[0];
                    if (def) setVideoModelId(def.id);
                  }
                }}
                className={`relative h-6 w-11 rounded-full transition ${
                  videoEnabled ? "bg-brand" : "bg-border-strong"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                    videoEnabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
          <div
            className="grid gap-4 transition-opacity sm:grid-cols-2"
            style={{ opacity: videoEnabled ? 1 : 0.4, pointerEvents: videoEnabled ? "auto" : "none" }}
          >
            <Field label={t("quick.videoChannel")}>
              {modelSelect(videoModelId, setVideoModelId, "i2v", "app.quickGenNoI2v")}
            </Field>
            <Field label={t("quick.videoAspect")}>
              <AspectChips value={videoAspect} onChange={setVideoAspect} />
            </Field>
          </div>
        </Card>

        {/* ───────────────── 4 成片设置 ───────────────── */}
        <Card>
          {blockTitle("4", t("quick.blockFilm"), tagGreen)}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("quick.bgmLabel")}>
              <div className="flex items-center gap-2">
                <Select value={bgmKey ? "uploaded" : ""} disabled className="flex-1">
                  <option value="">{t("quick.noBgm")}</option>
                  {bgmKey ? <option value="uploaded">{bgmName}</option> : null}
                </Select>
                {bgmKey ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBgmKey("");
                      setBgmName("");
                    }}
                    className="shrink-0 text-xs font-medium text-text-tertiary transition hover:text-error"
                  >
                    {t("app.quickGenBgmRemove")}
                  </button>
                ) : null}
              </div>
            </Field>
            <Field label={t("quick.bgmGain")}>
              <div className="flex items-center gap-2">
                <Input defaultValue="-2" className="max-w-[120px]" />
                <Btn
                  size="sm"
                  type="button"
                  onClick={() => bgmInputRef.current?.click()}
                  disabled={bgmUploading}
                >
                  {bgmUploading ? t("app.quickGenUploadingBgm") : t("quick.uploadFile")}
                </Btn>
                <span className="text-xs text-text-secondary">{t("quick.noBgmHint")}</span>
              </div>
            </Field>
          </div>
          <input
            ref={bgmInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg"
            onChange={handleBgmUpload}
            className="hidden"
          />
        </Card>

        {/* ───────────────── 5 生成规则（CORE-FEATURES：4 类可配规则） ───────────────── */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[15px] font-bold">
              <span className="text-brand">5</span> <span className="text-text-primary">{t("quick.blockRules")}</span>
            </div>
            <Btn size="sm" type="button" href="/app/rules">{t("quick.ruleManage")}</Btn>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {RULE_KINDS.map((k) => {
              const kindRules = rules.filter((r) => r.kind === k && r.enabled);
              return (
                <Field key={k} label={t(RULE_KIND_LABELS[k])}>
                  <Select
                    value={ruleSel[k]}
                    onChange={(e) => setRuleSel((prev) => ({ ...prev, [k]: e.target.value }))}
                  >
                    <option value="">{t("quick.ruleDefault")}</option>
                    {kindRules.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.is_default ? " (default)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              );
            })}
          </div>
        </Card>

        {formError ? (
          <div className="api-err">
            {formError}
          </div>
        ) : notice ? (
          <div className="banner">
            <span className="dot dot-run" />
            <span>{notice}</span>
          </div>
        ) : null}

        {/* ───────────────── 底部操作栏（原型 sticky-bar） ───────────────── */}
        <div className="sticky-bar">
          {summaryItems.map((item, i) => (
            <span key={i} className="flex items-center gap-3.5">
              {item.node}
              {i < summaryItems.length - 1 ? <span className="sep" /> : null}
            </span>
          ))}
          <span className="spacer" />
          <span className="note">{t("quick.freezeNote")}</span>
          <Btn type="submit" variant="primary" disabled={creating} className="min-w-44 h-8 px-[22px]">
            {generateLabel}
          </Btn>
        </div>
      </form>
    </div>
  );
}
