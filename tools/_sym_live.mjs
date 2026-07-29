/* Member symbols — proof on the REAL LIVE SITE (knect.usehaf.co.uk).
 *
 * What it proves, per account and per width:
 *   1. every PLUS-tagged surface carries the Plus mark
 *   2. every PRO-tagged surface carries the crown
 *   3. no PLUS surface carries a crown, no PRO surface carries a Plus mark
 *   4. an entry-level / free tag carries no mark at all
 *   5. every mark is announced to a screen reader
 *   6. no page errors
 *
 * Run: node tools/_sym_live.mjs
 */
import { chromium } from 'playwright';

const LIVE = 'https://knect.usehaf.co.uk/';
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); } };

const browser = await chromium.launch();

async function open(width, height, account) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  /* the access gate is real — fill the code, never skip it */
  await page.fill('#ag-code', 'HAFLAUNCH');
  await page.evaluate(() => checkGate());
  await page.waitForTimeout(500);
  await page.evaluate(a => demoLogin(a), account);
  await page.waitForTimeout(1200);
  return { ctx, page, errs };
}

const audit = p => p.evaluate(() => {
  const out = { pro: 0, proCrowned: 0, proWrong: 0, plus: 0, plusMarked: 0, plusWrong: 0, entry: 0, entryMarked: 0, unlabelled: 0, total: 0 };
  document.querySelectorAll('[data-haf-tier]').forEach(el => {
    const lvl = String(el.dataset.hafTier || '').toUpperCase();
    const crown = el.querySelector('.haf-id--pro');
    const plus = el.querySelector('.haf-id--plus');
    out.total++;
    if (lvl === 'PRO') { out.pro++; if (crown) out.proCrowned++; if (plus) out.proWrong++; }
    else if (lvl === 'PLUS') { out.plus++; if (plus) out.plusMarked++; if (crown) out.plusWrong++; }
    else { out.entry++; if (crown || plus) out.entryMarked++; }
  });
  document.querySelectorAll('.haf-id').forEach(el => { if (!el.getAttribute('aria-label')) out.unlabelled++; });
  return out;
});

for (const [w, h, label] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
  for (const acct of ['driver', 'freight', 'business']) {
    console.log('\n' + label.toUpperCase() + ' · ' + acct);
    const { ctx, page, errs } = await open(w, h, acct);
    const a = await audit(page);
    console.log('    ' + JSON.stringify(a));
    ok('tier surfaces exist on this view', a.total > 0, a);
    ok('every Pro surface wears the crown', a.pro === a.proCrowned, a);
    ok('every Plus surface wears the Plus mark', a.plus === a.plusMarked, a);
    ok('no crown on a Plus surface', a.plusWrong === 0, a);
    ok('no Plus mark on a Pro surface', a.proWrong === 0, a);
    ok('a free / entry surface wears nothing', a.entryMarked === 0, a);
    ok('every mark is announced to a screen reader', a.unlabelled === 0, a);
    ok('no page errors', errs.length === 0, errs.slice(0, 2));
    await page.screenshot({ path: `_sym_${acct}_${label}.png`, fullPage: false });
    await ctx.close();
  }
}

await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
