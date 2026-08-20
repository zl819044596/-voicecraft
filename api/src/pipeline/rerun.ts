/**
 * 单步重跑 + 单镜重生成 + 节点编辑（Phase 4，TS 移植 v2 pipeline/rerun.js）。
 *
 * 语义（00-CONTRACT §3 重跑 / §7.2 重生成）：
 *   - rerunFromStep(ctx, task, fromStep)：整步重跑。清洗 Ln 及全部下游
 *     （step_results 行 + MinIO 产物 + assets 行）→ tasks 回到 queued、
 *     current_step=Ln、rerun_count++（托管档计次，402 扣积分 P5 接，本次
 *     只记录）→ 延时 500ms 入队 force 从 Ln 重跑。任务终态或 paused 均先复位。
 *   - regenerate*：同步单节点重生成（HTTP 请求内完成，不重新走队列）：
 *     更新 step_results payload + MinIO 产物 + config.node_edits（stale 依据）。
 *   - markNodeEdited：append config.node_edits [{step, at}]。
 *
 * 注意：api_cost_log 为 INSERT-only（触发器禁 UPDATE/DELETE），重跑会产生新流水行。
 */

import * as lib from './lib.js';
import * as state from './state.js';
import { chatJson, effectiveSysPrompt } from './llm.js';
import {
  resolveProviderFor,
  callImage,
  callTTS,
  callI2V,
  poolFrom,
  makeReporter,
} from './providers.js';
import { enqueueDelayed } from './queues.js';
import { mockWavBuffer } from '../providers/runtime.js';
import type { DB, PipelineCtx, TaskRow } from './types.js';
import {
  P_L2_SYS_ZH,
  P_L2_SYS_EN,
  P_L2_USR_ZH,
  P_L2_USR_EN,
  P_L2_REGEN_ZH,
  P_L2_REGEN_EN,
  PRESET_INSTRUCTION_ZH,
  PRESET_INSTRUCTION_EN,
  STEP_PARAMS,
  renderPrompt,
  escapeTripleQuoted,
  resolveRuleBody,
} from './prompts.js';
// PIPELINE_TASK_49 (P1-1)：rerun 重拆/单镜重生与 L3/L4 主路径共享统一风格上下文——
// 风格后缀 / 任务 seed / 主角前置补全 / 负面词 / 主角提取同款流程。
import {
  styleSuffixFor,
  seedFromTaskId,
  withProtagonistPrefix,
  DEFAULT_NEGATIVE_PROMPT,
  extractProtagonist,
} from './style-context.js';

const langOf = (task: TaskRow): 'en' | 'zh' =>
  String(task?.config?.content_language || 'zh') === 'en' ? 'en' : 'zh';

// ---------------------------------------------------------------------------
// PIPELINE_TASK_45：P_L3_SYS_ZH/EN 与 P_L3_USR_ZH/EN 已从 prompts.ts 移除
// （l3.ts 已改用内联 sysPrompt）。本文件 regenerateStoryboard（分镜重拆，POST
// /:id/storyboard/regenerate）是唯一剩余消费者——常量就近迁移到此处，行为不变。
// ---------------------------------------------------------------------------

