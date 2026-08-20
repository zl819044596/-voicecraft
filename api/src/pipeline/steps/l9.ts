/**
 * L9 复检（LLM 质检，不阻塞导出）（Phase 4，TS 移植 v2 steps/l9.js）。
 *
 * 输入：成片元数据（prev[8]）+ 文案（prev[2]）+ 字幕段（prev[7]）
 * 输出：payload { kind:'review', passed, score, issues, summary }
 * 提示词：06 §7 的 P-L9-SYS + P-L9-USR（中英）。
 * 降级 D：复检服务不可用 → 默认放行（{passed:true, score:null, issues:[…]}），导出不被阻塞。
 */

import { chatJson, effectiveSysPrompt } from '../llm.js';
import { resolveProviderFor, poolFrom } from '../providers.js';
import type { StepRunnerInput } from '../queues.js';
import {
  P_L9_SYS_ZH,
  P_L9_SYS_EN,
  P_L9_USR_ZH,
  P_L9_USR_EN,
  STEP_PARAMS,
  renderPrompt,
  escapeTripleQuoted,
} from '../prompts.js';

export const l9 = {
  async run(ctx: StepRunnerInput) {
    const { pg, redis, task, prev } = ctx;
    const lang = String(task?.config?.content_language || 'zh') === 'en' ? 'en' : 'zh';
    const l2 = prev[2] || {};
    const compose = prev[8] || {};

    const paragraphs: string[] = Array.isArray(l2.script_paragraphs) ? (l2.script_paragraphs as string[]) : [];
    const segments = Array.isArray(prev[7]?.segments) ? (prev[7].segments as unknown[]) : [];

    const sysPrompt = await effectiveSysPrompt(pg, task, 'l9', P_L9_SYS_ZH, P_L9_SYS_EN);
    const usrPrompt = renderPrompt(lang === 'en' ? P_L9_USR_EN : P_L9_USR_ZH, {
      target_duration_sec: prev[1]?.target_duration_sec || 60,
      content_language: lang === 'en' ? 'English' : '中文',
      hook: escapeTripleQuoted(String(l2.hook || paragraphs[0] || '')),
      script_paragraphs: escapeTripleQuoted(paragraphs.join('\n')),
      cta: escapeTripleQuoted(String(l2.cta || '')),
      storyboard_json: escapeTripleQuoted(JSON.stringify(prev[3] || {})),
      video_metadata: escapeTripleQuoted(
        JSON.stringify({
          duration: compose.duration ?? null,
          size: compose.size ?? null,
          mp4_key: compose.mp4_key || null,
          subtitles: segments.length,
        }),
      ),
    });
    const pool = poolFrom(pg, redis);
    const provider = await resolveProviderFor(pg, pool, task, 'llm');

    const result = await chatJson({
      pg,
      task,
      provider,
      sysPrompt,
      usrPrompt,
      mockKey: 's9',
      params: STEP_PARAMS.l9,
      schemaKey: 'l9',
      degrade: async () => ({
        passed: true,
        score: null,
        issues: [
          {
            type: 'review_unavailable',
            step_ref: 'L9',
            detail: '复检服务暂不可用',
            suggestion: '请人工抽查后导出',
          },
        ],
      }),
    });

    const issues = Array.isArray(result.issues)
      ? (result.issues as Record<string, unknown>[])
          .map((i) => ({
            type: String(i.type || 'issue').slice(0, 50),
            step_ref: String(i.step_ref || '').slice(0, 10),
            detail: String(i.detail || '').slice(0, 1000),
            suggestion: String(i.suggestion || '').slice(0, 1000),
          }))
          .slice(0, 50)
      : [];

    const payload: Record<string, unknown> = {
      kind: 'review',
      passed: result.passed === true,
      score: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
      issues,
      summary: String(result.feedback || result.summary || '').slice(0, 2000),
    };
    if (result.degraded) payload.degraded = true;

    return { payload };
  },
};
