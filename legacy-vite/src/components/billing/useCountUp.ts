import { useEffect, useState } from 'react'

/** 数字 count-up（billing.md §2：800ms 插值） */
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    let raf = 0
    const from = value
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      // easeOutCubic
      const e = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(from + (target - from) * e))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  return value
}
