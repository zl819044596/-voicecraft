# AI Video Studio — Stage 1 Task: BYOK 配置中心（R1 红线强制）

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 当前状态：Stage 0 骨架已完成（web/api/render/nginx + postgres/redis/minio 7 服务全 healthy，docker compose up 已拉起）
> 本阶段只做一件事：**BYOK 配置中心**（开发规格 development-spec-v1.md 的 A 部分）。合规三页/SEO 是后续阶段，不要做。

## 必须遵守
1. 全程不要 `docker compose down`、不要停止已在运行的容器。改完代码后 `docker compose up -d --build` 重建，测试，**测试完保持容器运行**。
2. R1 红线（违反 = 返工）：Key 仅 POST 到后端 API；前端不得持久化（无 localStorage/sessionStorage/cookie/URL 参数）；不得落日志；后端 PostgreSQL 加密列存储（AES-256-GCM，密钥从环境变量注入，**不得硬编码**）；前端任何位置不得回显明文 Key，只显示脱敏（如 `sk-...last4`）。
3. 现有 api 是 `api/src/index.js`（Express，已有 /health/full）。在现有基础上扩展，不要重写。
4. 写代码前先读：`ai-video-studio-prd-v3.md` §4.4 BYOK 双算力、§13.2 数据实体表（api_keys 表结构）、`development-spec-v1.md` A 部分、`docker-compose.yml`、`api/src/index.js`、`src/app/page.tsx`（了解现有样式基调）。

## 任务清单

### 1. 数据库：api_keys 表
- 在 postgres 初始化中加 `api_keys` 表（用 init SQL 或启动时自动建表，二选一，选项目最合适的方式）：
  - `id UUID PK`、`user_id TEXT NOT NULL`（当前阶段无鉴权，用默认用户 `dev`；字段为后续 OAuth 预留）、`provider TEXT NOT NULL`（llm/image/tts/i2v 四类）、`provider_name TEXT`（openai/claude/fal/flux/elevenlabs 等具体服务商）、`key_ciphertext TEXT NOT NULL`、`key_salt TEXT NOT NULL`、`base_url TEXT`（OpenAI 兼容端点自定义地址，可空）、`created_at TIMESTAMPTZ`、`last_used TIMESTAMPTZ`
  - UNIQUE(user_id, provider, provider_name)
- 后端加密：AES-256-GCM，每个 key 独立随机 salt/IV；加密密钥读环境变量 `ENC_KEY`（compose 里注入 32 字节 base64 或 64 hex；.env.example 加注释示例值，docker-compose.yml 引用 ${ENC_KEY}）

### 2. API 端（api/src/ 内新增 routes，或按现有 index.js 风格扩展）
- `POST /api/keys` — body: `{provider, provider_name, key, base_url?}`；校验 provider 合法（llm/image/tts/i2v）；后端加密后 upsert 进 api_keys；**不回读明文**，返回 `{ok:true}` 或 400（非法 provider / key 为空）
- `GET /api/keys` — 返回各 key 的脱敏状态：`[{provider, provider_name, masked:"sk-...abc1", has_key:true, base_url, created_at}]`；无 key 的 provider 返回 has_key:false；**任何情况下不得返回明文**
- `DELETE /api/keys/:providerName` — 删除指定 key（按 user_id + provider_name），返回 204
- 加密/解密模块独立文件（如 `api/src/crypto.js`）：encrypt(plaintext) → {ciphertext, salt}；decrypt(ciphertext, salt) → plaintext（供后续流水线调用第三方 API 时用）
- 明文 key 严禁出现在任何日志/错误响应里（错误响应只给通用消息）

### 3. 前端 /settings 页（src/app/settings/page.tsx，Server Component 不行就 Client Component + fetch）
- 按现有深色/zinc 风格做 BYOK 配置中心 UI：
  - 四类卡片：LLM（OpenAI/Claude）、生图（fal.ai/Flux）、TTS（ElevenLabs/OpenAI）、图生视频 i2v（fal.ai）
  - 每卡片：当前状态（未配置 / 已配置 `sk-...last4`）、输入框（key + 可选自定义 base_url，OpenAI 兼容端点）、保存按钮、删除按钮
  - 保存后页面只显示脱敏状态，不显示明文
- 支持"自加第三方模型"：LLM/TTS 卡片提供 base_url 输入框（OpenAI 兼容端点），保存时一起提交
- 前端 fetch 到 `/api/keys`（走 nginx 反代），不持久化 key

### 4. nginx 路由
- 确认 nginx 已把 `/api/` 转发到 api 容器（Stage 0 已有 /api/health/full 通，检查配置是否需要加 /api/keys 的 location，通常 /api/ 前缀已覆盖）

### 5. 验证（必须真实执行并贴证据）
1. `docker compose up -d --build`（只重建改动的 api/web/nginx 镜像，基础服务不动）
2. `curl -s localhost/api/health/full` → 全绿
3. `curl -s -X POST localhost/api/keys -H 'Content-Type: application/json' -d '{"provider":"llm","provider_name":"openai","key":"sk-test1234567890abcdef"}'` → 200/ok
4. `curl -s localhost/api/keys` → 返回 masked 值（如 `sk-...cdef`），**确认不含明文 sk-test1234567890abcdef**
5. 进 postgres 容器查库：`docker compose exec postgres psql -U avs -d avs -c "SELECT provider_name, key_ciphertext, key_salt FROM api_keys;"` → 确认存的是密文
6. `curl -s -X DELETE localhost/api/keys/openai` → 204；再 GET 确认该 key 状态变回未配置
7. `curl -s localhost/settings` → 页面 200，含四类卡片
8. 检查 nginx 日志/api 日志里无明文 key（grep 一下）

## 输出格式
完成后输出：
- 改动文件清单（绝对路径）
- 验证结果（上面 8 步的 curl 输出，含脱敏效果和密文示例）
- api_keys 表结构
- 遗留事项（如有）
