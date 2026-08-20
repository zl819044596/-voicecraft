"use client";

// PIPELINE_TASK_10 — 提示词中心 (/app/prompts).
//
// C4 对齐原型 prompts.html：下划线文字 tab（All + 7 类型，带计数）+ 搜索框 +
// 提示词卡片网格（pc-head 名称/default 徽标/类型 tag/enabled 圆点；prompt-body
// 摘录；pc-meta scenario/tags；pc-ops Edit/Duplicate/Enable|Disable/Set default/
// Delete）+ 底部 footer note。编辑器保留为弹层（新建/编辑）。
//
// CRUD 用户隔离，走 GET/POST/PUT/DELETE /api/prompts。Duplicate = 复制记录
// 新增（POST，名称加 " (copy)"）；inline Enable/Disable = PUT enabled 翻转；
// Set default = PUT is_default（后端每 (user, type) 至多一个 default）。
//
// React #310: every hook is declared at the top before any early return.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { PROMPT_TYPES, PROMPT_TYPE_LABELS, type Prompt, type PromptType } from "@/lib/app-data";
import { useTranslation } from "@/i18n";

type FormState = {
  type: PromptType;
  name: string;
  scenario: string;
  body: string;
  tags: string;
  enabled: boolean;
  is_default: boolean;
};

const EMPTY_FORM: FormState = {
  type: "product_parse",
  name: "",
  scenario: "",
  body: "",
  tags: "",
  enabled: true,
  is_default: false,
};

