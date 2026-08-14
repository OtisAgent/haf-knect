/* KNECT ORDER — the customer journey from "book it" to a job on the network.

   Brent, 14 Aug: "make sure the jobs that get pushed through get the right
   customer journey from the email to the payment link -> holding deposit ->
   sent to the correct system within HAF KNECT Dashboards and PLNA system ->
   allocated to the correct usernames and dashboards."

   THE ORDER OF EVENTS, AND WHY IT IS THIS ORDER
   ---------------------------------------------
     1. The customer completes the order screen.               (POST /place)
     2. The price is worked out AGAIN, here, from the postcodes. The browser
        never names its own price.
     3. An order record is written, and a holding deposit is raised on HAF PAY.
     4. The customer gets a reference, a deposit link and a tracking link.
     5. The deposit is paid on HAF PAY's card page — no card detail, no Stripe
        key and no card page exists on this project.
     6. ONLY THEN does the job go to the network. A job on a driver's board is a
        promise that the work is real and will be paid for; an unpaid order is
        neither. That step is a job that runs on the box, because it must keep
        happening after this request has ended.

   The order screen offers "Know the driver? — send it straight to them". That
   username rides along on the order and becomes a TEN MINUTE first refusal on
   the network: for ten minutes the job is on that driver's board and nobody
   else's, and then it is simply open work. Nothing has to run for the window to
   lapse, so there is no timer that can fail and strand a delivery.

   Routes:  POST /api/order/quote   price it, write nothing
            POST /api/order/place   place it, raise the deposit
            GET  /api/order/track   one job, by its private token             */

import {
  json, bad, coreReady, coreInsert, coreUpdate, coreRpc, logEvent,
  newJobReference, newTrackToken, newPaymentReference, milesBetween
} from '../../../shared/order-core.js';
import { quoteOneOff, VEHICLES, JOB_TYPES, DEPOSIT_PCT } from '../../../shared/order-quote.js';

/* The first-refusal window, in minutes. Brent set this at ten on 14 Aug. It is
   written here once and passed to the network, and the order screen says the
   same number to the customer — one figure, not three that can disagree. */
export const FIRST_REFUSAL_MINUTES = 10;

export async function onRequest(context) {
  const { request, env, params } = context;
  const route = (params.path || []).join('/');
  if (request.method === 'OPTIONS') return json({ ok: true });
  try {
    switch (`${request.method} /${route}`) {
      case 'GET /options': return json({ ok: true, vehicles: VEHICLES, job_types: JOB_TYPES,
                                         deposit_pct: DEPOSIT_PCT,
                                         first_refusal_minutes: FIRST_REFUSAL_MINUTES });
      case 'POST /quote':  return await quote(request, env);
      case 'POST /place':  return await place(request, env);
      case 'GET /track':   return await track(request, env);
      default:             return bad('unknown endpoint', 404);
    }
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 500);
  }
}

/* Show me the price before I commit. Public, and it writes nothing. */
async function quote(request, env) {
  const b = await request.json().catch(() => ({}));
  const leg = await milesBetween(b.collect_postcode, b.deliver_postcode);
  if (!leg) return bad('we could not work out the distance between those two postcodes — please check them');
  const q = quoteOneOff({ miles: leg.miles, vehicleCode: b.vehicle_code, jobTypeCode: b.job_type_code });
  if (!q) return bad('please choose a van size and how quickly you need it');
  return json({ ok: true, quote: { ...q, minutes: leg.minutes, from: leg.from, to: leg.to } });
}

