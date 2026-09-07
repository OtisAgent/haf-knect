/* Eyes-on the LIVE site — knect.usehaf.co.uk, desktop and phone.
   Proves what a customer actually sees: all three Luton bodies pickable and
   selectable, the saved framework (not the built-in fallback) driving the
   quote, and the retired "uplift" wording gone. */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const URL = 'https://knect.usehaf.co.uk/';
/* The pinned browser build moves whenever this box is rebuilt, so take the
   first one actually on disk instead of a version number that goes stale. */
const CHROME = [
  '/agent/home/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  '/agent/home/.cache/ms-playwright/chromium-1140/chrome-linux/chrome',
].find(existsSync);
if (!CHROME) { console.error('no browser on this box — the eyes-on check cannot run'); process.exit(2); }
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (c ? '' : '  — ' + x)); if (!c) fail++; };

for (const [name, vp] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
  console.log('\n' + name + ' (' + vp.width + 'px)');
  const p = await b.newPage({ viewport: vp });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);

  /* 1. the booking picker */
  const seen = await p.evaluate(() => Array.from(document.querySelectorAll('[data-van]')).map(e => e.getAttribute('data-van')));
  ok('all three Luton bodies are pickable', ['luton', 'lutonc', 'lutontl'].every(v => seen.includes(v)), seen.join(','));
  ok('nothing above a Luton is pickable', !seen.some(v => /artic|flat|rigid|hgv|75t/i.test(v)), seen.join(','));

  /* 2. each body actually selects, and shows its own per-mile rate */
  for (const v of ['luton', 'lutonc', 'lutontl']) {
    const r = await p.evaluate(v => {
      const btn = document.querySelector('.vp[data-van="' + v + '"]');
      if (!btn) return { err: 'no button' };
      btn.click();
      const rate = document.getElementById('cap-rate') || document.querySelector('[id*="rate"]');
      return { on: btn.classList.contains('on') || btn.getAttribute('aria-pressed') === 'true' || btn.className.includes('sel'),
               label: btn.innerText.split('\n')[0].trim(), rate: rate ? rate.textContent.trim() : null };
    }, v);
    ok(v + ' selects — "' + r.label + '" at ' + (r.rate || 'no rate shown'), !r.err && r.on !== false, JSON.stringify(r));
  }

  /* 3. the engine is running on the saved framework, not the built-in fallback */
  const e = await p.evaluate(() => ({ src: window.HAF_PRICING_SOURCE, ver: window.HAF_PRICING_VERSION,
    applied: window.HAF_PRICING_APPLIED, rates: window.HAF_PRICING_RATES }));
  ok('the quote engine loaded the saved framework', e.src === 'database', String(e.src));
  /* V8 (2026-09-07). This assertion is the reason the version string had to
     move: the V8 CODE deployed while the SAVED SETTINGS were still the 2026-08-02
     record, and because that record carried the same version number, every
     check here passed while the live site quoted the August rate card with the
     plan uplift switched off. A version that does not change when the model
     changes is not a version — it is camouflage. */
  ok('it is the approved framework version', e.ver === 'MATRIX-V8', String(e.ver));
  ok('the driver reward rung is what the engine took in', Array.isArray(e.applied) && e.applied.includes('driver reward'), JSON.stringify(e.applied));
  ok('tail lift is the top rung — £1.75/mi, £80 minimum', e.rates && e.rates.lutonTail === 1.75 && e.rates.lutonTailMin === 80, JSON.stringify(e.rates));
  ok('the rate card starts at £1.00 for a small van', e.rates && e.rates.smallVan === 1, String(e.rates && e.rates.smallVan));
  /* Brent, 2026-09-07: "Free driver gets base rate, Plus 5% on top, Pro 10% on
     top". The uplift is ON and HAF pays for it out of its own share. */
  ok('the driver plan uplift is switched on', e.rates && e.rates.rewardOn === true, String(e.rates && e.rates.rewardOn));
  ok('HAF funds the uplift — never the customer', e.rates && e.rates.rewardFundedBy === 'HAF', String(e.rates && e.rates.rewardFundedBy));
  ok('a Pro account pays 5 points less fee', e.rates && e.rates.proAccountCutPts === 5, JSON.stringify(e.rates && e.rates.proAccountCutPts));

  /* 3b. The read-outs above are what the PAGE reports. This asks the engine the
     page actually prices with, on a real job, because a correct-looking
     read-out beside a wrong price is the exact failure this suite missed. */
  const q = await p.evaluate(() => {
    const PM = window.HAFPricingMatrix;
    const one = (t) => PM.price({ miles: 100, vehicleCode: 'LWB_VAN', jobTypeCode: 'STD_SAMEDAY',
      plnaTier: t, knectTier: 'FREE', accountType: null, weight: 'STANDARD', handling: 'KERBSIDE' });
    const r = {};
    ['FREE', 'PLUS', 'PRO'].forEach((t) => { const x = one(t);
      r[t] = { customer: x.money.customerExVatGbp, driver: x.money.driverPayGbp, haf: x.money.hafKeepsPctOfCustomer }; });
    r.quoteAt = PM.config.driverReward.quoteAtLevel;
    r.pct = ['FREE', 'MEMBER', 'PRO'].map((k) => PM.config.driverLevels[k].rewardPctOfBaseRate);
    r.band = [PM.config.networkFeeFloor.pct, PM.config.networkFeeFloor.ceilingPct];
    return r;
  });
  ok('the plan uplifts are 0, 5 and 10 percent', String(q.pct) === '0,5,10', String(q.pct));
  ok('the customer is quoted at the middle rung', q.quoteAt === 'MEMBER', String(q.quoteAt));
  ok('the band HAF must land inside is 15% to 50%', String(q.band) === '15,50', String(q.band));
  /* LWB 100 mi same-day on a free account: base £1.50/mi = £150 to a free
     driver, £157.50 to Plus, £165 to Pro, and ONE customer price quoted at the
     middle rung. Worked by hand from the rate card, not copied off the engine. */
  ok('one customer price whoever accepts — £196.88',
     q.FREE.customer === 196.88 && q.PLUS.customer === 196.88 && q.PRO.customer === 196.88,
     JSON.stringify([q.FREE.customer, q.PLUS.customer, q.PRO.customer]));
  ok('the driver is paid their own rung — £150 / £157.50 / £165',
     q.FREE.driver === 150 && q.PLUS.driver === 157.5 && q.PRO.driver === 165,
     JSON.stringify([q.FREE.driver, q.PLUS.driver, q.PRO.driver]));
  ok('HAF keeps more on a free driver than on a Pro, and never under 15%',
     q.FREE.haf > q.PRO.haf && q.PRO.haf >= 15,
     JSON.stringify([q.FREE.haf, q.PLUS.haf, q.PRO.haf]));

  /* 4. wording */
  /* Read what a PERSON can read, plus the values that drive the pickers — not
     the raw source. Scanning p.content() swept up script comments, and a
     comment explaining "an SWB" vs "a Luton" contains the word "article",
     which failed this check for a vehicle that appears nowhere on the network.
     A guard that cries wolf on its own comments gets switched off, so it is
     narrowed to text and control values and the pattern no longer matches
     ordinary English words. */
  const body = await p.evaluate(() => {
    const parts = [document.body.innerText];
    document.querySelectorAll('option,input,select,button,[data-van],[aria-label],[title],[alt]').forEach((el) => {
      ['value', 'data-van', 'aria-label', 'title', 'alt', 'placeholder'].forEach((a) => {
        const v = el.getAttribute && el.getAttribute(a); if (v) parts.push(v);
      });
    });
    return parts.join('\n').toLowerCase();
  });
  ok('no "driver uplift" wording left', !/driver\s*uplift|uplift\s*(per|rate)/.test(body));
  ok('no vehicle above a Luton written anywhere',
     !/\bartic(ulated|s)?\b|\bflatbed|curtainsider|curtain-sider|tractor unit|\b7\.5\s*t(onne)?\b|\bhgv\b|\brigid\b/.test(body),
     (body.match(/\bartic(ulated|s)?\b|\bflatbed|curtainsider|curtain-sider|tractor unit|\b7\.5\s*t(onne)?\b|\bhgv\b|\brigid\b/g) || []).join(', '));
  await p.close();
}
await b.close();
console.log('\n' + (fail ? 'LIVE FAILURES: ' + fail : 'LIVE ALL PASS'));
process.exit(fail ? 1 : 0);
