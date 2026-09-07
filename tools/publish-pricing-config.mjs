/* ============================================================================
 * PUBLISH THE PRICING FRAMEWORK TO THE LIVE STORE
 *
 * Why this exists (2026-09-07). The V8 engine went live in the CODE and the
 * customer quote still came out on the AUGUST numbers, because knect.usehaf.co.uk
 * loads its settings from public.tier_config and pours them over the engine's
 * own defaults, one top-level key at a time. The saved record was last written
 * on 2026-08-02 and carries `driverReward.enabled:false`, the pence-per-mile
 * driver levels and the old rate card — so it switched the new model straight
 * back off. Deploying the code was only half the job.
 *
 * Difference from tools/seed-pricing-config.mjs: the seeder DELETES the whole
 * pricing_matrix scope and rewrites it, which throws away every earlier
 * framework. This retires the current snapshot (is_active=false) and inserts a
 * new one beside it, exactly as the /api/pricing POST path does, so the history
 * of what was live and when survives.
 *
 * Attribution is honest: savedBy is OTIS, on Brent's instruction, quoted. It is
 * NOT filed under his account id — he did not press this.
 *
 *   node tools/publish-pricing-config.mjs --check   read back only, writes nothing
 *   node tools/publish-pricing-config.mjs           publish
 *
 * Needs SUPA_KEY (a service key for the HUB project) in the environment.
 * ========================================================================== */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Matrix = require('../admin/pricing-matrix-v3.js');

const SUPA = process.env.SUPA_URL || 'https://jsdwvogsxlnczzbefwgp.supabase.co';
const KEY = process.env.SUPA_KEY;
const CHECK = process.argv.includes('--check');
if (!KEY) { console.error('No database key. Set SUPA_KEY and re-run.'); process.exit(1); }

const REST = SUPA.replace(/\/$/, '') + '/rest/v1/tier_config';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const c = Matrix.config;

const INSTRUCTION =
  'Brent Ford, 2026-09-07: "collapse everything onto the one engine now and allow it to go live" ' +
  '(model: "Free driver gets base rate, Plus 5% on top, Pro 10% on top" · ' +
  '"the drivers price always stays the same" · "i want HAF to make between 15% and 50%").';

/* --- the same guardrails the save endpoint applies, run BEFORE we write ------
   A rate typo here misprices every job on the network, so it is checked on this
   side too rather than trusted to the far end. */
function validate(cfg) {
  const p = [], n = (v) => typeof v === 'number' && isFinite(v);
  if (!Array.isArray(cfg.vehicles) || cfg.vehicles.length !== 8)
    p.push('There must be exactly eight vehicles.');
  else {
    let pr = 0, pm = 0;
    for (const v of cfg.vehicles) {
      if (!n(v.baseRate) || v.baseRate <= 0) { p.push(v.name + ': bad rate.'); continue; }
      if (!n(v.minTransportValue) || v.minTransportValue <= 0) { p.push(v.name + ': bad minimum.'); continue; }
      if (v.baseRate < pr) p.push(v.name + ': rate lower than the smaller vehicle.');
      if (v.minTransportValue < pm) p.push(v.name + ': minimum lower than the smaller vehicle.');
      pr = v.baseRate; pm = v.minTransportValue;
    }
  }
  const l = cfg.driverLevels || {};
  for (const k of ['FREE', 'MEMBER', 'PRO']) {
    if (!l[k]) { p.push('Driver level ' + k + ' is missing.'); continue; }
    if (!n(l[k].rewardGbpPerMile) || l[k].rewardGbpPerMile < 0) p.push('Driver reward ' + k + ' must be zero or more.');
    if (!n(l[k].rewardPctOfBaseRate) || l[k].rewardPctOfBaseRate < 0) p.push('Driver plan uplift ' + k + ' must be zero or more.');
  }
  if (l.FREE && l.MEMBER && l.PRO &&
      !(l.FREE.rewardPctOfBaseRate <= l.MEMBER.rewardPctOfBaseRate &&
        l.MEMBER.rewardPctOfBaseRate <= l.PRO.rewardPctOfBaseRate))
    p.push('The plan uplifts must rise: free, then Plus, then Pro.');
  const d = cfg.driverReward || {};
  if (d.enabled !== true) p.push('The driver plan uplift must be ON — that is the whole change.');
  if (d.fundedBy !== 'HAF_MARGIN') p.push('The uplift must be funded by HAF, never the customer.');
  if (!['FREE', 'MEMBER', 'PRO'].includes(d.quoteAtLevel)) p.push('quoteAtLevel must name a real rung.');
  const f = cfg.networkFeeFloor || {};
  if (f.pct !== 15 || f.ceilingPct !== 50) p.push('The band must be 15% to 50% — Brent set it non-negotiable.');
  return p;
}

