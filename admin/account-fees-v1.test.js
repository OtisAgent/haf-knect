/* Account Fees V1 — regression tests. Run: node account-fees-v1.test.js */
"use strict";
var A = require("./account-fees-v1.js");
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? " — " + JSON.stringify(extra) : "")); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 0.01); }
function threw(fn) { try { fn(); return false; } catch (e) { return true; } }

console.log("Account Fees (" + A.version + ")\n");

// ---------------------------------------------------------------------------
console.log("1. THE RULE — no work, no invoice, no charge");
// ---------------------------------------------------------------------------
var w = A.weeklyInvoice({
  fleetAccountType: "FLEET_LITE",
  drivers: [{ id: "D1", wasPaid: false }, { id: "D2", wasPaid: false }]
});
ok("quiet week produces no invoice", w.invoiceGenerated === false);
ok("quiet week charges nothing", w.feeExVatGbp === 0 && w.feeIncVatGbp === 0, w);
ok("quiet week is flagged, not silent", w.flags.indexOf("NO_INVOICE_NO_FEE") !== -1);

var m = A.monthlyBill({
  accountType: "FLEET_LITE",
  drivers: [{ id: "D1", paidBlocks: 0 }, { id: "D2", paidBlocks: 0 }, { id: "D3", paidBlocks: 0 }]
});
ok("free fleet, no jobs all month = £0", m.totalExVatGbp === 0, m);

m = A.monthlyBill({ accountType: "FLEET_PRO", drivers: A.fullTimeDrivers(5, 0) });
ok("paid fleet, no jobs all month = account fee only (£50)", m.totalExVatGbp === 50, m);

w = A.weeklyInvoice({
  fleetAccountType: "FLEET_LITE",
  drivers: [{ id: "D1", wasPaid: true }, { id: "D2", wasPaid: false }, { id: "D3", wasPaid: false }]
});
ok("only the driver who earned is billed", w.lines.length === 1 && approx(w.feeExVatGbp, 9.99), w);

// ---------------------------------------------------------------------------
console.log("\n2. THE DOUBLE CHARGE — impossible by construction");
// ---------------------------------------------------------------------------
var r = A.resolveInvoicingParty({ fleetAccountType: "FLEET_PRO", driverAccountType: "PLNA_LITE" });
ok("inside a fleet the FLEET is the invoicing party", r.party === "FLEET");
ok("the driver's own payment-run fee is suppressed", r.driverFeeSuppressed === true);
ok("one fee applies, the fleet's (£5)", approx(r.feeGbp, 5.00), r);

w = A.weeklyInvoice({
  fleetAccountType: "FLEET_PRO", driverAccountType: "PLNA_LITE",
  drivers: [{ id: "D1", wasPaid: true }, { id: "D2", wasPaid: true }]
});
// Brent 2026-07-29: one invoice goes to the business, so one fee — however many
// drivers are on it. Never one per driver, and never one each for fleet+driver.
ok("2 paid fleet drivers = 1 line, never 2 or 4", w.lines.length === 1, w.lines);
ok("2 paid fleet drivers = £5, not £10 and not £29.98", approx(w.feeExVatGbp, 5.00), w);
ok("suppression is on the audit trail", w.flags.indexOf("DRIVER_FEE_SUPPRESSED") !== -1);

r = A.resolveInvoicingParty({ driverAccountType: "PLNA_LITE" });
ok("independent driver raises their own invoice", r.party === "DRIVER" && approx(r.feeGbp, 9.99));

// A fleet tier may LOWER the fee, never raise it.
var saved = A.config.accountTypes.FLEET_LITE.paymentRunFeeGbp;
A.config.accountTypes.FLEET_LITE.paymentRunFeeGbp = 12.50;
r = A.resolveInvoicingParty({ fleetAccountType: "FLEET_LITE", driverAccountType: "PLNA_LITE" });
ok("a fleet tier can never raise the fee above the driver's", approx(r.feeGbp, 9.99), r);
A.config.accountTypes.FLEET_LITE.paymentRunFeeGbp = saved;
ok("config restored", A.config.accountTypes.FLEET_LITE.paymentRunFeeGbp === 9.99);

