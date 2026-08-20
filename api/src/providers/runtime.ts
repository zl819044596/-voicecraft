/**
 * Provider 运行时（Phase 3/4，机制 A/B + mock）。TS 移植 v2 验证实现：
 *
 *   mock   ：MOCK_PROVIDERS=true → 确定性伪造产物（LLM 按 mockKey 返回 schema
 *            合法 JSON；生图返回 mock-assets 占位 PNG；TTS 返回纯 Node 合成 WAV，
 *            可被 ffprobe 探测真实时长）。
 *   real   ：wingray（机制 A OpenAI 兼容：llm/image/tts/i2v 四通道）+
 *            通用 OpenAI 兼容 chat completions / audio/speech。
 *
 * R1 硬规则：key 仅在 Authorization 头中使用，永不进错误/日志/URL/响应。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WINGRAY_BASE_URL } from '@avs/shared';
import { config } from '../config.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Provider 解析结果形状
// ---------------------------------------------------------------------------

export interface ProviderRef {
  mode: 'mock' | 'real';
  key?: string;
  baseUrl?: string | null;
  providerName?: string | null;
  voice?: string | null;
  /** 流水线附加字段（非 runtime 必填） */
  entryName?: string | null;
  model?: string | null;
  /** managed 档 Key 池的 credential_id，用于调用后上报成功/失败。 */
  _credentialId?: string;
  /**
   * 生图模型是否支持结构化 negative_prompt 字段（PIPELINE_TASK_45 适配层）。
   * 默认 false/未声明 → 不传结构化字段，负面词注入正面 prompt 尾部兜底。
   * wingray 未确认支持 → 保持 false。
   */
  supportsNegativePrompt?: boolean;
}

/** 已确认支持结构化 negative_prompt 的生图模型集合（按 model 名匹配；当前为空 = 均不支持，
 *  后续确认某模型支持时在此追加，wingray 未确认不得加入）。 */
const NEGATIVE_PROMPT_CAPABLE_MODELS = new Set<string>([]);

/** 按 model 名判定生图能力：是否支持 negative_prompt 结构化字段。 */
export function negativePromptCapable(model?: string | null): boolean {
  return !!model && NEGATIVE_PROMPT_CAPABLE_MODELS.has(model);
}

export function mockEnabled(): boolean {
  return config.mockProviders;
}

// ---------------------------------------------------------------------------
// Wingray 常量与端点
// ---------------------------------------------------------------------------

const LLM_MODEL = 'DeepSeek-V4-Flash-0731';
const IMAGE_MODEL = 'Z-Image-Turbo';
const IMAGE_SIZE = '1024*1024';
const TTS_MODEL = 'cosyvoice-v2';
const TTS_VOICE = 'longjiqi';
const I2V_MODEL = 'Kling-V1-6-I2V';

const ASPECT_SIZE_MAP: Record<string, string> = {
  '1:1': '1024*1024',
  '16:9': '1820*1024',
  '9:16': '1024*1820',
  '4:3': '1024*768',
  '3:4': '768*1024',
};

// ---------------------------------------------------------------------------
// SiliconFlow 常量（PIPELINE_TASK_50：同步生图，OpenAI 兼容 images/generations）
// ---------------------------------------------------------------------------

const SILICONFLOW_IMAGE_MODEL = 'Tongyi-MAI/Z-Image-Turbo';
const SILICONFLOW_IMAGE_SIZE = '1024x1024';

/** aspect → SiliconFlow image_size（x 分隔；9:16 真竖版 720x1280，不再裁剪）。 */
const SILICONFLOW_ASPECT_SIZE_MAP: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1280x720',
  '9:16': '720x1280',
  '4:3': '1024x768',
  '3:4': '768x1024',
  // 文档未确认 4:5 → 先映射到接近的 3:4。
  '4:5': '768x1024',
};

const LLM_TIMEOUT_MS = 120_000;
const IMAGE_CREATE_TIMEOUT_MS = 90_000;
const IMAGE_POLL_TIMEOUT_MS = 120_000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 120_000;
const IMAGE_MAX_POLLS = 30;
const IMAGE_POLL_INTERVAL_MS = 4000;
const TTS_TIMEOUT_MS = 240_000;
const I2V_CREATE_TIMEOUT_MS = 30_000;
const I2V_POLL_TIMEOUT_MS = 30_000;
const I2V_DOWNLOAD_TIMEOUT_MS = 120_000;
const I2V_MAX_POLLS = 30;
const I2V_POLL_INTERVAL_MS = 20_000;

function authHeaders(key: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
}

// ---------------------------------------------------------------------------
// Mock：LLM 按 mockKey 返回 schema 合法 JSON；生图/TTS 见下。
// ---------------------------------------------------------------------------

function fullPrompt(messages: Array<{ role: string; content: string }>): string {
  return (messages || []).map((m) => m.content || '').join('\n');
}

