/* ════════════════════════════════════════════════════════════════════════════
   HAF ACCOUNT LABEL — the ONE place an account is named.

   Brent, 9 Sep 2026: "HAF KNECT is the platform main dashboard that everyone
   gets and the PLNA is the driver platform that only drivers get access to.
   So as long as we know if they have a PLNA attached is the most important.
   Then add a business account tag when they input the company information and
   it's been verified as a company account IE companies number."

   Why this file exists at all: the words "Freight Forwarder" were written out
   by hand in nine different places, and nobody outside the trade knows what a
   freight forwarder is. HAF is for people who want freight moved and posted.
   So an account is now named after the doors it opens, and that name is worked
   out HERE and nowhere else.

       HAF KNECT              everyone — the main dashboard
       HAF KNECT + PLNA       a driver login is attached and working
       · Business             company details verified on the register

   The ROLE underneath (driver / fleet / freight_forwarder / business) is NOT
   deleted. It still decides compliance, company details and what a person may
   post — it just stops being the word a customer reads.

   ── The two rules that are easy to get wrong ────────────────────────────────
   1. "+ PLNA" is a FACT, never an inference. It is shown when the account can
      actually open PLNA today: a type that drives AND a Clever release. A
      driver who has not been released cannot sign in to PLNA, so saying they
      have one would be a lie on their own dashboard.
   2. "Business" is EARNED. A typed company name earns nothing. The tag needs a
      company number that has been checked against the public register. A
      missing field reads as NOT verified, never as verified.

   Runs unchanged as a browser <script>, as an ES module and under Node.
   ════════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HAFAccountLabel = api;
  /* eslint-disable no-undef */
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KNECT = 'HAF KNECT';
  var PLNA = 'PLNA';
  var BUSINESS = 'Business';

  /* ── What each product IS, in one sentence ────────────────────────────────
     Brent, 9 Sep 2026, giving the two definitions himself:
       "HAF KNECT  -> Platform for processing work and oversee account PLNA and
        deliveries - TMS system"
       "HAF PLNA   -> Full connector and organisor for drivers and fleet members"
     ...with the standing instruction that the wording must be "open and
     understanding to people using the accounts".

     Then, the same day, reading it back: "change the wording on the paragraph
     to a much better read and a simple sentence". So his MEANING is kept and
     his phrasing is not. What went:

       "transport management system"  — the trade name for the thing, which is
            the same failure as "freight forwarder" one layer down. A person
            who does not already know the term learns nothing from it, and a
            person who does know it did not need telling.
       "full connector and organiser" — two abstract nouns where a verb does
            the work. Nobody plans their week by being connected and organised;
            they plan their days and run their jobs.
       the dashes and the lists — a sentence with a dash in the middle is two
            sentences pretending to be one, and it reads like a spec.

     The test for each of these is the one Brent set: could somebody who has
     never heard of HAF read it once and know what they get? One sentence, one
     idea, ordinary verbs, and nothing a person has to already know. */
  var PRODUCTS = {
    knect: {
      key: 'knect',
      name: KNECT,
      /* The chip-sized form, for when there is room for four words and no more. */
      short: 'Your main HAF dashboard.',
      what: 'Your dashboard for posting work, tracking deliveries and managing your account.',
      who: 'Everyone with a HAF account.'
    },
    plna: {
      key: 'plna',
      name: 'HAF PLNA',
      short: 'The driver platform.',
      what: 'Where drivers and fleets plan their days and run their jobs.',
      who: 'Drivers and fleet members only.'
    },
    business: {
      key: 'business',
      name: BUSINESS,
      short: 'A verified company.',
      what: 'Your company number has been checked on the official register.',
      who: 'Accounts trading as a registered company.'
    }
  };

  /* The account types that can hold a PLNA login at all. Kept here so the one
     answer serves every page, and matches knect_auth()'s plna_eligible. */
  var DRIVING_TYPES = ['driver', 'fleet'];

  /* Spellings that have reached us from four different systems. haf-pay writes
     freight_forward, KNECT writes freight_forwarder, CleverPay writes freight.
     They all mean the same person, so they all normalise to one word. */
  var TYPE_ALIASES = {
    driver: 'driver', owner_driver: 'driver', ownerdriver: 'driver',
    fleet: 'fleet', courier_company: 'fleet', couriercompany: 'fleet',
    freight: 'freight_forwarder', freight_forward: 'freight_forwarder',
    freight_forwarder: 'freight_forwarder', freightforwarder: 'freight_forwarder',
    business: 'business', customer: 'business', admin: 'admin'
  };

  /* An unreadable type falls back to the LEAST it could be — an account that
     posts — never to a driver. Same rule the KNECT sidebar already follows. */
  function normaliseType(t) {
    var k = String(t == null ? '' : t).toLowerCase().trim().replace(/[\s-]+/g, '_');
    return TYPE_ALIASES[k] || 'business';
  }

  function isTrue(v) {
    return v === true || v === 'true' || v === 1 || v === '1' || v === 't';
  }

  /* ── What they DO, in words anyone recognises ─────────────────────────────
     Not shown as the account name any more. It is the question the sign-up
     asks, because it still decides compliance and company details. The old
     labels are gone: "Freight Forwarder" told a haulier nothing.

     Brent, 10 Sep 2026, on the replacement: "i think we need to change the
     wording of organise freight or find a courier or find a driver or need a
     courier? something like maybe work better".

     He is right, and "Organise Freight" failed for the same reason its
     predecessor did. It names the TRADE ("freight", "organise") rather than
     the job to be done. Nobody wakes up wanting to organise freight; they wake
     up needing somebody to take something somewhere. COURIER is the word an
     ordinary person already reaches for, so it is the word both non-driving
     tiles now use.

     Only the label Brent named is renamed. The BUSINESS blurb moves with it,
     and that is not scope creep — it is the same change finishing. The two
     tiles are read side by side, and once one of them says "Find a Courier"
     the other has to say who ELSE needs a courier, or a sole trader with their
     own pallet picks the wrong one and is asked for a company number they do
     not have. So the pair reads:

         Find a Courier   "You arrange deliveries for your customers."
         Business         "You need a courier for your own goods."

     Same word, and the only thing that separates them is the one thing that
     actually differs: whose goods are in the van. Reverting any of it is one
     line, here, and every surface follows.

     `group` is how to speak about SEVERAL of these accounts in a sentence
     ("applies to all ..."). It exists because "Organise Freight accounts" was
     already reading like a category code in five places, and "Find a Courier
     accounts" would read worse. */
  var DOES = {
    driver: { label: 'Owner Driver', blurb: 'You drive your own van.', group: 'owner drivers' },
    fleet: { label: 'Courier Company', blurb: 'You run a fleet of drivers.', group: 'courier companies' },
    freight_forwarder: { label: 'Find a Courier', blurb: 'You arrange deliveries for your customers.', group: 'accounts that post for clients' },
    business: { label: 'Business', blurb: 'You need a courier for your own goods.', group: 'accounts sending their own goods' },
    admin: { label: 'HAF Team', blurb: 'HAF staff account.', group: 'HAF staff' }
  };

  /* ── Does this account have a PLNA login attached? ────────────────────────
     Reads the record as it comes off knect_auth / plna_my_account. Accepts the
     handful of field names the four systems use, and answers no when none of
     them are present, because a missing answer is not a yes. */
  function hasPlna(acct) {
    var a = acct || {};
    var type = normaliseType(a.account_type || a.type || a.role);
    if (DRIVING_TYPES.indexOf(type) === -1) return false;
    /* Explicitly attached, whatever the system calls it. */
    if (isTrue(a.plna_attached) || isTrue(a.plna_released)) return true;
    if (isTrue(a.plna_eligible) && isTrue(a.clever_released)) return true;
    return false;
  }

  /* ── Is the company verified? ─────────────────────────────────────────────
     Only a checked company number counts. company_verified is written by the
     register check; company_no on its own is a typed string and earns nothing. */
  function isVerifiedCompany(acct) {
    var a = acct || {};
    return isTrue(a.company_verified) ||
      String(a.company_check || '').toLowerCase() === 'verified';
  }

  /* ── The label ────────────────────────────────────────────────────────────
     Returns every form a page might need, so no page has to assemble strings
     of its own and quietly invent a fifth spelling. */
  function label(acct) {
    var a = acct || {};
    var type = normaliseType(a.account_type || a.type || a.role);
    var plna = hasPlna(a);
    var business = isVerifiedCompany(a);
    var product = plna ? KNECT + ' + ' + PLNA : KNECT;
    var tags = business ? [BUSINESS] : [];
    var does = DOES[type] || DOES.business;
    return {
      type: type,            // the role underneath, normalised
      product: product,      // "HAF KNECT" or "HAF KNECT + PLNA"
      plna: plna,            // is a PLNA login attached and usable
      business: business,    // has the company number been verified
      tags: tags,            // ["Business"] or []
      does: does.label,      // what they do, in plain words
      blurb: does.blurb,
      group: does.group,     // how to say "all of these accounts" in a sentence
      /* The one-line form for a sidebar, a chip row or an email. */
      full: tags.length ? product + ' · ' + tags.join(' · ') : product,
      /* Every door this account holds, each with the sentence that says what
         it is for. A page renders these under the name so nobody has to guess
         what KNECT or PLNA means — in the order they were opened. */
      explains: explain(a)
    };
  }

  /* ── The doors this account holds, each explained ─────────────────────────
     Built from the same two answers the name is built from, so the words under
     the name can never describe a door the name does not show. */
  function explain(acct) {
    var out = [PRODUCTS.knect];
    if (hasPlna(acct)) out.push(PRODUCTS.plna);
    if (isVerifiedCompany(acct)) out.push(PRODUCTS.business);
    return out;
  }

  /* Convenience for the many places that only want the string. */
  function labelText(acct) { return label(acct).full; }

  /* One product by name, for a page that wants to describe PLNA to someone who
     does not have it yet — the join tiles and the driver's approval email. */
  function product(key) {
    return PRODUCTS[String(key == null ? '' : key).toLowerCase().trim()] || null;
  }

  return {
    KNECT: KNECT,
    DRIVING_TYPES: DRIVING_TYPES,
    DOES: DOES,
    PRODUCTS: PRODUCTS,
    product: product,
    explain: explain,
    normaliseType: normaliseType,
    hasPlna: hasPlna,
    isVerifiedCompany: isVerifiedCompany,
    label: label,
    labelText: labelText
  };
});
