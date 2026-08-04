/* POST /api/book — the only way a job becomes a job.
 *
 * Nothing reaches the network unpaid, and nothing is priced by the customer's
 * own browser. This re-measures the route and re-prices it here with the same
 * engine the page quotes with, raises the payment against that figure, and
 * hands back the private link where they pay by card or bank transfer.
 *
 * Business, freight forwarding and drivers all come through this one door.
 * The single exception is an account given a credit limit at sign-up — the
 * payment service applies that itself, and answers 'on_credit'.
 */

import { v3Price, VAN, hafApplyPricingConfig } from '../_pricing-core.js';
import { loadLaneFactors } from '../_lane-factors.js';

const DISTANCE_GATEWAY = 'https://haf-distance.pages.dev/';
const ACCOUNT_TYPES = ['business', 'freight_forward', 'driver', 'customer'];
const URGENCIES = ['flex', 'sday', 'urg', 'timed'];
const JOB_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

const bad = (message, status = 400) => json({ ok: false, error: message }, status);

/* The lane rules and the saved framework are the same for every request, so
   they are fetched once and kept for the life of the worker. */
let lanesReady = false;
let frameworkAt = 0;

async function primeEngine(origin) {
  if (!lanesReady) {
    try {
      globalThis.HAFLaneFactors = loadLaneFactors();
      lanesReady = true;
    } catch (_) { /* the quote falls back to the destination-area grade */ }
  }
  // Re-read the saved framework every five minutes: a price change Brent makes
  // in the Pricing Engine has to reach this door too, not just the page.
  if (Date.now() - frameworkAt < 300000) return;
  try {
    const r = await fetch(`${origin}/api/pricing`, { cf: { cacheTtl: 0 } });
    if (r.ok) {
      const d = await r.json();
      if (d && d.ok && d.config) hafApplyPricingConfig(d.config);
    }
    frameworkAt = Date.now();
  } catch (_) { /* built-in rates stand — a job must never fail to price */ }
}

/* Road miles from the same gateway the page uses, so the two agree. */
async function measure(from, to) {
  try {
    const r = await fetch(
      `${DISTANCE_GATEWAY}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    if (r.ok) {
      const d = await r.json();
      if (d && d.ok) return { miles: Math.max(1, Math.round(d.miles)), mins: d.mins, exact: true };
    }
  } catch (_) { /* fall through to the estimate */ }

  // Straight line is a lie about the road wherever an estuary sits in the way,
  // so an estimate is never allowed to price a job on its own — see below.
  try {
    const pair = await Promise.all([lookup(from), lookup(to)]);
    if (pair[0] && pair[1]) {
      const R = 3959;
      const dLa = ((pair[1].lat - pair[0].lat) * Math.PI) / 180;
      const dLo = ((pair[1].lon - pair[0].lon) * Math.PI) / 180;
      const x = Math.sin(dLa / 2) ** 2 +
        Math.cos((pair[0].lat * Math.PI) / 180) * Math.cos((pair[1].lat * Math.PI) / 180) *
        Math.sin(dLo / 2) ** 2;
      const straight = 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
      return { miles: Math.max(1, Math.round(straight * 1.25)), mins: null, exact: false };
    }
  } catch (_) { /* no measurement at all */ }
  return null;
}

async function lookup(pc) {
  const clean = (pc || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{1,2}\d/.test(clean)) return null;
  const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d?.result ? { lat: d.result.latitude, lon: d.result.longitude } : null;
}

function newJobRef() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = '';
  for (const b of bytes) out += JOB_ALPHABET[b % JOB_ALPHABET.length];
  return `HAF-${out}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = new URL(request.url).origin;

  if (!env.PAY_BASE || !env.PAY_TEAM_TOKEN) {
    return json({ ok: false, error: 'payments are not switched on for this site yet' }, 503);
  }

  const b = await request.json().catch(() => ({}));
  const from = String(b.from || '').trim();
  const to = String(b.to || '').trim();
  const van = String(b.van || '');
  const urgency = URGENCIES.includes(b.urgency) ? b.urgency : 'sday';
  const accountType = ACCOUNT_TYPES.includes(b.account_type) ? b.account_type : 'customer';
  const accountRef = String(b.account_ref || '').trim() || 'GUEST';

  if (!from || !to) return bad('a collection and a delivery postcode are both needed');
  if (!VAN[van]) return bad('choose one of the vehicles on the network');

  await primeEngine(origin);

  const route = await measure(from, to);
  if (!route) return bad('those postcodes could not be found — check them and try again');

  const priced = v3Price(route.miles, route.mins, van, urgency, to, {
    account: ['lite', 'plus', 'pro'].includes(b.account_level) ? b.account_level : 'lite',
    fromPc: from
  });

  // An estimated distance may quote, but it may not take money: a wrong guess
  // here charges the customer and pays the driver on a road nobody drove.
  if (!route.exact) {
    return json({
      ok: false,
      needs_human: true,
      error: 'We could not measure this route accurately just now, so we will not '
        + 'take payment for it. The team will price it and come back to you.',
      miles_estimated: route.miles
    }, 503);
  }

  const serverPence = Math.round(priced.sub * 100);
  const quotedPence = Number.isInteger(b.quoted_pence) ? b.quoted_pence : 0;
  // The server's figure is the floor. A higher quote on the page is honoured —
  // that is the customer being charged what they were actually shown.
  const amountPence = Math.max(serverPence, quotedPence);

  const jobRef = newJobRef();
  const r = await fetch(`${env.PAY_BASE}/api/pay/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-haf-team-token': env.PAY_TEAM_TOKEN },
    body: JSON.stringify({
      job_ref: jobRef,
      account_ref: accountRef,
      account_type: accountType,
      amount_pence: amountPence,
      customer_name: b.customer_name || null,
      customer_email: b.customer_email || null,
      raised_by: 'knect_booking'
    })
  });
  const pay = await r.json().catch(() => ({}));
  if (!r.ok || !pay.ok) {
    return json({ ok: false, error: pay.error || 'the payment could not be raised' }, 502);
  }

  return json({
    ok: true,
    job_ref: jobRef,
    amount_pence: amountPence,
    amount_gbp: (amountPence / 100).toFixed(2),
    status: pay.status,                 // awaiting_payment | on_credit
    pay_url: pay.pay_url,               // null when the account is on credit terms
    miles: route.miles,
    vehicle: VAN[van].n,
    quote_matched: quotedPence === serverPence
  });
}
