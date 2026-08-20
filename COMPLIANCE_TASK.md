# AI Video Studio — Stage 2 Task: 合规三页 + 举报通道（R4/R5 红线）

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 当前状态：Stage 0 骨架 + Stage 1 BYOK 已完成并验证通过。7 服务 healthy 运行中。
> 本阶段只做：**合规页面**（development-spec-v1.md C 部分 + PRD §13.3 + R4/R5）。SEO 是后续阶段，不要做。

## 必须遵守
1. **不要 `docker compose down`**。改完代码后 `docker compose up -d --build` 重建，测试，**保持容器运行**。
2. 全部页面为**静态 Next.js 页面**（放 src/app/ 下），英文文案（US 默认，符合 R5）。
3. 遵循现有页面样式（参照 src/app/settings/page.tsx 或 page.tsx 的深色/zinc 风格，做干净的内容页排版）。
4. 处理者清单**不含 Cloudflare**（REV4 已移除，全 Docker 自托管）。
5. 写前先读：`development-spec-v1.md` C 部分、`ai-video-studio-prd-v3.md` §13.3、§14 R4/R5。

## 任务清单

### 1. /privacy — Privacy Policy（src/app/privacy/page.tsx）
内容必须含（英文，可合理组织章节）：
- **第三方处理者清单**：Google OAuth（登录）｜ OpenAI / Anthropic（LLM 文本生成）｜ fal.ai / Flux（图像生成；图生视频 i2v 可选：Kling/Hailuo/Runway/Luma）｜ ElevenLabs / OpenAI（TTS）｜ Creem（支付处理，Merchant of Record）｜ GA4 / Clarity（匿名分析）
- **自托管组件说明**：以下由平台在自有/租用服务器上以 Docker 运维，非第三方处理者：Next.js 前端容器、后端 API 容器、PostgreSQL（用户数据/Key 密文/任务状态）、Redis（队列缓存，不存持久业务数据）、MinIO（素材/产物/导出 zip）、ffmpeg 渲染容器、Nginx 反向代理。注明若未来迁移云 IaaS 会更新此页。
- **BYOK 特别说明**：用户自备的 API Key 仅加密存储于平台 PostgreSQL（AES-256-GCM），平台不读取明文、不用于任何其他目的；内容由用户自己的 Key 调用第三方 API 处理，用户与各 API 提供方之间条款自行适用。
- 数据收集：最小化（账号、任务内容、Key 密文）；留存默认 90 天；备份策略；用户删除与导出权利（GDPR）。
- 底部 date + 版本号。

### 2. /terms — Terms of Service（src/app/terms/page.tsx）
内容必须含（英文）：
- **用户内容所有权**：用户上传/生成的素材与成片归用户所有；用户授予平台"服务必要"的有限授权（存储、处理、渲染以提供服务），服务结束即删除（R3）。
- **BYOK 责任边界（R1）**：免费档用户自备 Key，内容/版权/合规责任归用户；平台仅提供工作流编排，不对用户内容合法性负责；用户保证其内容不侵权、不违法。
- **禁止条款（R4）**：明确禁止——欺诈/虚假宣称、制作或传播 deepfake、侵犯第三方知识产权、声音克隆（未经授权的他人声音克隆）、生成仇恨/暴力/成人内容、违法内容。平台有权暂停/删除/封号处置违规内容。
- **禁绝对化功效承诺（R4）**：明确"平台不保证任何具体营销效果/爆款结果"。
- **兼容性声明（R2）**：提及第三方工具（如 CapCut）时仅用 "compatible with / import into"，不得用"官方/认证"。
- **免责与责任限制**：BYOK 模式下第三方 API 故障、平台不作结果担保等。
- 修订条款、联系邮箱（support@ 用占位符，统一写 hello@aivideostudio.app 之类占位，后续替换）。

### 3. /cookies — Cookie Policy（src/app/cookies/page.tsx）
- 说明本站使用的 Cookie/存储：必要 Cookie（登录会话）、分析（GA4/Clarity，可选）、偏好（语言等）。
- 说明"US 默认接受分析，GDPR/EEA 用户可拒绝"。

### 4. Cookie banner 前端组件（src/components/CookieBanner.tsx）
- 客户端组件，挂在根布局（src/app/layout.tsx）。
- 首次访问弹出 banner：说明用途 + "Accept" / "Decline" 按钮。
- US 默认 Accept 可自动关闭；GDPR/EEA 用户 Decline 则禁用分析脚本。
- 偏好存 localStorage（键名如 `cookie-consent`）。⚠️ 这只是 cookie 偏好，**不是 API key**，允许用 localStorage；但与 BYOK key 严格区分，不得混淆存储。
- 简洁样式，不遮挡主要内容。

### 5. /report-abuse — 举报通道（src/app/report-abuse/page.tsx）
- 静态表单页（英文）：举报类型（侵权/违法/deepfake/声音克隆/其他）、被举报内容链接或描述、举报人邮箱（可选）、提交按钮。
- 本阶段表单可 POST 到 /api/report-abuse（后端先做一个简单落库到 postgres 的 report_abuse 表即可，或先存 JSON 文件；选简单可靠的方案，并在说明里注明），不接真实邮件通知（后续阶段接）。
- 页面含邮箱备选举报通道。

## 验证（必须真实执行并贴证据）
1. `docker compose up -d --build`（重建 web 镜像，基础服务不动）
2. `curl -s -o /dev/null -w "%{http_code}" localhost/privacy`、`/terms`、`/cookies`、`/report-abuse` → 均 200
3. 每个页面 curl 正文 grep 关键内容：privacy 含 "fal.ai"、"Creem"、"Cloudflare" 应为 0 命中；terms 含 "deepfake"、"声音克隆/voice cloning"、"BYOK"；cookies 含 "GDPR"
4. 首页 grep Cookie banner 组件渲染（如 "cookie-consent" 或 Accept/Decline 字样）
5. POST /api/report-abuse 一次测试（若有后端）→ 成功
6. 确认页面无明文 key 逻辑、无 localStorage 存 key（grep src/ 无 setItem('sk 之类）

## 输出格式
- 改动文件清单（绝对路径）
- 4 个页面 URL 的 HTTP 状态 + 关键内容 grep 证据
- Cookie banner 实现说明
- 遗留事项
