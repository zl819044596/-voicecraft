// App-area auth guard (P6). Next.js 16 renamed middleware → proxy.
//
// Redirects unauthenticated visitors of the workbench (/app, /settings) to
// /login?next=<original path>. Marketing pages (/, /pricing, /tools/*,
// /scenarios/*, legal pages) are never guarded — they stay indexable.
//
// Identity is the HttpOnly `avs_session` cookie set by the backend on login.
// This is an optimistic guard only — the backend remains the source of truth
// (GET /api/auth/me enforces 401 without a valid session).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "avs_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/settings", "/settings/:path*"],
};
