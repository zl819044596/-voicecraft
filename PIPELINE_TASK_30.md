# PIPELINE_TASK_30: NodeDeliver 完成页加真实成片视频播放器

## 背景

- 用户连续反馈「合成/完成页面没有视频」。根因：前端多处成片预览是 mock（占位图 + Ken Burns 模拟，注释「原型无真实视频二进制」）。
- NodeCompose（L8 合成页）已修复（`a26d0e3b`：`<video src controls>` 接真实 final.mp4，后端下载端点 `GET /api/tasks/:id/assets/mp4/final.mp4` 已存在）。
- **NodeDeliver（L9 复检 + L10 导出页）还没有**：L9 复检卡只显示检查项文本；预览 Dialog 的 video 分支仍是 `<img>` 假预览。
- 前端 `app/src/lib/task-wizard-real.ts` L42-46 `assetUrl(taskId, type, key)` 已存在；TaskWizard.tsx `const { id } = useParams()` + `API_BASE`（`@/lib/api` 导出）已可用（TASK_29 已 import）。

## 修改点（2 个文件）

### 1. `app/src/components/task-wizard/NodeDeliver.tsx`

Props 增加：
```ts
videoSrc?: string   // 真实成片视频 URL（real 模式 L8 done 后由 TaskWizard 传入；无则 demo 保持原样）
```

**L9 复检卡（SectionCard caption="L9 · 复检"，L165-219）**：在 `l9State === 'passed'` 分支（L175-191）的检查项网格**上方**加真实视频播放器：
```tsx
{videoSrc && (
  <div className="mb-4 flex justify-center">
    <div className="relative w-full max-w-[300px] overflow-hidden rounded-[14px] border border-linestrong bg-black" style={{ aspectRatio: '9/16' }}>
      <video src={videoSrc} controls className="size-full object-contain" />
    </div>
  </div>
)}
```
（无 videoSrc 时该区域不渲染，demo 完全不变。）

**预览 Dialog video 分支（L300-304）**：改为真实视频（当 previewSrc 是 http(s) URL 时）：
```tsx
{preview?.kind === 'video' && (
  <div className="mt-2 flex justify-center overflow-hidden rounded-lg border border-line bg-canvas">
    {preview.previewSrc?.startsWith('http')
      ? <video src={preview.previewSrc} controls className="max-h-[60vh] object-contain" />
      : <img src={preview.previewSrc} alt={preview.name} className="animate-kenburns max-h-[60vh] object-contain" />}
  </div>
)}
```

### 2. `app/src/pages/TaskWizard.tsx`（NodeDeliver 调用处，L770-784）

NodeCompose 传法一致：
```ts
videoSrc={real ? `${API_BASE}/tasks/${id}/assets/mp4/final.mp4` : undefined}
```

## 验证（必须全部通过）

1. `cd app && npm run build` 通过。
2. 行为：real 模式任务完成后，「完成」页 L9 卡显示真实成片播放器；demo 模式无变化。
3. git 提交：`git add` 仅限 NodeDeliver.tsx + TaskWizard.tsx，commit message 如 `feat(app): real final.mp4 player in deliver stage (L9)`.

## 输出格式

完成后用 read_file 自证修改已落盘，报告：修改文件路径、build 输出、commit hash。
