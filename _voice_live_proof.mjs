/* Brent sends nothing, everyone reads what he posts — proved in a browser on
 * the live site.
 *
 * Brent, 10 Sep: "instead of people posting, what about if they send it to me
 * and i post it to the whole network? saves the issues and the worries."
 *
 * The SQL proof already showed the database refuses the wrong people. This one
 * answers the different question: does the thing a person actually opens do
 * what the database allows. It signs in as Brent for real, reads his Master
 * Overview, posts a live update to the whole network, then signs in as two
 * different members and checks who can see what — including the one check that
 * matters most, that member B cannot read a word member A sent in.
 *
 * It cleans up after itself: the update is pulled back off the network and both
 * test notes are deleted at the end.
 *
 * Run:  node _voice_live_proof.mjs [url]
 */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

const BASE = process.argv[2] || 'https://knect.usehaf.co.uk/';
const OWNER = 'BF638793', OWNER_PIN = '0641';
const A = 'ZZ999001', B = 'ZZ999004';
const TAG = 'LIVEPROOF';

/* The two members sign in through the real front door with a PIN this file
   sets on them first. An earlier version of this proof injected _hafCred onto
   window instead — which does nothing, because _hafCred is a closure variable,
   so every member check "passed" against a signed-out page. A check that
   passes because there was nothing to check is worse than no check. */
const DBURL = execFileSync('bash', ['-lc',
  "grep -oE 'postgresql://[^ \"]+' /agent/workspace/haf-driver-app/.env.local | head -1"],
  { encoding: 'utf8' }).trim();
const sql = q => execFileSync('psql', [DBURL, '-tAc', q], { encoding: 'utf8' }).trim();
const PIN = '1234';
for (const u of [A, B]) {
  sql(`update plna_drivers set pin_hash = encode(digest('${u}:${PIN}','sha256'),'hex') where haf_username='${u}'`);
}
const isTest = sql(`select count(*) from haf_network_account where username in ('${A}','${B}') and is_test`);
if (isTest !== '2') { console.log('STOP — those two accounts are not both flagged as test rows'); process.exit(1); }

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ok    ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1100 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

/* ══ 1. WHAT IS ACTUALLY SERVED ══════════════════════════════════════════ */
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
const served = await page.content();
console.log('\nWHAT IS SERVED AT ' + BASE);
ok('the network can be told something privately', served.includes('haf_signal_post'));
ok('only the owner has a way to post outward',    served.includes('haf_broadcast_post'));
ok('the old open board is gone from the page',    !served.includes('knect_feedback_board'));
ok('and so is the board it could not read',       !served.includes('knect_feedback_ideas'));
ok('the sidebar carries the community',           served.includes("l:'HAF KNECT Community'"));

/* ══ 2. BRENT'S MASTER OVERVIEW ══════════════════════════════════════════ */
await page.evaluate(async ([u, p]) => {
  await hafAuth(u, p, document.getElementById('l-err'), document.querySelector('#login-ov .btn-wide'));
}, [OWNER, OWNER_PIN]);
await page.waitForFunction(() => document.getElementById('super-mode')?.style.display === 'flex', { timeout: 25000 });
ok('Brent reaches his master door', await page.evaluate(() => localStorage.getItem('knect-user') === 'BF638793'));

await page.evaluate(() => enterMode('admin'));
await page.waitForTimeout(1200);
await page.evaluate(() => switchTab('pane-admin'));
await page.waitForFunction(() => {
  const k = document.getElementById('sig-kpis');
  return k && k.children.length > 0;
}, { timeout: 25000 });

const ov = await page.evaluate(() => {
  const t = id => (document.getElementById(id) || {}).innerText || '';
  return {
    title: t('sig-card').split('\n')[0],
    kpis: [...document.querySelectorAll('#sig-kpis .kc')].map(e => e.innerText.replace(/\n/g, ' | ')),
    speed: t('sig-speed').trim(),
    waiting: t('sig-waiting').trim().slice(0, 200),
    pubBox: !!document.getElementById('pub-go'),
    pubLive: t('pub-live').trim().slice(0, 200),
  };
});
console.log('\nHIS MASTER OVERVIEW, FEEDBACK SECTION');
console.log('  heading :', JSON.stringify(ov.title));
for (const k of ov.kpis) console.log('  ·', k);
console.log('  speed   :', JSON.stringify(ov.speed.slice(0, 150)));
console.log('  waiting :', JSON.stringify(ov.waiting.slice(0, 120)));

ok('the feedback section is on the Master Overview', /telling you/i.test(ov.title), ov.title);
ok('it shows six live numbers',                      ov.kpis.length === 6, String(ov.kpis.length));
ok('and says how fast the loop is turning',          /hours|looked at yet/i.test(ov.speed), ov.speed.slice(0, 80));
ok('the post-to-network box is on the same screen',  ov.pubBox);

