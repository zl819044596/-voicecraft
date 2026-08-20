/**
 * 任务 CRUD + 流水线执行端点（Phase 4，TS 移植 v2 routes/tasks.js）。
 *
 *   POST   /api/tasks                       创建任务（托管档积分冻结）
 *   GET    /api/tasks                       任务列表（分页 + status/mode/track 过滤）
 *   GET    /api/tasks/:id                   任务详情（steps/assets/export/cost/credits 聚合）
 *   POST   /api/tasks/:id/continue          半自动步进：continue 放行下一步 / cancel 取消
 *   POST   /api/tasks/:id/subtitle-settings 字幕参数（chars_per_line/font_size/burn/position）
 *   PUT    /api/tasks/:id/node              节点编辑（script/storyboard/voice/subtitle，暂停态可用）
 *   PUT    /api/tasks/:id/config            落 task.config 的 prompts/templates（三级覆盖持久化）
 *   GET    /api/tasks/:id/assets/:type/:basename  任务资产流式返回
 *
 * tasks 表无 user_id 列：归属经 projects JOIN 校验（防越权）。错误统一
 * {error:{code,message,details?}}，分页 {items,page,size,total}。
 */

import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { query, pool, withTransaction } from '../db.js';
import { requireAuth } from '../session.js';
import { asyncHandler, isUuid, pagination } from '../utils.js';
import { apiError } from '@avs/shared';
import { redis } from '../redis.js';
import { minio } from '../minio.js';
import * as pipeline from '../pipeline/index.js';
import * as state from '../pipeline/state.js';
import * as lib from '../pipeline/lib.js';
import * as rerun from '../pipeline/rerun.js';
import { freezeForTask, refundForTask, TIER_RERUNS_FREE, RERUN_PRICES, chargeForRerun } from '../credits.js';
import type { PipelineCtx, TaskRow } from '../pipeline/types.js';

export const router = Router();

router.use(requireAuth);

// 契约 §7.1 成本预估（与 00-CONTRACT C11 对齐：static 60 / i2v 300 积分）。
// PIPELINE_TASK_41：i2v 已下线，创建任务一律回退 static；i2v 条目保留仅供
// 历史 i2v 任务的 cost_estimate 回显（不再有新建 i2v 任务走此分支）。
const COST_ESTIMATES: Record<string, { provider_cost_usd: string; credits_required: number; note: string }> = {
  static: {
    provider_cost_usd: '0.60-1.80',
    credits_required: 60,
    note: 'static 成片 60 积分（≈$0.60）',
  },
  i2v: {
    provider_cost_usd: '2.40-5.80',
    credits_required: 300,
    note: 'i2v 已下线（2026-08-17）；条目保留供历史任务回显',
  },
};

// MODES 保留 i2v 仅供列表过滤历史任务；创建时 i2v 回退 static（见 createTask）。
const MODES = ['static', 'i2v'];
const TRACKS = ['byok', 'managed'];
const RUN_MODES = ['semi', 'auto'];
const TASK_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'];
const ASPECTS = ['9:16', '16:9', '1:1', '4:3', '4:5'];

// 6 节点展示（PIPELINE_TASK_41）：内部逻辑步 → 展示节点。
// ①文案=L1/L1.5/L2(1,2) · ②分镜拆解=L3(3) · ③逐镜生图=L4(4) ·
// ④配音=L6(6) · ⑤字幕=L7(7) · ⑥合成导出=L8/L9/L10(8,9,10)。
// L5(i2v) 已下线恒 skip，不参与展示。primary 为节点主产出步（payload 取它）。
const DISPLAY_NODES: Array<{ node: number; name: string; steps: number[]; primary: number }> = [
  { node: 1, name: '文案', steps: [1, 2], primary: 2 },
  { node: 2, name: '分镜拆解', steps: [3], primary: 3 },
  { node: 3, name: '逐镜生图', steps: [4], primary: 4 },
  { node: 4, name: '配音', steps: [6], primary: 6 },
  { node: 5, name: '字幕', steps: [7], primary: 7 },
  { node: 6, name: '合成导出', steps: [8, 9, 10], primary: 8 },
];

// BYOK 档必填的模型类（i2v 已下线，不再要求）。
const BYOK_REQUIRED_MODELS = ['llm', 'image', 'tts'];

interface CreditBalanceRow {
  credits: string;
  trial_credits: string;
}

async function loadCreditBalance(userId: string): Promise<{ credits: number; trial_credits: number }> {
  const { rows } = await query<CreditBalanceRow>(
    `SELECT credits, trial_credits FROM credit_accounts WHERE user_id = $1`,
    [userId],
  );
  const row = rows[0];
  return { credits: Number(row?.credits ?? 0), trial_credits: Number(row?.trial_credits ?? 0) };
}

// 兼容前端传 {model_config_id}/{id}/纯 uuid 字符串。
function extractModelId(spec: unknown): string {
  if (spec == null) return '';
  if (typeof spec === 'object') {
    const s = spec as { model_config_id?: unknown; id?: unknown };
    return String(s.model_config_id ?? s.id ?? '').trim();
  }
  return String(spec).trim();
}

interface TaskRowLite {
  id: string;
  project_id: string;
  mode: string;
  track: string;
  run_mode: string;
  status: string;
  current_step: number;
  config: Record<string, unknown>;
  credits_frozen: string | number;
  credits_settled: string | number;
  created_at: Date;
  updated_at: Date;
  tier?: string;
  owner_id?: string;
}

