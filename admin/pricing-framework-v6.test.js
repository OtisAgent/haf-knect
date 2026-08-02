/* ============================================================================
 * HAF KNECT — Pricing FRAMEWORK V6 test suite
 *
 * Proves the engine against Brent's "HAF KNECT Pricing Matrix and Network Fee
 * Framework" (2026-07-31) as amended by his 2026-08-02 rulings, including its
 * own §16 required test cases and the §17 removal test.
 *
 * The lane layer and the margin bands have their own suite:
 *   node admin/lane-and-margin-v6.test.js
 *
 * It also proves §15 — customer engine and back office must use the SAME
 * pricing source — by lifting the live customer engine straight out of
 * index.html and running the identical jobs through both.
 *
 *   node admin/pricing-matrix-v5.test.js
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
  "var window = {};\n" +          // the block is browser code; stub the one global it sets
  slice("const REF_MPH", "const PC={") +
  "\nreturn { VAN: VAN, URG: URG, DRV_LEVEL: DRV_LEVEL, ACC_LEVEL: ACC_LEVEL, DRV_REWARD: DRV_REWARD," +
  "\n         v3Price: v3Price, minTransportValue: minTransportValue, zoneFactorFor: zoneFactorFor };";
var CUST = new Function(engineSrc)();

/* Same job, both engines. Destination M = strong zone (factor 1.00) so the two
 * are directly comparable; mins forced so distance wins over time. */
function customer(miles, vanKey, urgKey, opts) {
  return CUST.v3Price(miles, miles / 40 * 60, vanKey, urgKey, "M1", opts);
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
  ["lutonc",  "LUTON_CURTAIN"],
  ["lutontl", "LUTON_TAIL"]
];

/* ==========================================================================
 * 1. The approved vehicle matrix (§2) — eight, and only eight
 * ======================================================================== */
section("1. Approved vehicle matrix");

var WANT = [
  ["SMALL_VAN",  "Small Van",         0.80, 50],
  ["SWB_VAN",    "SWB",               0.90, 55],
  ["MWB_VAN",    "MWB",               1.00, 60],
  ["LWB_VAN",    "LWB",               1.10, 65],
  ["XLWB_VAN",   "XLWB",              1.20, 70],
  ["LUTON",          "Luton — Box",          1.30, 75],
  ["LUTON_CURTAIN", "Luton — Curtain Side", 1.30, 75],
  ["LUTON_TAIL",    "Luton — Tail Lift",    1.40, 80]
];
ok("back office lists exactly 8 vehicles", M.config.vehicles.length === 8,
   "found " + M.config.vehicles.length);
