import JSZip from "jszip";

export type PackShot = {
  title: string;
  content: string;
  subtitle: string;
  imagePrompt: string;
  ratio?: string;
  imageUrl: string;
  /** base64 mp3 without data: prefix */
  audioB64?: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function b64ToUint8(b64: string): Uint8Array {
  const raw = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function guessImageExt(urlOrB64: string, ctype?: string): string {
  if (ctype?.includes("jpeg") || ctype?.includes("jpg")) return "jpg";
  if (ctype?.includes("webp")) return "webp";
  if (urlOrB64.startsWith("data:image/jpeg") || urlOrB64.startsWith("data:image/jpg")) return "jpg";
  if (urlOrB64.startsWith("data:image/webp")) return "webp";
  if (/\.jpe?g(\?|$)/i.test(urlOrB64)) return "jpg";
  if (/\.webp(\?|$)/i.test(urlOrB64)) return "webp";
  return "png";
}

async function fetchAsB64(url: string): Promise<{ b64: string; ext: string }> {
  if (url.startsWith("data:")) {
    const i = url.indexOf(",");
    return { b64: i >= 0 ? url.slice(i + 1) : url, ext: guessImageExt(url) };
  }

  // 先直连；失败再走服务端代理（绕过 CORS）
  try {
    const res = await fetch(url);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      return {
        b64: btoa(binary),
        ext: guessImageExt(url, res.headers.get("content-type") || undefined),
      };
    }
  } catch {
    /* fall through */
  }

  const proxy = await fetch("/api/ai/fetch-image", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    credentials: "include",
    body: JSON.stringify({ url }),
  });
  const data = (await proxy.json().catch(() => ({}))) as {
    b64?: string;
    contentType?: string;
    error?: { message?: string } | string;
  };
  if (!proxy.ok || !data.b64) {
    const msg =
      typeof data.error === "string" ? data.error : data.error?.message || `HTTP ${proxy.status}`;
    throw new Error(msg);
  }
  return { b64: data.b64, ext: guessImageExt(url, data.contentType) };
}

function readmeFor(locale: "zh" | "en"): string {
  if (locale === "en") {
    return `AI Video Studio · Asset pack
=============================

Use this when the MP4 is not enough — import into CapCut / Jianying / Premiere.

Contents
--------
script.txt          full narration
storyboard.json     shot metadata
shots/01/           one folder per shot
  image.*           frame
  voice.mp3         voiceover
  subtitle.txt      caption text
  meta.json         title + narration

Suggested workflow
------------------
1. New project matching the export aspect ratio
2. Drop image + voice in shot order
3. Build captions from subtitle.txt or storyboard.json

Stills + voice assets — add transitions, BGM, stickers yourself.
`;
  }
  return `AI Video Studio · 素材包
========================

用途：成片不满意时，把本包导入剪映 / CapCut / Premiere 自己剪。

目录
----
script.txt          完整旁白
storyboard.json     分镜元数据（文案、提示词、比例）
shots/01/           每个镜头一文件夹
  image.*           画面
  voice.mp3         配音
  subtitle.txt      字幕文案
  meta.json         该镜标题与旁白

剪映建议
--------
1. 新建竖版/横版项目（与导出比例一致）
2. 按镜头序号依次放入 image + voice
3. 用 subtitle.txt 做字幕，或对照 storyboard.json

说明：静帧 + 口播素材，可自行加转场、BGM、贴纸。
`;
}

/** 将分镜素材打成 ZIP 并触发浏览器下载 */
export async function downloadStoryboardPack(opts: {
  shots: PackShot[];
  aspect: string;
  voice: string;
  script?: string;
  locale?: "zh" | "en";
  onProgress?: (label: string) => void;
}): Promise<void> {
  const { shots, aspect, voice, script, locale = "zh", onProgress } = opts;
  if (shots.length === 0) throw new Error(locale === "en" ? "No shots to export" : "没有可导出的镜头");

  const missingAudio = shots.findIndex((s) => !s.audioB64);
  if (missingAudio >= 0) {
    throw new Error(
      locale === "en"
        ? `Shot ${missingAudio + 1} has no voiceover`
        : `镜头 ${missingAudio + 1} 缺少配音`,
    );
  }

  const zip = new JSZip();
  const root = zip.folder("avs-export");
  if (!root) throw new Error("ZIP failed");

  root.file("README.txt", readmeFor(locale));

  const board = {
    exportedAt: new Date().toISOString(),
    aspect,
    voice,
    shotCount: shots.length,
    shots: shots.map((s, i) => ({
      index: i + 1,
      title: s.title,
      content: s.content,
      subtitle: s.subtitle || s.content,
      imagePrompt: s.imagePrompt,
      ratio: s.ratio || aspect,
    })),
  };
  root.file("storyboard.json", JSON.stringify(board, null, 2));

  const fullScript =
    script?.trim() ||
    shots.map((s, i) => `[${i + 1}] ${s.title}\n${s.content}`).join("\n\n");
  root.file("script.txt", fullScript);

  const shotsDir = root.folder("shots");
  if (!shotsDir) throw new Error("ZIP failed");

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]!;
    onProgress?.(
      locale === "en"
        ? `Packing shot ${i + 1}/${shots.length}…`
        : `打包镜头 ${i + 1}/${shots.length}…`,
    );
    const folder = shotsDir.folder(pad(i + 1));
    if (!folder) continue;

    const { b64, ext } = await fetchAsB64(shot.imageUrl);
    folder.file(`image.${ext}`, b64ToUint8(b64));
    folder.file("voice.mp3", b64ToUint8(shot.audioB64!));

    const sub = shot.subtitle || shot.content;
    folder.file("subtitle.txt", sub);
    folder.file(
      "meta.json",
      JSON.stringify(
        {
          index: i + 1,
          title: shot.title,
          content: shot.content,
          subtitle: sub,
          imagePrompt: shot.imagePrompt,
          ratio: shot.ratio || aspect,
          hasAudio: true,
        },
        null,
        2,
      ),
    );
  }

  onProgress?.(locale === "en" ? "Building ZIP…" : "生成 ZIP…");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `avs-export-${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
