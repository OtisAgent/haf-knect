/* THE TEMPLATE HAS TO ROUND-TRIP.
   The tile hands a customer a list of questions to email out. If the reply
   comes back and our own reader cannot read our own template, the whole idea
   is a retyping job with extra steps. So: the real template text is pulled out
   of the shipped source (never a copy pasted into this file), sent through the
   real reader, and every field is checked.

   The other half of it matters just as much — an UNFILLED template must invent
   nothing. Run: node _pj_ask_test.mjs */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { pjParse } = require('./_pj_block.js');

const WT_BAND = [
  { k: 'w50', n: 'Up to 50 kg', kg: 50 }, { k: 'w100', n: 'Up to 100 kg', kg: 100 },
  { k: 'w250', n: 'Up to 250 kg', kg: 250 }, { k: 'w500', n: 'Up to 500 kg', kg: 500 },
  { k: 'w1000', n: '1 tonne +', kg: 1000 }
];
const SZ_BAND = [
  { k: 's1', n: 'Small box', lvl: 1 }, { k: 's2', n: 'A few boxes', lvl: 2 },
  { k: 's3', n: 'One pallet', lvl: 3 }, { k: 's4', n: 'A few pallets', lvl: 4 },
  { k: 's5', n: 'Full van load', lvl: 5 }
];
const B = { WT_BAND, SZ_BAND };
const NOW = new Date('2026-09-10T09:00:00Z');   /* a Thursday */

let pass = 0, fail = 0;
const ck = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('  FAIL ' + name + '  got ' + JSON.stringify(got) + '  want ' + JSON.stringify(want)); }
};

/* ── THE REAL TEMPLATE, OUT OF THE SHIPPED SOURCE ─────────────────────── */
function lift(path) {
  const src = readFileSync(path, 'utf8');
  const m = src.match(/const PJ_ASK = \[([\s\S]*?)\]\.join\('\\n'\);/);
  if (!m) throw new Error('no PJ_ASK in ' + path);
  return eval('[' + m[1] + ']').join('\n');
}
const ASK = lift('./_pj_ui.js');
const ASK_LIVE = lift('./index.html');

console.log('\n1 \u00b7 the two copies of the template');
ck('the page ships the same template as the source', ASK_LIVE, ASK);
ck('it is an email, not a form', /^Subject: /.test(ASK), true);

/* ── 2 · AN UNFILLED TEMPLATE INVENTS NOTHING ─────────────────────────── */
console.log('\n2 \u00b7 an unfilled template invents nothing');
let r = pjParse(ASK, B, NOW);
ck('no collection postcode', r.from, undefined);
ck('no delivery postcode', r.to, undefined);
ck('no name at collection', r.cName, '');
ck('no name at delivery', r.dName, '');
ck('no phone at collection', r.cPhone, '');
ck('no phone at delivery', r.dPhone, '');
ck('no goods', r.goods, undefined);
ck('no count', r.qty, undefined);
ck('no weight', r.kg, undefined);
ck('no dimensions', r.dims, undefined);
ck('no handling ticked', r.reqs, []);
ck('no collection date', r.cdate, undefined);
ck('no collection time', r.ctime, undefined);
ck('no deadline', r.dreq, undefined);
ck('no notes', r.notes, []);
ck('no requester name', r.reqName, undefined);
ck('no requester email', r.reqEmail, undefined);
/* Belt and braces on the wording itself: the headings carry no figure and no
   handling word, so there is nothing in a blank template to be misread. */
