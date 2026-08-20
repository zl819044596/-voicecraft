# PIPELINE_TASK_41 — 平台重构：砍 i2v + 6 步流程收敛（阶段①后端）

## 背景

用户 2026-08-17 定案：ai-video-studio 与 dealreel-app（MoneyPrinterTurbo 定制版）本质是同一个产品（AI 短视频生成工具站）。现在：

1. **砍掉 i2v 动态视频生成**（L5 生成视频节点、Kling/Wan 图生视频、i2v 分支），只保留静态图流程：AI 生图 + 配音 + 字幕 + 合成
2. 核心流水线已完成，不再大改，做收敛
3. 平台重新设计为海外工具站（英文为主 + 中文支持）—— 那是阶段②，本次只做后端收敛

## 本次范围（阶段①：后端流程收敛）

目标：把 i2v 从后端移除，流水线收敛为 **6 步**：

```
1. 文案（选题/文案生成，三模式 paste/rewrite/create）
2. 分镜拆解（L3 storyboard）
3. 生图（L4 逐镜生图）
4. 配音（L6 TTS）
5. 字幕（L7 SRT）
6. 合成导出（L8 compose + L9 复检 + L10 导出）
```

## 任务清单

### A. 移除 i2v 相关代码
1. `api/src/pipeline/steps/` 删除 gen-video 步骤（i2v 独立生成视频步骤），或标记不再使用
2. `api/src/queue.js`：I2V_STEP_RUNNERS 删除；STATIC_STEP_RUNNERS 保留并确认 6 步映射正确
3. `api/src/pipeline/lib.js`：`totalStepsFor` 收敛为固定 6 步（不再分 static/i2v）
4. `api/src/providers/runtime.ts`：i2v 相关（wingrayI2V 等）可保留函数但不再被流水线调用；**不要删 provider 代码**（模型配置页可能还要显示）
5. `synthesis='i2v'` 处理：前端不再传 i2v，后端收到 i2v 时回退 static（或 422 提示已下线）
6. `tasks.ts` / `rerun.ts` 里 i2v 相关端点（clips/regenerate 等）：保留路由但返回 410 或提示已下线（避免前端 404 难看）

### B. 6 步流程收敛
1. 确认 queue STEPS 顺序：1 文案 → 2 分镜 → 3 生图 → 4 配音 → 5 字幕 → 6 合成
   - 注意现有编号：L1 选题/L1.5 合规/L2 文案/L3 分镜/L4 生图/L6 配音/L7 字幕/L8 合成/L9 复检/L10 导出
   - **不要强行改步骤编号**（DB 已有历史数据按编号存），只调整 queue 映射/跳步逻辑：
     - L1.5 合规：保留（托管专属）
     - L5 gen-video：跳过（不再生成动态视频）
     - 步骤展示给前端的 steps 数组只暴露 6 步
2. `GET /api/tasks/:id` 的 steps 响应：只返回收敛后的 6 步（或 9 步但 L5 标记 skipped/removed——**以用户确认的 6 节点为准，前端显示 6 节点**）
3. 确认 compose（L8）对静态图流程：每镜 shot 图 + vo 音频 + 字幕 → final.mp4（Ken Burns 运镜已有）

### C. 积分/成本
1. `api/src/pipeline/cost.ts`：i2v 单价保留或移除均可（不再被用）；确认静态流程成本估算正确（llm+image+tts）
2. 前端不再显示 i2v 相关成本

## 必须遵守的坑（都踩过）

1. **开发工具铁律**：本次用 Claude Code（`claude -p`），禁用 kimi code
2. **分阶段 git commit**：每完成一块（A/B/C）单独 commit，可回滚
3. **git add 仅限本任务路径**，禁 `git add -A`（仓库有未提交的 PIPELINE_TASK_40.md 和 app/ 前端，别动）
4. **tasks 表没有 error 列**，孤儿错误写 config jsonb
5. **不要改 DB schema**（无需删表，代码层收敛即可）
6. **前端在 app/（Vite）不在 src/（Next）**——本次是后端任务，app/ 前端阶段②再动
7. 改完 api 代码必须 `docker compose up -d --build api`（background=true）重建才生效；改完 curl 实测才算验收

## 验证步骤

1. `npx tsc --noEmit`（api 目录）绿
2. `docker compose up -d --build api` 重建成功
3. `GET /api/health/full` 200
4. 创建一个 static 任务跑通：文案 → 分镜 → 生图 → 配音 → 字幕 → 合成 → 导出（真实验证，不用 mock）
5. 确认 tasks 响应 steps 只含 6 步（或 L5 标记 removed）
6. 尝试创建 i2v 任务被正确拒绝/回退

## 输出

- 提交清单（每个 commit 的 hash + 说明）
- 验证结果（curl 实测输出）
- 遗留事项（如果 i2v provider 代码保留，说明影响）
