/* Does the server price the job the way the screen does?

   The order screen shows a price. The server fixes it again before it takes a
   penny. The day those disagree, a customer is shown one price and charged a
   deposit against another — which is exactly what happened on 7 Sep, by £213
   on a long Luton job, because the server still held its own stale rate card.

   Both now go through the one engine. So this reads index.html — the real
   file, not a fixture — and does two things with it. It checks every rate,
   minimum, fee, floor, service factor and taper the page still SHOWS a
   customer against what the engine actually charges. Then it runs the page's
   own quoting code, lifted straight out of the file, against the server on a
   spread of real jobs and demands the same penny.

   Run:  node shared/order-quote.test.mjs                                     */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VANS, URGENCIES, REF_MPH, VAT_PCT, LOCAL_MAX_OFF, LOCAL_BAND_OFF,
  NETWORK_FEE_FLOOR_PCT, NETWORK_FEE_CEILING_PCT,
  LOCAL_BAND_AT, LOCAL_FULL_AT, MULT_CAP, DEPOSIT_PCT, DEPOSIT_MIN_PENCE,
  quoteOneOff, minTransportValue
} from './order-quote.js';

import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, '..', 'index.html'), 'utf8');

/* The one engine, loaded the same way the server loads it. */
const ENGINE = createRequire(import.meta.url)('../admin/pricing-matrix-v3.js');

