# PIPELINE_TASK_47：分镜生图风格统一（A+C 组合拳）

状态：待执行
日期：2026-08-19
执行方式：Claude Code 后台派工 + 听潮独立复核

## 背景

16 个镜头各自独立生成：每镜提示词由 L3 独立产出，主角外貌描述各写各的，加上每次采样独立
——人物长相/色调/画风全飘，拼片跳戏。方案（用户已确认 A+C 组合拳）：

- A. 全局角色锚定（管"人"）：L3 生成画面提示词时强制注入统一主角描述
- C. seed + 风格后缀（管"画面"）：L4 固定 seed + 统一风格后缀

## 需求

### A. L3 主角一致性（api/src/pipeline/steps/l3.ts）

- LLM 调用（标题+画面提示词生成）前，先生成**全局主角设定**：从口播文本识别主角并给出
  统一外貌描述（如「主角：曹操，40岁，黑须，红袍金甲，佩剑」）
- 硬性要求：**每镜画面提示词必须复用同一段主角描述**（一字不差），保证人物跨镜一致
- 无主角场景（纯产品/风景口播）→ 跳过主角锚定，不阻塞
- 实现参考：sysPrompt 中加「主角一致性规则」段，让 LLM 先输出主角设定再逐镜生成；
  主角设定放在 usrPrompt 或 sysPrompt 固定位置，每镜 prompt 引用
- **保持 v2 确定性拆镜不变，口播逐字来自输入，绝不改写**
- 若 LLM 输出不符合 JSON 契约（如缺主角设定）→ 降级为无锚定模式，不 fail 任务

### C. L4 seed + 风格后缀（api/src/pipeline/steps/l4.ts + providers.ts）

- wingray 生图请求 `parameters.seed`：从 task.id 派生固定值（如 hash 后 % 100000），
  同任务全部镜头同 seed 族 → 画面色调/构图倾向一致
- 统一风格后缀：每镜 prompt 追加固定风格串（中文：「电影感写实，暖色调，自然光，细节丰富」；
  英文：「cinematic realism, warm tones, natural light, rich detail」）——放 providers.ts
  或 l4.ts 常量，模型无关
- 确认 wingray 适配层透传 seed（providers.ts callImage 的 parameters 构造处）

## 验收（听潮独立复核）

1. tsc --noEmit 通过
2. 本地 colima 真实任务 ×2（主角口播 + 纯产品口播各一）：
   - 主角任务：storyboard.json 每镜 prompt 含同一主角描述（对比提取）
   - 两任务 L4 生图请求带固定 seed（看 provider 日志或代码路径）
   - 口播逐字守恒
3. 降级路径：LLM 主角提取失败时任务不 fail（可 mock 验证）

## 约束

- 只改 api/src/pipeline/（l3.ts / l4.ts / providers.ts / prompts.ts 必要时）
- 不动 prompts 表、不动前端、不动 render/、不动 nginx/compose
- 不提交 git；DOCKER_CONTEXT=colima；HTTP 请求 timeout≤25s；NO_PROXY='*'
- 不用 kimi

## 输出报告（/tmp/task47_report.md）

改动文件清单 + diff 摘要 + 验证证据（tsc 输出、storyboard.json 主角描述对比、seed 证据）+ 阻塞点
