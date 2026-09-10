/* The HAF mobile bottom navigation, tested in a real browser at real phone
 * sizes, against the real page.
 *
 * The property that matters most is COMPLETENESS: the hamburger is hidden once
 * this bar draws, so if the More panel ever misses a section, that section is
 * gone from every phone. So every case below rebuilds the expected list from
 * hafNavModel — the page's own model — and demands the panel match it exactly.
 * A test that carried its own copy of the menu would pass while the phone lost
 * a screen.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

/* Point NAV_URL at a deployed address to run these same checks against the
   surface a person actually opens, rather than the file on this machine. */
const FILE = process.env.NAV_URL || 'file://' + fileURLToPath(new URL('./index.html', import.meta.url));

const PHONES = [
  { name: 'small iPhone (SE)', w: 375, h: 667 },
  { name: 'modern iPhone',     w: 390, h: 844 },
  { name: 'Android phone',     w: 412, h: 915 },
  { name: 'phone sideways',    w: 844, h: 390 },
  { name: 'tablet portrait',   w: 768, h: 1024 },
];

/* Every account type the product actually issues, plus the override case Brent
   hit himself (a freight account carrying owner-driver rights). */
const ACCOUNTS = [
  { key: 'driver-released',   acc: { type:'driver',             drives:true,  released:true,  name:'Test Driver' },
    expect: ['home','work','action','plan','more'], work:'Jobs',     plan:'PLNA' },
  { key: 'driver-pending',    acc: { type:'driver',             drives:true,  released:false, name:'Pending Driver' },
    expect: ['home','work','action','plan','more'], work:'Jobs',     plan:'PLNA' },
  { key: 'business',          acc: { type:'business',           drives:false, released:false, name:'Test Business' },
    expect: ['home','work','action','plan','more'], work:'Orders',   plan:'Payments' },
  { key: 'fleet',             acc: { type:'fleet',              drives:false, released:false, name:'Test Fleet' },
    expect: ['home','work','action','plan','more'], work:'Orders',   plan:'Payments' },
  { key: 'fleet-drives',      acc: { type:'fleet',              drives:true,  released:true,  name:'Fleet Driver' },
    expect: ['home','work','action','plan','more'], work:'Jobs',     plan:'PLNA' },
  { key: 'freight',           acc: { type:'freight_forwarder',  drives:false, released:false, name:'Test Freight' },
    expect: ['home','work','action','plan','more'], work:'Loads',    plan:'Payments' },
  { key: 'freight-override',  acc: { type:'freight_forwarder',  drives:true,  released:true,  name:'Master Freight' },
    expect: ['home','work','action','plan','more'], work:'Loads',    plan:'PLNA' },
];

