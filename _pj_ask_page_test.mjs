/* THE ROUND TRIP, DRIVEN ON THE REAL PAGE.
   Copy the questions off the tile, fill them in the way a customer would, paste
   the reply back into the same box, and read the order form out the other end.

   Local:  node _pj_ask_page_test.mjs
   Live:   BASE=https://knect.usehaf.co.uk node _pj_ask_page_test.mjs */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const LIVE = process.env.BASE || '';
let srv = null;
if (!LIVE) {
  const ROOT = process.cwd();
  srv = http.createServer((q, s) => {
    let f = decodeURIComponent(q.url.split('?')[0]);
    if (f === '/') f = '/index.html';
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('no'); }
    const t = p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'text/plain';
    s.writeHead(200, { 'content-type': t + '; charset=utf-8' });
    s.end(fs.readFileSync(p));
  });
  await new Promise(r => srv.listen(8792, r));
}
const BASE = LIVE || 'http://127.0.0.1:8792/';
console.log('against ' + BASE);

let pass = 0, fail = 0;
const ck = (n, got, want) => {
  const ok = typeof want === 'function' ? want(got) : got === want;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : '  got ' + JSON.stringify(got)));
  ok ? pass++ : fail++;
};

const b = await chromium.launch();
const ctx = await b.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const errs = [];
const pg = await ctx.newPage();
pg.on('pageerror', e => errs.push(String(e)));
await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(900);

console.log('\nIT IS ON THE TILE, BEFORE ANYTHING IS PRESSED');
ck('the copy row is on the job tile', await pg.locator('.calc-box .pj-ask').first().count(), 1);
ck('and it is visible without opening anything', await pg.locator('.calc-box .pj-ask').first().isVisible(), true);
ck('the paste panel is still shut', await pg.locator('#pj-body-a').isVisible(), false);
const askTxt = (await pg.locator('.calc-box .pj-ask-t').first().innerText()).toLowerCase();
console.log('   "' + askTxt.replace(/\s+/g, ' ') + '"');
ck('it says who it is for', askTxt, s => s.includes('waiting on the details'));
ck('it says what to do with it', askTxt, s => s.includes('email it') && s.includes('paste'));
ck('the copy button says what it copies', (await pg.locator('#pj-cp-a').innerText()).trim(), 'Copy what we need');
ck('and there is a way to read it first', await pg.locator('.pj-ask button:has-text("See it first")').first().count(), 1);
ck('the same row inside the order flow', await pg.locator('[data-pj="b"] .pj-ask').count(), 1);

console.log('\nWHAT IT ACTUALLY COPIES');
const TPL = await pg.evaluate(() => (typeof PJ_ASK === 'string' ? PJ_ASK : ''));
ck('the page holds a template', TPL.length, n => n > 300);
await pg.locator('#pj-cp-a').click();
await pg.waitForTimeout(400);
const clip = await pg.evaluate(() => navigator.clipboard.readText());
ck('the clipboard holds it, whole', clip, TPL);
ck('it reads as an email', clip, s => /^Subject: Delivery request/.test(s));
ck('it asks for both places', clip, s => /COLLECTION\nAddress:/.test(s) && /DELIVERY\nAddress:/.test(s));
ck('a contact at each end', clip, s => (s.match(/\nContact:/g) || []).length === 2);
ck('a mobile at each end', clip, s => (s.match(/\nMobile:/g) || []).length === 2);
ck('what is moving and how much of it', clip, s => /\nGoods:/.test(s) && /\nHow many and of what:/.test(s));
ck('how heavy', clip, s => /\nTotal weight:/.test(s));
ck('the handling at both ends', clip, s => /needed to load it:/.test(s) && /needed to unload it:/.test(s));
ck('when, and any deadline', clip, s => /\nReady from:/.test(s) && /\nDeliver before:/.test(s));
ck('who is asking', clip, s => /\nYour name:/.test(s) && /\nYour email:/.test(s));
ck('it invents no figure of its own', clip, s => !/[0-9]/.test(s));
ck('and it is short enough to read', clip.split('\n').length, n => n < 40);
ck('the button confirms it copied', (await pg.locator('#pj-cp-a').innerText()).toLowerCase(), s => s.includes('copied'));

