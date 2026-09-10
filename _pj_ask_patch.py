#!/usr/bin/env python3
"""Copy and paste, the other way round.

Brent, 10 Sep 2026: the paste box reads a job email in. This adds the half that
sends the questions out — a short email template of exactly what a driver cannot
arrive without, copied in one tap from the job tile, filled in by whoever wants
the delivery, and pasted straight back into the same box.

Every heading in the template is one the page's own reader already understands,
and the reader gets four small corrections so the round trip lands whole. The
same edits are applied to the working copies (_pj_block.js, _pj_ui.js, which the
node tests run against) and to the inline copies inside index.html, which is
what a visitor actually gets. A replacement that does not apply is a hard error
rather than a silent skip.
"""
import io, re, sys

PARSER = [
    # ── "Unloading" contains "loading" ────────────────────────────────────
    ("""    const side = /collect|pick|load/i.test(ln) ? 'c' : (/deliver|drop|unload/i.test(ln) ? 'd' : sides[i]);""",
     """    /* "Unloading" contains "loading", so the delivery words are read first
       and the collection test never sees them. A line naming both ends settles
       nothing and becomes a note for the driver, not a guessed site. */
    const noUn = ln.replace(/unload(?:ing)?/gi, ' ');
    const fD = /unload|deliver|drop|consignee|receiver/i.test(ln);
    const fC = /collect|pick|load|depot|sender|consignor/i.test(noUn);
    const side = (fC && !fD) ? 'c' : ((fD && !fC) ? 'd' : sides[i]);"""),

    # ── a count the sender labelled but did not name ──────────────────────
    ("""  const qm = raw.match(/\\b([0-9]{1,3})\\s*(?:x\\s*)?(pallets?|roll\\s?cages?|cages?|crates?|cartons?|boxes|box|bags?|sacks?|drums?|totes?|items?|pieces?|pcs?|furniture[a-z\\s]{0,10})\\b/i);
  if (qm) {""",
     """  let qm = raw.match(/\\b([0-9]{1,3})\\s*(?:x\\s*)?(pallets?|roll\\s?cages?|cages?|crates?|cartons?|boxes|box|bags?|sacks?|drums?|totes?|items?|pieces?|pcs?|furniture[a-z\\s]{0,10})\\b/i);
  /* A count the sender labelled but did not name — "How many: 3" off our own
     template. Read as loose items, which is what the review list then shows
     them, so a pallet count written that way is corrected by the customer
     rather than assumed by us. */
  if (!qm) {
    const lq = raw.match(/^[ \\t]*how\\s+many[^:\\n]{0,24}[:\\-][ \\t]*([0-9]{1,3})[ \\t]*$/im);
    if (lq) qm = [lq[0], lq[1], 'items'];
  }
  if (qm) {"""),

    # ── a weight the sender labelled but left the unit off ────────────────
    ("""  const wm = raw.match(/(?:^|[^a-z0-9.])([0-9]{1,4}(?:\\.[0-9]+)?)\\s*(kgs?|kilos?|kilograms?|tonnes?|tons?|te|t)(?![a-z])/i);
  if (wm) {""",
     """  let wm = raw.match(/(?:^|[^a-z0-9.])([0-9]{1,4}(?:\\.[0-9]+)?)\\s*(kgs?|kilos?|kilograms?|tonnes?|tons?|te|t)(?![a-z])/i);
  /* A weight the sender labelled and left the unit off — "Total weight: 300".
     Kilos, because kilos is what the label asked for. */
  if (!wm) {
    const lw = raw.match(/^[ \\t]*(?:total\\s+weight|gross\\s+weight|weight)[^:\\n]{0,18}[:\\-][ \\t]*([0-9]{1,5}(?:\\.[0-9]+)?)[ \\t]*$/im);
    if (lw) wm = [lw[0], lw[1], 'kg'];
  }
  if (wm) {"""),

    # ── a label may carry its own hint in brackets ────────────────────────
    ("""    const m = lines[i].match(/^\\s*(?:goods|load|consignment|description|items?|what)\\s*[:\\-]\\s*(.+)$/i);""",
     """    const m = lines[i].match(/^\\s*(?:goods|load|consignment|description|items?|what)(?:\\s*\\([^)\\n]{0,40}\\))?\\s*[:\\-]\\s*(.+)$/i);"""),

    ("""    const m = ln.match(/^\\s*(?:notes?|instructions?|access|please note|nb)\\s*[:\\-]\\s*(.+)$/i);""",
     """    const m = ln.match(/^\\s*(?:notes?|instructions?|access|please note|nb)(?:\\s*\\([^)\\n]{0,40}\\))?\\s*[:\\-]\\s*(.+)$/i);"""),

    # ── the person asking, named on their own line ────────────────────────
    ("""    nm = raw.match(/\\b(?:kind regards|many thanks|best regards|regards|thanks|cheers|best wishes|yours)\\b[,!.\\t ]*\\n+[ \\t]*([A-Z][a-z'\u2019\\-]+(?:[ \\t]+[A-Z][a-z'\u2019\\-]+){0,2})/i);
    if (nm) r.reqName = nm[1].trim();
  }
  return r;""",
     """    nm = raw.match(/\\b(?:kind regards|many thanks|best regards|regards|thanks|cheers|best wishes|yours)\\b[,!.\\t ]*\\n+[ \\t]*([A-Z][a-z'\u2019\\-]+(?:[ \\t]+[A-Z][a-z'\u2019\\-]+){0,2})/i);
    if (nm) r.reqName = nm[1].trim();
  }
  /* Or written on its own line, which is how our template asks for it. */
  if (!r.reqName) {
    nm = raw.match(/^[ \\t]*(?:your name|requested by|raised by|ordered by|booked by)[ \\t]*[:\\-][ \\t]*([A-Za-z][A-Za-z'\u2019\\-]{1,}(?:[ \\t]+[A-Za-z'\u2019\\-]{2,}){0,2})[ \\t]*$/im);
    if (nm) r.reqName = nm[1].trim();
  }
  return r;"""),
]