// ---------------------------------------------------------------------------
console.log("\n3. WORKED EXAMPLES — must match the pricing document exactly");
// ---------------------------------------------------------------------------
function fleetMonth(code, n, blocks) {
  return A.monthlyBill({ accountType: code, drivers: A.fullTimeDrivers(n, blocks) });
}
ok("Lite, 1 driver every week = £43.26", approx(fleetMonth("FLEET_LITE", 1).totalExVatGbp, 43.26), fleetMonth("FLEET_LITE", 1));
// One invoice per fleet per week, so the payment-run cost is FLAT no matter how
// many drivers are on it. Growth revenue comes from seats, never from the fee.
ok("Lite, 3 drivers every week = £43.26 (same as 1 — one invoice)",
  approx(fleetMonth("FLEET_LITE", 3).totalExVatGbp, 43.26), fleetMonth("FLEET_LITE", 3));
ok("Lite, 3 drivers two weeks each = £19.98", approx(fleetMonth("FLEET_LITE", 3, 2).totalExVatGbp, 19.98));
ok("Pro, 3 drivers every week = £71.65", approx(fleetMonth("FLEET_PRO", 3).totalExVatGbp, 71.65));
ok("Pro, 5 drivers every week = £71.65", approx(fleetMonth("FLEET_PRO", 5).totalExVatGbp, 71.65));
ok("Pro, 10 drivers every week = £96.65", approx(fleetMonth("FLEET_PRO", 10).totalExVatGbp, 96.65));
ok("Pro, 25 drivers every week = £171.65", approx(fleetMonth("FLEET_PRO", 25).totalExVatGbp, 171.65));
ok("Pro, 100 drivers every week = £546.65", approx(fleetMonth("FLEET_PRO", 100).totalExVatGbp, 546.65),
  fleetMonth("FLEET_PRO", 100).paymentRuns);
// The invoice fee must not move with driver count — that is the whole point.
ok("the payment-run cost is identical at 3, 25 and 100 drivers",
  approx(fleetMonth("FLEET_PRO", 3).paymentRuns.totalGbp, 21.65) &&
  approx(fleetMonth("FLEET_PRO", 25).paymentRuns.totalGbp, 21.65) &&
  approx(fleetMonth("FLEET_PRO", 100).paymentRuns.totalGbp, 21.65));

var p10 = fleetMonth("FLEET_PRO", 10);
ok("Pro at 10 sells 5 extra seats at £5", p10.subscription.extraSeats === 5 && approx(p10.subscription.extraSeatsGbp, 25), p10.subscription);
ok("Pro at 5 sells no seats", fleetMonth("FLEET_PRO", 5).subscription.extraSeats === 0);

// ---------------------------------------------------------------------------
console.log("\n4. CAPS AND LIMITS");
// ---------------------------------------------------------------------------
var over = fleetMonth("FLEET_LITE", 4);
ok("4 drivers on the free tier is flagged", over.flags.indexOf("DRIVER_LIMIT_EXCEEDED") !== -1, over.flags);
ok("free tier never sells a 4th seat", over.subscription.extraSeats === 0 && over.subscription.totalGbp === 0);
ok("free tier allows 3 drivers", fleetMonth("FLEET_LITE", 3).flags.indexOf("DRIVER_LIMIT_EXCEEDED") === -1);
ok("free tier bookings limit is a number, not a range", A.config.accountTypes.FLEET_LITE.bookingsPerDriverPerDay === 2);

// ---------------------------------------------------------------------------
console.log("\n5. THE LADDER");
// ---------------------------------------------------------------------------
var ladder = A.feeLadderCheck();
ok("no paid tier charges more per payment run than free", ladder.ok, ladder.breaches);

var rec1 = A.recommendTier(1);
ok("1 full-time driver: free tier is cheapest", rec1.cheapest.accountType === "FLEET_LITE", rec1.options);
var rec3 = A.recommendTier(3);
// With one flat invoice fee the free tier is genuinely the cheapest right up to
// its 3-driver cap. Pro is then sold on features and headroom, never on price.
ok("3 full-time drivers: free tier is still cheapest", rec3.cheapest.accountType === "FLEET_LITE", rec3.options);
ok("3 full-time drivers: Pro costs £28.39 more, and we say so", approx(rec3.savingGbp, 28.39), rec3);
ok("no fleet ever pays more than £43.26 a month on the free tier",
  approx(fleetMonth("FLEET_LITE", 3).totalExVatGbp, 43.26));
var rec6 = A.recommendTier(6);
ok("6 drivers: free tier is not even eligible", rec6.options[0].eligible === false && rec6.cheapest.accountType === "FLEET_PRO");

