/**
 * API 基础层（PIPELINE_TASK_15 阶段① P1）。
 *
 * 统一 fetch 封装：
 *   - base = VITE_API_BASE ?? '/api'（dev 走 vite proxy → nginx，部署同域）
 *   - credentials: 'include'（avs_session HttpOnly cookie 会话）
 *   - 非 GET 自动带 X-Requested-With: XMLHttpRequest（后端 CSRF 守卫要求，见
 *     api/src/middleware/csrf.ts —— 非 GET 无该头直接 403）
 *   - 401 → 默认跳 /login（登录页 / 守卫可传 authRedirect:false 自行处理）
 *   - 业务错误（402/410/409/422…）→ 抛出结构化 ApiError（status/code/message/details）
 *   - 网络错误 → ApiError(NETWORK_ERROR)，友好文案
 */

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** 401 未认证（会话缺失/过期）。 */
  isUnauthorized(): boolean {
    return this.status === 401
  }
}

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** 401 时是否自动跳 /login（默认 true）。登录页 / 登录守卫传 false。 */
  authRedirect?: boolean
}

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, authRedirect = true, headers, ...rest } = options
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  const init: RequestInit = {
    ...rest,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      'X-Requested-With': 'XMLHttpRequest',
      ...headers,
    },
  }
  if (body !== undefined && !isFormData) init.body = JSON.stringify(body)
  else if (body !== undefined) init.body = body as BodyInit

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请检查网络后重试')
  }

  if (res.status === 401 && authRedirect) {
    // 已在 /login 时不重复跳转，避免死循环。
    if (!window.location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.assign(`/login?next=${next}`)
    }
  }

  if (res.ok) {
    if (res.status === 204) return undefined as T
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) return (await res.json()) as T
    return (await res.text()) as unknown as T
  }

  let errBody: ApiErrorBody | null = null
  try {
    errBody = (await res.json()) as ApiErrorBody
  } catch {
    /* 非 JSON 错误体忽略 */
  }
  const code = errBody?.error?.code ?? 'UNKNOWN'
  const message = errBody?.error?.message ?? `请求失败（${res.status}）`
  throw new ApiError(res.status, code, message, errBody?.error?.details)
}

export const get = <T = unknown>(path: string, options?: ApiFetchOptions) =>
  apiFetch<T>(path, { method: 'GET', ...options })

export const post = <T = unknown>(path: string, body?: unknown, options?: ApiFetchOptions) =>
  apiFetch<T>(path, { method: 'POST', body, ...options })

export const put = <T = unknown>(path: string, body?: unknown, options?: ApiFetchOptions) =>
  apiFetch<T>(path, { method: 'PUT', body, ...options })

export const del = <T = unknown>(path: string, options?: ApiFetchOptions) =>
  apiFetch<T>(path, { method: 'DELETE', ...options })
