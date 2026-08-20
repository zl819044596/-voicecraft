"use client";

import Link from "next/link";
import { PRIMARY_TOOL, PRIMARY_TOOL_SLUG, SECONDARY_TOOLS } from "@/lib/tools-config";
import { useTranslation } from "@/i18n";

const TOOL_NAME_EN: Record<string, string> = {
  "script-to-video": "One-click compose",
  "storyboard-generator": "Storyboard",
  "ai-video-script-writer": "Script writer",
  "ai-voiceover": "Voiceover",
  "subtitle-generator": "Subtitles",
  "image-generator": "Image",
};

const TOOL_DESC_EN: Record<string, string> = {
  "script-to-video": "Script → editable board → voice + captions → MP4",
  "storyboard-generator": "Editable shots with retry / upload / stock",
  "ai-video-script-writer": "Topic to short-video narration",
  "ai-voiceover": "Text to speech, multiple voices",
  "subtitle-generator": "Text to SRT captions",
  "image-generator": "Prompt to stills",
};

export default function DashboardPage() {
  const { t, locale } = useTranslation();
  const name = (slug: string, zh: string) => (locale === "en" ? TOOL_NAME_EN[slug] ?? zh : zh);
  const desc = (slug: string, zh: string) => (locale === "en" ? TOOL_DESC_EN[slug] ?? zh : zh);

  return (
    <div className="wb-home">
      <header className="wb-hero">
        <p className="wb-kicker">{t("station.app.homeKicker")}</p>
        <h1>
          {t("station.app.homeH1a")}
          <em style={{ fontStyle: "normal", color: "var(--accent)" }}>{t("station.app.homeH1b")}</em>
        </h1>
        <p className="wb-lede">{t("station.app.homeLede")}</p>
        <Link className="wb-primary" href={`/app/tools/${PRIMARY_TOOL_SLUG}`}>
          {t("station.app.homeCta")}
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </header>

      <Link href={`/app/tools/${PRIMARY_TOOL.slug}`} className="wb-primary-card group">
        <span className="wb-icon">{PRIMARY_TOOL.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="wb-tool-name">{name(PRIMARY_TOOL.slug, PRIMARY_TOOL.name)}</span>
          <p className="wb-tool-desc">{desc(PRIMARY_TOOL.slug, PRIMARY_TOOL.desc)}</p>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="self-center shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
          aria-hidden
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </Link>

      <aside className="wb-aside">
        <strong>{t("station.app.homeSteps")}</strong>
        <ol>
          <li>{t("station.app.homeStep1")}</li>
          <li>{t("station.app.homeStep2")}</li>
          <li>{t("station.app.homeStep3")}</li>
        </ol>
      </aside>

      <section className="wb-secondary">
        <p className="wb-kicker">{t("station.app.homeMore")}</p>
        <p className="wb-secondary-note">{t("station.app.homeMoreNote")}</p>
        <div className="wb-grid wb-grid--secondary">
          {SECONDARY_TOOLS.map((tool) => (
            <Link key={tool.slug} href={`/app/tools/${tool.slug}`} className="wb-tool">
              <span className="wb-idx">{tool.icon}</span>
              <span className="wb-tool-name">{name(tool.slug, tool.name)}</span>
              <span className="wb-tool-desc">{desc(tool.slug, tool.desc)}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
