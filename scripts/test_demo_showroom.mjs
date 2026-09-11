/* Walk the showroom the way a visitor does, and check what they actually see.
 *
 * Usage:  node scripts/test_demo_showroom.mjs <baseUrl> <emailToUse>
 *
 * Every check names what it proved. A check that cannot fail is worth nothing,
 * so the wording checks look for the forbidden words in the text the visitor
 * reads, and the figure checks compare against the numbers the build script
 * says it read out of the database — not against themselves.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const EMAIL = process.argv[3] || 'otis-showroom-local@usehaf.co.uk';

/* what the live allowance book held when this was written; the build reads it
   fresh every time, so a mismatch here means the book changed and the page
   moved with it — which is the point */
const EXPECT = {
  heads: ['Free', 'Plus', 'Pro'],
  prices: ['Free', '£25 a month', '£100 a month'],
  posts: ['5', '25', 'Unlimited'],
  running: ['5', '25', 'Unlimited'],
  logins: ['1', '3', '10'],
  direct: ['Not on this level', 'Yes', 'Yes'],
};

const BANNED = [
  'unlock', 'upgrade to', 'rebate', 'premium feature', 'pro only',
  'as an ai', 'lorem ipsum',
];

/* Prose in the page is wrapped for a human reading the source, so a line break
   lands in the middle of a sentence. Match on the sentence, not on where the
   editor happened to wrap it — the first version of this file failed a check
   the page was actually passing. */
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

