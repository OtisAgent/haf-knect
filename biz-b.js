function screenLoginOps(){
  return loginScreen('HAF Ops', 'Internal team only. Your login is managed by HAF admin.', 'dash-ops', 'var(--orange)');
}
function screenLoginCompliance(){
  return loginScreen('CleverPay Compliance', 'Compliance team access. Managed by HAF admin.', 'dash-compliance', 'var(--red)');
}
function screenLoginAdmin(){
  return loginScreen('Admin / OTIS Master', 'Private master access. Brent + OTIS only.', 'dash-admin', 'var(--orange)');
}

function loginScreen(title, sub, dest, color){
  return `
  <div style="max-width:400px;margin:0 auto;padding:28px 20px;">
    <div class="back-link" onclick="render('select-role')">← Back</div>
    <div class="step-head">
      <div class="step-tag" style="color:${color}">${title}</div>
      <div class="step-title">Sign in</div>
      <div class="step-sub">${sub}</div>
    </div>
    <div class="card">
      <div class="field"><label>Email</label><input type="email" placeholder="internal@usehaf.co.uk"/></div>
      <div class="field"><label>Password</label><input type="password" placeholder="••••••••"/></div>
      <button class="btn btn-primary btn-full mt8" onclick="render('${dest}')">Sign in →</button>
    </div>
  </div>`;
}

// ─── SCREEN: Dashboard — Customer ─────────────────────────────────────────
function screenDashCustomer(){
  var name = S.name || 'there';
  return `
  <div style="padding:28px 20px;max-width:860px;margin:0 auto;">
    <div class="flex-between mb24">
      <div>
        <div style="font-size:22px;font-weight:800;">Hello, ${name} 👋</div>
        <div class="text-muted fs13 mt8">What do you need today?</div>
      </div>
      <button class="btn btn-primary" onclick="render('book-delivery')">📦 Book a delivery</button>
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val text-orange">0</div><div class="stat-lbl">Active jobs</div></div>
      <div class="stat-box"><div class="stat-val">0</div><div class="stat-lbl">Completed</div></div>
      <div class="stat-box"><div class="stat-val text-muted">—</div><div class="stat-lbl">Last booking</div></div>
    </div>
    <div class="dtabs">
      <div class="dtab active" onclick="dtab(this,'cust-jobs')">My jobs</div>
      <div class="dtab" onclick="dtab(this,'cust-track')">Track</div>
      <div class="dtab" onclick="dtab(this,'cust-support')">Support</div>
    </div>
    <div id="dash-tab">
      <div class="banner banner-blue">
        <span>📦</span><div>You have no active jobs. <span class="fw700" style="cursor:pointer;" onclick="render('book-delivery')">Book your first delivery →</span></div>
      </div>
      <div class="card" style="text-align:center;padding:40px 20px;">
        <div style="font-size:40px;margin-bottom:12px;">📬</div>
        <div style="font-weight:700;margin-bottom:8px;">No deliveries yet</div>
        <div class="text-muted fs13 mb20">Once you book a delivery it will appear here. You can track it in real time.</div>
        <button class="btn btn-primary" onclick="render('book-delivery')">Book a delivery →</button>
      </div>
    </div>
  </div>`;
}

