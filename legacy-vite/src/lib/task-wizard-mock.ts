/**
 * Mock data + shared types for the Task Wizard page (/app/tasks/:id).
 * Frontend-only prototype data — no backend, no persistence.
 * Numbers mirror design.md §6.7 / §8 and task-wizard.md exactly.
 */
import type { GenMode, StepStatus } from '@/components/badges'

export type StepKey =
  | 'L1'
  | 'L1.5'
  | 'L2'
  | 'L3'
  | 'L4'
  | 'L5'
  | 'L6'
  | 'L7'
  | 'L8'
  | 'L9'
  | 'L10'

export type RunMode = 'semi' | 'auto'
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export const STEP_ORDER: StepKey[] = ['L1', 'L1.5', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10']

export const STEP_META: Record<StepKey, { code: string; name: string }> = {
  L1: { code: 'L1', name: '选题解析' },
  'L1.5': { code: 'L1.5', name: '合规预审' },
  L2: { code: 'L2', name: '文案生成' },
  L3: { code: 'L3', name: '分镜生成' },
  L4: { code: 'L4', name: '逐镜生图' },
  L5: { code: 'L5', name: '图生视频' },
  L6: { code: 'L6', name: '配音 TTS' },
  L7: { code: 'L7', name: '字幕生成' },
  L8: { code: 'L8', name: '视频合成' },
  L9: { code: 'L9', name: '复检' },
  L10: { code: 'L10', name: '开放导出' },
}

export interface StageDef {
  id: number
  name: string
  steps: StepKey[]
}

/** UI 六节点映射（PIPELINE_TASK_42 阶段 C，与后端 DISPLAY_NODES 对齐）：
 * ①文案=L1/L1.5/L2(1,2) · ②分镜拆解=L3(3) · ③逐镜生图=L4(4) ·
 * ④配音=L6(6) · ⑤字幕=L7(7) · ⑥合成导出=L8/L9/L10(8,9,10)。
 * L5(i2v) 已下线恒 skip，不参与任何节点。 */
export const STAGES: StageDef[] = [
  { id: 1, name: '文案', steps: ['L1', 'L1.5', 'L2'] },
  { id: 2, name: '分镜', steps: ['L3'] },
  { id: 3, name: '生图', steps: ['L4'] },
  { id: 4, name: '配音', steps: ['L6'] },
  { id: 5, name: '字幕', steps: ['L7'] },
  { id: 6, name: '合成导出', steps: ['L8', 'L9', 'L10'] },
]

/** 单步运行耗时（mock runner：1.2–2.4s 区间，按步取确定性值） */
export const STEP_DURATION: Record<StepKey, number> = {
  L1: 1300,
  'L1.5': 1200,
  L2: 2200,
  L3: 2400,
  L4: 2000,
  L5: 2400,
  L6: 1600,
  L7: 1300,
  L8: 1800,
  L9: 1500,
  L10: 1400,
}

/** 重跑费用（design.md §6.7）：i2v 80 / static 20 积分每次，BYOK 不计次 */
export function rerunCost(mode: GenMode): number {
  return mode === 'i2v' ? 80 : 20
}

/* ---------------- 任务主数据（design.md §8 锚点） ---------------- */

export const TASK = {
  id: 'demo-aurora',
  code: '#T-1042',
  title: 'Aurora Brew 冷萃咖啡 · 30s 产品广告',
  shots: 8,
  aspect: '9:16',
  lang: 'en',
  freezeCredits: 300,
  freeRerunsInitial: 2, // task-wizard.md §1「免费重跑剩 2 次」
}

export type MotionKind = 'push-in' | 'pan' | 'orbit' | 'static'
export const MOTIONS: MotionKind[] = ['push-in', 'pan', 'orbit', 'static']

export interface Shot {
  index: number
  title: string
  duration: string
  scene: string
  script: string
  voiceover: string
  subtitle: string
  prompt: string
  aspect: string
  motion: MotionKind
  image: string
  alt?: string
  voDuration: string
  /** 真实配音试听 URL（real 模式 L6 产物；demo 模式为空 → 假波形）。 */
  voUrl?: string
}

/** 8 镜头 · 时长 4s×2 + 3.5s×4 + 4s×2 = 30s（task-wizard.md §5） */
export const INITIAL_SHOTS: Shot[] = [
  {
    index: 1,
    title: 'Cold open · beans',
    duration: '4s',
    scene: 'Dark studio, falling coffee beans',
    script: 'Freeze-frame of beans mid-air, hard rim light.',
    voiceover: 'Some mornings deserve more than ordinary coffee.',
    subtitle: 'Some mornings deserve more',
    prompt:
      'Cinematic macro shot, dark roasted coffee beans falling and splashing against pure black background, slow-motion frozen splash, warm golden highlights with cool shadows, premium product-ad grading, 9:16 vertical.',
    aspect: '9:16',
    motion: 'push-in',
    image: '/shot-01.png',
    alt: '/shot-01-alt.png',
    voDuration: '0:03.8',
  },
  {
    index: 2,
    title: 'Product hero',
    duration: '4s',
    scene: 'Floating bottle, teal rim glow',
    script: 'Hero rotation of the frosted glass bottle.',
    voiceover: 'Meet Aurora Brew — cold brew, crafted to travel.',
    subtitle: 'Meet Aurora Brew',
    prompt:
      'Portable cold-brew coffee bottle, frosted glass with metal cap, floating over deep grey gradient background, teal ring rim light at base, condensation droplets, e-commerce grade product photography, 9:16 vertical.',
    aspect: '9:16',
    motion: 'orbit',
    image: '/shot-02.png',
    alt: '/shot-02-alt.png',
    voDuration: '0:03.5',
  },
  {
    index: 3,
    title: 'The pour',
    duration: '3.5s',
    scene: 'Amber pour into iced glass',
    script: 'High-speed splash as brew meets ice.',
    voiceover: 'Slow-steeped for eighteen hours. Poured in one second.',
    subtitle: 'Slow-steeped. Poured fast.',
    prompt:
      'Deep amber cold-brew coffee pouring into a glass full of ice cubes, liquid splash frozen mid-air, black background, high-speed photography texture, 9:16 vertical.',
    aspect: '9:16',
    motion: 'push-in',
    image: '/shot-03.png',
    voDuration: '0:04.1',
  },
  {
    index: 4,
    title: 'City commute',
    duration: '3.5s',
    scene: 'Morning crosswalk, bokeh traffic',
    script: 'Handheld follow, shallow depth of field.',
    voiceover: 'Made for the rush you never signed up for.',
    subtitle: 'Made for the rush',
    prompt:
      'Young commuter holding a cold-brew bottle crossing a zebra crossing in early morning city, shallow depth of field with traffic bokeh, cool teal morning tone, lifestyle advertising photo, 9:16 vertical.',
    aspect: '9:16',
    motion: 'pan',
    image: '/shot-04.png',
    alt: '/shot-04-alt.png',
    voDuration: '0:03.2',
  },
  {
    index: 5,
    title: 'Desk ritual',
    duration: '3.5s',
    scene: 'Minimal desk, morning side light',
    script: 'Slow push toward the bottle beside laptop.',
    voiceover: 'Or the quiet hour before the world wakes up.',
    subtitle: 'Or the quiet hour',
    prompt:
      'Minimal office desk scene, laptop beside a cold-brew bottle and a glass cup, warm morning side light, wood and warm-white palette, lifestyle photography, 9:16 vertical.',
    aspect: '9:16',
    motion: 'push-in',
    image: '/shot-05.png',
    voDuration: '0:03.6',
  },
  {
    index: 6,
    title: 'Outdoor energy',
    duration: '3.5s',
    scene: 'Cyclist at dusk hillside',
    script: 'Backlit silhouette, dynamic motion blur.',
    voiceover: 'Zero sugar. Bold flavor. Anywhere the day goes.',
    subtitle: 'Zero sugar. Bold flavor.',
    prompt:
      'Cyclist raising a cold-brew bottle during a rest break, dusk hillside background, backlit silhouette, subtle motion blur, energetic outdoor advertising photo, 9:16 vertical.',
    aspect: '9:16',
    motion: 'orbit',
    image: '/shot-06.png',
    voDuration: '0:03.4',
  },
  {
    index: 7,
    title: 'Detail macro',
    duration: '4s',
    scene: 'Condensation macro, top light',
    script: 'Extreme close-up on droplets and cap.',
    voiceover: 'Every bottle, cold-brewed in small batches.',
    subtitle: 'Small-batch cold brew',
    prompt:
      'Extreme macro of condensation droplets and mist on a bottle surface, metal cap reflection, single top light on dark background, luxury detail photography, 9:16 vertical.',
    aspect: '9:16',
    motion: 'pan',
    image: '/shot-07.png',
    alt: '/shot-07-alt.png',
    voDuration: '0:03.9',
  },
  {
    index: 8,
    title: 'Sunset toast',
    duration: '4s',
    scene: 'Window silhouette, warm sky',
    script: 'Raise the glass, leave room for wordmark.',
    voiceover: 'Aurora Brew. Your day, bottled cold.',
    subtitle: 'Aurora Brew. Bottled cold.',
    prompt:
      'Sunset window scene, person raising a glass in silhouette, warm orange skylight, negative space at bottom for brand wordmark, warm closing lifestyle shot, 9:16 vertical.',
    aspect: '9:16',
    motion: 'static',
    image: '/shot-08.png',
    voDuration: '0:03.3',
  },
]

/* ---------------- L2 文案版本 ---------------- */

export interface ScriptVersion {
  id: string
  name: string
  current?: boolean
  body: string
}

export const INITIAL_SCRIPT_VERSIONS: ScriptVersion[] = [
  {
    id: 'v3',
    name: 'v3 促销强化版',
    current: true,
    body: `Some mornings deserve more than ordinary coffee.

Meet Aurora Brew — cold brew, crafted to travel. Slow-steeped for eighteen hours. Poured in one second.

Made for the rush you never signed up for. Or the quiet hour before the world wakes up.

Zero sugar. Bold flavor. Anywhere the day goes. Every bottle, cold-brewed in small batches.

Aurora Brew. Your day, bottled cold.

[Launch offer] First 1,000 bottles ship with a reusable ice sleeve.`,
  },
  {
    id: 'v2',
    name: 'v2 简洁版',
    body: `Aurora Brew. Cold brew, slow-steeped for eighteen hours.

Bold flavor, zero sugar, ready anywhere — commute, desk, or dusk ride.

Your day, bottled cold.`,
  },
  {
    id: 'v1',
    name: 'v1 初稿',
    body: `Aurora Brew is a portable cold-brew coffee. It is brewed slowly for a smoother taste.

Take it to work, to the gym, or on a ride. No sugar, full flavor.

Try Aurora Brew today.`,
  },
]

/* ---------------- L6 音色 ---------------- */

export const VOICES = ['Aria', 'Noah', 'Ember', 'Kai', 'Luna']

/* ---------------- L8 合成阶段 ---------------- */

export const COMPOSE_PHASES = ['混音', '烧录字幕', '拼接', '导出 mp4']

/* ---------------- L10 导出文件树 ---------------- */

export interface ExportNode {
  name: string
  size?: string
  kind: 'zip' | 'video' | 'json' | 'md' | 'image' | 'audio' | 'srt' | 'txt' | 'dir'
  children?: ExportNode[]
  previewSrc?: string
  note?: string
}

export const EXPORT_TREE: ExportNode = {
  name: 'project-export-20250812.zip',
  size: '38.2 MB',
  kind: 'zip',
  children: [
    { name: 'final.mp4', size: '24.6 MB', kind: 'video', previewSrc: '/shot-03.png' },
    {
      name: 'storyboard.json',
      size: '18 KB',
      kind: 'json',
      note: '8 镜头完整结构，可再导入本平台继续改',
    },
    { name: 'script.md', size: '4 KB', kind: 'md' },
    {
      name: 'assets',
      kind: 'dir',
      children: [
        {
          name: 'shots',
          kind: 'dir',
          note: 'shot-01.png … ×8',
          children: INITIAL_SHOTS.map((s) => ({
            name: `shot-0${s.index}.png`,
            size: '1.1 MB',
            kind: 'image' as const,
            previewSrc: s.image,
          })),
        },
        {
          name: 'audio',
          kind: 'dir',
          note: 'vo-01.mp3 … ×8',
          children: INITIAL_SHOTS.map((s) => ({
            name: `vo-0${s.index}.mp3`,
            size: '92 KB',
            kind: 'audio' as const,
          })),
        },
        { name: 'subtitles.srt', size: '6 KB', kind: 'srt' },
      ],
    },
    { name: 'LICENSE.txt', size: '2 KB', kind: 'txt', note: '中英双语所有权声明' },
  ],
}

/** 候选图滤镜变体（mock 差异候选，design.md §9 实现备注） */
export const VARIANT_FILTERS = [
  'saturate(1.35) hue-rotate(-10deg)',
  'brightness(1.12) contrast(1.12) sepia(.15)',
  'hue-rotate(14deg) saturate(1.1)',
]

/** 任务配置 JSON（⋯ 菜单「查看配置 JSON」Drawer 只读展示） */
export const TASK_CONFIG_JSON = {
  task_id: 'T-1042',
  title: TASK.title,
  mode: 'static',
  track: 'managed',
  run_mode: 'semi',
  aspect: '9:16',
  content_lang: 'en',
  shots: 8,
  duration_s: 30,
  storyboard_preset: 'ecommerce',
  voice: { id: 'aria', speed: 1.0 },
  review_gate: { L8: true },
  credits: { freeze: 300, rerun_i2v: 80, rerun_static: 20, free_reruns_left: 2 },
}

export const EMPTY_STATUS: Record<StepKey, StepStatus> = {
  L1: 'queued',
  'L1.5': 'queued',
  L2: 'queued',
  L3: 'queued',
  L4: 'queued',
  L5: 'queued',
  L6: 'queued',
  L7: 'queued',
  L8: 'queued',
  L9: 'queued',
  L10: 'queued',
}

/** 默认进入态（design.md §8）：已完成到 L4 进行中 */
export const INITIAL_STATUS: Record<StepKey, StepStatus> = {
  ...EMPTY_STATUS,
  L1: 'done',
  'L1.5': 'done',
  L2: 'done',
  L3: 'done',
  L4: 'running',
}
