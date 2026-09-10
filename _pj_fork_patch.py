#!/usr/bin/env python3
"""A forklift belongs to a clause, not to a line.

One line often names both ends — "forklift at collection, no forklift at
delivery so tail lift needed" — so reading the line whole has to pick one and
gets the other wrong. Each clause is now read on its own, a clause that denies a
forklift is not a request for one, and "unloading" stops being read as
"loading". A clause that settles nothing still passes through as a note for the
driver rather than being guessed onto the wrong site.
"""
import io, sys

OLD = """    /* "Unloading" contains "loading", so the delivery words are read first
       and the collection test never sees them. A line naming both ends settles
       nothing and becomes a note for the driver, not a guessed site. */
    const noUn = ln.replace(/unload(?:ing)?/gi, ' ');
    const fD = /unload|deliver|drop|consignee|receiver/i.test(ln);
    const fC = /collect|pick|load|depot|sender|consignor/i.test(noUn);
    const side = (fC && !fD) ? 'c' : ((fD && !fC) ? 'd' : sides[i]);
    if (side === 'c' && r.reqs.indexOf('forkc') < 0) r.reqs.push('forkc');
    else if (side === 'd' && r.reqs.indexOf('forkd') < 0) r.reqs.push('forkd');
    else r.notes.push(ln.trim());"""

NEW = """    /* One line often names both ends, so each clause is read on its own.
       A clause that denies a forklift is not a request for one, and
       "unloading" is a delivery word, never a loading one, even though it
       contains "loading". A clause that settles nothing passes through as a
       note for the driver rather than a guessed site. */
    ln.split(/[,;]|\\band\\b|\\bso\\b|\\bbut\\b/i).forEach(cl => {
      if (!/fork[\\s\\-]?lift|fork truck/i.test(cl)) return;
      if (/\\b(?:no|not|without|none|non)\\b/i.test(cl)) return;
      const noUn = cl.replace(/unload(?:ing)?/gi, ' ');
      const fD = /unload|deliver|drop|consignee|receiver/i.test(cl);
      const fC = /collect|pick|load|depot|sender|consignor/i.test(noUn);
      const side = (fC && !fD) ? 'c' : ((fD && !fC) ? 'd' : sides[i]);
      if (side === 'c' && r.reqs.indexOf('forkc') < 0) r.reqs.push('forkc');
      else if (side === 'd' && r.reqs.indexOf('forkd') < 0) r.reqs.push('forkd');
      else if (!side) r.notes.push(ln.trim());
    });"""

ok = 0
for path in ('_pj_block.js', 'index.html'):
    src = io.open(path, encoding='utf-8').read()
    if OLD not in src:
        print('MISS %s' % path)
        continue
    io.open(path, 'w', encoding='utf-8').write(src.replace(OLD, NEW, 1))
    print('ok   %s' % path)
    ok += 1
sys.exit(0 if ok == 2 else 1)
