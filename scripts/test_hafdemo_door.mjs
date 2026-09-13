import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const out = [];
/* 1. the code on the end of the link */
await p.goto('https://demo.usehaf.co.uk/?code=HAFDEMO', { waitUntil: 'networkidle' });
await p.waitForSelector('#show.on', { timeout: 20000 }).catch(() => {});
out.push(['one click with the code on the link opens it', await p.isVisible('#show')]);
out.push(['the code is wiped from the address bar', !p.url().includes('HAFDEMO'), p.url()]);
out.push(['the door is gone', !(await p.isVisible('#door'))]);
/* 2. typed by hand, fresh session */
const c2 = await b.newContext();
const q = await c2.newPage();
await q.goto('https://demo.usehaf.co.uk/', { waitUntil: 'networkidle' });
out.push(['a fresh visitor lands on the door', await q.isVisible('#door')]);
await q.click('text=Enter it here');
await q.waitForSelector('#codein', { timeout: 15000 });
await q.fill('#codein', 'HAFDEMO');
await q.click('#enter');
await q.waitForSelector('#show.on', { timeout: 20000 }).catch(() => {});
out.push(['typing HAFDEMO by hand opens it', await q.isVisible('#show')]);
await q.reload({ waitUntil: 'networkidle' });
await q.waitForSelector('#show.on', { timeout: 20000 }).catch(() => {});
out.push(['a refresh mid-call keeps you inside', await q.isVisible('#show')]);
out.push(["HAF's own side is there on the real address", await q.isVisible('#own')]);
const keep = (await q.textContent('#own-keep-FREE') || '').trim();
out.push(['and it is showing figures', /£\d/.test(keep), keep.slice(0, 40)]);
/* 3. a made-up code is still refused */
const c3 = await b.newContext();
const r = await c3.newPage();
await r.goto('https://demo.usehaf.co.uk/?code=NOTACODE', { waitUntil: 'networkidle' });
await r.waitForTimeout(2500);
out.push(['a made-up code is refused', await r.isVisible('#door')]);
await b.close();
let bad = 0;
for (const [n, v, x] of out) { if (!v) bad++; console.log((v ? 'ok   ' : 'FAIL ') + n + (x ? ' — ' + x : '')); }
console.log(`\n${out.length - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
