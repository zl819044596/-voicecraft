import type { Metadata } from "next";
import HomeClient from "@/components/marketing/HomeClient";
import { SITE_URL, SITE_TAGLINE } from "@/lib/site-data";

export const metadata: Metadata = {
  title: { absolute: "AI Video Studio｜可控出片 · Controllable compose" },
  description: SITE_TAGLINE,
  alternates: {
    canonical: "/",
    languages: {
      "zh-CN": SITE_URL,
      en: SITE_URL,
      "x-default": SITE_URL,
    },
  },
  openGraph: {
    title: "AI Video Studio",
    description: SITE_TAGLINE,
    url: SITE_URL,
    type: "website",
    locale: "zh_CN",
    alternateLocale: ["en_US"],
    siteName: "AI Video Studio",
  },
};

export default function Home() {
  return <HomeClient />;
}
