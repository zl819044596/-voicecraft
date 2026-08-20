/* 资料库共享 mock 数据与类型（F-LIB-1..4，全部为前端内存 mock） */

/* ---------- 提示词（F-LIB-1） ---------- */

export type PromptType =
  | 'product'
  | 'benchmark'
  | 'copy'
  | 'title'
  | 'style'
  | 'video'
  | 'storyboard'
  | 'compliance'

export const PROMPT_TYPES: { id: PromptType; label: string }[] = [
  { id: 'product', label: '商品解析' },
  { id: 'benchmark', label: '对标分析' },
  { id: 'copy', label: '文案模板' },
  { id: 'title', label: '标题生成' },
  { id: 'style', label: '画面风格' },
  { id: 'video', label: '视频风格' },
  { id: 'storyboard', label: '分镜拆解' },
  { id: 'compliance', label: '合规规则' },
]

export interface PromptItem {
  id: string
  type: PromptType
  name: string
  tags: string[]
  content: string
  isDefault: boolean
  enabled: boolean
  updatedAt: string
  /** 平台预置，不可删除（如合规规则） */
  locked?: boolean
}

export const PRESET_PROMPTS: PromptItem[] = [
  {
    id: 'p-copy-1',
    type: 'copy',
    name: '带货口播 · 痛点三段式',
    tags: ['电商', '30s'],
    content:
      '你是一名短视频带货文案专家。基于商品资料，按「痛点共鸣 → 产品解决方案 → 行动号召」三段式输出 30 秒口播稿：\n1. 前 3 秒抛出目标人群的真实痛点（口语化、有画面感）；\n2. 中段用 2-3 个商品卖点逐一回应痛点，每个卖点配一个使用场景；\n3. 结尾给出明确 CTA 与价格锚点。\n输出语言：英文口播稿，句子短促有力，避免书面语。',
    isDefault: true,
    enabled: true,
    updatedAt: '2024-06-18 14:32',
  },
  {
    id: 'p-copy-2',
    type: 'copy',
    name: '开箱惊喜感脚本',
    tags: ['开箱'],
    content:
      '围绕「第一眼惊喜」写开箱脚本：先描述包装细节与期待感，再揭示产品的第一眼冲击，最后给一个「值回票价」的总结。语气像和朋友分享，多用感叹与停顿。',
    isDefault: false,
    enabled: true,
    updatedAt: '2024-06-12 09:20',
  },
  {
    id: 'p-copy-3',
    type: 'copy',
    name: '知识干货 · 清单体',
    tags: ['知识', '清单'],
    content:
      '以「N 个你不知道的 XX 技巧」清单体输出文案：每条清单 15 字以内结论 + 一句解释；开头用反常识结论抓注意力，结尾引导收藏。',
    isDefault: false,
    enabled: true,
    updatedAt: '2024-06-08 17:45',
  },
  {
    id: 'p-copy-4',
    type: 'copy',
    name: '品牌故事 · 情绪向',
    tags: ['品牌'],
    content:
      '以第一人称讲品牌创立故事：一个具体的触发瞬间 → 坚持的理念 → 与用户的关系。克制抒情，多用细节而非形容词。',
    isDefault: false,
    enabled: false,
    updatedAt: '2024-05-30 11:02',
  },
  {
    id: 'p-prod-1',
    type: 'product',
    name: '卖点提炼 · 三段论',
    tags: ['卖点'],
    content:
      '从商品详情中提炼卖点，按「功能卖点 / 情绪卖点 / 信任卖点」三类各输出 2 条，每条附一句可用于口播的英文表达。',
    isDefault: true,
    enabled: true,
    updatedAt: '2024-06-15 10:08',
  },
  {
    id: 'p-prod-2',
    type: 'product',
    name: '成分党深度解析',
    tags: ['成分'],
    content:
      '面向成分党用户解析商品材质/配料：逐项说明来源、作用与对比优势，避免绝对化用语，保留专业术语英文原文。',
    isDefault: false,
    enabled: true,
    updatedAt: '2024-06-10 15:26',
  },
  {
    id: 'p-prod-3',
    type: 'product',
    name: '竞品对比框架',
    tags: ['对比'],
    content:
      '构建「同价位 3 维对比」框架：使用场景、核心差异点、适合人群。结论中立，不贬低竞品。',
    isDefault: false,
    enabled: true,
    updatedAt: '2024-06-02 08:50',
  },
  {
    id: 'p-bench-1',
    type: 'benchmark',
    name: '对标结构拆解 · 黄金三秒',
    tags: ['结构'],
    content:
      '拆解对标视频结构：标注前 3 秒钩子类型、节奏切分点、转化引导位置，输出为可复用的分镜骨架。',
    isDefault: true,
    enabled: true,
    updatedAt: '2024-06-11 20:14',
  },
  {
    id: 'p-title-1',
    type: 'title',
    name: '爆款标题 · 数字冲击',
    tags: ['标题'],
    content:
      '生成 10 个短视频标题：优先使用数字、对比与反常识句式；每个标题 ≤ 20 字，附适用平台建议。',
    isDefault: true,
    enabled: true,
    updatedAt: '2024-06-09 13:37',
  },
  {
    id: 'p-style-1',
    type: 'style',
    name: '高级暗调产品片',
    tags: ['暗调', '产品'],
    content:
      '画面风格指令：纯黑/深灰背景，侧逆光勾勒轮廓，暖金高光 + 冷暗部的高级广告调色，慢动作凝结感，9:16 竖屏构图，主体居中偏上。',
    isDefault: true,
    enabled: true,
    updatedAt: '2024-06-14 16:55',
  },
  {
    id: 'p-style-2',
    type: 'style',
    name: '清晨生活方式',
    tags: ['生活', '明亮'],
    content:
      '画面风格指令：清晨侧光、浅景深、暖白 + 木色基调的生活方式摄影，人物只出现手部或剪影，留白供字幕排版。',
    isDefault: false,
    enabled: true,
    updatedAt: '2024-06-05 10:41',
  },
  {
    id: 'p-video-1',
    type: 'video',
    name: '运镜卡点 · 快节奏',
    tags: ['卡点', '快节奏'],
    content:
      '视频风格指令：快节奏运镜卡点，每 1.5-2 秒一切，推拉摇移交替，镜头运动与鼓点强对齐，动感转场（闪白/甩镜），主体始终在画面黄金分割点。',
    isDefault: true,
    enabled: true,
    updatedAt: '2024-06-14 16:55',
  },
  {
    id: 'p-video-2',
    type: 'video',
    name: '电影感长镜头',
    tags: ['电影感', '慢速'],
    content:
      '视频风格指令：电影感长镜头，缓慢推进与环绕运镜，浅景深背景虚化，稳定器平滑运动，光影层次分明，适合情绪向内容。',
    isDefault: false,
    enabled: true,
    updatedAt: '2024-06-05 10:41',
  },
  {
    id: 'p-story-1',
    type: 'storyboard',
    name: '30s 八镜头标准结构',
    tags: ['30s', '结构'],
    content:
      '将口播稿拆解为 8 个镜头（6-12 区间）：开场钩子 → 痛点场景 → 产品登场 → 卖点演示 ×3 → 使用场景 → 收尾 CTA。每镜输出时长、画面描述、运镜方式与生成 prompt。',
    isDefault: true,
    enabled: true,
    updatedAt: '2024-06-16 19:03',
  },
  {
    id: 'p-story-2',
    type: 'storyboard',
    name: '快节奏卡点分镜',
    tags: ['卡点'],
    content:
      '按 BGM 鼓点切分镜头，每 1.5-2s 一镜，强调动作匹配剪辑（match cut）；输出每镜的节拍点与转场方式。',
    isDefault: false,
    enabled: true,
    updatedAt: '2024-06-03 12:19',
  },
  {
    id: 'p-comp-1',
    type: 'compliance',
    name: '平台默认合规规则 v2',
    tags: ['合规', '预置'],
    content:
      '合规预审规则（托管档 L1.5 调用）：\n1. 文案不得包含绝对化用语（最、第一、100%）；\n2. 不得宣称医疗/治疗功效；\n3. 价格表述须与商品资料一致；\n4. 不得出现未成年人形象导向内容；\n5. 引用对标内容仅限结构参考，不得逐字复用。',
    isDefault: true,
    enabled: true,
    updatedAt: '2024-06-01 09:00',
    locked: true,
  },
]

