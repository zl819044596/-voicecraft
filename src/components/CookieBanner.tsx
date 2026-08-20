"use client";

// Cookie consent banner (R5 / C3). Mounted in the root layout.
//
// Rules:
//  - Preference is stored ONLY under the key `cookie-consent` in localStorage.
//    This is a consent flag — it is NOT an API key and has nothing to do with
//    BYOK key storage. BYOK keys are never placed in browser storage.
//  - Non-EEA (US default): analytics are accepted by default; the banner
//    auto-accepts and closes without user interaction.
//  - EEA / GDPR: the banner is shown and analytics scripts only load after an
//    explicit Accept; Decline blocks them.
//
// The initial render is always visible so the banner is present in the
// server-rendered HTML; on mount the saved (or defaulted) choice is applied.

import { useEffect, useState } from "react";

const CONSENT_KEY = "cookie-consent";
type Consent = "accepted" | "declined";

// Heuristic region detection — good enough for a consent default. Returns true
// for EU/EEA + UK timezones or locales where the GDPR default should apply.
function isEeaRegion(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (tz.startsWith("Europe/")) return true;
  } catch {
    // fall through to language heuristic
  }
  try {
    const lang = (navigator.language || "").toLowerCase();
    const eeaLangPrefixes = [
      "de", "fr", "it", "es", "nl", "pl", "pt", "sv", "da", "fi",
      "no", "el", "cs", "hu", "ro", "bg", "hr", "sk", "sl", "et", "lv", "lt",
      "mt", "ga", "is",
    ];
    const code = lang.split("-")[0];
    return eeaLangPrefixes.includes(code);
  } catch {
    return false;
  }
}

// Hook point for future analytics. If GA4 / Clarity snippets are added later,
// they should load only when this returns "accepted".
export function getConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CONSENT_KEY);
  return raw === "accepted" || raw === "declined" ? raw : null;
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem(CONSENT_KEY);

    if (saved === "accepted" || saved === "declined") {
      setVisible(false);
      return;
    }

    // No saved choice: US/non-EEA default = accept silently and close.
    if (!isEeaRegion()) {
      window.localStorage.setItem(CONSENT_KEY, "accepted");
      setVisible(false);
      return;
    }

    // EEA visitor: keep the banner visible and wait for an explicit choice.
    setVisible(true);
  }, []);

  const choose = (choice: Consent) => {
    window.localStorage.setItem(CONSENT_KEY, choice);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg-subtle p-4"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-5 text-text-secondary">
          We use cookies to keep you signed in and to understand how the
          product is used. Analytics (GA4 / Clarity) are optional and can be
          declined.
          <a
            href="/cookies"
            className="ml-1 underline underline-offset-2 hover:text-text-primary"
          >
            Learn more
          </a>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => choose("declined")}
            className="whitespace-nowrap rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-text-secondary transition hover:border-brand/50 hover:text-text-primary"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="whitespace-nowrap rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-hover"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