/* --- the flat per-rate rows every other HAF system reads --------------------
   Mirrored out so a system that wants one rate does not have to parse the whole
   framework. driver_reward now carries the PERCENTAGE as well as the old
   pence-per-mile figure, so an older reader does not blank out. */
function flatRows() {
  const rows = [], add = (scope, code, label, value, sort) =>
    rows.push({ scope, code, label, value: { ...value, seed: 'v8' }, is_active: true, sort });
  c.vehicles.forEach((v, i) => add('vehicle_rate', v.code, v.name,
    { baseRateGbpPerMile: v.baseRate, minTransportValueGbp: v.minTransportValue }, i + 1));
  ['FREE', 'MEMBER', 'PRO'].forEach((k, i) => add('driver_reward', k, c.driverLevels[k].name, {
    rewardPctOfBaseRate: c.driverLevels[k].rewardPctOfBaseRate,
    rewardGbpPerMile: c.driverLevels[k].rewardGbpPerMile,
    rank: c.driverLevels[k].rank,
    note: 'A share of the vehicle base rate, added on top. Highest wins, never stacks. HAF funds it; the driver is always paid their own rung.'
  }, i + 1));
  add('driver_reward_funding', 'RULE', 'How the plan uplift is paid for', {
    enabled: c.driverReward.enabled, basis: c.driverReward.basis, fundedBy: c.driverReward.fundedBy,
    quoteAtLevel: c.driverReward.quoteAtLevel,
    note: 'The customer is quoted at the middle rung, so one price covers whoever accepts. The blended price never changes what a driver earns.'
  }, 1);
  add('network_fee_band', 'BAND', 'What HAF keeps on every job', {
    ...c.networkFeeFloor,
    note: 'Applied LAST, after the plan uplift, the account reduction and any override. Below the floor the customer price is lifted — never the driver pay.'
  }, 1);
  ['LITE', 'PLUS', 'PRO'].forEach((k, i) => add('account_fee_reduction', k, c.accountLevels[k].name,
    { feeReductionPts: c.accountLevels[k].feeReductionPts, rank: c.accountLevels[k].rank,
      note: 'Percentage POINTS off the job-type fee. Comes off HAF only, never driver pay, and never below the 15% floor.' }, i + 1));
  c.jobTypes.forEach((j, i) => add('job_type_fee', j.code, j.name,
    { networkFeePct: j.marginPct, floorPct: j.floorPct, active: j.active }, i + 1));
  add('local_handling', 'CURVE', 'Short-run handling taper', { ...c.localHandling }, 1);
  return rows;
}

