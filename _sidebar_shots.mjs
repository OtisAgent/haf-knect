/* My own eyes on the corner Brent pointed at: what the top-left looks like with
   no real job in play, and what it looks like when one is. */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';

const TARGET = process.argv[2] || 'file:///agent/workspace/knect-orderfix/index.html';
const TAG = process.argv[3] || 'local';
const b = await chromium.launch();

for (const [tag, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  await p.goto(TARGET, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  const gate = await p.$('#ag-code');
  if (gate) { await p.fill('#ag-code', 'HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }
  await p.evaluate(() => window.demoLogin('DEMO-DRV'));
  await p.waitForTimeout(900);
  await p.screenshot({ path: `_sb_empty_${TAG}_${tag}.png` });

  await p.evaluate(() => {
    HAF_JOBS.unshift({
      id: 'HAF-20260814-REAL01', colour: '#ff7800', status: 'transit', stepIdx: 4, progress: 55,
      from: { name: 'Sheffield S9' }, to: { name: 'Manchester M1' },
      eta: '14:20', driverName: 'A. Driver', vehicle: 'LWB', goods: '3 pallets',
      payout: '£120', price: '£120', distance: '42 mi', deadline: 'Today 16:00',
      client: 'Real Customer', buy: '£90', sell: '£120', margin: '£30', marginPct: '25%',
      vat: '£24', updates: [], messages: [],
    });
    hafRenderLiveWidget();
    if (window.HAF_VIEW) window.HAF_VIEW.sweep();
  });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `_sb_real_${TAG}_${tag}.png` });
  await p.close();
}
await b.close();
console.log('shots written');
