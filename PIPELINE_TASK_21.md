# PIPELINE_TASK_21: 修复任务详情页「一直刷新/闪」（paused 任务停止轮询 + detail 引用稳定）

## 背景与根因（听潮已定位）

- 用户反馈：任务详情页**一直刷新/闪烁**（状态图标/文字跳变，观感像页面反复刷新）。
- 根因链：
  1. `app/src/lib/task-wizard-real.ts` L337：
     ```ts
     const running = detail && (detail.status === 'running' || detail.status === 'queued')
     ```
     **paused 任务（等待开始 / semi 每步暂停确认）status='queued' 也满足轮询条件** → 每 2.5s 轮询 `GET /api/tasks/:id` 永不停止。
  2. 轮询响应 → L313 `setDetail(d)`（每次都是新对象引用）→ realWizard 派生值（statuses 等）全部新引用 → TaskWizard 整树重渲染 → 视觉上「一直刷新/闪」。
  3. paused 任务内容**不会自己变化**（等用户操作），轮询纯属浪费。

## 修改点（仅 app/src/lib/task-wizard-real.ts）

### 1. paused 任务不轮询
L336-343 改为：
```ts
// paused 任务（等待开始/暂停确认）内容不会自己变，不轮询；运行中才轮询。
const cfg = (detail?.config ?? {}) as Record<string, unknown>
const paused = cfg.paused === true
const running = detail && !paused && (detail.status === 'running' || detail.status === 'queued')
```
注意：`const running` 声明保持原位置（L337 附近），轮询 useEffect 依赖不变（`[real, running, polling, tick]`）。

### 2. detail 内容不变时保持引用稳定（双保险）
L311-314 改为：
```ts
get<TaskDetail>(`/tasks/${idRef.current}`)
  .then((d) => {
    if (cancelled) return
    // 内容未变（如 paused 期间偶发刷新）→ 保持旧引用，避免整树重渲染闪烁。
    setDetail((prev) => (prev && JSON.stringify(prev) === JSON.stringify(d) ? prev : d))
  })
```
JSON.stringify 比较：任务详情含 storyboard/assets，量级可接受（2.5s 一次的轮询）；paused 不轮询后实际很少执行。

## 验证（必须全部通过）

1. `cd app && npm run build` 通过（tsc -b + vite build 无 TS 错误）。
2. 行为说明：
   - 新建 semi 任务（等待开始，status=queued + config.paused=true）→ **不轮询、不刷新**；点「开始运行 →」后任务真的 running 才轮询。
   - semi 每步暂停（paused 等确认）→ 不轮询；点「继续 →」后恢复轮询。
   - auto 任务运行中 → 轮询照常（2.5s 推进）。
   - 轮询响应内容与本地一致 → 不重渲染。
3. git 提交：`git add` 仅限 `app/src/lib/task-wizard-real.ts`（严禁 `git add -A`），commit message 如 `fix(app): stop polling paused tasks + keep detail reference stable to kill flicker`.

## 输出格式

完成后用 read_file 自证修改已落盘（贴出修改后的关键代码行），并报告：
- 修改的文件绝对路径
- `npm run build` 的真实输出摘要
- git commit hash
