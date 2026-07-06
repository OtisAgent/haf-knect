// ─── SCREEN: Dashboard — Freight ──────────────────────────────────────────
function screenDashFreight(){
  return `
  <div style="padding:28px 20px;max-width:960px;margin:0 auto;">
    <div class="flex-between mb24">
      <div>
        <div style="font-size:22px;font-weight:800;">Freight Dashboard</div>
        <div class="text-muted fs13 mt8">Global Freight Co &nbsp;·&nbsp; <span class="chip chip-amber">Plus Tier</span></div>
      </div>
      <button class="btn btn-primary" onclick="render('post-load')">+ Post a load</button>
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val text-orange">5</div><div class="stat-lbl">Live loads</div></div>
      <div class="stat-box"><div class="stat-val">128</div><div class="stat-lbl">Total posted</div></div>
      <div class="stat-box"><div class="stat-val text-green">12%</div><div class="stat-lbl">Fee reduction</div></div>
      <div class="stat-box"><div class="stat-val">3</div><div class="stat-lbl">Team users</div></div>
    </div>
    <div class="dtabs">
      <div class="dtab active">Live loads</div>
      <div class="dtab">Completed</div>
      <div class="dtab">Network fees</div>
      <div class="dtab">Team</div>
      <div class="dtab">Billing</div>
    </div>
    <div class="job-card">
      <div class="job-row"><div><div class="job-title">Birmingham → Leeds — 4 pallets</div><div class="job-meta">Posted 40 min ago · 2 drivers interested · £380</div></div><span class="chip chip-orange" style="background:rgba(249,115,22,.15);color:#fb923c;">Matching</span></div>
    </div>
    <div class="job-card">
      <div class="job-row"><div><div class="job-title">Manchester → Sheffield — Full load</div><div class="job-meta">Driver allocated: BF638793 · Collected 09:15 · £520</div></div><span class="chip chip-green">In transit</span></div>
    </div>
    <div class="job-card">
      <div class="job-row"><div><div class="job-title">Leeds → London — Part load</div><div class="job-meta">Tomorrow 08:00 · Pre-booked · £640</div></div><span class="chip chip-blue">Scheduled</span></div>
    </div>
  </div>`;
}

// ─── SCREEN: Post a Load ───────────────────────────────────────────────────
function screenPostLoad(){
  return `
  <div style="max-width:560px;margin:0 auto;padding:28px 20px;">
    <div class="back-link" onclick="render('dash-freight')">← Dashboard</div>
    <div class="step-head">
      <div class="step-tag">Post a load</div>
      <div class="step-title">Add a new job to the network</div>
    </div>
    <div class="card mb16">
      <div class="field-row">
        <div class="field"><label>Collection postcode</label><input type="text" placeholder="B1 1BB"/></div>
        <div class="field"><label>Delivery postcode</label><input type="text" placeholder="LS1 1AA"/></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Collection date</label><input type="date"/></div>
        <div class="field"><label>Collection time</label><input type="time" value="08:00"/></div>
      </div>
      <div class="field"><label>Freight type</label>
        <select><option>General cargo</option><option>Pallets</option><option>Part load</option><option>Full load</option><option>Express</option></select>
      </div>
      <div class="field-row">
        <div class="field"><label>Weight (kg)</label><input type="number" placeholder="500"/></div>
        <div class="field"><label>Value (£)</label><input type="number" placeholder="2000"/></div>
      </div>
      <div class="field"><label>Special instructions</label><textarea placeholder="Tail lift required, fragile goods…"></textarea></div>
      <div class="field-row">
        <div class="field"><label>Your rate (£)</label><input type="number" placeholder="380"/></div>
        <div class="field"><label>Network fee band</label><input type="text" value="Plus — 12% reduction" readonly style="color:var(--muted);"/></div>
      </div>
    </div>
    <button class="btn btn-primary btn-full" onclick="render('dash-freight')">Post load to network →</button>
  </div>`;
}

