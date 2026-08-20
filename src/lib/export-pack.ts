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

function guessImageExt(urlOrB64: string): string {
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`拉取图片失败 (${res.status})`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const ctype = res.headers.get("content-type") || "";
  let ext = "png";
  if (ctype.includes("jpeg") || ctype.includes("jpg")) ext = "jpg";
  else if (ctype.includes("webp")) ext = "webp";
  else ext = guessImageExt(url);
  return { b64: btoa(binary), ext };
}

const README = `AI Video Studio · 素材包
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

/** 将分镜素材打成 ZIP 并触发浏览器下载 */
export async function downloadStoryboardPack(opts: {
  shots: PackShot[];
  aspect: string;
  voice: string;
  script?: string;
  onProgress?: (label: string) => void;
}): Promise<void> {
  const { shots, aspect, voice, script, onProgress } = opts;
  if (shots.length === 0) throw new Error("没有可导出的镜头");

  const zip = new JSZip();
  const root = zip.folder("avs-export");
  if (!root) throw new Error("无法创建压缩包");

  root.file("README.txt", README);

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
    shots.map((s, i) => `【${i + 1}】${s.title}\n${s.content}`).join("\n\n");
  root.file("script.txt", fullScript);

  const shotsDir = root.folder("shots");
  if (!shotsDir) throw new Error("无法创建 shots 目录");

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]!;
    onProgress?.(`打包镜头 ${i + 1}/${shots.length}…`);
    const folder = shotsDir.folder(pad(i + 1));
    if (!folder) continue;

    const { b64, ext } = await fetchAsB64(shot.imageUrl);
    folder.file(`image.${ext}`, b64ToUint8(b64));

    if (shot.audioB64) {
      folder.file("voice.mp3", b64ToUint8(shot.audioB64));
    }

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
          hasAudio: Boolean(shot.audioB64),
        },
        null,
        2,
      ),
    );
  }

  onProgress?.("生成 ZIP…");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `avs-export-${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
