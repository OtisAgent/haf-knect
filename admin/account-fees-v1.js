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
    // Brent confirmed the FLEET raises the invoice, not the driver. That kills
    // the double charge. It leaves one open choice, parked here as a switch:
    //   PER_DRIVER_LINE — one fee per driver on the fleet's weekly invoice
    //                     (more drivers = more work, matching Brent's own
    //                      reasoning for charging Fleet Pro rather than waiving)
    //   PER_INVOICE     — one flat fee for the fleet's weekly invoice, whatever
    //                     the driver count
    // DEFAULT is PER_DRIVER_LINE. Awaiting Brent's pick — see openDecisions.
    fleetFeeBasis: "PER_DRIVER_LINE",

    accountTypes: {
      // ---- Driver side (PLNA) ---------------------------------------------
      PLNA_LITE: {
        name: "PLNA Lite", side: "DRIVER", status: "SET",
        monthlyGbp: 0,
        paymentRunFeeGbp: 9.99,
        maxDrivers: 1
      },
      PLNA_PLUS: {
        name: "PLNA Plus", side: "DRIVER", status: "UNSET",
        monthlyGbp: null,        // brief implies £10 — NOT confirmed, do not assume
        paymentRunFeeGbp: null,  // never verified against a source; must be filled
        maxDrivers: 1
      },
      PLNA_PRO: {
        name: "PLNA Pro", side: "DRIVER", status: "UNSET",
        monthlyGbp: null,        // brief implies £50 — NOT confirmed, do not assume
        paymentRunFeeGbp: null,
        maxDrivers: 1
      },

      // ---- Fleet side ------------------------------------------------------
      FLEET_LITE: {
        name: "Fleet Lite", side: "FLEET", status: "SET",
        monthlyGbp: 0,
        paymentRunFeeGbp: 9.99,
        driversIncluded: 3,
        maxDrivers: 3,                    // hard cap — the upgrade trigger
        extraDriverMonthlyGbp: null,      // no seats sold above the cap
        bookingsPerDriverPerDay: 2
      },
      FLEET_PRO: {
        name: "Fleet Pro", side: "FLEET", status: "SET",
        monthlyGbp: 50,
        paymentRunFeeGbp: 5.00,           // Brent 2026-07-29: charged, not waived
        driversIncluded: 5,
        maxDrivers: null,                 // unlimited
        extraDriverMonthlyGbp: 5,
        bookingsPerDriverPerDay: null     // unlimited
      }
    },

    // Numbers the commercial model still needs before anything goes public.
    openDecisions: [
      "fleetFeeBasis: PER_DRIVER_LINE (default) or PER_INVOICE",
      "PLNA_PLUS monthly + payment-run fee",
      "PLNA_PRO monthly + payment-run fee",
      "VAT: charged on account fees, yes or no — 'where VAT applies' is not a setting"
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

  // At how many full-time drivers does Fleet Pro become the cheaper choice?
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
  // 7. PUBLIC API
  // ===========================================================================
  return {
    config: config,
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
