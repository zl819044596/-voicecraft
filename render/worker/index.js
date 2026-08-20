'use strict';

/**
 * 渲染 worker（Phase 5，rebuild-v3 重写）。
 *
 * 消费 Redis 列表 `avs:render`，产出 SRT 与成片，回执写 `avs:render:done`。
 * 协议（与 api/src/pipeline/render.ts 对齐，02-架构 §5）：
 *
 *   job {type:'srt', taskId, subtitleText?, subtitle?}
 *       → 探测逐镜音频时长 → subtitles.srt（可选自定义文案 + 行长换行）
 *       → 回执 { ok, srtKey, segments:[{index,duration}] }
 *
 *   job {type:'compose', taskId, bgmKey?, subtitle?}
 *       → 逐镜静态图+配音 分段 → concat → 可选字幕烧录(libass) → 可选 BGM amix
 *       → 上传 final.mp4 → 回执 { ok, mp4Key, size, duration, bgm }
 *
 *   job {type:'compose-i2v', taskId, bgmKey?, subtitle?, warnings?}
 *       → 逐镜 i2v clip(1280x720 归一) + 配音；缺 clip 的镜回退静态图
 *       → 同 compose 回执 + mode:'i2v', fallbackShots
 *
 * 幂等（U11）：final.mp4 已存在 → 直接回执 idempotent（API 侧已避免重复入队，
 * worker 侧兜底重投判定）。失败 → 回执 { ok:false, error }，由 API 侧 failTask。
 * ffmpeg 超时按输入时长/工作量推算（encodeTimeoutFor：max(5min, 时长×2+30s)），
 * 长视频烧字幕（libx264 全片重编码）不再被固定 5 分钟上限误杀。
 * 烧字幕失败不静默：真实原因打警告 + 随回执 warnings 透传 API（降级用无字幕版仍保留）。
 *
 * /health：容器健康检查（ffmpeg 版本探测，非 200 即降级）。
 */

import { execFile } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Redis } from 'ioredis';
import { Client as MinioClient } from 'minio';

const FFMPEG_BINARY = process.env.FFMPEG_BINARY || '/usr/local/bin/ffmpeg';
const FFPROBE_BINARY = process.env.FFPROBE_BINARY || '/usr/local/bin/ffprobe';
const BUCKET = 'avs-assets';
const FFMPEG_TIMEOUT = 300000; // 5 min per ffmpeg call
const PORT = Number(process.env.PORT || 4001);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  retryStrategy: () => null,
});
redis.on('error', () => {});

const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: String(process.env.MINIO_USE_SSL || 'false') === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

// ---------------------------------------------------------------------------
// MinIO helpers（minio v8：getObject 只有 promise 形式，无回调形式）
// ---------------------------------------------------------------------------

async function minioPut(key, buffer, contentType) {
  await minio.putObject(BUCKET, key, buffer, buffer.length, {
    'Content-Type': contentType || 'application/octet-stream',
  });
}

async function minioGet(key) {
  const stream = await minio.getObject(BUCKET, key);
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function minioList(prefix) {
  return new Promise((resolve, reject) => {
    const names = [];
    const stream = minio.listObjectsV2(BUCKET, prefix, true);
    stream.on('data', (o) => o.name && names.push(o.name));
    stream.on('end', () => resolve(names.sort()));
    stream.on('error', reject);
  });
}

async function minioExists(key) {
  try {
    await minio.statObject(BUCKET, key);
    return true;
  } catch {
    return false;
  }
}

/** 下载 MinIO 对象到 workdir，返回本地路径。 */
async function writeLocal(workdir, name, key) {
  const local = path.join(workdir, name);
  fs.writeFileSync(local, await minioGet(key));
  return local;
}

// ---------------------------------------------------------------------------
// ffmpeg/ffprobe helpers
// ---------------------------------------------------------------------------

function run(cmd, args, timeout = FFMPEG_TIMEOUT) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        code: err ? (err.code ?? 1) : 0,
        stdout: String(stdout),
        stderr: String(stderr),
        // 超时 kill：code=null、killed=true、signal='SIGTERM' —— 显式带出，日志不再误读为普通 exit 1。
        killed: Boolean(err?.killed),
        signal: err?.signal || null,
      });
    });
  });
}

