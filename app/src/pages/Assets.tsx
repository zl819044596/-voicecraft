import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Image as ImageIcon, Loader2, Music, Pause, Play, Plus, Upload, Video } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import ConfirmDelete from '@/components/library/ConfirmDelete'
import { PRESET_ASSETS, nextId } from '@/components/library/data'
import type { Asset, AssetKind } from '@/components/library/data'
import { del, post } from '@/lib/api'
import { useDemo } from '@/lib/demo'
import { useApiList } from '@/lib/use-api-data'
import type { MediaAsset } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type KindFilter = 'all' | AssetKind

const TABS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'audio', label: '音频' },
  { id: 'video', label: '视频' },
]

/* ---------- 迷你 WaveformPlayer（design.md §5.3，音频卡用） ---------- */

function MiniWaveform({ seed, playing }: { seed: string; playing: boolean }) {
  const bars = useMemo(() => {
    let h = 0
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 997
    return Array.from({ length: 36 }, (_, i) => {
      h = (h * 31 + i * 17) % 997
      return 20 + (h % 70)
    })
  }, [seed])
  return (
    <div className="flex h-9 items-center gap-[2px]">
      {bars.map((v, i) => (
        <span
          key={i}
          className="w-[2px] rounded-full transition-colors duration-150"
          style={{
            height: `${v}%`,
            background: playing ? 'rgba(124,92,255,.7)' : 'var(--line-strong)',
            transitionDelay: playing ? `${i * 40}ms` : '0ms',
          }}
        />
      ))}
    </div>
  )
}

/* ---------- 素材卡 ---------- */

function AssetCard({
  asset,
  playing,
  onTogglePlay,
  onDownload,
  onDelete,
  index,
}: {
  asset: Asset
  playing: boolean
  onTogglePlay: () => void
  onDownload: () => void
  onDelete: () => void
  index: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  const media = (() => {
    if (asset.kind === 'image') {
      return (
        <div className="aspect-square overflow-hidden bg-raised">
          {asset.src ? (
            <img
              src={asset.src}
              alt={asset.name}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <div
              className="flex size-full items-center justify-center transition-transform duration-300 group-hover:scale-[1.04]"
              style={{
                background: `linear-gradient(135deg, hsl(${asset.hue ?? 258} 45% 16%), hsl(${(asset.hue ?? 258) + 40} 40% 9%))`,
                boxShadow: `inset 0 0 0 1px hsl(${asset.hue ?? 258} 60% 40% / .3)`,
              }}
            >
              <ImageIcon className="size-7" style={{ color: `hsl(${asset.hue ?? 258} 65% 60%)` }} />
            </div>
          )}
        </div>
      )
    }
    if (asset.kind === 'audio') {
      return (
        <div className="relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden bg-raised px-4">
          <button
            type="button"
            onClick={onTogglePlay}
            title={playing ? '暂停' : '播放（2s 演示）'}
            className="z-10 flex size-10 items-center justify-center rounded-full bg-brand text-white shadow-glow transition hover:bg-brand-strong"
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </button>
          <MiniWaveform seed={asset.id} playing={playing} />
          <span className="font-mono text-xs text-ink3">{asset.duration}</span>
        </div>
      )
    }
    // video
    return (
      <div
        className="relative aspect-[9/16] overflow-hidden bg-raised"
        onMouseEnter={() => {
          if (asset.videoSrc) void videoRef.current?.play().catch(() => {})
        }}
        onMouseLeave={() => {
          videoRef.current?.pause()
          if (videoRef.current) videoRef.current.currentTime = 0
        }}
      >
        {asset.videoSrc ? (
          <video
            ref={videoRef}
            src={asset.videoSrc}
            poster={asset.src}
            muted
            loop
            playsInline
            className="size-full object-cover"
          />
        ) : (
          <img
            src={asset.src}
            alt={asset.name}
            className="size-full object-cover transition-transform duration-300 group-hover:animate-kenburns group-hover:scale-[1.04]"
            style={{ animationDuration: '6s' }}
          />
        )}
        {/* 中央播放圈 */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0">
          <span className="flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/45 backdrop-blur">
            <Play className="size-4 translate-x-px text-white" />
          </span>
        </div>
        {/* 时长角标 */}
        <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[11px] text-white">
          {asset.duration}
        </span>
      </div>
    )
  })()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.26, delay: index * 0.04 }}
      className="group relative overflow-hidden rounded-[10px] border border-line bg-surface transition-colors hover:border-linestrong"
    >
      {media}
      {/* 名称 + meta */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-ink2">{asset.name}</p>
          <p className="font-mono text-[11px] text-ink3">
            {asset.meta}
            {asset.duration && asset.kind !== 'video' ? ` · ${asset.duration}` : ''}
          </p>
        </div>
        {asset.badge && (
          <span
            title={asset.badge === 'BGM' ? '可在成片设置中选用' : '音效素材'}
            className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px]"
            style={
              asset.badge === 'BGM'
                ? { color: 'var(--managed)', background: 'rgba(251,191,36,.12)' }
                : { color: 'var(--mode-static)', background: 'rgba(56,189,248,.12)' }
            }
          >
            {asset.badge}
          </span>
        )}
      </div>
      {/* hover 底部操作条 */}
      <div className="absolute inset-x-0 bottom-0 flex translate-y-full justify-end gap-1 bg-gradient-to-t from-black/85 to-transparent p-2 pt-6 transition-transform duration-200 group-hover:translate-y-0">
        <button
          type="button"
          onClick={onDownload}
          title="下载"
          className="rounded-md bg-press/90 p-1.5 text-ink2 transition hover:text-ink"
        >
          <Download className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="删除"
          className="rounded-md bg-press/90 p-1.5 text-ink2 transition hover:bg-err/20 hover:text-err"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </div>
    </motion.div>
  )
}

