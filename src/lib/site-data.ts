// SEO 落地页数据（工具 / 场景 / 程序化页）
// 对齐产品：可控分镜 → 一键出片 / 素材包导出（静帧口播，非生成式视频黑盒）

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://aivideostudio.app";

export const SITE_NAME = "AI Video Studio";

export const SITE_TAGLINE =
  "写文案、审分镜、一键出片或下载素材包。可控短视频工具站。";

/** 营销 slug → 工作台工具路径（登录后） */
export function workbenchPath(marketingSlug: string): string {
  const map: Record<string, string> = {
    "storyboard-generator": "storyboard-generator",
    "script-to-video": "script-to-video",
    "ai-video-script-writer": "ai-video-script-writer",
    "text-to-video": "script-to-video",
    "ai-voiceover": "ai-voiceover",
    "subtitle-generator": "subtitle-generator",
    "video-export-zip": "script-to-video",
    "byok-video-tools": "script-to-video",
    "image-generator": "image-generator",
  };
  const app = map[marketingSlug] ?? "script-to-video";
  return `/app/tools/${app}`;
}

export function loginToTool(marketingSlug: string): string {
  const next = workbenchPath(marketingSlug);
  return `/login?next=${encodeURIComponent(next)}`;
}

// ---------------------------------------------------------------------------
// 主流程步骤（HowTo JSON-LD + 工具页）
// ---------------------------------------------------------------------------

export type Step = {
  n: number;
  name: string;
  detail: string;
};

export const PIPELINE_STEPS: Step[] = [
  {
    n: 1,
    name: "写文案或一句话方向",
    detail:
      "直接粘贴旁白、参考文案二创，或用一句话方向生成脚本。适合竖版口播与短讲解。",
  },
  {
    n: 2,
    name: "生成可编辑分镜",
    detail:
      "AI 拆成 4–8 个镜头：标题、旁白、字幕、生图提示词。每一镜都可以改。",
  },
  {
    n: 3,
    name: "逐镜检查画面",
    detail:
      "图不好就重试生图、拉素材库，或自己上传。只动这一镜，不必整条重跑。",
  },
  {
    n: 4,
    name: "配音与字幕",
    detail: "按镜头生成中文 TTS 配音，字幕对齐旁白，可随文案一起改。",
  },
  {
    n: 5,
    name: "一键合成 MP4",
    detail: "FFmpeg 把静帧、配音、字幕合成成片。不用生成式视频模型，快且可控。",
  },
  {
    n: 6,
    name: "或下载素材包",
    detail:
      "不满意成片？下载 ZIP：每镜图片、voice.mp3、字幕与 storyboard.json，导入剪映/CapCut 自己剪。",
  },
];

// ---------------------------------------------------------------------------
// 工具页 /tools/[slug]
// ---------------------------------------------------------------------------

export type Tool = {
  slug: string;
  name: string;
  h1: string;
  title: string;
  description: string;
  keyword: string;
  cta: string;
  intro: string;
  body: string[];
  steps: number[];
  related: string[];
  highlight: string[];
  faq: { q: string; a: string }[];
};

