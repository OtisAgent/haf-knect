#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# HAF KNECT DEMO CENTRE — built from the LIVE app, every single deploy.
#
# THE PROBLEM THIS KILLS.
# demo/index.html used to be a 798KB COPY of the live app, made once by
# scripts/build_public_demo.py and then left to rot. By 10 Sep it had silently
# fallen behind by three features. A copy of a moving product is always a lie
# waiting to happen.
#
# THE FIX.
# There is no copy any more. This script takes ../index.html — the actual live
# app, whatever it says today — and repoints it at the demo database. The Demo
# Centre CANNOT fall behind, because it is rebuilt from the live source on
# every deploy of the branch it serves.
#
# Brent's directive says ENVIRONMENT = SANDBOX / DEMO / PRODUCTION on ONE
# codebase. This is that, and it is the whole trick: one source, three
# databases, a flag.
#
# Cloudflare Pages runs this with root_dir = demo, so `..` is the repo root
# and the build output is whatever is left in this directory afterwards.
#
# Required env vars on the Pages project (NOT in git):
#   DEMO_DB_URL  — the demo database URL
#   DEMO_DB_KEY  — the demo database anon key
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

LIVE_REF="ggkpqqrtxtlafdkxcaqg"   # the live driving/account database

echo "── HAF DEMO build ──"

# ── 1. Refuse to build without a demo database ─────────────────────────
# A demo that quietly falls back to live is the single worst outcome here:
# a stranger on a live stream would be pressing buttons on the real network.
# So there is no fallback. Missing config fails the deploy.
if [ -z "${DEMO_DB_URL:-}" ] || [ -z "${DEMO_DB_KEY:-}" ]; then
  echo "REFUSING TO BUILD: DEMO_DB_URL / DEMO_DB_KEY are not set."
  echo "Without them this build would ship the LIVE database to a public demo."
  exit 1
fi
case "$DEMO_DB_URL" in
  *"$LIVE_REF"*)
    echo "REFUSING TO BUILD: DEMO_DB_URL points at the LIVE database."
    exit 1 ;;
esac

# ── 2. Take the live app, fresh ────────────────────────────────────────
cp ../index.html            index.html
cp ../haf-account-label.js  haf-account-label.js
cp ../uk-regions.js         uk-regions.js
cp ../haf-bridge.css        haf-bridge.css

mkdir -p admin brand job track
# Only the six engine files the PUBLIC page actually loads. The rest of
# admin/ is the back office and has no business on a public demo.
for f in account-fees-v1 lane-factors-v1 pricing-matrix-v3 \
         pro-crown tier-identity-v1 tier-marks-v1; do
  cp "../admin/$f.js" "admin/$f.js"
done
cp -R ../brand/.      brand/
cp ../job/index.html  job/index.html
cp ../track/index.html track/index.html

# ── 2b. the SERVER half ────────────────────────────────────────────────
# Found by walking the built demo on 11 Sep: sign-in worked and the Order
# button was dead, every /api call answering 405. KNECT is two halves. The page
# reads the driving database directly with the anon key, but ordering, pricing
# and payments go through Pages Functions, which hold the service keys the
# browser must never see. Copying only the page ships half a product.
#
# Pages builds this project with root_dir = demo, so it looks for functions in
# demo/functions — the repo-root ones are not deployed here. They are copied in
# rather than symlinked because a symlink out of the build root does not
# survive the upload.
cp -R ../functions functions
cp -R ../shared    shared

# The one endpoint the live product must never have: it settles a payment
# without a payment. It lives here, in the demo directory, and is grafted into
# the copied server half — so no deploy of the real app can carry it.
mkdir -p functions/api/demo
cp settle-function.js functions/api/demo/settle.js

echo "copied: app $(wc -c < index.html) bytes, 6 engine files, brand, job, track, server half"

# ── 3. Point the whole app at the demo database ────────────────────────
# The entire app reaches its database through exactly two constants. Matching
# on the declaration rather than on the literal value means this keeps working
# when the live key is rotated — a build that hardcodes today's key is a build
# that breaks silently on the day somebody does the right thing.
sed -i "s#const PLNA_URL='[^']*'#const PLNA_URL='${DEMO_DB_URL}'#" index.html
sed -i "s#const PLNA_KEY='[^']*'#const PLNA_KEY='${DEMO_DB_KEY}'#" index.html

# The server half holds its OWN copy of those two, and this one matters more
# than the page's: it is what the worker checks a sign-in against. Left alone,
# a demo account would be tested against the LIVE account list, be found not to
# exist, and every order on camera would be refused — while the live database
# quietly answered questions from a public demo.
sed -i "s#^export const PLNA_URL = '[^']*';#export const PLNA_URL = '${DEMO_DB_URL}';#" shared/payments-core.js
sed -i "s#^export const PLNA_KEY = '[^']*';#export const PLNA_KEY = '${DEMO_DB_KEY}';#" shared/payments-core.js

# ── 4. Prove it, then refuse if it did not take ────────────────────────
# "The sed ran" and "the live database is gone" are two different sentences.
if grep -rq "$LIVE_REF" index.html admin brand job track functions shared 2>/dev/null; then
  echo "REFUSING TO SHIP: a live database reference survived the swap:"
  grep -rl "$LIVE_REF" index.html admin brand job track functions shared 2>/dev/null
  exit 1
fi
if ! grep -q "const PLNA_URL='${DEMO_DB_URL}'" index.html; then
  echo "REFUSING TO SHIP: the demo database URL is not in the built page."
  exit 1
fi
if ! grep -q "export const PLNA_URL = '${DEMO_DB_URL}';" shared/payments-core.js; then
  echo "REFUSING TO SHIP: the server half is not pointed at the demo database."
  exit 1
fi
echo "verified: 0 live database references, demo database is wired into both halves"

# ── 5. Demo mode: the banner and the payment explainer ─────────────────
# Injected as a separate file rather than patched into the app, on purpose.
# Anything that edits app internals by position breaks the next time the live
# app changes — and the whole point of this build is that the live app changes.
#
# THE LAST </body>, NOT EVERY </body>. This was a real fault, caught by
# walking the built page in a browser on 11 Sep.
#
# The app contains TWO of them: the document's own, and one inside a
# JavaScript template literal that builds a printable window with
# w.document.write(`<html>…</body></html>`). `sed s#…#…#` substitutes once
# PER LINE, so it hit both — and the copy inside the template literal closed
# the surrounding <script> early. The page threw "Unexpected end of input"
# and the remaining JavaScript rendered on screen as text.
#
# So: replace the LAST occurrence only, and then insist that exactly one
# attachment exists. A grep for "is it there" would have passed on the
# broken build — it was there twice, and that was the bug.
python3 - <<'PY'
src = open('index.html', encoding='utf-8').read()
i = src.rfind('</body>')
if i < 0:
    raise SystemExit('REFUSING TO SHIP: no </body> to attach demo mode to.')
src = src[:i] + '<script src="/demo-mode.js"></script>' + src[i:]
open('index.html', 'w', encoding='utf-8').write(src)
PY
n=$(grep -c 'demo-mode.js' index.html || true)
if [ "$n" != "1" ]; then
  echo "REFUSING TO SHIP: demo mode attached $n times, expected exactly 1."
  exit 1
fi
echo "demo mode attached once, at the document's own </body>"

# ── 6. Say what it is, everywhere a person might look ──────────────────
sed -i 's#<title>[^<]*</title>#<title>HAF KNECT DEMO — a safe copy, not the live network</title>#' index.html

echo "── built OK: $(wc -c < index.html) bytes ──"
