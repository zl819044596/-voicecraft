/**
 * 素材库（Phase 3，03-接口文档 §5.4）：
 *   GET /api/assets  POST  PUT ?id=  DELETE ?id=
 * url 为 MinIO 对象 key 或外部 http(s) URL（仅用户自建，R3）；meta 为自由 JSON。
 */

import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../session.js';
import { asyncHandler, isUuid, pagination } from '../utils.js';
import { apiError } from '@avs/shared';

export const router = Router();

const TYPES = new Set(['image', 'audio', 'video']);
const URL_RE = /^(https?:\/\/|tasks\/|users\/)/i;

router.use(requireAuth);

function serialize(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    name: row.name,
    url: row.url,
    size: row.size === null ? null : Number(row.size),
    meta: row.meta ?? {},
    created_at: row.created_at,
  };
}

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const { page, size, offset } = pagination(req);
    const type = String(req.query.type ?? '').trim();
    const params: unknown[] = [uid];
    let where = 'WHERE user_id = $1';
    if (type) {
      if (!TYPES.has(type)) throw apiError(422, 'VALIDATION_ERROR', `type must be one of: ${[...TYPES].join(', ')}`);
      params.push(type);
      where += ` AND type = $${params.length}`;
    }
    const [data, count] = await Promise.all([
      query(
        `SELECT id, user_id, type, name, url, size, meta, created_at
           FROM media_assets ${where}
          ORDER BY created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, size, offset],
      ),
      query(`SELECT count(*)::int AS total FROM media_assets ${where}`, params),
    ]);
    res.json({ items: data.rows.map(serialize), page, size, total: count.rows[0].total });
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const body = req.body ?? {};
    const type = String(body.type ?? '').trim();
    const name = String(body.name ?? '').trim();
    const url = String(body.url ?? '').trim();

    if (!TYPES.has(type)) throw apiError(422, 'VALIDATION_ERROR', `type must be one of: ${[...TYPES].join(', ')}`);
    if (!name) throw apiError(422, 'VALIDATION_ERROR', 'name is required');
    if (!url) throw apiError(422, 'VALIDATION_ERROR', 'url is required');
    if (!URL_RE.test(url)) throw apiError(422, 'VALIDATION_ERROR', 'url must be an http(s) URL or MinIO object key');

    let size: number | null = null;
    if (body.size !== undefined && body.size !== null && body.size !== '') {
      const n = Number(body.size);
      if (!Number.isInteger(n) || n < 0) throw apiError(422, 'VALIDATION_ERROR', 'size must be a non-negative integer (bytes)');
      size = n;
    }
    let meta: Record<string, unknown> = {};
    if (body.meta !== undefined && body.meta !== null) {
      if (typeof body.meta !== 'object' || Array.isArray(body.meta)) throw apiError(422, 'VALIDATION_ERROR', 'meta must be an object');
      meta = body.meta;
    }

    const { rows } = await query(
      `INSERT INTO media_assets (user_id, type, name, url, size, meta)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, type, name, url, size, meta, created_at`,
      [uid, type, name, url, size, JSON.stringify(meta)],
    );
    res.status(201).json(serialize(rows[0]));
  }),
);

router.put(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.query.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
    const existing = await query(`SELECT id FROM media_assets WHERE id = $1 AND user_id = $2`, [id, uid]);
    if (existing.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Asset not found');

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
    if (body.url !== undefined) {
      const url = String(body.url).trim();
      if (!url) throw apiError(422, 'VALIDATION_ERROR', 'url must not be empty');
      if (!URL_RE.test(url)) throw apiError(422, 'VALIDATION_ERROR', 'url must be an http(s) URL or MinIO object key');
      push('url', url);
    }
    if (body.size !== undefined) {
      if (body.size === null || body.size === '') push('size', null);
      else {
        const n = Number(body.size);
        if (!Number.isInteger(n) || n < 0) throw apiError(422, 'VALIDATION_ERROR', 'size must be a non-negative integer (bytes)');
        push('size', n);
      }
    }
    if (body.meta !== undefined) {
      if (body.meta === null) push('meta', '{}');
      else {
        if (typeof body.meta !== 'object' || Array.isArray(body.meta)) throw apiError(422, 'VALIDATION_ERROR', 'meta must be an object');
        push('meta', JSON.stringify(body.meta));
      }
    }
    if (sets.length === 0) throw apiError(422, 'VALIDATION_ERROR', 'No updatable fields provided');

    const r = await query(
      `UPDATE media_assets SET ${sets.join(', ')}
        WHERE id = $2 AND user_id = $1
        RETURNING id, user_id, type, name, url, size, meta, created_at`,
      values,
    );
    res.json(serialize(r.rows[0]));
  }),
);

router.delete(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.query.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
    const result = await query(`DELETE FROM media_assets WHERE id = $1 AND user_id = $2`, [id, uid]);
    if (result.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Asset not found');
    res.json({ ok: true });
  }),
);