/* ---------- real 数据映射 ---------- */

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function hueFromId(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

/** 后端素材（MediaAsset）→ 页面渲染模型；仅 http(s) url 可直接作 <img>/<video> src */
function mapApiAsset(a: MediaAsset): Asset {
  const kind = a.type
  const meta = a.meta ?? {}
  const ext = a.name.split('.').pop()?.toUpperCase() || 'FILE'
  const isHttp = /^https?:\/\//i.test(a.url)
  return {
    id: a.id,
    kind,
    name: a.name,
    meta: `${ext}${a.size != null ? ` · ${fmtBytes(a.size)}` : ''}`,
    src: isHttp ? a.url : undefined,
    hue: hueFromId(a.id),
    duration: typeof meta.duration === 'string' ? meta.duration : undefined,
    badge: meta.badge === 'BGM' ? 'BGM' : meta.badge === 'SFX' ? 'SFX' : undefined,
  }
}

/* ---------- 页面 ---------- */

export default function Assets() {
  const { mode } = useDemo()
  const real = mode === 'real'
  const [assets, setAssets] = useState<Asset[]>(PRESET_ASSETS)
  const [tab, setTab] = useState<KindFilter>('all')
  const list = useApiList<MediaAsset>('/assets', { size: 100, type: tab === 'all' ? undefined : tab })
  const [dragOver, setDragOver] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadName, setUploadName] = useState('brand-logo.png')
  const [uploadKind, setUploadKind] = useState<AssetKind>('image')
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<Asset | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (playTimer.current) clearTimeout(playTimer.current)
  }, [])

  // real 模式数据源来自 API（tab 切换由 useApiList 的 query 变化重拉）
  const shownAssets = real ? (list.items ?? []).map(mapApiAsset) : assets

  const counts = useMemo(() => {
    const m: Record<KindFilter, number> = { all: shownAssets.length, image: 0, audio: 0, video: 0 }
    for (const a of shownAssets) m[a.kind] += 1
    return m
  }, [shownAssets])

  const filtered = useMemo(() => shownAssets.filter((a) => tab === 'all' || a.kind === tab), [shownAssets, tab])

  const togglePlay = (id: string) => {
    if (playTimer.current) clearTimeout(playTimer.current)
    if (playingId === id) {
      setPlayingId(null)
      return
    }
    setPlayingId(id)
    playTimer.current = setTimeout(() => setPlayingId(null), 2000)
  }

  const inferKind = (name: string): AssetKind => {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    if (['mp3', 'wav', 'aac', 'm4a', 'ogg'].includes(ext)) return 'audio'
    if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return 'video'
    return 'image'
  }

  const startUpload = (name?: string) => {
    const fileName = name?.trim() || uploadName.trim() || 'brand-logo.png'
    setUploadName(fileName)
    setUploadKind(inferKind(fileName))
    setUploading(true)
  }

  const finishUpload = async () => {
    const kind = uploadKind
    const name = uploadName.trim() || 'brand-logo.png'
    if (real) {
      try {
        // 前端仅录入素材元信息：url 用 MinIO 对象 key 占位（users/ 前缀），满足后端 URL_RE
        await post('/assets', {
          type: kind,
          name,
          url: `users/upload/${encodeURIComponent(name)}`,
          size: 0,
          meta: {
            hue: hueFromId(`asset-${name}`),
            ...(kind === 'audio' ? { duration: '0:12' } : kind === 'video' ? { duration: '0:03' } : {}),
          },
        })
        toast.success(`已上传 ${name}`)
        setUploading(false)
        setUploadOpen(false)
        setUploadName('brand-logo.png')
        list.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '上传失败')
        setUploading(false)
      }
      return
    }
    const asset: Asset = {
      id: nextId('asset'),
      kind,
      name,
      meta:
        kind === 'image'
          ? `${(name.split('.').pop() || 'png').toUpperCase()} · 0.6 MB`
          : kind === 'audio'
            ? `${(name.split('.').pop() || 'mp3').toUpperCase()} · 1.0 MB`
            : `${(name.split('.').pop() || 'mp4').toUpperCase()} · 2.0 MB`,
      duration: kind === 'audio' ? '0:12' : kind === 'video' ? '0:03' : undefined,
      hue: [258, 174, 32, 200][assets.length % 4],
      badge: kind === 'audio' ? 'SFX' : undefined,
    }
    setAssets((prev) => [asset, ...prev])
    setUploading(false)
    setUploadOpen(false)
    setUploadName('brand-logo.png')
    toast.success(`已上传 ${asset.name}`)
  }

  return (
    <div>
      <PageHeader
        title="素材库"
        description="管理你的品牌素材 · 在任务中复用，保持一致性"
        actions={
          <Button className="bg-brand text-white hover:bg-brand-strong" onClick={() => setUploadOpen(true)}>
            <Plus className="size-4" /> 上传素材
          </Button>
        }
      />

      {/* 上传 dropzone */}
      <button
        type="button"
        onClick={() => setUploadOpen(true)}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const name = e.dataTransfer.files?.[0]?.name
          setUploadOpen(true)
          if (name) {
            setUploadName(name)
            setUploadKind(inferKind(name))
          }
          toast.info(name ? `已接收文件 ${name}（前端模拟）` : '已接收拖入文件（前端模拟）')
        }}
        className={cn(
          'mb-5 flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed transition-all duration-150',
          dragOver ? 'border-brand bg-brand-soft' : 'border-linestrong bg-surface hover:border-brand hover:bg-brand-soft',
        )}
      >
        <motion.span animate={{ y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
          <Upload className="size-5 text-brand-strong" />
        </motion.span>
        <span className="text-sm text-ink2">拖拽文件到此处，或点击上传</span>
        <span className="text-xs text-ink3">
          <span className="font-mono">image / audio / video</span> · 仅自己可见
        </span>
      </button>

      {/* 类型 Tabs */}
      <div className="mb-4 flex gap-1 border-b border-line">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'relative flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors',
                active ? 'text-ink' : 'text-ink3 hover:text-ink2',
              )}
            >
              {t.label}
              <span className="rounded-full bg-press px-1.5 py-0.5 font-mono text-[11px] leading-none text-ink2">
                {counts[t.id]}
              </span>
              {active && (
                <motion.span
                  layoutId="asset-tab-underline"
                  className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand"
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* 素材网格 */}
      {real && list.loading && !list.items ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-ink3" />
        </div>
      ) : real && list.error ? (
        <EmptyState title="素材库加载失败" description={list.error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="还没有素材"
          description="上传图片、音频或视频，在任务中复用"
          actionLabel="＋ 上传素材"
          onAction={() => setUploadOpen(true)}
        />
      ) : (
        <motion.div layout className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.map((a, i) => (
              <AssetCard
                key={a.id}
                asset={a}
                index={i}
                playing={playingId === a.id}
                onTogglePlay={() => togglePlay(a.id)}
                onDownload={() => toast.info('已开始下载（模拟）')}
                onDelete={() => setDeleting(a)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* 上传 Dialog（前端 mock） */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(v) => {
          if (!uploading) setUploadOpen(v)
        }}
      >
        <DialogContent className="border-line bg-raised sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-ink">上传素材</DialogTitle>
            <DialogDescription className="text-ink3">
              前端模拟上传 · 文件仅保留在内存预览，不会真实传输 · 素材仅自己可见
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-ink2">文件名（模拟）</span>
              <Input
                value={uploadName}
                disabled={uploading}
                onChange={(e) => {
                  setUploadName(e.target.value)
                  setUploadKind(inferKind(e.target.value))
                }}
                className="border-line bg-surface font-mono text-[13px] text-ink"
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-ink2">类型</span>
              <Select value={uploadKind} onValueChange={(v) => setUploadKind(v as AssetKind)} disabled={uploading}>
                <SelectTrigger className="border-line bg-surface text-ink">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-line bg-raised">
                  <SelectItem value="image">
                    <span className="flex items-center gap-1.5">
                      <ImageIcon className="size-3.5" /> 图片 image
                    </span>
                  </SelectItem>
                  <SelectItem value="audio">
                    <span className="flex items-center gap-1.5">
                      <Music className="size-3.5" /> 音频 audio
                    </span>
                  </SelectItem>
                  <SelectItem value="video">
                    <span className="flex items-center gap-1.5">
                      <Video className="size-3.5" /> 视频 video
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {uploading && (
              <div className="mt-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-press">
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 1.2, ease: 'easeInOut' }}
                    onAnimationComplete={finishUpload}
                    className="h-full rounded-full bg-gradient-to-r from-brand to-byok"
                  />
                </div>
                <p className="mt-1.5 font-mono text-xs text-ink3">uploading · {uploadName}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={uploading}
              onClick={() => setUploadOpen(false)}
              className="border-line bg-transparent text-ink2 hover:bg-press hover:text-ink"
            >
              取消
            </Button>
            <Button
              disabled={uploading}
              className="bg-brand text-white hover:bg-brand-strong"
              onClick={() => startUpload()}
            >
              <Upload className="size-4" /> {uploading ? '上传中…' : '开始上传'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        name={deleting?.name ?? ''}
        onConfirm={async () => {
          if (!deleting) return
          if (real) {
            try {
              await del(`/assets?id=${deleting.id}`)
              toast.success(`已删除素材「${deleting.name}」`)
              setDeleting(null)
              list.reload()
            } catch (e) {
              toast.error(e instanceof Error ? e.message : '删除失败')
            }
            return
          }
          setAssets((prev) => prev.filter((a) => a.id !== deleting.id))
          toast.success(`已删除素材「${deleting.name}」`)
          setDeleting(null)
        }}
      />
    </div>
  )
}

export { Assets as AssetsPage }
