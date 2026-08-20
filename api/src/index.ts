/**
 * API 入口（Express + TS，rebuild-v3）。
 *
 * 挂载约定（03-接口文档 §1 / 02 架构）：
 *   - /api/bgm       必须先于 express.json 挂载（POST 读取原始字节流）
 *   - /auth 与 /api/auth 双挂载同一 router（nginx 剥离 /api 前缀 + 直连两场景）
 *   - 其余业务路由统一 /api/<resource>
 *
 * 启动：
 *   - /health、/health/full 依赖自检（pg / redis / minio）
 *   - 流水线三循环（step / delayed / render-result）随进程启动，内部 try/catch 自愈
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
import { router as credentialsRouter } from './routes/credentials.js';
import { router as modelConfigsRouter } from './routes/model-configs.js';
import { router as tasksRouter } from './routes/tasks.js';
import { router as projectsRouter } from './routes/projects.js';
import { router as productsRouter } from './routes/products.js';
import { router as benchmarksRouter } from './routes/benchmarks.js';
import { router as promptsRouter } from './routes/prompts.js';
import { router as quickRouter } from './routes/quick.js';
import { router as rulesRouter } from './routes/rules.js';
import { router as assetsRouter } from './routes/assets.js';
import { router as bgmRouter } from './routes/bgm.js';
import { router as reportAbuseRouter } from './routes/report-abuse.js';
import { router as billingRouter, webhooksRouter } from './routes/billing.js';
import { router as creditsRouter } from './routes/credits.js';
import { router as exportRouter } from './routes/export.js';
import { router as accountRouter } from './routes/account.js';

import { startStepLoop, startDelayedLoop, startRenderResultLoop } from './pipeline/index.js';
import { ensureGlobalPrompts } from './pipeline/seed-global-prompts.js';
import type { PipelineCtx } from './pipeline/types.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// 认证态注入 + 全局限流 + 幂等 + CSRF 守卫 —— 均不消费请求体，
// 因此对 /api/bgm 的原始字节流无影响。
app.use(optionalAuth);
app.use(globalRateLimit);
app.use(idempotency);
// CSRF 守卫（03 §1.2）：非 GET 需 X-Requested-With: XMLHttpRequest。
// Creem webhook（HMAC 验签）与 OAuth 登录回调（state 校验）在守卫内按路径豁免。
app.use(csrfGuard);

// BGM 上传读取原始字节流 —— 必须在 express.json 之前挂载。
app.use('/api/bgm', bgmRouter);

// Creem webhook 验签需要原始 body —— 同样必须在 express.json 之前挂载
// （路由内部用 express.json({ verify }) 同时拿到解析结果与原始字节）。
app.use('/api/webhooks', webhooksRouter);

app.use(express.json({ limit: '20mb' }));

// Auth：nginx 剥离 /api 前缀时映射 /auth；直连时 /api/auth。
app.use('/auth', authRouter);
app.use('/api/auth', authRouter);

app.use('/api/credentials', credentialsRouter);
app.use('/api/model-configs', modelConfigsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/products', productsRouter);
app.use('/api/benchmarks', benchmarksRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/quick', quickRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/report-abuse', reportAbuseRouter);
app.use('/api/billing', billingRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/export', exportRouter);
app.use('/api/account', accountRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-video-studio-api',
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

// ---------------------------------------------------------------------------
// 流水线消费循环（常驻；内部 try/catch 自愈，Redis 抖动不终止进程）
// ---------------------------------------------------------------------------
const ctx: PipelineCtx = { pg: pool, redis, minio };
startStepLoop(ctx).catch((err) => console.error('[pipeline] step loop exited:', err));
startDelayedLoop(ctx).catch((err) => console.error('[pipeline] delayed loop exited:', err));
startRenderResultLoop(ctx).catch((err) => console.error('[pipeline] render-result loop exited:', err));

// 启动时孤儿任务检测：api 重建会杀掉内存中的执行进程 → 把 running 且非暂停、
// 且 30 分钟无更新的任务标记 failed（避免僵尸 running 卡死用户界面）。
pool
  .query(
    `UPDATE tasks
        SET status = 'failed',
            config = jsonb_set(COALESCE(config, '{}'), '{error}', '"orphaned: api restarted while task was running"'::jsonb),
            updated_at = now()
      WHERE status = 'running'
        AND NOT (config->>'paused' = 'true')
        AND updated_at < now() - interval '30 minutes'`,
  )
  .then((r) => {
    if (r.rowCount && r.rowCount > 0) console.warn(`[pipeline] orphan sweep: ${r.rowCount} task(s) marked failed`);
  })
  .catch((err) => console.warn('[pipeline] orphan sweep failed:', err instanceof Error ? err.message : String(err)));

// 启动前确保 bucket 存在（幂等；失败不阻断，后续请求按需重试）。
ensureBucket().catch((err) =>
  console.warn('[minio] ensureBucket failed:', err instanceof Error ? err.message : String(err)),
);

// PIPELINE_TASK_45：启动时 seed 8 条全局默认技能（幂等；失败不阻断启动，下次启动重试）。
pool
  .query('SELECT 1')
  .then(() => ensureGlobalPrompts(pool))
  .catch((err) =>
    console.warn('[seed] ensureGlobalPrompts failed:', err instanceof Error ? err.message : String(err)),
  );

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(
    `[api] listening on :${config.port} (env=${config.env}, mockProviders=${config.mockProviders})`,
  );
});

function shutdown(signal: string): void {
  console.log(`[api] ${signal} — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