// ---------------------------------------------------------------------------
console.log("\n6. NO GUESSING — unset figures refuse to price");
// ---------------------------------------------------------------------------
// Confirmed by Brent 2026-07-29 ("keep as it stands"): Plus £10, Pro £50.
ok("PLNA Plus is priced now", A.config.accountTypes.PLNA_PLUS.status === "SET");
ok("PLNA Plus is £10 a month", approx(A.config.accountTypes.PLNA_PLUS.monthlyGbp, 10));
ok("PLNA Pro is £50 a month", approx(A.config.accountTypes.PLNA_PRO.monthlyGbp, 50));
ok("PLNA Plus, driver paid every week = £35.98 (£10 + 4.33 × £6)",
  approx(A.monthlyBill({ accountType: "PLNA_PLUS", drivers: A.fullTimeDrivers(1) }).totalExVatGbp, 35.98),
  A.monthlyBill({ accountType: "PLNA_PLUS", drivers: A.fullTimeDrivers(1) }));
ok("an independent Plus driver is charged £6 per invoice, not the Lite £9.99",
  approx(A.resolveInvoicingParty({ driverAccountType: "PLNA_PLUS" }).feeGbp, 6.00));

// PLNA Pro's payment-run fee is documented at £0 but conflicts with the
// no-waiver rule locked the same day. It must stay visibly flagged until Brent
// rules on it — a number nobody has reconciled is not a number we publish.
ok("PLNA Pro's fee still carries its unresolved conflict",
  A.config.accountTypes.PLNA_PRO.sourceConflict &&
  A.config.accountTypes.PLNA_PRO.sourceConflict.status === "OPEN",
  A.config.accountTypes.PLNA_PRO.sourceConflict);

// The no-guessing guard itself must still work for anything genuinely unpriced.
A.config.accountTypes.TEST_UNSET = {
  name: "Test Unset", side: "FLEET", status: "UNSET", level: "LITE",
  monthlyGbp: null, paymentRunFeeGbp: null
};
ok("an UNSET type throws rather than inventing a number",
  threw(function () { A.monthlyBill({ accountType: "TEST_UNSET", drivers: [] }); }));
delete A.config.accountTypes.TEST_UNSET;
ok("an unknown account type throws",
  threw(function () { A.monthlyBill({ accountType: "FLEET_GOLD", drivers: [] }); }));

// ---------------------------------------------------------------------------
console.log("\n7. VAT AND THE OTHER BASIS");
// ---------------------------------------------------------------------------
w = A.weeklyInvoice({ fleetAccountType: "FLEET_PRO", drivers: [{ id: "D1", wasPaid: true }] });
ok("£5 + 20% VAT = £6.00", approx(w.vatGbp, 1.00) && approx(w.feeIncVatGbp, 6.00), w);

// The live basis is one flat fee per invoice. The per-driver basis still exists
// in the engine so the alternative can be modelled — it is not what we charge.
ok("the live basis is one fee per invoice", A.config.fleetFeeBasis === "PER_INVOICE");
w = A.weeklyInvoice({
  fleetAccountType: "FLEET_PRO",
  drivers: [{ id: "D1", wasPaid: true }, { id: "D2", wasPaid: true }, { id: "D3", wasPaid: true }]
});
ok("live basis: 3 paid drivers, one invoice, one £5 fee", w.lines.length === 1 && approx(w.feeExVatGbp, 5.00), w);
ok("live basis is flagged on the invoice", w.flags.indexOf("FLAT_FEE_BASIS") !== -1);

var savedBasis = A.config.fleetFeeBasis;
A.config.fleetFeeBasis = "PER_DRIVER_LINE";
var perDriver5 = fleetMonth("FLEET_PRO", 5);
ok("modelled per-driver basis: Pro 5 drivers would be £158.25 (not what we charge)",
  approx(perDriver5.totalExVatGbp, 158.25), perDriver5);
var perDriverLite3 = fleetMonth("FLEET_LITE", 3);
ok("modelled per-driver basis: Lite 3 drivers would be £129.77 (not what we charge)",
  approx(perDriverLite3.totalExVatGbp, 129.77), perDriverLite3);
A.config.fleetFeeBasis = savedBasis;
ok("basis restored to PER_INVOICE", A.config.fleetFeeBasis === "PER_INVOICE");

// The compliance condition that makes one invoice correct in the first place.
ok("self-employed drivers may not sit under a fleet account",
  A.config.fleetDriverEligibility.selfEmployedAllowed === false);
ok("the fleet eligibility rule spells out what is required",
  A.config.fleetDriverEligibility.requires.length >= 4);
ok("VAT treatment is settled: prices are ex-VAT, plus VAT",
  A.config.vatTreatment === "EX_VAT_PLUS_VAT" && A.config.vatPct === 20);

