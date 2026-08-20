"use client";

import Link from "next/link";
import { loginToTool } from "@/lib/site-data";
import { QUOTA_COST } from "@/lib/quota-costs";
import { useTranslation } from "@/i18n";

export default function PricingClient() {
  const { t } = useTranslation();

  return (
    <>
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="wrap">
          <div className="kicker">{t("station.pricing.kicker")}</div>
          <h1>
            {t("station.pricing.h1a")}
            <br />
            <em>{t("station.pricing.h1b")}</em>
          </h1>
          <p className="lede" style={{ marginTop: 20, maxWidth: "36em" }}>
            {t("station.pricing.lede")}
          </p>
          <div className="home-cta" style={{ marginTop: 24 }}>
            <Link className="btn-ink" href={loginToTool("script-to-video")}>
              {t("station.pricing.cta")}
            </Link>
            <Link className="btn-line" href="/tools/script-to-video">
              {t("station.pricing.ctaTool")}
            </Link>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">{t("station.pricing.costKicker")}</div>
            <h2>
              {t("station.pricing.costTitlea")} <em>{t("station.pricing.costTitleb")}</em>
            </h2>
          </div>
          <div className="col-r">
            <ul className="link-list">
              <li>
                <span>{t("station.pricing.script")}</span>
                <span className="ll-slug">{t("station.pricing.points", { n: QUOTA_COST.script })}</span>
              </li>
              <li>
                <span>{t("station.pricing.storyboard")}</span>
                <span className="ll-slug">
                  {t("station.pricing.points", { n: QUOTA_COST.storyboard })}
                </span>
              </li>
              <li>
                <span>{t("station.pricing.image")}</span>
                <span className="ll-slug">{t("station.pricing.points", { n: QUOTA_COST.image })}</span>
              </li>
              <li>
                <span>{t("station.pricing.tts")}</span>
                <span className="ll-slug">{t("station.pricing.points", { n: QUOTA_COST.tts })}</span>
              </li>
              <li>
                <span>{t("station.pricing.compose")}</span>
                <span className="ll-slug">{t("station.pricing.points", { n: QUOTA_COST.compose })}</span>
              </li>
              <li>
                <span>{t("station.pricing.free")}</span>
                <span className="ll-slug">{t("station.pricing.zero")}</span>
              </li>
            </ul>
            <p className="small muted" style={{ marginTop: 18 }}>
              {t("station.pricing.costNote")}
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="kicker">{t("station.pricing.soonKicker")}</div>
          <h2>{t("station.pricing.soonTitle")}</h2>
          <p className="lede" style={{ marginTop: 16, maxWidth: "40em" }}>
            {t("station.pricing.soonLede")}
          </p>
        </div>
      </section>
    </>
  );
}
