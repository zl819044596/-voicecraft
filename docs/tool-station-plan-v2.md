# AI 工具站 — 重新规划 v2

> 从「AI 视频工作室」转向「可控出片工具站」
> 主力 API：硅基流动（SiliconFlow）· 部署：Vercel

---

## 一、核心功能

**用户写文案 → AI 生成分镜（可编辑） → 一键出片**

```
用户 → 写文案/给想法
      → AI 生成分镜（每个镜头含标题/内容/字幕/图片提示词）
      → 用户检查每个镜头
          ├── 图好 → 留着
          ├── 图不好 → 点重试（重新生图）
          │              → 还是不好 → 自动搜 Pexels 配图
          │              → 还不行 → 用户上传
          └── 全部满意 → 一键出片（配音+字幕+合成）
```

**核心价值**：可控（每个镜头可编辑）+ 快速（一键生成）

---

## 二、模型选型（硅基流动）

| 能力 | 推荐模型 | 说明 |
|------|---------|------|
| **文案生成** | `DeepSeek-V3` 或 `Qwen2.5-72B` | 中文强，性价比高 |
| **分镜脚本** | 同上 | 同一模型，不同 prompt |
| **图片生成** | `FLUX.1-schnell`（快速）或 `FLUX.1-dev`（高质量） | 文生图，可重试 |
| **TTS 配音** | `CosyVoice-300M` 或 `FishSpeech` | 中文自然，多音色 |
| **视频合成** | FFmpeg 拼接（图片+配音+字幕） | 不需要 AI 视频模型 |

**不用 wingray**，全部走硅基流动，一个 API key 搞定。

**为什么不用 AI 视频模型**：工具站的核心是"可控出片"，FFmpeg 拼接图片+配音+字幕足够出高质量短视频，不需要 I2V 模型。而且 AI 视频生成慢、贵、不可控。

---

## 三、技术架构

```
前端（Next.js） → API Routes → 硅基流动 API（非流式）
                              → Pexels API（兜底配图）
                              → FFmpeg（视频合成）
```

| 层 | 技术 | 说明 |
|----|------|------|
| **前端** | Next.js 16（现有） | 保留现有页面，简化流水线 UI |
| **API 代理** | Next.js API Routes | 代理硅基流动 API，不走后端流水线 |
| **用户系统** | 轻量后端（Fastify 简化版） | 登录/注册/额度管理 |
| **支付** | Stripe | 保留现有 billing |
| **模型调用** | 硅基流动 API | **非流式**，稳定 |
| **图片兜底** | Pexels API | 免费可商用素材 |
| **视频合成** | FFmpeg | 图片+配音+字幕拼接 |
| **部署** | **Vercel** | 零服务器运维 |

---

## 四、产品流程（完整版）

### 步骤 1：写文案

用户输入：
- 原始文案（直接使用）
- 参考链接/素材（AI 二创）
- 一句话方向（AI 创业）

### 步骤 2：生成分镜

AI 根据文案生成 4-8 个镜头，每个镜头含：

```typescript
interface Shot {
  title: string          // 镜头标题，如"开场介绍"
  content: string        // 旁白文案
  subtitle: string       // 字幕文本
  imagePrompt: string    // 图片提示词（用于生图）
  imageUrl: string | null  // 图片 URL
  ratio: "16:9" | "9:16" | "1:1"
}
```

### 步骤 3：检查图片

对每个镜头：
- ✅ 图好 → 留着
- 🔄 重试 → 调硅基流动图片 API 重新生图
- 🔄 自动兜底 → 重试 2 次后自动搜 Pexels
- 📤 上传 → 用户自己传图

### 步骤 4：一键出片

确认所有镜头后，后台执行：
1. 生图（硅基流动）→ 2. 配音（硅基流动 TTS）→ 3. 合成（FFmpeg）→ 4. 输出 MP4

---

## 五、现有项目可复用代码

### 前端（大部分可复用）

| 代码 | 路径 | 说明 |
|------|------|------|
| 营销页面 | `src/app/(marketing)/*` | 首页、定价、博客等 |
| 工具页 | `src/app/(marketing)/tools/[slug]/page.tsx` | 8 个工具页模板 |
| 三模式工作台 | `src/app/app/quick/page.tsx` | 核心入口，需要简化 |
| 用户系统 | `src/app/app/settings/` | 设置页 |
| 定价/支付 | `src/app/app/billing/` | 支付页 |
| 分镜组件 | `src/components/app/wizard/WizardPage.tsx` | 分镜编辑器（已有） |
| 公共组件 | `src/components/app/*` | 表单、UI 组件 |

### 后端（需要裁剪）

| 代码 | 路径 | 保留？ |
|------|------|--------|
| auth | `api/src/routes/auth.js` | ✅ 保留 |
| payment | `api/src/routes/billing.js` | ✅ 保留 |
| 用户管理 | `api/src/routes/profile.js` | ✅ 保留 |
| S1-S9 pipeline | `api/src/pipeline/` | ❌ 删除 |
| 任务管理 | `api/src/routes/tasks.js` | ❌ 删除或简化 |
| 项目 | `api/src/routes/projects.js` | ❌ 删除 |
| wingray provider | `api/src/providers/` | ❌ 删除，换硅基流动 |

---

## 六、分阶段计划

### Phase 1 — 清理+硅基流动（3-5 天）

| 任务 | 说明 |
|------|------|
| 去掉 pipeline 后端 | 删除 `api/src/pipeline/` 和相关路由 |
| 接入硅基流动 | 配置 API key + 测试模型 |
| 简化前端 | 去掉任务页，分镜→出片直连 |

### Phase 2 — 核心功能（5-7 天）

| 任务 | 说明 |
|------|------|
| 分镜可编辑 | 每个镜头可重试/替换/上传 |
| 一键出片 | 生图+配音+FFmpeg 合成 |
| 结果展示 | 直接出视频，不需要任务页 |

### Phase 3 — 部署上线（2-3 天）

| 任务 | 说明 |
|------|------|
| 配 Vercel | 导入项目，配置环境变量 |
| 配域名 | 绑定域名 |
| 测试全流程 | 8 个工具 + 核心出片 |

---

## 七、需要你确认的

| 问题 | 选项 |
|------|------|
| **硅基流动 API key** | 你有吗？给我配到环境变量 |
| **LLM 模型** | DeepSeek-V3 还是 Qwen2.5-72B？ |
| **图片模型** | FLUX.1-schnell（快）还是 FLUX.1-dev（好）？ |
| **TTS 模型** | CosyVoice 还是 FishSpeech？ |
| **视频合成** | FFmpeg 拼接（够用）还是需要 AI 视频模型？ |
| **部署方式** | Vercel 还是保留现有 Docker？ |