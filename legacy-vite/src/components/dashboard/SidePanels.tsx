import { useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import {
  Cable,
  ChevronRight,
  FolderOpen,
  Gem,
  Package,
  Plus,
  ScrollText,
  Target,
  Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useDemo } from '@/lib/demo'
import { post } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Project {
  id: string
  name: string
  color: string
  tasks: number
  updated: string
}

const INITIAL_PROJECTS: Project[] = [
  { id: 'p1', name: 'Aurora Brew 投放', color: '#7C5CFF', tasks: 3, updated: '2h 前' },
  { id: 'p2', name: 'Lumen 新品季', color: '#2DD4BF', tasks: 2, updated: '昨天' },
  { id: 'p3', name: '频道周更栏目', color: '#38BDF8', tasks: 4, updated: '2 天前' },
  { id: 'p4', name: '客户交付合集', color: '#FBBF24', tasks: 5, updated: '3 天前' },
]

/** real 项目（GET /api/projects）与资料库计数（各列表 total 聚合）。 */
export interface SidePanelsData {
  projects: { id: string; title: string; task_count: number; updated_at: string }[]
  counts: { prompts: number; products: number; benchmarks: number; assets: number; models: number }
}

const LIB_KEYS = ['prompts', 'products', 'benchmarks', 'assets'] as const

const LIB_LINKS: { icon: LucideIcon; label: string; to: string; key: (typeof LIB_KEYS)[number] }[] = [
  { icon: ScrollText, label: '模板', to: '/app/templates', key: 'prompts' },
  { icon: Package, label: '商品库', to: '/app/products', key: 'products' },
  { icon: Target, label: '对标库', to: '/app/benchmarks', key: 'benchmarks' },
  { icon: FolderOpen, label: '素材', to: '/app/assets', key: 'assets' },
]

/** 右栏：项目列表卡 + 资料库计数卡（dashboard.md §5）；real 模式由父级注入数据 */
export function SidePanels({ data, onCreated }: { data?: SidePanelsData; onCreated?: () => void }) {
  const { mode } = useDemo()
  const real = mode === 'real'
  const [projects, setProjects] = useState(INITIAL_PROJECTS)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')

  const realProjects: Project[] = (data?.projects ?? []).map((p, i) => ({
    id: p.id,
    name: p.title,
    color: ['#7C5CFF', '#2DD4BF', '#38BDF8', '#FBBF24'][i % 4],
    tasks: p.task_count,
    updated: p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '—',
  }))
  const shownProjects = real ? realProjects : projects

  const createProject = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('请输入项目名称')
      return
    }
    if (real) {
      try {
        await post('/projects', { title: trimmed, source_type: 'text' })
        toast.success(`项目「${trimmed}」已创建`)
        setDialogOpen(false)
        setName('')
        onCreated?.()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '创建项目失败')
      }
      return
    }
    setProjects((prev) => [
      { id: `p${Date.now()}`, name: trimmed, color: '#E879F9', tasks: 0, updated: '刚刚' },
      ...prev,
    ])
    setDialogOpen(false)
    setName('')
    toast.success(`项目「${trimmed}」已创建（mock）`)
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* 项目列表卡 */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.3 }}
        className="rounded-lg border border-line bg-surface p-4"
      >
        <h3 className="mb-2 px-1 text-[15px] leading-[22px] font-semibold text-ink">项目</h3>
        <div className="flex flex-col">
          {shownProjects.slice(0, 4).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => toast.info(`项目「${p.name}」为演示锚点 · 项目详情不在本原型范围内`)}
              className="flex items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-raised"
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{p.name}</span>
                <span className="block text-xs text-ink3">
                  {p.tasks} 任务 · 更新于 {p.updated}
                </span>
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-ink3" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-line px-2 py-2 text-[13px] text-ink2 transition-colors hover:border-linestrong hover:text-ink"
        >
          <Plus className="size-3.5" /> 新建项目
        </button>
      </motion.section>

      {/* 资料库计数卡 */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.3 }}
        className="rounded-lg border border-line bg-surface p-4"
      >
        <h3 className="mb-2 px-1 text-[15px] leading-[22px] font-semibold text-ink">资料库</h3>
        <div className="flex flex-col">
          {LIB_LINKS.map((l) => {
            const count = real ? (data?.counts[l.key] ?? 0) : 0
            return (
              <Link
                key={l.to}
                to={l.to}
                className="flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-raised"
              >
                <l.icon className="size-4 shrink-0 text-ink3" />
                <span className="flex-1 text-sm text-ink2">{l.label}</span>
                <span className="font-mono text-[13px] text-ink">{count}</span>
                <ChevronRight className="size-3.5 text-ink3" />
              </Link>
            )
          })}
          <Link to="/app/models" className="flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-raised">
            <Cable className="size-4 shrink-0 text-ink3" />
            <span className="flex-1 text-sm text-ink2">模型通道</span>
            <ModelsCount count={real ? (data?.counts.models ?? 0) : undefined} />
            <ChevronRight className="size-3.5 text-ink3" />
          </Link>
        </div>
      </motion.section>

      {/* 新建项目 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-line bg-raised">
          <DialogHeader>
            <DialogTitle className="text-ink">新建项目</DialogTitle>
            <DialogDescription className="text-ink3">项目用于把同主题任务归档在一起（前端 mock，不落库）。</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createProject()}
            placeholder="例如：Q3 新品投放"
            className="border-line bg-surface text-ink"
          />
          <DialogFooter>
            <Button variant="outline" className="border-line bg-transparent text-ink2 hover:bg-press" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button className="bg-brand text-white hover:bg-brand-strong" onClick={createProject}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ModelsCount({ count }: { count?: number }) {
  const { track, byokFullConfig, missingI2vChannel } = useDemo()
  if (count !== undefined) {
    return <span className="font-mono text-xs text-ink3">{count} 条配置</span>
  }
  const ready = track === 'byok' ? (byokFullConfig ? 4 : 3) : missingI2vChannel ? 3 : 4
  return <span className="font-mono text-xs text-ink3">4 类通道 · {ready} 已就绪</span>
}

/** 底部行：本月重跑用量条 + 快捷入口（dashboard.md §6） */
export function BottomRow() {
  const { track } = useDemo()
  const isByok = track === 'byok'
  const quickLinks = [
    { icon: Cable, label: '配置模型通道 →', to: '/app/models' },
    { icon: Upload, label: '上传 BGM/素材 →', to: '/app/assets' },
    { icon: Gem, label: '查看定价与购买 →', to: '/app/pricing' },
  ]
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className="flex flex-col gap-4"
    >
      {/* 重跑用量条 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-3">
        {isByok ? (
          <p className="text-[13px] text-byok">
            BYOK 档重跑不计次 · 本月已重跑 <span className="font-mono">31</span> 次 · <span className="font-mono">$0</span>
          </p>
        ) : (
          <p className="text-[13px] text-ink2">
            本月重跑：<span className="font-mono">12</span> 次 · 免费额度内 <span className="font-mono">9</span> 次 · 超额{' '}
            <span className="font-mono">3</span> 次（<span className="font-mono text-managed">−240 积分</span>）
          </p>
        )}
        {!isByok && (
          <Link to="/app/pricing" className="text-xs text-brand-strong hover:underline">
            价格与档位 →
          </Link>
        )}
      </div>

      {/* 快捷入口 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {quickLinks.map((q) => (
          <Link
            key={q.to + q.label}
            to={q.to}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink2 transition-all hover:-translate-y-0.5 hover:border-linestrong hover:text-ink"
          >
            <q.icon className="size-4 text-ink3" />
            {q.label}
          </Link>
        ))}
      </div>
    </motion.div>
  )
}
