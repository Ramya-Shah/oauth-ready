"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Ev =
  | { type: "stage"; stage: string; status: "start" | "progress" | "done" | "error"; detail: string }
  | { type: "result"; slug: string; cached: boolean }
  | { type: "fatal"; message: string }
  | { type: "heartbeat" };

const STAGE_NAME: Record<string, string> = {
  identify: "Identify the app",
  search: "Search official docs + community",
  fetch: "Read pages",
  probe: "Probe live OAuth endpoints",
  write: "Draft guide from evidence",
  enforce: "Verify every claim",
};

export default function Generator({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const [events, setEvents] = useState<Ev[]>([]);
  const [running, setRunning] = useState(false);
  const [fatal, setFatal] = useState("");
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const router = useRouter();
  const auto = useRef(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  async function run(query: string) {
    if (!query.trim() || running) return;
    setEvents([]); setFatal(""); setRunning(true); setStarted(Date.now());
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      if (!res.ok && res.headers.get("content-type")?.includes("json")) {
        const j = await res.json();
        setFatal(j.message ?? `Error ${res.status}`);
        return;
      }
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as Ev;
          if (ev.type === "heartbeat") continue;
          if (ev.type === "fatal") setFatal(ev.message);
          if (ev.type === "result") { router.push(`/guides/${ev.slug}${ev.cached ? "" : "?new=1"}`); }
          setEvents((e) => [...e, ev]);
        }
      }
    } catch (e) {
      setFatal((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (initial && !auto.current) { auto.current = true; run(initial); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Collapse stage events into rows: latest status per stage + its progress lines.
  const stages: { stage: string; status: string; detail: string; progress: string[] }[] = [];
  for (const e of events) {
    if (e.type !== "stage") continue;
    let s = stages.find((x) => x.stage === e.stage);
    if (!s) { s = { stage: e.stage, status: e.status, detail: e.detail, progress: [] }; stages.push(s); }
    if (e.status === "progress") s.progress.push(e.detail);
    else { s.status = e.status === "error" && s.status === "done" ? "done" : e.status; if (e.status !== "error") s.detail = e.detail; else s.progress.push("⚠ " + e.detail); }
  }

  return (
    <>
      <form className="row" style={{ maxWidth: 620 }} onSubmit={(e) => { e.preventDefault(); run(q); }}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="App name or website — e.g. Linear, quickbooks.intuit.com" aria-label="App name or website" />
        <button className="btn primary" disabled={running}>{running ? "Working…" : "Generate"}</button>
      </form>
      <div className="row small muted" style={{ marginTop: 8 }}>
        Try:{" "}
        {["Linear", "DocuSign", "Pipedrive", "Spotify", "Calendly"].map((x) => (
          <button key={x} className="chip" type="button" onClick={() => { setQ(x); run(x); }} disabled={running}>{x}</button>
        ))}
      </div>

      {(stages.length > 0 || fatal) && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="spread small muted" style={{ marginBottom: 8 }}>
            <span>Agent run</span>
            {started && <span className="mono">{Math.round(((running ? now : now) - started) / 1000)}s</span>}
          </div>
          <ul className="timeline">
            {stages.map((s) => (
              <li key={s.stage}>
                <span className={`dot ${s.status}`} />
                <div>
                  <b>{STAGE_NAME[s.stage] ?? s.stage}</b> <span className="muted small">— {s.detail}</span>
                  {s.progress.length > 0 && (
                    <ul className="small muted" style={{ margin: "4px 0 0", paddingLeft: 16, wordBreak: "break-all" }}>
                      {s.progress.map((p, i) => <li key={i} style={{ display: "list-item" }}>{p}</li>)}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {fatal && <p className="notice" style={{ marginTop: 10 }}>{fatal}</p>}
        </div>
      )}
    </>
  );
}