/* ---------- 商品（F-LIB-2） ---------- */

export type ProductStatus = 'active' | 'inactive'
export type Visibility = 'private' | 'team'

export interface Product {
  id: string
  name: string
  category: string
  price: number
  commission: number
  url: string
  detail: string
  visibility: Visibility
  status: ProductStatus
  genCount: number
  image?: string
  /** 无图占位色块 hue */
  hue?: number
}

export const PRODUCT_CATEGORIES = ['食品饮料', '家居', '数码', '户外', '美妆']

export const PRESET_PRODUCTS: Product[] = [
  {
    id: 'aurora',
    name: 'Aurora Brew 便携冷萃瓶',
    category: '食品饮料',
    price: 29.9,
    commission: 12,
    url: 'https://example.com/aurora-brew',
    detail: '磨砂玻璃瓶 + 金属盖，500ml，双层保冷 12 小时。主打通勤与户外场景的冷萃咖啡随行瓶。',
    visibility: 'private',
    status: 'active',
    genCount: 3,
    image: '/product-aurora.png',
  },
  {
    id: 'lumen',
    name: 'Lumen 桌面氛围灯',
    category: '家居',
    price: 49.0,
    commission: 15,
    url: 'https://example.com/lumen-lamp',
    detail: '极简金属桌面氛围灯，暖光 2700K，触控无极调光，USB-C 供电。',
    visibility: 'private',
    status: 'active',
    genCount: 5,
    image: '/product-lumen.png',
  },
  {
    id: 'trail',
    name: 'Trail 户外水壶',
    category: '户外',
    price: 19.9,
    commission: 10,
    url: 'https://example.com/trail-bottle',
    detail: '750ml 轻量 tritan 水壶，单手弹盖，耐摔，挂扣设计。',
    visibility: 'private',
    status: 'active',
    genCount: 0,
    hue: 200,
  },
  {
    id: 'storage',
    name: '旧款收纳箱',
    category: '家居',
    price: 12.0,
    commission: 8,
    url: 'https://example.com/storage-box',
    detail: '折叠式布艺收纳箱，旧款库存，已停止主推。',
    visibility: 'private',
    status: 'inactive',
    genCount: 1,
    hue: 280,
  },
]

