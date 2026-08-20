/**
 * RerunControl 重跑控件（design.md §5.3）：按钮「从本步重跑」+ 费用提示 + dropdown 可选起始逻辑步。
 * 点击仅发起请求，费用确认/402 由页面级 ConfirmDialog 统一处理。
 */
import { ChevronDown, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDemo } from '@/lib/demo'
import type { GenMode } from '@/components/badges'
import { STEP_META, rerunCost } from '@/lib/task-wizard-mock'
import type { StepKey } from '@/lib/task-wizard-mock'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function RerunControl({
  step,
  options,
  freeReruns,
  mode,
  disabled,
  onRequest,
  label,
  hint = true,
}: {
  step: StepKey
  options?: StepKey[]
  freeReruns: number
  mode: GenMode
  disabled?: boolean
  onRequest: (from: StepKey) => void
  label?: string
  hint?: boolean
}) {
  const { track } = useDemo()
  const cost = rerunCost(mode)
  const opts = options && options.length > 0 ? options : [step]

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="flex items-stretch">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onRequest(step)}
          className={cn(
            'border-line bg-raised text-ink2 hover:border-brand-strong hover:text-ink',
            opts.length > 1 && 'rounded-r-none border-r-0',
          )}
        >
          <RotateCcw className="size-3.5" />
          {label ?? `从 ${step} 重跑`}
        </Button>
        {opts.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                className="rounded-l-none border-line bg-raised px-1.5 text-ink2 hover:border-brand-strong hover:text-ink"
                aria-label="选择重跑起始步"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-line bg-raised">
              {opts.map((s) => (
                <DropdownMenuItem key={s} className="cursor-pointer font-mono text-xs" onClick={() => onRequest(s)}>
                  从 {STEP_META[s].code} 重跑 · {STEP_META[s].name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {hint &&
        (track === 'byok' ? (
          <span className="font-mono text-xs text-byok">BYOK · 重跑不计次</span>
        ) : (
          <span className={cn('font-mono text-xs', freeReruns <= 1 ? 'text-managed' : 'text-ink3')}>
            免费重跑剩 {freeReruns} 次 · 超出 {cost} 积分/次
          </span>
        ))}
    </div>
  )
}
