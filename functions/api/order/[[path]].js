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
  json, bad, coreReady, coreSelect, coreCount, coreInsert, coreUpdate, coreRpc, logEvent,
  newJobReference, newTrackToken, newPaymentReference, milesBetween,
  postcodeShape, postcodeExists
} from '../../../shared/order-core.js';
import { quoteOneOff, VANS, URGENCIES, DEPOSIT_PCT } from '../../../shared/order-quote.js';
import { whoIsAsking, PLNA_URL, PLNA_KEY } from '../../../shared/payments-core.js';

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
      case 'GET /options': return json({ ok: true, vehicles: VANS, job_types: URGENCIES,
                                         deposit_pct: DEPOSIT_PCT,
                                         first_refusal_minutes: FIRST_REFUSAL_MINUTES });
      case 'POST /quote':  return await quote(request, env);
      case 'POST /place':  return await place(request, env);
      case 'POST /allowance': return await allowance(request, env);
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
  const q = quoteOneOff({ miles: leg.miles, minutes: leg.minutes, vehicleCode: b.vehicle_code, jobTypeCode: b.job_type_code });
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
  /* Both ends have to be a real UK postcode before anything is written. The
     screen resolves a street or a town to one before it submits; this is the
     rule behind that request, for anything posting straight at this address.
     See postcodeShape/postcodeExists in order-core for why it is two tests. */
  const rawCollect = String(b.collect_postcode || '').trim();
  const rawDeliver = String(b.deliver_postcode || '').trim();
  const collect = postcodeShape(rawCollect);
  const deliver = postcodeShape(rawDeliver);
  const goods = String(b.goods || '').trim();
  if (name.length < 2) return bad('please give us your name');
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) return bad('that email address does not look right');
  if (phone.replace(/\D/g, '').length < 10) return bad('please give a phone number the driver can reach you on');
  if (!rawCollect || !rawDeliver) return bad('please give both postcodes');
  if (!collect || !deliver) {
    const end = !collect ? 'collection' : 'delivery';
    return bad(`that does not look like a UK postcode — please give the full postcode for the ${end}, like S9 1XH`);
  }
  for (const [pc, end] of [[collect, 'collection'], [deliver, 'delivery']]) {
    if (!(await postcodeExists(pc))) {
      return bad(`we could not find the postcode ${pc} — please check the ${end} postcode`);
    }
  }
  if (goods.length < 3) return bad('please tell us what is being moved');

  /* ── WHAT A DRIVER CANNOT DO THE JOB WITHOUT ─────────────────────────────
     Brent, 10 Sep 2026: a one-off delivery has to be "fast and free flowing"
     AND "gather all the information needed for the driver to complete the
     delivery". Those pull against each other only if you ask everything at
     once, so the ORDER of asking carries the frictionless half: nothing below
     is asked until the price is already on the screen and the customer has
     decided to book.

     The list is repeated HERE, on the server, because this route is public.
     The screen asks for every one of these — but a page can be edited and
     anything can post straight at this address, and what got through that way
     landed on a driver's board as a postcode with no door, or a name with no
     number to ring. That phone call is the thing HAF exists to remove, so a
     job that would need one is refused at the door instead.

     One problem at a time, in the order the screen asks it, so nobody is told
     "check your details" and left hunting for which one. */
  const phoneOk = (v) => String(v || '').replace(/\D/g, '').length >= 10;
  const bare = (v) => String(v || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  for (const end of [{ k: 'collect', label: 'collection', pc: collect },
                     { k: 'deliver', label: 'delivery', pc: deliver }]) {
    const addr = String(b[`${end.k}_address`] || '').trim();
    /* A postcode is not an address. It is a fence round a few streets, and a
       driver standing in the middle of it still has to ring somebody. */
    if (addr.length < 6 || bare(addr) === bare(end.pc)) {
      return bad(`please give the full ${end.label} address, not just the postcode — a driver needs the door`);
    }
    /* A coded end has no named person by design — the code is the proof. Every
       end has somebody to ring, coded or not: that is where the code goes. */
    if (b[`${end.k}_mode`] !== 'coded' && String(b[`${end.k}_contact`] || '').trim().length < 2) {
      return bad(`please give the name of someone at the ${end.label} point`);
    }
    if (!phoneOk(b[`${end.k}_contact_phone`])) {
      return bad(`please give a mobile number for the ${end.label} point`);
    }
  }
  /* How much there is and how heavy it is travel on the consignment record the
     screen builds, and the driver's job card is drawn straight out of it — so
     an order missing them reaches the board describing a van and a route and
     nothing about the load. */
  const cons = b.consignment && typeof b.consignment === 'object' ? b.consignment : null;
  if (!String((cons || {}).quantity || '').trim()) return bad('please say how many items are being moved');
  if (!String((cons || {}).weight || '').trim()) return bad('please give a rough total weight — a driver has to know what they are lifting');

  /* A username is never confirmed to a stranger. We take what was typed, keep
     it with the order, and let the NETWORK decide whether that driver exists
     and is cleared — which it answers to us, never to the customer. */
  const direct = String(b.direct_username || '').trim().toUpperCase();
  const directUser = /^[A-Z]{2}[0-9]{4,8}$/.test(direct) ? direct : null;

  // Priced here, from the postcodes, and never read from what the browser sent.
  const leg = await milesBetween(collect, deliver);
  if (!leg) return bad('we could not work out the distance between those two postcodes — please check them');
  const q = quoteOneOff({ miles: leg.miles, minutes: leg.minutes, vehicleCode: b.vehicle_code, jobTypeCode: b.job_type_code });
  if (!q) return bad('please choose a van size and how quickly you need it');

  /* ONE PRESS, ONE ORDER. The network already refuses to post the same job
     twice; nothing until now stopped the same order being PLACED twice. A
     second press, a back button, a flaky connection that retried — any of them
     raised a second job and a second holding deposit for one delivery, and the
     customer would be asked to pay both. So before anything is written we look
     for the order this one would duplicate: same person, same route, same van,
     still unpaid, placed in the last quarter of an hour. If it is there we hand
     back the order that already exists — same reference, same deposit link — so
     pressing twice is indistinguishable from pressing once. Deliberately NOT a
     database constraint: two genuine deliveries on the same route later in the
     day must still both go through, and only time separates them. */
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const prior = await coreSelect(env, 'job_order',
    'select=job_ref,track_token,deposit_reference,total_pence,deposit_pence,balance_pence,quote_detail'
    + '&status=eq.new'
    + '&customer_email=eq.' + encodeURIComponent(email)
    + '&collect_postcode=eq.' + encodeURIComponent(collect)
    + '&deliver_postcode=eq.' + encodeURIComponent(deliver)
    + '&vehicle_code=eq.' + encodeURIComponent(q.vehicle_code)
    + '&created_at=gte.' + encodeURIComponent(since)
    + '&order=created_at.desc&limit=1').catch(() => []);
  if (prior && prior.length) {
    const p = prior[0];
    return json({
      ok: true, duplicate: true, job_ref: p.job_ref,
      quote: q,
      deposit_pence: p.deposit_pence, balance_pence: p.balance_pence,
      direct_username: (p.quote_detail || {}).direct_username || null,
      first_refusal_minutes: FIRST_REFUSAL_MINUTES,
      pay_url: p.deposit_reference ? `${payBase(env)}/pay/${p.deposit_reference}` : null,
      track_url: jobPage(request, p.track_token)
    });
  }

  /* ── WHOSE ORDER IS THIS ──────────────────────────────────────────────────
     Until now this screen recorded nobody. An order placed by a signed-in HAF
     account looked exactly like one placed by a stranger, so the account's own
     Live Load board never showed it, the affiliate trail had nowhere to hang,
     and — since 10 Sep — the daily allowance had nothing to count.

     The browser does not simply get to SAY who it is. The credential it sends
     is the credential the sign-in screen took, checked by the same function, so
     a person cannot post as somebody else and cannot post as nobody in order to
     dodge their own allowance while signed in.

     Nobody signed in is a normal, allowed case: the order screen is public and
     a one-off customer has no account to name. They are counted as nothing
     because there is nothing to count them against, not because they slipped
     past something. */
  const asking = await whoIsAsking(b).catch(() => null);
  const postedBy = asking && asking.haf_username
    ? String(asking.haf_username).toUpperCase()
    : null;

  /* ── AND MAY THEY? ────────────────────────────────────────────────────────
     Deliberately AFTER the duplicate check above: a second press, a back button
     or a retried request must never cost a second slot. And deliberately BEFORE
     the order and the deposit below, which is the whole point — the customer is
     told now, rather than charged now and refused later.

     Nothing here touches tracking, payment, proof of delivery or completion. A
     job already running is a promise, and a promise is not rationed. */
  const gate = await askTheDoor(env, b, postedBy);
  if (gate && gate.allowed === false) {
    return json({
      ok: false,
      error: gate.message,
      allowance: {
        blocked_by: gate.blocked_by, level: gate.level, label: gate.label,
        limit: (gate[gate.blocked_by === 'active_orders' ? 'active_order' : 'post_job'] || {}).limit,
        used: (gate[gate.blocked_by === 'active_orders' ? 'active_order' : 'post_job'] || {}).used
      }
    }, 409);
  }

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
      /* The account this order belongs to, proved above and never taken on the
         browser's word. The pipeline that pushes paid orders to the network has
         been reading this field since 8 Sep and finding nothing in it; it is
         what puts the job on the account's own Live Load board, and what the
         allowance counts. Null for a one-off customer with no account. */
      posted_by: postedBy,
      direct_username: directUser,
      first_refusal_minutes: FIRST_REFUSAL_MINUTES,
      whatsapp_updates: Boolean(b.whatsapp_updates),
      /* How each end is proved, and who is standing there. The screen has been
         asking for these contacts since it was built and nothing was reading
         them, so "someone will be available" had no answer anywhere. A mode of
         'coded' without a mobile is downgraded on the network side, not here —
         one place decides it, and it is the place that has to keep the promise. */
      handover: {
        collect: {
          mode: b.collect_mode === 'coded' ? 'coded' : 'named',
          contact: String(b.collect_contact || '').trim() || null,
          phone: String(b.collect_contact_phone || '').trim() || null
        },
        deliver: {
          mode: b.deliver_mode === 'coded' ? 'coded' : 'named',
          contact: String(b.deliver_contact || '').trim() || null,
          phone: String(b.deliver_contact_phone || '').trim() || null
        }
      }
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
    // Where HAF PAY sends them once the card has gone through.
    next_url: jobPage(request, token),
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
    track_url: jobPage(request, token)
  });
}

