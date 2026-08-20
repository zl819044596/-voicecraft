# AI Video Studio — D5 Task Phase 1: 9 步流水线后端全链路（核心业务）

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 当前状态：D1 全栈骨架（7 服务 healthy）、D2 BYOK 配置中心（api_keys 表 + /api/keys + /settings）、D3 合规三页、D4 SEO 矩阵 均已完成，docker compose up 已拉起。
> 本阶段只做一件事：**9 步流水线后端全链路**（S1 选题→S2 文案→S3 分镜→S4 逐镜生图→S5 配音→S6 字幕→S7 合成 static→S8 开放导出 zip→S9 复检）。前端 app 页面（/projects、/projects/[id]、/quick-create、/dashboard）是 Phase 2，**本阶段不做前端**。

## 必须遵守

1. 全程不要 `docker compose down`、不要停止已在运行的容器。改完代码后必须 `docker compose up -d --build`（**必须 --build**，否则跑旧镜像）重建，测试，**测试完保持容器运行**。
2. R1 红线（违反 = 返工）：BYOK Key 仅后端解密使用，**严禁**出现在日志/错误响应/URL/前端；解密只在 api 容器内内存中进行（api/src/crypto.js 已有 decrypt()）。
3. 现有文件（api/src/index.js、api/src/routes/keys.js、api/src/routes/report-abuse.js、api/src/crypto.js、render/worker/index.js）**在现有基础上扩展，不要重写删除已有功能**。index.js 的 ensureSchema 可继续加新表。
4. 写代码前先读：`ai-video-studio-prd-v3.md` §4.2（9 步流水线表）、§4.3（导出 zip 结构硬约定）、§10（Route Contract）、§13.1（实体表）、§13.2（数据流约束）、`development-spec-v1.md` E 部分（i2v 后置、Creem 后置）、`docker-compose.yml`、`api/src/index.js`、`api/src/routes/keys.js`、`render/worker/index.js`。
5. **NOT-DO**：i2v 图生视频（S7 只做 static，config 里 `synthesis: "static"` 字段预留即可，不实现 i2v 逻辑）；Creem 支付；Google OAuth（用户仍用 DEFAULT_USER='dev'，与 keys.js 一致）；声音克隆；纯文生视频。
6. 用户字段：沿用 keys.js 的 `DEFAULT_USER = 'dev'`（无鉴权阶段），所有 project/task/asset 行 user_id='dev'。

## 架构设计（按此实现，不要另起炉灶）

### Redis 键（任务编排，PRD §13.2 数据流约束）
- `avs:steps` — list，step 任务队列。api 主循环 BLPOP，逐个执行 S1-S9。
- `avs:render` — list，渲染任务队列（api → render 容器）。job JSON: `{type: 'srt'|'compose', taskId, ...}`。
- `avs:render:done` — list，渲染结果队列（render → api）。result JSON: `{taskId, ok, error?, ...}`。
- 用 redis-cli 可直接观察队列内容（验证步骤要用）。

