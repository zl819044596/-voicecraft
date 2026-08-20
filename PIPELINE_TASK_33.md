# PIPELINE_TASK_33: 提示词中心新增「视频风格」类型（画面风格之后），L5 i2v 消费

## 背景

- 用户需求（2026-08-14）：视频生成也要单独加提示词，「在画面风格后面加一类 视频风格」，参照截图（提示词中心「文案模板」tab 的管理界面）。
- 现状：
  - 提示词中心（app/src/pages/Prompts.tsx）已有 7 类 tab：商品解析/对标分析/文案模板/标题生成/**画面风格**/分镜拆解/合规规则。
  - `prompts` 表 type CHECK 约束含：`product_parse, benchmark_analysis, script, title, style, storyboard, compliance` + 7 个中文名。
  - L4 画面生成已消费 `type='style'` 模板（`SELECT body FROM prompts WHERE type='style' AND enabled=true ORDER BY (user_id=$1) DESC, is_default DESC, created_at DESC LIMIT 1`）。
  - L5 i2v 目前用 `resolveRuleBody(pg, task, 'i2v')`（rules 表），**没有**消费 prompts 表的视频风格模板。
- 目标：新增「视频风格」提示词类型（英文枚举 `video_style`），前后端 + 数据库约束全链路打通，**L5 i2v 步骤消费该模板**（与 rules i2v 规则共存，都追加进生成指令）。

## 修改点

### 1. 数据库（必须）

`prompts` 表 type CHECK 约束加 `'video_style'` 和 `'视频风格'`：

```sql
ALTER TABLE prompts DROP CONSTRAINT prompts_type_check;
ALTER TABLE prompts ADD CONSTRAINT prompts_type_check CHECK (type = ANY (ARRAY[
  'product_parse','benchmark_analysis','script','title','style','storyboard','compliance','video_style',
  '商品解析','对标分析','文案模板','标题生成','画面风格','分镜拆解','合规规则','视频风格'
]));
```

注意：迁移脚本若存在（查 db 迁移目录/init sql），同步加；无迁移脚本则直接执行 SQL + 在代码注释中记录。

### 2. 后端 api/src/routes/prompts.ts

`TYPES` Set 加 `'video_style'` 和 `'视频风格'`（保持中英双语，与其他类型一致）。

### 3. 后端 api/src/pipeline/steps/l5.ts（i2v 消费视频风格模板）

参照 l4.ts 的 style 消费方式（l4.ts:30-43 附近），在 L5 解析视频风格模板：

```ts
// 视频风格（prompts type=video_style）——用户启用的默认模板
let videoStylePrompt: string | null = null;
try {
  const { rows } = await pg.query(
    `SELECT body FROM prompts WHERE type = 'video_style' AND enabled = true
     ORDER BY (user_id = $1) DESC, is_default DESC, created_at DESC LIMIT 1`,
    [task.owner_id],
  );
  if (rows.length > 0 && rows[0].body && rows[0].body.trim()) {
    videoStylePrompt = (rows[0].body as string).trim();
  }
} catch { /* 静默跳过 */ }
```

然后在拼接每条片段的 motionText 时追加（l5.ts:49 附近）：

```ts
const motionText = `${shot.motion || shot.voiceover || shot.script || ''}${videoStylePrompt ? `\n【视频风格】\n${videoStylePrompt}` : ''}${i2vRule ? `\n【生成规则】\n${i2vRule}` : ''}`;
```

### 4. 前端 app/src/components/library/data.ts

- `PromptType` 联合类型加 `'video'`
- `PROMPT_TYPES` 在 `{ id: 'style', label: '画面风格' }` **之后**插入 `{ id: 'video', label: '视频风格' }`
- `PRESET_PROMPTS` 加 2 条 video 类型预置模板（参照 style 模板风格，中文，含 tags/content/isDefault/enabled/updatedAt）：
  - 例 1：`p-video-1`「运镜卡点 · 快节奏」— tags ['卡点','快节奏']，content：'视频风格指令：快节奏运镜卡点，每 1.5-2 秒一切，推拉摇移交替，镜头运动与鼓点强对齐，动感转场（闪白/甩镜），主体始终在画面黄金分割点。'
  - 例 2：`p-video-2`「电影感长镜头」— tags ['电影感','慢速']，content：'视频风格指令：电影感长镜头，缓慢推进与环绕运镜，浅景深背景虚化，稳定器平滑运动，光影层次分明，适合情绪向内容。'

### 5. 前端 app/src/pages/Prompts.tsx

- `PROMPT_TYPE_TO_API` 加 `video: 'video_style'`
- `API_TYPE_TO_PROMPT` 加 `video_style: 'video'` 和 `视频风格: 'video'`

## 验证（必须全部通过）

1. `cd api && npm run build` 通过；`cd app && npm run build`（或项目实际前端构建命令）通过。
2. 数据库约束执行成功：`SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='prompts'::regclass;` 可见 `video_style`/`视频风格`。
3. API 行为验证（假登录 `X-User-Id: dev`）：
   - `POST /api/prompts` 创建 `type='video_style'` → 200；
   - `GET /api/prompts?type=video_style` → 返回该条；
   - 乱 type → 422。
4. 前端页面：提示词中心出现「视频风格」tab（画面风格之后），可新建/编辑/设默认/启停/删除，real 模式数据来自 API。
5. 行为验证（可选）：真实 i2v 任务跑 L5，日志/指令含「【视频风格】」段落（或 mock 验证拼接逻辑）。
6. git 提交（分阶段）：
   - 提交 1：数据库 SQL 说明 + 后端（prompts.ts TYPES + l5.ts 消费）→ `feat(api): add video_style prompt type and consume in L5 i2v`
   - 提交 2：前端（data.ts + Prompts.tsx）→ `feat(app): add 视频风格 prompt type tab`

## 输出格式

完成后用 read_file 自证修改已落盘，报告：修改文件路径、build 输出、数据库约束结果、API 测试结果、commit hash。
