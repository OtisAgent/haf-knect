// Live verification for the run back + visibility rule on PRODUCTION.
// Usage: node tools/_live_verify_rb.mjs [url]
import { chromium } from 'playwright';

const URL = process.argv[2] || 'https://knect.usehaf.co.uk/';
const PC = /\b[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/g;

const roles = [['DEMO-DRV', 'driver'], ['DEMO-BIZ', 'business'], ['DEMO-PRO', 'freight']];
const widths = [[1440, 950, 'desktop'], [390, 844, 'phone'], [360, 780, 'small-phone']];

const b = await chromium.launch();
const out = [];

for (const [w, h, tag] of widths) {
  for (const [acct, label] of roles) {
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e)));
    pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

    await pg.goto(URL, { waitUntil: 'load', timeout: 120000 });

    // dismiss the access gate if this build has one
    const gate = await pg.$('#ag-code');
    if (gate) {
      await pg.fill('#ag-code', 'HAFLAUNCH');
      const sub = await pg.$('#ag-submit');
      if (sub) await sub.click();
      await pg.waitForTimeout(600);
    }
    const gateOpen = await pg.evaluate(() => {
      const g = document.getElementById('access-gate');
      return !!(g && g.offsetParent !== null);
    });

    await pg.waitForFunction(() => typeof window.demoLogin === 'function', null, { timeout: 30000 });
    await pg.evaluate(a => window.demoLogin(a), acct);
    await pg.waitForTimeout(1200);

    const base = await pg.evaluate(() => {
      const pane = document.getElementById('pane-d-home');
      const vis = el => !!(el && el.offsetParent !== null);
      const rr = document.getElementById('dash-return');
      return {
        role: window.HAF_ROLE,
        rrInDoc: !!rr,
        rrVisible: vis(rr),
        rrText: rr ? rr.innerText : '',
        networkNodes: document.querySelectorAll('[data-aud="network"]').length,
        mapNodes: document.querySelectorAll('#dash-map, .leaflet-container, [data-aud="map"]').length,
        paneText: pane ? pane.innerText : '',
      };
    });

    // Plus vs Pro on the run back (driver only)
    const tiers = {};
    if (base.rrVisible) {
      for (const t of ['PLUS', 'PRO']) {
        await pg.evaluate(tt => {
          const btns = [...document.querySelectorAll('#dash-return .dmsw-b')];
          const m = btns.find(x => x.textContent.trim().toUpperCase() === tt);
          if (m) m.click();
        }, t);
        await pg.waitForTimeout(500);
        tiers[t] = await pg.evaluate(() => {
          const rr = document.getElementById('dash-return');
          const txt = rr ? rr.innerText : '';
          return {
            loads: rr ? rr.querySelectorAll('.rr-item, .rr-best').length : 0,
            accept: /Accept the run back/i.test(txt),
            decline: /Not this one/i.test(txt),
            chars: txt.length,
          };
        });
      }
    }

    // mode toggle must be subtractive: same node count in both modes
    const counts = {};
    for (const mode of ['basic', 'advanced']) {
      await pg.evaluate(m => { try { setDashMode(m); } catch (e) {} }, mode);
      await pg.waitForTimeout(300);
      counts[mode] = await pg.evaluate(() => {
        const p = document.getElementById('pane-d-home');
        return p ? p.querySelectorAll('*').length : -1;
      });
      if (mode === 'basic' && base.rrVisible) {
        counts.rrInBasic = await pg.evaluate(() => {
          const rr = document.getElementById('dash-return');
          return !!(rr && rr.offsetParent !== null);
        });
      }
    }

    const postcodes = [...new Set(((base.paneText + ' ' + base.rrText).match(PC) || []))];

    out.push({
      width: tag, role: label, actualRole: base.role, gateOpen,
      runBack: { inDoc: base.rrInDoc, visible: base.rrVisible, tiers, inBasicMode: counts.rrInBasic },
      networkNodes: base.networkNodes, mapNodes: base.mapNodes,
      fullPostcodes: postcodes,
      modeNodeCounts: { basic: counts.basic, advanced: counts.advanced, subtractive: counts.basic === counts.advanced },
      errors: errs,
    });
    console.log(JSON.stringify(out[out.length - 1]));
    await pg.close();
  }
}
await b.close();

// ── verdict ────────────────────────────────────────────────
const fail = [];
for (const r of out) {
  if (r.gateOpen) fail.push(`${r.width}/${r.role}: access gate still blocking`);
  if (r.errors.length) fail.push(`${r.width}/${r.role}: JS errors ${JSON.stringify(r.errors)}`);
  if (r.fullPostcodes.length) fail.push(`${r.width}/${r.role}: full postcodes ${r.fullPostcodes}`);
  if (!r.modeNodeCounts.subtractive) fail.push(`${r.width}/${r.role}: mode toggle ADDS nodes (${r.modeNodeCounts.basic} vs ${r.modeNodeCounts.advanced})`);
  if (r.role === 'driver') {
    if (!r.runBack.visible) fail.push(`${r.width}/driver: run back card missing`);
    if (r.runBack.inBasicMode === false) fail.push(`${r.width}/driver: run back hidden in Basic mode`);
    if (!r.runBack.tiers?.PLUS?.loads) fail.push(`${r.width}/driver: Plus lists no loads`);
    if (!r.runBack.tiers?.PRO?.accept || !r.runBack.tiers?.PRO?.decline) fail.push(`${r.width}/driver: Pro missing accept/decline`);
  } else {
    if (r.runBack.visible) fail.push(`${r.width}/${r.role}: run back card shown to a posting account`);
    if (r.networkNodes) fail.push(`${r.width}/${r.role}: ${r.networkNodes} network nodes in the document`);
    if (r.mapNodes) fail.push(`${r.width}/${r.role}: ${r.mapNodes} map nodes in the document`);
  }
}
console.log('\n==== VERDICT ====');
console.log(fail.length ? 'FAIL:\n' + fail.map(f => ' - ' + f).join('\n') : `PASS — ${out.length} checks clean`);
