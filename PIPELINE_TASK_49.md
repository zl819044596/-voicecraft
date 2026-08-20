# PIPELINE_TASK_49：修复 Codex 审核 P1 三项（rerun 一致性 / L4 写回丢字段 / render 超时全覆盖）

状态：待执行
日期：2026-08-19
执行方式：Claude Code 后台派工 + 听潮独立复核
来源：Codex 审核报告（audit-codex-report.md，og-5.6-terra 输出）

## 背景

TASK_46/47/48 已实现并通过主路径验证。Codex 独立审核发现 3 项 P1（审核报告在
/Volumes/Data/GitHub/ai-video-studio/audit-codex-report.md）：

1. rerun 路径（重拆分镜/单镜重生）绕过 TASK_47 一致性保障
2. L4 补全写回 storyboard 时丢失 preset/protagonist 顶层字段
3. TASK_48 部分 ffmpeg 调用（BGM 混音、concat -c copy）仍固定 5 分钟超时

## 需求

### P1-1：rerun 路径接入主角锚定/seed/风格后缀

文件：api/src/pipeline/rerun.ts（约 :390 regenerateStoryboard / :421/:456 regenerateShotImage）

- 抽取共享 helper（建议放 l4.ts 或新文件 style-context.ts）：
  - `seedFromTaskId(taskId)`（l4.ts:27 已有，提为共享导出）
  - `styleSuffixFor(lang)`（STYLE_SUFFIX_ZH/EN 提为共享）
  - `withProtagonistPrefix(prompt, protagonistDescription)`（确定性前置补全）
- `regenerateStoryboard()`：重拆后按 l3.ts 同款流程提取主角（或复用 L3 的主角提取函数），
  写入 storyboard 顶层 protagonist + preset 字段
- `regenerateShotImage()`：读原始 storyboard.json 的 preset/protagonist，追加统一风格后缀、
  确定性补主角描述、传同一任务 seed（seedFromTaskId(task.id)）
- 与 L3/L4 主路径行为完全一致

### P1-2：L4 补全写回保留 preset/protagonist

文件：api/src/pipeline/steps/l4.ts（约 :41/:52/:128）

- 补全成功写回时保留顶层字段：写回对象 = 原始 storyboard JSON（含 preset/protagonist 等
  未知顶层字段）+ 更新后的 shots；不要用 readStoryboard 归一化结果覆盖写
- 建议：写回前 merge：`{ ...rawStoryboard, shots: nextShots }`（rawStoryboard 为 L4 开头
  读到的原始 JSON）

### P1-3：render 全部 ffmpeg 调用动态超时

文件：render/worker/index.js（:291 mixBgm / :449 静态 concat / :598 i2v concat）

- mixBgm：先 probeDuration(videoFile) 再传 encodeTimeoutFor(duration)
- 两个 concat（-c copy）：用已知累计时长或 probeDuration 后显式传 timeout
- ffprobe 自身的 15s 上限保持不变

### 顺手修（P2，低风险）

- P2-1：l3.ts protagonistFromOut 正则兜底——先尝试从 fenced 文本提取 JSON 对象并 JSON.parse，
  再走对象契约；正则只做最后 fallback
- P2-3：L4 补全指令按 lang 中英分套（主体指令 + 主角一致性段），fallback prompt 语言跟随任务语言
- P2-2（seed 碰撞/构图雷同）**本次不动**——需 wingray 实测 seed 语义后再定，在报告里说明

## 验收（听潮独立复核）

1. npm run build（tsc）通过；node --check render/worker/index.js 通过
2. 代码审查：rerun 两路径与 L3/L4 行为一致；L4 写回保留全部顶层字段；
   render 三处调用显式传动态超时
3. 本地 colima 回归（真实任务）：
   - 主角任务：L3 → L4 全链路（可跑到 L4 生图即止，wingray 402 余额问题时看代码路径）
   - 重拆分镜（PUT /api/tasks/:id/node 或 rerun 接口）后 storyboard.protagonist 仍在
   - 单镜重生后 prompt 含风格后缀 + 主角描述 + 同 seed
4. 报告写 /tmp/task49_report.md

## 约束

- 只改 api/src/pipeline/（rerun.ts / l4.ts / l3.ts 必要时）与 render/worker/index.js
- 不提交 git；DOCKER_CONTEXT=colima；HTTP 请求 timeout≤25s；NO_PROXY='*'
- 不用 kimi
