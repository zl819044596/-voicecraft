# PIPELINE_TASK_26: AI 改写 / AI 创作真实化（quick/rewrite + quick/create）

## 背景

- 快速生成页三个文案源 Tab：直接粘贴（已真实化，TASK_25）/ AI 改写 / AI 创作——后两个目前是 **mock 假数据**（QuickGenerate.tsx `runRewrite`/`runCreate` 用 setTimeout + 写死常量 REWRITE_RESULT/CREATE_RESULT）。
- 用户确认：「1 加真的」——真实化。
- 用户澄清：prompts 表模板（每类已有数据）是**辅助生成**用的。改写辅助用现有 `script` 类模板（已有「二创文案」「历史文化型」），创作辅助用现有 `product_parse` 类模板（「默认商品解析」）。

## 修改点

### 1. 后端 `api/src/routes/quick.ts`（新建）— 两个端点

**POST /api/quick/rewrite** — AI 改写
- 入参：`{ text: string, template_id?: string }`（text=用户粘贴的原文；template_id 可选，prompts 表 script 类模板 id）
- 逻辑：取 LLM provider（复用 `resolveProviderFor(pg, pool, task, 'llm')` 的默认任务形态——参考 l2.ts 的 provider 解析方式，用用户默认 llm 配置）；SYS = 选中模板正文（没选 → 默认改写 SYS，参考 P_L2_SYS 的改写意图即可）；USR = 原文；`chatJson` 输出 `{ script_paragraphs, hook, cta }`（schema 参考 l2，可复用 TARGET_SCHEMAS['l2']）
- 响应：`{ script_paragraphs: string[], hook: string, cta: string }`
- 认证：`requireAuth`；错误统一 apiError 格式

**POST /api/quick/create** — AI 创作
- 入参：`{ product_id: string, template_id?: string }`（product_id=商品库 id）
- 逻辑：按 product_id 查 products 表（name/category/price/detail_text）→ SYS = product_parse 模板正文（或默认创作 SYS）→ USR = 商品信息 → chatJson 输出同上结构
- 响应同上
- 要求：真实调用走 wingray（LLM_TIMEOUT 120s 生效），错误友好提示；**不创建任务**（前端拿到文案后由用户确认再创建任务）

路由注册：`api/src/index.ts` 挂载 `app.use('/api/quick', quickRouter)`（参照其他 router 注册方式）。

### 2. 前端 `app/src/pages/QuickGenerate.tsx` — 接真实 API

- `runRewrite`：`POST /api/quick/rewrite` `{ text: rewriteSrc, template_id?: 选中的script模板id }`（real 模式）；loading 用现有 `rewriting` state；成功 `setRewriteResult(结果)`、toast 真实文案；失败 toast 错误。demo 模式保留原 mock。
- `runCreate`：`POST /api/quick/create` `{ product_id: product }`（real 模式）；成功 `setCreateResult(...)`。demo 模式保留原 mock。
- 提交任务时：`tab==='rewrite'` → config 加 `script_mode:'rewrite'`；`tab==='create'` → `script_mode:'create'`（与 paste 一致，L1/L2 对已生成文案直用——见下）。
- template_id 选择器：可选做（若 prompts 中心已有 script 类模板下拉更佳）；**最小实现可不加选择器**，先固定用默认模板。

### 3. 后端 `api/src/pipeline/steps/l1.ts` + `l2.ts` — script_mode 扩展

- l1.ts：`scriptMode === 'paste' || 'rewrite' || 'create'` 时跳过 LLM 解析（与 paste 分支相同逻辑：topic=raw[:200] 等）——改写/创作的文案本身就是成品，不需要选题解析。
- l2.ts：同上三个模式都直用 `config.prompts.script`（前端提交时存的文案）分段输出。
- 注意：create 模式前端提交的 `prompt` 字段是创作结果文案（现已是），`source_type` 仍是 'topic' 时可保留（L1 分支优先于 source_type）。

## 验证（必须全部通过）

1. `cd api && npm run build` 通过；`cd app && npm run build` 通过。
2. `curl -sk --noproxy '*' https://localhost/api/health` 健康。
3. 行为说明：
   - 快速生成页 real 模式点「AI 改写」→ 真实 LLM 改写（几秒~几十秒），不再是 1.5s 假数据。
   - 点「AI 创作」选商品 → 真实基于商品生成文案。
   - 改写/创作结果提交任务后 L1/L2 直用文案（不重新生成）。
4. git 提交：`git add` 仅限新增/修改文件（quick.ts、index.ts、l1.ts、l2.ts、QuickGenerate.tsx），commit message 如 `feat(api+app): real AI rewrite/create via quick endpoints`.

## 输出格式

完成后用 read_file 自证修改已落盘，并报告：修改文件路径、两个 build 真实输出、commit hash。
