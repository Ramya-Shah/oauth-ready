// Usage: npm run gen -- "Xero" [--curated] [--force]
import fs from "node:fs/promises";
import path from "node:path";
import { runPipeline } from "../lib/pipeline";

const args = process.argv.slice(2);
const name = args.filter((a) => !a.startsWith("--")).join(" ");
const curated = args.includes("--curated");
let slug = "";
for await (const ev of runPipeline(name, { force: args.includes("--force") || curated })) {
  if (ev.type === "stage") console.log(`[${ev.stage}] ${ev.status}: ${ev.detail}`);
  else if (ev.type === "fatal") { console.error("FATAL", ev.message); process.exit(1); }
  else { slug = ev.slug; console.log("RESULT", ev.slug, ev.cached ? "(cached)" : ""); }
}
if (curated && slug) {
  const src = path.join("data", "generated", `${slug}.json`);
  const g = JSON.parse(await fs.readFile(src, "utf8"));
  g.origin = "curated";
  await fs.writeFile(path.join("data", "guides", `${slug}.json`), JSON.stringify(g, null, 2));
  await fs.rm(src);
  console.log("moved to data/guides");
}
