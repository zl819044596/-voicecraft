"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PRIMARY_TOOL_SLUG } from "@/lib/tools-config";
import { QUOTA_COST } from "@/lib/quota-costs";
import { useTranslation } from "@/i18n";

export default function SettingsPage() {
  const { user, freeQuota, logout } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="mb-6">
        <span className="tool-tag">{t("station.app.settingsKicker")}</span>
        <h1 className="tool-title">{t("station.app.settingsTitle")}</h1>
        <p className="tool-desc">{t("station.app.settingsLede")}</p>
      </div>

      <section className="rounded border border-border bg-bg-subtle p-4 shadow-card">
        <h2 className="text-[13px] font-semibold text-text-primary">{t("station.app.settingsAccount")}</h2>
        <p className="mt-2 text-[13px] text-text-secondary">
          {user?.nickname || t("station.app.settingsDemoUser")}
          <br />
          <span className="font-mono text-[12px] text-text-tertiary">{user?.email}</span>
        </p>
      </section>

      <section className="rounded border border-border bg-bg-subtle p-4 shadow-card">
        <h2 className="text-[13px] font-semibold text-text-primary">{t("station.app.settingsQuota")}</h2>
        {freeQuota ? (
          <p className="mt-2 text-[28px] font-mono tabular-nums text-text-primary">
            {freeQuota.remaining}
            <span className="text-[14px] text-text-tertiary"> / {freeQuota.limit}</span>
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-text-secondary">…</p>
        )}
        <p className="mt-1 text-[12px] text-text-tertiary">{t("station.app.settingsQuotaNote")}</p>
        <ul className="mt-3 space-y-1 text-[12px] text-text-secondary">
          <li>
            {t("station.app.settingsCosts", {
              script: QUOTA_COST.script,
              storyboard: QUOTA_COST.storyboard,
              image: QUOTA_COST.image,
            })}
          </li>
          <li>
            {t("station.app.settingsCosts2", {
              tts: QUOTA_COST.tts,
              compose: QUOTA_COST.compose,
            })}
          </li>
        </ul>
      </section>

      <section className="rounded border border-border border-dashed p-4 shadow-card">
        <h2 className="text-[13px] font-semibold text-text-primary">{t("station.app.settingsBilling")}</h2>
        <p className="mt-2 text-[13px] text-text-secondary">{t("station.app.settingsBillingLede")}</p>
        <Link
          className="mt-3 inline-flex text-[13px] text-[var(--app-brand)] underline-offset-2 hover:underline"
          href={`/app/tools/${PRIMARY_TOOL_SLUG}`}
        >
          {t("station.app.settingsGoCompose")}
        </Link>
      </section>

      <button
        type="button"
        className="rounded border border-border px-4 py-2 text-[13px] text-text-secondary hover:border-border-strong hover:text-text-primary"
        onClick={() => void logout()}
      >
        {t("station.app.logout")}
      </button>
    </div>
  );
}
