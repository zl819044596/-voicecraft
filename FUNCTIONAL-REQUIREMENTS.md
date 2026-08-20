# AI Video Studio — 功能需求文档（汇总版）

> 来源：代码实扫（src/ + api/src/ + render/ + docker-compose.yml）+ PRD v3 + development-spec-v1 交叉核对
> 项目：AI Video Studio — 分镜优先 AI 视频创作工作台（出海，服务客户的 freelancer）
> 定位：storyboard-first AI video workbench for client-serving freelancers
> 站点类型：SAAS 工作台（登录后 app）+ 内容营销/SEO 混合型
> 日期：2026-08-11
> 状态：已实现功能为主（PIPELINE_TASK_1~14 已落地），未实现/预留项已标注

---

## 1. 产品概述

**一句话定位**：分镜优先的 AI 视频创作工作台 —— 用户用「选题 → 文案 → 分镜 → 逐镜生图 → 配音 → 字幕 → 合成 → 复检 → 开放导出」流水线做客户视频，BYOK 免费无限、每步可控，导出为开放 zip（MP4 + 分镜 JSON + 素材包 + SRT）可带走任意改，不绑定平台。整个应用 Docker 自托管。

### 1.1 核心差异化

| 差异化 | 说明 |
|--------|------|
| 分镜优先工作流 | 9 步流水线（i2v 模式 10 步），每步可控、可跳过、可单步重跑 |
| BYOK 双算力 | 免费档用户自备 Key（LLM/生图/TTS/i2v 四类），零平台算力成本 |
| 开放可编辑导出 | zip 内含 MP4 + storyboard.json + 素材 + SRT + LICENSE，可导入任意剪辑工具 |

### 1.2 主要用户（ICP）

1. **接单型视频 freelancer / 独立创作者**（主 ICP）：帮品牌/客户做视频，痛点=出活慢、AI 结果不可控、被平台锁定
2. 个人内容创作者（YouTuber/TikToker/Reels）：引流客群
3. 小型营销代理 / in-house 社媒团队：V2 扩展方向

### 1.3 NOT-DO（红线，不做）

不做模板一键出片黑盒 / 不做纯文生视频（Sora/Veo 式）/ 不做平台内置视频编辑器 / 不做剪映草稿导入 / 不做抓取竞品视频 / 不做电商带货专向 / 不做声音克隆 / 不做团队协作 / 不做移动端 App / 不做素材市场 / 不做自建 LLM 推理集群

---

## 2. 系统架构（Docker Compose 自托管，全容器编排）

```
[用户浏览器]
    ↓ HTTPS (80/443)
[nginx]（唯一公网入口，TLS 终结，HTTP→HTTPS 重定向）
    ├── [web] Next.js 前端容器（:3000，SSR/ISR）
    └── [api] Express 后端容器（:4000，流水线编排 + BYOK Key 存储）
             ├── [postgres] PostgreSQL 16（业务数据 + Key 加密列）
             ├── [redis] Redis 7（任务队列 avs:steps / avs:render / avs:render:done）
             ├── [minio] MinIO（素材/产物/导出 zip，S3 兼容）
             └── [render] ffmpeg 渲染容器（SRT 生成 + 静态合成 + 字幕烧录 + BGM 混音）
[certbot]（Let's Encrypt 证书签发，one-shot profile）
```

**容器隔离（R6）**：公网仅暴露反代端口；PostgreSQL/Redis/MinIO/渲染容器不出公网，仅容器内网交互。

---

## 3. 功能模块总览

