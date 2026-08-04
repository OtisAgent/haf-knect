/* GENERATED FILE — DO NOT EDIT BY HAND. Wrapped from admin/lane-factors-v1.js by
   tools/build_pricing_core.py so the worker prices a lane exactly as
   the page does. */

export function loadLaneFactors() {
  const module = undefined;   // not CommonJS here
  const self = {};            // the script attaches itself to this
/* ============================================================================
 * HAF KNECT — LANE FACTORS  (LANE-V1, part of FRAMEWORK-V6)
 *
 * Brent, 2026-08-02:
 *   "use the PLNA and the customer feedback of the network to add alterations
 *    in the zones of the areas - as some areas will need price alterations
 *    because sheffield to manchester is different then sheffield to birmingham
 *    same driving time different distance and different fuel consumption
 *    different type of busy work"
 *
 * Until now the network had ONE adjustment and it looked only at where the job
 * ENDED: a fixed list of postcode areas graded strong / normal / limited /
 * remote. That cannot tell S→M apart from S→B, because it never looks at where
 * the job STARTED, how the road actually drives, or how busy the lane is.
 *
 * A LANE is an origin postcode area → destination postcode area (S → M).
 * Every lane carries four small, separately-explainable adjustments:
 *
 *   1. ROAD      how the road really drives — average moving speed. A slow,
 *                stop-start lane burns more fuel per mile and eats more of the
 *                driver's day than a motorway lane of the same duration.
 *   2. RETURN    how likely a paid load back is, measured on the lane, not on
 *                a hand-written list of postcodes.
 *   3. DEMAND    how busy the lane is — jobs posted against drivers available.
 *   4. FEEDBACK  what drivers and customers actually say about the lane. Small,
 *                bounded, and every move carries a reason and an author.
 *
 * They multiply into ONE lane factor, which multiplies the CARRIER TRANSPORT
 * VALUE — so it pays the DRIVER, and HAF's share rides on top of it exactly as
 * every other driver-side lever does. No lane is ever priced BELOW the standard
 * rate (floor 1.00): the network raises a hard lane, it never discounts an easy
 * one. The combined ceiling holds at the framework's 1.40 manual-review cap.
 *
 * EVIDENCE BEFORE MONEY. A lane only prices on its own numbers once it has
 * enough finished jobs behind it (config.minSampleSize). Below that it falls
 * back to the region pair, and below THAT to the destination-area band that has
 * always been live. With no job history at all — which is where the network is
 * today — every quote comes out exactly as it does now, and the lane layer
 * starts moving the moment real jobs land.
 *
 * Works in the browser and in Node. Nothing commercial is hard-coded in logic:
 * every number lives in `config` and is mirrored to tier_config scope
 * `lane_factor`.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HAFLaneFactors = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ===========================================================================
  // 1. EDITABLE CONFIG — mirrored to tier_config scope `lane_factor`
  // ===========================================================================
  var config = {
    version: "LANE-V1",
    effectiveFrom: "2026-08-02",

    // A lane needs this many finished jobs before its OWN numbers price it.
    // Below it, we fall back rather than price on noise.
    minSampleSize: 8,

    // Evidence goes stale. Lane statistics older than this are ignored by the
    // nightly learner, so a lane that has gone quiet drifts back to default.
    evidenceWindowDays: 90,

    // --- 1. ROAD — average moving speed on the lane -------------------------
    //     referenceMph is the speed the standard rate card is built around.
    //     Below it, the lane costs more per mile in fuel and in driver hours;
    //     sensitivity says how much of that shortfall the network funds.
    //     A FAST lane never goes below 1.00 — we do not discount motorway work.
    road: {
      referenceMph: 40,
      sensitivity: 0.35,
      min: 1.00,
      max: 1.18
    },

    // --- 2. RETURN LOAD — chance of a paid load back ------------------------
    //     returnRate = share of jobs finishing on this lane where the driver
    //     picked up a paying return within returnWindowHours. The bands keep
    //     the exact numbers the network has always used for the old zone
    //     grades, so a lane with no evidence prices identically to today.
    returnLoad: {
      returnWindowHours: 6,
      bands: [
        { code: "STRONG",  minRate: 0.60, factor: 1.00, label: "loads back most days" },
        { code: "NORMAL",  minRate: 0.35, factor: 1.03, label: "a load back is likely" },
        { code: "LIMITED", minRate: 0.15, factor: 1.07, label: "often runs back empty" },
        { code: "REMOTE",  minRate: 0.00, factor: 1.12, label: "nearly always runs back empty" }
      ]
    },

    // --- 3. DEMAND — how busy the lane is -----------------------------------
    //     ratio = jobs posted ÷ driver-days available on the lane.
    //     Busy lane with too few drivers pays more so drivers choose it.
    //     Never below 1.00: a quiet lane is not cheaper, it is just quiet.
    demand: {
      bands: [
        { code: "OVERSUPPLIED", maxRatio: 0.75, factor: 1.00, label: "plenty of drivers" },
        { code: "BALANCED",     maxRatio: 1.25, factor: 1.00, label: "steady" },
        { code: "BUSY",         maxRatio: 2.00, factor: 1.04, label: "busy — drivers in demand" },
        { code: "STRETCHED",    maxRatio: null, factor: 1.08, label: "stretched — hard to cover" }
      ]
    },

    // --- 4. FEEDBACK — what drivers and customers say -----------------------
    //     A bounded nudge, moved in small steps, never in one jump. Drivers
    //     saying a lane is worse than it pays push it UP; customers saying a
    //     lane is dear push it DOWN, but never below the standard rate.
    feedback: {
      min: 0.97,
      max: 1.05,
      maxStepPerReview: 0.02,     // no single review moves a lane more than 2%
      minResponses: 5             // and not at all under this many responses
    },

    // --- The whole lane adjustment, combined --------------------------------
    combined: {
      min: 1.00,
      max: 1.25,                  // a lane alone may not exceed +25%
      manualReviewAbove: 1.40     // lane × urgency above this → manual review
    }
  };

  // ===========================================================================
  // 2. THE FALLBACK LADDER
  //     lane evidence  →  region pair  →  destination area band  →  1.00
  //     Each rung says WHY it was used, so a quote can always be explained.
  // ===========================================================================

  // Postcode area → region. Used only for the region-pair fallback, so a brand
  // new lane between two known regions still behaves sensibly on day one.
  var AREA_REGION = {
    // North West
    M:"NW", BL:"NW", OL:"NW", SK:"NW", WA:"NW", WN:"NW", PR:"NW", BB:"NW", FY:"NW",
    L:"NW", CH:"NW", CW:"NW", LA:"NW", CA:"NW",
    // Yorkshire & Humber
    S:"YH", LS:"YH", BD:"YH", HD:"YH", HX:"YH", WF:"YH", DN:"YH", YO:"YH", HU:"YH", HG:"YH",
    // North East
    NE:"NE", SR:"NE", DH:"NE", DL:"NE", TS:"NE",
    // Midlands
    B:"MID", CV:"MID", DY:"MID", WS:"MID", WV:"MID", ST:"MID", TF:"MID", WR:"MID", HR:"MID",
    DE:"MID", NG:"MID", LE:"MID", LN:"MID", NN:"MID", PE:"MID",
    // London & South East
    E:"LON", EC:"LON", N:"LON", NW:"LON", SE:"LON", SW:"LON", W:"LON", WC:"LON",
    BR:"LON", CR:"LON", DA:"LON", EN:"LON", HA:"LON", IG:"LON", KT:"LON", RM:"LON",
    SM:"LON", TW:"LON", UB:"LON", WD:"LON",
    SL:"SE", RG:"SE", OX:"SE", MK:"SE", LU:"SE", AL:"SE", HP:"SE", GU:"SE", RH:"SE",
    TN:"SE", ME:"SE", CT:"SE", BN:"SE", PO:"SE", SO:"SE", SP:"SE",
    // East
    CB:"EAST", CM:"EAST", CO:"EAST", IP:"EAST", NR:"EAST", SS:"EAST", SG:"EAST",
    // South West
    BS:"SW", BA:"SW", GL:"SW", SN:"SW", TA:"SW", DT:"SW", EX:"SW", PL:"SW", TQ:"SW", TR:"SW",
    // Wales
    CF:"WAL", NP:"WAL", SA:"WAL", LD:"WAL", SY:"WAL", LL:"WAL",
    // Scotland
    G:"SCO", EH:"SCO", KA:"SCO", ML:"SCO", PA:"SCO", FK:"SCO", KY:"SCO", DD:"SCO",
    AB:"SCO", PH:"SCO", IV:"SCO", KW:"SCO", HS:"SCO", ZE:"SCO", DG:"SCO", TD:"SCO"
  };

  // The destination-area grades that have always been live. Kept EXACTLY as
  // they are so the bottom rung of the ladder is today's behaviour, unchanged.
  var LEGACY_STRONG = ("M B LS S L NG LE CV BS E EC N NW SE SW W WC G EH NE SR DN WF BD HD OL " +
    "SK WA WN BL PR ST WS WV DY DE SL RG MK LU WD EN HA UB TW KT SM CR BR RM IG").split(" ");
  var LEGACY_REMOTE  = "IV KW PH HS ZE AB DG TD TR LD SA".split(" ");
  var LEGACY_LIMITED = "LL SY EX TQ PL DT TA LN NR IP CT TN BN PO CA LA FY YO HU CO CM".split(" ");

  function toSet(list) { var o = {}, i; for (i = 0; i < list.length; i++) o[list[i]] = 1; return o; }
  var STRONG = toSet(LEGACY_STRONG), REMOTE = toSet(LEGACY_REMOTE), LIMITED = toSet(LEGACY_LIMITED);

  function areaOf(pc) {
    var m = String(pc == null ? "" : pc).trim().match(/^[A-Z]+/i);
    return m ? m[0].toUpperCase() : "";
  }

  function laneKey(fromPc, toPc) { return areaOf(fromPc) + ">" + areaOf(toPc); }

  function legacyAreaFactor(toPc) {
    var a = areaOf(toPc);
    if (REMOTE[a]) return 1.12;
    if (LIMITED[a]) return 1.07;
    if (STRONG[a]) return 1.00;
    return 1.03;
  }

  // ===========================================================================
  // 3. THE LANE STORE
  //     Learned records, keyed "S>M". Seeded empty on purpose: with no finished
  //     jobs the network has no evidence, and inventing some would be worse
  //     than waiting. `learn()` fills this from real job statistics.
  // ===========================================================================
  var lanes = {};

  // Region-pair defaults. Only ROAD is defaulted here, and only from published
  // road geography (motorway spine vs cross-country), never from guessed
  // demand or guessed return loads — those two must be earned from real jobs.
  var regionPairRoad = {};

  // ===========================================================================
  // 4. THE FOUR PARTS
  // ===========================================================================

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function round3(n) { return Math.round((n + Number.EPSILON) * 1000) / 1000; }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  /* ROAD — from average moving speed. Slower than the rate card's reference
     speed means more fuel per mile and more of the driver's day per mile, so
     the lane pays more. Faster never pays less: floor 1.00. */
  function roadFactorFromMph(mph) {
    var r = config.road;
    if (!isFinite(mph) || mph <= 0) return { factor: 1.00, mph: null, known: false };
    var shortfall = (r.referenceMph / mph) - 1;          // >0 when slower than reference
    var f = clamp(1 + shortfall * r.sensitivity, r.min, r.max);
    return { factor: round3(f), mph: round2(mph), known: true };
  }

  function roadFactorFromLeg(miles, minutes) {
    if (!isFinite(miles) || miles <= 0 || !isFinite(minutes) || minutes <= 0)
      return { factor: 1.00, mph: null, known: false };
    return roadFactorFromMph(miles / (minutes / 60));
  }

  /* RETURN LOAD — banded from the measured return rate. */
  function returnBandFor(rate) {
    var b = config.returnLoad.bands, i;
    if (!isFinite(rate)) return null;
    for (i = 0; i < b.length; i++) if (rate >= b[i].minRate) return b[i];
    return b[b.length - 1];
  }

  /* DEMAND — banded from jobs posted ÷ driver-days available. */
  function demandBandFor(ratio) {
    var b = config.demand.bands, i;
    if (!isFinite(ratio) || ratio < 0) return null;
    for (i = 0; i < b.length; i++)
      if (b[i].maxRatio === null || ratio <= b[i].maxRatio) return b[i];
    return b[b.length - 1];
  }

  /* FEEDBACK — bounded, and only once enough people have spoken. */
  function feedbackFactorFor(rec) {
    var f = config.feedback;
    if (!rec || !isFinite(rec.factor)) return 1.00;
    if (!isFinite(rec.responses) || rec.responses < f.minResponses) return 1.00;
    return clamp(rec.factor, f.min, f.max);
  }

  // ===========================================================================
  // 5. THE ONE CALL THE PRICING ENGINE MAKES
  // ===========================================================================
  /**
   * laneFactor(fromPc, toPc, ctx)
   *   ctx.miles   — road miles for THIS job (optional)
   *   ctx.minutes — driving minutes for THIS job (optional)
   *
   * Returns { factor, basis, parts, sampleSize, reasons }. `basis` names which
   * rung of the ladder answered, so every quote can be explained in a sentence.
   */
  function laneFactor(fromPc, toPc, ctx) {
    var c = ctx || {};
    var key = laneKey(fromPc, toPc);
    var rec = lanes[key];
    var reasons = [];
    var parts = { road: 1.00, returnLoad: 1.00, demand: 1.00, feedback: 1.00 };
    var basis = "AREA_DEFAULT";
    var sample = 0;

    // --- Rung 1: the lane's own evidence -----------------------------------
    if (rec && isFinite(rec.sampleSize) && rec.sampleSize >= config.minSampleSize) {
      basis = "LANE_EVIDENCE";
      sample = rec.sampleSize;

      var road = isFinite(rec.avgMph)
        ? roadFactorFromMph(rec.avgMph)
        : roadFactorFromLeg(c.miles, c.minutes);
      if (road.known) {
        parts.road = road.factor;
        if (road.factor > 1)
          reasons.push("Road: this lane averages " + road.mph + " mph against a " +
            config.road.referenceMph + " mph standard, so it burns more fuel and more of the driver's day (+" +
            Math.round((road.factor - 1) * 100) + "%).");
      }

      var rb = returnBandFor(rec.returnRate);
      if (rb) {
        parts.returnLoad = rb.factor;
        if (rb.factor > 1)
          reasons.push("Return load: " + rb.label + " (" +
            Math.round(rec.returnRate * 100) + "% of drivers found paid work back within " +
            config.returnLoad.returnWindowHours + " hours), +" + Math.round((rb.factor - 1) * 100) + "%.");
      }

      var db = demandBandFor(rec.demandRatio);
      if (db) {
        parts.demand = db.factor;
        if (db.factor > 1)
          reasons.push("Demand: " + db.label + " — " + round2(rec.demandRatio) +
            " jobs for every driver-day offered, +" + Math.round((db.factor - 1) * 100) + "%.");
      }

      parts.feedback = feedbackFactorFor(rec.feedback);
      if (parts.feedback !== 1.00)
        reasons.push("Feedback from " + rec.feedback.responses + " drivers and customers on this lane: " +
          (parts.feedback > 1 ? "+" : "") + Math.round((parts.feedback - 1) * 100) + "%.");

    // --- Rung 2: the region pair -------------------------------------------
    } else {
      var rp = regionPairRoad[(AREA_REGION[areaOf(fromPc)] || "?") + ">" + (AREA_REGION[areaOf(toPc)] || "?")];
      var legRoad = roadFactorFromLeg(c.miles, c.minutes);

      if (rp && isFinite(rp.avgMph)) {
        basis = "REGION_PAIR";
        parts.road = roadFactorFromMph(rp.avgMph).factor;
        if (parts.road > 1)
          reasons.push("Road: routes between these regions average " + round2(rp.avgMph) +
            " mph, below the " + config.road.referenceMph + " mph standard (+" +
            Math.round((parts.road - 1) * 100) + "%).");
      } else if (legRoad.known) {
        // Rung 2b: no lane history and no region default, but we DO know how
        // this particular job drives. Use the job's own speed rather than
        // pretend we know nothing.
        basis = "THIS_JOURNEY";
        parts.road = legRoad.factor;
        if (parts.road > 1)
          reasons.push("Road: this journey averages " + legRoad.mph + " mph against a " +
            config.road.referenceMph + " mph standard (+" +
            Math.round((parts.road - 1) * 100) + "%).");
      }

      // --- Rung 3: the destination-area grade that has always been live.
      //     Applied on the RETURN LOAD slot, because that is exactly what the
      //     old zone grade was measuring.
      parts.returnLoad = legacyAreaFactor(toPc);
      if (parts.returnLoad > 1)
        reasons.push("Return load: " + areaOf(toPc) +
          " is graded as harder to get a paid load back from (+" +
          Math.round((parts.returnLoad - 1) * 100) + "%). This lane has " +
          (rec ? rec.sampleSize : 0) + " finished jobs behind it — it needs " +
          config.minSampleSize + " before it prices on its own numbers.");
    }

    var raw = parts.road * parts.returnLoad * parts.demand * parts.feedback;
    var factor = clamp(round3(raw), config.combined.min, config.combined.max);
    if (round3(raw) > config.combined.max)
      reasons.push("Lane adjustment capped at +" +
        Math.round((config.combined.max - 1) * 100) + "%; the rest goes to manual review.");

    return {
      key: key,
      factor: factor,
      rawFactor: round3(raw),
      capped: round3(raw) > config.combined.max,
      basis: basis,
      parts: parts,
      sampleSize: sample,
      reasons: reasons
    };
  }

  // ===========================================================================
  // 6. LEARNING — how the lanes get their numbers
  //     Called by the nightly job with statistics computed from FINISHED jobs
  //     in PLNA and KNECT, plus the lane feedback table. Nothing here invents a
  //     number: a lane with no rows simply does not appear.
  // ===========================================================================
  /**
   * learn(rows) — rows are lane statistics, each:
   *   { from, to, jobs, avgMiles, avgMinutes, returnsWithinWindow,
   *     driverDaysOffered, feedbackFactor, feedbackResponses }
   * Returns a summary of what moved, so the nightly job can report it.
   */
  function learn(rows) {
    var applied = [], skipped = [], i, r, key, avgMph, rec;
    rows = rows || [];
    for (i = 0; i < rows.length; i++) {
      r = rows[i] || {};
      key = areaOf(r.from) + ">" + areaOf(r.to);
      if (!areaOf(r.from) || !areaOf(r.to)) { skipped.push({ key: key, why: "unreadable postcode" }); continue; }
      if (!isFinite(r.jobs) || r.jobs <= 0) { skipped.push({ key: key, why: "no finished jobs" }); continue; }

      avgMph = (isFinite(r.avgMiles) && isFinite(r.avgMinutes) && r.avgMinutes > 0)
        ? r.avgMiles / (r.avgMinutes / 60) : null;

      rec = {
        sampleSize: r.jobs,
        avgMiles: isFinite(r.avgMiles) ? round2(r.avgMiles) : null,
        avgMinutes: isFinite(r.avgMinutes) ? round2(r.avgMinutes) : null,
        avgMph: avgMph === null ? null : round2(avgMph),
        returnRate: (isFinite(r.returnsWithinWindow) && r.jobs > 0) ? round3(r.returnsWithinWindow / r.jobs) : null,
        demandRatio: (isFinite(r.driverDaysOffered) && r.driverDaysOffered > 0)
          ? round3(r.jobs / r.driverDaysOffered) : null,
        feedback: {
          factor: isFinite(r.feedbackFactor) ? clamp(r.feedbackFactor, config.feedback.min, config.feedback.max) : 1.00,
          responses: isFinite(r.feedbackResponses) ? r.feedbackResponses : 0
        },
        learnedAt: r.asOf || null
      };

      lanes[key] = rec;
      applied.push({
        key: key,
        jobs: rec.sampleSize,
        pricesOnOwnNumbers: rec.sampleSize >= config.minSampleSize,
        factor: laneFactor(r.from, r.to, { miles: rec.avgMiles, minutes: rec.avgMinutes }).factor
      });
    }
    return { applied: applied, skipped: skipped, lanesHeld: Object.keys(lanes).length };
  }

  /* Apply one piece of lane feedback. Bounded per review so no single voice
     moves a lane far, and every move carries who said it and why. */
  function applyFeedback(fromPc, toPc, direction, note, author) {
    var key = areaOf(fromPc) + ">" + areaOf(toPc);
    var f = config.feedback;
    var rec = lanes[key] || (lanes[key] = { sampleSize: 0, feedback: { factor: 1.00, responses: 0 } });
    if (!rec.feedback) rec.feedback = { factor: 1.00, responses: 0 };
    var step = direction === "UNDERPAID" ? f.maxStepPerReview
             : direction === "TOO_DEAR" ? -f.maxStepPerReview : 0;
    var before = rec.feedback.factor;
    rec.feedback.factor = clamp(round3(before + step), f.min, f.max);
    rec.feedback.responses += 1;
    return {
      key: key, before: before, after: rec.feedback.factor,
      responses: rec.feedback.responses,
      counted: rec.feedback.responses >= f.minResponses,
      note: note || null, author: author || null
    };
  }

  // ===========================================================================
  // 7. ADMIN / TESTING SURFACE
  // ===========================================================================
  function setConfig(patch) {
    var k; patch = patch || {};
    for (k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) config[k] = patch[k];
    return config;
  }
  function setLanes(map) { lanes = map || {}; return lanes; }
  function setRegionPairRoad(map) { regionPairRoad = map || {}; return regionPairRoad; }
  function snapshot() { return JSON.parse(JSON.stringify({ config: config, lanes: lanes, regionPairRoad: regionPairRoad })); }
  function reset() { lanes = {}; regionPairRoad = {}; return true; }

  return {
    version: config.version,
    config: config,
    laneFactor: laneFactor,
    laneKey: laneKey,
    areaOf: areaOf,
    areaRegion: AREA_REGION,
    legacyAreaFactor: legacyAreaFactor,
    roadFactorFromMph: roadFactorFromMph,
    roadFactorFromLeg: roadFactorFromLeg,
    returnBandFor: returnBandFor,
    demandBandFor: demandBandFor,
    learn: learn,
    applyFeedback: applyFeedback,
    setConfig: setConfig,
    setLanes: setLanes,
    setRegionPairRoad: setRegionPairRoad,
    snapshot: snapshot,
    reset: reset
  };
});

  return self.HAFLaneFactors;
}
