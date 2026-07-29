/* Run back — behaviour check. Local build, then the same file on a preview URL.
   Proves: driver-only, both detail modes carry it, Plus finds/Pro decides,
   decline moves on, accept closes the day, and no full postcode is drawn. */
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://127.0.0.1:8899/';
const PC = /\b[A-Z]{1,2}[0-9][A-Z0-9]?\s+[0-9][A-Z]{2}\b/g;
const out = [];
const b = await chromium.launch();

for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const [acct, who] of [['DEMO-DRV', 'driver'], ['DEMO-BIZ', 'business'], ['DEMO-PRO', 'freight']]) {
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e)));
    pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await pg.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await pg.waitForFunction(() => typeof window.demoLogin === 'function', null, { timeout: 20000 });
    await pg.evaluate(a => window.demoLogin(a), acct);
    await pg.waitForTimeout(700);

    const seen = () => pg.evaluate(() => {
      const el = document.getElementById('dash-return');
      return { inDoc: !!el, visible: !!(el && el.offsetParent !== null), text: el ? el.innerText : '' };
    });

    const r = { width: w, acct, who };
    const base = await seen();
    r.cardInDoc = base.inDoc; r.cardVisible = base.visible;

    if (who === 'driver') {
      // both detail modes must carry it, and the pane must stay node-identical
      const counts = {};
      for (const m of ['basic', 'advanced']) {
        await pg.evaluate(x => setDashMode(x), m);
        await pg.waitForTimeout(200);
        counts[m] = await pg.evaluate(() => ({
          nodes: document.getElementById('pane-d-home').querySelectorAll('*').length,
          rr: (document.getElementById('dash-return') || {}).offsetParent !== null,
        }));
      }
      r.modeParity = counts.basic.nodes === counts.advanced.nodes;
      r.inBothModes = counts.basic.rr && counts.advanced.rr;

      // PLUS: finds and lists, no accept button in the card
      await pg.evaluate(() => rrSetTier('PLUS'));
      await pg.waitForTimeout(200);
      const plus = await pg.evaluate(() => {
        const el = document.getElementById('dash-return');
        return { rows: el.querySelectorAll('.rr-item').length, accepts: [...el.querySelectorAll('button')].filter(x => /accept/i.test(x.textContent)).length, txt: el.innerText };
      });
      r.plusRows = plus.rows; r.plusAcceptButtons = plus.accepts;
      r.plusMentionsPro = /On Pro/i.test(plus.txt);

      // PRO: one best pick with accept + decline
      await pg.evaluate(() => rrSetTier('PRO'));
      await pg.waitForTimeout(200);
      const pro1 = await pg.evaluate(() => {
        const el = document.getElementById('dash-return');
        return { route: (el.querySelector('.rr-best .rr-rt') || {}).innerText || '', why: el.querySelectorAll('.rr-why span').length, btns: [...el.querySelectorAll('.rr-best button')].map(x => x.innerText.trim()) };
      });
      r.proFirst = pro1.route; r.proWhy = pro1.why; r.proButtons = pro1.btns;

      // decline moves to the next one
      await pg.evaluate(() => { const b = [...document.querySelectorAll('#dash-return button')].find(x => /Not this one/i.test(x.textContent)); b && b.click(); });
      await pg.waitForTimeout(200);
      r.proSecond = await pg.evaluate(() => (document.querySelector('#dash-return .rr-best .rr-rt') || {}).innerText || '');
      r.declineMovedOn = r.proSecond && r.proSecond !== r.proFirst;

      // accept closes the day off
      await pg.evaluate(() => { const b = [...document.querySelectorAll('#dash-return button')].find(x => /Accept the run back/i.test(x.textContent)); b && b.click(); });
      await pg.waitForTimeout(200);
      const day = await pg.evaluate(() => {
        const el = document.getElementById('dash-return');
        return { legs: el.querySelectorAll('.rr-leg').length, txt: el.innerText };
      });
      r.dayLegs = day.legs; r.dayBooked = /Booked/i.test(day.txt);
      await pg.evaluate(() => rrReset());
      await pg.waitForTimeout(150);

      // taking a job out re-points the finder at that drop
      await pg.evaluate(() => { const b = document.querySelector('#pane-d-home .xc.xc-invite .xc-btns .btn-or'); b && b.click(); });
      await pg.waitForTimeout(250);
      r.afterAcceptOut = await pg.evaluate(() => (document.getElementById('dash-return') || {}).innerText.split('\n').find(l => /You are out to/.test(l)) || '');
    }

    const paneTxt = await pg.evaluate(() => (document.getElementById('pane-d-home') || {}).innerText || '');
    r.fullPostcodes = [...new Set(paneTxt.match(PC) || [])];
    r.errors = errs;
    out.push(r);
    await pg.close();
  }
}
await b.close();
out.forEach(r => console.log(JSON.stringify(r)));
