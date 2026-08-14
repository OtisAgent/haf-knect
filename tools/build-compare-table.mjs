/* Builds the public "compare the plans" table straight out of the ONE shared
 * feature list (admin/account-fees-v1.js) and injects it into the storefront
 * pages between the COMPARE:START / COMPARE:END markers.
 *
 * Why generated rather than typed: every other surface already reads that list,
 * so a hand-written table is the one place a stale claim could survive. Run
 * this after any change to the list and the public table cannot drift.
 *
 *   node tools/build-compare-table.mjs            # writes the pages
 *   node tools/build-compare-table.mjs --check    # fails if a page is stale
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const A = require(path.join(ROOT, 'admin/account-fees-v1.js'));
/* The fee side lives in the pricing framework, not the feature list, so the
 * "what you pay HAF" section is read from there rather than typed. */
const M = require(path.join(ROOT, 'admin/pricing-matrix-v3.js'));

const TICK = '<svg class="cmp-y" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
const CROSS = '<svg class="cmp-n" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const money = (n) => n === 0 ? 'Free' : '£' + Number(n).toLocaleString('en-GB');

/* The two ladders we can honestly publish. Freight Forward tiers carry no
 * price in Brent's brief (status UNSET) so they are deliberately NOT given a
 * column — a freight forwarder is a ROLE on a HAF account, and the page says
 * so. Inventing a figure to fill a cell is how a made-up price reaches a
 * customer. */
const LADDERS = [
  {
    id: 'driver',
    tab: 'Owner driver &amp; business',
    lead: 'Same account whether you drive your own van or book couriers for your business. The plan decides how much of the network you can use.',
    side: 'DRIVER',
    codes: ['PLNA_LITE', 'PLNA_PLUS', 'PLNA_PRO']
  },
  {
    id: 'fleet',
    tab: 'Courier company',
    lead: 'One company account for the whole fleet. The plan decides how many drivers you can carry &mdash; you are never charged per driver.',
    side: 'FLEET',
    codes: ['FLEET_LITE', 'FLEET_PLUS', 'FLEET_PRO']
  },
  /* Freight forwarding is section 8 of the brief, so it gets its own tab and
   * its own sections. It carries NO price: freight is free at launch and no
   * paid freight plan has been set — the £500/1% and £1,000/3% tiers came off
   * the terms page on 14 Aug. The cost section says exactly that rather than
   * showing an invented figure or an empty cell. */
  {
    id: 'freight',
    tab: 'Freight forwarding',
    lead: 'For forwarders and load posters moving their clients&rsquo; freight. Freight is free to join at launch &mdash; the columns show the plan ladder the tools sit on.',
    side: 'FREIGHT',
    unpriced: true,
    codes: ['FREIGHT_LITE', 'FREIGHT_PLUS', 'FREIGHT_PRO']
  }
];

const LEVEL_LABEL = { LITE: 'HAF KNECT Free', PLUS: 'HAF KNECT Plus', PRO: 'HAF KNECT Pro' };

function costRows(ladder) {
  const t = ladder.codes.map((c) => A.config.accountTypes[c]);
  const rows = [];

  /* An unpriced ladder gets the truth in place of a price: free to join today,
   * and nothing quoted for a plan that has not been set. */
  if (ladder.unpriced) {
    rows.push({
      label: 'Monthly price',
      cells: ['Free', 'Not published yet', 'Not published yet'],
      strong: true,
      note: 'Freight is free at launch. If a paid freight plan is added, its price and terms are published before anyone is charged.'
    });
    rows.push({
      label: 'Posting your own work onto the network',
      cells: t.map((x) => A.postingLimitLabel(x.level))
    });
    return rows;
  }

  rows.push({
    label: 'Monthly price',
    cells: t.map((x) => money(x.monthlyGbp)),
    strong: true
  });

  if (t.some((x) => x.annualGbp)) {
    rows.push({
      label: 'Pay for a year',
      cells: t.map((x) => x.annualGbp ? money(x.annualGbp) + ' <span class="cmp-sub">two months free</span>' : '&mdash;')
    });
  }

  rows.push({
    label: 'Fee when an invoice is raised',
    cells: t.map((x) => x.paymentRunFeeGbp === 0 ? 'None' : '£' + x.paymentRunFeeGbp.toFixed(2)),
    note: 'Charged once per payment run, never per job.'
  });

  if (ladder.side === 'FLEET') {
    rows.push({
      label: 'Drivers on the account',
      cells: t.map((x) => x.maxDrivers === null ? 'Unlimited' : 'Up to ' + x.maxDrivers),
      strong: true,
      note: 'Move up a band as you grow — a fleet is never charged per driver.'
    });
  }

  rows.push({
    label: 'Posting your own work onto the network',
    cells: t.map((x) => A.postingLimitLabel(x.level))
  });

  return rows;
}

