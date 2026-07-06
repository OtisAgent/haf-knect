function bizTabNetwork(){
  return `
    <div style="max-width:560px;">
      <div class="step-head">
        <div class="step-tag">Network Booking</div>
        <div class="step-title">Post to the HAF network</div>
        <div class="step-sub">OTIS matches your job to the best available driver — location, vehicle, compliance and price.</div>
      </div>
      <div class="banner banner-blue mb16">
        <span>⚡</span><div>Use this when you need HAF to find the right driver — faster matching, wider coverage, multiple drivers if needed.</div>
      </div>
      <div class="card mb16">
        <div class="field">
          <label>Pickup address <span class="text-orange">*</span></label>
          <select id="net-pickup">
            <option value="">— Select approved address —</option>
            <option>Sheffield HQ — 123 Main Street, Sheffield, S1 1AA</option>
            <option>Barnsley Depot — Unit 4, Industrial Estate, Barnsley, S70 2AA</option>
            <option>Leeds Store — 55 High Street, Leeds, LS1 3AB</option>
          </select>
        </div>
        <div class="field"><label>Delivery address <span class="text-orange">*</span></label><input type="text" placeholder="Full address or postcode" id="net-delivery"/></div>
        <div class="field-row">
          <div class="field"><label>Date <span class="text-orange">*</span></label><input type="date" id="net-date"/></div>
          <div class="field"><label>Earliest time</label><input type="time" id="net-time" value="08:00"/></div>
        </div>
      </div>
      <div class="card mb16">
        <div class="card-title">Consignment details</div>
        <div class="field">
          <label>Goods description <span class="text-orange">*</span></label>
          <input type="text" placeholder="e.g. Stock transfer, returns, equipment" id="net-goods"/>
        </div>
        <div class="field">
          <label>Internal reference <span class="text-orange">*</span></label>
          <input type="text" placeholder="PO number, stock ref or job number" id="net-ref"/>
        </div>
        <div class="field-row">
          <div class="field"><label>Van size</label>
            <select><option>HAF to decide</option><option>Small van</option><option>Medium van</option><option>Large van</option><option>Luton</option></select>
          </div>
          <div class="field"><label>Urgency</label>
            <select><option>Standard</option><option>Same day</option><option>Next day</option><option>Time-critical</option></select>
          </div>
        </div>
        <div class="field"><label>Special instructions</label><textarea placeholder="Tail lift required, fragile, call on arrival…" id="net-notes"></textarea></div>
      </div>
      <button class="btn btn-primary btn-full" onclick="bizNetworkSubmit()">Post to HAF network →</button>
    </div>`;
}

function bizNetworkSubmit(){
  document.getElementById('biz-tab-content').innerHTML = `
    <div style="max-width:480px;text-align:center;padding:40px 0;">
      <div style="font-size:48px;margin-bottom:16px;">📡</div>
      <div style="font-size:22px;font-weight:800;margin-bottom:8px;">Posted to the network</div>
      <div class="text-muted fs13 mb24">OTIS is matching your job to the best available driver. You'll be notified when allocated — usually within 10–15 minutes.</div>
      <div class="card mb20" style="text-align:left;">
        <div class="flex-between mb8"><span class="text-muted fs13">Job reference</span><span class="fw700">#HAF-B0053</span></div>
        <div class="flex-between mb8"><span class="text-muted fs13">Status</span><span class="chip chip-amber">Matching driver</span></div>
        <div class="flex-between"><span class="text-muted fs13">Est. allocation</span><span class="fw700">10–15 min</span></div>
      </div>
      <button class="btn btn-primary" onclick="bizSwitchTabById('active')">View active jobs →</button>
    </div>`;
}

