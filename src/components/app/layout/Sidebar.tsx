"use client";

// 侧边导航 — 对照原型 app.html 的 side-nav：side-logo + 四组（Create/Config/
// Library/Account）共 11 项，当前路由 nav-item active。图标不用 emoji，
// 文案走 i18n（nav.* 键，如 "工作台 Dashboard"）。

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/i18n";

type NavItem = { href: string; labelKey: string };
type NavGroup = { groupKey: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    groupKey: "nav.groupCreate",
    items: [
      { href: "/app", labelKey: "nav.dashboard" },
      { href: "/app/quick", labelKey: "nav.quick" },
      { href: "/app/tasks", labelKey: "nav.tasks" },
      { href: "/app/projects", labelKey: "nav.projects" },
    ],
  },
  {
    groupKey: "nav.groupConfig",
    items: [
      { href: "/app/models", labelKey: "nav.models" },
      { href: "/app/prompts", labelKey: "nav.prompts" },
      { href: "/app/rules", labelKey: "nav.rules" },
    ],
  },
  {
    groupKey: "nav.groupLibrary",
    items: [
      { href: "/app/products", labelKey: "nav.products" },
      { href: "/app/benchmarks", labelKey: "nav.benchmarks" },
      { href: "/app/assets", labelKey: "nav.assets" },
    ],
  },
  {
    groupKey: "nav.groupAccount",
    items: [
      { href: "/app/billing", labelKey: "nav.billing" },
      { href: "/app/settings", labelKey: "nav.settings" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const isActive = (href: string) =>
    href === "/app"
      ? pathname === "/app"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="side-nav">
      <Link className="side-logo" href="/">
        AI Video <em>Studio</em>
      </Link>
      {GROUPS.map((group) => (
        <div key={group.groupKey}>
          <div className="nav-group">{t(group.groupKey)}</div>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${isActive(item.href) ? " active" : ""}`}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  );
}