// ---------------------------------------------------------------------------
console.log("\n9. THE CROWN — Pro identity on any account type");
// ---------------------------------------------------------------------------
var C = require("./pro-crown.js");

ok("Fleet Pro wears the crown", A.identity("FLEET_PRO").crown === true);
ok("PLNA Pro wears the crown", A.identity("PLNA_PRO").crown === true);
ok("Fleet Lite does not", A.identity("FLEET_LITE").crown === false);
ok("PLNA Lite does not", A.identity("PLNA_LITE").crown === false);
ok("PLNA Plus does not — Plus is not Pro", A.identity("PLNA_PLUS").crown === false);
ok("Freight Pro wears the crown too — unpriced, still Pro",
  A.identity("FREIGHT_PRO").crown === true);
ok("Freight Plus does not", A.identity("FREIGHT_PLUS").crown === false);
// Brent 2026-07-29: the crown goes on "the PRO versions on any account type",
// so every side that HAS a Pro carries it — driver, fleet and freight. Business
// is absent on purpose: the brief gives it a single tier, so it has no Pro.
ok("every Pro tier on every side is crowned today",
  A.crownedTiers().sort().join(",") === "FLEET_PRO,FREIGHT_PRO,PLNA_PRO", A.crownedTiers());
ok("no business tier is crowned, because none is on the books",
  Object.keys(A.config.accountTypes).every(function (c) { return c.indexOf("BUSINESS") !== 0; }));

// Identity is not pricing — the crown is earned by level, whatever the figures.
A.config.accountTypes.TEST_PRO_UNSET = {
  name: "Test Pro", side: "FLEET", status: "UNSET", level: "PRO",
  monthlyGbp: null, paymentRunFeeGbp: null
};
ok("an UNSET Pro tier still earns the crown", A.identity("TEST_PRO_UNSET").crown === true);
ok("but an UNSET Pro tier still refuses to be quoted",
  threw(function () { A.monthlyBill({ accountType: "TEST_PRO_UNSET", drivers: [] }); }));
delete A.config.accountTypes.TEST_PRO_UNSET;

// "Any account type" — including ones that do not exist yet.
A.config.accountTypes.BUSINESS_PRO_FUTURE = {
  name: "Business Pro", side: "BUSINESS", status: "UNSET", level: "PRO",
  monthlyGbp: null, paymentRunFeeGbp: null
};
ok("a brand-new Pro type is crowned with no extra wiring",
  A.identity("BUSINESS_PRO_FUTURE").crown === true);
ok("and it joins the crowned list automatically",
  A.crownedTiers().indexOf("BUSINESS_PRO_FUTURE") !== -1);
delete A.config.accountTypes.BUSINESS_PRO_FUTURE;
ok("test type removed again", A.crownedTiers().length === 3);

// The renderer must be incapable of showing a crown to a non-Pro.
ok("renderer: Pro gets markup", C.forAccount(A.identity("FLEET_PRO")).indexOf("haf-crown") !== -1);
ok("renderer: Lite gets nothing at all", C.forAccount(A.identity("FLEET_LITE")) === "");
ok("renderer: Plus gets nothing at all", C.forAccount(A.identity("PLNA_PLUS")) === "");
ok("renderer: unknown/absent account gets nothing", C.forAccount(null) === "" && C.forAccount({}) === "");
ok("renderer: a bare level string works too", C.forAccount("PRO").indexOf("haf-crown") !== -1);
ok("renderer: level is case-insensitive", C.isPro("pro") === true);
ok("renderer: 'PROSPECT' is not 'PRO'", C.isPro("PROSPECT") === false);

// It must be drawn artwork, not an emoji, and it must say Pro out loud.
ok("the crown is a drawn SVG", C.svg().indexOf("<svg") === 0 && C.svg().indexOf("<path") !== -1);
ok("no emoji anywhere in the badge", C.badge().indexOf("\u{1F451}") === -1);
ok("screen readers hear 'Pro account'", C.badge().indexOf('aria-label="Pro account"') !== -1);
ok("mark-only form drops the word but keeps the label for readers",
  C.badge({ withLabel: false }).indexOf("haf-crown__label") === -1 &&
  C.badge({ withLabel: false }).indexOf("Pro account") !== -1);
ok("badge carries the brand accent via its own stylesheet",
  C.css.indexOf("--haf-crown,#f18e00") !== -1);

// ---------------------------------------------------------------------------
console.log("\n8. THE MISSING-FEATURE MARKS — Plus mark and crown on what you lack");
// ---------------------------------------------------------------------------
var M = require("./tier-marks-v1.js");