function mockCompletion(
  messages: Array<{ role: string; content: string }>,
  json: boolean,
  mockKey: string | undefined,
): unknown {
  const prompt = fullPrompt(messages);
  let text: string;
  switch (mockKey) {
    case 's1': {
      const topic = (prompt.split('\n').pop() || '').trim().slice(0, 30) || 'AI 工具提升视频制作效率';
      text = JSON.stringify({
        topic,
        key_points: [
          'AI 能自动完成选题与文案初稿，大幅缩短构思时间',
          '分镜与逐镜生图让非设计人员也能产出分镜脚本',
          '配音、字幕与合成一键完成，降低后期门槛',
        ],
        target_duration: 60,
        audience: '内容创作者 / 中小企业市场团队',
      });
      break;
    }
    case 's2':
      text = JSON.stringify({
        script:
          '为什么你的视频制作总是又慢又累？选题、文案、分镜、生图、配音、字幕、合成，每一步都要手动完成，一个人往往要忙上一整天。\n' +
          '现在，AI 视频创作工作台把整条流水线串成了九个步骤。你只需要提出一个主题，系统就会自动生成选题卡片，写出分镜文案，为每一个镜头生成配图，再配上配音与字幕。\n' +
          '从逐镜生图到配音字幕，所有环节都能一键完成。你不用再切换七八个软件，也不用学习复杂的剪辑技巧。\n' +
          '最后，系统会把成片连同分镜、素材与字幕一起打包导出，交给你自由使用。\n' +
          '把时间留给创意，把重复交给 AI。',
      });
      break;
    case 's3':
      text = JSON.stringify({
        shots: [
          { index: 1, duration: 8, scene: '办公室中创作者对着屏幕皱眉思考选题', script: '为什么你的视频制作总是又慢又累？', voiceover: '为什么你的视频制作总是又慢又累？', prompt: 'A young creator in a modern office frowning at a laptop screen, cinematic lighting, shallow depth of field' },
          { index: 2, duration: 8, scene: '界面展示从选题到成片的九个步骤', script: '今天我们用九个步骤，让 AI 帮你完成整条流水线。', voiceover: '今天我们用九个步骤，让 AI 帮你完成整条流水线。', prompt: 'Close-up of a sleek dashboard showing a nine-step video pipeline, blue UI accents, clean tech aesthetic' },
          { index: 3, duration: 8, scene: '生图与配音过程飞速完成', script: '从逐镜生图到配音字幕，一键合成。', voiceover: '从逐镜生图到配音字幕，一键合成。', prompt: 'Abstract visualization of images and sound waves assembling into a video, vibrant blue and purple gradient' },
          { index: 4, duration: 8, scene: '创作者导出成片并微笑点头', script: '把时间留给创意，把重复交给 AI。', voiceover: '把时间留给创意，把重复交给 AI。', prompt: 'Satisfied creator reviewing a finished video on a large monitor, warm ambient lighting, positive mood' },
        ],
      });
      break;
    case 's9':
      text = JSON.stringify({
        passed: true,
        feedback:
          '全链路已完成：选题、文案、分镜、生图、配音、字幕、合成与导出均已生成。文案结构清晰，分镜与画面提示词一致，成片可直接交付。建议后续按目标观众微调配音语速与配乐。',
      });
      break;
    case 'title':
      text = JSON.stringify({ title: '把时间留给创意，把重复交给 AI' });
      break;
    case 'style':
      text = JSON.stringify({ style: '现代科技感、明亮、简洁' });
      break;
    case 'compliance':
      text = JSON.stringify({ passed: true, issues: [], message: '内容合规，无违规项' });
      break;
    default:
      text = JSON.stringify({ result: 'ok' });
  }
  if (json) {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// Mock：生图（轮换 mock-assets 占位 PNG）与 TTS（纯 Node WAV，ffprobe 可读）。
// ---------------------------------------------------------------------------

const MOCK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mock-assets');

function mockImageBuffer(variant?: number): Buffer {
  let files: string[] = [];
  try {
    files = fs.readdirSync(MOCK_DIR).filter((f) => f.endsWith('.png')).sort();
  } catch {
    files = [];
  }
  if (files.length === 0) throw new Error('no mock image assets found');
  const file = files[(Number.isInteger(variant) ? variant! : 0) % files.length];
  return fs.readFileSync(path.join(MOCK_DIR, file));
}

/** Mock TTS WAV — 22050Hz mono 16-bit，时长 clamp(0.8+chars*0.12, 1, 6)s。 */
export function mockWavBuffer(text?: string, volume?: number): Buffer {
  const sampleRate = 22050;
  const chars = String(text || '').length;
  const duration = Math.min(Math.max(0.8 + chars * 0.12, 1), 6);
  const n = Math.floor(sampleRate * duration);
  const freq = 440;
  const raw = Number(volume);
  const gain = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 50;
  const amplitude = 12000 * (gain / 50);

  const dataSize = n * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const fade = Math.floor(sampleRate * 0.05);
  for (let i = 0; i < n; i += 1) {
    let env = 1;
    if (i < fade) env = i / fade;
    if (i > n - fade) env = (n - i) / fade;
    const sample = Math.sin((2 * Math.PI * freq * i) / sampleRate) * env;
    buffer.writeInt16LE(Math.round(sample * amplitude), 44 + i * 2);
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// real：wingray 机制 A 四通道（OpenAI 兼容）。
// ---------------------------------------------------------------------------

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

async function wingrayChat(opts: {
  key: string;
  messages: Array<{ role: string; content: string }>;
  model?: string | null;
  json?: boolean;
  usageRef?: Partial<Usage>;
  baseUrl?: string | null;
  deadlineAt?: number;
}): Promise<unknown> {
  const body: Record<string, unknown> = {
    model: opts.model || LLM_MODEL,
    messages: opts.messages,
    thinking: { type: 'disabled' }, // 新增：禁用推理，长输出快 ~10×（平台 key 实测 64s→6s）
    max_tokens: 8192, // 长 JSON 输出（15+ 镜分镜）防截断 → 缺字段/400
  };
  if (opts.json) {
    body.response_format = { type: 'json_object' };
    // wingray 要求 prompt 必须含 "json" 字样（400001）——在最后一条消息末尾追加，避免用户配置替换 SYS 后缺词
    const msgs = body.messages as Array<{ role: string; content: string }>;
    if (msgs.length > 0 && !/json/i.test(String(msgs[msgs.length - 1].content ?? ''))) {
      msgs[msgs.length - 1] = {
        ...msgs[msgs.length - 1],
        content: `${msgs[msgs.length - 1].content}\n\n(Please output your answer as a single valid JSON object.)`,
      };
    }
  }

  const call = async () => {
    const res = await fetch(
      `${opts.baseUrl || WINGRAY_BASE_URL}/api/open-apis/v1/chat/completions`,
      {
        method: 'POST',
        headers: authHeaders(opts.key),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(
          opts.deadlineAt ? Math.max(1, Math.min(LLM_TIMEOUT_MS, opts.deadlineAt - Date.now())) : LLM_TIMEOUT_MS,
        ),
      },
    );
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(`wingray llm http ${res.status}: ${bodyText.slice(0, 300)}`);
    }
    const data = (await res.json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number }; choices?: Array<{ message?: { content?: string } }> };
    if (opts.usageRef && data.usage) {
      opts.usageRef.input_tokens = Number(data.usage.prompt_tokens) || 0;
      opts.usageRef.output_tokens = Number(data.usage.completion_tokens) || 0;
    }
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('wingray llm empty response');
    return text;
  };

  let text = await call();
  if (opts.json) {
    try {
      return JSON.parse(text);
    } catch {
      await sleep(500);
      text = await call();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('wingray llm json parse failed');
      }
    }
  }
  return text;
}

function mimeFromBuffer(buf: Buffer): string {
  if (buf.length > 3 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  return 'image/png';
}

async function wingrayImage(opts: {
  key: string;
  prompt: string;
  model?: string | null;
  baseUrl?: string | null;
  size?: string | null;
  /** 结构化负面词（适配层仅在 provider 声明 supportsNegativePrompt 时传入）。 */
  negativePrompt?: string;
  /** PIPELINE_TASK_47：固定 seed（同任务全镜头同值），透传 parameters.seed。 */
  seed?: number;
}): Promise<Buffer> {
  const size = String(opts.size || '');
  const nativeSize = ASPECT_SIZE_MAP[size] || (size.includes('*') ? size : null) || IMAGE_SIZE;

  // PIPELINE_TASK_47：seed 透传证据日志（同任务全镜头同值）。
  if (opts.seed !== undefined) console.warn(`[wingray] image create seed=${opts.seed}`);

  const create = async (sz: string) => {
    const parameters: Record<string, unknown> = { size: sz };
    if (opts.negativePrompt) parameters.negative_prompt = opts.negativePrompt;
    if (opts.seed !== undefined) parameters.seed = opts.seed;
    const res = await fetch(
      `${opts.baseUrl || WINGRAY_BASE_URL}/api/open-apis/projects/easyllms/imagegenerator/task`,
      {
        method: 'POST',
        headers: authHeaders(opts.key),
        body: JSON.stringify({
          model: opts.model || IMAGE_MODEL,
          input: { prompt: String(opts.prompt || '') },
          parameters,
        }),
        signal: AbortSignal.timeout(IMAGE_CREATE_TIMEOUT_MS),
      },
    );
    if (!res.ok) throw new Error(`wingray image create http ${res.status}`);
    const data = (await res.json()) as { output?: { taskId?: string } };
    const taskId = data?.output?.taskId;
    if (!taskId) throw new Error('wingray image create missing task id');
    return taskId;
  };

  let taskId: string;
  try {
    taskId = await create(nativeSize);
  } catch (err) {
    if (nativeSize !== IMAGE_SIZE) {
      console.warn(`[wingray] image size ${nativeSize} failed (${(err as Error).message}); retrying square ${IMAGE_SIZE}`);
      taskId = await create(IMAGE_SIZE);
    } else {
      throw err;
    }
  }

  for (let i = 0; i < IMAGE_MAX_POLLS; i += 1) {
    await sleep(IMAGE_POLL_INTERVAL_MS);
    let statusData: { output?: { taskStatus?: string; results?: Array<{ url?: string }> } };
    try {
      const s = await fetch(
        `${opts.baseUrl || WINGRAY_BASE_URL}/api/open-apis/projects/easyllms/imagegenerator/task/${taskId}`,
        { headers: authHeaders(opts.key), signal: AbortSignal.timeout(IMAGE_POLL_TIMEOUT_MS) },
      );
      statusData = (await s.json()) as typeof statusData;
    } catch {
      continue;
    }
    const status = statusData?.output?.taskStatus;
    if (status === 'SUCCEEDED') {
      const url = statusData?.output?.results?.[0]?.url;
      if (!url) throw new Error('wingray image result missing url');
      const img = await fetch(url, { signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS) });
      if (!img.ok) throw new Error(`wingray image download http ${img.status}`);
      return Buffer.from(await img.arrayBuffer());
    }
    if (status === 'FAILED' || status === 'FAILURE' || status === 'ERROR') {
      throw new Error('wingray image generation failed');
    }
  }
  throw new Error('wingray image generation timeout');
}

/**
 * SiliconFlow 同步生图（PIPELINE_TASK_50）：POST {base}/images/generations
 * → 同步响应 images[0].url → fetch 下载 → Buffer（无轮询）。
 * 尺寸用 x 分隔（9:16 → 720x1280 真竖版）；seed/negative_prompt 结构化透传。
 */
export async function siliconflowImage(opts: {
  key: string;
  prompt: string;
  model?: string | null;
  baseUrl?: string | null;
  size?: string | null;
  /** 结构化负面词 → body.negative_prompt。 */
  negativePrompt?: string;
  /** PIPELINE_TASK_47：固定 seed（同任务全镜头同值），透传 body.seed。 */
  seed?: number;
}): Promise<Buffer> {
  const size = String(opts.size || '');
  const nativeSize =
    SILICONFLOW_ASPECT_SIZE_MAP[size] ||
    (/^\d+\s*[xX*]\s*\d+$/.test(size) ? size.toLowerCase().replace(/\*/g, 'x') : null) ||
    SILICONFLOW_IMAGE_SIZE;

  // PIPELINE_TASK_50：seed 透传证据日志（同任务全镜头同值），不打 key。
  console.warn(
    `[siliconflow] image create model=${opts.model || SILICONFLOW_IMAGE_MODEL} size=${nativeSize}` +
      (opts.seed !== undefined ? ` seed=${opts.seed}` : ''),
  );

  const body: Record<string, unknown> = {
    model: opts.model || SILICONFLOW_IMAGE_MODEL,
    prompt: String(opts.prompt || ''),
    image_size: nativeSize,
    batch_size: 1,
  };
  if (opts.negativePrompt) body.negative_prompt = opts.negativePrompt;
  if (opts.seed !== undefined) body.seed = opts.seed;

  const base = (opts.baseUrl || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: authHeaders(opts.key),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(IMAGE_CREATE_TIMEOUT_MS),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`siliconflow image http ${res.status}: ${bodyText.slice(0, 200)}`);
  }
  let data: { images?: Array<{ url?: string }> };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new Error('siliconflow image json parse failed');
  }
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error('siliconflow image result missing url');
  const img = await fetch(url, { signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS) });
  if (!img.ok) throw new Error(`siliconflow image download http ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

async function wingrayI2V(opts: {
  key: string;
  imageBuffer: Buffer;
  text: string;
  model?: string | null;
  baseUrl?: string | null;
}): Promise<Buffer> {
  const b64 = opts.imageBuffer.toString('base64');
  const mime = mimeFromBuffer(opts.imageBuffer);
  const body = {
    model: opts.model || I2V_MODEL,
    content: [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` }, role: 'first_frame' },
      { type: 'text', text: String(opts.text || '') },
    ],
    parameters: { resolution: '720P', duration: 5 },
  };

  const createRes = await fetch(
    `${opts.baseUrl || WINGRAY_BASE_URL}/api/open-apis/projects/easyllms/videogenerator/generate`,
    {
      method: 'POST',
      headers: authHeaders(opts.key),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(I2V_CREATE_TIMEOUT_MS),
    },
  );
  if (!createRes.ok) throw new Error(`wingray i2v create http ${createRes.status}`);
  const createData = (await createRes.json()) as { result?: { task_id?: string } };
  const taskId = createData?.result?.task_id;
  if (!taskId) throw new Error('wingray i2v create missing task id');

  for (let i = 0; i < I2V_MAX_POLLS; i += 1) {
    await sleep(I2V_POLL_INTERVAL_MS);
    let data: {
      result?: { status?: string; content?: { video_url?: string } | Array<{ video_url?: string }>; video_url?: string };
      status?: string;
      video_url?: string;
    };
    try {
      const s = await fetch(
        `${opts.baseUrl || WINGRAY_BASE_URL}/api/open-apis/projects/easyllms/videogenerator/generate/${taskId}`,
        { headers: authHeaders(opts.key), signal: AbortSignal.timeout(I2V_POLL_TIMEOUT_MS) },
      );
      data = (await s.json()) as typeof data;
    } catch {
      continue;
    }
    const status = data?.result?.status || data?.status;
    if (status === 'succeeded' || status === 'SUCCEEDED') {
      const content = data?.result?.content;
      let url: string | null | undefined = undefined;
      if (typeof content === 'string') url = content;
      else if (Array.isArray(content)) url = content[0]?.video_url;
      else if (content) url = content.video_url;
      url = url || data?.result?.video_url || data?.video_url || null;
      if (!url) throw new Error('wingray i2v result missing video url');
      const clip = await fetch(url, { signal: AbortSignal.timeout(I2V_DOWNLOAD_TIMEOUT_MS) });
      if (!clip.ok) throw new Error(`wingray i2v download http ${clip.status}`);
      return Buffer.from(await clip.arrayBuffer());
    }
    if (status === 'failed' || status === 'FAILED' || status === 'ERROR') {
      throw new Error('wingray i2v generation failed');
    }
  }
  throw new Error('wingray i2v generation timeout');
}

