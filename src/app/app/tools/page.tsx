"use client";

import Link from "next/link";
import { PRIMARY_TOOL, SECONDARY_TOOLS } from "@/lib/tools-config";
import { ToolIcon } from "@/components/tools/Tools";
import { useTranslation } from "@/i18n";

function ArrowIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="tool-card-arrow"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function ToolsIndexPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl">
      <header className="tool-header">
        <span className="tool-tag">Tools</span>
        <h1 className="tool-title">{t("station.app.toolsTitle")}</h1>
        <p className="tool-desc">{t("station.app.toolsLede")}</p>
      </header>

      <Link href={`/app/tools/${PRIMARY_TOOL.slug}`} className="tool-card mb-6">
        <span className="tool-card-icon">
          <ToolIcon slug={PRIMARY_TOOL.slug} />
        </span>
        <span className="tool-card-body">
          <span className="tool-card-name">
            {PRIMARY_TOOL.name}
            <span className="tool-card-badge">{t("station.app.toolsPrimary")}</span>
          </span>
          <span className="tool-card-desc">{PRIMARY_TOOL.desc}</span>
        </span>
        <ArrowIcon />
      </Link>

      <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-text-tertiary">
        {t("station.app.toolsMore")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECONDARY_TOOLS.map((tool) => (
          <Link
            key={tool.slug}
            href={`/app/tools/${tool.slug}`}
            className="tool-card tool-card--grid"
          >
            <span className="tool-card-icon">
              <ToolIcon slug={tool.slug} />
            </span>
            <span className="tool-card-name">{tool.name}</span>
            <span className="tool-card-desc">{tool.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
