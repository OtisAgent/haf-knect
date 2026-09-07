/* ══════════════════════════════════════════════════════════════════════════
   THE SAME TICKET ON A PHONE, AND ON THE DRIVER'S BOARD

   Two things the desktop walkthrough cannot answer.

   1. A driver reads the job on a phone. If the ticket only works at 1280px it
      does not work at all, so the whole journey is walked again at 390px and
      the card is looked at rather than merely counted.

   2. What a REAL driver saw on the open-jobs board until today was a
      reference, two postcodes, a date, a notes blob and a first name — the rich
      four-stat cards on that screen are the walkthrough's sample and a real
      account never saw them. The board now draws the same consignment ticket,
      so this stands a job in front of it and reads what comes out.

      The network reply is stubbed HERE ON PURPOSE. This is a test of the
      RENDERER — given a job, does the driver read the whole job. Whether the
      network sends those fields is the database's half of the change and is
      proved separately; a stub can never prove that and is not claimed to.
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

/* ── 1 · THE PHONE ──────────────────────────────────────────────────────── */
const ph = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, deviceScaleFactor: 2 });
const errs = [];
ph.on('pageerror', e => errs.push(String(e.message || e)));
await ph.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await ph.waitForTimeout(1200);
await ph.evaluate(() => { viewAsMember('business', false); switchTab('pane-b-book'); });
await ph.waitForTimeout(400);
await ph.click('#post-submit');
await ph.waitForTimeout(400);
await ph.fill('#fq-from', 'S9 1AA'); await ph.fill('#fq-to', 'LS1 1AA');
await ph.click('#fq-1 .btn-or'); await ph.waitForTimeout(250);
await ph.click('#fq-wt .oopt'); await ph.click('#fq-sz .oopt');
await ph.fill('#fq-goods', '2 pallets of machinery parts');
await ph.fill('#fq-qty', '2');
await ph.click('#fq-2 .fnav .btn-or'); await ph.waitForTimeout(250);
await ph.click('#fq-3 .fnav .btn-or'); await ph.waitForTimeout(250);
await ph.evaluate(() => { const b = document.querySelector('#fq-4 .oopt'); if (b) b.click(); });
await ph.fill('#fq-cdate', new Date(Date.now() + 864e5).toISOString().slice(0, 10));
await ph.fill('#fq-ctime', '07:30');
await ph.fill('#fq-dreq', 'before 15:00, book in on arrival');
await ph.click('#fq-4 .fnav .btn-or'); await ph.waitForTimeout(250);
await ph.fill('#fq-caddr', '12 Attercliffe Road, Sheffield S9 1AA');
await ph.fill('#fq-daddr', '8 Wellington Street, Leeds LS1 1AA');
await ph.click('#fq-5 .fnav .btn-or'); await ph.waitForTimeout(2500);

ok(await ph.isVisible('#fq-6'), 'the whole journey walks on a phone');
const mt = await ph.evaluate(() => {
  const t = document.querySelector('#fq-jobcard .jobt');
  if (!t) return null;
  const r = t.getBoundingClientRect();
  return { text: t.innerText.toLowerCase(), w: Math.round(r.width),
           over: r.right > window.innerWidth + 1 };
});
ok(mt !== null, 'the ticket draws on a phone');
if (mt) {
  ok(!mt.over, 'nothing runs off the side of the screen (card ' + mt.w + 'px in 390px)');
  ok(mt.text.includes('07:30'), 'the collection window is on the phone card');
  ok(mt.text.includes('15:00'), 'the delivery requirement is on the phone card');
  ok(mt.text.includes('machinery'), 'the goods are on the phone card');
}
await ph.screenshot({ path: '_consign_ticket_phone.png', fullPage: false });

/* ── 2 · THE DRIVER'S BOARD ─────────────────────────────────────────────── */
const dp = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
dp.on('pageerror', e => errs.push(String(e.message || e)));
await dp.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await dp.waitForTimeout(1000);

/* One job, shaped as the handover will send it, stood in front of the renderer. */
const boardHTML = await dp.evaluate(() => consignmentTicket({
  ref: 'HAF-20260908-4K2P9X',
  jobType: 'Same-day',
  isDirect: true,
  route: 'Sheffield S9 → Manchester M1',
  collection: '12 Attercliffe Road, Sheffield S9 1AA',
  delivery: '40 Deansgate, Manchester M1 1AA',
  collectWindow: '08:00 onwards, Mon 8 Sep',
  deliverWindow: 'must be on site before 16:00',
  collectNote: 'Goods-in at the rear, ring the buzzer',
  vehicle: 'Long wheelbase',
  miles: '42 mi', drive: '1h 3m', weight: '580 kg', pay: '£96',
  goods: '3 pallets of boxed retail stock', quantity: '3 pallets',
  dims: '1.2m × 1.0m × 1.5m',
  handlingKeys: ['tail', 'nostack', 'forkc'],
  notes: 'Pallets cannot be stacked.',
  footer: 'You have first refusal on this one.'
}));
const b = boardHTML.toLowerCase();
ok(b.includes('haf-20260908'), 'the driver sees the HAF reference');
ok(b.includes('yours first'), 'first refusal is marked on the card');
ok(b.includes('08:00') && b.includes('16:00'), 'the driver sees BOTH time windows');
ok(b.includes('42 mi') && b.includes('1h 3m'), 'distance and drive time are on it');
ok(b.includes('&#163;96') || b.includes('£96'), 'the driver sees what the job pays');
ok(b.includes('attercliffe') && b.includes('deansgate'), 'both door-level addresses are on it');
ok(b.includes('pallet'), 'the goods are on it');
ok(b.includes('1.2m'), 'the dimensions are on it');
ok(b.includes('tail lift') || b.includes('tail'), 'the tail lift requirement is on it');
ok(b.includes('buzzer'), 'the collection instruction is on it');
ok(!/07\d{3}\s?\d{6}|\+44/.test(b), 'no phone number is on an open-board card');

/* The board repaints itself from the network on entry, and asynchronously — so
   the tab is opened FIRST, that paint is allowed to finish and fail (there is no
   network here), and only then is the job stood in front of the renderer.
   Injecting before the paint lands is a screenshot of nothing. */
await dp.evaluate(() => { viewAsMember('driver', true); switchTab('pane-d-jobs'); });
await dp.waitForTimeout(1500);
ok(await dp.isVisible('#pane-d-jobs'), 'the open-jobs board opens');
await dp.evaluate(h => { document.getElementById('dj-live').innerHTML = h; }, boardHTML);
await dp.waitForTimeout(300);
ok(await dp.isVisible('#dj-live .jobt'), 'the ticket is on the board a driver looks at');
await dp.evaluate(() => document.querySelector('#dj-live .jobt')
                          .scrollIntoView({block:'center'}));
await dp.waitForTimeout(250);
await dp.screenshot({ path: '_consign_board.png', fullPage: false });

ok(errs.length === 0, 'nothing threw' + (errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''));

await browser.close();
server.close();
console.log('\n' + pass.map(p => '  ok   ' + p).join('\n'));
if (fail.length) console.log('\n' + fail.map(f => '  FAIL ' + f).join('\n'));
console.log('\n%d passed, %d failed\n', pass.length, fail.length);
process.exit(fail.length ? 1 : 0);
