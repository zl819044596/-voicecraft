/**
 * 节点 ⑤ 合成（task-wizard.md §8）：L8 复核门 ConfirmGate + 合成进度 + 成片预览。
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CircleAlert, Music, Pause, Play, RotateCcw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { GenMode, StepStatus } from '@/components/badges'
import { COMPOSE_PHASES } from '@/lib/task-wizard-mock'
import type { RunMode, StepKey } from '@/lib/task-wizard-mock'
import RerunControl from '@/components/task-wizard/RerunControl'
import { SectionCard, WaveformPlayer } from '@/components/task-wizard/shared'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function NodeCompose({
  statusL8,
  staleL8,
  gateOpen,
  composed,
  composePhase,
  runMode,
  freeReruns,
  mode,
  videoSrc,
  meta,
  onGateChange,
  onConfirmCompose,
  onRequestRerun,
}: {
  statusL8: StepStatus
  staleL8: boolean
  gateOpen: boolean
  composed: boolean
  composePhase: number | null
  runMode: RunMode
  freeReruns: number
  mode: GenMode
  /** 真实成片视频 URL（real 模式 L8 done 后由 TaskWizard 传入）。 */
  videoSrc?: string
  /** 真实成片时长（秒）/大小（字节），real 模式。 */
  meta?: { duration: number; size: number }
  onGateChange: (open: boolean) => void
  onConfirmCompose: () => void
  onRequestRerun: (from: StepKey) => void
}) {
  const [warnOpen, setWarnOpen] = useState(false)
  const [burnSub, setBurnSub] = useState(true)
  const [subPos, setSubPos] = useState<'bottom' | 'top'>('bottom')
  const [subSize, setSubSize] = useState(1)
  const [mix, setMix] = useState(20) // -20dB → 20/40
  const [playing, setPlaying] = useState(false)

  const composing = composePhase !== null

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence mode="wait">
        {!composed ? (
          /* ---------- 复核门（ConfirmGate，design.md §5.3） ---------- */
          <motion.section
            key="gate"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative overflow-hidden rounded-[14px] p-px"
            style={{ background: 'linear-gradient(135deg, rgba(124,92,255,.8), rgba(45,212,191,.35))', boxShadow: '0 0 24px rgba(124,92,255,.25)' }}
          >
            <div className="rounded-[13px] bg-surface">
              {/* attention bar */}
              <motion.div
                initial={{ y: '-100%' }}
                animate={{ y: 0 }}
                transition={{ type: 'spring', damping: 28 }}
                className="flex flex-wrap items-center gap-2 border-b border-brand/30 bg-brand-soft px-4 py-2.5"
              >
                <CircleAlert className="size-4 text-brand-strong" />
                <span className="text-sm font-medium text-ink">
                  {runMode === 'auto' ? '复核门：合成前请人工确认' : '⏸ 复核门 · 合成前请人工确认'}
                </span>
                <span className="ml-auto flex items-center gap-2 text-xs text-ink3">
                  复核门
                  <Switch
                    checked={gateOpen}
                    onCheckedChange={(v) => {
                      if (!v) setWarnOpen(true)
                      else {
                        onGateChange(true)
                        toast.info('复核门已开启 · 合成前将再次暂停')
                      }
                    }}
                  />
                </span>
              </motion.div>

              <div className="p-4">
                {staleL8 && (
                  <p className="mb-3 rounded-md border border-dashed border-stale/60 bg-stale/10 px-3 py-2 font-mono text-xs text-stale">
                    stale · 上游已修改，确认合成将使用最新产物
                  </p>
                )}
                {/* 检查清单 */}
                <div className="mb-4 grid gap-2 md:grid-cols-2">
                  {[
                    { ok: true, text: '分镜 8/8 已出图' },
                    { ok: true, text: '画面 8/8 静态图就绪' },
                    { ok: true, text: '配音 8/8' },
                    { ok: true, text: '字幕已生成' },
                  ].map((r) => (
                    <div key={r.text} className="flex items-center gap-2 rounded-md border border-line bg-raised px-3 py-2 text-[13px]">
                      {r.ok ? <Check className="size-4 text-ok" strokeWidth={3} /> : <TriangleAlert className="size-4 text-managed" />}
                      <span className="text-ink2">{r.text}</span>
                      <span className={cn('ml-auto font-mono text-xs', r.ok ? 'text-ok' : 'text-managed')}>{r.ok ? '✓' : '⚠'}</span>
                    </div>
                  ))}
                </div>

                {/* 合成设置 */}
                <div className="mb-4 grid gap-4 rounded-md border border-line bg-raised p-3.5 md:grid-cols-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-ink2">字幕烧录</span>
                    <Switch checked={burnSub} onCheckedChange={setBurnSub} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-ink2">位置</span>
                    <div className="flex rounded-md border border-line bg-surface p-0.5 text-xs">
                      {(
                        [
                          { id: 'bottom', label: '底部' },
                          { id: 'top', label: '顶部' },
                        ] as const
                      ).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSubPos(p.id)}
                          className={cn('rounded px-2.5 py-1 transition-colors', subPos === p.id ? 'bg-brand-soft text-brand-strong' : 'text-ink3 hover:text-ink')}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 flex justify-between text-xs text-ink3">
                      字号 <span className="font-mono text-ink2">{['小', '中', '大'][subSize]}</span>
                    </p>
                    <Slider value={[subSize]} onValueChange={([v]) => setSubSize(v)} min={0} max={2} step={1} disabled={!burnSub} />
                  </div>
                  <div>
                    <p className="mb-2 flex justify-between text-xs text-ink3">
                      BGM 混音量 <span className="font-mono text-ink2">−{40 - mix} dB</span>
                    </p>
                    <Slider value={[mix]} onValueChange={([v]) => setMix(v)} min={0} max={40} step={1} />
                  </div>
                  <div className="md:col-span-2">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs text-ink3">
                      <Music className="size-3.5" /> BGM · lo-fi-sunrise.mp3（已上传）
                    </p>
                    <WaveformPlayer duration="0:30.0" />
                    <p className="mt-1.5 text-xs text-ink3">混音失败不阻断成片</p>
                  </div>
                </div>

                {/* 合成进度 / 大按钮 */}
                {composing ? (
                  <div className="rounded-md border border-line bg-raised p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      {COMPOSE_PHASES.map((p, i) => (
                        <span key={p} className="flex items-center gap-1.5 font-mono text-xs">
                          {i < (composePhase ?? 0) ? (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex size-4 items-center justify-center rounded-full bg-ok text-black">
                              <Check className="size-3" strokeWidth={3} />
                            </motion.span>
                          ) : i === composePhase ? (
                            <span className="relative flex size-4 items-center justify-center">
                              <span className="animate-pulse-ring absolute size-2.5 rounded-full bg-brand" />
                              <span className="size-2.5 rounded-full bg-brand" />
                            </span>
                          ) : (
                            <span className="size-4 rounded-full border border-line" />
                          )}
                          <span className={i <= (composePhase ?? 0) ? 'text-ink' : 'text-ink3'}>{p}</span>
                        </span>
                      ))}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-canvas">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, var(--brand), var(--byok))' }}
                        animate={{ width: `${Math.min(100, ((composePhase ?? 0) + 0.6) * 25)}%` }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    disabled={statusL8 === 'running' || (runMode === 'auto' && !gateOpen)}
                    onClick={onConfirmCompose}
                    className="shadow-glow h-11 w-full bg-brand text-[15px] font-semibold text-white hover:bg-brand-strong"
                  >
                    确认并合成 →
                  </Button>
                )}
                {runMode === 'auto' && !gateOpen && !composing && (
                  <p className="mt-2 text-center font-mono text-xs text-ink3">复核门已关闭 · L8 将随流水线自动合成</p>
                )}
              </div>
            </div>
          </motion.section>
        ) : (
          /* ---------- 完成后态：成片预览 ---------- */
          <motion.div key="done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
            <SectionCard caption={<>L8 · 视频合成 · 成片预览</>} running={statusL8 === 'running'}>
              <div className="grid gap-5 md:grid-cols-[300px_1fr]">
                {videoSrc ? (
                  /* 真实成片播放器（real 模式 L8 done 后流式播放 final.mp4） */
                  <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[14px] border border-linestrong bg-black" style={{ aspectRatio: '9/16' }}>
                    <video src={videoSrc} controls className="size-full object-contain" />
                  </div>
                ) : (
                  /* 9:16 大播放器（海报帧 + Ken Burns 模拟，原型无真实视频二进制） */
                  <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[14px] border border-linestrong bg-canvas" style={{ aspectRatio: '9/16' }}>
                    <img src="/shot-03.png" alt="成片预览" className={cn('size-full object-cover', playing && 'animate-kenburns')} />
                    {burnSub && (
                      <div className={cn('absolute inset-x-4 text-center', subPos === 'bottom' ? 'bottom-16' : 'top-10')}>
                        <span className={cn('rounded bg-black/65 px-2.5 py-1 font-medium text-white', subSize === 0 ? 'text-xs' : subSize === 1 ? 'text-sm' : 'text-base')}>
                          Slow-steeped. Poured fast.
                        </span>
                      </div>
                    )}
                    {/* 控制条 */}
                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pt-8 pb-2.5">
                      <button
                        type="button"
                        onClick={() => setPlaying((v) => !v)}
                        className="flex size-8 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
                        aria-label={playing ? '暂停' : '播放'}
                      >
                        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
                      </button>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
                        <div className={cn('h-full rounded-full bg-brand-strong transition-[width]', playing ? 'w-2/3' : 'w-1/3')} />
                      </div>
                      <span className="font-mono text-[10px] text-white/80">0:30</span>
                    </div>
                  </div>
                )}
                {/* 信息列 */}
                <div className="flex flex-col gap-3">
                  <div className="rounded-md border border-line bg-raised p-3.5 font-mono text-[13px] leading-7 text-ink2">
                    {meta ? (
                      <>
                        成片已生成 · 时长 {Math.round(meta.duration)}s · 大小 {(meta.size / 1048576).toFixed(1)} MB
                        <br />
                        字幕烧录 {burnSub ? 'on' : 'off'}
                      </>
                    ) : (
                      <>
                        1920×1080 · 30s · H.264 · 24.6 MB
                        <br />
                        字幕烧录 {burnSub ? 'on' : 'off'} · BGM −{40 - mix}dB
                        <br />
                        <span className="text-ink3">全静态画面 · 8/8 出图</span>
                      </>
                    )}
                  </div>
                  <RerunControl step="L8" freeReruns={freeReruns} mode={mode} onRequest={onRequestRerun} label="重新合成" />
                  <button
                    type="button"
                    onClick={() => {
                      if (videoSrc) {
                        navigator.clipboard.writeText(videoSrc).catch(() => {})
                        toast.success('预览链接已复制')
                      } else {
                        toast.success('成片预览链接已复制（模拟）')
                      }
                    }}
                    className="self-start rounded-md border border-line bg-raised px-3 py-1.5 text-xs text-ink2 transition hover:text-ink"
                  >
                    复制预览链接
                  </button>
                </div>
              </div>
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 关闭复核门警告 */}
      <AlertDialog open={warnOpen} onOpenChange={setWarnOpen}>
        <AlertDialogContent className="border-line bg-raised">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-ink">
              <TriangleAlert className="size-4 text-managed" />
              关闭复核门？
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ink2">
              关闭后 auto 模式将跳过人工确认直接合成，半成品可能直接烧入成片。确定关闭？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-line bg-surface text-ink2 hover:text-ink">保持开启</AlertDialogCancel>
            <AlertDialogAction
              className="bg-managed/90 text-black hover:bg-managed"
              onClick={() => {
                onGateChange(false)
                setWarnOpen(false)
                toast.warning('复核门已关闭 · 合成将不再暂停')
              }}
            >
              <RotateCcw className="size-3.5" />
              确认关闭
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
