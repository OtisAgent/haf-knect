/* HAF KNECT — THE PRIVATE ORDER, server side.

   Brent's own door. He types a job and a price, and in one press it becomes:
   a numbered HAF invoice, a payment link he can send, and a job sitting on one
   named driver's board and nobody else's.

   Routes
     POST /post    raise the whole thing — order, invoice, payment link, driver
     POST /mine    the private jobs he has raised, newest first
     POST /cancel  pull a private job back off the driver's board

   THE ORDER OF OPERATIONS IS THE SAFETY
   -------------------------------------
   Clearance is checked BEFORE anything is written, because the network's ingest
   posts to everyone when the named driver cannot work, and on this path that is
   the one outcome that must never happen. Then the money rows are written, and
   the network is asked LAST — so a failure half way leaves an invoice with no
   job (which Brent can see and cancel) rather than a job on a board with no
   invoice (which a driver would start driving to).

   And after the network answers, the answer is READ. If it handed the job to
   everyone anyway, the row is pulled back in the same request and the whole
   thing is reported as failed. A 200 from a function is not the same as the
   function having done what you asked. */

import {
  json, bad, coreReady, coreInsert, coreUpdate, coreSelect,
  logEvent, newJobReference, newTrackToken, newPaymentReference,
  postcodeExists
} from '../../../shared/order-core.js';
import { whoIsAsking, payUrl } from '../../../shared/payments-core.js';
import {
  readPrivateOrder, isPrivateOwner, hafInvoiceNumber, isHafInvoiceNumber,
  isPrivateMode, dueDate, DEFAULT_TERMS_DAYS, VAT_PCT
} from '../../../shared/private-core.js';

const PLNA_URL = 'https://ggkpqqrtxtlafdkxcaqg.supabase.co';

export async function onRequest(context) {
  const { request, env, params } = context;
  const route = (params.path || []).join('/');
  if (request.method === 'OPTIONS') return json({ ok: true });
  try {
    switch (`${request.method} /${route}`) {
      case 'POST /post':   return await post(request, env);
      case 'POST /mine':   return await mine(request, env);
      case 'POST /cancel': return await cancel(request, env);
      default:             return bad('unknown endpoint', 404);
    }
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 500);
  }
}

/* ── THE DOOR ──
   Two locks, and they are different locks on purpose. The first proves the
   person is who they say (the same call the sign-in screen makes). The second
   proves they are allowed to raise a private order at all. A signed-in member
   passing the first and failing the second is told plainly; there is nothing
   secret about the existence of this screen, only about the use of it. */
async function master(request, env) {
  if (!coreReady(env)) return { error: bad('private orders are not switched on yet on this site', 503) };
  if (!env.PLNA_SERVICE_KEY) {
    /* Fail closed and say why. Without this key clearance cannot be checked,
       and posting a private job without checking clearance is exactly the bug
       this whole file is shaped to avoid. */
    return { error: bad('private orders are not switched on yet on this site', 503) };
  }
  const body = await request.json().catch(() => ({}));
  const acc = await whoIsAsking(body);
  if (!acc) return { error: bad('please sign in again', 401) };
  if (!isPrivateOwner(env, acc.haf_username)) {
    return { error: bad('this account cannot raise private orders', 403) };
  }
  return { acc, body };
}

/* ── THE NETWORK, reached with the server-only key ──
   The anon key the dashboard already ships can execute the ingest, but it
   cannot ask whether a driver is cleared. Using it here would mean posting
   first and finding out afterwards, which is the wrong way round. */
function plnaHeaders(env) {
  return {
    apikey: env.PLNA_SERVICE_KEY,
    authorization: `Bearer ${env.PLNA_SERVICE_KEY}`,
    'content-type': 'application/json'
  };
}

