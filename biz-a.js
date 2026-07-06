// ─── SCREEN: Signup — Business ─────────────────────────────────────────────
function screenSignupBusiness(){
  return `
  <div style="max-width:520px;margin:0 auto;padding:28px 20px;">
    <div class="back-link" onclick="render('select-role')">← Back</div>
    <div class="step-head">
      <div class="step-tag">Business Account — Step 1 of 2</div>
      <div class="step-title">Set up your business account</div>
      <div class="step-sub">For businesses moving their own goods through HAF KNECT. CleverPay verifies your Companies House registration before the account goes live.</div>
    </div>
    <div class="card mb16">
      <div class="field"><label>Business name</label><input type="text" placeholder="Acme Ltd" id="biz-name"/></div>
      <div class="field"><label>Companies House number</label><input type="text" placeholder="12345678" id="biz-ch" maxlength="8"/></div>
      <div class="field-row">
        <div class="field"><label>Contact name</label><input type="text" placeholder="Jane Smith" id="biz-contact"/></div>
        <div class="field"><label>Phone</label><input type="tel" placeholder="07700 900 000" id="biz-phone"/></div>
      </div>
      <div class="field"><label>Email</label><input type="email" placeholder="accounts@acmeltd.co.uk" id="biz-email"/></div>
      <div class="field"><label>Primary business address</label><input type="text" placeholder="123 Main Street, Sheffield, S1 1AA" id="biz-addr"/></div>
      <div class="field"><label>Type of goods you move</label>
        <select id="biz-goods"><option>Select…</option><option>Parcels / small items</option><option>Pallets</option><option>Tools / equipment</option><option>Stock / inventory</option><option>Returns</option><option>Trade materials</option><option>Mixed</option></select>
      </div>
      <div class="field"><label>How often do you send?</label>
        <select id="biz-freq"><option>Select…</option><option>Daily</option><option>A few times a week</option><option>Weekly</option><option>Monthly or less</option></select>
      </div>
    </div>
    <div class="banner banner-orange mb16">
      <span>⚠️</span><div>This account is for <strong>your own business goods only</strong> — stock, materials, customer orders, returns or equipment. Not for posting freight on behalf of other companies.</div>
    </div>
    <button class="btn btn-primary btn-full" onclick="businessSignup()">Next — CleverPay verification →</button>
  </div>`;
}

function businessSignup(){
  var name = (document.getElementById('biz-name')||{}).value||'Acme Ltd';
  S.bizName = name.trim() || 'Acme Ltd';
  S.bizTab = 'dashboard';
  render('signup-biz-verify');
}

// ─── SCREEN: Business — CleverPay Verify ──────────────────────────────────
function screenSignupBizVerify(){
  return `
  <div style="max-width:480px;margin:0 auto;padding:28px 20px;text-align:center;">
    <div class="step-head" style="text-align:center;">
      <div class="step-tag">Step 2 of 2 — CleverPay Verification</div>
      <div class="step-title">Verifying your business</div>
      <div class="step-sub">CleverPay is checking your Companies House registration. This usually takes a few minutes.</div>
    </div>
    <div class="card mb20" style="text-align:left;">
      <ul class="checklist">
        <li><span class="check-icon">⏳</span><div><div class="fw700">Companies House check</div><div class="fs12 text-muted">Verifying your registration number and business status.</div></div></li>
        <li><span class="check-icon">⬜</span><div><div class="fw700">Business address confirmed</div><div class="fs12 text-muted">Primary address added to your approved pickup locations.</div></div></li>
        <li><span class="check-icon">⬜</span><div><div class="fw700">Account activated</div><div class="fs12 text-muted">Full booking access unlocks once verification passes.</div></div></li>
      </ul>
    </div>
    <div class="banner banner-blue mb20">
      <span>ℹ️</span><div>You can access a limited dashboard now. Full booking access unlocks when CleverPay confirms your business.</div>
    </div>
    <button class="btn btn-primary btn-full" onclick="render('dash-business')">Go to my dashboard →</button>
  </div>`;
}

