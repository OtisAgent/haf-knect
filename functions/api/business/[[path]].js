/* ════════════════════════════════════════════════════════════════════════════
   CONFIRM YOUR BUSINESS — the step that turns a claim into a business.

   Brent, 15 Sep 2026: "Offer the creation of the HAF KNECT Account but if they
   want to post an order and get an invoice via a business they need to complete
   the information to confirm it's them for security and fraud reasons."

   So: the account opens to anybody in thirty seconds and nothing here changes
   that. What waits is the BUSINESS NAME ON AN INVOICE, because that is a claim
   about who is liable for money, and typed text is not evidence of it.

   WHY THE CHECK IS HERE AND NOT IN THE BROWSER
   -------------------------------------------
   The dashboard talks to the network database with the anon key, which anyone
   can read off the page. A browser that could hand the database a verdict could
   hand it any verdict. So the browser may only ever CLAIM; the verdict is
   reached here, on the server, and written with a secret the browser never has.

   Every one of the three answers below is reached from something outside this
   request:
     confirmed  the public register returned a real company for that number
     refused    the register says there is no such company
     sent       nothing outside could settle it — a sole trader (no register
                exists to check one against), or the register was unreachable

   THE THIRD ANSWER IS THE IMPORTANT ONE. A register having a bad minute must
   never confirm anybody, and it must never brand a real company fake either.
   checkCompanyNumber already draws exactly that distinction and this file does
   not second-guess it.
   ══════════════════════════════════════════════════════════════════════════ */

import { whoIsAsking, PLNA_URL, PLNA_KEY } from '../../../shared/payments-core.js';
import { checkCompanyNumber, looksLikeCompanyNumber } from '../../../shared/company-check.js';

