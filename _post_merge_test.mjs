/* ══════════════════════════════════════════════════════════════════════════
   ONE POSTING SCREEN

   Brent, 14 Aug 2026:
     "on the posting of the jobs --> posting jobs and posting loads are the same
      thing? --> i need you to merge that page and tab together and anything
      associated with it"

   They were two screens — "Post a Job" for a business account and "Post a Load"
   for a freight forwarder — and they had drifted: the freight form had no date
   on it, the business form had nowhere to write instructions for the driver,
   and only one of the two asked what the work was worth.

   A merge is not finished when the second tab disappears. It is finished when
   NOTHING was lost and NOTHING still points at the screen that went. So this
   walks the real sign-in as five kinds of account and asks, of each one:

     · is there exactly ONE posting row, and is it called the same thing?
     · does clicking it open a screen that really posts?
     · is every field either form used to have still on it?
     · did an old link to the deleted screen dead-end, or land on the merged one?

   The account record is stood in for at the network boundary; the page's own
   code runs untouched.
   ══════════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8911';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m)); };

const b = await chromium.launch();

async function signIn(row) {
  const pg = await b.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));

  const account = JSON.stringify([Object.assign({
    haf_username: 'TS449326', full_name: 'Test Account',
    cred: 'relay', has_pin: true,
  }, row)]);
  await pg.route('**/rest/v1/**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: r.request().url().includes('knect_auth') ? account : '[]',
  }));

  await pg.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  if (!await pg.evaluate(() => typeof window.hafAccess === 'function')) {
    console.error('\nWRONG PAGE at ' + BASE + ' — no access model on it. Serve the member app.');
    process.exit(2);
  }
  await pg.evaluate(() => { const o = document.getElementById('login-ov'); if (o) o.classList.add('open'); });
  await pg.fill('#l-user', 'TS449326');
  await pg.fill('#l-pass', '1234');
  await pg.click('#login-ov .btn-wide');
  await pg.waitForFunction(() => document.querySelectorAll('#nav-list .ni').length > 0, null, { timeout: 15000 });

  /* Every section in turn — one is open at a time, so a single sweep sees one
     section. The union is the honest answer to "what can this person reach". */
  const rows = await pg.evaluate(() => {
    const out = new Map();
    const sweep = () => [...document.querySelectorAll('#nav-list .ni, #nav-list .ni-sub')]
      .forEach(n => {
        if (n.classList.contains('ni-lock') || n.classList.contains('ni-sec')) return;
        out.set(n.id, n.textContent.trim());
      });
    sweep();
    const count = document.querySelectorAll('#nav-list .ni-sec').length;
    for (let i = 0; i < count; i++) {
      const sec = document.querySelectorAll('#nav-list .ni-sec')[i];
      if (sec) { sec.click(); sweep(); }
    }
    return [...out.entries()].map(([id, label]) => ({ id, label }));
  });

  return { pg, errs, rows };
}

/* What the merged screen has to carry — the union of the two old forms, named
   by the words a person reads, because that is what "nothing was lost" means to
   the person filling it in. */
const FIELDS_EVERYONE = [
  'Collection address', 'Delivery address', 'Your reference', 'Goods description',
  'Weight (kg)', 'Vehicle needed', 'Date', 'Urgency', 'Special instructions',
  'Who can accept this job?', 'Additional requirements',
];
const FIELDS_RESALE = ['Buy rate', 'Client sell rate'];

async function screen(pg) {
  return pg.evaluate(() => {
    const p = document.getElementById('pane-b-book');
    /* Visibility has to be measured the way an eye measures it. Checking
       el.hidden and the element's OWN computed display is not that: a child of
       a hidden card reports display:block quite happily, and the first run of
       this test passed a block that a person could plainly see. A rendered box
       is the only honest answer, and it accounts for every ancestor. */
    const vis = el => !!(el && el.getClientRects().length > 0);
    const shown = sel => [...p.querySelectorAll(sel)].filter(vis);
    return {
      open: !!(p && p.classList.contains('on')),
      /* only the text a person can actually see on this screen */
      text: shown('*').map(e => e.childElementCount ? '' : e.textContent).join(' | '),
      placeholders: [...p.querySelectorAll('input,textarea')].filter(vis).map(e => e.placeholder || ''),
      resale: shown('[data-post-only="resale"]').length,
      ownfleet: shown('[data-post-only="ownfleet"]').length,
      networkChecked: (document.getElementById('post-accept-network') || {}).checked === true,
      submitEnabled: !(document.getElementById('post-submit') || {}).disabled,
      gapDisabled: (p.querySelector('[data-always-disabled]') || {}).disabled === true,
      title: (document.getElementById('post-title') || {}).textContent || '',
      sub: (document.getElementById('post-sub') || {}).textContent || '',
    };
  });
}

