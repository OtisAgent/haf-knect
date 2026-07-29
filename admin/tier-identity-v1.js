/* ============================================================================
 * HAF — TIER IDENTITY  (TIER-IDENTITY-V1)
 *
 * The symbol a MEMBER wears beside their name. Two marks, one ladder:
 *   PLUS -> the Plus mark      PRO -> the crown      everyone else -> nothing.
 *
 * Brent, 2026-07-29: "we want a plus sign for the people who are PLUS tier
 * members across the account types and CROWN's for people on the PRO versions."
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM tier-marks-v1.js
 *   tier-marks answers "what am I NOT getting?" — it marks a locked FEATURE on
 *   a pricing card. This file answers "who is this?" — it marks a PERSON or an
 *   ACCOUNT. Same two symbols, opposite meanings: on a feature row the mark
 *   means "you don't have this", beside a name it means "they do".
 *   Keeping them apart is what stops one being changed and silently breaking
 *   the other. The ARTWORK is still drawn in exactly one place each — the crown
 *   in pro-crown.js, the Plus mark in tier-marks-v1.js — and borrowed here.
 *
 * THE RULES THIS FILE ENFORCES
 *  - Earned by LEVEL, never by tier name. Any account type whose level is PLUS
 *    or PRO is marked automatically — driver, fleet, freight, business, and any
 *    type that does not exist yet. Nothing gets wired up a second time.
 *  - One mark or none. Nobody ever wears both; a Pro is never also plussed.
 *  - The free tier has no mark of its own. Being on Lite is the absence of one.
 *  - Unknown, missing or misspelt levels render NOTHING. On a live dashboard a
 *    wrong symbol beside a customer's name is worse than no symbol, so this
 *    fails silent rather than guessing.
 *  - Identity is not pricing. A Pro tier whose price is still undecided still
 *    wears the crown — you can wear it before we can quote it.
 *  - Drawn artwork, never emojis, so it looks the same on every phone.
 *
 * Works in browser + Node. Depends on pro-crown.js and tier-marks-v1.js.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./pro-crown.js"), require("./tier-marks-v1.js"));
  } else {
    root.HAFTierIdentity = factory(root.HAFProCrown, root.HAFTierMarks);
  }
})(typeof self !== "undefined" ? self : this, function (Crown, Marks) {
  "use strict";

  if (!Crown || typeof Crown.svg !== "function") {
    throw new Error("pro-crown.js must be loaded before tier-identity-v1.js");
  }
  if (!Marks || typeof Marks.plusSvg !== "function") {
    throw new Error("tier-marks-v1.js must be loaded before tier-identity-v1.js");
  }

  /* --------------------------------------------------------------------------
   * WHAT COUNTS AS A LEVEL
   * The business writes the entry level three different ways depending on which
   * screen you are on — LITE on the fleet cards, FREE on the driver exchange,
   * BASIC in one older record. All three mean the same thing: no mark. They are
   * listed here so an entry-level account can never fall through to "unknown"
   * and get treated as a special case.
   * ------------------------------------------------------------------------ */
  var ENTRY = ["LITE", "FREE", "BASIC", "STANDARD"];

  var IDENTITIES = {
    PLUS: {
      level: "PLUS",
      label: "Plus",
      title: "Plus member",
      art: function (o) { return Marks.plusSvg(o); },
      // The Plus mark takes the colour of whatever it sits beside, so it works
      // on a green chip, a white row or a dark header without a second copy.
      // Only the crown is allowed its own colour — that is what keeps the crown
      // the status symbol and stops Plus competing with it.
      className: "haf-id--plus"
    },
    PRO: {
      level: "PRO",
      label: "Pro",
      title: "Pro member",
      art: function (o) { return Crown.svg(o); },
      className: "haf-id--pro"
    }
  };

  /* --------------------------------------------------------------------------
   * THE GATE — the only function allowed to decide who wears what.
   * Accepts a level string ("PLUS"), an account object ({level:"PRO"}), or an
   * account-fees tier object. Anything else -> null -> renders nothing.
   * ------------------------------------------------------------------------ */
  function levelOf(account) {
    if (!account) return null;
    var raw = typeof account === "string" ? account : (account.level || account.tierLevel);
    if (!raw) return null;
    return String(raw).trim().toUpperCase();
  }

  function identityFor(account) {
    var lvl = levelOf(account);
    if (!lvl) return null;
    if (ENTRY.indexOf(lvl) !== -1) return null;   // entry level: no mark, on purpose
    return IDENTITIES[lvl] || null;               // unknown level: nothing, on purpose
  }

  function isMarked(account) {
    return identityFor(account) !== null;
  }

  /* --------------------------------------------------------------------------
   * THE BADGE
   *   withLabel: true  -> mark + "PLUS" / "PRO"   (profile headers, wide rows)
   *   withLabel: false -> mark only               (lists, tables, tight chips)
   * A screen reader always hears "Plus member" / "Pro member", never nothing.
   * ------------------------------------------------------------------------ */
  function badge(account, opts) {
    var id = identityFor(account);
    if (!id) return "";
    opts = opts || {};
    var withLabel = opts.withLabel === true;      // mark-only is the default:
                                                  // most surfaces already name
                                                  // the tier in their own text.
    var title = opts.title || id.title;
    var size = opts.size || 14;
    var art = id.art({ size: size }).replace(/haf-(crown|mark)__(mark|art)/, "haf-id__art");
    return (
      '<span class="haf-id ' + id.className + (withLabel ? "" : " haf-id--mark-only") + '" ' +
      'role="img" aria-label="' + title + '" title="' + title + '">' +
      art +
      (withLabel ? '<span class="haf-id__label">' + id.label + "</span>" : "") +
      "</span>"
    );
  }

  // Every surface calls THIS. It is what makes "a Lite account can never show a
  // mark" true in code rather than true in a code review.
  function forAccount(account, opts) {
    return badge(account, opts);
  }

  /* --------------------------------------------------------------------------
   * THE STYLES — one small block, no framework, safe to inline anywhere.
   * ------------------------------------------------------------------------ */
  var css = [
    ".haf-id{display:inline-flex;align-items:center;gap:.32em;flex:0 0 auto;",
    "vertical-align:baseline;line-height:1;white-space:nowrap}",
    ".haf-id__art{display:block;flex:0 0 auto;margin-top:-.06em}",
    ".haf-id__label{font-size:.7em;font-weight:800;letter-spacing:.07em;",
    "text-transform:uppercase}",
    ".haf-id--mark-only{gap:0}",
    /* Plus inherits the colour of the text it sits beside — deliberate. */
    ".haf-id--plus{color:inherit;opacity:.9}",
    /* The crown is the only mark with a colour of its own. */
    ".haf-id--pro{color:var(--haf-crown,#f18e00);opacity:1}",
    "@media (prefers-color-scheme:dark){.haf-id--pro{--haf-crown:#ffb347}}"
  ].join("");

  function inject(doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc || doc.getElementById("haf-tier-identity-css")) return false;
    var el = doc.createElement("style");
    el.id = "haf-tier-identity-css";
    el.textContent = css;
    doc.head.appendChild(el);
    return true;
  }

  /* --------------------------------------------------------------------------
   * THE PAINTER — walks a page and marks every element carrying data-haf-tier.
   * Re-runnable: rows that are re-rendered get marked again, and a row that is
   * already marked is never marked twice.
   * ------------------------------------------------------------------------ */
  function paint(rootEl) {
    if (typeof document === "undefined") return 0;
    var scope = rootEl || document;
    inject(document);
    var n = 0;
    var nodes = scope.querySelectorAll("[data-haf-tier]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.dataset.hafMarked === "1") continue;
      var html = forAccount({ level: el.dataset.hafTier }, {
        withLabel: el.dataset.hafTierLabel === "1",
        size: parseInt(el.dataset.hafTierSize, 10) || 13
      });
      el.dataset.hafMarked = "1";                 // set even when empty, so an
                                                  // entry-level row is not
                                                  // re-tested on every repaint
      if (!html) continue;
      el.insertAdjacentHTML("afterbegin", html + " ");
      n++;
    }
    return n;
  }

  return {
    version: "TIER-IDENTITY-V1",
    ENTRY: ENTRY,
    levelOf: levelOf,
    identityFor: identityFor,
    isMarked: isMarked,
    badge: badge,
    forAccount: forAccount,
    paint: paint,
    css: css,
    inject: inject
  };
});
