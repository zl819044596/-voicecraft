/* 模型通道数据模型与 mock（models.md §3/§5）—— 纯前端内存 mock，Key 仅存 masked 串 */

export type ProviderClass = 'llm' | 'image' | 'tts'
export type Mechanism = 'openai-compat' | 'preset'

export interface ModelConfig {
  id: string
  cls: ProviderClass
  name: string
  mechanism: Mechanism
  /** 机制 A：OpenAI 兼容端点 */
  endpoint?: string
  /** 机制 B：平台预设适配器名 */
  provider?: string
  model: string
  /** 只保存掩码串，明文输入即丢弃（R1 红线） */
  maskedKey: string
  /** 仅 TTS */
  voice?: string
  isDefault: boolean
  enabled: boolean
  /** 预置失败用例：测试连接返回 401 */
  failsTest?: boolean
  /** 被其他 model_configs 引用的次数（删除警告用） */
  refs?: number
  /** real 模式：后端 model_configs.credential_id（编辑回填，新建时为空） */
  credentialId?: string
  /** 仅 save 瞬间透传的明文 Key（R1：只用于 POST /api/credentials 建凭据，用完即弃，不落状态/存储/URL） */
  plainKey?: string
}

export const CLASS_META: Record<ProviderClass, { title: string; purpose: string }> = {
  llm: { title: 'LLM 大语言模型', purpose: '文案生成 · 分镜脚本 · 提示词扩展（L1–L3）' },
  image: { title: 'Image 图像生成', purpose: '逐镜候选图生成（L4）' },
  tts: { title: 'TTS 语音合成', purpose: '配音句合成与音色管理（L6）' },
}

export const CLASS_ORDER: ProviderClass[] = ['llm', 'image', 'tts']

/** 机制 B 平台预设适配器（按类过滤）；unsupported 项不可选（AC6） */
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

export const PRESETS: Record<ProviderClass, ProviderPreset[]> = {
  llm: [
    { id: 'wingray-llm', label: 'Wingray · DeepSeek V4 Flash', model: 'DeepSeek-V4-Flash-0731', baseUrl: 'https://maas.wing-ray.cn' },
    { id: 'openai', label: 'OpenAI', model: 'gpt-4o-mini' },
    { id: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-5' },
    { id: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat' },
  ],
  image: [
    { id: 'wingray-image', label: 'Wingray · Z-Image Turbo', model: 'Z-Image-Turbo', baseUrl: 'https://maas.wing-ray.cn' },
  ],
  tts: [
    { id: 'wingray-tts', label: 'Wingray · CosyVoice v2', model: 'cosyvoice-v2', voice: 'longjiqi', baseUrl: 'https://maas.wing-ray.cn' },
    { id: 'elevenlabs-tts', label: 'ElevenLabs', model: 'eleven_multilingual_v2', voice: 'Rachel' },
  ],
}

/** 明文 Key → 掩码串。调用后必须立即丢弃明文（不写存储/URL/状态） */
export function maskKey(raw: string): string {
  const k = raw.trim()
  if (k.length <= 7) return '••••••'
  return `${k.slice(0, 3)}••••••${k.slice(-4)}`
}

export const INITIAL_CONFIGS: ModelConfig[] = [
  {
    id: 'mc-llm-deepseek',
    cls: 'llm',
    name: 'DeepSeek 主用',
    mechanism: 'openai-compat',
    endpoint: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    maskedKey: 'sk-••••••cdef',
    isDefault: true,
    enabled: true,
    refs: 2,
  },
  {
    id: 'mc-llm-gpt4omini',
    cls: 'llm',
    name: 'GPT-4o mini 备用',
    mechanism: 'preset',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    maskedKey: 'sk-••••••9f2a',
    isDefault: false,
    enabled: true,
  },
  {
    id: 'mc-image-flux',
    cls: 'image',
    name: 'fal.ai FLUX.1 schnell',
    mechanism: 'preset',
    provider: 'fal.ai',
    model: 'FLUX.1 schnell',
    maskedKey: 'fal-••••••7b21',
    isDefault: true,
    enabled: true,
  },
  {
    id: 'mc-tts-elevenlabs',
    cls: 'tts',
    name: 'ElevenLabs 多语言',
    mechanism: 'preset',
    provider: 'ElevenLabs',
    model: 'eleven_multilingual_v2',
    maskedKey: 'el-••••••03aa',
    voice: 'Aria',
    isDefault: true,
    enabled: true,
  },
  {
    id: 'mc-tts-azure',
    cls: 'tts',
    name: 'Azure TTS 备用',
    mechanism: 'preset',
    provider: 'Azure TTS',
    model: 'neural-zh-CN',
    maskedKey: 'az-••••••e817',
    voice: 'Xiaoxiao',
    isDefault: false,
    enabled: false,
  },
]
