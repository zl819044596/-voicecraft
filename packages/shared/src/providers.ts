/**
 * Provider catalog (05-模型接入清单 / C12). Two mechanisms:
 *   A — OpenAI-compatible endpoint (base_url + model + key)
 *   B — platform preset adapter (non-OpenAI providers: Kling/fal/ElevenLabs...)
 * Managed tier may only use providers whose ToS allow building commercial
 * products (R7). Midjourney etc. (no official API) are unsupported.
 */

import type { ProviderClass } from './types.js';

export type Mechanism = 'A' | 'B';

/** Canonical provider classes (C4): llm / image / tts / i2v. */
export const PROVIDER_CLASSES: ProviderClass[] = ['llm', 'image', 'tts', 'i2v'];

export interface ProviderPreset {
  id: string;
  providerClass: ProviderClass;
  name: string;
  provider: string;
  model: string;
  mechanism: Mechanism;
  baseUrl: string | null; // mechanism A default endpoint
  /** voices for TTS, grouped by content language (C13). */
  voices?: Record<string, string[]>;
  languages?: string[];
  commercial: boolean;
  note?: string;
}

/** Wingray — the platform's current managed/BYOK provider (OpenAI-compatible). */
export const WINGRAY_BASE_URL = 'https://maas.wing-ray.cn';

export const PRESETS: ProviderPreset[] = [
  {
    id: 'wingray-llm',
    providerClass: 'llm',
    name: 'Wingray · DeepSeek V4 Flash',
    provider: 'wingray',
    model: 'DeepSeek-V4-Flash-0731',
    mechanism: 'A',
    baseUrl: WINGRAY_BASE_URL,
    languages: ['en', 'zh'],
    commercial: true,
  },
  {
    id: 'wingray-image',
    providerClass: 'image',
    name: 'Wingray · Z-Image Turbo',
    provider: 'wingray',
    model: 'Z-Image-Turbo',
    mechanism: 'A',
    baseUrl: WINGRAY_BASE_URL,
    commercial: true,
  },
  {
    id: 'wingray-tts',
    providerClass: 'tts',
    name: 'Wingray · CosyVoice v2',
    provider: 'wingray',
    model: 'cosyvoice-v2',
    mechanism: 'A',
    baseUrl: WINGRAY_BASE_URL,
    voices: {
      zh: ['longjiqi', 'longxiaochun_v2', 'longyumi_v2', 'longyingxiao'],
      en: ['longjiqi', 'longshange'],
    },
    languages: ['en', 'zh'],
    commercial: true,
  },
  {
    id: 'wingray-i2v',
    providerClass: 'i2v',
    name: 'Wingray · Kling V1.6 I2V',
    provider: 'wingray',
    model: 'Kling-V1-6-I2V',
    mechanism: 'B',
    baseUrl: WINGRAY_BASE_URL,
    commercial: true,
    note: 'i2v channel may be unavailable on some providers — degrade gracefully to static (I2V_NOT_AVAILABLE).',
  },
  // Mechanism-B adapters (05 doc) — declared as presets; adapters live in api/pipeline/adapters.
  {
    id: 'kling-i2v',
    providerClass: 'i2v',
    name: 'Kling AI (Kuaishou)',
    provider: 'kling',
    model: 'kling-v2',
    mechanism: 'B',
    baseUrl: null,
    commercial: true,
  },
  {
    id: 'fal-image',
    providerClass: 'image',
    name: 'FAL.ai (image)',
    provider: 'fal',
    model: 'fal-ai/flux/dev',
    mechanism: 'B',
    baseUrl: null,
    commercial: true,
  },
  {
    id: 'elevenlabs-tts',
    providerClass: 'tts',
    name: 'ElevenLabs',
    provider: 'elevenlabs',
    model: 'eleven_multilingual_v2',
    mechanism: 'B',
    baseUrl: null,
    voices: {
      en: ['Rachel', 'Domi', 'Bella'],
      zh: ['Xi', 'Song'],
    },
    languages: ['en', 'zh'],
    commercial: true,
  },
];

/** Unsupported providers surfaced in UI (05 doc): no official API. */
export const UNSUPPORTED_PROVIDERS = ['midjourney'];

export function presetsByClass(cls: ProviderClass): ProviderPreset[] {
  return PRESETS.filter((p) => p.providerClass === cls);
}

export function presetById(id: string): ProviderPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
