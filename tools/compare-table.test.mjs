/* Guards the public compare table on the storefront pages.
 *
 * The table is generated from admin/account-fees-v1.js and
 * admin/pricing-matrix-v3.js, so the job here is to prove that (a) what is
 * actually sitting in the published files still matches those lists, and
 * (b) nothing we have promised Brent we would never say has crept into it.
 *
 *   node tools/compare-table.test.mjs
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const A = require(path.join(ROOT, 'admin/account-fees-v1.js'));
const M = require(path.join(ROOT, 'admin/pricing-matrix-v3.js'));

const PAGES = ['np-preview/network-pricing.html', 'np-preview/plna.html'];

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '\n      ' + JSON.stringify(detail) : '')); }
};

function block(file) {
  const html = fs.readFileSync(path.join(ROOT, '..', file), 'utf8');
  const i = html.indexOf('<!-- COMPARE:START');
  const j = html.indexOf('<!-- COMPARE:END -->');
  if (i === -1 || j === -1) return null;
  return html.slice(i, j);
}

console.log('\nCOMPARE TABLE\n');

// --- 1. the published pages are not stale --------------------------------
let stale = false;
try {
  execFileSync('node', [path.join(HERE, 'build-compare-table.mjs'), '--check'], { cwd: ROOT, stdio: 'pipe' });
} catch (e) { stale = true; }
ok('every page carries the current generated table (re-run the builder if this fails)', !stale);

// --- 2. the table exists on both pages ------------------------------------
PAGES.forEach((f) => ok('the table is published on ' + path.basename(f), !!block(f)));

const b = block(PAGES[0]) || '';
const text = b.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

// --- 3. the prices on the page are the prices in the list -----------------
ok('Free is free', /Monthly price[\s\S]{0,400}?Free/.test(text));
ok('Plus shows £' + A.config.accountTypes.PLNA_PLUS.monthlyGbp, text.includes('£' + A.config.accountTypes.PLNA_PLUS.monthlyGbp));
ok('Pro shows £' + A.config.accountTypes.PLNA_PRO.monthlyGbp, text.includes('£' + A.config.accountTypes.PLNA_PRO.monthlyGbp));
/* Scoped to the DRIVER panel on purpose: £50 is a real, current price on the
 * fleet ladder (Fleet Plus), so a whole-page search for "£50" would fail for
 * the wrong reason. What was abolished is the £10/£50 DRIVER ladder. */
const driverPanel = b.slice(b.indexOf('data-cmp-panel="driver"'), b.indexOf('data-cmp-panel="fleet"'));
const fleetBlock = b.slice(b.indexOf('data-cmp-panel="fleet"'));
ok('the abolished £10 and £50 driver rungs are gone from the driver table',
  !/>£10</.test(driverPanel) && !/>£50</.test(driverPanel));

// --- 4. the fleet headcount bands match the locked model ------------------
[['FLEET_LITE', 'Up to 5'], ['FLEET_PLUS', 'Up to 25']].forEach(([code, label]) => {
  ok(code + ' shows "' + label + '"', fleetBlock.includes(label));
});
ok('FLEET_PRO shows Unlimited drivers', fleetBlock.includes('Unlimited'));
ok('no fleet band is sold per driver',
  /never charged per driver/i.test(fleetBlock) && !/per driver per month|£5 per driver/i.test(fleetBlock));

// --- 5. the fee points match the pricing framework ------------------------
const lv = M.config.accountLevels;
ok('Plus shows −' + lv.PLUS.feeReductionPts + ' points off the fee', text.includes(lv.PLUS.feeReductionPts + ' points'));
ok('Pro shows −' + lv.PRO.feeReductionPts + ' points off the fee', text.includes(lv.PRO.feeReductionPts + ' points'));
ok('Free is shown at the standard fee, not a discount', /Standard fee/.test(text));

// --- 6. the paused driver reward is not being sold ------------------------
ok('the driver reward is paused in the framework', M.config.driverReward.enabled === false);
ok('...so the table does not sell a reward rate',
  !/reward rate|better driver reward|per mile reward/i.test(text));

// --- 7. nothing we promised never to say ----------------------------------
[
  ['priority', /\bpriorit/i],
  ['first access / first pick', /first (access|pick|refusal)/i],
  ['rebate', /rebate/i],
  ['dedicated account manager', /dedicated account manager/i],
  ['better jobs for paying accounts', /better jobs|best jobs/i]
].forEach(([name, re]) => ok('never says: ' + name, !re.test(text)));

ok('says plainly that matching is not bought', /never decided by what an account pays/i.test(text));

// --- 8. every feature row came from the shared list -----------------------
const listTexts = new Set();
['DRIVER', 'FLEET', 'FREIGHT'].forEach((side) =>
  A.featuresForSideLevel(side, 'PRO').forEach((f) => listTexts.add(f.text)));
const rowLabels = [...b.matchAll(/<th scope="row">([^<]+)/g)].map((m) => m[1].trim());
const invented = rowLabels.filter((t) => !listTexts.has(
  t.replace(/&amp;/g, '&').replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’')
));
const allowedNonFeature = [
  'Monthly price', 'Pay for a year', 'Fee when an invoice is raised',
  'Drivers on the account', 'Posting your own work onto the network',
  'Points off the HAF network fee'
];
const reallyInvented = invented.filter((t) => !allowedNonFeature.includes(t));
ok('no feature row was invented — every one is in the shared list', reallyInvented.length === 0, reallyInvented);

console.log('\n' + '='.repeat(60));
console.log('COMPARE TABLE: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
console.log('The public table and the app read the same list.');
