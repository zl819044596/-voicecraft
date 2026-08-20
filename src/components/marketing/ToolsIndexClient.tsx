"use client";

import Link from "next/link";
import { TOOLS, SCENARIOS, loginToTool } from "@/lib/site-data";
import { useTranslation } from "@/i18n";
import { localizeTool, localizeScenario } from "@/lib/site-locale";

export default function ToolsIndexClient() {
  const { t, locale } = useTranslation();
  const tools = TOOLS.map((x) => localizeTool(x, locale));
  const scenarios = SCENARIOS.map((x) => localizeScenario(x, locale));

  return (
    <>
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="wrap">
          <div className="kicker">{locale === "zh" ? "工具导航" : "Tools"}</div>
          <h1>
            {locale === "zh" ? (
              <>
                主路径只有一条：
                <br />
                <em>一键出片</em>
              </>
            ) : (
              <>
                One main path:
                <br />
                <em>one-click compose</em>
              </>
            )}
          </h1>
          <p className="lede" style={{ marginTop: 20, maxWidth: "36em" }}>
            {locale === "zh"
              ? "其它工具是能力拆分页，方便搜索与互链。日常使用请直接进入工作台出片，或下载素材包自己剪。"
              : "Other pages are SEO splits. Day to day, open the workbench to compose — or download an asset pack."}
          </p>
          <div className="home-cta" style={{ marginTop: 24 }}>
            <Link className="btn-ink" href={loginToTool("script-to-video")}>
              {t("station.app.homeCta")}
            </Link>
            <Link className="btn-line" href="/scenarios/client-video-delivery">
              {locale === "zh" ? "看使用场景 →" : "See scenarios →"}
            </Link>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="tool-rail">
            {tools.map((tool) => (
              <Link key={tool.slug} href={`/tools/${tool.slug}`}>
                <strong>{tool.name}</strong>
                <span>{tool.description.slice(0, 64)}…</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="kicker">{locale === "zh" ? "场景" : "Scenarios"}</div>
          <h2>{locale === "zh" ? "按用途选入口" : "Pick by use case"}</h2>
          <ul className="link-list" style={{ marginTop: 20 }}>
            {scenarios.map((s) => (
              <li key={s.slug}>
                <Link href={`/scenarios/${s.slug}`}>{s.name}</Link>
                <span className="ll-slug">{s.description.slice(0, 48)}…</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
