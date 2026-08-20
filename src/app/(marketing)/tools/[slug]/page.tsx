import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  TOOLS,
  TOOL_BY_SLUG,
  PIPELINE_STEPS,
  SITE_URL,
  loginToTool,
  type Tool,
} from "@/lib/site-data";
import { JsonLd } from "@/components/JsonLd";
import { getRequestLocale } from "@/i18n/server";
import { localizeTool } from "@/lib/site-locale";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const base = TOOL_BY_SLUG[slug];
  if (!base) return {};
  const locale = await getRequestLocale();
  const tool = localizeTool(base, locale);
  return {
    title: tool.title,
    description: tool.description,
    keywords: [tool.keyword, "AI Video Studio"],
    alternates: {
      canonical: `${SITE_URL}/tools/${tool.slug}`,
      languages: { "zh-CN": `${SITE_URL}/tools/${tool.slug}`, en: `${SITE_URL}/tools/${tool.slug}` },
    },
    openGraph: {
      title: tool.title,
      description: tool.description,
      url: `${SITE_URL}/tools/${tool.slug}`,
      type: "website",
      locale: locale === "zh" ? "zh_CN" : "en_US",
      siteName: "AI Video Studio",
    },
  };
}

function softwareApplicationJsonLd(tool: Tool) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.name,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    description: tool.description,
    url: `${SITE_URL}/tools/${tool.slug}`,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "CNY",
      description: "演示登录，每日免费额度",
    },
  };
}

function howToJsonLd(tool: Tool) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `如何使用${tool.name}`,
    description: tool.intro,
    step: tool.steps.map((n, i) => {
      const s = PIPELINE_STEPS.find((p) => p.n === n);
      return {
        "@type": "HowToStep",
        position: i + 1,
        name: s?.name ?? `步骤 ${n}`,
        text: s?.detail ?? "",
      };
    }),
  };
}

