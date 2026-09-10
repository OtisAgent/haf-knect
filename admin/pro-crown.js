
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HAFProCrown = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LABEL = "Pro";

  var COLOUR = "#f18e00";

  function svg(opts) {
    opts = opts || {};
    var size = opts.size || 16;
    return (
      '<svg class="haf-crown__mark" width="' + size + '" height="' + size + '" ' +
      'viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.1" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false">' +

      '<path d="M3.4 8.2 L7.4 11.6 L12 5.4 L16.6 11.6 L20.6 8.2 L19.1 16.1 H4.9 Z"/>' +
      '<circle cx="3.4" cy="7.4" r="1.5" stroke="none"/>' +
      '<circle cx="12" cy="4.3" r="1.6" stroke="none"/>' +
      '<circle cx="20.6" cy="7.4" r="1.5" stroke="none"/>' +

      '<rect x="4.4" y="17.8" width="15.2" height="2.6" rx="1.2" stroke="none"/>' +
      "</svg>"
    );
  }

  function badge(opts) {
    opts = opts || {};
    var withLabel = opts.withLabel !== false;
    var title = opts.title || (LABEL + " account");
    return (
      '<span class="haf-crown' + (withLabel ? "" : " haf-crown--mark-only") + '" ' +
      'role="img" aria-label="' + title + '" title="' + title + '">' +
      svg({ size: opts.size }) +
      (withLabel ? '<span class="haf-crown__label">' + LABEL + "</span>" : "") +
      "</span>"
    );
  }

  function levelOf(account) {
    if (!account) return null;
    if (typeof account === "string") return account.toUpperCase();
    if (account.level) return String(account.level).toUpperCase();
    return null;
  }

  function isPro(account) {
    return levelOf(account) === "PRO";
  }

  function forAccount(account, opts) {
    return isPro(account) ? badge(opts) : "";
  }

  var css = [
    ".haf-crown{display:inline-flex;align-items:center;gap:.34em;",
    "color:var(--haf-crown,#f18e00);vertical-align:baseline;line-height:1;",
    "white-space:nowrap}",
    ".haf-crown__mark{flex:0 0 auto;display:block;margin-top:-.08em}",
    ".haf-crown__label{font-size:.72em;font-weight:700;letter-spacing:.06em;",
    "text-transform:uppercase}",
    ".haf-crown--mark-only{gap:0}",

    ".haf-crown--plaque{padding:.28em .6em;border-radius:999px;",
    "border:1px solid color-mix(in srgb,var(--haf-crown,#f18e00) 45%,transparent);",
    "background:color-mix(in srgb,var(--haf-crown,#f18e00) 12%,transparent)}",

    "@media (prefers-color-scheme:dark){.haf-crown{--haf-crown:var(--haf-orange)}}"
  ].join("");

  function inject(doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc || doc.getElementById("haf-crown-css")) return false;
    var el = doc.createElement("style");
    el.id = "haf-crown-css";
    el.textContent = css;
    doc.head.appendChild(el);
    return true;
  }

  return {
    version: "PRO-CROWN-V1",
    LABEL: LABEL,
    COLOUR: COLOUR,
    svg: svg,
    badge: badge,
    isPro: isPro,
    levelOf: levelOf,
    forAccount: forAccount,
    css: css,
    inject: inject
  };
});
