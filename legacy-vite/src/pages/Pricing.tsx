import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Gem, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/PageHeader'
import { useI18n } from '@/lib/i18n'
import { useDemo } from '@/lib/demo'

const CARD_ANIM = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
}

/** /app/pricing 价格展示页（PIPELINE_TASK_42 阶段 E）：三档定价 · Creem 结算在阶段③接入，本页仅展示 */
export default function Pricing() {
  const { t, dict } = useI18n()
  const { track } = useDemo()
  const location = useLocation()
  const [pulse402, setPulse402] = useState(false)

  // 402 引导落点：#insufficient（原 /app/billing，重定向后仍兼容）
  useEffect(() => {
    if (location.hash === '#insufficient') {
      setPulse402(true)
      toast.error('余额不足 · 请选择购买或配置 BYOK 免费使用', {
        description: '402 INSUFFICIENT_CREDITS',
      })
      const timer = window.setTimeout(() => setPulse402(false), 1600)
      return () => window.clearTimeout(timer)
    }
  }, [location.hash])

  const plans = dict.pricing.plans
  const isByok = track === 'byok'

  const onBuy = (name: string) => {
    toast.info(`「${name}」结算将在阶段③接入 Creem 支付 · 当前为展示页`)
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <PageHeader
        title={t('app.pricing')}
        description="三档定价展示 · 1 积分 = $0.01 锚定 · 仅计价不可兑现金 · Creem 结算将在阶段③接入"
      />

      {/* BYOK 档说明卡 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26 }}
        className={cn(
          'flex items-center gap-3 rounded-md px-4 py-3 text-[13px]',
          isByok ? 'border border-byok/40 bg-byok/5 text-byok' : 'border border-line bg-surface text-ink2',
        )}
      >
        <KeyRound className="size-4 shrink-0" />
        <span>
          {isByok
            ? '当前 BYOK 档 · $0 全功能 · 自备 Key 后平台不计量，任务与重跑全部免费'
            : '自备 Key（BYOK）可免费使用 · 平台不计量 · 任务与重跑全部免费'}
        </span>
      </motion.div>

      {/* 三档价格卡 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((p, i) => (
          <motion.div
            key={p.name}
            custom={i}
            variants={CARD_ANIM}
            initial="hidden"
            animate="show"
            className={cn(
              'relative flex flex-col rounded-lg border p-6',
              p.popular ? 'border-brand/60 bg-brand-soft/40' : 'border-line bg-surface',
            )}
          >
            {p.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[10px] font-semibold tracking-wide text-white">
                MOST POPULAR
              </span>
            )}
            <h3 className="text-[15px] font-semibold text-ink">{p.name}</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-display text-4xl font-semibold text-ink">{p.price}</span>
              <span className="text-xs text-ink3">{p.period}</span>
            </div>
            <p className="mt-2 text-[13px] text-ink2">{p.desc}</p>
            <ul className="mt-5 flex flex-1 flex-col gap-2">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-ink2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-brand-strong" strokeWidth={3} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onBuy(p.name)}
              className={cn(
                'mt-6 h-10 w-full rounded-md text-sm font-medium transition-all',
                p.popular
                  ? 'bg-brand text-white hover:bg-brand-strong'
                  : 'border border-line text-ink hover:border-linestrong hover:text-ink',
              )}
            >
              {t('pricing.cta')}
            </button>
          </motion.div>
        ))}
      </div>

      {/* 402 脉冲提示（#insufficient 落点时高亮） */}
      <AnimatePresence>
        {pulse402 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border border-err/50 bg-err/10 px-4 py-3 text-sm text-err"
          >
            积分不足（402）· 上方三档任选购买，或配置 BYOK 免费使用
          </motion.div>
        )}
      </AnimatePresence>

      {/* 计费说明 */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.3 }}
        className="rounded-lg border border-line bg-surface p-5"
      >
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Gem className="size-4 text-brand-strong" /> 计费说明
        </h3>
        <ul className="mt-3 flex flex-col gap-1.5 text-[13px] leading-5 text-ink2">
          <li>· 托管通道按任务扣积分：<span className="font-mono">static 60 / i2v 300</span>（约 $0.01 / 积分）</li>
          <li>· 每条任务含免费重跑次数；超额按 <span className="font-mono">static 20 / i2v 80</span> 扣减</li>
          <li>· 月度积分不结转 · 按次积分永久有效 · failed 解冻，done 实结</li>
          <li>· <span className="text-byok">BYOK 档不计量</span>：自备模型 Key，任务与重跑全部免费</li>
        </ul>
      </motion.section>
    </div>
  )
}
