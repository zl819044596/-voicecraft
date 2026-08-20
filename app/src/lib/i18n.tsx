/**
 * 正式 i18n（PIPELINE_TASK_42 阶段 D）：en 默认 + zh 支持。
 *
 * - I18nProvider：语言上下文，初始值读 localStorage（avs_ui_lang），默认 en。
 * - useI18n() / useT()：`t(path)` 以点路径查字典；缺失 key 自动回退英文。
 * - setLocale 同时持久化 localStorage 并同步 <html lang>。
 *
 * 语言切换是「开发阶段用字典实现」——先覆盖 Landing + 导航 + 核心操作词，
 * 页面内长文案可保持英文（缺失 key 回退 en）。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { en } from '@/locales/en'
import { zh } from '@/locales/zh'

export type Lang = 'en' | 'zh'

const STORAGE_KEY = 'avs_ui_lang'

function readInitial(): Lang {
  if (typeof window === 'undefined') return 'en'
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'zh' ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

interface I18nContextValue {
  locale: Lang
  setLocale: (l: Lang) => void
  /** 点路径取字典；返回字符串。缺失时回退英文，再缺则原样返回路径。 */
  t: (path: string) => string
  /** 当前语言完整字典（供组件直接取数组/对象）。 */
  dict: typeof en
}

const I18nContext = createContext<I18nContextValue | null>(null)

function resolve(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
    obj,
  )
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Lang>(readInitial)

  const setLocale = useCallback((l: Lang) => {
    setLocaleState(l)
    try {
      window.localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* 隐私模式等场景忽略 */
    }
    document.documentElement.lang = l
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo<I18nContextValue>(() => {
    const dict = locale === 'zh' ? zh : en
    const t = (path: string): string => {
      const v = resolve(dict, path)
      if (typeof v === 'string' && v) return v
      const ev = resolve(en, path)
      return typeof ev === 'string' && ev ? ev : path
    }
    return { locale, setLocale, t, dict }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}

/** 简写：只拿 t + locale（多数页面够用）。 */
export function useT(): { t: (path: string) => string; locale: Lang } {
  const { t, locale } = useI18n()
  return { t, locale }
}
