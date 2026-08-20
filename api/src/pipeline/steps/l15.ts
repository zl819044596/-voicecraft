/**
 * L1.5 合规预审（仅托管档）（Phase 4，TS 移植 v2 steps/l15.js）。
 *
 * 触发：task.track='managed' 且 L1 完成后（finalizeStep 补发 job reason='compliance'）。
 * 输出：payload 合并 { kind:'compliance_precheck', ...prev[1], verdict, categories,
 *        reason, passed } —— UPSERT 覆盖 step=1 结果行（UNIQUE(task_id,step)）。
 * 分流（finalizeStep 的 compliance 分支）：reject→failTask / review→pauseTask
 * ('compliance_review', 2) / pass→继续推进到 L2。
 * 提示词：06 §1.5 的 P-L15-SYS + P-L15-USR（中英）。
 */

import { chatJson, effectiveSysPrompt } from '../llm.js';
import { resolveProviderFor, poolFrom } from '../providers.js';
import { mockEnabled } from '../../providers/runtime.js';
import type { StepRunnerInput } from '../queues.js';
import {
  P_L15_SYS_ZH,
  P_L15_SYS_EN,
  P_L15_USR_ZH,
  P_L15_USR_EN,
  STEP_PARAMS,
  renderPrompt,
  escapeTripleQuoted,
} from '../prompts.js';

export const l15 = {
  async run(ctx: StepRunnerInput) {
    const { pg, redis, task, prev } = ctx;
    const lang = String(task?.config?.content_language || 'zh') === 'en' ? 'en' : 'zh';
    const topic = prev[1] || {};
    const rawInput = topic.raw_input || '';

    let result: Record<string, unknown>;
    if (mockEnabled()) {
      result = { verdict: 'pass', categories: [], reason: 'mock 模式自动通过' };
    } else {
      const sysPrompt = await effectiveSysPrompt(pg, task, 'l15', P_L15_SYS_ZH, P_L15_SYS_EN);
      const usrPrompt = renderPrompt(lang === 'en' ? P_L15_USR_EN : P_L15_USR_ZH, {
        topic: escapeTripleQuoted(
          `topic: ${topic.topic || ''}\nkey_points: ${Array.isArray(topic.key_points) ? (topic.key_points as string[]).join(' | ') : ''}\naudience: ${topic.audience || ''}`,
        ),
        raw_input: escapeTripleQuoted(String(rawInput || '')),
      });
      const pool = poolFrom(pg, redis);
      const provider = await resolveProviderFor(pg, pool, task, 'llm');
      result = await chatJson({
        pg,
        task,
        provider,
        sysPrompt,
        usrPrompt,
        mockKey: null,
        params: STEP_PARAMS.l15,
        schemaKey: 'l15',
        degrade: async () => ({
          verdict: 'pass',
          categories: ['review_unavailable'],
          // P5-D3：降级放行的 reason 用机器可读枚举值（与 payload.reason 字段口径一致），
          // 供合规审计/客户端区分"服务不可用放行"与"人工放行"。
          reason: 'compliance_service_unavailable',
        }),
      });
    }

    const verdict = ['pass', 'review', 'reject'].includes(String(result.verdict)) ? String(result.verdict) : 'review';

    return {
      payload: {
        kind: 'compliance_precheck',
        ...(topic || {}),
        verdict,
        categories: Array.isArray(result.categories) ? result.categories : [],
        reason: String(result.reason || '').slice(0, 500),
        passed: verdict === 'pass',
      },
    };
  },
};
