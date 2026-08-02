/* THE LOAD PICKER — how heavy / how much, and the van it lands on.
   Drives the real page in a real browser at desktop and phone widths, on every
   one of the three ways a customer can reach a quote. Nothing is asserted from
   reading the source: every check reads what the browser actually rendered. */
import http from 'node:http';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = '/agent/workspace/knect-pricing';
const KEY = process.env.SUPA_KEY;
const SUPA = 'https://jsdwvogsxlnczzbefwgp.supabase.co/rest/v1/tier_config';

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/pricing') {
    if (!KEY) { res.writeHead(503); return res.end('{}'); }   /* built-in rates stand */
    const r = await fetch(SUPA + '?scope=eq.pricing_matrix&is_active=is.true&select=code,value,updated_at&limit=1',
      { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
    const rec = (await r.json())[0];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, config: rec.value.config, version: rec.value.version, updatedAt: rec.updated_at }));
  }
  const f = ROOT + (u.pathname === '/' ? '/index.html' : u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  const t = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html';
  res.writeHead(200, { 'Content-Type': t }); res.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(8801, r));

const b = await chromium.launch({ executablePath: '/agent/home/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--no-sandbox'] });
let fail = 0, pass = 0;
const errs = [];
const ok = (n, c, extra) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (extra ? '  → ' + extra : '')); } };

