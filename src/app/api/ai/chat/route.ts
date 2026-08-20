import { sfChat, type ChatMessage } from "@/lib/siliconflow";
import { jsonError, requireToolUser } from "@/lib/require-tool-auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  const gate = await requireToolUser("chat");
  if (!gate.ok) return gate.response;

  try {
    const body = (await req.json()) as {
      messages?: ChatMessage[];
      system?: string;
      prompt?: string;
      model?: string;
      temperature?: number;
    };

    let messages: ChatMessage[] = body.messages || [];
    if (body.system && body.prompt) {
      messages = [
        { role: "system", content: body.system },
        { role: "user", content: body.prompt },
      ];
    }
    if (messages.length === 0) {
      return jsonError(400, "BAD_REQUEST", "messages 或 prompt 必填");
    }

    const content = await sfChat(messages, {
      model: body.model,
      temperature: body.temperature,
    });
    return gate.respond({ content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return jsonError(500, "INTERNAL", msg);
  }
}