/* ---------- 对标（F-LIB-3） ---------- */

export interface Benchmark {
  id: string
  account: string
  title: string
  videoUrl: string
  /** 时长（秒） */
  duration: number
  productId?: string
  sourceText: string
  thumb?: string
  visibility: Visibility
}

export const PRESET_BENCHMARKS: Benchmark[] = [
  {
    id: 'b-1',
    account: 'coffee.daily',
    title: '这杯冷萃凭什么卖 29 刀？我测了 7 天',
    videoUrl: 'https://video.example.com/watch/coldbrew-7days',
    duration: 32,
    productId: 'aurora',
    thumb: '/bench-01.png',
    visibility: 'private',
    sourceText:
      "HOOK (0-3s): I spent $29 on a coffee bottle. Here's why I'd do it again.\n\nPAIN (3-10s): If your iced coffee goes warm before your commute ends, you know the struggle. I tested 4 bottles this week.\n\nPROOF (10-24s): 12 hours later — still ice cold. Double-wall insulation, no condensation on my laptop bag, and the metal cap actually seals.\n\nCTA (24-32s): Link in bio. If you drink cold brew daily, this pays for itself in a month.",
  },
  {
    id: 'b-2',
    account: 'desk.unbox',
    title: '桌面好物开箱 Top5 · 第 3 个我愿称为氛围感天花板',
    videoUrl: 'https://video.example.com/watch/desk-top5',
    duration: 45,
    productId: 'lumen',
    thumb: '/bench-02.png',
    visibility: 'private',
    sourceText:
      'STRUCTURE NOTES:\n- 俯拍桌面开场，5 件好物依次入场（each 6-8s）\n- 第 3 件（氛围灯）给到最长时长 + 关灯对比镜头\n- 标题埋「Top5」数字钩子，封面留大字标题区\n- 转化点：评论区置顶清单，而非口播 CTA',
  },
  {
    id: 'b-3',
    account: 'trail.life',
    title: '晨间骑行 30km · 我的包里只带这三样',
    videoUrl: 'https://video.example.com/watch/morning-ride',
    duration: 28,
    thumb: '/bench-03.png',
    visibility: 'private',
    sourceText:
      '自然光 + 黄昏逆光为主，人物只做剪影/手部出镜。结构：出发前 checklist → 路上 2 个使用瞬间 → 山顶收尾举杯镜头。全程无口播，字幕卡 + BGM 卡点。',
  },
  {
    id: 'b-4',
    account: 'copy.lab',
    title: '清单体脚本文案笔记（纯文字稿）',
    videoUrl: 'https://video.example.com/watch/listicle-notes',
    duration: 40,
    visibility: 'private',
    sourceText:
      '清单体要点：\n1. 标题必须带数字（3/5/7 效果最好）\n2. 每条清单 = 结论前置 + 一句解释，≤ 15 字\n3. 第 1 条放最反常识的，留人\n4. 最后一条引导收藏，不说「关注我」',
  },
  {
    id: 'b-5',
    account: 'brand.story',
    title: '品牌故事结构笔记：从车库到百万用户',
    videoUrl: 'https://video.example.com/watch/garage-story',
    duration: 55,
    visibility: 'private',
    sourceText:
      '情绪向结构参考：具体触发瞬间（雨夜车库）→ 一个坚持的细节（手写前 100 张卡片）→ 用户关系的收束（读一封用户来信）。全程克制，无煽情 BGM，结尾 3 秒品牌字标定格。',
  },
]

