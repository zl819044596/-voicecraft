// Abuse report route handler.
//
// Thin BFF proxy: the client form posts here, and we forward to the backend
// API. The backend (api/src/routes/report-abuse.ts) is the source of truth —
// it validates `reason` against the fixed code set, enforces idempotency via
// `idempotency_key`, and persists to PostgreSQL. This handler only relays the
// request verbatim (cookie passthrough so optionalAuth can attribute logged-in
// reporters), then mirrors the backend response so status/body stay exact.

import type { NextRequest } from "next/server";

// nginx (production) and the dev rewrite both forward /api/* verbatim, so the
// upstream path keeps the /api prefix: /api/report-abuse → api:/api/report-abuse.
const API_URL = process.env.API_INTERNAL_URL ?? "http://api:4000";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "invalid JSON body" } },
      { status: 400 },
    );
  }

  try {
    const cookie = request.headers.get("cookie");
    const res = await fetch(`${API_URL}/api/report-abuse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 后端 csrfGuard 要求非 GET 带该头（03 §1.2）。
        "X-Requested-With": "XMLHttpRequest",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    // Relay the backend response verbatim (backend returns {id,status,created_at}
    // on 201 and {error:{code,message}} on non-2xx — don't invent an `ok` field).
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch {
    return Response.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "report service unavailable" } },
      { status: 503 },
    );
  }
}
