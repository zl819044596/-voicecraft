import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { QUOTA_COST, type QuotaOp } from "@/lib/quota-costs";

export { QUOTA_COST, type QuotaOp };

export const SESSION_COOKIE = "avs_session";
const OAUTH_STATE_COOKIE = "avs_oauth_state";

export type ToolSession = {
  sub: string;
  email: string;
  name: string | null;
  /** YYYY-MM-DD UTC */
  day: string;
  used: number;
  exp: number;
};

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET 未配置");
  return s;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function freeDailyLimit(): number {
  const n = Number(process.env.FREE_DAILY_QUOTA || 30);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

export function encodeSession(session: ToolSession): string {
  const payloadB64 = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function decodeSession(token: string | undefined | null): ToolSession | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expect = sign(payloadB64);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const raw = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as ToolSession;
    if (!raw.sub || !raw.email || !raw.exp) return null;
    if (raw.exp * 1000 < Date.now()) return null;
    // 跨日重置额度
    if (raw.day !== todayUtc()) {
      return { ...raw, day: todayUtc(), used: 0 };
    }
    return raw;
  } catch {
    return null;
  }
}

export function mintSession(user: {
  sub: string;
  email: string;
  name?: string | null;
}): ToolSession {
  return {
    sub: user.sub,
    email: user.email,
    name: user.name ?? null,
    day: todayUtc(),
    used: 0,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14, // 14 days
  };
}

export async function readSession(): Promise<ToolSession | null> {
  const jar = await cookies();
  return decodeSession(jar.get(SESSION_COOKIE)?.value);
}

export async function writeSession(session: ToolSession): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function setOAuthState(state: string): Promise<void> {
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

export async function consumeOAuthState(expected: string): Promise<boolean> {
  const jar = await cookies();
  const got = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);
  return Boolean(got && got === expected);
}

export function newOAuthState(): string {
  return randomBytes(16).toString("hex");
}

export function remainingQuota(session: ToolSession): number {
  return Math.max(0, freeDailyLimit() - session.used);
}

export function tryConsume(
  session: ToolSession,
  op: QuotaOp,
): { ok: true; session: ToolSession } | { ok: false; remaining: number; cost: number } {
  const cost = QUOTA_COST[op];
  if (cost <= 0) return { ok: true, session };
  const rem = remainingQuota(session);
  if (rem < cost) return { ok: false, remaining: rem, cost };
  return { ok: true, session: { ...session, used: session.used + cost } };
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
