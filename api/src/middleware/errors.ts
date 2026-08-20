/**
 * 统一错误中间件（03-接口文档 §1.4）：
 *   所有非 2xx 响应体 `{ "error": { "code", "message", "details"? } }`。
 *   - ApiError（apiError() 抛出）→ 自带 status/code/details
 *   - ZodError → 400 VALIDATION_ERROR
 *   - body 解析错误（SyntaxError）→ 400 BAD_REQUEST
 *   - 其余 → 500 INTERNAL + errorId（生产不泄露堆栈）
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomToken } from '../utils.js';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
};

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    // 已开始写响应（流式导出等）——无法改状态码，只能终止。
    res.destroy();
    return;
  }

  const e = err as {
    status?: number;
    code?: string;
    message?: string;
    details?: unknown;
    name?: string;
    issues?: unknown[];
  };

  // Zod validation errors surface as 400 VALIDATION_ERROR.
  if (e && e.name === 'ZodError') {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: e.issues ?? undefined,
      },
    });
    return;
  }

  // Body-parse SyntaxError → 400 BAD_REQUEST.
  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON in request body' } });
    return;
  }

  if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500) {
    res.status(e.status).json({
      error: {
        code: e.code ?? 'BAD_REQUEST',
        message: e.message ?? 'Bad request',
        ...(e.details !== undefined ? { details: e.details } : {}),
      },
    });
    return;
  }

  if (typeof e?.status === 'number' && e.status >= 500) {
    res.status(e.status).json({
      error: {
        code: e.code ?? 'INTERNAL',
        message: e.message ?? 'Internal server error',
        ...(e.details !== undefined ? { details: e.details } : {}),
      },
    });
    return;
  }

  // Unknown → 500 INTERNAL with a correlation id.
  const errorId = randomToken(6);
  const summary = `${req.method} ${req.originalUrl} — ${e?.message ?? String(err)}`;
  console.error(`[error] ${errorId} ${summary}`, e);
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : summary,
      details: { errorId },
    },
  });
}
