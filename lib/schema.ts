import { z } from "zod";

// Evidence labels. `tested` is only ever assigned by code (lib/enforce.ts), never by the model.
export const Label = z.enum(["tested", "sourced", "community", "uncertain"]);
export type Label = z.infer<typeof Label>;

export const Claim = z.object({
  id: z.string(),
  text: z.string(),
  label: Label,
  url: z.string().optional(),
  quote: z.string().optional(),
  method: z.string().optional(),
  artifact: z.string().optional(),
  note: z.string().optional(),
  checkedAt: z.string(),
});
export type Claim = z.infer<typeof Claim>;

export const DayRange = z.union([
  z.object({ minDays: z.number(), maxDays: z.number() }),
  z.literal("unknown"),
]);
export type DayRange = z.infer<typeof DayRange>;

const claimIds = z.array(z.string()).default([]);

export const Phase = z.enum(["dev", "test", "production"]);
export const Owner = z.enum(["agent", "you", "provider"]);
export const RequirementKind = z.enum([
  "domain",
  "privacy_policy",
  "tos",
  "demo_video",
  "security_assessment",
  "paid_plan",
  "business_verification",
  "developer_account",
  "other",
]);

export const Step = z.object({
  id: z.string(),
  phase: Phase,
  title: z.string(),
  detail: z.string(),
  owner: Owner,
  minutes: z.number().optional(),
  links: z.array(z.string()).default([]),
  claimIds,
});
export type Step = z.infer<typeof Step>;

export const Requirement = z.object({
  kind: RequirementKind,
  requiredFor: z.enum(["test", "production"]),
  note: z.string(),
  claimIds,
});

export const Scope = z.object({
  scope: z.string(),
  triggersReview: z.union([z.boolean(), z.literal("unknown")]),
  note: z.string(),
  claimIds,
});

export const Blocker = z.object({
  symptom: z.string(),
  cause: z.string(),
  unblock: z.string(),
  claimIds,
});

export const Verdict = z.object({
  difficulty: z.number().int().min(1).max(5),
  activeEffortHours: z.object({ min: z.number(), max: z.number() }),
  approvalWait: DayRange,
  topBlocker: z.string(),
  summary: z.string(),
  claimIds,
});

export const Guide = z.object({
  schemaVersion: z.literal(1),
  slug: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  officialDomain: z.string(),
  supportsOAuth: z.union([z.boolean(), z.literal("unknown")]).default(true),
  origin: z.enum(["curated", "generated"]),
  model: z.string().optional(),
  generatedAt: z.string(),
  reviewedAt: z.string().optional(),
  reviewNote: z.string().optional(),
  verdict: Verdict,
  steps: z.array(Step),
  requirements: z.array(Requirement),
  scopes: z.array(Scope),
  blockers: z.array(Blocker),
  claims: z.array(Claim),
  gaps: z.array(z.string()).default([]),
  reviewAdditions: z.array(z.object({ text: z.string(), claimIds })).default([]),
  sourcesConsulted: z
    .array(z.object({ url: z.string(), official: z.boolean(), fetched: z.boolean() }))
    .default([]),
});
export type Guide = z.infer<typeof Guide>;

/* ---------- What the model writes (before evidence enforcement) ---------- */

export const DraftClaim = z.object({
  id: z.string(),
  text: z.string(),
  sourceRef: z.string().optional().nullable(), // "S1".."Sn"
  quote: z.string().optional().nullable(),
  probeRef: z.string().optional().nullable(), // "P1".."Pn"
  note: z.string().optional().nullable(),
});
export type DraftClaim = z.infer<typeof DraftClaim>;

export const Draft = z.object({
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  supportsOAuth: z.union([z.boolean(), z.literal("unknown")]).default(true),
  verdict: Verdict,
  steps: z.array(Step),
  requirements: z.array(Requirement).default([]),
  scopes: z.array(Scope).default([]),
  blockers: z.array(Blocker).default([]),
  claims: z.array(DraftClaim),
  gaps: z.array(z.string()).default([]),
});
export type Draft = z.infer<typeof Draft>;

export const DIFFICULTY_RUBRIC: Record<number, string> = {
  1: "Instant self-serve",
  2: "Self-serve + app config",
  3: "Light review (< 1 week)",
  4: "Formal review (1–4 weeks)",
  5: "Security assessment / multi-week + cost",
};

export function labelCounts(g: Guide): Record<Label, number> {
  const c = { tested: 0, sourced: 0, community: 0, uncertain: 0 };
  for (const cl of g.claims) c[cl.label]++;
  return c;
}

export function formatWait(w: DayRange): string {
  if (w === "unknown") return "Unknown";
  if (w.maxDays === 0) return "None";
  if (w.minDays === w.maxDays) return `${w.minDays} day${w.minDays === 1 ? "" : "s"}`;
  return `${w.minDays}–${w.maxDays} days`;
}
