/* KNECT ORDER — the price, fixed on the server.

   A customer types two postcodes, describes the load and picks how soon. This
   turns that into a price, and it does it HERE rather than in the browser for
   one reason: a customer must never be able to name their own price.

   ── ONE ENGINE ──────────────────────────────────────────────────────────────
   Brent, 2026-09-07: "collapse everything onto the one engine".

   This file used to carry its OWN copy of the rate card, and on 7 Sep it was
   still on the pre-V8 rates while the screen had moved to the new ones. A
   310-mile Luton job quoted £852.50 on screen and £633.29 here — the customer
   was shown one price and charged a deposit against another. That is exactly
   the failure the old header warned about, written by the same hand that then
   let it happen.

   So there are no rates below any more. Everything is asked of
   admin/pricing-matrix-v3.js — the SAME file the order screen, the back office,
   the demo and the tests use. VANS and URGENCIES are still exported because the
   options endpoint serves them, but they are now READ OUT of the engine rather
   than typed here, so they cannot drift from it.

   ── WHAT IS DELIBERATELY NOT MODELLED ────────────────────────────────────────
   Lane pressure. The engine multiplies by live demand over supply on the lane;
   a request from a stranger has no view of either, so no postcodes are passed
   and the engine prices at its neutral band (x1.00).

   No account reduction applies: a one-off customer holds no account, so they
   are priced at the free-account rung, never guessed upwards.

   And no driver is allocated yet. Under FRAMEWORK-V8 the customer is quoted at
   the MIDDLE rung whoever eventually accepts, which the engine does on its own,
   so this asks for a quote with no driver tier and gets the blended price.
   Which driver takes the job never moves this number, and the driver is always
   paid their own rung out of it.                                             */

/* The engine is a UMD file so the browser can load it with a plain <script>.
   Under an ESM bundler it exports normally; under a raw ESM loader it has
   nowhere to export to and hangs itself on the global instead. Take whichever
   arrived, and refuse to price at all if neither did — a missing engine must
   never quietly become a guessed price. */
import * as engineModule from '../admin/pricing-matrix-v3.js';

const ENGINE =
  (engineModule && engineModule.price ? engineModule : null) ||
  (engineModule && engineModule.default && engineModule.default.price ? engineModule.default : null) ||
  (typeof globalThis !== 'undefined' && globalThis.HAFPricingMatrix && globalThis.HAFPricingMatrix.price
    ? globalThis.HAFPricingMatrix : null);

if (!ENGINE) throw new Error('HAF pricing engine not loaded — refusing to guess a price.');

/* The order flow's short keys on the left, the engine's codes on the right.
   This is a NAME map, not a rate map: no number crosses it, so it cannot carry
   a stale price the way the old duplicated rate card did. */
const VEHICLE_CODE = {
  small: 'SMALL_VAN', swb: 'SWB_VAN', mwb: 'MWB_VAN', lwb: 'LWB_VAN',
  xlwb: 'XLWB_VAN', luton: 'LUTON', lutonc: 'LUTON_CURTAIN', lutontl: 'LUTON_TAIL'
};
const JOB_CODE = { flex: 'FLEX_SAMEDAY', sday: 'STD_SAMEDAY', urg: 'URGENT', timed: 'TIMED' };

/* The customer-facing wording for each key. The engine's own names are written
   for the back office ("SWB", "Scheduled / Flexible / Co-load"); these are what
   a member of the public reads. Wording only — never a rate. */
const VEHICLE_LABEL = {
  small: 'Small van', swb: 'Short wheelbase', mwb: 'Medium wheelbase',
  lwb: 'Long wheelbase', xlwb: 'Extra long wheelbase',
  luton: 'Luton — box', lutonc: 'Luton — curtain side', lutontl: 'Luton — tail lift'
};
const JOB_LABEL = {
  flex: 'Flexible', sday: 'Same-day', urg: 'Urgent', timed: 'Timed delivery'
};

const cfg = () => ENGINE.config;
const findVehicle = (code) => cfg().vehicles.filter((v) => v.code === code)[0] || null;
const findJobType = (code) => cfg().jobTypes.filter((j) => j.code === code)[0] || null;

/* £ per loaded mile paid to the driver · min = the vehicle's minimum transport
   value, £ ex VAT. Both read live out of the engine on every access, so a rate
   change in one place is a rate change everywhere. */
export const VANS = Object.keys(VEHICLE_CODE).reduce((out, key) => {
  const v = findVehicle(VEHICLE_CODE[key]);
  if (v) out[key] = { name: VEHICLE_LABEL[key], drv: v.baseRate, min: v.minTransportValue };
  return out;
}, {});

/* fee = the share of the customer price HAF keeps at the middle rung · flr =
   the least it may ever fall to · svc = the service multiplier on the transport
   value. Read live out of the engine. */
export const URGENCIES = Object.keys(JOB_CODE).reduce((out, key) => {
  const j = findJobType(JOB_CODE[key]);
  if (j) out[key] = {
    name: JOB_LABEL[key],
    fee: j.marginPct / 100,
    flr: j.floorPct / 100,
    svc: j.servicePremiumMult
  };
  return out;
}, {});

