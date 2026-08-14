/* Drives the 14-Aug consignment layout:
   - the HAF Pick door is gone from the page but its engine still allocates
   - one "Continue to book" button carries the front answers into stage one
   - the three ways to book sit under the login, with Talk to HAF folded in
   - WhatsApp is drawn but inert
   Run: node _layout_e2e.mjs */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';

const URL = process.env.TARGET_URL || 'file:///agent/workspace/knect-orderfix/index.html';
const SHOT = '/agent/workspace/knect-orderfix/_shots';
const fails = [], notes = [];
const ok = (c, m) => { (c ? notes : fails).push((c ? 'PASS ' : 'FAIL ') + m); };

const b = await chromium.launch();

for (const [tag, vp] of [['desktop', { width: 1280, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  const gate = await p.$('#ag-code');
  if (gate) { await p.fill('#ag-code', 'HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(500); }

  const vis = s => p.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const st = getComputedStyle(e);
    return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }, s);
  const shot = n => p.screenshot({ path: `${SHOT}/lay-${tag}-${n}.png`, fullPage: tag === 'desktop' });

  /* ── 1. the HAF Pick door is off the page ── */
  const doors = await p.evaluate(() =>
    [...document.querySelectorAll('.ptile')].map(e => (e.querySelector('.ptile-h') || {}).textContent || ''));
  ok(doors.length === 0, `[${tag}] the three pathway tiles are gone (found ${doors.length})`);
  /* Case matters here: the card is styled in capitals, so a case-sensitive test
     would pass on a page that still shows it. Ask case-INSENSITIVELY, then name
     every place the words survive — the only allowed one is the recommended-
     vehicle card, which IS the allocation Brent asked us to keep. */
  const pickText = await p.evaluate(() => {
    const hits = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    for (let e = walk.nextNode(); e; e = walk.nextNode()) {
      if (e.children.length) continue;
      const t = (e.innerText || '').trim();
      if (!/haf\s*pick/i.test(t)) continue;
      const r = e.getBoundingClientRect(), st = getComputedStyle(e);
      if (st.display === 'none' || st.visibility === 'hidden' || !r.width || !r.height) continue;
      hits.push((e.closest('#cf-veh, .hpick') ? 'recommended-vehicle' : 'ELSEWHERE:' + t));
    }
    return hits;
  });
  const strays = pickText.filter(h => h !== 'recommended-vehicle');
  ok(strays.length === 0,
    `[${tag}] the HAF Pick booking door is off the page — the words survive only on the recommended-vehicle card${strays.length ? ' — STRAY: ' + strays.join(' | ') : ''}`);
  ok(!(await p.evaluate(() => !!document.querySelector('#if-pick.on, [data-flow="pick"].on'))),
    `[${tag}] its own booking flow is not reachable from the page`);
  /* but the engine it used is still there and still allocating */
  ok(await p.evaluate(() => typeof allocateVehicle === 'function' && typeof openFlow === 'function'),
    `[${tag}] the allocation engine and the flow it fed are both still wired`);

  /* ── 2. one door, under the price ── */
  ok(await vis('#cf-go'), `[${tag}] one "Continue to book" button sits under the guide price`);

  /* ── 3. the ways-to-book card, under the login, Talk to HAF and the demo
         request both gone (Brent, 14 Aug) ── */
  const ways = await p.evaluate(() => {
    const c = document.getElementById('side-ways');
    if (!c) return null;
    const login = document.getElementById('side-login');
    return {
      heads: [...c.querySelectorAll('.wtb-h')].map(e => e.textContent.trim()),
      talk: !!c.querySelector('.wtb-sub'),
      phone: !!c.querySelector('a[href^="tel:"]'),
      wa: !!c.querySelector('a[href*="wa.me"], a[href*="whatsapp"]'),
      demoBtn: !!c.querySelector('.dr-btn'),
      belowLogin: !!(login && (login.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)),
      talkPanelGone: !document.getElementById('side-talk')
    };
  });
  ok(ways && ways.heads.length === 3, `[${tag}] three ways to book: ${JSON.stringify((ways || {}).heads)}`);
  ok(ways && /repeat/i.test(ways.heads[0]) && /email/i.test(ways.heads[1]) && /whatsapp/i.test(ways.heads[2]),
    `[${tag}] in the order Brent asked for — repeat, email, WhatsApp`);
  ok(ways && ways.belowLogin, `[${tag}] the card sits under the login box`);
  ok(ways && ways.talkPanelGone && !ways.talk && !ways.phone && !ways.wa && !ways.demoBtn,
    `[${tag}] Talk to HAF and Request a demo are off the card — three panels and nothing else`);

  /* ── 3a. the demo request is gone from the WHOLE page, not just that card,
         and the one demo door left points at demo.usehaf.co.uk. Ask for the
         resolved href, so a relative or mistyped link cannot pass. */
  const demo = await p.evaluate(() => {
    const label = e => (e.innerText || e.textContent || '').trim();
    const clickable = [...document.querySelectorAll('a,button')].filter(e => {
      const r = e.getBoundingClientRect(), st = getComputedStyle(e);
      return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    });
    const asks = clickable.filter(e => /request a demo/i.test(label(e))).map(label);
    const tries = clickable.filter(e => /try a live demo/i.test(label(e)))
      .map(e => ({ href: e.href || '', blank: e.target === '_blank' }));
    return {
      asks,
      tries,
      formGone: !document.getElementById('dr-ov'),
      fnGone: typeof window.openDemoReq === 'undefined' && typeof window.submitDemoReq === 'undefined',
      mailchimp: /list-manage\.com\/subscribe/.test(document.documentElement.innerHTML)
    };
  });
  ok(demo.asks.length === 0,
    `[${tag}] nothing on the page still asks people to request a demo${demo.asks.length ? ' — STRAY: ' + demo.asks.join(' | ') : ''}`);
  ok(demo.formGone && demo.fnGone, `[${tag}] the old demo request form and its code are gone, not just hidden`);
  ok(!demo.mailchimp, `[${tag}] the page no longer signs anyone up to a mailing list of its own`);
  ok(demo.tries.length > 0 && demo.tries.every(t => t.href === 'https://demo.usehaf.co.uk/' || t.href === 'https://demo.usehaf.co.uk'),
    `[${tag}] every "Try a live demo" goes to demo.usehaf.co.uk: ${JSON.stringify(demo.tries.map(t => t.href))}`);
  ok(demo.tries.every(t => t.blank), `[${tag}] and opens in its own tab, so a half-typed order is not thrown away`);

  /* ── 3ii. the two columns finish on the same line (desktop only — on a
         phone they are stacked, so there is no line to share). Measure the
         real boxes: bottom of the left main column vs bottom of the last card
         in the side column, and the three panels equal to each other. */
  const align = await p.evaluate(() => {
    const main = document.querySelector('.land-main');
    const ways = document.getElementById('side-ways');
    if (!main || !ways) return null;
    const cards = [...document.querySelectorAll('#side-ways .wtb-c')].map(c => c.getBoundingClientRect().height);
    return {
      mainBottom: main.getBoundingClientRect().bottom,
      sideBottom: ways.getBoundingClientRect().bottom,
      stacked: getComputedStyle(document.querySelector('.land-body')).gridTemplateColumns.split(' ').length < 2,
      spread: cards.length ? Math.max(...cards) - Math.min(...cards) : null,
      cards
    };
  });
  if (tag === 'desktop') {
    ok(align && !align.stacked, `[${tag}] the page is still in two columns`);
    ok(align && Math.abs(align.mainBottom - align.sideBottom) <= 24,
      `[${tag}] the side column ends level with the tile on the left (${align ? Math.round(Math.abs(align.mainBottom - align.sideBottom)) : '?'}px apart)`);
    ok(align && align.spread !== null && align.spread <= 2,
      `[${tag}] the three panels are the same size as each other (${align ? Math.round(align.spread) : '?'}px apart)`);
  }

  /* ── 3b. each card actually reads as a card, not one run-on line ──
     These live inside a <button>, so every part has to be made a block by
     hand. Measure it rather than trust it: heading, sentence and arrow must
     each start on their own line, and nothing may sit under the badge. */
  const stacked = await p.evaluate(() => {
    return [...document.querySelectorAll('#side-ways .wtb-c')].map(c => {
      const r = e => e ? e.getBoundingClientRect() : null;
      const h = r(c.querySelector('.wtb-h')), t = r(c.querySelector('.wtb-p')), a = r(c.querySelector('.wtb-a'));
      const badge = r(c.querySelector('.wtb-soon'));
      const clash = badge && h && badge.left < h.right && badge.top < h.bottom && badge.bottom > h.top;
      return { name: c.querySelector('.wtb-h').textContent.trim(), stack: !!(h && t && a && t.top >= h.bottom - 1 && a.top >= t.bottom - 1), clash: !!clash };
    });
  });
  ok(stacked.every(s => s.stack),
    `[${tag}] every card stacks heading / sentence / arrow: ${stacked.filter(s => !s.stack).map(s => s.name).join(', ') || 'all three fine'}`);
  ok(stacked.every(s => !s.clash),
    `[${tag}] the coming-soon badge does not sit on top of the heading`);

  /* ── 4. WhatsApp is drawn but does nothing ── */
  const waCard = await p.evaluate(() => {
    const e = document.getElementById('wtb-whatsapp');
    return e ? { soon: !!e.querySelector('.wtb-soon'), click: !!e.getAttribute('onclick'), tag: e.tagName } : null;
  });
  ok(waCard && waCard.soon && !waCard.click && waCard.tag !== 'BUTTON',
    `[${tag}] WhatsApp is marked coming soon and cannot be clicked into a dead end`);

  /* ── 5. the email order really opens the ready-written quote ── */
  await p.click('#wtb-email'); await p.waitForTimeout(400);
  const eq = await p.evaluate(() => {
    const t = document.getElementById('eq-body');
    return t ? { shown: getComputedStyle(document.getElementById('email-quote')).display !== 'none', len: t.value.length, to: /quote@usehaf\.co\.uk/.test(document.body.innerText) } : null;
  });
  ok(eq && eq.shown && eq.len > 200, `[${tag}] "Order by email" opens a ready-written request (${(eq || {}).len} characters)`);
  ok(eq && eq.to, `[${tag}] and it is addressed to quote@usehaf.co.uk`);
  await shot('1-landing');
  await p.evaluate(() => closeEmailQuote());

  /* ── 6. the front answers carry into the consignment ── */
  await p.fill('#pc-from', 'S9 1AA');
  await p.fill('#pc-to', 'M1 1AA');
  await p.waitForTimeout(300);
  // answer both load questions on the front calculator
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('.lp-tile')];
    const half = Math.floor(t.length / 2);
    t[2].click();          // a weight band
    t[half + 2].click();   // a size band
  });
  await p.waitForTimeout(300);
  const front = await p.evaluate(() => ({ wt: selWtKey, sz: selSzKey, van: selVanKey }));
  ok(front.wt && front.sz, `[${tag}] front calculator holds both answers (${front.wt} / ${front.sz})`);

  await p.click('#cf-go'); await p.waitForTimeout(600);
  const carried = await p.evaluate(() => {
    const on = document.querySelector('#if-fast .fstep.on');
    return {
      step: on ? on.id : null,
      from: (document.getElementById('fq-from') || {}).value,
      to: (document.getElementById('fq-to') || {}).value,
      wt: [...document.querySelectorAll('#fq-wt .oopt')].find(e => e.classList.contains('sel'))?.dataset.k,
      sz: [...document.querySelectorAll('#fq-sz .oopt')].find(e => e.classList.contains('sel'))?.dataset.k,
      title: (document.getElementById('if-title') || {}).textContent
    };
  });
  ok(carried.step === 'fq-2', `[${tag}] both postcodes in, so it opens straight on stage two (${carried.step})`);
  ok(carried.from === 'S9 1AA' && carried.to === 'M1 1AA', `[${tag}] the postcodes carried over, not re-asked`);
  ok(carried.wt === front.wt && carried.sz === front.sz,
    `[${tag}] the load answers carried over too (${carried.wt} / ${carried.sz})`);
  ok(/consignment/i.test(carried.title || ''), `[${tag}] it is called "${carried.title}"`);
  await shot('2-carried');

  /* ── 7. the ways card steps out of the way during the consignment ── */
  ok((await vis('#side-ways')) === false && (await vis('#inline-flow')) === true,
    `[${tag}] once the consignment is open the page is just the consignment`);

  /* ── 8. and the allocation the removed panel used to do still happens ── */
  await p.evaluate(() => fqNext(3)); await p.waitForTimeout(400);
  const pick = await p.evaluate(() => ({
    v: ((document.getElementById('fq-pick-v') || {}).textContent || '').trim(),
    w: ((document.getElementById('fq-pick-w') || {}).textContent || '').trim()
  }));
  ok(pick.v && pick.v !== '—', `[${tag}] HAF still picks the van itself: "${pick.v}"`);
  ok(pick.w.length > 30, `[${tag}] and still says why in plain words`);
  await shot('3-still-allocates');

  /* ── 9. leaving a half-filled consignment asks first, and means it ──
     A part-typed order must not vanish on a mis-tap: the page asks. Say no and
     the consignment is still there with the answers in it; say yes and it goes.
     Both halves are proven here, because a guard nobody can pass is as bad as
     no guard at all. */
  let asked = '';
  const answer = yes => {
    const h = d => { asked = d.message(); yes ? d.accept() : d.dismiss(); };
    p.once('dialog', h);
  };

  answer(false);                                    // the mis-tap: "no, stay"
  await p.evaluate(() => closeInlineFlow()); await p.waitForTimeout(400);
  ok(/not be kept/i.test(asked), `[${tag}] leaving a half-filled consignment asks first: "${asked}"`);
  ok((await vis('#inline-flow')) === true, `[${tag}] saying no keeps the consignment open`);
  const kept = await p.evaluate(() => (document.getElementById('fq-from') || {}).value);
  ok(kept === 'S9 1AA', `[${tag}] and the answers already typed are still there (${kept})`);

  answer(true);                                     // meant it: "yes, leave"
  await p.evaluate(() => closeInlineFlow()); await p.waitForTimeout(400);
  ok((await vis('#inline-flow')) === false, `[${tag}] saying yes closes the consignment`);
  ok((await vis('#side-ways')) === true, `[${tag}] and the three ways to book come back`);

  /* ── 10. repeat-an-order still opens ── */
  await p.click('#wtb-repeat'); await p.waitForTimeout(400);
  ok(await vis('#if-repeat'), `[${tag}] "Repeat an order" still opens its own flow`);
  await p.evaluate(() => closeInlineFlow()); await p.waitForTimeout(200);

  ok(errs.length === 0, `[${tag}] no script errors on the page${errs.length ? ' — ' + errs.join(' | ') : ''}`);
  await p.close();
}

await b.close();
console.log(notes.join('\n'));
if (fails.length) { console.log('\n' + fails.join('\n')); }
console.log(`\n${notes.length} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
