#!/usr/bin/env python3
"""Put the copy row under the paste box, because the row says "above".

The row tells the customer to paste the reply back in above it. It was drawn
before the paste box, so the box opened underneath and the sentence pointed at
nothing. The row now comes last: shut, it sits directly under the opener, and
open, the box really is above it.
"""
import io, sys

ROW = """    + '<div class="pj-ask"><span class="pj-ask-t"><strong>Waiting on the details?</strong> '
    + 'Copy the short list of what a driver needs, email it to whoever wants the delivery, '
    + 'then paste their reply straight back in above.</span>'
    + '<span class="pj-ask-r">'
    + '<button class="btn btn-or btn-sm" type="button" id="pj-cp-' + s + '" onclick="pjCopy(\\'' + s + '\\')">Copy what we need</button>'
    + '<button class="btn btn-gh btn-sm" type="button" onclick="pjSee(\\'' + s + '\\')">See it first</button>'
    + '</span><pre class="pj-ask-p" id="pj-ask-p-' + s + '" style="display:none"></pre></div>'
"""

END = """    + '</div></div></div>';
}
"""

ok = 0
for path in ('_pj_ui.js', 'index.html'):
    src = io.open(path, encoding='utf-8').read()
    if ROW not in src or END not in src:
        print('MISS %s' % path)
        continue
    src = src.replace(ROW, '', 1)
    src = src.replace(END, END.replace("""    + '</div></div></div>';""",
                                       ROW.rstrip('\n') + """
    + '</div></div>';"""), 1)
    io.open(path, 'w', encoding='utf-8').write(src)
    print('ok   %s' % path)
    ok += 1
sys.exit(0 if ok == 2 else 1)