async function wingrayTTS(opts: {
  key: string;
  text: string;
  model?: string | null;
  voice?: string | null;
  baseUrl?: string | null;
  speed?: number;
  volume?: number;
}): Promise<Buffer> {
  // wingray TTS 模型名归一化：平台展示名/仓库名 → wingray API model 名。
  // 实测（2026-08-19）：wingray 只认 cosyvoice-v2；传 FunAudioLLM/CosyVoice2-0.5B
  // 会 400 MODEL_NOT_SUPPORT。用户从平台看到的是展示名，这里兜底映射。
  const WINGRAY_TTS_MODEL_ALIASES: Record<string, string> = {
    'funaudiollm/cosyvoice2-0.5b': 'cosyvoice-v2',
    'cosyvoice2-0.5b': 'cosyvoice-v2',
    'cosyvoice-v2': 'cosyvoice-v2',
    'cosyvoice2': 'cosyvoice-v2',
    'cosyvoice-2': 'cosyvoice-v2',
    'cosyvoice': 'cosyvoice-v2',
  };
  const model = opts.model
    ? WINGRAY_TTS_MODEL_ALIASES[String(opts.model).trim().toLowerCase()] ?? String(opts.model)
    : TTS_MODEL;
  const rate = Math.min(2, Math.max(0.5, Number(opts.speed) || 1));
  const vol = Math.min(100, Math.max(0, Math.round(Number(opts.volume) || 50)));
  const url = `${opts.baseUrl || WINGRAY_BASE_URL}/api/open-apis/projects/easyllms/voice/synthesize-audio`;
  const payload = JSON.stringify({
    text: [String(opts.text || '')],
    synthesis_param: {
      model,
      voice: opts.voice || TTS_VOICE,
      format: 'MP3_16000HZ_MONO_128KBPS',
      volume: vol,
      speechRate: rate,
      pitchRate: 1,
    },
  });
  // 429 限流 / 5xx 瞬时故障 → 指数退避重试（同 siliconflowTTS）。
  const maxAttempts = 4;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(opts.key),
      body: payload,
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(`wingray tts error: ${data?.message || data?.error || 'request failed'}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('wingray tts returned empty audio');
      return buf;
    }
    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable || attempt === maxAttempts) {
      throw new Error(`wingray tts http ${res.status}`);
    }
    let delayMs = 1000 * 2 ** (attempt - 1);
    const retryAfter = res.headers.get('retry-after');
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (Number.isFinite(secs) && secs > 0) delayMs = Math.min(secs * 1000, 10000);
    }
    console.log(`[tts] wingray ${res.status} attempt ${attempt}/${maxAttempts} retry in ${delayMs}ms`);
    await new Promise((r) => setTimeout(r, delayMs));
    lastErr = new Error(`wingray tts http ${res.status}`);
  }
  throw lastErr ?? new Error('wingray tts failed');
}

/**
 * SiliconFlow TTS（OpenAI 兼容 /audio/speech，2026-08-19 适配）。
 * 用户线上配置：model=FunAudioLLM/CosyVoice2-0.5B @ https://api.siliconflow.cn/v1。
 * 文档实测：POST {base}/audio/speech，body {model, input, voice, response_format, speed}；
 * voice 格式 `<model>:<speaker>`，CosyVoice2-0.5B 预设 8 音色：
 * alex/anna/bella/benjamin/charles/claire/david/diana。
 * ⚠ 用户配置里 voice 可能填了无效值（如图片模型名）→ 归一化兜底回退默认 speaker。
 */
const SF_COSYVOICE_SPEAKERS = new Set([
  'alex', 'anna', 'bella', 'benjamin', 'charles', 'claire', 'david', 'diana',
]);
async function siliconflowTTS(opts: {
  key: string;
  text: string;
  model?: string | null;
  voice?: string | null;
  baseUrl?: string | null;
  speed?: number;
  volume?: number;
}): Promise<Buffer> {
  const base = (opts.baseUrl || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
  const model = opts.model || 'FunAudioLLM/CosyVoice2-0.5B';
  // voice 归一化：`<model>:<speaker>` 或裸 `<speaker>` → 统一 `<model>:<speaker>`；无效/空 → 默认 alex。
  const rawVoice = String(opts.voice || '').trim();
  let speaker = rawVoice.includes(':') ? String(rawVoice.split(':').pop() || '').trim() : rawVoice;
  if (!SF_COSYVOICE_SPEAKERS.has(speaker)) speaker = 'alex';
  const voice = `${model}:${speaker}`;
  const rate = Math.min(2, Math.max(0.5, Number(opts.speed) || 1));
  const payload = JSON.stringify({
    model,
    input: String(opts.text || ''),
    voice,
    response_format: 'mp3',
    speed: rate,
  });
  // 429 限流 / 5xx 瞬时故障 → 指数退避重试（SiliconFlow 限流通常秒级突发）。
  // 4 次尝试：1s / 2s / 4s / 8s（Retry-After 优先）。
  const maxAttempts = 4;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.key}`, 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('siliconflow tts returned empty audio');
      return buf;
    }
    const body = await res.text().catch(() => '');
    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable || attempt === maxAttempts) {
      throw new Error(`siliconflow tts http ${res.status}: ${String(body).slice(0, 200)}`);
    }
    let delayMs = 1000 * 2 ** (attempt - 1);
    const retryAfter = res.headers.get('retry-after');
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (Number.isFinite(secs) && secs > 0) delayMs = Math.min(secs * 1000, 10000);
    }
    console.log(`[tts] siliconflow ${res.status} attempt ${attempt}/${maxAttempts} retry in ${delayMs}ms`);
    await new Promise((r) => setTimeout(r, delayMs));
    lastErr = new Error(`siliconflow tts http ${res.status}: ${String(body).slice(0, 200)}`);
  }
  throw lastErr ?? new Error('siliconflow tts failed');
}