const P_L3_SYS_ZH = `你是一名短视频导演兼分镜师，负责把口播文案拆成 6-12 个镜头的 storyboard.json，供 AI 生图与图生视频使用。

【拆分规则】
1. 镜头数 = ⌈总时长 ÷ 7.5⌉，限制在 6-12 之间。一个镜头 5-10 秒；短于 4 秒的文案碎片必须并入相邻镜头；长于 12 秒的段落必须拆成两镜。
2. 每个镜头的 script = 文案原文的一段或一段的连续部分，一字不改。voiceover 与 subtitle 直接等于 script。
3. duration_sec = 该镜 voiceover 字数 ÷ 4（中文每秒约 4 字），四舍五入到 0.5；所有镜头之和不得超过目标总时长 + 2 秒。
4. 第一镜必须是视觉最强的钩子镜——观众刷到第一眼看到的画面，信息密度最高、最有冲击力。最后 1-2 镜给 CTA。
5. 相邻镜头景别必须变化（特写后不跟特写），远景镜全片不超过 2 个（竖屏小屏幕上远景信息量不足）。

【prompt 字段（生图提示词，必须用英文）】
按七段式构造，逗号分隔：
主体 + 动作 + 场景 + 光线 + 镜头语言 + 风格 + 画质词
- 主体要具体（年龄/着装/表情），禁止裸写 "person"；
- 全长 40-80 词；
- 画质词固定收尾：high detail, sharp focus, 4k；
- 同一人物/产品在所有镜头中用完全相同的英文描述子串，保证全片一致性；
- 默认风格：photorealistic, cinematic color grading（除非用户风格模板另有指定）；
- 需要画面文字的镜头写明 with the text "..." clearly displayed。

【motion 字段（图生视频运动描述，必须用英文）】
15-40 词，顺序：主体动作 → 镜头运镜。
- 动作幅度分三档并写进措辞：subtle（微动）/ moderate（正常）/ dynamic（大动作）；
- 运镜只选一个：slow zoom in / slow zoom out / pan left / pan right / tilt up / orbit / static；
- 静态镜头写 static camera, subtle ambient motion only；
- 动作描述必须与 prompt 中的画面内容兼容（图生视频以图为起点，不能要求画面里没有的元素）。

【输出要求】
只输出一个 JSON 对象，结构如下，不要任何解释文字：
{
  "aspect": "{{aspect}}",
  "preset": "{{storyboard_preset}}",
  "total_duration_sec": number,
  "shots": [
    {
      "index": 1,
      "title": "string",
      "duration_sec": number,
      "scene": "string（中文）",
      "script": "string",
      "voiceover": "string",
      "subtitle": "string",
      "prompt": "string（English）",
      "aspect": "{{aspect}}",
      "motion": "string（English）"
    }
  ]
}

{{custom_prompt}}`;

const P_L3_SYS_EN = `You are a short-video director and storyboard artist. Your job is to break a talking-head script into a 6-12 shot storyboard.json for AI image generation and image-to-video.

[Splitting rules]
1. Shot count = ⌈total duration ÷ 7.5⌉, clamped to 6-12. Each shot runs 5-10 seconds; script fragments under 4 seconds MUST merge into a neighboring shot; paragraphs over 12 seconds MUST split into two shots.
2. Each shot's script = one paragraph (or a continuous part of one) of the original script, verbatim. voiceover and subtitle equal script directly.
3. duration_sec = word count of the shot's voiceover ÷ 2.5 (≈2.5 words/sec), rounded to 0.5; the sum of all shots must not exceed target duration + 2s.
4. Shot 1 must be the strongest visual hook — the first frame a scroller sees, highest information density and impact. The last 1-2 shots carry the CTA.
5. Shot sizes must alternate between neighbors (never two close-ups in a row); at most 2 wide shots per video (wide shots read poorly on vertical mobile screens).

[prompt field (image-generation prompt, MUST be in English)]
Build with the seven-part formula, comma-separated:
Subject + Action + Setting + Lighting + Camera language + Style + Quality tags
- Subject must be specific (age / clothing / expression); never a bare "person";
- 40-80 words total;
- Always end with the quality tags: high detail, sharp focus, 4k;
- The same person/product must use the IDENTICAL English description substring across all shots for visual consistency;
- Default style: photorealistic, cinematic color grading (unless the user's style template says otherwise);
- For shots with on-screen text, write: with the text "..." clearly displayed.

[motion field (image-to-video motion description, MUST be in English)]
15-40 words, in this order: subject motion → camera movement.
- Motion amplitude in three grades, written into the wording: subtle / moderate / dynamic;
- Pick exactly ONE camera move: slow zoom in / slow zoom out / pan left / pan right / tilt up / orbit / static;
- Static shots: "static camera, subtle ambient motion only";
- The motion must be compatible with the image content (i2v starts from the image — never request elements absent from the frame).

[Output]
Output a single JSON object and nothing else:
{
  "aspect": "{{aspect}}",
  "preset": "{{storyboard_preset}}",
  "total_duration_sec": number,
  "shots": [
    {
      "index": 1,
      "title": "string",
      "duration_sec": number,
      "scene": "string (English)",
      "script": "string",
      "voiceover": "string",
      "subtitle": "string",
      "prompt": "string (English)",
      "aspect": "{{aspect}}",
      "motion": "string (English)"
    }
  ]
}

{{custom_prompt}}`;