export const REF_MPH = cfg().referenceMph;
export const VAT_PCT = cfg().vatPct;
export const NEUTRAL_LANE = 1.00;
export const MULT_CAP = cfg().hindrance.maxAutoMultiplier;

/* A short local job should not pay a long job's minimum. */
export const LOCAL_MAX_OFF = cfg().localHandling.maxReductionPct / 100;
export const LOCAL_BAND_OFF = cfg().localHandling.bandReductionPct / 100;
export const LOCAL_BAND_AT = cfg().localHandling.bandAtMiles;
export const LOCAL_FULL_AT = cfg().localHandling.fullMinimumFromMiles;

/* The band HAF must land inside on every job (Brent, 2026-09-07). Exported so
   the order API can prove on the record that the price it froze obeys it. */
export const NETWORK_FEE_FLOOR_PCT = cfg().networkFeeFloor.pct;
export const NETWORK_FEE_CEILING_PCT = cfg().networkFeeFloor.ceilingPct;

/* The holding deposit.
   Brent set the size on 3 Sep 2026: the deposit is the FULL job amount. The
   money is held when the job is booked and taken in full once a driver has
   accepted it, so there is never a balance to chase afterwards and nothing is
   taken for a job the network never picked up.
   This is the ONLY place the size is written down. Change it here and every
   quote, page and email follows. The floor is dead at 100% and is kept at zero
   rather than removed, because the tests and the quote both still read it. */
export const DEPOSIT_PCT = 100;
export const DEPOSIT_MIN_PENCE = 0;

const pence = (pounds) => Math.round(pounds * 100);

export const vehicle = (key) => VANS[key] || null;
export const urgency = (key) => URGENCIES[key] || null;

/* Kept as an export because the order flow and the tests both read it. The
   taper itself lives in the engine; this asks the engine rather than repeating
   the arithmetic. */
export function minTransportValue(v, miles) {
  return ENGINE.shortRunMinimum
    ? ENGINE.shortRunMinimum(v.min, miles)
    : (function () {
        const m = Math.max(0, miles);
        let f;
        if (m >= LOCAL_FULL_AT) f = 1;
        else if (m >= LOCAL_BAND_AT)
          f = (1 - LOCAL_BAND_OFF) + LOCAL_BAND_OFF * (m - LOCAL_BAND_AT) / (LOCAL_FULL_AT - LOCAL_BAND_AT);
        else
          f = (1 - LOCAL_MAX_OFF) + (LOCAL_MAX_OFF - LOCAL_BAND_OFF) * (m / LOCAL_BAND_AT);
        return Math.round(v.min * f * 100) / 100;
      })();
}

/**
 * quoteOneOff({ miles, minutes, vehicleCode, jobTypeCode }) -> the frozen price
 * in pence, with the three amounts kept apart. Returns null for anything not on
 * the rate card: an unknown van must never become a price.
 */
export function quoteOneOff({ miles, minutes, vehicleCode, jobTypeCode }) {
  const vCode = VEHICLE_CODE[vehicleCode];
  const jCode = JOB_CODE[jobTypeCode];
  if (!vCode || !jCode) return null;
  const m = Number(miles);
  if (!Number.isFinite(m) || m <= 0) return null;

  const q = ENGINE.price({
    miles: m,
    /* Driving time, when the distance gateway gave us one. A slow forty miles
       is not a cheap forty miles, and the engine pays the driver on whichever
       of distance and time is worth more. With no minutes it is distance only,
       exactly as the screen does it. */
    minutes: Number(minutes) > 0 ? Number(minutes) : 0,
    vehicleCode: vCode,
    jobTypeCode: jCode,
    /* No account and no allocated driver: the free-account rung, and the engine
       quotes the middle driver rung on its own. No postcodes, so the lane sits
       at its neutral band. */
    plnaTier: 'FREE',
    knectTier: 'FREE',
    accountType: null,
    weight: 'STANDARD',
    handling: 'KERBSIDE'
  });
  if (!q || !q.money) return null;

  const M = q.money;
  const exVat = pence(M.customerExVatGbp);
  const vat = Math.round(exVat * VAT_PCT / 100);
  const total = exVat + vat;

  let deposit = Math.round(total * DEPOSIT_PCT / 100);
  if (deposit < DEPOSIT_MIN_PENCE) deposit = DEPOSIT_MIN_PENCE;
  if (deposit > total) deposit = total;

  return {
    miles: Math.round(m * 10) / 10,
    minutes: Number(minutes) > 0 ? Math.round(Number(minutes)) : null,
    vehicle_code: vehicleCode,
    vehicle_name: VEHICLE_LABEL[vehicleCode],
    job_type_code: jobTypeCode,
    job_type_name: JOB_LABEL[jobTypeCode],
    /* What a driver is paid for this job at the rung the customer was quoted
       at. Whoever actually accepts is paid their own rung, out of the same
       price — the customer's number never moves with them. */
    driver_pay_pence: pence(M.customerPriceBasisGbp),
    network_fee_pct: M.hafKeepsPctOfCustomer,
    on_minimum: !!M.minChargeApplied,
    quote_ex_vat_pence: exVat,
    vat_pence: vat,
    vat_pct: VAT_PCT,
    total_pence: total,
    deposit_pence: deposit,
    deposit_pct: DEPOSIT_PCT,
    balance_pence: total - deposit
  };
}
