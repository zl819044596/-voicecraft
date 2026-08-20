# AI 工具站 — 重新规划 v1

> 从「AI 视频工作室」转向「AI 工具站」
> 轻量 · 稳定 · 快速上线

---

## 一、定位

单个独立的 AI 工具合集，每个工具即开即用，不需要串联流水线。

**用户流程**：访问 → 选工具 → 填参数 → 出结果

**不是**：视频工作室、短漫剧平台、自动化流水线

---

## 二、工具清单（MVP，8 个）

| # | 工具 | 调用的 API | 现有代码 |
|---|------|-----------|---------|
| 1 | **文案生成** | deepseek 官方 API | ✅ 已有 quick 页文案来源 |
| 2 | **图片生成** | wingray (Wan/Qwen-Image) | ✅ 已有 models 配置 |
| 3 | **配音生成** | wingray (CosyVoice/Qwen3-TTS) | ✅ 已有 quick 页配音设置 |
| 4 | **视频生成** | wingray (Kling/Vidu/HappyHorse) | ✅ 已有 models 配置 |
| 5 | **分镜脚本** | deepseek 官方 API | ✅ 已有 S2 分镜组件 |
| 6 | **字幕生成** | wingray 或 whisper | ⚠️ 需要新增 |
| 7 | **视频翻译** | wingray + deepseek | ⚠️ 需要新增 |
| 8 | **Prompt 优化** | deepseek 官方 API | ✅ 已有 prompts 页 |

**每个工具就是一个独立页面，5 分钟完成一次生成。**

---

## 三、技术架构（去重就轻）

### 当前架构（太重）

```
Next.js 前端 → Fastify 后端 → S1-S9 Pipeline → Docker 多容器 → wingray 网关
```

### 新架构（轻量）

```
Next.js 前端 → API Routes（代理各模型 API）→ 直接调模型 API
                      ↓
           用户系统 + 支付（轻量后端）
```

### 具体设计

| 层 | 技术 | 说明 |
|----|------|------|
| **前端** | Next.js 16（现有） | 保留现有页面，去掉流水线 UI |
| **API 代理** | Next.js API Routes | 替代 Fastify 后端，直接调模型 API |
| **用户系统** | Next.js API Routes + SQLite | 登录/注册/额度管理（简化现有） |
| **支付** | Stripe | 保留现有 billing 页 |
| **模型调用** | 直接调 deepseek / wingray API | **非流式**（绕开 wingray 流式 bug） |
| **部署** | **Vercel** | 零服务器运维，自动 HTTPS，自动扩容 |

### 为什么去掉 Docker

| 问题 | 当前（Docker） | 新方案（Vercel） |
|------|---------------|-----------------|
| 部署 | 本地 build + docker compose up | git push 自动部署 |
| 运维 | 容器监控、日志、重启 | 零运维 |
| 稳定性 | wingray 网关问题、容器间通信 | 独立 Serverless 函数 |
| 成本 | 服务器费用 | 免费额度够用 |
| HTTPS | 需要 nginx 配置 | 自动 |

---

## 四、部署方案

### 方案 A：Vercel 全栈（推荐）

```
vercel.json
├── frontend/    → Next.js 页面
├── api/         → API Routes（模型代理、用户、支付）
└── kv/          → Vercel KV（额度管理、用户数据）
```

**优势**：
- 一个 `git push` 上线
- 自动 HTTPS、CDN、Serverless
- 免费额度足够 MVP 阶段
- 不需要 Docker、不需要服务器

**劣势**：
- API Routes 有 10s 超时限制（但非流式调用 < 5s 足够）
- 需要少量改造现有代码

### 方案 B：保留现有后端（适配器模式）

如果不想改后端代码，保留现有 Fastify 后端，但：
- 去掉 Docker Compose
- 后端直接部署到 Railway / Fly.io
- 前端部署到 Vercel

---

## 五、改造计划（基于现有代码）

### Phase 1 — 清理（1-2 天）

