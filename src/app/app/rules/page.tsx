"use client";

// CORE-FEATURES — 规则中心 (/app/rules).
//
// 四类可配置规则 CRUD（rewrite 二次重构 / split 拆分 / image 图片生成 /
// i2v 图生视频），镜像提示词中心 prompts 页的交互范式：下划线文字 tab
// （All + 4 类，带计数）+ 搜索框 + 规则卡片网格 + 底部 footer note，编辑器
// 保留为弹层（新建/编辑）。
//
// 语义：规则是"配置"——Quick 生成时按需勾选快照进 task.config.rules，
// 流水线各步骤按 config.rules[kind] 解析正文注入提示词（未选 → 系统默认）。
// 每 (user, kind) 至多一个 default（后端部分唯一索引 → 409 CONFLICT）。
//
// CRUD 走 GET/POST/PUT/DELETE /api/rules；Duplicate = 复制记录新增；
// inline Enable/Disable = PUT enabled 翻转；Set default = PUT is_default。

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { RULE_KINDS, RULE_KIND_LABELS, type Rule, type RuleKind } from "@/lib/app-data";
import { useTranslation } from "@/i18n";

type FormState = {
  kind: RuleKind;
  name: string;
  body: string;
  enabled: boolean;
  is_default: boolean;
};

const EMPTY_FORM: FormState = {
  kind: "rewrite",
  name: "",
  body: "",
  enabled: true,
  is_default: false,
};

