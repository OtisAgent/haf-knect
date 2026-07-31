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
    version: "MATRIX-V4",
    effectiveFrom: "2026-07-31",
    vatPct: 20,

    // --- Vehicle matrix — the ONLY seven vehicles on this network.
    //     baseRate = £ per loaded mile paid to the driver/fleet
    //     minTransportValue = the vehicle's minimum transport value, £ ex VAT
    //     Nothing above a Luton exists here: no artic, flatbed, curtain, rigid,
    //     tractor unit, 7.5t or any other HGV class. (Removal test, §17.)
    vehicles: [
      { code: "SMALL_VAN",   name: "Small Van",         baseRate: 0.80, minTransportValue: 50 },
      { code: "SWB_VAN",     name: "SWB",               baseRate: 0.90, minTransportValue: 55 },
      { code: "MWB_VAN",     name: "MWB",               baseRate: 1.00, minTransportValue: 60 },
      { code: "LWB_VAN",     name: "LWB",               baseRate: 1.10, minTransportValue: 65 },
      { code: "XLWB_VAN",    name: "XLWB",              baseRate: 1.20, minTransportValue: 70 },
      { code: "LUTON",       name: "Luton",             baseRate: 1.30, minTransportValue: 75 },
      { code: "LUTON_TAIL",  name: "Luton — Tail Lift", baseRate: 1.40, minTransportValue: 80 }
    ],

    // --- Prepared but INACTIVE: never priced, never shown, until approved (§13)
    inactiveVehicles: [
      { code: "MOTORCYCLE", name: "Motorcycle", baseRate: null, minTransportValue: null, active: false },
      { code: "CAR",        name: "Car",        baseRate: null, minTransportValue: null, active: false }
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
    //     marginPct = the HAF Network Fee as a % of the Carrier Transport Value.
    //     floorPct   = the least HAF may retain after funding a driver uplift.
    //     Groupage is built but NOT customer-facing at launch (§12).
    jobTypes: [
      { code: "GROUPAGE",     name: "Groupage",                     marginPct: 10, floorPct: 8,  active: false },
      { code: "FLEX_SAMEDAY", name: "Scheduled / Flexible / Co-load", marginPct: 20, floorPct: 15, active: true },
      { code: "STD_SAMEDAY",  name: "Same-Day",                     marginPct: 20, floorPct: 15, active: true },
      { code: "TIMED",        name: "Timed Delivery",               marginPct: 25, floorPct: 18, active: true },
      { code: "URGENT",       name: "Urgent / Time-Critical",       marginPct: 30, floorPct: 22, active: true }
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

    // --- Minimums step up by VEHICLE, never by distance — one ladder only.
    //     A genuinely short run in the area is handling work, not road work, so
    //     that one minimum eases down for very low mileage and returns to full
    //     by 25 miles. The taper is continuous: no mile where the price jumps.
    //     The curve is smooth end to end, so no mile ever prices lower than a
    //     shorter one. 0 mi = 30% below; 15 mi = 20% below; 25 mi = full.
    localHandling: {
      maxReductionPct: 30,                 // at zero miles
      bandReductionPct: 20,                // by this many miles...
      bandAtMiles: 15,
      fullMinimumFromMiles: 25             // ...back to the full minimum here
    },

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
  // The vehicle minimum, eased down for a genuinely short in-area run.
  // Continuous by design: there is no mile at which the price jumps.
  function minTransportValue(vehicle, miles) {
    var lh = config.localHandling, m = Math.max(0, miles), f;
    var maxOff = lh.maxReductionPct / 100, bandOff = lh.bandReductionPct / 100;
    if (m >= lh.fullMinimumFromMiles) f = 1;
    else if (m >= lh.bandAtMiles)
      f = (1 - bandOff) + bandOff * (m - lh.bandAtMiles) / (lh.fullMinimumFromMiles - lh.bandAtMiles);
    else
      f = (1 - maxOff) + (maxOff - bandOff) * (m / lh.bandAtMiles);
    return round2(vehicle.minTransportValue * f);
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
    // --- Sandbox base-rate lever (what-if only; defaults off, live pricing unchanged) ---
    if (input.baseRateMult != null) {
      var brm = num(input.baseRateMult);
      if (brm > 0 && brm !== 1) {
        baseRate = baseRate * brm;
        reasons.push("What-if base rate " + Math.round(brm * 100) + "% of standard.");
      }
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
    // --- Sandbox margin lever (what-if only; defaults off, floor-protected) ---
    if (!direct && input.marginDeltaPct != null) {
      var md = num(input.marginDeltaPct);
      if (md !== 0) {
        marginPct = Math.min(90, Math.max(jobType.floorPct, marginPct + md));
        reasons.push("What-if margin " + (md > 0 ? "+" : "") + md + " pts → " + marginPct + "%.");
      }
    }
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

    // --- Carrier Transport Value: the greater of the mileage value and the
    //     vehicle's minimum (eased down for genuinely short in-area work).
    var minValue = minTransportValue(vehicle, miles);
    var carrierValue = driverBase;
    var minApplied = false;
    if (!direct && carrierValue < minValue) {
      carrierValue = minValue;
      minApplied = true;
      reasons.push("Vehicle minimum applied: " + vehicle.name + " £" + minValue +
        (miles < config.localHandling.fullMinimumFromMiles
          ? " (short local run priced as handling, eased down from £" + vehicle.minTransportValue + ")"
          : ""));
    }
    carrierValue = round2(carrierValue);

    // --- HAF Network Fee: a percentage OF the transport value, added on top.
    //     Never hidden inside the mileage rate, never taken off the driver.
    var networkFeeGbp = round2(carrierValue * marginPct / 100);

    // --- Tier uplift pays the DRIVER out of HAF's own fee, so a driver's PLNA
    //     tier never moves the customer's price. Withheld if it would take HAF
    //     below the job-type floor.
    var driverPay = carrierValue;
    var upliftGbp = 0;
    var upliftApplied = false;
    if (upliftPct > 0 && !direct) {
      var candidate = round2(carrierValue * upliftPct / 100);
      if (networkFeeGbp - candidate >= carrierValue * jobType.floorPct / 100 - 0.001) {
        upliftGbp = candidate;
        driverPay = round2(carrierValue + candidate);
        upliftApplied = true;
        reasons.push("Tier uplift +" + upliftPct + "% to the driver (" + upliftSource +
          "), funded from the network fee — customer price unchanged.");
      } else {
        flags.push("UPLIFT_WITHHELD_MARGIN");
        reasons.push("Tier uplift withheld — would take HAF below the " + jobType.floorPct + "% floor.");
      }
    } else if (upliftPct > 0 && direct) {
      // Direct jobs: driver and customer agreed directly; uplift not applied.
      reasons.push("Tier uplift not applied on direct bookings.");
    }

    var customerExVat = round2(carrierValue + networkFeeGbp);

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
        // The three amounts, kept apart (§1) — never blended into one rate.
        carrierTransportValueGbp: carrierValue,   // 1. what the road work is worth
        networkFeePct: marginPct,                 // 2. the HAF network fee...
        networkFeeGbp: networkFeeGbp,             //    ...in pounds
        customerExVatGbp: customerExVat,          // 3. what the customer pays, ex VAT
        vatGbp: vat,
        customerIncVatGbp: round2(customerExVat + vat),
        driverBasePayGbp: driverBase,
        driverUpliftGbp: upliftGbp,
        driverPayGbp: driverPay,
        hafMarginPct: marginPct,
        hafMarginGbp: hafMarginGbp,               // fee retained after the uplift
        hafNetGbp: hafNetGbp,
        vehicleMinimumGbp: vehicle.minTransportValue,
        minimumAppliedGbp: minApplied ? minValue : null,
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
