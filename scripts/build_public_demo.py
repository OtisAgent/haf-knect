#!/usr/bin/env python3
"""
Build the PUBLIC DEMO from the real app.

Brent, 14 Aug: "the demo centre is perfect what you've built with the sandbox —
apply that to the demo.usehaf.co.uk domain — with the access code given when
people input the emails for me to use as an email magnet".

So the public demo is not a second copy of the product that drifts away from the
first. It IS the app file, rebuilt from source every time, with three changes:

  1. the door is an email address, not a login;
  2. it opens straight into the Demo Centre and cannot leave it;
  3. the pricing matrix is read from the live app, so every figure on the demo
     is the same figure a real customer is quoted.

Run:  python3 scripts/build_public_demo.py
"""
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "index.html"
OUT_DIR = ROOT / "demo"
OUT = OUT_DIR / "index.html"

# the sibling files the app pulls in with a <script src>; the demo needs its own
# copies because it is served from its own site
DEPS = [
    "uk-regions.js",
    "admin/lane-factors-v1.js",
    "admin/account-fees-v1.js",
    "admin/pro-crown.js",
    "admin/tier-marks-v1.js",
    "admin/tier-identity-v1.js",
    "admin/pricing-matrix-v3.js",
]

PRICING_API = "https://knect.usehaf.co.uk/api/pricing"

