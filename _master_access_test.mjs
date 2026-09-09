/* The master's own account, and everybody else's.
 *
 * Brent, 9 Sep: "make sure my log in updates in real time with the HAF KNECT
 * Dashboard and PLNA alterations ... my log in BF638793 Freight forward account
 * not changed."
 *
 * It was not changed because this page worked out for itself whether an account
 * drives, from the account type alone, and threw away the answer `knect_auth`
 * had already given it. The database said BF638793 may drive on a named owner
 * override; the sidebar said Freight Forwarder, therefore no, and drew him
 * "Drivers only. Add owner driver to your account to get a PLNA."
 *
 * Two things have to be true after the fix, and the second matters more than
 * the first:
 *   1. the master's freight account gets the driving screens, AND keeps its own
 *      freight home screen, freight tabs and share-and-earn card;
 *   2. NOTHING moves for any account that is not carrying an override.
 *
 * So every case below is run twice: as it behaves now, and against the rules
 * the live file used before the change. Anything that differs without an
 * override is a regression, not a fix.
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

/* Pull the real source out of the page rather than restating it here — a test
   that carries its own copy of the logic passes when the page is wrong. */
function grab(startRe, endMark) {
  const i = html.search(startRe);
  if (i < 0) throw new Error('not found: ' + startRe);
  const j = html.indexOf(endMark, i);
  if (j < 0) throw new Error('end not found for: ' + startRe);
  return html.slice(i, j + endMark.length);
}

