/* Render the Pricing Engine page as Brent will actually see it — desktop and
   phone — with /api/pricing served from the real database rows. */
import http from 'node:http';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = '/agent/workspace/knect-pricing';
const KEY = process.env.SUPA_KEY;
const SUPA = 'https://jsdwvogsxlnczzbefwgp.supabase.co/rest/v1/tier_config';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/pricing') {                     /* the real function's job */
    /* Normally we read the live row. When the raw database key is not in this
       container, pass the row in with SNAPSHOT=<file> — the same bytes read back
       out of the database — so the page is still rendered against real data
       rather than a hand-written fixture. */
    let rec;
    if (process.env.SNAPSHOT) {
      rec = JSON.parse(fs.readFileSync(process.env.SNAPSHOT, 'utf8'))[0];
    } else {
      const r = await fetch(SUPA + '?scope=eq.pricing_matrix&is_active=is.true&select=code,value,updated_at&limit=1', { headers: H });
      const d = await r.json();
      rec = d[0];
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, version: rec.value.version, effectiveFrom: rec.value.effectiveFrom,
      lockedBy: rec.value.lockedBy, updatedAt: rec.updated_at, config: rec.value.config, rates: [] }));
  }
  const f = ROOT + (u.pathname === '/' ? '/index.html' : u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  const t = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html';
  res.writeHead(200, { 'Content-Type': t }); res.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(8799, r));

const b = await chromium.launch({ executablePath: '/agent/home/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--no-sandbox'] });
const errs = [];
let fail = 0;
const ok = (n, c) => { console.log((c ? '  ✓ ' : '  ✗ ') + n); if (!c) fail++; };

for (const [name, vp] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  p.on('pageerror', e => errs.push(name + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
  p.on('response', r => { if (r.status() === 404) console.log('    404 -> ' + r.url()); });
  await p.goto('http://localhost:8799/', { waitUntil: 'networkidle' });

  /* in as Brent's owner login, in Super Admin mode */
  await p.evaluate(() => { try { enterKnectApp('BF638793'); enterMode('admin'); } catch (e) {} });
  /* measure the shell's own overflow on an untouched tab first, as the baseline */
  await p.evaluate(() => { try { switchTab('pane-admin'); } catch (e) {} });
  await p.waitForTimeout(600);
  const baseline = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await p.evaluate(() => { try { switchTab('pane-pricing'); } catch (e) {} });
  await p.waitForTimeout(1400);

  const r = await p.evaluate(() => {
    const q = i => document.getElementById(i);
    const txt = i => (q(i) ? q(i).innerText.trim() : '');
    return {
      visible: !!q('pane-pricing') && q('pane-pricing').classList.contains('on'),
      vehicleRows: q('px-vehicles') ? q('px-vehicles').querySelectorAll('input').length : 0,
      driverRows: q('px-driver') ? q('px-driver').querySelectorAll('input').length : 0,
      accRows: q('px-account') ? q('px-account').querySelectorAll('input').length : 0,
      jobRows: q('px-jobtypes') ? q('px-jobtypes').querySelectorAll('input').length : 0,
      meta: txt('px-meta'), result: txt('px-result'),
      source: window.HAF_PRICING_SOURCE,
      smallVanRate: window.VAN ? null : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });

  r.baseline = baseline;
  console.log('\n' + name + ' (' + vp.width + 'px)  shell baseline overflow: ' + baseline + 'px');
  ok('the page opens from the owner menu', r.visible);
  ok('eight vehicles, rate and minimum each (16 boxes)', r.vehicleRows === 16);
  ok('three driver reward boxes', r.driverRows === 3);
  ok('three account reduction boxes', r.accRows === 3);
  ok('five job types, fee and floor each (10 boxes)', r.jobRows === 10);
  ok('it says the rates came from the database', /database/i.test(r.meta) && r.source === 'database');
  ok('the test quote prices on open', /Customer pays/i.test(r.result) && /£/.test(r.result));
  /* The app shell already scrolls 56px sideways at 390px on EVERY tab — the
     Network Overview and Network Pools do it too. That is a pre-existing shell
     bug, not this page's, and it is reported separately. What this page must
     not do is make it any worse. */
  ok('the page is no wider than the rest of the app at this width', r.overflow <= r.baseline);

  /* type a new rate and prove the quote moves */
  const before = await p.evaluate(() => document.getElementById('px-result').innerText);
  await p.fill('#px-v-rate-3', '1.60');
  await p.waitForTimeout(350);
  const after = await p.evaluate(() => document.getElementById('px-result').innerText);
  ok('changing a rate re-prices the test job straight away', before !== after);

  /* a deliberately bad edit must be caught in plain words */
  await p.fill('#px-v-rate-3', '0.10');
  await p.waitForTimeout(350);
  const warn = await p.evaluate(() => {
    const b = document.getElementById('px-problems');
    return { shown: b && b.style.display !== 'none', text: b ? b.innerText : '' };
  });
  ok('a rate that breaks the ladder is caught before saving', warn.shown && /lower|less/i.test(warn.text));

  await p.screenshot({ path: '/tmp/px_' + name + '.png', fullPage: true });
  await p.close();
}
await b.close(); srv.close();
console.log('\nPage errors: ' + (errs.length ? '\n  ' + errs.join('\n  ') : 'none'));
console.log(fail ? '\nRENDER FAILURES: ' + fail : '\nRENDER ALL PASS');
process.exit(fail || errs.length ? 1 : 0);
