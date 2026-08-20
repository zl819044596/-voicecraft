/**
 * 顶部横向 6 节点 StepRail（PIPELINE_TASK_42 阶段 C）：①文案 ②分镜 ③生图 ④配音 ⑤字幕 ⑥合成导出。
 * 与后端 DISPLAY_NODES 对齐（api/src/routes/tasks.ts）。节点状态：done✓ / 当前高亮 / running 脉冲 /
 * failed 标红 / pending 灰；点击切换节点。节点下方展示其逻辑步小点（L1/L1.5/L2 …）。
 */
import { motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StepStatus } from '@/components/badges'
import { STAGES, STEP_META } from '@/lib/task-wizard-mock'
import type { StageDef, StepKey, TaskStatus } from '@/lib/task-wizard-mock'

function aggregate(statuses: StepStatus[]): StepStatus {
  if (statuses.some((s) => s === 'running')) return 'running'
  if (statuses.some((s) => s === 'failed')) return 'failed'
  if (statuses.some((s) => s === 'cancelled')) return 'cancelled'
  if (statuses.some((s) => s === 'queued')) return 'queued'
  if (statuses.every((s) => s === 'done' || s === 'skipped')) return 'done'
  return 'queued'
}

type NodeState = 'done' | 'active' | 'running' | 'failed' | 'pending'

function nodeState(stage: StageDef, statuses: Record<StepKey, StepStatus>, activeStage: number): NodeState {
  const agg = aggregate(stage.steps.map((s) => statuses[s]))
  if (agg === 'running') return 'running'
  if (activeStage === stage.id) return 'active'
  if (agg === 'done') return 'done'
  if (agg === 'failed') return 'failed'
  return 'pending'
}

export default function StepRail({
  statuses,
  staleSteps,
  activeStage,
  taskStatus,
  onSelectStage,
}: {
  statuses: Record<StepKey, StepStatus>
  staleSteps: Set<StepKey>
  activeStage: number
  taskStatus: TaskStatus
  onSelectStage: (stage: number) => void
}) {
  return (
    <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-0.5">
        {STAGES.map((stage, i) => {
          const st = nodeState(stage, statuses, activeStage)
          const stageStale = stage.steps.some((s) => staleSteps.has(s))
          const badgeCls =
            st === 'active' || st === 'running'
              ? 'bg-brand text-white'
              : st === 'done'
                ? 'border border-ok/60 text-ok'
                : st === 'failed'
                  ? 'border border-err/60 text-err'
                  : 'border border-line text-ink3'
          const titleCls =
            st === 'active' || st === 'running'
              ? 'text-ink'
              : st === 'done'
                ? 'text-ink2'
                : st === 'failed'
                  ? 'text-err'
                  : 'text-ink3'
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onSelectStage(stage.id)}
              className={cn(
                'group relative flex min-w-[128px] flex-1 items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
                st === 'active'
                  ? 'border-brand bg-brand-soft'
                  : st === 'running'
                    ? 'border-brand/50 bg-brand-soft/40'
                    : st === 'failed'
                      ? 'border-err/50 bg-err/5'
                      : 'border-line bg-surface hover:border-linestrong',
              )}
            >
              {st === 'active' && (
                <motion.span
                  layoutId="steprail-active-bar"
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand"
                  transition={{ type: 'spring', duration: 0.26 }}
                />
              )}
              <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold', badgeCls)}>
                {st === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : st === 'failed' ? <X className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm font-semibold', titleCls)}>{stage.name}</span>
                <span className="mt-1 flex items-center gap-1">
                  {stage.steps.map((s) => {
                    const ss = statuses[s]
                    const color =
                      ss === 'done'
                        ? 'var(--ok)'
                        : ss === 'failed'
                          ? 'var(--err)'
                          : ss === 'running'
                            ? 'var(--brand)'
                            : ss === 'skipped'
                              ? 'var(--dim)'
                              : 'var(--line)'
                    return (
                      <span
                        key={s}
                        className="size-1.5 rounded-full"
                        style={{ background: color }}
                        title={`${STEP_META[s].code} · ${ss}`}
                      />
                    )
                  })}
                </span>
              </span>
              {stageStale && st !== 'active' && (
                <span
                  className="stale-stripes absolute top-1.5 right-1.5 size-2 rounded-full"
                  style={{ border: '1px dashed rgba(251,146,60,.8)' }}
                  title="该节点有待重跑的 stale 产物"
                />
              )}
            </button>
          )
        })}
      </div>
      {taskStatus === 'cancelled' && (
        <p className="mt-2 text-center font-mono text-xs text-dimmed">任务已取消 · 所有步骤 cancelled</p>
      )}
    </div>
  )
}
