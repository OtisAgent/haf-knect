/* HAF KNECT — THE PAYMENTS SECTION, server side.

   What a signed-in account owes, what it has paid, and the one press that takes
   it to HAF PAY. Every route proves who is asking before it reads or writes a
   single row: the pay schema is reached with the service key and that key never
   leaves this side.

   Routes
     POST /mine      what this account owes and has paid, grouped by type
     POST /raise     raise the balance payment on a finished job, so it can be paid
     POST /declare   "I have sent the bank transfer" — records it against the reference
     POST /awaiting  every transfer the network is still waiting on (master only)

   What this does NOT do: take money. HAF PAY owns the card page and the bank
   details, and a transfer is only ever marked as received by a named person or
   by the reconcile job reading it off the books — never by the customer saying
   so. Declaring a transfer tells the team to look; it does not clear anything. */

import { json, bad, coreReady, coreSelect, coreInsert, coreUpdate, newPaymentReference } from '../../../shared/order-core.js';
import { whoIsAsking, ownerFilter, ownsRow, typeOf, payUrl, PAYMENT_TYPES } from '../../../shared/payments-core.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const route = (params.path || []).join('/');
  if (request.method === 'OPTIONS') return json({ ok: true });
  try {
    switch (`${request.method} /${route}`) {
      case 'GET /types':     return json({ ok: true, types: PAYMENT_TYPES });
      case 'POST /mine':     return await mine(request, env);
      case 'POST /raise':    return await raise(request, env);
      case 'POST /bank':     return await bank(request, env);
      case 'POST /declare':  return await declare(request, env);
      case 'POST /awaiting': return await awaiting(request, env);
      default:               return bad('unknown endpoint', 404);
    }
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 500);
  }
}

/* Every route starts the same way and there is only one copy of it. */
async function signedIn(request, env) {
  if (!coreReady(env)) return { error: bad('payments are not switched on yet on this site', 503) };
  const body = await request.json().catch(() => ({}));
  const acc = await whoIsAsking(body);
  if (!acc) return { error: bad('please sign in again', 401) };
  return { acc, body };
}

const isOpen = (s) => s === 'awaiting_payment';

/* ── WHAT I OWE ───────────────────────────────────────────────────────────── */
async function mine(request, env) {
  const { acc, error } = await signedIn(request, env);
  if (error) return error;

  const owner = ownerFilter(acc);
  const [payments, invoices, orders] = await Promise.all([
    coreSelect(env, 'job_payment',
      'select=payment_reference,job_ref,amount_pence,status,method,purpose,plan_name,billing,seats,paid_at,created_at,haf_username,customer_email'
      + `&${owner}&order=created_at.desc&limit=200`).catch(() => []),
    coreSelect(env, 'account_invoice',
      'select=invoice_number,contact_name,issued_on,due_on,total_pence,amount_due_pence,status,payment_reference,haf_username,customer_email'
      + `&${owner}&order=issued_on.desc&limit=200`).catch(() => []),
    coreSelect(env, 'job_order',
      'select=job_ref,collect_postcode,deliver_postcode,goods,status,total_pence,deposit_pence,balance_pence,completed_at,balance_reference,haf_username,customer_email'
      + `&${owner}&order=created_at.desc&limit=200`).catch(() => [])
  ]);

  const byRef = {};
  for (const o of orders) byRef[o.job_ref] = o;

  /* One shape for every line on the screen, wherever it came from, so the page
     draws one row type and cannot render a payment and an invoice differently
     by accident. */
  const line = (r) => {
    const o = r.job_ref ? byRef[r.job_ref] : null;
    return {
      reference: r.payment_reference,
      type: typeOf(r.purpose),
      what: r.plan_name || describe(r, o),
      job_ref: r.job_ref || null,
      route: o ? `${o.collect_postcode} to ${o.deliver_postcode}` : null,
      amount_pence: r.amount_pence,
      status: r.status,
      method: r.method || null,
      paid_at: r.paid_at || null,
      raised_at: r.created_at,
      pay_url: isOpen(r.status) && r.payment_reference ? payUrl(env, r.payment_reference) : null
    };
  };

  const invLine = (v) => ({
    reference: v.payment_reference || v.invoice_number,
    type: 'invoice',
    what: `Invoice ${v.invoice_number}`,
    job_ref: null,
    route: null,
    amount_pence: v.amount_due_pence > 0 ? v.amount_due_pence : v.total_pence,
    status: v.amount_due_pence > 0 ? 'awaiting_payment' : 'paid',
    method: null,
    paid_at: null,
    raised_at: v.issued_on,
    due_on: v.due_on || null,
    /* An invoice can only be paid here once it has been given a payment
       reference. Until the reconcile job does that, the customer is told to
       use the details on the invoice rather than shown a button to nowhere. */
    pay_url: v.amount_due_pence > 0 && v.payment_reference ? payUrl(env, v.payment_reference) : null
  });

  const all = [...payments.map(line), ...invoices.map(invLine)];

  /* A finished job whose balance was never raised is money owed that nothing
     has a reference for. It is shown, and it carries the press that raises it,
     so it can never sit invisible. */
  const balanceDue = orders
    .filter(o => o.completed_at && Number(o.balance_pence) > 0 && !o.balance_reference)
    .map(o => ({
      reference: null,
      type: 'balance',
      what: `Balance on ${o.job_ref}`,
      job_ref: o.job_ref,
      route: `${o.collect_postcode} to ${o.deliver_postcode}`,
      amount_pence: o.balance_pence,
      status: 'awaiting_payment',
      method: null,
      paid_at: null,
      raised_at: o.completed_at,
      needs_raising: true,
      pay_url: null
    }));

  const lines = [...all, ...balanceDue];
  const open = lines.filter(l => isOpen(l.status));
  const settled = lines.filter(l => !isOpen(l.status));

  return json({
    ok: true,
    account: {
      username: acc.haf_username,
      name: acc.full_name || null,
      account_type: acc.account_type || null,
      is_master: Boolean(acc.is_master)
    },
    /* The CRM sections Brent asked for: one per type of payment, in a fixed
       order, each with what is outstanding under it. A section with nothing in
       it still comes back — an empty "Job balances" is an answer, and it stops
       the screen looking broken when somebody owes nothing. */
    sections: PAYMENT_TYPES.map(t => ({
      ...t,
      lines: open.filter(l => l.type === t.key),
      total_pence: open.filter(l => l.type === t.key).reduce((a, l) => a + Number(l.amount_pence || 0), 0)
    })),
    outstanding_total_pence: open.reduce((a, l) => a + Number(l.amount_pence || 0), 0),
    outstanding_count: open.length,
    history: settled.slice(0, 100)
  });
}

