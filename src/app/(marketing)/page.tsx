import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site-data";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  title: {
    absolute: "AI Video Studio — Storyboard-First AI Video Workbench",
  },
  description:
    "Storyboard-first AI video creation for freelancers and creators. Script, storyboard, per-shot images, voiceover, subtitles and open export — run the whole pipeline on your own keys (BYOK) or managed, from $9.99/mo.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "AI Video Studio — Storyboard-first AI Video Creator",
    description:
      "Script, storyboard, per-shot images, voiceover, subtitles and open export. Run the whole pipeline on your own keys.",
    url: SITE_URL,
    type: "website",
  },
};

function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "AI Video Studio",
    url: SITE_URL,
    description:
      "Storyboard-first AI video creation workbench for freelancers and creators.",
  };
}

function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "AI Video Studio",
    description:
      "Storyboard-first AI video creation workbench: script, storyboard, per-shot images, voiceover, subtitles and open export.",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description:
        "Free tier (Bring Your Own Key). Managed plans from $9.99/mo.",
    },
  };
}

// 营销首页：Server component，内联英文（默认 en，i18n C13 第一层）。
// 结构对照原型 index.html —— Hero / 两种生成方式 / 流水线 / 卖点 / 双轨 CTA。
export default function Home() {
  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <JsonLd data={softwareApplicationJsonLd()} />

      {/* Hero：左对齐编辑式 5:7 分栏，右栏为 App 界面缩略 */}
      <section className="section">
        <div className="wrap cols cols-5-7">
          <div className="col-l">
            <div className="kicker">Storyboard-first workbench</div>
            <h1>
              AI videos, built <em>shot&nbsp;by&nbsp;shot</em> — not in a black box.
            </h1>
            <p className="lede" style={{ marginTop: 20 }}>
              A workbench for short-video creators and freelancers. Write, storyboard, render —
              every step is editable, every shot re-runnable, everything exportable.
            </p>
            <div
              style={{
                marginTop: 30,
                display: "flex",
                alignItems: "center",
                gap: 18,
                flexWrap: "wrap",
              }}
            >
              <a className="btn-ink" href="/login">
                Start free — bring your own keys
              </a>
              <a href="/pricing">Or managed, from $9.99/mo →</a>
            </div>
            <span className="note">› BYOK $0 无限任务 ·「Start free」→ /login</span>
          </div>

          {/* 视觉焦点：浅色浏览器框嵌深色任务向导界面 */}
          <div className="col-r">
            <div className="browser">
              <div className="browser-bar">
                <span className="browser-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="browser-url">app.aivideostudio.com/app/tasks/8f3a2c</span>
              </div>
              <div className="appmini">
                {/* 左 rail：六阶段 */}
                <div className="appmini-rail">
                  <div className="rail-head">Stages</div>
                  <div className="appmini-stage">
                    <span className="st-n">01</span>Script<span className="dot ok" />
                  </div>
                  <div className="appmini-stage">
                    <span className="st-n">02</span>Storyboard<span className="dot ok" />
                  </div>
                  <div className="appmini-stage cur">
                    <span className="st-n">03</span>Visuals<span className="dot run" />
                  </div>
                  <div className="appmini-stage">
                    <span className="st-n">04</span>Sound<span className="dot idle" />
                  </div>
                  <div className="appmini-stage">
                    <span className="st-n">05</span>Compose<span className="dot idle" />
                  </div>
                  <div className="appmini-stage">
                    <span className="st-n">06</span>Delivery<span className="dot idle" />
                  </div>
                </div>
                {/* 右侧：镜头表 */}
                <div className="appmini-main">
                  <div className="appmini-topbar">
                    <span className="appmini-title">Visuals — Shot images</span>
                    <span className="appmini-credits">1,620 credits</span>
                    <span className="appmini-btn">Continue</span>
                  </div>
                  <table className="appmini-table">
                    <tbody>
                      <tr>
                        <th style={{ width: 18 }}>#</th>
                        <th>Frame</th>
                        <th>Prompt</th>
                        <th style={{ width: 64 }}>Status</th>
                      </tr>
                      <tr>
                        <td className="c1">1</td>
                        <td>
                          <span className="appmini-thumb">
                            <svg viewBox="0 0 52 29">
                              <path d="M4 24 L16 10 L24 20 L32 8 L48 24 Z" fill="none" stroke="#5f5a53" strokeWidth={1} />
                              <circle cx="40" cy="7" r="3" fill="none" stroke="#5f5a53" strokeWidth={1} />
                            </svg>
                          </span>
                        </td>
                        <td>Wide shot, rooftop at dusk, city skyline…</td>
                        <td>
                          <span className="appmini-status">
                            <span className="dot ok" />
                            done
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="c1">2</td>
                        <td>
                          <span className="appmini-thumb">
                            <svg viewBox="0 0 52 29">
                              <circle cx="26" cy="10" r="4" fill="none" stroke="#5f5a53" strokeWidth={1} />
                              <path d="M18 26 Q26 14 34 26" fill="none" stroke="#5f5a53" strokeWidth={1} />
                            </svg>
                          </span>
                        </td>
                        <td>Close-up, host speaks to camera, soft light…</td>
                        <td>
                          <span className="appmini-status">
                            <span className="dot ok" />
                            done
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="c1">3</td>
                        <td>
                          <span className="appmini-thumb">
                            <svg viewBox="0 0 52 29">
                              <rect x="8" y="8" width="14" height="16" fill="none" stroke="#5f5a53" strokeWidth={1} />
                              <rect x="28" y="4" width="16" height="20" fill="none" stroke="#5f5a53" strokeWidth={1} />
                            </svg>
                          </span>
                        </td>
                        <td>Product on table, steam rising, macro…</td>
                        <td>
                          <span className="appmini-status">
                            <span className="dot run" />
                            running
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="c1">4</td>
                        <td>
                          <span className="appmini-thumb">
                            <svg viewBox="0 0 52 29">
                              <path d="M6 22 H46 M10 22 V12 H22 V22 M28 22 V8 H42 V22" fill="none" stroke="#5f5a53" strokeWidth={1} />
                            </svg>
                          </span>
                        </td>
                        <td>Street timelapse, neon signs, night rain…</td>
                        <td>
                          <span className="appmini-status">
                            <span className="dot idle" />
                            queued
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10, fontSize: 9.5, color: "var(--app-faint)" }}>
                    L4 per-shot generation · re-run a single shot without touching the rest
                  </div>
                </div>
              </div>
            </div>
            <span className="note">
              › 任务向导缩略：六阶段 rail + 镜头表 · App 区入口 →{" "}
              <a href="/app" style={{ color: "var(--muted)", textDecoration: "underline" }}>
                /app
              </a>
            </span>
          </div>
        </div>
      </section>

      {/* 两种生成方式：编号 01/02 对比 */}
      <section className="section">
        <div className="wrap">
          <div className="kicker">Two render modes</div>
          <h2 style={{ maxWidth: "16em" }}>
            Choose per video — <em>static</em> for precision, <em>i2v</em> for motion.
          </h2>
          <div className="cols cols-5-7" style={{ marginTop: 36 }}>
            <div className="col-l">
              <p className="lede">
                Both modes run the same storyboard-first pipeline. Static composes still frames
                with voiceover; i2v turns every frame into a moving clip before the final cut.
                The price difference is real — we publish the numbers.
              </p>
              <p className="small muted" style={{ marginTop: 16, maxWidth: "34em" }}>
                Honest cost disclosure: a static video costs the platform ≈ $0.1–0.3 to render.
                An i2v video costs ≈ $2–6 — 10–50× more, the i2v step alone being over 90% of compute.
              </p>
            </div>
            <div className="col-r">
              <ol className="num-list">
                <li>
                  <span className="n">01</span>
                  <div>
                    <h3>
                      Static{" "}
                      <span className="small muted" style={{ fontFamily: "system-ui" }}>
                        · 9 steps, L1–L9 · skips image-to-video
                      </span>
                    </h3>
                    <p className="small muted" style={{ marginTop: 6, maxWidth: "36em" }}>
                      Script → storyboard → per-shot images → voiceover → subtitles → ffmpeg static compose.
                      Fast, cheap, frame-precise.
                    </p>
                    <p className="small" style={{ marginTop: 8 }}>
                      <b style={{ fontWeight: 600 }}>60 credits</b>{" "}
                      <span className="muted">/ video</span> · pay-per-use $1.9
                    </p>
                  </div>
                </li>
                <li>
                  <span className="n">02</span>
                  <div>
                    <h3>
                      i2v{" "}
                      <span className="small muted" style={{ fontFamily: "system-ui" }}>
                        · 10 steps, L1–L10 · adds L5 image-to-video
                      </span>
                    </h3>
                    <p className="small muted" style={{ marginTop: 6, maxWidth: "36em" }}>
                      Each storyboard frame becomes a moving clip per shot, then voiceover, subtitles, final concat.
                      Motion-rich output at a higher cost.
                    </p>
                    <p className="small" style={{ marginTop: 8 }}>
                      <b style={{ fontWeight: 600 }}>300 credits</b>{" "}
                      <span className="muted">/ video</span> · pay-per-use $7.9 · 1 i2v = 5 static
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* 流水线：横向编号链 L1→L10 */}
      <section className="section">
        <div className="wrap">
          <div className="kicker">The pipeline</div>
          <h2 style={{ maxWidth: "18em" }}>
            Nine or ten steps. Edit any one, <em>re-run only what changed.</em>
          </h2>
          <div className="chain" style={{ marginTop: 36 }}>
            <div className="node">
              <div className="lx">L1</div>
              <div className="nm">Topic parse</div>
            </div>
            <span className="link" />
            <div className="node">
              <div className="lx">L1.5</div>
              <div className="nm">Compliance · managed</div>
            </div>
            <span className="link" />
            <div className="node">
              <div className="lx">L2</div>
              <div className="nm">Script</div>
            </div>
            <span className="link" />
            <div className="node">
              <div className="lx">L3</div>
              <div className="nm">Storyboard</div>
            </div>
            <span className="link" />
            <div className="node">
              <div className="lx">L4</div>
              <div className="nm">Shot images</div>
            </div>
            <span className="link" />
            <div className="node i2v">
              <div className="lx">L5</div>
              <div className="nm">Img → video · i2v only</div>
            </div>
            <span className="link" />
            <div className="node">
              <div className="lx">L6</div>
              <div className="nm">Voiceover</div>
            </div>
            <span className="link" />
            <div className="node">
              <div className="lx">L7</div>
              <div className="nm">Subtitles</div>
            </div>
            <span className="link" />
            <div className="node">
              <div className="lx">L8</div>
              <div className="nm">Compose</div>
            </div>
            <span className="link" />
            <div className="node">
              <div className="lx">L9</div>
              <div className="nm">Review</div>
            </div>
            <span className="link" />
            <div className="node">
              <div className="lx">L10</div>
              <div className="nm">Open export</div>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 8, maxWidth: "56em" }}>
            static skips L5 (9 steps); i2v runs all 10. Change one shot&apos;s prompt and only that shot re-renders;
            downstream edits are marked stale until re-run. Semi mode pauses at a human review gate before compose (L8).
            UI groups the steps into six stages: ① Script L1–L2 · ② Storyboard L3 · ③ Visuals L4/L5 · ④ Sound L6–L7 · ⑤ Compose L8 · ⑥ Delivery L9–L10.
          </p>
          <span className="note">› 单步重跑 → POST /api/tasks/:id/rerun（清洗下游产物）</span>
        </div>
      </section>

      {/* 三个卖点：编号列表，含 zip 目录树 */}
      <section className="section">
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">Why it feels different</div>
            <h2>
              Your work stays <em>yours.</em>
            </h2>
            <p className="lede" style={{ marginTop: 16 }}>
              No lock-in, no black box, no surprise metering.
              Export the whole project and leave whenever you like.
            </p>
          </div>
          <div className="col-r">
            <ol className="num-list">
              <li>
                <span className="n">01</span>
                <div>
                  <h3>Open export zip</h3>
                  <div
                    className="mono"
                    style={{
                      border: "1px solid var(--line)",
                      background: "var(--card)",
                      padding: "14px 16px",
                      marginTop: 10,
                      maxWidth: "26em",
                      lineHeight: 1.7,
                      color: "var(--muted)",
                    }}
                  >
                    project-export.zip
                    <br />
                    ├─ final.mp4
                    <br />
                    ├─ storyboard.json
                    <br />
                    ├─ script.md
                    <br />
                    ├─ assets/ shots · clips · audio · srt
                    <br />
                    └─ LICENSE.txt
                  </div>
                  <p className="small muted" style={{ marginTop: 8 }}>
                    Import into any editor. Zip retained 30 days, then auto-cleaned.
                  </p>
                  <span className="note">› 导出 → GET /api/export/:id（过期 410）</span>
                </div>
              </li>
              <li>
                <span className="n">02</span>
                <div>
                  <h3>BYOK — free forever</h3>
                  <p className="small muted" style={{ marginTop: 6, maxWidth: "38em" }}>
                    Bring your own LLM / image / TTS / i2v keys. $0, unlimited tasks, unlimited re-runs,
                    full features including open export. Keys are AES-GCM encrypted and never leave the server.
                  </p>
                </div>
              </li>
              <li>
                <span className="n">03</span>
                <div>
                  <h3>Managed — we pay the compute</h3>
                  <p className="small muted" style={{ marginTop: 6, maxWidth: "38em" }}>
                    Nothing to configure. Credits freeze when a task starts, settle when it finishes,
                    and are refunded automatically on failure. From $9.9/mo, or pay per video.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* 双轨 CTA：大号衬线数字直排 */}
      <section className="section">
        <div className="wrap cols cols-5-7">
          <div className="col-l">
            <div className="figure">$0</div>
            <h3 style={{ marginTop: 10 }}>BYOK track</h3>
            <p className="small muted" style={{ margin: "6px 0 18px", maxWidth: "24em" }}>
              Unlimited tasks. Your keys, your provider rates, your cost.
            </p>
            <a className="btn-ink" href="/login">
              Start Free
            </a>
          </div>
          <div className="col-r">
            <div className="figure">
              $9.99<span className="unit"> /mo, or pay per video</span>
            </div>
            <h3 style={{ marginTop: 10 }}>Managed track</h3>
            <p className="small muted" style={{ margin: "6px 0 18px", maxWidth: "32em" }}>
              No keys, no setup. New accounts get 120 trial credits — about two static videos, on us.
            </p>
            <a className="btn-line" href="/pricing">
              See pricing →
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