/**
 * 火山引擎豆包语音（seed-tts / 豆包 TTS 2.0）— 按用户提供的官方示例实现。
 * 用户示例（2026-08-13，唯一基准）：
 *   POST {base}/tts   （base 如 https://openspeech.bytedance.com/api/v3）
 *   Headers: X-Api-Key: {api_key}、X-Api-Resource-Id: {resource_id}、X-Api-Request-Id: {uuid}
 *   Body: { "user": {"uid": "..."}, "req_params": {"text": "...", "speaker": "...",
 *          "emotion": "calm", "audio_params": {"format": "mp3", "sample_rate": 24000}} }
 * ⚠ 实测（2026-08-13）：HTTP POST /api/v3/tts 返回 404 "Endpoint tts does not exist"；
 *   真实接口是 WebSocket 双向流式 wss://openspeech.bytedance.com/api/v3/tts/bidirection
 *   （官方 Python 示例 + 二进制 V1 协议验证通过：X-Api-Key/X-Api-Resource-Id 头、
 *    4 字节头 [ver|hdr, type|flags, serial|comp, res] + event(4B) + session + gzip(JSON)，
 *    音频帧 mtype=0b1011(SERVER_ACK)，MP3 24000Hz 实测可解码 5.59s）。
 * key 约定：`api_key` 或 `api_key:resource_id`（无 resource 时默认 seed-tts-2.0）。
 * voice = speaker 音色（如 zh_male_jieshuoxiaoming_uranus_bigtts）。
 */
