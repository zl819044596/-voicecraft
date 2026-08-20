# AI Video Studio — Task 6: 多模型配置中心（Multi-Model Config Hub）

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 当前状态：Stage 0-5b + Task 3 假登录 + Task 4 i2v + Task 5 B增强 全部完成并提交（7 服务 healthy，wingray 真 provider 已通）。
> 本阶段只做：**多模型配置中心**。目标是让 LLM/生图/配音/生视频 四类各自可配**多个模型**（数量不限），系统预置默认模型，用户可自配任意来源（代理/官网/自建 API），生成任务时每类下拉选一个已启用模型。参考破局 AI 带货系统的模型配置（每类多模型、可勾选启用）。

## 背景与现状
- 现架构：`api_keys` 表每类（llm/image/tts/i2v）一条，配 wingray 一个 key；`model_override` 白名单每类仅 1 个模型。
- wingray key 项目实测可用模型：LLM=DeepSeek-V4-Flash-0731、DeepSeek-V4-Pro；生图=Z-Image-Turbo；TTS=cosyvoice-v2（15 个预置音色，音色如 longjiqi）；i2v=Kling-V1-6-I2V、Wan2.2-I2V-Plus。
- 目标架构：每类 N 个「模型条目」，每个条目=独立 base_url + model + key + 启用 + 默认。兼容现有任务（无显式模型选择时用该类默认启用条目）。

## 任务清单

### 1. 数据模型：`model_configs` 表（新）
字段：`id uuid pk`、`user_id text not null default 'dev'`、`provider_class text not null`（'llm'|'image'|'tts'|'i2v'）、`name text not null`（显示名，如 "DeepSeek-V4-Pro"）、`base_url text`（API 地址，可空=wingray 默认）、`model text not null`（模型名）、`key_ciphertext text`（AES-GCM 加密，复用现有 key 加密模块）、`key_masked text`（脱敏如 TN-…9K7g）、`voice text`（仅 tts 类：音色 id，可空）、`enabled boolean default true`、`is_default boolean default false`、`created_at/updated_at`。
- 迁移：参考现有 migration 文件风格（api/src/db/migrations/ 或 schema.sql）加新表。
- 约束：每 (user_id, provider_class) 至多一个 is_default=true（先置 false 再置新 default）。

### 2. 系统预置（管理员配默认，seed）
- 启动/首次访问时（或独立 seed 脚本），若无任何 model_configs 且已存在 wingray api_key：自动生成预置条目（用 wingray key 加密副本，base_url=wingray 官方地址，参考 wingray.js 常量）：
  - llm: DeepSeek-V4-Flash-0731（is_default）、DeepSeek-V4-Pro
  - image: Z-Image-Turbo（is_default）
  - tts: cosyvoice-v2（is_default；voice 用现有默认音色 longjiqi）
  - i2v: Kling-V1-6-I2V（is_default）、Wan2.2-I2V-Plus
- 预置条目 user_id='dev'（与现有数据一致）；用户自配条目 user_id 同登录用户。
- 幂等：已有条目则跳过，不重复插入。

### 3. API 路由：`api/src/routes/model-configs.js`（新，挂到 index.js）
- `GET /api/model-configs?class=llm` → 该类全部条目（含 masked key，**不含 ciphertext 明文**）；`?class` 缺省返回全部分类分组。
- `GET /api/model-configs/presets` → 系统预置可用模型清单（静态返回 wingray 实测可用模型 + 说明，供前端「添加模型」引导）。
- `POST /api/model-configs` body：{provider_class, name, base_url?, model, key, voice?} → 校验 class 白名单（llm/image/tts/i2v）、key 非空；加密存储 + 生成 masked；默认 enabled=true；若该类无 default 则置 is_default=true。
- `PUT /api/model-configs/:id` body 任意子集：{name?, base_url?, model?, key?, voice?, enabled?, is_default?}；key 变更时重新加密；置 is_default=true 时同类的其他条目 is_default=false。
- `DELETE /api/model-configs/:id`（仅非默认可删？——不，允许删；若删的是 default，把该类第一个 enabled 条目设为 default）。
- 全部路由挂 authMiddleware（req.userId），userId 作用域查询。
- 旧 `api_keys` 表与 `routes/keys.js` 保留不动（兼容），但模型选择逻辑走新表。

