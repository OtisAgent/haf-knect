/* ===========================================================================
 * HAF REVENUE MODEL — REVENUE-V1
 * ---------------------------------------------------------------------------
 * Source of truth: "OTIS — HAF Network Pricing Formula", Brent, 2026-08-02
 * (document b34c0c47), sections 10, 11 and 12. This module is the answer to
 * his instruction: "use this framework to help guide where HAF makes the
 * revenue for the network and the business of HAF".
 *
 * It does ONE job the pricing engine deliberately does not do:
 *
 *   The pricing engine answers "what does this job cost the customer?"
 *   This module answers "what did HAF actually EARN, and from which stream?"
 *
 * Four revenue streams (§10), kept apart on purpose:
 *
 *   A. DELIVERY    — the HAF network fee on each job. The network's revenue.
 *   B. SUBSCRIPTION— PLNA / Freight / Fleet / KNECT memberships. Recurring.
 *   C. PAYROLL     — payroll block fees and authorised transaction fees.
 *   D. SERVICES    — relay, storage, credit, compliance, AI, admin, pages.
 *
 * §12.6 is a hard rule, not a preference: subscription revenue is NEVER
 * delivery margin. `deliveryMargin()` below physically refuses to sum a
 * non-delivery line, so the two can never be blended by accident.
 *
 * WHAT THIS MODULE DOES NOT DO: it does not invent a price. Subscription,
 * payroll and service amounts are RECORDED here, never set here — the fleet
 * band figures are still contested between two of Brent's own documents
 * (V7 §9.4) and CleverPay's fee is the CleverPay team's to set, never a HAF
 * pricing lever (wiki: cleverpay-fee-rule-invoice-only). A ledger, not a
 * price list.
 *
 * Works in browser + Node, no dependencies. Pairs with pricing-matrix-v3.js.
 * =========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HAFRevenueModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function num(n) { return Number(n) || 0; }

  // ===========================================================================
  // 1. THE FOUR STREAMS (§10)
  // ===========================================================================
  var STREAMS = {
    DELIVERY: {
      code: "DELIVERY",
      name: "Delivery network revenue",
      plain: "The HAF network fee on every job the network moves.",
      docSection: "10.A",
      perJob: true
    },
    SUBSCRIPTION: {
      code: "SUBSCRIPTION",
      name: "Account subscription revenue",
      plain: "Recurring money: PLNA Plus and Pro, Freight Plus and Pro, fleet " +
             "accounts, paid HAF KNECT memberships, and any recurring page or " +
             "service fee.",
      docSection: "10.B",
      perJob: false
    },
    PAYROLL: {
      code: "PAYROLL",
      name: "Payroll and processing revenue",
      plain: "Payment-run block fees and authorised transaction fees. " +
             "Recorded on its own line and never hidden inside a delivery fee.",
      docSection: "10.C",
      perJob: false
    },
    SERVICES: {
      code: "SERVICES",
      name: "Additional HAF services",
      plain: "Relay, storage, account management, credit, priority allocation, " +
             "compliance, landing pages, AI services, administration.",
      docSection: "10.D",
      perJob: false
    }
  };

  // Every income line HAF has, mapped to its stream. `billing` decides the
  // stream where the document lists an item twice: landing pages appear under
  // both §10.B and §10.D, so the rule is how it is CHARGED — a recurring
  // charge is a subscription, a one-off or usage charge is a service.
  var INCOME_LINES = [
    { code: "NETWORK_FEE",        stream: "DELIVERY",     billing: "PER_JOB",    name: "HAF network fee" },
    { code: "CUSTOMER_CHARGE",    stream: "DELIVERY",     billing: "PER_JOB",    name: "Customer-specific charge (HAF-retained)" },
    { code: "PLNA_PLUS",          stream: "SUBSCRIPTION", billing: "RECURRING",  name: "PLNA Plus subscription" },
    { code: "PLNA_PRO",           stream: "SUBSCRIPTION", billing: "RECURRING",  name: "PLNA Pro subscription" },
    { code: "FREIGHT_PLUS",       stream: "SUBSCRIPTION", billing: "RECURRING",  name: "Freight Forwarder Plus subscription" },
    { code: "FREIGHT_PRO",        stream: "SUBSCRIPTION", billing: "RECURRING",  name: "Freight Forwarder Pro subscription" },
    { code: "FLEET_ACCOUNT",      stream: "SUBSCRIPTION", billing: "RECURRING",  name: "Fleet account subscription" },
    { code: "KNECT_MEMBERSHIP",   stream: "SUBSCRIPTION", billing: "RECURRING",  name: "HAF KNECT paid membership" },
    { code: "LANDING_PAGE_SUB",   stream: "SUBSCRIPTION", billing: "RECURRING",  name: "Landing page / website subscription" },
    { code: "PAYROLL_BLOCK_FEE",  stream: "PAYROLL",      billing: "PER_INVOICE",name: "Payment-run block fee" },
    { code: "TRANSACTION_FEE",    stream: "PAYROLL",      billing: "PER_INVOICE",name: "Authorised transaction fee" },
    { code: "RELAY_SERVICE",      stream: "SERVICES",     billing: "ONE_OFF",    name: "Relay service" },
    { code: "STORAGE",            stream: "SERVICES",     billing: "ONE_OFF",    name: "Storage" },
    { code: "ACCOUNT_MANAGEMENT", stream: "SERVICES",     billing: "ONE_OFF",    name: "Account management" },
    { code: "CREDIT_SERVICE",     stream: "SERVICES",     billing: "ONE_OFF",    name: "Credit services" },
    { code: "PRIORITY_ALLOCATION",stream: "SERVICES",     billing: "ONE_OFF",    name: "Priority allocation" },
    { code: "COMPLIANCE_SERVICE", stream: "SERVICES",     billing: "ONE_OFF",    name: "Compliance services" },
    { code: "LANDING_PAGE_BUILD", stream: "SERVICES",     billing: "ONE_OFF",    name: "Landing page build" },
    { code: "AI_SERVICE",         stream: "SERVICES",     billing: "ONE_OFF",    name: "AI services" },
    { code: "ADMIN_SERVICE",      stream: "SERVICES",     billing: "ONE_OFF",    name: "Administration services" }
  ];

  function lineFor(code) {
    for (var i = 0; i < INCOME_LINES.length; i++)
      if (INCOME_LINES[i].code === code) return INCOME_LINES[i];
    return null;
  }

  // ===========================================================================
  // 2. CONFIG — costs, not prices
  // ===========================================================================
  var config = {
    version: "REVENUE-V1",
    effectiveFrom: "2026-08-02",
    vatPct: 20,

    // Payment processing cost per job (§11). DELIBERATELY ZERO BY DEFAULT.
    // CleverPay charges only when an invoice is generated — no work, no
    // invoice, no charge — and the amount is the CleverPay team's to set, per
    // driver per payment run, not per delivery (Brent, 2026-07-29). So this is
    // supplied by the caller when a real invoice exists; it is never assumed.
    // Guessing a number here would put invented costs into HAF's profit.
    processing: {
      perJobGbp: 0,
      basis: "SUPPLIED_PER_INVOICE",
      note: "CleverPay charges on invoice generation only; the fee belongs to " +
            "the CleverPay team and is recorded in the PAYROLL stream, never " +
            "deducted from delivery margin unless HAF actually bears it."
    },

    // Where a customer-specific charge goes if the caller does not say.
    // HAF-retained by default would quietly inflate margin, so the safe
    // default is pass-through: it changes nobody's profit until classified.
    defaultChargeTo: "PASS_THROUGH"     // "HAF" | "DRIVER" | "PASS_THROUGH"
  };

  // ===========================================================================
  // 3. PER-JOB REVENUE (§11 + §12.8)
  // ---------------------------------------------------------------------------
  // Takes a quote from pricing-matrix-v3.js `price()` and produces the exact
  // financial breakdown §12.8 demands, plus HAF gross profit per §11.
  //
  // ⚠️ THE DOUBLE-COUNT TRAP, handled explicitly.
  // §11 says gross profit = network fee − HAF-funded job costs − processing −
  // pools − approved discounts. But under FRAMEWORK-V7 the engine already
  // takes the funded driver reward out of the network fee (the fee is the gap
  // between the customer price and the driver's FULL pay). Subtracting it a
  // second time would understate HAF's profit on every rewarded job. So:
  //
  //   networkFeeBeforeFundedCosts = customer price − driver pay at the free rate
  //   hafFundedJobCosts           = the reward HAF paid for
  //   networkFeeGbp (reported)    = the first minus the second  ← engine's number
  //
  // Same for the account discount. The account's fee reduction is already
  // inside the effective percentage, so it is reported as revenue FOREGONE
  // (visible, informative) and NOT deducted again. Only discounts applied on
  // top of the fee — promotional or goodwill — are deducted.
  // ===========================================================================
  function jobRevenue(quote, opts) {
    opts = opts || {};
    if (!quote || !quote.money) throw new Error("jobRevenue: needs a quote from HAFPricingMatrix.price()");
    var m = quote.money;

    // --- Customer-specific charges (§2 "Any Customer-Specific Charges") -----
    var charges = [];
    var chargesToHaf = 0, chargesToDriver = 0, chargesPassThrough = 0;
    var rawCharges = opts.customerCharges || [];
    for (var i = 0; i < rawCharges.length; i++) {
      var c = rawCharges[i];
      var to = c.to || config.defaultChargeTo;
      var gbp = round2(num(c.gbp));
      charges.push({ label: c.label || "Customer charge", gbp: gbp, to: to });
      if (to === "HAF") chargesToHaf = round2(chargesToHaf + gbp);
      else if (to === "DRIVER") chargesToDriver = round2(chargesToDriver + gbp);
      else chargesPassThrough = round2(chargesPassThrough + gbp);
    }
    var chargesTotal = round2(chargesToHaf + chargesToDriver + chargesPassThrough);

    // --- The three amounts, never blended (§1) ------------------------------
    var driverPayable = round2(m.driverPayGbp + chargesToDriver);
    var networkFee    = round2(m.networkFeeGbp + chargesToHaf);
    var customerExVat = round2(m.customerExVatGbp + chargesTotal);
    var vat           = round2(customerExVat * config.vatPct / 100);
    var customerIncVat= round2(customerExVat + vat);

    // --- §11 deductions, each one shown ------------------------------------
    var fundedCosts = (m.driverRewardFundedBy === "HAF_MARGIN")
      ? round2(num(m.driverRewardGbp)) : 0;
    var feeBeforeFunded = round2(networkFee + fundedCosts);

    var processingCost = opts.processingCostGbp != null
      ? round2(num(opts.processingCostGbp))
      : round2(config.processing.perJobGbp);

    var poolContribution = quote.pools && quote.pools.active
      ? round2(num(quote.pools.active.totalGbp)) : 0;

    var approvedDiscounts = round2(num(opts.approvedDiscountsGbp));

    // Revenue foregone by the posting account's fee reduction — reported, not
    // deducted (it is already inside the effective percentage).
    var reductionPts = quote.account ? num(quote.account.feeReductionAppliedPts) : 0;
    var foregoneByAccount = 0;
    if (reductionPts > 0 && customerExVat > 0) {
      var stdPct = round2(num(m.hafMarginPct) + reductionPts);
      var transport = num(m.customerPriceBasisGbp) || num(m.driverPayGbp);
      var feeAtStandard = (m.feeBasis === "ADDED_TO_TRANSPORT_VALUE")
        ? round2(transport * stdPct / 100)
        : round2(transport / (1 - Math.min(stdPct, 95) / 100) - transport);
      foregoneByAccount = round2(Math.max(0, feeAtStandard - round2(m.networkFeeGbp + fundedCosts)));
    }

    var grossProfit = round2(
      feeBeforeFunded - fundedCosts - processingCost - poolContribution - approvedDiscounts
    );

    return {
      version: config.version,
      engineVersion: quote.version,
      feeBasis: m.feeBasis,

      // ---- §12.8: the breakdown every job must show, in this order --------
      breakdown: {
        driverPayableGbp:   driverPayable,
        hafNetworkFeeGbp:   networkFee,
        otherChargesGbp:    round2(chargesPassThrough),
        customerExVatGbp:   customerExVat,
        vatGbp:             vat,
        customerIncVatGbp:  customerIncVat,
        hafGrossProfitGbp:  grossProfit
      },

      // ---- §11: how the fee became profit, line by line -------------------
      grossProfit: {
        networkFeeBeforeFundedCostsGbp: feeBeforeFunded,
        lessHafFundedJobCostsGbp:       fundedCosts,
        lessPaymentProcessingGbp:       processingCost,
        lessNetworkPoolContributionGbp: poolContribution,
        lessApprovedDiscountsGbp:       approvedDiscounts,
        grossProfitGbp:                 grossProfit,
        grossProfitPctOfCustomer:       customerExVat > 0 ? round2(grossProfit / customerExVat * 100) : 0,
        processingBasis:                opts.processingCostGbp != null ? "SUPPLIED" : config.processing.basis
      },

      // ---- Context that makes the numbers readable ------------------------
      context: {
        customerChargeLines:    charges,
        chargesToHafGbp:        chargesToHaf,
        chargesToDriverGbp:     chargesToDriver,
        chargesPassThroughGbp:  chargesPassThrough,
        accountFeeReductionPts: reductionPts,
        revenueForegoneByAccountGbp: foregoneByAccount,
        poolPhase:              quote.pools ? quote.pools.phase : null,
        driverRewardFundedBy:   m.driverRewardFundedBy,
        driverRewardGbp:        round2(num(m.driverRewardGbp))
      },

      // ---- What this job contributed, by stream (§10) ----------------------
      streamLines: [
        { stream: "DELIVERY", code: "NETWORK_FEE", gbp: round2(m.networkFeeGbp), label: "HAF network fee" }
      ].concat(chargesToHaf > 0
        ? [{ stream: "DELIVERY", code: "CUSTOMER_CHARGE", gbp: chargesToHaf, label: "Customer-specific charge" }]
        : []),

      reasons: buildReasons(m, driverPayable, networkFee, customerExVat, grossProfit,
                            fundedCosts, poolContribution, processingCost, approvedDiscounts)
    };
  }

  function buildReasons(m, driverPayable, fee, customerExVat, profit, funded, pools, processing, discounts) {
    var r = [];
    r.push("The driver is paid £" + driverPayable + ". HAF's fee of £" + fee +
           " sits on top of that, so the customer pays £" + customerExVat + " before VAT.");
    r.push(m.feeBasis === "ADDED_TO_TRANSPORT_VALUE"
      ? "The percentage is charged ON TOP of the driver's price (" + m.networkFeePct +
        "% of £" + m.driverPayGbp + ")."
      : "The percentage is the share of the customer's price HAF keeps (" +
        m.hafKeepsPctOfCustomer + "% of £" + m.customerExVatGbp + ").");
    if (funded > 0) r.push("HAF funded £" + funded + " of driver reward out of its own fee.");
    if (pools > 0) r.push("£" + pools + " of the fee goes back into the network pools.");
    if (processing > 0) r.push("£" + processing + " of payment processing was charged to this job.");
    if (discounts > 0) r.push("£" + discounts + " of approved discount was given on top of the account rate.");
    r.push("HAF's gross profit on this job is £" + profit + ".");
    return r;
  }

  // ===========================================================================
  // 4. THE LEDGER — every stream, kept apart (§10, §12.6)
  // ===========================================================================
  function createLedger() {
    var lines = [];
    return {
      /* Record any income line. Throws on an unknown code rather than letting
         unclassified money land in a bucket by accident. */
      record: function (entry) {
        var def = lineFor(entry.code);
        if (!def) throw new Error("Unknown income line: " + entry.code +
          " — add it to INCOME_LINES with its stream before recording it.");
        lines.push({
          code: def.code, stream: def.stream, name: def.name,
          billing: def.billing, gbp: round2(num(entry.gbp)),
          ref: entry.ref || null, period: entry.period || null
        });
        return this;
      },
      /* Record a priced job's delivery contribution straight from a quote. */
      recordJob: function (revenue, ref) {
        for (var i = 0; i < revenue.streamLines.length; i++) {
          var l = revenue.streamLines[i];
          this.record({ code: l.code, gbp: l.gbp, ref: ref || null });
        }
        return this;
      },
      lines: function () { return lines.slice(); },
      /* §12.6 ENFORCED: delivery margin sums the DELIVERY stream and nothing
         else. A subscription pound can never be reported as delivery margin. */
      deliveryMargin: function () {
        var t = 0;
        for (var i = 0; i < lines.length; i++)
          if (lines[i].stream === "DELIVERY") t = round2(t + lines[i].gbp);
        return t;
      },
      byStream: function () {
        var out = {};
        for (var k in STREAMS) out[k] = { name: STREAMS[k].name, gbp: 0, lines: 0 };
        for (var i = 0; i < lines.length; i++) {
          out[lines[i].stream].gbp = round2(out[lines[i].stream].gbp + lines[i].gbp);
          out[lines[i].stream].lines++;
        }
        return out;
      },
      total: function () {
        var t = 0;
        for (var i = 0; i < lines.length; i++) t = round2(t + lines[i].gbp);
        return t;
      }
    };
  }

  // ===========================================================================
  // 5. QUOTE SNAPSHOT — §12.9 and §12.10
  // ---------------------------------------------------------------------------
  // §12.9: every calculation stores the account types and fee rules used at
  //        the time the quote was created.
  // §12.10: a confirmed quote must not change because an account's pricing
  //        rules are changed later.
  // A snapshot freezes the rules AND the price, with a fingerprint so any
  // later drift is provable rather than argued about.
  // ===========================================================================
  function fingerprint(obj) {
    var s = JSON.stringify(obj), h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function snapshotQuote(quote, meta) {
    meta = meta || {};
    var rules = {
      engineVersion: quote.version,
      feeBasis: quote.money.feeBasis,
      networkFeePct: quote.money.networkFeePct,
      accountLevel: quote.account ? quote.account.level : null,
      accountFeeReductionPts: quote.account ? quote.account.feeReductionAppliedPts : null,
      driverLevel: quote.rates ? quote.rates.driverLevel : null,
      driverRewardGbpPerMile: quote.rates ? quote.rates.driverRewardGbpPerMile : null,
      driverRewardFundedBy: quote.money.driverRewardFundedBy,
      vehicleBaseRate: quote.rates ? quote.rates.vehicleBaseRate : null,
      laneKey: quote.lane ? quote.lane.key : null,
      laneFactor: quote.lane ? quote.lane.factor : null,
      laneFrom: quote.lane ? (quote.lane.from || null) : null,
      laneTo: quote.lane ? (quote.lane.to || null) : null,
      poolPhase: quote.pools ? quote.pools.phase : null,
      accountTypes: {
        posting: quote.inputs ? quote.inputs.accountType : null,
        plnaTier: quote.inputs ? quote.inputs.plnaTier : null,
        knectTier: quote.inputs ? quote.inputs.knectTier : null,
        driverFleetTier: quote.inputs ? quote.inputs.driverFleetTier : null
      }
    };
    var price = {
      driverPayGbp: quote.money.driverPayGbp,
      networkFeeGbp: quote.money.networkFeeGbp,
      customerExVatGbp: quote.money.customerExVatGbp,
      customerIncVatGbp: quote.money.customerIncVatGbp
    };
    return {
      quoteRef: meta.quoteRef || null,
      confirmed: !!meta.confirmed,
      confirmedAt: meta.confirmedAt || null,
      rulesAtQuoteTime: rules,
      priceAtQuoteTime: price,
      inputs: quote.inputs || null,
      fingerprint: fingerprint({ rules: rules, price: price })
    };
  }

  /* The audit record names its inputs differently from the arguments price()
     takes (`vehicle` vs `vehicleCode`). Replaying a snapshot through the wrong
     key names silently prices a DIFFERENT job — it defaults every unmatched
     field — so the mapping is explicit here rather than assumed. */
  function replayInput(snapshot) {
    var i = snapshot.inputs || {};
    return {
      miles: i.miles,
      vehicleCode: i.vehicle,
      jobTypeCode: i.jobType,
      plnaTier: i.plnaTier,
      knectTier: i.knectTier,
      accountType: i.accountType,
      driverFleetTier: i.driverFleetTier,
      driverIsKnectMember: i.driverIsKnectMember,
      weight: i.weight,
      handling: i.handling,
      extraStops: i.extraStops,
      waitingHours: i.waitingHours,
      isDirectBooking: i.isDirectBooking,
      fromPostcode: snapshot.rulesAtQuoteTime ? snapshot.rulesAtQuoteTime.laneFrom : null,
      toPostcode: snapshot.rulesAtQuoteTime ? snapshot.rulesAtQuoteTime.laneTo : null
    };
  }

  /* Re-check a snapshot against today's engine. A CONFIRMED quote always holds
     its own price — this reports whether the rules have moved under it, so a
     later rule change is visible instead of silently re-pricing a live job. */
  function verifySnapshot(snapshot, engine, extraInput) {
    if (!snapshot || !snapshot.inputs) throw new Error("verifySnapshot: snapshot has no inputs to replay");
    var replay = engine.price(Object.assign(replayInput(snapshot), extraInput || {}));
    var now = snapshotQuote(replay, { quoteRef: snapshot.quoteRef });
    var drift = now.fingerprint !== snapshot.fingerprint;
    return {
      quoteRef: snapshot.quoteRef,
      confirmed: snapshot.confirmed,
      rulesChanged: drift,
      // §12.10: a confirmed quote is honoured at its own price, always.
      priceThatHolds: snapshot.confirmed ? snapshot.priceAtQuoteTime : now.priceAtQuoteTime,
      priceIfRequotedToday: now.priceAtQuoteTime,
      differenceGbp: round2(now.priceAtQuoteTime.customerExVatGbp - snapshot.priceAtQuoteTime.customerExVatGbp),
      note: snapshot.confirmed && drift
        ? "The pricing rules have changed since this quote was confirmed. The confirmed price stands (§12.10)."
        : drift
          ? "The pricing rules have changed since this quote was created and it was never confirmed, so it would requote."
          : "Nothing has moved since this quote was created."
    };
  }

  // ===========================================================================
  // 6. PUBLIC API
  // ===========================================================================
  return {
    version: config.version,
    config: config,
    STREAMS: STREAMS,
    INCOME_LINES: INCOME_LINES,
    lineFor: lineFor,
    jobRevenue: jobRevenue,
    createLedger: createLedger,
    snapshotQuote: snapshotQuote,
    verifySnapshot: verifySnapshot,
    round2: round2
  };
});
