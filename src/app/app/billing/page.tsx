"use client";

// 订阅积分 (/app/billing). Consumes the 03-接口文档 §9 contract (rebuild-v3):
//
//   GET  /api/billing/plans     → { plans:[{sku,name,price_usd,interval,credits,
//                                         free_reruns,features,rules}], rules }
//   POST /api/billing/checkout  → 201 { order_id, checkout_url, expires_at }
//                                 body { kind, sku, success_url, cancel_url }
//                                 (409 ALREADY_SUBSCRIBED / 422 INVALID_SKU /
//                                  503 BILLING_NOT_CONFIGURED)
//   POST /api/billing/cancel    → { ok }
//   GET  /api/billing/orders    → { items:[{... amount_usd:string|null}], page, size, total }
//   GET  /api/credits           → { credits, trial_credits, trial_granted,
//                                   equivalents:{static_count,i2v_count}, subscription,
//                                   free_reruns_per_task }
//   GET  /api/credits/ledger    → { items, page, size, total }
//
// 档位识别：subscription = sku ∈ {starter, pro}；pay_per_use = sku ∈
// {payg_static, payg_i2v}（按次积分永久有效，见 rules.payg_credits_expire）。
// Money 一律为字符串（§9），price_usd/amount_usd 展示前转数字或直接拼接。

import { useEffect, useState } from "react";
import { ApiRequestError, apiFetch } from "@/lib/api-client";
import { useTranslation } from "@/i18n";
import type { BillingPlan, CheckoutResult, OrderView, CreditState } from "@avs/shared";
import {
  Badge,
  Btn,
  Card,
  CardHead,
  DataTable,
  EmptyState,
  PageHeader,
  Td,
  Tr,
} from "@/components/app/proto";

type LedgerRow = {
  id: string;
  task_id: string | null;
  kind: string;
  amount: number;
  balance_after: number | null;
  note: string | null;
  created_at: string;
};

const SUB_SKUS = new Set(["starter", "pro"]);
const PAYG_SKUS = new Set(["payg_static", "payg_i2v"]);

/** money 字符串 → 展示 "9.90"（null → "—"）。 */
function moneyStr(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : v;
}

/** 计划 credits 字段 → 展示的积分数字（分订阅月度 / 按次一次 / byok 无限）。 */
function creditsCount(p: BillingPlan): string {
  const c = p.credits;
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && "monthly" in c) return String(c.monthly);
  if (c && typeof c === "object" && "amount" in c) return String(c.amount);
  return "—";
}

function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const LEDGER_KIND_KEY: Record<string, string> = {
  freeze: "billing.kindFreeze",
  settle: "billing.kindSettle",
  rerun_static: "billing.kindRerunStatic",
  rerun_i2v: "billing.kindRerunI2v",
  topup: "billing.kindTopup",
  grant_subscription: "billing.kindGrantSubscription",
  grant_trial: "billing.kindGrantTrial",
  refund: "billing.kindRefund",
};

const ORDER_STATUS_BADGE: Record<string, "green" | "gray" | "orange"> = {
  paid: "green",
  refunded: "gray",
  pending: "orange",
};

// 重跑收费矩阵（原型 billing.html · 托管档）：行 = 档位，列 = 免费重跑 / 超出按次。
const RERUN_ROWS = [
  { labelKey: "billing.rowTrial", freeKey: "billing.rerunFree2", overKey: "billing.rerunOverage" },
  { labelKey: "billing.rowStarter", freeKey: "billing.rerunFree3", overKey: "billing.rerunOverage" },
  { labelKey: "billing.rowPro", freeKey: "billing.rerunFree5", overKey: "billing.rerunOverage" },
  { labelKey: "billing.rowByok", freeKey: "billing.rerunUnlimited", overKey: "billing.rerunUnmetered" },
];

