/**
 * 节点 ② 分镜（task-wizard.md §5）：L3 镜头表格 + Drawer 全字段编辑 + 单镜 stale 粒度。
 */
import { useState } from 'react'
import { RotateCw, Split, SquarePen } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { GenMode, StepStatus } from '@/components/badges'
import { MOTIONS } from '@/lib/task-wizard-mock'
import type { MotionKind, Shot, StepKey } from '@/lib/task-wizard-mock'
import RerunControl from '@/components/task-wizard/RerunControl'
import { SectionCard } from '@/components/task-wizard/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const MOTION_STYLE: Record<MotionKind, string> = {
  'push-in': 'text-modei2v border-modei2v/40 bg-modei2v/10',
  pan: 'text-modestatic border-modestatic/40 bg-modestatic/10',
  orbit: 'text-brand-strong border-brand-strong/40 bg-brand-soft',
  static: 'text-ink3 border-line bg-raised',
}

export default function NodeStoryboard({
  statuses,
  shots,
  staleShotIdx,
  shotBusy,
  flashIdx,
  freeReruns,
  mode,
  onRegenerateStoryboard,
  onShotEdited,
  onShotRerun,
  onRequestRerun,
}: {
  statuses: Record<StepKey, StepStatus>
  shots: Shot[]
  /** ③画面 有 stale 的镜头（prompt 修改导致） */
  staleShotIdx: Set<number>
  shotBusy: Set<number>
  flashIdx: number | null
  freeReruns: number
  mode: GenMode
  /** real 模式：全量重拆分调后端端点；缺省回落 mock 的 L3 重跑 */
  onRegenerateStoryboard?: () => void
  onShotEdited: (index: number, patch: Partial<Shot>) => void
  onShotRerun: (index: number) => void
  onRequestRerun: (from: StepKey) => void
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [form, setForm] = useState<Shot | null>(null)

  const openEdit = (s: Shot) => {
    setForm({ ...s })
    setEditIdx(s.index)
  }
  const saveEdit = () => {
    if (!form) return
    const orig = shots.find((s) => s.index === form.index)
    const patch: Partial<Shot> = { ...form }
    onShotEdited(form.index, patch)
    setEditIdx(null)
    setForm(null)
    void orig
  }

  return (
    <SectionCard
      caption={<>L3 · 分镜生成</>}
      running={statuses.L3 === 'running'}
      right={
        <>
          <span className="rounded-full border border-line bg-raised px-2.5 py-1 font-mono text-xs text-ink2">ecommerce</span>
          <span className="font-mono text-xs text-ink3">8 镜 · 总时长 30s · 9:16</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-line bg-raised text-ink2 hover:text-ink"
            onClick={() => {
              if (onRegenerateStoryboard) onRegenerateStoryboard()
              else onRequestRerun('L3')
            }}
          >
            <Split className="size-3.5" />
            全量重拆分
          </Button>
          <RerunControl step="L3" freeReruns={freeReruns} mode={mode} onRequest={onRequestRerun} />
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-xs font-medium text-ink3">
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">标题 title</th>
              <th className="px-2 py-2 font-medium">时长</th>
              <th className="px-2 py-2 font-medium">场景 scene</th>
              <th className="px-2 py-2 font-medium">口播 voiceover</th>
              <th className="px-2 py-2 font-medium">字幕 subtitle</th>
              <th className="px-2 py-2 font-medium">画面 prompt</th>
              <th className="px-2 py-2 font-medium">motion</th>
              <th className="px-2 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {shots.map((s) => {
              const stale = staleShotIdx.has(s.index)
              const busy = shotBusy.has(s.index)
              return (
                <tr key={s.index} className="relative border-b border-line/60 transition-colors last:border-0 hover:bg-raised">
                  <td className="px-2 py-2.5 font-mono text-xs text-ink3">
                    {busy ? (
                      <span className="shimmer-sweep animate-shimmer inline-block h-4 w-6 rounded" />
                    ) : (
                      s.index
                    )}
                  </td>
                  <td className="px-2 py-2.5 font-medium whitespace-nowrap text-ink">{s.title}</td>
                  <td className="px-2 py-2.5 font-mono text-xs text-ink2">{s.duration}</td>
                  <td className="max-w-40 px-2 py-2.5">
                    <span className="line-clamp-2 text-ink2">{s.scene}</span>
                  </td>
                  <td className="max-w-44 px-2 py-2.5">
                    <span className="line-clamp-2 text-ink2">{s.voiceover}</span>
                  </td>
                  <td className="max-w-36 px-2 py-2.5">
                    <span className="line-clamp-2 text-ink2">{s.subtitle}</span>
                  </td>
                  <td className="max-w-56 px-2 py-2.5">
                    <motion.span
                      animate={flashIdx === s.index ? { boxShadow: ['0 0 0 0 rgba(251,146,60,0)', '0 0 0 3px rgba(251,146,60,.7)', '0 0 0 0 rgba(251,146,60,0)'] } : {}}
                      transition={{ duration: 0.6 }}
                      className="line-clamp-2 rounded px-1 font-mono text-xs text-ink2"
                    >
                      {s.prompt}
                    </motion.span>
                    {stale && (
                      <motion.span
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="stale-stripes mt-1 inline-block rounded-full px-2 py-px font-mono text-[10px] font-medium text-stale"
                        style={{ border: '1px dashed rgba(251,146,60,.6)' }}
                      >
                        stale · 镜头 {s.index} 下游待重跑
                      </motion.span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={cn('rounded-full border px-2 py-0.5 font-mono text-[11px]', MOTION_STYLE[s.motion])}>
                      {s.motion}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-ink2 transition hover:bg-press hover:text-ink"
                      >
                        <SquarePen className="size-3.5" />
                        编辑
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onShotRerun(s.index)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-ink2 transition hover:bg-press hover:text-ink disabled:opacity-50"
                      >
                        <RotateCw className={cn('size-3.5', busy && 'animate-spin')} />
                        单镜重生成
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 编辑 Drawer（480px 右滑入，十字段齐全） */}
      <Sheet open={editIdx !== null} onOpenChange={(v) => !v && (setEditIdx(null), setForm(null))}>
        <SheetContent className="w-[480px] overflow-y-auto border-line bg-raised sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle className="text-ink">编辑镜头 #{form?.index}</SheetTitle>
          </SheetHeader>
          {form && (
            <div className="mt-4 flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 text-xs text-ink3">index</Label>
                  <Input value={form.index} readOnly className="border-line bg-surface font-mono text-ink3" />
                </div>
                <div>
                  <Label className="mb-1 text-xs text-ink3">duration</Label>
                  <Input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className="border-line bg-surface font-mono" />
                </div>
              </div>
              <div>
                <Label className="mb-1 text-xs text-ink3">title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="border-line bg-surface" />
              </div>
              <div>
                <Label className="mb-1 text-xs text-ink3">scene</Label>
                <Textarea value={form.scene} onChange={(e) => setForm({ ...form, scene: e.target.value })} className="min-h-16 border-line bg-surface" />
              </div>
              <div>
                <Label className="mb-1 text-xs text-ink3">script</Label>
                <Textarea value={form.script} onChange={(e) => setForm({ ...form, script: e.target.value })} className="min-h-16 border-line bg-surface" />
              </div>
              <div>
                <Label className="mb-1 text-xs text-ink3">voiceover</Label>
                <Textarea value={form.voiceover} onChange={(e) => setForm({ ...form, voiceover: e.target.value })} className="min-h-16 border-line bg-surface" />
              </div>
              <div>
                <Label className="mb-1 text-xs text-ink3">subtitle</Label>
                <Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="border-line bg-surface" />
              </div>
              <div>
                <Label className="mb-1 text-xs text-ink3">prompt（修改保存 → 仅本镜 L4/L5/L6 挂 stale）</Label>
                <Textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} className="min-h-24 border-line bg-surface font-mono text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 text-xs text-ink3">aspect</Label>
                  <Select value={form.aspect} onValueChange={(v) => setForm({ ...form, aspect: v })}>
                    <SelectTrigger className="border-line bg-surface font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-line bg-raised">
                      {['9:16', '16:9', '1:1'].map((a) => (
                        <SelectItem key={a} value={a} className="font-mono">{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 text-xs text-ink3">motion</Label>
                  <Select value={form.motion} onValueChange={(v) => setForm({ ...form, motion: v as MotionKind })}>
                    <SelectTrigger className="border-line bg-surface font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-line bg-raised">
                      {MOTIONS.map((m) => (
                        <SelectItem key={m} value={m} className="font-mono">{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" className="text-ink3" onClick={() => (setEditIdx(null), setForm(null))}>
                  取消
                </Button>
                <Button type="button" className="bg-brand text-white hover:bg-brand-strong" onClick={saveEdit}>
                  保存修改
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </SectionCard>
  )
}
