# PIPELINE_TASK_40: i2v L5 重新设计 —— 逐镜队列 + 失败分级 + 参数化 + 进度可见

## 背景（2026-08-16 实测）

i2v 仍"有问题"：任务 53589a14（17 镜 i2v）L5 全部 17 镜 fallback，原因全是 `wingray i2v create http 402`。
**账号级错误被当成单镜失败逐镜吞掉 → 全部回退静态图 → 任务照常继续 → 用户拿到"静态图拼的视频"以为 i2v 坏了**。
除余额外还有 4 个结构性问题：

1. **失败处理是哑的**：402/401/403（账号级）不中断、不通知，逐镜白跑。
2. **参数写死**：runtime.ts `wingrayI2V` 里 `parameters: { resolution:'720P', duration:5 }` 硬编码；
   ArcReel L3 已产出 `shot.duration_sec` 时长档位（l3.ts:184 slotFor），但 L5 完全没用 → 声画时长不匹配源头仍在。
3. **进度不可见**：L5 整步一个 job，轮询 30×20s=10min/镜静默无日志；TASK_39 并发 worker 只解决多任务，单任务 L5 仍一个 worker 全程占住、前端像卡死。
4. **单镜失败只能整步重跑**：前端已有单镜 stale/重生成概念（TaskWizard.tsx staleShots），后端没有"只重跑这一镜"的入口。

## 设计（对齐平台思路：分镜优先、每步可改、模型配置中心、半自动/全自动）

### ① 失败分级 + 账号级快速失败

- providers.ts 新增错误分类：`classifyI2VError(err): 'account' | 'transient' | 'content'`
  - account：HTTP 401/402/403，或响应体含 balance/insufficient/余额 等关键字（402 实测出现于 create 阶段）
  - transient：AbortError/timeout/5xx/网络错误（可重试）
  - content：其余（模型拒绝、参数错等）
- `callI2V` 抛带 kind 的错误（`class I2VError extends Error { kind }`），上游调用方按 kind 分流。
- **account 级 → 立即中断 L5**：不再逐镜硬跑/fallback；标记任务 paused（config.paused=true + pause_resume_step=5 + config.error_summary），step_results step5 记错误摘要；前端任务详情醒目提示"余额不足，充值后点续跑"。
- **transient → 单镜重试 2 次**（退避 5s/15s），仍失败 → fallback 静态图 + warnings（保留现行为）。
- **content → 单镜 fallback**（保留现行为），warnings 记原因。

### ② L5 逐镜入队（waitingForShots 模式，仿 L7/L8 的 waitingForRender）

- `StepJob` 扩展 `shot?: number`（types.ts）。
- l5.ts `run()` 改为：
  1. 前置校验（storyboard、L4 图、provider 解析——provider 解析失败直接抛（账号/配置级，勿 fallback））；
  2. 逐镜 `state.enqueueStep(redis, { taskId, step:5, shot:index, priority })`（优先级按任务 track/tier，同 enqueueStepForTask 逻辑）；
  3. 返回 `{ waitingForShots: true }`。
- queues.ts `runStep`：`job.shot !== undefined` → 走 `runI2VShot(ctx, task, job)`（新函数，抽自 l5 现循环体：下载图 → callI2V → 上传 MinIO → insertAsset）；runner 返回 `waitingForShots` → return（不 finalize，finalize 由最后一镜完成侧做）。
- `runI2VShot` 单镜守卫与收尾：
  - Redis `SISMEMBER avs:i2v-done:<taskId> <index>` → 已做直接跳过（幂等）；
  - Redis `EXISTS avs:i2v-abort:<taskId>` → 丢弃（账号级中断后清队列剩余 job）；
  - 单镜 watchdog 15min（`Promise.race` 超时）；
  - 完成判定：`SCARD avs:i2v-done:<taskId> == 镜总数` → 聚合 shots/warnings → `finalizeStep(ctx, task, 5, {kind:'clips', shots, warnings})`。
- **自愈兼容**：requeueOrphanTasks 对 step5 running 任务 force 重入 L5 时，l5.run 需先查 assets 表已有 clip（或重建 Redis done set），**只补缺失镜**，避免整步重跑。
- **账号级中断**：runI2VShot 捕获 account 错误 → `SADD avs:i2v-abort:<taskId> <reason>` + 任务置 paused + error_summary（不 failTask，可续跑）；剩余排队 shot job 弹出时见 abort 标记即丢弃；L5 不 finalize（或 finalize 带 error 摘要，前端读 paused + error_summary 渲染）。

### ③ 参数进模型配置中心 + 分镜时长打通

