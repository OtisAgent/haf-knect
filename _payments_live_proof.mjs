/* The Payments screen, signed in for real, on the live site.
 *
 * Brent, 9 Sep: "on the HAF KNECT Dashboard on the side bar ... a payments
 * section and inside that section they can make payments to outstanding
 * Invoices and that goes directly to HAF PAY ... list that as a CRM with
 * section of the different types of payments needed."
 *
 * The screen this replaced showed INV-0048 for £241 and "this month £273" to
 * every account that ever signed in. So what has to be proved is not that a
 * page appears — it is that every figure came out of the money database and
 * that none of the old furniture survived.
 *
 * Three passes, because one of them cannot stand on its own:
 *   1. THE DOOR      — who the live endpoint lets in, and who it refuses.
 *   2. THE REAL SCREEN — signed in as the owner, what he actually sees.
 *   3. THE DRAWING   — the same screen handed a full set of money, so the six
 *      sections are proved to render. This one is a RENDERING proof and says
 *      so: no account on the network owes anything today, so pass 2 can only
 *      ever show an empty screen, and an empty screen proves nothing about how
 *      a bill is drawn.
 *
 * Run:  node _payments_live_proof.mjs [url]
 */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
import crypto from 'node:crypto';

const BASE = process.argv[2] || 'https://knect.usehaf.co.uk/';
const USER = 'BF638793';
const PIN  = '0641';                       // his own, already in this repo's e2e tests
const relay = crypto.createHash('sha256').update(`${USER}:${PIN}`).digest('hex');

