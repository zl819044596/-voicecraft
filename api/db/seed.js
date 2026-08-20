#!/usr/bin/env node
/**
 * seed.js — 幂等执行 seed.sql（参照数据）。
 * 用法：node db/seed.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, 'seed.sql');
const { Client } = pg;

function buildConfig() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL };
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'ai_video_studio',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || undefined,
  };
}

const client = new Client(buildConfig());

try {
  await client.connect();
  const sql = fs.readFileSync(SEED_FILE, 'utf8');
  await client.query(sql);
  console.log(`[seed] applied ${SEED_FILE}`);
} catch (err) {
  console.error(`[seed] FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
