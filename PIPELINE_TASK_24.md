# PIPELINE_TASK_24: 前端降级提示（degraded 步骤 AmberBar）

## 背景

- 后端 L3 分镜超时降级（payload.degraded=true，shot_count=2 残次品）时页面无任何提示，用户不知道结果不完整。
- 数据已存在：`GET /api/tasks/:id` 的 `steps[]` 每项有 `payload: Record<string, unknown>`（`app/src/lib/types.ts` TaskStepResult，`payload.degraded === true` 标记降级）。

## 修改点（仅 app/ 两个文件）

### 1. `app/src/lib/task-wizard-real.ts` — 暴露 degradedSteps

- `TaskWizardReal` 接口加字段：`degradedSteps: number[]`（已降级步骤号，升序，如 `[3]`）。
- hook return 里实现（detail.steps 的 payload.degraded === true）：
```ts
degradedSteps: detail
  ? detail.steps
      .filter((s) => s.payload?.degraded === true)
      .map((s) => Number(s.step))
      .sort((a, b) => a - b)
  : [],
```
- 放 return 对象里（如 l9Report 旁边）。

### 2. `app/src/pages/TaskWizard.tsx` — 渲染 AmberBar

- 引入 `AmberBar`（`@/components/task-wizard/shared` 已有导出，tone='amber'|'teal'|'err'）。
- 在 `<HeaderBar ... />` 之后、主体内容之前渲染（仅 real 且有降级步骤时）：
```tsx
{real && realWizard.degradedSteps.length > 0 && (
  <div className="mb-3">
    <AmberBar tone="amber">
      ⚠ 步骤 L{realWizard.degradedSteps.join(' / L')} 生成超时已降级，结果可能不完整 —— 建议在该步骤重新生成
    </AmberBar>
  </div>
)}
```
- 文案可微调，但必须包含「降级」「不完整」「重新生成」三个信息点。

## 验证（必须全部通过）

1. `cd app && npm run build` 通过（tsc + vite 无错误）。
2. 行为说明：f96f81bc 这类任务（L3 degraded）打开详情页 → HeaderBar 下方出现琥珀色提示条；无降级任务不显示。
3. git 提交：`git add` 仅限上述 2 文件，commit message 如 `feat(app): show degraded step banner in task wizard`.

## 输出格式

完成后用 read_file 自证两处修改已落盘，并报告：修改文件路径、build 真实输出、commit hash。
