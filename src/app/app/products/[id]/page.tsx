"use client";

// PIPELINE_TASK_12 — 商品详情 (/app/products/:id).
//
// Mirrors product-detail.html: left column = 基础信息 + 商品解析 (detail_text,
// inline edit → PUT), right column = 解析结果 (bullets derived from detail_text)
// + 关联视频任务 (GET /api/tasks, filtered by config.product_id — the list
// endpoint now returns config, so the filter works).
//
// NOTE: there is no GET /api/products/:id route yet, so the product is located
// by fetching the full list and matching the id.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Badge,
  Btn,
  Card,
  CardHead,
  EmptyState,
  Textarea,
} from "@/components/app/proto";
import { apiFetch } from "@/lib/api-client";
import { useTranslation } from "@/i18n";

type Product = {
  id: string;
  name: string;
  category: string | null;
  topic?: string | null;
  price: string | null;
  commission_rate: string | null;
  product_url: string | null;
  detail_text: string | null;
  visibility: "all" | "private" | "me";
  status: "active" | "inactive";
  gen_count: number;
  created_at: string;
  updated_at?: string | null;
};

type TaskRow = {
  id: string;
  status: string;
  current_step: number;
  progress: number;
  created_at: string;
  config?: { product_id?: string } | null;
};

const RESULT_SECTIONS = [
  { key: "scriptSummary", label: "productDetail.scriptSummary" },
  { key: "coreSelling", label: "productDetail.coreSelling" },
  { key: "targetAudience", label: "productDetail.targetAudience" },
  { key: "painScenes", label: "productDetail.painScenes" },
  { key: "useScenes", label: "productDetail.useScenes" },
  { key: "contentAngle", label: "productDetail.contentAngle" },
  { key: "riskWords", label: "productDetail.riskWords" },
  { key: "avoidPhrases", label: "productDetail.avoidPhrases" },
] as const;

const VISIBILITY_LABEL: Record<Product["visibility"], string> = {
  all: "productNew.visibilityPublic",
  private: "productNew.visibilityPrivate",
  me: "productNew.visibilityMe",
};

