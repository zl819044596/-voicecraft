import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

const BARS = 36

/** WaveformPlayer 音频条（design.md §5.3）：CSS 随机柱阵列；无 src 时播放 2s 示例，有 src 播放真实试听音频 */
export default function WaveformPlayer({
  label = '试听示例',
  duration = 2,
  src,
}: {
  label?: string
  duration?: number
  src?: string
}) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1
  const rafRef = useRef<number>(0)
  const startRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const heights = useMemo(
    () => Array.from({ length: BARS }, (_, i) => 22 + Math.abs(Math.sin(i * 1.7) * 60 + Math.cos(i * 0.9) * 18)),
    [],
  )

  // 真实试听音频（src）：用 <audio> 驱动进度，卸载时释放
  useEffect(() => {
    if (!src) return
    const audio = new Audio(src)
    audioRef.current = audio
    const onTime = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration)
    }
    const onEnd = () => {
      setPlaying(false)
      setProgress(0)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
      audioRef.current = null
    }
  }, [src])

  useEffect(() => {
    if (!playing) return
    if (src) {
      audioRef.current?.play().catch(() => {})
      return
    }
    startRef.current = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - startRef.current) / (duration * 1000))
      setProgress(p)
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setPlaying(false)
        setProgress(0)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, duration, src])

  const toggle = () => {
    if (src && playing) audioRef.current?.pause()
    setPlaying((v) => !v)
  }

  const lit = Math.round(progress * BARS)

  return (
    <div className="flex h-12 items-center gap-3 rounded-md border border-line bg-raised px-3">
      <button
        type="button"
        onClick={toggle}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-transform hover:scale-105"
        aria-label={playing ? '暂停试听' : '播放试听'}
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="ml-0.5 size-3.5" />}
      </button>
      <div className="relative flex h-9 flex-1 items-center gap-[3px] overflow-hidden">
        {heights.map((h, i) => (
          <span
            key={i}
            className={cn('w-[2px] shrink-0 rounded-full transition-colors duration-150')}
            style={{
              height: `${h}%`,
              background: i < lit ? 'var(--brand)' : 'rgba(124,92,255,.28)',
            }}
          />
        ))}
        {playing && (
          <span
            className="absolute top-0 h-full w-px bg-brand-strong shadow-glow"
            style={{ left: `${progress * 100}%` }}
          />
        )}
      </div>
      <span className="shrink-0 font-mono text-xs text-ink3">
        {label} · 0:0{duration}
      </span>
      <span className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink3">1.0×</span>
    </div>
  )
}
