"use client";
import { useState } from "react";

export default function ShareBar({ markdown }: { markdown: string }) {
  const [msg, setMsg] = useState("");
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setMsg(label); } catch { setMsg("Copy failed"); }
    setTimeout(() => setMsg(""), 1800);
  };
  return (
    <div className="row">
      <button className="btn" onClick={() => copy(window.location.href, "Link copied")}>Copy link</button>
      <button className="btn" onClick={() => copy(markdown, "Markdown copied")}>Copy as Markdown</button>
      <button className="btn" onClick={() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
        a.download = `${location.pathname.split("/").pop()}-oauth-guide.md`;
        a.click();
      }}>Download .md</button>
      {msg && <span className="small muted">{msg}</span>}
    </div>
  );
}
