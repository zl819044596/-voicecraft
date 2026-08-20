# AI Video Studio — 开发规格 v1（BYOK / 合规 / SEO）

> 来源：阁主 2026-08-08 下发（参考 Creatify）
> 前置依据：PRD v3（dingchuan/output/ai-video-studio-prd-v3.md）+ 设计 v0（huijing/output/ai-video-studio-design-v0/）+ 定价收口（hengjin/output/hengjin-pricing-v0.md）
> 技术栈：全 Docker 自托管（Next.js + API + PostgreSQL + Redis + MinIO + ffmpeg 容器）

---

## A. BYOK 配置中心（R1 红线强制）

### A.1 功能
1. 四类 Key 配置：LLM（OpenAI/Claude）、生图（fal.ai/Flux）、TTS（ElevenLabs/OpenAI）、图生视频 i2v（fal.ai）
2. 支持自加第三方模型（OpenAI 兼容端点）
3. 免费档用户自备 Key，零平台算力成本

### A.2 R1 红线（代码审查必查项，违反=P0 返工）
- Key 仅 POST 到后端 API，前端不得持久化
- 不得落日志、不得进 URL 参数、不得进 localStorage/sessionStorage
- 后端用 PostgreSQL 加密列存储（环境变量/密钥管理注入后端容器）
- 前端任何位置不得回显明文 Key（只显示脱敏状态，如 "sk-...xyz"）

### A.3 接口
- `POST /api/keys` — 接收 {provider, key}，后端加密存储
- `DELETE /api/keys/[provider]` — 删除指定 Key
- `GET /api/keys` — 返回各 provider 的 Key 状态（仅脱敏，无明文）

---

## B. 第五阶段增强（借鉴 Creatify，可选对比点）
1. **多模型切换**：生图/图生视频时选底层模型（Flux/Kling/Hailuo/Runway/Luma）→ task.config 加 model_override 字段，各 step 可选
2. **Credit 预估**：生成前显示预计消耗（"Know Before You Generate"）→ 付费档生成前展示预估扣减
3. **BYOK 成本可视化**：自备 key 时显示各 API 调用预估成本
4. **分镜可视化**（类 Creatify node canvas）：时间线/卡片展示 9 步进度，每步可点开详情，拖拽调序（V2）
- ⚠️ 不做纯文生视频（NOT-DO #1），保持分镜优先

---

## C. 合规三页（R4/R5 红线）
1. `/privacy` — Privacy Policy（含 §13.3 第三方处理者清单：Google OAuth, OpenAI, Anthropic, fal.ai, ElevenLabs, Cloudflare, Creem, GA4, Clarity）
2. `/terms` — Terms of Service（禁止条款、用户内容所有权声明、BYOK 责任边界）
3. `/cookies` — Cookie Policy（Cookie banner，US 默认，GDPR 可拒绝）
- R4：TOS 禁欺诈/虚假宣称/deepfake/侵权/声音克隆；禁绝对化功效承诺；含 /report-abuse 举报通道
- R5：注册页年龄门槛（18+/13+）；/settings → Export Data 导出入口；删除账号 → 级联删 PostgreSQL + MinIO

---

## D. SEO 页面矩阵（PRD §6-§7）
### D.1 工具页（独立 URL + 独立 H1）
- /tools/storyboard-generator · /tools/script-to-video · /tools/ai-video-script-writer · /tools/text-to-video · /tools/ai-voiceover · /tools/subtitle-generator · /tools/video-export-zip · /tools/byok-video-tools
### D.2 内链
- 每工具页底部 Related Tools（4-6 互链）；Blog → 工具页锚文本 CTA
### D.3 Programmatic SEO Phase 1（30-50 页）
- 模板 [verb]-[content-type]；动词池 make/create/turn/convert/generate/edit/export；内容池 video/storyboard/youtube-video/reels/shorts/tiktok-video；参数池 [niche]/[format 16:9,9:16,1:1]/[duration 30s,60s,90s]
### D.4 技术 SEO
- 营销页 ISR；Structured Data（SoftwareApplication/HowTo/FAQPage）；分层 Sitemap（tools/blog/programmatic 分开）

---

## E. 执行约束（给 Claude Code）
- **R1 红线**：API Key 存储是代码审查必查项，任何前端持久化 = 返工
- **i2v 后置**：W4 前只做 static 合成，i2v 字段预留但不实现逻辑
- **Creem 后置**：订阅代码预留 webhook 端点，pricing 页标注 "coming soon"，不阻塞
- **NOT-DO**：纯文生视频、声音克隆、内置视频编辑器、剪映草稿导入、团队协作
- **CapCut 兼容**：仅 "compatible with / import into"，禁 "官方/认证"

---

*状态：规格已存档，待阁主确认是否立即用 Claude Code 开工。*
