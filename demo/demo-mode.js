/* HAF KNECT DEMO — the demo layer.

   Brent, 11 Sep 2026: "so i can showcase HAF KNECT on live streams and make
   content plus other people can try it out without effecting the major
   section. when it gets to the payment section just allow it to go through on
   the demo centre and explain what would have happened at that stage and put
   it in the booking system for example".

   TWO JOBS, AND NOTHING ELSE.
   1. Say what this is, permanently and everywhere, so nobody watching a video
      ever mistakes a demo booking for a real one.
   2. Catch the payment moment, explain in plain words what would really have
      happened, and then let the journey carry on so the job lands on the board.

   WHY THIS IS A SEPARATE FILE AND NOT A PATCH INTO THE APP.
   The Demo Centre is rebuilt from the LIVE app on every deploy — that is the
   whole point of it, and it is what stops it rotting into a stale copy again.
   So anything that edits the app's own internals by position would break the
   first time the live app moved. This attaches from the outside: one delegated
   click listener and one banner. The app underneath can change freely.

   NO MONEY EXISTS HERE. This file never talks to a payment provider, never
   calls HAF PAY, and cannot. It is a database on its own with invented people
   in it. */

(function () {
  'use strict';

  var PAY_HOSTS = /pay\.usehaf\.co\.uk|\/pay\/|checkout\.stripe\.com|buy\.stripe\.com/i;

  /* ── 1. Say what this is ──────────────────────────────────────────── */

  function banner() {
    if (document.getElementById('demo-ribbon')) return;
    var bar = document.createElement('div');
    bar.id = 'demo-ribbon';
    bar.textContent =
      'DEMO — a safe copy of HAF KNECT. Nothing here is the live network, ' +
      'nobody is a real customer, and no money can move.';
    document.body.appendChild(bar);
    document.body.classList.add('haf-demo');
  }

  var css = document.createElement('style');
  css.textContent = [
    '#demo-ribbon{position:fixed;left:0;right:0;bottom:0;z-index:99998;',
    'background:#111;color:#fff;font:500 12px/1.5 system-ui,sans-serif;',
    'text-align:center;padding:7px 12px;letter-spacing:.01em}',
    '@media(max-width:640px){#demo-ribbon{font-size:11px;padding:6px 10px}}',
    '#demo-pay-wrap{position:fixed;inset:0;z-index:99999;background:rgba(17,17,17,.72);',
    'display:flex;align-items:center;justify-content:center;padding:16px;',
    'overflow-y:auto;-webkit-overflow-scrolling:touch}',
    '#demo-pay{background:#fff;color:#111;max-width:520px;width:100%;border-radius:14px;',
    'padding:26px 26px 20px;font:400 15px/1.6 system-ui,sans-serif;',
    'box-shadow:0 18px 50px rgba(0,0,0,.3);max-height:92vh;overflow-y:auto}',
    '#demo-pay h2{font-size:19px;margin:0 0 4px;font-weight:700}',
    '#demo-pay .sub{color:#666;font-size:13px;margin:0 0 18px}',
    '#demo-pay ul{margin:0 0 18px;padding-left:0;list-style:none}',
    '#demo-pay li{padding:9px 0 9px 26px;border-bottom:1px solid #eee;position:relative}',
    '#demo-pay li:last-child{border-bottom:0}',
    '#demo-pay li:before{content:"";position:absolute;left:6px;top:17px;width:7px;height:7px;',
    'border-radius:50%;background:#f18e00}',
    '#demo-pay .amt{background:#faf7f2;border-radius:9px;padding:12px 14px;margin:0 0 18px;',
    'font-size:14px}',
    '#demo-pay .note{color:#666;font-size:12px;margin:14px 0 0;line-height:1.5}',
    '#demo-pay button{width:100%;border:0;border-radius:9px;padding:13px;cursor:pointer;',
    'font:600 15px system-ui,sans-serif}',
    '#demo-pay .go{background:#f18e00;color:#111;margin-bottom:8px}',
    '#demo-pay .no{background:#f2f2f2;color:#444}',
    '@media(prefers-color-scheme:dark){#demo-pay{background:#1b1b1b;color:#f2f2f2}',
    '#demo-pay li{border-bottom-color:#2e2e2e}#demo-pay .amt{background:#242424}',
    '#demo-pay .no{background:#2e2e2e;color:#ddd}}'
  ].join('');
  document.head.appendChild(css);

  /* ── 2. The payment moment ────────────────────────────────────────── */

  /* Pull an amount out of the page if one is showing, so the explainer talks
     about the number the viewer can actually see rather than an invented one.
     If we cannot find it we say nothing about the amount — a made-up figure in
     a demo becomes a figure somebody quotes back at you. */
  function money(t) {
    var m = (t || '').match(/£\s?[\d,]+(?:\.\d{2})?/);
    if (!m) return null;
    var v = m[0].replace(/\s/g, '');
    /* £0.00 is not an amount, it is a box that has not been filled in yet.
       Reading one out loud on a live stream is worse than saying nothing. */
    return /^£0(\.00)?$/.test(v) ? null : v;
  }

  /* WHICH number this panel is allowed to say.
     The sentence is "X would be collected at this point", so X is the amount
     HELD — fq-dep-amt — and nothing else. Both of the other candidates were
     tried and both were wrong on a real order of £97.50: walking up from the
     button lands in the price card and reads the ex-VAT subtotal, £81.25, and
     an empty page reads £0.00. Two plausible numbers, neither of them the one
     the customer would have paid, on a screen being recorded.

     So: the app's own held amount first, the full total second, and only then
     whatever sits near the button. If none of them is a real figure the panel
     names no number at all. */
  function amountNear(el) {
    var ids = ['fq-dep-amt', 'fq-pr-tot'];
    for (var i = 0; i < ids.length; i++) {
      var node = document.getElementById(ids[i]);
      /* Deliberately NOT gated on the element being visible. It ships holding
         the literal text £0.00 and is only ever overwritten by the app's own
         paint, which runs immediately before the pay button appears — so the
         zero guard above already refuses the unfilled case, and a stale figure
         from an earlier order cannot outlive the repaint that precedes the
         next button. Requiring visibility only made the number unreadable
         when the panel was mid-transition. */
      var v = node && money(node.textContent);
      if (v) return v;
    }
    var hop = el, depth = 0;
    while (hop && depth < 5) {
      var m = money(hop.textContent);
      if (m) return m;
      hop = hop.parentElement; depth++;
    }
    return null;
  }

  function explain(amount, proceed) {
    var wrap = document.createElement('div');
    wrap.id = 'demo-pay-wrap';
    var amountLine = amount
      ? '<div class="amt"><strong>' + amount + '</strong> would be collected at this ' +
        'point. Nothing has been charged and no card has been asked for.</div>'
      : '<div class="amt">A payment would be collected at this point. Nothing has ' +
        'been charged and no card has been asked for.</div>';

    wrap.innerHTML =
      '<div id="demo-pay" role="dialog" aria-modal="true" aria-label="What would happen at payment">' +
        '<h2>This is where payment happens</h2>' +
        '<p class="sub">On the live network you would leave HAF KNECT here. ' +
        'Here is exactly what would take place.</p>' +
        amountLine +
        '<ul>' +
          '<li>The customer is taken to HAF PAY and pays by card, or by bank ' +
             'transfer quoting the booking reference.</li>' +
          '<li>The money goes to the courier’s own account. HAF never holds ' +
             'it and never pays it on — HAF only takes its own fee.</li>' +
          '<li>Where a deposit is required, it is held rather than taken, and ' +
             'collected once the job has been checked over.</li>' +
          '<li>The job does not reach the driver network until that payment ' +
             'condition has been met.</li>' +
          '<li>A receipt is issued, the booking is reconciled against it, and ' +
             'the payout is queued.</li>' +
        '</ul>' +
        '<button class="go">Continue as if it had been paid</button>' +
        '<button class="no">Back</button>' +
        '<p class="note">This is the Demo Centre. No payment provider is ' +
        'contacted, no money can move, and this booking is not on the live ' +
        'network.</p>' +
      '</div>';

    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    wrap.querySelector('.no').addEventListener('click', close);
    wrap.querySelector('.go').addEventListener('click', function () {
      close();
      proceed();
    });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);
    wrap.querySelector('.go').focus();
  }

  /* ── 3. Carry the journey on ──────────────────────────────────────────
     The booking already exists — the app wrote it when the order was placed,
     exactly as it does on live. What a real payment would change is the
     payment condition, so that is the only thing settled here, by the demo's
     own endpoint. Then the viewer is taken to the booking, because "and then
     what happened" is the whole reason Brent is pointing a camera at it.

     If anything goes wrong we SAY so on screen rather than reloading into a
     page that looks like nothing happened. A silent failure in front of an
     audience is worse than an honest line of text. */
  function tell(message) {
    var n = document.createElement('div');
    n.setAttribute('style',
      'position:fixed;left:50%;bottom:46px;transform:translateX(-50%);z-index:99999;' +
      'background:#111;color:#fff;font:500 13px/1.5 system-ui,sans-serif;padding:10px 16px;' +
      'border-radius:9px;max-width:90vw;text-align:center;box-shadow:0 8px 26px rgba(0,0,0,.35)');
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 6000);
  }

  function settle(a) {
    /* HAF PAY's page is /pay/<reference>; the reference is the last piece. */
    var href = a.getAttribute('href') || '';
    var ref = (href.match(/HAFPAY-[A-Z2-9]{8}/i) || [])[0];
    var next = a.getAttribute('data-demo-next') ||
               (document.getElementById('fq-track') || {}).href || null;

    if (!ref) { tell('This demo could not read a payment reference from that button.'); return; }

    fetch('/api/demo/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_reference: ref })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) {
          tell('The demo could not settle that booking: ' + ((d && d.error) || 'no answer'));
          return;
        }
        tell('Booking ' + d.job_ref + ' is now recorded as paid. No money moved.');
        if (next) setTimeout(function () { location.href = next; }, 1400);
      })
      .catch(function (e) { tell('The demo could not reach its own booking system: ' + e.message); });
  }

  /* One delegated listener, captured before the app sees the click, so it works
     on every pay link the app renders today and every one it renders later. */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (!PAY_HOSTS.test(a.getAttribute('href') || '')) return;

    e.preventDefault();
    e.stopPropagation();

    explain(amountNear(a), function () { settle(a); });
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', banner);
  } else {
    banner();
  }

  window.HAF_DEMO = true;
})();
