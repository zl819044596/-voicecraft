import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { Check, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useDemo } from '@/lib/demo'
import { useI18n } from '@/lib/i18n'
import { API_BASE, ApiError, del, get, put } from '@/lib/api'
import type { BillingPlansResponse, MeResponse } from '@/lib/types'
import DeleteAccountDialog from '@/components/settings/DeleteAccountDialog'
import ExportDrawer from '@/components/settings/ExportDrawer'

type SectionId = 'account' | 'language' | 'privacy' | 'danger'

/** 界面语言即时切换演示：本页关键 chrome 文案双语（F-I18N-1） */
const STR = {
  zh: {
    title: '设置',
    desc: '账号、语言与数据权利',
    nav: { account: '账号', language: '语言', privacy: '隐私', danger: '危险区' },
    account: '账号资料',
    changeAvatar: '更换头像',
    nickname: '昵称',
    save: '保存',
    manageSub: '管理订阅 →',
    proNote: '订阅周期至 2025-09-12 · 月度积分 3000 不结转',
    byokNote: '$0 全功能 · 自备 Key 不计积分',
    language: '语言与地区',
    uiLang: '界面语言 users.locale',
    contentLang: '默认内容语言 content_language',
    contentLangNote: '创建任务时的默认内容语言 · 决定 L1–L3 生成语言、TTS 音色分组、字幕与导出语言',
    independence: '界面语言与内容语言相互独立 —— 中文界面也可以产出英文视频，当前演示任务即为该组合',
    privacy: '隐私与数据',
    exportTitle: '导出我的数据',
    exportDesc: '个人资料、任务/项目元数据、积分流水 · 不含明文 Key（仅 masked）',
    exportBtn: '导出数据包',
    age: '✓ 已确认年满 18 岁（2025-06-30）',
    cookie: '管理 Cookie 偏好 →',
    danger: '危险区',
    deleteDesc: '删除账号及全部关联数据（任务/项目/凭证/积分）· 此操作不可撤销',
    deleteBtn: '删除账号',
  },
  en: {
    title: 'Settings',
    desc: 'Account, language & data rights',
    nav: { account: 'Account', language: 'Language', privacy: 'Privacy', danger: 'Danger' },
    account: 'Account profile',
    changeAvatar: 'Change avatar',
    nickname: 'Nickname',
    save: 'Save',
    manageSub: 'Manage subscription →',
    proNote: 'Subscription until 2025-09-12 · 3000 monthly credits, no rollover',
    byokNote: '$0 full features · BYOK, no credit metering',
    language: 'Language & region',
    uiLang: 'Interface language users.locale',
    contentLang: 'Default content language',
    contentLangNote: 'Default content language for new tasks · drives L1–L3 generation, TTS voice groups, subtitles & exports',
    independence: 'Interface and content languages are independent — a Chinese UI can still produce English videos, as in the current demo task',
    privacy: 'Privacy & data',
    exportTitle: 'Export my data',
    exportDesc: 'Profile, task/project metadata, credit ledger · no plaintext keys (masked only)',
    exportBtn: 'Export data package',
    age: '✓ Confirmed 18+ (2025-06-30)',
    cookie: 'Manage cookie preferences →',
    danger: 'Danger zone',
    deleteDesc: 'Delete the account and all associated data (tasks/projects/credentials/credits) · irreversible',
    deleteBtn: 'Delete account',
  },
} as const

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** GET /api/account/export 返回 zip 流（apiFetch 只解析 JSON/文本，需 blob） */
async function fetchExportBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
  if (!res.ok) {
    let msg = `请求失败（${res.status}）`
    try {
      const j = (await res.json()) as { error?: { message?: string } }
      msg = j?.error?.message ?? msg
    } catch {
      /* 非 JSON 错误体忽略 */
    }
    throw new ApiError(res.status, 'EXPORT_ERROR', msg)
  }
  return res.blob()
}

