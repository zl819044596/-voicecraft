/**
 * Landing 营销页（PIPELINE_TASK_42 阶段 A）：海外工具站门面。
 * Navbar(锚点+语言切换) → Hero(创建输入框) → How it works → Features →
 * Pricing(占位) → FAQ → Footer。深色主题沿用现有 design tokens。
 * 未登录点 [Create Video] 跳 /login；已登录跳 /app/quick（脚本以 ?script= 预填）。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, ChevronDown, Clapperboard, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDemo } from '@/lib/demo'
import { useI18n } from '@/lib/i18n'
import type { Lang } from '@/lib/i18n'
import { get } from '@/lib/api'
import type { MeResponse } from '@/lib/types'

const SAMPLE_SHOTS = [
  '/shot-01.png',
  '/shot-02.png',
  '/shot-03.png',
  '/shot-04.png',
  '/shot-05.png',
  '/shot-06.png',
  '/shot-07.png',
  '/shot-08.png',
]

function LangSwitch() {
  const { locale, setLocale } = useI18n()
  return (
    <div className="flex rounded-md border border-line bg-surface p-0.5 text-xs">
      {(
        [
          { id: 'en', label: 'EN' },
          { id: 'zh', label: '中文' },
        ] as const
      ).map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => setLocale(l.id as Lang)}
          className={cn(
            'rounded px-2 py-1 font-mono transition-colors',
            locale === l.id ? 'bg-press text-ink' : 'text-ink3 hover:text-ink',
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-surface transition-colors', open ? 'border-brand/40' : 'border-line')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-medium text-ink">{q}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-ink3 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <p className="border-t border-line/60 px-5 pt-3 pb-4 text-[13px] leading-6 text-ink2">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const { mode, authed, setAuthed, setCredits, setTrack, setUser } = useDemo()
  const { t, dict } = useI18n()
  const [checking, setChecking] = useState(mode === 'real')
  const [script, setScript] = useState('')

  /* real 模式软校验会话：决定 [Create Video] 落点（/login 或 /app/quick）。 */
  useEffect(() => {
    if (mode !== 'real') {
      setChecking(false)
      return
    }
    let cancelled = false
    get<MeResponse>('/auth/me', { authRedirect: false })
      .then((me) => {
        if (cancelled) return
        setUser(me.user)
        setCredits(me.credits.credits + me.credits.trial_credits)
        setTrack('managed')
        setAuthed(true)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, setAuthed, setCredits, setTrack, setUser])

  const isAuthed = authed

  const onCreate = () => {
    const next = script.trim() ? `/app/quick?script=${encodeURIComponent(script.trim())}` : '/app/quick'
    if (isAuthed) navigate(next)
    else navigate(`/login?next=${encodeURIComponent(next)}`)
  }

  const dictSteps = dict.how.steps
  const dictFeatures = dict.features.items
  const dictPlans = dict.pricing.plans
  const dictFaqs = dict.faq.items

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      {/* ================= Navbar ================= */}
      <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 lg:px-6">
          <a href="/" className="flex shrink-0 items-center gap-2.5">
            <img src="/logo.svg" alt="AI Video Studio" className="size-8" />
            <span className="font-display text-[15px] font-semibold text-ink">AI Video Studio</span>
          </a>
          <nav className="hidden items-center gap-1 md:flex">
            {[
              { id: 'features', label: t('nav.features') },
              { id: 'pricing', label: t('nav.pricing') },
              { id: 'faq', label: t('nav.faq') },
            ].map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => scrollTo(n.id)}
                className="rounded-md px-3 py-1.5 text-sm text-ink2 transition-colors hover:bg-raised hover:text-ink"
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2.5">
            <LangSwitch />
            {isAuthed ? (
              <button
                type="button"
                onClick={() => navigate('/app')}
                className="flex h-9 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-white transition hover:bg-brand-strong"
              >
                {t('nav.openApp')}
                <ArrowRight className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/login')}
                disabled={checking}
                className="flex h-9 items-center gap-1.5 rounded-md border border-line px-4 text-sm font-medium text-ink transition hover:border-linestrong hover:text-ink"
              >
                {checking && <Loader2 className="size-3.5 animate-spin" />}
                {t('nav.signIn')}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ================= Hero ================= */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(700px 400px at 30% 0%, rgba(124,92,255,.18), transparent 65%), radial-gradient(600px 400px at 80% 10%, rgba(45,212,191,.08), transparent 65%)',
          }}
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pt-20 pb-16 text-center lg:px-6 lg:pt-28 lg:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2 rounded-full border border-brand/40 bg-brand-soft px-3.5 py-1.5 text-xs font-medium text-brand-strong"
          >
            <Sparkles className="size-3.5" />
            AI short video generator · storyboard-first
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="font-display mt-6 max-w-3xl text-[34px] leading-[1.15] font-semibold tracking-tight text-ink sm:text-5xl"
          >
            {t('hero.title')}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12 }}
            className="mt-5 max-w-2xl text-[15px] leading-7 text-ink2"
          >
            {t('hero.subtitle')}
          </motion.p>

          {/* 创建输入框 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2 }}
            className="mt-9 flex w-full max-w-2xl flex-col gap-3 sm:flex-row"
          >
            <div className="relative flex-1">
              <input
                value={script}
                onChange={(e) => setScript(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onCreate()}
                placeholder={t('hero.placeholder')}
                className="h-12 w-full rounded-md border border-line bg-surface pr-3 pl-4 text-sm text-ink placeholder:text-ink3 focus:border-brand focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={onCreate}
              className="shadow-glow flex h-12 items-center justify-center gap-2 rounded-md bg-brand px-6 text-sm font-semibold text-white transition-all hover:bg-brand-strong hover:shadow-[0_0_32px_rgba(124,92,255,.5)] active:scale-[0.98]"
            >
              <Wand2 className="size-4" />
              {t('hero.create')}
              <ArrowRight className="size-4" />
            </button>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="mt-3 text-xs text-ink3"
          >
            {t('hero.guestHint')}
          </motion.p>

          {/* 成片缩略图预览条 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-14 w-full max-w-3xl"
          >
            <div className="flex items-end justify-between gap-2">
              {SAMPLE_SHOTS.map((s, i) => (
                <motion.div
                  key={s}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.4 + i * 0.05 }}
                  className="relative flex-1 overflow-hidden rounded-md border border-line"
                  style={{ aspectRatio: '9/16' }}
                >
                  <img src={s} alt={`Storyboard shot ${i + 1}`} className="size-full object-cover" />
                  <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 font-mono text-[9px] text-white">
                    {i + 1}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================= How it works ================= */}
      <section id="how" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 lg:px-6">
          <div className="text-center">
            <p className="font-mono text-xs font-semibold tracking-widest text-brand-strong uppercase">{t('how.kicker')}</p>
            <h2 className="font-display mt-2 text-3xl font-semibold text-ink">{t('how.title')}</h2>
            <p className="mt-3 text-sm text-ink3">{t('how.subtitle')}</p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {dictSteps.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                className="relative rounded-lg border border-line bg-surface p-5"
              >
                <span className="font-display text-4xl font-semibold text-brand/60">{i + 1}</span>
                <h3 className="mt-3 text-[15px] font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-5 text-ink2">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= Features ================= */}
      <section id="features" className="scroll-mt-20 border-t border-line bg-surface/30">
        <div className="mx-auto max-w-6xl px-4 py-20 lg:px-6">
          <div className="text-center">
            <p className="font-mono text-xs font-semibold tracking-widest text-brand-strong uppercase">{t('features.kicker')}</p>
            <h2 className="font-display mt-2 text-3xl font-semibold text-ink">{t('features.title')}</h2>
            <p className="mt-3 text-sm text-ink3">{t('features.subtitle')}</p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dictFeatures.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.3, delay: (i % 3) * 0.06 }}
                className="rounded-lg border border-line bg-surface p-6"
              >
                <span className="flex size-10 items-center justify-center rounded-md border border-brand/40 bg-brand-soft">
                  <Check className="size-5 text-brand-strong" strokeWidth={3} />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-ink2">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= Pricing ================= */}
      <section id="pricing" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 lg:px-6">
          <div className="text-center">
            <p className="font-mono text-xs font-semibold tracking-widest text-brand-strong uppercase">{t('pricing.kicker')}</p>
            <h2 className="font-display mt-2 text-3xl font-semibold text-ink">{t('pricing.title')}</h2>
            <p className="mt-3 text-sm text-ink3">{t('pricing.subtitle')}</p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {dictPlans.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.3, delay: i * 0.08 }}
                className={cn(
                  'relative flex flex-col rounded-lg border p-6',
                  p.popular ? 'border-brand/60 bg-brand-soft/40' : 'border-line bg-surface',
                )}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[10px] font-semibold tracking-wide text-white">
                    MOST POPULAR
                  </span>
                )}
                <h3 className="text-[15px] font-semibold text-ink">{p.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-semibold text-ink">{p.price}</span>
                  <span className="text-xs text-ink3">{p.period}</span>
                </div>
                <p className="mt-2 text-[13px] text-ink2">{p.desc}</p>
                <ul className="mt-5 flex flex-1 flex-col gap-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-ink2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-brand-strong" strokeWidth={3} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={onCreate}
                  className={cn(
                    'mt-6 h-10 w-full rounded-md text-sm font-medium transition-all',
                    p.popular
                      ? 'bg-brand text-white hover:bg-brand-strong'
                      : 'border border-line text-ink hover:border-linestrong hover:text-ink',
                  )}
                >
                  {t('pricing.cta')}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section id="faq" className="scroll-mt-20 border-t border-line bg-surface/30">
        <div className="mx-auto max-w-3xl px-4 py-20 lg:px-6">
          <div className="text-center">
            <p className="font-mono text-xs font-semibold tracking-widest text-brand-strong uppercase">{t('faq.kicker')}</p>
            <h2 className="font-display mt-2 text-3xl font-semibold text-ink">{t('faq.title')}</h2>
          </div>
          <div className="mt-10 flex flex-col gap-3">
            {dictFaqs.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ================= Footer ================= */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row lg:px-6">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="" className="size-7" />
            <div>
              <p className="font-display text-sm font-semibold text-ink">AI Video Studio</p>
              <p className="text-xs text-ink3">{t('footer.tagline')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-ink3">
            {[
              { id: 'features', label: t('footer.links.features') },
              { id: 'pricing', label: t('footer.links.pricing') },
              { id: 'faq', label: t('footer.links.faq') },
              { to: '/app', label: t('footer.links.dashboard') },
              { to: '/app/quick', label: t('footer.links.create') },
            ].map((l, i) =>
              'to' in l && l.to ? (
                <button key={i} type="button" onClick={() => navigate(l.to as string)} className="transition-colors hover:text-ink">
                  {l.label}
                </button>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => 'id' in l && scrollTo(l.id as string)}
                  className="transition-colors hover:text-ink"
                >
                  {l.label}
                </button>
              ),
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-ink3">
            <Clapperboard className="size-3.5" />
            <span>{t('footer.copyright')} · {t('footer.rights')}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
