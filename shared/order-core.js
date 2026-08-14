/* KNECT ORDER — shared helpers for the order journey.

   The order screen on knect.usehaf.co.uk is the front of a journey that ends on
   a driver's phone. This file is the part of it that talks to the two systems
   behind that screen:

     * haf-core (the pay schema) — where the order and its money live. Same
       database, same two tables, same rows HAF PAY reads. There is ONE order
       record and ONE payment record for a job, not a KNECT copy and a HAF PAY
       copy that drift.
     * HAF PAY — which owns the card page the customer actually pays on. We
       raise the deposit here and hand the customer to /pay/<reference> there.
       No Stripe key lives on this project and none is needed.

   Why this is here and not in HAF PAY: HAF PAY is a direct-upload Pages project
   whose worker is uploaded inline and cannot exceed 20,000 characters — it was
   already at 19.5KB before a line of this was written. KNECT builds on
   Cloudflare's own pipeline from GitHub, so its functions are compiled there
   and have no such ceiling. The journey lives where it can actually ship, and
   it reaches across to HAF PAY for the one thing HAF PAY alone should do. */

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS'
    }
  });

export const bad = (message, status = 400) => json({ ok: false, error: message }, status);

/* ---- haf-core, pay schema (service role — server side only) ---- */
function coreHeaders(env) {
  return {
    apikey: env.CORE_KEY,
    authorization: `Bearer ${env.CORE_KEY}`,
    'content-type': 'application/json',
    'accept-profile': 'pay',
    'content-profile': 'pay'
  };
}

export function coreReady(env) {
  return Boolean(env.CORE_URL && env.CORE_KEY);
}

export async function coreSelect(env, table, query) {
  const r = await fetch(`${env.CORE_URL}/rest/v1/${table}?${query}`, { headers: coreHeaders(env) });
  if (!r.ok) throw new Error(`db read failed (${r.status}): ${await r.text()}`);
  return r.json();
}

export async function coreInsert(env, table, row) {
  const r = await fetch(`${env.CORE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...coreHeaders(env), prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`db write failed (${r.status}): ${body}`);
  return JSON.parse(body)[0];
}

export async function coreUpdate(env, table, query, patch) {
  const r = await fetch(`${env.CORE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...coreHeaders(env), prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`db update failed (${r.status}): ${body}`);
  return JSON.parse(body)[0] || null;
}

export async function coreRpc(env, fn, args) {
  const r = await fetch(`${env.CORE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: coreHeaders(env),
    body: JSON.stringify(args)
  });
  if (!r.ok) throw new Error(`db call failed (${r.status}): ${await r.text()}`);
  return r.json();
}

/* An audit line must never be the reason a customer's order fails. */
export async function logEvent(env, row) {
  try { await coreInsert(env, 'payment_event', row); } catch (_) { /* deliberately swallowed */ }
}

/* ---- references ----
   No 0/1/I/O: people read these down a phone to a driver. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const pick = (n) => {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
};

/* HAF-20260814-4K2P9X — the date is in it so anyone reading a list of
   references can see at a glance which week a job belongs to. */
export function newJobReference(now = new Date()) {
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `HAF-${d}-${pick(6)}`;
}

export const newTrackToken = () => pick(24);
export const newPaymentReference = () => `HAFPAY-${pick(8)}`;

export const money = (pence) =>
  '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* Real road miles from HAF's own distance service — the same one the order
   screen quotes from, so the price the server fixes and the range the customer
   was shown are measuring the same journey. */
export async function milesBetween(from, to) {
  const url = `https://haf-distance.pages.dev/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const r = await fetch(url, { cf: { cacheTtl: 3600 } }).catch(() => null);
  if (!r || !r.ok) return null;
  const d = await r.json().catch(() => null);
  if (!d || !d.ok || !Number.isFinite(Number(d.miles)) || Number(d.miles) <= 0) return null;
  return { miles: Number(d.miles), minutes: Number(d.mins) || null, from: d.from, to: d.to };
}
