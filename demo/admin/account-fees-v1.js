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
        // Brent 2026-08-11: "NO one should be on the £10 and the £50 — remove
        // everyone and move them to the free version, offer them an upgrade to
        // the new layer." The £10 rung was ABOLISHED, not repriced downstream:
        // join.usehaf.co.uk, Stripe (haf_plus_monthly) and the storefront all
        // moved to £25 that day and this list was the last thing still holding
        // the dead figure. Supersedes the 07-29 "keep as it stands".
        monthlyGbp: 25,
        annualGbp: 250,               // ten months charged — two months free
        // Amount from PRICING_ENGINE_CONSTANTS §5.8 (Brent-approved 2026-07-18),
        // which is the record Brent pointed to on 07-29 ("it's on the KNECT
        // process flow — they get charged when an invoice is generated").
        paymentRunFeeGbp: 6.00,
        maxDrivers: 1
      },
      PLNA_PRO: {
        name: "PLNA Pro", side: "DRIVER", status: "SET", level: "PRO",
        // Brent 2026-08-11: the £50 rung went the same way as the £10 — see the
        // note on PLNA_PLUS. Stripe lookup key haf_pro_monthly is £100.
        monthlyGbp: 100,
        annualGbp: 1000,              // ten months charged — two months free
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
      // Brent 2026-08-14: the fleet ladder is decided by HEADCOUNT and nothing
      // else — Free up to 5 drivers, Plus up to 25, Pro unlimited. A fleet is
      // never charged per driver: you move up a band, you do not buy a seat.
      FLEET_LITE: {
        name: "Fleet Lite", side: "FLEET", status: "SET", level: "LITE",
        monthlyGbp: 0,
        paymentRunFeeGbp: 9.99,
        driversIncluded: 5,
        maxDrivers: 5,                    // hard cap — the upgrade trigger
        extraDriverMonthlyGbp: null,      // no seats sold above the cap
        bookingsPerDriverPerDay: 2,
        // Customer-facing pitch. Capability only — never a price comparison.
        sellsOn: [
          "Up to 5 drivers",
          "2 jobs per driver per day",
          "No monthly fee"
        ]
      },
      FLEET_PLUS: {
        name: "Fleet Plus", side: "FLEET", status: "SET", level: "PLUS",
        monthlyGbp: 50,
        paymentRunFeeGbp: 5.00,
        driversIncluded: 25,
        maxDrivers: 25,                   // hard cap — the upgrade trigger
        extraDriverMonthlyGbp: null,      // never per driver
        bookingsPerDriverPerDay: null,    // unlimited
        sellsOn: [
          "Up to 25 drivers",
          "Unlimited jobs per driver per day",
          "One price for the company, however many are out"
        ]
      },
      FLEET_PRO: {
        name: "Fleet Pro", side: "FLEET", status: "SET", level: "PRO",
        monthlyGbp: 250,
        paymentRunFeeGbp: 5.00,           // Brent 2026-07-29: charged, not waived
        driversIncluded: null,            // unlimited — no seat counting at all
        maxDrivers: null,                 // unlimited
        extraDriverMonthlyGbp: null,      // Brent 2026-08-14: never per driver
        bookingsPerDriverPerDay: null,    // unlimited
        // Customer-facing pitch. Capability only — never a price comparison.
        // Brent 2026-07-29: "the pro is about the features not the price".
        sellsOn: [
          "Unlimited drivers on one account",
          "Unlimited jobs per driver per day",
          "One weekly invoice for the whole fleet"
        ]
      },

      // ---- Freight forwarder side -----------------------------------------
      // REGISTERED FOR IDENTITY ONLY, NOT FOR PRICING. Brent 2026-07-29 asked
      // for the crown on "the PRO versions on ANY account type" — so a Freight
      // Pro account has to be able to carry it, and its Lite and Plus cards
      // have to be able to show what they are missing. None of these tiers has
      // a price in the brief (the freight sections name the tiers and list the
      // features, and give no figure), so every figure below stays null with
      // status UNSET: the engine will draw the crown and the marks, and will
      // REFUSE to quote a fee, which is the correct behaviour until Brent sets
      // them. Adding a number here without his say-so is how a made-up price
      // reaches a customer.
      FREIGHT_LITE: {
        name: "Freight Forward Free", side: "FREIGHT", status: "UNSET", level: "LITE",
        monthlyGbp: null,
        paymentRunFeeGbp: null,
        maxDrivers: null
      },
      FREIGHT_PLUS: {
        name: "Freight Forward Plus", side: "FREIGHT", status: "UNSET", level: "PLUS",
        monthlyGbp: null,
        paymentRunFeeGbp: null,
        maxDrivers: null
      },
      FREIGHT_PRO: {
        name: "Freight Forward Pro", side: "FREIGHT", status: "UNSET", level: "PRO",
        monthlyGbp: null,
        paymentRunFeeGbp: null,
        maxDrivers: null
      }

      // ---- Business side ----------------------------------------------------
      // DELIBERATELY ABSENT. The brief defines exactly ONE business tier
      // ("Business Free"), so on the business account there is no Plus and no
      // Pro: nothing to crown, and no locked feature to mark. Registering an
      // invented Business Pro so the crown had somewhere to sit would be
      // putting a tier on a page that Brent has never agreed to sell. If he
      // wants one, he defines it and it drops in here.
    },

    // VAT — ANSWERED by Brent 2026-07-29: "plus VAT". Every account fee and
    // payment-run fee on this engine is quoted and displayed ex-VAT, with VAT
    // added at config.vatPct. Customer-facing pages must show "+ VAT".
    vatTreatment: "EX_VAT_PLUS_VAT",

    // =========================================================================
    // TIER PERMISSIONS — the switchboard, section 14 of Brent's 14 Aug brief
    //
    // "Do not build this as completely separate hard-coded Free, Plus and Pro
    // applications. Build modular feature permissions and configurable limits."
    //
    // So every gate in the product reads a NAMED PERMISSION from this block,
    // and no page hard-codes a limit. If Plus becomes unlimited posting after
    // real driver feedback, that is one number changed here — not a rebuild,
    // and not a hunt through pages for the figure "10".
    //
    // The feature lists below quote these values through {PERM_LEVEL.name}
    // tokens, so a limit can never be changed here and left lying on a page.
    // =========================================================================
    tierPermissions: {
      LITE: {
        network_posting: true,
        posting_daily_limit: 5,
        driver_plna: true,
        fleet_management: true,
        freight_forwarding: true,
        direct_driver_booking: false,
        flexible_pricing: false,
        pricing_preferences: false,
        return_route_planning: false,
        filler_route_planning: false,
        calendar_gap_detection: false,
        advanced_calendar: false,
        advanced_booking: false,
        custom_branding: false,
        jako_ai: false
      },
      PLUS: {
        network_posting: true,
        posting_daily_limit: 10,
        driver_plna: true,
        fleet_management: true,
        freight_forwarding: true,
        direct_driver_booking: true,
        flexible_pricing: true,
        pricing_preferences: true,
        return_route_planning: true,
        filler_route_planning: true,
        calendar_gap_detection: true,
        advanced_calendar: true,
        advanced_booking: true,
        custom_branding: false,
        jako_ai: false
      },
      PRO: {
        network_posting: true,
        // null is UNLIMITED. Never 999 or 99999 — a sentinel number leaks onto
        // a page as a real allowance the day someone forgets what it meant.
        posting_daily_limit: null,
        driver_plna: true,
        fleet_management: true,
        freight_forwarding: true,
        direct_driver_booking: true,
        flexible_pricing: true,
        pricing_preferences: true,
        return_route_planning: true,
        filler_route_planning: true,
        calendar_gap_detection: true,
        advanced_calendar: true,
        advanced_booking: true,
        custom_branding: true,
        jako_ai: true
      }
    },

    // Counting rule for posting_daily_limit, brief section 3, stated so the
    // engine that enforces it and the page that explains it cannot drift:
    //   - a job counts ONCE, when it is successfully submitted to the network
    //   - drafts do not count
    //   - a cancelled job stays in audit history and is not refunded to the
    //     allowance, so duplicate posting cannot be used to get round the limit
    //   - the count resets daily
    postingLimitRule: {
      countsOn: "SUBMITTED_TO_NETWORK",
      draftsCount: false,
      cancelledReturnsAllowance: false,
      resets: "DAILY"
    },

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
      // ---- Driver side — HAF KNECT Free / Plus / Pro ------------------------
      // SOURCE: Brent's "HAF KNECT Account Features — OTIS Build Brief"
      // (14 Aug 2026). Every row below comes from one of that document's
      // tables, and it is filed under the SECTION that document puts it in —
      // §3 posting, §4 driver/PLNA, §5 routes, §6 calendar, §7 fleet,
      // §8 freight, §9 bookings, §10 pricing, §11 branding, §12 JAKO. The
      // public compare table and the in-app cards both read this list, so the
      // sections a customer reads are the document's own sections.
      //
      // Four rulings in that document are load-bearing:
      //   1. MATCHING IS BY SUITABILITY, NEVER BY MEMBERSHIP — no priority
      //      jobs, no first access, no ranking boost for paying.
      //   2. JAKO IS PRO ONLY, because AI carries a real token cost. Plus gets
      //      the rules-based route planner instead, and it must be genuinely
      //      useful without AI.
      //   3. Posting is on EVERY account. What a tier buys is the daily
      //      allowance and the tools around posting, never access.
      //   4. The branded booking page is a Pro line (this supersedes the
      //         2026-07-29 "separate Website Builder" ruling — flagged to Brent).
      DRIVER: [
        // ---- §4 Driver / PLNA -------------------------------------------
        { unlocksAt: "LITE", group: "PLNA", text: "Create your HAF and PLNA driver profile" },
        { unlocksAt: "LITE", group: "PLNA", text: "Clever Checked compliance" },
        { unlocksAt: "LITE", group: "PLNA", text: "Add your vehicle details" },
        { unlocksAt: "LITE", group: "PLNA", text: "Set your working availability" },
        { unlocksAt: "LITE", group: "PLNA", text: "HAF username and PLNA identity" },
        { unlocksAt: "LITE", group: "PLNA", text: "See every network job you are eligible for" },
        { unlocksAt: "LITE", group: "PLNA", text: "Accept suitable network jobs" },
        { unlocksAt: "LITE", group: "PLNA", text: "Fair job matching — never decided by what you pay" },
        { unlocksAt: "LITE", group: "PLNA", text: "Job notifications" },
        { unlocksAt: "LITE", group: "PLNA", text: "Complete a job and upload proof of delivery" },
        { unlocksAt: "LITE", group: "PLNA", text: "Completed-job history" },
        { unlocksAt: "LITE", group: "PLNA", text: "Basic earnings history" },
        { unlocksAt: "PLUS", group: "PLNA", text: "Ask for a driver you know by their HAF username" },
        { unlocksAt: "PLUS", group: "PLNA", text: "Advanced diary and booking tools" },

        // ---- §3 Posting work onto the network ---------------------------
        { unlocksAt: "LITE", group: "POSTING", text: "Post your own work onto HAF KNECT — up to {PERM_LITE.posting_daily_limit} jobs a day" , slot: "posting" },
        { unlocksAt: "LITE", group: "POSTING", text: "Standard full-order posting" },
        { unlocksAt: "LITE", group: "POSTING", text: "Guide price before you post" },
        { unlocksAt: "LITE", group: "POSTING", text: "Edit the draft before you submit it" },
        { unlocksAt: "LITE", group: "POSTING", text: "Repeat an order from its reference number" },
        { unlocksAt: "LITE", group: "POSTING", text: "See your active postings and their status" },
        { unlocksAt: "LITE", group: "POSTING", text: "Cancel a posting, with full audit history" },
        { unlocksAt: "PLUS", group: "POSTING", text: "Post up to {PERM_PLUS.posting_daily_limit} jobs a day onto the network" , slot: "posting" },
        { unlocksAt: "PLUS", group: "POSTING", text: "Directly request a known driver" },
        { unlocksAt: "PLUS", group: "POSTING", text: "Advanced repeat-booking controls" },
        { unlocksAt: "PLUS", group: "POSTING", text: "Higher-volume posting tools" },
        { unlocksAt: "PRO",  group: "POSTING", text: "Unlimited live posting" , slot: "posting" },

        // ---- §5 Return and filler route planning ------------------------
        { unlocksAt: "PLUS", group: "ROUTES", text: "Return-route planning — find work that fits your journey home" },
        { unlocksAt: "PLUS", group: "ROUTES", text: "Filler-route planning — fill the gap between two confirmed jobs" },
        { unlocksAt: "PLUS", group: "ROUTES", text: "Work matched to your route, mileage, timings and vehicle" },
        { unlocksAt: "PLUS", group: "ROUTES", text: "See whether a job really fits your day before you accept it" },
        { unlocksAt: "PLUS", group: "ROUTES", text: "Reduce empty miles and combine compatible deliveries" },

        // ---- §6 Calendar and driver diary -------------------------------
        { unlocksAt: "LITE", group: "CALENDAR", text: "Basic PLNA calendar" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "Today, Day, Week and Month views — Today by default on a phone" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "Job cards showing time, route, status, vehicle, expected pay, mileage and reference" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "One clear status set from offered through to completed" },
        { unlocksAt: "PLUS", group: "CALENDAR", text: "Calendar gap detection" },
        { unlocksAt: "PLUS", group: "CALENDAR", text: "Find work to fill a gap in your day" },
        { unlocksAt: "PLUS", group: "CALENDAR", text: "Actions on empty time — find filler work, find a return route, mark yourself unavailable" },

        // ---- §9 Bookings and customers ----------------------------------
        { unlocksAt: "LITE", group: "BOOKING", text: "Basic HAF booking link" },
        { unlocksAt: "LITE", group: "BOOKING", text: "Basic pre-booking" },
        { unlocksAt: "LITE", group: "BOOKING", text: "Repeat booking" },
        { unlocksAt: "LITE", group: "BOOKING", text: "Basic customer booking history" },
        { unlocksAt: "LITE", group: "BOOKING", text: "Basic PLNA availability on your booking link" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Direct booking by your HAF username" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Advanced scheduled bookings" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Advanced booking types" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Full diary and availability integration on your booking link" },
        { unlocksAt: "PRO",  group: "BOOKING", text: "Custom branded booking page" },
        { unlocksAt: "PRO",  group: "BOOKING", text: "Your own customer-facing booking address" },

        // ---- §10 Pricing and utilisation --------------------------------
        { unlocksAt: "LITE", group: "PRICING", text: "Standard HAF pricing" },
        { unlocksAt: "LITE", group: "PRICING", text: "View the guide price" },
        { unlocksAt: "LITE", group: "PRICING", text: "Accept the standard driver rate" },
        { unlocksAt: "PLUS", group: "PRICING", text: "Flexible backload pricing on return and near-route work" },
        { unlocksAt: "PLUS", group: "PRICING", text: "Choose your own reduction — for example 10%, 15% or 20% below the standard rate" },
        { unlocksAt: "PLUS", group: "PRICING", text: "Pricing preferences for normal, backload, towards-home and urgent work" },
        { unlocksAt: "PLUS", group: "PRICING", text: "HAF never forces a lower rate — every reduction is your choice" },

        // ---- §11 Branding and business tools ----------------------------
        { unlocksAt: "LITE", group: "BRANDING", text: "HAF profile and identity" },
        { unlocksAt: "LITE", group: "BRANDING", text: "Basic HAF booking presence" },
        { unlocksAt: "LITE", group: "BRANDING", text: "Powered by HAF KNECT infrastructure" },
        { unlocksAt: "PLUS", group: "BRANDING", text: "Advanced customer tools" },
        { unlocksAt: "PRO",  group: "BRANDING", text: "Custom logo and colours" },
        { unlocksAt: "PRO",  group: "BRANDING", text: "Company About section and services displayed" },
        { unlocksAt: "PRO",  group: "BRANDING", text: "Branded booking landing page on your own booking address" },

        // ---- §12 JAKO AI (Pro only) -------------------------------------
        { unlocksAt: "PRO",  group: "AI", text: "JAKO AI, the assistant inside PLNA" },
        { unlocksAt: "PRO",  group: "AI", text: "Ask JAKO about your diary" },
        { unlocksAt: "PRO",  group: "AI", text: "AI route suggestions" },
        { unlocksAt: "PRO",  group: "AI", text: "AI backload recommendations" },
        { unlocksAt: "PRO",  group: "AI", text: "AI earnings analysis" },
        { unlocksAt: "PRO",  group: "AI", text: "AI customer analysis" },
        { unlocksAt: "PRO",  group: "AI", text: "AI utilisation suggestions" },
        { unlocksAt: "PRO",  group: "AI", text: "AI customer and business assistance" }
      ],

      // ---- Fleet side — brief §7, plus the fleet PLNA ruling ---------------
      // Brent 2026-08-14: a fleet driver's PLNA is NOT the open PLNA. It is
      // made by the company for the company's work — calendar, the jobs they
      // have been given, and proof of delivery. No booking line, not bookable
      // by HAF username, none of the independent driver's own-work tools.
      // A fleet account never bypasses compliance (§7 rule).
      FLEET: [
        // ---- Your account ------------------------------------------------
        { unlocksAt: "LITE", group: "ACCOUNT", text: "Create your fleet or courier company profile" },
        { unlocksAt: "LITE", group: "ACCOUNT", text: "One company account for the whole fleet" },
        { unlocksAt: "LITE", group: "ACCOUNT", text: "Up to {FLEET_LITE.maxDrivers} drivers" , slot: "fleet_headcount" },
        { unlocksAt: "LITE", group: "ACCOUNT", text: "Every driver Clever Checked — a fleet account never bypasses compliance" },
        { unlocksAt: "LITE", group: "ACCOUNT", text: "Standard support" },
        { unlocksAt: "PLUS", group: "ACCOUNT", text: "Up to {FLEET_PLUS.maxDrivers} drivers" , slot: "fleet_headcount" },
        { unlocksAt: "PRO",  group: "ACCOUNT", text: "Unlimited drivers on one account" , slot: "fleet_headcount" },
        { unlocksAt: "PRO",  group: "ACCOUNT", text: "Team roles and permissions on the fleet account" },

        // ---- §3 Posting work onto the network ---------------------------
        { unlocksAt: "LITE", group: "POSTING", text: "Post jobs to HAF KNECT — up to {PERM_LITE.posting_daily_limit} a day" , slot: "posting" },
        { unlocksAt: "LITE", group: "POSTING", text: "Guide price, full-order posting and repeat by reference" },
        { unlocksAt: "LITE", group: "POSTING", text: "See active postings and job status" },
        { unlocksAt: "LITE", group: "POSTING", text: "Cancel a posting, with full audit history" },
        { unlocksAt: "PLUS", group: "POSTING", text: "Post up to {PERM_PLUS.posting_daily_limit} jobs a day onto the network" , slot: "posting" },
        { unlocksAt: "PLUS", group: "POSTING", text: "Advanced repeat-booking controls" },
        { unlocksAt: "PRO",  group: "POSTING", text: "Unlimited job posting onto the network" , slot: "posting" },

        // ---- §7 Fleet and driver management ------------------------------
        { unlocksAt: "LITE", group: "FLEET", text: "Fleet management tab — drivers, vehicles, allocation and compliance in one place" },
        { unlocksAt: "LITE", group: "FLEET", text: "Add and manage your approved drivers" },
        { unlocksAt: "LITE", group: "FLEET", text: "Allocate vehicles" },
        { unlocksAt: "LITE", group: "FLEET", text: "View driver availability" },
        { unlocksAt: "LITE", group: "FLEET", text: "View live fleet jobs" },
        { unlocksAt: "LITE", group: "FLEET", text: "Allocate jobs to eligible fleet drivers" },
        { unlocksAt: "LITE", group: "FLEET", text: "{FLEET_LITE.bookingsPerDriverPerDay} jobs per driver per day" , slot: "fleet_jobs_per_driver" },
        { unlocksAt: "LITE", group: "FLEET", text: "Basic fleet schedule and job history" },
        { unlocksAt: "LITE", group: "FLEET", text: "Fair job matching — never decided by what the fleet pays" },
        { unlocksAt: "PLUS", group: "FLEET", text: "Unlimited jobs per driver per day" , slot: "fleet_jobs_per_driver" },
        { unlocksAt: "PLUS", group: "FLEET", text: "Advanced fleet scheduling" },
        { unlocksAt: "PRO",  group: "FLEET", text: "Central fleet dashboard with roles and permissions" },
        { unlocksAt: "PRO",  group: "FLEET", text: "Advanced driver, vehicle, route and allocation tools" },
        { unlocksAt: "PRO",  group: "FLEET", text: "Fleet reporting, exports and operational history" },
        { unlocksAt: "PRO",  group: "FLEET", text: "Fleet-level compliance overview" },

        // ---- §5 Return and filler route planning ------------------------
        { unlocksAt: "PLUS", group: "ROUTES", text: "Return-route planning across the fleet" },
        { unlocksAt: "PLUS", group: "ROUTES", text: "Filler-route planning to fill the gaps in a driver's day" },
        { unlocksAt: "PLUS", group: "ROUTES", text: "Fewer empty miles across the whole fleet" },

        // ---- §6 The fleet driver's PLNA and calendar ---------------------
        { unlocksAt: "LITE", group: "CALENDAR", text: "A fleet PLNA for every driver — made by the company, not an open PLNA account" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "Simple driver calendar — today, day and week" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "The jobs their company has allocated to them" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "Complete a job and upload proof of delivery" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "Basic driver, vehicle and availability details" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "No public booking line — a fleet driver is booked through their company" },
        { unlocksAt: "PLUS", group: "CALENDAR", text: "The fleet office sees every driver's calendar in one view" },
        { unlocksAt: "PLUS", group: "CALENDAR", text: "Calendar gap tools across every driver's diary" },

        // ---- §9 Bookings and customers ----------------------------------
        { unlocksAt: "LITE", group: "BOOKING", text: "Basic company booking link" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Direct driver username booking" },
        { unlocksAt: "PRO",  group: "BOOKING", text: "Custom branded customer booking page in your company name" },

        // ---- §10 Pricing and utilisation --------------------------------
        { unlocksAt: "LITE", group: "PRICING", text: "Standard HAF pricing on every fleet job" },
        { unlocksAt: "PLUS", group: "PRICING", text: "Advanced pricing preferences, including backload rates your drivers choose" },

        // ---- §11 Branding and business tools ----------------------------
        { unlocksAt: "LITE", group: "BRANDING", text: "Company profile and HAF identity" },
        { unlocksAt: "PRO",  group: "BRANDING", text: "Custom logo, colours and About section" },
        { unlocksAt: "PRO",  group: "BRANDING", text: "Your own customer-facing booking address" },

        // ---- §12 JAKO AI (Pro only) -------------------------------------
        { unlocksAt: "PRO",  group: "AI", text: "JAKO AI for the fleet office" },
        { unlocksAt: "PRO",  group: "AI", text: "AI route and utilisation analysis" },
        { unlocksAt: "PRO",  group: "AI", text: "Daily capacity and allocation planning" },
        { unlocksAt: "PRO",  group: "AI", text: "Best-driver suggestions from approved area, vehicle and compliance" },
        { unlocksAt: "PRO",  group: "AI", text: "Return-route and empty-mile prompts" },
        { unlocksAt: "PRO",  group: "AI", text: "Exception, lateness and missing-POD alerts" },
        { unlocksAt: "PRO",  group: "AI", text: "AI business insight and a weekly fleet performance summary" }
      ],

      // ---- Freight forwarder / load poster — brief §8 ----------------------
      // Their PRICES are deliberately NOT in accountTypes and no freight price
      // appears here: freight is free at launch and no paid freight tier has
      // been set (Brent, 14 Aug — the paid tiers and rebates came off the terms
      // page the same day). §8's rule: a Plus or Pro customer can request a
      // known driver, but open-network jobs stay matched by driver suitability,
      // never by the forwarder's subscription tier.
      FREIGHT: [
        // ---- Your account ------------------------------------------------
        { unlocksAt: "LITE", group: "ACCOUNT", text: "Create your freight-forwarding profile" },
        { unlocksAt: "LITE", group: "ACCOUNT", text: "One primary user" },
        { unlocksAt: "LITE", group: "ACCOUNT", text: "Client and load references" },
        { unlocksAt: "LITE", group: "ACCOUNT", text: "Fair job matching — the best-placed driver wins the load, whatever you pay us" },
        { unlocksAt: "LITE", group: "ACCOUNT", text: "Standard account support" },
        { unlocksAt: "PLUS", group: "ACCOUNT", text: "Three users included" },
        { unlocksAt: "PLUS", group: "ACCOUNT", text: "Searchable history, reporting and exports" },
        { unlocksAt: "PRO",  group: "ACCOUNT", text: "Ten users included" },
        { unlocksAt: "PRO",  group: "ACCOUNT", text: "Team roles and permissions" },
        { unlocksAt: "PRO",  group: "ACCOUNT", text: "Client sub-accounts and ownership controls" },
        { unlocksAt: "PRO",  group: "ACCOUNT", text: "Advanced SLA, load, lane and service reporting" },
        { unlocksAt: "PRO",  group: "ACCOUNT", text: "Dedicated account support" },

        // ---- §8 Posting loads onto the network ---------------------------
        { unlocksAt: "LITE", group: "POSTING", text: "Post client loads onto the network — up to {PERM_LITE.posting_daily_limit} a day" , slot: "posting" },
        { unlocksAt: "LITE", group: "POSTING", text: "Full-order posting" },
        { unlocksAt: "LITE", group: "POSTING", text: "Guide price before you confirm" },
        { unlocksAt: "LITE", group: "POSTING", text: "Repeat an order by its reference number" },
        { unlocksAt: "LITE", group: "POSTING", text: "Urgent, same-day and flexible or co-load requests" },
        { unlocksAt: "LITE", group: "POSTING", text: "Groupage", comingSoon: true },
        { unlocksAt: "LITE", group: "POSTING", text: "View active postings" },
        { unlocksAt: "LITE", group: "POSTING", text: "View allocation and job status" },
        { unlocksAt: "LITE", group: "POSTING", text: "View proof of delivery and completion" },
        { unlocksAt: "LITE", group: "POSTING", text: "Card or CleverPay prepayment before release to the network" },
        { unlocksAt: "PLUS", group: "POSTING", text: "Post up to {PERM_PLUS.posting_daily_limit} loads a day onto the network" , slot: "posting" },
        { unlocksAt: "PLUS", group: "POSTING", text: "Advanced repeat-booking tools" },
        { unlocksAt: "PLUS", group: "POSTING", text: "Bulk posting and import tools", comingSoon: true },
        { unlocksAt: "PRO",  group: "POSTING", text: "Unlimited load posting onto the network" , slot: "posting" },

        // ---- §5 Return and backload work ---------------------------------
        { unlocksAt: "PLUS", group: "ROUTES", text: "Return and backload opportunity tools" },

        // ---- §9 Bookings and clients -------------------------------------
        { unlocksAt: "LITE", group: "BOOKING", text: "Basic booking management" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Request a driver you know by their HAF username" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Advanced booking controls" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Saved clients, addresses, contacts and load templates" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Client load-management dashboard" },
        { unlocksAt: "PRO",  group: "BOOKING", text: "Custom branded booking experience for your own clients" },

        // ---- §10 Pricing --------------------------------------------------
        { unlocksAt: "LITE", group: "PRICING", text: "Standard HAF pricing, with the guide price shown before you confirm" },
        { unlocksAt: "PLUS", group: "PRICING", text: "Reduced network fee on eligible jobs" },
        { unlocksAt: "PRO",  group: "PRICING", text: "Lowest freight network-fee band on eligible jobs" },

        // ---- §12 JAKO AI (Pro only) --------------------------------------
        { unlocksAt: "PRO",  group: "AI", text: "JAKO AI for freight operations" },
        { unlocksAt: "PRO",  group: "AI", text: "AI job and route recommendations" },
        { unlocksAt: "PRO",  group: "AI", text: "Turn a message, email or note into a draft load" },
        { unlocksAt: "PRO",  group: "AI", text: "Multi-load review, and which of your own loads to deal with first" },
        { unlocksAt: "PRO",  group: "AI", text: "Missing-detail, deadline and SLA-risk alerts" },
        { unlocksAt: "PRO",  group: "AI", text: "Consolidation, co-load and return-route opportunities" },
        { unlocksAt: "PRO",  group: "AI", text: "Draft client messages on approved channels" },
        { unlocksAt: "PRO",  group: "AI", text: "AI customer and business insight, and a weekly exception report" }
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
    return String(text).replace(/\{([A-Z_]+)\.([A-Za-z_]+)\}/g, function (_, code, field) {
      // {PERM_PLUS.posting_daily_limit} reads the switchboard, so a feature
      // line and the gate that enforces it can never quote different numbers.
      if (code.indexOf("PERM_") === 0) {
        var perms = config.tierPermissions[code.slice(5)];
        if (!perms || perms[field] === undefined) {
          throw new Error("Feature text references an unknown permission: " + code + "." + field);
        }
        var v = perms[field];
        if (field === "posting_daily_limit") return v === null ? "Unlimited" : String(v);
        return String(v);
      }
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
      // The slot has to survive this hop, or the "one answer per question"
      // rule below never fires and a card contradicts itself.
      if (f.slot) out.slot = f.slot;
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
    var rows = catalogueFor(side).map(function (f) {
      var need = LEVEL_ORDER.indexOf(f.unlocksAt);
      var included = have >= need && !f.comingSoon;
      return {
        text: f.text,
        group: f.group,
        slot: f.slot || null,
        unlocksAt: f.unlocksAt,
        comingSoon: !!f.comingSoon,
        included: included,
        // null when included — the mark exists ONLY on a feature you lack.
        lockedBy: included || f.comingSoon ? null : f.unlocksAt
      };
    });

    // A SLOT answers one question — "how many drivers?", "how many jobs a
    // day?" — and an account can only have ONE answer to it. Without this, a
    // Plus fleet card read "Up to 5 drivers" AND "Up to 25 drivers", and a Pro
    // driver was told both "up to 5 jobs a day" and "unlimited". Only the
    // highest rung you actually have survives; the rungs above you stay, so
    // the card still shows what upgrading would buy.
    var best = {};
    rows.forEach(function (r) {
      if (!r.slot || !r.included) return;
      var rank = LEVEL_ORDER.indexOf(r.unlocksAt);
      if (best[r.slot] === undefined || rank > best[r.slot]) best[r.slot] = rank;
    });
    return rows.filter(function (r) {
      if (!r.slot || !r.included) return true;
      return LEVEL_ORDER.indexOf(r.unlocksAt) === best[r.slot];
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
  // 6b. FEATURE GROUPS — one vocabulary, so no screen invents its own headings
  // ===========================================================================
  // Every screen that lists features reads these labels rather than hard-coding
  // "HAF platform" / "AI & automation" the way the old preview card did. The
  // ORDER and headings are Brent's 14 Aug brief, section for section, so a
  // customer reads the table in the same order he wrote the document:
  // your account, posting, the driver's PLNA, routes, calendar, fleet,
  // bookings, pricing, branding, then JAKO.
  //
  // DASHBOARD and PLATFORM are kept as aliases of the account section: they
  // were the old coarse buckets, and a row that has not been re-filed yet must
  // still land somewhere a customer can read rather than under a raw code.
  var GROUP_ORDER = [
    "ACCOUNT", "DASHBOARD", "PLATFORM", "POSTING", "PLNA", "ROUTES",
    "CALENDAR", "FLEET", "BOOKING", "PRICING", "BRANDING", "AI"
  ];
  var GROUP_LABELS = {
    ACCOUNT: "Your account",
    DASHBOARD: "Your account",
    PLATFORM: "Your account",
    POSTING: "Posting work onto the network",
    PLNA: "Driver and PLNA",
    ROUTES: "Return and filler route planning",
    CALENDAR: "Calendar and driver diary",
    FLEET: "Fleet and driver management",
    BOOKING: "Bookings and customers",
    PRICING: "Pricing and utilisation",
    BRANDING: "Branding and business tools",
    AI: "JAKO AI"
  };

  // Features for a side and level, already split into the labelled sections a
  // page renders. Groups with nothing in them are dropped, so a page never
  // shows an empty heading.
  function featureSections(side, level) {
    var rows = featuresForSideLevel(side, level);
    var out = [];
    GROUP_ORDER.forEach(function (g) {
      var inGroup = rows.filter(function (f) { return f.group === g; });
      if (!inGroup.length) return;
      var existing = null;
      out.forEach(function (s) { if (s.label === GROUP_LABELS[g]) existing = s; });
      if (existing) { existing.features = existing.features.concat(inGroup); return; }
      out.push({ group: g, label: GROUP_LABELS[g], features: inGroup });
    });
    // Anything carrying a group this file has not been told about still gets
    // shown, under its own raw name, rather than silently vanishing off a page.
    rows.forEach(function (f) {
      if (GROUP_ORDER.indexOf(f.group) >= 0) return;
      var bucket = null;
      out.forEach(function (s) { if (s.group === f.group) bucket = s; });
      if (!bucket) { bucket = { group: f.group, label: String(f.group), features: [] }; out.push(bucket); }
      bucket.features.push(f);
    });
    return out;
  }

  // ===========================================================================
  // 6d. PERMISSIONS — the one place any screen or gate asks "may they?"
  //
  // A page must never test the tier name. It asks for the permission by name,
  // so the day a limit or an entitlement moves it moves once, in config.
  // ===========================================================================
  function permissionsFor(level) {
    var perms = config.tierPermissions[String(level || "").toUpperCase()];
    if (!perms) throw new Error("Unknown level: " + level);
    var copy = {};
    Object.keys(perms).forEach(function (k) { copy[k] = perms[k]; });
    return copy;
  }

  function can(level, permission) {
    var perms = permissionsFor(level);
    if (perms[permission] === undefined) {
      throw new Error("Unknown permission: " + permission);
    }
    return perms[permission] === true;
  }

  // null means unlimited, everywhere. Callers that need words use the label.
  function postingLimit(level) {
    return permissionsFor(level).posting_daily_limit;
  }

  function postingLimitLabel(level) {
    var n = postingLimit(level);
    return n === null ? "Unlimited" : n + " jobs a day";
  }

  // Would this submission be allowed? countToday is jobs already SUBMITTED to
  // the network today — drafts are not counted by the caller, per the rule.
  function mayPostAnother(level, countToday) {
    var limit = postingLimit(level);
    var used = Number(countToday) || 0;
    if (limit === null) return { allowed: true, remaining: null, limit: null };
    return {
      allowed: used < limit,
      remaining: Math.max(0, limit - used),
      limit: limit
    };
  }

  // ===========================================================================
  // 7. PUBLIC API
  // ===========================================================================
  return {
    config: config,
    permissionsFor: permissionsFor,
    can: can,
    postingLimit: postingLimit,
    postingLimitLabel: postingLimitLabel,
    mayPostAnother: mayPostAnother,
    isProTier: isProTier,
    identity: identity,
    crownedTiers: crownedTiers,
    featuresFor: featuresFor,
    featuresForSideLevel: featuresForSideLevel,
    featureSections: featureSections,
    groupLabels: GROUP_LABELS,
    groupOrder: GROUP_ORDER,
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
