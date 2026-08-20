# PIPELINE_TASK_22: LLM 调用超时放宽 60s→120s（长输出重试风暴）

## 背景与根因（听潮已定位，api_cost_log 实证）

- 用户反馈：任务每步执行很久（L1=12s / L2=121s / L3=375s）。
- 证据（`api_cost_log` task=f96f81bc-bb99-46d8-b13b-6fd534afeb8a）：
  - L1 6 次调用全成功（快）。
  - L2 3 次调用，中间有 60s 间隔（一次超时重试）。
  - L3 375s 内**仅 1 条成功记录（02:37:52 降级输出 1331 units）**——前 6 分钟全是 60s 超时 × 6 次重试，最后 degrade 兜底（`shot_count=2, degraded=true`）。
- 机制：`api/src/providers/runtime.ts` L61 `LLM_TIMEOUT_MS = 60_000`；wingray `DeepSeek-V4-Flash-0731` 生成长输出（L2 文案 ~9.4K units）经常 >60s → `AbortSignal.timeout` 触发 → `chatCompletion` 重试 ≤3（L538-547）→ `chatJson` 三级阶梯（llm.ts）→ 单步最多 ~6×60s = 6 分钟。
- 另一层根因（已 DB 直改，无需改码）：用户任务用的 model_configs id=`1ee0d104-b5bb-41e3-9431-a8d583ea60a3` model=`DeepSeek-V4-Flash`（**无日期后缀**）→ wingray 路由不稳定/慢；已 UPDATE 为 `DeepSeek-V4-Flash-0731`（与代码默认 LLM_MODEL 一致）。

## 修改点（仅 api/src/providers/runtime.ts）

L61：`const LLM_TIMEOUT_MS = 60_000;` → `const LLM_TIMEOUT_MS = 120_000;`

## 验证（必须全部通过）

1. `cd api && npm run build`（或项目统一 build 脚本）通过，无 TS 错误。
2. `docker compose up -d api` 重建 api 容器，确认健康（`curl https://localhost/api/health -k --noproxy '*'` 或 docker ps HEALTHY）。
3. 行为说明：
   - 长输出（文案/分镜 JSON）生成给足 120s，不再 60s 断头 → 大幅减少重试风暴。
   - 单步最坏耗时从 ~6min 降到 ~3min（3 次 120s），且正常情况下不再触发重试。
4. git 提交：`git add` 仅限 `api/src/providers/runtime.ts`，commit message 如 `fix(api): raise llm timeout 60s to 120s for long outputs`.

## 输出格式

完成后用 read_file 自证修改已落盘，并报告：
- 修改的文件绝对路径
- build 真实输出摘要
- git commit hash
