/* ============================================================================
 * HAF KNECT — FRAMEWORK V6: margin bands + lane adjustment test suite
 *
 * Proves the two things Brent asked for on 2026-08-02:
 *
 *   1. "build the system to allow for the figures above"
 *      — free accounts keep 20-30% of the customer price, paid accounts never
 *        fall below his 10-15% minimum, on every job type and every vehicle.
 *
 *   2. "use the PLNA and the customer feedback of the network to add
 *       alterations in the zones of the areas ... sheffield to manchester is
 *       different then sheffield to birmingham"
 *      — lanes price on their own road, return-load, demand and feedback
 *        evidence, and fall back to today's behaviour until that evidence
 *        exists.
 *
 *   node admin/lane-and-margin-v6.test.js
 * ========================================================================== */
"use strict";

var fs = require("fs");
var path = require("path");
var M = require("./pricing-matrix-v3.js");
var L = require("./lane-factors-v1.js");

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

/* Lift the live customer engine out of index.html, with the REAL lane module
 * plugged into its window — so the customer quote and the back office are
 * tested with the same lane rules, not with one side switched off. */
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
function slice(from, to) {
  var i = html.indexOf(from), j = html.indexOf(to, i);
  if (i < 0 || j < 0) throw new Error("could not find customer engine block: " + from);
  return html.slice(i, j);
}
var engineSrc =
  "var window = { HAFLaneFactors: LANE };\n" +
  slice("const REF_MPH", "const PC={") +
  "\nreturn { VAN: VAN, URG: URG, v3Price: v3Price, laneAdjust: laneAdjust," +
  "\n         minTransportValue: minTransportValue, zoneFactorFor: zoneFactorFor };";
var CUST = new Function("LANE", engineSrc)(L);

function bo(extra) {
  var input = { miles: 100, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY",
                plnaTier: "FREE", knectTier: "FREE",
                weight: "STANDARD", handling: "KERBSIDE" };
  for (var k in (extra || {})) input[k] = extra[k];
  return M.price(input);
}

var VEHICLES = ["SMALL_VAN","SWB_VAN","MWB_VAN","LWB_VAN","XLWB_VAN","LUTON","LUTON_CURTAIN","LUTON_TAIL"];
var ACTIVE_JOBS = ["FLEX_SAMEDAY","STD_SAMEDAY","TIMED","URGENT"];

/* ==========================================================================
 * 1. WHAT A PERCENTAGE MEANS
 * ======================================================================== */
section("1. A percentage is the share of the customer price HAF keeps");

eq("the engine is on the KEEP basis", M.config.feeBasis === "SHARE_OF_CUSTOMER_PRICE" ? 1 : 0, 1);

var base = bo({});
eq("the driver is paid the whole transport value", base.money.driverPayGbp, base.money.carrierTransportValueGbp);
eq("transport value plus fee is the customer price",
   base.money.carrierTransportValueGbp + base.money.networkFeeGbp, base.money.customerExVatGbp);
eq("what HAF keeps equals the quoted percentage",
   base.money.hafKeepsPctOfCustomer, base.money.networkFeePct);

/* The old V5 model is still reachable in one word, and it demonstrably fails
   his band — which is the whole reason for the change. */
M.config.feeBasis = "ADDED_TO_TRANSPORT_VALUE";
var v5 = bo({});
ok("the old add-on model keeps less than the quoted 20% (16.7%) — Henry's finding",
   Math.abs(v5.money.hafKeepsPctOfCustomer - 16.67) < 0.05,
   "kept " + v5.money.hafKeepsPctOfCustomer + "%");
ok("the driver is paid the same under either model — this never touched driver pay",
   v5.money.driverPayGbp === base.money.driverPayGbp);
M.config.feeBasis = "SHARE_OF_CUSTOMER_PRICE";

/* ==========================================================================
 * 2. BRENT'S BANDS, ON EVERY JOB TYPE AND EVERY VEHICLE
 * ======================================================================== */
section("2. Brent's bands hold everywhere (2026-08-02)");

