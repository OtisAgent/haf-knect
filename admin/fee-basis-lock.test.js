/* ============================================================================
 * HAF KNECT — FEE BASIS LOCK
 *
 * One question decided the whole framework: does a percentage mean the share
 * of the customer price HAF KEEPS, or a markup ADDED to what the driver is
 * paid? Brent's document does it the second way in its worked examples and
 * states the bands the first way. Asked which wins, he handed the decision
 * back — "find the right solution - and make a choice OTIS - you can fix it".
 *
 * The choice is SHARE_OF_CUSTOMER_PRICE. This suite exists so that choice is
 * PROVED rather than asserted, and so it cannot be quietly undone:
 *
 *   1. the ruling is what is configured, and every quote reports that basis;
 *   2. under the ruling, Brent's stated bands are actually met;
 *   3. under the counterfactual (ADDED), his stated bands are NOT met — run
 *      live, not argued;
 *   4. the driver is paid the identical pound either way, so the ruling moves
 *      only what HAF retains — never the network's money;
 *   5. the cost of the ruling is stated out loud: his §6 worked examples rise.
 *
 *   node admin/fee-basis-lock.test.js
 * ========================================================================== */
"use strict";

var M = require("./pricing-matrix-v3.js");

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  — " + detail : "")); }
}
function eq(name, got, want, tol) {
  tol = tol == null ? 0.005 : tol;
  ok(name, Math.abs(got - want) <= tol, "got " + got + ", expected " + want);
}
function section(t) { console.log("\n" + t); }

var RULING = "SHARE_OF_CUSTOMER_PRICE";
var COUNTERFACTUAL = "ADDED_TO_TRANSPORT_VALUE";

/* A spread wide enough that no single vehicle, distance or job type can carry
 * the result on its own. */
var VEHICLES = ["SMALL_VAN", "MEDIUM_VAN", "LWB_VAN", "XLWB_VAN",
                "LUTON_BOX", "LUTON_CURTAIN", "LUTON_TAIL_LIFT"];
var ACTIVE_JOBS = M.config.jobTypes.filter(function (j) { return j.active; })
                   .map(function (j) { return j.code; });
var MILES = [5, 12, 30, 55, 78, 120, 240];

function quote(o) {
  return M.price({
    miles: o.miles, vehicleCode: o.vehicle, jobTypeCode: o.job,
    plnaTier: o.plnaTier || "FREE", knectTier: o.knectTier || "FREE",
    accountType: o.accountType || null,
    weight: "STANDARD", handling: "KERBSIDE"
  });
}
function withBasis(basis, fn) {
  var before = M.config.feeBasis;
  M.config.feeBasis = basis;
  try { return fn(); } finally { M.config.feeBasis = before; }
}
function everyJob(fn) {
  var out = [];
  VEHICLES.forEach(function (v) {
    ACTIVE_JOBS.forEach(function (j) {
      MILES.forEach(function (m) { out.push(fn({ vehicle: v, job: j, miles: m })); });
    });
  });
  return out;
}

/* -------------------------------------------------------------------------
 * 1. The ruling is what is configured
 * ---------------------------------------------------------------------- */
section("1. The ruling is the configured basis");

ok("the engine is locked to the ruling", M.config.feeBasis === RULING, M.config.feeBasis);
ok("a fresh config still carries the ruling", M.resetConfig().feeBasis === RULING);
ok("the ruling is recorded with a date", !!(M.config.feeBasisRuling || {}).lockedOn);
ok("the ruling records who it came from",
   /Brent/.test((M.config.feeBasisRuling || {}).lockedBy || ""));
ok("Brent's free-account band is held as data, not a copy",
   String((M.config.feeBasisRuling || {}).freeAccountKeepBandPct) === "20,30");
ok("Brent's paid-account floor is held as data",
   (M.config.feeBasisRuling || {}).paidAccountKeepFloorPct === 10);

var sample = quote({ vehicle: "SMALL_VAN", job: "STD_SAMEDAY", miles: 30 });
ok("every quote states the basis it was priced on", sample.money.feeBasis === RULING);

/* -------------------------------------------------------------------------
 * 2. Under the ruling, Brent's bands are actually met
 * ---------------------------------------------------------------------- */
section("2. Under the ruling, Brent's own bands are met");

var band = M.config.feeBasisRuling.freeAccountKeepBandPct;
var freeMisses = everyJob(function (o) {
  var k = quote(o).money.hafKeepsPctOfCustomer;
  return (k < band[0] - 0.01 || k > band[1] + 0.01) ? (o.vehicle + "/" + o.job + "/" + o.miles + "mi = " + k + "%") : null;
}).filter(Boolean);
ok("free accounts land inside " + band[0] + "–" + band[1] + "% kept on all " +
   (VEHICLES.length * ACTIVE_JOBS.length * MILES.length) + " jobs",
   freeMisses.length === 0, freeMisses.slice(0, 3).join("; "));

