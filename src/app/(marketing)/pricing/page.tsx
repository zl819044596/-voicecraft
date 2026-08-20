import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "Pricing — AI Video Studio",
  },
  description:
    "BYOK is free forever with every feature included. Managed plans pay the compute honestly: Starter $9.90/mo, Pro $29.90/mo, pay-as-you-go $1.90 / $7.90. 1 credit = $0.01, static 60 / i2v 300.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing — AI Video Studio",
    description:
      "Free with your own keys. Honest pricing when we pay the compute. Starter $9.90/mo, Pro $29.90/mo, PAYG $1.90 / $7.90.",
    type: "website",
  },
};

// 营销页：Server component，内联英文。五档卡 = 后端 PLANS（00-CONTRACT §4.1 / §9.1）：
// BYOK / starter($9.90,900) / pro($29.90,3000) / payg_static($1.90,190) /
// payg_i2v($7.90,790)。体验 120 一次性见 rules.trial，不进卡。结构对照原型 pricing.html。
export default function PricingPage() {
  return (
    <>
      {/* 标题：左对齐编辑式 */}
      <section className="section" style={{ paddingBottom: 48 }}>
        <div className="wrap">
          <div className="kicker">Pricing</div>
          <h1>
            Free with your own keys.
            <br />
            <em>Honest</em> when we pay the compute.
          </h1>
          <p className="lede" style={{ marginTop: 20 }}>
            BYOK is free forever, with every feature included. Managed plans exist for one reason only —
            someone has to pay the render bill. We publish exactly what that costs below.
            New accounts start with <b style={{ color: "var(--ink)", fontWeight: 500 }}>120 trial credits</b>, about two static videos.
          </p>
        </div>
      </section>

      {/* 五档：细线分栏 + 大号衬线价格直排 */}
      <section className="section" style={{ paddingTop: 0, borderTop: "none" }}>
        <div className="wrap" style={{ borderTop: "1px solid var(--ink)" }}>
          <div className="tiers">
            <div className="tier">
              <div className="t-name">BYOK</div>
              <div className="figure">$0</div>
              <p className="small muted" style={{ marginTop: 10 }}>
                Bring your own keys, free forever. Not metered, not limited.
              </p>
              <ul>
                <li>
                  <b>Unlimited</b> videos &amp; re-runs
                </li>
                <li>Your own LLM / image / TTS / i2v keys</li>
                <li>Full features, incl. open export</li>
                <li>You pay provider rates directly</li>
              </ul>
              <div className="t-cta">
                <a className="btn-line btn-block" href="/login">
                  Start Free
                </a>
              </div>
            </div>

            <div className="tier">
              <div className="t-name">Starter</div>
              <div className="figure">
                $9.90<span className="unit">/mo</span>
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>
                900 credits per month — about 15 static or 3 i2v videos.
              </p>
              <ul>
                <li>
                  <b>900</b> credits / month
                </li>
                <li>
                  ≈ 15 static <span className="muted">or</span> 3 i2v
                </li>
                <li>
                  <b>3</b> free re-runs per video
                </li>
                <li>Monthly credits do not roll over</li>
              </ul>
              <div className="t-cta">
                <a className="btn-ink btn-block" href="/login">
                  Subscribe
                </a>
              </div>
            </div>

            <div className="tier">
              <div className="t-name">
                Pro <span className="t-tag">· priority queue</span>
              </div>
              <div className="figure">
                $29.90<span className="unit">/mo</span>
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>
                3,000 credits per month — about 50 static or 10 i2v videos.
              </p>
              <ul>
                <li>
                  <b>3,000</b> credits / month
                </li>
                <li>
                  ≈ 50 static <span className="muted">or</span> 10 i2v
                </li>
                <li>
                  <b>5</b> free re-runs per video
                </li>
                <li>Priority render queue · monthly no rollover</li>
              </ul>
              <div className="t-cta">
                <a className="btn-ink btn-block" href="/login">
                  Subscribe
                </a>
              </div>
            </div>

            <div className="tier">
              <div className="t-name">PAYG · Static</div>
              <div className="figure">
                $1.90<span className="unit"> once</span>
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>
                190 credits — one static video plus change. Never expires.
              </p>
              <ul>
                <li>
                  <b>190</b> credits, one-time
                </li>
                <li>≈ 1 static + 余量</li>
                <li>
                  <b>2</b> free re-runs per video
                </li>
                <li>No subscription · credits valid forever</li>
              </ul>
              <div className="t-cta">
                <a className="btn-line btn-block" href="/login">
                  Buy credits
                </a>
              </div>
            </div>

            <div className="tier">
              <div className="t-name">PAYG · i2v</div>
              <div className="figure">
                $7.90<span className="unit"> once</span>
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>
                790 credits — one image-to-video clip plus change. Never expires.
              </p>
              <ul>
                <li>
                  <b>790</b> credits, one-time
                </li>
                <li>≈ 1 i2v + 余量</li>
                <li>
                  <b>2</b> free re-runs per video
                </li>
                <li>No subscription · credits valid forever</li>
              </ul>
              <div className="t-cta">
                <a className="btn-line btn-block" href="/login">
                  Buy credits
                </a>
              </div>
            </div>
          </div>
          <span className="note">
            › Subscribe / Buy → sign in, then /app/billing → POST /api/billing/checkout（Creem session）
          </span>
        </div>
      </section>

      {/* i2v 成本披露条 */}
      <section className="section" style={{ paddingTop: 0, borderTop: "none" }}>
        <div className="wrap">
          <div className="disclosure">
            <div className="kicker" style={{ marginBottom: 8 }}>
              Honest cost disclosure
            </div>
            <h3 style={{ marginBottom: 10 }}>i2v is expensive. We would rather tell you than hide it.</h3>
            <p className="small muted">
              A static video costs the platform about{" "}
              <b style={{ color: "var(--ink)", fontWeight: 500 }}>$0.1–0.3</b> to render.
              An i2v (image-to-video) video costs about{" "}
              <b style={{ color: "var(--ink)", fontWeight: 500 }}>$2–6</b> —{" "}
              <b style={{ color: "var(--ink)", fontWeight: 500 }}>10–50× more</b>, with the i2v step alone
              accounting for over 90% of compute. That is why i2v is priced separately:
              300 credits per video (1 i2v = 5 static) inside a plan.
              BYOK users skip our pricing entirely and pay their own provider rates.
            </p>
            <span className="note">› 成本披露按当前模型费率实测，随供应商价格更新</span>
          </div>
        </div>
      </section>

      {/* 积分规则 + 免费重跑：4:8 编辑分栏 */}
      <section className="section">
        <div className="wrap cols cols-4-8">
          <div className="col-l">
            <div className="kicker">How credits work</div>
            <h2>
              One currency, <em>no fine print.</em>
            </h2>
            <p className="lede" style={{ marginTop: 16 }}>
              Credits are the only thing we ever count. 1 credit is anchored to $0.01 —
              a pricing unit for our generation service, not a resale of any model&apos;s tokens,
              and not redeemable for cash.
            </p>
          </div>
          <div className="col-r">
            <ol className="num-list">
              <li>
                <span className="n">01</span>
                <div>
                  <h3>Consumption rates</h3>
                  <p className="small muted" style={{ marginTop: 6, maxWidth: "38em" }}>
                    static video <b style={{ color: "var(--ink)" }}>60 credits</b> · i2v video{" "}
                    <b style={{ color: "var(--ink)" }}>300 credits</b> · static re-run{" "}
                    <b style={{ color: "var(--ink)" }}>20 credits</b> · i2v re-run{" "}
                    <b style={{ color: "var(--ink)" }}>80 credits</b>. Equivalence:
                    300 credits = 1 i2v video = 5 static videos.
                  </p>
                </div>
              </li>
              <li>
                <span className="n">02</span>
                <div>
                  <h3>Freeze, settle, refund</h3>
                  <p className="small muted" style={{ marginTop: 6, maxWidth: "38em" }}>
                    Estimated credits are frozen when a task is created, settled when it finishes,
                    and unfrozen automatically on failure. If your balance runs short you get a clear
                    402 prompt before anything is charged — never after.
                  </p>
                </div>
              </li>
              <li>
                <span className="n">03</span>
                <div>
                  <h3>Free re-runs per video</h3>
                  <p className="small muted" style={{ marginTop: 6, maxWidth: "38em" }}>
                    Trial &amp; PAYG <b style={{ color: "var(--ink)" }}>2</b> · Starter{" "}
                    <b style={{ color: "var(--ink)" }}>3</b> · Pro{" "}
                    <b style={{ color: "var(--ink)" }}>5</b>. Beyond that, re-runs bill at the rates above.
                    BYOK re-runs are unlimited and unmetered.
                  </p>
                </div>
              </li>
              <li>
                <span className="n">04</span>
                <div>
                  <h3>Validity</h3>
                  <p className="small muted" style={{ marginTop: 6, maxWidth: "38em" }}>
                    Monthly plan credits do not roll over. PAYG credits never expire.
                    Trial credits (120, ≈ 2 static videos) are one-time, one per email + device.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* 底部 CTA */}
      <section className="section">
        <div
          className="wrap"
          style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}
        >
          <h2 style={{ marginRight: "auto" }}>
            Two tracks, <em>one workbench.</em>
          </h2>
          <a className="btn-ink" href="/login">
            Start Free with BYOK
          </a>
          <a href="/login">Claim 120 trial credits →</a>
        </div>
        <div className="wrap">
          <span className="note">› 体验积分：注册即赠，一次性，绑邮箱 + 设备指纹限一</span>
        </div>
      </section>
    </>
  );
}
