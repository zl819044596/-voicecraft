# PIPELINE_TASK_32: L3 分镜后生成视频标题（prompts 表 title 模板）

## 背景

- 用户 9 步定义（2026-08-13）：L3 分镜列表标题通过标题生成。
- `prompts` 表已有 `title` 类型模板（用户已加数据）：「从已确认或生成的完整口播文案中提炼一个适合短视频发布和剪映草稿命名的视频标题。标题需要 8-22 个中文字符，清晰表达内容钩子或核心价值，不要使用夸大承诺、绝对化词汇、无意义符号和生硬商品堆砌。如果用户或文案已有合适标题，可以保留并轻微优化。」
- 目标：L3 分镜生成**成功后**，用 title 模板 + 完整文案生成视频标题，写入 `storyboard.json` 的 `title` 字段 + L3 payload 返回。
- 约束：**title 生成失败/模板缺失/分镜 degraded 时直接跳过，绝不降级 L3、不阻塞流程**（title 是锦上添花，非关键路径）。

## 修改点（单文件：api/src/pipeline/steps/l3.ts）

在 L3 分镜 `chatJson` 成功（返回 `shots` 且非 degraded）后追加 title 生成：

1. **查模板**：从 `prompts` 表读 `type='title'` 且属于任务 owner（`user_id = task.owner_id`，无则任意 title 模板）的 `body`。模板缺失 → 跳过（return 正常 payload，不打 degraded）。
2. **查文案**：读 `tasks/<id>/script.md`（L2 产物，MinIO，复用现有 readScript/lib 方法；读不到则用 storyboard.shots[].voiceover 拼接前 2000 字兜底）。
3. **生成**：复用本步已解析的 provider（`resolveProviderFor(pg, pool, task, 'llm')`）+ 现有 `chatJson` 封装（参考本文件顶部已 import 的调用方式；无则从 l1.ts 复刻模式），params `{ temperature: 0.5, maxTokens: 200 }`，schemaKey 不传（自由文本）。
   - 系统提示：简洁中文说明「你是短视频标题专家。根据文案生成一个 8-22 字的视频标题，只输出标题本身，不要引号、不要解释。」
   - 用户提示：`<title 模板 body>\n\n文案：\n<文案前 2000 字>`
4. **落盘**：
   - `storyboard.json` 加 `title` 字段（读→改→写回 MinIO，复用现有读写方法；**不要把 title 塞进每个 shot**，只加顶层 `title`）
   - payload 增加 `title` 字段返回
5. **容错**：整个 title 生成包在 try/catch 里，任何失败 `console.warn('[l3] title gen skipped: ...')` 后继续返回正常分镜 payload（degraded 保持 false，不追加 warnings）。

## 验证（必须全部通过）

1. `cd api && npm run build` 通过。
2. `docker compose up -d --build api` 重建 + health ok。
3. 行为验证（可选项，容器内探针）：真实任务重跑 L3 后，`storyboard.json` 顶层有 `title`（8-22 字）；L3 payload 有 title。
4. git 提交：`git add` 仅限 `api/src/pipeline/steps/l3.ts`，commit message 如 `feat(api): generate video title via prompts title template after L3 storyboard`。

## 输出格式

完成后用 read_file 自证修改已落盘，报告：修改文件路径、build 输出、容器重建结果、commit hash。
