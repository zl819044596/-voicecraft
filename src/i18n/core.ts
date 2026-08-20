import en from "./en.json";
import zh from "./zh.json";
import stationEn from "./station-en.json";
import stationZh from "./station-zh.json";

export type Locale = "en" | "zh";

export const LOCALE_STORAGE_KEY = "locale";
export const LOCALE_COOKIE = "avs_locale";

type Dict = Record<string, unknown>;

const messages: Record<Locale, Dict> = {
  en: { ...(en as Dict), station: stationEn as Dict },
  zh: { ...(zh as Dict), station: stationZh as Dict },
};

export function isLocale(v: string | null | undefined): v is Locale {
  return v === "en" || v === "zh";
}

export function translate(
  path: string,
  locale: Locale,
  vars?: Record<string, string | number>,
): string {
  const keys = path.split(".");
  let value: unknown = messages[locale];
  let missed = false;
  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      missed = true;
      break;
    }
  }
  if (missed || typeof value !== "string") {
    let fb: unknown = messages[locale === "zh" ? "en" : "zh"];
    for (const key of keys) {
      if (fb && typeof fb === "object" && key in fb) {
        fb = (fb as Record<string, unknown>)[key];
      } else {
        return path;
      }
    }
    if (typeof fb !== "string") return path;
    value = fb;
  }
  if (!vars) return value as string;
  return (value as string).replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}
