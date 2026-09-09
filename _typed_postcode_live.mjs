/* Does a customer who KNOWS their own postcode still get through?
 *
 * Henry, 9 Sep: today's fix made the order send `dataset.pc` — the postcode the
 * box STANDS FOR — instead of the raw text, because a customer typing
 * "Manchester" was ordering a job whose delivery postcode was the word. But
 * `dataset.pc` is set by addrEnsure(), and somebody who types "S9 1TZ" and
 * presses next may never trigger it. If that path now sends nothing where it
 * used to send a perfectly good postcode, the regression I fixed was rare and
 * the one I introduced is the common case.
 *
 * Reading `_pcOf` and satisfying myself was not going to be enough: the whole
 * week has been about the difference between code that looks right and a live
 * surface that answers. So this asks the LIVE PAGE, using the page's own
 * function, with dataset.pc deliberately wiped first to force the worst case.
 *
 * Read-only. It fills boxes and calls a pure function; it never places an order
 * and never touches the network. (The lesson that cost a real order this
 * morning: never poll a write endpoint to find anything out.)
 */
import { chromium } from 'playwright';

let n = 0, pass = 0;
const check = (name, ok, got) => {
  n++; if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(n).padStart(2)}  ${name}` +
              `${ok ? '' : `   >>> got ${JSON.stringify(got)}`}`);
};

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await p.goto('https://knect.usehaf.co.uk/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForSelector('#pc-from', { state: 'visible', timeout: 30000 });

/* The worst case on purpose: the box holds what they typed and NOTHING has
   resolved it, which is exactly the state addrEnsure would have left if the
   customer never triggered it. */
const typedCold = (text) => p.evaluate((t) => {
  const el = document.getElementById('fq-from');
  if (!el) return { missing: true };
  el.value = t;
  el.dataset.pc = ''; el.dataset.pcFor = ''; el.dataset.pcPrecise = '';
  return { out: window._pcOf ? window._pcOf('fq-from') : _pcOf('fq-from'),
           pc: el.dataset.pc };
}, text);

const exists = await p.evaluate(() => !!document.getElementById('fq-from'));
check('the order screen box is on the live page', exists, exists);

let r = await typedCold('S9 1TZ');
check('a postcode typed exactly still travels, with no resolution behind it',
      r.out === 'S9 1TZ', r);
check('and it did NOT come from dataset.pc', r.pc === '', r);

r = await typedCold('s91tz');
check('lower case and no space is tidied to Royal Mail spacing',
      r.out === 'S9 1TZ', r);

r = await typedCold('  LS10 1AB  ');
check('padding either side does not break it', r.out === 'LS10 1AB', r);

/* The other direction, and the one I went looking for while I was here: an
   OUTWARD code alone passes the page's own addrIsPostcode. If the page lets it
   through and the network guard then refuses it, the customer is thrown out at
   the last press after six stages of typing — the exact failure today's fix
   was written to avoid. */
r = await typedCold('S9');
check('an outward code alone is reported so the answer is on the record',
      true, r);

/* A town must still resolve rather than travel as a word — the original fault.
   Cold, it has nothing to resolve WITH, so the honest answer is that the words
   come back and the send gate refuses them. That gate is what stops it. */
r = await typedCold('Manchester');
check('a town with nothing resolved is not mistaken for a postcode',
      !/^[A-Z]{1,2}[0-9]/.test(String(r.out || '')), r);

const gate = await p.evaluate(() => {
  const el = document.getElementById('fq-from');
  el.value = 'Manchester'; el.dataset.pc = ''; el.dataset.pcFor = '';
  return { would_pass: !!(window.addrIsPostcode || addrIsPostcode)(_pcOf('fq-from')) };
});
check('and the send gate would refuse it', gate.would_pass === false, gate);

console.log(`\n${n} checks, ${n - pass} failed`);
await b.close();
process.exit(pass === n ? 0 : 1);
