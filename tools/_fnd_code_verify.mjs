/* Eyes-on check for the founder's PLNA code on the KNECT overview.
   Proves three things at every width: a non-founder sees nothing, a founder with
   an unused code can copy it, and a founder who has used it is told so. */
import { chromium } from 'playwright';
const URL = 'https://founders-badge.knect-demo.pages.dev/';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const errs = [];
let fail = 0, pass = 0;
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); c ? pass++ : fail++; };

for (const [w, h, tag] of [[1440, 950, 'desktop'], [390, 844, 'phone'], [320, 700, 'small']]) {
  for (const theme of ['day', 'dark']) {
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    pg.on('console', m => { if (m.type() === 'error') errs.push(`${tag}/${theme}: ${m.text()}`); });
    pg.on('pageerror', e => errs.push(`${tag}/${theme} PAGEERROR: ${e.message}`));
    await pg.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await pg.waitForFunction(() => typeof window.demoLogin === 'function', null, { timeout: 30000 });
    if (theme === 'dark') await pg.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

    // A driver who never paid must see no trace of any of it.
    await pg.evaluate(() => window.demoLogin('DEMO-DRV'));
    await pg.waitForTimeout(700);
    ok(`${tag}/${theme} non-founder: no card`, !(await pg.isVisible('#fnd-card')));
    ok(`${tag}/${theme} non-founder: no code`, !(await pg.isVisible('#fnd-code')));

    // A founder whose code is still unused: code on show, copy offered.
    await pg.evaluate(() => window.demoLogin('DEMO-FND'));
    await pg.waitForTimeout(700);
    ok(`${tag}/${theme} unused: card visible`, await pg.isVisible('#fnd-card'));
    ok(`${tag}/${theme} unused: code visible`, await pg.isVisible('#fnd-code'));
    ok(`${tag}/${theme} unused: code reads right`,
      (await pg.textContent('#fnd-code-val')).trim() === 'H6PRO-DEMO24');
    ok(`${tag}/${theme} unused: copy button live`,
      (await pg.textContent('#fnd-code-btn')).trim() === 'Copy' &&
      !(await pg.isDisabled('#fnd-code-btn')));
    const hint = (await pg.textContent('#fnd-code-hint')).toLowerCase();
    ok(`${tag}/${theme} unused: tells them where to paste it`,
      hint.includes('plna') && hint.includes('settings') && hint.includes('6 months'));

    // A founder who has already used it: still shown, but not offered again.
    await pg.evaluate(() => window.demoLogin('DEMO-FNU'));
    await pg.waitForTimeout(700);
    ok(`${tag}/${theme} used: code still visible`, await pg.isVisible('#fnd-code'));
    ok(`${tag}/${theme} used: button locked off`,
      (await pg.textContent('#fnd-code-btn')).trim() === 'Used' &&
      (await pg.isDisabled('#fnd-code-btn')));
    ok(`${tag}/${theme} used: label says already used`,
      (await pg.textContent('#fnd-code-lbl')).toLowerCase().includes('already used'));

    // Nothing may push the page sideways.
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${tag}/${theme} no sideways scroll (${over}px)`, over <= 0);

    if (theme === 'day' && tag !== 'small') {
      await pg.evaluate(() => window.demoLogin('DEMO-FND'));
      await pg.waitForTimeout(500);
      await pg.screenshot({ path: `/agent/workspace/_fndcode_${tag}.png` });
    }
    await pg.close();
  }
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
if (errs.length) { console.log('console errors:'); errs.forEach(e => console.log('  ' + e)); }
process.exit(fail || errs.length ? 1 : 0);
