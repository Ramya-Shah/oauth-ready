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
        <h1 className="hero-h">An hour, or six weeks?</h1>
        <p className="hero-p">
          Before your users can connect an app to your agent, you register an OAuth app with the provider and often wait for
          their review. Each guide shows how much of that is your work, how much is waiting, and what is most likely to stop you.
        </p>
        <form action="/generate" className="row hero-form">
          <label htmlFor="q" className="sr-only">App name or website</label>
          <input id="q" type="text" name="q" placeholder="Any app, e.g. Linear or docusign.com" />
          <button className="btn primary" type="submit">Write a guide</button>
        </form>
      </section>
      <Library curated={curated.map(slim)} generated={generated.map(slim)} />
    </>
  );
}
