/**
 * 对标库（Phase 3，03-接口文档 §4.6）：收藏的对标视频与文案，可关联商品。
 *   GET /api/benchmarks  POST  PUT ?id=  DELETE ?id=
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
    let where = 'WHERE b.user_id = $1';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (b.title ILIKE $${params.length} OR b.account ILIKE $${params.length})`;
    }
    const [data, count] = await Promise.all([
      query(
        `SELECT b.id, b.account, b.title, b.video_url, b.source_text, b.product_id,
                b.duration, b.visibility, b.created_at
           FROM benchmarks b ${where}
          ORDER BY b.created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, size, offset],
      ),
      query(`SELECT count(*)::int AS total FROM benchmarks b ${where}`, params),
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
    if (!title) throw apiError(422, 'VALIDATION_ERROR', 'title is required');

    let productId: string | null = null;
    if (body.product_id) {
      productId = String(body.product_id).trim();
      if (!isUuid(productId)) throw apiError(422, 'VALIDATION_ERROR', 'product_id must be a valid UUID');
      const owned = await query(`SELECT id FROM products WHERE id = $1 AND user_id = $2`, [productId, uid]);
      if (owned.rowCount === 0) throw apiError(403, 'FORBIDDEN', 'Product does not belong to the current user');
    }

    const visibility = String(body.visibility ?? 'me');
    if (!VISIBILITY.has(visibility)) throw apiError(422, 'VALIDATION_ERROR', `visibility must be one of: ${[...VISIBILITY].join(', ')}`);

    const { rows } = await query(
      `INSERT INTO benchmarks (user_id, account, title, video_url, source_text, product_id, duration, visibility)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, account, title, video_url, source_text, product_id, duration, visibility, created_at`,
      [
        uid,
        body.account === undefined || body.account === null ? null : String(body.account).slice(0, 120),
        title,
        body.video_url === undefined || body.video_url === null ? null : String(body.video_url).slice(0, 512),
        body.source_text === undefined || body.source_text === null ? null : String(body.source_text),
        productId,
        body.duration === undefined || body.duration === null || body.duration === '' ? null : Number(body.duration),
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
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) throw apiError(422, 'VALIDATION_ERROR', 'title must not be empty');
      push('title', title);
    }
    if (body.account !== undefined) push('account', body.account === null ? null : String(body.account).slice(0, 120));
    if (body.video_url !== undefined) push('video_url', body.video_url === null ? null : String(body.video_url).slice(0, 512));
    if (body.source_text !== undefined) push('source_text', body.source_text === null ? null : String(body.source_text));
    if (body.duration !== undefined) push('duration', body.duration === null || body.duration === '' ? null : Number(body.duration));
    if (body.product_id !== undefined) {
      if (body.product_id === null) push('product_id', null);
      else {
        const pid = String(body.product_id).trim();
        if (!isUuid(pid)) throw apiError(422, 'VALIDATION_ERROR', 'product_id must be a valid UUID');
        const owned = await query(`SELECT id FROM products WHERE id = $1 AND user_id = $2`, [pid, uid]);
        if (owned.rowCount === 0) throw apiError(403, 'FORBIDDEN', 'Product does not belong to the current user');
        push('product_id', pid);
      }
    }
    if (body.visibility !== undefined) {
      const v = String(body.visibility);
      if (!VISIBILITY.has(v)) throw apiError(422, 'VALIDATION_ERROR', `visibility must be one of: ${[...VISIBILITY].join(', ')}`);
      push('visibility', v);
    }
    if (sets.length === 0) throw apiError(422, 'VALIDATION_ERROR', 'No updatable fields provided');
    const r = await query(
      `UPDATE benchmarks SET ${sets.join(', ')}
        WHERE id = $2 AND user_id = $1
        RETURNING id, account, title, video_url, source_text, product_id, duration, visibility, created_at`,
      values,
    );
    if (r.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Benchmark not found');
    res.json(r.rows[0]);
  }),
);

router.delete(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.query.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
    const result = await query(`DELETE FROM benchmarks WHERE id = $1 AND user_id = $2`, [id, uid]);
    if (result.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Benchmark not found');
    res.json({ ok: true });
  }),
);
