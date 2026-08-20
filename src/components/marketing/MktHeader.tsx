"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export default function MktHeader() {
  const pathname = usePathname() ?? "/";
  const { t } = useTranslation();
  const on = (prefix: string) =>
    prefix === "/" ? pathname === "/" : pathname.startsWith(prefix);

  return (
    <header className="mkt-header">
      <div className="mkt-header-in">
        <Link className="mkt-logo" href="/">
          <span className="mkt-logo-mark">AI</span>
          <span>AI Video Studio</span>
        </Link>
        <nav className="mkt-nav" aria-label={t("station.nav.tools")}>
          <Link href="/app" className={on("/app") ? "on" : undefined}>
            {t("station.nav.workbench")}
          </Link>
          <Link href="/tools" className={on("/tools") ? "on" : undefined}>
            {t("station.nav.tools")}
          </Link>
          <Link href="/pricing" className={on("/pricing") ? "on" : undefined}>
            {t("station.nav.pricing")}
          </Link>
        </nav>
        <span className="spacer" />
        <LocaleSwitcher />
        <Link className="btn-ink" href="/login">
          {t("station.nav.enter")}
        </Link>
      </div>
    </header>
  );
}
