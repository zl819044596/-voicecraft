import { useState } from 'react'
import { motion } from 'framer-motion'
import { AudioLines, Loader2, Lock, Pencil, Plus, Star, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { MaskedKey } from '@/components/badges'
import type { ProbeResult } from '@/lib/types'
import { CLASS_META } from './data'
import type { ModelConfig, ProviderClass } from './data'
import WaveformPlayer from './WaveformPlayer'

type TestState = 'testing' | 'ok' | 'err'

interface Props {
  cls: ProviderClass
  configs: ModelConfig[]
  onAdd: () => void
  onEdit: (cfg: ModelConfig) => void
  onDelete: (id: string) => void | Promise<void>
  onToggleEnabled: (id: string) => void
  onSetDefault: (id: string) => void
  /** real 模式：测试连接走 POST /api/model-configs/test */
  real?: boolean
  onTest?: (cfg: ModelConfig) => Promise<ProbeResult>
  /** real 模式：TTS 试听走 POST /api/model-configs/preview → 返回 blob URL */
  onAudition?: (cfg: ModelConfig) => Promise<string>
}

/** 通道区块卡（models.md §3）：配置表格 + 测试连接 / 试听 / 编辑 / 删除 */
export default function ChannelCard({
  cls,
  configs,
  onAdd,
  onEdit,
  onDelete,
  onToggleEnabled,
  onSetDefault,
  real,
  onTest,
  onAudition,
}: Props) {
  const [tests, setTests] = useState<Record<string, TestState>>({})
  const [testDetail, setTestDetail] = useState<Record<string, string>>({})
  const [auditionId, setAuditionId] = useState<string | null>(null)
  const [auditionSrc, setAuditionSrc] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ModelConfig | null>(null)
  const meta = CLASS_META[cls]

  const runTest = (cfg: ModelConfig) => {
    setTests((s) => ({ ...s, [cfg.id]: 'testing' }))
    if (real && onTest) {
      onTest(cfg)
        .then((r) => {
          setTests((s) => ({ ...s, [cfg.id]: r.ok ? 'ok' : 'err' }))
          setTestDetail((s) => ({
            ...s,
            [cfg.id]: r.ok ? `连接成功 · 延迟 ${r.latency_ms ?? '—'}ms` : `失败 · ${r.note ?? 'Provider 不可用'}`,
          }))
        })
        .catch((e: unknown) => {
          setTests((s) => ({ ...s, [cfg.id]: 'err' }))
          setTestDetail((s) => ({
            ...s,
            [cfg.id]: `失败 · ${e instanceof Error ? e.message : '连接测试异常'}`,
          }))
        })
      return
    }
    window.setTimeout(() => {
      const ok = !cfg.failsTest
      setTests((s) => ({ ...s, [cfg.id]: ok ? 'ok' : 'err' }))
      setTestDetail((s) => ({
        ...s,
        [cfg.id]: ok ? '连接成功 · 延迟 320ms' : '失败 · 401 无效的 API Key',
      }))
      if (ok) toast.success(`「${cfg.name}」连接成功 · 延迟 320ms`)
      else toast.error(`「${cfg.name}」连接失败 · 401 无效的 API Key`)
    }, 1200)
  }

  const toggleAudition = async (c: ModelConfig) => {
    if (real && onAudition) {
      try {
        if (auditionId === c.id) {
          setAuditionId(null)
          setAuditionSrc(null)
          return
        }
        setAuditionSrc(null)
        const url = await onAudition(c)
        setAuditionId(c.id)
        setAuditionSrc(url)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '试听失败')
      }
      return
    }
    setAuditionId(auditionId === c.id ? null : c.id)
  }

  const endpointText = (c: ModelConfig) =>
    c.mechanism === 'openai-compat'
      ? `${(c.endpoint ?? '').replace(/^https?:\/\//, '')} · ${c.model}`
      : `${c.provider} · ${c.model}`

  const colCount = cls === 'tts' ? 7 : 6

  return (
    <motion.section
      id={`channel-${cls}`}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.26 }}
      className="scroll-mt-20 rounded-lg border border-line bg-surface p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] leading-[26px] font-semibold text-ink">{meta.title}</h2>
          <p className="mt-0.5 text-[13px] text-ink3">{meta.purpose}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 text-[13px] text-ink2 transition-colors hover:border-linestrong hover:text-ink"
        >
          <Plus className="size-3.5" /> 添加 {cls.toUpperCase()} 配置
        </button>
      </div>

      {configs.length === 0 ? (
        <div className="flex flex-col items-center rounded-md border border-dashed border-line py-10 text-center">
          <p className="text-sm font-medium text-ink2">未配置</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-ink3">
            该类通道暂无配置 · 托管档将使用平台 Key 池，BYOK 档需添加后才能创建相关任务
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-4 flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
          >
            <Plus className="size-3.5" /> 添加配置
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs font-medium text-ink3">
                <th className="px-2 py-2">名称</th>
                <th className="px-2 py-2">端点/模型</th>
                <th className="px-2 py-2">凭证</th>
                {cls === 'tts' && <th className="px-2 py-2">声音</th>}
                <th className="px-2 py-2 text-center">默认</th>
                <th className="px-2 py-2 text-center">启用</th>
                <th className="px-2 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c, i) => {
                const t = tests[c.id]
                return (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, delay: i * 0.04 }}
                    className={cn('border-b border-line/60 align-top last:border-0', !c.enabled && 'opacity-50')}
                  >
                    <td className="px-2 py-3">
                      <p className="text-sm font-medium text-ink">{c.name}</p>
                      <span className="mt-1 inline-block rounded-full border border-line bg-raised px-2 py-0.5 text-[11px] text-ink3">
                        {c.mechanism === 'openai-compat' ? '机制 A · OpenAI 兼容' : '机制 B · 预设'}
                      </span>
                    </td>
                    <td className="max-w-[180px] px-2 py-3">
                      <code className="block truncate font-mono text-xs text-ink2" title={endpointText(c)}>
                        {endpointText(c)}
                      </code>
                    </td>
                    <td className="px-2 py-3">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-help items-center gap-1.5">
                              <Lock className="size-3 text-ink3" />
                              <MaskedKey value={c.maskedKey} className="text-xs" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="border-line bg-raised text-xs text-ink2">
                            AES-GCM 加密存储 · 前端不持久化 · 永不明文回显
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    {cls === 'tts' && (
                      <td className="px-2 py-3 font-mono text-xs text-ink2">{c.voice ?? '—'}</td>
                    )}
                    <td className="px-2 py-3 text-center">
                      <motion.button
                        key={`${c.id}-${c.isDefault}`}
                        type="button"
                        initial={{ scale: 0.7 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', duration: 0.35 }}
                        onClick={() => !c.isDefault && onSetDefault(c.id)}
                        title={c.isDefault ? '当前默认' : '设为默认（原默认自动取消）'}
                        className="inline-flex rounded p-1 transition-transform hover:scale-110"
                      >
                        <Star
                          className="size-4"
                          fill={c.isDefault ? 'var(--managed)' : 'none'}
                          stroke={c.isDefault ? 'var(--managed)' : 'var(--text-3)'}
                        />
                      </motion.button>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Switch
                        checked={c.enabled}
                        onCheckedChange={() => onToggleEnabled(c.id)}
                        title="停用后不出现在任务创建的模型选项中"
                      />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => runTest(c)}
                          disabled={t === 'testing'}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-brand-strong transition-colors hover:bg-brand-soft disabled:opacity-60"
                        >
                          {t === 'testing' ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
                          测试连接
                        </button>
                        {cls === 'tts' && (
                          <button
                            type="button"
                            onClick={() => toggleAudition(c)}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-byok transition-colors hover:bg-[rgba(45,212,191,.1)]"
                          >
                            <AudioLines className="size-3" /> 试听
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onEdit(c)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-ink2 transition-colors hover:bg-raised hover:text-ink"
                        >
                          <Pencil className="size-3" /> 编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(c)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-err transition-colors hover:bg-[rgba(248,113,113,.1)]"
                        >
                          <Trash2 className="size-3" /> 删除
                        </button>
                      </div>
                      {/* 行内测试连接结果徽章 */}
                      {(t === 'ok' || t === 'err') && (
                        <motion.p
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', duration: 0.3 }}
                          className="mt-1.5 text-right font-mono text-[11px] font-medium"
                          style={{ color: t === 'ok' ? 'var(--ok)' : 'var(--err)' }}
                        >
                          {testDetail[c.id]}
                        </motion.p>
                      )}
                    </td>
                  </motion.tr>
                )
              })}
              {/* TTS 试听展开行 */}
              {cls === 'tts' && auditionId && (
                <tr>
                    <td colSpan={colCount} className="px-2 py-3">
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                      <WaveformPlayer
                        label={`${configs.find((c) => c.id === auditionId)?.name ?? ''} · ${configs.find((c) => c.id === auditionId)?.voice ?? ''}`}
                        src={auditionSrc ?? undefined}
                      />
                    </motion.div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 删除确认（--err；被引用时追加警告） */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="border-line bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ink">删除配置「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription className="text-ink3">
              删除后该配置不再出现在任务创建的模型选项中，凭证一并移除。
              {deleteTarget?.refs ? (
                <span className="mt-2 block font-medium" style={{ color: 'var(--managed)' }}>
                  {deleteTarget.refs} 条模型配置引用此凭证 · 删除后这些配置将失效
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-line bg-raised text-ink2 hover:text-ink">取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return
                try {
                  await onDelete(deleteTarget.id)
                  toast.success(`已删除配置「${deleteTarget.name}」`)
                  setDeleteTarget(null)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : '删除失败')
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.section>
  )
}