// ---------------------------------------------------------------------------
// createTask — 任务创建核心逻辑（POST /api/tasks 与 projects auto_run 复用）。
// ---------------------------------------------------------------------------
export async function createTask(
  userId: string,
  projectId: string,
  body: Record<string, unknown>,
): Promise<{ task: TaskRowLite; costEstimate: unknown; creditsInfo: unknown }> {
  // PIPELINE_TASK_41：i2v 已下线——收到 mode=i2v 一律回退 static（历史前端/遗留请求兼容）。
  const mode = String(body?.mode ?? '') === 'i2v' ? 'static' : String(body?.mode ?? '');
  const track = String(body?.track ?? '');
  const runMode = String(body?.run_mode ?? '');
  if (!MODES.includes(mode)) throw apiError(422, 'VALIDATION_ERROR', 'mode must be static or i2v');
  if (!TRACKS.includes(track)) throw apiError(422, 'VALIDATION_ERROR', 'track must be byok or managed');
  if (!RUN_MODES.includes(runMode)) throw apiError(422, 'VALIDATION_ERROR', 'run_mode must be semi or auto');

  const config = (body?.config ?? null) as Record<string, unknown> | null;
  if (!config || typeof config !== 'object') {
    throw apiError(422, 'VALIDATION_ERROR', 'config is required');
  }

  // content_language（默认 en）；synthesis.aspect 必填。
  const contentLanguage = String(config.content_language ?? 'en');
  const synthesis = (config.synthesis ?? {}) as Record<string, unknown>;
  const aspect = String(synthesis.aspect ?? '');
  if (!ASPECTS.includes(aspect)) {
    throw apiError(422, 'VALIDATION_ERROR', `synthesis.aspect is required, one of ${ASPECTS.join(', ')}`);
  }
  const subtitleBurn = synthesis.subtitle_burn === undefined ? true : synthesis.subtitle_burn;
  const configSnapshot: Record<string, unknown> = {
    ...config,
    content_language: contentLanguage,
    synthesis: { ...synthesis, aspect, subtitle_burn: subtitleBurn },
  };

  let creditsInfo: unknown = null;

  if (track === 'byok') {
    // BYOK：models.{llm,image,tts} 必须是本人 enabled 的 model_config（i2v 已下线）。
    const models = (config.models ?? {}) as Record<string, unknown>;
    const missing: string[] = [];
    for (const cls of BYOK_REQUIRED_MODELS) {
      const modelId = extractModelId(models[cls]);
      if (!isUuid(modelId)) {
        missing.push(cls);
        continue;
      }
      const { rows } = await query(
        `SELECT 1 FROM model_configs
          WHERE id = $1 AND user_id = $2 AND enabled AND provider_class = $3`,
        [modelId, userId, cls],
      );
      if (rows.length === 0) missing.push(cls);
    }
    if (missing.length > 0) {
      throw apiError(422, 'MISSING_PROVIDER_CONFIG', `missing enabled model config for: ${missing.join(', ')}`, {
        missing,
      });
    }
  } else {
    // managed：models 忽略（平台池调度）。
    // 托管档积分预检（快失败；tx 内 freezeForTask 条件更新兜底并发双花）。
    const balance = await loadCreditBalance(userId);
    const available = balance.credits + balance.trial_credits;
    const required = COST_ESTIMATES[mode].credits_required;
    if (available < required) {
      throw apiError(402, 'INSUFFICIENT_CREDITS', 'insufficient credits for managed track', {
        required,
        available,
      });
    }
  }

  // 回填 cost_estimate（只读字段，契约 §7.1）。
  configSnapshot.cost_estimate = COST_ESTIMATES[mode];

  let task: TaskRowLite | null = null;
  if (track === 'managed') {
    // 托管档创建即冻结 — INSERT tasks 与积分冻结同一事务；冻结失败 402 → 回滚任务行。
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO tasks (project_id, mode, track, run_mode, config)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [projectId, mode, track, runMode, JSON.stringify(configSnapshot)],
      );
      const t = rows[0] as TaskRowLite;
      try {
        creditsInfo = await freezeForTask(client, {
          userId,
          taskId: t.id,
          amount: COST_ESTIMATES[mode].credits_required,
          mode,
        });
      } catch (err) {
        const e = err as { status?: number };
        if (e.status === 402) {
          await client.query(`DELETE FROM tasks WHERE id = $1`, [t.id]);
        }
        throw err;
      }
      task = t;
    });
  } else {
    const { rows } = await query(
      `INSERT INTO tasks (project_id, mode, track, run_mode, config)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [projectId, mode, track, runMode, JSON.stringify(configSnapshot)],
    );
    task = rows[0] as TaskRowLite;
    creditsInfo = { frozen: 0, credits_after: null, trial_credits_after: null };
  }

  return { task: task!, costEstimate: COST_ESTIMATES[mode], creditsInfo };
}

// ---------------------------------------------------------------------------
// POST / — 创建任务（§7.1）
// ---------------------------------------------------------------------------
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const projectId = String(req.body?.project_id ?? '');
    if (!isUuid(projectId)) throw apiError(422, 'VALIDATION_ERROR', 'project_id must be a valid uuid');
    const { rows } = await query(`SELECT 1 FROM projects WHERE id = $1 AND user_id = $2`, [projectId, uid]);
    if (rows.length === 0) throw apiError(404, 'NOT_FOUND', 'project not found');

    const { task, costEstimate, creditsInfo } = await createTask(uid, projectId, req.body ?? {});
    // 创建即入队 avs:steps 开始 L1（auto），或停 L1 等 continue（semi）。
    await pipeline.enqueueNewTask(pool,redis, task as unknown as import('../pipeline/types.js').TaskRow);
    res.status(202).json({
      id: task.id,
      project_id: task.project_id,
      mode: task.mode,
      track: task.track,
      run_mode: task.run_mode,
      status: task.status,
      current_step: task.current_step,
      cost_estimate: costEstimate,
      credits: creditsInfo,
      created_at: task.created_at,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET / — 任务列表（分页 + project_id/status/mode/track 过滤）
// ---------------------------------------------------------------------------
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { page, size, offset } = pagination(req);
    const uid = req.userId!;

    const status = String(req.query.status ?? '').trim();
    const mode = String(req.query.mode ?? '').trim();
    const track = String(req.query.track ?? '').trim();
    if (status && !TASK_STATUSES.includes(status)) throw apiError(422, 'VALIDATION_ERROR', 'invalid status filter');
    if (mode && !MODES.includes(mode)) throw apiError(422, 'VALIDATION_ERROR', 'invalid mode filter');
    if (track && !TRACKS.includes(track)) throw apiError(422, 'VALIDATION_ERROR', 'invalid track filter');

    // project_id 过滤：校验归属（防越权枚举他人项目的任务）。
    const projectId = String(req.query.project_id ?? '').trim();
    if (projectId) {
      if (!isUuid(projectId)) throw apiError(422, 'VALIDATION_ERROR', 'project_id must be a valid uuid');
      const { rows: pr } = await query(`SELECT 1 FROM projects WHERE id = $1 AND user_id = $2`, [projectId, uid]);
      if (pr.length === 0) throw apiError(404, 'NOT_FOUND', 'project not found');
    }

    // tasks 无 user_id：归属经 projects JOIN。
    const where = ['p.user_id = $1'];
    const params: unknown[] = [uid];
    const addFilter = (col: string, value: string) => {
      if (!value) return;
      params.push(value);
      where.push(`t.${col} = $${params.length}`);
    };
    addFilter('status', status);
    addFilter('mode', mode);
    addFilter('track', track);
    if (projectId) {
      params.push(projectId);
      where.push(`t.project_id = $${params.length}`);
    }
    const whereSql = where.join(' AND ');

    const { rows: countRows } = await query(
      `SELECT count(*)::int AS total
         FROM tasks t JOIN projects p ON p.id = t.project_id
        WHERE ${whereSql}`,
      params,
    );
    const total = countRows[0].total;

    // 工作台统计聚合（本月任务数 + 近 7 日按天计数，仅按归属过滤）。
    const [monthRows, weekRows] = await Promise.all([
      query(
        `SELECT count(*)::int AS n
           FROM tasks t JOIN projects p ON p.id = t.project_id
          WHERE p.user_id = $1 AND t.created_at >= date_trunc('month', now())`,
        [uid],
      ),
      query(
        `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(t.id)::int AS n
           FROM generate_series(
                  date_trunc('day', now()) - interval '6 days',
                  date_trunc('day', now()),
                  interval '1 day'
                ) AS d(day)
           LEFT JOIN tasks t
             ON t.created_at >= d.day
            AND t.created_at < d.day + interval '1 day'
            AND t.project_id IN (SELECT id FROM projects WHERE user_id = $1)
          GROUP BY d.day
          ORDER BY d.day`,
        [uid],
      ),
    ]);

    params.push(size, offset);
    const { rows } = await query(
      `SELECT t.*,
              EXTRACT(EPOCH FROM (now() - t.created_at))::int AS elapsed_seconds
         FROM tasks t JOIN projects p ON p.id = t.project_id
        WHERE ${whereSql}
        ORDER BY t.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      items: rows.map((t) => ({
        id: t.id,
        project_id: t.project_id,
        mode: t.mode,
        track: t.track,
        status: t.status,
        current_step: t.current_step,
        progress: state.progressOf(Number(t.current_step)),
        config: t.config, // §7.2 示例未列，但供 products/[id] 关联任务按 config.product_id 过滤
        credits_frozen: Number(t.credits_frozen),
        credits_settled: Number(t.credits_settled),
        created_at: t.created_at,
        updated_at: t.updated_at,
        elapsed_seconds: t.elapsed_seconds,
      })),
      page,
      size,
      total,
      month_total: monthRows.rows[0].n,
      last_7_days: weekRows.rows.map((r) => ({ date: r.day, count: r.n })),
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /:id — 任务详情（§7.3 结构；字段不存在时返回空结构）
// ---------------------------------------------------------------------------
async function loadTask(id: string, uid: string): Promise<TaskRowLite | null> {
  const { rows } = await query(
    `SELECT t.*, p.user_id AS owner_id, u.tier
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN users u   ON u.id = p.user_id
      WHERE t.id = $1`,
    [id],
  );
  const task = rows[0] as (TaskRowLite & { owner_id?: string }) | undefined;
  if (!task || String(task.owner_id) !== String(uid)) return null;
  return task;
}

function assetPublicUrl(taskId: string, type: string, basename: string): string {
  return `/api/tasks/${taskId}/assets/${type}/${basename}`;
}

const ASSET_TYPES = ['shot', 'mp4', 'clip', 'audio', 'srt', 'zip', 'ref', 'image', 'video', 'subtitle'];
const ASSET_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  srt: 'application/x-subrip', txt: 'text/plain', json: 'application/json',
  zip: 'application/zip',
};

router.get(
  '/:id/assets/:type/:basename',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    const type = String(req.params.type ?? '');
    const basename = String(req.params.basename ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    if (!ASSET_TYPES.includes(type)) throw apiError(404, 'NOT_FOUND', 'asset not found');
    if (basename.length > 255 || !/^[A-Za-z0-9._-]+$/.test(basename)) {
      throw apiError(404, 'NOT_FOUND', 'asset not found');
    }
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');
    const { rows } = await query<{ minio_key: string }>(
      `SELECT minio_key FROM assets WHERE task_id = $1 AND type = $2`,
      [id, type],
    );
    const row = rows.find((r) => String(r.minio_key).split('/').pop() === basename);
    if (!row) throw apiError(404, 'NOT_FOUND', 'asset not found');
    let buf: Buffer;
    try {
      buf = await lib.downloadFromMinio(minio, row.minio_key);
    } catch {
      throw apiError(502, 'PROVIDER_ERROR', 'failed to read asset from storage');
    }
    const ext = basename.split('.').pop()?.toLowerCase() ?? '';
    const mime = ASSET_MIME_BY_EXT[ext] ?? 'application/octet-stream';
    res.set('Accept-Ranges', 'bytes');
    res.set('Cache-Control', 'private, max-age=3600');
    // Range 支持（视频/音频播放器依赖 206 分段加载；不支持会导致浏览器拒播）
    const range = req.headers.range;
    if (range && buf.length > 0) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? Math.min(parseInt(m[2], 10), buf.length - 1) : buf.length - 1;
        if (start > end || start >= buf.length) {
          res.status(416).set('Content-Range', `bytes */${buf.length}`).end();
          return;
        }
        const slice = buf.subarray(start, end + 1);
        res.status(206);
        res.set('Content-Type', mime);
        res.set('Content-Length', String(slice.length));
        res.set('Content-Range', `bytes ${start}-${end}/${buf.length}`);
        res.send(slice);
        return;
      }
    }
    res.set('Content-Type', mime);
    res.set('Content-Length', String(buf.length));
    res.send(buf);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    // 任务详情是动态数据（step_results/assets 随流水线变化）：禁止任何缓存层
    // （浏览器启发式缓存 / Cloudflare 边缘）返回旧版详情 → 前端拿到过期 assets 不渲染图片。
    res.set('Cache-Control', 'no-store');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');

    const [stepRows, assetRows, exportRows, costRows, rerunRows] = await Promise.all([
      query(`SELECT * FROM step_results WHERE task_id = $1 ORDER BY step`, [id]),
      query(`SELECT * FROM assets WHERE task_id = $1 ORDER BY created_at`, [id]),
      query(`SELECT * FROM exports WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1`, [id]),
      query(`SELECT step, track, provider, model, units, cost_usd FROM api_cost_log WHERE task_id = $1 ORDER BY step`, [id]),
      query(`SELECT count(*)::int AS n FROM credit_ledger WHERE task_id = $1 AND kind LIKE 'rerun_%'`, [id]),
    ]);
    const staleSteps = await state.computeStale(pool,id);

    // PIPELINE_TASK_41：steps 收敛为 6 展示节点（聚合内部 step_results 行）。
    // 每个节点暴露内部步号 internal_steps，供前端 rerun from_step 换算；
    // payload 取主产出步（primary）的行；status 聚合 failed > running > done > 其它。
    const steps = DISPLAY_NODES.map((node) => {
      const rows = node.steps
        .map((s) => stepRows.rows.find((r) => Number(r.step) === s))
        .filter((r): r is (typeof stepRows.rows)[number] => Boolean(r));
      let status = 'pending';
      if (rows.length > 0) {
        if (rows.some((r) => r.status === 'failed')) status = 'failed';
        else if (rows.some((r) => r.status === 'running')) status = 'running';
        else if (rows.every((r) => r.status === 'done' || r.status === 'skipped')) status = 'done';
        else status = 'queued';
      }
      const primary = rows.find((r) => Number(r.step) === node.primary);
      const payload = (primary?.payload ?? {}) as Record<string, unknown>;
      const errorRow = rows.find((r) => r.status === 'failed');
      return {
        step: node.node,
        internal_steps: node.steps,
        name: node.name,
        // kind 仅文案节点(1)托管档展示 compliance_precheck（L1.5 合规预审）。
        // L1.5 在 step1 行 UPSERT（kind='compliance_precheck'），须读 step1 行
        // payload 而非 primary（primary 是文案主产出步 step2，无 kind 标记）。
        kind:
          node.node === 1 && task.track === 'managed' &&
          (rows.find((r) => Number(r.step) === 1)?.payload as Record<string, unknown> | undefined)?.kind === 'compliance_precheck'
            ? 'compliance_precheck'
            : null,
        status,
        // stale：节点内任一内部步被下游编辑/重跑覆盖但尚未重建（computeStale 派生）。
        stale: node.steps.some((s) => staleSteps.has(s)),
        retries: rows.reduce((sum, r) => sum + (Number(r.retries) || 0), 0),
        payload,
        error: errorRow?.error ?? null,
        started_at: rows.length > 0 ? rows[0].started_at : null,
        finished_at: rows.length > 0 ? rows[rows.length - 1].finished_at : null,
      };
    });

    // storyboard：step3 done 时从 MinIO 取 storyboard.json，失败/缺 → null。
    let storyboard: unknown = null;
    const step3 = stepRows.rows.find((r) => Number(r.step) === 3);
    if (step3 && step3.status === 'done') {
      try {
        const buf = await lib.downloadFromMinio(minio, `tasks/${id}/storyboard.json`);
        storyboard = JSON.parse(buf.toString('utf8'));
      } catch {
        storyboard = null;
      }
    }

    const assets = assetRows.rows.map((r) => {
      const minioKey = String(r.minio_key);
      const basename = minioKey.split('/').pop() || minioKey;
      // index 从 basename 尾部的序号解析（shot-01.png → 1、vo-01.mp3 → 1）。
      // 不要对整条 key 取 (\d+)——会命中 task_id 里的数字（如 6e9d1b06 → 6）。
      const m = basename.match(/(?:vo|clip|shot|img)-?(\d+)/);
      return {
        id: r.id,
        type: r.type,
        index: m ? Number(m[1]) : -1,
        url: assetPublicUrl(task.id, String(r.type), basename),
        size: r.size,
        checksum: r.checksum,
      };
    });

    const exportRow = exportRows.rows[0];
    const export_ = exportRow ? { export_id: exportRow.id, expires_at: exportRow.expires_at } : null;

    // cost 聚合：BYOK 档仅元数据（金额恒 0.00，不计费）。
    const isByok = task.track === 'byok';
    const byStep = costRows.rows.map((r) => ({
      step: r.step,
      track: r.track,
      provider: r.provider,
      model: r.model,
      units: Number(r.units),
      cost_usd: isByok ? '0.00' : Number(r.cost_usd),
    }));
    const apiCostTotal = isByok
      ? '0.00'
      : Number(costRows.rows.reduce((s, r) => s + Number(r.cost_usd), 0));

    // reruns_free 按 tier（未知 → 2）；byok 档不适用（null）。
    const tierKey = String(req.user?.tier ?? '').toLowerCase();
    const rerunsFree = isByok ? null : (TIER_RERUNS_FREE[tierKey] ?? 2);

    res.json({
      id: task.id,
      project_id: task.project_id,
      mode: task.mode,
      track: task.track,
      run_mode: task.run_mode,
      status: task.status,
      current_step: task.current_step,
      progress: state.progressOf(Number(task.current_step)),
      config: task.config ?? {},
      cost_estimate: (task.config?.cost_estimate as unknown) ?? COST_ESTIMATES[task.mode],
      steps,
      storyboard,
      assets,
      export: export_,
      cost: { api_cost_total_usd: apiCostTotal, by_step: byStep },
      credits: {
        frozen: Number(task.credits_frozen),
        settled: Number(task.credits_settled),
        reruns_used: rerunRows.rows[0]?.n ?? 0,
        reruns_free: rerunsFree,
        rerun_price: isByok ? null : RERUN_PRICES,
      },
      created_at: task.created_at,
    });
  }),
);

