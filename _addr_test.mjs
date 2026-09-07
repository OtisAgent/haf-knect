/* Street-name address search — the whole journey, on the real page.
   Brent, 7 Sep 2026: type a street when you don't know the postcode.
   Run: node _addr_test.mjs            (TARGET_URL to point it at the live site) */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';

const URL = process.env.TARGET_URL || 'file:///agent/workspace/knect-master/index.html';
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? pass++ : fail++; console.log((c ? '  ok   ' : '  FAIL ') + n + (extra ? '  — ' + extra : '')); };

const b = await chromium.launch();

async function fresh(vp = { width: 1280, height: 1100 }) {
  const p = await b.newPage({ viewport: vp });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const gate = await p.$('#ag-code');
  if (gate) { await p.fill('#ag-code', 'HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(400); }
  p._errs = errs;
  return p;
}

/* type into a field and pick the nth suggestion; returns the resolved postcode */
async function searchPick(p, id, text, n = 0) {
  await p.click('#' + id);
  await p.fill('#' + id, '');
  await p.type('#' + id, text, { delay: 25 });
  await p.waitForSelector('.addr-list .addr-item', { timeout: 12000 });
  const items = await p.$$('.addr-list .addr-item');
  await items[n].dispatchEvent('mousedown');
  await p.waitForFunction(id => {
    const e = document.getElementById(id);
    return e && e.dataset.pcFor === e.value.trim() && !!e.dataset.pc;
  }, id, { timeout: 15000 }).catch(() => {});
  return p.$eval('#' + id, e => ({ value: e.value, pc: e.dataset.pc || '', precise: e.dataset.pcPrecise === '1' }));
}

console.log('\n1. A street name finds real places');
{
  const p = await fresh();
  await p.click('#pc-from');
  await p.type('#pc-from', 'ecclesall', { delay: 30 });
  await p.waitForSelector('.addr-list .addr-item', { timeout: 12000 });
  const n = (await p.$$('.addr-list .addr-item')).length;
  ok('suggestions appear as you type a street', n > 0, n + ' shown');
  const first = await p.$eval('.addr-list .addr-item .addr-m', e => e.textContent);
  ok('each one names a place', /\w/.test(first), first);
  const maxlen = await p.$eval('#pc-from', e => e.getAttribute('maxlength'));
  ok('the box no longer cuts you off at 8 characters', maxlen === null);
  await p.close();
}

console.log('\n2. A street with no number still gets a price');
{
  const p = await fresh();
  const a = await searchPick(p, 'pc-from', 'ecclesall road sheffield');
  const c = await searchPick(p, 'pc-to', 'deansgate manchester');
  ok('collection street resolved to a postcode', /^[A-Z]{1,2}\d/.test(a.pc), a.value + ' -> ' + a.pc);
  ok('delivery street resolved to a postcode', /^[A-Z]{1,2}\d/.test(c.pc), c.value + ' -> ' + c.pc);
  ok('a street on its own is not treated as exact', a.precise === false);
  await p.waitForFunction(() => {
    const e = document.getElementById('lp-range');
    return e && /£\d/.test(e.textContent) && document.getElementById('lp-priced').style.display !== 'none';
  }, null, { timeout: 25000 }).catch(() => {});
  const range = await p.$eval('#lp-range', e => e.textContent);
  const info = await p.$eval('#lp-info', e => e.textContent);
  ok('a guide price comes out', /£\d+–£\d+/.test(range), range);
  ok('the price is built on real road miles', /\d+ mi/.test(info) && !/road est\./.test(info), info);
  await p.close();
}

console.log('\n3. Typing a postcode works exactly as before');
{
  const p = await fresh();
  await p.fill('#pc-from', 'S9 1AA');
  await p.fill('#pc-to', 'M1 1AA');
  await p.dispatchEvent('#pc-to', 'input');
  await p.waitForFunction(() => /£\d/.test((document.getElementById('lp-range') || {}).textContent || ''), null, { timeout: 25000 }).catch(() => {});
  const range = await p.$eval('#lp-range', e => e.textContent);
  ok('postcodes still price', /£\d+–£\d+/.test(range), range);
  const listOpen = await p.$('.addr-list');
  ok('no suggestion list gets in the way of a postcode', listOpen === null);
  await p.close();
}

console.log('\n4. Somewhere that does not exist is refused, kindly');
{
  const p = await fresh();
  await p.fill('#pc-from', 'zzqqxx nowhere street');
  await p.fill('#pc-to', 'M1 1AA');
  await p.dispatchEvent('#pc-to', 'input');
  await p.waitForTimeout(9000);
  const hint = await p.$eval('#lp-hint-txt', e => e.textContent);
  const priced = await p.$eval('#lp-priced', e => e.style.display);
  ok('no price is invented for a place we cannot find', priced === 'none', 'priced display=' + priced);
  ok('the message tells them what to do', /couldn.t find/i.test(hint) && /street/i.test(hint), hint.slice(0, 90));
  await p.close();
}

console.log('\n5. The booking journey carries it through and asks for the door number');
{
  const p = await fresh();
  await searchPick(p, 'pc-from', 'ecclesall road sheffield');
  await searchPick(p, 'pc-to', 'deansgate manchester');
  await p.waitForFunction(() => /£\d/.test((document.getElementById('lp-range') || {}).textContent || ''), null, { timeout: 25000 }).catch(() => {});
  await p.click('#cf-go');
  await p.waitForTimeout(600);
  const carried = await p.$eval('#fq-from', e => ({ v: e.value, pc: e.dataset.pc || '' }));
  ok('the place they chose is carried into the booking', /Ecclesall/i.test(carried.v), carried.v);
  ok('and so is the postcode behind it, without asking again', /^[A-Z]{1,2}\d/.test(carried.pc), carried.pc);

  /* drive to the address step */
  await p.evaluate(() => {
    fqData.weight = 'light'; fqData.size = 'few'; fqData.van = 'lwb'; fqData.urg = 'flex';
    document.getElementById('fq-goods').value = 'Boxes';
    fqNext(5);
  });
  await p.waitForTimeout(400);
  const pre = await p.$eval('#fq-caddr', e => e.value);
  ok('the address box is pre-filled with the street they chose', /Ecclesall/i.test(pre), pre);

  await p.evaluate(() => { fqShowPriceV(); });
  await p.waitForTimeout(300);
  const err1 = await p.$eval('#fq-err-5', e => e.textContent);
  ok('a street with no number cannot be booked', /house or building number/i.test(err1), err1);

  await p.fill('#fq-caddr', '123 Ecclesall Road, Sheffield');
  await p.fill('#fq-daddr', '1 Deansgate, Manchester');
  await p.evaluate(() => { fqShowPriceV(); });
  await p.waitForTimeout(800);
  const err2 = await p.$eval('#fq-err-5', e => e.textContent);
  ok('with a number it goes through', err2 === '', err2);
  await p.close();
}

console.log('\n6. It works on a phone');
{
  const p = await fresh({ width: 390, height: 844 });
  const a = await searchPick(p, 'pc-from', 'high street oxford');
  ok('picking from the list works on a small screen', /^[A-Z]{1,2}\d/.test(a.pc), a.value + ' -> ' + a.pc);
  const box = await p.evaluate(() => {
    const e = document.getElementById('pc-from');
    e.dispatchEvent(new Event('input', { bubbles: true }));
    return null;
  });
  await p.close();
}

console.log('\n7. Nothing on the page broke');
{
  const p = await fresh();
  await searchPick(p, 'pc-from', 'ecclesall road sheffield');
  await p.waitForTimeout(1500);
  ok('no script errors while using it', p._errs.length === 0, p._errs.join(' | ').slice(0, 200));
  await p.close();
}

await b.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
