"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Ev =
  | { type: "stage"; stage: string; status: "start" | "progress" | "done" | "error"; detail: string }
  | { type: "slug"; slug: string }
  | { type: "result"; slug: string; cached: boolean }
  | { type: "stopped" }
  | { type: "fatal"; message: string }
  | { type: "heartbeat" };

type Phase = "idle" | "running" | "stopping" | "stopped" | "recovering" | "failed";

const STAGE_NAME: Record<string, string> = {
  identify: "Identify the app",
  search: "Search official docs + community",
  fetch: "Read pages",
  probe: "Probe live OAuth endpoints",
  write: "Draft guide from evidence",
  enforce: "Verify every claim",
};

const RECOVER_FOR_MS = 150_000;
const RECOVER_EVERY_MS = 5_000;

const newRunId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export default function Generator() {
  // Read in the browser so the page itself can be served from cache.
  const initial = useSearchParams().get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [events, setEvents] = useState<Ev[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [started, setStarted] = useState<number | null>(null);
  const [ended, setEnded] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const router = useRouter();
  const auto = useRef(false);
  const runId = useRef("");
  const slug = useRef("");
  const abort = useRef<AbortController | null>(null);
  const userStopped = useRef(false);
  const lastQuery = useRef("");

  const busy = phase === "running" || phase === "stopping" || phase === "recovering";

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [busy]);

  const finish = (p: Phase, msg = "") => {
    setPhase(p);
    setMessage(msg);
    setEnded(Date.now());
  };

  // After a dropped connection the server keeps working; wait for the guide to appear.
  async function recover(s: string) {
    setPhase("recovering");
    setMessage("The connection to the server dropped, but the agent keeps working on the server. Waiting for the guide to finish…");
    const until = Date.now() + RECOVER_FOR_MS;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, RECOVER_EVERY_MS));
      if (userStopped.current) return;
      try {
        const r = await fetch(`/guides/${s}`, { method: "GET", cache: "no-store" });
        if (r.ok) {
          router.push(`/guides/${s}?new=1`);
          return;
        }
      } catch {
        // still offline; keep waiting
      }
    }
    finish("failed", "The connection dropped and the guide hasn't appeared after 2½ minutes. Try again; if it was nearly done, it may still show up in the library shortly.");
  }

  async function run(query: string) {
    if (!query.trim() || busy) return;
    lastQuery.current = query;
    runId.current = newRunId();
    slug.current = "";
    userStopped.current = false;
    abort.current = new AbortController();
    setEvents([]);
    setMessage("");
    setPhase("running");
    setStarted(Date.now());
    setEnded(null);

    let terminal = false;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, runId: runId.current }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) {
        const isJson = res.headers.get("content-type")?.includes("json");
        const j = isJson ? await res.json().catch(() => null) : null;
        return finish("failed", j?.message ?? `The server couldn't start the agent (error ${res.status}). Try again in a moment.`);
      }
      const reader = res.body.getReader();
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
          let ev: Ev;
          try {
            ev = JSON.parse(line) as Ev;
          } catch {
            continue;
          }
          if (ev.type === "heartbeat") continue;
          if (ev.type === "slug") slug.current = ev.slug;
          if (ev.type === "fatal") { terminal = true; finish("failed", ev.message); }
          if (ev.type === "stopped") { terminal = true; finish("stopped", "Stopped. Nothing was saved, and the agent won't use any more of the free quota."); }
          if (ev.type === "result") { terminal = true; router.push(`/guides/${ev.slug}${ev.cached ? "" : "?new=1"}`); }
          setEvents((e) => [...e, ev]);
        }
      }
    } catch {
      if (userStopped.current) return; // the Stop handler already reported it
    }
    if (terminal || userStopped.current) return;
    // The stream ended without a result: the connection dropped mid-run.
    if (slug.current) return recover(slug.current);
    finish("failed", "The connection to the server dropped before the agent got going. Check your internet connection and try again.");
  }

  async function stop() {
    if (phase !== "running") return;
    userStopped.current = true;
    setPhase("stopping");
    setMessage("Stopping after the current step…");
    try {
      await fetch("/api/generate/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: runId.current }) });
    } catch {
      // the abort below still ends this page's part of the run
    }
    abort.current?.abort();
    finish("stopped", "Stopped. Nothing was saved, and the agent won't use any more of the free quota.");
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
    else { s.status = e.status === "error" && s.status === "done" ? "done" : e.status; if (e.status !== "error") s.detail = e.detail; else s.progress.push("Problem: " + e.detail); }
  }
  // A stage left "start" when the run ended didn't finish.
  if (!busy) for (const s of stages) if (s.status === "start") s.status = "error";

  const elapsed = started ? Math.round(((ended ?? now) - started) / 1000) : 0;

  return (
    <>
      <form className="row" style={{ maxWidth: 680 }} onSubmit={(e) => { e.preventDefault(); run(q); }}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="App name or website, e.g. Linear or quickbooks.intuit.com" aria-label="App name or website" disabled={busy} />
        <button className="btn primary" disabled={busy}>{busy ? "Working…" : "Generate"}</button>
        {phase === "running" && <button type="button" className="btn" onClick={stop}>Stop</button>}
      </form>
      <div className="row small muted" style={{ marginTop: 8 }}>
        Try:{" "}
        {["Linear", "DocuSign", "Pipedrive", "Spotify", "Calendly"].map((x) => (
          <button key={x} className="chip" type="button" onClick={() => { setQ(x); run(x); }} disabled={busy}>{x}</button>
        ))}
      </div>

      {(stages.length > 0 || message) && (
        <div className="panel" style={{ marginTop: 20 }} aria-live="polite">
          <div className="spread small muted" style={{ marginBottom: 8 }}>
            <span>Agent run</span>
            {started && <span className="mono">{elapsed}s</span>}
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
          {message && (
            <div className={phase === "failed" ? "notice" : "small"} style={{ marginTop: 10 }}>
              <p style={{ margin: 0 }}>{message}</p>
              {(phase === "failed" || phase === "stopped") && lastQuery.current && (
                <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => run(lastQuery.current)}>Try again</button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
