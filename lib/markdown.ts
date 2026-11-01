import { DIFFICULTY_RUBRIC, formatWait, labelCounts, type Guide } from "./schema";

const TAG = { tested: "TESTED", sourced: "OFFICIAL", community: "COMMUNITY", uncertain: "UNCERTAIN" } as const;

export function toMarkdown(g: Guide, url?: string): string {
  const refs = (ids: string[]) =>
    ids.length ? " " + ids.map((id) => { const c = g.claims.find((x) => x.id === id); return c ? `[${id}·${TAG[c.label]}]` : ""; }).join("") : "";
  const c = labelCounts(g);
  const v = g.verdict;
  const out: string[] = [];
  out.push(`# ${g.name} — OAuth app setup & approval guide`);
  if (url) out.push(`Source: ${url}`);
  out.push(`_${g.origin === "curated" ? "Library guide" : "Agent-generated"} · generated ${g.generatedAt.slice(0, 10)}${g.reviewedAt ? ` · reviewed ${g.reviewedAt.slice(0, 10)}` : ""} · evidence: ${c.tested} tested, ${c.sourced} official, ${c.community} community, ${c.uncertain} uncertain_`);
  out.push(`\n## Verdict\n- **Difficulty:** ${v.difficulty}/5 — ${DIFFICULTY_RUBRIC[v.difficulty]}\n- **Hands-on effort:** ${v.activeEffortHours.min}–${v.activeEffortHours.max} h\n- **Approval wait:** ${formatWait(v.approvalWait)}\n- **Top blocker:** ${v.topBlocker}\n\n${v.summary}${refs(v.claimIds)}`);
  for (const phase of ["dev", "test", "production"] as const) {
    const steps = g.steps.filter((s) => s.phase === phase);
    if (!steps.length) continue;
    out.push(`\n## ${{ dev: "1. Create the app", test: "2. Test with your own account", production: "3. Go to production" }[phase]}`);
    steps.forEach((s) => out.push(`- [ ] **${s.title}** _(${s.owner === "agent" ? "agent can do" : s.owner === "you" ? "you" : "provider"}${s.minutes ? `, ~${s.minutes} min` : ""})_ — ${s.detail}${refs(s.claimIds)}${s.links.length ? `\n  ${s.links.join(" ")}` : ""}`));
  }
  if (g.optionalPaths.length) {
    out.push(`\n## Optional listings (not needed for users to connect)`);
    g.optionalPaths.forEach((o) => out.push(`- **${o.name}** (wait: ${formatWait(o.wait)}): ${o.why}${refs(o.claimIds)}`));
  }
  if (g.limits.length) {
    out.push(`\n## Limits after users connect`);
    g.limits.forEach((l) => out.push(`- **${l.limit}**: ${l.impact}${refs(l.claimIds)}`));
  }
  if (g.requirements.length) {
    out.push(`\n## Requirements`);
    g.requirements.forEach((r) => out.push(`- **${r.kind.replace(/_/g, " ")}** (for ${r.requiredFor}): ${r.note}${refs(r.claimIds)}`));
  }
  if (g.scopes.length) {
    out.push(`\n## Scopes`);
    g.scopes.forEach((s) => out.push(`- \`${s.scope}\` — review: ${s.triggersReview === "unknown" ? "unknown" : s.triggersReview ? "yes" : "no"}. ${s.note}${refs(s.claimIds)}`));
  }
  if (g.blockers.length) {
    out.push(`\n## Blockers & how to unblock`);
    g.blockers.forEach((b) => out.push(`- **${b.symptom}** — cause: ${b.cause}. Unblock: ${b.unblock}${refs(b.claimIds)}`));
  }
  if (g.reviewAdditions.length) out.push(`\n## Added in human review\n${g.reviewAdditions.map((a) => `- ${a.text}${refs(a.claimIds)}`).join("\n")}`);
  if (g.gaps.length) out.push(`\n## Unknowns\n${g.gaps.map((x) => `- ${x}`).join("\n")}`);
  out.push(`\n## Evidence`);
  g.claims.forEach((cl) => out.push(`- **${cl.id}** [${TAG[cl.label]}] ${cl.text}${cl.url ? ` — ${cl.url}` : ""}${cl.quote ? `\n  > "${cl.quote}"` : ""}${cl.note ? `\n  _${cl.note}_` : ""}`));
  return out.join("\n");
}
