import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { ArrowRight, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDemo } from '@/lib/demo'

/** GSAP 守则替代：framer-motion 数值插值 count-up（design.md §4，600ms） */
function CountUp({ value, className, suffix }: { value: number; className?: string; suffix?: string }) {
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => `${Math.round(v).toLocaleString()}${suffix ?? ''}`)
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1] })
    return controls.stop
  }, [value, mv])
  return <motion.span className={className}>{text}</motion.span>
}

const cardCls =
  'group rounded-lg border border-line bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-linestrong'

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
}

/** BYOK 通道就绪点阵（design/dashboard.md §3.2） */
export function ChannelDots({ i2vReady, className }: { i2vReady: boolean; className?: string }) {
  const channels = [
    { key: 'llm', ready: true },
    { key: 'image', ready: true },
    { key: 'tts', ready: true },
    { key: 'i2v', ready: i2vReady },
  ]
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {channels.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1 font-mono text-xs text-ink2">
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ background: c.ready ? 'var(--ok)' : 'var(--err)' }}
          />
          {c.key}
        </span>
      ))}
    </div>
  )
}

/** 任务统计（real 模式由 Dashboard 从 /api/tasks 聚合传入，覆盖下方硬编码 mock 数值） */
export interface OverviewStats {
  running: number
  queued: number
  done: number
  staticDone: number
  i2vDone: number
  /** 近 7 日按天产出条数（图表柱高） */
  weekBars: number[]
}

