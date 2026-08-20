# PIPELINE_TASK_28: validateShape 正则 bug 修复 + chatJson 失败日志

## 背景（听潮探针实锤，2026-08-13）

- 用户任务 L3 分镜永远 degraded（80s 三级重试后降级、只出兜底 3 镜）。
- 直接 chatCompletion 探针：**模型输出完全正常**（15s、10 镜、JSON 完美），但 `validateShape('l3')` 报 `missing fields: index, title, string, duration_sec, scene, string, ...`。
- 根因：`validateShape` 用 `schema.matchAll(/"(\w+)"/g)` 提取必填字段——**把类型标注 `"string"`/`"number"`、枚举值 `"zh|en"` 及 shots 数组内嵌字段全部当成了顶层必填字段** → 任何正常输出都校验失败 → chatJson 三级 attempt 全废 → degrade 兜底。
- 影响面：所有走 schemaKey 的 LLM 步骤（l1 / l15 / l3 / l9）全部误降级；l15 实证 degrade（reason=compliance_service_unavailable）；quick/rewrite 与 quick/create（schemaKey='l2'）同样会被误杀（用户点 AI 改写/创作会报 502）。
- 修复逻辑已用 Python 验证：`schema.replace(/\[[\s\S]*?\]/g, '[]')` 去数组块 + 排除类型词后，各 schema 顶层字段提取正确（l1/l15/l2/l3/l9 全部通过）。

## 修改点（api/src/pipeline/llm.ts，单文件）

### 1. validateShape 修复

现有（L22-30）：
```ts
export function validateShape(schemaKey: string, obj: unknown): { ok: boolean; error?: string } {
  const schema = TARGET_SCHEMAS[schemaKey];
  if (!schema) return { ok: true };
  const required = [...schema.matchAll(/"(\w+)"/g)].map((m) => m[1]);
  const o = (obj ?? {}) as Record<string, unknown>;
  const missing = required.filter((k) => o[k] === undefined || o[k] === null);
  if (missing.length > 0) return { ok: false, error: `missing fields: ${missing.join(', ')}` };
  return { ok: true };
}
```

改为：
```ts
/** schema 里的类型标注词（非字段名）。 */
const SCHEMA_TYPE_WORDS = new Set(['string', 'number', 'boolean']);

/** 从 TARGET_SCHEMAS 文本提取顶层必填字段：去掉 [...] 数组块（内嵌字段不校验），
 *  去掉 "string"/"number"/boolean 类型标注（历史 bug：把类型词当字段名导致
 *  所有正常输出校验失败 → 全步骤误降级，2026-08-13 修复）。 */
function topLevelFields(schema: string): string[] {
  const cleaned = schema.replace(/\[[\s\S]*?\]/g, '[]');
  return [...cleaned.matchAll(/"(\w+)"/g)].map((m) => m[1]).filter((k) => !SCHEMA_TYPE_WORDS.has(k));
}

export function validateShape(schemaKey: string, obj: unknown): { ok: boolean; error?: string } {
  const schema = TARGET_SCHEMAS[schemaKey];
  if (!schema) return { ok: true };
  const required = topLevelFields(schema);
  const o = (obj ?? {}) as Record<string, unknown>;
  const missing = required.filter((k) => o[k] === undefined || o[k] === null);
  if (missing.length > 0) return { ok: false, error: `missing fields: ${missing.join(', ')}` };
  return { ok: true };
}
```

### 2. chatJson 三级 attempt 加失败日志（排查用）

三个 catch（L112-114 / L136-138 / L163-165）都改为：
```ts
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[llm] chatJson ${opts.schemaKey ?? ''} attempt N failed: ${(err as Error).message}`);
    }
```
（N 分别为 1/2/3；不改变任何控制流，只加日志。）

## 验证（必须全部通过）

1. `cd api && npm run build` 通过。
2. `docker compose up -d --build api` 重建 + health 绿。
3. 容器内受控复现（听潮提供 `/srv/api/l3-repro.js`，已复制到容器）：
   `node /srv/api/l3-repro.js` → 应输出 `OK ... degraded: false shots: >=6`（此前 degraded: true / shots: 0）。
4. 可选：`node /srv/api/l3-raw.js` → `SHAPE {"ok":true,...}`（此前 missing fields: string...）。
5. git 提交：`git add` 仅限 llm.ts，commit message 如 `fix(api): validateShape top-level fields only (drop type words & nested) + chatJson failure logs`.

## 输出格式

完成后用 read_file 自证修改已落盘，报告：修改文件路径、build 输出、commit hash、l3-repro 复测结果。
