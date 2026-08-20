import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Instrument_Serif, JetBrains_Mono, Sora } from "next/font/google";
import CookieBanner from "@/components/CookieBanner";
import { SessionProvider } from "@/lib/auth-context";
import { SITE_URL } from "@/lib/site-data";
import "./globals.css";
import "./app-studio.css";

const instrument = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-jb",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AI Video Studio",
    template: "%s · AI Video Studio",
  },
  description: "写文案、审分镜、一键出片。可控短视频工具站——静帧口播，不是黑盒生成。",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "AI Video Studio",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="zh-CN"
      className={`${instrument.variable} ${sora.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif" }}>
        <SessionProvider>{children}</SessionProvider>
        <CookieBanner />
      </body>
    </html>
  );
}
