/**
 * 节点 ⑥ 交付（task-wizard.md §9）：L9 复检报告 + L10 开放导出（ExportTree + 410 过期态）。
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Download,
  Eye,
  File,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { StepStatus } from '@/components/badges'
import { EXPORT_TREE } from '@/lib/task-wizard-mock'
import type { ExportNode } from '@/lib/task-wizard-mock'
import { SectionCard, WaveformPlayer } from '@/components/task-wizard/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/* ---------------- ExportTree（design.md §5.3） ---------------- */

function kindIcon(n: ExportNode) {
  if (n.kind === 'dir' || n.kind === 'zip') return null
  if (n.kind === 'image') return <FileImage className="size-4 text-ink3" />
  if (n.kind === 'video') return <FileVideo className="size-4 text-ink3" />
  if (n.kind === 'audio') return <FileAudio className="size-4 text-ink3" />
  if (n.kind === 'json' || n.kind === 'srt') return <FileCode className="size-4 text-ink3" />
  if (n.kind === 'md' || n.kind === 'txt') return <FileText className="size-4 text-ink3" />
  return <File className="size-4 text-ink3" />
}

function TreeRow({
  node,
  depth,
  onPreview,
  disabled,
}: {
  node: ExportNode
  depth: number
  onPreview: (n: ExportNode) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(depth < 2)
  const isDir = node.kind === 'dir' || node.kind === 'zip'
  return (
    <div>
      <div
        className="group flex items-center gap-1.5 rounded px-1.5 py-1 font-mono text-[13px] transition-colors hover:bg-press"
        style={{ paddingLeft: `${depth * 18 + 6}px` }}
      >
        {isDir ? (
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-ink" disabled={disabled}>
            <ChevronRight className={cn('size-3.5 text-ink3 transition-transform', open && 'rotate-90')} />
            {open ? <FolderOpen className="size-4 text-brand-strong" /> : <Folder className="size-4 text-brand-strong" />}
            <span className="font-semibold">{node.name}</span>
          </button>
        ) : (
          <>
            <span className="w-3.5" />
            {kindIcon(node)}
            <span className="text-ink2">{node.name}</span>
          </>
        )}
        {node.note && <span className="ml-2 text-[11px] text-ink3">{node.note}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {node.size && <span className="text-xs text-ink3 opacity-0 transition group-hover:opacity-100">{node.size}</span>}
          {!isDir && !disabled && (
            <>
              <button
                type="button"
                onClick={() => onPreview(node)}
                className="rounded p-1 text-ink3 opacity-0 transition group-hover:opacity-100 hover:bg-canvas hover:text-ink"
                title="预览"
              >
                <Eye className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => toast.success(`已开始下载 ${node.name}（模拟）`)}
                className="rounded p-1 text-ink3 opacity-0 transition group-hover:opacity-100 hover:bg-canvas hover:text-ink"
                title="下载"
              >
                <Download className="size-3.5" />
              </button>
            </>
          )}
        </span>
      </div>
      {isDir && open && node.children && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-l border-line" style={{ marginLeft: `${depth * 18 + 13}px` }}>
          {node.children.map((c) => (
            <TreeRow key={c.name} node={c} depth={depth + 1} onPreview={onPreview} disabled={disabled} />
          ))}
        </motion.div>
      )}
    </div>
  )
}

/* ---------------- 节点主体 ---------------- */

