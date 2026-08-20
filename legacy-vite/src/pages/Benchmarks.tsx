import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, ExternalLink, Loader2, Pencil, Plus, ShieldCheck, Sparkles, Target, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import ConfirmDelete from '@/components/library/ConfirmDelete'
import LibraryDrawer, { Field } from '@/components/library/LibraryDrawer'
import { PRESET_BENCHMARKS, PRESET_PRODUCTS, fmtDuration, nextId } from '@/components/library/data'
import type { Benchmark, Visibility } from '@/components/library/data'
import { del, post, put } from '@/lib/api'
import { useDemo } from '@/lib/demo'
import { useApiList } from '@/lib/use-api-data'
import type { Benchmark as ApiBenchmark, Product as ApiProduct } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface BenchForm {
  account: string
  title: string
  videoUrl: string
  duration: string
  productId: string
  visibility: Visibility
  sourceText: string
}

const EMPTY_FORM: BenchForm = {
  account: '',
  title: '',
  videoUrl: '',
  duration: '',
  productId: 'none',
  visibility: 'private',
  sourceText: '',
}

const ACTIVE_PRODUCTS = PRESET_PRODUCTS.filter((p) => p.status === 'active')

/** 后端对标条目 → 页面渲染模型（后端无 thumb，占位图处理） */
function mapApiBenchmark(b: ApiBenchmark): Benchmark {
  return {
    id: b.id,
    account: b.account ?? 'unknown',
    title: b.title,
    videoUrl: b.video_url ?? '',
    duration: b.duration ?? 0,
    productId: b.product_id ?? undefined,
    sourceText: b.source_text ?? '',
    visibility: 'private',
  }
}

