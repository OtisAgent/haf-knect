/* THE DEMO'S PAYMENT MOMENT — what HAF PAY would have done, minus the money.

   Brent, 11 Sep 2026: "when it gets to the payment section just allow it to go
   through on the demo centre and explain what would have happened at that stage
   and put it in the booking system".

   The explainer is the "explain" half. This is the "put it in the booking
   system" half: it moves the order exactly one rung, the same rung HAF PAY
   moves it, so the booking the viewer sees afterwards is a real booking in a
   real state and not a screenshot.

   THIS FILE EXISTS ONLY IN THE DEMO BUILD. It is copied into functions/ by
   demo/build.sh and is not in the app's own functions/ directory, so there is
   no deploy of the live product that can carry it. That is deliberate: an
   endpoint that marks a payment paid without a payment is exactly the endpoint
   you never want reachable on a live site.

   WHAT IT COPIES FROM HAF PAY, AND WHY EXACTLY THIS MUCH.
   HAF PAY, on a real card going through, marks the payment paid and moves
   job_order from 'new' to 'deposit_held' — and deliberately NOT to
   'on_network', because nothing in a payment worker can reach the driver
   board. Writing 'on_network' here would be the same bug in demo clothing:
   a job that says it is out to the network and is on nobody's screen. So this
   does what HAF PAY does and stops where HAF PAY stops.

   It also guards on the old status, so a double click cannot settle the same
   booking twice. */

const DB = (env) => ({
  apikey: env.CORE_KEY,
  authorization: `Bearer ${env.CORE_KEY}`,
  'content-type': 'application/json',
  'accept-profile': 'pay',
  'content-profile': 'pay'
});

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' }
  });

export async function onRequestPost({ request, env }) {
  if (!env.CORE_URL || !env.CORE_KEY) {
    return json({ ok: false, error: 'the demo ordering database is not configured' }, 503);
  }

  const body = await request.json().catch(() => ({}));
  const ref = String(body.payment_reference || '').trim().toUpperCase();
  /* The same shape HAF PAY insists on. A demo that accepts any string here is
     a demo that will one day be pointed at something that is not a demo. */
  if (!/^HAFPAY-[A-Z2-9]{8}$/.test(ref)) {
    return json({ ok: false, error: 'that is not a payment reference' }, 400);
  }

  const rows = await fetch(
    `${env.CORE_URL}/rest/v1/job_payment?payment_reference=eq.${ref}&select=*`,
    { headers: DB(env) }
  ).then((r) => r.json()).catch(() => null);

  const pay = rows && rows[0];
  if (!pay) return json({ ok: false, error: 'no payment with that reference' }, 404);

  /* Already settled is not a failure — a viewer who presses twice should see
     the same calm answer, not an error on camera. */
  if (pay.status === 'paid' || pay.status === 'on_credit') {
    return json({ ok: true, already: true, job_ref: pay.job_ref, status: pay.status });
  }

  const settled = await fetch(
    `${env.CORE_URL}/rest/v1/job_payment?payment_reference=eq.${ref}&status=eq.awaiting_payment`,
    {
      method: 'PATCH',
      headers: { ...DB(env), prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'paid',
        method: 'card',
        paid_at: new Date().toISOString(),
        /* Who marked it, in the column HAF PAY uses for exactly that. Anyone
           reading this database later can see at a glance that no card was
           ever presented. */
        marked_by: 'demo_centre',
        updated_at: new Date().toISOString()
      })
    }
  ).then((r) => r.json()).catch(() => null);

  if (!settled || !settled.length) {
    return json({ ok: false, error: 'the payment had already moved on' }, 409);
  }

  let moved = false;
  if (pay.purpose === 'deposit' || pay.purpose === 'job') {
    const held = await fetch(
      `${env.CORE_URL}/rest/v1/job_order?job_ref=eq.${encodeURIComponent(pay.job_ref)}&status=eq.new`,
      {
        method: 'PATCH',
        headers: { ...DB(env), prefer: 'return=representation' },
        body: JSON.stringify({ status: 'deposit_held', updated_at: new Date().toISOString() })
      }
    ).then((r) => r.json()).catch(() => null);
    moved = Boolean(held && held.length);
  }

  /* The audit line, in the same table and the same shape as a real one, so the
     demo's own history reads like the product's. */
  await fetch(`${env.CORE_URL}/rest/v1/payment_event`, {
    method: 'POST',
    headers: DB(env),
    body: JSON.stringify({
      job_ref: pay.job_ref,
      payment_reference: ref,
      event: 'deposit_held',
      detail: { deposit_pence: pay.amount_pence, demo: true, no_money_moved: true },
      actor: 'demo_centre'
    })
  }).catch(() => null);

  return json({
    ok: true,
    job_ref: pay.job_ref,
    amount_pence: pay.amount_pence,
    order_moved: moved,
    demo: true
  });
}
