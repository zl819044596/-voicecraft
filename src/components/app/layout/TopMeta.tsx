"use client";

// top-meta 槽位（C3）— 原型每页顶栏是 `page-title + top-meta（每页一句状态说明）
// + spacer + credits + avatar`。静态页面由 TopBar 按路由映射；动态页面（任务详情
// 的 `static · managed 托管档 · run mode: semi`）用本 context 覆盖。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type TopMetaValue = { meta: string | null; setMeta: (m: string | null) => void };

const TopMetaContext = createContext<TopMetaValue>({ meta: null, setMeta: () => {} });

export function TopMetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<string | null>(null);
  const value = useMemo(() => ({ meta, setMeta }), [meta]);
  return <TopMetaContext.Provider value={value}>{children}</TopMetaContext.Provider>;
}

/** TopBar 读取动态 meta（页面设置的覆盖静态路由映射）。 */
export function useTopMeta(): TopMetaValue {
  return useContext(TopMetaContext);
}

/** 页面写入/清理 top-meta（任务详情等动态页）。传 null/undefined 不覆盖。 */
export function useSetTopMeta(meta: string | null): void {
  const { setMeta } = useContext(TopMetaContext);
  useEffect(() => {
    if (meta == null) return;
    setMeta(meta);
    return () => setMeta(null);
  }, [meta, setMeta]);
}
