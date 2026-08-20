#!/usr/bin/env node
/**
 * migrate.js — AI Video Studio v2 数据库迁移脚本（ESM）
 *
 * 职责：连接 PostgreSQL 16，幂等执行 schema.sql（19 张表全量 DDL，唯一 schema 来源）。
 * 部署路径（docker-compose api entrypoint）在启动服务前执行；本地开发 `npm run migrate`。
 *
 * 幂等机制：
 *   * schema_migrations(version, applied_at) 版本表记录已应用版本；
 *   * 已应用则跳过并退出 0；--force 忽略版本记录强制重放；
 *   * 会话级 advisory lock 串行化并发迁移；
 *   * schema.sql 与版本写入在单个事务内执行，DDL 失败整体回滚。
 *
 * 用法：
 *   node db/migrate.js               # 按环境变量连接并迁移
 *   node db/migrate.js --force       # 强制重放 schema.sql
 *   DATABASE_URL=postgres://u:p@h:5432/db node db/migrate.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
// 003 = PIPELINE_TASK_33 prompts 新增 video_style/视频风格（schema.sql §10 inline CHECK 已同步，
// 既有库的 prompts_type_check 命名约束需按 api/db/migrations/003_video_style_prompts.sql 手动
// DROP+ADD；已应用 002 的库升 003 会整体重放 schema.sql（全部语句幂等），等价于只执行该迁移片段）。
// 004 = PIPELINE_TASK_45 prompts.user_id 允许 NULL（平台级全局默认技能）——schema.sql §10 已同步，
// 既有库升级时重放 schema.sql 等价于 migrations/004_global_default_prompts.sql。
const MIGRATION_VERSION = process.env.MIGRATION_VERSION || '004';
const MIGRATION_LOCK_KEY = 726950501;

const { Client } = pg;

function buildConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'ai_video_studio',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || undefined,
  };
}

async function main() {
  const force = process.argv.includes('--force');
  const client = new Client(buildConfig());

  try {
    await client.connect();
    const { rows } = await client.query('SELECT version() AS v');
    console.log(`[migrate] connected: ${rows[0].v.split(' on ')[0]}`);

    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    console.log(`[migrate] acquired advisory lock (${MIGRATION_LOCK_KEY})`);
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version    text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      if (!force) {
        const applied = await client.query(
          'SELECT 1 FROM schema_migrations WHERE version = $1',
          [MIGRATION_VERSION],
        );
        if (applied.rowCount > 0) {
          console.log(
            `[migrate] version ${MIGRATION_VERSION} already applied — nothing to do (use --force to re-apply)`,
          );
          return 0;
        }
      } else {
        console.log(`[migrate] --force: ignoring version record ${MIGRATION_VERSION}`);
      }

      const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
      console.log(`[migrate] applying ${SCHEMA_FILE} (${sql.length} bytes)`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (version) VALUES ($1)
           ON CONFLICT (version) DO UPDATE SET applied_at = now()`,
          [MIGRATION_VERSION],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }

      console.log(`[migrate] done — schema ${MIGRATION_VERSION} applied and recorded`);
      return 0;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
      console.log('[migrate] advisory lock released');
    }
  } catch (err) {
    console.error(`[migrate] FAILED: ${err.message}`);
    if (err.position) {
      const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
      const line = sql.slice(0, err.position).split('\n').length;
      console.error(`[migrate]   at ${path.basename(SCHEMA_FILE)} line ${line} (byte ${err.position})`);
    }
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();
