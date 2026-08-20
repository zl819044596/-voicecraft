'use strict';

/**
 * FFmpeg 合成 HTTP 服务（工具站 v2）。
 * POST /compose — 图片(URL 或 base64)+配音+字幕 → MP4
 * GET  /health
 */

import { execFile } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.PORT || 4002);
const FFMPEG = process.env.FFMPEG_BINARY || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_BINARY || 'ffprobe';
const TIMEOUT = 300_000;
const COMPOSE_SECRET = process.env.COMPOSE_SERVICE_SECRET || '';
const REQUIRE_SECRET = process.env.COMPOSE_REQUIRE_SECRET === '1' || process.env.NODE_ENV === 'production';

function isAuthorized(req) {
  if (!COMPOSE_SECRET) {
    if (REQUIRE_SECRET) return false;
    return true;
  }
  const h = req.headers.authorization || '';
  return h === `Bearer ${COMPOSE_SECRET}`;
}

function run(cmd, args, timeout = TIMEOUT) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function probeDuration(file) {
  const r = await run(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default:noprint_wrappers=1:nokey=1', file,
  ]);
  const n = Number(r.stdout.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
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

function writeBase64File(dir, name, b64) {
  const raw = String(b64).includes(',') ? String(b64).slice(String(b64).indexOf(',') + 1) : String(b64);
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.from(raw, 'base64'));
  return p;
}

function canvasSize(aspect) {
  if (aspect === '16:9') return { w: 1280, h: 720 };
  if (aspect === '1:1') return { w: 1080, h: 1080 };
  return { w: 720, h: 1280 }; // 9:16 default
}

function scalePadFilter(w, h) {
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30`;
}

async function materializeImage(shot, workdir, idx) {
  const img = shot.image || '';
  const dest = path.join(workdir, `shot-${idx}.img`);
  if (/^https?:\/\//i.test(img)) {
    const res = await fetch(img, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`image download failed (${res.status}) for shot ${idx}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return dest;
  }
  if (img.startsWith('data:')) {
    return writeBase64File(workdir, `shot-${idx}.img`, img);
  }
  // bare base64
  return writeBase64File(workdir, `shot-${idx}.img`, img);
}

/**
 * @param {{
 *   shots: Array<{ image: string, audio?: string, duration?: number, subtitle?: string }>,
 *   srt?: string,
 *   aspect?: string
 * }} body
 */
async function handleCompose(body) {
  const shots = body.shots || [];
  if (shots.length === 0) throw new Error('shots 不能为空');

  const { w, h } = canvasSize(body.aspect || '9:16');
  const vf = scalePadFilter(w, h);
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-'));
  try {
    const segFiles = [];
    let totalDur = 0;

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const idx = i + 1;
      const imgLocal = await materializeImage(shot, workdir, idx);
      const segFile = path.join(workdir, `seg-${idx}.mp4`);
      let dur = shot.duration || 5;

      if (shot.audio) {
        const audioLocal = writeBase64File(workdir, `vo-${idx}.mp3`, shot.audio);
        const measured = await probeDuration(audioLocal);
        dur = measured ?? dur;
        const r = await run(FFMPEG, [
          '-y', '-loop', '1', '-i', imgLocal, '-i', audioLocal,
          '-t', String(dur),
          '-vf', vf,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-tune', 'stillimage',
          '-c:a', 'aac', '-b:a', '128k', '-shortest', segFile,
        ]);
        if (r.code !== 0) throw new Error(`segment ${idx} failed: ${r.stderr.slice(-280)}`);
      } else {
        const r = await run(FFMPEG, [
          '-y', '-loop', '1', '-i', imgLocal,
          '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono',
          '-t', String(dur),
          '-vf', vf,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-tune', 'stillimage',
          '-c:a', 'aac', '-shortest', segFile,
        ]);
        if (r.code !== 0) throw new Error(`segment ${idx} failed: ${r.stderr.slice(-280)}`);
      }
      totalDur += dur;
      segFiles.push(segFile);
    }

    let srtPath = null;
    if (body.srt) {
      srtPath = path.join(workdir, 'subtitles.srt');
      fs.writeFileSync(srtPath, body.srt, 'utf8');
    } else {
      const lines = [];
      let t = 0;
      for (let i = 0; i < shots.length; i++) {
        const sub = shots[i].subtitle || '';
        if (!sub) continue;
        const dur = (await probeDuration(segFiles[i])) ?? shots[i].duration ?? 5;
        lines.push(String(i + 1));
        lines.push(`${fmtTime(t)} --> ${fmtTime(t + dur)}`);
        lines.push(sub);
        lines.push('');
        t += dur;
      }
      if (lines.length > 0) {
        srtPath = path.join(workdir, 'subtitles.srt');
        fs.writeFileSync(srtPath, lines.join('\n'), 'utf8');
      }
    }

    const listFile = path.join(workdir, 'list.txt');
    fs.writeFileSync(listFile, segFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    const concatFile = path.join(workdir, 'concat.mp4');
    const cr = await run(FFMPEG, [
      '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', concatFile,
    ]);
    if (cr.code !== 0) throw new Error(`concat failed: ${cr.stderr.slice(-280)}`);

    let finalFile = concatFile;
    if (srtPath && fs.existsSync(srtPath)) {
      const burned = path.join(workdir, 'burned.mp4');
      const style = 'force_style=FontName=Noto Sans CJK SC\\,FontSize=36\\,WrapStyle=2\\,Alignment=2\\,MarginV=40';
      const br = await run(FFMPEG, [
        '-y', '-i', concatFile,
        '-vf', `subtitles=${srtPath}:${style}`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-c:a', 'copy', burned,
      ], Math.max(TIMEOUT, totalDur * 2000 + 30000));
      if (br.code === 0 && fs.existsSync(burned)) finalFile = burned;
    }

    return fs.readFileSync(finalFile);
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const r = await run(FFMPEG, ['-version'], 5000);
    const ok = r.stdout.startsWith('ffmpeg version');
    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok,
      service: 'compose',
      ffmpeg: r.stdout.split('\n')[0],
      authRequired: Boolean(COMPOSE_SECRET) || REQUIRE_SECRET,
    }));
    return;
  }

  if (req.method === 'POST' && req.url === '/compose') {
    if (!isAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    const chunks = [];
    req.on('data', (c) => { chunks.push(c); });
    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(body);
        const mp4 = await handleCompose(parsed);
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': mp4.length });
        res.end(mp4);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'compose failed' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[compose] listening on :${PORT} secret=${COMPOSE_SECRET ? 'on' : 'off'}`);
});