// --- the ladder itself -----------------------------------------------------
var liteFeat = A.featuresFor("PLNA_LITE");
var plusFeat = A.featuresFor("PLNA_PLUS");
var proFeat = A.featuresFor("PLNA_PRO");

ok("every tier on a side sees the same ladder", liteFeat.length === proFeat.length);
ok("Lite is missing things", liteFeat.some(function (f) { return f.lockedBy; }));
ok("Pro is missing nothing", A.ladderCheck().ok, A.ladderCheck().breaches);
ok("Fleet Pro is missing nothing either",
  A.featuresFor("FLEET_PRO").every(function (f) { return !f.lockedBy; }));

// The exact thing Brent asked for, stated as a test.
ok("a Plus feature on the Lite card is marked PLUS",
  liteFeat.some(function (f) { return f.lockedBy === "PLUS"; }));
ok("a Pro feature on the Lite card is marked PRO (the crown)",
  liteFeat.some(function (f) { return f.lockedBy === "PRO"; }));
ok("on the Plus card the Plus features are no longer marked",
  plusFeat.every(function (f) { return f.lockedBy !== "PLUS"; }));
ok("on the Plus card the Pro features still wear the crown",
  plusFeat.some(function (f) { return f.lockedBy === "PRO"; }));

// The invariant that stops a mark ever meaning "included".
ok("no included feature carries a mark",
  liteFeat.concat(plusFeat, proFeat).every(function (f) {
    return !(f.included && f.lockedBy);
  }));
ok("an entry-level feature is never marked on the entry tier",
  liteFeat.every(function (f) { return f.unlocksAt !== "LITE" || !f.lockedBy; }));

// --- features are grouped into named sections, never one flat list ---------
var KNOWN_GROUPS = ["DASHBOARD", "PLATFORM", "PLNA", "AI"];
ok("the driver ladder is split into dashboard and PLNA sections",
  liteFeat.some(function (f) { return f.group === "DASHBOARD"; }) &&
  liteFeat.some(function (f) { return f.group === "PLNA"; }));
ok("every feature on every side carries a known group",
  ["DRIVER", "FLEET", "FREIGHT"].every(function (side) {
    return A.config.featureCatalogue[side].every(function (f) {
      return KNOWN_GROUPS.indexOf(f.group) >= 0;
    });
  }));
ok("every group has a human label",
  KNOWN_GROUPS.every(function (g) { return !!A.groupLabels[g]; }));

// --- featureSections gives a page its headings, in reading order -----------
var driverPlusSecs = A.featureSections("DRIVER", "PLUS");
ok("driver sections come back labelled and non-empty",
  driverPlusSecs.length >= 2 &&
  driverPlusSecs.every(function (s) { return !!s.label && s.features.length > 0; }));
ok("dashboard is read before PLNA",
  driverPlusSecs[0].label === "Dashboard features" &&
  driverPlusSecs[1].label === "PLNA features");
ok("sectioning loses no feature",
  driverPlusSecs.reduce(function (n, s) { return n + s.features.length; }, 0) ===
    A.featuresForSideLevel("DRIVER", "PLUS").length);
ok("every side can be sectioned without an empty heading",
  ["DRIVER", "FLEET", "FREIGHT"].every(function (side) {
    return ["LITE", "PLUS", "PRO"].every(function (lvl) {
      return A.featureSections(side, lvl).every(function (s) { return s.features.length > 0; });
    });
  }));

// --- Brent's core product rule: membership must not buy better work --------
// "Do not build: priority jobs for paid accounts, first access to jobs for Pro,
// better jobs for Plus/Pro, artificial ranking boosts." (14 Aug brief.) These
// words are how that promise would leak back onto a customer-facing card.
var BANNED_ON_DRIVER = ["priority", "first access", "better job", "ranking"];
ok("no driver feature sells priority or better work for paying",
  A.config.featureCatalogue.DRIVER.every(function (f) {
    var t = f.text.toLowerCase();
    return BANNED_ON_DRIVER.every(function (w) { return t.indexOf(w) < 0; });
  }));

// --- JAKO is a Pro feature, because it costs real tokens -------------------
ok("no AI or JAKO line is included below Pro",
  A.featuresForSideLevel("DRIVER", "PLUS").every(function (f) {
    var t = f.text.toLowerCase();
    return !(f.included && (t.indexOf("jako") >= 0 || t.indexOf(" ai") >= 0 || t.indexOf("ai ") === 0));
  }));
