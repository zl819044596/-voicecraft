/**
 * 计费与积分（Phase 6，03-接口文档 §9 / 00-CONTRACT §4 / C11）。
 *
 *   GET  /api/billing/plans    — 定价档位（公开；营销页 /pricing 可用）
 *   POST /api/billing/checkout — 创建 Creem 收银台会话（订阅/按次），预插 pending 订单
 *   POST /api/billing/cancel   — 退订（本地镜像置 canceled；Creem 调用尽力而为）
 *   GET  /api/billing/orders   — 订单列表（分页 + ?status=&kind=）
 *
 *   POST /api/webhooks/creem   — 见下方 webhooksRouter 说明（需 raw-body，独立挂载）
 *
 * 金额口径：DB numeric → 响应一律 money 字符串（"9.90"）。密钥走 config.creem
 * （CREEM_API_KEY / CREEM_WEBHOOK_SECRET），未配置时降级 503 BILLING_NOT_CONFIGURED。
 */

import express, { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { redis } from '../redis.js';
import { requireAuth } from '../session.js';
import { asyncHandler, pagination, isUuid } from '../utils.js';
import { apiError, PLANS, planById, CONSUMPTION, equivalentCounts, type PlanDef } from '@avs/shared';
import { grantCredits, syncSubscriptionAndTier } from '../credits.js';
import { config } from '../config.js';

export const router = Router();

// 档位顺序与 §9.1 响应一致（trial 不在 plans 数组，进 rules.trial）。
const PLAN_ORDER = ['byok', 'starter', 'pro', 'payg_static', 'payg_i2v'] as const;
const SUB_PLANS = new Set(['starter', 'pro']);
const PAYG_PLANS = new Set(['payg_static', 'payg_i2v']);

const CREEM_API_BASE = (process.env.CREEM_API_BASE || 'https://api.creem.io/v1').replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// §9.1 GET /api/billing/plans
// ---------------------------------------------------------------------------

function creditsField(p: PlanDef): unknown {
  switch (p.id) {
    case 'byok':
      return 'unlimited';
    case 'payg_static':
      return { amount: p.grantCredits, equivalents: '1 static + 余量', permanent: true };
    case 'payg_i2v':
      return { amount: p.grantCredits, equivalents: '1 i2v + 余量', permanent: true };
    default: {
      const e = equivalentCounts(p.id);
      return { monthly: p.grantCredits, equivalents: `≈${e.static} static 或 ${e.i2v} i2v` };
    }
  }
}

function publicPlan(p: PlanDef): Record<string, unknown> {
  const out: Record<string, unknown> = {
    sku: p.id,
    name: p.nameZh,
    price_usd: p.priceUsd ?? '0',
    interval: p.interval === 'monthly' ? 'month' : null,
    credits: creditsField(p),
    free_reruns: p.freeReruns === Infinity ? null : p.freeReruns,
  };
  if (p.features?.length) out.features = p.features;
  if (p.rules?.length) out.rules = p.rules;
  return out;
}

const PLANS_RULES = {
  credit_anchor: '1 积分 = $0.01（计价锚，不可兑现金；售卖平台生成服务积分，非上游模型 token 转售）',
  price_list: {
    static_video: CONSUMPTION.static_final,
    i2v_video: CONSUMPTION.i2v_final,
    static_rerun: CONSUMPTION.static_rerun,
    i2v_rerun: CONSUMPTION.i2v_rerun,
  },
  credit_equivalence: '300 积分 = 1 i2v = 5 static',
  monthly_credits_expire: true,
  payg_credits_expire: false,
  trial: { credits: 120, one_time: true },
};

router.get(
  '/plans',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      plans: PLAN_ORDER.map((id) => publicPlan(planById(id)!)),
      rules: PLANS_RULES,
    });
  }),
);

// ---------------------------------------------------------------------------
// §9.2 POST /api/billing/checkout
// ---------------------------------------------------------------------------

const CHECKOUT_KINDS = new Set(['subscription', 'pay_per_use']);
const SKU_TO_PLAN: Record<string, string> = {
  starter: 'starter',
  pro: 'pro',
  payg_static: 'payg_static',
  payg_i2v: 'payg_i2v',
};

