/* KNECT ORDER — the price, fixed on the server.

   A customer types two postcodes, describes the load and picks how soon. This
   turns that into a price, and it does it HERE rather than in the browser for
   one reason: a customer must never be able to name their own price.

   ── ONE FRAMEWORK, NOT TWO ───────────────────────────────────────────────────
   Every number below is lifted from the live engine in index.html — the same
   FRAMEWORK-V7 the order screen quotes from, with the SAME vehicle and urgency
   keys, so nothing has to be translated between the screen and the server. A
   mapping table between two ladders is exactly how a customer ends up shown one
   price and charged a deposit against another.

   order-quote.test.mjs reads index.html and fails if any rate, minimum, urgency
   fee, floor, service factor, the reference speed, the local taper or the VAT
   rate has drifted apart from the copy here.

   ── WHAT IS DELIBERATELY NOT MODELLED ────────────────────────────────────────
   Lane pressure. The page's engine multiplies by live demand over supply on the
   lane; a request from a stranger has no view of either, so this quotes at the
   neutral band (x1.00) — the same price the engine gives a balanced lane. And
   no tier reduction applies: a one-off customer holds no account, so they are
   priced at the free rung, never guessed upwards.

   The driver reward is off (FRAMEWORK-V7, Brent 2 Aug) and, when it returns, it
   is funded by HAF rather than the customer — so which driver accepts a job can
   never move this number either way.                                          */

/* £ per loaded mile paid to the driver · min = the vehicle's minimum transport
   value, £ ex VAT. index.html -> const VAN */
export const VANS = {
  small:   { name: 'Small van',              drv: 0.80, min: 50 },
  swb:     { name: 'Short wheelbase',        drv: 0.90, min: 55 },
  mwb:     { name: 'Medium wheelbase',       drv: 1.00, min: 60 },
  lwb:     { name: 'Long wheelbase',         drv: 1.10, min: 65 },
  xlwb:    { name: 'Extra long wheelbase',   drv: 1.20, min: 70 },
  luton:   { name: 'Luton — box',            drv: 1.30, min: 75 },
  lutonc:  { name: 'Luton — curtain side',   drv: 1.30, min: 75 },
  lutontl: { name: 'Luton — tail lift',      drv: 1.40, min: 80 }
};

/* fee = the share of the customer price HAF keeps · flr = the least it may ever
   fall to · svc = the service multiplier on the transport value.
   index.html -> const URG */
export const URGENCIES = {
  flex:  { name: 'Flexible',       fee: 0.20, flr: 0.15, svc: 1.00 },
  sday:  { name: 'Same-day',       fee: 0.20, flr: 0.15, svc: 1.00 },
  urg:   { name: 'Urgent',         fee: 0.30, flr: 0.22, svc: 1.10 },
  timed: { name: 'Timed delivery', fee: 0.25, flr: 0.18, svc: 1.00 }
};

export const REF_MPH = 40;
export const VAT_PCT = 20;
export const NEUTRAL_LANE = 1.00;
export const MULT_CAP = 1.40;

/* A short local job should not pay a long job's minimum. index.html ->
   LOCAL_MAX_OFF / LOCAL_BAND_OFF / LOCAL_BAND_AT / LOCAL_FULL_AT */
export const LOCAL_MAX_OFF = 0.30;
export const LOCAL_BAND_OFF = 0.20;
export const LOCAL_BAND_AT = 15;
export const LOCAL_FULL_AT = 25;

/* The holding deposit.
   Brent asked for "a holding deposit" and has not set the size, so this is my
   default and it is the ONLY place it is written down: a quarter of the job,
   never less than £25, never more than the job itself. Change these two numbers
   and every quote, page and email follows. */
export const DEPOSIT_PCT = 25;
export const DEPOSIT_MIN_PENCE = 2500;

const p2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pence = (pounds) => Math.round(pounds * 100);

export const vehicle = (key) => VANS[key] || null;
export const urgency = (key) => URGENCIES[key] || null;

export function minTransportValue(v, miles) {
  const m = Math.max(0, miles);
  let f;
  if (m >= LOCAL_FULL_AT) f = 1;
  else if (m >= LOCAL_BAND_AT)
    f = (1 - LOCAL_BAND_OFF) + LOCAL_BAND_OFF * (m - LOCAL_BAND_AT) / (LOCAL_FULL_AT - LOCAL_BAND_AT);
  else
    f = (1 - LOCAL_MAX_OFF) + (LOCAL_MAX_OFF - LOCAL_BAND_OFF) * (m / LOCAL_BAND_AT);
  return Math.round(v.min * f * 100) / 100;
}

/**
 * quoteOneOff({ miles, minutes, vehicleCode, jobTypeCode }) -> the frozen price
 * in pence, with the three amounts kept apart. Returns null for anything not on
 * the rate card: an unknown van must never become a price.
 */
export function quoteOneOff({ miles, minutes, vehicleCode, jobTypeCode }) {
  const v = vehicle(vehicleCode);
  const u = urgency(jobTypeCode);
  if (!v || !u) return null;
  const m = Number(miles);
  if (!Number.isFinite(m) || m <= 0) return null;

  const hours = (Number(minutes) > 0 ? Number(minutes) : (m / 32) * 60) / 60;
  const mult = Math.min(u.svc * NEUTRAL_LANE, MULT_CAP);
  const floor = minTransportValue(v, m) * NEUTRAL_LANE;

  /* What the driver is paid: whichever of distance and time is worth more, then
     the service multiplier, and never below the vehicle's minimum. */
  const byDistance = m * v.drv;
  const byTime = hours * v.drv * REF_MPH;
  const carrier = p2(Math.max(Math.max(byDistance, byTime) * mult, floor));

  /* The percentage is the share of the customer price HAF KEEPS, so the price
     is the transport value grossed up — divided by (1 - fee), never multiplied
     by (1 + fee). The two are different numbers and only the first leaves HAF
     the fee it intended. A one-off holds no account, so the fee is the job
     type's own rate with no reduction; the floor is carried for the day an
     account rate does apply here. */
  const feePct = Math.max(u.fee, u.flr);
  const exVat = pence(p2(carrier / (1 - Math.min(feePct, 0.95))));
  const vat = Math.round(exVat * VAT_PCT / 100);
  const total = exVat + vat;

  let deposit = Math.round(total * DEPOSIT_PCT / 100);
  if (deposit < DEPOSIT_MIN_PENCE) deposit = DEPOSIT_MIN_PENCE;
  if (deposit > total) deposit = total;

  return {
    miles: Math.round(m * 10) / 10,
    minutes: Number(minutes) > 0 ? Math.round(Number(minutes)) : null,
    vehicle_code: vehicleCode,
    vehicle_name: v.name,
    job_type_code: jobTypeCode,
    job_type_name: u.name,
    driver_pay_pence: pence(carrier),
    network_fee_pct: Math.round(feePct * 1000) / 10,
    on_minimum: carrier === p2(floor),
    quote_ex_vat_pence: exVat,
    vat_pence: vat,
    vat_pct: VAT_PCT,
    total_pence: total,
    deposit_pence: deposit,
    deposit_pct: DEPOSIT_PCT,
    balance_pence: total - deposit
  };
}
