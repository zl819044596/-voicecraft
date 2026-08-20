/**
 * Canonical pipeline model (00-CONTRACT §3). L1-L10 logical steps, UI stage
 * mapping, step payload shapes and task/step state machines.
 */

import type { RunMode, StepStatus, TaskMode, TaskStatus } from './types.js';

// ---------------------------------------------------------------------------
// Logical steps
// ---------------------------------------------------------------------------

export const L1 = 1;
export const L1_5 = 15; // stored as step=1, payload.kind='compliance_precheck'
export const L2 = 2;
export const L3 = 3;
export const L4 = 4;
export const L5 = 5; // i2v only (static skips)
export const L6 = 6;
export const L7 = 7;
export const L8 = 8;
export const L9 = 9;
export const L10 = 10;

export interface StepDef {
  step: number;
  name: string;
  engine: 'llm' | 'image' | 'i2v' | 'tts' | 'ffprobe' | 'ffmpeg' | 'api';
  /** uiStage: the 6-stage rail index (1-6). */
  uiStage: number;
  /** granularity of single-step rerun. */
  rerunGranularity: 'step' | 'version' | 'shot' | 'clip' | 'voice';
}

export const STEP_DEFS: StepDef[] = [
  { step: L1, name: '选题/内容解析', engine: 'llm', uiStage: 1, rerunGranularity: 'step' },
  { step: L1_5, name: '合规预审（托管档）', engine: 'llm', uiStage: 1, rerunGranularity: 'step' },
  { step: L2, name: '文案生成', engine: 'llm', uiStage: 1, rerunGranularity: 'version' },
  { step: L3, name: '分镜生成', engine: 'llm', uiStage: 2, rerunGranularity: 'shot' },
  { step: L4, name: '逐镜生图', engine: 'image', uiStage: 3, rerunGranularity: 'shot' },
  { step: L5, name: 'i2v 图生视频', engine: 'i2v', uiStage: 3, rerunGranularity: 'clip' },
  { step: L6, name: '配音 TTS', engine: 'tts', uiStage: 4, rerunGranularity: 'voice' },
  { step: L7, name: '字幕生成', engine: 'ffprobe', uiStage: 4, rerunGranularity: 'step' },
  { step: L8, name: '视频合成', engine: 'ffmpeg', uiStage: 5, rerunGranularity: 'step' },
  { step: L9, name: '复检', engine: 'llm', uiStage: 6, rerunGranularity: 'step' },
  { step: L10, name: '开放导出', engine: 'api', uiStage: 6, rerunGranularity: 'step' },
];

/** UI 六阶段 rail labels (en/zh). */
export const UI_STAGES: { stage: number; labelEn: string; labelZh: string; steps: number[] }[] = [
  { stage: 1, labelEn: 'Script', labelZh: '文案', steps: [L1, L1_5, L2] },
  { stage: 2, labelEn: 'Storyboard', labelZh: '分镜', steps: [L3] },
  { stage: 3, labelEn: 'Visuals', labelZh: '画面', steps: [L4, L5] },
  { stage: 4, labelEn: 'Audio', labelZh: '声音', steps: [L6, L7] },
  { stage: 5, labelEn: 'Compose', labelZh: '合成', steps: [L8] },
  { stage: 6, labelEn: 'Deliver', labelZh: '交付', steps: [L9, L10] },
];

export function uiStageOf(step: number): number {
  const def = STEP_DEFS.find((d) => d.step === step);
  return def ? def.uiStage : 0;
}

// ---------------------------------------------------------------------------
// Task / step state machines
// ---------------------------------------------------------------------------

export const TASK_STATUSES: TaskStatus[] = ['queued', 'running', 'done', 'failed', 'cancelled'];
export const STEP_STATUSES: StepStatus[] = ['queued', 'running', 'done', 'failed', 'skipped', 'cancelled'];
export const RUN_MODES: RunMode[] = ['semi', 'auto'];

/** Steps executed for a given mode. static = 9 steps (skip L5); i2v = 10. */
export function stepsForMode(mode: TaskMode): number[] {
  const all = [L1, L2, L3, L4, L5, L6, L7, L8, L9, L10];
  return mode === 'i2v' ? all : all.filter((s) => s !== L5);
}

export function totalStepsFor(mode: TaskMode): number {
  return mode === 'i2v' ? 10 : 9;
}

/** L1.5 compliance precheck exists only on the managed track. */
export function hasCompliancePrecheck(track: 'byok' | 'managed'): boolean {
  return track === 'managed';
}

// ---------------------------------------------------------------------------
// Step payload shapes (04-数据库文档 §2.7 / 06-提示词工程)
// ---------------------------------------------------------------------------

/** L1: 选题/内容解析产物. */
export interface L1Payload {
  kind?: 'parse' | 'compliance_precheck';
  topic: string;
  audience: string;
  goal: string;
  tone: string;
  content_language: string;
  /** compliance precheck only */
  compliance?: {
    allowed: boolean;
    reason: string;
    flags: string[];
  };
}

/** L2: 文案生成. */
export interface L2Payload {
  title: string;
  script: string;
  subtitle_text: string[];
  /** per-shot narration lines (aligned to L3 shots). */
  narration: string[];
  version: number;
  versions: { version: number; script: string; created_at: string }[];
}

export interface ShotCandidate {
  id: string;
  image_key: string | null; // MinIO object key
  seed: number;
}

/** L3: 分镜生成. */
export interface L3Payload {
  shots: Shot[];
  style: string;
}

export interface Shot {
  index: number;
  title: string;
  content: string;
  subtitle: string;
  image_prompt: string;
  aspect: string; // '9:16' | '16:9' | '1:1' | '4:3' | '3:4'
  /** candidates from L4 (per-shot regenerate). */
  candidates?: ShotCandidate[];
}

/** L4: 逐镜生图. */
export interface L4Payload {
  shots: ShotImage[];
}

export interface ShotImage {
  index: number;
  image_key: string;
  prompt: string;
  seed: number;
  width: number;
  height: number;
}

/** L5: i2v 图生视频. */
export interface L5Payload {
  clips: { index: number; clip_key: string; duration: number }[];
}

/** L6: 配音 TTS. */
export interface L6Payload {
  audios: { index: number; audio_key: string; voice: string; language: string }[];
}

/** L7: 字幕. */
export interface L7Payload {
  srt_key: string;
  subtitles: { index: number; text: string; start: number; end: number }[];
}

/** L8: 合成. */
export interface L8Payload {
  mp4_key: string;
  duration: number;
  width: number;
  height: number;
}

/** L9: 复检. */
export interface L9Payload {
  passed: boolean;
  issues: string[];
  notes: string;
}

/** L10: 导出. */
export interface L10Payload {
  export_id: string;
  zip_key: string;
  zip_hash: string;
  expires_at: string;
}

export type StepPayload = L1Payload | L2Payload | L3Payload | L4Payload | L5Payload | L6Payload | L7Payload | L8Payload | L9Payload | L10Payload;
