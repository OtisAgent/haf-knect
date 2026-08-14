/* Seeded test work belongs to the demo, not to Brent's own account.

   Brent, 14 Aug: "clear the whole account on the main one i actually use -->
   only have test runs on the demo centre".

   A pass here is worth nothing unless BOTH halves hold: the account he signs
   into shows none of the made-up work, AND the demo still shows all of it. So
   each screen is checked twice — once signed in as him, once as the demo — and
   the demo count is asserted above zero before the real-account count is
   allowed to mean anything. */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
const TARGET = process.argv[2] || 'file:///agent/workspace/knect-orderfix/index.html';
const b = await chromium.launch();
const fails = [], passes = [];
const ok = (c, m) => { (c ? passes : fails).push((c ? 'PASS ' : 'FAIL ') + m); };

const SCREENS = ['pane-d-home','pane-d-invites','pane-d-jobs','pane-d-earn','pane-d-dir',
  'pane-b-del','pane-b-drivers','pane-f-loads','pane-f-cover','pane-f-dir','pane-f-cap'];

async function look(p, setup){
  await p.evaluate(()=>{ try{ signOut(); }catch(e){} });
  await p.waitForTimeout(250);
  await p.evaluate(setup);
  await p.waitForTimeout(700);
  const out = {};
  for (const id of SCREENS){
    await p.evaluate(id=>{ try{ switchTab(id); }catch(e){} }, id);
    await p.waitForTimeout(280);
    out[id] = await p.evaluate(id=>{
      const pane = document.getElementById(id);
      if (!pane) return {seen:0, none:false, missing:true};
      const vis = el => el.offsetParent !== null || getComputedStyle(el).display !== 'none';
      /* what a person would actually read off this screen */
      const txt = pane.innerText || '';
      const refs = [...new Set((txt.match(/\b(?:[A-Z]{2,3}-\d{4,6}|[A-Z]{2}\d{6})\b/g)||[]))]
        .filter(r => (window.HAF_VIEW && window.HAF_VIEW.isSample(r)) || /^FF-\d{4}$/.test(r));
      const names = ['James Worthington','James Wilson','Karen Price','David Hughes',
        'Acme Ltd','Northern Pack','City Supplies'].filter(n => txt.indexOf(n) >= 0);
      const marked = [...pane.querySelectorAll('[data-seed]')].filter(vis).length;
      return {seen: refs.length + names.length, marked,
              none: !!pane.querySelector('[data-seed-none]'), refs, names, missing:false};
    }, id);
  }
  return out;
}

for (const [tag, vp] of [['desktop',{width:1400,height:1000}], ['phone',{width:390,height:844}]]) {
  const p = await b.newPage({ viewport: vp });
  await p.goto(TARGET, { waitUntil:'load' });
  await p.waitForTimeout(700);
  const gate = await p.$('#ag-code');
  if (gate) { await p.fill('#ag-code','HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }

  /* the demo FIRST — it establishes that there is something to hide */
  const demo = await look(p, ()=>{ demoLogin('DEMO-DRV'); });
  /* then Brent's own account, driving through every screen he can reach */
  const mine = await look(p, ()=>{ enterKnectApp('BF638793'); enterMode('admin'); });
  /* and a preview of a member's screen, which is still his account */
  const prev = await look(p, ()=>{ enterKnectApp('BF638793'); viewAsMember('driver', true); });

  let hadSeed = 0, cleared = 0;
  for (const id of SCREENS) {
    const d = demo[id], m = mine[id], v = prev[id];
    if (d.missing) continue;
    if (d.seen > 0 || d.marked > 0) {
      hadSeed++;
      ok(m.seen === 0, `${tag} ${id}: his account shows no made-up work (found ${m.seen}: ${[...m.refs,...m.names].join(', ')||'none'})`);
      ok(v.seen === 0, `${tag} ${id}: previewing a member shows no made-up work (found ${v.seen})`);
      if (m.seen === 0) cleared++;
    }
  }
  ok(hadSeed >= 8, `${tag}: the demo genuinely carries seeded work on ${hadSeed} screens — so a clear account means something`);
  ok(cleared === hadSeed, `${tag}: every one of those ${hadSeed} screens is clear on his account (${cleared})`);

  /* the demo must NOT have been emptied by this change */
  const demoStill = SCREENS.filter(id => (demo[id].seen||0) > 0).length;
  ok(demoStill >= 6, `${tag}: the demo still shows its walkthrough work on ${demoStill} screens`);

  /* an empty screen has to say so rather than look broken */
  const spoke = SCREENS.filter(id => mine[id] && mine[id].none).length;
  ok(spoke >= 6, `${tag}: cleared screens carry an honest line instead of a blank (${spoke})`);

  /* the sidebar card and the two summary panels stay empty, not seeded */
  await p.evaluate(()=>{ enterKnectApp('BF638793'); enterMode('admin'); });
  await p.waitForTimeout(600);
  const corner = await p.evaluate(()=>{
    const sb = document.getElementById('sb-livejob');
    const f  = document.getElementById('dash-basic-focus');
    const r  = document.getElementById('dash-return');
    return {sb: sb ? getComputedStyle(sb).display : 'none',
            focus: f ? (f.innerText||'') : '', run: r ? (r.innerText||'') : ''};
  });
  ok(corner.sb === 'none', `${tag}: the top-left card stays empty on his account`);
  ok(!/HAF-\d{4}/.test(corner.focus), `${tag}: "next up" names no seeded run`);
  ok(!/HAF-3\d{3}/.test(corner.run), `${tag}: the run-back panel offers no seeded load`);

  await p.close();
}
await b.close();
passes.forEach(l=>console.log(l)); fails.forEach(l=>console.log(l));
console.log(`\n${passes.length}/${passes.length+fails.length} checks passed`);
process.exit(fails.length ? 1 : 0);