const P_L3_USR_ZH = `请把以下口播文案拆解为分镜表。

文案（分段）：
"""
{{script_paragraphs}}
"""

画面比例：{{aspect}}
分镜预设：{{storyboard_preset}}（{{preset_instruction}}）
目标镜头数：{{shot_count}} 镜
目标总时长：{{target_duration_sec}} 秒`;

const P_L3_USR_EN = `Break the following talking-head script into a storyboard.

Script (paragraphs):
"""
{{script_paragraphs}}
"""

Aspect ratio: {{aspect}}
Storyboard preset: {{storyboard_preset}} ({{preset_instruction}})
Target shot count: {{shot_count}} shots
Target total duration: {{target_duration_sec}} seconds`;

// 每步产出的 MinIO 前缀（步骤 → 清理键）。L2 script.md / L3 storyboard.json
// 不入 assets 表，但重跑时同样清理。
const STEP_ASSETS: Record<number, Array<{ prefix: string; exact: boolean }>> = {
  2: [{ prefix: 'script', exact: true }],
  3: [{ prefix: 'storyboard', exact: true }],
  4: [{ prefix: 'shots', exact: false }],
  5: [{ prefix: 'clips', exact: false }],
  6: [{ prefix: 'audio', exact: false }],
  7: [{ prefix: 'srt', exact: true }],
  8: [{ prefix: 'mp4', exact: true }],
  10: [{ prefix: 'export', exact: false }],
};

function keyFor(taskId: string, prefix: string): string {
  const base = `tasks/${taskId}/`;
  switch (prefix) {
    case 'script': return `${base}script.md`;
    case 'storyboard': return `${base}storyboard.json`;
    case 'shots': return `${base}shots/`;
    case 'clips': return `${base}clips/`;
    case 'audio': return `${base}audio/`;
    case 'srt': return `${base}subtitles.srt`;
    case 'mp4': return `${base}final.mp4`;
    case 'export': return `${base}export/`;
    default: return `${base}${prefix}`;
  }
}

// 清洗 Ln 及全部下游：step_results 行、MinIO 产物、assets 行。
async function cleanFromStep(pg: DB, minio: PipelineCtx['minio'], taskId: string, fromStep: number): Promise<void> {
  await pg.query(`DELETE FROM step_results WHERE task_id = $1 AND step >= $2`, [taskId, fromStep]);

  const names = new Set<string>();
  const conditions: string[] = [];
  const params: unknown[] = [taskId];
  for (let s = fromStep; s <= 10; s += 1) {
    for (const { prefix, exact } of STEP_ASSETS[s] || []) {
      names.add(prefix);
      const key = keyFor(taskId, prefix);
      const paramIdx = params.length + 1;
      params.push(key);
      conditions.push(exact ? `minio_key = $${paramIdx}` : `minio_key LIKE $${paramIdx} || '%'`);
    }
  }
  if (conditions.length > 0) {
    await pg.query(`DELETE FROM assets WHERE task_id = $1 AND (${conditions.join(' OR ')})`, params);
  }
  for (const prefix of names) {
    await lib.dropMinioPrefix(minio, keyFor(taskId, prefix));
  }
}