console.log('\nSEE IT FIRST');
await pg.locator('.pj-ask button:has-text("See it first")').first().click();
await pg.waitForTimeout(250);
ck('it shows on the page', await pg.locator('#pj-ask-p-a').isVisible(), true);
ck('and it is the same words', (await pg.locator('#pj-ask-p-a').innerText()).replace(/\r/g, '').trim(), TPL.trim());
await pg.locator('.pj-ask button:has-text("See it first")').first().click();
await pg.waitForTimeout(250);
ck('and it puts itself away', await pg.locator('#pj-ask-p-a').isVisible(), false);

console.log('\nTHE ROW SAYS "ABOVE", SO THE BOX HAS TO BE ABOVE IT');
await pg.locator('.calc-box .pj-open').first().click();
await pg.waitForTimeout(300);
const yBox = (await pg.locator('#pj-txt-a').boundingBox()).y;
const yRow = (await pg.locator('.calc-box .pj-ask').first().boundingBox()).y;
ck('the paste box really is above the copy row', yBox < yRow, true);
await pg.locator('#pj-body-a button:has-text("Cancel")').click();
await pg.waitForTimeout(200);
ck('and the row stays put with the box shut', await pg.locator('.calc-box .pj-ask').first().isVisible(), true);

console.log('\nFILLED IN BY THE CUSTOMER, PASTED BACK IN');
const filled = TPL
  .replace('COLLECTION\nAddress:', 'COLLECTION\nAddress: Unit 4 Callum Park, Attercliffe Road, Sheffield S9 1AA')
  .replace('DELIVERY\nAddress:', 'DELIVERY\nAddress: 22 Trafford Way, Salford, Manchester M1 1AA')
  .replace('Contact:\nMobile:\nReady from:\nAnything needed to load it:',
    'Contact: John Wright\nMobile: 07700 900123\nReady from: Friday, from 9am\nAnything needed to load it: forklift on site')
  .replace('Contact:\nMobile:\nDeliver before:\nAnything needed to unload it:',
    'Contact: Sarah Ellis\nMobile: 07700 900456\nDeliver before: 4pm\nAnything needed to unload it: tail lift, no forklift here')
  .replace('Goods:', 'Goods: boxed clothing')
  .replace('How many and of what:', 'How many and of what: 3 pallets')
  .replace('Total weight:', 'Total weight: 300')
  .replace('Largest item:', 'Largest item: 1.2m x 1m x 1.5m')
  .replace('Your name:', 'Your name: Sarah Ellis')
  .replace('Your email:', 'Your email: sarah@trafford-supplies.co.uk')
  .replace('Notes:', 'Notes: gate code 4417, ring on arrival');

await pg.locator('.calc-box .pj-open').first().click();
await pg.fill('#pj-txt-a', filled);
await pg.locator('#pj-body-a button:has-text("Read it")').click();
await pg.waitForTimeout(400);
ck('it shows what it found', await pg.locator('#pj-found-a').isVisible(), true);
const rows = {};
for (const r of await pg.locator('#pj-list-a .pj-row').all())
  rows[(await r.locator('.pj-row-l').innerText()).trim().toLowerCase()] = (await r.locator('.pj-row-v').innerText()).trim();
console.log('   ' + JSON.stringify(rows, null, 1).replace(/\n/g, '\n   '));
ck('collection address', rows['collecting from'], 'Unit 4 Callum Park, Attercliffe Road, Sheffield S9 1AA');
ck('collection contact', rows['at collection, ask for'], 'John Wright · 07700 900123');
ck('delivery address', rows['delivering to'], '22 Trafford Way, Salford, Manchester M1 1AA');
ck('delivery contact', rows['at delivery, ask for'], 'Sarah Ellis · 07700 900456');
ck('what is moving', rows['what is moving'], 'boxed clothing');
ck('how much there is', rows['how much there is'], s => /3 pallets/.test(s || ''));
ck('how heavy, unit left off', rows['how heavy'], s => /300 kg/.test(s || ''));
ck('largest item', rows['largest item'], s => /1.2/.test(s || ''));
ck('handling, forklift at the collection end only', rows['loading and handling'],
  s => /Tail lift/i.test(s || '') && /collection/i.test(s || '') && !/delivery/i.test(s || ''));
