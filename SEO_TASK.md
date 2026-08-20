# AI Video Studio — Stage 3 Task: SEO 页面矩阵 + Programmatic Phase 1

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 当前状态：Stage 0 骨架 + Stage 1 BYOK + Stage 2 合规 已完成。7 服务 healthy 运行中。
> 本阶段只做：**SEO 页面矩阵**（development-spec-v1.md D 部分 + PRD §6-§7）。9 步流水线业务功能是后续阶段，不要做。

## 必须遵守（每一条都踩过坑）
1. **不要 `docker compose down`**。完成后必须 `docker compose up -d --build` 重建 web 镜像（其他服务不动），并验证。
2. **不留孤儿容器**：完成后 `docker compose ps` 必须只有 7 个服务（api/minio/nginx/postgres/redis/render/web），名字以 `ai-video-studio-` 开头。如果看到 nextjs/renderer 之类多余容器，`docker rm -f` 清掉。你上一阶段留下了 2 个孤儿容器，本阶段禁止再犯。
3. 全部页面英文（US 市场）。
4. 写前先读：`ai-video-studio-prd-v3.md` §6（页面矩阵/内链/CTA/技术 SEO）、§7（Programmatic SEO）；`development-spec-v1.md` D 部分。
5. **App 区页面 noindex**（/settings、/api 相关等），营销/SEO 页面 indexable（robots metadata）。

## 任务清单

### 1. 工具页矩阵（8 个独立页面，src/app/tools/[slug]/page.tsx 用静态数据驱动，或 8 个独立 page.tsx——选更优方案）
每个页面：独立 URL + 独立 H1 + metadata title/description（按关键词）+ 主 CTA 按钮 + 一段产品能力说明（英文，结合 9 步流水线的真实能力，不吹嘘、无绝对化功效词 R4）。内容要真实对应产品（如 storyboard-generator 对应分镜生成、ai-voiceover 对应 TTS 配音），**不做假功能**，页面 CTA 指向免费试用路径（BYOK 注册/试用页，可先指向 / 首页或 /settings）。

| URL | H1 | 主关键词 | CTA |
|-----|-----|---------|-----|
| /tools/storyboard-generator | AI Storyboard Generator | ai storyboard generator | Create a storyboard |
| /tools/script-to-video | Script to Video AI — Shot-by-Shot Control | script to video ai | Turn your script into video |
| /tools/ai-video-script-writer | AI Video Script Writer | ai video script writer | Write my script |
| /tools/text-to-video | Text to Video with Full Control | text to video ai | Start creating |
| /tools/ai-voiceover | AI Voiceover Generator (TTS) | ai voiceover generator | Generate voiceover |
| /tools/subtitle-generator | AI Subtitle Generator (SRT) | subtitle generator srt | Generate subtitles |
| /tools/video-export-zip | Open Format Video Export (MP4 + JSON + SRT) | export video project zip | Export & edit anywhere |
| /tools/byok-video-tools | BYOK AI Video Tools — Bring Your Own Key | bring your own key video | Configure your keys |

每页底部 **Related Tools**（4-6 个互链，双向：如 storyboard-generator ↔ script-to-video ↔ text-to-video ↔ ai-video-script-writer ↔ ai-voiceover ↔ video-export-zip）。

### 2. 场景化页面（5 个，src/app/scenarios/[slug]/page.tsx 或独立页）
| URL | 主关键词 | 场景 |
|-----|---------|------|
| /scenarios/client-video-delivery | ai video for client deliverables | freelancer 交付场景（主 ICP） |
| /scenarios/youtube-script-to-video | script to video for youtube | 内容创作者场景 |
| /scenarios/social-ads-video | ai video for social ads | 社媒广告场景 |
| /scenarios/product-demo-video | ai product demo video | 产品演示场景 |
| /scenarios/video-localization | ai video voiceover localization | 多语言配音场景 |
每页底部 Related Tools 互链到对应工具页。

### 3. Programmatic SEO Phase 1（≥30 页，SSG 生成）
- 模板 `[verb]-[content-type]`：动词池 make/create/turn/convert/generate/edit/export（6）× 内容池 video/storyboard/youtube-video/reels/shorts/tiktok-video（6）= **36 基础页**
- URL 示例：/make-video、/convert-storyboard、/generate-shorts、/create-reels、/edit-tiktok-video、/export-youtube-video 等
- 每页内容：独立 H1（如 "Make a Video — AI-Powered in 9 Steps"）+ 200-300 词英文说明（步骤、用途、BYOK 免费）+ FAQ（2-3 条，配 FAQPage JSON-LD）+ CTA + **收敛链接回对应母工具页**（如 /make-video → /tools/text-to-video）
- 用 Next.js `generateStaticParams` 生成，构建期静态化（不依赖运行时）
- 36 页即满足 ≥30 页要求

### 4. Structured Data（JSON-LD）
- 工具页：SoftwareApplication（name/description/offers 占位/applicationCategory Multimedia）
- 工具页或场景页：HowTo（9 步流水线简版）至少 1 页
- Programmatic 页：FAQPage
- 首页：SoftwareApplication + WebSite

### 5. 分层 Sitemap（Next.js 15 app/sitemap.ts 方案）
- /sitemap.xml 作为总索引（或 Next 多 sitemap 数组），分为：tools（8+5 页）、programmatic（36 页）、pages（首页/features/pricing/blog 等现有页）
- 每页正确 lastModified

### 6. 首页 + 导航轻更新
- 首页（src/app/page.tsx）加工具页入口区（8 个工具页链接网格，英文标题）+ 页脚（footer）加工具页/合规页链接（privacy/terms/cookies 已有）
- 主导航或页脚标注 "Tools" 分组；不改变现有连通性状态页的定位（首页可保留连通性组件，或换为轻量 hero + 工具网格，选合理方案）
- App 区页面（/settings）加 noindex metadata（robots: noindex）

## 验证（必须真实执行并贴证据）
1. `docker compose up -d --build`（只重建 web，其他不动）→ 全服务 healthy
2. 抽测 8 个工具页 + 5 个场景页 + 3 个 programmatic 页：`curl -s -o /dev/null -w "%{http_code}"` → 全 200
3. 每个工具页 H1 正确（curl | grep 对应 H1 关键词）
4. Related Tools 互链存在（curl 一个工具页 grep 其他工具页 URL ≥4 个）
5. /sitemap.xml 可访问且含 tools/programmatic 分组；抽查 2 个 programmatic URL 在 sitemap 中
6. JSON-LD 存在（curl 工具页 grep "SoftwareApplication"、"application/ld+json"）
7. /settings 页含 noindex（curl grep "noindex"）
8. **`docker compose ps` 只显示 7 个服务，无孤儿容器**
9. 全站无明文 key 泄露（不需要重测，但确认没引入）

## 输出格式
- 改动/新增文件清单（绝对路径）
- 工具页/场景页/programmatic 页各自数量统计
- 验证步骤 1-8 的证据
- 遗留事项
