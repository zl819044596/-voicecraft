import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import {
  Cable,
  Clapperboard,
  FolderOpen,
  Gem,
  Home,
  LayoutDashboard,
  Loader2,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Sparkles,
  Target,
  Wand2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDemo } from '@/lib/demo'
import { useI18n } from '@/lib/i18n'
import { ApiError, get, post } from '@/lib/api'
import type { MeResponse } from '@/lib/types'
import { CreditPill, TrackChip } from '@/components/badges'
import DemoConsole from '@/components/DemoConsole'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type NavItem = { to: string; key: string; icon: LucideIcon; end?: boolean; accent?: boolean }

const MAIN_NAV: NavItem[] = [
  { to: '/', key: 'app.home', icon: Home, end: true },
  { to: '/app', key: 'app.dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/quick', key: 'app.quick', icon: Sparkles, accent: true },
  { to: '/app/projects', key: 'app.projects', icon: Clapperboard },
]
const LIB_NAV: NavItem[] = [
  { to: '/app/templates', key: 'app.templates', icon: ScrollText },
  { to: '/app/products', key: 'app.products', icon: Package },
  { to: '/app/benchmarks', key: 'app.benchmarks', icon: Target },
  { to: '/app/assets', key: 'app.assets', icon: FolderOpen },
]
const SYS_NAV: NavItem[] = [
  { to: '/app/models', key: 'app.models', icon: Cable },
  { to: '/app/pricing', key: 'app.pricing', icon: Gem },
  { to: '/app/settings', key: 'app.settings', icon: Settings },
]

const CRUMB: [RegExp, string][] = [
  [/^\/app$/, 'app.dashboard'],
  [/^\/app\/quick/, 'app.quick'],
  [/^\/app\/projects/, 'app.projects'],
  [/^\/app\/tasks/, 'app.tasks'],
  [/^\/app\/models/, 'app.models'],
  [/^\/app\/templates/, 'app.templates'],
  [/^\/app\/products/, 'app.products'],
  [/^\/app\/benchmarks/, 'app.benchmarks'],
  [/^\/app\/assets/, 'app.assets'],
  [/^\/app\/pricing/, 'app.pricing'],
  [/^\/app\/settings/, 'app.settings'],
]

const TIER_LABEL: Record<string, string> = { free: 'Free', starter: 'Starter', pro: 'Pro' }
function tierLabel(tier?: string | null): string {
  return (tier && TIER_LABEL[tier]) || 'Pro'
}

