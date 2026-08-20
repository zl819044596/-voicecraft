"use client";

import { useTranslation, type Locale } from "@/i18n";

export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useTranslation();

  const pick = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
  };

  return (
    <div className={`locale-switch ${className}`} role="group" aria-label={t("station.lang.switch")}>
      <button
        type="button"
        className={locale === "zh" ? "on" : undefined}
        onClick={() => pick("zh")}
      >
        {t("station.lang.zh")}
      </button>
      <button
        type="button"
        className={locale === "en" ? "on" : undefined}
        onClick={() => pick("en")}
      >
        {t("station.lang.en")}
      </button>
    </div>
  );
}
