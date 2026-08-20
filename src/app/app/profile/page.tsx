"use client";

// PIPELINE_TASK_12 — 个人资料 (/app/profile), aligned to the settings.html
// Profile panel (Nickname / Email read-only / Plan tier + manage link /
// Age confirmed / Save profile). The audit flagged the previous page for fake
// values (138****8888, 星球 —) and a demo-only "账户与安全" card — both removed.
//
// Save profile calls PUT /api/account/profile (minimal endpoint added for the
// Settings page); the whole page is a mirror of the Settings Profile panel so
// users reaching /app/profile directly get the same form.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "@/i18n";
import { apiFetch } from "@/lib/api-client";
import { Badge, Btn, Card, Field, Input, PageHeader } from "@/components/app/proto";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, subscription, logout, refresh } = useAuth();
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    setNickname(user?.nickname ?? "");
  }, [user]);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      await refresh();
      setMsg({ text: t("settings.profileSaved") });
    } catch (err) {
      setMsg({
        text: t("settings.profileSaveFailed", {
          msg: err instanceof Error ? err.message : "error",
        }),
        error: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const planName = subscription?.plan ?? user?.tier ?? "free";
  const planActive = subscription?.status === "active";
  const initial = (user?.nickname || user?.email || "A").slice(0, 1).toUpperCase();

  return (
    <div className="mx-auto w-full">
      <PageHeader title={t("profile.pageTitle")} />

      <div className="grid max-w-3xl grid-cols-1 gap-4">
        <Card>
          {/* 头像 + 邮箱标识 */}
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-subtle text-xl font-extrabold text-brand">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-bold text-text-primary">
                {user?.nickname || user?.email || "—"}
              </div>
              <div className="mt-0.5 truncate text-xs text-text-secondary">{user?.email ?? "—"}</div>
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
            {msg ? (
              <p className={`mb-3 text-xs ${msg.error ? "text-error" : "text-success"}`}>
                {msg.text}
              </p>
            ) : null}
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? t("common.saving") : t("settings.saveProfile")}
            </Btn>
          </form>
        </Card>

        {/* 退出登录 */}
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-error/10 text-base">
              ⏻
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-text-primary">
                {t("profile.logoutCard")}
              </div>
              <div className="mt-0.5 text-[12.5px] text-text-secondary">
                {t("profile.logoutDesc")}
              </div>
            </div>
            <Btn variant="danger" onClick={handleLogout}>
              {t("profile.logout")}
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}
