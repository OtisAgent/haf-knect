/* ══════════════════════════════════════════════════════════════════════════
   WHAT AN ACCOUNT SEES WHEN IT SIGNS IN — 2 Sep 2026

   Brent:
     "when other people sign in through the HAF KNECT Platform they should get
      full access according to the account type selection allowing them to start
      seeing jobs"
     "i want all overview visuals removing from the people who are logging in
      i don't want them seeing the network users right now"

   Three things this has to prove, and the third is the one that could quietly
   go wrong:

     1. the driving screens follow the ACCOUNT TYPE — an owner driver waiting on
        their Clever checks can see the work,
     2. the network panels (map, driver directory, coverage board) are gone for
        every member, released or not,
     3. TAKING a job still needs the Clever release. Opening the screens must
        not have opened the door behind them.

   The account record is stood in for at the network boundary; the page's own
   code runs untouched. That is the whole point — what is under test is what the
   page DOES with an answer.
   ══════════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8911';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m)); };

const b = await chromium.launch();

/* One job on the board, so "seeing jobs" can be proved rather than assumed. */
const BOARD = JSON.stringify([{
  id: '00000000-0000-0000-0000-000000000001',
  booking_ref: 'REF-900001', from_postcode: 'LS1', to_postcode: 'EC1',
  preferred_date: '2026-09-10', notes: 'Two pallets, tail lift',
  pushed_at: '2026-09-02T09:00:00Z', customer_first: 'Dawn', is_direct: false,
}]);

async function signIn(row) {
  const pg = await b.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));

  const account = JSON.stringify([Object.assign({
    haf_username: 'TS449326', full_name: 'Test Account',
    cred: 'relay', has_pin: true,
  }, row)]);

  await pg.route('**/rest/v1/**', r => {
    const u = r.request().url();
    const body = u.includes('knect_auth') ? account
      : u.includes('plna_exchange_board') ? BOARD
      : '[]';
    return r.fulfill({ status: 200, contentType: 'application/json', body });
  });

  await pg.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  if (!await pg.evaluate(() => typeof window.hafAccess === 'function')) {
    console.error('\nWRONG PAGE at ' + BASE + ' — serve the member app folder.');
    process.exit(2);
  }
  await pg.evaluate(() => { const o = document.getElementById('login-ov'); if (o) o.classList.add('open'); });
  await pg.fill('#l-user', 'TS449326');
  await pg.fill('#l-pass', '1234');
  await pg.click('#login-ov .btn-wide');
  await pg.waitForFunction(() => document.querySelectorAll('#nav-list .ni').length > 0, null, { timeout: 15000 });

  /* every section opened in turn — a screen two clicks down is still reachable */
  const ids = await pg.evaluate(() => {
    const seen = new Set();
    const sweep = () => [...document.querySelectorAll('#nav-list .ni, #nav-list .ni-sub')]
      .forEach(n => { if (!n.classList.contains('ni-lock') && !n.classList.contains('ni-sec')) seen.add(n.id); });
    sweep();
    const count = document.querySelectorAll('#nav-list .ni-sec').length;
    for (let i = 0; i < count; i++) {
      const sec = document.querySelectorAll('#nav-list .ni-sec')[i];
      if (sec) { sec.click(); sweep(); }
    }
    return [...seen];
  });

  /* the Open Jobs screen itself, drawn from the board */
  let jobs = { reached: false, cards: 0, claim: 0, waiting: 0, panes: [] };
  if (ids.includes('ni-d-jobs')) {
    await pg.evaluate(() => window.switchTab('pane-d-jobs'));
    await pg.waitForTimeout(600);
    jobs = await pg.evaluate(() => {
      const live = document.getElementById('dj-live');
      return {
        reached: !!live,
        cards: live ? live.querySelectorAll('.xc').length : 0,
        claim: live ? live.querySelectorAll('button[onclick^="hafJobsClaim"]').length : 0,
        waiting: live ? [...live.querySelectorAll('.xc-meta')]
          .filter(e => /Clever checks open this/.test(e.textContent)).length : 0,
        text: live ? live.textContent.slice(0, 200) : '',
      };
    });
  }

  /* is a network panel still in the document at all? audTakeOut REMOVES them,
     so presence is the honest test, not visibility */
  const netPanes = await pg.evaluate(() =>
    ['pane-f-cap', 'pane-f-dir', 'pane-f-cover'].filter(id => !!document.getElementById(id)));

  await pg.close();
  return { ids, jobs, netPanes, errs };
}

const CASES = [
  { name: 'owner driver, checks still running',
    row: { account_type: 'driver', plna_eligible: true, plna_released: false },
    seesJobs: true, canClaim: false, plna: true },
  { name: 'owner driver, Clever checked',
    row: { account_type: 'driver', plna_eligible: true, plna_released: true },
    seesJobs: true, canClaim: true, plna: true },
  { name: 'fleet, checks still running',
    row: { account_type: 'fleet', plna_eligible: true, plna_released: false },
    seesJobs: true, canClaim: false, plna: true },
  { name: 'business',
    row: { account_type: 'business', plna_eligible: false, plna_released: false },
    seesJobs: false, canClaim: false, plna: false },
  { name: 'freight forwarder',
    row: { account_type: 'freight_forwarder', plna_eligible: false, plna_released: false },
    seesJobs: false, canClaim: false, plna: false },
];

for (const c of CASES) {
  console.log('\n' + c.name);
  const r = await signIn(c.row);

  ok(r.ids.includes('ni-b-book'), 'can post work');
  ok(r.ids.includes('ni-d-jobs') === c.seesJobs,
     c.seesJobs ? 'Open Jobs is on the sidebar' : 'no driving screens for a posting account');

  if (c.seesJobs) {
    ok(r.jobs.cards === 1, 'the real board is drawn (' + r.jobs.cards + ' job)');
    ok(r.jobs.claim === (c.canClaim ? 1 : 0),
       c.canClaim ? 'a checked driver can take the job' : 'an unchecked driver gets no Take button');
    if (!c.canClaim) ok(r.jobs.waiting === 1, 'and is told the Clever checks open it');
  }

  ok(r.ids.includes('ni-__plna') === c.plna,
     c.plna ? 'the link to the driving site is offered' : 'no driving site link for a posting account');

  ok(r.netPanes.length === 0,
     'network panels gone (' + (r.netPanes.join(', ') || 'none in the document') + ')');
  ok(!r.ids.includes('ni-f-cap') && !r.ids.includes('ni-f-dir') && !r.ids.includes('ni-f-cover'),
     'no map, directory or coverage board on the sidebar');

  ok(r.errs.length === 0, 'no console errors' + (r.errs.length ? ' — ' + r.errs[0] : ''));
}

await b.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
