/**
 * 模型配置中心（Phase 3，03-接口文档 §4.2 / C4）：
 *
 *   GET    /api/model-configs            本人列表（join credentials 出 key_masked），?provider_class=
 *   POST   /api/model-configs            新增（credential_id 引用 BYOK 凭据）
 *   PUT    /api/model-configs?id=        更新（is_default 替换语义）
 *   DELETE /api/model-configs?id=        删除
 *   GET    /api/model-configs/presets    平台预设目录（共享 PRESETS，05 文档）
 *   POST   /api/model-configs/test       最小连通性探针
 *   POST   /api/model-configs/preview    TTS 音色试听（音频流）
 *
 * 每个 (user_id, provider_class) 至多一个 is_default（部分唯一索引）；并发 23505 → 409。
 * 明文 key 只在校验时内存解密，永不返回。
 */

import { Router, Request, Response } from 'express';
import { query, withTransaction, isUniqueViolation } from '../db.js';
import { requireAuth } from '../session.js';
import { decryptKey } from '../crypto.js';
import { asyncHandler, isUuid, pagination } from '../utils.js';
import { apiError, PROVIDER_CLASSES, PRESETS, type ModelPreset } from '@avs/shared';
import { probe, synthesizeTts, mockWavBuffer, mockEnabled } from '../providers/runtime.js';

export const router = Router();

const CLASS_SET = new Set<string>(PROVIDER_CLASSES);
const URL_RE = /^https?:\/\//i;

const CONFIG_SELECT = `
  SELECT mc.id, mc.provider_class, mc.name, mc.credential_id, c.key_masked,
         mc.base_url, mc.model, mc.voice, mc.enabled, mc.is_default, mc.created_at
    FROM model_configs mc
    LEFT JOIN credentials c ON c.id = mc.credential_id`;

function serialize(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    provider_class: row.provider_class,
    name: row.name,
    credential_id: row.credential_id,
    key_masked: row.key_masked ?? null,
    base_url: row.base_url,
    model: row.model,
    voice: row.voice,
    enabled: row.enabled,
    is_default: row.is_default,
    created_at: row.created_at,
  };
}

async function loadOwnConfig(uid: string, id: string) {
  const { rows } = await query(
    `SELECT mc.*, c.provider AS cred_provider, c.key_ciphertext, c.key_salt
       FROM model_configs mc
       LEFT JOIN credentials c ON c.id = mc.credential_id
      WHERE mc.id = $1 AND mc.user_id = $2`,
    [id, uid],
  );
  return rows[0] ?? null;
}

