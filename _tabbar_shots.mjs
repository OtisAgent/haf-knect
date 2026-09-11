/* Look at it. A passing test says the rules hold; only a picture says it reads
   like something Brent would want on his phone. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const FILE = process.env.NAV_URL || 'file://' + fileURLToPath(new URL('./index.html', import.meta.url));

const CASES = [
  { key: 'driver',   acc: { type:'driver',            drives:true,  released:true,  name:'James Ward' } },
  { key: 'business', acc: { type:'business',          drives:false, released:false, name:'Northern Pack Ltd' } },
  { key: 'freight',  acc: { type:'freight_forwarder', drives:false, released:false, name:'KN Freight' } },
];

const b = await chromium.launch();
for (const dark of [false, true]) {
  for (const C of CASES) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto(FILE);
    await p.waitForTimeout(400);
    if (dark) await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await p.evaluate((acc) => {
      document.getElementById('app').classList.add('open');
      const l = document.getElementById('landing'); if (l) l.style.display = 'none';
      window.ct = 'pane-d-home';
      try { window.switchTab('pane-d-home'); } catch (e) {}
      window.buildNavV1(acc);
    }, C.acc);
    await p.waitForTimeout(300);
    const sfx = (dark ? 'night' : 'day') + '-' + C.key;
    await p.screenshot({ path: `_shot-bar-${sfx}.png` });
    await p.evaluate(() => window.hafTabAction());
    await p.waitForTimeout(320);
    await p.screenshot({ path: `_shot-action-${sfx}.png` });
    await p.evaluate(() => { window.hafTabSheetClose(); });
    await p.waitForTimeout(250);
    await p.evaluate(() => window.hafTabMore());
    await p.waitForTimeout(320);
    await p.screenshot({ path: `_shot-more-${sfx}.png` });
    await ctx.close();
    console.log('shot ' + sfx);
  }
}
await b.close();
