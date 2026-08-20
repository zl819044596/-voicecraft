"use client";

import Link from "next/link";
import { PRIMARY_TOOL, SECONDARY_TOOLS } from "@/lib/tools-config";

export default function ToolsIndexPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[18px] font-semibold text-text-primary">工具</h1>
      <p className="mt-1 mb-6 text-[12px] text-text-secondary">
        推荐只用「一键出片」。下面拆开的工具一般不必单独用。
      </p>

      <Link
        href={`/app/tools/${PRIMARY_TOOL.slug}`}
        className="mb-6 flex gap-4 rounded border border-[var(--app-brand)]/40 bg-[var(--app-brand)]/5 p-4 transition-colors hover:border-[var(--app-brand)]"
      >
        <span className="text-2xl">{PRIMARY_TOOL.icon}</span>
        <div>
          <div className="text-[13px] font-semibold text-text-primary">
            {PRIMARY_TOOL.name}
            <span className="ml-2 font-mono text-[10px] tracking-wide text-[var(--app-brand)]">
              主流程
            </span>
          </div>
          <div className="mt-1 text-[11px] text-text-tertiary">{PRIMARY_TOOL.desc}</div>
        </div>
      </Link>

      <p className="mb-3 text-[11px] font-mono uppercase tracking-wider text-text-tertiary">
        更多工具
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECONDARY_TOOLS.map((tool) => (
          <Link
            key={tool.slug}
            href={`/app/tools/${tool.slug}`}
            className="group rounded border border-border bg-bg-subtle p-4 transition-colors hover:border-border-strong"
          >
            <div className="text-2xl">{tool.icon}</div>
            <div className="mt-2 text-[13px] font-semibold text-text-primary group-hover:text-brand">
              {tool.name}
            </div>
            <div className="mt-1 text-[11px] text-text-tertiary">{tool.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