// ---------------------------------------------------------------------------
// PUT /:id/config — 落 task.config 的 prompts/templates（三级覆盖持久化）。
// ---------------------------------------------------------------------------
router.put(
  '/:id/config',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of ['prompts', 'templates', 'rules']) {
      if (body[key] === undefined) continue;
      const val = body[key];
      if (val === null) {
        patch[key] = {};
        continue;
      }
      if (typeof val !== 'object' || Array.isArray(val)) {
        throw apiError(422, 'VALIDATION_ERROR', `${key} must be an object`);
      }
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (typeof v === 'string' || v === null) clean[k] = v;
        else if (typeof v === 'number' || typeof v === 'boolean') clean[k] = String(v);
        else throw apiError(422, 'VALIDATION_ERROR', `${key}.${k} must be a string or null`);
      }
      patch[key] = clean;
    }
    if (Object.keys(patch).length === 0) {
      throw apiError(422, 'VALIDATION_ERROR', 'no updatable config provided (prompts/templates/rules)');
    }

    await state.patchTaskConfig(pool,id, patch);
    const mergedConfig = { ...(task.config ?? {}), ...patch };
    res.json({ id, config: mergedConfig });
  }),
);

// ---------------------------------------------------------------------------
// POST /:id/continue — { action: 'continue' | 'cancel' } 推进/取消半自动流水线
// ---------------------------------------------------------------------------
router.post(
  '/:id/continue',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');

    const action = String(req.body?.action ?? 'continue');

    if (action === 'cancel') {
      if (!state.isPaused(task as unknown as import('../pipeline/types.js').TaskRow)) {
        throw apiError(409, 'TASK_RUNNING', 'only a paused task can be cancelled');
      }
      await query(`UPDATE tasks SET status = 'cancelled', updated_at = now() WHERE id = $1`, [id]);
      // 取消即全额解冻（fire-and-forget，不阻塞响应；内部幂等）。
      refundForTask(id).catch(() => {});
      res.json({ id, status: 'cancelled' });
    }
    if (action !== 'continue') {
      throw apiError(422, 'VALIDATION_ERROR', "action must be 'continue' or 'cancel'");
    }

    if (!state.isPaused(task as unknown as import('../pipeline/types.js').TaskRow)) {
      throw apiError(409, 'TASK_RUNNING', 'task is not paused');
    }

    const resumed = await state.resumeTask(pool,id);
    if (!resumed) throw apiError(409, 'TASK_RUNNING', 'task is not paused');

    // 复核门放行：记 review_passed，后续 L8 不再拦截。
    if (resumed.kind === 'review_gate') {
      await state.patchTaskConfig(pool,id, { review_passed: true });
    }

    const priority = await state.priorityKey(pool,task as unknown as import('../pipeline/types.js').TaskRow);
    await state.enqueueStep(redis, { taskId: id, step: resumed.step, priority });
    res.json({ id, status: 'running', current_step: resumed.step });
  }),
);

