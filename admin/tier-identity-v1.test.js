/* Tier Identity V1 — regression tests. Run: node tier-identity-v1.test.js
 *
 * What these prove: a Plus member always wears the Plus mark, a Pro member
 * always wears the crown, nobody else wears anything, and nobody ever wears
 * both — on every account type, including ones that do not exist yet.
 */
"use strict";
var ID = require("./tier-identity-v1.js");
var Crown = require("./pro-crown.js");
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? " — " + JSON.stringify(extra) : "")); }
}
// A badge is "a plus mark" only if it carries the plus artwork and the plus class.
function isPlus(html) { return /haf-id--plus/.test(html) && /M12 8\.1 V15\.9/.test(html); }
function isCrown(html) { return /haf-id--pro/.test(html) && /L12 5\.4 L16\.6/.test(html); }

console.log("Tier Identity (" + ID.version + ")\n");

// ---------------------------------------------------------------------------
console.log("1. THE TWO SYMBOLS");
// ---------------------------------------------------------------------------
var plus = ID.forAccount({ level: "PLUS" });
var pro = ID.forAccount({ level: "PRO" });
ok("a Plus member gets the Plus mark", isPlus(plus), plus);
ok("a Pro member gets the crown", isCrown(pro), pro);
ok("a Plus member never gets a crown", !isCrown(plus));
ok("a Pro member never gets a Plus mark", !isPlus(pro));
ok("nobody wears two marks at once", (plus.match(/<svg/g) || []).length === 1 && (pro.match(/<svg/g) || []).length === 1);

// ---------------------------------------------------------------------------
console.log("\n2. WHO GETS NOTHING — and it is nothing, not a blank box");
// ---------------------------------------------------------------------------
["LITE", "FREE", "BASIC", "STANDARD"].forEach(function (lvl) {
  ok(lvl + " renders nothing at all", ID.forAccount({ level: lvl }) === "");
});
ok("no account at all renders nothing", ID.forAccount(null) === "" && ID.forAccount(undefined) === "");
ok("an account with no level renders nothing", ID.forAccount({ name: "James Wilson" }) === "");
ok("a misspelt level renders nothing rather than guessing", ID.forAccount({ level: "PLUSS" }) === "");
ok("an unknown level renders nothing rather than guessing", ID.forAccount({ level: "PLATINUM" }) === "");
ok("an empty string renders nothing", ID.forAccount({ level: "" }) === "" && ID.forAccount("") === "");

// ---------------------------------------------------------------------------
console.log("\n3. ACROSS THE ACCOUNT TYPES — driver, fleet, freight, business");
// ---------------------------------------------------------------------------
var TYPES = [
  { type: "PLNA driver", lite: "FREE", plus: "PLUS", pro: "PRO" },
  { type: "Fleet", lite: "LITE", plus: "PLUS", pro: "PRO" },
  { type: "Freight forwarder", lite: "FREE", plus: "PLUS", pro: "PRO" },
  { type: "Business", lite: "LITE", plus: "PLUS", pro: "PRO" }
];
TYPES.forEach(function (t) {
  ok(t.type + ": entry level wears nothing", ID.forAccount({ level: t.lite }) === "");
  ok(t.type + ": Plus wears the Plus mark", isPlus(ID.forAccount({ level: t.plus })));
  ok(t.type + ": Pro wears the crown", isCrown(ID.forAccount({ level: t.pro })));
});
ok("an account type invented tomorrow is marked with no new wiring",
  isCrown(ID.forAccount({ code: "COURIER_PRO", name: "Courier Pro", level: "PRO" })) &&
  isPlus(ID.forAccount({ code: "COURIER_PLUS", name: "Courier Plus", level: "PLUS" })));

// ---------------------------------------------------------------------------
console.log("\n4. IDENTITY IS NOT PRICING");
// ---------------------------------------------------------------------------
ok("a Pro tier with no price on file still wears the crown",
  isCrown(ID.forAccount({ level: "PRO", monthlyGbp: null })));
