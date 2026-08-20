/**
 * 提示词中心（Phase 3，03-接口文档 §4.4）：7 类模板 CRUD。
 *   GET    /api/prompts?type=&q=
 *   POST   /api/prompts
 *   PUT    /api/prompts?id=
 *   DELETE /api/prompts?id=
 * 每 (user_id, type) 至多一个 is_default（部分唯一索引 → 23505 → 409）。
 */

import { Router, Request, Response } from 'express';
import { query, withTransaction, isUniqueViolation } from '../db.js';
import { requireAuth } from '../session.js';
import { asyncHandler, isUuid, pagination } from '../utils.js';
import { apiError } from '@avs/shared';

export const router = Router();

const TYPES = new Set([
  'product_parse', 'benchmark_analysis', 'script', 'title', 'style', 'storyboard', 'compliance', 'video_style',
  // 中文模板类型（与前端 WizardPage STEP_TEMPLATE_TYPES 对齐）：
  // L2 文案用 type='文案模板'，prompts 表 type CHECK 同步含下列值。
  '商品解析', '对标分析', '文案模板', '标题生成', '分镜拆解', '画面风格', '合规规则', '视频风格',
]);

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const { page, size, offset } = pagination(req);
    const type = String(req.query.type ?? '').trim();
    const q = String(req.query.q ?? '').trim();
    const params: unknown[] = [uid];
    // PIPELINE_TASK_45：模板中心同时展示用户个人模板与平台级全局默认（user_id IS NULL）。
    // 个人配置优先：用户自己的排在全局默认之前（流水线内 select 的 ORDER BY 不受影响）。
    let where = 'WHERE (p.user_id = $1 OR p.user_id IS NULL)';
    if (type) {
      if (!TYPES.has(type)) throw apiError(422, 'VALIDATION_ERROR', `type must be one of: ${[...TYPES].join(', ')}`);
      params.push(type);
      where += ` AND p.type = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (p.name ILIKE $${params.length} OR p.scenario ILIKE $${params.length})`;
    }
    const [data, count] = await Promise.all([
      query(
        `SELECT p.id, p.type, p.name, p.scenario, p.body, p.tags, p.enabled, p.is_default, p.user_id, p.created_at
           FROM prompts p ${where}
          ORDER BY p.type, (p.user_id IS NULL) ASC, p.is_default DESC, p.created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, size, offset],
      ),
      query(`SELECT count(*)::int AS total FROM prompts p ${where}`, params),
    ]);
    res.json({ items: data.rows, page, size, total: count.rows[0].total });
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const body = req.body ?? {};
    const type = String(body.type ?? '');
    const name = String(body.name ?? '').trim();
    const scenario = body.scenario === undefined || body.scenario === null ? null : String(body.scenario).trim();
    const promptBody = String(body.body ?? '').trim();
    const tags = Array.isArray(body.tags) ? body.tags.map((t: unknown) => String(t).slice(0, 40)).slice(0, 20) : [];
    const enabled = body.enabled === undefined ? true : Boolean(body.enabled);
    const isDefault = body.is_default === true;

    if (!TYPES.has(type)) throw apiError(422, 'VALIDATION_ERROR', `type must be one of: ${[...TYPES].join(', ')}`);
    if (!name) throw apiError(422, 'VALIDATION_ERROR', 'name is required');
    if (!promptBody) throw apiError(422, 'VALIDATION_ERROR', 'body is required');

    try {
      let result;
      if (isDefault) {
        result = await withTransaction(async (client) => {
          await client.query(`UPDATE prompts SET is_default = false WHERE user_id = $1 AND type = $2`, [uid, type]);
          return client.query(
            `INSERT INTO prompts (user_id, type, name, scenario, body, tags, enabled, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, type, name, scenario, body, tags, enabled, is_default, created_at`,
            [uid, type, name, scenario, promptBody, tags, enabled, isDefault],
          );
        });
      } else {
        result = await query(
          `INSERT INTO prompts (user_id, type, name, scenario, body, tags, enabled, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, type, name, scenario, body, tags, enabled, is_default, created_at`,
          [uid, type, name, scenario, promptBody, tags, enabled, isDefault],
        );
      }
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) throw apiError(409, 'CONFLICT', 'A default prompt for this type already exists');
      throw err;
    }
  }),
);

router.put(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.query.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
    const existing = await query(`SELECT type FROM prompts WHERE id = $1 AND user_id = $2`, [id, uid]);
    if (existing.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Prompt not found');
    // 系统默认模板（user_id IS NULL）只读：不可修改（用户规则 2026-08-19）。

    const body = req.body ?? {};
    const sets: string[] = [];
    const values: unknown[] = [uid, id];
    const push = (col: string, val: unknown) => {
      sets.push(`${col} = $${values.length + 1}`);
      values.push(val);
    };
    if (body.type !== undefined) {
      const type = String(body.type);
      if (!TYPES.has(type)) throw apiError(422, 'VALIDATION_ERROR', `type must be one of: ${[...TYPES].join(', ')}`);
      push('type', type);
    }
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw apiError(422, 'VALIDATION_ERROR', 'name must not be empty');
      push('name', name);
    }
    if (body.scenario !== undefined) push('scenario', body.scenario === null ? null : String(body.scenario).trim());
    if (body.body !== undefined) {
      const pb = String(body.body).trim();
      if (!pb) throw apiError(422, 'VALIDATION_ERROR', 'body must not be empty');
      push('body', pb);
    }
    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags)) throw apiError(422, 'VALIDATION_ERROR', 'tags must be an array');
      push('tags', body.tags.map((t: unknown) => String(t).slice(0, 40)).slice(0, 20));
    }
    if (body.enabled !== undefined) push('enabled', Boolean(body.enabled));

    try {
      let row;
      if (body.is_default === true) {
        row = (
          await withTransaction(async (client) => {
            await client.query(
              `UPDATE prompts SET is_default = false WHERE user_id = $1 AND type = $2 AND id <> $3`,
              [uid, body.type ?? existing.rows[0].type, id],
            );
            const r = await client.query(
              `UPDATE prompts SET is_default = true${sets.length ? `, ${sets.join(', ')}` : ''}
                WHERE id = $2 AND user_id = $1
                RETURNING id, type, name, scenario, body, tags, enabled, is_default, created_at`,
              values,
            );
            return r.rows[0];
          })
        );
      } else {
        if (body.is_default !== undefined) push('is_default', Boolean(body.is_default));
        if (sets.length === 0) throw apiError(422, 'VALIDATION_ERROR', 'No updatable fields provided');
        const r = await query(
          `UPDATE prompts SET ${sets.join(', ')}
            WHERE id = $2 AND user_id = $1
            RETURNING id, type, name, scenario, body, tags, enabled, is_default, created_at`,
          values,
        );
        row = r.rows[0];
      }
      res.json(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw apiError(409, 'CONFLICT', 'A default prompt for this type already exists');
      throw err;
    }
  }),
);

router.delete(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.query.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
    const result = await query(`DELETE FROM prompts WHERE id = $1 AND user_id = $2`, [id, uid]);
    if (result.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Prompt not found');
    // 系统默认模板（user_id IS NULL）只读：不可删除（用户规则 2026-08-19）。
    res.json({ ok: true });
  }),
);