// ---------------------------------------------------------------------------
// POST /:id/run-mode — 中途切换运行模式（semi 逐步确认 ↔ auto 自动跑完）。
// semi→auto：清暂停并自动放行当前暂停步骤（复核门 L8 除外——产品设计保留人工确认）；
// auto→semi：仅改模式，下次暂停自然生效。
// ---------------------------------------------------------------------------
router.post(
  '/:id/run-mode',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');

    const mode = String(req.body?.run_mode ?? '');
    if (!['semi', 'auto'].includes(mode)) {
      throw apiError(422, 'VALIDATION_ERROR', "run_mode must be 'semi' or 'auto'");
    }
    const t = task as unknown as import('../pipeline/types.js').TaskRow;
    if (t.status === 'done' || t.status === 'failed' || t.status === 'cancelled') {
      throw apiError(409, 'TASK_FINISHED', 'task is finished');
    }

    await query(`UPDATE tasks SET run_mode = $2, updated_at = now() WHERE id = $1`, [id, mode]);

    // semi→auto 且当前暂停（非复核门）→ 自动放行，流水线继续跑。
    if (mode === 'auto' && state.isPaused(t)) {
      const { rows } = await query(`SELECT config->>'pause_kind' AS kind FROM tasks WHERE id = $1`, [id]);
      const kind = rows[0]?.kind;
      if (kind !== 'review_gate') {
        const resumed = await state.resumeTask(pool, id);
        if (resumed) {
          const priority = await state.priorityKey(pool, t);
          await state.enqueueStep(redis, { taskId: id, step: resumed.step, priority });
          res.json({ id, run_mode: mode, resumed: true, current_step: resumed.step });
          return;
        }
      }
    }
    res.json({ id, run_mode: mode, resumed: false });
  }),
);