// ─── SCREEN: Dashboard — Driver ────────────────────────────────────────────
function screenDashDriver(){
  var un = S.username || 'BF638793';
  return `
  <div style="padding:28px 20px;max-width:860px;margin:0 auto;">
    <div class="flex-between mb16">
      <div>
        <div style="font-size:22px;font-weight:800;">Driver Dashboard</div>
        <div class="text-muted fs13 mt8">${un} &nbsp;·&nbsp; Standard Plan &nbsp;·&nbsp; <span class="chip chip-amber">Compliance pending</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="text-muted fs12">Available</span>
        <div style="width:44px;height:26px;border-radius:13px;background:var(--line);position:relative;cursor:pointer;" onclick="this.style.background='var(--green)'">
          <div style="position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:all .2s;"></div>
        </div>
      </div>
    </div>
    <div class="banner banner-red">
      <span>🔒</span><div><strong>Job access locked</strong> — your CleverPay compliance check is in progress. You'll be notified when approved. Expected: 24–48 hours.</div>
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val text-muted">—</div><div class="stat-lbl">Jobs today</div></div>
      <div class="stat-box"><div class="stat-val text-muted">—</div><div class="stat-lbl">Miles today</div></div>
      <div class="stat-box"><div class="stat-val text-muted">—</div><div class="stat-lbl">Earnings today</div></div>
      <div class="stat-box"><div class="stat-val text-muted">—</div><div class="stat-lbl">This week</div></div>
    </div>
    <div class="dtabs">
      <div class="dtab active">Today</div>
      <div class="dtab">Compliance</div>
      <div class="dtab">PLNA</div>
      <div class="dtab">Earnings</div>
      <div class="dtab">Support</div>
    </div>
    <div class="card" style="text-align:center;padding:40px 20px;">
      <div style="font-size:40px;margin-bottom:12px;">🔒</div>
      <div style="font-weight:700;margin-bottom:8px;">Jobs locked — compliance pending</div>
      <div class="text-muted fs13 mb20">Upload your documents to speed up your Clever Checked approval.</div>
      <button class="btn btn-primary btn-sm" onclick="render('driver-cleverpay')">View compliance checklist</button>
    </div>
    <div class="card mt16">
      <div class="card-title">Share your location via WhatsApp</div>
      <div class="flex-between">
        <div class="text-muted fs13">Tap to go active on the HAF network. Location only — no messages read.</div>
        <a href="https://wa.me/447707705331" target="_blank" class="btn btn-primary btn-sm">Go active →</a>
      </div>
    </div>
  </div>`;
}

// ─── SCREEN: Dashboard — Ops ───────────────────────────────────────────────
function screenDashOps(){
  return `
  <div style="padding:28px 20px;max-width:1040px;margin:0 auto;">
    <div class="flex-between mb24">
      <div>
        <div style="font-size:22px;font-weight:800;">HAF Ops — Dispatch Centre</div>
        <div class="text-muted fs13 mt8">Live network view &nbsp;·&nbsp; <span id="ops-time"></span></div>
      </div>
      <span class="chip chip-green">● Network live</span>
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val text-orange">8</div><div class="stat-lbl">Live jobs</div></div>
      <div class="stat-box"><div class="stat-val text-green">5</div><div class="stat-lbl">Drivers active</div></div>
      <div class="stat-box"><div class="stat-val text-amber" style="color:var(--amber);">2</div><div class="stat-lbl">Unallocated</div></div>
      <div class="stat-box"><div class="stat-val text-red">1</div><div class="stat-lbl">Issues</div></div>
    </div>
    <div class="two-col mb24">
      <div>
        <div class="card-title">Unallocated jobs</div>
        <div class="job-card">
          <div class="job-row"><div><div class="job-title">Sheffield → Doncaster</div><div class="job-meta">2 pallets · Customer: Acme Ltd · By 14:00</div></div><button class="btn btn-primary btn-sm">Allocate</button></div>
        </div>
        <div class="job-card">
          <div class="job-row"><div><div class="job-title">Leeds → Bradford</div><div class="job-meta">Parcel · Walk-in customer · ASAP</div></div><button class="btn btn-primary btn-sm">Allocate</button></div>
        </div>
      </div>
      <div>
        <div class="card-title">Active drivers</div>
        <table class="tbl">
          <tr><th>Driver</th><th>Status</th><th>Location</th></tr>
          <tr><td class="fw700">BF638793</td><td><span class="chip chip-green">Active</span></td><td class="text-muted">Sheffield S3</td></tr>
          <tr><td class="fw700">TJ418793</td><td><span class="chip chip-green">In transit</span></td><td class="text-muted">M1 J33</td></tr>
          <tr><td class="fw700">SM991893</td><td><span class="chip chip-amber">On break</span></td><td class="text-muted">Leeds LS1</td></tr>
          <tr><td class="fw700">JD224192</td><td><span class="chip chip-green">Active</span></td><td class="text-muted">Barnsley</td></tr>
          <tr><td class="fw700">KL770493</td><td><span class="chip chip-grey">Offline</span></td><td class="text-muted">—</td></tr>
        </table>
      </div>
    </div>
    <div class="banner banner-red">
      <span>⚠️</span><div><strong>Issue — Job #HAF-00238:</strong> Driver BF638793 has not updated status in 45 minutes. <span class="fw700" style="cursor:pointer;color:var(--red);">Investigate →</span></div>
    </div>
  </div>`;
}

// ─── SCREEN: Dashboard — Compliance ───────────────────────────────────────