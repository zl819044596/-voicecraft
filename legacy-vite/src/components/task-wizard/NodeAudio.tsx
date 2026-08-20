/**
 * 节点 ④ 配音（PIPELINE_TASK_42 阶段 C）：L6 配音 TTS 单卡。
 * 字幕已拆到节点 ⑤（NodeSubtitle），L7 不再在此渲染。
 */
import { useState } from 'react'
import { Check, RotateCw, SquarePen, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { voicesForConfig, voiceLabel } from '@/lib/voices'
import type { StepStatus } from '@/components/badges'
import type { Shot, StepKey } from '@/lib/task-wizard-mock'
import { SectionCard, WaveformPlayer } from '@/components/task-wizard/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function NodeAudio({
  statuses,
  shots,
  staleShots,
  shotBusy,
  onVoiceoverSave,
  onShotRerun,
  voice,
}: {
  statuses: Record<StepKey, StepStatus>
  shots: Shot[]
  staleShots: Set<number>
  shotBusy: Set<number>
  onVoiceoverSave: (index: number, text: string) => void
  onShotRerun: (index: number) => void
  /** real 模式：任务真实音色 id（config.tts.voice），用于显示与更换 */
  voice?: string
}) {
  // 音色列表按模型写死映射：id 以 zh_ 开头=火山 seed-tts；否则 wingray
  const voiceCfg = { name: (voice ?? '').startsWith('zh_') ? 'seed-tts-2.0' : 'cosyvoice-v2' }
  const voiceOptions = voicesForConfig(voiceCfg)
  const [voiceState, setVoiceState] = useState('')
  const curVoice = voice || voiceState
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [voiceDraft, setVoiceDraft] = useState('')
  const [editVo, setEditVo] = useState<number | null>(null)
  const [voDraft, setVoDraft] = useState('')

  return (
    <div className="flex flex-col gap-4">
      {/* L6 配音卡 */}
      <SectionCard
        caption={<>L6 · 配音 TTS</>}
        running={statuses.L6 === 'running'}
        stale={staleShots.size > 0}
        right={
          <>
            <span className="rounded-full border border-line bg-raised px-2.5 py-1 font-mono text-xs text-ink2">
              {voiceLabel(curVoice, voiceCfg)} · 1.0×
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-line bg-raised text-ink2 hover:text-ink"
              onClick={() => {
                setVoiceDraft(curVoice)
                setVoiceOpen(true)
              }}
            >
              <Volume2 className="size-3.5" />
              更换音色
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          {shots.map((s) => {
            const busy = shotBusy.has(s.index)
            const stale = staleShots.has(s.index)
            return (
              <div
                key={s.index}
                className={cn(
                  'relative flex flex-col gap-2 overflow-hidden rounded-md border border-line bg-raised p-2.5 md:flex-row md:items-center',
                  stale && 'border-dashed border-stale/60',
                )}
              >
                {busy && <div className="shimmer-sweep animate-shimmer pointer-events-none absolute inset-0" />}
                <span className="w-5 shrink-0 font-mono text-xs text-ink3">{s.index}</span>
                <div className="min-w-0 md:w-64 md:shrink-0">
                  {editVo === s.index ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={voDraft}
                        onChange={(e) => setVoDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onVoiceoverSave(s.index, voDraft)
                            setEditVo(null)
                          }
                          if (e.key === 'Escape') setEditVo(null)
                        }}
                        className="w-full rounded border border-brand-strong/60 bg-surface px-2 py-1 text-xs text-ink outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onVoiceoverSave(s.index, voDraft)
                          setEditVo(null)
                        }}
                        className="rounded p-1 text-ok hover:bg-press"
                        aria-label="保存配音句"
                      >
                        <Check className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setVoDraft(s.voiceover)
                        setEditVo(s.index)
                      }}
                      title="点击编辑配音句（保存后本镜 L6 及 L7/L8 挂 stale）"
                      className="group flex w-full items-center gap-1.5 text-left"
                    >
                      <span className="line-clamp-2 text-xs text-ink2 group-hover:text-ink">{s.voiceover}</span>
                      <SquarePen className="size-3 shrink-0 text-ink3 opacity-0 transition group-hover:opacity-100" />
                    </button>
                  )}
                  {stale && (
                    <span
                      className="stale-stripes mt-1 inline-block rounded-full px-2 py-px font-mono text-[10px] font-medium text-stale"
                      style={{ border: '1px dashed rgba(251,146,60,.6)' }}
                    >
                      stale · 待重跑
                    </span>
                  )}
                </div>
                {s.voUrl ? (
                  <WaveformPlayer src={s.voUrl} duration={s.voDuration} className="min-w-0 flex-1" />
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-ink3">
                    <Volume2 className="size-3.5 opacity-40" />
                    <span className="animate-pulse">配音生成中…</span>
                  </div>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onShotRerun(s.index)}
                  className="flex shrink-0 items-center gap-1 self-start rounded px-2 py-1 text-xs text-ink2 transition hover:bg-press hover:text-ink disabled:opacity-50 md:self-center"
                >
                  <RotateCw className={cn('size-3.5', busy && 'animate-spin')} />
                  单镜重生成
                </button>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* 更换音色 Dialog */}
      <Dialog open={voiceOpen} onOpenChange={setVoiceOpen}>
        <DialogContent className="max-w-sm border-line bg-raised">
          <DialogTitle className="text-sm font-semibold text-ink">更换音色</DialogTitle>
          <div className="mt-3 flex items-center gap-2">
            <Select value={voiceDraft} onValueChange={setVoiceDraft}>
              <SelectTrigger className="border-line bg-surface"><SelectValue /></SelectTrigger>
              <SelectContent className="border-line bg-raised">
                {voiceOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="border-line bg-surface text-ink2 hover:text-ink"
              onClick={() => toast.info(`试听音色 ${voiceLabel(voiceDraft, voiceCfg)}（模拟播放）`)}
            >
              <Volume2 className="size-3.5" />
              试听
            </Button>
          </div>
          <div className="mt-2">
            <WaveformPlayer duration="0:03.8" />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" className="text-ink3" onClick={() => setVoiceOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              className="bg-brand text-white hover:bg-brand-strong"
              onClick={() => {
                setVoiceState(voiceDraft)
                setVoiceOpen(false)
                toast.success(`音色已切换为 ${voiceLabel(voiceDraft, voiceCfg)}`)
              }}
            >
              应用
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
