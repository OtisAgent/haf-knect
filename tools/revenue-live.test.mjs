/* REVENUE-V1 + FEE BASIS RULING — eyes-on the REAL production page.
   Node tests prove the arithmetic; this proves the deployed bytes actually do
   it in a browser, on a desktop and on a phone.

     BASE=https://knect.usehaf.co.uk node tools/revenue-live.test.mjs
*/
import { chromium } from 'playwright-core';

const base = process.env.BASE || 'https://knect.usehaf.co.uk';
const b = await chromium.launch({
  executablePath: '/agent/home/.cache/ms-playwright/chromium-1140/chrome-linux/chrome',
  args: ['--no-sandbox']
});

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  — ' + d : '')); } };
const near = (n, got, want, tol = 0.02) => ok(n + ' (' + got + ')', Math.abs(got - want) <= tol, 'expected ' + want);

for (const [label, w, h] of [['desktop', 1440, 900], ['phone', 390, 844]]) {
  console.log(`\n── ${label} (${w}x${h}) — ${base}/admin/ ──`);
  const page = await b.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));

  /* The owner gate guards the live API. The revenue view is computed in the
     browser from the demo queue and the pricing engine, so it is exercised
     without signing in as anyone. */
  await page.goto(base + '/admin/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    sessionStorage.setItem('knect-admin', '1');
    sessionStorage.setItem('knect-admin-cred', JSON.stringify({ user: 'RENDER_CHECK', pin: null }));
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  /* ---- the deployed modules are really there ---- */
  const mods = await page.evaluate(() => ({
    pricing: typeof HAFPricingMatrix !== 'undefined' && HAFPricingMatrix.version,
    revenue: typeof HAFRevenueModel !== 'undefined' && HAFRevenueModel.version,
    basis:   typeof HAFPricingMatrix !== 'undefined' && HAFPricingMatrix.config.feeBasis,
    ruling:  typeof HAFPricingMatrix !== 'undefined' && HAFPricingMatrix.config.feeBasisRuling
  }));
  ok('the pricing engine is loaded on the live page', !!mods.pricing, String(mods.pricing));
  ok('the revenue model is loaded on the live page', !!mods.revenue, String(mods.revenue));
  ok('production is running the ruling, not the counterfactual',
     mods.basis === 'SHARE_OF_CUSTOMER_PRICE', String(mods.basis));
  ok('the ruling is dated and attributed on the live page',
     !!(mods.ruling && mods.ruling.lockedOn === '2026-08-02' && /Brent/.test(mods.ruling.lockedBy || '')),
     JSON.stringify(mods.ruling));

  /* ---- the bands Brent stated, from the live engine ---- */
  const q = await page.evaluate(() => {
    const p = (job, veh, miles, acct) => HAFPricingMatrix.price({
      miles, vehicleCode: veh, jobTypeCode: job, plnaTier: 'FREE', knectTier: 'FREE',
      accountType: acct || null, weight: 'STANDARD', handling: 'KERBSIDE' }).money;
    return {
      sameday: p('STD_SAMEDAY', 'SMALL_VAN', 30),
      urgent:  p('URGENT', 'LUTON_BOX', 78),
      paid:    p('STD_SAMEDAY', 'SMALL_VAN', 30, 'FREIGHT_PRO')
    };
  });
  near('a free same-day job keeps 20% of the customer price', q.sameday.hafKeepsPctOfCustomer, 20);
  near('an urgent job keeps 30%', q.urgent.hafKeepsPctOfCustomer, 30);
  near('the deepest paid account still keeps 15%', q.paid.hafKeepsPctOfCustomer, 15);
  ok('the fee charged and the share kept are the same number live',
     Math.abs(q.sameday.hafKeepsPctOfCustomer - q.sameday.networkFeePct) <= 0.02);
  ok('every live quote states the basis it was priced on',
     q.sameday.feeBasis === 'SHARE_OF_CUSTOMER_PRICE', String(q.sameday.feeBasis));

  /* ---- the four streams are on screen and kept apart ---- */
  const rev = await page.evaluate(() => {
    const el = document.getElementById('pm-revenue');
    return { html: el ? el.innerText : '', rows: el ? el.querySelectorAll('tbody tr').length : 0 };
  });
  ok('the "where the money comes from" panel rendered', rev.rows === 4, rev.rows + ' rows');
  ok('delivery is named as its own stream', /Delivery network revenue/i.test(rev.html));
  ok('subscriptions are a separate line', /Account subscriptions/i.test(rev.html));
  ok('payroll and processing are a separate line', /Payroll.*processing/i.test(rev.html));
  ok('additional services are a separate line', /Additional services/i.test(rev.html));
  ok('only delivery carries a figure on a job screen',
     (rev.html.match(/£/g) || []).length === 1, rev.html.replace(/\n/g, ' | '));

  /* ---- fee → profit, on a real job ---- */
  await page.evaluate(() => {
    const first = document.querySelector('#pm-tbl .ebtn');
    if (first) first.click();
  });
  await page.waitForTimeout(1200);

  /* The stand-in credential above gets the browser code running; the live API
     then rejects it and the page signs itself out. That is the right answer,
     so it is checked rather than worked around — and it is why the picture of
     this view is captured by tools/revenue-live-shot.mjs instead, which serves
     the production bytes and opens the gate the way a signed-in owner would.
     Anything here that needed a real session would be untested, not silently
     passed. */
  const ejected = await page.evaluate(() => {
    const g = document.getElementById('gate');
    return g ? getComputedStyle(g).display !== 'none' : null;
  });
  ok('a stand-in credential is ejected by the live site, not trusted', ejected === true);

  const detail = await page.evaluate(() => {
    const d = document.getElementById('pm-detail');
    return d ? d.innerText : '';
  });
  ok('opening a job shows what HAF earns on it', /What HAF earns on this job/i.test(detail));
  ok('the walk from fee to profit is shown', /HAF gross profit/i.test(detail), detail.slice(0, 120));
  ok('the network pool deduction is named', /network pools/i.test(detail));
  ok('the driver payable is shown separately from the fee',
     /Driver payable/i.test(detail) && /HAF network fee/i.test(detail));
  ok('payment processing is explained, not silently zero',
     /CleverPay bills only when an invoice/i.test(detail) || /payment processing/i.test(detail));

  /* ---- it fits the screen it is on ---- */
  const overflow = await page.evaluate(() => {
    const el = document.getElementById('pm-revenue');
    /* The fee-to-profit rows are the narrow-screen risk: the gross-profit line
       carries its own explanation and is wider than a phone if it cannot wrap. */
    const rows = [...document.querySelectorAll('#pm-detail .mrow')]
      .map(r => r.scrollWidth - r.clientWidth).filter(d => d > 1);
    return el ? { scroll: el.scrollWidth, client: document.documentElement.clientWidth,
                  bodyOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                  rowsOver: rows.length } : null;
  });
  ok('the page does not scroll sideways on this screen',
     overflow && overflow.bodyOver <= 1, JSON.stringify(overflow));
  ok('no fee-to-profit line runs off the edge of this screen',
     overflow && overflow.rowsOver === 0, JSON.stringify(overflow));

  ok('no script errors on the live page', errs.length === 0, errs.slice(0, 2).join(' | '));

  await page.close();
}

await b.close();
console.log('\n' + '='.repeat(66));
console.log(`LIVE REVENUE CHECK: ${pass} passed, ${fail} failed  (${base})`);
if (fail) process.exitCode = 1;
