# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the reviewers of the APM Integrations take-home assignment (Composio-style managed-auth context). They judge understanding of the developer's problem, usefulness of the guidance, judgment about evidence, and thoughtful use of agents, and they may submit an unfamiliar app to watch a guide generate live.

Secondary: developers and agent builders who need their users to connect a third-party app through OAuth and want to know how long until they can launch, how much work it is, and what could block approval.

## Product Purpose

OAuth Ready gives a ready-to-use, shareable guide for setting up and getting approved a provider OAuth app, for a library of apps and for any app submitted by name or website. Success: a reader understands in seconds how hard it is, the hands-on effort versus the wait for provider approval, the requirements and nuances, and what an agent can do versus where they take over.

## Positioning

- **Work vs. wait verdict:** one answer up front separating the team's hands-on hours from calendar days waiting on the provider, on a scale shared by every app.
- **Code-checked evidence:** every claim is labelled tested, official source, community source, or uncertain by code (quote must appear verbatim on a fetched page; tested requires a probe run by the pipeline), never by the model.
- **Agent vs. you split:** each step is owned by an agent, the developer, or the provider.
- **Live generation:** any app gets a guide in roughly a minute through a visible agent pipeline (identify, search, read, probe endpoints, draft, verify).

## Operating Context

Guides are read on desktop by reviewers and developers, shared by link or exported as Markdown. A verification log shows a sample of claims checked against provider docs (confirmed, corrected, unverifiable) and what was learned.

## Capabilities and Constraints

- Next.js App Router, TypeScript; guides are JSON validated with Zod (`lib/schema.ts`).
- Generation runs on the free Gemini tier (20 requests/day per model, model rotation) with Tavily search; rate limited to 5 new guides per IP per hour.
- Each guide has: verdict (difficulty 1–5, active effort hours, approval wait range or unknown, top blocker, summary), steps by phase (dev, test, production) with owner, requirements, scopes, blockers, gaps, review additions, claims with evidence, pages consulted.
- Open product issue: some guides count optional marketplace listing review as OAuth approval wait; a fix is planned and must not be papered over visually.

## Evidence on Hand

- Library guides in `data/guides/` (GitHub, Slack, Gmail, Microsoft Entra ID, HubSpot, Notion) and generated guides in `data/generated/` (Xero, Linear, Calendly).
- Verification log in `data/verification.json`: 52 claims checked across GitHub, Slack and Gmail by reviewer agents; 36 confirmed, 11 corrected, 5 unverifiable.
- No hands-on provider app registrations or completed approvals exist yet; do not imply them.

## Product Principles

1. Answer "an hour or six weeks?" before anything else.
2. Show how we know: evidence is visible and never overstated.
3. Separate what an agent can do from what the developer must do or wait on.
4. Be honest about uncertainty; unknown stays unknown.