| 任务 | 说明 |
|------|------|
| 去掉 pipeline 后端 | 删除 `api/src/pipeline/` 目录 |
| 去掉 S1-S9 相关路由 | 删除 `api/src/routes/tasks.js`、`tasks-regenerate.js`、`projects.js` |
| 保留 auth/payment 路由 | 登录、支付、用户管理保留 |
| 前端去掉任务页 | 简化 `/app/tasks` 页面 |

### Phase 2 — 工具独立化（3-5 天）

| 任务 | 说明 |
|------|------|
| 每个工具独立页面 | 基于现有 `tools/[slug]` 模板，每个工具一个页面 |
| 工具直接调 API | 前端或 API Routes 直接调 deepseek/wingray，不走流水线 |
| 非流式调用 | 所有工具调用都走非流式（绕开 wingray 流式 bug） |
| 结果展示 | 生成结果直接展示在工具页面，不需要任务页 |

### Phase 3 — 部署（1 天）

| 任务 | 说明 |
|------|------|
| 配 Vercel | 项目导入 Vercel，配置环境变量 |
| 配域名 | 绑定自定义域名 |
| 测试 | 8 个工具逐个测试 |

---

## 六、现有项目可复用的代码

### 前端（大部分可复用）

| 代码 | 路径 | 说明 |
|------|------|------|
| 营销页面 | `src/app/(marketing)/*` | 首页、定价、博客等 |
| 工具页模板 | `src/app/(marketing)/tools/[slug]/page.tsx` | 8 个工具页 |
| 工作台 | `src/app/app/quick/page.tsx` | 三模式（需要简化） |
| 用户系统 | `src/app/app/settings/` | 设置页 |
| 定价/支付 | `src/app/app/billing/` | 支付页 |
| 模型配置 | `src/app/app/models/` | 各模型配置 |
| 公共组件 | `src/components/app/*` | 表单组件、UI 组件 |
| 站点数据 | `src/lib/site-data.ts` | 工具定义、SEO 数据 |
| 应用数据 | `src/lib/app-data.ts` | 模型配置、预置 |

### 后端（需要简化的部分）

| 代码 | 路径 | 保留？ |
|------|------|--------|
| auth | `api/src/routes/auth.js` | ✅ 保留 |
| payment | `api/src/routes/billing.js` | ✅ 保留 |
| 用户管理 | `api/src/routes/profile.js` | ✅ 保留 |
| S1-S9 pipeline | `api/src/pipeline/` | ❌ 删除 |
| 任务管理 | `api/src/routes/tasks.js` | ❌ 删除或简化 |
| 项目 | `api/src/routes/projects.js` | ❌ 删除 |
| 模型 providers | `api/src/providers/` | ✅ 保留（wingray.js 等） |

---

## 七、为什么这不等于 LumenX 或 ShortGPT

| 维度 | LumenX | ShortGPT | 本工具站 |
|------|--------|----------|---------|
| 定位 | 短漫剧平台 | 视频自动化框架 | **轻量工具合集** |
| 用户 | 创作者 | 开发者 | **普通用户** |
| 使用方式 | 完整 pipeline | Python 库/Colab | **网页即开即用** |
| 部署 | Docker Compose | Docker | **Vercel 秒级部署** |
| 复杂度 | 高 | 中 | **低** |
| 目标 | 生产完整视频 | 自动化频道 | **快速出单个内容** |

---

## 八、后续方向

### 上线后的扩展

| 阶段 | 新增 |
|------|------|
| MVP 后 | 用户反馈 → 增加高频工具 |
| 验证后 | 优化付费模式（按次/包月/点数） |
| 稳定后 | 考虑是否加回简化版流水线（用户可选） |

### 不做的（保持轻量）

- ❌ 不搞复杂 pipeline
- ❌ 不搞 Docker 多容器
- ❌ 不搞 wingray 网关代理
- ❌ 不搞桌面端
- ❌ 不搞短漫剧

---

## 九、决策

**建议走 Phase 1 → 2 → 3 顺序，目标是 2 周内上线 MVP。**

如果决定走这个方向，下一步：
1. 确认这个方向是否对
2. 我出详细的 Phase 1 任务书（类似 PIPELINE_TASK 格式）
3. 按任务书用 Claude Code 执行