router.post(
  '/checkout',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const body = req.body ?? {};
    const kind = String(body.kind ?? '').trim();
    const sku = String(body.sku ?? '').trim().toLowerCase();
    const successUrl = String(body.success_url ?? '').trim();

    if (!CHECKOUT_KINDS.has(kind)) {
      throw apiError(422, 'VALIDATION_ERROR', 'kind must be "subscription" or "pay_per_use"');
    }
    if (!(sku in SKU_TO_PLAN)) throw apiError(422, 'INVALID_SKU', `invalid sku: ${sku}`);
    const planId = SKU_TO_PLAN[sku];
    const plan = planById(planId)!;
    if (kind === 'subscription' && !SUB_PLANS.has(planId)) {
      throw apiError(422, 'INVALID_SKU', 'sku must be starter or pro for a subscription');
    }
    if (kind === 'pay_per_use' && !PAYG_PLANS.has(planId)) {
      throw apiError(422, 'INVALID_SKU', 'sku must be payg_static or payg_i2v for pay_per_use');
    }
    if (!/^https?:\/\//.test(successUrl)) {
      throw apiError(422, 'VALIDATION_ERROR', 'success_url must be an http(s) URL');
    }

    // 409 ALREADY_SUBSCRIBED：同档有效订阅不可重复购买。
    if (kind === 'subscription') {
      const active = await query(
        `SELECT 1 FROM subscriptions WHERE user_id = $1 AND status = 'active' AND plan = $2 LIMIT 1`,
        [uid, planId],
      );
      if ((active.rowCount ?? 0) > 0) {
        throw apiError(409, 'ALREADY_SUBSCRIBED', `already subscribed to ${planId}`);
      }
    }

    const apiKey = config.creem.apiKey;
    if (!apiKey) throw apiError(503, 'BILLING_NOT_CONFIGURED', 'CREEM_API_KEY not configured');
    const priceId = process.env[`CREEM_PRICE_${planId.toUpperCase()}`];
    if (!priceId) {
      throw apiError(503, 'BILLING_NOT_CONFIGURED', `CREEM_PRICE_${planId.toUpperCase()} not configured`);
    }

    // 预插 pending 订单，成功回调 metadata 回带 order_id。
    const { rows } = await query(
      `INSERT INTO orders (user_id, kind, sku, amount_usd, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [uid, kind, planId, plan.priceUsd],
    );
    const orderId = rows[0].id;

    const user = await query(`SELECT email FROM users WHERE id = $1`, [uid]);

    let checkoutUrl: string | null = null;
    let expiresAt: string | null = null;
    try {
      const resp = await fetch(`${CREEM_API_BASE}/checkouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          customer: { email: user.rows[0]?.email || null },
          items: [{ price_id: priceId }],
          success_url: successUrl || `${config.siteUrl}/app/billing?checkout=success`,
          cancel_url: String(body.cancel_url ?? '').trim() || `${config.siteUrl}/pricing`,
          metadata: { order_id: orderId, user_id: uid, plan_id: planId },
        }),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        console.warn(`[billing] creem checkout failed ${resp.status}: ${detail.slice(0, 300)}`);
        throw apiError(502, 'CREEM_ERROR', `Creem checkout failed (${resp.status})`);
      }
      const payload = (await resp.json()) as Record<string, unknown>;
      checkoutUrl = (payload?.checkout_url as string) || (payload?.url as string) || null;
      if (payload?.expires_at) expiresAt = new Date(String(payload.expires_at)).toISOString();
    } catch (err) {
      if ((err as { code?: string }).code === 'CREEM_ERROR') throw err;
      // 网络层失败：订单保留 pending 可重试，返回 502。
      throw apiError(502, 'CREEM_ERROR', `Creem checkout failed: ${(err as Error).message}`);
    }

    if (!checkoutUrl) {
      throw apiError(502, 'CREEM_ERROR', 'Creem returned no checkout_url');
    }

    res.status(201).json({
      order_id: orderId,
      checkout_url: checkoutUrl,
      expires_at: expiresAt || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/billing/cancel — 退订（尽力而为；权威在 Creem，webhook 最终同步）。
// ---------------------------------------------------------------------------

router.post(
  '/cancel',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const { rows } = await query(
      `SELECT id, creem_sub_id FROM subscriptions
        WHERE user_id = $1 AND status IN ('active', 'past_due')
        ORDER BY current_period_end DESC LIMIT 1`,
      [uid],
    );
    const sub = rows[0];
    if (!sub) throw apiError(404, 'NO_ACTIVE_SUBSCRIPTION', 'no active subscription to cancel');

    const apiKey = config.creem.apiKey;
    if (apiKey && sub.creem_sub_id) {
      try {
        const resp = await fetch(
          `${CREEM_API_BASE}/subscriptions/${encodeURIComponent(sub.creem_sub_id)}/cancel`,
          { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey } },
        );
        if (!resp.ok) {
          console.warn(
            `[billing] creem cancel failed ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`,
          );
        }
      } catch (err) {
        console.warn(`[billing] creem cancel request failed: ${(err as Error).message}`);
      }
    }

    await query(
      `UPDATE subscriptions SET status = 'canceled', updated_at = now()
        WHERE id = $1 RETURNING id`,
      [sub.id],
    );
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// §9.6 GET /api/billing/orders
// ---------------------------------------------------------------------------

router.get(
  '/orders',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const uid = req.userId!;
    const { page, size, offset } = pagination(req);
    const status = String(req.query.status ?? '').trim();
    const kind = String(req.query.kind ?? '').trim();

    const params: unknown[] = [uid];
    let where = 'WHERE user_id = $1';
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    if (kind) {
      params.push(kind);
      where += ` AND kind = $${params.length}`;
    }

    const [data, count] = await Promise.all([
      query(
        `SELECT id, kind, sku, amount_usd, status, creem_order_id, created_at
           FROM orders ${where}
          ORDER BY created_at DESC, id DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, size, offset],
      ),
      query(`SELECT count(*)::int AS total FROM orders ${where}`, params),
    ]);

    res.json({
      items: data.rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        sku: r.sku,
        amount_usd: r.amount_usd === null ? null : Number(r.amount_usd).toFixed(2),
        status: r.status,
        creem_order_id: r.creem_order_id,
        created_at: r.created_at,
      })),
      page,
      size,
      total: count.rows[0].total,
    });
  }),
);

// ---------------------------------------------------------------------------
// §9.3 POST /api/webhooks/creem — 独立挂载（raw-body 验签），见 index.ts。
//   - creem-signature = HMAC-SHA256(secret, rawBody) hex，恒定时间比较
//   - 时间戳偏差 ≤ 5min 防重放
//   - Redis NX avs:webhook:<eventId> EX 86400 事件幂等（重复投递直接 200）
//   - 未知事件类型：200 忽略并记日志
//   - 业务处理失败：移除 NX 锁后抛错 → 500，让 Creem 重投
// ---------------------------------------------------------------------------

export const webhooksRouter = Router();

const RAW_JSON = express.json({
  limit: '1mb',
  verify: (req: Request, _res: Response, buf: Buffer) => {
    (req as Request & { rawBody?: Buffer }).rawBody = buf;
  },
});

function safeCompareHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** sku → plan id：接受 plan id（starter）或 PLANS.sku（starter_monthly）。 */
function normalizePlanId(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (planById(s)) return s;
  for (const p of PLANS) {
    if (p.sku === s) return p.id;
  }
  const legacy: Record<string, string> = {
    starter_monthly: 'starter',
    pro_monthly: 'pro',
    static_once: 'payg_static',
    i2v_once: 'payg_i2v',
  };
  return legacy[s] || null;
}

interface WebhookEvent {
  id: string;
  type: string;
  created_at?: number;
  data: Record<string, unknown>;
}

function extractEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const norm = (e: Record<string, unknown>): WebhookEvent => ({
    id: String(e.id ?? ''),
    type: String(e.type ?? ''),
    created_at: typeof e.created_at === 'number' ? e.created_at : undefined,
    data: (e.data && typeof e.data === 'object' ? e.data : {}) as Record<string, unknown>,
  });
  if (Array.isArray(payload.events)) return payload.events.map((e) => norm(e as Record<string, unknown>));
  if (payload.event && typeof payload.event === 'object') return [norm(payload.event as Record<string, unknown>)];
  return [norm(payload)];
}

// --- 事件处理 --------------------------------------------------------------

interface OrderRow {
  id: string;
  user_id: string;
  kind: string;
  sku: string;
  status: string;
}

async function fulfillOrder(args: {
  orderId: string | null;
  creemOrderId: string | null;
  userId: string | null;
  creemSubId: string | null;
  planId: string | null;
  periodEnd?: string;
}): Promise<void> {
  const { creemOrderId } = args;
  const ourId = args.orderId && isUuid(args.orderId) ? args.orderId : null;

  await withTransaction(async (client) => {
    // 按 metadata.order_id（我们落库的 uuid）claim pending 订单；否则按 creem_order_id。
    // 注意：UPDATE ... RETURNING 返回的是更新后的行（status 已是 paid），
    // 不能拿它判"是否 pending"，要用 rowCount 判定是否真的 claim 成功。
    let r: { rowCount: number | null; rows: Array<OrderRow> } | undefined;
    let claimed = false;
    if (ourId) {
      r = await client.query(
        `UPDATE orders SET status = 'paid', creem_order_id = $2, updated_at = now()
          WHERE id = $1 AND status = 'pending'
          RETURNING id, user_id, kind, sku, status`,
        [ourId, creemOrderId],
      );
      claimed = (r.rowCount ?? 0) > 0;
      if (!claimed) {
        r = await client.query(
          `SELECT id, user_id, kind, sku, status FROM orders WHERE id = $1`,
          [ourId],
        );
      }
    } else if (creemOrderId) {
      r = await client.query(
        `UPDATE orders SET status = 'paid', updated_at = now()
          WHERE creem_order_id = $1 AND status = 'pending'
          RETURNING id, user_id, kind, sku, status`,
        [creemOrderId],
      );
      claimed = (r.rowCount ?? 0) > 0;
    }
    if (!r || (r.rowCount ?? 0) === 0) {
      throw new Error(`fulfillOrder: order not found (order_id=${ourId} creem=${creemOrderId})`);
    }
    const o = r.rows[0];
    if (!claimed) return; // 已被处理（paid/refunded…）→ 幂等跳过

    const planId = normalizePlanId(args.planId) || normalizePlanId(o.sku) || 'pro';
    const plan = planById(planId);
    const grant = plan?.grantCredits ?? 0;

    if (o.kind === 'pay_per_use') {
      if (grant > 0) {
        await grantCredits(client, { userId: o.user_id, kind: 'topup', amount: grant, note: `按次购买 ${o.sku}` });
      }
    } else {
      if (grant > 0) {
        await grantCredits(client, {
          userId: o.user_id,
          kind: 'grant_subscription',
          amount: grant,
          note: `订阅发放 ${o.sku}`,
        });
      }
      await syncSubscriptionAndTier(client, {
        userId: o.user_id,
        creemSubId: args.creemSubId,
        status: 'active',
        currentPeriodEnd: args.periodEnd,
        plan: normalizePlanId(o.sku) || 'pro',
      });
    }
  });
}

async function syncSubscriptionEvent(
  type: string,
  args: { userId: string | null; creemSubId: string | null; planId: string | null; periodEnd?: string },
): Promise<void> {
  const { creemSubId, periodEnd } = args;
  let sub = null;
  if (creemSubId) {
    const r = await query(`SELECT id, user_id, plan FROM subscriptions WHERE creem_sub_id = $1`, [creemSubId]);
    sub = r.rows[0] ?? null;
  }
  const userId = args.userId || sub?.user_id;
  if (!userId) throw new Error(`subscription event without user (sub=${creemSubId})`);

  const planId = normalizePlanId(args.planId) || sub?.plan || 'pro';
  const plan = planById(planId) || planById('pro')!;

  await withTransaction(async (client) => {
    if (type === 'paid') {
      await grantCredits(client, {
        userId,
        kind: 'grant_subscription',
        amount: plan.grantCredits ?? 0,
        note: `订阅续费 ${planId}（period ${periodEnd || '?'}）`,
      });
    }
    const status = type === 'trialing' ? 'active' : type; // 内部无 trialing 态（schema CHECK）
    await syncSubscriptionAndTier(client, {
      userId,
      creemSubId,
      status,
      currentPeriodEnd: periodEnd,
      plan: planId,
    });
  });
}

async function handleRefund(args: { orderId: string | null; userId: string | null }): Promise<void> {
  const ourId = args.orderId && isUuid(args.orderId) ? args.orderId : null;
  await withTransaction(async (client) => {
    let o;
    if (ourId) {
      const r = await client.query(
        `SELECT id, user_id, kind, sku, status FROM orders WHERE id = $1`,
        [ourId],
      );
      o = r.rows[0] ?? null;
    } else if (args.userId) {
      const r = await client.query(
        `SELECT id, user_id, kind, sku, status FROM orders
          WHERE user_id = $1 AND status = 'paid' AND kind = 'pay_per_use'
          ORDER BY created_at DESC LIMIT 1`,
        [args.userId],
      );
      o = r.rows[0] ?? null;
    }
    if (!o) throw new Error(`handleRefund: order not found (order_id=${ourId})`);
    if (o.status === 'refunded') return; // 幂等
    if (o.status !== 'paid') return; // 未支付订单退款忽略

    await client.query(`UPDATE orders SET status = 'refunded', updated_at = now() WHERE id = $1`, [o.id]);

    // 反向冲正：扣回购买时发放的积分，落 refund 流水。
    const plan = planById(normalizePlanId(o.sku) || '');
    const granted = plan?.grantCredits ?? 0;
    if (granted > 0) {
      const acc = await client.query(
        `SELECT credits, trial_credits FROM credit_accounts WHERE user_id = $1 FOR UPDATE`,
        [o.user_id],
      );
      if ((acc.rowCount ?? 0) === 0) throw new Error(`handleRefund: credit_accounts missing for user ${o.user_id}`);
      const credits = Number(acc.rows[0].credits) || 0;
      const take = Math.min(credits, granted);
      await client.query(
        `UPDATE credit_accounts SET credits = credits - $2, updated_at = now() WHERE user_id = $1`,
        [o.user_id, take],
      );
      await client.query(
        `INSERT INTO credit_ledger (user_id, kind, amount, balance_after, note)
         VALUES ($1, 'refund', $2, $3, $4)`,
        [o.user_id, -take, credits - take, `refund for order ${o.id} (${o.sku})`],
      );
    }
  });
}

async function dispatchEvent(type: string, data: Record<string, unknown>): Promise<void> {
  const meta = (data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) as Record<string, unknown>;
  const orderId = meta.order_id ? String(meta.order_id) : null;
  const creemOrderId = data.order_id ? String(data.order_id) : null;
  const userId = meta.user_id ? String(meta.user_id) : null;
  const product = (data.product && typeof data.product === 'object' ? data.product : {}) as Record<string, unknown>;
  const planId = meta.plan_id ? String(meta.plan_id) : product.sku ? String(product.sku) : null;
  const creemSubId = data.subscription_id
    ? String(data.subscription_id)
    : data.subscription && typeof data.subscription === 'object'
      ? String((data.subscription as Record<string, unknown>).id ?? null)
      : null;
  const periodEnd = data.current_period_end ? String(data.current_period_end) : undefined;

  switch (type) {
    case 'checkout.completed':
      return fulfillOrder({ orderId, creemOrderId, userId, creemSubId, planId, periodEnd });
    case 'subscription.paid':
    case 'subscription.active':
    case 'subscription.trialing':
    case 'subscription.canceled':
    case 'subscription.expired':
    case 'subscription.update':
      return syncSubscriptionEvent(type.split('.')[1], { userId, creemSubId, planId, periodEnd });
    case 'refund.created':
      return handleRefund({ orderId, userId });
    default:
      console.log(`[billing] webhook unknown event type "${type}" — ignored`);
  }
}

async function handleCreemWebhook(req: Request): Promise<void> {
  const secret = config.creem.webhookSecret;
  if (!secret) throw apiError(503, 'BILLING_NOT_CONFIGURED', 'CREEM_WEBHOOK_SECRET not configured');

  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw || raw.length === 0) throw apiError(400, 'INVALID_BODY', 'webhook body is empty');

  // 验签：恒定时间比较（R1）。
  const headerSig = String(req.headers['creem-signature'] ?? req.headers['x-creem-signature'] ?? '');
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  if (!headerSig || !safeCompareHex(headerSig, expected)) {
    throw apiError(401, 'INVALID_SIGNATURE', 'webhook signature mismatch');
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw apiError(400, 'INVALID_BODY', 'webhook body is not valid JSON');
  }

  for (const ev of extractEvents(payload)) {
    if (!ev.id) continue;
    // 时间戳防重放：偏差 > 5min 拒绝。
    if (ev.created_at && Math.abs(Date.now() / 1000 - ev.created_at) > 300) {
      throw apiError(401, 'INVALID_SIGNATURE', 'webhook event timestamp too old');
    }
    // 事件幂等：NX 拿到锁才处理，否则视为已处理（200）。
    const lockKey = `avs:webhook:${ev.id}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
    if (!acquired) {
      console.log(`[billing] webhook event ${ev.id} already processed — skip`);
      continue;
    }
    try {
      await dispatchEvent(ev.type, ev.data);
    } catch (err) {
      // 业务失败 → 释放锁让 Creem 重投。
      await redis.del(lockKey).catch(() => {});
      throw err;
    }
  }
}

webhooksRouter.post(
  '/creem',
  RAW_JSON,
  asyncHandler(async (req: Request, res: Response) => {
    await handleCreemWebhook(req);
    res.json({ received: true });
  }),
);
