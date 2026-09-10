/* ══ PASTE THE JOB IN — READ AN EMAIL INTO THE ORDER ════════════════════
   Brent, 10 Sep 2026: nearly every job arrives already written down, in an
   email or a message. Retyping it is the whole friction. So the job tile opens
   with a paste box: the text goes in, we read it, we SHOW the customer what we
   read, and only then — on their press — does it fill the form.

   The one rule this thing lives by: it never invents a detail. Every value in
   the review list came out of the pasted text. Anything the text did not say is
   named as missing in the same list, so a blank is a blank the customer can see
   rather than a guess the driver finds out about at the door. */

const PJ_PC_RE = /\b([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})\b/gi;
const PJ_MOB_RE = /(?:\+44\s?7|\b07)[0-9]{2,3}[\s.\-]?[0-9]{3}[\s.\-]?[0-9]{3,4}\b/;
const PJ_LAND_RE = /\b0(?:1|2)[0-9]{2,3}[\s.\-]?[0-9]{3}[\s.\-]?[0-9]{3,4}\b/;
const PJ_EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

/* The words that say which end of the job a line is talking about. A line that
   names both ends settles nothing, so the section it is already in is kept. */
const PJ_CUE_C = /(collect|collection|pick[\s\-]?up|picking up|origin|load(?:ing)?\s+(?:from|at)|from site|depot|sender|shipper|consignor)/i;
const PJ_CUE_D = /(deliver|delivery|drop[\s\-]?off|dropping|destination|to site|consignee|receiver|recipient|unload)/i;

const PJ_UNIT_W = [
  { re: /pallets?/i, k: 'pallets' },
  { re: /roll\s?cages?|cages?/i, k: 'cages' },
  { re: /crates?/i, k: 'crates' },
  { re: /cartons?|boxes|box\b/i, k: 'boxes' },
  { re: /bags?|sacks?/i, k: 'bags' },
  { re: /furniture/i, k: 'furn' },
  { re: /items?|pieces?|pcs?\b|drums?|totes?/i, k: 'items' }
];

/* Brent's eleven handling toggles, in the words a real email uses for them.
   Order matters: "non-stackable" contains "stackable", so it is tested first. */