// 整步重跑：fromStep ∈ [1,10]。清洗 → 复位 → 延时入队 force。
export async function rerunFromStep(ctx: PipelineCtx, task: TaskRow, fromStep: number): Promise<{ from_step: number; rerun_count: number }> {
  const { pg, redis } = ctx;
  const step = Number(fromStep);
  if (!Number.isInteger(step) || step < 1 || step > 10) {
    throw new Error(`from_step must be an integer 1-10, got ${fromStep}`);
  }

  await cleanFromStep(pg, ctx.minio, task.id, step);

  // 复位：status 回非终态（runStep 守卫丢弃 done/failed/cancelled），
  // current_step=fromStep，清 paused/暂停三字段/review_passed，rerun_count++。
  await pg.query(
    `UPDATE tasks
        SET status = 'queued',
            current_step = $2,
            config = (config
                        || jsonb_build_object(
                             'rerun_count', coalesce((config->>'rerun_count')::int, 0) + 1))
                    - 'paused' - 'pause_kind' - 'pause_resume_step' - 'review_passed',
            updated_at = now()
      WHERE id = $1`,
    [task.id, step],
  );

  const priority = await state.priorityKey(pg, task);
  await enqueueDelayed(redis, { taskId: task.id, step, priority, force: true }, 500);
  return { from_step: step, rerun_count: ((task.config?.rerun_count as number) || 0) + 1 };
}

// 记录一次受控节点编辑（stale 依据）。step 为被编辑的逻辑步。
export async function markNodeEdited(pg: DB, taskId: string, step: number): Promise<void> {
  const { rows } = await pg.query(`SELECT config FROM tasks WHERE id = $1`, [taskId]);
  const config = (rows[0]?.config || {}) as Record<string, unknown>;
  const edits = Array.isArray(config.node_edits) ? (config.node_edits as unknown[]) : [];
  edits.push({ step, at: new Date().toISOString() });
  await pg.query(
    `UPDATE tasks
        SET config = jsonb_set(config, '{node_edits}', $2::jsonb), updated_at = now()
      WHERE id = $1`,
    [taskId, JSON.stringify(edits)],
  );
}

// ---------------------------------------------------------------------------
// 同步重生成（regenerate 端点：HTTP 请求内完成）
// ---------------------------------------------------------------------------

// 写 script.md（与 l2.run 同构）。
function scriptMarkdown(payload: Record<string, unknown>): string {
  const paragraphs = Array.isArray(payload.script_paragraphs) ? (payload.script_paragraphs as string[]) : [];
  return [`# ${payload.hook || '视频文案'}`, '', ...paragraphs.map((p, i) => `### 段落 ${i + 1}\n\n${p}`), ''].join('\n');
}

