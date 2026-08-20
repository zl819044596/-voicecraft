import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  TOOLS,
  TOOL_BY_SLUG,
  PIPELINE_STEPS,
  SITE_URL,
  type Tool,
} from "@/lib/site-data";
import { JsonLd } from "@/components/JsonLd";

// Static generation for all 8 tool pages.
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
  const tool = TOOL_BY_SLUG[slug];
  if (!tool) return {};
  return {
    title: tool.title,
    description: tool.description,
    alternates: { canonical: `${SITE_URL}/tools/${tool.slug}` },
    openGraph: {
      title: tool.title,
      description: tool.description,
      url: `${SITE_URL}/tools/${tool.slug}`,
      type: "website",
    },
  };
}

function softwareApplicationJsonLd(tool: Tool) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.name,
    description: tool.description,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description:
        "Free tier (Bring Your Own Key). Paid plans are offered after launch.",
    },
  };
}

function howToJsonLd(tool: Tool) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `Use the ${tool.name}`,
    description: tool.intro,
    step: tool.steps.map((n) => {
      const s = PIPELINE_STEPS.find((p) => p.n === n);
      return {
        "@type": "HowToStep",
        position: n,
        name: s?.name ?? `Step ${n}`,
        text: s?.detail ?? "",
      };
    }),
  };
}

// 工具分类短名（标题 kicker，对照原型 "Tools — Storyboard"）
const TOOL_KICKER: Record<string, string> = {
  "storyboard-generator": "Storyboard",
  "script-to-video": "Script to Video",
  "ai-video-script-writer": "Script Writer",
  "text-to-video": "Text to Video",
  "ai-voiceover": "Voiceover",
  "subtitle-generator": "Subtitles",
  "video-export-zip": "Export",
  "byok-video-tools": "BYOK",
};

// 各工具页 How-it-works 区底部端点提示（note）
const TOOL_NOTES: Record<string, string> = {
  "storyboard-generator": "› 单镜重生成 → POST /api/tasks/:id/storyboard/regenerate",
  "script-to-video": "› 全流程 → POST /api/tasks（mode: static | i2v）",
  "ai-video-script-writer": "› 脚本重写 → POST /api/tasks/:id/script/regenerate",
  "text-to-video": "› 新建任务 → POST /api/tasks {mode, track, run_mode}",
  "ai-voiceover": "› 配音重生成 → POST /api/tasks/:id/voice/regenerate",
  "subtitle-generator": "› 字幕设置 → POST /api/tasks/:id/subtitles",
  "video-export-zip": "› 导出 → GET /api/export/:id（zip 保留 30 天）",
  "byok-video-tools": "› 凭据管理 → POST/GET/DELETE /api/credentials",
};

