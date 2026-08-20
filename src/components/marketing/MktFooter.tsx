import Link from "next/link";

// 营销页脚 — 对照原型 index.html 的 mkt-footer：五栏链接 + 版权条。
// Server 组件，文案固定英文（营销区默认 en）。

export default function MktFooter() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-footer-in">
        <div className="f-col">
          <div className="f-brand">AI Video Studio</div>
          <p className="small muted" style={{ maxWidth: "22em" }}>
            Storyboard-first AI video workbench. Every step editable, re-runnable, exportable.
          </p>
        </div>
        <div className="f-col">
          <div className="f-h">Product</div>
          <Link href="/tools/storyboard-generator">Tools</Link>
          <Link href="/scenarios/client-video-delivery">Scenarios</Link>
          <Link href="/pricing">Pricing</Link>
        </div>
        <div className="f-col">
          <div className="f-h">App</div>
          <Link href="/login">Login</Link>
          <Link href="/app">Workbench</Link>
          <Link href="/app/billing">Billing</Link>
        </div>
        <div className="f-col">
          <div className="f-h">Legal</div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/cookies">Cookies</Link>
        </div>
        <div className="f-col">
          <div className="f-h">Trust</div>
          <Link href="/report-abuse">Report Abuse</Link>
          <Link href="/blog">Blog</Link>
        </div>
      </div>
      <div className="mkt-footer-base">
        <span>© 2026 AI Video Studio</span>
        <span className="spacer" />
        <span>Tools / Scenarios / Legal pages are live routes</span>
      </div>
    </footer>
  );
}
