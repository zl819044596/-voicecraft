-- ============================================================================
-- Migration 002 — CORE-FEATURES: rules 可配置规则表
--
-- 说明：migrate.js 以 schema.sql 为唯一 DDL 来源（幂等重放全量），本文件是
-- 002 版本的"变更说明 + 可独立执行的幂等 DDL 片段"，供人工复核 / 独立回放。
-- 与 schema.sql §10b 完全一致；已应用 001 的库升到 002 时，migrate.js 会整体
-- 重放 schema.sql（全部语句幂等），等价于执行本片段。
--
-- 执行：psql $DATABASE_URL -f api/db/migrations/002_rules.sql（可重复执行）
-- ============================================================================

CREATE TABLE IF NOT EXISTS rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('rewrite','split','image','i2v')),
  name       text NOT NULL,
  body       text NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 每 (user_id, kind) 至多一个默认（部分唯一索引）
CREATE UNIQUE INDEX IF NOT EXISTS rules_one_default ON rules (user_id, kind) WHERE is_default;
CREATE INDEX IF NOT EXISTS rules_user_kind_idx ON rules (user_id, kind);

-- updated_at 自动维护（与 schema.sql 触发器一致；重复执行因 DROP IF EXISTS 安全）
DROP TRIGGER IF EXISTS trg_rules_updated_at ON rules;
CREATE TRIGGER trg_rules_updated_at BEFORE UPDATE ON rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
