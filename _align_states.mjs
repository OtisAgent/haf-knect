/* Alignment that only holds in the empty state is not alignment.
   The left tile grows when a price appears and when the vehicle list opens out,
   and the email-quote panel un-hides a wrapper I just dissolved. Each of those
   is a state Brent will actually be looking at, so each gets measured. */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';

const TARGET = process.argv[2] || 'file:///agent/workspace/knect-orderfix/index.html';
const b = await chromium.launch();
const fails = [], passes = [];
const ok = (c, m) => { (c ? passes : fails).push((c ? 'PASS ' : 'FAIL ') + m); };

const p = await b.newPage({ viewport: { width: 1280, height: 1100 } });
await p.goto(TARGET, { waitUntil: 'load' });
await p.waitForTimeout(800);
const gate = await p.$('#ag-code');
if (gate) { await p.fill('#ag-code', 'HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }

const bottoms = () => p.evaluate(() => {
  const c = document.querySelector('.land-main .calc-box');
  const w = document.getElementById('side-ways');
  if (!c || !w) return null;
  return { left: Math.round(c.getBoundingClientRect().bottom), right: Math.round(w.getBoundingClientRect().bottom) };
});
const panelSpread = () => p.$$eval('.wtb .wtb-c', els => {
  const h = els.map(e => Math.round(e.getBoundingClientRect().height));
  return { spread: Math.max(...h) - Math.min(...h), heights: h };
});
const level = async (label) => {
  const t = await bottoms();
  if (!t) return ok(false, `${label}: could not measure both columns`);
  ok(Math.abs(t.right - t.left) <= 2, `${label}: columns finish level (off by ${t.right - t.left}px)`);
  const s = await panelSpread();
  ok(s.spread === 0, `${label}: three panels still identical (spread ${s.spread}px, ${s.heights.join('/')})`);
};

await level('empty');

// ── a guide price appears, so the left tile grows ────────────────────────
await p.fill('#pc-from', 'S9 1AA').catch(() => {});
await p.fill('#pc-to', 'M1 1AA').catch(() => {});
await p.waitForTimeout(2500);
const priced = await p.evaluate(() => {
  const box = document.getElementById('lp-priced');
  if (!box || getComputedStyle(box).display === 'none') return null;
  const r = document.getElementById('lp-range');
  return r && /£/.test(r.textContent) ? r.textContent.trim() : null;
});
ok(!!priced, `a guide price actually appeared before measuring the priced state (${priced || 'none'})`);
await level('price showing');

// ── the full vehicle list opens out ──────────────────────────────────────
const seeAll = await p.$('#veh-open');
if (seeAll) { await seeAll.click(); await p.waitForTimeout(500); await level('every vehicle open'); }
else ok(false, 'could not find the "See every vehicle" control');

// ── the email-quote panel un-hides the wrapper I dissolved ───────────────
await p.evaluate(() => window.openEmailQuote && window.openEmailQuote());
await p.waitForTimeout(600);
const eq = await p.evaluate(() => {
  const e = document.getElementById('email-quote');
  if (!e) return null;
  const r = e.getBoundingClientRect();
  const cs = getComputedStyle(e);
  const body = document.getElementById('eq-body');
  return { visible: cs.display !== 'none' && r.height > 100, top: Math.round(r.top), h: Math.round(r.height),
           filled: body ? body.value.length > 40 : false };
});
ok(eq && eq.visible, `the email quote panel still opens after dissolving its wrapper (height ${eq ? eq.h : 'n/a'}px)`);
ok(eq && eq.filled, 'it still arrives pre-filled with what the customer typed');

await p.close();
await b.close();

console.log(passes.join('\n'));
if (fails.length) { console.log('\n' + fails.join('\n')); console.log(`\n${passes.length} passed, ${fails.length} FAILED`); process.exit(1); }
console.log(`\nAll ${passes.length} state checks passed against ${TARGET}`);