# ── THE TEMPLATE, AND THE TWO BUTTONS THAT HAND IT OVER ────────────────────
ASK_BLOCK = r"""
/* ── WHAT WE NEED, AS AN EMAIL THEY CAN SEND ────────────────────────────
   The other half of the paste box. Someone who has not been sent the details
   yet copies this, emails it to whoever wants the delivery, and pastes the
   reply back into the box above — so the round trip finishes where it started.

   Two rules held it to this length. Every heading is one the reader on this
   page already understands, so a returned template reads itself in with no
   retyping. And nothing is asked for that a driver could manage without: this
   is the list you cannot arrive at a door without, not a form. */
const PJ_ASK = [
  'Subject: Delivery request',
  '',
  'Hello,',
  '',
  'So we can price this and book it in, please fill in what you can under each',
  'heading and send it back. Full addresses with postcodes, and a mobile at',
  'each end, are the two we cannot manage without.',
  '',
  'COLLECTION',
  'Address:',
  'Contact:',
  'Mobile:',
  'Ready from:',
  'Anything needed to load it:',
  '',
  'DELIVERY',
  'Address:',
  'Contact:',
  'Mobile:',
  'Deliver before:',
  'Anything needed to unload it:',
  '',
  'THE LOAD',
  'Goods:',
  'How many and of what:',
  'Total weight:',
  'Largest item:',
  '',
  'YOU',
  'Your name:',
  'Your email:',
  'Notes:',
  '',
  'Thank you.'
].join('\n');

/* Show it on the page. Forced open when the clipboard has refused us, because
   a button that appears to do nothing is worse than no button. */
function pjSee(s, force) {
  const p = _pjE('pj-ask-p-' + s);
  if (!p) return;
  const shut = p.style.display === 'none';
  if (shut || force) { p.textContent = PJ_ASK; p.style.display = 'block'; }
  else p.style.display = 'none';
}

function pjCopy(s) {
  const btn = _pjE('pj-cp-' + s);
  const said = ok => {
    if (!ok) pjSee(s, true);
    if (!btn) return;
    const was = btn.getAttribute('data-w') || btn.textContent;
    btn.setAttribute('data-w', was);
    btn.textContent = ok ? 'Copied \u2014 paste it into your email' : 'Copy it from below';
    setTimeout(() => { btn.textContent = was; }, 2600);
  };
  /* The clipboard is refused outright on some phones and inside some in-app
     browsers, so a refusal puts the text on the page to be selected by hand
     instead of failing quietly. */
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(PJ_ASK).then(() => said(true), () => said(false));
      return;
    }
  } catch (e) { }
  try {
    const ta = document.createElement('textarea');
    ta.value = PJ_ASK;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-2000px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, PJ_ASK.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    said(!!ok);
  } catch (e) { said(false); }
}
"""

