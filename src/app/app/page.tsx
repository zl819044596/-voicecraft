"use client";

// Workbench dashboard (/app) — rebuilt from the static prototype app.html,
// redesigned with a Linear-style card system (dark theme, subtle surfaces).
//
//  • 4 stat cards (icon + big number + caption): 本月任务 / 项目 / 积分余额 / 模型通道
//  • Quick-entry cards (icon + 中文 + 说明) → /app/quick · /app/models · /app/billing
//  • Recent tasks table (8 cols) — live polling (2s) while any task runs,
//    Retry for failed rows, empty state keeps the table structure
//  • Projects table (6 cols) with a "+ New project" footer row
//
// Data sources:
//  GET /api/tasks        → rows (mode/track/status/current_step/created_at) +
//                          month_total; per-row config (model · preset) and step
//                          timings (duration) come from GET /api/tasks/:id
//                          (the flat list endpoint carries neither)
//  GET /api/projects     → project rows (source_type/task_count/status)
//  GET /api/credits      → balance + static/i2v equivalents for the credit stat
//  GET /api/model-configs→ enabled provider classes for the channel stat
//
// Real data only — no demo numbers; missing data renders as 0 / —.

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useTranslation } from "@/i18n";
import {
  STORYBOARD_PRESETS,
  type ModelConfig,
  type ModelSelectionSpec,
  type ProjectSummary,
  type TaskConfig,
  type TaskListItem,
  type TaskStep,
} from "@/lib/app-data";
import {
  Badge,
  Btn,
  DataTable,
  Td,
  Tr,
  type BadgeVariant,
} from "@/components/app/proto";

// task.status → proto Badge variant.
const STATUS_BADGE: Record<string, BadgeVariant> = {
  queued: "orange",
  waiting: "orange",
  running: "orange",
  done: "green",
  failed: "red",
  cancelled: "gray",
};

const TOTAL_STEPS = { static: 9, i2v: 10 } as const;

// GET /api/credits payload (billing.js) — balance + static/i2v equivalents.
type CreditsInfo = {
  credits: number;
  trial_credits: number;
  trial_granted: boolean;
  equivalents?: { static_count?: number; i2v_count?: number } | null;
};

// Per-row task detail we keep: enough for the Model · Preset cell and the
// done/failed duration (the flat list row has neither config nor timings).
type RowDetail = {
  config?: TaskConfig | null;
  steps?: TaskStep[];
};

type TaskListResponse = {
  items: TaskListItem[];
  month_total?: number;
};

function isActiveStatus(status: string): boolean {
  return status === "queued" || status === "waiting" || status === "running";
}

function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// Step cell: done → L9/9, failed → L4, queued → —, otherwise L5/10.
function stepLabel(task: TaskListItem): string {
  if (task.status === "queued" || task.status === "waiting") return "—";
  const total = TOTAL_STEPS[task.mode];
  if (task.status === "done") return `L${total}/${total}`;
  if (task.status === "failed") return task.current_step > 0 ? `L${task.current_step}` : "—";
  return task.current_step > 0 ? `L${task.current_step}/${total}` : "—";
}

// done/failed duration from the detail steps' timestamps; live statuses show —.
// Rendered in Chinese: 4分31秒 / 45秒.
function durationLabel(task: TaskListItem, detail?: RowDetail): string {
  if (task.status !== "done" && task.status !== "failed") return "—";
  const times: number[] = [];
  for (const s of detail?.steps ?? []) {
    for (const iso of [s.started_at, s.finished_at]) {
      if (!iso) continue;
      const ms = new Date(iso).getTime();
      if (Number.isFinite(ms)) times.push(ms);
    }
  }
  if (times.length === 0) return "—";
  const start = Math.min(...times);
  const end = Math.max(...times);
  if (end <= start) return "—";
  const secs = Math.floor((end - start) / 1000);
  if (secs < 60) return `${secs}秒`;
  return `${Math.floor(secs / 60)}分${String(secs % 60).padStart(2, "0")}秒`;
}

