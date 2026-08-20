import type { Metadata } from "next";
import Link from "next/link";

// /p/make-video — programmatic 模板页（verb=make × type=video）。
// 对照原型 p-make-video.html，Server component 内联英文。营销 layout 提供
// route-bar + mkt-header + mkt-footer；本页正文按原型结构硬编码。

export const metadata: Metadata = {
  title: {
    absolute: "Make video with full control — AI Video Studio",
  },
  description:
    "Making a video here is a pipeline, not a prompt: script, storyboard, shots, voiceover, subtitles and open export — every step editable. BYOK free, managed 60 credits static / 300 i2v.",
  alternates: { canonical: "/p/make-video" },
  openGraph: {
    title: "Make video with full control — AI Video Studio",
    description:
      "A pipeline, not a prompt — eight moves from source text to an open export zip. BYOK free; managed 60 credits static, 300 i2v.",
    type: "website",
  },
};

const STEPS: { h3: string; p: string }[] = [
  {
    h3: "Provide the source",
    p: "Paste text, a URL, or a bare topic. The parse step (L1) turns it into a topic card with key points, audience and target duration.",
  },
  {
    h3: "Draft the script",
    p: "An LLM writes the narration (L2). Edit it inline, keep versions, regenerate until the words are right — words are the cheapest thing to change.",
  },
  {
    h3: "Approve the storyboard",
    p: "The script becomes 6–12 structured shots (L3): scene, voiceover, subtitle and image prompt per shot. This is your last free checkpoint.",
  },
  {
    h3: "Generate shot images",
    p: "Each shot gets a frame from your image provider (L4). Regenerate single shots, or pull alternate candidates and pick the keeper.",
  },
  {
    h3: "Add motion (i2v, optional)",
    p: "In i2v mode every frame becomes a moving clip per shot (L5). Static mode skips this — faster and roughly a tenth of the cost.",
  },
  {
    h3: "Record the voiceover",
    p: "TTS renders per-shot audio (L6) with voices filtered by your content language. Re-do any single line without touching the rest.",
  },
  {
    h3: "Subtitle and compose",
    p: "Subtitles are timed from the audio (L7), then ffmpeg composes the final cut (L8) — after a human review gate in semi mode.",
  },
  {
    h3: "Review and export",
    p: "A final LLM review pass (L9), then export an open zip (L10): MP4, storyboard.json, script, assets and SRT. Yours to keep, 30-day retention.",
  },
];

export default function MakeVideoPage() {
  return (
    <>
      {/* 标题 + 描述 */}
      <section className="section" style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <div className="kicker">Make · video</div>
          <h1>
            Make video with <em>full control.</em>
          </h1>
          <p className="lede" style={{ marginTop: 20, maxWidth: "52em" }}>
            Making a video here is a pipeline, not a prompt. You write or import the narration,
            approve a shot-by-shot storyboard, then render frames, voiceover and subtitles step by
            step — editing and re-running any single step along the way. Eight moves, start to
            finish. Bring your own keys and it is free; on managed plans a finished static video is{" "}
            <b style={{ color: "var(--ink)", fontWeight: 500 }}>60 credits</b> and an i2v video is{" "}
            <b style={{ color: "var(--ink)", fontWeight: 500 }}>300</b>.
          </p>
        </div>
      </section>

      {/* 8 步说明 */}
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
              {STEPS.map((s, i) => (
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
            <span className="note">› static 跳过第 05 步（i2v 专属 L5）</span>
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
            <div className="faq-item">
              <div className="q">How is this different from one-click text-to-video?</div>
              <p className="a">
                Control. One-click tools return a finished clip you can only accept or discard.
                Here every step is inspectable and re-runnable — if one shot is wrong, you fix one
                shot.
              </p>
            </div>
            <div className="faq-item">
              <div className="q">What does it cost to make one video?</div>
              <p className="a">
                BYOK: $0 — you pay your own providers directly. Managed: 60 credits for a static
                video, 300 for i2v (1 credit = $0.01). New accounts get 120 trial credits, about two
                static videos.
              </p>
            </div>
            <div className="faq-item">
              <div className="q">Can I make vertical videos for Shorts, Reels or TikTok?</div>
              <p className="a">
                Yes — aspect ratio (9:16, 16:9, 1:1) is a storyboard-level setting. See the
                dedicated pages for making shorts, reels and TikTok videos with the same pipeline.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 母工具页内链 + CTA */}
      <section className="section">
        <div className="wrap cols cols-5-7">
          <div className="col-l">
            <div className="kicker">Parent tool</div>
            <h2 style={{ marginBottom: 10 }}>Text to Video with Full Control</h2>
            <p className="small muted" style={{ maxWidth: "26em", marginBottom: 18 }}>
              This page is one of 36 verb × content-type guides. They all converge on the parent
              tool page.
            </p>
            <Link href="/tools/text-to-video">/tools/text-to-video →</Link>
          </div>
          <div className="col-r">
            <div className="figure">
              120<span className="unit"> trial credits, no card</span>
            </div>
            <p className="small muted" style={{ margin: "10px 0 18px", maxWidth: "32em" }}>
              Enough for about two static videos. BYOK stays free forever; managed plans from
              $9.99/mo.
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
    </>
  );
}