for (const [w, vp] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
  console.log('\n── ' + w + ' ──');
  const p = await b.newPage({ viewport: vp });
  p.on('pageerror', e => errs.push(w + ': ' + e.message));
  p.on('console', m => {
    const t = m.text();
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(t)) return;   /* local harness has no static assets */
    errs.push(w + ' console: ' + t);
  });
  await p.goto('http://localhost:8801/', { waitUntil: 'networkidle' });

  /* ── 1. BOTH TILES ARE THERE, DRAWN, AND READABLE ── */
  const shape = await p.evaluate(() => {
    const g = id => [...document.querySelectorAll('#' + id + ' .lp-tile')].map(t => ({
      name: t.querySelector('.lp-tile-n').textContent,
      sub: t.querySelector('.lp-tile-s').textContent,
      svg: !!t.querySelector('svg'),
      filled: t.querySelectorAll('svg .fill').length
    }));
    return { wt: g('wt-pills'), sz: g('sz-pills'), noteHidden: document.getElementById('ld-note').style.display === 'none' };
  });
  ok('five weight bands', shape.wt.length === 5, shape.wt.length);
  ok('five size bands', shape.sz.length === 5, shape.sz.length);
  ok('weight bands are Brent\'s five', shape.wt.map(x => x.name).join('|') === 'Up to 50 kg|Up to 100 kg|Up to 250 kg|Up to 500 kg|1 tonne +', shape.wt.map(x => x.name).join('|'));
  ok('sizes start at small box and end at a full van load', shape.sz[0].name === 'Small box' && shape.sz[4].name === 'Full van load');
  ok('every tile is drawn, not just worded', [...shape.wt, ...shape.sz].every(t => t.svg));
  ok('every tile carries an everyday comparison', [...shape.wt, ...shape.sz].every(t => t.sub.length > 5));
  ok('no tile asks for a measurement', ![...shape.wt, ...shape.sz].some(t => /cm|metre|m³|inch|cubic|dimension/i.test(t.sub)));
  ok('the heaviness gauge fills up 1→5', shape.wt.map(t => t.filled).join(',') === '1,2,3,4,5', shape.wt.map(t => t.filled).join(','));
  ok('nothing is explained before it is asked', shape.noteHidden);

  /* ── 2. THE TWO ANSWERS PICK THE VAN ── */
  const pick = async (wt, sz) => p.evaluate(([a, b2]) => {
    const t = (row, k) => document.querySelector('#' + row + ' [data-' + (row === 'wt-pills' ? 'wt' : 'sz') + '="' + k + '"]');
    if (a) t('wt-pills', a).click();
    if (b2) t('sz-pills', b2).click();
    const sel = document.querySelector('#van-pills .vp.sel');
    return {
      van: sel ? sel.dataset.van : null,
      note: document.getElementById('ld-note').innerText,
      noteShown: document.getElementById('ld-note').style.display !== 'none',
      warn: document.getElementById('ld-note').classList.contains('warn'),
      tooSmall: [...document.querySelectorAll('#van-pills .vp.toosmall')].map(v => v.dataset.van),
      key: window.selVanKey
    };
  }, [wt, sz]);

  const a = await pick('w50', 's1');
  ok('50 kg in a small box → the cheapest van', a.van === 'small', a.van);
  ok('the answer is explained in words', a.noteShown && /Small van/.test(a.note), a.note);

  const c = await pick('w500', 's3');
  ok('500 kg on one pallet → SWB', c.van === 'swb', c.van);
  ok('the small van is marked as too small', c.tooSmall.includes('small'));

  const d = await pick('w1000', 's5');
  ok('a tonne filling the van → a Luton', d.van === 'luton', d.van);
  ok('everything under a Luton is marked too small', ['small', 'swb', 'mwb', 'lwb', 'xlwb'].every(k => d.tooSmall.includes(k)));
  ok('and the open-ended tonne is spelled out', /open-ended/.test(d.note), d.note);
  ok('a Luton at a tonne is never told to "step up" to a smaller body', !/step up to the (LWB|XLWB|MWB|SWB|Small)/.test(d.note), d.note);

  const e = await pick('w50', 's5');
  ok('light but bulky still gets a big van', e.van === 'luton', e.van);
  ok('a light full load is not warned about weight', !/open-ended/.test(e.note), e.note);

  const f2 = await pick('w1000', 's1');
  ok('heavy but small still gets the payload', f2.van === 'mwb', f2.van);
  ok('over a tonne in a small body points at a genuinely bigger van', /step up to the LWB/.test(f2.note), f2.note);
  const f3 = await pick('w1000', 's4');
  ok('and the biggest-payload van is reachable from the note', /step up to the XLWB/.test(f3.note), f3.note);

  const tl = await pick('w500', 's4');
  ok('heavy on pallets warns about the tail lift', /tail lift/i.test(tl.note), tl.note);
  const notl = await pick('w50', 's1');
  ok('a light parcel is not nagged about a tail lift', !/tail lift/i.test(notl.note), notl.note);

  /* ── 3. THE CUSTOMER CAN STILL OVERRULE US, AND IS TOLD IF THEY ARE WRONG ── */
  const over = await p.evaluate(() => {
    document.querySelector('#wt-pills [data-wt="w1000"]').click();
    document.querySelector('#sz-pills [data-sz="s5"]').click();
    document.querySelector('#van-pills [data-van="small"]').click();
    const n = document.getElementById('ld-note');
    const sel=document.querySelector('#van-pills .vp.sel');
    return { key: sel ? sel.dataset.van : null, note: n.innerText, warn: n.classList.contains('warn') };
  });
  ok('a hand-picked van is honoured', over.key === 'small', over.key);
  ok('and the customer is told plainly it will not fit', over.warn && /will not take/i.test(over.note), over.note);
  const reset = await pick('w50', 's1');
  ok('changing the load hands the van choice back to HAF', reset.van === 'small' && !reset.warn);

  /* ── 4. THE PRICE ACTUALLY MOVES WITH THE ANSWERS ── */
  const priced = await p.evaluate(async () => {
    document.getElementById('pc-from').value = 'M1 1AA';
    document.getElementById('pc-to').value = 'LS1 1AA';
    const read = async (wt, sz) => {
      document.querySelector('#wt-pills [data-wt="' + wt + '"]').click();
      document.querySelector('#sz-pills [data-sz="' + sz + '"]').click();
      await calcLivePrice();
      return { range: document.getElementById('lp-range').textContent, info: document.getElementById('lp-info').textContent };
    };
    return { small: await read('w50', 's1'), big: await read('w1000', 's5') };
  });
  const num = s => Number((s.match(/£(\d+)/) || [])[1] || 0);
  ok('a small parcel is priced', num(priced.small.range) > 0, priced.small.range);
  ok('a full van load costs more than a small box', num(priced.big.range) > num(priced.small.range), priced.small.range + ' vs ' + priced.big.range);
  ok('the price line names the van we chose', /Small van/.test(priced.small.info) && /Luton/.test(priced.big.info), priced.small.info);

  /* ── 5. FAST QUOTE ASKS THE SAME TWO QUESTIONS FIRST ── */
  const fq = await p.evaluate(() => {
    openFlow('fast');
    const step = () => document.querySelector('#if-fast .fstep.on').id;
    const out = { wt: document.querySelectorAll('#fq-wt .oopt').length, sz: document.querySelectorAll('#fq-sz .oopt').length };
    fqNext(2); out.blocked = step() === 'fq-1';
    out.err = document.getElementById('fq-err-1').textContent;
    document.querySelectorAll('#fq-wt .oopt')[4].click();   /* 1 tonne + */
    document.querySelectorAll('#fq-sz .oopt')[4].click();   /* full van load */
    fqNext(2); out.moved = step() === 'fq-2';
    const sel = document.querySelector('#fq-van .oopt.sel');
    out.preselected = sel ? sel.dataset.van : null;
    out.note = document.getElementById('fq-note').innerText;
    out.tooSmall = document.querySelectorAll('#fq-van .oopt.toosmall').length;
    closeInlineFlow();
    return out;
  });
  ok('fast quote asks weight first, five bands', fq.wt === 5, fq.wt);
  ok('fast quote asks size, five bands', fq.sz === 5, fq.sz);
  ok('it will not move on until both are answered', fq.blocked && /how heavy/i.test(fq.err), fq.err);
  ok('it moves on once they are', fq.moved);
  ok('the van step opens with the right van already chosen', fq.preselected === 'luton', fq.preselected);
  ok('and says why in plain words', /Luton/.test(fq.note), fq.note);
  ok('vans that cannot take it are marked there too', fq.tooSmall === 5, fq.tooSmall);

  /* ── 6. HELP ME PICK USES THE SAME ENGINE ── */
  const hp = await p.evaluate(async () => {
    openFlow('pick');
    const out = { wt: document.querySelectorAll('#hp-wt .oopt').length, sz: document.querySelectorAll('#hp-sz .oopt').length };
    hpNext(2); out.blocked = document.querySelector('#if-pick .fstep.on').id === 'hp-1';
    document.querySelectorAll('#hp-wt .oopt')[3].click();    /* up to 500 kg */
    document.querySelectorAll('#hp-sz .oopt')[2].click();    /* one pallet   */
    hpNext(2); out.moved = document.querySelector('#if-pick .fstep.on').id === 'hp-2';
    document.getElementById('hp-from').value = 'M1 1AA';
    document.getElementById('hp-to').value = 'LS1 1AA';
    await hpEstimate();
    out.rec = document.getElementById('hp-van-rec').textContent;
    closeInlineFlow();
    return out;
  });
  ok('help-me-pick asks the same two questions', hp.wt === 5 && hp.sz === 5, hp.wt + '/' + hp.sz);
  ok('it will not move on until both are answered', hp.blocked);
  ok('500 kg on a pallet recommends the same SWB here', /SWB/.test(hp.rec), hp.rec);

  /* ── 7. IT FITS THE SCREEN ── */
  const fit = await p.evaluate(() => {
    const box = document.querySelector('.calc-box').getBoundingClientRect();
    const tiles = [...document.querySelectorAll('.lp-tile')].map(t => t.getBoundingClientRect());
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      inside: tiles.every(t => t.left >= box.left - 1 && t.right <= box.right + 1),
      tallEnough: tiles.every(t => t.height >= 44),        /* thumb-sized */
      wideEnough: tiles.every(t => t.width >= 60)
    };
  });
  ok('nothing pushes the page sideways', fit.overflow <= 0, fit.overflow);
  ok('every tile sits inside the quote box', fit.inside);
  ok('every tile is big enough to tap', fit.tallEnough && fit.wideEnough);

  await p.screenshot({ path: ROOT + '/_load_' + w + '.png', fullPage: false });
  await p.close();
}

