# AI Video Studio — Task 8: 主流程向导（任务详情左右布局 + 半自动/全自动 + 节点编辑 + 回退重跑）

> 执行者：Claude Code。项目根目录：/Volumes/Data/GitHub/ai-video-studio
> 当前状态：Stage 0-7 全部完成（7 服务 healthy；多模型配置中心 /app/models 已上线；假登录、i2v、B增强、模型页全通）。
> 本阶段：把**任务详情页**改造成破局式**主流程向导**——左侧流程节点、右侧当前节点内容（可局部修改）、右上角执行方式（半自动/全自动）、回退修改提示下游重跑。
> 用户确认：① 左右向导方向对 ② 半自动/全自动都要 ③ 流程分两种情况（static / i2v 节点不同）。

## 主流程节点定义（左侧节点条，按任务 config.synthesis 分支）

**共同节点（1-5）**：
1. 商品信息解析（S1）
2. 文案生成（S2）
3. 分镜拆解（S3）
4. 分镜图生成（S4）
5. 配音字幕（S5 配音 + S6 字幕合并为一个节点展示；右侧展示音色选择+配音试听+字幕文本）

**分支**：
- `synthesis=static`：6. **FFmpeg 合成成片**（S7+S8，静态图+配音+字幕 burn → final.mp4）
- `synthesis=i2v`：6. **图生视频片段**（S7 内 i2v：每镜动态片段，右侧展示片段预览+重新生成）→ 7. **FFmpeg 合成成片**

> 注：后端步骤仍是 S1-S9（不改流水线）；前端左侧节点是「用户视角的流程节点」，按映射分组展示（如节点5 对应 S5+S6，节点6 static 对应 S7+S8）。映射关系写清楚。

## 任务清单

### 1. 后端：半自动模式（run_mode）
- 任务创建（routes/tasks.js POST）接受 `config.run_mode = 'semi' | 'auto'`（缺省 'auto'，老任务兼容）。
- 队列 worker（api/src/queue.js 主循环）：每完成一个 step 后检查 run_mode——`semi` 且该 step 非最后一步 → 任务状态置 `waiting`（暂停，不自动推进下一步）；`auto` 或最后一步 → 照常推进到 done。
- 新增 `POST /api/tasks/:id/continue`：任务处于 waiting → 恢复执行下一步（重新入队/触发下一步处理）；非 waiting → 400。continue 后任务状态回 running。
- 任务状态枚举确认：现有 status 取值（queued/running/done/failed/cancelled）→ 新增 `waiting`（半自动暂停点）。GET /api/tasks 与详情返回 status 含 waiting，前端据此显示「继续」按钮。
- 兼容：无 run_mode / run_mode=auto 的任务行为与现在完全一致。

### 2. 后端：节点内容编辑 + 回退重跑
- 复用/扩展现有 `POST /api/tasks/:id/rerun`（已支持 from step 清空下游产物+资产+step_results 后重跑）。确认它支持任意 step（1-9）与 storyboard 重排；扩展为通用「从 N 步重跑」。
- 新增节点编辑端点 `PUT /api/tasks/:id/node`，body `{step, content}`，step 取用户节点号（1-7 见映射），按节点写入并触发下游重跑：
  - 节点2 文案：更新 `task.config.source_text`（或文案产物）→ 清空 S3+ 产物 → rerun from S3（分镜要重新拆）。
  - 节点3 分镜：更新 storyboard.json（分镜描述列表）→ 清空 S4+ → rerun from S4。
  - 节点5 配音字幕：`{voice?, subtitle?}` 更新 config.tts.voice / 字幕文本 → 清空 S5+ → rerun from S5（配音+字幕重生成）或仅合成重跑（若只改字幕且配音未变，rerun from S6，字幕 burn 在合成）。
  - 节点4/6(i2v) 重新生成单镜/单片段：`{shot_index?}` → 只重跑该镜的 S4/S7(i2v) 子任务 → 再合成。若实现复杂，可降级为整镜 S4+ 重跑（先做整体重跑，单镜粒度留 TODO）。
