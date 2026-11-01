"""Apply the second review round (data/verify2-<slug>.json) to library guides.

Round 2 separates three things in every guide: the wait REQUIRED before any customer can
connect through OAuth (verdict.approvalWait), optional listings (optionalPaths), and limits
after users connect (limits). It also rechecks claims against official docs. Results are
appended to data/verification.json as round 2.

Usage: python scripts/apply-review2.py github slack gmail microsoft-entra-id hubspot notion
"""
import json, re, sys
from urllib.parse import urlparse

DATE = "2026-11-01"
OFFICIAL = {
    "github": ("github.com",),
    "slack": ("slack.com", "slack.dev"),
    "gmail": ("google.com", "googleapis.com"),
    "microsoft-entra-id": ("microsoft.com", "microsoftonline.com", "azure.com"),
    "hubspot": ("hubspot.com",),
    "notion": ("notion.com", "notion.so"),
}

def official(url, slug):
    h = urlparse(url).hostname or ""
    if re.match(r"^(community|forums?|discuss|answers)\.", h):
        return False
    return any(h == r or h.endswith("." + r) for r in OFFICIAL[slug])

def first_url(t):
    m = re.search(r"https?://[^\s,;)\"'“”]+", t or "")
    return m.group(0).rstrip(".") if m else None

def quote_of(t):
    m = re.search(r"[\"“]([^\"”]{12,})[\"”]", t or "")
    return m.group(1) if m else None

def evidence_claim(cid, text, evidence, slug):
    url, q = first_url(evidence), quote_of(evidence)
    c = {"id": cid, "text": text, "checkedAt": DATE, "note": f"Added in review round 2, {DATE}."}
    if url:
        c["url"] = url
        c["label"] = "sourced" if official(url, slug) else "community"
        if q:
            c["quote"] = q
    else:
        c["label"] = "uncertain"
    return c

log_entries = []
for slug in sys.argv[1:]:
    gp, vp = f"data/guides/{slug}.json", f"data/verify2-{slug}.json"
    g, v = json.load(open(gp, encoding="utf8")), json.load(open(vp, encoding="utf8"))
    claims = {c["id"]: c for c in g["claims"]}

    # Claim checks
    for e in v.get("entries", []):
        e = {**e, "guide": slug, "round": 2}
        log_entries.append(e)
        c = claims.get(e.get("claimId") or "")
        if not c:
            continue
        url, q = first_url(e.get("evidence")), quote_of(e.get("evidence"))
        if e["outcome"] == "corrected":
            c["note"] = f"Corrected in review round 2, {DATE}; it previously said: {e.get('before') or c['text']}"
            c["text"] = e.get("after") or c["text"]
            if url:
                c["url"] = url
                c["label"] = "sourced" if official(url, slug) else "community"
                if q:
                    c["quote"] = q
                else:
                    c.pop("quote", None)
            c["checkedAt"] = DATE
        elif e["outcome"] == "confirmed":
            c["note"] = (re.sub(r"\s*Confirmed against primary source in review [\d-]+\.", "", c.get("note", "")) + f" Confirmed against primary source in review {DATE}.").strip()
            if c["label"] == "uncertain" and url and official(url, slug):
                c["label"], c["url"] = "sourced", url
                if q:
                    c["quote"] = q
        else:
            c["note"] = (c.get("note", "") + f" Not verifiable from an official source in review round 2, {DATE}.").strip()
            if c["label"] == "sourced":
                c["label"] = "uncertain"

    # Verdict: approvalWait now means only what blocks any customer from connecting.
    vd = v.get("verdict") or {}
    for k in ("difficulty", "approvalWait", "activeEffortHours", "topBlocker", "summary"):
        if k in vd:
            g["verdict"][k] = vd[k]
    if vd.get("reason"):
        g["reviewNote"] = vd["reason"]

    # Optional listings and limits, each backed by its own claim.
    g["claims"] = [c for c in g["claims"] if not re.match(r"^(o|l)\d+$", c["id"])]
    g["optionalPaths"], g["limits"] = [], []
    for i, o in enumerate(v.get("optionalPaths", []), 1):
        c = evidence_claim(f"o{i}", f"{o['name']}: {o['why']}", o.get("evidence"), slug)
        g["claims"].append(c)
        g["optionalPaths"].append({"name": o["name"], "wait": o.get("wait", "unknown"), "why": o["why"], "claimIds": [c["id"]]})
    for i, l in enumerate(v.get("limits", []), 1):
        c = evidence_claim(f"l{i}", f"{l['limit']}: {l['impact']}", l.get("evidence"), slug)
        g["claims"].append(c)
        g["limits"].append({"limit": l["limit"], "impact": l["impact"], "claimIds": [c["id"]]})

    # Step changes
    steps = {s["id"]: s for s in g["steps"]}
    drop = set()
    for ch in v.get("stepChanges", []):
        s = steps.get(ch.get("stepId"))
        if not s:
            continue
        if ch["change"] == "remove":
            drop.add(s["id"])
        elif ch["change"] == "mark-optional":
            t = re.sub(r"^\((optional|marketplace path)\)\s*", "", s["title"], flags=re.I)
            s["title"] = f"(Optional) {t}"
        elif ch["change"] == "edit":
            s["title"] = ch.get("newTitle") or s["title"]
            s["detail"] = ch.get("newDetail") or s["detail"]
    g["steps"] = [s for s in g["steps"] if s["id"] not in drop]

    # New facts the guide missed
    g["reviewAdditions"] = [a for a in g.get("reviewAdditions", []) if not any(re.match(r"^m\d+$", i) for i in a["claimIds"])]
    g["claims"] = [c for c in g["claims"] if not re.match(r"^m\d+$", c["id"])]
    for i, m in enumerate(v.get("missing", []), 1):
        url = first_url(m)
        text = re.sub(r"\s*[-–(:]?\s*https?://\S+.*$", "", m).strip(" -:")
        c = evidence_claim(f"m{i}", text, m, slug)
        g["claims"].append(c)
        g["reviewAdditions"].append({"text": text, "claimIds": [c["id"]]})

    g["reviewedAt"] = DATE
    json.dump(g, open(gp, "w", encoding="utf8"), indent=2, ensure_ascii=False)
    n = {o: sum(e["outcome"] == o for e in v.get("entries", [])) for o in ("confirmed", "corrected", "unverifiable")}
    print(f"{slug}: {n}, wait={g['verdict']['approvalWait']}, optional={len(g['optionalPaths'])}, limits={len(g['limits'])}, steps dropped={len(drop)}")

# Append round 2 to the verification log
vp = "data/verification.json"
log = json.load(open(vp, encoding="utf8"))
log["entries"] = [e for e in log["entries"] if e.get("round") != 2] + log_entries
json.dump(log, open(vp, "w", encoding="utf8"), indent=2, ensure_ascii=False)
print("verification log entries:", len(log["entries"]))
