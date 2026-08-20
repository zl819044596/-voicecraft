import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-data";

// robots.txt — allow indexable marketing/SEO pages, block app-area routes.
// App pages are additionally noindexed via their own metadata; robots.txt
// covers the ones that exist today and reserves /api and auth routes.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/settings",
        "/settings/",
        "/login",
        "/login/",
        "/dashboard",
        "/projects",
        "/quick-create",
        "/advanced-create",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