export const TOOLS: Tool[] = [
  {
    slug: "script-to-video",
    name: "一键出片",
    h1: "文案一键出片 — 分镜可控",
    title: "文案一键出片｜AI 分镜可改 · 合成 MP4 或导出素材包",
    description:
      "把旁白变成竖版口播视频：生成可编辑分镜，逐镜换图，一键合成 MP4；不满意可下载图片+配音素材包自己剪。",
    keyword: "文案一键出片",
    cta: "开始一键出片",
    intro:
      "一键出片不是黑盒抽奖。你先审分镜、改旁白、换画面，再合成；也可以跳过成片，直接下载素材包进剪映精修。",
    body: [
      "支持直接文案、参考二创、或一句话方向生成脚本，默认竖版 9:16，适合抖音/短视频口播。",
      "每个镜头可重试生图、素材兜底或上传；配音按镜生成，改文案后旧配音会作废重配。",
      "成片走 FFmpeg 静帧合成；素材包含 image、voice.mp3、subtitle 与 storyboard.json。",
    ],
    steps: [1, 2, 3, 5, 6],
    related: [
      "storyboard-generator",
      "text-to-video",
      "ai-video-script-writer",
      "video-export-zip",
      "ai-voiceover",
    ],
    highlight: [
      "分镜可编辑，不是一次生成定终身",
      "MP4 成片 + 素材 ZIP 双出口",
      "静帧口播路线：快、便宜、可控",
    ],
    faq: [
      {
        q: "和 CapCut / InVideo 一键成片有什么区别？",
        a: "我们强调逐镜可控：图不好可重试、上传或拉素材；成片不满意还能下素材包自己剪，而不是只能整条重抽。",
      },
      {
        q: "是 AI 生成式视频（I2V）吗？",
        a: "不是。默认是静帧 + TTS + 字幕用 FFmpeg 合成，适合口播讲解。追求可控与成本，不追求生成式大片。",
      },
      {
        q: "要付费吗？",
        a: "演示登录即可用，每日有免费额度。付费方案上线前可先跑通主流程。",
      },
    ],
  },
  {
    slug: "storyboard-generator",
    name: "AI 分镜生成",
    h1: "AI 分镜生成 — 每一镜都能改",
    title: "AI 分镜生成器｜脚本转镜头表 · 可重试换图",
    description:
      "把脚本拆成可编辑分镜：标题、旁白、字幕、生图提示词。单镜重试、素材兜底或上传，再进入出片或导出素材包。",
    keyword: "AI 分镜生成",
    cta: "生成分镜",
    intro:
      "分镜是可控出片的核心。AI 先给出镜头表，你再决定哪一镜留下、重做或换素材——成本落在「改一镜」，而不是「整条重来」。",
    body: [
      "输入旁白或大纲，得到 4–8 个镜头，含画面提示词，可直接改文案与字幕。",
      "生图失败或效果差：重试 → 自动/手动素材 → 本地上传。",
      "分镜数据会进入 storyboard.json，随素材包一起导出。",
    ],
    steps: [1, 2, 3],
    related: ["script-to-video", "text-to-video", "image-generator", "video-export-zip"],
    highlight: [
      "镜头级编辑与重试",
      "素材库 / 上传兜底",
      "导出 JSON 方便协作",
    ],
    faq: [
      {
        q: "分镜生成后必须立刻合成吗？",
        a: "不必。可以只导出素材包，或先改几镜再出片。",
      },
      {
        q: "提示词是英文还是中文？",
        a: "生图提示词通常用英文更稳；旁白与字幕用中文即可。",
      },
      {
        q: "能改镜头数量吗？",
        a: "当前以 AI 生成的镜头表为主，可编辑每镜文案与画面；增删镜头会在后续版本加强。",
      },
    ],
  },
  {
    slug: "ai-video-script-writer",
    name: "AI 脚本写作",
    h1: "AI 短视频脚本写作",
    title: "AI 短视频脚本写作｜主题到旁白 · 对接分镜出片",
    description:
      "输入主题或方向，生成适合 60–90 秒口播的旁白脚本，可直接进入分镜与一键出片。",
    keyword: "AI 短视频脚本",
    cta: "写脚本",
    intro:
      "没有现成文案时，用一句话方向生成口语化旁白，再交给分镜与出片，避免从空白页开始。",
    body: [
      "可选语气：专业亲切、轻松幽默等，输出分段旁白便于拆镜。",
      "脚本可再二创改写，或粘贴参考文案让 AI 改写成口播。",
      "写完后一键进入「一键出片」主流程。",
    ],
    steps: [1, 2],
    related: ["script-to-video", "storyboard-generator", "text-to-video"],
    highlight: ["口语化分段旁白", "多种语气", "无缝进入出片"],
    faq: [
      {
        q: "脚本长度大概多久？",
        a: "默认按约 60–90 秒口播节奏写，可按需要再改。",
      },
      {
        q: "能用来写带货脚本吗？",
        a: "可以写讲解/卖点口播，请自行核对事实与合规要求。",
      },
      {
        q: "会保存我的文案吗？",
        a: "演示阶段以会话内操作为主；正式账号与云端项目上线后会另行说明。",
      },
    ],
  },
  {
    slug: "text-to-video",
    name: "文生视频（可控）",
    h1: "文生视频 — 可控分镜版",
    title: "文生视频 AI｜不是黑盒 · 分镜可改再出片",
    description:
      "从一段文字到短视频：脚本、分镜、配图、配音、字幕，逐步确认。支持竖版/横版，可合成 MP4 或导出素材包。",
    keyword: "文生视频",
    cta: "从文字开始",
    intro:
      "这里的「文生视频」指可控工作流，不是一次 Prompt 赌一条生成式大片。你在分镜阶段就能改，再决定出片或自己剪。",
    body: [
      "文字可以是大纲、草稿或完整旁白；系统会帮你结构化成镜头。",
      "比例支持 9:16 / 16:9 / 1:1，默认竖版口播。",
      "与一键出片同一主流程，SEO 入口不同、产品能力相同。",
    ],
    steps: [1, 2, 3, 4, 5, 6],
    related: ["script-to-video", "storyboard-generator", "ai-video-script-writer", "video-export-zip"],
    highlight: ["逐步确认，少浪费额度", "竖版优先", "双出口：成片 / 素材包"],
    faq: [
      {
        q: "和 Runway / 可灵一类生成式视频比呢？",
        a: "品类不同：我们做可控静帧口播成片与素材包；生成式更炫但更贵、更慢、更难改单镜。",
      },
      {
        q: "能不能出电影感动态镜头？",
        a: "当前主打静帧口播。动态 I2V 不是默认路径。",
      },
      {
        q: "免费吗？",
        a: "有每日免费额度；额度用尽后需等次日或后续付费。",
      },
    ],
  },
  {
    slug: "ai-voiceover",
    name: "AI 配音",
    h1: "AI 配音（中文 TTS）",
    title: "AI 配音生成｜中文口播 TTS · 多音色",
    description:
      "文字转语音，多音色中文口播。可在一键出片里按镜配音，也可单独试听生成。",
    keyword: "AI 配音",
    cta: "生成配音",
    intro:
      "配音按镜头旁白生成，保证口播与字幕对齐。成片与素材包里的 voice.mp3 都来自这一步。",
    body: [
      "提供多种男女声标签，适合讲解、资讯与产品介绍。",
      "改旁白后需重新配音；导出素材包前会自动补齐缺失配音。",
      "不提供声音克隆，降低滥用风险。",
    ],
    steps: [4],
    related: ["script-to-video", "subtitle-generator", "video-export-zip"],
    highlight: ["中文多音色", "按镜对齐", "素材包含 MP3"],
    faq: [
      {
        q: "支持方言吗？",
        a: "以普通话为主；具体音色能力随模型更新。",
      },
      {
        q: "能克隆我的声音吗？",
        a: "目前不提供克隆，仅预设 TTS 音色。",
      },
      {
        q: "配音单独收费吗？",
        a: "计入每日免费额度中的配音消耗。",
      },
    ],
  },
  {
    slug: "subtitle-generator",
    name: "字幕生成",
    h1: "字幕生成（SRT / 烧录）",
    title: "AI 字幕生成｜对齐旁白 · 可导出或烧录",
    description:
      "根据旁白生成字幕文案；出片时可烧录进 MP4，素材包内提供每镜 subtitle.txt。",
    keyword: "字幕生成",
    cta: "生成字幕",
    intro:
      "字幕跟旁白走，避免「画面一个字、嘴里另一句」。可在成片里烧录，也可只带走文案自己排版。",
    body: [
      "一键出片会按镜头写入字幕；也可单独用字幕工具生成 SRT。",
      "素材包每镜含 subtitle.txt，方便剪映手动加字幕样式。",
      "后续会加强样式与位置选项。",
    ],
    steps: [4, 5, 6],
    related: ["ai-voiceover", "script-to-video", "video-export-zip"],
    highlight: ["对齐旁白", "烧录或导出", "适合无声刷场景"],
    faq: [
      {
        q: "是语音识别出字幕吗？",
        a: "当前主要根据旁白文案生成，保证与脚本一致。",
      },
      {
        q: "能改字体颜色吗？",
        a: "成片烧录样式较固定；要精细排版请下素材包到剪映调整。",
      },
      {
        q: "支持双语字幕吗？",
        a: "当前单语；可自行在导出文案上翻译后导入剪辑软件。",
      },
    ],
  },
  {
    slug: "video-export-zip",
    name: "素材包导出",
    h1: "下载素材包 — 自己剪也行",
    title: "视频素材包导出｜图片+配音+字幕 ZIP · 导入剪映",
    description:
      "一键导出分镜素材包：每镜图片、配音 MP3、字幕与 storyboard.json。成片不满意就自己剪。",
    keyword: "视频素材包导出",
    cta: "下载素材包",
    intro:
      "可控出片的第二出口：不是只能接受平台成片。ZIP 打开就能进剪映 / CapCut / Premiere。",
    body: [
      "目录含 README、script.txt、storyboard.json，以及 shots/01/image、voice.mp3、subtitle.txt。",
      "审片阶段即可导出，不必先合成 MP4。",
      "已生成的配音会复用，减少重复扣额度。",
    ],
    steps: [2, 3, 4, 6],
    related: ["script-to-video", "storyboard-generator", "ai-voiceover", "subtitle-generator"],
    highlight: ["含图片与配音", "剪映友好", "审片即可导出"],
    faq: [
      {
        q: "ZIP 里有图片吗？",
        a: "有。每个镜头文件夹都有 image.png/jpg/webp。",
      },
      {
        q: "有没有成品 MP4？",
        a: "素材包聚焦可剪素材；成品请用「确认出片」下载 MP4。",
      },
      {
        q: "能再导入回网站继续改吗？",
        a: "当前以导出为主；storyboard.json 便于人工对照，云端再导入后续迭代。",
      },
    ],
  },
  {
    slug: "image-generator",
    name: "AI 生图",
    h1: "AI 配图生成",
    title: "AI 生图｜短视频分镜配图 · 可重试",
    description:
      "按提示词生成短视频配图，支持竖版/横版。可在分镜流程中单镜重试，或单独使用生图工具。",
    keyword: "AI 生图 短视频",
    cta: "去生图",
    intro:
      "画面不满意时，不必整条视频重来——改提示词或重试这一镜即可。",
    body: [
      "默认竖版 9:16，也可横版与方形。",
      "与分镜、出片共用同一生图能力。",
      "多次不理想可改用素材库或上传。",
    ],
    steps: [3],
    related: ["storyboard-generator", "script-to-video", "text-to-video"],
    highlight: ["比例可选", "单镜重试", "素材兜底"],
    faq: [
      {
        q: "提示词怎么写更好？",
        a: "建议英文画面描述 + 镜头类型/光线；旁白仍用中文。",
      },
      {
        q: "能保持人物一致吗？",
        a: "静帧生成无强角色锁定；产品图建议上传实拍。",
      },
      {
        q: "商用安全吗？",
        a: "请遵守模型与素材库许可；上传素材请确保你有权使用。",
      },
    ],
  },
  {
    slug: "byok-video-tools",
    name: "免费额度工具站",
    h1: "免费额度 — 先跑通再付费",
    title: "免费 AI 视频工具｜每日额度 · 演示登录即用",
    description:
      "演示登录进入工作台，每日免费额度覆盖脚本、分镜、生图、配音与合成。先验证流程，付费稍后上线。",
    keyword: "免费 AI 视频工具",
    cta: "演示登录",
    intro:
      "不用先绑卡。演示账号即可体验一键出片与素材包；额度在顶栏可见，用尽次日重置。",
    body: [
      "额度按操作消耗：脚本、分镜、生图、配音、合成权重不同。",
      "Google 登录与付费将在上线后接入，当前以演示会话验证产品。",
      "主推可控口播，不承诺无限免费用生成式视频。",
    ],
    steps: [1, 5, 6],
    related: ["script-to-video", "text-to-video", "video-export-zip"],
    highlight: ["演示登录", "额度可见", "主路径一键出片"],
    faq: [
      {
        q: "还是 BYOK 自带 Key 吗？",
        a: "当前由平台调用模型，用免费额度计量；不是让你填一堆第三方 Key。",
      },
      {
        q: "额度不够怎么办？",
        a: "等 UTC 日期重置，或等待付费方案上线。",
      },
      {
        q: "数据安全吗？",
        a: "请勿上传机密内容到演示环境；正式隐私政策见 /privacy。",
      },
    ],
  },
];