ck('the wording holds no digit', /[0-9]/.test(ASK), false);
ck('the wording names no handling kit', /tail[\s\-]?lift|fork|pallet|stack|fragile|two man/i.test(ASK), false);
ck('the wording holds no postcode', /\b[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/.test(ASK), false);

/* ── 3 · FILLED IN, EVERY FIELD LANDS ─────────────────────────────────── */
console.log('\n3 \u00b7 filled in and sent back');
const filled = ASK
  .replace('COLLECTION\nAddress:', 'COLLECTION\nAddress: Unit 4 Callum Park, Attercliffe Road, Sheffield S9 1AA')
  .replace('DELIVERY\nAddress:', 'DELIVERY\nAddress: 22 Trafford Way, Salford, Manchester M1 1AA')
  .replace('Contact:\nMobile:\nReady from:\nAnything needed to load it:',
    'Contact: John Wright\nMobile: 07700 900123\nReady from: Friday 12 September, from 9am\nAnything needed to load it: forklift on site')
  .replace('Contact:\nMobile:\nDeliver before:\nAnything needed to unload it:',
    'Contact: Sarah Ellis\nMobile: 07700 900456\nDeliver before: 4pm\nAnything needed to unload it: tail lift, no forklift here')
  .replace('Goods:', 'Goods: boxed clothing')
  .replace('How many and of what:', 'How many and of what: 3 pallets')
  .replace('Total weight:', 'Total weight: 300')
  .replace('Largest item:', 'Largest item: 1.2m x 1m x 1.5m')
  .replace('Your name:', 'Your name: Sarah Ellis')
  .replace('Your email:', 'Your email: sarah@trafford-supplies.co.uk')
  .replace('Notes:', 'Notes: gate code 4417, ring on arrival');

r = pjParse(filled, B, NOW);
ck('collection postcode', r.from, 'S9 1AA');
ck('delivery postcode', r.to, 'M1 1AA');
ck('collection address, label stripped', r.cAddr, 'Unit 4 Callum Park, Attercliffe Road, Sheffield S9 1AA');
ck('delivery address, label stripped', r.dAddr, '22 Trafford Way, Salford, Manchester M1 1AA');
ck('who to ask for at collection', r.cName, 'John Wright');
ck('mobile at collection', r.cPhone, '07700 900123');
ck('who receives it', r.dName, 'Sarah Ellis');
ck('mobile at delivery', r.dPhone, '07700 900456');
ck('goods in their own words', r.goods, 'boxed clothing');
ck('count', r.qty, 3);
ck('unit', r.unit, 'pallets');
ck('weight with the unit left off reads as kilos', r.kg, 300);
ck('weight band', r.wtKey, 'w500');
ck('room it takes', r.szKey, 's4');
ck('largest item', r.dims, { l: '1.2', w: '1', h: '1.5', unit: 'm' });
ck('forklift went to the collection end', r.reqs.includes('forkc'), true);
ck('and NOT to the delivery end, which said it has none', r.reqs.includes('forkd'), false);
ck('tail lift ticked', r.reqs.includes('tail'), true);
ck('collection date', r.cdate, '2026-09-12');
ck('collection time', r.ctime, '09:00');
ck('the deadline is the deadline, not the collection time', r.dreq, '4pm');
ck('notes for the driver', r.notes, ['gate code 4417, ring on arrival']);
ck('who is asking', r.reqName, 'Sarah Ellis');
ck('their email', r.reqEmail, 'sarah@trafford-supplies.co.uk');
ck('nothing left missing', r.missing, []);

/* ── 4 · HALF FILLED IN — SAY WHAT IS NOT THERE ───────────────────────── */
console.log('\n4 \u00b7 half filled in');
const half = ASK
  .replace('COLLECTION\nAddress:', 'COLLECTION\nAddress: Unit 4 Callum Park, Attercliffe Road, Sheffield S9 1AA')
  .replace('DELIVERY\nAddress:', 'DELIVERY\nAddress: 22 Trafford Way, Salford, Manchester M1 1AA')
  .replace('Goods:', 'Goods: boxed clothing');
r = pjParse(half, B, NOW);
ck('both places still read', [r.from, r.to], ['S9 1AA', 'M1 1AA']);
ck('goods still read', r.goods, 'boxed clothing');
ck('nothing invented for the weight', r.kg, undefined);
ck('nothing invented for the count', r.qty, undefined);
ck('no contact invented', [r.cName, r.dPhone], ['', '']);
ck('it names the missing weight', r.missing.includes('how heavy it is'), true);
ck('it names the missing count', r.missing.includes('how many items there are'), true);
ck('it names the missing collection contact', r.missing.includes('who the driver asks for at collection'), true);
ck('it names the missing delivery phone', r.missing.includes('a phone number at delivery'), true);
ck('it names the missing timing', r.missing.includes('when it needs moving'), true);

/* ── 5 · THE COUNT WRITTEN AS A BARE NUMBER ───────────────────────────── */
console.log('\n5 \u00b7 a bare count and a bare weight');
r = pjParse(ASK
  .replace('COLLECTION\nAddress:', 'COLLECTION\nAddress: Unit 4 Callum Park, Sheffield S9 1AA')
  .replace('DELIVERY\nAddress:', 'DELIVERY\nAddress: 22 Trafford Way, Manchester M1 1AA')
  .replace('How many and of what:', 'How many and of what: 3')
  .replace('Total weight:', 'Total weight: 90kg'), B, NOW);
ck('the count is read', r.qty, 3);
ck('and shown as loose items for the customer to correct', r.unit, 'items');
ck('the weight is read', r.kg, 90);

/* ── 6 · THE WHOLE THING TYPED BACK AS PROSE UNDERNEATH ───────────────── */
console.log('\n6 \u00b7 replied to underneath, not filled in');
r = pjParse(ASK + '\n\nEasier to just tell you: Unit 4 Callum Park, Sheffield S9 1AA to 22 Trafford Way, Manchester M1 1AA, 2 pallets 400kg, tail lift, Monday.', B, NOW);
ck('it still finds the collection', r.from, 'S9 1AA');
ck('it still finds the delivery', r.to, 'M1 1AA');
ck('it still finds the load', [r.qty, r.unit, r.kg], [2, 'pallets', 400]);
ck('it still finds the handling', r.reqs.includes('tail'), true);
ck('it still finds the day', r.cdate, '2026-09-14');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
