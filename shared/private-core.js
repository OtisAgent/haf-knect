/* HAF KNECT — THE PRIVATE ORDER, the shared part.

   Brent, 9 Sep 2026: "on the HAF KNECT dashboard i need to add a section that
   is for me uploading a job. then generating an invoice and payment link
   directly from the HAF KNECT for me to send then i can send it to a driver
   directly without it going on the network private order for example."

   His four rulings the same day, and where each one lives:

     1. "You choose per job"  — private only, or private first then network.
        Held in `mode` below and turned into a first-refusal window that either
        lapses or never does.
     2. "Full numbered invoice, and into Xero" — the number is minted here to
        the HAF rule, the row is written on the HAF books immediately, and Xero
        is a SYNC that happens afterwards. Xero being slow, or its token having
        expired, must never stop Brent raising an invoice.
     3. "I type the price myself" — there is no engine in this path. Nothing in
        this file computes a price from miles. It takes the two numbers Brent
        typed and does arithmetic on them, which is a different thing.
     4. "Straight away, if i send it directly" — the driver is offered the job
        at the moment it is posted. Payment is not a gate on this path.

   THE ONE RULE THIS FILE EXISTS TO KEEP
   -------------------------------------
   A PRIVATE JOB MUST NEVER REACH THE OPEN BOARD. Not late, not briefly, not as
   a fallback when something else fails. The network's own ingest function has
   a kindness built into it — hand it a driver who is not cleared to work and it
   posts the job to EVERYONE rather than to nobody, and tells you it did. That
   is right for a customer's order and wrong for this one. So this path checks
   clearance BEFORE it posts, and the endpoint checks the answer again AFTER,
   and pulls the job straight back if the network was kind to it. */

import { postcodeShape } from './order-core.js';

/* ── THE INVOICE NUMBER ──
   The canonical HAF rule, ruled on by Brent on 3 Sep: invoice numbers must NOT
   run in order, because a customer who sees INV-0004 has learned how many jobs
   HAF has done. Format HAF-YYMMDD-XXXXXXX: dated series (VAT Notice 700 s16.3
   asks for one) with seven random characters carrying the uniqueness.

   Alphabet excludes 0 O 1 I L U so a number read down the phone cannot be
   mistyped. 30^7 per day, so 20,000 invoices in one day collide with
   probability under 1 in 100,000 — and Xero enforces uniqueness on top.

   This is a deliberate second copy of haf-xero/invoice-number.js. That file
   lives in a different project and a Cloudflare worker cannot import across
   repositories; a shared rule with no shared file is kept honest by the test
   that checks both, not by wishing. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const RANDOM_LEN = 7;

function randomSuffix(len = RANDOM_LEN) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) {
    /* 256 % 30 is not 0, so the tail is rejected to keep every character
       equally likely. A biased invoice number is a guessable one. */
    let b = bytes[i];
    while (b >= 240) {
      const one = new Uint8Array(1);
      crypto.getRandomValues(one);
      b = one[0];
    }
    out += ALPHABET[b % ALPHABET.length];
  }
  return out;
}

export function hafInvoiceNumber(date = new Date()) {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `HAF-${yy}${mm}${dd}-${randomSuffix()}`;
}

export function isHafInvoiceNumber(value) {
  return /^HAF-\d{6}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{7}$/.test(String(value || ''));
}

/* ── WHO MAY POST A PRIVATE JOB ──
   The same gate the pricing engine uses, and deliberately the same list. A
   private order sets its own price and bypasses the network, so the set of
   people who may raise one is the set who may change a price. Set
   PRIVATE_OWNERS (or PRICING_OWNERS) on the Pages project to change it without
   a redeploy. */
export function isPrivateOwner(env, user) {
  const allowed = String(env.PRIVATE_OWNERS || env.PRICING_OWNERS || 'BF638793')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  return allowed.includes(String(user || '').trim().toUpperCase());
}

/* ── THE TWO MODES ──
   The network decides who may see a job with one comparison: is there a named
   driver, and is `now()` still before `direct_until`. There is no separate
   "private" column and adding one would mean a migration on the table real
   drivers are working off today.

   So private-only is expressed in the language the network already speaks: a
   first-refusal window that does not run out in any life this business will
   have. A hundred years is not a trick — it is the same rule, with the number
   set so that the "then it opens" branch is unreachable. If the row is ever
   wanted on the open board it is one UPDATE to direct_until, which is a far
   better story than a schema change to undo.

   'network_after' is the ordinary first refusal: his minutes, then open. */
export const PRIVATE_FOREVER_MINS = 100 * 365 * 24 * 60; // 52,560,000
export const MIN_WINDOW_MINS = 5;
export const MAX_WINDOW_MINS = 7 * 24 * 60; // a week is the longest sensible wait

export function windowMinutes(mode, minutes) {
  if (mode !== 'network_after') return PRIVATE_FOREVER_MINS;
  /* An empty box is "you did not say", not "zero minutes". Number('') is 0,
     which would have clamped to the five-minute floor and handed the job to
     the whole network almost immediately — the exact outcome this mode is
     supposed to let him control. */
  const raw = String(minutes ?? '').trim();
  const m = raw === '' ? NaN : Math.round(Number(raw));
  if (!Number.isFinite(m)) return 120;
  return Math.min(MAX_WINDOW_MINS, Math.max(MIN_WINDOW_MINS, m));
}

