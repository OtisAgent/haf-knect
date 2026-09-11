/* HAF QUOTE LOG — every guide price worked out on this site, remembered.

   Brent, 11 Sep 2026: "we could be missing leads as people are entering and I
   don't know how many guided quote requests" ... "so we can see what quotes
   have been started but not gone all the way through" ... "build out a CRM
   ledger for the basic information and allow me to click in and see whats been
   requested".

   Until now a member of the public could work a price out on this page, decide
   not to book, and leave nothing behind. The order journey only ever wrote a
   record at the moment somebody paid a deposit, so every person who stopped
   one step short was invisible — and those are exactly the ones worth ringing.

   THREE ROUTES, AND WHY THEY ARE THREE
   ------------------------------------
     POST /view    A price was worked out. NOBODY IS NAMED. The route, the van
                   and the price are kept; nothing about the person is, not even
                   an IP address. This is the honest answer to "how many", and
                   it needs no consent because it is not personal data.

     POST /start   Somebody typed their details in. Now there is a person, so
                   now there is a lead — and now the marketing question has to
                   be asked properly, with the exact words recorded beside the
                   answer.

     POST /ledger  What Brent reads. Master account only, checked on the server.

   THE BROWSER NEVER NAMES ITS OWN PRICE. Both writing routes re-price from the
   postcodes here, exactly as the order journey does, so the figure on the
   record is one HAF stands behind rather than one a page happened to post.  */

import { json, bad, coreReady, coreRpc, milesBetween, postcodeShape } from '../../../shared/order-core.js';
import { quoteOneOff } from '../../../shared/order-quote.js';
import { whoIsAsking } from '../../../shared/payments-core.js';

/* The engine answers in PENCE; jobs.quote holds POUNDS (KN-10008 is 66.66, not
   6666). Getting this backwards would put a hundredfold price in front of Brent
   on a screen whose whole purpose is deciding who to ring back. */
const pounds = (pence) =>
  Number.isFinite(Number(pence)) ? Math.round(Number(pence)) / 100 : null;

/* The order screen's short van keys on the left, the network's own vehicle
   codes on the right. A NAME map: no price crosses it. */
const VEHICLE_DB = {
  small: 'small_van', swb: 'swb_van', mwb: 'mwb_van', lwb: 'lwb_van',
  xlwb: 'xlwb_van', luton: 'luton', lutonc: 'luton_curtain_side',
  lutontl: 'luton_tail_lift'
};

/* ── THE WORDS, AND THE VERSION OF THE WORDS ───────────────────────────────
   The tick box on every quote form says exactly this. It lives here, on the
   server, for one reason: the wording that was shown has to be stored with the
   answer, and a wording read off the page the customer was looking at is gone
   the next time somebody edits that page. Change the sentence, change the
   version — never one without the other, or the record stops being proof.

   It is one sentence and it does one thing. It does not bundle the quote, the
   terms or anything else into the same tick: a tick that buys two agreements at
   once is not freely given for either of them.                               */
export const CONSENT = {
  version: 'v1-2026-09-11',
  wording: 'Yes — email me HAF delivery offers, rates and news. ' +
           'This is separate from your quote, and you can unsubscribe in one click at any time.'
};

export async function onRequest(context) {
  const { request, env, params } = context;
  const route = (params.path || []).join('/');
  if (request.method === 'OPTIONS') return json({ ok: true });
  try {
    switch (`${request.method} /${route}`) {
      case 'GET /consent':  return json({ ok: true, ...CONSENT });
      case 'POST /view':    return await priceView(request, env);
      case 'POST /start':   return await startQuote(request, env);
      case 'POST /ledger':  return await ledger(request, env);
      default:              return bad('unknown endpoint', 404);
    }
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 500);
  }
}

/* Price it here, from the postcodes, the same way the order journey does. */
async function repriceFrom(b) {
  const collect = postcodeShape(b.collect_postcode);
  const deliver = postcodeShape(b.deliver_postcode);
  if (!collect || !deliver) return null;
  const leg = await milesBetween(collect, deliver);
  if (!leg) return null;
  const q = quoteOneOff({
    miles: leg.miles, minutes: leg.minutes,
    vehicleCode: b.vehicle_code, jobTypeCode: b.job_type_code
  });
  if (!q) return null;
  return { collect, deliver, leg, q };
}

