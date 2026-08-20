import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import gsap from 'gsap'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Loader2, Mail, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useDemo } from '@/lib/demo'
import { ApiError, get, post } from '@/lib/api'
import type { AuthLoginResponse, GoogleStartResponse, MagicLinkSentResponse, MeResponse } from '@/lib/types'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'

/* ================= 流水线节点动画带（GSAP，design.md home §2） ================= */

const NODES = ['L1', 'L1.5', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10']
const ARTIFACTS: Record<number, string> = { 2: 'script', 4: 'shots', 5: 'clips', 6: 'voice', 7: 'srt', 10: 'final.mp4 · zip' }

function PipelineBand() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const ctx = gsap.context(() => {
      const dots = Array.from(el.querySelectorAll<HTMLSpanElement>('[data-dot]'))
      const codes = Array.from(el.querySelectorAll<HTMLSpanElement>('[data-code]'))
      const tags = Array.from(el.querySelectorAll<HTMLSpanElement>('[data-tag]'))
      const light = el.querySelector<HTMLDivElement>('[data-light]')!
      const prog = el.querySelector<SVGPathElement>('[data-prog]')!
      const len = prog.getTotalLength()
      prog.style.strokeDasharray = `${len}`

      const reset = () => {
        dots.forEach((d) => {
          d.style.background = 'var(--line-strong)'
          d.style.boxShadow = 'none'
        })
        codes.forEach((c) => (c.style.color = 'var(--text-3)'))
        tags.forEach((t) => {
          t.style.opacity = '0'
          t.style.transform = 'translateX(-50%) scale(.5)'
        })
        prog.style.strokeDashoffset = `${len}`
        if (light) light.style.left = '0%'
      }
      reset()

      const state = { t: 0 }
      const popped = new Set<number>()
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 })
      tl.eventCallback('onRepeat', () => {
        popped.clear()
        reset()
      })
      tl.to(state, {
        t: 1,
        duration: NODES.length * 0.4,
        ease: 'none',
        onUpdate: () => {
          const pos = state.t * (NODES.length - 1)
          if (light) light.style.left = `${state.t * 100}%`
          prog.style.strokeDashoffset = `${len * (1 - state.t)}`
          dots.forEach((d, i) => {
            if (i <= pos && d.style.background !== 'var(--brand)') {
              d.style.background = 'var(--brand)'
              d.style.boxShadow = '0 0 10px rgba(124,92,255,.8)'
              codes[i].style.color = 'var(--text-1)'
              if (ARTIFACTS[i] && !popped.has(i)) {
                popped.add(i)
                gsap.to(tags[i], { opacity: 1, scale: 1, xPercent: -50, duration: 0.3, ease: 'back.out(2.5)' })
              }
            }
          })
        },
      })
    }, el)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={root} className="relative mt-10 h-[120px] rounded-lg border border-line bg-white/[0.03] px-6 backdrop-blur-sm">
      {/* 连线轨道 */}
      <svg className="absolute inset-x-6 top-1/2 h-2 -translate-y-1/2" preserveAspectRatio="none" viewBox="0 0 1000 8">
        <path d="M0 4 H1000" stroke="var(--line-strong)" strokeWidth="2" fill="none" />
        <path data-prog d="M0 4 H1000" stroke="var(--brand)" strokeWidth="2" fill="none" />
      </svg>
      {/* 光点 */}
      <div
        data-light
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'var(--brand-strong)', boxShadow: '0 0 14px 3px rgba(154,128,255,.8)' }}
      />
      {/* 节点 */}
      <div className="absolute inset-x-6 top-1/2 flex -translate-y-1/2 justify-between">
        {NODES.map((n, i) => (
          <div key={n} className="relative flex -translate-x-1/2 flex-col items-center first:translate-x-0 last:translate-x-0">
            {ARTIFACTS[i] && (
              <span
                data-tag
                className="absolute -top-9 left-1/2 rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-brand-strong opacity-0"
                style={{ border: '1px solid var(--line-strong)', transform: 'translateX(-50%) scale(.5)' }}
              >
                {ARTIFACTS[i]}
              </span>
            )}
            <span data-dot className="size-2.5 rounded-full" style={{ background: 'var(--line-strong)' }} />
            <span data-code className="absolute top-4 font-mono text-xs" style={{ color: 'var(--text-3)' }}>
              {n}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ================= 左侧品牌视觉区 ================= */

const HEADLINE = 'Storyboard-first. Every step under your control.'
const SUB = 'L1–L10 transparent pipeline · single-step rerun · open zip export · BYOK free'
const SELLS: { icon: string; text: string }[] = [
  { icon: '↻', text: '单步重跑 · 改一镜只重跑一镜' },
  { icon: '⇩', text: '开放导出 zip · 素材全带走' },
  { icon: '◈', text: 'BYOK $0 · 托管 $9.9 起' },
]

function LoginVisual() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const ctx = gsap.context(() => {
      gsap.from('[data-char]', { y: 24, opacity: 0, stagger: 0.02, duration: 0.7, ease: 'power3.out' })
      gsap.from('[data-word]', { y: 10, opacity: 0, stagger: 0.04, delay: 0.3, duration: 0.5, ease: 'power2.out' })
      gsap.from('[data-sell]', { y: 12, opacity: 0, stagger: 0.1, delay: 0.8, duration: 0.5, ease: 'power2.out' })
    }, el)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={root} className="relative h-60 overflow-hidden lg:h-auto lg:min-h-full">
      <img
        src="/login-bg.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover motion-safe:animate-kenburns"
      />
      {/* 深色渐变遮罩：右接登录卡片区 */}
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-canvas/30 lg:to-canvas" />

      <div className="relative z-10 flex h-full flex-col justify-between p-6 lg:p-12">
        {/* 顶部 Logo */}
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="AI Video Studio" className="size-10" />
          <span className="font-display text-xl font-semibold text-ink">AI Video Studio</span>
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-brand-strong"
            style={{ border: '1px dashed rgba(124,92,255,.5)' }}
          >
            Prototype
          </span>
        </div>

        {/* 中部标语 + 流水线（移动端隐藏） */}
        <div className="hidden max-w-xl lg:block">
          <h2 className="font-display text-4xl leading-tight font-semibold text-ink">
            {HEADLINE.split('').map((ch, i) => (
              <span key={i} data-char className="inline-block whitespace-pre">
                {ch}
              </span>
            ))}
          </h2>
          <p className="mt-4 text-[15px] text-ink2">
            {SUB.split(' ').map((w, i) => (
              <span key={i} data-word className="inline-block whitespace-pre">
                {w}{' '}
              </span>
            ))}
          </p>
          <p className="mt-2 text-[13px] text-ink3">分镜优先 · 每步可编辑可重跑 · 开放导出 · 自备 Key 全免费</p>
          <PipelineBand />
        </div>

        {/* 底部三卖点 */}
        <div className="hidden gap-6 lg:flex">
          {SELLS.map((s) => (
            <div key={s.text} data-sell className="flex items-center gap-2 text-xs text-ink2">
              <span className="font-mono text-brand-strong">{s.icon}</span>
              {s.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ================= Google 彩色 G 图标 ================= */

function GoogleIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29v-3.1H1.28a12 12 0 0 0 0 10.78l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.76c1.76 0 3.35.6 4.6 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4 3.1c.95-2.84 3.6-4.95 6.72-4.95Z" />
    </svg>
  )
}

/* ================= 右侧登录卡片（framer-motion 树） ================= */

function LoginCard() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { mode, setMode, ageConfirmed, setAgeConfirmed, setAuthed, setCredits, setTrack, setUser } = useDemo()

  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [sent, setSent] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [magicBusy, setMagicBusy] = useState(false)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [googleOpen, setGoogleOpen] = useState(false)
  const [ageOpen, setAgeOpen] = useState(false)
  const [ageChecked, setAgeChecked] = useState(false)
  /** 未确认年龄时挂起的动作（real 模式）：确认后继续。 */
  const pendingAction = useRef<'send' | 'google' | null>(null)
  /** Google OAuth 回调落在 /login 时暂存的 code+state。 */
  const googleParams = useRef<{ code: string; state: string } | null>(null)

  const next = params.get('next')

  const finish = (msg: string) => {
    setAuthed(true)
    toast.success(msg)
    navigate(next && next.startsWith('/') ? next : '/app', { replace: true })
  }

  /** 真实登录成功后的统一收尾：填充账户态 → 跳转。 */
  const onAuthed = async (msg: string) => {
    setTrack('managed')
    try {
      const me = await get<MeResponse>('/auth/me', { authRedirect: false })
      setUser(me.user)
      setCredits(me.credits.credits + me.credits.trial_credits)
    } catch {
      /* me 失败不阻塞进入工作台（AppShell 会再校验） */
    }
    finish(msg)
  }

  // ---------------------------------------------------------------------------
  // Real 模式：magic link 发送 / 验证 / Google OAuth
  // ---------------------------------------------------------------------------

  const doSendMagic = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error('请输入有效的邮箱地址')
      return
    }
    if (mode === 'demo') {
      setSent(true)
      return
    }
    if (!ageConfirmed) {
      pendingAction.current = 'send'
      setAgeChecked(false)
      setAgeOpen(true)
      return
    }
    setMagicBusy(true)
    try {
      await post<MagicLinkSentResponse>('/auth/magic-link', { email, age_confirmed: true })
      setSent(true)
      toast.success('登录链接已发送，请查收邮箱')
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setMagicBusy(false)
    }
  }

  const doVerify = async (t: string, auto = false) => {
    const trimmed = t.trim()
    if (!trimmed) {
      toast.error('请输入验证 token')
      return
    }
    setVerifyBusy(true)
    try {
      await post<AuthLoginResponse>('/auth/magic-link/verify', { token: trimmed })
      setAgeConfirmed(true)
      await onAuthed(auto ? '登录成功' : '登录成功，欢迎回来')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 410) toast.error('链接已过期，请重新发送')
        else if (err.status === 409) toast.error('该链接已被使用，请重新发送')
        else if (err.status === 400) toast.error('token 无效，请检查后重试')
        else toast.error(err.message)
      }
    } finally {
      setVerifyBusy(false)
    }
  }

  const doGoogleCallback = async (code: string, state: string) => {
    setGoogleBusy(true)
    try {
      await post<AuthLoginResponse>('/auth/google/callback', { code, state, age_confirmed: true })
      setAgeConfirmed(true)
      await onAuthed('Google 登录成功')
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setGoogleBusy(false)
    }
  }

  const startGoogle = async () => {
    if (mode === 'demo') {
      setGoogleBusy(true)
      window.setTimeout(() => {
        setGoogleBusy(false)
        setGoogleOpen(true)
      }, 900)
      return
    }
    if (!ageConfirmed) {
      pendingAction.current = 'google'
      setAgeChecked(false)
      setAgeOpen(true)
      return
    }
    setGoogleBusy(true)
    try {
      const res = await post<GoogleStartResponse>('/auth/google', {})
      window.location.href = res.authorize_url
    } catch (err) {
      setGoogleBusy(false)
      if (err instanceof ApiError) toast.error(err.message)
    }
  }

  // 挂载时处理：Google 回调 / ?token= 自动验证 / 已有会话直接进
  useEffect(() => {
    if (mode !== 'real') return
    const code = params.get('code')
    const state = params.get('state')
    if (code && state) {
      if (ageConfirmed) {
        doGoogleCallback(code, state)
      } else {
        googleParams.current = { code, state }
        setAgeChecked(false)
        setAgeOpen(true)
      }
      return
    }
    const t = params.get('token')
    if (t) {
      doVerify(t, true)
      return
    }
    let cancelled = false
    get<MeResponse>('/auth/me', { authRedirect: false })
      .then((me) => {
        if (cancelled) return
        setUser(me.user)
        setCredits(me.credits.credits + me.credits.trial_credits)
        finish('已登录')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Demo 模式：模拟授权（保留原型交互）
  // ---------------------------------------------------------------------------

  /** 通过授权后：首次 → 18+ 确认；老账号 → 直接进 */
  const afterAuth = () => {
    if (ageConfirmed) {
      finish('欢迎回来')
    } else {
      setAgeChecked(false)
      setAgeOpen(true)
    }
  }

  const pickAccount = () => {
    setGoogleOpen(false)
    afterAuth()
  }

  const clickMagicLink = () => {
    setMagicBusy(true)
    window.setTimeout(() => {
      setMagicBusy(false)
      afterAuth()
    }, 600)
  }

  const confirmAge = () => {
    setAgeConfirmed(true)
    setAgeOpen(false)
    if (mode === 'demo') {
      // 首次登录奖励：托管档 + 120 体验积分
      setTrack('managed')
      setCredits(120)
      finish('已登录 · 120 体验积分已到账')
      return
    }
    if (googleParams.current) {
      const { code, state } = googleParams.current
      googleParams.current = null
      doGoogleCallback(code, state)
      return
    }
    const action = pendingAction.current
    pendingAction.current = null
    if (action === 'send') doSendMagic()
    else if (action === 'google') startGoogle()
  }

  const skipLogin = () => {
    setMode('demo')
    setAuthed(true)
    toast.success('已进入演示模式')
    navigate('/app', { replace: true })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="w-full max-w-[400px] rounded-lg border border-line bg-surface p-8 shadow-card"
    >
      <h1 className="text-[22px] leading-[30px] font-semibold text-ink">登录工作台</h1>
      <p className="mt-1.5 text-[13px] leading-5 text-ink3">
        新用户将自动创建账号，并获赠 <span className="font-medium text-managed">120 体验积分</span>（≈ 2 条 static）
      </p>

      {/* Google 一键登录 */}
      <button
        type="button"
        onClick={startGoogle}
        disabled={googleBusy}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2.5 rounded-md bg-white text-sm font-medium text-neutral-800 transition hover:-translate-y-0.5 hover:bg-neutral-100 active:scale-[.97] disabled:opacity-70"
      >
        {googleBusy ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
        {googleBusy ? '正在跳转 Google 授权…' : 'Continue with Google'}
      </button>

      {/* 分隔线 */}
      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium text-ink3">或使用邮箱</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {/* 邮箱魔法链接 */}
      <AnimatePresence mode="wait" initial={false}>
        {sent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="rounded-md border border-line bg-raised py-3 pr-3 pl-4" style={{ borderLeft: '3px solid var(--ok)' }}>
              <p className="text-[13px] leading-5 text-ink2">
                登录链接已发送至 <span className="font-mono text-ink">{email}</span>
                <br />
                链接 15 分钟内有效、一次性
              </p>
            </div>
            {mode === 'real' ? (
              <div className="mt-3 flex flex-col gap-2">
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="粘贴 token（ml_…，本地从 docker logs 提取）"
                  className="h-10 w-full rounded-md border border-line bg-surface px-3 font-mono text-xs text-ink placeholder:text-ink3 focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => doVerify(token)}
                  disabled={verifyBusy}
                  className="relative flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm text-brand-strong transition hover:-translate-y-0.5 hover:bg-brand-soft active:scale-[.97] disabled:opacity-70"
                  style={{ border: '1.5px dashed rgba(124,92,255,.5)' }}
                >
                  {verifyBusy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                  {verifyBusy ? '正在验证链接…' : '验证登录链接 →'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={clickMagicLink}
                disabled={magicBusy}
                className="relative mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm text-brand-strong transition hover:-translate-y-0.5 hover:bg-brand-soft active:scale-[.97] disabled:opacity-70"
                style={{ border: '1.5px dashed rgba(124,92,255,.5)' }}
              >
                {magicBusy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                {magicBusy ? '正在验证链接…' : '模拟点击邮件链接 →'}
                <span className="absolute -top-2 right-2 rounded bg-brand px-1 font-mono text-[9px] font-bold text-white">DEMO</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-2 w-full text-center text-xs text-ink3 transition-colors hover:text-ink"
            >
              换个邮箱
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                doSendMagic()
              }}
              className="flex flex-col gap-3"
            >
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@studio.com"
                  className="h-11 w-full rounded-md border border-line bg-raised pr-3 pl-9 text-sm text-ink placeholder:text-ink3 focus:border-brand"
                />
              </div>
              <button
                type="submit"
                className="h-11 w-full rounded-md bg-brand text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-brand-strong active:scale-[.97]"
              >
                发送魔法链接
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 法律小字 */}
      <p className="mt-5 text-center text-xs leading-[18px] text-ink3">
        继续即表示同意{' '}
        <button type="button" className="underline hover:text-ink2" onClick={() => toast.info('原型演示：Terms 页面不在原型范围内')}>
          《Terms》
        </button>{' '}
        与{' '}
        <button type="button" className="underline hover:text-ink2" onClick={() => toast.info('原型演示：Privacy 页面不在原型范围内')}>
          《Privacy》
        </button>{' '}
        · 本平台仅限 18 岁以上用户
      </p>

      {/* 演示快捷入口 */}
      <button
        type="button"
        onClick={skipLogin}
        className="mt-4 w-full text-center text-[13px] text-ink3 transition-colors hover:text-brand-strong"
      >
        跳过登录，直接进入演示工作台 →
      </button>

      {/* Google 模拟授权小窗 */}
      <Dialog open={googleOpen} onOpenChange={setGoogleOpen}>
        <DialogContent className="max-w-sm border-line bg-raised p-0" showCloseButton={false}>
          <div className="border-b border-line px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-base text-ink">
              <GoogleIcon /> 选择账号
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-ink3">继续前往 AI Video Studio（模拟授权）</DialogDescription>
          </div>
          <button
            type="button"
            onClick={pickAccount}
            className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-press"
          >
            <img src="/avatar-user.png" alt="" className="size-9 rounded-full" />
            <span>
              <span className="block text-sm font-medium text-ink">Demo Creator</span>
              <span className="block text-xs text-ink3">demo@studio.com</span>
            </span>
          </button>
        </DialogContent>
      </Dialog>

      {/* 18+ 年龄确认弹窗（F-AUTH-3） */}
      <Dialog open={ageOpen} onOpenChange={setAgeOpen}>
        <DialogContent className="max-w-[420px] border-line bg-raised" showCloseButton={false}>
          <div className="flex flex-col items-center text-center">
            <ShieldCheck className="size-8 text-brand-strong" />
            <DialogTitle className="mt-3 text-[17px] leading-[26px] font-semibold text-ink">年龄确认</DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-[22px] text-ink2">
              AI Video Studio 仅面向年满 18 岁的用户。请确认你已年满 18 岁。
            </DialogDescription>
          </div>
          <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 text-sm text-ink">
            <Checkbox checked={ageChecked} onCheckedChange={(v) => setAgeChecked(v === true)} aria-label="我已满 18 岁" />
            我已满 18 岁
          </label>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => setAgeOpen(false)}
              className="h-10 flex-1 rounded-md border border-line text-sm text-ink2 transition-colors hover:bg-press hover:text-ink"
            >
              返回
            </button>
            <button
              type="button"
              disabled={!ageChecked}
              onClick={confirmAge}
              className="h-10 flex-1 rounded-md bg-brand text-sm font-medium text-white transition enabled:hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              确认并进入
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

/* ================= 页面 ================= */

export default function Login() {
  return (
    <div className="grid flex-1 lg:grid-cols-[55fr_45fr]">
      <LoginVisual />
      <div className="flex items-center justify-center px-6 py-12">
        <LoginCard />
      </div>
    </div>
  )
}
