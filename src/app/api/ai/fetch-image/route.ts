import { jsonError, requireToolUser } from "@/lib/require-tool-auth";

export const maxDuration = 60;

/** 服务端拉取外链图片（绕过浏览器 CORS），供素材包打包用 */
export async function POST(req: Request) {
  const gate = await requireToolUser("pexels");
  if (!gate.ok) return gate.response;

  try {
    const body = (await req.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return jsonError(400, "BAD_REQUEST", "需要 http(s) 图片 URL");
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) {
      return jsonError(502, "FETCH_FAILED", `拉取图片失败 (${res.status})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 12 * 1024 * 1024) {
      return jsonError(413, "TOO_LARGE", "图片过大");
    }
    const ctype = res.headers.get("content-type") || "image/png";
    return gate.respond({
      b64: buf.toString("base64"),
      contentType: ctype,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return jsonError(500, "INTERNAL", msg);
  }
}
