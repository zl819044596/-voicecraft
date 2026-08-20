"use client";

// Task 9 — lightweight i18n (no next-intl dependency).
//
// Two locales (en / zh), dictionaries in en.json / zh.json (design-spec-v2 §7).
// The preference is persisted in localStorage under `locale`; the default
// follows navigator.language (zh → 简体中文, everything else → English).
//
// `translate(path, locale, vars)` is a pure helper so server components can
// render the default locale; `useTranslation()` is the client hook used by
// app/marketing components. `setLocale` writes the preference and reloads so
// server-rendered chrome (metadata, marketing copy) picks up the new locale.
//
// R1: the `locale` key only stores a language code — never key material.

import { useCallback, useEffect, useState } from "react";
import en from "./en.json";
import zh from "./zh.json";

export type Locale = "en" | "zh";

export const LOCALE_STORAGE_KEY = "locale";

const messages: Record<Locale, typeof en> = { en, zh };

/** Resolve the effective locale. Server render → default "en". */
export function resolveLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "en" || stored === "zh") return stored;
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

/**
 * Pure translation helper — walk a dot path through the locale dictionary and
 * substitute `{name}` placeholders. Falls back to the path itself when a key
 * is missing (so typos surface visibly instead of rendering blank).
 */
export function translate(
  path: string,
  locale: Locale,
  vars?: Record<string, string | number>,
): string {
  const keys = path.split(".");
  let value: unknown = messages[locale];
  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  if (typeof value !== "string") return path;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

/** Client hook — current locale + t() + setLocale() (persists + reloads). */
export function useTranslation() {
  // SSR default is "en" (no window) → the first client render is stable and
  // hydration-safe. After mount we read the real preference (localStorage or
  // navigator.language) so a zh user sees Chinese without a flash of English.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(resolveLocale());
  }, []);

  const t = useCallback(
    (path: string, vars?: Record<string, string | number>) =>
      translate(path, locale, vars),
    [locale],
  );
  const setLocale = useCallback((next: Locale) => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    window.location.reload();
  }, []);

  return { locale, t, setLocale };
}

export type TFunc = ReturnType<typeof useTranslation>["t"];