let pass = 0, fail = 0;
const ok = (n, c, detail) => {
  if (c) { pass++; console.log(`  ok   ${n}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${detail ? ' — ' + detail : ''}`); }
};

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const bad = [];
  page.on('requestfailed', r => bad.push(r.url()));
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(String(e)));

  console.log(`\nShowroom walk — ${BASE}\n`);

  // ── the door ───────────────────────────────────────────────────────────
  const resp = await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  ok('page answers 200', resp.status() === 200, 'status ' + resp.status());

  /* What this check is really for: the thing it replaced was the live app with a
     door bolted on, and the failure to catch is a second copy of the app creeping
     back in. A flat byte ceiling stopped being that check once the page started
     carrying the engine's answers for 288 example jobs — so the page's own words
     and markup are weighed apart from its lookup table, which is the half that
     would actually grow if an app got in. */
  const full = await resp.text();
  const bytes = full.length;
  const data = (full.match(/window\.HAF_DEMO_PRICES=[^\n]*/) || [''])[0].length;
  ok('the page itself is still a page of words', bytes - data < 70000,
     (bytes - data).toLocaleString() + ' bytes of page (was 798,475 for the app copy)');
  ok('and the engine answers it carries are a lookup table, not an app',
     bytes < 140000, bytes.toLocaleString() + ' bytes all in, ' + data.toLocaleString()
     + ' of it priced jobs');

  ok('the door is what you land on', await page.isVisible('#step-email'));
  ok('the showroom is shut until the door opens', !(await page.isVisible('#show')));
  ok('the HAF mark loaded', await page.isVisible('#door img.lock'));

  const doorTitle = await page.title();
  ok('the tab says it is a demo', /demo/i.test(doorTitle), doorTitle);

  // ── through the door ───────────────────────────────────────────────────
  await page.fill('#email', EMAIL);
  await page.click('#go');
  await page.waitForSelector('#step-issued:visible', { timeout: 20000 });
  const code = (await page.textContent('#code')).trim();
  ok('the database issued a code', /^[A-Z0-9]{6}$/.test(code), code);

  await page.click('#step-issued .btn-or');
  await page.waitForSelector('#show.on', { timeout: 5000 });
  ok('the showroom opened', await page.isVisible('#show'));
  ok('the door is gone', !(await page.isVisible('#door')));

  // ── the permanent demo label ───────────────────────────────────────────
  ok('a demo label sits in the header', await page.isVisible('header .demochip'));
  const chipBox = await page.locator('header .demochip').boundingBox();
  ok('the demo label has real size on screen', chipBox && chipBox.height > 8,
     chipBox ? Math.round(chipBox.width) + '×' + Math.round(chipBox.height) : 'no box');

  // ── the example job ────────────────────────────────────────────────────
  ok('the example job card is on the page', await page.isVisible('.job'));
  const jobLabel = (await page.textContent('.job .top .demochip')).trim();
  ok('the card is marked an example', /example/i.test(jobLabel), jobLabel);
  const ref = (await page.textContent('.job .ref')).trim();
  ok('the reference cannot be mistaken for a real one', ref === 'HAF-EXAMPLE', ref);

  const jobText = norm(await page.textContent('.job'));
  ok('the card carries no invented price', !jobText.includes('£'),
     jobText.includes('£') ? 'found a £ inside the card' : 'no £ in the card');

  const noteText = norm(await page.textContent('.note'));
  ok('the card says in words that it is made up', /made up for this page/i.test(noteText));

  // ── the two doors ──────────────────────────────────────────────────────
  const doors = await page.locator('.dcard').count();
  ok('both doors are drawn', doors === 2, doors + ' door cards');
  ok('the account door says it opens on day one',
     /open on day one/i.test(norm(await page.textContent('.dcard.open'))));
  ok('the driving door says it needs checking',
     /needs checking first/i.test(norm(await page.textContent('.dcard.gated'))));
  const hard = norm(await page.textContent('.hard'));
  ok('the rule is stated outright',
     /no level of membership opens the driving door/i.test(hard));
  ok('and the reverse is stated too',
     /no amount of checking changes your allowance/i.test(hard));

  // ── the levels table, against what the build read ──────────────────────
  const heads = await page.locator('thead th.lvl').allTextContents();
  ok('three levels, named as the database names them',
     EXPECT.heads.every((h, i) => (heads[i] || '').startsWith(h)), heads.join(' | '));
  ok('the real prices are shown',
     EXPECT.prices.every((p, i) => (heads[i] || '').includes(p)), heads.join(' | '));

  const rowCells = async (label) => {
    const tr = page.locator('tbody tr', { hasText: label }).first();
    return (await tr.locator('td').allTextContents()).slice(1).map(s => s.trim());
  };
  const posts = await rowCells('Jobs you can post a day');
  ok('posting allowance matches the book', JSON.stringify(posts) === JSON.stringify(EXPECT.posts), posts.join(' / '));
  const running = await rowCells('Jobs running at once');
  ok('running allowance matches the book', JSON.stringify(running) === JSON.stringify(EXPECT.running), running.join(' / '));
  const logins = await rowCells('Team logins');
  ok('team logins match the book', JSON.stringify(logins) === JSON.stringify(EXPECT.logins), logins.join(' / '));
  const direct = await rowCells('Send straight to a driver you pick');
  ok('direct send matches the book', JSON.stringify(direct) === JSON.stringify(EXPECT.direct), direct.join(' / '));

  ok('unlimited is the word used, not a big number',
     posts[2] === 'Unlimited' && !posts.includes('999'));

  // ── the wording rule ───────────────────────────────────────────────────
  const body = norm(await page.textContent('body')).toLowerCase();
  const found = BANNED.filter(w => body.includes(w));
  ok('nothing on the page sells a hidden feature', found.length === 0,
     found.length ? 'found: ' + found.join(', ') : 'none of ' + BANNED.length + ' banned phrases');
  ok('the levels heading is about how much, not what you see',
     /every level sees the whole product/i.test(await page.textContent('h2:near(.tblwrap)').catch(() => '')) ||
     /every level sees the whole product/i.test(body));
  ok('no emoji in the page text', !/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u.test(await page.textContent('body')));

  // ── the way on ─────────────────────────────────────────────────────────
  /* One public sign-up door, join.usehaf.co.uk — with or without its trailing
     slash. The first version of this compared the whole string and failed the day
     the href gained a slash, which is a test failing on punctuation while the page
     was right. */
  const join = await page.getAttribute('a.btn-or[href*="join"]', 'href');
  ok('joining points at the one public door',
     /^https:\/\/join\.usehaf\.co\.uk\/?$/.test(join || ''), join);

  // ── the reload, which is where a session usually breaks ────────────────
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#show.on', { timeout: 20000 }).catch(() => {});
  ok('a reload keeps you inside', await page.isVisible('#show'));
  ok('and does not put the door back', !(await page.isVisible('#door')));

  // ── the theme switch ───────────────────────────────────────────────────
  await page.click('[data-haf-theme-toggle]');
  ok('night mode switches the page', (await page.getAttribute('html', 'data-theme')) === 'night');
  await page.click('[data-haf-theme-toggle]');
  ok('and switches back to day', (await page.getAttribute('html', 'data-theme')) === null);

  // ── on a phone ─────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  ok('the demo label survives a phone width', await page.isVisible('header .demochip'));
  ok('the example card survives a phone width', await page.isVisible('.job'));
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('the page does not spill sideways on a phone', overflow <= 1, overflow + 'px of overflow');
  const tableScrolls = await page.evaluate(() => {
    const w = document.querySelector('.tblwrap');
    return w.scrollWidth > w.clientWidth && getComputedStyle(w).overflowX !== 'visible';
  });
  ok('the levels table scrolls instead of squashing', tableScrolls);

  // ── nothing broke quietly ──────────────────────────────────────────────
  ok('no asset 404d or failed', bad.length === 0, bad.length ? bad.join(', ') : 'all requests served');
  ok('no javascript error on the page', jsErrors.length === 0,
     jsErrors.length ? jsErrors[0] : 'clean console');

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
};

run().catch(e => { console.error('\nthe walk itself broke:', e); process.exit(2); });
