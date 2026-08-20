# 产品需求文档 (PRD) | ai-video-studio-prd-v3.md

> 定川 (dingchuan) 出品 ｜ 角色：产品判断 / Brief / PRD 汇总
> 项目：AI Video Studio — 分镜优先 AI 视频创作工作台（出海，服务客户的 freelancer）
> 目标市场：US / English（全球可访问，GDPR 覆盖）
> 日期：2026-08-08（v3 重出：按阁主 REV4 重大方向变更，**整个应用全 Docker 自托管、不用 Cloudflare**；基于 v2 重出并覆盖此前任何 v3）
> 状态：**v3 — 待阁主终审**（不自动进入开工链路；修订点：①域名待定不阻塞 ②支付 Stripe→Creem、上线后申请、MVP 免费档先行 ③订阅付费墙 W5 之后加 ④S7 合成方式二选一 static|i2v，i2v 为可选增强置于 W4 之后不阻塞 MVP ⑤**技术栈全自托管化：整个应用（Next.js 前端 + 后端 API + ffmpeg 渲染）全部 Docker 容器自托管部署，不用 Cloudflare Pages/Workers/D1/R2/Queues；完整产品定位（含登录/支付/合规/SEO 全套），非原型验证**）
> 上游输入：
> - /Volumes/Data/hermes/profiles/xunyuan/xunyuan-keyword-demand-v0.md（寻源需求/机会报告 v0）
> - /Volumes/Data/hermes/profiles/shouheng/shouheng-compliance-v0.md（守衡合规基线 v0，P0 红线 R1-R5）
> - 阁主新增需求（REV2）：S7 增加「图生视频」可选模式，实现「不剪辑直接生成动态视频」
> - 阁主重大方向变更（REV4）：**“这是当一个完整产品做，整个应用全 Docker 自托管，不用 Cloudflare。”** 覆盖此前所有 Cloudflare 方案（Pages/Workers/D1/R2/Queues/Secrets 全部移除）

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| 项目 | AI Video Studio — 分镜优先 AI 视频创作工作台 |
| 定位 | storyboard-first AI video workbench for client-serving freelancers |
| 站点类型 | SAAS 工作台（登录后 app，noindex）+ 内容营销/SEO（indexable）混合型 |
| 主 ICP | 服务客户的 freelancer（接单型视频创作者/独立创作者） |
| 技术栈 | **全 Docker 自托管（不用 Cloudflare）**：前端 Next.js 容器（Node）+ Nginx/Caddy 反代 + HTTPS；后端 API 独立容器（Node/Python）；数据库 **PostgreSQL 容器**（替代 D1，含 BYOK Key 加密列，R1 仅后端）；队列/任务编排 **Redis**（替代 Cloudflare Queues）；对象存储 **MinIO 容器**（替代 R2，保存素材/产物/导出 zip）；渲染服务 **ffmpeg 容器（S7 static）+ 可选自托管图生视频模型（S7 i2v，可选项）**；Google OAuth（不变）+ Creem（Merchant of Record，**上线后申请开通**）；LLM（OpenAI/Claude）+ **fal.ai（生图 fal.ai/Flux + S7 可选图生视频 Kling/Hailuo/Runway/Luma）** + ElevenLabs/OpenAI TTS。**部署形态：Docker Compose 单机起步（可扩展为多节点），全部容器同网络编排；BYOK + 自托管使整个产品可移植、可迁移、无服务商绑定** |
| MVP 周期 | 6 周（周级迭代，见 §5；W1 起含 Docker Compose 基建与容器编排） |
| 域名 | **域名待定，上线前由阁主定**（不阻塞开工链路；候选如 storyboardvideo.ai / framecraft.ai 等，上线前 USPTO/EUIPO 同名商标预检） |

## 2. 上游输入与关键假设

- **寻源报告（xunyuan-keyword-demand-v0.md）**：评级 B_QUEUE；定位=freelancer；差异化=分镜优先 + BYOK 双算力 + 开放可编辑导出；产品形态=破局 7 项架构出海化（寻源 §三C 实采）。
- **守衡合规基线（shouheng-compliance-v0.md）**：5 条 P0 红线 R1-R5 + 4 项跨角色仲裁，全部并入本 PRD §14。
- **阁主新增需求（REV2）**：S7 视频合成增加「图生视频」可选模式，实现「不剪辑直接生成动态视频」。
- **阁主重大方向变更（REV4）**：**整个应用全 Docker 自托管，不用 Cloudflare。** 完整产品定位（含登录/支付/合规/SEO 全套），非原型验证。技术栈全自托管化：Next.js 容器 + Nginx/Caddy 反代 HTTPS；PostgreSQL（替 D1，含 BYOK Key 加密列，R1 不变仅后端）；Redis（替 Queues）；MinIO（替 R2）；ffmpeg 容器（S7 static）+ 可选自托管 i2v 模型；Docker Compose 单机起步可扩展多节点；BYOK + 自托管双无绑定。

关键假设：
- 分镜优先工作流是 freelancer 的刚需差异点（[待验证]：社区信号，见 §16 风险 P1）。
- 开放导出（zip）比 CapCut 草稿更贴合「自己修改」承诺且无平台绑定（守衡已裁定：开放导出无版权问题）。
- BYOK 免费档驱动注册转化，付费档（平台代付，Creem）驱动收入（具体档位/价格由 T3 衡金定；**订阅付费墙 W5 之后加，MVP 免费档先行验证**，Creem 上线后申请开通）。
- **S7 图生视频（i2v）为可选增强**：构图仍由 S4 分镜图决定（非纯文生视频）；成本高（生图 10-50 倍）、每镜动态不可完全预期 → 优先 BYOK 自备 fal.ai key（成本用户承担），平台代付档单价由 T3 衡金标定；置于 W4 之后排期，不阻塞 MVP。
- **自托管为部署形态而非产品差异点**：产品差异点（分镜优先 + BYOK + 开放导出）不因部署方式改变；自托管带来可移植/可迁移/无服务商绑定，同时引入运维成本（服务器/备份/安全加固），服务器成本为平台固定支出，需并入 T3 定价测算。

缺失信息（不阻断 v3）：SERP 实扫、API 单条成本实测（含 i2v 各模型单价）、**自托管服务器成本实测（CPU/带宽/存储，T3 衡金）**、具体价格档位、素材来源清单（T4 出）、**HTTPS 证书签发与备份恢复具体方案（T11 在阁主定域名后实施）**；域名待定（阁主上线前定，不阻塞）。

## 3. 定位与边界

### 3.1 一句话定位

