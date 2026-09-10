
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HAFAccountFees = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var config = {
    version: "ACCOUNT-FEES-V1",
    effectiveFrom: "2026-07-29",
    vatPct: 20,

    blocksPerMonth: 4.33,

    fleetFeeBasis: "PER_INVOICE",

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
      reason: "Self-employed drivers under a fleet account are difficult to " +
              "manage and financially unstable."
    },

    accountTypes: {

      PLNA_LITE: {
        name: "PLNA Lite", side: "DRIVER", status: "SET", level: "LITE",
        monthlyGbp: 0,
        paymentRunFeeGbp: 9.99,
        maxDrivers: 1
      },
      PLNA_PLUS: {
        name: "PLNA Plus", side: "DRIVER", status: "SET", level: "PLUS",

        monthlyGbp: 25,
        annualGbp: 250,

        paymentRunFeeGbp: 6.00,
        maxDrivers: 1
      },
      PLNA_PRO: {
        name: "PLNA Pro", side: "DRIVER", status: "SET", level: "PRO",

        monthlyGbp: 100,
        annualGbp: 1000,
        paymentRunFeeGbp: 0,

        sourceConflict: {
          field: "paymentRunFeeGbp",
          documented: 0,
          documentedSource: "internal pricing reference",
          conflictsWith: "the CleverPay no-waiver fee rule",
          askedOf: "OWNER",
          status: "OPEN"
        },
        maxDrivers: 1
      },

      FLEET_LITE: {
        name: "Fleet Lite", side: "FLEET", status: "SET", level: "LITE",
        monthlyGbp: 0,
        paymentRunFeeGbp: 9.99,
        driversIncluded: 5,
        maxDrivers: 5,
        extraDriverMonthlyGbp: null,
        bookingsPerDriverPerDay: 2,

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
        maxDrivers: 25,
        extraDriverMonthlyGbp: null,
        bookingsPerDriverPerDay: null,
        sellsOn: [
          "Up to 25 drivers",
          "Unlimited jobs per driver per day",
          "One price for the company, however many are out"
        ]
      },
      FLEET_PRO: {
        name: "Fleet Pro", side: "FLEET", status: "SET", level: "PRO",
        monthlyGbp: 250,
        paymentRunFeeGbp: 5.00,
        driversIncluded: null,
        maxDrivers: null,
        extraDriverMonthlyGbp: null,
        bookingsPerDriverPerDay: null,

        sellsOn: [
          "Unlimited drivers on one account",
          "Unlimited jobs per driver per day",
          "One weekly invoice for the whole fleet"
        ]
      },

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

    },

    vatTreatment: "EX_VAT_PLUS_VAT",

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

    postingLimitRule: {
      countsOn: "SUBMITTED_TO_NETWORK",
      draftsCount: false,
      cancelledReturnsAllowance: false,
      resets: "DAILY"
    },

    featureCatalogue: {

      DRIVER: [

        { unlocksAt: "LITE", group: "PLNA", text: "Your driver PLNA is an add-on to your HAF account — add it to any account type" },
        { unlocksAt: "LITE", group: "PLNA", text: "Opens once you are approved by Clever Checked — compliance, never the plan you pay for" },
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

        { unlocksAt: "LITE", group: "POSTING", text: "Post your own work onto HAF KNECT — up to {PERM_LITE.posting_daily_limit} jobs a day" , slot: "posting" },

        { unlocksAt: "LITE", group: "POSTING", text: "Move freight — freight posting is on every account type, within your plan's allowance and the network rules" },
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

        { unlocksAt: "PLUS", group: "ROUTES", text: "Return-route planning — find work that fits your journey home" },
        { unlocksAt: "PLUS", group: "ROUTES", text: "Filler-route planning — fill the gap between two confirmed jobs" },
        { unlocksAt: "PLUS", group: "ROUTES", text: "Work matched to your route, mileage, timings and vehicle" },
        { unlocksAt: "PLUS", group: "ROUTES", text: "See whether a job really fits your day before you accept it" },
        { unlocksAt: "PLUS", group: "ROUTES", text: "Reduce empty miles and combine compatible deliveries" },

        { unlocksAt: "LITE", group: "CALENDAR", text: "Basic PLNA calendar" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "Today, Day, Week and Month views — Today by default on a phone" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "Job cards showing time, route, status, vehicle, expected pay, mileage and reference" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "One clear status set from offered through to completed" },
        { unlocksAt: "PLUS", group: "CALENDAR", text: "Calendar gap detection" },
        { unlocksAt: "PLUS", group: "CALENDAR", text: "Find work to fill a gap in your day" },
        { unlocksAt: "PLUS", group: "CALENDAR", text: "Actions on empty time — find filler work, find a return route, mark yourself unavailable" },

        { unlocksAt: "LITE", group: "BOOKING", text: "Your own HAF booking link — one link you send a customer so they can book you direct", slot: "booking_link", comingSoon: true },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Make the link your own — your name, logo and colours on the page your customer lands on", slot: "booking_link", comingSoon: true },
        { unlocksAt: "PRO",  group: "BOOKING", text: "Customise the site itself — your own sections, wording and pictures, on your own booking address", slot: "booking_link", comingSoon: true },
        { unlocksAt: "LITE", group: "BOOKING", text: "Basic pre-booking" },
        { unlocksAt: "LITE", group: "BOOKING", text: "Repeat booking" },
        { unlocksAt: "LITE", group: "BOOKING", text: "Basic customer booking history" },
        { unlocksAt: "LITE", group: "BOOKING", text: "Basic PLNA availability on your booking link", comingSoon: true },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Direct booking by your HAF username" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Advanced scheduled bookings" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Advanced booking types" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Full diary and availability integration on your booking link", comingSoon: true },

        { unlocksAt: "LITE", group: "PRICING", text: "Standard HAF pricing" },
        { unlocksAt: "LITE", group: "PRICING", text: "View the guide price" },
        { unlocksAt: "LITE", group: "PRICING", text: "Accept the standard driver rate" },
        { unlocksAt: "PLUS", group: "PRICING", text: "Flexible backload pricing on return and near-route work" },
        { unlocksAt: "PLUS", group: "PRICING", text: "Choose your own reduction — for example 10%, 15% or 20% below the standard rate" },
        { unlocksAt: "PLUS", group: "PRICING", text: "Pricing preferences for normal, backload, towards-home and urgent work" },
        { unlocksAt: "PLUS", group: "PRICING", text: "HAF never forces a lower rate — every reduction is your choice" },

        { unlocksAt: "LITE", group: "BRANDING", text: "HAF profile and identity" },
        { unlocksAt: "LITE", group: "BRANDING", text: "Basic HAF booking presence" },
        { unlocksAt: "LITE", group: "BRANDING", text: "Powered by HAF KNECT infrastructure" },
        { unlocksAt: "PLUS", group: "BRANDING", text: "Advanced customer tools" },

        { unlocksAt: "PRO",  group: "BRANDING", text: "Custom logo and colours across your HAF profile" },
        { unlocksAt: "PRO",  group: "BRANDING", text: "Company About section and services displayed", comingSoon: true },
        { unlocksAt: "PRO",  group: "BRANDING", text: "Branded booking landing page on your own booking address", comingSoon: true },

        { unlocksAt: "PRO",  group: "AI", text: "JAKO AI, the assistant inside PLNA" },
        { unlocksAt: "PRO",  group: "AI", text: "Ask JAKO about your diary" },
        { unlocksAt: "PRO",  group: "AI", text: "AI route suggestions" },
        { unlocksAt: "PRO",  group: "AI", text: "AI backload recommendations" },
        { unlocksAt: "PRO",  group: "AI", text: "AI earnings analysis" },
        { unlocksAt: "PRO",  group: "AI", text: "AI customer analysis" },
        { unlocksAt: "PRO",  group: "AI", text: "AI utilisation suggestions" },
        { unlocksAt: "PRO",  group: "AI", text: "AI customer and business assistance" }
      ],

      FLEET: [

        { unlocksAt: "LITE", group: "ACCOUNT", text: "Create your fleet or courier company profile" },
        { unlocksAt: "LITE", group: "ACCOUNT", text: "One company account for the whole fleet" },
        { unlocksAt: "LITE", group: "ACCOUNT", text: "Up to {FLEET_LITE.maxDrivers} drivers" , slot: "fleet_headcount" },
        { unlocksAt: "LITE", group: "ACCOUNT", text: "Every driver Clever Checked — a fleet account never bypasses compliance" },
        { unlocksAt: "LITE", group: "ACCOUNT", text: "Standard support" },
        { unlocksAt: "PLUS", group: "ACCOUNT", text: "Up to {FLEET_PLUS.maxDrivers} drivers" , slot: "fleet_headcount" },
        { unlocksAt: "PRO",  group: "ACCOUNT", text: "Unlimited drivers on one account" , slot: "fleet_headcount" },
        { unlocksAt: "PRO",  group: "ACCOUNT", text: "Team roles and permissions on the fleet account" },

        { unlocksAt: "LITE", group: "POSTING", text: "Post jobs to HAF KNECT — up to {PERM_LITE.posting_daily_limit} a day" , slot: "posting" },

        { unlocksAt: "LITE", group: "POSTING", text: "Move freight — freight posting is on every account type, within your plan's allowance and the network rules" },
        { unlocksAt: "LITE", group: "POSTING", text: "Guide price, full-order posting and repeat by reference" },
        { unlocksAt: "LITE", group: "POSTING", text: "See active postings and job status" },
        { unlocksAt: "LITE", group: "POSTING", text: "Cancel a posting, with full audit history" },
        { unlocksAt: "PLUS", group: "POSTING", text: "Post up to {PERM_PLUS.posting_daily_limit} jobs a day onto the network" , slot: "posting" },
        { unlocksAt: "PLUS", group: "POSTING", text: "Advanced repeat-booking controls" },
        { unlocksAt: "PRO",  group: "POSTING", text: "Unlimited job posting onto the network" , slot: "posting" },

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

        { unlocksAt: "PLUS", group: "ROUTES", text: "Return-route planning across the fleet" },
        { unlocksAt: "PLUS", group: "ROUTES", text: "Filler-route planning to fill the gaps in a driver's day" },
        { unlocksAt: "PLUS", group: "ROUTES", text: "Fewer empty miles across the whole fleet" },

        { unlocksAt: "LITE", group: "CALENDAR", text: "A fleet PLNA for every driver — made by the company, not an open PLNA account" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "Simple driver calendar — today, day and week" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "The jobs their company has allocated to them" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "Complete a job and upload proof of delivery" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "Basic driver, vehicle and availability details" },
        { unlocksAt: "LITE", group: "CALENDAR", text: "No public booking line — a fleet driver is booked through their company" },
        { unlocksAt: "PLUS", group: "CALENDAR", text: "The fleet office sees every driver's calendar in one view" },
        { unlocksAt: "PLUS", group: "CALENDAR", text: "Calendar gap tools across every driver's diary" },

        { unlocksAt: "LITE", group: "BOOKING", text: "Your own HAF booking link — one link your customers use to book the company", slot: "booking_link", comingSoon: true },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Make the link your own — your company name, logo and colours on the page customers land on", slot: "booking_link", comingSoon: true },
        { unlocksAt: "PRO",  group: "BOOKING", text: "Customise the site itself — your own sections, wording and pictures, on your own booking address", slot: "booking_link", comingSoon: true },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Direct driver username booking" },

        { unlocksAt: "LITE", group: "PRICING", text: "Standard HAF pricing on every fleet job" },
        { unlocksAt: "PLUS", group: "PRICING", text: "Advanced pricing preferences, including backload rates your drivers choose" },

        { unlocksAt: "LITE", group: "BRANDING", text: "Company profile and HAF identity" },
        { unlocksAt: "PRO",  group: "BRANDING", text: "Custom logo, colours and About section across your HAF company profile" },
        { unlocksAt: "PRO",  group: "BRANDING", text: "Your own customer-facing booking address", comingSoon: true },

        { unlocksAt: "PRO",  group: "AI", text: "JAKO AI for the fleet office" },
        { unlocksAt: "PRO",  group: "AI", text: "AI route and utilisation analysis" },
        { unlocksAt: "PRO",  group: "AI", text: "Daily capacity and allocation planning" },
        { unlocksAt: "PRO",  group: "AI", text: "Best-driver suggestions from approved area, vehicle and compliance" },
        { unlocksAt: "PRO",  group: "AI", text: "Return-route and empty-mile prompts" },
        { unlocksAt: "PRO",  group: "AI", text: "Exception, lateness and missing-POD alerts" },
        { unlocksAt: "PRO",  group: "AI", text: "AI business insight and a weekly fleet performance summary" }
      ],

      FREIGHT: [

        { unlocksAt: "LITE", group: "ACCOUNT", text: "For businesses whose trade is forwarding — any HAF account can post freight without one, to its own plan's allowance and rules" },
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

        { unlocksAt: "PLUS", group: "ROUTES", text: "Return and backload opportunity tools" },

        { unlocksAt: "LITE", group: "BOOKING", text: "Basic booking management" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Request a driver you know by their HAF username" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Advanced booking controls" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Saved clients, addresses, contacts and load templates" },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Client load-management dashboard" },

        { unlocksAt: "LITE", group: "BOOKING", text: "Your own HAF booking link — one link your clients use to send you work", slot: "booking_link", comingSoon: true },
        { unlocksAt: "PLUS", group: "BOOKING", text: "Make the link your own — your name, logo and colours on the page your clients land on", slot: "booking_link", comingSoon: true },
        { unlocksAt: "PRO",  group: "BOOKING", text: "Customise the site itself — your own sections, wording and pictures, on your own booking address", slot: "booking_link", comingSoon: true },

        { unlocksAt: "LITE", group: "PRICING", text: "Standard HAF pricing, with the guide price shown before you confirm" },
        { unlocksAt: "PLUS", group: "PRICING", text: "Reduced network fee on eligible jobs" },
        { unlocksAt: "PRO",  group: "PRICING", text: "Lowest freight network-fee band on eligible jobs" },

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

    entryLevelLabel: { DRIVER: "Lite", FLEET: "Lite", FREIGHT: "Free" },

    footnotes: {
      FLEET: "Fleet Pro does not give every driver the full driver AI. Each " +
             "driver's AI is set by their own PLNA tier.",
      ALL: "CleverPay only charges when an invoice is generated. No work, no " +
           "invoice, no charge."
    },

    openDecisions: [
      "PLNA_PRO payment-run fee — £0 documented, conflicts with the no-waiver " +
      "rule (see PLNA_PRO.sourceConflict)"
    ]
  };

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

  function weeklyInvoice(input) {
    var drivers = input.drivers || [];
    var paid = drivers.filter(function (d) { return d.wasPaid !== false; });
    var flags = [];

    var resolved = resolveInvoicingParty({
      fleetAccountType: input.fleetAccountType,
      driverAccountType: input.driverAccountType
    });

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

  function monthlyBill(input) {
    var code = input.accountType;
    var t = requireSet(code);
    var drivers = input.drivers || [];
    var count = drivers.length;
    var flags = [];

    if (t.maxDrivers !== null && count > t.maxDrivers) {
      flags.push("DRIVER_LIMIT_EXCEEDED");
    }

    var extraSeats = 0;
    if (t.driversIncluded != null && count > t.driversIncluded) {
      extraSeats = count - t.driversIncluded;
      if (t.extraDriverMonthlyGbp == null) {
        extraSeats = 0;
      }
    }
    var seatsGbp = round2(extraSeats * (t.extraDriverMonthlyGbp || 0));
    var subscriptionGbp = round2((t.monthlyGbp || 0) + seatsGbp);

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

  function fullTimeDrivers(n, blocks) {
    var b = blocks == null ? config.blocksPerMonth : blocks;
    var out = [];
    for (var i = 0; i < n; i++) out.push({ id: "D" + (i + 1), paidBlocks: b });
    return out;
  }

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

  function isProTier(code) {
    return tier(code).level === "PRO";
  }

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

  function crownedTiers() {
    return Object.keys(config.accountTypes).filter(isProTier);
  }

  function resolveTokens(text) {
    return String(text).replace(/\{([A-Z_]+)\.([A-Za-z_]+)\}/g, function (_, code, field) {

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

      if (f.slot) out.slot = f.slot;
      if (f.comingSoon) out.comingSoon = true;
      return out;
    });
  }

  function featuresFor(code) {
    var t = tier(code);
    return featuresForSideLevel(t.side, t.level);
  }

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

        lockedBy: included || f.comingSoon ? null : f.unlocksAt
      };
    });

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

  function missingSummary(code) {
    var counts = { PLUS: 0, PRO: 0 };
    featuresFor(code).forEach(function (f) {
      if (f.lockedBy && counts[f.lockedBy] !== undefined) counts[f.lockedBy]++;
    });
    return counts;
  }

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

  var GROUP_ORDER = [
    "ACCOUNT", "DASHBOARD", "PLATFORM", "POSTING", "PLNA", "ROUTES",
    "CALENDAR", "FLEET", "BOOKING", "PRICING", "BRANDING", "AI"
  ];
  var GROUP_LABELS = {
    ACCOUNT: "Your account",
    DASHBOARD: "Your account",
    PLATFORM: "Your account",
    POSTING: "Posting work onto the network",
    PLNA: "Driver PLNA — an add-on to your account",
    ROUTES: "Return and filler route planning",
    CALENDAR: "Calendar and driver diary",
    FLEET: "Fleet and driver management",
    BOOKING: "Bookings and customers",
    PRICING: "Pricing and utilisation",
    BRANDING: "Branding and business tools",
    AI: "JAKO AI"
  };

  var GROUP_NOTES = {

    BOOKING: "Your booking link is one thing at three depths: on the free " +
             "account it is simply your link, Plus puts your name, logo and " +
             "colours on it, and Pro lets you customise the site itself on " +
             "your own booking address. We are building it now — nothing on " +
             "this ladder is switched on yet, on any plan.",
    PLNA: "The driver PLNA is an add-on to your HAF account, not a plan of " +
          "its own — add it to any account type. It opens once you are " +
          "approved by Clever Checked, and what your plan changes is the " +
          "tools inside it.",

    POSTING: "Posting is on every account type, freight included. What a plan " +
             "buys is your daily allowance and the tools around posting — " +
             "never permission to post. Whose goods you may move is set by " +
             "your account type, not your plan: a business account sends its " +
             "own goods, a freight-forwarding account moves its clients’. " +
             "Every load follows the network rules on vehicle, compliance and " +
             "payment."
  };

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

    rows.forEach(function (f) {
      if (GROUP_ORDER.indexOf(f.group) >= 0) return;
      var bucket = null;
      out.forEach(function (s) { if (s.group === f.group) bucket = s; });
      if (!bucket) { bucket = { group: f.group, label: String(f.group), features: [] }; out.push(bucket); }
      bucket.features.push(f);
    });
    return out;
  }

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

  function postingLimit(level) {
    return permissionsFor(level).posting_daily_limit;
  }

  function postingLimitLabel(level) {
    var n = postingLimit(level);
    return n === null ? "Unlimited" : n + " jobs a day";
  }

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
    groupNotes: GROUP_NOTES,
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
