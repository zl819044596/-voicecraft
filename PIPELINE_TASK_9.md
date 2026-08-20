# AI Video Studio — Task 9: UI 重设计（深色紫黑主题 + 侧边栏布局 + i18n 中英切换）

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 上游设计依据：
> - 设计规范（绘境出品）：`/Volumes/Data/GitHub/ai-video-studio/docs/design-spec-v2.md`（布局系统/组件/令牌/i18n 结构）——**必读**
> - 破局AI带货系统截图（用户参考，深色黑紫风格）：`/Volumes/Data/qq/*.png`
> - 产品 PRD：`/Volumes/Data/qq/ai-video-studio-prd-v2.md`（导航 IA 参考）

## 背景
用户反馈当前页面布局太乱，要求重新设计；平台需支持中英文切换。已确定综合方案：
**深色紫黑视觉（贴近破局）+ 绘境「侧边栏+顶栏+内容区」布局 + 全站 i18n（zh/en）**

## 一、视觉主题（深色紫黑，唯一主题，默认深色，本任务不做亮色切换）
- 全局深色背景（近黑 `#0B0B0F` / 面板 `#121218` / 悬停 `#1A1A24`）
- 品牌主色=紫（accent `#8B5CF6` 系列，hover `#7C3AED`），辅以黑
- 文本：主 `#EDEDF3` / 次 `#A1A1B5` / 弱 `#6E6E82`
- 边框 `#262632`
- 语义状态色保留清晰可辨（成功绿/警告黄/错误红/信息蓝/节点过期橙），在深色底上微调亮度
- 更新 `src/app/globals.css` 与 tailwind 配置，用 CSS 变量定义主题令牌（可直接参考 design-spec-v2.md §4 的 token 结构，但把 Light 值换成上述深色值，去掉亮色）
- 紫色仅作强调（按钮主色、Logo、active 状态、链接、进度），大面积背景保持黑灰，避免廉价感

## 二、布局重构（应用区 /app*）
按 design-spec-v2.md §2 布局系统，但应用深色主题：
1. 新建组件：
   - `src/components/app/layout/Sidebar.tsx`（240px 固定；顶 Logo+产品名；分组导航：Workbench 组=Dashboard/Projects、Account 组=Models/Billing/Settings；底部固定用户区=头像+邮箱+Log out；active 高亮紫、hover 提亮；参考 design-spec §2.2 与破局左侧导航）
   - `src/components/app/layout/TopBar.tsx`（56px；页面标题 + 右侧语言切换器[🌐 中/EN] + 用户头像菜单；design-spec §2.3）
   - `src/components/app/layout/AppLayout.tsx`（组合 Sidebar+TopBar+内容区，max-w-6xl 内容容器；<1024px 侧边栏收进汉堡抽屉）
2. `src/app/app/layout.tsx` 改用 AppLayout 包裹全部应用页
3. **删除 `src/components/AppNav.tsx`**（其职责由 Sidebar+TopBar 取代）；确认无残留引用
4. 工作台 `/app`（design-spec §6.3）：欢迎区 + 新建项目卡片（标题/prompt/创建按钮融入）+ 项目卡片网格（2-3 列，封面区/标题/进度/状态徽标）——去掉表单与列表堆叠的旧式
5. 项目详情向导 `/app/projects/[id]`（design-spec §6.4）：保留左节点栏+右内容区的两栏结构，深色化；移除冗余的「← Back to Dashboard」链接（侧边栏已提供导航）；节点状态徽标用深色主题色
6. 模型配置 `/app/models`（design-spec §6.5）：两栏深色化，风格统一

## 三、i18n（中英切换）
按 design-spec-v2.md §7 实现（可自建轻量方案，不必引 next-intl 依赖）：
1. 新建 `src/i18n/en.json` + `src/i18n/zh.json` + `src/i18n/index.ts`（含 `useTranslation`/`t(path)`/`setLocale`，localStorage 键 `locale` 持久化，默认跟随 `navigator.language`，字典键参考 design-spec §7.2 覆盖：common/nav/app/pipeline/pipelineStatus/models/marketing/settings）
2. 顶栏语言切换器：点击弹出 English / 简体中文 两项，选择即切（写 localStorage + reload）
3. 覆盖范围：**应用区全部页面文案 + 营销首页 /login + 营销区导航/页脚**（SEO 工具页 /tools /scenarios 等可暂缓，但公共组件与主流程页必须覆盖）
4. 布局考虑：英文比中文长 30-50%，按钮/标签用 `whitespace-nowrap`/`truncate` 防溢出（§7.5）

## 四、清理（design-spec §3.3 / §8.4）
- 删除 `/settings/models`（与 `/app/models` 重复）
- 删除 `src/app/settings/layout.tsx`（不再需要独立 layout）
- 删除 `AppNav.tsx`
- 营销区 `Nav.tsx` 保留但精简（移除指向应用区的 Dashboard/App 链接）

## 五、R1 红线（必须遵守，不可违反）
- API Key 绝不进前端/日志/URL/localStorage；密钥只回显掩码（如 `TN-…9K7g`）
- 本任务只改前端 UI/样式/i18n/布局，**不改任何后端逻辑**；若发现后端依赖前端某路由，保留路由或重定向

## 六、验证（完成后必须执行并汇报）
1. `docker compose build web && docker compose up -d web`，7 服务全 healthy，无孤儿容器
2. 用浏览器/curl 验证路由：`/app`、`/app/projects/[id]`、`/app/models`、`/`、`/login` 均 200 且深色主题渲染正常
3. 语言切换器可用：切 EN→页面变英文，切中→回中文；reload 后保持（localStorage）
4. 侧边栏导航跳转正确、active 高亮正确、用户区显示正常
5. 无 `AppNav` 残留引用；`/settings/models` 已清理；`grep -r "AppNav" src/` 无结果
6. 关键容器日志无 JS 报错（尤其无 React hook 崩溃——注意 hooks 必须在早退 return 之前，参考此前 React #310 教训）

## 七、交付
- 代码提交（git add -A && commit）到当前 main 分支（**不要 push**，留待复核后统一 push）
- 汇报：改动文件清单 + 验证结果 + 遗留事项
