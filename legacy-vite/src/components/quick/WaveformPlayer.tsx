import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 预生成稳定的随机柱高（36 根，design.md §5.3 WaveformPlayer） */
function useBars(seed: number) {
  return useMemo(() => {
    let s = seed
    const rand = () => {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    }
    return Array.from({ length: 36 }, () => 6 + Math.round(rand() * 26))
  }, [seed])
}

/**
 * WaveformPlayer 音频条（quick 页 TTS 试听 / BGM 预览复用）：
 * 36 根 2px 柱，播放时从左到右点亮，2s 模拟播放后自动停止。
 */
export default function WaveformPlayer({
  durationLabel,
  seed = 7,
  autoPlay = false,
  onEnded,
  className,
  src,
}: {
  durationLabel: string
  seed?: number
  autoPlay?: boolean
  onEnded?: () => void
  className?: string
  /** 真实音频 URL（试听等）；缺省时走 2s 假进度（demo）。 */
  src?: string
}) {
  const bars = useBars(seed)
  const [playing, setPlaying] = useState(autoPlay)
  const [progress, setProgress] = useState(0) // 0..1
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number>(0)
  const startRef = useRef(0)

  // 真实音频：Audio 元素 + timeupdate 驱动进度；error/ended 均收尾。
  useEffect(() => {
    if (!src) return
    const a = new Audio(src)
    audioRef.current = a
    a.addEventListener('timeupdate', () => {
      if (a.duration) setProgress(a.currentTime / a.duration)
    })
    a.addEventListener('ended', () => {
      setPlaying(false)
      setProgress(0)
      onEnded?.()
    })
    a.addEventListener('error', () => {
      setPlaying(false)
      onEnded?.()
    })
    if (autoPlay) a.play().catch(() => {})
    return () => {
      a.pause()
      a.src = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (playing) a.play().catch(() => {})
    else a.pause()
  }, [playing, src])

  // 无 src：假进度（demo）
  useEffect(() => {
    if (src || !playing) return
    startRef.current = performance.now() - progress * 2000
    const tick = (now: number) => {
      const p = Math.min((now - startRef.current) / 2000, 1)
      setProgress(p)
      if (p >= 1) {
        setPlaying(false)
        setProgress(0)
        onEnded?.()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, src])

  const lit = Math.floor(progress * bars.length)

  return (
    <div className={cn('flex h-12 items-center gap-2 rounded-md border border-line bg-raised px-2.5', className)}>
      <button
        type="button"
        aria-label={playing ? '暂停试听' : '播放试听'}
        onClick={(e) => {
          e.stopPropagation()
          setPlaying((v) => !v)
        }}
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-transform hover:scale-105 active:scale-95"
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
      </button>
      <div className="flex h-8 flex-1 items-center gap-[3px] overflow-hidden">
        {bars.map((h, i) => (
          <span
            key={i}
            className="w-0.5 shrink-0 rounded-full transition-colors duration-100"
            style={{
              height: h,
              background: 'var(--brand)',
              opacity: i < lit ? 0.95 : playing && i === lit ? 0.8 : 0.35,
            }}
          />
        ))}
      </div>
      <span className="shrink-0 font-mono text-xs text-ink3">{durationLabel}</span>
    </div>
  )
}
