"use client";

// 顶栏 — 对照原型 app.html 的 top-bar：page-title + top-meta（每页一句状态
// 说明）+ spacer + top-credits（积分余额，title 提示 ≈ static/i2v 换算）+
// avatar。C3：新增 top-meta 槽位，静态文案按路由映射（原型各页顶栏 top-meta），
// 动态页面（任务详情）用 TopMetaContext 覆盖。

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "@/i18n";
import { useTopMeta } from "./TopMeta";

type Rule = {
  match: RegExp;
  titleKey: string;
  metaKey?: string;
  creditsKey?: string;
  actionKey?: string;
  actionHref?: string;
};

const PAGE_RULES: Rule[] = [
  { match: /^\/app\/tasks\/new/, titleKey: "nav.tasks" },
  // 任务详情 top-meta 动态（static · managed · run mode: semi），由页面经 context 设置。
  { match: /^\/app\/tasks\/.+/, titleKey: "nav.tasks" },
  { match: /^\/app\/tasks/, titleKey: "nav.tasks", metaKey: "topMeta.tasks" },
  { match: /^\/app\/quick/, titleKey: "nav.quick", metaKey: "topMeta.quick" },
  { match: /^\/app\/projects\/.+/, titleKey: "nav.projects" },
  { match: /^\/app\/projects/, titleKey: "nav.projects", metaKey: "topMeta.projects" },
  { match: /^\/app\/models/, titleKey: "nav.models", metaKey: "topMeta.models", creditsKey: "topMeta.modelsCredits" },
  { match: /^\/app\/prompts/, titleKey: "nav.prompts", metaKey: "topMeta.prompts" },
  { match: /^\/app\/products\/.+/, titleKey: "nav.products" },
  { match: /^\/app\/products/, titleKey: "nav.products", metaKey: "topMeta.products" },
  { match: /^\/app\/benchmarks\/.+/, titleKey: "nav.benchmarks" },
  { match: /^\/app\/benchmarks/, titleKey: "nav.benchmarks", metaKey: "topMeta.benchmarks" },
  // 素材库：上传按钮在顶栏（原型 assets.html:39），锚点指向页面内上传卡。
  { match: /^\/app\/assets/, titleKey: "nav.assets", metaKey: "topMeta.assets", actionKey: "assets.uploadTop", actionHref: "/app/assets#upload" },
  { match: /^\/app\/billing/, titleKey: "nav.billing" },
  { match: /^\/app\/settings/, titleKey: "nav.settings" },
  { match: /^\/app\/?$/, titleKey: "nav.dashboard" },
];

export function TopBar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { user, credits } = useAuth();
  const { meta: dynamicMeta } = useTopMeta();

  const rule =
    PAGE_RULES.find((r) => r.match.test(pathname)) ?? PAGE_RULES[PAGE_RULES.length - 1];
  const balance = credits?.credits ?? 0;
  const staticCount = Math.floor(balance / 60);
  const i2vCount = Math.floor(balance / 300);
  const creditsTip = t("app.creditsTooltip", { static: staticCount, i2v: i2vCount });
  const initial = (user?.nickname || user?.email || "A").slice(0, 1).toUpperCase();

  // 页面 context 覆盖优先；否则静态路由映射（无映射则空）。
  const metaText = dynamicMeta ?? (rule.metaKey ? t(rule.metaKey) : "");

  return (
    <header className="top-bar">
      <span className="page-title">{t(rule.titleKey)}</span>
      {metaText ? <span className="top-meta">{metaText}</span> : null}
      <span className="spacer" />
      {rule.actionKey ? (
        <a href={rule.actionHref ?? "#upload"} className="btn btn-primary btn-sm">
          {t(rule.actionKey)}
        </a>
      ) : null}
      {rule.creditsKey ? (
        <span className="top-credits" title={rule.creditsKey}>
          {t(rule.creditsKey)}
        </span>
      ) : credits ? (
        <span className="top-credits" title={creditsTip}>
          {balance.toLocaleString()} {t("nav.creditsUnit")}
        </span>
      ) : null}
      <span className="avatar" title={user?.email ?? ""}>
        {initial}
      </span>
    </header>
  );
}
