import {
  sfChat,
  STORYBOARD_SYSTEM,
  extractJson,
  type Shot,
} from "@/lib/siliconflow";
import { jsonError, requireToolUser } from "@/lib/require-tool-auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  const gate = await requireToolUser("storyboard");
  if (!gate.ok) return gate.response;

  try {
    const body = (await req.json()) as { text?: string; aspect?: string };
    if (!body.text?.trim()) {
      return jsonError(400, "BAD_REQUEST", "text 必填");
    }

    const aspect = body.aspect || "16:9";
    const content = await sfChat([
      { role: "system", content: STORYBOARD_SYSTEM },
      {
        role: "user",
        content: `文案：\n${body.text}\n\n画面比例：${aspect}`,
      },
    ]);

    const parsed = extractJson<{ shots: Shot[] }>(content);
    const shots = (parsed.shots || []).map((s) => ({
      ...s,
      imageUrl: null,
      ratio: (s.ratio || aspect) as Shot["ratio"],
    }));

    return gate.respond({ shots });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return jsonError(500, "INTERNAL", msg);
  }
}