export default function PromptsPage() {
  const { t } = useTranslation();

  // List state.
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const [filterType, setFilterType] = useState<PromptType | "all">("all");
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editor state (modal).
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = new
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: Prompt[] }>("/api/prompts", { cache: "no-store" });
      setPrompts(data.items);
      setLoadError(null);
    } catch {
      setPrompts([]);
      setLoadError(t("prompts.loadError"));
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // C4 — 每类型计数（tab 后缀）。
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of prompts ?? []) m[p.type] = (m[p.type] ?? 0) + 1;
    return m;
  }, [prompts]);

  // C4 — 搜索 + 类型过滤后的可见列表。
  const visible = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return (prompts ?? []).filter((p) => {
      if (filterType !== "all" && p.type !== filterType) return false;
      if (!kw) return true;
      return (
        p.name.toLowerCase().includes(kw) ||
        (p.scenario ?? "").toLowerCase().includes(kw) ||
        p.body.toLowerCase().includes(kw) ||
        (p.tags ?? []).some((tag) => tag.toLowerCase().includes(kw))
      );
    });
  }, [prompts, filterType, search]);

  const typeLabel = (type: PromptType) => t(PROMPT_TYPE_LABELS[type]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveMsg(null);
    setEditorOpen(true);
  };

  const openEdit = (p: Prompt) => {
    setEditingId(p.id);
    setForm({
      type: p.type,
      name: p.name,
      scenario: p.scenario ?? "",
      body: p.body,
      tags: Array.isArray(p.tags) ? p.tags.join(",") : "",
      enabled: p.enabled,
      is_default: p.is_default,
    });
    setSaveMsg(null);
    setEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    const body = form.body.trim();
    if (!name || !body) return;

    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = {
        type: form.type,
        name,
        scenario: form.scenario.trim() || null,
        body,
        tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
        enabled: form.enabled,
        is_default: form.is_default,
      };
      const isNew = editingId === null;
      await apiFetch(isNew ? "/api/prompts" : `/api/prompts?id=${editingId}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await refresh();
      setSaveMsg(isNew ? t("prompts.createOk") : t("prompts.saveOk"));
      setEditorOpen(false);
    } catch (err) {
      setSaveMsg(
        t("prompts.saveFail", { msg: err instanceof Error ? err.message : "error" }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Prompt) => {
    if (!window.confirm(t("prompts.deleteConfirm", { name: p.name }))) return;
    try {
      await apiFetch(`/api/prompts?id=${p.id}`, { method: "DELETE" });
      if (editingId === p.id) setEditorOpen(false);
      await refresh();
    } catch {
      setSaveMsg(t("prompts.saveFail", { msg: "delete" }));
    }
  };

  // C4 — Duplicate：复制记录新增（POST，名称后缀 " (copy)"，默认关闭）。
  const handleDuplicate = async (p: Prompt) => {
    const payload = {
      type: p.type,
      name: `${p.name} (copy)`,
      scenario: p.scenario,
      body: p.body,
      tags: Array.isArray(p.tags) ? p.tags : [],
      enabled: p.enabled,
      is_default: false,
    };
    try {
      await apiFetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await refresh();
    } catch {
      setSaveMsg(t("prompts.saveFail", { msg: "duplicate" }));
    }
  };

  // C4 — inline Enable/Disable：PUT enabled 翻转。
  const handleToggleEnabled = async (p: Prompt) => {
    try {
      await apiFetch(`/api/prompts?id=${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: p.type,
          name: p.name,
          scenario: p.scenario,
          body: p.body,
          tags: Array.isArray(p.tags) ? p.tags : [],
          enabled: !p.enabled,
          is_default: p.is_default,
        }),
      });
      await refresh();
    } catch {
      setSaveMsg(t("prompts.saveFail", { msg: "toggle" }));
    }
  };

  // C4 — Set default：PUT is_default=true（后端 upsert 清旧）。
  const handleSetDefault = async (p: Prompt) => {
    try {
      await apiFetch(`/api/prompts?id=${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: p.type,
          name: p.name,
          scenario: p.scenario,
          body: p.body,
          tags: Array.isArray(p.tags) ? p.tags : [],
          enabled: p.enabled,
          is_default: true,
        }),
      });
      await refresh();
    } catch {
      setSaveMsg(t("prompts.saveFail", { msg: "default" }));
    }
  };

  const inputClass =
    "input";
  const labelClass = "mb-1.5 block text-xs font-medium text-text-secondary";
  const tabClass = (active: boolean) => `tab ${active ? "on" : ""}`;

  return (
    <div className="mx-auto w-full">
      <header className="mb-5">
        <h1 className="text-[17px] font-semibold text-text-primary">{t("prompts.pageTitle")}</h1>
        <p className="mt-1 text-[12px] leading-5 text-text-secondary">{t("prompts.pageDesc")}</p>
      </header>

      {loadError ? (
        <div className="mb-6 rounded-lg border border-error/30 bg-error-bg px-4 py-3 text-sm text-error">
          {loadError}
        </div>
      ) : null}

      {/* ── 类型筛选：下划线文字 tab（All + 7 类型，带计数） ── */}
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={filterType === "all"}
          onClick={() => setFilterType("all")}
          className={tabClass(filterType === "all")}
        >
          {t("prompts.typeAll")} ({prompts?.length ?? 0})
        </button>
        {PROMPT_TYPES.map((tp) => (
          <button
            key={tp}
            type="button"
            role="tab"
            aria-selected={filterType === tp}
            onClick={() => setFilterType(tp)}
            className={tabClass(filterType === tp)}
          >
            {typeLabel(tp)} ({typeCounts[tp] ?? 0})
          </button>
        ))}
      </div>

      {/* ── 搜索 + 新建 ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("prompts.searchPlaceholder")}
          className="input w-[220px]"
        />
        <span className="spacer" />
        <span className="note">{t("prompts.topNote")}</span>
        <button type="button" onClick={openCreate} className="btn btn-primary">
          {t("prompts.newPrompt")}
        </button>
      </div>

      {/* ── 提示词卡片网格 ── */}
      {prompts === null ? (
        <p className="px-2 py-10 text-center text-sm text-text-tertiary">…</p>
      ) : visible.length === 0 ? (
        <p className="px-2 py-10 text-center text-sm text-text-tertiary">
          {prompts.length === 0 ? t("prompts.listEmpty") : t("prompts.listEmptyFiltered")}
        </p>
      ) : (
        <div className="prompt-grid">
          {visible.map((p) => (
            <div className="prompt-card" key={p.id}>
              <div className="pc-head">
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.is_default ? <span className="pc-default">default</span> : null}
                <span className="pc-type">{typeLabel(p.type)}</span>
                <span className="spacer" />
                <span className={`st ${p.enabled ? "st-done" : "st-skip"}`}>
                  {p.enabled ? t("prompts.enabledLabel") : t("prompts.disabledLabel")}
                </span>
              </div>
              <div className="prompt-body">{p.body}</div>
              <div className="pc-meta">
                scenario: {p.scenario || "—"}
                {(p.tags ?? []).length > 0 ? ` · tags: ${p.tags!.map((tag) => `#${tag}`).join(" ")}` : ""}
              </div>
              <div className="pc-ops">
                <button type="button" className="btn-text" onClick={() => openEdit(p)}>
                  {t("prompts.edit")}
                </button>
                <button type="button" className="btn-text" onClick={() => handleDuplicate(p)}>
                  {t("prompts.duplicate")}
                </button>
                {p.is_default ? null : p.enabled ? (
                  <button type="button" className="btn-text" onClick={() => handleToggleEnabled(p)}>
                    {t("prompts.disable")}
                  </button>
                ) : (
                  <button type="button" className="btn-text accent" onClick={() => handleToggleEnabled(p)}>
                    {t("prompts.enable")}
                  </button>
                )}
                {!p.is_default ? (
                  <button type="button" className="btn-text" onClick={() => handleSetDefault(p)}>
                    {t("prompts.setDefault")}
                  </button>
                ) : null}
                <span className="spacer" />
                <button type="button" className="btn-text danger" onClick={() => handleDelete(p)}>
                  {t("prompts.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── footer note ── */}
      <div className="mt-4 flex justify-end">
        <span className="note">{t("prompts.footerNote")}</span>
      </div>

      {/* ── 编辑器弹层 ── */}
      {editorOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setEditorOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-bg-subtle p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-text-primary">
                {editingId === null ? t("prompts.createNew") : t("prompts.editTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="shrink-0 rounded border border-border px-3 py-1 text-xs text-text-secondary transition hover:border-error/40 hover:text-error"
              >
                {t("common.close")}
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <fieldset>
                <legend className={labelClass}>{t("prompts.typeLabel")}</legend>
                <div className="flex flex-wrap gap-2">
                  {PROMPT_TYPES.map((tp) => (
                    <label
                      key={tp}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        form.type === tp
                          ? "border-brand bg-brand-subtle text-brand"
                          : "border-border bg-bg-muted/30 text-text-secondary hover:border-brand/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="prompt-type"
                        value={tp}
                        checked={form.type === tp}
                        onChange={() => setForm((f) => ({ ...f, type: tp }))}
                        className="sr-only"
                      />
                      {typeLabel(tp)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>{t("prompts.nameLabel")}</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("prompts.namePlaceholder")}
                    maxLength={120}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t("prompts.scenarioLabel")}</label>
                  <input
                    value={form.scenario}
                    onChange={(e) => setForm((f) => ({ ...f, scenario: e.target.value }))}
                    placeholder={t("prompts.scenarioPlaceholder")}
                    maxLength={200}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>{t("prompts.bodyLabel")}</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder={t("prompts.bodyPlaceholder")}
                  rows={7}
                  maxLength={20000}
                  className="input min-h-[96px] resize-y py-2"
                />
              </div>

              <div>
                <label className={labelClass}>{t("prompts.tagsLabel")}</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder={t("prompts.tagsPlaceholder")}
                  className={inputClass}
                />
              </div>

              <div className="flex flex-wrap items-center gap-5">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                    className="h-4 w-4 accent-brand"
                  />
                  {form.enabled ? t("prompts.enabledLabel") : t("prompts.disabledLabel")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                    className="h-4 w-4 accent-brand"
                  />
                  {t("prompts.setDefault")}
                </label>
              </div>

              <div className="flex items-center gap-3 border-t border-border pt-4">
                <button
                  type="submit"
                  disabled={saving || !form.name.trim() || !form.body.trim()}
                  className="btn btn-primary"
                >
                  {saving ? t("prompts.saving") : editingId === null ? t("prompts.create") : t("prompts.save")}
                </button>
                {saveMsg ? (
                  <span className="text-xs text-text-tertiary">{saveMsg}</span>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
