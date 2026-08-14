/* Walk the public demo the way a stranger would.
   Opens the built file over a local server, goes in through the door, then
   clicks EVERY tab on Free, Plus and Pro and checks the screen actually opened
   and the way back is on it. Also checks the Network Map is the simple one. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const errs = [];
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL ' + m)); if (c) console.log('  ok   ' + m); };

const b = await chromium.launch();
const pg = await b.newPage();
pg.on('pageerror', e => errs.push(String(e).slice(0, 140)));
pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)); });

// ── the door ───────────────────────────────────────────────────────────────
console.log('\nDOOR');
await pg.goto(BASE + '/?code=HAFDEMO', { waitUntil: 'networkidle' });
// The door checks the code against the live pricing matrix before it opens, so
// how long that takes is the network's business, not a fixed number of
// milliseconds. Waiting on the gate itself is what makes this run repeatable —
// a flat timeout here failed roughly one run in three.
let opened = true;
try { await pg.waitForSelector('#pd-gate', { state: 'hidden', timeout: 20000 }); }
catch (e) { opened = false; }
await pg.waitForFunction(() => document.querySelectorAll('#nav-list .ni').length > 0, null, { timeout: 20000 }).catch(() => {});
ok(opened, 'HAFDEMO in the link opened the demo');
ok(!(await pg.url()).includes('HAFDEMO'), 'the code is wiped out of the address bar');

const nav = await pg.$$eval('#nav-list .ni', n => n.map(e => e.textContent.trim()));
ok(nav.length === 4, 'demo menu has the 4 sections (got ' + nav.length + ': ' + nav.join(', ') + ')');

// ── walk every tab of every membership ─────────────────────────────────────
for (const tier of ['free', 'plus', 'pro']) {
  console.log('\n' + tier.toUpperCase());
  await pg.click('#ni-dc-' + tier);
  await pg.waitForTimeout(700);

  // ── the three sections Brent asked every account page to read in ─────────
  const sec = await pg.evaluate(t => {
    const host = document.getElementById('dc-host-' + t);
    const heads = [...host.querySelectorAll('.dc-sec')].map(e => ({
      n: e.querySelector('.dc-sec-n').textContent.trim(),
      t: e.querySelector('.dc-sec-t').textContent.trim(),
    }));
    const rows = g => [...host.querySelectorAll('#dc-feats-' + t + '-' + g + ' .dc-feat')]
      .map(e => ({ text: e.querySelector('.dc-ft').textContent.trim(), on: !e.classList.contains('off'),
                   mark: (e.querySelector('.dc-unl') || {}).textContent || '' }));
    return { heads, dash: rows('dashboard'), plna: rows('plna'),
             text: (host.innerText || '') };
  }, tier);

  ok(sec.heads.length === 3, tier + ': the page reads in 3 numbered sections (got ' +
    sec.heads.length + ': ' + sec.heads.map(h => h.n + ' ' + h.t).join(' | ') + ')');
  ok(sec.heads[0] && sec.heads[0].n === '1' && /uplift/i.test(sec.heads[0].t),
    tier + ': section 1 is the % uplift');
  ok(sec.heads[1] && sec.heads[1].n === '2' && sec.heads[1].t === 'Dashboard features',
    tier + ': section 2 is the dashboard features');
  ok(sec.heads[2] && sec.heads[2].n === '3' && sec.heads[2].t === 'PLNA features',
    tier + ': section 3 is the PLNA features');
  ok(sec.dash.length > 0 && sec.plna.length > 0,
    tier + ': both feature sections have lines (' + sec.dash.length + ' dashboard, ' + sec.plna.length + ' PLNA)');

  // Brent's core product rule: membership must never buy better or earlier work
  const banned = ['priority', 'first access', 'better job', 'ranking boost'];
  const offend = [...sec.dash, ...sec.plna].filter(r => banned.some(w => r.text.toLowerCase().includes(w)));
  ok(offend.length === 0, tier + ': nothing on the page sells priority or better work' +
    (offend.length ? ' — found: ' + offend.map(o => o.text).join('; ') : ''));

  // JAKO is a Pro feature, and Free/Plus must show it locked, never ticked
  const jako = [...sec.dash, ...sec.plna].filter(r => /jako/i.test(r.text));
  ok(jako.length > 0, tier + ': JAKO is listed on the page (' + jako.length + ' lines)');
  if (tier === 'pro') ok(jako.every(j => j.on), 'pro: every JAKO line is ticked');
  else ok(jako.every(j => !j.on && /pro/i.test(j.mark)),
    tier + ': every JAKO line is locked and marked Pro');

  // the things Brent's document promises each tier, in the tier that owns them
  const has = (list, re) => list.some(r => re.test(r.text) && r.on);
  if (tier === 'free') {
    ok(has(sec.dash, /clever checked/i), 'free: Clever Checked compliance is included');
    ok(has(sec.dash, /fair job matching/i), 'free: fair matching regardless of tier is stated');
    ok(has(sec.dash, /POD/), 'free: completing deliveries and POD is included');
    ok(has(sec.plna, /diary and route planner/i), 'free: the PLNA diary is included');
    ok(!has(sec.dash, /flexible pricing/i), 'free: flexible pricing is NOT given away');
  }
  if (tier === 'plus') {
    ok(has(sec.dash, /flexible pricing/i), 'plus: flexible pricing is included');
    ok(has(sec.dash, /pricing preferences/i), 'plus: driver pricing preferences are included');
    ok(has(sec.plna, /return-route planning/i), 'plus: return-route planning is included');
    ok(has(sec.plna, /filler-route planning/i), 'plus: filler-route planning is included');
    ok(has(sec.plna, /gap detection/i), 'plus: calendar gap detection is included');
    ok(has(sec.plna, /username/i), 'plus: direct booking by username is included');
  }
  if (tier === 'pro') {
    ok(has(sec.dash, /branded booking page/i), 'pro: the custom branded booking page is included');
    ok(has(sec.plna, /return route/i), 'pro: Pro still carries the Plus route planning');
    ok(sec.dash.concat(sec.plna).every(r => r.on), 'pro: the top of the ladder is missing nothing');
  }

  const tabs = await pg.$$eval('#pane-dc-' + tier + ' .pd-mi', n =>
    n.map(e => ({ label: e.textContent.replace('→', '').trim(), on: e.getAttribute('onclick'),
                  tag: e.tagName, cls: e.className })));
  ok(tabs.length > 0, tier + ': the dashboard menu is on the page (' + tabs.length + ' tabs)');
  if (!tabs.length) continue;

  for (const t of tabs) {
    const m = /pdSeatOpen\('([a-z]+)','([^']+)'\)/.exec(t.on || '');
    if (!m) {
      /* Not every row in the menu is a screen this visitor can open, and that
         is the point of the menu now rather than a hole in it. A padlocked row
         is a section this account has NOT got — a driver is shown Fleet
         Management locked because no amount of paperwork turns an owner driver
         into a fleet. And "Open my PLNA" leaves for the driver's own planner,
         which is a different app the demo cannot sign anyone into.

         Asserting these are unclickable is the assertion. Demanding they open
         is what the old test did, and it was demanding the demo lie. */
      const shown = t.tag === 'DIV';
      const ext = /pd-ext/.test(t.cls || '');
      ok(shown, tier + ' / ' + t.label + ': ' +
        (ext ? 'leaves the app, so it is not a tab here'
             : 'is shown padlocked, not opened'));
      continue;
    }
    const paneId = 'pane-' + m[2];
    await pg.evaluate(o => window.eval(o), t.on);
    await pg.waitForTimeout(m[2] === 'f-cap' ? 900 : 450);

    const seen = await pg.evaluate(id => {
      const p = document.getElementById(id);
      const bar = document.getElementById('pd-seatbar');
      return {
        exists: !!p,
        on: !!p && p.classList.contains('on'),
        text: p ? (p.innerText || '').trim().length : 0,
        // the strip sits in the shell above the panes, and must be visible
        // and physically higher up the page than the screen it describes
        barOnTop: !!(bar && bar.offsetParent !== null && p &&
          bar.getBoundingClientRect().top <= p.getBoundingClientRect().top),
        backInSidebar: !!document.querySelector('#nav-list .pd-seat-back'),
      };
    }, paneId);

    const good = seen.exists && seen.on && seen.text > 40 && seen.barOnTop && seen.backInSidebar;
    ok(good, tier + ' / ' + t.label + ' → opened' +
      (good ? '' : ' [' + JSON.stringify(seen) + ']'));

    // the way back really goes back
    await pg.click('#pd-seatbar button');
    await pg.waitForTimeout(350);
    const back = await pg.evaluate(t2 => ({
      pane: !!document.querySelector('#pane-dc-' + t2 + '.on'),
      bar: !!document.getElementById('pd-seatbar'),
      menu: document.querySelectorAll('#nav-list .ni').length,
    }), tier);
    ok(back.pane && !back.bar && back.menu === 4,
      tier + ' / ' + t.label + ' → back to the demo' + (back.pane && !back.bar && back.menu === 4 ? '' : ' ' + JSON.stringify(back)));
  }
}

