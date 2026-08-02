/* ============================================================================
 * Push the locked MATRIX-V5 pricing framework into the HAF database.
 *
 * Home: public.tier_config in the shared HUB Supabase — the same table that
 * already holds every other tier/plan/fee record, so pricing does not get its
 * own private island. Rows are written under NEW scopes only:
 *
 *   vehicle_rate           7 rows   the van ladder: rate + minimum
 *   driver_reward          3 rows   pence-per-mile on the driver's base rate
 *   account_fee_reduction  3 rows   percentage POINTS off the network fee
 *   job_type_fee           5 rows   fee % and the floor it may never breach
 *   local_handling         1 row    the short-run taper
 *   zone_factor            1 row    return-load probability by area
 *   pricing_matrix         1 row    the whole config as one versioned snapshot
 *
 * NOTHING EXISTING IS TOUCHED. The legacy rows (freight_tier.feeAdjPts,
 * knect_member.FEE_BENEFIT, plna_payout multipliers) carry older, conflicting
 * models and are read by the OTIS HUB, so they are left exactly as they are and
 * reported to Brent instead. See supersededAccountLevels in the matrix module.
 *
 * Idempotent: the new scopes are cleared and rewritten on every run, so running
 * this twice leaves the same rows. Usage:  node tools/seed-pricing-config.mjs
 * ========================================================================== */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Matrix = require('../admin/pricing-matrix-v3.js');

const SUPA = process.env.SUPA_URL || 'https://jsdwvogsxlnczzbefwgp.supabase.co';
const KEY  = process.env.SUPA_KEY || process.env.HUB_ANON_KEY;
if (!KEY) {
  console.error('No database key. Set SUPA_KEY (server key preferred) and re-run.');
  process.exit(1);
}
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const REST = SUPA.replace(/\/$/, '') + '/rest/v1/tier_config';

const c = Matrix.config;
const SEED = 'v5';                       // stamped on every row we own
const LOCKED = '2026-07-31 — Brent Ford, in chat: "2.5 - 5 is correct" / "add exactly that"';

/* ---- the rows -------------------------------------------------------------- */
const rows = [];
const add = (scope, code, label, value, sort) =>
  rows.push({ scope, code, label, value: { ...value, seed: SEED }, is_active: true, sort });

c.vehicles.forEach((v, i) =>
  add('vehicle_rate', v.code, v.name,
      { baseRateGbpPerMile: v.baseRate, minTransportValueGbp: v.minTransportValue }, i + 1));

['FREE', 'MEMBER', 'PRO'].forEach((k, i) =>
  add('driver_reward', k, c.driverLevels[k].name,
      { rewardGbpPerMile: c.driverLevels[k].rewardGbpPerMile, rank: c.driverLevels[k].rank,
        note: 'Added to the vehicle base rate. Highest wins, never stacks.' }, i + 1));

['LITE', 'PLUS', 'PRO'].forEach((k, i) =>
  add('account_fee_reduction', k, c.accountLevels[k].name,
      { feeReductionPts: c.accountLevels[k].feeReductionPts, rank: c.accountLevels[k].rank,
        note: 'Percentage POINTS off the job-type fee, never a % of it. Comes off HAF only, never driver pay. Fleet excluded (framework §7).' }, i + 1));

c.jobTypes.forEach((j, i) =>
  add('job_type_fee', j.code, j.name,
      { networkFeePct: j.marginPct, floorPct: j.floorPct, active: j.active }, i + 1));

add('local_handling', 'CURVE', 'Short-run handling taper', {
  ...c.localHandling,
  note: 'The vehicle minimum eases to 30% below at 0 miles and 20% below at 15 miles, back to full by 25. Continuous — no mile prices lower than a shorter one.'
}, 1);

add('zone_factor', 'BANDS', 'Return-load zone factor', {
  strong: 1.00, standard: 1.03, limited: 1.07, remote: 1.12, maxCombinedMultiplier: 1.40,
  note: 'Applied to the transport value by destination postcode area — the poorer the chance of a load back, the higher the rate.'
}, 1);

/* the whole framework as one snapshot — this is what the Pricing Engine page loads */
add('pricing_matrix', c.version.replace(/-/g, '_'), 'HAF KNECT Pricing Framework ' + c.version, {
  version: c.version, effectiveFrom: c.effectiveFrom, lockedBy: LOCKED,
  source: 'HAF_KNECT_Pricing_Matrix_OTIS.md (Brent Ford, 31 Jul 2026) + his chat confirmations the same day',
  config: c
}, 1);

const SCOPES = [...new Set(rows.map(r => r.scope))];

/* Scopes this seeder used to write and no longer does. They are cleared on every
   run so a rename never leaves stale rows behind for the API to pick up.
   driver_uplift → driver_reward (Brent 2026-08-02: different wording). */
const RETIRED_SCOPES = ['driver_uplift'];

/* --emit writes the rows to stdout as JSON instead of touching the database, so
   the same rows can be pushed through the credential vault when the raw key is
   not available in this container. Nothing is written in emit mode. */
if (process.argv.includes('--emit')) {
  console.log(JSON.stringify({ scopes: SCOPES, retired: RETIRED_SCOPES, rows }));
  process.exit(0);
}

/* ---- write ----------------------------------------------------------------- */
async function go() {
  console.log('Target : ' + SUPA);
  console.log('Scopes : ' + SCOPES.join(', '));
  console.log('Rows   : ' + rows.length + '\n');

  for (const scope of [...SCOPES, ...RETIRED_SCOPES]) {
    const d = await fetch(REST + '?scope=eq.' + encodeURIComponent(scope), { method: 'DELETE', headers: H });
    if (!d.ok && d.status !== 404) throw new Error('clear ' + scope + ' failed: ' + d.status + ' ' + await d.text());
  }
  const r = await fetch(REST, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(rows)
  });
  if (!r.ok) throw new Error('insert failed: ' + r.status + ' ' + await r.text());
  const written = await r.json();
  console.log('Wrote ' + written.length + ' rows.\n');

  /* read every row straight back — a write is not done until the database says so */
  const q = REST + '?scope=in.(' + SCOPES.join(',') + ')&select=scope,code,label,value,is_active,sort&order=scope,sort';
  const v = await fetch(q, { headers: H });
  const back = await v.json();
  if (back.length !== rows.length) throw new Error('read-back mismatch: wrote ' + rows.length + ', read ' + back.length);

  for (const row of back) {
    const val = row.scope === 'pricing_matrix' ? '(full framework snapshot)' : JSON.stringify(row.value);
    console.log('  ' + row.scope.padEnd(22) + row.code.padEnd(14) + val.slice(0, 88));
  }
  console.log('\nVerified ' + back.length + ' rows live in the database.');
}
go().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
