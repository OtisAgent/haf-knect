/* ── THE PASTE BOX ITSELF ───────────────────────────────────────────────
   Two mount points, one panel: the job tile on the front page and step one of
   the order flow, so a signed-in member posting a job gets the same box as a
   stranger pricing one. Both are drawn from this single template — a second
   copy of the wording is a second place for it to go stale. */
const pjFound = {};
const PJ_SLOTS = ['a', 'b'];

function pjHTML(s) {
  return '<button class="pj-open" type="button" onclick="pjOpen(\'' + s + '\')">'
    + '<svg viewBox="0 0 24 24"><rect x="8" y="2.5" width="8" height="4" rx="1.2"/>'
    + '<path d="M9 4.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-13a2 2 0 0 0-2-2h-3"/>'
    + '<path d="M8.5 12h7M8.5 16h4.5"/></svg>'
    + '<span class="pj-open-w"><span class="pj-open-t">Got the job in an email? Paste it in</span>'
    + '<span class="pj-open-s">We read it and fill this form in for you &#8212; no retyping</span></span>'
    + '<span class="pj-open-x">&#8594;</span></button>'
    + '<div class="pj-body" id="pj-body-' + s + '" style="display:none">'
    + '<div class="pj-h">Paste the job in</div>'
    + '<p class="pj-p">The whole email, a WhatsApp message, or a note to yourself &#8212; however it was sent to you. '
    + 'We pick out the addresses, the contacts, what is being moved and when, and <strong>show you what we found</strong> before anything is filled in.</p>'
    + '<textarea class="ta pj-ta" id="pj-txt-' + s + '" placeholder="Paste here. Something like:&#10;&#10;'
    + 'Collection: Unit 4 Callum Park, Sheffield S9 1AA&#10;Contact: John Wright 07700 900123&#10;'
    + 'Delivery: 22 Trafford Way, Manchester M1 1AA&#10;Contact: Sarah Ellis 07700 900456&#10;'
    + '3 pallets of boxed clothing, 300kg, tail lift needed&#10;Collect Friday from 9am, on site before 4pm"></textarea>'
    + '<div class="pj-err" id="pj-err-' + s + '" style="display:none"></div>'
    + '<div class="fnav" style="justify-content:flex-start">'
    + '<button class="btn btn-or btn-sm" type="button" onclick="pjRead(\'' + s + '\')">Read it &#8594;</button>'
    + '<button class="btn btn-gh btn-sm" type="button" onclick="pjClose(\'' + s + '\')">Cancel</button></div>'
    + '<div class="pj-found" id="pj-found-' + s + '" style="display:none">'
    + '<div class="pj-h pj-h2">Here is what we found</div>'
    + '<div class="pj-list" id="pj-list-' + s + '"></div>'
    + '<div class="pj-miss" id="pj-miss-' + s + '" style="display:none"></div>'
    + '<div class="fnav" style="justify-content:flex-start">'
    + '<button class="btn btn-or btn-sm" type="button" onclick="pjApply(\'' + s + '\')">Use these details &#8594;</button>'
    + '<button class="btn btn-gh btn-sm" type="button" onclick="pjBack(\'' + s + '\')">&#8592; Edit what I pasted</button>'
    + '</div></div></div>';
}
function pjMount() {
  PJ_SLOTS.forEach(s => {
    const el = document.querySelector('[data-pj="' + s + '"]');
    if (el) el.innerHTML = pjHTML(s);
  });
}
pjMount();

const _pjE = id => document.getElementById(id);
function pjOpen(s) {
  const b = _pjE('pj-body-' + s);
  if (!b) return;
  b.style.display = 'block';
  const t = _pjE('pj-txt-' + s);
  if (t) t.focus();
}
function pjClose(s) {
  const b = _pjE('pj-body-' + s);
  if (b) b.style.display = 'none';
}
function pjBack(s) {
  const f = _pjE('pj-found-' + s);
  if (f) f.style.display = 'none';
}

