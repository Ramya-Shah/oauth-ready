import { describe, it, expect } from "vitest";
import { isPrivateIp, validateUrl } from "../lib/fetcher";
import { quoteFound, enforce, type Source } from "../lib/enforce";
import type { Draft } from "../lib/schema";
import type { Probe } from "../lib/probe";

describe("SSRF guard", () => {
  it("blocks private, loopback, link-local and mapped addresses", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "192.168.1.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0"])
      expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "140.82.112.3", "2606:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
  it("rejects non-https, odd ports, IP literals and internal names", () => {
    for (const u of ["http://example.com", "https://example.com:8443/", "https://127.0.0.1/", "https://[::1]/", "https://localhost/", "https://intranet/", "https://u:p@example.com/"])
      expect(() => validateUrl(u), u).toThrow();
    expect(validateUrl("https://docs.github.com/en").hostname).toBe("docs.github.com");
  });
});

describe("quote matching", () => {
  const page = "To create an OAuth app, go to Settings → Developer settings. Click “New OAuth App”. Enter the Authorization callback URL.";
  it("matches verbatim quotes ignoring punctuation and case", () => {
    expect(quoteFound('click "new oauth app". Enter the authorization callback URL', page)).toBe(true);
  });
  it("rejects paraphrase and tiny quotes", () => {
    expect(quoteFound("press the button to make a new app and set callback", page)).toBe(false);
    expect(quoteFound("OAuth", page)).toBe(false);
  });
});

describe("evidence enforcement", () => {
  const sources: Source[] = [
    { id: "S1", url: "https://docs.github.com/x", title: "", official: true, text: "OAuth apps can be created by any user without review.", via: "fetch" },
    { id: "S2", url: "https://blog.example.com/y", title: "", official: false, text: "In my experience the review took about three weeks for us.", via: "fetch" },
  ];
  const probes: Probe[] = [{ id: "P1", kind: "authorize", url: "https://github.com/login/oauth/authorize?x", ok: true, summary: "", artifact: "HTTP 404", at: "2026-11-01T00:00:00Z" }];
  const base = { name: "GitHub", aliases: [], supportsOAuth: true as const,
    verdict: { difficulty: 1, activeEffortHours: { min: 0.5, max: 1 }, approvalWait: { minDays: 0, maxDays: 0 }, topBlocker: "x", summary: "y", claimIds: ["c1", "ghost"] },
    steps: [{ id: "s1", phase: "dev" as const, title: "t", detail: "d", owner: "you" as const, links: ["https://docs.github.com/a", "https://evil.example/phish"], claimIds: ["c2"] }],
    requirements: [], scopes: [], blockers: [], gaps: [], optionalPaths: [], limits: [] };
  const draft: Draft = { ...base, claims: [
    { id: "c1", text: "Endpoint live", probeRef: "P1" },
    { id: "c2", text: "No review", sourceRef: "S1", quote: "OAuth apps can be created by any user without review" },
    { id: "c3", text: "Review takes weeks", sourceRef: "S2", quote: "the review took about three weeks for us" },
    { id: "c4", text: "Invented", sourceRef: "S1", quote: "GitHub requires a security assessment for all apps" },
    { id: "c5", text: "No source" },
  ] };
  const g = enforce(draft, { sources, probes, officialRoot: "github.com", slug: "github", model: "m" });
  const label = (id: string) => g.claims.find((c) => c.id === id)?.label;
  it("assigns labels from evidence, not from the model", () => {
    expect(label("c1")).toBe("tested");
    expect(label("c2")).toBe("sourced");
    expect(label("c3")).toBe("community");
    expect(label("c4")).toBe("uncertain");
    expect(label("c5")).toBe("uncertain");
  });
  it("drops unknown claim ids and links that were neither fetched nor official", () => {
    expect(g.verdict.claimIds).toEqual(["c1"]);
    expect(g.steps[0].links).toEqual(["https://docs.github.com/a"]);
  });
});

import { findAuthorizeUrls } from "../lib/probe";
describe("authorize URL extraction", () => {
  it("keeps endpoints and ignores documentation pages", () => {
    const t = "See https://learn.microsoft.com/en-us/graph/auth-register-app-v2 and https://login.microsoftonline.com/common/oauth2/v2.0/authorize?x=1 and https://developers.google.com/workspace/gmail/api/auth/scopes and https://accounts.google.com/o/oauth2/v2/auth.";
    expect(findAuthorizeUrls(t, "microsoftonline.com")).toEqual(["https://login.microsoftonline.com/common/oauth2/v2.0/authorize"]);
    expect(findAuthorizeUrls(t, "microsoft.com")).toEqual([]);
    expect(findAuthorizeUrls(t, "google.com")).toEqual(["https://accounts.google.com/o/oauth2/v2/auth"]);
  });
});
