import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://account-visibility.knect-demo.pages.dev/';
const PC = /\b[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/g;

const roles = [
  ['DEMO-BIZ', 'business'],
  ['DEMO-PRO', 'freight'],
  ['DEMO-DRV', 'driver'],
];
const widths = [[1440, 900], [390, 844]];

const b = await chromium.launch();
for (const [w, h] of widths) {
  for (const [acct, label] of roles) {
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e)));
    pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(() => typeof window.demoLogin === 'function', null, { timeout: 20000 });
    await pg.evaluate(a => window.demoLogin(a), acct);
    await pg.waitForTimeout(900);

    const r = await pg.evaluate(() => {
      const pane = document.getElementById('pane-d-home');
      const vis = el => el && el.offsetParent !== null;
      const netInDoc = document.querySelectorAll('[data-aud="network"]').length;
      const nav = [...document.querySelectorAll('.ni')].map(n => n.id.replace('ni-', ''));
      const ownWrap = document.getElementById('dash-own-wrap');
      const ownCards = document.querySelectorAll('#dash-own-feed .xc-own').length;
      const txt = pane ? pane.innerText : '';
      const heroLbl = (document.getElementById('dash-xch-lbl') || {}).textContent || '';
      return {
        role: window.HAF_ROLE, netInDoc, nav,
        ownVisible: vis(ownWrap), ownCards,
        paneText: txt, heroLbl,
        nodeCount: pane ? pane.querySelectorAll('*').length : -1,
      };
    });

    // mode toggle subtractive check: node count identical in both modes
    const counts = {};
    for (const mode of ['basic', 'advanced']) {
      await pg.evaluate(m => { try { setDashMode(m); } catch (e) {} }, mode);
      await pg.waitForTimeout(250);
      counts[mode] = await pg.evaluate(() => document.getElementById('pane-d-home').querySelectorAll('*').length);
    }

    const pcs = [...new Set((r.paneText.match(PC) || []))];
    console.log(JSON.stringify({
      width: w, acct, role: r.role,
      networkNodesInDoc: r.netInDoc,
      navHasNetworkTabs: r.nav.filter(x => ['f-cap', 'f-dir', 'f-cover'].includes(x)),
      ownFeedVisible: r.ownVisible, ownCards: r.ownCards,
      hero: r.heroLbl.slice(0, 40),
      fullPostcodesOnDash: pcs,
      nodeCounts: counts, subtractiveOK: counts.basic === counts.advanced,
      errors: errs,
    }));
    await pg.close();
  }
}
await b.close();
