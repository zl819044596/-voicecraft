# PIPELINE_TASK_12 — 前台按破局静态原型精细重做

工作目录：`/Volumes/Data/GitHub/ai-video-studio`（当前分支：`feat/shop-video-frontend`）
静态基准：`/Users/zhl/shop-video-clone/`（用户手绘的破局前台静态原型，唯一视觉/功能基准）

## 目标
把 `src/app/` 前台页面**全部重做**，布局和功能点与 `/Users/zhl/shop-video-clone/` 下的静态原型**一模一样**（样式、结构、交互点对齐）。**核心视频生成流水线/后台业务完全不变**（api/src 的 tasks/steps/render 不动，只加新模块）。

## 基准文件（先通读，逐页对照）
- `index.html` 工作台 · `pages/quick.html` 快速生成 · `pages/tasks.html` 视频任务
- `pages/task-new.html` 新建任务 · `pages/task-detail.html` 任务详情（1002 行，含节点流程）
- `pages/products.html` / `product-new.html` / `product-detail.html` 商品库
- `pages/benchmarks.html` / `benchmark-new.html` 对标库
- `pages/projects.html` 项目库 · `pages/templates.html` 模板中心 · `pages/assets.html` 素材库
- `pages/settings.html` 系统设置 · `pages/profile.html` 个人资料 · `login.html` 登录（样式参考，登录逻辑保持我们的假登录）
- `css/style.css` 设计令牌（587 行，浅/暗双主题，紫色 accent）→ 迁移到现有 Tailwind 主题变量

## 页面映射（把静态 HTML 转成 React 页面）
| 静态文件 | React 路由 |
|---|---|
| index.html | src/app/app/page.tsx（工作台） |
| quick.html | src/app/app/quick/page.tsx（快速生成） |
| tasks.html | src/app/app/tasks/page.tsx（视频任务列表） |
| task-new.html | src/app/app/tasks/new/page.tsx |
| task-detail.html | src/app/app/tasks/[id]/page.tsx（节点流程详情） |
| products.html | src/app/app/products/page.tsx |
| product-new.html | src/app/app/products/new/page.tsx |
| product-detail.html | src/app/app/products/[id]/page.tsx |
| benchmarks.html | src/app/app/benchmarks/page.tsx |
| benchmark-new.html | src/app/app/benchmarks/new/page.tsx |
| projects.html | src/app/app/projects/page.tsx |
| templates.html | src/app/app/templates/page.tsx |
| assets.html | src/app/app/assets/page.tsx |
| settings.html | src/app/app/settings/page.tsx |
| profile.html | src/app/app/profile/page.tsx |
| login.html | src/app/login/page.tsx（样式参考，保持假登录） |

## 关键约束
0. **保留我们已有的增强小功能**（破局静态里没有的也要加上）：提示词中心（提示词模板 CRUD 7 类）、模型中心（模型配置 CRUD/测试）、节点增强（重新生成/版本/候选图/参考图/BGM/字幕节奏）、i18n 中英切换、亮/暗主题切换等——这些是我们相对破局的增值功能，重做时**必须保留并融入新布局**，不得删减。核心视频流水线不变。
1. **布局/功能点对齐静态原型**：每个页面的模块结构、区块顺序、按钮、列表列、交互点按静态 HTML 原样还原；静态里没有的旧 UI 一律移除。
2. **侧边栏导航**：按静态原型的导航（快速生成视频/工作台/视频任务/商品库/对标库/项目库/模板中心/素材库/系统设置），分组与图标一致。
3. **核心流水线不变**：任务创建/运行/重生成/候选图/节点编辑等现有 API 全部保留，前端调用的接口不变（路径可能因页面迁移调整，逻辑不动）。task-detail 的节点流程 = 现有向导节点（S1-S9）按静态样式重绘。
4. **样式**：迁移 css/style.css 的 design tokens 到现有主题（深色紫黑为主，保留亮色切换），组件样式（卡片/表格/按钮/badge/表单）按静态定义实现，可新增 CSS 模块或 Tailwind 变量。
5. **新增后端模块**（商品/对标/素材）：参考现有 prompts.js 的轻量 CRUD 模式，建表+API（products / benchmarks / assets），字段按静态页面的表单/列表定义。
6. **i18n**：新页面文案加入 zh/en 词典（zh 为主，en 直接复制或简译）。
7. **R1 红线**：密钥加密存储，前端/日志无明文；不引入真实 OAuth，登录保持假登录。
8. 现有 `src/app/app/projects/[id]/page.tsx` 的节点增强功能（Task 11：重新生成/版本/候选图/参考图/BGM/字幕节奏）**全部保留**，融入 task-detail 布局。

## 执行顺序
1. 通读全部静态文件，产出页面清单与组件拆解
2. 迁移样式令牌 + 公共组件（Sidebar/Topbar/Card/Table/Btn/Badge）
3. 按映射逐页实现（先工作台→快速生成→任务列表→任务详情，再商品→对标→模板→素材→设置→个人）
4. 新增后端模块（products/benchmarks/assets）
5. 自测：next build + 7 容器 healthy + headless 冒烟（路由 200、关键页面无 console error）
6. 提交（commit message: `PIPELINE_TASK_12: frontend rework per shop-video static prototype`）

## 汇报
改动文件清单、页面完成情况、验证结果、commit hash。
