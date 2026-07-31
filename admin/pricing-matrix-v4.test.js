/* ============================================================================
 * HAF KNECT — Pricing Matrix V4 test suite
 *
 * Proves the engine against Brent's "HAF KNECT Pricing Matrix and Network Fee
 * Framework" (2026-07-31), including its own §16 required test cases and the
 * §17 removal test.
 *
 * It also proves §15 — customer engine and back office must use the SAME
 * pricing source — by lifting the live customer engine straight out of
 * index.html and running the identical jobs through both.
 *
 *   node admin/pricing-matrix-v4.test.js
 * ========================================================================== */
"use strict";

var fs = require("fs");
var path = require("path");
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

/* --------------------------------------------------------------------------
 * Lift the customer engine out of index.html so both sides are tested for real
 * ------------------------------------------------------------------------ */
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
function slice(from, to) {
  var i = html.indexOf(from), j = html.indexOf(to, i);
  if (i < 0 || j < 0) throw new Error("could not find customer engine block: " + from);
  return html.slice(i, j);
}
var engineSrc =
  slice("const REF_MPH", "const PC={") +
  "\nreturn { VAN: VAN, URG: URG, v3Price: v3Price, minTransportValue: minTransportValue, zoneFactorFor: zoneFactorFor };";
var CUST = new Function(engineSrc)();

/* Same job, both engines. Destination M = strong zone (factor 1.00) so the two
 * are directly comparable; mins forced so distance wins over time. */
function customer(miles, vanKey, urgKey) {
  return CUST.v3Price(miles, miles / 40 * 60, vanKey, urgKey, "M1");
}
function backoffice(miles, code, jobType, extra) {
  var input = { miles: miles, vehicleCode: code, jobTypeCode: jobType,
                plnaTier: "FREE", knectTier: "FREE",
                weight: "STANDARD", handling: "KERBSIDE" };
  for (var k in (extra || {})) input[k] = extra[k];
  return M.price(input);
}

var PAIRS = [
  ["small",   "SMALL_VAN"],
  ["swb",     "SWB_VAN"],
  ["mwb",     "MWB_VAN"],
  ["lwb",     "LWB_VAN"],
  ["xlwb",    "XLWB_VAN"],
  ["luton",   "LUTON"],
  ["lutontl", "LUTON_TAIL"]
];

/* ==========================================================================
 * 1. The approved vehicle matrix (§2) — seven, and only seven
 * ======================================================================== */
section("1. Approved vehicle matrix");

var WANT = [
  ["SMALL_VAN",  "Small Van",         0.80, 50],
  ["SWB_VAN",    "SWB",               0.90, 55],
  ["MWB_VAN",    "MWB",               1.00, 60],
  ["LWB_VAN",    "LWB",               1.10, 65],
  ["XLWB_VAN",   "XLWB",              1.20, 70],
  ["LUTON",      "Luton",             1.30, 75],
  ["LUTON_TAIL", "Luton — Tail Lift", 1.40, 80]
];
ok("back office lists exactly 7 vehicles", M.config.vehicles.length === 7,
   "found " + M.config.vehicles.length);
ok("customer engine lists exactly 7 vehicles", Object.keys(CUST.VAN).length === 7,
   "found " + Object.keys(CUST.VAN).length);
WANT.forEach(function (w, i) {
  var v = M.config.vehicles[i];
  ok(w[1] + " — code, rate and minimum",
     v.code === w[0] && v.baseRate === w[2] && v.minTransportValue === w[3],
     JSON.stringify(v));
});
PAIRS.forEach(function (p, i) {
  var cv = CUST.VAN[p[0]], bv = M.config.vehicles[i];
  ok(WANT[i][1] + " — customer engine matches the back office",
     cv.drv === bv.baseRate && cv.min === bv.minTransportValue,
     JSON.stringify(cv) + " vs " + bv.baseRate + "/" + bv.minTransportValue);
});
eq("rate ladder starts at 80p", M.config.vehicles[0].baseRate, 0.80);
eq("rate ladder ends at £1.40", M.config.vehicles[6].baseRate, 1.40);
eq("minimum ladder starts at £50", M.config.vehicles[0].minTransportValue, 50);
eq("minimum ladder ends at £80", M.config.vehicles[6].minTransportValue, 80);
ok("cars and motorcycles are present but inactive and unpriced",
   M.config.inactiveVehicles.length === 2 &&
   M.config.inactiveVehicles.every(function (v) { return v.active === false && v.baseRate === null; }));

