import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { Clapperboard, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import TaskTable, { type DemoTask } from '@/components/dashboard/TaskTable'
import { get } from '@/lib/api'
import { useDemo } from '@/lib/demo'
import type { Project, TaskListItem } from '@/lib/types'

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

interface ProjectsData {
  projects: Project[]
  tasks: TaskListItem[]
}

/** /app/projects 项目/任务页（PIPELINE_TASK_42 阶段 E）：全部任务统一表格 + 项目/任务统计 */
export default function Projects() {
  const navigate = useNavigate()
  const { mode } = useDemo()
  const real = mode === 'real'
  const [data, setData] = useState<ProjectsData | null>(null)
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
      get<{ items: Project[] }>('/projects?size=50'),
      get<{ items: TaskListItem[] }>('/tasks?size=50'),
    ])
      .then(([proj, tasks]) => {
        if (cancelled) return
        setData({ projects: proj.items, tasks: tasks.items })
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

  // 任务表行：真实任务（title 优先取 config.title，缺省回退项目标题）
  const taskRows: DemoTask[] | undefined = useMemo(() => {
    if (!data) return undefined
    const projTitle = new Map(data.projects.map((p) => [p.id, p.title]))
    return data.tasks.map((t) => {
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

  // 统计条：项目数 / 进行中 / 已完成 / 失败（demo 回退 mock 数值）
  const stats = useMemo(() => {
    if (!data) return { projects: 4, running: 2, done: 9, failed: 1 }
    const running = data.tasks.filter((t) => t.status === 'running').length
    const done = data.tasks.filter((t) => t.status === 'done').length
    const failed = data.tasks.filter((t) => t.status === 'failed').length
    return { projects: data.projects.length, running, done, failed }
  }, [data])

  if (real && loading && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-ink3" />
      </div>
    )
  }

  const statCards = [
    { label: '项目', value: stats.projects, color: 'var(--brand)' },
    { label: '进行中', value: stats.running, color: 'var(--brand)' },
    { label: '已完成', value: stats.done, color: 'var(--ok)' },
    { label: '失败待重跑', value: stats.failed, color: 'var(--err)' },
  ]

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      {real && error && (
        <div className="rounded-md border border-err/40 bg-err/10 px-4 py-3 text-sm text-err">
          数据加载失败：{error}
        </div>
      )}

      <PageHeader
        title="项目 / 任务"
        description="全部任务的统一表格 · 点击行进入 6 步工作台"
        actions={
          <button
            type="button"
            onClick={() => navigate('/app/quick')}
            className="flex h-10 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-white shadow-glow transition-all hover:bg-brand-strong hover:shadow-[0_0_32px_rgba(124,92,255,.5)] active:scale-[0.97]"
          >
            <Plus className="size-4" /> 新建任务
          </button>
        }
      />

      {/* 统计条 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: i * 0.05 }}
            className="rounded-lg border border-line bg-surface p-4"
          >
            <p className="text-xs font-medium text-ink3">{s.label}</p>
            <p className="mt-1.5 font-mono text-[26px] leading-8 font-semibold" style={{ color: s.color }}>
              {s.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* 任务表格 */}
      <TaskTable tasks={taskRows} />

      <p className="flex items-center gap-1.5 text-xs text-ink3">
        <Clapperboard className="size-3.5" />
        {real
          ? `实时数据 · 共 ${stats.projects} 个项目 · 任务上限 50 条`
          : '演示模式 · mock 任务（见 dashboard.md §4）· 点击「打开 →」进入工作台'}
      </p>

      {/* 刷新按钮（real 模式） */}
      {real && (
        <button
          type="button"
          onClick={() => {
            reload()
            toast.success('已刷新任务列表')
          }}
          className="w-fit text-xs text-brand-strong hover:underline"
        >
          刷新列表 →
        </button>
      )}
    </div>
  )
}