// ─── SCREEN: Signup — Freight ──────────────────────────────────────────────
function screenSignupFreight(){
  return `
  <div style="max-width:540px;margin:0 auto;padding:28px 20px;">
    <div class="back-link" onclick="render('select-role')">← Back</div>
    <div class="step-head">
      <div class="step-tag">Freight Forwarder / Load Poster</div>
      <div class="step-title">Join the HAF network</div>
      <div class="step-sub">Post loads, manage jobs and access reduced network fees through your tier.</div>
    </div>
    <div class="card mb16">
      <div class="card-title">Account tier</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div class="role-card" style="padding:14px;text-align:center;" onclick="selectTier(this,'free')">
          <div style="font-size:18px;font-weight:900;color:var(--muted);">Free</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px;">Basic posting</div>
        </div>
        <div class="role-card" style="padding:14px;text-align:center;" onclick="selectTier(this,'plus')">
          <div style="font-size:18px;font-weight:900;color:var(--orange);">Plus</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px;">Reduced fees + team</div>
        </div>
        <div class="role-card" style="padding:14px;text-align:center;" onclick="selectTier(this,'pro')">
          <div style="font-size:18px;font-weight:900;color:var(--purple);">Pro</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px;">Priority + full tools</div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="field"><label>Company name</label><input type="text" placeholder="Global Freight Co Ltd"/></div>
      <div class="field-row">
        <div class="field"><label>Contact name</label><input type="text" placeholder="John Davies"/></div>
        <div class="field"><label>Phone</label><input type="tel" placeholder="07700 900 000"/></div>
      </div>
      <div class="field"><label>Email</label><input type="email" placeholder="ops@globalfreight.co.uk"/></div>
      <div class="field"><label>Type of freight posted</label>
        <select><option>Select…</option><option>General cargo</option><option>Pallets</option><option>Full loads</option><option>Part loads</option><option>Express / time-critical</option></select>
      </div>
      <div class="field"><label>Monthly posting volume</label>
        <select><option>Select…</option><option>Under 10 loads</option><option>10–50 loads</option><option>50–200 loads</option><option>200+ loads</option></select>
      </div>
      <div class="banner banner-orange" style="margin-bottom:16px;">
        <span>📌</span><div>I confirm I understand the <strong>HAF Network Rules</strong> for load posting.</div>
      </div>
      <button class="btn btn-primary btn-full" onclick="render('dash-freight')">Create freight account →</button>
    </div>
  </div>`;
}

function selectTier(el, tier){
  document.querySelectorAll('.role-card').forEach(function(c){c.classList.remove('selected');});
  el.classList.add('selected');
}

// ─── SCREEN: Signup — Driver ───────────────────────────────────────────────
function screenSignupDriver(){
  return `
  <div style="max-width:520px;margin:0 auto;padding:28px 20px;">
    <div class="back-link" onclick="render('select-role')">← Back</div>
    <div class="step-head">
      <div class="step-tag">Driver / Courier — Step 1 of 3</div>
      <div class="step-title">Create your driver profile</div>
      <div class="step-sub">Your HAF username is generated from your name, phone and date of birth. It works across KNECT, PLNA, CleverPay and WhatsApp.</div>
    </div>
    <div class="card">
      <div class="field-row">
        <div class="field"><label>First name</label><input type="text" id="dr-fname" placeholder="Brent"/></div>
        <div class="field"><label>Last name</label><input type="text" id="dr-lname" placeholder="Ford"/></div>
      </div>
      <div class="field"><label>Email</label><input type="email" id="dr-email" placeholder="you@example.com"/></div>
      <div class="field-row">
        <div class="field"><label>Phone / WhatsApp</label><input type="tel" id="dr-phone" placeholder="07966 146 387"/></div>
        <div class="field"><label>Date of birth</label><input type="date" id="dr-dob" value="1993-01-01"/></div>
      </div>
      <div class="field"><label>Vehicle type</label>
        <select id="dr-vehicle"><option>Small van</option><option>Medium van</option><option>Large van</option><option>Luton van</option><option>Flatbed</option><option>Car / estate</option></select>
      </div>
      <div class="field"><label>Base location (postcode)</label><input type="text" id="dr-base" placeholder="S3 8BX"/></div>
      <div class="field"><label>Areas covered</label><input type="text" placeholder="Sheffield, Rotherham, Barnsley, Leeds"/></div>
      <button class="btn btn-primary btn-full mt8" onclick="driverNext()">Next — generate my username →</button>
    </div>
  </div>`;
}

