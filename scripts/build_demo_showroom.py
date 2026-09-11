#!/usr/bin/env python3
"""
Build the PUBLIC SHOWROOM at demo.usehaf.co.uk.

Brent, 11 Sep, asked to choose between keeping the old Demo Centre and starting
again: "Build a new lightweight showroom."

The thing this replaces was the live app with a door bolted on — scripts/
build_public_demo.py took index.html (798KB) and injected a gate. It drifted
anyway. This builds a page that keeps nothing of the app, so there is no second
copy of the product to maintain.

The one thing it must not do is invent a figure. So the level limits are READ
from the allowance book in the network database every build, and the page is
stamped with the date they were read. If the read fails the build fails; it
never falls back to a number typed in here.

Run:  python3 scripts/build_demo_showroom.py
Then: git push origin <branch>:<preview-branch>   (knect-demo-site builds it)
"""
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "demo-src" / "showroom.html"
OUT_DIR = ROOT / "demo"
OUT = OUT_DIR / "index.html"

# The brand files the showroom pulls in. Everything else that used to sit in
# demo/ belonged to the app copy and is not served any more.
KEEP = [
    "brand/haf-brand.css",
    "brand/haf-theme.js",
    "brand/haf-lockup.svg",
    "brand/haf-badge-compact.svg",
    "brand/fonts/montserrat-latin.woff2",
    "brand/fonts/montserrat-latin-ext.woff2",
]

# The levels a visitor can actually hold. GUEST is the not-signed-in state and
# is not something anyone chooses, so it is not a column on a price table.
LEVELS = ["FREE", "PLUS", "PRO"]

# The four allowances something in the product actually counts. The book holds
# seventeen; showing the other thirteen would present a plan as enforced when
# nothing enforces it.  Source: LV_KEYS in index.html, the `on:true` entries.
ROWS = [
    ("posts_per_day", "Jobs you can post a day", "n"),
    ("active_orders", "Jobs running at once", "n"),
    ("team_users", "Team logins", "n"),
    ("direct_send", "Send straight to a driver you pick", "b"),
]

ENV = ROOT.parent / "haf-driver-app" / ".env.local"


class ReadFailed(Exception):
    """A read the page depends on did not come back — never draw a guess."""


def dburl():
    if not ENV.exists():
        raise ReadFailed("no %s on this box — cannot read the allowance book" % ENV)
    m = re.search(r"postgresql://[^\s\"']+", ENV.read_text(encoding="utf8"))
    if not m:
        raise ReadFailed("no DATABASE_URL in %s" % ENV)
    return m.group(0)


def psql(sql):
    p = subprocess.run(["psql", dburl(), "-At", "-c", sql],
                       capture_output=True, text=True)
    if p.returncode != 0 or "ERROR:" in (p.stdout + p.stderr):
        raise ReadFailed("psql refused: %s" % (p.stderr.strip() or p.stdout.strip()))
    return p.stdout.strip()


def book():
    """level -> {label, price_pence, allowances} straight out of the database."""
    raw = psql("select coalesce(json_agg(row_to_json(t)),'[]'::json) from ("
               "select level,label,price_pence,allowances from public.haf_plan_level "
               "order by rank) t;")
    rows = json.loads(raw)
    if not rows:
        raise ReadFailed("the allowance book came back empty")
    out = {r["level"]: r for r in rows}
    missing = [L for L in LEVELS if L not in out]
    if missing:
        raise ReadFailed("the allowance book has no row for %s" % ", ".join(missing))
    return out


def read_on():
    """The date the database says it is, not the date this box thinks it is."""
    return psql("select to_char(current_date,'FMDD FMMonth YYYY');")


def price(pence):
    if not pence:
        return "Free"
    whole, rem = divmod(int(pence), 100)
    amount = "£%d" % whole if rem == 0 else "£%d.%02d" % (whole, rem)
    return "%s a month" % amount


def cell(value, kind):
    """null is unlimited — never 999, which is the number people then quote."""
    if kind == "b":
        if value is True:
            return '<td class="yes">Yes</td>'
        return '<td class="no">Not on this level</td>'
    if value is None:
        return '<td class="num unl">Unlimited</td>'
    return '<td class="num">%s</td>' % value


def main() -> int:
    if not SRC.exists():
        print("cannot find %s" % SRC, file=sys.stderr)
        return 1

    try:
        b = book()
        on = read_on()
    except ReadFailed as e:
        print("REFUSING TO BUILD: %s" % e, file=sys.stderr)
        print("The page would have to invent its figures. Fix the read first.",
              file=sys.stderr)
        return 1

    heads = ['<th>Limit</th>']
    for L in LEVELS:
        heads.append('<th class="lvl">%s<span class="price">%s</span></th>'
                     % (b[L]["label"], price(b[L]["price_pence"])))

    body = []
    for key, label, kind in ROWS:
        tds = "".join(cell(b[L]["allowances"].get(key), kind) for L in LEVELS)
        body.append("<tr><td>%s</td>%s</tr>" % (label, tds))

    html = SRC.read_text(encoding="utf8")
    for token, value in (("<!--LEVEL_HEADS-->", "".join(heads)),
                         ("<!--LEVEL_ROWS-->", "".join(body)),
                         ("<!--READ_ON-->", on)):
        if token not in html:
            print("placeholder %s is missing from the source" % token, file=sys.stderr)
            return 1
        html = html.replace(token, value)

    OUT_DIR.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf8")

    for rel in KEEP:
        src = OUT_DIR / rel
        if not src.exists():
            print("missing brand file %s" % rel, file=sys.stderr)
            return 1

    print("built %s  (%s bytes)" % (OUT.relative_to(ROOT), format(OUT.stat().st_size, ",")))
    print("levels read from the live book on %s:" % on)
    for L in LEVELS:
        a = b[L]["allowances"]
        print("  %-5s %-14s posts/day=%s  running=%s  logins=%s  direct=%s"
              % (L, price(b[L]["price_pence"]), a.get("posts_per_day"),
                 a.get("active_orders"), a.get("team_users"), a.get("direct_send")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
