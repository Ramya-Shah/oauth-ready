export type SearchHit = { url: string; title: string; content: string; rawContent?: string };

// Tavily web search. Returns [] (never throws) so the pipeline can fall back to seed URLs.
export async function search(
  query: string,
  opts: { includeDomains?: string[]; maxResults?: number; raw?: boolean } = {},
): Promise<SearchHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        max_results: opts.maxResults ?? 5,
        include_domains: opts.includeDomains,
        include_raw_content: opts.raw ? "text" : false,
        search_depth: "basic",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { results?: { url: string; title: string; content: string; raw_content?: string }[] };
    return (j.results ?? []).map((r) => ({ url: r.url, title: r.title, content: r.content, rawContent: r.raw_content ?? undefined }));
  } catch {
    return [];
  }
}
