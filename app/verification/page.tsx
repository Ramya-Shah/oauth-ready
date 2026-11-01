import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";

export const metadata = { title: "Verification log · OAuth Ready" };
export const dynamic = "force-dynamic";

type Entry = {
  guide: string; claimId?: string; claim: string; method: string;
  outcome: "confirmed" | "corrected" | "unverifiable"; before?: string; after?: string; evidence: string; checkedAt: string;
};
type Log = { summary: string; method: string; lessons?: string[]; entries: Entry[] };

const NAMES: Record<string, string> = { github: "GitHub", slack: "Slack", gmail: "Gmail", hubspot: "HubSpot", notion: "Notion", "microsoft-entra-id": "Microsoft Entra ID" };

const OUT = { confirmed: "tested", corrected: "community", unverifiable: "uncertain" } as const;

export default async function Verification() {
  let log: Log = { summary: "", method: "", entries: [] };
  try { log = JSON.parse(await fs.readFile(path.join(process.cwd(), "data", "verification.json"), "utf8")); } catch {}
  const n = (o: Entry["outcome"]) => log.entries.filter((e) => e.outcome === o).length;
  const guides = [...new Set(log.entries.map((e) => e.guide))];
  return (
    <>
      <section className="sheet page-sheet">
      <h1>Verification log</h1>
      <p className="muted" style={{ maxWidth: 720 }}>{log.summary}</p>
      <div className="row" style={{ margin: "12px 0" }}>
        <span className="pill tested">{n("confirmed")} confirmed</span>
        <span className="pill community">{n("corrected")} corrected</span>
        <span className="pill uncertain">{n("unverifiable")} could not verify</span>
      </div>
      {log.method && <p className="small muted" style={{ maxWidth: 720 }}><b>Method:</b> {log.method}</p>}
      </section>
      {log.lessons?.length ? (
        <>
          <h2>What we learned</h2>
          <ul style={{ maxWidth: 760 }}>{log.lessons.map((l, i) => <li key={i} style={{ marginBottom: 6 }}>{l}</li>)}</ul>
        </>
      ) : null}
      {guides.map((gname) => (
        <section key={gname}>
          <h2><Link href={`/guides/${gname}`}>{NAMES[gname] ?? gname} guide</Link></h2>
          <table>
            <thead><tr><th style={{ width: "34%" }}>Claim</th><th>Outcome</th><th>What we found</th></tr></thead>
            <tbody>
              {log.entries.filter((e) => e.guide === gname).map((e, i) => (
                <tr key={i}>
                  <td>{e.claimId && <span className="mono small muted">{e.claimId} </span>}{e.claim}<div className="small muted">{e.method}</div></td>
                  <td><span className={`pill ${OUT[e.outcome]}`}>{e.outcome}</span></td>
                  <td>
                    {e.before && <div className="small"><b>Before:</b> {e.before}</div>}
                    {e.after && <div className="small"><b>After:</b> {e.after}</div>}
                    <div className="small muted" style={{ wordBreak: "break-word" }}>{e.evidence}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {!log.entries.length && <p className="muted">No verification entries yet.</p>}
    </>
  );
}