const json = (o, status) => new Response(JSON.stringify(o), {
  status: status || 200,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const bad = (msg, status) => json({ ok: false, error: msg }, status || 400);

/* The network database, where the account row lives. Same key the dashboard
   itself uses — everything that matters is proved inside the function being
   called, not by the key holding it. */
async function netRpc(name, args) {
  const r = await fetch(`${PLNA_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: PLNA_KEY, authorization: `Bearer ${PLNA_KEY}`,
               'content-type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!r.ok) throw new Error(`${name} answered ${r.status}`);
  return await r.json();
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/business/, '').replace(/\/+$/, '') || '/';

  if (request.method !== 'POST') return bad('method not allowed', 405);

  let body;
  try { body = await request.json(); } catch (e) { return bad('unreadable request'); }

  /* WHO IS ASKING. The same call the sign-in screen makes, so the account being
     written is the account that proved itself — never the one the body names.
     A person may only ever confirm their OWN business. */
  const acc = await whoIsAsking(body).catch(() => null);
  if (!acc) return bad('please sign in again', 401);
  const username = acc.haf_username;

  try {
    if (path === '/state') return json({ ok: true, business: await state(username) });
    if (path === '/claim') return await claim(env, body, acc, username);
  } catch (e) {
    /* Never leave a person staring at a spinner because our side had a bad
       moment. Say it plainly and keep their typing — they can press again. */
    return json({ ok: false, error: 'We could not reach our records just now. '
      + 'Nothing has been lost — please try again in a moment.' }, 503);
  }
  return bad('not found', 404);
}

async function state(username) {
  const s = await netRpc('haf_business_state', { p_username: username });
  return s || { status: 'none', confirmed: false };
}

async function claim(env, body, acc, username) {
  const kind = ['sole_trader', 'limited'].includes(body.kind) ? body.kind : null;
  if (!kind) return bad('tell us whether this is a sole trader or a limited company');

  const name    = String(body.name || '').trim();
  const number  = String(body.number || '').trim();
  const address = String(body.address || '').trim();
  if (!name) return bad('give the name the business trades under');

  /* A limited company without a number cannot be checked against anything, and
     an unverifiable "limited company" is the exact shape of the problem this
     screen exists to close. Asked for before anything is written, so they are
     not told "sent" and then left waiting on a check that can never run. */
  if (kind === 'limited' && !looksLikeCompanyNumber(number)) {
    return bad('give your company number — it is eight characters, on your '
      + 'certificate of incorporation and on the Companies House register');
  }

  /* 1. RECORD THE CLAIM. Credential-proved inside the database as well as here,
     and it can only ever land as 'sent'. If this fails, nothing below runs —
     there must never be a confirmation sitting on top of no claim. */
  const claimed = await netRpc('haf_business_claim', {
    p_username: username, p_hash: body.hash || null,
    p_relay: body.relay || null, p_cp: body.cp || null,
    p_kind: kind, p_name: name, p_number: number || null, p_address: address || null
  });
  if (!claimed || claimed.ok !== true) {
    return bad((claimed && claimed.error) || 'we could not save that just now');
  }

  /* 2. A SOLE TRADER HAS NO REGISTER. There is nothing to check them against in
     a second, so this is where they stop: recorded, and waiting on a person at
     HAF. Saying so plainly is the point — the alternative is a screen that
     implies a check is running when none is. */
  if (kind === 'sole_trader') {
    return json({ ok: true, status: 'sent', kind,
      message: 'Thank you — we have your details. A sole trader has no public '
        + 'register to check against, so somebody at HAF confirms this one by hand. '
        + 'You can carry on ordering in your own name in the meantime.',
      business: await state(username) });
  }

  /* 3. A LIMITED COMPANY IS CHECKED AGAINST THE PUBLIC REGISTER, HERE, NOW. */
  const check = await checkCompanyNumber(number, { fetch });

  if (check.state === 'not_found') {
    await netRpc('haf_business_refuse', {
      p_secret: secret(env), p_username: username,
      p_note: 'no company with that number on the register', p_by: 'register'
    }).catch(() => null);
    return json({ ok: false, status: 'refused',
      error: 'We could not find that company number on the Companies House '
        + 'register. Check the number, or tell us you are a sole trader and '
        + 'trade in your own name.',
      business: await state(username) }, 200);
  }

  if (check.state !== 'verified') {
    /* Unreachable register. The claim stands as 'sent' and a person can press
       again in a minute — we never confirm on a failure to look, and we never
       refuse on one either. */
    return json({ ok: true, status: 'sent', kind,
      message: 'We have your details. The Companies House register did not '
        + 'answer just now, so we will finish this check shortly — try again in '
        + 'a minute if you would rather not wait.',
      business: await state(username) });
  }

  /* 4. CONFIRMED. The REGISTERED name is what goes on the record and on the
     invoice, not the name that was typed: "the business the register says
     exists" is a different claim from "a business called what they say". */
  const done = await netRpc('haf_business_confirm', {
    p_secret: secret(env), p_username: username,
    p_registered: check.name, p_by: 'Companies House register'
  });
  if (!done || done.ok !== true) {
    /* The one case that must not read as success. The claim is saved, the
       register verified it, and our own write did not land — so it stays
       'sent', and it says so rather than telling somebody they are confirmed. */
    return json({ ok: true, status: 'sent', kind,
      message: 'We found your company on the register and have your details. '
        + 'Finishing the last step took longer than expected — please press '
        + 'again in a moment.',
      business: await state(username) });
  }

  return json({ ok: true, status: 'confirmed', kind,
    registered: check.name,
    /* Said out loud rather than buried: a dissolved company IS a real company
       and verifies, so the screen must not imply everything is well with it. */
    dissolved: Boolean(check.dissolved),
    message: `Confirmed — ${check.name}. Orders and invoices can now go in your `
      + 'business name.',
    business: await state(username) });
}

/* The secret the database checks before it will confirm anything. Set as a
   Cloudflare Pages secret on this project. Missing means no confirmation
   happens at all, which is the right way round: a missing secret must fail
   closed, never open. */
function secret(env) {
  return (env && env.BUSINESS_SECRET) || '';
}
