/* Guards the order door's half of the account allowance.
 *
 *   node tools/order-allowance.test.mjs
 *
 * The allowance rule itself lives in the network database and is tested there.
 * What this file guards is the part that CANNOT live there, and the part that
 * has already been wrong once:
 *
 *   1. WHEN A DAY STARTS. The customer is told "your allowance resets at
 *      midnight", and the count is assembled from two halves — orders already
 *      on the network (counted in the database) and orders still in flight
 *      (counted in the worker). If those two halves measure the day from
 *      different instants, the number a person is shown is wrong and the
 *      refusal lands in the wrong place.
 *
 *      Every expectation below was verified against the database's own
 *      `date_trunc('day', ts at time zone 'Europe/London') at time zone
 *      'Europe/London'` on 10 Sep 2026 — all 18 instants agreed. So this is
 *      not my arithmetic checking my arithmetic: these are Postgres's answers,
 *      written down.
 *
 *      The first version of dayStart subtracted "how far into the day we are",
 *      which is only correct on the 363 days a year that are 24 hours long.
 *      Both clocks-change Sundays are in here on purpose, and so is the
 *      half-hour after midnight in summer, where an `hour12: false` formatter
 *      reports midnight as "24" and put the whole day out by one.
 *
 *   2. THE ORDER MUST NOT BE ABLE TO NAME ITS OWN ACCOUNT. The browser sends a
 *      credential, never a bare username. If /place ever starts trusting
 *      b.posted_by or b.username on its own, every allowance in the product
 *      becomes optional.
 *
 *   3. THE CHECK MUST SIT BEFORE THE MONEY AND AFTER THE DUPLICATE CHECK.
 *      Before the deposit, or a refusal is a refund. After the duplicate check,
 *      or pressing the button twice costs two of somebody's five.
 */
import fs from 'fs';
import path from 'path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'functions/api/order/[[path]].js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  — ' + detail : '')); }
};

/* ---- 1. WHEN A DAY STARTS -------------------------------------------------
   The three functions are lifted out of the source rather than imported, so
   this test reads the code that actually ships. */
const lift = (name) => {
  const m = SRC.match(new RegExp('^function ' + name + '\\([\\s\\S]*?\\n\\}$', 'm'));
  if (!m) throw new Error('could not find function ' + name + ' in the order endpoint');
  return m[0];
};
const dayStart = new Function(
  lift('londonParts') + '\n' + lift('londonOffsetMs') + '\n' + lift('dayStart')
  + '\nreturn dayStart;')();

const DAYS = [
  ['2026-06-30T12:00:00Z', '2026-06-29T23:00:00.000Z', 'an ordinary summer afternoon'],
  ['2026-09-10T19:27:52Z', '2026-09-09T23:00:00.000Z', 'BST afternoon'],
  ['2026-09-10T22:59:59Z', '2026-09-09T23:00:00.000Z', 'one second before midnight, BST'],
  ['2026-09-10T23:00:00Z', '2026-09-10T23:00:00.000Z', 'the stroke of midnight, BST'],
  ['2026-09-10T23:30:00Z', '2026-09-10T23:00:00.000Z', '00:30 London in summer \u2014 the hour that was a day out'],
  ['2026-12-10T00:30:00Z', '2026-12-10T00:00:00.000Z', '00:30 London in winter'],
  ['2026-12-10T10:00:00Z', '2026-12-10T00:00:00.000Z', 'an ordinary winter morning'],
  ['2027-01-01T00:00:30Z', '2027-01-01T00:00:00.000Z', 'thirty seconds into the new year'],
  ['2026-11-01T00:00:00Z', '2026-11-01T00:00:00.000Z', 'the first midnight after the clocks go back'],
  // The two Sundays that are not 24 hours long. Note what the last three say:
  // London midnight on 25 October falls while BST is still in force, so the day
  // starts at 23:00 UTC the evening before. I typed 00:00 by hand and the test
  // failed — which is exactly why these are generated, not written.
  ['2026-03-28T23:30:00Z', '2026-03-28T00:00:00.000Z', 'the evening before the clocks go forward'],
  ['2026-03-29T00:30:00Z', '2026-03-29T00:00:00.000Z', 'clocks-forward Sunday, before the jump'],
  ['2026-03-29T01:00:00Z', '2026-03-29T00:00:00.000Z', 'clocks-forward Sunday, the jump itself'],
  ['2026-03-29T02:00:00Z', '2026-03-29T00:00:00.000Z', 'clocks-forward Sunday, after the jump'],
  ['2026-03-29T22:00:00Z', '2026-03-29T00:00:00.000Z', 'clocks-forward Sunday, late evening'],
  ['2026-10-24T23:30:00Z', '2026-10-24T23:00:00.000Z', 'the evening before the clocks go back'],
  ['2026-10-25T00:30:00Z', '2026-10-24T23:00:00.000Z', 'clocks-back Sunday, inside the doubled hour'],
  ['2026-10-25T01:30:00Z', '2026-10-24T23:00:00.000Z', 'clocks-back Sunday, after the doubled hour'],
  ['2026-10-25T15:00:00Z', '2026-10-24T23:00:00.000Z', 'clocks-back Sunday, afternoon']
];
for (const [at, want, why] of DAYS) {
  const got = dayStart(new Date(at));
  ok('day starts ' + want + ' — ' + why, got === want, 'got ' + got);
}

/* ---- 2. THE BROWSER CANNOT NAME ITS OWN ACCOUNT ------------------------- */
ok('the account is proved with whoIsAsking, not read from the request',
   /const asking = await whoIsAsking\(b\)/.test(SRC)
   && /postedBy = asking && asking\.haf_username/.test(SRC));
ok('nothing in /place ever reads a username straight off the request body',
   !/b\.posted_by/.test(SRC) && !/b\.username/.test(SRC) && !/b\.haf_username/.test(SRC));
ok('the proved account is what lands on the order',
   /posted_by: postedBy/.test(SRC));

/* ---- 3. WHERE THE CHECK SITS -------------------------------------------- */
const atDuplicate = SRC.indexOf('duplicate: true');
const atGate = SRC.indexOf('await askTheDoor(');
const atOrderWrite = SRC.indexOf("coreInsert(env, 'job_order'");
const atDeposit = SRC.indexOf("coreInsert(env, 'job_payment'");
ok('the allowance is checked AFTER the duplicate check (a second press is free)',
   atDuplicate > -1 && atGate > atDuplicate, `duplicate at ${atDuplicate}, gate at ${atGate}`);
ok('the allowance is checked BEFORE the order is written',
   atGate > -1 && atOrderWrite > atGate, `gate at ${atGate}, order write at ${atOrderWrite}`);
ok('the allowance is checked BEFORE the holding deposit is raised',
   atGate > -1 && atDeposit > atGate, `gate at ${atGate}, deposit at ${atDeposit}`);

/* ---- 4. WHAT IS COUNTED AS "IN FLIGHT" ---------------------------------- */
ok('only orders not yet on the network are counted as pending',
   /status=in\.\(new,deposit_held\)/.test(SRC));
ok('a failed allowance call lets the order through rather than becoming an outage',
   /return null;\n  }\n}/.test(SRC) && /catch \(_\) \{/.test(SRC));

/* ---- 5. THE DRIVING SIDE IS NOT IN HERE AT ALL -------------------------- */
ok('nothing in the order door touches the Clever release',
   !/plna_is_cleared|clever_released|cleared_at/.test(SRC));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
