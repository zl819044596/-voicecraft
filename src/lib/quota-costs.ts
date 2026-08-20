/** 各工具消耗的免费额度单位（前后端共用，勿放 Node-only 依赖） */
export const QUOTA_COST = {
  script: 1,
  storyboard: 2,
  image: 3,
  tts: 2,
  chat: 1,
  subtitles: 0,
  pexels: 0,
  compose: 5,
} as const;

export type QuotaOp = keyof typeof QUOTA_COST;
