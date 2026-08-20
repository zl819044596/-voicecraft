/**
 * 任务头部条（task-wizard.md §1）：sticky top，返回/标题/状态/轨道/模式/运行模式/冻结积分/取消。
 */
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, FileJson, MoreHorizontal, Pause, Play, RefreshCcw, Trash2, Copy, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDemo } from '@/lib/demo'
import { ModeChip, StatusBadge, TrackChip } from '@/components/badges'
import type { GenMode } from '@/components/badges'
import { TASK, rerunCost } from '@/lib/task-wizard-mock'
import type { RunMode, TaskStatus } from '@/lib/task-wizard-mock'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function HeaderBar({
  real = false,
  taskTitle,
  taskCode,
  shotsCount,
  aspect,
  lang,
  freezeCredits,
  taskStatus,
  runMode,
  mode,
  freeReruns,
  polling,
  onRunModeChange,
  onTogglePoll,
  onCancelTask,
  onDuplicate,
  onShowConfig,
  onToggleL15Violation,
  onToggleL9Feedback,
}: {
  real?: boolean
  taskTitle?: string
  taskCode?: string
  shotsCount?: number
  aspect?: string
  lang?: string
  freezeCredits?: number
  taskStatus: TaskStatus
  runMode: RunMode
  mode: GenMode
  freeReruns: number
  polling: boolean
  onRunModeChange: (m: RunMode) => void
  onTogglePoll: () => void
  onCancelTask: () => void
  onDuplicate: () => void
  onShowConfig: () => void
  onToggleL15Violation: () => void
  onToggleL9Feedback: () => void
}) {
  const navigate = useNavigate()
  const { track } = useDemo()
  const frozen = taskStatus === 'running' || taskStatus === 'queued'
  const title = taskTitle ?? TASK.title
  const code = taskCode ?? TASK.code
  const spec = `${shotsCount ?? TASK.shots} 镜 · ${aspect ?? TASK.aspect} · ${lang ?? TASK.lang}`
  const freeze = freezeCredits ?? TASK.freezeCredits

  return (
    <div className="sticky top-14 z-30 -mx-4 -mt-6 mb-5 flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-canvas/80 px-4 py-2 backdrop-blur lg:-mx-8 lg:-mt-8 lg:px-8">
      {/* 左：返回 + 标题 */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/app')}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-ink2 transition hover:bg-raised hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          返回
        </button>
        <h1 className="truncate text-[15px] leading-[22px] font-semibold text-ink">{title}</h1>
        <span className="shrink-0 font-mono text-xs text-ink3">{code}</span>
      </div>

      {/* 中：状态 / 轨道 / 模式 / 规格 */}
      <div className="flex items-center gap-2.5">
        <AnimatePresence mode="wait">
          <motion.span
            key={taskStatus}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <StatusBadge status={taskStatus} />
          </motion.span>
        </AnimatePresence>
        <TrackChip track={track} />
        <ModeChip mode={mode} />
        <span className="hidden font-mono text-xs text-ink3 md:inline">{spec}</span>
      </div>

      {/* 右：运行模式 / 冻结积分 / 重跑余量 / 菜单 */}
      <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex rounded-md border border-line bg-surface p-0.5 text-xs">
          {(
            [
              { id: 'semi', label: 'semi 逐步确认' },
              { id: 'auto', label: 'auto 自动跑完' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onRunModeChange(m.id)}
              className={cn(
                'rounded px-2.5 py-1 font-mono transition-colors',
                runMode === m.id ? 'bg-brand-soft text-brand-strong' : 'text-ink3 hover:text-ink',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {track === 'byok' ? (
          <span
            className="rounded-full px-3 py-1 font-mono text-xs font-medium"
            style={{ color: 'var(--byok)', border: '1px dashed rgba(45,212,191,.5)', background: 'rgba(45,212,191,.08)' }}
          >
            BYOK · $0
          </span>
        ) : (
          <motion.span
            key={`${taskStatus}-freeze`}
            initial={{ scale: 0.94 }}
            animate={{ scale: 1 }}
            className="rounded-full px-3 py-1 font-mono text-xs font-medium"
            style={
              frozen
                ? { color: 'var(--managed)', border: '1px dashed rgba(251,191,36,.55)', background: 'rgba(251,191,36,.08)' }
                : taskStatus === 'done'
                  ? { color: 'var(--managed)', border: '1px solid rgba(251,191,36,.6)', background: 'rgba(251,191,36,.16)' }
                  : { color: 'var(--dim)', border: '1px dashed var(--line-strong)', background: 'transparent' }
            }
          >
            {frozen ? `冻结 ${freeze} 💎` : taskStatus === 'done' ? `实结 ${freeze} 💎` : '已解冻'}
          </motion.span>
        )}

        {track === 'byok' ? (
          <span className="font-mono text-xs text-byok">重跑不限</span>
        ) : (
          <span className={cn('font-mono text-xs', freeReruns === 0 ? 'text-managed' : 'text-ink3')}>
            {freeReruns > 0 ? `免费重跑剩 ${freeReruns} 次` : `超出 ${rerunCost(mode)} 积分/次`}
          </span>
        )}

        {/* 轮询模拟（task-wizard.md §10.4） */}
        {taskStatus === 'running' && (
          <button
            type="button"
            onClick={onTogglePoll}
            title={polling ? '暂停自动刷新' : '恢复自动刷新'}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[11px] text-ink3 transition hover:bg-raised hover:text-ink"
          >
            <RefreshCcw className={cn('size-3', polling && 'animate-spin-slow text-brand-strong')} />
            自动刷新中 · 1.5s
            {polling ? <Pause className="size-3" /> : <Play className="size-3 text-managed" />}
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="rounded-md p-1.5 text-ink2 transition hover:bg-raised hover:text-ink" aria-label="任务菜单">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 border-line bg-raised">
            <DropdownMenuLabel className="text-xs text-ink3">任务操作</DropdownMenuLabel>
            <DropdownMenuItem className="cursor-pointer" onClick={onDuplicate}>
              <Copy className="size-3.5" />
              复制任务
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={onShowConfig}>
              <FileJson className="size-3.5" />
              查看配置 JSON
            </DropdownMenuItem>
            {!real && (
              <>
                <DropdownMenuSeparator className="bg-line" />
                <DropdownMenuLabel className="flex items-center gap-1 text-xs text-ink3">
                  <FlaskConical className="size-3" /> 演示开关
                </DropdownMenuLabel>
                <DropdownMenuItem className="cursor-pointer font-mono text-xs" onClick={onToggleL15Violation}>
                  L1.5 违规终止（演示）
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer font-mono text-xs" onClick={onToggleL9Feedback}>
                  L9 feedback 报告（演示）
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-line" />
              </>
            )}
            <DropdownMenuItem className="cursor-pointer text-err focus:text-err" onClick={onCancelTask}>
              <Trash2 className="size-3.5" />
              取消任务
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
