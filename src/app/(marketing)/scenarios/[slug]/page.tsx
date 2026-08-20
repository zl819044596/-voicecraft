import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  SCENARIOS,
  SCENARIO_BY_SLUG,
  SITE_URL,
  type Scenario,
} from "@/lib/site-data";
import { JsonLd } from "@/components/JsonLd";

// Static generation for all 5 scenario pages.
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
  return {
    title: scenario.title,
    description: scenario.description,
    alternates: { canonical: `${SITE_URL}/scenarios/${scenario.slug}` },
    openGraph: {
      title: scenario.title,
      description: scenario.description,
      url: `${SITE_URL}/scenarios/${scenario.slug}`,
      type: "website",
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
  };
}

// 场景分类短名（标题 kicker，对照原型 "Scenarios — Freelancers"）
const SCENARIO_KICKER: Record<string, string> = {
  "client-video-delivery": "Freelancers",
  "youtube-script-to-video": "Creators",
  "social-ads-video": "Marketing",
  "product-demo-video": "Product",
  "video-localization": "Localization",
};

// 工作流步骤（场景页模板，原型 scenario-client-video-delivery.html 同构）
const WORKFLOW_STEPS: { h3: string; tag: string; p: string }[] = [
  {
    h3: "Brief in, script out",
    tag: "· L1–L2",
    p: "Paste the brief, a URL or talking points. Get a draft script, version it, and sign off on words before a single frame renders.",
  },
  {
    h3: "Approve the storyboard together",
    tag: "· L3",
    p: "Walk through 6–12 shots in a table: scene, voiceover, subtitle, prompt. This is the cheap moment to change your mind — edits here cost nothing on BYOK.",
  },
  {
    h3: "Render, then revise per shot",
    tag: "· L4–L8",
    p: "Generate frames (static) or moving clips (i2v), voiceover and subtitles, then compose. One shot wrong? Re-run just that shot; the rest stay untouched.",
  },
  {
    h3: "Hand over an open export",
    tag: "· L9–L10",
    p: "Run the final review step, then export everything as a zip — the MP4 and, if the contract calls for it, the full source package too.",
  },
];

// 痛点（场景页模板同构，通用三条）
const PAIN_STEPS: { h3: string; p: string }[] = [
  {
    h3: "Revisions are unbounded",
    p: "“Can we change shot three?” usually means re-doing the whole render. Every round of feedback burns hours you cannot invoice.",
  },
  {
    h3: "AI output is a black box",
    p: "One-click text-to-video tools give you a take-it-or-leave-it clip. When one scene is wrong, you regenerate everything and pray.",
  },
  {
    h3: "Platforms lock the project in",
    p: "If the assets, script and storyboard live inside a subscription editor, finishing the job in your own NLE — or handing source files over — is off the table.",
  },
];

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const scenario = SCENARIO_BY_SLUG[slug];
  if (!scenario) notFound();

  const kicker = SCENARIO_KICKER[scenario.slug] ?? "Use cases";
  const [h1Head, h1Em] = scenario.h1.includes(" — ")
    ? scenario.h1.split(" — ")
    : [scenario.h1, null];

  return (
    <>
      <JsonLd data={articleJsonLd(scenario)} />

      {/* 标题：左对齐编辑式 */}
      <section className="section" style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <div className="kicker">Scenarios — {kicker}</div>
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
        </div>
      </section>

      {/* 痛点：编号列表 */}
      <section className="section" style={{ paddingTop: 0, borderTop: "none" }}>
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">The pain</div>
            <h2>
              Why this work <em>eats margin.</em>
            </h2>
          </div>
          <div className="col-r">
            <ol className="num-list">
              {PAIN_STEPS.map((s, i) => (
                <li key={i}>
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

      {/* 工作流：编号列表 */}
      <section className="section">
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">The workflow</div>
            <h2>
              The same pipeline, <em>every time.</em>
            </h2>
            <p className="lede" style={{ marginTop: 16 }}>
              {scenario.body[0]}
            </p>
          </div>
          <div className="col-r">
            <ol className="num-list">
              {WORKFLOW_STEPS.map((s, i) => (
                <li key={i}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>
                      {s.h3}{" "}
                      <span className="small muted" style={{ fontFamily: "system-ui" }}>
                        {s.tag}
                      </span>
                    </h3>
                    <p className="small muted" style={{ marginTop: 6, maxWidth: "38em" }}>
                      {s.p}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <span className="note">
              › 交付前人工复核门：semi 模式默认在 L8 合成前暂停
            </span>
          </div>
        </div>
      </section>

      {/* 交付物：zip 目录树 */}
      <section className="section">
        <div className="wrap">
          <div className="kicker">The deliverable</div>
          <h2 style={{ maxWidth: "22em" }}>
            What the client actually <em>receives.</em>
          </h2>
          <p className="lede" style={{ marginTop: 16, maxWidth: "52em" }}>
            Not a platform link that expires with your subscription — a folder of files you
            own. The zip is retained for 30 days, then cleaned automatically.
          </p>
          <div className="codeblock" style={{ marginTop: 28, maxWidth: "34em" }}>
            <span className="cm"># project-export-20260811.zip — step L10 output</span>
            {`
project-export.zip
├─ final.mp4            # composed video, subtitles burned or sidecar
├─ storyboard.json      # full shot list: scene/voiceover/prompt per shot
├─ script.md            # approved narration script
├─ assets/
│  ├─ shots/            # per-shot PNG frames
│  ├─ clips/            # per-shot clips (i2v mode)
│  ├─ audio/            # per-shot TTS voiceover
│  └─ subtitles.srt
└─ LICENSE.txt          # usage terms for client handover`}
          </div>
          <span className="note">› 导出 zip 保留 30 天（CONTRACT C7），过期 410</span>
        </div>
      </section>

      {/* 双轨 CTA */}
      <section className="section">
        <div className="wrap cols cols-5-7">
          <div className="col-l">
            <div className="figure">$0</div>
            <h3 style={{ marginTop: 10 }}>BYOK for your studio</h3>
            <p className="small muted" style={{ margin: "6px 0 18px", maxWidth: "24em" }}>
              Unlimited projects on your own keys. Cost per video = your provider rates.
            </p>
            <Link className="btn-ink" href="/login">
              Start Free
            </Link>
          </div>
          <div className="col-r">
            <div className="figure">
              60<span className="unit"> credits / static video</span>
            </div>
            <h3 style={{ marginTop: 10 }}>Disclosed, not hidden</h3>
            <p className="small muted" style={{ margin: "6px 0 18px", maxWidth: "32em" }}>
              300 credits per i2v video (1 i2v = 5 static). Credit rates are fixed and
              published — easy to fold into a fixed-price quote.
            </p>
            <Link className="btn-line" href="/pricing">
              See pricing →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
