-- ============================================================================
-- AI Video Studio v2 — PostgreSQL 16 schema（19 张表）
--
-- 唯一事实来源：
--   * docs/00-CONTRACT.md  §5 数据模型 / §4 商业规则
--   * docs/04-数据库文档.md §2 逐表定义（DDL 细节以此为准，00-CONTRACT 冲突时
--     以 00-CONTRACT 为准）
--
-- 全局约定（04-数据库文档 §1.2）：
--   * 主键   ：全部 uuid PRIMARY KEY DEFAULT gen_random_uuid()（pgcrypto）
--   * 时间   ：全部 timestamptz；业务表统一 created_at + updated_at
--             （由触发器 set_updated_at() 维护）；
--             追加型流水表（credit_ledger / api_cost_log / report_abuse）
--             只有 created_at
--   * 金额   ：一律 numeric（禁止 float/double）
--   * 积分   ：统一 integer（1 积分 = $0.01 锚定，仅计价）
--   * 枚举   ：text + CHECK（不用 PG ENUM，便于在线扩值）
--   * JSON   ：一律 jsonb
--   * 软删除 ：不使用；GDPR 删除为物理删除（users.status='deleted' 仅中间态）
--
-- 幂等性：本文件全部语句可重复执行（CREATE ... IF NOT EXISTS /
-- CREATE OR REPLACE / DROP TRIGGER IF EXISTS + CREATE TRIGGER），
-- 可被 migrate.js 在单事务内执行，也可直接 psql -f 重复执行。
-- ============================================================================

-- gen_random_uuid() 依赖（PG13+ 已内置，此处按文档声明，幂等）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 通用触发器函数
-- ----------------------------------------------------------------------------

-- 业务表 updated_at 自动维护（04-数据库文档 §1.2）
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 追加型流水表禁 UPDATE / DELETE（credit_ledger / api_cost_log）
-- report_abuse 为例外：运营表允许 status 流转更新
CREATE OR REPLACE FUNCTION block_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- 追加型流水表禁应用层 UPDATE/DELETE。但 FK 级联清理是系统行为，必须放行：
  --   - credit_ledger.task_id ON DELETE SET NULL → 仅 task_id 非 NULL→NULL 的 UPDATE
  --     （其余列逐字节不变，GDPR 注销随 projects→tasks 级联时触发）
  --   - api_cost_log.task_id  ON DELETE CASCADE → 随 tasks 删除的 DELETE
  --     （应用层本就无 DELETE api_cost_log 语句）
  IF TG_OP = 'UPDATE'
     AND NEW.task_id IS NULL AND OLD.task_id IS NOT NULL
     AND to_jsonb(NEW) - 'task_id' = to_jsonb(OLD) - 'task_id'
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'api_cost_log' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'append-only table %.% does not allow %', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;

-- ============================================================================
-- 1. users — 平台用户主体（C1 双通道认证 / C13 locale / R5 年龄门槛 / C2 tier）
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  google_sub    text,
  nickname      text,
  locale        text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','zh')),
  age_confirmed boolean NOT NULL DEFAULT false,
  tier          text NOT NULL DEFAULT 'free'
                CHECK (tier IN ('free','starter','pro')),
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','disabled','deleted')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key      UNIQUE (email),
  CONSTRAINT users_google_sub_key UNIQUE (google_sub),
  -- 文档约束原文；email NOT NULL 下恒真，保留以对齐 04-数据库文档 §2.1 约束清单
  CONSTRAINT users_identity_check CHECK (google_sub IS NOT NULL OR email IS NOT NULL)
);
COMMENT ON TABLE users IS '平台用户主体：Google OAuth + 邮箱魔法链接双通道（C1）；全表 user_id 真实隔离';
COMMENT ON COLUMN users.email IS '登录邮箱，唯一（存储前应用层 lower() 归一）';
COMMENT ON COLUMN users.google_sub IS 'Google sub claim，OAuth 用户必填，魔法链接用户为 NULL';
COMMENT ON COLUMN users.locale IS '界面语言（C13）：en（默认）/ zh；独立于内容语言 content_language';
COMMENT ON COLUMN users.age_confirmed IS '18+ 年龄门槛确认（R5）';
COMMENT ON COLUMN users.tier IS 'free（BYOK/体验）/ starter / pro，由订阅 webhook 驱动';
COMMENT ON COLUMN users.status IS 'active / disabled / deleted（GDPR 删除流程中间态，最终物理删除）';

