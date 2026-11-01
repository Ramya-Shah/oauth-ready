# OAuth Ready — Implementation Plan (v2, revised after EGM review)

## Problem
A developer building an AI agent wants their users to connect third-party apps. Each provider requires the developer to register an **OAuth app** (client ID/secret, redirect URI, scopes) — their identity with the provider; each end-user "Connect" creates a **connection** through that one app. For production, many providers add review gates. Developers can't tell up front whether setup takes an hour or weeks, what's required, or what blocks approval.

Reference (fetched 2026-11-01, docs.composio.dev/toolkits/managed-auth): 387 OAuth toolkits — 125 Composio-managed, 262 bring-your-own. The 262 are the core audience; managed-app users hit this too when they need their own branding, rate limits, or enterprise trust.

## Success criteria
- A developer reading any guide can answer in <30s: how hard, how long (effort vs. wait), #1 blocker, what they must do themselves.
- Live generation returns a schema-valid guide for an unfamiliar app in ≤90s on the free tier.
- Every claim shows its evidence label; ≥2 curated guides contain real `tested` claims beyond endpoint probes.
- Verification log shows ≥10 checked claims with confirmed / corrected / unverifiable outcomes.

## Scope decision
Lead with the verdict (difficulty, active effort vs. approval wait, #1 blocker); steps follow. **One pipeline** produces both library and live guides — the library is proof the agent works, and the only path that scales to 100. Out of scope: token runtime, completing real approvals, paid accounts.

## Glossary (shown in UI as tooltips)
- **OAuth app** — the developer's registered client with the provider.
- **Brand verification / CASA** — Google's consent-screen review; CASA is a third-party security assessment required for restricted scopes (e.g. Gmail read).
- **Publisher verification** — Microsoft linking an app to a verified Partner Network account.
- **Admin consent** — a tenant admin approving an app for their org.
- **Marketplace review** — provider review before an app is listed/installable by others.

## Evidence model (the core of the product)
| Label | Meaning | Required artifact |
|---|---|---|
| `tested` | We executed it | method + artifact (HTTP status/response excerpt or screenshot) + date. Set by **code only**, never the model. |
| `sourced` | Stated by an official provider page | official-domain URL + verbatim quote that code finds in fetched text |
| `community` | Stated by forum/blog/StackOverflow | URL + quote |
| `uncertain` | Inferred or unverifiable | reasoning note |

Honesty statement shown on every generated guide: *"Live-generated guides reach `tested` only for endpoint/probe facts; review timelines and costs are at best `sourced`."* Each guide shows per-label claim counts.

Hands-on tests for curated guides (free, no paid accounts): GitHub OAuth App + code flow; Google Cloud project in Testing mode → consent screen with sensitive scope → observe "unverified app" screen; Slack free workspace install; Notion public integration creation.

## Guide schema (Zod, `schemaVersion: 1`)
```ts
Claim   = { id, text, label: 'tested'|'sourced'|'community'|'uncertain',
            url?, quote?, method?, artifact?, checkedAt }
Range   = { minDays: number, maxDays: number } | 'unknown'
Guide = {
  schemaVersion: 1, slug, name, aliases: string[], officialDomain,
  origin: 'curated'|'generated', model?, generatedAt,
  verdict: { difficulty: 1|2|3|4|5, activeEffortHours: {min,max},
             approvalWait: Range, topBlocker: string, summary: string, claimIds },
  steps: [{ id, phase: 'dev'|'test'|'production', title, detail,
            owner: 'agent'|'you'|'provider', minutes?, links, claimIds }],
  requirements: [{ kind: 'domain'|'privacy_policy'|'tos'|'demo_video'|
            'security_assessment'|'paid_plan'|'business_verification'|'other',
            requiredFor: 'test'|'production', note, claimIds }],
  scopes: [{ scope, triggersReview: boolean|'unknown', note, claimIds }],
  blockers: [{ symptom, cause, unblock, claimIds }],
  claims: Claim[]
}
```
Difficulty rubric: 1 instant self-serve · 2 self-serve + app config · 3 light review (<1 wk) · 4 formal review (1–4 wk) · 5 security assessment / multi-week + cost.

`owner` meaning: `agent` = an automated agent can do it (fill forms, generate policy draft, set redirect URIs via API, run probes); `you` = needs human identity, legal, payment, or judgment; `provider` = waiting on provider.

## Architecture
- **Next.js App Router, TypeScript**, Node.js runtime (not Edge — SSRF guard needs `dns`), `maxDuration = 60`, deployed to Vercel.
- **Storage**: curated guides as JSON in `data/guides/`; generated guides in **Upstash Redis free tier** via Vercel Marketplace (keys injected, never in repo). Local dev falls back to `data/generated/`.
- Pages: `/` library (filter by difficulty/wait) · `/guides/[slug]` (verdict header, phase checklist, evidence badges, claim drawer, copy-as-Markdown) · `/generate` · `/verification` (rendered from `data/verification.json`).

## Live pipeline ("the agent")
Terminology: **agent** = this pipeline; **research subagents** = Claude Code subagents used only during build to review curated guides.

1. **Normalize** input (name or URL → key). If it matches a library/generated guide, redirect to it (cache).
2. **Discover URLs** (spike 2026-11-01: Google Search grounding returns 429 on every free model for this key; `gemini-2.5-flash` is closed to new keys; DuckDuckGo blocks server requests). So: `WRITE_MODEL` proposes candidate official doc URLs from its knowledge → guarded fetcher keeps only those that resolve; plus seed URLs (`developers.<domain>`, `docs.<domain>`, `/.well-known/*`); plus one hop of crawling links on fetched pages whose text matches oauth/app/verification/review/scopes. Primary search: Tavily (`TAVILY_API_KEY`, free tier); model-proposed URLs + crawl remain the fallback if search fails or quota runs out.
3. **Fetch & probe** (deterministic code): ≤8 pages, ≤200 KB each, 8 s timeout, text extraction; discovery docs; authorize-endpoint probe with fake `client_id` (record status/redirect/error); link liveness.
4. **Synthesize** — `gemini-3.8-flash` (JSON mode) gets only fetched text + probe results → guide JSON. Zod validate; on failure retry once with errors.
5. **Enforce evidence** (code): `sourced` kept only if quote is found in fetched text from that URL (official domain); otherwise → `community`/`uncertain`. `tested` attached only from probes run in this job. Links not fetched and not on official domain are dropped.
6. Save, return shareable URL.

Models configurable via env. Spike result: `WRITE_MODEL=gemini-3.6-flash` (JSON mode + URL context OK, ~3-5 s), fallback on 503 to `gemini-3.5-flash`. `gemini-3.8-flash`/`3.7-flash` timed out or 503 under load.

Edge cases: no OAuth (API key only) → short guide stating that; no docs found → `uncertain` guide with explicit gaps; quota exhausted → friendly error + link to pre-generated examples. Per-IP rate limit (3/hour) via Upstash.

### Stream contract (NDJSON over fetch)
Events: `{stage:'search'|'fetch'|'probe'|'write'|'enforce', status:'start'|'progress'|'done'|'error', detail}`, `{type:'heartbeat'}` every 10 s, `{type:'result', slug}`, `{type:'fatal', message}`.

### /generate UX
Input → stage timeline with live log lines (URLs fetched, probe results) → guide renders → share link + "copy Markdown".

### SSRF / injection guard
https only, port 443, resolve DNS and reject private/loopback/link-local (v4+v6, decimal/octal forms), pin connection to the checked IP, re-validate every redirect hop (max 3), same rules for URLs from discovery docs, GET only, no cookies. Fetched text is wrapped as untrusted data in the prompt; model output links are filtered per step 5.

## Library apps
GitHub (1) · Slack (2–3) · HubSpot (3) · Notion (3) · Microsoft Entra (3–4) · Google Gmail (5). Generated by the pipeline, then human-reviewed, with hands-on `tested` claims for GitHub, Google, Slack, Notion. Pre-generate Linear and Xero for demo resilience.

## Verification
Done by me with research subagents after library generation. For 3 guides (Google, Slack, GitHub) check ≥10 claims each against primary sources/hands-on tests. Log format `data/verification.json`: `{guide, claimId, before, after, outcome:'confirmed'|'corrected'|'unverifiable', evidence}`. Pass bar: no `sourced` claim without a found quote; all corrections reflected in the guide.

## Files
```
app/page.tsx, app/guides/[slug]/page.tsx, app/generate/page.tsx, app/verification/page.tsx
app/api/generate/route.ts
lib/schema.ts, lib/fetcher.ts (SSRF guard), lib/probe.ts, lib/search.ts, lib/write.ts,
lib/enforce.ts, lib/store.ts, lib/normalize.ts
data/guides/*.json, data/verification.json
README.md
```

## Milestones & budget (8 h incl. buffer)
| # | Milestone | Time | Priority |
|---|---|---|---|
| 0 | Model spike, scaffold, schema | 0.75 h | P0 |
| 1 | Fetcher + probe + enforce (unit-tested) | 1.25 h | P0 |
| 2 | Pipeline + /generate stream | 1.5 h | P0 |
| — | **Checkpoint ~3.5 h: generator works end-to-end locally** | | |
| 3 | Guide page + library | 1 h | P0 |
| 4 | Generate 6 library + 2 demo guides, hands-on tests | 1 h | P0 |
| 5 | Verification log + page | 0.75 h | P1 |
| 6 | Deploy + README | 0.5 h | P0 |
| — | Buffer | 1.25 h | |

Definition of done: deployed link, unfamiliar app generates live, 6 library guides, verification page, README with decisions + limitations. Tests: unit tests for fetcher guard, enforce, schema; one end-to-end generate run.

## Alternatives considered
- **Hand-research curated guides separately** — rejected: doesn't scale to 100, splits quality.
- **URL-encoded guides instead of storage** — rejected: forgeable `tested` badges, huge links.
- **Single model with grounding + JSON** — rejected: grounding and JSON mode can't be combined reliably on free tier.
- **Claude API** — not used: user constraint is the free Gemini tier.
- **Automate real provider sign-ups** — rejected: requires accounts/credentials; we test only free, human-run flows.

## Risks
- Free-tier quotas (RPM; 500 grounded RPD, per pricing page fetched 2026-11-01) → cache, rate limit, pre-generated demos.
- Approval timelines rarely documented → mostly `community`/`uncertain`; stated openly.
- Vendor docs change → `checkedAt` on every claim.
