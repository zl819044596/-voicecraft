"use client";

// PIPELINE_TASK_12 — 素材库 (/app/assets), rebuilt from the static prototype
// assets.html.
//
//  • 缩略图：16:9 深底 1px 线稿 SVG 框 + 类型 tag（IMG/AUDIO/VIDEO）+ 状态圆点
//    （image=dot-ok / audio=dot-run / video=dot-skip，与原型逐卡一致）。
//  • 筛选：下划线文字 tab + 计数（全部 All / image / audio / video）。
//  • 上传入口在顶栏（/app/assets#upload 锚点）+ 页面内上传卡（保留，便于直连
//    URL 录入，报告说明）。
//  • 底部汇总行：共 N 个素材 · 已用 X GB（真实统计 assets 列表 size 总和）+
//    引用说明 note（quick / L4 生图 / L6 配音可引用）。
//  • cell-sub 时间格式「大小 · 日期 上传」；删除按钮 / 预览弹窗保留（合理增强）。

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { useTranslation } from "@/i18n";
import {
  Btn,
  Card,
  CardHead,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from "@/components/app/proto";

type AssetType = "image" | "audio" | "video";
type Asset = {
  id: string;
  type: AssetType;
  name: string;
  url: string | null;
  size: number | null;
  meta: Record<string, unknown>;
  created_at: string;
};

type FilterKey = "all" | AssetType;

const TYPE_LABEL_KEY: Record<AssetType, string> = {
  image: "assets.typeImage",
  audio: "assets.typeAudio",
  video: "assets.typeVideo",
};

const TYPE_TAG: Record<AssetType, string> = {
  image: "IMG",
  audio: "AUDIO",
  video: "VIDEO",
};

// 原型逐卡状态圆点：image=ok(绿) / audio=run(琥珀) / video=skip(灰)。
const DOT_CLASS: Record<AssetType, string> = {
  image: "dot-ok",
  audio: "dot-run",
  video: "dot-skip",
};

// 16:9 线稿 SVG 描边（stroke #98938a 1px，无填充），每种类型 2 个变体按序轮换。
const LINE_ART: Record<AssetType, Array<ReactNode>> = {
  image: [
    <g key="im1">
      <rect x="52" y="20" width="56" height="52" rx="3" />
      <path d="M60 64l14-16 10 10 8-8 8 14" />
      <circle cx="68" cy="32" r="4" />
    </g>,
    <g key="im2">
      <rect x="40" y="34" width="80" height="34" rx="4" />
      <path d="M56 34v-8a24 10 0 0 1 48 0v8" />
      <path d="M52 46h56M52 56h40" />
    </g>,
  ],
  audio: [
    <g key="au1">
      <path d="M30 45h6v14h-6zM44 38h6v28h-6zM58 30h6v42h-6zM72 42h6v18h-6zM86 26h6v52h-6zM100 36h6v32h-6zM114 44h6v16h-6zM128 40h6v24h-6z" />
    </g>,
    <g key="au2">
      <path d="M40 45c8-16 16-16 24 0s16 16 24 0 16-16 24 0" />
      <path d="M40 62h80" />
    </g>,
  ],
  video: [
    <g key="vd1">
      <rect x="44" y="26" width="72" height="40" rx="4" />
      <path d="M74 36l18 10-18 10z" />
    </g>,
    <g key="vd2">
      <circle cx="80" cy="46" r="22" />
      <path d="M73 38l20 8-20 8z" />
    </g>,
  ],
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatSize(bytes: number | null): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const URL_RE = /^https?:\/\//i;

export default function AssetsPage() {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  // Upload form.
  const [assetType, setAssetType] = useState<AssetType>("image");
  const [assetName, setAssetName] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Preview / delete.
  const [preview, setPreview] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: Asset[] }>("/api/assets", {
        cache: "no-store",
      });
      setAssets(data.items);
      setLoadError(null);
    } catch {
      setAssets([]);
      setLoadError(t("app.loadProjectsError"));
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return;
    const name = assetName.trim();
    const url = assetUrl.trim();
    if (!name) {
      setUploadMsg({ ok: false, text: t("assets.nameRequired") });
      return;
    }
    if (!URL_RE.test(url)) {
      setUploadMsg({ ok: false, text: t("assets.urlRequired") });
      return;
    }
    setUploading(true);
    setUploadMsg(null);
    try {
      await apiFetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: assetType, name, url }),
      });
      setAssetName("");
      setAssetUrl("");
      setUploadMsg({ ok: true, text: t("assets.uploadOk") });
      await refresh();
    } catch (err) {
      setUploadMsg({
        ok: false,
        text: t("assets.uploadFail", { msg: err instanceof Error ? err.message : "error" }),
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAsset = async (a: Asset) => {
    if (deleting) return;
    if (!window.confirm(t("assets.deleteConfirm", { name: a.name }))) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/assets?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
      if (preview?.id === a.id) setPreview(null);
      await refresh();
    } catch (err) {
      setUploadMsg({
        ok: false,
        text: t("assets.deleteFail", { msg: err instanceof Error ? err.message : "error" }),
      });
    } finally {
      setDeleting(false);
    }
  };

  const counts = useMemo(() => {
    const list = assets ?? [];
    return {
      all: list.length,
      image: list.filter((a) => a.type === "image").length,
      audio: list.filter((a) => a.type === "audio").length,
      video: list.filter((a) => a.type === "video").length,
    };
  }, [assets]);

  const visible = useMemo(() => {
    const list = assets ?? [];
    return filter === "all" ? list : list.filter((a) => a.type === filter);
  }, [assets, filter]);

  // 底部汇总：真实统计素材 size 总和。
  const totalBytes = useMemo(
    () => (assets ?? []).reduce((sum, a) => sum + (a.size ?? 0), 0),
    [assets],
  );

  const filterTabs: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: "all", label: t("assets.filterAll"), count: counts.all },
    { key: "image", label: t("assets.filterImage"), count: counts.image },
    { key: "audio", label: t("assets.filterAudio"), count: counts.audio },
    { key: "video", label: t("assets.filterVideo"), count: counts.video },
  ];

  const labelClass = "mb-1.5 block text-xs font-medium text-text-secondary";

  return (
    <div className="mx-auto w-full" id="upload">
      <PageHeader title={t("assets.pageTitle")} subtitle={t("assets.pageSub")} />

      {loadError ? (
        <div className="mb-6 rounded-lg border border-error/30 bg-error-bg px-4 py-3 text-sm text-error">
          {loadError}
        </div>
      ) : null}

      {/* ── 上传卡（保留：直连 URL 录入入口；顶栏另有入口锚点） ── */}
      <Card className="mb-6">
        <CardHead title={t("assets.uploadTitle")} />
        <form onSubmit={handleUpload} className="mt-3 grid gap-4 sm:grid-cols-[140px_1fr_1fr_auto]">
          <div>
            <label className={labelClass}>{t("assets.uploadTypeLabel")}</label>
            <Select value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
              {(["image", "audio", "video"] as AssetType[]).map((tp) => (
                <option key={tp} value={tp}>
                  {t(TYPE_LABEL_KEY[tp])}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className={labelClass}>{t("assets.uploadNameLabel")}</label>
            <Input
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              placeholder={t("assets.uploadNamePlaceholder")}
              maxLength={120}
            />
          </div>
          <div>
            <label className={labelClass}>{t("assets.uploadUrlLabel")}</label>
            <Input
              value={assetUrl}
              onChange={(e) => setAssetUrl(e.target.value)}
              placeholder={t("assets.uploadUrlPlaceholder")}
              spellCheck={false}
            />
          </div>
          <div className="flex items-end">
            <Btn type="submit" variant="primary" disabled={uploading}>
              {uploading ? t("common.saving") : t("assets.uploadBtn")}
            </Btn>
          </div>
        </form>
        {uploadMsg ? (
          <p className={`mt-2 text-xs ${uploadMsg.ok ? "text-success" : "text-error"}`}>
            {uploadMsg.text}
          </p>
        ) : null}
      </Card>

      {/* ── 类型筛选：下划线 tab + 计数 ── */}
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 px-0.5 pb-2 text-[12px] transition ${
              filter === tab.key
                ? "border-brand font-semibold text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
            <span className="ml-1 text-[11px] text-text-tertiary">{tab.count}</span>
          </button>
        ))}
        <span className="flex-1" />
        <span className="pb-2 text-[11px] text-text-tertiary">{t("assets.filterHint")}</span>
      </div>

      {assets === null ? (
        <div className="rounded-xl border border-border bg-bg-subtle px-4 py-10 text-center text-sm text-text-secondary">
          {t("common.loading")}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState symbol="□" title={t("assets.noAssets")} />
        </Card>
      ) : (
        /* ── 素材网格：16:9 深底 1px 线稿缩略框（原型 .shot-grid） ── */
        <div
          className="shot-grid"
          style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}
        >
          {visible.map((a, i) => {
            const variants = LINE_ART[a.type];
            return (
              <div
                key={a.id}
                className="shot clickable"
                onClick={() => setPreview(a)}
                title={a.name}
              >
                <span className="frame">
                  <svg
                    viewBox="0 0 160 90"
                    fill="none"
                    stroke="#98938a"
                    strokeWidth={1}
                    aria-hidden
                  >
                    {variants[i % variants.length]}
                  </svg>
                  <span className="tag">{TYPE_TAG[a.type]}</span>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteAsset(a);
                    }}
                    aria-label={t("common.delete")}
                    title={t("common.delete")}
                    className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded border border-border bg-black/40 text-[10px] leading-none text-white/70 transition hover:border-error hover:text-error disabled:opacity-40"
                  >
                    ×
                  </button>
                </span>
                <div className="cap">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`dot ${DOT_CLASS[a.type]}`} />
                    <span className="nm truncate">{a.name}</span>
                  </div>
                  <span className="cell-sub">
                    {t("assets.cellSub", {
                      size: formatSize(a.size),
                      date: formatDate(a.created_at),
                    })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 底部汇总行 + 引用说明 ── */}
      <div className="row mt-4" style={{ marginTop: 16 }}>
        <span className="small faint">
          {t("assets.summary", { count: counts.all, size: formatSize(totalBytes) })}
        </span>
        <span className="spacer" />
        <span className="note">{t("assets.summaryNote")}</span>
      </div>

      {/* ── 预览弹窗 ── */}
      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-bg-subtle p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="min-w-0 truncate text-sm font-semibold text-text-primary">
                {preview.name}
              </h3>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="shrink-0 rounded border border-border px-3 py-1 text-xs text-text-secondary transition hover:border-error/40 hover:text-error"
              >
                {t("common.close")}
              </button>
            </div>
            <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-lg bg-black/40">
              {preview.url ? (
                preview.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.url}
                    alt={preview.name}
                    className="max-h-[70vh] max-w-full object-contain"
                  />
                ) : preview.type === "video" ? (
                  <video src={preview.url} controls className="max-h-[70vh] max-w-full" />
                ) : (
                  <audio src={preview.url} controls className="w-full px-4 py-6" />
                )
              ) : (
                <p className="px-6 py-10 text-sm text-text-tertiary">{t("assets.noPreview")}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