### PostgreSQL 表（在 index.js ensureSchema 里加，全部 IF NOT EXISTS，幂等）
```sql
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'text',   -- text/url/topic
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',       -- queued|running|done|failed|cancelled
  current_step INTEGER NOT NULL DEFAULT 1,     -- 1..9
  progress REAL NOT NULL DEFAULT 0,            -- 0..1
  config JSONB NOT NULL DEFAULT '{}',          -- {synthesis:'static', ...}
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS step_results (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,                       -- 1..9
  status TEXT NOT NULL DEFAULT 'queued',       -- queued|running|done|failed|skipped|cancelled
  payload JSONB,                               -- 每步产物元数据（MinIO key 等），无秘密
  error TEXT,
  retries INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE(task_id, step)
);
CREATE TABLE IF NOT EXISTS assets (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                          -- shot|audio|srt|mp4|json|zip
  minio_key TEXT NOT NULL,
  size BIGINT,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS exports (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  minio_key TEXT NOT NULL,
  zip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
（api_keys 表 D2 已建，不动。）

### MinIO 布局（bucket 名 `avs-assets`，api 启动时 ensureBucket）
```
tasks/<taskId>/shots/shot-01.png        # S4 每镜一张
tasks/<taskId>/audio/vo-01.mp3          # S5 每镜配音
tasks/<taskId>/subtitles.srt            # S6
tasks/<taskId>/final.mp4                # S7 成片
tasks/<taskId>/storyboard.json          # S3 分镜 JSON（导出用）
tasks/<taskId>/script.md                # S2 文案（导出用）
tasks/<taskId>/export/project-export-YYYYMMDD.zip   # S8 导出
```

### 步骤执行模型
- POST /api/tasks 创建任务 → status=queued → 入队 `avs:steps`（{taskId}）→ api 主循环 BLPOP 执行。
- 顺序执行：S1→S2→…→S9。每步开始时 step_result status=running（UPSERT），完成后 status=done + payload（产物元数据）+ finished_at，task.current_step 更新、progress=已完成步数/9。
- 任一步失败：step_result.status=failed + error，task.status=failed + error；**不自动继续后续步骤**。用户可 POST /api/tasks/:id/steps 单步重试/跳过（见 API 清单）。
- 单步重试：重置该 step 为 queued，task.status=running，从该步重新入队，执行完继续后续步骤。跳过：该步 step_result.status=skipped，直接入队下一步。
- S6/S7 特殊：api 执行到 S6/S7 时**不入队 avs:steps 自行处理**，而是 RPUSH `avs:render`（{type:'srt'|'compose', taskId}）→ 阻塞 BLPOP `avs:render:done` 等 render 容器结果（ioredis blpop 带 timeout 轮询，如 10s 超时循环）→ 收到 ok 后更新 step_result + 入队下一步。
- 幂等（U11）：S7 compose 前检查 MinIO 是否已有 tasks/<taskId>/final.mp4，存在则直接 done（不重复合成）。

## 任务清单

### 1. 依赖
- api/package.json 加 `archiver`（zip 打包用）。
- render/worker/package.json 加 `minio`（render 容器要读写 MinIO；ioredis 已有）。
- docker-compose.yml 的 api 服务 environment 加 `MOCK_PROVIDERS: ${MOCK_PROVIDERS:-true}`（Phase 1 验证用 mock，之后可切 false 走真实 BYOK）；render 服务 environment 加 MINIO_*（已有）即可，无需 MOCK。

### 2. API 服务：队列引擎（api/src/queue.js 新建）
- `enqueueStep(redis, taskId)` — RPUSH avs:steps {taskId}。
- `enqueueRender(redis, job)` — RPUSH avs:render job。
- `startStepLoop(app)` — 主循环：BLPOP avs:steps → 取 task → 按 current_step 分派到对应 step runner（模块 api/src/steps/s1.js … s9.js）→ 更新状态 → 失败/完成处理。循环永不退出（Promise 循环 + 错误捕获 + 小延迟）。
- `startRenderResultLoop(app)` — BLPOP avs:render:done → 更新对应 task 的 S6/S7 step_result → 入队下一步。

### 3. Provider 抽象（api/src/providers/，供 step runner 调用）
统一 `resolveProvider(pg, providerClass)`：查 api_keys 表 user_id='dev' AND provider=providerClass 的行；有行 → 解密 key（crypto.decrypt）→ 返回 {mode:'real', key, baseUrl, providerName}；无行且 MOCK_PROVIDERS=true → {mode:'mock'}；无行且 MOCK_PROVIDERS=false → throw 清晰错误（提示去 /settings 配置 key）。

- `llm.js` — `chatCompletion({provider, model, messages, json})`：
  - real：OpenAI 兼容 POST `{baseUrl||https://api.openai.com/v1}/chat/completions`，Authorization: Bearer key；json=true 时 response_format={type:'json_object'} 并解析 JSON（失败重试 1 次）。
  - mock：按调用点（S1/S2/S3/S9 的 system prompt 特征）返回对应 canned JSON/文本（见步骤清单，内容自拟，含中文示例文案）。
  - model 默认 'gpt-4o-mini'（可被 task.config.model_override 覆盖）。
- `image.js` — `generateImage({provider, prompt, size})`：
  - real：fal.ai（POST https://queue.fal.run/fal-ai/flux/dev，Authorization: Key <key>，body {prompt, image_size:{width,height}}，轮询 GET {requestId}/status 到 COMPLETED 取 images[0].url，再下载图片 buffer）。超时/错误 → 清晰 error。
  - mock：从 `api/src/providers/mock-assets/` 里按 shot index 轮换返回 PNG buffer（4 张已生成，不要删）。
  - size 参数：16:9→1280x720、9:16→720x1280、1:1→1024x1024（mock 忽略，恒用 1280x720 占位图）。
- `tts.js` — `synthesize({provider, voice, text})`：
  - real：providerName==='elevenlabs' → POST https://api.elevenlabs.io/v1/text-to-speech/{voice||pNInz6obpgDQGcFmaJgB}，xi-api-key: key；providerName==='openai' → POST https://api.openai.com/v1/audio/speech（model tts-1, voice alloy）。返回音频 buffer。
  - mock：**用纯 Node 生成 WAV**（不依赖 ffmpeg）：采样率 22050 单声道 16bit，时长 = clamp(0.8s + 文本字数*0.12s, 1s, 6s)，内容为正弦波（440Hz），写 WAV 头 + PCM。保证每段可被 ffprobe 探测出时长（S6 要用）。

### 4. Step runners（api/src/steps/s1.js … s9.js，每个导出 `async function run({pg, redis, minio, task})`）
- **S1 选题/内容解析**（llm）：输入 task.config 的 source_text（粘贴文案/主题）→ LLM 输出规范化选题卡片 JSON {topic, key_points[], target_duration, audience} → 存 step_result.payload。mock：返回自拟示例卡片（topic 取 source_text 前 30 字）。
- **S2 文案生成**（llm）：输入 S1 卡片 → 输出文案（分段落，中文，300-800 字）→ 存 payload {script}，同时写 MinIO `tasks/<id>/script.md`。
- **S3 分镜生成**（llm）：输入 S2 文案 → 输出**分镜 JSON**（镜头表数组，3-6 镜）：每镜 {index, duration(秒), scene(画面描述), script(该镜文案句), voiceover(配音句), prompt(生图提示词，英文)} → 写 MinIO `tasks/<id>/storyboard.json` + payload {shots: N, total_duration}。
- **S4 逐镜生图**（image）：读 storyboard.json（从 MinIO 拉），逐镜调用 image.generateImage({prompt: shot.prompt, size: task.config.aspect||'16:9'}) → 每镜上传 MinIO `tasks/<id>/shots/shot-0N.png` → assets 表插行(type='shot') → payload {generated: N}。
- **S5 配音 TTS**（tts）：读 storyboard.json，逐镜调用 tts.synthesize({text: shot.voiceover}) → 每镜上传 MinIO `tasks/<id>/audio/vo-0N.mp3`（mock 是 .wav，扩展名按实际 buffer 类型）→ assets 插行(type='audio') → payload {generated: N}。
- **S6 字幕 SRT**（转 render 容器）：api 把 S5 产物清单写进 avs:render job {type:'srt', taskId} → render 容器用 ffprobe 逐段探测音频时长 → 生成 SRT（每镜一条字幕：序号/时间轴/该镜 voiceover 文本，时间轴按音频时长累加）→ 上传 MinIO `tasks/<id>/subtitles.srt` → 回 avs:render:done {ok, srtKey, segments:[{index,duration}]} → api 更新 assets(type='srt') + payload {segments}。
- **S7 合成 static**（转 render 容器）：job {type:'compose', taskId} → render 容器 ffmpeg 合成（见 §5）→ 上传 MinIO `tasks/<id>/final.mp4` → 回 avs:render:done {ok, mp4Key, size, duration} → api 更新 assets(type='mp4')。幂等：MinIO 已有 final.mp4 则 render 直接回 ok。
- **S8 开放导出 zip**（api 内，用 archiver）：读 MinIO 拉 final.mp4、storyboard.json、script.md、subtitles.srt、assets/shots/*、assets/audio/* → 用 archiver 打包为 PRD §4.3 硬约定结构（见下）→ 上传 MinIO `tasks/<id>/export/project-export-YYYYMMDD.zip` → exports 表插行 + payload {zipKey, zipHash}。
  ```
  project-export-YYYYMMDD.zip
  ├── final.mp4
  ├── storyboard.json
  ├── assets/shots/shot-01.png …
  ├── assets/audio/vo-01.mp3 …
  ├── assets/subtitles.srt
  ├── script.md
  └── LICENSE.txt   # 内容：用户内容所有权声明（中文+英文各一段：用户保留其内容与素材所有权；平台仅提供服务）
  ```
- **S9 复检/迭代**（llm）：输入 S2 文案 + S3 分镜 JSON + S8 zipHash → LLM 输出 {passed: boolean, feedback: string} → payload {review}。mock：passed:true + 简短好评。**不做自动返工循环**（feedback 供前端展示，用户手动改参重跑）。

### 5. Render 容器 worker（render/worker/index.js 扩展，现有 /health 保留）
- 依赖加 minio。启动时连接 Redis + MinIO（env 已有）。
- 主循环：BLPOP avs:render → 按 job.type 分派：
  - **srt**：从 MinIO 拉 tasks/<id>/audio/*（用 ffprobe 探测每段 duration）→ 生成 SRT 文本（时间轴=音频时长累加，格式 `HH:MM:SS,mmm --> HH:MM:SS,mmm`，文本=该镜 voiceover）→ 上传 subtitles.srt → RPUSH avs:render:done。
  - **compose**：检查 final.mp4 已存在→直接回 ok（幂等）。否则：拉全部 shots/*.png + audio/* → 对每镜 `ffmpeg -y -loop 1 -i shot.png -i vo.mp3 -c:v libx264 -preset veryfast -tune stillimage -t <该镜duration> -c:a aac -b:a 128k -shortest` 生成 seg 片段（图片循环 + 配音；duration 取 storyboard 的 duration；无音频段 fallback 纯图片时长）→ concat demuxer 合并 → 可选烧录字幕（有 subtitles.srt 时 `-vf subtitles=`）→ 上传 final.mp4 → RPUSH avs:render:done {ok, size, duration}。
- ffmpeg 路径用已有 env FFMPEG_BINARY/FFPROBE_BINARY。**在容器内 /tmp 工作**，做完清理。失败 → RPUSH avs:render:done {ok:false, error}。
- 关键坑：ffmpeg 子进程必须 timeout（如 300s）防挂死；concat list 文件写法；-shortest 与 -t 配合避免音画时长不一致。

### 6. API 路由（api/src/routes/，新文件，index.js 里 mount，nginx /api/ 已反代）
- `POST /projects` — body {title, source_type?} → 201 {id, title}（user_id='dev'）。
- `GET /projects` → 200 [{id, title, source_type, created_at, task_count}]。
- `POST /tasks` — body {project_id, title?, source_text, config?{synthesis, aspect, model_override}} → 201 {id}，创建 task(queued) + 入队 S1。
- `GET /tasks?project_id=` → 200 [{id, status, current_step, progress, error, created_at}]。
- `GET /tasks/:id` → 200 {task, steps:[step_results 全量], assets:[type/minio_key], export?}。
- `POST /tasks/:id/steps` — body {step, action: 'retry'|'skip'} → 200 {ok}（单步控制，见步骤执行模型）。
- `POST /tasks/:id/cancel` — 200 {ok}，status=cancelled。
- `GET /export/:id` — task 已完成且 exports 有行 → 200 {url: <MinIO 预签名下载 URL>, zipKey}；未完成 → 409；无导出 → 404。预签名 1 小时。
- 所有路由错误响应：`{error: "human readable"}`，**不含任何 key 明文**。400/404/409 语义正确。

### 7. 验证（必须真实执行并贴证据 —— Phase 1 用 MOCK_PROVIDERS=true 全链路跑通）
1. `docker compose up -d --build`（重建 api/render，保持容器运行）→ `docker compose ps` 7 服务 healthy。
2. `curl -s localhost/api/health/full` → 全绿。
3. `curl -s -X POST localhost/api/projects -H 'Content-Type: application/json' -d '{"title":"测试项目"}'` → 201 带 id。
4. `curl -s -X POST localhost/api/tasks -H 'Content-Type: application/json' -d '{"project_id":"<上一步id>","source_text":"用AI工具提高视频制作效率","config":{"synthesis":"static","aspect":"16:9"}}'` → 201 带 task id。
5. 轮询 `curl -s localhost/api/tasks/<taskId>`（每 3s，最多 90s）→ 最终 status=done，steps 里 1-9 全部 done，progress=1.0。**贴最终 JSON**。
6. `docker compose exec -T redis redis-cli LLEN avs:steps` → 0（队列清空）；LLEN avs:render → 0；LLEN avs:render:done → 0。
7. `docker compose exec -T postgres psql -U avs -d ai_video_studio -c "SELECT step, status, retries FROM step_results WHERE task_id='<taskId>' ORDER BY step;"` → 9 行全 done。
8. `docker compose exec -T postgres psql -U avs -d ai_video_studio -c "SELECT type, minio_key FROM assets WHERE task_id='<taskId>';"` → shot/audio/srt/mp4/json/zip 各类对象都在。
9. MinIO 对象确认：`docker compose exec -T minio mc alias set local http://127.0.0.1:9000 minioadmin minioadmin 2>/dev/null; docker compose exec -T minio mc ls --recursive local/avs-assets/tasks/<taskId>/` → 列出 shots/audio/srt/final.mp4/storyboard.json/script.md/export zip。
10. 导出 zip 验证：`curl -s localhost/api/export/<taskId>` → 200 {url}；`curl -sL "<url>" -o /tmp/export.zip && unzip -l /tmp/export.zip` → 包含 final.mp4 + storyboard.json + assets/shots/* + assets/audio/* + assets/subtitles.srt + script.md + LICENSE.txt。**贴 unzip -l 输出**。
11. 成片可播放：`docker compose exec -T render ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,codec_name <(echo) 2>/dev/null; unzip -p /tmp/export.zip final.mp4 > /tmp/final.mp4 && docker compose exec -T render ffprobe -v error -show_entries format=duration -of csv /tmp/final.mp4 2>&1 || true`（容器外取文件后传回容器探测；或 `docker compose exec -T render ffprobe -v error -show_entries format=duration /tmp/final.mp4` 若可行）。→ duration>0，含 video+audio 流。
12. 单步重试：`curl -s -X POST localhost/api/tasks/<taskId>/steps -H 'Content-Type: application/json' -d '{"step":4,"action":"retry"}'` → 200；轮询到 done；S4 retries=1。
13. SRT 有效性：`unzip -p /tmp/export.zip assets/subtitles.srt | head -20` → 时间轴格式正确。
14. R1 抽查：`docker compose logs api 2>&1 | grep -iE "sk-|fal-key|eleven" | head -5` → 无输出（mock 模式本无真实 key，但确认日志无 key 字样）。

## 输出格式
完成后输出：
- 改动/新增文件清单（绝对路径）
- 上述 14 步验证证据（curl/psql/redis-cli/unzip/ffprobe 输出粘贴）
- 表结构变更说明
- 遗留事项（如有）