ok("JAKO does appear on Pro",
  A.featuresForSideLevel("DRIVER", "PRO").some(function (f) {
    return f.included && f.text.toLowerCase().indexOf("jako") >= 0;
  }));

// --- coming soon is never sold as included ---------------------------------
var freightPro = A.featuresForSideLevel("FREIGHT", "PRO");
var soon = freightPro.filter(function (f) { return f.comingSoon; });
ok("a coming-soon feature is not included even on the top tier",
  soon.length > 0 && soon.every(function (f) { return f.included === false; }));
ok("a coming-soon feature is not marked as an upgrade either",
  soon.every(function (f) { return f.lockedBy === null; }));
// It must not render a tick on the top tier either — that was the bug the
// preview caught: "included" logic gave groupage a tick on every freight card.
["LITE", "PLUS", "PRO"].forEach(function (lvl) {
  var s = M.rowState("LITE", lvl, { comingSoon: true });
  ok("coming soon on " + lvl + ": no tick, no upgrade mark, says Soon",
    s.included === false && s.html.indexOf("haf-mark--have") === -1 &&
    s.html.indexOf("haf-mark--pro") === -1 && s.html.indexOf("haf-mark--plus") === -1 &&
    s.html.indexOf(">Soon<") !== -1, s.html);
});
ok("renderList marks coming-soon rows without being told the level",
  M.renderList(A.config.featureCatalogue.FREIGHT, "PRO")
    .filter(function (r) { return r.comingSoon; })
    .every(function (r) { return r.state.html.indexOf("haf-mark--soon") !== -1; }));

// --- numbers can never drift from the priced config ------------------------
ok("fleet driver cap is read from the config, not typed into the copy",
  A.featuresFor("FLEET_LITE").some(function (f) {
    return f.text === "Up to " + A.config.accountTypes.FLEET_LITE.maxDrivers + " drivers";
  }));
// Brent deleted per-driver charging when he locked the fleet bands — a fleet
// pays for its band, never per head. This test used to assert the opposite,
// so it was guarding a line that should already have been gone.
ok("no fleet card sells a per-driver seat price",
  A.featuresFor("FLEET_PRO").every(function (f) {
    return !/each per month|per driver per month|per extra driver/i.test(f.text);
  }));
function withTempFeature(text, fn) {
  A.config.featureCatalogue.FLEET.push({ unlocksAt: "PRO", group: "PLATFORM", text: text });
  try { return fn(); } finally { A.config.featureCatalogue.FLEET.pop(); }
}
ok("a figure that isn't set throws rather than printing a token", threw(function () {
  withTempFeature("{FLEET_PRO.notAFigureWeHold} a month", function () {
    A.featuresFor("FLEET_LITE");
  });
}));
ok("a token pointing at a tier that doesn't exist throws too", threw(function () {
  withTempFeature("{BUSINESS_PRO.monthlyGbp} a month", function () {
    A.featuresFor("FLEET_LITE");
  });
}));
ok("no raw token survives into any customer-facing line",
  ["PLNA_LITE", "PLNA_PLUS", "PLNA_PRO", "FLEET_LITE", "FLEET_PRO"].every(function (c) {
    return A.featuresFor(c).every(function (f) { return f.text.indexOf("{") === -1; });
  }));

// --- the upgrade counter ---------------------------------------------------
var sum = A.missingSummary("PLNA_LITE");
ok("Lite is told how many more come with Plus and with Pro",
  sum.PLUS > 0 && sum.PRO > 0, sum);
ok("Pro is told it is missing nothing",
  A.missingSummary("PLNA_PRO").PLUS === 0 && A.missingSummary("PLNA_PRO").PRO === 0);

// --- the artwork -----------------------------------------------------------
ok("the Plus mark is drawn, not an emoji",
  M.plusSvg().indexOf("<svg") === 0 && M.plusSvg().indexOf("➕") === -1);
ok("the crown in a feature list is the SAME crown as the badge",
  M.crownSvg().indexOf('<path d="M3.4 8.2') !== -1);
ok("Lite has no mark of its own", M.markFor("LITE") === null);
ok("Plus and Pro both have one",
  M.markFor("PLUS").label === "Plus" && M.markFor("PRO").label === "Pro");

// --- the renderer gate -----------------------------------------------------
var have = M.rowState("PLUS", "PRO");
var lack = M.rowState("PRO", "LITE");
ok("a feature you have renders a tick, never a mark",
  have.included === true && have.html.indexOf("haf-mark--have") !== -1 &&
  have.html.indexOf("haf-mark--pro") === -1);
