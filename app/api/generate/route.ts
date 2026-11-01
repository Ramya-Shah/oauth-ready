import { runPipeline, friendlyError } from "@/lib/pipeline";
import { rateLimit, isStopRequested } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Streams NDJSON: one PipelineEvent per line, plus heartbeats every 10s.
// If the browser disconnects, the run keeps going and saves the guide, so the page can
// recover it by slug. Only an explicit Stop (POST /api/generate/stop with the runId) ends a run early.
export async function POST(req: Request) {
  const { query, runId } = (await req.json().catch(() => ({}))) as { query?: string; runId?: string };
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const limit = Number(process.env.GENERATE_LIMIT_PER_HOUR ?? 5);
  if (!(await rateLimit(`gen:${ip}`, limit, 3600))) {
    return Response.json(
      { type: "fatal", message: `You've written ${limit} new guides this hour, the limit for this free demo. Browse the library, or try again in an hour.` },
      { status: 429 },
    );
  }

  const enc = new TextEncoder();
  let open = true;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch {
          open = false;
        }
      };
      const hb = setInterval(() => send({ type: "heartbeat" }), 10_000);
      try {
        const shouldStop = runId ? () => isStopRequested(String(runId)) : undefined;
        for await (const ev of runPipeline(String(query ?? ""), { shouldStop })) send(ev);
      } catch (e) {
        send({ type: "fatal", message: friendlyError(e, "writing the guide") });
      } finally {
        clearInterval(hb);
        if (open) {
          open = false;
          try { controller.close(); } catch {}
        }
      }
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
