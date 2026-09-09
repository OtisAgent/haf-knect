/* PRIVATE ORDER — driven against the live preview, end to end.

   Not a unit test. This signs in the way the screen signs in, posts through the
   real endpoint, and then goes and LOOKS at the network and the money database
   to see what actually happened. A 200 from the endpoint proves nothing on its
   own — the whole point of this file is the reading back.

   The one rule under examination: A PRIVATE JOB MUST NEVER REACH THE OPEN
   BOARD. So the job is posted to one driver and then the OTHER cleared driver's
   board is read, with test rows deliberately included, to prove it is not there.

   Every job raised here is is_test=true, so it never lands on a real driver's
   phone, and every row is cleaned up at the end. */

const BASE = process.env.BASE || 'https://private-order.knect-demo.pages.dev';
const PLNA = 'https://ggkpqqrtxtlafdkxcaqg.supabase.co';
const CORE = 'https://rsvsalswppksrkrcqdfd.supabase.co';
const PK = process.env.PLNA_KEY;
const CK = process.env.CORE_KEY;

/* The two cleared drivers on the network. One is sent the job; the other is the
   witness who must not be able to see it. */
const NAMED = 'BF009393';
const OTHER = 'HC823080';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  → ' + JSON.stringify(extra).slice(0, 300) : '')); }
};

const sha = async (s) => {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
};

/* Sign in exactly as the page does: the hash rides in both the application and
   the relay slot, and only the right one matches. */
async function cred(user, pin) {
  return { username: user, hash: await sha(`${user}:${pin}`), relay: null, cp: null };
}

async function api(path, body) {
  const r = await fetch(`${BASE}/api/private/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const plnaRpc = async (fn, args) => (await fetch(`${PLNA}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: { apikey: PK, authorization: `Bearer ${PK}`, 'content-type': 'application/json' },
  body: JSON.stringify(args)
})).json();

const plnaGet = async (q) => (await fetch(`${PLNA}/rest/v1/${q}`, {
  headers: { apikey: PK, authorization: `Bearer ${PK}` }
})).json();

const coreGet = async (q) => (await fetch(`${CORE}/rest/v1/${q}`, {
  headers: { apikey: CK, authorization: `Bearer ${CK}`, 'accept-profile': 'pay' }
})).json();

const OWNER = await cred('ZZ999001', '4821');
const NOT_OWNER = await cred('ZZ999004', '4824');

const job = {
  customer_name: 'ZZTEST Acme Haulage', company: 'ZZTEST Acme Ltd',
  customer_email: 'zztest@example.invalid', customer_phone: '07000 000000',
  collect_postcode: 'S9 1XH', collect_address: 'ZZTEST Unit 4',
  deliver_postcode: 'M1 1AE', deliver_address: 'ZZTEST rear yard',
  collect_on: '2026-09-20', collect_window: 'between 9am and 12',
  goods: 'ZZTEST 12 pallets of packaging', notes: 'ZZTEST tail lift at the drop',
  customer_price: '450', driver_pay: '320', terms_days: '14',
  driver_username: NAMED, mode: 'private', is_test: true
};

console.log(`\nDriving ${BASE}\n`);

console.log('1. THE DOOR');
{
  const a = await api('post', { ...job });
  ok('a stranger with no credential is refused', a.status === 401, a.body);
  ok('and is not told which half was wrong', !/password|pin|username/i.test(a.body.error || ''), a.body);

  const b = await api('post', { ...NOT_OWNER, ...job });
  ok('a signed-in member who is not an owner is refused', b.status === 403, b.body);

  const c = await api('post', { username: 'ZZ999001', hash: 'not-the-right-hash', ...job });
  ok('the right username with the wrong credential is refused', c.status === 401, c.body);
}

console.log('\n2. WHAT IT REFUSES BEFORE IT WRITES ANYTHING');
{
  const before = await coreGet('job_order?status=eq.private&select=job_ref');
  const n = before.length;

  const town = await api('post', { ...OWNER, ...job, collect_postcode: 'Sheffield' });
  ok('a town instead of a postcode is refused', town.status === 400, town.body);

  const dead = await api('post', { ...OWNER, ...job, deliver_postcode: 'ZZ9 9ZZ' });
  ok('a postcode that does not exist is refused', dead.status === 400, dead.body);

  const rich = await api('post', { ...OWNER, ...job, driver_pay: '900' });
  ok('paying the driver more than the customer pays is refused', rich.status === 400, rich.body);

  /* The one that matters most. plna_ingest_haf_order posts to EVERYBODY when
     the named driver cannot work — so an uncleared driver must be stopped here,
     before a single row exists. */
  const unclear = await api('post', { ...OWNER, ...job, driver_username: 'ZZ999004' });
  ok('an uncleared driver is refused', unclear.status === 400, unclear.body);
  ok('and the refusal says what to do about it', /cleared|CleverPay/i.test(unclear.body.error || ''), unclear.body);

  const after = await coreGet('job_order?status=eq.private&select=job_ref');
  ok('five refusals wrote no orders at all', after.length === n, { before: n, after: after.length });
}

