/**
 * Express request augmentation — `req.user` / `req.userId` / `req.sessionSid`
 * are injected by the auth middleware (requireAuth / optionalAuth).
 */

declare global {
  namespace Express {
    interface Request {
      userId?: string | null;
      sessionSid?: string | null;
      user?: {
        id: string;
        email: string | null;
        nickname: string | null;
        locale: string | null;
        tier: 'free' | 'starter' | 'pro';
        ageConfirmed: boolean;
      } | null;
      /** Idempotency-Key resolved by middleware, if present. */
      idempotencyKey?: string | null;
      /** True when the idempotent endpoint was served from cache. */
      idempotencyReplay?: boolean;
      /** True when this request carries an authenticated session. */
      authed?: boolean;
      /** Client IP as resolved by rate-limit middleware. */
      clientIp?: string;
      /** Raw request body bytes, captured by express.json({ verify }) for webhook HMAC. */
      rawBody?: Buffer;
    }
  }
}

export {};