var freeOutOfBand = [], paidBelowMin = [], driverLost = [];
var v, j, mi, free, plus, pro;
for (v = 0; v < VEHICLES.length; v++) {
  for (j = 0; j < ACTIVE_JOBS.length; j++) {
    for (mi = 5; mi <= 300; mi += 5) {
      free = bo({ miles: mi, vehicleCode: VEHICLES[v], jobTypeCode: ACTIVE_JOBS[j] });
      plus = bo({ miles: mi, vehicleCode: VEHICLES[v], jobTypeCode: ACTIVE_JOBS[j], accountType: "FREIGHT_PLUS" });
      pro  = bo({ miles: mi, vehicleCode: VEHICLES[v], jobTypeCode: ACTIVE_JOBS[j], accountType: "FREIGHT_PRO" });
      var k = free.money.hafKeepsPctOfCustomer;
      if (k < 19.99 || k > 30.01) freeOutOfBand.push(VEHICLES[v] + " " + ACTIVE_JOBS[j] + " " + mi + "mi = " + k + "%");
      if (plus.money.hafKeepsPctOfCustomer < 9.99) paidBelowMin.push("plus " + VEHICLES[v] + " " + mi);
      if (pro.money.hafKeepsPctOfCustomer < 9.99) paidBelowMin.push("pro " + VEHICLES[v] + " " + mi);
      if (pro.money.driverPayGbp !== free.money.driverPayGbp) driverLost.push(VEHICLES[v] + " " + mi);
    }
  }
}
ok("free accounts keep 20-30% on all 8 vehicles x 4 job types x 60 distances",
   freeOutOfBand.length === 0, freeOutOfBand.slice(0, 3).join("; "));
ok("no paid account ever keeps less than his 10% minimum",
   paidBelowMin.length === 0, paidBelowMin.slice(0, 3).join("; "));
ok("an account discount never comes off the driver — driver pay is identical",
   driverLost.length === 0, driverLost.slice(0, 3).join("; "));

eq("free same-day keeps exactly 20%", bo({ jobTypeCode: "STD_SAMEDAY" }).money.hafKeepsPctOfCustomer, 20);
eq("free timed keeps exactly 25%", bo({ jobTypeCode: "TIMED" }).money.hafKeepsPctOfCustomer, 25);
eq("free urgent keeps exactly 30% — the top of his band",
   bo({ jobTypeCode: "URGENT" }).money.hafKeepsPctOfCustomer, 30);
eq("Pro account same-day keeps 15% — the bottom of his paid band",
   bo({ jobTypeCode: "STD_SAMEDAY", accountType: "FREIGHT_PRO" }).money.hafKeepsPctOfCustomer, 15, 0.02);

/* The trial pools take a quarter of the margin — Brent's own 20 Jul setting.
   Nell flagged this as the rest of the gap; it is reported, not hidden. */
var netCheck = bo({ jobTypeCode: "STD_SAMEDAY" });
ok("what HAF keeps AFTER the trial pools is reported on every job, never buried",
   netCheck.money.hafNetPctOfCustomer > 0 &&
   netCheck.money.hafNetPctOfCustomer < netCheck.money.hafKeepsPctOfCustomer,
   "keeps " + netCheck.money.hafKeepsPctOfCustomer + "%, net " + netCheck.money.hafNetPctOfCustomer + "%");

/* ==========================================================================
 * 3. THE LANE ADJUSTMENT — the four parts
 * ======================================================================== */
section("3. Lane adjustment: road, return load, demand, feedback");

eq("a lane at the rate card's reference speed is unadjusted", L.roadFactorFromMph(40).factor, 1.00);
ok("a slower lane costs more", L.roadFactorFromMph(30).factor > 1.00);
eq("a faster lane is never cheaper — we do not discount motorway work",
   L.roadFactorFromMph(70).factor, 1.00);
ok("the road adjustment is capped", L.roadFactorFromMph(5).factor <= L.config.road.max);

