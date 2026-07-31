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
| Member driver | +£0.10/mi | PLNA Plus · Fleet Middle · a paid HAF KNECT membership |
| Pro driver | +£0.25/mi | PLNA Pro · Fleet Pro |

⚠️ **This supersedes §7 of the 31 July framework**, which says "PLNA tier must
not change the customer-facing vehicle mileage rate". Brent instructed the uplift
in chat *after* handing that document over — "add driver base rate uplift per
account or HAF KNECT Paid members" — and earlier the same day wrote that the
customer rate "depends on the driver taking the job". Newest instruction wins and
the old line is marked superseded rather than dropped. **It needs his yes.**

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
| Free account | −0 pts | Business Free · Freight Free |
| Plus account | −2.5 pts | Freight Plus · paid HAF KNECT member ⚠️ |
| Pro account | −5 pts | Freight Pro |

Figures are §5 of Brent's 31 July framework, including his instruction that it
is a **percentage-point** reduction, not a percentage off the fee's value: "Do
not calculate this as a 5% discount from the value of the 20% fee."

⚠️ **These replace the −4 / −7 pair** in PRICING_ENGINE_CONSTANTS §5.5 (approved
18 July). The 31 July document is newer and is the one Brent handed over as the
commercial source of truth, so the older pair is recorded as **superseded, not
deleted**, in `config.supersededAccountLevels` — so nobody re-applies it from
the old file.

### Brent's live freight matrix — reproduced cell for cell

| Job type | Freight Free | Freight Plus | Freight Pro |
|---|---|---|---|
| Urgent / time-critical | 30% | 27.5% | 25% |
| Same-day | 20% | 17.5% | 15% |
| Scheduled / flexible / co-load | 20% | 17.5% | 15% |
| Timed delivery* | 25% | 22.5% | 20% |
| Groupage | not active | not active | not active |

\* Timed delivery is not in the 31 July document; it is a live V3 job type and
takes the same reduction.

**Highest wins, never stacks** — §8, one account-tier discount per job. A
Freight Pro who is also a KNECT member gets −5, not −7.5.

**The reduction comes off HAF only.** Driver pay is untouched, and the fee can
never breach the job type's floor (10/8 groupage, 20/15 flexible, 20/15 same-day,
25/18 timed, 30/22 urgent). At −2.5 and −5 no floor is currently reached, so the
floor is a backstop rather than an active constraint — tested either way.

⚠️ **Fleet accounts get NO fee reduction.** §7: "Fleet subscription level must
not automatically reduce the network fee charged to a freight forwarder or
business customer." A fleet is a **supply-side** account — it takes work, it does
not post it — so a fleet's tier is expressed on the **driver** side instead
(§4 above). Brent's chat line "Fleet account same again" sits in his network-fee
paragraph and could be read the other way; the document is explicit, so the
document holds. **This one needs his word.**

⚠️ **Business accounts get NO automatic reduction.** §7: "Do not automatically
give every business account a permanent percentage discount." Negotiated business
rates go through the admin override, which already records effective date,
approving admin and reason.

⚠️ **The KNECT-member rung is not in the document at all.** Brent named KNECT
members as earning a reduction in chat; the framework is silent. Set to the Plus
rung as the entry paid tier. One word to move.

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

## 7. What still needs Brent — five open items, none of them invented

1. **The driver base-rate uplift itself.** His chat instruction and §7 of his own
   document say opposite things (§4 above). Built to the chat instruction because
   it is newer, but this is a decision, not a detail.
2. **"Fleet account same again"** — does a fleet's tier reduce the network fee
   (his chat paragraph) or set its drivers' rate (his document §7)? Built the
   document's way.
3. **The KNECT-member rung** (§5) — my number, not his.
4. **Examples D and E** work at a flat £140 transport value; the live engine
   applies a 1.10 urgent service multiplier inherited from V3, giving £154. Both
   are defensible under §2 — his document just does not show one. Which is right?
5. **Fleet bands.** His document §7 says Lite free to 5 · Middle £100 to 25 · Pro
   £250 to 50. The account-fees module still carries free-to-3 · £50-to-10 from
   29 July. Two records, one truth needed. *(Not this engine — flagged for
   whoever owns the account fees.)*

**Groupage** stays switched off until there is real area data to build it on, and
the co-loaded consignment split has no rule at all yet, so no groupage price can
be quoted.

---

## 8. Where the numbers came from

- Vehicle ladder, minimums, short-run band, fee-on-top, freight reductions:
  **"HAF KNECT Pricing Matrix and Network Fee Framework", Brent, 2026-07-31** —
  §2, §4, §5, §7, §8. This is the commercial source of truth.
- Driver uplift £0.10 / £0.25: **PRICING_ENGINE_CONSTANTS §5.1**, approved
  2026-07-18 — "Member and Pro derive automatically as Free + £0.10 and
  Free + £0.25" — applied on Brent's 31 July chat instruction.
- Job-type floors, zone factor, hindrance, fuel marker, pools:
  **FRAMEWORK-V3**, locked 2026-07-20.

**Superseded and recorded as such, not deleted:**
- Account reduction −4 / −7 (PRICING_ENGINE_CONSTANTS §5.5, 18 Jul) → now
  −2.5 / −5 per the 31 July framework §5.
- The V4 percentage driver uplift skimmed out of HAF's fee → now a pence-per-mile
  uplift on the base rate.
- §7's "PLNA tier must not change the customer-facing vehicle mileage rate" →
  overtaken by Brent's 31 July chat instruction. **Awaiting his confirmation.**

Nothing commercial is hard-coded into logic. Every figure lives in `config` at
the top of `admin/pricing-matrix-v3.js` and is mirrored in the customer engine,
with a test that fails if the two ever drift apart.
