import { sfChat, SCRIPT_SYSTEM } from "@/lib/siliconflow";
import { jsonError, requireToolUser } from "@/lib/require-tool-auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  const gate = await requireToolUser("script");
  if (!gate.ok) return gate.response;

  try {
    const body = (await req.json()) as { topic?: string; tone?: string };
    if (!body.topic?.trim()) {
      return jsonError(400, "BAD_REQUEST", "topic 必填");
    }

    const tone = body.tone || "专业、亲切";
    const content = await sfChat([
      { role: "system", content: SCRIPT_SYSTEM },
      {
        role: "user",
        content: `主题：${body.topic}\n语气：${tone}`,
      },
    ]);

    return gate.respond({ script: content.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return jsonError(500, "INTERNAL", msg);
  }
}
