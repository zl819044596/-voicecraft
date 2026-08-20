import type { ReactNode } from 'react'

/** PageHeader：display 标题 + small 描述 + 右侧主操作（design.md §5.3） */
export default function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[22px] leading-[30px] font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 text-[13px] leading-5 text-ink3">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
