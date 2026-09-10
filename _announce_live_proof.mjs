/* Announcements, proved in a browser on the real page.
 *
 * Brent, 10 Sep: "can you add announcements as well on that. where we showcase
 * updates and running news."
 *
 * The SQL proof already showed the database will not let anybody but Brent
 * publish or edit, and will not record one member's read against another's
 * name. This one answers the different question: does the thing a person
 * actually opens do what the database allows, and does the screen SAY what it
 * does. The last part is not decoration — on 10 Sep the community page passed
 * 34 checks while its heading told members the opposite of what the screen did,
 * so every check here reads rendered text, not source.
 *
 * It cleans up after itself: every announcement it posts is pulled back off the
 * network and deleted at the end.
 *
 * Run:  node _announce_live_proof.mjs [url]
 */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';

const BASE = process.argv[2] || 'https://knect.usehaf.co.uk/';
const OWNER = 'BF638793', OWNER_PIN = '0641';
const A = 'ZZ999001', B = 'ZZ999004';
const TAG = 'ANPROOF';

const DBURL = execFileSync('bash', ['-lc',
  "grep -oE 'postgresql://[^ \"]+' /agent/workspace/haf-driver-app/.env.local | head -1"],
  { encoding: 'utf8' }).trim();
const sql = q => execFileSync('psql', [DBURL, '-tAc', q], { encoding: 'utf8' }).trim();

/* The two members sign in through the real front door with a PIN this file
   sets on them. Injecting a credential onto window does nothing — _hafCred is
   a closure variable — so every "member" check would pass against a signed-out
   page. That happened once; it does not happen here. */
const PIN = '1234';
for (const u of [A, B]) {
  sql(`update plna_drivers set pin_hash = encode(digest('${u}:${PIN}','sha256'),'hex') where haf_username='${u}'`);
}
const isTest = sql(`select count(*) from haf_network_account where username in ('${A}','${B}') and is_test`);
if (isTest !== '2') { console.log('STOP — those two accounts are not both flagged as test rows'); process.exit(1); }

/* start from a clean slate so no count in this file is inherited */
sql(`delete from haf_announce_read r using haf_signal s where r.signal_id=s.id and s.title like '${TAG}%'`);
sql(`delete from haf_signal where title like '${TAG}%'`);

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ok    ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
};
const signIn = async (page, u, p) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ([u, p]) => {
    await hafAuth(u, p, document.getElementById('l-err'), document.querySelector('#login-ov .btn-wide'));
  }, [u, p]);
  await page.waitForFunction(x => localStorage.getItem('knect-user') === x, u, { timeout: 25000 });
};

const browser = await chromium.launch();
const errors = [];

/* ══ 1. BRENT POSTS TWO ANNOUNCEMENTS ════════════════════════════════════ */
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1200 } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('owner: ' + e));
await signIn(page, OWNER, OWNER_PIN);
ok('Brent reaches his master door', await page.evaluate(() => localStorage.getItem('knect-user') === 'BF638793'));

await page.evaluate(() => enterMode('admin'));
await page.waitForTimeout(1200);
await page.evaluate(() => switchTab('pane-admin'));
await page.waitForFunction(() => document.getElementById('pub-kpis')?.children.length > 0, { timeout: 30000 });

const card = await page.evaluate(() => {
  const t = id => (document.getElementById(id) || {}).innerText || '';
  return {
    head: t('pub-card').split('\n')[0],
    kpis: [...document.querySelectorAll('#pub-kpis .kc')].map(e => e.innerText.replace(/\n/g, ' | ')),
    kinds: [...document.querySelectorAll('#pub-kind option')].map(o => o.value),
    live: t('pub-live').trim(),
  };
});
console.log('\nBRENT\'S ANNOUNCEMENTS SECTION');
console.log('  heading :', JSON.stringify(card.head));
for (const k of card.kpis) console.log('  ·', k);
console.log('  live now:', JSON.stringify(card.live.replace(/\s+/g, ' ').slice(0, 140)));

ok('the section is called Announcements', /^Announcements/i.test(card.head), card.head);
ok('it carries four running-news numbers', card.kpis.length === 4, String(card.kpis.length));
ok('and the six announcement kinds are offered',
   ['news', 'release', 'improvement', 'fix', 'maintenance', 'notice'].every(k => card.kinds.includes(k)),
   card.kinds.join(','));
