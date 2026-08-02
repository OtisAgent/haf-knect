/* A picture of the revenue view as it is DEPLOYED.

   The owner gate rejects a stand-in credential within a second or two — right
   behaviour, but it means a screenshot taken against the live URL captures a
   sign-in box, not the work. So this pulls the PRODUCTION bytes down, serves
   them locally, opens the gate the way a signed-in owner would, and captures
   that. What is photographed is exactly what is deployed; only the sign-in
   round-trip is stood down.

     node tools/revenue-live-shot.mjs
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'https://knect.usehaf.co.uk';
const DIR = '/tmp/_revshot';
const FILES = ['admin/index.html', 'admin/pricing-matrix-v3.js', 'admin/revenue-model-v1.js',
               'admin/lane-factors-v1.js', 'admin/account-fees-v1.js', 'admin/tier-identity-v1.js',
               'admin/tier-marks-v1.js', 'admin/pro-crown.js', 'uk-regions.js'];

fs.rmSync(DIR, { recursive: true, force: true });
for (const f of FILES) {
  const r = await fetch(BASE + '/' + f);
  if (!r.ok) { console.log('  · skipped ' + f + ' (' + r.status + ')'); continue; }
  const body = await r.text();
  if (f.endsWith('.js') && /^\s*<!DOCTYPE/i.test(body)) { console.log('  · skipped ' + f + ' (not deployed)'); continue; }
  fs.mkdirSync(path.join(DIR, path.dirname(f)), { recursive: true });
  fs.writeFileSync(path.join(DIR, f), body);
  console.log('  · pulled ' + f + '  ' + body.length + ' bytes');
}

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let f = DIR + (u.pathname.endsWith('/') ? u.pathname + 'index.html' : u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(8822, r));

const b = await chromium.launch({
  executablePath: '/agent/home/.cache/ms-playwright/chromium-1140/chrome-linux/chrome',
  args: ['--no-sandbox']
});

for (const [label, w, h] of [['desktop', 1440, 1400], ['phone', 390, 1200]]) {
  const page = await b.newPage({ viewport: { width: w, height: h } });
  await page.goto('http://127.0.0.1:8822/admin/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const shown = await page.evaluate(() => {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    if (typeof pmRows === 'function') pmRows();
    const first = document.querySelector('#pm-tbl .ebtn');
    if (first) first.click();
    const el = document.getElementById('pm-revenue');
    if (el) el.scrollIntoView({ block: 'center' });
    return !!(el && el.querySelectorAll('tbody tr').length === 4);
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `_rev_shot_${label}.png`, fullPage: false });
  console.log(`  · ${label}: revenue panel present = ${shown} → _rev_shot_${label}.png`);
  await page.close();
}

await b.close();
srv.close();
