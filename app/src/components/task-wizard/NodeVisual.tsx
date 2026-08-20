/**
 * 节点 ③ 逐镜生图（PIPELINE_TASK_42 阶段 C）：镜头胶片条 + L4 候选图区。
 * L5(i2v) 已下线，clip 相关 UI 已移除。
 */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, RotateCw, Search, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { GenMode, StepStatus } from '@/components/badges'
import type { Shot, StepKey } from '@/lib/task-wizard-mock'
import { VARIANT_FILTERS } from '@/lib/task-wizard-mock'
import type { RealCandidate } from '@/lib/task-wizard-real'
import RerunControl from '@/components/task-wizard/RerunControl'
import { AmberBar, Lightbox, SectionCard } from '@/components/task-wizard/shared'
import { Button } from '@/components/ui/button'

interface Candidate {
  id: string
  src: string
  filter?: string
  label: string
}

function buildCandidates(shot: Shot): Candidate[] {
  const list: Candidate[] = [{ id: 'base', src: shot.image, label: '原图' }]
  if (shot.alt) list.push({ id: 'alt', src: shot.alt, label: 'alt 角度' })
  else list.push({ id: 'v1', src: shot.image, filter: VARIANT_FILTERS[0], label: '色调候选 A' })
  if (shot.index === 3) {
    // 镜头 3 预置 3 张候选（design.md §8）
    list.push({ id: 'v2', src: shot.image, filter: VARIANT_FILTERS[1], label: '色调候选 B' })
  }
  return list
}

const IMAGE_RETRY_DELAY_MS = 3000
const IMAGE_RETRY_LIMIT = 120

/** 镜头缩略图：图未生成/加载失败时显示占位（编号 + “未生成”），不渲染破图图标。 */
function ShotThumb({ src, index, refreshToken }: { src: string; index: number; refreshToken: number }) {
  const [broken, setBroken] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const valid = src && /^(https?:|data:|\/)/i.test(src)

  // 强制新 URL：失败/未加载时 query 时间戳随轮询递增 → 浏览器必然重新请求
  // （绕开 React 元素复用与 HTTP 缓存——同 URL 的 img 复用不会重发请求，这是线上
  // 图片不显示的根因）。已成功显示（loaded）→ 固定 URL，不再重复下载。
  const url = valid && !loaded ? `${src}${src.includes('?') ? '&' : '?'}t=${refreshToken}` : src

  // storyboard 可能先给出预期 MinIO key、对象稍后才上传。每次成功详情轮询都必须
  // 重新尝试同 URL，否则此前 404 的失败态会永久卡住。
  useEffect(() => {
    setBroken(false)
    setRetryTick(0)
  }, [refreshToken, src])

  // src 变化或加载失败 → 回到"未加载"态，下一轮询重新带时间戳请求。
  useEffect(() => {
    setLoaded(false)
  }, [src, broken])

  const retry = () => {
    setBroken(false)
    setRetryTick((tick) => tick + 1)
  }

  useEffect(() => {
    if (!broken || !valid || retryTick >= IMAGE_RETRY_LIMIT) return
    const t = setTimeout(retry, IMAGE_RETRY_DELAY_MS)
    return () => clearTimeout(t)
  }, [broken, retryTick, valid])

  useEffect(() => {
    const retryWhenVisible = () => {
      if (document.visibilityState === 'visible' && broken && valid) {
        setBroken(false)
        setRetryTick(0)
      }
    }
    document.addEventListener('visibilitychange', retryWhenVisible)
    return () => document.removeEventListener('visibilitychange', retryWhenVisible)
  }, [broken, retryTick, valid])

  // 绝对 http(s)/data: 或站内相对路径（/api/tasks/... 资产流）都算有效 src；其余（空/假 key）→ 占位
  if (!valid || broken) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1 bg-raised text-ink3">
        <span className="text-[9px] leading-none opacity-70">未生成</span>
        <span className="font-mono text-[10px] opacity-50">{index}</span>
      </div>
    )
  }
  return (
    <img
      key={`${url}:${retryTick}`}
      src={url}
      alt={`镜头 ${index}`}
      className="size-full object-cover"
      onLoad={() => setLoaded(true)}
      onError={() => setBroken(true)}
    />
  )
}

