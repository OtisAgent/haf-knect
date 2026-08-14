/* /job/<token> — the customer's own delivery page.

   The token is baked into the page here rather than left in the URL as a query
   string, for one reason: a query string is copied into browser history, into
   the referrer header of anything the page loads, and into most analytics by
   default. The path is not. This is the only key to somebody's order, so it
   should leave as few copies of itself lying around as possible.

   The page itself is a static asset; this only hands it the token. */
export async function onRequestGet({ params, env, request }) {
  const token = String(params.token || '').toUpperCase();
  // Shape-checked before it is put into the page at all — the same alphabet the
  // token is minted from, so anything else never reaches the database.
  const safe = /^[A-Z2-9]{24}$/.test(token) ? token : '';

  const url = new URL(request.url);
  url.pathname = '/job/index.html';
  let html;
  try {
    const res = await env.ASSETS.fetch(new Request(url.toString(), { headers: request.headers }));
    html = await res.text();
  } catch (e) {
    return new Response('Your delivery page is unavailable for a moment. Please try again.',
                        { status: 500 });
  }

  const inject = `<script>window.__JOB_TOKEN=${JSON.stringify(safe)};</script>`;
  return new Response(html.replace('</head>', inject + '</head>'), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // Somebody's delivery is not for a search index.
      'x-robots-tag': 'noindex, nofollow'
    }
  });
}
