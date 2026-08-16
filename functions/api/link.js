/* KNECT tracking-link issuer + resolver (Cloudflare Pages Function → /api/link).
   POST  {job,name,from,to}  -> issues a short private token, returns /t/<token>
   GET   ?token=<token>       -> resolves it back to the job (for the share page)
   The link carries NO names or job details in the URL — only an opaque code.
   Store: public.track_links in the HUB Supabase; DB key is a server env var only.

   Security (Brent's Private-by-Default directive, 16 Aug 2026):
   holding the link is not permission on its own. Every link carries an expiry
   and can be revoked, and both are checked here on every single resolve — so
   access ends with the job instead of lasting forever. */
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

/* How long a tracking link stays usable. A delivery link should outlive the job
   and nothing more; 14 days covers a job that runs long or gets queried after.
   The caller may ask for less, never for more. */
const LINK_DAYS_DEFAULT = 14;
const LINK_DAYS_MAX = 30;

/* One place decides whether a stored link is still good, so the resolver and the
   position gateway can never drift apart on what "valid" means. */
export function linkState(row, nowMs) {
  if (!row) return 'missing';
  const now = nowMs == null ? Date.now() : nowMs;
  if (row.revoked_at && new Date(row.revoked_at).getTime() <= now) return 'revoked';
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return 'expired';
  return 'ok';
}

export async function onRequestPost({ request, env }) {
  if (!env.SUPA_URL || !env.SUPA_KEY) return j({ ok: false, error: 'not_configured' }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return j({ ok: false, error: 'bad_json' }, 400); }
  const job = String(b.job || '').trim().toUpperCase();
  if (!job) return j({ ok: false, error: 'no_job' }, 400);
  const token = makeToken(8);
  let days = Number(b.days);
  if (!isFinite(days) || days <= 0) days = LINK_DAYS_DEFAULT;
  days = Math.min(days, LINK_DAYS_MAX);
  const now = Date.now();
  const row = {
    token, job,
    name: b.name ? String(b.name).slice(0, 80) : null,
    frm: b.from ? String(b.from).slice(0, 80) : null,
    dst: b.to ? String(b.to).slice(0, 80) : null,
    created: new Date(now).toISOString(),
    expires_at: new Date(now + days * 86400000).toISOString()
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
  return j({
    ok: true, token, path: '/t/' + token, url: origin + '/t/' + token,
    expiresAt: row.expires_at
  });
}

/* Kill a link early — the job finished, or it went to the wrong person.
   DELETE ?token=<token> */
export async function onRequestDelete({ request, env }) {
  const u = new URL(request.url);
  const token = (u.searchParams.get('token') || '').trim();
  if (!token) return j({ ok: false, error: 'no_token' }, 400);
  if (!env.SUPA_URL || !env.SUPA_KEY) return j({ ok: false, error: 'not_configured' }, 503);
  try {
    const r = await fetch(env.SUPA_URL + '/rest/v1/track_links?token=eq.' + encodeURIComponent(token), {
      method: 'PATCH',
      headers: {
        apikey: env.SUPA_KEY, Authorization: 'Bearer ' + env.SUPA_KEY,
        'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify({ revoked_at: new Date().toISOString() })
    });
    if (!r.ok) return j({ ok: false, error: 'revoke_failed' }, 502);
  } catch (e) { return j({ ok: false, error: 'upstream' }, 502); }
  return j({ ok: true, revoked: true });
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const token = (u.searchParams.get('token') || '').trim();
  if (!token) return j({ ok: false, error: 'no_token' }, 400);
  if (!env.SUPA_URL || !env.SUPA_KEY) return j({ ok: false, error: 'not_configured' }, 503);
  let rows;
  try {
    const r = await fetch(env.SUPA_URL + '/rest/v1/track_links?token=eq.' + encodeURIComponent(token) +
      '&select=job,name,frm,dst,expires_at,revoked_at',
      { headers: { apikey: env.SUPA_KEY, Authorization: 'Bearer ' + env.SUPA_KEY } });
    rows = await r.json();
  } catch (e) { return j({ ok: false, error: 'upstream' }, 502); }
  const row = Array.isArray(rows) && rows[0];
  const state = linkState(row);
  /* An expired or revoked link is answered exactly like one that never existed,
     apart from the reason — so nobody can use the difference to test which job
     references are real. */
  if (state !== 'ok') {
    return j({ ok: true, found: false, reason: state === 'missing' ? 'unknown' : state });
  }
  return j({
    ok: true, found: true, job: row.job, name: row.name,
    from: row.frm, to: row.dst, expiresAt: row.expires_at
  });
}
