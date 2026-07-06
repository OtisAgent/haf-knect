// ─── State ─────────────────────────────────────────────────────────────────
var S = {
  role: null,
  username: null,
  name: null,
  step: 'select-role'
};

// ─── Gate ──────────────────────────────────────────────────────────────────
(function(){
  if(sessionStorage.getItem('knect_access')==='1'){KNECT_MASTER=sessionStorage.getItem('knect_master')==='1';unlock();}
  else{render('book-delivery');}
})();

var KNECT_MASTER=false;
function gateAttempt(){
  var u=document.getElementById('gate-user').value.trim().toUpperCase();
  var v=document.getElementById('gate-input').value.trim();
  if(u==='BF638793'&&v==='Harps0641!'){
    KNECT_MASTER=true;
    sessionStorage.setItem('knect_access','1');
    sessionStorage.setItem('knect_master','1');
    unlock();
  } else if(v.toUpperCase()==='OTIS247'){
    KNECT_MASTER=false;
    sessionStorage.setItem('knect_access','1');
    unlock();
  } else {
    document.getElementById('gate-err').style.display='block';
    document.getElementById('gate-input').value='';
    document.getElementById('gate-input').focus();
  }
}
document.getElementById('gate-user').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('gate-input').focus();});
document.getElementById('gate-input').addEventListener('keydown',function(e){if(e.key==='Enter')gateAttempt();});

function showGate(){
  document.getElementById('gate-user').value='';
  document.getElementById('gate-input').value='';
  document.getElementById('gate-err').style.display='none';
  document.getElementById('gate').style.display='flex';
  setTimeout(function(){document.getElementById('gate-user').focus();},100);
}

function unlock(){
  document.getElementById('gate').style.display='none';
  document.getElementById('topbar-login').style.display='none';
  document.getElementById('topbar-signout').style.display='inline-flex';
  if(KNECT_MASTER){S.role='admin';render('dash-admin');}else{render('select-role');}
}

function signOut(){
  sessionStorage.removeItem('knect_access');
  sessionStorage.removeItem('knect_master');
  KNECT_MASTER=false;
  S={role:null,username:null,name:null,step:'select-role'};
  document.getElementById('role-chip').style.display='none';
  document.getElementById('topbar-product').textContent='';
  document.getElementById('topbar-login').style.display='inline-flex';
  document.getElementById('topbar-signout').style.display='none';
  render('book-delivery');
}

// ─── Router ────────────────────────────────────────────────────────────────
function render(screen, data){
  S.step = screen;
  window.scrollTo(0,0);
  var el = document.getElementById('content');
  var screens = {
    'select-role':    screenSelectRole,
    'signup-customer':screenSignupCustomer,
    'signup-business':screenSignupBusiness,
    'signup-freight': screenSignupFreight,
    'signup-driver':  screenSignupDriver,
    'login-ops':      screenLoginOps,
    'login-compliance':screenLoginCompliance,
    'login-admin':    screenLoginAdmin,
    'dash-customer':  screenDashCustomer,
    'dash-business':  screenDashBusiness,
    'dash-freight':   screenDashFreight,
    'dash-driver':    screenDashDriver,
    'dash-ops':       screenDashOps,
    'dash-compliance':screenDashCompliance,
    'dash-admin':     screenDashAdmin,
    'book-delivery':  screenBookDelivery,
    'booking-confirm':screenBookingConfirm,
    'post-load':      screenPostLoad,
    'driver-username':screenDriverUsername,
    'driver-cleverpay':screenDriverCleverpay,
    'signup-biz-verify':screenSignupBizVerify,
  };
  if(screens[screen]) el.innerHTML = screens[screen](data||{});
  else el.innerHTML = '<p class="text-muted mt24">Screen not found: '+screen+'</p>';
}

function setRole(role, label, color){
  S.role = role;
  var chip = document.getElementById('role-chip');
  chip.textContent = label;
  chip.style.display = 'inline-flex';
  chip.style.borderColor = color||'var(--line)';
  chip.style.color = color||'var(--muted)';
  document.getElementById('topbar-product').textContent = 'KNECT — ' + label;
}

