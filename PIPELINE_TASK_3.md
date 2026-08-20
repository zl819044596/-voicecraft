# AI Video Studio — Task 3: 本地假登录（Mock Auth）

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 当前状态：Stage 0-5b 完成（7 服务 healthy，wingray 真 provider 端到端已通）。**user_id 目前固定 'dev'，无任何登录。**
> 本阶段只做：**本地假登录**（用户指示 2026-08-08：上线前先做假登录，OAuth 后置）。

## 必须遵守（每一条都踩过坑）
1. **不要 `docker compose down`**。完成后 `docker compose up -d --build` 重建 web+api（其他服务不动），验证。
2. **不留孤儿容器**：完成后 `docker compose ps` 必须恰好 7 个服务，名字 `ai-video-studio-` 前缀。多余 `docker rm -f`。
3. **R1 红线**：假登录与 API Key 无关——**不得**在 localStorage/sessionStorage 存任何 key 明文；localStorage 只允许存假登录的 user 信息（name/email/userId，非密钥）。
4. 访问用 `https://localhost` + curl 加 `--noproxy '*'`。api 容器 DNS 已配（223.5.5.5），不要动。
5. 写前先读：`src/app/` 现有页面结构（app/工作台、settings）、`api/src/index.js`（路由挂载）、`api/src/routes/*.js`（现有路由的 DEFAULT_USER 用法）、`src/app/settings/page.tsx`（现有 key 配置页，会挂登录守卫）。

## 设计（本地假登录，为 OAuth 预留）

### 1. 后端 auth（api/src/routes/auth.js 新建 + auth 中间件）
- `POST /api/auth/login` — body {name, email}（本地假登录，无密码）；返回 {user:{id:'dev', name, email, isMock:true}, token:'mock-<rand>'}; **校验 email 格式 + 必填**；R5 年龄门槛由前端 checkbox 承担（后端也可收 age_confirmed:true 才放行）
- `POST /api/auth/logout` — 无状态，返回 {ok:true}
- `GET /api/auth/me` — 读请求里的 X-User-Id（或 Authorization: Bearer mock-xxx），返回 user 信息；无则 401
- **auth 中间件**（api/src/auth.js）：解析 X-User-Id header（假登录前端带）→ req.userId；**缺失时默认 'dev'**（保持现有数据兼容，所有旧路由不感知）。未来 OAuth 落地：X-User-Id 换成 JWT 校验的 google sub，中间件签名不变
- 现有所有路由（projects/tasks/keys/export）的 DEFAULT_USER 改为 `req.userId ?? 'dev'`（中间件先跑，挂在 app 级）
- 假登录模式下 **userId 恒为 'dev'**（本地共用一套数据，登录/不登录看到的项目一致，测试连贯）；真实 user_id 字段结构已预留（users 表可选建，OAuth 时用）

### 2. 前端（src/app/ 新建 login 页 + auth-context）
- `/login` 页：品牌标题 + 邮箱/昵称输入 + 18+ 确认 checkbox（R5）+ 登录按钮 → POST /api/auth/login → 存 localStorage `avs_session`（{name,email,userId,isMock}）→ 跳转原目标页（?next= 参数）
- `src/lib/auth-context.tsx`（或现有 auth 上下文扩展）：SessionProvider + useAuth()（user/登录/登出/isLoggedIn）；启动时从 localStorage 读 session，调 /api/auth/me 校验
- **登录守卫**：/app、/app/projects/[id]、/settings 未登录 → 重定向 /login?next=<原路径>；营销页（首页/tools/scenarios/合规页）不守卫
- 顶栏/导航加登录状态（已登录显示昵称+登出按钮，未登录显示 Log in 链接）
- 所有前端 API 请求（fetch wrapper 或 api client）带 `X-User-Id: <userId>` header（从 session 取，无则 dev）

### 3. 其他
- 保持全站英文（US 市场，页面文案英文）
- /login 页 metadata noindex
- 不引入任何 OAuth 依赖（google 库等都不装），纯本地假登录

## 验证（必须真实执行并贴证据）
1. `docker compose up -d --build` → 全 healthy
2. `curl POST /api/auth/login`（带 name/email/age_confirmed）→ 200 返回 user；不带 email → 400
3. `curl GET /api/auth/me` 带 X-User-Id → 200 user；不带 → 401（或按设计）
4. **未登录访问 /app → 302/重定向到 /login**（curl 验证）；登录后（带 session）访问 /app → 200
5. 现有业务回归：建项目+跑任务（mock 模式即可）+GET /api/keys 正常（userId 缺省 dev 兼容）
6. **localStorage 无 key**：前端代码 grep 无 key 持久化新增
7. `docker compose ps` 恰 7 服务无孤儿

## 输出格式
- 改动/新增文件清单（绝对路径）
- auth 流程说明（登录→守卫→请求头→后端解析）
- 验证 1-7 证据
- 遗留事项（OAuth 落地时的替换点）