/* ── HOW MUCH OF IT YOU MAY USE, ASKED BEFORE THE CARD ──────────────────────
   Brent, 10 Sep: the dashboard is open to everyone and the account level only
   limits HOW MUCH of it gets used.

   The network already refuses to take a job past a level's allowance. But the
   network only ever sees a job AFTER the holding deposit is paid, so a refusal
   there is a refund, not an answer. This is the same question asked one step
   earlier — at the button, before a penny moves.

   The number the network cannot know
   ----------------------------------
   An order exists in haf-core from the moment it is placed and only reaches the
   network once it is paid for. So the network's own count of "posted today" is
   blind to every order still in flight. This worker is the only thing that can
   see both sides, so it counts the in-flight ones here and hands that figure to
   the network — which still makes the decision. One rule, in one place, asked
   with a complete number instead of half of one.

   Statuses: 'new' is placed and unpaid, 'deposit_held' is paid and not yet
   pushed. 'on_network' and everything after it is already in the network's own
   count, and 'cancelled' and 'refunded' are not work anybody is doing. */
async function pendingFor(env, postedBy) {
  if (!postedBy) return { posts_today: 0, active_orders: 0 };
  const mine = 'quote_detail->>posted_by=eq.' + encodeURIComponent(postedBy)
             + '&status=in.(new,deposit_held)';
  const [postsToday, activeOrders] = await Promise.all([
    coreCount(env, 'job_order', mine + '&created_at=gte.' + encodeURIComponent(dayStart())),
    coreCount(env, 'job_order', mine)
  ]);
  return { posts_today: postsToday, active_orders: activeOrders };
}

