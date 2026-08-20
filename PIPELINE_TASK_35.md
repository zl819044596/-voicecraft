# PIPELINE_TASK_35: L3 分镜拆解注入用户配置的 storyboard 提示词正文

## 背景

- 用户反馈（2026-08-14）：配音修复后正常，但分镜拆解「好像也没有用到提示词」。
- 现状（已确认）：
  - `api/src/pipeline/steps/l3.ts` L3 v2 为确定性拆镜：口播按自然句界硬切到目标镜头数（15-18），LLM 只为每镜生成标题+画面提示词（sysPrompt 硬编码，:133-138）。
  - 用户配置的 `prompts type='storyboard'` 模板（如「默认分镜拆解」，id 44e4ad98）在 l3.ts:69-79 被读取为 `storyboardOverride`，但**只用于**：
    1. :81-82 让 `presetInstruction` 让位（preset 指令置空）
    2. :90-93 提取镜头数范围 `shotRange`（正则 `(\d+)\s*[-–—~至]\s*(\d+)` → 15-18）
  - 模板完整正文（逐字守恒、切分原则、单行清理、守恒检查等）**从未注入任何 LLM 调用** → 用户配置的提示词对结果几乎零影响。
- 目标：把 storyboardOverride 正文真正注入 L3 的 LLM 调用（标题+画面提示词生成），让用户配置的分镜拆解提示词生效；**保持 v2 确定性拆镜不变**（口播逐字一致是硬约束，绝不能退回 LLM 重写口播）。

## 修改点（单文件：api/src/pipeline/steps/l3.ts）

在 :133-138 的 chatJson sysPrompt 中注入 storyboardOverride。具体：

1. 保留现有 sysPrompt 主体（标题+画面提示词硬性要求不变）。
2. sysPrompt 开头拼接用户分镜拆解规则（若存在）：
   ```
   【用户分镜拆解规则】
   <storyboardOverride 全文>
   ——— 以上为用户配置的分镜拆解规则，仅作切分/输出约束参考；口播文本必须逐字来自输入，禁止改写。生成标题和画面提示词时仍须遵守下方硬性要求 ———
   ```
3. 注意模板正文含「只输出镜头序号、标题和口播文本，不输出画面提示」等旧语义指令——注入时在规则后**显式追加一行覆盖**：「但你（LLM）当前任务仅生成标题与画面提示词，不重新拆镜；规则中与标题/画面提示词无关的拆镜指令自动满足（拆镜由系统确定性完成）。」
4. `console.warn('[l3] v2 deterministic split: ...')` 行追加 storyboardOverride 是否生效的标记（如 `storyboardRule=used|missing`）。

## 验证（必须全部通过）

1. `cd api && npm run build` 通过。
2. `docker compose up -d --build api` 重建（background=true；不要 docker compose down）。
3. 行为验证：重跑 L3（rerun from_step=3）后，日志出现 `storyboardRule=used`；分镜 shot_count 仍在 15-18；每镜 script 与 L2 口播逐字一致（抽样比对）；标题正常生成。
4. 无 storyboard 模板的用户/任务不受影响（storyboardRule=missing，走原逻辑）。
5. git commit（只 add l3.ts）：`feat(api): L3 injects user storyboard prompt body into title/prompt gen (rule context, split stays deterministic)`。
6. 不要 push（听潮统一 push）；不要改任务卡之外的文件。

## 输出格式

完成后 read_file 自证修改已落盘；报告：修改文件、build 输出、容器重建结果、重跑 L3 日志关键行（storyboardRule=used、shot_count、逐字一致性抽查）、commit hash。
