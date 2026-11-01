"""Apply human/agent review results (data/verify-<slug>.json) to library guides and build data/verification.json."""
import json, re, sys
from urllib.parse import urlparse

DATE = "2026-11-01"
OFFICIAL = {"github": "github.com", "slack": ("slack.com", "slack.dev"), "gmail": "google.com"}

def official(url, slug):
    roots = OFFICIAL[slug] if isinstance(OFFICIAL[slug], tuple) else (OFFICIAL[slug],)
    h = urlparse(url).hostname or ""
    return any(h == r or h.endswith("." + r) for r in roots)

def first_url(t):
    m = re.search(r"https?://[^\s,;)\"']+", t)
    return m.group(0).rstrip(".") if m else None

def quote_of(t):
    m = re.search(r"[\"“']([^\"”']{12,})[\"”']", t)
    return m.group(1) if m else None

log = []
for slug in sys.argv[1:]:
    gp, vp = f"data/guides/{slug}.json", f"data/verify-{slug}.json"
    g, v = json.load(open(gp, encoding="utf8")), json.load(open(vp, encoding="utf8"))
    claims = {c["id"]: c for c in g["claims"]}
    vc = v.get("verdictCorrection")
    if vc:
        for k in ("difficulty", "approvalWait", "activeEffortHours", "topBlocker"):
            if k in vc: g["verdict"][k] = vc[k]
        g["reviewNote"] = vc.get("reason", "")
    for e in v["entries"]:
        log.append(e)
        c = claims.get(e.get("claimId") or "")
        if not c: continue
        url, q = first_url(e["evidence"]), quote_of(e["evidence"])
        if e["outcome"] == "corrected":
            c["note"] = f"Corrected in review {DATE}; the agent originally said: {e.get('before') or c['text']}"
            c["text"] = e.get("after") or c["text"]
            if url:
                c["url"], c["label"] = url, ("sourced" if official(url, slug) else "community")
                c["quote"] = q or c.get("quote")
                if not q: c.pop("quote", None)
            c["checkedAt"] = DATE
        elif e["outcome"] == "confirmed":
            c["note"] = (c.get("note", "") + f" Confirmed against primary source in review {DATE}.").strip()
            if c["label"] == "uncertain" and url and official(url, slug):
                c["label"], c["url"] = "sourced", url
                if q: c["quote"] = q
        else:
            c["note"] = (c.get("note", "") + f" Not verifiable from an official source in review {DATE}.").strip()
            if c["label"] == "sourced": c["label"] = "uncertain"
    adds = []
    for i, m in enumerate(v.get("missing", []), 1):
        url = first_url(m)
        text = re.sub(r"\s*[-–(]?\s*https?://\S+.*$", "", m).strip(" -:")
        cid = f"r{i}"
        g["claims"].append({"id": cid, "text": text, "label": "sourced" if url and official(url, slug) else ("community" if url else "uncertain"),
                            **({"url": url} if url else {}), "note": f"Added in review {DATE}.", "checkedAt": DATE})
        adds.append({"text": text, "claimIds": [cid]})
    g["reviewAdditions"] = adds
    g["reviewedAt"] = DATE
    json.dump(g, open(gp, "w", encoding="utf8"), indent=2, ensure_ascii=False)
    print(slug, "applied", len(v["entries"]), "entries,", len(adds), "additions")

json.dump({
    "summary": "A sample of library guides was checked claim-by-claim against the providers' own documentation after the agent generated them. "
               "Each finding was applied to the guide: corrected claims show what the agent originally said, and items the agent missed appear under 'Added in human review'.",
    "method": "Three independent reviewer agents (Claude), one per guide, each read the generated JSON and checked at least 10 items against primary sources "
              "(docs.github.com, docs.slack.dev, developers.google.com / support.google.com) using web search and fetch, prioritising the verdict numbers. "
              "No accounts or apps were created; hands-on setup attempts are a planned follow-up. Reviewers were told the guide was written by a small free model and to be skeptical.",
    "entries": log,
}, open("data/verification.json", "w", encoding="utf8"), indent=2, ensure_ascii=False)