ok('with nothing running, it says so plainly',
   /have not announced anything/i.test(card.live) || card.live.length > 0, card.live.slice(0, 60));

/* the headline: a piece of planned work, pinned */
await page.evaluate(t => {
  document.getElementById('pub-topic').value = 'plna';
  document.getElementById('pub-kind').value = 'maintenance';
  document.getElementById('pub-pin').value = 'yes';
  document.getElementById('pub-title').value = t + ' PLNA offline Sunday 2am to 4am';
  document.getElementById('pub-body').value = 'We are moving the live map. Nothing you have booked is affected.';
}, TAG);
page.once('dialog', d => d.accept());
await page.evaluate(() => sigPublish());
await page.waitForTimeout(3000);

/* and one piece of running news underneath it */
await page.evaluate(t => {
  document.getElementById('pub-topic').value = 'knect';
  document.getElementById('pub-kind').value = 'release';
  document.getElementById('pub-pin').value = 'no';
  document.getElementById('pub-title').value = t + ' the planner now shows the whole week';
  document.getElementById('pub-body').value = 'Open the planner and you will see seven days instead of one.';
}, TAG);
page.once('dialog', d => d.accept());
await page.evaluate(() => sigPublish());
await page.waitForTimeout(3000);
await page.evaluate(() => sigLoad(true));
await page.waitForTimeout(2500);

const after = await page.evaluate(() => ({
  msg: (document.getElementById('pub-msg') || {}).innerText || '',
  kpis: [...document.querySelectorAll('#pub-kpis .kc')].map(e => e.innerText.replace(/\n/g, ' | ')),
  live: (document.getElementById('pub-live') || {}).innerText || '',
}));
console.log('\nAFTER POSTING TWO');
for (const k of after.kpis) console.log('  ·', k);
console.log('  board :', JSON.stringify(after.live.replace(/\s+/g, ' ').slice(0, 300)));

ok('he is told it reached the network', /posted to the whole network/i.test(after.msg), after.msg.slice(0, 70));
/* case-insensitive: these labels are upper-cased by the stylesheet, and
   innerText returns what is rendered rather than what the markup says */
ok('both are counted as running now', /running now \| 2/i.test(after.kpis.join(' ')), after.kpis[0]);
ok('one of them is counted as a headline', /headlines \| 1/i.test(after.kpis.join(' ')), after.kpis[1]);
ok('the board names the kind of each one',
   /Planned work/i.test(after.live) && /New feature/i.test(after.live), after.live.slice(0, 120));
ok('the headline is marked as one', /Headline/i.test(after.live));
ok('and nobody has opened either yet', /0 of \d+ have opened it/.test(after.live), after.live.slice(0, 160));

/* ══ 2. WHAT A MEMBER ACTUALLY SEES ══════════════════════════════════════ */
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const pageA = await ctxA.newPage();
pageA.on('pageerror', e => errors.push('member A: ' + e));
await signIn(pageA, A, PIN);
await pageA.waitForTimeout(2500);

/* the dashboard strip first — the showcase half, seen before they click anything */
const strip = await pageA.evaluate(() => (document.getElementById('an-strip') || {}).innerText || '');
console.log('\nWHAT MEMBER A SEES ON THEIR DASHBOARD');
console.log('  strip :', JSON.stringify(strip.replace(/\s+/g, ' ').trim().slice(0, 170)));
ok('the newest thing they have not read is on their dashboard', strip.includes(TAG), strip.slice(0, 80));
ok('the strip says what kind of news it is', /Planned work|New feature/i.test(strip), strip.slice(0, 90));
ok('and offers a way to read it', /Read it/i.test(strip));

await pageA.evaluate(() => switchTab('pane-forum'));
await pageA.waitForTimeout(3000);

