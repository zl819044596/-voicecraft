# PIPELINE_TASK_15 — app/ 前端接真实后端（阶段①：API 基础层 + 认证打通）

## 背景
ai-video-studio 项目新前端 = 仓库根目录 `app/`（Vite 7 + React 19 + TS + Tailwind + shadcn/ui，
用户自己搭建，**是项目正式前端，勿动其设计**）。当前全部页面用 `src/lib/demo.tsx` 的
DemoProvider + `src/lib/task-wizard-mock.ts` mock 数据，**未接真实后端**。
本任务分多阶段把前端数据层替换为真实 API（后端 rebuild-v3 已部署，7 容器 healthy）。

**本次范围（阶段①）= P1 API 基础层 + P2 认证打通。** 后续阶段（业务页接入/核心流程/部署）另行派单。

## 后端现状（事实，勿猜）
- 后端代码 `api/`（Express TS），nginx 反代，所有接口挂 `/api` 前缀
- 认证 = session cookie：`avs_session`（HttpOnly / SameSite=Lax / 30 天 / https 下 Secure），
  会话载荷存 Redis（`api/src/session.ts`：`SESSION_COOKIE='avs_session'`、`requireAuth`/`optionalAuth` 中间件）
- 登录 = magic link：`api/src/routes/auth.ts`（POST 发送验证邮件 / POST 验证 token / GET me 等，
  **以该文件为准**）；本地 dev 无 SMTP 时验证链接打印在 api 容器日志
  （`docker logs ai-video-studio-api-1`，可提取 token 用 `?token=` 链接登录）
- 路由清单：`api/src/index.ts` 里 `app.use('/api/xxx', ...)` 逐一对照
- **契约铁律：一切字段名/响应结构以 `api/src/routes/*.ts` 源码现状为准**（v3 重构后前端旧文档不可靠）

## 交付物（阶段①）
### P1 API 基础层
1. `app/src/lib/api.ts`：fetch 封装
   - `credentials: 'include'`（cookie 会话）
   - base = `/api`（同源相对路径，开发走 vite proxy，部署走 nginx 同域）
   - 统一错误处理：401 → 跳 `/login`；402/410 等业务错误 → 结构化抛出；网络错误 → 友好提示
   - 导出 `get/post/put/del` 简写 + `apiFetch` 原始封装
2. `app/src/lib/types.ts`：后端契约类型（对照 routes 现状：Project/Task/StepResult/Product/
   Benchmark/Prompt/ModelConfig/Credits/Account 等，**以实际响应为准**，别照旧文档编）
3. `app/vite.config.ts`：加 dev proxy —— `/api` → `https://localhost`（后端 nginx 443，自签证书
   **必须 `secure: false`**），`changeOrigin: true`
4. `app/.env`（如需要）：`VITE_API_BASE` 可覆盖（默认 `/api`）
5. **DemoProvider 保留**：`demo.tsx` 加 `mode: 'demo' | 'real'` 开关（默认 `real`），
    DemoConsole 提供切换按钮——demo 模式走 mock、real 模式走 api（各页面后续阶段接）

### P2 认证打通
6. `Login.tsx`：接真实 magic link 流程（对照 `api/src/routes/auth.ts`）：
   发验证 → 输 token（或支持 `?token=` URL 参数自动验证）→ 成功后跳 `/app`；
   同时保留 demo 登录入口（DemoConsole 切 demo 模式时）
7. `AppShell.tsx`：加登录守卫——进入 `/app/*` 先 `GET /api/auth/me`（或 auth.ts 的实际端点），
   未登录跳 `/login`；顶栏用户信息/积分从真实接口取（`/api/credits`、account）
8. 登出：调登出端点 + 清 cookie + 跳 `/login`
9. 保留 DemoConsole 整体框架不动（demo/real 切换 + 场景按钮在 real 模式下禁用或隐藏）

## 必须遵守的坑（都踩过）
1. **只动 `app/` 目录**：仓库 rebuild-v3 工作区有 5 个未提交文件（`src/app/app/page.tsx` 等，
   是 Next.js 工作台重构，与本任务无关）——**git add 只允许 `app/` 路径**，禁止 `git add -A`/`git add .`
2. **分阶段 git commit**：每完成 P1 / P2 各提交一次（`feat(app): ...`），提交信息带 `app/` 前缀
3. **契约对照**：写类型/客户端前先读对应 routes 文件（projects/tasks/credits/account/auth），
   字段名以代码为准；不确定的端点先 `curl --noproxy '*' https://localhost/api/...` 实测
4. **自签证书**：vite proxy target 必须 `secure:false`；容器内/脚本内 curl 加 `--noproxy '*' -k`
5. **不要改设计**：页面布局/样式/文案是用户定稿的，只改数据来源
6. `tsc -b` 必须 0 错误；`npm run build` 必须通过
7. 不启动任何长驻服务（vite dev 由听潮验证时启动）；不 `docker compose` 任何操作

