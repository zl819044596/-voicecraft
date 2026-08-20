/**
 * API 入口（精简版 — AI 工具站 v2）。
 * 保留 auth / billing / account；去掉 S1-S9 pipeline。
 */

import express from 'express';
import { config } from './config.js';
import { pool, pingDb } from './db.js';
import { redis, pingRedis } from './redis.js';
import { minio, ensureBucket, pingMinio } from './minio.js';

import { optionalAuth } from './session.js';
import { globalRateLimit } from './middleware/ratelimit.js';
import { idempotency } from './middleware/idempotency.js';
import { csrfGuard } from './middleware/csrf.js';
import { notFound, errorMiddleware } from './middleware/errors.js';

import { router as authRouter } from './routes/auth.js';
import { router as billingRouter, webhooksRouter } from './routes/billing.js';
import { router as creditsRouter } from './routes/credits.js';
import { router as accountRouter } from './routes/account.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(optionalAuth);
app.use(globalRateLimit);
app.use(idempotency);
app.use(csrfGuard);

app.use('/api/webhooks', webhooksRouter);
app.use(express.json({ limit: '20mb' }));

app.use('/auth', authRouter);
app.use('/api/auth', authRouter);
app.use('/api/billing', billingRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/account', accountRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-tool-station-api',
    env: config.env,
    time: new Date().toISOString(),
  });
});

app.get('/api/health/full', async (_req, res) => {
  const [db, rds, mio] = await Promise.all([pingDb(), pingRedis(), pingMinio()]);
  res.status(db && rds && mio ? 200 : 503).json({ ok: db && rds && mio, db, redis: rds, minio: mio });
});

app.use(notFound);
app.use(errorMiddleware);

ensureBucket().catch((err) =>
  console.warn('[minio] ensureBucket failed:', err instanceof Error ? err.message : String(err)),
);

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[api] listening on :${config.port} (env=${config.env})`);
});

function shutdown(signal: string): void {
  console.log(`[api] ${signal} — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