// ─── Biz Tab: Active Jobs ──────────────────────────────────────────────────
function bizTabActive(){
  return `
    <div class="flex-between mb16">
      <div class="fw700">3 active jobs</div>
      <button class="btn btn-primary btn-sm" onclick="bizSwitchTabById('book')">+ New booking</button>
    </div>
    <div class="job-card">
      <div class="job-row">
        <div>
          <div class="job-title">#HAF-B0049 &nbsp; Sheffield → Manchester</div>
          <div class="job-meta mt8">Pallet · Ref: PO-2024-441 · Driver: TJ418793 · Collected 10:15</div>
        </div>
        <div style="text-align:right;">
          <span class="chip chip-green">In transit</span>
          <div class="fs12 text-muted mt8">ETA 12:30</div>
        </div>
      </div>
    </div>
    <div class="job-card">
      <div class="job-row">
        <div>
          <div class="job-title">#HAF-B0050 &nbsp; Sheffield → Leeds</div>
          <div class="job-meta mt8">Stock x4 · Ref: STK-0094 · Today 14:00</div>
        </div>
        <span class="chip chip-amber">Allocating driver</span>
      </div>
    </div>
    <div class="job-card">
      <div class="job-row">
        <div>
          <div class="job-title">#HAF-B0051 &nbsp; Barnsley Depot → Sheffield HQ</div>
          <div class="job-meta mt8">Equipment return · Ref: RET-2024-12 · Tomorrow 09:00</div>
        </div>
        <span class="chip chip-blue">Scheduled</span>
      </div>
    </div>`;
}

// ─── Biz Tab: Job History ──────────────────────────────────────────────────
function bizTabHistory(){
  return `
    <div class="flex-between mb16">
      <div class="fw700">47 completed jobs</div>
      <select style="background:var(--panel2);border:1px solid var(--line);color:var(--text);padding:6px 12px;border-radius:var(--rsm);font-size:13px;">
        <option>This month</option><option>Last month</option><option>Last 3 months</option><option>All time</option>
      </select>
    </div>
    <div class="card">
      <table class="tbl">
        <tr><th>Ref</th><th>Job</th><th>Goods / Internal ref</th><th>Driver</th><th>Date</th><th>Cost</th><th>Status</th></tr>
        <tr>
          <td class="fw700">#HAF-B0048</td><td>Sheffield → Doncaster</td>
          <td><div class="fw700">Stock items</div><div class="fs12 text-muted">STK-0093</div></td>
          <td>TJ418793</td><td class="text-muted">5 Jul</td><td class="fw700">£42.00</td>
          <td><span class="chip chip-green">Completed</span></td>
        </tr>
        <tr>
          <td class="fw700">#HAF-B0047</td><td>Leeds → Sheffield</td>
          <td><div class="fw700">Returns x2</div><div class="fs12 text-muted">RET-2024-11</div></td>
          <td>JD224192</td><td class="text-muted">4 Jul</td><td class="fw700">£38.50</td>
          <td><span class="chip chip-green">Completed</span></td>
        </tr>
        <tr>
          <td class="fw700">#HAF-B0046</td><td>Sheffield → Manchester</td>
          <td><div class="fw700">Pallet — materials</div><div class="fs12 text-muted">PO-2024-440</div></td>
          <td>TJ418793</td><td class="text-muted">3 Jul</td><td class="fw700">£58.00</td>
          <td><span class="chip chip-green">Completed</span></td>
        </tr>
        <tr>
          <td class="fw700">#HAF-B0045</td><td>Barnsley → Leeds</td>
          <td><div class="fw700">Equipment</div><div class="fs12 text-muted">EQP-0021</div></td>
          <td>JD224192</td><td class="text-muted">2 Jul</td><td class="fw700">£45.00</td>
          <td><span class="chip chip-green">Completed</span></td>
        </tr>
      </table>
    </div>
    <div class="text-muted fs12 mt12" style="text-align:center;">Showing 4 of 47 jobs. <span style="color:var(--orange);cursor:pointer;">Download full history →</span></div>`;
}

