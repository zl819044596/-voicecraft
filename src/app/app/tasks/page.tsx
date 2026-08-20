"use client";

// PIPELINE_TASK_12 — 视频任务 (/app/tasks), restored to the tasks.html 8-column
// table (Task｜Mode｜Track｜Status｜Progress｜Created｜Duration｜操作).
//
//  • Task cell: project title (task name) + project prompt excerpt as the
//    sub-line (the previous P-XXXX id prefix is gone).
//  • Progress: "L{current_step}/{total}" for running, "L{total}/{total}" for
//    done, and for failed "L{step}/{total} · {reason}" (reason from the failed
//    step's error via the per-page detail fetch).
//  • Failed-402 (reason mentions 402 / insufficient credits) → 操作 Top up →
//    /app/billing; other failed → Retry (real POST /api/tasks/:id/rerun).
//  • Status filter is underline tabs (全部/running/done/failed + counts);
//    pagination footer notes "运行中 2s 轮询 · 托管档 failed 自动解冻积分".

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useTranslation } from "@/i18n";
import type { Project, TaskConfig } from "@/lib/app-data";
import {
  Badge,
  Btn,
  Card,
  CellSub,
  CellTitle,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  Td,
  Tr,
  type BadgeVariant,
} from "@/components/app/proto";

const PAGE_SIZE = 10;
const TOTAL_STEPS = { static: 9, i2v: 10 } as const;

type Filter = "all" | "running" | "done" | "failed";

type TaskListItem = {
  id: string;
  project_id: string;
  mode: "static" | "i2v";
  track: string | null;
  status: string;
  current_step: number;
  progress: number;
  created_at: string;
  updated_at?: string;
};

type TaskDetail = {
  config?: TaskConfig | null;
  steps?: Array<{ step: number; status: string; error: string | null }>;
};

const STATUS_BADGE: Record<string, BadgeVariant> = {
  queued: "orange",
  waiting: "orange",
  running: "orange",
  done: "green",
  failed: "red",
  cancelled: "gray",
};

function isRunning(status: string): boolean {
  return status === "running" || status === "queued" || status === "waiting";
}

function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function durationText(status: string, created: string, updated: string): string {
  if (status !== "done") return "—";
  const start = new Date(created).getTime();
  const end = new Date(updated).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
  const secs = Math.floor((end - start) / 1000);
  return `${Math.floor(secs / 60)}m${String(secs % 60).padStart(2, "0")}s`;
}

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

function failedStepError(detail: TaskDetail | null): string | null {
  const step = detail?.steps?.find((s) => s.status === "failed");
  if (!step?.error) return null;
  return truncate(step.error, 48);
}

function isCreditFailure(detail: TaskDetail | null): boolean {
  const err = failedStepError(detail) ?? "";
  return /402|insufficient credits|insufficient_credits|积分不足/i.test(err);
}

