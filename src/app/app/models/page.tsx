"use client";

// Task 7/9: Model Config — standalone two-column page (/app/models).
//
// Left column (~240px): "+ Add model" button, four-class navigation
// (Language / Image / Voice / Video), and the active class's model list
// (name · model · enabled dot · default badge). Clicking an entry loads its
// detail into the right column.
//
// Right column (flex 1): the selected/new model's detail card — editable
// Name, read-only Class, API URL, Model name, API Key (masked, re-enter to
// change), Voice (tts only: free text), Enabled switch, Set as default.
// Buttons: Save / Delete / Test connection.
//
// v2 API contract (api/src/routes/model-configs.js + credentials.js):
//   - GET /api/model-configs returns a flat { items } list (not nested
//     classes); we group by provider_class here.
//   - the plaintext key lives in the credentials table: POST /api/credentials
//     {provider, label, key, base_url?} → id, then model-configs are created
//     referencing credential_id. A credential created for an unsaved form is
//     reused while the key is unchanged (test-then-save flow).
//   - PUT / DELETE use ?id= (query param), not /:id.
//   - GET /api/model-configs only ever returns key_masked — no plaintext key
//     is shown or prefilled. The key field starts empty on edits.
//
// Task 9: dark purple theme + i18n.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiRaw } from "@/lib/api-client";
import type { ModelClass, ModelConfig } from "@/lib/app-data";
import { useTranslation } from "@/i18n";

const CLASSES: ModelClass[] = ["llm", "image", "tts", "i2v"];

// Left-column navigation labels (i18n: Language/Image/Voice/Video).
const CLASS_META: Record<ModelClass, { labelKey: string; hint: string }> = {
  llm: { labelKey: "models.classLanguage", hint: "LLM" },
  image: { labelKey: "models.classImage", hint: "image" },
  tts: { labelKey: "models.classVoice", hint: "TTS" },
  i2v: { labelKey: "models.classVideo", hint: "i2v" },
};

type FormState = {
  name: string;
  base_url: string;
  model: string;
  key: string; // plaintext, only while typing — cleared after save
  voice: string;
  enabled: boolean;
  is_default: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  base_url: "",
  model: "",
  key: "",
  voice: "",
  enabled: true,
  is_default: false,
};

type TestState = {
  busy: boolean;
  ok: boolean | null;
  message: string | null;
};

const IDLE_TEST: TestState = { busy: false, ok: null, message: null };

// 固定试听文案（后端 POST /api/model-configs/preview 的 text 必填 ≤200）。
const PREVIEW_TEXT = "这是一段 AI 配音试听：欢迎使用 AI Video Studio，快速生成你的专属视频。";

// 机制判定（C6）：base_url 为空（平台默认）或含 wingray / wing-ray 域 → 机制 B
// 专用适配器；否则机制 A OpenAI 兼容端点。
function mechanismOf(baseUrl: string | null): "a" | "b" {
  if (!baseUrl) return "b";
  return /wingray|wing-ray/i.test(baseUrl) ? "b" : "a";
}

