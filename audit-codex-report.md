# TASK_46/47/48 工作区代码审核报告

审核日期：2026-08-19  
审核范围：未提交工作区 diff 中与 TASK_46、TASK_47、TASK_48 相关的流水线与 render 改动。未修改业务代码。

## 总览

- **P0：0 项**
- **P1：3 项**
- **P2：3 项**
- TASK_46 的主路径实现基本完整：L3 在存在全局 storyboard override 时仍注入 preset，L4 的缺 prompt 补全也读取 preset；电商 preset 文本与「禁文字卡」约束已对齐。
- TASK_47 的标准 L3 → L4 路径实现了主角抽取、持久化、L4 确定性补全、风格后缀和 wingray `parameters.seed` 透传；但半自动重拆/单镜重生路径没有同步，且 L4 会在补 prompt 时覆盖丢失新顶层字段。
- TASK_48 的字幕烧录主路径已具备动态超时、真实错误摘要和可见 warning；但“所有 ffmpeg 调用动态超时”的要求没有完全落地。

## P0（必须修）

无。

## P1（应该修）

### 1. 半自动重拆与单镜重生绕过 TASK_47 的统一性保障

- **位置：** `api/src/pipeline/rerun.ts:390`、`api/src/pipeline/rerun.ts:421`、`api/src/pipeline/rerun.ts:456`
- **问题描述：** `regenerateStoryboard()` 未调用主角提取，也未把 `protagonist` 写入 storyboard；`regenerateShotImage()` 直接使用原 prompt 调 `callImage()`，未追加 `STYLE_SUFFIX_ZH/EN`、未确定性补主角描述、也未传 `seed`。这两条路径与 `l3.ts` / `l4.ts` 的新逻辑完全分叉。
- **为什么：** 用户在编辑器中“重拆分镜”后会丢失人物锚定；单镜重生也会以随机 seed 和无风格尾缀生成，导致被重生的一镜与其余镜头人物、色调、构图倾向不一致。该问题直接违反 TASK_47 对 rerun/半自动路径一致性的隐含完整性要求。
- **修复建议：** 提取共享 helper（如 `storyboardStyleContext()`、`buildImagePrompt()`、`seedFromTaskId()`）供 L3/L4/rerun 调用。重拆时复用主角提取和逐镜前置补全，并写入顶层 `protagonist`；单镜重生读取原始 storyboard 的 `preset`/`protagonist`，追加同一风格后缀、负面词策略并传入同一任务 seed。

### 2. L4 补全 prompt 时会覆盖删除 `preset` 和 `protagonist` 顶层字段

- **位置：** `api/src/pipeline/steps/l4.ts:41`、`api/src/pipeline/steps/l4.ts:52`、`api/src/pipeline/steps/l4.ts:128`
- **问题描述：** `readStoryboard()` 只归一化返回 `shots` 与 `generated_at`；L4 虽额外读取原始 JSON 取得 `preset`、`protagonist`，但 prompt 补全成功后写回的是 `{ ...storyboard, shots: nextShots }`。因此写回文件不包含刚读取的 `preset`/`protagonist`。
- **为什么：** 当前这一次 L4 调用仍持有本地变量，表面上能完成生图；但后续 L4 重跑、单镜重生及导出获得的 storyboard 已失去 TASK_46/47 元数据。下一次 L4 会默认 `general`，不能再做主角锚定，属于持久化契约被破坏。
- **修复建议：** 只读取一次原始 storyboard 并在其基础上更新 shots，或在回写对象显式保留 `preset`、`protagonist`（以及其他未知顶层字段）。更稳妥的方案是扩展 `readStoryboard()` 的返回类型，使元数据不会在归一化读写中静默丢失。

### 3. TASK_48 的“所有 ffmpeg 调用动态超时”尚未完整实现

- **位置：** `render/worker/index.js:291`、`render/worker/index.js:449`、`render/worker/index.js:598`
- **问题描述：** `mixBgm()`、静态 compose 的 concat `-c copy`、i2v compose 的 concat `-c copy` 仍调用默认 `FFMPEG_TIMEOUT`（300 秒）。其余主要重编码路径已使用 `encodeTimeoutFor()`。
- **为什么：** TASK_48 明确要求烧字幕“及所有 ffmpeg 调用”按输入时长/工作量动态设置超时。虽然 `-c copy` 通常很快，但 BGM 混音仍会处理整段音频；在慢盘、异常输入或长片时仍可能被 5 分钟误杀，并且实现与需求/注释不一致。
- **修复建议：** 在 BGM 混音前探测 `videoFile` 时长并传 `encodeTimeoutFor(duration)`；concat 使用已知累计时长或通过 `probeDuration` 获取时长后显式传 timeout。纯 `ffprobe` 的 15 秒上限可保持独立，因为它不是编码工作量。

## P2（建议）

### 1. 主角提取的正则兜底几乎无法识别常见 fenced JSON，且反转义不完整