/* ---------- 素材（F-LIB-4） ---------- */

export type AssetKind = 'image' | 'audio' | 'video'

export interface Asset {
  id: string
  kind: AssetKind
  name: string
  meta: string
  src?: string
  /** 无图占位色块 hue */
  hue?: number
  /** 音频/视频时长展示，如 0:30 */
  duration?: string
  /** BGM / SFX */
  badge?: 'BGM' | 'SFX'
  /** 视频实片 src（hover 播放） */
  videoSrc?: string
}

export const PRESET_ASSETS: Asset[] = [
  { id: 'a-img-1', kind: 'image', name: 'coldbrew-pour-alt.png', meta: 'PNG · 1.2 MB', src: '/shot-02-alt.png' },
  { id: 'a-img-2', kind: 'image', name: 'bottle-macro.png', meta: 'PNG · 1.1 MB', src: '/shot-07-alt.png' },
  { id: 'a-img-3', kind: 'image', name: 'product-aurora.png', meta: 'PNG · 0.8 MB', src: '/product-aurora.png' },
  { id: 'a-img-4', kind: 'image', name: 'product-lumen.png', meta: 'PNG · 0.7 MB', src: '/product-lumen.png' },
  { id: 'a-img-5', kind: 'image', name: 'commute-scene.png', meta: 'PNG · 1.4 MB', src: '/shot-04-alt.png' },
  { id: 'a-img-6', kind: 'image', name: 'brand-swatch-01.png', meta: 'PNG · 0.3 MB', hue: 258 },
  { id: 'a-img-7', kind: 'image', name: 'brand-swatch-02.png', meta: 'PNG · 0.3 MB', hue: 174 },
  { id: 'a-img-8', kind: 'image', name: 'texture-grain.png', meta: 'PNG · 0.5 MB', hue: 32 },
  { id: 'a-aud-1', kind: 'audio', name: 'morning-groove-bgm.mp3', meta: 'MP3 · 2.4 MB', duration: '0:30', badge: 'BGM' },
  { id: 'a-aud-2', kind: 'audio', name: 'lofi-chill-bgm.mp3', meta: 'MP3 · 2.1 MB', duration: '0:30', badge: 'BGM' },
  { id: 'a-aud-3', kind: 'audio', name: 'ice-drop-sfx.mp3', meta: 'MP3 · 0.4 MB', duration: '0:06', badge: 'SFX' },
  { id: 'a-vid-1', kind: 'video', name: 'desk-scene-loop.mp4', meta: 'MP4 · 3.8 MB', duration: '0:04', src: '/shot-05.png', videoSrc: '/clip-05.mp4' },
  { id: 'a-vid-2', kind: 'video', name: 'pour-loop.mp4', meta: 'MP4 · 4.2 MB', duration: '0:04', src: '/shot-03.png' },
]

/* ---------- 工具 ---------- */

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

let uid = 0
export function nextId(prefix: string): string {
  uid += 1
  return `${prefix}-${Date.now().toString(36)}-${uid}`
}