let pass = 0, fail = 0;
const notes = [];
const ok = (name, cond, detail = '') => {
  if (cond) pass++;
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
};
const money = p => '£' + (Number(p || 0) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── 1. THE DOOR ────────────────────────────────────────────────────────── */
const api = async (path, extra = {}) => {
  const r = await fetch(new URL('/api/' + path, BASE), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, hash: null, relay, cp: relay, ...extra }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const stranger = await fetch(new URL('/api/payments/mine', BASE), {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
});
ok('a caller who is not signed in is refused', stranger.status === 401, String(stranger.status));

const wrongPin = await api('payments/mine', { relay: crypto.createHash('sha256').update(`${USER}:9999`).digest('hex'), cp: null });
ok('a wrong PIN is refused', wrongPin.status === 401, String(wrongPin.status));

const other = await api('payments/mine', { username: 'ZZNOSUCH', relay, cp: relay });
ok('a username that does not exist is refused', other.status === 401, String(other.status));

const mine = await api('payments/mine');
ok('his own credential is let in', mine.status === 200 && mine.body?.ok, JSON.stringify(mine.body).slice(0, 120));
if (!mine.body?.ok) { console.log('the endpoint would not answer — stopping'); process.exit(1); }

const S = mine.body;
console.log('\nWHAT THE MONEY DATABASE SAYS HE OWES');
console.log('  account     :', S.account.username, '·', S.account.account_type);
console.log('  outstanding :', money(S.outstanding_total_pence), 'across', S.outstanding_count, 'item(s)');
for (const s of S.sections) console.log('  ' + (s.lines.length ? '• ' : '  ') + s.l.padEnd(24) + money(s.total_pence) + (s.lines.length ? '  (' + s.lines.length + ')' : ''));
console.log('  settled     :', S.history.length, 'row(s)');

ok('every payment type has its own section', S.sections.length === 6, String(S.sections.length));
ok('the sections come back in a fixed order',
   S.sections.map(s => s.key).join(',') === 'deposit,balance,job,membership,plan,invoice',
   S.sections.map(s => s.key).join(','));
ok('the headline total is the sum of the sections',
   S.outstanding_total_pence === S.sections.reduce((a, s) => a + s.total_pence, 0));
ok('nothing outstanding is missing a section',
   S.outstanding_count === S.sections.reduce((a, s) => a + s.lines.length, 0));
ok('the history holds nothing still awaiting payment',
   !S.history.some(l => l.status === 'awaiting_payment'));

for (const s of S.sections) for (const l of s.lines) {
  ok(`"${l.what}" can be acted on`, Boolean(l.pay_url || l.needs_raising || l.type === 'invoice'), JSON.stringify(l));
  if (l.pay_url) ok(`"${l.what}" pays on HAF PAY, not here`, /\/pay\//.test(l.pay_url) && !/knect\./.test(l.pay_url), l.pay_url);
}

if (!S.outstanding_count && !S.history.length) {
  notes.push('PASS 1 WAS VACUOUS: this account has no money for or against it, so the rules '
    + 'about sections, references and pay links were never actually exercised on real data. '
    + 'Pass 3 draws them instead — and that is a rendering proof, not a data proof.');
}

/* ── 2. THE REAL SCREEN ─────────────────────────────────────────────────── */
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });

const served = await page.content();
console.log('\nWHAT IS SERVED AT ' + BASE);
ok('the demo invoice INV-0048 is gone',        !/>INV-0048</.test(served));
ok('the demo invoice INV-0041 is gone',        !/>INV-0041</.test(served));
ok('the invented "this month" figure is gone', !served.includes('kc-v or">£273'));
ok('the payments screen is the new one',       served.includes('id="py-sections"'));
ok('it is wired to open on the tab',           served.includes("id==='pane-billing'"));
ok('Payments is its own sidebar row',          served.includes("{g:'MONEY', id:'payments'"));

await page.evaluate(async ([u, p]) => {
  await hafAuth(u, p, document.getElementById('l-err'), document.querySelector('#login-ov .btn-wide'));
}, [USER, PIN]);
await page.waitForFunction(() => document.getElementById('super-mode')?.style.display === 'flex', { timeout: 20000 });
await page.evaluate(() => enterMode('personal'));
await page.waitForTimeout(2500);

const nav = await page.evaluate(() => (document.getElementById('nav-list') || {}).innerText || '');
console.log('\nHIS SIDEBAR');
console.log('  ' + nav.replace(/\n/g, ' / '));
ok('Payments is on his sidebar', /(^|\/|\n)\s*Payments\s*($|\/|\n)/.test(nav), JSON.stringify(nav));
ok('and it is one press, not a folder to open',
   await page.evaluate(() => Boolean(document.getElementById('ni-billing'))));

await page.click('#ni-billing');
await page.waitForFunction(() => {
  const t = document.getElementById('py-total');
  return t && t.textContent.trim() !== '—';
}, { timeout: 20000 }).catch(() => {});

const read = () => page.evaluate(() => {
  const t = id => { const e = document.getElementById(id); return e ? e.innerText.trim() : null; };
  return {
    open: document.getElementById('pane-billing')?.classList.contains('on'),
    total: t('py-total'), count: t('py-count'), who: t('py-who'),
    sections: t('py-sections'), history: t('py-history'),
    payLinks: [...document.querySelectorAll('#py-sections a')].map(a => a.href),
  };
});
const seen = await read();

console.log('\nWHAT HE SEES ON THE PAYMENTS SCREEN');
console.log('  outstanding :', seen.total, '·', seen.count, 'item(s) ·', seen.who);
console.log('  sections    :', JSON.stringify((seen.sections || '').replace(/\s+/g, ' ').slice(0, 200)));
console.log('  settled     :', JSON.stringify((seen.history || '').replace(/\s+/g, ' ').slice(0, 160)));

ok('the Payments pane opened',                   seen.open === true);
ok('the total on screen is the total owed',      seen.total === money(S.outstanding_total_pence), `${seen.total} vs ${money(S.outstanding_total_pence)}`);
ok('the count on screen is the count owed',      seen.count === String(S.outstanding_count), `${seen.count} vs ${S.outstanding_count}`);
ok('the screen names the account it is showing', seen.who === S.account.username, String(seen.who));
ok('no invented figure survived on screen',      !/241|273|INV-004/.test((seen.sections || '') + (seen.history || '')));
if (!S.outstanding_count) ok('nothing owed says so plainly',     /Nothing outstanding/i.test(seen.sections || ''), seen.sections);
if (!S.history.length)    ok('nothing paid yet says so plainly', /Nothing yet/i.test(seen.history || ''), seen.history);

await page.screenshot({ path: '_payments_desktop.png' });

/* ── 3. THE DRAWING ─────────────────────────────────────────────────────────
   The same live page, handed a full set of money by intercepting its own call.
   Nothing is written anywhere; this proves the screen draws what it is given,
   which pass 2 cannot while every account is clear. */
const FIX = {
  ok: true,
  account: { username: USER, name: 'Test', account_type: 'freight_forwarder', is_master: true },
  sections: [
    { key: 'deposit', l: 'Job holding deposits', why: 'Holds the job.', total_pence: 13703,
      lines: [{ reference: 'HAFPAY-AAA11111', type: 'deposit', what: 'Holding deposit — HAF-20260909-ABC123', job_ref: 'HAF-20260909-ABC123', route: 'S35 8RF to M1 4BT', amount_pence: 13703, status: 'awaiting_payment', pay_url: 'https://join.usehaf.co.uk/pay/HAFPAY-AAA11111' }] },
    { key: 'balance', l: 'Job balances', why: 'The rest of the price.', total_pence: 24000,
      lines: [{ reference: null, type: 'balance', what: 'Balance on HAF-20260908-ZZZ999', job_ref: 'HAF-20260908-ZZZ999', route: 'LS1 1AA to B1 1AA', amount_pence: 24000, status: 'awaiting_payment', needs_raising: true, pay_url: null }] },
    { key: 'job', l: 'Job payments', why: 'Payment in full.', total_pence: 0, lines: [] },
    { key: 'membership', l: 'Network membership', why: 'One-off membership.', total_pence: 10000,
      lines: [{ reference: 'HAFPAY-9GBW46YV', type: 'membership', what: 'HAF Network membership', job_ref: null, route: null, amount_pence: 10000, status: 'awaiting_payment', pay_url: 'https://join.usehaf.co.uk/pay/HAFPAY-9GBW46YV' }] },
    { key: 'plan', l: 'Plan and subscription', why: 'Your plan.', total_pence: 0, lines: [] },
    { key: 'invoice', l: 'Invoices', why: 'Raised on the HAF books.', total_pence: 54000,
      lines: [{ reference: 'HAFPAY-QYM6JWJA', type: 'invoice', what: 'Invoice INV-1004', job_ref: null, route: null, amount_pence: 54000, status: 'awaiting_payment', due_on: '2026-09-23', pay_url: 'https://join.usehaf.co.uk/pay/HAFPAY-QYM6JWJA' }] },
  ],
  outstanding_total_pence: 101703,
  outstanding_count: 4,
  history: [
    { reference: 'HAFPAY-3BCCE388', type: 'deposit', what: 'Holding deposit — HAF-20260901-QQQ111', amount_pence: 1000, status: 'paid', paid_at: '2026-09-01T10:00:00Z' },
    { reference: 'HAFPAY-8BX25UKC', type: 'deposit', what: 'Holding deposit — HAF-20260830-WWW222', amount_pence: 13703, status: 'cancelled', paid_at: null },
  ],
};

await page.route('**/api/payments/mine', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIX) }));
await page.evaluate(() => pyLoad());
await page.waitForFunction(() => document.getElementById('py-total')?.textContent.trim() === '£1,017.03', { timeout: 15000 }).catch(() => {});
const drawn = await read();

