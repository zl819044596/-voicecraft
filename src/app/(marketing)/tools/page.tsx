import type { Metadata } from "next";
import ToolsIndexClient from "@/components/marketing/ToolsIndexClient";
import { SITE_URL, SITE_TAGLINE } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Tools · 工具｜AI Video Studio",
  description: SITE_TAGLINE,
  alternates: { canonical: `${SITE_URL}/tools` },
};

export default function ToolsIndexPage() {
  return <ToolsIndexClient />;
}
