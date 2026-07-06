function bizTabDashboard(){
  return `
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val text-orange">3</div><div class="stat-lbl">Active jobs</div></div>
      <div class="stat-box"><div class="stat-val">47</div><div class="stat-lbl">Completed total</div></div>
      <div class="stat-box"><div class="stat-val">£1,840</div><div class="stat-lbl">Spent this month</div></div>
      <div class="stat-box"><div class="stat-val text-green">£54</div><div class="stat-lbl">Rebate earned</div></div>
    </div>
    <div class="card mb20">
      <div class="flex-between mb12">
        <div>
          <div class="fw000">Rebate progress — Starter tier (2%)</div>
          <div class="fs12 text-muted mt8">Spent <strong>£1,840</strong> this month. Spend another <strong>£3,160</strong> to unlock Growth (4%).</div>
        </div>
        <span class="chip chip-green">2% active</span>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:37%"></div></div>
      <div class="flex-between mt8" style="font-size:11px;color:var(--muted);">
        <span>£1,000 Starter</span><span>£5,000 Growth</span><span>£10,000 Key</span>
      </div>
    </div>
    <div class="flex-between mb12">
      <div class="fw700 fs13">Recent jobs</div>
      <span class="text-muted fs12" style="cursor:pointer;" onclick="bizSwitchTabById('active')">View all →</span>
    </div>
    <div class="job-card">
      <div class="job-row">
        <div>
          <div class="job-title">Sheffield → Manchester</div>
          <div class="job-meta">Pallet · Ref: PO-2024-441 · Driver: TJ418793 · Today 10:00</div>
        </div>
        <span class="chip chip-green">In transit</span>
      </div>
    </div>
    <div class="job-card">
      <div class="job-row">
        <div>
          <div class="job-title">Sheffield → Leeds</div>
          <div class="job-meta">Stock transfer x4 · Ref: STK-0094 · Today 14:00</div>
        </div>
        <span class="chip chip-amber">Allocating driver</span>
      </div>
    </div>
    <div class="job-card">
      <div class="job-row">
        <div>
          <div class="job-title">Barnsley Depot → Sheffield HQ</div>
          <div class="job-meta">Equipment return · Ref: RET-2024-12 · Tomorrow 09:00</div>
        </div>
        <span class="chip chip-blue">Scheduled</span>
      </div>
    </div>
    <div class="two-col mt20">
      <button class="btn btn-primary btn-full" onclick="bizSwitchTabById('book')">+ Book a delivery</button>
      <button class="btn btn-secondary btn-full" onclick="bizSwitchTabById('spend')">Spend & rebates →</button>
    </div>`;
}

