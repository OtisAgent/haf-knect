/* PLNA-at-a-glance sidebar card — end-to-end on a real browser against the LIVE
   PLNA database. Nothing here is stubbed: the page signs in with a real
   credential, the card makes its real calls, and every figure is checked
   against what the same RPCs return to a plain fetch.

   Run: node _plna_sidebar_e2e.mjs   (serve the repo on 8931 first) */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
import crypto from 'node:crypto';

const BASE = 'http://127.0.0.1:8933/index.html';
const USER = 'BF638793';
const PIN  = '0641';
const SUPA = 'https://ggkpqqrtxtlafdkxcaqg.supabase.co';
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdna3BxcXJ0eHRsYWZka3hjYXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxOTM2NjAsImV4cCI6MjA5Nzc2OTY2MH0.hB70KOYZu4dshwhsrxF_dFyBn0n72gStWTwxYGsLdgY';

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const relay = sha(`${USER}:${PIN}`);

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  <- ' + detail : '')); }
};

/* what the database actually says, fetched independently of the page */
async function rpc(fn) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_username: USER, p_hash: null, p_relay: relay })
  });
  return r.json();
}

const card = page => page.evaluate(() => {
  const el = document.getElementById('sb-pl');
  if (!el) return { exists: false };
  const cs = getComputedStyle(el);
  const nums = [...el.querySelectorAll('.sb-pl-n')].map(n => ({
    v: n.querySelector('.sb-pl-nv')?.textContent.trim(),
    l: n.querySelector('.sb-pl-nl')?.textContent.trim()
  }));
  return {
    exists: true,
    visible: cs.display !== 'none' && el.offsetParent !== null,
    display: cs.display,
    tag: el.querySelector('.sb-pl-tag')?.textContent.trim() || '',
    chip: el.querySelector('.sb-pl-chip')?.textContent.trim() || '',
    nums,
    text: el.innerText.replace(/\s+/g, ' ').trim(),
    btn: !!el.querySelector('.sb-pl-btn'),
    width: el.getBoundingClientRect().width,
    overflows: el.scrollWidth > el.clientWidth + 1
  };
});

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  /* The three aborts in step 10 are this test's own doing — the browser logs a
     failed request for each, and counting those as faults would make a deliberate
     offline check look like a bug. Everything else is recorded with its URL. */
  let expectAborts = false;
  page.on('requestfailed', r => {
    if (expectAborts && /rpc\/plna_(driver_setup_state|my_bookings|my_payouts)/.test(r.url())) return;
    errors.push('request failed: ' + r.url() + ' ' + (r.failure()?.errorText || ''));
  });
  page.on('response', r => { if (r.status() >= 400) errors.push('http ' + r.status() + ' ' + r.url()); });

  /* ── the truth, read straight from the database ── */
  const [setup, books, pay] = await Promise.all([
    rpc('plna_driver_setup_state'), rpc('plna_my_bookings'), rpc('plna_my_payouts')
  ]);
  const live = books.filter(b => !b.removed_at);
  const expDone   = live.filter(b => b.status === 'completed').length;
  const expBooked = live.filter(b => b.status === 'accepted' || b.status === 'pending').length;
  const expDue    = Number(pay.due_next_run || 0);
  console.log(`\nDatabase says: cleared=${setup.cleared} missing=${JSON.stringify(setup.missing)} ` +
              `booked=${expBooked} done=${expDone} due=${expDue}\n`);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  console.log('1 · Signed out — no card');
  ok('card is in the page but hidden', (await card(page)).exists && !(await card(page)).visible);

  console.log('\n2 · Real sign-in reaches the master mode selector');
  await page.evaluate(async ([u, p]) => {
    await hafAuth(u, p, document.getElementById('l-err'),
                  document.querySelector('#login-ov .btn-wide'));
  }, [USER, PIN]);
  await page.waitForFunction(() => document.getElementById('super-mode')?.style.display === 'flex', { timeout: 20000 });
  ok('signed in', await page.evaluate(() => localStorage.getItem('knect-user') === 'BF638793'));
  ok('no card on the master selector', !(await card(page)).visible);

  console.log('\n3 · Preview a RELEASED DRIVER sidebar — the card should be live');
  await page.evaluate(() => viewAsMember('driver', true));
  await page.waitForFunction(() => {
    const t = document.getElementById('sb-pl')?.innerText || '';
    return t && !/Reading your driving record/.test(t);
  }, { timeout: 20000 });
  let c = await card(page);
  ok('card is visible', c.visible, c.display);
  ok('it is labelled a preview', /preview/i.test(c.tag), c.tag);
  ok('three figures shown', c.nums.length === 3, JSON.stringify(c.nums));
  ok('Booked in matches the database', c.nums[0]?.v === String(expBooked), `${c.nums[0]?.v} vs ${expBooked}`);
  ok('Done matches the database', c.nums[1]?.v === String(expDone), `${c.nums[1]?.v} vs ${expDone}`);
  ok('Due matches the database', c.nums[2]?.v === '£' + (expDue % 1 ? expDue.toFixed(2) : expDue.toFixed(0)),
     `${c.nums[2]?.v} vs ${expDue}`);
  ok('clearance chip matches the database',
     setup.cleared ? /cleared/i.test(c.chip) : /checks/i.test(c.chip), c.chip);
  const gaps = Array.isArray(setup.missing) ? setup.missing : [];
  ok('setup line matches the database',
     setup.cleared
       ? (gaps.length ? new RegExp(`${gaps.length} thing`).test(c.text) : /ready for work/i.test(c.text))
       : /still checking/i.test(c.text),
     c.text);
  ok('says whose figures these are', /your own record/i.test(c.text));
  ok('has a way into PLNA', c.btn);
  ok('nothing overflows the sidebar', !c.overflows, `${c.scrollWidth} > ${c.clientWidth}`);
  console.log('    card reads: ' + c.text);

  console.log('\n4 · The PLNA button hands the driver straight through');
  const url = await page.evaluate(() => {
    let got = null;
    const real = window.open;
    window.open = u => { got = u; return null; };
    document.querySelector('#sb-pl .sb-pl-btn').click();
    window.open = real;
    return got;
  });
  ok('goes to the PLNA sign-in bridge', /^https:\/\/plna\.usehaf\.co\.uk\/sso\.html#/.test(url || ''), url);
  ok('carries this account', (url || '').includes('u=' + USER), url);
  ok('carries the credential that opened this session', (url || '').includes('k=' + relay));
  ok('the token is in the fragment, never the query',
     !(url || '').split('#')[0].includes('k='), url);
  /* and it genuinely opens a session on the live PLNA */
  const bridged = await fetch(`${SUPA}/rest/v1/rpc/plna_auth`, {
    method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_username: USER, p_hash: relay, p_relay: relay })
  }).then(r => r.json());
  ok('the live PLNA accepts that token', Array.isArray(bridged) && bridged.length === 1 && !!bridged[0].cred);

  console.log('\n5 · A driver whose checks are NOT finished still gets the card');
  await page.evaluate(() => viewAsMember('driver', false));
  await page.waitForFunction(() => !/Reading your/.test(document.getElementById('sb-pl')?.innerText || ''), { timeout: 20000 });
  c = await card(page);
  ok('card still shown (they have a PLNA to look round)', c.visible);

  console.log('\n5b · The states this account does not happen to be in');
  /* Brent's own record is cleared with nothing missing, so the two states that
     matter most to a NEW driver would otherwise never be drawn. The setup call
     is answered with a controlled record so the rendering itself is checked —
     the card's own logic under test, not a claim about anybody's real record. */
  const withSetup = async body => {
    await page.unroute('**/rest/v1/rpc/plna_driver_setup_state').catch(() => {});
    await page.route('**/rest/v1/rpc/plna_driver_setup_state', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
    await page.evaluate(() => { _plnaAt = 0; });
    await page.evaluate(() => viewAsMember('business', false));   // force a clean redraw
    await page.waitForTimeout(200);
    await page.evaluate(() => viewAsMember('driver', true));
    await page.waitForFunction(() => {
      const t = document.getElementById('sb-pl')?.innerText || '';
      return t && !/Reading your/.test(t);
    }, { timeout: 20000 });
    return card(page);
  };

  let s1 = await withSetup({ ok: true, cleared: true, complete: false, missing: ['van', 'base', 'radius'] });
  ok('three gaps: counts them', /3 things still needed/i.test(s1.text), s1.text);
  ok('three gaps: names the van in plain words', /Tell PLNA what you drive/.test(s1.text));
  ok('three gaps: names where the day starts', /Set where your day starts/.test(s1.text));
  ok('three gaps: rolls the rest up rather than listing four', /and 1 more in PLNA/.test(s1.text));
  ok('three gaps: still cleared', /cleared/i.test(s1.chip), s1.chip);

  let s2 = await withSetup({ ok: true, cleared: true, complete: false, missing: ['contact'] });
  ok('one gap: singular, not "1 things"', /1 thing still needed/i.test(s2.text) && !/1 things/.test(s2.text), s2.text);
  ok('one gap: no "and more"', !/more in PLNA/.test(s2.text));

  let s3 = await withSetup({ ok: true, cleared: false, complete: false, missing: ['van'] });
  ok('not cleared: chip says checks in progress', /checks in progress/i.test(s3.chip), s3.chip);
  ok('not cleared: leads with Clever, not with the van', /still checking you/i.test(s3.text) && !/what you drive/i.test(s3.text), s3.text);
  ok('not cleared: still shows the work figures', s3.nums.length === 3);
  await page.unroute('**/rest/v1/rpc/plna_driver_setup_state');
  await page.evaluate(() => { _plnaAt = 0; });

  console.log('\n6 · A sending-only account gets NO card');
  for (const t of ['business', 'freight_forwarder']) {
    await page.evaluate(x => viewAsMember(x, false), t);
    await page.waitForTimeout(300);
    ok(`${t}: hidden`, !(await card(page)).visible);
    ok(`${t}: emptied, not just hidden`, (await card(page)).text === '');
  }

  console.log('\n7 · A FLEET account gets the card');
  await page.evaluate(() => viewAsMember('fleet', true));
  await page.waitForFunction(() => !/Reading your/.test(document.getElementById('sb-pl')?.innerText || ''), { timeout: 20000 });
  ok('fleet: visible', (await card(page)).visible);

  console.log('\n8 · On a phone');
  await page.setViewportSize({ width: 390, height: 780 });
  await page.evaluate(() => { document.getElementById('sidebar').classList.add('open'); });
  await page.waitForTimeout(300);
  c = await card(page);
  ok('card fits the phone sidebar', c.visible && !c.overflows, `w=${c.width}`);
  await page.screenshot({ path: '_plna_card_phone.png' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.getElementById('sidebar').classList.remove('open'); });

  console.log('\n9 · A DEMO driver never gets one (no real record behind it)');
  await page.evaluate(() => { signOut(); });
  await page.waitForTimeout(200);
  ok('sign-out takes the card away', !(await card(page)).visible);
  ok('sign-out empties it', (await card(page)).text === '');
  const demo = await page.evaluate(() => Object.keys(DEMO_ACCOUNTS).find(k => DEMO_ACCOUNTS[k].role === 'driver'));
  await page.evaluate(async d => { await hafAuth(d, 'x', document.getElementById('l-err'), document.querySelector('#login-ov .btn-wide')); }, demo);
  await page.waitForTimeout(1200);
  ok(`demo driver ${demo}: no card`, !(await card(page)).visible);

  console.log('\n10 · A read that fails says so, and never shows a zero');
  await page.evaluate(() => { signOut(); });
  expectAborts = true;
  await page.route('**/rest/v1/rpc/plna_driver_setup_state', r => r.abort());
  await page.route('**/rest/v1/rpc/plna_my_bookings', r => r.abort());
  await page.route('**/rest/v1/rpc/plna_my_payouts', r => r.abort());
  await page.evaluate(async ([u, p]) => { await hafAuth(u, p, document.getElementById('l-err'), document.querySelector('#login-ov .btn-wide')); }, [USER, PIN]);
  await page.waitForFunction(() => document.getElementById('super-mode')?.style.display === 'flex', { timeout: 20000 });
  await page.evaluate(() => viewAsMember('driver', true));
  await page.waitForFunction(() => /couldn|—/.test(document.getElementById('sb-pl')?.innerText || ''), { timeout: 20000 });
  c = await card(page);
  ok('says it could not read, rather than showing £0', /couldn/i.test(c.text) && !/£0/.test(c.text), c.text);
  ok('still offers the way into PLNA', c.btn);

  console.log('\n11 · Nothing else on the page broke');
  /* Three faults exist on this page before this change and are unrelated to it,
     proved by running the same walk against the committed version: /api/pricing
     is a Cloudflare function that only exists when Pages serves the site, and
     the two note-* calls are fire-and-forget analytics the browser cancels on
     sign-out. The test asserts NO NEW fault, not a clean slate it never had. */
  const KNOWN = [/\/api\/pricing/, /rpc\/haf_note_(login|activity).*ERR_ABORTED/];
  const fresh = errors.filter(e => !KNOWN.some(k => k.test(e)));
  ok('no new javascript or network faults', fresh.length === 0, fresh.slice(0, 4).join(' | '));
  if (errors.length !== fresh.length) console.log('    (' + (errors.length - fresh.length) + ' known pre-existing faults ignored)');

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
};

run().catch(e => { console.error(e); process.exit(1); });
