# PIPELINE_TASK_16: 修复任务详情页「id must be a valid uuid」红字报错

## 背景与根因（听潮已定位，直接按此修复）

- `app/src/lib/demo.tsx` 的 `DEFAULTS.mode = 'real'`（默认走真实后端 API，demo 模式仅供原型演示）。
- 但前端多处硬编码了 **demo 场景 id**（非 UUID）：
  - `app/src/components/Navbar.tsx` → `/app/tasks/demo-aurora`
  - `app/src/components/AppShell.tsx` → `/app/tasks/demo-aurora`
  - `app/src/components/dashboard/OverviewCards.tsx` → `/app/tasks/aurora-brew-30s`
  - `app/src/pages/QuickGenerate.tsx` → `/app/tasks/aurora-brew-30s`（演示按钮 setTimeout）
  - `app/src/pages/Billing.tsx` → `/app/tasks/demo-aurora`
- `app/src/pages/TaskWizard.tsx` 第 81-84 行：

  ```ts
  const { id } = useParams()
  const { mode: demoMode } = useDemo()
  const real = demoMode === 'real' && !!id
  const realWizard = useTaskWizardReal(id, real)
  ```

  默认 real 模式下用 `aurora-brew-30s` 这种非 UUID 调 `GET /api/tasks/:id` → 后端 `isUuid` 校验失败 → 422「id must be a valid uuid」红字报错 + 重试按钮，demo 演示数据无法展示。

## 修改点（唯一必须改的文件）

`app/src/pages/TaskWizard.tsx`：

1. 给 `real` 判定加 **UUID 格式校验**：id 不是合法 UUID 时强制走 demo mock 状态机（页面展示 mock 演示数据，不调 API）。合法 UUID 正则：

   ```ts
   /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
   ```

   即：`const real = demoMode === 'real' && !!id && UUID_RE.test(id)`

2. 常量放在组件外（模块级）或组件内顶部均可，勿放 early return 之后。

3. 不要改动 `useTaskWizardReal`（`app/src/lib/task-wizard-real.ts`）本身——enabled 参数由调用方控制即可；也不需要改后端。

## 验证（必须全部通过才算完成）

1. `cd app && npm run build` 通过（tsc -b + vite build，无 TS 错误）。
2. 说明修复后以下场景的行为：
   - 侧边栏「任务」→ `/app/tasks/demo-aurora`：任何模式下走 mock 状态机，正常展示演示任务（无红字报错）。
   - 首页卡片 → `/app/tasks/aurora-brew-30s`：同上。
   - QuickGenerate 真实创建后 `navigate(/app/tasks/${res.task.id})`：id 是真实 UUID → 仍走 real API，不受影响。
3. git 提交：`git add` **仅限 `app/src/pages/TaskWizard.tsx`**（严禁 `git add -A`，工作区有其他无关未跟踪文件），commit message 如 `fix(app): demo task links with non-uuid id fall back to mock runner`.

## 输出格式

完成后用 read_file 自证修改已落盘（贴出修改后的关键代码行），并报告：
- 修改的文件绝对路径
- `npm run build` 的真实输出摘要（成功/失败）
- git commit hash