**分镜优先的 AI 视频创作工作台：freelancer 用「选题 → 文案 → 分镜 → 逐镜生图 → 配音 → 合成（可选静态 / 图生视频动态）」9 步流水线做客户视频，BYOK 免费无限、每步可控，导出为开放 zip（MP4 + 分镜 JSON + 素材包 + SRT）可带走任意改，不绑定平台。整个应用 Docker 自托管、可整体迁移，无服务商绑定。**

### 3.2 ICP（三类，主 ICP 加粗）

1. **接单型视频 freelancer / 独立创作者**：帮品牌/客户做视频。痛点=出活慢、AI 结果不可控、被平台锁定；付费=省时间多接单，$15-40/月可接受；触达=r/videography、r/freelance、Upwork/Fiverr 生态。技术型，BYOK 接受度高。
2. 个人内容创作者（YouTuber/TikToker/Reels）：持续产出内容，需要可控 AI 辅助工作流。引流客群，付费意愿中。
3. 小型营销代理 / in-house 社媒团队：多客户批量交付、品牌一致、多版本。付费强，V2 扩展方向（团队档 $99+）。

### 3.3 NOT-DO（红线清单，防止范围漂移）

1. 不做模板一键出片（Pictory/InVideo 式黑盒）——我们的核心是每步可控。**不做纯文生视频模型（text-to-video 全生成，Sora/Veo 式从文字直接生成整段视频）**——图生视频（i2v）仅作为 S7 可选增强，构图仍由 S4 分镜图决定，绝不做「一句话生成整支视频」的黑盒。
2. 不做平台内置视频编辑器（自带 timeline/剪辑器）——V2 再评估；v1 用开放导出替代。
3. 不做剪映草稿助手/CapCut 草稿导入（守衡裁决：开放导出替代；CapCut 仅可写 "compatible with / import into" 兼容性描述，禁官方背书）。
4. 不做抓取竞品视频/商品图的工具（守衡 R3：平台内置抓取 = P0 阻断；对标素材仅用户自行上传）。
5. 不做电商带货专向（TikTok Shop/Shopify/Amazon 专属流程）——泛选题，输出生态兼容但非唯一场景。
6. 不做声音克隆（R4：纯 TTS 无克隆；克隆他人声音 = 禁止条款）。
7. 不做团队协作/多人实时编辑（V2）。
8. 不做移动端 App / 桌面客户端（响应式 Web 优先）。
9. 不做素材市场/模板交易市场（V2 再评估）。
10. 不做绝对化功效承诺（R4：禁"爆款必出""3 天起量"类文案，FTC 风险）。
11. **不做自托管范围之外的自建基础设施**：不做自建 LLM/生图/TTS 推理集群（仍用 API 服务）；自托管仅覆盖应用层（前端/后端/DB/队列/存储/ffmpeg 渲染），模型推理保持 BYOK API 模式，i2v 自托管模型为可选增强不阻塞 MVP。

### 3.4 站点类型化

SAAS 工作台 + 内容营销混合型：
- App 区（登录后）：工作台、任务流水线、BYOK 配置 —— noindex，功能导向。
- 营销区：landing、features、how-it-works、pricing、blog、programmatic SEO 页 —— indexable，SEO 导向。
- 交互基线：工作台 = 多步向导 + 任务列表 + 状态轮询（Redis 队列）；营销区 = 静态/ISR 快速加载。

## 4. 产品形态：继承「破局」7 项架构出海化 + 9 步流水线

### 4.1 破局 7 项架构 → 出海化映射

| # | 破局架构 | 出海化实现 |
|---|---------|-----------|
| 1 | 快速生成视频（4 步：选文案来源→检查生成设置→开始生成） | 保留快速路径，文案来源 = 粘贴/URL/自定义/自由选题 |
| 2 | 剪映草稿助手（本地导入剪映二次编辑） | **开放导出 zip（MP4+分镜JSON+素材包+SRT）**，导入任意剪辑工具 |
| 3 | BYOK 配置中心（DeepSeek/RunningHub/火山/MiniMax） | **GPT/Claude + fal.ai（生图 Flux + 可选图生视频 i2v）+ ElevenLabs/OpenAI TTS**；支持自加第三方模型（OpenAI 兼容端点）；Key 仅后端加密存储（R1） |
| 4 | 高级创建视频（选开始位置→填现有内容→创建任务） | 保留进阶路径（从任意一步开始，带入已有素材/文案） |
| 5 | 任务详情 9 步流水线 | 保留并标准化 9 步（§4.2） |
| 6 | 系统完整介绍（菜单/工作台/任务/流水线） | 保留，出海化导航（Dashboard/Projects/Tasks/BYOK Settings/Billing） |
| 7 | 登录：微信扫码 | **Google OAuth**（+ 预留其他 OAuth） |

### 4.2 9 步流水线（任务详情页，核心）

每步创作者可控、可跳过、可重跑；状态机：`queued → running → done / failed / cancelled`；失败可单步重试。

| 步 | 名称 | 输入 | 输出 | 引擎 |
|----|------|------|------|------|
| S1 | 选题/内容解析 | 粘贴文案 / URL / 自由主题 / 自定义 | 规范化选题卡片（主题、要点、目标时长、受众） | LLM（OpenAI/Claude） |
| S2 | 文案生成 | 选题卡片 + 语气/长度参数 | 视频文案（script，分段落） | LLM |
| S3 | 分镜生成 | 文案 + 分镜风格参数 | **分镜 JSON**（镜头表：序号/时长/画面描述/文案句/配音句/提示词） | LLM |
| S4 | 逐镜生图 | 分镜 JSON + 画面风格参数（16:9/9:16/1:1 等） | 每镜 1 张（可多选重生成）图片素材 | fal.ai/Flux |
| S5 | 配音 TTS | 配音句 + 音色参数（无克隆） | 每镜音频（mp3/wav） | ElevenLabs/OpenAI TTS |
| S6 | 字幕生成 | 配音音频 + 文案 | **SRT 字幕**（逐句时间轴） | 本地时间轴对齐（ffmpeg/whisper 辅助，容器内） |
| S7 | 视频合成 | 图片 + 音频 + SRT + 转场参数 + **合成方式（static \| i2v）** | 成片 MP4（含字幕烧录可选） | **static（默认）：渲染容器内 ffmpeg（图片+配音+字幕+转场，快/便宜/完全可控）；i2v（可选增强）：图生视频模型（fal.ai 平台 Kling/Hailuo/Runway/Luma 等，或可选自托管开源 i2v 模型）喂 S4 分镜图，每镜生成 3-10s 动态片段后自动拼接成片** |
| S8 | 开放导出 | 成片 + 分镜 JSON + 素材 + SRT + 所有权声明 | **导出 zip**（见 §4.3） | MinIO 打包（后端服务） |
| S9 | 复检/迭代 | 成片 + 用户修改反馈 | 修改意见 → 回 S2-S4 单步重跑；交付版本管理（V1/V2…） | LLM + 工作流 |

