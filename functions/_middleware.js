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
const REFUSE = ["/.decisions/", "/.tests/"];

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  for (const prefix of REFUSE) {
    if (path.startsWith(prefix)) {
      return new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8",
                   "cache-control": "no-store" },
      });
    }
  }
  return context.next();
}
