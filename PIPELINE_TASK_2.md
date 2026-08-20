# AI Video Studio — Stage 5b Task: 接入 wingray 真实 Provider（流水线真跑）

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 当前状态：Stage 0-4 + Stage 5a 完成（数据模型/状态机/工作台/mock 执行器全流程跑通）。7 服务 healthy。
> 本阶段只做：**把 S1-S9 的 mock 执行器接入 wingray 真实 provider**（LLM/生图/TTS 都走 wingray）。

## 必须遵守（踩过的坑）
1. **不要 `docker compose down`**。完成后 `docker compose up -d --build` 重建（api/web/render 镜像），其他不动。
2. **不留孤儿容器**：完成后 `docker compose ps` 必须恰好 7 个服务，名字 `ai-video-studio-` 前缀。多余 `docker rm -f`。
3. **R1 红线**：wingray key 存 PostgreSQL api_keys 表（加密，走现有 crypto.js），调用时后端解密；**前端/日志/URL 永不出现明文 key**；错误响应只给通用消息。
4. 访问用 `https://localhost` + curl 加 `--noproxy '*'`（本机代理会 TLS 失败，wingray 也须 --noproxy）。本阶段不改 nginx。
5. 写前先读：`api/src/crypto.js`、`api/src/routes/keys.js`（key 读写）、现有 runner（S1-S9 执行器，mock 实现）、`docker-compose.yml`（MOCK_PROVIDERS 在哪）。

## wingray 已实测可用（2026-08-08，本项目 key）
base 站点 `https://maas.wing-ray.cn`，**一个 key 覆盖三类**（Authorization: `Bearer <key>`）：
- **LLM（S2 文案 / S3 分镜）**：`POST /api/open-apis/v1/chat/completions`（OpenAI 兼容），model=`DeepSeek-V4-Flash-0731`，body 标准 messages/max_tokens/temperature
- **生图（S4 逐镜生图）**：异步任务 `POST /api/open-apis/projects/easyllms/imagegenerator/task`，body `{"model":"Z-Image-Turbo","input":{"prompt":"..."},"parameters":{"size":"1024*1024"}}`；创建返回 `output.taskId`，轮询 `GET .../imagegenerator/task/{taskId}` 到 `output.taskStatus=SUCCEEDED`，取 `output.results[0].url`（URL 24h 有效，**必须立即下载**存 MinIO）
  - ⚠️ Qwen-Image/Qwen-Image-Plus 本项目**未部署**（NO_AVAILABLE_DEPLOYMENT），**只用 Z-Image-Turbo**
- **TTS（S5 配音）**：`POST /api/open-apis/projects/easyllms/voice/synthesize-audio`，body `{"text":["<要合成的文本>"],"synthesis_param":{"model":"cosyvoice-v2","voice":"longjiqi","format":"MP3_16000HZ_MONO_128KBPS","volume":50,"speechRate":1,"pitchRate":1}}`（**text 必须是数组**，voice 用预置音色 longjiqi/longanyun/longgaoseng 等）；非流式响应直接是音频二进制，存 MinIO audio/vo-XX.mp3

## 任务清单

### 1. 新增 wingray provider 调用模块（api/src/providers/ 新建 wingray.js 或并入现有）
按上述三个端点实现 LLM / 生图 / TTS 三个函数，key 从 api_keys 表读（decrypt，provider_name 识别 wingray 类型），**key 只在进程内**：
- `wingrayChat(messages, opts)` → 返回文本（S2/S3）
- `wingrayImage(prompt)` → 轮询到 SUCCEEDED，下载图片 buffer（存 MinIO shots/）
- `wingrayTTS(text)` → 返回音频 buffer（存 MinIO audio/）
- 所有调用 `AbortSignal.timeout`（LLM 60s、生图创建 30s + 轮询每 4s、TTS 90s——cosyvoice 慢），失败抛友好错误（不含 key）

### 2. 接入 runner（S2/S3 → wingrayChat；S4 → wingrayImage；S5 → wingrayTTS）
- 替换现有 mock 逻辑：MOCK_PROVIDERS=true 时仍走 mock（保留 dev 能力），false/未设时走 wingray
- **provider 选择**：api_keys 里 provider_name=wingray 的 key 同时充当 llm/image/tts（一个 key 三类）。若没配 wingray key，步骤 failed，error="请先在 Settings 配置 wingray API Key"
- S2 文案 prompt：把用户 prompt 转分镜用视频脚本（保持输入语言）；S3 分镜 prompt：转 JSON 分镜数组（shot：编号/画面描述/时长/配音文本），要求结构化 JSON（可用 response_format json_object 或提示词约束 + 解析容错）
- S4：每镜用 S3 画面描述调 wingrayImage，下载 PNG/JPEG 存 MinIO shots/shot-XX.png
- S5：每镜配音文本调 wingrayTTS，存 audio/vo-XX.mp3
- 合成（S7）用现有 ffmpeg（不改）；字幕（S6）现有本地生成；导出（S8）现有；S1/S9 现有

### 3. MOCK 开关
- MOCK_PROVIDERS=true → mock（dev）；false/未设 → wingray。确认 compose/.env 默认值：**本地 dev 默认可设 true 保演示可用，但你要能一键切到 false 走真实**。提供 .env 说明注释。

## 验证（必须真实执行并贴证据）
1. `docker compose up -d --build` → 全 healthy
2. **mock 回归**：MOCK_PROVIDERS=true 跑一个项目 → S1-S9 全 done（没弄坏 mock）
3. **无 key 场景**：MOCK_PROVIDERS=false 且 api_keys 无 wingray key，跑项目 → 相关步骤 failed + 友好提示，**日志/响应无明文 key**
4. `docker compose logs api | grep -iE "sk-|Bearer [a-z0-9]"` 无明文 key
5. `docker compose ps` 恰 7 服务无孤儿
6. 输出各 provider 调用函数清单 + 端点/模型/超时说明

## 输出格式
- 改动/新增文件清单（绝对路径）
- wingray 调用实现说明（端点、model、超时、轮询）
- 验证 1-5 证据
- 遗留事项（真实 key 端到端测试由调度方完成，列出需要真实 key 验证的点）
