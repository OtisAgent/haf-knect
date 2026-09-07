#!/usr/bin/env node
/* Every figure on this page must come from somewhere we asked.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 7 September 2026 three separate blocks of invented figures were found on
 * the live KNECT page, each by a narrower search than the last:
 *
 *   1. Freight > Account Controls: "Network fee | 9% per job", a number below
 *      every job-type floor in the engine.
 *   2. The driver ticker: "83 drivers online, 12 open jobs, 4 en route,
 *      Rate £1.80-£2.40/mi, Manchester HIGH DEMAND, 9% network fee", rendering
 *      to drivers while the real network held no open work at all.
 *   3. The stat cards directly beneath it, carrying the same figures again --
 *      found only because a person read the RENDERED page after the file had
 *      been declared clean.
 *
 * The file already carried a comment saying this habit had been swept: "nothing
 * here is allowed to write a figure into the page by hand". Two instances
 * survived that sweep. A comment describes the sweep, never the file.
 *
 * WHAT THIS CHECKS, AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------
 * Every text leaf that reads as a number, money amount, percentage or rating
 * must be one of three things:
 *
 *   · inside a [data-seed] block   -- declared sample content, hidden from any
 *                                     account that is not a demo account;
 *   · an element JavaScript writes -- and whose markup holds a DASH, not a
 *                                     number: a literal behind a runtime id is
 *                                     a sample fallback, which the rule forbids;
 *   · on the ALLOWED list below    -- a figure we have decided may be typed,
 *                                     each with a written reason.
 *
 * Anything else fails. The ticker was a bare div with none of the three, which
 * is exactly what this refuses.
 *
 * It CANNOT tell you what a person actually sees: proving a marker works means
 * running the page's JavaScript in a browser, and this reads the document. So
 * it proves the marker is THERE, not that it fires. That second check is worth
 * building on top; this one costs an afternoon rather than a browser, and it
 * would have caught the ticker on the day it was written.
 *
 * THE ALLOWED LIST IS THE POINT
 * -----------------------------
 * It is the written answer to "which numbers on this page are allowed to be
 * typed by hand" -- a question nobody had ever had to state, which is how 63 of
 * them accumulated. Adding an entry should feel like a decision, because it is.
 *
 *   Usage:  node tools/no-unsourced-figures.test.js [file]
 *   Exit 0 clean, 1 with the offending figures listed.
 */
'use strict';
const fs = require('fs');
const path = process.argv[2] || 'index.html';

/* Figures that may be typed, each with the reason it is allowed. Keyed by where
   it sits and what it says, so moving a number somewhere else re-opens the
   question rather than inheriting the permission. */
const ALLOWED = [
  { at: 'plg>plc>pl-p', value: '£0',
    why: 'HAF KNECT Free. A real catalogue price, and the one that never changes.' },
  { at: 'plg>plc>pl-p', value: '£25',
    why: 'HAF KNECT Plus, £25/mo. Matches Stripe live and haf-plans-v3.json.' },
  { at: 'plg>plc>pl-p', value: '£100',
    why: 'HAF KNECT Pro, £100/mo. Matches Stripe live and haf-plans-v3.json.' },
];

/* KNOWN DEBT, which is NOT the same thing as ALLOWED and must never be read as
   it. The allow-list above says "this may be typed". The baseline file says
   "this is wrong and has not been fixed yet".
 *
 * When this check was written the page already held 60 of them -- mostly sample
 * content leaning on a runtime text heuristic instead of carrying a marker,
 * which is the arrangement that let the ticker through in the first place. They
 * are recorded so the check can be switched on today rather than waiting for an
 * afternoon nobody has, and it ratchets: a NEW figure fails the build, and the
 * count can only go down. Clearing an entry means giving that figure a marker
 * or a source, then deleting its line.
 *
 * A baseline that is allowed to grow is just a list of excuses, so growth fails
 * exactly as loudly as a brand-new violation. */
const BASELINE_PATH = require('path').join(__dirname, 'unsourced-figures.baseline.json');

/* A number, a money amount, a range, a percentage, or a star rating. Deliberately
   not dates or postcodes -- those are not claims about the business. */
const FIGURE = /^\s*(£\s?[\d.,]+(\s?[–—-]\s?£?[\d.,]+)?|[\d,]+(\.\d+)?★?|\d{1,3}(\.\d)?%)\s*$/;
const VOID = new Set(['br','img','input','hr','meta','link','path','circle','use','area','col','source']);

const src = fs.readFileSync(path, 'utf8');

/* Ids JavaScript writes to. If the markup holds a number for one of these it is
   a placeholder, not a claim -- though a placeholder that could be mistaken for
   real should still be a dash, which is a judgement this cannot make for you. */
const written = new Set();
for (const m of src.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) written.add(m[1]);
for (const m of src.matchAll(/querySelector\(['"]#([^'"\s.[]+)['"]\)/g)) written.add(m[1]);

