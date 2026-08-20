# PIPELINE_TASK_20: 修复任务详情页黑屏（NodeVisual 空镜头崩溃 + pausedInitial 默认阶段）

## 背景与根因（听潮已定位）

- 用户「快速生成」点生成 → 创建 semi 半自动任务（paused initial，停在 L1 等「开始运行」）→ 跳转 `/app/tasks/:id` → **整页黑屏**。
- 根因链：
  1. `app/src/pages/TaskWizard.tsx` L98：`useState(3)` 默认阶段 = 3（视觉/分镜页）。
  2. 任务未运行 → 后端无 storyboard（`GET /api/tasks/:id` 返回 `storyboard: null`）→ `storyboardToShots` 返回 `[]` → `effShots = []`。
  3. `app/src/components/task-wizard/NodeVisual.tsx` L64：`const shot = shots.find(...) ?? shots[0]` → shots 空 → **shot = undefined**。
  4. L73：`getRealCandidates(shot.index)` → **`shot.index` TypeError** → 无 ErrorBoundary（全项目无）→ React 整树卸载 → 黑屏。
- demo 模式无此问题（mock INITIAL_SHOTS 非空）；真实任务在「未运行/无 storyboard」时必现。

## 修改点（仅 app/ 两个文件）

### 1. `app/src/components/task-wizard/NodeVisual.tsx`
在 L64 之后（所有 hooks 之后、首次使用 `shot` 之前）加空态保护：
```ts
const shot = shots.find((s) => s.index === sel) ?? shots[0]
if (!shot) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[10px] border border-line bg-raised px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink2">任务尚未生成分镜 · 先运行 L1 脚本/L2 分镜</p>
      <p className="text-xs text-ink3">semi 模式请在任务顶部点击「开始运行」，跑完 L3 后这里会展示每镜画面与候选图</p>
    </div>
  )
}
```
注意：`if (!shot) return ...` 必须放在 L73 `realList` 之前（hooks 顺序不变，L63-71 的 useState 都在前面）。

### 2. `app/src/pages/TaskWizard.tsx`
real + pausedInitial 时默认进入 L1 脚本页（而不是 stage 3）：
```ts
useEffect(() => {
  if (real && realWizard.pausedInitial) setStage(1)
}, [real, realWizard.pausedInitial])
```
放在现有 useEffect 附近（如 mock runner 的 useEffect 之后、render 之前）。仅影响 real 模式 paused initial 任务；demo 与运行中任务不受影响。

## 验证（必须全部通过）

1. `cd app && npm run build` 通过（tsc -b + vite build 无 TS 错误）。
2. 行为说明：
   - 新建 semi 任务（paused initial）→ 任务详情页正常渲染，默认停在 L1 脚本页，显示「任务已就绪 · semi 模式等待开始」条，不再黑屏。
   - 若手动切到第 3 阶段 → 显示空态提示（不崩溃）。
   - demo 模式回归：mock 任务照常（INITIAL_SHOTS 非空，不受影响）。
3. git 提交：`git add` 仅限上述 2 个文件（严禁 `git add -A`），commit message 如 `fix(app): task wizard black screen on empty storyboard + paused initial lands on L1`.

## 输出格式

完成后用 read_file 自证修改已落盘（贴出修改后的关键代码行），并报告：
- 修改的文件绝对路径
- `npm run build` 的真实输出摘要
- git commit hash