/* ══ 3. A MEMBER SENDS SOMETHING IN ══════════════════════════════════════ */
const pageA = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const errA = []; pageA.on('pageerror', e => errA.push(String(e)));
await pageA.goto(BASE, { waitUntil: 'domcontentloaded' });
await pageA.evaluate(async ([u, p]) => {
  await hafAuth(u, p, document.getElementById('l-err'), document.querySelector('#login-ov .btn-wide'));
}, [A, PIN]);
await pageA.waitForFunction(u => localStorage.getItem('knect-user') === u, A, { timeout: 25000 });
ok('member A signs in for real', await pageA.evaluate(() => !!document.getElementById('nav-list')));
await pageA.waitForTimeout(2000);
await pageA.evaluate(() => switchTab('pane-forum'));
await pageA.waitForTimeout(2500);

await pageA.evaluate(t => {
  document.getElementById('fm-topic').value = 'plna';
  document.getElementById('fm-kind').value = 'problem';
  document.getElementById('fm-title').value = t + ' the planner is shit on my phone';
  document.getElementById('fm-body').value = 'It takes ages to load when I am stood at a bay.';
  fmPost();
}, TAG);
await pageA.waitForTimeout(3500);

const aSent = await pageA.evaluate(() => ({
  msg: (document.getElementById('fm-msg') || {}).innerText || '',
  mine: (document.getElementById('fm-mine') || {}).innerText || '',
}));
console.log('\nWHAT MEMBER A SEES AFTER SENDING');
console.log('  told  :', JSON.stringify(aSent.msg.trim().slice(0, 140)));
console.log('  their own line:', JSON.stringify(aSent.mine.trim().replace(/\s+/g, ' ').slice(0, 170)));

ok('they are told it went to HAF and nowhere else', /only the haf team/i.test(aSent.msg), aSent.msg.slice(0, 80));
ok('it appears under what they have sent',          aSent.mine.includes(TAG));
ok('the rude word was muted on the way in',         aSent.mine.includes('•') && !/shit/i.test(aSent.mine));
ok('and the line says only HAF can see it',         /only HAF can see this/i.test(aSent.mine));

/* ══ 4. THE CHECK THAT MATTERS: MEMBER B CANNOT SEE IT ═══════════════════ */
const pageB = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
await pageB.goto(BASE, { waitUntil: 'domcontentloaded' });
await pageB.evaluate(async ([u, p]) => {
  await hafAuth(u, p, document.getElementById('l-err'), document.querySelector('#login-ov .btn-wide'));
}, [B, PIN]);
await pageB.waitForFunction(u => localStorage.getItem('knect-user') === u, B, { timeout: 25000 });
await pageB.waitForTimeout(2000);
await pageB.evaluate(() => switchTab('pane-forum'));
await pageB.waitForTimeout(3000);

const bSees = await pageB.evaluate(() => (document.body.innerText || ''));
console.log('\nWHAT A DIFFERENT MEMBER SEES');
/* This check is only worth anything if B is genuinely signed in and genuinely
   being served a feed — otherwise "cannot see it" just means "saw nothing at
   all". Both are asserted before the leak check is allowed to count. */
const bLive = await pageB.evaluate(() => ({
  signedIn: localStorage.getItem('knect-user'),
  src: (document.getElementById('fm-src') || {}).innerText || '',
}));
ok('member B is really signed in', bLive.signedIn === B, String(bLive.signedIn));
ok('and is really being served the feed', /update/i.test(bLive.src), bLive.src.slice(0, 80));
ok('member B cannot read what member A sent in', !bSees.includes(TAG + ' the planner'),
   'THE PRIVATE NOTE LEAKED TO ANOTHER ACCOUNT');
ok('member B has nothing of their own to show',  /have not sent us anything/i.test(bSees));

/* ══ 5. BRENT ANSWERS EVERYONE ═══════════════════════════════════════════ */
page.on('dialog', d => d.accept());
await page.evaluate(() => sigLoad(true));
await page.waitForTimeout(3000);
const waitingHasIt = await page.evaluate(t => ((document.getElementById('sig-waiting') || {}).innerText || '').includes(t), TAG);
ok('what they sent is waiting on Brent within seconds', waitingHasIt);

/* Press "Answer everyone" on the actual note, the way he would — not the
   publish box on its own. That button is what carries the link back to the
   person who wrote in, and an update posted without it is a different action
   with a different result. An earlier run tested the standalone box and then
   complained the person's note had not closed; it had no reason to. */
