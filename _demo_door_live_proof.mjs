/* THE DEMO DOOR, PROVED ON THE LIVE SURFACE
   =========================================
   Brent, 11 Sep: "i want the demo, to have the email entry still that gives a
   code and make sure we store the email. my entry code is HAFDEMO".

   Three things have to be true on the real site, not in the repo:
     1. HAFDEMO, typed into the code box by hand, opens the demo.
     2. A visitor's email still comes back with a code, and the address is
        really in the table afterwards — read with psql, because the site's own
        key deliberately cannot read that table.
     3. The code that was just issued opens the demo too.

   And one that has to stay false: the list must not be readable from the page.

   Run: node _demo_door_live_proof.mjs            (BASE overrides the surface)
*/
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

const BASE = process.env.BASE || 'https://demo.usehaf.co.uk';
const OWNER_CODE = 'HAFDEMO';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdna3BxcXJ0eHRsYWZka3hjYXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxOTM2NjAsImV4cCI6MjA5Nzc2OTY2MH0.hB70KOYZu4dshwhsrxF_dFyBn0n72gStWTwxYGsLdgY';
const REST = 'https://ggkpqqrtxtlafdkxcaqg.supabase.co/rest/v1/';

let pass = 0, fail = 0;
const ok = (c, m) => { console.log('  ' + (c ? 'ok  ' : 'FAIL') + ' ' + m); c ? pass++ : fail++; };

/* The two surfaces name their door differently — the old Demo Centre prefixes
   everything pd-, the showroom does not. The checks are the same either way, so
   the selectors are a profile and not a copy of the script. */
const PROFILES = {
  centre:   { gate:'#pd-gate', email:'#pd-email', go:'#pd-go', codein:'#pd-codein',
              enter:'#pd-enter', code:'#pd-code', codeErr:'#pd-code-err',
              issued:'#pd-step-issued', show:'pdShow' },
  showroom: { gate:'#door', email:'#email', go:'#go', codein:'#codein',
              enter:'#enter', code:'#code', codeErr:'#code-err',
              issued:'#step-issued', show:'doorShow' },
};
let S = null;
async function open_(fresh) {
  const pg = await br.newPage({ viewport: { width: 1400, height: 1000 } });
  await pg.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  if (!S) {
    await pg.waitForTimeout(1500);
    S = await pg.$('#pd-gate') ? PROFILES.centre : PROFILES.showroom;
    console.log('  (door style: ' + (S === PROFILES.centre ? 'Demo Centre' : 'showroom') + ')');
  }
  await pg.waitForSelector(S.gate, { timeout: 20000 });
  return pg;
}
const codeStep = async pg => {
  await pg.evaluate(f => { try { window[f]('code') } catch (e) {} }, S.show);
  await pg.waitForSelector(S.codein, { state: 'visible', timeout: 5000 });
};

const DB = readFileSync('/agent/workspace/haf-driver-app/.env.local', 'utf8')
  .split('\n').find(l => l.startsWith('DATABASE_URL='))
  .split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const sql = s => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', s],
  { encoding: 'utf8' }).trim();

/* A fresh address every run, marked as mine so the mailing sync skips it.
   Date.now() is fine here — this is a test script, not a workflow. */
const probe = 'otis-door-proof-' + Date.now() + '@usehaf.co.uk';

const br = await chromium.launch();

