/* Eyes-on: the run back as a Plus driver and as a Pro driver, desktop + phone. */
import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://return-route.knect-demo.pages.dev/';
const b = await chromium.launch();
for (const [w, h, tag] of [[1440, 950, 'desktop'], [390, 900, 'phone']]) {
  for (const tier of ['PLUS', 'PRO']) {
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    await pg.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await pg.waitForFunction(() => typeof window.demoLogin === 'function', null, { timeout: 20000 });
    await pg.evaluate(() => window.demoLogin('DEMO-DRV'));
    await pg.waitForTimeout(800);
    await pg.evaluate(t => rrSetTier(t), tier);
    await pg.waitForTimeout(300);
    const el = await pg.$('#dash-return');
    await el.scrollIntoViewIfNeeded();
    await pg.waitForTimeout(200);
    await el.screenshot({ path: `_rr_${tier.toLowerCase()}_${tag}.png` });
    await pg.close();
  }
}
await b.close();
console.log('shots done');
