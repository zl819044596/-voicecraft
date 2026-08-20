"use client";

import Link from "next/link";
import { useTranslation } from "@/i18n";

export default function MktFooter() {
  const { t } = useTranslation();
  return (
    <footer className="mkt-footer" style={{ borderTop: "1px solid var(--color-rule)" }}>
      <div
        className="mkt-footer-in"
        style={{
          maxWidth: "var(--content-max)",
          margin: "0 auto",
          padding: "3rem var(--page-gutter) 2rem",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) repeat(3, minmax(0, 1fr))",
            gap: "2rem",
          }}
        >
          <div>
            <div className="mkt-logo" style={{ marginBottom: "0.85rem" }}>
              <span className="mkt-logo-mark">AI</span>
              <span>AI Video Studio</span>
            </div>
            <p className="small muted" style={{ maxWidth: "26em" }}>
              {t("station.nav.footerLine")}
            </p>
          </div>
          <div>
            <div className="kicker" style={{ marginBottom: "0.85rem" }}>
              {t("station.nav.tools")}
            </div>
            <ul style={{ listStyle: "none", display: "grid", gap: "0.55rem" }}>
              <li>
                <Link href="/app" className="small muted">
                  {t("station.nav.workbench")}
                </Link>
              </li>
              <li>
                <Link href="/tools" className="small muted">
                  {t("station.nav.tools")}
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="small muted">
                  {t("station.nav.pricing")}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="kicker" style={{ marginBottom: "0.85rem" }}>
              {t("station.nav.oneClick")}
            </div>
            <ul style={{ listStyle: "none", display: "grid", gap: "0.55rem" }}>
              <li>
                <Link href="/tools/script-to-video" className="small muted">
                  {t("station.nav.oneClick")}
                </Link>
              </li>
              <li>
                <Link href="/tools/storyboard-generator" className="small muted">
                  {t("station.nav.tools")}
                </Link>
              </li>
              <li>
                <Link href="/tools" className="small muted">
                  {t("station.nav.home")}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="kicker" style={{ marginBottom: "0.85rem" }}>
              {t("station.nav.privacy")}
            </div>
            <ul style={{ listStyle: "none", display: "grid", gap: "0.55rem" }}>
              <li>
                <Link href="/privacy" className="small muted">
                  {t("station.nav.privacy")}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="small muted">
                  {t("station.nav.terms")}
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="small muted">
                  {t("station.nav.privacy")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            marginTop: "2.5rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid var(--color-rule)",
            fontSize: "12.5px",
            color: "var(--color-ink-3)",
          }}
        >
          <span>© {new Date().getFullYear()} AI Video Studio</span>
          <span>{t("station.nav.footerLine")}</span>
        </div>
      </div>
    </footer>
  );
}