export default function BillingPage() {
  const { t } = useTranslation();

  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [credits, setCredits] = useState<CreditState | null>(null);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // C2 — 退订 + 按次购买弹层状态。
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [paygOpen, setPaygOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [plansRes, creditsRes, ordersRes, ledgerRes] = await Promise.allSettled([
        apiFetch<{ plans: BillingPlan[] }>("/api/billing/plans"),
        apiFetch<CreditState>("/api/credits"),
        apiFetch<{ items: OrderView[] }>("/api/billing/orders?size=50"),
        apiFetch<{ items: LedgerRow[] }>("/api/credits/ledger?size=50"),
      ]);
      if (cancelled) return;

      if (plansRes.status === "fulfilled") setPlans(plansRes.value.plans ?? []);
      if (creditsRes.status === "fulfilled") setCredits(creditsRes.value);
      if (ordersRes.status === "fulfilled") setOrders(ordersRes.value.items ?? []);
      if (ledgerRes.status === "fulfilled") setLedger(ledgerRes.value.items ?? []);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheckout = async (p: BillingPlan) => {
    const planId = p.sku;
    if (checkoutPlan) return;
    setCheckoutPlan(planId);
    setCheckoutError(null);
    const kind = SUB_SKUS.has(planId) ? "subscription" : "pay_per_use";
    try {
      const data = await apiFetch<CheckoutResult>("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          sku: planId,
          success_url: `${window.location.origin}/app/billing?checkout=success`,
          cancel_url: `${window.location.origin}/app/billing`,
        }),
      });
      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setCheckoutError(t("billing.checkoutEmpty"));
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "BILLING_NOT_CONFIGURED") {
        setCheckoutError(t("billing.checkoutNotConfigured"));
      } else if (err instanceof ApiRequestError && err.code === "ALREADY_SUBSCRIBED") {
        setCheckoutError(t("billing.alreadySubscribed"));
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setCheckoutError(t("billing.checkoutError", { message: msg }));
      }
    } finally {
      setCheckoutPlan(null);
    }
  };

  // C2 — 退订：POST /api/billing/cancel，成功后刷新余额（订阅信息随之变 canceled）。
  const handleCancel = async () => {
    if (cancelling) return;
    if (!window.confirm(t("billing.cancelConfirm"))) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await apiFetch<{ ok: boolean }>("/api/billing/cancel", { method: "POST" });
      const creditsRes = await apiFetch<CreditState>("/api/credits");
      setCredits(creditsRes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCancelError(t("billing.cancelFail", { message: msg }));
    } finally {
      setCancelling(false);
    }
  };

  const sub = credits?.subscription ?? null;
  const isSubActive = !!sub && (sub.status === "active" || sub.status === "past_due");
  const currentPlanId =
    sub?.plan === "starter" || sub?.plan === "pro" ? sub.plan : "free";
  // 切换套餐按钮只列订阅档（按次购买走余额卡）。
  const subPlans = plans.filter((p) => SUB_SKUS.has(p.sku));
  const paygPlans = plans.filter((p) => PAYG_SKUS.has(p.sku));

  return (
    <div className="mx-auto w-full">
      <PageHeader title={t("billing.pageTitle")} />

      {/* ── 当前套餐 + 积分余额 ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 当前套餐 */}
        <Card>
          <CardHead title={t("billing.currentPlan")} sub={t("billing.currentPlanSub")} />
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="text-xl font-extrabold">{t(`billing.planName.${currentPlanId}`)}</span>
            {isSubActive ? (
              <Badge variant="green" dot>
                {t("billing.planActive")}
              </Badge>
            ) : (
              <Badge variant="gray">{t("billing.planFree")}</Badge>
            )}
          </div>
          {sub?.current_period_end ? (
            <p className="text-[13px] leading-6 text-text-secondary">
              {t("billing.planRenewal", { date: shortDate(sub.current_period_end) })}
            </p>
          ) : (
            <p className="text-[13px] leading-6 text-text-secondary">{t("billing.planNoSub")}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {subPlans.map((p) => (
              <Btn
                key={p.sku}
                size="sm"
                variant={p.sku === "pro" ? "primary" : "default"}
                onClick={() => handleCheckout(p)}
              >
                {t("billing.changePlanFor", { name: p.name })}
              </Btn>
            ))}
            {isSubActive ? (
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancel}
                className="rounded px-2 py-1 text-[13px] text-[var(--danger,#e5484d)] transition hover:bg-[var(--danger,#e5484d)]/10 disabled:opacity-50"
              >
                {cancelling ? t("billing.canceling") : t("billing.cancelSub")}
              </button>
            ) : null}
          </div>
          {cancelError ? (
            <p className="mt-2 text-[13px] text-[var(--danger,#e5484d)]">{cancelError}</p>
          ) : null}
          <div className="mt-3 border-t border-border pt-3 text-[12px] leading-[1.8] text-text-tertiary">
            {t("billing.switchHint")}
          </div>
        </Card>

        {/* 积分余额 */}
        <Card>
          <CardHead title={t("billing.creditBalance")} sub={t("billing.noteBalance")} />
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[24px] font-medium tabular-nums">{credits?.credits ?? 0}</span>
              <span className="text-text-secondary">{t("billing.creditsUnit")}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[17px] font-medium text-text-tertiary">
                {credits?.trial_credits ?? 0}
              </span>
              <span className="text-[12px] text-text-secondary">
                {t("billing.trialLabel", { n: 120 })}
              </span>
            </div>
          </div>
          <p className="mt-2 text-[13px] text-text-secondary">
            {t("billing.equivalent", {
              static: credits?.equivalents.static_count ?? 0,
              i2v: credits?.equivalents.i2v_count ?? 0,
            })}
          </p>
          <div className="mt-3">
            <Btn variant="primary" onClick={() => setPaygOpen(true)}>
              {t("billing.buyCredits")}
            </Btn>
            <span className="ml-3 text-[12px] text-text-tertiary">{t("billing.paygHint")}</span>
          </div>
        </Card>
      </div>

      {/* ── 积分换算 + 重跑收费 ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title={t("billing.convertTitle")} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">300 {t("billing.creditsUnit")}</span>
            <span className="text-text-tertiary">=</span>
            <span>1 i2v</span>
            <span className="text-text-tertiary">=</span>
            <span>5 static</span>
            <span className="text-[12px] text-text-tertiary">{t("billing.convertPer")}</span>
          </div>
          <div className="mt-2 border-t border-border pt-2 text-[13px] leading-6 text-text-secondary">
            <p>{t("billing.convertPrice")}</p>
            <p>{t("billing.freezeSettle")}</p>
          </div>
        </Card>
        <Card>
          <CardHead title={t("billing.rerunTitle")} />
          <DataTable columns={[t("billing.colPlan"), t("billing.colFreeReruns"), t("billing.colOverage")]}>
            {RERUN_ROWS.map((row) => (
              <Tr key={row.labelKey}>
                <Td className="font-medium text-text-primary">{t(row.labelKey)}</Td>
                <Td className="text-text-secondary">{t(row.freeKey)}</Td>
                <Td className="text-text-secondary">{t(row.overKey)}</Td>
              </Tr>
            ))}
          </DataTable>
          <p className="mt-2 text-[12px] text-text-tertiary">{t("billing.rerunHint")}</p>
        </Card>
      </div>

      {/* ── 积分流水 ── */}
      <Card className="mt-4">
        <CardHead title={t("billing.ledgerTitle")} sub={t("billing.noteLedger")} />
        {ledger.length === 0 ? (
          <EmptyState title={t("billing.noLedger")} />
        ) : (
          <DataTable
            columns={[
              t("billing.colTime"),
              t("billing.colKind"),
              t("billing.colAmount"),
              t("billing.colBalance"),
              t("billing.colNote"),
            ]}
          >
            {ledger.map((row) => (
              <Tr key={row.id}>
                <Td className="text-text-secondary">{shortDateTime(row.created_at)}</Td>
                <Td>
                  <span className="text-text-secondary">
                    {t(LEDGER_KIND_KEY[row.kind] ?? row.kind)}
                  </span>
                </Td>
                <Td>
                  <span style={{ color: row.amount >= 0 ? "#2f9e44" : "#e5484d" }}>
                    {row.amount >= 0 ? "+" : ""}
                    {row.amount}
                  </span>
                </Td>
                <Td className="text-text-secondary">
                  {row.balance_after === null ? "—" : row.balance_after}
                </Td>
                <Td className="text-text-secondary">{row.note ?? "—"}</Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </Card>

      {/* ── 订单 ── */}
      <Card className="mt-4">
        <CardHead title={t("billing.ordersTitle")} sub={t("billing.noteOrders")} />
        {orders.length === 0 ? (
          <EmptyState title={t("billing.noOrders")} />
        ) : (
          <DataTable
            columns={[
              t("billing.colOrder"),
              t("billing.colSku"),
              t("billing.colAmount"),
              t("billing.colStatus"),
              t("billing.colDate"),
              t("billing.colReceipt"),
            ]}
          >
            {orders.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <span className="font-mono text-[12px] text-text-secondary">
                    {row.creem_order_id
                      ? `${row.creem_order_id.slice(0, 14)}…`
                      : row.id.slice(0, 8)}
                  </span>
                </Td>
                <Td className="text-text-secondary">
                  {row.kind} · {row.sku}
                </Td>
                <Td>${moneyStr(row.amount_usd)}</Td>
                <Td>
                  <Badge variant={ORDER_STATUS_BADGE[row.status] ?? "gray"}>
                    {t(`billing.status${row.status[0].toUpperCase()}${row.status.slice(1)}`)}
                  </Badge>
                </Td>
                <Td className="text-text-secondary">{shortDate(row.created_at)}</Td>
                <Td>
                  <span className="text-[13px] text-text-tertiary">{t("billing.noReceipt")}</span>
                </Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </Card>

      {/* ── 按次购买弹层（static 190 / $1.9 · i2v 790 / $7.9 · 永久有效） ── */}
      {paygOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPaygOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-bg-subtle p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-text-primary">{t("billing.paygTitle")}</h3>
              <button
                type="button"
                onClick={() => setPaygOpen(false)}
                className="shrink-0 rounded border border-border px-3 py-1 text-xs text-text-secondary transition hover:border-error/40 hover:text-error"
              >
                {t("common.close")}
              </button>
            </div>
            <p className="mb-4 text-[12px] text-text-tertiary">{t("billing.paygPermanent")}</p>
            {paygPlans.map((p) => (
              <div
                key={p.sku}
                className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-bg px-3 py-2.5"
              >
                <div>
                  <div className="text-[13px] font-semibold text-text-primary">{p.name}</div>
                  <div className="text-[12px] text-text-secondary">
                    {creditsCount(p)} {t("billing.creditsUnit")}
                  </div>
                </div>
                <Btn
                  size="sm"
                  variant="primary"
                  disabled={checkoutPlan !== null}
                  onClick={() => handleCheckout(p)}
                >
                  {checkoutPlan === p.sku
                    ? t("billing.checkoutStart")
                    : t("billing.checkout", { price: `$${moneyStr(p.price_usd)}` })}
                </Btn>
              </div>
            ))}
            {checkoutError ? (
              <p className="mt-2 text-[13px] text-[var(--danger,#e5484d)]">{checkoutError}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