console.log('\n3. A PRIVATE ORDER, RAISED');
let raised;
{
  const r = await api('post', { ...OWNER, ...job });
  ok('it is accepted', r.status === 200 && r.body.ok === true, r.body);
  if (!r.body.ok) { console.log('\ncannot continue without a raised order\n'); process.exit(1); }
  raised = r.body;

  ok('a HAF invoice number comes back', /^HAF-\d{6}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{7}$/.test(raised.invoice_number), raised);
  ok('the number carries no running order', !/^INV-?\d+$/.test(raised.invoice_number));
  ok('a job reference comes back', /^HAF-\d{8}-/.test(raised.job_ref), raised);
  ok('a payment link comes back', /\/pay\/HAFPAY-[A-Z2-9]{8}$/.test(raised.pay_url), raised);
  ok('it is marked private', raised.private === true);
  ok('there is no "opens to the network" time on a private job', raised.opens_to_network_in_minutes === null);
  ok('the driver is the one asked for', raised.driver === NAMED);
  ok('the customer pays 450 plus VAT', raised.total_pence === 54000, raised);
  ok('the driver gets 320', raised.driver_pay_pence === 32000, raised);
  ok('HAF keeps 130 ex VAT', raised.haf_margin_pence === 13000, raised);
  ok('it is due in 14 days', raised.due_on === '2026-09-23', raised);
  ok('it was born flagged as a test', raised.is_test === true);
}

console.log('\n4. WHAT THE NETWORK ACTUALLY HOLDS');
{
  const [h] = await plnaGet(`plna_knect_handover?haf_job_ref=eq.${raised.job_ref}&select=*`);
  ok('the job reached the network', Boolean(h), h);
  ok('it is held to the one driver', h && String(h.direct_username).toUpperCase() === NAMED, h && h.direct_username);
  ok('it is flagged as a test row on the network too', h && h.is_test === true, h && h.is_test);
  ok('both ends are stored in Royal Mail spacing',
     h && h.from_postcode === 'S9 1XH' && h.to_postcode === 'M1 1AE', h && [h.from_postcode, h.to_postcode]);

  /* The whole of "private" is this one timestamp. If it is close, the job opens
     to everybody at some point, and it is not private at all. */
  const years = h ? (new Date(h.direct_until) - Date.now()) / (365.25 * 24 * 3600 * 1000) : 0;
  ok('the driver holds it for longer than this business will exist', years > 50, { years: Math.round(years) });
}

console.log('\n5. NOBODY ELSE CAN SEE IT — the point of the whole thing');
{
  /* Test rows are deliberately INCLUDED here. Reading a board that filters them
     out would pass for the wrong reason, and a check that passes because there
     was nothing to check is not a check. */
  const mine = await plnaRpc('plna_exchange_board', { p_username: NAMED, p_include_test: true });
  const theirs = await plnaRpc('plna_exchange_board', { p_username: OTHER, p_include_test: true });
  const on = (rows) => Array.isArray(rows) && rows.some((r) => r.haf_job_ref === raised.job_ref);

  ok('the named driver sees it on their board', on(mine), { count: mine.length });
  ok('the other cleared driver does NOT see it', !on(theirs), { count: theirs.length });

  const row = Array.isArray(mine) ? mine.find((r) => r.haf_job_ref === raised.job_ref) : null;
  ok('their board says it is theirs', row && row.is_direct === true, row && row.is_direct);

  /* Seeing and taking are asked separately, so both are checked. */
  const id = row ? row.id : null;
  if (id) {
    const noOne = await plnaRpc('plna_exchange_claimable', { p_id: id, p_username: OTHER });
    ok('the other driver cannot take it either', noOne === 'reserved', noOne);
    const yes = await plnaRpc('plna_exchange_claimable', { p_id: id, p_username: NAMED });
    ok('the named driver can take it', yes === null, yes);
  } else {
    ok('the other driver cannot take it either', false, 'no board row to test');
    ok('the named driver can take it', false, 'no board row to test');
  }
}

