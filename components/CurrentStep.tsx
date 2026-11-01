"use client";
import { useEffect } from "react";

// Plays the title highlight sweep, and marks the schedule row the reader is on: the last row whose top has passed the upper third of the screen.
export default function CurrentStep() {
  useEffect(() => {
    // The title highlight is visible without JS; this only replays it as one sweep on arrival.
    // Skipped in a hidden tab, where animations do not run and the mark would sit at 0%.
    if (document.visibilityState === "visible") document.querySelector(".cp-title mark")?.classList.add("cp-sweep");
    const rows = [...document.querySelectorAll<HTMLElement>(".cp-row")];
    if (!rows.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight / 3;
      let here: HTMLElement | null = null;
      for (const r of rows) if (r.getBoundingClientRect().top <= line) here = r;
      const last = rows[rows.length - 1].getBoundingClientRect();
      if (last.bottom < 0) here = null;
      rows.forEach((r) => r.classList.toggle("cp-here", r === here));
    };
    // Throttle by time rather than animation frame, so the marker still updates in throttled tabs.
    let last = 0;
    const onScroll = () => {
      const now = Date.now();
      if (now - last > 60) { last = now; update(); }
      else if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
