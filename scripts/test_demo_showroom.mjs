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
import { execFileSync } from 'child_process';

const BASE = process.argv[2] || 'http://127.0.0.1:8899';
/* Unique per run, and always otis-…@usehaf.co.uk: the cleanup at the end refuses
   to delete anything that is not shaped like one of my own test addresses. */
const EMAIL = process.argv[3]
  || 'otis-showroom-' + process.hrtime.bigint().toString(36) + '@usehaf.co.uk';

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

  // ── HAF's own side of the job ───────────────────────────────────────────
  /* Brent, 11 Sep: "Yes, add all of them & the pooling is TBC" — what HAF earns
     on a job, the fee floor, and the pools.
     These checks deliberately do NOT compare the page to itself. admin/
     pricing-matrix-v3.js is the engine a real customer quote loads; it is read
     here, on this machine, and the figures on the LIVE page have to match it to
     the penny. A page that quietly drifted off the engine fails here. */
  let ENG = null;
  try {
    ENG = JSON.parse(execFileSync('node',
      [new URL('quote_grid.mjs', import.meta.url).pathname],
      { encoding: 'utf8', maxBuffer: 1 << 26 }));
    ok('the live pricing engine can be read to check the page against',
       ENG && ENG.haf && ENG.haf.cells && Object.keys(ENG.haf.cells).length > 0,
       ENG ? Object.keys(ENG.haf.cells).length + ' jobs priced, matrix ' + ENG.version : 'no read');
  } catch (e) {
    ok('the live pricing engine can be read to check the page against', false,
       String(e.stderr || e).slice(0, 180));
  }

  ok("HAF's own side is on the page", await page.isVisible('#own'));

  /* Read the three columns off the screen the way a person reads them: out of the
     rendered cells, not out of the data the page was shipped with. */
  const ownFigs = () => page.evaluate(() => {
    const money = t => {
      const m = String(t || '').replace(/,/g, '').match(/£\s*([\d.]+)/);
      return m ? parseFloat(m[1]) : null;
    };
    const pct = t => {
      const m = String(t || '').match(/([\d.]+)%/);
      return m ? parseFloat(m[1]) : null;
    };
    const txt = id => (document.getElementById(id) || {}).textContent || '';
    /* The amount and the share sit in one cell with NOTHING between them —
       "£23.44" then "23.81% of what the customer pays". Read whole-cell text and
       £23.44 runs straight into 23.81 as one number, which is how the first
       version of this check failed a page that was right. So take the amount from
       the cell's own text node and the share from the small print beside it. */
    const out = {};
    for (const L of ['FREE', 'PLUS', 'PRO']) {
      const cell = document.getElementById('own-keep-' + L);
      const amountOnly = cell
        ? Array.from(cell.childNodes)
            .filter(n => n.nodeType === 3).map(n => n.nodeValue).join(' ')
        : '';
      const small = cell ? (cell.querySelector('.sub') || {}).textContent || '' : '';
      out[L] = {
        price: money(txt('own-price-' + L)),
        pay: money(txt('own-pay-' + L)),
        keep: money(amountOnly),
        share: pct(small),
        floored: /lifted to the floor/i.test(small),
      };
    }
    return out;
  });

  const p2 = n => Math.round(n * 100) / 100;
  const LV = ['FREE', 'PLUS', 'PRO'];
  const reconcile = (figs, key, label) => {
    if (!ENG) return;
    const C = ENG.cells[key], H = ENG.haf.cells[key];
    if (!C || !H) { ok('the engine knows the job ' + label, false, key); return; }
    const wrong = [];
    LV.forEach((lv, i) => {
      const f = figs[lv];
      if (f.price !== p2(C[i])) wrong.push(lv + ' customer price ' + f.price + ' vs engine ' + p2(C[i]));
      if (f.pay !== p2(H[1])) wrong.push(lv + ' driver pay ' + f.pay + ' vs engine ' + p2(H[1]));
      if (f.keep !== p2(H[0][i])) wrong.push(lv + ' HAF keeps ' + f.keep + ' vs engine ' + p2(H[0][i]));
      if (Math.abs(f.keep + f.pay - f.price) > 0.02) wrong.push(lv + ' the three figures do not add up');
      if (Math.abs(f.share - p2((f.keep / f.price) * 100)) > 0.03) wrong.push(lv + ' the share is not the share');
      if (f.floored !== Boolean(H[2][i])) wrong.push(lv + ' the floor note disagrees with the engine');
    });
    ok("HAF's own figures match the live engine on " + label, wrong.length === 0,
       wrong.length ? wrong.join('; ')
                    : LV.map(lv => lv + ' keeps £' + figs[lv].keep.toFixed(2)).join(', '));
  };

  const opening = await ownFigs();
  reconcile(opening, 'LWB_VAN|STD_SAMEDAY|50', 'the job it opens on');
  ok('the driver is paid the same whatever the account level',
     opening.FREE.pay !== null && opening.FREE.pay === opening.PLUS.pay
       && opening.PLUS.pay === opening.PRO.pay,
     LV.map(lv => '£' + opening[lv].pay).join(' / '));
  ok('the whole of the discount comes out of what HAF keeps',
     opening.FREE.keep > opening.PLUS.keep && opening.PLUS.keep > opening.PRO.keep,
     LV.map(lv => lv + ' £' + opening[lv].keep).join(' > '));

  /* The page says "change the job and these move with it", so change it. */
  await page.selectOption('#pk-veh', 'LUTON');
  await page.selectOption('#pk-job', 'URGENT');
  await page.selectOption('#pk-mi', '150');
  await page.waitForFunction(
    was => {
      const e = document.getElementById('own-keep-FREE');
      return e && e.textContent.indexOf(was) === -1;
    },
    '£' + opening.FREE.keep.toFixed(2), { timeout: 15000 }).catch(() => {});
  const moved = await ownFigs();
  ok("HAF's own figures move when the job on screen changes",
     moved.FREE.keep !== opening.FREE.keep,
     'opened £' + opening.FREE.keep + ', after picking a 150-mile urgent Luton £' + moved.FREE.keep);
  reconcile(moved, 'LUTON|URGENT|150', 'a different job picked on screen');

  // ── the floor, the ceiling, and how often the floor bites ──────────────
  const band = norm(await page.textContent('#own .band'));
  if (ENG) {
    ok('the fee floor on the page is the engine’s floor',
       band.includes(ENG.haf.floor + '%'), band.slice(0, 140));
    ok('the ceiling on the page is the engine’s ceiling',
       band.includes(ENG.haf.ceiling + '%'), band.slice(0, 140));
    const hits = Object.values(ENG.haf.cells).filter(c => c[2].some(Boolean)).length;
    ok('the count of jobs lifted to the floor is the engine’s count',
       new RegExp('(^|\\D)' + hits + '(\\D|$)').test(band), 'engine says ' + hits);
  }

  // ── the pooling, which is not settled ──────────────────────────────────
  const pools = norm(await page.textContent('#own .pools'));
  const ownText = norm(await page.textContent('#own'));
  if (ENG) {
    const missing = ENG.haf.pools.destinations.filter(d => !pools.includes(d));
    ok('every pool in the live matrix is named on the page', missing.length === 0,
       missing.length ? 'missing: ' + missing.join(', ')
                      : ENG.haf.pools.destinations.length + ' named');
  }
  ok('no share is put against any pool', !/[%£]|\bper cent\b/i.test(pools), pools);
  ok('the pooling is marked to be confirmed', /to be confirmed/i.test(ownText));
  ok('and the page says in words that the split is not settled',
     /not settled yet/i.test(ownText));
  ok('the page says these are HAF’s figures, not a customer’s',
     /HAF’s figures, not a|HAF's figures, not a/i.test(ownText));

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

  /* ── take my own sign-up back out ────────────────────────────────────────
     This walk went in through the real front door, so the address it used is
     indistinguishable from a real lead: the nightly sync would put it in front of
     Brent as a warm contact and email it an access code. It is removed here and
     the removal is a CHECK, so a cleanup that silently failed fails the run. */
  try {
    const out = execFileSync('python3',
      [new URL('demo_lead_remove.py', import.meta.url).pathname, EMAIL],
      { encoding: 'utf8' }).trim();
    ok('the walk took its own sign-up back out of the list', /^DELETE \d+$/.test(out), out);
  } catch (e) {
    ok('the walk took its own sign-up back out of the list', false,
       'cleanup failed — remove ' + EMAIL + ' by hand: ' + String(e.stderr || e).slice(0, 160));
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
};

run().catch(e => { console.error('\nthe walk itself broke:', e); process.exit(2); });
