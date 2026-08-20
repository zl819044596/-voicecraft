# PIPELINE_TASK_39: 队列 P0 优化 —— 启动自愈 + 并发 worker 消费

## 背景（2026-08-14 实测）

今天线上两次"生成视频卡住"：
1. **单 worker blpop 串行**：L5 i2v 任务（15 镜，每镜最坏轮询 10 分钟 = 150 分钟）占着唯一 worker，后面 fc2c013b / 88855f42 的 step9 复检排队等不到，看起来像"卡死"。
2. **无启动自愈**：`docker compose restart api` 后，正在执行的 job（已 blpop 弹出）直接丢失，任务永远 running（661ca7cd step5、fc2c013b/88855f42 step9 都这样，需手动复位 + 手动 RPUSH 恢复）。

对标开源项目 ArcReel（lib/generation_queue.py / generation_worker.py）：
- `requeue_running()` / `list_orphan_tasks_on_start()`：启动时扫描 running 任务重新入队（ADR 0007 自愈）
- 多 worker 并发消费（image/video/audio lane），慢任务只占自己槽位

## 修改点（只改 api/src/pipeline/queues.ts + index.ts 启动）

### 1. 启动自愈（requeue orphan tasks）

api 启动时（step worker 开始 blpop 之前）执行一次：
- SQL：`UPDATE tasks SET status='queued', current_step = CASE WHEN current_step IS NULL OR current_step < 1 THEN 1 ELSE current_step END, config = jsonb_set(config, '{paused}', 'false') WHERE status='running'`
- 对每个受影响任务，按其 `current_step` 重新入队 step job（`{taskId, step: current_step, force: true}`，队列优先级 p0/p1/p2 按原逻辑）——注意：**必须 force:true**，因为 step_results 里已有 running 行（幂等守卫会丢弃非 force job）。
- 打印 `[pipeline] self-heal: recovered N running task(s)`。
- 只执行一次（启动时），不循环。

⚠️ 边界：L7/L8 是 waitingForRender（等 render worker 回执），此时 task.status 可能是 running 但当前步是 7/8 且 step_results 已有 done 行 → 若 force 重跑 L7/L8 会重复入队 render job。**保护**：跳过 current_step ∈ (7, 8) 且该步 step_results.status='done' 的任务（它们的 render 回执可能在途，交给 render-result worker 收尾）。

### 2. 并发 worker 消费（3 个消费者）

把 `startStepLoop` 从单 `for(;;) blpop` 改为启动 `WORKER_CONCURRENCY`（默认 3，env 可调）个并发消费者，各自 blpop 抢 job 后 `runStep`：
- 用 `Promise.all` 启动 N 个 `consumeOnce()` 循环；每个循环 `blpop(PRIORITY_KEYS, 10)` → `runStep` → 继续。
- **同一个任务的步骤天然串行**（finalizeStep 后才入队下一步；runStep 幂等守卫 + markStepRunning 防重入），无需额外锁。
- 消费者错误捕获：单循环 try/catch + 1s 退避，其他消费者不受影响。

### 3. 常量
- `const STEP_WORKER_CONCURRENCY = Number(process.env.STEP_WORKER_CONCURRENCY || 3);`（clamp 1..8）

## 验证（必须全部通过）

1. `cd api && npx tsc --noEmit`（或 npm run build）通过。
2. `docker compose up -d --build api` 重建（background=true，不要 down 其他容器）。
3. 自愈验证：把 661ca7cd / fc2c013b / 88855f42 手动置为 running（模拟崩溃残留）→ restart api → 日志出现 `self-heal: recovered 3 running task(s)` → 三个任务自动重新入队并推进（661ca7cd step5 i2v 继续、两个 step9 复检完成）。
4. 并发验证：日志出现 3 个 `[pipeline] step worker #N started`。
5. 观察 3 个任务都能推进（不再互相阻塞）。

## 硬性要求

只改 queues.ts（+ index.ts 启动调用处，如需）；不重构其他模块；不 push；不 docker compose down。完成后 read_file 自证 + 报告验证数据（自愈日志、并发 worker 数、任务推进情况）。
