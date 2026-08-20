"use client";

// Small shared presentational components for the workbench (Task 9).
// Uses the dark-purple design tokens and the i18n status labels.

import { STATUS_STYLE, type StepStatus } from "@/lib/app-data";
import { useTranslation } from "@/i18n";

export function StatusBadge({ status }: { status: StepStatus }) {
  const { t } = useTranslation();
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.queued;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${s.badge}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden />
      {t(`pipelineStatus.${status}`)}
    </span>
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-bg-muted">
        <div
          className="h-full rounded bg-brand transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-xs text-text-tertiary">
        {pct}%
      </span>
    </div>
  );
}

export function ProjectStatusBadge({ status }: { status: string }) {
  const map: Record<string, StepStatus> = {
    draft: "queued",
    queued: "queued",
    running: "running",
    waiting: "waiting",
    done: "done",
    failed: "failed",
    cancelled: "cancelled",
  };
  return <StatusBadge status={map[status] ?? "queued"} />;
}

export function Spinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-middle"
      aria-label="loading"
    />
  );
}