async function bytedanceTTS(opts: {
  key: string;
  text: string;
  model?: string | null;
  voice?: string | null;
  baseUrl?: string | null;
  speed?: number;
  volume?: number;
}): Promise<Buffer> {
  const { randomUUID } = await import('node:crypto');
  const { gzipSync, gunzipSync } = await import('node:zlib');
  const WSImpl = (await import('ws')).default;
  const u32 = (n: number): Buffer => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  const [apiKey, resourceId] = opts.key.includes(':') ? opts.key.split(':') : [opts.key, ''];
  const speaker = opts.voice || 'zh_male_jieshuoxiaoming_uranus_bigtts';
  const resource = resourceId || 'seed-tts-2.0';
  const base = (opts.baseUrl || 'https://openspeech.bytedance.com/api/v3').replace(/\/+$/, '');
  const wsUrl = `${base.replace(/^http/, 'ws')}/tts/bidirection`;
  const sid = randomUUID();

  // ---- V1 二进制协议帧 ----
  const HEADER = Buffer.from([0x11, 0x14, 0x11, 0x00]); // ver1|hdr1, CLIENT_FULL_REQ|MSG_WITH_EVENT, JSON|GZIP, 0
  const frame = (event: number, sessionId: string | null, payloadObj: unknown): Buffer => {
    const payload = gzipSync(Buffer.from(JSON.stringify(payloadObj)));
    const parts: Buffer[] = [HEADER, u32(event)];
    if (sessionId) parts.push(u32(Buffer.byteLength(sessionId)), Buffer.from(sessionId));
    parts.push(u32(payload.length), payload);
    return Buffer.concat(parts);
  };
  const connFrame = (): Buffer => {
    const payload = gzipSync(Buffer.from('{}'));
    return Buffer.concat([HEADER, u32(1), u32(payload.length), payload]);
  };

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let audioBytes = 0;
    let settled = false;
    let lastAudioAt = Date.now();

    const finish = (err: Error | null, buf?: Buffer) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* noop */ }
      if (err) reject(err);
      else resolve(buf ?? Buffer.alloc(0));
    };

    const timer = setTimeout(() => finish(new Error(`bytedance tts timeout (${audioBytes}B)`)), TTS_TIMEOUT_MS);

    // PIPELINE_TASK_36：音频静默超 20s → 发 finish_session 请求服务端收尾，3s 后若
    // 仍未收尾（服务端不再发帧）则强制收尾。20s 远大于正常句间停顿（<5s），
    // 不会误杀长文本句间停顿；同时防止服务端合成卡死导致永久等待。
    // 注：此前 4s 静默强切会把长文本句间停顿（>4s）误判为结束导致句尾硬切。
    const idleTimer = setInterval(() => {
      if (settled) return;
      if (audioBytes > 0 && Date.now() - lastAudioAt > 20_000) {
        try { ws.send(frame(102, sid, {})); } catch { /* noop */ }
        clearInterval(idleTimer);
        setTimeout(() => finish(null, Buffer.concat(chunks)), 3000);
      }
    }, 1000);

    const ws = new WSImpl(wsUrl, {
      headers: {
        'X-Api-Key': apiKey,
        'X-Api-Resource-Id': resource,
        'X-Api-Connect-Id': randomUUID(),
        'X-Control-Require-Usage-Tokens-Return': '*',
      },
    });

    ws.on('open', () => {
      try {
        ws.send(connFrame());
        ws.send(frame(100, sid, {
          req_params: { speaker, audio_params: { format: 'mp3', sample_rate: 24000 } },
        }));
        ws.send(frame(200, sid, { req_params: { text: String(opts.text || '') } }));
      } catch (e) {
        finish(e instanceof Error ? e : new Error(String(e)));
      }
    });

    ws.on('message', (data: Buffer) => {
      const msg = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      if (msg.length < 4) return;
      const hs = msg[0] & 0x0f;
      const mtype = msg[1] >> 4;
      const flags = msg[1] & 0x0f;
      const comp = msg[2] & 0x0f;
      let payload = msg.subarray(hs * 4);
      let start = 0;
      if (mtype === 0b1111) {
        const plen = payload.length >= 8 ? payload.readUInt32BE(4) : 0;
        let d = payload.subarray(8, 8 + plen);
        if (comp === 1) { try { d = gunzipSync(d); } catch { /* noop */ } }
        finish(new Error(`bytedance tts error: ${d.toString('utf-8', 0, 300)}`));
        return;
      }
      if (flags & 1) start += 4;
      if (flags & 4) start += 4;
      if (payload.length < start + 4) return;
      const sidLen = payload.readInt32BE(start);
      start += 4 + Math.max(0, sidLen);
      if (payload.length < start + 4) return;
      const plen = payload.readUInt32BE(start);
      start += 4;
      let d = payload.subarray(start, start + plen);
      if (comp === 1) { try { d = gunzipSync(d); } catch { /* noop */ } }
      if (mtype === 0b1011) {
        // 音频帧（SERVER_ACK）→ MP3 数据
        if (d.length > 0) {
          chunks.push(d);
          audioBytes += d.length;
          lastAudioAt = Date.now();
        }
      } else if (mtype === 0b1001) {
        // 文本事件帧：JSON（MsgType/EventType/Payload）
        try {
          const ev = JSON.parse(d.toString());
          const evt = ev?.EventType || ev?.event || '';
          if (typeof evt === 'string' && /finished/i.test(evt)) {
            // SessionFinished / ConnectionFinished → 正常收尾
            try { ws.send(frame(102, sid, {})); } catch { /* noop */ }
            finish(null, Buffer.concat(chunks));
            return;
          }
        } catch {
          // 非 JSON 文本，忽略
        }
      }
    });

    ws.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));
    ws.on('close', () => {
      clearInterval(idleTimer);
      clearTimeout(timer);
      if (!settled) {
        if (audioBytes > 0) finish(null, Buffer.concat(chunks));
        else finish(new Error(`bytedance tts closed before audio (${audioBytes}B)`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// 通用 OpenAI 兼容通道（机制 A 兜底）
// ---------------------------------------------------------------------------

async function openAiCompatChat(opts: {
  key: string;
  baseUrl: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  json?: boolean;
  usageRef?: Partial<Usage>;
  deadlineAt?: number;
}): Promise<unknown> {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    thinking: { type: 'disabled' }, // 新增：禁用推理（deepseek 官网兼容参数）
  };
  if (opts.json) {
    body.response_format = { type: 'json_object' };
    // wingray 要求 prompt 必须含 "json" 字样（400001）——在最后一条消息末尾追加，避免用户配置替换 SYS 后缺词
    const msgs = body.messages as Array<{ role: string; content: string }>;
    if (msgs.length > 0 && !/json/i.test(String(msgs[msgs.length - 1].content ?? ''))) {
      msgs[msgs.length - 1] = {
        ...msgs[msgs.length - 1],
        content: `${msgs[msgs.length - 1].content}\n\n(Please output your answer as a single valid JSON object.)`,
      };
    }
  }
  const call = async () => {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(opts.key),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(
        opts.deadlineAt ? Math.max(1, Math.min(LLM_TIMEOUT_MS, opts.deadlineAt - Date.now())) : LLM_TIMEOUT_MS,
      ),
    });
    if (!res.ok) throw new Error(`llm http ${res.status}`);
    const data = (await res.json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number }; choices?: Array<{ message?: { content?: string } }> };
    if (opts.usageRef && data.usage) {
      opts.usageRef.input_tokens = Number(data.usage.prompt_tokens) || 0;
      opts.usageRef.output_tokens = Number(data.usage.completion_tokens) || 0;
    }
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('llm empty response');
    return text;
  };
  let text = await call();
  if (opts.json) {
    try {
      return JSON.parse(text);
    } catch {
      await sleep(500);
      text = await call();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('llm json parse failed');
      }
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// 对外入口
// ---------------------------------------------------------------------------

export interface ChatOpts {
  provider: ProviderRef;
  model?: string | null;
  messages: Array<{ role: string; content: string }>;
  json?: boolean;
  mockKey?: string;
  usageRef?: Partial<Usage>;
  /** 毫秒时间戳；超过则不再发起/重试，直接 throw（单步 LLM 硬性预算）。 */
  deadlineAt?: number;
}

const RETRIABLE = /timeout|abort|fetch failed|empty response|ECONNRESET|socket|http 5\d\d|502|503|504|temporary/i;

/** LLM 补全：mock（按 mockKey）或 real（wingray / OpenAI 兼容），重试 ≤3。 */
export async function chatCompletion(opts: ChatOpts): Promise<unknown> {
  const { provider } = opts;
  if (!provider || provider.mode === 'mock') {
    const out = mockCompletion(opts.messages, opts.json ?? false, opts.mockKey);
    if (opts.usageRef) {
      opts.usageRef.input_tokens = 1200;
      opts.usageRef.output_tokens = 800;
    }
    return out;
  }
  const key = provider.key!;
  const baseUrl = provider.baseUrl || WINGRAY_BASE_URL;
  const run = () =>
    provider.providerName === 'wingray' || (provider.baseUrl && !provider.baseUrl.includes('openai'))
      ? wingrayChat({ key, messages: opts.messages, model: opts.model, json: opts.json, usageRef: opts.usageRef, baseUrl, deadlineAt: opts.deadlineAt })
      : openAiCompatChat({ key, baseUrl, model: opts.model || LLM_MODEL, messages: opts.messages, json: opts.json, usageRef: opts.usageRef, deadlineAt: opts.deadlineAt });
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (opts.deadlineAt && Date.now() > opts.deadlineAt) {
      throw new Error('llm step budget exceeded');
    }
    try {
      return await run();
    } catch (err) {
      lastErr = err as Error;
      const msg = (err as Error).message || String(err);
      if (attempt >= 3 || !RETRIABLE.test(msg)) throw err;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

export interface ImageOpts {
  provider: ProviderRef;
  prompt: string;
  size?: string;
  variant?: number;
  model?: string | null;
  /** 结构化负面词（provider 支持 negative_prompt 时由适配层传入；未支持则注入正面 prompt 尾部）。 */
  negativePrompt?: string;
  /** PIPELINE_TASK_47：固定 seed（同任务全镜头同值），透传 wingray parameters.seed。 */
  seed?: number;
}

export async function generateImage(opts: ImageOpts): Promise<Buffer> {
  const { provider } = opts;
  if (!provider || provider.mode === 'mock') return mockImageBuffer(opts.variant);
  const key = provider.key!;
  const baseUrl = provider.baseUrl || WINGRAY_BASE_URL;
  return wingrayImage({
    key,
    prompt: opts.prompt,
    model: opts.model,
    baseUrl,
    size: opts.size,
    negativePrompt: opts.negativePrompt,
    seed: opts.seed,
  });
}

export interface TtsOpts {
  provider: ProviderRef;
  voice?: string | null;
  text: string;
  model?: string | null;
  speed?: number;
  volume?: number;
}

export async function synthesizeTts(opts: TtsOpts): Promise<Buffer> {
  const { provider } = opts;
  if (!provider || provider.mode === 'mock') return mockWavBuffer(opts.text, opts.volume);
  const key = provider.key!;
  const baseUrl = provider.baseUrl || WINGRAY_BASE_URL;
  // 火山引擎（seed-tts 等）→ 火山 v3 协议；SiliconFlow（CosyVoice2-0.5B 等）→ OpenAI 兼容
  // /audio/speech；其余（默认）→ wingray 协议。
  if (baseUrl.includes('bytedance.com')) {
    return bytedanceTTS({
      key,
      text: opts.text,
      model: opts.model,
      voice: opts.voice,
      baseUrl,
      speed: opts.speed,
      volume: opts.volume,
    });
  }
  if (baseUrl.includes('siliconflow.cn')) {
    return siliconflowTTS({
      key,
      text: opts.text,
      model: opts.model,
      voice: opts.voice,
      baseUrl,
      speed: opts.speed,
      volume: opts.volume,
    });
  }
  return wingrayTTS({ key, text: opts.text, model: opts.model, voice: opts.voice, baseUrl, speed: opts.speed, volume: opts.volume });
}

export interface I2VOpts {
  provider: ProviderRef;
  imageBuffer: Buffer;
  text: string;
  model?: string | null;
}

export async function generateI2V(opts: I2VOpts): Promise<Buffer> {
  const { provider } = opts;
  if (!provider || provider.mode === 'mock') {
    // mock：返回首帧 PNG 的伪造 clip 不可 ffprobe 为视频 → 抛 I2V_NOT_AVAILABLE 语义。
    throw new Error('I2V channel unavailable in mock mode');
  }
  const key = provider.key!;
  const baseUrl = provider.baseUrl || WINGRAY_BASE_URL;
  return wingrayI2V({ key, imageBuffer: opts.imageBuffer, text: opts.text, model: opts.model, baseUrl });
}

// ---------------------------------------------------------------------------
// /api/model-configs/test 连通性探针
// ---------------------------------------------------------------------------

export interface ProbeOpts {
  providerClass: string;
  baseUrl?: string | null;
  model?: string | null;
  key?: string;
  voice?: string | null;
}

export async function probe(opts: ProbeOpts): Promise<{ ok: boolean; latencyMs: number; note?: string }> {
  const started = Date.now();
  const base = (opts.baseUrl || WINGRAY_BASE_URL).replace(/\/+$/, '');
  const latencyMs = () => Date.now() - started;

  switch (opts.providerClass) {
    case 'llm': {
      const out = await chatCompletion({
        provider: opts.key ? { mode: 'real', key: opts.key, baseUrl: opts.baseUrl, providerName: 'wingray' } : { mode: 'mock' },
        model: opts.model,
        messages: [{ role: 'user', content: 'Say OK' }],
        json: false,
        mockKey: 'probe',
      });
      return { ok: true, latencyMs: latencyMs(), note: typeof out === 'string' ? out.slice(0, 40) : undefined };
    }
    case 'tts': {
      const buf = opts.key
        ? await synthesizeTts({ provider: { mode: 'real', key: opts.key, baseUrl: opts.baseUrl, providerName: 'wingray' }, model: opts.model, voice: opts.voice, text: 'Test.' })
        : mockWavBuffer('Test.');
      return { ok: buf.length > 0, latencyMs: latencyMs(), note: `audio ${buf.length} bytes` };
    }
    case 'image':
    case 'i2v': {
      if (!opts.key) return { ok: true, latencyMs: latencyMs(), note: 'mock image/i2v probe' };
      // 异步生成：只验证端点可达 + 鉴权（真实生成见流水线步骤）。
      const res = await fetch(`${base}/api/open-apis/v1/chat/completions`, {
        method: 'POST',
        headers: authHeaders(opts.key),
        body: JSON.stringify({ model: opts.model || LLM_MODEL, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
        signal: AbortSignal.timeout(15_000),
      });
      return { ok: res.status < 500, latencyMs: latencyMs(), note: `endpoint reachable (http ${res.status})` };
    }
    default:
      throw new Error(`unknown provider_class ${opts.providerClass}`);
  }
}
