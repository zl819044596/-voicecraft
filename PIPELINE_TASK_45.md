# PIPELINE_TASK_45：全局默认技能库（模板中心 8 类默认模板 seed + 死代码清理 + 负面词适配层）

## 背景

平台模板中心（prompts 表）目前只有用户个人配置，**没有全局默认模板**（user_id 为空 + is_default=true）。
新用户注册后到点调用的只有代码内置裸规则，多用户场景体验不一致。

设计文档（**模板内容以此为准，逐字使用**）：`docs/stage-skills-design.md`
- §核心设计原则：模板 = 通用导演方法论，**模型无关、平台无关（BYOK）**；不出现模型名/平台名/API 参数；措辞用「宜/例」；确定性逻辑（拆镜/时长/segment_break）永远在代码，不进模板。
- §技能库设计：8 条模板全文（script/storyboard/style/title/product_parse/benchmark_analysis/video_style/compliance）。

## 任务

### 1. Seed 8 条全局默认技能（核心）
在 api 启动初始化处（参考现有 db init / migrate 机制，若没有则新建一个轻量 ensure 函数，在服务启动时调用）：
- 对 prompts 表 type 为 `script` / `storyboard` / `style` / `title` / `product_parse` / `benchmark_analysis` / `video_style` / `compliance` 的全局记录（`user_id IS NULL`）做 upsert：
  - 不存在 → 插入：`user_id = NULL, is_default = true, enabled = true`，body 取 `docs/stage-skills-design.md` 中对应模板全文；
  - 已存在 → 跳过（**不要覆盖用户或已有全局内容**）。
- 注意 prompts 表 type CHECK 允许中英两套（'文案模板' 与 'script' 并存），**必须用英文 type**（与流水线代码 l3/l4/l15 一致）。
- name 字段给可读中文名（如「默认分镜拆解」「默认画面风格」等），tags 可空。
- 幂等：重复启动不重复插入、不报错。

### 2. 清理死代码
`api/src/pipeline/prompts.ts` 中 `P_L3_SYS_ZH` / `P_L3_SYS_EN` / `P_L3_USR_ZH` / `P_L3_USR_EN` 已被 l3.ts 内联 sysPrompt 取代（l3.ts 只用了 PRESET_INSTRUCTION_*），确认无其他引用后删除，并清理 l3.ts 中不再使用的 import。**不要动 PRESET_INSTRUCTION_ZH/EN**（仍在用）。

### 3. 负面词适配层（L4 生图）
- 从 style 默认模板的「画面负面清单」提取通用负面词（代码内置一份英文版常量：no watermark, no logo, no random large text, no garbled text, no broken faces, no duplicated limbs, no low-quality collage, no text overlay, no speech bubbles, no cartoon style unless specified, no flat illustration, no marketing poster style）。
- l4.ts 调用生图 API 时：provider 能力声明支持 `negative_prompt` 字段 → 结构化传入；否则注入正面 prompt 尾部（"Avoid: ..." 一段）或不注入（由模板正文约束兜底）。
- provider 能力声明位置：`api/src/providers/` 的 provider 定义里加可选字段（如 `supportsNegativePrompt?: boolean`），wingray 默认 false 除非确认支持。
- 不改变现有生图主流程与重试逻辑。

### 4. 自验（必须）
- `cd api && npm run build` 通过。
- 本地起服务（或 docker compose up -d --build api）后验证：`SELECT type, is_default, user_id FROM prompts WHERE user_id IS NULL` 返回 8 条；重启一次不重复插入。
- 跑一个最小任务（可 mock 或已有测试任务 from_step=3）验证 L3 分镜正常生成、模板注入生效（日志 `storyboardRule=used`）。

## 验收标准
1. 8 条全局默认技能落库（user_id NULL + is_default true），重启幂等。
2. 模板中心 API GET /api/prompts 能看到 8 条默认模板。
3. 用户个人配置仍优先（查询逻辑 ORDER BY (user_id=$1) DESC 不变）。
4. 死代码删除后 build 通过，L3 行为不变（确定性拆镜/时长档位/segment_break/节奏规则全部保留）。
5. L4 负面词：能力声明 + 注入逻辑存在，默认行为不破坏现有生图。
6. git 提交（commit 分开：feat seed / chore cleanup / feat negative-prompt），**不 push**（听潮复核后再 push）。

## 注意
- 不修改 l3.ts 的拆镜/时长/segment_break 确定性逻辑。
- 不修改 prompts 查询 SQL（现有 user_id 优先 → is_default 其次逻辑已正确）。
- 不引入新依赖。
