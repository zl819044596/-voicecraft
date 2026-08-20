# PIPELINE_TASK_11 — 项目页（流程向导）多节点增强

工作目录：`/Volumes/Data/GitHub/ai-video-studio`
技术栈：Next.js 15 App Router + React + Tailwind v4（深色紫黑主题）+ Express API + Postgres + MinIO + Redis。
后端：`api/src/`（routes/tasks.js 含向导 node 模型与 rerun；steps/s1..s9.js 流水线；lib.js 工具；providers/ 含 wingray LLM/TTS/图像/I2V）。
前端向导页：`src/app/app/projects/[id]/page.tsx`（1398 行，Task 8 向导：左节点+右内容，半自动/全自动，node 映射）。
i18n：`src/i18n/{zh,en}.json`。R1 红线：密钥加密，前端仅 masked。

## 现有向导节点模型（Task 8，勿破坏）
用户节点编号 → 后端步骤（tasks.js NODE_MODEL）：
- Node 1 选题 → S1（rerunFrom 1）
- Node 2 文案生成 → S2（rerunFrom 3，editStep 2，编辑更新 config.source_text）
- Node 3 分镜拆解 → S3（rerunFrom 4，editStep 3，编辑更新 storyboard.json）
- Node 4 逐镜生图 → S4（rerunFrom 4）
- Node 5 配音+字幕 → S5（rerunFrom 5，editStep 5）
- Node 6 合成(static) → S7 / Node 7 合成(i2v) → S7
现有端点：GET /api/tasks/:id（详情含 task/steps/assets/export/cost/storyboard）、PUT /api/tasks/:id/node（持久化节点编辑）、POST /api/tasks/:id/rerun（有前置步骤 guard）、POST /api/tasks/:id/continue（半自动继续）、assets 上传（uploadShotAsset）。
项目详情 API：GET /api/projects/:id 返回项目+task 详情。

## 需求（用户确认）

### A. 项目页去掉三块（前端）
- 移除向导页顶部的：合成模式选择、模型选择、预估 API 成本。这些已移入快速生成页/不需要。数据层保留，仅 UI 移除；/api/projects/:id 与 /api/tasks/:id 的 cost 字段可保留返回但前端不展示。

### B. Node 2 文案生成增强
- 每个文案方案节点提供【重新生成】按钮 → 弹窗两个选项：
  - 【直接生成】按原要求重新调 LLM 生成
  - 【按要求生成】输入新要求 → 带着要求重新生成
- 【保存】功能：生成结果可**保存多个版本**（后端存 script 版本列表），从版本列表**选一个**作为最终文案（即当前采用版本）。

### C. Node 3 分镜拆解增强
- 每个分镜要有**标题**。
- 【重新拆分】功能：重新调 LLM 拆分（可带新要求）。
- **每个分镜头**可【重新生成】：直接生成 / 按要求生成（对单个镜头重生成）。
- 分镜内容字段：口播文本、字幕文本、生图提示词、出图比例（下拉，如 1:1/16:9/9:16/4:3/3:4）。
- 分镜内容**编辑后可保存**。

### D. Node 4 逐镜生图增强
- 【全部重新生成】/【单个生成】（每个镜头：直接生成 / 按要求生成）。
- 内容**可修改保存**。
- 每个分镜展示：分镜头标题、图片（**点击放大**，lightbox）、生图提示词。
- **上传参考图**（用户可上传图作为该镜头生图参考，存 MinIO）。
- **设置出图比例**。
- **候选图片列表**：每次生成为该镜头保留多张候选图，**其中一个标记为默认（当前采用）**，可切换。

### E. Node 5 配音+字幕增强
- 【全部重新生成】。
- **BGM 配置**（背景音乐：上传/选择）。
- **配音角色设置**（音色）。
- **字幕节奏设置**：字幕字号、单行最多字数等。
- **整合的试听与校对**（配音+字幕整体试听）。
- **每个分镜标题对应口播文案和语音**。
- **语音可上传替换**（也可重新生成）。

### F. Node 7 i2v 视频节点
- 沿用生图节点同款布局结构（重新生成、候选、修改保存等，按需适配视频）。

## 实现指引（后端）
1. 数据模型：
   - 文案版本：可为 tasks 增加 `script_versions jsonb`（数组：{id, text, created_at, is_selected}）或独立表；选中的版本写回最终采用文本。
   - 分镜候选图：`assets` 表已有 type；生图候选可在 assets 加 type='shot_candidate' 或扩展 storyboard 记录候选图 key 列表 + 默认标记。
   - 配音/字幕设置：扩展 tasks.config：`config.subtitle = {font_size, max_chars_per_line}`、`config.voice`、`config.bgm_key`。
   - 上传参考图：复用 assets 上传，存 MinIO。
2. 新端点（tasks.js 或新 route）：
   - POST /api/tasks/:id/regenerate — body { node, scope: 'all'|'single', index?, mode: 'direct'|'with-prompt', prompt?, field? }。按 scope 重新生成文案/分镜/单镜头生图/配音，支持带要求。
   - 保存版本/选版本：POST /api/tasks/:id/script/versions（save）、POST /api/tasks/:id/script/select（选版本）。
   - 候选图：POST /api/tasks/:id/shots/:index/candidates（记录候选+默认）、POST /api/tasks/:id/shots/:index/select-candidate。
   - 上传参考图/语音替换：复用/扩展 assets 上传。
   - 字幕/配音设置保存：PUT /api/tasks/:id/node 扩展或新端点，写 config。
3. 复用现有：rerun guard、nodeToRerunFrom、providers（LLM chatCompletion 已含重试）、wingray 图像/I2V/TTS、TTS 试听（/api/model-configs/preview）。
4. 半自动/全自动模式保持；编辑后下游清空重跑逻辑沿用。

## 实现指引（前端向导页）
- 每个节点（Node2..Node7）右侧内容区按上述需求增强：重新生成（弹窗：直接/按要求）、保存/选版本、候选列表（默认标记）、上传（参考图/语音/BGM）、编辑保存、图片点击放大（lightbox）、下拉（出图比例）。
- 移除合成模式/模型/预估成本 UI。
- i18n 补齐。
- React #310：hooks 无条件执行。
- 深色紫黑主题一致。

## 硬性约束
- R1：密钥无明文。生成/重生成走服务端 providers，密钥服务端解密。
- 不破坏现有：/app、/app/projects、/app/prompts、/app/models、/app/settings、快速生成、提示词中心。
- 7 服务 Docker 容器最终 healthy，无孤儿进程。
- React #310 无崩溃（headless 验证 ERRORS:0）。

## 完成标准
1. 向导页三块（合成模式/模型/预估成本）已移除。
2. Node2 文案：重新生成（直接/按要求）+ 多版本保存选择可用。
3. Node3 分镜：每镜标题、重新拆分、单镜头重新生成（直接/按要求）、口播/字幕/提示词/出图比例、编辑保存。
4. Node4 生图：全部/单个重新生成（直接/按要求）、修改保存、图片放大、上传参考图、出图比例、候选列表（默认）。
5. Node5 配音+字幕：全部重新生成、BGM、配音角色、字幕节奏（字号/单行字数）、整合试听校对、分镜→口播→语音、语音上传替换。
6. Node7 i2v 同生图布局。
7. 回归：其他页面正常、无崩溃、7 服务 healthy。
8. 全部提交并 push。

## 执行
后台执行，完成后汇报：改动文件清单、验证结果、commit hash。严格遵守 R1。任务较大，按 A→B→C→D→E→F 顺序逐步实现并自测。
