// Probe specific endpoints and attach them as tested claims to one guide.
// Usage: npx tsx scripts/probe-one.ts <guide.json> <authorizeUrl|discoveryUrl>...
import fs from "node:fs/promises";
import { probeAuthorize, type Probe } from "../lib/probe";
import { safeGet } from "../lib/fetcher";
import { probeClaims } from "../lib/enforce";

const [file, ...urls] = process.argv.slice(2);
const g = JSON.parse(await fs.readFile(file, "utf8"));
const probes: Probe[] = [];
for (const u of urls) {
  if (u.includes(".well-known")) {
    const r = await safeGet(u, { timeoutMs: 8000 });
    const j = JSON.parse(r.body);
    probes.push({
      id: "", kind: "discovery", url: u, ok: r.status === 200 && !!j.authorization_endpoint,
      summary: `Discovery document found at ${u}: authorization endpoint ${j.authorization_endpoint}, token endpoint ${j.token_endpoint}.`,
      artifact: `GET ${u} → HTTP ${r.status}\n${JSON.stringify({ issuer: j.issuer, authorization_endpoint: j.authorization_endpoint, token_endpoint: j.token_endpoint }, null, 1)}`,
      at: new Date().toISOString(),
    });
  } else {
    const p = await probeAuthorize(u);
    if (p) probes.push({ ...p, id: "" });
  }
}
const n = g.claims.filter((c: { id: string }) => /^t\d+$/.test(c.id)).length;
const fresh = probeClaims(probes).map((c, i) => ({ ...c, id: `t${n + i + 1}` }));
g.claims.push(...fresh);
await fs.writeFile(file, JSON.stringify(g, null, 2));
fresh.forEach((c) => console.log(c.id, c.text));