// ---------------------------------------------------------------------------
// POST /:id/subtitle-settings — 更新字幕设置；L7 已产出 → 重置 step7+ 从 step7 重跑。
// ---------------------------------------------------------------------------
router.post(
  '/:id/subtitle-settings',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const subtitlePatch: Record<string, unknown> = {};

    if (body.chars_per_line !== undefined) {
      const v = Number(body.chars_per_line);
      if (!Number.isInteger(v) || v < 5 || v > 100) {
        throw apiError(422, 'VALIDATION_ERROR', 'chars_per_line must be an integer 5-100');
      }
      subtitlePatch.chars_per_line = v;
    }
    if (body.font_size !== undefined) {
      const v = Number(body.font_size);
      if (!Number.isInteger(v) || v < 12 || v > 96) {
        throw apiError(422, 'VALIDATION_ERROR', 'font_size must be an integer 12-96');
      }
      subtitlePatch.font_size = v;
    }
    if (body.position !== undefined) {
      if (!['top', 'bottom'].includes(String(body.position))) {
        throw apiError(422, 'VALIDATION_ERROR', "position must be 'top' or 'bottom'");
      }
      subtitlePatch.position = body.position;
    }
    if (Object.keys(subtitlePatch).length > 0) {
      patch.subtitle = { ...((task.config?.subtitle as Record<string, unknown>) ?? {}), ...subtitlePatch };
    }
    if (body.subtitle_burn !== undefined) {
      if (typeof body.subtitle_burn !== 'boolean') {
        throw apiError(422, 'VALIDATION_ERROR', 'subtitle_burn must be a boolean');
      }
      patch.synthesis = {
        ...((task.config?.synthesis as Record<string, unknown>) ?? {}),
        subtitle_burn: body.subtitle_burn,
      };
    }

    if (Object.keys(patch).length === 0) {
      throw apiError(422, 'VALIDATION_ERROR', 'no subtitle settings provided');
    }

    await state.patchTaskConfig(pool,id, patch);
    const mergedConfig = { ...(task.config ?? {}), ...patch };

    // L7 已 done → 重置 step7/8/9/10 + 清 srt/mp4/zip 产物，从 step7 force 重跑。
    // L9/L10 也必须清行，否则下游旧 done 行触发 runStep 幂等守卫丢弃 job 卡死。
    const staleSteps: number[] = [];
    const srtStep = await state.stepResult(pool,id, 7);
    if (srtStep && srtStep.status === 'done') {
      staleSteps.push(7, 8, 9, 10);
      const srtKey = `tasks/${id}/subtitles.srt`;
      const mp4Key = `tasks/${id}/final.mp4`;
      const exportPrefix = `tasks/${id}/export/`;
      await query(`DELETE FROM step_results WHERE task_id = $1 AND step IN (7, 8, 9, 10)`, [id]);
      await query(
        `DELETE FROM assets
          WHERE task_id = $1 AND (minio_key IN ($2, $3) OR minio_key LIKE $4 || '%')`,
        [id, srtKey, mp4Key, exportPrefix],
      );
      await lib.dropMinioObject(minio, srtKey);
      await lib.dropMinioObject(minio, mp4Key);
      await lib.dropMinioPrefix(minio, exportPrefix);
      // runStep 守卫丢弃终态任务的 job —— 先复位回 queued 再入队。
      await query(`UPDATE tasks SET status = 'queued', current_step = 7, updated_at = now() WHERE id = $1`, [id]);
      const priority = await state.priorityKey(pool,task as unknown as import('../pipeline/types.js').TaskRow);
      await state.enqueueStep(redis, { taskId: id, step: 7, priority, force: true });
    }

    res.json({ id, config: mergedConfig, stale_steps: staleSteps });
  }),
);

// ---------------------------------------------------------------------------
// PUT /:id/node — { node, payload } 受控步进节点写入（仅 paused 态可用）。
// ---------------------------------------------------------------------------
router.put(
  '/:id/node',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');
    if (!state.isPaused(task as unknown as import('../pipeline/types.js').TaskRow)) {
      throw apiError(409, 'TASK_RUNNING', 'node edits require a paused task');
    }

    const node = String(req.body?.node ?? '');
    const payload = (req.body?.payload ?? null) as Record<string, unknown> | null;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw apiError(422, 'VALIDATION_ERROR', 'payload must be an object');
    }

    const prev = await lib.getPrevPayloads(pool,id);

    if (node === 'script') {
      if (!prev[2]) throw apiError(409, 'NODE_NOT_EDITABLE', 'script step has not completed yet');
      const merged = { ...(prev[2] ?? { kind: 'script' }), ...payload };
      await lib.markStepDone(pool,id, 2, merged);
      const paragraphs = Array.isArray(merged.script_paragraphs) ? (merged.script_paragraphs as string[]) : [];
      const md = [`# ${merged.hook || '视频文案'}`, '', ...paragraphs.map((p, i) => `### 段落 ${i + 1}\n\n${p}`), ''].join('\n');
      await lib.uploadToMinio(minio, `tasks/${id}/script.md`, Buffer.from(md, 'utf8'), 'text/markdown');
      await rerun.markNodeEdited(pool,id, 2);
      res.json({ id, node, status: 'ok' });
    }

    if (node === 'storyboard') {
      const aspect = String((task.config?.synthesis as Record<string, unknown>)?.aspect || '16:9');
      const sb = await lib.readStoryboard(minio, id, aspect);
      if (!sb) throw apiError(409, 'STORYBOARD_MISSING', 'storyboard not generated yet');
      if (!Array.isArray(payload.shots)) throw apiError(422, 'VALIDATION_ERROR', 'payload.shots must be an array');
      // 按 index 合并而非整组替换（Node 4/6 只回传部分字段）；删除/重排由数组长度决定。
      const prevByIndex = new Map(sb.shots.map((s) => [Number(s?.index), s]));
      sb.shots = (payload.shots as Record<string, unknown>[]).map((s, i) => {
        const idx = Number(s?.index) || i + 1;
        return lib.normalizeShot({ ...(prevByIndex.get(idx) ?? {}), ...s }, idx, aspect);
      });
      sb.generated_at = new Date().toISOString();
      await lib.writeStoryboard(minio, id, sb);
      await lib.markStepDone(pool,id, 3, {
        ...(prev[3] ?? { kind: 'storyboard', aspect }),
        shot_count: sb.shots.length,
      });
      await rerun.markNodeEdited(pool,id, 3);
      res.json({ id, node, status: 'ok' });
    }

    if (node === 'voice') {
      const aspect = String((task.config?.synthesis as Record<string, unknown>)?.aspect || '16:9');
      const sb = await lib.readStoryboard(minio, id, aspect);
      if (!sb) throw apiError(409, 'STORYBOARD_MISSING', 'storyboard not generated yet');
      const edits =
        payload.index !== undefined
          ? [{ index: Number(payload.index), voiceover: payload.voiceover }]
          : Array.isArray(payload.shots)
            ? (payload.shots as Array<{ index: unknown; voiceover: unknown }>)
            : null;
      if (!edits) {
        throw apiError(422, 'VALIDATION_ERROR', 'payload needs {index, voiceover} or {shots: [{index, voiceover}]}');
      }
      for (const e of edits) {
        const shot = sb.shots.find((s) => Number(s.index) === Number(e.index));
        if (!shot) throw apiError(404, 'SHOT_NOT_FOUND', `shot ${e.index} not found`);
        if (e.voiceover === undefined) {
          throw apiError(422, 'VALIDATION_ERROR', 'voiceover is required for each shot');
        }
        shot.voiceover = String(e.voiceover);
      }
      await lib.writeStoryboard(minio, id, sb);
      await rerun.markNodeEdited(pool,id, 6);
      res.json({ id, node, status: 'ok' });
    }

    if (node === 'subtitle') {
      if (!prev[7]) throw apiError(409, 'NODE_NOT_EDITABLE', 'subtitle step has not completed yet');
      const srtText = payload.srt_text ?? payload.text;
      if (!srtText || typeof srtText !== 'string') {
        throw apiError(422, 'VALIDATION_ERROR', 'payload.srt_text is required');
      }
      await lib.uploadToMinio(minio, `tasks/${id}/subtitles.srt`, Buffer.from(srtText, 'utf8'), 'application/x-subrip');
      await lib.markStepDone(pool,id, 7, {
        ...(prev[7] ?? { kind: 'subtitle' }),
        ...payload,
        edited: true,
      });
      await rerun.markNodeEdited(pool,id, 7);
      res.json({ id, node, status: 'ok' });
    }

    throw apiError(422, 'INVALID_NODE', 'node must be one of script/storyboard/voice/subtitle');
  }),
);

// ---------------------------------------------------------------------------
// 便捷重跑（03-接口文档 §7.7–§7.14）
//
// 语义（00-CONTRACT §3 重跑 / §7.2 重生成）：单步重跑 / 单节点重生成 / 脚本版本 /
// 候选图管理。托管档按档位计重跑次数：免费额度内 charged_credits=0，超额按模式
// 单价（static 20 / i2v 80）扣积分；BYOK 不计量（charged 恒 0、reruns_used 不计）。
//
// 统一骨架：
//   1. 归属校验 + 非运行态（409 TASK_RUNNING）
//   2. chargeForRerun 计费（必须在本步自增 config.rerun_count 之前调用）
//   3. 同步重生成目标节点（HTTP 请求内完成，回传 new_version_id / candidates / clip_candidates）
//   4. rerunFromStep(fromStep)：清洗该步及下游 step_results+assets → 复位 queued →
//      自增 rerun_count → 延时入队 force 重跑
// 下游 stale 清单按 §7.9–7.14 逐一给出。§7.11 的 i2v 分支同步重出该镜片段，使
// 非连续 stale（[5,8,9,10]）退化为 rerunFromStep(8) 的连续下游，semi 模式逐步
// 入队 pause 亦自然衔接。
// ---------------------------------------------------------------------------

