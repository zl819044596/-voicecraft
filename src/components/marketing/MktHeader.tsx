"use client";

// 营销页眉 — 对照原型 index.html 的 mkt-header：logo + Tools/Scenarios/Pricing
// 导航 + Login + Start Free。Client 组件以 usePathname 高亮当前分区。

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function MktHeader() {
  const pathname = usePathname() ?? "/";
  const on = (prefix: string) => pathname.startsWith(prefix);

  return (
    <header className="mkt-header">
      <div className="mkt-header-in">
        <Link className="mkt-logo" href="/">
          AI Video Studio
        </Link>
        <nav className="mkt-nav">
          <Link href="/tools/storyboard-generator" className={on("/tools") ? "on" : undefined}>
            Tools
          </Link>
          <Link href="/scenarios/client-video-delivery" className={on("/scenarios") ? "on" : undefined}>
            Scenarios
          </Link>
          <Link href="/pricing" className={on("/pricing") ? "on" : undefined}>
            Pricing
          </Link>
        </nav>
        <span className="spacer" />
        <nav className="mkt-nav">
          <Link href="/login" className={on("/login") ? "on" : undefined}>
            Login
          </Link>
        </nav>
        <Link className="btn-ink" href="/login" style={{ padding: "8px 16px" }}>
          Start Free
        </Link>
      </div>
    </header>
  );
}
