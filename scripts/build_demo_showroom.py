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

sys.path.insert(0, str(ROOT / "scripts"))
import demo_live_read as live  # noqa: E402  (same folder, read the live product)
import demo_pricing_read as pricing  # noqa: E402  (the live pricing matrix)

# ── the example job the comparison opens on ──────────────────────────────────
# A 50-mile same-day LWB run: the most ordinary job on the network, far enough
# out that the smallest charge is not what is setting the price, so the gap
# between the three account levels is the real gap rather than a rounding.
OPENS_ON = ("LWB_VAN", "STD_SAMEDAY", 50)

# ── what a level does NOT change ─────────────────────────────────────────────
# Stated before the table because a comparison table's blank cells read as
# features being withheld. The screen count is not typed here: it is the number
# of poster screens read off the live sidebar this build.
SAME_ON_EVERY_LEVEL = [
    "Post work to the network",
    "The live board",
    "Track a job on the map",
    "Deposits, invoices and receipts",
    "Saved addresses",
    "The calendar",
    "Raise a ticket and get a person",
]

# ── what may never reach a public page ───────────────────────────────────────
# The pricing matrix holds HAF's own commercials next to the customer's rates:
# what each job type earns, the fee floor and ceiling, the pool splits, what the
# driver is paid. A public page is a one-way door, so the build refuses to ship
# if any of it appears — by name or by the phrasing it travels under. Brent can
# have any of it added on his word; it will not arrive by accident.
NEVER_PUBLISH = [
    "marginPct", "floorPct", "hafMargin", "networkFee", "feeFloor", "feeCeiling",
    "minRetained", "driverPay", "carrierTransportValue", "relayStorage",
    "freightPool", "driverPool", "affiliate", "pctOfMargin", "feeBasis",
    "funded by HAF", "HAF margin", "what HAF keeps",
]

# ── the three guided walks ───────────────────────────────────────────────────
# Brent, 11 Sep: "the features of how to use the PLNA as a driver and the
# dashboard as a poster... confirm they're all aligned".
#
# The SENTENCE is written here. The SCREEN NAME never is: it is read off the live
# app and substituted in. So the demo cannot describe a screen the product does
# not have, and a renamed screen renames itself here on the next build.
#
# The build also refuses if the live app has a poster or driver screen that is
# not accounted for below. Silence is how a demo goes stale, so a new screen
# stops the build rather than quietly going unmentioned.

POSTER_WALK = [
    ("d-home", "What is running right now, what needs you today, and how much of your day's allowance is left."),
    ("b-book", "One screen for the whole job: both ends, the load, the vehicle and when it has to be there."),
    ("b-del", "Every job you have posted and where each one has got to, newest first."),
    ("livejob", "The job that is happening now, with the driver's progress on a map."),
    ("calendar", "Today, the week, the month. Your work on a grid instead of in a list."),
    ("b-saved", "The places you collect from and deliver to, typed once and reused after that."),
    ("billing", "The deposit, the invoice, and what is still outstanding on each job."),
    ("b-usage", "How much of your level you have used this month, and what you used it on."),
    ("membership", "A plain list of what this account can do, so nobody has to guess."),
    ("myplan", "Your level, what it costs and when it renews."),
    ("team", "Logins for your own people, so the work does not sit in one person's inbox."),
    ("forum", "Where members talk to each other and to us."),
    ("support", "Raise a ticket from any screen and a person answers it."),
    ("settings", "Your details, your PIN, and how you want to be contacted."),
]

DRIVER_WALK = [
    ("d-status", "Available or not. One switch that decides whether work is offered to you at all."),
    ("d-jobs", "The board: the jobs you are cleared for and close enough to take."),
    ("d-invites", "Work sent straight to you by name, rather than put out to everybody."),
    ("livejob", "The job you are on, with the collection code and the proof you have to capture at both ends."),
    ("d-empty", "The run home. Work going back the way you are already going."),
    ("d-earn", "What the completed work came to, and what is still to be paid."),
    ("d-comp", "Your documents, what is still missing, and what expires when."),
    ("__plna", "The door through to the driving app itself."),
]

