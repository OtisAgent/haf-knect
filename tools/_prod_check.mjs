/* PRODUCTION CHECK — drives the real knect.usehaf.co.uk in a real browser at
   desktop and phone widths. Nothing is asserted from the source: every number
   is read back out of the page the customer actually gets. */
import { chromium } from 'playwright-core';

const EXE = '/agent/home/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'https://knect.usehaf.co.uk/';
const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const fails = [], errs = [];

for (const [name, vp] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });

  const r = await p.evaluate(async () => {
    const cards = [...document.querySelectorAll('#van-pills .vcard')].map(c => ({
      name: c.querySelector('.vp-n')?.textContent.trim(),
      fits: c.querySelector('.vp-sub')?.textContent.trim(),
      rows: [...c.querySelectorAll('.vp-row')].map(x => x.textContent.trim())
    }));
    document.getElementById('pc-from').value = 'S9 1AA';
    document.getElementById('pc-to').value = 'M1 1AA';
    document.querySelector('#wt-pills [data-wt="w250"]').click();
    document.querySelector('#sz-pills [data-sz="s3"]').click();
    await calcLivePrice();
    return {
      cards,
      wtTiles: [...document.querySelectorAll('#wt-pills .lp-tile')].map(t => t.textContent.trim().replace(/\s+/g, ' ')),
      szTiles: [...document.querySelectorAll('#sz-pills .lp-tile')].map(t => t.textContent.trim().replace(/\s+/g, ' ')),
      van: document.querySelector('#van-pills .vp.sel')?.querySelector('.vp-n')?.textContent.trim(),
      note: document.getElementById('ld-note')?.innerText.trim(),
      price: document.getElementById('lp-range')?.textContent.trim(),
      info: document.getElementById('lp-info')?.textContent.trim(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyText: document.body.innerText
    };
  });

  const ck = (cond, msg) => { if (!cond) fails.push(name + ': ' + msg); };
  ck(r.cards.length === 8, 'expected 8 vehicle cards, got ' + r.cards.length);
  ck(r.cards.every(c => c.rows.length === 3), 'every card shows three spec rows');
  ck(r.cards.every(c => /m$/.test(c.rows[0]) && /pallets?$/.test(c.rows[1]) && /kg max$/.test(c.rows[2])), 'spec rows read size, pallets, weight in that order');
  ck(r.cards.every(c => c.fits && c.fits.length > 4), 'every card has a plain-English what-fits line');
  ck(r.wtTiles.length === 5, 'five weight bands, got ' + r.wtTiles.length);
  ck(r.szTiles.length === 5, 'five size bands, got ' + r.szTiles.length);
  ck(/50 kg/.test(r.wtTiles[0]) && /1 tonne/.test(r.wtTiles[4]), 'weight ladder runs 50 kg to 1 tonne +');
  ck(/Small box/.test(r.szTiles[0]) && /Full van load/.test(r.szTiles[4]), 'size ladder runs small box to full van load');
  ck(/£/.test(r.price || ''), 'a real price came back: ' + r.price);
  ck(r.overflow <= 0, 'no sideways scroll (overflow ' + r.overflow + 'px)');
  for (const banned of ['Artic', 'Flatbed', 'Fridge', '7.5 ', '18 tonne', 'HGV']) {
    ck(!new RegExp(banned, 'i').test(r.bodyText), 'no "' + banned.trim() + '" anywhere on the page');
  }

  console.log('\n== ' + name + ' ==');
  console.log('cards :\n  ' + r.cards.map(c => c.name + ' — ' + c.fits + '  [' + c.rows.join(' | ') + ']').join('\n  '));
  console.log('weight: ' + r.wtTiles.join('  ·  '));
  console.log('size  : ' + r.szTiles.join('  ·  '));
  console.log('picked: ' + r.van + '  |  ' + r.note);
  console.log('price : ' + r.price + '  |  ' + r.info);
  await p.screenshot({ path: '/tmp/_prod_' + name + '.png' });
  await p.close();
}

await b.close();
console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails.length ? 'FAILED:\n' + fails.join('\n') : 'ALL LIVE CHECKS PASS');
process.exit(fails.length || errs.length ? 1 : 0);
