import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGuide } from "@/lib/store";
import { DIFFICULTY_RUBRIC, formatWait, labelCounts, type DayRange, type Guide } from "@/lib/schema";
import { toMarkdown } from "@/lib/markdown";
import { Refs, LABEL_TEXT, LABEL_HELP } from "@/components/bits";
import ShareBar from "@/components/ShareBar";
import OpenEvidenceOnLink from "@/components/OpenEvidenceOnLink";
import CurrentStep from "@/components/CurrentStep";
import { hoursText, waitText } from "@/components/RouteBar";
import "./print.css";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const g = await getGuide((await params).slug);
  return g
    ? { title: `${g.name} OAuth app guide | OAuth Ready`, description: `${DIFFICULTY_RUBRIC[g.verdict.difficulty]}. Wait: ${formatWait(g.verdict.approvalWait)}. ${g.verdict.topBlocker}` }
    : { title: "Guide not found" };
}

const PHASES = [
  { k: "dev", t: "Create the app" },
  { k: "test", t: "Test with your own account" },
  { k: "production", t: "Go to production" },
] as const;

const OWNER = { agent: "Agent can do this", you: "You", provider: "Provider wait" } as const;

// Same square-root scale as the library: 0 to 90 days, hands-on hours at 6 per working day.
const MAX_DAYS = 90;
const x = (days: number) => Math.min(100, Math.sqrt(Math.max(0, days) / MAX_DAYS) * 100);
const TICKS = [
  { d: 0, t: "Start" },
  { d: 1, t: "1 day" },
  { d: 7, t: "1 week" },
  { d: 30, t: "1 month" },
  { d: 90, t: "3 months" },
];

function Schedule({ effort, wait }: { effort: { min: number; max: number }; wait: DayRange }) {
  const workEnd = Math.max(x(effort.max / 6), 0.8);
  const known = wait !== "unknown";
  const none = known && wait.maxDays === 0;
  const minEnd = known ? x(effort.max / 6 + wait.minDays) : workEnd;
  const maxEnd = known ? x(effort.max / 6 + wait.maxDays) : 100;
  return (
    <figure className="cp-axis" aria-label={`${hoursText(effort)} of hands-on work, ${waitText(wait)}`}>
      <div className="cp-axis-ticks" aria-hidden>
        {TICKS.map((t) => (
          <span key={t.d} style={{ left: `${x(t.d)}%` }}>{t.t}</span>
        ))}
      </div>
      <div className="cp-axis-field" aria-hidden>
        {TICKS.map((t) => <i key={t.d} style={{ left: `${x(t.d)}%` }} />)}
        <div className="cp-lane">
          <span className="cp-work" style={{ width: `${workEnd}%` }} />
        </div>
        <div className="cp-lane">
          {none ? (
            <span className="cp-none" style={{ left: `${workEnd}%`, right: 0 }}>No provider review before any user can connect</span>
          ) : known ? (
            <>
              {wait.minDays > 0 && <span className="cp-wait" style={{ left: `${workEnd}%`, width: `${minEnd - workEnd}%` }} />}
              <span className="cp-maybe" style={{ left: `${minEnd}%`, width: `${maxEnd - minEnd}%` }} />
            </>
          ) : (
            <span className="cp-unknown" style={{ left: `${workEnd}%`, right: 0 }}>Review time not published</span>
          )}
        </div>
      </div>
      <figcaption>
        <span><i className="cp-key cp-key-work" />Your work, {hoursText(effort)}</span>
        {!none && known && <span><i className="cp-key cp-key-wait" />Provider wait, {formatWait(wait)}</span>}
      </figcaption>
    </figure>
  );
}

