/**
 * 节点 ⑤ 字幕（PIPELINE_TASK_42 阶段 C）：L7 字幕生成单卡。
 * 由原 NodeAudio 拆分而来（配音 L6 独立为节点 ④）。
 */
import { useState } from 'react'
import { Check, SquarePen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StepStatus } from '@/components/badges'
import type { Shot, StepKey } from '@/lib/task-wizard-mock'
import { AmberBar, SectionCard } from '@/components/task-wizard/shared'
import { Slider } from '@/components/ui/slider'

const FONT_SIZES = ['小', '中', '大'] as const

export default function NodeSubtitle({
  statuses,
  shots,
  staleSteps,
  onSubtitleSettings,
  onSubtitleSave,
}: {
  statuses: Record<StepKey, StepStatus>
  shots: Shot[]
  staleSteps: Set<StepKey>
  /** real 模式：字幕参数调整结束（onValueCommit）→ 保存；后端重置 L7+ 重跑。 */
  onSubtitleSettings?: (patch: { chars_per_line?: number; font_size?: number; position?: string }) => void
  onSubtitleSave: (index: number, text: string) => void
}) {
  const [editSub, setEditSub] = useState<number | null>(null)
  const [subDraft, setSubDraft] = useState('')
  const [fontSize, setFontSize] = useState(1)
  const [charsPerLine, setCharsPerLine] = useState(12)

  const previewShot = shots[3] ?? shots[0]
  const previewSize = fontSize === 0 ? 'text-xs' : fontSize === 1 ? 'text-sm' : 'text-base'

  const handleSubtitlePatch = (patch: { chars_per_line?: number; font_size?: number; position?: string }) => {
    if (!onSubtitleSettings) return
    onSubtitleSettings(patch)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* L7 字幕卡 */}
      <SectionCard
        caption={<>L7 · 字幕生成</>}
        running={statuses.L7 === 'running'}
        stale={staleSteps.has('L7')}
      >
        {/* 节奏设置行 */}
        <div className="mb-4 grid gap-4 rounded-md border border-line bg-raised p-3 md:grid-cols-[1fr_1fr_260px]">
          <div>
            <p className="mb-2 flex justify-between text-xs text-ink3">
              字号 <span className="font-mono text-ink2">{FONT_SIZES[fontSize]}</span>
            </p>
            <Slider
              value={[fontSize]}
              onValueChange={([v]) => setFontSize(v)}
              onValueCommit={([v]) => handleSubtitlePatch({ font_size: 16 + v * 6 })}
              min={0}
              max={2}
              step={1}
            />
          </div>
          <div>
            <p className="mb-2 flex justify-between text-xs text-ink3">
              每行字数 <span className="font-mono text-ink2">{charsPerLine}</span>
            </p>
            <Slider
              value={[charsPerLine]}
              onValueChange={([v]) => setCharsPerLine(v)}
              onValueCommit={([v]) => handleSubtitlePatch({ chars_per_line: v })}
              min={8}
              max={16}
              step={1}
            />
          </div>
          {/* 迷你预览 */}
          <div className="relative h-24 overflow-hidden rounded-md border border-line">
            <img src="/shot-04.png" alt="字幕预览" className="size-full object-cover" />
            <div className="absolute inset-x-2 bottom-2 text-center">
              <span
                className={cn('rounded bg-black/65 px-2 py-0.5 font-medium text-white', previewSize)}
                style={{ maxWidth: `${charsPerLine * 1.1}em` }}
              >
                {previewShot.subtitle}
              </span>
            </div>
          </div>
        </div>

        {staleSteps.has('L7') && (
          <div className="mb-3">
            <AmberBar>字幕已修改 · 需重新合成（L7/L8 已标记 stale）</AmberBar>
          </div>
        )}

        {/* 字幕文本块（按镜头分组，可直接编辑） */}
        <div className="grid gap-2 md:grid-cols-2">
          {shots.map((s) => (
            <div key={s.index} className="flex items-center gap-2 rounded-md border border-line bg-raised px-2.5 py-2">
              <span className="w-5 shrink-0 font-mono text-xs text-ink3">{s.index}</span>
              {editSub === s.index ? (
                <div className="flex flex-1 items-center gap-1.5">
                  <input
                    autoFocus
                    value={subDraft}
                    onChange={(e) => setSubDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onSubtitleSave(s.index, subDraft)
                        setEditSub(null)
                      }
                      if (e.key === 'Escape') setEditSub(null)
                    }}
                    className="w-full rounded border border-brand-strong/60 bg-surface px-2 py-1 text-xs text-ink outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onSubtitleSave(s.index, subDraft)
                      setEditSub(null)
                    }}
                    className="rounded p-1 text-ok hover:bg-press"
                    aria-label="保存字幕"
                  >
                    <Check className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSubDraft(s.subtitle)
                    setEditSub(s.index)
                  }}
                  className="group flex flex-1 items-center gap-1.5 text-left"
                  title="点击编辑字幕"
                >
                  <span className="truncate text-xs text-ink2 group-hover:text-ink">{s.subtitle}</span>
                  <SquarePen className="size-3 shrink-0 text-ink3 opacity-0 transition group-hover:opacity-100" />
                </button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
