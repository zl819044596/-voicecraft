import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw, Wand2, X } from 'lucide-react'
import { SCENARIOS, useDemo } from '@/lib/demo'
import type { ScenarioId } from '@/lib/demo'
import { cn } from '@/lib/utils'

/**
 * DemoConsole 演示控制台（design.md §5.2，原型专用，非产品功能）。
 * 收起态 48px 圆钮；展开为 300px 卡片：轨道切换 / 演示场景 / 数据重置。
 */
export default function DemoConsole() {
  const { mode, setMode, track, setTrack, consoleOpen, setConsoleOpen, applyScenario, resetDemo } = useDemo()
  const [flash, setFlash] = useState(0)

  const inject = (id: ScenarioId) => {
    if (mode === 'real') return // real 模式禁用 mock 场景注入
    setFlash((n) => n + 1)
    applyScenario(id)
  }

  return (
    <>
      {/* 场景注入全屏微妙闪白 120ms */}
      <AnimatePresence>
        {flash > 0 && (
          <motion.div
            key={flash}
            className="pointer-events-none fixed inset-0 z-[90] bg-white"
            initial={{ opacity: 0.25 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          />
        )}
      </AnimatePresence>

      <div className="fixed right-5 bottom-5 z-[80]">
        <AnimatePresence mode="wait">
          {consoleOpen ? (
            <motion.div
              key="open"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.2 }}
              className="w-[300px] rounded-lg bg-raised p-4 shadow-pop"
              style={{ border: '1.5px dashed rgba(124,92,255,.5)' }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-brand-strong"
                  style={{ border: '1px dashed rgba(124,92,255,.5)' }}
                >
                  原型控制台
                </span>
                <button
                  type="button"
                  onClick={() => setConsoleOpen(false)}
                  className="rounded p-1 text-ink3 hover:bg-press hover:text-ink"
                  aria-label="收起演示控制台"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* 数据来源：demo（mock）/ real（真实 API） */}
              <p className="mb-1.5 text-xs font-medium text-ink3">数据来源</p>
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-md border border-line bg-surface p-1">
                {(
                  [
                    { id: 'demo', label: '演示 mock' },
                    { id: 'real', label: '真实 API' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={cn(
                      'rounded px-2 py-1.5 text-xs font-medium transition-colors',
                      mode === m.id ? 'bg-press' : 'text-ink3 hover:text-ink',
                    )}
                    style={mode === m.id ? { color: 'var(--brand-strong)' } : undefined}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* 轨道切换 */}
              <p className="mb-1.5 text-xs font-medium text-ink3">轨道切换</p>
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-md border border-line bg-surface p-1">
                {(
                  [
                    { id: 'byok', label: 'BYOK 档', color: 'var(--byok)' },
                    { id: 'managed', label: '托管档', color: 'var(--managed)' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTrack(t.id)}
                    className={cn(
                      'rounded px-2 py-1.5 text-xs font-medium transition-colors',
                      track === t.id ? 'bg-press' : 'text-ink3 hover:text-ink',
                    )}
                    style={track === t.id ? { color: t.color } : undefined}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* 演示场景（real 模式禁用） */}
              <p className="mb-1.5 text-xs font-medium text-ink3">
                演示场景（一键注入 mock 状态）
                {mode === 'real' && <span className="ml-1 text-[10px] text-ink3">· real 模式禁用</span>}
              </p>
              <div className="mb-4 flex flex-col gap-1">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => inject(s.id)}
                    disabled={mode === 'real'}
                    className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-left text-xs text-ink2 transition-colors hover:border-linestrong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink2"
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* 数据 */}
              <p className="mb-1.5 text-xs font-medium text-ink3">数据</p>
              <button
                type="button"
                onClick={resetDemo}
                disabled={mode === 'real'}
                className="flex w-full items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink2 transition-colors hover:border-linestrong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink2"
              >
                <RotateCcw className="size-3.5" />
                重置演示数据
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="closed"
              type="button"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.2 }}
              onClick={() => setConsoleOpen(true)}
              className="relative flex size-12 items-center justify-center rounded-full bg-raised text-brand-strong shadow-pop transition-transform hover:-translate-y-0.5"
              style={{ border: '1.5px dashed rgba(124,92,255,.5)' }}
              aria-label="打开演示控制台"
            >
              <Wand2 className="size-5" />
              <span className="absolute -top-1.5 -right-1.5 rounded bg-brand px-1 font-mono text-[9px] font-bold text-white">
                DEMO
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
