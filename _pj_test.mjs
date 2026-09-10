/* Does the reader read a real job email, and does it refuse to invent?
   Six genuinely different ways a job arrives. Run: node _pj_test.mjs */
import { createRequire } from 'module';
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

/* ── 1 · THE LABELLED EMAIL — how a transport desk writes one ── */
console.log('\n1 · labelled email');
let r = pjParse(`Hi,

Please can you quote and book the following.

Collection: Unit 4 Callum Park, Attercliffe, Sheffield S9 1AA
Contact: John Wright 07700 900123

Delivery: 22 Trafford Way, Manchester M1 1AA
Contact: Sarah Ellis 07700 900456

Goods: 3 pallets of boxed clothing
Weight: 300kg
Tail lift required at delivery, non-stackable
Collection Friday from 9am, must be on site before 4pm

Kind regards,
Michael Barnes
michael.barnes@northgatesupplies.co.uk`, B, NOW);
ck('from', r.from, 'S9 1AA');
ck('to', r.to, 'M1 1AA');
ck('cAddr', r.cAddr, 'Unit 4 Callum Park, Attercliffe, Sheffield S9 1AA');
ck('dAddr', r.dAddr, '22 Trafford Way, Manchester M1 1AA');
ck('cName', r.cName, 'John Wright');
ck('dName', r.dName, 'Sarah Ellis');
ck('cPhone', r.cPhone, '07700 900123');
ck('dPhone', r.dPhone, '07700 900456');
ck('qty', r.qty, 3);
ck('unit', r.unit, 'pallets');
ck('kg', r.kg, 300);
ck('wtKey', r.wtKey, 'w500');
ck('szKey', r.szKey, 's4');
ck('reqs has tail', r.reqs.includes('tail'), true);
ck('reqs has nostack', r.reqs.includes('nostack'), true);
ck('reqs no stack', r.reqs.includes('stack'), false);
ck('cdate = the coming Friday', r.cdate, '2026-09-11');
ck('ctime', r.ctime, '09:00');
ck('dreq mentions 4pm', /4pm/.test(r.dreq || ''), true);
ck('reqName', r.reqName, 'Michael Barnes');
ck('reqEmail', r.reqEmail, 'michael.barnes@northgatesupplies.co.uk');
ck('nothing missing', r.missing, []);

/* ── 2 · THE PROSE EMAIL — one paragraph, no labels ── */
console.log('\n2 · prose email');
r = pjParse(`Morning — we need 12 boxes of stock picked up from our warehouse at
14 Bessemer Road, Sheffield S9 2LR and delivered to the shop at 8 King Street,
Leeds LS1 2HL. About 90kg all in. Fragile, please. Ask for Dave Holt on
07811 222333 at the warehouse, the shop is Priya Shah 07811 444555.
Needs to be there by 2pm tomorrow. Thanks, Ellie`, B, NOW);
ck('from', r.from, 'S9 2LR');
ck('to', r.to, 'LS1 2HL');
ck('cAddr has street', /Bessemer/.test(r.cAddr || ''), true);
ck('dAddr has street', /King Street/.test(r.dAddr || ''), true);
ck('qty', r.qty, 12);
ck('unit', r.unit, 'boxes');
ck('kg', r.kg, 90);
ck('wtKey', r.wtKey, 'w100');
ck('szKey', r.szKey, 's3');
ck('fragile', r.reqs.includes('fragile'), true);
ck('date is tomorrow', r.cdate, '2026-09-11');
ck('dreq mentions 2pm', /2pm/.test(r.dreq || ''), true);

/* ── 3 · THE FORWARD — headers, quoting, a signature block ── */
console.log('\n3 · forwarded email with headers');
r = pjParse(`---------- Forwarded message ----------
From: Angela Reed <angela@reedandsons.co.uk>
To: transport@reedandsons.co.uk
Subject: Collection Monday

Collect from:
Reed & Sons Yard
Bawtry Road
Doncaster DN4 8AA
Site contact Terry Nash 07900 111222

Deliver to:
Halton Trade Park
Unit 9
Runcorn WA7 1AA
Ask for Kim Fletcher 07900 333444

2 crates, 1.2m x 1m x 1.5m, 450 kg, forklift at collection, no forklift at delivery so tail lift needed
Please collect Monday at 07:30

Many thanks
Angela`, B, NOW);
ck('from', r.from, 'DN4 8AA');
ck('to', r.to, 'WA7 1AA');
ck('cAddr built from lines above', r.cAddr, 'Reed & Sons Yard, Bawtry Road, Doncaster DN4 8AA');
ck('dAddr built from lines above', r.dAddr, 'Halton Trade Park, Unit 9, Runcorn WA7 1AA');
ck('cName', r.cName, 'Terry Nash');
ck('dName', r.dName, 'Kim Fletcher');
ck('qty', r.qty, 2);
ck('unit', r.unit, 'crates');
ck('kg', r.kg, 450);
ck('dims read', r.dims, { l: '1.2', w: '1', h: '1.5', unit: 'm' });
ck('dims did NOT become a date', r.cdate, '2026-09-14');
ck('forkc', r.reqs.includes('forkc'), true);
ck('tail', r.reqs.includes('tail'), true);
ck('ctime', r.ctime, '07:30');

/* ── 4 · THE SCRIBBLE — a WhatsApp message pasted in ── */
console.log('\n4 · a scribbled message');
r = pjParse(`can u do 1 pallet from S60 1BA to NG1 5FS today, 250kg, 2 man lift, ring me on 07123 456789`, B, NOW);
ck('from', r.from, 'S60 1BA');
ck('to', r.to, 'NG1 5FS');
ck('qty', r.qty, 1);
ck('kg', r.kg, 250);
ck('wtKey', r.wtKey, 'w250');
ck('szKey', r.szKey, 's3');
ck('two-person lift', r.reqs.includes('two'), true);
ck('date today', r.cdate, '2026-09-10');
ck('no full collection address invented', r.cAddr, '');
ck('missing names the address', r.missing.includes('the full collection address'), true);

/* ── 5 · THE THIN ONE — two postcodes and nothing else ── */
console.log('\n5 · almost nothing pasted');
r = pjParse(`Quote please S9 1AA to M1 1AA`, B, NOW);
ck('from', r.from, 'S9 1AA');
ck('to', r.to, 'M1 1AA');
ck('no address invented', [r.cAddr, r.dAddr], ['', '']);
ck('no name invented', [r.cName, r.dName], ['', '']);
ck('no phone invented', [r.cPhone, r.dPhone], ['', '']);
ck('no weight invented', r.kg, undefined);
ck('no qty invented', r.qty, undefined);
ck('no goods invented', r.goods, undefined);
ck('no date invented', r.cdate, undefined);
ck('missing lists the weight', r.missing.includes('how heavy it is'), true);
ck('missing lists when', r.missing.includes('when it needs moving'), true);

/* ── 6 · NOT A JOB AT ALL ── */
console.log('\n6 · text with no job in it');
r = pjParse(`Thanks for the invoice, all paid. Speak next week.`, B, NOW);
ck('no from', r.from, undefined);
ck('no to', r.to, undefined);
ck('missing names both postcodes', r.missing.slice(0, 2), ['the collection postcode', 'the delivery postcode']);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
