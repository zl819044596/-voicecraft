import { jsonError, requireToolUser } from "@/lib/require-tool-auth";

export const maxDuration = 30;

function fmtTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(ss)},${p(ms, 3)}`;
}

export async function POST(req: Request) {
  const gate = await requireToolUser("subtitles");
  if (!gate.ok) return gate.response;

  try {
    const body = (await req.json()) as {
      lines?: string[];
      durations?: number[];
    };
    const lines = body.lines?.filter((l) => l.trim()) || [];
    if (lines.length === 0) {
      return jsonError(400, "BAD_REQUEST", "lines 必填");
    }

    const durations = body.durations || lines.map(() => 3);
    const srtLines: string[] = [];
    let t = 0;
    for (let i = 0; i < lines.length; i++) {
      const dur = durations[i] ?? 3;
      srtLines.push(String(i + 1));
      srtLines.push(`${fmtTime(t)} --> ${fmtTime(t + dur)}`);
      srtLines.push(lines[i]!);
      srtLines.push("");
      t += dur;
    }

    return gate.respond({ srt: srtLines.join("\n") });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return jsonError(500, "INTERNAL", msg);
  }
}