合成方式说明（S7）：
- **static（默认）**：**渲染服务容器内 ffmpeg** 静态合成，对每镜图片做转场 + 配音 + 字幕烧录（可选）。快、便宜、完全可控、结果 100% 可预期 —— MVP 默认。
- **i2v（可选增强）**：把 S4 分镜图逐镜喂给图生视频模型，每镜生成 3-10 秒动态片段，再按分镜时长自动拼接成片（配音/字幕轨道不变，叠在动态片段上）。构图由分镜图决定（模型只做「让静态图动起来」，不做自由创作）；动态不可完全预期 → 生成后需人工抽检，不满意的单镜可重跑（仅重跑该镜 i2v，配音/字幕不动）。**i2v 引擎两条路径：路径 A = fal.ai 云模型（Kling/Hailuo/Runway/Luma，BYOK 自备 key，v2 既有设计不变）；路径 B = 渲染容器内可选自托管开源图生视频模型（平台自托管能力，可选增强的可选项，不阻塞 MVP）**；两条路径互不依赖，S7 static|i2v 二选一参数结构不变。

**S7 渲染服务（容器内 ffmpeg，REV4 明确）**：S7 static 合成由独立 ffmpeg 渲染容器承担（Docker 镜像内置 ffmpeg 二进制，任务通过 Redis 队列下发，产物回写 MinIO）；**不在前端/后端 API 容器内直接跑 ffmpeg 长任务**，渲染与 Web 层容器隔离、可单独扩展；渲染任务按 task_id 幂等（重复下发不重复合成）。可选自托管 i2v 模型同样以独立容器接入（GPU 节点可选）。

### 4.3 开放导出契约（差异化核心，zip 结构）

```
project-export-YYYYMMDD.zip
├── final.mp4               # 成片（含字幕烧录可选）
├── storyboard.json         # 分镜 JSON（镜头表完整数据，可再导入本平台继续改）
├── assets/
│   ├── shots/shot-01.png … # 逐镜图片素材
│   ├── audio/vo-01.mp3 …   # 逐镜配音
│   └── subtitles.srt       # 字幕
├── script.md               # 文案
└── LICENSE.txt             # 用户内容所有权声明位（R1/R5：用户保留其内容与素材所有权；平台仅提供服务）
```

- 兼容性表述：官方页面/帮助文档可写 "Export works with CapCut / Premiere / DaVinci / any editor that imports MP4+SRT"，禁 "CapCut 官方/认证/合作" 字样（R2）。
- 导出物内含用户素材：用户要求删除时，平台存储副本需可删（GDPR，R5/P2）。
- **i2v 模式导出契约不变**：i2v 动态片段同为 MP4（assets/shots/ 存原始分镜图 + i2v 动态片段均可），仍按同一 zip 结构打包；开放导出契约不因合成方式改变（§4.3 结构为硬约定）。

### 4.4 BYOK 双算力（免费档钩子）

- **免费档（BYOK）**：用户自备 key（LLM + 生图 + TTS 三类 + **可选图生视频 i2v**，可部分配置），无平台算力成本，按任务量限额（如 3 任务/月或按需，T3 定）；内容/版权/合规责任归用户（R1）。**i2v 模式优先走用户自备 fal.ai key：成本用户承担、平台零算力成本**；未配置 i2v key 的用户不可选 i2v（fallback 到 static）。
- **付费档（平台代付）**：平台托管 key，用户按订阅额度使用；平台保留滥用治理义务（R1）。**i2v 计入较高成本档（单镜成本为生图 10-50 倍，单价由 T3 衡金标定；付费档 i2v 可按「较高额度扣减」或「单独计费」实现，T3 定）**。
- **Key 存储（守衡仲裁，P0）**：BYOK Key（含 fal.ai i2v key）仅后端加密存储（**PostgreSQL 加密列，密钥经环境变量/密钥管理注入后端容器**）；前端不得持久化、不得落日志、不得进 URL、不得进 local/sessionStorage。前端任何 Key 持久化 = P0 返工。

## 5. 产品路线图（周级迭代，6 周 MVP）

| 周 | 里程碑 | 交付 |
|----|--------|------|
| W1 | **Docker Compose 基建 + 登录** | **Compose 编排骨架（Next.js/API/PostgreSQL/Redis/MinIO 同网络起跑）、环境变量/密钥管理、健康检查**；Google OAuth、导航/首页 IA |
| W2 | 工作流骨架 | 项目/任务 CRUD、9 步流水线状态机（**PostgreSQL + Redis 队列**） |
| W3 | 前 4 步 | S1 选题解析、S2 文案、S3 分镜 JSON、S4 逐镜生图（fal.ai/Flux）；**渲染容器（ffmpeg 镜像）搭建** |
| W4 | 后 5 步 | S5 TTS（ElevenLabs/OpenAI）、S6 SRT、**S7 ffmpeg 静态合成（渲染容器，static，MVP 默认）**、S8 开放导出 zip（MinIO 打包）、S9 复检迭代 |
| W5 | BYOK + 免费档（付费墙后置） | BYOK 配置中心（后端加密存储）、免费档配额、快速生成/高级创建两条路径收口；**付费墙 W5 之后加**（Creem 上线后申请开通，MVP 免费档先行验证） |
| W6 | 合规三页 + 打磨 + 部署上线 | Privacy/Terms/Cookie 三页、滥用举报、pricing 页（T3 定价输入，**MVP 免费档先行**，Creem 支付项标注"上线后开通"）、**HTTPS 证书签发、备份/恢复演练、容器安全加固、QA、上线** |
| M2 | 增长期 | Blog 10 篇、Programmatic SEO Phase 1（30-50 页）、外链、社区验证差异化 |
| M3 | 扩展期 | Programmatic SEO Phase 2（200-500 页）、团队档评估（V2）、**多节点扩展评估（Compose→Swarm/K8s，视服务器负载）** |

> **i2v 图生视频为可选增强，置于 W4 之后**（W5 后或 v1.1，按 T3 i2v 单价标定与 BYOK 用户反馈排期），**不阻塞 MVP**：MVP 默认 static 合成全绿即可上线；i2v 作为合成方式参数（static|i2v）预留字段与状态机位，上线后按需开启，不改 9 步主结构。自托管 i2v 模型（路径 B）为可选项的可选项，仅在有 GPU 节点且成本测算通过后启用。

