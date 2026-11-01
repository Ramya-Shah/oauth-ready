import type { DayRange } from "@/lib/schema";

// One scale for every app so bars are comparable: square-root of days, capped at 90.
// Hands-on hours are converted at 6 focused hours per working day.
const MAX_DAYS = 90;
const pos = (days: number) => Math.min(100, Math.sqrt(Math.max(0, days) / MAX_DAYS) * 100);
const TICKS = [
  { d: 1, t: "1 day" },
  { d: 7, t: "1 week" },
  { d: 30, t: "1 month" },
  { d: 90, t: "3 months" },
];

export function hoursText(h: { min: number; max: number }) {
  return h.min === h.max ? `${h.min} hours` : `${h.min}–${h.max} hours`;
}

export function waitText(w: DayRange) {
  if (w === "unknown") return "review time unknown";
  if (w.maxDays === 0) return "no review wait";
  const fmt = (d: number) => (d >= 14 ? `${Math.round(d / 7)}` : `${d}`);
  const unit = w.maxDays >= 14 ? "weeks" : "days";
  return w.minDays === 0
    ? `up to ${fmt(w.maxDays)} ${unit} waiting on review`
    : `then ${fmt(w.minDays)}–${fmt(w.maxDays)} ${unit} waiting on review`;
}

export default function RouteBar({
  effort,
  wait,
  size = "large",
}: {
  effort: { min: number; max: number };
  wait: DayRange;
  size?: "large" | "small";
}) {
  const workEnd = pos(effort.max / 6);
  const known = wait !== "unknown";
  const minEnd = known ? pos(effort.max / 6 + wait.minDays) : workEnd;
  const maxEnd = known ? pos(effort.max / 6 + wait.maxDays) : Math.max(workEnd, pos(30));
  const label = `${hoursText(effort)} of hands-on work, ${waitText(wait)}`;
  return (
    <div className={`route route-${size}`} role="img" aria-label={label}>
      <div className="route-track">
        <span className="route-work" style={{ width: `max(${workEnd}%, 6px)` }} />
        {known && wait.minDays > 0 && <span className="route-wait" style={{ left: `${workEnd}%`, width: `${minEnd - workEnd}%` }} />}
        {(!known || wait.maxDays > wait.minDays) && (
          <span className={known ? "route-maybe" : "route-unknown"} style={{ left: `${minEnd}%`, width: `${maxEnd - minEnd}%` }} />
        )}
      </div>
      {size === "large" && (
        <div className="route-ticks" aria-hidden>
          {TICKS.map((t) => (
            <span key={t.d} style={{ left: `${pos(t.d)}%` }}>{t.t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
