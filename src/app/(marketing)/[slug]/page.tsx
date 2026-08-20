import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PROGRAMMATIC_PAGES,
  PROGRAMMATIC_BY_SLUG,
  TOOL_BY_SLUG,
  SITE_URL,
  loginToTool,
} from "@/lib/site-data";
import { JsonLd } from "@/components/JsonLd";

export function generateStaticParams() {
  return PROGRAMMATIC_PAGES.map((p) => ({ slug: p.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = PROGRAMMATIC_BY_SLUG[slug];
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    keywords: [page.keyword, "AI Video Studio", "可控出片"],
    alternates: { canonical: `${SITE_URL}/${page.slug}` },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `${SITE_URL}/${page.slug}`,
      type: "website",
      locale: "zh_CN",
      siteName: "AI Video Studio",
    },
  };
}

function faqJsonLd(page: (typeof PROGRAMMATIC_PAGES)[number]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export default async function ProgrammaticPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = PROGRAMMATIC_BY_SLUG[slug];
  if (!page) notFound();

  const mother = TOOL_BY_SLUG[page.motherTool];
  const [h1Head, h1Em] = page.h1.includes(" — ")
    ? page.h1.split(" — ")
    : [page.h1, null];
  const ctaHref = loginToTool(page.motherTool);

  return (
    <>
      <JsonLd data={faqJsonLd(page)} />

      <section className="section" style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <div className="kicker">
            {page.verb} · {page.content}
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
          <p className="lede" style={{ marginTop: 20, maxWidth: "52em" }}>
            {page.intro}
          </p>
          <div className="home-cta" style={{ marginTop: 24 }}>
            <Link className="btn-ink" href={ctaHref}>
              {page.cta}
            </Link>
            {mother ? (
              <Link className="btn-line" href={`/tools/${mother.slug}`}>
                了解 {mother.name} →
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0, borderTop: "none" }}>
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">步骤</div>
            <h2>
              可控流程， <em>五步。</em>
            </h2>
          </div>
          <div className="col-r">
            <ol className="num-list">
              {page.steps.map((step, i) => (
                <li key={i}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="small muted" style={{ marginTop: 6, maxWidth: "38em" }}>
                      {step}
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
            <div className="kicker">常见问题</div>
            <h2>
              开始前 <em>看一眼。</em>
            </h2>
          </div>
          <div className="col-r">
            {page.faq.map((f) => (
              <div className="faq-item" key={f.q}>
                <div className="q">{f.q}</div>
                <p className="a">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {mother ? (
        <section className="section">
          <div className="wrap cols cols-5-7">
            <div className="col-l">
              <div className="kicker">对应工具</div>
              <h2 style={{ marginBottom: 10 }}>{mother.name}</h2>
              <p className="small muted" style={{ maxWidth: "26em", marginBottom: 18 }}>
                本页是程序化 SEO 入口，能力收敛到母工具页与工作台一键出片。
              </p>
              <Link href={`/tools/${mother.slug}`}>/tools/{mother.slug} →</Link>
            </div>
            <div className="col-r">
              <div className="figure">免费额度</div>
              <p className="small muted" style={{ margin: "10px 0 18px", maxWidth: "32em" }}>
                演示登录即可体验。成片与素材包双出口，不满意就自己剪。
              </p>
              <Link className="btn-ink" href={ctaHref}>
                {page.cta}
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