function slice(from, to) {
  const i = APP.indexOf(from), j = APP.indexOf(to, i);
  if (i < 0 || j < 0) throw new Error('could not find the customer engine block: ' + from);
  return APP.slice(i, j);
}

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ' — ' + detail : ''}`);
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

/* ── 1. the vehicle rate card ─────────────────────────────────────────────── */
const vanBlock = APP.match(/const VAN=\{([\s\S]*?)\n\};/);
ok('index.html still declares const VAN', Boolean(vanBlock));
const pageVans = {};
if (vanBlock) {
  for (const line of vanBlock[1].split('\n')) {
    const m = line.match(/^\s*(\w+)\s*:\s*\{[^}]*drv:\s*([\d.]+)\s*,\s*min:\s*([\d.]+)/);
    if (m) pageVans[m[1]] = { drv: Number(m[2]), min: Number(m[3]) };
  }
}
ok('every van on the screen is on the server',
  Object.keys(pageVans).length > 0 &&
  Object.keys(pageVans).every((k) => VANS[k]),
  'missing: ' + Object.keys(pageVans).filter((k) => !VANS[k]).join(', '));
ok('the server invents no van the screen does not have',
  Object.keys(VANS).every((k) => pageVans[k]),
  'extra: ' + Object.keys(VANS).filter((k) => !pageVans[k]).join(', '));
for (const [k, v] of Object.entries(pageVans)) {
  if (!VANS[k]) continue;
  ok(`${k} driver rate`, near(VANS[k].drv, v.drv), `screen ${v.drv} vs server ${VANS[k].drv}`);
  ok(`${k} minimum`, near(VANS[k].min, v.min), `screen ${v.min} vs server ${VANS[k].min}`);
}

/* ── 2. urgency fees, floors and service factors ──────────────────────────── */
const urgLine = APP.match(/const URG=\{(.*?)\};/);
ok('index.html still declares const URG', Boolean(urgLine));
const pageUrg = {};
if (urgLine) {
  const re = /(\w+):\{n:'[^']*',fee:([\d.]+),flr:([\d.]+),svc:([\d.]+)\}/g;
  let m;
  while ((m = re.exec(urgLine[1]))) {
    pageUrg[m[1]] = { fee: Number(m[2]), flr: Number(m[3]), svc: Number(m[4]) };
  }
}
ok('every urgency on the screen is on the server',
  Object.keys(pageUrg).length > 0 && Object.keys(pageUrg).every((k) => URGENCIES[k]),
  'missing: ' + Object.keys(pageUrg).filter((k) => !URGENCIES[k]).join(', '));
for (const [k, u] of Object.entries(pageUrg)) {
  if (!URGENCIES[k]) continue;
  ok(`${k} fee`, near(URGENCIES[k].fee, u.fee), `screen ${u.fee} vs server ${URGENCIES[k].fee}`);
  ok(`${k} floor`, near(URGENCIES[k].flr, u.flr), `screen ${u.flr} vs server ${URGENCIES[k].flr}`);
  ok(`${k} service factor`, near(URGENCIES[k].svc, u.svc), `screen ${u.svc} vs server ${URGENCIES[k].svc}`);
}

/* ── 3. the loose constants ───────────────────────────────────────────────── */
const refM = APP.match(/const REF_MPH=(\d+)/);
ok('reference speed', refM && Number(refM[1]) === REF_MPH,
  refM ? `screen ${refM[1]} vs server ${REF_MPH}` : 'REF_MPH not found');

const vatM = APP.match(/let HAF_VAT=([\d.]+)/);
ok('VAT rate', vatM && near(Number(vatM[1]) * 100, VAT_PCT),
  vatM ? `screen ${Number(vatM[1]) * 100}% vs server ${VAT_PCT}%` : 'HAF_VAT not found');

const taper = APP.match(
  /let LOCAL_MAX_OFF=([\d.]+),\s*LOCAL_BAND_OFF=([\d.]+),\s*LOCAL_BAND_AT=(\d+),\s*LOCAL_FULL_AT=(\d+)/);
ok('local taper found', Boolean(taper));
if (taper) {
  ok('local max reduction', near(Number(taper[1]), LOCAL_MAX_OFF));
  ok('local band reduction', near(Number(taper[2]), LOCAL_BAND_OFF));
  ok('local band starts at', Number(taper[3]) === LOCAL_BAND_AT);
  ok('full minimum from', Number(taper[4]) === LOCAL_FULL_AT);
}

ok('multiplier cap', near(ENGINE.config.hindrance.maxAutoMultiplier, MULT_CAP),
  `engine ${ENGINE.config.hindrance.maxAutoMultiplier} vs server ${MULT_CAP}`);

/* ── 4. the same arithmetic, on real jobs ─────────────────────────────────── */
/* This used to rebuild the page's arithmetic by hand from the numbers scraped
   above. That was the right check while the screen and the server were two
   separate copies of one rate card — but it also made this file a THIRD copy,
   and on 7 Sep all three had drifted apart.
   Since the collapse onto one engine, the honest check is the stronger one:
   run the REAL adapter out of index.html, the one the customer's browser
   executes, against the server, on the same job, and demand the same penny. */
const engineSrc =
  'var window = { HAFPricingMatrix: M };\n' +
  slice('const REF_MPH', 'const PC={') +
  '\nreturn { v3Price: v3Price };';
const SCREEN = new Function('M', engineSrc)(ENGINE);

/* No postcode, so the lane sits at its neutral band — exactly what the server
   asks for, because a stranger's request has no view of a lane. No account and
   no allocated driver, which is what a one-off customer is. */
function pagePrice(miles, mins, vanKey, urgKey) {
  return SCREEN.v3Price(miles, mins, vanKey, urgKey, null, {}).sub;
}

const JOBS = [
  { miles: 4.2, mins: 14, van: 'small', urg: 'flex' },     // very local, on the minimum
  { miles: 18, mins: 38, van: 'swb', urg: 'sday' },        // inside the taper band
  { miles: 42, mins: 63, van: 'lwb', urg: 'urg' },         // the everyday job
  { miles: 88, mins: 110, van: 'mwb', urg: 'timed' },
  { miles: 196, mins: 230, van: 'xlwb', urg: 'sday' },
  { miles: 310, mins: 360, van: 'luton', urg: 'urg' },
  { miles: 47, mins: 0, van: 'lutontl', urg: 'flex' },     // no drive time given
  { miles: 12, mins: 55, van: 'lutonc', urg: 'timed' }     // time worth more than distance
];
for (const j of JOBS) {
  const q = quoteOneOff({ miles: j.miles, minutes: j.mins, vehicleCode: j.van, jobTypeCode: j.urg });
  ok(`${j.van}/${j.urg} ${j.miles}mi priced`, Boolean(q));
  if (!q) continue;
  const expected = Math.round(pagePrice(j.miles, j.mins, j.van, j.urg) * 100);
  ok(`${j.van}/${j.urg} ${j.miles}mi matches the screen to the penny`,
    q.quote_ex_vat_pence === expected,
    `screen ${expected}p vs server ${q.quote_ex_vat_pence}p`);
  ok(`${j.van}/${j.urg} VAT`, q.vat_pence === Math.round(q.quote_ex_vat_pence * VAT_PCT / 100));
  ok(`${j.van}/${j.urg} total`, q.total_pence === q.quote_ex_vat_pence + q.vat_pence);
  ok(`${j.van}/${j.urg} deposit and balance add back to the total`,
    q.deposit_pence + q.balance_pence === q.total_pence);
  ok(`${j.van}/${j.urg} deposit never below the floor`, q.deposit_pence >= DEPOSIT_MIN_PENCE);
  ok(`${j.van}/${j.urg} deposit never above the job`, q.deposit_pence <= q.total_pence);
  const quarter = Math.round(q.total_pence * DEPOSIT_PCT / 100);
  ok(`${j.van}/${j.urg} deposit is a quarter, or the floor`,
    q.deposit_pence === Math.max(quarter, DEPOSIT_MIN_PENCE));
}

/* ── 4b. the band, on every job the server will ever quote ────────────────── */
/* Brent, 2026-09-07: "15% on all jobs is the bare minimum HAF should be leaving
   with on all jobs", then "i want HAF to make between 15% and 50%". A one-off
   order is the one route into the network with no account and no driver behind
   it, so it is the easiest place for a job to slip out of the band unnoticed. */
let outside = [];
for (const van of Object.keys(VANS)) {
  for (const urg of Object.keys(URGENCIES)) {
    for (const miles of [1, 3, 8, 14, 20, 26, 45, 90, 175, 320]) {
      for (const mins of [0, Math.round(miles * 1.5), Math.round(miles * 3)]) {
        const q = quoteOneOff({ miles, minutes: mins, vehicleCode: van, jobTypeCode: urg });
        if (!q) { outside.push(`${van}/${urg} ${miles}mi did not price`); continue; }
        if (q.network_fee_pct < NETWORK_FEE_FLOOR_PCT - 0.01 ||
            q.network_fee_pct > NETWORK_FEE_CEILING_PCT + 0.01)
          outside.push(`${van}/${urg} ${miles}mi/${mins}min = ${q.network_fee_pct}%`);
      }
    }
  }
}
ok(`HAF lands inside ${NETWORK_FEE_FLOOR_PCT}–${NETWORK_FEE_CEILING_PCT}% on every one-off quote`,
  outside.length === 0, outside.slice(0, 4).join('; '));

/* The time rule, which was silently dead for a day because the screen sent
   `driverMinutes` and the engine only read `minutes`. A slow lane must cost
   more than a fast one over the same distance. */
const fast = quoteOneOff({ miles: 40, minutes: 40, vehicleCode: 'lwb', jobTypeCode: 'sday' });
const slow = quoteOneOff({ miles: 40, minutes: 120, vehicleCode: 'lwb', jobTypeCode: 'sday' });
ok('a slow forty miles is not priced as a fast forty miles',
  slow.quote_ex_vat_pence > fast.quote_ex_vat_pence,
  `fast ${fast.quote_ex_vat_pence}p vs slow ${slow.quote_ex_vat_pence}p`);

/* ── 5. what must never become a price ────────────────────────────────────── */
ok('an unknown van is refused', quoteOneOff({ miles: 40, vehicleCode: 'artic', jobTypeCode: 'sday' }) === null);
ok('an unknown urgency is refused', quoteOneOff({ miles: 40, vehicleCode: 'lwb', jobTypeCode: 'yesterday' }) === null);
ok('zero miles is refused', quoteOneOff({ miles: 0, vehicleCode: 'lwb', jobTypeCode: 'sday' }) === null);
ok('a negative distance is refused', quoteOneOff({ miles: -10, vehicleCode: 'lwb', jobTypeCode: 'sday' }) === null);
ok('nonsense is refused', quoteOneOff({ miles: 'forty', vehicleCode: 'lwb', jobTypeCode: 'sday' }) === null);
ok('no HGV on the rate card', !VANS.hgv && !VANS.artic && !VANS.flatbed);

/* ── result ───────────────────────────────────────────────────────────────── */
console.log(`${pass} checks passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log('  FAIL ' + f);
  process.exit(1);
}