-- ============================================================================
-- 2. credentials — 统一 Key 存储（C4：v1 api_keys 与 model_configs 自持 Key 合并）
--    任何读取接口只返回 key_masked，永不出明文（R1）
-- ============================================================================
CREATE TABLE IF NOT EXISTS credentials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_scope    text NOT NULL DEFAULT 'user' CHECK (owner_scope IN ('user','platform')),
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE,
  provider       text NOT NULL,
  label          text NOT NULL,
  key_ciphertext text NOT NULL,
  key_salt       text NOT NULL,
  key_masked     text NOT NULL,
  base_url       text,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','revoked')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credentials_owner_check CHECK (owner_scope = 'platform' OR user_id IS NOT NULL)
);
-- 同一 user 同 provider+label 唯一；PG15+ NULLS NOT DISTINCT 使 platform 行（user_id=NULL）也受约束
CREATE UNIQUE INDEX IF NOT EXISTS credentials_user_provider_label_key
  ON credentials (user_id, provider, label) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS credentials_user_idx
  ON credentials (user_id) WHERE owner_scope = 'user';
COMMENT ON TABLE credentials IS '统一 Key 存储（C4）：BYOK 用户 Key（scope=user）与平台托管 Key 池（scope=platform）';
COMMENT ON COLUMN credentials.owner_scope IS 'user（BYOK）/ platform（平台 Key 池，user_id 为 NULL）';
COMMENT ON COLUMN credentials.key_ciphertext IS 'AES-256-GCM 密文，base64，布局 base64(iv ‖ auth_tag ‖ ciphertext)；唯一可用于解密调用的列';
COMMENT ON COLUMN credentials.key_salt IS 'scrypt 盐，base64，每条 credential 独立随机 16 字节；KEK=scrypt(MASTER_KEY, salt)';
COMMENT ON COLUMN credentials.key_masked IS '脱敏回显（sk-…cdef，前 3 + 后 4），GET 只允许 SELECT 此列';
COMMENT ON COLUMN credentials.base_url IS '自定义 OpenAI 兼容端点，空则用 provider 默认';

-- ============================================================================
-- 3. model_configs — 模型配置中心（C4：以 credential_id 引用 credentials，不再自持 Key）
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_configs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_class text NOT NULL CHECK (provider_class IN ('llm','image','tts','i2v')),
  name           text NOT NULL,
  credential_id  uuid REFERENCES credentials(id) ON DELETE SET NULL,
  base_url       text,
  model          text NOT NULL,
  voice          text,
  enabled        boolean NOT NULL DEFAULT true,
  is_default     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- 每 (user_id, provider_class) 至多一个 is_default
CREATE UNIQUE INDEX IF NOT EXISTS model_configs_one_default
  ON model_configs (user_id, provider_class) WHERE is_default;
CREATE INDEX IF NOT EXISTS model_configs_user_class_idx
  ON model_configs (user_id, provider_class);
COMMENT ON TABLE model_configs IS '用户四类通道（llm/image/tts/i2v）的模型条目，通过 credential_id 引用 credentials；base_url 为条目级覆盖';
COMMENT ON COLUMN model_configs.credential_id IS 'FK→credentials（scope=user）；托管档任务忽略用户配置走平台池';
COMMENT ON COLUMN model_configs.voice IS 'TTS 音色（仅 provider_class=''tts''）';
COMMENT ON COLUMN model_configs.is_default IS '每 (user_id, provider_class) 至多一个默认（部分唯一索引）';

