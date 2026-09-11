#!/usr/bin/env bash
# THE FRONT DOOR BUILD — the old Demo Centre kept whole, made safe, given a way in.
#
# Brent, 11 Sep 2026: "the old copy with all the information and account
# comparison can you keep that and allow people then to enter the site like
# you've made it, given them the way it's built now doesnt really explain much".
#
# So this is the tour: the five Demo Centre screens that explain HAF KNECT —
# Free, Plus, Pro, the Account Pricing Comparison and the Mileage & Margin
# Simulator — untouched, plus a clear door into the playable KNECT where a
# person can actually drive it.
#
# WHAT IT CHANGES, AND WHY EACH ONE.
#
#  1. The app's database constants move to the DEMO database. This page is a
#     public front door with a real username-and-PIN box on it. Pointed at the
#     live database, that box is a login form for the real network sitting on a
#     page anybody can open. Pointed at the demo database it reaches five
#     invented accounts and nothing else.
#
#  2. The lead door stays on the LIVE database, explicitly. The email box that
#     hands out an access code is how HAF collects interest from this page, and
#     those rows feed the Mailchimp and Resend audiences. Moving it would send
#     every new enquiry into a database that gets truncated at 04:10. It is the
#     one thing on this page that SHOULD write to live, so it says so by name
#     instead of inheriting it.
#
#  3. demo-front.js is injected at the END, as a separate file. Anything that
#     edits a 798KB page by position breaks the next time the page changes.
#     THE LAST </body>, NOT THE FIRST — this file contains two, and the first
#     is inside a JavaScript template literal that builds a printable window.
#
# It refuses to write anything if a step did not take.
set -euo pipefail
cd "$(dirname "$0")"

LIVE_URL="https://ggkpqqrtxtlafdkxcaqg.supabase.co"
: "${DEMO_DB_URL:?DEMO_DB_URL is required}"
: "${DEMO_DB_KEY:?DEMO_DB_KEY is required}"

SRC=index.html
LIVE_KEY=$(sed -n "s/^const PLNA_KEY='\([^']*\)';$/\1/p" "$SRC" | head -1)
[ -n "$LIVE_KEY" ] || { echo "REFUSING: could not read the page's own key line"; exit 1; }

# ── 1 + 2. the two databases, each named for what it is ────────────────
python3 - "$SRC" "$LIVE_URL" "$LIVE_KEY" "$DEMO_DB_URL" "$DEMO_DB_KEY" <<'PY'
import sys, pathlib
src, live_url, live_key, demo_url, demo_key = sys.argv[1:6]
p = pathlib.Path(src); s = p.read_text()

old_url = "const PLNA_URL='%s';" % live_url
old_key = "const PLNA_KEY='%s';" % live_key
for needle in (old_url, old_key):
    if s.count(needle) != 1:
        sys.exit("REFUSING: expected exactly one %s..., found %d" % (needle[:22], s.count(needle)))

new = (
    "/* THE LEAD DOOR — deliberately the LIVE database, and deliberately named.\n"
    "   The email box on this page hands out an access code and records a real\n"
    "   person's interest. Those rows are HAF's enquiries: they feed the\n"
    "   Mailchimp and Resend audiences. The demo database is emptied every night\n"
    "   at 04:10, so an enquiry written there is an enquiry thrown away. This is\n"
    "   the ONE thing on this public page that should reach live, so it says so\n"
    "   by name rather than inheriting whatever PLNA_URL happens to be. */\n"
    "const HAF_LEADS_URL='%s';\n"
    "const HAF_LEADS_KEY='%s';\n"
    "/* Everything else on this page reaches the DEMO database. There is a real\n"
    "   username-and-PIN box below, on a page anybody can open. */\n"
    "const PLNA_URL='%s';\n"
    "const PLNA_KEY='%s';"
) % (live_url, live_key, demo_url, demo_key)

s = s.replace(old_url + "\n" + old_key, new, 1)

gate_old = "var URL_=PLNA_URL+'/rest/v1/rpc/', K=PLNA_KEY, KEY='haf_demo_code';"
gate_new = "var URL_=HAF_LEADS_URL+'/rest/v1/rpc/', K=HAF_LEADS_KEY, KEY='haf_demo_code';"
if s.count(gate_old) != 1:
    sys.exit("REFUSING: the lead door line is not where it was (%d matches)" % s.count(gate_old))
s = s.replace(gate_old, gate_new, 1)

# ── 3. the door into the playable demo, at the LAST </body> ───────────
tag = '<script src="demo-front.js?v=1"></script>\n</body>'
if s.count("demo-front.js") == 0:
    cut = s.rfind("</body>")
    if cut < 0:
        sys.exit("REFUSING: no </body> to inject before")
    s = s[:cut] + tag + s[cut + len("</body>"):]

p.write_text(s)
print("rewrote %s (%d bytes)" % (src, len(s)))
PY

# ── 3b. take the internal reasoning out of the served fee file ─────────
# The standing IP rule: nothing commercial ships readable. This page serves
# admin/account-fees-v1.js to anybody who asks for it, and two blocks in it are
# working notes rather than product — a recorded conflict between two sources
# and the open question it raised, naming who it was put to. Nothing in the app
# reads either block (checked), so they come out of the copy the public gets.
python3 - <<'PY'
import pathlib, re, sys
p = pathlib.Path('admin/account-fees-v1.js'); s = p.read_text(); before = s

s = re.sub(r"\n\s*sourceConflict:\s*\{[^}]*\},", "", s)
s = re.sub(r"\n\s*openDecisions:\s*\[[^\]]*\]", "", s)
# openDecisions was the last member of its object; the comma before it is now
# trailing something that no longer exists.
s = re.sub(r",(\s*\};\s*\n)", r"\1", s, count=0)

for leak in ("sourceConflict", "openDecisions", "askedOf"):
    if leak in s:
        sys.exit("REFUSING: %s survived the scrub" % leak)
if s == before:
    print("note: the fee file was already clean")
p.write_text(s)
print("scrubbed admin/account-fees-v1.js (%d -> %d bytes)" % (len(before), len(s)))
PY
node --check admin/account-fees-v1.js 2>/dev/null && echo "ok: the fee file still parses" \
  || { echo "REFUSING: the scrub broke the fee file"; exit 1; }

# ── 4. prove it, or refuse ─────────────────────────────────────────────
# "The edit ran" and "the page is safe" are two different sentences.
if grep -q "const PLNA_URL='${DEMO_DB_URL}';" "$SRC"; then
  echo "ok: the app reads the demo database"
else
  echo "REFUSING: the app is not pointed at the demo database"; exit 1
fi
if grep -q "const HAF_LEADS_URL='${LIVE_URL}';" "$SRC"; then
  echo "ok: the lead door still reaches live"
else
  echo "REFUSING: the lead door lost its live address"; exit 1
fi
# The live address may now appear ONLY on the lead-door lines. Anywhere else is
# a login box or a data read still pointed at the real network.
strays=$(grep -n "$LIVE_URL" "$SRC" | grep -vc "HAF_LEADS_URL" || true)
if [ "$strays" != "0" ]; then
  echo "REFUSING: $strays live-database reference(s) outside the lead door:"
  grep -n "$LIVE_URL" "$SRC" | grep -v "HAF_LEADS_URL" | cut -c1-120
  exit 1
fi
echo "ok: 0 live-database references outside the lead door"
grep -q 'demo-front.js' "$SRC" && echo "ok: the way in is wired" || { echo "REFUSING: demo-front.js not injected"; exit 1; }