// Primary model for a row: i2v mode → the i2v model, static → the LLM.
function primarySpec(cfg: TaskConfig | null | undefined, mode: string): ModelSelectionSpec {
  const m = cfg?.models;
  if (!m) return null;
  if (mode === "i2v") return m.i2v ?? m.llm ?? m.image ?? null;
  return m.llm ?? m.image ?? m.tts ?? null;
}

// Resolve {model_config_id}/{id}/{name} through the model-configs map.
function modelName(spec: ModelSelectionSpec, byId: Record<string, string>): string {
  if (!spec) return "—";
  if (typeof spec === "string") return spec.trim() || "—";
  const id = spec.model_config_id ?? spec.id;
  if (spec.name) return spec.name;
  if (id && byId[id]) return byId[id];
  return "—";
}

/* ──────────────────────────────────────────────────────────────────────────
 * 小图标（lucide 风格描边，随主题取色）
 * ────────────────────────────────────────────────────────────────────────── */
function SvgIcon({ children, className = "h-4 w-4" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

// 工厂：每个图标组件接受可选 className，便于在不同容器中微调尺寸。
function makeIcon(paths: ReactNode) {
  return function Icon({ className = "h-4 w-4" }: { className?: string }) {
    return <SvgIcon className={className}>{paths}</SvgIcon>;
  };
}

const IconFilm = makeIcon(
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M7 3v18" />
    <path d="M17 3v18" />
    <path d="M3 7.5h4" />
    <path d="M3 12h18" />
    <path d="M3 16.5h4" />
    <path d="M17 7.5h4" />
    <path d="M17 16.5h4" />
  </>,
);

const IconFolder = makeIcon(
  <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
);

const IconCoins = makeIcon(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
    <path d="M7 6h1v4" />
    <path d="m16.71 13.88.7.71-2.82 2.82" />
  </>,
);

const IconCpu = makeIcon(
  <>
    <rect width="16" height="16" x="4" y="4" rx="2" />
    <rect width="6" height="6" x="9" y="9" rx="1" />
    <path d="M15 2v2" />
    <path d="M15 20v2" />
    <path d="M2 15h2" />
    <path d="M2 9h2" />
    <path d="M20 15h2" />
    <path d="M20 9h2" />
    <path d="M9 2v2" />
    <path d="M9 20v2" />
  </>,
);

const IconZap = makeIcon(<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />);

const IconSliders = makeIcon(
  <>
    <line x1="4" x2="4" y1="21" y2="14" />
    <line x1="4" x2="4" y1="10" y2="3" />
    <line x1="12" x2="12" y1="21" y2="12" />
    <line x1="12" x2="12" y1="8" y2="3" />
    <line x1="20" x2="20" y1="21" y2="16" />
    <line x1="20" x2="20" y1="12" y2="3" />
    <line x1="2" x2="6" y1="14" y2="14" />
    <line x1="10" x2="14" y1="8" y2="8" />
    <line x1="18" x2="22" y1="16" y2="16" />
  </>,
);

const IconCard = makeIcon(
  <>
    <rect width="20" height="14" x="2" y="5" rx="2" />
    <line x1="2" x2="22" y1="10" y2="10" />
  </>,
);

const IconPlus = makeIcon(
  <>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </>,
);

const IconChevronRight = makeIcon(<path d="m9 18 6-6-6-6" />);

const IconInbox = makeIcon(
  <>
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </>,
);

/* ──────────────────────────────────────────────────────────────────────────
 * 统计卡：图标块 + 大数值 + 说明小字（Linear 式卡片层级）
 * ────────────────────────────────────────────────────────────────────────── */
function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
  sub: ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-bg-subtle p-4 shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-colors hover:border-border-strong">
      <div className="flex h-8 w-8 items-center justify-center rounded bg-brand-subtle text-brand">
        {icon}
      </div>
      <div className="mt-3 text-[11px] leading-snug text-text-secondary">{label}</div>
      <div className="mt-1 text-[26px] font-semibold leading-tight tabular-nums text-text-primary">
        {value}
      </div>
      <div className="mt-1 truncate text-[11px] text-text-tertiary">{sub}</div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 快捷入口卡：图标 + 中文标题 + 一句说明，hover 提升
 * ────────────────────────────────────────────────────────────────────────── */
function QuickEntry({
  href,
  icon,
  title,
  desc,
  primary = false,
}: {
  href: string;
  icon: ReactNode;
  title: ReactNode;
  desc: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3.5 rounded border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-colors ${
        primary
          ? "border-brand bg-brand-subtle hover:border-brand-hover"
          : "border-border bg-bg-subtle hover:border-border-strong"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded ${
          primary ? "bg-brand text-white" : "bg-bg-muted text-text-secondary transition-colors group-hover:text-brand"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-text-primary">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-text-tertiary">{desc}</span>
      </span>
      <IconChevronRight className="h-3.5 w-3.5" />
    </Link>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 区块头：标题 + 副题 + 右侧操作
 * ────────────────────────────────────────────────────────────────────────── */
function SectionHeader({
  title,
  sub,
  right,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3">
      <span className="text-[13px] font-semibold text-text-primary">{title}</span>
      {sub ? <span className="hidden text-[11px] text-text-tertiary sm:inline">{sub}</span> : null}
      <span className="flex-1" />
      {right}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 表格空态：图标 + 标题 + 说明 + 操作
 * ────────────────────────────────────────────────────────────────────────── */
function TableEmpty({
  colSpan,
  icon,
  title,
  desc,
  action,
}: {
  colSpan: number;
  icon: ReactNode;
  title: ReactNode;
  desc: ReactNode;
  action?: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="border-b-0 px-4 py-14 text-center">
        <div className="flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded border border-border bg-bg-muted/50 text-text-tertiary">
            {icon}
          </div>
          <div className="text-[13px] font-medium text-text-primary">{title}</div>
          <div className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-text-tertiary">{desc}</div>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </td>
    </tr>
  );
}

export default function WorkbenchPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [monthTotal, setMonthTotal] = useState<number | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsTotal, setProjectsTotal] = useState<number | null>(null);
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [configById, setConfigById] = useState<Record<string, string>>({});
  const [taskDetails, setTaskDetails] = useState<Record<string, RowDetail>>({});
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Initial load: lists + credits + model configs, then per-row detail for the
  // visible task rows (bounded) since the list endpoint is flat.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [tasksRes, projectsRes, configsRes, creditsRes] = await Promise.allSettled([
        apiFetch<TaskListResponse>("/api/tasks?size=100", { cache: "no-store" }),
        apiFetch<{ items: ProjectSummary[]; total?: number }>("/api/projects?size=100", {
          cache: "no-store",
        }),
        apiFetch<{ items: ModelConfig[] }>("/api/model-configs", { cache: "no-store" }),
        apiFetch<CreditsInfo>("/api/credits", { cache: "no-store" }),
      ]);
      if (cancelled) return;

      let list: TaskListItem[] = [];
      if (tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value.items)) {
        list = tasksRes.value.items;
        if (typeof tasksRes.value.month_total === "number") {
          setMonthTotal(tasksRes.value.month_total);
        }
      }
      setTasks(list);

      if (projectsRes.status === "fulfilled" && Array.isArray(projectsRes.value.items)) {
        setProjects(projectsRes.value.items);
        if (typeof projectsRes.value.total === "number") {
          setProjectsTotal(projectsRes.value.total);
        }
      }
      if (configsRes.status === "fulfilled" && Array.isArray(configsRes.value.items)) {
        const flat = configsRes.value.items;
        const byId: Record<string, string> = {};
        for (const c of flat) byId[c.id] = c.name;
        setModelConfigs(flat);
        setConfigById(byId);
      }
      if (creditsRes.status === "fulfilled") setCredits(creditsRes.value);

      // Enrich the visible rows with config + step timings.
      const recent = list.slice(0, 6);
      const detMap: Record<string, RowDetail> = {};
      await Promise.allSettled(
        recent.map((task) =>
          apiFetch<{ config?: TaskConfig | null; steps?: TaskStep[] }>(
            `/api/tasks/${encodeURIComponent(task.id)}`,
            { cache: "no-store" },
          ).then((d) => {
            detMap[task.id] = { config: d?.config ?? null, steps: d?.steps ?? [] };
          }),
        ),
      );
      if (cancelled) return;
      setTaskDetails(detMap);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the flat list every 2s while any task is active, so Step / Status stay
  // live without re-fetching the heavier per-row details.
  const hasActive = tasks.some((x) => isActiveStatus(x.status));
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await apiFetch<TaskListResponse>("/api/tasks?size=100", {
          cache: "no-store",
        });
        if (Array.isArray(res.items)) setTasks(res.items);
      } catch {
        // Transient poll failure — keep the last snapshot.
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [hasActive]);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const recentTasks = tasks.slice(0, 6);

  // Latest task per project (list is created_at DESC) → last-activity + wizard link.
  const latestByProject = useMemo(() => {
    const map = new Map<string, TaskListItem>();
    for (const task of tasks) {
      if (!map.has(task.project_id)) map.set(task.project_id, task);
    }
    return map;
  }, [tasks]);

  // ── 展示标签：数据值 → 中文 ─────────────────────────────────────────────
  const MODE_LABELS: Record<string, string> = {
    static: t("workbench.modeStatic"),
    i2v: t("workbench.modeI2v"),
  };
  const TRACK_LABELS: Record<string, string> = {
    managed: t("workbench.trackManaged"),
    byok: t("workbench.trackByok"),
  };
  const SOURCE_LABELS: Record<string, string> = {
    text: t("projects.sourceText"),
    url: t("projects.sourceUrl"),
    topic: t("projects.sourceTopic"),
    product: t("projects.sourceProduct"),
  };
  const CLASS_LABELS: Record<string, string> = {
    llm: t("workbench.modelClassLlm"),
    image: t("workbench.modelClassImage"),
    tts: t("workbench.modelClassTts"),
    i2v: t("workbench.modelClassI2v"),
  };

  // ── Stats ────────────────────────────────────────────────────────────────
  const monthTasks = monthTotal ?? tasks.filter((x) => isThisMonth(x.created_at)).length;
  const staticThisMonth = tasks.filter((x) => isThisMonth(x.created_at) && x.mode === "static").length;
  const i2vThisMonth = tasks.filter((x) => isThisMonth(x.created_at) && x.mode === "i2v").length;
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const enabledClasses = useMemo(
    () => [...new Set(modelConfigs.filter((c) => c.enabled).map((c) => c.provider_class))],
    [modelConfigs],
  );
  const eq = credits?.equivalents;
  const balance = credits?.credits ?? 0;
  const stats: Array<{ label: string; value: ReactNode; sub: ReactNode; icon: ReactNode }> = [
    {
      label: t("workbench.statMonthTasks"),
      value: monthTasks,
      sub: t("workbench.statMonthTasksSub", { static: staticThisMonth, i2v: i2vThisMonth }),
      icon: <IconFilm />,
    },
    {
      label: t("workbench.statProjects"),
      value: projectsTotal ?? projects.length,
      sub: t("workbench.statProjectsSub", { active: activeProjects }),
      icon: <IconFolder />,
    },
    {
      label: t("workbench.statCredits"),
      value: balance.toLocaleString(),
      sub:
        eq && (eq.static_count ?? 0) + (eq.i2v_count ?? 0) > 0
          ? t("workbench.statCreditsSub", {
              static: eq.static_count ?? 0,
              i2v: eq.i2v_count ?? 0,
            })
          : "—",
      icon: <IconCoins />,
    },
    {
      label: t("workbench.statModels"),
      value: enabledClasses.length,
      sub:
        enabledClasses.length > 0
          ? t("workbench.statModelsSub", {
              classes: enabledClasses.map((c) => CLASS_LABELS[c] ?? c).join(" · "),
            })
          : "—",
      icon: <IconCpu />,
    },
  ];

  const handleRetry = async (task: TaskListItem) => {
    if (retrying) return;
    setRetrying(task.id);
    setRetryError(null);
    try {
      await apiFetch(`/api/tasks/${encodeURIComponent(task.id)}/rerun`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_step: task.current_step || 1 }),
      });
      router.push(`/app/tasks/${task.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRetryError(t("workbench.retryFailed", { message: msg }));
      setRetrying(null);
    }
  };

  const taskColumns = [
    t("workbench.colTask"),
    t("workbench.colMode"),
    t("workbench.colStatus"),
    t("workbench.colStep"),
    t("workbench.colModelPreset"),
    t("workbench.colCreated"),
    t("workbench.colDuration"),
    "",
  ];

  const projectColumns = [
    t("workbench.colProject"),
    t("workbench.colSource"),
    t("workbench.colTasksCount"),
    t("workbench.colLastActivity"),
    t("workbench.colStatus"),
    "",
  ];

  const rowHover = "transition-colors hover:bg-bg-muted/40";

  return (
    <div className="mx-auto w-full">
      {/* ── 页头：标题 + 主操作 ── */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold leading-tight text-text-primary">
            {t("workbench.pageTitle")}
          </h1>
          <p className="mt-1 text-[12px] text-text-secondary">{t("workbench.pageSub")}</p>
        </div>
        <Btn variant="primary" href="/app/quick">
          <IconPlus className="h-3.5 w-3.5" /> {t("workbench.newTask")}
        </Btn>
      </div>

      {/* ── 数据总览：图标统计卡片 ── */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} sub={s.sub} />
        ))}
      </div>

      {/* ── 快捷入口 ── */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickEntry
          href="/app/quick"
          icon={<IconZap className="h-5 w-5" />}
          title={t("workbench.btnQuick")}
          desc={t("workbench.quickDesc")}
          primary
        />
        <QuickEntry
          href="/app/models"
          icon={<IconSliders className="h-5 w-5" />}
          title={t("workbench.btnModels")}
          desc={t("workbench.modelsDesc")}
        />
        <QuickEntry
          href="/app/billing"
          icon={<IconCard className="h-5 w-5" />}
          title={t("workbench.btnBilling")}
          desc={t("workbench.billingDesc")}
        />
      </div>

      {/* ── 最近任务表 ── */}
      <section className="mb-6 overflow-hidden rounded border border-border bg-bg-subtle">
        <SectionHeader
          title={t("workbench.recentTasks")}
          sub={t("workbench.recentTasksSub")}
          right={
            <Link
              href="/app/tasks"
              className="whitespace-nowrap text-[12px] font-medium text-text-secondary transition-colors hover:text-brand"
            >
              {t("workbench.viewAll")}
            </Link>
          }
        />
        <div className="border-b border-border bg-bg/50 px-4 py-1.5 text-[10px] text-text-tertiary">
          › {t("workbench.notePolling")}
        </div>
        {retryError ? (
          <div className="border-b border-border bg-error-bg/60 px-4 py-1.5 text-[12px] text-error">
            {retryError}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <DataTable columns={taskColumns}>
            {recentTasks.length === 0 ? (
              <TableEmpty
                colSpan={taskColumns.length}
                icon={<IconInbox />}
                title={t("workbench.tasksEmpty")}
                desc={t("workbench.tasksEmptyDesc")}
                action={
                  <Btn size="sm" variant="primary" href="/app/quick">
                    {t("workbench.btnQuick")}
                  </Btn>
                }
              />
            ) : (
              recentTasks.map((task) => {
                const project = projectById.get(task.project_id);
                const detail = taskDetails[task.id];
                const cfg = detail?.config;
                const spec = primarySpec(cfg, task.mode);
                const model = modelName(spec, configById);

                let preset: string | null = null;
                const templateId = cfg?.templates?.[3];
                if (templateId) {
                  const found = STORYBOARD_PRESETS.find((p) => p.id === templateId);
                  if (found) preset = t(found.titleKey);
                } else if (cfg?.prompts?.[3]) {
                  preset = t("storyboardPreset.custom");
                }
                const modelPreset = preset
                  ? model === "—"
                    ? preset
                    : `${model} · ${preset}`
                  : model;

                const title = project?.title ?? task.project_id;
                const statusLabel = t(`pipelineStatus.${task.status}`);

                return (
                  <Tr key={task.id} className={rowHover}>
                    <Td className="max-w-[300px]">
                      <Link
                        href={`/app/tasks/${task.id}`}
                        className="block truncate font-semibold text-text-primary hover:text-brand"
                      >
                        {title}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap text-text-secondary">
                      {MODE_LABELS[task.mode] ?? task.mode}
                      {task.track ? ` · ${TRACK_LABELS[task.track] ?? task.track}` : ""}
                    </Td>
                    <Td>
                      <Badge variant={STATUS_BADGE[task.status] ?? "gray"} dot>
                        {statusLabel}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-text-secondary">{stepLabel(task)}</Td>
                    <Td className="whitespace-nowrap text-text-secondary">{modelPreset}</Td>
                    <Td className="whitespace-nowrap text-text-secondary">
                      {shortDateTime(task.created_at)}
                    </Td>
                    <Td className="whitespace-nowrap text-text-secondary">
                      {durationLabel(task, detail)}
                    </Td>
                    <Td>
                      {task.status === "failed" ? (
                        <button
                          type="button"
                          onClick={() => handleRetry(task)}
                          disabled={retrying === task.id}
                          className="cursor-pointer select-none text-[12px] font-semibold text-brand hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {retrying === task.id ? t("workbench.retrying") : t("tasks.actionRetry")}
                        </button>
                      ) : (
                        <Link
                          href={`/app/tasks/${task.id}`}
                          className="whitespace-nowrap text-[12px] font-semibold text-text-secondary hover:text-brand"
                        >
                          {t("workbench.colOpen")}
                        </Link>
                      )}
                    </Td>
                  </Tr>
                );
              })
            )}
          </DataTable>
        </div>
      </section>

      {/* ── 项目表 ── */}
      <section className="mb-6 overflow-hidden rounded border border-border bg-bg-subtle">
        <SectionHeader title={t("workbench.recentProjects")} sub={t("workbench.projectsNote")} />

        <div className="overflow-x-auto">
          <DataTable columns={projectColumns}>
            {projects.length === 0 ? (
              <TableEmpty
                colSpan={projectColumns.length}
                icon={<IconFolder className="h-5 w-5" />}
                title={t("workbench.projectsEmpty")}
                desc={t("workbench.projectsEmptyDesc")}
                action={
                  <Btn size="sm" variant="primary" href="/app/quick">
                    {t("workbench.newProject")}
                  </Btn>
                }
              />
            ) : (
              projects.map((p) => {
                const latest = latestByProject.get(p.id);
                const href = latest ? `/app/tasks/${latest.id}` : `/app/projects/${p.id}`;
                const statusKey = `projects.status${p.status[0].toUpperCase()}${p.status.slice(1)}`;
                const statusVariant: BadgeVariant = p.status === "active" ? "orange" : "gray";
                return (
                  <Tr key={p.id} className={rowHover}>
                    <Td className="max-w-[300px]">
                      <Link
                        href={href}
                        className="block truncate font-semibold text-text-primary hover:text-brand"
                      >
                        {p.title}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap text-text-secondary">
                      {SOURCE_LABELS[p.source_type] ?? p.source_type}
                    </Td>
                    <Td className="whitespace-nowrap text-text-secondary">{p.task_count ?? 0}</Td>
                    <Td className="whitespace-nowrap text-text-secondary">
                      {shortDateTime(latest?.created_at ?? p.created_at)}
                    </Td>
                    <Td>
                      <Badge variant={statusVariant} dot>
                        {t(statusKey)}
                      </Badge>
                    </Td>
                    <Td>
                      <Link
                        href={href}
                        className="whitespace-nowrap text-[12px] font-semibold text-text-secondary hover:text-brand"
                      >
                        {t("workbench.colWizard")}
                      </Link>
                    </Td>
                  </Tr>
                );
              })
            )}
            <tr>
              <td colSpan={projectColumns.length} className="border-b-0 px-4 py-2.5">
                <Link
                  href="/app/quick"
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand transition-colors hover:brightness-110"
                >
                  <IconPlus className="h-3 w-3" /> {t("workbench.newProject")}
                </Link>
              </td>
            </tr>
          </DataTable>
        </div>
      </section>
    </div>
  );
}