/* "Your allowance resets at midnight" is a sentence the customer reads, so
   midnight has to mean midnight where they are. The network counts its own half
   from London midnight for the same reason; both halves of one number cannot be
   measured from two different times. Returned as an instant, so British Summer
   Time is handled by the clock rather than by an offset written down here. */
/* London's clock, as numbers. hourCycle: 'h23' and not hour12: false — with
   hour12: false several locales report midnight as hour "24" instead of "00",
   which is enough on its own to put a day's allowance a day out. */
function londonParts(instant) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(instant).reduce((a, p) => (a[p.type] = p.value, a), {});
}

/* How far ahead of UTC London is at a given instant, in milliseconds. */
function londonOffsetMs(instant) {
  const p = londonParts(instant);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
       - Math.floor(instant.getTime() / 1000) * 1000;
}

function dayStart(now = new Date()) {
  const p = londonParts(now);
  /* Midnight on London's calendar date, read as if London were UTC, then pulled
     back by London's real offset.
     NOT "subtract however far into the day we are" — that was the first version
     and it is wrong on the two Sundays a year when the day is 23 or 25 hours
     long. On 29 March 2026 it put the start of the day an hour into the day
     before, which would have handed a Free account a sixth post. Applying the
     offset twice settles the clocks-change morning: the first pass lands near
     the right instant, the second reads the offset that actually applies there. */
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day);
  const near = asIfUtc - londonOffsetMs(new Date(asIfUtc));
  return new Date(asIfUtc - londonOffsetMs(new Date(near))).toISOString();
}

