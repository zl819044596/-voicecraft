import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  SCENARIOS,
  SCENARIO_BY_SLUG,
  TOOL_BY_SLUG,
  SITE_URL,
  loginToTool,
  type Scenario,
} from "@/lib/site-data";
import { JsonLd } from "@/components/JsonLd";
import { getRequestLocale } from "@/i18n/server";
import { localizeScenario, localizeTool } from "@/lib/site-locale";

export function generateStaticParams() {
  return SCENARIOS.map((s) => ({ slug: s.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const scenario = SCENARIO_BY_SLUG[slug];
  if (!scenario) return {};
  const locale = await getRequestLocale();
  const s = localizeScenario(scenario, locale);
  return {
    title: s.title,
    description: s.description,
    keywords: [s.keyword, "AI Video Studio"],
    alternates: { canonical: `${SITE_URL}/scenarios/${s.slug}` },
    openGraph: {
      title: s.title,
      description: s.description,
      url: `${SITE_URL}/scenarios/${s.slug}`,
      type: "article",
      locale: locale === "zh" ? "zh_CN" : "en_US",
      siteName: "AI Video Studio",
    },
  };
}

function articleJsonLd(scenario: Scenario) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: scenario.h1,
    description: scenario.description,
    about: scenario.audience,
    author: { "@type": "Organization", name: "AI Video Studio" },
    mainEntityOfPage: `${SITE_URL}/scenarios/${scenario.slug}`,
  };
}

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const base = SCENARIO_BY_SLUG[slug];
  if (!base) notFound();
  const locale = await getRequestLocale();
  const scenario = localizeScenario(base, locale);

  const [h1Head, h1Em] = scenario.h1.includes(" — ")
    ? scenario.h1.split(" — ")
    : [scenario.h1, null];
  const relatedTools = scenario.toolSlugs
    .map((s) => TOOL_BY_SLUG[s])
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => localizeTool(t, locale));
  const ctaHref = loginToTool(scenario.toolSlugs[0] ?? "script-to-video");
  const audienceLabel = locale === "zh" ? "适合：" : "For: ";
  const painKicker = locale === "zh" ? "痛点" : "Pain";
  const flowKicker = locale === "zh" ? "流程" : "Workflow";
  const deliverKicker = locale === "zh" ? "交付" : "Deliverable";
  const deliverTitle =
    locale === "zh" ? (
      <>
        成片，或 <em>素材包。</em>
      </>
    ) : (
      <>
        MP4, or an <em>asset pack.</em>
      </>
    );
  const relatedKicker = locale === "zh" ? "相关工具" : "Related tools";
  const relatedTitle = locale === "zh" ? "入口" : "Start here";

  return (
    <>
      <JsonLd data={articleJsonLd(scenario)} />

      <section className="section" style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <div className="kicker">
            {locale === "zh" ? "场景" : "Scenario"} · {scenario.name}
          </div>
          <h1>
            {h1Head}
            {h1Em ? (
              <>
                <br />
                <em>{h1Em}</em>
              </>
            ) : null}
          </h1>
          <p className="lede" style={{ marginTop: 20 }}>
            {scenario.intro}
          </p>
          <p className="small muted" style={{ marginTop: 12 }}>
            {audienceLabel}
            {scenario.audience}
          </p>
          <div className="home-cta" style={{ marginTop: 24 }}>
            <Link className="btn-ink" href={ctaHref}>
              {scenario.cta}
            </Link>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0, borderTop: "none" }}>
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">{painKicker}</div>
            <h2>
              {locale === "zh" ? (
                <>
                  为什么总在 <em>亏时间。</em>
                </>
              ) : (
                <>
                  Why this work <em>eats time.</em>
                </>
              )}
            </h2>
          </div>
          <div className="col-r">
            <ol className="num-list">
              {scenario.pains.map((s, i) => (
                <li key={s.h3}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{s.h3}</h3>
                    <p className="small muted" style={{ marginTop: 6, maxWidth: "38em" }}>
                      {s.p}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">{flowKicker}</div>
            <h2>
              {locale === "zh" ? (
                <>
                  同一条主路径， <em>每次都这样。</em>
                </>
              ) : (
                <>
                  Same main path, <em>every time.</em>
                </>
              )}
            </h2>
            <p className="lede" style={{ marginTop: 16 }}>
              {scenario.body[0]}
            </p>
          </div>
          <div className="col-r">
            <ol className="num-list">
              {scenario.workflow.map((s, i) => (
                <li key={s.h3}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>
                      {s.h3}{" "}
                      <span className="small muted">{s.tag}</span>
                    </h3>
                    <p className="small muted" style={{ marginTop: 6, maxWidth: "38em" }}>
                      {s.p}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {scenario.body.slice(1).map((para, i) => (
        <section key={i} className="section" style={{ paddingTop: 0 }}>
          <div className="wrap" style={{ maxWidth: "40em" }}>
            <p className="lede">{para}</p>
          </div>
        </section>
      ))}

      <section className="section">
        <div className="wrap">
          <div className="kicker">{deliverKicker}</div>
          <h2 style={{ maxWidth: "22em" }}>{deliverTitle}</h2>
          <div className="codeblock" style={{ marginTop: 28, maxWidth: "36em" }}>
            <span className="cm"># avs-export.zip</span>
            {`
avs-export/
├─ script.txt
├─ storyboard.json
├─ README.txt
└─ shots/
   ├─ 01/image.png · voice.mp3 · subtitle.txt
   └─ 02/…`}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">{relatedKicker}</div>
            <h2>{relatedTitle}</h2>
          </div>
          <div className="col-r">
            <ul className="link-list">
              {relatedTools.map((t) => (
                <li key={t.slug}>
                  <Link href={`/tools/${t.slug}`}>{t.name}</Link>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 24 }}>
              <Link className="btn-ink" href={ctaHref}>
                {scenario.cta}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
