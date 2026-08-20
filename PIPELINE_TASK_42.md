# PIPELINE_TASK_42 — 阶段②：平台前端重新设计（海外工具站）

## 背景

用户 2026-08-17 定案：ai-video-studio 重新设计为海外工具站（英文为主 + 中文支持），
与 dealreel-app 本质是同一产品（AI 短视频生成工具）。阶段①（PIPELINE_TASK_41）已完成：
i2v 下线、后端 6 节点收敛（文案/分镜/生图/配音/字幕/合成导出）。本次做前端。

**用户指示：「先把功能都做出来，后面再测试」** —— 功能优先，视觉/文案精修后置。

## 技术栈（不动）

- app/ 目录：React 19 + Vite 7 + Tailwind + shadcn/ui 风格（深色主题保留）
- 后端 API 已有：/api/projects /api/tasks /api/export/stage/:taskId/:stage 等
- 部署：nginx + 静态构建（app 是 Vite SPA）

## 任务清单

### A. Landing 营销页（新建）
1. 新建 `/` 路由 Landing 页（当前 `/` 重定向 /login，改为 Landing；Login 保留在 /login）
2. 结构（从上到下）：
   - Navbar：Logo + Features/Pricing/FAQ 锚点 + [Sign in] 按钮 + 语言切换(en/zh)
   - Hero：标题 "Turn Your Script into a Short Video in Minutes" + 副标题 + 创建输入框
     + [Create Video] 按钮 → 未登录跳 /login，已登录跳 /app/quick
   - How it works：4 步（1. 文案 2. 分镜 3. 生图+配音 4. 合成导出）
   - Features：6 卡片（AI 分镜拆解 / 多语言音色 / 自动字幕 / 素材包导出 / 多模型接入 / 商用版权）
   - Pricing：三档 Free/Pro/Lifetime（价格占位，Creem 接入是阶段③）
   - FAQ：5-6 条（语言/时长/版权/导出格式/积分）
   - Footer：Logo + 链接 + © 2026
3. 深色主题沿用现有 design tokens（index.css 不动主题变量）
4. 英文为主，中文走 i18n 字典（见 D）

### B. Create 页（改 QuickGenerate → /app/quick）
1. 视觉重新设计：左侧输入区（文案 textarea + 模式选择 paste/rewrite/create）、
   右侧预览区（生成后展示分镜缩略图网格）
2. 生成设置折叠面板：语言 / 时长 / 画面风格 / 音色(带试听) / 字幕开关 / 分镜模板
3. 生成按钮 → 创建任务 → 跳 /app/tasks/:id
4. 保留现有 API 调用逻辑（demo.tsx 的 mock 与真实 API 切换保留）

### C. 任务详情 6 节点收敛（改 TaskWizard）
1. 顶部横向 StepRail 改为 6 节点（①文案 ②分镜 ③生图 ④配音 ⑤字幕 ⑥导出），
   与后端 DISPLAY_NODES 对齐（后端已返回 6 节点 steps）
2. 节点状态：完成✓ / 当前高亮 / 失败标红 / 待处理灰；点击跳转
3. 节点内容区：现有 NodeCopy/NodeStoryboard/NodeVisual/NodeAudio/NodeCompose 保留复用
4. 底部操作：运行 / 全自动半自动切换 / 下载素材包（/api/export/stage/:taskId/:stage 已有）
5. 移除 i2v 相关 UI（clips 下载、i2v 模式切换、Kling/Wan 选择）

### D. 正式 i18n（en 默认 + zh）
1. 新建 src/lib/i18n.ts：`useT()` hook + 语言上下文 + localStorage 持久化
2. 新建 src/locales/en.ts / zh.ts 字典（覆盖 Landing + 应用区导航 + 常用词）
3. 语言切换放 Navbar（Landing）和 AppShell Topbar（应用区）
4. 默认 en；`<html lang>` 与字体随语言切换（Noto Sans SC 已有）

### E. 页面精简
1. Dashboard 保留（最近任务 + 积分卡）
2. 新增/保留 Projects 页（任务表格）
3. Prompts → Templates（保留，模板中心）
4. Billing → Pricing（三档价格展示；Creem 结算是阶段③，先做展示）
5. Settings 保留；Models/Products/Benchmarks/Assets 保留不动（高级功能）

## 必须遵守的坑

1. **开发用 Claude Code**（`claude -p`），禁用 kimi code
2. **分阶段 git commit**：每完成一块（A/B/C/D/E）单独 commit
3. **git add 仅限本任务路径**（app/），禁 `git add -A`；不碰 api/、packages/、PIPELINE_TASK_*.md
4. **不动后端**：后端 6 节点已收敛好，前端只对接
5. **不动 index.css 主题变量**（深色 design tokens 保留）
6. 语言切换是「开发阶段用字典实现」，不需要完整翻译所有页面——先覆盖
   Landing + 导航 + 核心操作词，页面内长文案可以先英文
7. 构建验证：`cd app && npx vite build`（或仓库根脚本）必须绿；不要求部署
8. 不启动浏览器实测（用户拒绝 headless Chrome）——构建通过 + 代码审查即可

## 验证步骤

1. `cd app && npx vite build` 成功（无 TS 错误）
2. 代码审查：6 节点与后端 DISPLAY_NODES 对齐；i2v UI 已移除；i18n 切换可用
3. 不部署、不浏览器测试（用户说后面再测试）

## 输出

- 每个 commit 的 hash + 说明
- 新增/修改文件清单
- vite build 结果
- 遗留事项（如 i18n 未覆盖的页面清单）
