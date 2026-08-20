# PIPELINE_TASK_37: L3 分镜改造 —— 学 ArcReel：时长档位化 + segment_break 场景切换标记 + 节奏规则注入

## 背景（2026-08-14 用户反馈 + 调研）

用户对分镜流程不满意（"分镜的这个流程我总感觉不太好"），要求学习 GitHub 开源项目。已调研：
- **MoneyPrinterTurbo**（103K★）：无分镜概念（素材按音频时长铺满），方向不对。
- **ArcReel**（自托管 AI 短剧工作台）：**最对口**。分镜两段式（step1 内容层逐字原文 + step2 视觉层按 segment_id 对齐），核心设计：
  1. **时长档位化**：`supported_durations` 白名单（如 [3,5,8,10,12,15,20]），LLM 按朗读语速估算字数就近取档位，不再自由发挥/写死。
  2. **segment_break 标记**：只在真正场景切换点（时间跳跃/空间转换/情节转折）标 true，同一连续场景内 false，不滥用。承接句自然归入上一镜。
  3. **体裁节奏规则**（narration 说书模式）：
     - 首段画面（朗读前 ~4s）服务钩子：强冲击/悬念/危机，拒绝平铺开场；
     - 末段画面服务卡点留悬（特写人物/关键物件/极端表情），shot_type 倾向 Close-up/Extreme Close-up。
  4. **novel_text 逐字保留原文**（配音与透传真相源），step2 只产 image_prompt/video_prompt 不再重出内容。

我们 L3 现状（v2 确定性拆镜，已修承接词并入）：
- `duration_sec` 写死 5s（无下游消费，可安全改造）。
- 无 segment_break 概念。
- LLM 标题/画面 prompt 无节奏约束（平铺直叙）。
- 承接词表有漏洞（"可"字开头句子没覆盖）。

## 修改点（只改 `api/src/pipeline/steps/l3.ts`）

### 1. 时长档位化
- 定义档位表 `DURATION_SLOTS = [3, 5, 8, 10, 12, 15, 20]`（秒）。
- 每镜按口播字数估算朗读时长：`est = script.length / 4.5`（中文 ~4.5 字/秒），就近取档位（不小于 3s）。上限 20s。
- 写入 `shot.duration_sec`（替换写死的 5）。

### 2. segment_break 场景切换标记
- 确定性规则：每镜口播文本若含时间跳跃词（`第二天|次日|几天后|几个月后|多年后|不久|后来|回到|从此|那天|那年`）或地点转换词（`到了|来到|回到|走向|赶到|离开|抵达|走进`）→ `segment_break: true`；否则 `false`。
- 不滥用：连续镜不重复标（若上一镜已 true 且本镜无强切换词则 false）。

### 3. 节奏规则注入 LLM prompt（标题+画面提示词）
- 在 sysPrompt 头部追加节奏规则（中英双语）：
  - 首镜：画面必须服务钩子（强冲击/悬念/危机），拒绝平铺介绍式开场；
  - 末镜：画面倾向特写（Close-up），服务卡点留悬；
  - 中段每 ~15s 一个情绪转折点（画面权重/景别变化呈现）。

### 4. 承接词表补漏
- 在 `continuationStart` 正则补 `可`（"可一场赤壁之战…" 这类"可"字开头承接句）。

## 验证（必须全部通过）

1. `cd api && npm run build` 通过。
2. 重跑 L3（POST /api/tasks/:id/rerun {"from_step":3}，任务 67e9607d-fe0f-4245-ac52-5c8739a88c29，cookie avs-test-1786603871，Content-Type: application/json）→ 读 MinIO `tasks/<id>/storyboard.json`：
   - 镜数仍在 15-18；
   - 总字数守恒（各镜 script 拼接 == L2 口播原文）；
   - 每镜 `duration_sec` 取自档位表、随字数递增（150字镜 > 44字镜）；
   - `segment_break` 有 true 有 false，且不含承接词开头的镜（"可"字已并入）；
   - 首镜画面 prompt 有钩子语义（悬念/冲击类词）。
3. git commit：`feat(api): L3 storyboard learns ArcReel — duration slots + segment_break + pacing rules in shot prompts`。不要 push。

## 硬性要求

只改 `api/src/pipeline/steps/l3.ts`；不重构其他步骤；不 push；不 docker compose down；不改任务卡外文件。完成后 read_file 自证 + 报告验证数据（镜数/字数守恒/duration 档位分布/segment_break 分布/首镜 prompt 摘要）。
