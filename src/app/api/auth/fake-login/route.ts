import { NextResponse } from "next/server";
import { mintSession, writeSession } from "@/lib/tool-session";

/**
 * 假登录（上线前默认）。
 * - AUTH_MODE=google 时关闭
 * - 生产环境需 ALLOW_FAKE_AUTH=1 才开放（防刷额度）
 * - 固定演示账号，忽略客户端自定义 email
 */
export async function POST(req: Request) {
  const mode = (process.env.AUTH_MODE || "fake").toLowerCase();
  if (mode === "google") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "请使用 Google 登录 / Please use Google sign-in" } },
      { status: 403 },
    );
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_FAKE_AUTH !== "1") {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "演示登录未在生产环境开启 / Demo login disabled in production",
        },
      },
      { status: 403 },
    );
  }

  // 固定演示身份，避免任意 email 刷额度
  void req;
  const email = "demo@aivideostudio.app";
  const name = "Demo User";

  const session = mintSession({
    sub: `fake:${email}`,
    email,
    name,
  });
  await writeSession(session);

  return NextResponse.json({
    ok: true,
    mode: "fake",
    user: { id: session.sub, email: session.email, nickname: session.name },
  });
}