export const TOOL_BY_SLUG: Record<string, Tool> = Object.fromEntries(
  TOOLS.map((t) => [t.slug, t]),
);

// ---------------------------------------------------------------------------
// 场景页 /scenarios/[slug]
// ---------------------------------------------------------------------------

export type Scenario = {
  slug: string;
  name: string;
  h1: string;
  title: string;
  description: string;
  keyword: string;
  cta: string;
  intro: string;
  body: string[];
  toolSlugs: string[];
  audience: string;
  pains: { h3: string; p: string }[];
  workflow: { h3: string; tag: string; p: string }[];
};

export const SCENARIOS: Scenario[] = [
  {
    slug: "client-video-delivery",
    name: "接单交付",
    h1: "接单短视频 — 改一镜就够",
    title: "接单短视频交付｜客户改意见只动一镜 · 可交素材包",
    description:
      "面向接单创作者：分镜可审、单镜可改，成片或素材包交付，避免「改一句重做整条」。",
    keyword: "接单短视频 AI",
    cta: "开始接单出片",
    intro:
      "客户最爱改第三镜。可控分镜让你只重做那一镜；需要对方自己精修时，直接交 ZIP 素材包。",
    body: [
      "从客户文案或大纲进入一键出片，先审分镜再渲染，减少无效消耗。",
      "交付可选：MP4 成片，或含图+配音的素材包，方便对方在剪映收尾。",
      "话术清晰：静帧口播，适合讲解、口播带货草案，而非电影级生成视频。",
    ],
    toolSlugs: ["script-to-video", "storyboard-generator", "video-export-zip", "ai-voiceover"],
    audience: "接单剪辑、自媒体代运营、自由职业者",
    pains: [
      {
        h3: "改一处等于重做",
        p: "黑盒成片无法定点修改，反馈轮次把利润吃光。",
      },
      {
        h3: "客户要源文件",
        p: "只有一条 MP4 时，对方无法自己改字幕样式或 BGM。",
      },
      {
        h3: "工具太重",
        p: "完整 NLE 学习成本高，赶稿需要「先出能交的一版」。",
      },
    ],
    workflow: [
      {
        h3: "收文案 / 大纲",
        tag: "· 写",
        p: "粘贴客户稿或一句话卖点，生成口播脚本。",
      },
      {
        h3: "一起过镜头表",
        tag: "· 审",
        p: "分享分镜预览思路：哪镜换产品图、哪镜重试。",
      },
      {
        h3: "出片或交素材",
        tag: "· 交",
        p: "确认出片下载 MP4，或导出 ZIP 让客户在剪映收尾。",
      },
    ],
  },
  {
    slug: "youtube-script-to-video",
    name: "口播讲解",
    h1: "口播讲解视频 — 脚本到成片",
    title: "口播讲解视频｜脚本转分镜 · 配音字幕合成",
    description:
      "知识口播、教程讲解：脚本 → 分镜 → 配音字幕 → MP4 或素材包，适合横版/竖版讲解。",
    keyword: "口播视频 AI",
    cta: "做口播视频",
    intro:
      "讲解类内容核心是「说清楚」。可控分镜保证画面跟着旁白走，字幕对齐，少翻车。",
    body: [
      "从完整脚本进入，生成镜头表后逐段核对要点。",
      "可横版 16:9 做长讲解封面流，或竖版发短视频平台。",
      "导出素材包便于后期加板书、录屏与 BGM。",
    ],
    toolSlugs: ["script-to-video", "ai-video-script-writer", "ai-voiceover", "subtitle-generator"],
    audience: "知识博主、培训讲师、教程作者",
    pains: [
      { h3: "录制成本高", p: "出镜或请配音费时，改稿又要重录。" },
      { h3: "画面空洞", p: "纯字幕滚动留不住人，需要分镜配图。" },
      { h3: "平台格式碎", p: "同一内容要切竖版再发一遍。" },
    ],
    workflow: [
      { h3: "定脚本", tag: "· 写", p: "粘贴讲稿或用 AI 扩成口播。" },
      { h3: "配图分镜", tag: "· 审", p: "要点镜配示意图，难点镜可上传截图。" },
      { h3: "合成发布", tag: "· 出", p: "出片发平台，或下素材包加录屏。" },
    ],
  },
  {
    slug: "social-ads-video",
    name: "社媒广告",
    h1: "竖版广告口播 — 快速试钩子",
    title: "竖版短视频广告｜9:16 口播 · 可改钩子镜",
    description:
      "做 9:16 广告口播：快速换第一镜钩子、字幕与配音，适合 A/B 测试前的草稿产能。",
    keyword: "竖版广告 AI 视频",
    cta: "做竖版广告草稿",
    intro:
      "广告靠试。分镜可控让你只换钩子镜，而不是每次整条重生成。",
    body: [
      "默认竖版；前 3 秒对应第一镜，单独重试或上传产品图。",
      "字幕适合无声浏览；素材包可交给设计加包装。",
      "定位为高效草稿，不替代成片精修与投放素材规范审核。",
    ],
    toolSlugs: ["text-to-video", "script-to-video", "storyboard-generator", "video-export-zip"],
    audience: "投放、电商、代运营",
    pains: [
      { h3: "钩子要多版", p: "一条生成视频很难只改开头。" },
      { h3: "品牌图进不去", p: "需要上传实拍/主图而不是纯 AI 图。" },
      { h3: "要源文件", p: "设计要分层素材继续做。" },
    ],
    workflow: [
      { h3: "写卖点口播", tag: "· 写", p: "一句话方向或粘贴广告文案。" },
      { h3: "死磕第一镜", tag: "· 审", p: "重试/上传直到钩子过关。" },
      { h3: "出片或交设计", tag: "· 测", p: "MP4 试投，或 ZIP 给设计精修。" },
    ],
  },
  {
    slug: "product-demo-video",
    name: "产品讲解",
    h1: "产品讲解视频 — 可换实拍图",
    title: "产品讲解视频｜分镜口播 · 上传截图/实拍",
    description:
      "产品功能讲解：脚本分镜后，把 AI 图换成实拍或截图，再配音出片或导出素材。",
    keyword: "产品讲解视频 AI",
    cta: "做产品讲解",
    intro:
      "产品视频怕画面假。流程允许单镜上传真实界面/实物，旁白与字幕仍自动对齐。",
    body: [
      "先用 AI 铺完整分镜骨架，再替换关键镜为实拍。",
      "适合 SaaS 功能介绍、硬件开箱讲解草案。",
      "素材包方便文档/市场团队继续改。",
    ],
    toolSlugs: ["script-to-video", "storyboard-generator", "image-generator", "ai-voiceover"],
    audience: "创始人、市场、产品运营",
    pains: [
      { h3: "纯 AI 不像自家产品", p: "必须能上传真实画面。" },
      { h3: "版本迭代", p: "界面一改就要局部更新，不能整条重做。" },
      { h3: "多渠道裁切", p: "同一讲解要竖版短剪。" },
    ],
    workflow: [
      { h3: "写功能口播", tag: "· 写", p: "按功能点分段。" },
      { h3: "换真实画面", tag: "· 审", p: "关键镜上传截图/实拍。" },
      { h3: "发布或内部分享", tag: "· 出", p: "MP4 或素材包。" },
    ],
  },
  {
    slug: "video-localization",
    name: "口播重配",
    h1: "改旁白重配 — 画面可留",
    title: "视频口播重配｜改文案重生配音字幕 · 画面可复用",
    description:
      "同一组分镜画面，替换旁白与配音字幕，快速出多版口播或修正表述。",
    keyword: "视频配音重做",
    cta: "改旁白重出",
    intro:
      "画面已经过关、只要改说法时：编辑镜头旁白，清掉旧配音，重新出片或导出。",
    body: [
      "改 content 后该镜配音缓存会失效，导出/合成时自动重配。",
      "适合措辞合规修改、活动换期、轻微本地化（仍以中文为主）。",
      "需要精细多语言时，建议下素材包后在专业流程处理。",
    ],
    toolSlugs: ["ai-voiceover", "subtitle-generator", "script-to-video", "video-export-zip"],
    audience: "运营、翻译协作、内容复用团队",
    pains: [
      { h3: "只改一句也要重渲整条", p: "黑盒工具无法局部更新音频。" },
      { h3: "字幕不同步", p: "改了词字幕还停在旧句。" },
      { h3: "要留画面资产", p: "已审过的图不该丢掉。" },
    ],
    workflow: [
      { h3: "打开分镜", tag: "· 改", p: "只改需要的旁白句。" },
      { h3: "重配音", tag: "· 听", p: "导出或合成时自动补齐。" },
      { h3: "再出一版", tag: "· 出", p: "新 MP4 或新素材包。" },
    ],
  },
];

