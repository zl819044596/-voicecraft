"use client";

// PIPELINE_TASK_12 — 对标库 (/app/benchmarks), restored to the benchmarks.html
// 7-column table: Account 账号｜Title 视频标题｜Video URL｜关联商品 Product｜
// Duration 时长｜Visibility 可见性｜操作. Bottom row "+ New benchmark" →
// /app/benchmarks/new, with the team-pool note (visibility=public 进入团队共享池).
//
//  • Video URL cell: mono, shortened host+path.
//  • 关联商品: product name resolved from GET /api/products (product_id → name),
//    falling back to "—".
//  • 操作: Edit → /app/benchmarks/new?edit=:id (same route as the old card).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useTranslation } from "@/i18n";
import {
  Btn,
  Card,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  Td,
  Tr,
} from "@/components/app/proto";

type Benchmark = {
  id: string;
  account: string;
  title: string;
  video_url: string | null;
  product_id: string | null;
  duration: number | null;
  visibility: "all" | "private" | "me";
  created_at: string;
};

type ProductRow = {
  id: string;
  name: string;
};

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function shortUrl(url: string | null): string {
  if (!url) return "—";
  const clean = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return clean.length > 32 ? `${clean.slice(0, 32)}…` : clean;
}

export default function BenchmarksPage() {
  const { t } = useTranslation();
  const [benchmarks, setBenchmarks] = useState<Benchmark[] | null>(null);
  const [products, setProducts] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      apiFetch<{ items: Benchmark[] }>("/api/benchmarks", { cache: "no-store" }),
      apiFetch<{ items: ProductRow[] }>("/api/products", { cache: "no-store" }),
    ]).then(([benchRes, prodRes]) => {
      if (cancelled) return;
      if (benchRes.status === "fulfilled" && Array.isArray(benchRes.value.items)) {
        setBenchmarks(benchRes.value.items);
        setLoadError(null);
      } else {
        setBenchmarks([]);
        setLoadError(t("benchmarks.loadError"));
      }
      if (prodRes.status === "fulfilled" && Array.isArray(prodRes.value.items)) {
        const map: Record<string, string> = {};
        for (const p of prodRes.value.items) map[p.id] = p.name;
        setProducts(map);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const visible = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return benchmarks ?? [];
    return (benchmarks ?? []).filter(
      (b) => b.title.toLowerCase().includes(kw) || b.account.toLowerCase().includes(kw),
    );
  }, [benchmarks, search]);

  return (
    <div className="mx-auto w-full">
      <PageHeader
        title={t("benchmarks.pageTitle")}
        actions={
          <Btn variant="primary" href="/app/benchmarks/new">
            {t("benchmarks.newBenchmark")}
          </Btn>
        }
      />

      {loadError ? (
        <div className="mb-4 rounded-lg border border-error/30 bg-error-bg px-4 py-3 text-sm text-error">
          {loadError}
        </div>
      ) : null}

      {/* ── 搜索行 ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {t("benchmarks.countBefore")}{" "}
          <b className="text-text-primary">{benchmarks?.length ?? 0}</b>{" "}
          {t("benchmarks.countAfter")}
        </p>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("benchmarks.searchPlaceholder")}
          className="w-56"
        />
      </div>

      {benchmarks === null ? (
        <Card>
          <div className="py-10 text-center text-sm text-text-secondary">
            {t("common.loading")}
          </div>
        </Card>
      ) : (
        <Card>
          {visible.length === 0 ? (
            <EmptyState
              symbol="◎"
              title={t("benchmarks.noBenchmarks")}
              action={
                <Btn variant="primary" href="/app/benchmarks/new">
                  {t("benchmarks.newBenchmark")}
                </Btn>
              }
            />
          ) : (
            <DataTable
              columns={[
                t("benchmarks.colAccount"),
                t("benchmarks.colTitle"),
                t("benchmarks.colVideoUrl"),
                t("benchmarks.colProduct"),
                t("benchmarks.colDuration"),
                t("benchmarks.colVisibility"),
                t("benchmarks.colActions"),
              ]}
            >
              {visible.map((b) => (
                <Tr key={b.id}>
                  <Td className="whitespace-nowrap text-text-secondary">{b.account}</Td>
                  <Td className="max-w-[260px]">
                    <Link
                      href={`/app/benchmarks/new?edit=${b.id}`}
                      className="block truncate text-text-primary hover:text-brand"
                    >
                      {b.title}
                    </Link>
                  </Td>
                  <Td className="max-w-[220px] truncate font-mono text-[11.5px] text-text-secondary">
                    {shortUrl(b.video_url)}
                  </Td>
                  <Td className="whitespace-nowrap text-text-secondary">
                    {b.product_id ? (products[b.product_id] ?? "—") : "—"}
                  </Td>
                  <Td className="whitespace-nowrap text-text-secondary">
                    {fmtDuration(b.duration)}
                  </Td>
                  <Td className="whitespace-nowrap text-text-secondary">{b.visibility}</Td>
                  <Td>
                    <Link
                      href={`/app/benchmarks/new?edit=${b.id}`}
                      className="whitespace-nowrap text-[12px] font-semibold text-brand hover:brightness-110"
                    >
                      {t("common.edit")}
                    </Link>
                  </Td>
                </Tr>
              ))}
            </DataTable>
          )}

          {/* ── "+ New benchmark" 行 + 团队池 note ── */}
          <div className="border-t border-border pt-2">
            <Link
              href="/app/benchmarks/new"
              className="block rounded-md px-3 py-2 text-[12.5px] font-semibold text-brand hover:bg-bg-subtle"
            >
              {t("benchmarks.newBenchmark")}
            </Link>
            <span className="ml-1 text-[11px] text-text-tertiary">› {t("benchmarks.teamPoolNote")}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
