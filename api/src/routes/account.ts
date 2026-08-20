/**
 * 账号生命周期与 GDPR（Phase 7，03-接口文档 §10 / 00-CONTRACT C6 / R8）。
 *
 *   GET    /api/account/export — 导出本人全部数据（zip 流式；每用户 1 次/24h）
 *   PUT    /api/account/profile — 更新 nickname（≤120）与 locale（en|zh）
 *   DELETE /api/account        — 注销（Right to Erasure）：确认邮箱 → 退订检查 →
 *                                退款在跑托管任务 → PII 匿名化墓碑 → 删凭据/素材 →
 *                                订单/账本/成本流水留匿名化财务存根
 *
 * 导出内容（不含 credentials 密文与 api_cost_log 平台成本流水）：
 *   manifest.json / profile.json / projects/*.json / prompts.json /
 *   products.json / benchmarks.json / media_assets.json / orders.json /
 *   subscriptions.json / credit_ledger.json
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import archiver from 'archiver';
import { query, withTransaction } from '../db.js';
import { redis } from '../redis.js';
import { requireAuth, destroySession, clearSessionCookie } from '../session.js';
import { asyncHandler } from '../utils.js';
import { apiError } from '@avs/shared';
import { refundForTask } from '../credits.js';

export const router = Router();
router.use(requireAuth);

const GDPR_RATE_LIMIT_SECONDS = 24 * 3600; // 每用户 1 次/24h
const RETENTION_DAYS = 30; // C7 导出保留 30 天

// ---------------------------------------------------------------------------
// GET /api/account/export
// ---------------------------------------------------------------------------

async function loadAccountExport(uid: string) {
  const [user, acct, prompts, products, benchmarks, mediaAssets, orders, subs, ledger, projects] =
    await Promise.all([
      query(
        `SELECT id, email, nickname, locale, age_confirmed, tier, status, created_at, updated_at
           FROM users WHERE id = $1`,
        [uid],
      ),
      query(
        `SELECT credits, trial_credits, trial_granted, created_at, updated_at
           FROM credit_accounts WHERE user_id = $1`,
        [uid],
      ),
      query(
        `SELECT type, name, scenario, body, tags, enabled, is_default, created_at, updated_at
           FROM prompts WHERE user_id = $1 ORDER BY created_at`,
        [uid],
      ),
      query(
        `SELECT name, category, price, commission_rate, product_url, detail_text,
                visibility, status, gen_count, created_at, updated_at
           FROM products WHERE user_id = $1 ORDER BY created_at`,
        [uid],
      ),
      query(
        `SELECT account, title, video_url, source_text, product_id, duration,
                visibility, created_at, updated_at
           FROM benchmarks WHERE user_id = $1 ORDER BY created_at`,
        [uid],
      ),
      query(
        `SELECT type, name, url, size, meta, created_at
           FROM media_assets WHERE user_id = $1 ORDER BY created_at`,
        [uid],
      ),
      query(
        `SELECT id, creem_order_id, kind, sku, amount_usd, status, created_at
           FROM orders WHERE user_id = $1 ORDER BY created_at`,
        [uid],
      ),
      query(
        `SELECT id, creem_sub_id, plan, status, current_period_end, created_at, updated_at
           FROM subscriptions WHERE user_id = $1 ORDER BY created_at`,
        [uid],
      ),
      query(
        `SELECT id, task_id, kind, amount, balance_after, note, created_at
           FROM credit_ledger WHERE user_id = $1 ORDER BY created_at`,
        [uid],
      ),
      query(
        `SELECT p.id, p.title, p.source_type, p.status, p.prompt, p.created_at, p.updated_at,
                coalesce(json_agg(
                  json_build_object(
                    'id', t.id, 'mode', t.mode, 'track', t.track, 'status', t.status,
                    'current_step', t.current_step, 'credits_frozen', t.credits_frozen,
                    'credits_settled', t.credits_settled,
                    'created_at', t.created_at, 'updated_at', t.updated_at
                  ) ORDER BY t.created_at
                ) FILTER (WHERE t.id IS NOT NULL), '[]') AS tasks
           FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
          WHERE p.user_id = $1
          GROUP BY p.id
          ORDER BY p.created_at`,
        [uid],
      ),
    ]);

  return {
    user: user.rows[0] || null,
    credits: acct.rows[0] || null,
    prompts: prompts.rows,
    products: products.rows,
    benchmarks: benchmarks.rows,
    media_assets: mediaAssets.rows,
    orders: orders.rows,
    subscriptions: subs.rows,
    credit_ledger: ledger.rows,
    projects: projects.rows,
  };
}

router.get(
  '/export',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;

    // 限流：Redis NX EX 86400；Redis 不可用时放行（导出可用性优先）。
    try {
      const acquired = await redis.set(`avs:gdpr:${uid}`, '1', 'EX', GDPR_RATE_LIMIT_SECONDS, 'NX');
      if (!acquired) {
        throw apiError(429, 'RATE_LIMITED', 'data export is limited to once per 24 hours');
      }
    } catch (err) {
      if ((err as { code?: string }).code === 'RATE_LIMITED') throw err;
      /* fail-open */
    }

    const data = await loadAccountExport(uid);
    if (!data.user) throw apiError(404, 'NOT_FOUND', 'account not found');

    const generatedAt = new Date();
    const profile = {
      user: data.user,
      credits: data.credits,
    };
    const manifest = {
      format: 'avs-gdpr-export',
      version: 1,
      generated_at: generatedAt.toISOString(),
      retention_days: RETENTION_DAYS,
      user_id: data.user.id,
      files: [
        'profile.json',
        'prompts.json',
        'products.json',
        'benchmarks.json',
        'media_assets.json',
        'orders.json',
        'subscriptions.json',
        'credit_ledger.json',
        ...data.projects.map((_, i) => `projects/${i + 1}.json`),
      ],
    };

    const date = generatedAt.toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="avs-gdpr-export-${date}.zip"`);

    const zip = archiver('zip', { zlib: { level: 6 } });
    zip.pipe(res);
    zip.append(Buffer.from(JSON.stringify(manifest, null, 2)), { name: 'manifest.json' });
    zip.append(Buffer.from(JSON.stringify(profile, null, 2)), { name: 'profile.json' });
    zip.append(Buffer.from(JSON.stringify(data.prompts, null, 2)), { name: 'prompts.json' });
    zip.append(Buffer.from(JSON.stringify(data.products, null, 2)), { name: 'products.json' });
    zip.append(Buffer.from(JSON.stringify(data.benchmarks, null, 2)), { name: 'benchmarks.json' });
    zip.append(Buffer.from(JSON.stringify(data.media_assets, null, 2)), { name: 'media_assets.json' });
    zip.append(Buffer.from(JSON.stringify(data.orders, null, 2)), { name: 'orders.json' });
    zip.append(Buffer.from(JSON.stringify(data.subscriptions, null, 2)), { name: 'subscriptions.json' });
    zip.append(Buffer.from(JSON.stringify(data.credit_ledger, null, 2)), { name: 'credit_ledger.json' });
    data.projects.forEach((project, i) => {
      zip.append(Buffer.from(JSON.stringify(project, null, 2)), { name: `projects/${i + 1}.json` });
    });
    await zip.finalize();
  }),
);

// ---------------------------------------------------------------------------
// PUT /api/account/profile — 仅 nickname（≤120）与 locale（en|zh）可写。
// ---------------------------------------------------------------------------

router.put(
  '/profile',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const body = req.body ?? {};

    const sets: string[] = [];
    const values: unknown[] = [uid];
    const push = (col: string, val: unknown) => {
      sets.push(`${col} = $${values.length + 1}`);
      values.push(val);
    };

    if (body.nickname !== undefined) {
      const nickname = String(body.nickname).trim();
      if (nickname.length > 120) {
        throw apiError(422, 'VALIDATION_ERROR', 'nickname must be at most 120 characters');
      }
      push('nickname', nickname || null);
    }
    if (body.locale !== undefined) {
      const locale = String(body.locale).trim();
      if (locale !== 'en' && locale !== 'zh') {
        throw apiError(422, 'VALIDATION_ERROR', "locale must be 'en' or 'zh'");
      }
      push('locale', locale);
    }
    if (sets.length === 0) {
      throw apiError(422, 'VALIDATION_ERROR', 'No updatable fields provided');
    }

    const r = await query(
      `UPDATE users SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $1
        RETURNING id, email, nickname, locale, tier, age_confirmed, status, created_at, updated_at`,
      values,
    );
    if ((r.rowCount ?? 0) === 0) throw apiError(404, 'NOT_FOUND', 'account not found');
    res.json({ user: r.rows[0] });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/account — 注销（Right to Erasure）。
// ---------------------------------------------------------------------------

router.delete(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const email = req.user?.email ?? null;
    const confirmEmail = String(req.body?.confirm_email ?? '').trim();

    if (!email || confirmEmail !== email) {
      throw apiError(422, 'EMAIL_MISMATCH', 'confirm_email must match the signed-in account email');
    }

    // 有 active 订阅 → 409（文档 R8：需先取消订阅再注销）。
    const sub = await query(
      `SELECT 1 FROM subscriptions WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [uid],
    );
    if ((sub.rowCount ?? 0) > 0) {
      throw apiError(409, 'ACTIVE_SUBSCRIPTION', 'cancel your active subscription before deleting the account');
    }

    // 队列/运行中的托管任务：退款解冻 + 标记 cancelled（refundForTask 独立事务幂等；
    // 随后 tasks 随 projects 级联删除，credit_ledger.task_id 置 NULL 留存账本）。
    const running = await query(
      `SELECT t.id FROM tasks t JOIN projects p ON p.id = t.project_id
        WHERE p.user_id = $1 AND t.track = 'managed' AND t.status IN ('queued','running')`,
      [uid],
    );
    for (const { id } of running.rows) {
      await refundForTask(id);
      // tasks 无 error 列（04 §2.6）；失败/取消细节记 step_results，此处仅置终态。
      await query(
        `UPDATE tasks SET status = 'cancelled', updated_at = now()
          WHERE id = $1`,
        [id],
      );
    }

    const deletedAt = new Date();
    // 不可逆墓碑邮箱（占位唯一，避免与原 UNIQUE(email) 冲突）。
    const tombEmail = `deleted-${randomUUID()}@avs.invalid`;

    await withTransaction(async (client) => {
      // 1. PII 匿名化（users 墓碑：status='deleted'，PII 哈希占位；订单/账本 FK 无级联，
      //    user 行保留为财务存根外键锚点）。
      await client.query(
        `UPDATE users
            SET email = $2, google_sub = NULL, nickname = 'Deleted User',
                status = 'deleted', updated_at = now()
          WHERE id = $1`,
        [uid, tombEmail],
      );
      // 2. 删除凭据密文与配置。
      await client.query(`DELETE FROM credentials WHERE user_id = $1`, [uid]);
      await client.query(`DELETE FROM model_configs WHERE user_id = $1`, [uid]);
      // 3. 删除素材与资料库（user 维度物理删除）。
      await client.query(`DELETE FROM media_assets WHERE user_id = $1`, [uid]);
      await client.query(`DELETE FROM products WHERE user_id = $1`, [uid]);
      await client.query(`DELETE FROM benchmarks WHERE user_id = $1`, [uid]);
      await client.query(`DELETE FROM prompts WHERE user_id = $1`, [uid]);
      await client.query(`DELETE FROM credit_accounts WHERE user_id = $1`, [uid]);
      // 4. projects 级联删 tasks / step_results / assets / exports；credit_ledger.task_id
      //    置 NULL、api_cost_log 随 tasks 级联 —— 账本与成本流水自然留存。
      await client.query(`DELETE FROM projects WHERE user_id = $1`, [uid]);
      // 5. 滥用举报按 contact 邮箱匿名化（R8 PII 清除）。
      await client.query(`UPDATE report_abuse SET contact = NULL WHERE contact = $1`, [email]);
    });

    // 销毁会话 + 清 Cookie。
    if (req.sessionSid) await destroySession(req.sessionSid);
    clearSessionCookie(res);

    res.json({ ok: true, deleted_at: deletedAt.toISOString() });
  }),
);
