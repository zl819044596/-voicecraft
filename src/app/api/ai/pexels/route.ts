import { jsonError, requireToolUser } from "@/lib/require-tool-auth";

export const maxDuration = 30;

export async function POST(req: Request) {
  const gate = await requireToolUser("pexels");
  if (!gate.ok) return gate.response;

  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    return jsonError(503, "NOT_CONFIGURED", "PEXELS_API_KEY 未配置");
  }

  try {
    const body = (await req.json()) as { query?: string; orientation?: string };
    const query = (body.query || "").trim() || "abstract background";
    const orientation =
      body.orientation === "portrait"
        ? "portrait"
        : body.orientation === "square"
          ? "square"
          : "landscape";

    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "8");
    url.searchParams.set("orientation", orientation);

    const res = await fetch(url, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return jsonError(502, "UPSTREAM", `Pexels 请求失败 (${res.status}): ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      photos?: Array<{ src?: { large?: string; medium?: string; original?: string } }>;
    };
    const photo = data.photos?.[0];
    const imageUrl = photo?.src?.large || photo?.src?.medium || photo?.src?.original;
    if (!imageUrl) {
      return jsonError(404, "NOT_FOUND", "未找到匹配素材");
    }
    return gate.respond({ url: imageUrl, source: "pexels" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return jsonError(500, "INTERNAL", msg);
  }
}
