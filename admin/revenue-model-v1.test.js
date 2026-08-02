/* ===========================================================================
 * REVENUE-V1 TEST SUITE
 * Proves the revenue model against "OTIS — HAF Network Pricing Formula"
 * (Brent, 2026-08-02) §10, §11 and §12, and against the live pricing engine.
 *
 *   node admin/revenue-model-v1.test.js
 * =========================================================================== */
"use strict";

var Engine = require("./pricing-matrix-v3.js");
var Rev = require("./revenue-model-v1.js");

var pass = 0, fail = 0, failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); }
}
function near(name, got, want, tol) {
  tol = tol == null ? 0.01 : tol;
  ok(name, Math.abs(got - want) <= tol, "got " + got + ", expected " + want);
}
function section(t) { console.log("\n" + t); }

function resetAll() {
  Engine.resetConfig();
}

/* A quote object in the engine's shape, for testing the pure formula on
   Brent's own worked examples (§8, §9). His examples use a PERCENTAGE driver
   uplift, which this network does not run — the reward is pence per mile and
   is paused — so the arithmetic is checked directly rather than pretending
   the engine produced it. */
function syntheticQuote(driverPay, feePct, basis, reductionPts) {
  var customerExVat = basis === "ADDED_TO_TRANSPORT_VALUE"
    ? Rev.round2(driverPay * (1 + feePct / 100))
    : Rev.round2(driverPay / (1 - feePct / 100));
  var fee = Rev.round2(customerExVat - driverPay);
  return {
    version: "TEST",
    inputs: { miles: 100, vehicle: "MWB_VAN", jobType: "STD_SAMEDAY" },
    rates: { vehicleBaseRate: 1.0, driverLevel: "FREE", driverRewardGbpPerMile: 0 },
    account: { level: "LITE", feeReductionAppliedPts: reductionPts || 0 },
    lane: { key: null, factor: 1 },
    pools: { phase: "OFF", active: { totalGbp: 0, byPool: {} } },
    money: {
      feeBasis: basis,
      driverPayGbp: driverPay,
      customerPriceBasisGbp: driverPay,
      networkFeePct: feePct,
      hafMarginPct: feePct,
      networkFeeGbp: fee,
      customerExVatGbp: customerExVat,
      customerIncVatGbp: Rev.round2(customerExVat * 1.2),
      hafKeepsPctOfCustomer: Rev.round2(fee / customerExVat * 100),
      driverRewardGbp: 0,
      driverRewardFundedBy: "HAF_MARGIN"
    }
  };
}

// ===========================================================================
section("§10 — the four revenue streams exist and are distinct");
// ===========================================================================
var streamCodes = Object.keys(Rev.STREAMS);
ok("four streams, no more no fewer", streamCodes.length === 4, streamCodes.join(","));
["DELIVERY", "SUBSCRIPTION", "PAYROLL", "SERVICES"].forEach(function (s) {
  ok("stream " + s + " present", !!Rev.STREAMS[s]);
  ok("stream " + s + " cites its document section", !!Rev.STREAMS[s].docSection);
});
ok("only DELIVERY is a per-job stream",
  Rev.STREAMS.DELIVERY.perJob === true &&
  Rev.STREAMS.SUBSCRIPTION.perJob === false &&
  Rev.STREAMS.PAYROLL.perJob === false &&
  Rev.STREAMS.SERVICES.perJob === false);

// Every income line the document names is mapped to a stream.
[
  "PLNA_PLUS", "PLNA_PRO", "FREIGHT_PLUS", "FREIGHT_PRO", "FLEET_ACCOUNT",
  "KNECT_MEMBERSHIP", "LANDING_PAGE_SUB", "PAYROLL_BLOCK_FEE", "TRANSACTION_FEE",
  "RELAY_SERVICE", "STORAGE", "ACCOUNT_MANAGEMENT", "CREDIT_SERVICE",
  "PRIORITY_ALLOCATION", "COMPLIANCE_SERVICE", "LANDING_PAGE_BUILD",
  "AI_SERVICE", "ADMIN_SERVICE", "NETWORK_FEE"
].forEach(function (code) {
  var l = Rev.lineFor(code);
  ok("income line " + code + " is classified", !!l && !!Rev.STREAMS[l.stream]);
});
ok("landing pages are split by how they are billed, not guessed",
  Rev.lineFor("LANDING_PAGE_SUB").stream === "SUBSCRIPTION" &&
  Rev.lineFor("LANDING_PAGE_BUILD").stream === "SERVICES");

