/* Two prefixes that must never answer, wherever the asset came from.
 *
 * 10 Sep 2026. Deleting a file from the repo does NOT stop Cloudflare Pages
 * serving it: /.decisions/pricing-source/pricing-matrix-v3.js and
 * /.tests/account-fees-v1.test.js were still answering 200 with their full
 * original bytes after the commit that removed them, exactly as the seven test
 * suites did. And _redirects cannot help, because a static asset is matched
 * before any redirect rule is read.
 *
 * A Function is the only layer that runs in front of assets, so the refusal
 * lives here. It is two string comparisons and then next(), and it is scoped by
 * an early return so that every other request on the site pays a prefix check
 * and nothing else — the alternative, a _routes.json narrowing which paths reach
 * the Functions runtime at all, would risk cutting off /api, /t and /job, and
 * that is not a trade worth making to save a string compare.
 *
 * Belt and braces with functions/admin/_middleware.js, which handles the
 * /admin/*.test.js paths. Both exist because the same mistake was made twice:
 * believing a file was gone because the repo said so, instead of fetching it.
 */
/* 10 Sep, later: the new leanness check found README.md answering 200 on the
 * live site — 93 bytes naming the repository and what it is for. Nothing
 * dangerous, and nothing a visitor has any use for either. Exact match, not a
 * prefix: it must not shadow a real route. */
/* 11 Sep: the same mistake a third time, and this one had teeth. Ninety files
 * at the repo root begin with an underscore — test harnesses, probes, one-off
 * scripts — and Cloudflare Pages publishes every one of them. Eight of those
 * carry a working username and PIN for a live account as plain text, so
 * https://knect.usehaf.co.uk/_bar_live_proof.mjs answered 200 with a login in
 * it. The underscore is this repo's convention for "beside the site, not part
 * of it"; nothing the site serves asks for a /_ path (checked), and the Pages
 * runtime never serves its own _worker.js, _headers, _redirects or
 * _routes.json as assets. So the prefix is the rule, and it is one more string
 * compare on a path we are already inspecting.
 *
 * The credentials themselves are being taken out of those files separately.
 * This is the door; that is the key. Both. */
const REFUSE = ["/.decisions/", "/.tests/", "/_"];
const REFUSE_EXACT = ["/README.md", "/readme.md"];

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  if (REFUSE.some(prefix => path.startsWith(prefix)) || REFUSE_EXACT.includes(path)) {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8",
                 "cache-control": "no-store" },
    });
  }
  return context.next();
}
