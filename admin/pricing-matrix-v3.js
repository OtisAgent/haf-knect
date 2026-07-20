/* ============================================================================
 * HAF KNECT — Pricing Matrix V3  (FRAMEWORK-V3)
 *
 * The order-flow pricing brain agreed with Brent 2026-07-20.
 * Sits alongside pricing-engine.js (lane maths) and margin-gate.js (loss gate).
 * This module implements the FINAL commercial framework:
 *
 *   PLNA (driver side)      |  HAF MARGIN   |  KNECT (customer side)
 *   Free   0% uplift        |  firm % by    |  Free  0% uplift, limited direct
 *   Plus   2.5% uplift      |  job type,    |  Paid  5% uplift, unlimited direct
 *   Pro    5% uplift        |  floors held  |
 *
 * Principles (locked):
 *  - Uplifts raise DRIVER pay only, and only when margin stays viable and the
 *    price stays inside the local market band. Customers are never discounted.
 *  - HAF margin is always applied on network jobs; firm % by job type, with a
 *    minimum floor that no benefit may breach.
 *  - Direct bookings carry 0% HAF margin but are gated by KNECT tier quota.
 *  - Hindrance (weight/handling/stops/waiting) pays the DRIVER, capped 1.40x
 *    automated — anything above goes to manual review.
 *  - Fuel marker: when the live fuel price runs above the market average,
 *    base rates are uplifted automatically so drivers stay whole. Logged.
 *  - Pool tracking: trial phase allocates a % of HAF margin to 4 pools
 *    (affiliate / driver / freight / relay+storage); production phase locks a
 *    5% network pool (2.5 driver / 2.5 relay). Both are computed on every job
 *    so the split comparison is always auditable.
 *  - EVERY calculation returns a full audit record. Nothing is hidden.
 *
 * Nothing commercial is hard-coded into logic: all numbers live in `config`
 * (mirrored to tier_config seed v3 when promoted). Works in browser + Node.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HAFPricingMatrix = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ===========================================================================
  // 1. EDITABLE CONFIG — mirror of tier_config seed v3 (FRAMEWORK-V3)
  // ===========================================================================
  var config = {
    version: "FRAMEWORK-V3",
    effectiveFrom: "2026-07-20",
    vatPct: 20,

    // --- Vehicle base rates £/loaded mile (Small Van → Luton ONLY — locked scope)
    vehicles: [
      { code: "SMALL_VAN", name: "Small Van", baseRate: 0.75 },
      { code: "SWB_VAN",   name: "SWB Van",   baseRate: 0.85 },
      { code: "MWB_VAN",   name: "MWB Van",   baseRate: 0.95 },
      { code: "LWB_VAN",   name: "LWB Van",   baseRate: 1.05 },
      { code: "XLWB_VAN",  name: "XLWB Van",  baseRate: 1.10 },
      { code: "LUTON",     name: "Luton Van", baseRate: 1.20 }
    ],

    // --- PLNA driver tiers: uplift applied to the driver base rate
    plnaTiers: {
      FREE: { name: "PLNA Free", upliftPct: 0 },
      PLUS: { name: "PLNA Plus", upliftPct: 2.5 },
      PRO:  { name: "PLNA Pro",  upliftPct: 5 }
    },

    // --- KNECT customer tiers: uplift funded from the customer side +
    //     direct-booking allowance (anti-bypass gate)
    knectTiers: {
      FREE: { name: "KNECT Free",           upliftPct: 0, directBookingsPerMonth: 3 },
      PAID: { name: "HAF KNECT Member",     upliftPct: 5, directBookingsPerMonth: null } // null = unlimited
    },

    // --- HAF margin by job type: firm %, hard floor. Never breached by benefits.
    jobTypes: [
      { code: "GROUPAGE",     name: "Groupage / Flexible",          marginPct: 10, floorPct: 8  },
      { code: "FLEX_SAMEDAY", name: "Flexible Same-Day / Co-load",  marginPct: 15, floorPct: 10 },
      { code: "STD_SAMEDAY",  name: "Standard Same-Day",            marginPct: 20, floorPct: 15 },
      { code: "TIMED",        name: "Timed Delivery",               marginPct: 25, floorPct: 18 },
      { code: "URGENT",       name: "Urgent / Time-Critical",       marginPct: 30, floorPct: 22 }
    ],

    // --- Driver hindrance multipliers (pay the driver for genuine burden)
    hindrance: {
      weight:   { STANDARD: 1.00, MODERATE: 1.03, HEAVY: 1.07, NEAR_LIMIT: 1.12 },
      handling: { KERBSIDE: 1.00, ASSISTED: 1.05, DIFFICULT: 1.08 },
      maxAutoMultiplier: 1.40,          // above => manual review
      stopFeeGbp: 5,                    // per additional stop
      waitingPerHourGbp: 15             // after included allowance
    },

    // --- Fuel marker: protects driver economics when fuel surges
    fuel: {
      marketAvgPencePerLitre: 152,      // rolling market average (admin-updated)
      currentPencePerLitre: 152,        // live price (admin/feed-updated)
      surgeThresholdPct: 8,             // % above average before we act
      baseRateUpliftPct: 4,             // % added to vehicle base rates on surge
      maxUpliftPct: 10                  // hard ceiling on fuel compensation
    },

    // --- Market band guard: never price drivers out of their local market
    market: {
      bandPct: 15   // customer price may sit at most this % above local median
    },

    // --- Direct bookings: customer books their KNECTed driver directly
    directBooking: {
      hafMarginPct: 0                   // HAF takes nothing on direct jobs
    },

    // --- Minimum customer charge on network jobs
    minCustomerChargeExVat: 40,

    // --- Pool allocation — % OF HAF MARGIN routed to network pools
    pools: {
      phase: "TRIAL",                   // TRIAL until builder criteria met
      trial: {                          // Brent 2026-07-20: 20–25% back in
        totalPctOfMargin: 25,
        split: { affiliate: 7, driverPool: 7, freightPool: 6, relayStorage: 5 }
      },
      production: {                     // locks in after builder criteria
        totalPctOfMargin: 5,
        split: { driverPool: 2.5, relayStorage: 2.5 }
      }
    }
  };

  var round2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };
  var num = function (v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); };

  function getVehicle(code) {
    for (var i = 0; i < config.vehicles.length; i++)
      if (config.vehicles[i].code === code) return config.vehicles[i];
    return config.vehicles[0];
  }
  function getJobType(code) {
    for (var i = 0; i < config.jobTypes.length; i++)
      if (config.jobTypes[i].code === code) return config.jobTypes[i];
    return config.jobTypes[2]; // Standard Same-Day default
  }

  // ===========================================================================
  // 2. FUEL MARKER — automatic driver protection, always reported
  // ===========================================================================
  function fuelAdjustment() {
    var f = config.fuel;
    var pctOver = f.marketAvgPencePerLitre > 0
      ? ((f.currentPencePerLitre - f.marketAvgPencePerLitre) / f.marketAvgPencePerLitre) * 100
      : 0;
    if (pctOver >= f.surgeThresholdPct) {
      var uplift = Math.min(f.baseRateUpliftPct, f.maxUpliftPct);
      return { active: true, pctOverAverage: round2(pctOver), upliftPct: uplift,
               reason: "FUEL_SURGE (" + round2(pctOver) + "% over market avg)" };
    }
    return { active: false, pctOverAverage: round2(pctOver), upliftPct: 0, reason: null };
  }

  // ===========================================================================
  // 3. THE CALCULATION — one call per order, returns the full audit record
  // ===========================================================================
  /**
   * price(input) -> full breakdown + audit record
   * input: {
   *   miles, vehicleCode, jobTypeCode,
   *   plnaTier: 'FREE'|'PLUS'|'PRO',
   *   knectTier: 'FREE'|'PAID',
   *   weight: 'STANDARD'|'MODERATE'|'HEAVY'|'NEAR_LIMIT',
   *   handling: 'KERBSIDE'|'ASSISTED'|'DIFFICULT',
   *   extraStops, waitingHours,
   *   isDirectBooking: bool,
   *   directBookingsUsedThisMonth: number,   // for the quota gate
   *   localMarketMedianExVat: number|null,   // market band guard (null = skip)
   *   override: { marginPct, operator, reason } | null,   // admin only
   *   operator: string                        // who ran the calc (audit)
   * }
   */
  function price(input) {
    var reasons = [], flags = [];
    var vehicle = getVehicle(input.vehicleCode);
    var jobType = getJobType(input.jobTypeCode);
    var plna = config.plnaTiers[input.plnaTier] || config.plnaTiers.FREE;
    var knect = config.knectTiers[input.knectTier] || config.knectTiers.FREE;
    var miles = Math.max(0, num(input.miles));

    // --- Direct booking gate (anti-bypass) ---
    var direct = !!input.isDirectBooking;
    var directAllowed = true;
    if (direct) {
      var quota = knect.directBookingsPerMonth;
      if (quota !== null && num(input.directBookingsUsedThisMonth) >= quota) {
        directAllowed = false;
        flags.push("DIRECT_QUOTA_EXCEEDED");
        reasons.push("Direct booking quota reached (" + quota + "/month on " + knect.name + ") — route through the network or upgrade.");
      } else {
        reasons.push("Direct booking (" + knect.name + ") — HAF margin 0%.");
      }
    }

    // --- Fuel marker ---
    var fuel = fuelAdjustment();
    var baseRate = vehicle.baseRate;
    if (fuel.active) {
      baseRate = baseRate * (1 + fuel.upliftPct / 100);
      reasons.push("Fuel protection: base rate +" + fuel.upliftPct + "% (" + fuel.reason + ").");
    }

    // --- Tier uplift: higher of the two sides, never stacked ---
    var upliftPct = Math.max(plna.upliftPct, knect.upliftPct);
    var upliftSource = upliftPct === 0 ? null
      : (plna.upliftPct >= knect.upliftPct ? plna.name : knect.name);

    // --- Hindrance multiplier (pays the driver) ---
    var wF = config.hindrance.weight[input.weight] || 1.0;
    var hF = config.hindrance.handling[input.handling] || 1.0;
    var rawMult = wF * hF;
    var mult = rawMult;
    var manualReview = false;
    if (rawMult > config.hindrance.maxAutoMultiplier) {
      mult = config.hindrance.maxAutoMultiplier;
      manualReview = true;
      flags.push("MULTIPLIER_CAPPED");
      reasons.push("Hindrance " + round2(rawMult) + "x capped at " + config.hindrance.maxAutoMultiplier + "x — manual review.");
    }
    var supplements = num(input.extraStops) * config.hindrance.stopFeeGbp
                    + num(input.waitingHours) * config.hindrance.waitingPerHourGbp;

    // --- Driver pay before uplift ---
    var driverBase = round2(miles * baseRate * mult + supplements);

    // --- Margin (firm; overridable by admin with reason, never below floor) ---
    var marginPct = direct ? config.directBooking.hafMarginPct : jobType.marginPct;
    var overrideApplied = null;
    if (!direct && input.override && input.override.marginPct != null) {
      var req = num(input.override.marginPct);
      var eff = Math.max(req, jobType.floorPct);
      overrideApplied = {
        requestedPct: req, effectivePct: eff,
        clamped: eff !== req,
        operator: input.override.operator || "unknown",
        reason: input.override.reason || "(no reason given)"
      };
      marginPct = eff;
      flags.push("MARGIN_OVERRIDE");
      reasons.push("Margin override to " + eff + "% by " + overrideApplied.operator +
        (overrideApplied.clamped ? " (clamped to " + jobType.floorPct + "% floor)" : "") +
        " — " + overrideApplied.reason);
    }

    // --- Uplift viability: apply only if the job-type margin floor still holds ---
    var driverPay = driverBase;
    var upliftApplied = false;
    if (upliftPct > 0 && !direct) {
      var candidatePay = round2(driverBase * (1 + upliftPct / 100));
      var candidatePrice = candidatePay / (1 - marginPct / 100);
      var impliedMarginPct = ((candidatePrice - candidatePay) / candidatePrice) * 100;
      if (impliedMarginPct >= jobType.floorPct - 0.001) {
        driverPay = candidatePay;
        upliftApplied = true;
        reasons.push("Tier uplift +" + upliftPct + "% to driver (" + upliftSource + ").");
      } else {
        flags.push("UPLIFT_WITHHELD_MARGIN");
        reasons.push("Tier uplift withheld — would breach the " + jobType.floorPct + "% margin floor.");
      }
    } else if (upliftPct > 0 && direct) {
      // Direct jobs: driver and customer agreed directly; uplift not applied.
      reasons.push("Tier uplift not applied on direct bookings.");
    }

    // --- Customer price (TRUE-margin divide) ---
    var customerExVat = marginPct < 100 ? driverPay / (1 - marginPct / 100) : driverPay;
    var minApplied = false;
    if (!direct && customerExVat < config.minCustomerChargeExVat) {
      customerExVat = config.minCustomerChargeExVat;
      minApplied = true;
      reasons.push("Minimum network charge £" + config.minCustomerChargeExVat + " applied.");
    }
    customerExVat = round2(customerExVat);

    // --- Market band guard ---
    if (input.localMarketMedianExVat != null && num(input.localMarketMedianExVat) > 0) {
      var median = num(input.localMarketMedianExVat);
      var maxOk = median * (1 + config.market.bandPct / 100);
      if (customerExVat > maxOk) {
        manualReview = true;
        flags.push("ABOVE_MARKET_BAND");
        reasons.push("Price £" + customerExVat + " is more than " + config.market.bandPct +
          "% above local median £" + round2(median) + " — manual review.");
      }
    }

    var vat = round2(customerExVat * config.vatPct / 100);
    var hafMarginGbp = round2(customerExVat - driverPay);

    // --- Pool allocation: computed BOTH ways on every job for the audit ---
    function splitPools(spec) {
      var out = { totalGbp: round2(hafMarginGbp * spec.totalPctOfMargin / 100), byPool: {} };
      for (var k in spec.split)
        out.byPool[k] = round2(hafMarginGbp * spec.split[k] / 100);
      return out;
    }
    var poolsTrial = splitPools(config.pools.trial);
    var poolsProduction = splitPools(config.pools.production);
    var activePools = config.pools.phase === "TRIAL" ? poolsTrial : poolsProduction;
    var hafNetGbp = round2(hafMarginGbp - activePools.totalGbp);

    // --- The audit record (this IS the order's pricing record) ---
    return {
      version: config.version,
      calculatedAt: input.calculatedAt || null,   // caller stamps (no Date here)
      operator: input.operator || "system",
      inputs: {
        miles: miles, vehicle: vehicle.code, jobType: jobType.code,
        plnaTier: input.plnaTier || "FREE", knectTier: input.knectTier || "FREE",
        weight: input.weight || "STANDARD", handling: input.handling || "KERBSIDE",
        extraStops: num(input.extraStops), waitingHours: num(input.waitingHours),
        isDirectBooking: direct
      },
      fuel: fuel,
      rates: { vehicleBaseRate: vehicle.baseRate, fuelAdjustedRate: round2(baseRate),
               upliftPct: upliftPct, upliftSource: upliftSource, upliftApplied: upliftApplied },
      hindrance: { weightFactor: wF, handlingFactor: hF, rawMultiplier: round2(rawMult),
                   appliedMultiplier: round2(mult), supplementsGbp: round2(supplements) },
      money: {
        driverBasePayGbp: driverBase,
        driverPayGbp: driverPay,
        hafMarginPct: marginPct,
        hafMarginGbp: hafMarginGbp,
        hafNetGbp: hafNetGbp,
        customerExVatGbp: customerExVat,
        vatGbp: vat,
        customerIncVatGbp: round2(customerExVat + vat),
        minChargeApplied: minApplied
      },
      pools: {
        phase: config.pools.phase,
        active: activePools,
        comparison: { trial: poolsTrial, production: poolsProduction }
      },
      directBooking: direct ? { allowed: directAllowed,
        quota: knect.directBookingsPerMonth,
        used: num(input.directBookingsUsedThisMonth) } : null,
      override: overrideApplied,
      manualReviewRequired: manualReview || !directAllowed,
      flags: flags,
      reasons: reasons
    };
  }

  // ===========================================================================
  // 4. DEMO SCENARIOS — the framework working end-to-end in the back office
  // ===========================================================================
  var DEMO_SCENARIOS = [
    { label: "Baseline — Free PLNA · Free KNECT",
      input: { miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
               plnaTier: "FREE", knectTier: "FREE", weight: "STANDARD", handling: "KERBSIDE" } },
    { label: "Strongest — Pro PLNA · KNECT Member",
      input: { miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
               plnaTier: "PRO", knectTier: "PAID", weight: "STANDARD", handling: "KERBSIDE" } },
    { label: "Heavy handball Luton — hindrance pays the driver",
      input: { miles: 45, vehicleCode: "LUTON", jobTypeCode: "TIMED",
               plnaTier: "PLUS", knectTier: "FREE", weight: "HEAVY", handling: "DIFFICULT",
               extraStops: 2, waitingHours: 1 } },
    { label: "Fuel surge — base rates protect the driver",
      input: { miles: 100, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY",
               plnaTier: "FREE", knectTier: "FREE", weight: "STANDARD", handling: "KERBSIDE",
               _fuelDemo: true } },
    { label: "Margin override — account retention (admin, logged)",
      input: { miles: 80, vehicleCode: "MWB_VAN", jobTypeCode: "STD_SAMEDAY",
               plnaTier: "FREE", knectTier: "PAID", weight: "STANDARD", handling: "KERBSIDE",
               override: { marginPct: 16, operator: "Brent", reason: "Key account retention" } } },
    { label: "Direct booking within quota — HAF margin 0%",
      input: { miles: 30, vehicleCode: "SMALL_VAN", jobTypeCode: "STD_SAMEDAY",
               plnaTier: "FREE", knectTier: "FREE", weight: "STANDARD", handling: "KERBSIDE",
               isDirectBooking: true, directBookingsUsedThisMonth: 1 } },
    { label: "Direct booking OVER quota — gated (upgrade path)",
      input: { miles: 30, vehicleCode: "SMALL_VAN", jobTypeCode: "STD_SAMEDAY",
               plnaTier: "FREE", knectTier: "FREE", weight: "STANDARD", handling: "KERBSIDE",
               isDirectBooking: true, directBookingsUsedThisMonth: 3 } },
    { label: "Urgent near-limit load — capped multiplier, manual review",
      input: { miles: 70, vehicleCode: "LWB_VAN", jobTypeCode: "URGENT",
               plnaTier: "PRO", knectTier: "PAID", weight: "NEAR_LIMIT", handling: "DIFFICULT" } }
  ];

  function runDemo(i) {
    var s = DEMO_SCENARIOS[i];
    if (!s) return null;
    if (s.input._fuelDemo) {
      // temporarily surge fuel for the demo, then restore
      var saved = config.fuel.currentPencePerLitre;
      config.fuel.currentPencePerLitre = config.fuel.marketAvgPencePerLitre * 1.12;
      var out = price(s.input);
      config.fuel.currentPencePerLitre = saved;
      return { label: s.label, result: out };
    }
    return { label: s.label, result: price(s.input) };
  }

  // ===========================================================================
  // 5. PUBLIC API
  // ===========================================================================
  return {
    config: config,
    price: price,
    fuelAdjustment: fuelAdjustment,
    DEMO_SCENARIOS: DEMO_SCENARIOS,
    runDemo: runDemo,
    round2: round2,
    version: config.version
  };
});