// 脚本重写：06 §2 P-L2-REGEN（保留核心要点，hook 换角度，改写 ≥70%）。
// 写 step2 payload + script.md + node_edits(2)。
export async function regenerateScript(
  ctx: PipelineCtx,
  task: TaskRow,
  instruction?: string,
): Promise<Record<string, unknown>> {
  const { pg, redis, minio } = ctx;
  const lang = langOf(task);
  const config = task.config || {};
  const prev = await lib.getPrevPayloads(pg, task.id);
  const l1 = prev[1] || {};
  const old = prev[2] || {};
  const paragraphs: string[] = Array.isArray(old.script_paragraphs) ? (old.script_paragraphs as string[]) : [];
  const targetDurationSec = Number(l1.target_duration_sec) || 60;

  const sysPrompt = await effectiveSysPrompt(pg, task, 'l2', P_L2_SYS_ZH, P_L2_SYS_EN);
  const usrPrompt =
    renderPrompt(lang === 'en' ? P_L2_REGEN_EN : P_L2_REGEN_ZH, {
      previous_script: escapeTripleQuoted(paragraphs.join('\n')),
      target_duration_sec: targetDurationSec,
      topic: escapeTripleQuoted(String(l1.topic || '')),
      key_points: escapeTripleQuoted(Array.isArray(l1.key_points) ? (l1.key_points as string[]).join('\n') : ''),
      audience: escapeTripleQuoted(String(l1.audience || '')),
    }) + (instruction ? `\n\n额外要求：${instruction}` : '');
  const pool = poolFrom(pg, redis);
  const provider = await resolveProviderFor(pg, pool, task, 'llm');

  const result = await chatJson({
    pg,
    task,
    provider,
    sysPrompt: renderPrompt(sysPrompt, {
      target_duration_sec: targetDurationSec,
      tone: String(config.tone || '自然、真诚，像朋友分享'),
      custom_prompt: String(
        (config.prompts as Record<string, unknown> | undefined)?.script || config.custom_prompt || '',
      ),
    }),
    usrPrompt,
    mockKey: 's2',
    params: STEP_PARAMS.l2r,
    schemaKey: 'l2',
    degrade: async () => ({
      script_paragraphs: paragraphs.length ? paragraphs : [String(l1.topic || '视频内容')],
      hook: String(old.hook || l1.topic || '视频内容'),
      cta: String(old.cta || '关注我，下期继续聊。'),
    }),
  });

  const newParagraphs: string[] = Array.isArray(result.script_paragraphs)
    ? (result.script_paragraphs as unknown[]).map((p) => String(p).slice(0, 2000))
    : [];
  if (newParagraphs.length === 0) newParagraphs.push(String(l1.topic || '视频内容'));
  const payload: Record<string, unknown> = {
    kind: 'script',
    script_paragraphs: newParagraphs,
    hook: String(result.hook || newParagraphs[0] || '').slice(0, 500),
    cta: String(result.cta || newParagraphs[newParagraphs.length - 1] || '').slice(0, 500),
  };
  if (result.degraded) payload.degraded = true;

  await lib.markStepDone(pg, task.id, 2, payload);
  await lib.uploadToMinio(minio, `tasks/${task.id}/script.md`, Buffer.from(scriptMarkdown(payload), 'utf8'), 'text/markdown');
  await markNodeEdited(pg, task.id, 2);
  return payload;
}

