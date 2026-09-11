/* THE DEMO CENTRE SAYS WHAT THE LIVE PRODUCT SAYS
   ===============================================
   Brent, 11 Sep: "confirm they're all aligned".

   So this does not check that the page looks right. It reads the live product
   and the page, and fails if they disagree — every screen name on the poster
   walk, the driver walk, the PLNA bar, Clever's four stages, Clever's account
   types, the fields on the real sign-up form, and the four level limits.

   It also signs in to the demo database with the two logins the page hands out,
   because a login printed on a page is a promise.

   Run:  node scripts/test_demo_centre.mjs            (BASE overrides the surface)
*/
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8913;
const BASE = process.env.BASE || ('http://127.0.0.1:' + PORT);
const DEMO_APP = 'https://knect-demo-centre.pages.dev';
const CODE = 'HAFDEMO';

let pass = 0, fail = 0;
const ok = (c, m) => { console.log('  ' + (c ? 'ok  ' : 'FAIL') + ' ' + m); c ? pass++ : fail++; };
const same = (got, want, m) => ok(JSON.stringify(got) === JSON.stringify(want),
  m + (JSON.stringify(got) === JSON.stringify(want) ? '' : '\n       page: ' + JSON.stringify(got) + '\n       live: ' + JSON.stringify(want)));

