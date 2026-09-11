/* WHAT IS ON EACH ONE, IN THE ORDER A PERSON MEETS IT
   ===================================================
   The audit said the new showroom has 3 clickable things and the old Demo Centre
   has 39 panes. This says what they actually are, so the answer to Brent names
   screens rather than counts.
*/
import { chromium } from 'playwright';
const br = await chromium.launch();

/* ── the new showroom: what it says, in headings ──────────────────────────── */
{
  const pg = await br.newPage({ viewport: { width: 1500, height: 1000 } });
  await pg.goto('https://demo-showroom.knect-demo-site.pages.dev/?code=HAFDEMO', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(3500);
  const heads = await pg.$$eval('h1,h2,h3',
    ns => ns.filter(n => n.offsetParent !== null)
            .map(n => n.tagName + ' ' + (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)));
  console.log('\nNEW SHOWROOM — what is on it');
  heads.forEach(h => console.log('  ' + h));
  const links = await pg.$$eval('a[href^=http]',
    ns => ns.filter(n => n.offsetParent !== null)
            .map(n => (n.textContent || '').trim().slice(0, 30) + '  →  ' + n.href));
  console.log('  links out: ' + (links.length ? '' : 'none'));
  links.forEach(l => console.log('    ' + l));
  await pg.close();
}

/* ── the old Demo Centre: the tiers, and what each menu opens ─────────────── */
{
  const pg = await br.newPage({ viewport: { width: 1500, height: 1000 } });
  await pg.goto('https://demo.usehaf.co.uk/?code=HAFDEMO', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(4500);

  const tiers = await pg.evaluate(() => {
    try { return Object.keys(DC_VIEW || {}) } catch (e) { return [] }
  });
  console.log('\nOLD DEMO CENTRE — accounts you can switch between: ' + (tiers.join(', ') || 'none found'));

  for (const t of tiers) {
    try {
      await pg.evaluate(x => { try { dcOpen(x) } catch (e) {} }, t);
      await pg.waitForSelector('#pane-dc-' + t + ' .pd-mi', { timeout: 8000 });
      const rows = await pg.$$eval('#pane-dc-' + t + ' .pd-mi',
        ns => ns.map(e => ({ label: (e.textContent || '').replace(/[→\s]+/g, ' ').trim(), opens: e.tagName === 'BUTTON' })));
      const open = rows.filter(r => r.opens);
      console.log('  ' + t + ': ' + rows.length + ' rows, ' + open.length + ' open a screen');
      console.log('      opens → ' + open.map(r => r.label).join(' · '));
      const shut = rows.filter(r => !r.opens);
      if (shut.length) console.log('      shut  → ' + shut.map(r => r.label).join(' · '));
    } catch (e) { console.log('  ' + t + ': could not read (' + String(e).slice(0, 60) + ')') }
  }

  /* does clicking one really put a product screen on the screen? */
  try {
    await pg.evaluate(() => { try { dcOpen(Object.keys(DC_VIEW)[0]) } catch (e) {} });
    await pg.waitForTimeout(600);
    const btn = await pg.$('.pd-mi');
    const before = await pg.evaluate(() => document.body.innerText.length);
    if (btn) { await btn.click(); await pg.waitForTimeout(1200); }
    const after = await pg.evaluate(() => document.body.innerText.length);
    console.log('  clicking the first menu row changes the screen: ' + (Math.abs(after - before) > 60)
      + ' (' + before + ' → ' + after + ' characters)');
  } catch (e) { console.log('  click test failed: ' + String(e).slice(0, 80)) }

  await pg.close();
}

await br.close();