/* A deliberately small tokenizer rather than a dependency: this has to run
   anywhere, including a fresh clone with no install step. */
const TAG = /<(\/?)([a-zA-Z][-a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const ATTR = /([-a-zA-Z0-9_:]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;

const stack = [];
const failures = [];
let skipDepth = 0, last = 0, m;

function attrs(raw) {
  const out = {};
  let a;
  ATTR.lastIndex = 0;
  while ((a = ATTR.exec(raw))) out[a[1].toLowerCase()] = (a[2] || '').replace(/^["']|["']$/g, '');
  return out;
}
function chain() {
  return stack.slice(-3)
    .map(f => (f.a.class || '').split(/\s+/)[0] || f.t)
    .join('>');
}
function lineOf(i) { return src.slice(0, i).split('\n').length; }

function text(chunk, at) {
  if (skipDepth || !stack.length) return;
  const t = chunk.replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&amp;/g, '&').trim();
  if (!t || !FIGURE.test(t)) return;
  const top = stack[stack.length - 1];
  if (stack.some(f => 'data-seed' in f.a)) return;         // declared sample content
  /* 🔴 TIGHTENED 7 Sep, and it is Henry's catch against MY rule.
     This used to exempt anything with an id that JavaScript writes to, on the
     reasoning that the markup value is only a placeholder. That is exactly what
     Brent's rule forbids: "it is read live, or it is not shown." A literal
     sitting behind an id is a SAMPLE FALLBACK — if the live read ever fails,
     the page quietly shows it and looks entirely normal doing so. The capacity
     bar did precisely that with a rate band matching no entry in the table it
     was painted from.
     So an id still exempts the ELEMENT, but never a FIGURE inside it. A
     placeholder must be a dash, an empty string, or nothing. */
  if (top.a.id && written.has(top.a.id)) {
    failures.push({ value: t, where: chain(), line: lineOf(at), id: top.a.id,
                    why: 'literal fallback behind a runtime id' });
    return;
  }
  const where = chain();
  if (ALLOWED.some(r => r.value === t && r.at === where)) return;
  failures.push({ value: t, where, line: lineOf(at), id: top.a.id || null });
}

while ((m = TAG.exec(src))) {
  text(src.slice(last, m.index), last);
  last = TAG.lastIndex;
  const [, closing, name, raw, selfClose] = m;
  const tag = name.toLowerCase();
  if (closing) {
    if ((tag === 'script' || tag === 'style') && skipDepth) skipDepth--;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].t === tag) { stack.length = i; break; }
    }
  } else {
    if (tag === 'script' || tag === 'style') skipDepth++;
    if (!selfClose && !VOID.has(tag)) stack.push({ t: tag, a: attrs(raw) });
  }
}

/* Compare against the recorded debt by (place, value), never by line number:
   a figure that moves is the same figure, and one that appears somewhere new is
   a new claim. */
const key = f => f.where + '|' + f.value;
const now = {};
for (const f of failures) now[key(f)] = (now[key(f)] || 0) + 1;

let base = {};
try { base = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).figures || {}; }
catch (e) { base = {}; }

const added = [], grown = [], fixed = [];
for (const k of Object.keys(now)) {
  const was = base[k] || 0;
  if (!was) added.push([k, now[k]]);
  else if (now[k] > was) grown.push([k, was, now[k]]);
}
for (const k of Object.keys(base)) if (!now[k]) fixed.push(k);

if (fixed.length) {
  console.log('\n' + fixed.length + ' recorded figure(s) are gone — delete them from the baseline:');
  for (const k of fixed) console.log('   ' + k);
}

if (!added.length && !grown.length) {
  const debt = Object.values(now).reduce((a, b) => a + b, 0);
  console.log('ok — no new typed figures in ' + path + '.');
  console.log('   ' + ALLOWED.length + ' allowed by name, ' + written.size +
              ' ids written by script, ' + debt + ' recorded as debt still to clear.');
  if (fixed.length) process.exitCode = 1;   // the baseline is stale; make someone trim it
  process.exit(process.exitCode || 0);
}

/* stdout before the exit, always: a red nobody can read is barely better than a
   false green. */
console.log('\nNEW figure(s) stated but never read, in ' + path + ':\n');
const isNew = new Set(added.map(a => a[0]));
for (const f of failures) {
  if (!isNew.has(key(f))) continue;
  console.log('  line ' + String(f.line).padEnd(7) + String(f.value).padEnd(12) +
              f.where + (f.id ? '  #' + f.id : ''));
}
for (const [k, was, is] of grown) {
  console.log('  ' + k + '  went from ' + was + ' to ' + is);
}
console.log('\nEach one needs ONE of:');
console.log('  · a [data-seed] marker, if it is sample content for a demo account;');
console.log('  · an id this page writes to from a real source;');
console.log('  · an entry in ALLOWED here, with the reason it may be typed.\n');
process.stdout.write('');
process.exitCode = 1;