export const SCENARIO_BY_SLUG: Record<string, Scenario> = Object.fromEntries(
  SCENARIOS.map((s) => [s.slug, s]),
);

// ---------------------------------------------------------------------------
// 程序化 SEO：[verb]-[content-type]（保留英文 URL，正文中文对齐产品）
// ---------------------------------------------------------------------------

export const PROGRAMMATIC_VERBS = [
  "make",
  "create",
  "convert",
  "generate",
  "edit",
  "export",
] as const;

export type ProgrammaticContentType = {
  slug: string;
  labelZh: string;
  titleNoun: string;
  motherTool: string;
  formats: string[];
};

export const PROGRAMMATIC_CONTENT_TYPES: ProgrammaticContentType[] = [
  {
    slug: "video",
    labelZh: "短视频",
    titleNoun: "Video",
    motherTool: "text-to-video",
    formats: ["9:16", "16:9", "1:1"],
  },
  {
    slug: "storyboard",
    labelZh: "分镜",
    titleNoun: "Storyboard",
    motherTool: "storyboard-generator",
    formats: ["9:16", "16:9", "1:1"],
  },
  {
    slug: "youtube-video",
    labelZh: "讲解视频",
    titleNoun: "YouTube Video",
    motherTool: "script-to-video",
    formats: ["16:9", "9:16"],
  },
  {
    slug: "reels",
    labelZh: "竖版 Reels",
    titleNoun: "Reels",
    motherTool: "text-to-video",
    formats: ["9:16"],
  },
  {
    slug: "shorts",
    labelZh: "短视频 Shorts",
    titleNoun: "Shorts",
    motherTool: "text-to-video",
    formats: ["9:16"],
  },
  {
    slug: "tiktok-video",
    labelZh: "抖音/TikTok 视频",
    titleNoun: "TikTok Video",
    motherTool: "text-to-video",
    formats: ["9:16"],
  },
];

