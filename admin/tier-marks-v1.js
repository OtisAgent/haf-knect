/* ============================================================================
 * HAF — TIER MARKS  (TIER-MARKS-V1)
 *
 * Two symbols, one ladder. They answer a single question for the customer:
 * "what am I not getting, and what would I have to be on to get it?"
 *
 * Brent, 2026-07-29: "can you put crowns on the missing features per account
 * tier so a PLUS symbol for the PLUS features that are missing on the LITE
 * version and the CROWN symbol thats missing the features."
 *
 * THE RULES THIS FILE ENFORCES
 *  - A mark is only ever shown against a feature the account does NOT have.
 *    A feature you already have carries a tick, never a mark. That is what
 *    keeps the mark meaning "upgrade", never "included".
 *  - The mark shown is the mark of the tier that UNLOCKS it — Plus mark for a
 *    Plus feature, crown for a Pro feature — so the symbol is the instruction.
 *  - Nothing on the free tier ever carries a mark for itself. Lite has no mark
 *    of its own; being on Lite is the absence of marks.
 *  - Drawn symbols, never emojis. The crown artwork is pro-crown.js, drawn
 *    once and reused here so one crown exists in the whole business.
 *  - The visual ladder is deliberate: Plus is an OUTLINE mark, Pro is a SOLID
 *    crown. Weight increases with tier, so the ladder reads before it is read.
 *
 * Works in browser + Node. Depends on pro-crown.js only for the crown itself.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./pro-crown.js"));
  } else {
    root.HAFTierMarks = factory(root.HAFProCrown);
  }
})(typeof self !== "undefined" ? self : this, function (Crown) {
  "use strict";

  // The ladder, lowest first. Rank is the only thing that decides "has it".
  var LEVELS = ["LITE", "PLUS", "PRO"];

  function rank(level) {
    var i = LEVELS.indexOf(String(level || "").toUpperCase());
    return i < 0 ? -1 : i;
  }

  /* --------------------------------------------------------------------------
   * THE PLUS MARK — 24x24, outline, same optical weight as the crown's band.
   * A plus inside a rounded square: reads as "more", reads at 12px, and cannot
   * be mistaken for a tick (which is what marks a feature you already have).
   * ------------------------------------------------------------------------ */
  function plusSvg(opts) {
    opts = opts || {};
    var size = opts.size || 16;
    return (
      '<svg class="haf-mark__art" width="' + size + '" height="' + size + '" ' +
      'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.4"/>' +
      '<path d="M12 8.1 V15.9 M8.1 12 H15.9"/>' +
      "</svg>"
    );
  }

  // The crown comes from the one place it is drawn. If pro-crown.js is missing
  // we fail loudly rather than quietly shipping a Pro row with no symbol.
  function crownSvg(opts) {
    if (!Crown || typeof Crown.svg !== "function") {
      throw new Error("pro-crown.js must be loaded before tier-marks-v1.js");
    }
    return Crown.svg(opts).replace("haf-crown__mark", "haf-mark__art");
  }

  /* --------------------------------------------------------------------------
   * THE MARKS TABLE — the only place a level is tied to a symbol.
   * ------------------------------------------------------------------------ */
  var MARKS = {
    LITE: null, // deliberate: the entry level has no mark of its own
    PLUS: {
      level: "PLUS",
      label: "Plus",
      // What a screen reader says, and what the tooltip says, on a locked row.
      lockedTitle: "Plus feature — not included on your tier",
      art: plusSvg,
      solid: false
    },
    PRO: {
      level: "PRO",
      label: "Pro",
      lockedTitle: "Pro feature — not included on your tier",
      art: crownSvg,
      solid: true
    }
  };

  function markFor(level) {
    return MARKS[String(level || "").toUpperCase()] || null;
  }

  /* --------------------------------------------------------------------------
   * THE TICK — what a feature you already have carries instead.
   * ------------------------------------------------------------------------ */
  function tickSvg(opts) {
    opts = opts || {};
    var size = opts.size || 16;
    return (
      '<svg class="haf-mark__art" width="' + size + '" height="' + size + '" ' +
      'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<path d="M4.5 12.6 L9.6 17.6 L19.5 6.8"/>' +
      "</svg>"
    );
  }

  /* --------------------------------------------------------------------------
   * THE SOON MARK — for a feature that is not built yet.
   * It is neither a tick nor an upgrade mark, because it is neither: paying more
   * does not get it. A clock, so "later" reads before the word does.
   * ------------------------------------------------------------------------ */
  function soonSvg(opts) {
    opts = opts || {};
    var size = opts.size || 16;
    return (
      '<svg class="haf-mark__art" width="' + size + '" height="' + size + '" ' +
      'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4 V12 L15.2 14"/>' +
      "</svg>"
    );
  }

  /* --------------------------------------------------------------------------
   * THE GATE — the only function allowed to decide what a row shows.
   *
   * Give it the feature's unlock level and the account's level; it returns the
   * complete row state. Every surface calls THIS, which is what makes "an
   * included feature can never show an upgrade mark" true in code rather than
   * in a code review.
   * ------------------------------------------------------------------------ */
  function rowState(unlocksAt, accountLevel, opts) {
    opts = opts || {};
    var need = rank(unlocksAt);
    var have = rank(accountLevel);
    if (need < 0) throw new Error("Unknown unlock level: " + unlocksAt);
    if (have < 0) throw new Error("Unknown account level: " + accountLevel);

    // Not built yet beats everything. A coming-soon feature shows the clock on
    // EVERY tier — never a tick (it isn't included) and never an upgrade mark
    // (paying more will not get it). This is the brief's rule that nothing
    // unavailable may be presented as live, enforced in the one place that draws.
    if (opts.comingSoon) {
      return {
        included: false,
        comingSoon: true,
        unlocksAt: String(unlocksAt).toUpperCase(),
        unlockLabel: null,
        title: "Coming soon — not available on any tier yet",
        html: '<span class="haf-mark haf-mark--soon" role="img" ' +
              'aria-label="Coming soon — not available on any tier yet" ' +
              'title="Coming soon — not available on any tier yet">' +
              soonSvg(opts) + '<span class="haf-mark__label">Soon</span></span>'
      };
    }

    var included = have >= need;
    var mark = included ? null : markFor(unlocksAt);

    return {
      included: included,
      unlocksAt: String(unlocksAt).toUpperCase(),
      // "Plus" / "Pro" — the one word that goes next to the symbol.
      unlockLabel: mark ? mark.label : null,
      title: included
        ? "Included on your tier"
        : (mark ? mark.lockedTitle : "Not included"),
      html: included
        ? '<span class="haf-mark haf-mark--have" role="img" aria-label="Included">' +
          tickSvg(opts) + "</span>"
        : '<span class="haf-mark haf-mark--' + String(unlocksAt).toLowerCase() +
          '" role="img" aria-label="' + mark.lockedTitle + '" title="' +
          mark.lockedTitle + '">' + mark.art(opts) +
          '<span class="haf-mark__label">' + mark.label + "</span></span>"
    };
  }

  /* --------------------------------------------------------------------------
   * A WHOLE LIST — features in, rendered rows out.
   *
   * Feature shape: { text, group:"PLATFORM"|"AI", unlocksAt, comingSoon? }
   * A comingSoon feature is never presented as included, whatever tier the
   * customer is on — the brief's rule that nothing unavailable may appear live.
   * ------------------------------------------------------------------------ */
  function renderList(features, accountLevel, opts) {
    var base = opts || {};
    return (features || []).map(function (f) {
      var state = rowState(f.unlocksAt, accountLevel, {
        size: base.size, comingSoon: !!f.comingSoon
      });
      return {
        text: f.text,
        group: f.group || "PLATFORM",
        comingSoon: !!f.comingSoon,
        state: state
      };
    });
  }

  // The upgrade summary a card footer can show: "3 more on Plus, 6 more on Pro".
  function lockedSummary(features, accountLevel) {
    var counts = { PLUS: 0, PRO: 0 };
    renderList(features, accountLevel).forEach(function (r) {
      if (!r.state.included && !r.comingSoon && counts[r.state.unlocksAt] !== undefined) {
        counts[r.state.unlocksAt]++;
      }
    });
    return counts;
  }

  /* --------------------------------------------------------------------------
   * THE STYLES — one block, no framework, safe to inline anywhere.
   * ------------------------------------------------------------------------ */
  var css = [
    ".haf-mark{display:inline-flex;align-items:center;gap:.3em;flex:0 0 auto;",
    "line-height:1;white-space:nowrap}",
    ".haf-mark__art{display:block;flex:0 0 auto}",
    ".haf-mark__label{font-size:.66em;font-weight:800;letter-spacing:.07em;",
    "text-transform:uppercase}",
    ".haf-mark--have{color:var(--haf-have,#2f9e5f)}",
    ".haf-mark--plus{color:var(--haf-plus,#2f373e);opacity:.85}",
    ".haf-mark--pro{color:var(--haf-crown,#f18e00)}",
    ".haf-mark--soon{color:var(--haf-locked,#7a838b)}",
    /* The row itself: locked rows are quieter, never struck through. */
    ".haf-feat{display:flex;align-items:flex-start;gap:.6em;padding:.34em 0}",
    /* Fixed mark column so ticks, Plus marks and crowns all leave the feature
       text starting on the same line — a ragged left edge reads as a mistake. */
    ".haf-feat .haf-mark{margin-top:.12em;min-width:3.2em}",
    ".haf-feat--locked{color:var(--haf-locked,#7a838b)}",
    /* No " — coming soon" suffix: the clock and its label already say it, and
       saying it twice on one row reads as a mistake. */
    "@media (prefers-color-scheme:dark){.haf-mark--plus{color:#cfd5da;opacity:1}",
    ".haf-mark--pro{--haf-crown:#ffb347}.haf-feat--locked{--haf-locked:#98a1a8}}"
  ].join("");

  function inject(doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc || doc.getElementById("haf-tier-marks-css")) return false;
    var el = doc.createElement("style");
    el.id = "haf-tier-marks-css";
    el.textContent = css;
    doc.head.appendChild(el);
    return true;
  }

  return {
    version: "TIER-MARKS-V1",
    LEVELS: LEVELS,
    rank: rank,
    markFor: markFor,
    plusSvg: plusSvg,
    soonSvg: soonSvg,
    crownSvg: crownSvg,
    tickSvg: tickSvg,
    rowState: rowState,
    renderList: renderList,
    lockedSummary: lockedSummary,
    css: css,
    inject: inject
  };
});