console.log('\nTHE SAME SCREEN, HANDED A FULL SET OF MONEY (rendering proof — nothing written)');
console.log('  outstanding :', drawn.total, '·', drawn.count, 'item(s)');
console.log('  sections    :', JSON.stringify((drawn.sections || '').replace(/\s+/g, ' ').slice(0, 320)));

ok('the headline shows the total it was given',  drawn.total === '£1,017.03', String(drawn.total));
ok('the headline shows the count it was given',  drawn.count === '4', String(drawn.count));
ok('an empty section is not drawn',              !/Job payments|Plan and subscription/.test(drawn.sections || ''));
for (const s of FIX.sections.filter(x => x.lines.length)) {
  ok(`"${s.l}" is drawn`,                        (drawn.sections || '').includes(s.l));
  ok(`"${s.l}" totals ${money(s.total_pence)}`,  (drawn.sections || '').includes(money(s.total_pence)));
}
ok('a job line shows its job and its route',     /HAF-20260909-ABC123/.test(drawn.sections || '') && /S35 8RF to M1 4BT/.test(drawn.sections || ''));
ok('every payable line shows its reference',     ['HAFPAY-AAA11111', 'HAFPAY-9GBW46YV', 'HAFPAY-QYM6JWJA'].every(r => (drawn.sections || '').includes(r)));
ok('an invoice shows when it is due',            /due 2026-09-23/.test(drawn.sections || ''));
ok('a balance with no reference offers to raise one', /Get a payment reference/.test(drawn.sections || ''));
ok('and offers no button to nowhere',            drawn.payLinks.length === 3, JSON.stringify(drawn.payLinks));
ok('every button leaves for HAF PAY',            drawn.payLinks.every(u => /join\.usehaf\.co\.uk\/pay\//.test(u)), JSON.stringify(drawn.payLinks));
ok('a paid item reads as paid, with its date',   /Paid 1 Sep 2026/.test(drawn.history || ''), drawn.history);
ok('a cancelled item is not called paid',        /Cancelled/.test(drawn.history || ''));

await page.screenshot({ path: '_payments_drawn_desktop.png' });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await page.screenshot({ path: '_payments_drawn_phone.png' });

/* A screen that cannot read the money must say so rather than show £0. */
await page.route('**/api/payments/mine', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"the books are unreachable"}' }));
await page.evaluate(() => pyLoad());
await page.waitForTimeout(800);
const broken = await read();
ok('when the money cannot be read it says so',   /could not read/i.test(broken.sections || ''), broken.sections);
ok('and it shows no figure at all',              broken.total === '—' && broken.count === '—', `${broken.total} / ${broken.count}`);

ok('the page threw no script errors', errors.length === 0, errors.join(' | '));
await browser.close();

if (notes.length) { console.log('\nWHAT THIS RUN DID NOT PROVE'); for (const n of notes) console.log('  ' + n); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
