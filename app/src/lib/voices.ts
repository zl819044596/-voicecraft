// 按 TTS 模型配置 → 音色列表（写死映射，每个模型的音色不同）
// 用于：快速生成页音色选择器、任务详情页音色显示/更换

export interface VoiceOption {
  id: string
  name: string
  desc: string
  seed: number
}

// wingray / cosyvoice-v2 音色（真实可用，15 个）
// 与 voiceover 产品体系对齐（voiceover/Desktop/ai-tool-site/src/config/site.ts）：
// 英文品牌名 + 风格标签，底层映射 CosyVoice 预置音色。
export const WINGRAY_VOICES: VoiceOption[] = [
  // 👨 男声
  { id: 'longgaoseng', name: 'Victor', desc: '男声 · 旁白 · 温暖叙述，适合故事/有声书', seed: 1 },
  { id: 'longanlang', name: 'Henry', desc: '男声 · 阳光 · 活力明亮，适合运动/旅行', seed: 2 },
  { id: 'longjiqi', name: 'James', desc: '男声 · 通用 · 自然百搭', seed: 3 },
  { id: 'longyingxiao', name: 'William', desc: '男声 · 权威 · 沉稳有力，适合广告/品牌', seed: 4 },
  { id: 'longhouge', name: 'George', desc: '男声 · 低沉温暖，适合电影/纪录片', seed: 5 },
  { id: 'longjixin', name: 'Oliver', desc: '男声 · 活力，适合游戏/综艺', seed: 6 },
  // 👩 女声
  { id: 'longyumi_v2', name: 'Luna', desc: '女声 · 甜美，适合营销/Vlog', seed: 7 },
  { id: 'longxiaochun_v2', name: 'Chloe', desc: '女声 · 活泼欢快，适合营销/娱乐', seed: 8 },
  { id: 'longxiaoxia_v2', name: 'Zoe', desc: '女声 · 轻快，适合短视频/Vlog', seed: 9 },
  { id: 'longshange', name: 'Sophia', desc: '女声 · 专业，适合商务/培训', seed: 10 },
  { id: 'longdaiyu', name: 'Lily', desc: '女声 · 轻柔，适合冥想/睡前', seed: 11 },
  { id: 'longanli', name: 'Grace', desc: '女声 · 亲切，适合客服/教学', seed: 12 },
  { id: 'longanwen', name: 'Clara', desc: '女声 · 文艺，适合诗歌/文学', seed: 13 },
  { id: 'longanyun', name: 'Iris', desc: '女声 · 清新，适合日常/美食', seed: 14 },
  // 🧒 童声
  { id: 'longanran', name: 'An Ran', desc: '童声 · 可爱，适合儿童故事/教育', seed: 15 },
]

// 火山引擎 seed-tts 音色（豆包语音大模型，用户确认的 4 个）
export const SEED_TTS_VOICES: VoiceOption[] = [
  { id: 'zh_male_jieshuoxiaoming_uranus_bigtts', name: '解说小明·Uranus', desc: '男声 · 解说', seed: 11 },
  { id: 'zh_female_shuangkuaisisi_moon_bigtts', name: '爽快思思·Moon', desc: '女声 · 爽快', seed: 12 },
  { id: 'zh_male_qin', name: '秦·Male', desc: '男声 · 通用', seed: 13 },
  { id: 'zh_female_gaolengyujie_uranus_bigtts', name: '高冷御姐·Uranus', desc: '女声 · 高冷', seed: 14 },
]

// SiliconFlow CosyVoice2-0.5B 音色（FunAudioLLM/CosyVoice2-0.5B，官方预设 8 个）
// API voice 参数格式 `<model>:<speaker>`；id 存裸 speaker，请求层自动补前缀。
export const SF_COSYVOICE_VOICES: VoiceOption[] = [
  { id: 'alex', name: 'Alex', desc: '男声 · 沉稳叙述', seed: 21 },
  { id: 'anna', name: 'Anna', desc: '女声 · 自然清晰', seed: 22 },
  { id: 'bella', name: 'Bella', desc: '女声 · 甜美温柔', seed: 23 },
  { id: 'benjamin', name: 'Benjamin', desc: '男声 · 成熟稳重', seed: 24 },
  { id: 'charles', name: 'Charles', desc: '男声 · 温和磁性', seed: 25 },
  { id: 'claire', name: 'Claire', desc: '女声 · 明亮活泼', seed: 26 },
  { id: 'david', name: 'David', desc: '男声 · 标准播音', seed: 27 },
  { id: 'diana', name: 'Diana', desc: '女声 · 知性优雅', seed: 28 },
]

// 根据 TTS 模型配置返回音色列表；识别不到时返回 wingray 列表
export function voicesForConfig(cfg?: { model?: string | null; name?: string | null; voice?: string | null } | null): VoiceOption[] {
  const key = [cfg?.name, cfg?.model].filter(Boolean).join(' ').toLowerCase()
  if (key.includes('seed') || key.includes('bytedance') || key.includes('volc')) {
    return SEED_TTS_VOICES
  }
  if (key.includes('siliconflow') || key.includes('cosyvoice2-0.5b') || key.includes('cosyvoice2')) {
    return SF_COSYVOICE_VOICES
  }
  return WINGRAY_VOICES
}

// 根据音色 id 反查显示名；找不到返回 id 本身
export function voiceLabel(id: string | undefined | null, cfg?: { model?: string; name?: string } | null): string {
  if (!id) return ''
  const v = voicesForConfig(cfg).find((x) => x.id === id)
  return v ? v.name : id
}
