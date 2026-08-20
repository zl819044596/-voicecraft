"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_TOOL_SLUG, SECONDARY_TOOLS } from "@/lib/tools-config";
import { useTranslation } from "@/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

const PRIMARY_HREF = `/app/tools/${PRIMARY_TOOL_SLUG}`;

/** Tool display names stay bilingual via config + locale */
const TOOL_NAME_EN: Record<string, string> = {
  "script-to-video": "One-click compose",
  "storyboard-generator": "Storyboard",
  "ai-video-script-writer": "Script writer",
  "ai-voiceover": "Voiceover",
  "subtitle-generator": "Subtitles",
  "image-generator": "Image",
};

export function Sidebar() {
  const pathname = usePathname();
  const { t, locale } = useTranslation();

  const isActive = (href: string) =>
    href === "/app"
      ? pathname === "/app"
      : pathname === href || pathname.startsWith(`${href}/`);

  const toolName = (slug: string, zhName: string) =>
    locale === "en" ? TOOL_NAME_EN[slug] ?? zhName : zhName;

  return (
    <aside className="side-nav">
      <Link className="side-logo" href="/">
        ai video <em>studio</em>
      </Link>

      <div className="nav-group">{t("station.app.sideMain")}</div>
      <Link href="/app" className={`nav-item${isActive("/app") && pathname === "/app" ? " active" : ""}`}>
        {t("station.app.sideHome")}
      </Link>
      <Link href={PRIMARY_HREF} className={`nav-item${isActive(PRIMARY_HREF) ? " active" : ""}`}>
        {t("station.app.sideCompose")}
      </Link>

      <div className="nav-group">{t("station.app.sideMore")}</div>
      {SECONDARY_TOOLS.map((tool) => (
        <Link
          key={tool.slug}
          href={`/app/tools/${tool.slug}`}
          className={`nav-item${isActive(`/app/tools/${tool.slug}`) ? " active" : ""}`}
        >
          {toolName(tool.slug, tool.name)}
        </Link>
      ))}

      <div className="nav-group">{t("station.app.sideAccount")}</div>
      <Link
        href="/app/settings"
        className={`nav-item${isActive("/app/settings") ? " active" : ""}`}
      >
        {t("station.app.sideQuota")}
      </Link>

      <div style={{ marginTop: "auto", padding: "16px 12px 8px" }}>
        <LocaleSwitcher />
      </div>
    </aside>
  );
}