/* ── 1. the owner's code, typed by hand ──────────────────────────────────── */
console.log('\nBRENT TYPES HAFDEMO INTO THE CODE BOX');
{
  const pg = await open_();
  ok(await pg.isVisible(S.gate), 'the door is shut to begin with');

  await codeStep(pg);
  const max = await pg.getAttribute(S.codein, 'maxlength');
  ok(Number(max) >= OWNER_CODE.length, 'the box takes a ' + OWNER_CODE.length + '-character code (maxlength ' + max + ')');

  await pg.fill(S.codein, OWNER_CODE);
  await pg.click(S.enter);
  await pg.waitForTimeout(2500);
  const shut = await pg.isVisible(S.gate).catch(() => false);
  ok(!shut, 'HAFDEMO opens the demo');
  const errText = (await pg.textContent(S.codeErr).catch(() => '') || '').trim();
  ok(!errText, 'no error shown' + (errText ? ' (got: ' + errText + ')' : ''));

  /* it survives a reload, because that is how a live walkthrough actually goes */
  await pg.reload({ waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2500);
  ok(!(await pg.isVisible(S.gate).catch(() => false)), 'still open after a reload');

  /* and in one click from a link, which is how he will open it on a call */
  const pg2 = await br.newPage({ viewport: { width: 1400, height: 1000 } });
  await pg2.goto(BASE + '/?code=' + OWNER_CODE, { waitUntil: 'domcontentloaded' });
  await pg2.waitForTimeout(2500);
  ok(!(await pg2.isVisible(S.gate).catch(() => false)), 'the link with the code on the end opens it in one click');
  ok(!/code=/.test(pg2.url()), 'and the code is wiped out of the address bar');
  await pg2.close();
  await pg.close();
}

/* ── 2. a visitor's email, and the address really stored ─────────────────── */
console.log('\nA VISITOR TYPES AN EMAIL');
let issued = '';
{
  const pg = await open_();
  await pg.waitForSelector(S.email, { state: 'visible', timeout: 20000 });
  ok(true, 'the email box is the first thing they see');

  await pg.fill(S.email, probe);
  await pg.click(S.go);
  await pg.waitForSelector(S.issued, { state: 'visible', timeout: 20000 });
  issued = ((await pg.textContent(S.code)) || '').trim();
  ok(/^[A-Z0-9]{6}$/.test(issued), 'a code comes back on screen (' + issued + ')');

  const row = sql("select email||'|'||access_code||'|'||coalesce(source,'-') from public.knect_demo_lead where email = '" + probe + "';");
  ok(row.startsWith(probe), 'the address is in the table afterwards');
  ok(row.includes('|' + issued + '|'), 'the stored code is the one shown on screen');
  ok(/\|demo\.usehaf\.co\.uk$/.test(row) || /\|preview:/.test(row),
    'it records where they came in (' + row.split('|').pop() + ')');
  await pg.close();
}

/* ── 3. that code opens the demo ─────────────────────────────────────────── */
console.log('\nTHE CODE THEY WERE JUST GIVEN');
{
  const pg = await open_();
  await codeStep(pg);
  await pg.fill(S.codein, issued);
  await pg.click(S.enter);
  await pg.waitForTimeout(2500);
  ok(!(await pg.isVisible(S.gate).catch(() => false)), 'the issued code opens the demo');
  await pg.close();
}

/* ── 4. a made-up code does not ──────────────────────────────────────────── */
console.log('\nA CODE THAT IS NOT ONE OF OURS');
{
  const pg = await open_();
  await codeStep(pg);
  await pg.fill(S.codein, 'ZZZZZZ');
  await pg.click(S.enter);
  await pg.waitForTimeout(2500);
  ok(await pg.isVisible(S.gate).catch(() => false), 'the door stays shut');
  const e = (await pg.textContent(S.codeErr).catch(() => '') || '').trim();
  ok(/not one of ours|check it/i.test(e), 'and it says so in plain words');
  await pg.close();
}

/* ── 5. the list stays unreadable from the page ──────────────────────────── */
console.log('\nTHE LIST CANNOT BE PULLED OUT OF THE PAGE');
{
  const r = await fetch(REST + 'knect_demo_lead?select=email', {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
  });
  const body = await r.text();
  ok(r.status >= 400, 'the site key is refused the table (HTTP ' + r.status + ')');
  ok(!/@/.test(body), 'no address comes back');
}

/* ── teardown ─────────────────────────────────────────────────────────────── */
/* The probe goes in through the real front door, so on demo.usehaf.co.uk it is
   born with a real visitor's source and the mailing sync would treat it as a
   person: add it to Mailchimp, add it to Resend, email it a code. It is not a
   person. The first run of this script left two such rows behind and I took them
   out by hand — so the script takes its own out now, every run, and says so. */
{
  const gone = sql("delete from public.knect_demo_lead where email = '" + probe + "';");
  console.log('\nTEST ROW CLEARED UP');
  ok(/DELETE 1/.test(gone), 'the probe address is out of the list again (' + gone + ')');
  const left = sql("select count(*) from public.knect_demo_lead where email like 'otis-door-proof-%';");
  ok(left === '0', 'no probe rows left behind at all');
}

await br.close();
console.log('\n' + pass + ' ok, ' + fail + ' failing   [' + BASE + ']');
process.exit(fail ? 1 : 0);
