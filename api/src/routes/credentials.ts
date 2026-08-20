/**
 * BYOK Key 管理（Phase 3，C4/R1）：统一 credentials 表。契约 03 §4。
 *   GET    /api/credentials?provider=    列表（仅 key_masked，绝不出明文）
 *   POST   /api/credentials              新增（AES-256-GCM + scrypt 加密存储）
 *   DELETE /api/credentials?id=          删除（本人 / platform 不可删；被 enabled
 *                                        model_config 引用时 409 CREDENTIAL_IN_USE）
 *
 * 说明：credentials 只存「Key 材料 + 归属」，不含 provider_class —— provider_class
 * 是 model_configs 的属性（04 §2.2：credentials 无 provider_class 列）。
 */

import { Router, Request, Response } from 'express';
import { query, isUniqueViolation } from '../db.js';
import { requireAuth } from '../session.js';
import { encryptKey, maskKey } from '../crypto.js';
import { asyncHandler, isUuid } from '../utils.js';
import { apiError } from '@avs/shared';

export const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const provider = req.query.provider ? String(req.query.provider).trim() : null;
    const params: unknown[] = [uid];
    let sql = `SELECT id, owner_scope, provider, label, key_masked, base_url, status, created_at
                 FROM credentials
                WHERE owner_scope = 'user' AND user_id = $1`;
    if (provider) {
      sql += ` AND provider = $2`;
      params.push(provider);
    }
    sql += ` ORDER BY created_at DESC`;
    const { rows } = await query(sql, params);
    res.json({ items: rows, total: rows.length, page: 1, size: rows.length });
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const body = req.body ?? {};
    const provider = String(body.provider ?? '').trim().toLowerCase();
    const label = String(body.label ?? '').trim().slice(0, 80);
    const key = String(body.key ?? '');
    const baseUrl = body.base_url ? String(body.base_url).trim().slice(0, 512) : null;

    if (!provider) throw apiError(422, 'VALIDATION_ERROR', 'provider is required');
    if (!label) throw apiError(422, 'VALIDATION_ERROR', 'label is required');
    if (key.length < 8 || key.length > 512) {
      throw apiError(422, 'VALIDATION_ERROR', 'key must be between 8 and 512 characters');
    }

    const { ciphertext, salt } = encryptKey(key);

    try {
      const { rows } = await query(
        `INSERT INTO credentials (owner_scope, user_id, provider, label, key_ciphertext, key_salt, key_masked, base_url, status)
         VALUES ('user', $1, $2, $3, $4, $5, $6, $7, 'active')
         RETURNING id, owner_scope, provider, label, key_masked, base_url, status, created_at`,
        [uid, provider, label, ciphertext, salt, maskKey(key), baseUrl],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw apiError(409, 'DUPLICATE_CREDENTIAL', 'A credential with this provider + label already exists');
      }
      throw err;
    }
  }),
);

router.delete(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.query.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid uuid');

    const { rows } = await query(
      `SELECT id FROM credentials WHERE id = $1 AND owner_scope = 'user' AND user_id = $2`,
      [id, uid],
    );
    if (rows.length === 0) throw apiError(404, 'NOT_FOUND', 'Credential not found');

    // 03 §4：仍被 enabled 的 model_config 引用 → 409 CREDENTIAL_IN_USE（需先解绑）。
    const inUse = await query(`SELECT 1 FROM model_configs WHERE credential_id = $1 AND enabled LIMIT 1`, [id]);
    if ((inUse.rowCount ?? 0) > 0) {
      throw apiError(409, 'CREDENTIAL_IN_USE', 'Credential is still referenced by an enabled model config');
    }

    await query(`DELETE FROM credentials WHERE id = $1`, [id]);
    res.json({ ok: true });
  }),
);
