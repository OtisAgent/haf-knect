/* Price a grid of example jobs through THE LIVE ENGINE and print it as JSON.
 *
 * Brent, 11 Sep: "put the pricing engine behind it the new pricing matrix".
 *
 * The engine is admin/pricing-matrix-v3.js — the same file index.html loads to
 * quote a real customer. This script does not reimplement a single calculation;
 * it calls price() and writes down what came back. So a figure on the Demo
 * Centre is the product's own figure or it is not on the page.
 *
 * Why a grid and not the engine on the page: the engine's config carries HAF's
 * own commercials (what each job type earns, the fee floor, the pool splits).
 * Shipping the file to a public address would publish ALL of it, including the
 * parts nobody has agreed yet. Running it here and shipping a named, chosen set
 * of figures gives the same demo without handing over the config.
 *
 * Brent, 11 Sep, asked for three of those to go on the page: what HAF earns on a
 * job, the fee floor, and the pool splits — "the pooling is TBC". So what leaves
 * here is: the customer's price, the driver's pay, HAF's margin in pounds and as
 * a share of the price, the floor and ceiling band, and the pools BY NAME ONLY.
 * No pool percentage and no figure derived from one leaves this script, because
 * an unsettled split shown as a number is a number that gets quoted back.
 *
 * Every cell is priced three times — free, plus and pro account — because the
 * account level genuinely changes what the customer pays, and that is the bridge
 * from the comparison table into the pricing matrix.
 *
 * Run: node scripts/quote_grid.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PM = require('../admin/pricing-matrix-v3.js');

/* The distances a walkthrough actually uses. Kept short enough to read on a
   dropdown and wide enough to show the minimum charge letting go. */
const MILES = [5, 10, 20, 30, 50, 75, 100, 150, 200];

/* account level -> the accountType the engine resolves it from. null IS the
   free account: the engine treats "no account type" as the free rung. */
const ACCOUNTS = [
  ['FREE', null],
  ['PLUS', 'FREIGHT_PLUS'],
  ['PRO', 'FREIGHT_PRO'],
];

const cfg = PM.config;
const vehicles = cfg.vehicles.map(v => v.code);
const jobTypes = cfg.jobTypes.filter(j => j.active !== false).map(j => j.code);

/* The pools, by name. The destinations are read off the live config so a pool
   added to the matrix appears here, and a name this script has no plain-English
   label for STOPS the build rather than going out as a code word. No share and
   no total leaves here: Brent's word on 11 Sep is that the pooling is still to
   be confirmed. */
const POOL_LABELS = {
  affiliate: 'The affiliate who introduced the work',
  driverPool: "The drivers' pool",
  freightPool: 'The freight pool',
  relayStorage: 'Relay and storage',
};
const poolKeys = [...new Set([
  ...Object.keys(cfg.pools?.trial?.split || {}),
  ...Object.keys(cfg.pools?.production?.split || {}),
])];
if (!poolKeys.length) {
  console.error('the live matrix names no pools at all — the page says there are some');
  process.exit(1);
}
const unlabelled = poolKeys.filter(k => !POOL_LABELS[k]);
if (unlabelled.length) {
  console.error(`the live matrix has a pool this build has no plain words for: ${unlabelled.join(', ')}. `
    + 'Name it here before the page goes out with a code word on it.');
  process.exit(1);
}