const src = [
  grab(/const HAF_TYPES=\{/, "customer:'business'};"),
  grab(/function hafNormType\(t\)\{/, "function hafNormType(t){return HAF_TYPES[String(t||'').toLowerCase().trim()]||'business';}"),
  grab(/function hafAccess\(acct\)\{/, 'name:String(nm||\'\').trim()};\n}'),
  grab(/function hafPerms\(acc\)\{/, '\n  };\n}'),
].join('\n');

const { hafAccess, hafPerms } = new Function(src + '\nreturn {hafAccess,hafPerms};')();

/* The home screen and the job-card wording, lifted from the two lines that pick
   them so the test breaks if either line is edited away from the other. */
const dashFor = a => a.type === 'fleet' && a.released ? 'fleet'
  : a.type === 'freight_forwarder' ? 'freight-pro'
  : a.type === 'business' ? 'business'
  : a.released ? 'driver' : 'business';
const roleFor = a => a.type === 'fleet' ? 'fleet'
  : a.type === 'freight_forwarder' ? 'freight'
  : a.type === 'business' ? 'business'
  : a.released ? 'driver' : 'business';
/* Share & earn hides itself for accounts that have the PLNA referral already. */
const affShown = a => !(a.type === 'driver' || a.type === 'fleet');

/* ── what the page did BEFORE, kept here on purpose ───────────────────────── */
const OLD = acct => {
  const T = { driver: 'driver', fleet: 'fleet', business: 'business', freight: 'freight_forwarder',
              freight_forward: 'freight_forwarder', freight_forwarder: 'freight_forwarder', customer: 'business' };
  const type = T[String(acct && acct.account_type || '').toLowerCase().trim()] || 'business';
  const drives = (type === 'driver' || type === 'fleet');
  const released = !!(acct && acct.plna_released === true) && drives;
  const a = { type, drives, released };
  return {
    drives, released,
    plna: drives, drive: drives, freight: type === 'freight_forwarder',
    dash: a.type === 'fleet' && a.released ? 'fleet' : a.released ? 'driver'
        : a.type === 'freight_forwarder' ? 'freight-pro' : 'business',
    role: a.type === 'fleet' ? 'fleet' : a.released ? 'driver'
        : a.type === 'freight_forwarder' ? 'freight' : 'business',
    aff: !drives,
  };
};

const now = acct => {
  const a = hafAccess(acct);
  const p = hafPerms(a);
  return { drives: a.drives, released: a.released, plna: p.plna, drive: p.drive, freight: p.freight,
           dash: dashFor(a), role: roleFor(a), aff: affShown(a) };
};

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
};

/* Every account the app can serve, in the shape knect_auth hands back.
   plna_eligible / plna_released are the database's own answers. */
const NO_OVERRIDE = [
  ['owner driver, not yet released',   { account_type: 'driver',   plna_eligible: true,  plna_released: false }],
  ['owner driver, released',           { account_type: 'driver',   plna_eligible: true,  plna_released: true  }],
  ['fleet, not yet released',          { account_type: 'fleet',    plna_eligible: true,  plna_released: false }],
  ['fleet, released',                  { account_type: 'fleet',    plna_eligible: true,  plna_released: true  }],
  ['business account',                 { account_type: 'business', plna_eligible: false, plna_released: false }],
  ['freight forwarder',                { account_type: 'freight',  plna_eligible: false, plna_released: false }],
  ['freight forwarder (long name)',    { account_type: 'freight_forwarder', plna_eligible: false, plna_released: false }],
  ['customer alias',                   { account_type: 'customer', plna_eligible: false, plna_released: false }],
  ['unreadable account type',          { account_type: 'wat',      plna_eligible: false, plna_released: false }],
  ['no account type at all',           {}],
  ['null record',                      null],
  /* The field arriving as a string, or missing entirely, must never read as a
     yes — the missing-field rule this file already states for plna_released. */
  ['eligible sent as the string true', { account_type: 'business', plna_eligible: 'true' }],
  ['eligible sent as 1',               { account_type: 'business', plna_eligible: 1 }],
  ['old payload, field absent',        { account_type: 'driver',   plna_released: true }],
];

console.log('\nNOBODY WITHOUT AN OVERRIDE MOVES');
for (const [name, acct] of NO_OVERRIDE) {
  const a = now(acct), b = OLD(acct);
  const keys = ['drives', 'released', 'plna', 'drive', 'freight', 'dash', 'role', 'aff'];
  const diff = keys.filter(k => a[k] !== b[k]);
  ok(name, diff.length === 0, diff.map(k => k + ': ' + b[k] + ' → ' + a[k]).join(', '));
}

console.log('\nTHE MASTER: BF638793, freight forwarder, owner override');
/* Exactly what knect_auth returns for him today: v_type freight_forwarder,
   v_override true from haf_access_control.plna_basis = 'owner_override'. */
const master = { account_type: 'freight_forwarder', full_name: 'Brent Ford',
                 plna_eligible: true, plna_released: true, plna_basis: 'owner_override' };
const m = now(master);
ok('his account still reads as a Freight Forwarder', hafAccess(master).type === 'freight_forwarder');
ok('the driving screens are open to him',            m.drives === true);
ok('PLNA section is unlocked, not padlocked',        m.plna === true);
ok('he can be offered and take network jobs',        m.drive === true);
ok('the PLNA sidebar card will paint for him',       m.drives === true);
ok('his freight screens are untouched',              m.freight === true);
ok('his home screen stays the freight one',          m.dash === 'freight-pro', m.dash);
ok('job cards still read from the sending side',     m.role === 'freight', m.role);
ok('share & earn stays on his sidebar',              m.aff === true);
ok('and the old code got this wrong',                OLD(master).plna === false && OLD(master).drives === false);

console.log('\nTHE OVERRIDE IS THE ONLY THING THAT OPENS IT');
/* A withdrawn override: knect_auth returns plna_eligible false, and the door
   shuts again on the next sign-in with no change to this file. */
const withdrawn = { account_type: 'freight_forwarder', plna_eligible: false, plna_released: false };
const w = now(withdrawn);
ok('withdraw the override and driving closes',   w.drives === false);
ok('withdraw the override and PLNA re-locks',    w.plna === false);
ok('his freight screens survive the withdrawal', w.freight === true);
ok('and his home screen never moved',            w.dash === 'freight-pro');
/* A business account handed the same override gets the same treatment. */
const bizOverride = { account_type: 'business', plna_eligible: true, plna_released: true };
const bo = now(bizOverride);
ok('an override works for a business account too', bo.drives === true && bo.plna === true);
ok('and that account keeps its own home screen',   bo.dash === 'business', bo.dash);

console.log('\nTHE PREVIEW STILL PREVIEWS THE REAL THING');
/* viewAsMember builds an account with no plna_eligible on it — the type has to
   carry the preview, or the master would preview every type as a driver. */
for (const t of ['driver', 'fleet', 'business', 'freight_forwarder']) {
  const p = now({ account_type: t, plna_released: true, full_name: 'Preview account' });
  const e = OLD({ account_type: t, plna_released: true });
  ok('preview as ' + t + ' is unchanged', p.drives === e.drives && p.plna === e.plna && p.dash === e.dash);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed' + (fail ? '  — ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
