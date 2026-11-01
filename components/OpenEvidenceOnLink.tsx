"use client";
import { useEffect } from "react";

// The evidence list starts collapsed. Clicking a claim tag (#c3) or opening a link with
// that hash expands it first, so the jump lands on the claim.
export default function OpenEvidenceOnLink() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const target = id && document.getElementById(id);
      const box = document.getElementById("evidence") as HTMLDetailsElement | null;
      if (target && box && box.contains(target)) {
        box.open = true;
        target.scrollIntoView({ block: "center" });
      }
    };
    // Clicking the same tag twice doesn't change the hash, so also react to the click itself.
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element).closest?.("a.ref")) setTimeout(open, 0);
    };
    open();
    window.addEventListener("hashchange", open);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", open);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