/* the live product, read now, by the same reader the build used */
const LIVE = JSON.parse(execFileSync('python3', [ROOT + 'scripts/demo_live_read.py'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const labels = new Set(Object.values(LIVE.knect_tabs).map(t => t.label));

let server = null;
if (!process.env.BASE) {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: ROOT + 'demo', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
}

const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
pg.on('pageerror', e => errs.push(String(e).slice(0, 140)));

console.log('\nTHE DOOR');
await pg.goto(BASE + '/?code=' + CODE, { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(3000);
ok(!(await pg.isVisible('#door').catch(() => false)), 'HAFDEMO opens the Demo Centre');
ok(await pg.isVisible('#show'), 'the walkthrough is on screen');

console.log('\nTHE RUNNING ORDER');
{
  const jumps = await pg.$$eval('nav.jump a', ns => ns.map(n => ({
    text: n.textContent.trim(),
    id: (n.getAttribute('onclick') || '').replace(/[^']*'([^']+)'.*/, '$1'),
  })));
  ok(jumps.length === 6, 'six places to jump to (' + jumps.length + ')');
  for (const j of jumps) {
    const there = await pg.$('#' + j.id);
    ok(!!there, '"' + j.text + '" goes to a section that exists');
  }
  await pg.evaluate(() => jump('drive'));
  await pg.waitForTimeout(900);
  const onNow = await pg.$$eval('nav.jump a.on', ns => ns.map(n => n.textContent.trim()));
  ok(onNow.length === 1 && /Driving/.test(onNow[0]), 'the bar says where you are (' + onNow.join(',') + ')');
}

console.log('\nPOSTING WORK — every screen is a live KNECT screen');
{
  const rows = await pg.$$eval('#post ol.walk li', ns => ns.map(n => ({
    scr: n.querySelector('.scr').childNodes[0].textContent.trim(),
    where: n.querySelector('.where').textContent.trim(),
    say: n.querySelector('.say').textContent.trim(),
    gate: (n.querySelector('.gate') || {}).textContent || '',
  })));
  ok(rows.length >= 10, rows.length + ' screens on the poster walk');
  const strangers = rows.filter(r => !labels.has(r.scr)).map(r => r.scr);
  ok(strangers.length === 0, 'no screen named that the live app does not have'
    + (strangers.length ? ': ' + strangers.join(', ') : ''));
  ok(rows.every(r => r.say.length > 25), 'every screen says what it is for');
  ok(rows.every(r => LIVE.knect_sections.some(s => s.l === r.where)),
    'each one names the live section it sits in');
  const gated = rows.filter(r => /Clever release/.test(r.gate));
  ok(gated.length === 0, 'nothing on the poster walk is gated — that is the point of it'
    + (gated.length ? ' (got ' + gated.map(g => g.scr).join(', ') + ')' : ''));
}

console.log('\nDRIVING WORK — KNECT half');
{
  const rows = await pg.$$eval('#drive ol.walk:first-of-type li', ns => ns.map(n => ({
    scr: n.querySelector('.scr').childNodes[0].textContent.trim(),
    say: n.querySelector('.say').textContent.trim(),
    gate: (n.querySelector('.gate') || {}).textContent || '',
  })));
  ok(rows.length >= 6, rows.length + ' screens on the driver walk');
  const strangers = rows.filter(r => !labels.has(r.scr)).map(r => r.scr);
  ok(strangers.length === 0, 'no screen named that the live app does not have'
    + (strangers.length ? ': ' + strangers.join(', ') : ''));
  const gated = rows.filter(r => /Clever release/.test(r.gate)).length;
  ok(gated >= 5, gated + ' of them are marked as needing the Clever release');
}

console.log('\nDRIVING WORK — the PLNA bar, exactly as it is live');
{
  const chips = await pg.$$eval('#drive .chips .chip', ns => ns.map(n => n.textContent.trim()));
  same(chips, LIVE.plna_bar, 'the chips are the live PLNA bar, in order');
  const rows = await pg.$$eval('#drive ol.walk:last-of-type li .scr', ns => ns.map(n => n.textContent.trim()));
  same(rows, LIVE.plna_bar, 'and so is the walk under them');
  const says = await pg.$$eval('#drive ol.walk:last-of-type li .say', ns => ns.map(n => n.textContent.trim()));
  ok(says.every(s => s.length > 25), 'every PLNA screen says what a driver does on it');
  const honest = await pg.textContent('#drive .note');
  ok(/no separate demo/i.test(honest), 'it says plainly that PLNA has no clickable demo yet');
}

console.log('\nGETTING CHECKED — Clever');
{
  const rows = await pg.$$eval('#checked ol.walk li .scr', ns => ns.map(n => n.textContent.trim()));
  same(rows, LIVE.clever_stages, "the four stages are Clever's own four stages");
  const chipSets = await pg.$$eval('#checked .chips', ns => ns.map(c =>
    [...c.querySelectorAll('.chip')].map(x => x.textContent.trim())));
  same(chipSets[0], LIVE.clever_types, 'the account types are the ones Clever offers');
  same(chipSets[1], LIVE.join_fields, 'the fields are the ones the live sign-up form asks for');
  const note = await pg.textContent('#checked .note');
  ok(/real/i.test(note) && /test address/i.test(note),
    'it warns that the sign-up is real and says to use a test address');
}

console.log('\nWHAT EACH LEVEL GETS');
{
  const heads = await pg.$$eval('#levels thead th', ns => ns.map(n => n.textContent.trim()));
  ok(heads.length === 4, 'one column per level plus the limit name (' + heads.length + ')');
  const body = await pg.$$eval('#levels tbody tr', ns => ns.map(r =>
    [...r.querySelectorAll('td')].map(d => d.textContent.trim())));
  ok(body.length === 4, 'the four limits the network actually counts (' + body.length + ')');
  const flat = body.flat().join(' ');
  ok(/Unlimited/.test(flat), 'unlimited is written as Unlimited, never as a number people quote');
  ok(!/999/.test(flat), 'no 999 anywhere');
  const txt = await pg.textContent('#levels');
  ok(/every level sees the whole product/i.test(txt), 'it states the rule: every level sees the whole product');
}

console.log('\nNOTHING THAT TEACHES THE WRONG PRODUCT');
{
  const body = await pg.evaluate(() => document.body.innerText);
  ok(!/unlock/i.test(body), 'the word unlock appears nowhere');
  ok(!/\brebate\b/i.test(body), 'no rebate wording');
  const src = await pg.content();
  ok(!/Brent/i.test(src), 'no working notes in the page source');
  ok(!/<!--/.test(src.replace(/<!DOCTYPE[^>]*>/i, '')), 'no HTML comments left in the page');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
}

console.log('\nTHE LOGINS THE PAGE HANDS OUT ACTUALLY WORK');
{
  const creds = await pg.$$eval('.signin .cred', ns => ns.map(n => n.textContent.trim()));
  ok(creds.includes('DEMO1004') && creds.includes('DEMO1001'),
    'both demo logins are printed on the page (' + creds.join(', ') + ')');

  /* A cold demo app can take longer than one wait to answer, and a check that
     fails on the network rather than on the product teaches nobody anything —
     so this gets two goes before it calls the login broken. */
  async function signsIn(user, pin) {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    try {
      await p.goto(DEMO_APP + '/', { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#nav-login', { timeout: 20000 });
      await p.click('#nav-login');
      await p.waitForSelector('#l-user', { state: 'visible', timeout: 10000 });
      await p.evaluate(([u, k]) => {
        document.getElementById('l-user').value = u;
        document.getElementById('l-pass').value = k;
        [...document.querySelectorAll('button')].filter(e => e.offsetParent)
          .find(e => /^sign in/i.test(e.textContent.trim())).click();
      }, [user, pin]);
      await p.waitForFunction(u => localStorage.getItem('knect-user') === u,
        user, { timeout: 25000 }).catch(() => {});
      return await p.evaluate(() => localStorage.getItem('knect-user'));
    } catch (e) {
      return 'threw: ' + String(e).slice(0, 70);
    } finally {
      await ctx.close();
    }
  }

  for (const [user, pin, who] of [['DEMO1004', '1004', 'the poster'], ['DEMO1001', '1001', 'the driver']]) {
    let got = await signsIn(user, pin);
    if (got !== user) got = await signsIn(user, pin);
    ok(got === user, user + ' signs in on the demo database, as ' + who
      + (got === user ? '' : ' (got ' + got + ')'));
  }
}

console.log('\nIT READS ON A PHONE');
{
  const ph = await br.newPage({ viewport: { width: 390, height: 844 } });
  await ph.goto(BASE + '/?code=' + CODE, { waitUntil: 'domcontentloaded' });
  await ph.waitForTimeout(2800);
  const over = await ph.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 1, 'nothing hangs off the side of the screen (' + over + 'px)');
  ok(await ph.isVisible('nav.jump'), 'the running order is still reachable');
  const small = await ph.$$eval('.walk .scr, .walk .say, .chip',
    ns => ns.filter(n => parseFloat(getComputedStyle(n).fontSize) < 11).length);
  ok(small === 0, 'no text under 11px (' + small + ')');
  await ph.close();
}

await br.close();
if (server) server.kill();
console.log('\n' + pass + ' ok, ' + fail + ' failing   [' + BASE + ']');
process.exit(fail ? 1 : 0);
