/* Merged-build check: the run-visibility work (sample vs live, per-run blur,
   view formats) has to still hold after main's founder + top-bar work landed.
   Usage: node tools/_views_merge_verify.mjs [url]   (default: local file) */
import { chromium } from 'playwright';
import { pathToFileURL } from 'url';

const URL = process.argv[2] || pathToFileURL(process.cwd() + '/index.html').href;
const widths = [[1440, 900], [390, 844], [320, 720]];
const accounts = ['DEMO-DRV', 'DEMO-BIZ', 'DEMO-PRO'];

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) pass++;
  else { fail++; failures.push(name + (extra ? ' — ' + JSON.stringify(extra) : '')); }
}

const b = await chromium.launch();

for (const [w, h] of widths) {
  for (const acct of accounts) {
    const tag = `${w}px/${acct}`;
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e)));
    /* running from a plain local server there is no /api Pages function, so a
       404 on those is the harness, not the page */
    pg.on('console', m => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/404 \(File not found\)|file:\/\/\/api|\/api\//.test(t)) return;
      errs.push('console: ' + t);
    });

    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(() => typeof window.demoLogin === 'function', null, { timeout: 20000 });
    await pg.evaluate(a => window.demoLogin(a), acct);
    await pg.waitForTimeout(1200);
    await pg.evaluate(() => window.HAF_VIEW && window.HAF_VIEW.sweep());
    await pg.waitForTimeout(400);

    // 1. the engine is alive and the seeded runs read as samples
    const base = await pg.evaluate(() => {
      const tiles = [...document.querySelectorAll('.hv-tile')];
      return {
        api: !!window.HAF_VIEW,
        tiles: tiles.length,
        sample: tiles.filter(t => t.classList.contains('hv-sample')).length,
        real: tiles.filter(t => t.classList.contains('hv-real')).length,
        both: tiles.filter(t => t.classList.contains('hv-sample') && t.classList.contains('hv-real')).length,
        eyes: tiles.filter(t => t.querySelector(':scope > .hv-eye')).length,
        sampleChips: document.querySelectorAll('.hv-stag').length,
        bars: document.querySelectorAll('.hv-bar').length,
        topBtn: !!document.getElementById('hv-top-blur'),
        founderInTopbar: !!document.querySelector('.topbar #tb-founder'),
      };
    });
    check(`${tag} engine present`, base.api);
    check(`${tag} runs decorated`, base.tiles > 0, base);
    check(`${tag} seeded runs read as sample`, base.sample > 0, base);
    check(`${tag} no tile reads both sample and live`, base.both === 0, base);
    check(`${tag} every run has an eye`, base.eyes === base.tiles, base);
    check(`${tag} sample chips drawn`, base.sampleChips > 0, base);
    check(`${tag} view bars injected`, base.bars > 0, base);
    check(`${tag} top-bar blur switch present`, base.topBtn);

    // 2. a real (non-seeded) job must stand apart automatically
    const live = await pg.evaluate(() => {
      const host = document.querySelector('.xc') && document.querySelector('.xc').parentNode;
      if (!host) return { skipped: true };
      const el = document.createElement('div');
      el.className = 'xc';
      el.innerHTML = '<div class="xb-ref">HAF-9901 · 3.0 mi from you</div><div class="xc-badges"></div>';
      host.appendChild(el);
      window.HAF_VIEW.sweep();
      return { added: true };
    });
    if (!live.skipped) {
      await pg.waitForTimeout(400);
      const verdict = await pg.evaluate(() => {
        const el = [...document.querySelectorAll('.xc')].find(x => (x.textContent || '').includes('HAF-9901'));
        if (!el) return { missing: true };
        return {
          real: el.classList.contains('hv-real'),
          sample: el.classList.contains('hv-sample'),
          chip: (el.querySelector('.hv-live') || {}).textContent || '',
          eye: !!el.querySelector(':scope > .hv-eye'),
        };
      });
      check(`${tag} a real job reads LIVE`, verdict.real && !verdict.sample && verdict.chip === 'Live' && verdict.eye, verdict);
    }

    // 3. per-run eye blurs only that run
    const one = await pg.evaluate(() => {
      const t = document.querySelector('.hv-tile .hv-eye');
      if (!t) return { missing: true };
      const tile = t.closest('.hv-tile');
      t.click();
      const others = [...document.querySelectorAll('.hv-tile')].filter(x => x !== tile);
      return {
        blurred: tile.classList.contains('hv-blur'),
        othersBlurred: others.filter(x => x.classList.contains('hv-blur')).length,
        ref: tile.getAttribute('data-hv-ref') || '',
      };
    });
    check(`${tag} the eye blurs just that run`, one.blurred && one.othersBlurred === 0, one);

    // that choice survives a reload for the same person
    await pg.reload({ waitUntil: 'load' });
    await pg.waitForFunction(() => typeof window.demoLogin === 'function', null, { timeout: 20000 });
    await pg.evaluate(a => window.demoLogin(a), acct);
    await pg.waitForTimeout(1200);
    const stuck = await pg.evaluate(r => {
      const el = document.querySelector('.hv-tile[data-hv-ref="' + r + '"]');
      return el ? el.classList.contains('hv-blur') : null;
    }, one.ref);
    check(`${tag} that choice survives a reload`, stuck === true, { ref: one.ref, stuck });

    // 4. blur all — including the sidebar live-job card, the one always on screen
    const all = await pg.evaluate(() => {
      window.HAF_VIEW.blurAll(true);
      const sb = document.getElementById('sb-livejob');
      const tiles = [...document.querySelectorAll('.hv-tile')];
      const body = document.body.classList.contains('hv-blur-all');
      const blurredCss = el => {
        if (!el) return null;
        const kid = [...el.children].find(c => !c.classList.contains('hv-eye'));
        if (!kid) return null;
        return getComputedStyle(kid).filter || '';
      };
      return {
        body,
        sidebarIsTile: !!(sb && sb.classList.contains('hv-tile')),
        sidebarEye: !!(sb && sb.querySelector(':scope > .hv-eye')),
        sidebarFilter: blurredCss(sb),
        sampleFilter: blurredCss(tiles[0]),
      };
    });
    check(`${tag} blur all switches on`, all.body, all);
    check(`${tag} sidebar live job is covered`, all.sidebarIsTile && all.sidebarEye, all);
    check(`${tag} sidebar live job actually blurs`, !all.sidebarFilter || /blur/.test(all.sidebarFilter), all);
    check(`${tag} run tiles actually blur`, !all.sampleFilter || /blur/.test(all.sampleFilter), all);
    /* 4b. the dashboard's own run panels — the next-up job and the run back.
       They are on screen the whole time, so blur all has to reach them, and
       seeded data in them must not read as a real job. */
    const panels = await pg.evaluate(() => {
      const out = {};
      ['dash-basic-focus', 'dash-return'].forEach(id => {
        const el = document.getElementById(id);
        if (!el || el.offsetParent === null) { out[id] = { absent: true }; return; }
        const kid = [...el.children].find(c => !c.classList.contains('hv-eye') && !c.classList.contains('hv-stag') && !c.classList.contains('hv-live'));
        out[id] = {
          tile: el.classList.contains('hv-tile'),
          sample: el.classList.contains('hv-sample'),
          live: el.classList.contains('hv-real'),
          eye: !!el.querySelector(':scope > .hv-eye'),
          chip: (el.querySelector(':scope > .hv-stag, :scope > .hv-live') || {}).textContent || '',
          filter: kid ? getComputedStyle(kid).filter : null,
        };
      });
      return out;
    });
    for (const [id, p] of Object.entries(panels)) {
      if (p.absent) continue;
      const label = id === 'dash-return' ? 'run-back panel' : 'next-up card';
      check(`${tag} ${label} is covered`, p.tile && p.eye, p);
      check(`${tag} ${label} reads as sample, not live`, p.sample && !p.live && p.chip === 'Sample', p);
      check(`${tag} ${label} blurs with blur all`, /blur/.test(p.filter || ''), p);
    }

    await pg.evaluate(() => window.HAF_VIEW.blurAll(false));

    // 5. view formats switch and are remembered
    const fmt = await pg.evaluate(() => {
      const bar = document.querySelector('.hv-bar');
      if (!bar) return { missing: true };
      const pane = bar.closest('[id^="pane-"]');
      const btn = bar.querySelector('.hv-b[data-fmt="list"]');
      btn.click();
      return { pane: pane.id, applied: pane.classList.contains('hvf-list'), on: btn.classList.contains('on') };
    });
    check(`${tag} view format switches`, fmt.applied && fmt.on, fmt);
    await pg.reload({ waitUntil: 'load' });
    await pg.waitForFunction(() => typeof window.demoLogin === 'function', null, { timeout: 20000 });
    await pg.evaluate(a => window.demoLogin(a), acct);
    await pg.waitForTimeout(1200);
    /* the saved format is re-applied once the app knows who signed in, so give
       it the same few seconds a person would sit through */
    let kept = false, keptMs = null;
    for (let i = 0; i < 20; i++) {
      kept = await pg.evaluate(p => {
        const pane = document.getElementById(p);
        return !!(pane && pane.classList.contains('hvf-list'));
      }, fmt.pane);
      if (kept) { keptMs = i * 250; break; }
      await pg.waitForTimeout(250);
    }
    check(`${tag} view format remembered`, kept === true, { pane: fmt.pane, kept });
    check(`${tag} format restored quickly`, kept && keptMs <= 2000, { keptMs });

    // 6. main's founder work still renders, and nothing runs off the screen
    const layout = await pg.evaluate(() => ({
      founderBadge: !!document.getElementById('tb-founder'),
      founderCard: !!document.getElementById('fnd-card'),
      docWidth: document.documentElement.scrollWidth,
      win: window.innerWidth,
      topbarWidth: (document.querySelector('.topbar') || {}).scrollWidth || 0,
    }));
    check(`${tag} founder mark still in the page`, layout.founderBadge && layout.founderCard, layout);
    check(`${tag} nothing runs off the screen`, layout.docWidth <= layout.win + 1, layout);
    check(`${tag} top bar fits`, layout.topbarWidth <= layout.win + 1, layout);

    check(`${tag} no page errors`, errs.length === 0, errs.slice(0, 3));
    await pg.close();
  }
}

await b.close();
console.log(`\nPASS ${pass}  FAIL ${fail}`);
if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); }
process.exit(fail ? 1 : 0);
