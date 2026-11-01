import { Suspense } from "react";
import Generator from "@/components/Generator";

export const metadata = { title: "Generate a guide · OAuth Ready" };

export default function GeneratePage() {
  return (
    <section className="sheet page-sheet">
      <h1>Generate a guide for any app</h1>
      <p className="muted" style={{ maxWidth: 680 }}>
        The agent finds the provider's official developer docs, reads them, probes the provider's live OAuth endpoints, drafts a
        guide, then code checks every claim against what was actually fetched. Takes about 30–90 seconds on the free model tier.
      </p>
      <Suspense fallback={null}>
        <Generator />
      </Suspense>
    </section>
  );
}
