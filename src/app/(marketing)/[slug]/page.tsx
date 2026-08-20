import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PROGRAMMATIC_PAGES,
  PROGRAMMATIC_BY_SLUG,
  TOOL_BY_SLUG,
  SITE_URL,
} from "@/lib/site-data";
import { JsonLd } from "@/components/JsonLd";

// Programmatic SEO Phase 1 — [verb]-[content-type] template.
// 6 verbs × 6 content types = 36 statically generated pages. Each page
// converges links back to its mother tool page (PRD §6.4).

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
    alternates: { canonical: `${SITE_URL}/${page.slug}` },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `${SITE_URL}/${page.slug}`,
      type: "website",
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

  return (
    <>
      <JsonLd data={faqJsonLd(page)} />

      {/* 标题：左对齐编辑式 */}
      <section className="section" style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <div className="kicker">
            {page.verb[0].toUpperCase()}
            {page.verb.slice(1)} · {page.content}
          </div>
          <h1>
            {h1Head}
            {h1Em ? (
              <>
                <br />
                <em>{h1Em}.</em>
              </>
            ) : null}
          </h1>
          <p className="lede" style={{ marginTop: 20, maxWidth: "52em" }}>
            {page.intro}
          </p>
        </div>
      </section>

      {/* 步骤：编号列表 */}
      <section className="section" style={{ paddingTop: 0, borderTop: "none" }}>
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">Eight steps</div>
            <h2>
              The whole process, <em>numbered.</em>
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
            <span className="note">› 每步可复核、可重跑；static 跳过 i2v 专属的动效步</span>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section">
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">FAQ</div>
            <h2>
              Before you <em>start.</em>
            </h2>
          </div>
          <div className="col-r">
            {page.faq.map((f, i) => (
              <div className="faq-item" key={i}>
                <div className="q">{f.q}</div>
                <p className="a">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 母工具页内链 + CTA */}
      {mother ? (
        <section className="section">
          <div className="wrap cols cols-5-7">
            <div className="col-l">
              <div className="kicker">Parent tool</div>
              <h2 style={{ marginBottom: 10 }}>{mother.name}</h2>
              <p className="small muted" style={{ maxWidth: "26em", marginBottom: 18 }}>
                This page is one of 36 verb × content-type guides. They all converge on the
                parent tool page.
              </p>
              <Link href={`/tools/${mother.slug}`}>/tools/{mother.slug} →</Link>
            </div>
            <div className="col-r">
              <div className="figure">
                120<span className="unit"> trial credits, no card</span>
              </div>
              <p className="small muted" style={{ margin: "10px 0 18px", maxWidth: "32em" }}>
                Enough for about two static videos. BYOK stays free forever; managed plans
                from $9.99/mo.
              </p>
              <Link className="btn-ink" href="/login">
                Start Free
              </Link>
              <Link href="/pricing" style={{ marginLeft: 18 }}>
                Pricing →
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