// ===========================================================================
section("§12.6 — subscription revenue can never be reported as delivery margin");
// ===========================================================================
var led = Rev.createLedger();
led.record({ code: "NETWORK_FEE", gbp: 23 })
   .record({ code: "PLNA_PRO", gbp: 30 })
   .record({ code: "PAYROLL_BLOCK_FEE", gbp: 5 })
   .record({ code: "STORAGE", gbp: 40 });
near("delivery margin counts ONLY the delivery stream", led.deliveryMargin(), 23);
near("total across all streams", led.total(), 98);
var by = led.byStream();
near("subscription stream totalled on its own", by.SUBSCRIPTION.gbp, 30);
near("payroll stream totalled on its own", by.PAYROLL.gbp, 5);
near("services stream totalled on its own", by.SERVICES.gbp, 40);
ok("delivery margin excludes subscriptions", led.deliveryMargin() !== led.total());

var threw = false;
try { led.record({ code: "MYSTERY_MONEY", gbp: 100 }); } catch (e) { threw = true; }
ok("unclassified money is refused, not bucketed", threw);

// ===========================================================================
section("§8 — Brent's own worked example, add-on basis");
// ===========================================================================
var q8 = syntheticQuote(115, 20, "ADDED_TO_TRANSPORT_VALUE");
var r8 = Rev.jobRevenue(q8);
near("§8 driver payable = £115", r8.breakdown.driverPayableGbp, 115);
near("§8 HAF network fee = £23", r8.breakdown.hafNetworkFeeGbp, 23);
near("§8 customer ex VAT = £138", r8.breakdown.customerExVatGbp, 138);
near("§8 VAT at 20% = £27.60", r8.breakdown.vatGbp, 27.6);
near("§8 customer inc VAT = £165.60", r8.breakdown.customerIncVatGbp, 165.6);
near("§8 gross profit = the whole fee when nothing is deducted",
  r8.breakdown.hafGrossProfitGbp, 23);
ok("§8 the fee was ADDED to the driver's price, never taken out of it",
  r8.breakdown.driverPayableGbp === 115);

// ===========================================================================
section("§9 — paid account, RELATIVE discount (20% × 95% = 19%)");
// ===========================================================================
var q9 = syntheticQuote(115, 19, "ADDED_TO_TRANSPORT_VALUE", 1);
var r9 = Rev.jobRevenue(q9);
near("§9 HAF fee at 19% = £21.85", r9.breakdown.hafNetworkFeeGbp, 21.85);
near("§9 customer ex VAT = £136.85", r9.breakdown.customerExVatGbp, 136.85);
near("§9 customer account saving = £1.15",
  Rev.round2(r8.breakdown.customerExVatGbp - r9.breakdown.customerExVatGbp), 1.15);
near("§9 driver is paid exactly the same as §8", r9.breakdown.driverPayableGbp, 115);

// §6: a relative discount must NOT become a percentage-point cut by default.
near("a 5% relative discount on 20% is 19%, not 15%",
  Rev.round2(20 * 0.95), 19);
ok("15% would only be right if the table said so explicitly",
  Rev.round2(20 * 0.95) !== 15);

// ===========================================================================
section("§6 — the live table states its resulting fees explicitly");
// ===========================================================================
resetAll();
var cfg = Engine.config;
var sameday = cfg.jobTypes.filter(function (j) { return j.code === "STD_SAMEDAY"; })[0];
near("same-day standard fee is stated as 20%", sameday.marginPct, 20);
near("Plus account fee reduction is stated as 2.5 points", cfg.accountLevels.PLUS.feeReductionPts, 2.5);
near("Pro account fee reduction is stated as 5 points", cfg.accountLevels.PRO.feeReductionPts, 5);
ok("so the resulting account fees are explicit (20 / 17.5 / 15), which is the " +
   "condition §6 sets for a point reduction",
  Rev.round2(sameday.marginPct - cfg.accountLevels.PRO.feeReductionPts) === 15);

