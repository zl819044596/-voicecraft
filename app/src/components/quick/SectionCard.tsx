import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/** 编号区块卡：大序号水印（Space Grotesk 64px --text-3 20% 透明度，quick.md §1） */
export default function SectionCard({
  no,
  title,
  description,
  children,
  id,
  className,
}: {
  no: string
  title: string
  description?: string
  children: ReactNode
  id?: string
  className?: string
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={cn('relative scroll-mt-20 overflow-hidden rounded-lg border border-line bg-surface p-5', className)}
    >
      <motion.span
        aria-hidden
        initial={{ opacity: 0, scale: 1.15 }}
        whileInView={{ opacity: 0.2, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="font-display pointer-events-none absolute top-2 right-4 text-[64px] leading-none font-semibold text-ink3 select-none"
      >
        {no}
      </motion.span>
      <h2 className="text-[17px] leading-[26px] font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-[13px] leading-5 text-ink3">{description}</p>}
      <div className="mt-4">{children}</div>
    </motion.section>
  )
}
