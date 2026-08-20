import { NextResponse } from "next/server";
import {
  type QuotaOp,
  type ToolSession,
  googleConfigured,
  readSession,
  remainingQuota,
  freeDailyLimit,
  tryConsume,
  writeSession,
} from "@/lib/tool-session";

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** AI 工具路由：需登录 + 扣免费额度 */
export async function requireToolUser(
  op: QuotaOp,
): Promise<
  | { ok: true; session: ToolSession; respond: (data: unknown, init?: ResponseInit) => Promise<NextResponse> }
  | { ok: false; response: NextResponse }
> {
  if (!googleConfigured() && process.env.NODE_ENV === "production") {
    // 生产未配 Google 时仍要求会话；本地可放宽见下方
  }

  const session = await readSession();
  if (!session) {
    return {
      ok: false,
      response: jsonError(401, "UNAUTHORIZED", "请先登录后再使用工具"),
    };
  }

  const consumed = tryConsume(session, op);
  if (!consumed.ok) {
    return {
      ok: false,
      response: jsonError(
        402,
        "QUOTA_EXCEEDED",
        `今日免费额度不足（剩余 ${consumed.remaining}，需要 ${consumed.cost}）。明日重置或后续开通付费。`,
      ),
    };
  }

  await writeSession(consumed.session);

  return {
    ok: true,
    session: consumed.session,
    respond: async (data, init) => {
      const res = NextResponse.json(data, init);
      // 把最新额度塞进头，方便前端刷新（可选）
      res.headers.set("X-Quota-Remaining", String(remainingQuota(consumed.session)));
      res.headers.set("X-Quota-Limit", String(freeDailyLimit()));
      return res;
    },
  };
}
