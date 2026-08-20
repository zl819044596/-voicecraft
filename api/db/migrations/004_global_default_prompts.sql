-- ============================================================================
-- Migration 004 — PIPELINE_TASK_45: prompts 全局默认技能（user_id 允许 NULL）
--
-- 说明：migrate.js 以 schema.sql 为唯一 DDL 来源（幂等重放全量），本文件是
-- 004 版本的"变更说明 + 可独立执行的幂等 DDL 片段"，供人工复核 / 独立回放。
-- 已应用 003 的库升到 004 时，migrate.js 会整体重放 schema.sql（全部语句幂等），
-- 等价于执行本片段。
--
-- 执行：psql $DATABASE_URL -f api/db/migrations/004_global_default_prompts.sql（可重复执行）
-- ============================================================================

-- 平台级全局默认模板：user_id 允许 NULL（不属于任何用户；重复执行 no-op）。
ALTER TABLE prompts ALTER COLUMN user_id DROP NOT NULL;

-- 每 type 至多一条全局默认（is_default=true + user_id IS NULL）。
CREATE UNIQUE INDEX IF NOT EXISTS prompts_global_default ON prompts (type) WHERE is_default AND user_id IS NULL;
