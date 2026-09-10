/* EYES ON THE USAGE STRIP, on the live site, signed in as a real account.
 *
 *   PROOF_USER=ZZ... PROOF_PIN=4471 node _usage_strip_eyes.mjs
 *
 * A strip that a person never sees is not a feature. This signs in the way a
 * customer does — username and PIN on the live sign-in screen, no shortcuts —
 * opens Find a Courier, and reads back the sentence that is actually rendered.
 */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';

const SITE = 'https://knect.usehaf.co.uk/';
const USER = process.env.PROOF_USER;
const PIN = process.env.PROOF_PIN || '4471';
if (!USER) { console.error('PROOF_USER not set'); process.exit(1); }

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1100 } });
const problems = [];
p.on('pageerror', e => problems.push('page error: ' + e.message));

await p.goto(SITE, { waitUntil: 'load' });
await p.waitForTimeout(1200);

/* Sign in exactly as a person does. */
await p.evaluate(() => openLogin());
await p.waitForTimeout(400);
await p.fill('#l-user', USER);
await p.fill('#l-pass', PIN);
await p.evaluate(() => doLogin());
await p.waitForTimeout(3500);

const signedIn = await p.evaluate(() => (localStorage.getItem('knect-user') || '') !== ''
  && document.getElementById('app') && document.getElementById('app').classList.contains('open'));
console.log('signed in:', signedIn);
if (!signedIn) { console.log('could not sign in — stopping'); await b.close(); process.exit(1); }

/* Open Find a Courier the way a signed-in member actually reaches it. Signing in
   opens the dashboard and HIDES the landing page, and the consignment form lives
   on the landing page — so a test that calls openFlow() straight after sign-in
   paints the row inside a hidden parent and reads back an empty box. Go back the
   way the back button does first. */
await p.evaluate(() => goLanding());
await p.waitForTimeout(500);
await p.evaluate(() => openFlow('fast'));
/* The row is fetched from our own server, and that answer takes between one and
   four seconds. Waiting a fixed 2.5s made this proof fail on a slow answer and
   pass on a fast one, which is worse than either. Poll instead, and say how long
   it took — a row a customer waits four seconds for is a finding, not a pass. */
const startedAt = Date.now();
for (let i = 0; i < 24; i++) {
  const up = await p.evaluate(() => {
    const e = document.getElementById('fq-use');
    return !!e && getComputedStyle(e).display !== 'none';
  });
  if (up) break;
  await p.waitForTimeout(500);
}
console.log('the row appeared after', ((Date.now() - startedAt) / 1000).toFixed(1), 'seconds');

const strip = await p.evaluate(() => {
  const el = document.getElementById('fq-use');
  if (!el) return { present: false };
  const cs = getComputedStyle(el);
  return {
    present: true,
    visible: cs.display !== 'none' && el.offsetHeight > 0,
    classes: el.className,
    text: (el.innerText || '').replace(/\s+/g, ' ').trim()
  };
});
console.log('\nthe strip a customer actually sees:');
console.log(JSON.stringify(strip, null, 2));

await p.evaluate(() => { const e = document.getElementById('fq-use'); if (e) e.scrollIntoView({ block: 'center' }); });
await p.waitForTimeout(400);
await p.screenshot({ path: '/agent/workspace/haf-knect-ops/_usage_strip.png' });

if (problems.length) console.log('\nJAVASCRIPT PROBLEMS ON THE PAGE:\n  ' + problems.join('\n  '));
else console.log('\nno javascript errors on the page');

await b.close();
process.exit(strip.present && strip.visible && !problems.length ? 0 : 1);
