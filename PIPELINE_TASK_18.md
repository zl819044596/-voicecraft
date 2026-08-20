# PIPELINE_TASK_18: Models 页 provider 预设对齐后端 wingray 系列

## 背景与根因（听潮已定位，直接按此修复）

- 用户加配音配置选了预设「Azure TTS」→ 模型名自动变成「Azure TTS 默认模型」→ 测试连接/流水线都失败（后端统一调 wingray 平台，wingray 不认识该模型名）。
- **根因**：`app/src/components/models/data.ts` 的 `PRESETS` 是**演示数据**（llm: openai/anthropic/deepseek/moonshot；image: fal.ai/Stability/Midjourney/Recraft；tts: ElevenLabs/Azure TTS/OpenAI TTS；i2v: Kling/Runway/Pika/Hailuo），与后端真实预设完全不一致。
- 后端真实预设 = `packages/shared/src/providers.ts` 的 `PRESETS`：
  - llm: wingray · DeepSeek-V4-Flash-0731（mechanism A, baseUrl https://maas.wing-ray.cn）
  - image: wingray · Z-Image-Turbo（A）
  - tts: wingray · cosyvoice-v2（A, voices zh=[中文女声-温暖,中文男声-沉稳] en=[English-Female-Clear,English-Male-Deep]）
  - i2v: wingray · Kling-V1-6-I2V（B）
  - 另有 B 适配器预设：kling-i2v（kling-v2）、fal-image（fal-ai/flux/dev）、elevenlabs-tts（eleven_multilingual_v2, voices en=[Rachel,Domi,Bella] zh=[Xi,Song]）
  - Stability/Recraft/Midjourney/Azure TTS/OpenAI TTS/Runway/Pika/Hailuo **后端无适配器**，选了必失败 → 从预设列表删除。

## 修改点（仅 app/ 前端两个文件）

### 1. `app/src/components/models/data.ts`

- `ProviderPreset` 接口扩展（保持向后兼容，unsupported 保留）：
  ```ts
  export interface ProviderPreset {
    id: string
    label: string
    unsupported?: string
    /** 选预设自动填充的模型名（真实平台预设必须给） */
    model?: string
    /** tts 预设默认音色 */
    voice?: string
    /** 预设默认端点（机制 A 预填 base_url） */
    baseUrl?: string
  }
  ```
- `PRESETS` 按类替换为（与后端 PRESETS 对齐，wingray 每类第一条）：
  - llm: `{ id:'wingray-llm', label:'Wingray · DeepSeek V4 Flash', model:'DeepSeek-V4-Flash-0731', baseUrl:'https://maas.wing-ray.cn' }`
  - image: `{ id:'wingray-image', label:'Wingray · Z-Image Turbo', model:'Z-Image-Turbo', baseUrl:'https://maas.wing-ray.cn' }`
  - tts: `{ id:'wingray-tts', label:'Wingray · CosyVoice v2', model:'cosyvoice-v2', voice:'中文女声-温暖', baseUrl:'https://maas.wing-ray.cn' }` 外加 `{ id:'elevenlabs-tts', label:'ElevenLabs', model:'eleven_multilingual_v2', voice:'Rachel' }`（后端有适配器）
  - i2v: `{ id:'wingray-i2v', label:'Wingray · Kling V1.6 I2V', model:'Kling-V1-6-I2V', baseUrl:'https://maas.wing-ray.cn' }` 外加 `{ id:'kling-i2v', label:'Kling AI (Kuaishou)', model:'kling-v2' }`
  - 删除无适配器的：Stability AI / Recraft / Midjourney / Azure TTS / OpenAI TTS / Runway / Pika / Hailuo / Moonshot 等（llm 的 openai/anthropic/deepseek/moonshot 可保留 openai/anthropic/deepseek 但 model 必须给出真实模型名，如 deepseek → deepseek-chat；拿不准的就不留，宁少勿错）
  - **保留 `unsupported` 字段机制**（AC6 不可选项仍可用，如 Midjourney 可留作 disabled 示例，若删则整体删干净）

### 2. `app/src/components/models/ConfigDrawer.tsx`

- 选中预设时自动填充 model / voice / baseUrl：
  ```ts
  const pickPreset = (label: string) => {
    const p = presets.find((x) => x.label === label)
    setProvider(label)
    if (p?.model) setModel(p.model)
    if (p?.voice) setVoice(p.voice)
    if (p?.baseUrl) setBaseUrl(p.baseUrl)
  }
  ```
  Select 的 `onValueChange={pickPreset}`。
- `buildConfig()` 的 model fallback 改为优先用预设 model（`${provider} 默认模型` 不再出现）：
  ```ts
  const preset = mechanism === 'preset' ? PRESETS[cls].find((p) => p.label === provider) : undefined
  model: model.trim() || preset?.model || (mechanism === 'preset' ? provider : '未指定模型'),
  ```
- 打开抽屉初始化时（useEffect），若 editing 是 preset 机制，保持现行为（model 已有值）。

## 验证（必须全部通过）

1. `cd app && npm run build` 通过（tsc -b + vite build 无 TS 错误）。
2. 行为说明：
   - 新增 tts 配置选「Wingray · CosyVoice v2」→ model 自动填 `cosyvoice-v2`、voice 自动填 `中文女声-温暖` → 保存后测试连接应能通（wingray 真实 key）。
   - 预设列表不再出现 Stability/Recraft/Azure TTS 等后端无适配器的选项。
   - i2v 预设选 wingray → model `Kling-V1-6-I2V`。
3. git 提交：`git add` 仅限上述 2 个文件（严禁 `git add -A`），commit message 如 `fix(app): align model presets with backend wingray catalog`.

## 输出格式

完成后用 read_file 自证修改已落盘（贴出修改后的 PRESETS 与 pickPreset/buildConfig 关键代码），并报告：
- 修改的文件绝对路径
- `npm run build` 的真实输出摘要
- git commit hash
