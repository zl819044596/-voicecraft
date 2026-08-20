import { NextResponse } from "next/server";
import { jsonError, requireToolUser } from "@/lib/require-tool-auth";
import { remainingQuota, freeDailyLimit } from "@/lib/tool-session";

export const maxDuration = 300;

const COMPOSE_URL = process.env.COMPOSE_SERVICE_URL || "http://localhost:4002";

function composeHeaders(): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.COMPOSE_SERVICE_SECRET;
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return headers;
}

function humanComposeError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("econnrefused") || s.includes("fetch failed") || s.includes("aborted")) {
    return "合成服务未启动或连不上。请先运行 docker compose -f docker-compose.dev.yml up -d compose";
  }
  if (s.includes("unauthorized") || s.includes("401")) {
    return "合成服务鉴权失败，请检查 COMPOSE_SERVICE_SECRET 是否与 Next 一致";
  }
  return raw.slice(0, 280) || "合成失败";
}

export async function POST(req: Request) {
  const gate = await requireToolUser("compose");
  if (!gate.ok) return gate.response;

  try {
    const body = await req.json();
    const res = await fetch(`${COMPOSE_URL}/compose`, {
      method: "POST",
      headers: composeHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      let msg = err;
      try {
        const j = JSON.parse(err) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* keep text */
      }
      return jsonError(502, "COMPOSE_FAILED", humanComposeError(msg || `HTTP ${res.status}`));
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      // 兼容旧 JSON 返回
      return gate.respond(await res.json());
    }

    const buf = await res.arrayBuffer();
    const out = new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="avs-output.mp4"',
        "X-Quota-Remaining": String(remainingQuota(gate.session)),
        "X-Quota-Limit": String(freeDailyLimit()),
      },
    });
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return jsonError(500, "INTERNAL", humanComposeError(msg));
  }
}

export async function GET() {
  try {
    const res = await fetch(`${COMPOSE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json().catch(() => ({}));
    return Response.json({ ok: res.ok, compose: data });
  } catch {
    return Response.json({ ok: false, compose: null });
  }
}
