function screenDashCompliance(){
  return `
  <div style="padding:28px 20px;max-width:1000px;margin:0 auto;">
    <div class="flex-between mb24">
      <div>
        <div style="font-size:22px;font-weight:800;">CleverPay — Compliance Dashboard</div>
        <div class="text-muted fs13 mt8">Clever Checked status &nbsp;·&nbsp; Driver document review</div>
      </div>
      <span class="chip chip-amber">3 pending reviews</span>
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val text-green">12</div><div class="stat-lbl">Fully compliant</div></div>
      <div class="stat-box"><div class="stat-val text-amber" style="color:var(--amber);">3</div><div class="stat-lbl">Pending review</div></div>
      <div class="stat-box"><div class="stat-val text-red">1</div><div class="stat-lbl">Blocked</div></div>
      <div class="stat-box"><div class="stat-val text-amber" style="color:var(--amber);">2</div><div class="stat-lbl">Expiring soon</div></div>
    </div>
    <div class="card">
      <div class="card-title">Driver compliance status</div>
      <table class="tbl">
        <tr><th>Driver</th><th>RAG</th><th>Licence</th><th>Insurance</th><th>GIT</th><th>Checked</th><th>Action</th></tr>
        <tr>
          <td class="fw700">BF638793</td>
          <td><span class="rag rag-a"></span></td>
          <td><span class="chip chip-green">✓</span></td>
          <td><span class="chip chip-green">✓</span></td>
          <td><span class="chip chip-amber">Pending</span></td>
          <td><span class="chip chip-amber">Pending</span></td>
          <td><button class="btn btn-primary btn-sm">Review</button></td>
        </tr>
        <tr>
          <td class="fw700">TJ418793</td>
          <td><span class="rag rag-g"></span></td>
          <td><span class="chip chip-green">✓</span></td>
          <td><span class="chip chip-green">✓</span></td>
          <td><span class="chip chip-green">✓</span></td>
          <td><span class="chip chip-green">Approved</span></td>
          <td><button class="btn btn-secondary btn-sm">View</button></td>
        </tr>
        <tr>
          <td class="fw700">SM991893</td>
          <td><span class="rag rag-r"></span></td>
          <td><span class="chip chip-green">✓</span></td>
          <td><span class="chip chip-red">Expired</span></td>
          <td><span class="chip chip-red">Missing</span></td>
          <td><span class="chip chip-red">Blocked</span></td>
          <td><button class="btn btn-secondary btn-sm" style="border-color:var(--red);color:var(--red);">Block active</button></td>
        </tr>
        <tr>
          <td class="fw700">JD224192</td>
          <td><span class="rag rag-a"></span></td>
          <td><span class="chip chip-amber">Exp. 30 days</span></td>
          <td><span class="chip chip-green">✓</span></td>
          <td><span class="chip chip-green">✓</span></td>
          <td><span class="chip chip-amber">Warning</span></td>
          <td><button class="btn btn-primary btn-sm">Request renewal</button></td>
        </tr>
      </table>
    </div>
  </div>`;
}

