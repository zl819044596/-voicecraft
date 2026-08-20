import { sfImage } from "@/lib/siliconflow";
import { jsonError, requireToolUser } from "@/lib/require-tool-auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  const gate = await requireToolUser("image");
  if (!gate.ok) return gate.response;

  try {
    const body = (await req.json()) as {
      prompt?: string;
      aspect?: string;
      model?: string;
      seed?: number;
    };
    if (!body.prompt?.trim()) {
      return jsonError(400, "BAD_REQUEST", "prompt 必填");
    }

    const url = await sfImage(body.prompt, {
      aspect: body.aspect,
      model: body.model,
      seed: body.seed,
    });
    return gate.respond({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return jsonError(500, "INTERNAL", msg);
  }
}
