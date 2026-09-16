/* ════════════════════════════════════════════════════════════════════════════
   COMPANY CHECK — what earns the "Business" tag.

   Brent, 9 Sep 2026: "add a business account tag when they input the company
   information and it's been verified as a company account IE companies number."

   So a typed company name earns nothing. The tag is earned by a company number
   that has been looked up on the public register and comes back real.

   The lookup uses the Companies House PUBLIC record — the same page anyone can
   open in a browser — so it needs no key and costs nothing. One request per
   sign-up, never a bulk sweep. If Companies House is slow or down, the answer
   is "unchecked", NOT "verified" and NOT "rejected": we never brand a real
   company fake because their register was having a bad morning, and we never
   hand out the tag because we failed to look.

   Returns one of three states, and only one of them earns the tag:
     verified   — the number is a real company; name and status came back
     not_found  — the register says no such company
     unchecked  — we could not reach the register (retry later)

   ── WHY THIS FILE IS A PLAIN ES MODULE ──────────────────────────────────────
   10 Sep 2026. It used to be a UMD bundle: one big function that built an
   object of everything and hung it on a global, with the named exports read
   back off that global. Nothing wrong with the logic — but a bundler cannot
   see through it. Registering a global is a side effect, so every byte of this
   file was welded into the payment worker even though the worker calls exactly
   ONE function out of it. The payment worker has a hard 20,000-byte ceiling on
   what can be uploaded in one piece, and that dead weight is what pushed it
   over and stopped join.usehaf.co.uk being republished at all.

   As plain exports, the bundler keeps what is used and drops what is not. It
   is still the ONE definition — haf-account-label/sync.sh copies this file to
   every surface that needs it, unchanged, so there is no second copy to drift.
   ════════════════════════════════════════════════════════════════════════════ */

export const REGISTER = 'https://find-and-update.company-information.service.gov.uk/company/';

/* UK company numbers are 8 characters. Plain numeric ones are written without
   their leading zeros all the time ("1234567" for 01234567), and a person
   typing their own number should not be told it is wrong because of that.
   Prefixed numbers (SC, NI, OC, FC ...) are two letters then six digits. */
export function normalise(input) {
  const s = String(input == null ? '' : input).toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!s) return '';
  if (/^\d+$/.test(s)) return s.length <= 8 ? s.padStart(8, '0') : '';
  const m = s.match(/^([A-Z]{2})(\d+)$/);
  if (m && m[2].length <= 6) return m[1] + m[2].padStart(6, '0');
  return s.length === 8 ? s : '';
}

/* Shape only. A number that cannot be a company number is refused before we
   bother the register with it. */
export function looksLikeCompanyNumber(input) {
  return normalise(input).length === 8;
}

/* The register page carries the name in the page heading and the status in a
   labelled block. Two narrow reads, both tolerant of whitespace, and neither
   one is allowed to invent a pass: no name found means not verified. */
export function readRegisterPage(html) {
  const text = String(html || '');
  let name = '';
  const m = text.match(/<h1[^>]*class="heading-xlarge"[^>]*>([\s\S]*?)<\/h1>/i) ||
            text.match(/<p[^>]*class="heading-xlarge"[^>]*>([\s\S]*?)<\/p>/i);
  if (m) name = m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  let status = '';
  const s = text.match(/id="company-status"[^>]*>([\s\S]*?)</i);
  if (s) status = s[1].replace(/\s+/g, ' ').trim();
  return { name, status };
}

/* Names never match character for character — people type "Ltd" for
   "LIMITED", drop the comma, add "The". So the comparison is deliberately
   loose, and a mismatch is reported rather than used to fail the check: the
   number is what was verified, and the registered name is what we store. */
export function nameLooksLike(typed, registered) {
  const tidy = (v) => String(v || '').toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\b(LIMITED|LTD|PLC|LLP|COMPANY|CO|THE)\b/g, ' ')
    .replace(/[^A-Z0-9]/g, '');
  const a = tidy(typed), b = tidy(registered);
  if (!a || !b) return false;
  return a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0;
}

/* fetchImpl is injected so this can be tested without the internet and run
   unchanged inside a Cloudflare Worker. */
export async function checkCompanyNumber(input, opts) {
  const o = opts || {};
  const doFetch = o.fetch || (typeof fetch === 'function' ? fetch : null);
  const number = normalise(input);
  if (!number) {
    return { state: 'not_found', number: '', name: '', status: '',
             reason: 'that does not look like a company number' };
  }
  if (!doFetch) return { state: 'unchecked', number, name: '', status: '',
                         reason: 'no way to reach the register' };

  let res;
  try {
    res = await doFetch(REGISTER + number, {
      headers: { 'accept': 'text/html', 'user-agent': 'HAF-account-check' },
      signal: o.signal
    });
  } catch (e) {
    return { state: 'unchecked', number, name: '', status: '',
             reason: 'could not reach the register' };
  }

  if (res.status === 404) {
    return { state: 'not_found', number, name: '', status: '',
             reason: 'no company with that number' };
  }
  if (!res.ok) {
    return { state: 'unchecked', number, name: '', status: '',
             reason: 'the register answered ' + res.status };
  }

  const html = await res.text();
  const read = readRegisterPage(html);
  if (!read.name) {
    return { state: 'unchecked', number, name: '', status: '',
             reason: 'the register page could not be read' };
  }
  return {
    state: 'verified',
    number,
    name: read.name,
    status: read.status,
    /* Dissolved companies are still REAL companies and still verify. Whether
       HAF wants to trade with one is a business call for the Clever checks,
       not something this function decides quietly. */
    dissolved: /dissolved|liquidation|closed/i.test(read.status),
    reason: ''
  };
}
