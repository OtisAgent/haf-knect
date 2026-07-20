/* Pricing Matrix V3 — regression tests. Run: node pricing-matrix-v3.test.js */
"use strict";
var M = require("./pricing-matrix-v3.js");
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? " — " + JSON.stringify(extra) : "")); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 0.01); }

console.log("Pricing Matrix V3 (" + M.version + ")\n");

// 1. Baseline: Free + Free, no uplift
var r = M.price({ miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE", weight: "STANDARD", handling: "KERBSIDE" });
ok("baseline driver pay = 60 × £0.85 = £51.00", approx(r.money.driverPayGbp, 51.00), r.money);
ok("baseline margin = 20%", r.money.hafMarginPct === 20);
ok("baseline customer ex VAT = 51 ÷ 0.8 = £63.75", approx(r.money.customerExVatGbp, 63.75), r.money);
ok("baseline inc VAT = £76.50", approx(r.money.customerIncVatGbp, 76.50));
ok("no uplift applied", r.rates.upliftApplied === false);

// 2. PLNA Plus = 2.5% uplift to driver
r = M.price({ miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "PLUS", knectTier: "FREE", weight: "STANDARD", handling: "KERBSIDE" });
ok("Plus uplift applied", r.rates.upliftApplied === true && r.rates.upliftPct === 2.5);
ok("Plus driver pay = £52.28", approx(r.money.driverPayGbp, 52.28), r.money);

// 3. KNECT Member (PAID) = 5% uplift; higher side wins, never stacks
r = M.price({ miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "PLUS", knectTier: "PAID", weight: "STANDARD", handling: "KERBSIDE" });
ok("uplift = max(2.5, 5) = 5%, no stacking", r.rates.upliftPct === 5);
ok("driver pay = 51 × 1.05 = £53.55", approx(r.money.driverPayGbp, 53.55), r.money);

// 4. Margin floor holds under override
r = M.price({ miles: 80, vehicleCode: "MWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE",
  override: { marginPct: 5, operator: "test", reason: "too low" } });
ok("override below floor clamped to 15%", r.money.hafMarginPct === 15 && r.override.clamped === true);
ok("override flagged", r.flags.indexOf("MARGIN_OVERRIDE") !== -1);

// 5. Hindrance cap 1.40x -> manual review
r = M.price({ miles: 70, vehicleCode: "LWB_VAN", jobTypeCode: "URGENT",
  plnaTier: "PRO", knectTier: "PAID", weight: "NEAR_LIMIT", handling: "DIFFICULT" });
ok("raw mult 1.12×1.08=1.2096 under cap (no flag)", r.hindrance.appliedMultiplier <= 1.40);

// 6. Supplements: stops + waiting pay the driver
r = M.price({ miles: 45, vehicleCode: "LUTON", jobTypeCode: "TIMED",
  plnaTier: "FREE", knectTier: "FREE", weight: "STANDARD", handling: "KERBSIDE",
  extraStops: 2, waitingHours: 1 });
ok("supplements = 2×£5 + 1×£15 = £25", approx(r.hindrance.supplementsGbp, 25));

// 7. Direct booking: 0% margin, quota gate
r = M.price({ miles: 30, vehicleCode: "SMALL_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE", isDirectBooking: true, directBookingsUsedThisMonth: 1 });
ok("direct margin = 0%", r.money.hafMarginPct === 0);
ok("direct within quota allowed", r.directBooking.allowed === true);
ok("direct: customer pays driver pay exactly", approx(r.money.customerExVatGbp, r.money.driverPayGbp));

r = M.price({ miles: 30, vehicleCode: "SMALL_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE", isDirectBooking: true, directBookingsUsedThisMonth: 3 });
ok("direct over quota gated", r.directBooking.allowed === false && r.manualReviewRequired === true);

r = M.price({ miles: 30, vehicleCode: "SMALL_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "PAID", isDirectBooking: true, directBookingsUsedThisMonth: 99 });
ok("KNECT Member: unlimited direct", r.directBooking.allowed === true);

// 8. Fuel surge protection
var savedFuel = M.config.fuel.currentPencePerLitre;
M.config.fuel.currentPencePerLitre = M.config.fuel.marketAvgPencePerLitre * 1.12;
r = M.price({ miles: 100, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE" });
ok("fuel surge active", r.fuel.active === true && r.fuel.upliftPct === 4);
ok("fuel-adjusted rate = 1.05 × 1.04 = £1.092", approx(r.rates.fuelAdjustedRate, 1.09, 0.01), r.rates);
M.config.fuel.currentPencePerLitre = savedFuel;
r = M.price({ miles: 100, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE" });
ok("fuel normal: no adjustment", r.fuel.active === false);

// 9. £40 minimum network charge
r = M.price({ miles: 5, vehicleCode: "SMALL_VAN", jobTypeCode: "GROUPAGE",
  plnaTier: "FREE", knectTier: "FREE" });
ok("min £40 charge applied on tiny job", r.money.customerExVatGbp === 40 && r.money.minChargeApplied);

// 10. Market band guard
r = M.price({ miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE", localMarketMedianExVat: 45 });
ok("above market band -> manual review", r.flags.indexOf("ABOVE_MARKET_BAND") !== -1 && r.manualReviewRequired);

// 11. Pool split both ways on every job
r = M.price({ miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE" });
var m = r.money.hafMarginGbp;
ok("trial pools = 25% of margin", approx(r.pools.comparison.trial.totalGbp, m * 0.25));
ok("trial split sums to total", approx(
  r.pools.comparison.trial.byPool.affiliate + r.pools.comparison.trial.byPool.driverPool +
  r.pools.comparison.trial.byPool.freightPool + r.pools.comparison.trial.byPool.relayStorage,
  r.pools.comparison.trial.totalGbp, 0.03));
ok("production pools = 5% of margin", approx(r.pools.comparison.production.totalGbp, m * 0.05));
ok("active phase = TRIAL", r.pools.phase === "TRIAL");
ok("HAF net = margin − active pools", approx(r.money.hafNetGbp, m - r.pools.active.totalGbp));

// 12. All demo scenarios run without error
var demoOk = true;
for (var i = 0; i < M.DEMO_SCENARIOS.length; i++) {
  var d = M.runDemo(i);
  if (!d || !d.result || typeof d.result.money.customerIncVatGbp !== "number") demoOk = false;
}
ok("all " + M.DEMO_SCENARIOS.length + " demo scenarios run clean", demoOk);

// 13. Audit record completeness
r = M.price({ miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "PRO", knectTier: "PAID", operator: "test-op" });
ok("audit: version stamped", r.version === "FRAMEWORK-V3");
ok("audit: operator stamped", r.operator === "test-op");
ok("audit: inputs echoed", r.inputs.plnaTier === "PRO" && r.inputs.knectTier === "PAID");
ok("audit: reasons non-empty", r.reasons.length > 0);

// 14. Sandbox rate levers: default off = live pricing unchanged; on = moves; floor-protected
var base = M.price({ miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE" });
r = M.price({ miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE", baseRateMult: 1, marginDeltaPct: 0 });
ok("levers at neutral = identical to baseline", approx(r.money.driverPayGbp, base.money.driverPayGbp) && r.money.hafMarginPct === base.money.hafMarginPct);
r = M.price({ miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE", baseRateMult: 1.2 });
ok("base rate 120% → driver pay = 51 × 1.2 = £61.20", approx(r.money.driverPayGbp, 61.20), r.money);
r = M.price({ miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE", marginDeltaPct: 5 });
ok("margin +5 pts → 25%", r.money.hafMarginPct === 25);
r = M.price({ miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
  plnaTier: "FREE", knectTier: "FREE", marginDeltaPct: -20 });
ok("margin −20 pts clamps to STD floor 15%", r.money.hafMarginPct === 15);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
