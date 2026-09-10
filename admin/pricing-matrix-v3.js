
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HAFPricingMatrix = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var config = {

    version: "MATRIX-V8",
    effectiveFrom: "2026-09-07",
    vatPct: 20,

    referenceMph: 40,

    vehicles: [
      { code: "SMALL_VAN",     name: "Small Van",           baseRate: 1.000, minTransportValue: 50 },
      { code: "SWB_VAN",       name: "SWB",                 baseRate: 1.250, minTransportValue: 55 },
      { code: "MWB_VAN",       name: "MWB",                 baseRate: 1.250, minTransportValue: 60 },
      { code: "LWB_VAN",       name: "LWB",                 baseRate: 1.500, minTransportValue: 65 },
      { code: "XLWB_VAN",      name: "XLWB",                baseRate: 1.500, minTransportValue: 70 },
      { code: "LUTON",         name: "Luton — Box",         baseRate: 1.750, minTransportValue: 75 },
      { code: "LUTON_CURTAIN", name: "Luton — Curtain Side", baseRate: 1.750, minTransportValue: 75 },
      { code: "LUTON_TAIL",    name: "Luton — Tail Lift",   baseRate: 1.750, minTransportValue: 80 }
    ],

    inactiveVehicles: [
      { code: "MOTORCYCLE", name: "Motorcycle", baseRate: null, minTransportValue: null, active: false },
      { code: "CAR",        name: "Car",        baseRate: null, minTransportValue: null, active: false }
    ],

    driverLevels: {
      FREE:   { name: "Free driver",           rewardPctOfBaseRate: 0,  rewardGbpPerMile: 0.00, rank: 0 },
      MEMBER: { name: "Plus driver",           rewardPctOfBaseRate: 5,  rewardGbpPerMile: 0.10, rank: 1 },
      PRO:    { name: "Pro driver",            rewardPctOfBaseRate: 10, rewardGbpPerMile: 0.25, rank: 2 }
    },

    driverReward: {
      enabled: true,
      basis: "PCT_OF_BASE_RATE",
      fundedBy: "HAF_MARGIN",
      quoteAtLevel: "MEMBER",
      minRetainedPctOfCustomer: 15
    },

    networkFeeFloor: {
      pct: 15,
      ceilingPct: 50,
      nonNegotiable: true
    },

    driverLevelFrom: {
      plnaTier:  { FREE: "FREE", PLUS: "MEMBER", PRO: "PRO" },

      fleetTier: { FLEET_LITE: "FREE", FLEET_MIDDLE: "MEMBER", FLEET_PRO: "PRO" },

      knectPaidMember: "MEMBER"
    },

    accountLevels: {
      LITE: { name: "Free account", feeReductionPts: 0,   rank: 0 },
      PLUS: { name: "Plus account", feeReductionPts: 2.5, rank: 1 },
      PRO:  { name: "Pro account",  feeReductionPts: 5,   rank: 2 }
    },

    supersededAccountLevels: {
      supersededBy: "the current Pricing Matrix and Network Fee Framework",
      priorModels: [
        { source: "prior pricing reference v5.5", PLUS: 4,  PRO: 7 },
        { source: "tier_config freight_tier.feeAdjPts seed v1",  FREE: 4, PLUS: 0, PRO: -3 },
        { source: "tier_config knect_member.FEE_BENEFIT seed v2", MEMBER_PTS: 1 }
      ]
    },

    supersededDriverModels: [
      { source: "tier_config plna_payout seed v2 (multipliers)",
        LITE: 1.00, PLUS: 1.04, PRO: 1.08, cap: 1.10 }
    ],

    accountLevelFrom: {

      accountType: {
        BUSINESS_FREE: "LITE",
        FREIGHT_FREE:  "LITE", FREIGHT_PLUS: "PLUS", FREIGHT_PRO: "PRO"
      },

      knectPaidMember: "PLUS"
    },

    plnaTiers: {
      FREE: { name: "PLNA Free" },
      PLUS: { name: "PLNA Plus" },
      PRO:  { name: "PLNA Pro" }
    },

    knectTiers: {
      FREE: { name: "KNECT Free",       paid: false, directBookingsPerMonth: 3 },
      PAID: { name: "HAF KNECT Member", paid: true,  directBookingsPerMonth: null }
    },

    feeBasis: "SHARE_OF_CUSTOMER_PRICE",

    feeBasisRuling: {
      freeAccountKeepBandPct: [20, 30],
      paidAccountKeepFloorPct: 15,

      supersededOn: "2026-09-07",
      supersededBy: "networkFeeFloor — one 15-50% band on every job",
      measuredAtDriverRung: "MEMBER"
    },

    jobTypes: [

      { code: "GROUPAGE",     name: "Groupage",                     marginPct: 15, floorPct: 15,  servicePremiumMult: 1.00, active: false },
      { code: "FLEX_SAMEDAY", name: "Scheduled / Flexible / Co-load", marginPct: 20, floorPct: 15, servicePremiumMult: 1.00, active: true },
      { code: "STD_SAMEDAY",  name: "Same-Day",                     marginPct: 20, floorPct: 15, servicePremiumMult: 1.00, active: true },
      { code: "TIMED",        name: "Timed Delivery",               marginPct: 25, floorPct: 18, servicePremiumMult: 1.00, active: true },
      { code: "URGENT",       name: "Urgent / Time-Critical",       marginPct: 30, floorPct: 22, servicePremiumMult: 1.10, active: true }
    ],

    hindrance: {
      weight:   { STANDARD: 1.00, MODERATE: 1.03, HEAVY: 1.07, NEAR_LIMIT: 1.12 },
      handling: { KERBSIDE: 1.00, ASSISTED: 1.05, DIFFICULT: 1.08 },
      maxAutoMultiplier: 1.40,
      stopFeeGbp: 5,
      waitingPerHourGbp: 15
    },

    fuel: {
      marketAvgPencePerLitre: 152,
      currentPencePerLitre: 152,
      surgeThresholdPct: 8,
      baseRateUpliftPct: 4,
      maxUpliftPct: 10
    },

    market: {
      bandPct: 15
    },

    directBooking: {
      hafMarginPct: 0
    },

    localHandling: {
      maxReductionPct: 30,
      bandReductionPct: 20,
      bandAtMiles: 15,
      fullMinimumFromMiles: 25
    },

    pools: {
      phase: "TRIAL",
      trial: {
        totalPctOfMargin: 25,
        split: { affiliate: 7, driverPool: 7, freightPool: 6, relayStorage: 5 }
      },
      production: {
        totalPctOfMargin: 5,
        split: { driverPool: 2.5, relayStorage: 2.5 }
      }
    }
  };

  var LaneFactors = null;
  try {
    LaneFactors = (typeof require === "function")
      ? require("./lane-factors-v1.js")
      : (typeof self !== "undefined" ? self.HAFLaneFactors : null);
  } catch (e) { LaneFactors = null; }

  function resolveLane(input) {
    var flat = { key: null, factor: 1, basis: "NONE", parts: {}, sampleSize: 0, reasons: [] };
    if (input.laneFactor != null) {
      var f = parseFloat(input.laneFactor);
      if (isFinite(f) && f > 0)
        return { key: null, factor: f, basis: "WHAT_IF", parts: {}, sampleSize: 0,
                 reasons: ["What-if lane adjustment " + Math.round(f * 100) + "% of standard."] };
    }
    if (!LaneFactors || !input.toPostcode) return flat;
    try {
      return LaneFactors.laneFactor(input.fromPostcode, input.toPostcode,
        { miles: parseFloat(input.miles), minutes: parseFloat(input.minutes) });
    } catch (e2) { return flat; }
  }

  var round2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };
  var num = function (v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); };

  function getVehicle(code) {
    for (var i = 0; i < config.vehicles.length; i++)
      if (config.vehicles[i].code === code) return config.vehicles[i];
    return config.vehicles[0];
  }

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
    return config.jobTypes[2];
  }

  function bestOf(levels, candidates) {
    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      var key = candidates[i];
      var lvl = key && levels[key];
      if (lvl && (best === null || lvl.rank > levels[best].rank)) best = key;
    }
    return best;
  }

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

  function price(input) {
    var reasons = [], flags = [];
    var vehicle = getVehicle(input.vehicleCode);
    var jobType = getJobType(input.jobTypeCode);
    var plna = config.plnaTiers[input.plnaTier] || config.plnaTiers.FREE;
    var knect = config.knectTiers[input.knectTier] || config.knectTiers.FREE;
    var miles = Math.max(0, num(input.miles));

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

    var driverLevel = resolveDriverLevel(input);
    var rewardCfg = config.driverReward || { enabled: true, fundedBy: "CUSTOMER", minRetainedPctOfCustomer: 0 };
    var rewardFundedByHaf = rewardCfg.fundedBy !== "CUSTOMER";

    var rewardPctBasis = rewardCfg.basis === "PCT_OF_BASE_RATE";
    var rewardPerMile = rewardCfg.enabled === false ? 0
      : rewardPctBasis
        ? vehicle.baseRate * num(driverLevel.level.rewardPctOfBaseRate) / 100
        : driverLevel.level.rewardGbpPerMile;

    var quoteLevel = config.driverLevels[rewardCfg.quoteAtLevel || "FREE"] || config.driverLevels.FREE;
    var quotePerMile = (rewardCfg.enabled === false || !rewardPctBasis) ? 0
      : vehicle.baseRate * num(quoteLevel.rewardPctOfBaseRate) / 100;
    if (rewardPerMile > 0)
      reasons.push("Driver reward +£" + rewardPerMile.toFixed(2) + "/mile (" +
        driverLevel.level.name + ")" + (rewardFundedByHaf
          ? " — funded by HAF, so the customer pays the same whichever driver takes the job."
          : " — the customer rate follows the driver taking the job."));
    else if (driverLevel.level.rewardGbpPerMile > 0)
      reasons.push(driverLevel.level.name + " — tier benefits apply, but the driver reward rate " +
        "is held at £0.00/mile for now, so every driver is paid the same on this job.");

    var fuel = fuelAdjustment();
    var baseRate = vehicle.baseRate + rewardPerMile;
    if (fuel.active) {
      baseRate = baseRate * (1 + fuel.upliftPct / 100);
      reasons.push("Fuel protection: base rate +" + fuel.upliftPct + "% (" + fuel.reason + ").");
    }

    if (input.baseRateMult != null) {
      var brm = num(input.baseRateMult);
      if (brm > 0 && brm !== 1) {
        baseRate = baseRate * brm;
        reasons.push("What-if base rate " + Math.round(brm * 100) + "% of standard.");
      }
    }

    var accountLevel = resolveAccountLevel(input);

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

    var lane = resolveLane(input);
    var laneF = lane.factor;
    if (laneF !== 1) {
      for (var lr = 0; lr < lane.reasons.length; lr++) reasons.push(lane.reasons[lr]);
    }

    var servicePremium = jobType.servicePremiumMult != null ? jobType.servicePremiumMult : 1;
    if (servicePremium !== 1)
      reasons.push(jobType.name + " premium " + Math.round((servicePremium - 1) * 100) +
        "% on the road work — paid to the driver.");

    var roadMult = mult * laneF * servicePremium;
    if (roadMult > config.hindrance.maxAutoMultiplier) {
      roadMult = config.hindrance.maxAutoMultiplier;
      manualReview = true;
      flags.push("LANE_CAPPED");
      reasons.push("Hindrance, lane and urgency together exceed " + config.hindrance.maxAutoMultiplier +
        "x — held at the cap and sent for manual review.");
    }
    lane.appliedFactor = Math.round(laneF * 1000) / 1000;
    lane.servicePremium = servicePremium;
    lane.combinedRoadMultiplier = Math.round(roadMult * 1000) / 1000;

    var driverMinutes = num(input.minutes, num(input.driverMinutes, 0));
    var roadValue = function (rate) {
      var byDistance = miles * rate;
      var byTime = driverMinutes > 0 ? (driverMinutes / 60) * rate * config.referenceMph : 0;
      return Math.max(byDistance, byTime);
    };
    var freeRate = vehicle.baseRate * (baseRate / (vehicle.baseRate + rewardPerMile));
    if (driverMinutes > 0 && roadValue(baseRate) > miles * baseRate)
      reasons.push("Priced on driving time (" + round2(driverMinutes) + " min for " + miles +
        " miles) rather than distance — this lane drives slower than the rate card's " +
        config.referenceMph + " mph.");
    var driverBase = round2(roadValue(baseRate) * roadMult + supplements);
    var driverBaseAtFreeRate = round2(roadValue(freeRate) * roadMult + supplements);
    var quoteRate = freeRate * (1 + (vehicle.baseRate > 0 ? quotePerMile / vehicle.baseRate : 0));
    var driverBaseAtQuoteRate = round2(roadValue(quoteRate) * roadMult + supplements);

    var marginPct = direct ? config.directBooking.hafMarginPct : jobType.marginPct;

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

    var minValue = round2(minTransportValue(vehicle, miles) * laneF);
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

    var carrierValueAtFreeRate = round2(
      (!direct && driverBaseAtFreeRate < minValue) ? minValue : driverBaseAtFreeRate);

    var carrierValueAtQuoteRate = round2(
      (!direct && driverBaseAtQuoteRate < minValue) ? minValue : driverBaseAtQuoteRate);

    var keepsBasis = config.feeBasis !== "ADDED_TO_TRANSPORT_VALUE";

    var priceBasis = rewardFundedByHaf ? carrierValueAtQuoteRate : carrierValue;
    var customerExVatRaw = keepsBasis
      ? priceBasis / (1 - Math.min(marginPct, 95) / 100)
      : priceBasis * (1 + marginPct / 100);
    var customerExVat = round2(customerExVatRaw);

    var rewardGbp = round2(Math.max(0, carrierValue - carrierValueAtFreeRate));
    var rewardTrimmedGbp = 0;

    var feeFloorActive = !!(config.networkFeeFloor && num(config.networkFeeFloor.pct) > 0);
    if (rewardFundedByHaf && rewardGbp > 0 && !feeFloorActive) {

      var minRetainedGbp = round2(customerExVat * num(rewardCfg.minRetainedPctOfCustomer) / 100);
      var affordableGbp = round2(customerExVat - minRetainedGbp - carrierValueAtFreeRate);
      if (affordableGbp < rewardGbp) {
        rewardTrimmedGbp = round2(rewardGbp - Math.max(0, affordableGbp));
        rewardGbp = round2(Math.max(0, affordableGbp));
        carrierValue = round2(carrierValueAtFreeRate + rewardGbp);
        manualReview = true;
        flags.push("REWARD_TRIMMED");
        reasons.push("Driver reward trimmed by £" + rewardTrimmedGbp + " — funding it in full would " +
          "leave HAF under its " + rewardCfg.minRetainedPctOfCustomer + "% floor on this job. The " +
          "customer price is unchanged; the shortfall is flagged for a human to look at.");
      } else {
        reasons.push("HAF funded £" + rewardGbp + " of driver reward out of its own share — the " +
          "customer pays the same as they would with a free driver.");
      }
    } else if (rewardFundedByHaf && rewardGbp > 0) {
      reasons.push(driverLevel.level.name + " — paid the full " +
        num(driverLevel.level.rewardPctOfBaseRate) + "% plan uplift (£" + rewardGbp +
        "). Driver pay is never trimmed; if HAF cannot afford it the customer price is lifted " +
        "to the " + num(config.networkFeeFloor.pct) + "% floor instead.");
    }

    var driverPay = carrierValue;
    var networkFeeGbp = round2(customerExVat - carrierValue);

    var feeFloor = config.networkFeeFloor || { pct: 0 };
    var feeFloorPct = num(feeFloor.pct);
    var feeCeilingPct = num(feeFloor.ceilingPct);
    var feeFloorApplied = null;
    var feeCeilingApplied = null;
    if (feeFloorPct > 0 && customerExVat > 0 &&
        (networkFeeGbp / customerExVat) * 100 < feeFloorPct - 1e-9) {
      var beforeGbp = customerExVat;
      var beforePct = round2((networkFeeGbp / customerExVat) * 100);
      customerExVat = Math.ceil((driverPay / (1 - feeFloorPct / 100)) * 100) / 100;
      networkFeeGbp = round2(customerExVat - driverPay);
      feeFloorApplied = {
        floorPct: feeFloorPct,
        customerExVatBeforeGbp: beforeGbp,
        upliftGbp: round2(customerExVat - beforeGbp),
        feePctBefore: beforePct
      };
      flags.push("NETWORK_FEE_FLOOR_APPLIED");
      reasons.push("HAF network fee floor: this job left HAF on " + beforePct + "%, under the " +
        feeFloorPct + "% minimum, so the customer price was lifted £" + feeFloorApplied.upliftGbp +
        " to £" + customerExVat + ". The driver is paid exactly the same either way.");
    }

    if (feeCeilingPct > 0 && customerExVat > 0 &&
        (networkFeeGbp / customerExVat) * 100 > feeCeilingPct + 1e-9) {
      var ceilBeforeGbp = customerExVat;
      var ceilBeforePct = round2((networkFeeGbp / customerExVat) * 100);
      customerExVat = Math.floor((driverPay / (1 - feeCeilingPct / 100)) * 100) / 100;
      networkFeeGbp = round2(customerExVat - driverPay);
      feeCeilingApplied = {
        ceilingPct: feeCeilingPct,
        customerExVatBeforeGbp: ceilBeforeGbp,
        reductionGbp: round2(ceilBeforeGbp - customerExVat),
        feePctBefore: ceilBeforePct
      };
      flags.push("NETWORK_FEE_CEILING_APPLIED");
      reasons.push("HAF network fee ceiling: this job would have left HAF on " + ceilBeforePct +
        "%, over the " + feeCeilingPct + "% maximum, so the customer price was reduced £" +
        feeCeilingApplied.reductionGbp + " to £" + customerExVat +
        ". The driver is paid exactly the same either way.");
    }

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

    return {
      version: config.version,
      calculatedAt: input.calculatedAt || null,
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
      lane: { key: lane.key, basis: lane.basis, factor: lane.factor,
              appliedFactor: lane.appliedFactor != null ? lane.appliedFactor : lane.factor,
              servicePremium: lane.servicePremium,
              combinedRoadMultiplier: lane.combinedRoadMultiplier,
              parts: lane.parts, sampleSize: lane.sampleSize,
              from: input.fromPostcode || null, to: input.toPostcode || null },
      money: {
        feeBasis: config.feeBasis,
        networkFeeFloorPct: feeFloorPct,
        networkFeeFloorApplied: feeFloorApplied,
        networkFeeCeilingPct: feeCeilingPct,
        networkFeeCeilingApplied: feeCeilingApplied,
        carrierValueAtQuoteRateGbp: carrierValueAtQuoteRate,
        customerQuotedAtLevel: rewardCfg.quoteAtLevel || "FREE",

        carrierTransportValueGbp: carrierValue,
        networkFeePct: marginPct,
        networkFeeGbp: networkFeeGbp,
        customerExVatGbp: customerExVat,
        vatGbp: vat,
        customerIncVatGbp: round2(customerExVat + vat),
        driverBasePayGbp: driverBase,
        driverRewardGbp: rewardGbp,
        driverRewardFundedBy: rewardFundedByHaf ? "HAF_MARGIN" : "CUSTOMER",
        driverRewardEnabled: rewardCfg.enabled !== false,
        driverRewardTrimmedGbp: rewardTrimmedGbp,

        customerPriceBasisGbp: round2(priceBasis),
        carrierValueAtFreeRateGbp: carrierValueAtFreeRate,
        driverPayGbp: driverPay,
        hafMarginPct: marginPct,
        hafMarginGbp: hafMarginGbp,

        hafKeepsPctOfCustomer: customerExVat > 0 ? round2(networkFeeGbp / customerExVat * 100) : 0,
        hafNetPctOfCustomer: customerExVat > 0 ? round2(hafNetGbp / customerExVat * 100) : 0,
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
               override: { marginPct: 16, operator: "OWNER", reason: "Key account retention" } } },
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

      var saved = config.fuel.currentPencePerLitre;
      config.fuel.currentPencePerLitre = config.fuel.marketAvgPencePerLitre * 1.12;
      var out = price(s.input);
      config.fuel.currentPencePerLitre = saved;
      return { label: s.label, result: out };
    }
    return { label: s.label, result: price(s.input) };
  }

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
