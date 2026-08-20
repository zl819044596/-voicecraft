-- ============================================================================
-- Migration 003 — PIPELINE_TASK_33: prompts 表新增「视频风格」类型（video_style）
--
-- 说明：migrate.js 以 schema.sql 为唯一 DDL 来源（幂等重放全量），本文件是
-- 003 版本的"变更说明 + 可独立执行的幂等 DDL 片段"，供人工复核 / 独立回放。
-- 与 schema.sql §10（prompts 表 inline CHECK）一致；已应用 002 的库升到 003 时，
-- migrate.js 会整体重放 schema.sql，但既有表的 named 约束 prompts_type_check
-- 不会随 CREATE TABLE IF NOT EXISTS 变更，需单独执行下方 DROP + ADD。
--
-- 执行：psql $DATABASE_URL -f api/db/migrations/003_video_style_prompts.sql（可重复执行）
-- ============================================================================

-- 生产库上 prompts_type_check 为命名约束（此前 DROP+ADD 生成），先删后加。
ALTER TABLE prompts DROP CONSTRAINT IF EXISTS prompts_type_check;
ALTER TABLE prompts ADD CONSTRAINT prompts_type_check CHECK (type = ANY (ARRAY[
  'product_parse','benchmark_analysis','script','title','style','storyboard','compliance','video_style',
  '商品解析','对标分析','文案模板','标题生成','画面风格','分镜拆解','合规规则','视频风格'
]));
