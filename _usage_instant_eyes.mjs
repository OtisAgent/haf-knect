/* EYES ON THE SEND PAGE, SIGNED IN, ON THE LIVE SITE.
 *
 *   PROOF_USER=ZZ... PROOF_PIN=4471 node _usage_instant_eyes.mjs
 *
 * Four things a person would notice, read back off the page they actually get:
 *   1. how long the allowance line takes to appear the FIRST time
 *   2. how long it takes the second time, which is the whole point of the change
 *   3. that the side column no longer asks a signed-in member to log in
 *   4. that "Your dashboard" from there really does open their dashboard
 */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';

const SITE = 'https://knect.usehaf.co.uk/';
const USER = process.env.PROOF_USER;
const PIN = process.env.PROOF_PIN || '4471';
if (!USER) { console.error('PROOF_USER not set'); process.exit(1); }

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1100 } });
const problems = [];
p.on('pageerror', e => problems.push('page error: ' + e.message));

await p.goto(SITE, { waitUntil: 'load' });
await p.waitForTimeout(1200);

await p.evaluate(() => openLogin());
await p.waitForTimeout(400);
await p.fill('#l-user', USER);
await p.fill('#l-pass', PIN);
await p.evaluate(() => doLogin());
await p.waitForTimeout(3500);

const signedIn = await p.evaluate(() => (localStorage.getItem('knect-user') || '') !== ''
  && document.getElementById('app') && document.getElementById('app').classList.contains('open'));
console.log('signed in:', signedIn);
if (!signedIn) { console.log('could not sign in — stopping'); await b.close(); process.exit(1); }

/* Wait until the row is really on the screen, and say how long it took. Polled
   every 100ms because the thing being measured is now well under a second. */
async function timeTheRow() {
  const t = Date.now();
  for (let i = 0; i < 80; i++) {
    const up = await p.evaluate(() => {
      const e = document.getElementById('fq-use');
      return !!e && getComputedStyle(e).display !== 'none' && e.offsetHeight > 0;
    });
    if (up) return Date.now() - t;
    await p.waitForTimeout(100);
  }
  return null;
}

const readRow = () => p.evaluate(() => {
  const e = document.getElementById('fq-use');
  if (!e) return { present: false };
  return { present: true, visible: getComputedStyle(e).display !== 'none' && e.offsetHeight > 0,
           classes: e.className, text: (e.innerText || '').replace(/\s+/g, ' ').trim() };
});

/* FIRST OPEN. Signing in has already gone and fetched the figure, so this is
   what a member who signs in and then books actually waits. */
await p.evaluate(() => goLanding());
await p.waitForTimeout(400);
await p.evaluate(() => openFlow('fast'));
const first = await timeTheRow();
console.log('\nfirst open  — the row appeared after', first === null ? 'NEVER' : first + ' ms');
console.log('  ' + JSON.stringify(await readRow()));

/* THE SIDE COLUMN, while the form is open — the exact place it used to ask a
   signed-in member to log in again. */
const side = await p.evaluate(() => {
  const l = document.getElementById('side-login'), a = document.getElementById('side-acct');
  const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.offsetHeight > 0;
  return { login_showing: vis(l), account_showing: vis(a),
           account_text: a ? (a.innerText || '').replace(/\s+/g, ' ').trim() : '' };
});
console.log('\nthe side column while booking:');
console.log('  login box showing:      ' + side.login_showing + (side.login_showing ? '   <-- WRONG' : ''));
console.log('  signed-in card showing: ' + side.account_showing);
console.log('  it says: ' + side.account_text);

await p.screenshot({ path: '/agent/workspace/haf-knect-ops/_usage_instant.png' });

/* SECOND OPEN. Close it and come back, the way somebody who changed their mind
   does. This is the one that should be immediate. */
await p.evaluate(() => closeInlineFlow());
await p.waitForTimeout(500);
await p.evaluate(() => openFlow('fast'));
const second = await timeTheRow();
console.log('\nsecond open — the row appeared after', second === null ? 'NEVER' : second + ' ms');
/* Read WHILE the form is open. Reading it after the next step navigates away
   measures a hidden box and calls a good row a failure. */
const row = await readRow();
console.log('  ' + JSON.stringify(row));

/* AND THE WAY BACK. */
await p.evaluate(() => hafBackToApp());
await p.waitForTimeout(700);
const back = await p.evaluate(() => ({
  app_open: document.getElementById('app').classList.contains('open'),
  landing_hidden: getComputedStyle(document.getElementById('landing')).display === 'none'
}));
console.log('\n"Your dashboard" from the send page:');
console.log('  dashboard open: ' + back.app_open + ' · send page put away: ' + back.landing_hidden);

if (problems.length) console.log('\nJAVASCRIPT PROBLEMS ON THE PAGE:\n  ' + problems.join('\n  '));
else console.log('\nno javascript errors on the page');

/* An account with no limit to watch is meant to be shown NOTHING — run with
   EXPECT_HIDDEN=1 against an unlimited account to prove that half. */
const wantHidden = !!process.env.EXPECT_HIDDEN;
const rowRight = wantHidden ? !row.visible : (row.present && row.visible && first !== null && second !== null);
const ok = rowRight && !side.login_showing && side.account_showing
  && back.app_open && back.landing_hidden && !problems.length;
console.log('\n' + (ok ? 'ALL FOUR HELD' : 'SOMETHING DID NOT HOLD'));
await b.close();
process.exit(ok ? 0 : 1);