/* The network's answer, with the in-flight orders included. Asked with the
   credential the browser already holds — the same one the sign-in screen took —
   so the order door can never be a softer door than the front one.

   If this call fails we do NOT refuse the order. A limit that turns into an
   outage when a database blinks costs Brent a delivery to save him nothing; the
   network's own check is still there behind it and will catch a genuine
   overrun before any job reaches a driver. */
async function askTheDoor(env, body, postedBy) {
  if (!postedBy) return null;
  try {
    const pending = await pendingFor(env, postedBy);
    const r = await fetch(`${PLNA_URL}/rest/v1/rpc/haf_order_door`, {
      method: 'POST',
      headers: { apikey: PLNA_KEY, authorization: `Bearer ${PLNA_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        p_username: postedBy,
        p_hash: body.hash || null,
        p_relay: body.relay || null,
        p_cp: body.cp || null,
        p_pending: pending
      })
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return d && !d.error ? d : null;
  } catch (_) {
    return null;
  }
}

/* WHAT HAVE I USED TODAY.
   The screen must show the SAME number the door will decide on. The database
   alone cannot answer that — it cannot see an order that has not been paid for
   yet — so a page asking the database directly would show "0 of 5" to somebody
   the door is about to refuse. Which is worse than showing nothing: it is a
   promise the next press breaks.

   So the page asks here instead, and here asks the same question /place asks,
   through the same function, with the same in-flight count. One number.

   ONE SIGN-IN CHECK, NOT TWO
   --------------------------
   This used to call knect_auth first and then the order door, and the order
   door starts by checking the very same credential itself (plna_cred_kind —
   which is why it is safe for a browser to call at all). So the account was
   proved twice, one after the other, and the customer waited through both. A
   person opening the booking form sat looking at nothing for up to four
   seconds.

   The username now comes straight off the request and the door does the
   proving, exactly as it does for /place. A wrong credential gets the same
   answer it always did — the row is simply not shown — because askTheDoor
   returns nothing when the door answers 'auth'. Nothing about anybody's plan
   is returned without their own credential.

   The one thing asked before the databases are touched: some credential has to
   be present. A body with no PIN and no password hash cannot possibly be
   signed in, so it is answered here rather than costing three lookups. */
async function allowance(request, env) {
  if (!coreReady(env)) return bad('ordering is not switched on yet on this site', 503);
  const b = await request.json().catch(() => ({}));
  const postedBy = String(b.username || '').trim().toUpperCase();
  const hasCred = Boolean(b.hash || b.relay || b.cp);
  if (!postedBy || !hasCred) return json({ ok: true, signed_in: false, counted: false });
  const gate = await askTheDoor(env, b, postedBy);
  if (!gate) return json({ ok: true, signed_in: true, counted: false });
  return json({
    ok: true, signed_in: true,
    counted: gate.counted === true,
    level: gate.level, label: gate.label,
    allowances: gate.allowances, usage: gate.usage,
    /* The usage above is what has reached the network. These two are the totals
       the door actually judges — network plus in flight — which is what the
       person needs to read. */
    used: {
      posts_today: (gate.post_job || {}).used,
      active_orders: (gate.active_order || {}).used
    },
    allowed: gate.allowed, blocked_by: gate.blocked_by, message: gate.message
  });
}

/* HAF PAY owns the card page. This project holds no Stripe key and draws no
   payment screen — it only knows the address of the one that does. */
function payBase(env) {
  return (env.PAY_BASE || 'https://join.usehaf.co.uk').replace(/\/+$/, '');
}

/* The job page is OURS, and it is deliberately built from the address the
   customer is actually on rather than a constant. An order placed on a preview
   hands back a preview link, and one placed on the live site hands back a live
   one — so a test order can never send somebody to production, and a real order
   can never send somebody to a preview that will be deleted next week.

   It is not on HAF PAY because HAF PAY cannot take another page: its worker is
   uploaded inline and cannot pass 20,000 characters, and it is at 19,287. */
function jobPage(request, token) {
  return `${new URL(request.url).origin}/job/${token}`;
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

  /* The deposit link is only handed over while the deposit is genuinely the
     next thing that has to happen. Once the money is in, the link is not just
     redundant — it is the way somebody pays for the same delivery twice. */
  const payUrl = row.status === 'new' && row.deposit_reference
    ? `${payBase(env)}/pay/${row.deposit_reference}`
    : null;
  // The reference was only needed to build that link; it does not go to the page.
  delete row.deposit_reference;
  return json({ ok: true, order: row, pay_url: payUrl });
}
