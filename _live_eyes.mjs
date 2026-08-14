import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
const T = 'https://order-flow-v2.knect-demo.pages.dev/';
const b = await chromium.launch();
for (const [tag, vp] of [['desktop', { width: 1280, height: 1150 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  await p.goto(T, { waitUntil: 'load' }); await p.waitForTimeout(900);
  const g = await p.$('#ag-code'); if (g) { await p.fill('#ag-code', 'HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(700); }
  await p.screenshot({ path: `_live_eyes_${tag}.png`, fullPage: tag === 'phone' });
}
await b.close(); console.log('ok');