- **位置：** `api/src/pipeline/steps/l3.ts:52`、`api/src/pipeline/steps/l3.ts:54`
- **问题描述：** 兜底判断匹配 `has_protagonist\s*:\s*true`，但常见 JSON 写法是 `"has_protagonist": true`，字段名和冒号之间有引号，无法命中；描述只处理 `\\"`，不会正确还原 `\\n`、`\\\\`、Unicode 转义等。
- **为什么：** `chatJson(..., json:false)` 在模型返回 markdown 围栏或非严格 JSON 时会返回原字符串。此时本应可恢复的主角描述会被静默降级为无锚定，降低 TASK_47 效果；降级本身符合“不 fail”要求，故不定为 P1。
- **修复建议：** 先从 fenced 文本中提取最外层 JSON 对象并 `JSON.parse`，再走同一个对象契约校验；正则只作为最后 fallback，且使用 JSON 解析处理字符串转义。应对 description 设置合理长度上限、去除控制字符。

### 2. 统一 seed 仅 10 万取值且所有镜头完全相同，存在碰撞与构图雷同风险

- **位置：** `api/src/pipeline/steps/l4.ts:27`
- **问题描述：** 31 乘法 hash 后 `% 100000`，不同 task 很容易共享 seed；同一任务每镜完全相同的 seed 与相近的提示词，部分模型会使镜头构图而非仅画风也过度趋同。
- **为什么：** “同任务稳定”目标已达到，重跑同 task 的 seed 也稳定；但任务量增长后碰撞概率升高，且产品目标是风格统一而不是镜头重复。
- **修复建议：** 使用更宽的无符号 32 位稳定 hash，遵循 provider 的 seed 取值范围；如实际模型确认相同 seed 过度锁定构图，可派生 `baseSeed + shotIndex`（或 hash(taskId, shotIndex)），并保留共同的 style suffix/角色锚定来保证视觉统一。变更前应以 wingray 实测确认 seed 语义。

### 3. L4 缺 prompt 补全的指令主体固定为中文，中英文路径不一致

- **位置：** `api/src/pipeline/steps/l4.ts:95`、`api/src/pipeline/steps/l4.ts:101`
- **问题描述：** 当 `content_language === 'en'` 时，L4 会注入英文 preset instruction，但主提示仍要求“生成一句中文画面提示词”，主角一致性段也固定中文。
- **为什么：** L3 已针对 `lang` 区分主角规则与 preset；L4 这一分支会使英文任务得到混合语言提示词，影响模型服从性和最终风格后缀的一致性。
- **修复建议：** 为 L4 prompt 补全建立 ZH/EN 两套基础指令和主角一致性段；按照 `lang` 选择，同时使 fallback prompt 的语言与任务语言一致。

## 已确认的正向实现

- `api/src/pipeline/steps/l3.ts:112` 始终渲染 preset 指令；`api/src/pipeline/steps/l3.ts:260` 将其并入 override 之后的 sysPrompt，节奏规则仍在最终 sysPrompt 最前。
- `api/src/pipeline/steps/l4.ts:95` 按“style 在前、preset 在后”的顺序把 preset 放入缺 prompt 的补全提示中。
- `api/src/pipeline/steps/l3.ts:218` 的主角提取失败被 catch 后降级，不会使 L3 失败；`api/src/pipeline/steps/l3.ts:293` 与 `api/src/pipeline/steps/l4.ts:147` 都有程序级 `includes` 前置补全。
- `api/src/providers/runtime.ts:331` 至 `api/src/providers/runtime.ts:343` 已将 `seed` 传入 wingray 请求的 `parameters.seed`，包括尺寸回退重试也复用同一个 `opts.seed`。
- `render/worker/index.js:143`、`render/worker/index.js:346` 实现了字幕重编码动态超时；`render/worker/index.js:157` 提供带 `killed`/`signal`/exit code 的 stderr 尾部摘要；`render/worker/index.js:454`、`render/worker/index.js:615` 均把字幕失败 warning 进入回执。
- `render/worker/index.js:329` 将 ASS force_style 的逗号转为单反斜杠 `\,`，与 `execFile` 直接 argv 调用方式相符。

## 验证记录与限制

- 已执行：`npm --prefix api run build`，通过（包含 `tsc -p api/tsconfig.json`）。
- 已执行：`node --check render/worker/index.js`，通过。
- 已执行：`git diff --check -- <TASK_46/47/48 相关文件>`，通过，无空白错误。
- 未执行：Colima 真实生图、真实长视频字幕烧录、wingray seed 语义验证；这些需要可用容器、provider 凭据和会产生外部成本。因此本报告不把静态/构建通过等同于验收中的真实任务证据。

## 上线结论

**当前不建议直接上线。** 没有阻断服务的 P0，但 P1-1 和 P1-2 会使常用重拆/重生及后续 L4 执行丢失 TASK_47/TASK_46 的核心一致性能力；P1-3 也未满足 TASK_48 明确的全 ffmpeg 动态超时要求。修复三项 P1 后，建议在 Colima 上至少完成：主角任务、纯产品任务、重拆分镜、单镜重生，以及超过 4 分钟的字幕烧录回归，再考虑发布。
