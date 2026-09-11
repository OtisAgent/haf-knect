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
 * Shipping the file to a public address would publish all of it. Running it here
 * and shipping only the customer prices gives the same demo with none of that.
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

const cells = {};
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
        /* ONLY the customer's own price leaves this script. What HAF keeps,
           what the driver is paid and where the fee floor bit are all sitting
           in the same object, and they stay in it. */
        row[level] = { ex: m.customerExVatGbp, inc: m.customerIncVatGbp,
                       min: !!m.minChargeApplied };

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
      /* [free, plus, pro, onMinimum] — the three prices are the point, and the
         flag is what lets the page say WHY a short job does not get cheaper. */
      cells[`${vehicleCode}|${jobTypeCode}|${miles}`] =
        [row.FREE.ex, row.PLUS.ex, row.PRO.ex, row.FREE.min ? 1 : 0];
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
}));
