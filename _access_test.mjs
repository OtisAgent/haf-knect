/* ══════════════════════════════════════════════════════════════════════════
   WHO GETS THROUGH WHICH DOOR

   Brent, 14 Aug 2026:
     "every account can post and every account has the option to add a PLNA
      which is a driver --> only should have access to the PLNA section when
      it's been clever checked and approved"
     "if i sign up as a freight forwarder account or a business account i just
      want access to send --> they shouldn't have any access to PLNA on the log
      in at all unless they want to and go through the clever.usehaf.co.uk
      system"

   This walks the real sign-in, six times, as six different kinds of account,
   and reads the sidebar that comes back. The account record is stood in for at
   the network boundary — the page's own code runs untouched, so what is proved
   here is what the page does with an answer, which is exactly where the fault
   was: the old code got a "not cleared" answer and signed the person in as a
   driver anyway.
   ══════════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m)); };

const b = await chromium.launch();

/* Sign in as an account whose record says `row`, and report what was drawn. */
async function signIn(row) {
  const pg = await b.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));

  /* One handler for the whole network boundary. Two overlapping handlers is how
     the first run of this test fooled itself: the catch-all was registered last,
     so it won every match and quietly sent the sign-in to the real database. */
  const account = JSON.stringify([Object.assign({
    haf_username: 'TS449326', full_name: 'Test Account',
    cred: 'relay', has_pin: true,
  }, row)]);
  await pg.route('**/rest/v1/**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    /* the sign-in gets the account under test; nothing else here is under test */
    body: r.request().url().includes('knect_auth') ? account : '[]',
  }));

  await pg.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await pg.evaluate(() => { const o = document.getElementById('login-ov'); if (o) o.classList.add('open'); });
  await pg.fill('#l-user', 'TS449326');
  await pg.fill('#l-pass', '1234');
  await pg.click('#login-ov .btn-wide');
  await pg.waitForFunction(() => document.querySelectorAll('#nav-list .ni').length > 0, null, { timeout: 15000 });

  /* The sidebar groups screens into sections that fold open. A screen that is
     only reachable two clicks down is still reachable, so open every section
     first — otherwise this test proves nothing except that a list was short.
     A LOCKED section is not opened by design: it explains itself and hands the
     person to Account & Membership, and that is the point of it. */
  /* Only ONE section is open at a time, so one sweep of the sidebar sees one
     section's screens. Open each in turn and collect the union — that is the
     honest answer to "what can this person actually reach". A locked section is
     deliberately not opened: it explains itself and hands the person to Account
     & Membership, which is the point of it. */
  const reach = await pg.evaluate(() => {
    const ids = new Set(), labels = new Set();
    /* a screen row is either a plain row or a folded-out sub-row; a section
       header and a locked row are neither — they are not screens */
    const sweep = () => [...document.querySelectorAll('#nav-list .ni, #nav-list .ni-sub')]
      .forEach(n => {
        if (n.classList.contains('ni-lock') || n.classList.contains('ni-sec')) return;
        ids.add(n.id); labels.add(n.textContent.trim());
      });
    sweep();
    /* clicking a section redraws the whole sidebar, so every reference goes
       stale — re-find the sections by position on each pass */
    const count = document.querySelectorAll('#nav-list .ni-sec').length;
    for (let i = 0; i < count; i++) {
      const sec = document.querySelectorAll('#nav-list .ni-sec')[i];
      if (sec) { sec.click(); sweep(); }
    }
    return { ids: [...ids], labels: [...labels] };
  });

  const seen = await pg.evaluate(() => ({
    locked: [...document.querySelectorAll('#nav-list .ni-lock')].map(n => n.textContent.trim()),
    heads: [...document.querySelectorAll('#nav-list .nav-sec')].map(n => n.textContent.trim()),
    add: [...document.querySelectorAll('#nav-list .ni-add')].map(n => n.textContent.trim()),
    role: (document.getElementById('tb-role') || {}).textContent || '',
    plnaBtn: (() => { const e = document.getElementById('plna-link-btn');
      return e ? getComputedStyle(e).display !== 'none' : false; })(),
    promo: (() => { const e = document.getElementById('sb-plna');
      return e ? getComputedStyle(e).display !== 'none' : false; })(),
  }));
  seen.ids = reach.ids;
  seen.nav = reach.labels;
  /* A row in the sidebar is not a working screen. Click the posting entry and
     check the screen behind it actually opens — a label that leads nowhere is
     not "every account can post". */
  const postRow = ['b-book', 'f-post'].find(id => seen.ids.includes('ni-' + id)) || null;
  seen.postOpens = false;
  if (postRow) {
    /* the sweep above left some other section open — fold back to the one that
       holds it, exactly as a person clicking through the sidebar would */
    await pg.evaluate(id => {
      const count = document.querySelectorAll('#nav-list .ni-sec').length;
      for (let i = 0; i < count && !document.getElementById('ni-' + id); i++) {
        const sec = document.querySelectorAll('#nav-list .ni-sec')[i];
        if (sec) sec.click();
      }
    }, postRow);
    await pg.click('#ni-' + postRow).catch(() => {});
    await pg.waitForTimeout(400);
    seen.postOpens = await pg.evaluate(() => {
      const p = [...document.querySelectorAll('.tp')].find(e => e.classList.contains('on')
        || getComputedStyle(e).display !== 'none');
      return !!(p && /b-book|f-post/.test(p.id));
    });
  }
  seen.errs = errs;
  await pg.close();
  return seen;
}