| 模块 | 前端路由 | 后端 API | 状态 |
|------|---------|---------|------|
| 登录/认证 | /login | POST /api/auth/login · logout · GET /me | ✅ mock（OAuth 预留） |
| 工作台 | /app | — | ✅ |
| 快速生成 | /app/quick | POST /api/projects | ✅ |
| 任务列表 | /app/tasks | GET /api/tasks | ✅ |
| 任务详情（向导） | /app/tasks/[id]、/app/projects/[id] | GET /api/tasks/:id + 单步控制 | ✅ |
| 项目 | /app/projects | GET/POST/DELETE /api/projects | ✅ |
| 模型配置中心 | /app/models、/app/settings | /api/model-configs CRUD + test + preview | ✅ |
| BYOK Key 管理 | /app/settings | POST/GET/DELETE /api/keys | ✅ |
| 提示词中心 | /app/prompts | /api/prompts CRUD | ✅ |
| 模板库 | /app/templates | （复用 prompts API） | ✅ |
| 商品库 | /app/products | /api/products CRUD | ✅ |
| 对标库 | /app/benchmarks | /api/benchmarks CRUD | ✅ |
| 素材库 | /app/assets | /api/assets CRUD | ✅ |
| 个人资料 | /app/profile | — | ✅（演示态） |
| BGM 上传/预览 | （任务详情内） | POST/GET /api/bgm | ✅ |
| 滥用举报 | /report-abuse | POST /api/report-abuse | ✅ |
| 营销/SEO 页 | /、/tools/*、/scenarios/*、/programmatic | — | ✅ |
| 法律页 | /privacy、/terms、/cookies | — | ✅ |
| 健康检查 | /health | GET /health · /health/full | ✅ |
| 支付/订阅 | — | /api/webhooks/creem（预留） | ⚠️ 未实现（Creem 上线后开通） |

---

## 4. 核心功能：9 步流水线（任务详情页，S1-S9）

### 4.1 状态机

- 任务状态：`queued → running → done / failed / cancelled`
- 单步状态：`queued → running → done / failed / skipped / cancelled`
- 失败可单步重试；可跳过；可「回到本步修改」后从该步重跑
- 运行模式：`semi`（每步暂停等确认）/ `auto`（自动跑完）
- 合成前复核门（S5 gate）：暂停在合成前等人工签字

### 4.2 步骤定义

| 步 | 名称 | 输入 | 输出 | 引擎 | 用户可操作 |
|----|------|------|------|------|-----------|
| S1 | 选题/内容解析 | 粘贴文案 / URL / 自由主题 | 选题卡片（topic/key_points/target_duration/audience） | LLM | — |
| S2 | 文案生成 | 选题卡片 + 语气/长度 | 文案 script（分段落）+ script.md | LLM | 编辑、版本管理（保存/选用）、重生成 |
| S3 | 分镜生成 | 文案 + 分镜风格参数 | storyboard.json（6-12 镜头：index/title/duration/scene/script/voiceover/subtitle/prompt/aspect/motion） | LLM | 编辑镜头表、全量重拆分、单镜重生成、分镜预设（general/ecommerce/story） |
| S4 | 逐镜生图 | 分镜 JSON + 画面比例（9:16/16:9/1:1 等） | 每镜 1 张 PNG | fal.ai/Flux（wingray） | 单镜/全量重生成、候选图积累与选择、参考图上传 |
| S5 | 配音 TTS | 配音句 + 音色 | 每镜音频 mp3/wav | ElevenLabs/OpenAI TTS（wingray cosyvoice） | 单镜配音重生成、TTS 试听 |
| S5' | 生成视频（仅 i2v 模式） | S4 分镜图 | 每镜动态 clip mp4 | wingray Kling-V1-6-I2V / Wan2.2 | 单镜 clip 重生成、clip 候选 |
| S6 | 字幕生成 | 配音音频 + 文案 | subtitles.srt（逐句时间轴） | ffprobe（渲染容器） | 字幕文本编辑、字幕节奏设置（字号/每行字数） |
| S7 | 视频合成 | 图片 + 音频 + SRT + 转场 + 合成方式 | final.mp4 | static：ffmpeg 渲染容器；i2v：拼接动态片段 | 字幕烧录开关/位置/字号、BGM 混音 |
| S8 | 复检 | 文案 + 分镜 + 成片 | passed/feedback 质检报告 | LLM | — |
| S9 | 开放导出 | 成片 + 分镜 + 素材 + SRT | project-export-YYYYMMDD.zip | MinIO 打包 | 下载 |

> i2v 模式为 10 步：S1 选题 → S2 文案 → S3 分镜 → S4 生图 → S5 生成视频 → S6 配音 → S7 字幕 → S8 合成 → S9 复检 → S10 导出

### 4.3 开放导出契约（差异化核心）

```
project-export-YYYYMMDD.zip
├── final.mp4               # 成片（含字幕烧录可选）
├── storyboard.json         # 分镜 JSON（可再导入本平台继续改）
├── script.md               # 文案
├── assets/
│   ├── shots/shot-01.png … # 逐镜图片素材
│   ├── audio/vo-01.mp3 …   # 逐镜配音
│   └── subtitles.srt       # 字幕
└── LICENSE.txt             # 用户内容所有权声明（中英双语）
```

### 4.4 单步可控（核心承诺）

- 修改一个分镜画面描述 → 只重跑该镜生图，其余步骤不动
- 文案编辑 → 从 S3 重跑（不重跑 S1）
- 配音编辑 → 只重跑该镜 TTS
- 字幕编辑 → 只重烧字幕（S6/S7 相关段）
- 任务产物版本管理：脚本版本（save/select）、图片候选（candidates + select）、i2v clip 候选

---

## 5. 工作台功能（App 区，登录后）

### 5.1 工作台首页 /app

- 数据总览：任务列表 + 项目列表 + 商品库计数 + 模型配置数
- 任务表格：任务 / 状态 / 模型·模板 / 创建时间 / 耗时 / 操作
- 项目列表卡片 + 进入向导

### 5.2 快速生成 /app/quick（4 步表单）

| 区块 | 内容 |
|------|------|
| 顶部提示 | 平台免费额度 0/2 · 自备 Key 不限 |
| 警告条 | LLM/生图/TTS 通道缺失时提示（链接到 /app/models） |
| 1 文案来源 | 3 个 tab：直接粘贴 / AI 改写 / AI 创作（含商品库选品） |
| 2 画面设置 | 比例 chips（9:16/16:9/1:1/更多）、分镜预设、模型选择 |
| 3 配音设置 | TTS 音色、语速、试听 |
| 3.5 视频设置 | 合成方式 toggle（static/i2v，i2v 需配置 key） |
| 4 成片设置 | 字幕烧录、BGM 上传 |
| 底部操作条 | 汇总 chips + 开始生成按钮（sticky） |

- 【开始生成】→ POST /api/projects { auto_run: true } → 跳转任务详情向导

### 5.3 任务详情向导（WizardPage，核心 UI）

左侧 rail 6 阶段（S1 文案 → S6 生成视频），右侧节点编辑器：

| 节点 | 编辑器功能 |
|------|-----------|
| S2 文案 | 编辑文案、保存版本、选用版本、重生成 |
| S3 分镜 | 镜头表编辑、分镜预设切换、全量重拆分、单镜重生成 |
| S4 生图 | 单镜/全量重生成、候选图浏览与选择、参考图上传 |
| S5 配音与字幕 | 单镜配音重生成、字幕文本编辑、字幕节奏设置、TTS 试听 |
| S5' 生成视频（i2v） | 单镜 clip 重生成、clip 候选选择 |
| S6 合成 | 字幕烧录设置、BGM 混音、重新合成 |
| S7/S8/S9 | 复检报告、导出下载 |

- 轮询：任务运行中自动刷新状态（semi 暂停/完成自动停）
- 陈旧标记：下游被编辑未重跑 → stale 徽章

---

## 6. 模型与 BYOK 配置

### 6.1 模型配置中心 /app/models（model_configs 表）

- 四类 provider_class：`llm` / `image` / `tts` / `i2v`
- 每类可配多个模型条目：name / base_url（自定义 OpenAI 兼容端点）/ model / key / voice（TTS）/ enabled / is_default
- 每 (user, class) 至多一个默认（唯一索引强制）
- 功能：新增、编辑、启停、设默认、删除、测试连接（POST /api/model-configs/test）、TTS 试听（POST /api/model-configs/preview）
- 预设（wingray 账号实采）：LLM=DeepSeek-V4-Flash-0731（默认）/DeepSeek-V4-Pro；生图=Z-Image-Turbo；TTS=cosyvoice-v2（15 音色）；i2v=Kling-V1-6-I2V（默认）/Wan2.2-I2V-Plus

### 6.2 BYOK Key 管理 /api/keys（R1 红线）

- POST：接收 {provider, provider_name, key, base_url?} → AES-GCM 加密（scrypt 盐）存 PostgreSQL 加密列
- GET：只返回 key_masked 脱敏状态（`sk-…cdef`），永不明文
- DELETE：按 provider_name 删除
- **R1 强制**：Key 仅后端处理；前端不持久化、不落日志、不进 URL、不进 localStorage/sessionStorage；前端任何 Key 持久化 = P0 返工

### 6.3 系统设置 /app/settings

- 两列布局：左侧模型分组列表（大模型/生图/配音/视频）+ 右侧编辑表单
- 保存配置 = PUT /api/model-configs/:id

---

## 7. 资料库功能

### 7.1 提示词中心 /app/prompts（7 类型）

商品解析 / 对标分析 / 文案模板 / 标题生成 / 画面风格 / 分镜拆解 / 合规规则

- CRUD + 每 (user, type) 一个默认 + 标签 + 启停
- 任务节点可引用模板（config.templates）或自定义提示词（config.prompts，优先级更高）

### 7.2 模板库 /app/templates

- 提示词模板浏览视图：搜索 + 类型筛选 + 默认模板管理（复用 prompts API）

### 7.3 商品库 /app/products（商品库选品，AI 创业）

字段：name / category / topic / price / commission_rate / product_url / detail_text / visibility（all/private/me）/ status（active/inactive）/ gen_count

- CRUD + 快速生成时作为文案来源

### 7.4 对标库 /app/benchmarks

字段：account / title / video_url / source_text / product_id（关联商品）/ duration / visibility

- CRUD

### 7.5 素材库 /app/assets（media_assets 表）

字段：type（image/audio/video）/ name / url / size / meta

- CRUD + 类型筛选

### 7.6 BGM

- POST /api/bgm：上传原始音频文件（raw stream）→ MinIO `users/<uid>/bgm/<uuid>.<ext>`
- GET /api/bgm/:file：流式回放预览
- 合成时混音（-20dB 音量混入，失败不阻断成片）

---

## 8. 营销 / SEO 区（indexable）

### 8.1 页面矩阵

| 区 | 页面 | 数量 |
|----|------|------|
| 首页 | /（storyboard-first 定位 + 工作流演示） | 1 |
| 工具页 | /tools/[slug] | 8 |
| 场景页 | /scenarios/[slug] | 5 |
| Programmatic | /[verb]-[content-type] | 36 |
| 法律页 | /privacy、/terms、/cookies、/report-abuse | 4 |
| 技术 SEO | /sitemap.xml（sitemap.ts）、/robots.txt（robots.ts） | 2 |

### 8.2 工具页（8 个，每个独立 URL + H1 + CTA + 互链）

1. `/tools/storyboard-generator` — AI Storyboard Generator（S3）
2. `/tools/script-to-video` — Script to Video AI（S2-S8）
3. `/tools/ai-video-script-writer` — AI Video Script Writer（S2）
4. `/tools/text-to-video` — Text to Video with Full Control（S1-S8）
5. `/tools/ai-voiceover` — AI Voiceover Generator (TTS)（S5）
6. `/tools/subtitle-generator` — AI Subtitle Generator (SRT)（S6）
7. `/tools/video-export-zip` — Open Format Video Export（S9 差异化）
8. `/tools/byok-video-tools` — BYOK AI Video Tools（BYOK landing）

### 8.3 场景页（5 个）

1. `/scenarios/client-video-delivery` — AI Video for Client Deliverables（主 ICP）
2. `/scenarios/youtube-script-to-video` — Script to Video for YouTube
3. `/scenarios/social-ads-video` — AI Video for Social Ads
4. `/scenarios/product-demo-video` — AI Product Demo Video
5. `/scenarios/video-localization` — AI Video Voiceover Localization

### 8.4 Programmatic SEO（36 页）

- 模板：`[verb]-[content-type]`（6 动词 × 6 内容类型）
- 动词池：make / create / convert / generate / edit / export
- 内容类型池：video / storyboard / youtube-video / reels / shorts / tiktok-video
- 每页含：H1 + 描述 + 8 步说明 + FAQ（3 条）+ 母工具页内链

### 8.5 技术 SEO

- SSR/SSG/ISR（Next.js，营销区静态）
- JSON-LD Structured Data（SoftwareApplication / HowTo / FAQPage）
- canonical + OG 标签
- 内链网络：Related Tools 互链（4-6 个/页）+ 母工具收敛
- 中英双语 i18n（en/zh，localStorage 存 locale，默认跟随浏览器语言）

---

## 9. 合规功能（守衡 P0 红线 R1-R6）

| 红线 | 落地 |
|------|------|
| R1 BYOK 数据责任边界 | Key 仅后端加密存储；TOS 写明责任归用户；平台仅提供工作流编排 |
| R2 商标/品牌红线 | 全站无竞品背书词；兼容性仅 "compatible with / import into" |
| R3 素材版权 | 平台无抓取功能；素材库仅用户自建 |
| R4 内容滥用 | 举报通道（幂等 idempotency_key）+ TOS 禁止条款 + 无绝对化功效承诺 |
| R5 隐私 | Privacy/Terms/Cookie 三页（英文，US 默认）+ 18+ 年龄门槛（登录页确认）+ GDPR 删除/导出 |
| R6 部署安全 | HTTPS 强制 + 密钥仅环境变量 + 容器最小权限 + 公网仅反代端口 + 备份恢复脚本（backup.sh）|

合规页面：
- `/privacy` — Privacy Policy（含第三方处理者清单）
- `/terms` — Terms of Service（禁止条款、用户内容所有权、BYOK 责任边界）
- `/cookies` — Cookie Policy（Cookie banner 可拒绝）
- `/report-abuse` — 滥用举报表单（reason/details/contact）

---

## 10. 数据模型（PostgreSQL 核心表）

| 表 | 用途 | 关键字段 |
|----|------|---------|
| users | 用户（OAuth 预留） | id, email, google_sub, tier |
| projects | 项目容器 | id, user_id, title, source_type(text/url/topic/product), prompt, status |
| tasks | 一次流水线运行 | id, project_id, status, current_step(1-9/10), progress, config(JSON: synthesis/run_mode/aspect/models/script_versions/bgm_key/subtitle/templates/prompts/cost_estimate) |
| step_results | 每步产物元数据 | task_id, step, status, payload(JSON), error, retries |
| api_keys | BYOK Key（加密列） | user_id, provider, key_ciphertext, key_salt, base_url |
| model_configs | 模型配置中心 | user_id, provider_class, name, base_url, model, key_ciphertext, key_masked, voice, enabled, is_default |
| assets | 流水线产物 | task_id, type(shot/audio/srt/mp4/zip), minio_key, size, checksum |
| exports | 导出 zip | task_id, minio_key, zip_hash |
| prompts | 提示词中心 | user_id, type(7 类), name, scenario, body, tags[], enabled, is_default |
| products | 商品库 | user_id, name, category, price, commission_rate, detail_text, visibility, status, gen_count |
| benchmarks | 对标库 | user_id, account, title, video_url, source_text, product_id |
| media_assets | 素材库 | user_id, type, name, url, size, meta |
| report_abuse | 滥用举报 | idempotency_key, reason, details, contact, status |

MinIO 存储布局（bucket `avs-assets`）：
```
tasks/<taskId>/shots/shot-0N.png
tasks/<taskId>/clips/clip-0N.mp4   （i2v 模式）
tasks/<taskId>/audio/vo-0N.<mp3|wav>
tasks/<taskId>/subtitles.srt
tasks/<taskId>/final.mp4
tasks/<taskId>/storyboard.json
tasks/<taskId>/script.md
tasks/<taskId>/export/project-export-YYYYMMDD.zip
users/<uid>/bgm/<uuid>.<ext>       （BGM）
```

Redis 队列契约：
- `avs:steps` — 流水线步骤队列（BLPOP 消费，S1-S9/10）
- `avs:render` — 渲染任务队列（api → render 容器：{type:'srt'|'compose', taskId}）
- `avs:render:done` — 渲染结果回执（render → api，finalize 步骤）

---

## 11. 后端 API 总览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /health · /health/full | 存活/就绪探针（pg/redis/minio 连通性） |
| POST/GET/DELETE | /api/auth/login · /logout · /me | 认证（mock） |
| POST/GET/DELETE | /api/keys | BYOK Key 管理（加密存储/脱敏回显） |
| GET/POST/PUT/DELETE | /api/model-configs（+ /presets /test /preview） | 模型配置中心 |
| GET/POST/PUT/DELETE | /api/prompts | 提示词中心 |
| GET/POST/PUT/DELETE | /api/products | 商品库 |
| GET/POST/PUT/DELETE | /api/benchmarks | 对标库 |
| GET/POST/PUT/DELETE | /api/assets | 素材库 |
| POST/GET | /api/bgm | BGM 上传/预览 |
| GET/POST/DELETE | /api/projects | 项目 CRUD |
| GET/POST | /api/tasks | 任务创建/列表 |
| GET | /api/tasks/:id | 任务详情（steps/assets/export/cost/storyboard） |
| POST | /api/tasks/:id/continue | semi 模式继续 |
| POST | /api/tasks/:id/subtitle-settings | 字幕设置 |
| PUT | /api/tasks/:id/node | 向导节点编辑（脚本/分镜/配音/字幕） |
| POST | /api/tasks/:id/rerun | 从某步重跑（清洗下游产物） |
| POST | /api/tasks/:id/script/versions | 脚本版本保存/选用 |
| POST | /api/tasks/:id/script/regenerate | 脚本重生成 |
| POST | /api/tasks/:id/storyboard/regenerate | 分镜重拆分 |
| POST | /api/tasks/:id/shots/:index/regenerate | 单镜生图重生成 |
| POST | /api/tasks/:id/shots/:index/candidates | 候选图记录/选择 |
| POST | /api/tasks/:id/voice/regenerate | 配音重生成 |
| POST | /api/tasks/:id/clips/:index/regenerate | i2v clip 重生成 |
| GET | /api/export/:id | 导出 zip 下载（流式） |
| POST | /api/report-abuse | 滥用举报（幂等） |
| POST | /api/webhooks/creem | Creem 订阅事件（⚠️ 预留） |

---

## 12. 渲染容器（ffmpeg worker）

- 消费 `avs:render` 队列：`{type:'srt'|'compose', taskId}`
- SRT 任务：ffprobe 探测每镜音频时长 → 按时间轴生成 subtitles.srt → 上传 MinIO → 回执 avs:render:done
- 合成任务（static）：下载分镜图 + 音频 → 逐镜切段（图片时长=音频时长）→ concat → 可选字幕烧录（libass，ASS force_style，WrapStyle=2 断行）→ 可选 BGM 混音（-20dB amix）→ final.mp4 → 上传 MinIO
- 合成任务（i2v/compose-i2v）：拼接 clip 片段 + 音频；单镜 clip 失败 fallback 静态图片段（可用性优先，不硬失败）
- 幂等（U11）：同一 task_id 重复下发不重复合成
- 超时：ffmpeg 单次调用 5 分钟上限

---

## 13. 部署与运维

| 项 | 说明 |
|----|------|
| 编排 | docker compose（web/api/postgres/redis/minio/render/nginx/certbot） |
| HTTPS | scripts/ensure-certs.sh（自签 dev）+ issue-cert.sh（Let's Encrypt）+ renew-cert.sh |
| 备份 | scripts/backup.sh（PostgreSQL pg_dump + MinIO 对象备份） |
| 部署 | scripts/deploy.sh |
| 验证 | scripts/smoke-task12.sh（冒烟测试） |
| DNS | api 容器显式 DNS（223.5.5.5 / 119.29.29.29，宿主解析问题规避） |
| 健康检查 | 全部服务 healthcheck（wget/curl + start_period） |

**⚠️ 未实现/预留项**：Google OAuth 真接入（当前 mock login：email+昵称+18+ 确认）、Creem 支付/订阅、付费墙（平台代付档）、域名定档、生产密钥注入、多节点扩展（Compose→Swarm/K8s）。

---

## 14. 路线图状态对照

| 里程碑 | PRD 定义 | 当前状态 |
|--------|---------|---------|
| W1 Docker Compose 基建 + 登录 | Compose 编排 + 健康检查 | ✅ 已实现（8 服务全编排） |
| W2 工作流骨架 | 项目/任务 CRUD + 状态机 | ✅ 已实现 |
| W3 前 4 步 | S1-S4（LLM/fal.ai）+ 渲染容器 | ✅ 已实现 |
| W4 后 5 步 | S5-S9（TTS/SRT/ffmpeg 合成/导出/复检） | ✅ 已实现 |
| W5 BYOK + 免费档 | BYOK 配置中心 + 配额 | ✅ BYOK 已实现；⚠️ 付费墙/Creem 未做 |
| W6 合规三页 + 打磨 + 部署 | 三页 + 举报 + HTTPS + 备份 | ✅ 已实现 |
| M2 增长期 | Blog/Programmatic Phase 1 | ✅ 36 页 Programmatic 已实现；Blog 未做 |
| M3 扩展期 | Programmatic Phase 2 + 团队档 | ⏳ 未开始 |

---

## 15. 已识别待办/缺口（供后续迭代）

1. **Google OAuth 真接入**：当前 mock auth（X-User-Id / mock Bearer），多用户隔离未真实存在（全部默认 dev）
2. **Creem 支付/订阅**：路由预留，未实现付费墙；MVP 免费档先行
3. **Blog**：营销区无 /blog 路由，增长杠杆缺位
4. **价格档位/配额**：免费档配额（3 任务/月）未强制
5. **i2v 成本披露**：pricing 页需如实披露 i2v 高成本（生图 10-50 倍）
6. **数据导出/删除入口**：GDPR Right to Erasure 需落地（/settings 导出入口）
7. **素材来源清单**：R3 要求（仅少量自产素材）
8. **爬虫/监控**：Crawler Hints 未配置