export default async function GuidePage({ params }: P) {
  const g = await getGuide((await params).slug);
  if (!g) notFound();
  const v = g.verdict;
  const counts = labelCounts(g);
  const checked = counts.tested + counts.sourced;
  const owners = { agent: 0, you: 0, provider: 0 };
  for (const s of g.steps) owners[s.owner]++;
  let n = 0;

  return (
    <article className="cp">
      <div className="cp-sheet">
        <header className="cp-strip">
          <Link href="/" className="cp-brand">OAuth Ready</Link>
          <nav aria-label="Site">
            <Link href="/">Library</Link>
            <Link href="/generate">Generate</Link>
            <Link href="/verification">Verification</Link>
            <Link href="/about">How it works</Link>
          </nav>
          <div className="cp-share"><ShareBar markdown={toMarkdown(g)} /></div>
        </header>

        <div className="cp-head">
          <h1 className="cp-title">
            {g.name}: {hoursText(v.activeEffortHours)} of work, <mark>{waitText(v.approvalWait)}.</mark>
          </h1>
          <p className="cp-lede">{v.summary}<Refs ids={v.claimIds} claims={g.claims} /></p>
        </div>

        <Schedule effort={v.activeEffortHours} wait={v.approvalWait} />

        <div className="cp-foot">
          <section className="cp-stop" aria-labelledby="cp-stop-h">
            <h2 id="cp-stop-h">Most likely to stop you</h2>
            <p>{v.topBlocker}</p>
          </section>
            <dl className="cp-block" aria-label="Sheet details">
            <div className="cp-block-name"><dt>Sheet</dt><dd>{g.name} OAuth app</dd></div>
            <div><dt>Difficulty</dt><dd>{v.difficulty} of 5</dd></div>
            <div><dt>Facts checked</dt><dd>{checked} of {g.claims.length}</dd></div>
            <div><dt>Agent can do</dt><dd>{owners.agent} of {g.steps.length} steps</dd></div>
            <div><dt>Checked</dt><dd>{g.reviewedAt ? g.reviewedAt.slice(0, 10) : g.origin === "curated" ? "Not yet" : "Agent only"}</dd></div>
            <div className="cp-block-wide"><dt>Scale</dt><dd>{DIFFICULTY_RUBRIC[v.difficulty]}</dd></div>
            </dl>
        </div>

        {(g.supportsOAuth === false || g.origin === "generated") && (
          <p className="cp-note">
            {g.supportsOAuth === false
              ? "The agent found no OAuth 2.0 support for third-party apps. Check the evidence before relying on this."
              : "Written live by an agent. It tests endpoints itself; timelines and costs come from what it read. Check the evidence before you commit to a launch date."}
          </p>
        )}
      </div>

      <section className="cp-schedule" aria-labelledby="cp-steps-h">
        <div className="cp-schedule-head">
          <h2 id="cp-steps-h">Schedule</h2>
          <ul className="cp-legend">
            {(["agent", "you", "provider"] as const).map((o) => (
              <li key={o}><i className={`cp-mk cp-mk-${o}`} aria-hidden />{OWNER[o]} ({owners[o]})</li>
            ))}
          </ul>
        </div>
        {PHASES.map((p) => {
          const steps = g.steps.filter((s) => s.phase === p.k);
          if (!steps.length) return null;
          return (
            <div key={p.k} className="cp-phase">
              <h3>{p.t}</h3>
              <ol>
                {steps.map((s) => {
                  n++;
                  return (
                    <li key={s.id} id={`step-${n}`} className={`cp-row cp-row-${s.owner}${s.owner === "provider" && !/^\((optional|marketplace path)\)/i.test(s.title) ? " cp-row-required" : ""}`}>
                      <span className="cp-num">{n}</span>
                      <div className="cp-task">
                        <b>{s.title}</b>
                        <p>{s.detail}<Refs ids={s.claimIds} claims={g.claims} /></p>
                        {s.links.length > 0 && (
                          <p className="cp-links">{s.links.map((l) => <a key={l} href={l} target="_blank" rel="noreferrer">{l.replace(/^https:\/\//, "")}</a>)}</p>
                        )}
                      </div>
                      <span className="cp-owner"><i className={`cp-mk cp-mk-${s.owner}`} aria-hidden />{OWNER[s.owner]}</span>
                      <span className="cp-dur">{s.minutes ? `${s.minutes} min` : ""}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
        <CurrentStep />
      </section>

      <div className="cp-ref">
        {g.reviewNote && (
          <section className="cp-col">
            <h2>Review note</h2>
            <p className="cp-review">{g.reviewNote} <Link href="/verification">See the verification log</Link></p>
          </section>
        )}
        {g.requirements.length > 0 && (
          <section>
            <h2>Requirements</h2>
            <table>
              <thead><tr><th>Requirement</th><th>Needed for</th><th>Details</th></tr></thead>
              <tbody>
                {g.requirements.map((r, i) => (
                  <tr key={i}><td><b>{r.kind.replace(/_/g, " ")}</b></td><td>{r.requiredFor}</td><td>{r.note}<Refs ids={r.claimIds} claims={g.claims} /></td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {g.scopes.length > 0 && (
          <section>
            <h2>Scopes that change your path</h2>
            <table>
              <thead><tr><th>Scope</th><th>Triggers review</th><th>Notes</th></tr></thead>
              <tbody>
                {g.scopes.map((s, i) => (
                  <tr key={i}>
                    <td><code>{s.scope}</code></td>
                    <td><span className={`cp-yn cp-yn-${s.triggersReview === "unknown" ? "unknown" : s.triggersReview ? "yes" : "no"}`}>{s.triggersReview === "unknown" ? "Unknown" : s.triggersReview ? "Yes" : "No"}</span></td>
                    <td>{s.note}<Refs ids={s.claimIds} claims={g.claims} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {g.blockers.length > 0 && (
          <section>
            <h2>When you get stuck</h2>
            <table>
              <thead><tr><th>What you see</th><th>Why</th><th>How to unblock</th></tr></thead>
              <tbody>
                {g.blockers.map((b, i) => (
                  <tr key={i}><td><b>{b.symptom}</b></td><td>{b.cause}</td><td>{b.unblock}<Refs ids={b.claimIds} claims={g.claims} /></td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {g.reviewAdditions.length > 0 && (
          <section className="cp-col">
            <h2>Added in human review</h2>
            <p className="cp-quiet">Things the agent missed that a reviewer found in the provider&apos;s documentation.</p>
            <ul>{g.reviewAdditions.map((a, i) => <li key={i}>{a.text}<Refs ids={a.claimIds} claims={g.claims} /></li>)}</ul>
          </section>
        )}

        {g.gaps.length > 0 && (
          <section className="cp-col">
            <h2>What we couldn&apos;t determine</h2>
            <ul>{g.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul>
          </section>
        )}

        <Evidence g={g} />
      </div>
    </article>
  );
}

function Evidence({ g }: { g: Guide }) {
  return (
    <section className="cp-col">
      <h2>Evidence</h2>
      <p className="cp-quiet">
        Code assigns every label, not the model. <b>Tested</b> means we ran a probe or setup attempt. <b>Official source</b> means the quote appears word for word on a fetched page on the provider&apos;s domain.
      </p>
      <details id="evidence" className="cp-evidence">
        <summary>Show all {g.claims.length} facts and where each came from</summary>
        <div className="cp-claims">
          {g.claims.map((c) => (
            <div key={c.id} id={c.id} className="cp-claim">
              <div className="cp-claim-head">
                <span className="cp-cid">{c.id}</span>
                <span className={`cp-label cp-label-${c.label}`} title={LABEL_HELP[c.label]}>{LABEL_TEXT[c.label]}</span>
              </div>
              <p>{c.text}</p>
              {c.quote && <blockquote>&ldquo;{c.quote}&rdquo;</blockquote>}
              {c.method && <p className="cp-quiet">{c.method}, {c.checkedAt.slice(0, 16).replace("T", " ")} UTC</p>}
              {c.artifact && <pre>{c.artifact}</pre>}
              {c.note && <p className="cp-quiet">{c.note}</p>}
              {c.url && <p className="cp-url"><a href={c.url} target="_blank" rel="noreferrer">{c.url}</a></p>}
            </div>
          ))}
        </div>
      </details>
      <OpenEvidenceOnLink />
      {g.sourcesConsulted.length > 0 && (
        <details className="cp-pages">
          <summary>Pages the agent read ({g.sourcesConsulted.length})</summary>
          <ul>{g.sourcesConsulted.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a> ({s.official ? "official" : "community"}{s.fetched ? "" : ", read from the search engine's copy"})</li>)}</ul>
        </details>
      )}
    </section>
  );
}