/* Brent asked for the fee section by name ("% uplift"). It is read from the
 * pricing framework's accountLevels, which is keyed by plan level, so it can
 * never drift from what the quote engine actually applies.
 *
 * The DRIVER REWARD rate deliberately gets no row: config.driverReward.enabled
 * is false — Brent paused it and HAF funds the floor instead. Selling a paused
 * benefit is a promise we are not currently keeping, so it stays off the page
 * until he switches it back on. */
function feeRows(ladder) {
  const t = ladder.codes.map((c) => A.config.accountTypes[c]);
  const lv = M.config.accountLevels;
  return [
    {
      label: 'Points off the HAF network fee',
      cells: t.map((x) => {
        const pts = lv[x.level].feeReductionPts;
        return pts === 0 ? 'Standard fee' : '&minus;' + pts + ' points';
      }),
      strong: true,
      note: 'The network fee is HAF&rsquo;s share of the customer price. A paid plan takes points off it — it never comes out of what the driver is paid.'
    }
  ];
}

/* Feature rows come straight from the list: a feature is "included" at a level
 * exactly when the list says it unlocks at or below that level. */
function featureSections(ladder) {
  const levels = ['LITE', 'PLUS', 'PRO'];
  const perLevel = levels.map((l) => A.featuresForSideLevel(ladder.side, l));
  const top = perLevel[2];

  const groups = [];
  A.groupOrder.forEach((g) => {
    const inGroup = top.filter((f) => f.group === g);
    if (!inGroup.length) return;
    const label = A.groupLabels[g];
    let bucket = groups.find((x) => x.label === label);
    if (!bucket) groups.push(bucket = { label, rows: [] });

    inGroup.forEach((f) => {
      const cells = levels.map((l, i) => {
        const match = perLevel[i].find((x) => x.text === f.text);
        return match && match.included;
      });
      bucket.rows.push({ text: f.text, cells, comingSoon: !!f.comingSoon });
    });
  });
  return groups;
}

function renderLadder(ladder, first) {
  const t = ladder.codes.map((c) => A.config.accountTypes[c]);
  const heads = t.map((x) => LEVEL_LABEL[x.level]);

  let h = `<div class="cmp-panel${first ? ' on' : ''}" data-cmp-panel="${ladder.id}">`;
  h += `<p class="cmp-lead">${ladder.lead}</p>`;
  h += '<div class="cmp-scroll"><table class="cmp-table"><thead><tr>';
  h += '<th scope="col" class="cmp-featcol">What you get</th>';
  heads.forEach((name, i) => {
    h += `<th scope="col"${i === 2 ? ' class="cmp-pro"' : ''}>${esc(name)}</th>`;
  });
  h += '</tr></thead>';

  // ---- what it costs -------------------------------------------------------
  h += '<tbody><tr class="cmp-group"><th colspan="4" scope="colgroup">What it costs</th></tr>';
  costRows(ladder).forEach((r) => {
    const same = r.cells.every((c) => c === r.cells[0]);
    h += `<tr class="cmp-row${same ? ' cmp-same' : ''}"><th scope="row">${r.label}` +
      (r.note ? `<span class="cmp-sub">${r.note}</span>` : '') + '</th>';
    r.cells.forEach((c, i) => {
      h += `<td${i === 2 ? ' class="cmp-pro"' : ''}${r.strong ? ' data-strong="1"' : ''}>` +
        `<span class="cmp-mob">${esc(LEVEL_LABEL[t[i].level])}</span>${c}</td>`;
    });
    h += '</tr>';
  });
  h += '</tbody>';

  // ---- what HAF takes ------------------------------------------------------
  h += '<tbody><tr class="cmp-group"><th colspan="4" scope="colgroup">What HAF takes on a job</th></tr>';
  feeRows(ladder).forEach((r) => {
    const same = r.cells.every((c) => c === r.cells[0]);
    h += `<tr class="cmp-row${same ? ' cmp-same' : ''}"><th scope="row">${r.label}` +
      (r.note ? `<span class="cmp-sub">${r.note}</span>` : '') + '</th>';
    r.cells.forEach((c, i) => {
      h += `<td${i === 2 ? ' class="cmp-pro"' : ''}${r.strong ? ' data-strong="1"' : ''}>` +
        `<span class="cmp-mob">${esc(LEVEL_LABEL[t[i].level])}</span>${c}</td>`;
    });
    h += '</tr>';
  });
  h += '</tbody>';

  // ---- the feature sections ------------------------------------------------
  featureSections(ladder).forEach((sec) => {
    h += `<tbody><tr class="cmp-group"><th colspan="4" scope="colgroup">${esc(sec.label)}</th></tr>`;
    sec.rows.forEach((r) => {
      const same = r.cells.every((c) => c === r.cells[0]);
      h += `<tr class="cmp-row${same ? ' cmp-same' : ''}"><th scope="row">${esc(r.text)}` +
        (r.comingSoon ? '<span class="cmp-soon">Coming soon</span>' : '') + '</th>';
      r.cells.forEach((c, i) => {
        h += `<td${i === 2 ? ' class="cmp-pro"' : ''}>` +
          `<span class="cmp-mob">${esc(LEVEL_LABEL[t[i].level])}</span>` +
          `${c ? TICK : CROSS}<span class="cmp-sr">${c ? 'Included' : 'Not on this plan'}</span></td>`;
      });
      h += '</tr>';
    });
    h += '</tbody>';
  });

  h += '</table></div></div>';
  return h;
}

