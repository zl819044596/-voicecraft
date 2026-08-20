# PIPELINE_TASK_25: 文案源·直接粘贴链路（L1 跳过解析 + L2 直用原文）

## 背景（用户 9 步流水线定义，2026-08-13 口述）

- 快速生成页文案源三选择：1 直接粘贴（**不需要选题解析**）/ 2 AI 改写（调文案模板）/ 3 AI 创作（调商品模板）——「可以先做第一种」。
- 现状问题：paste 提交后 L1 仍走完整 LLM 选题解析（解析 topic/key_points），L2 用 LLM 重新生成文案——粘贴的原文不会被原样使用，多花时间与积分。
- 用户澄清：prompts 模板库（7 类，每类已有数据）是**辅助生成**用的，文案源三选择是动作流程，两者不混。

## 修改点（3 个文件）

### 1. `api/src/pipeline/steps/l1.ts` — paste 分支跳过 LLM

在 `l1.run` 开头（读 raw 之后）加：

```ts
const scriptMode = String((task.config as Record<string, unknown> | undefined)?.script_mode || '');
```

LLM 调用前判断 `scriptMode === 'paste'`：不调 chatJson，直接构造 payload：

```ts
if (scriptMode === 'paste') {
  const payload: Record<string, unknown> = {
    kind: 'topic',
    topic: raw.slice(0, 200),
    key_points: [raw.slice(0, 2000)],
    target_duration_sec: 60,
    audience: '',
    language: lang,
    raw_input: raw.slice(0, 12000),
    script_mode: 'paste',
  };
  return { payload };
}
```

要求：paste 分支**完全跳过 LLM 调用**（不产生 api_cost_log）；保留原有非 paste 逻辑逐字不变。

### 2. `api/src/pipeline/steps/l2.ts` — paste 分支直用原文

在 `l2.run` 里读 customPrompt 之后、LLM 调用之前加：

```ts
const scriptMode = String((config as Record<string, unknown>).script_mode || '');
```

paste 分支（不调 chatJson，直接产出）：

```ts
if (scriptMode === 'paste') {
  const paragraphs = customPrompt
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.slice(0, 2000));
  if (paragraphs.length === 0) paragraphs.push('视频内容');
  const payload: Record<string, unknown> = {
    kind: 'script',
    script_paragraphs: paragraphs,
    hook: String(customPrompt.trim().slice(0, 500) || paragraphs[0] || ''),
    cta: String(paragraphs[paragraphs.length - 1] || '').slice(0, 500),
  };
  const md = [`# ${payload.hook || '视频文案'}`, '', ...paragraphs.map((p, i) => `### 段落 ${i + 1}\n\n${p}`), ''].join('\n');
  await lib.uploadToMinio(minio, `tasks/${task.id}/script.md`, Buffer.from(md, 'utf8'), 'text/markdown');
  return { payload };
}
```

注意：`customPrompt` 变量已有（L35-37，取 `config.prompts.script`——快速生成页提交时存的原文）；文案按换行分段，保留原样不改写。

### 3. `app/src/pages/QuickGenerate.tsx` — 提交时标记 script_mode

在 submit 的 real 分支 config 对象里（`prompts: { script: copy }` 附近）加：

```ts
...(tab === 'paste' ? { script_mode: 'paste' } : {}),
```

其余 tab（rewrite/create）暂不传，保持旧行为（后续真实化时再扩展）。

## 验证（必须全部通过）

1. `cd api && npm run build` 通过。
2. `cd app && npm run build` 通过。
3. 行为说明：
   - 快速生成页选「直接粘贴」→ 填文案 → 生成任务 → L1 秒过（topic=原文前 200 字）、L2 直出原文分段（hook/cta 取首尾）。
   - 非 paste 任务行为不变（L1 解析 + L2 LLM 生成）。
4. git 提交：`git add` 仅限 3 个文件，commit message 如 `feat(api+app): paste mode — L1 skips topic parsing, L2 uses pasted copy verbatim`.

## 输出格式

完成后用 read_file 自证三处修改已落盘，并报告：修改文件路径、两个 build 真实输出、commit hash。
