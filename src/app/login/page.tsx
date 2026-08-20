"use client";

// Real authentication login (P6) — mirrors login.html.
//
// Two paths:
//   1. Email magic link: POST /api/auth/magic-link → "sent" state. The email
//      carries /login?token=ml_… → this page mounts with ?token= → POST
//      /api/auth/magic-link/verify → backend Set-Cookies the HttpOnly
//      `avs_session` → full reload to ?next= (or /app) so the proxy guard and
//      SessionProvider re-mount against the fresh cookie.
//   2. Google OAuth: POST /api/auth/google → {authorize_url} → redirect the
//      browser to Google. The authorization-code exchange + session minting
//      happen server-side (GET callback route is backend-owned).
//
// 18+ confirmation gates both paths (R5): the submit button is disabled until
// the checkbox is checked, and the backend independently rejects requests
// without age_confirmed: true.
//
// Errors come back as {error:{code,message}} and are surfaced via
// ApiRequestError; the visible message maps a few known codes to friendlier
// copy, otherwise falls back to the backend's message.

import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useTranslation } from "@/i18n";

const DEVICE_ID_KEY = "avs_device_id";

/** Stable per-browser device id — backend uses it for trial-credit dedup. */
function getDeviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `dev-${Date.now()}`;
  }
}

/** Only same-site paths — never absolute URLs (open-redirect guard). */
function safeNext(raw: string | null): string {
  const v = raw ?? "/app";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/app";
}

/** Age-confirm sentence with real ToS / Privacy links injected (prototype). */
function AgeConfirm({ text }: { text: string }) {
  const terms = "Terms of Service";
  const privacy = "Privacy Policy";
  const tIdx = text.indexOf(terms);
  const pIdx = text.indexOf(privacy, tIdx + terms.length);
  if (tIdx === -1 || pIdx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, tIdx)}
      <Link href="/terms">{terms}</Link>
      {text.slice(tIdx + terms.length, pIdx)}
      <Link href="/privacy">{privacy}</Link>
      {text.slice(pIdx + privacy.length)}
    </span>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const token = searchParams.get("token");
  const next = safeNext(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // ?token=ml_… → consume the one-time link and mint a session.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setVerifying(true);
    setError(null);
    (async () => {
      try {
        await apiFetch("/api/auth/magic-link/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, device_id: getDeviceId() }),
        });
        if (cancelled) return;
        // Full reload so the proxy guard + SessionProvider pick up the cookie.
        window.location.href = next;
      } catch (err) {
        if (cancelled) return;
        const code = err instanceof ApiRequestError ? err.code : "";
        setError(
          code === "CONFLICT"
            ? t("login.verifyReused")
            : code === "MAGIC_LINK_EXPIRED"
              ? t("login.verifyExpired")
              : t("login.verifyError"),
        );
        setVerifying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, next, t]);

  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !email.trim() || !ageConfirmed) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), age_confirmed: true }),
      });
      setSent(email.trim());
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "";
      setError(
        code === "RATE_LIMITED"
          ? t("login.rateLimited")
          : code === "BAD_REQUEST"
            ? t("login.invalidEmail")
            : code === "FORBIDDEN"
              ? t("login.required18")
              : err instanceof Error
                ? err.message
                : t("login.verifyError"),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<{ authorize_url: string }>("/api/auth/google", {
        method: "POST",
      });
      window.location.href = data.authorize_url;
    } catch {
      setError(t("login.googleError"));
      setBusy(false);
    }
  };

  return (
    <main className="login-wrap">
      <div className="kicker">{t("login.kicker")}</div>
      <h1 style={{ fontSize: 30, marginBottom: 10 }}>
        Back to the <em>workbench.</em>
      </h1>
      <p className="small muted" style={{ marginBottom: 34 }}>
        {t("login.trialHint")}
      </p>

      <div className="login-card">
        {verifying ? (
          <>
            <div className="sent-state">
              <div className="ok">{t("login.verifying")}</div>
              <p>{t("login.devConsoleHint")}</p>
            </div>
            {error ? <div className="form-err">{error}</div> : null}
            {error ? (
              <div style={{ marginTop: 14 }}>
                <Link href={`/login${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}>
                  {t("login.backToLogin")}
                </Link>
              </div>
            ) : null}
          </>
        ) : sent ? (
          <>
            <div className="sent-state">
              <div className="ok">✓ {t("login.sentOk")}</div>
              <p>{t("login.sentHint", { email: sent })}</p>
              <p>{t("login.devConsoleHint")}</p>
            </div>
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn-line" onClick={() => setSent(null)}>
                {t("login.backToLogin")}
              </button>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="btn-oauth" onClick={handleGoogle} disabled={busy}>
              <span className="g">G</span> {t("login.googleContinue")}
            </button>
            <span className="note">› 点击 → POST /api/auth/google → 跳转 Google 授权页</span>

            <div className="login-or">{t("login.orByEmail")}</div>

            <form onSubmit={handleMagicLink}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="email">{t("login.emailLabel")}</label>
                <input
                  className="input-line"
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("login.emailPlaceholder")}
                  required
                  autoComplete="email"
                />
              </div>
              <button
                type="submit"
                className="btn-ink btn-block"
                style={{ opacity: busy || !email.trim() || !ageConfirmed ? 0.45 : 1, cursor: busy || !email.trim() || !ageConfirmed ? "not-allowed" : "pointer" }}
                disabled={busy || !email.trim() || !ageConfirmed}
              >
                {busy ? t("login.sendingMagicLink") : t("login.sendMagicLink")}
              </button>
              <span className="note">› 点击 → POST /api/auth/magic-link · 会话为 HttpOnly Cookie</span>

              <div style={{ borderTop: "1px solid var(--line)", marginTop: 30, paddingTop: 18 }}>
                <label className="small" style={{ display: "flex", gap: 9, alignItems: "flex-start", color: "var(--muted)", cursor: "pointer", margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={ageConfirmed}
                    onChange={(e) => setAgeConfirmed(e.target.checked)}
                    style={{ marginTop: 3, accentColor: "var(--accent)" }}
                  />
                  <AgeConfirm text={t("login.ageConfirm")} />
                </label>
                <span className="note">› R5：未勾选 18+ 则禁用提交</span>
              </div>

              {error ? <div className="form-err">{error}</div> : null}
            </form>
          </>
        )}
      </div>

      <p className="small muted" style={{ marginTop: 34 }}>
        BYOK stays free forever — bring your own keys and nothing here is ever metered.
        Curious about managed plans? <Link href="/pricing">See pricing →</Link>
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