// 输出示例代码块（仅旗舰工具页，对照原型 codeblock；其余工具无专用示例）
function codeblockFor(slug: string) {
  if (slug === "storyboard-generator") {
    return (
      <>
        <div className="kicker">Output example</div>
        <h2 style={{ maxWidth: "20em" }}>
          What a storyboard actually <em>looks like.</em>
        </h2>
        <div className="codeblock" style={{ marginTop: 28, maxWidth: "44em" }}>
          <span className="cm">// storyboard.json — step L3 output, excerpt (2 of 8 shots)</span>
          {`
{
  "aspect": "9:16",
  "style_preset": "general",
  "shots": [
    {
      "index": 1,
      "title": "Cold open — the problem",
      "duration": 3.5,
      "scene": "Freelancer at desk, 11pm, messy timeline on screen",
      "voiceover": "Client videos used to take me a whole weekend.",
      "subtitle": "Client videos used to take me a whole weekend.",
      "prompt": "cinematic medium shot, dim home office at night, warm desk lamp, 35mm",
      "motion": "slow push-in"
    },
    {
      "index": 2,
      "title": "The storyboard appears",
      "duration": 4.0,
      "scene": "Over-shoulder view of shot table filling in row by row",
      "voiceover": "Now I approve the shots before anything renders.",
      "subtitle": "Now I approve the shots before anything renders.",
      "prompt": "close-up of monitor, dark UI with shot list, shallow depth of field",
      "motion": "static"
    }
  ]
}`}
        </div>
        <span className="note">› 完整 JSON 随导出 zip 提供（GET /api/export/:id）</span>
      </>
    );
  }
  if (slug === "video-export-zip") {
    return (
      <>
        <div className="kicker">Output example</div>
        <h2 style={{ maxWidth: "22em" }}>
          What the export <em>actually contains.</em>
        </h2>
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
      </>
    );
  }
  return null;
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = TOOL_BY_SLUG[slug];
  if (!tool) notFound();

  const kicker = TOOL_KICKER[tool.slug] ?? "Tools";
  const note = TOOL_NOTES[tool.slug];
  const [h1Head, h1Em] = tool.h1.includes(" — ")
    ? tool.h1.split(" — ")
    : [tool.h1, null];
  const steps = tool.steps
    .slice(0, 4)
    .map((n) => PIPELINE_STEPS.find((p) => p.n === n))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const related = tool.related
    .map((s) => TOOL_BY_SLUG[s])
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const codeblock = codeblockFor(tool.slug);

  return (
    <>
      <JsonLd data={softwareApplicationJsonLd(tool)} />
      <JsonLd data={howToJsonLd(tool)} />

      {/* 标题：左对齐编辑式 */}
      <section className="section" style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <div className="kicker">Tools — {kicker}</div>
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
        </div>
      </section>

      {/* How it works：编号列表 */}
      <section className="section" style={{ paddingTop: 0, borderTop: "none" }}>
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">How it works</div>
            <h2>
              Runs as pipeline step <em>L{tool.steps[0]}.</em>
            </h2>
            <p className="lede" style={{ marginTop: 16 }}>
              {tool.body[0]}
            </p>
          </div>
          <div className="col-r">
            <ol className="num-list">
              {steps.map((s, i) => (
                <li key={s.n}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{s.name}</h3>
                    <p className="small muted" style={{ marginTop: 6, maxWidth: "38em" }}>
                      {s.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {note ? <span className="note">{note}</span> : null}
          </div>
        </div>
      </section>

      {/* 输出示例（旗舰工具页） */}
      {codeblock ? (
        <section className="section">
          <div className="wrap">{codeblock}</div>
        </section>
      ) : null}

      {/* FAQ */}
      <section className="section">
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">FAQ</div>
            <h2>
              Asked <em>often.</em>
            </h2>
          </div>
          <div className="col-r">
            <div className="faq-item">
              <div className="q">Is this a one-shot generation, or can I edit the result?</div>
              <p className="a">
                Fully editable. The output is structured data, not prose — change any row and
                re-run only the affected part. Downstream steps are marked stale until you
                re-run them, so nothing silently drifts.
              </p>
            </div>
            <div className="faq-item">
              <div className="q">Which provider runs this step?</div>
              <p className="a">
                Yours, if you bring your own keys — any OpenAI-compatible endpoint works for
                the LLM steps. On managed plans we use the platform key pool. The output
                schema is identical either way.
              </p>
            </div>
            <div className="faq-item">
              <div className="q">Do I pay for {tool.name.toLowerCase()}?</div>
              <p className="a">
                On BYOK it is free and unmetered — you pay your own provider directly. On
                managed plans it is part of the pipeline; credits are only frozen when a
                render task is created.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Related tools 互链 */}
      <section className="section">
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">Related tools</div>
            <h2>
              Keep <em>exploring.</em>
            </h2>
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

      {/* 双轨 CTA */}
      <section className="section">
        <div className="wrap cols cols-5-7">
          <div className="col-l">
            <div className="figure">$0</div>
            <h3 style={{ marginTop: 10 }}>Start free — BYOK</h3>
            <p className="small muted" style={{ margin: "6px 0 18px", maxWidth: "24em" }}>
              Your own LLM key, unlimited runs, unlimited re-runs.
            </p>
            <Link className="btn-ink" href="/login">
              Start Free
            </Link>
          </div>
          <div className="col-r">
            <div className="figure">
              $9.99<span className="unit"> /mo managed</span>
            </div>
            <h3 style={{ marginTop: 10 }}>Nothing to configure</h3>
            <p className="small muted" style={{ margin: "6px 0 18px", maxWidth: "32em" }}>
              900 credits a month, 120 trial credits on signup. We pay the compute, you
              approve the shots.
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
