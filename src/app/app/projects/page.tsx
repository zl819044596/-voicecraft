"use client";

// PIPELINE_TASK_12 — 项目 (/app/projects), restored to the projects.html
// 6-column table: Project 标题｜Source 来源类型｜Tasks 任务数｜Last activity
// 最近活动｜Status 状态｜操作. Bottom row "+ New project" → /app/quick, plus
// the banner note (项目是任务容器：共享 content_language 与来源素材).
//
//  • Project cell: title (link → latest task, else project detail) + prompt
//    excerpt as sub-line.
//  • Status: project's own status (active green / archived gray).
//  • Last activity: latest task created_at (tasks API is sorted DESC), falling
//    back to the project created_at when no task exists.
//  • 操作: Open wizard → latest task /app/tasks/:id.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useTranslation } from "@/i18n";
import {
  Badge,
  Btn,
  Card,
  CellSub,
  CellTitle,
  DataTable,
  EmptyState,
  PageHeader,
  Td,
  Tr,
  type BadgeVariant,
} from "@/components/app/proto";

type ProjectRow = {
  id: string;
  title: string;
  prompt: string | null;
  source_type: string;
  status: string;
  task_count?: number;
  created_at: string;
};

type TaskRow = {
  id: string;
  project_id: string;
  status: string;
  created_at: string;
};

const STATUS_BADGE: Record<string, BadgeVariant> = {
  active: "orange",
  archived: "gray",
};

function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

export default function ProjectsPage() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [latestByProject, setLatestByProject] = useState<Record<string, TaskRow>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [pData, tData] = await Promise.all([
        apiFetch<{ items: ProjectRow[] }>("/api/projects", { cache: "no-store" }),
        apiFetch<{ items: TaskRow[] }>("/api/tasks", { cache: "no-store" }),
      ]);
      setProjects(pData.items);

      // /api/tasks is ordered by created_at DESC → the first task per project
      // is its latest run (used for "Last activity" + click-through).
      const latest: Record<string, TaskRow> = {};
      for (const task of tData.items) {
        if (!latest[task.project_id]) latest[task.project_id] = task;
      }
      setLatestByProject(latest);
      setLoadError(null);
    } catch {
      setProjects([]);
      setLoadError(t("app.loadProjectsError"));
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sourceLabel = useMemo<Record<string, string>>(
    () => ({
      text: t("projects.sourceText"),
      url: t("projects.sourceUrl"),
      topic: t("projects.sourceTopic"),
      product: t("projects.sourceProduct"),
    }),
    [t],
  );

  return (
    <div className="mx-auto w-full">
      <PageHeader
        title={t("projects.pageTitle")}
        actions={
          <Btn variant="primary" href="/app/quick">
            {t("projects.newProject")}
          </Btn>
        }
      />

      {loadError ? (
        <div className="mb-4 rounded-lg border border-error/30 bg-error-bg px-4 py-3 text-sm text-error">
          {loadError}
        </div>
      ) : null}

      {projects === null ? (
        <Card>
          <div className="py-10 text-center text-sm text-text-secondary">
            {t("common.loading")}
          </div>
        </Card>
      ) : (
        <Card>
          {projects.length === 0 ? (
            <EmptyState
              symbol="▤"
              title={t("projects.noProjects")}
              action={
                <Btn variant="primary" href="/app/quick">
                  {t("projects.newProject")}
                </Btn>
              }
            />
          ) : (
            <DataTable
              columns={[
                t("projects.colProject"),
                t("projects.colSource"),
                t("projects.colTasksCount"),
                t("projects.colLastActivity"),
                t("projects.colStatus"),
                t("projects.colOps"),
              ]}
            >
              {projects.map((p) => {
                const latest = latestByProject[p.id];
                const href = latest ? `/app/tasks/${latest.id}` : `/app/projects/${p.id}`;
                const lastActivity = latest?.created_at ?? p.created_at;
                const badge = STATUS_BADGE[p.status] ?? "gray";
                const statusLabel =
                  p.status === "active"
                    ? t("projects.statusActive")
                    : p.status === "archived"
                      ? t("projects.statusArchived")
                      : p.status;
                const sourceLabelText = sourceLabel[p.source_type] ?? p.source_type;
                const sub = p.prompt ? truncate(p.prompt, 64) : "—";
                return (
                  <Tr key={p.id}>
                    <Td className="max-w-[280px]">
                      <CellTitle>
                        <Link
                          href={href}
                          className="block truncate text-text-primary hover:text-brand"
                        >
                          {p.title}
                        </Link>
                      </CellTitle>
                      <CellSub>{sub}</CellSub>
                    </Td>
                    <Td className="whitespace-nowrap text-text-secondary">{sourceLabelText}</Td>
                    <Td className="whitespace-nowrap text-text-secondary">{p.task_count ?? 0}</Td>
                    <Td className="whitespace-nowrap text-text-secondary">
                      {shortDateTime(lastActivity)}
                    </Td>
                    <Td>
                      <Badge variant={badge} dot>
                        {statusLabel}
                      </Badge>
                    </Td>
                    <Td>
                      <Link
                        href={href}
                        className="whitespace-nowrap text-[12px] font-semibold text-brand hover:brightness-110"
                      >
                        {t("projects.btnOpenWizard")}
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </DataTable>
          )}

          {/* ── "+ New project" 行 ── */}
          <div className="border-t border-border pt-2">
            <Link
              href="/app/quick"
              className="block rounded-md px-3 py-2 text-[12.5px] font-semibold text-brand hover:bg-bg-subtle"
            >
              {t("projects.newProject")}
            </Link>
          </div>

          {/* ── banner note ── */}
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-bg-subtle px-3 py-2.5 text-[12px] leading-5 text-text-secondary">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-success" />
            <span>{t("projects.bannerText")}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
