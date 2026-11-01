import { listCurated, listGenerated } from "@/lib/store";
import Library from "@/components/Library";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [curated, generated] = await Promise.all([listCurated(), listGenerated(30)]);
  const slim = (g: Awaited<ReturnType<typeof listCurated>>[number]) => ({
    slug: g.slug,
    name: g.name,
    origin: g.origin,
    officialDomain: g.officialDomain,
    difficulty: g.verdict.difficulty,
    wait: g.verdict.approvalWait,
    topBlocker: g.verdict.topBlocker,
    effort: g.verdict.activeEffortHours,
    counts: g.claims.reduce((a, c) => ((a[c.label] = (a[c.label] ?? 0) + 1), a), {} as Record<string, number>),
    reviewed: !!g.reviewedAt,
  });
  return (
    <>
      <section className="hero">
        <h1>How long until your users can connect?</h1>
        <p className="muted">
          Setup and approval guides for provider OAuth apps — difficulty, hands-on effort vs. waiting on review, the blocker most
          likely to stop you, and which steps an agent can do for you. Every claim is labelled{" "}
          <span className="pill tested">tested</span> <span className="pill sourced">official source</span>{" "}
          <span className="pill community">community</span> or <span className="pill uncertain">uncertain</span>.
        </p>
        <form action="/generate" className="row" style={{ maxWidth: 560, marginTop: 16 }}>
          <input type="text" name="q" placeholder="Any app name or website — e.g. Linear, docusign.com" aria-label="App name or website" />
          <button className="btn primary" type="submit">Generate guide</button>
        </form>
      </section>
      <Library curated={curated.map(slim)} generated={generated.map(slim)} />
    </>
  );
}
