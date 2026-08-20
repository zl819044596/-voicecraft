/**
 * Small shared helpers: async route wrappers, pagination, id/uuid, hashing.
 */

import crypto from 'node:crypto';
import { RequestHandler, Request, Response, NextFunction } from 'express';

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Wrap an async handler so rejections reach the central error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export interface PageQuery {
  page: number;
  size: number;
  offset: number;
}

export function pagination(req: Request, maxSize = 50): PageQuery {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(maxSize, Math.max(1, Number(req.query.size) || 20));
  return { page, size, offset: (page - 1) * size };
}

export function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || '127.0.0.1';
}

/** Normalize an email: trim + lowercase. */
export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

/** Clamp a string field (title/name/etc) to a max length. */
export function clamp(s: string, max: number): string {
  return String(s ?? '').slice(0, max);
}

/** Parse an integer from an unknown request value. */
export function toInt(v: unknown, dflt = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}