/* ── 8. THE RULE ITSELF: never a smaller van for a bigger load ── */
{
  const p = await b.newPage();
  await p.goto('http://localhost:8801/', { waitUntil: 'networkidle' });
  const grid = await p.evaluate(() => {
    const rows = [];
    WT_BAND.forEach((w, wi) => SZ_BAND.forEach((z, zi) => {
      const k = recommendVan(w.k, z.k);
      rows.push({ wi, zi, k, rank: k ? VAN_ORDER.indexOf(k) : 99, kg: k ? VAN[k].kg : 0, vol: k ? VAN[k].vol : 0, needKg: w.kg, needVol: z.lvl });
    }));
    return rows;
  });
  ok('every one of the 25 combinations gets a van', grid.every(r => r.k), grid.filter(r => !r.k).length + ' unanswered');
  ok('no van is ever recommended that cannot carry the load', grid.every(r => r.kg >= r.needKg && r.vol >= r.needVol));
  const mono = grid.every(r => {
    const heavier = grid.find(x => x.wi === r.wi + 1 && x.zi === r.zi);
    const bigger = grid.find(x => x.wi === r.wi && x.zi === r.zi + 1);
    return (!heavier || heavier.rank >= r.rank) && (!bigger || bigger.rank >= r.rank);
  });
  ok('a heavier or bigger load never drops to a cheaper van', mono);
  console.log('\n  van recommended for each of the 25 answers:');
  const W = ['50kg', '100kg', '250kg', '500kg', '1t+'], Z = ['box', 'boxes', 'pallet', 'pallets', 'vanload'];
  console.log('           ' + Z.map(z => z.padEnd(9)).join(''));
  W.forEach((w, wi) => console.log('  ' + w.padEnd(8) + ' ' + Z.map((_, zi) => (grid.find(r => r.wi === wi && r.zi === zi).k || '—').padEnd(9)).join('')));
  await p.close();
}

