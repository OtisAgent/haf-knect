/* End-to-end walk of the new seven-stage order flow, plus the two new
   ways in: send-direct-to-a-known-driver, and the email quote template. */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';

const URL = 'file:///agent/workspace/knect-orderfix/index.html';
const SHOT = '/agent/workspace/knect-orderfix/_shots';
const fails = [], notes = [];
const ok = (c, m) => { (c ? notes : fails).push((c ? 'PASS ' : 'FAIL ') + m); };

const b = await chromium.launch();

for (const [tag, vp] of [['desktop', { width: 1280, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(700);

  // access gate
  const gate = await p.$('#ag-code');
  if (gate) { await p.fill('#ag-code', 'HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(500); }

  await p.evaluate(() => openFlow('fast'));
  await p.waitForTimeout(300);

  const on = () => p.evaluate(() => {
    const e = document.querySelector('#if-fast .fstep.on');
    return e ? e.id : null;
  });
  const shot = n => p.screenshot({ path: `${SHOT}/flow-${tag}-${n}.png`, fullPage: tag === 'desktop' });

  // 1 — where
  ok(await on() === 'fq-1', `[${tag}] opens on step 1`);
  await p.fill('#fq-from', 'S9 1AA'); await p.fill('#fq-to', 'M1 1AA');
  await shot('1-where');
  await p.evaluate(() => fqNext(2)); await p.waitForTimeout(250);

  // 2 — what are we collecting (the new stage)
  ok(await on() === 'fq-2', `[${tag}] step 2 = what are we collecting`);
  const grids = await p.evaluate(() => ({
    wt: document.querySelectorAll('#fq-wt .oopt').length,
    sz: document.querySelectorAll('#fq-sz .oopt').length,
    unit: document.querySelectorAll('#fq-unit option').length,
    reqs: document.querySelectorAll('#fq-reqs .tgl').length
  }));
  ok(grids.wt > 0 && grids.sz > 0 && grids.unit > 0 && grids.reqs > 0,
    `[${tag}] step 2 choices render ${JSON.stringify(grids)}`);
  // a heavy palletised load, so allocation has to climb
  await p.evaluate(() => {
    document.querySelectorAll('#fq-wt .oopt')[2].click();
    document.querySelectorAll('#fq-sz .oopt')[2].click();
  });
  await p.fill('#fq-qty', '4');
  await p.selectOption('#fq-unit', { index: 1 });
  await p.fill('#fq-goods', 'Boxed engineering parts on 4 standard pallets, shrink wrapped');
  await p.fill('#fq-dl', '120'); await p.fill('#fq-dw', '100'); await p.fill('#fq-dh', '150');
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('#fq-reqs .tgl')].find(x => /tail/i.test(x.textContent));
    if (t) t.click();
  });
  await p.fill('#fq-notes', 'Pallets cannot be stacked. Ring the buzzer at goods-in.');
  await shot('2-collecting');
  await p.evaluate(() => fqNext(3)); await p.waitForTimeout(300);

  // 3 — allocation
  ok(await on() === 'fq-3', `[${tag}] step 3 = vehicle`);
  const pick = await p.evaluate(() => ({
    v: (document.getElementById('fq-pick-v') || {}).textContent || '',
    w: (document.getElementById('fq-pick-w') || {}).textContent || '',
    small: [...document.querySelectorAll('#fq-van .oopt.toosmall')].length,
    total: document.querySelectorAll('#fq-van .oopt').length
  }));
  ok(pick.v && pick.v !== '—', `[${tag}] HAF picks a vehicle: "${pick.v.trim()}"`);
  ok(pick.w.length > 30, `[${tag}] and says why: "${pick.w.trim().slice(0, 90)}..."`);
  ok(pick.small > 0 && pick.small < pick.total,
    `[${tag}] vans too small are ruled out (${pick.small} of ${pick.total})`);
  await p.evaluate(() => fqToggleVeh()); await p.waitForTimeout(200);
  await shot('3-vehicle');
  await p.evaluate(() => fqNext(4)); await p.waitForTimeout(250);

  // 4 — when
  ok(await on() === 'fq-4', `[${tag}] step 4 = when`);
  await p.evaluate(() => document.querySelectorAll('#fq-4 .ogrid .oopt')[1].click());
  await p.fill('#fq-cdate', '2026-08-18'); await p.fill('#fq-ctime', '09:00');
  await shot('4-when');
  await p.evaluate(() => fqNext(5)); await p.waitForTimeout(250);

  // 5 — full details
  ok(await on() === 'fq-5', `[${tag}] step 5 = collection and delivery details`);
  await p.fill('#fq-caddr', 'Unit 4 Attercliffe Works, Sheffield, S9 1AA');
  await p.fill('#fq-cname', 'Dave Hall'); await p.fill('#fq-cphone', '07700 900123');
  await p.fill('#fq-daddr', '12 Piccadilly, Manchester, M1 1AA');
  await p.fill('#fq-dname', 'Sara Kent'); await p.fill('#fq-dphone', '07700 900456');
  await shot('5-details');
  await p.evaluate(() => fqShowPriceV());
  await p.waitForFunction(() => (document.querySelector('#if-fast .fstep.on')||{}).id === 'fq-6', null, { timeout: 15000 })
    .catch(async () => { console.log(`[${tag}] step5 err:`, await p.evaluate(() => (document.getElementById('fq-err-5')||{}).textContent)); });
  await p.waitForFunction(() => /\d/.test((document.getElementById('fq-pr-range')||{}).textContent||''), null, { timeout: 15000 }).catch(()=>{});

  // 6 — price + the job card + know the driver
  ok(await on() === 'fq-6', `[${tag}] step 6 = price`);
  const price = await p.evaluate(() => (document.getElementById('fq-pr-range') || {}).textContent || '');
  ok(/\d/.test(price), `[${tag}] a price is shown: ${price.trim()}`);
  const card = await p.evaluate(() => (document.getElementById('fq-jobcard') || {}).textContent || '');
  for (const want of ['engineering parts', 'pallet', 'Tail lift', 'cannot be stacked'])
    ok(card.toLowerCase().includes(want.toLowerCase()), `[${tag}] driver's job card carries "${want}"`);

  // bad username is refused
  await p.fill('#fq-dduser', 'dave');
  await p.evaluate(() => ddSetDirect()); await p.waitForTimeout(150);
  const bad = await p.evaluate(() => {
    const e = document.getElementById('fq-dd-err');
    return { shown: e && e.style.display !== 'none', t: e ? e.textContent : '' };
  });
  ok(bad.shown, `[${tag}] a name that isn't a HAF username is refused`);
  // good username is accepted
  await p.fill('#fq-dduser', 'jw012390');
  await p.evaluate(() => ddSetDirect()); await p.waitForTimeout(150);
  const good = await p.evaluate(() => {
    const o = document.getElementById('fq-dd-ok');
    return { shown: o && o.style.display !== 'none', t: o ? o.textContent : '', held: (typeof fqData !== 'undefined') && fqData.direct };
  });
  ok(good.shown && /JW012390/.test(good.t), `[${tag}] known driver accepted: "${good.t.trim().slice(0, 80)}..."`);
  ok(good.held === 'JW012390', `[${tag}] the job carries the direct driver through`);
  await shot('6-price-and-driver');
  await p.evaluate(() => fqStep(7)); await p.waitForTimeout(250);

  // 7 — book
  ok(await on() === 'fq-7', `[${tag}] step 7 = your details`);
  await p.fill('#fq-name', 'Brent Ford'); await p.fill('#fq-email', 'admin@usehaf.co.uk');
  await p.fill('#fq-mobile', '07700 900999');
  await shot('7-book');
  // Missing details must stop the order before it ever reaches the server.
  await p.fill('#fq-mobile', '');
  await p.evaluate(() => { window.__posted = false;
    const f = window.fetch; window.fetch = (...a) => { window.__posted = true; return f(...a); }; });
  await p.evaluate(() => fqBookV()); await p.waitForTimeout(250);
  const guard = await p.evaluate(() => ({
    err: ((document.getElementById('fq-err-7') || {}).textContent || '').trim(),
    posted: !!window.__posted
  }));
  ok(/mobile/i.test(guard.err) && !guard.posted,
     `[${tag}] missing details stop the order before it is sent: "${guard.err}"`);
  await p.fill('#fq-mobile', '07700 900999');

  // The button now places a REAL order against the booking engine. Opened from a
  // file, that engine is not there — so what this proves is the honest failure:
  // it tells the customer plainly and gives the button back, rather than showing
  // a confirmation for an order nobody took. The happy path is proven against the
  // running engine on the preview, not here.
  await p.evaluate(() => fqBookV()); await p.waitForTimeout(1200);
  const done = await p.evaluate(() => {
    const b = document.querySelector('#fq-7 .fnav .btn-or');
    const d = document.getElementById('fq-done');
    return {
      posted: !!window.__posted,
      err: ((document.getElementById('fq-err-7') || {}).textContent || '').trim(),
      label: b ? b.textContent.trim() : '', disabled: b ? !!b.disabled : true,
      onDone: !!(d && d.classList.contains('on'))
    };
  });
  ok(done.posted, `[${tag}] step 7 validates, then sends the order to the booking engine`);
  ok(done.err && !done.onDone && !done.disabled && /confirm/i.test(done.label),
     `[${tag}] engine unreachable: says so plainly and gives the button back — no false confirmation`);
  await shot('8-booked');

  // the email route
  await p.evaluate(() => closeInlineFlow());
  await p.evaluate(() => openEmailQuote()); await p.waitForTimeout(300);
  const eq = await p.evaluate(() => {
    const box = document.getElementById('email-quote'), ta = document.getElementById('eq-body');
    return { shown: box && box.style.display !== 'none', body: ta ? ta.value : '' };
  });
  ok(eq.shown, `[${tag}] the email quote template opens`);
  for (const want of ['COLLECTION', 'DELIVERY', 'WHAT WE ARE SENDING', 'Tail lift'])
    ok(eq.body.includes(want), `[${tag}] template asks for "${want}"`);
  await shot('9-email-quote');

  ok(errs.length === 0, `[${tag}] no javascript errors${errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''}`);
  await p.close();
}

await b.close();
console.log(notes.join('\n'));
console.log('\n' + '='.repeat(60));
console.log(fails.length ? 'FAILURES:\n' + fails.join('\n') : `ALL ${notes.length} CHECKS PASSED`);
process.exit(fails.length ? 1 : 0);