function deriveBullets(detailText: string | null): string[] {
  if (!detailText) return [];
  return detailText
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
    .filter((l) => l.length > 0);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function fmtPrice(price: string | number | null): string {
  if (price == null) return "—";
  const n = Number(price);
  if (!Number.isFinite(n)) return "—";
  return `$${n % 1 === 0 ? String(n) : n.toFixed(2)}`;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <span className="w-24 shrink-0 text-[13px] font-medium text-text-tertiary">{label}</span>
      <span className="min-w-0 flex-1 break-words text-sm text-text-primary">{children}</span>
    </div>
  );
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { t } = useTranslation();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 关联视频任务 (best-effort — the tasks list API omits config).
  const [relatedTasks, setRelatedTasks] = useState<TaskRow[]>([]);

  // 商品解析 detail_text inline edit.
  const [editingDetail, setEditingDetail] = useState(false);
  const [detailDraft, setDetailDraft] = useState("");
  const [savingDetail, setSavingDetail] = useState(false);

  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const data = await apiFetch<{ items: Product[] }>("/api/products", {
        cache: "no-store",
      });
      const found = data.items.find((p) => p.id === id) ?? null;
      if (!found) {
        setNotFound(true);
      } else {
        setProduct(found);
        setDetailDraft(found.detail_text ?? "");
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: TaskRow[] }>("/api/tasks", { cache: "no-store" })
      .then((d) => {
        if (cancelled) return;
        setRelatedTasks(d.items.filter((task) => task.config?.product_id === id));
      })
      .catch(() => {
        if (!cancelled) setRelatedTasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const bullets = useMemo(() => deriveBullets(product?.detail_text ?? null), [product]);

  const saveDetail = async () => {
    if (!product || savingDetail) return;
    setSavingDetail(true);
    setMsg(null);
    try {
      const updated = await apiFetch<Product>(
        `/api/products?id=${encodeURIComponent(product.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ detail_text: detailDraft.trim() || null }),
        },
      );
      setProduct(updated);
      setDetailDraft(updated.detail_text ?? "");
      setEditingDetail(false);
      setMsg({ kind: "success", text: t("common.saved") });
    } catch {
      setMsg({ kind: "error", text: t("app.saveFailed") });
    } finally {
      setSavingDetail(false);
    }
  };

  // NOTE: 商品「重新解析」未在 03-接口文档 §5.2 定义（PUT 无 regenerate 字段，
  // gen_count 仅在任务引用商品时 +1），故不提供该按钮，避免调用未文档化行为。

  if (loading) {
    return <div className="py-16 text-center text-sm text-text-secondary">{t("common.loading")}</div>;
  }

  if (notFound || !product) {
    return (
      <div className="mx-auto w-full">
        <EmptyState symbol="▤" title={t("productDetail.notFound")} desc={t("productDetail.notFoundDesc")} />
      </div>
    );
  }

  const statusBadge =
    product.status === "active" ? (
      <Badge variant="green" dot>
        {t("products.statusActive")}
      </Badge>
    ) : (
      <Badge variant="gray" dot>
        {t("products.statusInactive")}
      </Badge>
    );

  return (
    <div className="mx-auto w-full">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Btn variant="default" size="sm" href="/app/products">
            {t("productDetail.back")}
          </Btn>
          <h1 className="truncate text-[17px] font-semibold text-text-primary">{product.name}</h1>
          {statusBadge}
        </div>
        <Btn variant="primary" href={`/app/tasks/new?product=${product.id}`}>
          {t("productDetail.newTaskFromProduct")}
        </Btn>
      </div>

      {msg ? (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            msg.kind === "error"
              ? "border-error/30 bg-error-bg text-error"
              : "border-success/30 bg-success-bg text-success"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Left column ── */}
        <div className="min-w-0 space-y-4">
          {/* 基础信息 */}
          <Card>
            <CardHead
              title={t("productDetail.baseInfo")}
              sub={t("productDetail.baseInfoSub")}
            />
            <InfoRow label={t("productNew.nameLabel")}>{product.name}</InfoRow>
            <InfoRow label={t("products.colCategory")}>{product.category ?? "—"}</InfoRow>
            <InfoRow label={t("productNew.topicLabel")}>{product.topic ?? "—"}</InfoRow>
            <InfoRow label={t("products.colPrice")}>{fmtPrice(product.price)}</InfoRow>
            <InfoRow label={t("products.colCommission")}>
              {product.commission_rate == null ? "—" : `${product.commission_rate}%`}
            </InfoRow>
            <InfoRow label={t("productNew.urlLabel")}>
              {product.product_url ? (
                <a
                  href={product.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline underline-offset-2"
                >
                  {product.product_url}
                </a>
              ) : (
                "—"
              )}
            </InfoRow>
            <InfoRow label={t("productNew.visibilityLabel")}>
              {t(VISIBILITY_LABEL[product.visibility])}
            </InfoRow>
            <InfoRow label={t("products.colStatus")}>{statusBadge}</InfoRow>
            <InfoRow label={t("products.colGenCount")}>{product.gen_count ?? 0}</InfoRow>
            <InfoRow label={t("tasks.colCreated")}>{fmtDate(product.created_at)}</InfoRow>
          </Card>

          {/* 商品解析 */}
          <Card>
            <CardHead
              title={t("productDetail.productAnalysis")}
              sub={t("productDetail.productAnalysisSub")}
              right={
                editingDetail ? null : (
                  <Btn size="sm" variant="default" onClick={() => setEditingDetail(true)}>
                    {t("common.edit")}
                  </Btn>
                )
              }
            />
            {editingDetail ? (
              <>
                <Textarea
                  value={detailDraft}
                  onChange={(e) => setDetailDraft(e.target.value)}
                  style={{ minHeight: 120 }}
                  placeholder={t("productNew.detailPlaceholder")}
                />
                <div className="mt-3 flex justify-end gap-2.5">
                  <Btn size="sm" variant="default" onClick={() => setEditingDetail(false)} disabled={savingDetail}>
                    {t("productNew.cancel")}
                  </Btn>
                  <Btn size="sm" variant="primary" onClick={() => void saveDetail()} disabled={savingDetail}>
                    {savingDetail ? t("common.saving") : t("common.save")}
                  </Btn>
                </div>
              </>
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-text-secondary">
                {product.detail_text ?? "—"}
              </pre>
            )}
          </Card>
        </div>

        {/* ── Right column ── */}
        <div className="min-w-0 space-y-4">
          {/* 解析结果 */}
          <Card>
            <CardHead
              title={t("productDetail.analysisResult")}
              sub={t("productDetail.analysisResultSub")}
              right={<Badge variant="green">{t("productDetail.parsed")}</Badge>}
            />
            <div className="space-y-3.5">
              {RESULT_SECTIONS.map((section, i) => {
                const items = bullets.slice(i * 2, i * 2 + 2);
                return (
                  <div key={section.key}>
                    <div className="mb-1 text-[13px] font-semibold text-text-secondary">
                      {t(`productDetail.${section.key}`)}
                    </div>
                    {items.length > 0 ? (
                      <ul className="list-inside list-disc space-y-0.5 text-[13px] text-text-primary">
                        {items.map((item, j) => (
                          <li key={j}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[13px] text-text-tertiary">—</div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 关联视频任务 */}
          <Card>
            <CardHead
              title={t("productDetail.relatedTasks")}
              right={
                <Btn size="sm" href={`/app/tasks/new?product=${product.id}`}>
                  + {t("productDetail.newTaskFromProduct")}
                </Btn>
              }
            />
            {relatedTasks.length > 0 ? (
              <ul className="space-y-2">
                {relatedTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                  >
                    <span className="truncate text-sm text-text-primary">
                      {task.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-text-secondary">{task.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState symbol="▷" title={t("productDetail.noRelated")} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
