/**
 * 规则中心（CORE-FEATURES）：四类可配置规则 CRUD。
 *   GET    /api/rules?kind=         本人规则列表（kind 过滤，校验合法值）
 *   POST   /api/rules               新建
 *   PUT    /api/rules/:id           更新
 *   DELETE /api/rules/:id           删除
 * 每 (user_id, kind) 至多一个 is_default（部分唯一索引 → 23505 → 409）。
 * 语义：规则是"配置"，不隐式生效——任务创建时 quick 页把选中的规则 id 快照进
 * task.config.rules；流水线各步骤按 config.rules[kind] 解析规则正文注入提示词
 * （未选 → 系统默认，见 api/src/pipeline/prompts.ts resolveRuleBody）。
 */

import { Router, Request, Response } from 'express';
import { query, withTransaction, isUniqueViolation } from '../db.js';
import { requireAuth } from '../session.js';
import { asyncHandler, isUuid } from '../utils.js';
import { apiError } from '@avs/shared';

export const router = Router();

export const RULE_KINDS = ['rewrite', 'split', 'image', 'i2v'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

const KIND_LABELS: Record<RuleKind, string> = {
  rewrite: 'rewrite（文案二次重构）',
  split: 'split（文案拆分）',
  image: 'image（图片生成）',
  i2v: 'i2v（图生视频）',
};

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const kind = String(req.query.kind ?? '').trim();
    const params: unknown[] = [uid];
    let where = 'WHERE r.user_id = $1';
    if (kind) {
      if (!(RULE_KINDS as readonly string[]).includes(kind)) {
        throw apiError(422, 'VALIDATION_ERROR', `kind must be one of: ${RULE_KINDS.join(', ')}`);
      }
      params.push(kind);
      where += ` AND r.kind = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT r.id, r.kind, r.name, r.body, r.enabled, r.is_default, r.created_at, r.updated_at
         FROM rules r ${where}
        ORDER BY r.kind, r.is_default DESC, r.created_at DESC`,
      params,
    );
    res.json({ items: rows });
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const body = req.body ?? {};
    const kind = String(body.kind ?? '').trim();
    const name = String(body.name ?? '').trim();
    const ruleBody = String(body.body ?? '').trim();
    const enabled = body.enabled === undefined ? true : Boolean(body.enabled);
    const isDefault = body.is_default === true;

    if (!(RULE_KINDS as readonly string[]).includes(kind)) {
      throw apiError(422, 'VALIDATION_ERROR', `kind must be one of: ${RULE_KINDS.join(', ')}`);
    }
    if (!name) throw apiError(422, 'VALIDATION_ERROR', 'name is required');
    if (!ruleBody) throw apiError(422, 'VALIDATION_ERROR', 'body is required');

    try {
      let result;
      if (isDefault) {
        result = await withTransaction(async (client) => {
          await client.query(`UPDATE rules SET is_default = false WHERE user_id = $1 AND kind = $2`, [uid, kind]);
          return client.query(
            `INSERT INTO rules (user_id, kind, name, body, enabled, is_default)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, kind, name, body, enabled, is_default, created_at, updated_at`,
            [uid, kind, name, ruleBody, enabled, isDefault],
          );
        });
      } else {
        result = await query(
          `INSERT INTO rules (user_id, kind, name, body, enabled, is_default)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, kind, name, body, enabled, is_default, created_at, updated_at`,
          [uid, kind, name, ruleBody, enabled, isDefault],
        );
      }
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) throw apiError(409, 'CONFLICT', 'A default rule for this kind already exists');
      throw err;
    }
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
    const existing = await query(`SELECT kind FROM rules WHERE id = $1 AND user_id = $2`, [id, uid]);
    if (existing.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Rule not found');

    const body = req.body ?? {};
    const sets: string[] = [];
    const values: unknown[] = [uid, id];
    const push = (col: string, val: unknown) => {
      sets.push(`${col} = $${values.length + 1}`);
      values.push(val);
    };
    if (body.kind !== undefined) {
      const kind = String(body.kind);
      if (!(RULE_KINDS as readonly string[]).includes(kind)) {
        throw apiError(422, 'VALIDATION_ERROR', `kind must be one of: ${RULE_KINDS.join(', ')}`);
      }
      push('kind', kind);
    }
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw apiError(422, 'VALIDATION_ERROR', 'name must not be empty');
      push('name', name);
    }
    if (body.body !== undefined) {
      const rb = String(body.body).trim();
      if (!rb) throw apiError(422, 'VALIDATION_ERROR', 'body must not be empty');
      push('body', rb);
    }
    if (body.enabled !== undefined) push('enabled', Boolean(body.enabled));

    try {
      let row;
      if (body.is_default === true) {
        row = (
          await withTransaction(async (client) => {
            await client.query(
              `UPDATE rules SET is_default = false WHERE user_id = $1 AND kind = $2 AND id <> $3`,
              [uid, body.kind ?? existing.rows[0].kind, id],
            );
            const r = await client.query(
              `UPDATE rules SET is_default = true${sets.length ? `, ${sets.join(', ')}` : ''}
                WHERE id = $2 AND user_id = $1
                RETURNING id, kind, name, body, enabled, is_default, created_at, updated_at`,
              values,
            );
            return r.rows[0];
          })
        );
      } else {
        if (body.is_default !== undefined) push('is_default', Boolean(body.is_default));
        if (sets.length === 0) throw apiError(422, 'VALIDATION_ERROR', 'No updatable fields provided');
        const r = await query(
          `UPDATE rules SET ${sets.join(', ')}
            WHERE id = $2 AND user_id = $1
            RETURNING id, kind, name, body, enabled, is_default, created_at, updated_at`,
          values,
        );
        row = r.rows[0];
      }
      res.json(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw apiError(409, 'CONFLICT', 'A default rule for this kind already exists');
      throw err;
    }
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
    const result = await query(`DELETE FROM rules WHERE id = $1 AND user_id = $2`, [id, uid]);
    if (result.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Rule not found');
    res.json({ ok: true });
  }),
);
