/* THE WAY IN — from the tour to the working product.

   Brent, 11 Sep 2026: keep the old copy, with all the information and the
   account comparison, "and allow people then to enter the site like you've
   made it, given them the way it's built now doesnt really explain much".

   So the two halves do the two jobs. This page explains: what Free, Plus and
   Pro each include, what the same job costs under five different account
   combinations, and where every pound goes. The working demo at
   knect-demo-centre.pages.dev is the real KNECT on its own database, where a
   person signs in and actually drives it.

   A visitor who has just read all that should never have to hunt for the door.
   So it appears in the three places they might look for it:

     1. at the top of every Demo Centre screen, once they have read one;
     2. in the sign-in box, because "how do I get in" is the question that
        sends people there in the first place;
     3. as a button that stays on screen the whole time.

   WRITTEN FROM THE OUTSIDE, ON PURPOSE. This page is 798KB and it changes.
   Nothing in here edits the app's own internals, reads its variables or
   depends on where anything sits in the file; it finds elements by the ids the
   app has always had, and if one is missing that part simply does not appear.
   The tour keeps working either way. */

(function () {
  'use strict';

  var DEMO_URL = 'https://knect-demo-centre.pages.dev/';

  /* The four accounts a stranger is invited to use. DEMO1005 is the master
     account and is deliberately NOT listed: it opens the back office — the
     network overview and the pricing levers — and that is the part of HAF that
     is not for a public page. Brent can still type it in on camera. */
  var ACCOUNTS = [
    ['DEMO1001', 'A driver, checked and cleared'],
    ['DEMO1002', 'A driver still waiting on documents'],
    ['DEMO1003', 'A fleet running several vans'],
    ['DEMO1004', 'A business sending goods']
  ];

  var PANES = ['pane-dc-free', 'pane-dc-plus', 'pane-dc-pro',
               'pane-dc-compare', 'pane-dc-sim'];

  function css() {
    if (document.getElementById('haf-front-css')) return;
    var s = document.createElement('style');
    s.id = 'haf-front-css';
    /* Brand tokens only. A colour typed in here is a colour that stops
       matching the day the brand moves, and it would ignore night mode. */
    s.textContent = [
      '.hf-door{border:1px solid var(--or);border-radius:14px;padding:.9rem 1rem;',
      '  margin:0 0 1rem;background:var(--p);display:block}',
      '.hf-door h3{margin:0 0 .3rem;font-family:var(--dp);font-weight:900;',
      '  font-size:.95rem;letter-spacing:-.02em;color:var(--tx)}',
      '.hf-door p{margin:0 0 .7rem;font-size:.78rem;line-height:1.5;color:var(--mu)}',
      '.hf-door .hf-go{display:inline-flex;align-items:center;gap:.4rem;',
      '  padding:.5rem .9rem;border-radius:10px;border:0;cursor:pointer;',
      '  background:var(--or);color:var(--haf-on-orange,#0e1113);',
      '  font-weight:800;font-size:.8rem;text-decoration:none}',
      '.hf-door .hf-go:hover{filter:brightness(1.06)}',
      '.hf-logins{margin:.75rem 0 0;padding:0;list-style:none;',
      '  display:grid;gap:.3rem}',
      '.hf-logins li{font-size:.72rem;color:var(--mu);display:flex;gap:.5rem;',
      '  align-items:baseline;flex-wrap:wrap}',
      '.hf-logins b{font-family:var(--mn,monospace);font-weight:800;color:var(--tx);',
      '  letter-spacing:.02em}',
      '.hf-pin{font-size:.7rem;color:var(--mu);margin:.5rem 0 0}',
      '.hf-float{position:fixed;right:1rem;bottom:1rem;z-index:9000;',
      '  padding:.6rem 1rem;border-radius:24px;border:0;cursor:pointer;',
      '  background:var(--or);color:var(--haf-on-orange,#0e1113);',
      '  font-weight:800;font-size:.78rem;text-decoration:none;',
      '  box-shadow:0 6px 20px rgba(0,0,0,.28)}',
      '@media(max-width:560px){.hf-float{right:.7rem;bottom:4.5rem}}'
    ].join('');
    document.head.appendChild(s);
  }

  function logins() {
    var ul = document.createElement('ul');
    ul.className = 'hf-logins';
    ACCOUNTS.forEach(function (a) {
      var li = document.createElement('li');
      var b = document.createElement('b');
      b.textContent = a[0];
      li.appendChild(b);
      li.appendChild(document.createTextNode(a[1]));
      ul.appendChild(li);
    });
    return ul;
  }

  function door(opts) {
    var d = document.createElement('div');
    d.className = 'hf-door';

    var h = document.createElement('h3');
    h.textContent = opts.heading;
    d.appendChild(h);

    var p = document.createElement('p');
    p.textContent = opts.body;
    d.appendChild(p);

    var a = document.createElement('a');
    a.className = 'hf-go';
    a.href = DEMO_URL;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Open the working demo →';
    d.appendChild(a);

    if (opts.withLogins) {
      d.appendChild(logins());
      var pin = document.createElement('p');
      pin.className = 'hf-pin';
      pin.textContent = 'The PIN is the last four digits of the username. '
        + 'Everything is wiped and set back every night, so you cannot break it.';
      d.appendChild(pin);
    }
    return d;
  }

  /* 1. the top of every Demo Centre screen.
     The card goes into the pane itself and not into dc-host, because dc-host is
     rewritten every time a screen is opened and anything put inside it would
     vanish on the second visit. */
  function intoPanes() {
    PANES.forEach(function (id) {
      var pane = document.getElementById(id);
      if (!pane || pane.querySelector('.hf-door')) return;
      pane.insertBefore(door({
        heading: 'This explains it. Now go and drive it.',
        body: 'These screens show what each account includes and what a job costs '
            + 'under each one. The working demo is the real HAF KNECT: sign in, '
            + 'post a job, pay the deposit and watch it land in the booking '
            + 'system. It runs on its own separate database, so nothing you do '
            + 'there reaches the live network or a real courier.',
        withLogins: true
      }), pane.firstChild);
    });
  }

  /* 2. the sign-in box. Somebody who opens this is asking to get in, and the
     answer on a demo is not "use your HAF account" — most of them do not have
     one yet. The tour's own demo accounts sit below, untouched. */
  function intoLogin() {
    var box = document.querySelector('#login-ov .obox');
    if (!box || box.querySelector('.hf-door')) return;
    var h2 = box.querySelector('h2');
    var d = door({
      heading: 'Want to sign in and use it?',
      body: 'The working demo has accounts ready to go, with no sign-up and '
          + 'nothing to lose. It is the real product on a separate database.',
      withLogins: true
    });
    if (h2) box.insertBefore(d, h2);
    else box.appendChild(d);
  }

  /* 3. the button that never leaves. The Demo Centre is five long screens and
     the card at the top scrolls away. */
  function float_() {
    if (document.getElementById('hf-float')) return;
    var a = document.createElement('a');
    a.id = 'hf-float';
    a.className = 'hf-float';
    a.href = DEMO_URL;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Try it yourself →';
    document.body.appendChild(a);
  }

  function paint() {
    css();
    intoPanes();
    intoLogin();
    float_();
  }

  /* The panes are in the page from the start, but the Demo Centre is only
     reached after a code and a mode choice, and the app rebuilds parts of
     itself as it goes. Painting once on load would put the card in before some
     of those rebuilds and lose it. So it repaints on any change to the page,
     and each step checks for its own work before doing it again. */
  function watch() {
    paint();
    var pending = null;
    new MutationObserver(function () {
      if (pending) return;
      pending = setTimeout(function () { pending = null; paint(); }, 120);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watch);
  } else {
    watch();
  }
})();
