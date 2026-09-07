/* FRAMEWORK-V6 — eyes-on the real page, desktop and phone.
   Proves the lane module actually loads in the browser (not just in Node), that
   the quote engine uses it, and that Brent's two Sheffield runs price
   differently on the page a customer sees.

     node tools/lane-quote-browser.test.mjs            (local files)
     BASE=https://... node tools/lane-quote-browser.test.mjs   (a deployed URL)
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8801;
let base = process.env.BASE || `http://127.0.0.1:${PORT}`;
let srv = null;

if (!process.env.BASE) {
  srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const f = ROOT + (u.pathname === '/' ? '/index.html' : u.pathname);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
    const t = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html';
    res.writeHead(200, { 'Content-Type': t });
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => srv.listen(PORT, r));
}

const b = await chromium.launch({
  executablePath: '/agent/home/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  args: ['--no-sandbox']
});

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  — ' + d : '')); } };

for (const [label, w, h] of [['desktop', 1440, 900], ['phone', 390, 844]]) {
  console.log(`\n── ${label} (${w}x${h}) ──`);
  const page = await b.newPage({ viewport: { width: w, height: h } });
  const consoleErrs = [];
  page.on('pageerror', e => consoleErrs.push(String(e)));
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  ok('the page loads with no script errors', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));

  const laneLoaded = await page.evaluate(() => !!(window.HAFLaneFactors && window.HAFLaneFactors.laneFactor));
  ok('the lane engine is loaded in the browser', laneLoaded);

  const v = await page.evaluate(() => window.HAFLaneFactors && window.HAFLaneFactors.version);
  ok('it reports LANE-V1', v === 'LANE-V1', String(v));

  /* With no learned evidence the page must price exactly as it always has. */
  const untouched = await page.evaluate(() => {
    const q = v3Price(100, 150, 'lwb', 'sday', 'M1 1AA', { account: 'lite', fromPc: 'S1 2HH' });
    return { factor: q.lane.factor, basis: q.lane.basis, sub: q.sub, carrier: q.carrier };
  });
  ok('with no job history the lane adjustment is 1.00 — nothing moves today',
     untouched.factor === 1, JSON.stringify(untouched));

  /* Now feed it the two Sheffield lanes and check they diverge on the page. */
  const sheffield = await page.evaluate(() => {
    window.HAFLaneFactors.reset();
    window.HAFLaneFactors.learn([
      { from: 'S', to: 'M', jobs: 60, avgMiles: 42, avgMinutes: 75, returnsWithinWindow: 45, driverDaysOffered: 25 },
      { from: 'S', to: 'B', jobs: 60, avgMiles: 78, avgMinutes: 95, returnsWithinWindow: 42, driverDaysOffered: 55 }
    ]);
    const sm = v3Price(42, 75, 'lwb', 'sday', 'M1 1AA', { account: 'lite', fromPc: 'S1 2HH' });
    const sb = v3Price(78, 95, 'lwb', 'sday', 'B1 1AA', { account: 'lite', fromPc: 'S1 2HH' });
    window.HAFLaneFactors.reset();
    return {
      smFactor: sm.lane.factor, sbFactor: sb.lane.factor,
      smPerMile: sm.carrier / 42, sbPerMile: sb.carrier / 78,
      smKeeps: (sm.fee / sm.sub) * 100, sbKeeps: (sb.fee / sb.sub) * 100
    };
  });
  ok('Sheffield→Manchester and Sheffield→Birmingham get different lane factors',
     sheffield.smFactor !== sheffield.sbFactor,
     `${sheffield.smFactor} vs ${sheffield.sbFactor}`);
  ok('the slower cross-Pennine lane pays the driver more per mile',
     sheffield.smPerMile > sheffield.sbPerMile,
     `£${sheffield.smPerMile.toFixed(2)}/mi vs £${sheffield.sbPerMile.toFixed(2)}/mi`);
  /* FRAMEWORK-V8: what HAF keeps depends on the rung of the driver who takes
     the job, so the thing to prove about a LANE is that it does not move that
     share at all — the lane pays the driver, not HAF. Same share on both lanes,
     whatever that share is. */
  ok('the lane pays the driver, not HAF — the same share on both lanes',
     Math.abs(sheffield.smKeeps - sheffield.sbKeeps) < 0.05,
     `${sheffield.smKeeps.toFixed(2)}% / ${sheffield.sbKeeps.toFixed(2)}%`);

  /* FRAMEWORK-V7, read off the live page: which driver takes the job must not
     move the customer's price. Checked on the deployed bytes, not the source,
     because that is the only copy customers ever see. */
  const v7 = await page.evaluate(() => {
    const on = typeof DRV_REWARD !== 'undefined' ? DRV_REWARD.on : null;
    const fundedBy = typeof DRV_REWARD !== 'undefined' ? DRV_REWARD.fundedBy : null;
    const out = { on, fundedBy, moved: 0, checked: 0, tiers: {} };
    ['free', 'member', 'pro'].forEach(d => {
      const q = v3Price(100, 150, 'lwb', 'sday', 'M1 1AA', { account: 'lite', fromPc: 'S1 2HH', driver: d });
      out.tiers[d] = { sub: q.sub, driverPay: q.driverPay, reward: q.rewardGbp };
    });
    ['small', 'lwb', 'lutontl'].forEach(v => {
      [5, 60, 200].forEach(mi => {
        ['sday', 'urg'].forEach(u => {
          const f = v3Price(mi, mi / 40 * 60, v, u, 'M1 1AA', { account: 'lite', driver: 'free' });
          const p = v3Price(mi, mi / 40 * 60, v, u, 'M1 1AA', { account: 'lite', driver: 'pro' });
          if (Math.abs(f.sub - p.sub) > 0.01) out.moved++;
          out.checked++;
        });
      });
    });
    return out;
  });
  ok('the live page has the driver reward running', v7.on === true, String(v7.on));
  ok('...and funds it from HAF, not the customer, when it runs',
     v7.fundedBy === 'HAF', String(v7.fundedBy));
  ok('a free, a member and a pro driver all quote the same price',
     v7.tiers.free.sub === v7.tiers.member.sub && v7.tiers.free.sub === v7.tiers.pro.sub,
     JSON.stringify(v7.tiers));
  /* FRAMEWORK-V8, Brent 2026-09-07: 0 / 5 / 10% over the base rate by plan,
     paid out of HAF's share. Read off the deployed page, because that is the
     only copy a driver ever sees. */
  ok('...and each is paid their own rung, 5% and 10% over the free rate',
     Math.abs(v7.tiers.member.driverPay - v7.tiers.free.driverPay * 1.05) < 0.02 &&
     Math.abs(v7.tiers.pro.driverPay - v7.tiers.free.driverPay * 1.10) < 0.02,
     JSON.stringify(v7.tiers));
  ok('...with HAF, not the customer, funding the difference',
     v7.tiers.pro.reward > 0 && v7.tiers.free.sub === v7.tiers.pro.sub,
     JSON.stringify(v7.tiers));
  ok(`across ${v7.checked} live quotes a Pro driver never costs the customer more`,
     v7.moved === 0, v7.moved + ' failures');

  /* Brent's bands, read off the live page rather than the source. */
  const bands = await page.evaluate(() => {
    const out = {};
    for (const [job, label] of [['sday', 'same-day'], ['timed', 'timed'], ['urg', 'urgent'], ['flex', 'flexible']]) {
      const free = v3Price(100, 150, 'lwb', job, 'M1 1AA', { account: 'lite' });
      const pro = v3Price(100, 150, 'lwb', job, 'M1 1AA', { account: 'pro' });
      out[label] = { free: (free.fee / free.sub) * 100, pro: (pro.fee / pro.sub) * 100,
                     driverFree: free.carrier, driverPro: pro.carrier };
    }
    return out;
  });
  const freeVals = Object.values(bands).map(x => x.free);
  const proVals = Object.values(bands).map(x => x.pro);
  /* Brent replaced the split free/paid bands on 2026-09-07 with one band for
     everything: "i want HAF to make between 15% and 50%". Read off the live
     page, on every job type, both account rungs. */
  ok('every quote on the live page keeps between 15% and 50%',
     freeVals.concat(proVals).every(x => x >= 14.99 && x <= 50.01),
     JSON.stringify(freeVals.concat(proVals).map(x => x.toFixed(1))));
  ok('no account ever drops HAF below the 15% floor',
     proVals.every(x => x >= 14.99), JSON.stringify(proVals.map(x => x.toFixed(1))));
  ok('an account discount never comes off the driver',
     Object.values(bands).every(x => Math.abs(x.driverFree - x.driverPro) < 0.005));

  /* No sideways scroll beyond the shell's known pre-existing overflow. */
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('the page does not scroll sideways beyond the known shell overflow',
     overflow <= 60, `${overflow}px`);

  await page.screenshot({ path: `${ROOT}/_v6_${label}.png`, fullPage: false });
  await page.close();
}

await b.close();
if (srv) srv.close();
console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ` — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
