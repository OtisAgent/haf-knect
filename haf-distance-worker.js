/* HAF Distance Gateway — Google Distance Matrix proxy with 24h route cache.
   Key lives ONLY here as a worker secret (GMAPS_KEY), never in page code. */
addEventListener('fetch', e => e.respondWith(handle(e.request)));

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

function j(obj, status, extra) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({}, CORS, extra || {}) });
}

async function handle(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const u = new URL(req.url);
  const from = (u.searchParams.get('from') || '').trim().toUpperCase();
  const to = (u.searchParams.get('to') || '').trim().toUpperCase();
  if (!from || !to || from.length < 2 || to.length < 2 || from.length > 12 || to.length > 12) {
    return j({ ok: false, error: 'bad_params' }, 400);
  }
  if (typeof GMAPS_KEY === 'undefined') return j({ ok: false, error: 'not_configured' }, 503);

  const cacheKey = new Request('https://cache.haf-distance/' + encodeURIComponent(from) + '/' + encodeURIComponent(to));
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) {
    const body = await hit.text();
    return new Response(body, { headers: Object.assign({}, CORS, { 'X-Cache': 'HIT' }) });
  }

  let d;
  try {
    const g = await fetch('https://maps.googleapis.com/maps/api/distancematrix/json?origins=' +
      encodeURIComponent(from + ', UK') + '&destinations=' + encodeURIComponent(to + ', UK') +
      '&region=uk&units=imperial&key=' + GMAPS_KEY);
    d = await g.json();
  } catch (e) {
    return j({ ok: false, error: 'upstream' }, 502);
  }
  const el = d.rows && d.rows[0] && d.rows[0].elements && d.rows[0].elements[0];
  if (d.status !== 'OK' || !el || el.status !== 'OK') {
    return j({ ok: false, error: (el && el.status) || d.status || 'no_route' });
  }
  const out = JSON.stringify({
    ok: true,
    miles: Math.round(el.distance.value / 160.934) / 10,
    mins: Math.round(el.duration.value / 60),
    from: (d.origin_addresses[0] || '').replace(/, UK$/, ''),
    to: (d.destination_addresses[0] || '').replace(/, UK$/, '')
  });
  await cache.put(cacheKey, new Response(out, { headers: { 'Cache-Control': 'public, max-age=86400', 'Content-Type': 'application/json' } }));
  return new Response(out, { headers: Object.assign({}, CORS, { 'X-Cache': 'MISS' }) });
}
