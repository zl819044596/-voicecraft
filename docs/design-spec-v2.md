# AI Video Studio — 设计规范 v2

> 版本：v2.0 · 2026-08-09  
> 角色：绘境（界面设计专家）  
> 状态：待阁主设计审核闸口

---

## 目录

1. [设计原则与视觉风格](#1-设计原则与视觉风格)
2. [布局系统](#2-布局系统)
3. [导航信息架构](#3-导航信息架构)
4. [设计令牌（Design Tokens）](#4-设计令牌design-tokens)
5. [核心组件规范](#5-核心组件规范)
6. [页面级设计](#6-页面级设计)
7. [i18n 方案](#7-i18n-方案)
8. [落地方案](#8-落地方案)

---

## 1. 设计原则与视觉风格

### 1.1 设计原则

| 原则 | 说明 |
|------|------|
| **清晰的信息层级** | 每个页面只有一个主任务，通过视觉权重（字号/间距/颜色）引导用户，避免堆叠 |
| **渐进式披露** | 复杂功能（如 9 步流水线）用侧边栏 + 内容区两栏方案，不一次性展示所有细节 |
| **一致性** | 营销区与应用区共享同一套设计令牌，组件跨页面复用，用户无感知切换 |
| **可控性** | 用户始终知道自己在哪里（侧边栏高亮 + 面包屑），始终能回到上一级 |
| **出海优先** | 英文为默认文案，中文为翻译目标，布局为双语言预留空间 |

### 1.2 配色方案

采用 **亮色（Light）** 为主色调，**深色（Dark）** 为次要模式，两者都定义完整色板。

#### 中性色（Neutrals）

| Token | Light Hex | Dark Hex | 用途 |
|-------|-----------|----------|------|
| `--color-bg` | `#FFFFFF` | `#0A0A0A` | 页面背景 |
| `--color-bg-subtle` | `#FAFAFA` | `#141414` | 次要背景（卡片、侧边栏） |
| `--color-bg-muted` | `#F4F4F5` | `#1A1A1A` | 悬停、选中背景 |
| `--color-bg-elevated` | `#FFFFFF` | `#1F1F1F` | 卡片、对话框、下拉菜单 |
| `--color-border` | `#E4E4E7` | `#2A2A2A` | 边框 |
| `--color-border-strong` | `#D4D4D8` | `#3A3A3A` | 强调边框 |
| `--color-text-primary` | `#18181B` | `#FAFAFA` | 主文本 |
| `--color-text-secondary` | `#71717A` | `#A1A1AA` | 辅助文本 |
| `--color-text-tertiary` | `#A1A1AA` | `#52525B` | 次要辅助文本 |
| `--color-text-disabled` | `#D4D4D8` | `#3F3F46` | 禁用文本 |

#### 品牌色（Brand）

| Token | Light Hex | Dark Hex | 用途 |
|-------|-----------|----------|------|
| `--color-brand` | `#18181B` | `#FAFAFA` | 品牌主色（按钮、链接、Logo） |
| `--color-brand-hover` | `#27272A` | `#E4E4E7` | 品牌悬停 |
| `--color-brand-active` | `#3F3F46` | `#D4D4D8` | 品牌按下 |
| `--color-brand-subtle` | `#F4F4F5` | `#27272A` | 品牌柔色背景 |

> 选择极简的黑白品牌色，与 AI 工具的高科技感匹配，同时保持内容区色彩干净。

#### 语义色（Semantic）

| Token | Light Hex | Dark Hex | 用途 |
|-------|-----------|----------|------|
| `--color-success` | `#10B981` | `#34D399` | 成功、完成、已通过 |
| `--color-success-bg` | `#ECFDF5` | `#064E3B` | 成功背景 |
| `--color-warning` | `#F59E0B` | `#FBBF24` | 警告、等待中 |
| `--color-warning-bg` | `#FFFBEB` | `#78350F` | 警告背景 |
| `--color-error` | `#EF4444` | `#F87171` | 错误、失败 |
| `--color-error-bg` | `#FEF2F2` | `#7F1D1D` | 错误背景 |
| `--color-info` | `#3B82F6` | `#60A5FA` | 信息、运行中 |
| `--color-info-bg` | `#EFF6FF` | `#1E3A5F` | 信息背景 |

#### 特殊色（Pipeline 节点状态）

| Token | Light Hex | Dark Hex | 用途 |
|-------|-----------|----------|------|
| `--color-stale` | `#F97316` | `#FB923C` | 节点过期（下游已编辑） |
| `--color-stale-bg` | `#FFF7ED` | `#7C2D12` | 过期背景 |
| `--color-pending` | `#A1A1AA` | `#52525B` | 节点待运行 |

### 1.3 字体系统

| Token | 值 | 用途 |
|-------|------|------|
| `--font-sans` | `Inter, system-ui, -apple-system, sans-serif` | 正文 |
| `--font-mono` | `JetBrains Mono, SF Mono, monospace` | 代码、API Key、模型名 |

#### 字号层级

| Token | Size | Line Height | 用途 |
|-------|------|-------------|------|
| `--text-xs` | 0.75rem (12px) | 1rem (16px) | 辅助文字、标签、徽标 |
| `--text-sm` | 0.875rem (14px) | 1.25rem (20px) | 正文、表单、导航项 |
| `--text-base` | 1rem (16px) | 1.5rem (24px) | 默认正文 |
| `--text-lg` | 1.125rem (18px) | 1.75rem (28px) | 卡片标题 |
| `--text-xl` | 1.25rem (20px) | 1.75rem (28px) | 页面次级标题 |
| `--text-2xl` | 1.5rem (24px) | 2rem (32px) | 页面主标题 |
| `--text-3xl` | 1.875rem (30px) | 2.25rem (36px) | 营销 Hero 标题 |
| `--text-4xl` | 2.25rem (36px) | 2.5rem (40px) | 营销大 Hero |
| `--text-5xl` | 3rem (48px) | 1.15 | 营销超大 Hero |

### 1.4 圆角

| Token | 值 | 用途 |
|-------|------|------|
| `--radius-sm` | 0.375rem (6px) | 小徽标、小标签 |
| `--radius-md` | 0.5rem (8px) | 按钮、输入框、导航项 |
| `--radius-lg` | 0.75rem (12px) | 卡片、对话框 |
| `--radius-xl` | 1rem (16px) | 大卡片、侧边栏面板 |
| `--radius-2xl` | 1.5rem (24px) | 特殊卡片 |
| `--radius-full` | 9999px | 圆形头像、徽标 |

### 1.5 阴影

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | `0 1px 2px 0 rgb(0 0 0 / 0.3)` | 卡片默认 |
| `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1)` | `0 4px 6px -1px rgb(0 0 0 / 0.4)` | 对话框、下拉菜单 |
| `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1)` | `0 10px 15px -3px rgb(0 0 0 / 0.5)` | 模态框 |
| `--shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1)` | `0 20px 25px -5px rgb(0 0 0 / 0.5)` | 通知 Toast |

### 1.6 间距

| Token | 值 | 用途 |
|-------|------|------|
| `--spacing-1` | 0.25rem (4px) | 微间距 |
| `--spacing-2` | 0.5rem (8px) | 紧凑间距 |
| `--spacing-3` | 0.75rem (12px) | 元素间距 |
| `--spacing-4` | 1rem (16px) | 默认间距 |
| `--spacing-5` | 1.25rem (20px) | 卡片内边距 |
| `--spacing-6` | 1.5rem (24px) | 区域间距 |
| `--spacing-8` | 2rem (32px) | 大区域间距 |
| `--spacing-10` | 2.5rem (40px) | 页面间距 |
| `--spacing-12` | 3rem (48px) | 超大间距 |
| `--spacing-16` | 4rem (64px) | 营销区间距 |

### 1.7 断点

| Token | 值 | 用途 |
|-------|------|------|
| `--breakpoint-sm` | 640px | 手机大屏 |
| `--breakpoint-md` | 768px | 平板 |
| `--breakpoint-lg` | 1024px | 桌面起始（侧边栏展开） |
| `--breakpoint-xl` | 1280px | 宽屏桌面 |
| `--breakpoint-2xl` | 1536px | 超大屏 |

---

## 2. 布局系统

### 2.1 整体布局结构

```
┌──────────────────────────────────────────────────────────────┐
│  Top Bar (共用)                                               │
│  ┌──────┬───────────────────────────────────────────────────┐ │
│  │Logo  │ [搜索]              [语言切换] [用户头像 ▼]        │ │
│  └──────┴───────────────────────────────────────────────────┘ │
├──────┬────────────────────────────────────────────────────────┤
│      │                                                        │
│ Side │  Content Area                                          │
│ Bar  │  (max-width: 1440px, padding: 24px)                    │
│      │                                                        │
│ 240px│                                                        │
│      │                                                        │
│      │                                                        │
└──────┴────────────────────────────────────────────────────────┘
│  Footer (仅营销页)                                             │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 侧边栏（Sidebar）

- **宽度**：240px（固定，非折叠）
- **背景**：`bg-zinc-50 dark:bg-zinc-950`，右侧 1px 边框 `border-zinc-200 dark:border-zinc-800`
- **内容从上到下**：
  1. **Logo 区**：高度 56px，与顶栏对齐，放品牌 Logo + 产品名
  2. **主导航**：项目相关导航项
  3. **分隔线**：`border-t border-zinc-200 dark:border-zinc-800`
  4. **次级导航**：设置、模型配置等
  5. **弹性空间**（flex-1）
  6. **用户区**：底部固定，显示用户信息 + 退出按钮

```
┌──────────────────────┐
│ Logo  AI Video Studio│  ← h-14, 与顶栏对齐
├──────────────────────┤
│ ◈ Dashboard          │  ← active: bg-zinc-100 dark:bg-zinc-900
│ ◈ Projects           │  ← hover: bg-zinc-100/50
│                       │
│ ─── Workbench ───    │  ← 分组标签（text-xs, uppercase, text-zinc-400）
│ ◈ Models             │
│ ◈ Billing            │
│                       │
│ ─── Account ────     │
│ ◈ Settings           │
├──────────────────────┤
│                       │  ← flex-1
│ ┌──────────────────┐ │
│ │ 👤 Alex         │ │  ← 底部固定用户区
│ │    alex@...      │ │
│ │ [Log out]        │ │
│ └──────────────────┘ │
└──────────────────────┘
```

- 导航项样式：
  - 默认：`text-zinc-600 dark:text-zinc-400 text-sm px-4 py-2 rounded-md`
  - 悬停：`hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100`
  - 选中：`bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 font-medium`
  - 左侧图标：16px，`mr-3`

### 2.3 顶栏（Top Bar）

- **高度**：56px（h-14）
- **背景**：`bg-white/80 backdrop-blur dark:bg-zinc-950/80 border-b border-zinc-200 dark:border-zinc-800`
- **内容从左到右**：
  1. 侧边栏 Logo 区（占位，与侧边栏对齐）
  2. 弹性空间
  3. 全局搜索（可选，Cmd+K）
  4. 语言切换按钮（🌐 / 中 / EN）
  5. 用户头像/菜单

```
┌──────────────────────────────────────────────────────────────┐
│[Logo]              [🔍 Search...]        [🌐 EN] [👤 ▼]    │
└──────────────────────────────────────────────────────────────┘
```

### 2.4 内容区（Content Area）

- **外边距**：左侧紧贴侧边栏，右侧自适应
- **内边距**：`px-6 py-6`（桌面）、`px-4 py-4`（移动端）
- **最大宽度**：`max-w-6xl`（内部内容约束），但全宽两栏页面（如项目详情）可超出
- **布局策略**：
  - 简单页面：单列，`mx-auto max-w-6xl`
  - 两栏页面：`flex gap-6`，左栏固定宽度（如 240px 或 280px），右栏 `flex-1`
  - 全宽页面：`w-full`（如营销 Hero）

### 2.5 响应式行为

| 断点 | 侧边栏 | 内容区 |
|------|--------|--------|
| < 1024px (lg) | 隐藏，通过汉堡菜单切换 | 全宽 |
| ≥ 1024px | 固定显示 240px | 右侧剩余空间 |

---

## 3. 导航信息架构

### 3.1 营销区（Marketing）

```
Home (/)                    → 营销首页（Hero + 9步流程 + 工具卡片 + CTA）
├── /tools/storyboard-generator    → SEO 工具页
├── /tools/script-to-video         → SEO 工具页
├── /tools/ai-video-script-writer  → SEO 工具页
├── /tools/text-to-video           → SEO 工具页
├── /tools/ai-voiceover            → SEO 工具页
├── /tools/subtitle-generator      → SEO 工具页
├── /tools/video-export-zip        → SEO 工具页
├── /tools/byok-video-tools        → SEO 工具页
├── /scenarios/*                   → SEO 场景页 (5个)
├── /[verb]-[content-type]         → SEO 程序化页面 (36个)
├── /login                         → 登录页
├── /terms                         → 服务条款
├── /privacy                       → 隐私政策
├── /cookies                       → Cookie 政策
└── /report-abuse                  → 投诉举报
```

**营销区导航**：保留顶部横栏 `Nav.tsx`，但精简为 4-5 项，加上 CTA 按钮。

```
┌──────────────────────────────────────────────────────────────┐
│[Logo]  [Tools ▼] [Scenarios ▼] [Pricing]  [Log in] [Sign Up]│
└──────────────────────────────────────────────────────────────┘
```

### 3.2 应用区（App）

```
Dashboard  (/app)                          → 工作台首页（新建项目 + 项目列表）
├── /app/projects/[id]                     → 项目详情向导（两栏）
├── /app/models                            → 模型配置中心（两栏）
├── /settings                              → 重定向到 /app/models
└── /settings/models                       → 旧版模型配置（可删除，与 /app/models 合并）
```

**应用区导航**：侧边栏 + 顶栏组合。

```
侧边栏导航树：
Dashboard     → /app              (仪表盘 + 项目列表)
├── Projects  → /app              (同 Dashboard，但默认滚动到项目列表)
├── Models    → /app/models       (模型配置中心)
├── Billing   → /app/billing      (占位，未来)
└── Settings  → /app/settings     (用户设置、个人资料)
```

### 3.3 路由清理建议

| 当前路径 | 建议 | 原因 |
|----------|------|------|
| `/settings` | 重定向到 `/app/settings` | 统一应用区 |
| `/settings/models` | 删除 | 与 `/app/models` 功能重复 |
| `/app` | 保持，作为 Dashboard | 应用区入口 |

---

## 4. 设计令牌（Design Tokens）

### 4.1 Tailwind CSS v4 `@theme` 配置

在 `globals.css` 中定义以下 tokens（Tailwind v4 使用 `@theme` 指令）：

```css
@import "tailwindcss";

@theme inline {
  /* ── 字体 ── */
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", monospace;

  /* ── 中性色 ── */
  --color-bg: #ffffff;
  --color-bg-subtle: #fafafa;
  --color-bg-muted: #f4f4f5;
  --color-bg-elevated: #ffffff;
  --color-border: #e4e4e7;
  --color-border-strong: #d4d4d8;
  --color-text-primary: #18181b;
  --color-text-secondary: #71717a;
  --color-text-tertiary: #a1a1aa;
  --color-text-disabled: #d4d4d8;

  /* ── 品牌色 ── */
  --color-brand: #18181b;
  --color-brand-hover: #27272a;
  --color-brand-active: #3f3f46;
  --color-brand-subtle: #f4f4f5;

  /* ── 语义色 ── */
  --color-success: #10b981;
  --color-success-bg: #ecfdf5;
  --color-warning: #f59e0b;
  --color-warning-bg: #fffbeb;
  --color-error: #ef4444;
  --color-error-bg: #fef2f2;
  --color-info: #3b82f6;
  --color-info-bg: #eff6ff;

  /* ── 特殊色 ── */
  --color-stale: #f97316;
  --color-stale-bg: #fff7ed;
  --color-pending: #a1a1aa;

  /* ── 圆角 ── */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-2xl: 1.5rem;
  --radius-full: 9999px;

  /* ── 阴影 ── */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0a0a0a;
    --color-bg-subtle: #141414;
    --color-bg-muted: #1a1a1a;
    --color-bg-elevated: #1f1f1f;
    --color-border: #2a2a2a;
    --color-border-strong: #3a3a3a;
    --color-text-primary: #fafafa;
    --color-text-secondary: #a1a1aa;
    --color-text-tertiary: #52525b;
    --color-text-disabled: #3f3f46;
    --color-brand: #fafafa;
    --color-brand-hover: #e4e4e7;
    --color-brand-active: #d4d4d8;
    --color-brand-subtle: #27272a;
    --color-success: #34d399;
    --color-success-bg: #064e3b;
    --color-warning: #fbbf24;
    --color-warning-bg: #78350f;
    --color-error: #f87171;
    --color-error-bg: #7f1d1d;
    --color-info: #60a5fa;
    --color-info-bg: #1e3a5f;
    --color-stale: #fb923c;
    --color-stale-bg: #7c2d12;
    --color-pending: #52525b;
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.4);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.5);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.5);
  }
}

body {
  background: var(--color-bg);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}
```

### 4.2 自定义 CSS 类名映射

在 Tailwind v4 中，以上 `@theme` 定义的 tokens 自动生成类名：

| Token | Tailwind 类名 |
|-------|---------------|
| `--color-bg` | `bg-bg` |
| `--color-bg-subtle` | `bg-bg-subtle` |
| `--color-text-primary` | `text-text-primary` |
| `--color-border` | `border-border` |
| `--color-success` | `bg-success`, `text-success`, `border-success` |
| `--radius-lg` | `rounded-lg` |

注意：Tailwind v4 的 `@theme` 中 `--color-*` 前缀自动生成 `bg-*`, `text-*`, `border-*` 等变体。

---

## 5. 核心组件规范

### 5.1 按钮（Button）

#### 变体

| 变体 | Light 类名 | 用途 |
|------|-----------|------|
| **Primary** | `bg-brand text-white hover:bg-brand-hover active:bg-brand-active disabled:opacity-40 disabled:cursor-not-allowed` | 主要 CTA（创建、保存、运行） |
| **Secondary** | `border border-border text-text-secondary hover:border-border-strong hover:text-text-primary` | 次要操作（取消、测试连接） |
| **Ghost** | `text-text-secondary hover:bg-bg-muted hover:text-text-primary` | 轻量操作（删除、编辑链接） |
| **Danger** | `bg-error text-white hover:bg-error/90` | 危险操作（删除项目） |
| **Success** | `bg-success text-white hover:bg-success/90` | 成功操作（保存、继续） |

#### 尺寸

| 尺寸 | 类名 |
|------|------|
| sm | `px-3 py-1.5 text-xs rounded-md` |
| md（默认） | `px-4 py-2 text-sm rounded-lg` |
| lg | `px-5 py-2.5 text-base rounded-lg` |

#### 状态

```
┌─────────────────────────────────────────────────────────────┐
│ Default    │ [Primary]  [Secondary]  [Ghost]  [Danger]     │
│ Hover      │ [Primary]  [Secondary]  [Ghost]  [Danger]     │
│ Active     │ [Primary]  [Secondary]  [Ghost]  [Danger]     │
│ Disabled   │ [Primary]  [Secondary]  [Ghost]  [Danger]     │
│ Loading    │ [Primary ○ Creating…]                          │
└─────────────────────────────────────────────────────────────┘
```

- Loading 状态：按钮内显示 `Spinner` + 文案
- Disabled 状态：`opacity-40 cursor-not-allowed`

### 5.2 卡片（Card）

#### 基础卡片

```html
<div class="rounded-xl border border-border bg-bg-elevated shadow-sm p-5">
  <!-- 卡片内容 -->
</div>
```

#### 交互卡片（可点击/悬停）

```html
<div class="rounded-xl border border-border bg-bg-elevated shadow-sm p-5
            transition hover:border-border-strong hover:shadow-md
            cursor-pointer">
  <!-- 卡片内容 -->
</div>
```

#### 卡片头

```html
<div class="flex items-center justify-between gap-3">
  <h3 class="text-sm font-semibold text-text-primary">Title</h3>
  <span class="text-xs text-text-tertiary">Metadata</span>
</div>
```

### 5.3 表单输入（Input）

#### 文本输入框

```html
<input
  class="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm
         text-text-primary placeholder-text-tertiary
         outline-none transition
         focus:border-border-strong focus:ring-2 focus:ring-brand-subtle
         disabled:opacity-40 disabled:cursor-not-allowed"
  placeholder="Placeholder"
/>
```

#### 文本域

```html
<textarea
  class="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2
         text-sm text-text-primary placeholder-text-tertiary
         outline-none transition
         focus:border-border-strong focus:ring-2 focus:ring-brand-subtle"
  rows={4}
/>
```

#### 选择框

```html
<select
  class="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm
         text-text-primary outline-none transition
         focus:border-border-strong"
>
  <option value="">Select...</option>
</select>
```

#### 表单标签

```html
<label class="mb-1.5 block text-xs font-medium text-text-secondary">
  Label
</label>
```

#### 表单错误/帮助文本

```html
<p class="mt-1 text-xs text-error">Error message</p>
<p class="mt-1 text-xs text-text-tertiary">Help text</p>
```

### 5.4 状态徽标（Badge / StatusBadge）

#### 变体

| 状态 | 类名 |
|------|------|
| **done / success** | `border-success/30 bg-success-bg text-success` |
| **running / info** | `border-info/30 bg-info-bg text-info` |
| **waiting / warning** | `border-warning/30 bg-warning-bg text-warning` |
| **failed / error** | `border-error/30 bg-error-bg text-error` |
| **stale** | `border-stale/30 bg-stale-bg text-stale` |
| **pending / queued** | `border-border bg-bg-muted text-text-tertiary` |
| **cancelled** | `border-border bg-bg-muted text-text-tertiary line-through` |

#### 样式

```html
<span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5
             text-xs font-medium [status-classes]">
  <span class="h-1.5 w-1.5 rounded-full [dot-class]" aria-hidden />
  {status}
</span>
```

### 5.5 导航项（NavItem）

```html
<a
  href="/app"
  class="flex items-center gap-3 px-4 py-2 text-sm rounded-md
         transition
         text-text-secondary hover:bg-bg-muted hover:text-text-primary
         aria-[current=page]:bg-bg-muted aria-[current=page]:text-text-primary
         aria-[current=page]:font-medium"
>
  <Icon class="w-4 h-4 shrink-0" />
  <span>Dashboard</span>
</a>
```

### 5.6 对话框 / 模态框（Dialog）

```
┌──────────────────────────────────────────────────────────────┐
│                      ┌────────────────────┐                  │
│                      │  Dialog Title       │                  │
│                      │                    │                  │
│                      │  Content area      │                  │
│                      │                    │                  │
│                      │  [Cancel] [Confirm] │                  │
│                      └────────────────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

- **遮罩**：`fixed inset-0 bg-black/50 backdrop-blur-sm z-50`
- **容器**：`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl border border-border bg-bg-elevated shadow-lg p-6 z-50`
- 可关闭：点击遮罩关闭、按 Escape 关闭

### 5.7 Toast / 通知

```
┌──────────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ✓  项目已成功创建                                       │  │
│  │ ──────────────────────────────────────── [✕]          │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

- **位置**：`fixed bottom-4 right-4 z-50`
- **容器**：`rounded-lg border shadow-xl px-4 py-3 flex items-center gap-3 min-w-[320px]`
- **变体**：success（绿色边框）、error（红色边框）、info（蓝色边框）
- **自动消失**：5 秒后自动消失，可手动关闭

### 5.8 进度条（ProgressBar）

```html
<div class="flex items-center gap-2">
  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-muted">
    <div
      class="h-full rounded-full bg-success transition-all duration-500"
      style={{ width: `${pct}%` }}
    />
  </div>
  <span class="w-9 shrink-0 text-right font-mono text-xs text-text-tertiary">
    {pct}%
  </span>
</div>
```

### 5.9 加载指示器（Spinner）

```html
<span
  class="inline-block h-4 w-4 animate-spin rounded-full
         border-2 border-current border-t-transparent"
  aria-label="loading"
/>
```

### 5.10 开关（Toggle Switch）

```html
<button
  type="button"
  role="switch"
  aria-checked={enabled}
  class="relative h-5 w-9 rounded-full transition
         enabled:bg-success disabled:bg-bg-muted"
>
  <span
    class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition
           enabled:left-[18px] disabled:left-0.5"
  />
</button>
```

### 5.11 面包屑（Breadcrumb）

```html
<nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-sm">
  <a href="/app" class="text-text-tertiary hover:text-text-primary">Dashboard</a>
  <span class="text-text-tertiary">/</span>
  <span class="text-text-primary font-medium">Project Title</span>
</nav>
```

### 5.12 空状态（Empty State）

```html
<div class="flex flex-col items-center justify-center py-16 text-center">
  <EmptyIcon class="w-12 h-12 text-text-tertiary mb-4" />
  <h3 class="text-sm font-medium text-text-primary">No projects yet</h3>
  <p class="mt-1 text-sm text-text-secondary max-w-sm">
    Create your first project to get started with the 9-step pipeline.
  </p>
  <button class="mt-4 ...">Create project</button>
</div>
```

---

## 6. 页面级设计

### 6.1 营销首页（/）

```
┌──────────────────────────────────────────────────────────────┐
│  Top Bar: [Logo]  [Tools ▼] [Scenarios ▼] [Pricing] [Log in]│
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Hero Section                                          │  │
│  │  # AI Video Studio — Storyboard-first AI Video Creator │  │
│  │  A 9-step pipeline built for control...                │  │
│  │  [Open App]  [See how it works]                        │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  9-Step Pipeline Strip (3列网格)                        │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐                               │  │
│  │  │ S1  │ │ S2  │ │ S3  │                               │  │
│  │  └─────┘ └─────┘ └─────┘                               │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐                               │  │
│  │  │ S4  │ │ S5  │ │ S6  │                               │  │
│  │  └─────┘ └─────┘ └─────┘                               │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐                               │  │
│  │  │ S7  │ │ S8  │ │ S9  │                               │  │
│  │  └─────┘ └─────┘ └─────┘                               │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Features / Tools Grid (4列)                            │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  │  │
│  │  │Story │ │Script│ │Voice │ │Export│                  │  │
│  │  └──────┘ └──────┘ └──────┘ └──────┘                  │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  CTA Section                                           │  │
│  │  [Start Creating Free]                                 │  │
│  └────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  Footer: [Terms] [Privacy] [Cookies] [Report Abuse]          │
└──────────────────────────────────────────────────────────────┘
```

**内容层级：**
1. Hero：大标题 + 副标题 + 两个 CTA 按钮
2. 9 步流程：3×3 网格，每步显示编号 + 名称 + 简短描述
3. 功能工具：4 列工具卡片（Storyboard / Script / Voiceover / Export）
4. 场景卡片：使用场景推荐（Client Delivery / YouTube / Social Ads / Product Demo）
5. 底部 CTA：再次引导注册
6. Footer：法律链接

### 6.2 登录页（/login）

```
┌──────────────────────────────────────────────────────────────┐
│  (无 Nav, 无 Footer)                                          │
│                                                              │
│                ┌────────────────────────────┐                │
│                │  AI Video Studio           │                │
│                │  Local demo sign-in...     │                │
│                │                            │                │
│                │  Nickname:  [________]     │                │
│                │  Email:     [________]     │                │
│                │                            │                │
│                │  ☐ I confirm I am 18+...  │                │
│                │                            │                │
│                │  [Sign in]                 │                │
│                └────────────────────────────┘                │
│                                                              │
│  Mock auth only — OAuth (Google) is planned post-launch.     │
└──────────────────────────────────────────────────────────────┘
```

**内容层级：**
1. 居中卡片，宽度 `max-w-md`
2. 品牌 Logo + 标题
3. 表单：Nickname、Email、年龄确认
4. 提交按钮
5. 底部提示文字

### 6.3 工作台（/app）

```
┌──────────────────────────────────────────────────────────────┐
│ Sidebar                │ Content Area                        │
│                        │                                     │
│ ◈ Dashboard ◀         │  # Dashboard                         │
│ ◈ Projects             │  New project for your video...      │
│                        │                                     │
│ ─── Workbench ────    │  ┌───────────────────────────────┐  │
│ ◈ Models               │  │ New Project                    │  │
│ ◈ Billing              │  │ ┌─────────────────────────┐   │  │
│                        │  │ │ Title: [___________]    │   │  │
│ ─── Account ────      │  │ │ Prompt: [___________]    │   │  │
│ ◈ Settings             │  │ │ [Create project]        │   │  │
│                        │  │ └─────────────────────────┘   │  │
│ ┌──────────────────┐   │  └───────────────────────────────┘  │
│ │ 👤 Alex         │   │                                     │
│ │ [Log out]        │   │  # Projects  [Search...] [Filter ▼]│
│ └──────────────────┘   │  ┌──────┐ ┌──────┐ ┌──────┐       │
│                        │  │ Card │ │ Card │ │ Card │       │
│                        │  │      │ │      │ │      │       │
│                        │  └──────┘ └──────┘ └──────┘       │
│                        │  ┌──────┐ ┌──────┐                │
│                        │  │ Card │ │ Card │                │
│                        │  └──────┘ └──────┘                │
└──────────────────────────────────────────────────────────────┘
```

**关键变化（与当前页面对比）：**
- 左侧新增侧边栏
- 移除了顶栏的 Dashboard/Projects/Models 导航链接（已移到侧边栏）
- 移除了页面上方的"← Back to Dashboard"链接（侧边栏导航已提供）
- 新建项目表单和项目列表保持在同一页面，但间距和视觉统一
- 项目列表采用网格布局（2 列或 3 列）
- 卡片统一使用设计规范的卡片组件

**内容层级：**
1. 页面标题 + 描述
2. 新建项目卡片（表单）
3. 项目列表头部（标题 + 搜索 + 筛选）
4. 项目卡片网格

### 6.4 项目详情向导（/app/projects/[id]）

```
┌──────────────────────────────────────────────────────────────┐
│ Sidebar                │ Content Area                        │
│                        │                                     │
│ ◈ Dashboard            │  ← Breadcrumb: Dashboard / Project  │
│ ◈ Projects ◀          │                                     │
│                        │  # Project Title                    │
│ ─── Workbench ────    │  Prompt: ...                        │
│ ◈ Models               │                                     │
│ ◈ Billing              │  ┌───────────────────────────────┐  │
│                        │  │ Run Config Panel               │  │
│ ─── Account ────      │  │ [Synthesis: static/i2v]        │  │
│ ◈ Settings             │  │ [Models: LLM ▼] [Image ▼] ... │  │
│                        │  │ [Run mode: Auto/Semi-auto]    │  │
│                        │  │ [Run Pipeline]                 │  │
│ ┌──────────────────┐   │  └───────────────────────────────┘  │
│ │ 👤 Alex         │   │                                     │
│ │ [Log out]        │   │  ┌──────────┬────────────────────┐ │
│ └──────────────────┘   │  │ Pipeline │  Content Panel      │ │
│                        │  │ ┌──────┐ │                    │ │
│                        │  │ │1.Topic│ │  Node 3:           │ │
│                        │  │ │2.Script││  Storyboard       │ │
│                        │  │ │3.Story◀││  Shot 1: ...      │ │
│                        │  │ │4.Shots ││  Shot 2: ...      │ │
│                        │  │ │5.Voice ││  [Save & rerun]    │ │
│                        │  │ │6.Clips ││                    │ │
│                        │  │ │7.Compos││                    │ │
│                        │  │ └──────┘ │                    │ │
│                        │  └──────────┴────────────────────┘ │
│                        │                                     │
│                        │  ┌───────────────────────────────┐  │
│                        │  │ Cost Card: ~$0.35             │  │
│                        │  └───────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**关键变化（与当前页面对比）：**
- 移除"← Back to Dashboard"链接（侧边栏已提供）
- 运行配置面板移到页面顶部（作为紧凑的 banner，而非占据半屏）
- 流水线节点列表 + 内容面板保持两栏布局
- 左栏固定宽度 240px，右栏 flex-1
- 成本卡片作为可选底部区域

**内容层级：**
1. 面包屑导航
2. 项目标题 + 状态徽标 + 进度条
3. 运行配置面板（紧凑、可折叠）
4. 两栏向导：左侧流水线节点列表 + 右侧内容面板
5. 成本卡片（可选）

### 6.5 模型配置中心（/app/models）

```
┌──────────────────────────────────────────────────────────────┐
│ Sidebar                │ Content Area                        │
│                        │                                     │
│ ◈ Dashboard            │  # Model Configuration              │
│ ◈ Projects             │  Configure multiple models per class│
│                        │                                     │
│ ─── Workbench ────    │  [LLM (3)] [Image (2)] [Voice (1)]  │
│ ◈ Models ◀           │  [Video (2)]                         │
│ ◈ Billing              │                                     │
│                        │  ┌───────────────────────────────┐  │
│ ─── Account ────      │  │ 左列表          │ 右详情       │  │
│ ◈ Settings             │  │ + Add model     │              │  │
│                        │  │                 │ Name: [...]  │  │
│ ┌──────────────────┐   │  │ ◉ My-LLM       │ Class: LLM   │  │
│ │ 👤 Alex         │   │  │ ○ My-LLM-2      │ URL: [...]   │  │
│ │ [Log out]        │   │  │ ◉ My-Image     │ Model: [...] │  │
│ └──────────────────┘   │  │                 │ Key: [...]   │  │
│                        │  │                 │              │  │
│                        │  │                 │ [Enabled]    │  │
│                        │  │                 │ [★ Default]  │  │
│                        │  │                 │              │  │
│                        │  │                 │ [Save] [Test]│  │
│                        │  │                 │ [Delete]     │  │
│                        │  └───────────────────────────────┘  │
│                        │                                     │
│                        │  ┌───────────────────────────────┐  │
│                        │  │ System Presets (LLM)          │  │
│                        │  │ [DeepSeek-V4] [Claude 4]     │  │
│                        │  └───────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**关键变化：**
- 当前 `/app/models/page.tsx` 已经是两栏布局，保留
- 类标签改为圆角按钮样式（pill tabs），更现代
- 左侧模型列表改为更清晰的列表项样式
- 右侧表单统一使用设计规范的表单组件
- 底部增加系统预设区域

**内容层级：**
1. 页面标题 + 描述
2. 类标签导航（LLM / Image / Voice / Video）
3. 两栏配置：左侧模型列表 + 右侧编辑/详情
4. 系统预设推荐（可选折叠）

### 6.6 设置页（/app/settings）

```
┌──────────────────────────────────────────────────────────────┐
│ Sidebar                │ Content Area                        │
│                        │                                     │
│ ◈ Dashboard            │  # Settings                         │
│ ◈ Projects             │                                     │
│                        │  ┌───────────────────────────────┐  │
│ ─── Account ────      │  │ Profile                        │  │
│ ◈ Settings ◀          │  │ Nickname: [___________]        │  │
│                        │  │ Email:    [___________]        │  │
│ ┌──────────────────┐   │  │ [Save]                        │  │
│ │ 👤 Alex         │   │  └───────────────────────────────┘  │
│ │ [Log out]        │   │                                     │
│ └──────────────────┘   │  ┌───────────────────────────────┐  │
│                        │  │ Preferences                    │  │
│                        │  │ Language: [English ▼]         │  │
│                        │  │ Theme: [System ▼]             │  │
│                        │  │ [Save]                        │  │
│                        │  └───────────────────────────────┘  │
│                        │                                     │
│                        │  ┌───────────────────────────────┐  │
│                        │  │ Danger Zone                    │  │
│                        │  │ [Delete Account]              │  │
│                        │  └───────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**注意：** 当前 `/settings` 和 `/settings/models` 可以合并。`/settings` 重定向到 `/app/settings`，`/settings/models` 删除（功能已在 `/app/models` 中）。

---

## 7. i18n 方案

### 7.1 语言切换器位置

- **顶栏右侧**：`🌐 EN` 或 `🌐 中` 按钮
- 点击后弹出下拉菜单选择语言
- 当前只支持两种语言：简体中文（zh）和 English（en）

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo]                     [🌐 EN ▼] [👤 Alex ▼]          │
│                                  ├── English                │
│                                  └── 简体中文               │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 语言字典结构

建议使用 `next-intl` 或 `react-intl`，或自定义轻量方案。

字典路径：
```
src/
  i18n/
    en.json           # 英文翻译
    zh.json           # 中文翻译
    index.ts          # 导出 + 工具函数
```

#### 字典结构示例

`en.json`:
```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "create": "Create",
    "edit": "Edit",
    "search": "Search",
    "loading": "Loading…",
    "noResults": "No results",
    "confirm": "Confirm",
    "close": "Close"
  },
  "nav": {
    "dashboard": "Dashboard",
    "projects": "Projects",
    "models": "Models",
    "billing": "Billing",
    "settings": "Settings",
    "logOut": "Log out",
    "logIn": "Log in"
  },
  "app": {
    "pageTitle": "Dashboard",
    "pageDesc": "Create a project and walk the 9-step pipeline: topic → script → storyboard → shots → voiceover → subtitles → compose → export → review.",
    "newProject": "New project",
    "projectTitle": "Title",
    "projectPrompt": "Prompt",
    "createProject": "Create project",
    "projectList": "Projects",
    "noProjects": "No projects yet — create one above to seed the 9-step pipeline.",
    "deleteConfirm": "Delete this project? The 9-step task will be cascade-deleted. This action cannot be undone."
  },
  "pipeline": {
    "topicParsing": "Topic Parsing",
    "scriptGeneration": "Script Generation",
    "storyboard": "Storyboard",
    "shotImages": "Shot Images",
    "voiceoverSubtitles": "Voiceover & Subtitles",
    "aiMotionClips": "AI Motion Clips",
    "composition": "Composition",
    "runPipeline": "Run Pipeline",
    "continueStep": "Continue to next step",
    "regenerate": "Regenerate",
    "saveRegenerate": "Save & regenerate downstream",
    "semiAuto": "Semi-auto",
    "auto": "Auto",
    "runMode": "Run mode"
  },
  "pipelineStatus": {
    "done": "Done",
    "running": "Running",
    "waiting": "Waiting",
    "failed": "Failed",
    "stale": "Stale",
    "pending": "Pending",
    "queued": "Queued",
    "cancelled": "Cancelled",
    "skipped": "Skipped"
  },
  "models": {
    "pageTitle": "Model Configuration",
    "pageDesc": "Configure multiple models per class (LLM / image / TTS / i2v).",
    "addModel": "Add model",
    "name": "Name",
    "class": "Class",
    "apiUrl": "API URL",
    "modelName": "Model name",
    "apiKey": "API Key",
    "voice": "Voice",
    "enabled": "Enabled",
    "disabled": "Disabled",
    "default": "Default",
    "setDefault": "Set as default",
    "testConnection": "Test connection",
    "save": "Save",
    "delete": "Delete",
    "systemPresets": "System presets"
  },
  "marketing": {
    "heroTitle": "AI Video Studio — Storyboard-first AI Video Creator",
    "heroDesc": "A 9-step pipeline built for control: script, storyboard, per-shot images, voiceover, subtitles and an open export zip you can take anywhere.",
    "openApp": "Open App",
    "seeHow": "See how it works",
    "pipelineTitle": "One pipeline, nine controllable steps",
    "startFree": "Start Creating Free"
  },
  "settings": {
    "pageTitle": "Settings",
    "profile": "Profile",
    "nickname": "Nickname",
    "email": "Email",
    "preferences": "Preferences",
    "language": "Language",
    "theme": "Theme",
    "themeSystem": "System",
    "themeLight": "Light",
    "themeDark": "Dark",
    "dangerZone": "Danger Zone",
    "deleteAccount": "Delete Account"
  }
}
```

`zh.json` 对应键值翻译为中文。

### 7.3 使用方式

```tsx
// src/i18n/index.ts
import en from './en.json';
import zh from './zh.json';

type Locale = 'en' | 'zh';
const messages: Record<Locale, typeof en> = { en, zh };

export function useTranslation() {
  // 从 localStorage 读取语言偏好，或从 cookie 读取
  const locale = (typeof window !== 'undefined'
    ? localStorage.getItem('locale') || navigator.language.startsWith('zh') ? 'zh' : 'en'
    : 'en') as Locale;

  return {
    locale,
    t: (path: string) => {
      const keys = path.split('.');
      let value: any = messages[locale];
      for (const key of keys) {
        value = value?.[key];
      }
      return value ?? path;
    },
    setLocale: (locale: Locale) => {
      localStorage.setItem('locale', locale);
      window.location.reload();
    },
  };
}
```

### 7.4 持久化

- 语言偏好存储在 `localStorage`（键名：`locale`）
- 服务端渲染时从 cookie 读取（`next-intl` 方案）或默认使用 `en`
- 登录用户可将语言偏好同步到后端（未来）

### 7.5 布局考虑

- 英文文案通常比中文长 30-50%，按钮和标签需要预留空间
- 一般不换行的元素（如按钮、标签）使用 `whitespace-nowrap` 或 `truncate`
- 表单标签宽度使用 `min-w-fit` 而非固定宽度

---

## 8. 落地方案

### 8.1 文件组织建议

```
src/
  components/
    app/                         # 应用区组件
      layout/
        Sidebar.tsx              # 侧边栏
        TopBar.tsx               # 顶栏
        AppLayout.tsx            # 应用区整体布局（组合 Sidebar + TopBar + 内容区）
      ui/                        # 通用 UI 组件（设计系统）
        Button.tsx               # 按钮
        Card.tsx                 # 卡片
        Input.tsx                # 输入框
        Textarea.tsx             # 文本域
        Select.tsx               # 选择框
        Badge.tsx                # 状态徽标
        NavItem.tsx              # 导航项
        Dialog.tsx               # 对话框
        Toast.tsx                # 通知
        ProgressBar.tsx          # 进度条
        Spinner.tsx              # 加载指示器
        Toggle.tsx               # 开关
        Breadcrumb.tsx           # 面包屑
        EmptyState.tsx           # 空状态
      pipeline/
        NodeList.tsx             # 流水线节点列表
        NodeContent.tsx          # 节点内容面板
        ConfigPanel.tsx          # 运行配置面板
      models/
        ClassTabs.tsx            # 模型类标签
        ModelList.tsx            # 模型列表
        ModelForm.tsx            # 模型编辑表单
      project/
        ProjectCard.tsx          # 项目卡片
        ProjectForm.tsx          # 新建项目表单
        ProjectList.tsx          # 项目列表
    marketing/                   # 营销区组件
      Nav.tsx                    # 营销导航
      Footer.tsx                 # 页脚
      HeroSection.tsx            # Hero 区域
      PipelineStrip.tsx          # 9 步流程条
      ToolCard.tsx               # 工具卡片
  i18n/                          # 国际化
    en.json
    zh.json
    index.ts
  app/
    app/
      layout.tsx                 # 应用区布局（使用 AppLayout）
      page.tsx                   # 工作台页面
      projects/
        [id]/
          page.tsx               # 项目详情
      models/
        page.tsx                 # 模型配置
      settings/
        page.tsx                 # 设置页
    layout.tsx                   # 根布局（营销 Nav + Footer）
    page.tsx                     # 营销首页
    login/
      layout.tsx                 # 登录布局（无 Nav/Footer）
      page.tsx                   # 登录页
```

### 8.2 Tailwind 类名约定

| 类别 | 约定 | 示例 |
|------|------|------|
| 背景色 | 使用 `@theme` 自定义 tokens | `bg-bg`, `bg-bg-elevated`, `bg-bg-muted` |
| 文字色 | 使用 tokens | `text-text-primary`, `text-text-secondary` |
| 边框色 | 使用 tokens | `border-border`, `border-border-strong` |
| 圆角 | 使用 tokens | `rounded-lg`, `rounded-xl`, `rounded-md` |
| 阴影 | 使用 tokens | `shadow-sm`, `shadow-md` |
| 间距 | 使用 Tailwind 数字 | `p-4`, `p-5`, `p-6`, `gap-3`, `gap-4` |
| 布局 | flex/grid | `flex items-center`, `grid grid-cols-2` |
| 状态 | 语义类 | `bg-success`, `text-error`, `border-warning` |

### 8.3 迁移步骤

1. **Phase 1 — 设计令牌**（1 天）
   - 更新 `globals.css`，加入完整的 `@theme` 配置
   - 确认所有页面在亮色/深色模式下表现正常

2. **Phase 2 — 布局重构**（2 天）
   - 创建 `Sidebar.tsx`、`TopBar.tsx`、`AppLayout.tsx`
   - 改造 `app/layout.tsx` 使用新的布局组件
   - 移除 `AppNav.tsx`（功能被 Sidebar + TopBar 替代）
   - 移除 `Nav.tsx` 顶栏中指向应用区的链接（Dashboard / App）

3. **Phase 3 — 组件提取**（2 天）
   - 从现有页面中提取通用 UI 组件到 `src/components/app/ui/`
   - 替换各页面内联样式为组件调用
   - 确保所有组件支持亮色/深色模式

4. **Phase 4 — 页面重构**（2 天）
   - 工作台页面：使用新布局 + 组件重构
   - 项目详情页面：重构为两栏，移除冗余链接
   - 模型配置页面：统一组件样式
   - 营销首页：保持现有布局，只需更新颜色 tokens

5. **Phase 5 — i18n**（1 天）
   - 创建 `src/i18n/` 目录，编写 `en.json` 和 `zh.json`
   - 添加语言切换器到顶栏
   - 在页面中逐步替换硬编码字符串

6. **Phase 6 — 清理**（1 天）
   - 删除 `/settings/models`（已合并到 `/app/models`）
   - 删除无用的旧组件文件
   - 更新路由

### 8.4 旧文件清理清单

| 文件 | 操作 | 原因 |
|------|------|------|
| `src/components/AppNav.tsx` | 删除 | 被 Sidebar + TopBar 替代 |
| `src/components/Nav.tsx` | 保留但精简 | 仅用于营销区，移除指向应用区的链接 |
| `src/components/NavAuth.tsx` | 保留 | 用户认证组件，可复用 |
| `src/components/app-ui.tsx` | 保留但逐步迁移 | 将 Badge/ProgressBar/Spinner 迁移到 `ui/` 目录 |
| `src/app/settings/layout.tsx` | 删除 | 设置页不再需要独立 layout |
| `src/app/settings/models/page.tsx` | 删除 | 功能已合并到 `/app/models` |
| `src/app/settings/page.tsx` | 保留 | 重定向到 `/app/settings`（或改为实际设置页） |

---

## 附录：关键设计决策记录

| 决策 | 选项 | 选择理由 |
|------|------|----------|
| 侧边栏宽度 | 240px vs 260px vs 280px | 240px 足够容纳导航项 + 图标，留更多空间给内容区 |
| 品牌色 | 黑白 vs 彩色（蓝/紫） | 黑白更极简，不干扰内容区的语义色 |
| 语言切换器位置 | 顶栏 vs 侧边栏底部 | 顶栏更显眼，符合用户习惯 |
| 项目列表布局 | 网格 vs 列表 | 网格（2-3列）在桌面更高效展示，适合卡片式 |
| 两栏向导比例 | 240px:flex-1 vs 280px:flex-1 | 240px 足够显示流水线节点，不浪费空间 |
| 字体 | Inter vs System Font | Inter 在 macOS/Windows 表现一致，适合 SaaS |
| 路由策略 | `/app/*` vs `/workspace/*` | 保持现有 `/app/*` 路径，减少重定向复杂度 |
| 深色模式 | `prefers-color-scheme` vs 手动切换 | 先支持系统偏好，后续可添加手动切换控件 |