const answered = await page.evaluate(t => {
  const rows = [...document.querySelectorAll('#sig-waiting .sig-row')];
  const row = rows.find(r => r.innerText.includes(t));
  if (!row) return false;
  const btn = [...row.querySelectorAll('button')].find(b => /answer everyone/i.test(b.innerText));
  if (!btn) return false;
  btn.click();
  return true;
}, TAG);
ok('the note carries an "Answer everyone" button', answered);
await page.waitForTimeout(900);
const carried = await page.evaluate(() => ({
  from: (document.getElementById('pub-from') || {}).value || '',
  title: (document.getElementById('pub-title') || {}).value || '',
  topic: (document.getElementById('pub-topic') || {}).value || '',
}));
ok('pressing it fills the update box from their note', !!carried.from && carried.title.includes(TAG), carried.title);
ok('and picks the right side of the network',          carried.topic === 'plna', carried.topic);

await page.evaluate(t => {
  document.getElementById('pub-title').value = t + ' planner speed fix is live';
  document.getElementById('pub-body').value = 'It now loads in under a second on a phone. Thanks to everyone who told us.';
  sigPublish();
}, TAG);
await page.waitForTimeout(4000);

const afterPub = await page.evaluate(() => ({
  msg: (document.getElementById('pub-msg') || {}).innerText || '',
  live: (document.getElementById('pub-live') || {}).innerText || '',
}));
console.log('\nAFTER HE POSTS TO THE NETWORK');
console.log('  told :', JSON.stringify(afterPub.msg.trim().slice(0, 120)));
ok('the update posts', /posted to the whole network/i.test(afterPub.msg), afterPub.msg.slice(0, 90));
ok('and shows as live on the network', afterPub.live.includes(TAG));

/* ══ 6. EVERY MEMBER SEES IT, INCLUDING THE ONE WHO NEVER WROTE IN ═══════ */
await pageB.evaluate(() => fmLoad(true));
await pageB.waitForTimeout(3000);
const bAfter = await pageB.evaluate(() => ({
  list: (document.getElementById('fm-list') || {}).innerText || '',
  all: document.body.innerText || '',
}));
ok('a member who sent nothing still gets the update', bAfter.list.includes(TAG + ' planner speed fix'));
ok('it is marked as coming from HAF',                 /HAF update/i.test(bAfter.list));
ok('and there is still no way for them to reply to it in public',
   !/add a reply/i.test(bAfter.list.toLowerCase()));

/* ══ 7. AND IT CLOSED THE LOOP FOR THE PERSON WHO RAISED IT ══════════════ */
await pageA.evaluate(() => fmLoad(true));
await pageA.waitForTimeout(3000);
const aAfter = await pageA.evaluate(() => ({
  mine: (document.getElementById('fm-mine') || {}).innerText || '',
  list: (document.getElementById('fm-list') || {}).innerText || '',
}));
console.log('\nBACK ON MEMBER A\'S SCREEN');
console.log('  their line now:', JSON.stringify(aAfter.mine.trim().replace(/\s+/g, ' ').slice(0, 200)));
ok('their own note now reads as done',        /\bDone\b/.test(aAfter.mine));
ok('and tells them where the answer went',    /posted to the whole network/i.test(aAfter.mine));
ok('they see the update too',                 aAfter.list.includes(TAG + ' planner speed fix'));

/* ══ 8. TAKING IT BACK DOWN ══════════════════════════════════════════════ */
const upd = sql(`select id from haf_signal where title like '${TAG}%speed fix%' limit 1`);
await page.evaluate(id => sigPull(id), upd);
await page.waitForTimeout(3000);
await pageB.evaluate(() => fmLoad(true));
await pageB.waitForTimeout(2500);
const bPulled = await pageB.evaluate(() => (document.getElementById('fm-list') || {}).innerText || '');
ok('pulling an update takes it off a member screen', !bPulled.includes(TAG + ' planner speed fix'));

ok('no script errors on the owner screen',  errors.length === 0, errors[0] || '');
ok('no script errors on a member screen',   errA.length === 0, errA[0] || '');

/* ══ TIDY ════════════════════════════════════════════════════════════════ */
sql(`delete from haf_signal where title like '${TAG}%'`);
sql(`delete from haf_account_ledger where haf_username='${A}' and area='Feedback'`);
sql(`delete from haf_network_event where username='${A}' and event like 'feedback%'`);

await page.screenshot({ path: '_voice_overview.png', fullPage: false });
await pageA.screenshot({ path: '_voice_member.png', fullPage: false });
await browser.close();
console.log(`\n════ LIVE: ${pass} passed, ${fail} failed ════`);
process.exit(fail ? 1 : 0);