// 分镜重拆：06 §3 P-L3-SYS/USR（复用 l3.run 组装，preset/instruction 生效）。
// 写 storyboard.json + step3 payload + node_edits(3)。
export async function regenerateStoryboard(
  ctx: PipelineCtx,
  task: TaskRow,
  preset?: string,
  instruction?: string,
): Promise<{ payload: Record<string, unknown>; storyboard: Record<string, unknown> }> {
  const { pg, redis, minio } = ctx;
  const lang = langOf(task);
  const config = task.config || {};
  const synthesis = (config.synthesis || {}) as Record<string, unknown>;
  const prev = await lib.getPrevPayloads(pg, task.id);
  const l2 = prev[2] || {};
  const paragraphs: string[] = Array.isArray(l2.script_paragraphs) ? (l2.script_paragraphs as string[]) : [];

  const aspect = String(synthesis.aspect || '16:9');
  const p = ['general', 'ecommerce', 'story'].includes(String(preset)) ? String(preset) : 'general';
  const targetDurationSec = Number(prev[1]?.target_duration_sec) || 60;

  let presetInstruction = renderPrompt(lang === 'en' ? PRESET_INSTRUCTION_EN[p] : PRESET_INSTRUCTION_ZH[p], {});
  if (instruction) presetInstruction += `\n\n额外要求：${instruction}`;

  const sysPrompt = await effectiveSysPrompt(pg, task, 'l3', P_L3_SYS_ZH, P_L3_SYS_EN);
  const sysPromptRendered = renderPrompt(sysPrompt, {
    aspect,
    storyboard_preset: p,
    custom_prompt: String(config.custom_prompt || ''),
  });
  const usrPrompt = renderPrompt(lang === 'en' ? P_L3_USR_EN : P_L3_USR_ZH, {
    script_paragraphs: escapeTripleQuoted(paragraphs.join('\n\n')),
    aspect,
    storyboard_preset: p,
    preset_instruction: presetInstruction,
    target_duration_sec: targetDurationSec,
  });
  const pool = poolFrom(pg, redis);
  const provider = await resolveProviderFor(pg, pool, task, 'llm');

  const result = await chatJson({
    pg,
    task,
    provider,
    sysPrompt: sysPromptRendered,
    usrPrompt,
    mockKey: 's3',
    params: STEP_PARAMS.l3,
    schemaKey: 'l3',
    degrade: async () => ({
      aspect,
      preset: p,
      total_duration_sec: targetDurationSec,
      shots: (paragraphs.length ? paragraphs : ['视频内容']).map((pp, i) => ({
        index: i + 1,
        title: `镜头 ${i + 1}`,
        duration_sec: 5,
        scene: pp.slice(0, 100),
        script: pp,
        voiceover: pp,
        subtitle: pp,
        prompt: 'high detail, sharp focus, 4k',
        aspect,
        motion: 'static camera, subtle ambient motion only',
      })),
    }),
  });

  const shots = Array.isArray(result.shots)
    ? (result.shots as Record<string, unknown>[]).map((s, i) => lib.normalizeShot(s, i + 1, aspect))
    : [];

  // PIPELINE_TASK_49 (P1-1)：与 l3.ts 主路径同款主角提取——重拆后同样识别统一外观描述，
  // 写入 storyboard 顶层 protagonist，并对每镜 prompt 做确定性前置补全（锚定不因重拆丢失）。
  let protagonistDescription: string | null = null;
  try {
    const narration = shots.map((s) => String(s.script || '')).join('\n');
    protagonistDescription = await extractProtagonist({ pg, task, provider, lang, narration });
    console.warn(
      `[rerun] storyboard regenerate protagonist anchored=${protagonistDescription !== null}` +
        (protagonistDescription ? ` desc="${protagonistDescription.slice(0, 80)}"` : ''),
    );
  } catch (err) {
    console.warn(`[rerun] protagonist extraction skipped (degrade to no-anchor): ${(err as Error).message}`);
  }
  if (protagonistDescription) {
    for (const s of shots) {
      if (s.prompt && !String(s.prompt).includes(protagonistDescription)) {
        s.prompt = withProtagonistPrefix(String(s.prompt), protagonistDescription);
      }
    }
  }

  const storyboard: Record<string, unknown> = { generated_at: new Date().toISOString(), aspect, preset: p, shots };
  if (protagonistDescription) storyboard.protagonist = protagonistDescription;
  await lib.writeStoryboard(minio, task.id, storyboard);

  const payload: Record<string, unknown> = {
    kind: 'storyboard',
    aspect,
    preset: p,
    total_duration_sec: Number(result.total_duration_sec) || targetDurationSec,
    shot_count: shots.length,
  };
  if (result.degraded) payload.degraded = true;

  await lib.markStepDone(pg, task.id, 3, payload);
  await markNodeEdited(pg, task.id, 3);
  return { payload, storyboard };
}

