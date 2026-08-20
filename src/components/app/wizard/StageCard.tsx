"use client";

// StageCard — Batch B2 六阶段全览向导的折叠卡片（原型 task-detail.html
// `.node` 节点面板）。每个阶段一个卡片：node-head（① 文案 · L1–L2 +
// 状态圆点 + meta + Expand/Collapse）+ 可折叠 node-body。
// 样式全部走 app-studio.css token（.node / .node-head / .node-body /
// .node.collapsed / .stage-num / .st-* / .btn-text）。

import type { ReactNode } from "react";
import { useTranslation } from "@/i18n";

export function StageCard({
  id,
  num,
  title,
  status,
  meta,
  headerNote,
  actions,
  collapsed,
  onToggle,
  children,
  footer,
  anchorId,
}: {
  /** 阶段 id（默认锚点 id=`stage-${id}`，可与 rail 阶段号一致） */
  id: number;
  /** 覆盖锚点 id（如 L8 门与合成卡都归属阶段 5 时避免重复） */
  anchorId?: string;
  /** 阶段序号圆圈内容（1…6，也可传 "⑤" 之类） */
  num: ReactNode;
  /** 标题行（如 `① 文案 Script · L1–L2`） */
  title: ReactNode;
  /** 头部状态 chips（.st .st-done 等） */
  status?: ReactNode;
  /** 头部右侧 meta（弱灰小字） */
  meta?: ReactNode;
  /** 头部右侧 note（原型 node-head 的 › 注释） */
  headerNote?: ReactNode;
  /** 头部动作（如「全量重拆分 Regenerate all」） */
  actions?: ReactNode;
  /** 是否折叠 */
  collapsed: boolean;
  onToggle: () => void;
  /** 展开时的节点编辑器 */
  children?: ReactNode;
  /** node-body 底部备注（storyboard.json 说明等） */
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div id={anchorId ?? `stage-${id}`} className={`node ${collapsed ? "collapsed" : ""}`}>
      <div className="node-head" onClick={onToggle}>
        <span className="stage-num" aria-hidden>{num}</span>
        <span className="node-title">{title}</span>
        {status}
        <span className="spacer" />
        {headerNote ? <span className="note">{headerNote}</span> : null}
        {meta ? <span className="meta">{meta}</span> : null}
        {actions ? (
          <span onClick={(e) => e.stopPropagation()}>{actions}</span>
        ) : null}
        <button
          type="button"
          className="btn-text"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {collapsed ? t("taskDetail.btnExpand") : t("taskDetail.btnCollapse")}
        </button>
      </div>
      {!collapsed ? (
        <div className="node-body">
          {children}
          {footer ? <div className="small faint" style={{ marginTop: 10 }}>{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