export default function Benchmarks() {
  const navigate = useNavigate()
  const { mode } = useDemo()
  const real = mode === 'real'
  const list = useApiList<ApiBenchmark>('/benchmarks', { size: 100 })
  const productList = useApiList<ApiProduct>('/products', { size: 100 })
  const [entries, setEntries] = useState<Benchmark[]>(PRESET_BENCHMARKS)
  const [selectedId, setSelectedId] = useState<string | null>(PRESET_BENCHMARKS[0]?.id ?? null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<BenchForm>(EMPTY_FORM)
  const [deleting, setDeleting] = useState<Benchmark | null>(null)

  // real 模式下数据源来自 API；demo 模式沿用 mock 状态
  const shownEntries = useMemo(() => (real ? (list.items ?? []).map(mapApiBenchmark) : entries), [real, list.items, entries])
  // 商品关联下拉：real 用活跃商品，demo 用 PRESET_PRODUCTS
  const activeProducts = real
    ? (productList.items ?? []).filter((p) => p.status === 'active')
    : ACTIVE_PRODUCTS

  const selected = useMemo(() => shownEntries.find((b) => b.id === selectedId) ?? null, [shownEntries, selectedId])
  const productName = (id?: string) => activeProducts.find((p) => p.id === id)?.name

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDrawerOpen(true)
  }

  const openEdit = (b: Benchmark) => {
    setEditingId(b.id)
    setForm({
      account: b.account,
      title: b.title,
      videoUrl: b.videoUrl,
      duration: String(b.duration),
      productId: b.productId ?? 'none',
      visibility: b.visibility,
      sourceText: b.sourceText,
    })
    setDrawerOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('请填写标题')
      return
    }
    const duration = Number(form.duration)
    if (!form.duration || Number.isNaN(duration) || duration <= 0) {
      toast.error('请填写有效的时长（秒）')
      return
    }
    const payload = {
      account: form.account.trim() || 'unknown',
      title: form.title.trim(),
      video_url: form.videoUrl.trim() || 'https://video.example.com/…',
      source_text: form.sourceText,
      product_id: form.productId === 'none' ? null : form.productId,
      duration,
      visibility: form.visibility,
    }
    if (real) {
      try {
        if (editingId) {
          await put(`/benchmarks?id=${editingId}`, payload)
          toast.success('对标条目已更新')
        } else {
          await post('/benchmarks', payload)
          toast.success('已手工录入对标条目')
        }
        setDrawerOpen(false)
        list.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败')
      }
      return
    }
    const base = {
      account: form.account.trim() || 'unknown',
      title: form.title.trim(),
      videoUrl: form.videoUrl.trim() || 'https://video.example.com/…',
      duration,
      productId: form.productId === 'none' ? undefined : form.productId,
      visibility: form.visibility,
      sourceText: form.sourceText,
    }
    if (editingId) {
      setEntries((prev) => prev.map((b) => (b.id === editingId ? { ...b, ...base } : b)))
      toast.success('对标条目已更新')
    } else {
      const id = nextId('bench')
      setEntries((prev) => [{ id, ...base }, ...prev])
      setSelectedId(id)
      toast.success('已手工录入对标条目')
    }
    setDrawerOpen(false)
  }

  const linkProduct = async (b: Benchmark, productId: string) => {
    const pid = productId === 'none' ? undefined : productId
    if (real) {
      try {
        await put(`/benchmarks?id=${b.id}`, { product_id: pid ?? null })
        list.reload()
        toast.success(pid ? `已关联商品「${productName(pid)}」` : '已取消商品关联')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '关联失败')
      }
      return
    }
    setEntries((prev) => prev.map((x) => (x.id === b.id ? { ...x, productId: pid } : x)))
    toast.success(pid ? `已关联商品「${productName(pid)}」` : '已取消商品关联')
  }

  const useForReference = (b: Benchmark) => {
    toast.success(`已附加对标参考「${b.title}」（演示）`)
    navigate('/app/quick')
  }

  return (
    <div>
      <PageHeader
        title="对标库"
        description="存档对标视频的文案与结构 · 生成时作为参考"
        actions={
          <Button className="bg-brand text-white hover:bg-brand-strong" onClick={openCreate}>
            <Plus className="size-4" /> 手工录入
          </Button>
        }
      />

      {/* R3 声明条（常驻） */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="mb-5 flex items-center gap-2.5 rounded-md border border-line border-l-2 border-l-byok bg-surface px-4 py-3 text-[13px] text-ink2"
      >
        <ShieldCheck className="size-4 shrink-0 text-byok" />
        <span>
          仅支持手工录入 · 平台不提供任何竞品视频抓取功能 · 请确保你拥有所录内容的使用权利
        </span>
      </motion.div>

      {real && list.loading && !list.items ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-ink3" />
        </div>
      ) : real && list.error ? (
        <EmptyState title="对标库加载失败" description={list.error} />
      ) : shownEntries.length === 0 ? (
        <EmptyState
          title="还没有对标条目"
          description="手工录入第一条对标，沉淀你的参考库"
          actionLabel="＋ 手工录入"
          onAction={openCreate}
        />
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row">
          {/* 左栏：条目列表 55% */}
          <div className="flex flex-col gap-2.5 lg:w-[55%]">
            {shownEntries.map((b, i) => {
              const isSelected = b.id === selectedId
              const pname = productName(b.productId)
              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, delay: i * 0.04 }}
                  onClick={() => setSelectedId(b.id)}
                  className={cn(
                    'group relative flex cursor-pointer items-center gap-3 rounded-[10px] border border-line bg-surface p-3.5 transition-colors',
                    isSelected ? 'bg-brand-soft/60' : 'hover:border-linestrong',
                  )}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="bench-selected"
                      className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand"
                      transition={{ duration: 0.25 }}
                    />
                  )}
                  {/* 9:16 缩略图 */}
                  <div className="h-[100px] w-14 shrink-0 overflow-hidden rounded-md">
                    {b.thumb ? (
                      <img src={b.thumb} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-press">
                        <Target className="size-5 text-ink3" />
                      </div>
                    )}
                  </div>
                  {/* 中间信息 */}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-ink">{b.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-[13px] text-ink3">
                      <span>@{b.account}</span>
                      <span className="font-mono text-xs">{fmtDuration(b.duration)}</span>
                    </div>
                    {pname && (
                      <span className="mt-1.5 inline-block rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-strong">
                        {pname}
                      </span>
                    )}
                  </div>
                  {/* hover 操作 */}
                  <div className="flex items-center gap-1">
                    <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        title="编辑"
                        onClick={(e) => {
                          e.stopPropagation()
                          openEdit(b)
                        }}
                        className="rounded p-1.5 text-ink3 transition hover:bg-press hover:text-ink"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="删除"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleting(b)
                        }}
                        className="rounded p-1.5 text-ink3 transition hover:bg-err/10 hover:text-err"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <ChevronRight className={cn('size-4 transition', isSelected ? 'text-brand-strong' : 'text-ink3')} />
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* 右栏：详情预览 45%（sticky） */}
          <div className="lg:w-[45%]">
            <div className="lg:sticky lg:top-20">
              <AnimatePresence mode="wait" initial={false}>
                {selected ? (
                  <motion.div
                    key={selected.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="rounded-[10px] border border-line bg-surface p-4"
                  >
                    <div className="mx-auto mb-3 max-h-[220px] w-[124px] overflow-hidden rounded-md">
                      {selected.thumb ? (
                        <img src={selected.thumb} alt="" className="aspect-[9/16] w-full object-cover" />
                      ) : (
                        <div className="flex aspect-[9/16] w-full items-center justify-center bg-press">
                          <Target className="size-7 text-ink3" />
                        </div>
                      )}
                    </div>
                    <h3 className="text-center text-[15px] font-semibold text-ink">{selected.title}</h3>
                    <p className="mt-1 text-center text-[13px] text-ink3">
                      @{selected.account} · <span className="font-mono">{fmtDuration(selected.duration)}</span>
                    </p>

                    {/* 视频链接（仅存档展示，不打开外链） */}
                    <div className="mt-4 flex items-center gap-2 rounded-md border border-line bg-raised px-3 py-2">
                      <span className="shrink-0 text-xs text-ink3">视频链接</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink2">{selected.videoUrl}</span>
                      <button
                        type="button"
                        title="打开外链"
                        onClick={() => toast.info('原型中不打开外链')}
                        className="shrink-0 rounded p-1 text-ink3 transition hover:text-ink"
                      >
                        <ExternalLink className="size-3.5" />
                      </button>
                    </div>

                    {/* source_text */}
                    <p className="mt-4 mb-1.5 text-xs font-medium text-ink3">source_text 文案/结构</p>
                    <div className="max-h-60 overflow-y-auto rounded-md bg-raised p-3">
                      <pre className="font-mono text-[13px] leading-5 whitespace-pre-wrap text-ink2">
                        {selected.sourceText || '（暂无内容）'}
                      </pre>
                    </div>

                    {/* 底部操作 */}
                    <div className="mt-4 flex items-center gap-2 border-t border-line pt-3.5">
                      <Select value={selected.productId ?? 'none'} onValueChange={(v) => linkProduct(selected, v)}>
                        <SelectTrigger className="w-44 border-line bg-raised text-[13px] text-ink2">
                          <SelectValue placeholder="关联商品" />
                        </SelectTrigger>
                        <SelectContent className="border-line bg-raised">
                          <SelectItem value="none">无关联商品</SelectItem>
                          {activeProducts.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        className="ml-auto bg-brand text-white hover:bg-brand-strong"
                        onClick={() => useForReference(selected)}
                      >
                        <Sparkles className="size-4" /> 用于生成参考 →
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-[10px] border border-dashed border-line bg-surface p-10 text-center text-[13px] text-ink3"
                  >
                    选择左侧条目查看详情
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* 新建/编辑 Drawer */}
      <LibraryDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editingId ? '编辑对标条目' : '手工录入对标'}
        onSave={save}
      >
        <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink3">
          <ShieldCheck className="size-3.5 text-byok" />
          手工录入 · 平台不抓取 · video_url 仅作存档展示
        </div>
        <Field label="账号 account">
          <Input
            value={form.account}
            onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}
            placeholder="如：coffee.daily"
            className="border-line bg-raised text-ink"
          />
        </Field>
        <Field label="标题 title">
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="对标视频标题"
            className="border-line bg-raised text-ink"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="视频链接 video_url">
            <Input
              value={form.videoUrl}
              onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
              placeholder="https://…"
              className="border-line bg-raised font-mono text-[13px] text-ink"
            />
          </Field>
          <Field label="时长 duration（秒）">
            <Input
              type="number"
              min="1"
              value={form.duration}
              onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
              placeholder="32"
              className="border-line bg-raised font-mono text-ink"
            />
          </Field>
        </div>
        <Field label="关联商品">
          <Select value={form.productId} onValueChange={(v) => setForm((f) => ({ ...f, productId: v }))}>
            <SelectTrigger className="border-line bg-raised text-ink">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-line bg-raised">
              <SelectItem value="none">无</SelectItem>
              {activeProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="可见性">
          <div className="flex rounded-md border border-line bg-surface p-0.5 text-[13px]">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, visibility: 'private' }))}
              className={cn(
                'rounded px-3 py-1.5 transition-colors',
                form.visibility === 'private' ? 'bg-press text-ink' : 'text-ink3 hover:text-ink',
              )}
            >
              私有
            </button>
            <button type="button" disabled title="团队空间将在后续版本开放" className="cursor-not-allowed rounded px-3 py-1.5 text-ink3/50">
              团队 · 预留
            </button>
          </div>
        </Field>
        <Field label="文案/结构 source_text" hint="手工粘贴对标文案或结构笔记">
          <Textarea
            value={form.sourceText}
            onChange={(e) => setForm((f) => ({ ...f, sourceText: e.target.value }))}
            placeholder="粘贴口播稿、结构笔记…"
            className="min-h-[220px] border-line bg-raised font-mono text-[13px] leading-5 text-ink"
          />
        </Field>
      </LibraryDrawer>

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        name={deleting?.title ?? ''}
        onConfirm={async () => {
          if (!deleting) return
          if (real) {
            try {
              await del(`/benchmarks?id=${deleting.id}`)
              if (selectedId === deleting.id) setSelectedId(null)
              toast.success(`已删除对标条目「${deleting.title}」`)
              setDeleting(null)
              list.reload()
            } catch (e) {
              toast.error(e instanceof Error ? e.message : '删除失败')
            }
            return
          }
          setEntries((prev) => prev.filter((b) => b.id !== deleting.id))
          if (selectedId === deleting.id) setSelectedId(null)
          toast.success(`已删除对标条目「${deleting.title}」`)
          setDeleting(null)
        }}
      />
    </div>
  )
}

export { Benchmarks as BenchmarksPage }
