/* ============================================================================
 * HAF — Account Fees & CleverPay Payment Runs  (ACCOUNT-FEES-V1)
 *
 * The single source of truth for what an ACCOUNT pays: subscriptions, driver
 * seats, and CleverPay payment-run fees. Sits alongside pricing-matrix-v3.js
 * (which prices JOBS). Neither module touches the other's numbers.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE  (Brent, 2026-07-29):
 *
 *   CleverPay only charges when an invoice is generated.
 *   No work, no invoice, no charge.
 *
 * Consequences, all implemented below and all covered by tests:
 *  - A payment-run fee is the charge for PRODUCING one week's payment run.
 *    It is not a subscription, retainer or standing charge. Zero paid weeks
 *    costs zero, on every tier, forever.
 *  - The fee amount is set by the ACCOUNT TYPE the driver is paid under.
 *  - ONE fee per payment run. Never two. Inside a fleet the FLEET is the
 *    invoicing party (Brent, 2026-07-29) — the driver does not raise an
 *    invoice, so the driver's own PLNA payment-run fee never fires. The
 *    double charge is impossible by construction, not by policy.
 *  - A fleet tier may LOWER the fee. It may never add a second one.
 *    Lower wins, never stacks — same rule as the KNECT rate uplifts.
 *  - The fee is NOT a HAF pricing lever. It pays the CleverPay team for real
 *    work. No caps, no waivers dressed up as tier benefits. (A £60/month cap
 *    was proposed on 2026-07-29 and withdrawn by Brent for this reason.)
 *
 * Nothing commercial is hard-coded into logic: every number lives in `config`.
 * Any figure not yet decided is `null` with status "UNSET" — the engine REFUSES
 * to price it rather than guessing. Works in browser + Node.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HAFAccountFees = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ===========================================================================
  // 1. EDITABLE CONFIG
  // ===========================================================================
  var config = {
    version: "ACCOUNT-FEES-V1",
    effectiveFrom: "2026-07-29",
    vatPct: 20,

    // Average paid weeks in a month, used for monthly projections only.
    // Real invoicing always counts actual payment runs, never this number.
    blocksPerMonth: 4.33,

    // --- HOW THE FEE IS COUNTED ON A FLEET INVOICE --------------------------
    // REVISED by Brent 2026-07-29 (supersedes the PER_DRIVER_LINE setting made
    // earlier the same day). His words: "it's only chargeable per invoice
    // generated - if the fleet account has 3 drivers, 10, or 100 it's going
    // through the fleet account holder which is the business and the fleet
    // account owner will pay the drivers."
    //
    // Why this is consistent rather than a contradiction: under the fleet
    // compliance rule below, a fleet's drivers are the BUSINESS's drivers. HAF
    // does not pay them — the business does. CleverPay therefore produces ONE
    // invoice, to the business, and charges once for producing it. The earlier
    // per-driver basis assumed CleverPay was paying each driver individually,
    // which is only true for independent PLNA drivers.
    fleetFeeBasis: "PER_INVOICE",

    // --- WHO MAY SIT UNDER A FLEET ACCOUNT ----------------------------------
    // LOCKED by Brent 2026-07-29. Not a price — a membership condition, and it
    // is the reason the fee above is charged once.
    fleetDriverEligibility: {
      selfEmployedAllowed: false,
      requires: [
        "Driver is engaged by the fleet business, not self-employed",
        "Vehicle registered to the business holding the fleet account",
        "Compliance details submitted by the driver through PLNA",
        "Driver details associated with the business account"
      ],
      otherwise: "The driver sets up their own PLNA account and is billed as an " +
                 "independent driver.",
      reason: "Brent 2026-07-29: self-employed drivers under a fleet account are " +
              "difficult to manage and financially unstable."
    },

    accountTypes: {
      // ---- Driver side (PLNA) ---------------------------------------------
      PLNA_LITE: {
        name: "PLNA Lite", side: "DRIVER", status: "SET", level: "LITE",
        monthlyGbp: 0,
        paymentRunFeeGbp: 9.99,
        maxDrivers: 1
      },
      PLNA_PLUS: {
        name: "PLNA Plus", side: "DRIVER", status: "SET", level: "PLUS",
        // Brent 2026-07-29: "keep as it stands" — £10 confirmed.
        monthlyGbp: 10,
        // Amount from PRICING_ENGINE_CONSTANTS §5.8 (Brent-approved 2026-07-18),
        // which is the record Brent pointed to on 07-29 ("it's on the KNECT
        // process flow — they get charged when an invoice is generated").
        paymentRunFeeGbp: 6.00,
        maxDrivers: 1
      },
      PLNA_PRO: {
        name: "PLNA Pro", side: "DRIVER", status: "SET", level: "PRO",
        // Brent 2026-07-29: "keep as it stands" — £50 confirmed.
        monthlyGbp: 50,
        paymentRunFeeGbp: 0,
        // ⚠️ UNRESOLVED SOURCE CONFLICT — do not publish this figure without a
        // yes. PRICING_ENGINE_CONSTANTS §5.8 says PLNA Pro's payment run is £0,
        // absorbed by HAF. The fee rule Brent locked on 2026-07-29 says the fee
        // covers CleverPay's real work and must never be waived to make a tier
        // look cheaper — which is exactly why he moved Fleet Pro off £0 to £5
        // the same day ("not free as it's more work"). Both cannot be true.
        sourceConflict: {
          field: "paymentRunFeeGbp",
          documented: 0,
          documentedSource: "PRICING_ENGINE_CONSTANTS §5.8, approved 2026-07-18",
          conflictsWith: "CleverPay fee rule locked 2026-07-29 (no waivers)",
          askedOf: "Brent",
          status: "OPEN"
        },
        maxDrivers: 1
      },

      // ---- Fleet side ------------------------------------------------------
      FLEET_LITE: {
        name: "Fleet Lite", side: "FLEET", status: "SET", level: "LITE",
        monthlyGbp: 0,
        paymentRunFeeGbp: 9.99,
        driversIncluded: 3,
        maxDrivers: 3,                    // hard cap — the upgrade trigger
        extraDriverMonthlyGbp: null,      // no seats sold above the cap
        bookingsPerDriverPerDay: 2,
        // Customer-facing pitch. Capability only — never a price comparison.
        sellsOn: [
          "Up to 3 drivers",
          "2 jobs per driver per day",
          "No monthly fee"
        ]
      },
      FLEET_PRO: {
        name: "Fleet Pro", side: "FLEET", status: "SET", level: "PRO",
        monthlyGbp: 50,
        paymentRunFeeGbp: 5.00,           // Brent 2026-07-29: charged, not waived
        driversIncluded: 5,
        maxDrivers: null,                 // unlimited
        extraDriverMonthlyGbp: 5,
        bookingsPerDriverPerDay: null,    // unlimited
        // Customer-facing pitch. Capability only — never a price comparison.
        // Brent 2026-07-29: "the pro is about the features not the price".
        sellsOn: [
          "5 drivers included, add more any time",
          "Unlimited jobs per driver per day",
          "One weekly invoice for the whole fleet"
        ]
      }
    },

    // VAT — ANSWERED by Brent 2026-07-29: "plus VAT". Every account fee and
    // payment-run fee on this engine is quoted and displayed ex-VAT, with VAT
    // added at config.vatPct. Customer-facing pages must show "+ VAT".
    vatTreatment: "EX_VAT_PLUS_VAT",

    // =========================================================================
    // WHAT EACH TIER ACTUALLY GIVES YOU
    //
    // Source: Brent's brief OTIS_HAF_PRICING_FREIGHT_FLEET_UPDATE.md (29 Jul
    // 2026), sections 3, 6 and 7. Nothing here is invented — where the brief's
    // NUMBERS were superseded by the fleet decisions locked later the same day
    // (3 drivers not 5, 5 included not 10, the payment-run fee charged not
    // waived) the text carries a {token} that reads the live figure out of
    // accountTypes above, so a price change can never leave a feature list
    // lying about it.
    //
    // Two rules from the brief are structural, not decoration:
    //   1. Platform features and AI features are SEPARATE lists. Never mixed.
    //   2. Anything not live yet is flagged comingSoon and is never shown as
    //      included on any tier, however much the customer pays.
    //
    // The AI assistant is deliberately unnamed here. The brief calls it JUDD,
    // the assistant actually live on the driver site is JAKO, and that clash is
    // still open with Brent — so no name goes public from this file.
    //
    // unlocksAt is the LEVEL that unlocks the feature, never a tier code. That
    // is what lets one catalogue serve Lite/Plus/Pro on any account type.
    // =========================================================================
    featureCatalogue: {
      // ---- Driver side (PLNA) — brief section 7 ----------------------------
      DRIVER: [
        { unlocksAt: "LITE", group: "PLATFORM", text: "Driver profile and vehicle details" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Your areas and availability" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Job notifications" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "KNECT eligibility, subject to activation and compliance" },
        { unlocksAt: "PLUS", group: "PLATFORM", text: "Priority and return-route planning tools" },
        { unlocksAt: "PLUS", group: "PLATFORM", text: "Improved terms on eligible jobs" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Best available terms on eligible jobs" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Performance tools" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Your own HAF-powered driver page" },

        { unlocksAt: "LITE", group: "AI", text: "Guided setup and basic suggestions" },
        { unlocksAt: "PLUS", group: "AI", text: "Planning-level AI help, within fair-use limits" },
        { unlocksAt: "PRO",  group: "AI", text: "The full driver AI assistant" },
        { unlocksAt: "PRO",  group: "AI", text: "Weekly reviews and approved growth tools" }
      ],

      // ---- Fleet side — brief section 6, numbers from the locked config -----
      FLEET: [
        { unlocksAt: "LITE", group: "PLATFORM", text: "One fleet company account" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Every driver keeps their own PLNA profile" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Up to {FLEET_LITE.maxDrivers} drivers" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "{FLEET_LITE.bookingsPerDriverPerDay} jobs per driver per day" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Driver, vehicle, availability and compliance overview" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Job allocation and fleet history" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Standard support" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "{FLEET_PRO.driversIncluded} drivers included, add more at £{FLEET_PRO.extraDriverMonthlyGbp} each per month" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Unlimited jobs per driver per day" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Central fleet dashboard with roles and permissions" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Advanced driver, vehicle, route and allocation tools" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Fleet reporting, exports and operational history" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Fleet-level compliance overview" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Priority fleet support" },

        { unlocksAt: "LITE", group: "AI", text: "Guided fleet setup" },
        { unlocksAt: "LITE", group: "AI", text: "Basic driver and vehicle matching suggestions" },
        { unlocksAt: "LITE", group: "AI", text: "Missing compliance and availability prompts" },
        { unlocksAt: "PRO",  group: "AI", text: "Fleet manager AI assistant" },
        { unlocksAt: "PRO",  group: "AI", text: "Daily capacity and allocation planning" },
        { unlocksAt: "PRO",  group: "AI", text: "Best-driver suggestions from approved area, vehicle and compliance" },
        { unlocksAt: "PRO",  group: "AI", text: "Return-route and empty-mile prompts" },
        { unlocksAt: "PRO",  group: "AI", text: "Exception, lateness and missing-POD alerts" },
        { unlocksAt: "PRO",  group: "AI", text: "Weekly fleet performance summary" }
      ],

      // ---- Freight forwarder — brief section 3 -----------------------------
      // Listed so the marks work the day these tiers are switched on. Their
      // PRICES are deliberately NOT in accountTypes: the brief says £0/£50/£100
      // and that has not been confirmed since, so this file will not quote them.
      FREIGHT: [
        { unlocksAt: "LITE", group: "PLATFORM", text: "One primary user" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Post third-party client loads" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Urgent, same-day and flexible or co-load requests" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Groupage", comingSoon: true },
        { unlocksAt: "LITE", group: "PLATFORM", text: "The job price shown before you confirm" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Card or CleverPay prepayment before release to the network" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Job status, collection and delivery updates, POD history" },
        { unlocksAt: "LITE", group: "PLATFORM", text: "Client and load references" },
        { unlocksAt: "PLUS", group: "PLATFORM", text: "Three users included, £5 per extra user per month" },
        { unlocksAt: "PLUS", group: "PLATFORM", text: "Reduced network fee on eligible jobs" },
        { unlocksAt: "PLUS", group: "PLATFORM", text: "Saved clients, addresses, contacts and load templates" },
        { unlocksAt: "PLUS", group: "PLATFORM", text: "Repeat and duplicate jobs" },
        { unlocksAt: "PLUS", group: "PLATFORM", text: "Client load-management dashboard" },
        { unlocksAt: "PLUS", group: "PLATFORM", text: "Searchable history, reporting and exports" },
        { unlocksAt: "PLUS", group: "PLATFORM", text: "Priority account support" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Ten users included, £5 per extra user per month" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Lowest freight network-fee band on eligible jobs" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Team roles and permissions" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Client sub-accounts and ownership controls" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Advanced SLA, load, lane and service reporting" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Priority matching review for eligible loads" },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Bulk posting and import tools", comingSoon: true },
        { unlocksAt: "PRO",  group: "PLATFORM", text: "Dedicated account support" },

        { unlocksAt: "LITE", group: "AI", text: "Guided load entry" },
        { unlocksAt: "LITE", group: "AI", text: "Missing-information and address checks" },
        { unlocksAt: "LITE", group: "AI", text: "An automatic job summary before you submit" },
        { unlocksAt: "LITE", group: "AI", text: "Basic customer update templates" },
        { unlocksAt: "PLUS", group: "AI", text: "Account-level freight AI assistant" },
        { unlocksAt: "PLUS", group: "AI", text: "Turn a message, email or note into a draft load" },
        { unlocksAt: "PLUS", group: "AI", text: "Route, timing and service suggestions" },
        { unlocksAt: "PLUS", group: "AI", text: "Draft confirmations and customer updates" },
        { unlocksAt: "PLUS", group: "AI", text: "POD and completed-job summaries" },
        { unlocksAt: "PLUS", group: "AI", text: "Weekly account activity summary" },
        { unlocksAt: "PRO",  group: "AI", text: "Full freight operations AI assistant" },
        { unlocksAt: "PRO",  group: "AI", text: "Multi-load review and prioritisation" },
        { unlocksAt: "PRO",  group: "AI", text: "Missing-detail, deadline and SLA-risk alerts" },
        { unlocksAt: "PRO",  group: "AI", text: "Consolidation, co-load and return-route opportunities" },
        { unlocksAt: "PRO",  group: "AI", text: "Draft client messages on approved channels" },
        { unlocksAt: "PRO",  group: "AI", text: "Weekly performance and exception report" }
      ]
    },

    // What the entry level is CALLED on each side. The mark ladder is the same
    // everywhere; only the bottom rung's name changes (brief: freight says
    // "Free", driver and fleet say "Lite").
    entryLevelLabel: { DRIVER: "Lite", FLEET: "Lite", FREIGHT: "Free" },

    // Footnotes a tier card must carry. Brief section 6, stated plainly.
    footnotes: {
      FLEET: "Fleet Pro does not give every driver the full driver AI. Each " +
             "driver's AI is set by their own PLNA tier.",
      ALL: "CleverPay only charges when an invoice is generated. No work, no " +
           "invoice, no charge."
    },

    // Numbers the commercial model still needs before anything goes public.
    openDecisions: [
      "PLNA_PRO payment-run fee — £0 documented, conflicts with the no-waiver " +
      "rule locked 2026-07-29 (see PLNA_PRO.sourceConflict)"
    ]
  };

  // ===========================================================================
  // 2. HELPERS
  // ===========================================================================
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  function tier(code) {
    var t = config.accountTypes[code];
    if (!t) throw new Error("Unknown account type: " + code);
    return t;
  }

  function requireSet(code) {
    var t = tier(code);
    if (t.status !== "SET") {
      throw new Error(
        t.name + " is not priced yet (status UNSET). Fill its figures in " +
        "config.accountTypes." + code + " before quoting it."
      );
    }
    return t;
  }

  // ===========================================================================
  // 3. THE DOUBLE-CHARGE KILL
  //     Who raises the invoice decides who is charged. Exactly one party can.
  // ===========================================================================
  function resolveInvoicingParty(input) {
    var fleetCode = input.fleetAccountType || null;
    var driverCode = input.driverAccountType || null;

    if (fleetCode) {
      var f = requireSet(fleetCode);
      var out = {
        party: "FLEET",
        chargedAccountType: fleetCode,
        feeGbp: f.paymentRunFeeGbp,
        driverFeeSuppressed: !!driverCode,
        reason: "The fleet raises the invoice, so the fleet is charged. The " +
                "driver inside it raises none and is never charged separately."
      };
      // A fleet tier may only ever LOWER the fee it replaces. Guard it.
      if (driverCode && tier(driverCode).status === "SET") {
        var d = tier(driverCode);
        if (f.paymentRunFeeGbp > d.paymentRunFeeGbp) {
          out.feeGbp = d.paymentRunFeeGbp;
          out.reason += " Lower of the two applies — a fleet tier may reduce " +
                        "the fee but never raise it.";
        }
      }
      return out;
    }

    var dr = requireSet(driverCode);
    return {
      party: "DRIVER",
      chargedAccountType: driverCode,
      feeGbp: dr.paymentRunFeeGbp,
      driverFeeSuppressed: false,
      reason: "Independent driver — the driver raises the invoice and is charged once."
    };
  }

  // ===========================================================================
  // 4. ONE WEEK'S INVOICE
  //     drivers: [{ id, wasPaid }]  — wasPaid false = no work = no line = no fee
  // ===========================================================================
  function weeklyInvoice(input) {
    var drivers = input.drivers || [];
    var paid = drivers.filter(function (d) { return d.wasPaid !== false; });
    var flags = [];

    var resolved = resolveInvoicingParty({
      fleetAccountType: input.fleetAccountType,
      driverAccountType: input.driverAccountType
    });

    // THE RULE. No paid driver = no invoice generated = nothing charged.
    if (paid.length === 0) {
      return {
        invoiceGenerated: false,
        chargedTo: resolved.party,
        accountType: resolved.chargedAccountType,
        lines: [],
        feeExVatGbp: 0, vatGbp: 0, feeIncVatGbp: 0,
        flags: ["NO_INVOICE_NO_FEE"],
        audit: {
          rule: "CleverPay only charges when an invoice is generated.",
          driversOnAccount: drivers.length,
          driversPaidThisWeek: 0,
          reason: "No driver earned this week, so no invoice was produced and " +
                  "nothing is charged."
        }
      };
    }

    var perDriver = resolved.party === "DRIVER" ||
                    config.fleetFeeBasis === "PER_DRIVER_LINE";
    var lines = [];

    if (perDriver) {
      paid.forEach(function (d) {
        lines.push({
          driverId: d.id,
          description: "Payment run — " + tier(resolved.chargedAccountType).name,
          feeGbp: resolved.feeGbp
        });
      });
    } else {
      flags.push("FLAT_FEE_BASIS");
      lines.push({
        driverId: null,
        description: "Payment run — " + tier(resolved.chargedAccountType).name +
                     " (" + paid.length + " drivers, one invoice)",
        feeGbp: resolved.feeGbp
      });
    }

    if (resolved.driverFeeSuppressed) flags.push("DRIVER_FEE_SUPPRESSED");

    var ex = round2(lines.reduce(function (s, l) { return s + l.feeGbp; }, 0));
    var vat = round2(ex * config.vatPct / 100);

    return {
      invoiceGenerated: true,
      chargedTo: resolved.party,
      accountType: resolved.chargedAccountType,
      lines: lines,
      feeExVatGbp: ex,
      vatGbp: vat,
      feeIncVatGbp: round2(ex + vat),
      flags: flags,
      audit: {
        rule: "CleverPay only charges when an invoice is generated.",
        basis: perDriver ? "PER_DRIVER_LINE" : "PER_INVOICE",
        driversOnAccount: drivers.length,
        driversPaidThisWeek: paid.length,
        feePerUnitGbp: resolved.feeGbp,
        reason: resolved.reason
      }
    };
  }

  // ===========================================================================
  // 5. A MONTH'S BILL  (subscription + projected payment runs)
  //     drivers: [{ id, paidBlocks }] — paidBlocks = weeks that driver was paid
  // ===========================================================================
  function monthlyBill(input) {
    var code = input.accountType;
    var t = requireSet(code);
    var drivers = input.drivers || [];
    var count = drivers.length;
    var flags = [];

    if (t.maxDrivers !== null && count > t.maxDrivers) {
      flags.push("DRIVER_LIMIT_EXCEEDED");
    }

    // --- Subscription: base + seats above the included allowance
    var extraSeats = 0;
    if (t.driversIncluded != null && count > t.driversIncluded) {
      extraSeats = count - t.driversIncluded;
      if (t.extraDriverMonthlyGbp == null) {
        extraSeats = 0; // no seats sold above the cap — handled by the flag above
      }
    }
    var seatsGbp = round2(extraSeats * (t.extraDriverMonthlyGbp || 0));
    var subscriptionGbp = round2((t.monthlyGbp || 0) + seatsGbp);

    // --- Payment runs: only weeks that actually produced an invoice
    var paidBlocksTotal = drivers.reduce(function (s, d) {
      return s + (d.paidBlocks || 0);
    }, 0);
    var paidWeeks = input.paidWeeks != null ? input.paidWeeks
      : drivers.reduce(function (m, d) { return Math.max(m, d.paidBlocks || 0); }, 0);

    var perDriver = t.side === "DRIVER" || config.fleetFeeBasis === "PER_DRIVER_LINE";
    var chargeableUnits = perDriver ? paidBlocksTotal : paidWeeks;
    var paymentRunsGbp = round2(chargeableUnits * t.paymentRunFeeGbp);

    if (chargeableUnits === 0) flags.push("NO_INVOICE_NO_FEE");

    var totalEx = round2(subscriptionGbp + paymentRunsGbp);
    var vat = round2(totalEx * config.vatPct / 100);

    return {
      accountType: code,
      accountName: t.name,
      driverCount: count,
      subscription: {
        baseGbp: round2(t.monthlyGbp || 0),
        driversIncluded: t.driversIncluded != null ? t.driversIncluded : t.maxDrivers,
        extraSeats: extraSeats,
        extraSeatsGbp: seatsGbp,
        totalGbp: subscriptionGbp
      },
      paymentRuns: {
        basis: perDriver ? "PER_DRIVER_LINE" : "PER_INVOICE",
        feePerUnitGbp: t.paymentRunFeeGbp,
        chargeableUnits: chargeableUnits,
        totalGbp: paymentRunsGbp
      },
      totalExVatGbp: totalEx,
      vatGbp: vat,
      totalIncVatGbp: round2(totalEx + vat),
      flags: flags,
      audit: {
        rule: "CleverPay only charges when an invoice is generated.",
        note: "Payment-run figures are a projection from paid weeks. Real " +
              "invoices always count actual payment runs."
      }
    };
  }

  // Convenience: every driver works and is paid every week.
  function fullTimeDrivers(n, blocks) {
    var b = blocks == null ? config.blocksPerMonth : blocks;
    var out = [];
    for (var i = 0; i < n; i++) out.push({ id: "D" + (i + 1), paidBlocks: b });
    return out;
  }

  // ===========================================================================
  // 6. GUARDS — the invariants that were broken in the source brief
  // ===========================================================================

  // INVARIANT: a paid tier may only ever LOWER the payment-run fee.
  // Upgrading must never make a payment run cost more. This is the rule Brent
  // stated ("lower wins, never stacks") expressed as a test the build can fail.
  function feeLadderCheck() {
    var free = tier("FLEET_LITE").paymentRunFeeGbp;
    var breaches = [];
    Object.keys(config.accountTypes).forEach(function (code) {
      var t = config.accountTypes[code];
      if (t.side !== "FLEET" || t.status !== "SET" || code === "FLEET_LITE") return;
      if (t.paymentRunFeeGbp > free) {
        breaches.push({
          accountType: code,
          feeGbp: t.paymentRunFeeGbp,
          freeTierFeeGbp: free,
          problem: t.name + " charges more per payment run than the free tier. " +
                   "A paid tier may only lower the fee, never raise it."
        });
      }
    });
    return { ok: breaches.length === 0, breaches: breaches };
  }

  // Which fleet tier actually costs least at this many full-time drivers?
  // Where a customer sits above a tier's driver cap that tier is not eligible.
  // This is the honest upgrade prompt: real arithmetic the customer can check,
  // shown before a bigger invoice arrives rather than after.
  function recommendTier(driverCount, blocksEach) {
    var drivers = fullTimeDrivers(driverCount, blocksEach);
    var options = [];
    ["FLEET_LITE", "FLEET_PRO"].forEach(function (code) {
      var t = tier(code);
      var eligible = t.maxDrivers === null || driverCount <= t.maxDrivers;
      var bill = monthlyBill({ accountType: code, drivers: drivers });
      options.push({
        accountType: code, name: t.name, eligible: eligible,
        monthlyGbp: bill.totalExVatGbp
      });
    });
    var eligibleOptions = options.filter(function (o) { return o.eligible; });
    eligibleOptions.sort(function (a, b) { return a.monthlyGbp - b.monthlyGbp; });
    var best = eligibleOptions[0] || null;
    var next = eligibleOptions[1] || null;
    return {
      driverCount: driverCount,
      options: options,
      cheapest: best,
      savingGbp: best && next ? round2(next.monthlyGbp - best.monthlyGbp) : 0
    };
  }

  // INTERNAL MODELLING ONLY — never quote this to a customer.
  // Brent 2026-07-29: Fleet Pro is sold on what it does, not on being cheaper.
  // Use tier.sellsOn for anything a customer reads.
  function proBreakEven() {
    for (var n = 1; n <= 50; n++) {
      var lite = monthlyBill({ accountType: "FLEET_LITE", drivers: fullTimeDrivers(n) });
      var pro = monthlyBill({ accountType: "FLEET_PRO", drivers: fullTimeDrivers(n) });
      if (pro.totalExVatGbp <= lite.totalExVatGbp) {
        return {
          drivers: n,
          liteGbp: lite.totalExVatGbp,
          proGbp: pro.totalExVatGbp,
          savingGbp: round2(lite.totalExVatGbp - pro.totalExVatGbp)
        };
      }
    }
    return null;
  }

  // ===========================================================================
  // 6b. IDENTITY — WHO WEARS THE CROWN
  //
  // Brent 2026-07-29: a crown identity symbol for people on the PRO versions,
  // on ANY account type. So it is granted by LEVEL, not by tier name — a future
  // Business Pro or Freight Pro earns it the moment it is added with
  // level:"PRO", with nothing else to wire up.
  //
  // Identity is deliberately independent of pricing: PLNA Pro's figures are
  // still UNSET and it STILL wears the crown. You can wear it before we can
  // quote it. The artwork itself lives in pro-crown.js.
  // ===========================================================================
  function isProTier(code) {
    return tier(code).level === "PRO";
  }

  // The full identity record for an account type. `crown` is the only thing a
  // rendering surface should ever test — never a tier name, never a price.
  function identity(code) {
    var t = tier(code);
    return {
      accountType: code,
      name: t.name,
      side: t.side,
      level: t.level || null,
      crown: t.level === "PRO",
      badgeLabel: t.level === "PRO" ? "Pro" : null
    };
  }

  // Every account type that earns the crown today. Used by the preview page and
  // by any audit that asks "who is showing a crown, and why".
  function crownedTiers() {
    return Object.keys(config.accountTypes).filter(isProTier);
  }

  // ===========================================================================
  // 6c. FEATURES — WHAT YOU HAVE, AND WHAT YOU ARE MISSING
  //
  // Brent 2026-07-29: "put crowns on the missing features per account tier so a
  // PLUS symbol for the PLUS features that are missing on the LITE version and
  // the CROWN symbol thats missing the features."
  //
  // So a tier's feature list is not a list of what it includes — it is the
  // WHOLE ladder, with the rungs above you marked by the symbol of the tier
  // that unlocks them. This file decides has/hasn't; tier-marks-v1.js draws it.
  // ===========================================================================

  // Feature text may carry {ACCOUNT_TYPE.field} so a number can only ever come
  // from the priced config above. An unknown token throws rather than printing
  // "{FLEET_PRO.driversIncluded}" onto a customer's screen.
  function resolveTokens(text) {
    return String(text).replace(/\{([A-Z_]+)\.([A-Za-z]+)\}/g, function (_, code, field) {
      var t = config.accountTypes[code];
      if (!t || t[field] === undefined || t[field] === null) {
        throw new Error("Feature text references an unset figure: " + code + "." + field);
      }
      return String(t[field]);
    });
  }

  function catalogueFor(side) {
    var list = config.featureCatalogue[String(side || "").toUpperCase()];
    if (!list) throw new Error("No feature catalogue for side: " + side);
    return list.map(function (f) {
      var out = { text: resolveTokens(f.text), group: f.group, unlocksAt: f.unlocksAt };
      if (f.comingSoon) out.comingSoon = true;
      return out;
    });
  }

  // The full ladder as one account type sees it. Each row says whether it is
  // included and, when it is not, which level unlocks it — that level is the
  // symbol the page draws.
  function featuresFor(code) {
    var t = tier(code);
    return featuresForSideLevel(t.side, t.level);
  }

  // The same thing for a side and level that has no priced tier yet (freight),
  // so the marks work the day those tiers are switched on.
  function featuresForSideLevel(side, level) {
    var have = LEVEL_ORDER.indexOf(String(level || "").toUpperCase());
    if (have < 0) throw new Error("Unknown level: " + level);
    return catalogueFor(side).map(function (f) {
      var need = LEVEL_ORDER.indexOf(f.unlocksAt);
      var included = have >= need && !f.comingSoon;
      return {
        text: f.text,
        group: f.group,
        unlocksAt: f.unlocksAt,
        comingSoon: !!f.comingSoon,
        included: included,
        // null when included — the mark exists ONLY on a feature you lack.
        lockedBy: included || f.comingSoon ? null : f.unlocksAt
      };
    });
  }

  var LEVEL_ORDER = ["LITE", "PLUS", "PRO"];

  // "2 more on Plus, 7 more on Pro" — the honest upgrade line for a card footer.
  function missingSummary(code) {
    var counts = { PLUS: 0, PRO: 0 };
    featuresFor(code).forEach(function (f) {
      if (f.lockedBy && counts[f.lockedBy] !== undefined) counts[f.lockedBy]++;
    });
    return counts;
  }

  // INVARIANT: the top of a ladder must be missing nothing. If a PRO tier ever
  // reports a locked feature, a level has been mislabelled somewhere.
  function ladderCheck() {
    var breaches = [];
    Object.keys(config.accountTypes).forEach(function (code) {
      var t = config.accountTypes[code];
      if (t.level !== "PRO") return;
      featuresFor(code).forEach(function (f) {
        if (f.lockedBy) {
          breaches.push({ accountType: code, feature: f.text, lockedBy: f.lockedBy });
        }
      });
    });
    return { ok: breaches.length === 0, breaches: breaches };
  }

  // ===========================================================================
  // 7. PUBLIC API
  // ===========================================================================
  return {
    config: config,
    isProTier: isProTier,
    identity: identity,
    crownedTiers: crownedTiers,
    featuresFor: featuresFor,
    featuresForSideLevel: featuresForSideLevel,
    missingSummary: missingSummary,
    ladderCheck: ladderCheck,
    resolveInvoicingParty: resolveInvoicingParty,
    weeklyInvoice: weeklyInvoice,
    monthlyBill: monthlyBill,
    fullTimeDrivers: fullTimeDrivers,
    feeLadderCheck: feeLadderCheck,
    recommendTier: recommendTier,
    proBreakEven: proBreakEven,
    round2: round2,
    version: config.version
  };
});