const VERB_ZH: Record<string, { gerund: string; action: string }> = {
  make: {
    gerund: "制作",
    action: "从想法到可发布成片：先写清旁白，再审分镜，最后合成或导出素材。",
  },
  create: {
    gerund: "创建",
    action: "创建脚本、镜头、配图与配音等资产，而不是套一层无法改的模板。",
  },
  convert: {
    gerund: "转换",
    action: "把已有文案/大纲转换成镜头表与口播视频，内容对齐、可逐步确认。",
  },
  generate: {
    gerund: "生成",
    action: "生成分镜、画面、配音与字幕，并在合成前保留编辑权。",
  },
  edit: {
    gerund: "编辑",
    action: "按镜头修改旁白与画面，再局部重配音或重出片，避免整条重做。",
  },
  export: {
    gerund: "导出",
    action: "导出 MP4 成片，或导出含图片与配音的 ZIP 素材包到剪映继续剪。",
  },
};

export type Programmatic = {
  slug: string;
  verb: string;
  content: string;
  h1: string;
  title: string;
  description: string;
  keyword: string;
  cta: string;
  intro: string;
  steps: string[];
  faq: { q: string; a: string }[];
  motherTool: string;
};

export const PROGRAMMATIC_PAGES: Programmatic[] = PROGRAMMATIC_VERBS.flatMap(
  (verb) =>
    PROGRAMMATIC_CONTENT_TYPES.map((ct) => {
      const mother = TOOL_BY_SLUG[ct.motherTool]!;
      const vz = VERB_ZH[verb]!;
      const fmt = ct.formats.join(" / ");
      const h1 = `${vz.gerund}${ct.labelZh} — 可控 AI 流程`;
      const faq = [
        {
          q: `如何${vz.gerund}${ct.labelZh}？`,
          a: `进入工作台：写文案 → 生成分镜 → 逐镜检查 → 确认出片或下载素材包。每一步都可回头改。`,
        },
        {
          q: `${vz.gerund}${ct.labelZh}免费吗？`,
          a: `演示登录可用，每日有免费额度。额度用尽后次日重置；付费方案将随后上线。`,
        },
        {
          q: `支持哪些画幅？`,
          a: `常用 ${fmt}。默认竖版 9:16，适合短视频平台。`,
        },
      ];
      const steps = [
        "输入文案、参考稿或一句话方向。",
        "生成可编辑分镜（旁白、字幕、画面提示）。",
        "逐镜检查：重试生图 / 素材 / 上传。",
        "按镜生成配音，对齐字幕。",
        "确认出片得到 MP4，或下载素材包到剪映。",
      ];
      return {
        slug: `${verb}-${ct.slug}`,
        verb,
        content: ct.slug,
        h1,
        title: `${vz.gerund}${ct.labelZh}｜${mother.name} · AI Video Studio`,
        description: `${vz.gerund}${ct.labelZh}：可控分镜、可改单镜，合成 MP4 或导出图片+配音素材包。每日免费额度。`,
        keyword: `${vz.gerund}${ct.labelZh}`,
        cta: `去${vz.gerund}`,
        intro: `${vz.action} 面向口播与讲解场景，强调可控，而不是黑盒生成式大片。`,
        steps,
        faq,
        motherTool: ct.motherTool,
      };
    }),
);

export const PROGRAMMATIC_BY_SLUG: Record<string, Programmatic> =
  Object.fromEntries(PROGRAMMATIC_PAGES.map((p) => [p.slug, p]));
