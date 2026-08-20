import type { MetadataRoute } from "next";
import {
  SITE_URL,
  TOOLS,
  SCENARIOS,
  PROGRAMMATIC_PAGES,
} from "@/lib/site-data";

// Layered sitemap (PRD §6.6 / development-spec D.4).
//
// Next.js 16 emits a single <urlset> from a sitemap.ts array — there is no
// sitemap-index wrapper — so we group the URL list in code and keep the order
// stable: pages → tools → scenarios → programmatic. 51 URLs total.
//
// lastModified is a build-time constant (the site content is static at this
// stage); once ISR/content changes are added, replace with per-page dates.

const LASTMOD = "2026-08-08";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    { url: `${SITE_URL}/`, lastModified: LASTMOD, changeFrequency: "weekly" as const, priority: 1 },
    { url: `${SITE_URL}/privacy`, lastModified: LASTMOD, changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: LASTMOD, changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${SITE_URL}/cookies`, lastModified: LASTMOD, changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${SITE_URL}/report-abuse`, lastModified: LASTMOD, changeFrequency: "yearly" as const, priority: 0.3 },
  ];

  const tools = TOOLS.map((t) => ({
    url: `${SITE_URL}/tools/${t.slug}`,
    lastModified: LASTMOD,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const scenarios = SCENARIOS.map((s) => ({
    url: `${SITE_URL}/scenarios/${s.slug}`,
    lastModified: LASTMOD,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const programmatic = PROGRAMMATIC_PAGES.map((p) => ({
    url: `${SITE_URL}/${p.slug}`,
    lastModified: LASTMOD,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...pages, ...tools, ...scenarios, ...programmatic];
}
