/**
 * L5 图生视频（已下线，PIPELINE_TASK_41，2026-08-17）。
 *
 * i2v 动态视频生成已从产品移除，只保留静态图流程（AI 生图 + 配音 + 字幕 + 合成）。
 * 本步骤恒为 skip：流水线不再产出任何 clip，L8 一律走静态图拼接（Ken Burns 运镜）。
 * 旧任务（DB 里 mode='i2v'）执行到此同样直接跳过 → 跳转到 L6 配音。
 *
 * 产物约定（历史）：tasks/<id>/clips/clip-0N.mp4 → assets(type='clip')。
 * provider 层 i2v 函数（providers/runtime.ts wingrayI2V 等）保留，供模型配置页展示。
 */

import type { StepRunnerInput } from '../queues.js';

export const l5 = {
  async run(_ctx: StepRunnerInput) {
    return { skipped: true };
  },
};