# Screens that belong to other seats entirely — a fleet owner, a freight
# forwarder. Listed so the build knows they were left out on purpose.
OTHER_SEATS = {
    "fl-manage", "b-drivers", "b-fleet",
    "f-loads", "f-cover", "f-dir", "f-lanes", "f-account", "f-plans",
}

PLNA_WALK = {
    "Home": "Your day at a glance: the next job, your status, and anything that has to be done before you set off.",
    "Today": "The day's run in order, with the stops laid out and the route worked out for you.",
    "Bookings": "Work customers have booked with you directly, and the quotes still waiting on a reply.",
    "Exchange": "The network board inside PLNA: work you can take, and work you can hand on.",
    "Live job": "The job in progress, the map, the collection code, and the proof at both ends.",
    "Compliance": "Your documents and your van, with the reminders before anything expires.",
    "Calendar": "What you have already committed to, including time you have blocked out.",
    "Budget & Profit": "What the work earned, against what it cost you to do it.",
    "Payouts": "What you are owed and what has already been paid.",
    "Settings": "Your PIN, how you want to be paid and invoiced, and how customers reach you.",
    "Ask JACK": "The driver's own assistant, for the questions that come up mid-run.",
}

CLEVER_WALK = {
    "Account": "They open a HAF account first, at join.usehaf.co.uk. Name, email, mobile, date of birth, "
               "company if there is one, and a PIN. No payment and no documents at this point.",
    "Documents": "They sign in to Clever and send what proves who they are and that the van is legal.",
    "Review": "The HAF team checks the documents against the person and the vehicle. This is the part "
              "that protects everybody already on the network.",
    "Access": "Clever releases them by name, and only then does the driving side open. Until that "
              "moment the account still works perfectly well for posting work.",
}


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


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def walk_rows(pairs, tabs):
    """The numbered rows for one seat. The label comes off the live app."""
    missing = [i for i, _ in pairs if i not in tabs]
    if missing:
        raise ReadFailed("the live app has no screen called %s any more — the walk "
                         "names a screen that does not exist" % ", ".join(missing))
    out = []
    for tab_id, say in pairs:
        t = tabs[tab_id]
        where = t["section"]
        gated = '<div class="gate">Needs the Clever release</div>' if (
            t["need"] == "drive" or t["section_need"] in ("plna", "compliance")) else ""
        out.append('<li><div><div class="scr">%s<span class="where">%s</span></div>'
                   '<div class="say">%s</div>%s</div></li>'
                   % (esc(t["label"]), esc(where), esc(say), gated))
    return "".join(out)


def keyed_rows(order, sentences, what):
    """Rows for a list read off a live page, each needing a sentence here."""
    unknown = [k for k in order if k not in sentences]
    if unknown:
        raise ReadFailed("%s now has %s, which this build has nothing to say about"
                         % (what, ", ".join(unknown)))
    stale = [k for k in sentences if k not in order]
    if stale:
        raise ReadFailed("%s no longer has %s, but the build still describes it"
                         % (what, ", ".join(stale)))
    return "".join('<li><div><div class="scr">%s</div><div class="say">%s</div></div></li>'
                   % (esc(k), esc(sentences[k])) for k in order)


def chips(items):
    return "".join('<span class="chip">%s</span>' % esc(i) for i in items)


def quote_grid():
    """Run the LIVE pricing engine over every job on the picker.

    Not a reimplementation and not a lookup table typed by hand: this shells out
    to the engine file the customer quote itself loads, and the prices that come
    back are what go on the page. If node is missing or the engine throws, the
    build fails — a demo with no prices is better than a demo with invented ones.
    """
    p = subprocess.run(["node", str(ROOT / "scripts" / "quote_grid.mjs")],
                       capture_output=True, text=True, cwd=str(ROOT))
    if p.returncode != 0:
        raise ReadFailed("the pricing engine would not price the examples: %s"
                         % (p.stderr.strip() or p.stdout.strip()))
    try:
        g = json.loads(p.stdout)
    except Exception as e:
        raise ReadFailed("the pricing engine's answer was not readable — %s" % e)
    if not g.get("cells"):
        raise ReadFailed("the pricing engine priced nothing")
    return g


