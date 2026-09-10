
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./pro-crown.js"));
  } else {
    root.HAFTierMarks = factory(root.HAFProCrown);
  }
})(typeof self !== "undefined" ? self : this, function (Crown) {
  "use strict";

  var LEVELS = ["LITE", "PLUS", "PRO"];

  function rank(level) {
    var i = LEVELS.indexOf(String(level || "").toUpperCase());
    return i < 0 ? -1 : i;
  }

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

  function crownSvg(opts) {
    if (!Crown || typeof Crown.svg !== "function") {
      throw new Error("pro-crown.js must be loaded before tier-marks-v1.js");
    }
    return Crown.svg(opts).replace("haf-crown__mark", "haf-mark__art");
  }

  var MARKS = {
    LITE: null,
    PLUS: {
      level: "PLUS",
      label: "Plus",

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

  function rowState(unlocksAt, accountLevel, opts) {
    opts = opts || {};
    var need = rank(unlocksAt);
    var have = rank(accountLevel);
    if (need < 0) throw new Error("Unknown unlock level: " + unlocksAt);
    if (have < 0) throw new Error("Unknown account level: " + accountLevel);

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

  function lockedSummary(features, accountLevel) {
    var counts = { PLUS: 0, PRO: 0 };
    renderList(features, accountLevel).forEach(function (r) {
      if (!r.state.included && !r.comingSoon && counts[r.state.unlocksAt] !== undefined) {
        counts[r.state.unlocksAt]++;
      }
    });
    return counts;
  }

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

    ".haf-feat{display:flex;align-items:flex-start;gap:.6em;padding:.34em 0}",

    ".haf-feat .haf-mark{margin-top:.12em;min-width:3.2em}",
    ".haf-feat--locked{color:var(--haf-locked,#7a838b)}",

    "@media (prefers-color-scheme:dark){.haf-mark--plus{color:#cfd5da;opacity:1}",
    ".haf-mark--pro{--haf-crown:var(--haf-orange)}.haf-feat--locked{--haf-locked:#98a1a8}}"
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