async function probeDuration(file) {
  const r = await run(
    FFPROBE_BINARY,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
    FFMPEG_TIMEOUT,
  );
  const n = Number((r.stdout || '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 探测视频宽度（竖版 720 / 横版 1280 …），失败返回 null。 */
async function probeWidth(file) {
  const r = await run(
    FFPROBE_BINARY,
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'default=noprint_wrappers=1:nokey=1', file],
    FFMPEG_TIMEOUT,
  );
  const n = Number((r.stdout || '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 行长硬换行：超 maxChars 按字切块换行（配合 libass WrapStyle=2 干净断行）。 */
function wrapText(text, maxChars) {
  const m = Math.min(100, Math.max(5, Number(maxChars) || 20));
  if (!text || text.length <= m) return text || '';
  const chunks = [];
  for (let i = 0; i < text.length; i += m) chunks.push(text.slice(i, i + m));
  return chunks.join('\n');
}

function isFullWidthChar(char) {
  const code = char.codePointAt(0) || 0;
  return code >= 0x1100 && (
    code <= 0x115f ||
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

function displayWidth(char) {
  return isFullWidthChar(char) ? 1 : 0.5;
}

/** 按实际画幅和字号重排字幕（2026-08-19 v2）：
 *  ① 句读标点（，。！？；：、…）后断行，连续标点（……）不拆；
 *  ② 超宽且当前字符是标点 → 并到行尾再断（标点不孤行/不顶行）；
 *  ③ 超宽且行内含标点（位置>40%）→ 回退到该标点后断（断句优雅）；
 *  ④ 无标点长段 → 按宽度硬断（全角=1、半角=0.5、可用宽 84%）。
 */
const PUNCT = /[，。！？；：、…]/;
function wrapTextForVideo(text, videoWidth, fontSize) {
  const maxWidth = Math.max(5, Math.floor((Number(videoWidth) || 720) * 0.84 / fontSize));
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => {
      const chars = Array.from(line);
      const chunks = [];
      let chunk = '';
      let width = 0;
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const cw = displayWidth(ch);
        if (width + cw > maxWidth && chunk) {
          // ② 当前字符是标点 → 并到行尾再断
          if (PUNCT.test(ch)) {
            chunk += ch;
            chunks.push(chunk);
            chunk = '';
            width = 0;
            continue;
          }
          // ③ 行内最后标点位置 > 40% → 回退断句
          let lastPunct = -1;
          for (let k = 0; k < chunk.length; k++) if (PUNCT.test(chunk[k])) lastPunct = k;
          if (lastPunct > Math.floor(chunk.length * 0.4)) {
            chunks.push(chunk.slice(0, lastPunct + 1));
            chunk = chunk.slice(lastPunct + 1);
            width = Array.from(chunk).reduce((a, c) => a + displayWidth(c), 0);
          } else {
            // ④ 硬断
            chunks.push(chunk);
            chunk = '';
            width = 0;
          }
        }
        chunk += ch;
        width += cw;
        // ① 句读标点 → 断行（连续标点一起留行尾）
        if (PUNCT.test(ch)) {
          let j = i;
          while (j + 1 < chars.length && PUNCT.test(chars[j + 1])) {
            chunk += chars[j + 1];
            width += displayWidth(chars[j + 1]);
            j++;
          }
          i = j;
          if (i < chars.length - 1) {
            chunks.push(chunk);
            chunk = '';
            width = 0;
          }
        }
      }
      if (chunk) chunks.push(chunk);
      return chunks.join('\n');
    })
    .join('\n');
}

/** 烧录前重排 SRT：兼容旧 SRT 及绕过 L7 直接进入合成的任务。 */
function wrapSrtForVideo(srtText, videoWidth, fontSize) {
  return String(srtText || '').replace(/(\d+\r?\n\d\d:\d\d:\d\d,\d{3}\s+-->\s+\d\d:\d\d:\d\d,\d{3}\r?\n)([\s\S]*?)(?=\r?\n\r?\n|$)/g, (_match, header, body) => {
    return `${header}${wrapTextForVideo(body.replace(/\r?\n$/, ''), videoWidth, fontSize)}`;
  });
}

/**
 * 重编码超时按输入时长推算：max(5min, 时长×2 + 30s)。长视频烧字幕（libx264 全片
 * 重编码，耗时≈时长量级）不再被固定 5 分钟上限误杀；ffprobe 失败/缺时长回退下限。
 */
function encodeTimeoutFor(durationSec) {
  const n = Number(durationSec);
  if (!Number.isFinite(n) || n <= 0) return FFMPEG_TIMEOUT;
  return Math.max(FFMPEG_TIMEOUT, Math.round(n * 2000 + 30000));
}

/** 过滤 ffmpeg 版本 banner 行（stderr 前部全是版本/配置信息，截断后真实错误不可见）。 */
function stripFfmpegBanner(text) {
  return String(text)
    .split('\n')
    .filter((l) => !/^ffmpeg version\b/i.test(l.trim()))
    .join('\n');
}

/** ffmpeg 失败摘要：退出码/killed/signal 标记 + stderr 末尾几行（去 banner）。 */
function ffmpegErrorDetail(r) {
  const flags = [
    r.killed ? 'killed' : null,
    r.signal ? `signal=${r.signal}` : null,
    r.code != null ? `exit=${r.code}` : null,
  ].filter(Boolean).join(' ');
  const tail = stripFfmpegBanner(r.stderr)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .slice(-8)
    .join('\n');
  return `${flags ? `[${flags}] ` : ''}${tail || '(no stderr)'}`;
}

function fmtTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(ss)},${p(ms, 3)}`;
}

/**
 * 口播文本按句断句（中英文句末标点）。句号/问号/感叹号/分号/省略号后断；
 * 引号跟着句尾走；空句丢弃；过长句（>60 字）在 30 字处软切，避免单条字幕超长。
 */
function splitSentences(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const parts = t.split(/(?<=[。！？；!?;…])\s*/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    if (part.length <= 60) {
      out.push(part);
    } else {
      // 长句软切：优先在逗号后切，否则按 30 字硬切
      let rest = part;
      while (rest.length > 60) {
        let cut = rest.slice(0, 30);
        const comma = cut.lastIndexOf('，');
        const commaEn = cut.lastIndexOf(',');
        const idx = Math.max(comma, commaEn);
        if (idx > 10) cut = rest.slice(0, idx + 1);
        out.push(cut.trim());
        rest = rest.slice(cut.length);
      }
      if (rest.trim()) out.push(rest.trim());
    }
  }
  return out;
}

/**
 * 从对象名解析镜头/音频序号。只取 basename 的数字——整串 key（含 UUID 的数字
 * 段）匹配会把 index 取错（tasks/<uuid>/shots/shot-01.png 的 uuid 数字在前）。
 */
function indexFromName(name) {
  const base = String(name).split('/').pop() || String(name);
  const m = base.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// ---------------------------------------------------------------------------
// SRT job（L7）— 探测音频时长，按序生成逐镜字幕
// ---------------------------------------------------------------------------

async function handleSrt(taskId, subtitleText, subtitleSettings) {
  const audioKeys = await minioList(`tasks/${taskId}/audio/`);
  if (audioKeys.length === 0) {
    throw new Error('no audio files found for SRT');
  }

  // storyboard 逐镜 voiceover 文本（best-effort）。
  let textByIndex = {};
  try {
    const storyboard = JSON.parse((await minioGet(`tasks/${taskId}/storyboard.json`)).toString('utf8'));
    if (storyboard && Array.isArray(storyboard.shots)) {
      textByIndex = {};
      for (const s of storyboard.shots) {
        textByIndex[Number(s.index)] = String(s.voiceover || s.script || '');
      }
    }
  } catch {
    textByIndex = {};
  }

  // 自定义字幕文案覆盖逐镜 voiceover（node-5 字幕编辑）；时长仍来自音频探测。
  let customLines =
    typeof subtitleText === 'string' && subtitleText.trim()
      ? subtitleText.split('\n').filter((l) => l.trim() !== '')
      : null;

  // 行长换行：超 max_chars_per_line 的硬换行，配合烧录 WrapStyle=2 干净断行。
  const maxChars = Math.min(100, Math.max(5, Number(subtitleSettings?.max_chars_per_line) || 20));
  if (customLines) {
    customLines = customLines.map((line) => wrapText(line, maxChars));
  }

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'srt-'));
  try {
    const segments = [];
    for (const key of audioKeys) {
      const idx = indexFromName(key);
      const local = path.join(workdir, path.basename(key));
      fs.writeFileSync(local, await minioGet(key));
      const duration = (await probeDuration(local)) ?? 0;
      segments.push({ index: idx, duration });
    }

    const lines = [];
    let t = 0;
    let seq = 1;
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      const raw =
        customLines && customLines.length >= segments.length
          ? (customLines[i] || '')
          : (textByIndex[seg.index] || '');
      // 按句分段（2026-08-19）：每镜口播断句成多条字幕，时长按句字符数比例分配，
      // 字幕随配音逐句切换（不再一镜一大块固定显示）。
      const sentences = splitSentences(raw);
      const totalLen = sentences.reduce((s, x) => s + x.length, 0) || 1;
      for (const sent of sentences) {
        const sLen = sent.length || 1;
        const start = t;
        const end = t + ((seg.duration || 0) * sLen) / totalLen;
        lines.push(String(seq));
        lines.push(`${fmtTime(start)} --> ${fmtTime(end)}`);
        // 逐句也要行长换行（竖版 720 宽，长句单行会溢出画面被裁剪）
        lines.push(wrapText(sent, maxChars));
        lines.push('');
        seq += 1;
        t = end;
      }
    }

    const srtKey = `tasks/${taskId}/subtitles.srt`;
    await minioPut(srtKey, Buffer.from(lines.join('\n'), 'utf8'), 'application/x-subrip; charset=utf-8');
    return { ok: true, srtKey, segments };
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// BGM 混音（best-effort）— 低音量覆盖 (-20dB)；失败保留无 BGM 成片
// ---------------------------------------------------------------------------

function clampVolume(vol) {
  const n = Number(vol);
  if (!Number.isFinite(n)) return 0.12;
  return Math.min(0.6, Math.max(0.02, n));
}

async function mixBgm(workdir, videoFile, bgmKey, volume) {
  if (!bgmKey) return videoFile;
  let local;
  try {
    local = await writeLocal(workdir, 'bgm.bin', bgmKey);
  } catch (err) {
    console.log(`[render] bgm download skipped for ${bgmKey}: ${err.message}`);
    return videoFile;
  }
  const vol = clampVolume(volume);
  const outFile = path.join(workdir, 'bgm-mix.mp4');
  // PIPELINE_TASK_49 (P1-3)：BGM 混音虽 -c:v copy 快，但音频整段重编码——按视频时长
  // 推算超时（max(5min, 时长×2+30s)），长片不再被固定 5 分钟上限误杀。
  const durSec = (await probeDuration(videoFile)) ?? 0;
  const r = await run(
    FFMPEG_BINARY,
    [
      '-y', '-i', videoFile, '-i', local,
      '-filter_complex',
      `[1:a]volume=${vol}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=3[aout]`,
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
      outFile,
    ],
    encodeTimeoutFor(durSec),
  );
  if (r.code !== 0 || !fs.existsSync(outFile)) {
    console.log(`[render] bgm mix skipped for ${bgmKey}: ${ffmpegErrorDetail(r)}`);
    return videoFile;
  }
  return outFile;
}

// ---------------------------------------------------------------------------
// 字幕烧录（libass / subtitles filter）— compose 与 compose-i2v 共用
// ---------------------------------------------------------------------------

function subtitleFontSizeFor(settings, videoWidth) {
  // UI 的 10–24 是视觉档位，不是 libass 像素。默认档 14 在 720 宽为 36px
  // （宽/20；2026-08-19 由 45px 调小，用户反馈默认偏大）。
  const auto = Math.round((videoWidth || 720) / 20);
  const setting = Number(settings?.font_size);
  const scale = Number.isFinite(setting) && setting >= 10 && setting <= 24 ? setting / 14 : 1;
  return Math.min(96, Math.max(20, Math.round(auto * scale)));
}

function forceStyleFor(settings, videoWidth, font = subtitleFontSizeFor(settings, videoWidth)) {
  const pos = String(settings?.position || 'bottom');
  // ASS Alignment：8=顶部居中，5=中间居中，2=底部居中。
  let alignment = 2;
  let marginV = 40;
  if (pos === 'top') {
    alignment = 8;
    marginV = 80;
  } else if (pos === 'center') {
    alignment = 5;
    marginV = 40;
  }
  // 逗号是 filtergraph 分隔符 → 每个 ASS 键值对必须转义为 \,（单反斜杠）。
  // execFile 直传 argv（无 shell 剥层），ffmpeg 9.0 实测 \\,（双反斜杠）会解析失败
  // （exit=234，Error parsing filterchain around: ,Alignment=...），导致烧录静默失败。
  // FontName=Noto Sans CJK SC：显式指定中文字体（容器已装 fonts-noto-cjk，
  // 否则 libass 回退 DejaVu 无 CJK 字形 → 字幕显示方框 □）。
  const style = `force_style=FontName=Noto Sans CJK SC,FontSize=${font},WrapStyle=2,Alignment=${alignment},MarginV=${marginV}`;
  return style.replace(/,/g, '\\,');
}

/**
 * 字幕烧录（libass / subtitles filter）。
 * 返回 { file, warning }：成功 → file 为 burned.mp4 路径；失败 → warning 为真实原因，
 * 由调用方透传回执 warnings（API 落 step payload），仍降级用无字幕 concat 版本。
 */
async function burnSubtitles(taskId, workdir, concatFile, srtLocal, subtitleSettings) {
  // enabled === false → 不烧录；缺配置（legacy 任务）保持默认开启。
  if (subtitleSettings && subtitleSettings.enabled === false) {
    console.log(`[render] subtitle burn skipped for ${taskId}: disabled`);
    return { file: null, warning: null };
  }
  const burnFile = path.join(workdir, 'burned.mp4');
  // 输入时长驱动超时：重编码耗时≈时长量级，max(5min, 时长×2+30s)。
  const durSec = (await probeDuration(concatFile)) ?? 0;
  const vw = await probeWidth(concatFile);
  const fontSize = subtitleFontSizeFor(subtitleSettings, vw);
  const wrappedSrt = path.join(workdir, 'subtitles-wrapped.srt');
  fs.writeFileSync(wrappedSrt, wrapSrtForVideo(fs.readFileSync(srtLocal, 'utf8'), vw, fontSize), 'utf8');
  const br = await run(
    FFMPEG_BINARY,
    [
      '-y', '-i', concatFile,
      '-vf', `subtitles=${wrappedSrt}:${forceStyleFor(subtitleSettings, vw, fontSize)}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'copy', burnFile,
    ],
    encodeTimeoutFor(durSec),
  );
  if (br.code === 0 && fs.existsSync(burnFile)) {
    console.log(`[render] subtitle burn ok for ${taskId} (input ${durSec}s, width ${vw}px, font ${fontSize}px, timeout ${encodeTimeoutFor(durSec)}ms)`);
    return { file: burnFile, warning: null };
  }
  // 失败不静默：真实原因打警告 + 随回执透传 API（warnings），仍降级用无字幕版。
  const warning = `subtitle burn failed, final video has no subtitles: ${ffmpegErrorDetail(br)}`;
  console.warn(`[render] ${warning} for ${taskId}`);
  return { file: null, warning };
}

// ---------------------------------------------------------------------------
// Compose job（L8 静态）— 逐镜 静态图+配音 分段 → concat → 烧录 → 混音
// ---------------------------------------------------------------------------

async function handleCompose(taskId, bgmKey, subtitleSettings) {
  const finalKey = `tasks/${taskId}/final.mp4`;

  // 幂等（U11）：成片已存在 → 直接回执（重投/重跑场景）。
  if (await minioExists(finalKey)) {
    const stat = await minio.statObject(BUCKET, finalKey);
    return { ok: true, mp4Key: finalKey, size: stat.size, duration: null, note: 'idempotent' };
  }

  let storyboard;
  try {
    storyboard = JSON.parse((await minioGet(`tasks/${taskId}/storyboard.json`)).toString('utf8'));
  } catch {
    throw new Error('missing storyboard.json for compose');
  }
  const shots = storyboard.shots || [];
  if (shots.length === 0) throw new Error('storyboard has no shots');

  const shotKeys = await minioList(`tasks/${taskId}/shots/`);
  const audioKeys = await minioList(`tasks/${taskId}/audio/`);
  const shotByIndex = {};
  const audioByIndex = {};
  for (const k of shotKeys) shotByIndex[indexFromName(k)] = k;
  for (const k of audioKeys) audioByIndex[indexFromName(k)] = k;

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-'));
  try {
    const segFiles = [];
    let totalDur = 0; // 逐镜时长累计，供 concat 推算超时。
    for (const shot of shots) {
      const idx = Number(shot.index) || 1;
      const shotKey = shotByIndex[idx];
      if (!shotKey) throw new Error(`missing shot for index ${idx}`);
      const shotLocal = await writeLocal(workdir, `shot-${idx}.png`, shotKey);

      const storyDur = Math.max(0.5, Number(shot.duration_sec ?? shot.duration) || 5);
      const audioKey = audioByIndex[idx];
      const segFile = path.join(workdir, `seg-${idx}.mp4`);
      let r;
      let dur = storyDur;
      if (audioKey) {
        const audioLocal = await writeLocal(workdir, `vo-${idx}.bin`, audioKey);
        // 实测配音秒数作该镜时长，画面跟配音走；探测失败回退 storyboard 预估值。
        const measured = await probeDuration(audioLocal);
        dur = measured ?? storyDur;
        r = await run(
          FFMPEG_BINARY,
          [
            '-y', '-loop', '1', '-i', shotLocal, '-i', audioLocal,
            '-t', String(dur),
            '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage',
            '-c:a', 'aac', '-b:a', '128k', '-shortest',
            segFile,
          ],
          encodeTimeoutFor(dur),
        );
      } else {
        // 无配音 → 该镜时长静音段。
        r = await run(
          FFMPEG_BINARY,
          [
            '-y', '-loop', '1', '-i', shotLocal,
            '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono',
            '-t', String(dur),
            '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage',
            '-c:a', 'aac', '-b:a', '128k', '-shortest',
            segFile,
          ],
          encodeTimeoutFor(dur),
        );
      }
      totalDur += dur;
      if (r.code !== 0 || !fs.existsSync(segFile)) {
        throw new Error(`ffmpeg segment ${idx} failed: ${ffmpegErrorDetail(r)}`);
      }
      segFiles.push(segFile);
    }

    // concat（同参数 → 可 -c copy；PIPELINE_TASK_49：显式按累计时长推算超时）。
    const listFile = path.join(workdir, 'list.txt');
    fs.writeFileSync(listFile, segFiles.map((f) => `file '${f}'`).join('\n'));
    const concatFile = path.join(workdir, 'concat.mp4');
    const cr = await run(
      FFMPEG_BINARY,
      ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', concatFile],
      encodeTimeoutFor(totalDur),
    );
    if (cr.code !== 0 || !fs.existsSync(concatFile)) {
      throw new Error(`ffmpeg concat failed: ${ffmpegErrorDetail(cr)}`);
    }

    // 可选字幕烧录（best-effort，需 libass）；失败降级无字幕版但回执 warning。
    const warnings = [];
    let finalLocal = concatFile;
    const srtKey = `tasks/${taskId}/subtitles.srt`;
    if (await minioExists(srtKey)) {
      const srtLocal = await writeLocal(workdir, 'subtitles.srt', srtKey);
      const burned = await burnSubtitles(taskId, workdir, concatFile, srtLocal, subtitleSettings);
      if (burned.file) finalLocal = burned.file;
      else if (burned.warning) warnings.push(burned.warning);
    }

    // 可选 BGM（best-effort）。
    const mixed = await mixBgm(workdir, finalLocal, bgmKey, 0.12);
    const finalBuf = fs.readFileSync(mixed);
    const duration = (await probeDuration(mixed)) ?? null;
    await minioPut(finalKey, finalBuf, 'video/mp4');
    const result = { ok: true, mp4Key: finalKey, size: finalBuf.length, duration, bgm: bgmKey ? 'mixed' : 'none' };
    if (warnings.length > 0) result.warnings = warnings;
    return result;
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Compose-i2v job（L8 i2v）— 逐镜 i2v clip + 配音；缺 clip 回退静态图
// ---------------------------------------------------------------------------

async function handleComposeI2v(taskId, warnings, bgmKey, subtitleSettings) {
  const finalKey = `tasks/${taskId}/final.mp4`;

  // 幂等（U11）。
  if (await minioExists(finalKey)) {
    const stat = await minio.statObject(BUCKET, finalKey);
    return { ok: true, mp4Key: finalKey, size: stat.size, duration: null, note: 'idempotent' };
  }

  let storyboard;
  try {
    storyboard = JSON.parse((await minioGet(`tasks/${taskId}/storyboard.json`)).toString('utf8'));
  } catch {
    throw new Error('missing storyboard.json for compose-i2v');
  }
  const shots = storyboard.shots || [];
  if (shots.length === 0) throw new Error('storyboard has no shots');

  const clipKeys = await minioList(`tasks/${taskId}/clips/`);
  const shotKeys = await minioList(`tasks/${taskId}/shots/`);
  const audioKeys = await minioList(`tasks/${taskId}/audio/`);
  const clipByIndex = {};
  const shotByIndex = {};
  const audioByIndex = {};
  for (const k of clipKeys) clipByIndex[indexFromName(k)] = k;
  for (const k of shotKeys) shotByIndex[indexFromName(k)] = k;
  for (const k of audioKeys) audioByIndex[indexFromName(k)] = k;

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-i2v-'));
  try {
    const segFiles = [];
    const fallbackShots = [];
    let totalDur = 0; // 逐镜时长累计，供 concat 重编码回退推算超时。
    // 统一归一到 Kling 720P 帧（1280x720 yuv420p 25fps），保证 concat -c copy
    // 有效，静态回退（1024x1024）与 clip 异分辨率时也能拼接。
    const NORMALIZE = [
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=25',
      '-pix_fmt', 'yuv420p',
    ];
    for (const shot of shots) {
      const idx = Number(shot.index) || 1;
      const segFile = path.join(workdir, `seg-${idx}.mp4`);
      const audioLocal = audioByIndex[idx]
        ? await writeLocal(workdir, `vo-${idx}.bin`, audioByIndex[idx])
        : null;
      const clipKey = clipByIndex[idx];

      if (clipKey) {
        const clipLocal = await writeLocal(workdir, `clip-${idx}.mp4`, clipKey);
        // 归一重编码耗时按 clip 实际时长推算超时（ffprobe 失败回退 5min 下限）。
        const clipDur = await probeDuration(clipLocal);
        totalDur += clipDur ?? 0;
        const clipTimeout = encodeTimeoutFor(clipDur);
        const vargs = ['-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', ...NORMALIZE];
        let r;
        if (audioLocal) {
          r = await run(FFMPEG_BINARY, ['-y', '-i', clipLocal, '-i', audioLocal, ...vargs, '-shortest', segFile], clipTimeout);
        }
        if (audioLocal && r && r.code === 0 && fs.existsSync(segFile)) {
          segFiles.push(segFile);
          continue;
        }
        if (!audioLocal || r.code !== 0 || !fs.existsSync(segFile)) {
          // 配音 mux 失败/无配音 → 单独取 clip（静音）；仍失败则落到静态回退。
          const cr = await run(FFMPEG_BINARY, ['-y', '-i', clipLocal, '-an', ...vargs, segFile], clipTimeout);
          if (cr.code === 0 && fs.existsSync(segFile)) {
            segFiles.push(segFile);
            continue;
          }
        }
      }

      // 静态回退段（无 clip 或 clip/mux 失败），归一 1280x720 保持 concat 同质。
      const shotKey = shotByIndex[idx];
      if (!shotKey) throw new Error(`missing shot for index ${idx}`);
      fallbackShots.push(idx);
      const shotLocal = await writeLocal(workdir, `shot-${idx}.png`, shotKey);
      const dur = Math.max(0.5, Number(shot.duration) || 5);
      totalDur += dur;
      let r;
      if (audioLocal) {
        r = await run(
          FFMPEG_BINARY,
          [
            '-y', '-loop', '1', '-i', shotLocal, '-i', audioLocal,
            '-t', String(dur),
            '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', ...NORMALIZE,
            '-c:a', 'aac', '-b:a', '128k', '-shortest',
            segFile,
          ],
          encodeTimeoutFor(dur),
        );
      } else {
        r = await run(
          FFMPEG_BINARY,
          [
            '-y', '-loop', '1', '-i', shotLocal,
            '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono',
            '-t', String(dur),
            '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', ...NORMALIZE,
            '-c:a', 'aac', '-b:a', '128k', '-shortest',
            segFile,
          ],
          encodeTimeoutFor(dur),
        );
      }
      if (r.code !== 0 || !fs.existsSync(segFile)) {
        throw new Error(`ffmpeg segment ${idx} failed: ${ffmpegErrorDetail(r)}`);
      }
      segFiles.push(segFile);
    }

    // concat（clip + 静态段混排，同参数 → -c copy；流复制失败回退重编码。
    // PIPELINE_TASK_49：-c copy 也显式按已知累计时长推算超时）。
    const listFile = path.join(workdir, 'list.txt');
    fs.writeFileSync(listFile, segFiles.map((f) => `file '${f}'`).join('\n'));
    const concatFile = path.join(workdir, 'concat.mp4');
    let cr = await run(
      FFMPEG_BINARY,
      ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', concatFile],
      encodeTimeoutFor(totalDur),
    );
    if (cr.code !== 0 || !fs.existsSync(concatFile)) {
      // 重编码回退为全片量级 → 超时按累计时长推算。
      cr = await run(
        FFMPEG_BINARY,
        [
          '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
          '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k',
          concatFile,
        ],
        encodeTimeoutFor(totalDur),
      );
    }
    if (cr.code !== 0 || !fs.existsSync(concatFile)) {
      throw new Error(`ffmpeg concat failed: ${ffmpegErrorDetail(cr)}`);
    }

    // 可选字幕烧录 + BGM（best-effort）；烧录失败降级但并入回执 warnings。
    const burnWarnings = [];
    let finalLocal = concatFile;
    const srtKey = `tasks/${taskId}/subtitles.srt`;
    if (await minioExists(srtKey)) {
      const srtLocal = await writeLocal(workdir, 'subtitles.srt', srtKey);
      const burned = await burnSubtitles(taskId, workdir, concatFile, srtLocal, subtitleSettings);
      if (burned.file) finalLocal = burned.file;
      else if (burned.warning) burnWarnings.push(burned.warning);
    }
    const mixed = await mixBgm(workdir, finalLocal, bgmKey, 0.12);
    const finalBuf = fs.readFileSync(mixed);
    const duration = (await probeDuration(mixed)) ?? null;
    await minioPut(finalKey, finalBuf, 'video/mp4');
    return {
      ok: true,
      mp4Key: finalKey,
      size: finalBuf.length,
      duration,
      mode: 'i2v',
      fallbackShots,
      warnings: [...(Array.isArray(warnings) ? warnings : []), ...burnWarnings],
      bgm: bgmKey ? 'mixed' : 'none',
    };
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------

async function renderLoop() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await redis.blpop('avs:render', 10);
      if (!res) continue; // BLPOP 超时
      const [, val] = res;
      let job;
      try {
        job = JSON.parse(val);
      } catch {
        console.warn('[render] bad job payload, dropped:', val);
        continue;
      }
      const { taskId, type } = job || {};
      if (!taskId || !type) continue;

      // bgm/subtitle/warnings 均由 API 注入 job（render 容器无 DB 访问权）。
      const bgmKey = typeof job.bgmKey === 'string' && job.bgmKey.trim() ? job.bgmKey.trim() : null;
      const subtitleSettings = job.subtitle && typeof job.subtitle === 'object' ? job.subtitle : null;

      let result;
      try {
        if (type === 'srt') result = await handleSrt(taskId, job.subtitleText || null, subtitleSettings);
        else if (type === 'compose') result = await handleCompose(taskId, bgmKey, subtitleSettings);
        else if (type === 'compose-i2v') {
          result = await handleComposeI2v(
            taskId,
            Array.isArray(job.warnings) ? job.warnings : [],
            bgmKey,
            subtitleSettings,
          );
        } else throw new Error(`unknown job type: ${type}`);
      } catch (err) {
        console.error(`[render] ${type} failed for ${taskId}: ${err.message}`);
        result = { ok: false, error: String(err.message || 'render failed') };
      }

      await redis.rpush('avs:render:done', JSON.stringify({ taskId, type, ...result }));
    } catch (err) {
      console.error(`[render] loop error: ${err.message}`);
      await sleep(1000);
    }
  }
}

// ---------------------------------------------------------------------------
// 健康检查（容器 healthcheck）
// ---------------------------------------------------------------------------

function ffmpegVersion() {
  return new Promise((resolve) => {
    execFile(FFMPEG_BINARY, ['-version'], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve({ ok: false, detail: err.message });
      const firstLine = String(stdout).split('\n')[0] || '';
      return resolve({ ok: firstLine.startsWith('ffmpeg version'), detail: firstLine });
    });
  });
}

const server = http.createServer(async (_req, res) => {
  const ff = await ffmpegVersion();
  res.writeHead(ff.ok ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: ff.ok ? 'ok' : 'degraded',
      service: 'render',
      ffmpeg: ff,
      time: new Date().toISOString(),
    }),
  );
});

// 测试模式（RENDER_WORKER_TEST=1）：不启动 HTTP/消费循环，便于容器内单测直接调
// burnSubtitles/encodeTimeoutFor 等验证超时与降级逻辑（见 PIPELINE_TASK_48 验证脚本）。
if (process.env.RENDER_WORKER_TEST === '1') {
  console.log('[render] test mode: server/loop disabled');
} else {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[render] worker listening on :${PORT}`);
  });

  renderLoop().catch((err) => {
    console.error(`[render] render loop terminated: ${err.message}`);
  });
}

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

export { run, encodeTimeoutFor, stripFfmpegBanner, ffmpegErrorDetail, subtitleFontSizeFor, wrapSrtForVideo, burnSubtitles };