/* ── 9. THE VEHICLE CARDS ──
   Brent, 2 Aug, pointing at speedyfreight.com/vehicles: same five facts on every
   vehicle — load space, pallets, max weight — in the same order, drawn not
   written. Everything here is read out of the rendered browser, never the source,
   and every figure is compared back to the vehicle table so a card can never
   drift away from the rates the quote is actually built on. */
for (const [w, vp] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
  console.log('\n── vehicle cards, ' + w + ' ──');
  const p = await b.newPage({ viewport: vp });
  p.on('pageerror', e => errs.push('cards ' + w + ': ' + e.message));
  await p.goto('http://localhost:8801/', { waitUntil: 'networkidle' });
  await p.waitForFunction('typeof openFlow==="function"', null, { timeout: 15000 });

  const read = await p.evaluate(() => {
    const cards = sel => [...document.querySelectorAll(sel)].map(c => ({
      van: c.dataset.van,
      name: (c.querySelector('.vp-n') || {}).textContent || '',
      fits: (c.querySelector('.vp-sub') || {}).textContent || '',
      rows: [...c.querySelectorAll('.vp-row')].map(r => ({ text: r.textContent.trim(), drawn: !!r.querySelector('svg') })),
      box: c.getBoundingClientRect()
    }));
    return {
      front: cards('#van-pills .vp'),
      /* step 2 will not open until both load questions are answered, and a card
         that is not on screen has no size to measure — so answer them first */
      fast: (openFlow('fast'),
             document.querySelectorAll('#fq-wt .oopt')[0].click(),
             document.querySelectorAll('#fq-sz .oopt')[0].click(),
             fqNext(2), cards('#fq-van .oopt')),
      table: VAN_ORDER.map(k => ({ k, n: VAN[k].n, L: VAN[k].L, W: VAN[k].W, H: VAN[k].H, pal: VAN[k].pal, kg: VAN[k].kg })),
      guides: document.querySelectorAll('.van-guide').length,
      overflow: (closeInlineFlow(), document.documentElement.scrollWidth - document.documentElement.clientWidth)
    };
  });

  for (const [where, list] of [['front calculator', read.front], ['fast quote', read.fast]]) {
    ok(where + ': a card for every vehicle', list.length === read.table.length, list.length + ' of ' + read.table.length);
    ok(where + ': the ladder ends at the Luton tail lift',
       list.map(c => c.van).join(',') === read.table.map(v => v.k).join(','), list.map(c => c.van).join(','));
    ok(where + ': every card says what fits in everyday words', list.every(c => c.fits.length > 10 && !/cm|inch|m³|cubic/i.test(c.fits)));
    ok(where + ': every card carries all three spec rows', list.every(c => c.rows.length === 3), list.map(c => c.rows.length).join(','));
    ok(where + ': every spec row is drawn, not an emoji', list.every(c => c.rows.every(r => r.drawn && !/\p{Extended_Pictographic}/u.test(r.text))));
    ok(where + ': the figures match the vehicle table exactly', list.every((c, i) => {
      const v = read.table[i];
      const dim = r => r.replace(/\s/g, '');
      return dim(c.rows[0].text) === (v.L.toFixed(2).replace(/0$/, '') + '×' + v.W.toFixed(2).replace(/0$/, '') + '×' + v.H.toFixed(2).replace(/0$/, '') + 'm')
        && c.rows[1].text === v.pal + (v.pal === 1 ? ' pallet' : ' pallets')
        && c.rows[2].text === v.kg.toLocaleString('en-GB') + ' kg max';
    }), list.map(c => c.rows.map(r => r.text).join('/')).join(' | '));
    ok(where + ': load space only ever grows down the ladder',
       list.every((c, i) => i === 0 || read.table[i].L * read.table[i].W * read.table[i].H >= read.table[i - 1].L * read.table[i - 1].W * read.table[i - 1].H - 1e-9));
    ok(where + ': pallet capacity never goes backwards',
       list.every((c, i) => i === 0 || read.table[i].pal >= read.table[i - 1].pal));
    ok(where + ': every card is big enough to tap', list.every(c => c.box.height >= 44 && c.box.width >= 60));
    ok(where + ': no card is cut off the screen', list.every(c => c.box.left >= -1 && c.box.right <= vp.width + 1));
  }
  ok('both quote paths carry the same guide-figures note', read.guides === 2, read.guides);
  ok('the cards do not push the page sideways', read.overflow <= 0, read.overflow);
  ok('the curtain-side Luton is on the ladder', read.front.some(c => c.van === 'lutonc'));
  ok('and nothing above a Luton is', !read.front.some(c => /artic|flatbed|7\.5|hgv|rigid/i.test(c.name)));

  await p.locator('#van-pills').screenshot({ path: ROOT + '/_vans_' + w + '.png' });
  await p.close();
}

await b.close(); srv.close();
if (errs.length) { console.log('\n  browser errors:'); errs.forEach(e => console.log('   ! ' + e)); }
console.log('\n' + (fail === 0 && errs.length === 0 ? '✓ ALL ' + pass + ' CHECKS PASS' : '✗ ' + fail + ' failed, ' + pass + ' passed, ' + errs.length + ' browser errors'));
process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
