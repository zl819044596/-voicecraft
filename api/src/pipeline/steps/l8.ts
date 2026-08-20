/**
 * L8 视频合成（委托 render worker）（Phase 4，TS 移植 v2 steps/l8.js）。
 *
 * PIPELINE_TASK_41：i2v 已下线，L5 恒 skip、不再产出 clip。本步一律下发静态
 * compose job（每镜 shot 图 + vo 音频 + 字幕 → final.mp4，Ken Burns 运镜已有）。
 * 返回 { waitingForRender:true }，finalize 由 avs:render:done 回执侧完成。
 */

import { enqueueRender, subtitleJobField } from '../render.js';
import type { StepRunnerInput } from '../queues.js';

export const l8 = {
  async run(ctx: StepRunnerInput) {
    const { redis, task } = ctx;
    const config = task.config || {};
    const synthesis = (config.synthesis || {}) as Record<string, unknown>;
    await enqueueRender(redis, {
      taskId: task.id,
      type: 'compose',
      subtitle: subtitleJobField(task),
      bgmKey: typeof synthesis.bgm === 'string' && synthesis.bgm ? synthesis.bgm : null,
    });
    return { waitingForRender: true };
  },
};