/* ==========================================================================
 * 2. Removal test (§17) — the banned words are gone from every live surface
 * ======================================================================== */
section("2. Removal test — prohibited vehicle types");

var BANNED = ["artic", "articulated", "hgv", "flatbed", "tractor unit",
              "rigid", "7.5 tonne", "7.5t", "18 tonne", "26 tonne",
              "44 tonne", "specialist haulage", "curtain", "fridge"];
var SURFACES = ["index.html", "demo/index.html", "admin/index.html",
                "admin/pricing-matrix-v3.js"];
SURFACES.forEach(function (f) {
  var body = fs.readFileSync(path.join(__dirname, "..", f), "utf8").toLowerCase();
  /* strip the comment that lists the banned words so the ban itself isn't a hit */
  body = body.replace(/no artic, flatbed, curtain, rigid,[\s\S]*?removal test[^)]*\)/g, "");
  var hits = BANNED.filter(function (w) { return body.indexOf(w) >= 0; });
  ok(f + " — no prohibited vehicle type", hits.length === 0, "found: " + hits.join(", "));
});

/* ==========================================================================
 * 3. Minimum transport value — steps by VEHICLE, never by distance (§2)
 * ======================================================================== */
section("3. Vehicle minimums");

/* §2 worked example: Small Van, 25 miles × £0.80 = £20, minimum £50 wins */
var a = customer(25, "small", "sday");
eq("Small Van 25 mi — transport value is the £50 minimum, not £20", a.carrier, 50);
ok("...and the engine says the minimum was applied", a.onMinimum === true);

/* §2 worked example: LWB, 100 miles × £1.10 = £110, above the £65 minimum */
var b = customer(100, "lwb", "sday");
eq("LWB 100 mi — mileage takes over at £110", b.carrier, 110);
ok("...and the minimum is not in play", b.onMinimum === false);

/* the minimum must rise with the vehicle, at the same distance */
var mins = PAIRS.map(function (p) { return customer(25, p[0], "sday").carrier; });
ok("at 25 miles the floor rises with every vehicle size",
   mins.every(function (v, i) { return i === 0 || v > mins[i - 1]; }), mins.join(" < "));
eq("Small Van floor at 25 mi", mins[0], 50);
eq("Luton tail lift floor at 25 mi", mins[6], 80);

/* ==========================================================================
 * 4. Short local runs — handling work, 20–30% below the minimum
 * ======================================================================== */
section("4. Short local runs (handling rate)");

var v = CUST.VAN.small;
eq("Small Van 0 mi  — the full 30% below the £50 minimum", CUST.minTransportValue(v, 0), 35);
eq("Small Van 3 mi  — 28% below", CUST.minTransportValue(v, 3), 36);
eq("Small Van 8 mi  — 24.7% below", CUST.minTransportValue(v, 8), 37.67);
eq("Small Van 15 mi — 20% below", CUST.minTransportValue(v, 15), 40);
eq("Small Van 20 mi — halfway back up", CUST.minTransportValue(v, 20), 45);
eq("Small Van 25 mi — full minimum restored", CUST.minTransportValue(v, 25), 50);
eq("Small Van 60 mi — still the full minimum", CUST.minTransportValue(v, 60), 50);