function describe(r, o) {
  const p = typeOf(r.purpose);
  if (p === 'deposit') return `Holding deposit${r.job_ref ? ' — ' + r.job_ref : ''}`;
  if (p === 'balance') return `Balance${r.job_ref ? ' — ' + r.job_ref : ''}`;
  if (p === 'membership') return 'HAF Network membership';
  if (p === 'plan') return 'HAF KNECT plan';
  return o ? `Delivery ${r.job_ref}` : 'HAF payment';
}

/* ── RAISE THE BALANCE ON A FINISHED JOB ──────────────────────────────────
   The amount is the one the server priced when the job was ordered. Nothing
   here reads a figure from the browser. */
async function raise(request, env) {
  const { acc, body, error } = await signedIn(request, env);
  if (error) return error;
  const jobRef = String(body.job_ref || '').trim().toUpperCase();
  if (!jobRef) return bad('which job?');

  const rows = await coreSelect(env, 'job_order',
    'select=job_ref,balance_pence,completed_at,balance_reference,customer_email,customer_name,haf_username'
    + `&job_ref=eq.${encodeURIComponent(jobRef)}&limit=1`);
  const o = rows[0];
  if (!o || !ownsRow(acc, o)) return bad('job not found', 404);
  if (!o.completed_at) return bad('this job is not finished yet, so there is no balance to pay');
  if (!(Number(o.balance_pence) > 0)) return bad('there is no balance left on this job');
  if (o.balance_reference) {
    return json({ ok: true, already: true, reference: o.balance_reference, pay_url: payUrl(env, o.balance_reference) });
  }

  const reference = newPaymentReference();
  await coreInsert(env, 'job_payment', {
    job_ref: o.job_ref,
    haf_username: acc.haf_username,
    account_type: acc.account_type || 'customer',
    customer_email: o.customer_email,
    customer_name: o.customer_name,
    amount_pence: o.balance_pence,
    payment_reference: reference,
    purpose: 'balance',
    plan_name: `Balance — ${o.job_ref}`,
    status: 'awaiting_payment'
  });
  await coreUpdate(env, 'job_order', `job_ref=eq.${encodeURIComponent(o.job_ref)}`, { balance_reference: reference });
  return json({ ok: true, reference, pay_url: payUrl(env, reference) });
}

/* ── WHERE TO SEND A TRANSFER ─────────────────────────────────────────────
   HAF's bank details are not written here. They live on HAF PAY, which is the
   one place they are configured, and this asks it for them — so a change to
   the account HAF banks with reaches this screen without a release, and there
   is no second copy of a sort code to go stale.

   Asked for server side because HAF PAY answers no browser but its own. And
   the row is checked against the person asking first: this endpoint must never
   become a way to look up somebody else's payment. */
