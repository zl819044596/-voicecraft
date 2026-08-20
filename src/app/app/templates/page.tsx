"use client";

// PIPELINE_TASK_12 — 模板中心 (/app/templates), converged to the browse view
// described in prompts.html:148 ("模板库 /app/templates 为浏览视图，复用
// prompts API，无独立原型页"). The previous implementation was a full three-pane
// CRUD manager overlapping /app/prompts; this page is read-only:
//
//   • 7 类下划线 tab + 搜索框
//   • prompt 卡片（name + default/type + enabled 徽章 + 正文摘录 + scenario/tags）
//   • 点卡片 / 操作按钮 → 跳 /app/prompts 编辑
//
// No stats cards, no hardcoded Chinese, no alert/confirm — all i18n + inline
// feedback + shared proto components.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { PROMPT_TYPES, PROMPT_TYPE_LABELS, type Prompt, type PromptType } from "@/lib/app-data";
import { useTranslation } from "@/i18n";
import { Badge, Card, EmptyState, Input, PageHeader } from "@/components/app/proto";

type Filter = "all" | PromptType;

export default function TemplatesPage() {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<Filter>("all");

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: Prompt[] }>("/api/prompts", { cache: "no-store" });
      setPrompts(data.items);
      setLoadError(null);
    } catch {
      setPrompts([]);
      setLoadError(t("templates.loadError"));
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const countByType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of prompts ?? []) m[p.type] = (m[p.type] ?? 0) + 1;
    return m;
  }, [prompts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (prompts ?? []).filter((p) => {
      if (activeType !== "all" && p.type !== activeType) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.scenario ?? "").toLowerCase().includes(q) ||
        (p.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [prompts, activeType, search]);

  const tabs: Array<{ key: Filter; label: string; count: number }> = [
    { key: "all", label: t("templates.allTypes"), count: prompts?.length ?? 0 },
    ...PROMPT_TYPES.map((ty) => ({
      key: ty,
      label: t(PROMPT_TYPE_LABELS[ty]),
      count: countByType[ty] ?? 0,
    })),
  ];

  return (
    <div className="mx-auto w-full">
      <PageHeader title={t("templates.pageTitle")} subtitle={t("templates.pageSub")} />

      {loadError ? (
        <div className="mb-4 rounded-lg border border-error/30 bg-error-bg px-4 py-3 text-sm text-error">
          {loadError}
        </div>
      ) : null}

      {/* ── 类型筛选：下划线 tab ── */}
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveType(tab.key)}
            className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 px-0.5 pb-2 text-[12px] transition ${
              activeType === tab.key
                ? "border-brand font-semibold text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
            <span className="ml-1 text-[11px] text-text-tertiary">{tab.count}</span>
          </button>
        ))}
        <span className="flex-1" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("templates.searchPlaceholder")}
          className="mb-2 w-[220px]"
        />
      </div>

      {/* ── 模板卡片 ── */}
      {prompts === null ? (
        <Card>
          <div className="py-10 text-center text-sm text-text-secondary">
            {t("common.loading")}
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState symbol="≡" title={t("templates.emptyInType")} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((p) => {
            const tags = (p.tags ?? []).length > 0 ? (p.tags ?? []).join(" ") : t("templates.noTags");
            return (
              <Card key={p.id} className="flex flex-col p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-bold text-text-primary">{p.name}</span>
                  {p.is_default ? (
                    <span className="text-[10.5px] font-semibold text-brand">
                      {t("templates.defaultBadge")}
                    </span>
                  ) : null}
                  <span className="text-[10.5px] text-text-tertiary">
                    {t(PROMPT_TYPE_LABELS[p.type])}
                  </span>
                  <span className="flex-1" />
                  <Badge variant={p.enabled ? "green" : "gray"} dot>
                    {p.enabled ? t("templates.enabled") : t("templates.disabled")}
                  </Badge>
                </div>

                <div className="mb-2 line-clamp-3 rounded-lg border border-border bg-bg px-3 py-2 font-mono text-[11px] leading-5 text-text-secondary">
                  {p.body}
                </div>

                <div className="mb-3 text-[10.5px] text-text-tertiary">
                  {t("templates.metaLine", { scenario: p.scenario ?? "—", tags })}
                </div>

                <div className="mt-auto">
                  <Link
                    href="/app/prompts"
                    className="text-[12px] font-semibold text-brand hover:brightness-110"
                  >
                    {t("templates.editInPrompts")}
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── 页脚说明 ── */}
      <p className="mt-5 text-[11.5px] leading-5 text-text-tertiary">{t("templates.browseNote")}</p>
    </div>
  );
}
