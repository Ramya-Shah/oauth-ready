import { runPipeline } from "@/lib/pipeline";
import { rateLimit } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Streams NDJSON: one PipelineEvent per line, plus heartbeats every 10s.
export async function POST(req: Request) {
  const { query } = (await req.json().catch(() => ({}))) as { query?: string };
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const limit = Number(process.env.GENERATE_LIMIT_PER_HOUR ?? 5);
  if (!(await rateLimit(`gen:${ip}`, limit, 3600))) {
    return Response.json({ type: "fatal", message: `Rate limit: ${limit} new guides per hour. Browse the library meanwhile.` }, { status: 429 });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const hb = setInterval(() => send({ type: "heartbeat" }), 10_000);
      try {
        for await (const ev of runPipeline(String(query ?? ""))) send(ev);
      } catch (e) {
        send({ type: "fatal", message: (e as Error).message });
      } finally {
        clearInterval(hb);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
