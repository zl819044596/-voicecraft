/**
 * 节点 ① 文案（task-wizard.md §4）：L1 选题解析 / L1.5 合规预审 / L2 文案编辑。
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Plus, ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useDemo } from '@/lib/demo'
import type { GenMode, StepStatus } from '@/components/badges'
import { INITIAL_SCRIPT_VERSIONS, STEP_META } from '@/lib/task-wizard-mock'
import type { ScriptVersion, StepKey } from '@/lib/task-wizard-mock'
import type { RealScriptVersion } from '@/lib/task-wizard-real'
import RerunControl from '@/components/task-wizard/RerunControl'
import { AmberBar, SectionCard } from '@/components/task-wizard/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function NodeCopy({
  statuses,
  staleSteps,
  l15Violation,
  freeReruns,
  mode,
  realVersions,
  realScript,
  onSaveVersion,
  onSelectVersion,
  onScriptSaved,
  onRequestRerun,
}: {
  statuses: Record<StepKey, StepStatus>
  staleSteps: Set<StepKey>
  l15Violation: boolean
  freeReruns: number
  mode: GenMode
  realVersions?: RealScriptVersion[]
  realScript?: string
  onSaveVersion?: (text: string, note?: string) => Promise<unknown>
  onSelectVersion?: (versionId: string) => Promise<unknown>
  onScriptSaved: () => void
  onRequestRerun: (from: StepKey) => void
}) {
  const { track } = useDemo()
  const realMode = realVersions !== undefined && onSaveVersion !== undefined
  const [versions, setVersions] = useState<ScriptVersion[]>(INITIAL_SCRIPT_VERSIONS)
  const [activeId, setActiveId] = useState('v3')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')

  const list = realMode ? realVersions : versions
  const active = realMode
    ? (list.find((v) => v.current) ?? list[0])
    : (list.find((v) => v.id === activeId) ?? list[0])
  const body = realMode ? (realScript ?? active?.body ?? '') : editing ? draft : (active?.body ?? '')

  const staleCount = ['L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'].filter((s) => staleSteps.has(s as StepKey)).length

  const startEdit = () => {
    setDraft(body)
    setEditing(true)
  }
  const saveEdit = () => {
    const changed = draft.trim() !== (active?.body ?? '').trim()
    if (realMode) {
      void onSaveVersion?.(draft)
      setEditing(false)
      if (changed) toast.success('文案已保存 · 已生成新版本')
      else toast.info('文案未变化')
      return
    }
    setVersions((vs) => vs.map((v) => (v.id === active.id ? { ...v, body: draft } : v)))
    setEditing(false)
    if (changed) {
      onScriptSaved()
      toast.warning('文案已保存 · 下游已标记 stale')
    } else {
      toast.info('文案未变化 · 无 stale 产生')
    }
  }
  const saveAsVersion = () => {
    const name = saveName.trim() || `v${list.length + 1} 未命名`
    if (realMode) {
      void onSaveVersion?.(draft, name)
      setEditing(false)
      setSaveOpen(false)
      setSaveName('')
      toast.success(`已保存 ${name.split(' ')[0]}`)
      return
    }
    const id = `v${Date.now()}`
    setVersions((vs) => [...vs.map((v) => ({ ...v, current: false })), { id, name, current: true, body: draft }])
    setActiveId(id)
    setEditing(false)
    setSaveOpen(false)
    setSaveName('')
    toast.success(`已保存 ${name.split(' ')[0]}`)
    onScriptSaved()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* L1 选题解析 */}
      <SectionCard
        caption={<>L1 · 选题/内容解析</>}
        running={statuses.L1 === 'running'}
        right={<span className="font-mono text-xs text-ink3">engine: LLM · 1.8s</span>}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-ink2">解析摘要：</span>
          {['目标受众 · 25-35 都市通勤族', '核心卖点 · 18h 慢萃 / 0 糖', '调性 · 高级冷峻 + 暖收束'].map((c) => (
            <span key={c} className="rounded-full border border-line bg-raised px-2.5 py-1 text-xs text-ink2">
              {c}
            </span>
          ))}
          {statuses.L1 === 'done' && <CheckCircle2 className="size-4 text-ok" />}
        </div>
      </SectionCard>

      {/* L1.5 合规预审（托管档专属；BYOK 显示 skipped 虚线态） */}
      {track === 'byok' ? (
        <SectionCard dashed caption={<>L1.5 · 合规预审</>}>
          <p className="font-mono text-xs text-dimmed">skipped · BYOK 档不执行预审 · 内容责任归用户</p>
        </SectionCard>
      ) : (
        <SectionCard
          caption={<>L1.5 · 合规预审（仅托管档）</>}
          running={statuses['L1.5'] === 'running'}
        >
          {l15Violation ? (
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-err" />
              <div>
                <span className="rounded-full border border-err/40 bg-err/10 px-2.5 py-0.5 font-mono text-xs font-medium text-err">
                  terminated · 命中违禁词
                </span>
                <p className="mt-1.5 text-[13px] text-ink3">任务已终止 · 不消耗成片积分（演示态，可由 ⋯ 菜单恢复）</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
              <div>
                <span className="rounded-full border border-ok/40 bg-ok/10 px-2.5 py-0.5 font-mono text-xs font-medium text-ok">
                  passed · 未命中合规规则
                </span>
                <p className="mt-1.5 text-[13px] text-ink3">复用提示词中心「合规规则」类型</p>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* L2 文案编辑（重点交互） */}
      <SectionCard
        caption={<>L2 · 文案生成</>}
        running={statuses.L2 === 'running'}
        stale={staleCount > 0}
        right={
          <>
            <Select
              value={realMode ? (active?.id ?? '') : activeId}
              onValueChange={(id) => {
                if (realMode) {
                  const v = list.find((x) => x.id === id)
                  if (v) setDraft(v.body)
                  setEditing(false)
                  void onSelectVersion?.(id)
                  return
                }
                setActiveId(id)
                const v = versions.find((x) => x.id === id)
                if (v) setDraft(v.body)
                setEditing(false)
              }}
            >
              <SelectTrigger className="h-8 w-52 border-line bg-raised text-xs">
                <SelectValue placeholder={realMode && list.length === 0 ? '暂无版本' : '选择版本'} />
              </SelectTrigger>
              <SelectContent className="border-line bg-raised">
                {list.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    {v.name}
                    {realMode ? (v.current ? '（当前）' : '') : v.id === activeId ? '（当前）' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-line bg-raised text-ink2 hover:text-ink"
              onClick={() => {
                setDraft(active.body)
                setSaveOpen(true)
              }}
            >
              <Plus className="size-3.5" />
              保存为版本
            </Button>
          </>
        }
      >
        <AnimatePresence mode="wait">
          <motion.div key={activeId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <div className="relative">
              <Textarea
                value={body}
                readOnly={!editing}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[200px] resize-y border-line bg-raised font-mono text-sm leading-6 text-ink2 read-only:opacity-90"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="font-mono text-xs text-ink3">{body.length} chars</span>
                {editing ? (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="ghost" className="text-ink3" onClick={() => setEditing(false)}>
                      取消
                    </Button>
                    <Button type="button" size="sm" className="bg-brand text-white hover:bg-brand-strong" onClick={saveEdit}>
                      保存
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-line bg-raised text-ink2 hover:text-ink"
                    onClick={startEdit}
                  >
                    编辑
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {staleCount > 0 && (
          <div className="mt-3">
            <AmberBar>文案已修改 · L3 及以下 {staleCount} 步已标记 stale</AmberBar>
          </div>
        )}

        <div className="mt-4 border-t border-line pt-3">
          <RerunControl
            step="L2"
            options={['L1', 'L2']}
            freeReruns={freeReruns}
            mode={mode}
            onRequest={onRequestRerun}
            label={`从 ${STEP_META.L2.code} 重跑`}
          />
        </div>
      </SectionCard>

      {/* 保存为版本 Dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm border-line bg-raised">
          <DialogTitle className="text-sm font-semibold text-ink">保存为新版本</DialogTitle>
          <Input
            autoFocus
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder={`v${list.length + 1} 版本名（如：促销强化版 II）`}
            className="mt-2 border-line bg-surface"
            onKeyDown={(e) => e.key === 'Enter' && saveAsVersion()}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" className="text-ink3" onClick={() => setSaveOpen(false)}>
              取消
            </Button>
            <Button type="button" className="bg-brand text-white hover:bg-brand-strong" onClick={saveAsVersion}>
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
