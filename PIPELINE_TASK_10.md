# PIPELINE_TASK_10 — 快速生成视频页 + 提示词中心

工作目录：`/Volumes/Data/GitHub/ai-video-studio`
技术栈：Next.js 15 App Router + React + Tailwind v4（深色紫黑主题）+ Express API + Postgres + MinIO + Redis
后端：`api/src/`（Express 应用，routes/ 挂载到 /api）。流水线：`api/src/queue.js` + `api/src/steps/s*.js`，任务步骤 1..9，已支持 `config.model_override`（每类模型指定）。
前端：`src/app/app/`（应用区路由）、`src/components/app/layout/`（Sidebar/TopBar/AppLayout）、i18n：`src/i18n/{zh,en}.json` + `src/i18n/index.ts`（useTranslation/t）。
现有路由：`/app`（工作台，欢迎横幅+新建项目卡片+项目网格）、`/app/models`（模型配置两栏）、`/app/settings`、`/app/projects/[id]`（项目详情/向导）、`/app/prompts`（不存在，需新建）。

## 用户需求（已确认）

### 块 1：工作台 = 快速生成视频页
把 `/app`（当前是欢迎横幅+新建项目卡片+项目网格）改成**快速生成视频页**。项目网格**移出**工作台，放到独立 `/app/projects` 列表页（左侧导航 Dashboard=工作台=/app，Projects=项目列表=/app/projects）。

快速生成页结构（用户确认）：
- 顶部切换两个入口：**【直接使用文案】** / **【AI 二创】**
- **直接使用文案**（上半区）：
  - 项目名称（输入）
  - 文案（textarea，粘贴文案）
- **AI 二创**（上半区，切换后显示）：
  - 名称（输入）
  - 二创原文（textarea）
  - 二创提示词（textarea，可后期从提示词中心选取填充）
- **共用配置区**（两入口一样，下半区）：
  - 大模型渠道：语言模型（下拉，选 LLM）、画风模型（下拉，选生图模型）
  - 配音设置：配音模型（下拉）、音色（下拉）、语速（滑杆 0.5x~2.0x）、【试听】按钮（调 TTS 试听一段）
  - 背景音乐（选填）：【上传 BGM】按钮（上传音频文件存 MinIO）
  - 视频模型（选填）：下拉（i2v 视频模型，可不选 = 默认 static 流程）
- 底部：【开始生成视频】大按钮 → 创建项目（POST /api/projects）→ 自动进入流水线 → 跳转 `/app/projects/[id]`

下拉数据来源：复用**模型配置中心**（model_configs 表）按类型列出已有模型（LLM / 图像 / TTS(+音色) / i2v），通过现有 `/api/model-configs` 查询。语言模型=LLM 类、画风模型=图像类、配音模型=TTS 类（含音色两级）、视频模型=i2v 类。
试听：复用 `/api/model-configs/test`（已有 TTS 真实连通性测试返回音频）或单独 TTS 试听端点，生成一小段该音色的试听音频返回给前端播放。

### 块 2：提示词中心
- 左侧导航**设置旁边**新增**【提示词】**入口（`/app/prompts`）。
- 页面：提示词**列表 + 详情（创建/编辑/删除）**，两栏或列表+表单。
- 每条提示词字段（用户确认）：
  - 类型（单选，7 大类之一）：`商品解析 / 对标分析 / 文案模板 / 标题生成 / 画面风格 / 分镜拆解 / 合规规则`
  - 模板名称
  - 调用场景
  - 提示词正文
  - 标签
  - 状态 ①启用（启用/停用）②默认（是否设为默认模板）
- 后端：新增 `prompts` 表 + `/api/prompts` CRUD（list/create/update/delete）。

## 后端改动
1. `projects` 表/创建支持：POST /api/projects 扩展 body 支持 `{ title, prompt(文案或二创原文), source_type, ai_creative?(bool), creative_prompt?, bgm_key?, config: { model_override, voice, speed, video_model } }`。创建项目后**自动 run**（现有 runProject 已支持 source_text + config.model_override）。
   - `config.model_override`：把语言模型/画风模型/配音模型/音色/语速/视频模型映射进现有 model_override（参考 Task 6/7 的 sanitizeModelOverride 与白名单格式）。
   - `config.bgm_key`：BGM 音频的 MinIO key，传入流水线供合成阶段混音（若 render 混音实现复杂，至少做到上传存储 + 配置传递，混音可标记 TODO）。
   - 视频模型：选了 i2v 模型 → 流水线走 i2v 分支（现有 i2v 支持，参考 Task 4/8：i2v 分支 7 节点）。不选 = static 分支。
2. 新增 `prompts` 表：`id uuid PK, user_id text, type text(7类之一), name text, scenario text, body text, tags text[], enabled bool default true, is_default bool default false, created_at, updated_at`。CRUD 按 user 隔离。
3. 新端点：`/api/prompts`（GET list / POST create / PUT :id / DELETE :id）。

## 前端改动
1. 工作台 `/app` 重写为快速生成页（两入口切换 + 配置区 + 开始生成）。项目网格移到 `/app/projects`（新建独立列表页）。
2. Sidebar 导航：Dashboard=/app，Projects=/app/projects，新增【提示词】=/app/prompts（放 Settings 旁边，Account 分组内）。
3. 提示词中心页 `/app/prompts`（列表+创建/编辑/删除，字段齐全）。
4. i18n：zh.json/en.json 补齐快速生成页 + 提示词中心所有文案。
5. 深色紫黑主题（沿用现有 token）、响应式。

## 硬性约束
- R1 红线：任何 key 不得明文进前端/日志/代码，加密存储（现有 AES-GCM）。模型测试/试听复用现有加密解密，不回显密钥。
- React #310：hooks 必须无条件执行，所有 useMemo/useState 在提前 return 之前（参考现有 projects/[id]/page.tsx 的修复模式）。
- 不破坏现有 /app/models、/app/projects/[id]（向导）、/app/settings。
- 7 服务 Docker 容器最终必须 healthy，无孤儿进程。
- i18n 默认跟随浏览器语言，顶栏 🌐 切换。

## 完成标准
1. `/app` 快速生成页可切换两入口、可填配置、点【开始生成视频】创建项目并跳转详情、任务跑起来。
2. 模型下拉从 model_configs 读真实数据；试听能出声音；BGM 能上传存储；视频模型选 i2v 走 i2v 分支。
3. `/app/projects` 项目列表页正常；工作台不再显示项目网格。
4. 提示词中心 CRUD 全通，7 类型、状态启用+默认生效。
5. 回归：/app/models、/app/projects/[id] 向导、/app/settings 正常；React #310 无崩溃（headless 验证 ERRORS:0）。
6. 全部提交并 push。

## 执行方式
后台执行，完成后汇报改动文件清单 + 验证结果 + commit。严格遵守 R1。