// 凭据归属校验：无此凭据 → 404；非本人 → 403。
async function ensureOwnCredential(uid: string, credentialId: string): Promise<void> {
  const owned = await query(
    `SELECT id FROM credentials WHERE id = $1 AND user_id = $2 AND owner_scope = 'user'`,
    [credentialId, uid],
  );
  if ((owned.rowCount ?? 0) > 0) return;
  const any = await query(`SELECT id FROM credentials WHERE id = $1`, [credentialId]);
  if (any.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Credential not found');
  throw apiError(403, 'FORBIDDEN', 'Credential does not belong to the current user');
}

async function keyMaskedOf(credentialId: string | null): Promise<string | null> {
  if (!credentialId) return null;
  const { rows } = await query(`SELECT key_masked FROM credentials WHERE id = $1`, [credentialId]);
  return rows[0]?.key_masked ?? null;
}

// ---------------------------------------------------------------------------
// GET /api/model-configs
// ---------------------------------------------------------------------------
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const { page, size, offset } = pagination(req);
    const providerClass = String(req.query.provider_class ?? '').trim();
    const params: unknown[] = [uid];
    let where = 'WHERE mc.user_id = $1';
    if (providerClass) {
      if (!CLASS_SET.has(providerClass)) {
        throw apiError(422, 'VALIDATION_ERROR', `provider_class must be one of ${PROVIDER_CLASSES.join(', ')}`);
      }
      params.push(providerClass);
      where += ` AND mc.provider_class = $${params.length}`;
    }
    const [data, count] = await Promise.all([
      query(
        `${CONFIG_SELECT} ${where} ORDER BY mc.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, size, offset],
      ),
      query(`SELECT count(*)::int AS total FROM model_configs mc ${where}`, params),
    ]);
    res.json({ items: data.rows.map(serialize), page, size, total: count.rows[0].total });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/model-configs
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const body = req.body ?? {};
    const providerClass = String(body.provider_class ?? '');
    const name = String(body.name ?? '').trim();
    const credentialId = body.credential_id ? String(body.credential_id).trim() : null;
    const model = String(body.model ?? '').trim();
    const baseUrl = body.base_url === undefined || body.base_url === null ? null : String(body.base_url).trim();
    const voice = body.voice === undefined || body.voice === null ? null : String(body.voice).trim();
    const enabled = body.enabled === undefined ? true : Boolean(body.enabled);
    const isDefault = body.is_default === true;

    if (!CLASS_SET.has(providerClass)) {
      throw apiError(422, 'VALIDATION_ERROR', `provider_class must be one of ${PROVIDER_CLASSES.join(', ')}`);
    }
    if (!name) throw apiError(422, 'VALIDATION_ERROR', 'name is required');
    if (!model) throw apiError(422, 'VALIDATION_ERROR', 'model is required');
    if (credentialId && !isUuid(credentialId)) throw apiError(422, 'VALIDATION_ERROR', 'credential_id must be a valid UUID');
    if (baseUrl && !URL_RE.test(baseUrl)) throw apiError(422, 'VALIDATION_ERROR', 'base_url must be a http(s) URL');
    if (credentialId) await ensureOwnCredential(uid, credentialId);

    const insert = (c: { query: (text: string, params?: unknown[]) => Promise<import('pg').QueryResult> }) =>
      c.query(
        `INSERT INTO model_configs
           (user_id, provider_class, name, credential_id, base_url, model, voice, enabled, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, provider_class, name, credential_id, base_url, model, voice, enabled, is_default, created_at`,
        [uid, providerClass, name, credentialId, baseUrl, model, voice, enabled, isDefault],
      );

    try {
      let result;
      if (isDefault) {
        result = await withTransaction(async (client) => {
          await client.query(
            `UPDATE model_configs SET is_default = false WHERE user_id = $1 AND provider_class = $2`,
            [uid, providerClass],
          );
          return insert(client);
        });
      } else {
        result = await insert({ query });
      }
      res.status(201).json(serialize({ ...result.rows[0], key_masked: await keyMaskedOf(credentialId) }));
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw apiError(409, 'CONFLICT', 'A default config for this provider_class already exists');
      }
      throw err;
    }
  }),
);

// ---------------------------------------------------------------------------
// PUT /api/model-configs?id=
// ---------------------------------------------------------------------------
router.put(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.query.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
    const existing = await loadOwnConfig(uid, id);
    if (!existing) throw apiError(404, 'NOT_FOUND', 'Model config not found');

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
    if (body.credential_id !== undefined) {
      const credentialId = body.credential_id === null ? null : String(body.credential_id).trim();
      if (credentialId) {
        if (!isUuid(credentialId)) throw apiError(422, 'VALIDATION_ERROR', 'credential_id must be a valid UUID');
        await ensureOwnCredential(uid, credentialId);
      }
      push('credential_id', credentialId);
    }
    if (body.base_url !== undefined) {
      const baseUrl = body.base_url === null ? null : String(body.base_url).trim();
      if (baseUrl && !URL_RE.test(baseUrl)) throw apiError(422, 'VALIDATION_ERROR', 'base_url must be a http(s) URL');
      push('base_url', baseUrl);
    }
    if (body.model !== undefined) {
      const model = String(body.model).trim();
      if (!model) throw apiError(422, 'VALIDATION_ERROR', 'model must not be empty');
      push('model', model);
    }
    if (body.voice !== undefined) push('voice', body.voice === null ? null : String(body.voice).trim());
    if (body.enabled !== undefined) push('enabled', Boolean(body.enabled));

    try {
      let row: Record<string, unknown>;
      if (body.is_default === true) {
        row = (
          await withTransaction(async (client) => {
            await client.query(
              `UPDATE model_configs SET is_default = false
                WHERE user_id = $1 AND provider_class = $2 AND id <> $3`,
              [uid, existing.provider_class, id],
            );
            const r = await client.query(
              `UPDATE model_configs
                  SET is_default = true${sets.length ? `, ${sets.join(', ')}` : ''}
                WHERE id = $2 AND user_id = $1
                RETURNING id, provider_class, name, credential_id, base_url, model, voice, enabled, is_default, created_at`,
              values,
            );
            return r.rows[0];
          })
        );
      } else {
        if (body.is_default !== undefined) push('is_default', Boolean(body.is_default));
        if (sets.length === 0) throw apiError(422, 'VALIDATION_ERROR', 'No updatable fields provided');
        const r = await query(
          `UPDATE model_configs SET ${sets.join(', ')}
            WHERE id = $2 AND user_id = $1
            RETURNING id, provider_class, name, credential_id, base_url, model, voice, enabled, is_default, created_at`,
          values,
        );
        row = r.rows[0];
      }
      res.json(serialize({ ...row, key_masked: await keyMaskedOf(row.credential_id as string | null) }));
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw apiError(409, 'CONFLICT', 'A default config for this provider_class already exists');
      }
      throw err;
    }
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/model-configs?id=
// ---------------------------------------------------------------------------
router.delete(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const id = String(req.query.id ?? '');
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
    const result = await query(`DELETE FROM model_configs WHERE id = $1 AND user_id = $2`, [id, uid]);
    if (result.rowCount === 0) throw apiError(404, 'NOT_FOUND', 'Model config not found');
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/model-configs/presets — 平台预设目录（05 文档，共享 PRESETS）
// ---------------------------------------------------------------------------
router.get(
  '/presets',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const presets: Record<string, ModelPreset[]> = {};
    for (const cls of PROVIDER_CLASSES) {
      presets[cls] = PRESETS.filter((p) => p.providerClass === cls).map((p): ModelPreset => ({
        id: p.id,
        provider_class: p.providerClass,
        name: p.name,
        provider: p.provider,
        model: p.model,
        mechanism: p.mechanism,
        base_url: p.baseUrl,
        voices: p.voices ? Object.values(p.voices).flat() : undefined,
        languages: p.languages,
        commercial: p.commercial,
      }));
    }
    res.json({
      presets,
      mechanisms: {
        A: '机制 A：OpenAI 兼容端点（base_url + model + key，任意兼容协议模型）',
        B: '机制 B：平台预设适配器（非兼容协议 provider 专用适配，选预设 + 填 Key 即可）',
        unsupported_note: '无官方 API 的产品（如 Midjourney）不支持，不在预设清单中',
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/model-configs/test — 最小连通性探针。
// ---------------------------------------------------------------------------
router.post(
  '/test',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const body = req.body ?? {};
    let providerClass: string;
    let baseUrl: string | null;
    let model: string | null;
    let voice: string | null;
    let key: string | undefined;

    if (body.id) {
      const id = String(body.id).trim();
      if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
      const row = await loadOwnConfig(uid, id);
      if (!row) throw apiError(404, 'NOT_FOUND', 'Model config not found');
      providerClass = row.provider_class;
      baseUrl = row.base_url;
      model = row.model;
      voice = row.voice;
      if (row.key_ciphertext && row.key_salt) key = decryptKey(row.key_ciphertext, row.key_salt);
    } else {
      providerClass = String(body.provider_class ?? '');
      const credentialId = String(body.credential_id ?? '').trim();
      model = String(body.model ?? '').trim();
      baseUrl = body.base_url === undefined || body.base_url === null ? null : String(body.base_url).trim();
      voice = body.voice === undefined || body.voice === null ? null : String(body.voice).trim();
      if (!CLASS_SET.has(providerClass)) throw apiError(422, 'VALIDATION_ERROR', `provider_class must be one of ${PROVIDER_CLASSES.join(', ')}`);
      if (!credentialId || !isUuid(credentialId)) throw apiError(422, 'VALIDATION_ERROR', 'credential_id must be a valid UUID');
      if (!model) throw apiError(422, 'VALIDATION_ERROR', 'model is required');
      await ensureOwnCredential(uid, credentialId);
      const cred = await query(`SELECT key_ciphertext, key_salt FROM credentials WHERE id = $1`, [credentialId]);
      key = decryptKey(cred.rows[0].key_ciphertext, cred.rows[0].key_salt);
    }

    try {
      const result = await probe({ providerClass, baseUrl, model, key, voice });
      res.json({
        ok: result.ok,
        latency_ms: result.latencyMs,
        note: result.note,
      });
    } catch (err) {
      throw apiError(502, 'PROVIDER_UNAVAILABLE', 'Provider connectivity test failed', {
        message: String((err as Error).message).slice(0, 300),
      });
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /api/model-configs/preview — TTS 音色试听（返回音频流）。text ≤ 200。
// ---------------------------------------------------------------------------
router.post(
  '/preview',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const body = req.body ?? {};
    const id = String(body.id ?? '').trim();
    const text = String(body.text ?? '').trim();
    if (!isUuid(id)) throw apiError(422, 'VALIDATION_ERROR', 'id must be a valid UUID');
    if (!text) throw apiError(422, 'VALIDATION_ERROR', 'text is required');
    if (text.length > 200) throw apiError(422, 'VALIDATION_ERROR', 'text must be at most 200 characters');

    const row = await loadOwnConfig(uid, id);
    if (!row) throw apiError(404, 'NOT_FOUND', 'Model config not found');
    if (row.provider_class !== 'tts') {
      throw apiError(422, 'VALIDATION_ERROR', 'preview is only available for tts provider_class configs');
    }
    const voice = body.voice !== undefined && body.voice !== null ? String(body.voice) : row.voice;

    let buf: Buffer;
    if (mockEnabled() || !row.key_ciphertext) {
      buf = mockWavBuffer(text);
      res.setHeader('Content-Type', 'audio/wav');
    } else {
      const key = decryptKey(row.key_ciphertext, row.key_salt);
      buf = await synthesizeTts({ provider: { mode: 'real', key, baseUrl: row.base_url, voice }, model: row.model, voice, text });
      res.setHeader('Content-Type', 'audio/mpeg');
    }
    res.setHeader('Content-Length', String(buf.length));
    res.send(buf);
  }),
);
