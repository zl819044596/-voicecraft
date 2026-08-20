/**
 * L4 逐镜生图（Phase 4，TS 移植 v2 steps/l4.js）。
 *
 * 输入：storyboard.json（MinIO）+ config.synthesis.aspect
 * 输出：payload { kind:'images', shots:[{index,key,aspect,size}] }
 * 产物：MinIO tasks/<id>/shots/shot-0N.png → assets(type='shot')。
 * 策略：单镜失败直接 throw（图片是必须产物，不设 fallback）→ 整步 failed。
 */

import * as lib from '../lib.js';
import { resolveProviderFor, callImage, poolFrom, makeReporter } from '../providers.js';
import type { StepRunnerInput } from '../queues.js';
import { resolveRuleBody, PRESET_INSTRUCTION_ZH, PRESET_INSTRUCTION_EN } from '../prompts.js';
import { chatJson } from '../llm.js';
// PIPELINE_TASK_49 (P1-1/P2-1)：统一风格上下文提为共享模块——L4/L3/rerun 共用同一实现。
import {
  styleSuffixFor,
  seedFromTaskId,
  withProtagonistPrefix,
  DEFAULT_NEGATIVE_PROMPT,
} from '../style-context.js';

export const l4 = {
  async run(ctx: StepRunnerInput) {
    const { pg, redis, minio, task } = ctx;
    const config = task.config || {};
    const lang = String(task?.config?.content_language || 'zh') === 'en' ? 'en' : 'zh';
    const aspect = String((config.synthesis as Record<string, unknown>)?.aspect || '16:9');

    const storyboard = await lib.readStoryboard(minio, task.id, aspect);
    if (!storyboard || storyboard.shots.length === 0) {
      throw new Error('storyboard 缺失或为空（L4 前置依赖不满足）');
    }
    // PIPELINE_TASK_46：分镜模板 preset——readStoryboard 归一化只保留 shots/generated_at，
    // 不保留 preset 字段，故需读原始 storyboard.json 提取（读失败/缺省回退 general）。
    // PIPELINE_TASK_47：同一次读取顺带提取顶层 protagonist（L3 写入的统一主角描述），
    // 供补全/兜底路径确定性锚定。
    // PIPELINE_TASK_49 (P1-2)：rawStoryboard 同时作为 prompt 补全写回的基底——保留
    // preset/protagonist 等全部顶层字段，避免归一化结果覆盖写丢元数据。
    let preset = 'general';
    let protagonistDescription: string | null = null;
    let rawStoryboard: Record<string, unknown> | null = null;
    try {
      const buf = await lib.downloadFromMinio(minio, `tasks/${task.id}/storyboard.json`);
      const parsed = JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
      rawStoryboard = parsed;
      const p = String(parsed?.preset ?? '');
      if (['general', 'ecommerce', 'story'].includes(p)) preset = p;
      const pd = String((parsed as { protagonist?: unknown })?.protagonist ?? '').trim();
      if (pd) protagonistDescription = pd;
    } catch {
      // 读取失败回退 general
    }
    const presetInstruction = lang === 'en' ? PRESET_INSTRUCTION_EN[preset] : PRESET_INSTRUCTION_ZH[preset];

    // PIPELINE_TASK_47：统一 seed——从 task.id 派生，同任务全镜头同 seed 族。
    const seed = seedFromTaskId(task.id);
    console.warn(`[l4] unified seed=${seed} (task.id=${task.id}), protagonist=${protagonistDescription ? 'anchored' : 'none'}`);

    const pool = poolFrom(pg, redis);
    const provider = await resolveProviderFor(pg, pool, task, 'image');

    // 画面风格（prompts type=style，如「写实彩色：质感胶片」）——用户启用的默认模板
    let stylePrompt: string | null = null;
    try {
      const { rows } = await pg.query(
        `SELECT body FROM prompts WHERE type = 'style' AND enabled = true
         ORDER BY (user_id = $1) DESC NULLS LAST, is_default DESC, created_at DESC LIMIT 1`,
        [task.owner_id],
      );
      if (rows.length > 0 && rows[0].body && rows[0].body.trim()) {
        stylePrompt = (rows[0].body as string).trim();
      }
    } catch {
      // 查询失败静默跳过
    }

    // 画面提示词补全：分镜未输出 prompt（用户分镜拆解配置「仅拆结构」）时，
    // 用 LLM 从每镜口播/标题批量生成画面提示词（风格指令优先用 style 配置），并回填 minio 分镜表。
    const shotsMissingPrompt = storyboard.shots.filter((s) => !s.prompt || !String(s.prompt).trim());
    if (shotsMissingPrompt.length > 0) {
      try {
        const llmProvider = await resolveProviderFor(pg, pool, task, 'llm');
        // PIPELINE_TASK_49 (P2-3)：补全指令按任务语言中英分套——主体指令 + 主角一致性段
        // 与 L3 的 lang 分流保持一致，避免英文任务混入中文指令（影响模型服从与风格统一）。
        const protagonistBlock =
          lang === 'en'
            ? protagonistDescription
              ? `[Character Consistency] This video has a protagonist. Reuse the following EXACT appearance description VERBATIM in every shot's image prompt, word for word: "${protagonistDescription}".\n`
              : ''
            : protagonistDescription
              ? `【主角一致性】本片主角统一外观描述：「${protagonistDescription}」。每镜画面提示词必须逐字原样复用该描述（一字不差）。\n`
              : '';
        const baseInstruction =
          lang === 'en'
            ? 'You are a storyboard image-prompt writer. For each shot, generate ONE English image prompt (under 60 words) for AI image generation: must include subject, action, shot size and mood; do not include any text-card/subtitle instruction. Output JSON only: {"shots":[{"index":1,"prompt":"…"}]}.'
            : '你是分镜画面提示词编写器。为每个镜头生成一句中文画面提示词（60字以内），用于AI生图：必须包含主体、动作、景别与氛围，不要出现文字卡/字幕指令。只输出 JSON，格式 {"shots":[{"index":1,"prompt":"…"}]}。';
        const out = await chatJson({
          pg,
          task,
          provider: llmProvider,
          sysPrompt:
            (stylePrompt ? `${stylePrompt}\n` : '') +
            (presetInstruction ? `${presetInstruction}\n` : '') +
            protagonistBlock +
            baseInstruction,
          usrPrompt: JSON.stringify(
            storyboard.shots.map((s) => ({
              index: s.index,
              title: s.title ?? '',
              scene: s.scene ?? '',
              script: s.script ?? s.voiceover ?? '',
            })),
          ),
          mockKey: 'shot_prompts',
        });
        const filled = Array.isArray(out?.shots) ? out.shots : [];
        const entries: Array<[number, string]> = filled
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && x.index !== undefined)
          .map((x) => [Number(x.index), String(x.prompt ?? '').trim()] as [number, string])
          .filter((e) => e[1].length > 0);
        const map = new Map<number, string>(entries);
        if (map.size > 0) {
          // PIPELINE_TASK_49 (P1-2)：写回基底优先用开头读到的原始 storyboard JSON——
          // 保留 preset/protagonist 等全部顶层字段与原始 shot 字段（segment_break 等），
          // 只在缺失 prompt 的原始 shot 上回填补全结果，不用 readStoryboard 归一化结果覆盖写。
          const baseShots = rawStoryboard && Array.isArray(rawStoryboard.shots)
            ? (rawStoryboard.shots as Record<string, unknown>[])
            : (storyboard.shots as unknown as Record<string, unknown>[]);
          let changed = false;
          const nextShots = baseShots.map((s) => {
            const idx = Number((s as { index?: unknown })?.index);
            if (idx > 0 && (!s.prompt || !String(s.prompt).trim()) && map.has(idx)) {
              changed = true;
              return { ...s, prompt: map.get(idx) ?? '' };
            }
            return s;
          });
          if (changed) {
            await lib.writeStoryboard(minio, task.id, {
              ...(rawStoryboard ?? (storyboard as unknown as Record<string, unknown>)),
              shots: nextShots,
            });
          }
        }
      } catch {
        // 补全失败静默，沿用原有 fallback（标题+场景）
      }
    }
    const report = makeReporter(pool, provider);
    const shots: Array<{ index: number; key: string; aspect: string; size: number }> = [];

    // CORE-FEATURES：图片生成规则（image）正文追加到每条生图提示词末尾（循环外解析一次）。
    const imageRule = await resolveRuleBody(pg, task, 'image');

    for (const shot of storyboard.shots) {
      const index = Number(shot.index);
      let prompt = shot.prompt
        ? String(shot.prompt)
        : `${shot.title || (lang === 'en' ? `Shot ${index}` : `镜头 ${index}`)}, ${shot.scene || ''}, ${shot.aspect || aspect}, high detail, sharp focus, 4k`;
      // PIPELINE_TASK_47：主角锚定确定性补全——兜底 L4 补全/fallback 路径，保证跨镜一字不差。
      prompt = withProtagonistPrefix(prompt, protagonistDescription);
      // PIPELINE_TASK_47：统一风格后缀——每镜 prompt 追加固定风格串（模型无关）。
      prompt += `, ${styleSuffixFor(lang)}`;
      if (imageRule) prompt += `\n【生成规则】\n${imageRule}`;
      let buf: Buffer | undefined;
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          buf = await callImage({
            pg,
            task,
            provider,
            prompt,
            size: shot.aspect || aspect,
            variant: index - 1,
            report,
            // PIPELINE_TASK_45 负面词适配层：provider 支持 negative_prompt → 结构化传入，
            // 否则 callImage 注入 prompt 尾部。
            negativePrompt: DEFAULT_NEGATIVE_PROMPT,
            // PIPELINE_TASK_47：统一 seed——同任务全镜头同 seed → 色调/构图倾向一致。
            seed,
          });
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < 2) await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
        }
      }
      if (!buf) {
        throw new Error(`L4: image generation failed after retries for shot ${index}: ${String(lastErr).slice(0, 120)}`);
      }
      // D2: wingray falls back to its square default when the requested size is
      // unsupported — center-crop real-provider output to the target aspect so
      // the shot matches the storyboard ratio (mock ignores size by contract).
      if (provider?.mode === 'real') {
        buf = await lib.cropImageToAspect(buf, shot.aspect || aspect);
      }
      const key = lib.canonicalKeys(task.id, index).image;
      await lib.uploadToMinio(minio, key, buf, 'image/png');
      await lib.insertAsset(pg, task.id, 'shot', key, buf.length);
      shots.push({ index, key, aspect: shot.aspect || aspect, size: buf.length });
    }

    return { payload: { kind: 'images', shots } };
  },
};
