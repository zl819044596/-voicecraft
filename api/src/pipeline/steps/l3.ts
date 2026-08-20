/**
 * L3 分镜生成（Phase 4，TS 移植 v2 steps/l3.js）。
 *
 * 输入：L2 payload（script_paragraphs）+ config.synthesis.aspect + storyboard_preset
 * 输出：payload { kind:'storyboard', aspect, preset, total_duration_sec, shot_count }
 *       同时写 MinIO tasks/<id>/storyboard.json（分镜唯一事实来源，不入 assets 表）。
 * 提示词：06 §3 的 P-L3-SYS + P-L3-USR（中英）+ PRESET_INSTRUCTION（general/ecommerce/story）。
 * 兜底：normalizeShot 修复模型输出缺字段（duration/aspect/motion 等）。
 */

import * as lib from '../lib.js';
import { chatJson } from '../llm.js';
import { resolveProviderFor, poolFrom } from '../providers.js';
import type { StepRunnerInput } from '../queues.js';
import { PRESET_INSTRUCTION_ZH, PRESET_INSTRUCTION_EN, renderPrompt } from '../prompts.js';
// PIPELINE_TASK_49 (P2-1)：主角提取解析统一提为共享模块（fenced JSON 提取 + JSON.parse 契约 +
// 正则最后 fallback），L3 主路径与 rerun 重拆共用同一实现。
import { extractProtagonist } from '../style-context.js';

// PIPELINE_TASK_37：时长档位化——口播按 ~4.5 字/秒估算朗读秒数，就近取档（3-20s），不再写死 5s。
const DURATION_SLOTS = [3, 5, 8, 10, 12, 15, 20];

/** 按口播字数估算朗读秒数并就近取档位（不小于 3s、不大于 20s）。
 *  中文口播按 ~4.5 字/秒；英文口播按字符算 ~15 字符/秒（否则时长高估约 3 倍）。 */
function slotFor(len: number, lang: string): number {
  const est = lang === 'en' ? len / 15 : len / 4.5;
  let best = DURATION_SLOTS[0];
  for (const s of DURATION_SLOTS) if (Math.abs(s - est) < Math.abs(best - est)) best = s;
  return best;
}

// PIPELINE_TASK_37：segment_break 场景切换标记——时间跳跃词 / 地点转换词（确定性触发，不滥用）。
// 中英双语词表：按 task.config.content_language 在 run 里选择；英文变体加 i（句首大写），
// 并用 \b 词边界避免「later」命中 "later on" 之外的同根词。
const TIME_JUMP_RE_ZH = /(第二天|次日|几天后|几个月后|多年后|不久|后来|回到|从此|那天|那年|当天|晚上|清晨)/;
const TIME_JUMP_RE_EN = /\b(the next day|the following day|days later|a few days later|weeks later|months later|years later|not long after|soon after|afterward|afterwards|later|back then|from then on|that night|that day|that year|that morning|that evening|the next morning)\b/i;
const PLACE_CHANGE_RE_ZH = /(到了|来到|回到|走向|赶到|离开|抵达|走进|穿过|登上)/;
const PLACE_CHANGE_RE_EN = /\b(arrived at|arrived in|reached|returned to|came to|came back to|went back to|walked into|walked toward|headed to|headed for|left|departed|entered|arrived|set foot in)\b/i;

/** 清理 title 自由文本：去掉代码围栏、JSON 包裹与首尾引号。 */
function cleanTitle(raw: unknown): string {
  let s = String(raw ?? '').trim();
  s = s.replace(/^```[\s\S]*?\n/, '').replace(/\n?```$/, '').trim();
  if (s.startsWith('{') && s.endsWith('}')) {
    try {
      const parsed = JSON.parse(s) as Record<string, unknown>;
      const v = parsed.title ?? parsed.result;
      if (typeof v === 'string' && v.trim()) return v.trim();
    } catch {
      /* 非 JSON，走下方清理 */
    }
  }
  for (const [l, r] of [
    ['"', '"'],
    ['「', '」'],
    ['《', '》'],
    ["'", "'"],
  ] as const) {
    if (s.startsWith(l) && s.endsWith(r)) s = s.slice(l.length, -r.length).trim();
  }
  return s;
}

