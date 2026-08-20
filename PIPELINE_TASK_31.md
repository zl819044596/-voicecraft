# PIPELINE_TASK_31: 快速生成页音色列表换真实 wingray 音色

## 背景（听潮探针实锤，2026-08-13）

- 任务 L6 配音 12 镜全部 fallback（warnings 12 条「wingray tts returned empty audio」），vo-*.mp3 全部是同一个占位音频（MD5 相同）→ 字幕跟着固定 6s 硬切。
- 探针实证：wingray TTS（平台 key + cosyvoice-v2 + longjiqi）**完全正常**（短文本 4.5s/100KB、长文本 39.5s/1.26MB）。
- **根因**：任务 `config.tts = {"speed":1, "voice":"aria"}` ——"aria" 是前端 mock 音色（ElevenLabs 残留），不是 wingray 音色 id → wingray synthesize 对不存在的 voice 返回 **HTTP 200 + 0B**（静默失败，cosyvoice skill 已知规律）→ L6 兜底占位。
- 前端 `app/src/pages/QuickGenerate.tsx` 的音色列表是写死的 mock：
  - `EN_VOICES`（L42-46）：aria/drew/nova
  - `ZH_VOICES`（L47-50）：xiaoxiao/yunye
  - `useState('aria')`（L116）默认；L543 `setVoice(lang === 'en' ? 'aria' : 'xiaoxiao')`
  - L275 提交 `tts: { voice, speed }` → 落 task.config.tts.voice

## 修改点（单文件：app/src/pages/QuickGenerate.tsx）

### 1. ZH_VOICES → 真实 wingray 音色（id 必须是音色 id，中文展示名随意）

```ts
const ZH_VOICES = [
  { id: 'longjiqi', name: '龙吉奇', desc: '男声 · 沉稳解说', seed: 1 },
  { id: 'longyingxiao', name: '龙影枭', desc: '男声 · 磁性旁白', seed: 2 },
  { id: 'longxiaochun_v2', name: '龙晓纯', desc: '女声 · 温柔', seed: 3 },
  { id: 'longyumi_v2', name: '龙雨米', desc: '女声 · 亲切', seed: 4 },
  { id: 'longanran', name: '龙安然', desc: '童声 · 活泼', seed: 5 },
]
```

### 2. EN_VOICES → 同一批音色（CosyVoice-V2 单模型多语言，同音色可读英文）

```ts
const EN_VOICES = [
  { id: 'longjiqi', name: 'Long Jiqi', desc: 'Male · Deep narrator', seed: 1 },
  { id: 'longxiaochun_v2', name: 'Long Xiaochun', desc: 'Female · Warm', seed: 2 },
  { id: 'longshange', name: 'Long Shange', desc: 'Female · Bright', seed: 3 },
]
```

### 3. 默认值修正

- L116：`useState('aria')` → `useState('longjiqi')`
- L543：`setVoice(lang === 'en' ? 'aria' : 'xiaoxiao')` → `setVoice('longjiqi')`

### 4. 检查提交路径

L275 附近 `tts: { voice, speed }` 确认 voice 就是上面的 state（无需改逻辑，只换数据源）。若任务创建还有其他 tts voice 入口（向导/编辑），一并修正默认值；没有则不动。

## 验证（必须全部通过）

1. `cd app && npm run build` 通过。
2. 行为：快速生成页音色下拉显示真实音色（龙吉奇等），默认龙吉奇；新建任务 config.tts.voice 应为 longjiqi（或用户选的音色 id）。
3. git 提交：`git add` 仅限 QuickGenerate.tsx，commit message 如 `fix(app): real wingray TTS voices in quick generate (aria/xiaoxiao mock broke L6)`.

## 输出格式

完成后用 read_file 自证修改已落盘，报告：修改文件路径、build 输出、commit hash。