eq("a lane that loads back most days is unadjusted", L.returnBandFor(0.80).factor, 1.00);
eq("a lane that nearly always runs back empty pays the most", L.returnBandFor(0.02).factor, 1.12);
eq("the old zone grades are preserved exactly — strong areas", L.legacyAreaFactor("M1 1AA"), 1.00);
eq("the old zone grades are preserved exactly — limited areas", L.legacyAreaFactor("YO1 1AA"), 1.07);
eq("the old zone grades are preserved exactly — remote areas", L.legacyAreaFactor("IV1 1AA"), 1.12);

eq("a lane with plenty of drivers is unadjusted", L.demandBandFor(0.5).factor, 1.00);
eq("a stretched lane pays more so drivers choose it", L.demandBandFor(4).factor, 1.08);

/* ==========================================================================
 * 4. EVIDENCE BEFORE MONEY
 * ======================================================================== */
section("4. A lane only prices on its own numbers once it has evidence");

L.reset();
var thin = L.laneFactor("S1 2HH", "M1 1AA", { miles: 42, minutes: 60 });
ok("a lane with no finished jobs does NOT price on lane evidence", thin.basis !== "LANE_EVIDENCE");
eq("with no evidence and an easy destination the adjustment is 1.00", thin.factor, 1.00);

L.reset();
L.learn([{ from: "S", to: "M", jobs: 3, avgMiles: 42, avgMinutes: 90,
           returnsWithinWindow: 0, driverDaysOffered: 1 }]);
var few = L.laneFactor("S1 2HH", "M1 1AA", { miles: 42, minutes: 90 });
ok("3 finished jobs is still under the minimum sample — no lane pricing yet",
   few.basis !== "LANE_EVIDENCE", few.basis);

L.reset();
L.learn([{ from: "S", to: "M", jobs: 40, avgMiles: 42, avgMinutes: 90,
           returnsWithinWindow: 8, driverDaysOffered: 20 }]);
var many = L.laneFactor("S1 2HH", "M1 1AA", {});
eq("40 finished jobs and the lane prices on its own numbers",
   many.basis === "LANE_EVIDENCE" ? 1 : 0, 1);
ok("the slow, empty-running lane is adjusted upwards", many.factor > 1.00, "factor " + many.factor);
ok("the lane explains itself in plain words", many.reasons.length > 0);
ok("the sample size is recorded on the quote", many.sampleSize === 40);

/* ==========================================================================
 * 5. BRENT'S OWN EXAMPLE — Sheffield to Manchester vs Sheffield to Birmingham
 * ======================================================================== */
section("5. Sheffield-Manchester prices differently from Sheffield-Birmingham");

L.reset();
/* Same driving hour on both, very different roads: 42 congested cross-Pennine
   miles against 78 motorway miles, and a very different chance of a load back. */
L.learn([
  { from: "S", to: "M", jobs: 60, avgMiles: 42, avgMinutes: 75,
    returnsWithinWindow: 45, driverDaysOffered: 25 },
  { from: "S", to: "B", jobs: 60, avgMiles: 78, avgMinutes: 95,
    returnsWithinWindow: 42, driverDaysOffered: 55 }
]);
var sm = L.laneFactor("S1 2HH", "M1 1AA", {});
var sb = L.laneFactor("S1 2HH", "B1 1AA", {});
ok("the two lanes get different adjustments", sm.factor !== sb.factor,
   "S>M " + sm.factor + " vs S>B " + sb.factor);
ok("the slower, busier cross-Pennine lane is the dearer one", sm.factor > sb.factor);

var qSM = M.price({ miles: 42, minutes: 75, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY",
                    fromPostcode: "S1 2HH", toPostcode: "M1 1AA" });
var qSB = M.price({ miles: 78, minutes: 95, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY",
                    fromPostcode: "S1 2HH", toPostcode: "B1 1AA" });
ok("Sheffield to Manchester pays the driver more per mile than Sheffield to Birmingham",
   qSM.money.driverPayGbp / 42 > qSB.money.driverPayGbp / 78,
   "S>M £" + (qSM.money.driverPayGbp / 42).toFixed(2) + "/mi vs S>B £" + (qSB.money.driverPayGbp / 78).toFixed(2) + "/mi");
eq("HAF still keeps 20% on both — the lane pays the DRIVER, not HAF",
   qSM.money.hafKeepsPctOfCustomer, qSB.money.hafKeepsPctOfCustomer);
