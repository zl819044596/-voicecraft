import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'

const LINKS: { to: string; label: string }[] = [
  { to: '/login', label: '登录' },
  { to: '/app', label: '总览' },
  { to: '/app/quick', label: '快速生成' },
  { to: '/app/projects', label: '项目' },
  { to: '/app/models', label: '模型通道' },
  { to: '/app/templates', label: '模板中心' },
  { to: '/app/products', label: '商品库' },
  { to: '/app/benchmarks', label: '对标库' },
  { to: '/app/assets', label: '素材库' },
  { to: '/app/pricing', label: '价格' },
  { to: '/app/settings', label: '设置' },
]

/**
 * 原型全局导航（开发/评审用工具条，链接全部路由）。
 * 定位契约：sticky top-0 z-50，处于正常文档流；页面无需补偿其高度（react-dev.md）。
 */
export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="flex h-12 items-center gap-4 overflow-x-auto px-4 lg:px-6">
        <NavLink to="/login" className="flex shrink-0 items-center gap-2">
          <img src="/logo.svg" alt="AI Video Studio" className="size-6" />
          <span className="font-display text-[13px] font-semibold text-ink">AI Video Studio</span>
          <span
            className="rounded px-1 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-brand"
            style={{ border: '1px dashed rgba(124,92,255,.5)' }}
          >
            PROTOTYPE NAV
          </span>
        </NavLink>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/app'}
              className={({ isActive }) =>
                cn(
                  'shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap text-ink3 transition-colors hover:text-ink',
                  isActive && 'bg-brand-soft text-brand-strong',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}
