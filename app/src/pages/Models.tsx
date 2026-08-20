import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useDemo } from '@/lib/demo'
import { ApiError, API_BASE, del, post, put } from '@/lib/api'
import { useApiList } from '@/lib/use-api-data'
import type { Credential as ApiCredential, ModelConfig as ApiModelConfig, ProbeResult } from '@/lib/types'
import { cn } from '@/lib/utils'
import ChannelCard from '@/components/models/ChannelCard'
import ConfigDrawer from '@/components/models/ConfigDrawer'
import { CLASS_META, CLASS_ORDER, INITIAL_CONFIGS } from '@/components/models/data'
import type { ModelConfig, ProviderClass } from '@/components/models/data'

/* ---------- real 数据映射 ---------- */

function hostFromUrl(url?: string): string {
  try {
    return new URL(url ?? '').hostname || 'openai-compat'
  } catch {
    return 'openai-compat'
  }
}

/** 后端 ModelConfig → 页面渲染型；mechanism 由 base_url 推断，provider 用凭据信息回填 */
function mapApiConfig(c: ApiModelConfig, creds: ApiCredential[]): ModelConfig {
  const cred = c.credential_id ? creds.find((x) => x.id === c.credential_id) : undefined
  return {
    id: c.id,
    cls: c.provider_class as ProviderClass,
    name: c.name,
    mechanism: c.base_url ? 'openai-compat' : 'preset',
    endpoint: c.base_url ?? undefined,
    provider: cred?.provider ?? undefined,
    model: c.model,
    maskedKey: c.key_masked ?? '••••••',
    voice: c.voice ?? undefined,
    isDefault: c.is_default,
    enabled: c.enabled,
    credentialId: c.credential_id ?? undefined,
  }
}

/** POST 返回音频流的试听端点（apiFetch 只解析 JSON/文本，音频需 blob） */
async function postAudioBlob(path: string, body: unknown): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `请求失败（${res.status}）`
    try {
      const j = (await res.json()) as { error?: { message?: string } }
      msg = j?.error?.message ?? msg
    } catch {
      /* 非 JSON 错误体忽略 */
    }
    throw new ApiError(res.status, 'AUDIO_ERROR', msg)
  }
  return res.blob()
}

