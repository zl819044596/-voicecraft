import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, Loader2, Pencil, Plus, ShieldAlert, Star, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import ConfirmDelete from '@/components/library/ConfirmDelete'
import LibraryDrawer, { Field } from '@/components/library/LibraryDrawer'
import { PRESET_PROMPTS, PROMPT_TYPES, nextId, nowStamp } from '@/components/library/data'
import type { PromptItem, PromptType } from '@/components/library/data'
import { del, post, put } from '@/lib/api'
import { useDemo } from '@/lib/demo'
import { useApiList } from '@/lib/use-api-data'
import type { Prompt as ApiPrompt } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface PromptForm {
  name: string
  type: PromptType
  tags: string[]
  tagInput: string
  content: string
  isDefault: boolean
  enabled: boolean
}

const EMPTY_FORM: PromptForm = {
  name: '',
  type: 'copy',
  tags: [],
  tagInput: '',
  content: '',
  isDefault: false,
  enabled: true,
}

/* ---------- real 数据映射 ---------- */

/** 前端 PromptType → 后端 prompts.type 枚举（prompts 表 type CHECK，见 api/src/routes/prompts.ts） */
const PROMPT_TYPE_TO_API: Record<PromptType, string> = {
  product: 'product_parse',
  benchmark: 'benchmark_analysis',
  copy: 'script',
  title: 'title',
  style: 'style',
  video: 'video_style',
  storyboard: 'storyboard',
  compliance: 'compliance',
}

