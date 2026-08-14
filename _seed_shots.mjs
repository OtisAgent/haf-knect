import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
const T = process.argv[2] || 'file:///agent/workspace/knect-orderfix/index.html';
const tag = process.argv[3] || 'local';
const b = await chromium.launch();
for (const [n, vp] of [['desktop',{width:1400,height:1000}],['phone',{width:390,height:844}]]) {
  const p = await b.newPage({viewport:vp});
  await p.goto(T,{waitUntil:'load'}); await p.waitForTimeout(800);
  const g = await p.$('#ag-code'); if(g){ await p.fill('#ag-code','HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(700); }
  await p.evaluate(()=>{ enterKnectApp('BF638793'); enterMode('admin'); });
  await p.waitForTimeout(900);
  await p.screenshot({path:`_seed_${tag}_mine_home_${n}.png`});
  await p.evaluate(()=>switchTab('pane-d-invites')); await p.waitForTimeout(600);
  await p.screenshot({path:`_seed_${tag}_mine_exch_${n}.png`});
  await p.evaluate(()=>{ signOut(); }); await p.waitForTimeout(400);
  await p.evaluate(()=>demoLogin('DEMO-DRV')); await p.waitForTimeout(900);
  await p.evaluate(()=>switchTab('pane-d-invites')); await p.waitForTimeout(600);
  await p.screenshot({path:`_seed_${tag}_demo_exch_${n}.png`});
  await p.close();
}
await b.close(); console.log('shots done');