// ─── Biz Tab: Book Delivery (consignment-enforced) ─────────────────────────
function bizTabBook(){
  var bizName = S.bizName || 'Acme Ltd';
  return `
    <div style="max-width:580px;">
      <div class="step-head">
        <div class="step-tag">Book a delivery</div>
        <div class="step-title">New job booking</div>
        <div class="step-sub">Every booking is linked to your business account. You can only book jobs for your own goods.</div>
      </div>
      <div class="card mb16">
        <div class="card-title">Sender — locked to your account</div>
        <div class="field">
          <label>Business name</label>
          <input type="text" value="${bizName}" readonly style="color:var(--muted);cursor:not-allowed;"/>
        </div>
        <div class="field">
          <label>Pickup address <span class="text-orange">*</span></label>
          <select id="bk-pickup">
            <option value="">— Select approved address —</option>
            <option value="Sheffield HQ">Sheffield HQ — 123 Main Street, Sheffield, S1 1AA</option>
            <option value="Barnsley Depot">Barnsley Depot — Unit 4, Industrial Estate, Barnsley, S70 2AA</option>
            <option value="Leeds Store">Leeds Store — 55 High Street, Leeds, LS1 3AB</option>
          </select>
          <div class="fs12 text-muted mt8">Only approved business addresses. <span style="color:var(--orange);cursor:pointer;" onclick="bizSwitchTabById('details')">Add a new address →</span></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Collection date <span class="text-orange">*</span></label><input type="date" id="bk-date"/></div>
          <div class="field"><label>Earliest time</label><input type="time" id="bk-time" value="09:00"/></div>
        </div>
        <div class="field"><label>Access notes</label><input type="text" placeholder="e.g. Call on arrival, ask for warehouse" id="bk-access"/></div>
      </div>
      <div class="card mb16">
        <div class="card-title">Delivery</div>
        <div class="field"><label>Delivery address <span class="text-orange">*</span></label><input type="text" placeholder="Full address or postcode" id="bk-delivery"/></div>
        <div class="field"><label>Delivery instructions</label><input type="text" placeholder="e.g. Leave at reception, call before arrival" id="bk-del-notes"/></div>
      </div>
      <div class="card mb16">
        <div class="card-title">Consignment details <span class="fs12 text-muted fw700" style="font-weight:400;">— confirms these are your goods</span></div>
        <div class="field">
          <label>Goods description <span class="text-orange">*</span></label>
          <input type="text" placeholder="e.g. 4 boxes of stock, pallet of materials, equipment return" id="bk-goods"/>
          <div class="fs12 text-muted mt8">Describe what is being moved. Must match your business type.</div>
        </div>
        <div class="field">
          <label>Internal reference <span class="text-orange">*</span></label>
          <input type="text" placeholder="e.g. PO-2024-441, STK-0094, RET-12" id="bk-ref"/>
          <div class="fs12 text-muted mt8">Your PO number, stock ref or job number. Stored with every booking for your records.</div>
        </div>
        <div class="field-row">
          <div class="field"><label>Weight</label>
            <select id="bk-weight"><option>Under 10kg</option><option>10–50kg</option><option>50–100kg</option><option>100–500kg</option><option>500kg+</option><option>Not sure</option></select>
          </div>
          <div class="field"><label>Van size</label>
            <select id="bk-van"><option>Let HAF decide</option><option>Small van</option><option>Medium van</option><option>Large van</option><option>Luton van</option></select>
          </div>
        </div>
        <div class="field"><label>Urgency</label>
          <select id="bk-urgency"><option>Standard</option><option>Same day</option><option>Next day</option><option>Pre-booked (specific time)</option></select>
        </div>
      </div>
      <div id="bk-error" class="banner banner-red" style="display:none;">
        <span>⚠️</span><div id="bk-error-msg">Please fill in all required fields.</div>
      </div>
      <div class="two-col">
        <button class="btn btn-primary btn-full" onclick="bizBookDirect()">Choose a driver →</button>
        <button class="btn btn-secondary btn-full" onclick="bizBookToNetwork()">Post to HAF network →</button>
      </div>
      <div class="text-muted fs12 mt12">Every booking is audited. Only your own goods — internal reference required on all jobs.</div>
    </div>`;
}

function bizValidateBooking(){
  var pickup   = (document.getElementById('bk-pickup')||{}).value||'';
  var goods    = ((document.getElementById('bk-goods')||{}).value||'').trim();
  var ref      = ((document.getElementById('bk-ref')||{}).value||'').trim();
  var delivery = ((document.getElementById('bk-delivery')||{}).value||'').trim();
  var err = document.getElementById('bk-error');
  var errMsg = document.getElementById('bk-error-msg');
  if(!pickup){ errMsg.textContent='Please select a pickup address from your approved list.'; err.style.display='flex'; return false; }
  if(!goods){  errMsg.textContent='Goods description is required.'; err.style.display='flex'; return false; }
  if(!ref){    errMsg.textContent='Internal reference is required (PO number, stock ref, etc.).'; err.style.display='flex'; return false; }
  if(!delivery){ errMsg.textContent='Please enter a delivery address.'; err.style.display='flex'; return false; }
  err.style.display='none';
  return true;
}

function bizBookDirect(){
  if(!bizValidateBooking()) return;
  S.bizTab='drivers';
  document.getElementById('content').innerHTML = screenDashBusiness();
}

function bizBookToNetwork(){
  if(!bizValidateBooking()) return;
  S.bizTab='network';
  document.getElementById('content').innerHTML = screenDashBusiness();
}