// ─── SCREEN: Book Delivery ─────────────────────────────────────────────────
function screenBookDelivery(){
  return `
  <div style="max-width:560px;margin:0 auto;padding:28px 20px;">
    <div class="back-link" onclick="render('dash-customer')">← Dashboard</div>
    <div class="step-head">
      <div class="step-tag">Book a delivery</div>
      <div class="step-title">Tell us about your job</div>
      <div class="step-sub">Fill in the details below. We'll find the right courier and give you a quote.</div>
    </div>
    <div class="card mb16">
      <div class="card-title">Collection</div>
      <div class="field"><label>Collection address</label><input type="text" placeholder="Full address or postcode"/></div>
      <div class="field-row">
        <div class="field"><label>Date</label><input type="date"/></div>
        <div class="field"><label>Time (earliest)</label><input type="time" value="09:00"/></div>
      </div>
      <div class="field"><label>Access notes</label><input type="text" placeholder="e.g. Ring buzzer 4, ask for reception"/></div>
    </div>
    <div class="card mb16">
      <div class="card-title">Delivery</div>
      <div class="field"><label>Delivery address</label><input type="text" placeholder="Full address or postcode"/></div>
      <div class="field"><label>Delivery instructions</label><input type="text" placeholder="e.g. Leave with neighbour if not in"/></div>
    </div>
    <div class="card mb16">
      <div class="card-title">What's being moved?</div>
      <div class="field-row">
        <div class="field"><label>Item description</label><input type="text" placeholder="e.g. Flat-pack furniture"/></div>
        <div class="field"><label>Approximate weight</label>
          <select><option>Under 10kg</option><option>10–50kg</option><option>50–100kg</option><option>100kg+</option><option>Not sure</option></select>
        </div>
      </div>
      <div class="field"><label>Van size needed</label>
        <select><option>Let HAF work it out</option><option>Small van</option><option>Medium van</option><option>Large van / Luton</option></select>
      </div>
    </div>
    <button class="btn btn-primary btn-full" onclick="render('booking-confirm')">Get quote →</button>
    <div class="text-muted fs12 mt12" style="text-align:center;">No commitment until you confirm. Quote is free.</div>
  </div>`;
}

// ─── SCREEN: Booking Confirm ───────────────────────────────────────────────
function screenBookingConfirm(){
  return `
  <div style="max-width:520px;margin:0 auto;padding:28px 20px;">
    <div class="step-head" style="text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">✅</div>
      <div class="step-title">Your quote is ready</div>
      <div class="step-sub">Review the details and confirm to book your courier.</div>
    </div>
    <div class="card mb16">
      <div class="flex-between mb12"><span class="fw700">Estimated price</span><span class="fw800 text-orange" style="font-size:22px;">£28.50</span></div>
      <div style="font-size:12px;color:var(--muted);">Based on distance, van size and timing. Final price confirmed at booking.</div>
      <hr class="divider" style="margin:14px 0;">
      <div class="fs13"><div class="flex-between mb8"><span class="text-muted">Collection</span><span class="fw700">Sheffield, S3</span></div>
      <div class="flex-between mb8"><span class="text-muted">Delivery</span><span class="fw700">Leeds, LS1</span></div>
      <div class="flex-between mb8"><span class="text-muted">Date</span><span class="fw700">Today, 2–4pm</span></div>
      <div class="flex-between"><span class="text-muted">Van</span><span class="fw700">Medium van</span></div></div>
    </div>
    <div class="card mb16">
      <div class="card-title">Payment</div>
      <div class="field"><label>Card number</label><input type="text" placeholder="1234 5678 9012 3456"/></div>
      <div class="field-row">
        <div class="field"><label>Expiry</label><input type="text" placeholder="MM/YY"/></div>
        <div class="field"><label>CVV</label><input type="text" placeholder="123"/></div>
      </div>
    </div>
    <button class="btn btn-green btn-full" onclick="bookingDone()">Confirm and pay £28.50 →</button>
    <div class="text-muted fs12 mt12" style="text-align:center;">Secure payment. You'll receive a confirmation by email and SMS.</div>
  </div>`;
}

