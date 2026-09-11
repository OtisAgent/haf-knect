#!/usr/bin/env python3
"""
READ THE LIVE PRODUCT. Nothing in the Demo Centre is typed from memory.

Brent, 11 Sep: "confirm they're all aligned". Alignment cannot be a promise in a
comment, so it is a read: the Demo Centre's screen names come out of the live
apps every time it is built, and the build fails if a name has moved.

Four reads, four surfaces:
  KNECT  the sidebar model HAF_NAV_V1 — every screen and the permission it needs
  PLNA   the driver's bar on /dashboard — the screens along the bottom
  Clever the stepper on the sign-in page, and the account types it offers
  Join   the fields the public sign-up form actually asks for

Imported by build_demo_showroom.py and by _demo_centre_aligned.mjs's python half.
Run it on its own to see what the live product currently says:

    python3 scripts/demo_live_read.py
"""
import json
import re
import sys
import urllib.request

KNECT = "https://knect.usehaf.co.uk/"
PLNA = "https://plna.usehaf.co.uk/dashboard"
CLEVER = "https://clever.usehaf.co.uk/"
JOIN = "https://join.usehaf.co.uk/"

UA = {"User-Agent": "HAF-demo-build/1.0 (+usehaf.co.uk)"}


class ReadFailed(Exception):
    """A live read the page depends on did not come back — never draw a guess."""


def fetch(url, expect_at_least=4000):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=45) as r:
            body = r.read().decode("utf8", "replace")
    except Exception as e:
        raise ReadFailed("could not read %s — %s" % (url, e))
    if len(body) < expect_at_least:
        raise ReadFailed("%s came back %d bytes, too small to be the real page"
                         % (url, len(body)))
    return body


def unescape(s):
    return (s.replace("&amp;", "&").replace("&#39;", "'")
             .replace("&quot;", '"').replace("&nbsp;", " ").strip())


def _array_after(html, token):
    """The [...] that follows token, balanced."""
    i = html.find(token)
    if i < 0:
        raise ReadFailed("%s is not on the page any more" % token)
    s = html.index("[", i)
    d = 0
    for j in range(s, len(html)):
        if html[j] == "[":
            d += 1
        elif html[j] == "]":
            d -= 1
            if d == 0:
                return html[s:j + 1]
    raise ReadFailed("%s array never closes" % token)


def knect_nav(html=None):
    """[{id,l,g,need,tabs:[{id,l,need}]}] straight off the live KNECT sidebar."""
    html = html if html is not None else fetch(KNECT, 200000)
    arr = _array_after(html, "HAF_NAV_V1=")
    objs, d, cur = [], 0, ""
    for c in arr[1:-1]:
        if c == "{":
            d += 1
        if d > 0:
            cur += c
        if c == "}":
            d -= 1
            if d == 0:
                objs.append(cur)
                cur = ""
    out = []
    for o in objs:
        head = o[:o.find("tabs:")] if "tabs:" in o else o
        sid = re.search(r"id:'([^']+)'", head)
        sl = re.search(r"l:'([^']*)'", head)
        g = re.search(r"g:'([^']*)'", head)
        nd = re.search(r"need:'([^']+)'", head)
        if not sid:
            continue
        tabs = []
        if "tabs:" in o:
            for t in re.finditer(r"\{id:'([^']+)',\s*l:'([^']*)'([^}]*)\}", o[o.find("tabs:"):]):
                tn = re.search(r"need:'([^']+)'", t.group(3))
                tabs.append({"id": t.group(1), "l": unescape(t.group(2)),
                             "need": tn.group(1) if tn else None})
        out.append({"id": sid.group(1), "l": unescape(sl.group(1) if sl else ""),
                    "g": g.group(1) if g else "", "need": nd.group(1) if nd else None,
                    "tabs": tabs})
    if len(out) < 6:
        raise ReadFailed("the live sidebar read as only %d sections" % len(out))
    return out


def knect_tabs(nav=None):
    """tab id -> {label, need, section, section_need} for every live screen."""
    nav = nav if nav is not None else knect_nav()
    flat = {}
    for sec in nav:
        for t in sec["tabs"]:
            flat.setdefault(t["id"], {"label": t["l"], "need": t["need"],
                                      "section": sec["l"], "section_need": sec["need"]})
    return flat


def plna_bar(html=None):
    """The screens along the bottom of the live PLNA, in page order."""
    html = html if html is not None else fetch(PLNA, 100000)
    i = html.find('class="tab-bar"')
    if i < 0:
        raise ReadFailed("the PLNA bar is not on /dashboard any more")
    seg = html[i:i + 6000]
    seg = seg[:seg.find("</nav>") if "</nav>" in seg else len(seg)]
    out = []
    for m in re.finditer(r'<div class="tab-item[^"]*"[^>]*>([^<]+)</div>', seg):
        label = unescape(m.group(1))
        if label and label not in out:
            out.append(label)
    if len(out) < 6:
        raise ReadFailed("the PLNA bar read as only %d screens" % len(out))
    return out


def clever_stages(html=None):
    """['Account','Documents','Review','Access'] off Clever's own stepper."""
    html = html if html is not None else fetch(CLEVER, 8000)
    text = re.sub(r"<script.*?</script>", " ", html, flags=re.S)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(re.sub(r"\s+", " ", text))
    m = re.search(r"1\s+([A-Za-z]+)\s+2\s+([A-Za-z]+)\s+3\s+([A-Za-z]+)\s+4\s+([A-Za-z]+)", text)
    if not m:
        raise ReadFailed("Clever's four-stage stepper is not on the page any more")
    return [m.group(1), m.group(2), m.group(3), m.group(4)]


def clever_types(html=None):
    """The account types the live Clever page offers, in page order."""
    html = html if html is not None else fetch(CLEVER, 8000)
    out = []
    for m in re.finditer(r'<div class="at-name">([^<]+)</div>', html):
        out.append(unescape(m.group(1)))
    if not out:  # the markup moved — fall back to the known four by name
        for want in ("Owner Driver", "Fleet / Courier Company", "Find a Courier",
                     "Business Account"):
            if want in unescape(re.sub(r"<[^>]+>", " ", html)):
                out.append(want)
    if len(out) < 3:
        raise ReadFailed("could not read the Clever account types (%d found)" % len(out))
    seen, uniq = set(), []
    for t in out:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq


def join_fields(html=None):
    """The fields the live public sign-up form asks for, in page order."""
    html = html if html is not None else fetch(JOIN, 20000)
    out = []
    for m in re.finditer(r"<label[^>]*>(.*?)</label>", html, re.S):
        t = unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(1))))
        t = t.rstrip("*").strip()
        if t and len(t) < 46 and t not in out and "'+" not in t:
            out.append(t)
    if len(out) < 6:
        raise ReadFailed("the join page read as only %d fields" % len(out))
    return out


def everything():
    nav = knect_nav()
    return {
        "knect_sections": [{"id": s["id"], "l": s["l"], "need": s["need"]} for s in nav],
        "knect_tabs": knect_tabs(nav),
        "plna_bar": plna_bar(),
        "clever_stages": clever_stages(),
        "clever_types": clever_types(),
        "join_fields": join_fields(),
    }


if __name__ == "__main__":
    try:
        print(json.dumps(everything(), indent=2))
    except ReadFailed as e:
        print("READ FAILED: %s" % e, file=sys.stderr)
        raise SystemExit(1)