const PJ_UNAME = k => (UNIT.find(u => u.k === k) || {}).n || k;
function pjDateWords(iso) {
  if (!iso) return '';
  const p = iso.split('-');
  const d = new Date(+p[0], +p[1] - 1, +p[2]);
  const dy = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
  const mo = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()];
  return dy + ' ' + (+p[2]) + ' ' + mo;
}

/* Read it, then say what was read. Nothing is written into the form at this
   point — the customer sees the list first and presses to accept it. */
function pjRead(s) {
  const txt = (_pjE('pj-txt-' + s) || {}).value || '';
  const er = _pjE('pj-err-' + s);
  const show = m => { if (er) { er.textContent = m; er.style.display = m ? 'block' : 'none'; } };
  if (txt.trim().length < 12) { show('Paste the job in first — the email, the message, or your own note of it.'); return; }
  let r;
  try { r = pjParse(txt, { WT_BAND: WT_BAND, SZ_BAND: SZ_BAND }); }
  catch (e) { show('We could not read that. You can still fill the form in below.'); return; }
  if (!r.from && !r.to) {
    show('We could not find a collection or a delivery place in that. Paste a bit more of the email, or just type the two postcodes in below.');
    return;
  }
  show('');
  pjFound[s] = r;
  const row = (l, v) => '<div class="pj-row"><span class="pj-row-l">' + l + '</span><span class="pj-row-v">' + pjEsc(v) + '</span></div>';
  let h = '';
  if (r.from) h += row('Collecting from', r.cAddr || r.from);
  if (r.cName || r.cPhone) h += row('At collection, ask for', [r.cName, r.cPhone].filter(Boolean).join(' &#183; '));
  if (r.to) h += row('Delivering to', r.dAddr || r.to);
  if (r.dName || r.dPhone) h += row('At delivery, ask for', [r.dName, r.dPhone].filter(Boolean).join(' &#183; '));
  if (r.goods) h += row('What is moving', r.goods);
  if (r.qty) h += row('How much there is', r.qty + ' ' + PJ_UNAME(r.unit).toLowerCase() + (r.szName ? ' &#8212; ' + r.szName.toLowerCase() : ''));
  if (r.kg) h += row('How heavy', r.kg + ' kg' + (r.wtName ? ' &#8212; ' + r.wtName.toLowerCase() : ''));
  if (r.dims) h += row('Largest item', r.dims.l + ' &#215; ' + r.dims.w + ' &#215; ' + r.dims.h + ' ' + r.dims.unit);
  if (r.reqs && r.reqs.length) h += row('Loading and handling', r.reqs.map(REQ_N).join(' &#183; '));
  if (r.cdate || r.ctime) h += row('Collection', [pjDateWords(r.cdate), r.ctime ? 'from ' + r.ctime : ''].filter(Boolean).join(', '));
  if (r.dreq) h += row('Must be delivered', r.dreq);
  if (r.notes && r.notes.length) h += row('For the driver', r.notes.join(' &#183; '));
  if (r.reqName || r.reqEmail) h += row('You', [r.reqName, r.reqEmail].filter(Boolean).join(' &#183; '));
  const list = _pjE('pj-list-' + s);
  if (list) list.innerHTML = h;
  const miss = _pjE('pj-miss-' + s);
  if (miss) {
    if (r.missing.length) {
      miss.innerHTML = '<strong>Not in what you pasted:</strong> ' + pjEsc(r.missing.join(', '))
        + '. We have left those blank rather than guessing &#8212; the form will ask you for them.';
      miss.style.display = 'block';
    } else miss.style.display = 'none';
  }
  const f = _pjE('pj-found-' + s);
  if (f) { f.style.display = 'block'; setTimeout(() => f.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50); }
}
function pjEsc(v) {
  return String(v == null ? '' : v).replace(/&(?![a-z#0-9]+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── FILL IT IN ────────────────────────────────────────────────────────
   The front tile first, so the guide price is already worked out, then into the
   order flow and as far through it as the pasted text actually gets us. Where a
   detail is missing the flow stops on its own step with its own words, which is
   exactly where the customer needs to be. */
function pjApply(s) {
  const r = pjFound[s];
  if (!r) return;
  const set = (id, v) => { const e = _pjE(id); if (e && v) e.value = v; };
  const click = sel => { const e = document.querySelector(sel); if (e) e.click(); return !!e; };

  set('pc-from', r.from); set('pc-to', r.to);
  if (r.wtKey) click('#wt-pills .lp-tile[data-wt="' + r.wtKey + '"]');
  if (r.szKey) click('#sz-pills .lp-tile[data-sz="' + r.szKey + '"]');
  try { if (typeof onPcInput === 'function') onPcInput(); } catch (e) { }

  pjClose('a'); pjClose('b');
  startConsignment();

  /* Step 1 — where. startConsignment carries the two places over; this covers
     the member who opened the flow straight from Post a Job. */
  set('fq-from', r.from); set('fq-to', r.to);
  /* Step 2 — what. */
  if (r.kg) set('fq-exact', String(r.kg));
  if (r.qty) set('fq-qty', String(r.qty));
  if (r.unit) set('fq-unit', r.unit);
  if (r.goods) set('fq-goods', r.goods);
  if (r.dims) {
    set('fq-dl', r.dims.l); set('fq-dw', r.dims.w); set('fq-dh', r.dims.h);
    set('fq-dunit', r.dims.unit);
  }
  (r.reqs || []).forEach(k => click('#fq-reqs .tgl[data-req="' + k + '"]'));
  if (r.notes && r.notes.length) set('fq-notes', r.notes.join('. '));
  /* Step 4 — when. Only where the text says so: a date makes it a pre-book,
     "asap" makes it urgent, today makes it same-day. Nothing said, nothing
     chosen, and the customer answers it themselves. */
  const urg = /\basap|urgent|straight away|immediately\b/i.test((_pjE('pj-txt-' + s) || {}).value || '') ? 'urg'
    : (r.cdate ? (r.cdate === pjISO(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()) ? 'sday' : 'timed') : '');
  if (urg) click('#fq-4 .oopt[onclick*="\'urg\',\'' + urg + '\'"]');
  set('fq-cdate', r.cdate); set('fq-ctime', r.ctime); set('fq-dreq', r.dreq);
  /* Step 5 — the door. */
  set('fq-caddr', r.cAddr); set('fq-cname', r.cName); set('fq-cphone', r.cPhone);
  set('fq-daddr', r.dAddr); set('fq-dname', r.dName); set('fq-dphone', r.dPhone);
  /* Step 7 — who is asking. */
  set('fq-name', r.reqName); set('fq-email', r.reqEmail);
  try { if (typeof fqLoadChanged === 'function') fqLoadChanged(); } catch (e) { }

  /* Walk it forward. Each stage is the page's own check, so a stage that is not
     satisfied refuses in its own words and the walk stops there. */
  const on = n => { const e = _pjE('fq-' + n); return !!e && e.classList.contains('on'); };
  try {
    for (const n of [2, 3, 4, 5]) { fqNext(n); if (!on(n)) break; }
    if (on(5) && typeof fqShowPriceV === 'function') fqShowPriceV();
  } catch (e) { }
  pjSaid(r);
}

/* One line at the top of the flow saying where these answers came from, so a
   filled-in form is never mistaken for one the customer typed themselves. */
function pjSaid(r) {
  const host = _pjE('if-fast');
  if (!host) return;
  let b = _pjE('pj-said');
  if (!b) {
    b = document.createElement('div');
    b.id = 'pj-said';
    b.className = 'cf-offer';
    b.style.marginBottom = '.8rem';
    host.insertBefore(b, host.firstChild);
  }
  b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg><span>'
    + 'Filled in from what you pasted. Please check it over&#8212; '
    + (r.missing && r.missing.length
      ? 'we could not find ' + pjEsc(r.missing.join(', ')) + ', so the form will ask you.'
      : 'everything the driver needs was in there.')
    + '</span>';
}