ok("a Pro feature you lack renders the crown and the word Pro",
  lack.included === false && lack.html.indexOf("haf-mark--pro") !== -1 &&
  lack.html.indexOf(">Pro<") !== -1);
ok("a Plus feature you lack renders the Plus mark",
  M.rowState("PLUS", "LITE").html.indexOf("haf-mark--plus") !== -1);
ok("screen readers are told it is not included",
  lack.html.indexOf('aria-label="Pro feature — not included on your tier"') !== -1);
ok("a locked row is never struck through", M.css.indexOf("line-through") === -1);
ok("unknown levels throw rather than guess",
  threw(function () { M.rowState("GOLD", "LITE"); }) &&
  threw(function () { M.rowState("PRO", "GOLD"); }));

// The whole point, end to end: render the Lite card and count its symbols.
var rendered = M.renderList(A.config.featureCatalogue.DRIVER, "LITE");
var crowns = rendered.filter(function (r) { return r.state.unlockLabel === "Pro"; }).length;
var pluses = rendered.filter(function (r) { return r.state.unlockLabel === "Plus"; }).length;
ok("the Lite card ends up with both symbols on it", crowns > 0 && pluses > 0,
  { crowns: crowns, pluses: pluses });
ok("and the Pro card ends up with none",
  M.renderList(A.config.featureCatalogue.DRIVER, "PRO")
    .every(function (r) { return r.state.unlockLabel === null; }));

// Every side, not just the driver card. Brent asked for the marks "per account
// tier", so each side that has a ladder must show it: a Lite card carries marks
// for everything above it, a middle tier carries only the crown, a Pro card is
// clean. This is the one test that would catch a whole account type being left
// out of the sweep.
["DRIVER", "FLEET", "FREIGHT"].forEach(function (side) {
  var levels = A.config.featureCatalogue[side].map(function (f) { return f.unlocksAt; });
  var lite = M.renderList(A.config.featureCatalogue[side], "LITE");
  var pro  = M.renderList(A.config.featureCatalogue[side], "PRO");
  var lockedOnLite = lite.filter(function (r) { return r.state.unlockLabel !== null; });

  // Expected = every feature above the entry level that is actually live. A
  // coming-soon feature is deliberately excluded: it carries "Soon", never an
  // upgrade mark, because paying more would not get it any sooner.
  var expectMarked = A.config.featureCatalogue[side].filter(function (f) {
    return f.unlocksAt !== "LITE" && !f.comingSoon;
  }).length;
  ok(side + ": the entry card marks every rung above it",
    lockedOnLite.length === expectMarked,
    { marked: lockedOnLite.length, expected: expectMarked });
  ok(side + ": the Pro card carries no marks at all",
    pro.every(function (r) { return r.state.unlockLabel === null; }));
  // Only sides that actually sell a middle tier get checked for one.
  if (levels.indexOf("PLUS") !== -1) {
    var plus = M.renderList(A.config.featureCatalogue[side], "PLUS");
    var marks = plus.filter(function (r) { return r.state.unlockLabel !== null; });
    ok(side + ": the middle card is marked with crowns only, never a Plus mark",
      marks.length > 0 && marks.every(function (r) { return r.state.unlockLabel === "Pro"; }));
  }
});

// And the freight account can be asked by its code, exactly like the others —
// no special-casing at the call site is what stops a surface forgetting it.
ok("freight reads through the same door as driver and fleet",
  A.featuresFor("FREIGHT_LITE").length === A.config.featureCatalogue.FREIGHT.length &&
  A.missingSummary("FREIGHT_LITE").PRO > 0 &&
  A.missingSummary("FREIGHT_PRO").PRO === 0);


// ---------------------------------------------------------------------------
// BRENT'S 14 AUG FEATURES BRIEF — the rules that must never quietly regress
// ---------------------------------------------------------------------------

// Section 3: posting is on EVERY account. The tier buys the allowance, never
// the ability. If this ever fails, someone has made posting a paid feature.
ok("every level can post work onto the network",
  ["LITE", "PLUS", "PRO"].every(function (l) { return A.can(l, "network_posting"); }));

ok("the posting allowance is 5, 10 and unlimited",
  A.postingLimit("LITE") === 5 &&
  A.postingLimit("PLUS") === 10 &&
  A.postingLimit("PRO") === null,
  { lite: A.postingLimit("LITE"), plus: A.postingLimit("PLUS"), pro: A.postingLimit("PRO") });

ok("unlimited reads as a word, never as a sentinel number",
  A.postingLimitLabel("PRO") === "Unlimited");