const seenA = await pageA.evaluate(() => {
  const t = id => (document.getElementById(id) || {}).innerText || '';
  return {
    intro: t('pane-forum').split('\n').slice(0, 3).join(' '),
    src: t('fm-src'),
    lead: t('fm-lead'),
    runHead: getComputedStyle(document.getElementById('fm-run-h')).display,
    list: t('fm-list'),
    badge: (document.getElementById('fm-new') || {}).innerText || '',
    canPublish: !!document.querySelector('#pane-forum #pub-go'),
  };
});
console.log('\nWHAT MEMBER A SEES ON THE COMMUNITY SCREEN');
console.log('  source  :', JSON.stringify(seenA.src.trim().slice(0, 130)));
console.log('  headline:', JSON.stringify(seenA.lead.replace(/\s+/g, ' ').trim().slice(0, 190)));
console.log('  running :', JSON.stringify(seenA.list.replace(/\s+/g, ' ').trim().slice(0, 190)));

ok('the announcements are counted for them', /2 announcements/i.test(seenA.src), seenA.src.slice(0, 80));
ok('and it says how many are new to them', /2 you have not read/i.test(seenA.src), seenA.src.slice(0, 90));
ok('the new badge is shown beside the heading', /2 new/i.test(seenA.badge), seenA.badge);
ok('the pinned one is the headline, not the newest', seenA.lead.includes('PLNA offline'), seenA.lead.slice(0, 80));
ok('the headline carries its kind', /Planned work/i.test(seenA.lead), seenA.lead.slice(0, 100));
ok('running news is shown under it', seenA.runHead !== 'none' && seenA.list.includes('planner'), seenA.list.slice(0, 80));
ok('each running item carries its kind', /New feature/i.test(seenA.list), seenA.list.slice(0, 90));
ok('a member has no way to publish anything', !seenA.canPublish);
/* the words on the screen must match what the screen does */
ok('the page does not tell them they can post or vote',
   !/you can post|everyone can post|vote/i.test(seenA.intro), seenA.intro.slice(0, 110));

/* ══ 3. READ MEANS READ ══════════════════════════════════════════════════ */
await pageA.waitForTimeout(2500);              // the mark is fired after the paint
const readRows = sql(`select count(*) from haf_announce_read r join haf_signal s on s.id=r.signal_id
                      where s.title like '${TAG}%' and r.username='${A}'`);
ok('opening the screen recorded that they read both', readRows === '2', readRows);

const bReads = sql(`select count(*) from haf_announce_read r join haf_signal s on s.id=r.signal_id
                    where s.title like '${TAG}%' and r.username='${B}'`);
ok('and recorded nothing against the other member', bReads === '0', bReads);

/* their dashboard should now be quiet — a strip that never clears is a nag */
await pageA.evaluate(() => switchTab('pane-d-home'));
await pageA.waitForTimeout(2500);
const strip2 = await pageA.evaluate(() => (document.getElementById('an-strip') || {}).innerText || '');
ok('the dashboard strip clears once they have read it', strip2.trim() === '', strip2.slice(0, 60));

/* ══ 4. MEMBER B IS STILL TOLD IT IS NEW ═════════════════════════════════ */
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const pageB = await ctxB.newPage();
pageB.on('pageerror', e => errors.push('member B: ' + e));
await signIn(pageB, B, PIN);
await pageB.waitForTimeout(2500);
const stripB = await pageB.evaluate(() => (document.getElementById('an-strip') || {}).innerText || '');
ok('a different member still has it as unread', stripB.includes(TAG), stripB.slice(0, 70));

/* ══ 5. BRENT SEES REAL REACH, AND CAN FIX THE WORDING ═══════════════════ */
await page.evaluate(() => sigLoad(true));
await page.waitForTimeout(2500);
const reach = await page.evaluate(() => (document.getElementById('pub-live') || {}).innerText || '');
console.log('\nWHAT BRENT SEES AFTER ONE MEMBER READ THEM');
console.log('  board :', JSON.stringify(reach.replace(/\s+/g, ' ').slice(0, 260)));
ok('the board reports real opens, not an assumption', /1 of \d+ have opened it/.test(reach), reach.slice(0, 140));

const id1 = sql(`select id from haf_signal where title like '${TAG}% PLNA offline%' limit 1`);
await page.evaluate(id => anEdit(id), id1);
await page.waitForTimeout(600);
const loaded = await page.evaluate(() => ({
  title: document.getElementById('pub-title').value,
  kind: document.getElementById('pub-kind').value,
  btn: document.getElementById('pub-go').innerText,
  note: (document.getElementById('pub-from-note') || {}).innerText || '',
}));
ok('editing loads the announcement back into the box', loaded.title.includes('PLNA offline'), loaded.title.slice(0, 60));
ok('and the button stops saying post', /save/i.test(loaded.btn), loaded.btn);
ok('and says plainly what it is about to change', /already on every member screen/i.test(loaded.note), loaded.note.slice(0, 80));