ck('collection when', rows['collection'], s => /Friday/.test(s || '') && /09:00/.test(s || ''));
ck('the deadline', rows['must be delivered'], s => /4pm/.test(s || ''));
ck('notes for the driver', rows['for the driver'], s => /gate code 4417/.test(s || ''));
ck('who is asking', rows['you'], s => /Sarah Ellis/.test(s || '') && /trafford-supplies/.test(s || ''));
ck('nothing reported missing', await pg.locator('#pj-miss-a').isVisible(), false);

console.log('\nAND INTO THE ORDER, WHERE THE DRIVER READS IT');
await pg.locator('#pj-found-a button:has-text("Use these details")').click();
await pg.waitForTimeout(2000);
const v = async id => await pg.inputValue('#' + id);
ck('collecting from', await v('fq-from'), 'S9 1AA');
ck('delivering to', await v('fq-to'), 'M1 1AA');
ck('exact weight', await v('fq-exact'), '300');
ck('quantity', await v('fq-qty'), '3');
ck('type', await v('fq-unit'), 'pallets');
ck('goods', await v('fq-goods'), 'boxed clothing');
ck('collection date is the coming Friday', await v('fq-cdate'), s => /^20\d\d-\d\d-\d\d$/.test(s) && new Date(s).getDay() === 5);
ck('collect from time', await v('fq-ctime'), '09:00');
ck('the deadline', await v('fq-dreq'), s => /4pm/.test(s));
ck('door-level collection address', await v('fq-caddr'), 'Unit 4 Callum Park, Attercliffe Road, Sheffield S9 1AA');
ck('collection contact name', await v('fq-cname'), 'John Wright');
ck('collection contact phone', await v('fq-cphone'), '07700 900123');
ck('door-level delivery address', await v('fq-daddr'), '22 Trafford Way, Salford, Manchester M1 1AA');
ck('delivery contact name', await v('fq-dname'), 'Sarah Ellis');
ck('delivery contact phone', await v('fq-dphone'), '07700 900456');
ck('notes carried to the driver', await v('fq-notes'), s => /gate code 4417/.test(s));
ck('your name', await v('fq-name'), 'Sarah Ellis');
ck('your email', await v('fq-email'), 'sarah@trafford-supplies.co.uk');
ck('tail lift ticked', await pg.locator('#fq-reqs .tgl[data-req="tail"].sel').count(), 1);
ck('forklift at collection ticked', await pg.locator('#fq-reqs .tgl[data-req="forkc"].sel').count(), 1);
ck('forklift at delivery NOT ticked, it said there is none',
  await pg.locator('#fq-reqs .tgl[data-req="forkd"].sel').count(), 0);
ck('it says where the answers came from', await pg.locator('#pj-said').isVisible(), true);
ck('a price is on screen', (await pg.locator('#fq-pr-range').innerText()).trim(), s => /£/.test(s));

console.log('\nAN UNFILLED TEMPLATE PASTED BACK BY MISTAKE');
const pg2 = await ctx.newPage();
pg2.on('pageerror', e => errs.push(String(e)));
await pg2.goto(BASE, { waitUntil: 'domcontentloaded' });
await pg2.waitForTimeout(800);
await pg2.locator('.calc-box .pj-open').first().click();
await pg2.fill('#pj-txt-a', TPL);
await pg2.locator('#pj-body-a button:has-text("Read it")').click();
await pg2.waitForTimeout(300);
ck('it refuses rather than filling anything in', await pg2.locator('#pj-err-a').isVisible(), true);
ck('and says what to do instead', (await pg2.locator('#pj-err-a').innerText()).toLowerCase(),
  s => s.includes('type the two postcodes'));
ck('nothing was found to use', await pg2.locator('#pj-found-a').isVisible(), false);

console.log('\nno javascript errors on any of it: ' + (errs.length ? 'FAIL ' + errs.join(' | ') : 'yes'));
if (errs.length) fail++; else pass++;

await b.close();
if (srv) srv.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
