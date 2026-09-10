
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

  var ENTRY = ["LITE", "FREE", "BASIC", "STANDARD"];

  var IDENTITIES = {
    PLUS: {
      level: "PLUS",
      label: "Plus",
      title: "Plus member",
      art: function (o) { return Marks.plusSvg(o); },

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

  function levelOf(account) {
    if (!account) return null;
    var raw = typeof account === "string" ? account : (account.level || account.tierLevel);
    if (!raw) return null;
    return String(raw).trim().toUpperCase();
  }

  function identityFor(account) {
    var lvl = levelOf(account);
    if (!lvl) return null;
    if (ENTRY.indexOf(lvl) !== -1) return null;
    return IDENTITIES[lvl] || null;
  }

  function isMarked(account) {
    return identityFor(account) !== null;
  }

  function badge(account, opts) {
    var id = identityFor(account);
    if (!id) return "";
    opts = opts || {};
    var withLabel = opts.withLabel === true;

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

  function forAccount(account, opts) {
    return badge(account, opts);
  }

  var css = [
    ".haf-id{display:inline-flex;align-items:center;gap:.32em;flex:0 0 auto;",
    "vertical-align:baseline;line-height:1;white-space:nowrap}",
    ".haf-id__art{display:block;flex:0 0 auto;margin-top:-.06em}",
    ".haf-id__label{font-size:.7em;font-weight:800;letter-spacing:.07em;",
    "text-transform:uppercase}",
    ".haf-id--mark-only{gap:0}",

    ".haf-id--plus{color:inherit;opacity:.9}",

    ".haf-id--pro{color:var(--haf-crown,#f18e00);opacity:1}",
    "@media (prefers-color-scheme:dark){.haf-id--pro{--haf-crown:var(--haf-orange)}}"
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
      el.dataset.hafMarked = "1";

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