/* Complete details -> processed order -> holding deposit raised. */
async function place(request, env) {
  if (!coreReady(env)) return bad('ordering is not switched on yet on this site', 503);
  const b = await request.json().catch(() => ({}));

  const name = String(b.customer_name || '').trim();
  const email = String(b.customer_email || '').trim().toLowerCase();
  const phone = String(b.customer_phone || '').replace(/[^\d+ ]/g, '').trim();
  const collect = String(b.collect_postcode || '').trim().toUpperCase();
  const deliver = String(b.deliver_postcode || '').trim().toUpperCase();
  const goods = String(b.goods || '').trim();
  if (name.length < 2) return bad('please give us your name');
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) return bad('that email address does not look right');
  if (phone.replace(/\D/g, '').length < 10) return bad('please give a phone number the driver can reach you on');
  if (!collect || !deliver) return bad('please give both postcodes');
  if (goods.length < 3) return bad('please tell us what is being moved');

  /* A username is never confirmed to a stranger. We take what was typed, keep
     it with the order, and let the NETWORK decide whether that driver exists
     and is cleared — which it answers to us, never to the customer. */
  const direct = String(b.direct_username || '').trim().toUpperCase();
  const directUser = /^[A-Z]{2}[0-9]{4,8}$/.test(direct) ? direct : null;

  // Priced here, from the postcodes, and never read from what the browser sent.
  const leg = await milesBetween(collect, deliver);
  if (!leg) return bad('we could not work out the distance between those two postcodes — please check them');
  const q = quoteOneOff({ miles: leg.miles, vehicleCode: b.vehicle_code, jobTypeCode: b.job_type_code });
  if (!q) return bad('please choose a van size and how quickly you need it');

  /* The free HAF KNECT account, opened quietly. No compliance and no checks —
     they are not driving. It exists so this person is a record we can find and
     contact, rather than an order floating on its own. */
  const account = await coreInsert(env, 'join_signup', {
    account_type: 'oneoff',
    plan_key: 'job',
    plan_name: 'One-off delivery — free HAF KNECT account',
    billing: 'order',
    seats: 1,
    price_pence: 0,
    first_name: name.split(/\s+/)[0],
    last_name: name.split(/\s+/).slice(1).join(' ') || '—',
    email,
    phone,
    company: String(b.company || '').trim() || null,
    status: 'joined'
  });

  const jobRef = newJobReference();
  const token = newTrackToken();
  await coreInsert(env, 'job_order', {
    job_ref: jobRef,
    account_ref: account.id,
    customer_name: name, customer_email: email, customer_phone: phone,
    company: String(b.company || '').trim() || null,
    collect_postcode: collect, collect_address: String(b.collect_address || '').trim() || null,
    deliver_postcode: deliver, deliver_address: String(b.deliver_address || '').trim() || null,
    collect_on: b.collect_on || null,
    collect_window: String(b.collect_window || '').trim() || null,
    goods, notes: String(b.notes || '').trim() || null,
    vehicle_code: q.vehicle_code, job_type_code: q.job_type_code,
    miles: q.miles, minutes: leg.minutes,
    quote_ex_vat_pence: q.quote_ex_vat_pence, vat_pence: q.vat_pence,
    total_pence: q.total_pence, deposit_pence: q.deposit_pence, balance_pence: q.balance_pence,
    /* The consignment the driver reads, the named driver the customer asked
       for, and the window they were promised — carried on the order so the job
       that reaches the network is the job that was ordered. */
    quote_detail: {
      ...q, from: leg.from, to: leg.to,
      consignment: b.consignment || null,
      direct_username: directUser,
      first_refusal_minutes: FIRST_REFUSAL_MINUTES,
      whatsapp_updates: Boolean(b.whatsapp_updates)
    },
    status: 'new',
    track_token: token
  });

  /* The holding deposit. Not the whole price: it holds the job while the
     network is asked, and it comes straight back if nobody takes it. */
  const deposit = await coreInsert(env, 'job_payment', {
    job_ref: jobRef,
    account_ref: account.id,
    account_type: 'customer',
    customer_email: email,
    customer_name: name,
    amount_pence: q.deposit_pence,
    payment_reference: newPaymentReference(),
    purpose: 'deposit',
    plan_name: `Holding deposit — ${jobRef}`,
    next_url: `${payBase(env)}/track/${token}`,
    status: 'awaiting_payment'
  });
  await coreUpdate(env, 'job_order', `job_ref=eq.${jobRef}`, { deposit_reference: deposit.payment_reference });
  await logEvent(env, {
    job_ref: jobRef, payment_reference: deposit.payment_reference, event: 'order_placed',
    detail: { total_pence: q.total_pence, deposit_pence: q.deposit_pence, miles: q.miles,
              vehicle: q.vehicle_code, direct_username: directUser, source: 'knect_order_screen' },
    actor: 'customer'
  });

  return json({
    ok: true,
    job_ref: jobRef,
    quote: q,
    deposit_pence: q.deposit_pence,
    balance_pence: q.balance_pence,
    direct_username: directUser,
    first_refusal_minutes: FIRST_REFUSAL_MINUTES,
    pay_url: `${payBase(env)}/pay/${deposit.payment_reference}`,
    track_url: `${payBase(env)}/track/${token}`
  });
}

/* HAF PAY owns the card page. This project holds no Stripe key and draws no
   payment screen — it only knows the address of the one that does. */
function payBase(env) {
  return (env.PAY_BASE || 'https://join.usehaf.co.uk').replace(/\/+$/, '');
}

/* The tracking page's only source. One job, no login, nothing about anybody
   else — the database function decides what a customer may see, not this code. */
async function track(request, env) {
  if (!coreReady(env)) return bad('tracking is not switched on yet on this site', 503);
  const token = new URL(request.url).searchParams.get('t') || '';
  if (!/^[A-Z2-9]{24}$/.test(token)) return bad('that tracking link is not one of ours', 404);
  const rows = await coreRpc(env, 'track_order', { p_token: token });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return bad('we cannot find that job', 404);
  return json({ ok: true, order: row });
}
