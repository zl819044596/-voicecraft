# PIPELINE_TASK_34: 修复托管档配音走平台池无视用户 TTS 配置（wingray 空音频熔断）

## 背景

- 用户反馈（2026-08-14）：配音还是有问题。
- **根因（已确认，2026-08-13 诊断）**：
  - 任务 6e9d1b06（华容道 16 镜，track=managed、run_mode=semi）config.models.tts = seed-tts-2.0 火山配置（model_configs c79217d3，凭证 4e323837），音色 `zh_male_jieshuoxiaoming_uranus_bigtts`。
  - `api/src/pipeline/providers.ts` `resolveProviderFor()` 对 track=managed 的任务**无条件** `pool.acquire(cls)` 走平台 Key 池（wingray 凭证），**无视 task.config.models.tts 显式指定的模型配置**。
  - 结果：wingray TTS 收到火山音色 ID → HTTP 200 + 0B 空 body → `wingray tts returned empty audio` → 重试 1 次仍失败 → l6 mockWavBuffer 假音频兜底 → 16 镜全是假音频。
  - 平台 key 池 tts 熔断器 OPEN（last_error='wingray tts returned empty audio'）。
  - 附带 bug：`api/src/routes/tasks.ts` assets index 解析 `minioKey.match(/(\d+)/)` 命中 task_id 数字（如 6e9d1b06 → 6），所有 vo-* 音频 index=6，只有一行波形。
- **修复方向（已向用户声明）**：托管档任务 config.models 显式指定了模型配置时，**尊重用户选择走用户配置（BYOK 解析）**；未指定才用平台池兜底。

## 修改点

### 1. api/src/pipeline/providers.ts — resolveProviderFor 尊重 config.models（核心）

当前逻辑（:116-122）：
```ts
if (String(task?.track) === 'managed') {
  const pooled = await pool.acquire(cls);
  if (!pooled) throw new Error(...);
  return pooledToRef(pooled);
}
```

改为：managed 档先检查 `task.config?.models?.[cls]`（如 `models: { llm, image, tts }`，值为 model_configs.id），有显式配置 → 走 `resolveByokEntry(pg, task.owner_id, cls, { model_config_id })`（已有函数），拿到 entry 且 credential 完整 → decryptKey + `byokToRef` 返回；entry 缺失/凭证不完整/解密失败 → **抛错提示配置不可用**（不要静默回落平台池，因为用户显式选了该配置；但注意：仅当 config.models[cls] 存在才抛错，否则照旧平台池兜底）。
无显式配置 → 保持现状 `pool.acquire(cls)`。

注意：`resolveByokEntry` 已支持 spec.model_config_id（:52-60 已读），可直接复用；`decryptKey`、`byokToRef` 已存在。

### 2. api/src/routes/tasks.ts — assets index 解析 bug（:495 附近）

`minioKey.match(/(\d+)/)` 会命中 task_id 里的数字。改为从 key 尾部的序号解析：`/(?:vo|clip|img)-?(\d+)/` 或优先取最后一段数字（如 `vo-01.mp3` → 1、`vo-1.mp3` → 1）。保持原有返回形状（index 数字），只修解析逻辑。读文件确认上下文后再改。

### 3. 熔断器处置

tts 熔断器当前 OPEN。修复代码后：`docker exec` psql 将该平台 key 的 `circuit_status` 置 `closed`、`last_error` 置 NULL（或者等冷却 half_open 自动恢复——但为验证即时生效，手动重置）。只重置 tts 相关行。

## 验证（必须全部通过）

1. `cd api && npm run build` 通过。
2. `docker compose up -d --build api` 重建（background=true 执行，本机 Hermes 终端会拦截前台长驻命令）。
3. 单元式验证（容器内 node 探针或直接观察重跑）：
   - 任务 6e9d1b06 重跑 L6（或新任务）时，日志出现火山 seed-tts 合成而非 `wingray tts returned empty audio`；MinIO audio/vo-*.mp3 为真实音频（大小 > 1KB，非 mock）。
   - mock fallback 日志不再出现。
4. assets index 验证：GET 任务详情 assets，vo-* 各镜 index 正确（1..16），前端每行都有波形。
5. git commit（只 add 本任务相关文件）：
   - commit message：`fix(api): managed tasks respect explicit config.models tts (no more wingray empty-audio fallback); fix assets index parse`
6. 不要 push（听潮统一 push）；不要 docker compose down；不要改任务卡之外的文件。

## 输出格式

完成后 read_file 自证修改已落盘；报告：修改文件、build 输出、容器重建结果、重跑任务 L6 日志关键行（合成成功/无 mock fallback）、assets index 验证结果、commit hash。
