import { safeGet, htmlToText } from "./fetcher";

export type Probe = {
  id: string; // P1..Pn, assigned by the pipeline
  kind: "discovery" | "authorize";
  url: string;
  ok: boolean;
  summary: string; // one-line human summary of what we observed
  artifact: string; // raw-ish evidence (status, headers, excerpt)
  data?: Record<string, unknown>;
  at: string;
};

const FAKE_CLIENT = "oauthready-probe-invalid-client";

export async function probeDiscovery(domain: string): Promise<Omit<Probe, "id">[]> {
  const root = domain.replace(/^www\./, "");
  const hosts = [...new Set([domain, root, `accounts.${root}`, `login.${root}`, `auth.${root}`, `oauth.${root}`, `identity.${root}`, `id.${root}`, `api.${root}`])];
  const paths = ["/.well-known/openid-configuration", "/.well-known/oauth-authorization-server"];
  const tasks = hosts.flatMap((h) => paths.map((p) => `https://${h}${p}`));
  const results = await Promise.all(
    tasks.map(async (url) => {
      try {
        const r = await safeGet(url, { timeoutMs: 5000, maxBytes: 100_000 });
        if (r.status !== 200) return null;
        const j = JSON.parse(r.body);
        if (!j.authorization_endpoint) return null;
        const data = {
          issuer: j.issuer,
          authorization_endpoint: j.authorization_endpoint,
          token_endpoint: j.token_endpoint,
          scopes_supported: Array.isArray(j.scopes_supported) ? j.scopes_supported.slice(0, 40) : undefined,
          code_challenge_methods_supported: j.code_challenge_methods_supported,
          grant_types_supported: j.grant_types_supported,
        };
        const p: Omit<Probe, "id"> = {
          kind: "discovery",
          url: r.url,
          ok: true,
          summary: `Discovery document found at ${r.url}: authorization endpoint ${j.authorization_endpoint}, token endpoint ${j.token_endpoint}${
            j.code_challenge_methods_supported ? `, PKCE methods ${j.code_challenge_methods_supported.join("/")}` : ""
          }.`,
          artifact: `GET ${r.url} → HTTP ${r.status}\n${JSON.stringify(data, null, 1).slice(0, 1500)}`,
          data,
          at: new Date().toISOString(),
        };
        return p;
      } catch {
        return null;
      }
    }),
  );
  // de-duplicate by authorization endpoint
  const seen = new Set<string>();
  return results.filter((p): p is Omit<Probe, "id"> => {
    if (!p) return false;
    const k = String(p.data?.authorization_endpoint);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function probeAuthorize(endpoint: string): Promise<Omit<Probe, "id"> | null> {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return null;
  }
  u.searchParams.set("client_id", FAKE_CLIENT);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", "https://example.com/callback");
  u.searchParams.set("state", "probe");
  if (!u.searchParams.has("scope")) u.searchParams.set("scope", "openid");
  const url = u.toString();
  try {
    const r = await safeGet(url, { followRedirects: false, timeoutMs: 8000, maxBytes: 150_000 });
    const loc = r.headers["location"] ?? "";
    const text = htmlToText(r.body).slice(0, 4000);
    const errorish = (text.match(/[^.\n]{0,120}(client|invalid|error|not found|unauthori[sz]ed|redirect)[^.\n]{0,160}/i) ?? [""])[0].trim();
    let summary: string;
    if (r.status >= 300 && r.status < 400) {
      const locError = (() => {
        try {
          const l = new URL(loc, url);
          return l.searchParams.get("error") ?? l.searchParams.get("error_description") ?? "";
        } catch {
          return "";
        }
      })();
      const toErrorPage = /error|autherror/i.test(loc);
      summary = locError
        ? `Authorization endpoint ${endpoint} is live; an unknown client_id was redirected with error "${locError}".`
        : toErrorPage
        ? `Authorization endpoint ${endpoint} is live and rejects an unknown client_id by redirecting to its error page (${loc.split("?")[0].slice(0, 100)}).`
        : `Authorization endpoint ${endpoint} is live; an unknown client_id was redirected (HTTP ${r.status}) to ${loc.slice(0, 120)} — the client is not validated before that step.`;
    } else if (r.status >= 400) {
      summary = `Authorization endpoint ${endpoint} is live and rejects an unknown client_id with HTTP ${r.status}${errorish ? `: "${errorish.slice(0, 160)}"` : ""}.`;
    } else {
      summary = `Authorization endpoint ${endpoint} responded HTTP ${r.status} to an unknown client_id${errorish ? `; page says: "${errorish.slice(0, 160)}"` : " (no explicit error shown)"}.`;
    }
    return {
      kind: "authorize",
      url,
      ok: r.status > 0 && r.status < 500,
      summary,
      artifact: `GET ${url} (no redirects followed) → HTTP ${r.status}${loc ? `\nLocation: ${loc.slice(0, 300)}` : ""}\n${errorish ? `Excerpt: ${errorish.slice(0, 300)}` : `Body excerpt: ${text.slice(0, 300)}`}`,
      data: { status: r.status, location: loc },
      at: new Date().toISOString(),
    };
  } catch (e) {
    return {
      kind: "authorize",
      url,
      ok: false,
      summary: `Could not reach authorization endpoint ${endpoint}: ${(e as Error).message}.`,
      artifact: `GET ${url} → ${(e as Error).message}`,
      at: new Date().toISOString(),
    };
  }
}

// Pull plausible authorize endpoints out of documentation text.
// Only paths that look like an authorization endpoint, never documentation hosts.
export function findAuthorizeUrls(text: string, officialRoot: string): string[] {
  const re = /https:\/\/[a-z0-9.-]+\/[A-Za-z0-9_\-./]*/gi;
  const endpointPath = /(\/oauth2?(\/v[\d.]+)?\/authori[sz]e|\/connect\/authori[sz]e|\/oauth2?(\/v[\d.]+)?\/auth|\/authori[sz]e)\/?$/i;
  const docsHost = /^(docs|developers?|learn|help|support|community|api-docs|devcenter)\./i;
  const out = new Set<string>();
  for (const m of text.match(re) ?? []) {
    try {
      const u = new URL(m.replace(/[.,)]+$/, ""));
      const onRoot = u.hostname === officialRoot || u.hostname.endsWith("." + officialRoot);
      if (onRoot && !docsHost.test(u.hostname) && endpointPath.test(u.pathname)) out.add(u.origin + u.pathname);
    } catch {}
  }
  return [...out].slice(0, 3);
}
