# PIPELINE_TASK_46：分镜模板 preset（通用/电商/故事）真正接入 L3/L4

状态：待执行
日期：2026-08-19
执行方式：Claude Code 后台派工（`/opt/homebrew/bin/claude -p`）
复核：听潮独立复核（Claude Code 自报 ≠ 事实，必须看代码 + 真实日志）

## 背景（已查实）

前端 QuickGenerate.tsx 的「分镜模板」三档（通用 general / 电商 ecommerce / 故事 story）
写入 `task.config.synthesis.storyboard_preset`，但**当前是 UI 摆设**：

1. `api/src/pipeline/steps/l3.ts:71-73` 读到 preset ✓
2. `l3.ts:90-95`：`storyboardOverride ? '' : renderPrompt(PRESET_INSTRUCTION[preset])` ——
   **全局默认 storyboard 模板存在时（线上所有任务都命中，storyboardRule=used），preset 指令被丢弃**
3. `l3.ts:237` storyboard.json 写入 `preset` 字段，但 **L4 完全不读**（l4.ts 只看 aspect + style 配置）
4. 结果：选「电商」和选「通用」产出完全一样，唯一区别是设置摘要文字

## 需求

### 1. L3：preset 指令与全局默认模板并存（api/src/pipeline/steps/l3.ts）

- `storyboardOverride` 存在时，不再丢弃 preset 指令——把
  `PRESET_INSTRUCTION_ZH[preset]` / `PRESET_INSTRUCTION_EN[preset]` 也并入 LLM sysPrompt
  （标题 + 画面提示词生成时按 preset 调风格：general=信息流口播通用画面 / ecommerce=商品特写镜头 / story=叙事连贯）
- override 与 preset 指令不冲突：override 是拆镜/输出约束，preset 是画面风格方向
- **保持 v2 确定性拆镜不变，口播逐字来自输入，绝不改写**
- 节奏规则（pacingRules）仍置于 sysPrompt 最前

### 2. L4：画面提示词补全读 preset（api/src/pipeline/steps/l4.ts）

- 画面提示词补全（`shotsMissingPrompt` 分支）时，读 storyboard.preset，
  注入对应风格指令（与 stylePrompt 并列，preset 在后/风格指令在前）
- 不用 LLM 时（prompt 已由 L3 生成）无需处理——L3 已带 preset 指令

### 3. 参考素材

- `api/src/pipeline/prompts.ts` 已有 `PRESET_INSTRUCTION_ZH` / `PRESET_INSTRUCTION_EN`
  （general/ecommerce/story 三档文本）——直接复用，不要新写文本
- 若文本需要增强（e.g. 电商=商品特写/白底/产品居中），可微调但保持中英两套

## 验收标准（听潮独立复核）

1. **代码审查**：l3.ts / l4.ts diff，preset 注入逻辑存在、override 与 preset 并存不冲突
2. **真实任务验证**：本地 colima 跑任务（`DOCKER_CONTEXT=colima`），
   general / ecommerce / story 三种 preset 各跑一次（可 mock LLM 之外的链路），
   从 VPS/本地 api 容器日志确认：
   - L3 日志含 preset 生效标记（或 sysPrompt 含 PRESET_INSTRUCTION 文本）
   - 不同 preset 下画面提示词风格有差异
3. 口播文本逐字守恒（L2 → L3 不改写）

## 约束

- 不动 prompts 表（8 条全局默认模板）、不动前端、不动 ASPECTS
- 生产环境 = colima（显式 `DOCKER_CONTEXT=colima`）
- 不提交 git（本地改动保留，等用户决定 commit）
- 完成后输出验证报告（含真实日志证据）