ok("a Plus tier with no price on file still wears the Plus mark",
  isPlus(ID.forAccount({ level: "PLUS", monthlyGbp: null })));
ok("paying nothing this month does not remove the mark",
  isCrown(ID.forAccount({ level: "PRO", paidBlocks: 0 })));

// ---------------------------------------------------------------------------
console.log("\n5. HOW IT READS — labels, sizes, screen readers");
// ---------------------------------------------------------------------------
ok("mark-only is the default (most rows already name the tier)", !/haf-id__label/.test(pro));
ok("the labelled form says PRO", /haf-id__label">Pro</.test(ID.forAccount({ level: "PRO" }, { withLabel: true })));
ok("the labelled form says PLUS", /haf-id__label">Plus</.test(ID.forAccount({ level: "PLUS" }, { withLabel: true })));
ok("a screen reader hears Pro member", /aria-label="Pro member"/.test(pro));
ok("a screen reader hears Plus member", /aria-label="Plus member"/.test(plus));
ok("size is honoured for tight rows", /width="11"/.test(ID.forAccount({ level: "PRO" }, { size: 11 })));
ok("both marks default to the same size so a list does not look ragged",
  /width="14"/.test(plus) && /width="14"/.test(pro));

// ---------------------------------------------------------------------------
console.log("\n6. DRAWN, NOT TYPED — no emojis, ever");
// ---------------------------------------------------------------------------
ok("no crown emoji anywhere", pro.indexOf("👑") === -1 && plus.indexOf("👑") === -1);
ok("no star, plus-sign or asterisk character standing in for artwork",
  !/[★☆✚✛✜＋]/.test(plus + pro));
ok("both marks are real SVG artwork", /<svg/.test(plus) && /<svg/.test(pro));
ok("the crown artwork is the SAME one drawn in pro-crown.js (one crown exists)",
  Crown.svg({ size: 14 }).indexOf('d="M3.4 8.2 L7.4 11.6 L12 5.4 L16.6 11.6 L20.6 8.2 L19.1 16.1 H4.9 Z"') !== -1 &&
  pro.indexOf('d="M3.4 8.2 L7.4 11.6 L12 5.4 L16.6 11.6 L20.6 8.2 L19.1 16.1 H4.9 Z"') !== -1);

// ---------------------------------------------------------------------------
console.log("\n7. THE CROWN STAYS SPECIAL");
// ---------------------------------------------------------------------------
ok("only the crown carries the brand colour", /haf-id--pro\{color:var\(--haf-crown/.test(ID.css));
ok("the Plus mark takes the colour of the text beside it", /haf-id--plus\{color:inherit/.test(ID.css));
ok("the crown lifts to gold on dark screens", /haf-crown:#ffb347/.test(ID.css));

// ---------------------------------------------------------------------------
console.log("\n8. THE GATE ITSELF");
// ---------------------------------------------------------------------------
ok("a plain string level works", isCrown(ID.forAccount("PRO")) && isPlus(ID.forAccount("plus")));
ok("lower case and stray spaces still match", isPlus(ID.forAccount(" plus ")));
ok("isMarked agrees with what is rendered",
  ID.isMarked("PRO") === true && ID.isMarked("PLUS") === true &&
  ID.isMarked("LITE") === false && ID.isMarked(null) === false);
ok("identityFor names the level it matched", ID.identityFor("PRO").level === "PRO");
ok("the entry-level list is the single place free tiers are named", ID.ENTRY.indexOf("LITE") !== -1 && ID.ENTRY.indexOf("FREE") !== -1);

// ---------------------------------------------------------------------------
console.log("\n9. NOT THE SAME THING AS THE FEATURE MARKS");
// ---------------------------------------------------------------------------
var Marks = require("./tier-marks-v1.js");
ok("a locked FEATURE still says 'not included on your tier'",
  Marks.markFor("PLUS").lockedTitle.indexOf("not included") !== -1);
ok("a MEMBER's mark never says 'not included' — it means they have it",
  plus.indexOf("not included") === -1 && pro.indexOf("not included") === -1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
