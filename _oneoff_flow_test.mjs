/* ONE ORDER PATH — screen-side proof, run against a local copy of the page.
   The API is intercepted so nothing is written anywhere: what is under test
   here is what the SCREEN does. The server's own refusals are proved
   separately, against the live route, because that is the door that matters. */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';

const URL = 'http://127.0.0.1:8788/index.html';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage();
let placed = null;
await p.route('**/api/order/place', async (r) => {
  placed = JSON.parse(r.request().postData() || '{}');
  await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    ok: true, job_ref: 'HAF-TEST-0001', quote: { total_pence: 10716, quote_ex_vat_pence: 8930, vat_pence: 1786, vat_pct: 20 },
    deposit_pence: 10716, balance_pence: 0, pay_url: 'https://join.usehaf.co.uk/pay/TEST',
    track_url: 'https://knect.usehaf.co.uk/job/TESTTESTTESTTESTTESTTEST', first_refusal_minutes: 10 }) });
});
await p.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

const pass = [], fail = [];
const check = (name, ok, extra) => (ok ? pass : fail).push(name + (extra ? ' — ' + extra : ''));

await p.goto(URL, { waitUntil: 'load' });
await p.waitForTimeout(1200);

/* 1 — the dashboard button is wired to something */
check('Post a Job button exists', await p.locator('#post-submit').count() === 1);
check('Post a Job button is enabled', await p.locator('#post-submit').isEnabled());
check('the order journey function is on the page',
  await p.evaluate(() => typeof window.hafOrderJourney === 'function'));

/* 2 — pressing it from inside the account opens the real journey, prefilled */
await p.evaluate(() => {
  document.getElementById('app').classList.add('open');
  document.getElementById('landing').style.display = 'none';
  switchTab('pane-b-book');
  document.getElementById('post-caddr').value = '12 Europa Way, Sheffield S9 1XH';
  document.getElementById('post-daddr').value = '4 Kirkstall Road, Leeds LS3 1HF';
});
await p.waitForTimeout(500);
/* The pane a customer actually looks at, not a hidden one — a click on
   something nobody can see proves nothing. */
check('the Post a Job screen is on screen and visible',
  await p.locator('#post-submit').isVisible());
await p.click('#post-submit');
await p.waitForTimeout(900);
const opened = await p.evaluate(() => ({
  landing: getComputedStyle(document.getElementById('landing')).display,
  flow: document.getElementById('inline-flow').style.display,
  fast: document.getElementById('if-fast').style.display,
  from: document.getElementById('fq-from').value,
  to: document.getElementById('fq-to').value,
  fromApp: !!window._orderFromApp
}));
check('the journey opens', opened.flow === 'block' && opened.fast === 'block', JSON.stringify(opened));
check('both addresses carried across', /Europa Way/.test(opened.from) && /Kirkstall/.test(opened.to), opened.from + ' | ' + opened.to);
check('it remembers they came from their account', opened.fromApp);

/* 3 — closing it puts a signed-in customer back on their dashboard */
await p.evaluate(() => { window.confirm = () => true; closeInlineFlow(); });
await p.waitForTimeout(400);
const back = await p.evaluate(() => ({
  app: document.getElementById('app').classList.contains('open'),
  landing: getComputedStyle(document.getElementById('landing')).display
}));
check('closing returns them to the dashboard', back.app && back.landing === 'none', JSON.stringify(back));

/* 4 — the driver-critical stage refuses each missing thing, one at a time */
await p.evaluate(() => {
  document.getElementById('app').classList.remove('open');
  document.getElementById('landing').style.display = 'flex';
  openFlow('fast');
  const s = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  s('fq-caddr', '12 Europa Way, Sheffield S9 1XH');
  s('fq-daddr', '4 Kirkstall Road, Leeds LS3 1HF');
  s('fq-cname', 'Dave Roberts'); s('fq-cphone', '');
  s('fq-dname', 'Marie Cole');   s('fq-dphone', '07700 900123');
  fqStep(5);
});
await p.click('#fq-5 .fnav .btn-or');
await p.waitForTimeout(500);
let err = await p.locator('#fq-err-5').textContent();
check('no collection mobile is refused', /mobile number for the collection/i.test(err || ''), (err || '').slice(0, 70));

await p.evaluate(() => { document.getElementById('fq-cphone').value = '07700 900456';
                         document.getElementById('fq-dphone').value = ''; });
await p.click('#fq-5 .fnav .btn-or');
await p.waitForTimeout(500);
err = await p.locator('#fq-err-5').textContent();
check('no delivery mobile is refused', /mobile number for the delivery/i.test(err || ''), (err || '').slice(0, 70));

await p.evaluate(() => { document.getElementById('fq-cname').value = ''; });
await p.click('#fq-5 .fnav .btn-or');
await p.waitForTimeout(500);
err = await p.locator('#fq-err-5').textContent();
check('no collection contact name is refused', /collection contact name/i.test(err || ''), (err || '').slice(0, 70));

await p.evaluate(() => { document.getElementById('fq-cname').value = 'Dave Roberts';
                         document.getElementById('fq-dphone').value = '07700 900123';
                         document.getElementById('fq-caddr').value = 'S9 1XH'; });
await p.click('#fq-5 .fnav .btn-or');
await p.waitForTimeout(500);
err = await p.locator('#fq-err-5').textContent();
check('a bare postcode as the address is refused', /postcode, not the address/i.test(err || ''), (err || '').slice(0, 70));

/* And a street with no building number, which is a different mistake */
await p.evaluate(() => { document.getElementById('fq-caddr').value = 'Europa Way, Sheffield'; });
await p.click('#fq-5 .fnav .btn-or');
await p.waitForTimeout(500);
err = await p.locator('#fq-err-5').textContent();
check('a street with no building number is refused', /house or building number/i.test(err || ''), (err || '').slice(0, 70));

console.log('\nPASS  ' + pass.length);
pass.forEach((x) => console.log('  ok   ' + x));
console.log('FAIL  ' + fail.length);
fail.forEach((x) => console.log('  FAIL ' + x));
await b.close();
process.exit(fail.length ? 1 : 0);