function pageItems(total: number, cur: number): Array<number | "…"> {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | "…"> = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(total - 1, cur + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i += 1) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

export default function TasksPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [details, setDetails] = useState<Record<string, TaskDetail>>({});

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [retryId, setRetryId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [tasksRes, projectsRes] = await Promise.allSettled([
        apiFetch<{ items: TaskListItem[] }>("/api/tasks", { cache: "no-store" }),
        apiFetch<{ items: Project[] }>("/api/projects", { cache: "no-store" }),
      ]);
      if (cancelled) return;
      if (tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value.items)) {
        setTasks(tasksRes.value.items);
      }
      if (projectsRes.status === "fulfilled" && Array.isArray(projectsRes.value.items)) {
        setProjects(projectsRes.value.items);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Filtering + pagination.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter === "running" && !isRunning(task.status)) return false;
      if (filter === "done" && task.status !== "done") return false;
      if (filter === "failed" && task.status !== "failed") return false;
      if (q) {
        const project = projectById.get(task.project_id);
        const title = project?.title ?? task.project_id;
        if (!title.toLowerCase().includes(q) && !task.project_id.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, filter, query, projectById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageTasks = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  // Enrich the current page's rows with detail (config + failed step error),
  // bounded to PAGE_SIZE rows.
  const pageIdsKey = pageTasks.map((x) => x.id).join(",");
  useEffect(() => {
    if (pageTasks.length === 0) return;
    let cancelled = false;
    const ids = pageTasks.map((x) => x.id);
    Promise.allSettled(
      ids.map((id) =>
        apiFetch<TaskDetail>(`/api/tasks/${encodeURIComponent(id)}`, { cache: "no-store" }),
      ),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, TaskDetail> = {};
      results.forEach((res, i) => {
        if (res.status === "fulfilled") next[ids[i]] = res.value;
      });
      setDetails((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdsKey]);

  const allCount = tasks.length;
  const runningCount = tasks.filter((x) => isRunning(x.status)).length;
  const doneCount = tasks.filter((x) => x.status === "done").length;
  const failedCount = tasks.filter((x) => x.status === "failed").length;

  const tabs: Array<{ key: Filter; label: string; count: number }> = [
    { key: "all", label: t("tasks.filterAll").split(" · ")[0], count: allCount },
    { key: "running", label: t("tasks.filterRunning").split(" · ")[0], count: runningCount },
    { key: "done", label: t("tasks.filterDone").split(" · ")[0], count: doneCount },
    { key: "failed", label: t("tasks.filterFailed").split(" · ")[0], count: failedCount },
  ];

  const startDisplay = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endDisplay = Math.min(filtered.length, safePage * PAGE_SIZE);

  const handleRetry = async (task: TaskListItem) => {
    if (retryId) return;
    setRetryId(task.id);
    setRetryError(null);
    try {
      await apiFetch(`/api/tasks/${encodeURIComponent(task.id)}/rerun`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_step: task.current_step || 1 }),
      });
      router.push(`/app/tasks/${task.id}`);
    } catch (err) {
      setRetryError(t("tasks.retryFailed", { msg: err instanceof Error ? err.message : "error" }));
      setRetryId(null);
    }
  };

  return (
    <div className="mx-auto w-full">
      <PageHeader
        title={t("tasks.pageTitle")}
        actions={
          <>
            <Btn href="/app/tasks/new">{t("tasks.newTask")}</Btn>
            <Btn variant="primary" href="/app/quick">
              {t("tasks.quickGen")}
            </Btn>
          </>
        }
      />

      {/* ── 状态筛选：下划线 tab + 搜索 ── */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setFilter(tab.key);
              setPage(1);
            }}
            className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 px-0.5 pb-2 text-[12px] transition ${
              filter === tab.key
                ? "border-brand font-semibold text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
            <span className="ml-1 text-[11px] text-text-tertiary">{tab.count}</span>
          </button>
        ))}
        <span className="flex-1" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder={t("tasks.searchPlaceholder")}
          className="mb-2 w-[220px]"
        />
      </div>

      {/* ── 任务表 ── */}
      <Card>
        {retryError ? (
          <div className="mb-3 rounded-lg border border-error/30 bg-error-bg px-3 py-2 text-[12px] text-error">
            {retryError}
          </div>
        ) : null}
        {filtered.length === 0 ? (
          <EmptyState title={t("tasks.noTasks")} />
        ) : (
          <DataTable
            columns={[
              t("tasks.colTask"),
              t("tasks.colMode"),
              t("tasks.colTrack"),
              t("tasks.colStatus"),
              t("tasks.colProgress"),
              t("tasks.colCreated"),
              t("tasks.colDuration"),
              t("tasks.colActions"),
            ]}
          >
            {pageTasks.map((task) => {
              const project = projectById.get(task.project_id);
              const detail = details[task.id];
              const total = TOTAL_STEPS[task.mode] ?? 9;
              const badge = STATUS_BADGE[task.status] ?? "gray";
              const statusLabel = t(`pipelineStatus.${task.status}`);
              const sub = project?.prompt ? truncate(project.prompt, 64) : project?.title ?? "—";

              let progress: string;
              if (task.status === "done") {
                progress = `L${total}/${total}`;
              } else if (task.status === "failed") {
                const reason = failedStepError(detail);
                progress = reason
                  ? `L${task.current_step}/${total} · ${reason}`
                  : `L${task.current_step}/${total}`;
              } else if (task.status === "queued" || task.status === "waiting") {
                progress = "—";
              } else {
                progress = `L${task.current_step}/${total}`;
              }

              const creditFailure = task.status === "failed" && isCreditFailure(detail);

              return (
                <Tr key={task.id} onClick={() => router.push(`/app/tasks/${task.id}`)}>
                  <Td className="max-w-[280px]">
                    <CellTitle>
                      <Link
                        href={`/app/tasks/${task.id}`}
                        className="block truncate text-text-primary hover:text-brand"
                      >
                        {project?.title ?? task.project_id}
                      </Link>
                    </CellTitle>
                    <CellSub>{sub}</CellSub>
                  </Td>
                  <Td className="whitespace-nowrap text-text-secondary">{task.mode}</Td>
                  <Td className="whitespace-nowrap text-text-secondary">{task.track ?? "—"}</Td>
                  <Td>
                    <Badge variant={badge} dot>
                      {statusLabel}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-[12.5px] text-text-secondary">{progress}</Td>
                  <Td className="whitespace-nowrap text-text-secondary">
                    {shortDateTime(task.created_at)}
                  </Td>
                  <Td className="whitespace-nowrap text-text-secondary">
                    {durationText(task.status, task.created_at, task.updated_at ?? task.created_at)}
                  </Td>
                  <Td>
                    {task.status === "failed" ? (
                      creditFailure ? (
                        <Link
                          href="/app/billing"
                          onClick={(e) => e.stopPropagation()}
                          className="whitespace-nowrap text-[12px] font-semibold text-brand hover:brightness-110"
                        >
                          {t("tasks.actionTopup")}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRetry(task);
                          }}
                          disabled={retryId === task.id}
                          className="cursor-pointer select-none whitespace-nowrap text-[12px] font-semibold text-brand hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {retryId === task.id ? t("common.saving") : t("tasks.actionRetry")}
                        </button>
                      )
                    ) : (
                      <Link
                        href={`/app/tasks/${task.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="whitespace-nowrap text-[12px] font-semibold text-text-secondary hover:text-brand"
                      >
                        {t("tasks.actionOpen")}
                      </Link>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </DataTable>
        )}

        {/* ── 分页 + note ── */}
        {filtered.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
              <span>
                {t("tasks.paginationShow", {
                  start: startDisplay,
                  end: endDisplay,
                  total: filtered.length,
                })}
                <span className="ml-3 text-[11px] text-text-tertiary">{t("tasks.pollingNote")}</span>
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Btn size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
                  {t("tasks.prevPage")}
                </Btn>
                {pageItems(totalPages, safePage).map((item, i) =>
                  item === "…" ? (
                    <span key={`e-${i}`} className="px-1.5 text-text-tertiary">
                      …
                    </span>
                  ) : (
                    <Btn
                      key={item}
                      size="sm"
                      variant={item === safePage ? "primary" : "default"}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </Btn>
                  ),
                )}
                <Btn
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  {t("tasks.nextPage")}
                </Btn>
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
