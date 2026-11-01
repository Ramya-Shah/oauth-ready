// Re-run endpoint probes for saved guides and attach results as tested claims.
// Usage: npx tsx scripts/add-probes.ts data/guides/*.json data/generated/*.json
import fs from "node:fs/promises";
import { probeDiscovery, probeAuthorize, findAuthorizeUrls, type Probe } from "../lib/probe";
import { probeClaims } from "../lib/enforce";

// Vendor-owned domains that host OAuth endpoints but differ from the docs domain.
const EXTRA: Record<string, string[]> = { "microsoft.com": ["microsoftonline.com"] };

for (const file of process.argv.slice(2)) {
  const g = JSON.parse(await fs.readFile(file, "utf8"));
  const roots: string[] = [g.officialDomain, ...(EXTRA[g.officialDomain] ?? [])];
  const raw = (await Promise.all(roots.map((r) => probeDiscovery(r)))).flat();
  const text = JSON.stringify(g);
  const urls = new Set<string>(raw.map((p) => String(p.data?.authorization_endpoint)).filter(Boolean));
  for (const r of roots) findAuthorizeUrls(text, r).forEach((u) => urls.add(u));
  for (const u of [...urls].slice(0, 2)) { const p = await probeAuthorize(u); if (p) raw.push(p); }
  const probes = raw.map((p, i) => ({ ...p, id: `P${i + 1}` })) as Probe[];
  g.claims = g.claims.filter((c: { id: string }) => !/^t\d+$/.test(c.id));
  const fresh = probeClaims(probes.filter((p) => !g.claims.some((c: { label: string; url?: string }) => c.label === "tested" && c.url === p.url)));
  g.claims.push(...fresh);
  await fs.writeFile(file, JSON.stringify(g, null, 2));
  console.log(file, `+${fresh.length} tested`, probes.map((p) => `${p.ok ? "✓" : "✗"} ${p.summary.slice(0, 110)}`).join("\n   "));
}