export default function NodeDeliver({
  statusL9,
  statusL10,
  l9State,
  realReport,
  videoSrc,
  exportExpired,
  exportRegen,
  exportHref,
  exportExpiryLabel,
  onRerunL9,
  onGotoStage,
  onRegenerateExport,
}: {
  statusL9: StepStatus
  statusL10: StepStatus
  l9State: 'passed' | 'feedback'
  /** real 模式：真实成片视频 URL（L8 done 后由 TaskWizard 传入；无则 demo 保持原样）。 */
  videoSrc?: string
  /** real 模式：L9 复检报告（step 9 payload）。 */
  realReport?: { passed: boolean; issues: string[]; summary: string }
  exportExpired: boolean
  exportRegen: boolean
  /** real 模式：zip 下载地址（原生 <a download>，勿 fetch blob）。 */
  exportHref?: string
  exportExpiryLabel?: string
  onRerunL9: () => void
  onGotoStage: (stage: number) => void
  onRegenerateExport: () => void
}) {
  const [preview, setPreview] = useState<ExportNode | null>(null)
  const [l9Busy, setL9Busy] = useState(false)

  const issues = realReport && realReport.passed === false
    ? realReport.issues.map((text) => ({ text, stage: null as number | null }))
    : [
        { text: '镜头 3 构图对比度偏低 · 可重跑 L4 增强', stage: 3 as number | null },
        { text: '镜头 7 字幕略超每行字数', stage: 5 as number | null },
      ]

  const rerunL9 = () => {
    setL9Busy(true)
    onRerunL9()
    setTimeout(() => {
      setL9Busy(false)
      toast.success('复检完成 · 报告已刷新')
    }, 1500)
  }

  const isCode = preview && ['json', 'md', 'srt', 'txt'].includes(preview.kind)

  return (
    <div className="flex flex-col gap-4">
      {/* L9 复检报告卡 */}
      <SectionCard
        caption={<>L9 · 复检</>}
        running={statusL9 === 'running' || l9Busy}
        right={
          <Button type="button" size="sm" variant="outline" disabled={l9Busy} className="border-line bg-raised text-ink2 hover:text-ink" onClick={rerunL9}>
            <RefreshCw className={cn('size-3.5', l9Busy && 'animate-spin')} />
            重新复检
          </Button>
        }
      >
        {l9State === 'passed' ? (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-ok/40 bg-ok/10 px-3 py-1 font-mono text-sm font-medium text-ok">
                <CheckCircle2 className="size-4" />
                passed · ✓ 复检通过
              </span>
            </div>
            {videoSrc && (
              <div className="mb-4 flex justify-center">
                <div className="relative w-full max-w-[300px] overflow-hidden rounded-[14px] border border-linestrong bg-black" style={{ aspectRatio: '9/16' }}>
                  <video src={videoSrc} controls className="size-full object-contain" />
                </div>
              </div>
            )}
            <div className="grid gap-2 md:grid-cols-2">
              {['字幕与配音对齐 ✓', '时长一致 30s ✓', '画面覆盖率 100% ✓', '合规抽检通过 ✓'].map((t) => (
                <div key={t} className="flex items-center gap-2 rounded-md border border-line bg-raised px-3 py-2 text-[13px] text-ink2">
                  <CheckCircle2 className="size-3.5 text-ok" />
                  {t}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-managed/40 bg-managed/10 px-3 py-1 font-mono text-sm font-medium text-managed">
                <CircleAlert className="size-4" />
                feedback · {issues.length} 条建议
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {issues.map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-managed/30 bg-managed/5 px-3 py-2.5 text-[13px] text-ink2">
                  <CircleAlert className="size-4 shrink-0 text-managed" />
                  {f.text}
                  {f.stage !== null && (
                    <button
                      type="button"
                      onClick={() => onGotoStage(f.stage as number)}
                      className="ml-auto shrink-0 rounded px-2 py-1 text-xs font-medium text-brand-strong transition hover:bg-brand-soft"
                    >
                      去处理 →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* L10 开放导出卡 */}
      <section
        className="relative overflow-hidden rounded-[10px] bg-surface p-4"
        style={
          exportExpired
            ? { border: '1px dashed rgba(248,113,113,.6)' }
            : { border: '1px solid var(--line)' }
        }
      >
        {(statusL10 === 'running' || exportRegen) && (
          <div className="shimmer-sweep animate-shimmer pointer-events-none absolute inset-0 z-10" />
        )}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-xs font-medium tracking-wide text-ink3">
            L10 · 开放导出
            {exportExpired && (
              <span className="rounded-full border border-err/40 bg-err/10 px-2.5 py-0.5 font-mono text-xs font-medium text-err">
                410 GONE · 导出已过期
              </span>
            )}
          </div>
          <span className="text-xs text-ink3">zip 保留 30 天 · 过期返回 410 可重新生成</span>
        </div>

        {/* ExportTree */}
        <div className={cn('rounded-md border border-line bg-raised p-2 transition-opacity', exportExpired && 'opacity-50')}>
          <TreeRow node={EXPORT_TREE} depth={0} onPreview={setPreview} disabled={exportExpired} />
        </div>

        {/* 操作行 */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {exportExpired ? (
            <Button type="button" disabled={exportRegen} className="bg-err/90 text-white hover:bg-err" onClick={onRegenerateExport}>
              <RotateCcw className={cn('size-4', exportRegen && 'animate-spin')} />
              {exportRegen ? '重新生成中…' : '重新生成导出'}
            </Button>
          ) : (
            <>
              {exportHref ? (
                <Button asChild className="bg-brand text-white hover:bg-brand-strong">
                  <a href={exportHref} download>
                    <Download className="size-4" />
                    下载导出 zip
                  </a>
                </Button>
              ) : (
                <Button
                  type="button"
                  className="bg-brand text-white hover:bg-brand-strong"
                  onClick={() => toast.success('已开始下载（模拟）')}
                >
                  <Download className="size-4" />
                  下载导出 zip
                </Button>
              )}
              <span className="font-mono text-xs text-ink3">{exportExpiryLabel ?? '生成于 2025-08-12 · 剩余 18 天'}</span>
              <Button type="button" variant="outline" className="border-line bg-raised text-ink2 hover:text-ink" onClick={onRegenerateExport} disabled={exportRegen}>
                <RotateCcw className={cn('size-3.5', exportRegen && 'animate-spin')} />
                重新生成导出
              </Button>
            </>
          )}
        </div>

        {/* 差异化说明条 */}
        <div className="mt-4 rounded-md border-l-[3px] border-byok bg-byok/5 px-3 py-2.5 text-[13px] text-ink2">
          素材与工程文件全量带走 · 可导入任意剪辑工具 · <span className="font-mono text-xs">storyboard.json</span> 可再导入本平台继续改
        </div>
      </section>

      {/* 预览 Dialog */}
      <Dialog open={preview !== null} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-2xl border-line bg-raised">
          <DialogTitle className="font-mono text-sm text-ink">{preview?.name}</DialogTitle>
          {preview?.kind === 'image' && (
            <div className="mt-2 flex justify-center overflow-hidden rounded-lg border border-line bg-canvas">
              <img src={preview.previewSrc} alt={preview.name} className="max-h-[60vh] object-contain" />
            </div>
          )}
          {preview?.kind === 'video' && (
            <div className="mt-2 flex justify-center overflow-hidden rounded-lg border border-line bg-canvas">
              {preview.previewSrc?.startsWith('http')
                ? <video src={preview.previewSrc} controls className="max-h-[60vh] object-contain" />
                : <img src={preview.previewSrc} alt={preview.name} className="animate-kenburns max-h-[60vh] object-contain" />}
            </div>
          )}
          {preview?.kind === 'audio' && (
            <div className="mt-4">
              <WaveformPlayer duration="0:03.8" />
            </div>
          )}
          {isCode && (
            <pre className="mt-2 max-h-[50vh] overflow-auto rounded-lg border border-line bg-canvas p-4 font-mono text-xs leading-5 text-ink2">
{preview.kind === 'json'
  ? `{
  "task_id": "T-1042",
  "shots": 8,
  "aspect": "9:16",
  "duration_s": 30,
  "shots_detail": [ { "index": 1, "title": "Cold open · beans", "duration": "4s", "..." : "…" } ]
}`
  : preview.kind === 'md'
    ? `# Aurora Brew 冷萃咖啡 · 30s 产品广告\n\nSome mornings deserve more than ordinary coffee.\n\nMeet Aurora Brew — cold brew, crafted to travel…`
    : preview.kind === 'srt'
      ? `1\n00:00:00,200 --> 00:00:03,800\nSome mornings deserve more\n\n2\n00:00:04,000 --> 00:00:07,500\nMeet Aurora Brew`
      : `LICENSE / 所有权声明\n\n本导出包含的全部素材与成片所有权归任务创建者所有。\nAll assets and the final cut in this export are owned by the task creator.`}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
