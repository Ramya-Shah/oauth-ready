# Goldfish Review Report

**Target:** `U:\oauth-ready\PLAN.md` (L1-76)

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-design` | completed |
| `egm-zoom-out` | completed |
| `egm-implementation-readiness` | completed |
| `egm-comprehension` | completed |

**Severity breakdown (after deduplication):** 5 Blocker, 11 Major, 4 Nit. 40 raw findings were merged into 20.

**Overall verdict:** Not ready to build yet. The problem framing is strong, and leading with the verdict (L14) shows good product judgment. The weak point is the evidence model, which is the part graders will look at hardest. `tested` is never defined, the probes can only prove trivial facts, and nothing enforces the "forced to uncertain" rule. The plan also leaves several decisions open (storage, model, schema shapes), has no priority cut-list, and has no clear story for how the library reaches 100 guides.

---

## Prioritized Findings (Blockers -> Major -> Nits)

### 1. Evidence labels are undefined, and `tested` only proves trivial facts - Severity: Blocker
* **Reviewer Lens:** `design`, `zoom-out`, `comprehension`, `implementation-readiness` (all four)
* **Affected Scope:** Goal L11, Schema L33, Probe L47-51, Research L59, Risks L74
* **Discrepancy Description:** No rule says what earns `tested`, `sourced` or `uncertain`. The probes cannot test what developers actually care about:
  * A fake-`client_id` authorize request often returns a 200 HTML error page or a 302 to login, so it only shows that the endpoint exists.
  * Many providers in the target set (Slack, HubSpot, Notion) publish no OIDC discovery document, so that check will mostly return 404.
  * Scopes that trigger review, CASA cost, demo-video requirements and timelines can never be `tested` by the generator.

  As a result, `tested` lands on the least useful claims. It is also unclear whether "community-sourced" (L74) counts as `sourced`.
* **Rationale & Recommendation:** Add a label table to the plan, one rule and one example per label:
  * `tested`: we ran it and saw the result. The claim stores `method: probe | discovery | manual`, an `artifact` (response excerpt or note) and a date.
  * `sourced`: an official provider page that returned 200, with a verbatim quote. Add `sourceTier: official | community`, or a separate `community` label, so forum-sourced timelines are not shown as official.
  * `uncertain`: everything else.

  Also:
  * Define a probe record: `{id, url, status, errorCode?, excerpt<=500, at}`. Count "endpoint confirmed" only when the provider returns its own OAuth error. A network error or a 404 does not count.
  * Treat discovery as best-effort.
  * For curated guides, name the free manual tests per app:
    * GitHub: create an OAuth app and run the code flow on localhost.
    * Google: set up a consent screen in Testing mode and observe the unverified-app screen and the 100-test-user cap.
    * Slack: install the app to a free workspace.
    * Notion: create a public integration.
  * State plainly in the UI and README that live-generated guides can only reach probe-level `tested`.
  * Show per-label claim counts on each guide, so a mostly-uncertain guide is visibly one.

### 2. Claims aren't linked to content, and "forced to uncertain" has no mechanism - Severity: Blocker
* **Reviewer Lens:** `design`, `implementation-readiness`, `zoom-out`
* **Affected Scope:** Schema L33, Pages L41, Synthesize L53
* **Discrepancy Description:** `claims[]` is a separate list, so nothing ties a step, requirement, blocker or verdict to its evidence. That means "evidence badge on every claim" (L41) cannot be rendered. The verdict, which is the most uncertain assertion, carries no evidence at all. "Without a matching source or probe" has no algorithm: the LLM can attach any fetched URL and the claim passes as `sourced`.
* **Rationale & Recommendation:**
  * Define a claim as `{id, text, status, sourceUrl?, quote?, probeId?, checkedAt}`.
  * Give every verdict field, step, requirement, scope and blocker a `claimIds: string[]` with at least one ID. Zod rejects dangling IDs.
  * Display each field's status as the weakest status among its claims.
  * Downgrade deterministically in code after the LLM call:
    * `tested` survives only if its `probeId` matches a probe that actually ran in this job.
    * `sourced` survives only if `sourceUrl` is in the fetched set and the normalized `quote` is a substring of that page's extracted text.
    * Everything else becomes `uncertain`.
  * The model never sets `tested`.
  * Add a unit test for each downgrade path.

  (Alternative proposed by zoom-out: put evidence inline on each item as `{status, source, checkedAt}` instead of using IDs. That is simpler, but one item can no longer cite several sources. Pick one.)

### 3. Storage for generated guides is undecided - Severity: Blocker
* **Reviewer Lens:** all four
* **Affected Scope:** Architecture L38, Risks L75
* **Discrepancy Description:** "KV *or* URL-encoded fallback" means two route shapes, two loaders and two share flows. A URL-encoded guide is 10-30 KB, which makes an unwieldy link. Anyone can also forge one and display fake `tested` badges, which undermines the evidence model. Note that "Vercel KV" is now Upstash Redis through the Vercel Marketplace.
* **Rationale & Recommendation:**
  * Pick **Upstash Redis free tier** (no card; env vars are injected by the Vercel integration, so no credentials go in the repo).
  * Store guides under `guide:{slug}`. Serve generated guides from their own namespace (`/guides/g/{id}`) so they can't collide with curated ones.
  * Locally, use the same store interface backed by the filesystem when `KV_REST_API_URL` is unset.
  * Drop URL-encoding. If you keep it, HMAC-sign the payload and show unsigned guides with an "unverified" banner.
  * Record the rejected alternative in one line.

### 4. The schema has no types, overlaps itself, and is too big for one flash-model call - Severity: Blocker
* **Reviewer Lens:** `implementation-readiness`, `design`, `zoom-out`, `comprehension`
* **Affected Scope:** Guide schema L26-34, Scope L14
* **Discrepancy Description:** Several fields have no type, unit or way to say "unknown":
  * "approval wait (range)", "active effort (hours)" and "difficulty 1-5"
  * `requirements[]` is a list of nouns with no shape
  * `scopes` and `links` have no structure

  `phases` and `steps` have no stated relationship. Fields needed for routing and dedupe are missing (`slug`, `appName`, `officialDomain`, `aliases`, `schemaVersion`). Eight overlapping sections also mean more Zod rejections and retries on a free flash model. All six curated JSON files depend on this, so research can't start until it's fixed.
* **Rationale & Recommendation:** Put the actual Zod schema in the plan (`lib/schema.ts`), for example:
  * `verdict: {difficulty: 1..5 (rubric: GitHub=1, Google restricted=5), activeEffortHours: {min, max}, approvalWait: {minDays: number|null, maxDays: number|null, basis}, topBlocker, summary, claimIds}`
  * `steps[]: {phase: 'dev'|'test'|'production', title, detail, owner, estMinutes, links[], claimIds}`
  * `requirements[]: {kind: enum, applies: 'always'|'conditional'|'no', condition?, cost?, claimIds}`
  * `scopes[]: {name, triggersReview, alternative?, claimIds}`
  * `blockers[]: {symptom, cause, fix, claimIds}`
  * `meta: {source: 'curated'|'generated', model, generatedAt, input, schemaVersion}`
  * Also define "active effort" (your hands-on time) and "approval wait" (time waiting on the provider, in business days).

  Merge `phases` into a `step.phase` field. Keep the Gemini `responseSchema` flat, without unions or deep nesting.

### 5. Curated guides use a separate research path that doesn't scale to 100 - Severity: Blocker
* **Reviewer Lens:** `zoom-out`, `implementation-readiness`
* **Affected Scope:** Goal L9, Research L58-59, Budget L69
* **Discrepancy Description:** The plan has parallel subagents research six guides by hand in 1.5h, about 15 minutes per app, including signing up for Google Cloud, Entra, HubSpot, Slack and Notion. That is not realistic. It also builds a second research path that competes with the product agent and doesn't scale: 100 hand-researched guides is not a plan. The research subagents also have no output contract, and no list of which free accounts they may use.
* **Rationale & Recommendation:** Build the generator first.
  * Draft the six library guides with it, then have a person review each one, add a checked date, and add hands-on `tested` steps for 2-3 free, fast apps (GitHub, Slack, Google Testing mode).
  * State in the README: "library = generator output + human review; scaling to 100 = run the pipeline, then review."
  * Any research subagents must write schema-valid JSON and may use only the listed free accounts.

  This makes the library proof that the agent works, which directly serves the "thoughtful use of agents" criterion.

### 6. The model plan depends on an unconfirmed model and has a runtime fallback branch - Severity: Major
* **Reviewer Lens:** `zoom-out`, `implementation-readiness`, `design`, `comprehension`
* **Affected Scope:** Pipeline L45-53, Risks L72-73
* **Discrepancy Description:** Synthesis relies on `gemini-3.8-flash`, whose free-tier JSON support the plan itself calls "unconfirmed" (L73). The "fallback if 3.8 lacks JSON mode" is a research question written as a runtime rule. The plan also states quota figures (500 RPD) without a source or date.
* **Rationale & Recommendation:**
  * Spend about 15-20 minutes at the start testing `responseMimeType: application/json` plus `responseSchema` on 3.8-flash, and record the result in the plan.
  * If it works, use 3.8 for synthesis. If not, use 2.5-flash for both stages and delete the fallback branch.
  * Make model IDs env-configurable and record the model actually used in `meta.model`.
  * If Zod validation fails, retry once with the validation errors added to the prompt, then fail.
  * Label the model and quota claims with the plan's own evidence labels (pricing URL plus check date).

### 7. Search grounding doesn't return usable URLs as the plan assumes - Severity: Major
* **Reviewer Lens:** `design`, `implementation-readiness`
* **Affected Scope:** Search L46
* **Discrepancy Description:** Grounded responses put their sources in `groundingMetadata.groundingChunks[].web.uri`, and those are `vertexaisearch.cloud.google.com/grounding-api-redirect/...` URLs, not the real pages. Search grounding also can't reliably be combined with JSON mode in the same call. "Output: candidate URLs" will not simply fall out of the call.
* **Rationale & Recommendation:**
  * Parse `groundingChunks`, and resolve each redirect through the SSRF-guarded fetcher, following redirects manually.
  * Rank candidates: the official domain first, then `developers.*` and `docs.*` subdomains.
  * Add deterministic seed URLs (`developers.<domain>`, `docs.<domain>`, `/.well-known/*`) so one weak search still yields sources.
  * Cap the work: at most 8 candidates, 5 fetched pages, 200 KB per page, 8 s per fetch, and about 60k characters of total context.

### 8. Runtime, timeouts and the progress-stream contract are missing on Vercel - Severity: Major
* **Reviewer Lens:** `implementation-readiness`, `design`
* **Affected Scope:** Architecture L37, Pages L42, Pipeline L54, Key L56
* **Discrepancy Description:** Search, fetching, probing and synthesis together take about 30-90 s. The plan sets no `runtime` and no `maxDuration`, and the Edge runtime lacks the `dns` module the SSRF guard needs. There are no SSE event types and no failure rules for:
  * Gemini 429s
  * zero search results
  * every fetch failing
  * Zod failure
  * the client disconnecting

  `EventSource` also cannot POST.
* **Rationale & Recommendation:**
  * In `app/api/generate/route.ts`, set `runtime = 'nodejs'` and `maxDuration = 60` (confirm the Hobby limit; Fluid compute allows more).
  * Set an overall deadline of about 55 s plus per-stage deadlines.
  * Define events as `{type: 'stage'|'log'|'result'|'error', stage, message, data?}`, sent from `POST /api/generate`. The client reads the stream with fetch and a ReadableStream (plain NDJSON is fine). Send a heartbeat every 10 s.
  * Failure rules:
    * Probe and fetch failures are non-fatal and get logged.
    * Zero fetched pages ends the job with a friendly message.
    * A 429 shows "free-tier limit reached, browse the library".
  * Deployment: set `GEMINI_API_KEY` and the KV vars for Production and Preview, add `.env.example`, and confirm `.env*.local` is gitignored.
  * Alternative to note: run each stage as its own short POST under a job ID, which removes the single long stream.

### 9. The SSRF guard is incomplete, and prompt injection is not covered - Severity: Major
* **Reviewer Lens:** `design`
* **Affected Scope:** Fetch & probe L49-52, Synthesize L53, Risks L71-75
* **Discrepancy Description:** "https, block private IPs, GET only" misses:
  * DNS rebinding
  * redirects into private ranges
  * IPv6, IPv4-mapped and decimal or octal IP forms
  * non-443 ports
  * second-hop targets such as the `authorization_endpoint` read from a discovery document the user controls

  Fetched pages and user-submitted sites go straight into the synthesizer. A malicious page can plant phishing "register here" links or fake claims. Rendered links are also an XSS surface.
* **Rationale & Recommendation:**
  * SSRF:
    * Resolve DNS, reject private, loopback, link-local and metadata addresses, and pin the connection to the checked IP (an undici Agent with a custom `lookup`).
    * Follow redirects manually, at most 3 hops, re-checking each one.
    * Allow port 443 only and only HTML, JSON and plain-text content types; cap the body at about 2 MB and fetches at about 8 per job.
    * Send every probe target through the same guard.
    * Write a unit test for each bypass case.
  * Prompt injection:
    * Wrap fetched text in delimited untrusted blocks, and give the synthesis call no tools.
    * Derive claim status in code (finding 2).
    * Drop any output link that isn't in the fetched set or on the official domain.
    * Allow only `https:` links, escape all text, and add `rel="noopener noreferrer"`.
  * Add both to Risks.

### 10. Generator edge cases, dedupe, caching and quota protection are undefined - Severity: Major
* **Reviewer Lens:** `zoom-out`, `implementation-readiness`, `design`
* **Affected Scope:** Goal L10, Pages L38-42, Risks L72
* **Discrepancy Description:** The plan doesn't say:
  * How "Google", "gmail" and `https://mail.google.com` map to one key.
  * What happens when the app is already in the library.
  * What happens when the app has no OAuth (API keys only), is ambiguous, or has no findable docs.
  * What "cache results" is keyed on.
  * How slug collisions are handled.

  Everyone using the deployed link shares the 500 grounded requests per day. One grader repeatedly clicking Generate can use them up mid-review.
* **Rationale & Recommendation:**
  * Normalize URL input to its registrable domain and name input to lowercase alphanumeric.
  * If the input matches a curated guide's `aliases[]` or `officialDomain`, redirect to that guide and skip generation.
  * Cache under `gen:{normalizedKey}` with a 7-day TTL and a `?refresh=1` override.
  * Add a per-IP limit, e.g. 5 generations per hour, using Upstash ratelimit.
  * Let the agent return a short verdict such as "no public OAuth / API key only / official docs not found" instead of inventing steps.
  * Pre-generate 2-3 apps outside the library (Linear, Xero) so the demo still works if the quota runs out.

### 11. No success metric, and the verification has no pass bar or format - Severity: Major
* **Reviewer Lens:** `zoom-out`, `comprehension`, `implementation-readiness`, `design`
* **Affected Scope:** Goal L8-11, Pages L43, Verification L61-63
* **Discrepancy Description:** Nothing defines what a good guide is, which is the biggest product-judgment gap for an APM role. "Compare against official docs" (L63) has no pass criterion. The log's vocabulary (confirmed / corrected / unverifiable) is never connected to the claim labels, and `/verification` has no data source.
* **Rationale & Recommendation:**
  * Add a usefulness metric, e.g. "a developer knows difficulty, wait time and the #1 blocker within 30 s".
  * Add a quality metric: the share of claims that are confirmed, corrected or wrong across N apps the generator hasn't seen.
  * Add a golden test: generate 2 curated apps and diff the verdict and requirements against the curated versions.
  * Report the share of quotes that verify.
  * Store the log in `data/verification.json` as `[{guideSlug, claimId, originalStatus, result, note, checkedAt}]`, and state what a correction does to the published guide.

### 12. No priority tiers, milestones, definition of done or test plan, and the budget is optimistic - Severity: Major
* **Reviewer Lens:** `zoom-out`, `implementation-readiness`
* **Affected Scope:** Budget L68-69, whole plan
* **Discrepancy Description:** Every feature has the same weight, so there is no rule for what to cut if the work overruns. The budget adds up to 7.5h with no slack. 2h for the agent is optimistic, and 2.5h for the app is generous next to it. There is no list of files to create and no test plan.
* **Rationale & Recommendation:**
  * Priority tiers:
    * Must: generator, shareable guide, evidence labels.
    * Should: 6-guide library and verification log.
    * Could: search, copy-as-Markdown.
  * Checkpoint at about 4h: if the generator doesn't produce valid output end to end, stop polishing the UI.
  * Milestones, each deployable:
    * M0: model spike.
    * M1: schema, plus GitHub rendering at `/guides/github`.
    * M2: pipeline as a script (`scripts/generate.ts <app>`).
    * M3: streaming route and `/generate` UI.
    * M4: storage and sharing.
    * M5: library drafted by the generator and reviewed.
    * M6: verification and README.
  * Rebalanced budget: spike 0.3h, agent+schema 2.7h, app 1.5h, library 1.5h, verification+README 1h. That leaves about 1h buffer.
  * Definition of done: every JSON file passes Zod in `npm test`; every step has a claim; "Linear" produces a guide in under 60 s.
  * Add a file list (`lib/schema.ts`, `lib/pipeline/*`, `lib/store.ts`, `app/api/generate/route.ts`).

### 13. "Agent" means four different things, and `owner: agent` is unexplained - Severity: Major
* **Reviewer Lens:** `comprehension`, `zoom-out`
* **Affected Scope:** L3, L10, L29, L59
* **Discrepancy Description:** The word "agent" is used for:
  * the developer's own AI product (L3)
  * the live generator (L10)
  * the Claude research subagents used while building (L59)
  * a step owner in the schema (L29)

  A reader can't tell who carries out an `owner: agent` step.
* **Rationale & Recommendation:** Name each one separately: "your product", "the generator", "research subagents (build-time)". Either define `owner: agent` as "a step a coding assistant can do from a pasted prompt", ideally shipping that prompt, or drop it.

### 14. The user's end-to-end experience is not described - Severity: Major
* **Reviewer Lens:** `comprehension`
* **Affected Scope:** Goal L10, Pages L38-43, Pipeline L54
* **Discrepancy Description:** A reader can't walk through `/generate`. The plan doesn't say how long it takes, what each stage shows, what happens when the app is already in the library or on failure, or whether generated guides look different from curated ones.
* **Rationale & Recommendation:** Add a 6-8 line walkthrough: landing page, then search, then "not found, generate", then the streamed stages, the finished guide with a "Generated, unreviewed" badge, Share, and the error state. State the link format.

### 15. The plan's own market and quota claims carry no evidence labels - Severity: Major
* **Reviewer Lens:** `comprehension`
* **Affected Scope:** Problem L6, Pipeline L46, Risks L73
* **Discrepancy Description:** The Composio figures (387 / 125 / 262) have no URL, check date or counting method. Composio and "managed auth" are never explained. The plan sells evidence judgment, so unlabelled facts in the plan itself undercut it.
* **Rationale & Recommendation:** Add the URL, check date and counting method. Add one line explaining that Composio is an agent-integration platform and that managed auth means Composio supplies the OAuth client. Tag each figure, e.g. `sourced, 2026-xx-xx`.

### 16. No Alternatives section - Severity: Major
* **Reviewer Lens:** `design`, `zoom-out`
* **Affected Scope:** Architecture L36-54
* **Discrepancy Description:** The plan makes trade-off decisions without recording the options it rejected. Graders read this as judgment.
* **Rationale & Recommendation:** Add a short table covering:
  * one stream vs. client-driven stages
  * KV vs. signed URL
  * one model vs. split models
  * search vs. discovery plus docs only
  * hand-curated vs. generator-drafted library

  Give one line of reasoning each.

### 17. Domain jargon is not explained - Severity: Nit
* **Reviewer Lens:** `comprehension`
* **Affected Scope:** L4, L20-22, L38, L42, L46, L52, L72
* **Discrepancy Description:** The domain terms are central to the developer's problem and are never explained: CASA, brand verification, publisher verification, tenant admin consent, Slack distribution vs. Marketplace, and restricted scopes. Infrastructure shorthand (RPD/RPM, KV, SSE, SSRF, grounding) is also unexpanded.
* **Rationale & Recommendation:** Add a glossary of 6-8 lines, or expand each term on first use. Name the specific KV product.

### 18. The sixth library app is not chosen - Severity: Nit
* **Reviewer Lens:** `zoom-out`, `implementation-readiness`, `comprehension`
* **Affected Scope:** Library L24
* **Discrepancy Description:** The table says "Notion or Zoom".
* **Rationale & Recommendation:** Choose **Notion**. Its public-integration review needs a privacy policy and a demo, you can explore it with a free workspace, and it differs from HubSpot's marketplace review. Zoom needs more account setup. Record the reason in one line.

### 19. Small YAGNI items - Severity: Nit
* **Reviewer Lens:** `zoom-out`
* **Affected Scope:** Pages L40-43
* **Discrepancy Description:** Some features are heavier than six guides need.
* **Rationale & Recommendation:**
  * Use difficulty and wait filters instead of full-text search.
  * Use streamed NDJSON instead of SSE plumbing.
  * Render `/verification` from the JSON log rather than building a separate data model.
  * Change "schema supports 100" to "adding a guide = adding one JSON file, no code change".

### 20. The verification and research steps don't say who runs them or what they produce - Severity: Nit
* **Reviewer Lens:** `implementation-readiness`
* **Affected Scope:** Research L59, Verification L61-62
* **Discrepancy Description:** "Re-check 2-3 curated guides" doesn't say who does it, against which claims, or what output it produces.
* **Rationale & Recommendation:** Re-check every `tested` claim plus a random sample of 10 `sourced` claims per guide. Write the results to `data/verification.json` (see finding 11).

---

## Reviewer disagreements resolved
* **Storage:** zoom-out preferred the simplest option, an lz-string URL fragment. Design noted that URL guides can be forged, which defeats the evidence badges. The report recommends Upstash free tier, or a signed URL if KV is avoided.
* **Curated research:** zoom-out wants the generator to draft the library. Design wants named manual tests per app. The two are combined: the generator drafts, a person reviews, and manual `tested` steps are added for 2-3 free apps.
