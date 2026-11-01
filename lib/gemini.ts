// Minimal Gemini REST client for the free tier.
// Free tier = 20 requests/day per model, and the newest models are often overloaded (503),
// so calls rotate through a quality-ordered chain and skip models whose daily quota is spent.

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const list = (v: string | undefined, d: string) => (v || d).split(",").map((s) => s.trim()).filter(Boolean);

// Best writers first. `light` is for the small identify call so it doesn't burn writer quota.
export const WRITE_CHAIN = list(process.env.WRITE_MODELS, "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite");
export const LIGHT_CHAIN = list(process.env.LIGHT_MODELS, "gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-3.5-flash,gemini-3.6-flash");

const exhausted = new Map<string, number>(); // model -> epoch ms when retry is allowed

export async function generateJson(
  prompt: string,
  opts: { system?: string; timeoutMs?: number; tier?: "write" | "light" } = {},
): Promise<{ text: string; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const chain = opts.tier === "light" ? LIGHT_CHAIN : WRITE_CHAIN;
  const errors: string[] = [];
  for (let round = 0; round < 2; round++) {
    for (const model of chain) {
      if ((exhausted.get(model) ?? 0) > Date.now()) continue;
      try {
        const res = await fetch(`${BASE}/${model}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
        });
        if (res.status === 429) {
          const body = await res.text();
          // Daily cap: skip this model for 12h. Per-minute cap: skip for 1 min.
          exhausted.set(model, Date.now() + (/PerDay/.test(body) ? 12 * 3600_000 : 60_000));
          errors.push(`${model}: quota`);
          continue;
        }
        if (res.status >= 500) {
          errors.push(`${model}: busy (${res.status})`);
          continue;
        }
        const j = await res.json();
        if (!res.ok) {
          errors.push(`${model}: ${j?.error?.message ?? res.status}`);
          continue;
        }
        const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
        if (!text) {
          errors.push(`${model}: empty (${j.candidates?.[0]?.finishReason ?? "no candidate"})`);
          continue;
        }
        return { text, model };
      } catch (e) {
        errors.push(`${model}: ${(e as Error).name === "TimeoutError" ? "timeout" : (e as Error).message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`No free-tier model available right now (${errors.slice(-6).join("; ")}). Try again in a few minutes.`);
}

export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  return JSON.parse(t);
}
