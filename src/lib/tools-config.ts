/** 工具站 — 各工具配置（/app/tools） */

export type ToolDef = {
  slug: string;
  name: string;
  desc: string;
  api: string;
  icon: string;
  /** 主路径（一键出片） */
  primary?: boolean;
};

export const PRIMARY_TOOL_SLUG = "script-to-video";

export const APP_TOOLS: ToolDef[] = [
  {
    slug: "script-to-video",
    name: "一键出片",
    desc: "文案 → 可改分镜 → 配音字幕 → 合成 MP4",
    api: "/api/compose",
    icon: "🎥",
    primary: true,
  },
  {
    slug: "storyboard-generator",
    name: "分镜生成",
    desc: "单独生成可编辑分镜（可重试 / 上传 / 素材）",
    api: "/api/ai/storyboard",
    icon: "🎬",
  },
  {
    slug: "ai-video-script-writer",
    name: "AI 脚本写作",
    desc: "输入主题，生成短视频旁白脚本",
    api: "/api/ai/script",
    icon: "✍️",
  },
  {
    slug: "ai-voiceover",
    name: "AI 配音",
    desc: "文字转语音，支持多种音色",
    api: "/api/ai/tts",
    icon: "🎙️",
  },
  {
    slug: "subtitle-generator",
    name: "字幕生成",
    desc: "根据文本生成 SRT 字幕文件",
    api: "/api/ai/subtitles",
    icon: "💬",
  },
  {
    slug: "image-generator",
    name: "AI 生图",
    desc: "输入提示词，生成配图",
    api: "/api/ai/image",
    icon: "🖼️",
  },
];

export const PRIMARY_TOOL = APP_TOOLS.find((t) => t.primary)!;
export const SECONDARY_TOOLS = APP_TOOLS.filter((t) => !t.primary);

export const TOOL_BY_SLUG = Object.fromEntries(APP_TOOLS.map((t) => [t.slug, t]));

/** 营销 SEO slug → 工作台工具 slug */
export const MARKETING_TO_APP: Record<string, string> = {
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

/** CosyVoice 音色展示名（中文口播） */
export const VOICE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "alex", label: "沉稳男声 · Alex" },
  { id: "benjamin", label: "磁性男声 · Benjamin" },
  { id: "charles", label: "播音男声 · Charles" },
  { id: "david", label: "清晰男声 · David" },
  { id: "anna", label: "温柔女声 · Anna" },
  { id: "bella", label: "活泼女声 · Bella" },
  { id: "claire", label: "知性女声 · Claire" },
  { id: "diana", label: "亲和女声 · Diana" },
];