function faqJsonLd(tool: Tool) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: tool.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const base = TOOL_BY_SLUG[slug];
  if (!base) notFound();
  const locale = await getRequestLocale();
  const tool = localizeTool(base, locale);

  const [h1Head, h1Em] = tool.h1.includes(" — ")
    ? tool.h1.split(" — ")
    : [tool.h1, null];
  const steps = tool.steps
    .map((n) => PIPELINE_STEPS.find((p) => p.n === n))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const related = tool.related
    .map((s) => TOOL_BY_SLUG[s])
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => localizeTool(t, locale));
  const ctaHref = loginToTool(tool.slug);

  const howKicker = locale === "zh" ? "怎么用" : "How it works";
  const howTitle =
    locale === "zh" ? (
      <>
        跟着主流程 <em>走完。</em>
      </>
    ) : (
      <>
        Follow the <em>main flow.</em>
      </>
    );
  const faqKicker = locale === "zh" ? "常见问题" : "FAQ";
  const faqTitle =
    locale === "zh" ? (
      <>
        先看这些 <em>就够。</em>
      </>
    ) : (
      <>
        Quick <em>answers.</em>
      </>
    );
  const relatedKicker = locale === "zh" ? "相关工具" : "Related";
  const relatedTitle =
    locale === "zh" ? (
      <>
        继续 <em>了解。</em>
      </>
    ) : (
      <>
        Keep <em>exploring.</em>
      </>
    );
  const freeLabel = locale === "zh" ? "免费" : "Free";
  const freeTitle = locale === "zh" ? "演示登录 · 每日额度" : "Demo login · daily quota";
  const freeLede =
    locale === "zh"
      ? "先跑通「一键出片」与素材包，付费稍后上线。"
      : "Validate compose + asset packs first. Billing comes later.";
  const dualLabel = locale === "zh" ? "双出口" : "Two exits";
  const dualTitle = locale === "zh" ? "成片 MP4 或素材 ZIP" : "MP4 cut or asset ZIP";
  const dualLede =
    locale === "zh"
      ? "能发就下载成片；要精修就带走图片、配音与字幕，进剪映自己剪。"
      : "Ship the MP4 — or take images, voice, and captions into CapCut.";
  const packLink = locale === "zh" ? "了解素材包 →" : "About asset packs →";
  const allTools = locale === "zh" ? "全部工具 →" : "All tools →";

  return (
    <>
      <JsonLd data={softwareApplicationJsonLd(tool)} />
      <JsonLd data={howToJsonLd(tool)} />
      <JsonLd data={faqJsonLd(tool)} />

      <section className="section" style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <div className="kicker">
            {locale === "zh" ? "工具" : "Tools"} · {tool.name}
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
            {tool.intro}
          </p>
          <div className="home-cta" style={{ marginTop: 24 }}>
            <Link className="btn-ink" href={ctaHref}>
              {tool.cta}
            </Link>
            <Link className="btn-line" href="/tools">
              {allTools}
            </Link>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0, borderTop: "none" }}>
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">{howKicker}</div>
            <h2>{howTitle}</h2>
            <p className="lede" style={{ marginTop: 16 }}>
              {tool.body[0]}
            </p>
            <ul style={{ marginTop: 16, paddingLeft: "1.2em", color: "var(--muted)", fontSize: 14 }}>
              {tool.highlight.map((h) => (
                <li key={h} style={{ marginBottom: 6 }}>
                  {h}
                </li>
              ))}
            </ul>
          </div>
          <div className="col-r">
            <ol className="num-list">
              {steps.map((s, i) => (
                <li key={s.n}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{locale === "en" ? enStepName(s.n) : s.name}</h3>
                    <p className="small muted" style={{ marginTop: 6, maxWidth: "38em" }}>
                      {locale === "en" ? enStepDetail(s.n) : s.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {tool.body.slice(1).map((para, i) => (
        <section key={i} className="section" style={{ paddingTop: i === 0 ? 0 : undefined }}>
          <div className="wrap" style={{ maxWidth: "40em" }}>
            <p className="lede">{para}</p>
          </div>
        </section>
      ))}

      <section className="section">
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">{faqKicker}</div>
            <h2>{faqTitle}</h2>
          </div>
          <div className="col-r">
            {tool.faq.map((f) => (
              <div className="faq-item" key={f.q}>
                <div className="q">{f.q}</div>
                <p className="a">{f.a}</p>
              </div>
            ))}
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
              {related.map((t) => (
                <li key={t.slug}>
                  <Link href={`/tools/${t.slug}`}>{t.name}</Link>
                  <span className="ll-slug">/tools/{t.slug}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap cols cols-5-7">
          <div className="col-l">
            <div className="figure">{freeLabel}</div>
            <h3 style={{ marginTop: 10 }}>{freeTitle}</h3>
            <p className="small muted" style={{ margin: "6px 0 18px", maxWidth: "24em" }}>
              {freeLede}
            </p>
            <Link className="btn-ink" href={ctaHref}>
              {tool.cta}
            </Link>
          </div>
          <div className="col-r">
            <div className="figure">{dualLabel}</div>
            <h3 style={{ marginTop: 10 }}>{dualTitle}</h3>
            <p className="small muted" style={{ margin: "6px 0 18px", maxWidth: "32em" }}>
              {dualLede}
            </p>
            <Link className="btn-line" href="/tools/video-export-zip">
              {packLink}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function enStepName(n: number): string {
  const map: Record<number, string> = {
    1: "Write script or one-line direction",
    2: "Generate editable storyboard",
    3: "Review each frame",
    4: "Voice & captions",
    5: "Compose MP4",
    6: "Or download asset pack",
  };
  return map[n] ?? `Step ${n}`;
}

function enStepDetail(n: number): string {
  const map: Record<number, string> = {
    1: "Paste narration, rewrite from a reference, or start from one line.",
    2: "AI splits 4–8 shots with titles, narration, captions, and image prompts.",
    3: "Retry art, pull stock, or upload — change one shot without rerunning everything.",
    4: "Per-shot TTS; captions follow narration.",
    5: "FFmpeg stitches stills, voice, and captions — no generative video model.",
    6: "ZIP with images, voice.mp3, captions, storyboard.json for CapCut / Jianying.",
  };
  return map[n] ?? "";
}