## 验证步骤（每阶段完成后）
- [ ] `cd app && npx tsc -b --noEmit` 0 错误
- [ ] `cd app && npm run build` 通过
- [ ] vite dev 起（听潮验证）：`/api` proxy 通（浏览器访问 dev 页，Network 面板 /api 请求 200 且非 404/502）
- [ ] 登录链路实测（听潮/你配合 docker logs 提取 token）

## 输出格式（最终汇报）
```
## 阶段①完成
- 改动文件清单（app/ 内）
- 提交 hash 列表（git log）
- API 客户端用法示例（1-2 行）
- 认证流程说明（端点 + 时序）
- 验证记录（build/tsc 结果）
- 遗留/待办（下一阶段注意）
```

---

# 阶段②（P3 业务页数据接入）— PIPELINE_TASK_15 续

## 范围
把 8 个业务页的数据源从 DemoProvider/mock 切到真实 API（**P4 核心流程 QuickGenerate/TaskWizard 另派**）。
页面**布局/样式/文案一律不动**，只换数据来源。

## 页面 × 端点映射（契约以 api/src/routes/*.ts 现状为准，先读文件再写）
| 页面 | 端点 | 说明 |
|---|---|---|
| Dashboard | GET /api/projects（或 /api/tasks 列表）+ GET /api/credits + GET /api/auth/me | 指标卡/最近任务/项目表真实数据 |
| Products | GET/POST/PUT/DELETE /api/products | 商品 CRUD |
| Benchmarks | GET/POST/PUT/DELETE /api/benchmarks | 对标 CRUD |
| Assets | GET/POST/DELETE /api/assets | 素材 CRUD |
| Prompts | GET/POST/PUT/DELETE /api/prompts | 提示词/模板中心 CRUD |
| Models | GET/POST/PUT/DELETE /api/model-configs（+ /test 连通测试 + /preview TTS 试听） | 模型配置中心 |
| Billing | GET /api/billing + GET /api/credits（+ ledger） | 账单/积分 |
| Settings | GET/PUT /api/account + GET/POST/DELETE /api/credentials | 个人资料/密钥 |

## 实现要点
1. 每个页面：真实模式走 `lib/api.ts`（get/post/put/del），demo 模式走原 mock
   （`useDemo()` 的 `mode` 决定，页面顶部 DemoConsole 可切）
2. 列表页支持 loading / empty / error 三态（现有 EmptyState 组件复用）
3. 表单提交用真实 API，成功后刷新列表（乐观更新或 refetch 均可）
4. 字段名/分页结构（`{items,page,size,total}`）对照 types.ts 与 routes 源码
5. Dashboard 指标卡的「模型通道」等计数若后端无对应聚合，用现有端点拼（如 model-configs 按 class 计数）

## 必须遵守的坑（同阶段①）
1. **只动 app/ 目录**，git add 仅限 app/ 路径（工作区仍有 Next.js 未提交文件，勿碰）
2. 分阶段 git commit：每页或每 2 页一个提交（`feat(app): 接入 <页> 真实 API`）
3. 契约铁律：字段以 routes 源码为准，不确定先 curl `--noproxy '*' -k` 实测
4. 不改设计/布局/文案；tsc -b 0 错误；npm run build 通过
5. 不启动长驻服务；不 docker compose 操作

## 验证（每页完成后）
- [ ] tsc 0 错误、build 通过
- [ ] 登录后（会话 cookie）各页真实数据请求 200（听潮/你配合实测）
- [ ] demo 模式仍可切回（回归）

## 汇报格式
```
## 阶段②完成
- 每页：改动文件 + 提交 hash + 实测结果（curl 状态码）
- 遗留问题
```

---

# 阶段③（P4 核心流程：QuickGenerate 三模式 + TaskWizard S1-S6）— PIPELINE_TASK_15 续

## 范围
最后的大块：**QuickGenerate 页三模式创建任务真实化 + TaskWizard 任务向导接真实数据流**。
页面布局/样式/文案一律不动，只换数据来源（demo 模式保留可切回）。

## 端点映射（契约铁律：以 api/src/routes/*.ts 源码现状为准，先读文件）
| 功能 | 端点 |
|---|---|
| 三模式创建（直接/AI二创/AI创业）| POST /api/projects（body 字段对照 projects.ts 的 buildQuickGenConfig：source_text/creative_prompt/product 关联/config{llm,image,tts,video_model}/prompts/templates）|
| 运行流水线 | POST /api/projects/:id/run（对照 tasks.ts）|
| 任务详情（rail 状态 + storyboard shots + assets + steps）| GET /api/tasks/:id |
| S1 文案版本/重生成 | POST /api/tasks/:id/script/versions {op:'save'\|'select'}、/script/regenerate {instruction}（**op 字段，别用 action**）|
| S2 分镜编辑/重新拆分 | PUT /api/tasks/:id/node、任务详情里 shots 结构（标题/内容/字幕/图片提示词/比例）|
| S3 生图候选/参考图/重生成 | POST /api/tasks/:id/shots/:index/candidates、/select-candidate、/ref、regenerate 端点 |
| S4 配音/BGM/字幕/试听 | /shots/:index/voice、/bgm、subtitle 设置（config.subtitle）、/model-configs/preview |
| S5 复核 | 任务详情 steps payload 的 review 字段（passed/feedback）|
| S6 生成视频/导出 | i2v clips（任务详情）+ GET /api/export/...（zip 下载用原生 <a download>，别 fetch blob）|

