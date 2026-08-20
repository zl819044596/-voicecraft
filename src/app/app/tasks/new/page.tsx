"use client";

// PIPELINE_TASK_12 — 新建任务 (/app/tasks/new). Rebuilt pixel-faithfully from
// the static task-new.html:
//
//  • 9 step entry cards (从哪个环节开始? 1-9) — selecting one highlights it and
//    shows its config panel; the steps map 1:1 to S1-S9 (STEP_NAMES).
//  • Left column: config panel for the selected step + 生成渠道与模式 card.
//  • Right column: 任务流程总览 (9-step rail).
//
// 开始生成 (simplest working path):
//    POST /api/projects (draft) → POST /api/tasks { project_id, mode, track,
//    run_mode, config: { content_language, synthesis: { aspect, subtitle_burn } } }
//    → router.push(`/app/tasks/{id}`).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { STEP_NAMES } from "@/lib/app-data";
import { useTranslation } from "@/i18n";
import { Badge, Btn, Card, CardHead, Field, Input, Select, Textarea } from "@/components/app/proto";

// Preselect the product referenced by /app/tasks/new?product=:id (used by the
// products pages' "保存并新建任务" action). Mirrors benchmarks/new's
// editIdFromLocation pattern to avoid useSearchParams' Suspense requirement.
function productIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("product");
}

type EntryCard = { step: number; title: string; short: string; desc: string };

const ENTRY_CARDS: EntryCard[] = [
  { step: 1, title: "taskNew.step1Title", short: "taskNew.step1Short", desc: "taskNew.step1Desc" },
  { step: 2, title: "taskNew.step2Title", short: "taskNew.step2Short", desc: "taskNew.step2Desc" },
  { step: 3, title: "taskNew.step3Title", short: "taskNew.step3Short", desc: "taskNew.step3Desc" },
  { step: 4, title: "taskNew.step4Title", short: "taskNew.step4Short", desc: "taskNew.step4Desc" },
  { step: 5, title: "taskNew.step5Title", short: "taskNew.step5Short", desc: "taskNew.step5Desc" },
  { step: 6, title: "taskNew.step6Title", short: "taskNew.step6Short", desc: "taskNew.step6Desc" },
  { step: 7, title: "taskNew.step7Title", short: "taskNew.step7Short", desc: "taskNew.step7Desc" },
  { step: 8, title: "taskNew.step8Title", short: "taskNew.step8Short", desc: "taskNew.step8Desc" },
  { step: 9, title: "taskNew.step9Title", short: "taskNew.step9Short", desc: "taskNew.step9Desc" },
];

// Right-rail status text for non-active steps (matches the static rail).
const RAIL_STATUS: Record<number, string> = {
  1: "taskNew.railPending",
  2: "taskNew.railSkippable",
  3: "taskNew.railPending",
  4: "taskNew.railPending",
  5: "taskNew.railPending",
  6: "taskNew.railPending",
  7: "taskNew.railPending",
  8: "taskNew.railPending",
  9: "taskNew.railExport",
};

type ProductOption = { id: string; name: string; detail_text: string | null };

type PillKey = string;

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded border px-3 py-1 text-[13px] transition select-none ${
        active
          ? "border-brand bg-brand-subtle text-brand"
          : "border-border-strong bg-bg-subtle text-text-primary hover:border-brand"
      }`}
    >
      {children}
    </button>
  );
}

function StepNumber({ n, sm = false }: { n: number; sm?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg font-bold text-white ${
        sm ? "h-[22px] w-[22px] text-[11px]" : "h-[26px] w-[26px] text-xs"
      }`}
      style={{ backgroundImage: "var(--app-brand)" }}
    >
      {n}
    </span>
  );
}

