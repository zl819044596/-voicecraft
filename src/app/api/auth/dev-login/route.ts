import { NextResponse } from "next/server";

/** 上线接 Google 前：此路由仅作占位 */
export async function POST() {
  if ((process.env.AUTH_MODE || "fake").toLowerCase() !== "google") {
    return NextResponse.json(
      {
        error: {
          code: "OAUTH_NOT_CONFIGURED",
          message: "当前为演示登录模式（AUTH_MODE=fake），请用 /login 进入工作台",
        },
      },
      { status: 503 },
    );
  }
  // 真 Google 流程仍在 google/route.ts；此处不应被调用
  return NextResponse.json(
    { error: { code: "BAD_REQUEST", message: "请调用 /api/auth/google" } },
    { status: 400 },
  );
}
