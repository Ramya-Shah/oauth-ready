import type { Claim, Draft, Guide } from "./schema";
import type { Probe } from "./probe";

export type Source = {
  id: string; // S1..Sn
  url: string;
  title: string;
  official: boolean;
  text: string;
  via: "fetch" | "search-extract";
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// A quote "matches" if its normalized form appears in the normalized source text.
// Long quotes may match on a 12-word window so minor model paraphrase at the edges is tolerated.
export function quoteFound(quote: string, sourceText: string): boolean {
  const q = normalize(quote);
  if (q.length < 12) return false;
  const t = normalize(sourceText);
  if (t.includes(q)) return true;
  const words = q.split(" ");
  if (words.length < 16) return false;
  for (let i = 0; i + 12 <= words.length; i += 4) {
    if (t.includes(words.slice(i, i + 12).join(" "))) return true;
  }
  return false;
}

export function isOfficial(url: string, officialRoot: string): boolean {
  try {
    const h = new URL(url).hostname;
    // Vendor-hosted forums are user content, not official documentation.
    if (/^(community|forums?|discuss|answers|support-community)\./.test(h)) return false;
    return h === officialRoot || h.endsWith("." + officialRoot);
  } catch {
    return false;
  }
}

export function probeClaims(probes: Probe[], prefix = "t"): Claim[] {
  return probes
    .filter((p) => p.ok)
    .map((p, i) => ({
      id: `${prefix}${i + 1}`,
      text: p.summary,
      label: "tested" as const,
      url: p.url,
      method: p.kind === "discovery" ? "Fetched OAuth discovery document" : "Sent authorization request with an unknown client_id",
      artifact: p.artifact,
      checkedAt: p.at,
    }));
}

/**
 * Turn the model's draft into a Guide. The model never decides the evidence label:
 *  - probeRef pointing at a probe run in this job  → tested
 *  - sourceRef + quote found verbatim in fetched text → sourced (official domain) / community
 *  - anything else → uncertain (with the reason recorded)
 */
export function enforce(
  draft: Draft,
  ctx: { sources: Source[]; probes: Probe[]; officialRoot: string; slug: string; model: string; extraOfficial?: string[] },
): Guide {
  const now = new Date().toISOString();
  const srcById = new Map(ctx.sources.map((s) => [s.id, s]));
  const probeById = new Map(ctx.probes.map((p) => [p.id, p]));
  const officialRoots = [ctx.officialRoot, ...(ctx.extraOfficial ?? [])];
  const official = (u: string) => officialRoots.some((r) => isOfficial(u, r));

  const claims: Claim[] = draft.claims.map((c) => {
    const probe = c.probeRef ? probeById.get(c.probeRef) : undefined;
    if (probe && probe.ok) {
      return {
        id: c.id,
        text: c.text,
        label: "tested",
        url: probe.url,
        method: probe.kind === "discovery" ? "Fetched OAuth discovery document" : "Sent authorization request with an unknown client_id",
        artifact: probe.artifact,
        checkedAt: probe.at,
      };
    }
    const src = c.sourceRef ? srcById.get(c.sourceRef) : undefined;
    if (src && c.quote && quoteFound(c.quote, src.text)) {
      return {
        id: c.id,
        text: c.text,
        label: src.official && official(src.url) ? "sourced" : "community",
        url: src.url,
        quote: c.quote,
        checkedAt: now,
      };
    }
    const reason = !c.sourceRef && !c.probeRef
      ? "No source cited by the agent."
      : src && c.quote
        ? "Quoted text was not found on the cited page."
        : c.probeRef
          ? "Cited probe did not succeed."
          : "Cited source was not fetched.";
    return {
      id: c.id,
      text: c.text,
      label: "uncertain",
      url: src?.url,
      note: [c.note, reason].filter(Boolean).join(" "),
      checkedAt: now,
    };
  });

  // Every successful probe becomes a tested claim, whether or not the model cited it.
  claims.push(...probeClaims(ctx.probes.filter((p) => !claims.some((c) => c.label === "tested" && c.url === p.url))));

  const known = new Set(claims.map((c) => c.id));
  const fetchedUrls = new Set(ctx.sources.map((s) => s.url));
  const keepLink = (l: string) => fetchedUrls.has(l) || official(l);
  const ids = (xs: string[]) => xs.filter((x) => known.has(x));

  return {
    schemaVersion: 1,
    slug: ctx.slug,
    name: draft.name,
    aliases: draft.aliases,
    officialDomain: ctx.officialRoot,
    supportsOAuth: draft.supportsOAuth,
    origin: "generated",
    model: ctx.model,
    generatedAt: now,
    verdict: { ...draft.verdict, claimIds: ids(draft.verdict.claimIds) },
    steps: draft.steps.map((s) => ({ ...s, links: s.links.filter(keepLink), claimIds: ids(s.claimIds) })),
    requirements: draft.requirements.map((r) => ({ ...r, claimIds: ids(r.claimIds) })),
    scopes: draft.scopes.map((s) => ({ ...s, claimIds: ids(s.claimIds) })),
    blockers: draft.blockers.map((b) => ({ ...b, claimIds: ids(b.claimIds) })),
    claims,
    gaps: draft.gaps,
    reviewAdditions: [],
    sourcesConsulted: ctx.sources.map((s) => ({ url: s.url, official: s.official, fetched: s.via === "fetch" })),
  };
}
