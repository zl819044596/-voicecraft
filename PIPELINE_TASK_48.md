# PIPELINE_TASK_48：render 字幕烧录超时/静默降级修复

状态：待执行
日期：2026-08-19
执行方式：Claude Code 后台派工 + 听潮独立复核

## 背景（已实锤）

render worker（render/worker/index.js）字幕烧录存在两个 bug：

1. **长视频烧字幕必超时**：`FFMPEG_TIMEOUT=300000`（5 分钟）对所有 ffmpeg 调用统一生效，
   烧字幕命令（`-vf subtitles=...` + libx264 重编码）对 4:21（261s）成片必然超时 →
   execFile timeout kill（err.code=undefined → code=1）→ 判定失败
2. **日志误导**：失败时打 `br.stderr.slice(0, 200)`——ffmpeg stderr 前 200 字全是版本
   banner（"ffmpeg version 9.0 Copyright..."），真实错误永远看不到
3. **静默降级**：burn 失败返回 null → 用无字幕 concat 版本继续 → 成片没字幕且无任何
   警告回执（用户/API 侧都不知道）

现象日志（VPS/本地 render 容器实测）：
```
[render] subtitle burn skipped for 88855f42-...: ffmpeg version 9.0 Copyright (c) 2000-2026 the FFmpeg developers
```

## 需求（render/worker/index.js）

1. **超时动态化**：烧字幕（及所有 ffmpeg 调用）超时按输入时长/工作量计算
   （如 `max(5min, 预估时长 × 2 + 30s)`），长视频不再被误杀
   - 或用更快的编码参数（如 `-preset ultrafast` 替代 `veryfast`）降低单次耗时——评估画质影响，可两者都做
2. **日志修正**：stderr 截断前过滤掉 ffmpeg 版本 banner 行（/ffmpeg version/i 开头的行），
   输出真实错误（末尾几行 + 退出码 + killed/signal 标记）
3. **失败不静默**：burn 失败时：
   - 打清晰警告（真实原因）
   - 回执给 API 侧 warnings（render 回执 payload 已有 warnings 字段，
     参考 handleRenderResult 的 warnings 透传），API 侧把警告写入任务
   - 仍可继续用无字幕版本（降级策略保留），但要**可见**
4. 保持幂等（final.mp4 已存在 → 直接回执）不变

## 验收（听潮独立复核）

1. 本地 colima 重建 render 镜像（`DOCKER_CONTEXT=colima docker compose build render && up -d render`）
2. 构造长视频任务（口播长文本 ≥ 4 分钟成片）跑全流程：
   - 烧字幕成功（成片含字幕，ffprobe/抽帧验证字幕可见）
   - 日志无版本 banner 误导
3. 短视频任务回归：字幕正常烧录
4. 若真实长任务成本高，可用 render worker 单测/直接调 burnSubtitles 函数验证超时逻辑

## 约束

- 只改 render/worker/index.js（及 render/Dockerfile 如需调整 ffmpeg）
- 不动 api/src、不动前端、不动 nginx/compose 其他部分
- 不提交 git；DOCKER_CONTEXT=colima；不用 kimi
- ⚠️ 重建镜像注意：本地 colima 与 Docker Desktop 双 daemon，操作必须显式 DOCKER_CONTEXT=colima

## 输出报告（/tmp/task48_report.md）

改动 diff + 验证证据（超时日志对比、字幕可见性证据、短任务回归）+ 阻塞点
