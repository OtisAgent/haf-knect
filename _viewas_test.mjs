/* ══════════════════════════════════════════════════════════════════════════
   THE MASTER LOGIN CAN NOW SEE WHAT A MEMBER SEES

   Brent, 14 Aug: "i can't see it --> it's not live from knect.usehaf.co.uk".

   He was right about the symptom and wrong about the cause, and the cause is
   worth writing down: the access split WAS live, but his login is the master
   login, and the master login lands on the mode selector — it has never walked
   a member's front door. So the check he was asked to make was one his own
   account could not make.

   This walks it the way he will: sign in on the master login, click each of
   the six member views, and read back the sidebar that was actually drawn.
   ══════════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8911';
const SHOT = process.env.SHOT === '1';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m)); };

const b = await chromium.launch();

/* Sign in as the master account and stop on the mode selector. */
async function master() {
  const pg = await b.newPage();
  await pg.setViewportSize({ width: 1280, height: 1000 });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));

  const acct = JSON.stringify([{
    haf_username: 'BF638793', full_name: 'Brent Ford',
    cred: 'relay', has_pin: true, account_type: 'driver', plna_released: true,
  }]);
  await pg.route('**/rest/v1/**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: r.request().url().includes('knect_auth') ? acct : '[]',
  }));

  await pg.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await pg.evaluate(() => { const o = document.getElementById('login-ov'); if (o) o.classList.add('open'); });
  await pg.fill('#l-user', 'BF638793');
  await pg.fill('#l-pass', '0641');
  await pg.click('#login-ov .btn-wide');
  await pg.waitForFunction(() => {
    const o = document.getElementById('super-mode');
    return o && getComputedStyle(o).display !== 'none';
  }, null, { timeout: 20000 });
  return { pg, errs };
}

/* What the sidebar actually offers, once every section has been folded open. */
async function reach(pg) {
  return pg.evaluate(() => {
    const ids = new Set(), labels = new Set();
    const sweep = () => [...document.querySelectorAll('#nav-list .ni, #nav-list .ni-sub')]
      .forEach(n => {
        if (n.classList.contains('ni-lock') || n.classList.contains('ni-sec')) return;
        ids.add(n.id); labels.add(n.textContent.trim());
      });
    sweep();
    const count = document.querySelectorAll('#nav-list .ni-sec').length;
    for (let i = 0; i < count; i++) {
      const sec = document.querySelectorAll('#nav-list .ni-sec')[i];
      if (sec) { sec.click(); sweep(); }
    }
    const plna = document.getElementById('plna-link-btn');
    const ban = document.getElementById('viewas-banner');
    return {
      ids: [...ids], labels: [...labels],
      /* every padlock and the reason printed under it */
      locks: [...document.querySelectorAll('#nav-list .ni-lock')].map(n => n.textContent.trim()),
      lockWhy: [...document.querySelectorAll('#nav-list .lk-why')].map(n => n.textContent.trim()),
      addRows: [...document.querySelectorAll('#nav-list .ni-add')].map(n => n.textContent.trim()),
      plnaBtn: !!(plna && getComputedStyle(plna).display !== 'none'),
      banner: !!(ban && getComputedStyle(ban).display !== 'none'),
      bannerText: (document.getElementById('viewas-lbl') || {}).textContent || '',
      role: (document.getElementById('tb-role') || {}).textContent || '',
    };
  });
}

/* The DRIVING screens are the ones gated on having been released — the same
   list the sign-in walk uses, so the two tests cannot quietly disagree.

   "Active Job" is deliberately NOT on it. It carries no gate in the navigation
   map because it is the job you are watching right now, and a business account
   watching the delivery it posted is looking at the same screen as the driver
   carrying it. My first run of this test called it a driving screen and failed
   four honest passes — the test was wrong, not the product, and the fix was to
   read the navigation map rather than to loosen the assertion until it went
   green. A test that is edited to agree with the code proves nothing. */