var tl = CUST.VAN.lutontl;
eq("Luton tail lift 0 mi  — 30% below the £80 minimum", CUST.minTransportValue(tl, 0), 56);
eq("Luton tail lift 15 mi — 20% below", CUST.minTransportValue(tl, 15), 64);
eq("Luton tail lift 25 mi — full £80", CUST.minTransportValue(tl, 25), 80);

PAIRS.forEach(function (p) {
  var veh = CUST.VAN[p[0]];
  var off = 1 - CUST.minTransportValue(veh, 3) / veh.min;
  ok(veh.n + " — shortest runs sit inside Brent's 20–30% band",
     off >= 0.199 && off <= 0.301, Math.round(off * 1000) / 10 + "% off");
});

/* no cliff: the floor must never fall as distance rises, and never jump */
var prev = 0, cliff = null, drop = null;
/* step finely: a smooth taper rises at most ~£1.60 a mile on the biggest
 * vehicle, so nothing should ever gain more than 20p in a 20th of a mile */
for (var mi = 0.05; mi <= 40; mi += 0.05) {
  var f = CUST.minTransportValue(CUST.VAN.lutontl, mi);
  if (f < prev - 0.001) drop = Math.round(mi * 100) / 100;
  if (f - prev > 0.20 && prev > 0) cliff = Math.round(mi * 100) / 100;
  prev = f;
}
ok("the floor never falls as the job gets longer", drop === null, "fell at " + drop + " mi");
ok("the floor never jumps — no mile where the price leaps", cliff === null, "jumped at " + cliff + " mi");

/* the whole quote must rise with distance too — the real customer-facing test */
var lastSub = 0, subDrop = null;
for (var m2 = 1; m2 <= 60; m2 += 1) {
  var q = customer(m2, "lutontl", "sday");
  if (q.sub < lastSub - 0.01) subDrop = m2;
  lastSub = q.sub;
}
ok("the customer price never falls as the job gets longer", subDrop === null,
   "fell at " + subDrop + " mi");

/* ==========================================================================
 * 5. The three amounts, kept apart (§1) and the network fee matrix (§4)
 * ======================================================================== */
section("5. Network fee kept separate");

var FEES = [["sday", 20], ["flex", 20], ["timed", 25], ["urg", 30]];
FEES.forEach(function (f) {
  eq("customer engine — " + f[0] + " network fee is " + f[1] + "%", CUST.URG[f[0]].fee * 100, f[1]);
});
eq("back office — same-day network fee", M.config.jobTypes[2].marginPct, 20);
eq("back office — scheduled/flexible network fee", M.config.jobTypes[1].marginPct, 20);
eq("back office — timed network fee", M.config.jobTypes[3].marginPct, 25);
eq("back office — urgent network fee", M.config.jobTypes[4].marginPct, 30);
ok("groupage is built but switched off for customers",
   M.config.jobTypes[0].code === "GROUPAGE" && M.config.jobTypes[0].active === false);

var c = customer(100, "lwb", "sday");
eq("transport value and fee add up to the customer price", c.carrier + c.fee, c.sub);
eq("the fee is 20% of the transport value, not of the price", c.fee, c.carrier * 0.20);
ok("the fee is never buried in the mileage rate",
   Math.abs(c.carrier - 110) < 0.005 && Math.abs(c.fee - 22) < 0.005, JSON.stringify(c));

/* ==========================================================================
 * 6. §6 worked examples — the numbers Brent wrote down
 * ======================================================================== */
section("6. Brent's worked examples (§6)");

var exA = customer(25, "small", "sday");
eq("Example A — Small Van, 25 mi, same-day: transport £50", exA.carrier, 50);
eq("Example A — network fee £10", exA.fee, 10);
eq("Example A — customer subtotal £60 ex VAT", exA.sub, 60);

var exB = customer(100, "swb", "sday");
eq("Example B — SWB, 100 mi: transport £90", exB.carrier, 90);
eq("Example B — customer subtotal £108 ex VAT at the standard 20%", exB.sub, 108);