const CSS = `
.cmp-wrap{margin:34px auto 0;max-width:1060px}
.cmp-head{text-align:center;max-width:620px;margin:0 auto 20px}
.cmp-head h2{margin:10px 0 8px}
.cmp-head p{color:var(--muted);font-size:14.5px;line-height:1.6}
.cmp-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;margin:0 0 18px}
.cmp-tabs{display:inline-flex;background:rgba(0,0,0,.05);border-radius:999px;padding:4px;gap:4px}
.cmp-tabs button{border:0;background:transparent;font:inherit;font-size:13.5px;font-weight:600;color:var(--muted);padding:8px 16px;border-radius:999px;cursor:pointer}
.cmp-tabs button.on{background:#fff;color:var(--ink,#111);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.cmp-only{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;color:var(--muted);cursor:pointer;user-select:none}
.cmp-only input{width:16px;height:16px;accent-color:var(--brand-orange,#f60);cursor:pointer}
.cmp-panel{display:none}
.cmp-panel.on{display:block}
.cmp-lead{color:var(--muted);font-size:14px;line-height:1.6;text-align:center;max-width:640px;margin:0 auto 18px}
.cmp-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.cmp-table{width:100%;border-collapse:collapse;font-size:14px;min-width:640px}
.cmp-table th,.cmp-table td{text-align:left;padding:11px 14px;border-bottom:1px solid rgba(0,0,0,.08);vertical-align:top}
.cmp-table thead th{position:sticky;top:0;background:#fff;font-size:13px;font-weight:800;letter-spacing:.01em;border-bottom:2px solid rgba(0,0,0,.14);z-index:2}
.cmp-table thead th.cmp-pro{color:var(--brand-orange,#f60)}
.cmp-featcol{width:46%}
.cmp-table td{text-align:center;width:18%}
.cmp-table tbody th{font-weight:500;line-height:1.45}
.cmp-group th{background:rgba(0,0,0,.035);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);padding:10px 14px}
.cmp-row td[data-strong]{font-weight:800;font-size:15px}
.cmp-sub{display:block;font-size:11.5px;color:var(--muted);font-weight:500;line-height:1.4;margin-top:2px}
.cmp-soon{display:inline-block;margin-left:7px;padding:1px 7px;border:1px solid var(--brand-orange,#f60);border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--brand-orange,#f60);white-space:nowrap}
.cmp-y,.cmp-n{width:18px;height:18px;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.cmp-y{stroke:#1a9d4b}
.cmp-n{stroke:rgba(0,0,0,.24)}
.cmp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cmp-mob{display:none}
.cmp-hide{display:none}
.cmp-foot{color:var(--muted);font-size:12.5px;line-height:1.6;text-align:center;margin:16px auto 0;max-width:640px}
@media(max-width:720px){
  .cmp-table,.cmp-table tbody,.cmp-table tr,.cmp-table th,.cmp-table td{display:block;width:auto}
  .cmp-table{min-width:0}
  .cmp-table thead{display:none}
  .cmp-scroll{overflow-x:visible}
  .cmp-table tbody th{font-weight:700;font-size:14.5px;padding:14px 0 6px;border-bottom:0}
  .cmp-table td{display:flex;align-items:center;justify-content:space-between;gap:14px;text-align:right;padding:7px 0;border-bottom:1px solid rgba(0,0,0,.07)}
  .cmp-mob{display:block;font-size:12.5px;color:var(--muted);font-weight:600;text-align:left}
  .cmp-group th{padding:14px;margin-top:8px;border-radius:8px}
  .cmp-featcol{width:auto}
  /* the block-layout rule above out-specifies the plain .cmp-hide, so the
     "only what differs" toggle silently did nothing on a phone until this
     rule was added. Keep it inside the query, next to what breaks it. */
  .cmp-table tr.cmp-hide{display:none}
}
`.trim();

