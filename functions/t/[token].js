/* Clean short link: /t/<token> serves the driver share page with the code baked in.
   The code stays opaque in the URL — no name, no route, nothing personal. */
export async function onRequestGet({ params, env, request }) {
  const token = String(params.token || '').slice(0, 32);
  const url = new URL(request.url);
  url.pathname = '/track/index.html';
  let html;
  try {
    const res = await env.ASSETS.fetch(new Request(url.toString(), { headers: request.headers }));
    html = await res.text();
  } catch (e) {
    return new Response('Tracking page unavailable', { status: 500 });
  }
  const inject = '<script>window.__TRACK_TOKEN=' + JSON.stringify(token) + ';</script>';
  html = html.replace('</head>', inject + '</head>');
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