const STALE_AFTER_SCRIPT = [3, 4, 5, 6, 7, 8, 9, 10];
const STALE_AFTER_STORYBOARD = [4, 5, 6, 7, 8, 9, 10];
const STALE_AFTER_SHOT_IMAGE_STATIC = [8, 9, 10];
const STALE_AFTER_VOICE = [7, 8, 9, 10];

interface ScriptVersion {
  version_id: string;
  note: string | null;
  selected: boolean;
  text: string;
  created_at: string;
}

function rangeSteps(from: number, to: number): number[] {
  const out: number[] = [];
  for (let s = from; s <= to; s += 1) out.push(s);
  return out;
}

// 候选图公开 id：由 minio_key 确定性派生（frontend 原样回传即可，无额外存储）。
function candidateId(key: string): string {
  return `cand_${createHash('sha1').update(key).digest('hex').slice(0, 8)}`;
}

// 下游存在未重跑的用户编辑 → 重跑将覆盖，返回提示（§7.7「前端二次确认」依据）。
function downstreamEditsWarning(task: TaskRowLite, fromStep: number): string | null {
  const edits = Array.isArray(task.config?.node_edits) ? (task.config.node_edits as Array<{ step: unknown }>) : [];
  const hits = edits.map((e) => Number(e.step)).filter((s) => Number.isInteger(s) && s >= fromStep);
  if (hits.length === 0) return null;
  return `下游存在未重跑的用户编辑（步骤 ${hits.join(', ')}），重跑将覆盖这些产物`;
}

function pipelineCtx(): PipelineCtx {
  return { pg: pool, redis, minio };
}

// 运行中（或排队未暂停）的任务不可重跑/重生成。
// semi 模式每步暂停时 status 仍为 'running'（config.paused=true），此时应允许重跑——
// worker 的 runStep 会跳过 paused 任务，无并发写冲突。
function assertRerunnable(task: TaskRowLite): void {
  const t = task as unknown as TaskRow;
  const paused = state.isPaused(t);
  if ((t.status === 'running' || t.status === 'queued') && !paused) {
    throw apiError(409, 'TASK_RUNNING', 'task is currently running');
  }
}

async function requireStepDone(taskId: string, step: number, message: string): Promise<void> {
  const s = await state.stepResult(pool, taskId, step);
  if (!s || s.status !== 'done') throw apiError(409, 'STEP_NOT_READY', message);
}

