/* ============================================================================
 * HAF KNECT — Pricing Matrix  (MATRIX-V5)
 *
 * The order-flow pricing brain. Sits alongside pricing-engine.js (lane maths)
 * and margin-gate.js (loss gate). V5 completes the framework Brent locked on
 * 2026-07-31 by adding the two levers he asked for on top of the V4 ladder:
 *
 *   DRIVER SIDE — driver reward rate, pence per mile
 *     Free driver    +£0.00/mi     (PLNA Free / Fleet Lite)
 *     Member driver  +£0.10/mi     (PLNA Plus / Fleet Middle / paid KNECT member)
 *     Pro driver     +£0.25/mi     (PLNA Pro / Fleet Pro)
 *
 *   ACCOUNT SIDE — network fee reduction, percentage points (framework §5)
 *     Free account    −0 pts       (Business Free / Freight Free)
 *     Plus account    −2.5 pts     (Freight Plus, paid HAF KNECT member)
 *     Pro account     −5 pts       (Freight Pro)
 *   giving Brent's own matrix: urgent 30/27.5/25, same-day and scheduled
 *   20/17.5/15. A FLEET tier never reduces the fee (§7) — a fleet is a supply
 *   account, so its tier is expressed on the driver side instead.
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

    // --- Vehicle matrix — the ONLY eight vehicles on this network.
    //     baseRate = £ per loaded mile paid to the driver/fleet
    //     minTransportValue = the vehicle's minimum transport value, £ ex VAT
    //     The top of the ladder is a Luton in its three approved bodies —
    //     box, curtain side and tail lift (Brent 2026-08-02: "Lutons - tail
    //     lift + box + curtain side").
    //     Nothing above a Luton exists here: no artic, flatbed, rigid, tractor
    //     unit, 7.5t, anything drawn on a trailer, or any other HGV class.
    //     (Removal test, §17.)
    //
    //     Box and curtain side carry the same payload, so they price the same.
    //     That mirrors the live rate card, which has always quoted the two
    //     identically. Brent can split them on the Pricing Engine page if he
    //     ever wants curtain side to earn more.
    vehicles: [
      { code: "SMALL_VAN",     name: "Small Van",           baseRate: 0.80, minTransportValue: 50 },
      { code: "SWB_VAN",       name: "SWB",                 baseRate: 0.90, minTransportValue: 55 },
      { code: "MWB_VAN",       name: "MWB",                 baseRate: 1.00, minTransportValue: 60 },
      { code: "LWB_VAN",       name: "LWB",                 baseRate: 1.10, minTransportValue: 65 },
      { code: "XLWB_VAN",      name: "XLWB",                baseRate: 1.20, minTransportValue: 70 },
      { code: "LUTON",         name: "Luton — Box",         baseRate: 1.30, minTransportValue: 75 },
      { code: "LUTON_CURTAIN", name: "Luton — Curtain Side", baseRate: 1.30, minTransportValue: 75 },
      { code: "LUTON_TAIL",    name: "Luton — Tail Lift",   baseRate: 1.40, minTransportValue: 80 }
    ],

    // --- Prepared but INACTIVE: never priced, never shown, until approved (§13)
    inactiveVehicles: [
      { code: "MOTORCYCLE", name: "Motorcycle", baseRate: null, minTransportValue: null, active: false },
      { code: "CAR",        name: "Car",        baseRate: null, minTransportValue: null, active: false }
    ],

    // --- DRIVER REWARD RATE (MATRIX-V5) --------------------------------------
    //     Brent 2026-07-31 asked for a driver base-rate rise "per account or
    //     HAF KNECT Paid members", then on 2026-08-02 asked for it to carry
    //     different wording from "uplift" so it stops reading as a contradiction
    //     of §7. Same money, one name everywhere: the DRIVER REWARD RATE.
    //     It is PENCE PER LOADED MILE added to the
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
      FREE:   { name: "Free driver",           rewardGbpPerMile: 0.00, rank: 0 },
      MEMBER: { name: "Member driver",         rewardGbpPerMile: 0.10, rank: 1 },
      PRO:    { name: "Pro driver",            rewardGbpPerMile: 0.25, rank: 2 }
    },

    // Which driver level each thing earns. HIGHEST WINS, NEVER STACKS — the
    // same rule as every other benefit on this network.
    // ✅ CONFIRMED BY BRENT 2026-07-31 ("that's correct, add exactly that").
    //    This SUPERSEDES §7 of the 31 Jul framework, which says "PLNA tier must
    //    not change the customer-facing vehicle mileage rate". He was shown the
    //    clash in writing and chose the reward rate: the customer rate follows the
    //    driver who takes the job. §7's line is recorded as superseded here
    //    rather than quietly dropped, so nobody re-applies it later.
    driverLevelFrom: {
      plnaTier:  { FREE: "FREE", PLUS: "MEMBER", PRO: "PRO" },
      // Fleet bands per framework §7: Lite free to 5, Middle £100 to 25,
      // Pro £250 to 50. A fleet's tier sets the level for its drivers — this is
      // the reading of "Fleet account same again" that keeps fleet on the
      // supply side, where §7 puts it. FLAGGED, not confirmed.
      fleetTier: { FLEET_LITE: "FREE", FLEET_MIDDLE: "MEMBER", FLEET_PRO: "PRO" },
      // A paid HAF KNECT membership on the DRIVER side earns the member rate.
      knectPaidMember: "MEMBER"
    },

    // --- NETWORK FEE REDUCTION BY POSTING ACCOUNT (MATRIX-V5) ----------------
    //     SOURCE: Brent's "HAF KNECT Pricing Matrix and Network Fee Framework",
    //     31 Jul 2026, §5 — Freight Plus 2.5 percentage points, Freight Pro 5
    //     percentage points, giving his own live matrix:
    //       Urgent 30 / 27.5 / 25 · Same-day 20 / 17.5 / 15 · Scheduled 20 / 17.5 / 15
    //     and his explicit instruction: "A percentage-POINT reduction must be
    //     used. Do not calculate this as a 5% discount from the value of the
    //     20% fee."
    //
    //     ✅ CONFIRMED BY BRENT 2026-07-31: "2.5 - 5 is correct".
    //     SUPERSEDES the −4 / −7 pair in PRICING_ENGINE_CONSTANTS §5.5 (approved
    //     2026-07-18) AND the legacy `freight_tier.feeAdjPts` row in tier_config
    //     (+4 / 0 / −3, seed v1) which is a third, older model again. Both are
    //     recorded as superseded, not deleted, so nobody re-applies them.
    //
    //     The reduction comes off HAF only — never the driver's transport value
    //     (§5, §7) — and can never breach the job-type floor.
    accountLevels: {
      LITE: { name: "Free account", feeReductionPts: 0,   rank: 0 },
      PLUS: { name: "Plus account", feeReductionPts: 2.5, rank: 1 },
      PRO:  { name: "Pro account",  feeReductionPts: 5,   rank: 2 }
    },
    // Every older fee model, kept visible so none of them creeps back in.
    supersededAccountLevels: {
      supersededBy: "Pricing Matrix and Network Fee Framework §5, 2026-07-31 — confirmed by Brent in chat, same day",
      priorModels: [
        { source: "PRICING_ENGINE_CONSTANTS §5.5 (2026-07-18)", PLUS: 4,  PRO: 7 },
        { source: "tier_config freight_tier.feeAdjPts seed v1",  FREE: 4, PLUS: 0, PRO: -3 },
        { source: "tier_config knect_member.FEE_BENEFIT seed v2", MEMBER_PTS: 1 }
      ]
    },
    // The percentage-multiplier driver model this pence-per-mile reward rate replaces.
    supersededDriverModels: [
      { source: "tier_config plna_payout seed v2 (multipliers)",
        LITE: 1.00, PLUS: 1.04, PRO: 1.08, cap: 1.10 }
    ],

    accountLevelFrom: {
      // ⚠️ FLEET IS DELIBERATELY ABSENT HERE. §7 of the framework: "Fleet
      // subscription level must not automatically reduce the network fee
      // charged to a freight forwarder or business customer." A fleet is a
      // SUPPLY-side account — it takes work, it does not post it — so its tier
      // is expressed on the DRIVER side instead (driverLevelFrom.fleetTier).
      // Brent's chat line "Fleet account same again" sits in his network-fee
      // paragraph and could be read the other way round; the document is
      // explicit, so the document holds until he says otherwise. FLAGGED.
      accountType: {
        BUSINESS_FREE: "LITE",     // §7: business accounts get the standard fee
        FREIGHT_FREE:  "LITE", FREIGHT_PLUS: "PLUS", FREIGHT_PRO: "PRO"
      },
      // ⚠️ NOT IN THE DOCUMENT AT ALL. Brent named KNECT members as earning a
      // reduction in chat; the framework is silent on it. Set to the Plus rung
      // as the entry paid tier. One word to move.
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
    //     floorPct   = the least HAF may retain after funding a driver reward.
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

    // --- Driver reward rate: pence per mile ON the vehicle rate, decided
    //     by the driver's own tier / fleet tier / KNECT membership. Highest
    //     wins. This raises the transport value, so the fee rides up with it.
    var driverLevel = resolveDriverLevel(input);
    var rewardPerMile = driverLevel.level.rewardGbpPerMile;
    if (rewardPerMile > 0)
      reasons.push("Driver reward +£" + rewardPerMile.toFixed(2) + "/mile (" +
        driverLevel.level.name + ") — the customer rate follows the driver taking the job.");

    // --- Fuel marker ---
    var fuel = fuelAdjustment();
    var baseRate = vehicle.baseRate + rewardPerMile;
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
    //     the audit can show exactly what the reward was worth on this job.
    var driverBase = round2(miles * baseRate * mult + supplements);
    var freeRate = vehicle.baseRate * (baseRate / (vehicle.baseRate + rewardPerMile));
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
    // The same job priced at the plain Free rate — the reward's real worth.
    var carrierValueAtFreeRate = round2(
      (!direct && driverBaseAtFreeRate < minValue) ? minValue : driverBaseAtFreeRate);

    // --- HAF Network Fee: a percentage OF the transport value, added on top.
    //     Never hidden inside the mileage rate, never taken off the driver.
    var networkFeeGbp = round2(carrierValue * marginPct / 100);

    // --- The driver is paid the whole transport value. The reward is already
    //     inside it (it went on the base rate), so there is nothing to skim off
    //     HAF's fee and no reward can ever be "withheld" for margin reasons.
    var driverPay = carrierValue;
    // What the reward was actually worth on this job, for the audit.
    var rewardGbp = round2(Math.max(0, carrierValue - carrierValueAtFreeRate));

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
               driverRewardGbpPerMile: rewardPerMile,
               rewardedBaseRate: round2(vehicle.baseRate + rewardPerMile),
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
        driverRewardGbp: rewardGbp,               // what the reward rate was worth here
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
    { label: "Freight Pro account — network fee −5 pts (20% → 15%)",
      input: { miles: 100, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY",
               plnaTier: "FREE", knectTier: "FREE", accountType: "FREIGHT_PRO",
               weight: "STANDARD", handling: "KERBSIDE" } },
    { label: "Freight Plus on urgent — −2.5 pts (30% → 27.5%)",
      input: { miles: 100, vehicleCode: "LWB_VAN", jobTypeCode: "URGENT",
               plnaTier: "FREE", knectTier: "FREE", accountType: "FREIGHT_PLUS",
               weight: "STANDARD", handling: "KERBSIDE" } },
    { label: "Fleet Pro — drivers on the Pro rate, fee unchanged (framework §7)",
      input: { miles: 100, vehicleCode: "XLWB_VAN", jobTypeCode: "URGENT",
               plnaTier: "FREE", knectTier: "FREE", accountType: "FLEET_PRO",
               driverFleetTier: "FLEET_PRO", weight: "STANDARD", handling: "KERBSIDE" } },
    { label: "Double Pro — Pro driver on a Pro account",
      input: { miles: 100, vehicleCode: "LWB_VAN", jobTypeCode: "STD_SAMEDAY",
               plnaTier: "PRO", knectTier: "PAID", accountType: "FREIGHT_PRO",
               weight: "STANDARD", handling: "KERBSIDE" } },
    { label: "KNECT member — member driver rate + the Plus fee rung",
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
  // 5. LOADING THE LIVE CONFIG FROM THE DATABASE
  // ===========================================================================
  /* The numbers above are the built-in defaults — the safety net. In normal
     running the Pricing Engine page hands us the saved config from tier_config
     so Brent can move a rate without anyone rebuilding this file.

     applyConfig() merges a saved config over the defaults, one key at a time,
     and returns the list of keys it actually replaced. Anything the database
     does not carry keeps its built-in value, so a partial or half-saved record
     can never leave the engine with a missing rate. */
  var DEFAULTS = JSON.parse(JSON.stringify(config));
  function applyConfig(saved) {
    var applied = [];
    if (!saved || typeof saved !== "object") return applied;
    for (var k in saved) {
      if (!Object.prototype.hasOwnProperty.call(saved, k)) continue;
      if (saved[k] === undefined || saved[k] === null) continue;
      config[k] = saved[k];
      applied.push(k);
    }
    return applied;
  }
  function resetConfig() {
    var fresh = JSON.parse(JSON.stringify(DEFAULTS));
    for (var k in fresh) config[k] = fresh[k];
    return config;
  }

  // ===========================================================================
  // 6. PUBLIC API
  // ===========================================================================
  return {
    config: config,
    defaults: DEFAULTS,
    applyConfig: applyConfig,
    resetConfig: resetConfig,
    price: price,
    fuelAdjustment: fuelAdjustment,
    DEMO_SCENARIOS: DEMO_SCENARIOS,
    runDemo: runDemo,
    round2: round2,
    version: config.version
  };
});
