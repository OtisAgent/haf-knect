/* KNECT live-position gateway (Cloudflare Pages Function).
   The driver's phone POSTs its GPS here; the Live Job map GETs it back.
   The database key lives ONLY as a server env var (SUPA_KEY) — never in any page.
   Store: public.live_pos in the HUB Supabase, one row per job (upsert on job). */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Content-Type': 'application/json'
};
const j = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: CORS });

export function onRequestOptions() { return new Response(null, { headers: CORS }); }

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const job = (u.searchParams.get('job') || '').trim().toUpperCase();
  if (!job) return j({ ok: false, error: 'no_job' }, 400);
  if (!env.SUPA_URL || !env.SUPA_KEY) return j({ ok: false, error: 'not_configured' }, 503);
  let rows;
  try {
    const r = await fetch(env.SUPA_URL + '/rest/v1/live_pos?job=eq.' + encodeURIComponent(job) +
      '&select=job,lat,lng,kind,label,ts', { headers: { apikey: env.SUPA_KEY, Authorization: 'Bearer ' + env.SUPA_KEY } });
    rows = await r.json();
  } catch (e) { return j({ ok: false, error: 'upstream' }, 502); }
  const row = Array.isArray(rows) && rows[0];
  if (!row) return j({ ok: true, found: false });
  const ageSec = Math.max(0, Math.round((Date.now() - new Date(row.ts).getTime()) / 1000));
  return j({ ok: true, found: true, lat: row.lat, lng: row.lng, kind: row.kind, label: row.label, ts: row.ts, ageSec });
}

export async function onRequestPost({ request, env }) {
  if (!env.SUPA_URL || !env.SUPA_KEY) return j({ ok: false, error: 'not_configured' }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return j({ ok: false, error: 'bad_json' }, 400); }
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return j({ ok: false, error: 'bad_params' }, 400);
  }
  /* writes are gated: only a phone holding a real issued link can post a position */
  const token = String(b.token || '').trim();
  if (!token) return j({ ok: false, error: 'no_token' }, 401);
  let job;
  try {
    const lr = await fetch(env.SUPA_URL + '/rest/v1/track_links?token=eq.' + encodeURIComponent(token) + '&select=job',
      { headers: { apikey: env.SUPA_KEY, Authorization: 'Bearer ' + env.SUPA_KEY } });
    const lrows = await lr.json();
    job = Array.isArray(lrows) && lrows[0] && lrows[0].job;
  } catch (e) { return j({ ok: false, error: 'upstream' }, 502); }
  if (!job) return j({ ok: false, error: 'bad_token' }, 401);
  const row = {
    job, lat, lng,
    kind: b.kind === 'pin' ? 'pin' : 'live',
    label: b.label ? String(b.label).slice(0, 80) : null,
    ts: new Date().toISOString()
  };
  try {
    const r = await fetch(env.SUPA_URL + '/rest/v1/live_pos?on_conflict=job', {
      method: 'POST',
      headers: {
        apikey: env.SUPA_KEY, Authorization: 'Bearer ' + env.SUPA_KEY,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(row)
    });
    if (!r.ok) { const t = await r.text(); return j({ ok: false, error: 'store_failed', detail: t.slice(0, 160) }, 502); }
  } catch (e) { return j({ ok: false, error: 'upstream' }, 502); }
  return j({ ok: true });
}
