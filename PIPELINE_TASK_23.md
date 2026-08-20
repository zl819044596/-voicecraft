# PIPELINE_TASK_23: 后端健壮性（chatJson 单步预算 + 启动孤儿任务检测）

## 背景（听潮排查结论）

- 用户反馈每步执行久：L3 分镜 375s = 6 次 60s 超时重试后降级。
- 重试链：`chatCompletion`（runtime.ts，网络层重试 ≤3 + 指数退避）嵌套 `chatJson`（llm.ts，业务三级阶梯：原始 → RETRY_HINT → P-FIX）→ **单步最多 9 次真实调用**，LLM 超时从 60s 改 120s 后最坏单步 ~18min。
- 容器重建后正在执行的任务变僵尸（内存进程死、DB status 仍 running，如 f96f81bc）。

## 修改点（仅 api/ 两个文件）

### 1. `api/src/pipeline/llm.ts` — chatJson 单步总预算 180s

在 `chatJson` 开头加预算常量与计时，三级 attempt 前检查超预算直接跳过（落到 degrade 兜底）：

```ts
/** chatJson 单步总预算：超过直接 degrade，避免 chatCompletion×chatJson 重试风暴（最坏 ~18min）。 */
const STEP_LLM_BUDGET_MS = 180_000;

export async function chatJson(opts: ChatJsonOpts): Promise<Record<string, unknown>> {
  const { pg, task, provider, sysPrompt, usrPrompt, mockKey, params, model, schemaKey, degrade } = opts;
  const lang = contentLang(task);
  const startedAt = Date.now();
  const overBudget = () => Date.now() - startedAt > STEP_LLM_BUDGET_MS;

  let lastErr: Error | null = null;
  let lastOut: unknown = null;

  // attempt 1 — 原始 prompt
  if (!overBudget()) {
    try {
      const out = await callOnce(opts);
      lastOut = out;
      if (params && params.json) return parseJson(out, schemaKey) as Record<string, unknown>;
      return out as Record<string, unknown>;
    } catch (err) {
      lastErr = err as Error;
    }
  }

  // attempt 2 — RETRY_HINT 追加
  if (!overBudget()) {
    try {
      ...（原 attempt 2 代码不变）
    } catch (err) {
      lastErr = err as Error;
    }
  }

  // attempt 3 — P-FIX 修复调用
  if (!overBudget()) {
    try {
      ...（原 attempt 3 代码不变）
    } catch (err) {
      lastErr = err as Error;
    }
  }

  // Final — 调用方 degrade 兜底（原代码不变）
  if (typeof degrade === 'function') { ... }
  throw lastErr;
}
```

要求：保持现有三级内容逐字不变，只加 `overBudget()` 守卫与计时；degrade 兜底保持原样。

### 2. `api/src/index.ts` — 启动孤儿任务检测

在 L110（三个 start*Loop 启动之后）加一次异步孤儿清理：

```ts
// 启动时孤儿任务检测：api 重建会杀掉内存中的执行进程 → 把 running 且非暂停、
// 且 30 分钟无更新的任务标记 failed（避免僵尸 running 卡死用户界面）。
pool
  .query(
    `UPDATE tasks
        SET status = 'failed',
            error = 'orphaned: api restarted while task was running',
            updated_at = now()
      WHERE status = 'running'
        AND NOT (config->>'paused' = 'true')
        AND updated_at < now() - interval '30 minutes'`,
  )
  .then((r) => {
    if (r.rowCount && r.rowCount > 0) console.warn(`[pipeline] orphan sweep: ${r.rowCount} task(s) marked failed`);
  })
  .catch((err) => console.warn('[pipeline] orphan sweep failed:', err instanceof Error ? err.message : String(err)));
```

注意：config->>'paused' 为 'true' 的任务是正常暂停（pauseTask 不改 status），不得误杀。

## 验证（必须全部通过）

1. `cd api && npm run build` 通过（tsc 无错误）。
2. `docker compose up -d --build api` 重建容器 + health 绿（curl -sk https://localhost/api/health --noproxy '*'）。
3. 行为说明：
   - 单步 LLM 最坏耗时从 ~18min 收敛到 ~3min（预算 180s 后走 degrade）。
   - 容器重启后僵尸任务自动变 failed，用户能看到明确错误而非永远 running。
4. git 提交：`git add` 仅限 api/src/pipeline/llm.ts + api/src/index.ts，commit message 如 `fix(api): step llm budget 180s + orphan task sweep on boot`.

## 输出格式

完成后用 read_file 自证两处修改已落盘，并报告：修改文件路径、build 真实输出、commit hash。