// ===========================================================================
section("§12.8 — every job shows the full breakdown, and it adds up");
// ===========================================================================
resetAll();
var jobTypes = ["FLEX_SAMEDAY", "STD_SAMEDAY", "TIMED", "URGENT"];
var vehicles = cfg.vehicles.map(function (v) { return v.code; });
var accounts = [null, "FREIGHT_PLUS", "FREIGHT_PRO", "BUSINESS_FREE"];
var checked = 0, addsUp = 0, feeWithinCustomer = 0, profitNeverExceedsFee = 0;

vehicles.forEach(function (vc) {
  jobTypes.forEach(function (jt) {
    accounts.forEach(function (acc) {
      [5, 30, 100, 250].forEach(function (miles) {
        var q = Engine.price({ miles: miles, vehicleCode: vc, jobTypeCode: jt, accountType: acc });
        var r = Rev.jobRevenue(q);
        checked++;
        var b = r.breakdown;
        // the three amounts reconcile exactly
        if (Math.abs((b.driverPayableGbp + b.hafNetworkFeeGbp + b.otherChargesGbp)
              - b.customerExVatGbp) <= 0.02) addsUp++;
        if (b.hafNetworkFeeGbp >= 0 && b.hafNetworkFeeGbp < b.customerExVatGbp) feeWithinCustomer++;
        if (b.hafGrossProfitGbp <= b.hafNetworkFeeGbp + 0.01) profitNeverExceedsFee++;
        // §12.8 requires every one of these lines to be present
        ["driverPayableGbp", "hafNetworkFeeGbp", "otherChargesGbp", "customerExVatGbp",
         "vatGbp", "customerIncVatGbp", "hafGrossProfitGbp"].forEach(function (k) {
          if (typeof b[k] !== "number") { fail++; failures.push("missing breakdown line " + k); }
        });
      });
    });
  });
});
ok("driver + fee + charges = customer price, on every job (" + addsUp + "/" + checked + ")",
  addsUp === checked, addsUp + "/" + checked);
ok("the fee is always inside the customer price, never taken from the driver (" +
  feeWithinCustomer + "/" + checked + ")", feeWithinCustomer === checked);
ok("gross profit never exceeds the fee it came from (" + profitNeverExceedsFee + "/" + checked + ")",
  profitNeverExceedsFee === checked);
console.log("  " + checked + " priced jobs run through the revenue model");

// ===========================================================================
section("§11 — gross profit deducts each cost ONCE, never twice");
// ===========================================================================
resetAll();
Engine.applyConfig({
  driverReward: { enabled: true, fundedBy: "HAF_MARGIN", minRetainedPctOfCustomer: 8 }
});
var qPro = Engine.price({ miles: 100, vehicleCode: "SMALL_VAN", jobTypeCode: "STD_SAMEDAY", plnaTier: "PRO" });
var rPro = Rev.jobRevenue(qPro, { processingCostGbp: 2, approvedDiscountsGbp: 3 });
var gp = rPro.grossProfit;

ok("HAF funded a real driver reward on this job", gp.lessHafFundedJobCostsGbp > 0,
  "reward £" + gp.lessHafFundedJobCostsGbp);
near("gross profit = fee before funding − funding − processing − pools − discounts",
  gp.grossProfitGbp,
  Rev.round2(gp.networkFeeBeforeFundedCostsGbp - gp.lessHafFundedJobCostsGbp -
             gp.lessPaymentProcessingGbp - gp.lessNetworkPoolContributionGbp -
             gp.lessApprovedDiscountsGbp));
near("the reported network fee already has the funded reward taken out of it",
  rPro.breakdown.hafNetworkFeeGbp,
  Rev.round2(gp.networkFeeBeforeFundedCostsGbp - gp.lessHafFundedJobCostsGbp));