const CASES = [
  { name: 'OWNER DRIVER — released',  row: { account_type: 'driver',            plna_released: true  }, resale: false, fleet: false },
  { name: 'OWNER DRIVER — checks not done', row: { account_type: 'driver',      plna_released: false }, resale: false, fleet: false },
  { name: 'FLEET — released',         row: { account_type: 'fleet',             plna_released: true  }, resale: false, fleet: true  },
  { name: 'BUSINESS — sends only',    row: { account_type: 'business',          plna_released: false }, resale: false, fleet: false },
  { name: 'FREIGHT FORWARDER',        row: { account_type: 'freight_forwarder', plna_released: false }, resale: true,  fleet: false },
];

for (const c of CASES) {
  console.log('\n' + c.name);
  const { pg, errs, rows } = await signIn(c.row);

  /* ── one act, one row, one name ── */
  const posting = rows.filter(r => /^Post /i.test(r.label));
  ok(posting.length === 1, `exactly one posting row in the sidebar (found ${posting.length}: ${posting.map(p => p.label).join(', ') || 'none'})`);
  ok(posting.every(p => p.label === 'Post a Job'), 'it is called "Post a Job"');
  ok(!rows.some(r => /Post a Load/i.test(r.label)), '"Post a Load" is gone from the sidebar');
  ok(!rows.some(r => /Book a Courier/i.test(r.label)), 'and so is the third name the same screen used to have');

  /* ── it opens, and it opens the merged screen ── */
  if (posting.length) {
    await pg.evaluate(id => {
      const n = document.querySelectorAll('#nav-list .ni-sec').length;
      for (let i = 0; i < n && !document.getElementById(id); i++) {
        const sec = document.querySelectorAll('#nav-list .ni-sec')[i];
        if (sec) sec.click();
      }
    }, posting[0].id);
    await pg.click('#' + posting[0].id).catch(() => {});
    await pg.waitForTimeout(350);
  }
  let s = await screen(pg);
  ok(s.open, 'clicking it opens the merged posting screen');
  ok(s.submitEnabled, 'and the post button is live — every account can post');

  /* ── nothing was lost ── */
  const missing = FIELDS_EVERYONE.filter(f => !s.text.includes(f));
  ok(missing.length === 0, 'every field both old forms had is on it' + (missing.length ? ' — MISSING: ' + missing.join(', ') : ''));

  /* ── the two blocks that are genuinely account-specific ── */
  const hasResale = FIELDS_RESALE.every(f => s.text.includes(f));
  ok(c.resale ? hasResale : !hasResale,
     c.resale ? 'a reseller is asked its buy rate and its client sell rate'
              : 'nobody else is asked for a client sell rate they do not have');
  ok(c.fleet ? s.ownfleet > 0 : s.ownfleet === 0,
     c.fleet ? 'a fleet can send the job to its own drivers first'
             : 'an account with no drivers of its own is not offered "my drivers only"');
  if (!c.fleet) ok(s.networkChecked, '...and the job is set to the open network, not a routing rule it cannot use');

  /* ── reopening posting must not switch on something shut for another reason ── */
  ok(s.gapDisabled, 'Gap Cover stays switched off — it is coming soon, not paused');

  /* ── an old link does not dead-end ── */
  await pg.evaluate(() => switchTab('pane-d-home'));
  await pg.waitForTimeout(150);
  await pg.evaluate(() => switchTab('pane-f-post'));
  await pg.waitForTimeout(300);
  s = await screen(pg);
  ok(s.open, 'an old link to the deleted "Post a Load" screen lands on the merged one');

  ok(errs.length === 0, 'no script errors on the way through' + (errs.length ? ': ' + errs[0] : ''));
  await pg.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
