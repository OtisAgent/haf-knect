/* A tracking link must stop working. These check the one place that decides
   whether a stored link is still good, so the share page and the position
   gateway can never disagree about what "valid" means.
   Run: node tools/tracking-link-expiry.test.mjs */
import { linkState } from '../functions/api/link.js';

const NOW = Date.UTC(2026, 7, 16, 12, 0, 0);
const at = (mins) => new Date(NOW + mins * 60000).toISOString();

let pass = 0, fail = 0;
const is = (label, got, want) => {
  if (got === want) { pass++; return; }
  fail++; console.error(`  FAIL ${label}: got "${got}", wanted "${want}"`);
};

is('a link with time left resolves', linkState({ expires_at: at(60) }, NOW), 'ok');
is('a link past its expiry is refused', linkState({ expires_at: at(-1) }, NOW), 'expired');
is('expiry on the exact second is refused', linkState({ expires_at: at(0) }, NOW), 'expired');
is('a revoked link is refused even with time left',
   linkState({ expires_at: at(600), revoked_at: at(-5) }, NOW), 'revoked');
is('revocation is reported ahead of expiry',
   linkState({ expires_at: at(-600), revoked_at: at(-5) }, NOW), 'revoked');
is('a revocation dated in the future does not bite yet',
   linkState({ expires_at: at(600), revoked_at: at(5) }, NOW), 'ok');
is('an unknown token is missing', linkState(null, NOW), 'missing');
is('a link with no expiry recorded still resolves', linkState({ job: 'HAF-1' }, NOW), 'ok');

console.log(`tracking-link-expiry: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
