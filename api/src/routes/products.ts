/**
 * 商品库（Phase 3，03-接口文档 §4.5）：快速生成「AI 创作」的选品来源。
 *   GET /api/products  GET /:id  POST  PUT ?id=  DELETE ?id=
 */

import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../session.js';
import { asyncHandler, isUuid, pagination } from '../utils.js';
import { apiError } from '@avs/shared';

export const router = Router();

const VISIBILITY = new Set(['all', 'private', 'me']);

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const { page, size, offset } = pagination(req);
    const q = String(req.query.q ?? '').trim();
    const params: unknown[] = [uid];
    let where = 'WHERE p.user_id = $1 AND p.status = $2';
    params.push('active');
    if (q) {
      params.push(`%${q}%`);
      where += ` AND p.name ILIKE $${params.length}`;
    }
    const [data, count] = await Promise.all([
      query(
        `SELECT id, name, category, price, commission_rate, product_url, detail_text, visibility, status, gen_count, created_at
           FROM products p ${where}
          ORDER BY p.gen_count DESC, p.created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, size, offset],
      ),
      query(`SELECT count(*)::int AS total FROM products p ${where}`, params),
    ]);
    res.json({ items: data.rows, page, size, total: count.rows[0].total });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'invalid product id');
    const { rows } = await query(
      `SELECT id, name, category, price, commission_rate, product_url, detail_text, visibility, status, gen_count, created_at
         FROM products WHERE id = $1 AND user_id = $2`,
      [id, uid],
    );
    if (rows.length === 0) throw apiError(403, 'FORBIDDEN', 'You do not have access to this product');
    res.json(rows[0]);
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const body = req.body ?? {};
    const name = String(body.name ?? '').trim();
    if (!name) throw apiError(422, 'VALIDATION_ERROR', 'name is required');

    const visibility = String(body.visibility ?? 'me');
    if (!VISIBILITY.has(visibility)) throw apiError(422, 'VALIDATION_ERROR', `visibility must be one of: ${[...VISIBILITY].join(', ')}`);

    const { rows } = await query(
      `INSERT INTO products (user_id, name, category, price, commission_rate, product_url, detail_text, visibility, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
       RETURNING id, name, category, price, commission_rate, product_url, detail_text, visibility, status, gen_count, created_at`,
      [
        uid,
        name,
        body.category === undefined || body.category === null ? null : String(body.category).slice(0, 100),
        body.price === undefined || body.price === null || body.price === '' ? null : String(body.price),
        body.commission_rate === undefined || body.commission_rate === null ? null : String(body.commission_rate),
        body.product_url === undefined || body.product_url === null ? null : String(body.product_url).slice(0, 512),
        body.detail_text === undefined || body.detail_text === null ? null : String(body.detail_text),
        visibility,
      ],
    );
    res.status(201).json(rows[0]);
  }),
);

router.put(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.query.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
    const body = req.body ?? {};
    const sets: string[] = [];
    const values: unknown[] = [uid, id];
    const push = (col: string, val: unknown) => {
      sets.push(`${col} = $${values.length + 1}`);
      values.push(val);
    };
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw apiError(422, 'VALIDATION_ERROR', 'name must not be empty');
      push('name', name);
    }
    if (body.category !== undefined) push('category', body.category === null ? null : String(body.category).slice(0, 100));
    if (body.price !== undefined) push('price', body.price === null || body.price === '' ? null : String(body.price));
    if (body.commission_rate !== undefined) push('commission_rate', body.commission_rate === null || body.commission_rate === '' ? null : String(body.commission_rate));
    if (body.product_url !== undefined) push('product_url', body.product_url === null ? null : String(body.product_url).slice(0, 512));
    if (body.detail_text !== undefined) push('detail_text', body.detail_text === null ? null : String(body.detail_text));
    if (body.visibility !== undefined) {
      const v = String(body.visibility);
      if (!VISIBILITY.has(v)) throw apiError(422, 'VALIDATION_ERROR', `visibility must be one of: ${[...VISIBILITY].join(', ')}`);
      push('visibility', v);
    }
    if (body.status !== undefined) {
      const s = String(body.status);
      if (!['active', 'inactive'].includes(s)) throw apiError(422, 'VALIDATION_ERROR', 'status must be active or inactive');
      push('status', s);
    }
    if (sets.length === 0) throw apiError(422, 'VALIDATION_ERROR', 'No updatable fields provided');
    const r = await query(
      `UPDATE products SET ${sets.join(', ')}
        WHERE id = $2 AND user_id = $1
        RETURNING id, name, category, price, commission_rate, product_url, detail_text, visibility, status, gen_count, created_at`,
      values,
    );
    if (r.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Product not found');
    res.json(r.rows[0]);
  }),
);

router.delete(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.query.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
    const result = await query(`DELETE FROM products WHERE id = $1 AND user_id = $2`, [id, uid]);
    if (result.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Product not found');
    res.json({ ok: true });
  }),
);
