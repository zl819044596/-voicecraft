"use client";

import { useState } from "react";
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

/* 轻量线性图标（无第三方依赖） */
function NavIcon({ name }: { name: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case "film":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
        </svg>
      );
    case "storyboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="14" rx="2" />
          <path d="M8 21h8M12 17v4M7 7h2M11 7h2M15 7h2M7 11h2M11 11h2M15 11h2" />
        </svg>
      );
    case "script":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "voice":
      return (
        <svg {...common}>
          <rect x="9" y="2.5" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
        </svg>
      );
    case "subtitles":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M7 11h10M7 15h6" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      );
    case "quota":
      return (
        <svg {...common}>
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="M2.5 10h19M6 15h4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

/** 工具 slug → 导航图标 */
const TOOL_ICONS: Record<string, string> = {
  "script-to-video": "film",
  "storyboard-generator": "storyboard",
  "ai-video-script-writer": "script",
  "ai-voiceover": "voice",
  "subtitle-generator": "subtitles",
  "image-generator": "image",
};

export function Sidebar() {
  const pathname = usePathname();
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const isActive = (href: string) =>
    href === "/app"
      ? pathname === "/app"
      : pathname === href || pathname.startsWith(`${href}/`);

  const toolName = (slug: string, zhName: string) =>
    locale === "en" ? TOOL_NAME_EN[slug] ?? zhName : zhName;

  return (
    <>
      {/* 移动端汉堡按钮 */}
      <button
        type="button"
        className={`nav-toggle${open ? " open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
      >
        {open ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      {/* 移动端遮罩 */}
      <div className={`nav-overlay${open ? " open" : ""}`} onClick={close} aria-hidden />

      <aside className={`side-nav${open ? " open" : ""}`}>
        <Link className="side-logo" href="/" onClick={close}>
          <span className="side-logo-mark">AI</span>
          <span>
            ai video <em>studio</em>
          </span>
        </Link>

        <div className="nav-group">{t("station.app.sideMain")}</div>
        <Link
          href="/app"
          className={`nav-item${isActive("/app") && pathname === "/app" ? " active" : ""}`}
          onClick={close}
        >
          <NavIcon name="home" />
          {t("station.app.sideHome")}
        </Link>
        <Link
          href={PRIMARY_HREF}
          className={`nav-item${isActive(PRIMARY_HREF) ? " active" : ""}`}
          onClick={close}
        >
          <NavIcon name="film" />
          {t("station.app.sideCompose")}
        </Link>

        <div className="nav-group">{t("station.app.sideMore")}</div>
        {SECONDARY_TOOLS.map((tool) => (
          <Link
            key={tool.slug}
            href={`/app/tools/${tool.slug}`}
            className={`nav-item${isActive(`/app/tools/${tool.slug}`) ? " active" : ""}`}
            onClick={close}
          >
            <NavIcon name={TOOL_ICONS[tool.slug] ?? "home"} />
            {toolName(tool.slug, tool.name)}
          </Link>
        ))}

        <div className="nav-group">{t("station.app.sideAccount")}</div>
        <Link
          href="/app/settings"
          className={`nav-item${isActive("/app/settings") ? " active" : ""}`}
          onClick={close}
        >
          <NavIcon name="quota" />
          {t("station.app.sideQuota")}
        </Link>

        <div className="side-footer">
          <LocaleSwitcher />
        </div>
      </aside>
    </>
  );
}
