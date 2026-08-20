import { NextResponse } from "next/server";
import {
  consumeOAuthState,
  googleConfigured,
  mintSession,
  siteUrl,
  writeSession,
} from "@/lib/tool-session";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      code?: string;
      state?: string;
      age_confirmed?: boolean;
    };

    if (body.age_confirmed !== true) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "需要确认已满 18 岁" } },
        { status: 403 },
      );
    }
    if (!googleConfigured()) {
      return NextResponse.json(
        { error: { code: "OAUTH_NOT_CONFIGURED", message: "Google OAuth 未配置" } },
        { status: 500 },
      );
    }

    const code = String(body.code || "");
    const state = String(body.state || "");
    if (!code || !state) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "缺少 code 或 state" } },
        { status: 400 },
      );
    }

    const stateOk = await consumeOAuthState(state);
    if (!stateOk) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "OAuth state 无效或已过期" } },
        { status: 400 },
      );
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${siteUrl()}/login`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text().catch(() => "");
      return NextResponse.json(
        { error: { code: "OAUTH_FAILED", message: `换取 token 失败: ${t.slice(0, 120)}` } },
        { status: 400 },
      );
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      return NextResponse.json(
        { error: { code: "OAUTH_FAILED", message: "缺少 access_token" } },
        { status: 400 },
      );
    }

    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!infoRes.ok) {
      return NextResponse.json(
        { error: { code: "OAUTH_FAILED", message: "读取 Google 用户信息失败" } },
        { status: 400 },
      );
    }
    const info = (await infoRes.json()) as {
      sub?: string;
      email?: string;
      name?: string;
    };
    if (!info.sub || !info.email) {
      return NextResponse.json(
        { error: { code: "OAUTH_FAILED", message: "Google 未返回邮箱" } },
        { status: 400 },
      );
    }

    const session = mintSession({
      sub: info.sub,
      email: info.email,
      name: info.name ?? null,
    });
    await writeSession(session);

    return NextResponse.json({
      ok: true,
      user: { id: session.sub, email: session.email, nickname: session.name },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ error: { code: "INTERNAL", message: msg } }, { status: 500 });
  }
}
