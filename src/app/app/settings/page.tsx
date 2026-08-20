"use client";

// PIPELINE_TASK_12 — 系统设置 (/app/settings), restored from the static
// prototype pages/settings.html. The audit marked the previous implementation
// as ❌ (it hosted model-config CRUD — that content now lives on /app/models).
//
// This page is a four-panel settings area with a left nav:
//   General  → 个人资料 Profile · 凭证管理 API Keys · 偏好 Preferences
//   Account  → 隐私与数据 GDPR (red)
//
// Data:
//   Profile     → GET /api/auth/me (nickname / email / tier / age_confirmed)
//                 + PUT /api/account/profile  {nickname} for Save profile
//   API Keys    → GET/POST/DELETE /api/credentials (key_masked only, R1)
//   Preferences → interface language via i18n setLocale + PUT profile {locale}
//                 content language persisted in localStorage (no backend column)
//   GDPR        → GET /api/account/export (zip) + DELETE /api/account

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, apiRaw } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "@/i18n";
import {
  Badge,
  Btn,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/app/proto";

const CONTENT_LANGUAGE_KEY = "avs_content_language";
const CRED_PROVIDERS = ["llm", "image", "tts", "i2v"];

type Panel = "profile" | "keys" | "preferences" | "gdpr";

type Credential = {
  id: string;
  provider: string;
  label: string;
  key_masked: string;
  base_url: string | null;
  status: string;
  created_at: string;
};

const NAV_GROUPS: Array<{
  groupKey: string;
  items: Array<{ key: Panel; labelKey: string; danger?: boolean }>;
}> = [
  {
    groupKey: "settings.groupGeneral",
    items: [
      { key: "profile", labelKey: "settings.profileNav" },
      { key: "keys", labelKey: "settings.credentialsNav" },
      { key: "preferences", labelKey: "settings.preferencesNav" },
    ],
  },
  {
    groupKey: "settings.groupAccount",
    items: [{ key: "gdpr", labelKey: "settings.gdprNav", danger: true }],
  },
];

export default function SettingsPage() {
  const { t, locale, setLocale } = useTranslation();
  const { user, subscription, refresh } = useAuth();

  const [panel, setPanel] = useState<Panel>("profile");

  // ---- Profile panel ----
  const [nickname, setNickname] = useState("");
  const [profileMsg, setProfileMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // ---- API Keys panel ----
  const [creds, setCreds] = useState<Credential[] | null>(null);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [credProvider, setCredProvider] = useState("llm");
  const [credLabel, setCredLabel] = useState("");
  const [credKey, setCredKey] = useState("");
  const [credMsg, setCredMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [addingCred, setAddingCred] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ---- Preferences ----
  const [contentLang, setContentLang] = useState<string>("en");

  // ---- GDPR ----
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  // Hydrate editable state from auth context.
  useEffect(() => {
    setNickname(user?.nickname ?? "");
  }, [user]);

  useEffect(() => {
    setContentLang(window.localStorage.getItem(CONTENT_LANGUAGE_KEY) ?? "en");
  }, []);

  const loadCreds = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: Credential[] }>("/api/credentials", {
        cache: "no-store",
      });
      setCreds(data.items);
      setCredsError(null);
    } catch {
      setCreds([]);
      setCredsError(t("benchmarks.loadError"));
    }
  }, [t]);

  useEffect(() => {
    if (panel === "keys") void loadCreds();
  }, [panel, loadCreds]);

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await apiFetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      await refresh();
      setProfileMsg({ text: t("settings.profileSaved") });
    } catch (err) {
      setProfileMsg({
        text: t("settings.profileSaveFailed", {
          msg: err instanceof Error ? err.message : "error",
        }),
        error: true,
      });
    } finally {
      setSavingProfile(false);
    }
  };

  // ---------------------------------------------------------------------------
  // API Keys
  // ---------------------------------------------------------------------------
  const addCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingCred) return;
    if (!credLabel.trim() || !credKey.trim()) return;
    setAddingCred(true);
    setCredMsg(null);
    try {
      await apiFetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: credProvider,
          provider_class: credProvider,
          label: credLabel.trim(),
          key: credKey.trim(),
        }),
      });
      setCredLabel("");
      setCredKey("");
      await loadCreds();
    } catch (err) {
      setCredMsg({
        text: t("settings.addFailed", {
          msg: err instanceof Error ? err.message : "error",
        }),
        error: true,
      });
    } finally {
      setAddingCred(false);
    }
  };

  const deleteCredential = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setCredMsg(null);
    try {
      await apiFetch(`/api/credentials/${encodeURIComponent(id)}`, { method: "DELETE" });
      setConfirmDeleteId(null);
      await loadCreds();
    } catch (err) {
      setCredMsg({
        text: t("settings.deleteFailed", {
          msg: err instanceof Error ? err.message : "error",
        }),
        error: true,
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Preferences
  // ---------------------------------------------------------------------------
  const changeInterfaceLanguage = async (next: "en" | "zh") => {
    // Best-effort persist to users.locale, then the i18n setLocale reload applies
    // the new UI language site-wide.
    try {
      await apiFetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      await refresh();
    } catch {
      /* UI language still switches client-side even if the backend call fails */
    }
    setLocale(next);
  };

  const changeContentLanguage = (next: string) => {
    setContentLang(next);
    window.localStorage.setItem(CONTENT_LANGUAGE_KEY, next);
  };

  // ---------------------------------------------------------------------------
  // GDPR
  // ---------------------------------------------------------------------------
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportMsg(null);
    setExportErr(null);
    try {
      const res = await apiRaw("/api/account/export");
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (body?.error?.message) msg = body.error.message;
        } catch {
          /* non-JSON error body */
        }
        setExportErr(msg);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="?([^";]+)"?/.exec(cd);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m ? m[1] : "avs-gdpr-export.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMsg(t("settings.exportDone"));
    } catch (err) {
      setExportErr(err instanceof Error ? err.message : "error");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (deleting || !user) return;
    setDeleting(true);
    setDeleteErr(null);
    try {
      await apiFetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_email: confirmEmail.trim() }),
      });
      window.location.href = "/";
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : "error");
      setDeleting(false);
    }
  };

  const planName = subscription?.plan ?? user?.tier ?? "free";
  const planActive = subscription?.status === "active";

  return (
    <div className="mx-auto w-full">
      <PageHeader title={t("settings.pageTitle")} subtitle={t("settings.pageSub")} />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[212px_1fr]">
        {/* ─────────────────────────── 左：设置分组 ─────────────────────────── */}
        <Card className="p-2 lg:sticky lg:top-20">
          {NAV_GROUPS.map((group) => (
            <div key={group.groupKey}>
              <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                {t(group.groupKey)}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPanel(item.key)}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border-l-[3px] px-3 py-2 text-left text-[13px] transition ${
                    panel === item.key
                      ? "border-brand bg-brand-subtle font-semibold text-text-primary"
                      : "border-transparent text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                  } ${item.danger && panel !== item.key ? "!text-error" : ""}`}
                >
                  <span
                    className={item.danger && panel !== item.key ? "text-error" : "text-text-secondary"}
                  >
                    {t(item.labelKey)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </Card>

        {/* ─────────────────────────── 右：面板区 ─────────────────────────── */}
        <div className="min-w-0">
          {panel === "profile" ? (
            <Card>
              <div className="mb-4 border-b border-border pb-3">
                <div className="text-[15px] font-bold text-text-primary">
                  {t("settings.profileTitle")}
                </div>
              </div>
              <form onSubmit={saveProfile}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("settings.nickname")}>
                    <Input
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      maxLength={120}
                      placeholder={t("settings.nickname")}
                    />
                  </Field>
                  <Field label={t("settings.email")}>
                    <Input value={user?.email ?? "—"} disabled readOnly />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("settings.planLabel")}>
                    <div className="flex h-[32px] items-center gap-3 text-sm">
                      <span className="font-semibold text-text-primary">{planName}</span>
                      {planActive ? (
                        <Badge variant="green" dot>
                          {t("settings.planActive")}
                        </Badge>
                      ) : (
                        <Badge variant="gray">{planName}</Badge>
                      )}
                      <Link
                        href="/app/billing"
                        className="text-[12px] font-semibold text-brand hover:brightness-110"
                      >
                        {t("settings.manageSubscriptionTitle")} →
                      </Link>
                    </div>
                  </Field>
                  <Field label={t("settings.ageConfirmed")}>
                    <div className="flex h-[32px] items-center gap-3 text-sm">
                      <Badge variant="green" dot>
                        {t("settings.ageConfirmedBadge")}
                      </Badge>
                      <span className="text-xs text-text-tertiary">
                        {t("settings.ageConfirmedNote")}
                      </span>
                    </div>
                  </Field>
                </div>
                <hr className="my-4 border-border" />
                {profileMsg ? (
                  <p
                    className={`mb-3 text-xs ${profileMsg.error ? "text-error" : "text-success"}`}
                  >
                    {profileMsg.text}
                  </p>
                ) : null}
                <Btn type="submit" variant="primary" disabled={savingProfile}>
                  {savingProfile ? t("common.saving") : t("settings.saveProfile")}
                </Btn>
              </form>
            </Card>
          ) : null}

          {panel === "keys" ? (
            <Card>
              <div className="mb-4 border-b border-border pb-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="text-[15px] font-bold text-text-primary">
                    {t("settings.credentialsNav")}
                  </div>
                  <span className="text-[11px] text-text-tertiary">{t("settings.credentialsMeta")}</span>
                  <span className="ml-auto text-[11px] text-text-tertiary">
                    {t("settings.credentialsApiNote")}
                  </span>
                </div>
              </div>

              {credsError ? (
                <div className="mb-4 rounded-lg border border-error/30 bg-error-bg px-3 py-2 text-sm text-error">
                  {credsError}
                </div>
              ) : null}
              {credMsg ? (
                <p className={`mb-3 text-xs ${credMsg.error ? "text-error" : "text-success"}`}>
                  {credMsg.text}
                </p>
              ) : null}

              {/* 凭证表 */}
              {creds === null ? (
                <div className="py-8 text-center text-sm text-text-secondary">
                  {t("common.loading")}
                </div>
              ) : creds.length === 0 ? (
                <div className="py-8 text-center text-sm text-text-secondary">
                  {t("credentials.empty")}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[13.5px]">
                    <thead>
                      <tr>
                        {[
                          t("credentials.label"),
                          t("credentials.provider"),
                          t("credentials.maskedKey"),
                          t("credentials.status"),
                          "",
                        ].map((c, i) => (
                          <th
                            key={i}
                            className="whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-xs font-semibold text-text-secondary"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {creds.map((c) => (
                        <tr key={c.id} className="transition hover:bg-brand-subtle">
                          <td className="border-b border-border px-3 py-3 font-semibold text-text-primary">
                            {c.label}
                          </td>
                          <td className="border-b border-border px-3 py-3 text-[12.5px] text-text-secondary">
                            {c.provider}
                          </td>
                          <td className="border-b border-border px-3 py-3 font-mono text-[12px] text-text-secondary">
                            {c.key_masked}
                          </td>
                          <td className="border-b border-border px-3 py-3">
                            {c.status === "active" ? (
                              <Badge variant="green" dot>
                                {c.status}
                              </Badge>
                            ) : (
                              <Badge variant="gray" dot>
                                {c.status}
                              </Badge>
                            )}
                          </td>
                          <td className="border-b border-border px-3 py-3">
                            <button
                              type="button"
                              onClick={() => void deleteCredential(c.id)}
                              className="cursor-pointer select-none text-[12px] font-semibold text-error hover:brightness-110"
                            >
                              {confirmDeleteId === c.id
                                ? t("settings.confirmDelete")
                                : t("credentials.delete")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 新增凭证 */}
              <form onSubmit={addCredential} className="mt-4 border-t border-border pt-4">
                <div className="mb-3 text-[13px] font-semibold text-text-primary">
                  {t("settings.addCredential")}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("settings.providerCategory")}>
                    <Select value={credProvider} onChange={(e) => setCredProvider(e.target.value)}>
                      {CRED_PROVIDERS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t("credentials.label")}>
                    <Input
                      value={credLabel}
                      onChange={(e) => setCredLabel(e.target.value)}
                      placeholder={t("credentials.labelPlaceholder")}
                    />
                  </Field>
                </div>
                <Field label={t("credentials.keyLabel")}>
                  <Input
                    type="password"
                    value={credKey}
                    onChange={(e) => setCredKey(e.target.value)}
                    placeholder={t("credentials.keyPlaceholder")}
                    autoComplete="new-password"
                  />
                </Field>
                <Btn
                  type="submit"
                  variant="primary"
                  disabled={addingCred || !credLabel.trim() || !credKey.trim()}
                >
                  {addingCred ? t("common.saving") : t("credentials.addBtn")}
                </Btn>
              </form>
            </Card>
          ) : null}

          {panel === "preferences" ? (
            <Card>
              <div className="mb-4 border-b border-border pb-3">
                <div className="text-[15px] font-bold text-text-primary">
                  {t("settings.preferencesTitle")}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("settings.interfaceLanguage")}
                  hint={t("settings.interfaceLanguageHint")}
                >
                  <Select
                    value={locale}
                    onChange={(e) => void changeInterfaceLanguage(e.target.value as "en" | "zh")}
                  >
                    <option value="en">{t("settings.languageEn")}</option>
                    <option value="zh">{t("settings.languageZh")}</option>
                  </Select>
                </Field>
                <Field label={t("settings.contentLanguage")} hint={t("settings.contentLanguageNote")}>
                  <Select
                    value={contentLang}
                    onChange={(e) => changeContentLanguage(e.target.value)}
                  >
                    <option value="en">{t("settings.languageEn")}</option>
                    <option value="zh">{t("settings.languageZh")}</option>
                  </Select>
                </Field>
              </div>
              <p className="mt-2 text-[11.5px] text-text-tertiary">{t("settings.localeNote")}</p>
            </Card>
          ) : null}

          {panel === "gdpr" ? (
            <Card className="border-error/30">
              <div className="mb-4 border-b border-border pb-3">
                <div className="text-[15px] font-bold text-error">{t("settings.gdprTitle")}</div>
                <div className="mt-0.5 text-[11px] text-text-tertiary">{t("settings.gdprNote")}</div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* 导出 */}
                <div className="rounded-lg border border-border p-4">
                  <div className="text-sm font-semibold text-text-primary">
                    {t("settings.gdprExport")}
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">{t("settings.exportHint")}</p>
                  <div className="mt-3">
                    <Btn variant="default" size="sm" disabled={exporting} onClick={handleExport}>
                      {exporting ? t("common.saving") : t("settings.gdprExport")}
                    </Btn>
                  </div>
                  {exportMsg ? <p className="mt-2 text-xs text-success">{exportMsg}</p> : null}
                  {exportErr ? <p className="mt-2 text-xs text-error">{exportErr}</p> : null}
                </div>

                {/* 删除账号 */}
                <div className="rounded-lg border border-error/30 p-4">
                  <div className="text-sm font-semibold text-error">
                    {t("settings.deleteAccount")}
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">{t("settings.deleteConfirm")}</p>
                  <p className="mt-1 text-xs text-text-tertiary">{t("settings.gdprDeleteNote")}</p>
                  <Input
                    value={confirmEmail}
                    onChange={(e) => {
                      setConfirmEmail(e.target.value);
                      setDeleteErr(null);
                    }}
                    placeholder={t("settings.deleteTypeEmail")}
                    spellCheck={false}
                    className="mt-3"
                  />
                  <div className="mt-3">
                    <Btn
                      variant="danger"
                      size="sm"
                      disabled={deleting || !user?.email || confirmEmail.trim() !== user.email}
                      onClick={handleDelete}
                    >
                      {deleting ? t("common.saving") : t("settings.gdprDelete")}
                    </Btn>
                  </div>
                  {deleteErr ? <p className="mt-2 text-xs text-error">{deleteErr}</p> : null}
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