-- ============================================================================
-- 4. platform_key_pool — 平台 Key 池运行态（C2；Key 材料不出 credentials 表）
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_key_pool (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id  uuid NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  provider_class text NOT NULL CHECK (provider_class IN ('llm','image','tts','i2v')),
  rpm_limit      integer NOT NULL DEFAULT 60,
  current_rpm    integer NOT NULL DEFAULT 0,
  circuit_status text NOT NULL DEFAULT 'closed'
                  CHECK (circuit_status IN ('closed','open','half_open')),
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_key_pool_credential_key UNIQUE (credential_id),
  CONSTRAINT pkp_rpm_check CHECK (rpm_limit > 0 AND current_rpm >= 0)
);
CREATE INDEX IF NOT EXISTS pkp_class_idx ON platform_key_pool (provider_class, circuit_status);
COMMENT ON TABLE platform_key_pool IS '托管档平台 Key 池运行态：RPM 限流计数 + 熔断器；实时计数在 Redis avs:rpm:*，本表为持久快照';
COMMENT ON COLUMN platform_key_pool.credential_id IS 'FK→credentials，应用层校验必须 owner_scope=platform';
COMMENT ON COLUMN platform_key_pool.circuit_status IS '熔断器：closed（正常）/ open（熔断中）/ half_open（试探恢复）；open 时切换同 class 备用 Key';
COMMENT ON COLUMN platform_key_pool.last_error IS '最近一次 provider 错误摘要（不落 Key、不落用户内容）';

-- ============================================================================
-- 5. projects — 项目容器（一次创作的容器，一个项目下可有多次流水线运行）
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('text','url','topic','product')),
  prompt      text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects (user_id, created_at DESC);
COMMENT ON TABLE projects IS '项目容器：文案来源（text/url/topic/product）+ 项目级状态；一个项目下可有多次 tasks 运行';
COMMENT ON COLUMN projects.source_type IS 'text（直接粘贴）/ url / topic（AI 创作）/ product（商品库选品）';
COMMENT ON COLUMN projects.prompt IS '原始输入（文案 / URL / 主题描述 / 商品引用快照）';

-- ============================================================================
-- 6. tasks — 流水线运行（L1-L10 状态机 + run_mode + config 快照 + 积分冻结/结算）
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mode            text NOT NULL CHECK (mode IN ('static','i2v')),
  track           text NOT NULL CHECK (track IN ('byok','managed')),
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','done','failed','cancelled')),
  current_step    smallint NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 10),
  run_mode        text NOT NULL DEFAULT 'semi' CHECK (run_mode IN ('semi','auto')),
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  credits_frozen  integer NOT NULL DEFAULT 0,
  credits_settled integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_credits_check CHECK (credits_frozen >= 0 AND credits_settled >= 0
                                        AND credits_settled <= credits_frozen)
);
CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_user_list_idx ON tasks (project_id) INCLUDE (status, mode, track);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status) WHERE status IN ('queued','running');
COMMENT ON TABLE tasks IS '一次 L1-L10 流水线运行：状态机（queued→running→done/failed/cancelled）、运行模式、config jsonb 快照与积分冻结/结算计数';
COMMENT ON COLUMN tasks.mode IS 'static（9 步，跳 L5）/ i2v（10 步）';
COMMENT ON COLUMN tasks.track IS 'byok（用户 Key，不计量）/ managed（平台代付，扣积分）';
COMMENT ON COLUMN tasks.current_step IS '当前逻辑步 1-10（L1.5 合规预审记 step=1）';
COMMENT ON COLUMN tasks.run_mode IS 'semi（每步暂停）/ auto（跑完）；权威值在本列，config.run_mode 为创建时快照';
COMMENT ON COLUMN tasks.config IS '运行参数与产物版本快照（含 content_language、synthesis、models、script_versions、candidates 等，结构见 04-数据库文档 §2.6.1）';
COMMENT ON COLUMN tasks.credits_frozen IS '托管档创建时冻结的积分（static=60 / i2v=300），失败解冻回补';
COMMENT ON COLUMN tasks.credits_settled IS 'done 时实结积分（=credits_frozen）；failed 保持 0 并解冻';

-- ============================================================================
-- 7. step_results — 单步产物元数据（canonical L1-L10，payload 存结构化结果与 minio_key）
-- ============================================================================
CREATE TABLE IF NOT EXISTS step_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step        smallint NOT NULL CHECK (step BETWEEN 1 AND 10),
  status      text NOT NULL DEFAULT 'queued'
              CHECK (status IN ('queued','running','done','failed','skipped','cancelled')),
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  error       text,
  retries     integer NOT NULL DEFAULT 0 CHECK (retries >= 0),
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT step_results_task_step_key UNIQUE (task_id, step)
);
CREATE INDEX IF NOT EXISTS step_results_status_idx ON step_results (status) WHERE status IN ('queued','running');
COMMENT ON TABLE step_results IS '单步产物元数据：每个逻辑步一行（step 1-10，L1.5 合规预审存 step=1 + payload.kind=''compliance_precheck''）；大文件本体在 MinIO';
COMMENT ON COLUMN step_results.step IS '逻辑步编号 1-10（static 跳 5；i2v 共 10 步），含义见 04-数据库文档 §2.7 含义表';
COMMENT ON COLUMN step_results.payload IS '按步骤结构化产物（storyboard_key/script_md/shots/clips/audio/srt_key/mp4_key 等引用 minio_key）';
COMMENT ON COLUMN step_results.retries IS '已重试次数（provider 调用 60s 超时 + 指数退避 ≤3）';

