/* ============================================================================
 * HAF — PRO CROWN  (PRO-CROWN-V1)
 *
 * One crown, drawn once, used everywhere. It marks a PRO account — on any
 * account type — beside the account's name.
 *
 * Brent, 2026-07-29: "there should be a crown identity symbol for people using
 * the PRO versions on any account type."
 *
 * THE RULES THIS FILE ENFORCES
 *  - The crown means PRO and nothing else. It is never decoration, never a
 *    badge for anything else, never sold separately.
 *  - It is earned by LEVEL, not by name. Any account type whose level is "PRO"
 *    gets it automatically — including types that do not exist yet. Nothing has
 *    to be wired up again when Business or Freight Pro land.
 *  - It is a DRAWN symbol, not an emoji (👑 is banned — it renders differently
 *    on every phone and looks nothing like the brand).
 *  - Identity is not pricing. A Pro tier whose price is still undecided still
 *    earns the crown — you can wear it before we can quote it.
 *
 * Works in browser + Node. No dependencies.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HAFProCrown = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // The one word a customer ever sees next to it.
  var LABEL = "Pro";

  // Brand accent (HAF-BRAND-TOKENS.css --brand-orange). Overridable per surface
  // with the CSS variable --haf-crown, so a dark header can go gold without a
  // second copy of the artwork existing anywhere.
  var COLOUR = "#f18e00";

  /* --------------------------------------------------------------------------
   * THE ARTWORK — 24x24, stroked, inherits colour from its container.
   * Drawn to stay legible at 12px beside body text.
   * ------------------------------------------------------------------------ */
  function svg(opts) {
    opts = opts || {};
    var size = opts.size || 16;
    return (
      '<svg class="haf-crown__mark" width="' + size + '" height="' + size + '" ' +
      'viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.1" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      // The band of the crown, with its three jewelled points.
      '<path d="M3.4 8.2 L7.4 11.6 L12 5.4 L16.6 11.6 L20.6 8.2 L19.1 16.1 H4.9 Z"/>' +
      '<circle cx="3.4" cy="7.4" r="1.5" stroke="none"/>' +
      '<circle cx="12" cy="4.3" r="1.6" stroke="none"/>' +
      '<circle cx="20.6" cy="7.4" r="1.5" stroke="none"/>' +
      // The base — solid, so the shape still reads as a crown at 12px.
      '<rect x="4.4" y="17.8" width="15.2" height="2.6" rx="1.2" stroke="none"/>' +
      "</svg>"
    );
  }

  /* --------------------------------------------------------------------------
   * THE BADGE — what actually sits beside a name.
   *   withLabel: true  -> crown + "Pro"  (tier cards, profile headers)
   *   withLabel: false -> crown only     (lists, tables, chat, tight rows)
   * A screen-reader always hears "Pro account", never nothing.
   * ------------------------------------------------------------------------ */
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

  /* --------------------------------------------------------------------------
   * THE GATE — the only function allowed to decide who wears it.
   * Pass the account's level ("LITE" | "PLUS" | "PRO"), or an account-fees tier
   * object, or the tier code plus a lookup. Anything that is not PRO gets null,
   * and null renders nothing at all.
   * ------------------------------------------------------------------------ */
  function levelOf(account) {
    if (!account) return null;
    if (typeof account === "string") return account.toUpperCase();
    if (account.level) return String(account.level).toUpperCase();
    return null;
  }

  function isPro(account) {
    return levelOf(account) === "PRO";
  }

  // Returns the badge HTML for a Pro account, or "" for anyone else.
  // Every surface should call THIS, never badge() directly — that is what makes
  // "a non-Pro can never show a crown" true in code and not just in a review.
  function forAccount(account, opts) {
    return isPro(account) ? badge(opts) : "";
  }

  /* --------------------------------------------------------------------------
   * THE STYLES — one small block, no framework, safe to inline anywhere.
   * ------------------------------------------------------------------------ */
  var css = [
    ".haf-crown{display:inline-flex;align-items:center;gap:.34em;",
    "color:var(--haf-crown,#f18e00);vertical-align:baseline;line-height:1;",
    "white-space:nowrap}",
    ".haf-crown__mark{flex:0 0 auto;display:block;margin-top:-.08em}",
    ".haf-crown__label{font-size:.72em;font-weight:700;letter-spacing:.06em;",
    "text-transform:uppercase}",
    ".haf-crown--mark-only{gap:0}",
    /* Optional plaque form for tier cards — same crown, boxed. */
    ".haf-crown--plaque{padding:.28em .6em;border-radius:999px;",
    "border:1px solid color-mix(in srgb,var(--haf-crown,#f18e00) 45%,transparent);",
    "background:color-mix(in srgb,var(--haf-crown,#f18e00) 12%,transparent)}",
    /* Dark surfaces lift it towards gold without a second asset. */
    "@media (prefers-color-scheme:dark){.haf-crown{--haf-crown:#ffb347}}"
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
