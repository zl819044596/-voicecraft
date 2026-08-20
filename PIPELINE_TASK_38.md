# PIPELINE_TASK_38: 合成时配音被硬砍 —— worker 读错字段名 + 用预估值裁剪

## 背景（2026-08-14 用户反馈：成片每段配音最后几个字都没读出来）

### 根因（已实锤）

1. **字段名不匹配**：`render/worker/index.js` compose 用 `Number(shot.duration) || 5`，但 L3 storyboard 写入的字段是 `duration_sec`（PIPELINE_TASK_37 档位化后值 5-20s）。`shot.duration` 永远是 undefined → 每段合成 `-t 5` 硬裁剪。
2. **预估值裁剪音频**：即使字段名对上（duration_sec=20s），实际配音 31-45s 仍会被 `-t 20` 砍掉尾部——预估值只是"朗读时长估算"，不能作为合成裁剪依据。

实测（任务 88855f42）：storyboard shots[0] = `{duration_sec: 20}`（无 duration 字段）；vo-01.mp3 实际 31.63s → 成片该镜只有 5s，丢 26.6s。

## 修改点（只改 render/worker/index.js）

### compose（约 :342-354）有配音分支
- 读取字段兼容：`const storyDur = Math.max(0.5, Number(shot.duration_sec ?? shot.duration) || 5);`
- **有音频时**：先 `probeDuration(audioLocal)`（模块已有该函数，srt 生成就在用）拿实测秒数，作为该镜时长（`dur = probe ?? storyDur`）；无音频镜维持 `dur = storyDur`。
- ffmpeg 参数 `-t String(dur)` 保持——但 dur 现在是实测配音时长，画面跟配音走，不再砍音频。
- 注意：图片 `-loop 1` 会无限循环，`-t` 控制总时长；音频短于 dur 时 `-shortest` 收尾，行为不变。

## 验证（必须全部通过）

1. `cd render/worker && node --check index.js`（语法）通过；若用 TS 则按仓库构建方式 build。
2. `docker compose up -d --build render` 重建 render 容器（background=true，不要 down）。
3. 重跑任务 88855f42 的 L8（rerun from_step=8，cookie avs-test-1786603871，Content-Type: application/json）→ final.mp4：
   - 总时长 ≈ 各镜配音实测时长之和（≈75s，之前被砍成 15 镜 × 5s = 75s？不对——之前每镜 5s 共 75s，修复后每镜 18-45s，总时长会显著变长，可能 400-500s+。以实际为准，重点验证**每段语音完整**）。
   - 用 ffprobe 抽成片中间某镜时间段（如 20-50s 区间）听感/波形能量连续，无 5s 后突断。
4. git commit（不 push）：`fix(render): compose uses measured audio duration per shot (was -t 5 hardcut due to field name mismatch duration_sec vs duration)`。

## 硬性要求

只改 render/worker/index.js（compose 部分）；不重构；不 push；不 docker compose down；不改任务卡外文件。完成后 read_file 自证 + 报告验证数据（新成片时长、抽查段波形、commit hash）。
