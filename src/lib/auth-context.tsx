"use client";

// Real-auth session context (P6).
//
// SessionProvider hydrates the authenticated user from the HttpOnly
// `avs_session` cookie by calling GET /api/auth/me on mount. No credentials
// ever live in localStorage (R1) — the backend cookie is the single source of
// truth and the proxy guard (/app/*) additionally bounces anonymous visitors.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { apiFetch, ApiRequestError } from "./api-client";

export type MeUser = {
  id: string;
  email: string;
  nickname?: string | null;
  tier?: string | null;
  locale?: string | null;
  age_confirmed?: boolean;
  status?: string;
  created_at?: string;
};

export type MeCredits = {
  credits: number;
  trial_credits: number;
  trial_granted: boolean;
  equivalents?: { static_count?: number; i2v_count?: number };
};

export type MeSubscription = {
  plan: string;
  status: string;
  current_period_end?: string | null;
} | null;

export type MeFreeQuota = {
  used: number;
  limit: number;
  remaining: number;
  day: string;
};

export type MeResponse = {
  user: MeUser;
  credits: MeCredits;
  subscription: MeSubscription;
  free_quota?: MeFreeQuota;
};

type AuthStatus = "loading" | "authed" | "anon";

type AuthContextValue = {
  status: AuthStatus;
  user: MeUser | null;
  credits: MeCredits | null;
  freeQuota: MeFreeQuota | null;
  subscription: MeSubscription;
  isLoggedIn: boolean;
  /** Re-fetch /api/auth/me (e.g. after billing or settings changes). */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<MeResponse>("/api/auth/me");
      setMe(data);
      setStatus("authed");
    } catch (err) {
      const isAuth = err instanceof ApiRequestError && err.status === 401;
      // Network failure (backend down) → keep previous state; a 401 means
      // genuinely signed out.
      if (isAuth) {
        setMe(null);
        setStatus("anon");
      } else if (status !== "authed") {
        setMe(null);
        setStatus("anon");
      }
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Best-effort — logout is idempotent server-side.
    }
    setMe(null);
    setStatus("anon");
    window.location.href = "/login";
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<MeResponse>("/api/auth/me");
      setMe(data);
      setStatus("authed");
    } catch {
      // Keep current state on failure.
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: me?.user ?? null,
      credits: me?.credits ?? null,
      freeQuota: me?.free_quota ?? null,
      subscription: me?.subscription ?? null,
      isLoggedIn: status === "authed" && Boolean(me),
      refresh,
      logout,
    }),
    [status, me, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within a SessionProvider");
  return ctx;
}
