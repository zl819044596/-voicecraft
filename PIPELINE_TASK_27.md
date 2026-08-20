# PIPELINE_TASK_27: LLM 禁用推理（thinking disabled）+ 单步预算硬性兜底

## 背景（听潮探针实证，2026-08-13）

- 用户任务（managed 托管档）L3 分镜每步 5~7 分钟。直测两种 key：
  - 用户个人 key：14.3s（output 1427, **reasoning 606**）
  - **平台 key（托管池）：64.4s（output 7580, reasoning 6549 占 86%）** → 长输出超 120s 超时 → chatJson/chatCompletion 重试风暴
  - 平台 key + `thinking: {type:'disabled'}`：**5.8s（reasoning 0）** ✅
- 结论：wingray 平台 key 的 DeepSeek-V4-Flash-0731 默认深度推理，需显式禁用。
- 另：STEP_LLM_BUDGET_MS=180s（TASK_23）只在 chatJson attempt 之间检查，**attempt 内部 chatCompletion 的 3 次重试（每次 120s）不受控** → 单步最坏 18min，预算形同虚设。

## 修改点（api/src/providers/runtime.ts + api/src/pipeline/llm.ts）

### 1. runtime.ts — 两个 chat 请求体加 thinking disabled

**wingrayChat**（L230 附近）：
```ts
const body: Record<string, unknown> = {
  model: opts.model || LLM_MODEL,
  messages: opts.messages,
  thinking: { type: 'disabled' },   // 新增：禁用推理，长输出快 ~10×（平台 key 实测 64s→6s）
};
```

**openAiCompatChat**（L460-480 附近，找 body 构造处）同样加 `thinking: { type: 'disabled' }`（deepseek 官网兼容参数）。

### 2. runtime.ts — chatCompletion 支持 deadlineAt 硬性预算

ChatOpts 接口加可选字段：
```ts
deadlineAt?: number;  // 毫秒时间戳；超过则不再发起/重试，直接 throw
```

chatCompletion 重试循环（L538-547）改为：
```ts
for (let attempt = 1; attempt <= 3; attempt += 1) {
  if (opts.deadlineAt && Date.now() > opts.deadlineAt) {
    throw new Error('llm step budget exceeded');
  }
  try {
    return await run();
  } catch (err) { ... 原逻辑 ... }
}
```

wingrayChat / openAiCompatChat 的 fetch AbortSignal 超时改为「剩余预算与固定超时的较小值」：
```ts
signal: AbortSignal.timeout(opts.deadlineAt ? Math.max(1, Math.min(LLM_TIMEOUT_MS, opts.deadlineAt - Date.now())) : LLM_TIMEOUT_MS),
```
（wingrayChat/openAiCompatChat 需要透传 deadlineAt 参数或从调用处传；实现以最小改动为准——可以把 deadlineAt 并入 wingrayChat 的参数对象。）

### 3. llm.ts — chatJson 传 deadlineAt

callOnce 调 chatCompletion 时传：
```ts
deadlineAt: opts.deadlineAt,
```
ChatJsonOpts 加 `deadlineAt?: number`；chatJson 入口：
```ts
const deadlineAt = startedAt + STEP_LLM_BUDGET_MS;  // 沿用 TASK_23 的 180_000
```
调用 callOnce 时透传（三级 attempt 与 P-FIX 都传）。

要求：现有 STEP_LLM_BUDGET_MS=180_000 与 overBudget() attempt 间检查保留；新增 deadlineAt 让 180s 成为**硬性上限**（单步最坏 ~180s 必出结果：成功/失败/degrade）。

## 验证（必须全部通过）

1. `cd api && npm run build` 通过。
2. `docker compose up -d --build api` 重建 + health 绿。
3. 行为说明：
   - 任务 L3 分镜应在 **10~40s** 内完成（thinking disabled 后平台 key 实测 6s）。
   - 单步 LLM 最坏耗时硬性 ≤ ~180s（deadlineAt 生效）。
4. 用容器内探针复测：`/srv/api/llm-probe.js`（含 thinking disabled，平台 key 17d570a7）应 <15s。
5. git 提交：`git add` 仅限 runtime.ts + llm.ts，commit message 如 `fix(api): disable llm thinking for speed + hard step budget deadline`.

## 输出格式

完成后用 read_file 自证修改已落盘，报告：修改文件路径、build 输出、commit hash、探针复测耗时。
