# AI Video Studio — Stage 5a Task: 数据模型 + 任务状态机 + 工作台框架

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 当前状态：Stage 0-3 完成（骨架/BYOK/合规/SEO）。7 服务 healthy。api 有 src/routes/keys.js 模式。
> 本阶段只做：**9 步流水线的数据模型 + 任务状态机 + API + 前端工作台框架**。步骤执行器（调 LLM/生图/TTS）、ffmpeg 合成、导出 zip 是下一阶段，**本阶段不做**。

## 必须遵守（踩过的坑）
1. **不要 `docker compose down`**。完成后 `docker compose up -d --build` 重建（api/web 镜像），其他不动。
2. **不留孤儿容器**：完成后 `docker compose ps` 必须恰好 7 个服务（api/minio/nginx/postgres/redis/render/web），名字 `ai-video-studio-` 前缀。多余容器 `docker rm -f` 清掉。
3. 用户体系：当前无 OAuth，沿用 `dev` 用户（与 /api/keys 一致，字段预留 user_id）。
4. 写前先读：`ai-video-studio-prd-v3.md` §4.2（9 步流水线定义）、§10（Route Contract）、§13（数据实体）；`development-spec-v1.md`；现有 `api/src/index.js`、`api/src/routes/keys.js`、`src/app/settings/page.tsx`（样式/风格参考）。

## 9 步流水线定义（PRD §4.2，状态机基础）
S1 选题 → S2 文案 → S3 分镜 → S4 逐镜生图 → S5 配音 → S6 字幕 → S7 合成（static ffmpeg / i2v 可选，MVP 先 static）→ S8 开放导出 zip → S9 复检

## 任务清单

### 1. PostgreSQL 数据模型（启动时幂等建表，跟 api_keys 一致的方式）
- `projects` 表：id UUID PK、user_id TEXT NOT NULL DEFAULT 'dev'、title TEXT、prompt TEXT（用户原始输入）、status TEXT（draft/running/done/failed）、created_at、updated_at
- `tasks` 表（每步一行）：id UUID PK、project_id UUID FK→projects ON DELETE CASCADE、step INT（1-9）、name TEXT（S1选题…S9复检）、status TEXT（pending/running/done/failed）、input JSONB、output JSONB、error TEXT、created_at、updated_at
- 索引：projects(user_id)、tasks(project_id, step)
- 创建项目时自动为该 project 生成 9 行 tasks（step 1-9，status=pending）

### 2. API 路由（api/src/routes/ 新文件 projects.js，挂在 index.js）
- `POST /api/projects` — body {title, prompt} → 创建 project + 9 条 task，返回 project 含 9 步状态
- `GET /api/projects` — 当前用户项目列表（含每项目最新状态）
- `GET /api/projects/:id` — 项目详情 + 9 步状态（tasks 数组）
- `DELETE /api/projects/:id` — 删除项目（级联删 tasks）
- `POST /api/projects/:id/run` — 触发流水线（MVP：仅把第一步置为 running 并返回；真正的执行器是下一阶段。可先返回 501 或标记 step1 running 占位）
- 校验：project 属于当前 user（dev）；非法 id 返回 404

### 3. 前端工作台（src/app/app/ 下，SEO noindex）
- `/app` — 工作台首页：项目列表（卡片：标题、状态、9 步完成度 bar）+ 新建项目表单（title + prompt）
- `/app/projects/[id]` — 9 步流水线详情页：
  - 顶部：项目标题 + 总体状态
  - 9 步垂直时间线/步骤列表：每步显示名称、状态徽标（pending/running/done/failed 四色）、可展开的 output 摘要（本阶段多为空，占位）
  - 一个 Run Pipeline 按钮（调 POST /api/projects/:id/run）
- 导航（src/app/layout.tsx 或 AppLayout 组件）：出海化导航 Dashboard(/app)/Projects(/app)/BYOK Settings(/settings)/Billing(占位)
- 全部 App 区页面 metadata robots noindex（参考 settings 的做法）
- 风格沿用现有深色/zinc 设计
- 前端用 client component + fetch 调 /api/projects（走 nginx 反代）

### 4. 首页/导航入口
- 在首页营销 hero 或导航加 "Open App" / "Dashboard" 入口指向 /app（让用户能进入工作台）

## 验证（必须真实执行并贴证据）
1. `docker compose up -d --build`（重建 api/web）→ 全 healthy
2. `curl -s -X POST localhost/api/projects -H 'Content-Type: application/json' -d '{"title":"Test","prompt":"make a 30s product video"}'` → 返回 project id + 9 步 tasks 全 pending
3. `curl -s localhost/api/projects` → 列表含该项目
4. `curl -s localhost/api/projects/<id>` → 详情含 9 步
5. 进 postgres 查库：`docker compose exec postgres psql -U avs -d ai_video_studio -c "SELECT count(*) FROM tasks;"` → 9（新项目）
6. `curl -s -o /dev/null -w "%{http_code}" localhost/app` 和 `localhost/app/projects/<id>` → 200
7. /app 页面含项目列表 + 新建表单；/app 页面 metadata 含 noindex
8. `docker compose ps` 恰 7 服务无孤儿
9. DELETE 测试：`curl -s -X DELETE localhost/api/projects/<id>` → 204，查库确认 tasks 级联删除

## 输出格式
- 改动/新增文件清单（绝对路径）
- 验证 1-9 证据
- projects/tasks 表结构
- 遗留事项（下一阶段步骤执行器/合成/导出）