/** 概览卡行（4 卡，随轨道联动，dashboard.md §3） */
export default function OverviewCards({ stats }: { stats?: OverviewStats }) {
  const { track, setTrack, credits, byokFullConfig, missingI2vChannel } = useDemo()
  const navigate = useNavigate()
  const isByok = track === 'byok'
  const i2vReady = isByok ? byokFullConfig : !missingI2vChannel
  const staticEq = Math.floor(credits / 60)
  const i2vEq = Math.floor(credits / 300)
  const readyCount = 3 + (isByok && byokFullConfig ? 1 : 0)
  const running = stats?.running ?? 2
  const queued = stats?.queued ?? 1
  const doneCount = stats?.done ?? 9
  const staticDone = stats?.staticDone ?? 7
  const i2vDone = stats?.i2vDone ?? 2
  const weekBars = stats?.weekBars ?? [10, 16, 8, 20, 14, 24, 18]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1. 积分卡 */}
      <motion.div custom={0} variants={cardVariants} initial="hidden" animate="show" className={cardCls}>
        <AnimatePresence mode="wait" initial={false}>
          {isByok ? (
            <motion.div
              key="byok"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <p className="text-xs font-medium text-ink3">可用额度</p>
              <p className="mt-2 flex items-center gap-2 font-mono text-[26px] leading-8 font-semibold text-byok">
                <KeyRound className="size-5" />∞ 不限量
              </p>
              <p className="mt-1.5 text-[13px] leading-5 text-ink3">$0 · 自备 Key 代付 · 不限任务与重跑</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised">
                <div className="h-full w-full rounded-full" style={{ background: 'var(--byok)', opacity: 0.55 }} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="managed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-ink3">可用积分</p>
                <Link
                  to="/app/pricing"
                  className="text-xs text-brand-strong opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
                >
                  查看价格 →
                </Link>
              </div>
              <p className="mt-2 font-mono text-[26px] leading-8 font-semibold text-managed">
                💎 <CountUp value={credits} />
              </p>
              <p className="mt-1.5 text-[13px] leading-5 text-ink3">
                ≈ {staticEq} static · {i2vEq} i2v
              </p>
              {credits === 120 && (
                <p
                  className="mt-2 inline-flex rounded-full px-2.5 py-1 font-mono text-xs text-managed"
                  style={{ border: '1px dashed rgba(251,191,36,.5)', background: 'rgba(251,191,36,.08)' }}
                >
                  体验积分 120 · 一次性 ≈ 2 条 static
                </p>
              )}
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, var(--brand), var(--managed))' }}
                    initial={{ width: 0 }}
                    animate={{ width: '46%' }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                  />
                </div>
                <p className="mt-1.5 font-mono text-[11px] text-ink3">本月 3000 · 已用 1380</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 2. 轨道卡 */}
      <motion.div custom={1} variants={cardVariants} initial="hidden" animate="show" className={cardCls}>
        <p className="text-xs font-medium text-ink3">当前轨道</p>
        <AnimatePresence mode="wait" initial={false}>
          {isByok ? (
            <motion.div
              key="byok"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <p className="mt-2 text-[17px] leading-[26px] font-semibold text-byok">BYOK · 自备 Key</p>
              <p className="mt-1 text-[13px] leading-5 text-ink3">$0 · 无限任务 · 无限重跑</p>
              <ChannelDots i2vReady={i2vReady} className="mt-3" />
              {readyCount < 4 && (
                <Link to="/app/models" className="mt-2 inline-flex items-center gap-1 text-xs text-managed hover:underline">
                  缺 i2v 通道 <ArrowRight className="size-3" />
                </Link>
              )}
              <button
                type="button"
                onClick={() => setTrack('managed')}
                className="mt-2 block text-xs text-brand-strong hover:underline"
              >
                切换托管（演示）→
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="managed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <p className="mt-2 text-[17px] leading-[26px] font-semibold text-managed">托管 · 积分</p>
              <p className="mt-1 text-[13px] leading-5 text-ink3">平台 Key 池代付 · 无需配置</p>
              <div className="mt-3">
                <ChannelDots i2vReady={i2vReady} />
                {!i2vReady && (
                  <Link to="/app/models" className="mt-2 inline-flex items-center gap-1 text-xs text-managed hover:underline">
                    缺 i2v 通道 <ArrowRight className="size-3" />
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => setTrack('byok')}
                className="mt-2 block text-xs text-brand-strong hover:underline"
              >
                切换 BYOK（演示）→
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 3. 进行中任务卡 */}
      <motion.div
        custom={2}
        variants={cardVariants}
        initial="hidden"
        animate="show"
        className={cn(cardCls, 'cursor-pointer')}
        onClick={() => navigate('/app/tasks/aurora-brew-30s')}
      >
        <p className="text-xs font-medium text-ink3">进行中任务</p>
        <p className="mt-2 font-mono text-[26px] leading-8 font-semibold text-ink">
          <CountUp value={running + queued} />
        </p>
        <p className="mt-1.5 text-[13px] leading-5 text-ink3">
          <span className="font-mono text-xs" style={{ color: 'var(--brand)' }}>running {running}</span>
          {' · '}
          <span className="font-mono text-xs" style={{ color: 'var(--dim)' }}>queued {queued}</span>
        </p>
        <div className="mt-3 flex h-1.5 gap-1">
          <span className="relative flex-1 overflow-hidden rounded-full bg-raised">
            <span className="absolute inset-y-0 left-0 w-1/2 rounded-full animate-pulse" style={{ background: 'var(--brand)' }} />
          </span>
          <span className="flex-1 rounded-full bg-raised">
            <span className="block h-full w-1/4 rounded-full border border-dimmed" />
          </span>
        </div>
      </motion.div>

      {/* 4. 本月产出卡 */}
      <motion.div custom={3} variants={cardVariants} initial="hidden" animate="show" className={cardCls}>
        <p className="text-xs font-medium text-ink3">本月产出</p>
        <p className="mt-2 font-mono text-[26px] leading-8 font-semibold text-ink">
          <CountUp value={doneCount} suffix=" 条成片" />
        </p>
        <p className="mt-1.5 text-[13px] leading-5 text-ink3">
          <span className="font-mono text-xs text-modestatic">static {staticDone}</span>
          {' · '}
          <span className="font-mono text-xs text-modei2v">i2v {i2vDone}</span>
        </p>
        <div className="mt-3 flex h-8 items-end gap-1">
          {weekBars.map((h, i) => (
            <motion.span
              key={i}
              className="w-1 rounded-sm"
              style={{
                background: i >= 5 ? 'var(--mode-i2v)' : 'var(--mode-static)',
                opacity: 0.75,
              }}
              initial={{ height: 0 }}
              animate={{ height: h }}
              transition={{ delay: 0.25 + i * 0.05, duration: 0.3 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  )
}
