/* KNECT tracking-link issuer + resolver (Cloudflare Pages Function → /api/link).
   POST  {job,name,from,to}  -> issues a short private token, returns /t/<token>
   GET   ?token=<token>       -> resolves it back to the job (for the share page)
   The link carries NO names or job details in the URL — only an opaque code.
   Store: public.track_links in the HUB Supabase; DB key is a server env var only. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Content-Type': 'application/json'
};
const j = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: CORS });

/* unambiguous alphabet (no 0/O/1/I/L) so a driver could read it aloud if needed */
function makeToken(n) {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(n || 8); crypto.getRandomValues(b);
  let s = ''; for (const x of b) s += a[x % a.length]; return s;
}

export function onRequestOptions() { return new Response(null, { headers: CORS }); }

export async function onRequestPost({ request, env }) {
  if (!env.SUPA_URL || !env.SUPA_KEY) return j({ ok: false, error: 'not_configured' }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return j({ ok: false, error: 'bad_json' }, 400); }
  const job = String(b.job || '').trim().toUpperCase();
  if (!job) return j({ ok: false, error: 'no_job' }, 400);
  const token = makeToken(8);
  const row = {
    token, job,
    name: b.name ? String(b.name).slice(0, 80) : null,
    frm: b.from ? String(b.from).slice(0, 80) : null,
    dst: b.to ? String(b.to).slice(0, 80) : null,
    created: new Date().toISOString()
  };
  try {
    const r = await fetch(env.SUPA_URL + '/rest/v1/track_links', {
      method: 'POST',
      headers: {
        apikey: env.SUPA_KEY, Authorization: 'Bearer ' + env.SUPA_KEY,
        'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    });
    if (!r.ok) { const t = await r.text(); return j({ ok: false, error: 'store_failed', detail: t.slice(0, 160) }, 502); }
  } catch (e) { return j({ ok: false, error: 'upstream' }, 502); }
  const origin = new URL(request.url).origin;
  return j({ ok: true, token, path: '/t/' + token, url: origin + '/t/' + token });
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const token = (u.searchParams.get('token') || '').trim();
  if (!token) return j({ ok: false, error: 'no_token' }, 400);
  if (!env.SUPA_URL || !env.SUPA_KEY) return j({ ok: false, error: 'not_configured' }, 503);
  let rows;
  try {
    const r = await fetch(env.SUPA_URL + '/rest/v1/track_links?token=eq.' + encodeURIComponent(token) +
      '&select=job,name,frm,dst', { headers: { apikey: env.SUPA_KEY, Authorization: 'Bearer ' + env.SUPA_KEY } });
    rows = await r.json();
  } catch (e) { return j({ ok: false, error: 'upstream' }, 502); }
  const row = Array.isArray(rows) && rows[0];
  if (!row) return j({ ok: true, found: false });
  return j({ ok: true, found: true, job: row.job, name: row.name, from: row.frm, to: row.dst });
}