const DRIVING = ['d-invites', 'd-jobs', 'd-empty', 'd-status', 'd-earn',
                 '__plna', 'fl-manage', 'b-drivers', 'b-fleet'];
const drives = r => DRIVING.some(d => r.ids.includes('ni-' + d));
const posts = r => r.labels.some(l => /post/i.test(l));

console.log('\nTHE MASTER SCREEN ITSELF');
{
  const { pg, errs } = await master();
  const block = await pg.evaluate(() => {
    const btns = [...document.querySelectorAll('#super-mode button')]
      .map(n => n.textContent.trim());
    return {
      heading: document.body.innerText.includes('See what a member sees'),
      views: btns.filter(t => /Business|Freight forwarder|Owner driver|Fleet/.test(t)),
    };
  });
  ok(block.heading, 'the master screen offers "See what a member sees"');
  ok(block.views.length === 6, 'all six member views are offered (' + block.views.length + ')');
  ok(errs.length === 0, 'no script errors on the master screen');
  if (SHOT) await pg.screenshot({ path: '_shot_master.png' });
  await pg.close();
}

const CASES = [
  { label: 'Business — sends only',            btn: 'Business — sends only',            drive: false, add: true,  plna: false, role: 'Business' },
  { label: 'Freight forwarder — sends only',   btn: 'Freight forwarder — sends only',   drive: false, add: true,  plna: false, role: 'Freight Forwarder' },
  { label: 'Owner driver — checks not done',   btn: 'Owner driver — checks not done',   drive: false, add: true,  plna: false, role: 'Owner Driver' },
  { label: 'Owner driver — released',          btn: 'Owner driver — released',          drive: true,  add: false, plna: true,  role: 'Owner Driver' },
  { label: 'Fleet — checks not done',          btn: 'Fleet — checks not done',          drive: false, add: true,  plna: false, role: 'Fleet' },
  { label: 'Fleet — released',                 btn: 'Fleet — released',                 drive: true,  add: false, plna: true,  role: 'Fleet' },
];

for (const c of CASES) {
  console.log('\n' + c.label.toUpperCase());
  const { pg, errs } = await master();
  await pg.click('#super-mode button:has-text("' + c.btn + '")');
  await pg.waitForFunction(() => document.querySelectorAll('#nav-list .ni').length > 0, null, { timeout: 15000 });
  const r = await reach(pg);

  ok(r.banner, 'it says on screen that this is a preview, not a real account');
  ok(/preview|sidebar they get/i.test(r.bannerText), 'and it names which member is being looked at');
  ok(r.role.includes(c.role), 'the badge says "' + c.role + '"');
  ok(posts(r), 'they can post work');
  ok(drives(r) === c.drive, c.drive ? 'the driving screens are open' : 'NO driving screen is reachable');
  ok(r.plnaBtn === c.plna, c.plna ? 'the PLNA button is offered' : 'the PLNA button is not shown at all');
  ok((r.addRows.length > 0) === c.add,
    c.add ? 'the "add driving to your account" section is there' : 'nothing left to add — they already drive');

  /* No padlock may promise something finishing the checks will not deliver.
     An owner driver is never getting a fleet by sending documents. */
  const fleetPromise = r.lockWhy.some(w => /fleet account opens/i.test(w));
  ok(fleetPromise === (c.role === 'Fleet' && !c.drive),
    c.role === 'Fleet' && !c.drive
      ? 'the fleet padlock rightly says the checks will open it'
      : 'no padlock promises a fleet account this person is not getting');

  ok(errs.length === 0, 'no script errors on the way in');

  if (SHOT) {
    await pg.screenshot({ path: '_shot_' + c.btn.split(' ')[0].toLowerCase() + (c.drive ? '_released' : '_pending') + '.png' });
  }
  await pg.close();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await b.close();
process.exit(fail ? 1 : 0);