// 把 text 落为 step2 产出（payload + script.md + node_edits(2)）。仅当 step2 已有
// 历史产出时调用（否则版本仅记录，待流水线 L2 产出后再选用）；返回是否已落产出。
async function applyScriptText(taskId: string, text: string): Promise<boolean> {
  const prev = await lib.getPrevPayloads(pool, taskId);
  if (!prev[2]) return false;
  let paragraphs: string[] = [];
  if (text.includes('### 段落')) {
    paragraphs = text.split(/###\s*段落\s*\d+\s*/).map((s) => s.trim()).filter(Boolean);
  } else {
    paragraphs = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  }
  if (paragraphs.length === 0) {
    const existing = Array.isArray(prev[2].script_paragraphs) ? (prev[2].script_paragraphs as string[])[0] : null;
    paragraphs = [text.trim() || String(existing ?? '视频文案')];
  }
  const firstLine = text.split('\n')[0]?.replace(/^#+\s*/, '').trim() || '';
  const payload: Record<string, unknown> = {
    kind: 'script',
    script_paragraphs: paragraphs.map((p) => p.slice(0, 2000)),
    hook: String(firstLine || prev[2].hook || '').slice(0, 500),
    cta: String(paragraphs[paragraphs.length - 1] || prev[2].cta || '').slice(0, 500),
    edited: true,
  };
  await lib.markStepDone(pool, taskId, 2, payload);
  const md = [`# ${payload.hook}`, '', ...paragraphs.map((p, i) => `### 段落 ${i + 1}\n\n${p}`), ''].join('\n');
  await lib.uploadToMinio(minio, `tasks/${taskId}/script.md`, Buffer.from(md, 'utf8'), 'text/markdown');
  await rerun.markNodeEdited(pool, taskId, 2);
  return true;
}

// 追加一个脚本版本（新版本 selected=true，其余反选）。返回新 version_id。
async function recordScriptVersion(
  task: TaskRowLite,
  payload: Record<string, unknown>,
  note: string | null,
): Promise<string> {
  const versions = Array.isArray(task.config?.script_versions) ? (task.config.script_versions as ScriptVersion[]) : [];
  const seq = Number(task.config?.script_versions_seq) || versions.length;
  const versionId = `sv_${String(seq + 1).padStart(2, '0')}`;
  const paragraphs = Array.isArray(payload.script_paragraphs) ? (payload.script_paragraphs as string[]) : [];
  const text = [`# ${payload.hook || '视频文案'}`, '', ...paragraphs.map((p, i) => `### 段落 ${i + 1}\n\n${p}`), ''].join('\n');
  const next: ScriptVersion[] = [
    ...versions.map((v) => ({ ...v, selected: false })),
    { version_id: versionId, note, selected: true, text, created_at: new Date().toISOString() },
  ];
  await state.patchTaskConfig(pool, task.id, { script_versions: next, script_versions_seq: seq + 1 });
  return versionId;
}

function publicVersions(versions: ScriptVersion[]) {
  return versions.map((v) => ({ version_id: v.version_id, note: v.note, selected: v.selected, created_at: v.created_at }));
}

function publicCandidate(task: TaskRowLite, c: lib.ShotCandidate) {
  const basename = String(c.key).split('/').pop() || c.key;
  return { candidate_id: candidateId(c.key), url: assetPublicUrl(task.id, 'shot', basename), selected: c.is_default === true };
}

// 候选图（op=add 的 minio_key）可能不在 assets 表 → 补齐行，保证 /assets 可读。
async function ensureAssetRow(taskId: string, minioKey: string): Promise<void> {
  const { rows } = await query(`SELECT 1 FROM assets WHERE task_id = $1 AND minio_key = $2`, [taskId, minioKey]);
  if ((rows.length ?? 0) > 0) return;
  let size: number | null = null;
  try {
    const b = await lib.downloadFromMinio(minio, minioKey);
    size = b.length;
  } catch {
    /* 外部 key 可能不可读；size 留空 */
  }
  await lib.insertAsset(pool, taskId, 'shot', minioKey, size);
}

// ---------------------------------------------------------------------------
// POST /:id/rerun — 单步重跑（§7.7）
// ---------------------------------------------------------------------------
router.post(
  '/:id/rerun',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');
    assertRerunnable(task);

    const fromStep = Number(req.body?.from_step);
    const scope = String(req.body?.scope ?? 'step');
    const shotIndex = req.body?.shot_index === undefined || req.body?.shot_index === null ? null : Number(req.body?.shot_index);
    if (!Number.isInteger(fromStep) || fromStep < 1 || fromStep > 10) {
      throw apiError(422, 'INVALID_STEP', 'from_step must be an integer 1-10');
    }
    // PIPELINE_TASK_41：L5(i2v) 已下线——整步/单镜重跑一律 410，避免前端 404 难看。
    if (fromStep === 5) {
      throw apiError(410, 'I2V_DISCONTINUED', 'i2v 图生视频已下线（2026-08-17），无法重跑该步骤');
    }
    if (scope === 'shot') {
      if (![4, 6].includes(fromStep)) {
        throw apiError(422, 'INVALID_STEP', 'scope=shot only supports from_step 4/6（L5 已下线）');
      }
      if (!shotIndex || !Number.isInteger(shotIndex) || shotIndex < 1) {
        throw apiError(422, 'VALIDATION_ERROR', 'shot_index is required when scope=shot');
      }
    } else if (scope !== 'step') {
      throw apiError(422, 'VALIDATION_ERROR', "scope must be 'step' or 'shot'");
    }
    // 不能重跑尚未到达的步骤（max(step_results.step) 为已产出最远步）。
    const { rows: pr } = await query(
      `SELECT coalesce(max(step), 0)::int AS m FROM step_results WHERE task_id = $1`,
      [id],
    );
    if (fromStep > pr[0].m) {
      throw apiError(422, 'INVALID_STEP', `from_step ${fromStep} has not been produced yet (furthest step: ${pr[0].m})`);
    }

    const t = task as unknown as TaskRow;
    // PIPELINE_TASK_41：i2v 已下线，重跑统一按 static 计费（历史 i2v 任务同样收敛）。
    const charge = await chargeForRerun(id, 'static'); // 计费基于旧 rerun_count
    const ctx = pipelineCtx();
    let cleanedSteps: number[];
    let warning = downstreamEditsWarning(task, fromStep);

    if (scope === 'shot') {
      // 单镜重跑：委托对应便捷重生成 + 重排下游（语义同 §7.11/7.13，L5 已下线）。
      // shotIndex 已在 scope=shot 守卫中校验为 ≥1 的整数。
      const shot = shotIndex as number;
      if (fromStep === 4) {
        await rerun.regenerateShotImage(ctx, t, shot);
        cleanedSteps = STALE_AFTER_SHOT_IMAGE_STATIC;
        await rerun.rerunFromStep(ctx, t, 8);
      } else {
        const voice = await rerun.regenerateVoice(ctx, t, shot);
        if (voice.warning) {
          warning = `${warning ? warning + '；' : ''}配音回退（${String((voice.warning as { reason?: string })?.reason ?? '')}）`;
        }
        cleanedSteps = STALE_AFTER_VOICE;
        await rerun.rerunFromStep(ctx, t, 7);
      }
    } else {
      cleanedSteps = rangeSteps(fromStep, 10);
      await rerun.rerunFromStep(ctx, t, fromStep);
    }

    res.json({
      id,
      status: 'running',
      rerun: {
        from_step: fromStep,
        cleaned_steps: cleanedSteps,
        reruns_used: charge.reruns_free === -1 ? 0 : charge.reruns_used + 1,
        reruns_free: charge.reruns_free,
        charged_credits: charge.charged_credits,
        credits_after: charge.credits_after,
        ...(warning ? { warning } : {}),
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /:id/script/versions — 脚本版本保存/选用（§7.8）
// ---------------------------------------------------------------------------
router.post(
  '/:id/script/versions',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');
    assertRerunnable(task); // 写 step2 产出需任务非运行中

    const op = String(req.body?.op ?? '');
    const versions = Array.isArray(task.config?.script_versions) ? (task.config.script_versions as ScriptVersion[]) : [];

    if (op === 'save') {
      const text = String(req.body?.text ?? '').trim();
      if (!text) throw apiError(422, 'VALIDATION_ERROR', 'text is required');
      const note = req.body?.note === undefined || req.body?.note === null ? null : String(req.body.note).slice(0, 200);
      const seq = Number(task.config?.script_versions_seq) || versions.length;
      const versionId = `sv_${String(seq + 1).padStart(2, '0')}`;
      const next: ScriptVersion[] = [
        ...versions.map((v) => ({ ...v, selected: false })),
        { version_id: versionId, note, selected: true, text, created_at: new Date().toISOString() },
      ];
      await state.patchTaskConfig(pool, id, { script_versions: next, script_versions_seq: seq + 1 });
      const applied = await applyScriptText(id, text); // 新文案作为当前脚本 → 下游 stale
      res.json({ versions: publicVersions(next), stale_steps: applied ? STALE_AFTER_SCRIPT : [] });
      return;
    }

    if (op === 'select') {
      const versionId = String(req.body?.version_id ?? '');
      const target = versions.find((v) => v.version_id === versionId);
      if (!target) throw apiError(404, 'VERSION_NOT_FOUND', `script version ${versionId} not found`);
      const next = versions.map((v) => ({ ...v, selected: v.version_id === versionId }));
      await state.patchTaskConfig(pool, id, { script_versions: next });
      const applied = await applyScriptText(id, target.text);
      res.json({ versions: publicVersions(next), stale_steps: applied ? STALE_AFTER_SCRIPT : [] });
      return;
    }

    throw apiError(422, 'VALIDATION_ERROR', "op must be 'save' or 'select'");
  }),
);

// ---------------------------------------------------------------------------
// POST /:id/script/regenerate — 文案重写（§7.9，同步重生成 + 下游重排）
// ---------------------------------------------------------------------------
router.post(
  '/:id/script/regenerate',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');
    assertRerunnable(task);
    await requireStepDone(id, 1, 'topic/script step has not been produced yet');

    const t = task as unknown as TaskRow;
    const charge = await chargeForRerun(id, 'static'); // i2v 已下线，统一 static
    const ctx = pipelineCtx();
    const instruction = req.body?.instruction === undefined ? undefined : String(req.body.instruction).slice(0, 2000);
    const payload = await rerun.regenerateScript(ctx, t, instruction); // 同步重写 step2 + script.md + node_edits(2)
    const newVersionId = await recordScriptVersion(task, payload, instruction ? `改写：${instruction.slice(0, 60)}` : null);
    await rerun.rerunFromStep(ctx, t, 3); // 清洗 3-10，自增，入队 step3
    res.json({ id, step: 2, status: 'running', new_version_id: newVersionId, stale_steps: STALE_AFTER_SCRIPT });
  }),
);

// ---------------------------------------------------------------------------
// POST /:id/storyboard/regenerate — 分镜全量重拆（§7.10）
// ---------------------------------------------------------------------------
router.post(
  '/:id/storyboard/regenerate',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');
    assertRerunnable(task);
    await requireStepDone(id, 2, 'script step has not been produced yet');

    const t = task as unknown as TaskRow;
    const charge = await chargeForRerun(id, 'static'); // i2v 已下线，统一 static
    const ctx = pipelineCtx();
    const preset = req.body?.preset === undefined ? undefined : String(req.body.preset).slice(0, 50);
    const instruction = req.body?.instruction === undefined ? undefined : String(req.body.instruction).slice(0, 2000);
    await rerun.regenerateStoryboard(ctx, t, preset, instruction); // 同步重写 storyboard.json + step3 + node_edits(3)
    await rerun.rerunFromStep(ctx, t, 4); // 清洗 4-10，自增，入队 step4
    res.json({ id, step: 3, status: 'running', stale_steps: STALE_AFTER_STORYBOARD });
  }),
);

