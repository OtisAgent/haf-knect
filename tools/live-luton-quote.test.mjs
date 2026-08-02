/* Eyes-on the LIVE site — knect.usehaf.co.uk, desktop and phone.
   Proves what a customer actually sees: all three Luton bodies pickable and
   selectable, the saved framework (not the built-in fallback) driving the
   quote, and the retired "uplift" wording gone. */
import { chromium } from 'playwright-core';

const URL = 'https://knect.usehaf.co.uk/';
const b = await chromium.launch({ executablePath: '/agent/home/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--no-sandbox'] });
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
  ok('it is the approved framework version', e.ver === 'MATRIX-V5', String(e.ver));
  ok('the driver reward rung is what the engine took in', Array.isArray(e.applied) && e.applied.includes('driver reward'), JSON.stringify(e.applied));
  ok('tail lift is the top rung — £1.40/mi, £80 minimum', e.rates && e.rates.lutonTail === 1.4 && e.rates.lutonTailMin === 80, JSON.stringify(e.rates));
  ok('a Pro driver earns +25p a mile', e.rates && e.rates.proRewardPerMile === 0.25, JSON.stringify(e.rates && e.rates.proRewardPerMile));
  ok('a Pro account pays 5 points less fee', e.rates && e.rates.proAccountCutPts === 5, JSON.stringify(e.rates && e.rates.proAccountCutPts));

  /* 4. wording */
  const body = (await p.content()).toLowerCase();
  ok('no "driver uplift" wording left', !/driver\s*uplift|uplift\s*(per|rate)/.test(body));
  ok('no vehicle above a Luton written anywhere', !/\bartic|flatbed|curtainsider|curtain-sider|tractor unit|7\.5t\b/.test(body));
  await p.close();
}
await b.close();
console.log('\n' + (fail ? 'LIVE FAILURES: ' + fail : 'LIVE ALL PASS'));
process.exit(fail ? 1 : 0);
