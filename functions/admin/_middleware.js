/* Refuse the pricing test suites, whatever is left in the published output.
 *
 * 10 Sep 2026. Two things I got wrong tonight, both found by fetching from
 * outside rather than by reasoning about the repo:
 *
 *  1. Cloudflare Pages DOES publish folders whose name begins with a dot.
 *     /.decisions/pricing-source/pricing-matrix-v3.js answered 200 with all
 *     65,042 original bytes. Moving private material into a dot folder moves it
 *     to a different public address, nothing more.
 *
 *  2. _redirects cannot hide a file. Static assets are matched BEFORE redirect
 *     rules, so a `/admin/x.test.js /_not-found 404` line is simply never
 *     reached. The seven suites were still answering 200 with their original
 *     bytes after being deleted from the repo and after the 404 rules shipped.
 *
 * A Pages Function is the one thing in front of static assets, so this is where
 * the refusal has to live. Scoped to /admin/ deliberately: a root _middleware.js
 * would add an invocation to every request on the site to solve a problem that
 * only exists under one prefix.
 *
 * Everything that is not a test file passes straight through with next(), so the
 * pricing engine the public app depends on is untouched — index.html loads five
 * of those files and quoting breaks without them.
 */
const BLOCKED = /\/admin\/[^/]*\.(test|test\.RETIRED)\.(js|mjs)$/i;

export async function onRequest(context) {
  if (BLOCKED.test(new URL(context.request.url).pathname)) {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8",
                 "cache-control": "no-store" },
    });
  }
  return context.next();
}
