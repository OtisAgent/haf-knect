/* THE LIVE SITE. Reads and prices only — it never presses Book. Drive the real page: paste a job email into the tile, read the review list,
   press through, and read the order form back. Run: node _pj_page_test.mjs */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const srv = http.createServer((q, s) => {
  let f = decodeURIComponent(q.url.split('?')[0]);
  if (f === '/') f = '/index.html';
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('no'); }
  const t = p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'text/plain';
  s.writeHead(200, { 'content-type': t + '; charset=utf-8' });
  s.end(fs.readFileSync(p));
});


const EMAIL = `Hi,

Please can you quote and book the following.

Collection: Unit 4 Callum Park, Attercliffe, Sheffield S9 1AA
Contact: John Wright 07700 900123

Delivery: 22 Trafford Way, Manchester M1 1AA
Contact: Sarah Ellis 07700 900456

Goods: 3 pallets of boxed clothing
Weight: 300kg
Tail lift required at delivery, non-stackable
Collection Friday from 9am, must be on site before 4pm

Kind regards,
Michael Barnes
michael.barnes@northgatesupplies.co.uk`;

const THIN = `Quote please S9 1AA to M1 1AA`;

let pass = 0, fail = 0;
const ck = (n, got, want) => {
  const ok = typeof want === 'function' ? want(got) : got === want;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : '  got ' + JSON.stringify(got)));
  ok ? pass++ : fail++;
};

