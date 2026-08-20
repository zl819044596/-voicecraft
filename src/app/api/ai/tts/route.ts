import { sfTts } from "@/lib/siliconflow";
import { jsonError, requireToolUser } from "@/lib/require-tool-auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  const gate = await requireToolUser("tts");
  if (!gate.ok) return gate.response;

  try {
    const body = (await req.json()) as {
      text?: string;
      voice?: string;
      model?: string;
      speed?: number;
    };
    if (!body.text?.trim()) {
      return jsonError(400, "BAD_REQUEST", "text 必填");
    }

    const buf = await sfTts(body.text, {
      voice: body.voice,
      model: body.model,
      speed: body.speed,
    });
    const b64 = Buffer.from(buf).toString("base64");
    return gate.respond({ audio: b64, format: "mp3" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return jsonError(500, "INTERNAL", msg);
  }
}