// ─── SCREEN: Select Role ───────────────────────────────────────────────────
function screenSelectRole(){
  return `
  <div id="content" style="padding:28px 20px;max-width:780px;margin:0 auto;">
    <div class="step-head" style="text-align:center;max-width:520px;margin:0 auto 32px;">
      <div class="step-tag">HAF KNECT</div>
      <div class="step-title">What are you here to do?</div>
      <div class="step-sub">Choose your role. OTIS will create the right account and show you only what you need.</div>
    </div>
    <div class="role-grid">
      <div class="role-card" onclick="chooseRole('customer')">
        <div class="role-icon">📦</div>
        <div class="role-name">Send something</div>
        <div class="role-desc">Get a quote, book a courier and track your delivery.</div>
      </div>
      <div class="role-card" onclick="chooseRole('business')">
        <div class="role-icon">🏢</div>
        <div class="role-name">Business account</div>
        <div class="role-desc">Move your own goods regularly. Repeat bookings and account benefits.</div>
      </div>
      <div class="role-card" onclick="chooseRole('freight')">
        <div class="role-icon">🚛</div>
        <div class="role-name">Post freight for others</div>
        <div class="role-desc">Load poster or freight forwarder. Post jobs into the HAF network.</div>
      </div>
      <div class="role-card" onclick="chooseRole('driver')">
        <div class="role-icon">🚚</div>
        <div class="role-name">I'm a driver</div>
        <div class="role-desc">Join the HAF network, complete compliance and access jobs through PLNA.</div>
      </div>
      <div class="role-card" onclick="chooseRole('ops')">
        <div class="role-icon">⚡</div>
        <div class="role-name">HAF Ops / Dispatch</div>
        <div class="role-desc">Internal HAF team. Manage live jobs, drivers and customer issues.</div>
      </div>
      <div class="role-card" onclick="chooseRole('compliance')">
        <div class="role-icon">📋</div>
        <div class="role-name">Compliance</div>
        <div class="role-desc">CleverPay and Clever Checked. Review driver documents and RAG status.</div>
      </div>
      <div class="role-card" onclick="chooseRole('admin')" style="border-color:rgba(249,115,22,.35);">
        <div class="role-icon">🔑</div>
        <div class="role-name">Admin / OTIS</div>
        <div class="role-desc">Brent + OTIS master view. Full network control and user management.</div>
      </div>
    </div>
  </div>`;
}

function chooseRole(role){
  var routes = {
    customer:   ['signup-customer',  'Customer',   'var(--blue)'],
    business:   ['signup-business',  'Business',   'var(--purple)'],
    freight:    ['signup-freight',   'Freight',    'var(--amber)'],
    driver:     ['signup-driver',    'Driver',     'var(--green)'],
    ops:        ['login-ops',        'HAF Ops',    'var(--orange)'],
    compliance: ['login-compliance', 'Compliance', 'var(--red)'],
    admin:      ['login-admin',      'Admin',      'var(--orange)'],
  };
  var r = routes[role];
  setRole(role, r[1], r[2]);
  render(r[0]);
}

// ─── SCREEN: Signup — Customer ─────────────────────────────────────────────
function screenSignupCustomer(){
  return `
  <div style="max-width:520px;margin:0 auto;padding:28px 20px;">
    <div class="back-link" onclick="render('select-role')">← Back</div>
    <div class="step-head">
      <div class="step-tag">Step 1 of 2 — Customer</div>
      <div class="step-title">Create your account</div>
      <div class="step-sub">Quick to set up. We only need the essentials.</div>
    </div>
    <div class="card">
      <div class="field-row">
        <div class="field"><label>First name</label><input type="text" placeholder="Brent" id="cu-fname"/></div>
        <div class="field"><label>Last name</label><input type="text" placeholder="Ford" id="cu-lname"/></div>
      </div>
      <div class="field"><label>Email address</label><input type="email" placeholder="you@example.com" id="cu-email"/></div>
      <div class="field"><label>Phone number</label><input type="tel" placeholder="07700 900 000" id="cu-phone"/></div>
      <div style="margin-top:8px;">
        <button class="btn btn-primary btn-full" onclick="customerSignup()">Create account →</button>
      </div>
    </div>
    <div class="banner banner-blue mt16">
      <span>ℹ️</span>
      <div>No account needed for a one-off booking — you can also <span class="fw700" style="cursor:pointer;color:var(--blue)" onclick="render('book-delivery')">book as a guest →</span></div>
    </div>
  </div>`;
}

function customerSignup(){
  var fn = document.getElementById('cu-fname').value.trim()||'Brent';
  S.name = fn;
  render('dash-customer');
}