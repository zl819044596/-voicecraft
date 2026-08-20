"use client";

// Shared presentational components for the /app workbench, rebuilt against the
// reference prototype (docs/app/style-app.css, Studio Dark). Every component
// maps to the prototype's CSS classes (.panel / .tbl / .st / .btn / .input /
// .stats / .badge / .empty / .page-head), and sizes are tuned to the reference
// density — 13px body, 30px buttons, 32px inputs, 36px table rows, 8px status
// dots, no gradients / shadows / decorative blobs.
//
// API stays stable; pages import these instead of writing bespoke Tailwind
// strings, so the whole workbench stays visually identical to the prototype.

import Link from "next/link";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/* ──────────────────────────────────────────────────────────────────────────
 * 卡片 Card / CardHead → .panel / .panel-head
 * ────────────────────────────────────────────────────────────────────────── */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded border border-border bg-bg-subtle p-3.5 ${className}`}>
      {children}
    </div>
  );
}

export function CardHead({
  title,
  sub,
  right,
  className = "",
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex items-center gap-3 ${className}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold text-text-primary">{title}</div>
        {sub ? <div className="mt-0.5 text-[11px] text-text-secondary">{sub}</div> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 统计卡 StatCard → .stat（k 11px / v 22px / s 11px；无图标块、无装饰圆）
 * ────────────────────────────────────────────────────────────────────────── */
export function StatCard({
  label,
  value,
  accent = false,
  delta,
  deltaDown = false,
  icon,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  accent?: boolean;
  delta?: ReactNode;
  deltaDown?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded border border-border bg-bg-subtle px-4 py-3 ${
        onClick ? "cursor-pointer transition hover:border-brand" : ""
      }`}
    >
      {icon ? <div className="mb-1 text-[15px] text-text-tertiary">{icon}</div> : null}
      <div className="text-[11px] leading-snug text-text-secondary">{label}</div>
      <div
        className={`mt-1 text-[22px] font-medium leading-tight tabular-nums ${
          accent ? "text-brand" : "text-text-primary"
        }`}
      >
        {value}
      </div>
      {delta ? (
        <div className={`mt-0.5 text-[11px] ${deltaDown ? "text-error" : "text-success"}`}>
          {delta}
        </div>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 徽章 Badge
 *   dot=true  → .st 状态（圆点 + 文字，无边框，11px）
 *   dot=false → .badge 小标签（细边框，10px）
 * ────────────────────────────────────────────────────────────────────────── */
export type BadgeVariant = "green" | "blue" | "orange" | "red" | "gray" | "accent";

// dot 状态色（低饱和，DESIGN-BRIEF v2.2）
const statusColors: Record<BadgeVariant, { text: string; dot: string }> = {
  green: { text: "#7aa87a", dot: "#7aa87a" },
  orange: { text: "#d4a24c", dot: "#d4a24c" },
  red: { text: "#c25b4e", dot: "#c25b4e" },
  gray: { text: "#98938a", dot: "#5f5a53" },
  blue: { text: "#98938a", dot: "#5f5a53" },
  accent: { text: "#e0622e", dot: "#e0622e" },
};

// 无 dot 标签色（细边框）
const tagVariants: Record<BadgeVariant, string> = {
  green: "border-[#7aa87a] text-[#7aa87a]",
  orange: "border-[#d4a24c] text-[#d4a24c]",
  red: "border-[#c25b4e] text-[#c25b4e]",
  gray: "border-[#2c2f33] text-[#98938a]",
  blue: "border-[#2c2f33] text-[#98938a]",
  accent: "border-[#e0622e] text-[#e0622e]",
};

export function Badge({
  variant = "gray",
  dot = false,
  className = "",
  children,
}: {
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (dot) {
    const c = statusColors[variant] ?? statusColors.gray;
    return (
      <span
        className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] ${className}`}
        style={{ color: c.text }}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.dot }} aria-hidden />
        {children}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[10px] leading-none ${tagVariants[variant] ?? tagVariants.gray} ${className}`}
    >
      {children}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 按钮 Btn → .btn（md 30px / sm 24px，12px 字重中）
 * ────────────────────────────────────────────────────────────────────────── */
export type BtnVariant = "primary" | "default" | "ghost" | "danger";
export type BtnSize = "md" | "sm";

export function Btn({
  variant = "default",
  size = "md",
  href,
  onClick,
  disabled = false,
  type,
  className = "",
  children,
  title,
}: {
  variant?: BtnVariant;
  size?: BtnSize;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  const base =
    "inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded border font-medium disabled:cursor-not-allowed disabled:opacity-50";
  const sizes: Record<BtnSize, string> = {
    md: "h-[30px] px-3.5 text-[12px]",
    sm: "h-[24px] px-2 text-[11px]",
  };
  const variants: Record<BtnVariant, string> = {
    primary:
      "border-brand bg-brand text-white hover:border-brand-hover hover:bg-brand-hover",
    default:
      "border-border bg-bg-muted text-text-primary hover:border-text-tertiary",
    ghost: "border-transparent bg-transparent text-text-secondary hover:text-brand",
    danger:
      "border-error bg-transparent text-error hover:bg-error-bg hover:border-error",
  };
  const cls = `${base} ${sizes[size]} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled}
      className={cls}
      title={title}
    >
      {children}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 页面标题 PageHeader → .page-head（17px/600）
 * ────────────────────────────────────────────────────────────────────────── */
export function PageHeader({
  title,
  subtitle,
  actions,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-5 flex flex-wrap items-center gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold leading-tight text-text-primary">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[12px] text-text-secondary">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 表格 DataTable / Td / Tr → .tbl（th 11px/500，td 12.5px、行高 36px，无斑马纹）
 * ────────────────────────────────────────────────────────────────────────── */
export function DataTable({
  columns,
  children,
}: {
  columns: Array<ReactNode>;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                className="whitespace-nowrap border-b border-border px-3 py-1.5 text-left text-[11px] font-medium text-text-tertiary"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  className = "",
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <td
      onClick={onClick}
      className={`h-9 border-b border-border px-3 py-1.5 align-middle ${className}`}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr onClick={onClick} className={`${onClick ? "cursor-pointer" : ""} ${className}`}>
      {children}
    </tr>
  );
}

export function CellTitle({ children }: { children: ReactNode }) {
  return <div className="font-medium text-text-primary">{children}</div>;
}

export function CellSub({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 text-[10.5px] text-text-tertiary">{children}</div>;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 表单 Field / Input / Select / Textarea → .field / .input（32px）
 * ────────────────────────────────────────────────────────────────────────── */
export const inputClass =
  "h-[32px] w-full rounded border border-border bg-bg px-2.5 text-[12.5px] text-text-primary placeholder:text-text-tertiary focus:border-text-tertiary focus:outline-none";

export function Field({
  label,
  required = false,
  hint,
  children,
  className = "",
}: {
  label?: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3.5 ${className}`}>
      {label ? (
        <label className="mb-1.5 block text-[11px] text-text-secondary">
          {label}
          {required ? <span className="ml-0.5 text-error">*</span> : null}
        </label>
      ) : null}
      {children}
      {hint ? <div className="mt-1 text-[10.5px] text-text-tertiary">{hint}</div> : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${inputClass} ${className}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select {...rest} className={`${inputClass} appearance-none pr-7 ${className}`}>
      {children}
    </select>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea {...rest} className={`${inputClass} min-h-[96px] resize-y py-2 ${className}`} />
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 媒体卡 MediaCard / MediaThumb → .shot（16:9 深底框，无 ▶ 圆钮）
 * ────────────────────────────────────────────────────────────────────────── */
export function MediaCard({
  thumbClass = "bg-bg-muted",
  children,
  onClick,
  className = "",
}: {
  thumbClass?: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`overflow-hidden rounded border border-border bg-bg-subtle ${
        onClick ? "cursor-pointer hover:border-brand" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function MediaThumb({
  thumbClass = "bg-bg-muted",
  children,
  duration,
  badge,
  onClick,
}: {
  thumbClass?: string;
  children?: ReactNode;
  duration?: ReactNode;
  badge?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative flex aspect-[16/9] items-center justify-center overflow-hidden ${thumbClass} ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      {children ?? <span className="sr-only" />}
      {duration ? (
        <span className="absolute bottom-1.5 right-1.5 rounded-sm border border-border bg-bg/80 px-1 py-px text-[10px] text-text-secondary">
          {duration}
        </span>
      ) : null}
      {badge ? <span className="absolute left-1.5 top-1.5">{badge}</span> : null}
    </div>
  );
}

export function MediaBody({ name, meta }: { name: ReactNode; meta?: ReactNode }) {
  return (
    <div className="px-3 py-2.5">
      <div className="mb-0.5 text-[12.5px] font-medium leading-snug text-text-primary">{name}</div>
      {meta ? (
        <div className="flex items-center justify-between text-[10.5px] text-text-secondary">
          {meta}
        </div>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 空状态 EmptyState → .empty（几何符号，无 emoji）
 * ────────────────────────────────────────────────────────────────────────── */
export function EmptyState({
  symbol = "○",
  title,
  desc,
  action,
}: {
  symbol?: string;
  title: ReactNode;
  desc?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="py-12 text-center text-text-secondary">
      <div className="mb-2 text-[28px] leading-none text-text-tertiary">{symbol}</div>
      <div className="text-[13px] font-medium text-text-primary">{title}</div>
      {desc ? <div className="mt-1 text-[11.5px] text-text-tertiary">{desc}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 品牌 Logo
 * ────────────────────────────────────────────────────────────────────────── */
export function GradientText({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`text-brand ${className}`}>{children}</span>;
}

export function BrandLogo({ char = "破" }: { char?: string }) {
  return (
    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded bg-brand text-base font-semibold text-white">
      {char}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 缩略图占位（16:9 扁平深色面板）
 * ────────────────────────────────────────────────────────────────────────── */
export const THUMB_CLASSES = {
  a: "bg-[#1a1c1f]",
  b: "bg-[#212427]",
  c: "bg-[#2c2f33]",
  d: "bg-[#23262a]",
  e: "bg-[#1f2226]",
  f: "bg-[#26292d]",
} as const;

export function thumbFor(index: number): string {
  const keys = Object.keys(THUMB_CLASSES) as Array<keyof typeof THUMB_CLASSES>;
  return THUMB_CLASSES[keys[Math.abs(index) % keys.length]];
}

export function ThumbPlaceholder({ text }: { text?: string }) {
  return (
    <span className="px-3 text-center text-[12px] font-medium text-text-tertiary">{text}</span>
  );
}
