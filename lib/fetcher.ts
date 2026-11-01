import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import type { LookupFunction } from "node:net";

// Guarded fetcher: https only, port 443, GET only, no cookies, public IPs only.
// The IP check happens inside the socket's DNS lookup, so the address we validate is the
// address we connect to (no DNS-rebinding window). Every redirect hop is re-validated.

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  return true;
}

export function validateUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("only https is allowed");
  if (u.port && u.port !== "443") throw new Error("only port 443 is allowed");
  if (u.username || u.password) throw new Error("credentials in URL not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) throw new Error("IP-literal hosts are not allowed");
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost")
    throw new Error("non-public hostname");
  return u;
}

const guardedLookup: LookupFunction = (hostname, options, cb) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return (cb as any)(err);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => isPrivateIp(a.address));
    if (bad || list.length === 0) return (cb as any)(new Error(`blocked private address for ${hostname}`));
    if ((options as any).all) return (cb as any)(null, list);
    (cb as any)(null, list[0].address, list[0].family);
  });
};

export type FetchResult = {
  url: string; // final URL after redirects
  status: number;
  headers: Record<string, string>;
  body: string;
  redirects: string[];
  truncated: boolean;
  ms: number;
};

export async function safeGet(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number; followRedirects?: boolean } = {},
): Promise<FetchResult> {
  const { maxBytes = 400_000, timeoutMs = 8000, maxRedirects = 3, followRedirects = true } = opts;
  const started = Date.now();
  const redirects: string[] = [];
  let current = raw;
  for (let hop = 0; ; hop++) {
    const u = validateUrl(current);
    const res = await once(u, maxBytes, timeoutMs);
    const loc = res.headers["location"];
    if (followRedirects && res.status >= 300 && res.status < 400 && loc) {
      if (hop >= maxRedirects) throw new Error("too many redirects");
      redirects.push(current);
      current = new URL(loc, u).toString();
      continue;
    }
    return { ...res, url: current, redirects, ms: Date.now() - started };
  }
}

function once(u: URL, maxBytes: number, timeoutMs: number) {
  return new Promise<{ status: number; headers: Record<string, string>; body: string; truncated: boolean }>(
    (resolve, reject) => {
      const req = https.request(
        {
          method: "GET",
          hostname: u.hostname,
          path: u.pathname + u.search,
          port: 443,
          lookup: guardedLookup,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; OAuthReadyBot/0.1; +https://github.com/)",
            Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
            "Accept-Language": "en",
          },
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          let truncated = false;
          res.on("data", (c: Buffer) => {
            if (truncated) return;
            size += c.length;
            if (size > maxBytes) {
              truncated = true;
              chunks.push(c.subarray(0, c.length - (size - maxBytes)));
              res.destroy();
              finish();
            } else chunks.push(c);
          });
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) headers[k] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
            resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString("utf8"), truncated });
          };
          res.on("end", finish);
          res.on("close", finish);
          res.on("error", (e) => (done ? undefined : reject(e)));
        },
      );
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", reject);
      req.end();
    },
  );
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function extractLinks(html: string, base: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const href = new URL(m[1], base).toString();
      out.push({ href, text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
    } catch {}
  }
  return out;
}
