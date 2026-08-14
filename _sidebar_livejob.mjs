/* The top-left card, and the blur that would not lift.

   Brent, 14 Aug: "i've got in the top left a blur section that i can't remove
   and it's a test job --> that should only show on real jobs now --> leave
   blank until an active job is in play".

   Two separate faults sat behind that one sentence, so this proves both:
     1. the sidebar live-job card fell back to a seeded run, so it ALWAYS showed
        a job — a test one — whether or not any work was in play;
     2. under "Blur all", a card's own eye could not lift its blur, and on a
        phone the master switch steps aside and the sidebar has no view bar of
        its own, so there was genuinely nothing left to press.

   A vacuous pass is worth nothing here: "the card is empty" has to be checked
   in a state where a card WOULD have shown, and "the blur lifts" has to be
   checked with the blur actually on. Both are asserted below. */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';

const TARGET = process.argv[2] || 'file:///agent/workspace/knect-orderfix/index.html';
const b = await chromium.launch();
const fails = [], passes = [];
const ok = (c, m) => { (c ? passes : fails).push((c ? 'PASS ' : 'FAIL ') + m); };

for (const [tag, vp] of [['desktop', { width: 1280, height: 1100 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  await p.goto(TARGET, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  const gate = await p.$('#ag-code');
  if (gate) { await p.fill('#ag-code', 'HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }

  await p.evaluate(() => window.demoLogin('DEMO-DRV'));
  await p.waitForTimeout(900);

  // The card has to exist and the app has to be open, or every check below
  // passes for the wrong reason.
  const staged = await p.evaluate(() => ({
    card: !!document.getElementById('sb-livejob'),
    open: !!document.querySelector('#app.open'),
    seeded: (typeof HAF_JOBS !== 'undefined' ? HAF_JOBS.length : 0),
    viewLayer: !!(window.HAF_VIEW && window.HAF_VIEW.isSample),
  }));
  ok(staged.card, `${tag}: the sidebar card exists to be judged`);
  ok(staged.open, `${tag}: signed in, so the sidebar is on screen`);
  ok(staged.seeded > 0, `${tag}: seeded runs are loaded (${staged.seeded}) — the old code WOULD have shown one`);
  ok(staged.viewLayer, `${tag}: the run-visibility layer decides real vs seeded`);

  // ── 1. nothing real in play → nothing on screen ──────────────────────────
  const empty = await p.evaluate(() => {
    const el = document.getElementById('sb-livejob');
    return { display: getComputedStyle(el).display, text: el.textContent.trim().length };
  });
  ok(empty.display === 'none', `${tag}: no real job → card is not shown (display ${empty.display})`);
  ok(empty.text === 0, `${tag}: no real job → card is empty, not a hidden test job (${empty.text} chars)`);

  // Prove the emptiness is BECAUSE nothing is real, not because the card is
  // broken: every seeded run is still there and still reads as a sample.
  const seededAllSample = await p.evaluate(() =>
    HAF_JOBS.every(j => window.HAF_VIEW.isSample(j.id)));
  ok(seededAllSample, `${tag}: every seeded run is known to be a sample`);

  // ── 2. a real job in play → the card comes back ──────────────────────────
  const real = await p.evaluate(() => {
    HAF_JOBS.unshift({
      id: 'HAF-20260814-REAL01', colour: '#ff7800', status: 'transit', stepIdx: 4, progress: 55,
      from: { name: 'Sheffield S9' }, to: { name: 'Manchester M1' },
      eta: '14:20', driverName: 'A. Driver', vehicle: 'LWB', goods: '3 pallets',
      payout: '£120', price: '£120', rate: '', distance: '42 mi', deadline: 'Today 16:00',
      client: 'Real Customer', buy: '£90', sell: '£120', margin: '£30', marginPct: '25%',
      vat: '£24', account: '', driverId: '', reg: '', collect: 'Today 09:00',
      lastUpdate: 'just now', onTime: 'On time', recipientHint: '', updates: [], messages: [],
    });
    hafRenderLiveWidget();
    if (window.HAF_VIEW) window.HAF_VIEW.sweep();
    const el = document.getElementById('sb-livejob');
    return { display: getComputedStyle(el).display, text: el.textContent };
  });
  await p.waitForTimeout(400);
  ok(real.display === 'block', `${tag}: a real job in play → the card is shown (display ${real.display})`);
  ok(real.text.includes('HAF-20260814-REAL01'), `${tag}: the card carries the REAL reference`);
  ok(!/HAF-28\d\d/.test(real.text), `${tag}: no seeded reference leaked onto the card`);

  const chip = await p.evaluate(() => {
    const el = document.getElementById('sb-livejob');
    return { real: el.classList.contains('hv-real'), sample: el.classList.contains('hv-sample') };
  });
  ok(chip.real && !chip.sample, `${tag}: the card reads as a real run, not a sample`);

  // ── 3. the blur can always be lifted ─────────────────────────────────────
  const blur = await p.evaluate(() => {
    window.HAF_VIEW.blurAll(true);
    const el = document.getElementById('sb-livejob');
    const soft = getComputedStyle(el.querySelector('.sb-lj-route')).filter;
    el.querySelector(':scope > .hv-eye').click();
    const after = getComputedStyle(el.querySelector('.sb-lj-route')).filter;
    // and blurring it again must put it straight back
    el.querySelector(':scope > .hv-eye').click();
    const again = getComputedStyle(el.querySelector('.sb-lj-route')).filter;
    return { soft, after, again, allOn: document.body.classList.contains('hv-blur-all') };
  });
  ok(blur.allOn, `${tag}: "Blur all" really is on for this check`);
  ok(blur.soft.includes('blur'), `${tag}: with Blur all on, the card starts soft`);
  ok(!blur.after.includes('blur'), `${tag}: the card's own eye lifts the blur (was "${blur.after}")`);
  ok(blur.again.includes('blur'), `${tag}: pressing it again puts the card back under the blur`);

  // Turning the master switch on again must mean EVERYTHING, with no card
  // quietly left out from last time.
  const reset = await p.evaluate(() => {
    const el = document.getElementById('sb-livejob');
    el.querySelector(':scope > .hv-eye').click();          // let this one out
    window.HAF_VIEW.blurAll(false);
    window.HAF_VIEW.blurAll(true);                          // clean sheet
    return getComputedStyle(el.querySelector('.sb-lj-route')).filter;
  });
  ok(reset.includes('blur'), `${tag}: switching Blur all on again covers every card`);

  await p.close();
}

await b.close();
passes.forEach(l => console.log(l));
fails.forEach(l => console.log(l));
console.log(`\n${passes.length}/${passes.length + fails.length} checks passed on ${TARGET}`);
process.exit(fails.length ? 1 : 0);