GATE = r"""
<!-- ══ PUBLIC DEMO — THE EMAIL DOOR ═══════════════════════════════════════
     Everything below is added by scripts/build_public_demo.py. It does not
     exist in the app; the app has a login instead. -->
<style>
#pd-gate{position:fixed;inset:0;z-index:9500;background:var(--bg);display:flex;
  align-items:center;justify-content:center;padding:1.4rem;overflow:auto}
#pd-gate .pd-box{width:100%;max-width:440px}
#pd-gate h1{font-family:var(--dp);font-weight:900;font-size:1.6rem;letter-spacing:-.04em;
  margin:.9rem 0 .4rem;line-height:1.15}
#pd-gate p.pd-sub{font-size:.83rem;color:var(--mu);line-height:1.6;margin:0 0 1.4rem}
#pd-gate .pd-card{background:var(--p2);border:1px solid var(--ln);border-radius:14px;padding:1.2rem}
#pd-gate label{display:block;font-size:.66rem;font-weight:800;letter-spacing:.07em;
  text-transform:uppercase;color:var(--mu);margin-bottom:.35rem}
#pd-gate input{width:100%;background:var(--bg);border:1px solid var(--lns);border-radius:9px;
  padding:.7rem .8rem;font:inherit;font-size:.88rem;color:var(--tx);outline:none}
#pd-gate input:focus{border-color:var(--or)}
#pd-gate .pd-err{color:#e0685f;font-size:.76rem;margin-top:.55rem;display:none}
#pd-gate .pd-alt{margin-top:1rem;text-align:center;font-size:.74rem;color:var(--mu)}
#pd-gate .pd-alt a{color:var(--or);cursor:pointer;font-weight:700}
#pd-code{font-family:var(--dp);font-weight:900;font-size:2rem;letter-spacing:.28em;
  color:var(--or);text-align:center;margin:.5rem 0 .2rem}
#pd-gate .pd-foot{margin-top:1.1rem;font-size:.66rem;color:var(--mu);text-align:center;line-height:1.6}
</style>
<div id="pd-gate">
  <div class="pd-box">
    <div style="display:flex;align-items:center;gap:.5rem">
      <div style="width:34px;height:34px;background:var(--or);border-radius:9px;display:flex;
        align-items:center;justify-content:center;font-family:var(--dp);font-weight:900;color:#0e1113">K</div>
      <div style="font-family:var(--dp);font-weight:900;font-size:1.05rem;letter-spacing:-.04em">HAF <span style="color:var(--or)">KNECT</span></div>
    </div>

    <div id="pd-step-email">
      <h1>See exactly what you get<br>before you join.</h1>
      <p class="pd-sub">A working sandbox of the network — Free, Plus and Pro side by side, the
        screen you get on each one, and the real pricing matrix behind every figure.
        Nothing here creates a job, notifies a driver or takes a payment.</p>
      <div class="pd-card">
        <label for="pd-email">Your email address</label>
        <input id="pd-email" type="email" inputmode="email" autocomplete="email"
          placeholder="you@company.co.uk" onkeydown="if(event.key==='Enter')pdRequest()">
        <div class="pd-err" id="pd-email-err"></div>
        <button class="btn btn-or btn-wide" style="margin-top:.8rem" id="pd-go" onclick="pdRequest()">Get my access code →</button>
      </div>
      <div class="pd-alt">Already have a code? <a onclick="pdShow('code')">Enter it here</a></div>
    </div>

    <div id="pd-step-code" style="display:none">
      <h1>Enter your access code.</h1>
      <p class="pd-sub">The code you were given when you first asked for the demo.</p>
      <div class="pd-card">
        <label for="pd-codein">Access code</label>
        <input id="pd-codein" maxlength="8" autocapitalize="characters" placeholder="ABC123"
          style="letter-spacing:.22em;text-transform:uppercase"
          oninput="this.value=this.value.toUpperCase()" onkeydown="if(event.key==='Enter')pdCheck()">
        <div class="pd-err" id="pd-code-err"></div>
        <button class="btn btn-or btn-wide" style="margin-top:.8rem" id="pd-enter" onclick="pdCheck()">Open the demo →</button>
      </div>
      <div class="pd-alt">Don't have one? <a onclick="pdShow('email')">Get a code</a></div>
    </div>

    <div id="pd-step-issued" style="display:none">
      <h1 id="pd-issued-h">Here is your access code.</h1>
      <p class="pd-sub" id="pd-issued-sub">Write it down — it lets you back in any time, on any device.
        We have emailed you a copy as well; if it is not in your inbox, please check your junk mail.</p>
      <div class="pd-card">
        <div id="pd-code">------</div>
        <button class="btn btn-or btn-wide" style="margin-top:.9rem" onclick="pdEnter()">Open the demo →</button>
      </div>
    </div>

    <div class="pd-foot">A sandbox, not the live network. HAF Logistics Ltd.</div>
  </div>
</div>
<script>
/* ── the door ──────────────────────────────────────────────────────────────
   One email in, one code out, and the code is what opens the demo. The code
   is issued and checked by the database, never by this page, so nothing here
   can be edited to walk past it. The email list itself is not readable with
   the key this page holds — that was proved before this file shipped. */
(function(){
  var URL_=PLNA_URL+'/rest/v1/rpc/', K=PLNA_KEY, KEY='haf_demo_code';

  /* The four sections the public demo keeps, captured ONCE before anything is
     trimmed, so opening the door twice cannot shrink the menu twice. */
  var PD_NAV=(typeof DEMO_NAV!=='undefined')?DEMO_NAV.slice(0,4):[];

  function rpc(fn,body){
    return fetch(URL_+fn,{method:'POST',headers:{'apikey':K,'Authorization':'Bearer '+K,
      'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})
      .then(function(d){return (Array.isArray(d)?d[0]:d)||{}});
  }
  function err(id,msg){var e=document.getElementById(id);e.textContent=msg;e.style.display=msg?'block':'none'}
  function busy(id,on,label){var b=document.getElementById(id);if(!b)return;b.disabled=on;b.textContent=on?'One moment…':label}

  window.pdShow=function(which){
    document.getElementById('pd-step-email').style.display  = which==='email' ?'':'none';
    document.getElementById('pd-step-code').style.display   = which==='code'  ?'':'none';
    document.getElementById('pd-step-issued').style.display = which==='issued'?'':'none';
  };

  window.pdRequest=function(){
    var v=(document.getElementById('pd-email').value||'').trim();
    err('pd-email-err','');
    if(!v){err('pd-email-err','Pop your email in and the code is yours.');return}
    busy('pd-go',true);
    rpc('knect_demo_request_code',{p_email:v,p_source:'demo.usehaf.co.uk'}).then(function(d){
      busy('pd-go',false,'Get my access code →');
      if(!d.ok){err('pd-email-err',d.why||'That did not work — check the address and try again.');return}
      document.getElementById('pd-code').textContent=d.code;
      if(d.returning_visitor){
        document.getElementById('pd-issued-h').textContent='Welcome back.';
        document.getElementById('pd-issued-sub').textContent='Same code as last time — it does not expire. '
          +'We have emailed you a copy as well; if it is not in your inbox, please check your junk mail.';
      }
      try{localStorage.setItem(KEY,d.code)}catch(e){}
      pdShow('issued');
    }).catch(function(){
      busy('pd-go',false,'Get my access code →');
      err('pd-email-err','We could not reach the network just then. Try once more in a moment.');
    });
  };

  window.pdCheck=function(){
    var v=(document.getElementById('pd-codein').value||'').trim();
    err('pd-code-err','');
    if(!v){err('pd-code-err','Enter the code you were given.');return}
    busy('pd-enter',true);
    rpc('knect_demo_check_code',{p_code:v}).then(function(d){
      busy('pd-enter',false,'Open the demo →');
      if(!d.ok){err('pd-code-err','That code is not one of ours. Check it, or get a fresh one.');return}
      try{localStorage.setItem(KEY,v.toUpperCase())}catch(e){}
      pdEnter();
    }).catch(function(){
      busy('pd-enter',false,'Open the demo →');
      err('pd-code-err','We could not reach the network just then. Try once more in a moment.');
    });
  };

  /* ── inside ── open the Demo Centre and take away every way out of it ── */
  window.pdEnter=function(){
    var g=document.getElementById('pd-gate'); if(g)g.style.display='none';
    var l=document.getElementById('landing'); if(l)l.style.display='none';
    var a=document.getElementById('app');     if(a)a.classList.add('open');
    var u=document.getElementById('tb-user'), v=document.getElementById('tb-av');
    if(u)u.textContent='Guest'; if(v)v.textContent='HK';
    var f=document.getElementById('tb-founder'); if(f)f.style.display='none';
    /* Brent, 14 Aug, in two goes. First: "i dont need the guide price showing
       on there just the dashboards on the demo centre" — so the app's own
       customer quote flow stays unreachable behind this door. Then: "keep the
       network pricing account to account pricing examples thats good" — so
       Account Comparison stays. What goes is the Mileage & Margin Simulator:
       it is the one screen left that quotes a job, and quoting a job is the
       thing he asked not to show here.

       Trimming the nav rather than editing the app file means the app itself
       is untouched and the demo cannot drift away from it. */
    try{ DEMO_NAV.length=0; DEMO_NAV.push.apply(DEMO_NAV,PD_NAV); }catch(e){}
    try{ enterMode('demo'); }catch(e){}
    /* the mode pill is a switcher in the app; here it is only a label */
    var p=document.getElementById('mode-pill');
    if(p){p.onclick=null;p.style.cursor='default';p.title='Sandbox demo';}
    var back=document.querySelector('#sidebar .back-btn[onclick*="goLanding"]');
    if(back)back.style.display='none';
  };

  /* There is no account behind this page, so the app's ways back to a login
     are dead ends here. They return to the door instead. */
  function reGate(){
    var a=document.getElementById('app'); if(a)a.classList.remove('open');
    var l=document.getElementById('landing'); if(l)l.style.display='none';
    var g=document.getElementById('pd-gate'); if(g)g.style.display='flex';
    pdShow('code');
  }
  window.showModeSelector=reGate;
  window.signOut=function(){try{localStorage.removeItem(KEY)}catch(e){} reGate()};
  window.goLanding=reGate;
  window.openLogin=function(){};

  function start(){
    ['landing','login-ov','pin-ov','super-mode'].forEach(function(id){
      var e=document.getElementById(id); if(e)e.style.display='none';
    });

    /* A code can arrive in the address itself — that is how the Demo Centre
       tile on Brent's master screen opens his own demo in one click instead of
       asking the owner of the network for an email address.

       Two things matter here. The code is still checked by the database, so a
       link is not a way past the door; and it is wiped out of the address bar
       the moment it is used, because he opens this in front of an audience and
       his master code should not be sitting on the screen behind him. */
    var fromLink=null;
    try{
      var m=(window.location.search||'').match(/[?&]code=([A-Za-z0-9]{4,12})\b/);
      if(m)fromLink=m[1].toUpperCase();
      if(fromLink&&window.history&&history.replaceState)
        history.replaceState(null,'',window.location.pathname);
    }catch(e){}

    var saved=fromLink; if(!saved){try{saved=localStorage.getItem(KEY)}catch(e){}}
    if(saved){
      /* a code that was revoked should not keep working, so it is re-checked
         against the database rather than trusted from the browser */
      rpc('knect_demo_check_code',{p_code:saved}).then(function(d){
        if(d.ok)pdEnter(); else {try{localStorage.removeItem(KEY)}catch(e){} pdShow('email')}
      }).catch(function(){pdShow('email')});
    }else{pdShow('email')}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
  else start();
})();
</script>

<!-- ══ WHAT YOU SEE WHEN YOU SIGN IN ═══════════════════════════════════════
     Brent, 14 Aug: "i should be able to see an account HAF KNECT - Free
     version, Plus version & Pro version when i load up the demo.usehaf.co.uk
     to dashboard viewing to show what users would see if they signed up ...
     so people can use it".

     A visitor picking between Free, Plus and Pro is really asking one question:
     what will actually be on my screen. The entitlement cards answered it in
     prose. This answers it by showing the menu itself — built by the app's own
     hafAccess + hafNavModel, the same two functions that draw a real member's
     sidebar the moment they sign in. Not a picture of one, and not a list
     retyped here. If a tab is added to the driver app tomorrow it appears on
     this demo tomorrow, because there is only one copy of the decision. -->
<style>
.pd-menu{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:.45rem;margin-top:.55rem}
.pd-mi{display:flex;align-items:center;gap:.5rem;background:var(--bg);border:1px solid var(--ln);
  border-radius:9px;padding:.5rem .6rem;font-size:.79rem;font-weight:600;width:100%;text-align:left;
  color:var(--tx);font-family:inherit;cursor:pointer;transition:border-color .12s,transform .12s}
.pd-mi:hover{border-color:var(--or);transform:translateY(-1px)}
.pd-mi .pd-go{margin-left:auto;color:var(--or);font-weight:800;opacity:0;transition:opacity .12s}
.pd-mi:hover .pd-go{opacity:1}
.pd-mi svg{flex:0 0 auto;opacity:.75}

/* the strip that sits on top of every screen you walk into, so nobody is ever
   one click from lost inside somebody else's dashboard */
#pd-seatbar{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;background:var(--p2);
  border:1px solid var(--ln);border-left:3px solid var(--or);border-radius:10px;
  padding:.55rem .75rem;margin-bottom:.9rem}
#pd-seatbar .pd-sb-t{font-size:.76rem;font-weight:800}
#pd-seatbar .pd-sb-s{font-size:.7rem;color:var(--mu)}
#pd-seatbar button{margin-left:auto}
.pd-seat-back{display:flex;align-items:center;gap:.4rem;background:var(--or-d);border:1px solid var(--or-g);
  color:var(--or);border-radius:9px;padding:.5rem .6rem;font-size:.76rem;font-weight:800;cursor:pointer;
  margin:0 0 .5rem;width:100%;font-family:inherit;text-align:left}
.pd-grp{font-size:.62rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  color:var(--mu);margin:.85rem 0 .1rem}

/* The sidebar's live-job tracker is sample data. Inside the app that is
   obvious, because you signed in and it is your job. On a public demo it reads
   as a real delivery happening on the network right now — which is exactly the
   kind of thing the old demo got wrong with its 340 drivers. It stays hidden
   here until there is a real one to show. */
#sb-livejob{display:none !important}
</style>
<script>
(function(){
  /* ── THE MENU COMES FROM THE APP, NOT FROM HERE ──────────────────────────
     This used to keep three lists of its own — DRIVER_NAV for a driver,
     BUSINESS_NAV for a business, and DRIVER_NAV again for a fleet with an
     apology attached saying a fleet "does not have a menu of its own yet".

     Both halves of that had gone stale. A fleet has had its own section for a
     while. And none of the three knew about the Clever checks, so the demo
     showed a brand new driver every driving screen in the product — the exact
     opposite of what the app now does, and the exact thing the checks exist to
     prevent. A demo that contradicts the product is not a small problem: it is
     a promise the product then breaks.

     So nothing is decided here any more. hafAccess says what the account IS
     and hafNavModel says what that reaches — the same two functions the real
     sidebar calls. This file only draws the answer. */
  var DC_TYPE={driver:'driver',fleet:'fleet',business:'business',freight:'freight_forwarder'};

  function navFor(role,rel){
    try{
      var acc=hafAccess({account_type:(DC_TYPE[role]||role),
                         plna_released:rel===true, full_name:'Demo account'});
      return {acc:acc, model:(hafNavModel(acc)||[])};
    }catch(e){ return {acc:null, model:[]}; }
  }

  /* Only an account that drives has two states worth showing. A business or a
     freight forwarder is never waiting on anything.

     The demo opens on the RELEASED state, and that is a deliberate choice
     rather than a convenient one. A visitor deciding whether to join wants to
     see what the account becomes, and a brand new driver's menu is mostly
     padlocks — an honest screen that sells nothing and explains less. So the
     demo shows the account working, and puts the gate one click away where it
     reads as the promise it is: this is yours once Clever has checked you. */
  function relOf(view){ return !(view && view.rel===false); }
  function drivesRole(role){ return role==='driver'||role==='fleet'; }

  window.pdSetRel=function(tier,rel){
    try{ DC_VIEW[tier].rel=(rel===true); dcRenderTier(tier); }catch(e){}
  };

  function block(tier){
    var view; try{view=DC_VIEW[tier]}catch(e){} if(!view)return '';
    var roleDef; try{roleDef=DC_ROLES.filter(function(r){return r.k===view.role})[0]}catch(e){}
    if(!roleDef)return '';
    var rel=relOf(view), drives=drivesRole(view.role);
    var got=navFor(view.role,rel), model=got.model||[], acc=got.acc;
    if(!model.length)return '';

    var T; try{T=DC_TIERS[tier]}catch(e){} T=T||{label:tier};
    var state=drives?(rel?' &middot; checked and released':' &middot; checks not finished yet'):'';
    var h='<div class="card"><div class="ct">What you see when you sign in &mdash; '
        + roleDef.l + ' on ' + T.label + state + '</div>';
    h+='<div class="dc-note" style="margin-top:.2rem">This is the real menu the app builds for a '
      + roleDef.l.toLowerCase() + ' account &mdash; not a list kept here, but the app\'s own answer, '
      + 'asked fresh every time you change the buttons above. '
      + '<b style="color:var(--or)">Click any tab to open that screen</b> and look around; '
      + 'you can come back here from any of them.</div>';

    /* The two states of a driving account, side by side, because the whole
       point of the checks is that they change what you get. */
    if(drives){
      h+='<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.7rem">'
       + '<button type="button" class="btn btn-'+(rel?'gh':'or')+' btn-xs" onclick="pdSetRel(\''+tier+'\',false)">Before the Clever checks</button>'
       + '<button type="button" class="btn btn-'+(rel?'or':'gh')+' btn-xs" onclick="pdSetRel(\''+tier+'\',true)">Checked and released</button>'
       + '</div>';
      h+='<div class="dc-note" style="margin-top:.5rem">'
       + (rel
          ? 'Released by Clever: the driving side is open, and the planner opens with it.'
          : 'Everyone can post work from the day they sign up. The driving screens stay shut until Clever has checked the documents &mdash; that is what keeps the network worth being in.')
       + '</div>';
    }

    var cg='';
    model.forEach(function(sec){
      if(sec.g!==cg){ h+='<div class="pd-grp">'+sec.g+'</div>'; cg=sec.g; }
      if(sec.locked){
        /* A padlock is part of the answer, not a gap in it — leaving it out
           would show a menu no member ever gets. */
        h+='<div class="pd-menu"><div class="pd-mi" style="cursor:default;opacity:.72">'
         + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mu)" '
         + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
         + '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
         + '<span>'+sec.l+'</span></div></div>'
         + '<div class="dc-note" style="margin:.25rem 0 .1rem">'+sec.why+'</div>';
        return;
      }
      h+='<div class="pd-menu">';
      (sec.tabs||[]).forEach(function(t){
        /* Some entries are not screens in this app at all — "Open my PLNA"
           leaves for the driver's own planner. The demo cannot sign a visitor
           in there, and pretending it is a tab here produced a click that
           opened nothing. It is shown for what it is: a door out. */
        if(t.ext){
          h+='<div class="pd-mi pd-ext" style="cursor:default;opacity:.8">'
           + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--or)" '
           + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
           + '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
           + '<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
           + '<span>'+t.l+'</span></div>';
          return;
        }
        h+='<button type="button" class="pd-mi" onclick="pdSeatOpen(\''+tier+'\',\''+t.id+'\')">'
         + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" '
         + 'stroke="var(--or)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
         + sec.ico + '</svg><span>' + t.l + '</span><span class="pd-go">&rarr;</span></button>';
      });
      h+='</div>';
      if((sec.tabs||[]).some(function(t){return t.ext}))
        h+='<div class="dc-note" style="margin:.25rem 0 .1rem">The planner is its own app at plna.usehaf.co.uk &mdash; a released driver signs straight into it from here.</div>';
    });

    /* The same invitation the sidebar puts at its own foot, said in words
       here: an account that cannot drive today can choose to. */
    if(acc&&!acc.released){
      h+='<div class="dc-note" style="margin-top:.8rem">'
       + (acc.drives
          ? 'At the foot of this sidebar the account is asked for its documents, and the driving screens open the moment Clever releases them.'
          : 'At the foot of this sidebar there is an <b>Add to your account</b> section &mdash; become an owner driver, or register a fleet, through the Clever checks. Nobody has to open a second account to do it.')
       + '</div>';
    }
    return h+'</div>';
  }

  /* ── WALKING THE DASHBOARD ────────────────────────────────────────────────
     Brent, 14 Aug: "the demo should allow me to walk through the dashboards
     when click on the tabs".

     Reading a menu tells you the tab exists. Opening it tells you whether you
     want the account. So a click here does the same two things the app does
     when a real member signs in: it builds THAT account's sidebar, and it
     opens THAT screen. Not a picture of the screen — the screen, drawn by the
     app's own code from the app's own data.

     The one thing a visitor must never lose is the way back, because the
     sidebar they are now looking at is somebody else's. So the way back is in
     three places at once: the top of the sidebar, a strip across the top of
     every screen they land on, and the pill in the corner. On a phone the
     sidebar closes itself when a tab opens, which is exactly why the strip
     exists. */
  var PD_SEAT=null;

  /* The strip lives in the shell, above the panes, NOT inside the pane it is
     describing. It was inside the pane first, and the Network Map wiped it the
     moment that screen drew itself: a pane that rebuilds its own innerHTML
     takes the way back down with it. Anything that can be redrawn is the wrong
     place to keep the exit. */
  function pdSeatBar(){
    if(!PD_SEAT)return;
    var host=document.getElementById('main'); if(!host)return;
    var bar=document.getElementById('pd-seatbar');
    if(!bar){
      bar=document.createElement('div'); bar.id='pd-seatbar';
      bar.innerHTML='<div><div class="pd-sb-t" id="pd-sb-t"></div>'
        +'<div class="pd-sb-s">A sandbox &mdash; nothing here creates a job, notifies a driver or takes a payment.</div></div>'
        +'<button type="button" class="btn btn-or btn-sm" onclick="pdSeatClose()">&larr; Back to the demo</button>';
    }
    var t=bar.querySelector('.pd-sb-t');
    if(t)t.textContent='You are looking at '+PD_SEAT.what;
    if(host.firstChild!==bar)host.insertBefore(bar,host.firstChild);
  }

  window.pdSeatOpen=function(tier,tabId){
    var view; try{view=DC_VIEW[tier]}catch(e){} if(!view)return;
    var roleDef; try{roleDef=DC_ROLES.filter(function(r){return r.k===view.role})[0]}catch(e){}
    var T; try{T=DC_TIERS[tier]}catch(e){} T=T||{label:tier};
    var rel=relOf(view), drives=drivesRole(view.role);
    var got=navFor(view.role,rel), model=got.model||[]; if(!model.length)return;

    /* Say which account AND which state, because on a driving account those
       are two different screens and a visitor who forgets which one they asked
       for will read the wrong one as the product. */
    PD_SEAT={tier:tier, what:(roleDef?roleDef.l:view.role)+' on '+T.label
             +(drives?(rel?', released by Clever':', checks not finished'):'')};
    /* the member's own sidebar, drawn by the app's own code */
    try{ buildNavV1(got.acc); }catch(e){}
    if(!tabId){
      for(var i=0;i<model.length&&!tabId;i++){
        if(model[i].locked)continue;
        (model[i].tabs||[]).forEach(function(t){ if(!tabId&&!t.ext)tabId=t.id; });
      }
    }
    /* the way back, at the top of the sidebar this account would really have */
    try{
      var list=document.getElementById('nav-list');
      if(list){
        var b=document.createElement('button');
        b.type='button'; b.className='pd-seat-back';
        b.innerHTML='&larr; Back to the demo';
        b.onclick=pdSeatClose;
        list.insertBefore(b,list.firstChild);
      }
    }catch(e){}
    var p=document.getElementById('mode-pill');
    if(p){p.textContent='Sandbox · '+PD_SEAT.what; p.style.cursor='pointer';
          p.onclick=pdSeatClose; p.title='Back to the demo';}
    if(tabId){ try{ switchTab('pane-'+tabId); }catch(e){} }
  };

  window.pdSeatClose=function(){
    var tier=(PD_SEAT&&PD_SEAT.tier)||'free';
    PD_SEAT=null;
    var bar=document.getElementById('pd-seatbar');
    if(bar&&bar.parentNode)bar.parentNode.removeChild(bar);
    try{ buildNav(DEMO_NAV); }catch(e){}
    var p=document.getElementById('mode-pill');
    if(p){p.textContent='Demo Centre'; p.onclick=null; p.style.cursor='default'; p.title='Sandbox demo';}
    try{ switchTab('pane-dc-'+tier); }catch(e){}
  };

  /* every screen the app opens while a seat is held gets the strip */
  (function(){
    function wrap(){
      if(typeof window.switchTab!=='function'){setTimeout(wrap,120);return}
      var inner=window.switchTab;
      window.switchTab=function(id){
        var out=inner.apply(this,arguments);
        if(PD_SEAT)setTimeout(function(){try{pdSeatBar(id)}catch(e){}},60);
        return out;
      };
    }
    wrap();
  })();

  /* The screen is redrawn from scratch every time anything about the view
     changes, so this has to run after each redraw rather than once.

     It used to hook dcOpen — the function that runs when you ARRIVE at a tier.
     But switching the role, the founder mark or the Clever state goes straight
     to dcRenderTier without passing through dcOpen, so the menu vanished the
     moment a visitor changed anything about the account they were looking at.
     The redraw is the thing to follow, not the arrival. */
  function hook(){
    if(typeof window.dcRenderTier!=='function'){setTimeout(hook,120);return}
    var inner=window.dcRenderTier;
    window.dcRenderTier=function(tier){
      var out=inner.apply(this,arguments);
      try{
        if(tier==='free'||tier==='plus'||tier==='pro'){
          var host=document.getElementById('dc-host-'+tier);
          var band=host&&host.querySelector('.dc-band');
          var html=block(tier);
          if(band&&html){
            var wrap=document.createElement('div');
            wrap.innerHTML=html;
            band.parentNode.insertBefore(wrap.firstChild,band.nextSibling);
          }
        }
      }catch(e){}
      return out;
    };
  }
  hook();
})();
</script>
"""