/** /app/models 模型配置中心（models.md）：三类通道 CRUD、默认/启停、测试连接、TTS 试听、Key masked */
export default function Models() {
  const { track, mode } = useDemo()
  const real = mode === 'real'
  const list = useApiList<ApiModelConfig>('/model-configs', { size: 100 })
  const creds = useApiList<ApiCredential>('/credentials', { size: 100 })
  const [configs, setConfigs] = useState<ModelConfig[]>(INITIAL_CONFIGS)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerCls, setDrawerCls] = useState<ProviderClass>('llm')
  const [editing, setEditing] = useState<ModelConfig | null>(null)

  // real 模式数据源来自 API（凭据 join 出 provider 展示）；demo 回落本地 mock
  const shownConfigs: ModelConfig[] = real
    ? (list.items ?? []).map((c) => mapApiConfig(c, creds.items ?? []))
    : configs

  const byCls = useMemo(() => {
    const m = {} as Record<ProviderClass, ModelConfig[]>
    for (const cls of CLASS_ORDER) m[cls] = shownConfigs.filter((c) => c.cls === cls)
    return m
  }, [shownConfigs])

  const openAdd = (cls: ProviderClass) => {
    setDrawerCls(cls)
    setEditing(null)
    setDrawerOpen(true)
  }
  const openEdit = (cfg: ModelConfig) => {
    setDrawerCls(cfg.cls)
    setEditing(cfg)
    setDrawerOpen(true)
  }

  const handleSave = async (cfg: ModelConfig) => {
    if (real) {
      const isEdit = editing !== null && editing.id === cfg.id
      try {
        let credentialId = cfg.credentialId ?? null
        // 需要明文 Key → 先建/换凭据（R1：明文只用于这一次 POST /credentials，随后弃用）
        if (cfg.plainKey) {
          const cred = await post<ApiCredential>('/credentials', {
            provider: cfg.mechanism === 'preset' ? cfg.provider || cfg.name : hostFromUrl(cfg.endpoint),
            label: cfg.name,
            key: cfg.plainKey,
            base_url: cfg.mechanism === 'openai-compat' ? cfg.endpoint ?? null : null,
          })
          credentialId = cred.id
        }
        const payload = {
          provider_class: cfg.cls,
          name: cfg.name,
          model: cfg.model,
          base_url: cfg.mechanism === 'openai-compat' ? cfg.endpoint ?? null : null,
          voice: cfg.voice ?? null,
          enabled: cfg.enabled,
          is_default: cfg.isDefault,
          credential_id: credentialId,
        }
        if (isEdit) {
          await put(`/model-configs?id=${cfg.id}`, payload)
        } else {
          await post('/model-configs', payload)
        }
        setDrawerOpen(false)
        toast.success(`已保存配置「${cfg.name}」`)
        list.reload()
        creds.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败')
      }
      return
    }
    setConfigs((prev) => {
      const exists = prev.some((c) => c.id === cfg.id)
      let next = exists ? prev.map((c) => (c.id === cfg.id ? cfg : c)) : [...prev, cfg]
      // 每类至多一个默认；新配置若为该类首条则自动设为默认
      const siblings = next.filter((c) => c.cls === cfg.cls)
      if (cfg.isDefault) {
        next = next.map((c) => (c.cls === cfg.cls && c.id !== cfg.id ? { ...c, isDefault: false } : c))
      } else if (!siblings.some((c) => c.isDefault)) {
        next = next.map((c) => (c.id === cfg.id ? { ...c, isDefault: true } : c))
      }
      return next
    })
  }

  const handleSetDefault = async (id: string) => {
    if (real) {
      const target = shownConfigs.find((c) => c.id === id)
      try {
        await put(`/model-configs?id=${id}`, { is_default: true })
        toast.success(`默认已切换至 ${target?.name ?? ''}`)
        list.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '设为默认失败')
      }
      return
    }
    setConfigs((prev) => {
      const target = prev.find((c) => c.id === id)
      if (!target) return prev
      toast.success(`默认已切换至 ${target.name}`)
      return prev.map((c) => (c.cls === target.cls ? { ...c, isDefault: c.id === id } : c))
    })
  }

  const handleToggleEnabled = async (id: string) => {
    if (real) {
      const target = shownConfigs.find((c) => c.id === id)
      if (!target) return
      try {
        await put(`/model-configs?id=${id}`, { enabled: !target.enabled })
        toast(target.enabled ? `已停用「${target.name}」· 不再出现在模型选项中` : `已启用「${target.name}」`)
        list.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '切换状态失败')
      }
      return
    }
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        toast(c.enabled ? `已停用「${c.name}」· 不再出现在模型选项中` : `已启用「${c.name}」`)
        return { ...c, enabled: !c.enabled }
      }),
    )
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (real) {
      await del(`/model-configs?id=${id}`)
      list.reload()
      return
    }
    setConfigs((prev) => prev.filter((c) => c.id !== id))
  }

  /** 最小连通性探针：已有配置走 POST /api/model-configs/test { id }（服务端内存解密 Key） */
  const handleTest = (cfg: ModelConfig) => post<ProbeResult>('/model-configs/test', { id: cfg.id })

  /** TTS 试听：POST /api/model-configs/preview → 音频流 blob URL */
  const handleAudition = async (cfg: ModelConfig): Promise<string> => {
    const blob = await postAudioBlob('/model-configs/preview', {
      id: cfg.id,
      text: '你好，这是一段音色试听。',
    })
    return URL.createObjectURL(blob)
  }

  const readiness = (cls: ProviderClass) => {
    const list0 = byCls[cls]
    if (list0.length === 0) return { color: 'var(--err)', label: '未配置', detail: '0 条配置' }
    const enabled = list0.filter((c) => c.enabled)
    if (enabled.length === 0) return { color: 'var(--dim)', label: '全部停用', detail: `${list0.length} 条配置` }
    const def = enabled.find((c) => c.isDefault) ?? list0.find((c) => c.isDefault)
    return {
      color: 'var(--ok)',
      label: '就绪',
      detail: `${list0.length} 条配置 · 默认 ${def?.name ?? '未设置'}`,
    }
  }

  return (
    <div>
      <PageHeader
        title="模型通道"
        description="三类通道 · 每类可配多条 · 每类至多一个默认 · BYOK Key 加密存储，永不回显明文"
        actions={
          <Button className="bg-brand text-white hover:bg-brand-strong" onClick={() => openAdd('llm')}>
            <Plus className="size-4" /> 新增配置
          </Button>
        }
      />

      {real && list.loading && !list.items ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-ink3" />
        </div>
      ) : real && list.error ? (
        <EmptyState title="模型配置加载失败" description={list.error} />
      ) : (
        <>
          {/* 托管档说明条 */}
          {track === 'managed' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 rounded-md p-3 text-[13px]"
              style={{
                color: 'var(--managed)',
                background: 'rgba(251,191,36,.08)',
                border: '1px solid rgba(251,191,36,.3)',
              }}
            >
              托管档默认使用平台 Key 池 · 在此配置自备通道后可于创建任务时切换
            </motion.div>
          )}

          {/* 通道就绪总览条 */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {CLASS_ORDER.map((cls, i) => {
              const r = readiness(cls)
              return (
                <motion.button
                  key={cls}
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, delay: i * 0.05 }}
                  onClick={() => document.getElementById(`channel-${cls}`)?.scrollIntoView({ behavior: 'smooth' })}
                  className="rounded-md border border-line bg-surface p-3 text-left transition-colors hover:border-linestrong"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[13px] font-semibold text-ink">{cls}</span>
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: r.color }}>
                      <motion.span
                        initial={{ scale: 0.4 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', duration: 0.4, delay: i * 0.05 + 0.1 }}
                        className={cn('inline-block size-2 rounded-full')}
                        style={{ background: r.color }}
                      />
                      {r.label}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-xs text-ink3" title={CLASS_META[cls].title}>
                    {r.detail}
                  </p>
                </motion.button>
              )
            })}
          </div>

          {/* 三类通道区块 */}
          <div className="flex flex-col gap-6">
            {CLASS_ORDER.map((cls) => (
              <ChannelCard
                key={cls}
                cls={cls}
                configs={byCls[cls]}
                onAdd={() => openAdd(cls)}
                onEdit={openEdit}
                onDelete={handleDelete}
                onToggleEnabled={handleToggleEnabled}
                onSetDefault={handleSetDefault}
                real={real}
                onTest={real ? handleTest : undefined}
                onAudition={real ? handleAudition : undefined}
              />
            ))}
          </div>
        </>
      )}

      <ConfigDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        cls={drawerCls}
        editing={editing}
        existing={byCls[drawerCls]}
        onSave={handleSave}
      />
    </div>
  )
}
