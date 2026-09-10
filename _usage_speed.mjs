/* HOW LONG THE ALLOWANCE ANSWER TAKES, ON THE LIVE SITE.
 *
 *   node _usage_speed.mjs            (makes a fresh test account, times it, tidies up)
 *   KEEP=1 node _usage_speed.mjs     (leaves the account behind for a second run)
 *   USER=ZZ991234 node _usage_speed.mjs   (reuse one already made)
 *
 * Run once BEFORE a deploy and once after, and the two numbers are the finding.
 * The account is born is_test so nothing it does can be mistaken for a customer,
 * and it places no orders at all — this only reads.
 */
import { execFileSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';

const SITE = 'https://knect.usehaf.co.uk';
const DBURL = execFileSync('bash', ['-lc',
  "grep -oE 'postgresql://[^ \"]+' /agent/workspace/haf-driver-app/.env.local | head -1"]).toString().trim();
const sql = (q) => execFileSync('psql', [DBURL, '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q]).toString().trim();

const PIN = '4471';
const USER = process.env.USER_OVERRIDE || process.env.USER_ACC
  || 'ZZ99' + String(randomBytes(2).readUInt16BE() % 10000).padStart(4, '0');
const RELAY = createHash('sha256').update(`${USER}:${PIN}`).digest('hex');
const CP = createHash('sha256').update(`HAF-CP|${USER}|${PIN}`).digest('hex');
const made = !process.env.USER_ACC;

if (made) {
  sql(`insert into public.haf_network_account (ref, username, full_name, email, account_type,
         stage, status, tier, is_test, source)
       values ('ZZSPD-${USER}','${USER}','Allowance Speed Proof','zz${USER.toLowerCase()}@example.invalid',
               'freight','applied','active','free', true, 'cleverpay');
       insert into public.plna_drivers (haf_username, full_name, initials, password_hash,
         pin_hash, cp_pin_hash, account_type)
       values ('${USER}','Allowance Speed Proof','AS','no-password-on-this-fixture','${RELAY}','${CP}','freight_forwarder');
       select public.haf_set_account_plan('${USER}','FREE',null,'otis-speed-proof');`);
  console.log('test account made:', USER);
} else {
  console.log('reusing account:', USER);
}

const body = JSON.stringify({ username: USER, hash: null, relay: RELAY, cp: RELAY });

async function once() {
  const t = Date.now();
  const r = await fetch(`${SITE}/api/order/allowance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body
  });
  const d = await r.json().catch(() => null);
  return { ms: Date.now() - t, status: r.status, d };
}

const runs = [];
let last = null;
for (let i = 0; i < 6; i++) {
  const r = await once();
  runs.push(r.ms);
  last = r;
  console.log(`  call ${i + 1}: ${r.ms} ms  http ${r.status}`);
}
runs.sort((a, b) => a - b);
const median = runs[Math.floor(runs.length / 2)];
console.log(`\nfastest ${runs[0]} ms · median ${median} ms · slowest ${runs[runs.length - 1]} ms`);

console.log('\nthe answer the page gets back:');
console.log(JSON.stringify(last.d, null, 2));

/* The shape the page depends on. If any of these went missing the row would
   quietly stop drawing, which is the failure a timing test would not catch. */
const d = last.d || {};
const need = [
  ['signed_in true', d.signed_in === true],
  ['counted true', d.counted === true],
  ['a level', typeof d.level === 'string' && d.level.length > 0],
  ['a label to show', typeof (d.label || d.level) === 'string'],
  ['allowances present', !!d.allowances && 'posts_per_day' in d.allowances],
  ['posts used is a number', Number.isFinite((d.used || {}).posts_today)],
  ['running used is a number', Number.isFinite((d.used || {}).active_orders)]
];
console.log('');
for (const [what, ok] of need) console.log(`  ${ok ? 'yes' : 'NO '}  ${what}`);

/* A bad credential must still be answered with nothing, not with somebody's plan. */
const junk = await fetch(`${SITE}/api/order/allowance`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USER, relay: 'not-the-right-hash' })
}).then(r => r.json()).catch(() => null);
const junkSafe = junk && junk.counted !== true && !junk.allowances && !junk.level;
console.log(`  ${junkSafe ? 'yes' : 'NO '}  a wrong PIN is told nothing (${JSON.stringify(junk)})`);

/* And no credential at all should not even reach a database. */
const nocred = await fetch(`${SITE}/api/order/allowance`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USER })
}).then(r => r.json()).catch(() => null);
console.log(`  ${nocred && nocred.signed_in === false ? 'yes' : 'NO '}  no credential is answered "not signed in"`);

if (made && !process.env.KEEP) {
  sql(`delete from public.plna_drivers where haf_username='${USER}';
       delete from public.haf_network_account where username='${USER}';`);
  console.log('\ntest account removed');
} else if (made) {
  console.log(`\nkept: USER_ACC=${USER} PROOF_USER=${USER}`);
}

const allOk = need.every(([, ok]) => ok) && junkSafe;
process.exit(allOk ? 0 : 1);
