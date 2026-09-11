/* The postcode dropdown — the doors at a postcode, and the manual way out.
   Brent, 11 Sep 2026: "a drop down address bar when someone places the
   postcode, offer an address or manual, then auto populate the fields."

   Run: node _doors_test.mjs
        TARGET_URL=https://knect.usehaf.co.uk/ node _doors_test.mjs   (live)

   Against the local file the gateway calls are pointed at the preview
   deployment, because that is where /addresses lives until it is promoted.
   Against a live URL nothing is rewritten — the page is tested as served.   */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';

const URL = process.env.TARGET_URL || 'file:///agent/workspace/knect-master/index.html';
/* point the gateway calls at the preview deployment while /addresses is still
   being promoted. On the live site this is off and the page is tested as served. */
const REWRITE = process.env.GW_PREVIEW === '1' || (!process.env.TARGET_URL && process.env.GW_PREVIEW !== '0');
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? pass++ : fail++; console.log((c ? '  ok   ' : '  FAIL ') + n + (extra ? '  — ' + extra : '')); };

const b = await chromium.launch();

async function fresh() {
  const p = await b.newPage({ viewport: { width: 1280, height: 1100 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  if (REWRITE) {
    await p.route('https://haf-distance.pages.dev/**', r => {
      const u = r.request().url().replace('https://haf-distance.pages.dev/',
                                          'https://addr-preview.haf-distance.pages.dev/');
      r.continue({ url: u });
    });
  }
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  const gate = await p.$('#ag-code');
  if (gate) { await p.fill('#ag-code', 'HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(400); }
  p._errs = errs;
  return p;
}

/* the customer's own route to the address step: open the quote, answer the
   load questions, arrive at "where is it going" */
async function toAddressStep(p) {
  await p.evaluate(() => { document.getElementById('cf-go').click(); });
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    fqData.weight = 'light'; fqData.size = 'few'; fqData.van = 'lwb'; fqData.urg = 'flex';
    document.getElementById('fq-goods').value = 'Boxes';
    fqNext(5);
  });
  await p.waitForTimeout(400);
}

/* type a postcode and give the two lookups time to answer. `expect` says
   whether a list should appear, so a test that wants rows waits for rows and a
   test that wants silence still waits long enough to be sure of it. */
async function typePc(p, id, pc, expect = true) {
  await p.click('#' + id);
  await p.fill('#' + id, '');
  await p.type('#' + id, pc, { delay: 20 });
  if (expect) await p.waitForSelector('.addr-list .addr-item', { timeout: 20000 }).catch(() => {});
  else await p.waitForTimeout(2500);
  await p.waitForTimeout(250);
}

console.log('\n1. A postcode in an address box offers the doors at it');
{
  const p = await fresh();
  await toAddressStep(p);
  await typePc(p, 'fq-caddr', 'M1 2AN');
  const shown = await p.$$('.addr-list .addr-item');
  ok('a list opens', shown.length > 0, shown.length + ' rows');
  const head = await p.textContent('.addr-head').catch(() => '');
  ok('it says how many and where', /at M1 2AN/.test(head || ''), head);
  const first = await p.textContent('.addr-list .addr-item .addr-m').catch(() => '');
  ok('the first row is a real door', /\d/.test(first || ''), first);
  ok('there is always a manual way out', !!(await p.$('.addr-manual')));
  await p.close();
}

console.log('\n2. Picking one fills the address in full');
{
  const p = await fresh();
  await toAddressStep(p);
  await typePc(p, 'fq-caddr', 'M1 2AN');
  const rows = await p.$$('.addr-list .addr-item:not(.addr-manual)');
  const label = await rows[0].$eval('.addr-m', n => n.textContent);
  await rows[0].dispatchEvent('mousedown');
  await p.waitForTimeout(500);
  const v = await p.inputValue('#fq-caddr');
  ok('the door went in', v.indexOf(label) === 0, v);
  ok('with the town on it', /Manchester/i.test(v), v);
  ok('and the postcode on the end', /M1 2AN$/.test(v), v);
  const pc = await p.getAttribute('#fq-caddr', 'data-pc');
  ok('the postcode is held for pricing', pc === 'M1 2AN', String(pc));
  ok('the list closed', !(await p.$('.addr-list')));
  const ed = await p.evaluate(() => {
    const el = document.getElementById('fq-caddr');
    return !el.disabled && !el.readOnly;
  });
  ok('the field is still theirs to edit', ed);
  await p.close();
}

console.log('\n3. The manual way out pre-fills everything but the number');
{
  const p = await fresh();
  await toAddressStep(p);
  await typePc(p, 'fq-caddr', 'M1 2AN');
  await (await p.$('.addr-manual')).dispatchEvent('mousedown');
  await p.waitForTimeout(400);
  const v = await p.inputValue('#fq-caddr');
  ok('the street and town are already there', /Newton Street/i.test(v) && /Manchester/i.test(v), v);
  ok('so is the postcode', /M1 2AN$/.test(v), v);
  ok('and no door number was invented', !/^\d/.test(v.trim()), v);
  const hint = await p.textContent('.addr-hint').catch(() => '');
  ok('they are told what to add', /number/i.test(hint || ''), hint);
  const caret = await p.evaluate(() => document.getElementById('fq-caddr').selectionStart);
  ok('the caret is waiting at the front', caret === 0, String(caret));
  await p.type('#fq-caddr', '14 ');
  const v2 = await p.inputValue('#fq-caddr');
  ok('typing the number completes it', /^14 Newton Street/i.test(v2), v2);
  await p.close();
}

console.log('\n4. A postcode HAF has been to before is offered first');
{
  const p = await fresh();
  await toAddressStep(p);
  await typePc(p, 'fq-caddr', 'S1 2HH');   /* seeded from real network jobs */
  const rows = await p.$$('.addr-list .addr-item:not(.addr-manual)');
  ok('the address book answered on its own', rows.length > 0, rows.length + ' rows');
  const secondary = rows.length ? await rows[0].$eval('.addr-s', n => n.textContent) : '';
  ok('and says it has been used before', /used before/.test(secondary), secondary);
  await p.close();
}

console.log('\n5. The quote boxes are untouched');
{
  const p = await fresh();
  await typePc(p, 'pc-from', 'M1 2AN', false);
  ok('no dropdown on the guide-price postcode box', !(await p.$('.addr-list')));
  await p.close();
}

console.log('\n6. A postcode that is not a place is left alone');
{
  const p = await fresh();
  await toAddressStep(p);
  await typePc(p, 'fq-caddr', 'ZZ9 9ZZ', false);
  ok('nothing is offered and nothing is invented', !(await p.$('.addr-list')));
  const v = await p.inputValue('#fq-caddr');
  ok('what they typed is still what is in the box', v === 'ZZ9 9ZZ', v);
  await p.close();
}

console.log('\n7. Nothing on the page broke');
{
  const p = await fresh();
  await toAddressStep(p);
  await typePc(p, 'fq-caddr', 'M1 2AN');
  await p.waitForSelector('.addr-manual', { timeout: 15000 });
  await (await p.$('.addr-manual')).dispatchEvent('mousedown');
  await p.waitForTimeout(300);
  ok('no script errors while using it', p._errs.length === 0, p._errs.join(' | '));
  await p.close();
}

await b.close();
console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