def miles_label(m):
    return "%d miles" % m


def options(pairs, chosen):
    return "".join('<option value="%s"%s>%s</option>'
                   % (esc(v), " selected" if v == chosen else "", esc(l))
                   for v, l in pairs)


def price_row(grid, levels):
    """The one row in the comparison that is not a limit — the job's price.

    Filled in here as well as by the picker, so the table reads correctly with
    JavaScript switched off and never shows a row of dashes on a screen share.
    """
    key = "%s|%s|%d" % OPENS_ON
    cell = grid["cells"].get(key)
    if not cell:
        raise ReadFailed("the engine did not price the example job (%s)" % key)
    full = cell[0]
    tds = []
    for i, _ in enumerate(levels):
        ex = cell[i]
        save = round(full - ex, 2)
        inc = round(ex * (1 + grid["vatPct"] / 100.0), 2)
        extra = ('<span class="off">£%.2f less a job</span>' % save if save > 0 else
                 '<span class="off" style="color:var(--haf-ink-faint)">£%.2f with VAT</span>' % inc)
        tds.append('<td class="price%s" id="pk-%s">£%.2f%s</td>'
                   % (" best" if i == len(levels) - 1 else "", levels[i], ex, extra))
    return ('<tr class="pricerow"><td>What this job costs'
            '<span class="sub">The same job, the same driver</span></td>%s</tr>'
            % "".join(tds))


def ladders(pm):
    """The vehicle and service ladders, and the named extras — all read live."""
    veh = "".join(
        "<tr><td>%s</td><td class=\"num\">%s</td><td class=\"num\">£%s</td></tr>"
        % (esc(v["name"]),
           "base" if float(v["rate"]) == 1 else "%g×" % float(v["rate"]),
           ("%g" % float(v["min"])))
        for v in pm["vehicles"])
    svc = "".join(
        "<tr><td>%s</td><td class=\"%s\">%s</td></tr>"
        % (esc(j["name"]),
           "num" if j["premium_pct"] else "no",
           ("+%d%%" % j["premium_pct"]) if j["premium_pct"] else "no premium")
        for j in pm["job_types"])
    e = pm["extras"]
    items = [
        ("Every extra stop", "%s each" % e["stop"]),
        ("Waiting beyond the time allowed", "%s an hour" % e["waiting"]),
        ("A heavy load for the van", "up to %d%% more" % e["weight_max_pct"]),
        ("Anything other than kerbside", "up to %d%% more" % e["handling_max_pct"]),
        ("All of those together", "capped at %d%% more" % e["cap_pct"]),
    ]
    tick = ('<svg width="13" height="13" viewBox="0 0 24 24" fill="none" '
            'stroke="var(--haf-orange)" stroke-width="2.6" stroke-linecap="round" '
            'stroke-linejoin="round"><path d="M5 12h14"/></svg>')
    extras = "".join("<li>%s<span>%s — <b>%s</b></span></li>" % (tick, esc(a), esc(b))
                     for a, b in items)
    return veh, svc, extras