// ---------------------------------------------------------------------------
// POST /:id/shots/:index/regenerate — 单镜生图重生成（§7.11）
// ---------------------------------------------------------------------------
router.post(
  '/:id/shots/:index/regenerate',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');
    assertRerunnable(task);
    await requireStepDone(id, 3, 'storyboard has not been produced yet');

    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 1) throw apiError(422, 'INVALID_STEP', 'shot index must be a positive integer');

    const t = task as unknown as TaskRow;
    const charge = await chargeForRerun(id, 'static'); // i2v 已下线，统一 static
    const ctx = pipelineCtx();

    // prompt_override → 更新该镜 prompt（持久化，等同用户编辑该镜）；reference_asset_id
    // 预留：当前 image 通道不支持参考图，接受但忽略（docs §7.11 均可选）。
    const override = req.body?.prompt_override === undefined ? null : String(req.body.prompt_override).slice(0, 1000);
    if (override) {
      const aspect = String((task.config?.synthesis as Record<string, unknown>)?.aspect || '16:9');
      const sb = await lib.readStoryboard(minio, id, aspect);
      const shot = sb?.shots?.[index - 1];
      if (!shot) throw apiError(404, 'SHOT_NOT_FOUND', `shot ${index} not found`);
      shot.prompt = override;
      shot.motion = override; // motion 供 Ken Burns 运镜使用
      sb.generated_at = new Date().toISOString();
      await lib.writeStoryboard(minio, id, sb);
    }

    await rerun.regenerateShotImage(ctx, t, index); // 新图 → canonical + candidates + node_edits(4)
    await rerun.rerunFromStep(ctx, t, 8); // 清洗 8-10，自增，入队 step8
    res.json({
      id,
      step: 4,
      shot_index: index,
      status: 'running',
      stale_steps: STALE_AFTER_SHOT_IMAGE_STATIC,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /:id/shots/:index/candidates — 单镜候选图记录/选择（§7.12）
// ---------------------------------------------------------------------------
router.post(
  '/:id/shots/:index/candidates',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');

    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 1) throw apiError(422, 'VALIDATION_ERROR', 'shot index must be a positive integer');
    const aspect = String((task.config?.synthesis as Record<string, unknown>)?.aspect || '16:9');
    const sb = await lib.readStoryboard(minio, id, aspect);
    if (!sb) throw apiError(409, 'STORYBOARD_MISSING', 'storyboard not generated yet');
    const shot = sb.shots[index - 1];
    if (!shot) throw apiError(404, 'SHOT_NOT_FOUND', `shot ${index} not found`);
    const candidates = Array.isArray(shot.candidates) ? (shot.candidates as lib.ShotCandidate[]) : [];

    const op = String(req.body?.op ?? '');

    if (op === 'add') {
      // 记录新候选（不改变当前图 → 无下游 stale）。
      const minioKey = String(req.body?.minio_key ?? '');
      if (!minioKey) throw apiError(422, 'VALIDATION_ERROR', 'minio_key is required');
      if (!candidates.some((c) => c.key === minioKey)) {
        candidates.push({ key: minioKey, is_default: false });
        await ensureAssetRow(id, minioKey);
        shot.candidates = candidates;
        sb.generated_at = new Date().toISOString();
        await lib.writeStoryboard(minio, id, sb);
      }
      const selected = candidates.find((c) => c.is_default);
      res.json({
        shot_index: index,
        selected_candidate_id: selected ? candidateId(selected.key) : null,
        candidates: candidates.map((c) => publicCandidate(task, c)),
        stale_steps: [],
      });
      return;
    }

    if (op === 'select') {
      const candId = String(req.body?.candidate_id ?? '');
      const target = candidates.find((c) => candidateId(c.key) === candId);
      if (!target) throw apiError(404, 'CANDIDATE_NOT_FOUND', `candidate ${candId} not found`);
      if (target.is_default) {
        // 已是当前图 → 幂等返回，无重排。
        res.json({
          shot_index: index,
          selected_candidate_id: candId,
          candidates: candidates.map((c) => publicCandidate(task, c)),
          stale_steps: [],
        });
        return;
      }
      assertRerunnable(task);
      await requireStepDone(id, 3, 'storyboard has not been produced yet');

      // 拷贝候选内容 → canonical 槽位（compose / l5 读 canonical shot-NN.png）。
      const canonical = lib.canonicalKeys(id, index).image;
      const buf = await lib.downloadFromMinio(minio, target.key);
      await lib.uploadToMinio(minio, canonical, buf, 'image/png');
      candidates.forEach((c) => {
        c.is_default = c.key === target.key;
      });
      shot.candidates = candidates;
      sb.generated_at = new Date().toISOString();
      await lib.writeStoryboard(minio, id, sb);
      await rerun.markNodeEdited(pool, id, 4);

      // 下游重排：与 §7.11 一致（i2v 已下线，仅重建静态下游）。
      const t = task as unknown as TaskRow;
      const charge = await chargeForRerun(id, 'static'); // i2v 已下线，统一 static
      const ctx = pipelineCtx();
      await rerun.rerunFromStep(ctx, t, 8);
      res.json({
        shot_index: index,
        selected_candidate_id: candId,
        candidates: candidates.map((c) => publicCandidate(task, c)),
        stale_steps: STALE_AFTER_SHOT_IMAGE_STATIC,
      });
      return;
    }

    throw apiError(422, 'VALIDATION_ERROR', "op must be 'add' or 'select'");
  }),
);

// ---------------------------------------------------------------------------
// POST /:id/voice/regenerate — 单镜配音重生成（§7.13）
// ---------------------------------------------------------------------------
router.post(
  '/:id/voice/regenerate',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');
    assertRerunnable(task);
    await requireStepDone(id, 3, 'storyboard has not been produced yet');

    const index = Number(req.body?.index);
    if (!Number.isInteger(index) || index < 1) throw apiError(422, 'VALIDATION_ERROR', 'index must be a positive integer');

    // body.voice/speed 为本次配音覆盖 → 持久化到 config.tts（影响后续重生成）。
    const ttsPatch: Record<string, unknown> = {};
    if (req.body?.voice !== undefined) ttsPatch.voice = String(req.body.voice).slice(0, 64);
    if (req.body?.speed !== undefined) {
      const s = Number(req.body.speed);
      if (!Number.isFinite(s) || s <= 0 || s > 3) throw apiError(422, 'VALIDATION_ERROR', 'speed must be a number in (0, 3]');
      ttsPatch.speed = s;
    }
    let t = task as unknown as TaskRow;
    if (Object.keys(ttsPatch).length > 0) {
      const merged = { ...((task.config?.tts as Record<string, unknown>) ?? {}), ...ttsPatch };
      await state.patchTaskConfig(pool, id, { tts: merged });
      t = (await loadTask(id, uid)) as unknown as TaskRow; // 重载以让 regenerateVoice 读到新 tts
      if (!t) throw apiError(404, 'NOT_FOUND', 'task not found');
    }

    const charge = await chargeForRerun(id, 'static'); // i2v 已下线，统一 static
    const ctx = pipelineCtx();
    const voice = await rerun.regenerateVoice(ctx, t, index); // 同步重写 vo-0N.mp3 + node_edits(6)
    await rerun.rerunFromStep(ctx, t, 7); // 清洗 7-10，自增，入队 step7
    const warning = voice.warning ? `配音回退（${String((voice.warning as { reason?: string })?.reason ?? '')}）` : null;
    res.json({
      id,
      step: 6,
      shot_index: index,
      status: 'running',
      stale_steps: STALE_AFTER_VOICE,
      ...(warning ? { warning } : {}),
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /:id/clips/:index/regenerate — 单镜 i2v 片段重生成（§7.14）
// PIPELINE_TASK_41：i2v 已下线——保留路由，统一返回 410（避免前端 404 难看）。
// ---------------------------------------------------------------------------
router.post(
  '/:id/clips/:index/regenerate',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');
    const task = await loadTask(id, uid);
    if (!task) throw apiError(404, 'NOT_FOUND', 'task not found');
    throw apiError(410, 'I2V_DISCONTINUED', 'i2v 图生视频已下线（2026-08-17），无片段可重生成');
  }),
);