function NavGroup({ titleKey, items, collapsed }: { titleKey?: string; items: NavItem[]; collapsed: boolean }) {
  const { t } = useI18n()
  return (
    <div className="mt-4 first:mt-0">
      {titleKey && !collapsed && <p className="mb-1 px-3 text-xs font-medium text-ink3">{t(titleKey)}</p>}
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={collapsed ? t(item.key) : undefined}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                collapsed && 'justify-center px-0',
                isActive ? 'text-ink' : 'text-ink2 hover:bg-raised hover:text-ink',
                item.accent && !isActive && 'text-brand-strong',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-brand"
                    transition={{ duration: 0.25 }}
                  />
                )}
                {isActive && <span className="absolute inset-0 rounded-md bg-brand-soft" />}
                <item.icon className="relative z-10 size-4 shrink-0" />
                {!collapsed && <span className="relative z-10">{t(item.key)}</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

/** AppShell 工作台骨架（design.md §5.1）：左侧 SidebarNav + 顶部 Topbar + DemoConsole */
export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const { mode, authed, track, setAuthed, setConsoleOpen, setCredits, setTrack, setUser, user } = useDemo()
  const { t, locale, setLocale } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(mode === 'real')

  // real 模式登录守卫：进入 /app/* 先 GET /api/auth/me，未登录跳 /login；
  // 同时把顶栏用户信息 / 积分（真实接口）灌入 demo 上下文。
  useEffect(() => {
    if (mode !== 'real') {
      setChecking(false)
      return
    }
    let cancelled = false
    setChecking(true)
    get<MeResponse>('/auth/me', { authRedirect: false })
      .then((me) => {
        if (cancelled) return
        setUser(me.user)
        setCredits(me.credits.credits + me.credits.trial_credits)
        setTrack('managed')
        setAuthed(true)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.isUnauthorized()) setAuthed(false)
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, setAuthed, setCredits, setTrack, setUser])

  // real 模式：会话校验中显示加载态；未登录重定向 /login。demo 模式直接放行（mock）。
  if (mode === 'real') {
    if (checking) {
      return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-canvas">
          <Loader2 className="size-6 animate-spin text-ink3" />
        </div>
      )
    }
    if (!authed) {
      const next = encodeURIComponent(location.pathname)
      return <Navigate to={`/login?next=${next}`} replace />
    }
  }

  /** 登出：调后端登出端点（销毁会话）→ 清本地态 → 回登录页。 */
  const logout = async () => {
    try {
      await post('/auth/logout', undefined, { authRedirect: false })
    } catch {
      /* 幂等端点；失败也继续清本地态 */
    }
    setAuthed(false)
    setUser(null)
    setCredits(0)
    navigate('/login')
  }

  const crumb = t(CRUMB.find(([re]) => re.test(location.pathname))?.[1] ?? 'app.dashboard')
  const isTask = /^\/app\/tasks/.test(location.pathname)

  return (
    <div className="flex min-h-[100dvh] bg-canvas">
      {/* SidebarNav */}
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200',
          collapsed ? 'w-16' : 'w-[232px]',
        )}
      >
        <Link
          to="/"
          title={t('app.home')}
          className={cn(
            'flex h-14 items-center gap-2 border-b border-line px-4 transition-colors hover:bg-raised',
            collapsed && 'justify-center px-0',
          )}
        >
          <img src="/logo.svg" alt="" className="size-7 shrink-0" />
          {!collapsed && <span className="font-display text-sm font-semibold whitespace-nowrap text-ink">AI Video Studio</span>}
        </Link>
        <nav className={cn('flex-1 overflow-y-auto px-2 py-3', collapsed && 'px-2')}>
          <NavGroup items={MAIN_NAV} collapsed={collapsed} />
          <NavGroup titleKey="app.library" items={LIB_NAV} collapsed={collapsed} />
          <NavGroup titleKey="app.system" items={SYS_NAV} collapsed={collapsed} />
        </nav>
        <div className={cn('flex flex-col gap-1 border-t border-line p-2')}>
          <button
            type="button"
            onClick={() => setConsoleOpen(true)}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink2 transition-colors hover:bg-raised hover:text-ink',
              collapsed && 'justify-center px-0',
            )}
            title={t('app.demoConsole')}
          >
            <Wand2 className="size-4 shrink-0 text-brand-strong" />
            {!collapsed && <span>{t('app.demoConsole')}</span>}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink3 transition-colors hover:bg-raised hover:text-ink',
              collapsed && 'justify-center px-0',
            )}
            title={collapsed ? t('app.expand') : t('app.collapse')}
          >
            {collapsed ? <PanelLeftOpen className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
            {!collapsed && <span>{t('app.collapse')}</span>}
          </button>
        </div>
      </aside>

      {/* 主区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-line bg-canvas/80 px-4 backdrop-blur lg:px-6">
          <nav className="flex items-center gap-1.5 text-[13px] text-ink3">
            <span>{t('app.workspace')}</span>
            <span>/</span>
            <span className="text-ink2">{crumb}</span>
            {isTask && (
              <>
                <span>/</span>
                <span className="max-w-56 truncate text-ink">Aurora Brew 冷萃广告</span>
              </>
            )}
          </nav>
          <div className="flex items-center gap-2.5">
            {/* TrackChip + 说明 popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="rounded-full" title="当前轨道说明">
                  <TrackChip track={track} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 border-line bg-raised text-sm text-ink2">
                {track === 'byok' ? (
                  <p>
                    <span className="font-medium text-byok">BYOK · 自备 Key</span>
                    <br />
                    使用你自己的模型 Key，平台不收积分，重跑不计次。
                  </p>
                ) : (
                  <p>
                    <span className="font-medium text-managed">托管 · 积分</span>
                    <br />
                    使用平台托管通道，按条扣积分（static 60 / i2v 300），含免费重跑次数。
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setConsoleOpen(true)}
                  className="mt-2 text-xs text-brand-strong hover:underline"
                >
                  切换（演示）→
                </button>
              </PopoverContent>
            </Popover>

            <CreditPill />

            {/* 语言切换 */}
            <div className="flex rounded-md border border-line bg-surface p-0.5 text-xs">
              {(['zh', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  className={cn(
                    'rounded px-2 py-1 font-mono transition-colors',
                    locale === l ? 'bg-press text-ink' : 'text-ink3 hover:text-ink',
                  )}
                >
                  {l === 'zh' ? '中' : 'EN'}
                </button>
              ))}
            </div>

            {/* 头像 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="rounded-full ring-line transition hover:ring-2">
                  <img src="/avatar-user.png" alt="账号" className="size-8 rounded-full" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 border-line bg-raised">
                <DropdownMenuLabel className="flex items-center gap-2 text-ink">
                  <span className="truncate">{user?.email ?? 'demo@studio.com'}</span>
                  <span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-strong">
                    {tierLabel(user?.tier)}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-line" />
                <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/app/settings')}>
                  {t('app.settings')}
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer text-err focus:text-err" onClick={logout}>
                  {t('app.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* 内容槽 */}
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      <DemoConsole />
    </div>
  )
}