async function bank(request, env) {
  const { acc, body, error } = await signedIn(request, env);
  if (error) return error;
  const ref = String(body.payment_reference || '').trim();
  if (!ref) return bad('which payment?');

  const rows = await coreSelect(env, 'job_payment',
    'select=payment_reference,amount_pence,status,haf_username,customer_email'
    + `&payment_reference=eq.${encodeURIComponent(ref)}&limit=1`);
  const p = rows[0];
  if (!p || !ownsRow(acc, p)) return bad('payment not found', 404);

  const base = (env.PAY_BASE || 'https://join.usehaf.co.uk').replace(/\/+$/, '');
  const r = await fetch(`${base}/api/pay/status?ref=${encodeURIComponent(ref)}`);
  const d = await r.json().catch(() => null);
  if (!d || !d.ok) return bad('we could not fetch the transfer details just now — please open the payment page', 502);
  return json({
    ok: true,
    reference: d.payment_reference,
    amount_pence: d.amount_pence,
    status: d.status,
    /* null when HAF PAY says this one cannot be paid by transfer — a renewing
       plan, for instance. The screen must show the card route only, not an
       empty box with a reference nobody can use. */
    bank: d.bank || null,
    pay_url: payUrl(env, ref)
  });
}

/* ── "I HAVE SENT THE TRANSFER" ───────────────────────────────────────────
   Brent, 9 Sep: record the bank transfer against a reference and reconcile it
   with Xero. This is the record. It does NOT mark anything paid — a customer
   saying the money has left is not the money arriving, and the only things
   that settle a payment are the reconcile job reading it off the books and a
   named person on the team. */
async function declare(request, env) {
  const { acc, body, error } = await signedIn(request, env);
  if (error) return error;
  const ref = String(body.payment_reference || '').trim();
  if (!ref) return bad('which payment?');

  const rows = await coreSelect(env, 'job_payment',
    'select=payment_reference,job_ref,status,amount_pence,haf_username,customer_email'
    + `&payment_reference=eq.${encodeURIComponent(ref)}&limit=1`);
  const p = rows[0];
  if (!p || !ownsRow(acc, p)) return bad('payment not found', 404);
  if (p.status === 'paid') return json({ ok: true, already: true, status: 'paid' });
  if (!isOpen(p.status)) return bad(`this payment is ${p.status}`, 409);

  await coreInsert(env, 'payment_event', {
    job_ref: p.job_ref,
    payment_reference: p.payment_reference,
    event: 'bank_transfer_declared',
    detail: { amount_pence: p.amount_pence, sent_on: body.sent_on || null },
    actor: `customer:${acc.haf_username}`
  });
  return json({
    ok: true,
    status: 'awaiting_transfer',
    reference: p.payment_reference,
    note: 'Thanks — we will match your transfer against this reference and confirm it.'
  });
}

/* ── THE TEAM LIST ────────────────────────────────────────────────────────
   Everything still waiting on money, and which of those the customer has said
   they have sent. Master accounts only. */
async function awaiting(request, env) {
  const { acc, error } = await signedIn(request, env);
  if (error) return error;
  if (!acc.is_master) return bad('not authorised', 403);

  const [open, events] = await Promise.all([
    coreSelect(env, 'job_payment',
      'select=payment_reference,job_ref,customer_name,customer_email,haf_username,amount_pence,purpose,plan_name,created_at'
      + '&status=eq.awaiting_payment&order=created_at.desc&limit=200').catch(() => []),
    coreSelect(env, 'payment_event',
      'select=payment_reference,created_at,detail&event=eq.bank_transfer_declared&order=created_at.desc&limit=200').catch(() => [])
  ]);
  const declared = {};
  for (const e of events) if (!declared[e.payment_reference]) declared[e.payment_reference] = e.created_at;

  const rows = open.map(p => ({
    reference: p.payment_reference,
    job_ref: p.job_ref,
    who: p.customer_name || p.haf_username || p.customer_email,
    username: p.haf_username || null,
    email: p.customer_email || null,
    type: typeOf(p.purpose),
    what: p.plan_name || null,
    amount_pence: p.amount_pence,
    raised_at: p.created_at,
    declared_at: declared[p.payment_reference] || null
  }));
  rows.sort((a, b) => (b.declared_at ? 1 : 0) - (a.declared_at ? 1 : 0));

  return json({
    ok: true,
    count: rows.length,
    declared_count: rows.filter(r => r.declared_at).length,
    total_pence: rows.reduce((a, r) => a + Number(r.amount_pence || 0), 0),
    rows
  });
}