/* The screens that ARE the driving side, named by the screen itself rather than
   by its label — labels get rewritten, and a test that only knows the wording
   stops testing the day somebody improves the wording.

   d-invites  job offers          d-jobs    available network jobs
   d-empty    backload            d-status  my status
   d-earn     earnings            __plna    the driving site
   fl-manage  fleet overview      b-drivers the fleet's drivers
   b-fleet    the fleet's vehicles

   d-comp is deliberately NOT on this list. It is "where do my documents
   stand" — the one screen somebody waiting on their Clever checks most needs
   to see. Locking a person out of the page that explains why they are locked
   out is how a sign-up turns into a support call. */
const DRIVING = ['d-invites', 'd-jobs', 'd-empty', 'd-status', 'd-earn',
                 '__plna', 'fl-manage', 'b-drivers', 'b-fleet'];
const POSTING = ['b-book', 'f-post'];
const hasDriving = s => DRIVING.filter(d => s.ids.some(i => i === 'ni-' + d));

async function check(title, row, want) {
  console.log('\n' + title);
  const s = await signIn(row);
  ok(s.nav.length > 0, 'signed in and a sidebar was drawn');
  ok(s.ids.some(i => i === 'ni-d-home'), 'their home screen is there');
  ok(s.errs.length === 0, 'no script errors on the way in' + (s.errs.length ? ' — ' + s.errs[0] : ''));

  if (want.drivingScreens) {
    ok(hasDriving(s).length > 0, 'the driving screens are open to them');
  } else {
    const leak = hasDriving(s);
    ok(leak.length === 0, 'NO driving screen is reachable' + (leak.length ? ' — leaked: ' + leak.join(', ') : ''));
  }

  /* Posting is on every account, always — it was never what the check
     protected. Freight posts loads; everybody else posts a job. */
  ok(POSTING.some(p => s.ids.some(i => i === 'ni-' + p)), 'they can post work');
  ok(s.postOpens, 'and the posting screen really opens when they click it');

  ok(s.plnaBtn === want.plnaBtn,
    want.plnaBtn ? 'the PLNA button is offered' : 'the PLNA button is not shown at all');
  ok(s.promo === false, 'the old "sign up to the PLNA" card is gone');

  if (want.canAdd) {
    /* Never a dead end: an account that cannot drive today must still be able
       to SEE that driving exists and be told the one way to get it. Whether
       that arrives as a locked row with its reason, or as its own section at
       the foot of the sidebar, is a matter of design — that it is there at all
       is the rule. */
    const offered = s.locked.join(' ') + ' ' + s.add.join(' ') + ' ' + s.heads.join(' ');
    ok(/owner driver|fleet|Clever|PLNA/i.test(offered),
      'they are shown how to add driving to their account');
  }
  if (want.role) ok(s.role.trim() === want.role, 'the badge says "' + want.role + '"');
}

await check('BUSINESS — sends goods, does not drive',
  { account_type: 'business', plna_released: false, plna_eligible: false },
  { drivingScreens: false, plnaBtn: false, role: 'Business',
    canAdd: true });

await check('FREIGHT FORWARDER — posts loads, does not drive',
  { account_type: 'freight_forwarder', plna_released: false, plna_eligible: false },
  { drivingScreens: false, plnaBtn: false, role: 'Freight Forwarder',
    canAdd: true });

await check('OWNER DRIVER, checks not finished — this is the fault Brent hit',
  { account_type: 'driver', plna_released: false, plna_eligible: true },
  { drivingScreens: false, plnaBtn: false, role: 'Owner Driver',
    canAdd: true });

await check('OWNER DRIVER, released by Clever',
  { account_type: 'driver', plna_released: true, plna_eligible: true },
  { drivingScreens: true, plnaBtn: true, role: 'Owner Driver' });

await check('FLEET, checks not finished',
  { account_type: 'fleet', plna_released: false, plna_eligible: true },
  { drivingScreens: false, plnaBtn: false, role: 'Fleet',
    canAdd: true });

await check('FLEET, released by Clever — vans, drivers and the driving side',
  { account_type: 'fleet', plna_released: true, plna_eligible: true },
  { drivingScreens: true, plnaBtn: true, role: 'Fleet' });

/* ── The ways an answer can arrive WRONG ──────────────────────────────────
   A door that only holds against a tidy answer is not a door. Each of these
   is a record that does not say what the app expects, and every one of them
   must come out shut. */
console.log('\nWHEN THE ANSWER IS MISSING OR MALFORMED');
for (const [why, row] of [
  ['the release field is absent altogether', { account_type: 'driver' }],
  ['released arrives as the STRING "false"', { account_type: 'driver', plna_released: 'false' }],
  ['released arrives as the string "true" — not a real yes', { account_type: 'driver', plna_released: 'true' }],
  ['released is null', { account_type: 'driver', plna_released: null }],
  ['the account type is missing', { plna_released: false }],
  ['the account type is nonsense', { account_type: 'wizard', plna_released: false }],
  ['a business account is somehow marked released', { account_type: 'business', plna_released: true }],
  ['a freight account is somehow marked released', { account_type: 'freight_forwarder', plna_released: true }],
]) {
  const s = await signIn(row);
  const leak = hasDriving(s);
  ok(leak.length === 0 && s.plnaBtn === false,
    'shut when ' + why + (leak.length ? ' — LEAKED ' + leak.join(', ') : ''));
}

await b.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