### 4. 流水线适配（关键）
- **任务创建**（routes/tasks.js POST）：config 里现有 `model_override` 语义升级——改为 `config.models = {llm:{model_config_id|name}, image:{...}, tts:{...}, i2v:{...}}`，允许按 `name` 或 `model_config_id` 指定；**缺省**则后端按类取「该用户该类 is_default 的启用条目」（无则第一个 enabled）。model_override 旧字段仍接受（向后兼容，映射到 name）。
- **provider 调用**：各 step（s2 LLM、s4 生图、s5 TTS、s7 i2v）从任务 config.models 拿对应模型条目，用条目的 base_url + model + key 调用。wingray.js 现有函数需支持「传入 base_url/key/model 覆盖」：新增 `wingrayChat({baseUrl,key,model,...})` 等或给现有函数加可选参数（保持默认 wingray 常量兼容）。
- 兼容：老任务/新任务无 models 配置 → 走该类 default 条目（即 wingray 预置），行为不变。
- key 解析：条目 key_ciphertext 解密后使用，**不得落日志**；解密失败则报错并提示重配 key。

### 5. 前端（Next.js）
- **Settings 页**：新增「模型配置」区块（或独立页 `/settings/models`，入口在 Settings 侧栏）。四类 Tab（模型 LLM / 生图 / 配音 / 生视频），每类展示模型列表：名称、模型名、来源(base_url 域名)、Key 脱敏、启用开关、默认标记、「编辑」「删除」；顶部「+ 添加模型」按钮 → 表单（名称、类别、API 地址 base_url 可空、模型名、API Key、音色 voice 仅 tts 类显示）。预置条目可编辑/禁用但删除时提示（允许删）。
- **配音音色**：tts 条目行内显示 voice；添加/编辑 tts 条目时提供音色下拉（静态预置音色列表：longjiqi 等 15 个 cosyvoice 音色，来自 wingray.js 常量；也可手填）。
- **任务创建/工作台**：生成设置里每类一个下拉，列出该类已启用条目（默认选中 is_default），选后写入 config.models。
- **设置页 i2v/生图 卡**：更新为引用 model_configs（四类统一入口），移除旧的单模型表述。
- 风格与现有深色 UI 一致；文案英文（全站保持）。

### 6. 验证（必须实际执行并附证据）
1. `docker compose up -d --build` 全 healthy，恰 7 服务无孤儿。
2. seed：重启后 GET /api/model-configs?class=llm 返回预置 2 条（DeepSeek-V4-Flash-0731 default + Pro）；image/tts/i2v 各返回预置条目；key 全部 masked 无明文。
3. CRUD：POST 添加自定义模型（如 llm 类 "My-Proxy-LLM"，base_url=自填、model=xxx、key=test-key）→ 200 且 masked；PUT 改 enabled=false → 列表生效；PUT is_default=true → 该类 default 切换；DELETE → 删除成功。
4. 端到端：创建任务不指定 models → 用默认条目跑通 S1-S9 done（真实 wingray 或 mock 均可，但 LLM 步骤必须真实调用 wingray DeepSeek 验证默认条目被使用）；再创建任务指定 `config.models.llm={name:'DeepSeek-V4-Pro'}` → 任务 config 存的是 DeepSeek-V4-Pro 且 LLM 步骤正常。
5. tts 条目带 voice：任务配音用该 voice。
6. 老任务兼容：现有 done 任务详情页正常；POST 老格式 model_override → 仍接受。
7. 密钥安全：api/render/web 三容器日志 grep `sk-|Bearer [a-z0-9]{8,}` 0 命中；GET /api/model-configs 响应无 ciphertext 字段；前端无 localStorage 存 key。
8. 前端构建 `npm run build` 无错误。

## 输出格式
完成后输出：
- 改动清单（新文件/修改文件，各一句话）
- 验证证据（上面 8 项逐一对应：命令/响应摘要）
- 遗留事项（如有）

## 注意事项
- R1 红线：key 一律 AES-GCM 加密存储，任何接口/日志/前端不得出现明文；GET 列表只回 masked。
- 兼容优先：老任务、老 api_keys、老 model_override 全部保持可用；新能力是增量。
- 不引入新依赖（除非必要）；复用 api/src 现有加密、db、wingray 模块。
- 全站文案英文；UI 深色风格与现有一致。
- 不得执行 `docker compose down`；api 容器 DNS 223.5.5.5 不改。