// 单镜图片重生成（L4 单镜；static 主用，i2v 也可单独重出图片）。
export async function regenerateShotImage(
  ctx: PipelineCtx,
  task: TaskRow,
  index: number,
): Promise<{ index: number; key: string }> {
  const { pg, redis, minio } = ctx;
  const shotIndex = Number(index);
  const config = task.config || {};
  const lang = langOf(task);
  const aspect = String((config.synthesis as Record<string, unknown>)?.aspect || '16:9');

  const storyboard = await lib.readStoryboard(minio, task.id, aspect);
  const shot = storyboard?.shots?.[shotIndex - 1];
  if (!storyboard || !shot) throw new Error(`shot index ${shotIndex} not found in storyboard`);

  // PIPELINE_TASK_49 (P1-1)：readStoryboard 归一化丢弃顶层 preset/protagonist——这里一次读取
  // 原始 storyboard.json，同时取主角锚定描述与写回基底（保留全部顶层字段，不因重生丢失）。
  let rawStoryboard: Record<string, unknown> | null = null;
  let protagonistDescription: string | null = null;
  try {
    const buf = await lib.downloadFromMinio(minio, `tasks/${task.id}/storyboard.json`);
    rawStoryboard = JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
    const pd = String((rawStoryboard as { protagonist?: unknown })?.protagonist ?? '').trim();
    if (pd) protagonistDescription = pd;
  } catch {
    // 读取失败降级无锚定，写回退回归一化对象
  }

  const pool = poolFrom(pg, redis);
  const provider = await resolveProviderFor(pg, pool, task, 'image');
  const report = makeReporter(pool, provider);

  // PIPELINE_TASK_49 (P1-1)：与 L4 主路径完全一致的 prompt 组装——主角前置补全 +
  // 统一风格后缀 + 生成规则；同一任务 seed（seedFromTaskId）与负面词策略透传。
  let prompt = shot.prompt
    ? String(shot.prompt)
    : `${shot.title || (lang === 'en' ? `Shot ${shotIndex}` : `镜头 ${shotIndex}`)}, ${shot.scene || ''}, ${shot.aspect || aspect}, high detail, sharp focus, 4k`;
  prompt = withProtagonistPrefix(prompt, protagonistDescription);
  prompt += `, ${styleSuffixFor(lang)}`;
  const imageRule = await resolveRuleBody(pg, task, 'image');
  if (imageRule) prompt += `\n【生成规则】\n${imageRule}`;

  let buf = await callImage({
    pg,
    task,
    provider,
    prompt,
    size: shot.aspect || aspect,
    variant: shotIndex - 1,
    report,
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    seed: seedFromTaskId(task.id),
  });
  // 与 L4 一致：real provider 输出与目标比例不符 → 居中裁剪（mock 忽略 size by contract）。
  if (provider?.mode === 'real') {
    buf = await lib.cropImageToAspect(buf, shot.aspect || aspect);
  }

  const key = lib.canonicalKeys(task.id, shotIndex).image;
  await lib.uploadToMinio(minio, key, buf, 'image/png');
  await lib.insertAsset(pg, task.id, 'shot', key, buf.length);

  // 候选图管理：新图置顶 is_default=true，旧候选保留（归一化 + 原始双份同步）。
  const candidates = Array.isArray(shot.candidates) ? shot.candidates.filter((c) => c?.key !== key) : [];
  candidates.unshift({ key, is_default: true });
  shot.candidates = candidates;

  // 写回基底优先用原始 storyboard JSON（保留 preset/protagonist 等顶层字段），
  // 并同步更新原始 shot 的候选图；读不到原始 JSON 才退回归一化对象。
  let base: Record<string, unknown>;
  if (rawStoryboard) {
    const rawShots = Array.isArray(rawStoryboard.shots) ? (rawStoryboard.shots as Record<string, unknown>[]) : [];
    const rawShot = rawShots.find((s) => Number((s as { index?: unknown })?.index) === shotIndex);
    if (rawShot) {
      const rawCandidates = Array.isArray(rawShot.candidates)
        ? (rawShot.candidates as Record<string, unknown>[]).filter((c) => c?.key !== key)
        : [];
      rawCandidates.unshift({ key, is_default: true });
      rawShot.candidates = rawCandidates;
    }
    base = { ...rawStoryboard, generated_at: new Date().toISOString(), shots: rawShots.length ? rawShots : storyboard.shots };
  } else {
    storyboard.generated_at = new Date().toISOString();
    base = storyboard as unknown as Record<string, unknown>;
  }
  await lib.writeStoryboard(minio, task.id, base);

  await markNodeEdited(pg, task.id, 4);
  return { index: shotIndex, key };
}

