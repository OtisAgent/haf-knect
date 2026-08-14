/* Eyes-on shots of the two things Brent asked about: the account column
   (login + the three ways to book) and the size ladder once it is priced.
   Run: node _eyes.mjs */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
const URL = process.env.TARGET_URL || 'file:///agent/workspace/knect-orderfix/index.html';
const SHOT = '/agent/workspace/knect-orderfix/_shots';
const b = await chromium.launch();

for (const [tag, vp] of [['desktop', { width: 1280, height: 1100 }], ['phone', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  const gate = await p.$('#ag-code');
  if (gate) { await p.fill('#ag-code', 'HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(500); }

  /* the account column on its own */
  const col = await p.$('#side-ways');
  if (!col) throw new Error('the account column (#side-ways) is not on the page');
  await col.scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  await col.screenshot({ path: `${SHOT}/eyes-${tag}-account.png` });

  /* price it, then frame the ladder */
  await p.click('#wt-pills .lp-tile[data-wt="w250"]');
  await p.click('#sz-pills .lp-tile[data-sz="s3"]');
  await p.fill('#pc-from', 'S35 8RF');
  await p.fill('#pc-to', 'M1 1AE');
  await p.waitForTimeout(3200);
  await p.$eval('#vlad', e => e.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${SHOT}/eyes-${tag}-ladder.png` });

  /* the consignment's own vehicle step */
  await p.click('#cf-go');
  await p.waitForTimeout(900);
  await p.evaluate(() => fqStep(3));
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${SHOT}/eyes-${tag}-step3.png` });
  await p.close();
}
await b.close();
console.log('shots written');
