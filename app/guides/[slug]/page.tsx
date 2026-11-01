import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGuide } from "@/lib/store";
import { DIFFICULTY_RUBRIC, formatWait, labelCounts, type Guide } from "@/lib/schema";
import { toMarkdown } from "@/lib/markdown";
import { Difficulty, EvidenceBar, Refs, LABEL_TEXT, LABEL_HELP } from "@/components/bits";
import ShareBar from "@/components/ShareBar";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const g = await getGuide((await params).slug);
  return g
    ? { title: `${g.name} OAuth app guide · OAuth Ready`, description: `${DIFFICULTY_RUBRIC[g.verdict.difficulty]} · wait ${formatWait(g.verdict.approvalWait)} · ${g.verdict.topBlocker}` }
    : { title: "Guide not found" };
}

const PHASES = [
  { k: "dev", t: "1 · Create the app", d: "Register the OAuth app and get credentials." },
  { k: "test", t: "2 · Test with your own account", d: "Connect yourself or test users before any review." },
  { k: "production", t: "3 · Go to production", d: "Let any customer connect — review, verification, listing." },
] as const;

const OWNER = { agent: "🤖 Agent can do", you: "🧑 You", provider: "⌛ Provider" } as const;

export default async function GuidePage({ params }: P) {
  const g = await getGuide((await params).slug);
  if (!g) notFound();
  const v = g.verdict;
  const counts = labelCounts(g);
  const owners = { agent: 0, you: 0, provider: 0 };
  const ownerMin = { agent: 0, you: 0, provider: 0 };
  for (const s of g.steps) { owners[s.owner]++; ownerMin[s.owner] += s.minutes ?? 0; }

  return (
    <article>
      <div className="spread">
        <div>
          <div className="small muted">
            {g.origin === "curated" ? "Library guide" : "Agent-generated guide"} · {g.officialDomain} · generated {g.generatedAt.slice(0, 10)}
            {g.reviewedAt ? ` · human-reviewed ${g.reviewedAt.slice(0, 10)}` : ""}
            {g.model ? ` · drafted by ${g.model}` : ""}
          </div>
          <h1>{g.name}: OAuth app setup &amp; approval</h1>
        </div>
        <ShareBar markdown={toMarkdown(g)} />
      </div>

      {g.supportsOAuth === false && <p className="notice">The agent found no OAuth 2.0 support for third-party apps. Check the evidence below before relying on this.</p>}
      {g.origin === "generated" && (
        <p className="notice" style={{ marginTop: 12 }}>
          Generated live by an agent. Only endpoint probes can be <b>tested</b> automatically; timelines and costs are at best quoted from sources. Check the evidence before you commit to a launch date.
        </p>
      )}

      <section className="verdict" style={{ marginTop: 16 }}>
        <div><div className="k">Difficulty</div><div className="v row"><Difficulty n={v.difficulty} /> {v.difficulty}/5</div><div className="small muted">{DIFFICULTY_RUBRIC[v.difficulty]}</div></div>
        <div><div className="k">Hands-on effort</div><div className="v">{v.activeEffortHours.min}–{v.activeEffortHours.max} h</div><div className="small muted">your team's active work</div></div>
        <div><div className="k">Approval wait</div><div className="v">{formatWait(v.approvalWait)}</div><div className="small muted">calendar time on the provider</div></div>
        <div><div className="k">Evidence</div><EvidenceBar counts={counts} /></div>
      </section>
      <div className="blocker">
        <b>Most likely blocker:</b> {v.topBlocker}
        <p style={{ margin: "6px 0 0" }}>{v.summary}<Refs ids={v.claimIds} claims={g.claims} /></p>
      </div>

      {g.reviewNote && <p className="small muted" style={{ marginTop: 10 }}><b>Review note:</b> {g.reviewNote} <a href="/verification">See verification log →</a></p>}

      <h2>Who does what</h2>
      <div className="split">
        {(["agent", "you", "provider"] as const).map((o) => (
          <div key={o} className="panel">
            <div className={`pill ${o}`}>{OWNER[o]}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 600, marginTop: 6 }}>{owners[o]} step{owners[o] === 1 ? "" : "s"}</div>
            <div className="small muted">
              {o === "agent" && "Drafting, form-filling once you're signed in, configuring redirect URIs & scopes, running test flows."}
              {o === "you" && "Anything needing your identity, legal entity, payment, sign-in or judgment."}
              {o === "provider" && "Review queues and verification you can only wait on."}
              {ownerMin[o] ? ` ~${Math.round(ownerMin[o] / 6) / 10} h total.` : ""}
            </div>
          </div>
        ))}
      </div>

      <h2>Steps</h2>
      {PHASES.map((p) => {
        const steps = g.steps.filter((s) => s.phase === p.k);
        if (!steps.length) return null;
        return (
          <section key={p.k} className="phase">
            <div className="phase-h"><h3>{p.t}</h3><span className="small muted">{p.d}</span></div>
            <ol className="steps">
              {steps.map((s) => (
                <li key={s.id}>
                  <div className="spread">
                    <b>{s.title}</b>
                    <span className="row small"><span className={`pill ${s.owner}`}>{OWNER[s.owner]}</span>{s.minutes ? <span className="muted">~{s.minutes} min</span> : null}</span>
                  </div>
                  <div style={{ marginTop: 4 }}>{s.detail}<Refs ids={s.claimIds} claims={g.claims} /></div>
                  {s.links.length > 0 && <div className="small" style={{ marginTop: 4 }}>{s.links.map((l) => <a key={l} href={l} target="_blank" rel="noreferrer" style={{ marginRight: 12, wordBreak: "break-all" }}>{l.replace(/^https:\/\//, "")}</a>)}</div>}
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      {g.requirements.length > 0 && (
        <>
          <h2>Requirements</h2>
          <table>
            <thead><tr><th>Requirement</th><th>Needed for</th><th>Details</th></tr></thead>
            <tbody>
              {g.requirements.map((r, i) => (
                <tr key={i}><td><b>{r.kind.replace(/_/g, " ")}</b></td><td>{r.requiredFor}</td><td>{r.note}<Refs ids={r.claimIds} claims={g.claims} /></td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {g.scopes.length > 0 && (
        <>
          <h2>Scopes that change your path</h2>
          <table>
            <thead><tr><th>Scope</th><th>Triggers review?</th><th>Notes</th></tr></thead>
            <tbody>
              {g.scopes.map((s, i) => (
                <tr key={i}><td><code>{s.scope}</code></td><td>{s.triggersReview === "unknown" ? <span className="pill uncertain">unknown</span> : s.triggersReview ? <span className="pill you">yes</span> : <span className="pill tested">no</span>}</td><td>{s.note}<Refs ids={s.claimIds} claims={g.claims} /></td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {g.blockers.length > 0 && (
        <>
          <h2>When you get stuck</h2>
          <table>
            <thead><tr><th>Symptom</th><th>Why</th><th>How to unblock</th></tr></thead>
            <tbody>
              {g.blockers.map((b, i) => (
                <tr key={i}><td><b>{b.symptom}</b></td><td>{b.cause}</td><td>{b.unblock}<Refs ids={b.claimIds} claims={g.claims} /></td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {g.reviewAdditions.length > 0 && (
        <>
          <h2>Added in human review</h2>
          <p className="small muted">Things the agent missed that a reviewer found in the provider's documentation.</p>
          <ul>{g.reviewAdditions.map((a, i) => <li key={i}>{a.text}<Refs ids={a.claimIds} claims={g.claims} /></li>)}</ul>
        </>
      )}

      {g.gaps.length > 0 && (
        <>
          <h2>What we couldn't determine</h2>
          <ul>{g.gaps.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>
      )}

      <Evidence g={g} />
    </article>
  );
}

function Evidence({ g }: { g: Guide }) {
  return (
    <>
      <h2>Evidence</h2>
      <p className="small muted">
        Labels are assigned by code, not the model: <b>tested</b> requires a probe or setup attempt run by us; <b>official source</b> requires the quote to appear verbatim on a fetched page on the provider's domain.
      </p>
      <div className="panel" style={{ padding: 0 }}>
        {g.claims.map((c) => (
          <div key={c.id} id={c.id} className="claim">
            <div className="row">
              <span className="mono small muted">{c.id}</span>
              <span className={`pill ${c.label}`} title={LABEL_HELP[c.label]}>{LABEL_TEXT[c.label]}</span>
              <span>{c.text}</span>
            </div>
            {c.quote && <blockquote>“{c.quote}”</blockquote>}
            {c.method && <div className="small muted" style={{ marginTop: 4 }}>Method: {c.method} · {c.checkedAt.slice(0, 16).replace("T", " ")} UTC</div>}
            {c.artifact && <pre>{c.artifact}</pre>}
            {c.note && <div className="small muted" style={{ marginTop: 4 }}>{c.note}</div>}
            {c.url && <div className="small" style={{ marginTop: 4, wordBreak: "break-all" }}><a href={c.url} target="_blank" rel="noreferrer">{c.url}</a></div>}
          </div>
        ))}
      </div>
      {g.sourcesConsulted.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="small muted">Pages the agent read ({g.sourcesConsulted.length})</summary>
          <ul className="small">{g.sourcesConsulted.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a> · {s.official ? "official" : "community"}{s.fetched ? "" : " · via search extract"}</li>)}</ul>
        </details>
      )}
    </>
  );
}