// 单镜 i2v 片段重生成（L5 单镜；i2v 模式）。
// PIPELINE_TASK_41（2026-08-17）：i2v 已下线，流水线与路由均不再调用本函数
// （clips/regenerate 已返回 410）。保留实现 + callI2V 依赖，避免删 provider 层。
export async function regenerateShotClip(
  ctx: PipelineCtx,
  task: TaskRow,
  index: number,
): Promise<{ index: number; key: string }> {
  const { pg, redis, minio } = ctx;
  const shotIndex = Number(index);
  const config = task.config || {};
  const aspect = String((config.synthesis as Record<string, unknown>)?.aspect || '16:9');

  const storyboard = await lib.readStoryboard(minio, task.id, aspect);
  const shot = storyboard?.shots?.[shotIndex - 1];
  if (!storyboard || !shot) throw new Error(`shot index ${shotIndex} not found in storyboard`);

  const pool = poolFrom(pg, redis);
  const provider = await resolveProviderFor(pg, pool, task, 'i2v');
  const report = makeReporter(pool, provider);
  const imageKey = lib.canonicalKeys(task.id, shotIndex).image;
  const imageBuffer = await lib.downloadFromMinio(minio, imageKey);
  const buf = await callI2V({
    pg,
    task,
    provider,
    imageBuffer,
    text: String(shot.prompt || shot.script || ''),
    report,
  });

  const key = lib.canonicalKeys(task.id, shotIndex).clip;
  await lib.uploadToMinio(minio, key, buf, 'video/mp4');
  await lib.insertAsset(pg, task.id, 'clip', key, buf.length);

  const clipCandidates = Array.isArray(shot.clip_candidates) ? shot.clip_candidates.filter((c) => c?.key !== key) : [];
  clipCandidates.unshift({ key, is_default: true });
  shot.clip_candidates = clipCandidates;
  storyboard.generated_at = new Date().toISOString();
  await lib.writeStoryboard(minio, task.id, storyboard);

  await markNodeEdited(pg, task.id, 5);
  return { index: shotIndex, key };
}

// 单句配音重生成（L6 单镜；失败 mockWavBuffer 兜底，与 l6.run 一致）。
export async function regenerateVoice(
  ctx: PipelineCtx,
  task: TaskRow,
  index: number,
): Promise<{ index: number; key: string; warning: unknown }> {
  const { pg, redis, minio } = ctx;
  const shotIndex = Number(index);
  const config = task.config || {};
  const aspect = String((config.synthesis as Record<string, unknown>)?.aspect || '16:9');
  const ttsCfg = (config.tts || {}) as Record<string, unknown>;

  const storyboard = await lib.readStoryboard(minio, task.id, aspect);
  const shot = storyboard?.shots?.[shotIndex - 1];
  if (!storyboard || !shot) throw new Error(`shot index ${shotIndex} not found in storyboard`);

  const pool = poolFrom(pg, redis);
  const provider = await resolveProviderFor(pg, pool, task, 'tts');
  const report = makeReporter(pool, provider);
  const voice = provider?.voice || String(ttsCfg.voice || 'longjiqi');
  const speed = Number(ttsCfg.speed) || 1;
  const volume = Number(ttsCfg.volume) || 50;
  const text = String(shot.voiceover || shot.script || '');

  let buf: Buffer | null = null;
  let warning: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const b = await callTTS({ pg, task, provider, voice, text, speed, volume, report });
      if (!b || b.length === 0) throw new Error('TTS 返回空音频');
      buf = b;
      break;
    } catch (err) {
      if (attempt === 2) {
        buf = mockWavBuffer(text, volume);
        warning = { status: 'fallback', reason: String((err as Error).message || '').slice(0, 300) };
      } else {
        await lib.sleep(500);
      }
    }
  }

  const key = `tasks/${task.id}/audio/vo-${String(shotIndex).padStart(2, '0')}.mp3`;
  await lib.uploadToMinio(minio, key, buf!, 'audio/mpeg');
  await lib.insertAsset(pg, task.id, 'audio', key, buf!.length);

  await markNodeEdited(pg, task.id, 6);
  return { index: shotIndex, key, warning };
}