function domainOf(url: string | null): string {
  if (!url) return "wingray default";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function ModelsPage() {
  const { t } = useTranslation();
  const [byClass, setByClass] = useState<Record<ModelClass, ModelConfig[]>>({
    llm: [],
    image: [],
    tts: [],
    i2v: [],
  });
  // A credential created on this page (during save/test of an unsaved config)
  // is reused while the same key is still in the form — avoids duplicate
  // /api/credentials rows on a test-then-save flow.
  const [pendingCred, setPendingCred] = useState<{ id: string; key: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeClass, setActiveClass] = useState<ModelClass>("llm");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [savedIsError, setSavedIsError] = useState(false);
  const [test, setTest] = useState<TestState>(IDLE_TEST);

  // TTS Preview 试听（POST /api/model-configs/preview 返回原始音频流）。
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewMsg, setPreviewMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      // v2: GET /api/model-configs returns a flat { items } list (not nested
      // classes); group by provider_class for the left-column navigation.
      const data = await apiFetch<{ items: ModelConfig[] }>("/api/model-configs", {
        cache: "no-store",
      });
      const grouped: Record<ModelClass, ModelConfig[]> = {
        llm: [],
        image: [],
        tts: [],
        i2v: [],
      };
      for (const item of data.items) {
        if (item.provider_class in grouped) grouped[item.provider_class].push(item);
      }
      setByClass(grouped);
      setLoadError(null);
    } catch {
      setLoadError(t("models.loadError"));
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // -------------------------------------------------------------------------
  // Selection / form helpers
  // -------------------------------------------------------------------------

  const selectEntry = useCallback((entry: ModelConfig) => {
    setSelectedId(entry.id);
    setIsNew(false);
    setForm({
      name: entry.name,
      base_url: entry.base_url ?? "",
      model: entry.model,
      key: "", // never prefill key material (R1)
      voice: entry.voice ?? "",
      enabled: entry.enabled,
      is_default: entry.is_default,
    });
    setSavedMsg(null);
    setSavedIsError(false);
    setTest(IDLE_TEST);
  }, []);

  const startNew = useCallback(
    (cls: ModelClass) => {
      setActiveClass(cls);
      setSelectedId(null);
      setIsNew(true);
      setForm({ ...EMPTY_FORM });
      setSavedMsg(null);
      setSavedIsError(false);
      setTest(IDLE_TEST);
    },
    [],
  );

  const selectClass = useCallback(
    (cls: ModelClass) => {
      setActiveClass(cls);
      const entries = byClass[cls] ?? [];
      if (entries.length > 0) {
        selectEntry(entries.find((e) => e.is_default) ?? entries[0]);
      } else {
        startNew(cls);
      }
    },
    [byClass, selectEntry, startNew],
  );

  const patch = (p: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...p }));
    setSavedMsg(null);
    setSavedIsError(false);
  };

  // Keep the panel's enabled/default in sync after an immediate-action PUT.
  const entries = byClass[activeClass] ?? [];
  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  // -------------------------------------------------------------------------
  // CRUD + test actions
  // -------------------------------------------------------------------------

  // v2: the API key is stored via POST /api/credentials and referenced by id
  // from the model config. Returns null when the form carries no key (edit
  // without changing the key → keep the existing credential).
  const ensureCredential = useCallback(async (): Promise<string | null> => {
    const key = form.key.trim();
    if (!key) return null;
    if (pendingCred && pendingCred.key === key) return pendingCred.id;
    // 已存配置换 Key（03 §4：credentials 契约仅 GET/POST/DELETE 无 PUT；被 enabled
    // model_config 引用的凭据不可删 → 409 CREDENTIAL_IN_USE）。文档对齐顺序：
    //   1) PUT model-config credential_id=null 解绑旧凭据
    //   2) DELETE 旧凭据（释放同 provider+label 唯一约束）
    //   3) POST 新凭据（同 provider+label）
    // 之后主 save() 会以新 credential_id 重新 PUT/POST model-config 完成换指。
    if (!isNew && selected?.credential_id) {
      await apiFetch(`/api/model-configs?id=${encodeURIComponent(selected.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential_id: null }),
      }).catch(() => {});
      await apiFetch(`/api/credentials?id=${encodeURIComponent(selected.credential_id)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    const data = await apiFetch<{ id: string }>("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: activeClass, // lowercase identifier — same alphabet as provider_class
        label: form.name.trim() || activeClass,
        key,
        base_url: form.base_url.trim() || null,
      }),
    });
    setPendingCred({ id: data.id, key });
    return data.id;
  }, [activeClass, form.key, form.name, form.base_url, pendingCred, isNew, selected]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim() || !form.model.trim()) return;
    if (isNew && !form.key.trim()) {
      setSavedMsg(t("models.keyRequiredHint"));
      setSavedIsError(true);
      return;
    }
    setSaving(true);
    setSavedMsg(null);
    setSavedIsError(false);
    try {
      const credentialId = form.key.trim() ? await ensureCredential() : null;
      const body: Record<string, unknown> = {
        provider_class: activeClass,
        name: form.name.trim(),
        model: form.model.trim(),
        enabled: form.enabled,
        is_default: form.is_default,
      };
      if (credentialId) body.credential_id = credentialId;
      if (form.base_url.trim()) body.base_url = form.base_url.trim();
      else body.base_url = null; // allow clearing back to the wingray default
      if (activeClass === "tts") body.voice = form.voice.trim() || null;

      // v2: PUT/DELETE use ?id= (query param), not /:id.
      const url = isNew
        ? "/api/model-configs"
        : `/api/model-configs?id=${encodeURIComponent(selectedId ?? "")}`;
      const data = await apiFetch<{ id?: string }>(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await refresh();
      setSavedMsg(isNew ? t("models.modelCreated") : t("models.changesSaved"));
      // Enter edit mode for the just-created entry (it now has an id).
      if (isNew && data?.id) {
        setSelectedId(data.id);
        setIsNew(false);
      }
      // Clear any stale plaintext key from state immediately (R1).
      setForm((prev) => ({ ...prev, key: "" }));
      setPendingCred(null);
    } catch (err) {
      setSavedMsg(
        t("models.saveFailed", { msg: err instanceof Error ? err.message : "unknown error" }),
      );
      setSavedIsError(true);
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await apiFetch(`/api/model-configs?id=${encodeURIComponent(selected.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !selected.enabled }),
      });
      await refresh();
      patch({ enabled: !selected.enabled });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("models.toggleFailed"));
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await apiFetch(`/api/model-configs?id=${encodeURIComponent(selected.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      await refresh();
      patch({ is_default: true });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("models.setDefaultFailed"));
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async () => {
    if (!selected || saving) return;
    const wasDefault = selected.is_default;
    const confirmMsg = t("models.deleteConfirm", { name: selected.name }) +
      (wasDefault ? `\n\n${t("models.deleteDefaultNote")}` : "");
    if (!window.confirm(confirmMsg)) {
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/model-configs?id=${encodeURIComponent(selected.id)}`, {
        method: "DELETE",
      });
      // 清理孤儿 credential（FK ON DELETE SET NULL 后不再被引用）：静默忽略
      // 409 CREDENTIAL_IN_USE / 404，只清理确认无主的。
      const credId = selected.credential_id;
      if (credId) {
        apiFetch(`/api/credentials?id=${encodeURIComponent(credId)}`, {
          method: "DELETE",
        }).catch(() => {});
      }
      await refresh();
      // Reselect the (possibly promoted) default of this class, or go new.
      const remaining = byClass[activeClass]?.filter((e) => e.id !== selected.id) ?? [];
      if (remaining.length > 0) {
        selectEntry(remaining.find((e) => e.is_default) ?? remaining[0]);
      } else {
        startNew(activeClass);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("models.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (test.busy || saving) return;
    setTest({ busy: true, ok: null, message: null });
    try {
      let body: Record<string, unknown>;
      if (!isNew && selected) {
        // Saved entry — test the stored config (key never leaves the server).
        body = { id: selected.id };
      } else {
        // New/unsaved config — the v2 test endpoint needs a credential_id;
        // create (or reuse) the credential exactly like save() does.
        if (!form.key.trim()) {
          setTest({ busy: false, ok: false, message: t("models.testNeedsKey") });
          return;
        }
        const credentialId = await ensureCredential();
        if (!credentialId) {
          setTest({ busy: false, ok: false, message: t("models.testNeedsKey") });
          return;
        }
        body = {
          provider_class: activeClass,
          credential_id: credentialId,
          model: form.model.trim(),
        };
        if (form.base_url.trim()) body.base_url = form.base_url.trim();
        if (activeClass === "tts" && form.voice.trim()) body.voice = form.voice.trim();
      }
      await apiFetch<{ ok: boolean; latency_ms?: number; provider?: string; model?: string }>(
        "/api/model-configs/test",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      setTest({ busy: false, ok: true, message: "OK" });
    } catch (err) {
      // v2 test failures are 502 sendError → ApiRequestError carries the
      // provider's specific reason in details.message when present.
      const detail = (err as { details?: { message?: string } })?.details?.message;
      setTest({
        busy: false,
        ok: false,
        message: detail ?? (err instanceof Error ? err.message : "Test failed"),
      });
    }
  };

  // TTS 试听：preview 端点按 id 读已保存配置（新配置无 id → 提示先保存）。
  const handlePreview = async () => {
    if (previewBusy || saving) return;
    if (isNew || !selected) {
      setPreviewMsg({ ok: false, text: t("models.previewNeedsSave") });
      return;
    }
    setPreviewBusy(true);
    setPreviewMsg(null);
    try {
      const res = await apiRaw("/api/model-configs/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          voice: form.voice.trim() || selected.voice || undefined,
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
      setPreviewMsg({ ok: true, text: t("models.previewOk") });
    } catch (err) {
      setPreviewMsg({
        ok: false,
        text: t("models.previewFail", { msg: err instanceof Error ? err.message : "error" }),
      });
    } finally {
      setPreviewBusy(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const inputClass =
    "h-[32px] w-full rounded border border-border bg-bg px-2.5 text-[12.5px] text-text-primary placeholder:text-text-tertiary focus:border-text-tertiary focus:outline-none";
  const monoInputClass = `${inputClass} font-mono`;
  const labelClass = "mb-1 block text-[11px] text-text-secondary";

  // 左列表条目子行：default · enabled/disabled · 机制 A/B（原型 li-sub）。
  const liSub = (entry: ModelConfig): string => {
    const parts: string[] = [];
    if (entry.is_default) parts.push(t("models.default"));
    parts.push(entry.enabled ? t("models.enabled") : t("models.disabled"));
    parts.push(
      mechanismOf(entry.base_url) === "a" ? t("models.mechanismA") : t("models.mechanismB"),
    );
    return parts.join(" · ");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── BYOK 加密提示条（原型 models.html:46-54） ── */}
      <div className="banner">
        <span className="dot dot-ok" />
        <span>
          <b>{t("models.bannerKeyTitle")}</b> — {t("models.bannerKey")}
        </span>
        <span className="spacer" />
        <span className="note">{t("models.bannerR1")}</span>
      </div>

      {/* ── 双机制说明（原型 models.html:57-71） ── */}
      <div className="stats" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="k">{t("models.mechA")}</div>
          <div
            className="s"
            style={{ marginTop: 5, color: "var(--muted)", fontSize: 11.5, lineHeight: 1.6 }}
          >
            {t("models.mechADesc")}
          </div>
        </div>
        <div className="stat">
          <div className="k">{t("models.mechB")}</div>
          <div
            className="s"
            style={{ marginTop: 5, color: "var(--muted)", fontSize: 11.5, lineHeight: 1.6 }}
          >
            {t("models.mechBDesc")}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------- left */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-bg-subtle">
        <div className="border-b border-border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            {t("models.modelsLabel")}
          </p>
          <button
            type="button"
            onClick={() => startNew(activeClass)}
            className="btn btn-primary mt-3 w-full"
          >
            {t("models.addModel")}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2" aria-label="Model classes">
          {CLASSES.map((cls) => {
            const count = byClass[cls]?.length ?? 0;
            const active = cls === activeClass;
            return (
              <div key={cls}>
                <button
                  type="button"
                  onClick={() => selectClass(cls)}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition ${
                    active
                      ? "bg-brand-subtle font-medium text-brand"
                      : "text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                  }`}
                >
                  <span>
                    {t(CLASS_META[cls].labelKey)}
                    <span className="ml-2 hidden text-[11px] font-normal text-text-tertiary lg:inline">
                      {CLASS_META[cls].hint}
                    </span>
                  </span>
                  <span className="rounded bg-bg-muted px-1.5 py-0.5 text-[11px] font-mono text-text-tertiary">
                    {count}
                  </span>
                </button>

                {active ? (
                  <ul className="border-b border-border bg-bg-muted/40 pb-2">
                    {count === 0 ? (
                      <li className="px-4 py-2 text-xs text-text-tertiary">
                        {t("models.noModelsInClass")}
                      </li>
                    ) : (
                      (byClass[cls] ?? []).map((entry) => {
                        const selectedEntry = entry.id === selectedId && !isNew;
                        return (
                          <li key={entry.id}>
                            <button
                              type="button"
                              onClick={() => selectEntry(entry)}
                              className={`flex w-full items-center gap-2 px-4 py-2 text-left transition ${
                                selectedEntry
                                  ? "bg-brand-subtle/60"
                                  : "hover:bg-bg-muted"
                              }`}
                            >
                              {/* enabled status dot */}
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  entry.enabled ? "bg-success" : "bg-text-disabled"
                                }`}
                                aria-label={entry.enabled ? "enabled" : "disabled"}
                              />
                              <span className="min-w-0 flex-1">
                                <span
                                  className={`block truncate text-sm ${
                                    selectedEntry
                                      ? "font-medium text-brand"
                                      : "text-text-secondary"
                                  }`}
                                >
                                  {entry.name}
                                </span>
                                <span className="block truncate text-[11px] text-text-tertiary">
                                  {liSub(entry)}
                                </span>
                              </span>
                              {entry.is_default ? (
                                <span className="shrink-0 rounded border border-warning/40 bg-warning-bg/40 px-1 py-px text-[10px] font-medium text-warning">
                                  {t("models.default")}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* --------------------------------------------------------- right */}
      <section className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">
        {loadError ? (
          <div className="mb-6 rounded-lg border border-error/30 bg-error-bg px-4 py-3 text-sm text-error">
            {loadError}
          </div>
        ) : null}

        <form
          onSubmit={save}
          className="mx-auto max-w-2xl rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm"
        >
          <header className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-text-primary">
                {isNew
                  ? t("models.newModel", { label: t(CLASS_META[activeClass].labelKey) })
                  : selected
                    ? selected.name
                    : t("models.modelsLabel")}
              </h1>
              <p className="mt-0.5 text-sm text-text-secondary">
                {isNew
                  ? t("models.fillDetails")
                  : selected
                    ? `${t("models.domainMeta", {
                        label: t(CLASS_META[activeClass].labelKey),
                        domain: domainOf(selected.base_url),
                      })} · ${
                        mechanismOf(selected.base_url) === "a"
                          ? t("models.mechanismA")
                          : t("models.mechanismB")
                      }`
                    : t("models.selectPrompt")}
              </p>
            </div>
            {!isNew && selected ? (
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    selected.enabled ? "bg-success" : "bg-text-disabled"
                  }`}
                  aria-hidden
                />
                <span className="text-xs text-text-secondary">
                  {selected.enabled ? t("models.enabled") : t("models.disabled")}
                </span>
              </div>
            ) : null}
          </header>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{t("models.name")}</label>
                <input
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="My-LLM"
                  spellCheck={false}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  {t("models.class")}{" "}
                  <span className="font-normal text-text-tertiary">(read-only)</span>
                </label>
                <input
                  value={t(CLASS_META[activeClass].labelKey)}
                  disabled
                  className="input bg-bg-muted/40 text-text-tertiary"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>
                {t("models.apiUrl")}{" "}
                <span className="font-normal text-text-tertiary">{t("models.apiUrlHint")}</span>
              </label>
              <input
                type="url"
                value={form.base_url}
                onChange={(e) => patch({ base_url: e.target.value })}
                placeholder="https://maas.wing-ray.cn"
                spellCheck={false}
                className={monoInputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t("models.modelName")}</label>
              <input
                value={form.model}
                onChange={(e) => patch({ model: e.target.value })}
                placeholder="DeepSeek-V4-Flash-0731"
                spellCheck={false}
                className={monoInputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                {t("models.apiKey")}{" "}
                <span className="font-normal text-text-tertiary">
                  {isNew
                    ? t("models.keyRequiredHint")
                    : t("models.keyCurrentHint", { masked: selected?.key_masked ?? "—" })}
                </span>
              </label>
              <input
                type="password"
                value={form.key}
                onChange={(e) => patch({ key: e.target.value })}
                placeholder={isNew ? t("models.keyPlaceholder") : t("models.newKeyPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                className={monoInputClass}
              />
            </div>

            {activeClass === "tts" ? (
              <div>
                <label className={labelClass}>
                  {t("models.voice")}{" "}
                  <span className="font-normal text-text-tertiary">{t("models.voiceHint")}</span>
                </label>
                <input
                  value={form.voice}
                  onChange={(e) => patch({ voice: e.target.value })}
                  placeholder={t("models.voicePlaceholder")}
                  spellCheck={false}
                  className={monoInputClass}
                />
              </div>
            ) : null}

            {/* Enabled + default row */}
            <div className="flex flex-wrap items-center gap-5 rounded-xl border border-border bg-bg-muted/40 px-4 py-3">
              {!isNew && selected ? (
                <>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={selected.enabled}
                      onClick={toggleEnabled}
                      className={`relative h-5 w-9 rounded-full transition ${
                        selected.enabled ? "bg-success" : "bg-bg-muted"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                          selected.enabled ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                    {t("models.enabled")}
                  </label>
                  {!selected.is_default ? (
                    <button
                      type="button"
                      onClick={setDefault}
                      disabled={saving}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-warning/60 hover:text-warning disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t("models.setDefault")}
                    </button>
                  ) : (
                    <span className="inline-flex items-center rounded border border-warning/40 bg-warning-bg/40 px-2.5 py-0.5 text-xs font-medium text-warning">
                      {t("models.defaultStar")}
                    </span>
                  )}
                </>
              ) : null}
            </div>
          </div>

          {savedMsg ? (
            <p className={`mt-3 text-xs ${savedIsError ? "text-error" : "text-success"}`}>
              {savedMsg}
            </p>
          ) : null}

          {/* Test result */}
          {test.message ? (
            <div
              className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                test.ok
                  ? "border-success/40 bg-success-bg/40 text-success"
                  : "border-error/40 bg-error-bg/40 text-error"
              }`}
            >
              <span className="mt-0.5 font-semibold">
                {test.ok ? t("models.testOk") : t("models.testFailed")}
              </span>
              <span className="min-w-0 break-words">{test.message}</span>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving || !form.name.trim() || !form.model.trim()}
              className="btn btn-primary"
            >
              {saving ? t("common.saving") : isNew ? t("common.create") : t("common.save")}
            </button>

            <button
              type="button"
              onClick={runTest}
              disabled={test.busy || saving}
              className="btn"
            >
              {test.busy ? t("models.testing") : t("models.testConnection")}
            </button>

            {/* TTS Preview 试听（原型 models.html:147，仅 tts 类显示） */}
            {activeClass === "tts" ? (
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewBusy || saving}
                className="btn"
              >
                {previewBusy ? t("models.previewBusy") : t("models.btnPreview")}
              </button>
            ) : null}

            {!isNew && selected ? (
              <button
                type="button"
                onClick={removeEntry}
                disabled={saving}
                className="btn btn-danger ml-auto"
              >
                {t("common.delete")}
              </button>
            ) : null}
          </div>

          {previewMsg ? (
            <div
              className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                previewMsg.ok
                  ? "border-success/40 bg-success-bg/40 text-success"
                  : "border-error/40 bg-error-bg/40 text-error"
              }`}
            >
              <span className="min-w-0 break-words">{previewMsg.text}</span>
            </div>
          ) : null}

          <audio ref={previewAudioRef} className="hidden" />
        </form>

        {/* ── 底部托管档 banner（原型 models.html:154-160） ── */}
        <div className="banner mx-auto mt-5 max-w-2xl" style={{ marginBottom: 0 }}>
          <span className="dot dot-skip" />
          <span>
            <b>{t("models.byokBannerTitle")}</b> — {t("models.byokBanner")}
          </span>
        </div>
      </section>
    </div>
  );
}