> **REV4 变更说明**：原 v2 Roadmap 的「CF Pages/Workers/D1/R2 骨架」全部替换为「Docker Compose 容器编排骨架（Next.js/API/PostgreSQL/Redis/MinIO）」；渲染容器化（ffmpeg）自 W3 起并入排期；W6 增加部署上线专项（HTTPS/备份/安全加固）。W1-W6 里程碑节奏不变，仅基建实现方式变化。

## 6. SEO 页面矩阵（★ 本文档最大章节 — 混合型站点的增长引擎）

> 原则：App 区（登录后）全部 noindex；营销/SEO 区 indexable。工具站核心章节：工具页矩阵、场景化页、内链、CTA 网络、技术 SEO、Programmatic SEO。

### 6.1 页面总览

| 区 | 页面 | Index |
|----|------|-------|
| App | /login, /dashboard, /projects, /projects/[id], /quick-create, /advanced-create, /settings, /settings/billing | noindex |
| 营销 | /, /features, /how-it-works, /pricing, /blog, /blog/[slug] | index |
| 法律 | /privacy, /terms, /cookies, /dmca, /refund | index（low priority） |
| SEO 工具页 | /tools/*（见 6.2） | index |
| Programmatic | /[verb]-[content-type]/*（见 §7） | index |

### 6.2 工具/能力页面矩阵（SEO 入口，独立 URL + 独立 H1）

| URL | H1 | 主关键词 | CTA | 说明 |
|-----|-----|---------|-----|------|
| / | AI Video Studio — Storyboard-first AI Video Creator | ai video creator / storyboard-first | Start free with your own API keys | 首页 = 产品定位 + 工作流演示 |
| /tools/storyboard-generator | AI Storyboard Generator | ai storyboard generator | Create a storyboard | 核心工具页（S3 能力） |
| /tools/script-to-video | Script to Video AI — 分镜可控版 | script to video ai | Turn your script into video | 对标 Pictory 但强调分镜可控（S2-S8） |
| /tools/ai-video-script-writer | AI Video Script Writer | ai video script writer | Write my script | S2 能力页 |
| /tools/text-to-video | Text to Video with Full Control | text to video ai | Start creating | 泛词入口（S1-S8） |
| /tools/ai-voiceover | AI Voiceover Generator (TTS) | ai voiceover generator | Generate voiceover | S5 能力页 |
| /tools/subtitle-generator | AI Subtitle Generator (SRT) | subtitle generator srt | Generate subtitles | S6 能力页 |
| /tools/video-export-zip | Open Format Video Export (MP4+JSON+SRT) | export video project zip | Export & edit anywhere | 差异化页：开放导出 |
| /tools/byok-video-tools | BYOK AI Video Tools — Bring Your Own Key | bring your own key video | Configure your keys | BYOK 免费档 landing |

### 6.3 场景化页面（按使用场景衍生）

| URL | 主关键词 | 场景模板 |
|-----|---------|---------|
| /scenarios/client-video-delivery | ai video for client deliverables | freelancer 交付场景（主 ICP） |
| /scenarios/youtube-script-to-video | script to video for youtube | 内容创作者场景 |
| /scenarios/social-ads-video | ai video for social ads | 社媒广告场景 |
| /scenarios/product-demo-video | ai product demo video | 产品演示场景 |
| /scenarios/video-localization | ai video voiceover localization | 多语言配音场景 |

### 6.4 内链策略（流量循环核心）

- 每个工具页底部 Related Tools（4-6 个互链，如 storyboard-generator ↔ script-to-video ↔ text-to-video）。
- Blog → 工具页自然锚文本 CTA（如「用分镜生成器试试」）。
- 工具页 → 相关 Blog 深度文章。
- Programmatic 页 → 母工具页（收敛权重）。
- 首页 → 全部核心工具页（主导航 + 页脚）。

### 6.5 CTA 网络

| 页面类型 | 主 CTA | 次 CTA |
|---------|-------|-------|
| 首页 | Start free (BYOK) | See how it works / View 9-step demo |
| 工具页 | Try this tool free | View the full workflow |
| Pricing | Start free tier | Compare plans |
| Blog | Read next article | Try the related tool |

### 6.6 技术 SEO

- [x] SSR/SSG（Next.js，营销区静态/ISR）
- [x] 独立 URL + 独立 H1（每工具页）
- [x] Structured Data（SoftwareApplication / HowTo / FAQPage / BlogPosting）
- [x] 分层 Sitemap（tools / blog / programmatic 分开）+ robots.txt
- [x] canonical、OG 标签、图片 alt
- [ ] Crawler Hints（上线前由 T11 启舟配置）
- [x] **REV4 部署变更不影响 SEO 面**：SSR/SSG 由 Next.js 容器承担，Nginx/Caddy 反代后静态/ISR 表现不变；HTTPS 由反向代理统一终结，不影响 robots/sitemap/canonical 协议面

## 7. Programmatic SEO（★ 增长引擎）

- 模板模式：`[verb]-[content-type]`（如 make-ai-video-for-[niche]、script-to-video-[language]-[format]）。
- 动词池：make / create / turn / convert / generate / edit / export / voiceover / subtitle…
- 内容类型池：video / storyboard / youtube video / reels / shorts / tiktok video / ad video / product demo / client video / [language]-voiceover…
- 参数池（追加维度）：[niche]（fitness, real estate, SaaS, food, fashion…）、[format]（9:16, 16:9, 1:1）、[duration]（30s, 60s, 90s）、[tone]（professional, casual, hype, educational…）。
- 阶段：Phase 1（M2）30-50 页 → Phase 2（M3）200-500 页 → Phase 3（M4+）3000+ 页。
- 批量生成：构建时脚本 + ISR（页面 = 模板 + 结构化数据，调用 LLM 生成 H1/描述骨架，避免全重复内容）。
- 每页真实价值：不同 verb/content-type/参数组合对应不同搜索意图，页面含对应工具引导 + 步骤说明 + FAQ。

## 8. 流量模型（Growth Loop）

```
Google SERP → SEO 工具页 / Programmatic 页 → 免费工具试用（BYOK 免注册体验）
   → 注册（Google OAuth）→ 9 步流水线跑出第一支视频 → 开放导出 zip（可带走）
   → 满意 → 付费档转化 / 分享作品 → Blog / 社区（r/videography, r/freelance）→ Backlinks → Google
```

关键增长杠杆：
- P0：工具页互链网络 + 免费 BYOK 试用（零成本体验完整流程）。
- P1：Blog 内容（how-to、freelancer 交付指南）+ 社区信号（Reddit/HN/PH 首发）。
- P2：Programmatic SEO 爆发 + 作品分享模板（导出页自带分享/水印可选）。

## 9. 关键词规划（P0/P1/P2）

| 等级 | 关键词 | 页面映射 | 数量 |
|------|--------|---------|------|
| P0（核心入口） | ai video creator, script to video ai, text to video ai, ai storyboard generator, ai video for freelancers | 首页 + 核心工具页 | 8-12 |
| P1（场景长尾） | script to video for youtube, ai voiceover generator, subtitle generator srt, ai product demo video, byok video tools | 场景页 + 工具页衍生 | 50-100 |
| P2（Programmatic 扩展） | make ai video for [niche], turn [content] into video, [format]-[duration]-[tone] 组合 | Programmatic 页 | 300-3000+ |

## 10. Route Contract

> REV4 变更：**全部去除 Cloudflare 相关路由（/api/webhooks/cloudflare 删除）；流水线进度回调改为容器间内部调用（后端 API ↔ 渲染容器经 Redis/内部网络，无公网 webhook）**；公网路由保留（反代 Nginx/Caddy → Next.js 容器）。

| 路径 | 方法 | 渲染 | 状态码 | 说明 |
|------|------|------|--------|------|
| / | GET | ISR | 200 | 首页 |
| /features, /how-it-works, /pricing | GET | SSG | 200 | 营销页 |
| /tools/*, /scenarios/*, /blog, /blog/[slug] | GET | ISR | 200 | SEO 页 |
| /[verb]-[content-type]/... | GET | ISR | 200 | Programmatic 页 |
| /login | GET | SSR | 200 | Google OAuth 入口 |
| /login/callback | GET | SSR | 200, 302 | OAuth 回调（无 Key 入 URL，R1） |
| /dashboard, /projects | GET | SSR(auth) | 200, 302 | 工作台 |
| /projects/[id] | GET | SSR(auth) | 200, 302, 404 | 任务详情/9 步流水线 |
| /quick-create, /advanced-create | GET/POST | SSR(auth) | 200, 302, 400 | 创建任务 |
| /settings, /settings/billing | GET/POST | SSR(auth) | 200, 302, 400 | BYOK 配置（Key 只 POST 到后端）+ 订阅 |
| /api/auth/* | GET/POST | API | 200, 401, 429 | OAuth session |
| /api/projects | GET/POST | API | 200, 201, 401, 429 | 项目 CRUD |
| /api/tasks | GET/POST | API | 200, 201, 400, 429 | 任务创建/列表 |
| /api/tasks/[id] | GET/PATCH | API | 200, 404, 409 | 任务状态/重试 |
| /api/tasks/[id]/steps | GET/POST | API | 200, 404 | 单步操作（重跑/跳过/改参） |
| /api/export/[id] | GET | API | 200, 404, 410 | 导出 zip 下载（MinIO 预签名） |
| /api/keys | POST/DELETE | API | 201, 204, 400, 401 | BYOK Key 管理（**仅后端接收，不回读明文**） |
| /api/webhooks/creem | POST | API | 200, 400 | Creem 订阅事件（上线后申请开通后启用） |
| /privacy, /terms, /cookies, /dmca, /refund | GET | SSG | 200 | 法律页（R5/C1-C5） |
| /report-abuse | GET/POST | SSG/API | 200, 201 | 滥用举报通道（R4/C7） |
| /sitemap.xml, /robots.txt | GET | ISR | 200 | 技术 SEO |
| /* | — | — | 404 | 兜底 |

内部路由（不暴露公网，容器网络内）：
- 后端 API → Redis：任务入队/出队、进度回调（`QUEUE:task:<id>:steps`）。
- 后端 API → MinIO：素材/产物/导出 zip 对象读写（S3 兼容 API，内网端点）。
- 后端 API → 渲染容器：渲染任务经 Redis 队列下发；渲染容器完成回写 MinIO + 经 Redis 通知后端更新状态。**无公网 webhook 路由（原 /api/webhooks/cloudflare 已删除）**。
- 反向代理 Nginx/Caddy → Next.js：80/443 公网入口，TLS 终结，其他容器不出公网。

## 11. MVP 范围

| 功能 | MVP | V2 | 说明 |
|------|-----|----|------|
| Google OAuth 登录 | ✅ | ✅ | 核心 |
| 项目/任务 CRUD + 9 步流水线状态机 | ✅ | ✅ | 核心 |
| S1-S9 全流水线（文案/分镜/生图/TTS/字幕/合成） | ✅（S7=static） | ✅ | 核心；S7 合成方式参数（static\|i2v）预留 |
| **S7 图生视频 i2v（Kling/Hailuo/Runway/Luma）** | ✗（可选增强，W4 后） | ✅ | 阁主 REV2 新增；不阻塞 MVP |
| 开放导出 zip（MP4+JSON+素材+SRT+LICENSE） | ✅ | ✅ | 核心差异化（i2v 片段同为 MP4，导出不变） |
| BYOK 配置中心（后端加密存储） | ✅ | ✅ | 核心钩子（R1） |
| 免费档（BYOK）/ 付费档（平台代付） | ✅（配额简化） | ✅（完整） | 定价 T3 |
| 快速生成（4 步）/ 高级创建 | ✅ | ✅ | 核心 |
| 分镜人工编辑（改镜头表后重生成） | ✅（基础） | ✅（增强） | 每步可控承诺 |
| Creem 订阅（上线后申请） | ⚠️（MVP 后置） | ✅ | 付费墙 W5 之后加，MVP 免费档先行验证 |
| **Docker Compose 自托管部署（含 HTTPS/备份/密钥管理）** | ✅ | ✅ | REV4 基建核心；W1 起，W6 上线 |
| **自托管 i2v 模型（路径 B，GPU 节点）** | ✗ | ⚠️ 评估 | 可选增强的可选项，不阻塞 MVP |
| 素材库（自产授权素材） | ⚠️（仅少量自产） | ✅ | R3 素材来源清单 |
| 团队协作/多成员 | ✗ | ✅ | V2 |
| 在线视频编辑器 | ✗ | ⚠️ 评估 | V2 再评估 |
| 声音克隆 | ✗ | ✗ | 不做（R4） |
| 纯文生视频（Sora/Veo 式 text-to-video） | ✗ | ✗ | 不做（§3.3 NOT-DO #1） |

## 12. 验收标准

### 12.1 P0 用户任务

| # | 任务 | 通过标准 |
|---|------|---------|
| U1 | 新用户 Google 登录 → 进入工作台 | 首次登录 < 10s，无异常，session 稳定 |
| U2 | 快速生成：粘贴文案 → 检查设置 → 开始生成 | 4 步内创建任务，进入 9 步流水线 |
| U3 | 9 步流水线跑通 | 任一真实任务 S1→S8 全绿，失败可单步重试 |
| U4 | 单步可控：改一个分镜画面描述 → 只重跑该镜 | 仅 S4 对应镜头重生成，其余步骤不动 |
| U5 | BYOK 配置 3 类 key → 免费跑一个任务 | Key 保存后页面不回显明文；任务用用户 key 跑通（R1 验证点） |
| U6 | 导出 zip 下载 | zip 内含 final.mp4 + storyboard.json + assets/ + subtitles.srt + LICENSE.txt；MP4 可播放、SRT 时间轴对齐 |
| U7 | 将导出 zip 导入第三方剪辑工具（CapCut/Premiere/任意支持 MP4+SRT 的工具） | 素材可编辑、字幕可加载（兼容性事实验证） |
| U8 | 付费档（平台代付）跑同一任务 | 配额扣减正确，无 BYOK 也能完成 |
| **U9** | **BYOK 用户可选 i2v 模式跑通一条任务（分镜图 → 动态片段 → 成片 MP4）** | **i2v 模式下分镜图喂 fal.ai 图生视频模型，每镜生成 3-10s 动态片段并自动拼接成片 MP4（配音/字幕轨道不变）；导出 zip 结构不变（i2v 片段同为 MP4 可播放）；未配置 i2v key 时该选项不可用且 fallback static 不报错** |
| **U10** | **容器编排健康（REV4 新增）** | **Docker Compose up 后全部容器健康（Next.js/API/PostgreSQL/Redis/MinIO/渲染），`docker compose ps` 全 healthy；HTTPS 访问正常（证书有效），公网仅反代端口暴露，其余容器不出公网** |
| **U11** | **渲染任务幂等与隔离（REV4 新增）** | **同一 task_id 重复下发渲染任务不重复合成（幂等）；渲染容器故障时任务可重试，Web 层不中断；渲染容器与 Web 容器网络隔离，仅经 Redis/MinIO 交互** |

### 12.2 Competitive Minimum

| # | 标准 | 对标 |
|---|------|------|
| C1 | 文案→成片全流程 < 15 分钟/条（普通配置） | Pictory/InVideo（模板自动） |
| C2 | 生图质量达到可用水平（可商用，无畸形主体） | fal.ai/Flux 基线 |
| C3 | 配音自然度（无克隆） | ElevenLabs/OpenAI TTS 基线 |
| C4 | 导出格式开放性（MP4+JSON+SRT 全开放） | 无竞品对标（差异化） |
| C5 | 免费档（BYOK）可完整跑通至少 1 条视频 | 竞品免费档多为加水印/限时长 |
| C6 | 分镜每步可控（改一步只重跑一步） | 竞品黑盒一键出片（差异化） |

### 12.3 合规验收（守衡 P0 红线，不满足即阻断上线）

- R1：代码审查确认 BYOK Key（含 fal.ai i2v key）无前端持久化、无日志、无 URL 传递；存储为 PostgreSQL 加密列（密钥经环境变量/密钥管理注入后端容器）。
- R2：全站文案扫描无品牌背书词（破局/aipoju/剪映/CapCut 官方/认证等）。
- R3：平台无抓取功能；自带素材有来源清单（T4）。
- R4：TOS 含禁止条款 + 举报通道 + 处置权；无绝对化功效承诺。
- R5：Privacy/Terms/Cookie 三页上线；GDPR 删除/导出入口可用。
- **R6（REV4 新增部署安全验收，不满足即阻断上线）**：HTTPS 强制（TLS 证书有效、HTTP→HTTPS 重定向）；密钥/Token 仅存环境变量或密钥管理，不落代码/镜像/日志；容器最小权限（非 root、只读文件系统可选、资源限制）；公网仅暴露反代端口，PostgreSQL/Redis/MinIO/渲染容器不暴露公网；数据库/对象存储定期备份 + 恢复演练通过；服务器 SSH 加固（密钥登录、禁 root 密码、防火墙）。

## 13. Data Contract

### 13.1 实体与存储（REV4：D1→PostgreSQL，R2→MinIO，实体表不变）

| 实体 | 关键字段 | 存储 | 说明 |
|------|---------|------|------|
| user | id, email, google_sub, tier, created_at | PostgreSQL | OAuth 身份 |
| project | id, user_id, title, source_type, created_at | PostgreSQL | 选题/项目 |
| task | id, project_id, status, current_step, progress, config(JSON)（含合成方式 static\|i2v）, created_at | PostgreSQL | 流水线任务 |
| step_result | task_id, step, status, payload(JSON), error, retries | PostgreSQL | 每步产物元数据（i2v 片段为 S7 子产物，记 payload 内） |
| api_key | id, user_id, provider, key_ciphertext, salt, created_at, last_used | PostgreSQL（加密列） | **BYOK Key（LLM/生图/TTS/i2v 共四类 provider）：仅存密文，后端加密（R1）** |
| asset | id, task_id, type(shot/audio/srt/mp4/i2v-clip/json), minio_key, size, checksum | PostgreSQL + MinIO | 素材/产物（MinIO 对象存储；i2v 动态片段 type=i2v-clip） |
| export | id, task_id, minio_key, zip_hash, created_at | PostgreSQL + MinIO | 导出 zip（预签名下载，过期删除） |
| subscription | id, user_id, creem_customer, plan, status | PostgreSQL | Creem 订阅（Merchant of Record；上线后申请开通，MVP 免费档先行，T3 定价后建） |
| abuse_report | id, target_url, reason, status, created_at | PostgreSQL | 举报通道（R4） |

### 13.2 数据流约束（REV4：Workers→后端容器，D1→PostgreSQL，R2→MinIO，Queues→Redis）

- **Key 生命周期**：用户 POST → **后端 API 容器**加密 → 存 **PostgreSQL** 密文 → 调用第三方时后端解密使用 → 删除即销毁密文。前端任何环节不得接触明文 Key（R1）。
- **任务产物**：图片/音频/MP4/i2v 片段存 **MinIO**；素材包 zip 由后端服务从 MinIO 打包生成。
- **任务编排**：S 步任务经 **Redis 队列**下发（后端 API → 渲染容器 / 第三方 API 调用异步化），进度经 Redis 回写 PostgreSQL 状态机；渲染容器完成回写 MinIO 后通知后端。
- **保留期限**：任务产物保留期（默认 90 天，可配）；用户删除账号 → 级联删除 PostgreSQL 数据 + MinIO 对象（GDPR Right to Erasure，R5）。
- **数据导出**：/settings 提供用户数据导出（JSON + 素材打包）入口（GDPR，R5）。
- **分析数据**：GA4/Clarity 只收匿名事件，不含 Key 与内容明文；Cookie banner 可拒绝（C3）。
- **备份（REV4 新增）**：PostgreSQL 定期 pg_dump 备份 + MinIO 对象备份（异地/异盘），保留策略与恢复演练见 W6；备份数据同样加密存储。

### 13.3 第三方处理者清单（R5/GDPR 要求，Privacy Policy 需列出；REV4 更新）

**SaaS/API 处理者（与 v2 相同的部分）**：Google OAuth ｜ OpenAI / Anthropic（LLM）｜ fal.ai / Flux（生图）｜ **fal.ai 图生视频（Kling/Hailuo/Runway/Luma，S7 可选 i2v）** ｜ ElevenLabs / OpenAI（TTS）｜ Creem（支付，Merchant of Record，上线后申请开通）｜ GA4 / Clarity（分析）

**REV4 变更：Cloudflare 已移除，不在处理者清单。**

**自托管组件（Privacy Policy 需如实说明为自托管/自行运维的基础设施，非第三方处理者）**：
- **Next.js 前端容器 / 后端 API 容器**：平台自有应用代码，运行于自有服务器（Docker）。
- **PostgreSQL 容器**：平台自托管数据库（用户数据、Key 密文、任务状态）。
- **Redis 容器**：平台自托管队列/缓存（任务编排，不存持久业务数据）。
- **MinIO 容器**：平台自托管对象存储（用户素材/产物/导出 zip）。
- **ffmpeg 渲染容器**：平台自托管渲染服务（S7 static 合成；可选自托管 i2v 模型）。
- **Nginx/Caddy 反向代理**：平台自托管入口（TLS 终结）。
- 隐私政策需写明：以上组件由平台在自有/租用服务器上运维，数据留存策略（默认 90 天）、备份策略与用户删除/导出权利同 §13.2；若未来迁移云服务商（如自托管服务器托管于 AWS/OVH 等 IaaS），将在 Privacy Policy 更新 IaaS 处理者信息。

## 14. 非功能需求：守衡 P0 红线并入（R1-R5 + REV4 部署安全）

> 来源：/Volumes/Data/hermes/profiles/shouheng/shouheng-compliance-v0.md。以下红线不满足 = 上线阻断。

| 红线 | 要求 | 落地 |
|------|------|------|
| R1 BYOK 数据责任边界 | 免费档（BYOK）内容/版权/合规责任归用户；TOS 写明平台仅提供工作流编排；付费档平台保留滥用治理；**Key 仅后端加密存储** | §4.4 / §13.2；T8 后端契约必含「前端无 Key 持久化」校验 |
| R2 商标/品牌红线 | 站名/landing/示例素材禁「破局/aipoju/剪映/CapCut/Creatify/Descript/TikTok/Shopify/Amazon」背书暗示；兼容性仅 "compatible with / import into" | §4.3 兼容性文案；T10/T11 文案检查 |
| R3 素材版权 | 平台自带素材须有来源授权清单（T4 产出）；用户上传素材归用户（TOS 服务必要授权，服务结束删除）；平台不得内置抓取竞品素材 | §11 MVP 素材库仅少量自产；T8 无抓取接口 |
| R4 内容滥用 | TOS 禁止条款清单（欺诈/虚假宣称/deepfake/侵权）+ 举报通道 + 处置权（暂停/删除/封号）；禁声音克隆；禁绝对化功效承诺 | /report-abuse 路由 + TOS 文案；landing 无"爆款必出"类文案 |
| R5 隐私 | Privacy Policy + Terms + Cookie 三页（英文，US 默认）；GDPR 最低要求（最小化收集/第三方清单/删除与导出入口）；18+/13+ 年龄门槛 | §13.3 处理者清单（含自托管组件说明）；W6 三页上线；注册页年龄门槛 |
| **R6 部署安全（REV4 新增）** | **HTTPS 强制（TLS 证书、HTTP→HTTPS）；密钥/Token 仅环境变量/密钥管理，不落代码/镜像/日志；容器最小权限（非 root、资源限制、只读 FS 可选）；公网仅暴露反代端口（PostgreSQL/Redis/MinIO/渲染容器不出公网）；数据库/对象存储备份 + 恢复演练；服务器 SSH 加固（密钥登录、防火墙、自动更新）** | W6 部署上线专项；T11 启舟执行；U10 验收 |

P1 条件（满足才可上线，责任方标注）：TOS（C1）/ Privacy Policy（C2）/ Cookie banner（C3，前端）/ Refund 条款（C4，T3→T4）/ DMCA 通道（C5）/ 素材来源清单（C6，T4）/ 滥用举报入口（C7，前端）/ AI 内容披露（C8，文案）—— 详见守衡文件 §2，由 T4 执简落页，本 PRD 不再展开。

## 15. 交付物与验收清单自检

### 15.1 本阶段交付物

- [x] brief-v3.md → /Volumes/Data/hermes/profiles/dingchuan/output/ai-video-studio-brief-v3.md
- [x] prd-v3.md → /Volumes/Data/hermes/profiles/dingchuan/output/ai-video-studio-prd-v3.md（v3 全自托管重出：§1 技术栈 Docker 化 / §4.2 S7 渲染=容器内 ffmpeg + 可选自托管 i2v 路径 B / §5 Roadmap W1 起 Docker Compose 基建与容器编排、W6 部署上线 / §10 Route 去 Cloudflare webhook 改内部容器间调用 / §13 Data D1→PostgreSQL、R2→MinIO、Queues→Redis 实体表不变 / §13.3 处理者清单去 Cloudflare 加自托管组件说明 / §14 新增 R6 部署安全 / §16 新增自托管运维/服务器成本/扩展性；承接 v2：S7 static|i2v 二选一 / fal.ai 用途扩展生图+可选图生视频 / NOT-DO 禁纯文生视频 / BYOK i2v 用户自备 key / 导出契约不变 / U9 验收 / i2v 风险 P1 / Roadmap W4 后置；承接 v1 三项：域名待定不阻塞 / 支付 Creem 上线后申请、MVP 免费档先行 / 付费墙 W5 之后加）
- [x] 页面矩阵（§6）+ Route Contract（§10）+ Data Contract（§13）
- [x] MVP/NOT-DO（§11 / §3.3）+ 验收标准（§12，含 U10/U11 部署验收）+ 9 步流水线（§4.2）
- [x] 守衡 R1-R5 红线并入（§14，未改动）+ REV4 新增 R6 部署安全
- [x] 破局 7 项架构出海化映射（§4.1）

### 15.2 质量门槛自检

- [x] PRD 是可开发产品（含引擎选型、状态机、契约、部署形态），非关键词说明
- [x] 每个 indexable 页面有真实价值和用户任务（§6）
- [x] NOT-DO 明确（11 条，含禁纯文生视频 + 不自建模型推理集群）
- [x] 设计/文案/前后端交付边界清晰（Route + Data Contract + 兼容性文案规则）
- [x] SEO 章节为全文最大章节（§6-§9）
- [x] Programmatic SEO 三阶段规划（§7）
- [x] 周级 Roadmap（§5，W1 起含 Docker Compose 基建）
- [x] Growth Loop 流量模型（§8）
- [x] 关键词 P0/P1/P2 分级映射（§9）
- [x] 平台 vs 单工具决策：平台化（工作台 + 工具页矩阵 + Programmatic），非单工具
- [x] 内链策略（Related Tools 网络，§6.4）
- [x] REV4 七项必改全部落地：①§1 技术栈全自托管化 ②§10 Route 去 Cloudflare webhook 改内部容器间调用、保留公网路由 ③§13 Data Contract D1→PostgreSQL、R2→MinIO、Queues→Redis、实体表不变 ④§13.3 处理者清单去 Cloudflare、加自托管组件说明 ⑤S7 渲染明确为容器内 ffmpeg ⑥§5 Roadmap W1 起含 Docker Compose 基建、渲染容器化并入 ⑦§16 风险新增自托管运维/服务器成本/扩展性 + 部署安全（HTTPS/密钥管理/容器隔离）
- [x] 禁止改动项未动：9 步流水线主结构 / 开放导出 zip 契约 / 守衡 R1-R5 / Creem 支付 / 域名待定 / S7 static|i2v 二选一 / BYOK 双算力

## 16. 风险与待确认

- P0：BYOK Key 存储位置（守衡仲裁已定：后端加密；T8 必须执行，前端持久化 = 返工）。
- P0：合规三页 + TOS 条款未上线前不得开放注册（R5/C1-C5）。
- **P0：自托管部署安全（REV4 新增）—— HTTPS、密钥管理、容器隔离、备份恢复任一缺失 = 上线阻断（R6）；服务器被入侵/密钥泄露 = 用户 Key 密文与素材泄露风险。T11 必须执行，U10 验收。**
- P1：分镜工作流是否真是刚需 vs 模板自动就够 — [待验证]：社区信号（r/videography、r/freelance）+ HN/PH 首发反馈；决定 Programmatic SEO 投资强度。
- P1：API 单条成本（生图/TTS/合成）未实测 — [待测]：T3 衡金；BYOK 模式天然规避平台算力成本。
- **P1：i2v 图生视频成本为生图 10-50 倍、每镜动态不可完全预期（可控性弱于 static，需人工抽检）— BYOK 模式下成本用户自担（平台零成本）；付费档 i2v 单价由 T3 衡金标定（须在 pricing 页如实披露高成本）。**
- **P1：自托管运维负担/服务器成本/扩展性（REV4 新增）—— 服务器/带宽/存储为平台固定支出（较 Cloudflare 免费层更贵，需并入 T3 定价）；单机部署有单点故障风险，需备份 + 多节点扩展路径（Compose→Swarm/K8s，M3 评估）；渲染负载高峰需水平扩展渲染容器。**
- **P1：自托管与第三方依赖并存的双运维面（REV4 新增）—— 应用自托管但 LLM/生图/TTS/i2v 仍依赖第三方 API，任一 API 故障影响流水线；需在任务状态机中做重试/降级（如生图失败可重试，i2v key 缺失 fallback static）。**
- P2：客单价个人档 $15-40 < 团队档 $99+ — 需要量大或 V2 转团队档。
- [待确认]：**域名待定（阁主上线前定，不阻塞开工链路；影响 HTTPS 证书签发与反代配置，T11 待域名后实施）**；SERP 实扫；具体价格档位（T3）；i2v 各模型（Kling/Hailuo/Runway/Luma）单镜成本实测（T3）；**自托管服务器选型/成本实测（T3）+ 备份与恢复方案（T11）**；Creem 商户开通（上线后申请）。

## 17. 下游交接摘要

- **下一阶段**：阁主终审本 v3 → 通过后并行启动 T3 衡金（定价/成本实测，含 i2v 单镜成本、自托管服务器成本与单价标定）与 T4 执简（合规落页：三页文案 + 素材来源清单 + **部署安全要求并入交付**）→ 之后 T7 前端 / T8 后端（按 §10 Route Contract + §13 Data Contract + R1 Key 约束 + **容器化实现：PostgreSQL/MinIO/Redis 接入、S7 合成方式参数 static|i2v 需在 task config 与状态机中预留、渲染容器 ffmpeg 镜像与队列契约**）→ T10 引川（SEO 文案，按 §6-§9）→ **T11 启舟（部署/上线：Docker Compose 编排、HTTPS 证书、密钥管理、备份/恢复演练、容器安全加固、多节点扩展路径；域名待阁主定，Creem 商户上线后申请开通，付费墙 W5 之后加；i2v 可选增强置于 W4 之后，不阻塞 MVP 上线）**。
- **下游必须读取**：本 PRD（§4.2 流水线、§10 Route、§13 Data、§14 红线含 R6、§5 Roadmap 容器化基建）+ 守衡合规基线全文 + 寻源报告全文。
- **下游不能改动**：P0 红线（R1-R6）、开放导出 zip 契约（§4.3）、9 步流水线状态机定义、S7 static|i2v 二选一设计、BYOK 双算力。
- **不能假设**：定价未定（T3 出，含 i2v 单价与自托管成本）；素材来源清单未出（T4 出）；CapCut 兼容仅兼容性描述；i2v 为可选增强（未配置 BYOK i2v key 的用户不可选 i2v，fallback static）；**自托管服务器与证书等基础设施细节（T11 在阁主定域名后实施）；Cloudflare 相关代码/配置不再存在（全量移除）**。
- **风险复核点**：T3 定价文案须与免费/付费档责任边界一致（不得承诺平台对 BYOK 输出负责）；i2v 高成本须在 pricing 页如实披露；T10 竞品对比只做事实性（禁暗示 i2v 即「AI 全自动出片」，防 Sora/Veo 式纯文生视频混淆）；**T11 上线前须过 U10（容器健康 + HTTPS + 端口隔离）与 U11（渲染幂等/隔离）验收 + R6 部署安全红线，任一不满足不得上线**。

---
*状态：v3 — 待阁主终审。本 PRD 不自动进入开工链路。*
