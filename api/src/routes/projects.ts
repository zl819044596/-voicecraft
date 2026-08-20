/**
 * 项目（Phase 3，03-接口文档 §4.3 / C5）：
 *   GET    /api/projects       本人列表（分页）
 *   POST   /api/projects       创建（auto_run=true 同时建首条任务，响应 {project, task}）
 *   GET    /api/projects/:id   详情（越权 403）
 *   DELETE /api/projects/:id   删除（级联 tasks/assets/exports/step_results）
 */

import { Router, Request, Response } from 'express';
import { query, pool } from '../db.js';
import { requireAuth } from '../session.js';
import { asyncHandler, isUuid, pagination } from '../utils.js';
import { apiError } from '@avs/shared';
import { redis } from '../redis.js';
import * as pipeline from '../pipeline/index.js';
import { createTask } from './tasks.js';
import type { TaskRow } from '../pipeline/types.js';

export const router = Router();

const SOURCE_TYPES = new Set(['text', 'url', 'topic', 'product']);

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const { page, size, offset } = pagination(req);
    const keyword = String(req.query.q ?? '').trim();
    const params: unknown[] = [uid];
    let where = 'WHERE p.user_id = $1';
    if (keyword) {
      params.push(`%${keyword}%`);
      where += ` AND p.title ILIKE $${params.length}`;
    }
    const [data, count] = await Promise.all([
      query(
        `SELECT p.id, p.title, p.source_type, p.prompt, p.status, p.created_at, p.updated_at,
                (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id) AS task_count
           FROM projects p
          ${where}
          ORDER BY p.updated_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, size, offset],
      ),
      query(`SELECT count(*)::int AS total FROM projects p ${where}`, params),
    ]);
    res.json({ items: data.rows, page, size, total: count.rows[0].total });
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const body = req.body ?? {};
    const title = String(body.title ?? '').trim();
    const sourceType = String(body.source_type ?? 'text').trim();
    const prompt = body.prompt === undefined || body.prompt === null ? null : String(body.prompt);
    // product_id / benchmark_id 接受但 projects 表无对应列（04 §2）；如需关联在 task.config 表达。
    const autoRun = body.auto_run === true;

    if (!title) throw apiError(422, 'VALIDATION_ERROR', 'title is required');
    if (title.length > 200) throw apiError(422, 'VALIDATION_ERROR', 'title must be at most 200 characters');
    if (!SOURCE_TYPES.has(sourceType)) {
      throw apiError(422, 'VALIDATION_ERROR', `source_type must be one of: ${[...SOURCE_TYPES].join(', ')}`);
    }

    const { rows } = await query(
      `INSERT INTO projects (user_id, title, source_type, prompt, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, title, source_type, prompt, status, created_at, updated_at`,
      [uid, title, sourceType, prompt],
    );
    const project = rows[0];

    if (autoRun) {
      // §4.3：auto_run=true 时同时创建首条任务（结构同 POST /api/tasks body）。
      const taskBody = body.task;
      if (!taskBody || typeof taskBody !== 'object' || Array.isArray(taskBody)) {
        throw apiError(422, 'VALIDATION_ERROR', 'task is required when auto_run=true');
      }
      const { task } = await createTask(uid, project.id, taskBody as Record<string, unknown>);
      await pipeline.enqueueNewTask(pool, redis, task as unknown as TaskRow);
      res.status(201).json({
        project: { id: project.id, title: project.title, source_type: project.source_type, status: project.status },
        task: { id: task.id, status: task.status },
      });
      return;
    }

    res.status(201).json({
      project: { id: project.id, title: project.title, source_type: project.source_type, status: project.status },
    });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'invalid project id');
    const { rows } = await query(
      `SELECT p.id, p.title, p.source_type, p.prompt, p.status, p.created_at, p.updated_at
         FROM projects p WHERE p.id = $1 AND p.user_id = $2`,
      [id, uid],
    );
    if (rows.length === 0) throw apiError(403, 'FORBIDDEN', 'You do not have access to this project');
    res.json(rows[0]);
  }),
);

router.delete(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    // 03-接口文档 §4.3：DELETE /api/projects?id=pj_01
    const id = String(req.query.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'invalid project id');
    // 归属校验 + 运行中任务门禁（409 TASK_RUNNING）。
    const owned = await query(`SELECT 1 FROM projects WHERE id = $1 AND user_id = $2`, [id, uid]);
    if (owned.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Project not found');
    const running = await query(
      `SELECT 1 FROM tasks WHERE project_id = $1 AND status = 'running' LIMIT 1`,
      [id],
    );
    if ((running.rowCount ?? 0) > 0) {
      throw apiError(409, 'TASK_RUNNING', 'project has running tasks, cancel them first');
    }
    await query(`DELETE FROM projects WHERE id = $1 AND user_id = $2`, [id, uid]);
    res.json({ ok: true });
  }),
);