-- ============================================================================
-- 8. assets — 流水线产物登记簿（对象本体在 MinIO，一行 = 一个对象）
-- ============================================================================
CREATE TABLE IF NOT EXISTS assets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('shot','clip','audio','srt','mp4','zip')),
  minio_key  text NOT NULL,
  size       bigint CHECK (size >= 0),
  checksum   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assets_task_key_key UNIQUE (task_id, minio_key)
);
CREATE INDEX IF NOT EXISTS assets_task_type_idx ON assets (task_id, type);
COMMENT ON TABLE assets IS '任务产物登记簿：type 六类（shot/clip/audio/srt/mp4/zip），minio_key 规范见 04-数据库文档 §4';
COMMENT ON COLUMN assets.minio_key IS '对象 key（如 tasks/<id>/shots/shot-01.png），唯一，供孤儿对账';
COMMENT ON COLUMN assets.checksum IS 'sha256（hex），完整性校验与幂等比对用';

-- ============================================================================
-- 9. exports — 导出（30 天生命周期，C7）
-- ============================================================================
CREATE TABLE IF NOT EXISTS exports (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  minio_key  text NOT NULL,
  zip_hash   text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exports_minio_key_key UNIQUE (minio_key),
  CONSTRAINT exports_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS exports_expiry_idx ON exports (expires_at);
COMMENT ON TABLE exports IS 'L10 开放导出登记与下载凭证：创建 +30 天过期（C7），MinIO ILM 同口径清理对象；过期 GET /api/export/:id 返回 410';
COMMENT ON COLUMN exports.expires_at IS '= created_at + 30 days；应用层 410 为第一道闸，bucket 生命周期规则为最终清理';
COMMENT ON COLUMN exports.zip_hash IS 'zip 的 sha256，下载页展示供用户校验';

-- ============================================================================
-- 10. prompts — 提示词中心（7 类模板 + 每 (user_id, type) 一个默认）
-- ============================================================================
CREATE TABLE IF NOT EXISTS prompts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- PIPELINE_TASK_45：user_id 允许 NULL —— NULL 表示平台级全局默认技能（不属于任何用户），
  -- 模板中心与流水线按「用户配置优先 → 全局默认其次」语义查询。
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('product_parse','benchmark_analysis','script',
                                           'title','style','storyboard','compliance','video_style',
                                           '商品解析','对标分析','文案模板','标题生成',
                                           '分镜拆解','画面风格','合规规则','视频风格')),
  name       text NOT NULL,
  scenario   text,
  body       text NOT NULL,
  tags       text[] NOT NULL DEFAULT '{}',
  enabled    boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- PIPELINE_TASK_45：既有库的 prompts 表是 user_id NOT NULL（CREATE TABLE IF NOT EXISTS
-- 不改变既有列约束），这里显式放宽为可空——幂等（已是可空则 no-op），供 migrate.js
-- 重放 schema.sql 时对既有库生效。
ALTER TABLE prompts ALTER COLUMN user_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS prompts_one_default ON prompts (user_id, type) WHERE is_default;
-- PIPELINE_TASK_45：全局默认技能（user_id NULL）每 type 至多一条（部分唯一索引；
-- 与用户默认互不影响——用户默认按 (user_id,type) 唯一，全局默认按 type 唯一）。
CREATE UNIQUE INDEX IF NOT EXISTS prompts_global_default ON prompts (type) WHERE is_default AND user_id IS NULL;
CREATE INDEX IF NOT EXISTS prompts_user_type_idx ON prompts (user_id, type);
CREATE INDEX IF NOT EXISTS prompts_tags_gin ON prompts USING gin (tags);
COMMENT ON TABLE prompts IS '提示词中心：8 类英文模板（product_parse/benchmark_analysis/script/title/style/storyboard/compliance/video_style）+ 8 类中文模板（商品解析/对标分析/文案模板/标题生成/分镜拆解/画面风格/合规规则/视频风格，与前端 WizardPage STEP_TEMPLATE_TYPES 一致），供任务 config.templates 引用；user_id 为 NULL 的行是平台级全局默认技能（is_default=true，PIPELINE_TASK_45 seed）';
COMMENT ON COLUMN prompts.type IS 'product_parse（商品解析）/ benchmark_analysis（对标分析）/ script（文案）/ title（标题）/ style（画面风格）/ storyboard（分镜）/ compliance（合规规则，L1.5 复用）/ video_style（视频风格，L5 i2v 消费）；中文类型与英文类型并列，前端 L2 模板覆盖用 type=''文案模板''';
COMMENT ON COLUMN prompts.is_default IS '每 (user_id, type) 至多一个默认（部分唯一索引）';