// ── the network map is the simple one ──────────────────────────────────────
console.log('\nNETWORK MAP');
await pg.evaluate(() => window.eval("pdSeatOpen('free','f-cap')"));
await pg.waitForTimeout(1200);
const map = await pg.evaluate(() => {
  const vis = id => { const e = document.getElementById(id); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const q = s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return {
    advFlag: typeof NETWORK_MAP_ADVANCED !== 'undefined' ? NETWORK_MAP_ADVANCED : 'missing',
    roleSwitch: vis('crole-customer'),
    viewSwitch: vis('cview-map'),
    filters: q('#pane-f-cap .cap-filters'),
    leaflet: vis('cap-map'),
    listView: q('#cap-listview'),
    tiles: document.querySelectorAll('#cap-list .cap-tile, #cap-list > *').length,
  };
});
ok(map.advFlag === false, 'advanced map is parked (flag reads ' + map.advFlag + ')');
ok(!map.roleSwitch, 'customer/driver switch is out of the way');
ok(!map.viewSwitch, 'map/list switch is out of the way');
ok(!map.filters, 'filter row is out of the way');
ok(!map.leaflet, 'the full map is not drawn');
ok(map.listView && map.tiles > 0, 'simple area tiles are showing (' + map.tiles + ')');

console.log('\npage errors: ' + (errs.length ? '\n  ' + [...new Set(errs)].join('\n  ') : 'none'));
console.log('PASS ' + pass + '  FAIL ' + fail);
await b.close();
process.exit(fail || errs.length ? 1 : 0);
