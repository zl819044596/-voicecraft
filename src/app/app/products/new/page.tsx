"use client";

// PIPELINE_TASK_12 — 新建商品 (/app/products/new).
//
// Mirrors product-new.html: name / topic / product_url / detail_text /
// visibility pills, then 取消 (back), 保存商品 (POST → detail) and
// 保存并新建任务→ (POST → /app/tasks/new?product=:id).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, CardHead, Field, Input, PageHeader, Textarea } from "@/components/app/proto";
import { apiFetch } from "@/lib/api-client";
import { useTranslation } from "@/i18n";

const VISIBILITY_OPTIONS = [
  { value: "all", labelKey: "productNew.visibilityPublic" },
  { value: "private", labelKey: "productNew.visibilityPrivate" },
  { value: "me", labelKey: "productNew.visibilityMe" },
] as const;

export default function ProductNewPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [detailText, setDetailText] = useState("");
  const [visibility, setVisibility] = useState<"all" | "private" | "me">("me");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const create = async (): Promise<string | null> => {
    if (saving) return null;
    const trimmed = name.trim();
    if (!trimmed) {
      setMsg({ kind: "error", text: t("productNew.enterName") });
      return null;
    }
    setSaving(true);
    setMsg(null);
    try {
      const data = await apiFetch<{ id: string }>("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          product_url: productUrl.trim() || null,
          detail_text: detailText.trim() || null,
          visibility,
        }),
      });
      return data.id;
    } catch (err) {
      setMsg({
        kind: "error",
        text: t("models.saveFailed", { msg: err instanceof Error ? err.message : "error" }),
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const id = await create();
    if (id) {
      setMsg({ kind: "success", text: t("common.saved") });
      router.push(`/app/products/${id}`);
    }
  };

  const handleSaveAndTask = async () => {
    const id = await create();
    if (id) {
      setMsg({ kind: "success", text: t("productNew.savedAndTask") });
      router.push(`/app/tasks/new?product=${id}`);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <PageHeader title={t("productNew.pageTitle")} subtitle={t("productNew.pageSub")} />

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

      <Card>
        <CardHead
          title={t("productNew.entryTitle")}
          sub={t("productNew.entrySub")}
        />

        <Field label={t("productNew.nameLabel")} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("productNew.namePlaceholder")}
          />
        </Field>

        <Field label={t("productNew.topicLabel")}>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t("productNew.topicPlaceholder")}
          />
        </Field>

        <Field label={t("productNew.urlLabel")}>
          <Input
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            placeholder={t("productNew.urlPlaceholder")}
          />
        </Field>

        <Field label={t("productNew.detailLabel")}>
          <Textarea
            value={detailText}
            onChange={(e) => setDetailText(e.target.value)}
            style={{ minHeight: 140 }}
            placeholder={t("productNew.detailPlaceholder")}
          />
        </Field>

        <Field label={t("productNew.visibilityLabel")}>
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
            {t("productNew.cancel")}
          </Btn>
          <Btn variant="default" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t("common.saving") : t("productNew.saveProduct")}
          </Btn>
          <Btn variant="primary" onClick={() => void handleSaveAndTask()} disabled={saving}>
            {saving ? t("common.saving") : t("productNew.saveAndTask")}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
