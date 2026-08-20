import { FileJson, FileSpreadsheet, FolderDown, ShieldCheck } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const TREE: { icon: 'json' | 'csv'; name: string; size: string; note?: string }[] = [
  { icon: 'json', name: 'profile.json', size: '2 KB', note: '昵称 / 邮箱 / 档位 / 语言偏好' },
  { icon: 'json', name: 'tasks.json', size: '48 KB', note: '任务与项目元数据（不含媒体文件本体）' },
  { icon: 'csv', name: 'ledger.csv', size: '12 KB', note: '积分流水全量' },
  { icon: 'json', name: 'credentials_masked.json', size: '3 KB', note: '仅掩码 · 不含明文 Key' },
]

/** real 模式：GET /api/account/export 实际包内容（manifest.json 的 files 清单，不含 projects 动态文件） */
const REAL_TREE: { icon: 'json' | 'csv'; name: string; size?: string; note?: string }[] = [
  { icon: 'json', name: 'manifest.json', note: '包格式 / 生成时间 / 文件清单' },
  { icon: 'json', name: 'profile.json', note: '昵称 / 邮箱 / 档位 / 语言偏好' },
  { icon: 'json', name: 'prompts.json', note: '提示词模板' },
  { icon: 'json', name: 'products.json', note: '商品库' },
  { icon: 'json', name: 'benchmarks.json', note: '对标库' },
  { icon: 'json', name: 'media_assets.json', note: '素材库元数据（不含媒体文件本体）' },
  { icon: 'json', name: 'orders.json', note: '订单' },
  { icon: 'json', name: 'subscriptions.json', note: '订阅记录' },
  { icon: 'json', name: 'credit_ledger.json', note: '积分流水全量' },
  { icon: 'json', name: 'projects/*.json', note: '每项目一个 JSON（含任务元数据）' },
]

/** GDPR 数据导出包预览 Drawer（settings.md §4） */
export default function ExportDrawer({
  open,
  onOpenChange,
  real,
  zipName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** real 模式：展示真实导出包内容（manifest 文件清单） */
  real?: boolean
  zipName?: string
}) {
  const tree = real ? REAL_TREE : TREE
  const title = real ? '数据包已生成' : '数据包已生成（模拟）'
  const desc = real
    ? `${zipName ?? 'avs-gdpr-export.zip'} · 下载已开始`
    : 'export-u_8f3k2-20250818.zip · 下载已开始'
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full border-line bg-surface sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-ink">
            <FolderDown className="size-4 text-brand-strong" /> {title}
          </SheetTitle>
          <SheetDescription className="text-ink3">{desc}</SheetDescription>
        </SheetHeader>

        <div className="mt-5 rounded-md border border-line bg-raised p-4 font-mono text-[13px] leading-7">
          <p className="text-ink3">{real ? (zipName ?? 'avs-gdpr-export.zip') : 'export-u_8f3k2-20250818.zip'}</p>
          {tree.map((f, i) => (
            <div key={f.name} className="flex items-start gap-2">
              <span className="text-ink3">{i === tree.length - 1 ? '└──' : '├──'}</span>
              {f.icon === 'json' ? (
                <FileJson className="mt-1 size-3.5 shrink-0 text-brand-strong" />
              ) : (
                <FileSpreadsheet className="mt-1 size-3.5 shrink-0 text-brand-strong" />
              )}
              <div className="min-w-0">
                <p className="text-ink">
                  {f.name} {f.size && <span className="text-ink3">· {f.size}</span>}
                </p>
                {f.note && <p className="font-sans text-xs leading-4 text-ink3">{f.note}</p>}
              </div>
            </div>
          ))}
        </div>

        <div
          className="mt-4 rounded-md bg-raised p-3 text-xs leading-5 text-ink2"
          style={{ borderLeft: '3px solid var(--byok)' }}
        >
          <p className="flex items-center gap-1.5 font-medium text-byok">
            <ShieldCheck className="size-3.5" /> Key 安全
          </p>
          导出包不包含明文 Key —— credentials_masked.json 仅保存掩码串（如 sk-••••••cdef）
        </div>
      </SheetContent>
    </Sheet>
  )
}
