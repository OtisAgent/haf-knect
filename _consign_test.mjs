/* ══════════════════════════════════════════════════════════════════════════
   THE HAF CONSIGNMENT — does the one journey actually reach the dashboard?

   Brent, 7 Sep 2026: the order flow on Post a Job has to be effective and
   simple, the information has to be shown, and the order has to be unique to
   the HAF concept.

   What was there was eleven boxes wired to nothing. So this does not check that
   a form "renders" — it checks the things that were actually broken:

     · Post a Job opens the REAL consignment journey, not a second form;
     · every stage the public journey has is reachable from the dashboard;
     · the four details the old form never asked for — collection window,
       delivery requirement, quantity and dimensions — are on it;
     · stage six draws the whole ticket, with the route, both windows, the
       distance and the load, and NOT a bare list;
     · the account-only decisions appear when docked and are SHUT again when
       the journey goes back to the public page — a public visitor must never
       inherit "my drivers only";
     · nothing throws on the way through.
   ══════════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { extname, join, normalize } from 'path';

const ROOT = process.cwd();
const TYPE = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer((rq, rs) => {
  let p = normalize(decodeURIComponent(rq.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  const f = join(ROOT, p);
  try {
    if (statSync(f).isDirectory()) throw 0;
    rs.writeHead(200, { 'content-type': TYPE[extname(f)] || 'application/octet-stream' });
    rs.end(readFileSync(f));
  } catch { rs.writeHead(404); rs.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const pass = [], fail = [];
const ok = (c, m) => (c ? pass : fail).push(m);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

/* A thrown error is a failure whether or not the screen still looks right — the
   old form looked perfect and did nothing. */
