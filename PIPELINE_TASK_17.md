# PIPELINE_TASK_17: 修复 Models 页「provider is required」报错

## 背景与根因（听潮已定位，直接按此修复）

- 用户添加模型配置时选择「机制 B · 平台预设」，但 **provider 下拉留空**直接保存 → 报错「provider is required」。
- 根因链：
  1. `app/src/components/models/ConfigDrawer.tsx`：`provider` state 初始为 `''`（空字符串）。`buildConfig()` 里 `provider: mechanism === 'preset' ? provider : undefined` —— preset 机制下未选预设 → `cfg.provider = ''`（**空串，不是 undefined**）。
  2. `app/src/pages/Models.tsx` `handleSave` real 分支：
     ```ts
     provider: cfg.mechanism === 'preset' ? cfg.provider ?? cfg.name : hostFromUrl(cfg.endpoint),
     ```
     `??` 只兜底 `null`/`undefined`，**不兜底空字符串** → `'' ?? cfg.name` 仍为 `''` → POST /credentials 带空 provider。
  3. 后端 `api/src/routes/credentials.ts` POST：`if (!provider) throw apiError(422, 'VALIDATION_ERROR', 'provider is required')` —— 后端校验本身正确，不用改。

## 修改点

1. **`app/src/pages/Models.tsx`**（handleSave real 分支）：
   `cfg.provider ?? cfg.name` → `cfg.provider || cfg.name`（空串兜底到配置名称）。

2. **`app/src/components/models/ConfigDrawer.tsx`**（`buildConfig()`）：
   preset 机制下未选 provider 时拦截，友好提示。在 `buildConfig` 里 mechanism==='preset' 且 `!provider.trim()` 时：
   ```ts
   toast.error('请选择平台预设')
   return null
   ```
   （放在名称/冲突校验之后、API Key 校验之前即可。）

## 验证（必须全部通过）

1. `cd app && npm run build` 通过（tsc -b + vite build 无 TS 错误）。
2. 说明修复后行为：
   - preset 机制未选预设 → 前端直接提示「请选择平台预设」，不再发请求。
   - preset 机制选了预设（如 ElevenLabs）→ provider 非空，正常保存。
   - openai-compat 机制 → hostFromUrl 兜底，不受影响。
3. git 提交：`git add` 仅限 `app/src/pages/Models.tsx` + `app/src/components/models/ConfigDrawer.tsx`（严禁 `git add -A`，工作区有其他无关文件），commit message 如 `fix(app): empty preset provider falls back to name + drawer validation`.

## 输出格式

完成后用 read_file 自证修改已落盘（贴出修改后的关键代码行），并报告：
- 修改的文件绝对路径
- `npm run build` 的真实输出摘要
- git commit hash