async function req(method, path, body) {
  const r = await fetch(REST + (path || ''), {
    method, headers: { ...H, ...(method === 'POST' ? { Prefer: 'return=representation' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  if (!r.ok) throw new Error(method + ' ' + (path || '') + ' -> ' + r.status + ' ' + text.slice(0, 300));
  try { return JSON.parse(text || '[]'); } catch (e) { return []; }
}

async function main() {
  const problems = validate(c);
  if (problems.length) { console.error('REFUSING TO PUBLISH:\n  - ' + problems.join('\n  - ')); process.exit(1); }
  console.log('Guardrails: pass — ' + c.version + ', effective ' + c.effectiveFrom);

  const live = await req('GET', '?scope=eq.pricing_matrix&is_active=is.true&select=code,updated_at,value&order=updated_at.desc&limit=1');
  const cur = live[0];
  console.log('Live now  : ' + (cur ? cur.value.version + '  saved ' + cur.updated_at : 'nothing active'));
  if (cur) {
    const k = cur.value.config || {};
    console.log('            plan uplift ' + ((k.driverReward || {}).enabled ? 'ON' : 'OFF') +
      ' · small van £' + ((k.vehicles || [])[0] || {}).baseRate +
      ' · band ' + (k.networkFeeFloor ? k.networkFeeFloor.pct + '-' + k.networkFeeFloor.ceilingPct + '%' : 'not in the record'));
  }
  if (CHECK) { console.log('\n--check: nothing written.'); return; }

  const stamp = new Date().toISOString();
  const code = c.version.replace(/-/g, '_') + '_' + stamp.slice(0, 19).replace(/[-:T]/g, '');

  /* 1. retire the current snapshot — history is kept, never overwritten */
  await req('PATCH', '?scope=eq.pricing_matrix&is_active=is.true', { is_active: false });

  /* 2. the new one */
  await req('POST', '', [{
    scope: 'pricing_matrix', code,
    label: 'HAF KNECT Pricing Framework ' + c.version + ' — published ' + stamp.slice(0, 16).replace('T', ' '),
    is_active: true, sort: 1,
    value: {
      version: c.version, effectiveFrom: c.effectiveFrom,
      lockedBy: INSTRUCTION, savedBy: 'OTIS', savedAt: stamp,
      note: 'Published by Otis on Brent Ford\'s instruction. The code shipped earlier the same day; this is the settings half — without it the live quote kept using the 2026-08-02 record.',
      seed: 'v8', config: c
    }
  }]);

  /* 3. mirror the individual rates out to the flat scopes */
  const rows = flatRows();
  for (const scope of [...new Set(rows.map((r) => r.scope))].concat(['driver_uplift']))
    await req('DELETE', '?scope=eq.' + encodeURIComponent(scope));
  await req('POST', '', rows);

  /* 4. read it all straight back — a write is not done until the database says so */
  const back = await req('GET', '?scope=eq.pricing_matrix&is_active=is.true&select=code,value');
  if (back.length !== 1) throw new Error('expected exactly one active framework, found ' + back.length);
  const saved = back[0].value.config;
  const checks = [
    ['version is V8', saved.version === c.version],
    ['plan uplift is on', saved.driverReward.enabled === true],
    ['quoted at the middle rung', saved.driverReward.quoteAtLevel === 'MEMBER'],
    ['uplifts are 0 / 5 / 10 percent', [0, 5, 10].every((v, i) =>
      [saved.driverLevels.FREE, saved.driverLevels.MEMBER, saved.driverLevels.PRO][i].rewardPctOfBaseRate === v)],
    ['band is 15-50', saved.networkFeeFloor.pct === 15 && saved.networkFeeFloor.ceilingPct === 50],
    ['rate card starts at £1.00 and tops at £1.75',
      saved.vehicles[0].baseRate === 1.0 && saved.vehicles[7].baseRate === 1.75]
  ];
  let bad = 0;
  for (const [n, okc] of checks) { console.log('  ' + (okc ? '✓ ' : '✗ ') + n); if (!okc) bad++; }
  const flat = await req('GET', '?scope=in.(vehicle_rate,driver_reward,driver_reward_funding,network_fee_band,account_fee_reduction,job_type_fee,local_handling)&select=scope');
  console.log('  ' + (flat.length === rows.length ? '✓ ' : '✗ ') + 'flat rate rows: ' + flat.length + ' of ' + rows.length);
  if (flat.length !== rows.length) bad++;
  if (bad) { console.error('\nPUBLISHED BUT NOT CLEAN — ' + bad + ' read-back checks failed.'); process.exit(1); }
  console.log('\nPublished and read back clean: ' + c.version + ' is the active framework.');
}
main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
