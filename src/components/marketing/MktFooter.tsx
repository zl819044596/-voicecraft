"use client";

import Link from "next/link";
import { useTranslation } from "@/i18n";

export default function MktFooter() {
  const { t } = useTranslation();
  return (
    <footer className="mkt-footer">
      <p className="foot-stmt__line">{t("station.nav.footerLine")}</p>
      <div className="foot-stmt__meta">
        <span>
          <Link href="/">{t("station.nav.home")}</Link>
          <Link href="/tools">{t("station.nav.tools")}</Link>
          <Link href="/tools/script-to-video">{t("station.nav.oneClick")}</Link>
          <Link href="/pricing">{t("station.nav.pricing")}</Link>
          <Link href="/privacy">{t("station.nav.privacy")}</Link>
          <Link href="/terms">{t("station.nav.terms")}</Link>
        </span>
        <span>© {new Date().getFullYear()} AI Video Studio</span>
      </div>
    </footer>
  );
}
