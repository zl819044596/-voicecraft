// App-area auth guard — /app 需登录；营销页公开。

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "avs_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth =
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/");

  if (!needsAuth) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app", "/app/:path*", "/settings", "/settings/:path*"],
};
