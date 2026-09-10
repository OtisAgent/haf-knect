/* THE ORDER DOOR, PROVED ON THE LIVE SITE.
 *
 *   node _order_door_live_proof.mjs
 *
 * Every order below is placed against knect.usehaf.co.uk for real. They are
 * test orders by the system's own definition — the customer address is one the
 * pipeline treats as never-mail, so no confirmation email is sent — and none of
 * them is ever paid, so none of them ever reaches a driver's board.
 *
 * The account is ZZ990110, born flagged is_test, held at ONE post a day and ONE
 * running job on purpose. Nothing of this account's has ever reached the
 * network, so the network's own count for it is zero. That matters: it means
 * the refusal on the second order can ONLY come from the orders still in
 * flight, which is the whole thing this work added.
 */
const SITE = 'https://knect.usehaf.co.uk';
import { execFileSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';

const DBURL = execFileSync('bash', ['-lc',
  "grep -oE 'postgresql://[^ \"]+' /agent/workspace/haf-driver-app/.env.local | head -1"]).toString().trim();
const sql = (q) => execFileSync('psql', [DBURL, '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q]).toString().trim();

/* A FRESH ACCOUNT EVERY RUN. The first version of this proof reused one, and
   when an early step failed the later steps inherited its spent allowance and
   reported nonsense. A proof that depends on the state left by the last run is
   not a proof. */
const USER = 'ZZ99' + String(randomBytes(2).readUInt16BE() % 10000).padStart(4, '0');
const PIN = '4471';
const RELAY = createHash('sha256').update(`${USER}:${PIN}`).digest('hex');
const CP = createHash('sha256').update(`HAF-CP|${USER}|${PIN}`).digest('hex');

sql(`insert into public.haf_network_account (ref, username, full_name, email, account_type,
       stage, status, tier, is_test, source)
     values ('ZZORD-${USER}','${USER}','Order Door Proof','zz${USER.toLowerCase()}@example.invalid',
             'freight','applied','active','free', true, 'cleverpay');
     insert into public.plna_drivers (haf_username, full_name, initials, password_hash,
       pin_hash, cp_pin_hash, account_type)
     values ('${USER}','Order Door Proof','OD','no-password-on-this-fixture','${RELAY}','${CP}','freight_forwarder');
     select public.haf_set_account_plan('${USER}','FREE','{"posts_per_day":1,"active_orders":1}'::jsonb,
       'otis:live-proof','Order door live proof');`);
console.log(`  (fresh flagged test account ${USER}, one post a day, nothing of its own on the network)`);

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n         ' + detail : '')); }
};

/* THE DUPLICATE GUARD IS NOT THE THING UNDER TEST, AND IT BIT.
   /place hands back the existing order when the same email, route and van comes
   round again unpaid inside a quarter of an hour — which is right, and which
   means every run of this file collides with the last one, because every order
   in it is placed against the same never-mailed address.
   So the van rotates per run and per step, and any response that comes back as
   a duplicate stops the file. A hand-back is not a refusal and must never be
   read as one. */
const VANS = ['small', 'swb', 'mwb', 'lwb', 'xlwb', 'luton', 'lutonc', 'lutontl'];
const SALT = Number(USER.slice(-4));

/* Fifteen postcodes, every one checked against the national postcode register
   before being written down. The first version of this file invented "B1 1AA",
   which does not exist — the order was refused for the postcode, the step after
   it inherited the unspent allowance, and four checks reported the opposite of
   the truth. A bad fixture does not fail loudly; it lies quietly.

   The four routes a run uses are chosen from these by the run's own salt, so two
   runs a few minutes apart do not order the same route and trip the order door's
   duplicate guard. */
const PLACES = ['S9 1XH', 'M1 1AE', 'LS1 4AP', 'B3 1JJ', 'NG1 5FS', 'L1 8JQ', 'S1 2HH',
                'M2 3WQ', 'CV1 2TT', 'NE1 4XF', 'CF10 1EP', 'BS1 4DJ', 'SO14 3HB', 'PE1 1EJ',
                'HU1 1UU'];
const route = (i) => [PLACES[(SALT + i * 3) % PLACES.length],
                      PLACES[(SALT + i * 3 + 7) % PLACES.length]];



async function place(routeIx, signedIn) {
  const [from, to] = route(routeIx);
  const body = {
    customer_name: 'Order Door Proof',
    customer_email: 'admin@usehaf.co.uk',   // never-mailed: this is a test order
    customer_phone: '07700900000',
    collect_postcode: from, deliver_postcode: to,
    goods: 'One pallet of proof, do not deliver',
    vehicle_code: VANS[(SALT + routeIx) % VANS.length], job_type_code: 'flex'
  };
  if (signedIn) Object.assign(body, { username: USER, hash: null, relay: RELAY, cp: RELAY });
  const r = await fetch(`${SITE}/api/order/place`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const out = { status: r.status, body: await r.json().catch(() => ({})) };
  if (out.body && out.body.duplicate) {
    console.log('\n  STOPPING: the order door handed back an earlier order rather than placing a new one.');
    console.log('  Nothing after this point would mean anything. Wait fifteen minutes and run it again.\n');
    process.exit(1);
  }
  return out;
}

const show = (o) => JSON.stringify(o.body).slice(0, 260);

console.log('\nTHE ORDER DOOR — LIVE\n');

/* ---- What the van codes actually are, so a typo cannot fake a pass -------- */
const opts = await (await fetch(`${SITE}/api/order/options`)).json();
const vans = Object.keys(opts.vehicles || {});
const vanOk = VANS.every(v => vans.includes(v)) && Object.keys(opts.job_types || {}).includes('flex');
ok('the live site is answering and offers every van this proof orders', opts.ok === true && vanOk,
   'vehicles the live site offers: ' + vans.join(', '));

/* ---- 1. THE DOOR IS STILL OPEN TO EVERYONE ------------------------------- */
const guest = await place(0, false);
ok('a one-off customer with no account can still order', guest.status === 200 && guest.body.ok === true, show(guest));
ok('...and gets a reference and somewhere to pay', Boolean(guest.body.job_ref && guest.body.pay_url), show(guest));

/* ---- 2. THE FIRST ORDER ON A SIGNED-IN ACCOUNT --------------------------- */
const first = await place(1, true);
ok('a signed-in account on its first order of the day is allowed through',
   first.status === 200 && first.body.ok === true, show(first));
ok('...and gets a reference and somewhere to pay', Boolean(first.body.job_ref && first.body.pay_url), show(first));

/* ---- 3. THE SECOND ORDER, WITH THE FIRST STILL UNPAID --------------------
   This is the proof. The network has never seen this account, so its own count
   is zero. If the order screen still recorded nobody, this would sail through
   exactly as it did before today. */
if (!first.body.ok) {
  console.log('\n  STOPPING: the first order did not go through, so nothing after it means anything.');
  console.log('  ' + JSON.stringify(first.body) + '\n');
  process.exit(1);
}
const second = await place(2, true);
ok('the second order is refused — the one in flight was counted',
   second.status === 409 && second.body.ok === false, show(second));
ok('...and refused BEFORE the money: no reference, no payment link',
   !second.body.job_ref && !second.body.pay_url, show(second));
ok('...with a sentence a customer can read, not an error code',
   typeof second.body.error === 'string' && /allowance|jobs? (posted|running)/i.test(second.body.error)
   && !/error|null|undefined|exception/i.test(second.body.error),
   'message was: ' + JSON.stringify(second.body.error));
ok('...and it says which allowance and which level',
   Boolean(second.body.allowance && second.body.allowance.level && second.body.allowance.blocked_by),
   show(second));

/* ---- 4. THE LIMIT IS DATA, NOT CODE -------------------------------------
   Brent's section 12: the numbers must be changeable without a rebuild. Nothing
   is deployed between the refusal above and the acceptance below — only a row
   in the allowance table changed. */
console.log('\n  (raising this account to 3 a day — a row, no deploy)\n');
sql(`select public.haf_set_account_plan('${USER}','FREE','{"posts_per_day":3,"active_orders":3}'::jsonb,'otis:live-proof','raised mid-proof');`);

const third = await place(3, true);
ok('the same account now goes through, with nothing redeployed',
   third.status === 200 && third.body.ok === true, show(third));

console.log(`\n  test account for this run: ${USER} (flagged, on the network's test side)`);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