## 实现要点
1. QuickGenerate 提交走真实 POST /api/projects，成功后跳 `/app/tasks/:id`；模型下拉数据来自
   GET /api/model-configs（真实配置），demo 模式才用 mock
2. TaskWizard：真实模式加载 GET /api/tasks/:id（rail 状态按步骤推进），节点编辑/重生成调对应端点；
   demo 模式仍走 task-wizard-mock.ts
3. 轮询：任务 running 时 2-3s 轮询任务详情刷新 rail/节点（参考旧前端做法）
4. 导出下载用原生 `<a download href="/api/export/...">`（大文件流式，别 fetch→blob）
5. 401 由 api.ts 自动跳登录，页面无需处理

## 必须遵守的坑（同前）
1. 只动 app/ 目录；git add 仅限 app/ 路径；分阶段提交（每节点/每 2 节点一个 commit）
2. 契约铁律：字段以 routes 源码为准，不确定先 curl `--noproxy '*' -k` 实测
3. 不改设计/布局/文案；tsc -b 0 错误；npm run build 通过
4. 每完成一大块（QuickGenerate / 每个 S 节点）写入 /tmp/task15-phase3-progress.md 防丢
5. 不启动长驻服务；不 docker compose 操作

## 验证
- [ ] tsc 0 错误、build 通过
- [ ] 真实登录后：创建任务（三模式各 1）→ 任务详情加载 → 各节点数据 200（听潮配合实测）
- [ ] demo 模式回归可切

## 汇报格式
```
## 阶段③完成
- 每块：改动文件 + 提交 hash + 实测结果
- 遗留问题
```

---

# 阶段④（P5 验证 + 部署）— PIPELINE_TASK_15 续

## 目标
app/ 前端（Vite SPA，产物 `app/dist`）部署上线，nginx 托管静态 + `/api` 反代同域，
真实登录 → 创建任务 → 任务向导全流程可用。

## 部署方案（已定）
- 新增静态服务：`app/` 用 nginx 或轻量静态容器托管 `dist/`（**方案：nginx 直接服务或新容器 avs/app**，
  以现有 compose/nginx 结构最简方式落地——nginx `/` → app 静态文件，`/api` → api 容器不动）
- cookie 同域：app 与 api 同域（192.168.101.45），`avs_session` cookie 自动携带，无需 CORS
- `web`（Next.js）容器：**保留不动**（备用），nginx `/` 切到 app 静态
- SPA 路由：nginx 需 `try_files $uri /index.html` 兜底（/app/* 前端路由）
- 静态资源缓存：`/_next` 不存在（Vite 用 `/assets`），加 `assets` 长缓存 + gzip

## 实施步骤
1. `app/.env`（如需要 VITE_API_BASE）→ `npm run build` → 产物 dist/
2. compose/nginx 改造（对照现有 deploy 配置）：
   - nginx conf 加 `location / { root /www/app; try_files $uri /index.html; }`（或新容器）
   - 保留 `location /api/ { proxy_pass api_upstream; }`
   - `location /assets/ { expires 30d; }` + gzip
3. `docker compose up -d --build`（涉及服务）+ reload nginx
4. 验证（见下）

## 验证清单
- [ ] `https://192.168.101.45/` → app 前端首页（非 Next.js 页面）
- [ ] `/app/*` 前端路由直接访问 200（SPA fallback）
- [ ] 登录：发 magic link → 邮箱/日志 token → 验证 → 进入 /app（cookie 同域生效）
- [ ] 创建任务 → 任务详情 → 节点数据 200（/api 反代正常）
- [ ] Next.js web 容器未受影响（或已按用户意见处理）

## 坑
1. 只动部署相关文件（deploy/、docker-compose.yml、app/）；git add 限相关路径
2. 自签证书：curl `--noproxy '*' -k`；nginx reload 用 `docker exec <nginx> nginx -s reload`
3. 改完 nginx/compose 必须 `docker compose config` 校验 + reload 后 curl 实测
4. 分阶段提交

## 汇报格式
```
## 阶段④完成
- 部署改动文件 + 提交 hash
- 验证结果（各 URL curl 状态）
- 遗留问题
```
