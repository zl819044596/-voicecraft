// Thin fetch wrapper for backend API calls (P6).
//
// Sends every request with `credentials: include` so the HttpOnly
// `avs_session` cookie set by the backend is forwarded on all calls (the
// Next dev rewrite proxies /api/* to the API server on :4000; same-site
// cookies flow through). Errors are normalized into `ApiRequestError`:
// the backend sends `{error:{code,message,details?}}` (api/_lib sendError)
// and a few legacy endpoints send plain `{error:string}` — both are parsed.
//
// R1: never attach key material here — the wrapper only forwards cookies.

export type ApiErrorBody =
  | { error?: { code?: string; message?: string; details?: unknown } }
  | { error?: string };

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Extract the backend error code/message from any response shape. */
export function parseErrorBody(body: ApiErrorBody): { code: string; message: string } {
  if (body && typeof body.error === "object" && body.error !== null) {
    return {
      code: body.error.code ?? "UNKNOWN_ERROR",
      message: body.error.message ?? "Request failed",
    };
  }
  if (body && typeof body.error === "string") {
    return { code: "UNKNOWN_ERROR", message: body.error };
  }
  return { code: "UNKNOWN_ERROR", message: "Request failed" };
}

export async function apiRaw(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  // 03-接口文档 §1.2 CSRF 约定：Cookie 会话下所有非 GET 请求必须携带该自定义头
  //（防跨站表单提交）。登录回调 / Creem webhook 不经由此 wrapper，天然豁免。
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && !headers.has("X-Requested-With")) {
    headers.set("X-Requested-With", "XMLHttpRequest");
  }
  return fetch(input, {
    ...init,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
  });
}

/**
 * Fetch JSON from the backend. Throws `ApiRequestError` on non-2xx with the
 * backend's `{error:{code,message}}` surfaced.
 */
// Pages consume loosely-typed JSON payloads; `any` keeps call sites terse.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiFetch<T = any>(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<T> {
  const res = await apiRaw(input, init);
  if (!res.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      body = { error: `HTTP ${res.status}` };
    }
    const { code, message } = parseErrorBody(body);
    throw new ApiRequestError(message, code, res.status, body);
  }
  // 204 / empty bodies resolve to null.
  if (res.status === 204) return null as T;
  const text = await res.text();
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiRequestError("Invalid JSON from server", "BAD_RESPONSE", res.status);
  }
}
