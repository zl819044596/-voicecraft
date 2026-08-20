# PIPELINE_TASK_50：SiliconFlow 图片生成适配层

状态：待执行
日期：2026-08-19
执行方式：Claude Code 后台派工 + 听潮独立复核

## 背景

用户线上平台（storyboard-video.com）图片默认配置已换成 SiliconFlow：
- base_url = https://api.siliconflow.cn/v1，model = Tongyi-MAI/Z-Image-Turbo（凭据测试通过）
- 但代码只适配 wingray 异步任务生图（runtime.ts wingrayImage），SiliconFlow 是**同步生图 API**，
  端点/参数/尺寸格式完全不同 → 生图必报错

SiliconFlow 生图 API（已实测文档确认）：
- 端点：POST {base_url}/images/generations（base_url 已含 /v1）
- Body：{"model": "Tongyi-MAI/Z-Image-Turbo", "prompt": "...", "negative_prompt": "...",
         "image_size": "720x1280", "batch_size": 1, "seed": 123}
- 响应（同步，无需轮询）：{"images": [{"url": "https://..."}]} → 直接下载 url 得图片字节
- 支持尺寸（文档确认）：1024x1024、720x1280（9:16 竖版！）、768x1024（3:4）、1280x720（16:9）、
  1024x768（4:3）等

## 需求

### 1. runtime.ts 新增 siliconflowImage(opts)（仿 wingrayImage 签名）

- 尺寸映射（aspect → SiliconFlow image_size，注意是 x 不是 *）：
  - '1:1' → '1024x1024'
  - '16:9' → '1280x720'
  - '9:16' → '720x1280'（真竖版，不再裁剪）
  - '4:3' → '1024x768'
  - '3:4' → '768x1024'
  - '4:5' → '768x1024'（文档未确认 4:5，先映射到接近的 3:4）
  - 未知/直接尺寸（含 * 的旧格式）→ 转 x 格式；再失败回退 '1024x1024'
- POST {base_url}/images/generations，headers 用现有 authHeaders(opts.key)
- 同步响应解析 images[0].url → fetch 下载 → Buffer（超时用现有 IMAGE_DOWNLOAD_TIMEOUT_MS）
- 错误处理：非 2xx → throw（含响应体前 200 字便于定位）；JSON 解析失败 → throw
- seed 透传：parameters.seed → body.seed（TASK_47 逻辑延续）
- negative_prompt 透传：opts.negativePrompt → body.negative_prompt（结构化）
- 日志：`[siliconflow] image create model=... size=... seed=...`（不打 key）

### 2. providers.ts callImage 分发

- 检测 `baseUrl.includes('siliconflow.cn')` → 调 siliconflowImage（否则 wingrayImage 不变）
- ImageCallOpts 无需新字段（size/seed/negativePrompt 已存在）

### 3. 不改动

- 不改 wingray 路径、不改 L3/L4 流水线、不改前端、不改 render
- 不动 prompts 表

## 验收（听潮独立复核）

1. npm run build（tsc）通过
2. 本地 colima 真实任务：model-config image 指向 SiliconFlow（本地新建 credential +
   model-config，用 SiliconFlow key——听潮提供测试 key 或用户平台 key），任务 L4 生图成功：
   - 9:16 任务：出 720x1280 竖版图（ffprobe/IHDR 验证尺寸，不再裁剪 576x1024）
   - seed 日志 `[siliconflow] image create seed=...` 存在
   - negative_prompt 生效（结构化传入）
3. wingray 路径回归：不改动不破坏（代码审查即可，wingray 402 无法真跑）

## 约束

- 只改 api/src/providers/runtime.ts 与 api/src/providers/providers.ts
- 不提交 git；DOCKER_CONTEXT=colima；HTTP 请求 timeout≤25s；NO_PROXY='*'
- 不用 kimi
- SiliconFlow key 不从平台库解密，验证时用听潮提供/用户提供的测试 key（或线上凭据复用）

## 输出报告（/tmp/task50_report.md）

改动 diff 摘要 + 验证证据（9:16 出图尺寸、seed 日志、错误处理路径）+ 阻塞点
