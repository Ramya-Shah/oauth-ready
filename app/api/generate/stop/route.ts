import { requestStop } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Asks a running generation to stop at its next stage boundary.
export async function POST(req: Request) {
  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  if (!runId) return Response.json({ ok: false, message: "Missing run id." }, { status: 400 });
  await requestStop(String(runId));
  return Response.json({ ok: true });
}
