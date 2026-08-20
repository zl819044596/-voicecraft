import { Check, ChevronsRight, CircleSlash, Cloud, KeyRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDemo } from '@/lib/demo'
import type { Track } from '@/lib/demo'

/* ---------- StatusBadge（design.md §3.4 / §5.3） ---------- */

export type StepStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'skipped'
export type TaskStatus = Exclude<StepStatus, 'skipped'>

const STATUS_STYLE: Record<StepStatus, { color: string; label: string }> = {
  queued: { color: 'var(--dim)', label: 'queued' },
  running: { color: 'var(--brand)', label: 'running' },
  done: { color: 'var(--ok)', label: 'done' },
  failed: { color: 'var(--err)', label: 'failed' },
  cancelled: { color: 'var(--dim)', label: 'cancelled' },
  skipped: { color: 'var(--dim)', label: 'skipped' },
}

export function StatusBadge({ status, label, className }: { status: StepStatus; label?: string; className?: string }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-xs font-medium', className)} style={{ color: s.color }}>
      <span className="relative inline-flex size-2 items-center justify-center">
        {status === 'running' && (
          <span className="absolute inline-flex size-2 rounded-full animate-pulse-ring" style={{ background: s.color }} />
        )}
        {status === 'done' ? (
          <Check className="size-3" strokeWidth={3} />
        ) : status === 'failed' ? (
          <X className="size-3" strokeWidth={3} />
        ) : status === 'cancelled' ? (
          <CircleSlash className="size-3" />
        ) : status === 'skipped' ? (
          <ChevronsRight className="size-3" />
        ) : (
          <span
            className={cn('inline-flex size-2 rounded-full', status === 'queued' && 'border')}
            style={{ background: status === 'running' ? s.color : 'transparent', borderColor: s.color }}
          />
        )}
      </span>
      {label ?? s.label}
    </span>
  )
}

/* ---------- TrackChip / ModeChip ---------- */

export function TrackChip({ track, className }: { track: Track; className?: string }) {
  const isByok = track === 'byok'
  const Icon: LucideIcon = isByok ? KeyRound : Cloud
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', className)}
      style={{
        color: isByok ? 'var(--byok)' : 'var(--managed)',
        background: isByok ? 'rgba(45,212,191,.12)' : 'rgba(251,191,36,.12)',
        border: `1px solid ${isByok ? 'rgba(45,212,191,.35)' : 'rgba(251,191,36,.35)'}`,
      }}
    >
      <Icon className="size-3.5" />
      {isByok ? 'BYOK' : '托管'}
    </span>
  )
}

export type GenMode = 'static' | 'i2v'

export function ModeChip({ mode, className }: { mode: GenMode; className?: string }) {
  const isStatic = mode === 'static'
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-1 font-mono text-xs font-medium', className)}
      style={{
        color: isStatic ? 'var(--mode-static)' : 'var(--mode-i2v)',
        background: isStatic ? 'rgba(56,189,248,.12)' : 'rgba(232,121,249,.12)',
        border: `1px solid ${isStatic ? 'rgba(56,189,248,.35)' : 'rgba(232,121,249,.35)'}`,
      }}
    >
      {mode}
    </span>
  )
}

/* ---------- StaleBadge ---------- */

export function StaleBadge({ onClick, className }: { onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="上游已修改，重跑后自动清除"
      className={cn(
        'stale-stripes animate-stale-shift inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs font-medium text-stale',
        className,
      )}
      style={{ border: '1px dashed rgba(251,146,60,.6)' }}
    >
      stale · 待重跑
    </button>
  )
}

/* ---------- CreditPill（托管档积分 / BYOK 不限量） ---------- */

export function CreditPill({ className }: { className?: string }) {
  const { track, credits } = useDemo()
  if (track === 'byok') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[13px] font-medium', className)}
        style={{ color: 'var(--byok)', background: 'rgba(45,212,191,.12)', border: '1px solid rgba(45,212,191,.35)' }}
      >
        ∞ BYOK 不限量
      </span>
    )
  }
  const staticEq = Math.floor(credits / 60)
  const i2vEq = Math.floor(credits / 300)
  return (
    <span
      title={`≈ ${staticEq} static · ${i2vEq} i2v`}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[13px] font-semibold', className)}
      style={{ color: 'var(--managed)', background: 'rgba(251,191,36,.10)', border: '1px solid rgba(251,191,36,.3)' }}
    >
      <span aria-hidden>💎</span>
      {credits.toLocaleString()}
    </span>
  )
}

/* ---------- MaskedKey（Key 安全红线：仅回显 masked） ---------- */

export function MaskedKey({ value, className }: { value: string; className?: string }) {
  return (
    <code className={cn('font-mono text-[13px] text-ink2', className)}>{value}</code>
  )
}