def main() -> int:
    if not SRC.exists():
        print("cannot find %s" % SRC, file=sys.stderr)
        return 1

    try:
        b = book()
        on = read_on()

        # ── the live product, read now ───────────────────────────────────────
        nav = live.knect_nav()
        tabs = live.knect_tabs(nav)
        plna = live.plna_bar()
        stages = live.clever_stages()
        types = live.clever_types()
        fields = live.join_fields()

        covered = {i for i, _ in POSTER_WALK} | {i for i, _ in DRIVER_WALK} | OTHER_SEATS
        orphans = sorted(set(tabs) - covered)
        if orphans:
            raise ReadFailed("the live app has screens this demo says nothing about: %s. "
                             "Add them to POSTER_WALK, DRIVER_WALK or OTHER_SEATS — a demo "
                             "that silently omits a screen is how the last one went stale"
                             % ", ".join(orphans))

        poster_html = walk_rows(POSTER_WALK, tabs)
        driver_html = walk_rows(DRIVER_WALK, tabs)
        plna_html = keyed_rows(plna, PLNA_WALK, "the live PLNA bar")
        clever_html = keyed_rows(stages, CLEVER_WALK, "Clever's stepper")

        # ── the pricing matrix, read live, and the engine run over it ─────────
        pm = pricing.read()
        grid = quote_grid()
        if grid["version"] != pm["version"]:
            raise ReadFailed(
                "the engine priced these examples with %s but the live network is "
                "quoting %s" % (grid["version"], pm["version"]))
        if grid["vatPct"] != pm["vat_pct"]:
            raise ReadFailed("the engine charges VAT at %s%%, the live matrix says %s%%"
                             % (grid["vatPct"], pm["vat_pct"]))
        # Every vehicle and service level the live matrix offers has to be on the
        # picker. A vehicle the network prices but the demo cannot show is the
        # same staleness by a quieter route.
        live_veh = {v["name"] for v in pm["vehicles"]}
        grid_veh = {v["name"] for v in grid["vehicles"]}
        if live_veh != grid_veh:
            raise ReadFailed("the live matrix prices %s, the picker offers %s"
                             % (sorted(live_veh), sorted(grid_veh)))
        live_svc = {j["name"] for j in pm["job_types"]}
        grid_svc = {j["name"] for j in grid["jobTypes"]}
        if live_svc != grid_svc:
            raise ReadFailed("the live matrix offers services %s, the picker offers %s"
                             % (sorted(live_svc), sorted(grid_svc)))

        veh_ladder, svc_ladder, extras_list = ladders(pm)
        grid_out = dict(grid, levels=LEVELS)
        pk_veh = options([(v["code"], v["name"]) for v in grid["vehicles"]], OPENS_ON[0])
        pk_job = options([(j["code"], j["name"]) for j in grid["jobTypes"]], OPENS_ON[1])
        pk_mi = options([(str(m), miles_label(m)) for m in grid["miles"]], str(OPENS_ON[2]))
        price_html = price_row(grid, LEVELS)
    except (live.ReadFailed, pricing.ReadFailed) as e:
        print("REFUSING TO BUILD: %s" % e, file=sys.stderr)
        print("The demo would describe a product that is no longer there.", file=sys.stderr)
        return 1
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
                         ("<!--POSTER_WALK-->", poster_html),
                         ("<!--DRIVER_WALK-->", driver_html),
                         ("<!--PLNA_CHIPS-->", chips(plna)),
                         ("<!--PLNA_WALK-->", plna_html),
                         ("<!--CLEVER_WALK-->", clever_html),
                         ("<!--CLEVER_TYPES-->", chips(types)),
                         ("<!--JOIN_FIELDS-->", chips(fields)),
                         ("<!--SAME_CHIPS-->", chips(
                             ["All %d dashboard screens" % len(POSTER_WALK)]
                             + SAME_ON_EVERY_LEVEL)),
                         ("<!--PRICE_ROW-->", price_html),
                         ("<!--PK_VEHICLES-->", pk_veh),
                         ("<!--PK_JOBS-->", pk_job),
                         ("<!--PK_MILES-->", pk_mi),
                         ("<!--QUOTE_GRID-->", json.dumps(grid_out, separators=(",", ":"))),
                         ("<!--MATRIX_VERSION-->", esc(pm["version"])),
                         ("<!--MATRIX_FROM-->", esc(pm["effective_from"])),
                         ("<!--VAT_PCT-->", "%g" % pm["vat_pct"]),
                         ("<!--VEHICLE_LADDER-->", veh_ladder),
                         ("<!--SERVICE_LADDER-->", svc_ladder),
                         ("<!--EXTRAS_LIST-->", extras_list),
                         ("<!--LOCAL_BAND-->", "%g" % pm["local"]["band_miles"]),
                         ("<!--LOCAL_OFF-->", "%g" % pm["local"]["max_off_pct"]),
                         ("<!--LOCAL_FULL-->", "%g" % pm["local"]["full_from_miles"]),
                         ("<!--FUEL_TRIGGER-->", "%g" % pm["fuel"]["trigger_pct"]),
                         ("<!--FUEL_CAP-->", "%g" % pm["fuel"]["cap_pct"]),
                         ("<!--READ_ON-->", on)):
        if token not in html:
            print("placeholder %s is missing from the source" % token, file=sys.stderr)
            return 1
        html = html.replace(token, value)

    # ── the published page carries no working notes ───────────────────────────
    # The source is heavily commented on purpose — it is where the reasoning
    # lives. None of it belongs on a public address. On 11 Sep a pricing file
    # went out with a written internal view on self-employed drivers in it, so
    # every comment block is stripped on the way out and the build proves it.
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    html = re.sub(r"^[ \t]*/\*.*?\*/[ \t]*\n?", "", html, flags=re.S | re.M)
    html = re.sub(r"\n{3,}", "\n\n", html)
    leak = re.search(r"Brent|TODO|FIXME|internal", html, re.I)
    if leak:
        print("REFUSING TO BUILD: a working note survived into the page near %r"
              % html[max(0, leak.start() - 60):leak.start() + 60], file=sys.stderr)
        return 1

    # ── the business's own commercials are not a customer's ───────────────────
    # Checked on the finished page, not on the source, because the prices are
    # injected from the engine and the engine's answer carries HAF's side of the
    # job in the same object as the customer's.
    for word in NEVER_PUBLISH:
        hit = re.search(re.escape(word), html, re.I)
        if hit:
            print("REFUSING TO BUILD: %r reached the page near %r. That is HAF's own "
                  "commercials on a public address — a one-way door."
                  % (word, html[max(0, hit.start() - 70):hit.start() + 70]),
                  file=sys.stderr)
            return 1

    OUT_DIR.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf8")

    for rel in KEEP:
        src = OUT_DIR / rel
        if not src.exists():
            print("missing brand file %s" % rel, file=sys.stderr)
            return 1

    print("built %s  (%s bytes)" % (OUT.relative_to(ROOT), format(OUT.stat().st_size, ",")))
    print("read from the live product just now:")
    print("  KNECT   %d screens in the sidebar, %d on the poster walk, %d on the driver walk"
          % (len(tabs), len(POSTER_WALK), len(DRIVER_WALK)))
    print("  PLNA    %d screens on the driver's bar: %s" % (len(plna), ", ".join(plna)))
    print("  Clever  %d stages: %s" % (len(stages), " → ".join(stages)))
    print("  Clever  %d account types: %s" % (len(types), ", ".join(types)))
    print("  Join    %d fields on the real sign-up form" % len(fields))
    print("  Pricing %s, in force since %s — the live network and this build agree"
          % (pm["version"], pm["effective_from"]))
    print("  Pricing %d example jobs priced by the real engine (%d vehicles x %d "
          "services x %d distances), each at %d account levels"
          % (len(grid["cells"]), len(grid["vehicles"]), len(grid["jobTypes"]),
             len(grid["miles"]), len(LEVELS)))
    opens = grid["cells"]["%s|%s|%d" % OPENS_ON]
    print("  Pricing opens on %s / %s / %d miles: %s"
          % (OPENS_ON[0], OPENS_ON[1], OPENS_ON[2],
             ", ".join("%s £%.2f" % (L, opens[i]) for i, L in enumerate(LEVELS))))
    print("levels read from the live book on %s:" % on)
    for L in LEVELS:
        a = b[L]["allowances"]
        print("  %-5s %-14s posts/day=%s  running=%s  logins=%s  direct=%s"
              % (L, price(b[L]["price_pence"]), a.get("posts_per_day"),
                 a.get("active_orders"), a.get("team_users"), a.get("direct_send")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
