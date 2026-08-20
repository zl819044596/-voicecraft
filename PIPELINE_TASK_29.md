# PIPELINE_TASK_29: L8 合成页真实视频播放（替换占位图 mock）

## 背景

- 用户任务 c84c9198 全流程跑完（L8 done、final.mp4 1.3MB 已在 MinIO、DB assets 有 mp4 记录、后端下载端点 `GET /api/tasks/:id/assets/:type/:basename` 已存在——tasks.ts L400-431 ASSET_TYPES 含 mp4）。
- 但前端 NodeCompose 完成态用 `/shot-03.png` 占位图 + Ken Burns 模拟 + 假进度条 + 假信息（1920×1080 · 30s · 24.6MB），注释明写「原型无真实视频二进制」——**没接真实视频**。
- 前端 `app/src/lib/task-wizard-real.ts` L42-46 已有 `assetUrl(taskId, type, key)` 辅助函数（minio key → 后端流式 URL）。

## 修改点（2 个文件）

### 1. `app/src/components/task-wizard/NodeCompose.tsx`

Props 增加：
```ts
videoSrc?: string       // 真实成片视频 URL（real 模式 L8 done 后由 TaskWizard 传入）
meta?: { duration: number; size: number }  // 真实成片时长（秒）/大小（字节），real 模式
```

完成态（L219-248，`!composed ? gate : done` 的 done 分支）：
- 有 `videoSrc` 时，把 L223-248 的占位图播放器块替换为：
```tsx
<div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[14px] border border-linestrong bg-black" style={{ aspectRatio: '9/16' }}>
  <video src={videoSrc} controls className="size-full object-contain" />
</div>
```
- 无 `videoSrc` 时保留现有占位图逻辑（demo 模式兼容，一行不改）。
- 信息列（L251-257）：有 `meta` 时显示真实值：
```tsx
{meta
  ? <>成片已生成 · 时长 {Math.round(meta.duration)}s · 大小 {(meta.size / 1048576).toFixed(1)} MB</>
  : <>1920×1080 · 30s · H.264 · 24.6 MB</>}
```
  后面的「字幕烧录 / BGM / clip」行：有 meta 时只保留字幕烧录行（去掉假 clip 信息），demo 保留原样。
- 「复制预览链接」按钮（L259-265）：有 videoSrc 时复制真实 videoSrc 并 toast「预览链接已复制」；无则保留原模拟行为。

### 2. `app/src/pages/TaskWizard.tsx`（NodeCompose 调用处 L756-768）

加两个 prop（real 模式 L8 done 后）：
```ts
videoSrc={real ? `${API_BASE}/tasks/${id}/assets/mp4/final.mp4` : undefined}
```
（`API_BASE` 已 import？未 import 则 `import { API_BASE } from '@/lib/api'` 或直接 `/api/tasks/${id}/assets/mp4/final.mp4`——用与 task-wizard-real.ts 一致的 API_BASE 写法；`id` 为 useParams 已有变量。）

meta 从 realWizard 取：L8 步骤 payload 有 `duration`/`size`。在 TaskWizard.tsx 计算：
```ts
const l8Payload = realWizard?.detail?.steps?.find((s) => s.step === 8)?.payload as
  | { duration?: number; size?: number }
  | undefined
const l8Meta =
  real && effComposed && l8Payload?.duration != null
    ? { duration: Number(l8Payload.duration), size: Number(l8Payload.size ?? 0) }
    : undefined
```
（若 realWizard 未暴露 detail，则用 task-wizard-real.ts 新增 `l8Meta` 暴露，或退而求其次 meta 暂不传只做 videoSrc——以最小改动为准，videoSrc 为必做项，meta 尽力而为。）

## 验证（必须全部通过）

1. `cd app && npm run build` 通过。
2. 行为说明：
   - real 模式任务 L8 done 后，合成页显示**真实视频播放器**（可播放 final.mp4），信息列为真实时长/大小。
   - demo 模式（无 videoSrc）仍显示原占位图，不受影响。
3. git 提交：`git add` 仅限 NodeCompose.tsx + TaskWizard.tsx（+ 如需要 task-wizard-real.ts），commit message 如 `feat(app): real final.mp4 player in compose stage (replace placeholder)`.

## 输出格式

完成后用 read_file 自证修改已落盘，报告：修改文件路径、build 输出、commit hash。