async function plnaRpc(env, fn, args) {
  const r = await fetch(`${PLNA_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: plnaHeaders(env), body: JSON.stringify(args)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`network call failed (${r.status}): ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

/* Pull a handover row off every board. Used when the network was kind to a
   private job, and when Brent cancels one. */
async function pullBack(env, jobRef, why) {
  const r = await fetch(
    `${PLNA_URL}/rest/v1/plna_knect_handover?haf_job_ref=eq.${encodeURIComponent(jobRef)}&status=eq.queued`,
    {
      method: 'PATCH',
      headers: { ...plnaHeaders(env), prefer: 'return=representation' },
      body: JSON.stringify({ status: 'cancelled', notes: why })
    }
  );
  if (!r.ok) return { ok: false, detail: await r.text() };
  const rows = await r.json().catch(() => []);
  return { ok: true, pulled: Array.isArray(rows) ? rows.length : 0 };
}

/* ═══════════════════════════════════════════════════════════════════════════
   POST /post
   ═══════════════════════════════════════════════════════════════════════════ */
async function post(request, env) {
  const gate = await master(request, env);
  if (gate.error) return gate.error;
  const { acc, body } = gate;

  const read = readPrivateOrder(body);
  if (!read.ok) return bad(read.error);
  const o = read.order;

  /* Both ends must be a postcode that exists, not merely one that is shaped
     like one. Silent when the lookup service is unreachable: a third party
     being down must not stop Brent raising a job, and the shape test and the
     network's own gate both still stand. */
  for (const [end, pc] of [['collection', o.collect], ['delivery', o.deliver]]) {
    if ((await postcodeExists(pc)) === false) {
      return bad(`There is no such ${end} postcode as ${pc}.`);
    }
  }

  /* ── CLEARANCE FIRST ── */
  let cleared;
  try {
    cleared = await plnaRpc(env, 'plna_is_cleared', { p_username: o.driver });
  } catch (err) {
    return json({ ok: false, error: `could not check the driver on the network: ${err.message}` }, 502);
  }
  if (cleared !== true) {
    return bad(
      `${o.driver} is not cleared to take network work, so this job has not been raised. ` +
      `Release them in CleverPay first, or send it to another driver.`
    );
  }

  const now = new Date();
  const jobRef = newJobReference(now);
  const token = newTrackToken();
  const priv = isPrivateMode(o.mode);

  /* ── THE ORDER ──
     status 'private' rather than 'new'. The order pipeline that runs every
     half hour picks up 'new' orders and pushes them to the network once a
     deposit clears; a private job has already been pushed by this request and
     must never be pushed a second time. */
  await coreInsert(env, 'job_order', {
    job_ref: jobRef,
    account_ref: null,
    haf_username: acc.haf_username,
    customer_name: o.customer,
    customer_email: o.email,
    /* These four are NOT NULL on the table because the public order journey
       always has them. A private order does not always: Brent may be invoicing
       a company he already deals with, sending it to a driver whose van he
       knows. So they are stored empty or as 'unspecified' rather than being
       invented — an empty phone number is honest, a made-up one is a lie that
       somebody will eventually ring. */
    customer_phone: o.customer_phone || '',
    company: o.company,
    collect_postcode: o.collect, collect_address: o.collect_address,
    deliver_postcode: o.deliver, deliver_address: o.deliver_address,
    collect_on: o.collect_on || null,
    collect_window: o.collect_window,
    goods: o.goods,
    notes: o.notes,
    vehicle_code: o.vehicle_code || 'unspecified',
    job_type_code: 'private',
    quote_ex_vat_pence: o.quote_ex_vat_pence,
    vat_pence: o.vat_pence,
    total_pence: o.total_pence,
    deposit_pence: 0,
    balance_pence: o.total_pence,
    quote_detail: {
      source: 'knect_private_order',
      priced_by: 'typed_by_owner',
      posted_by: acc.haf_username,
      private: priv,
      mode: o.mode,
      window_minutes: o.window_minutes,
      direct_username: o.driver,
      driver_pay_pence: o.driver_pay_pence,
      haf_margin_pence: o.haf_margin_pence,
      vat_pct: VAT_PCT
    },
    status: 'private',
    track_token: token
  });

  /* ── THE PAYMENT ──
     purpose 'invoice', so the customer's payments screen files it under
     Invoices rather than pretending it is a job deposit. This row is what
     makes /pay/<reference> a real page: card or bank transfer, HAF PAY's own. */
  const payment = await coreInsert(env, 'job_payment', {
    job_ref: jobRef,
    /* account_ref is NOT NULL and normally holds the join_signup id of the
       account that ordered. A private order has no signup — Brent is invoicing
       somebody who may never have a HAF login — so the payment belongs to the
       job itself. Credit terms look up this handle and simply find none, which
       is the correct answer for a customer with no account. */
    account_ref: jobRef,
    account_type: 'customer',
    customer_email: o.email,
    customer_name: o.customer,
    amount_pence: o.total_pence,
    payment_reference: newPaymentReference(),
    purpose: 'invoice',
    plan_name: `HAF delivery — ${jobRef}`,
    status: 'awaiting_payment'
  });
  await coreUpdate(env, 'job_order', `job_ref=eq.${jobRef}`, { balance_reference: payment.payment_reference });

  /* ── THE INVOICE ──
     Written on the HAF books now, with a number that carries no running order.
     xero_invoice_id stays null until the sync job carries it across; that null
     IS the worklist, so an invoice cannot be quietly forgotten by Xero. */
  const invoiceNumber = hafInvoiceNumber(now);
  if (!isHafInvoiceNumber(invoiceNumber)) {
    return json({ ok: false, error: 'invoice number failed its own shape check' }, 500);
  }
  const invoice = await coreInsert(env, 'account_invoice', {
    invoice_number: invoiceNumber,
    contact_name: o.company || o.customer,
    haf_username: acc.haf_username,
    customer_email: o.email,
    issued_on: now.toISOString().slice(0, 10),
    due_on: dueDate(now, body.terms_days || DEFAULT_TERMS_DAYS),
    total_pence: o.total_pence,
    amount_due_pence: o.total_pence,
    currency: 'GBP',
    status: 'open',
    payment_reference: payment.payment_reference,
    xero_invoice_id: null
  });

  /* ── THE NETWORK, LAST ──
     p_direct_minutes carries the whole "private or not" decision. For a
     private job it is a hundred years, so the branch where the window lapses
     and the job opens is never reached. */
  let ingest;
  try {
    ingest = await plnaRpc(env, 'plna_ingest_haf_order', {
      p_job_ref: jobRef,
      p_from_postcode: o.collect,
      p_to_postcode: o.deliver,
      p_customer_first: o.customer.split(/\s+/)[0],
      p_customer_last: o.customer.split(/\s+/).slice(1).join(' ') || null,
      p_customer_phone: o.customer_phone,
      p_preferred_date: o.collect_on,
      p_notes: o.notes,
      p_direct_username: o.driver,
      p_direct_minutes: o.window_minutes,
      p_is_test: o.is_test,
      p_vehicle_code: o.vehicle_code,
      p_collect_address: o.collect_address,
      p_deliver_address: o.deliver_address,
      p_collect_window: o.collect_window,
      p_job_type: 'private',
      p_driver_pay_pence: o.driver_pay_pence,
      p_posted_by: acc.haf_username
    });
  } catch (err) {
    await coreUpdate(env, 'job_order', `job_ref=eq.${jobRef}`, { status: 'private_failed' });
    return json({
      ok: false,
      error: `The invoice was raised but the job did not reach the driver: ${err.message}`,
      job_ref: jobRef, invoice_number: invoiceNumber
    }, 502);
  }

  /* ── READ THE ANSWER, DO NOT ASSUME IT ──
     The ingest drops the named driver and posts to the whole network when it
     cannot honour them. Clearance was checked a moment ago, so this should be
     unreachable — which is exactly the kind of branch that turns out to be
     reachable. If a private job lost its driver, it comes straight back off
     every board and the request fails. */
  if (priv && ingest && !ingest.direct_username) {
    const back = await pullBack(env, jobRef, 'private order withdrawn: the network could not hold it to one driver');
    await coreUpdate(env, 'job_order', `job_ref=eq.${jobRef}`, { status: 'private_failed' });
    return json({
      ok: false,
      error: 'This job could not be held to one driver, so it has been withdrawn rather than left on the open network.',
      detail: ingest.note || null,
      pulled_back: back.pulled ?? 0,
      job_ref: jobRef, invoice_number: invoiceNumber
    }, 409);
  }

  await logEvent(env, {
    job_ref: jobRef,
    payment_reference: payment.payment_reference,
    event: 'private_order_raised',
    detail: {
      invoice_number: invoiceNumber,
      total_pence: o.total_pence,
      driver_pay_pence: o.driver_pay_pence,
      haf_margin_pence: o.haf_margin_pence,
      driver: o.driver,
      mode: o.mode,
      is_test: o.is_test
    },
    actor: acc.haf_username
  });

  return json({
    ok: true,
    job_ref: jobRef,
    invoice_number: invoiceNumber,
    invoice_id: invoice.id,
    pay_url: payUrl(env, payment.payment_reference),
    payment_reference: payment.payment_reference,
    driver: o.driver,
    private: priv,
    opens_to_network_in_minutes: priv ? null : o.window_minutes,
    total_pence: o.total_pence,
    driver_pay_pence: o.driver_pay_pence,
    haf_margin_pence: o.haf_margin_pence,
    due_on: invoice.due_on,
    is_test: o.is_test
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   POST /mine — the little CRM of what he has raised
   ═══════════════════════════════════════════════════════════════════════════ */
async function mine(request, env) {
  const gate = await master(request, env);
  if (gate.error) return gate.error;
  const { acc } = gate;

  const orders = await coreSelect(env, 'job_order',
    `haf_username=eq.${encodeURIComponent(String(acc.haf_username).toUpperCase())}` +
    `&status=in.(private,private_failed,claimed,completed)` +
    `&select=job_ref,customer_name,company,collect_postcode,deliver_postcode,collect_on,goods,` +
    `total_pence,status,quote_detail,balance_reference,driver_name,created_at` +
    `&order=created_at.desc&limit=100`
  );

  /* The invoice and the payment are looked up per job rather than joined,
     because PostgREST will not join across a filter this shape and a wrong
     join is worse than two reads. */
  const refs = orders.map((o) => o.balance_reference).filter(Boolean);
  const payments = refs.length
    ? await coreSelect(env, 'job_payment',
        `payment_reference=in.(${refs.map((r) => `"${r}"`).join(',')})` +
        `&select=payment_reference,status,paid_at,amount_pence`)
    : [];
  const invoices = refs.length
    ? await coreSelect(env, 'account_invoice',
        `payment_reference=in.(${refs.map((r) => `"${r}"`).join(',')})` +
        `&select=invoice_number,payment_reference,due_on,status,xero_invoice_id`)
    : [];

  const payBy = new Map(payments.map((p) => [p.payment_reference, p]));
  const invBy = new Map(invoices.map((i) => [i.payment_reference, i]));

  return json({
    ok: true,
    jobs: orders.map((o) => {
      const p = payBy.get(o.balance_reference) || null;
      const i = invBy.get(o.balance_reference) || null;
      const d = o.quote_detail || {};
      return {
        job_ref: o.job_ref,
        customer: o.company || o.customer_name,
        route: `${o.collect_postcode} → ${o.deliver_postcode}`,
        collect_on: o.collect_on,
        goods: o.goods,
        driver: d.direct_username || null,
        driver_pay_pence: d.driver_pay_pence ?? null,
        margin_pence: d.haf_margin_pence ?? null,
        private: d.private !== false,
        total_pence: o.total_pence,
        status: o.status,
        invoice_number: i ? i.invoice_number : null,
        due_on: i ? i.due_on : null,
        in_xero: Boolean(i && i.xero_invoice_id),
        paid: Boolean(p && p.status === 'paid'),
        paid_at: p ? p.paid_at : null,
        pay_url: o.balance_reference ? payUrl(env, o.balance_reference) : null,
        raised_at: o.created_at
      };
    })
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   POST /cancel — take it back off the driver's board
   ═══════════════════════════════════════════════════════════════════════════ */
async function cancel(request, env) {
  const gate = await master(request, env);
  if (gate.error) return gate.error;
  const { acc, body } = gate;

  const jobRef = String(body.job_ref || '').trim().toUpperCase();
  if (!jobRef) return bad('which job?');

  const [order] = await coreSelect(env, 'job_order',
    `job_ref=eq.${encodeURIComponent(jobRef)}&select=job_ref,status,haf_username,balance_reference`);
  if (!order) return bad('no such job', 404);
  if (String(order.haf_username || '').toUpperCase() !== String(acc.haf_username).toUpperCase()) {
    return bad('that is not your job', 403);
  }
  if (order.status === 'claimed' || order.status === 'completed') {
    return bad('a driver has already taken this job — speak to them before cancelling it', 409);
  }

  const back = await pullBack(env, jobRef, `withdrawn by ${acc.haf_username}`);
  await coreUpdate(env, 'job_order', `job_ref=eq.${jobRef}`, { status: 'cancelled' });

  /* The invoice is voided rather than deleted. A raised invoice that vanishes
     is a hole in a numbered series, and HMRC asks for the series to be
     complete — a cancelled number must stay visible as cancelled. */
  if (order.balance_reference) {
    await coreUpdate(env, 'account_invoice', `payment_reference=eq.${order.balance_reference}`,
      { status: 'voided', amount_due_pence: 0 });
    await coreUpdate(env, 'job_payment',
      `payment_reference=eq.${order.balance_reference}&status=eq.awaiting_payment`,
      { status: 'cancelled' });
  }

  await logEvent(env, {
    job_ref: jobRef, event: 'private_order_cancelled',
    detail: { pulled_off_boards: back.pulled ?? 0 }, actor: acc.haf_username
  });

  return json({ ok: true, job_ref: jobRef, pulled_off_boards: back.pulled ?? 0 });
}