-- ============================================================================
-- 10b. rules — 可配置规则（CORE-FEATURES：重构/拆分/图片/图生视频四类）
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
COMMENT ON TABLE rules IS 'CORE-FEATURES 可配置规则：rewrite（文案二次重构）/ split（文案拆分）/ image（图片生成）/ i2v（图生视频），用户可配置/保存/选用；任务创建时选中的规则 id 快照进 task.config.rules';
COMMENT ON COLUMN rules.kind IS 'rewrite（重构规则）/ split（拆分规则）/ image（图片生成规则）/ i2v（图生视频规则）';
COMMENT ON COLUMN rules.is_default IS '每 (user_id, kind) 至多一个默认（部分唯一索引），仅作 UI 默认选中，不隐式应用到流水线';

-- ============================================================================
-- 11. products — 商品库（「AI 创作」选品来源）
-- ============================================================================
CREATE TABLE IF NOT EXISTS products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  category        text,
  price           numeric(12,2),
  commission_rate numeric(5,2) CHECK (commission_rate BETWEEN 0 AND 100),
  product_url     text,
  detail_text     text,
  visibility      text NOT NULL DEFAULT 'me' CHECK (visibility IN ('all','private','me')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  gen_count       integer NOT NULL DEFAULT 0 CHECK (gen_count >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_user_idx ON products (user_id, status);
COMMENT ON TABLE products IS '商品库：快速生成「AI 创作」的选品来源；金额一律 numeric';
COMMENT ON COLUMN products.gen_count IS '被用于生成的次数（排序参考）';

-- ============================================================================
-- 12. benchmarks — 对标库（可关联商品；视频链接仅用户自行录入，R3）
-- ============================================================================
CREATE TABLE IF NOT EXISTS benchmarks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account     text,
  title       text NOT NULL,
  video_url   text,
  source_text text,
  product_id  uuid REFERENCES products(id) ON DELETE SET NULL,
  duration    integer,
  visibility  text NOT NULL DEFAULT 'me' CHECK (visibility IN ('all','private','me')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS benchmarks_user_idx ON benchmarks (user_id);
CREATE INDEX IF NOT EXISTS benchmarks_product_idx ON benchmarks (product_id) WHERE product_id IS NOT NULL;
COMMENT ON TABLE benchmarks IS '用户收藏的对标视频与文案，可关联 products（product_id 可空）';

-- ============================================================================
-- 13. media_assets — 素材库（对象本体在 MinIO users/<uid>/media/）
-- ============================================================================
CREATE TABLE IF NOT EXISTS media_assets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('image','audio','video')),
  name       text NOT NULL,
  url        text NOT NULL,
  size       bigint,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_assets_user_type_idx ON media_assets (user_id, type);
COMMENT ON TABLE media_assets IS '用户自建素材（图片/音频/视频）；url 为 MinIO 对象 key（或外部 URL，仅用户自建，R3）';
COMMENT ON COLUMN media_assets.meta IS '扩展元数据（宽高/时长/缩略图 key 等）';

-- ============================================================================
-- 14. report_abuse — 滥用举报（追加型：无 updated_at；status 流转为运营例外更新）
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_abuse (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  reason          text NOT NULL,
  details         text,
  contact         text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','closed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_abuse_idem_key UNIQUE (idempotency_key)
);
COMMENT ON TABLE report_abuse IS '滥用举报通道（R4）：idempotency_key 唯一防重复提交，重复提交返回首单结果；无 updated_at（04-数据库文档 §2.14）';

-- ============================================================================
-- 15. credit_accounts — 积分账户（C11：每用户一行，1 积分 = $0.01 锚定）
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits       integer NOT NULL DEFAULT 0,
  trial_credits integer NOT NULL DEFAULT 0,
  trial_granted boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_accounts_user_key UNIQUE (user_id),
  CONSTRAINT credit_accounts_balance_check CHECK (credits >= 0 AND trial_credits >= 0)
);
COMMENT ON TABLE credit_accounts IS '托管档统一积分账户：一用户一户（user_id 唯一）；credits 可用积分 / trial_credits 体验积分（注册赠 120，一次性）/ trial_granted 发放标记';
COMMENT ON COLUMN credit_accounts.credits IS '可用积分（订阅月度 900/3000 + 按次 190/790），扣减来源；并发安全：条件 UPDATE credits>=X 防双花';
COMMENT ON COLUMN credit_accounts.trial_credits IS '体验积分（注册赠 120），扣费时优先消耗；绑邮箱+设备指纹限一（指纹判定在 Redis/应用层）';

-- ============================================================================
-- 16. credit_ledger — 积分流水（追加型：只有 created_at，禁 UPDATE/DELETE）
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  task_id       uuid REFERENCES tasks(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('grant_subscription','grant_trial','topup',
                                              'freeze','settle','refund',
                                              'consume_static','consume_i2v',
                                              'rerun_static','rerun_i2v','expire')),
  amount        integer NOT NULL,
  balance_after integer NOT NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON credit_ledger (user_id, created_at DESC);
-- 幂等防重（R-幂等红线）：任务级冻结/结算/解冻天然至多各一次，重复投递撞唯一冲突即安全跳过
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_task_once
  ON credit_ledger (task_id, kind)
  WHERE task_id IS NOT NULL AND kind IN ('freeze','settle','refund');
COMMENT ON TABLE credit_ledger IS '积分流水（追加型，禁 UPDATE/DELETE，由 block_append_only_mutation 触发器强制）：审计与对账唯一依据，balance_after 链式校验';
COMMENT ON COLUMN credit_ledger.user_id IS 'FK→users（无级联：GDPR 财务留存义务优先，删除口径见 04-数据库文档 附录 A-7 待评审）';
COMMENT ON COLUMN credit_ledger.task_id IS 'FK→tasks ON DELETE SET NULL；grant/topup/expire 等非任务类流水为 NULL';
COMMENT ON COLUMN credit_ledger.kind IS '11 类：grant_subscription/grant_trial/topup/freeze/settle/refund/consume_static/consume_i2v/rerun_static/rerun_i2v/expire';
COMMENT ON COLUMN credit_ledger.amount IS '积分，有符号：扣减为负、入账为正；freeze/settle 记录被锁定/确认的量';
COMMENT ON COLUMN credit_ledger.balance_after IS '本行写入后 credit_accounts.credits 的余额（审计快照）';
COMMENT ON COLUMN credit_ledger.note IS '备注（如 order:<uuid> / rerun over quota）';

-- ============================================================================
-- 17. api_cost_log — 真实成本流水（C9：追加型，只有 created_at）
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_cost_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step           smallint NOT NULL CHECK (step BETWEEN 1 AND 10),
  track          text NOT NULL CHECK (track IN ('byok','managed')),
  provider       text NOT NULL,
  model          text NOT NULL,
  units          numeric(14,4) NOT NULL CHECK (units >= 0),
  unit_price_usd numeric(12,8) NOT NULL,
  cost_usd       numeric(12,6) NOT NULL CHECK (cost_usd >= 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_cost_log_task_idx ON api_cost_log (task_id);
CREATE INDEX IF NOT EXISTS api_cost_log_created_idx ON api_cost_log (created_at) WHERE track = 'managed';
COMMENT ON TABLE api_cost_log IS '真实成本流水（C9）：每次 provider 调用一条，托管档与 BYOK 全量记录（BYOK 仅记元数据，cost 记 0 或不计费标记，track 区分）';
COMMENT ON COLUMN api_cost_log.units IS '用量（tokens/张数/字符数/秒，口径由 provider 决定）';
COMMENT ON COLUMN api_cost_log.cost_usd IS '= units × unit_price_usd';

-- ============================================================================
-- 18. orders — 订单（Creem 收款，webhook 驱动状态机；user_id 无级联，财务留存）
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id),
  creem_order_id text,
  kind           text NOT NULL CHECK (kind IN ('subscription','pay_per_use')),
  sku            text NOT NULL,
  amount_usd     numeric(12,2) NOT NULL CHECK (amount_usd >= 0),
  status         text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','failed','expired','refunded')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_creem_key UNIQUE (creem_order_id)
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id, created_at DESC);
COMMENT ON TABLE orders IS 'Creem 收款订单（订阅/按次统一入口）：creem_order_id 唯一作 webhook 幂等键；paid 时同事务按 sku 入账（订阅→subscriptions+ledger grant / 按次→ledger topup）';
COMMENT ON COLUMN orders.creem_order_id IS 'Creem 侧订单号，唯一；webhook 重复投递安全跳过';
COMMENT ON COLUMN orders.sku IS 'starter_monthly / pro_monthly / static_once / i2v_once 等';
COMMENT ON COLUMN orders.status IS 'pending → paid / failed / expired，退款 refunded';