export const l3 = {
  async run(ctx: StepRunnerInput) {
    const { pg, redis, minio, task, prev } = ctx;
    const lang = String(task?.config?.content_language || 'zh') === 'en' ? 'en' : 'zh';
    const l2 = prev[2] || {};
    const config = task.config || {};
    const synthesis = (config.synthesis || {}) as Record<string, unknown>;

    const paragraphs: string[] = Array.isArray(l2.script_paragraphs) ? (l2.script_paragraphs as string[]) : [];
    const aspect = String(synthesis.aspect || '16:9');
    const preset = ['general', 'ecommerce', 'story'].includes(String(synthesis.storyboard_preset))
      ? String(synthesis.storyboard_preset)
      : 'general';
    const targetDurationSec = Number(prev[1]?.target_duration_sec) || 60;

    // 分镜拆解配置（prompts type=storyboard，如「默认分镜拆解」）作为分镜最高层指令。
    // 存在用户配置时，preset 指令（含镜头数范围）让位——避免 6-12/15-18 冲突。
    let storyboardOverride: string | null = null;
    try {
      const { rows } = await pg.query(
        `SELECT body FROM prompts WHERE type = 'storyboard' AND enabled = true
         ORDER BY (user_id = $1) DESC NULLS LAST, is_default DESC, created_at DESC LIMIT 1`,
        [task.owner_id],
      );
      if (rows.length > 0 && rows[0].body && rows[0].body.trim()) storyboardOverride = rows[0].body.trim();
    } catch (err) {
      console.warn(`[l3] storyboard prompt lookup failed: ${(err as Error).message}`);
    }

    // PIPELINE_TASK_46：preset 画面风格指令不再因全局默认模板（storyboardOverride）存在而丢弃——
    // override 是拆镜/输出约束，preset 是画面风格方向，二者并存不冲突。始终渲染并注入 sysPrompt。
    const presetInstruction = renderPrompt(
      lang === 'en' ? PRESET_INSTRUCTION_EN[preset] : PRESET_INSTRUCTION_ZH[preset],
      {},
    );
    const shotCount = Math.min(12, Math.max(3, Number((synthesis as Record<string, unknown>).shot_count) || 0));
    // 从用户分镜配置提取镜头数范围（如「默认15-18个」→ 15-18）——shot_count 缺省时的强约束
    let shotRange = '';
    if (storyboardOverride) {
      const m = storyboardOverride.match(/(\d+)\s*[-–—~至]\s*(\d+)/);
      if (m) shotRange = `${m[1]}-${m[2]}`;
    }

    // ===== v2：确定性拆镜（口播=原文逐字，不依赖 LLM 重新生成内容）+ LLM 补标题 =====
    // 之前模型每次重跑都重新编分镜内容（口播非原文、标题变来变去）——改为：
    // 1) 按用户拆镜原则（自然句界）切分 L2 口播，合并到目标镜头数（15-18）——结果确定
    // 2) LLM 只为每镜生成短标题（失败兜底口播前 12 字）
    const pool = poolFrom(pg, redis);
    const provider = await resolveProviderFor(pg, pool, task, 'llm');
    const minT = Number(shotRange?.split('-')[0]) || (shotCount > 0 ? shotCount : 12);
    const maxT = Number(shotRange?.split('-')[1]) || Math.min(24, minT + 3);
    const targetMid = Math.max(6, Math.round((minT + maxT) / 2));
    const sentenceSplit = (t: string) =>
      String(t)
        .split(/(?<=[。！？；!?;])\s*/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
    const allParts: string[] = [];
    for (const p of paragraphs) allParts.push(...sentenceSplit(p));
    if (allParts.length < 1) allParts.push(...sentenceSplit(String(config.custom_prompt || '视频内容')));
    // PIPELINE_TASK_36/37：承接句并入上一镜——以承接词开头的句子（可/更/而/但/却/也/所以/因此/于是/就这样/
    // 为何/为什么/接着/随后/然后/结果/最终/终于/因为/由于/虽然/尽管/不过/然而/幸而/恰巧/难怪/怪不得/
    // 果然/并没有/其实/看来/原来/反倒/反而/偏偏/更是）语义上承接上文，不应作为新镜开头；
    // 将其逐字追加到上一句末尾，保持逐字拼接守恒。单镜并入后超 MAX_UNIT_CHARS 则不并（防单镜过长）。
    // 英文承接词变体：句首大写，须 i 忽略大小写；But/And/So/Then 等常见句首词并入可能过度，
    // 由 MAX_UNIT_CHARS=120 上限保护（超长不并），不额外加逻辑。
    const CONTINUATION_START_ZH = /^(可|更|而|但|却|也|所以|因此|于是|就这样|为何|为什么|接着|随后|然后|结果|最终|终于|因为|由于|虽然|尽管|不过|然而|幸而|恰巧|难怪|怪不得|果然|并没有|其实|看来|原来|反倒|反而|偏偏|更是)/;
    const CONTINUATION_START_EN = /^(but|and|so|therefore|however|yet|because|since|then|eventually|finally|after that|afterwards|later|next|also|actually|instead|meanwhile|in the end|as a result|that is why|for this reason)/i;
    const continuationStart = lang === 'en' ? CONTINUATION_START_EN : CONTINUATION_START_ZH;
    const MAX_UNIT_CHARS = 120;
    const merged: string[] = [];
    for (const part of allParts) {
      if (merged.length > 0 && continuationStart.test(part) && merged[merged.length - 1].length + part.length <= MAX_UNIT_CHARS) {
        merged[merged.length - 1] += part;
      } else {
        merged.push(part);
      }
    }
    // 镜数保底：并入后句数不足目标下限（15-18 镜）时，放弃并入、退回原始句界切分，保证镜数
    const units = merged.length >= minT ? merged : allParts;
    // per 校正：保证切分后镜数落在 [minT, maxT] 区间（无法同时满足时贴近 targetMid）
    let per = Math.max(1, Math.round(units.length / targetMid));
    let nShots = Math.ceil(units.length / per);
    if (nShots > maxT) {
      per = Math.max(1, Math.ceil(units.length / maxT));
      nShots = Math.ceil(units.length / per);
    }
    if (nShots < minT) {
      per = Math.max(1, Math.floor(units.length / minT));
      nShots = Math.ceil(units.length / per);
    }
    const shots: Record<string, unknown>[] = [];
    let prevBreak = false;
    // PIPELINE_TASK_37 双语补漏：按 content_language 选择时间跳跃/地点转换词表（英文 / 中文）。
    const timeJumpRe = lang === 'en' ? TIME_JUMP_RE_EN : TIME_JUMP_RE_ZH;
    const placeChangeRe = lang === 'en' ? PLACE_CHANGE_RE_EN : PLACE_CHANGE_RE_ZH;
    for (let i = 0; i < units.length; i += per) {
      const script = units.slice(i, i + per).join('');
      // PIPELINE_TASK_37：segment_break 场景切换标记——时间跳跃/地点转换强词触发；
      // 不滥用：上一镜已标切换且本镜无强切换词，则归为连续场景（prevBreak 防连标）。
      const hasSwitch = timeJumpRe.test(script) || placeChangeRe.test(script);
      let segment_break = hasSwitch;
      if (prevBreak && !hasSwitch) segment_break = false;
      prevBreak = segment_break;
      shots.push({
        index: shots.length + 1,
        title: '',
        scene: script.slice(0, 14),
        script,
        prompt: '', // L4 按画面风格配置补全
        aspect,
        motion: 'static',
        duration_sec: slotFor(script.length, lang), // 时长档位化：按口播字数就近取档（3-20s），中英基准不同
        segment_break,
      });
    }
    // PIPELINE_TASK_37：节奏规则——首镜钩子/末镜特写留悬/中段 ~15s 情绪转折，注入最终 sysPrompt 头部。
    const firstShot = shots.length > 0 ? 1 : 0;
    const lastShot = shots.length;
    const pacingRules =
      lang === 'en'
        ? `[Pacing Rules]\n` +
          `- Shot #${firstShot} (first): the image must serve the hook — strong impact / suspense / crisis opening; no flat expository intro (e.g. "today we're going to talk about"); the frame needs visual tension.\n` +
          `- Shot #${lastShot} (last): lean toward Close-up / Extreme Close-up to serve the cliffhanger and give the audience a reason to rewatch.\n` +
          `- Middle: an emotional turning point roughly every 15s, expressed through visual weight and shot-size changes; avoid long flat stretches.\n\n`
        : `【节奏规则】\n` +
          `- 首镜（第 ${firstShot} 镜）：画面必须服务钩子——强冲击/悬念/危机切入，拒绝平铺介绍式开场（如「今天我们来聊聊」）；画面要有视觉张力。\n` +
          `- 末镜（第 ${lastShot} 镜）：画面倾向特写（Close-up/Extreme Close-up），服务卡点留悬，给观众回看钩子。\n` +
          `- 中段：每约 15 秒一个情绪转折点，通过画面权重和景别变化呈现，避免长段平铺。\n\n`;

    // ===== PIPELINE_TASK_47：全局主角设定（管"人"）=====
    // 在标题+画面提示词 LLM 调用前，先从口播识别主角并给出统一外貌描述；
    // 该描述注入 sysPrompt 要求每镜画面提示词逐字复用 + 下方确定性前置补全，保证跨镜一致。
    // 无主角（纯产品/风景口播）→ 跳过锚定；任何失败/契约不符 → 降级无锚定，不 fail 任务。
    // PIPELINE_TASK_49 (P2-1)：识别 + 契约解析复用共享 extractProtagonist（与 rerun 重拆同一
    // 实现；fenced JSON 先提取并 JSON.parse，正则仅作最后 fallback）。
    let protagonistDescription: string | null = null;
    try {
      const narration = shots.map((s) => String(s.script || '')).join('\n');
      protagonistDescription = await extractProtagonist({ pg, task, provider, lang, narration });
      console.warn(
        `[l3] protagonist anchored=${protagonistDescription !== null}` +
          (protagonistDescription ? ` desc="${protagonistDescription.slice(0, 80)}"` : ''),
      );
    } catch (err) {
      console.warn(`[l3] protagonist extraction skipped (degrade to no-anchor): ${(err as Error).message}`);
    }

    let titlesDegraded = false;
    try {
      // PIPELINE_TASK_35：注入用户配置的 storyboard 提示词正文作为拆镜/输出约束，
      // 但保持 v2 确定性拆镜不变——LLM 只生成标题+画面提示词，绝不重写口播。
      let sysPrompt =
        '为每个分镜镜头生成两项：1) 8-14 字中文标题（概括该镜内容，不要标点、不要编号）；2) 60-80 字中文画面提示词（AI 生图用）。\n' +
        '画面提示词硬性要求：必须具体可画——①主体人物：身份/外貌/服装/动作；②场景环境：地点/时间/天气/光线；③景别：远景/中景/近景/特写；④镜头角度。\n' +
        '必须从该镜口播中提取具体画面元素（如「曹操在泥泞路上大笑」「江面火光冲天」「两人围棋对弈」），严格贴合口播内容；' +
        '禁止使用抽象概念词（如「智慧」「策略」「逆境」「勇气」）作为画面主体；禁止出现文字、字幕、Logo 指令。\n' +
        '只输出 JSON（不要 markdown 代码块、不要任何解释）：{"shots":[{"index":1,"title":"标题","prompt":"画面提示词"}]}';
      if (storyboardOverride) {
        sysPrompt =
          '【用户分镜拆解规则】\n' +
          storyboardOverride +
          '\n——— 以上为用户配置的分镜拆解规则，仅作切分/输出约束参考；口播文本必须逐字来自输入，禁止改写。生成标题和画面提示词时仍须遵守下方硬性要求 ———\n' +
          '但你（LLM）当前任务仅生成标题与画面提示词，不重新拆镜；规则中与标题/画面提示词无关的拆镜指令自动满足（拆镜由系统确定性完成）。\n\n' +
          sysPrompt;
      }
      // PIPELINE_TASK_46：分镜模板 preset 画面风格方向并入 sysPrompt（override 与 preset 并存：
      // override 是拆镜/输出约束，preset 是画面风格方向）。生成标题 + 画面提示词时按 preset 调风格。
      sysPrompt += `\n【分镜模板·${preset}】${presetInstruction}`;
      // PIPELINE_TASK_47：主角一致性规则——统一外貌描述注入，要求每镜画面提示词逐字复用；
      // 结合下方确定性前置补全，保证"一字不差"（LLM 引用 + 程序兜底双保险）。
      if (protagonistDescription) {
        sysPrompt +=
          lang === 'en'
            ? `\n[Character Consistency]\nThe video has a human protagonist. Reuse the following EXACT appearance description VERBATIM in EVERY shot's image prompt, word for word: "${protagonistDescription}"\n`
            : `\n【主角一致性】\n本片存在人物主角，其统一外观描述如下（每镜画面提示词必须逐字原样复用，一字不差）：「${protagonistDescription}」\n`;
      }
      // 节奏规则始终置于最终 sysPrompt 最前（override / 非 override 两条路径都生效）
      sysPrompt = pacingRules + sysPrompt;
      const out = await chatJson({
        pg,
        task,
        provider,
        sysPrompt,
        usrPrompt: JSON.stringify(shots.map((s) => ({ index: s.index, script: s.script }))),
        mockKey: 's3_titles',
        params: { temperature: 0.6, maxTokens: 4000, json: false },
        schemaKey: undefined,
      });
      const items = Array.isArray((out as Record<string, unknown>)?.shots)
        ? (out as { shots: { index: number; title?: string; prompt?: string }[] }).shots
        : [];
      const metaMap = new Map(items.map((t) => [Number(t.index), t]));
      for (const s of shots) {
        const m = metaMap.get(Number(s.index));
        s.title = (m?.title && String(m.title).trim()) || String(s.script).slice(0, 12);
        if (m?.prompt && String(m.prompt).trim()) s.prompt = String(m.prompt).trim();
        // PIPELINE_TASK_47：主角锚定硬性保证——LLM 已按 sysPrompt 复用主角描述，但为做到
        // "一字不差"，对缺失该描述的镜 prompt 确定性前置补全（storyboard.json 是唯一事实来源）。
        if (protagonistDescription && s.prompt && !String(s.prompt).includes(protagonistDescription)) {
          s.prompt = `${protagonistDescription}，${String(s.prompt)}`;
        }
      }
      titlesDegraded = items.length === 0;
    } catch {
      titlesDegraded = true;
      for (const s of shots) s.title = String(s.script).slice(0, 12);
    }
    console.warn(`[l3] v2 deterministic split: ${shots.length} shots (target ${minT}-${maxT}), titles degraded=${titlesDegraded}, storyboardRule=${storyboardOverride ? 'used' : 'missing'}, preset=${preset}`);


    const storyboard: Record<string, unknown> = { generated_at: new Date().toISOString(), aspect, preset, shots };
    // PIPELINE_TASK_47：主角统一描述持久化到 storyboard 顶层——L4 补全/兜底路径读取复用。
    if (protagonistDescription) storyboard.protagonist = protagonistDescription;
    await lib.writeStoryboard(minio, task.id, storyboard);

    // PIPELINE_TASK_32：L3 成功后追加视频标题（prompts title 模板 + 完整文案）。
    // title 是锦上添花非关键路径：模板缺失 / 分镜 degraded / 生成失败都直接跳过，
    // 不降级 L3、不追加 warnings。
    let title = '';
    if (shots.length > 0) {
      try {
        // 1) 查模板：任务 owner 的 title 模板 → 无则任意 title 模板；都无 → 跳过
        let tpl = '';
        if (task.owner_id) {
          const ownerRows = await pg.query(
            `SELECT body FROM prompts WHERE type = 'title' AND enabled = true AND user_id = $1
              ORDER BY is_default DESC, updated_at DESC LIMIT 1`,
            [task.owner_id],
          );
          if (ownerRows.rows.length > 0 && ownerRows.rows[0].body && ownerRows.rows[0].body.trim()) {
            tpl = ownerRows.rows[0].body.trim();
          }
        }
        if (!tpl) {
          const anyRows = await pg.query(
            `SELECT body FROM prompts WHERE type = 'title' AND enabled = true
              ORDER BY is_default DESC, updated_at DESC LIMIT 1`,
          );
          if (anyRows.rows.length > 0 && anyRows.rows[0].body && anyRows.rows[0].body.trim()) {
            tpl = anyRows.rows[0].body.trim();
          }
        }

        if (tpl) {
          // 2) 查完整文案：L2 产物 script.md；读不到用分镜 voiceover 拼接兜底
          let scriptText = '';
          try {
            const buf = await lib.downloadFromMinio(minio, `tasks/${task.id}/script.md`);
            scriptText = buf.toString('utf8').trim();
          } catch {
            scriptText = '';
          }
          if (!scriptText) {
            scriptText = shots.map((s) => String(s.voiceover || s.script || '')).join('\n');
          }
          const scriptPreview = scriptText.slice(0, 2000);

          // 3) 生成：复用本步已解析 provider，自由文本（不传 schemaKey / json）
          const out = await chatJson({
            pg,
            task,
            provider,
            sysPrompt: '你是短视频标题专家。根据文案生成一个 8-22 字的视频标题，只输出标题本身，不要引号、不要解释。',
            usrPrompt: `${tpl}\n\n文案：\n${scriptPreview}`,
            params: { temperature: 0.5, maxTokens: 200 },
          });
          title = cleanTitle(out);

          // 4) 落盘：只加 storyboard.json 顶层 title，不塞进每个 shot
          if (title) {
            storyboard.title = title;
            await lib.writeStoryboard(minio, task.id, storyboard);
          }
        }
      } catch (err) {
        console.warn(`[l3] title gen skipped: ${(err as Error).message}`);
      }
    }

    const payload: Record<string, unknown> = {
      kind: 'storyboard',
      aspect,
      preset,
      total_duration_sec: targetDurationSec,
      shot_count: shots.length,
    };
    if (title) payload.title = title;
    if (titlesDegraded) payload.degraded = true;

    return { payload };
  },
};
