/* HAF KNECT pricing config gateway (Cloudflare Pages Function → /api/pricing).

   GET                      -> the active pricing framework + the flat rate rows
   POST {config,user,note}  -> saves a new version and makes it the active one

   Store: public.tier_config in the HUB Supabase. The framework lives as one
   versioned snapshot under scope 'pricing_matrix'; the individual rates are
   ALSO written out to the flat scopes (vehicle_rate, driver_reward,
   account_fee_reduction, job_type_fee, local_handling) so every other HAF
   system can read a single rate without parsing the whole framework.

   Saving never overwrites: each save writes a NEW snapshot row and flips the
   previous one to is_active=false, so every pricing change Brent makes stays on
   the record with who made it and when.

   ⚠️ HONEST NOTE ON THE GATE. The owner check below is a front door. The
   tier_config table itself currently accepts writes from the public key that is
   baked into the KNECT page, so the real lock has to be a row-level security
   policy on the database plus a server-only key in SUPA_KEY. That is flagged to
   Brent — until it is done, treat this endpoint as the tidy path in, not a
   guarantee that it is the only one. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-haf-user',
  'Content-Type': 'application/json'
};
const j = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: CORS });

/* The rates are shown to customers on every quote, so reading them is public.
   This is the same key the KNECT page already ships with — no new exposure.
   A server-only key in SUPA_KEY is used instead the moment one is set. */
const PUB_URL = 'https://jsdwvogsxlnczzbefwgp.supabase.co';
const PUB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzZHd2b2dzeGxuY3p6YmVmd2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODgyMzYsImV4cCI6MjA5Njk2NDIzNn0.pxqM-Oh4f_3PlqCbKIKvcKZnNRUZ1ASKqqdNg78M_4M';

const SCOPES = ['vehicle_rate', 'driver_reward', 'account_fee_reduction',
                'job_type_fee', 'local_handling', 'zone_factor'];

function db(env) {
  const url = (env.SUPA_URL || PUB_URL).replace(/\/$/, '') + '/rest/v1/tier_config';
  const key = env.SUPA_KEY || PUB_KEY;
  return { url, h: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' } };
}

/* Only these accounts may change a price. Set PRICING_OWNERS on the Pages
   project to change the list without a redeploy. */
function isOwner(env, user) {
  const allowed = String(env.PRICING_OWNERS || 'BF638793')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  return allowed.includes(String(user || '').trim().toUpperCase());
}

export function onRequestOptions() { return new Response(null, { headers: CORS }); }

export async function onRequestGet({ env }) {
  const { url, h } = db(env);
  let snap, flat;
  try {
    const [a, b] = await Promise.all([
      fetch(url + '?scope=eq.pricing_matrix&is_active=is.true&select=code,label,value,updated_at&order=updated_at.desc&limit=1', { headers: h }),
      fetch(url + '?scope=in.(' + SCOPES.join(',') + ')&select=scope,code,label,value,sort&order=scope,sort', { headers: h })
    ]);
    snap = await a.json(); flat = await b.json();
  } catch (e) { return j({ ok: false, error: 'upstream' }, 502); }

  if (!Array.isArray(snap) || !snap.length)
    return j({ ok: false, error: 'no_active_framework' }, 404);

  const rec = snap[0];
  return j({
    ok: true,
    version: rec.value && rec.value.version || rec.code,
    effectiveFrom: rec.value && rec.value.effectiveFrom || null,
    lockedBy: rec.value && rec.value.lockedBy || null,
    updatedAt: rec.updated_at,
    config: rec.value && rec.value.config || null,
    rates: Array.isArray(flat) ? flat : []
  });
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return j({ ok: false, error: 'bad_json' }, 400); }

  const user = b.user || request.headers.get('x-haf-user') || '';
  if (!isOwner(env, user)) return j({ ok: false, error: 'not_authorised' }, 403);

  const cfg = b.config;
  if (!cfg || typeof cfg !== 'object') return j({ ok: false, error: 'no_config' }, 400);

  /* Guardrails a saved config must satisfy before it is allowed near a quote.
     A rate typo here would misprice every job on the network. */
  const bad = validate(cfg);
  if (bad.length) return j({ ok: false, error: 'invalid_config', problems: bad }, 422);

  const { url, h } = db(env);
  const stamp = new Date().toISOString();
  const version = 'MATRIX_V5_' + stamp.slice(0, 19).replace(/[-:T]/g, '');

  try {
    /* 1. retire the current snapshot (history is kept, never overwritten) */
    await fetch(url + '?scope=eq.pricing_matrix&is_active=is.true',
      { method: 'PATCH', headers: h, body: JSON.stringify({ is_active: false }) });

    /* 2. write the new one */
    const snapRow = {
      scope: 'pricing_matrix', code: version,
      label: 'HAF KNECT Pricing Framework — saved ' + stamp.slice(0, 16).replace('T', ' '),
      is_active: true, sort: 1,
      value: {
        version: cfg.version || 'MATRIX-V5', effectiveFrom: cfg.effectiveFrom || stamp.slice(0, 10),
        lockedBy: 'Saved from the Pricing Engine page by ' + user + ' on ' + stamp,
        savedBy: user, savedAt: stamp, note: String(b.note || '').slice(0, 400),
        seed: 'v5', config: cfg
      }
    };
    const w = await fetch(url, { method: 'POST', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify([snapRow]) });
    if (!w.ok) return j({ ok: false, error: 'save_failed', detail: (await w.text()).slice(0, 300) }, 502);

    /* 3. mirror the individual rates out to the flat scopes */
    await mirrorFlat(url, h, cfg);
  } catch (e) { return j({ ok: false, error: 'upstream' }, 502); }

  return j({ ok: true, version, savedAt: stamp, savedBy: user });
}

