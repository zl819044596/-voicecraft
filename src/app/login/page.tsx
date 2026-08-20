"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { PRIMARY_TOOL_SLUG } from "@/lib/tools-config";
import { useTranslation } from "@/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

function safeNext(raw: string | null): string {
  const fallback = `/app/tools/${PRIMARY_TOOL_SLUG}`;
  const v = raw ?? fallback;
  return v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}

function LoginForm() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFakeLogin = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/fake-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "demo@aivideostudio.app", name: "Demo" }),
      });
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  };

  return (
    <main className="login-wrap">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <LocaleSwitcher />
      </div>
      <p className="kicker">{t("station.login.kicker")}</p>
      <h1>
        {t("station.login.h1a")} <span className="mark">{t("station.login.h1b")}</span>
      </h1>
      <p className="lede" style={{ marginTop: 14 }}>
        {t("station.login.lede")}
      </p>

      <div className="login-card">
        <button
          type="button"
          className="btn-ink btn-block"
          onClick={handleFakeLogin}
          disabled={busy}
        >
          {busy ? t("station.login.ctaBusy") : t("station.login.cta")}
        </button>
        <span className="note">{t("station.login.note")}</span>

        <div className="login-or">{t("station.login.or")}</div>
        <button type="button" className="btn-oauth" disabled style={{ opacity: 0.4 }}>
          <span className="g">G</span> {t("station.login.google")}
        </button>

        {error ? <div className="form-err">{error}</div> : null}
      </div>

      <p className="small muted" style={{ marginTop: 28 }}>
        <Link href="/">{t("station.login.home")}</Link>
        {" · "}
        <Link href="/pricing">{t("station.login.pricing")}</Link>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
