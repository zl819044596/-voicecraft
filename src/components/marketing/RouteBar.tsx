"use client";

// 路由条 — 原型每页顶部 28px 细条：`/app` 路由 + 页面说明（原型 app.html:
// `<div class="route-bar"><b>/app</b> 工作台 Dashboard</div>`）。全环境渲染。

import { usePathname } from "next/navigation";

export default function RouteBar({ title }: { title?: string }) {
  const pathname = usePathname() ?? "/";
  return (
    <div className="route-bar">
      <b>{pathname}</b>
      {title ? <span> · {title}</span> : null}
    </div>
  );
}
