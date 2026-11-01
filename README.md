# OAuth Ready

**How long until your users can connect?** Setup and approval guides for provider OAuth apps, with every claim labelled by how we know it.

- **Library:** six varied guides, each reviewed against official docs (GitHub, Slack, Google/Gmail, Microsoft Entra ID, HubSpot, Notion).
- **Live generation:** type any app name or website, and an agent researches it, probes its live OAuth endpoints, and produces a shareable guide in about 30–90 seconds.
- **Verification log:** a sample of guide claims checked against primary sources, showing what was confirmed, what was corrected and what couldn't be verified (`/verification`).

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev                  # http://localhost:3000
```

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes, for generation | Free tier works ([AI Studio](https://aistudio.google.com/apikey)) |
| `TAVILY_API_KEY` | recommended | Free tier, no card. Without it the agent can only read URLs the model proposes. |
| `WRITE_MODELS` | no | Comma-separated, best first. Default `gemini-3.8-flash,…,gemini-3.1-flash-lite` |
| `LIGHT_MODELS` | no | Models for the small identify step |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | on Vercel | Upstash Redis (Vercel Marketplace, free) stores generated guides. Locally they go to `data/generated/`. |
| `GENERATE_LIMIT_PER_HOUR` | no | Per-IP limit on new guides, default 5 |

Other commands:

```bash
npm test                              # unit tests: SSRF guard, quote matching, evidence enforcement
npm run gen -- "Xero"                 # run the agent from the CLI
npm run gen -- "Slack" --curated      # regenerate a library guide (then human-review it)
python scripts/apply-review.py github # apply data/verify-github.json to the guide and rebuild /verification
npx tsx scripts/add-probes.ts data/guides/*.json   # re-run endpoint probes on saved guides
```

The library and guide pages work without any keys. Only `/generate` needs them.

## What's in the demo

"Wait" is only what blocks any customer from connecting through OAuth. Optional listings (marketplaces, directories, certification) and limits after users connect are shown separately on each guide.

| App | Why it's here | Difficulty | Required wait |
|---|---|---|---|
| GitHub | Instant self-serve; the friction is customer orgs approving your app | 2 | none |
| Notion | Public connection, no review; Marketplace listing is optional | 2 | none |
| HubSpot | Created with the HubSpot CLI; unlisted apps capped at 25 installs | 2 | none |
| Slack | No review to distribute; rate limits push message-reading agents to the optional Marketplace | 2 | none |
| Microsoft Entra ID | Partner verification for publisher verification; customer admin consent is the real blocker | 3 | 3–7 days |
| Google (Gmail) | Restricted scopes: brand plus restricted-scope verification with a paid yearly CASA assessment | 5 | 42–70 days |
| Xero, Linear, Calendly | Generated live by the agent (not in the library) | — | — |

All six library guides were reviewed claim by claim against official docs. The three live-generated guides were not.

## What we tested, sourced, and couldn't verify

- **Tested (we ran it):** OAuth discovery documents and authorize-endpoint probes with an invalid `client_id` for every guide. Example: Xero's `login.xero.com/identity/connect/authorize` redirects unknown clients to its error page, and Calendly runs two authorization servers. Probes never need an account.
- **Checked against sources:** two rounds of reviewer agents checked 172 items against the providers' own docs. Round 1 covered GitHub, Slack and Gmail (52 items: 36 confirmed, 11 corrected, 5 unverifiable). Round 2 covered all six library guides (120 items: 74 confirmed, 39 corrected, 7 unverifiable). All of it is at `/verification`.
- **Biggest corrections:**
  - Three guides (Slack, HubSpot, Notion) counted an optional marketplace review as the OAuth approval wait. None of them needs a provider review before customers can connect. The schema and the agent prompt now keep required waits, optional listings and post-connection limits apart.
  - Gmail's real required wait is 42–70 days. The scopes an agent needs (readonly, modify, compose) are restricted, so they need restricted-scope verification plus a mandatory, paid, yearly CASA assessment.
  - HubSpot's setup steps were outdated. New public apps are created with the HubSpot CLI, not the dashboard.
  - Microsoft's real blocker is customer admin consent. By default, end users can't consent to mail, calendar or files access.
- **Couldn't verify:** most review timelines and assessment costs. Official docs rarely publish them; Google's FAQ is the exception. The guides list these under "What we couldn't determine".
- **Not done:** hands-on app registration with real accounts, and completed provider approvals.

## Key decisions

1. **Lead with the verdict.** The developer's real question is "an hour or six weeks?" Every guide opens with difficulty (1–5 rubric), hands-on effort, approval wait (shown separately, because calendar time is what blocks a launch), and the single most likely blocker.
2. **Split steps into create → test → production.** Most providers let you test with your own account immediately. The hard part is letting *any* customer connect. Separating the phases shows what you can do today and what has to wait for review.
3. **Owner on every step: agent / you / provider.** This shows where an agent can help (drafting policy and listing copy, configuring redirect URIs and scopes, running test flows) and where a human must act (identity, legal entity, payment, sign-in) or simply wait.
4. **The model never decides evidence labels.** It cites a source number plus a verbatim quote, or a probe number. Code then checks the quote against the fetched page text and the probe against this run's results (`lib/enforce.ts`). Anything unsupported is downgraded to *uncertain*. Official vs. community is decided by the URL's domain.
5. **"Tested" means we ran something.** The agent probes `/.well-known/openid-configuration` and calls the authorize endpoint with a deliberately invalid `client_id`. That proves the endpoint and shows how it rejects unknown clients without needing any account. Guides say plainly that review timelines can't be tested this way.
6. **One pipeline builds both the library and live guides.** The library is the generator's output, reviewed by a person and corrected where needed (see `/verification`). That's the only route that scales to 100 guides, and it doubles as proof that the live agent works.
7. **Review the verdict first.** Verification showed the agent gets individual facts mostly right but misjudges the overall verdict (it conflated optional and mandatory review paths). The verdict is also what developers read first, so reviewers check it first.
8. **Free stack.** Gemini's free tier doesn't include Google Search grounding, so search uses Tavily's free tier and the writing uses Gemini. The model is configurable, with automatic fallback when the free model is overloaded.

## Deploy (Vercel)

1. Push the repo to GitHub and import it in Vercel.
2. Add `GEMINI_API_KEY` and `TAVILY_API_KEY` as environment variables.
3. Add **Upstash Redis** from the Vercel Marketplace (free). It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`, so generated guides persist and rate limiting works across instances.

`/api/generate` runs on the Node.js runtime with `maxDuration = 300`.

## Architecture

```
app/                 Next.js App Router pages + /api/generate (NDJSON stream)
lib/pipeline.ts      identify → search → fetch → probe → write → enforce
lib/fetcher.ts       guarded HTTPS fetcher (public IPs only, IP pinned at lookup, redirect re-checks, caps)
lib/probe.ts         OIDC discovery + invalid-client authorize probe
lib/enforce.ts       evidence labelling + link filtering
lib/schema.ts        Zod schema for guides and model drafts
data/guides/         library guides (JSON)
data/verification.json  spot-check log rendered at /verification
```

## Limitations

- **Live guides are only as good as the docs we can read.** Some providers block automated fetches. When that happens we fall back to Tavily's page extract, and the source list says so.
- **Timelines and costs are rarely official.** Expect them to be community-sourced or uncertain. The guide lists them under "What we couldn't determine".
- **Free-tier limits:** each Gemini model allows only **20 requests per day**, and the newest models are often overloaded. The client rotates through six models and skips any that hit their daily cap. That gives roughly 40–50 generated guides a day, sometimes from a lighter model that writes thinner guides. The model that drafted each guide is shown on the guide.
- **Quote checking catches invented quotes, not misapplied ones.** A real quote about a different review process still passes. That's why the verdict gets a human review.
- **No real provider approvals were completed.** Hands-on setup attempts with real accounts (GitHub, a Google project in Testing mode, a free Slack workspace) are the next step. Until then, `tested` covers endpoint probes only.
- **Probes don't cover every provider.** Discovery documents exist only for some providers (Google, Microsoft, Slack's OpenID). Many others have no discovery document, so probes cover only the authorize endpoint the docs mention.
