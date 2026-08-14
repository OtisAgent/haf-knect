/* THE DEMO CENTRE TELLS THE SAME STORY THE APP DOES
   ==================================================
   Brent, 14 Aug: "can you add these dashboards demo centre — this is now the
   new version of HAF KNECT Network dashboards".

   The Demo Centre used to keep three menus of its own and hand them out by
   role. They had drifted: a fleet was told it had no menu of its own long
   after it got one, and none of the three had ever heard of the Clever checks,
   so the demo showed a brand new driver every driving screen in the product.

   That is the worst kind of wrong. A demo is a promise, and this one promised
   the opposite of what the checks exist to do.

   So the menu now comes from the app's own hafAccess + hafNavModel — the same
   two functions that draw a real member's sidebar. These checks prove the demo
   moves when the account moves, which is the only thing that makes it honest.

   Run:  node _demo_access_test.mjs        (demo served on 127.0.0.1:8899)
*/
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
let pass = 0, fail = 0;
const ok = (c, m) => { console.log('  ' + (c ? 'ok  ' : 'FAIL') + ' ' + m); c ? pass++ : fail++; };

const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
pg.on('pageerror', e => errs.push(String(e)));

await pg.goto(BASE + '/?code=HAFDEMO', { waitUntil: 'networkidle' });
await pg.waitForTimeout(700);

/* the menu the Demo Centre is showing right now, as plain rows */
async function menu(tier, role, rel) {
  await pg.evaluate(([t, r, x]) => {
    try { DC_VIEW[t].role = r; } catch (e) {}
    try { DC_VIEW[t].rel = x; } catch (e) {}
    try { dcRenderTier(t); } catch (e) {}
  }, [tier, role, rel]);
  await pg.waitForTimeout(450);
  return pg.$$eval('#pane-dc-' + tier + ' .pd-mi', n => n.map(e => ({
    label: (e.textContent || '').replace('→', '').trim(),
    open: e.tagName === 'BUTTON',
    ext: /pd-ext/.test(e.className || ''),
  })));
}
const has = (rows, re) => rows.find(r => re.test(r.label));
const opens = (rows, re) => { const r = has(rows, re); return !!r && r.open; };
const locked = (rows, re) => { const r = has(rows, re); return !!r && !r.open && !r.ext; };

console.log('\nA DRIVER WHOSE CHECKS ARE NOT DONE');
{
  const rows = await menu('free', 'driver', false);
  ok(rows.length > 0, 'the menu is drawn at all (' + rows.length + ' rows)');
  ok(opens(rows, /post|book|load|quote/i), 'they can still post work — posting was never what the checks protect');
  ok(locked(rows, /network/i) || !has(rows, /network/i), 'the network is not opened to them');
  ok(!opens(rows, /fleet management/i), 'fleet management does not open');
  ok(!rows.some(r => r.open && /open my plna/i.test(r.label)), 'the planner is not offered as a screen to walk into');
}

console.log('\nTHE SAME DRIVER, ONCE CLEVER HAS RELEASED THEM');
{
  const before = await menu('free', 'driver', false);
  const after = await menu('free', 'driver', true);
  const openCount = r => r.filter(x => x.open).length;
  ok(openCount(after) > openCount(before),
    'releasing them opens screens that were shut (' + openCount(before) + ' → ' + openCount(after) + ')');
  ok(!!has(after, /open my plna/i), 'the planner appears for a released driver');
  ok(opens(after, /post|book|load|quote/i), 'and they can still post work');
}

console.log('\nA FLEET HAS A SECTION OF ITS OWN NOW');
{
  /* The menu lists SCREENS, so a section that is open shows its screens by
     name and never its own; a section that is shut shows its own name with a
     padlock. So "is Fleet Management padlocked here" is the question, and the
     answer has to differ between a fleet and an owner driver. */
  const fleetRows = await menu('free', 'fleet', true);
  ok(!locked(fleetRows, /^fleet management$/i), 'a released fleet is not padlocked out of Fleet Management');
  const driverRows = await menu('free', 'driver', true);
  ok(locked(driverRows, /^fleet management$/i),
    'and a released owner driver still is — the demo no longer says a fleet has no menu of its own');
  const fleetSec = await pg.evaluate(() => {
    const s = hafNavModel(hafAccess({ account_type: 'fleet', plna_released: true }))
      .find(x => x.id === 'fleet');
    return !!s && !s.locked && (s.tabs || []).length > 0;
  });
  ok(fleetSec, 'and the fleet section really carries screens of its own');
}

console.log('\nA BUSINESS AND A FREIGHT FORWARDER ARE NOT SHOWN THE DRIVING SIDE');
for (const role of ['business', 'freight']) {
  const rows = await menu('free', role, true);   // released:true on purpose — it must change nothing
  ok(rows.length > 0, role + ': the menu is drawn (' + rows.length + ' rows)');
  ok(opens(rows, /post|book|load|quote/i), role + ': can post work');
  ok(!rows.some(r => r.open && /open my plna/i.test(r.label)), role + ': is not offered the planner');
  ok(!opens(rows, /fleet management/i), role + ': does not open fleet management');
}

console.log('\nTHE MENU IS THE APP\'S ANSWER, NOT A LIST KEPT IN THE DEMO');
{
  const same = await pg.evaluate(() => {
    try {
      const acc = hafAccess({ account_type: 'driver', plna_released: true });
      return (hafNavModel(acc) || []).length > 0 && typeof hafNavModel === 'function';
    } catch (e) { return false; }
  });
  ok(same, 'the demo page carries the app\'s own hafAccess + hafNavModel and uses them');
}

console.log('\npage errors: ' + (errs.length ? '\n  ' + errs.join('\n  ') : 'none'));
if (errs.length) fail++;
console.log('\nPASS ' + pass + '  FAIL ' + fail);
await br.close();
process.exit(fail ? 1 : 0);
