import { NextResponse } from "next/server";

/** 假登录阶段：邮箱魔法链接关闭 */
export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "NOT_IMPLEMENTED",
        message: "请使用演示登录；邮箱 / Google 登录上线后开放",
      },
    },
    { status: 501 },
  );
}
