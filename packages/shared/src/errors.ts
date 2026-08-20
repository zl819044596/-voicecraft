/**
 * Unified API error contract (00-CONTRACT §6 / 03-接口文档 §1.4).
 * Every non-2xx response body: `{ "error": { "code": string, "message": string, "details"?: unknown } }`
 */

export type ErrorDetails = Record<string, unknown> | unknown[] | string | undefined;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ErrorDetails;
  };
}

/** Canonical error codes referenced across the docs (03-接口文档 §错误码表). */
export const ERROR = {
  // 4xx
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS', // 402
  EXPORT_EXPIRED: 'EXPORT_EXPIRED', // 410
  RATE_LIMITED: 'RATE_LIMITED', // 429
  STEP_CONFLICT: 'STEP_CONFLICT', // 409 — task in a state that forbids the action
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  // 5xx
  INTERNAL: 'INTERNAL',
  // Service-configuration gaps (degraded paths, no production keys yet)
  OAUTH_NOT_CONFIGURED: 'OAUTH_NOT_CONFIGURED',
  SMTP_NOT_CONFIGURED: 'SMTP_NOT_CONFIGURED',
  BILLING_NOT_CONFIGURED: 'BILLING_NOT_CONFIGURED',
  I2V_NOT_AVAILABLE: 'I2V_NOT_AVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR)[keyof typeof ERROR];

export interface ApiError extends Error {
  status: number;
  code: ErrorCode | string;
  details?: ErrorDetails;
}

/** Throw inside route handlers; caught by the central error middleware. */
export function apiError(
  status: number,
  code: ErrorCode | string,
  message: string,
  details?: ErrorDetails,
): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}
