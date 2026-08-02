/* Eyes-on check for paid tier activation on the KNECT dashboard.
   Proves that what someone PAID for is what their account actually gets:
   a paid member is switched on and priced on their rung, a PLNA Plus account
   wears its mark without pretending to be a founder, and a free account is
   left exactly where it was. Run: node _member_verify.mjs [baseUrl] */
import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://member-activation.knect-demo.pages.dev/';
/* Optional throwaway member — created and deleted by the caller — used to prove
   the credentialed half: only the person who signed in sees their own code. */
const TEST_USER = process.argv[3] || '';
const TEST_HASH = process.argv[4] || '';
const TEST_CODE = process.argv[5] || '';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const errs = [];
let fail = 0, pass = 0;
const ok = (n, c, extra) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); c ? pass++ : fail++; };

/* Sign in the real way — no demo account, no shortcut — and let the page do
   its own live lookup, because the lookup is the thing under test. */
const signIn = async (pg, u) => {
  await pg.evaluate(x => window.enterKnectApp(x), u);
  await pg.waitForTimeout(900);
};
const level = pg => pg.evaluate(() => window.HAF_ACCOUNT_LEVEL);
const activeLine = async pg => (await pg.isVisible('#fnd-active'))
  ? (await pg.textContent('#fnd-active')).trim() : '';

for (const [w, h, tag] of [[1440, 950, 'desktop'], [390, 844, 'phone'], [320, 700, 'small']]) {
  for (const theme of ['day', 'dark']) {
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    pg.on('console', m => { if (m.type() === 'error') errs.push(`${tag}/${theme}: ${m.text()}`); });
    pg.on('pageerror', e => errs.push(`${tag}/${theme} PAGEERROR: ${e.message}`));
    await pg.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await pg.waitForFunction(() => typeof window.enterKnectApp === 'function', null, { timeout: 30000 });
    if (theme === 'dark') await pg.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

    // 1. A real account that never paid: nothing switched on, free rung kept.
    await signIn(pg, 'TESTOTIS0001');
    ok(`${tag}/${theme} unpaid: no founder card`, !(await pg.isVisible('#fnd-card')));
    ok(`${tag}/${theme} unpaid: no membership line`, (await activeLine(pg)) === '');
    ok(`${tag}/${theme} unpaid: still the free rung`, (await level(pg)) === 'lite', await level(pg));

    // 2. The £100 payer: card, benefits and the Plus rung his membership buys.
    await signIn(pg, 'IW908093');
    ok(`${tag}/${theme} paid member: card shown`, await pg.isVisible('#fnd-card'));
    ok(`${tag}/${theme} paid member: founder number`, (await pg.textContent('#fnd-no')).includes('5'));
    const line = await activeLine(pg);
    ok(`${tag}/${theme} paid member: membership reads active`, /^Membership active/.test(line), line);
    ok(`${tag}/${theme} paid member: full network access named`, /Full network access/.test(line));
    ok(`${tag}/${theme} paid member: priority matching named`, /priority matching/.test(line));
    ok(`${tag}/${theme} paid member: unlimited direct booking named`, /unlimited direct booking/.test(line));
    ok(`${tag}/${theme} paid member: Plus rate named`, /Plus account rate/.test(line));
    ok(`${tag}/${theme} paid member: priced on the Plus rung`, (await level(pg)) === 'plus', await level(pg));
    ok(`${tag}/${theme} paid member: mark beside the name`,
      await pg.evaluate(() => document.getElementById('tb-role').dataset.hafTier === 'plus'));
    /* No credentials in this session, so no code — a member's code is not
       something a page hands over just because it knows who they are. */
    ok(`${tag}/${theme} paid member: no code without their login`, !(await pg.isVisible('#fnd-code')));

    // The same member, signed in properly: their code is on their own card.
    if (TEST_USER && TEST_HASH) {
      await pg.evaluate(([u, h]) => window.hafGo(u, h, 'w'), [TEST_USER, TEST_HASH]);
      await pg.waitForTimeout(1200);
      ok(`${tag}/${theme} signed in: code shown`, await pg.isVisible('#fnd-code'));
      ok(`${tag}/${theme} signed in: it is their own code`,
        ((await pg.textContent('#fnd-code-val')) || '').trim() === TEST_CODE);
      ok(`${tag}/${theme} signed in: told where to paste it`,
        /PLNA/.test((await pg.textContent('#fnd-code-hint')) || ''));
    }

    // 3. A PLNA Plus account that never bought a membership: rung yes, founder no.
    await signIn(pg, 'TA000199');
    ok(`${tag}/${theme} PLNA Plus: priced on the Plus rung`, (await level(pg)) === 'plus', await level(pg));
    ok(`${tag}/${theme} PLNA Plus: no founder card`, !(await pg.isVisible('#fnd-card')));
    ok(`${tag}/${theme} PLNA Plus: no membership line`, (await activeLine(pg)) === '');

    // 4. Signing back in as the free account clears everything — no leftovers.
    await signIn(pg, 'TESTOTIS0001');
    ok(`${tag}/${theme} no leftovers: card gone`, !(await pg.isVisible('#fnd-card')));
    ok(`${tag}/${theme} no leftovers: line gone`, (await activeLine(pg)) === '');
    ok(`${tag}/${theme} no leftovers: back to the free rung`, (await level(pg)) === 'lite');

    ok(`${tag}/${theme} no sideways scroll`,
      await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

    // 5. What a stranger gets. HAF usernames are guessable, so an anonymous
    //    call may say "yes, a member" and must never hand back the code or the
    //    person's name. Asked with the public key the page itself ships.
    if (tag === 'desktop' && theme === 'day') {
      const seen = await pg.evaluate(async () => {
        const call = async (fn, body) => {
          const r = await fetch(PLNA_URL + '/rest/v1/rpc/' + fn, {
            method: 'POST',
            headers: { apikey: PLNA_KEY, Authorization: 'Bearer ' + PLNA_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          return JSON.stringify(await r.json());
        };
        return {
          standing: await call('knect_member_standing', { p_username: 'IW908093' }),
          card: await call('knect_founder_card', { p_username: 'IW908093' }),
          code: await call('knect_my_code', { p_username: 'IW908093', p_hash: 'guess', p_relay: null }),
        };
      });
      ok('stranger: standing still says member', /"active":true/.test(seen.standing));
      ok('stranger: standing hands out no code', !/H6PRO-/.test(seen.standing), seen.standing.slice(0, 90));
      ok('stranger: card hands out no code', !/H6PRO-/.test(seen.card));
      ok('stranger: card hands out no name', !/Worthington/i.test(seen.card), seen.card.slice(0, 90));
      ok('stranger: a guessed credential gets nothing', /"ok":false/.test(seen.code));
    }
    await pg.close();
  }
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
if (errs.length) { console.log('console errors:'); errs.forEach(e => console.log('  ' + e)); }
process.exit(fail || errs.length ? 1 : 0);