function bookingDone(){
  document.getElementById('content').innerHTML = `
  <div style="max-width:480px;margin:0 auto;padding:60px 20px;text-align:center;">
    <div style="font-size:56px;margin-bottom:16px;">🎉</div>
    <div style="font-size:26px;font-weight:800;margin-bottom:8px;">Booking confirmed</div>
    <div class="text-muted fs13 mb24">Your job has been received. A HAF driver will be allocated shortly. You'll get an SMS update.</div>
    <div class="card mb20" style="text-align:left;">
      <div class="flex-between mb8"><span class="text-muted fs13">Job reference</span><span class="fw700">#HAF-00241</span></div>
      <div class="flex-between mb8"><span class="text-muted fs13">Status</span><span class="chip chip-amber">Allocating driver</span></div>
      <div class="flex-between"><span class="text-muted fs13">Driver update</span><span class="fs13">Within 15 min</span></div>
    </div>
    <button class="btn btn-primary" onclick="render('dash-customer')">← Back to dashboard</button>
  </div>`;
}

// ─── SCREEN: Dashboard — Business (full 10-tab) ───────────────────────────
function screenDashBusiness(){
  if(!S.bizTab) S.bizTab = 'dashboard';
  var name = S.bizName || S.name || 'Acme Ltd';
  return `
  <div style="padding:28px 20px;max-width:960px;margin:0 auto;">
    <div class="flex-between mb20">
      <div>
        <div style="font-size:22px;font-weight:800;">${name}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
          <span class="chip chip-blue">Business Account</span>
          <span class="chip chip-amber">CleverPay — Pending</span>
        </div>
      </div>
      <button class="btn btn-primary" onclick="bizSwitchTabById('book')">+ New booking</button>
    </div>
    <div class="dtabs">
      <div class="dtab${S.bizTab==='dashboard'?' active':''}" onclick="bizSwitchTab(this,'dashboard')">Dashboard</div>
      <div class="dtab${S.bizTab==='book'?' active':''}" onclick="bizSwitchTab(this,'book')">Book Delivery</div>
      <div class="dtab${S.bizTab==='drivers'?' active':''}" onclick="bizSwitchTab(this,'drivers')">Available Drivers</div>
      <div class="dtab${S.bizTab==='network'?' active':''}" onclick="bizSwitchTab(this,'network')">Network Booking</div>
      <div class="dtab${S.bizTab==='active'?' active':''}" onclick="bizSwitchTab(this,'active')">Active Jobs</div>
      <div class="dtab${S.bizTab==='history'?' active':''}" onclick="bizSwitchTab(this,'history')">Job History</div>
      <div class="dtab${S.bizTab==='spend'?' active':''}" onclick="bizSwitchTab(this,'spend')">Spend & Rebates</div>
      <div class="dtab${S.bizTab==='invoices'?' active':''}" onclick="bizSwitchTab(this,'invoices')">Invoices</div>
      <div class="dtab${S.bizTab==='details'?' active':''}" onclick="bizSwitchTab(this,'details')">Business Details</div>
      <div class="dtab${S.bizTab==='support'?' active':''}" onclick="bizSwitchTab(this,'support')">Support / JAKO</div>
    </div>
    <div id="biz-tab-content">${bizTabContent(S.bizTab)}</div>
  </div>`;
}

function bizSwitchTab(el, tab){
  S.bizTab = tab;
  el.closest('.dtabs').querySelectorAll('.dtab').forEach(function(t){t.classList.remove('active');});
  el.classList.add('active');
  document.getElementById('biz-tab-content').innerHTML = bizTabContent(tab);
  window.scrollTo(0,0);
}

function bizSwitchTabById(tab){
  S.bizTab = tab;
  document.getElementById('content').innerHTML = screenDashBusiness();
  window.scrollTo(0,0);
}

function bizTabContent(tab){
  switch(tab){
    case 'dashboard': return bizTabDashboard();
    case 'book':      return bizTabBook();
    case 'drivers':   return bizTabDrivers();
    case 'network':   return bizTabNetwork();
    case 'active':    return bizTabActive();
    case 'history':   return bizTabHistory();
    case 'spend':     return bizTabSpend();
    case 'invoices':  return bizTabInvoices();
    case 'details':   return bizTabDetails();
    case 'support':   return bizTabSupport();
    default:          return '';
  }
}

// ─── Biz Tab: Dashboard ────────────────────────────────────────────────────