// ─── SCREEN: Dashboard — Admin ─────────────────────────────────────────────
function screenDashAdmin(){
  return `
  <div style="padding:28px 20px;max-width:1060px;margin:0 auto;">
    <div class="flex-between mb24">
      <div>
        <div style="font-size:22px;font-weight:800;">Admin — Full Network View</div>
        <div class="text-muted fs13 mt8">Brent Kyle Ford &nbsp;·&nbsp; <span class="chip chip-orange" style="background:rgba(249,115,22,.15);color:var(--orange);">Master account</span></div>
      </div>
      <span class="chip chip-green">● All systems live</span>
    </div>
    <div class="net-grid">
      <div class="net-card">
        <div class="net-card-header"><span class="net-card-title">👥 Users</span><span class="chip chip-green">16 total</span></div>
        <table class="tbl">
          <tr><th>Type</th><th>Count</th><th>Status</th></tr>
          <tr><td>Customers</td><td>8</td><td><span class="chip chip-green">Active</span></td></tr>
          <tr><td>Businesses</td><td>2</td><td><span class="chip chip-green">Active</span></td></tr>
          <tr><td>Freight</td><td>1</td><td><span class="chip chip-green">Active</span></td></tr>
          <tr><td>Drivers</td><td>5</td><td><span class="chip chip-amber">3 compliant</span></td></tr>
        </table>
      </div>
      <div class="net-card">
        <div class="net-card-header"><span class="net-card-title">📦 Jobs today</span><span class="chip chip-orange" style="background:rgba(249,115,22,.15);color:var(--orange);">8 live</span></div>
        <div class="flex-between mb8 fs13"><span class="text-muted">Allocated</span><span class="fw700">6</span></div>
        <div class="flex-between mb8 fs13"><span class="text-muted">Unallocated</span><span class="fw700 text-amber" style="color:var(--amber);">2</span></div>
        <div class="flex-between mb8 fs13"><span class="text-muted">Completed</span><span class="fw700 text-green">14</span></div>
        <div class="flex-between fs13"><span class="text-muted">Revenue</span><span class="fw700">£2,340</span></div>
      </div>
      <div class="net-card">
        <div class="net-card-header"><span class="net-card-title">🔑 Access control</span></div>
        <div class="fs13 text-muted mb12">Manage which pages each account type can see.</div>
        <button class="btn btn-secondary btn-sm btn-full mb8">Manage permissions</button>
        <button class="btn btn-secondary btn-sm btn-full">Override user access</button>
      </div>
      <div class="net-card">
        <div class="net-card-header"><span class="net-card-title">📋 CleverPay</span><span class="chip chip-amber">1 blocked</span></div>
        <div class="flex-between mb8 fs13"><span class="text-muted">Fully compliant</span><span class="fw700 text-green">12</span></div>
        <div class="flex-between mb8 fs13"><span class="text-muted">Pending</span><span class="fw700 text-amber" style="color:var(--amber);">3</span></div>
        <div class="flex-between fs13"><span class="text-muted">Blocked</span><span class="fw700 text-red">1</span></div>
        <button class="btn btn-primary btn-sm mt12" onclick="render('dash-compliance')">Open compliance →</button>
      </div>
      <div class="net-card">
        <div class="net-card-header"><span class="net-card-title">🛍️ Shopify purchases</span></div>
        <div class="fs13 text-muted mb12">KNECT milestone payments and Shopify order records.</div>
        <div class="flex-between mb8 fs13"><span class="text-muted">Founder Supporter (£100)</span><span class="fw700">4</span></div>
        <div class="flex-between mb8 fs13"><span class="text-muted">Builder Supporter (£250)</span><span class="fw700">2</span></div>
        <div class="flex-between fs13"><span class="text-muted">Network Partner (£500)</span><span class="fw700">1</span></div>
      </div>
      <div class="net-card">
        <div class="net-card-header"><span class="net-card-title">🤖 OTIS control</span></div>
        <div class="fs13 text-muted mb12">Manual overrides, system logs and OTIS actions.</div>
        <button class="btn btn-secondary btn-sm btn-full mb8">System logs</button>
        <button class="btn btn-secondary btn-sm btn-full mb8">Manual account override</button>
        <button class="btn btn-primary btn-sm btn-full">PLNA → KNECT link manager</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">All accounts</div>
      <table class="tbl">
        <tr><th>Name / Username</th><th>Type</th><th>Status</th><th>Shopify</th><th>CleverPay</th><th>PLNA</th><th>Action</th></tr>
        <tr><td><div class="fw700">BF638793</div><div class="fs12 text-muted">Brent Ford</div></td><td><span class="chip chip-purple">Driver</span></td><td><span class="chip chip-amber">Pending</span></td><td><span class="chip chip-green">✓ £100</span></td><td><span class="chip chip-amber">Review</span></td><td><span class="chip chip-blue">Linked</span></td><td><button class="btn btn-secondary btn-sm">Manage</button></td></tr>
        <tr><td><div class="fw700">Acme Ltd</div><div class="fs12 text-muted">Jane Smith</div></td><td><span class="chip chip-blue">Business</span></td><td><span class="chip chip-green">Active</span></td><td><span class="chip chip-grey">None</span></td><td><span class="text-muted fs12">N/A</span></td><td><span class="text-muted fs12">N/A</span></td><td><button class="btn btn-secondary btn-sm">Manage</button></td></tr>
        <tr><td><div class="fw700">TJ418793</div><div class="fs12 text-muted">Tom Jones</div></td><td><span class="chip chip-purple">Driver</span></td><td><span class="chip chip-green">Active</span></td><td><span class="chip chip-green">✓ £250</span></td><td><span class="chip chip-green">✓ Clear</span></td><td><span class="chip chip-blue">Linked</span></td><td><button class="btn btn-secondary btn-sm">Manage</button></td></tr>
      </table>
    </div>
  </div>`;
}

// ─── Tab switcher (generic) ───────────────────────────────────────────────
function dtab(el, id){
  el.closest('.dtabs').querySelectorAll('.dtab').forEach(function(t){t.classList.remove('active');});
  el.classList.add('active');
}

// ─── Live clock for ops ────────────────────────────────────────────────────
setInterval(function(){
  var el = document.getElementById('ops-time');
  if(el) el.textContent = new Date().toLocaleTimeString('en-GB');
},1000);