var exC = customer(100, "lwb", "flex");
eq("Example C — LWB, 100 mi, scheduled: transport £110", exC.carrier, 110);
eq("Example C — customer subtotal £132 ex VAT at the standard 20%", exC.sub, 132);

var exD = customer(100, "lutontl", "urg");
eq("Example D — Luton tail lift, 100 mi, urgent: transport £154 (urgency pays the driver)",
   exD.carrier, 154);
eq("Example D — network fee is 30% of that", exD.fee, 46.20);

/* ==========================================================================
 * 7. Customer engine and back office agree (§15)
 * ======================================================================== */
section("7. Customer engine and back office in step");

var JOBS = [
  [3, "sday"], [8, "sday"], [13, "sday"], [20, "sday"], [25, "sday"],
  [40, "sday"], [100, "sday"], [250, "sday"],
  [30, "timed"], [30, "flex"]
];
var JT = { sday: "STD_SAMEDAY", flex: "FLEX_SAMEDAY", timed: "TIMED", urg: "URGENT" };
var mismatches = 0;
PAIRS.forEach(function (p) {
  JOBS.forEach(function (j) {
    var cq = customer(j[0], p[0], j[1]);
    var bq = backoffice(j[0], p[1], JT[j[1]]);
    if (Math.abs(cq.sub - bq.money.customerExVatGbp) > 0.02) {
      mismatches++;
      console.log("      mismatch: " + p[0] + " " + j[0] + "mi " + j[1] +
                  " customer £" + cq.sub.toFixed(2) + " vs back office £" +
                  bq.money.customerExVatGbp.toFixed(2));
    }
  });
});
ok("all " + (PAIRS.length * JOBS.length) + " jobs price identically on both sides",
   mismatches === 0, mismatches + " mismatched");

/* ==========================================================================
 * 8. The driver is never short-changed
 * ======================================================================== */
section("8. Driver protection");

var under = 0;
PAIRS.forEach(function (p) {
  for (var m3 = 1; m3 <= 300; m3 += 7) {
    var q = customer(m3, p[0], "sday");
    if (q.sub <= q.carrier) under++;                       // customer must sit above transport
    if (q.carrier < CUST.minTransportValue(CUST.VAN[p[0]], m3) - 0.01) under++;
  }
});
ok("the customer price always sits above the driver's transport value", under === 0,
   under + " failures");

var bo = backoffice(60, "SWB_VAN", "STD_SAMEDAY", { plnaTier: "PRO", knectTier: "PAID" });
var boFree = backoffice(60, "SWB_VAN", "STD_SAMEDAY");
eq("a driver's PLNA tier does not move the customer price",
   bo.money.customerExVatGbp, boFree.money.customerExVatGbp);
ok("...the uplift comes out of HAF's fee instead",
   bo.money.driverPayGbp > boFree.money.driverPayGbp &&
   bo.money.hafMarginGbp < boFree.money.hafMarginGbp,
   JSON.stringify(bo.money));
ok("...and HAF still holds its floor",
   bo.money.hafMarginGbp >= bo.money.carrierTransportValueGbp * 0.15 - 0.01);

/* ==========================================================================
 * 9. VAT and the pricing snapshot
 * ======================================================================== */
section("9. VAT and audit record");

var vt = backoffice(100, "LWB_VAN", "STD_SAMEDAY");
eq("VAT is 20% of the ex-VAT subtotal", vt.money.vatGbp, vt.money.customerExVatGbp * 0.20);
eq("inc-VAT total adds up", vt.money.customerIncVatGbp,
   vt.money.customerExVatGbp + vt.money.vatGbp);
ok("every quote carries a full audit record",
   vt.version === "MATRIX-V4" && vt.money && vt.reasons && vt.inputs &&
   vt.money.carrierTransportValueGbp != null && vt.money.networkFeeGbp != null);

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + " — " + pass + " passed, " + fail + " failed\n");
process.exit(fail === 0 ? 0 : 1);