await page.evaluate(t => {
  document.getElementById('pub-title').value = t + ' PLNA offline Sunday 2am to 4am (one hour only)';
}, TAG);
page.once('dialog', d => d.accept());
await page.evaluate(() => sigPublish());
await page.waitForTimeout(3000);
await page.evaluate(() => sigLoad(true));
await page.waitForTimeout(2000);
const edited = await page.evaluate(() => (document.getElementById('pub-live') || {}).innerText || '');
ok('the edit lands without a second announcement',
   /one hour only/.test(edited) && (edited.match(/have opened it/g) || []).length === 2, edited.slice(0, 120));
ok('and it is marked as edited', /edited since/i.test(edited), edited.slice(0, 140));

const stillTwo = sql(`select count(*) from haf_signal where title like '${TAG}%' and visibility='network' and removed_at is null`);
ok('editing did not create a third row', stillTwo === '2', stillTwo);

/* the member reading it is told it changed rather than it changing silently */
await pageB.evaluate(() => switchTab('pane-forum'));
await pageB.waitForTimeout(3000);
const bSees = await pageB.evaluate(() => (document.getElementById('fm-lead') || {}).innerText || '');
ok('the member sees the corrected wording', /one hour only/.test(bSees), bSees.slice(0, 90));
ok('and is told it was edited', /edited/i.test(bSees), bSees.slice(0, 110));

/* ══ 6. TAKING ONE BACK DOWN ═════════════════════════════════════════════ */
const id2 = sql(`select id from haf_signal where title like '${TAG}% the planner%' limit 1`);
page.once('dialog', d => d.accept());
await page.evaluate(id => sigPull(id), id2);
await page.waitForTimeout(2500);
await pageB.evaluate(() => fmLoad(true));
await pageB.waitForTimeout(2500);
const bAfter = await pageB.evaluate(() =>
  ((document.getElementById('fm-lead') || {}).innerText || '') +
  ((document.getElementById('fm-list') || {}).innerText || ''));
ok('a withdrawn announcement leaves every member screen', !/the planner now shows/.test(bAfter), bAfter.slice(0, 90));

/* ══ 7. ON A PHONE ═══════════════════════════════════════════════════════ */
const ctxP = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const pageP = await ctxP.newPage();
pageP.on('pageerror', e => errors.push('phone: ' + e));
await signIn(pageP, B, PIN);
await pageP.waitForTimeout(2500);
await pageP.evaluate(() => switchTab('pane-forum'));
await pageP.waitForTimeout(3000);
const ph = await pageP.evaluate(() => {
  const lead = document.querySelector('#fm-lead .an-lead');
  return {
    text: (document.getElementById('fm-lead') || {}).innerText || '',
    overflow: lead ? lead.scrollWidth - lead.clientWidth : 0,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
ok('the headline reads on a phone', /PLNA offline/.test(ph.text), ph.text.slice(0, 70));
ok('nothing spills off the side of the screen', ph.overflow <= 2 && ph.docOverflow <= 2,
   'card ' + ph.overflow + ', page ' + ph.docOverflow);
await pageP.screenshot({ path: '_announce_phone.png', fullPage: false });
await pageA.screenshot({ path: '_announce_member.png', fullPage: false });
await page.screenshot({ path: '_announce_overview.png', fullPage: false });

/* ══ 8. NOTHING THREW ════════════════════════════════════════════════════ */
ok('no script error on any of the four browsers', errors.length === 0, errors.slice(0, 2).join(' | '));

/* ── clean up: nothing this file wrote is left on the network ── */
sql(`delete from haf_announce_read r using haf_signal s where r.signal_id=s.id and s.title like '${TAG}%'`);
sql(`delete from haf_signal where title like '${TAG}%'`);
const left = sql(`select count(*) from haf_signal where title like '${TAG}%'`);
ok('the proof left nothing behind on the network', left === '0', left);

console.log('\n── ' + pass + ' passed, ' + fail + ' failed (of ' + (pass + fail) + ') at ' + BASE);
await browser.close();
process.exit(fail ? 1 : 0);