let pass = 0, fail = 0, vacuous = 0;
const fails = [];
function ok(cond, label, detail) {
  if (cond) { pass++; }
  else { fail++; fails.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
function note(label) { vacuous++; console.log('  ~~   ' + label + ' (nothing to test — reported, not counted as a pass)'); }

/* Put the page into the signed-in state for a given account by calling the
   page's OWN builder. Nothing about permissions is stubbed: buildNavV1 runs
   hafNavModel, which runs hafPerms, exactly as it does for a real person. */
async function signInAs(page, acc) {
  return page.evaluate((acc) => {
    document.getElementById('app').classList.add('open');
    const l = document.getElementById('landing'); if (l) l.style.display = 'none';
    window.ct = 'pane-d-home';
    try { window.switchTab('pane-d-home'); } catch (e) {}
    window.buildNavV1(acc);
    return true;
  }, acc);
}

const browser = await chromium.launch();

for (const phone of PHONES) {
  console.log('\n=== ' + phone.name + ' (' + phone.w + 'x' + phone.h + ') ===');
  const ctx = await browser.newContext({ viewport: { width: phone.w, height: phone.h }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => { fail++; fails.push(phone.name + ': page error ' + e.message); console.log('  FAIL page error: ' + e.message); });
  await page.goto(FILE);
  await page.waitForTimeout(400);

  for (const C of ACCOUNTS) {
    console.log(' -- ' + C.key);
    await signInAs(page, C.acc);
    await page.waitForTimeout(120);

    /* 1. the bar drew, with the positions this account should have */
    const bar = await page.evaluate(() => {
      const b = document.getElementById('haf-tabbar');
      if (!b) return null;
      const cs = getComputedStyle(b);
      return {
        display: cs.display,
        items: [...b.querySelectorAll('.tbi')].map(el => ({
          label: (el.querySelector('.tbi-l') || {}).textContent || '',
          aria: el.getAttribute('aria-label') || '',
          action: el.classList.contains('tbi-act'),
          on: el.classList.contains('on'),
          h: el.getBoundingClientRect().height,
          w: el.getBoundingClientRect().width,
        })),
        rect: b.getBoundingClientRect(),
        bodyClass: document.body.classList.contains('haf-tabbar-on'),
      };
    });
    ok(bar !== null, C.key + ' bar exists');
    if (!bar) continue;
    ok(bar.display === 'flex', C.key + ' bar is shown on a phone', 'display=' + bar.display);
    ok(bar.items.length === C.expect.length, C.key + ' has ' + C.expect.length + ' positions', 'got ' + bar.items.length);
    ok(bar.bodyClass, C.key + ' body marked so the hamburger stands down');

    /* 2. the right destination in each position, for this account type */
    const labels = bar.items.map(i => i.label);
    ok(labels[1] === C.work, C.key + ' second position is ' + C.work, 'got "' + labels[1] + '"');
    ok(labels[3] === C.plan, C.key + ' fourth position is ' + C.plan, 'got "' + labels[3] + '"');
    ok(bar.items[2] && bar.items[2].action, C.key + ' centre position is the action button');
    ok(labels[4] === 'More', C.key + ' fifth position is More', 'got "' + labels[4] + '"');

    /* 3. Home is highlighted, because that is the screen showing */
    ok(bar.items[0].on, C.key + ' the showing screen is the highlighted tab');

    /* 4. every touch target is at least 44px */
    const small = bar.items.filter(i => i.h < 44 || i.w < 40);
    ok(small.length === 0, C.key + ' every tap target is 44px or more', small.length + ' too small');

    /* 5. THE COMPLETENESS PROPERTY — MORE opens the ONE menu, and every screen
       the model gives this account is reachable inside it AND lands somewhere
       that exists.

       The menu groups its screens under headings that open one at a time, so
       only the open heading's rows are in the page. Reachable therefore means
       "open the heading and the row is there", which is what a person does, so
       that is what this walks. Checked by row id rather than wording: a heading
       holding a single screen is drawn under the HEADING's name here and under
       the SCREEN's name on the bar, and a text match would call that a loss. */
    await page.evaluate(() => window.hafTabMore());
    /* wait for the panel to finish sliding rather than guessing at a delay —
       a fixed pause passes on a fast machine and fails on a slow one */
    await page.waitForFunction(() => {
      const p = document.getElementById('sidebar');
      return p && p.classList.contains('open') && p.getBoundingClientRect().left > -5;
    }, null, { timeout: 4000 }).catch(() => {});
    const comp = await page.evaluate((acc) => {
      const panel = document.getElementById('sidebar');
      const model = window.hafNavModel(acc);
      const want = [], found = [], broken = [];
      const target = (id) => {
        const r = document.getElementById(id); if (!r) return;
        const m = (r.getAttribute('onclick') || '').match(/switchTab\('pane-([^']+)'\)/);
        if (m && !document.getElementById('pane-' + m[1])) broken.push(id + ' -> pane-' + m[1]);
      };
      model.forEach(sec => {
        if (sec.locked) {
          want.push('ni-sec-' + sec.id);
          if (panel.querySelector('#ni-sec-' + sec.id)) found.push('ni-sec-' + sec.id);
          return;
        }
        const need = (sec.tabs || []).map(t => 'ni-' + t.id);
        need.forEach(id => want.push(id));
        /* open this heading if its rows are not showing yet */
        for (let i = 0; i < 2 && need.some(id => !document.getElementById(id)); i++) {
          try { window.hafSecToggle(sec.id) } catch (e) {}
        }
        need.forEach(id => { if (document.getElementById(id)) { found.push(id); target(id) } });
      });
      return { want, found, broken,
        open: panel.classList.contains('open'),
        onScreen: panel.getBoundingClientRect().left > -5,
        hasSignOut: !!panel.querySelector('.so-btn') };
    }, C.acc);
    const missing = comp.want.filter(w => !comp.found.includes(w));
    ok(comp.want.length > 0, C.key + ' the model actually offers screens to check', 'model was empty');
    if (comp.want.length === 0) note(C.key + ' completeness');
    ok(comp.open && comp.onScreen, C.key + ' MORE opens the drop-down menu');
    ok(missing.length === 0, C.key + ' every screen the model gives is reachable in the menu (' + comp.want.length + ')', 'missing: ' + missing.join(', '));
    ok(comp.broken.length === 0, C.key + ' every menu row lands on a screen that exists', comp.broken.join(', '));
    ok(comp.hasSignOut, C.key + ' the menu offers sign out');

    /* 6. it closes again, and closing does not leave the page blocked */
    const closed = await page.evaluate(() => {
      window.hafSbClose();
      const pn = document.getElementById('sidebar'), o = document.getElementById('sb-ov');
      return { open: pn.classList.contains('open'),
               ov: o ? getComputedStyle(o).pointerEvents : 'none' };
    });
    ok(closed.open === false && closed.ov === 'none', C.key + ' the menu closes and stops blocking the screen');

    /* 7. the centre button offers only actions this account really has */
    const act = await page.evaluate((acc) => {
      window.hafTabAction();
      const cards = [...document.querySelectorAll('#tbs-b .tba-c')];
      const names = cards.map(c => c.querySelector('b').textContent.trim());
      const onclick = cards.map(c => (c.getAttribute('onclick') || '').match(/'([^']+)'/)[1]);
      const allowed = [];
      window.hafNavModel(acc).forEach(s => { if (!s.locked) (s.tabs || []).forEach(t => allowed.push(t.id)); });
      window.hafTabSheetClose();
      return { names, onclick, allowed };
    }, C.acc);
    ok(act.names.length > 0 && act.names.length <= 6, C.key + ' centre button offers 1 to 6 actions', 'got ' + act.names.length);
    const notAllowed = act.onclick.filter(id => !act.allowed.includes(id));
    ok(notAllowed.length === 0, C.key + ' centre button offers nothing this account has not got', notAllowed.join(', '));
    if (C.acc.drives) ok(act.names[0] === 'Find Work' || act.names[0] === 'Active Loads', C.key + ' a driver is offered work first', 'first was ' + act.names[0]);
    else ok(act.names[0] === 'Post a Job' || act.names[0] === 'Active Loads', C.key + ' a sender is offered posting first', 'first was ' + act.names[0]);

    /* 8. nothing sits behind the bar */
    const clear = await page.evaluate(() => {
      const m = document.querySelector('.main');
      const b = document.getElementById('haf-tabbar');
      const pad = parseFloat(getComputedStyle(m).paddingBottom);
      return { pad, barH: b.getBoundingClientRect().height };
    });
    ok(clear.pad >= clear.barH, C.key + ' screens leave room under the bar', 'padding ' + clear.pad + ' vs bar ' + clear.barH);
  }

  /* 9. a demo / master screen gets no bar and keeps its hamburger */
  const demo = await page.evaluate(() => {
    /* top-level `const` is script-scoped, not a window property — look it up
       by name the way the page itself does */
    window.buildNav(DRIVER_NAV, 'driver', null);
    const b = document.getElementById('haf-tabbar');
    const mb = document.getElementById('menu-btn');
    return { bar: !!b, onClass: document.body.classList.contains('haf-tabbar-on'), menu: mb ? getComputedStyle(mb).display : 'none' };
  });
  ok(demo.bar === false && demo.onClass === false, 'demo/master screen draws no bottom bar');
  ok(demo.menu !== 'none', 'demo/master screen keeps its menu button', 'display=' + demo.menu);

  await ctx.close();
}

/* 10. THE BAR IS PERMANENT — a desktop screen carries the same one */
{
  console.log('\n=== desktop (1280x900) ===');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { fail++; fails.push('desktop page error ' + e.message); });
  await page.goto(FILE);
  await page.waitForTimeout(400);
  await signInAs(page, ACCOUNTS[0].acc);
  await page.waitForTimeout(120);
  const d = await page.evaluate(() => {
    const b = document.getElementById('haf-tabbar');
    const sb = document.querySelector('.sidebar');
    const m = document.querySelector('.main');
    const br = b ? b.getBoundingClientRect() : null;
    const before = sb.getBoundingClientRect().left;
    window.hafTabMore();
    const after = sb.classList.contains('open');
    const rows = document.querySelectorAll('#nav-list .ni, #nav-list .ni-sub').length;
    window.hafSbClose();
    return {
      barH: br ? Math.round(br.height) : 0,
      barW: br ? Math.round(br.width) : 0,
      pinned: b ? getComputedStyle(b).position : 'absent',
      hiddenBefore: before < -50,
      openedAfter: after,
      pad: parseFloat(getComputedStyle(m).paddingBottom),
      rows,
    };
  });
  ok(d.barH > 40, 'desktop carries the same bottom bar', 'height=' + d.barH);
  ok(d.pinned === 'fixed', 'the bar is pinned, not scrolled with the page', 'position=' + d.pinned);
  ok(d.barW > 300 && d.barW <= 600, 'the desktop bar is centred, not stretched across the monitor', 'width=' + d.barW);
  ok(d.hiddenBefore, 'the old side column is away until the menu is opened');
  ok(d.openedAfter, 'MORE drops the menu down on desktop too');
  ok(d.rows > 3, 'the menu still holds every row', d.rows + ' rows');
  ok(d.pad > 60, 'desktop content clears the bar', 'padding ' + d.pad);
  await ctx.close();
}

await browser.close();
console.log('\n──────────────────────────────');
console.log('PASS ' + pass + '   FAIL ' + fail + (vacuous ? '   (' + vacuous + ' vacuous, reported above)' : ''));
if (fail) { console.log('\nFailures:'); fails.forEach(f => console.log(' - ' + f)); process.exit(1); }
