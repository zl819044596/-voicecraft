"use client";

// PIPELINE_TASK_12 — 新建/编辑对标 (/app/benchmarks/new).
//
// Mirrors benchmark-new.html: account / title / video_url / source_text /
// 关联商品 (select of products) / visibility pills, then 取消 (back) + primary
// 保存对标 (POST → /app/benchmarks).
//
// Also supports edit mode: /app/benchmarks/new?edit=<id> loads the benchmark
// via GET /api/benchmarks (list match, there is no GET /:id) and saves with
// PUT /api/benchmarks?id=.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, CardHead, Field, Input, PageHeader, Select, Textarea } from "@/components/app/proto";
import { apiFetch } from "@/lib/api-client";
import { useTranslation } from "@/i18n";

const VISIBILITY_OPTIONS = [
  { value: "all", labelKey: "productNew.visibilityPublic" },
  { value: "private", labelKey: "productNew.visibilityPrivate" },
  { value: "me", labelKey: "productNew.visibilityMe" },
] as const;

type Product = {
  id: string;
  name: string;
};

type Benchmark = {
  id: string;
  account: string;
  title: string;
  video_url: string | null;
  source_text: string | null;
  product_id: string | null;
  duration: number | null;
  visibility: "all" | "private" | "me";
};

function editIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("edit");
}

export default function BenchmarkNewPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const editId = editIdFromLocation();

  const [account, setAccount] = useState("");
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [productId, setProductId] = useState("");
  const [duration, setDuration] = useState("");
  const [visibility, setVisibility] = useState<"all" | "private" | "me">("me");

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: Product[] }>("/api/products", { cache: "no-store" })
      .then((d) => {
        if (!cancelled) setProducts(d?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Edit mode: load the existing benchmark by matching the id in the full list.
  const loadExisting = useCallback(async () => {
    if (!editId) return;
    setLoading(true);
    setMsg(null);
    try {
      const d = await apiFetch<{ items: Benchmark[] }>("/api/benchmarks", {
        cache: "no-store",
      });
      const found = d.items.find((b) => b.id === editId) ?? null;
      if (!found) {
        setMsg({ kind: "error", text: t("benchmarkNew.notFound") });
      } else {
        setAccount(found.account);
        setTitle(found.title);
        setVideoUrl(found.video_url ?? "");
        setSourceText(found.source_text ?? "");
        setProductId(found.product_id ?? "");
        setDuration(found.duration == null ? "" : String(found.duration));
        setVisibility(found.visibility);
      }
    } catch {
      setMsg({ kind: "error", text: t("benchmarkNew.notFound") });
    } finally {
      setLoading(false);
    }
  }, [editId, t]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  const handleSave = async () => {
    if (saving) return;
    const acct = account.trim();
    const ttl = title.trim();
    if (!acct) {
      setMsg({ kind: "error", text: t("benchmarkNew.enterAccount") });
      return;
    }
    if (!ttl) {
      setMsg({ kind: "error", text: t("benchmarkNew.enterTitle") });
      return;
    }
    let durationValue: number | null = null;
    const dur = duration.trim();
    if (dur) {
      const n = Number(dur);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        setMsg({ kind: "error", text: t("benchmarkNew.invalidDuration") });
        return;
      }
      durationValue = n;
    }
    setSaving(true);
    setMsg(null);
    const body = {
      account: acct,
      title: ttl,
      video_url: videoUrl.trim() || null,
      source_text: sourceText.trim() || null,
      product_id: productId || null,
      duration: durationValue,
      visibility,
    };
    try {
      if (editId) {
        await apiFetch<Benchmark>(`/api/benchmarks?id=${encodeURIComponent(editId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        setMsg({ kind: "success", text: t("common.saved") });
      } else {
        await apiFetch<{ id: string }>("/api/benchmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        setMsg({ kind: "success", text: t("benchmarkNew.saved") });
      }
      router.push("/app/benchmarks");
    } catch (err) {
      setMsg({
        kind: "error",
        text: t("models.saveFailed", { msg: err instanceof Error ? err.message : "error" }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <PageHeader
        title={editId ? t("benchmarkNew.editTitle") : t("benchmarkNew.pageTitle")}
        subtitle={t("benchmarkNew.pageSub")}
      />

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

      {loading ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-text-secondary">
            {t("common.loading")}
          </div>
        </Card>
      ) : (
        <Card>
          <CardHead
            title={editId ? t("benchmarkNew.editEntryTitle") : t("benchmarkNew.entryTitle")}
            sub={t("benchmarkNew.entrySub")}
          />

          <Field label={t("benchmarkNew.accountLabel")} required>
            <Input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder={t("benchmarkNew.accountPlaceholder")}
            />
          </Field>

          <Field label={t("benchmarkNew.titleLabel")} required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("benchmarkNew.titlePlaceholder")}
            />
          </Field>

          <Field label={t("benchmarkNew.urlLabel")}>
            <Input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder={t("benchmarkNew.urlPlaceholder")}
            />
          </Field>

          <Field label={t("benchmarkNew.sourceLabel")}>
            <Textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              style={{ minHeight: 150 }}
              placeholder={t("benchmarkNew.sourcePlaceholder")}
            />
          </Field>

          <Field label={t("benchmarkNew.durationLabel")}>
            <Input
              type="number"
              min={0}
              step={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder={t("benchmarkNew.durationPlaceholder")}
            />
          </Field>

          <Field label={t("benchmarkNew.productLabel")}>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">{t("benchmarkNew.productNone")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · #{p.id.slice(-3).toUpperCase()}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t("benchmarkNew.visibilityLabel")}>
            <div className="flex flex-wrap gap-2">
              {VISIBILITY_OPTIONS.map((opt) => {
                const active = visibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVisibility(opt.value)}
                    className={`inline-flex items-center gap-1.5 rounded border px-3.5 py-1.5 text-[13px] transition ${
                      active
                        ? "border-brand bg-brand-subtle text-brand"
                        : "border-border-strong text-text-secondary hover:border-brand/50 hover:text-text-primary"
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="mt-6 flex justify-end gap-2.5 border-t border-border pt-4">
            <Btn variant="default" onClick={() => router.back()} disabled={saving}>
              {t("benchmarkNew.cancel")}
            </Btn>
            <Btn variant="primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? t("common.saving") : t("benchmarkNew.saveBenchmark")}
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