- `api/db/schema.sql` model_configs 加 `settings jsonb NOT NULL DEFAULT '{}'`（幂等，migrate.js 重放自动应用；另写 `api/db/migrations/004_i2v_settings.sql` 说明文件，同 002/003 模式）。
- providers.ts `ProviderRef` 带 `settings`（解析自 model_configs.settings）；runtime.ts `wingrayI2V` 从 settings 读：
  - `duration`：默认 5，clamp 按模型支持范围（Wan2.7 5s；Kling 5/10；settings 里可配，但**必须取整且 clamp**）；
  - `resolution`：默认 '720P'（可选 '1080P'）；
  - 仍允许 `shot.duration_sec` 覆盖 settings（分镜时长优先）。
- l5 单镜：`storyboard.shots[k].duration_sec`（ArcReel 时长档位）→ i2v `parameters.duration`（clamp 到模型支持档位）。
- 前端 Models.tsx（components/models/）i2v 配置卡支持编辑 settings（duration/resolution），与现有 model_configs CRUD 一致。

### ④ 进度可见

- runI2VShot 每镜完成：`HSET avs:i2v-progress:<taskId> done <n> total <m> current_index <k>`（或整体 JSON），并 `console.log('[i2v] shot k/m done (task ...)')`。
- tasks.ts 任务详情聚合处读 Redis progress → 响应加 `i2v_progress: { done, total, current_index }`（Redis 无则 null）。
- 前端 TaskWizard L5 卡：有 i2v_progress 时显示"图生视频 done/total · 正在生成第 current_index 镜"（useTaskWizardReal 已有轮询，直接消费新字段）。

### ⑤ 单镜重生成 + 续跑失败镜 API

- `POST /api/tasks/:id/shots/:index/regenerate`：校验任务 mode=i2v 且 step5 已有结果（或 current_step>=5）；删除/覆盖该镜旧 asset；入队 `{taskId, step:5, shot:index, force:true}`（force 绕过 done set？——建议直接删 Redis done 成员 + 删旧 asset 再入队普通 job，保持幂等语义）；返回 202 + 任务详情。
- 续跑失败镜：`POST /api/tasks/:id/continue` 支持 `{ only_failed: true }`（或新增独立端点）：读 step5 payload warnings 中 status='fallback' 的 index 集合 → 只入队这些镜（先清 done set 对应成员）。
- 前端：L5 摘要显示 "clip 12/17 成功 · 5 镜回退静态图"，回退镜可一键"重新生成"（对接 regenerate）；账号级错误时显示"余额不足，充值后续跑"按钮（对接 only_failed 续跑）。

## 修改文件清单（预估）

- api/src/pipeline/types.ts（StepJob.shot、StepRunResult.waitingForShots）
- api/src/pipeline/queues.ts（runStep 分流 + runI2VShot + 常量 I2V_SHOT_TIMEOUT_MS）
- api/src/pipeline/steps/l5.ts（重写：前置校验 + 逐镜入队 + 补缺失镜）
- api/src/providers/providers.ts（classifyI2VError、I2VError、ProviderRef.settings）
- api/src/providers/runtime.ts（wingrayI2V 读 settings：duration/resolution）
- api/db/schema.sql + api/db/migrations/004_i2v_settings.sql（settings 列）
- api/src/routes/tasks.ts（详情加 i2v_progress；shots/:index/regenerate；continue only_failed）
- app/src/pages/TaskWizard.tsx + lib/task-wizard-real.ts（进度显示、失败提示、续跑按钮）
- app/src/components/models/*（i2v settings 编辑）

## 验证（必须全部通过，真实数据）

1. `cd api && npx tsc --noEmit`（或 npm run build -w api）通过；`cd app && npm run build` 通过。
2. `docker compose up -d --build api`（migrate.js 自动应用 settings 列；不要 down 其他容器）。
3. 复用 53589a14 或新建 3-5 镜 i2v 任务跑 L5：日志逐镜 `[i2v] shot k/m done`；`avs:i2v-progress:<id>` 增长；任务详情响应带 i2v_progress；耗时=镜数×单镜耗时（不再整步无反馈）。
4. **失败分级**：把 i2v 平台 key 换成无效/欠费 key → 任务立即中断（paused + error_summary + 前端提示），不逐镜 fallback、不白跑；恢复 key → 续跑只补失败镜。
5. **参数打通**：分镜 duration_sec=8 的镜 → wingray 请求 parameters.duration=8（日志/抓包确认）；settings.duration 覆盖生效。
6. **单镜重生成**：删某镜 clip asset → POST regenerate → 只重跑该镜，其余镜不重跑。
7. 回归：static 档任务 L5 仍 `{skipped:true}`；L6-L10 不受影响；正常 i2v 任务出真视频（非 fallback）。

## 硬性要求

- 只改上述文件，不重构无关模块；**不 push**；不 `docker compose down` 其他容器。
- 完成后 read_file 自证改动 + 输出验证数据（逐镜日志、progress hash、失败分级实测结果、参数请求体）。
- 前端改动遵循现有组件风格（dark 主题、sonner toast、zh 文案）。