export const isPrivateMode = (mode) => mode !== 'network_after';

/* ── THE MONEY ──
   Brent types two numbers: what the customer pays HAF, and what HAF pays the
   driver. Everything else is arithmetic on those, and it is done here rather
   than in the browser so that what is invoiced is what the server worked out.

   The customer price he types is EX VAT, matching every other price on KNECT
   and matching the OUTPUT2 (20% on income) tax type the Xero sync uses. The
   screen says so out loud next to the box; a VAT mistake found at year end is
   an expensive way to learn that a label was ambiguous. */
export const VAT_PCT = 20;

export function priceFromPounds(customerExVat, driverPay) {
  const ex = toPence(customerExVat);
  const drv = toPence(driverPay);
  if (ex === null) return { error: 'Enter the customer price, in pounds.' };
  if (ex <= 0) return { error: 'The customer price has to be more than zero.' };
  if (drv === null) return { error: 'Enter the driver pay, in pounds.' };
  if (drv < 0) return { error: 'Driver pay cannot be negative.' };
  if (drv > ex) {
    return { error: 'Driver pay is more than the customer is paying. Check both numbers.' };
  }
  const vat = Math.round((ex * VAT_PCT) / 100);
  return {
    quote_ex_vat_pence: ex,
    vat_pence: vat,
    total_pence: ex + vat,
    driver_pay_pence: drv,
    /* What HAF keeps, before card fees. Ex-VAT on both sides: the VAT is not
       ours, so counting it as margin would flatter every private job by 20%. */
    haf_margin_pence: ex - drv
  };
}

/* Pounds off a screen, into whole pence. Refuses the things a text box
   actually produces — blanks, "£1,250.00", "12.345", "abc" — rather than
   turning them into a number nobody meant. */
export function toPence(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(/[£,\s]/g, '');
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
}

/* ── THE DRIVER ──
   A HAF username, in the shape the network issues. Checked here so a typo is
   caught on the screen, and checked again against clearance on the server,
   because a well-formed username is not a real one. */
export const DRIVER_SHAPE = /^[A-Z]{2}[0-9]{4,8}$/;

export function driverUsername(value) {
  const u = String(value || '').trim().toUpperCase();
  return DRIVER_SHAPE.test(u) ? u : null;
}

/* ── THE WHOLE FORM, CHECKED IN ONE PLACE ──
   Returns { ok: true, order } or { ok: false, error }. The endpoint and the
   test both call this, so the rules cannot drift apart between what is tested
   and what runs. Postcode EXISTENCE is checked by the endpoint, because it
   needs the network; shape is checked here, because it does not. */
export function readPrivateOrder(b) {
  const collect = postcodeShape(b.collect_postcode);
  if (!collect) return { ok: false, error: 'The collection postcode does not look like a UK postcode.' };
  const deliver = postcodeShape(b.deliver_postcode);
  if (!deliver) return { ok: false, error: 'The delivery postcode does not look like a UK postcode.' };

  const driver = driverUsername(b.driver_username);
  if (!driver) return { ok: false, error: 'Enter the driver’s HAF username, for example JW012390.' };

  const customer = String(b.customer_name || '').trim();
  if (!customer) return { ok: false, error: 'Enter the customer name — it goes on the invoice.' };

  const email = String(b.customer_email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) {
    return { ok: false, error: 'Enter an email for the invoice and payment link.' };
  }

  const goods = String(b.goods || '').trim();
  if (!goods) return { ok: false, error: 'Say what is being moved, so the driver knows what they are picking up.' };

  const money = priceFromPounds(b.customer_price, b.driver_pay);
  if (money.error) return { ok: false, error: money.error };

  const mode = b.mode === 'network_after' ? 'network_after' : 'private';

  return {
    ok: true,
    order: {
      collect, deliver, driver, customer, email, goods, mode,
      customer_phone: String(b.customer_phone || '').trim() || null,
      company: String(b.company || '').trim() || null,
      collect_address: String(b.collect_address || '').trim() || null,
      deliver_address: String(b.deliver_address || '').trim() || null,
      collect_on: String(b.collect_on || '').trim() || null,
      collect_window: String(b.collect_window || '').trim() || null,
      vehicle_code: String(b.vehicle_code || '').trim() || null,
      notes: String(b.notes || '').trim() || null,
      window_minutes: windowMinutes(mode, b.window_minutes),
      is_test: Boolean(b.is_test),
      ...money
    }
  };
}

/* Payment terms. Brent said he pays the driver before the pay run rather than
   waiting on the customer, so the invoice is the customer's clock and nothing
   else waits on it. Fourteen days unless he says otherwise on the form. */
export const DEFAULT_TERMS_DAYS = 14;

export function dueDate(issued, days = DEFAULT_TERMS_DAYS) {
  /* Zero is a real answer here — "due on receipt" — so it cannot be tested for
     truthiness. `Number(0) || 14` is 14, which would have quietly given every
     due-on-receipt invoice a fortnight's credit. */
  const raw = String(days ?? '').trim();
  const n = raw === '' ? NaN : Number(raw);
  const use = Number.isFinite(n) ? Math.max(0, Math.round(n)) : DEFAULT_TERMS_DAYS;
  const d = new Date(issued.getTime());
  d.setUTCDate(d.getUTCDate() + use);
  return d.toISOString().slice(0, 10);
}
