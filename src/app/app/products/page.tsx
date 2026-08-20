"use client";

// PIPELINE_TASK_12 — 商品库 (/app/products), restored to the products.html
// 8-column table: Name 商品｜Category 类目｜Price 价格｜Commission 佣金率｜
// Visibility 可见性｜Status 状态｜Gen 生成数｜操作. Bottom row "+ New product" →
// /app/products/new, with the product_url note (可粘贴 product_url 抓取 detail_text).
//
//  • Price uses $ (prototype), not ¥.
//  • Name cell: link → /app/products/:id (detail, has inline detail_text edit),
//    sub-line = detail_text excerpt.
//  • 操作: Generate → /app/quick (accent), Edit → /app/products/:id.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Btn,
  Card,
  CellSub,
  CellTitle,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Td,
  Tr,
  type BadgeVariant,
} from "@/components/app/proto";
import { apiFetch } from "@/lib/api-client";
import { useTranslation } from "@/i18n";

type Product = {
  id: string;
  name: string;
  category: string | null;
  price: string | null;
  commission_rate: string | null;
  product_url: string | null;
  detail_text: string | null;
  visibility: "all" | "private" | "me";
  status: "active" | "inactive";
  gen_count: number;
  created_at: string;
};

const STATUS_BADGE: Record<string, BadgeVariant> = {
  active: "orange",
  inactive: "gray",
};

function fmtPrice(price: string | number | null): string {
  if (price == null) return "—";
  const n = Number(price);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

export default function ProductsPage() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: Product[] }>("/api/products", {
        cache: "no-store",
      });
      setProducts(data.items);
      setLoadError(null);
    } catch {
      setProducts([]);
      setLoadError(t("products.loadError"));
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products ?? []) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh"));
  }, [products]);

  const visible = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!kw) return true;
      return (
        p.name.toLowerCase().includes(kw) ||
        (p.category ?? "").toLowerCase().includes(kw) ||
        (p.detail_text ?? "").toLowerCase().includes(kw)
      );
    });
  }, [products, search, category]);

  return (
    <div className="mx-auto w-full">
      <PageHeader
        title={t("products.pageTitle")}
        actions={
          <Btn variant="primary" href="/app/products/new">
            {t("products.newProduct")}
          </Btn>
        }
      />

      {loadError ? (
        <div className="mb-4 rounded-lg border border-error/30 bg-error-bg px-4 py-3 text-sm text-error">
          {loadError}
        </div>
      ) : null}

      {/* ── 筛选行 ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {t("products.countBefore")}{" "}
          <b className="text-text-primary">{products?.length ?? 0}</b>{" "}
          {t("products.countAfter")}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("products.searchPlaceholder")}
            className="w-56"
          />
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-36"
          >
            <option value="all">{t("products.allCategories")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {products === null ? (
        <Card>
          <div className="py-10 text-center text-sm text-text-secondary">
            {t("common.loading")}
          </div>
        </Card>
      ) : (
        <Card>
          {visible.length === 0 ? (
            <EmptyState
              symbol="▤"
              title={t("products.noProducts")}
              action={
                <Btn variant="primary" href="/app/products/new">
                  {t("products.newProduct")}
                </Btn>
              }
            />
          ) : (
            <DataTable
              columns={[
                t("products.colName"),
                t("products.colCategory"),
                t("products.colPrice"),
                t("products.colCommission"),
                t("products.colVisibility"),
                t("products.colStatus"),
                t("products.colGenCount"),
                t("products.colActions"),
              ]}
            >
              {visible.map((p) => {
                const badge = STATUS_BADGE[p.status] ?? "gray";
                const statusLabel =
                  p.status === "active"
                    ? t("products.statusActive")
                    : p.status === "inactive"
                      ? t("products.statusInactive")
                      : p.status;
                const sub = p.detail_text ? truncate(p.detail_text, 60) : "—";
                return (
                  <Tr key={p.id}>
                    <Td className="max-w-[240px]">
                      <CellTitle>
                        <Link
                          href={`/app/products/${p.id}`}
                          className="block truncate text-text-primary hover:text-brand"
                        >
                          {p.name}
                        </Link>
                      </CellTitle>
                      <CellSub>{sub}</CellSub>
                    </Td>
                    <Td className="whitespace-nowrap text-text-secondary">{p.category ?? "—"}</Td>
                    <Td className="whitespace-nowrap text-text-secondary">{fmtPrice(p.price)}</Td>
                    <Td className="whitespace-nowrap text-success">
                      {p.commission_rate == null ? "—" : `${p.commission_rate}%`}
                    </Td>
                    <Td className="whitespace-nowrap text-text-secondary">{p.visibility}</Td>
                    <Td>
                      <Badge variant={badge} dot>
                        {statusLabel}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-text-secondary">{p.gen_count ?? 0}</Td>
                    <Td>
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <Link
                          href="/app/quick"
                          className="text-[12px] font-semibold text-brand hover:brightness-110"
                        >
                          {t("products.actionGenerate")}
                        </Link>
                        <Link
                          href={`/app/products/${p.id}`}
                          className="text-[12px] font-semibold text-text-secondary hover:text-brand"
                        >
                          {t("products.actionEdit")}
                        </Link>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </DataTable>
          )}

          {/* ── "+ New product" 行 + product_url note ── */}
          <div className="border-t border-border pt-2">
            <Link
              href="/app/products/new"
              className="block rounded-md px-3 py-2 text-[12.5px] font-semibold text-brand hover:bg-bg-subtle"
            >
              {t("products.newProduct")}
            </Link>
            <span className="ml-1 text-[11px] text-text-tertiary">› {t("products.productUrlNote")}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