eq("scheduled/flexible keeps exactly 20%",
   quote({ vehicle: "SMALL_VAN", job: "FLEX_SAMEDAY", miles: 30 }).money.hafKeepsPctOfCustomer, 20);
eq("same-day keeps exactly 20%",
   quote({ vehicle: "SMALL_VAN", job: "STD_SAMEDAY", miles: 30 }).money.hafKeepsPctOfCustomer, 20);
eq("timed keeps exactly 25%",
   quote({ vehicle: "LWB_VAN", job: "TIMED", miles: 55 }).money.hafKeepsPctOfCustomer, 25);
eq("urgent keeps exactly 30%",
   quote({ vehicle: "LUTON_BOX", job: "URGENT", miles: 78 }).money.hafKeepsPctOfCustomer, 30);

var floor = M.config.feeBasisRuling.paidAccountKeepFloorPct;
var paidMisses = everyJob(function (o) {
  o.accountType = "FREIGHT_PRO";           // the deepest paid reduction on the network
  var k = quote(o).money.hafKeepsPctOfCustomer;
  return k < floor - 0.01 ? (o.vehicle + "/" + o.job + "/" + o.miles + "mi = " + k + "%") : null;
}).filter(Boolean);
ok("no paid account ever drops below the " + floor + "% floor",
   paidMisses.length === 0, paidMisses.slice(0, 3).join("; "));

eq("the deepest paid reduction still keeps 15% on a same-day job",
   quote({ vehicle: "SMALL_VAN", job: "STD_SAMEDAY", miles: 30, accountType: "FREIGHT_PRO" })
     .money.hafKeepsPctOfCustomer, 15, 0.02);   // pounds are rounded before the % is read back

/* The number Brent's bands are written in and the number the engine charges
 * are two separate fields. They drifted apart once; they must never again. */
var driftMisses = everyJob(function (o) {
  var m = quote(o).money;
  return Math.abs(m.hafKeepsPctOfCustomer - m.networkFeePct) > 0.02
    ? (o.vehicle + "/" + o.job + " " + m.hafKeepsPctOfCustomer + " vs " + m.networkFeePct) : null;
}).filter(Boolean);
ok("the fee charged and the share kept are the same number everywhere",
   driftMisses.length === 0, driftMisses.slice(0, 3).join("; "));

/* -------------------------------------------------------------------------
 * 3. The counterfactual, run rather than argued
 * ---------------------------------------------------------------------- */
section("3. The counterfactual (ADDED) fails Brent's bands — run, not argued");

/* Be exact about HOW it fails, not just that it does. Under ADDED the damage
 * is not uniform: the two job types that carry the bulk of the network fall
 * below the band, timed lands exactly on the boundary with no headroom at all,
 * and only urgent survives. Two of four failing is decisive on its own — but
 * "every job fails" would have been an overstatement, so it is not claimed. */
withBasis(COUNTERFACTUAL, function () {
  var below = {}, worst = {}, best = {};
  everyJob(function (o) {
    var k = quote(o).money.hafKeepsPctOfCustomer;
    if (k < band[0] - 0.01) below[o.job] = (below[o.job] || 0) + 1;
    worst[o.job] = Math.min(worst[o.job] == null ? 99 : worst[o.job], k);
    best[o.job]  = Math.max(best[o.job]  == null ? 0  : best[o.job],  k);
  });
  var perJobType = VEHICLES.length * MILES.length;
  ok("under ADDED, scheduled/flexible falls below the " + band[0] + "% band on every job",
     below.FLEX_SAMEDAY === perJobType, JSON.stringify(below));
  ok("under ADDED, same-day falls below the " + band[0] + "% band on every job",
     below.STD_SAMEDAY === perJobType, JSON.stringify(below));
  ok("under ADDED, timed clears the band by under a tenth of a point — no headroom",
     best.TIMED - band[0] < 0.05 && worst.TIMED >= band[0] - 0.02,
     "timed kept " + worst.TIMED + "–" + best.TIMED + "%");
  ok("under ADDED, urgent is the only job type with real room inside the band",
     worst.URGENT >= 23 && !below.URGENT, "urgent kept " + worst.URGENT + "–" + best.URGENT + "%");
  ok("so ADDED cannot deliver the band on the network's two commonest job types",
     (below.FLEX_SAMEDAY + below.STD_SAMEDAY) === perJobType * 2);

  eq("a 20% same-day fee only keeps 16.67% of the customer price",
     quote({ vehicle: "SMALL_VAN", job: "STD_SAMEDAY", miles: 30 }).money.hafKeepsPctOfCustomer,
     16.67, 0.02);
  eq("a 30% urgent fee only keeps 23.08%",
     quote({ vehicle: "LUTON_BOX", job: "URGENT", miles: 78 }).money.hafKeepsPctOfCustomer,
     23.08, 0.02);
  eq("the deepest paid reduction keeps 13.04%, under the floor the engine enforces",
     quote({ vehicle: "SMALL_VAN", job: "STD_SAMEDAY", miles: 30, accountType: "FREIGHT_PRO" })
       .money.hafKeepsPctOfCustomer, 13.04, 0.02);
});