/** /app/settings 账号与设置（settings.md）：资料、档位、语言独立、GDPR 导出、强确认删除 */
export default function Settings() {
  const { track, mode } = useDemo()
  const { locale, setLocale } = useI18n()
  const real = mode === 'real'
  const t = STR[locale]
  const [nickname, setNickname] = useState('Ken')
  const [contentLang, setContentLang] = useState<'en' | 'zh'>('en')
  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [activeSec, setActiveSec] = useState<SectionId>('account')
  const mainRef = useRef<HTMLDivElement>(null)
  // real 模式：账户资料（GET /api/auth/me）+ 定价档位（取月度积分）
  const [profile, setProfile] = useState<MeResponse | null>(null)
  const [plansData, setPlansData] = useState<BillingPlansResponse | null>(null)

  const SECTIONS: SectionId[] = ['account', 'language', 'privacy', 'danger']

  // real 模式：拉取会话用户 + 档位；demo 回落本地 mock
  useEffect(() => {
    if (!real) {
      setProfile(null)
      setPlansData(null)
      return
    }
    let cancelled = false
    get<MeResponse>('/auth/me')
      .then((m) => {
        if (cancelled) return
        setProfile(m)
        if (m.user.nickname) setNickname(m.user.nickname)
        if (m.user.locale === 'zh' || m.user.locale === 'en') setLocale(m.user.locale)
      })
      .catch(() => {})
    get<BillingPlansResponse>('/billing/plans')
      .then((p) => { if (!cancelled) setPlansData(p) })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real])

  // 滚动 spy：高亮当前锚点
  useEffect(() => {
    const onScroll = () => {
      let current: SectionId = 'account'
      for (const id of SECTIONS) {
        const el = document.getElementById(`sec-${id}`)
        if (el && el.getBoundingClientRect().top <= 140) current = id
      }
      setActiveSec(current)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scrollTo = (id: SectionId) =>
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const saveNickname = async () => {
    if (real) {
      try {
        await put('/account/profile', { nickname })
        toast.success(locale === 'zh' ? '昵称已更新' : 'Nickname updated')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败')
      }
      return
    }
    toast.success(locale === 'zh' ? '昵称已更新' : 'Nickname updated')
  }

  const switchLocale = async (l: 'zh' | 'en') => {
    setLocale(l)
    if (real) {
      try {
        await put('/account/profile', { locale: l })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '语言偏好保存失败')
      }
    }
    toast.success(l === 'zh' ? '界面语言已切换（即时生效并持久化）' : 'Interface language switched (applied & persisted)')
  }

  const runExport = async () => {
    setExporting(true)
    if (real) {
      try {
        const blob = await fetchExportBlob('/account/export')
        const url = URL.createObjectURL(blob)
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const name = `avs-gdpr-export-${date}.zip`
        const a = document.createElement('a')
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast.success('数据包已生成 · 已开始下载')
        setExportOpen(true)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '导出失败')
      } finally {
        setExporting(false)
      }
      return
    }
    window.setTimeout(() => {
      setExporting(false)
      toast.success('数据包已生成（模拟）· 已开始下载')
      setExportOpen(true)
    }, 1500)
  }

  /** real：DELETE /api/account（服务端销毁会话 + 清 cookie，前端跳登录） */
  const handleDeleteAccount = async (email: string) => {
    await del('/account', { body: { confirm_email: email } })
  }

  // real 模式档位行
  const sub = real ? profile?.subscription ?? null : null
  const subPlan = real ? sub?.plan ?? null : null
  const monthlyN = useMemo(() => {
    if (!real || !subPlan) return 0
    const plan = plansData?.plans.find((p) => p.sku === subPlan)
    const c = plan?.credits
    if (typeof c === 'object' && c) return (c as { monthly?: number }).monthly ?? 0
    return 0
  }, [real, subPlan, plansData])
  const hasSubscription = real ? sub != null : track === 'managed'

  const cardAnim = (i: number) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.26, delay: i * 0.07 },
  })

  return (
    <div ref={mainRef}>
      <PageHeader title={t.title} description={t.desc} />

      <div className="flex gap-8">
        {/* 锚点迷你导航（sticky，窄屏隐藏） */}
        <nav className="sticky top-20 hidden h-fit w-28 shrink-0 flex-col gap-1 lg:flex">
          {SECTIONS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollTo(id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-left text-[13px] transition-colors',
                activeSec === id ? 'bg-brand-soft text-brand-strong' : 'text-ink3 hover:text-ink',
                id === 'danger' && activeSec !== id && 'text-err/70 hover:text-err',
              )}
            >
              {t.nav[id]}
            </button>
          ))}
        </nav>

        <div className="flex w-full max-w-[760px] flex-col gap-6">
          {/* 账号资料卡 */}
          <motion.section id="sec-account" {...cardAnim(0)} className="scroll-mt-20 rounded-lg border border-line bg-surface p-5">
            <h2 className="mb-4 text-[17px] leading-[26px] font-semibold text-ink">{t.account}</h2>
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex flex-col items-center gap-2">
                <img src="/avatar-user.png" alt="avatar" className="size-16 rounded-full border border-line object-cover" />
                <button
                  type="button"
                  onClick={() => toast.info('头像更换（模拟）· 原型不实际上传')}
                  className="rounded-md border border-line bg-raised px-2.5 py-1 text-xs text-ink2 transition-colors hover:border-linestrong hover:text-ink"
                >
                  {t.changeAvatar}
                </button>
              </div>
              <div className="min-w-56 flex-1">
                <p className="mb-1.5 text-xs font-medium text-ink3">{t.nickname}</p>
                <div className="flex gap-2">
                  <Input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="h-9 border-line bg-raised text-ink"
                  />
                  <Button type="button" size="sm" className="h-9 bg-brand text-white hover:bg-brand-strong" onClick={saveNickname}>
                    {t.save}
                  </Button>
                </div>
                {/* 档位行 */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {real ? (
                    <>
                      <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-white">
                        {subPlan === 'pro' ? 'Pro' : subPlan === 'starter' ? 'Starter' : 'Free'}
                      </span>
                      <span className="text-xs text-ink3">
                        {sub
                          ? `订阅周期至 ${fmtDate(sub.current_period_end)} · 月度积分 ${monthlyN} 不结转`
                          : '当前无进行中订阅 · 可购买积分或配置 BYOK 使用'}
                      </span>
                    </>
                  ) : track === 'managed' ? (
                    <>
                      <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-white">Pro</span>
                      <span className="text-xs text-ink3">{t.proNote}</span>
                    </>
                  ) : (
                    <>
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{ color: 'var(--byok)', background: 'rgba(45,212,191,.12)', border: '1px solid rgba(45,212,191,.35)' }}
                      >
                        BYOK 免费档
                      </span>
                      <span className="text-xs text-ink3">{t.byokNote}</span>
                    </>
                  )}
                  <Link to="/app/pricing" className="text-xs text-brand-strong hover:underline">
                    {t.manageSub}
                  </Link>
                </div>
                <p className="mt-3 font-mono text-xs text-ink3">
                  {real
                    ? `user_id ${(profile?.user.id ?? '').slice(0, 6)} · 注册于 ${fmtDate(profile?.user.created_at ?? null)} · ${profile?.user.email ?? ''}`
                    : 'user_id u_8f3k2 · 注册于 2025-06-30 · Google 登录'}
                </p>
              </div>
            </div>
          </motion.section>

          {/* 语言与地区卡 */}
          <motion.section id="sec-language" {...cardAnim(1)} className="scroll-mt-20 rounded-lg border border-line bg-surface p-5">
            <h2 className="mb-4 text-[17px] leading-[26px] font-semibold text-ink">{t.language}</h2>

            <p className="mb-1.5 text-xs font-medium text-ink3">{t.uiLang}</p>
            <div className="flex w-fit rounded-md border border-line bg-raised p-0.5">
              {(
                [
                  { id: 'zh', label: '中文' },
                  { id: 'en', label: 'English' },
                ] as const
              ).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => switchLocale(l.id)}
                  className={cn(
                    'relative rounded px-4 py-1.5 text-[13px] transition-colors',
                    locale === l.id ? 'text-ink' : 'text-ink3 hover:text-ink',
                  )}
                >
                  {locale === l.id && (
                    <motion.span
                      layoutId="locale-segment"
                      className="absolute inset-0 rounded bg-press"
                      transition={{ duration: 0.2 }}
                    />
                  )}
                  <span className="relative z-10">{l.label}</span>
                </button>
              ))}
            </div>

            <p className="mt-5 mb-1.5 text-xs font-medium text-ink3">{t.contentLang}</p>
            <Select value={contentLang} onValueChange={(v) => setContentLang(v as 'en' | 'zh')}>
              <SelectTrigger className="w-56 border-line bg-raised text-ink">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-line bg-raised">
                <SelectItem value="en" className="text-ink2 focus:bg-press focus:text-ink">English (en)</SelectItem>
                <SelectItem value="zh" className="text-ink2 focus:bg-press focus:text-ink">中文 (zh)</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs leading-4 text-ink3">{t.contentLangNote}</p>

            {/* 独立性说明条（brand 左条） */}
            <div
              className="mt-4 rounded-md bg-raised p-3 text-[13px] leading-5 text-ink2"
              style={{ borderLeft: '3px solid var(--brand)' }}
            >
              {t.independence}
            </div>
          </motion.section>

          {/* 隐私与数据卡 */}
          <motion.section id="sec-privacy" {...cardAnim(2)} className="scroll-mt-20 rounded-lg border border-line bg-surface p-5">
            <h2 className="mb-4 text-[17px] leading-[26px] font-semibold text-ink">{t.privacy}</h2>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] leading-[22px] font-semibold text-ink">{t.exportTitle}</h3>
                <p className="mt-0.5 max-w-md text-[13px] leading-5 text-ink3">{t.exportDesc}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={exporting}
                onClick={runExport}
                className="border-line"
              >
                {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                {t.exportBtn}
              </Button>
            </div>
            {(real ? profile?.user.age_confirmed : true) && (
              <p className="mt-4 flex items-center gap-1.5 text-xs" style={{ color: 'var(--ok)' }}>
                <Check className="size-3.5" /> {t.age.replace('✓ ', '')}
              </p>
            )}
            <button
              type="button"
              onClick={() => toast.info('原型演示入口')}
              className="mt-2.5 text-xs text-brand-strong hover:underline"
            >
              {t.cookie}
            </button>
          </motion.section>

          {/* 危险区卡 */}
          <motion.section
            id="sec-danger"
            {...cardAnim(3)}
            className="scroll-mt-20 rounded-lg bg-surface p-5"
            style={{ border: '1px solid rgba(248,113,113,.35)' }}
          >
            <h2 className="mb-4 text-[17px] leading-[26px] font-semibold text-err">{t.danger}</h2>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-md text-[13px] leading-5 text-ink3">{t.deleteDesc}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {t.deleteBtn}
              </Button>
            </div>
          </motion.section>
        </div>
      </div>

      <ExportDrawer open={exportOpen} onOpenChange={setExportOpen} real={real} />
      <DeleteAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        hasSubscription={hasSubscription}
        real={real}
        confirmEmail={real ? profile?.user.email ?? null : null}
        onDelete={real ? handleDeleteAccount : undefined}
      />
    </div>
  )
}
