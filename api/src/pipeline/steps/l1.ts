/**
 * L1 选题/内容解析（Phase 4，TS 移植 v2 steps/l1.js）。
 *
 * 输入：projects.prompt + source_type（text|url|topic|product）
 * 输出：payload { kind:'topic', topic, key_points, target_duration_sec,
 *                audience, language, raw_input, degraded? }
 * 提示词：06 §1 的 P-L1-SYS + P-L1-USR-{TEXT,URL,TOPIC,PRODUCT}（中英），
 *         三级覆盖经 effectiveSysPrompt。
 * 降级 A：LLM 不可用 → 用截断 topic + 兜底 key_points，任务仍可继续。
 */

import { chatJson, effectiveSysPrompt } from '../llm.js';
import { resolveProviderFor, poolFrom } from '../providers.js';
import type { StepRunnerInput } from '../queues.js';
import {
  P_L1_SYS_ZH,
  P_L1_SYS_EN,
  P_L1_USR_TEXT_ZH,
  P_L1_USR_URL_ZH,
  P_L1_USR_TOPIC_ZH,
  P_L1_USR_PRODUCT_ZH,
  P_L1_USR_TEXT_EN,
  P_L1_USR_URL_EN,
  P_L1_USR_TOPIC_EN,
  P_L1_USR_PRODUCT_EN,
  STEP_PARAMS,
  renderPrompt,
  escapeTripleQuoted,
} from '../prompts.js';

const contentLang = (task: StepRunnerInput['task']): 'en' | 'zh' =>
  String(task?.config?.content_language || 'zh') === 'en' ? 'en' : 'zh';

// URL 抓取：15s 超时；任何失败都回退到 URL 字符串本身（不阻塞 L1）。
async function fetchUrlText(url: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (ai-video-studio; +https://example.com)' },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // 粗净化：去标签/压缩空白，避免把 HTML 直接塞给 LLM
      const clean = text
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return clean.slice(0, 12000) || url;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn(`[l1] fetch ${url} failed, falling back to URL string: ${(err as Error).message}`);
    return url;
  }
}

// source_type=product：prompt 可能存的是 product_id（uuid）或商品文本。
// 能当 uuid 查到商品 → PRODUCT 模板；否则按 TEXT 处理。
async function resolveProduct(
  pg: StepRunnerInput['pg'],
  raw: string,
  ownerId: string | undefined,
): Promise<{ name: unknown; category: unknown; price: unknown; detail_text: unknown } | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.trim())) {
    return null;
  }
  const { rows } = await pg.query(
    `SELECT name, category, price, detail_text
       FROM products WHERE id = $1 AND user_id = $2`,
    [raw.trim(), ownerId],
  );
  return (rows[0] as { name: unknown; category: unknown; price: unknown; detail_text: unknown }) || null;
}

export const l1 = {
  async run(ctx: StepRunnerInput) {
    const { pg, redis, task } = ctx;
    const lang = contentLang(task);
    const sourceType = String(task.source_type || 'text');

    const { rows } = await pg.query(`SELECT prompt FROM projects WHERE id = $1`, [task.project_id]);
    const raw = String(rows[0]?.prompt || task.prompt || '');
    const scriptMode = String((task.config as Record<string, unknown> | undefined)?.script_mode || '');

    // paste/rewrite/create 模式（快速生成页三种文案源）：文案本身就是成品，
    // 完全跳过 LLM 选题解析，直用原文（paste 为 TASK_25；rewrite/create 为 TASK_26）
    if (scriptMode === 'paste' || scriptMode === 'rewrite' || scriptMode === 'create') {
      const payload: Record<string, unknown> = {
        kind: 'topic',
        topic: raw.slice(0, 200),
        key_points: [raw.slice(0, 2000)],
        target_duration_sec: 60,
        audience: '',
        language: lang,
        raw_input: raw.slice(0, 12000),
        script_mode: scriptMode,
      };
      return { payload };
    }

    // 组装用户模板
    let usrTemplate: string;
    const usrVars: Record<string, unknown> = {
      raw_input: escapeTripleQuoted(raw || ''),
      content_language: lang === 'en' ? 'English' : '中文',
    };
    if (sourceType === 'url') {
      const body = await fetchUrlText(raw);
      usrTemplate = lang === 'en' ? P_L1_USR_URL_EN : P_L1_USR_URL_ZH;
      usrVars.raw_input = escapeTripleQuoted(body);
    } else if (sourceType === 'topic') {
      usrTemplate = lang === 'en' ? P_L1_USR_TOPIC_EN : P_L1_USR_TOPIC_ZH;
    } else if (sourceType === 'product') {
      // CORE-FEATURES：商品链路补全 —— 优先用 config.product_id（quick create 快照），
      // 其次兼容 prompt 本身存 product_id uuid 的旧形态。
      const cfgProductId = String((task.config as Record<string, unknown> | undefined)?.product_id ?? '').trim();
      const product = await resolveProduct(pg, cfgProductId || raw, task.owner_id);
      if (product) {
        usrTemplate = lang === 'en' ? P_L1_USR_PRODUCT_EN : P_L1_USR_PRODUCT_ZH;
        usrVars.product_name = escapeTripleQuoted(String(product.name || ''));
        usrVars.product_category = escapeTripleQuoted(String(product.category || ''));
        usrVars.product_price = String(product.price ?? '');
        usrVars.product_detail = escapeTripleQuoted(String(product.detail_text || ''));
      } else {
        usrTemplate = lang === 'en' ? P_L1_USR_TEXT_EN : P_L1_USR_TEXT_ZH;
      }
    } else {
      usrTemplate = lang === 'en' ? P_L1_USR_TEXT_EN : P_L1_USR_TEXT_ZH;
    }

    const sysPrompt = await effectiveSysPrompt(pg, task, 'l1', P_L1_SYS_ZH, P_L1_SYS_EN);
    const usrPrompt = renderPrompt(usrTemplate, usrVars);
    const pool = poolFrom(pg, redis);
    const provider = await resolveProviderFor(pg, pool, task, 'llm');

    const result = await chatJson({
      pg,
      task,
      provider,
      sysPrompt,
      usrPrompt,
      mockKey: 's1',
      params: STEP_PARAMS.l1,
      schemaKey: 'l1',
      degrade: async () => ({
        topic: (raw || '视频内容').slice(0, 30),
        key_points: ['基于用户输入整理的核心要点'],
        target_duration_sec: 60,
        audience: '内容创作者',
        language: lang,
      }),
    });

    // 归一化：mock s1 输出 target_duration（非 _sec），真实输出 target_duration_sec
    const targetDurationSec = Number(result.target_duration_sec) || Number(result.target_duration) || 60;

    const payload: Record<string, unknown> = {
      kind: 'topic',
      topic: String(result.topic || '').slice(0, 200),
      key_points: Array.isArray(result.key_points)
        ? (result.key_points as unknown[]).map((k) => String(k).slice(0, 500))
        : [],
      target_duration_sec: Math.max(15, Math.min(300, targetDurationSec)),
      audience: String(result.audience || '').slice(0, 200),
      language: lang,
      raw_input: raw.slice(0, 12000),
    };
    if (result.degraded) payload.degraded = true;

    return { payload };
  },
};
