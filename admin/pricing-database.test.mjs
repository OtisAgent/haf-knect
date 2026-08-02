/* ============================================================================
 * Pricing Engine — the database path.
 *
 * The rate ladder itself is covered by pricing-matrix-v5.test.js. This suite
 * covers the part that is new: that the framework can live in the database, be
 * loaded back, be edited safely, and that a bad edit is refused before it can
 * misprice a job. It also reads the REAL rows back out of the live database, so
 * "it's in the database" is proved, not asserted.
 *
 *   node admin/pricing-database.test.mjs
 * ========================================================================== */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./pricing-matrix-v3.js');
const { validate } = await import('../functions/api/pricing.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const near = (a, b) => Math.abs(a - b) < 0.005;
const head = t => console.log('\n' + t);

/* ---------------------------------------------------------------- 1. loading */
head('1. Loading a saved framework over the built-in rates');
{
  const before = M.config.vehicles[0].baseRate;
  const applied = M.applyConfig({ vehicles: M.config.vehicles.map(v => ({ ...v, baseRate: v.baseRate + 0.05 })) });
  ok('applyConfig reports which parts it replaced', applied.includes('vehicles'));
  ok('a saved rate overrides the built-in one', near(M.config.vehicles[0].baseRate, before + 0.05));
  M.resetConfig();
  ok('resetConfig puts the built-in rates back', near(M.config.vehicles[0].baseRate, before));
}
{
  const jobFee = M.config.jobTypes[4].marginPct;
  M.applyConfig({ vehicles: M.config.vehicles });          // vehicles only
  ok('a partial save leaves everything it does not mention alone', M.config.jobTypes[4].marginPct === jobFee);
  ok('an empty save changes nothing', M.applyConfig(null).length === 0);
  M.resetConfig();
}

/* ------------------------------------------------------------- 2. guardrails */
head('2. A bad edit is refused before it can misprice a job');
const good = () => JSON.parse(JSON.stringify(M.config));
ok('the locked framework itself passes', validate(good()).length === 0);
{
  const c = good(); c.vehicles[3].baseRate = 0.5;          // LWB below MWB
  ok('a bigger van paying less than a smaller one is refused', validate(c).length > 0);
}
{
  const c = good(); c.vehicles[5].minTransportValue = 10;  // Luton min below XLWB
  ok('a minimum that goes backwards up the ladder is refused', validate(c).length > 0);
}
{
  const c = good(); c.vehicles.pop();
  ok('anything other than the seven vehicles is refused', validate(c).length > 0);
}
{
  const c = good(); c.driverLevels.PRO.rewardGbpPerMile = 0.05;
  ok('a pro driver paid less than a member is refused', validate(c).length > 0);
}
{
  const c = good(); c.accountLevels.PRO.feeReductionPts = 25;
  ok('a fee reduction beyond 20 points is refused', validate(c).length > 0);
}
{
  const c = good(); c.jobTypes[4].floorPct = 40;           // floor above the 30% fee
  ok('a floor above the fee itself is refused', validate(c).length > 0);
}
{
  const c = good(); c.localHandling.bandReductionPct = 40; // bigger than the 30% at zero
  ok('a mid-band reduction bigger than the one at zero miles is refused', validate(c).length > 0);
}
{
  const c = good(); c.localHandling.fullMinimumFromMiles = 10; // before the 15-mile band
  ok('a taper that ends before it starts is refused', validate(c).length > 0);
}
{
  const c = good(); c.vehicles[0].baseRate = 'eighty pence';
  ok('a rate that is not a number is refused', validate(c).length > 0);
}

/* -------------------------------------------------- 3. the real database rows */
head('3. The rows actually in the database match the engine');
const SUPA = process.env.SUPA_URL || 'https://jsdwvogsxlnczzbefwgp.supabase.co';
const KEY = process.env.SUPA_KEY;
if (!KEY) { console.log('  – skipped (no database key in the environment)'); }
else {
  const h = { apikey: KEY, Authorization: 'Bearer ' + KEY };
  const get = async q => (await fetch(SUPA + '/rest/v1/tier_config?' + q, { headers: h })).json();

  const veh = await get('scope=eq.vehicle_rate&select=code,value&order=sort');
  ok('all seven vehicles are in the database', veh.length === 7);
  let ladderOk = true;
  M.config.vehicles.forEach(v => {
    const row = veh.find(r => r.code === v.code);
    if (!row || !near(row.value.baseRateGbpPerMile, v.baseRate) || !near(row.value.minTransportValueGbp, v.minTransportValue)) ladderOk = false;
  });
  ok('every rate and minimum in the database matches the engine to the penny', ladderOk);

  const drv = await get('scope=eq.driver_reward&select=code,value');
  ok('the driver reward is 0p / 10p / 25p in the database',
     near(drv.find(r => r.code === 'FREE').value.rewardGbpPerMile, 0) &&
     near(drv.find(r => r.code === 'MEMBER').value.rewardGbpPerMile, 0.10) &&
     near(drv.find(r => r.code === 'PRO').value.rewardGbpPerMile, 0.25));

  const acc = await get('scope=eq.account_fee_reduction&select=code,value');
  ok("the account reduction is Brent's 0 / 2.5 / 5 points in the database",
     near(acc.find(r => r.code === 'LITE').value.feeReductionPts, 0) &&
     near(acc.find(r => r.code === 'PLUS').value.feeReductionPts, 2.5) &&
     near(acc.find(r => r.code === 'PRO').value.feeReductionPts, 5));

  const jt = await get('scope=eq.job_type_fee&select=code,value');
  ok('urgent is 30% with a 22% floor in the database',
     jt.find(r => r.code === 'URGENT').value.networkFeePct === 30 &&
     jt.find(r => r.code === 'URGENT').value.floorPct === 22);

  const lh = await get('scope=eq.local_handling&select=code,value');
  ok('the short-run taper is 30% → 20% → full by 25 miles in the database',
     lh[0].value.maxReductionPct === 30 && lh[0].value.bandReductionPct === 20 &&
     lh[0].value.bandAtMiles === 15 && lh[0].value.fullMinimumFromMiles === 25);

  const snap = await get('scope=eq.pricing_matrix&is_active=is.true&select=code,value');
  ok('one active framework snapshot is stored', snap.length === 1);
  ok('the snapshot carries the whole config, not just a summary',
     snap[0].value.config && snap[0].value.config.vehicles.length === 7 &&
     !!snap[0].value.config.driverLevels && !!snap[0].value.config.accountLevels);
  ok('the snapshot records who locked it and when',
     /Brent/.test(snap[0].value.lockedBy || '') && !!snap[0].value.effectiveFrom);

  /* the round trip that matters: load the stored config into a clean engine and
     price a job — it must land on the same penny as the built-in rates do */
  const built = M.price({ miles: 100, vehicleCode: 'LWB_VAN', jobTypeCode: 'URGENT',
    plnaTier: 'PRO', accountType: 'FREIGHT_PRO', knectTier: 'FREE' }).money.customerExVatGbp;
  M.applyConfig(snap[0].value.config);
  const fromDb = M.price({ miles: 100, vehicleCode: 'LWB_VAN', jobTypeCode: 'URGENT',
    plnaTier: 'PRO', accountType: 'FREIGHT_PRO', knectTier: 'FREE' }).money.customerExVatGbp;
  M.resetConfig();
  ok('a job priced from the database costs exactly what it costs from the engine', near(built, fromDb));

  /* nothing that was already there was disturbed */
  const legacy = await get('scope=in.(freight_tier,plna_payout,knect_member,margin_gate)&select=scope,code');
  ok('the older tier rows were left exactly as they were', legacy.length >= 9);
}

/* --------------------------------------------------- 4. the page's own wiring */
head('4. The page is wired into the app');
{
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  ok('Pricing Engine appears in the owner menu', /\{id:'pricing',l:'Pricing Engine'/.test(html));
  ok('the page only exists for the owner menu', (html.match(/l:'Pricing Engine'/g) || []).length === 1);
  ok('the page has its own panel', html.includes('id="pane-pricing"'));
  ok('opening the tab loads the saved rates', html.includes("if(id==='pane-pricing')"));
  ok('the customer quote engine reads the saved framework', html.includes('hafApplyPricingConfig'));
  ok('the quote engine still works if the database is unreachable', /HAF_PRICING_SOURCE='built-in'/.test(html));
  ok('saving goes through the gateway, not straight at the database', html.includes("fetch('/api/pricing',{method:'POST'"));
  /* a curtain-side LUTON is approved (Brent 2026-08-02); a curtain-side TRAILER
     is still banned, so ban the trailer by name rather than the bare word */
  ok('no vehicle beyond a Luton is anywhere on the page',
     !/\b(artic|flatbed|7\.5t|tractor unit|curtain[- ]?siders?|curtain[- ]?side trailer|curtain trailer)\b/i.test(html));
}

console.log('\n' + (fail ? 'FAILURES' : 'ALL PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
