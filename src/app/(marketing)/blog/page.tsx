import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "Blog — AI Video Studio",
  },
  description:
    "Essays on storyboard-first video production, honest AI render economics, and shipping client work without the weekend grind.",
  alternates: { canonical: "/blog" },
};

const POSTS = [
  {
    date: "2026-08-04",
    tag: "Workflow",
    title: "Why storyboard-first beats text-to-video for client work",
    excerpt:
      "One-click generators are fine for drafts you own. For deliverables a client will revise, an editable shot list is the difference between a five-minute fix and a full re-render.",
  },
  {
    date: "2026-07-22",
    tag: "Pricing",
    title: "The real cost of i2v, published: why we price motion separately",
    excerpt:
      "An image-to-video render costs us 10–50× more than a static compose. Most tools hide that in a flat subscription. We would rather show the math and let you choose per video.",
  },
  {
    date: "2026-07-09",
    tag: "BYOK",
    title: "Bring your own keys: a freelancer's guide to zero-marginal-cost video",
    excerpt:
      "Four keys — LLM, image, TTS, i2v — and the platform's metering disappears entirely. How BYOK works, how keys are stored (AES-GCM, never logged), and who it is for.",
  },
  {
    date: "2026-06-25",
    tag: "Delivery",
    title: "Hand over the source: exporting open zips your clients actually own",
    excerpt:
      "MP4 plus storyboard.json, script, per-shot assets and SRT — a delivery package that survives your subscription and imports into any editor. What \"no lock-in\" means in files.",
  },
];

// 营销页：Server component，内联英文。结构对照原型 blog.html。
// 文章为选题示例，暂无正文页（/blog 占位，见 CONTRACT §7）。
export default function BlogPage() {
  return (
    <section className="section">
      <div className="wrap">
        <div className="kicker">Blog</div>
        <h1>
          Notes from the <em>workbench.</em>
        </h1>
        <p className="lede" style={{ marginTop: 20, maxWidth: "50em" }}>
          Essays on storyboard-first video production, honest AI render economics, and shipping
          client work without the weekend grind.
        </p>

        <div style={{ marginTop: 44, maxWidth: "46em" }}>
          {POSTS.map((p) => (
            <article className="post-item" key={p.title}>
              <div className="p-date">
                {p.date} · {p.tag}
              </div>
              <h3>
                <a href="/blog">{p.title}</a>
              </h3>
              <p className="small muted" style={{ maxWidth: "44em" }}>
                {p.excerpt}
              </p>
            </article>
          ))}
        </div>
        <span className="note">占位页：文章为选题示例，暂无正文页（/blog 占位，见 CONTRACT §7）</span>
      </div>
    </section>
  );
}
