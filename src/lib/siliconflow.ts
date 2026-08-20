/**
 * 硅基流动 API 客户端（服务端专用，key 从环境变量读取）。
 * Base: https://api.siliconflow.cn/v1
 */

const BASE_URL = "https://api.siliconflow.cn/v1";

function getApiKey(): string {
  const key = process.env.SILICONFLOW_API_KEY;
  if (!key) throw new Error("SILICONFLOW_API_KEY 未配置");
  return key;
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

export const SF_MODELS = {
  llm: process.env.LLM_MODEL || "deepseek-ai/DeepSeek-V3",
  image: process.env.IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell",
  tts: process.env.TTS_MODEL || "FunAudioLLM/CosyVoice2-0.5B",
} as const;

const ASPECT_SIZE: Record<string, string> = {
  "16:9": "1280x720",
  "9:16": "720x1280",
  "1:1": "1024x1024",
  "4:3": "1024x768",
};

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** LLM 对话（非流式） */
export async function sfChat(
  messages: ChatMessage[],
  opts?: { model?: string; temperature?: number; maxTokens?: number },
): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: opts?.model || SF_MODELS.llm,
      messages,
      temperature: opts?.temperature ?? 0.7,
      max_tokens: opts?.maxTokens ?? 4096,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`LLM 请求失败 (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM 返回空内容");
  return content;
}

/** 文生图，返回图片 URL */
export async function sfImage(
  prompt: string,
  opts?: { model?: string; aspect?: string; seed?: number },
): Promise<string> {
  const aspect = opts?.aspect || "16:9";
  const imageSize = ASPECT_SIZE[aspect] || ASPECT_SIZE["16:9"];
  const body: Record<string, unknown> = {
    model: opts?.model || SF_MODELS.image,
    prompt,
    image_size: imageSize,
    batch_size: 1,
  };
  if (opts?.seed !== undefined) body.seed = opts.seed;

  const res = await fetch(`${BASE_URL}/images/generations`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`生图失败 (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = (await res.json()) as { images?: Array<{ url?: string }> };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("生图结果缺少 URL");
  return url;
}

const COSYVOICE_SPEAKERS = new Set([
  "alex", "anna", "bella", "benjamin", "charles", "claire", "david", "diana",
]);

/** TTS 配音，返回 MP3 Buffer */
export async function sfTts(
  text: string,
  opts?: { model?: string; voice?: string; speed?: number },
): Promise<ArrayBuffer> {
  const model = opts?.model || SF_MODELS.tts;
  let speaker = (opts?.voice || "alex").trim();
  if (speaker.includes(":")) speaker = speaker.split(":").pop() || "alex";
  if (!COSYVOICE_SPEAKERS.has(speaker)) speaker = "alex";
  const voice = `${model}:${speaker}`;
  const speed = Math.min(2, Math.max(0.5, opts?.speed ?? 1));

  const res = await fetch(`${BASE_URL}/audio/speech`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: "mp3",
      speed,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`TTS 失败 (${res.status}): ${err.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}

/** 从 LLM 回复中提取 JSON（支持 markdown code block） */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text.trim();
  return JSON.parse(raw) as T;
}

export interface Shot {
  title: string;
  content: string;
  subtitle: string;
  imagePrompt: string;
  imageUrl: string | null;
  ratio: "16:9" | "9:16" | "1:1";
}

export const STORYBOARD_SYSTEM = `你是专业视频分镜师。根据用户文案生成 4-8 个镜头分镜。
严格输出 JSON，格式：
{
  "shots": [
    {
      "title": "镜头标题",
      "content": "旁白文案",
      "subtitle": "字幕文本",
      "imagePrompt": "英文图片提示词，描述画面",
      "imageUrl": null,
      "ratio": "16:9"
    }
  ]
}
只输出 JSON，不要其他文字。`;

export const SCRIPT_SYSTEM = `你是专业短视频脚本写手。根据用户提供的主题/方向，写一段适合 60-90 秒短视频的旁白脚本。
要求：口语化、有节奏、分 4-6 个自然段落。只输出脚本文本，不要标题和说明。`;
