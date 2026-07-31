# HAF KNECT — Pricing Matrix V5

**Status:** built and on preview, awaiting Brent's yes.
**Effective from:** 2026-07-31 · **Engine version string:** `MATRIX-V5`
**Preview:** https://pricing-matrix-v5.knect-demo.pages.dev/
**Source:** `admin/pricing-matrix-v3.js` (back office) + the quote block in `index.html` (customer).
**Tests:** `node admin/pricing-matrix-v5.test.js` — 119 checks, all passing.

Supersedes V4 (the ladder) and V3 (the framework). Nothing here is live on
knect.usehaf.co.uk yet.

---

## 1. The three amounts — never blended into one rate

| | What it is | Who gets it |
|---|---|---|
| **Carrier Transport Value** | what the road work is worth | paid in full to the driver / fleet |
| **HAF Network Fee** | a % **of** the transport value, added **on top** | HAF |
| **Customer price** | transport value + network fee, ex VAT | what the customer sees |

The fee is never hidden inside the mileage rate and never taken off the driver.
VAT is 20% on the customer price. Everything below is quoted **ex VAT**.

---

## 2. The vehicle ladder — the only seven vehicles on this network

| Vehicle | Driver rate (free level) | Minimum transport value |
|---|---|---|
| Small Van | £0.80/mi | £50 |
| SWB | £0.90/mi | £55 |
| MWB | £1.00/mi | £60 |
| LWB | £1.10/mi | £65 |
| XLWB | £1.20/mi | £70 |
| Luton | £1.30/mi | £75 |
| Luton — tail lift | £1.40/mi | £80 |

No artic, flatbed, curtain, fridge, rigid, tractor unit, 7.5t or any HGV class,
anywhere. A removal test in the suite fails the build if one reappears.
Cars and motorcycles exist in the back office but are **inactive and unpriced**.

**Minimums step up by VEHICLE, never by distance.** One ladder, not two.

---

## 3. Short local runs — handling work, not road work

A genuinely short run in the area is handling, so the vehicle minimum eases down
and climbs back to full by 25 miles:

- 0 miles → **30% below** the vehicle minimum
- 15 miles → **20% below**
- 25 miles and beyond → **the full minimum**

The curve is continuous, so **no job is ever quoted less than a shorter one** —
that is tested across all seven vehicles at every mile to 300.

Small Van worked example: 0 mi £35 · 3 mi £36 · 8 mi £37.67 · 15 mi £40 ·
20 mi £45 · 25 mi £50.

---

## 4. Driver base-rate uplift — the driver side

Pence per loaded mile **added to the vehicle base rate**.

| Level | Uplift | Earned by |
|---|---|---|
| Free driver | +£0.00/mi | PLNA Free · Fleet Lite |
| Member driver | +£0.10/mi | PLNA Plus · a paid HAF KNECT membership |
| Pro driver | +£0.25/mi | PLNA Pro · Fleet Pro |

**Highest wins, never stacks.** A driver who is PLNA Pro *and* a KNECT member
*and* on a Fleet Pro account is +£0.25, not +£0.45. All claims are recorded on
the audit record so the decision is always explainable.

**Why this never costs HAF money.** The fee sits on top of the transport value,
so a higher driver rate raises the transport value and the fee rides up with it.
Tested across 7 vehicles × 28 distances: HAF's fee never falls when the driver's
level rises. This is the change from V4, where the uplift was a percentage
skimmed out of HAF's fee and could be *withheld* at the floor — a driver's
benefit can no longer be cancelled by the margin.

It also means **the customer rate follows the driver taking the job**, which is
Brent's own instruction.

**At quote time no driver has been allocated**, so a customer quote is priced at
the free rate and re-run against the real driver's level on allocation.

---

## 5. Network fee reduction — the account side

Percentage points off the job-type fee, for the account **posting** the job.

| Level | Reduction | Who sits here |
|---|---|---|
| Free account | −0 pts | Business Free · Freight Free · Fleet Lite |
| Plus account | −4 pts | Freight Plus · paid HAF KNECT member ⚠️ |
| Pro account | −7 pts | Freight Pro · Fleet Pro |

One ladder for every account type — freight forwarder, business, fleet and KNECT
membership. **Highest wins, never stacks:** a Freight Pro who is also a KNECT
member gets −7, not −11.

**The reduction comes off HAF only.** Driver pay is untouched, and the fee can
never breach the job type's floor. Tested across every account × vehicle × job
type.

⚠️ **The one figure that is not Brent's.** Which rung a paid HAF KNECT
membership sits on. He named KNECT members as earning a reduction but never said
how much. Set to the Plus rung as the entry paid tier, flagged in config,
one word to change.

### Job-type fees and floors

| Job type | Fee | Floor | Live? |
|---|---|---|---|
| Groupage | 10% | 8% | built, switched off |
| Scheduled / Flexible / Co-load | 20% | 15% | yes |
| Same-Day | 20% | 15% | yes |
| Timed Delivery | 25% | 18% | yes |
| Urgent / Time-Critical | 30% | 22% | yes |

Worked example (the documented one): **Freight Pro, same-day.** 20% − 7 = 13%,
but the floor is 15%, so the account gets 5 of its 7 points and lands on 15%.
The audit record says the floor held it. On an **urgent** job there is room:
30% − 7 = 23%, all seven points land.

---

## 6. Everything else, unchanged from V3/V4

- **Zone factor** — destination postcode area sets a return-load step-up:
  strong areas ×1.00, normal ×1.03, limited ×1.07, remote ×1.12. Everything
  combined caps at ×1.40; above that goes to manual review.
- **Hindrance** — weight and handling multipliers, £5 per extra stop, £15/hr
  waiting. All of it pays the **driver**.
- **Fuel marker** — when fuel runs 8%+ over the market average, base rates lift
  4% (10% ceiling) so drivers stay whole. Logged on every job.
- **Market band guard** — a price more than 15% above the local median goes to
  manual review.
- **Direct bookings** — 0% HAF fee, gated by the KNECT quota (3/month free,
  unlimited for members).
- **Network pool** — 5% in production phase (2.5 driver / 2.5 relay); trial
  phase allocates 25% of margin across four pools. Both computed on every job.
- **Admin override** — a margin can be overridden with an operator and a
  reason, and is still clamped to the floor.

---

## 7. What still needs Brent

1. **The KNECT-member rung** (§5) — my number, not his.
2. Whether **Fleet Pro drivers** should sit at the Pro rate automatically, as
   built. It is the reading of "fleet account same again" that keeps the ladder
   consistent, but he has not said it in those words.
3. **Groupage** stays switched off until there is real area data to build it on.

---

## 8. Where the numbers came from

- Vehicle ladder, minimums, short-run band, fee-on-top: **Brent, 2026-07-31**.
- Driver uplift £0.10 / £0.25: **PRICING_ENGINE_CONSTANTS §5.1**, approved
  2026-07-18 — "Member and Pro derive automatically as Free + £0.10 and
  Free + £0.25".
- Account reduction −4 / −7 and the floor rule:
  **PRICING_ENGINE_CONSTANTS §5.5 and §2**, approved 2026-07-18.
- Job-type fees and floors: **FRAMEWORK-V3**, locked 2026-07-20.

Nothing commercial is hard-coded into logic. Every figure lives in `config` at
the top of `admin/pricing-matrix-v3.js` and is mirrored in the customer engine,
with a test that fails if the two ever drift apart.
