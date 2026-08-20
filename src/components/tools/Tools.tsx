"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, Card, CardHead, Field, Input, Textarea, Select } from "@/components/app/proto";
import type { Shot } from "@/lib/siliconflow";
import { VOICE_OPTIONS } from "@/lib/tools-config";
import { downloadStoryboardPack } from "@/lib/export-pack";
import { useTranslation } from "@/i18n";

type EditableShot = Shot & { retries?: number; audioB64?: string };

function notifyQuota() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("avs:quota"));
  }
}

function friendlyApiError(status: number, msg: string): string {
  if (status === 401) return "请先登录后再使用";
  if (status === 402) return msg || "今日免费额度不足，请明日再试或查看「额度与退出」";
  if (status === 502 || /合成服务|compose|econnrefused/i.test(msg)) {
    return msg.includes("合成")
      ? msg
      : "合成服务暂时不可用。请确认 compose 容器已启动。";
  }
  return msg;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error;
    const raw =
      typeof err === "string"
        ? err
        : err?.message || (res.status === 401 ? "请先登录" : `HTTP ${res.status}`);
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new Error(friendlyApiError(res.status, raw));
  }
  notifyQuota();
  return data as T;
}

async function urlToBase64(url: string): Promise<string> {
  if (url.startsWith("data:")) {
    const i = url.indexOf(",");
    return i >= 0 ? url.slice(i + 1) : url;
  }
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

function aspectToPexelsOrientation(aspect: string): string {
  if (aspect === "9:16") return "portrait";
  if (aspect === "1:1") return "square";
  return "landscape";
}

/** 生图：失败或重试≥2 次后自动走 Pexels */
async function resolveShotImage(
  shot: EditableShot,
  aspect: string,
): Promise<{ url: string; source: "ai" | "pexels" }> {
  const retries = shot.retries ?? 0;
  if (retries >= 2) {
    const stock = await postJson<{ url: string }>("/api/ai/pexels", {
      query: shot.imagePrompt || shot.title || shot.content,
      orientation: aspectToPexelsOrientation(shot.ratio || aspect),
    });
    return { url: stock.url, source: "pexels" };
  }
  try {
    const data = await postJson<{ url: string }>("/api/ai/image", {
      prompt: shot.imagePrompt,
      aspect: shot.ratio || aspect,
    });
    return { url: data.url, source: "ai" };
  } catch (err) {
    if (retries >= 1) {
      try {
        const stock = await postJson<{ url: string }>("/api/ai/pexels", {
          query: shot.imagePrompt || shot.title || shot.content,
          orientation: aspectToPexelsOrientation(shot.ratio || aspect),
        });
        return { url: stock.url, source: "pexels" };
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

/* ── 脚本写作 ── */
export function ScriptWriterTool() {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("专业、亲切");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await postJson<{ script: string }>("/api/ai/script", { topic, tone });
      setResult(data.script);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolLayout title="AI 脚本写作" desc="输入主题和语气，生成短视频旁白脚本">
      <Field label="主题 / 方向">
        <Textarea
          rows={3}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="例：介绍 AI 工具如何帮助自媒体创作者提效"
        />
      </Field>
      <Field label="语气">
        <Select value={tone} onChange={(e) => setTone(e.target.value)}>
          <option value="专业、亲切">专业、亲切</option>
          <option value="轻松、幽默">轻松、幽默</option>
          <option value="严肃、权威">严肃、权威</option>
          <option value="激情、励志">激情、励志</option>
        </Select>
      </Field>
      <Btn variant="primary" onClick={run} disabled={loading || !topic.trim()}>
        {loading ? "生成中…" : "生成脚本"}
      </Btn>
      {error && <ErrorBox msg={error} />}
      {result && (
        <ResultBox title="脚本结果">
          <pre className="whitespace-pre-wrap text-[13px] leading-relaxed">{result}</pre>
        </ResultBox>
      )}
    </ToolLayout>
  );
}

/* ── 分镜生成（可编辑 / 重试 / 上传 / Pexels） ── */
export function StoryboardTool() {
  const [text, setText] = useState("");
  const [aspect, setAspect] = useState("9:16");
  const [shots, setShots] = useState<EditableShot[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await postJson<{ shots: Shot[] }>("/api/ai/storyboard", { text, aspect });
      setShots(data.shots.map((s) => ({ ...s, retries: 0 })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const updateShot = (idx: number, patch: Partial<EditableShot>) => {
    setShots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const regenImage = async (idx: number) => {
    const shot = shots[idx];
    if (!shot) return;
    setBusyIdx(idx);
    setError("");
    try {
      const nextRetries = (shot.retries ?? 0) + (shot.imageUrl ? 1 : 0);
      const { url } = await resolveShotImage({ ...shot, retries: nextRetries }, aspect);
      updateShot(idx, { imageUrl: url, retries: nextRetries });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyIdx(null);
    }
  };

  const pexelsFallback = async (idx: number) => {
    const shot = shots[idx];
    if (!shot) return;
    setBusyIdx(idx);
    setError("");
    try {
      const stock = await postJson<{ url: string }>("/api/ai/pexels", {
        query: shot.imagePrompt || shot.title || shot.content,
        orientation: aspectToPexelsOrientation(shot.ratio || aspect),
      });
      updateShot(idx, { imageUrl: stock.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyIdx(null);
    }
  };

  const uploadImage = async (idx: number, file: File) => {
    setError("");
    try {
      const dataUrl = await fileToDataUrl(file);
      updateShot(idx, { imageUrl: dataUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ToolLayout title="分镜生成" desc="生成分镜后可编辑旁白/字幕/提示词；图不好可重试、搜素材或上传">
      <Field label="文案">
        <Textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="粘贴旁白脚本或描述…"
        />
      </Field>
      <Field label="画面比例">
        <Select value={aspect} onChange={(e) => setAspect(e.target.value)}>
          <option value="9:16">9:16 竖版（推荐）</option>
          <option value="16:9">16:9 横版</option>
          <option value="1:1">1:1 方形</option>
        </Select>
      </Field>
      <Btn variant="primary" onClick={run} disabled={loading || !text.trim()}>
        {loading ? "生成中…" : "生成分镜"}
      </Btn>
      {error && <ErrorBox msg={error} />}
      {shots.length > 0 && (
        <div className="mt-4 space-y-3">
          {shots.map((shot, i) => (
            <ShotEditor
              key={i}
              index={i}
              shot={shot}
              busy={busyIdx === i}
              onChange={(patch) => updateShot(i, patch)}
              onRegen={() => regenImage(i)}
              onPexels={() => pexelsFallback(i)}
              onUpload={(file) => uploadImage(i, file)}
            />
          ))}
        </div>
      )}
    </ToolLayout>
  );
}

function ShotEditor({
  index,
  shot,
  busy,
  onChange,
  onRegen,
  onPexels,
  onUpload,
}: {
  index: number;
  shot: EditableShot;
  busy: boolean;
  onChange: (patch: Partial<EditableShot>) => void;
  onRegen: () => void;
  onPexels: () => void;
  onUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardHead
        title={`镜头 ${index + 1}`}
        right={
          <div className="flex flex-wrap gap-1.5">
            <Btn size="sm" onClick={onRegen} disabled={busy}>
              {busy ? "处理中…" : shot.imageUrl ? "重试生图" : "生成图片"}
            </Btn>
            <Btn size="sm" onClick={onPexels} disabled={busy}>
              素材兜底
            </Btn>
            <Btn size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              上传
            </Btn>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
          </div>
        }
      />
      <div className="space-y-2">
        <Field label="标题">
          <Input value={shot.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field label="旁白">
          <Textarea rows={2} value={shot.content} onChange={(e) => onChange({ content: e.target.value })} />
        </Field>
        <Field label="字幕">
          <Input value={shot.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} />
        </Field>
        <Field label="生图提示词">
          <Textarea
            rows={2}
            value={shot.imagePrompt}
            onChange={(e) => onChange({ imagePrompt: e.target.value })}
          />
        </Field>
        {shot.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shot.imageUrl}
            alt={shot.title}
            className="mt-1 max-h-48 rounded border border-border object-contain"
          />
        )}
      </div>
    </Card>
  );
}

/* ── AI 配音 ── */
export function VoiceoverTool() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("alex");
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    setAudioUrl("");
    try {
      const data = await postJson<{ audio: string }>("/api/ai/tts", { text, voice });
      setAudioUrl(`data:audio/mp3;base64,${data.audio}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolLayout title="AI 配音" desc="文字转语音，CosyVoice 多音色">
      <Field label="文本">
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="输入要配音的文字…" />
      </Field>
      <Field label="音色">
        <Select value={voice} onChange={(e) => setVoice(e.target.value)}>
          {VOICE_OPTIONS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </Select>
      </Field>
      <Btn variant="primary" onClick={run} disabled={loading || !text.trim()}>
        {loading ? "生成中…" : "生成配音"}
      </Btn>
      {error && <ErrorBox msg={error} />}
      {audioUrl && (
        <ResultBox title="配音结果">
          <audio controls src={audioUrl} className="w-full" />
        </ResultBox>
      )}
    </ToolLayout>
  );
}

/* ── 字幕生成 ── */
export function SubtitleTool() {
  const [text, setText] = useState("");
  const [srt, setSrt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const lines = text.split("\n").filter((l) => l.trim());
      const data = await postJson<{ srt: string }>("/api/ai/subtitles", { lines });
      setSrt(data.srt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolLayout title="字幕生成" desc="按行输入文本，生成 SRT 字幕">
      <Field label="字幕文本（每行一条）">
        <Textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"第一句字幕\n第二句字幕\n…"}
        />
      </Field>
      <Btn variant="primary" onClick={run} disabled={loading || !text.trim()}>
        {loading ? "生成中…" : "生成字幕"}
      </Btn>
      {error && <ErrorBox msg={error} />}
      {srt && (
        <ResultBox title="SRT 结果">
          <pre className="whitespace-pre-wrap font-mono text-[12px]">{srt}</pre>
          <Btn
            size="sm"
            className="mt-2"
            onClick={() => {
              const blob = new Blob([srt], { type: "application/x-subrip" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "subtitles.srt";
              a.click();
            }}
          >
            下载 SRT
          </Btn>
        </ResultBox>
      )}
    </ToolLayout>
  );
}

/* ── 生图 ── */
export function ImageTool() {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("9:16");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    setUrl("");
    try {
      const data = await postJson<{ url: string }>("/api/ai/image", { prompt, aspect });
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolLayout title="AI 生图" desc="输入提示词生成配图">
      <Field label="提示词">
        <Textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="cinematic medium shot, warm lighting, 35mm…"
        />
      </Field>
      <Field label="比例">
        <Select value={aspect} onChange={(e) => setAspect(e.target.value)}>
          <option value="9:16">9:16 竖版</option>
          <option value="16:9">16:9 横版</option>
          <option value="1:1">1:1</option>
        </Select>
      </Field>
      <Btn variant="primary" onClick={run} disabled={loading || !prompt.trim()}>
        {loading ? "生成中…" : "生成图片"}
      </Btn>
      {error && <ErrorBox msg={error} />}
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="generated" className="mt-4 max-w-full rounded border border-border" />
      )}
    </ToolLayout>
  );
}

/* ── 一键出片：写文案 → 审分镜 → 合成 ── */
type SourceMode = "direct" | "rewrite" | "create";
type Stage = "input" | "review" | "done";

export function MakeVideoTool() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<SourceMode>("direct");
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [aspect, setAspect] = useState("9:16");
  const [voice, setVoice] = useState("alex");
  const [stage, setStage] = useState<Stage>("input");
  const [shots, setShots] = useState<EditableShot[]>([]);
  const [step, setStep] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [error, setError] = useState("");
  const videoUrlRef = useRef("");

  useEffect(() => {
    return () => {
      if (videoUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(videoUrlRef.current);
      }
    };
  }, []);

  const setBlobVideo = (url: string) => {
    if (videoUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(videoUrlRef.current);
    }
    videoUrlRef.current = url;
    setVideoUrl(url);
  };

  const prepareScript = async (): Promise<string> => {
    if (mode === "direct") {
      if (!text.trim()) throw new Error(t("station.make.phScript"));
      return text.trim();
    }
    if (mode === "create") {
      if (!topic.trim()) throw new Error(t("station.make.phTopic"));
      setStep(t("station.make.stepScript"));
      const data = await postJson<{ script: string }>("/api/ai/script", {
        topic,
        tone: "专业、亲切",
      });
      return data.script;
    }
    // rewrite：用文案做二创脚本
    if (!text.trim()) throw new Error(t("station.make.phRef"));
    setStep(t("station.make.stepRewrite"));
    const data = await postJson<{ script: string }>("/api/ai/script", {
      topic: `基于以下素材改写成短视频旁白脚本：\n${text}`,
      tone: "专业、亲切",
    });
    return data.script;
  };

  const generateStoryboard = async () => {
    setLoading(true);
    setError("");
    setVideoUrl("");
    try {
      const script = await prepareScript();
      setText(script);
      setStep(t("station.make.stepBoard"));
      const sb = await postJson<{ shots: Shot[] }>("/api/ai/storyboard", {
        text: script,
        aspect,
      });
      const withImages: EditableShot[] = [];
      for (let i = 0; i < sb.shots.length; i++) {
        const shot = { ...sb.shots[i]!, retries: 0 };
        setStep(t("station.make.stepImage", { i: i + 1, n: sb.shots.length }));
        try {
          const { url } = await resolveShotImage(shot, aspect);
          withImages.push({ ...shot, imageUrl: url });
        } catch {
          withImages.push(shot);
        }
      }
      setShots(withImages);
      setStage("review");
      setStep("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("");
    } finally {
      setLoading(false);
    }
  };

  const updateShot = (idx: number, patch: Partial<EditableShot>) => {
    setShots((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const next = { ...s, ...patch };
        // 旁白改了旧配音作废
        if (patch.content !== undefined && patch.content !== s.content) {
          next.audioB64 = undefined;
        }
        return next;
      }),
    );
  };

  const regenImage = async (idx: number) => {
    const shot = shots[idx];
    if (!shot) return;
    setBusyIdx(idx);
    setError("");
    try {
      const nextRetries = (shot.retries ?? 0) + 1;
      const { url } = await resolveShotImage({ ...shot, retries: nextRetries }, aspect);
      updateShot(idx, { imageUrl: url, retries: nextRetries });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyIdx(null);
    }
  };

  /** 确保每镜有图+配音，返回带 audioB64 的镜头列表 */
  const ensureShotAssets = async (
    list: EditableShot[],
  ): Promise<EditableShot[]> => {
    const missingImg = list.findIndex((s) => !s.imageUrl);
    if (missingImg >= 0) {
      throw new Error(t("station.make.needImage", { n: missingImg + 1 }));
    }
    const next = [...list];
    for (let i = 0; i < next.length; i++) {
      const shot = next[i]!;
      if (shot.audioB64) continue;
      setStep(t("station.make.stepVoice", { i: i + 1, n: next.length }));
      const tts = await postJson<{ audio: string }>("/api/ai/tts", {
        text: shot.content,
        voice,
      });
      next[i] = { ...shot, audioB64: tts.audio };
    }
    setShots(next);
    return next;
  };

  const exportPack = async () => {
    setLoading(true);
    setError("");
    try {
      const ready = await ensureShotAssets(shots);
      setStep(t("station.make.stepPack"));
      await downloadStoryboardPack({
        shots: ready.map((s) => ({
          title: s.title,
          content: s.content,
          subtitle: s.subtitle,
          imagePrompt: s.imagePrompt,
          ratio: s.ratio || aspect,
          imageUrl: s.imageUrl!,
          audioB64: s.audioB64,
        })),
        aspect,
        voice,
        script: text,
        onProgress: setStep,
      });
      setStep("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("");
    } finally {
      setLoading(false);
    }
  };

  const compose = async () => {
    setLoading(true);
    setError("");
    try {
      const ready = await ensureShotAssets(shots);
      const composeShots: Array<{ image: string; audio: string; subtitle: string }> = [];
      for (let i = 0; i < ready.length; i++) {
        const shot = ready[i]!;
        setStep(t("station.make.stepAssets", { i: i + 1, n: ready.length }));
        const imgB64 = await urlToBase64(shot.imageUrl!);
        composeShots.push({
          image: imgB64,
          audio: shot.audioB64!,
          subtitle: shot.subtitle || shot.content,
        });
      }
      setStep(t("station.make.stepFfmpeg"));
      const res = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ shots: composeShots }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = data?.error;
        const raw =
          typeof err === "string" ? err : err?.message || `合成失败 (${res.status})`;
        throw new Error(friendlyApiError(res.status, raw));
      }
      const ctype = res.headers.get("content-type") || "";
      if (ctype.includes("application/json")) {
        const data = (await res.json()) as { video?: string };
        if (!data.video) throw new Error("合成结果为空");
        setBlobVideo(`data:video/mp4;base64,${data.video}`);
      } else {
        const blob = await res.blob();
        setBlobVideo(URL.createObjectURL(blob));
      }
      notifyQuota();
      setStage("done");
      setStep("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolLayout title={t("station.make.title")} desc={t("station.make.desc")}>
      {stage === "input" && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["direct", "station.make.modeDirect"],
                ["rewrite", "station.make.modeRewrite"],
                ["create", "station.make.modeCreate"],
              ] as const
            ).map(([k, labelKey]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMode(k)}
                className={`rounded border px-3 py-1 text-[12px] ${
                  mode === k
                    ? "border-brand bg-brand-subtle text-brand"
                    : "border-border text-text-secondary"
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          {mode === "create" ? (
            <Field label={t("station.make.labelTopic")}>
              <Textarea
                rows={3}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t("station.make.phTopic")}
              />
            </Field>
          ) : (
            <Field label={mode === "rewrite" ? t("station.make.labelRef") : t("station.make.labelScript")}>
              <Textarea
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={mode === "rewrite" ? t("station.make.phRef") : t("station.make.phScript")}
              />
            </Field>
          )}
          <Field label={t("station.make.aspect")}>
            <Select value={aspect} onChange={(e) => setAspect(e.target.value)}>
              <option value="9:16">{t("station.make.aspect916")}</option>
              <option value="16:9">{t("station.make.aspect169")}</option>
              <option value="1:1">{t("station.make.aspect11")}</option>
            </Select>
          </Field>
          <Field label={t("station.make.voice")}>
            <Select value={voice} onChange={(e) => setVoice(e.target.value)}>
              {VOICE_OPTIONS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
          <Btn
            variant="primary"
            onClick={generateStoryboard}
            disabled={loading || (mode === "create" ? !topic.trim() : !text.trim())}
          >
            {loading ? step || t("station.make.processing") : t("station.make.genBoard")}
          </Btn>
        </>
      )}

      {stage === "review" && (
        <>
          <p className="text-[12px] text-text-secondary">{t("station.make.reviewHint")}</p>
          <div className="space-y-3">
            {shots.map((shot, i) => (
              <ShotEditor
                key={i}
                index={i}
                shot={shot}
                busy={busyIdx === i}
                onChange={(patch) => updateShot(i, patch)}
                onRegen={() => regenImage(i)}
                onPexels={async () => {
                  setBusyIdx(i);
                  try {
                    const stock = await postJson<{ url: string }>("/api/ai/pexels", {
                      query: shot.imagePrompt || shot.title,
                      orientation: aspectToPexelsOrientation(shot.ratio || aspect),
                    });
                    updateShot(i, { imageUrl: stock.url });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusyIdx(null);
                  }
                }}
                onUpload={async (file) => {
                  try {
                    updateShot(i, { imageUrl: await fileToDataUrl(file) });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Btn
              onClick={() => {
                setStage("input");
                setShots([]);
              }}
              disabled={loading}
            >
              {t("station.make.backScript")}
            </Btn>
            <Btn onClick={exportPack} disabled={loading}>
              {loading ? step || t("station.make.packing") : t("station.make.pack")}
            </Btn>
            <Btn variant="primary" onClick={compose} disabled={loading}>
              {loading ? step || t("station.make.composing") : t("station.make.compose")}
            </Btn>
          </div>
          <p className="text-[11px] text-text-tertiary">{t("station.make.packHint")}</p>
        </>
      )}

      {stage === "done" && videoUrl && (
        <ResultBox title={t("station.make.result")}>
          <video controls src={videoUrl} className="w-full max-w-lg rounded" />
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className="inline-flex items-center rounded border border-border px-3 py-1.5 text-[12px] font-medium"
              href={videoUrl}
              download="avs-output.mp4"
            >
              {t("station.make.dlMp4")}
            </a>
            <Btn onClick={exportPack} disabled={loading}>
              {loading ? step || t("station.make.packing") : t("station.make.pack")}
            </Btn>
            <Btn
              onClick={() => {
                setStage("input");
                setShots([]);
                setBlobVideo("");
              }}
              disabled={loading}
            >
              {t("station.make.again")}
            </Btn>
          </div>
          <p className="mt-2 text-[11px] text-text-tertiary">{t("station.make.doneHint")}</p>
        </ResultBox>
      )}

      {loading && step && stage === "input" && (
        <p className="text-[12px] text-text-secondary">{step}</p>
      )}
      {error && <ErrorBox msg={error} />}
    </ToolLayout>
  );
}

/* ── 共享 UI ── */
function ToolLayout({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-2 font-mono text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--app-brand)]">
        tool
      </p>
      <h1 className="text-[clamp(1.75rem,3vw,2.25rem)] font-normal leading-tight tracking-[-0.03em] lowercase text-text-primary [font-family:var(--font-instrument),Georgia,serif]">
        {title}
      </h1>
      <p className="mt-2 mb-6 text-[13.5px] leading-relaxed text-text-secondary">{desc}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="mt-3 rounded border border-error/30 bg-error-bg px-3 py-2 text-[12px] text-error">
      {msg}
    </div>
  );
}

function ResultBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mt-4">
      <CardHead title={title} />
      {children}
    </Card>
  );
}

export const TOOL_COMPONENTS: Record<string, React.ComponentType> = {
  "ai-video-script-writer": ScriptWriterTool,
  "storyboard-generator": StoryboardTool,
  "ai-voiceover": VoiceoverTool,
  "subtitle-generator": SubtitleTool,
  "image-generator": ImageTool,
  "script-to-video": MakeVideoTool,
};
