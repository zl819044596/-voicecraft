import type { MetadataRoute } from "next";
import {
  SITE_URL,
  TOOLS,
  SCENARIOS,
  PROGRAMMATIC_PAGES,
} from "@/lib/site-data";

const LASTMOD = "2026-08-20";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    { url: `${SITE_URL}/`, lastModified: LASTMOD, changeFrequency: "weekly" as const, priority: 1 },
    { url: `${SITE_URL}/tools`, lastModified: LASTMOD, changeFrequency: "weekly" as const, priority: 0.9 },
    { url: `${SITE_URL}/pricing`, lastModified: LASTMOD, changeFrequency: "monthly" as const, priority: 0.7 },
    { url: `${SITE_URL}/privacy`, lastModified: LASTMOD, changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: LASTMOD, changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${SITE_URL}/cookies`, lastModified: LASTMOD, changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${SITE_URL}/report-abuse`, lastModified: LASTMOD, changeFrequency: "yearly" as const, priority: 0.2 },
  ];

  const tools = TOOLS.map((t) => ({
    url: `${SITE_URL}/tools/${t.slug}`,
    lastModified: LASTMOD,
    changeFrequency: "monthly" as const,
    priority: t.slug === "script-to-video" ? 0.95 : 0.8,
  }));

  const scenarios = SCENARIOS.map((s) => ({
    url: `${SITE_URL}/scenarios/${s.slug}`,
    lastModified: LASTMOD,
    changeFrequency: "monthly" as const,
    priority: 0.75,
  }));

  const programmatic = PROGRAMMATIC_PAGES.map((p) => ({
    url: `${SITE_URL}/${p.slug}`,
    lastModified: LASTMOD,
    changeFrequency: "monthly" as const,
    priority: 0.55,
  }));

  return [...pages, ...tools, ...scenarios, ...programmatic];
}
