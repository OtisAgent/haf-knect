/* Eyes-on the REAL live KNECT dashboard after the run-back push.
   Every role, both widths, through the real access gate. Proves, per role:
     - the run back is there for drivers only (Plus lists loads, Pro offers one)
     - accept / decline actually work, and decline moves to the next best run
     - no full postcodes anywhere on the dashboard
     - maps and network content are still absent for posting accounts
   Nothing is asserted here that the page did not answer. */
import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://knect.usehaf.co.uk/';
const PC = /\b[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/g;
const roles = [['DEMO-DRV', 'driver'], ['DEMO-BIZ', 'business'], ['DEMO-PRO', 'freight']];

const b = await chromium.launch();
for (const [w, h, tag] of [[1440, 1000, 'desktop'], [390, 844, 'phone']]) {
  for (const [acct, label] of roles) {
    const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e)));
    pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await pg.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await pg.waitForSelector('#ag-code', { timeout: 40000 });
    await pg.fill('#ag-code', 'HAFLAUNCH');
    await pg.click('#ag-submit');
    await pg.waitForTimeout(700);
    const gateGone = await pg.evaluate(() => {
      const g = document.getElementById('access-gate');
      return !g || g.style.display === 'none';
    });
    await pg.waitForFunction(() => typeof window.demoLogin === 'function', null, { timeout: 20000 });
    await pg.evaluate(a => window.demoLogin(a), acct);
    await pg.waitForTimeout(1400);

    const base = await pg.evaluate(() => {
      const pane = document.getElementById('pane-d-home');
      const rr = document.getElementById('dash-return');
      const vis = el => !!el && el.offsetParent !== null;
      return {
        role: window.HAF_ROLE,
        runBackVisible: vis(rr),
        runBackText: rr ? rr.innerText : '',
        networkNodesInDoc: document.querySelectorAll('[data-aud="network"]').length,
        mapElsInDoc: document.querySelectorAll('#net-map,#dash-map,.leaflet-container').length,
        paneText: pane ? pane.innerText : '',
        nodes: pane ? pane.querySelectorAll('*').length : -1,
      };
    });

    // driver only: exercise both tiers, then accept and decline for real
    let tiers = null;
    if (label === 'driver') {
      tiers = {};
      for (const t of ['PLUS', 'PRO']) {
        await pg.evaluate(x => rrSetTier(x), t);
        await pg.waitForTimeout(500);
        tiers[t] = await pg.evaluate(() => {
          const rr = document.getElementById('dash-return');
          const btns = [...rr.querySelectorAll('button')].map(b => b.textContent.trim());
          return {
            loadsListed: rr.querySelectorAll('.rr-item').length,
            buttons: btns.filter(t => !/^(Plus|Pro)$/.test(t)),
            text: rr.innerText.slice(0, 400),
          };
        });
      }
      // Pro: decline should offer the NEXT best run, not go looking
      await pg.evaluate(() => rrSetTier('PRO'));
      await pg.waitForTimeout(400);
      const first = await pg.evaluate(() => document.getElementById('dash-return').innerText);
      await pg.evaluate(() => {
        const b = [...document.querySelectorAll('#dash-return button')].find(x => /Not this one/i.test(x.textContent));
        b && b.click();
      });
      await pg.waitForTimeout(600);
      const afterDecline = await pg.evaluate(() => document.getElementById('dash-return').innerText);
      await pg.evaluate(() => {
        const b = [...document.querySelectorAll('#dash-return button')].find(x => /Accept the run back/i.test(x.textContent));
        b && b.click();
      });
      await pg.waitForTimeout(700);
      const afterAccept = await pg.evaluate(() => document.getElementById('dash-return').innerText);
      tiers.declineChanged = first !== afterDecline;
      tiers.acceptConfirmed = /accepted|booked|on your run|confirm/i.test(afterAccept);
      tiers.afterAccept = afterAccept.slice(0, 220);
    }

    // the mode switch must stay subtractive: same node count in both modes
    const counts = {};
    for (const mode of ['basic', 'advanced']) {
      await pg.evaluate(m => { try { setDashMode(m); } catch (e) {} }, mode);
      await pg.waitForTimeout(250);
      counts[mode] = await pg.evaluate(() => {
        const p = document.getElementById('pane-d-home');
        return p ? p.querySelectorAll('*').length : -1;
      });
    }
    const rrInBasic = await pg.evaluate(() => {
      try { setDashMode('basic'); } catch (e) {}
      const rr = document.getElementById('dash-return');
      return !!rr && rr.offsetParent !== null;
    });

    const pcs = [...new Set(((base.paneText + '\n' + base.runBackText).match(PC) || []))];
    console.log(JSON.stringify({
      width: w, acct, role: base.role, gateGone,
      runBackVisible: base.runBackVisible, runBackShowsInBasic: rrInBasic,
      networkNodesInDoc: base.networkNodesInDoc, mapElsInDoc: base.mapElsInDoc,
      fullPostcodes: pcs, modeNodeCounts: counts, subtractiveOK: counts.basic === counts.advanced,
      tiers, errors: errs,
    }));
    if (label === 'driver') {
      const el = await pg.$('#dash-return');
      if (el) {
        await pg.evaluate(() => { try { setDashMode('advanced'); } catch (e) {} rrSetTier('PRO'); });
        await pg.waitForTimeout(400);
        try { await el.screenshot({ path: `_live_rb_pro_${tag}.png`, animations: 'disabled', timeout: 15000 }); }
        catch (e) { console.log(JSON.stringify({ shot: tag, skipped: String(e).slice(0, 80) })); }
      }
    }
    await pg.close();
  }
}
await b.close();