ok("the quote says why in plain words", qSM.reasons.join(" ").toLowerCase().indexOf("lane") > -1 ||
   qSM.reasons.join(" ").toLowerCase().indexOf("road") > -1 ||
   qSM.reasons.join(" ").toLowerCase().indexOf("return load") > -1, qSM.reasons.join(" | "));

/* A short hard lane must not have its adjustment swallowed by the minimum. */
L.reset();
var flatMin = M.price({ miles: 10, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY" });
L.learn([{ from: "S", to: "IV", jobs: 40, avgMiles: 10, avgMinutes: 30,
           returnsWithinWindow: 0, driverDaysOffered: 40 }]);
var hardMin = M.price({ miles: 10, minutes: 30, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY",
                        fromPostcode: "S1 2HH", toPostcode: "IV1 1AA" });
ok("a hard lane lifts the vehicle minimum too, so short hard runs still pay more",
   hardMin.money.carrierTransportValueGbp > flatMin.money.carrierTransportValueGbp,
   "£" + hardMin.money.carrierTransportValueGbp + " vs £" + flatMin.money.carrierTransportValueGbp);

/* ==========================================================================
 * 6. FEEDBACK FROM THE NETWORK
 * ======================================================================== */
section("6. Driver and customer feedback moves a lane, slowly and visibly");

L.reset();
var f1 = L.applyFeedback("S", "M", "UNDERPAID", "empty run back every time", "driver JW0123");
ok("one voice is recorded but does not move the price on its own", !f1.counted);
var i;
for (i = 0; i < 5; i++) L.applyFeedback("S", "M", "UNDERPAID", "empty run back", "driver " + i);
L.learn([{ from: "S", to: "M", jobs: 40, avgMiles: 42, avgMinutes: 63,
           returnsWithinWindow: 30, driverDaysOffered: 20, feedbackFactor: 1.04, feedbackResponses: 6 }]);
var afterFb = L.laneFactor("S1 2HH", "M1 1AA", {});
ok("once enough drivers say the same thing the lane moves", afterFb.parts.feedback > 1.00,
   "feedback part " + afterFb.parts.feedback);
ok("feedback can never move a lane more than the configured ceiling",
   L.config.feedback.max <= 1.05 && L.config.feedback.min >= 0.97);

L.reset();
L.learn([{ from: "S", to: "M", jobs: 40, avgMiles: 42, avgMinutes: 42,
           returnsWithinWindow: 40, driverDaysOffered: 400,
           feedbackFactor: 0.90, feedbackResponses: 50 }]);
var cheap = L.laneFactor("S1 2HH", "M1 1AA", {});
eq("customers saying a lane is dear can never take it below the standard rate",
   cheap.factor, 1.00);

/* ==========================================================================
 * 7. CEILINGS AND SAFETY
 * ======================================================================== */
section("7. Ceilings, caps and manual review");

L.reset();
L.learn([{ from: "S", to: "IV", jobs: 40, avgMiles: 100, avgMinutes: 400,
           returnsWithinWindow: 0, driverDaysOffered: 200,
           feedbackFactor: 1.05, feedbackResponses: 40 }]);
var extreme = L.laneFactor("S1 2HH", "IV1 1AA", {});
ok("a lane on its own may not exceed the configured ceiling",
   extreme.factor <= L.config.combined.max, "factor " + extreme.factor);
ok("hitting the ceiling is stated, not hidden", extreme.capped === true || extreme.factor < L.config.combined.max);

var capped = M.price({ miles: 100, minutes: 400, vehicleCode: "LWB_VAN", jobTypeCode: "URGENT",
                       weight: "NEAR_LIMIT", handling: "DIFFICULT",
                       fromPostcode: "S1 2HH", toPostcode: "IV1 1AA" });
ok("hindrance, lane and urgency together never breach the 1.40 automated cap",
   capped.lane.combinedRoadMultiplier <= 1.4005,
   "combined " + capped.lane.combinedRoadMultiplier);
ok("the urgency premium is recorded on the quote", capped.lane.servicePremium === 1.10);
ok("a job that would breach the cap goes to a human", capped.manualReviewRequired === true);

/* No job may ever be quoted less than a shorter one, lanes and all. */
L.reset();
L.learn([{ from: "S", to: "M", jobs: 40, avgMiles: 42, avgMinutes: 90,
           returnsWithinWindow: 5, driverDaysOffered: 15 }]);
var breaks = [];
for (v = 0; v < VEHICLES.length; v++) {
  var prev = -1;
  for (mi = 0; mi <= 300; mi++) {
    var pr = M.price({ miles: mi, minutes: mi / 40 * 60, vehicleCode: VEHICLES[v],
                       jobTypeCode: "STD_SAMEDAY", fromPostcode: "S1 2HH", toPostcode: "M1 1AA" });
    if (pr.money.customerExVatGbp + 0.005 < prev) breaks.push(VEHICLES[v] + " at " + mi + " mi");
    prev = pr.money.customerExVatGbp;
  }
}
ok("no job is ever quoted less than a shorter one, on any vehicle, with lanes live",
   breaks.length === 0, breaks.slice(0, 3).join("; "));

/* ==========================================================================
 * 8. THE TWO ENGINES STILL AGREE — with the lane layer switched ON
 * ======================================================================== */
section("8. Customer quote and back office agree, lanes and all");

L.reset();
L.learn([
  { from: "S", to: "M", jobs: 60, avgMiles: 42, avgMinutes: 75, returnsWithinWindow: 45, driverDaysOffered: 25 },
  { from: "S", to: "B", jobs: 60, avgMiles: 78, avgMinutes: 95, returnsWithinWindow: 42, driverDaysOffered: 55 },
  { from: "M", to: "TR", jobs: 30, avgMiles: 300, avgMinutes: 360, returnsWithinWindow: 1, driverDaysOffered: 30 }
]);
var CUSTVAN = { small: "SMALL_VAN", swb: "SWB_VAN", mwb: "MWB_VAN", lwb: "LWB_VAN",
                xlwb: "XLWB_VAN", luton: "LUTON", lutonc: "LUTON_CURTAIN", lutontl: "LUTON_TAIL" };
var CUSTJOB = { flex: "FLEX_SAMEDAY", sday: "STD_SAMEDAY", timed: "TIMED", urg: "URGENT" };
var LANES = [["S1 2HH", "M1 1AA"], ["S1 2HH", "B1 1AA"], ["M1 1AA", "TR1 1AA"], ["LS1 1AA", "YO1 1AA"]];
var mismatches = 0, checked = 0, firstBad = "";
for (var vk in CUSTVAN) {
  for (var jk in CUSTJOB) {
    for (i = 0; i < LANES.length; i++) {
      for (mi = 20; mi <= 200; mi += 60) {
        var mins = mi / 40 * 60;
        var cq = CUST.v3Price(mi, mins, vk, jk, LANES[i][1], { account: "lite", fromPc: LANES[i][0] });
        var bq = M.price({ miles: mi, minutes: mins, vehicleCode: CUSTVAN[vk], jobTypeCode: CUSTJOB[jk],
                           fromPostcode: LANES[i][0], toPostcode: LANES[i][1] });
        checked++;
        if (Math.abs(cq.sub - bq.money.customerExVatGbp) > 0.02) {
          mismatches++;
          if (!firstBad) firstBad = vk + " " + jk + " " + LANES[i][0] + ">" + LANES[i][1] + " " + mi +
            "mi customer £" + cq.sub + " vs back office £" + bq.money.customerExVatGbp;
        }
      }
    }
  }
}
ok("all " + checked + " lane-priced jobs match on both engines", mismatches === 0, firstBad);

/* Leave the store empty: the network has no finished jobs yet, and a test must
   not leave invented evidence behind for anything else that loads this module. */
L.reset();
ok("the lane store is left empty — no invented evidence survives the tests",
   Object.keys(L.snapshot().lanes).length === 0);

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + " — " + pass + " passed, " + fail + " failed\n");
process.exit(fail === 0 ? 0 : 1);