-- ============================================================================
-- 19. subscriptions — 订阅（Starter/Pro 月度，权威在 Creem，本表为 webhook 同步副本）
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id),
  creem_sub_id       text,
  plan               text NOT NULL CHECK (plan IN ('starter','pro')),
  status             text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','past_due','canceled','expired')),
  current_period_end timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_creem_key UNIQUE (creem_sub_id)
);
-- 一用户同时至多一个生效订阅
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_active
  ON subscriptions (user_id) WHERE status = 'active';
COMMENT ON TABLE subscriptions IS 'Starter/Pro 月度订阅状态镜像（权威在 Creem，webhook 同步）：status=active 且 plan 决定 users.tier；周期结束未续费 → expire 流水清零月度积分（不结转）';
COMMENT ON COLUMN subscriptions.plan IS 'starter（15 static/月，3 次免费重跑）/ pro（50 static/月可换 10 i2v，5 次免费重跑，优先队列）';
COMMENT ON COLUMN subscriptions.current_period_end IS '当前计费周期结束时间；到期 webhook 触发新周期 grant + 上期 expire';

-- ============================================================================
-- 触发器（业务表 updated_at 自动维护；追加型表禁写）
-- ============================================================================

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_credentials_updated_at ON credentials;
CREATE TRIGGER trg_credentials_updated_at BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_model_configs_updated_at ON model_configs;
CREATE TRIGGER trg_model_configs_updated_at BEFORE UPDATE ON model_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_platform_key_pool_updated_at ON platform_key_pool;
CREATE TRIGGER trg_platform_key_pool_updated_at BEFORE UPDATE ON platform_key_pool
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_step_results_updated_at ON step_results;
CREATE TRIGGER trg_step_results_updated_at BEFORE UPDATE ON step_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_exports_updated_at ON exports;
CREATE TRIGGER trg_exports_updated_at BEFORE UPDATE ON exports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_prompts_updated_at ON prompts;
CREATE TRIGGER trg_prompts_updated_at BEFORE UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_rules_updated_at ON rules;
CREATE TRIGGER trg_rules_updated_at BEFORE UPDATE ON rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_benchmarks_updated_at ON benchmarks;
CREATE TRIGGER trg_benchmarks_updated_at BEFORE UPDATE ON benchmarks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_media_assets_updated_at ON media_assets;
CREATE TRIGGER trg_media_assets_updated_at BEFORE UPDATE ON media_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_credit_accounts_updated_at ON credit_accounts;
CREATE TRIGGER trg_credit_accounts_updated_at BEFORE UPDATE ON credit_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 追加型流水表：禁 UPDATE / DELETE
DROP TRIGGER IF EXISTS trg_credit_ledger_append_only ON credit_ledger;
CREATE TRIGGER trg_credit_ledger_append_only
  BEFORE UPDATE OR DELETE ON credit_ledger
  FOR EACH ROW EXECUTE FUNCTION block_append_only_mutation();

DROP TRIGGER IF EXISTS trg_api_cost_log_append_only ON api_cost_log;
CREATE TRIGGER trg_api_cost_log_append_only
  BEFORE UPDATE OR DELETE ON api_cost_log
  FOR EACH ROW EXECUTE FUNCTION block_append_only_mutation();
