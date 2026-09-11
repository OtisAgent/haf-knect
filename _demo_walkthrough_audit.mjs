/* CAN BRENT WORK THROUGH THE SYSTEM ON THE NEW VERSION?
   =====================================================
   Brent, 11 Sep: "does the demo still allow me to work through with the new
   version?"

   That is a question about clicking, not about wording, so it cannot be answered
   from the repo. This opens both surfaces with HAFDEMO and counts, on each one:
     - what a person can actually click (buttons, tabs, links that go somewhere)
     - whether any of it opens a KNECT / PLNA / Clever screen
     - how many screens of the product are reachable without leaving the page

   Run: node _demo_walkthrough_audit.mjs
*/
import { chromium } from 'playwright';

const SURFACES = [
  ['new showroom', 'https://demo-showroom.knect-demo-site.pages.dev'],
  ['old Demo Centre', 'https://demo.usehaf.co.uk'],
];
const CODE = 'HAFDEMO';

const br = await chromium.launch();

for (const [label, base] of SURFACES) {
  console.log('\n═══ ' + label + '  [' + base + ']');
  const pg = await br.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await pg.goto(base + '/?code=' + CODE, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout 	(4000);

  const inside = await pg.evaluate(() => {
    const gate = document.querySelector('#door') || document.querySelector('#pd-gate');
    return !gate || getComputedStyle(gate).display === 'none';
  });
  console.log('  inside without typing anything: ' + inside);

  /* everything a person could click that is visible right now */
  const clickable = await pg.$$eval(
    'button:not([disabled]), a[href], [onclick], [role=tab], .tab, .pd-mi',
    ns => ns.filter(n => n.offsetParent !== null).map(n => ({
      tag: n.tagName,
      text: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48),
      href: n.getAttribute('href') || '',
      onclick: (n.getAttribute('onclick') || '').slice(0, 40),
    })).filter(r => r.text));
  console.log('  things a person can click: ' + clickable.length);

  const ext = clickable.filter(c => /^https?:/.test(c.href));
  const toKnect = ext.filter(c => /knect\.usehaf/.test(c.href));
  const toPlna  = ext.filter(c => /plna\.usehaf/.test(c.href));
  const toClev  = ext.filter(c => /clever\.usehaf|cleverpay/.test(c.href));
  console.log('  links that leave for the real sites: ' + ext.length
    + '  (KNECT ' + toKnect.length + ', PLNA ' + toPlna.length + ', Clever ' + toClev.length + ')');

  /* in-page screens: panes that can be switched between without leaving */
  const panes = await pg.$$eval('[id^=pane-], [id^=pd-pane], .pane, section[id]',
    ns => ns.map(n => n.id || n.className).filter(Boolean).length);
  console.log('  in-page panes/sections: ' + panes);

  /* does it have a sidebar / menu of product screens, the thing you walk down? */
  const menu = await pg.$$eval('.pd-mi, .sidebar a, .side a, nav a, .menu a, [class*=nav] a',
    ns => ns.filter(n => n.offsetParent !== null).map(n => (n.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
  console.log('  menu rows you could walk down: ' + menu.length
    + (menu.length ? '  → ' + menu.slice(0, 12).join(' · ') : ''));

  /* try each clickable thing that stays on the page, and see if the view changes */
  let changed = 0, tried = 0;
  const before = await pg.evaluate(() => document.body.innerText.length);
  for (const c of clickable.filter(c => !/^https?:/.test(c.href)).slice(0, 25)) {
    tried++;
    try {
      await pg.click(`text="${c.text.replace(/"/g, '')}"`, { timeout: 1200 });
      await pg.waitForTimeout(320);
      const now = await pg.evaluate(() => document.body.innerText.length);
      if (Math.abs(now - before) > 40) changed++;
    } catch (e) { /* not clickable by text, fine */ }
  }
  console.log('  of ' + tried + ' in-page controls tried, ' + changed + ' changed what is on screen');

  const words = await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().split(' ').length);
  console.log('  words of text on the page: ' + words);
  if (errs.length) console.log('  page errors: ' + errs.slice(0, 3).join(' | '));
  await pg.close();
}

await br.close();
