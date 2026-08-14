/* Drives the 14-Aug size ladder and the continue-after-price offer:
   - HAF names the exact van, and the badge sits on the rung that holds it
   - four rungs, always visible, priced once both postcodes are in
   - picking another rung re-prices and says whose choice it was
   - the continue button only carries a price once a price exists
   - the same ladder appears inside the consignment's vehicle step
   Run: node _ladder_e2e.mjs */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';

const URL = process.env.TARGET_URL || 'file:///agent/workspace/knect-orderfix/index.html';
const SHOT = '/agent/workspace/knect-orderfix/_shots';
const fails = [], notes = [];
const ok = (c, m) => { (c ? notes : fails).push((c ? 'PASS ' : 'FAIL ') + m); };

const b = await chromium.launch();

for (const [tag, vp] of [['desktop', { width: 1280, height: 1100 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  const gate = await p.$('#ag-code');
  if (gate) { await p.fill('#ag-code', 'HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(500); }

  const rungs = () => p.$$eval('#vlad .vrung', els => els.map(e => ({
    name: e.querySelector('.vrung-n').textContent.trim(),
    price: (e.querySelector('.vrung-x') || {}).textContent || '',
    haf: e.classList.contains('haf'),
    sel: e.classList.contains('sel'),
    top: Math.round(e.getBoundingClientRect().top),
    h: Math.round(e.getBoundingClientRect().height)
  })));

  /* ── 1. the ladder is on the page before anything is answered ── */
  let r = await rungs();
  ok(r.length === 4, `[${tag}] four size rungs, always visible (found ${r.length})`);
  ok(JSON.stringify(r.map(x => x.name)) === JSON.stringify(['Up to small van', 'MWB', 'LWB', 'Luton']),
    `[${tag}] in Brent's order: ${r.map(x => x.name).join(' | ')}`);
  ok(!(await p.$('#veh-list.open')), `[${tag}] the full eight-vehicle list stays folded away`);

  /* ── 2. every rung is the same height and on the same line ── */
  const ROWS = tag === 'desktop' ? 1 : 2;   // four across on desktop, two-by-two on a phone
  ok(new Set(r.map(x => x.top)).size === ROWS, `[${tag}] the rungs sit on ${ROWS} tidy row(s)`);
  ok(Math.max(...r.map(x => x.h)) - Math.min(...r.map(x => x.h)) <= 1,
    `[${tag}] all four rungs are the same height (${r.map(x => x.h).join('/')})`);

  /* ── 3. answer the two load questions — HAF badges a rung ── */
  await p.click('#wt-pills .lp-tile[data-wt="w250"]');
  await p.click('#sz-pills .lp-tile[data-sz="s3"]');
  await p.waitForTimeout(400);
  r = await rungs();
  const badged = r.filter(x => x.haf);
  ok(badged.length === 1, `[${tag}] exactly one rung carries the HAF badge (${badged.length})`);
  const pickTxt = (await p.textContent('#hpick-v')).trim();
  ok(pickTxt.length > 1 && pickTxt !== "We'll choose for you",
    `[${tag}] HAF names the exact van: "${pickTxt}"`);
  const xline = (await p.textContent('#vlad-x')).trim();
  ok(/HAF has picked/.test(xline), `[${tag}] and says so under the ladder in plain words`);
  ok(badged[0].sel, `[${tag}] HAF's own rung is the one selected to start with`);

  /* ── 4. badges never move the layout ── */
  ok(new Set(r.map(x => x.top)).size === ROWS, `[${tag}] the badge does not shift the row it sits on`);
  ok(Math.max(...r.map(x => x.h)) - Math.min(...r.map(x => x.h)) <= 1,
    `[${tag}] a badged rung is the same height as an unbadged one`);

  /* ── 4b. nothing highlighted before HAF has actually suggested anything ── */
  {
    const fresh = await b.newPage({ viewport: vp });
    await fresh.goto('file:///agent/workspace/knect-orderfix/index.html', { waitUntil: 'load' });
    await fresh.waitForTimeout(700);
    const g = await fresh.$('#ag-code');
    if (g) { await fresh.fill('#ag-code', 'HAFLAUNCH'); await fresh.keyboard.press('Enter'); await fresh.waitForTimeout(500); }
    const lit = await fresh.$$eval('#vlad .vrung', els => els.filter(e => e.classList.contains('sel')).length);
    const line = (await fresh.textContent('#vlad-x')) || '';
    ok(lit === 0, `[${tag}] on a fresh page no size is highlighted before HAF has picked one (${lit})`);
    ok(/HAF will name the exact van/i.test(line), `[${tag}] and the line under it says HAF will name the van`);
    await fresh.close();
  }

  /* ── 5. no price yet, so no offer to continue ── */
  ok(!(await p.$('#cf-offer:visible')), `[${tag}] no continue offer before there is a price`);
  ok(!/£/.test(await p.textContent('#cf-go')), `[${tag}] and the button carries no number yet`);

  /* ── 6. both postcodes in — every rung prices, and the offer appears ── */
  await p.fill('#pc-from', 'S35 8RF');
  await p.fill('#pc-to', 'M1 1AE');
  await p.waitForTimeout(3000);
  r = await rungs();
  const priced = r.filter(x => /£/.test(x.price));
  ok(priced.length === 4, `[${tag}] all four rungs show their own guide price (${priced.length}/4)`);
  ok(!!(await p.$('#cf-offer:visible')), `[${tag}] the offer to carry on appears once priced`);
  const goTxt = (await p.textContent('#cf-go')).trim();
  ok(/Continue to book/.test(goTxt) && /£/.test(goTxt),
    `[${tag}] the button carries the price: "${goTxt}"`);
  await p.screenshot({ path: `${SHOT}/ladder-${tag}-priced.png`, fullPage: false });

  /* ── 7. a bigger rung costs more than a smaller one ── */
  const money = s => parseInt(String(s).replace(/[^0-9–]/g, '').split('–')[0], 10);
  ok(money(r[3].price) > money(r[0].price),
    `[${tag}] a Luton prices above a small van (${r[0].price} vs ${r[3].price})`);

  /* ── 8. the customer can overrule HAF, and it says whose choice it was ── */
  const other = r.findIndex(x => !x.haf);
  await p.click(`#vlad .vrung:nth-child(${other + 1})`);
  await p.waitForTimeout(2500);
  r = await rungs();
  ok(r[other].sel, `[${tag}] picking another size selects it`);
  ok(r.filter(x => x.haf).length === 1, `[${tag}] HAF's suggestion stays badged where it was`);
  const x2 = (await p.textContent('#vlad-x')).trim();
  ok(/You have chosen/.test(x2), `[${tag}] and the line says it is the customer's choice, not ours`);
  const go2 = (await p.textContent('#cf-go')).trim();
  ok(/£/.test(go2), `[${tag}] the button re-prices to the new size: "${go2}"`);

  /* ── 9. put it back to HAF's pick ── */
  const hafIdx = r.findIndex(x => x.haf);
  await p.click(`#vlad .vrung:nth-child(${hafIdx + 1})`);
  await p.waitForTimeout(2500);
  const x3 = (await p.textContent('#vlad-x')).trim();
  ok(/HAF has picked/.test(x3), `[${tag}] choosing HAF's rung back reads as HAF's pick again`);

  /* ── 10. the same ladder inside the consignment ── */
  await p.click('#cf-go');
  await p.waitForTimeout(900);
  await p.evaluate(() => fqStep(3));
  await p.waitForTimeout(600);
  const fr = await p.$$eval('#fq-vlad .vrung', els => els.map(e => ({
    name: e.querySelector('.vrung-n').textContent.trim(),
    haf: e.classList.contains('haf'), sel: e.classList.contains('sel'),
    top: Math.round(e.getBoundingClientRect().top)
  })));
  ok(fr.length === 4, `[${tag}] the consignment's vehicle step carries the same four rungs`);
  ok(fr.filter(x => x.haf).length === 1, `[${tag}] with HAF's suggestion badged there too`);
  ok(new Set(fr.map(x => x.top)).size === ROWS, `[${tag}] and they line up the same way there`);
  await p.screenshot({ path: `${SHOT}/ladder-${tag}-consignment.png`, fullPage: false });

  ok(errs.length === 0, `[${tag}] no script errors${errs.length ? ' — ' + errs.join(' | ') : ''}`);
  await p.close();
}

await b.close();
console.log(notes.join('\n'));
if (fails.length) { console.log('\n' + fails.join('\n')); }
console.log(`\n${notes.length} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
