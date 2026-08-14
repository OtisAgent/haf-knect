/* One targeted look at the three booking panels on a phone — the width where
   the columns stack, so "aligned" means equal to each other, not to the tile. */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
const TARGET = process.argv[2] || 'file:///agent/workspace/knect-orderfix/index.html';
const b = await chromium.launch();
for (const [tag, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 1100 }]]) {
  const p = await b.newPage({ viewport: vp });
  await p.goto(TARGET, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  const gate = await p.$('#ag-code');
  if (gate) { await p.fill('#ag-code', 'HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }
  const wrap = await p.$('.wtb');
  if (!wrap) { console.log(tag, 'NO .wtb FOUND'); continue; }
  await wrap.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  await wrap.screenshot({ path: `_eyes_ways_${tag}.png` });
  const geo = await p.$$eval('.wtb .wtb-c', els => els.map(e => {
    const r = e.getBoundingClientRect();
    return { id: e.id, h: Math.round(r.height), w: Math.round(r.width), left: Math.round(r.left) };
  }));
  console.log(tag, JSON.stringify(geo));
}
await b.close();