const JS = `
(function(){
  var wrap=document.getElementById('cmp');
  if(!wrap) return;
  wrap.querySelectorAll('[data-cmp-tab]').forEach(function(b){
    b.addEventListener('click',function(){
      var id=b.getAttribute('data-cmp-tab');
      wrap.querySelectorAll('[data-cmp-tab]').forEach(function(x){x.classList.toggle('on',x===b);});
      wrap.querySelectorAll('[data-cmp-panel]').forEach(function(p){
        p.classList.toggle('on',p.getAttribute('data-cmp-panel')===id);
      });
    });
  });
  var only=wrap.querySelector('#cmp-only');
  function apply(){
    wrap.querySelectorAll('tr.cmp-same').forEach(function(r){
      r.classList.toggle('cmp-hide',only.checked);
    });
  }
  only.addEventListener('change',apply);
  apply();
})();
`.trim();

function buildBlock() {
  let h = '<!-- COMPARE:START generated by tools/build-compare-table.mjs — do not hand-edit -->\n';
  h += '<style>' + CSS + '</style>\n';
  h += '<div class="cmp-wrap" id="cmp">';
  h += '<div class="cmp-head"><span class="eyebrow">Compare</span>';
  h += '<h2>What each plan actually gives you.</h2>';
  h += '<p>Every line below is the same list the app itself works from, so what you read here is what you get.</p></div>';
  h += '<div class="cmp-controls"><div class="cmp-tabs">';
  LADDERS.forEach((l, i) => {
    h += `<button type="button" data-cmp-tab="${l.id}"${i === 0 ? ' class="on"' : ''}>${l.tab}</button>`;
  });
  h += '</div><label class="cmp-only" for="cmp-only"><input type="checkbox" id="cmp-only" checked> Only show what differs</label></div>';
  LADDERS.forEach((l, i) => { h += renderLadder(l, i === 0); });
  h += '<p class="cmp-foot">Prices exclude VAT. Job matching is by suitability and availability &mdash; it is never decided by what an account pays. Every account is Clever Checked before it can drive.</p>';
  h += '</div>\n';
  h += '<script>' + JS + '<\/script>\n';
  h += '<!-- COMPARE:END -->';
  return h;
}

const START = '<!-- COMPARE:START';
const END = '<!-- COMPARE:END -->';

function inject(file, block) {
  const p = path.join(ROOT, '..', file);
  let html = fs.readFileSync(p, 'utf8');
  const i = html.indexOf(START);
  if (i === -1) throw new Error('no COMPARE:START marker in ' + file);
  const j = html.indexOf(END, i);
  if (j === -1) throw new Error('no COMPARE:END marker in ' + file);
  const current = html.slice(i, j + END.length);
  if (current === block) return { file, changed: false };
  if (process.argv.includes('--check')) return { file, changed: true, stale: true };
  fs.writeFileSync(p, html.slice(0, i) + block + html.slice(j + END.length), 'utf8');
  return { file, changed: true };
}

const TARGETS = ['np-preview/network-pricing.html', 'np-preview/plna.html'];
const block = buildBlock();
let stale = 0;
TARGETS.forEach((f) => {
  const r = inject(f, block);
  if (r.stale) { stale++; console.log('STALE  ' + f); }
  else console.log((r.changed ? 'wrote  ' : 'ok     ') + f);
});
if (stale) { console.error('\n' + stale + ' page(s) out of date — run without --check'); process.exit(1); }
