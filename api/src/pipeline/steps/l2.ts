/**
 * L2 文案生成（Phase 4，TS 移植 v2 steps/l2.js）。
 *
 * 输入：L1 payload（topic / key_points / target_duration_sec / audience）
 * 输出：payload { kind:'script', script_paragraphs, hook, cta }
 *       同时写 MinIO tasks/<id>/script.md（标题 + 段落 markdown，不入 assets 表）。
 * 版本管理：config.script_versions 由 script/versions 端点维护，L2 本体不重复写。
 * 提示词：06 §2 的 P-L2-SYS + P-L2-USR（中英）；script/regenerate 用 P-L2-REGEN。
 */

import * as lib from '../lib.js';
import { chatJson, effectiveSysPrompt } from '../llm.js';
import { resolveProviderFor, poolFrom } from '../providers.js';
import type { StepRunnerInput } from '../queues.js';
import {
  P_L2_SYS_ZH,
  P_L2_SYS_EN,
  P_L2_USR_ZH,
  P_L2_USR_EN,
  STEP_PARAMS,
  renderPrompt,
  escapeTripleQuoted,
  resolveRuleBody,
} from '../prompts.js';

export const l2 = {
  async run(ctx: StepRunnerInput) {
    const { pg, redis, minio, task, prev } = ctx;
    const lang = String(task?.config?.content_language || 'zh') === 'en' ? 'en' : 'zh';
    const l1 = prev[1] || {};
    const config = task.config || {};
    const targetDurationSec = Number(l1.target_duration_sec) || 60;
    // 内容输入：quick 页/任务详情把用户文案存 config.prompts.script（与 quick 页
    // prompts.script 同键）；兼容旧字段 config.custom_prompt；两者都空 → 空串。
    const customPrompt = String(
      (config.prompts as Record<string, unknown> | undefined)?.script || config.custom_prompt || '',
    );
    const scriptMode = String((config as Record<string, unknown>).script_mode || '');

    // paste/rewrite/create 模式（快速生成页三种文案源）：直用 config.prompts.script
    // 分段输出，不调 LLM（paste 为 TASK_25；rewrite/create 为 TASK_26）
    if (scriptMode === 'paste' || scriptMode === 'rewrite' || scriptMode === 'create') {
      const paragraphs = customPrompt
        .split(/\n\s*\n|\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => p.slice(0, 2000));
      if (paragraphs.length === 0) paragraphs.push('视频内容');
      const payload: Record<string, unknown> = {
        kind: 'script',
        script_paragraphs: paragraphs,
        hook: String(customPrompt.trim().slice(0, 500) || paragraphs[0] || ''),
        cta: String(paragraphs[paragraphs.length - 1] || '').slice(0, 500),
      };
      const md = [`# ${payload.hook || '视频文案'}`, '', ...paragraphs.map((p, i) => `### 段落 ${i + 1}\n\n${p}`), ''].join('\n');
      await lib.uploadToMinio(minio, `tasks/${task.id}/script.md`, Buffer.from(md, 'utf8'), 'text/markdown');
      return { payload };
    }

    // CORE-FEATURES：重构规则（rewrite）正文注入 SYS 的 {{custom_prompt}} 槽，
    // 与用户 creativePrompt/script 模板并存（规则优先追加在最后，作为最高层指令）。
    const rewriteRule = await resolveRuleBody(pg, task, 'rewrite');
    const customPromptCombined = rewriteRule
      ? [customPrompt, `【重构规则】\n${rewriteRule}`].filter(Boolean).join('\n\n')
      : customPrompt;

    const sysPrompt = await effectiveSysPrompt(pg, task, 'l2', P_L2_SYS_ZH, P_L2_SYS_EN);
    const usrPrompt = renderPrompt(lang === 'en' ? P_L2_USR_EN : P_L2_USR_ZH, {
      target_duration_sec: targetDurationSec,
      topic: escapeTripleQuoted(String(l1.topic || '')),
      key_points: escapeTripleQuoted(Array.isArray(l1.key_points) ? (l1.key_points as string[]).join('\n') : ''),
      audience: escapeTripleQuoted(String(l1.audience || '')),
    });
    const pool = poolFrom(pg, redis);
    const provider = await resolveProviderFor(pg, pool, task, 'llm');

    const result = await chatJson({
      pg,
      task,
      provider,
      sysPrompt: renderPrompt(sysPrompt, {
        target_duration_sec: targetDurationSec,
        tone: String(config.tone || '自然、真诚，像朋友分享'),
        custom_prompt: customPromptCombined,
      }),
      usrPrompt,
      mockKey: 's2',
      params: STEP_PARAMS.l2,
      schemaKey: 'l2',
      degrade: async () => ({
        script_paragraphs: [String(l1.topic || '视频内容'), '这个要点值得你花 30 秒了解。'],
        hook: String(l1.topic || '视频内容'),
        cta: '关注我，下期继续聊。',
      }),
    });

    const paragraphs: string[] = Array.isArray(result.script_paragraphs)
      ? (result.script_paragraphs as unknown[]).map((p) => String(p).slice(0, 2000))
      : [];
    if (paragraphs.length === 0) paragraphs.push(String(l1.topic || '视频内容'));

    const payload: Record<string, unknown> = {
      kind: 'script',
      script_paragraphs: paragraphs,
      hook: String(result.hook || paragraphs[0] || '').slice(0, 500),
      cta: String(result.cta || paragraphs[paragraphs.length - 1] || '').slice(0, 500),
    };
    if (result.degraded) payload.degraded = true;

    // 写 script.md（Markdown）
    const md = [`# ${payload.hook || '视频文案'}`, '', ...paragraphs.map((p, i) => `### 段落 ${i + 1}\n\n${p}`), ''].join('\n');
    await lib.uploadToMinio(minio, `tasks/${task.id}/script.md`, Buffer.from(md, 'utf8'), 'text/markdown');

    return { payload };
  },
};