const b = await chromium.launch();
const errs = [];
const pg = await b.newPage();
pg.on('pageerror', e => errs.push(String(e)));
await pg.goto('https://knect.usehaf.co.uk/', { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(2500);

console.log('\nTHE BOX IS THERE, ON THE JOB TILE');
ck('one opener on the front tile', await pg.locator('.calc-box .pj-open').first().count(), 1);
ck('the wording says what it is', (await pg.locator('.pj-open-t').first().innerText()).trim(),
  'Got the job in an email? Paste it in');
ck('and what it does', (await pg.locator('.pj-open-s').first().innerText()).toLowerCase(),
  s => s.includes('no retyping'));
ck('a second one inside the order flow', await pg.locator('[data-pj="b"] .pj-open').count(), 1);
ck('it is closed until pressed', await pg.locator('#pj-body-a').isVisible(), false);

console.log('\nPASTE A REAL JOB EMAIL IN');
await pg.locator('.calc-box .pj-open').first().click();
ck('the box opens', await pg.locator('#pj-body-a').isVisible(), true);
await pg.fill('#pj-txt-a', EMAIL);
await pg.locator('#pj-body-a button:has-text("Read it")').click();
await pg.waitForTimeout(300);
ck('it shows what it found', await pg.locator('#pj-found-a').isVisible(), true);
const rows = {};
for (const r of await pg.locator('#pj-list-a .pj-row').all())
  rows[(await r.locator('.pj-row-l').innerText()).trim().toLowerCase()] = (await r.locator('.pj-row-v').innerText()).trim();
console.log('   ' + JSON.stringify(rows, null, 1).replace(/\n/g, '\n   '));
ck('collection address', rows['collecting from'], 'Unit 4 Callum Park, Attercliffe, Sheffield S9 1AA');
ck('collection contact', rows['at collection, ask for'], 'John Wright · 07700 900123');
ck('delivery address', rows['delivering to'], '22 Trafford Way, Manchester M1 1AA');
ck('delivery contact', rows['at delivery, ask for'], 'Sarah Ellis · 07700 900456');
ck('what is moving', rows['what is moving'], s => /3 pallets of boxed clothing/.test(s || ''));
ck('how much there is', rows['how much there is'], s => /3 pallets/.test(s || '') && /few pallets/.test(s || ''));
ck('how heavy', rows['how heavy'], s => /300 kg/.test(s || ''));
ck('handling', rows['loading and handling'], s => /Tail lift/.test(s || '') && /Non-stackable/.test(s || ''));
ck('collection when', rows['collection'], s => /Friday/.test(s || '') && /09:00/.test(s || ''));
ck('the deadline', rows['must be delivered'], s => /4pm/.test(s || ''));
ck('who is asking', rows['you'], s => /Michael Barnes/.test(s || '') && /northgatesupplies/.test(s || ''));
ck('nothing reported missing', await pg.locator('#pj-miss-a').isVisible(), false);

console.log('\nPRESS IT INTO THE FORM');
await pg.locator('#pj-found-a button:has-text("Use these details")').click();
await pg.waitForTimeout(4000);
const v = async id => await pg.inputValue('#' + id);
ck('the order flow opened', await pg.locator('#inline-flow').isVisible(), true);
ck('collecting from', await v('fq-from'), 'S9 1AA');
ck('delivering to', await v('fq-to'), 'M1 1AA');
ck('exact weight', await v('fq-exact'), '300');
ck('quantity', await v('fq-qty'), '3');
ck('type', await v('fq-unit'), 'pallets');
ck('goods', await v('fq-goods'), s => /3 pallets of boxed clothing/.test(s));
ck('collection date is the coming Friday', await v('fq-cdate'), s => /^20\d\d-\d\d-\d\d$/.test(s) && new Date(s).getDay() === 5);
ck('collect from time', await v('fq-ctime'), '09:00');
ck('delivery requirement', await v('fq-dreq'), s => /4pm/.test(s));
ck('full collection address', await v('fq-caddr'), 'Unit 4 Callum Park, Attercliffe, Sheffield S9 1AA');
ck('collection contact name', await v('fq-cname'), 'John Wright');
ck('collection contact phone', await v('fq-cphone'), '07700 900123');
ck('full delivery address', await v('fq-daddr'), '22 Trafford Way, Manchester M1 1AA');
ck('delivery contact name', await v('fq-dname'), 'Sarah Ellis');
ck('delivery contact phone', await v('fq-dphone'), '07700 900456');
ck('your name', await v('fq-name'), 'Michael Barnes');
ck('your email', await v('fq-email'), 'michael.barnes@northgatesupplies.co.uk');
ck('weight band chosen', await pg.locator('#fq-wt .oopt.sel').count(), 1);
ck('size band chosen', await pg.locator('#fq-sz .oopt.sel').count(), 1);
ck('tail lift ticked', await pg.locator('#fq-reqs .tgl[data-req="tail"].sel').count(), 1);
ck('non-stackable ticked', await pg.locator('#fq-reqs .tgl[data-req="nostack"].sel').count(), 1);
ck('it says where the answers came from', await pg.locator('#pj-said').isVisible(), true);
ck('and does not claim the customer typed them',
  (await pg.locator('#pj-said').innerText()).toLowerCase(), s => s.includes('from what you pasted'));
const stepOn = await pg.evaluate(() => {
  const on = [...document.querySelectorAll('#if-fast .fstep.on')].map(e => e.id);
  return on.join(',');
});
console.log('   landed on: ' + stepOn);
ck('it walked past the load and the vehicle', stepOn, s => !/fq-1$|fq-2$|fq-3$/.test(s));
ck('a price is on screen', (await pg.locator('#fq-pr-range').innerText()).trim(), s => /£/.test(s));

console.log('\nPASTE SOMETHING THIN — IT MUST NOT INVENT');
const pg2 = await b.newPage();
pg2.on('pageerror', e => errs.push(String(e)));
await pg2.goto('https://knect.usehaf.co.uk/', { waitUntil: 'domcontentloaded' });
await pg2.waitForTimeout(2500);
await pg2.locator('.calc-box .pj-open').first().click();
await pg2.fill('#pj-txt-a', THIN);
await pg2.locator('#pj-body-a button:has-text("Read it")').click();
await pg2.waitForTimeout(250);
ck('it says what it could not find', await pg2.locator('#pj-miss-a').isVisible(), true);
const missTxt = (await pg2.locator('#pj-miss-a').innerText()).toLowerCase();
console.log('   ' + missTxt);
ck('names the missing weight', missTxt, s => s.includes('how heavy it is'));
ck('names the missing address', missTxt, s => s.includes('full collection address'));
ck('names the missing contact', missTxt, s => s.includes('asks for at collection'));
ck('promises no guess', missTxt, s => s.includes('rather than guessing'));
await pg2.locator('#pj-found-a button:has-text("Use these details")').click();
await pg2.waitForTimeout(3000);
const v2 = async id => await pg2.inputValue('#' + id);
ck('postcodes still carried', [await v2('fq-from'), await v2('fq-to')].join('>'), 'S9 1AA>M1 1AA');
ck('no address invented', [await v2('fq-caddr'), await v2('fq-daddr')].join('|'), s => s === '|' || s === 'S9 1AA|M1 1AA');
ck('no contact name invented', [await v2('fq-cname'), await v2('fq-dname')].join('|'), '|');
ck('no phone invented', [await v2('fq-cphone'), await v2('fq-dphone')].join('|'), '|');
ck('no weight invented', await v2('fq-exact'), '');
ck('no goods invented', await v2('fq-goods'), '');
ck('it stopped where the detail is missing', await pg2.evaluate(() =>
  [...document.querySelectorAll('#if-fast .fstep.on')].map(e => e.id).join(',')), s => /fq-2/.test(s));

console.log('\nPASTE SOMETHING THAT IS NOT A JOB');
const pg3 = await b.newPage();
pg3.on('pageerror', e => errs.push(String(e)));
await pg3.goto('https://knect.usehaf.co.uk/', { waitUntil: 'domcontentloaded' });
await pg3.waitForTimeout(2500);
await pg3.locator('.calc-box .pj-open').first().click();
await pg3.fill('#pj-txt-a', 'Thanks for the invoice, all paid. Speak next week.');
await pg3.locator('#pj-body-a button:has-text("Read it")').click();
await pg3.waitForTimeout(250);
ck('it refuses in plain words', await pg3.locator('#pj-err-a').isVisible(), true);
ck('and says what to do instead', (await pg3.locator('#pj-err-a').innerText()).toLowerCase(),
  s => s.includes('type the two postcodes'));
ck('and fills nothing', await pg3.locator('#pj-found-a').isVisible(), false);

console.log('\nno javascript errors on any of it: ' + (errs.length ? 'FAIL ' + errs.join(' | ') : 'yes'));
if (errs.length) fail++; else pass++;

await b.close();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
