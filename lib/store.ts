import fs from "node:fs/promises";
import path from "node:path";
import { Guide } from "./schema";

// Curated guides live in data/guides (read-only, shipped with the app).
// Generated guides go to Upstash Redis when configured (Vercel), else data/generated (local dev).

const CURATED = path.join(process.cwd(), "data", "guides");
const GENERATED = path.join(process.cwd(), "data", "generated");

const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd: (string | number)[]): Promise<unknown> {
  const res = await fetch(redisUrl!, {
    method: "POST",
    headers: { Authorization: `Bearer ${redisToken}` },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const j = (await res.json()) as { result?: unknown; error?: string };
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function readDir(dir: string): Promise<Guide[]> {
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    const out: Guide[] = [];
    for (const f of files) {
      const parsed = Guide.safeParse(JSON.parse(await fs.readFile(path.join(dir, f), "utf8")));
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  } catch {
    return [];
  }
}

export async function listCurated(): Promise<Guide[]> {
  return (await readDir(CURATED)).sort((a, b) => a.verdict.difficulty - b.verdict.difficulty);
}

export async function listGenerated(limit = 30): Promise<Guide[]> {
  // Files in data/generated ship with the repo (pre-generated demos); Redis holds live ones on Vercel.
  const seeded = await readDir(GENERATED);
  let live: Guide[] = [];
  if (redisUrl && redisToken) {
    const slugs = ((await redis(["ZREVRANGE", "guides:recent", 0, limit - 1])) as string[]) ?? [];
    live = (await Promise.all(slugs.map((s) => getGenerated(s)))).filter((g): g is Guide => !!g);
  }
  const all = [...live, ...seeded.filter((g) => !live.some((l) => l.slug === g.slug))];
  return all.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).slice(0, limit);
}

async function getGenerated(slug: string): Promise<Guide | null> {
  if (redisUrl && redisToken) {
    const raw = (await redis(["GET", `guide:${slug}`])) as string | null;
    if (raw) {
      const p = Guide.safeParse(JSON.parse(raw));
      if (p.success) return p.data;
    }
  }
  try {
    const p = Guide.safeParse(JSON.parse(await fs.readFile(path.join(GENERATED, `${slug}.json`), "utf8")));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

export async function getGuide(slug: string): Promise<Guide | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const curated = (await listCurated()).find((g) => g.slug === slug);
  return curated ?? (await getGenerated(slug));
}

export async function findExisting(key: string, domain?: string): Promise<Guide | null> {
  const k = key.toLowerCase();
  const all = [...(await listCurated()), ...(await listGenerated(200))];
  return (
    all.find(
      (g) =>
        g.slug === k ||
        g.name.toLowerCase() === k ||
        g.aliases.some((a) => a.toLowerCase() === k) ||
        (domain && g.officialDomain === domain),
    ) ?? null
  );
}

export async function saveGenerated(g: Guide): Promise<void> {
  if (redisUrl && redisToken) {
    await redis(["SET", `guide:${g.slug}`, JSON.stringify(g)]);
    await redis(["ZADD", "guides:recent", Date.now(), g.slug]);
    return;
  }
  await fs.mkdir(GENERATED, { recursive: true });
  await fs.writeFile(path.join(GENERATED, `${g.slug}.json`), JSON.stringify(g, null, 2));
}

// Fixed-window rate limit per key. Redis-backed on Vercel, in-memory locally.
const mem = new Map<string, { n: number; reset: number }>();
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  if (redisUrl && redisToken) {
    const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const n = (await redis(["INCR", k])) as number;
    if (n === 1) await redis(["EXPIRE", k, windowSec]);
    return n <= max;
  }
  const now = Date.now();
  const e = mem.get(key);
  if (!e || e.reset < now) {
    mem.set(key, { n: 1, reset: now + windowSec * 1000 });
    return true;
  }
  e.n++;
  return e.n <= max;
}

// Stop flags for running generations. Redis on Vercel, so a Stop handled by a different
// server instance still reaches the run; in memory locally.
const stops = new Map<string, number>();
const validRun = (id: string) => /^[a-zA-Z0-9-]{8,64}$/.test(id);

export async function requestStop(runId: string): Promise<void> {
  if (!validRun(runId)) return;
  if (redisUrl && redisToken) {
    await redis(["SET", `stop:${runId}`, "1", "EX", 900]);
    return;
  }
  stops.set(runId, Date.now());
}

export async function isStopRequested(runId: string): Promise<boolean> {
  if (!validRun(runId)) return false;
  if (redisUrl && redisToken) return (await redis(["GET", `stop:${runId}`])) === "1";
  return stops.has(runId);
}