export default function RulesPage() {
  const { t } = useTranslation();

  // List state.
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [filterKind, setFilterKind] = useState<RuleKind | "all">("all");
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
      const data = await apiFetch<{ items: Rule[] }>("/api/rules", { cache: "no-store" });
      setRules(data.items);
      setLoadError(null);
    } catch {
      setRules([]);
      setLoadError(t("rules.loadError"));
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Per-kind counts (tab suffix).
  const kindCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rules ?? []) m[r.kind] = (m[r.kind] ?? 0) + 1;
    return m;
  }, [rules]);

  // Search + kind filter.
  const visible = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return (rules ?? []).filter((r) => {
      if (filterKind !== "all" && r.kind !== filterKind) return false;
      if (!kw) return true;
      return r.name.toLowerCase().includes(kw) || r.body.toLowerCase().includes(kw);
    });
  }, [rules, filterKind, search]);

  const kindLabel = (kind: RuleKind) => t(RULE_KIND_LABELS[kind]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveMsg(null);
    setEditorOpen(true);
  };

  const openEdit = (r: Rule) => {
    setEditingId(r.id);
    setForm({ kind: r.kind, name: r.name, body: r.body, enabled: r.enabled, is_default: r.is_default });
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
      const payload = { kind: form.kind, name, body, enabled: form.enabled, is_default: form.is_default };
      const isNew = editingId === null;
      await apiFetch(isNew ? "/api/rules" : `/api/rules/${editingId}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await refresh();
      setSaveMsg(isNew ? t("rules.createOk") : t("rules.saveOk"));
      setEditorOpen(false);
    } catch (err) {
      setSaveMsg(t("rules.saveFail", { msg: err instanceof Error ? err.message : "error" }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: Rule) => {
    if (!window.confirm(t("rules.deleteConfirm", { name: r.name }))) return;
    try {
      await apiFetch(`/api/rules/${r.id}`, { method: "DELETE" });
      if (editingId === r.id) setEditorOpen(false);
      await refresh();
    } catch {
      setSaveMsg(t("rules.saveFail", { msg: "delete" }));
    }
  };

  // Duplicate: copy record as new (name suffix " (copy)", default off).
  const handleDuplicate = async (r: Rule) => {
    try {
      await apiFetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: r.kind,
          name: `${r.name} (copy)`,
          body: r.body,
          enabled: r.enabled,
          is_default: false,
        }),
      });
      await refresh();
    } catch {
      setSaveMsg(t("rules.saveFail", { msg: "duplicate" }));
    }
  };

  // inline Enable/Disable: PUT enabled flip.
  const handleToggleEnabled = async (r: Rule) => {
    try {
      await apiFetch(`/api/rules/${r.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...r, enabled: !r.enabled }),
      });
      await refresh();
    } catch {
      setSaveMsg(t("rules.saveFail", { msg: "toggle" }));
    }
  };

  // Set default: PUT is_default=true (backend clears old default for the kind).
  const handleSetDefault = async (r: Rule) => {
    try {
      await apiFetch(`/api/rules/${r.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...r, is_default: true }),
      });
      await refresh();
    } catch {
      setSaveMsg(t("rules.saveFail", { msg: "default" }));
    }
  };

  const inputClass = "input";
  const labelClass = "mb-1.5 block text-xs font-medium text-text-secondary";
  const tabClass = (active: boolean) => `tab ${active ? "on" : ""}`;

  return (
    <div className="mx-auto w-full">
      <header className="mb-5">
        <h1 className="text-[17px] font-semibold text-text-primary">{t("rules.pageTitle")}</h1>
        <p className="mt-1 text-[12px] leading-5 text-text-secondary">{t("rules.pageDesc")}</p>
      </header>

      {loadError ? (
        <div className="mb-6 rounded-lg border border-error/30 bg-error-bg px-4 py-3 text-sm text-error">
          {loadError}
        </div>
      ) : null}

      {/* ── 类型筛选：下划线文字 tab（All + 4 类，带计数） ── */}
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={filterKind === "all"}
          onClick={() => setFilterKind("all")}
          className={tabClass(filterKind === "all")}
        >
          {t("rules.kindAll")} ({rules?.length ?? 0})
        </button>
        {RULE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filterKind === k}
            onClick={() => setFilterKind(k)}
            className={tabClass(filterKind === k)}
          >
            {kindLabel(k)} ({kindCounts[k] ?? 0})
          </button>
        ))}
      </div>

      {/* ── 搜索 + 新建 ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("rules.searchPlaceholder")}
          className="input w-[220px]"
        />
        <span className="spacer" />
        <span className="note">{t("rules.topNote")}</span>
        <button type="button" onClick={openCreate} className="btn btn-primary">
          {t("rules.newRule")}
        </button>
      </div>

      {/* ── 规则卡片网格 ── */}
      {rules === null ? (
        <p className="px-2 py-10 text-center text-sm text-text-tertiary">…</p>
      ) : visible.length === 0 ? (
        <p className="px-2 py-10 text-center text-sm text-text-tertiary">
          {rules.length === 0 ? t("rules.listEmpty") : t("rules.listEmptyFiltered")}
        </p>
      ) : (
        <div className="prompt-grid">
          {visible.map((r) => (
            <div className="prompt-card" key={r.id}>
              <div className="pc-head">
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.is_default ? <span className="pc-default">{t("rules.defaultBadge")}</span> : null}
                <span className="pc-type">{kindLabel(r.kind)}</span>
                <span className="spacer" />
                <span className={`st ${r.enabled ? "st-done" : "st-skip"}`}>
                  {r.enabled ? t("rules.enabledLabel") : t("rules.disabledLabel")}
                </span>
              </div>
              <div className="prompt-body">{r.body}</div>
              <div className="pc-ops">
                <button type="button" className="btn-text" onClick={() => openEdit(r)}>
                  {t("rules.edit")}
                </button>
                <button type="button" className="btn-text" onClick={() => handleDuplicate(r)}>
                  {t("rules.duplicate")}
                </button>
                {r.is_default ? null : r.enabled ? (
                  <button type="button" className="btn-text" onClick={() => handleToggleEnabled(r)}>
                    {t("rules.disable")}
                  </button>
                ) : (
                  <button type="button" className="btn-text accent" onClick={() => handleToggleEnabled(r)}>
                    {t("rules.enable")}
                  </button>
                )}
                {!r.is_default ? (
                  <button type="button" className="btn-text" onClick={() => handleSetDefault(r)}>
                    {t("rules.setDefault")}
                  </button>
                ) : null}
                <span className="spacer" />
                <button type="button" className="btn-text danger" onClick={() => handleDelete(r)}>
                  {t("rules.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── footer note ── */}
      <div className="mt-4 flex justify-end">
        <span className="note">{t("rules.footerNote")}</span>
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
                {editingId === null ? t("rules.createNew") : t("rules.editTitle")}
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
                <legend className={labelClass}>{t("rules.kindLabel")}</legend>
                <div className="flex flex-wrap gap-2">
                  {RULE_KINDS.map((k) => (
                    <label
                      key={k}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        form.kind === k
                          ? "border-brand bg-brand-subtle text-brand"
                          : "border-border bg-bg-muted/30 text-text-secondary hover:border-brand/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="rule-kind"
                        value={k}
                        checked={form.kind === k}
                        onChange={() => setForm((f) => ({ ...f, kind: k }))}
                        className="sr-only"
                      />
                      {kindLabel(k)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label className={labelClass}>{t("rules.nameLabel")}</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("rules.namePlaceholder")}
                  maxLength={120}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>{t("rules.bodyLabel")}</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder={t("rules.bodyPlaceholder")}
                  rows={7}
                  maxLength={20000}
                  className="input min-h-[96px] resize-y py-2"
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
                  {form.enabled ? t("rules.enabledLabel") : t("rules.disabledLabel")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                    className="h-4 w-4 accent-brand"
                  />
                  {t("rules.setDefault")}
                </label>
              </div>

              <div className="flex items-center gap-3 border-t border-border pt-4">
                <button
                  type="submit"
                  disabled={saving || !form.name.trim() || !form.body.trim()}
                  className="btn btn-primary"
                >
                  {saving ? t("rules.saving") : editingId === null ? t("rules.create") : t("rules.save")}
                </button>
                {saveMsg ? <span className="text-xs text-text-tertiary">{saveMsg}</span> : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