const API_TYPE_TO_PROMPT: Record<string, PromptType> = {
  product_parse: 'product',
  benchmark_analysis: 'benchmark',
  script: 'copy',
  title: 'title',
  style: 'style',
  storyboard: 'storyboard',
  compliance: 'compliance',
  video_style: 'video',
  // 兼容后端既存中文类型（L2 文案曾用 type='文案模板'）
  商品解析: 'product',
  对标分析: 'benchmark',
  文案模板: 'copy',
  标题生成: 'title',
  画面风格: 'style',
  视频风格: 'video',
  分镜拆解: 'storyboard',
  合规规则: 'compliance',
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 后端 Prompt → 页面渲染型；locked = 系统默认模板（user_id 为空）只读，不可修改/删除 */
function mapApiPrompt(p: ApiPrompt): PromptItem {
  return {
    id: p.id,
    type: API_TYPE_TO_PROMPT[p.type] ?? 'copy',
    name: p.name,
    tags: p.tags,
    content: p.body,
    isDefault: p.is_default,
    enabled: p.enabled,
    updatedAt: fmtDateTime(p.created_at),
    locked: !p.user_id,
  }
}

export default function Templates() {
  const { mode } = useDemo()
  const real = mode === 'real'
  const list = useApiList<ApiPrompt>('/prompts', { size: 100 })
  const [prompts, setPrompts] = useState<PromptItem[]>(PRESET_PROMPTS)
  const [tab, setTab] = useState<PromptType>('copy')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PromptForm>(EMPTY_FORM)
  const [deleting, setDeleting] = useState<PromptItem | null>(null)

  // real 模式数据源来自 API（一次拉全量，tab 分组/计数在客户端完成）
  const shownPrompts: PromptItem[] = real ? (list.items ?? []).map(mapApiPrompt) : prompts

  const counts = useMemo(() => {
    const m = new Map<PromptType, number>()
    for (const p of shownPrompts) m.set(p.type, (m.get(p.type) ?? 0) + 1)
    return m
  }, [shownPrompts])

  const rows = useMemo(() => shownPrompts.filter((p) => p.type === tab), [shownPrompts, tab])

  const openCreate = (type?: PromptType) => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, type: type ?? tab })
    setDrawerOpen(true)
  }

  const openEdit = (p: PromptItem) => {
    setEditingId(p.id)
    setForm({ name: p.name, type: p.type, tags: p.tags, tagInput: '', content: p.content, isDefault: p.isDefault, enabled: p.enabled })
    setDrawerOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('请填写模板名称')
      return
    }
    if (!form.content.trim()) {
      toast.error('请填写模板内容')
      return
    }
    if (real) {
      const payload = {
        type: PROMPT_TYPE_TO_API[form.type],
        name: form.name.trim(),
        scenario: null,
        body: form.content.trim(),
        tags: form.tags,
        enabled: form.enabled,
        is_default: form.isDefault,
      }
      try {
        if (editingId) {
          await put(`/prompts?id=${editingId}`, payload)
        } else {
          await post('/prompts', payload)
        }
        setDrawerOpen(false)
        setTab(form.type)
        toast.success(`已保存「${form.name.trim()}」· 任务创建时可引用`)
        list.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败')
      }
      return
    }
    setPrompts((prev) => {
      let next = prev.map((p) =>
        form.isDefault && p.type === form.type ? { ...p, isDefault: false } : p,
      )
      if (editingId) {
        next = next.map((p) =>
          p.id === editingId
            ? { ...p, name: form.name.trim(), type: form.type, tags: form.tags, content: form.content, isDefault: form.isDefault, enabled: form.enabled, updatedAt: nowStamp() }
            : p,
        )
      } else {
        next = [
          {
            id: nextId('prompt'),
            name: form.name.trim(),
            type: form.type,
            tags: form.tags,
            content: form.content,
            isDefault: form.isDefault,
            enabled: form.enabled,
            updatedAt: nowStamp(),
          },
          ...next,
        ]
      }
      return next
    })
    setDrawerOpen(false)
    setTab(form.type)
    toast.success('已保存 · 任务创建时可引用')
  }

  const setDefault = async (target: PromptItem) => {
    if (target.isDefault) {
      toast.info(`「${target.name}」已是该类型默认`)
      return
    }
    if (real) {
      try {
        await put(`/prompts?id=${target.id}`, { is_default: true })
        toast.success(`已将「${target.name}」设为默认 · 原默认已自动取消`)
        list.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '设为默认失败')
      }
      return
    }
    setPrompts((prev) =>
      prev.map((p) => (p.type === target.type ? { ...p, isDefault: p.id === target.id } : p)),
    )
    toast.success(`已将「${target.name}」设为默认 · 原默认已自动取消`)
  }

  const toggleEnabled = async (target: PromptItem, enabled: boolean) => {
    if (real) {
      try {
        await put(`/prompts?id=${target.id}`, { enabled })
        toast.success(enabled ? `已启用「${target.name}」` : `已停用「${target.name}」· 任务中不再可选`)
        list.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '切换状态失败')
      }
      return
    }
    setPrompts((prev) => prev.map((p) => (p.id === target.id ? { ...p, enabled } : p)))
    toast.success(enabled ? `已启用「${target.name}」` : `已停用「${target.name}」· 任务中不再可选`)
  }

  const duplicate = async (p: PromptItem) => {
    if (real) {
      try {
        await post('/prompts', {
          type: PROMPT_TYPE_TO_API[p.type],
          name: `${p.name}（副本）`,
          scenario: null,
          body: p.content,
          tags: p.tags,
          enabled: p.enabled,
          is_default: false,
        })
        toast.success(`已复制为「${p.name}（副本）」`)
        list.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '复制失败')
      }
      return
    }
    setPrompts((prev) => {
      const i = prev.findIndex((x) => x.id === p.id)
      const copy: PromptItem = { ...p, id: nextId('prompt'), name: `${p.name}（副本）`, isDefault: false, updatedAt: nowStamp() }
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)]
    })
    toast.success(`已复制为「${p.name}（副本）」`)
  }

  /** 采纳系统默认：复制为个人默认（is_default=true，原个人默认自动取消）——"我选哪个就默认调哪个"。 */
  const adoptDefault = async (p: PromptItem) => {
    if (!real) return
    try {
      await post('/prompts', {
        type: PROMPT_TYPE_TO_API[p.type],
        name: `${p.name}（我的默认）`,
        scenario: null,
        body: p.content,
        tags: p.tags,
        enabled: true,
        is_default: true,
      })
      toast.success(`已将「${p.name}」设为我的默认 · 后续任务自动使用`)
      list.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '设为默认失败')
    }
  }

  const addTag = () => {
    const t = form.tagInput.trim()
    if (!t) return
    if (form.tags.includes(t)) {
      toast.info('标签已存在')
      return
    }
    if (form.tags.length >= 3) {
      toast.info('最多 3 个标签')
      return
    }
    setForm((f) => ({ ...f, tags: [...f.tags, t], tagInput: '' }))
  }

  return (
    <div>
      <PageHeader
        title="模板中心"
        description="沉淀你的最佳实践 · 任务可引用模板或自定义提示词（自定义优先级更高）"
        actions={
          <Button className="bg-brand text-white hover:bg-brand-strong" onClick={() => openCreate()}>
            <Plus className="size-4" /> 新建模板
          </Button>
        }
      />

      {/* 类型 Tabs（7 个，横向可滚动） */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {PROMPT_TYPES.map((t) => {
          const active = tab === t.id
          const count = counts.get(t.id) ?? 0
          const tabBtn = (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors',
                active ? 'text-ink' : 'text-ink3 hover:text-ink2',
              )}
            >
              {t.id === 'compliance' && <ShieldAlert className="size-3.5 text-managed" />}
              {t.label}
              <motion.span
                key={count}
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                className="rounded-full bg-press px-1.5 py-0.5 font-mono text-[11px] leading-none text-ink2"
              >
                {count}
              </motion.span>
              {active && (
                <motion.span
                  layoutId="prompt-tab-underline"
                  className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand"
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
          )
          return t.id === 'compliance' ? (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>{tabBtn}</TooltipTrigger>
              <TooltipContent className="border-line bg-press text-ink2">被托管档 L1.5 合规预审调用</TooltipContent>
            </Tooltip>
          ) : (
            tabBtn
          )
        })}
      </div>

      {/* 合规规则联动说明 */}
      {tab === 'compliance' && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-2 rounded-md border border-managed/30 bg-managed/5 px-3 py-2 text-[13px] text-ink2"
        >
          <ShieldAlert className="size-4 shrink-0 text-managed" />
          该类型的默认提示词会被<span className="text-managed">托管档 L1.5 合规预审</span>调用；BYOK
          档该步显示为 <span className="font-mono text-dimmed">skipped · BYOK 不执行预审</span>。
        </motion.div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2 }}
        >
          {real && list.loading && !list.items ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="size-6 animate-spin text-ink3" />
            </div>
          ) : real && list.error ? (
            <div className="rounded-md border border-err/40 bg-err/10 px-4 py-3 text-sm text-err">
              加载失败：{list.error}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="该类型还没有模板"
              description="沉淀一条最佳实践，任务创建时即可引用"
              actionLabel="＋ 新建模板"
              onAction={() => openCreate(tab)}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[860px] text-left">
                <thead>
                  <tr className="border-b border-line text-xs font-medium text-ink3">
                    <th className="px-4 py-2.5">名称</th>
                    <th className="px-4 py-2.5">标签</th>
                    <th className="px-4 py-2.5">内容预览</th>
                    <th className="px-4 py-2.5">默认</th>
                    <th className="px-4 py-2.5">启用</th>
                    <th className="px-4 py-2.5">更新时间</th>
                    <th className="px-4 py-2.5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {rows.map((p, i) => (
                      <motion.tr
                        key={p.id}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.26, delay: i * 0.04 }}
                        className={cn('border-b border-line last:border-0', !p.enabled && 'opacity-50')}
                      >
                        <td className="px-4 py-3 text-sm font-medium whitespace-nowrap text-ink">
                          {p.name}
                          {p.locked && (
                            <span className="ml-2 rounded bg-managed/10 px-1.5 py-0.5 font-mono text-[10px] text-managed">系统默认</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {p.tags.length === 0 && <span className="text-xs text-ink3">—</span>}
                            {p.tags.map((t) => (
                              <span key={t} className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-strong">
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="max-w-[320px] px-4 py-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="line-clamp-2 cursor-default font-mono text-xs leading-5 text-ink2">
                                {p.content}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-md border-line bg-press text-xs whitespace-pre-wrap text-ink2">
                              {p.content.slice(0, 500)}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-4 py-3">
                          {p.locked ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => adoptDefault(p)}
                                  title="设为我的默认（复制一份作为个人默认）"
                                  className="cursor-pointer rounded p-1 transition hover:bg-press"
                                >
                                  <Star className="size-4 text-ink3/40 hover:text-brand" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="border-line bg-press text-ink2">
                                设为我的默认（复制为个人模板，可再编辑）
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDefault(p)}
                              title={p.isDefault ? '当前默认' : '设为默认'}
                              className="rounded p-1 transition hover:bg-press"
                            >
                              <Star
                                className={cn(
                                  'size-4',
                                  p.isDefault ? 'fill-brand text-brand' : 'text-ink3 hover:text-ink2',
                                )}
                              />
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {p.locked ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-not-allowed">
                                  <Switch checked={p.enabled} disabled className="opacity-50" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="border-line bg-press text-ink2">系统默认模板不可修改</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Switch checked={p.enabled} onCheckedChange={(v) => toggleEnabled(p, v)} />
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-ink3">{p.updatedAt}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {p.locked ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="rounded p-1.5 text-ink3/40">
                                    <Pencil className="size-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="border-line bg-press text-ink2">
                                  系统默认模板不可修改
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openEdit(p)}
                                title="编辑"
                                className="rounded p-1.5 text-ink3 transition hover:bg-press hover:text-ink"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => duplicate(p)}
                              title="复制"
                              className="rounded p-1.5 text-ink3 transition hover:bg-press hover:text-ink"
                            >
                              <Copy className="size-3.5" />
                            </button>
                            {p.locked ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="rounded p-1.5 text-ink3/40">
                                    <Trash2 className="size-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="border-line bg-press text-ink2">
                                  系统默认模板不可删除
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleting(p)}
                                title="删除"
                                className="rounded p-1.5 text-ink3 transition hover:bg-err/10 hover:text-err"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* 新建/编辑 Drawer */}
      <LibraryDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editingId ? '编辑模板' : '新建模板'}
        description="保存后可在任务创建时引用"
        onSave={save}
      >
        <Field label="名称">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="如：带货口播 · 痛点三段式"
            className="border-line bg-raised text-ink"
          />
        </Field>
        <Field label="类型">
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as PromptType }))}>
            <SelectTrigger className="border-line bg-raised text-ink">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-line bg-raised">
              {PROMPT_TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="标签（回车添加，最多 3 个）">
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-raised px-2 py-1.5">
            {form.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-strong">
                {t}
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))}
                  className="hover:text-ink"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              value={form.tagInput}
              onChange={(e) => setForm((f) => ({ ...f, tagInput: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
              placeholder={form.tags.length === 0 ? '输入标签后回车' : ''}
              className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm text-ink outline-none placeholder:text-ink3"
            />
          </div>
        </Field>
        <Field label="内容">
          <div className="relative">
            <Textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="粘贴或编写提示词内容…"
              className="min-h-60 border-line bg-raised pb-7 font-mono text-[13px] leading-5 text-ink"
            />
            <span className="pointer-events-none absolute right-3 bottom-2.5 font-mono text-[11px] text-ink3">
              {form.content.length} 字
            </span>
          </div>
        </Field>
        <div className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2.5">
          <span className="text-[13px] text-ink2">设为默认（同类型至多一个）</span>
          <Switch checked={form.isDefault} onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v }))} />
        </div>
        <div className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2.5">
          <span className="text-[13px] text-ink2">启用</span>
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
        </div>
      </LibraryDrawer>

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        name={deleting?.name ?? ''}
        onConfirm={async () => {
          if (!deleting) return
          if (real) {
            try {
              await del(`/prompts?id=${deleting.id}`)
              toast.success(`已删除「${deleting.name}」`)
              setDeleting(null)
              list.reload()
            } catch (e) {
              toast.error(e instanceof Error ? e.message : '删除失败')
            }
            return
          }
          setPrompts((prev) => prev.filter((p) => p.id !== deleting.id))
          toast.success(`已删除「${deleting.name}」`)
          setDeleting(null)
        }}
      />
    </div>
  )
}

export { Templates as TemplatesPage }