- 响应返回 `{ok, message: "后续 N 步将重新生成"}`；实际清空+重跑在确认后由前端调用 rerun 触发（两段式：PUT 保存 → 前端确认提示 → POST rerun）。**或** PUT 直接执行清空+rerun 并返回结果——实现上选更稳妥的（建议两段式，提示由前端弹）。
- 回退语义：用户点左侧已完成节点修改 → 保存 → 前端提示「后续步骤内容将被清空并重新生成」→ 确认 → 调 rerun from 该节点下游第一步。破局同款交互。

### 3. 前端：任务详情页重构为左右向导（src/app/app/projects/[id]/page.tsx）
- **左侧节点条**（固定宽 ~200px）：按任务 config.synthesis 渲染节点列表（static 6 节点 / i2v 7 节点），每节点：编号+名称+状态徽标（done 绿 / running 蓝 / waiting 黄（半自动暂停）/ stale 红（下游被修改需重跑）/ pending 灰）；当前节点高亮；点击已完成节点回看/编辑（回退）。
- **右侧内容区**：按当前节点渲染内容：
  - 节点1：商品/主题解析信息展示（只读卡片）。
  - 节点2：文案 textarea + 「Save & regenerate downstream」按钮。
  - 节点3：分镜列表（每镜：描述输入框 + 缩略图占位）+ 保存（保存后提示重跑 S4+）。
  - 节点4：分镜图网格（缩略图，点大图）+ 单镜「Regenerate」按钮（调节点重生成）。
  - 节点5：音色下拉（启用 tts 模型，来自 /api/model-configs?class=tts）+ 配音播放列表 + 字幕文本编辑 + 保存。
  - 节点6(i2v)：片段视频列表（播放）+ 单片段「Regenerate」。
  - 节点6/7(合成)：final.mp4 预览（video 标签）+ 下载（export presigned）。
- **右上角执行方式**：半自动/全自动 切换（运行前可选；运行中显示当前模式）。半自动模式下每步完成 → 节点变 waiting → 右侧出现「Continue to next step」按钮（POST /api/tasks/:id/continue）。
- **状态轮询**：现有轮询逻辑扩展识别 waiting 状态（停止自动推进 UI，显示继续按钮）与 stale（提示重跑）。
- 创建任务入口（/app 工作台或创建表单）加「Run mode: Semi-auto / Auto」选择，写入 config.run_mode。
- 深色/浅色双主题跟随现有；英文文案（全站保持）。

### 4. 验证（实际执行 + 证据）
1. 构建 `npm run build` 无错；7 服务 healthy 无孤儿。
2. **半自动端到端**：创建任务 run_mode=semi（static）→ 轮询：S1 done 后任务 status=waiting → POST continue → S2 跑 → 再 waiting → … 直到全部 done（记录每次 waiting/continue 的步骤序列）。
3. **全自动回归**：run_mode=auto（缺省）任务一次跑完 S1-S9 done（与现状一致）。
4. **节点编辑+重跑**：半自动/全自动任务上编辑节点2 文案 → 确认 → rerun from S3 → S3+ 重跑，S1/S2 产物保留；编辑节点5 音色 → rerun from S5 → 配音重生成；验证下游产物清空（旧 shots/audio 被移除）。
5. **i2v 节点**：i2v 任务左侧 7 节点（含「图生视频片段」）；static 任务左侧 6 节点（无该节点）。真实 i2v 任务跑通（可复用已有 Kling 测试，若耗时则至少验证节点渲染+等待已有 i2v 任务）。
6. **老任务兼容**：无 run_mode 的旧 done 任务详情页正常渲染（auto 语义），不报错。
7. 密钥安全：日志无 key 明文；7 服务健康。

## 输出格式
- 改动清单（文件 + 一句话）
- 验证证据（7 项逐一）
- 遗留事项

## 注意事项
- 后端流水线步骤 S1-S9 内部结构**不改**；只加 run_mode 暂停逻辑 + 节点编辑/rerun 端点。前端节点是展示层映射。
- R1 key 安全；老任务/老接口兼容；不引入新依赖。
- 不 `docker compose down`；api DNS 不改。
- 单镜重生成（S4/i2v 单镜粒度）如复杂可留 TODO，先保证整体重跑链路。
