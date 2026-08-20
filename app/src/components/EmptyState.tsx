import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/** EmptyState：/empty-state.svg 插画 + h3 标题 + small 说明 + 主按钮（design.md §5.3） */
export default function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  action,
}: {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-surface px-6 py-16 text-center">
      <img src="/empty-state.svg" alt="" className="mb-5 h-[120px] w-40 opacity-90" />
      <h3 className="text-[15px] leading-[22px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-ink3">{description}</p>}
      {action ? (
        <div className="mt-5">{action}</div>
      ) : (
        actionLabel && (
          <Button className="mt-5 bg-brand text-white hover:bg-brand-strong" onClick={onAction}>
            {actionLabel}
          </Button>
        )
      )}
    </div>
  )
}
