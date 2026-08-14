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

// --- 5. the fee reduction matches the pricing framework -------------------
// Brent 2026-08-14 asked for "%" in place of the trade word "points". The
// FIGURE still has to be the framework's — only the unit moved — and the old
// word must not survive anywhere a customer reads.
//
// Tested against `visible` (tags stripped) rather than `text`: the tick icon is
// an SVG <polyline points="...">, so a raw search for "points" would fail on
// markup no customer ever sees and hide whether the wording actually changed.
const visible = text.replace(/<[^>]+>/g, ' ');
const lv = M.config.accountLevels;
ok('Plus shows −' + lv.PLUS.feeReductionPts + '% off the fee', visible.includes(lv.PLUS.feeReductionPts + '%'));
ok('Pro shows −' + lv.PRO.feeReductionPts + '% off the fee', visible.includes(lv.PRO.feeReductionPts + '%'));
ok('the trade word "points" is gone from what a customer reads', !/\bpoints?\b/i.test(visible));
ok('Free is shown at the standard fee, not a discount', /Standard fee/.test(text));

// --- 5b. Brent's 14 Aug rulings are on the page, not just in the list -----
ok('the driver PLNA is sold as an add-on to the account',
  /add-on to your HAF account/i.test(visible));
// The gate on the PLNA is COMPLIANCE, never price. If this ever fails the page
// has started implying a bigger plan buys you a PLNA, which is the one thing
// this section must not say.
ok('the PLNA add-on is gated on Clever Checked approval, not on paying',
  /approved by Clever Checked/i.test(visible));
ok('freight posting is shown as open to every account type',
  /freight posting is on every account type/i.test(visible));
ok('freight is bounded by the plan allowance and the rules, not sold as unlimited',
  /within your plan.{0,3}s allowance and the network rules/i.test(visible));
ok('the freight tab does not gate posting behind a freight account',
  /any HAF account can post freight/i.test(visible));
/* A draft of the posting note said third-party client posting "starts on
 * Plus". Nothing in the product does that: there is no business Plus at all,
 * and no feature row anywhere gates whose goods you may move. It read as a
 * paywall on something that is not sold, which is the same class of untruth as
 * the priority-matching claim this suite already bans — so it gets its own
 * guard rather than a comment nobody re-reads. */
ok('whose goods you may move is set by the account type, never by the plan',
  /account type, not your plan/i.test(visible));
ok('no plan is sold as unlocking work for third-party clients',
  !/third-party clients starts on|clients.{0,20}starts on (Plus|Pro)/i.test(text));
ok('there is genuinely no business Plus or Pro to gate it behind',
  !Object.keys(A.config.accountTypes).some((c) => /^BUSINESS_(PLUS|PRO)$/.test(c)));

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
  '% off the HAF network fee'
];
const reallyInvented = invented.filter((t) => !allowedNonFeature.includes(t));
ok('no feature row was invented — every one is in the shared list', reallyInvented.length === 0, reallyInvented);

// --- 9. the rest of the page must not contradict the table ----------------
// The table said freight posting is open to every account; the plan cards
// above it went on selling client loads as a HAF KNECT Plus unlock, and the
// FAQ agreed with the cards. One page, two answers — so these guard the whole
// document, not just the generated block.
PAGES.forEach((file) => {
  const html = fs.readFileSync(path.join(ROOT, '..', file), 'utf8');
  const name = file.split('/').pop();
  ok(`${name}: no plan card sells the right to post client loads`,
    !/>Post third-party client loads</.test(html));
  ok(`${name}: the free plan is not sold as own goods only`,
    !/own goods only/i.test(html));
  ok(`${name}: nothing says client-load posting "comes with" a paid plan`,
    !/posting (third-party )?client loads comes with/i.test(html));
  ok(`${name}: whose goods you move is still tied to the account role`,
    !/freight/i.test(html) || /role/i.test(html));

  // The same fault, one section up: the generated table marked every booking
  // rung "coming soon" while the hand-written plan cards ticked "Custom
  // branded booking page" as something you get today. Nothing resolves behind
  // a booking link on the live app — /book, /b and /booking all return the
  // app shell — so any card line that promises one has to carry the badge.
  // Checked by PROPERTY (a booking claim without a coming-soon marker), not by
  // hunting the exact sentence, or the next rewrite walks straight past it.
  const outsideTable = html.slice(0, html.indexOf('<!-- COMPARE:START')) +
    html.slice(html.indexOf('<!-- COMPARE:END'));
  const unbadged = [...outsideTable.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
    .map((m) => m[1])
    .filter((li) => /branded|booking address|booking link/i.test(li.replace(/<[^>]+>/g, '')))
    .filter((li) => !/cmp-soon/.test(li))
    .map((li) => li.replace(/<[^>]+>/g, '').trim());
  ok(`${name}: no plan card promises a booking link that is not built yet`,
    unbadged.length === 0, unbadged);
  ok(`${name}: the retired "Website Builder" product is gone from the page`,
    !/website builder/i.test(html));
});

console.log('\n' + '='.repeat(60));
console.log('COMPARE TABLE: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
console.log('The public table and the app read the same list.');
