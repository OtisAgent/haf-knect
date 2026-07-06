function bizTabDetails(){
  var bizName = S.bizName || 'Acme Ltd';
  return `
    <div class="two-col mb20">
      <div>
        <div class="card">
          <div class="card-title">Business information</div>
          <div class="field"><label>Business name</label><input type="text" value="${bizName}"/></div>
          <div class="field"><label>Companies House no.</label><input type="text" value="09876543" readonly style="color:var(--muted);"/></div>
          <div class="field"><label>Contact name</label><input type="text" value="Jane Smith"/></div>
          <div class="field"><label>Email</label><input type="email" value="accounts@acmeltd.co.uk"/></div>
          <div class="field"><label>Phone</label><input type="tel" value="07700 900 001"/></div>
          <button class="btn btn-secondary btn-sm mt8">Save changes</button>
        </div>
      </div>
      <div>
        <div class="card mb16">
          <div class="card-title">CleverPay verification</div>
          <div class="banner banner-orange" style="margin-bottom:0;">
            <span>⏳</span><div><strong>Verification in progress.</strong> CleverPay is checking your Companies House registration. Full booking access unlocks once approved.</div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Account rules</div>
          <ul class="checklist" style="font-size:12px;">
            <li><span class="check-icon" style="font-size:13px;">✅</span><div>Book for your own goods only</div></li>
            <li><span class="check-icon" style="font-size:13px;">✅</span><div>Internal reference required on every job</div></li>
            <li><span class="check-icon" style="font-size:13px;">✅</span><div>Pickup from approved addresses only</div></li>
            <li><span class="check-icon" style="font-size:13px;">❌</span><div>No posting freight for other businesses</div></li>
            <li><span class="check-icon" style="font-size:13px;">❌</span><div>No reselling HAF courier access</div></li>
          </ul>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="flex-between mb16">
        <div>
          <div class="card-title" style="margin-bottom:0;">Approved pickup addresses</div>
          <div class="fs12 text-muted mt8">Jobs can only be collected from these locations. Ensures all consignments are from your business.</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="bizToggleAddForm()">+ Add address</button>
      </div>
      <div class="job-card" style="margin-bottom:8px;">
        <div class="job-row">
          <div><div class="fw700">Sheffield HQ</div><div class="job-meta mt8">123 Main Street, Sheffield, S1 1AA</div></div>
          <div style="display:flex;gap:8px;"><span class="chip chip-green">Primary</span><button class="btn btn-secondary btn-sm">Edit</button></div>
        </div>
      </div>
      <div class="job-card" style="margin-bottom:8px;">
        <div class="job-row">
          <div><div class="fw700">Barnsley Depot</div><div class="job-meta mt8">Unit 4, Industrial Estate, Barnsley, S70 2AA</div></div>
          <div style="display:flex;gap:8px;"><button class="btn btn-secondary btn-sm">Edit</button><button class="btn btn-secondary btn-sm" style="border-color:var(--red);color:var(--red);">Remove</button></div>
        </div>
      </div>
      <div class="job-card" style="margin-bottom:8px;">
        <div class="job-row">
          <div><div class="fw700">Leeds Store</div><div class="job-meta mt8">55 High Street, Leeds, LS1 3AB</div></div>
          <div style="display:flex;gap:8px;"><button class="btn btn-secondary btn-sm">Edit</button><button class="btn btn-secondary btn-sm" style="border-color:var(--red);color:var(--red);">Remove</button></div>
        </div>
      </div>
      <div id="biz-add-form" style="display:none;" class="mt16">
        <hr class="divider" style="margin-top:8px;">
        <div class="card-title mt16">New address</div>
        <div class="field"><label>Label</label><input type="text" placeholder="e.g. Manchester Warehouse" id="new-addr-label"/></div>
        <div class="field"><label>Full address</label><input type="text" placeholder="Full address including postcode" id="new-addr-full"/></div>
        <div class="field"><label>Type</label>
          <select id="new-addr-type"><option>Warehouse</option><option>Store</option><option>Office</option><option>Supplier</option><option>Other</option></select>
        </div>
        <div class="two-col mt8">
          <button class="btn btn-primary btn-full" onclick="bizSaveAddress()">Save address</button>
          <button class="btn btn-secondary btn-full" onclick="bizToggleAddForm()">Cancel</button>
        </div>
      </div>
    </div>`;
}

function bizToggleAddForm(){
  var f = document.getElementById('biz-add-form');
  f.style.display = f.style.display==='none' ? 'block' : 'none';
}

function bizSaveAddress(){
  document.getElementById('biz-add-form').style.display='none';
}

// ─── Biz Tab: Support / Ask JAKO ──────────────────────────────────────────
function bizTabSupport(){
  return `
    <div style="max-width:580px;">
      <div class="step-head">
        <div class="step-tag">Support</div>
        <div class="step-title">Ask JAKO</div>
        <div class="step-sub">JAKO is your HAF account assistant. Ask about bookings, spend, drivers, invoices or anything else.</div>
      </div>
      <div class="card mb12" style="min-height:300px;display:flex;flex-direction:column;">
        <div id="jako-msgs" style="flex:1;overflow-y:auto;padding-bottom:8px;">
          <div style="display:flex;gap:10px;margin-bottom:16px;">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0;color:#fff;">J</div>
            <div style="background:var(--panel2);border-radius:var(--rsm);padding:11px 14px;font-size:14px;max-width:82%;">Hi — I'm JAKO, your HAF account assistant. How can I help? Ask me about active jobs, drivers, spend, invoices or your account.</div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <input type="text" id="jako-input" placeholder="Ask JAKO anything…" style="flex:1;padding:11px 14px;border-radius:var(--rsm);border:1.5px solid var(--line);background:var(--bg);color:var(--text);font-size:14px;outline:none;" onkeydown="if(event.key==='Enter')jakoSend()"/>
        <button class="btn btn-primary btn-sm" onclick="jakoSend()">Send →</button>
      </div>
      <div class="text-muted fs12 mt12">Or call HAF direct: <strong>0114 XXX XXXX</strong> &nbsp;·&nbsp; Mon–Fri 8am–6pm</div>
    </div>`;
}

function jakoSend(){
  var input = document.getElementById('jako-input');
  var msg = input.value.trim();
  if(!msg) return;
  var chat = document.getElementById('jako-msgs');
  chat.innerHTML += '<div style="display:flex;justify-content:flex-end;margin-bottom:16px;"><div style="background:var(--orange);border-radius:var(--rsm);padding:11px 14px;font-size:14px;max-width:82%;color:#fff;">'+msg+'</div></div>';
  input.value = '';
  chat.scrollTop = chat.scrollHeight;
  setTimeout(function(){
    chat.innerHTML += '<div style="display:flex;gap:10px;margin-bottom:16px;"><div style="width:32px;height:32px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0;color:#fff;">J</div><div style="background:var(--panel2);border-radius:var(--rsm);padding:11px 14px;font-size:14px;max-width:82%;">Got it — looking into that for you. A member of the HAF team will follow up if needed.</div></div>';
    chat.scrollTop = chat.scrollHeight;
  }, 800);
}