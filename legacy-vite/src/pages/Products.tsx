import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { Link2, Loader2, MoreHorizontal, Pencil, Plus, Search, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import ConfirmDelete from '@/components/library/ConfirmDelete'
import LibraryDrawer, { Field } from '@/components/library/LibraryDrawer'
import { PRESET_PRODUCTS, PRODUCT_CATEGORIES, nextId } from '@/components/library/data'
import type { Product, ProductStatus, Visibility } from '@/components/library/data'
import { del, post, put } from '@/lib/api'
import { useDemo } from '@/lib/demo'
import { useApiList } from '@/lib/use-api-data'
import type { Product as ApiProduct } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type StatusFilter = 'all' | ProductStatus

interface ProductForm {
  name: string
  category: string
  price: string
  commission: string
  url: string
  visibility: Visibility
  active: boolean
  detail: string
}

const EMPTY_FORM: ProductForm = {
  name: '',
  category: PRODUCT_CATEGORIES[0],
  price: '',
  commission: '',
  url: '',
  visibility: 'private',
  active: true,
  detail: '',
}

const HUES = [200, 258, 174, 32, 320]

/** 后端 Product → 页面渲染型（字段名差异在此收敛） */
function mapApiProduct(p: ApiProduct): Product {
  const hue = HUES[Math.abs(p.id.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 0)) % HUES.length]
  return {
    id: p.id,
    name: p.name,
    category: p.category ?? '未分类',
    price: Number(p.price) || 0,
    commission: Number(p.commission_rate) || 0,
    url: p.product_url ?? '',
    detail: p.detail_text ?? '',
    visibility: (p.visibility === 'private' || p.visibility === 'me' ? 'private' : 'private') as Visibility,
    status: p.status,
    genCount: p.gen_count,
    hue,
  }
}

