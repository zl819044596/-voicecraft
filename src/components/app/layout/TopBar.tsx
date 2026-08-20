"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TOOL_BY_SLUG } from "@/lib/tools-config";
import { useTranslation } from "@/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

const TOOL_NAME_EN: Record<string, string> = {
  "script-to-video": "One-click compose",
  "storyboard-generator": "Storyboard",
  "ai-video-script-writer": "Script writer",
  "ai-voiceover": "Voiceover",
  "subtitle-generator": "Subtitles",
  "image-generator": "Image",
};

export function TopBar() {
  const pathname = usePathname();
  const { user, freeQuota, refresh, logout } = useAuth();
  const { t, locale } = useTranslation();
  const initial = (user?.nickname || user?.email || "A").slice(0, 1).toUpperCase();

  useEffect(() => {
    const onQuota = () => {
      void refresh();
    };
    window.addEventListener("avs:quota", onQuota);
    return () => window.removeEventListener("avs:quota", onQuota);
  }, [refresh]);

  let title = t("station.app.sideHome");
  let meta = t("station.app.metaHome");
  if (pathname.startsWith("/app/tools/")) {
    const slug = pathname.slice("/app/tools/".length).split("/")[0] ?? "";
    const tool = TOOL_BY_SLUG[slug];
    if (tool) {
      title = locale === "en" ? TOOL_NAME_EN[slug] ?? tool.name : tool.name;
      meta = tool.primary ? t("station.app.metaCompose") : t("station.app.metaTool");
    } else {
      title = t("station.app.toolsTitle");
      meta = "";
    }
  } else if (pathname.startsWith("/app/settings")) {
    title = t("station.app.settingsTitle");
    meta = t("station.app.metaAccount");
  }

  const remaining = freeQuota?.remaining;
  const limit = freeQuota?.limit;

  return (
    <header className="top-bar">
      <div className="top-title-wrap">
        <span className="page-title">{title}</span>
        {meta ? <span className="top-meta">{meta}</span> : null}
      </div>
      <span className="spacer" />
      <div className="top-actions">
        <LocaleSwitcher />
        {typeof remaining === "number" && typeof limit === "number" ? (
          <span className="top-credits" title={t("station.app.quotaTip")}>
            {t("station.app.quotaToday", { remaining, limit })}
          </span>
        ) : null}
        <button
          type="button"
          className="top-logout"
          onClick={() => void logout()}
          title={t("station.app.logout")}
        >
          {t("station.app.logout")}
        </button>
        <span className="avatar" title={user?.email ?? ""}>
          {initial}
        </span>
      </div>
    </header>
  );
}