const cells = {};
const hafCells = {};
for (const vehicleCode of vehicles) {
  for (const jobTypeCode of jobTypes) {
    for (const miles of MILES) {
      const row = {};
      for (const [level, accountType] of ACCOUNTS) {
        const q = PM.price({
          miles,
          driverMinutes: 0,
          vehicleCode,
          jobTypeCode,
          plnaTier: 'FREE',
          knectTier: 'FREE',
          accountType,
          weight: 'STANDARD',
          handling: 'KERBSIDE',
          extraStops: 0,
          waitingHours: 0,
        });
        const m = q.money;
        /* The customer's price, and — on Brent's word — HAF's own side of the
           same job: the driver's pay, HAF's margin in pounds, and that margin as
           a share of what the customer pays. Nothing pool-derived: hafNetGbp is
           margin after the pools come out of it, and the pools are not settled,
           so that figure would be a guess wearing a decimal point. */
        row[level] = { ex: m.customerExVatGbp, inc: m.customerIncVatGbp,
                       min: !!m.minChargeApplied,
                       pay: m.driverPayGbp,
                       fee: m.networkFeeGbp,
                       haf: m.hafMarginGbp,
                       hafPctOfPrice: m.hafKeepsPctOfCustomer,
                       onFloor: !!m.networkFeeFloorApplied,
                       onCeiling: !!m.networkFeeCeilingApplied };

        /* The page adds VAT itself from one read-live percentage rather than
           carrying a second number per cell. That is only safe if the engine
           agrees to the penny on every cell, so check it here instead of
           assuming it: a rounding rule that differs by 1p on one row would be
           a wrong total quoted on a call. */
        const derived = Math.round(m.customerExVatGbp * (1 + cfg.vatPct / 100) * 100) / 100;
        if (Math.abs(derived - m.customerIncVatGbp) > 0.005) {
          console.error(`VAT does not derive for ${vehicleCode} ${jobTypeCode} ${miles}mi `
            + `${level}: engine says ${m.customerIncVatGbp}, ex-VAT plus `
            + `${cfg.vatPct}% is ${derived}. The page must not do its own arithmetic.`);
          process.exit(1);
        }
      }
      const key = `${vehicleCode}|${jobTypeCode}|${miles}`;

      /* [free, plus, pro, onMinimum] — the three prices are the point, and the
         flag is what lets the page say WHY a short job does not get cheaper. */
      cells[key] = [row.FREE.ex, row.PLUS.ex, row.PRO.ex, row.FREE.min ? 1 : 0];

      /* The page states that a paid account costs the CUSTOMER less without
         costing the DRIVER anything — the discount comes out of HAF's margin.
         That is the whole point of showing this band, so it is proved on every
         cell rather than asserted once: if the engine ever pays a driver
         differently by account level, this build stops and the sentence on the
         page gets rewritten before anyone says it on a call. */
      const pays = [row.FREE.pay, row.PLUS.pay, row.PRO.pay];
      if (Math.max(...pays) - Math.min(...pays) > 0.005) {
        console.error(`the driver's pay moves with the customer's account level on ${key}: `
          + `${pays.join(' / ')}. The page says it does not. Fix the page, not this check.`);
        process.exit(1);
      }

      /* The share of the customer's price is the one figure the page works out
         itself, from two figures it looked up — the same bargain as VAT, and on
         the same terms: it is only allowed because the engine is made to agree
         with it here, on every cell, to a hundredth of a percent. A margin in
         pounds is never derived on the page; it is always looked up. */
      /* The ONE share the page is allowed to work out: what HAF keeps as a
         percentage of what the customer pays. Same bargain as VAT, same terms —
         the engine is made to agree with it here, on every cell.

         The fee's own rate is deliberately NOT derived and NOT shown as a
         percentage. It looks as if it should be the fee over the price, and on
         most jobs it is, but where a vehicle minimum lifts the price after the
         rate is set the two part company (SMALL_VAN / FLEX_SAMEDAY / 50mi: the
         matrix rate is 20%, the fee is 23.8% of the price). A demo that states a
         rate which does not match its own pounds is worse than one that states
         the pounds and the band. So: pounds looked up, band stated, no rate. */
      for (const [level, r] of Object.entries(row)) {
        const derived = Math.round((r.haf / r.ex) * 10000) / 100;
        if (Math.abs(derived - r.hafPctOfPrice) > 0.01) {
          console.error(`what HAF keeps does not derive as a share for ${key} ${level}: `
            + `engine says ${r.hafPctOfPrice}%, £${r.haf} over £${r.ex} is ${derived}%. `
            + 'The page must not do its own arithmetic.');
          process.exit(1);
        }
      }

      /* The network fee and what HAF keeps are the SAME figure in this engine —
         checked on all 288 jobs at all three levels rather than assumed, because
         a demo that shows one number twice under two headings invites the
         question "so which is it". If they ever part company, this stops and the
         page gets a second row instead of quietly showing the wrong one. */
      for (const [level, r] of Object.entries(row)) {
        if (Math.abs(r.fee - r.haf) > 0.005) {
          console.error(`the network fee and HAF's margin have parted company on ${key} `
            + `${level}: fee £${r.fee}, margin £${r.haf}. The page shows them as one `
            + 'figure — give it two rows before it goes out.');
          process.exit(1);
        }
      }

      /* [margins, driverPay, floorFlags] — the pound figures are looked up per
         level, never worked out on the page. The flag says the engine had to lift
         this job to keep the fee up to its floor. */
      hafCells[key] = [
        [row.FREE.haf, row.PLUS.haf, row.PRO.haf],
        row.FREE.pay,
        [row.FREE.onFloor ? 1 : 0, row.PLUS.onFloor ? 1 : 0, row.PRO.onFloor ? 1 : 0],
      ];
    }
  }
}

console.log(JSON.stringify({
  version: PM.version,
  vatPct: cfg.vatPct,
  miles: MILES,
  vehicles: cfg.vehicles.map(v => ({ code: v.code, name: v.name })),
  jobTypes: cfg.jobTypes.filter(j => j.active !== false)
    .map(j => ({ code: j.code, name: j.name })),
  cells,
  /* Plain keys, not the engine's own field names. The build refuses to ship a
     page carrying an engine field name anywhere in it, including in this payload:
     a code word on a page a customer can read is a mistake however it got there,
     and renaming on the way out is cheaper than arguing with the guard. */
  haf: {
    cells: hafCells,
    floor: cfg.networkFeeFloor.pct,
    ceiling: cfg.networkFeeFloor.ceilingPct,
    fixed: cfg.networkFeeFloor.nonNegotiable === true,
    pools: { settled: false, destinations: poolKeys.map(k => POOL_LABELS[k]) },
  },
}));
