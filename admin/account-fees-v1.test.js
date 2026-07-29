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
ok("2 paid fleet drivers = 2 lines, never 4", w.lines.length === 2, w.lines);
ok("2 paid fleet drivers = £10, not £29.98", approx(w.feeExVatGbp, 10.00), w);
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
ok("Lite, 3 drivers every week = £129.77", approx(fleetMonth("FLEET_LITE", 3).totalExVatGbp, 129.77));
ok("Lite, 3 drivers two weeks each = £59.94", approx(fleetMonth("FLEET_LITE", 3, 2).totalExVatGbp, 59.94));
ok("Pro, 3 drivers every week = £114.95", approx(fleetMonth("FLEET_PRO", 3).totalExVatGbp, 114.95));
ok("Pro, 5 drivers every week = £158.25", approx(fleetMonth("FLEET_PRO", 5).totalExVatGbp, 158.25));
ok("Pro, 10 drivers every week = £291.50", approx(fleetMonth("FLEET_PRO", 10).totalExVatGbp, 291.50));
ok("Pro, 25 drivers every week = £691.25", approx(fleetMonth("FLEET_PRO", 25).totalExVatGbp, 691.25));

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
ok("3 full-time drivers: Pro is cheapest", rec3.cheapest.accountType === "FLEET_PRO", rec3.options);
ok("3 full-time drivers save £14.82 by upgrading", approx(rec3.savingGbp, 14.82), rec3);
var rec6 = A.recommendTier(6);
ok("6 drivers: free tier is not even eligible", rec6.options[0].eligible === false && rec6.cheapest.accountType === "FLEET_PRO");

// ---------------------------------------------------------------------------
console.log("\n6. NO GUESSING — unset figures refuse to price");
// ---------------------------------------------------------------------------
ok("PLNA Plus is not priced yet", A.config.accountTypes.PLNA_PLUS.status === "UNSET");
ok("quoting PLNA Plus throws rather than inventing a number",
  threw(function () { A.monthlyBill({ accountType: "PLNA_PLUS", drivers: A.fullTimeDrivers(1) }); }));
ok("quoting PLNA Pro throws too",
  threw(function () { A.resolveInvoicingParty({ driverAccountType: "PLNA_PRO" }); }));
ok("an unknown account type throws",
  threw(function () { A.monthlyBill({ accountType: "FLEET_GOLD", drivers: [] }); }));

// ---------------------------------------------------------------------------
console.log("\n7. VAT AND THE OTHER BASIS");
// ---------------------------------------------------------------------------
w = A.weeklyInvoice({ fleetAccountType: "FLEET_PRO", drivers: [{ id: "D1", wasPaid: true }] });
ok("£5 + 20% VAT = £6.00", approx(w.vatGbp, 1.00) && approx(w.feeIncVatGbp, 6.00), w);

var savedBasis = A.config.fleetFeeBasis;
A.config.fleetFeeBasis = "PER_INVOICE";
w = A.weeklyInvoice({
  fleetAccountType: "FLEET_PRO",
  drivers: [{ id: "D1", wasPaid: true }, { id: "D2", wasPaid: true }, { id: "D3", wasPaid: true }]
});
ok("flat basis: 3 paid drivers, one invoice, one £5 fee", w.lines.length === 1 && approx(w.feeExVatGbp, 5.00), w);
ok("flat basis is flagged on the invoice", w.flags.indexOf("FLAT_FEE_BASIS") !== -1);
var flat5 = fleetMonth("FLEET_PRO", 5);
ok("flat basis: Pro 5 drivers = £50 + £21.65 = £71.65", approx(flat5.totalExVatGbp, 71.65), flat5);
var flatLite3 = fleetMonth("FLEET_LITE", 3);
ok("flat basis: Lite 3 drivers = £43.26 (not the live basis — per driver is locked)",
  approx(flatLite3.totalExVatGbp, 43.26), flatLite3);
A.config.fleetFeeBasis = savedBasis;
ok("basis restored to PER_DRIVER_LINE", A.config.fleetFeeBasis === "PER_DRIVER_LINE");

// ---------------------------------------------------------------------------
console.log("\n9. THE CROWN — Pro identity on any account type");
// ---------------------------------------------------------------------------
var C = require("./pro-crown.js");

ok("Fleet Pro wears the crown", A.identity("FLEET_PRO").crown === true);
ok("PLNA Pro wears the crown", A.identity("PLNA_PRO").crown === true);
ok("Fleet Lite does not", A.identity("FLEET_LITE").crown === false);
ok("PLNA Lite does not", A.identity("PLNA_LITE").crown === false);
ok("PLNA Plus does not — Plus is not Pro", A.identity("PLNA_PLUS").crown === false);
ok("exactly the two Pro tiers are crowned today",
  A.crownedTiers().sort().join(",") === "FLEET_PRO,PLNA_PRO", A.crownedTiers());

// Identity is not pricing: PLNA Pro's figures are still UNSET.
ok("an UNSET Pro tier still earns the crown",
  A.config.accountTypes.PLNA_PRO.status === "UNSET" && A.identity("PLNA_PRO").crown === true);
ok("but an UNSET Pro tier still refuses to be quoted",
  threw(function () { A.monthlyBill({ accountType: "PLNA_PRO", drivers: [] }); }));

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
ok("test type removed again", A.crownedTiers().length === 2);

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

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
