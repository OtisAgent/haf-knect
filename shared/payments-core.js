/* HAF KNECT — PAYMENTS, the shared part.

   Brent, 9 Sep: "on the HAF KNECT Dashboard on the side bar ... account users
   have a payments section and inside that section they can make payments to
   outstanding Invoices and that goes directly to HAF PAY or they can complete
   with a BACC transfer ... we can list that as a CRM with section of the
   different types of payments needed."
   And: "to record the bank transfer, request a reference number and then you
   can reconcile with XERO."

   THE TWO RULES THIS FILE EXISTS TO KEEP
   --------------------------------------
   1. A BROWSER NEVER READS THE MONEY DATABASE. The pay schema is reached with
      the service key, which only ever lives on the server. The page asks this
      endpoint, this endpoint proves who is asking, and only then does it read.
      Anything less and one account's card page is one URL away from another
      account's balance.

   2. NOTHING HERE INVENTS A PRICE OR A PAYMENT. Every line comes from a row
      that already exists — a deposit raised by the order journey, a plan taken
      at sign-up, an invoice raised on the books. The screen this feeds is a
      window onto money that is already owed, never a place money is made up.
      (The screen it replaces showed INV-0048 for £241 to every account that
      ever signed in. Nobody was ever billed that. It was demo furniture.)

   The customer pays on HAF PAY's own page — /pay/<reference> — which already
   offers a card and a bank transfer with the reference to quote. We do not
   build a second payment page here; we point at the real one. */

/* The driving/account database. This URL and key are the anon pair the
   dashboard already ships to every browser, so naming them here exposes
   nothing new. They are used for ONE thing: proving the person asking is who
   they say they are, with the same call the sign-in screen makes. */
export const PLNA_URL = 'https://ggkpqqrtxtlafdkxcaqg.supabase.co';
export const PLNA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdna3BxcXJ0eHRsYWZka3hjYXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxOTM2NjAsImV4cCI6MjA5Nzc2OTY2MH0.hB70KOYZu4dshwhsrxF_dFyBn0n72gStWTwxYGsLdgY';

/* Who is asking. The credential the browser holds is the credential the
   sign-in screen took, and it is checked by the same function — so a payments
   screen can never be a softer door than the front one. Returns the account
   row, or null. Never returns a reason: a stranger learns nothing from us
   about which half of a guess was right. */
export async function whoIsAsking(body) {
  const u = String(body.username || '').trim().toUpperCase();
  if (!u) return null;
  const isPin = Boolean(body.relay || body.cp);
  const payload = isPin
    ? { p_username: u, p_hash: body.hash || null, p_relay: body.relay || null, p_cp: body.cp || null }
    : { p_username: u, p_hash: body.hash || null, p_relay: null, p_cp: null };
  const r = await fetch(`${PLNA_URL}/rest/v1/rpc/knect_auth`, {
    method: 'POST',
    headers: { apikey: PLNA_KEY, authorization: `Bearer ${PLNA_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => null);
  const acc = Array.isArray(rows) ? rows[0] : rows;
  if (!acc || !acc.haf_username) return null;
  return acc;
}

/* ── THE PAYMENT TYPES ────────────────────────────────────────────────────
   Brent asked for the different types of payment listed as their own sections.
   This is that list, in one place, so the customer screen, the team screen and
   the reconcile job all group money the same way. `key` is what the code uses,
   `l` is what a person reads, `why` finishes the sentence "you are paying this
   because...". Order is the order the sections appear in. */
export const PAYMENT_TYPES = [
  { key: 'deposit',    l: 'Job holding deposits', why: 'Holds the job while the network is asked. Returned in full if nobody picks it up.' },
  { key: 'balance',    l: 'Job balances',         why: 'The rest of the job price, once the delivery is done.' },
  { key: 'job',        l: 'Job payments',         why: 'Payment for a delivery in full.' },
  { key: 'membership', l: 'Network membership',   why: 'The one-off HAF Network membership.' },
  { key: 'plan',       l: 'Plan and subscription',why: 'Your monthly or yearly HAF KNECT plan.' },
  { key: 'invoice',    l: 'Invoices',             why: 'Raised on the HAF books and payable here.' }
];

const TYPE_KEYS = new Set(PAYMENT_TYPES.map(t => t.key));

/* A purpose we have never seen before must not vanish off the screen — money
   owed that nobody is shown is worse than money owed in the wrong box. */
export function typeOf(purpose) {
  const p = String(purpose || '').toLowerCase();
  return TYPE_KEYS.has(p) ? p : 'job';
}

export const money = (pence) =>
  '£' + (Number(pence || 0) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* Where the customer actually pays. HAF PAY owns that page; we only link. */
export function payUrl(env, reference) {
  const base = (env.PAY_BASE || 'https://join.usehaf.co.uk').replace(/\/+$/, '');
  return `${base}/pay/${reference}`;
}

/* An account is matched to its money two ways, because two things wrote it:
   the order journey stamps the signed-in username on the row, and everything
   older only ever had the email. Both are asked for; neither alone is enough
   to cover what is already in the database. */
export function ownerFilter(acc) {
  const u = String(acc.haf_username || '').toUpperCase();
  const e = String(acc.notify_email || '').trim().toLowerCase();
  /* Quoted, because an email is a value we did not choose and PostgREST reads
     an unquoted comma or bracket as more filter. */
  const parts = [`haf_username.eq."${u}"`];
  if (e) parts.push(`customer_email.eq."${e}"`);
  return `or=(${parts.join(',')})`;
}

/* Does this row belong to the person asking? Used before anything is written
   against a payment, so a valid sign-in cannot touch somebody else's money. */
export function ownsRow(acc, row) {
  if (!row) return false;
  const u = String(acc.haf_username || '').toUpperCase();
  const e = String(acc.notify_email || '').trim().toLowerCase();
  if (row.haf_username && String(row.haf_username).toUpperCase() === u) return true;
  if (e && row.customer_email && String(row.customer_email).trim().toLowerCase() === e) return true;
  return false;
}