const PJ_REQ_W = [
  { re: /tail[\s\-]?lift/i, k: 'tail' },
  { re: /fragile|handle with care|delicate|glassware/i, k: 'fragile' },
  { re: /non[\s\-]?stack|not stackable|do not stack|no stacking|cannot be stacked|can'?t be stacked/i, k: 'nostack' },
  { re: /stackable|can be stacked|stack them/i, k: 'stack' },
  { re: /palletis|palletiz|on pallets|shrink[\s\-]?wrapped/i, k: 'pallet' },
  { re: /loose[\s\-]?load|hand[\s\-]?ball|loose in the van/i, k: 'loose' },
  { re: /two[\s\-]?(?:person|man|people)|2[\s\-]?(?:person|man)|second pair of hands/i, k: 'two' },
  { re: /(?:help|labour|hand|assistance)[^.\n]{0,18}load(?:ing)?\b/i, k: 'helpc' },
  { re: /(?:help|labour|hand|assistance)[^.\n]{0,18}unload(?:ing)?\b/i, k: 'helpd' }
];
const PJ_OPP = { nostack: 'stack', stack: 'nostack', pallet: 'loose', loose: 'pallet' };
const PJ_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function pjISO(y, m, d) {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/* A date only where the text really gives one. The numeric form insists on a
   slash or a dash, never a dot, because "1.2m x 1m x 1.5m" is a pallet, not a
   date, and reading it as one is exactly the kind of invention this is here to
   avoid. */
function pjDate(t, now) {
  now = now || new Date();
  let m = t.match(/\b([0-9]{1,2})[\/\-]([0-9]{1,2})(?:[\/\-]([0-9]{2,4}))?\b/);
  if (m) {
    const d = +m[1], mo = +m[2];
    let y = m[3] ? +m[3] : now.getFullYear();
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return pjISO(y, mo, d);
  }
  m = t.match(/\b([0-9]{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+([0-9]{4}))?/i);
  if (m) return pjISO(m[3] ? +m[3] : now.getFullYear(), PJ_MON[m[2].toLowerCase()], +m[1]);
  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+([0-9]{1,2})(?:st|nd|rd|th)?(?:\s+([0-9]{4}))?/i);
  if (m) return pjISO(m[3] ? +m[3] : now.getFullYear(), PJ_MON[m[1].toLowerCase()], +m[2]);
  if (/\btomorrow\b/i.test(t)) {
    const d = new Date(now.getTime() + 864e5);
    return pjISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  if (/\btoday\b/i.test(t)) return pjISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
  m = t.match(/\b(mon|tues?|wed|thur?s?|fri|sat|sun)(?:day|nesday|rsday|urday)?\b/i);
  if (m) {
    const names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const target = names.indexOf(m[1].slice(0, 3).toLowerCase());
    if (target < 0) return '';
    let add = (target - now.getDay() + 7) % 7;
    if (add === 0) add = 7;
    const d = new Date(now.getTime() + add * 864e5);
    return pjISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return '';
}

function pjTime(s) {
  let m = s.match(/\b([0-9]{1,2})[:.]([0-9]{2})\s*(am|pm)?/i);
  if (m) {
    let h = +m[1];
    const p = (m[3] || '').toLowerCase();
    if (p === 'pm' && h < 12) h += 12;
    if (p === 'am' && h === 12) h = 0;
    if (h < 24 && +m[2] < 60) return String(h).padStart(2, '0') + ':' + m[2];
  }
  m = s.match(/\b([0-9]{1,2})\s*(am|pm)\b/i);
  if (m) {
    let h = +m[1];
    const p = m[2].toLowerCase();
    if (p === 'pm' && h < 12) h += 12;
    if (p === 'am' && h === 12) h = 0;
    return String(h).padStart(2, '0') + ':00';
  }
  return '';
}

/* Strip a leading label off a line — "Collection address:" — but only when the
   words before the colon really are a label. "John: ring the buzzer" keeps its
   whole sentence. */
function pjDelabel(l) {
  const m = l.match(/^([^:]{1,44}):\s*(.+)$/);
  if (!m) return l.trim();
  if (/collect|delivery|deliver|address|pick|drop|from|to|contact|site|depot|goods|load|when|date|time|ref/i.test(m[1])) return m[2].trim();
  return l.trim();
}

function pjPhone(s) {
  const m = s.match(PJ_MOB_RE) || s.match(PJ_LAND_RE);
  return m ? m[0].replace(/[.\-]/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

/* Which end of the job is each line about? Sticky: an email writes "Collection"
   once and then four lines that all belong to it. */
function pjSides(lines) {
  const out = [];
  let cur = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const hasC = PJ_CUE_C.test(l), hasD = PJ_CUE_D.test(l);
    if (l && hasC && !hasD) cur = 'c';
    else if (l && hasD && !hasC) cur = 'd';
    else if (l && /^from\s*:/i.test(l) && l.indexOf('@') < 0) cur = 'c';
    else if (l && /^to\s*:/i.test(l) && l.indexOf('@') < 0) cur = 'd';
    out[i] = cur;
  }
  return out;
}

/* An address has to be an address. A bare postcode is not one — a driver cannot
   deliver to "S9 1AA" — and the house-number check says yes to a postcode
   because a postcode contains digits, so this counts real words instead. */
const PJ_STREETY = /\b(road|rd|street|st|lane|ln|avenue|ave|drive|dr|close|way|court|estate|industrial|unit|yard|works|house|farm|place|terrace|square|hill|gate|wharf|dock|depot|trading|business|retail|centre|center|mill|bank|green|grove|crescent|walk|row|mews|trade|park|building|floor|suite|warehouse|shop|store|garage|barn|lodge|villas?|cottages?)\b/i;
const PJ_LABEL_ONLY = /^[a-z&'\s]{2,30}:?\s*$/i;
/* The words a sentence uses to hand over to a place. Everything after the last
   one of them is the address; everything before it is the sentence. */
const PJ_PREP = /\b(?:collection|collect(?:ed)?\s*(?:from|at)?|pick(?:ed)?[\s-]?up\s*(?:from|at)?|deliver(?:y|ed)?\s*(?:to|at)?|drop(?:ped)?\s*(?:off)?\s*(?:at|to)?|from|to|at|address)\b\s*:?\s*/gi;

/* An address has to be an address. A bare postcode is not one — a driver cannot
   deliver to "S9 1AA" — and the house-number check says yes to a postcode
   because a postcode contains digits, so this counts real words instead, and
   then insists on something that could actually be a place. */
function pjAddrOk(addr, pc) {
  const rest = addr.replace(new RegExp(pc.replace(/\s/g, '\\s*'), 'i'), ' ')
    .replace(/[,\s]+/g, ' ').trim();
  const words = rest.split(' ').filter(w => /[a-z]/i.test(w));
  if (words.length < 2) return false;
  return /\b[0-9]+[a-z]?\b/i.test(rest) || PJ_STREETY.test(rest);
}

/* Read backwards from the postcode until the address runs out. Works the same
   whether the email lays it out in a block or writes it into a sentence. */
function pjAddress(lines, sides, hit) {
  let head = lines[hit.line].slice(0, hit.idx);
  /* Nothing but a town in front of the postcode? Then the street is on the
     lines above it — walk back while they still belong to this end of the job. */
  const thin = s => s.replace(/[,\s]+/g, ' ').trim().split(' ').filter(w => /[a-z]/i.test(w)).length < 2;
  if (thin(head)) {
    const parts = [];
    for (let i = hit.line - 1; i >= 0 && i >= hit.line - 4; i--) {
      const ln = lines[i].trim();
      if (!ln) continue;
      if (sides[i] && hit.side && sides[i] !== hit.side) break;
      if (PJ_LABEL_ONLY.test(ln) && ln.indexOf(':') >= 0) continue;
      if (PJ_EMAIL_RE.test(ln) || pjPhone(ln)) continue;
      /* A line that already holds its own postcode belongs to the other place —
         except in prose, where the address simply wrapped onto the next line, so
         whatever follows that postcode is taken and the walk stops there. */
      const pcRe = new RegExp(PJ_PC_RE.source, 'gi');
      let last = null, mm;
      while ((mm = pcRe.exec(ln))) last = mm;
      if (last) {
        const tail = ln.slice(last.index + last[0].length).trim();
        if (!thin(tail)) parts.unshift(tail);
        break;
      }
      parts.unshift(pjDelabel(ln));
    }
    head = parts.concat([head]).map(s => s.replace(/[,\s]+$/, '').trim())
      .filter(Boolean).join(', ');
  }
  /* Cut the sentence off in front of the address. */
  let cut = 0, m;
  const re = new RegExp(PJ_PREP.source, 'gi');
  while ((m = re.exec(head))) cut = m.index + m[0].length;
  if (cut) head = head.slice(cut);
  head = pjDelabel(head).replace(/^[,\s:;\-–—]+|[,\s:;\-–—]+$/g, '');
  const addr = (head ? head + ' ' : '') + hit.pc;
  return pjAddrOk(addr, hit.pc) ? addr.replace(/\s+/g, ' ') : '';
}

/* A name, out of the way an email actually writes one. */
function pjName(lines, sides, side) {
  const clean = raw => {
    let t = raw.replace(PJ_MOB_RE, ' ').replace(PJ_LAND_RE, ' ').replace(PJ_EMAIL_RE, ' ');
    t = t.replace(/\b(?:on|tel|telephone|mob|mobile|phone|no|number|m|t)\b\s*[:.\-]?\s*/gi, ' ');
    t = t.replace(/[|,;()\-–—]+/g, ' ').replace(/\s+/g, ' ').trim();
    const words = t.split(' ').filter(w => /^[A-Z][a-z'’\-]{1,}$/.test(w) || /^[A-Z]{2,}$/.test(w));
    return words.slice(0, 3).join(' ');
  };
  for (let i = 0; i < lines.length; i++) {
    if (side && sides[i] !== side) continue;
    const m = lines[i].match(/(?:contact(?:\s*name)?|ask for|attn|c\/o|speak to|site contact)\s*[:\-]?\s*(.+)$/i);
    if (m) { const n = clean(m[1]); if (n) return n; }
  }
  /* No label, but a phone number with a name sitting in front of it. */
  for (let i = 0; i < lines.length; i++) {
    if (side && sides[i] !== side) continue;
    const ph = pjPhone(lines[i]);
    if (!ph) continue;
    const before = lines[i].slice(0, lines[i].indexOf(ph.split(' ')[0]));
    const n = clean(before);
    if (n) return n;
  }
  return '';
}

function pjSidePhone(lines, sides, side) {
  for (let i = 0; i < lines.length; i++) {
    if (sides[i] !== side) continue;
    const p = pjPhone(lines[i]);
    if (p) return p;
  }
  return '';
}

/* ── THE READER ────────────────────────────────────────────────────────── */
function pjParse(text, bands, now) {
  const WT = bands.WT_BAND, SZ = bands.SZ_BAND;
  const raw = String(text || '').replace(/\r/g, '');
  const lines = raw.split('\n');
  const sides = pjSides(lines);
  const r = { missing: [], notes: [] };

  /* Postcodes, and which end each one belongs to. */
  const hits = [];
  lines.forEach((ln, i) => {
    const re = new RegExp(PJ_PC_RE.source, 'gi');
    let m;
    while ((m = re.exec(ln))) hits.push({ pc: (m[1] + ' ' + m[2]).toUpperCase(), line: i, side: sides[i], idx: m.index });
  });
  const cHit = hits.find(h => h.side === 'c') || hits[0] || null;
  let dHit = hits.find(h => h.side === 'd' && h !== cHit);
  if (!dHit) dHit = hits.filter(h => h !== cHit).pop() || null;
  if (cHit) r.from = cHit.pc; else r.missing.push('the collection postcode');
  if (dHit) r.to = dHit.pc; else r.missing.push('the delivery postcode');

  /* Full addresses, contacts. */
  if (cHit) {
    r.cAddr = pjAddress(lines, sides, cHit);
    if (!r.cAddr) r.missing.push('the full collection address');
  }
  if (dHit) {
    r.dAddr = pjAddress(lines, sides, dHit);
    if (!r.dAddr) r.missing.push('the full delivery address');
  }
  r.cName = pjName(lines, sides, 'c') || (hits.length && !sides.some(s => s) ? pjName(lines, sides, '') : '');
  r.dName = pjName(lines, sides, 'd');
  r.cPhone = pjSidePhone(lines, sides, 'c');
  r.dPhone = pjSidePhone(lines, sides, 'd');
  if (!r.cName) r.missing.push('who the driver asks for at collection');
  if (!r.cPhone) r.missing.push('a phone number at collection');
  if (!r.dName) r.missing.push('who receives it at delivery');
  if (!r.dPhone) r.missing.push('a phone number at delivery');

  /* How much there is, and of what. */
  let qm = raw.match(/\b([0-9]{1,3})\s*(?:x\s*)?(pallets?|roll\s?cages?|cages?|crates?|cartons?|boxes|box|bags?|sacks?|drums?|totes?|items?|pieces?|pcs?|furniture[a-z\s]{0,10})\b/i);
  /* A count the sender labelled but did not name — "How many: 3" off our own
     template. Read as loose items, which is what the review list then shows
     them, so a pallet count written that way is corrected by the customer
     rather than assumed by us. */
  if (!qm) {
    const lq = raw.match(/^[ \t]*how\s+many[^:\n]{0,24}[:\-][ \t]*([0-9]{1,3})[ \t]*$/im);
    if (lq) qm = [lq[0], lq[1], 'items'];
  }
  if (qm) {
    r.qty = +qm[1];
    const w = PJ_UNIT_W.find(u => u.re.test(qm[2]));
    r.unit = w ? w.k : 'items';
    r.qtyWords = qm[0].trim();
  } else r.missing.push('how many items there are');

  /* How heavy. Only ever from a figure the text really gives. */
  let wm = raw.match(/(?:^|[^a-z0-9.])([0-9]{1,4}(?:\.[0-9]+)?)\s*(kgs?|kilos?|kilograms?|tonnes?|tons?|te|t)(?![a-z])/i);
  /* A weight the sender labelled and left the unit off — "Total weight: 300".
     Kilos, because kilos is what the label asked for. */
  if (!wm) {
    const lw = raw.match(/^[ \t]*(?:total\s+weight|gross\s+weight|weight)[^:\n]{0,18}[:\-][ \t]*([0-9]{1,5}(?:\.[0-9]+)?)[ \t]*$/im);
    if (lw) wm = [lw[0], lw[1], 'kg'];
  }
  if (wm) {
    const n = parseFloat(wm[1]);
    const u = wm[2].toLowerCase();
    r.kg = /^(t|te|ton|tons|tonne|tonnes)$/.test(u) ? Math.round(n * 1000) : Math.round(n);
    const b = WT.find(x => r.kg <= x.kg) || WT[WT.length - 1];
    r.wtKey = b.k;
    r.wtName = b.n;
  } else r.missing.push('how heavy it is');

  /* How much room it takes. Worked out from the count, shown as the band it
     lands on with the count that put it there, so the customer can see the
     reasoning and move it. */
  if (r.qty && r.unit) {
    const lvl = (() => {
      if (r.unit === 'pallets' || r.unit === 'crates' || r.unit === 'cages')
        return r.qty <= 1 ? 3 : (r.qty <= 3 ? 4 : 5);
      if (r.unit === 'boxes' || r.unit === 'bags')
        return r.qty <= 1 ? 1 : (r.qty <= 6 ? 2 : 3);
      if (r.unit === 'furn') return r.qty <= 2 ? 2 : 4;
      return r.qty <= 1 ? 1 : (r.qty <= 6 ? 2 : 3);
    })();
    const b = SZ.find(x => x.lvl === lvl) || SZ[1];
    r.szKey = b.k;
    r.szName = b.n;
  }

  /* What the goods are, in the sender's own words. */
  let goods = '';
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:goods|load|consignment|description|items?|what)(?:\s*\([^)\n]{0,40}\))?\s*[:\-]\s*(.+)$/i);
    if (m) { goods = m[1].trim(); break; }
  }
  if (!goods && qm) {
    const ln = lines.find(l => l.indexOf(qm[0]) >= 0);
    if (ln) goods = pjDelabel(ln).replace(/\s+/g, ' ').trim();
  }
  if (goods) r.goods = goods.slice(0, 200);
  else r.missing.push('what the goods are');

  /* Dimensions, if they are written as one. */
  const dm = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*(m|cm|mm|ft)?\s*[x×]\s*([0-9]+(?:\.[0-9]+)?)\s*(m|cm|mm|ft)?\s*[x×]\s*([0-9]+(?:\.[0-9]+)?)\s*(m|cm|mm|ft)?/i);
  if (dm) {
    const u = (dm[6] || dm[4] || dm[2] || 'cm').toLowerCase();
    r.dims = { l: dm[1], w: dm[3], h: dm[5], unit: u === 'mm' ? 'cm' : u };
  }

  /* Loading and handling. */
  r.reqs = [];
  PJ_REQ_W.forEach(w => {
    if (r.reqs.indexOf(w.k) >= 0) return;
    if (PJ_OPP[w.k] && r.reqs.indexOf(PJ_OPP[w.k]) >= 0) return;
    if (w.re.test(raw)) r.reqs.push(w.k);
  });
  /* A forklift belongs to an end of the job. Where the text says which end, it
     is set; where it does not, nothing is ticked and it is passed through as a
     note for the driver rather than guessed onto the wrong site. */
  let forkSaid = false;
  lines.forEach((ln, i) => {
    if (!/fork[\s\-]?lift|fork truck/i.test(ln)) return;
    forkSaid = true;
    /* One line often names both ends, so each clause is read on its own.
       A clause that denies a forklift is not a request for one, and
       "unloading" is a delivery word, never a loading one, even though it
       contains "loading". A clause that settles nothing passes through as a
       note for the driver rather than a guessed site. */
    ln.split(/[,;]|\band\b|\bso\b|\bbut\b/i).forEach(cl => {
      if (!/fork[\s\-]?lift|fork truck/i.test(cl)) return;
      if (/\b(?:no|not|without|none|non)\b/i.test(cl)) return;
      const noUn = cl.replace(/unload(?:ing)?/gi, ' ');
      const fD = /unload|deliver|drop|consignee|receiver/i.test(cl);
      const fC = /collect|pick|load|depot|sender|consignor/i.test(noUn);
      const side = (fC && !fD) ? 'c' : ((fD && !fC) ? 'd' : sides[i]);
      if (side === 'c' && r.reqs.indexOf('forkc') < 0) r.reqs.push('forkc');
      else if (side === 'd' && r.reqs.indexOf('forkd') < 0) r.reqs.push('forkd');
      else if (!side) r.notes.push(ln.trim());
    });
  });
  r.forkSaid = forkSaid;

  /* When. */
  const whenLines = lines.filter(l => /collect|collection|pick|ready|available|deliver|delivery|date|when|asap|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|before|by |no later/i.test(l));
  for (const l of whenLines) {
    const d = pjDate(l, now);
    if (d) { r.cdate = d; break; }
  }
  if (!r.cdate) {
    const d = pjDate(raw, now);
    if (d) r.cdate = d;
  }
  /* One line often carries both halves — "collection Friday from 9am, must be on
     site before 4pm" — so the clauses are read separately. Reading the line whole
     would put the deadline in the collection time box and leave the deadline
     blank, which is the worst of both. */
  const DEADLINE = /\b(before|by|no later than|deadline|must be|needs? to be|prior to|latest)\b/i;
  const clauses = [];
  lines.forEach((l, i) => l.split(/[,;]|\.\s|\bthen\b/).forEach(c => {
    if (c.trim()) clauses.push({ t: c.trim(), side: sides[i] });
  }));
  for (const c of clauses) {
    if (DEADLINE.test(c.t)) continue;
    if (c.side !== 'c' && !/collect|pick|ready|available/i.test(c.t)) continue;
    const t = pjTime(c.t);
    if (t) { r.ctime = t; break; }
  }
  for (const c of clauses) {
    if (!DEADLINE.test(c.t)) continue;
    if (!pjTime(c.t) && !/\b(am|pm|noon|close of|end of)\b/i.test(c.t)) continue;
    r.dreq = pjDelabel(c.t).slice(0, 90);
    break;
  }
  if (!r.cdate && !r.ctime && !r.dreq) r.missing.push('when it needs moving');

  /* Anything else the driver needs to know, in the sender's own words. */
  lines.forEach((ln, i) => {
    const m = ln.match(/^\s*(?:notes?|instructions?|access|please note|nb)(?:\s*\([^)\n]{0,40}\))?\s*[:\-]\s*(.+)$/i);
    if (m) r.notes.push(m[1].trim());
  });
  r.notes = r.notes.filter((n, i, a) => n && a.indexOf(n) === i).slice(0, 4);

  /* Who is asking. An email signature is the one place a person's own details
     are reliably written down. */
  const em = raw.match(new RegExp(PJ_EMAIL_RE.source, 'gi')) || [];
  const mine = em.find(e => !/usehaf\.co\.uk|quote@/i.test(e));
  if (mine) r.reqEmail = mine;
  let nm = raw.match(/^from\s*:\s*([^<\n]{2,50})</im);
  if (nm) r.reqName = nm[1].trim();
  if (!r.reqName) {
    nm = raw.match(/\b(?:kind regards|many thanks|best regards|regards|thanks|cheers|best wishes|yours)\b[,!.\t ]*\n+[ \t]*([A-Z][a-z'’\-]+(?:[ \t]+[A-Z][a-z'’\-]+){0,2})/i);
    if (nm) r.reqName = nm[1].trim();
  }
  /* Or written on its own line, which is how our template asks for it. */
  if (!r.reqName) {
    nm = raw.match(/^[ \t]*(?:your name|requested by|raised by|ordered by|booked by)[ \t]*[:\-][ \t]*([A-Za-z][A-Za-z'’\-]{1,}(?:[ \t]+[A-Za-z'’\-]{2,}){0,2})[ \t]*$/im);
    if (nm) r.reqName = nm[1].trim();
  }
  return r;
}

if (typeof module !== 'undefined') module.exports = { pjParse, pjDate, pjTime, pjName, pjAddrOk, pjSides, pjDelabel };
