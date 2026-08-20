# AI Video Studio — Task 4: i2v 图生视频（S7 动态合成）

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 当前状态：Stage 0-5b + Task 3 假登录完成（7 服务 healthy，wingray 真 provider 已通）。
> 本阶段只做：**i2v 图生视频**（用户指示 2026-08-08：i2v 要实现）。S7 合成从 static（图片+配音拼接）升级支持 **i2v**（每镜图片生成动态视频片段再合成）。

## 前置事实（2026-08-08 已实测，不用再验证 API 通不通）
- wingray key 项目 **I2V 模型已部署：`Kling-V1-6-I2V`**（创建任务成功，status running）；**T2V 未部署**（400 EASYLLM_VIDEOGENERATOR_CREATE_ERROR）——正好符合产品 NOT-DO（不做纯文生视频）
- 创建: `POST https://maas.wing-ray.cn/api/open-apis/projects/easyllms/videogenerator/generate`
  body: `{"model":"Kling-V1-6-I2V","content":[{"type":"image_url","image_url":{"url":"<公网可访问图片URL 或 data:image/jpeg;base64,...>"}},{"type":"text","text":"<动态描述>"}],"parameters":{"resolution":"720P","duration":5}}`
  返回: `{"status":0,"result":{"task_id":"..."}}`
- 轮询: `GET .../videogenerator/generate/{task_id}` → status running/succeeded/failed；**成功时 video_url 字段的确切位置需要你实测确认**（可能 result.content.video_url 或 result.video_url），先打印完整响应再解析
- ⚠️ **图片必须公网可访问或 base64**：MinIO 是内网（minio:9000 容器内），宿主机/公网都访问不到 → **用 base64 data URL**（image_url.url = `data:image/png;base64,{BASE64}`）最稳；PNG base64 会很大（1-2MB→1.3-2.7MB base64），确认请求体大小可接受（wingray 无文档限制，先试 base64；若失败再想 MinIO 公网暴露方案）
- 超时参考：Kling 5s 720P 生成 **3-8 分钟**（实测 140s+ 仍 running）；轮询间隔 20s，上限 ~30 次（10 分钟）；上游轮询超时给 30s/次

## 必须遵守（老规矩）
1. **不要 `docker compose down`**。完成后 `docker compose up -d --build` 重建（api/web/render 相关），验证。
2. **不留孤儿容器**：`docker compose ps` 必须恰好 7 个服务，`ai-video-studio-` 前缀。
3. **R1 红线**：key 只在后端解密进程内；错误消息通用无 key；base64 图在内存传递，不落日志。
4. 访问 https://localhost + `--noproxy '*'`。api 容器 DNS 已配。
5. 写前先读：`api/src/providers/wingray.js`（现有 wingray 调用风格）、`api/src/steps/s4.js`（生图存 MinIO 的 key 路径）、`api/src/steps/s7.js`（现有 ffmpeg 合成逻辑）、`render/` 容器（ffmpeg 能力）、`api/src/routes/tasks.js`（config.synthesis 校验 'static'）。

## 任务清单

### 1. wingray i2v 调用封装（api/src/providers/wingray.js 扩展）
- `wingrayI2V({ key, imageBuffer, text, opts })`：base64 编码 imageBuffer → POST 创建任务 → 轮询至 succeeded → 下载视频 buffer 返回
- 轮询上限 ~30 次×20s（10 分钟），超时抛友好错误；FAILED/超时给通用错误（不含 key/URL）
- 响应结构先实测打印，video_url 字段位置确认后硬编码解析 + 容错（找不到字段抛友好错误）

### 2. S7 合成支持 i2v 模式
- task.config.synthesis 目前 'static'；新增 **'i2v'** 值（tasks.js 校验更新：static|i2v）
- S4 生图（shots/shot-XX.png）不变；**i2v 模式**下 S7：
  a. 逐镜读 MinIO shot 图 → 调 wingrayI2V（text 用该镜配音文本或 S3 的 motion 描述，设计好 prompt：**用 S3 分镜里的 motion/动态描述**，若没有则用配音文本）→ 每镜得到 clip-XX.mp4 存 MinIO clips/
  b. ffmpeg 拼接所有 clip（concat demuxer）→ 与 S5 配音（audio/vo-XX.mp3）逐镜对齐合成最终 final.mp4（参考现有 static 合成的音频合成逻辑）
- static 模式完全保留（回归不破坏）
- 失败处理：i2v 单镜失败 → 该镜降级用静态图片段（fallback），整体继续，步骤标记成功但记录 warning（不整条 failed——产品要可用性）；全部失败才 failed
- render 容器 ffmpeg 已支持 concat（确认，不行就轮询重试/逐段拼接）

### 3. 前端（工作台配置）
- /app 工作台创建任务处：synthesis 选择支持 static | i2v（英文 UI：Static / AI Motion (i2v)），i2v 标注 "uses your image key" 或 "motion generation"
- 展示每个 clip 的生成状态（可复用现有 step 状态展示）

## 验证（必须真实执行并贴证据）
1. `docker compose up -d --build` → 全 healthy
2. **真实 i2v 端到端**（用已配置的 wingray key，MOCK_PROVIDERS 不影响 wingray 命中）：建项目 → synthesis=i2v → 跑 S1-S9 → **S7 产出 final.mp4 是真实动态视频**（ffprobe 确认 h264 时长>5s + 抽帧确认非静态图）→ export.zip 含 clips
3. static 回归：synthesis=static 跑一个 → 全 done（没弄坏）
4. 日志无 key/base64 泄露：`docker compose logs api | grep -iE "sk-|Bearer [a-z0-9]|data:image"` 仅允许 wingray 请求体相关（base64 在内存，不落日志）
5. `docker compose ps` 恰 7 服务无孤儿
6. 失败降级验证（可选）：单镜 i2v 失败 → 该镜 static fallback，任务仍 done

## 输出格式
- 改动/新增文件清单（绝对路径）
- i2v 调用实现说明（端点、模型、base64、轮询、超时、video_url 字段实测位置）
- S7 合成流程说明（i2v 分支）
- 验证 1-6 证据（含 final.mp4 ffprobe + 抽帧证据）
- 遗留事项