// The counting rule: a Free account is stopped at the fifth submitted job, and
// a cancelled job does not hand the allowance back.
ok("Free is allowed the fifth job and refused the sixth",
  A.mayPostAnother("LITE", 4).allowed === true &&
  A.mayPostAnother("LITE", 5).allowed === false &&
  A.mayPostAnother("LITE", 5).remaining === 0);

ok("Pro is never refused",
  A.mayPostAnother("PRO", 9999).allowed === true &&
  A.mayPostAnother("PRO", 9999).limit === null);

ok("cancelled jobs do not return the allowance",
  A.config.postingLimitRule.cancelledReturnsAllowance === false &&
  A.config.postingLimitRule.draftsCount === false);

// Section 1: MATCHING = suitability. Nothing on any card may sell priority,
// first access, or better work for money. "Priority account support" is about
// answering the phone, not about jobs, so it is the single allowed phrase.
var PRIORITY_OK = /priority account support/i;
var soldPriority = [];
["DRIVER", "FLEET", "FREIGHT"].forEach(function (side) {
  A.config.featureCatalogue[side].forEach(function (f) {
    var t = String(f.text);
    if (/\bpriorit/i.test(t) && !PRIORITY_OK.test(t)) soldPriority.push(side + ": " + t);
    if (/first access|jump the queue|better jobs|ranking boost/i.test(t)) soldPriority.push(side + ": " + t);
  });
});
ok("no account type is sold priority, first access or better jobs",
  soldPriority.length === 0, { sold: soldPriority });

// Section 12: JAKO carries a token cost, so it is Pro only — on every side.
var aiBelowPro = [];
["DRIVER", "FLEET", "FREIGHT"].forEach(function (side) {
  A.config.featureCatalogue[side].forEach(function (f) {
    if (/\bJAKO\b|\bAI\b/i.test(String(f.text)) && f.unlocksAt !== "PRO") {
      aiBelowPro.push(side + " [" + f.unlocksAt + "]: " + f.text);
    }
  });
});
ok("JAKO and AI appear on Pro only, on every account type",
  aiBelowPro.length === 0, { found: aiBelowPro });

// Custom branding is Pro only, and the permission agrees with the feature list.
ok("custom branding is Pro only in both the list and the switchboard",
  A.can("PRO", "custom_branding") === true &&
  A.can("PLUS", "custom_branding") === false &&
  A.can("LITE", "custom_branding") === false);

// Section 5: Plus must be genuinely useful WITHOUT AI — the route planner is
// the whole reason Plus exists, so it cannot drift up to Pro.
ok("Plus gets route planning without needing AI",
  A.can("PLUS", "return_route_planning") &&
  A.can("PLUS", "filler_route_planning") &&
  A.can("PLUS", "calendar_gap_detection") &&
  A.can("PLUS", "flexible_pricing") &&
  A.can("PLUS", "direct_driver_booking") &&
  !A.can("PLUS", "jako_ai"));

// The allowance quoted on a card must come from the switchboard, so a limit
// can never be changed in config and left stale in the words next to it.
["DRIVER", "FLEET", "FREIGHT"].forEach(function (side) {
  var texts = A.featuresForSideLevel(side, "PRO").map(function (f) { return f.text; }).join(" | ");
  ok(side + ": the free allowance on the card reads the configured 5",
    texts.indexOf("5 " ) !== -1 || /up to 5/i.test(texts), { side: side });
  ok(side + ": no unresolved token reached the card",
    texts.indexOf("{") === -1 && texts.indexOf("}") === -1);
});

// Every permission the brief names must exist — a screen asking for one that
// was never defined would silently read undefined and open the gate.
var REQUIRED = ["network_posting", "posting_daily_limit", "driver_plna",
  "fleet_management", "freight_forwarding", "direct_driver_booking",
  "flexible_pricing", "pricing_preferences", "return_route_planning",
  "filler_route_planning", "calendar_gap_detection", "advanced_calendar",
  "advanced_booking", "custom_branding", "jako_ai"];
var missingPerms = [];
["LITE", "PLUS", "PRO"].forEach(function (l) {
  var p = A.permissionsFor(l);
  REQUIRED.forEach(function (k) { if (p[k] === undefined) missingPerms.push(l + "." + k); });
});
ok("every permission named in the brief exists on all three levels",
  missingPerms.length === 0, { missing: missingPerms });

// A caller must not be able to mutate the live config by holding the result.
var snapshot = A.permissionsFor("LITE");
snapshot.jako_ai = true;
ok("permissions hand back a copy, not the live switchboard",
  A.can("LITE", "jako_ai") === false);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
