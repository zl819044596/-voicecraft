import type { Metadata } from "next";
import type { ReactNode } from "react";
import MktHeader from "@/components/marketing/MktHeader";
import RouteBar from "@/components/marketing/RouteBar";
import "../marketing.css";

// Login 页 — 独立渲染（无营销页脚），加载 marketing.css（纸白编辑风）。
// 永不索引：会话级页面无 SEO 价值。
export const metadata: Metadata = {
  title: "Log in",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RouteBar title="登录 · 会话页 noindex" />
      <MktHeader />
      {children}
    </>
  );
}