// ─── Biz Tab: Available Drivers ────────────────────────────────────────────
function bizTabDrivers(){
  return `
    <div class="step-head">
      <div class="step-tag">Available Drivers</div>
      <div class="step-title">Choose a driver</div>
      <div class="step-sub">Only active, Clever Checked drivers are shown. Filter by vehicle type or area.</div>
    </div>
    <div class="card mb16">
      <div class="field-row" style="margin-bottom:0;">
        <div class="field" style="margin-bottom:0;"><label>Vehicle</label>
          <select><option>Any</option><option>Small van</option><option>Medium van</option><option>Large van</option><option>Luton</option></select>
        </div>
        <div class="field" style="margin-bottom:0;"><label>Area</label><input type="text" placeholder="Postcode or city"/></div>
      </div>
    </div>
    <div class="job-card">
      <div class="job-row">
        <div>
          <div class="job-title">TJ418793 &nbsp;<span class="chip chip-green">Clever Checked ✓</span></div>
          <div class="job-meta mt8">Medium van · Sheffield S3 · 0.8 mi · Standard Plus</div>
          <div class="fs12 text-muted mt8">Parcels, pallets, stock transfers</div>
        </div>
        <div style="text-align:right;">
          <div class="fw800 text-orange" style="font-size:18px;">~£28</div>
          <div class="fs12 text-muted mb8">estimated</div>
          <button class="btn btn-primary btn-sm" onclick="bizConfirmDirect('TJ418793')">Book →</button>
        </div>
      </div>
    </div>
    <div class="job-card">
      <div class="job-row">
        <div>
          <div class="job-title">JD224192 &nbsp;<span class="chip chip-green">Clever Checked ✓</span></div>
          <div class="job-meta mt8">Large van · Barnsley S70 · 6.2 mi · Standard</div>
          <div class="fs12 text-muted mt8">Pallets, equipment, bulk items</div>
        </div>
        <div style="text-align:right;">
          <div class="fw800 text-orange" style="font-size:18px;">~£34</div>
          <div class="fs12 text-muted mb8">estimated</div>
          <button class="btn btn-primary btn-sm" onclick="bizConfirmDirect('JD224192')">Book →</button>
        </div>
      </div>
    </div>
    <div class="job-card">
      <div class="job-row">
        <div>
          <div class="job-title">BF638793 &nbsp;<span class="chip chip-amber">Compliance pending</span></div>
          <div class="job-meta mt8">Small van · Sheffield S1 · 1.2 mi · Standard</div>
        </div>
        <button class="btn btn-secondary btn-sm" disabled style="opacity:0.4;cursor:not-allowed;">Unavailable</button>
      </div>
    </div>
    <div class="banner banner-blue mt16">
      <span>ℹ️</span><div>Can't find the right driver? <span class="fw700" style="cursor:pointer;" onclick="bizSwitchTabById('network')">Post to the HAF network →</span> — OTIS will match you to the best available driver.</div>
    </div>`;
}

function bizConfirmDirect(driverId){
  document.getElementById('biz-tab-content').innerHTML = `
    <div style="max-width:480px;text-align:center;padding:40px 0;">
      <div style="font-size:48px;margin-bottom:16px;">✅</div>
      <div style="font-size:22px;font-weight:800;margin-bottom:8px;">Booking confirmed</div>
      <div class="text-muted fs13 mb24">Driver ${driverId} has been notified. You'll get a confirmation shortly.</div>
      <div class="card mb20" style="text-align:left;">
        <div class="flex-between mb8"><span class="text-muted fs13">Job reference</span><span class="fw700">#HAF-B0052</span></div>
        <div class="flex-between mb8"><span class="text-muted fs13">Driver</span><span class="fw700">${driverId}</span></div>
        <div class="flex-between mb8"><span class="text-muted fs13">Status</span><span class="chip chip-amber">Awaiting confirmation</span></div>
        <div class="flex-between"><span class="text-muted fs13">Internal ref</span><span class="fw700">PO-2024-441</span></div>
      </div>
      <button class="btn btn-primary" onclick="bizSwitchTabById('active')">View active jobs →</button>
    </div>`;
}

// ─── Biz Tab: Network Booking ──────────────────────────────────────────────