export default function NewTaskPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const requestedProductId = useRef(productIdFromLocation());
  const [step, setStep] = useState<number>(1);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [sourceText, setSourceText] = useState<string>("");

  // 生成渠道与模式.
  const [copyMode, setCopyMode] = useState<PillKey>("ai");
  const [runMode, setRunMode] = useState<PillKey>("semi");
  const [channel, setChannel] = useState<PillKey>("platform");

  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: ProductOption[] }>("/api/products", { cache: "no-store" })
      .then((d) => {
        if (cancelled) return;
        if (d?.items) setProducts(d.items);
        // Auto-select the product requested via ?product=:id once the list loads.
        const wanted = requestedProductId.current;
        if (wanted) {
          const match = d?.items?.find((p) => p.id === wanted);
          if (match) {
            setProductId(match.id);
            if (match.detail_text) setSourceText(match.detail_text);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProductSelect = (id: string) => {
    setProductId(id);
    const product = products.find((p) => p.id === id);
    if (product?.detail_text) setSourceText(product.detail_text);
  };

  const handleGenerate = async () => {
    if (creating) return;
    const titleText = title.trim();
    if (!titleText) {
      setFormError(t("taskNew.emptyTitle"));
      return;
    }
    const source = sourceText.trim() || titleText;
    setCreating(true);
    setFormError(null);
    try {
      // 1. Create the project (draft container) — 201 { project: { id } }.
      const projectData = await apiFetch<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleText,
          prompt: source,
          source_type: copyMode === "ai" ? "topic" : "text",
        }),
      });

      // 2. Create the task + enqueue S1 — 202 flat { id }.
      const taskData = await apiFetch<{ id: string }>("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectData.project.id,
          mode: "static",
          track: channel === "byok" ? "byok" : "managed",
          run_mode: runMode, // 'semi' pauses after every non-last step
          config: {
            content_language: "en",
            synthesis: { aspect: "16:9", subtitle_burn: true },
          },
        }),
      });

      router.push(`/app/tasks/${taskData.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("taskNew.createFail"));
    } finally {
      setCreating(false);
    }
  };

  const entryClass = (active: boolean) =>
    `rounded border p-3.5 text-left transition select-none ${
      active ? "border-brand bg-brand-subtle" : "border-border bg-bg hover:border-brand/60"
    }`;

  const railRowClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded border px-3 py-2.5 text-left transition select-none ${
      active ? "border-brand bg-brand-subtle" : "border-border bg-bg hover:border-brand/50"
    }`;

  const groupLabel = "mb-1.5 block text-[13px] font-semibold text-text-secondary";

  return (
    <div className="mx-auto w-full">
      {/* ───────────────── 选择起点 ───────────────── */}
      <Card>
        <CardHead
          title={t("taskNew.startFrom")}
          sub={t("taskNew.stepSelectHint")}
          right={
            <Badge variant="accent">
              {t("taskNew.currentStep")}:
              {ENTRY_CARDS[step - 1] ? t(ENTRY_CARDS[step - 1].short) : step}
            </Badge>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ENTRY_CARDS.map((c) => (
            <button
              key={c.step}
              type="button"
              onClick={() => setStep(c.step)}
              className={entryClass(step === c.step)}
            >
              <div className="flex items-start gap-3">
                <StepNumber n={c.step} />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-text-primary">{t(c.title)}</div>
                  <div className="mt-0.5 text-[12.5px] leading-5 text-text-secondary">{t(c.desc)}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ───────────────── 左列：配置 + 渠道模式 ───────────────── */}
        <div className="min-w-0">
          <Card>
            <CardHead title={t("taskNew.configLabel", { n: step }) + ` · ${STEP_NAMES[step]}`} />
            <Field label={t("taskNew.taskName")} required>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("taskNew.taskNamePlaceholder")}
                maxLength={200}
              />
            </Field>

            {step === 1 ? (
              <>
                <Field label={t("taskNew.product")}>
                  <Select
                    value={productId}
                    onChange={(e) => handleProductSelect(e.target.value)}
                  >
                    <option value="">{t("taskNew.selectProduct")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("taskNew.productAnalysisSource")}>
                  <Textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    rows={5}
                    placeholder={t("taskNew.productSourcePlaceholder")}
                  />
                </Field>
              </>
            ) : step === 2 ? (
              <Field label={t("app.quickGenTextLabel")}>
                <Textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  rows={8}
                  placeholder={t("taskNew.copyPlaceholder")}
                />
              </Field>
            ) : (
              <div className="rounded-xl border border-border bg-bg px-4 py-8 text-center text-sm text-text-secondary">
                {t("taskNew.stepPlaceholder", { step })}
              </div>
            )}
          </Card>

          {/* 生成渠道与模式 */}
          <Card>
            <CardHead title={t("taskNew.channelCard")} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={groupLabel}>{t("taskNew.copyMode")}</label>
                <div className="flex flex-wrap gap-1.5">
                  <Pill active={copyMode === "ai"} onClick={() => setCopyMode("ai")}>
                    {t("taskNew.copyModeAi")}
                  </Pill>
                  <Pill active={copyMode === "direct"} onClick={() => setCopyMode("direct")}>
                    {t("taskNew.copyModeDirect")}
                  </Pill>
                </div>
              </div>
              <div>
                <label className={groupLabel}>{t("taskNew.runMode")}</label>
                <div className="flex flex-wrap gap-1.5">
                  <Pill active={runMode === "semi"} onClick={() => setRunMode("semi")}>
                    {t("taskNew.runModeSemi")}
                  </Pill>
                  <Pill active={runMode === "auto"} onClick={() => setRunMode("auto")}>
                    {t("taskNew.runModeAuto")}
                  </Pill>
                </div>
              </div>
              <div>
                <label className={groupLabel}>{t("taskNew.channel")}</label>
                <div className="flex flex-wrap gap-1.5">
                  <Pill active={channel === "platform"} onClick={() => setChannel("platform")}>
                    {t("taskNew.channelPlatform")}
                  </Pill>
                  <Pill active={channel === "byok"} onClick={() => setChannel("byok")}>
                    {t("taskNew.channelByok")}
                  </Pill>
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-text-tertiary">
              {t("taskNew.channelHint")}
            </div>
          </Card>
        </div>

        {/* ───────────────── 右列：流程总览 ───────────────── */}
        <div className="min-w-0">
          <Card>
            <CardHead
              title={t("taskNew.taskOverview")}
              right={<Badge variant="blue">{t("taskNew.nineStepPipeline")}</Badge>}
            />
            <div className="grid gap-1.5">
              {ENTRY_CARDS.map((c) => {
                const active = step === c.step;
                return (
                  <button key={c.step} type="button" onClick={() => setStep(c.step)} className={railRowClass(active)}>
                    <StepNumber n={c.step} sm />
                    <span className="text-sm font-semibold text-text-primary">{STEP_NAMES[c.step]}</span>
                    {active ? (
                      <Badge variant="accent" className="ml-auto">
                        {t("taskNew.current")}
                      </Badge>
                    ) : (
                      <span className="ml-auto text-xs text-text-tertiary">
                        {t(RAIL_STATUS[c.step] ?? "taskNew.railPending")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {formError ? (
              <div className="mt-3 rounded-lg border border-error/30 bg-error-bg px-3 py-2 text-sm text-error">
                {formError}
              </div>
            ) : null}
            <Btn variant="primary" className="mt-4 w-full" onClick={handleGenerate} disabled={creating}>
              {creating ? t("taskNew.generating") : t("taskNew.generate")}
            </Btn>
            <div className="mt-1.5 text-center text-xs text-text-tertiary">
              {t("taskNew.afterCreateHint")}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
