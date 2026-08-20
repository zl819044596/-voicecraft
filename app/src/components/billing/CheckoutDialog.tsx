import { useState } from 'react'
import { CreditCard, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Plan } from './data'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  plan: Plan | null
  onSuccess: (plan: Plan) => void
  /** real 模式：POST /api/billing/checkout 创建 Creem 收银台会话 → 跳转 */
  real?: boolean
  onCheckout?: (plan: Plan) => Promise<string>
}

/** Creem checkout 弹窗（billing.md §3）：demo 模拟支付；real 创建真实收银台并跳转 */
export default function CheckoutDialog({ open, onOpenChange, plan, onSuccess, real, onCheckout }: Props) {
  const [paying, setPaying] = useState(false)

  const pay = async () => {
    if (!plan) return
    setPaying(true)
    if (real && onCheckout) {
      try {
        const url = await onCheckout(plan)
        window.location.assign(url)
      } catch (e) {
        setPaying(false)
        toast.error(e instanceof Error ? e.message : '创建支付会话失败')
      }
      return
    }
    window.setTimeout(() => {
      setPaying(false)
      onOpenChange(false)
      onSuccess(plan)
    }, 1000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-line bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-ink">
            模拟 Creem checkout
            <span className="rounded bg-brand px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">DEMO</span>
          </DialogTitle>
          <DialogDescription className="text-ink3">
            前端原型支付模拟 · 不发生真实扣款
          </DialogDescription>
        </DialogHeader>

        {plan && (
          <div className="rounded-md border border-line bg-raised p-4">
            <p className="mb-2 font-mono text-xs font-medium text-ink3">ORDER SUMMARY</p>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink">{plan.name}</span>
              <span className="font-mono text-sm font-semibold text-ink">{plan.price}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between text-xs text-ink3">
              <span>{plan.creditsLabel}</span>
              <span className="font-mono">+{plan.credits} 积分</span>
            </div>
          </div>
        )}

        {/* 卡号占位（灰显，不可编辑） */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink3">卡号</p>
          <div className="flex h-9 items-center gap-2 rounded-md border border-line bg-raised px-3 opacity-60">
            <CreditCard className="size-4 text-ink3" />
            <span className="font-mono text-[13px] text-ink3">4242 •••• •••• 4242</span>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={paying || !plan}
            onClick={pay}
            className="w-full bg-brand text-white hover:bg-brand-strong"
          >
            {paying && <Loader2 className="size-4 animate-spin" />}
            模拟支付成功
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
