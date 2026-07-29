/* Track-the-driver — real browser proof, local bytes + a stubbed tracker.
 *
 * What it proves, per account and per width:
 *   1. a posting account has NO map on the live job by default
 *   2. the track portal lists its own jobs and says who is sharing
 *   3. Track is refused while nobody is sharing
 *   4. a fresh position opens the map — and only then
 *   5. Stop tracking takes the map back OUT of the document
 *   6. a feed that goes stale closes the map on its own
 *   7. the driver keeps their own road map, and gets no track portal
 *   8. the network map stays out of the document throughout
 *
 * Run: node tools/_trk_test.mjs
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

/* the stubbed tracker — one row per job, exactly like /api/track returns */
let FEED = {};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/track' && req.method === 'GET') {
    const job = (u.searchParams.get('job') || '').toUpperCase();
    const f = FEED[job];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(f ? Object.assign({ ok: true, found: true }, f) : { ok: true, found: false }));
  }
  if (u.pathname === '/api/track' && req.method === 'POST') {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      try { const p = JSON.parse(b); FEED[(p.job || 'HAF-2858')] = { lat: p.lat, lng: p.lng, kind: p.kind || 'live', label: p.label, ageSec: 0 }; } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (u.pathname === '/api/link') {   /* issuing a private driver link */
    if (req.method === 'POST') { let b = ''; req.on('data', d => b += d); req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, token: 'stubtoken' })); }); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, found: true, job: 'HAF-2858', name: 'James W.', from: 'Sheffield S1', to: 'Leeds LS1' }));
  }
  let p = u.pathname === '/' ? '/index.html' : u.pathname;
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(8799, r));
const BASE = 'http://127.0.0.1:8799/';

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); } };

const browser = await chromium.launch();

async function open(width, height, account) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  /* the access gate is real — fill the code, do not skip it */
  await page.fill('#ag-code', 'HAFLAUNCH');
  await page.evaluate(() => checkGate());
  await page.waitForTimeout(400);
  await page.evaluate(a => demoLogin(a), account);
  await page.waitForTimeout(500);
  await page.evaluate(() => hafOpenJob('HAF-2858'));
  await page.waitForTimeout(900);
  return { ctx, page, errs };
}

const mapCount = p => p.evaluate(() => document.querySelectorAll('#lj-map').length);
const netCount = p => p.evaluate(() => document.querySelectorAll('[data-aud="network"]').length);
const trkText = p => p.evaluate(() => { const b = document.getElementById('lj-trk-body'); return b ? b.innerText : ''; });
const btnState = p => p.evaluate(() => {
  const b = [...document.querySelectorAll('#lj-trk-body button')].find(x => /Track the route|Stop tracking/.test(x.textContent));
  return b ? { label: b.textContent.trim().split('\n')[0], disabled: b.disabled } : null;
});

for (const [w, h, tag] of [[1440, 950, 'desktop'], [390, 844, 'phone']]) {
  for (const [acct, role] of [['DEMO-BIZ', 'business'], ['DEMO-PRO', 'freight']]) {
    console.log(`\n${role.toUpperCase()} @ ${tag} ${w}px`);
    FEED = {};
    const { ctx, page, errs } = await open(w, h, acct);

    ok('no map on the page to start with', (await mapCount(page)) === 0);
    ok('the network map is still out of the document', (await netCount(page)) === 0);
    const t0 = await trkText(page);
    ok('the portal says the driver has not shared yet', /has not shared their location yet/.test(t0), t0.slice(0, 90));
    ok('it names the driver', /James W\./.test(t0));
    const b0 = await btnState(page);
    ok('Track is refused while nobody is sharing', b0 && b0.disabled === true, b0);
    ok('the portal lists this account\'s own jobs', (await page.evaluate(() => document.querySelectorAll('#lj-trk-sel option').length)) >= 3);
    ok('a delivered job is not offered for tracking',
      (await page.evaluate(() => [...document.querySelectorAll('#lj-trk-sel option')].every(o => o.value !== 'HAF-2851'))));

    /* the driver shares — same gateway the phone posts to */
    FEED['HAF-2858'] = { lat: 53.565, lng: -1.492, kind: 'live', label: 'James W.', ageSec: 3 };
    await page.evaluate(() => hafTrackProbe().then(hafTrackRender));
    await page.waitForTimeout(400);
    const b1 = await btnState(page);
    ok('Track opens up the moment they share', b1 && b1.disabled === false, b1);
    ok('the message says they are sharing', /is sharing/.test(await trkText(page)));
    ok('still no map until it is asked for', (await mapCount(page)) === 0);

    await page.evaluate(() => hafTrackStart());
    await page.waitForTimeout(1200);
    ok('pressing Track builds the map', (await mapCount(page)) === 1);
    ok('the route is drawn on it', (await page.evaluate(() => document.querySelectorAll('#lj-map path').length)) >= 2);
    ok('the driver dot is on it', (await page.evaluate(() => document.querySelectorAll('#lj-map .leaflet-marker-icon').length)) >= 3);
    ok('the button becomes Stop tracking', (await btnState(page)).label === 'Stop tracking');
    await page.screenshot({ path: `_trk_${role}_${tag}.png`, fullPage: false });

    await page.evaluate(() => hafTrackStop());
    await page.waitForTimeout(400);
    ok('Stop tracking takes the map back out of the document', (await mapCount(page)) === 0);
    ok('the portal is still there to track again', (await btnState(page)) !== null);

    /* they share, we track, then they go quiet */
    await page.evaluate(() => hafTrackStart());
    await page.waitForTimeout(700);
    ok('tracking again works', (await mapCount(page)) === 1);
    FEED['HAF-2858'] = { lat: 53.565, lng: -1.492, kind: 'live', label: 'James W.', ageSec: 900 };
    await page.evaluate(() => hafTrackProbe().then(hafTrackRender));
    await page.waitForTimeout(500);
    ok('a feed gone quiet closes the map on its own', (await mapCount(page)) === 0);
    ok('and says when they last shared', /last shared/.test(await trkText(page)), (await trkText(page)).slice(0, 90));

    ok('no page errors anywhere in that sequence', errs.length === 0, errs.slice(0, 2));
    await ctx.close();
  }

  console.log(`\nDRIVER @ ${tag} ${w}px`);
  FEED = {};
  const { ctx, page, errs } = await open(w, h, 'DEMO-DRV');
  ok('the driver still has their road map', (await mapCount(page)) === 1);
  ok('the driver gets no track portal', (await page.evaluate(() => !document.getElementById('lj-trk-body'))));
  ok('the driver can still share their location',
    (await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Share my live location/i.test(b.textContent)))));
  ok('no page errors for the driver', errs.length === 0, errs.slice(0, 2));
  await page.screenshot({ path: `_trk_driver_${tag}.png` });
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
