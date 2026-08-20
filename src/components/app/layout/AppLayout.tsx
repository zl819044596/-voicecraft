"use client";

// App 区布局 — 对照原型 app.html：route-bar + app-shell（side-nav + app-main
// [top-bar + main.app-content]）。窄屏下 side-nav 保留（原型无 drawer，
// 简单起见不做移动抽屉；.side-nav 本身可滚动）。

import type { ReactNode } from "react";
import RouteBar from "@/components/marketing/RouteBar";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { TopMetaProvider } from "./TopMeta";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RouteBar title="App 工作台" />
      <TopMetaProvider>
        <div className="app-shell">
          <Sidebar />
          <div className="app-main">
            <TopBar />
            <main className="app-content">{children}</main>
          </div>
        </div>
      </TopMetaProvider>
    </>
  );
}