export default function Products() {
  const navigate = useNavigate()
  const { mode } = useDemo()
  const real = mode === 'real'
  const list = useApiList<ApiProduct>('/products', { size: 100 })
  const [products, setProducts] = useState<Product[]>(PRESET_PRODUCTS)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [category, setCategory] = useState('全部')
  const [query, setQuery] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)
  const [deleting, setDeleting] = useState<Product | null>(null)

  const shown = real ? (list.items ?? []).map(mapApiProduct) : products

  const filtered = useMemo(
    () =>
      shown.filter((p) => {
        if (status !== 'all' && p.status !== status) return false
        if (category !== '全部' && p.category !== category) return false
        if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [shown, status, category, query],
  )

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDrawerOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      category: p.category,
      price: String(p.price),
      commission: String(p.commission),
      url: p.url,
      visibility: p.visibility,
      active: p.status === 'active',
      detail: p.detail,
    })
    setDrawerOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('请填写商品名称')
      return
    }
    const price = Number(form.price)
    const commission = Number(form.commission)
    if (!form.price || Number.isNaN(price) || price < 0) {
      toast.error('请填写有效的价格')
      return
    }
    if (!form.commission || Number.isNaN(commission) || commission < 0 || commission > 100) {
      toast.error('请填写有效的佣金率（0-100）')
      return
    }
    if (real) {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        price: String(price),
        commission_rate: String(commission),
        product_url: form.url.trim() || null,
        detail_text: form.detail,
        visibility: 'me',
        status: form.active ? 'active' : 'inactive',
      }
      try {
        if (editingId) {
          await put(`/products?id=${editingId}`, payload)
        } else {
          await post('/products', payload)
        }
        setDrawerOpen(false)
        toast.success(`已保存商品「${form.name.trim()}」`)
        list.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败')
      }
      return
    }
    setProducts((prev) => {
      if (editingId) {
        return prev.map((p) =>
          p.id === editingId
            ? {
                ...p,
                name: form.name.trim(),
                category: form.category,
                price,
                commission,
                url: form.url.trim(),
                visibility: form.visibility,
                status: form.active ? 'active' : 'inactive',
                detail: form.detail,
              }
            : p,
        )
      }
      const hue = HUES[prev.length % HUES.length]
      return [
        {
          id: nextId('product'),
          name: form.name.trim(),
          category: form.category,
          price,
          commission,
          url: form.url.trim() || 'https://example.com/product',
          visibility: form.visibility,
          status: form.active ? ('active' as const) : ('inactive' as const),
          genCount: 0,
          detail: form.detail,
          hue,
        },
        ...prev,
      ]
    })
    setDrawerOpen(false)
    toast.success(`已保存商品「${form.name.trim()}」`)
  }

  const toggleStatus = async (p: Product) => {
    const next = p.status === 'active' ? 'inactive' : 'active'
    if (real) {
      try {
        await put(`/products?id=${p.id}`, { status: next })
        list.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '切换状态失败')
        return
      }
    } else {
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: next } : x)))
    }
    toast.success(
      next === 'active' ? `已启用「${p.name}」· 重新出现在 AI 创作选品列表` : `已停用「${p.name}」· 不再出现在选品列表`,
    )
  }

  const useForCreation = (p: Product) => {
    toast.success(`已预选商品「${p.name}」· 跳转快速生成（演示）`)
    navigate(`/app/quick?product=${p.id}`)
  }

  return (
    <div>
      <PageHeader
        title="商品库"
        description="维护商品资料 · 生成时选品，让 AI 围绕商品写文案"
        actions={
          <Button className="bg-brand text-white hover:bg-brand-strong" onClick={openCreate}>
            <Plus className="size-4" /> 新建商品
          </Button>
        }
      />

      {/* 筛选行 */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-line bg-surface p-0.5 text-[13px]">
          {(
            [
              ['all', '全部'],
              ['active', 'active'],
              ['inactive', 'inactive'],
            ] as [StatusFilter, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatus(v)}
              className={cn(
                'rounded px-3 py-1.5 font-mono transition-colors',
                status === v ? 'bg-press text-ink' : 'text-ink3 hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-36 border-line bg-surface text-ink2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-line bg-raised">
            {['全部', ...PRODUCT_CATEGORIES].map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative min-w-52 flex-1 sm:max-w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索商品名称…"
            className="border-line bg-surface pl-9 text-ink"
          />
        </div>
        <span className="ml-auto font-mono text-xs text-ink3">{filtered.length} 个商品</span>
      </div>

      {/* 卡片网格 */}
      {real && list.loading && !list.items ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-ink3" />
        </div>
      ) : real && list.error ? (
        <div className="rounded-md border border-err/40 bg-err/10 px-4 py-3 text-sm text-err">
          加载失败：{list.error}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="还没有商品"
          description="录入第一个商品，让 AI 围绕它写文案"
          actionLabel="＋ 新建商品"
          onAction={openCreate}
        />
      ) : (
        <motion.div layout className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.map((p, i) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                transition={{ duration: 0.24, delay: i * 0.05 }}
                whileHover={{ y: -3 }}
                className="group flex flex-col overflow-hidden rounded-[10px] border border-line bg-surface transition-[border-color,box-shadow] duration-200 hover:border-linestrong hover:shadow-card"
              >
                {/* 1:1 产品图 / 首字母色块占位 */}
                <div className="relative aspect-square overflow-hidden bg-raised">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className={cn(
                        'size-full object-cover transition duration-200 group-hover:scale-[1.03]',
                        p.status === 'inactive' && 'opacity-50 grayscale',
                      )}
                    />
                  ) : (
                    <div
                      className={cn(
                        'flex size-full items-center justify-center',
                        p.status === 'inactive' && 'opacity-50 grayscale',
                      )}
                      style={{
                        background: `linear-gradient(135deg, hsl(${p.hue ?? 258} 45% 14%), hsl(${(p.hue ?? 258) + 40} 40% 9%))`,
                        boxShadow: `inset 0 0 0 1px hsl(${p.hue ?? 258} 60% 40% / .35)`,
                      }}
                    >
                      <span
                        className="font-display text-6xl font-semibold"
                        style={{ color: `hsl(${p.hue ?? 258} 70% 65%)` }}
                      >
                        {p.name.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>

                {/* 卡体 */}
                <div className="flex flex-1 flex-col gap-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[15px] leading-snug font-semibold text-ink">{p.name}</h3>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 font-mono text-xs"
                      style={
                        p.status === 'active'
                          ? { color: 'var(--ok)', background: 'rgba(52,211,153,.12)' }
                          : { color: 'var(--dim)', background: 'rgba(139,139,158,.12)' }
                      }
                    >
                      {p.status}
                    </span>
                  </div>
                  <div>
                    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-strong">{p.category}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 font-mono text-xs text-ink2">
                    <span>
                      价格 <span className="text-ink">${p.price.toFixed(1)}</span>
                    </span>
                    <span>
                      佣金 <span className="text-ink">{p.commission}%</span>
                    </span>
                    <span className="col-span-2" title="任务完成后 gen_count +1">
                      已生成 <span className="font-semibold text-brand-strong">{p.genCount} 条</span>
                    </span>
                  </div>
                </div>

                {/* 操作行 */}
                <div className="flex items-center gap-1 border-t border-line px-3 py-2">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="flex items-center gap-1 rounded px-2 py-1.5 text-[13px] text-ink2 transition hover:bg-press hover:text-ink"
                  >
                    <Pencil className="size-3.5" /> 编辑
                  </button>
                  {p.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => useForCreation(p)}
                      className="flex items-center gap-1 rounded px-2 py-1.5 text-[13px] font-medium text-brand-strong transition hover:bg-brand-soft"
                    >
                      <Sparkles className="size-3.5" /> 用于 AI 创作 →
                    </button>
                  ) : (
                    <span className="px-2 py-1.5 text-[13px] text-ink3" title="inactive 商品不出现在选品列表">
                      已停用 · 不在选品列表
                    </span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="ml-auto rounded p-1.5 text-ink3 transition hover:bg-press hover:text-ink"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 border-line bg-raised">
                      <DropdownMenuItem className="cursor-pointer" onClick={() => toggleStatus(p)}>
                        {p.status === 'active' ? '停用' : '启用'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer text-err focus:text-err"
                        onClick={() => setDeleting(p)}
                      >
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* 新建/编辑 Drawer */}
      <LibraryDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editingId ? '编辑商品' : '新建商品'}
        description="商品资料会在 AI 创作时注入文案生成"
        onSave={save}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="名称" className="col-span-2">
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="如：Aurora Brew 便携冷萃瓶"
              className="border-line bg-raised text-ink"
            />
          </Field>
          <Field label="分类">
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger className="border-line bg-raised text-ink">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-line bg-raised">
                {PRODUCT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="价格 $">
            <Input
              type="number"
              min="0"
              step="0.1"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              placeholder="29.9"
              className="border-line bg-raised font-mono text-ink"
            />
          </Field>
          <Field label="佣金率 %">
            <Input
              type="number"
              min="0"
              max="100"
              value={form.commission}
              onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value }))}
              placeholder="12"
              className="border-line bg-raised font-mono text-ink"
            />
          </Field>
          <Field label="商品链接 product_url">
            <div className="relative">
              <Link2 className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink3" />
              <Input
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://…"
                className="border-line bg-raised pl-9 font-mono text-[13px] text-ink"
              />
            </div>
          </Field>
        </div>
        <Field label="可见性 visibility">
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
            <button
              type="button"
              disabled
              title="团队空间将在后续版本开放"
              className="cursor-not-allowed rounded px-3 py-1.5 text-ink3/50"
            >
              团队 · 预留
            </button>
          </div>
        </Field>
        <div className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2.5">
          <span className="text-[13px] text-ink2">状态（active 时出现在 AI 创作选品列表）</span>
          <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
        </div>
        <Field label="详情 detail_text" hint="AI 创作时将作为商品资料注入">
          <Textarea
            value={form.detail}
            onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
            placeholder="材质、规格、卖点、适用场景…"
            className="min-h-28 border-line bg-raised text-ink"
          />
        </Field>
      </LibraryDrawer>

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        name={deleting?.name ?? ''}
        onConfirm={async () => {
          if (!deleting) return
          if (real) {
            try {
              await del(`/products?id=${deleting.id}`)
              toast.success(`已删除商品「${deleting.name}」`)
              list.reload()
            } catch (e) {
              toast.error(e instanceof Error ? e.message : '删除失败')
              setDeleting(null)
              return
            }
          } else {
            setProducts((prev) => prev.filter((p) => p.id !== deleting.id))
            toast.success(`已删除商品「${deleting.name}」`)
          }
          setDeleting(null)
        }}
      />
    </div>
  )
}

export { Products as ProductsPage }