ASK_ROW = (
    """    + '<span class="pj-open-x">&#8594;</span></button>'
""",
    """    + '<span class="pj-open-x">&#8594;</span></button>'
    + '<div class="pj-ask"><span class="pj-ask-t"><strong>Waiting on the details?</strong> '
    + 'Copy the short list of what a driver needs, email it to whoever wants the delivery, '
    + 'then paste their reply straight back in above.</span>'
    + '<span class="pj-ask-r">'
    + '<button class="btn btn-or btn-sm" type="button" id="pj-cp-' + s + '" onclick="pjCopy(\\'' + s + '\\')">Copy what we need</button>'
    + '<button class="btn btn-gh btn-sm" type="button" onclick="pjSee(\\'' + s + '\\')">See it first</button>'
    + '</span><pre class="pj-ask-p" id="pj-ask-p-' + s + '" style="display:none"></pre></div>'
""")

# Anchor the new block just above the mount, in both copies.
ASK_ANCHOR = ("""function pjMount() {""", ASK_BLOCK.strip() + "\n\nfunction pjMount() {")


CSS_OLD = """.pj-body{border:1px solid var(--ln);border-radius:var(--rs);background:var(--p2);padding:.9rem .95rem;margin-top:.55rem}"""
CSS_NEW = """.pj-ask{margin-top:.5rem;padding:.6rem .7rem;border:1px dashed var(--ln);border-radius:var(--rs);
  display:flex;flex-direction:column;gap:.5rem;background:var(--p2)}
.pj-ask-t{font-size:.72rem;color:var(--mu);line-height:1.5}
.pj-ask-t strong{color:var(--tx)}
.pj-ask-r{display:flex;gap:.4rem;flex-wrap:wrap}
.pj-ask-p{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.68rem;
  line-height:1.55;color:var(--tx);background:var(--bg);border:1px solid var(--ln);border-radius:var(--rs);
  padding:.65rem .75rem;margin:0;max-height:16rem;overflow:auto}
.pj-body{border:1px solid var(--ln);border-radius:var(--rs);background:var(--p2);padding:.9rem .95rem;margin-top:.55rem}"""


def patch(path, pairs, label):
    with io.open(path, encoding='utf-8') as f:
        src = f.read()
    done = 0
    for old, new in pairs:
        if old not in src:
            print('MISS  %-16s %s' % (label, old.strip().split('\n')[0][:78]))
            continue
        src = src.replace(old, new, 1)
        done += 1
    with io.open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    print('%-16s %d of %d applied' % (label, done, len(pairs)))
    return done, len(pairs)


ok = 0
want = 0
for f, pairs in (
    ('_pj_block.js', PARSER),
    ('index.html', PARSER),
    ('_pj_ui.js', [ASK_ROW, ASK_ANCHOR]),
    ('index.html', [ASK_ROW, ASK_ANCHOR, (CSS_OLD, CSS_NEW)]),
):
    d, w = patch(f, pairs, f)
    ok += d
    want += w

print('\n%d of %d replacements applied' % (ok, want))
sys.exit(0 if ok == want else 1)
