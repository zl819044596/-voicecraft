"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type Locale,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  isLocale,
  translate,
} from "./core";

export type { Locale } from "./core";
export { translate, isLocale, LOCALE_COOKIE, LOCALE_STORAGE_KEY } from "./core";

export type TFunc = (path: string, vars?: Record<string, string | number>) => string;

export function resolveLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (isLocale(stored)) return stored;
  const cookie = document.cookie
    .split("; ")
    .find((r) => r.startsWith(`${LOCALE_COOKIE}=`))
    ?.split("=")[1];
  if (isLocale(cookie)) return cookie;
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function persistLocale(next: Locale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
}

export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>("zh");

  useEffect(() => {
    const loc = resolveLocale();
    setLocaleState(loc);
    document.documentElement.lang = loc === "zh" ? "zh-CN" : "en";
  }, []);

  const t = useCallback<TFunc>(
    (path, vars) => translate(path, locale, vars),
    [locale],
  );

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
    window.location.reload();
  }, []);

  return { locale, t, setLocale };
}
