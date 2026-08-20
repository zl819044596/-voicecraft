/**
 * L7 字幕生成（委托 render worker）（Phase 4，TS 移植 v2 steps/l7.js）。
 *
 * 本步不直接执行：把 srt 渲染 job 下发到 avs:render，返回 { waitingForRender:true }，
 * finalize 由 render.js 的 avs:render:done 回执侧完成（幂等 U11 在那里兜底）。
 * job 字段：{ taskId, type:'srt', subtitleText, subtitle:{enabled,font_size,position,max_chars_per_line} }
 */

import { enqueueRender, subtitleJobField } from '../render.js';
import type { StepRunnerInput } from '../queues.js';

export const l7 = {
  async run(ctx: StepRunnerInput) {
    const { redis, task } = ctx;
    const config = task.config || {};
    await enqueueRender(redis, {
      taskId: task.id,
      type: 'srt',
      subtitleText: (config.subtitle as Record<string, unknown>)?.text || null,
      subtitle: subtitleJobField(task),
    });
    return { waitingForRender: true };
  },
};
