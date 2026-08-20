import type { ReactNode } from "react";
import MktFooter from "@/components/marketing/MktFooter";
import MktHeader from "@/components/marketing/MktHeader";
import RouteBar from "@/components/marketing/RouteBar";
import "../marketing.css";

// Marketing route-group layout — 对照原型：route-bar + mkt-header + 正文 + mkt-footer。
// 营销区文案默认 en（server 内联英文），样式用移植自 style-marketing.css 的 marketing.css。
// /app 工作台与 /login 用自己的 layout（login 也加载 marketing.css，同样纸白编辑风）。
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RouteBar title="营销区 · SSR/SSG" />
      <MktHeader />
      <div>{children}</div>
      <MktFooter />
    </>
  );
}