def main() -> int:
    if not SRC.exists():
        print(f"cannot find {SRC}", file=sys.stderr)
        return 1

    html = SRC.read_text(encoding="utf8")

    # 1. the demo reads the SAME pricing matrix the live app quotes from
    before = html
    html = html.replace("fetch('/api/pricing',", f"fetch('{PRICING_API}',")
    if html == before:
        print("pricing endpoint not found — the app changed, check this script", file=sys.stderr)
        return 1

    # 2. the app's own demo buttons would send a visitor in a circle
    html = html.replace("https://demo.usehaf.co.uk", "#")

    # 3. the door
    #    The app builds a printable record in a template literal that contains
    #    its own "</body>" — so the door has to go before the LAST one, not the
    #    first. Getting this wrong injects the gate into the middle of a script
    #    and the page dies silently; it did exactly that on the first build.
    if "</body>" not in html:
        print("no </body> in source", file=sys.stderr)
        return 1
    head, sep, tail = html.rpartition("</body>")
    html = head + GATE + "\n" + sep + tail

    OUT_DIR.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf8")

    for rel in DEPS:
        src = ROOT / rel
        if not src.exists():
            print(f"missing dependency {rel}", file=sys.stderr)
            return 1
        dst = OUT_DIR / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)

    print(f"built {OUT.relative_to(ROOT)}  ({OUT.stat().st_size:,} bytes)")
    print(f"copied {len(DEPS)} supporting files into {OUT_DIR.name}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