/* --- validation ------------------------------------------------------------ */
function validate(c) {
  const p = [];
  const n = v => typeof v === 'number' && isFinite(v);
  if (!Array.isArray(c.vehicles) || c.vehicles.length !== 8)
    p.push('There must be exactly eight vehicles — small van through Luton tail lift.');
  else {
    let prevRate = 0, prevMin = 0;
    for (const v of c.vehicles) {
      if (!n(v.baseRate) || v.baseRate <= 0) { p.push(v.name + ': the driver rate must be a number above zero.'); continue; }
      if (!n(v.minTransportValue) || v.minTransportValue <= 0) { p.push(v.name + ': the minimum must be a number above zero.'); continue; }
      /* the ladder must never go backwards — a bigger van cannot pay less */
      if (v.baseRate < prevRate) p.push(v.name + ': its rate is lower than the smaller vehicle above it.');
      if (v.minTransportValue < prevMin) p.push(v.name + ': its minimum is lower than the smaller vehicle above it.');
      prevRate = v.baseRate; prevMin = v.minTransportValue;
    }
  }
  if (c.driverLevels) {
    const l = c.driverLevels;
    for (const k of ['FREE', 'MEMBER', 'PRO'])
      if (!l[k] || !n(l[k].rewardGbpPerMile) || l[k].rewardGbpPerMile < 0)
        p.push('Driver reward ' + k + ' must be zero or more.');
    if (l.FREE && l.MEMBER && l.PRO && !(l.FREE.rewardGbpPerMile <= l.MEMBER.rewardGbpPerMile && l.MEMBER.rewardGbpPerMile <= l.PRO.rewardGbpPerMile))
      p.push('The driver rewards must rise: free, then member, then pro.');
  }
  if (c.accountLevels) {
    for (const k of ['LITE', 'PLUS', 'PRO']) {
      const a = c.accountLevels[k];
      if (!a || !n(a.feeReductionPts) || a.feeReductionPts < 0 || a.feeReductionPts > 20)
        p.push('Account fee reduction ' + k + ' must be between 0 and 20 points.');
    }
  }
  if (Array.isArray(c.jobTypes)) {
    for (const t of c.jobTypes) {
      if (!n(t.marginPct) || t.marginPct < 0 || t.marginPct > 90) p.push(t.name + ': the network fee must be between 0% and 90%.');
      if (!n(t.floorPct) || t.floorPct < 0) p.push(t.name + ': the floor must be zero or more.');
      if (n(t.marginPct) && n(t.floorPct) && t.floorPct > t.marginPct) p.push(t.name + ': the floor cannot be above the fee itself.');
    }
  }
  if (c.localHandling) {
    const h = c.localHandling;
    if (!n(h.maxReductionPct) || h.maxReductionPct < 0 || h.maxReductionPct > 60) p.push('The short-run reduction must be between 0% and 60%.');
    if (!n(h.bandReductionPct) || h.bandReductionPct > h.maxReductionPct) p.push('The mid-band reduction cannot be bigger than the reduction at zero miles.');
    if (!n(h.bandAtMiles) || !n(h.fullMinimumFromMiles) || h.bandAtMiles >= h.fullMinimumFromMiles)
      p.push('The short-run band must end before the full minimum returns.');
  }
  return p;
}

/* --- flat mirror ------------------------------------------------------------ */
async function mirrorFlat(url, h, c) {
  const rows = [];
  const add = (scope, code, label, value, sort) =>
    rows.push({ scope, code, label, value: { ...value, seed: 'v5' }, is_active: true, sort });

  (c.vehicles || []).forEach((v, i) =>
    add('vehicle_rate', v.code, v.name, { baseRateGbpPerMile: v.baseRate, minTransportValueGbp: v.minTransportValue }, i + 1));
  ['FREE', 'MEMBER', 'PRO'].forEach((k, i) => {
    const l = c.driverLevels && c.driverLevels[k]; if (!l) return;
    add('driver_reward', k, l.name, { rewardGbpPerMile: l.rewardGbpPerMile, rank: l.rank }, i + 1);
  });
  ['LITE', 'PLUS', 'PRO'].forEach((k, i) => {
    const a = c.accountLevels && c.accountLevels[k]; if (!a) return;
    add('account_fee_reduction', k, a.name, { feeReductionPts: a.feeReductionPts, rank: a.rank }, i + 1);
  });
  (c.jobTypes || []).forEach((t, i) =>
    add('job_type_fee', t.code, t.name, { networkFeePct: t.marginPct, floorPct: t.floorPct, active: t.active }, i + 1));
  if (c.localHandling) add('local_handling', 'CURVE', 'Short-run handling taper', c.localHandling, 1);

  const scopes = [...new Set(rows.map(r => r.scope))];
  for (const s of scopes)
    await fetch(url + '?scope=eq.' + encodeURIComponent(s), { method: 'DELETE', headers: h });
  if (rows.length)
    await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(rows) });
}

/* exported for the test harness — not used by the endpoint itself */
export { validate, mirrorFlat };