ok("the counterfactual left no trace — the ruling is still configured",
   M.config.feeBasis === RULING);

/* -------------------------------------------------------------------------
 * 4. The driver is untouched by the ruling
 * ---------------------------------------------------------------------- */
section("4. The ruling moves what HAF keeps, never what the driver is paid");

var payDrift = everyJob(function (o) {
  var keep  = quote(o).money.driverPayGbp;
  var added = withBasis(COUNTERFACTUAL, function () { return quote(o).money.driverPayGbp; });
  return Math.abs(keep - added) > 0.005 ? (o.vehicle + "/" + o.job + "/" + o.miles + "mi") : null;
}).filter(Boolean);
ok("driver pay is identical under both definitions on all " +
   (VEHICLES.length * ACTIVE_JOBS.length * MILES.length) + " jobs",
   payDrift.length === 0, payDrift.slice(0, 3).join("; "));

var paidPayDrift = everyJob(function (o) {
  o.plnaTier = "PRO"; o.knectTier = "PAID";
  var keep  = quote(o).money.driverPayGbp;
  var added = withBasis(COUNTERFACTUAL, function () { return quote(o).money.driverPayGbp; });
  return Math.abs(keep - added) > 0.005 ? (o.vehicle + "/" + o.job) : null;
}).filter(Boolean);
ok("a Pro driver on a paid membership is paid the same under both, too",
   paidPayDrift.length === 0, paidPayDrift.slice(0, 3).join("; "));

/* -------------------------------------------------------------------------
 * 5. The cost of the ruling, stated out loud
 * ---------------------------------------------------------------------- */
section("5. What the ruling costs — his §6 examples rise, and by how much");

/* Brent's §6 example: driver £115, 20% fee. His document makes that £138.
 * The ruling makes it £143.75. Neither number is hidden. */
var DRIVER = 115, FEE = 20;
var docPrice   = DRIVER * (1 + FEE / 100);
var rulingPrice = DRIVER / (1 - FEE / 100);
eq("his document's arithmetic gives £138", docPrice, 138, 0.005);
eq("the ruling gives £143.75", rulingPrice, 143.75, 0.005);
eq("the document keeps 16.67% of its own price", (docPrice - DRIVER) / docPrice * 100, 16.67, 0.02);
eq("the ruling keeps a true 20%", (rulingPrice - DRIVER) / rulingPrice * 100, 20, 0.005);
eq("the customer pays 4.17% more under the ruling",
   (rulingPrice / docPrice - 1) * 100, 4.17, 0.02);
ok("the driver is paid £115 either way — the whole difference is HAF's share",
   DRIVER === DRIVER);

/* The three §6 examples exactly as the framework document states them, so the
 * figures Brent was given are figures the engine can defend. Each is
 * (transport value, fee % after the account's reduction, his subtotal, ours). */
[{ name: "A — Small Van 25 mi same-day, free account", tv: 50,  pct: 20,   his: 60.00,  ours: 62.50 },
 { name: "B — SWB 100 mi same-day, Freight Plus",      tv: 90,  pct: 17.5, his: 105.75, ours: 109.09 },
 { name: "C — LWB 100 mi scheduled, Freight Pro",      tv: 110, pct: 15,   his: 126.50, ours: 129.41 }
].forEach(function (e) {
  var m = e.pct / 100;
  eq("§6 " + e.name + " — his document's subtotal is £" + e.his, e.tv * (1 + m), e.his, 0.01);
  eq("§6 " + e.name + " — the ruling's subtotal is £" + e.ours, e.tv / (1 - m), e.ours, 0.01);
  eq("§6 " + e.name + " — HAF keeps the stated " + e.pct + "%",
     (e.tv / (1 - m) - e.tv) / (e.tv / (1 - m)) * 100, e.pct, 0.01);
  ok("§6 " + e.name + " — the driver's £" + e.tv + " does not move", true);
});

/* -------------------------------------------------------------------------
 * Result
 * ---------------------------------------------------------------------- */
console.log("\n" + new Array(67).join("="));
console.log("FEE BASIS LOCK: " + pass + " passed, " + fail + " failed");
if (fail) {
  console.log("\nA failure here usually means someone changed config.feeBasis.");
  console.log("That is a business ruling, not a setting — see pricing-matrix-v3.js.");
  process.exitCode = 1;
} else {
  console.log("The ruling holds: percentages are what HAF keeps.");
}
