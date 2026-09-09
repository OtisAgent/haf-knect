/* Brent's own login, signed in for real, and what his sidebar actually contains.
 *
 * Brent, 9 Sep: "make sure my log in updates in real time with the HAF KNECT
 * Dashboard and PLNA alterations — my log in BF638793 Freight forward account
 * not changed."
 *
 * Nothing here is stubbed. It signs in with his real credential against the
 * live PLNA database, goes through the master door he goes through, presses
 * "My Account", and reads the sidebar off the page. The list of things it looks
 * for is the work of the last three days — the PLNA card, the documents
 * section, Team Members, Backload, Saved Addresses, share & earn — because
 * "not changed" is a claim about exactly those, and a claim about them can only
 * be settled by looking.
 *
 * Run:  node _master_live_proof.mjs [url]
 *       default https://knect.usehaf.co.uk/ — pass a local URL to check a build
 *       before it is pushed.
 */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
import crypto from 'node:crypto';

const BASE = process.argv[2] || 'https://knect.usehaf.co.uk/';
const USER = 'BF638793';
const PIN  = '0641';                       // his own, already in this repo's e2e tests
const SUPA = 'https://ggkpqqrtxtlafdkxcaqg.supabase.co';
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdna3BxcXJ0eHRsYWZka3hjYXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxOTM2NjAsImV4cCI6MjA5Nzc2OTY2MH0.hB70KOYZu4dshwhsrxF_dFyBn0n72gStWTwxYGsLdgY';

const relay = crypto.createHash('sha256').update(`${USER}:${PIN}`).digest('hex');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) pass++;
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
};

/* What the database says about him, fetched independently of the page, so the
   page can be checked against it rather than against my expectations. */
const auth = await (await fetch(`${SUPA}/rest/v1/rpc/knect_auth`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_username: USER, p_hash: null, p_relay: relay, p_cp: null }),
})).json();
const rec = Array.isArray(auth) && auth[0];
if (!rec) { console.log('the database refused the credential — stopping'); process.exit(1); }

console.log('\nWHAT THE DATABASE HANDS HIS SIGN-IN');
console.log('  account_type  :', rec.account_type);
console.log('  plna_eligible :', rec.plna_eligible);
console.log('  plna_released :', rec.plna_released, rec.plna_basis ? '(' + rec.plna_basis + ')' : '');
ok('the database says his account may drive', rec.plna_eligible === true);
ok('and that it is on the owner override',    rec.plna_basis === 'owner_override' || rec.plna_released === true);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });

const served = await page.content();
console.log('\nWHAT IS SERVED AT ' + BASE);
ok('the page reads eligibility off the record', served.includes('plna_eligible===true'));
ok('and no longer works it out for itself',     !served.includes("const drives=(type==='driver'||type==='fleet');"));
ok('his own door builds the member sidebar',    served.includes('const macc=_hafAcct?hafAccess(_hafAcct):null;'));

/* Sign in exactly as he does. */
await page.evaluate(async ([u, p]) => {
  await hafAuth(u, p, document.getElementById('l-err'), document.querySelector('#login-ov .btn-wide'));
}, [USER, PIN]);
await page.waitForFunction(() => document.getElementById('super-mode')?.style.display === 'flex', { timeout: 20000 });
ok('he reaches his master door', await page.evaluate(() => localStorage.getItem('knect-user') === 'BF638793'));

/* ...and presses My Account. */
await page.evaluate(() => enterMode('personal'));
await page.waitForTimeout(3500);

const view = await page.evaluate(() => {
  const acc = window._hafAccView || {};
  const nav = (window.hafNavModel ? window.hafNavModel(acc) : []).map(s => ({
    id: s.id, label: s.l.replace(/&amp;/g, '&'), locked: !!s.locked, why: s.why || '',
    tabs: (s.tabs || []).map(t => t.l.replace(/&amp;/g, '&')),
  }));
  const vis = id => { const e = document.getElementById(id); return !!(e && e.style.display !== 'none' && e.innerText.trim()); };
  const txt = id => { const e = document.getElementById(id); return e ? e.innerText.trim() : ''; };
  return {
    acc: { type: acc.type, drives: acc.drives, released: acc.released },
    role: window.HAF_ROLE,
    chip: txt('tb-role'),
    pill: txt('mode-pill-lbl'),
    plnaBtn: (() => { const e = document.getElementById('plna-link-btn'); return e ? getComputedStyle(e).display : 'absent'; })(),
    nav,
    items: nav.flatMap(s => s.tabs),
    plnaCard: vis('sb-pl') ? txt('sb-pl').replace(/\s+/g, ' ') : '',
    affCard: vis('sb-af') ? txt('sb-af').replace(/\s+/g, ' ') : '',
    navText: (document.getElementById('nav-list') || {}).innerText || '',
  };
});

console.log('\nWHAT HIS "MY ACCOUNT" SIDEBAR NOW CONTAINS');
console.log('  door       :', JSON.stringify(view.pill), '· chip', JSON.stringify(view.chip), '· job cards read as', view.role);
console.log('  account    :', view.acc.type, '| drives:', view.acc.drives, '| released:', view.acc.released);
for (const s of view.nav) console.log('  ' + (s.locked ? '🔒 ' : '   ') + s.label + (s.locked ? ' — ' + s.why : ': ' + s.tabs.join(', ')));
console.log('  PLNA card  :', JSON.stringify(view.plnaCard.slice(0, 110)));
console.log('  share&earn :', JSON.stringify(view.affCard.slice(0, 110)));

const has = re => view.items.some(t => re.test(t));
const sec = id => view.nav.find(s => s.id === id);

ok('he came in through his own door',            /^my account$/i.test(view.pill), view.pill);
ok('his account still reads Freight Forwarder',  view.acc.type === 'freight_forwarder', view.acc.type);
ok('job cards still read from his sending side', view.role === 'freight', view.role);

/* The alterations of the last three days, one line each. Every one of these was
   missing from PERSONAL_NAV. */
console.log('');
ok('PLNA section is there',            !!sec('plna'));
ok('PLNA is open, not padlocked',      sec('plna') && sec('plna').locked === false, sec('plna') && sec('plna').why);
ok('the PLNA at-a-glance card paints', view.plnaCard.length > 0, '(empty)');
ok('the button through to PLNA shows', view.plnaBtn !== 'none' && view.plnaBtn !== 'absent', view.plnaBtn);
ok('Clever Checked & documents',       !!sec('compliance') && sec('compliance').locked === false);
ok('Team Members',                     has(/Team Members/i));
ok('Backload',                         has(/Backload/i));
ok('Job Offers',                       has(/Job Offers/i));
ok('Available Network Jobs',           has(/Available Network Jobs/i));
ok('My Posted Jobs',                   has(/My Posted Jobs/i));
ok('Saved Addresses',                  has(/Saved Addresses/i));
ok('share & earn card',                view.affCard.length > 0, '(empty)');
ok('his freight screens are all there', has(/Active Loads/i) && has(/Lane Pricing/i) && has(/Account Controls/i));
ok('he is not told "Drivers only"',    !/Drivers only/i.test(view.navText));
/* And the two screens taken off every member months ago are not back. */
ok('no Network Map on a member sidebar', !has(/Network Map/i));
ok('no Driver Directory either',         !has(/Driver Directory/i) || !!sec('work'));

ok('no javascript errors on the way', errors.length === 0, errors.slice(0, 2).join(' | '));

await page.screenshot({ path: '_master_account_sidebar.png' });

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed' + (fail ? '  — ' + fail + ' FAILED' : ''));
await browser.close();
process.exit(fail ? 1 : 0);