ok("customer engine lists exactly 8 vehicles", Object.keys(CUST.VAN).length === 8,
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
eq("rate ladder ends at £1.40", M.config.vehicles[7].baseRate, 1.40);
eq("minimum ladder starts at £50", M.config.vehicles[0].minTransportValue, 50);
eq("minimum ladder ends at £80", M.config.vehicles[7].minTransportValue, 80);
ok("cars and motorcycles are present but inactive and unpriced",
   M.config.inactiveVehicles.length === 2 &&
   M.config.inactiveVehicles.every(function (v) { return v.active === false && v.baseRate === null; }));

/* ==========================================================================
 * 2. Removal test (§17) — the banned words are gone from every live surface
 * ======================================================================== */
section("2. Removal test — prohibited vehicle types");

var BANNED = ["artic", "articulated", "hgv", "flatbed", "tractor unit",
              "rigid", "7.5 tonne", "7.5t", "18 tonne", "26 tonne",
              "44 tonne", "specialist haulage", "fridge",
              /* a curtain-side LUTON is approved (Brent 2026-08-02); a curtain-side
                 TRAILER is still banned, so ban the trailer, not the word */
              "curtainsider", "curtain-sider", "curtain sider",
              "curtain side trailer", "curtain-side trailer", "curtain trailer"];
var SURFACES = ["index.html", "demo/index.html", "admin/index.html",
                "admin/pricing-matrix-v3.js"];
SURFACES.forEach(function (f) {
  var body = fs.readFileSync(path.join(__dirname, "..", f), "utf8").toLowerCase();
  /* strip the comment that lists the banned words so the ban itself isn't a hit */
  body = body.replace(/nothing above a luton exists here[\s\S]*?removal test[^)]*\)/g, "");
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
ok("at 25 miles the floor never drops as the vehicle gets bigger",
   mins.every(function (v, i) { return i === 0 || v >= mins[i - 1]; }), mins.join(" <= "));
ok("box and curtain side share one floor — same payload, same price",
   mins[5] === mins[6], mins[5] + " vs " + mins[6]);
eq("Small Van floor at 25 mi", mins[0], 50);
eq("Luton tail lift floor at 25 mi", mins[7], 80);

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
/* FRAMEWORK-V6: the percentage is the share of the CUSTOMER PRICE HAF keeps,
   not a percentage added to the transport value. This is the one change that
   makes Brent's own bands true — see §6. */
eq("the fee is 20% of the customer price — what Brent's bands actually mean",
   c.fee, c.sub * 0.20);
ok("the fee is never buried in the mileage rate — the driver still gets it all",
   Math.abs(c.carrier - 110) < 0.005 && Math.abs(c.fee - 27.50) < 0.005, JSON.stringify(c));

/* ==========================================================================
 * 6. §6 worked examples — Brent's own jobs, re-worked under FRAMEWORK-V6
 *
 * ⚠️ HIS DOCUMENT CONTRADICTS ITSELF AND THIS IS WHERE IT SHOWS. His §6
 * examples are worked by ADDING the percentage to the transport value
 * (£50 + 20% = £60). His margin bands say free accounts must be "20% - 30%"
 * and paid accounts never below 10-15%. Adding 20% to £50 leaves HAF keeping
 * 16.7% of £60 — his band cannot be met at any job type, on any vehicle.
 *
 * Brent, 2026-08-02: "build the system to allow for the figures above - find a
 * solution". The bands are the figures, so the bands win and the subtotals in
 * his §6 move up by about 4%. THE DRIVER IS PAID EXACTLY THE SAME in every
 * example — only HAF's share of the total changes, and only to the number he
 * asked for. His transport values are asserted unchanged below to prove it.
 * ======================================================================== */
section("6. Brent's worked examples, re-worked under V6 (§6)");

var exA = customer(25, "small", "sday");
eq("Example A — Small Van, 25 mi, same-day: transport £50, unchanged", exA.carrier, 50);
eq("Example A — network fee £12.50, which IS 20% of the price", exA.fee, 12.50);
eq("Example A — customer subtotal £62.50 ex VAT (his £60 kept only 16.7%)", exA.sub, 62.50);
eq("Example A — HAF keeps exactly 20%", exA.fee / exA.sub * 100, 20);

/* Example B — SWB, 100 mi, same-day, FREIGHT PLUS: 17.5% kept */
var exB = customer(100, "swb", "sday", { account: "plus" });
eq("Example B — SWB, 100 mi: transport £90, unchanged", exB.carrier, 90);
eq("Example B — Freight Plus network fee £19.09", exB.fee, 19.09);
eq("Example B — customer subtotal £109.09 ex VAT", exB.sub, 109.09);
eq("Example B — HAF keeps 17.5%", Math.round(exB.fee / exB.sub * 1000) / 10, 17.5);

/* Example C — LWB, 100 mi, scheduled, FREIGHT PRO: 15% kept */
var exC = customer(100, "lwb", "flex", { account: "pro" });
eq("Example C — LWB, 100 mi, scheduled: transport £110, unchanged", exC.carrier, 110);
eq("Example C — Freight Pro network fee £19.41", exC.fee, 19.41);
eq("Example C — customer subtotal £129.41 ex VAT", exC.sub, 129.41);
eq("Example C — HAF keeps 15% — the bottom of his paid band",
   Math.round(exC.fee / exC.sub * 1000) / 10, 15);

/* Examples D and E — Luton tail lift, 100 mi, urgent, Freight Free then Pro.
 * ⚠️ KNOWN DEVIATION, flagged to Brent rather than quietly reconciled. The
 * document works these at a flat £140 transport value; the live engine has
 * carried an urgent SERVICE MULTIPLIER of 1.10 since FRAMEWORK-V3 (2026-07-20)
 * which pays the DRIVER more for time-critical work, giving £154. §2 of the
 * document does allow "approved service adjustments" on top of the base rate,
 * so the two are reconcilable — but the worked example does not show one, so
 * the fee PERCENTAGES are what we assert here, not his subtotal. */
var exD = customer(100, "lutontl", "urg");
eq("Example D — urgent Freight Free network fee is 30% of the transport value",
   exD.feePct * 100, 30);
eq("Example D — transport £154 (£140 base + the live 1.10 urgent service multiplier)",
   exD.carrier, 154);
var exE = customer(100, "lutontl", "urg", { account: "pro" });
eq("Example E — urgent Freight Pro network fee is 25%, not 30%", exE.feePct * 100, 25);
eq("Example E — the driver is paid exactly the same as in Example D",
   exE.carrier, exD.carrier);
ok("Example E — the Pro discount comes only off HAF", exE.sub < exD.sub);

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
/* Every combination of driver level and account level, both engines. */
var LEVELS = [
  [{},                                {}],
  [{ driver: "member" },              { plnaTier: "PLUS" }],
  [{ driver: "pro" },                 { plnaTier: "PRO" }],
  [{ account: "plus" },               { accountType: "FREIGHT_PLUS" }],
  [{ account: "pro" },                { accountType: "FREIGHT_PRO" }],
  [{ account: "plus" },               { knectTier: "PAID" }],
  [{ driver: "pro", account: "pro" }, { plnaTier: "PRO", accountType: "FREIGHT_PRO" }]
];
var mismatches = 0, compared = 0;
PAIRS.forEach(function (p) {
  JOBS.forEach(function (j) {
    LEVELS.forEach(function (lv) {
      compared++;
      var cq = customer(j[0], p[0], j[1], lv[0]);
      var bq = backoffice(j[0], p[1], JT[j[1]], lv[1]);
      if (Math.abs(cq.sub - bq.money.customerExVatGbp) > 0.02) {
        mismatches++;
        console.log("      mismatch: " + p[0] + " " + j[0] + "mi " + j[1] + " " +
                    JSON.stringify(lv[0]) + " customer £" + cq.sub.toFixed(2) +
                    " vs back office £" + bq.money.customerExVatGbp.toFixed(2));
      }
      if (Math.abs(cq.carrier - bq.money.driverPayGbp) > 0.02) {
        mismatches++;
        console.log("      driver pay mismatch: " + p[0] + " " + j[0] + "mi " +
                    JSON.stringify(lv[0]) + " £" + cq.carrier + " vs £" + bq.money.driverPayGbp);
      }
    });
  });
});
ok("all " + compared + " jobs price identically on both sides, at every account and driver level",
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

/* FRAMEWORK-V7 (Brent 2026-08-02): "i wouldn't say charging more for a better
   driver ... for now offering more for a driver isn't right - i'm happy to take
   less margin for HAF then make the customers pay more."
   The old V5/V6 assertions here — that the customer rate follows the driver and
   HAF earns MORE for a better driver — are DELETED, not skipped: they asserted
   exactly the behaviour he has now ruled out. Replaced by their opposites. */
var bo = backoffice(60, "SWB_VAN", "STD_SAMEDAY", { plnaTier: "PRO" });
var boFree = backoffice(60, "SWB_VAN", "STD_SAMEDAY");
eq("a Pro driver costs the customer exactly the same as a Free driver",
   bo.money.customerIncVatGbp, boFree.money.customerIncVatGbp);
eq("...and is paid the same today, because the reward is paused",
   bo.money.driverPayGbp, boFree.money.driverPayGbp);
eq("...so the reward is worth nothing on the job", bo.money.driverRewardGbp, 0);
ok("...HAF still holds its floor",
   bo.money.hafMarginGbp >= bo.money.carrierTransportValueGbp * 0.15 - 0.01);

/* ==========================================================================
 * 8b. DRIVER BASE-RATE UPLIFT (V5) — pence per mile, highest wins
 * ======================================================================== */
section("8b. Driver base-rate uplift");

eq("Free driver adds nothing",   M.config.driverLevels.FREE.rewardGbpPerMile,   0.00);
eq("Member driver adds £0.10",   M.config.driverLevels.MEMBER.rewardGbpPerMile, 0.10);
eq("Pro driver adds £0.25",      M.config.driverLevels.PRO.rewardGbpPerMile,    0.25);

/* Held at zero on every live quote today. */
eq("the reward is paused", M.config.driverReward.enabled, false);
ok("and when it runs, HAF pays for it, not the customer",
   M.config.driverReward.fundedBy === "HAF_MARGIN", M.config.driverReward.fundedBy);
["PLUS", "PRO"].forEach(function (t) {
  eq("a " + t + " driver's live quote carries a £0.00 reward",
     backoffice(100, "LWB_VAN", "STD_SAMEDAY", { plnaTier: t }).rates.driverRewardGbpPerMile, 0);
});

/* Everything from here to the end of 8b describes the reward SWITCHED ON, so
   the shape survives intact for the day Brent turns it back on. */
function rewardOn() {
  M.applyConfig({ driverReward: { enabled: true, fundedBy: "HAF_MARGIN", minRetainedPctOfCustomer: 8 } });
}
rewardOn();

/* The uplift lands on the rate, for every vehicle, at both member rungs. */
[["MEMBER", 0.10], ["PRO", 0.25]].forEach(function (lv) {
  var bad = 0;
  M.config.vehicles.forEach(function (v) {
    var r = M.price({ miles: 100, vehicleCode: v.code, jobTypeCode: "STD_SAMEDAY",
                      plnaTier: lv[0] === "MEMBER" ? "PLUS" : "PRO" });
    if (Math.abs(r.rates.rewardedBaseRate - (v.baseRate + lv[1])) > 0.001) bad++;
  });
  ok(lv[0] + " rate = vehicle rate + £" + lv[1].toFixed(2) + " on all 7 vehicles", bad === 0);
});

/* A paid KNECT membership on the driver side earns the Member rate. */
var dKnect = backoffice(100, "LWB_VAN", "STD_SAMEDAY", { driverIsKnectMember: true });
eq("a paid HAF KNECT member driver earns the member rate",
   dKnect.rates.driverRewardGbpPerMile, 0.10);

/* Highest wins, never stacks — the rule that stops benefits compounding. */
var stacked = backoffice(100, "LWB_VAN", "STD_SAMEDAY",
  { plnaTier: "PRO", driverIsKnectMember: true, driverFleetTier: "FLEET_PRO" });
eq("PLNA Pro + KNECT member + Fleet Pro is still £0.25, never £0.45",
   stacked.rates.driverRewardGbpPerMile, 0.25);
ok("...and all three claims are on the audit record",
   stacked.rates.levelClaims.length === 3, JSON.stringify(stacked.rates.levelClaims));

/* Fleet accounts: the fleet's level sets its drivers' rate — "same again". */
eq("Fleet Lite drivers sit on the free rate",
   backoffice(100, "LWB_VAN", "STD_SAMEDAY", { driverFleetTier: "FLEET_LITE" })
     .rates.driverRewardGbpPerMile, 0);
eq("Fleet Middle drivers sit on the member rate",
   backoffice(100, "LWB_VAN", "STD_SAMEDAY", { driverFleetTier: "FLEET_MIDDLE" })
     .rates.driverRewardGbpPerMile, 0.10);
eq("Fleet Pro drivers sit on the Pro rate",
   backoffice(100, "LWB_VAN", "STD_SAMEDAY", { driverFleetTier: "FLEET_PRO" })
     .rates.driverRewardGbpPerMile, 0.25);

/* V7: with the reward running, the CUSTOMER never pays a penny more for a
   better driver, the driver is never paid less, and HAF never funds itself
   below its floor share. That is the whole ruling, swept across the grid. */
var priceMoved = 0, driverShort = 0, belowFloor = 0, funded = 0;
PAIRS.forEach(function (p) {
  for (var mm = 1; mm <= 300; mm += 11) {
    var f = backoffice(mm, p[1], "STD_SAMEDAY");
    var pr = backoffice(mm, p[1], "STD_SAMEDAY", { plnaTier: "PRO" });
    if (Math.abs(pr.money.customerIncVatGbp - f.money.customerIncVatGbp) > 0.01) priceMoved++;
    if (pr.money.driverPayGbp < f.money.driverPayGbp - 0.01) driverShort++;
    if (pr.money.hafKeepsPctOfCustomer < M.config.driverReward.minRetainedPctOfCustomer - 0.01) belowFloor++;
    if (pr.money.driverRewardGbp > 0) funded++;
  }
});
ok("across 7 vehicles x 28 distances a Pro driver never changes the customer's price",
   priceMoved === 0, priceMoved + " failures");
ok("...and the driver is never paid less than a free driver would be",
   driverShort === 0, driverShort + " failures");
ok("...and HAF never funds a reward below its floor share",
   belowFloor === 0, belowFloor + " failures");
ok("...and the reward really was being paid on those jobs", funded > 0, funded + " funded");

/* The floor is real: on a long job a £0.25/mile reward outruns a 20% share, so
   it is trimmed to what HAF can afford, flagged, and sent for a human to see —
   and even then the customer's price does not move. */
var longFree = backoffice(300, "SMALL_VAN", "STD_SAMEDAY");
var longPro  = backoffice(300, "SMALL_VAN", "STD_SAMEDAY", { plnaTier: "PRO" });
eq("an unaffordable reward still does not move the customer's price",
   longPro.money.customerIncVatGbp, longFree.money.customerIncVatGbp);
ok("...it is trimmed to what HAF can afford", longPro.money.driverRewardTrimmedGbp > 0);
ok("...and flagged for a human rather than absorbed silently",
   longPro.flags.indexOf("REWARD_TRIMMED") >= 0 && longPro.manualReviewRequired === true);
eq("...leaving HAF exactly on its floor, never under it",
   longPro.money.hafKeepsPctOfCustomer, M.config.driverReward.minRetainedPctOfCustomer);

M.resetConfig();   /* back to the live setting: the reward is paused */
eq("the suite leaves the engine on the live setting", M.config.driverReward.enabled, false);

/* ==========================================================================
 * 8c. ACCOUNT NETWORK-FEE REDUCTION (V5) — points off, floor always held
 * ======================================================================== */
section("8c. Account network-fee reduction");

eq("Free account reduces nothing",   M.config.accountLevels.LITE.feeReductionPts, 0);
eq("Plus account is −2.5 points",    M.config.accountLevels.PLUS.feeReductionPts, 2.5);
eq("Pro account is −5 points",       M.config.accountLevels.PRO.feeReductionPts,  5);
/* Three older fee models exist in the wild — the −4/−7 pair, the tier_config
   freight_tier row, and the 1-point KNECT member benefit. Every one must stay
   on the record so nobody re-applies it by accident. */
const _prior = M.config.supersededAccountLevels.priorModels;
ok("the older −4 / −7 pair is recorded as superseded, not silently dropped",
   _prior.some(m => m.PLUS === 4 && m.PRO === 7));
ok("the legacy freight_tier fee row is recorded as superseded",
   _prior.some(m => m.PRO === -3 && m.FREE === 4));
ok("the 1-point KNECT member benefit is recorded as superseded",
   _prior.some(m => m.MEMBER_PTS === 1));
ok("the old percentage-multiplier driver model is recorded as superseded",
   M.config.supersededDriverModels.some(m => m.PRO === 1.08 && m.cap === 1.10));

/* §5 LIVE FREIGHT NETWORK FEE MATRIX — Brent's own table, cell for cell.
 * Urgent 30 / 27.5 / 25 · Same-day 20 / 17.5 / 15 · Scheduled 20 / 17.5 / 15  */
[["URGENT", 30, 27.5, 25], ["STD_SAMEDAY", 20, 17.5, 15], ["FLEX_SAMEDAY", 20, 17.5, 15]]
  .forEach(function (row) {
    [["FREIGHT_FREE", row[1]], ["FREIGHT_PLUS", row[2]], ["FREIGHT_PRO", row[3]]]
      .forEach(function (cell) {
        eq(row[0] + " · " + cell[0] + " = " + cell[1] + "%",
           backoffice(100, "LWB_VAN", row[0], { accountType: cell[0] }).money.networkFeePct,
           cell[1]);
      });
  });

/* §5: it is a percentage-POINT reduction, not a % off the fee's value. */
var ffPro = backoffice(100, "LWB_VAN", "STD_SAMEDAY", { accountType: "FREIGHT_PRO" });
eq("Freight Pro same-day is 20 − 5 = 15 points, not 20 × 0.95 = 19",
   ffPro.money.networkFeePct, 15);
ok("...taken in full, with no floor interference",
   ffPro.account.feeReductionRequestedPts === 5 &&
   ffPro.account.feeReductionAppliedPts === 5 && ffPro.account.heldAtFloor === false,
   JSON.stringify(ffPro.account));

/* §7: business accounts get the standard fee — no automatic discount. */
eq("a business account pays the standard fee",
   backoffice(100, "LWB_VAN", "URGENT", { accountType: "BUSINESS_FREE" }).money.networkFeePct, 30);

/* §7: a fleet's subscription must NOT reduce the network fee. */
ok("fleet tiers cannot buy a network-fee reduction (framework §7)",
   M.config.accountLevelFrom.accountType.FLEET_PRO === undefined &&
   M.config.accountLevelFrom.accountType.FLEET_LITE === undefined);
eq("a job posted against a fleet account still pays the standard fee",
   backoffice(100, "LWB_VAN", "URGENT", { accountType: "FLEET_PRO" }).money.networkFeePct, 30);

/* A paid KNECT member account earns the Plus rung. */
eq("a paid HAF KNECT member account gets 2.5 points",
   backoffice(100, "LWB_VAN", "URGENT", { knectTier: "PAID" }).money.networkFeePct, 27.5);

/* §8 — one account-tier discount per job. Freight Pro + KNECT member is −5. */
eq("Freight Pro + KNECT member is −5 points, never −7.5",
   backoffice(100, "LWB_VAN", "URGENT", { accountType: "FREIGHT_PRO", knectTier: "PAID" })
     .money.networkFeePct, 25);

/* The floor is still a real backstop if a reduction ever goes further. */
var deep = backoffice(100, "LWB_VAN", "STD_SAMEDAY",
  { accountType: "FREIGHT_PRO", marginDeltaPct: -10 });
ok("the job-type floor still catches a reduction that would go too far",
   deep.money.networkFeePct >= 15 - 0.001, deep.money.networkFeePct + "%");

/* The reduction comes off HAF, never off the driver. */
var accBad = 0;
["FREIGHT_PLUS", "FREIGHT_PRO"].forEach(function (at) {
  PAIRS.forEach(function (p) {
    ["STD_SAMEDAY", "TIMED", "URGENT", "FLEX_SAMEDAY"].forEach(function (jt) {
      var base = backoffice(120, p[1], jt);
      var red  = backoffice(120, p[1], jt, { accountType: at });
      if (red.money.driverPayGbp !== base.money.driverPayGbp) accBad++;   // driver untouched
      if (red.money.customerExVatGbp > base.money.customerExVatGbp) accBad++; // never dearer
      var floorPct = M.config.jobTypes.filter(function (j) { return j.code === jt; })[0].floorPct;
      if (red.money.networkFeePct < floorPct - 0.001) accBad++;           // floor held
    });
  });
});
ok("across every account, vehicle and job type the reduction only ever costs HAF",
   accBad === 0, accBad + " failures");

/* ==========================================================================
 * 8d. Both levers together — the Double-Pro case
 * ======================================================================== */
section("8d. Double Pro — Pro driver on a Pro account");

var dp   = backoffice(100, "LWB_VAN", "STD_SAMEDAY", { plnaTier: "PRO", accountType: "FREIGHT_PRO" });
var flat = backoffice(100, "LWB_VAN", "STD_SAMEDAY");
var dpFreeDriver = backoffice(100, "LWB_VAN", "STD_SAMEDAY", { accountType: "FREIGHT_PRO" });
eq("the Pro driver costs the customer nothing extra (V7)",
   dp.money.customerIncVatGbp, dpFreeDriver.money.customerIncVatGbp);
ok("...the Pro ACCOUNT still pays less than a free account, as it should",
   dp.money.customerIncVatGbp < flat.money.customerIncVatGbp);
eq("the Pro account pays 15% — 20 less 5 points", dp.money.networkFeePct, 15);
ok("HAF's fee never goes below the floor of the transport value",
   dp.money.hafMarginGbp >= dp.money.carrierTransportValueGbp * 0.15 - 0.01);
ok("the customer still pays more than the driver is paid",
   dp.money.customerExVatGbp > dp.money.driverPayGbp);
ok("the network pool is still funded", dp.pools.active.totalGbp > 0);

/* ==========================================================================
 * 8e. The levers are actually WIRED into the live app, not just available
 * ======================================================================== */
section("8e. Wiring");

var callers = html.match(/v3Price\([^)]*\)/g) || [];
/* drop the declaration itself — it is the only one naming the parameters */
var invocations = callers.filter(function (c) { return c.indexOf("vanKey") < 0; });
ok("every quote in the app passes the account level through",
   invocations.length >= 3 &&
   invocations.every(function (c) { return /quoteOpts\(/.test(c); }),
   invocations.join(" | "));
ok("a quote with nobody signed in defaults to the free rung",
   /HAF_ACCOUNT_LEVEL\s*=\s*'lite'/.test(html));
ok("signing in sets the account level from the same record as the member badge",
   /_setMyTier[\s\S]{0,400}HAF_ACCOUNT_LEVEL\s*=/.test(html));
ok("the customer engine carries both ladders",
   /DRV_LEVEL\s*=/.test(html) && /ACC_LEVEL\s*=/.test(html));

/* The two ladders must be identical on both sides — one source, not two. */
eq("customer engine member uplift matches the back office",
   CUST.DRV_LEVEL.member.up, M.config.driverLevels.MEMBER.rewardGbpPerMile);
eq("customer engine pro uplift matches the back office",
   CUST.DRV_LEVEL.pro.up, M.config.driverLevels.PRO.rewardGbpPerMile);
eq("customer engine plus reduction matches the back office",
   CUST.ACC_LEVEL.plus.cut * 100, M.config.accountLevels.PLUS.feeReductionPts);
eq("customer engine pro reduction matches the back office",
   CUST.ACC_LEVEL.pro.cut * 100, M.config.accountLevels.PRO.feeReductionPts);
var floorBad = 0;
M.config.jobTypes.forEach(function (jt) {
  var key = { GROUPAGE: null, FLEX_SAMEDAY: "flex", STD_SAMEDAY: "sday",
              TIMED: "timed", URGENT: "urg" }[jt.code];
  if (key && Math.abs(CUST.URG[key].flr * 100 - jt.floorPct) > 0.001) floorBad++;
});
ok("every job-type floor matches on both sides", floorBad === 0, floorBad + " mismatched");

/* ==========================================================================
 * 9. VAT and the pricing snapshot
 * ======================================================================== */
section("9. VAT and audit record");

var vt = backoffice(100, "LWB_VAN", "STD_SAMEDAY");
eq("VAT is 20% of the ex-VAT subtotal", vt.money.vatGbp, vt.money.customerExVatGbp * 0.20);
eq("inc-VAT total adds up", vt.money.customerIncVatGbp,
   vt.money.customerExVatGbp + vt.money.vatGbp);
ok("every quote carries a full audit record",
   vt.version === "MATRIX-V7" && vt.money && vt.reasons && vt.inputs && vt.lane &&
   vt.money.carrierTransportValueGbp != null && vt.money.networkFeeGbp != null &&
   vt.money.hafKeepsPctOfCustomer != null);

/* ==========================================================================
 * 10. FRAMEWORK-V7 — which driver takes the job never changes the price
 *     Brent 2026-08-02. Both engines, swept, because the customer-facing quote
 *     and the back office each hold their own copy of this rule and the last
 *     time they drifted (the urgency premium) nobody noticed for a fortnight.
 * ======================================================================== */
section("10. V7 — the driver never moves the customer's price");

ok("the customer engine has the reward paused too", CUST.DRV_REWARD.on === false);
ok("...and funds it from HAF when it runs", CUST.DRV_REWARD.fundedBy === "HAF", CUST.DRV_REWARD.fundedBy);
eq("...on the same floor share as the back office",
   CUST.DRV_REWARD.floor * 100, M.config.driverReward.minRetainedPctOfCustomer);

var drift = 0, custMoved = 0, boMoved = 0, checked = 0;
["sday", "timed", "urg", "flex"].forEach(function (urg) {
  var jt = { sday: "STD_SAMEDAY", timed: "TIMED", urg: "URGENT", flex: "FLEX_SAMEDAY" }[urg];
  PAIRS.forEach(function (p) {
    [5, 40, 120, 250].forEach(function (mi) {
      var cf = customer(mi, p[0], urg), cp = customer(mi, p[0], urg, { driver: "pro" });
      var bf = backoffice(mi, p[1], jt), bp = backoffice(mi, p[1], jt, { plnaTier: "PRO" });
      if (Math.abs(cf.sub - cp.sub) > 0.01) custMoved++;
      if (Math.abs(bf.money.customerExVatGbp - bp.money.customerExVatGbp) > 0.01) boMoved++;
      if (Math.abs(cf.sub - bf.money.customerExVatGbp) > 0.02) drift++;
      checked++;
    });
  });
});
ok("across " + checked + " quotes the customer page never charges more for a Pro driver",
   custMoved === 0, custMoved + " failures");
ok("...and neither does the back office", boMoved === 0, boMoved + " failures");
ok("...and the two engines still agree on the price to the penny",
   drift === 0, drift + " failures");

/* Switched on, in both engines at once: HAF pays, the customer does not. */
M.applyConfig({ driverReward: { enabled: true, fundedBy: "HAF_MARGIN", minRetainedPctOfCustomer: 8 } });
CUST.DRV_REWARD.on = true;
var cOnFree = customer(100, "lwb", "sday"), cOnPro = customer(100, "lwb", "sday", { driver: "pro" });
var bOnFree = backoffice(100, "LWB_VAN", "STD_SAMEDAY"), bOnPro = backoffice(100, "LWB_VAN", "STD_SAMEDAY", { plnaTier: "PRO" });
eq("switched on, the customer page still quotes one price", cOnPro.sub, cOnFree.sub);
eq("switched on, the back office still quotes one price",
   bOnPro.money.customerExVatGbp, bOnFree.money.customerExVatGbp);
ok("...the Pro driver really is paid more", cOnPro.driverPay > cOnFree.driverPay &&
   bOnPro.money.driverPayGbp > bOnFree.money.driverPayGbp);
ok("...and HAF is the one paying for it",
   bOnPro.money.hafMarginGbp < bOnFree.money.hafMarginGbp &&
   cOnPro.fee < cOnFree.fee);
eq("...both engines fund exactly the same amount", cOnPro.rewardGbp, bOnPro.money.driverRewardGbp);
M.resetConfig(); CUST.DRV_REWARD.on = false;
eq("the suite hands back a paused reward", M.config.driverReward.enabled, false);

console.log("\n" + (fail === 0 ? "ALL PASS" : "FAILURES") + " — " + pass + " passed, " + fail + " failed\n");
process.exit(fail === 0 ? 0 : 1);
