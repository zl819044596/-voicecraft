"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";
import { TOOL_BY_SLUG } from "@/lib/tools-config";
import { TOOL_COMPONENTS } from "@/components/tools/Tools";
import { useTranslation } from "@/i18n";

export default function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { t } = useTranslation();
  const tool = TOOL_BY_SLUG[slug];
  if (!tool) notFound();

  const Component = TOOL_COMPONENTS[slug];
  if (!Component) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/tools" className="back-link">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        {t("station.app.toolsTitle")}
      </Link>
      <Component />
    </div>
  );
}
