import type { Claim, Label } from "@/lib/schema";

export const LABEL_TEXT: Record<Label, string> = {
  tested: "Tested",
  sourced: "Official source",
  community: "Community source",
  uncertain: "Uncertain",
};

export const LABEL_HELP: Record<Label, string> = {
  tested: "We ran it: an HTTP probe or a hands-on setup attempt, with the artifact recorded.",
  sourced: "Stated on the provider's own domain; the quote was found verbatim on the fetched page.",
  community: "Stated on a third-party page (forum, blog, integration vendor); quote verified on that page.",
  uncertain: "Inferred or unverifiable; no matching quote or probe.",
};

export function Difficulty({ n }: { n: number }) {
  return (
    <span className="diff" title={`Difficulty ${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} style={i <= n ? { background: `var(--d${n})` } : undefined} />
      ))}
    </span>
  );
}

export function Refs({ ids, claims }: { ids: string[]; claims: Claim[] }) {
  if (!ids?.length) return null;
  return (
    <>
      {[...new Set(ids)].map((id) => {
        const c = claims.find((x) => x.id === id);
        if (!c) return null;
        return (
          <a key={id} href={`#${id}`} className={`ref pill ${c.label}`} title={`${LABEL_TEXT[c.label]}: ${c.text}`}>
            {id}
          </a>
        );
      })}
    </>
  );
}

export function EvidenceBar({ counts }: { counts: Record<Label, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const order: Label[] = ["tested", "sourced", "community", "uncertain"];
  return (
    <div>
      <div className="evbar">
        {order.map((l) => (
          <span key={l} style={{ width: `${(counts[l] / total) * 100}%`, background: `var(--${l})` }} />
        ))}
      </div>
      <div className="row small">
        {order.map((l) => (
          <span key={l} className={`pill ${l}`} title={LABEL_HELP[l]}>
            {counts[l]} {LABEL_TEXT[l].toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