export default function NodeVisual({
  statuses,
  shots,
  staleShots,
  shotBusy,
  freeReruns,
  mode,
  getRealCandidates,
  onCandidateSelect,
  onShotRerun,
  onRequestRerun,
  onCandidateSwitched,
  imageRefreshToken = 0,
}: {
  statuses: Record<StepKey, StepStatus>
  shots: Shot[]
  staleShots: Record<'L4' | 'L5' | 'L6', Set<number>>
  shotBusy: Set<number>
  freeReruns: number
  mode: GenMode
  /** real 模式：取该镜后端候选（id=minio_key，选中回传）。 */
  getRealCandidates?: (shotIndex: number) => RealCandidate[]
  /** real 模式：选用候选（op=select）。 */
  onCandidateSelect?: (shotIndex: number, candidateKey: string) => void
  onShotRerun: (index: number, step?: 'L4' | 'L5' | 'L6') => void
  onRequestRerun: (from: StepKey) => void
  onCandidateSwitched: (index: number) => void
  /** 真实任务中，每次成功详情轮询均重新尝试已失败的同 URL 缩略图。 */
  imageRefreshToken?: number
}) {
  const [sel, setSel] = useState(3)
  const shot = shots.find((s) => s.index === sel) ?? shots[0]
  const [selectedCand, setSelectedCand] = useState<Record<number, string>>({})
  const [extra, setExtra] = useState<Record<number, Candidate[]>>({})
  const [regenIds, setRegenIds] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<{ src: string; candId: string } | null>(null)

  // 任务未运行（无 storyboard）→ shots 为空 → 直接展示空态，避免 shot.index TypeError 黑屏
  if (!shot) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-[10px] border border-line bg-raised px-6 py-14 text-center">
        <p className="text-sm font-medium text-ink2">任务尚未生成分镜 · 先运行 L1 脚本/L2 分镜</p>
        <p className="text-xs text-ink3">semi 模式请在任务顶部点击「开始运行」，跑完 L3 后这里会展示每镜画面与候选图</p>
      </div>
    )
  }

  const realList = getRealCandidates ? getRealCandidates(shot.index) : null
  const candidates = realList ?? [...buildCandidates(shot), ...(extra[shot.index] ?? [])]
  const activeCand = realList
    ? (realList.find((c) => c.selected)?.id ?? selectedCand[shot.index] ?? 'base')
    : (selectedCand[shot.index] ?? 'base')

  const choose = (candId: string) => {
    if (candId === activeCand) return
    if (onCandidateSelect) {
      void onCandidateSelect(shot.index, candId)
      toast.success(`镜头 ${shot.index} 已切换候选图`)
      return
    }
    setSelectedCand((m) => ({ ...m, [shot.index]: candId }))
    toast.success(`镜头 ${shot.index} 已切换候选图`)
    onCandidateSwitched(shot.index)
  }

  const regen = (cand: Candidate) => {
    if (onCandidateSelect) {
      // real：后端无单候选变体端点 → 整镜 L4 重生成
      onShotRerun(shot.index)
      return
    }
    const key = `${shot.index}:${cand.id}`
    setRegenIds((s) => new Set(s).add(key))
    setTimeout(() => {
      setRegenIds((s) => {
        const n = new Set(s)
        n.delete(key)
        return n
      })
      // mock：重生成产出一个新的滤镜变体并选中
      const nv: Candidate = {
        id: `r${Date.now()}`,
        src: cand.src,
        filter: VARIANT_FILTERS[Math.floor(Math.random() * VARIANT_FILTERS.length)],
        label: '重生成变体',
      }
      setExtra((m) => ({ ...m, [shot.index]: [...(m[shot.index] ?? []), nv] }))
      setSelectedCand((m) => ({ ...m, [shot.index]: nv.id }))
      toast.success(`镜头 ${shot.index} 候选图已重生成`)
    }, 1400)
  }

  const uploadRef = () => {
    if (onCandidateSelect) {
      toast.info('上传参考图暂未接入 real 模式')
      return
    }
    const nv: Candidate = {
      id: `u${Date.now()}`,
      src: shot.image,
      filter: VARIANT_FILTERS[2],
      label: '上传参考图',
    }
    setExtra((m) => ({ ...m, [shot.index]: [...(m[shot.index] ?? []), nv] }))
    toast.success('参考图已加入候选（mock 入列）')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部镜头胶片条 */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollSnapType: 'x mandatory' }}>
        {shots.map((s) => {
          const active = s.index === sel
          const stale = staleShots.L4.has(s.index)
          return (
            <button
              key={s.index}
              type="button"
              onClick={() => {
                // 单击：选中镜头（切换主预览）
                setSel(s.index)
              }}
              onDoubleClick={() => {
                // 双击：放大查看大图
                setLightbox({ src: s.image, candId: 'base' })
              }}
              style={{ scrollSnapAlign: 'start' }}
              className={cn(
                'relative h-[114px] w-16 shrink-0 overflow-hidden rounded-md border-2 transition',
                active ? 'border-brand' : 'border-line hover:border-linestrong',
              )}
            >
              <ShotThumb src={s.image} index={s.index} refreshToken={imageRefreshToken} />
              <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 font-mono text-[10px] text-white">
                {s.index}
              </span>
              {stale && (
                <span
                  className="stale-stripes absolute top-0 right-0 rounded-bl-md px-1 py-0.5 font-mono text-[9px] font-semibold text-stale"
                  style={{ border: '1px dashed rgba(251,146,60,.7)', background: 'rgba(8,8,13,.7)' }}
                  title={`镜头 ${s.index} 的下游待重跑`}
                >
                  S
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* L4 候选图区 */}
      <SectionCard
        caption={<>L4 · 逐镜生图 · 镜头 {shot.index}</>}
        running={statuses.L4 === 'running' || shotBusy.has(shot.index)}
        stale={staleShots.L4.has(shot.index)}
        right={
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={shotBusy.has(shot.index)}
              className="border-line bg-raised text-ink2 hover:text-ink"
              onClick={() => onShotRerun(shot.index)}
            >
              <RotateCw className={cn('size-3.5', shotBusy.has(shot.index) && 'animate-spin')} />
              单镜重生成
            </Button>
            <RerunControl step="L4" freeReruns={freeReruns} mode={mode} onRequest={onRequestRerun} label="全量重生成" />
          </>
        }
      >
        {staleShots.L4.has(shot.index) && (
          <div className="mb-3">
            <AmberBar>镜头 {shot.index} 的画面 prompt 已修改 · 本镜 L4/L6 待重跑</AmberBar>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {candidates.map((c, i) => {
            const activeC = activeCand === c.id
            const busy = regenIds.has(`${shot.index}:${c.id}`)
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05, duration: 0.24 }}
                className={cn(
                  'group relative overflow-hidden rounded-[10px] border-2 bg-canvas transition-colors',
                  activeC ? 'border-ok' : 'border-line hover:border-linestrong',
                )}
              >
                <div className="relative aspect-[9/16] overflow-hidden">
                  <img
                    src={c.src}
                    alt={c.label}
                    className="size-full cursor-zoom-in object-cover"
                    style={{ filter: c.filter }}
                    onClick={() => setLightbox({ src: c.src, candId: c.id })}
                  />
                  {busy && <div className="shimmer-sweep animate-shimmer absolute inset-0" />}
                  {/* hover 底部操作条 */}
                  <div className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-1 bg-black/70 py-1.5 backdrop-blur-sm transition-transform group-hover:translate-y-0">
                    {!activeC && (
                      <button type="button" onClick={() => choose(c.id)} className="rounded px-2 py-1 text-xs text-ok hover:bg-white/10">
                        选用
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setLightbox({ src: c.src, candId: c.id })}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-ink hover:bg-white/10"
                    >
                      <Search className="size-3" />
                      放大
                    </button>
                    <button
                      type="button"
                      onClick={() => regen(c)}
                      disabled={busy}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-ink hover:bg-white/10 disabled:opacity-50"
                    >
                      <RotateCw className={cn('size-3', busy && 'animate-spin')} />
                      重生成
                    </button>
                  </div>
                  {activeC && (
                    <motion.span
                      layoutId={`cand-inuse-${shot.index}`}
                      className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-ok/90 px-2 py-0.5 text-[10px] font-semibold text-black"
                    >
                      <Check className="size-3" strokeWidth={3} />
                      使用中
                    </motion.span>
                  )}
                </div>
                <p className="truncate px-2 py-1.5 text-center font-mono text-[10px] text-ink3">{c.label}</p>
              </motion.div>
            )
          })}
          {/* 上传参考图（紧凑小按钮） */}
          <button
            type="button"
            onClick={uploadRef}
            className="flex items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line px-3 py-2 text-xs text-ink3 transition hover:border-brand-strong hover:text-brand-strong"
          >
            <Upload className="size-4" />
            <span>上传参考图</span>
          </button>
        </div>
      </SectionCard>

      <Lightbox
        open={lightbox !== null}
        onOpenChange={(v) => !v && setLightbox(null)}
        src={lightbox?.src ?? shot.image}
        title={`镜头 ${shot.index} · 候选放大`}
        prompt={shot.prompt}
        actionLabel="设为本镜产物"
        onAction={() => {
          if (lightbox) choose(lightbox.candId)
          setLightbox(null)
        }}
      />
    </div>
  )
}