/* ── A PRICE WAS WORKED OUT, BY SOMEBODY WE CANNOT NAME ───────────────────
   The session token is made by the browser and means nothing anywhere else.
   It exists so one person trying four vans on one route is one look-up rather
   than four, and it identifies nobody — which is the whole point: we get the
   count Brent asked for without collecting a thing we would have to justify. */
async function priceView(request, env) {
  if (!coreReady(env)) return json({ ok: true, logged: false, reason: 'log not switched on' });
  const b = await request.json().catch(() => ({}));
  const priced = await repriceFrom(b);
  /* A look-up we cannot price is not a lead and not a number — say so plainly
     rather than writing a row with a hole in it. */
  if (!priced) return json({ ok: true, logged: false, reason: 'not priceable' });

  const { collect, deliver, leg, q } = priced;
  const r = await coreRpc(env, 'record_price_view', {
    p: {
      collect_postcode: collect,
      deliver_postcode: deliver,
      distance_miles: leg.miles,
      vehicle_type: VEHICLE_DB[b.vehicle_code] || null,
      service_level: b.job_type_code || null,
      price_customer: pounds(q.quote_ex_vat_pence),
      source: String(b.source || 'knect_price_calculator').slice(0, 60),
      session: String(b.session || '').slice(0, 64),
      pricing_snapshot: q
    }
  }).catch(() => null);

  return json({ ok: true, logged: Boolean(r && r.ok) });
}

/* ── SOMEBODY TYPED THEIR DETAILS IN ──────────────────────────────────────── */
async function startQuote(request, env) {
  if (!coreReady(env)) return bad('the quote log is not switched on yet on this site', 503);
  const b = await request.json().catch(() => ({}));

  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) {
    return bad('that email address does not look right');
  }

  /* An opt-in is only ever recorded from the tick itself, and the wording is
     taken from THIS file — never from the request. Otherwise anything posting
     at this address could invent both the consent and the sentence that is
     supposed to prove it. */
  const optIn = b.marketing_opt_in === true;

  const priced = await repriceFrom(b);

  const r = await coreRpc(env, 'record_quote_request', {
    p: {
      email,
      name: String(b.name || '').slice(0, 120),
      phone: String(b.phone || '').slice(0, 40),
      source: String(b.source || 'knect_quote_form').slice(0, 60),
      collect_postcode: priced ? priced.collect : (postcodeShape(b.collect_postcode) || null),
      deliver_postcode: priced ? priced.deliver : (postcodeShape(b.deliver_postcode) || null),
      distance_miles: priced ? priced.leg.miles : null,
      vehicle_type: VEHICLE_DB[b.vehicle_code] || null,
      service_level: b.job_type_code || null,
      price_customer: priced ? pounds(priced.q.quote_ex_vat_pence) : null,
      detail: String(b.detail || b.goods || '').slice(0, 2000),
      stage: String(b.stage || 'details').slice(0, 20),
      furthest_step: b.furthest_step ?? null,
      step_label: String(b.step_label || '').slice(0, 80),
      marketing_opt_in: optIn,
      consent_wording: optIn ? CONSENT.wording : null,
      consent_version: CONSENT.version,
      evidence: {
        page: String(b.page || '').slice(0, 200),
        asked_at: new Date().toISOString(),
        /* Cloudflare's own country header. A country is not an identifier and
           it is the one thing that actually matters later: it says which
           privacy rules the person was standing under when they ticked it. */
        country: request.headers.get('cf-ipcountry') || null
      },
      pricing_snapshot: priced ? priced.q : {},
      meta: { when: String(b.when || '').slice(0, 60) }
    }
  });

  return json({
    ok: true,
    reference: r && r.reference ? r.reference : null,
    marketing_opt_in: optIn
  });
}

/* ── THE LEDGER ───────────────────────────────────────────────────────────
   Master account only, decided on the server against the sign-in the browser
   presented. The page already hides this tab from everybody else; that is a
   convenience, not a lock, and a lock that only exists in the page it is
   protecting is not a lock at all. */
async function ledger(request, env) {
  if (!coreReady(env)) return bad('the quote log is not switched on yet on this site', 503);
  const b = await request.json().catch(() => ({}));
  const acc = await whoIsAsking(b);
  if (!acc) return bad('please sign in again', 401);
  if (acc.is_master !== true) return bad('the quote ledger is the master account only', 403);

  const r = await coreRpc(env, 'quote_ledger', {
    p: {
      filter: String(b.filter || 'all').slice(0, 20),
      limit: String(b.limit || 100).slice(0, 5),
      enquiry_id: String(b.enquiry_id || '').slice(0, 40)
    }
  });
  return json(r);
}
