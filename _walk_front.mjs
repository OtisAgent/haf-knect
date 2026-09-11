/* Walk the front door the way a stranger would, and assert what they see.

   Drive the controls a person clicks — never call the app's own functions. A
   pane opened by hand is display:none until switchTab shows it, so driving it
   backwards reports a working screen as broken and a broken one as working. */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'https://demo-front.knect-demo-site.pages.dev';
const DEMO = 'knect-demo-centre.pages.dev';
const LIVE_DB = 'ggkpqqrtxtlafdkxcaqg';

let pass = 0, fail = 0;
const ok = (n, c, note = '') => { c ? pass++ : fail++; console.log(`${c ? 'ok  ' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 140)));

/* Every request the page makes, so "it did not touch live" is measured and
   not assumed. The lead door is the one exception and it only fires if
   somebody types an email in, which this walk does not do. */
const calls = [];
page.on('request', r => calls.push(r.method() + ' ' + r.url()));

await page.goto(`${BASE}/?code=HAFDEMO`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

/* ── the tour still opens ── */
/* The whole sidebar's text. An earlier version of this asked for the section
   HEADINGS and reported "Free is missing" while the Free row sat right under
   it — the check was broken, not the page. */
const navText = await page.locator('#sidebar').innerText().catch(() => '');
ok('the Demo Centre opened on the code alone', await page.locator('#app.open').count() > 0);
for (const s of ['Free', 'Plus', 'Pro', 'Account Comparison']) {
  ok(`the tour still lists ${s}`, navText.includes(s), navText.slice(0, 90));
}

/* ── the door is on the screen that is showing ── */
const doorOn = async (label) => {
  const d = page.locator('.hf-door:visible').first();
  const vis = await d.count() > 0;
  ok(`${label}: the way in is on screen`, vis);
  if (vis) {
    const t = await d.innerText();
    ok(`${label}: it names the demo logins`, t.includes('DEMO1001') && t.includes('DEMO1004'));
    ok(`${label}: it does NOT hand out the master account`, !t.includes('DEMO1005'));
    const href = await d.locator('a.hf-go').first().getAttribute('href');
    ok(`${label}: the button opens the working demo`, (href || '').includes(DEMO), href || 'no href');
  }
};
await doorOn('Free');

/* ── walk to the other screens by clicking, like a person ── */
for (const label of ['Plus', 'Pro', 'Account Comparison']) {
  const row = page.locator('#sidebar').getByText(label, { exact: false }).first();
  if (await row.count() === 0) { ok(`could click through to ${label}`, false, 'no nav row'); continue; }
  await row.click();
  await page.waitForTimeout(900);
  ok(`could click through to ${label}`, true);
  await doorOn(label);
}

/* ── the button that stays ── */
ok('the try-it button stays on screen', await page.locator('#hf-float:visible').count() > 0);
const floatHref = await page.locator('#hf-float').getAttribute('href').catch(() => null);
ok('the try-it button points at the working demo', (floatHref || '').includes(DEMO), floatHref || 'none');

/* ── the sign-in box answers "how do I get in" ── */
/* The front step. A visitor who has not been through the email door must meet
   the email door and nothing that gets round it — those rows are HAF's
   enquiries. */
const lp = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await lp.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await lp.waitForTimeout(1800);
const landing = await lp.locator('body').innerText();
ok('the email door still greets a new visitor', /access code/i.test(landing));
ok('nothing lets them skip it', await lp.locator('#hf-float:visible, .hf-door:visible').count() === 0);
await lp.close();

/* ── what the tour asks of the live network, and nothing more ──
   Two calls to live are RIGHT and are asserted rather than banned: the access
   code is checked against HAF's own lead table, and the pricing matrix is read
   from the live site so the figures on these screens are the true ones. Any
   OTHER live call is a data read or a login that should have moved. */
const liveCalls = calls.filter(c => c.includes(LIVE_DB) || c.includes('knect.usehaf.co.uk'));
const allowed = c => c.includes('knect_demo_check_code')
  || c.includes('knect_demo_request_code') || c.includes('/api/pricing');
ok('the access code is still checked against HAF\'s own records',
   liveCalls.some(c => c.includes('knect_demo_check_code')));
ok('the figures still come from the real pricing matrix',
   liveCalls.some(c => c.includes('/api/pricing')));
ok('nothing else on the page reached the live network',
   liveCalls.every(allowed), liveCalls.filter(c => !allowed(c)).join(' | ').slice(0, 160));
ok('the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' / '));

/* ── and the working demo really is at the other end ── */
const res = await page.request.get(`https://${DEMO}/`);
ok('the working demo answers', res.status() === 200, String(res.status()));

await browser.close();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
