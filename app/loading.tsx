// Shown the moment a link is clicked, while the next page loads.
export default function Loading() {
  return (
    <section className="sheet page-sheet loading-sheet" aria-busy="true" aria-live="polite">
      <p className="loading-line">Loading…</p>
      <div className="loading-bar" />
    </section>
  );
}
