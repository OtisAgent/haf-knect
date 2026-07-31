/* ============================================================================
 * HAF KNECT — Pricing Matrix  (MATRIX-V5)
 *
 * The order-flow pricing brain. Sits alongside pricing-engine.js (lane maths)
 * and margin-gate.js (loss gate). V5 completes the framework Brent locked on
 * 2026-07-31 by adding the two levers he asked for on top of the V4 ladder:
 *
 *   DRIVER SIDE — base-rate uplift, pence per mile
 *     Free driver    +£0.00/mi     (PLNA Free / Fleet Lite)
 *     Member driver  +£0.10/mi     (PLNA Plus, or a paid HAF KNECT member)
 *     Pro driver     +£0.25/mi     (PLNA Pro / Fleet Pro)
 *
 *   ACCOUNT SIDE — network fee reduction, percentage points
 *     Free account    −0 pts       (Business Free / Freight Free / Fleet Lite)
 *     Plus account    −4 pts       (Freight Plus, paid HAF KNECT member)
 *     Pro account     −7 pts       (Freight Pro / Fleet Pro)
 *
 * Three amounts, always kept apart and never blended into one rate:
 *   1. Carrier Transport Value — what the road work is worth, paid to the driver
 *   2. HAF Network Fee — a % of (1), added ON TOP, never skimmed out of it
 *   3. Customer price — (1) + (2), ex VAT
 *
 * Principles (locked):
 *  - A driver's level raises the base rate, so the transport value rises and the
 *    fee rides up with it. Paying a better driver more never costs HAF money —
 *    Brent 2026-07-31: the customer rate "depends on the driver taking the job".
 *  - An account's level takes points off the fee, never off driver pay.
 *  - Highest wins, never stacks — on both sides.
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
    version: "MATRIX-V5",
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

    // --- DRIVER BASE-RATE UPLIFT (MATRIX-V5) ---------------------------------
    //     Brent 2026-07-31: "Driver base rate uplift per account or HAF KNECT
    //     Paid members." The uplift is PENCE PER LOADED MILE added to the
    //     vehicle base rate — not a percentage skimmed off HAF's fee. It is the
    //     model already approved in PRICING_ENGINE_CONSTANTS §5.1 (2026-07-18):
    //     "Member and Pro derive automatically as Free + £0.10 and Free + £0.25".
    //
    //     Because the network fee sits ON TOP of the transport value, a higher
    //     driver rate raises the transport value, the fee rides up with it, and
    //     HAF is never out of pocket for paying a better driver more. That is
    //     Brent's own sentence: the customer rate "depends on the driver taking
    //     the job".
    driverLevels: {
      FREE:   { name: "Free driver",           upliftGbpPerMile: 0.00, rank: 0 },
      MEMBER: { name: "Member driver",         upliftGbpPerMile: 0.10, rank: 1 },
      PRO:    { name: "Pro driver",            upliftGbpPerMile: 0.25, rank: 2 }
    },

    // Which driver level each thing earns. HIGHEST WINS, NEVER STACKS — the
    // same rule as every other benefit on this network.
    driverLevelFrom: {
      plnaTier:  { FREE: "FREE", PLUS: "MEMBER", PRO: "PRO" },
      fleetTier: { FLEET_LITE: "FREE", FLEET_PRO: "PRO" },
      // A paid HAF KNECT membership on the DRIVER side earns the member rate.
      knectPaidMember: "MEMBER"
    },

    // --- NETWORK FEE REDUCTION BY POSTING ACCOUNT (MATRIX-V5) ----------------
    //     Brent 2026-07-31: "network reduction rates for higher freight
    //     forwarding accounts, HAF KNECT Members ... Fleet account same again."
    //     Figures are the ones approved in PRICING_ENGINE_CONSTANTS §5.5
    //     (2026-07-18): Free 0, Plus −4 points, Pro −7 points. Points come off
    //     the job-type fee and can NEVER breach that job type's floor.
    //
    //     Driven by LEVEL, not by account type, so one ladder serves every
    //     account: freight forwarder, business, fleet and KNECT membership.
    accountLevels: {
      LITE: { name: "Free account", feeReductionPts: 0, rank: 0 },
      PLUS: { name: "Plus account", feeReductionPts: 4, rank: 1 },
      PRO:  { name: "Pro account",  feeReductionPts: 7, rank: 2 }
    },

    accountLevelFrom: {
      accountType: {
        BUSINESS_FREE: "LITE",
        FREIGHT_FREE:  "LITE", FREIGHT_PLUS: "PLUS", FREIGHT_PRO: "PRO",
        FLEET_LITE:    "LITE", FLEET_PRO:    "PRO"
      },
      // ⚠️ THE ONE FIGURE NOT IN A SIGNED-OFF DOCUMENT. Brent named KNECT
      // members as earning a reduction but never said which rung. Set to the
      // Plus rung because a paid KNECT membership is the entry paid tier.
      // Flagged to Brent 2026-07-31 and easy to move — one word.
      knectPaidMember: "PLUS"
    },

    // --- PLNA driver tiers (subscription identity; rate effect via driverLevels)
    plnaTiers: {
      FREE: { name: "PLNA Free" },
      PLUS: { name: "PLNA Plus" },
      PRO:  { name: "PLNA Pro" }
    },

    // --- KNECT tiers: paid membership + direct-booking allowance (anti-bypass)
    knectTiers: {
      FREE: { name: "KNECT Free",       paid: false, directBookingsPerMonth: 3 },
      PAID: { name: "HAF KNECT Member", paid: true,  directBookingsPerMonth: null } // null = unlimited
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

  // ---------------------------------------------------------------------------
  // LEVEL RESOLVERS — "highest wins, never stacks", applied identically on both
  // sides of the job. A driver who is PLNA Pro AND a paid KNECT member is a Pro
  // driver, not a Pro-plus-Member driver. A freight forwarder on Pro who is also
  // a KNECT member gets −7 points, not −11.
  // ---------------------------------------------------------------------------
  function bestOf(levels, candidates) {
    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      var key = candidates[i];
      var lvl = key && levels[key];
      if (lvl && (best === null || lvl.rank > levels[best].rank)) best = key;
    }
    return best;
  }

  // Which driver level applies, and every claim that was considered (audit).
  function resolveDriverLevel(input) {
    var map = config.driverLevelFrom, claims = [];
    var candidates = [];
    var fromPlna = map.plnaTier[input.plnaTier];
    if (fromPlna) { candidates.push(fromPlna); claims.push({ source: "PLNA " + (input.plnaTier || "FREE"), level: fromPlna }); }
    var fromFleet = input.driverFleetTier && map.fleetTier[input.driverFleetTier];
    if (fromFleet) { candidates.push(fromFleet); claims.push({ source: "Fleet " + input.driverFleetTier, level: fromFleet }); }
    if (input.driverIsKnectMember) {
      candidates.push(map.knectPaidMember);
      claims.push({ source: "HAF KNECT member (driver)", level: map.knectPaidMember });
    }
    var code = bestOf(config.driverLevels, candidates) || "FREE";
    return { code: code, level: config.driverLevels[code], claims: claims };
  }

  // Which posting-account level applies, and every claim considered (audit).
  function resolveAccountLevel(input) {
    var map = config.accountLevelFrom, claims = [];
    var candidates = [];
    var fromType = input.accountType && map.accountType[input.accountType];
    if (fromType) { candidates.push(fromType); claims.push({ source: input.accountType, level: fromType }); }
    var knect = config.knectTiers[input.knectTier];
    if (knect && knect.paid) {
      candidates.push(map.knectPaidMember);
      claims.push({ source: "HAF KNECT member (account)", level: map.knectPaidMember });
    }
    var code = bestOf(config.accountLevels, candidates) || "LITE";
    return { code: code, level: config.accountLevels[code], claims: claims };
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

    // --- Driver base-rate uplift: pence per mile ON the vehicle rate, decided
    //     by the driver's own tier / fleet tier / KNECT membership. Highest
    //     wins. This raises the transport value, so the fee rides up with it.
    var driverLevel = resolveDriverLevel(input);
    var upliftPerMile = driverLevel.level.upliftGbpPerMile;
    if (upliftPerMile > 0)
      reasons.push("Driver rate uplift +£" + upliftPerMile.toFixed(2) + "/mile (" +
        driverLevel.level.name + ") — the customer rate follows the driver taking the job.");

    // --- Fuel marker ---
    var fuel = fuelAdjustment();
    var baseRate = vehicle.baseRate + upliftPerMile;
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

    // --- Posting account level: how many points come off the network fee ---
    var accountLevel = resolveAccountLevel(input);

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

    // --- Mileage value at this driver's rate, and at the plain Free rate, so
    //     the audit can show exactly what the uplift was worth on this job.
    var driverBase = round2(miles * baseRate * mult + supplements);
    var freeRate = vehicle.baseRate * (baseRate / (vehicle.baseRate + upliftPerMile));
    var driverBaseAtFreeRate = round2(miles * freeRate * mult + supplements);

    // --- Margin (firm; overridable by admin with reason, never below floor) ---
    var marginPct = direct ? config.directBooking.hafMarginPct : jobType.marginPct;

    // --- Account fee reduction: points off the job-type fee, floor-protected.
    //     A direct booking already carries 0% — there is nothing to reduce.
    var feeReduction = { requestedPts: 0, appliedPts: 0, floorHeld: false, level: accountLevel.code };
    if (!direct && accountLevel.level.feeReductionPts > 0) {
      var wantPts = accountLevel.level.feeReductionPts;
      var afterPct = Math.max(marginPct - wantPts, jobType.floorPct);
      feeReduction.requestedPts = wantPts;
      feeReduction.appliedPts = round2(marginPct - afterPct);
      feeReduction.floorHeld = feeReduction.appliedPts < wantPts;
      reasons.push("Network fee −" + feeReduction.appliedPts + " points (" +
        accountLevel.level.name + ") → " + afterPct + "%" +
        (feeReduction.floorHeld ? " — held at the " + jobType.floorPct + "% floor" : "") + ".");
      marginPct = afterPct;
    }
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
    // The same job priced at the plain Free rate — the uplift's real worth.
    var carrierValueAtFreeRate = round2(
      (!direct && driverBaseAtFreeRate < minValue) ? minValue : driverBaseAtFreeRate);

    // --- HAF Network Fee: a percentage OF the transport value, added on top.
    //     Never hidden inside the mileage rate, never taken off the driver.
    var networkFeeGbp = round2(carrierValue * marginPct / 100);

    // --- The driver is paid the whole transport value. The uplift is already
    //     inside it (it went on the base rate), so there is nothing to skim off
    //     HAF's fee and no uplift can ever be "withheld" for margin reasons.
    var driverPay = carrierValue;
    // What the uplift was actually worth on this job, for the audit.
    var upliftGbp = round2(Math.max(0, carrierValue - carrierValueAtFreeRate));

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
        accountType: input.accountType || null,
        driverFleetTier: input.driverFleetTier || null,
        driverIsKnectMember: !!input.driverIsKnectMember,
        weight: input.weight || "STANDARD", handling: input.handling || "KERBSIDE",
        extraStops: num(input.extraStops), waitingHours: num(input.waitingHours),
        isDirectBooking: direct
      },
      fuel: fuel,
      rates: { vehicleBaseRate: vehicle.baseRate,
               driverLevel: driverLevel.code,
               driverLevelName: driverLevel.level.name,
               driverUpliftGbpPerMile: upliftPerMile,
               upliftedBaseRate: round2(vehicle.baseRate + upliftPerMile),
               fuelAdjustedRate: round2(baseRate),
               levelClaims: driverLevel.claims },
      account: { level: accountLevel.code,
                 levelName: accountLevel.level.name,
                 feeReductionRequestedPts: feeReduction.requestedPts,
                 feeReductionAppliedPts: feeReduction.appliedPts,
                 heldAtFloor: feeReduction.floorHeld,
                 levelClaims: accountLevel.claims },
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
        driverUpliftGbp: upliftGbp,               // what the rate uplift was worth here
        carrierValueAtFreeRateGbp: carrierValueAtFreeRate,
        driverPayGbp: driverPay,                  // the whole transport value
        hafMarginPct: marginPct,
        hafMarginGbp: hafMarginGbp,               // the network fee, retained in full
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
    { label: "Pro driver — base rate +£0.25/mi, fee rides up with it",
      input: { miles: 60, vehicleCode: "SWB_VAN", jobTypeCode: "STD_SAMEDAY",
               plnaTier: "PRO", knectTier: "FREE", weight: "STANDARD", handling: "KERBSIDE" } },
    { label: "Freight Pro account — network fee −7 pts, held at the floor",
      input: { miles: 100, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY",
               plnaTier: "FREE", knectTier: "FREE", accountType: "FREIGHT_PRO",
               weight: "STANDARD", handling: "KERBSIDE" } },
    { label: "Freight Plus on urgent — the full 4 points come off",
      input: { miles: 100, vehicleCode: "LWB_VAN", jobTypeCode: "URGENT",
               plnaTier: "FREE", knectTier: "FREE", accountType: "FREIGHT_PLUS",
               weight: "STANDARD", handling: "KERBSIDE" } },
    { label: "Fleet Pro — same ladder on both sides of the job",
      input: { miles: 100, vehicleCode: "XLWB_VAN", jobTypeCode: "URGENT",
               plnaTier: "FREE", knectTier: "FREE", accountType: "FLEET_PRO",
               driverFleetTier: "FLEET_PRO", weight: "STANDARD", handling: "KERBSIDE" } },
    { label: "Double Pro — Pro driver on a Pro account",
      input: { miles: 100, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY",
               plnaTier: "PRO", knectTier: "PAID", accountType: "FREIGHT_PRO",
               weight: "STANDARD", handling: "KERBSIDE" } },
    { label: "KNECT member, no paid account — the Plus rung on both sides",
      input: { miles: 100, vehicleCode: "LWB_VAN", jobTypeCode: "URGENT",
               plnaTier: "FREE", knectTier: "PAID", driverIsKnectMember: true,
               weight: "STANDARD", handling: "KERBSIDE" } },
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
