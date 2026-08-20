/**
 * Shared page-local components for the Task Wizard (task-wizard.md §5.3/§5.4).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { KeyRound, Pause, Play, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/* ---------------- SectionCard ---------------- */

export function SectionCard({
  caption,
  right,
  children,
  className,
  stale,
  running,
  dashed,
}: {
  caption?: React.ReactNode
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
  stale?: boolean
  running?: boolean
  dashed?: boolean
}) {
  return (
    <section
      className={cn('relative overflow-hidden rounded-[10px] border bg-surface p-4', className)}
      style={{
        borderColor: stale ? 'rgba(251,146,60,.6)' : 'var(--line)',
        borderStyle: stale || dashed ? 'dashed' : 'solid',
      }}
    >
      {running && (
        <div className="shimmer-sweep animate-shimmer pointer-events-none absolute inset-0 z-10" aria-hidden />
      )}
      {(caption || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-xs font-medium tracking-wide text-ink3">{caption}</div>
          {right && <div className="flex items-center gap-2">{right}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/* ---------------- AmberBar（编辑器内提示条） ---------------- */

export function AmberBar({ children, tone = 'amber' }: { children: React.ReactNode; tone?: 'amber' | 'teal' | 'err' }) {
  const styles =
    tone === 'amber'
      ? { border: '1px solid rgba(251,191,36,.4)', background: 'rgba(251,191,36,.08)', color: 'var(--managed)' }
      : tone === 'teal'
        ? { border: '1px solid rgba(45,212,191,.4)', background: 'rgba(45,212,191,.08)', color: 'var(--byok)' }
        : { border: '1px solid rgba(248,113,113,.4)', background: 'rgba(248,113,113,.08)', color: 'var(--err)' }
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px]"
      style={styles}
    >
      {children}
    </motion.div>
  )
}

/* ---------------- WaveformPlayer（design.md §5.3） ---------------- */

export function WaveformPlayer({ duration, src, className }: { duration: string; src?: string; className?: string }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // 36 根确定性随机高度柱（2px 宽）
  const bars = useMemo(() => Array.from({ length: 36 }, (_, i) => 18 + ((i * 37 + 11) % 23) * 2.6), [])

  // 真实音频（src 存在时）：Audio 元素 + timeupdate 驱动进度；无 src 走假进度（demo）。
  useEffect(() => {
    if (!src) return
    const a = new Audio(src)
    a.preload = 'metadata'
    const onTime = () => setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0)
    const onEnd = () => {
      setPlaying(false)
      setProgress(0)
    }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('ended', onEnd)
    a.addEventListener('error', () => setPlaying(false))
    audioRef.current = a
    return () => {
      a.pause()
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('ended', onEnd)
      audioRef.current = null
    }
  }, [src])

  useEffect(() => {
    if (!playing || src) return
    const t = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          setPlaying(false)
          return 0
        }
        return p + 1.4
      })
    }, 45)
    return () => clearInterval(t)
  }, [playing, src])

  const toggle = () => {
    if (src) {
      const a = audioRef.current
      if (!a) return
      if (playing) {
        a.pause()
        setPlaying(false)
      } else {
        void a.play().catch(() => setPlaying(false))
        setPlaying(true)
      }
      return
    }
    if (!playing && progress >= 100) setProgress(0)
    setPlaying((v) => !v)
  }

  return (
    <div className={cn('flex h-12 items-center gap-2 rounded-md border border-line bg-raised px-2.5', className)}>
      <button
        type="button"
        onClick={toggle}
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-strong"
        aria-label={playing ? '暂停' : '播放'}
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
      </button>
      <div className="relative flex h-9 flex-1 items-center gap-[2px] overflow-hidden">
        {bars.map((h, i) => {
          const lit = (i / bars.length) * 100 <= progress
          return (
            <span
              key={i}
              className="w-[2px] shrink-0 rounded-full transition-colors duration-100"
              style={{
                height: `${h}%`,
                background: lit ? 'var(--brand-strong)' : 'rgba(124,92,255,.4)',
              }}
            />
          )
        })}
        {playing && (
          <span
            className="absolute inset-y-0 w-8 bg-gradient-to-r from-transparent via-white/15 to-transparent"
            style={{ left: `${progress}%` }}
            aria-hidden
          />
        )}
      </div>
      <span className="shrink-0 font-mono text-xs text-ink2">{duration}</span>
      <span className="shrink-0 font-mono text-[10px] text-ink3">1.0×</span>
    </div>
  )
}

/* ---------------- Lightbox（候选图/预览放大） ---------------- */

export function Lightbox({
  open,
  onOpenChange,
  src,
  title,
  prompt,
  actionLabel,
  onAction,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  src: string
  title?: string
  prompt?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-line bg-raised p-4">
        <DialogTitle className="text-sm font-semibold text-ink">{title ?? '预览'}</DialogTitle>
        <div className="mt-2 flex justify-center overflow-hidden rounded-lg border border-line bg-canvas">
          <img src={src} alt={title ?? ''} className="max-h-[60vh] object-contain" />
        </div>
        {prompt && <p className="mt-3 max-h-28 overflow-y-auto rounded-md bg-surface p-3 font-mono text-xs leading-5 text-ink2">{prompt}</p>}
        {actionLabel && onAction && (
          <div className="mt-3 flex justify-end">
            <Button className="bg-brand text-white hover:bg-brand-strong" onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- 402Modal（design.md §5.4 / PRD 场景 1） ---------------- */

export function Modal402({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-line bg-raised">
        <div className="flex items-center gap-2.5">
          <DialogTitle className="text-[17px] font-semibold text-ink">积分不足</DialogTitle>
          <span className="rounded-full border border-err/40 bg-err/10 px-2.5 py-0.5 font-mono text-xs font-medium text-err">
            402 INSUFFICIENT_CREDITS
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-ink2">本次重跑需 20 积分（static），当前余额不足。选择一种方式继续：</p>
        <div className="mt-4 grid gap-2.5">
          <button
            type="button"
            onClick={() => go('/app/models')}
            className="group flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5 text-left transition hover:border-byok/60"
          >
            <KeyRound className="mt-0.5 size-4 shrink-0 text-byok" />
            <span>
              <span className="block text-sm font-medium text-ink">配 Key 转 BYOK · 重跑免费</span>
              <span className="mt-0.5 block text-xs text-ink3">接入你自己的模型通道，平台不收积分，重跑不限次数</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => go('/app/pricing')}
            className="group flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5 text-left transition hover:border-managed/60"
          >
            <span className="mt-0.5 font-mono text-sm font-semibold text-managed">$1.9</span>
            <span>
              <span className="block text-sm font-medium text-ink">按次加油包 · 190 积分</span>
              <span className="mt-0.5 block text-xs text-ink3">即充即用，覆盖本次重跑（20 积分）后仍有结余</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => go('/app/pricing')}
            className="group flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5 text-left transition hover:border-brand-strong/60"
          >
            <span className="mt-0.5 font-mono text-sm font-semibold text-brand-strong">$9.9</span>
            <span>
              <span className="block text-sm font-medium text-ink">Starter 套餐 · 900 积分/月</span>
              <span className="mt-0.5 block text-xs text-ink3">含 3 次免费重跑，覆盖多次重跑场景</span>
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 rounded p-1 text-ink3 hover:bg-press hover:text-ink"
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </DialogContent>
    </Dialog>
  )
}
