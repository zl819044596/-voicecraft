import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ModeChip, StatusBadge, TrackChip } from '@/components/badges'
import type { GenMode, TaskStatus } from '@/components/badges'
import type { Track } from '@/lib/demo'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export interface DemoTask {
  id: string
  no: string
  title: string
  status: TaskStatus
  mode: GenMode
  track: Track
  created: string
  duration: string
  shots: number
  aspect: string
  failReason?: string
}

/** 预置 6 行 mock：全状态枚举 × static/i2v × byok/managed 交叉（dashboard.md §4） */
const INITIAL_TASKS: DemoTask[] = [
  { id: 'aurora-brew-30s', no: 'T-1042', title: 'Aurora Brew 冷萃咖啡 · 30s 产品广告', status: 'running', mode: 'i2v', track: 'managed', created: '2 分钟前', duration: '02:41', shots: 8, aspect: '9:16' },
  { id: 'lumen-unbox-15s', no: 'T-1041', title: 'Lumen 台灯 · 15s 开箱短视频', status: 'queued', mode: 'static', track: 'managed', created: '5 分钟前', duration: '—', shots: 6, aspect: '9:16' },
  { id: 'summer-drinks-v3', no: 'T-1038', title: '客户交付 · 夏日饮品合集 v3', status: 'done', mode: 'i2v', track: 'byok', created: '今天 11:20', duration: '04:12', shots: 10, aspect: '9:16' },
  { id: 'morning-habits', no: 'T-1035', title: '频道周更 · 高效晨间习惯', status: 'done', mode: 'static', track: 'managed', created: '昨天', duration: '02:05', shots: 8, aspect: '16:9' },
  { id: 'sneaker-draft', no: 'T-1033', title: '运动鞋广告 · 初稿', status: 'failed', mode: 'static', track: 'byok', created: '昨天', duration: '00:48', shots: 6, aspect: '1:1', failReason: 'L4 生图超时 · 可单步重试' },
  { id: 'spring-promo-old', no: 'T-1029', title: '旧稿 · 春季促销', status: 'cancelled', mode: 'static', track: 'managed', created: '3 天前', duration: '—', shots: 8, aspect: '9:16' },
]

const FILTERS: { id: TaskStatus | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'running', label: 'running' },
  { id: 'queued', label: 'queued' },
  { id: 'done', label: 'done' },
  { id: 'failed', label: 'failed' },
  { id: 'cancelled', label: 'cancelled' },
]

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** running 行耗时进行式计时（从 02:41 起跳） */
function TickingDuration() {
  const [sec, setSec] = useState(161)
  useEffect(() => {
    const t = setInterval(() => setSec((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="font-mono text-[13px] text-ink2">{fmt(sec)}</span>
}

/** 任务表格（F-DASH-1 AC1，dashboard.md §4）；real 模式由父级传入 tasks 渲染真实数据 */
export default function TaskTable({ tasks: realTasks }: { tasks?: DemoTask[] }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [tasks, setTasks] = useState<DemoTask[]>(INITIAL_TASKS)
  const bodyRef = useRef<HTMLDivElement>(null)

  const rows = realTasks ?? tasks
  const filtered = filter === 'all' ? rows : rows.filter((t) => t.status === filter)

  const retry = (task: DemoTask) => {
    if (realTasks) {
      toast.info('重试操作属于核心流程（P4 另行接入）')
      return
    }
    toast.success('已从失败步骤 L4 重试（模拟）')
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'running' } : t)))
    setTimeout(() => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'queued' } : t)))
    }, 2000)
  }

  return (
    <section className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] leading-[26px] font-semibold text-ink">任务</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-line bg-surface p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  'rounded px-2 py-1 text-xs transition-colors',
                  f.id === 'all' ? '' : 'font-mono',
                  filter === f.id ? 'bg-press text-ink' : 'text-ink3 hover:text-ink',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })}
            className="text-xs text-brand-strong hover:underline"
          >
            查看全部
          </button>
        </div>
      </div>

      <div ref={bodyRef} className="max-h-[420px] overflow-y-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line text-left text-xs font-medium text-ink3">
              <th className="px-4 py-2.5 font-medium">任务</th>
              <th className="px-3 py-2.5 font-medium">状态</th>
              <th className="px-3 py-2.5 font-medium">模式</th>
              <th className="px-3 py-2.5 font-medium">轨道</th>
              <th className="px-3 py-2.5 font-medium">创建时间</th>
              <th className="px-3 py-2.5 font-medium">耗时</th>
              <th className="px-4 py-2.5 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {filtered.map((task, i) => (
                <motion.tr
                  key={task.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  transition={{ delay: i * 0.04, duration: 0.26 }}
                  onClick={() => navigate(`/app/tasks/${task.id}`)}
                  className={cn(
                    'group relative cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-raised',
                    task.status === 'running' && 'shadow-[inset_2px_0_0_var(--brand)]',
                  )}
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-ink">{task.title}</p>
                    <p className="mt-0.5 font-mono text-xs text-ink3">
                      #{task.no} · {task.shots} 镜头 · {task.aspect}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {task.status === 'failed' && task.failReason ? (
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex"><StatusBadge status={task.status} /></span>
                          </TooltipTrigger>
                          <TooltipContent className="border-line bg-raised font-mono text-xs text-ink2">
                            {task.failReason}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <StatusBadge status={task.status} />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <ModeChip mode={task.mode} />
                  </td>
                  <td className="px-3 py-3">
                    <TrackChip track={task.track} />
                  </td>
                  <td className="px-3 py-3 text-[13px] whitespace-nowrap text-ink3">{task.created}</td>
                  <td className="px-3 py-3">
                    {task.status === 'running' && task.id === 'aurora-brew-30s' ? (
                      <TickingDuration />
                    ) : (
                      <span className="font-mono text-[13px] text-ink2">{task.duration}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {task.status === 'failed' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          retry(task)
                        }}
                        className="mr-3 rounded border border-line px-2 py-1 text-xs text-ink2 transition-colors hover:border-linestrong hover:text-ink"
                      >
                        重试
                      </button>
                    )}
                    <span className="text-[13px] text-brand-strong group-hover:underline">打开 →</span>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-6 py-10 text-center text-[13px] text-ink3">
            当前筛选下没有任务 · <button type="button" className="text-brand-strong hover:underline" onClick={() => setFilter('all')}>查看全部</button>
          </div>
        )}
      </div>
    </section>
  )
}
