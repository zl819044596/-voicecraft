import { useCallback, useEffect, useState } from 'react'
import { useDemo } from '@/lib/demo'
import { get } from '@/lib/api'
import type { Page } from '@/lib/types'

export interface UseApiListResult<T> {
  /** real 模式下拉取到的列表；demo 模式下恒为 null（页面回落本地 mock）。 */
  items: T[] | null
  total: number
  loading: boolean
  error: string | null
  reload: () => void
  real: boolean
}

function buildQs(query: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(query).filter(
    ([, v]) => v !== undefined && v !== '' && v !== null,
  )
  if (entries.length === 0) return ''
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
}

/**
 * 通用分页列表数据源（PIPELINE_TASK_15 阶段②）：
 * real 模式走真实 API（lib/api.ts），demo 模式返回 items=null 由页面回落 mock。
 * 提交成功后调用 reload() 重拉最新列表。
 */
export function useApiList<T>(
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
): UseApiListResult<T> {
  const { mode } = useDemo()
  const real = mode === 'real'
  const [items, setItems] = useState<T[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(real)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const qs = buildQs(query)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!real) {
      setItems(null)
      setTotal(0)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    get<Page<T>>(`${path}${qs}`)
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
        setTotal(res.total)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real, path, qs, tick])

  return { items, total, loading, error, reload, real }
}
