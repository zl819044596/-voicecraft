import type { Metadata } from "next";
import type { ReactNode } from "react";
import CookieBanner from "@/components/CookieBanner";
import { SessionProvider } from "@/lib/auth-context";
import { SITE_URL } from "@/lib/site-data";
import "./globals.css";
// App 区 Studio Dark 主题（/app 路由子树使用；marketing.css 在其各自的
// 路由组 layout 加载。两者 CSS 变量与类名互不冲突，全局注入一次）。
import "./app-studio.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AI Video Studio — Storyboard-first AI Video Creator",
    template: "%s | AI Video Studio",
  },
  description:
    "Storyboard-first AI video creation workbench. Script, storyboard, per-shot images, voiceover, subtitles and open export — run the whole pipeline on your own keys.",
  alternates: {
    canonical: "/",
  },
};

// Root layout — no chrome. Marketing pages get Nav + Footer from the
// (marketing) route-group layout; /app pages get the workbench layout from
// app/layout.tsx; /login renders standalone by design. The workbench theme is
// fixed dark (marketing.css / app-studio.css control their own surfaces).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full font-sans">
        <SessionProvider>{children}</SessionProvider>
        <CookieBanner />
      </body>
    </html>
  );
}
