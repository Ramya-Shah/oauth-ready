"use client";
import Link from "next/link";
import { useState } from "react";
import { Difficulty } from "./bits";
import { DIFFICULTY_RUBRIC, formatWait, type DayRange } from "@/lib/schema";

type Item = {
  slug: string; name: string; origin: string; officialDomain: string; difficulty: number; wait: DayRange;
  topBlocker: string; effort: { min: number; max: number }; counts: Record<string, number>; reviewed: boolean;
};

const FILTERS = [
  { k: "all", t: "All" },
  { k: "fast", t: "No review wait" },
  { k: "review", t: "Needs review" },
  { k: "hard", t: "Security assessment / weeks" },
];

function match(i: Item, f: string) {
  if (f === "fast") return i.wait !== "unknown" && i.wait.maxDays === 0;
  if (f === "review") return i.difficulty >= 3;
  if (f === "hard") return i.difficulty >= 5;
  return true;
}

function Card({ i }: { i: Item }) {
  const total = Object.values(i.counts).reduce((a, b) => a + b, 0);
  const strong = (i.counts.tested ?? 0) + (i.counts.sourced ?? 0);
  return (
    <Link href={`/guides/${i.slug}`} className="card">
      <h3>
        <span>{i.name}</span>
        <Difficulty n={i.difficulty} />
      </h3>
      <div className="small muted">{DIFFICULTY_RUBRIC[i.difficulty]}</div>
      <div className="row small" style={{ margin: "10px 0" }}>
        <span className="pill">⏱ {i.effort.min}–{i.effort.max} h work</span>
        <span className="pill">⌛ wait {formatWait(i.wait)}</span>
      </div>
      <div className="small"><b>Top blocker:</b> {i.topBlocker}</div>
      <div className="small muted" style={{ marginTop: 8 }}>
        {strong}/{total} claims tested or officially sourced{i.counts.tested ? ` · ${i.counts.tested} tested` : ""}
        {i.origin === "curated" ? (i.reviewed ? " · human-reviewed" : " · curated") : " · agent-generated"}
      </div>
    </Link>
  );
}

export default function Library({ curated, generated }: { curated: Item[]; generated: Item[] }) {
  const [f, setF] = useState("all");
  const c = curated.filter((i) => match(i, f));
  const g = generated.filter((i) => match(i, f));
  return (
    <>
      <div className="chips">
        {FILTERS.map((x) => (
          <button key={x.k} className={`chip ${f === x.k ? "on" : ""}`} onClick={() => setF(x.k)}>{x.t}</button>
        ))}
      </div>
      <h2 style={{ marginTop: 0 }}>Library</h2>
      <div className="grid">{c.map((i) => <Card key={i.slug} i={i} />)}</div>
      {!c.length && <p className="muted">No library guides match.</p>}
      {g.length > 0 && (
        <>
          <h2>Recently generated</h2>
          <div className="grid">{g.map((i) => <Card key={i.slug} i={i} />)}</div>
        </>
      )}
    </>
  );
}