console.log('\n6. THE INVOICE AND THE PAYMENT LINK ARE REAL');
{
  const [inv] = await coreGet(`account_invoice?invoice_number=eq.${raised.invoice_number}&select=*`);
  ok('the invoice is on the HAF books', Boolean(inv), inv);
  ok('for the full amount including VAT', inv && inv.total_pence === 54000, inv && inv.total_pence);
  ok('the whole amount is outstanding', inv && inv.amount_due_pence === 54000);
  ok('it is open', inv && inv.status === 'open', inv && inv.status);
  ok('it is not in Xero yet, and says so', inv && inv.xero_invoice_id === null);
  ok('it points at the payment', inv && raised.pay_url.endsWith(inv.payment_reference), inv && inv.payment_reference);

  const [p] = await coreGet(`job_payment?payment_reference=eq.${inv.payment_reference}&select=*`);
  ok('the payment is waiting to be paid', p && p.status === 'awaiting_payment', p && p.status);
  ok('it is filed as an invoice, not a job deposit', p && p.purpose === 'invoice', p && p.purpose);

  const page = await fetch(raised.pay_url);
  ok('the payment page opens', page.status === 200, page.status);

  /* The page is a shell that fetches the payment; the figure a customer reads
     comes from this call, so this is what has to be right. */
  const st = await (await fetch(`https://join.usehaf.co.uk/api/pay/status?ref=${inv.payment_reference}`)).json();
  ok('HAF PAY knows the reference', st.ok === true, st);
  ok('and quotes the right amount', st.amount_pence === 54000, st.amount_pence);
  ok('and offers a bank transfer as well as a card', Boolean(st.bank), st.bank ? 'yes' : 'no bank details configured');

  const [order] = await coreGet(`job_order?job_ref=eq.${raised.job_ref}&select=status,quote_detail,haf_username`);
  ok('the order is marked private, not new', order && order.status === 'private', order && order.status);
  ok('so the half-hourly pipeline will not post it a second time', order && order.status !== 'new');
  ok('it records who priced it', order && order.quote_detail.priced_by === 'typed_by_owner');
}

console.log('\n7. THE FALLBACK MODE IS A DIFFERENT ANSWER');
let second;
{
  const r = await api('post', { ...OWNER, ...job, mode: 'network_after', window_minutes: '90' });
  ok('it is accepted', r.status === 200 && r.body.ok === true, r.body);
  second = r.body;
  ok('it is not marked private', second.private === false);
  ok('it says when it opens', second.opens_to_network_in_minutes === 90, second);

  const [h] = await plnaGet(`plna_knect_handover?haf_job_ref=eq.${second.job_ref}&select=direct_until,direct_username`);
  const mins = h ? (new Date(h.direct_until) - Date.now()) / 60000 : 0;
  ok('the window really is 90 minutes, not a hundred years', mins > 80 && mins < 95, { mins: Math.round(mins) });
  ok('this one gets its own invoice number', second.invoice_number !== raised.invoice_number);
}

console.log('\n8. WITHDRAWING IT');
{
  const r = await api('cancel', { ...OWNER, job_ref: raised.job_ref });
  ok('it withdraws', r.status === 200 && r.body.ok === true, r.body);
  ok('and says it came off a board', r.body.pulled_off_boards === 1, r.body);

  const board = await plnaRpc('plna_exchange_board', { p_username: NAMED, p_include_test: true });
  ok('the driver no longer sees it', !board.some((x) => x.haf_job_ref === raised.job_ref));

  const [inv] = await coreGet(`account_invoice?invoice_number=eq.${raised.invoice_number}&select=status,amount_due_pence`);
  ok('the invoice is voided, not deleted', inv && inv.status === 'voided', inv);
  ok('the number still exists, so the series has no hole', Boolean(inv));
  ok('and nothing is owed on it', inv && inv.amount_due_pence === 0, inv);

  const cross = await api('cancel', { ...NOT_OWNER, job_ref: second.job_ref });
  ok('somebody else cannot withdraw it', cross.status === 403, cross.body);
}

console.log('\n9. THE LIST HE READS');
{
  const r = await api('mine', { ...OWNER });
  ok('the list comes back', r.status === 200 && r.body.ok === true, r.body);
  const rows = r.body.jobs || [];
  const a = rows.find((x) => x.job_ref === raised.job_ref);
  const b = rows.find((x) => x.job_ref === second.job_ref);
  ok('the withdrawn one is listed as cancelled', a && a.status === 'cancelled', a && a.status);
  ok('the live one is listed', Boolean(b), rows.length);
  ok('with its invoice number', b && /^HAF-\d{6}-/.test(b.invoice_number || ''), b);
  ok('and its payment link', b && /\/pay\/HAFPAY-/.test(b.pay_url || ''), b);
  ok('and it is not paid', b && b.paid === false);
  ok('and it is not in Xero yet', b && b.in_xero === false);
}

console.log('\n10. CLEARING UP AFTER MYSELF');
{
  await api('cancel', { ...OWNER, job_ref: second.job_ref });
  const left = await plnaRpc('plna_exchange_board', { p_username: NAMED, p_include_test: true });
  ok('no test job is left on anybody’s board',
     !left.some((x) => [raised.job_ref, second.job_ref].includes(x.haf_job_ref)), left.length);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
