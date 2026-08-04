#!/usr/bin/env python3
"""Slice the quote engine out of index.html into a module the server can import.

The customer's browser works out the price of a job. That number cannot be
trusted with money — anyone can change it before it is sent. So the server
re-prices every job before a payment is raised, and it has to reach the SAME
answer, or a perfectly honest customer gets told their quote is wrong.

Keeping a second copy of the maths by hand guarantees the two drift apart.
Instead the page stays the single source and this lifts the block between the
PRICING-CORE markers, verbatim, into functions/_pricing-core.js.

Run it after any change to the pricing block, before deploying:
    python3 tools/build_pricing_core.py
"""

import re
import sys

SRC = 'index.html'
OUT = 'functions/_pricing-core.js'
EXPORTS = ['VAN', 'URG', 'DRV_LEVEL', 'ACC_LEVEL', 'DRV_REWARD', 'REF_MPH',
           'NET_POOL', 'laneAdjust', 'minTransportValue', 'v3Price',
           'hafApplyPricingConfig']

HEADER = """/* GENERATED FILE — DO NOT EDIT BY HAND.
   Sliced from index.html between the PRICING-CORE markers by
   tools/build_pricing_core.py. Edit the page, then re-run the script.
   This is what re-prices a job server-side before any payment is raised. */

/* The page reaches for `window`; a worker has no such thing. Pointing it at the
   global object means the sliced code runs unaltered, and the lane factors the
   worker imports land exactly where the quote engine looks for them. */
const window = globalThis;

"""


def main():
    html = open(SRC, encoding='utf-8').read()
    kept, keeping = [], False
    for line in html.split('\n'):
        if 'PRICING-CORE:START' in line or 'PRICING-CORE:RESUME' in line:
            keeping = True
            continue
        if 'PRICING-CORE:PAUSE' in line or 'PRICING-CORE:END' in line:
            keeping = False
            continue
        if keeping:
            kept.append(line)

    if len(kept) < 200:
        sys.exit('markers found only %d lines — check them before deploying' % len(kept))

    body = '\n'.join(kept)
    # `window` is shimmed above and is fine. The page itself is not: anything
    # that reads or writes the document cannot run in a worker.
    if re.search(r'\bdocument\s*\.', body):
        sys.exit('the sliced block touches the page (document.) — it cannot '
                 'run on the server; put a PAUSE/RESUME pair around it')

    # Declared as `function NAME(` or as a name in a const/let/var list.
    missing = [n for n in EXPORTS
               if not re.search(r'(function\s+%s\s*\(|[\s,]%s\s*=)' % (n, n), body)]
    if missing:
        sys.exit('sliced block is missing: %s' % ', '.join(missing))

    open(OUT, 'w', encoding='utf-8').write(
        HEADER + body.rstrip() + '\n\nexport { ' + ', '.join(EXPORTS) + ' };\n')
    print('%s written — %d lines' % (OUT, len(kept)))
    build_lane_factors()


LANE_SRC = 'admin/lane-factors-v1.js'
LANE_OUT = 'functions/_lane-factors.js'


def build_lane_factors():
    """Make the lane rules importable by a worker.

    The page loads them as a plain script that hangs itself off the global
    object. Guessing which global a worker will pick is how the server ends up
    pricing a lane differently from the page, so it is handed a plain object of
    its own and asked to put them there.
    """
    src = open(LANE_SRC, encoding='utf-8').read()
    open(LANE_OUT, 'w', encoding='utf-8').write(
        '/* GENERATED FILE — DO NOT EDIT BY HAND. Wrapped from %s by\n'
        '   tools/build_pricing_core.py so the worker prices a lane exactly as\n'
        '   the page does. */\n\n'
        'export function loadLaneFactors() {\n'
        '  const module = undefined;   // not CommonJS here\n'
        '  const self = {};            // the script attaches itself to this\n'
        '%s\n'
        '  return self.HAFLaneFactors;\n'
        '}\n' % (LANE_SRC, src))
    print('%s written' % LANE_OUT)


if __name__ == '__main__':
    main()