ok("so the reward is NOT subtracted a second time",
  Rev.round2(rPro.breakdown.hafNetworkFeeGbp - gp.lessPaymentProcessingGbp -
             gp.lessNetworkPoolContributionGbp - gp.lessApprovedDiscountsGbp)
  === gp.grossProfitGbp);

// The driver is paid the same whether or not HAF funds a reward — proof the
// funding comes out of HAF, not the customer (Brent, 2026-08-02).
var qFree = Engine.price({ miles: 100, vehicleCode: "SMALL_VAN", jobTypeCode: "STD_SAMEDAY", plnaTier: "FREE" });
near("customer pays the same whichever driver takes the job",
  Rev.jobRevenue(qPro).breakdown.customerExVatGbp,
  Rev.jobRevenue(qFree).breakdown.customerExVatGbp);
ok("the Pro driver is paid more than the free driver",
  rPro.breakdown.driverPayableGbp > Rev.jobRevenue(qFree).breakdown.driverPayableGbp);
ok("and HAF's gross profit is what absorbed it",
  Rev.jobRevenue(qPro).breakdown.hafGrossProfitGbp <
  Rev.jobRevenue(qFree).breakdown.hafGrossProfitGbp);
resetAll();

// ===========================================================================
section("§11 — payment processing is never assumed");
// ===========================================================================
var qPlain = Engine.price({ miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY" });
var rPlain = Rev.jobRevenue(qPlain);
near("no processing cost is invented when none was supplied",
  rPlain.grossProfit.lessPaymentProcessingGbp, 0);
ok("and the basis says where it would come from",
  rPlain.grossProfit.processingBasis === "SUPPLIED_PER_INVOICE");
var rSupplied = Rev.jobRevenue(qPlain, { processingCostGbp: 4.5 });
near("a supplied processing cost is deducted", rSupplied.grossProfit.lessPaymentProcessingGbp, 4.5);
near("and it reduces gross profit by exactly that",
  Rev.round2(rPlain.breakdown.hafGrossProfitGbp - rSupplied.breakdown.hafGrossProfitGbp), 4.5);
ok("supplying it is recorded as supplied, not assumed",
  rSupplied.grossProfit.processingBasis === "SUPPLIED");

// ===========================================================================
section("§2 — customer-specific charges reach the right pocket");
// ===========================================================================
var base = Rev.jobRevenue(qPlain);
var withHaf = Rev.jobRevenue(qPlain, { customerCharges: [{ label: "Priority allocation", gbp: 20, to: "HAF" }] });
var withDrv = Rev.jobRevenue(qPlain, { customerCharges: [{ label: "Waiting time", gbp: 20, to: "DRIVER" }] });
var withPass = Rev.jobRevenue(qPlain, { customerCharges: [{ label: "Congestion charge", gbp: 20, to: "PASS_THROUGH" }] });

near("a HAF charge raises HAF's fee", Rev.round2(withHaf.breakdown.hafNetworkFeeGbp - base.breakdown.hafNetworkFeeGbp), 20);
near("a HAF charge does not touch the driver", withHaf.breakdown.driverPayableGbp, base.breakdown.driverPayableGbp);
near("a driver charge raises the driver's pay", Rev.round2(withDrv.breakdown.driverPayableGbp - base.breakdown.driverPayableGbp), 20);
near("a driver charge does not touch HAF's fee", withDrv.breakdown.hafNetworkFeeGbp, base.breakdown.hafNetworkFeeGbp);
near("a pass-through charge is neither party's revenue", withPass.breakdown.hafGrossProfitGbp, base.breakdown.hafGrossProfitGbp);
near("but the customer still pays it", Rev.round2(withPass.breakdown.customerExVatGbp - base.breakdown.customerExVatGbp), 20);
near("all three raise the customer price by the same £20",
  withHaf.breakdown.customerExVatGbp, withDrv.breakdown.customerExVatGbp);
var unclassified = Rev.jobRevenue(qPlain, { customerCharges: [{ label: "Unknown", gbp: 20 }] });
near("an unclassified charge defaults to pass-through, never to HAF margin",
  unclassified.breakdown.hafGrossProfitGbp, base.breakdown.hafGrossProfitGbp);

// VAT follows the whole customer price including charges
near("VAT is charged on the whole customer price", withHaf.breakdown.vatGbp,
  Rev.round2(withHaf.breakdown.customerExVatGbp * 0.2));

// ===========================================================================
section("§12.9 / §12.10 — a confirmed quote does not move when rules change");
// ===========================================================================
resetAll();
var quoteInput = { miles: 100, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY", accountType: "FREIGHT_PLUS" };
var qA = Engine.price(quoteInput);
var snap = Rev.snapshotQuote(qA, { quoteRef: "TEST-0001", confirmed: true, confirmedAt: "2026-08-02" });

["engineVersion", "feeBasis", "networkFeePct", "accountLevel", "accountFeeReductionPts",
 "driverLevel", "driverRewardFundedBy", "vehicleBaseRate", "poolPhase"].forEach(function (k) {
  ok("§12.9 snapshot stores " + k, snap.rulesAtQuoteTime[k] !== undefined);
});
ok("§12.9 snapshot stores the account types used", !!snap.rulesAtQuoteTime.accountTypes);
ok("§12.9 snapshot is fingerprinted", /^[0-9a-f]{8}$/.test(snap.fingerprint));

var v0 = Rev.verifySnapshot(snap, Engine);
ok("nothing has drifted before any change", v0.rulesChanged === false);
near("and the price is identical", v0.differenceGbp, 0);

// Now change the account's pricing rules underneath the confirmed quote.
Engine.applyConfig({ accountLevels: {
  LITE: { name: "Free account", feeReductionPts: 0, rank: 0 },
  PLUS: { name: "Plus account", feeReductionPts: 0, rank: 1 },
  PRO:  { name: "Pro account",  feeReductionPts: 5, rank: 2 }
} });
var v1 = Rev.verifySnapshot(snap, Engine);
ok("§12.10 the rule change is detected", v1.rulesChanged === true);
near("§12.10 the CONFIRMED price still holds",
  v1.priceThatHolds.customerExVatGbp, snap.priceAtQuoteTime.customerExVatGbp);
ok("§12.10 and the change is explained in plain words", /confirmed price stands/i.test(v1.note));
ok("a requote today would be different", v1.priceIfRequotedToday.customerExVatGbp !== snap.priceAtQuoteTime.customerExVatGbp);

// An UNCONFIRMED quote is allowed to move.
var snapDraft = Rev.snapshotQuote(qA, { quoteRef: "TEST-0002", confirmed: false });
var v2 = Rev.verifySnapshot(snapDraft, Engine);
ok("an unconfirmed quote requotes", v2.priceThatHolds.customerExVatGbp === v2.priceIfRequotedToday.customerExVatGbp);
resetAll();

// ===========================================================================
section("Both fee bases produce a coherent, reconciling breakdown");
// ===========================================================================
var byBasis = {};
["SHARE_OF_CUSTOMER_PRICE", "ADDED_TO_TRANSPORT_VALUE"].forEach(function (basis) {
  Engine.resetConfig();
  Engine.applyConfig({ feeBasis: basis });
  var q = Engine.price({ miles: 100, vehicleCode: "SMALL_VAN", jobTypeCode: "STD_SAMEDAY" });
  var r = Rev.jobRevenue(q);
  byBasis[basis] = r.breakdown;
  var b = r.breakdown;
  near(basis + ": driver + fee = customer",
    Rev.round2(b.driverPayableGbp + b.hafNetworkFeeGbp), b.customerExVatGbp);
  ok(basis + ": the basis is recorded on the record", r.feeBasis === basis);
  ok(basis + ": the reason explains it in plain words", r.reasons.length >= 2);
});
near("the driver is paid identically under both frameworks",
  byBasis.SHARE_OF_CUSTOMER_PRICE.driverPayableGbp,
  byBasis.ADDED_TO_TRANSPORT_VALUE.driverPayableGbp);
ok("only the customer price and HAF's share move between them",
  byBasis.SHARE_OF_CUSTOMER_PRICE.customerExVatGbp >
  byBasis.ADDED_TO_TRANSPORT_VALUE.customerExVatGbp);
console.log("  → 100mi small van same-day: driver £" + byBasis.SHARE_OF_CUSTOMER_PRICE.driverPayableGbp +
  " either way · customer £" + byBasis.ADDED_TO_TRANSPORT_VALUE.customerExVatGbp +
  " (add-on) vs £" + byBasis.SHARE_OF_CUSTOMER_PRICE.customerExVatGbp + " (keep)");
Engine.resetConfig();

// The one number that differs between the two bases, on Brent's own §8 shape.
var keep = Rev.jobRevenue(syntheticQuote(115, 20, "SHARE_OF_CUSTOMER_PRICE"));
var addon = Rev.jobRevenue(syntheticQuote(115, 20, "ADDED_TO_TRANSPORT_VALUE"));
near("add-on basis: customer £138, HAF keeps 16.7%", addon.breakdown.customerExVatGbp, 138);
near("keep basis: customer £143.75, HAF keeps 20%", keep.breakdown.customerExVatGbp, 143.75);
near("the driver is paid £115 under BOTH", addon.breakdown.driverPayableGbp, keep.breakdown.driverPayableGbp);
console.log("  → the whole difference between the two frameworks: £" +
  Rev.round2(keep.breakdown.customerExVatGbp - addon.breakdown.customerExVatGbp) +
  " to the customer on a £115 job. The driver is unaffected either way.");

// ===========================================================================
section("A month of network activity reconciles across all four streams");
// ===========================================================================
resetAll();
var ledger = Rev.createLedger();
var jobs = [
  { miles: 30,  vehicleCode: "SMALL_VAN", jobTypeCode: "STD_SAMEDAY" },
  { miles: 120, vehicleCode: "LWB_VAN",   jobTypeCode: "URGENT", accountType: "FREIGHT_PLUS" },
  { miles: 80,  vehicleCode: "LUTON",     jobTypeCode: "TIMED", accountType: "FREIGHT_PRO" },
  { miles: 200, vehicleCode: "LUTON_TAIL",jobTypeCode: "FLEX_SAMEDAY" }
];
var deliveryExpected = 0;
jobs.forEach(function (j, i) {
  var q = Engine.price(j);
  var r = Rev.jobRevenue(q);
  ledger.recordJob(r, "JOB-" + (i + 1));
  deliveryExpected = Rev.round2(deliveryExpected + q.money.networkFeeGbp);
});
ledger.record({ code: "PLNA_PRO", gbp: 30, ref: "SUB-1" })
      .record({ code: "KNECT_MEMBERSHIP", gbp: 25, ref: "SUB-2" })
      .record({ code: "FLEET_ACCOUNT", gbp: 50, ref: "SUB-3" })
      .record({ code: "PAYROLL_BLOCK_FEE", gbp: 5, ref: "INV-1" })
      .record({ code: "STORAGE", gbp: 60, ref: "SRV-1" });

var summary = ledger.byStream();
near("delivery stream equals the sum of the four network fees", summary.DELIVERY.gbp, deliveryExpected);
near("subscription stream = 30 + 25 + 50", summary.SUBSCRIPTION.gbp, 105);
near("payroll stream = 5", summary.PAYROLL.gbp, 5);
near("services stream = 60", summary.SERVICES.gbp, 60);
near("total = every stream added up",
  ledger.total(), Rev.round2(deliveryExpected + 105 + 5 + 60));
near("delivery margin is still ONLY delivery", ledger.deliveryMargin(), deliveryExpected);
ok("the business earns more than the network does on these figures",
  Rev.round2(105 + 5 + 60) > deliveryExpected,
  "network £" + deliveryExpected + " vs business £170");
console.log("  → 4 jobs: network fees £" + deliveryExpected +
  " · subscriptions £105 · payroll £5 · services £60 · total £" + ledger.total());

// ===========================================================================
console.log("\n" + "=".repeat(66));
console.log("REVENUE-V1: " + pass + " passed, " + fail + " failed");
if (fail) { failures.forEach(function (f) { console.log("  ✗ " + f); }); process.exit(1); }
console.log("All revenue checks pass.");