// ─── Biz Tab: Spend & Rebates ──────────────────────────────────────────────
function bizTabSpend(){
  return `
    <div class="step-head">
      <div class="step-tag">Spend & Rebates</div>
      <div class="step-title">Your account spend</div>
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val">£4,250</div><div class="stat-lbl">Lifetime spend</div></div>
      <div class="stat-box"><div class="stat-val text-orange">£1,840</div><div class="stat-lbl">This month</div></div>
      <div class="stat-box"><div class="stat-val">£410</div><div class="stat-lbl">This week</div></div>
      <div class="stat-box"><div class="stat-val">£39.20</div><div class="stat-lbl">Avg job value</div></div>
    </div>
    <div class="card mb20">
      <div class="flex-between mb12">
        <div>
          <div class="fw700">Starter tier — 2% rebate</div>
          <div class="fs12 text-muted mt8">Spend <strong>£750 more</strong> to unlock Growth tier (4% rebate).</div>
        </div>
        <span class="chip chip-green">£54 earned</span>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:37%"></div></div>
      <div class="flex-between mt8 fs12 text-muted"><span>£1,000 Starter</span><span>£5,000 Growth →</span></div>
    </div>
    <div class="card mb20">
      <div class="card-title">Rebate tiers</div>
      <table class="tbl">
        <tr><th>Tier</th><th>Threshold</th><th>Rebate</th><th>Status</th></tr>
        <tr><td>No rebate</td><td>£0 – £999</td><td>—</td><td class="text-muted fs12">Past</td></tr>
        <tr style="background:rgba(34,197,94,.04);">
          <td class="fw700 text-green">Starter</td><td>£1,000 – £4,999</td><td class="fw700">2%</td>
          <td><span class="chip chip-green">Active ✓</span></td>
        </tr>
        <tr><td>Growth</td><td>£5,000 – £9,999</td><td class="fw700">4%</td><td><span class="chip chip-grey">£750 away</span></td></tr>
        <tr><td>Key Account</td><td>£10,000+</td><td class="fw700">6%</td><td class="text-muted fs12">Locked</td></tr>
        <tr><td>Custom</td><td>Agreed with HAF</td><td class="fw700">Bespoke</td><td class="text-muted fs12">Contact HAF</td></tr>
      </table>
    </div>
    <div class="card">
      <div class="card-title">Monthly breakdown</div>
      <table class="tbl">
        <tr><th>Month</th><th>Jobs</th><th>Spend</th><th>Rebate earned</th></tr>
        <tr><td>July 2026</td><td>47</td><td>£1,840</td><td class="text-green fw700">£36.80</td></tr>
        <tr><td>June 2026</td><td>38</td><td>£1,540</td><td class="text-green fw700">£30.80</td></tr>
        <tr><td>May 2026</td><td>22</td><td>£870</td><td class="text-muted fs12">Below threshold</td></tr>
      </table>
    </div>
    <div class="banner banner-orange mt20">
      <span>💬</span><div>Want to discuss a custom rate or key account rebate? <span class="fw700" style="cursor:pointer;" onclick="bizSwitchTabById('support')">Talk to HAF →</span></div>
    </div>`;
}

// ─── Biz Tab: Invoices ─────────────────────────────────────────────────────
function bizTabInvoices(){
  return `
    <div class="flex-between mb16">
      <div class="fw700">Invoices</div>
      <button class="btn btn-secondary btn-sm">Download all</button>
    </div>
    <div class="card">
      <table class="tbl">
        <tr><th>Invoice</th><th>Period</th><th>Jobs</th><th>Amount</th><th>Status</th><th></th></tr>
        <tr>
          <td class="fw700">INV-0006</td><td>Jun 2026</td><td>38</td><td class="fw700">£1,540.00</td>
          <td><span class="chip chip-green">Paid</span></td>
          <td><button class="btn btn-secondary btn-sm">Download</button></td>
        </tr>
        <tr>
          <td class="fw700">INV-0005</td><td>May 2026</td><td>22</td><td class="fw700">£870.00</td>
          <td><span class="chip chip-green">Paid</span></td>
          <td><button class="btn btn-secondary btn-sm">Download</button></td>
        </tr>
        <tr>
          <td class="fw700">INV-0004</td><td>Apr 2026</td><td>19</td><td class="fw700">£740.00</td>
          <td><span class="chip chip-green">Paid</span></td>
          <td><button class="btn btn-secondary btn-sm">Download</button></td>
        </tr>
      </table>
    </div>
    <div class="banner banner-blue mt16">
      <span>ℹ️</span><div>Invoices are generated monthly. All job costs and rebate credits appear on your monthly invoice. <span class="fw700" style="cursor:pointer;" onclick="bizSwitchTabById('support')">Questions? →</span></div>
    </div>`;
}

// ─── Biz Tab: Business Details ─────────────────────────────────────────────