function driverNext(){
  var fn = (document.getElementById('dr-fname').value||'Brent').trim();
  var ln = (document.getElementById('dr-lname').value||'Ford').trim();
  var phone = (document.getElementById('dr-phone').value||'07966146387').replace(/\s/g,'');
  var dob = (document.getElementById('dr-dob').value||'1993-01-01');
  var fi = fn[0].toUpperCase();
  var li = ln[0].toUpperCase();
  var last4 = phone.slice(-4);
  var yr = dob.slice(2,4);
  S.username = fi + li + last4 + yr;
  S.name = fn;
  render('driver-username');
}

// ─── SCREEN: Driver Username ───────────────────────────────────────────────
function screenDriverUsername(){
  return `
  <div style="max-width:480px;margin:0 auto;padding:28px 20px;">
    <div class="step-head">
      <div class="step-tag">Driver — Step 2 of 3</div>
      <div class="step-title">Your HAF username</div>
      <div class="step-sub">This is your single identity across KNECT, PLNA, CleverPay and WhatsApp. Keep it safe.</div>
    </div>
    <div class="username-box">
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;letter-spacing:.5px;font-weight:700;">YOUR HAF USERNAME</div>
      <div class="username-val">${S.username}</div>
      <div class="username-lbl">First initial + Last initial + Last 4 digits of phone + Last 2 of birth year</div>
    </div>
    <div class="banner banner-orange">
      <span>📱</span><div>The phone number you registered must match your WhatsApp number before your account can fully activate.</div>
    </div>
    <div class="card mt16">
      <div class="card-title">PLNA Tier</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <div class="role-card selected" style="padding:14px;"><div style="font-weight:800;color:var(--green);">Standard</div><div class="role-desc mt8">Core job access, availability tools, WhatsApp location.</div></div>
        <div class="role-card" style="padding:14px;"><div style="font-weight:800;color:var(--orange);">Plus</div><div class="role-desc mt8">Priority jobs, better visibility, PLNA AI tools.</div></div>
      </div>
    </div>
    <button class="btn btn-primary btn-full mt16" onclick="render('driver-cleverpay')">Next — CleverPay compliance →</button>
  </div>`;
}

// ─── SCREEN: Driver CleverPay ──────────────────────────────────────────────
function screenDriverCleverpay(){
  return `
  <div style="max-width:520px;margin:0 auto;padding:28px 20px;">
    <div class="step-head">
      <div class="step-tag">Driver — Step 3 of 3</div>
      <div class="step-title">Compliance — CleverPay / Clever Checked</div>
      <div class="step-sub">You must pass compliance before live jobs are unlocked. Upload your documents to start the check.</div>
    </div>
    <div class="banner banner-red">
      <span>🔒</span><div>Job access is <strong>blocked</strong> until your Clever Checked status is approved. This usually takes 24–48 hours.</div>
    </div>
    <div class="card mt16">
      <div class="card-title">Required documents</div>
      <ul class="checklist">
        <li><span class="check-icon">⬜</span><div><div class="fw700">Driving licence</div><div class="fs12 text-muted">Front and back. Must be valid UK licence.</div></div></li>
        <li><span class="check-icon">⬜</span><div><div class="fw700">Vehicle insurance certificate</div><div class="fs12 text-muted">Must include hire and reward cover for commercial delivery work.</div></div></li>
        <li><span class="check-icon">⬜</span><div><div class="fw700">Goods in transit insurance</div><div class="fs12 text-muted">Required before accessing any paid jobs.</div></div></li>
        <li><span class="check-icon">⬜</span><div><div class="fw700">Right to work (if applicable)</div><div class="fs12 text-muted">Passport or share code for non-UK nationals.</div></div></li>
        <li><span class="check-icon">⬜</span><div><div class="fw700">Vehicle photo</div><div class="fs12 text-muted">Clear photo of your vehicle showing the registration plate.</div></div></li>
      </ul>
    </div>
    <div class="card mt16">
      <div class="card-title">Upload documents</div>
      <div style="border:2px dashed var(--line);border-radius:var(--rsm);padding:28px;text-align:center;color:var(--muted);font-size:13px;">
        📎 Tap to upload or drag files here<br><span class="fs12" style="margin-top:6px;display:block;">PDF, JPG or PNG — max 10MB each</span>
      </div>
    </div>
    <button class="btn btn-primary btn-full mt16" onclick="render('dash-driver')">Submit and go to my dashboard →</button>
  </div>`;
}

// ─── SCREEN: Login — Ops ───────────────────────────────────────────────────