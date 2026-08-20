import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-data";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/app/", "/app", "/login", "/login/", "/settings", "/settings/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
