"use client";

import Link from "next/link";
import { PRIMARY_TOOL, SECONDARY_TOOLS } from "@/lib/tools-config";
import { useTranslation } from "@/i18n";

export default function ToolsIndexPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <span className="tool-tag">Tools</span>
        <h1 className="tool-title">{t("station.app.toolsTitle")}</h1>
        <p className="tool-desc">{t("station.app.toolsLede")}</p>
      </header>

      <Link
        href={`/app/tools/${PRIMARY_TOOL.slug}`}
        className="group mb-8 flex items-center gap-4 rounded-xl border border-brand/40 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-card-hover"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand text-2xl text-white shadow-sm">
          {PRIMARY_TOOL.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[15px] font-bold text-text-primary">
            {PRIMARY_TOOL.name}
            <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">
              {t("station.app.toolsPrimary")}
            </span>
          </span>
          <span className="mt-1 block text-[12.5px] leading-relaxed text-text-secondary">
            {PRIMARY_TOOL.desc}
          </span>
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
          className="shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
          aria-hidden
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </Link>

      <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-text-tertiary">
        {t("station.app.toolsMore")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECONDARY_TOOLS.map((tool) => (
          <Link
            key={tool.slug}
            href={`/app/tools/${tool.slug}`}
            className="group rounded-xl border border-border bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card-hover"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-lg shadow-sm">
              {tool.icon}
            </span>
            <span className="mt-3 block text-[13.5px] font-semibold text-text-primary transition-colors group-hover:text-brand">
              {tool.name}
            </span>
            <span className="mt-1 block text-[12px] leading-relaxed text-text-tertiary">
              {tool.desc}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
