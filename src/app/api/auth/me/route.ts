import { NextResponse } from "next/server";
import {
  freeDailyLimit,
  readSession,
  remainingQuota,
  writeSession,
} from "@/lib/tool-session";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "未登录" } },
      { status: 401 },
    );
  }

  // 跨日额度可能已在 decode 时重置，写回 cookie
  await writeSession(session);

  const remaining = remainingQuota(session);
  const limit = freeDailyLimit();

  return NextResponse.json({
    user: {
      id: session.sub,
      email: session.email,
      nickname: session.name,
      tier: "free",
    },
    credits: {
      credits: remaining,
      trial_credits: limit,
      trial_granted: true,
    },
    subscription: null,
    free_quota: {
      used: session.used,
      limit,
      remaining,
      day: session.day,
    },
  });
}
