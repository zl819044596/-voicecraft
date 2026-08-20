# AI Video Studio — Task 7: 模型配置独立页（/models）

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 当前状态：Task 6 多模型配置中心已完成并提交（model_configs 表 + CRUD API + 流水线接入）。本阶段把**模型配置做成独立页面**，两栏结构，并新增**测试**功能。
> 参考：破局 AI 带货系统「系统设置」模型配置页——左栏分四大类列出模型，右栏是选中模型的详情/增删改查。用户需求："左边分语言、图片、配音、视频四大类，每个里面能单独配模型，右边是模型的增删改查、测试；**左栏有『增加模型』**"。

## 背景与现状
- Task 6 已建 `model_configs` 表 + `/api/model-configs` CRUD（GET/POST/PUT/DELETE）+ 预置 seed + 流水线按条目调用。**这些后端能力已就绪，本任务主要做前端独立页 + 测试端点**。
- 现前端：Settings 页里有模型配置 Tab（src/app/settings/page.tsx + src/app/settings/models/）。本任务将其抽成**独立页面** `/app/models`，两栏布局。

## 任务清单

### 1. 后端：测试端点（新增）
`POST /api/model-configs/test`（挂 authMiddleware，userId 作用域）
- body：`{id}` 或完整 `{provider_class, base_url, model, key, voice?}`（允许对未保存的配置先测试）
- 行为：按 provider_class 对该配置发**最小真实请求**验证连通性，**不落库、不暴露 key**；返回 `{ok: bool, message}`，message 说明成功或失败原因（HTTP 状态/错误码/超时）。
- 各类型最小请求（**复用 api/src/providers/wingray.js 与 providers/*.js 现有调用逻辑，保证与真实流水线一致**）：
  - llm：chat 最小请求（如 max_tokens=1），200 即 OK
  - image：创建生图任务，任务创建成功即 OK（不等待出图）
  - tts：合成极短音频（如 1-2 字符），成功返回即 OK
  - i2v：创建视频任务，任务创建成功即 OK
- **base_url 处理**：预置 wingray 条目 base_url 为 `https://maas.wing-ray.cn`（完整路径在 wingray.js 常量里拼）；自配条目 base_url 可能是 OpenAI 兼容 `https://xxx/v1` 或 wingray 风格。测试逻辑按「能否用 wingray 路径」+「通用 OpenAI 兼容 /chat/completions」两路尝试，给出清晰失败信息。**不要**因猜不到路径而把真实 key 打日志。
- 超时：单测 ≤20s；失败返回错误摘要（截断）。
- 密钥安全：测试用解密 key 发请求，**不得把 key 写入响应/日志**。

### 2. 前端：独立页面 `/app/models`（新建）
**受守卫保护**（/app 前缀已被 proxy 守卫），深色风格，英文文案，全站一致。
- **布局（两栏，类似参考图）**：
  - **左栏（约 240px）**：
    - 顶部**「+ Add model」按钮**（新增模型，点击后右栏进入新建表单）——这是用户明确要求，左栏必须有增加模型入口。
    - 四大类导航——`Language`（语言/LLM）、`Image`（图片）、`Voice`（配音/TTS）、`Video`（视频/i2v）。选中某类后，该类下显示**模型列表**（每个：名称 + 模型名 + 启用状态点 + 默认标记），点击某项→右侧显示详情。
  - **右栏（flex 1）**：当前选中模型/新建模型的**详情卡片**：
    - 展示+编辑字段：Name、Class（只读）、API URL(base_url，可空)、Model name、API Key（显示脱敏，可改/重填）、Voice（仅 tts 类，音色下拉+可手填）、Enabled 开关、Set as default。
    - 按钮：`Save`（PUT）、`Delete`（DELETE）、`Test connection`（POST /api/model-configs/test，展示结果：绿色 OK / 红色失败原因）。
    - 新建态（点左栏 + 或某类无模型时）：空表单 + `Create`（POST）+ `Test`。
- **数据**：调 GET /api/model-configs（无 class 返回按类分组）取全部，前端按四类分组渲染；用 app-data.ts / 现有 apiFetch 封装。
- **配音 voice**：tts 条目显示 voice；提供音色下拉（静态预置 15 个 cosyvoice 音色，来自 wingray.js/presets）+ 可手填。
- **路由/入口**：页面路由 `/app/models`；从 Settings 页移除旧的内嵌模型 Tab 或改为链接跳转到 /app/models；AppNav 或工作台加「Models」入口。
- 交互细节：删除需确认（对 is_default 提示将自动提升）；设默认即时生效；测试按钮 loading 态；失败消息展示。

### 3. 兼容
- 后端 model-configs API 完全复用 Task 6 的，不改动（除非测试端点需要）。
- 流水线行为不变（config.models 选择逻辑不动）。本任务纯前端页 + 测试端点。
- Settings 页旧模型 Tab 若移除，确保不破坏其他设置区块。

### 4. 验证（实际执行并附证据）
1. `docker compose up -d --build` 全 healthy 恰 7 服务无孤儿；`npm run build` 无错误。
2. 页面可达：带 avs_session cookie 访问 `/app/models` → 200；未登录 → 307 守卫。
3. 左栏四类显示，各类下列出预置模型（llm 2、image 1、tts 1、i2v 2）；左栏有「+ Add model」；点选模型 → 右栏显示脱敏 key（无明文）。
4. 测试端点：对预置 llm 条目（wingray DeepSeek）`POST /api/model-configs/test` → `{ok:true}`；对故意填错 key/model 的配置 → `{ok:false}` 带失败原因；tts/image/i2v 各测一个 → 成功或给出合理错误。
5. 增删改查走前端：新建自定义模型 → 列表出现；编辑保存 → 生效；设默认 → 该类默认切换；删除 → 移除。
6. 密钥安全：测试端点响应与日志无明文 key；GET /api/model-configs 仍只回 masked。
7. 老任务/流水线回归：跑一个默认任务 S1-S9 仍 done（确认前端改动不影响后端）。

## 输出格式
- 改动清单（新增/修改文件，一句话各）
- 验证证据（上面 7 项逐一）
- 遗留事项

## 注意事项
- R1：key 加密，任何响应/日志/前端无明文；测试端点也不得回显 key。
- 兼容优先：后端 model-configs、流水线、老任务全部不动/不破坏。
- 不引入新依赖；复用现有 ui/样式（深色、英文）。
- 不 `docker compose down`；api DNS 223.5.5.5 不改。
