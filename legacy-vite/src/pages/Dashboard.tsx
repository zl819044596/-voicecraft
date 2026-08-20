import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import OverviewCards, { type OverviewStats } from '@/components/dashboard/OverviewCards'
import TaskTable, { type DemoTask } from '@/components/dashboard/TaskTable'
import { BottomRow, SidePanels, type SidePanelsData } from '@/components/dashboard/SidePanels'
import { get } from '@/lib/api'
import { useDemo } from '@/lib/demo'
import type { Project, TaskListItem } from '@/lib/types'

function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = Math.max(0, Date.now() - t)
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} 天前`
  return new Date(iso).toLocaleDateString()
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface DashboardData {
  projects: Project[]
  tasks: TaskListItem[]
  last7Days: { date: string; count: number }[]
  counts: SidePanelsData['counts']
}

/** /app 数据总览（dashboard.md）：Greeting + 概览卡 + 任务表/右栏 + 底部行 */
export default function Dashboard() {
  const navigate = useNavigate()
  const greet = useMemo(greeting, [])
  const { mode } = useDemo()
  const real = mode === 'real'
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(real)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!real) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      get<{ items: Project[] }>('/projects?size=6'),
      get<{ items: TaskListItem[]; month_total: number; last_7_days: { date: string; count: number }[] }>('/tasks?size=30'),
      get<{ total: number }>('/prompts'),
      get<{ total: number }>('/products'),
      get<{ total: number }>('/benchmarks'),
      get<{ total: number }>('/assets'),
      get<{ total: number }>('/model-configs'),
    ])
      .then(([proj, tasks, prompts, products, benchmarks, assets, models]) => {
        if (cancelled) return
        setData({
          projects: proj.items,
          tasks: tasks.items,
          last7Days: tasks.last_7_days,
          counts: {
            prompts: prompts.total,
            products: products.total,
            benchmarks: benchmarks.total,
            assets: assets.total,
            models: models.total,
          },
        })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [real, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  // 聚合概览卡统计：进行中 = running/queued，本月产出 = 已 done（按 mode 拆 static/i2v）
  const stats: OverviewStats | undefined = useMemo(() => {
    if (!data) return undefined
    const running = data.tasks.filter((t) => t.status === 'running').length
    const queued = data.tasks.filter((t) => t.status === 'queued').length
    const done = data.tasks.filter((t) => t.status === 'done')
    return {
      running,
      queued,
      done: done.length,
      staticDone: done.filter((t) => t.mode === 'static').length,
      i2vDone: done.filter((t) => t.mode === 'i2v').length,
      weekBars: data.last7Days.length === 7 ? data.last7Days.map((d) => Math.max(6, d.count * 14)) : [10, 16, 8, 20, 14, 24, 18],
    }
  }, [data])

  // 任务表行：真实任务（title 优先取 config.title，缺省回退项目标题）
  const taskRows: DemoTask[] | undefined = useMemo(() => {
    if (!data) return undefined
    const projTitle = new Map(data.projects.map((p) => [p.id, p.title]))
    return data.tasks.slice(0, 20).map((t) => {
      const cfg = (t.config ?? {}) as Record<string, unknown>
      const title = typeof cfg.title === 'string' && cfg.title ? cfg.title : (projTitle.get(t.project_id) ?? '未命名项目')
      return {
        id: t.id,
        no: `#${t.id.slice(0, 8).toUpperCase()}`,
        title,
        status: t.status,
        mode: t.mode,
        track: t.track,
        created: timeAgo(t.created_at),
        duration: fmtElapsed(t.elapsed_seconds),
        shots: Number(cfg.shots) || 0,
        aspect: typeof cfg.aspect === 'string' ? cfg.aspect : '9:16',
      }
    })
  }, [data])

  const sideData: SidePanelsData | undefined = useMemo(
    () =>
      data
        ? { projects: data.projects.slice(0, 6).map((p) => ({ id: p.id, title: p.title, task_count: p.task_count ?? 0, updated_at: p.updated_at })), counts: data.counts }
        : undefined,
    [data],
  )

  if (real && loading && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-ink3" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      {real && error && (
        <div className="rounded-md border border-err/40 bg-err/10 px-4 py-3 text-sm text-err">
          数据加载失败：{error}
        </div>
      )}

      {/* Greeting 头部 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="font-display text-[30px] leading-[38px] font-semibold text-ink">{greet}，Ken</h1>
          <p className="mt-1 text-[13px] leading-5 text-ink2">今天也把改一镜只重跑一镜的权利握在手里。</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-2"
        >
          <button
            type="button"
            onClick={() => toast.info('项目也可从右侧「项目」卡新建（mock）')}
            className="flex h-11 items-center gap-1.5 rounded-md border border-line px-4 text-sm font-medium text-ink2 transition-colors hover:border-linestrong hover:text-ink"
          >
            <Plus className="size-4" /> 新建项目
          </button>
          <button
            type="button"
            onClick={() => navigate('/app/quick')}
            className="flex h-11 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-white shadow-glow transition-all hover:bg-brand-strong hover:shadow-[0_0_32px_rgba(124,92,255,.5)] active:scale-[0.97]"
          >
            <Sparkles className="size-4" /> 快速生成
          </button>
        </motion.div>
      </div>

      {/* 概览卡行 */}
      <OverviewCards stats={stats} />

      {/* 主区双栏 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TaskTable tasks={taskRows} />
        </div>
        <SidePanels data={sideData} onCreated={reload} />
      </div>

      {/* 底部行 */}
      <BottomRow />
    </div>
  )
}
