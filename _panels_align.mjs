/* Does the account column actually line up?
   Brent asked twice for these three panels to align, so this measures rather
   than eyeballs: identical panel geometry, headings and arrows on shared lines,
   and the right column finishing level with the tile on the left. */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';

const TARGET = process.argv[2] || 'file:///agent/workspace/knect-orderfix/index.html';
const b = await chromium.launch();
const fails = [], passes = [];
const ok = (c, m) => { (c ? passes : fails).push((c ? 'PASS ' : 'FAIL ') + m); };

for (const [tag, vp] of [['desktop', { width: 1280, height: 1100 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  await p.goto(TARGET, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const gate = await p.$('#ag-code');
  if (gate) { await p.fill('#ag-code', 'HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }

  // ── the three panels themselves ────────────────────────────────────────
  const cards = await p.$$eval('.wtb .wtb-c', els => els.map(e => {
    const r = e.getBoundingClientRect();
    const q = s => { const n = e.querySelector(s); return n ? n.getBoundingClientRect() : null; };
    const h = q('.wtb-h'), i = q('.wtb-ico'), a = q('.wtb-a');
    return {
      id: e.id,
      h: Math.round(r.height), w: Math.round(r.width),
      left: Math.round(r.left), right: Math.round(r.right),
      headTop: h ? Math.round(h.top - r.top) : null,
      headLeft: h ? Math.round(h.left - r.left) : null,
      icoTop: i ? Math.round(i.top - r.top) : null,
      icoLeft: i ? Math.round(i.left - r.left) : null,
      actBottom: a ? Math.round(r.bottom - a.bottom) : null,
      actLeft: a ? Math.round(a.left - r.left) : null,
    };
  }));

  ok(cards.length === 3, `${tag}: three panels present (found ${cards.length})`);
  if (cards.length === 3) {
    const spread = k => Math.max(...cards.map(c => c[k])) - Math.min(...cards.map(c => c[k]));
    // Identical size and edges — one set, not three cards that each sized themselves.
    ok(spread('h') === 0, `${tag}: all three panels the same height (spread ${spread('h')}px, ${cards.map(c => c.h).join('/')})`);
    ok(spread('w') === 0, `${tag}: all three the same width (spread ${spread('w')}px)`);
    ok(spread('left') === 0, `${tag}: left edges flush (spread ${spread('left')}px)`);
    ok(spread('right') === 0, `${tag}: right edges flush (spread ${spread('right')}px)`);
    // Shared internal lines — what makes them read as a set.
    ok(spread('headTop') === 0, `${tag}: every heading starts on the same line (spread ${spread('headTop')}px)`);
    ok(spread('icoTop') === 0, `${tag}: every icon starts on the same line (spread ${spread('icoTop')}px)`);
    ok(spread('headLeft') === 0, `${tag}: headings share a left edge (spread ${spread('headLeft')}px)`);
    ok(spread('actLeft') === 0, `${tag}: action links share a left edge (spread ${spread('actLeft')}px)`);
    ok(spread('actBottom') === 0, `${tag}: every arrow sits the same distance off the bottom (spread ${spread('actBottom')}px)`);
    // The gaps between them must be equal, or "uniform" is a lie.
    const g1 = cards[1].leftTop, _ = g1; // placeholder, real gap read below
  }

  const gaps = await p.$$eval('.wtb .wtb-c', els => {
    const r = els.map(e => e.getBoundingClientRect());
    return [Math.round(r[1].top - r[0].bottom), Math.round(r[2].top - r[1].bottom)];
  });
  ok(gaps[0] === gaps[1], `${tag}: the two gaps between panels are equal (${gaps.join(' / ')}px)`);

  // ── the two columns finishing level (desktop only — phone stacks) ──────
  if (tag === 'desktop') {
    const cols = await p.evaluate(() => {
      const main = document.querySelector('.land-main .calc-box') || document.querySelector('.land-main > *');
      const ways = document.getElementById('side-ways');
      const login = document.getElementById('side-login');
      if (!main || !ways || !login) return null;
      const m = main.getBoundingClientRect(), w = ways.getBoundingClientRect(), l = login.getBoundingClientRect();
      return {
        mainTop: Math.round(m.top), mainBottom: Math.round(m.bottom),
        loginTop: Math.round(l.top),
        waysBottom: Math.round(w.bottom),
        sideVisible: getComputedStyle(ways).display !== 'none',
      };
    });
    if (!cols) { ok(false, 'desktop: could not find both columns'); }
    else {
      ok(Math.abs(cols.mainTop - cols.loginTop) <= 2,
        `desktop: both columns start on the same line (${cols.mainTop} vs ${cols.loginTop})`);
      const drift = cols.waysBottom - cols.mainBottom;
      ok(Math.abs(drift) <= 2,
        `desktop: right column finishes level with the left tile (off by ${drift}px)`);
    }
  }

  // ── the sign-up link ──────────────────────────────────────────────────
  const signup = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('a[href*="join.usehaf.co.uk"]').forEach(a => {
      const vis = a.offsetParent !== null || getComputedStyle(a).display !== 'none';
      out.push({ text: a.textContent.trim(), href: a.getAttribute('href'), vis });
    });
    return { links: out, cleverText: document.body.innerText.includes('Create one via CleverPay') };
  });
  ok(signup.links.length >= 1, `${tag}: a sign-up link points at join.usehaf.co.uk (${signup.links.length} found)`);
  ok(signup.links.every(l => /Create an account/i.test(l.text)),
    `${tag}: it reads "Create an account" (${signup.links.map(l => l.text).join(' | ')})`);
  ok(!signup.cleverText, `${tag}: the old "Create one via CleverPay" wording is gone`);

  // The demo door Brent confirmed must survive at both widths.
  const demo = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a[href*="demo.usehaf.co.uk"]')]
      .filter(n => n.offsetParent !== null);
    return a.map(n => ({ href: n.getAttribute('href'), target: n.getAttribute('target') }));
  });
  ok(demo.length >= 1, `${tag}: the live-demo button is on screen and points at demo.usehaf.co.uk`);
  ok(demo.every(d => d.target === '_blank'), `${tag}: it opens in its own tab, so a half-filled order survives`);

  await p.close();
}
await b.close();

console.log(passes.join('\n'));
if (fails.length) { console.log('\n' + fails.join('\n')); console.log(`\n${passes.length} passed, ${fails.length} FAILED`); process.exit(1); }
console.log(`\nAll ${passes.length} checks passed against ${TARGET}`);