const errors = [];
page.on('pageerror', e => errors.push(String(e.message || e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
/* This little server holds the repo and nothing else. The edge functions and the
   brand assets live on Cloudflare, so a 404 for one of them here says nothing
   about the page — it is recorded separately and NOT counted as a fault. */
const missing = [];
page.on('requestfailed', r => missing.push(r.url()));
page.on('response', r => { if (r.status() === 404) missing.push(r.url()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

/* ── in as a business account, straight to Post a Job ── */
await page.evaluate(() => { viewAsMember('business', false); switchTab('pane-b-book'); });
await page.waitForTimeout(400);

ok(await page.isVisible('#post-hafway'), 'the HAF way strip is on the posting screen');
ok((await page.textContent('#post-hafway')).includes('Priced, never bid'),
   'it says the price is not bid for');
ok(await page.isVisible('#post-start'), 'there is one door in');

/* ── dock the journey ── */
await page.click('#post-submit');
await page.waitForTimeout(500);

ok(await page.evaluate(() =>
     document.getElementById('post-flow-host').contains(document.getElementById('inline-flow'))),
   'the one consignment journey is docked inside Post a Job');
ok(!await page.isVisible('#post-start'), 'the door closes behind it');
ok(await page.isVisible('#fq-1'), 'stage one is showing');

/* ── the four details the old form never asked for ── */
const fields = {
  'fq-ctime': 'a collection time',
  'fq-dreq': 'a delivery requirement',
  'fq-qty': 'how many',
  'fq-dl': 'dimensions',
};
for (const [id, what] of Object.entries(fields)) {
  ok(await page.$('#' + id) !== null, 'it asks for ' + what);
}

/* ── the account-only decisions are revealed, and the public ones are not ── */
const shown = id => page.evaluate(sel => {
  const el = document.querySelector(sel);
  return !!el && !el.hasAttribute('data-off');
}, id);
ok(await shown('#inline-flow [data-post-only="account"]'),
   'a signed-in poster is asked who may accept the job');
ok(!await shown('#inline-flow [data-post-only="resale"]'),
   'a business account is NOT asked for a client sell rate');

/* ── walk it, stage by stage, exactly as a customer would ── */
await page.fill('#fq-from', 'S9 1AA');
await page.fill('#fq-to', 'M1 1AA');
await page.click('#fq-1 .btn-or');
await page.waitForTimeout(300);
ok(await page.isVisible('#fq-2'), 'stage two — what are we collecting');

await page.click('#fq-wt .oopt');
await page.click('#fq-sz .oopt');
await page.fill('#fq-goods', '3 pallets of boxed retail stock, shrink wrapped');
await page.fill('#fq-qty', '3');
await page.selectOption('#fq-unit', { index: 1 }).catch(() => {});
await page.fill('#fq-dl', '120'); await page.fill('#fq-dw', '100'); await page.fill('#fq-dh', '150');
await page.fill('#fq-notes', 'Pallets cannot be stacked. Collection is round the back.');
await page.click('#fq-2 .fnav .btn-or');
await page.waitForTimeout(300);
ok(await page.isVisible('#fq-3'), 'stage three — which van');

await page.click('#fq-3 .fnav .btn-or');
await page.waitForTimeout(300);
ok(await page.isVisible('#fq-4'), 'stage four — when');

/* THE STAGE THE OLD POSTING FORM DID NOT HAVE AT ALL. */
await page.evaluate(() => {
  const b = document.querySelector('#fq-4 .oopt'); if (b) b.click();
});
const d = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
await page.fill('#fq-cdate', d);
await page.fill('#fq-ctime', '08:00');
await page.fill('#fq-dreq', 'must be on site before 16:00');
await page.click('#fq-4 .fnav .btn-or');
await page.waitForTimeout(300);
ok(await page.isVisible('#fq-5'), 'stage five — the full addresses');

await page.fill('#fq-caddr', '12 Attercliffe Road, Sheffield S9 1AA');
await page.fill('#fq-daddr', '40 Deansgate, Manchester M1 1AA');
await page.fill('#fq-cname', 'Goods-in'); await page.fill('#fq-cphone', '07700 900123');
await page.fill('#fq-cnote', 'Ring the buzzer at the rear');
await page.fill('#fq-dname', 'Reception'); await page.fill('#fq-dphone', '07700 900456');
await page.click('#fq-5 .fnav .btn-or');
await page.waitForTimeout(2500);
ok(await page.isVisible('#fq-6'), 'stage six — the price and the card');

/* ── THE TICKET. This is the whole point of the change. ── */
const ticket = await page.evaluate(() => {
  const t = document.querySelector('#fq-jobcard .jobt');
  return t ? t.innerText : null;
});
ok(ticket !== null, 'stage six draws the consignment ticket, not a bare list');
if (ticket) {
  const t = ticket.toLowerCase();
  ok(t.includes('collect from') && t.includes('deliver to'), 'the ticket has both legs');
  ok(t.includes('08:00'), 'the collection window is ON the card');
  ok(t.includes('16:00'), 'the delivery requirement is ON the card');
  ok(t.includes('attercliffe'), 'the door-level collection address is on it');
  ok(t.includes('deansgate'), 'the door-level delivery address is on it');
  ok(/\d+\s*mi/.test(t), 'the distance is on it');
  ok(/\d+h|\dm\b/.test(t), 'the drive time is on it');
  ok(t.includes('pallet'), 'the goods the customer described are on it');
  ok(t.includes('1.2m') || t.includes('m ×') || t.includes('largest item'),
     'the dimensions are on it');
  ok(t.includes('vehicle'), 'the vehicle it needs is on it');
  ok(t.includes('buzzer'), 'the collection instruction reaches the driver');
}
const priced = await page.textContent('#fq-pr-range');
ok(/£\d/.test(priced), 'a real price is shown before they commit — it says ' + priced.trim());

await page.screenshot({ path: '_consign_ticket.png', fullPage: false });

/* ── leaving takes the journey home and SHUTS the account decisions ── */
await page.evaluate(() => switchTab('pane-d-home'));
await page.waitForTimeout(300);
ok(await page.evaluate(() =>
     !document.getElementById('post-flow-host').contains(document.getElementById('inline-flow'))),
   'leaving Post a Job puts the journey back for the public page');
ok(await page.evaluate(() =>
     document.querySelector('#inline-flow [data-post-only="account"]').hasAttribute('data-off')),
   'the account-only decisions are shut again — a public visitor never inherits them');

/* ── and the public journey still works on its own ── */
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
await page.evaluate(() => openFlow('fast'));
await page.waitForTimeout(200);
ok(await page.isVisible('#fq-1'), 'the public order journey is untouched');
ok(await page.evaluate(() =>
     document.querySelector('#inline-flow [data-post-only="account"]').hasAttribute('data-off')),
   'and a stranger is never shown the account decisions');

const real = errors.filter(e => !/Failed to load resource/.test(e));
console.log('\n  (not served locally: ' + [...new Set(missing.map(u => u.replace(BASE, '')))].join(', ') + ')');
ok(real.length === 0, 'nothing threw' + (real.length ? ' — ' + real.slice(0, 3).join(' | ') : ''));

await browser.close();
server.close();

console.log('\n' + pass.map(p => '  ok   ' + p).join('\n'));
if (fail.length) console.log('\n' + fail.map(f => '  FAIL ' + f).join('\n'));
console.log('\n%d passed, %d failed\n', pass.length, fail.length);
process.exit(fail.length ? 1 : 0);
