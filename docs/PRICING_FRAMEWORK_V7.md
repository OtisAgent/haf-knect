# HAF KNECT — Pricing Framework V7

**The one framework.** Supersedes FRAMEWORK-V3 (20 Jul), the V4 ladder,
PRICING MATRIX V5 (31 Jul), Henry's parallel V4 build and V6. Where any of those
disagree with this page, this page wins.

**Status: LIVE.** Brent 2026-08-02: "go live push one framework - we can alter
and adapt as we develop the next work".
**Engine version string:** `MATRIX-V7` · **Effective from:** 2026-08-02
**Source:** `admin/pricing-matrix-v3.js` (order flow) · `admin/lane-factors-v1.js`
(lanes) · the quote block in `index.html` (customer). The three are tested
against each other on every run.
**Tests:** `node admin/pricing-framework-v6.test.js` (170) ·
`node admin/lane-and-margin-v6.test.js` (50) ·
`node admin/account-fees-v1.test.js` (126) · `node admin/tier-identity-v1.test.js` (51) ·
`node tools/load-picker.test.mjs` (137) · `node admin/pricing-database.test.mjs` (24).

---

## 1. The whole framework in six sentences

1. Every job has a **transport value** — what the road work is worth. The
   driver is paid all of it.
2. HAF **keeps a percentage of what the customer pays**. That percentage is set
   by the job type and reduced by the posting account's level.
3. A **better driver earns more per mile**. That raises the transport value, so
   it costs neither HAF nor the customer anything.
4. A **harder lane pays more**. How hard a lane is comes from real jobs and real
   feedback, not from a hand-written list.
5. Nothing bigger than a **Luton** exists on this network.
6. Every quote carries a **plain-words reason for every pound of it**.

If a rule cannot be explained to a driver in one sentence, it does not belong
in this framework.

---

## 2. The three amounts — never blended into one rate

| | What it is | Who gets it |
|---|---|---|
| **Carrier Transport Value** | what the road work is worth | paid in full to the driver / fleet |
| **HAF Network Fee** | the share of the customer price HAF keeps | HAF |
| **Customer price** | transport value + network fee, ex VAT | what the customer sees |

```
customer price (ex VAT) = transport value ÷ (1 − HAF's share)
HAF network fee         = customer price − transport value
```

VAT is 20% on the customer price. Everything below is **ex VAT**.

---

## 3. ⚠️ THE ONE THING THAT CHANGED FROM V5 — and why

Brent, 2026-08-02: *"minimum 10% - 15% per job paid accounts ... the free
accounts needs to be 20% - 30%"*, then *"build the system to allow for the
figures above — find a solution"*.

Those figures were **not being met and could not be met**. V5 treated the
percentage as something **added on top** of the transport value. Henry built it
as what HAF **keeps**. On the same 30-mile same-day small van the two engines
were **£14.45 apart**, and the live one kept **16.7%** of the customer price
where the number on the page said 20% — about **12.5%** once the trial pools
were paid out.

Brent's own worked examples in §6 of his 31 July document are arithmetic done
the *added-on* way. His margin bands are the *kept* way. **They cannot both be
true.** He asked for the figures, so:

> **A percentage is the share of the customer price HAF keeps.**

Free accounts now land on exactly 20 / 20 / 25 / 30 and no paid account falls
below 15 — his bands, hit without inventing a single number.

**What this costs.** Customer subtotals in his §6 examples rise about 4%:

| His example | Transport value | His subtotal | V6 subtotal | HAF keeps |
|---|---|---|---|---|
| A — Small Van 25 mi same-day, free | £50 *(unchanged)* | £60.00 | **£62.50** | 16.7% → **20%** |
| B — SWB 100 mi same-day, Freight Plus | £90 *(unchanged)* | £105.75 | **£109.09** | 14.9% → **17.5%** |
| C — LWB 100 mi scheduled, Freight Pro | £110 *(unchanged)* | £126.50 | **£129.41** | 13.0% → **15%** |

**The driver is paid exactly the same in every case.** Only HAF's share of the
total moved, and only to the number Brent asked for.

### The ruling, 2026-08-02 — this is now settled

Brent was asked which definition wins and handed the decision back: *"find the
right solution - and make a choice OTIS - you can fix it"*. **The choice is
KEEP**, and it is now locked rather than configurable:

* **ADDED cannot deliver his bands.** Measured, not argued — under the add-on
  reading, scheduled/flexible and same-day (the two job types that carry the
  bulk of the network) fall **below** the 20–30% band at every vehicle and
  every distance; timed clears the 20% line by under a tenth of a point; only
  urgent has real room. Read the same way, his paid band's 10% marker would be
  9.1% kept — under his own stated minimum.
* **KEEP meets every band exactly**, with no invented number.
* **The driver is paid the identical pound either way** — proved across 196
  jobs — so the ruling moves only what HAF retains, never the network's money.
* **The cost is the ~4% in the table above**, and it is stated rather than
  buried. The document's arithmetic is what changes, not the bands he wrote.

`ADDED_TO_TRANSPORT_VALUE` is deliberately left working so the counterfactual
can be **run** rather than debated — `admin/fee-basis-lock.test.js` runs it and
shows the bands failing. It is not a supported setting: changing
`config.feeBasis` fails that suite on purpose (44 checks).

**§6 of the 31 July document is therefore superseded on this one point.** Its
bands stand; its worked subtotals do not. Anyone quoting £60 / £105.75 / £126.50
is quoting the old arithmetic — the live figures are £62.50 / £109.09 / £129.41.

**The trial pools.** 25% of the margin currently flows back into the four
network pools (Brent's own 20 July trial setting). So on a 20% job HAF keeps
20% and **nets 15%**. Both numbers are on every quote now
(`hafKeepsPctOfCustomer`, `hafNetPctOfCustomer`) so they can never quietly drift
apart again.

---

## 4. The vehicle ladder — the only eight vehicles

| Vehicle | Driver rate (free level) | Minimum transport value |
|---|---|---|
| Small Van | £0.80/mi | £50 |
| SWB | £0.90/mi | £55 |
| MWB | £1.00/mi | £60 |
| LWB | £1.10/mi | £65 |
| XLWB | £1.20/mi | £70 |
| Luton — box | £1.30/mi | £75 |
| Luton — curtain side | £1.30/mi | £75 |
| Luton — tail lift | £1.40/mi | £80 |

Brent, 2026-08-02: *"Lutons - tail lift + box + curtain side"*. Those three
bodies are the top of the ladder and the only place the word "curtain" is
allowed — a curtain-side **Luton** is approved, anything on a trailer is not.
No artic, flatbed, fridge, rigid, tractor unit, 7.5t or any HGV class anywhere.
A removal test fails the build if one reappears.

**Minimums step up by VEHICLE, never by distance.** One ladder, not two.

**Short local runs** are handling, not road work, so the vehicle minimum eases
down and climbs back to full by 25 miles: 0 mi = 30% below · 15 mi = 20% below ·
25 mi + = the full minimum. The curve is continuous, so **no job is ever quoted
less than a shorter one** — tested on every vehicle at every mile to 300, with
lanes live.

---

## 5. Driver reward rate — the driver side

Pence per loaded mile **added to the vehicle base rate**.

| Level | Reward | Earned by |
|---|---|---|
| Free driver | +£0.00/mi | PLNA Free · Fleet Lite |
| Member driver | +£0.10/mi | PLNA Plus · Fleet Middle · a paid HAF KNECT membership |
| Pro driver | +£0.25/mi | PLNA Pro · Fleet Pro |

**Highest wins, never stacks.** A driver who is PLNA Pro *and* a KNECT member
*and* on a Fleet Pro account is +£0.25, not +£0.45. Every claim is on the audit
record.

### V7: the reward is PAUSED, and HAF — never the customer — funds it

Brent, 2026-08-02: *"i wouldn't say charging more for a better driver ... for
now offering more for a driver isn't right - i'm happy to take less margin for
HAF then make the customers pay more."*

Two rules come out of that, and both are in the engine:

1. **Paused.** `driverReward.enabled = false`. Every driver is paid the same
   rate today, whatever their tier. Member and Pro still earn everything else
   their tier carries — priority matching, relay eligibility, account benefits.
   The rungs above are the *shape* of the reward, held at zero, so switching it
   back on is one word rather than a rebuild. Pro's value comes from the
   features Brent is adding later (gap insurance and the rest), not from a
   mileage rate.

2. **When it runs, HAF pays for it.** `driverReward.fundedBy = "HAF_MARGIN"`.
   The customer price is calculated on the **plain vehicle rate**, so which
   driver accepts a job can never move what the customer is quoted. The extra
   comes out of HAF's own share. This is §7 of the 31 July framework honoured
   literally, and it closes Henry's finding that a Pro driver was costing the
   customer £45 inc VAT on a 100-mile same-day small van.

**The one limit on "happy to take less".** HAF funds the reward down to
`minRetainedPctOfCustomer` (8%) of the customer price and no further. Past that
the reward is **trimmed to what HAF can afford, flagged `REWARD_TRIMMED`, and
sent for manual review** — loudly, never silently. The customer price still does
not move. This matters on long jobs: £0.25/mile over 300 miles is £75, which no
20% share can absorb.

**What this replaced.** V5/V6 let the reward raise the transport value so the
fee rode up with it. That is now deleted from the engine and from the test
suite — the old assertions ("the customer rate follows the driver taking the
job", "HAF earns MORE for paying a better driver") were replaced by their
opposites rather than skipped, so nobody can reinstate the behaviour by
accident.

---

## 6. Network fee reduction — the account side

Percentage points off the job-type share, for the account **posting** the job.

| Level | Reduction | Who sits here |
|---|---|---|
| Free account | −0 pts | Business Free · Freight Free |
| Plus account | −2.5 pts | Freight Plus · paid HAF KNECT member |
| Pro account | −5 pts | Freight Pro |

### What HAF keeps, by job type and account

| Job type | Free | Plus | Pro |
|---|---|---|---|
| Urgent / time-critical | 30% | 27.5% | 25% |
| Timed delivery | 25% | 22.5% | 20% |
| Same-day | 20% | 17.5% | 15% |
| Scheduled / flexible / co-load | 20% | 17.5% | 15% |
| Groupage | *not active* | *not active* | *not active* |

Free accounts sit inside Brent's 20–30% band on every row. Paid accounts never
drop below 15%, comfortably above his 10% minimum.

**Highest wins, never stacks** — one account discount per job. A Freight Pro who
is also a KNECT member gets −5, not −7.5.

**The reduction comes off HAF only.** Driver pay is untouched — proved on 8
vehicles × 4 job types × 60 distances. The share can never breach the job type's
floor (groupage 8, flexible 15, same-day 15, timed 18, urgent 22).

**Fleet accounts get no fee reduction** — a fleet is a supply-side account, so
its tier is expressed on the driver side instead (§5). **Business accounts get
no automatic reduction**; negotiated rates go through the admin override, which
records the date, the approving admin and the reason.

---

## 7. 🆕 Lane adjustment — the answer to Sheffield vs Sheffield

Brent, 2026-08-02: *"some areas will need price alterations because sheffield to
manchester is different then sheffield to birmingham — same driving time
different distance and different fuel consumption different type of busy work"*.

Until now the network had **one** adjustment and it looked only at where a job
**ended** — a hand-written list of postcode areas graded strong / normal /
limited / remote. It could not tell those two runs apart, because it never
looked at where the job **started**.

A **lane** is now origin area → destination area (S → M), and it carries four
small adjustments, each one earned and each one explainable on its own:

| | What it measures | Where it comes from | Range |
|---|---|---|---|
| **Road** | how the road really drives — average speed, so fuel per mile and hours of the driver's day | finished job times against distances | 1.00 – 1.18 |
| **Return load** | how likely a paid load back is | share of drivers who found paid work back within 6 hours | 1.00 – 1.12 |
| **Demand** | how busy the lane is | jobs posted ÷ driver-days offered | 1.00 – 1.08 |
| **Feedback** | what drivers and customers actually say about it | the lane feedback record | 0.97 – 1.05 |

They multiply into **one lane factor**, capped at **+25%**, and it multiplies
the **transport value** — so it **pays the driver**, and HAF's share rides on
top of it exactly like every other driver-side lever. HAF's percentage does not
move.

**Three rules that keep it honest:**

- **A lane is never cheaper than the standard rate.** The network raises a hard
  lane; it does not discount an easy one. Customer feedback can pull a lane back
  towards standard but never below it.
- **Evidence before money.** A lane prices on its own numbers only once it has
  **8 finished jobs** behind it. Below that it falls back to the region pair,
  and below that to the destination-area grade that has always been live.
- **The ceiling holds.** Lane × urgency × hindrance may not exceed **1.40**.
  Above that the job is priced at the cap and sent to a human.

The lane also lifts the **vehicle minimum** — without that, a hard lane that
happens to be short would price identically to an easy one, because the minimum
would swallow the whole adjustment. That is exactly the Sheffield case.

Where driving **minutes** are known, the road work is worth the greater of the
distance and the time. A slow 40-mile run is not a cheap 40-mile run.

### Worked: Brent's own two runs

Both are an LWB, same-day, free account, free driver, priced from the same
evidence set:

| | Miles | Minutes | Lane factor | Driver paid | Customer, ex VAT |
|---|---|---|---|---|---|
| Sheffield → Manchester | 42 | 75 (33.6 mph) | **×1.067** | £69.35 | £86.69 |
| Sheffield → Birmingham | 78 | 95 (49.3 mph) | ×1.00 | £85.80 | £107.25 |

The cross-Pennine run pays the driver **£1.65 a mile**; the motorway run pays
**£1.10**. Same vehicle, same job type — the lane did the work. HAF keeps 20% on
both.

### 🔴 Honest limit: there is no history to learn from yet

The lane store is **deliberately empty**. PLNA holds **1 booking, 0 finished
jobs and 0 feedback rows** today (checked directly, 2026-08-02), so there is
nothing to calibrate on. Inventing a table of lane factors would have been
guessing dressed up as data.

So the framework ships as **the machine, correct and tested, with the evidence
slot empty** — every quote today comes out exactly as it does now. The moment
real jobs and real feedback land, the nightly learner fills the lanes in and
prices start reflecting the road. That is also why the fallback ladder matters:
it is what the network runs on until then.

**Next step for lanes:** the nightly job that computes lane statistics from
finished jobs, plus a one-tap "this run was worse than it paid" on the driver
app and "this quote felt dear" on the customer side. Both are small; neither
should be built before real jobs exist to feed them.

---

## 8. Everything else, unchanged

- **Hindrance** — weight and handling multipliers, £5 per extra stop, £15/hr
  waiting. All of it pays the driver. Capped at 1.40× with the lane.
- **Urgency premium** — urgent work carries a 1.10 premium on the road work,
  **paid to the driver**. ⚠️ *This was live in the customer quote but missing
  from the order flow, so an urgent job was quoted 10% above what the back
  office recorded — the driver would have been paid short. Found by the V6 lane
  suite and fixed. The customer price does not change.*
- **Fuel marker** — when fuel runs 8%+ over the market average, base rates lift
  4% (10% ceiling) so drivers stay whole. Logged on every job.
- **Market band guard** — a price more than 15% above the local median goes to
  manual review.
- **Direct bookings** — 0% HAF fee, gated by the KNECT quota (3/month free,
  unlimited for members).
- **Network pools** — trial phase 25% of margin across four pools; production
  phase 5% (2.5 driver / 2.5 relay). Both computed on every job.
- **Admin override** — a share can be overridden with an operator and a reason,
  and is still clamped to the floor.
- **Every calculation returns a full audit record** — inputs, rates, lane parts
  and basis, reward decision, account reduction, flags, reasons, override,
  pools, and both what HAF keeps and what it nets.

---

## 9. Still open with Brent — four, none of them invented

1. **His §6 subtotals move ~4%** (§3). His bands and his worked examples cannot
   both hold. Built to the bands, because that is what he asked for today.
2. **Fleet accounts** — does a fleet's tier reduce the network fee (his chat
   paragraph) or set its drivers' rate (his document §7)? Built the document's
   way.
3. **The KNECT-member rung** on the account ladder is set to Plus. That is our
   number, not his — his framework is silent on it.
4. **Fleet bands** — his document §7 says Lite free-to-5 · Middle £100-to-25 ·
   Pro £250-to-50; the account-fees module still carries free-to-3 · £50-to-10.
   Two records, one truth needed. *(Not this engine.)*

**Groupage** stays switched off until there is real area data to build it on.

---

## 10. Where the numbers came from

- Vehicle ladder, minimums, short-run band, freight reductions, fee floors:
  **"HAF KNECT Pricing Matrix and Network Fee Framework", Brent, 2026-07-31**.
- Margin bands as what HAF **keeps**: **Brent, 2026-08-02**, and his instruction
  the same day to build the system to allow for those figures.
- Driver reward £0.10 / £0.25: **PRICING_ENGINE_CONSTANTS §5.1**, 2026-07-18,
  confirmed by Brent 2026-07-31 (*"that's correct, add exactly that"*).
- Three Luton bodies, and "different wording than uplift": **Brent, 2026-08-02**.
- Lane adjustment: **Brent, 2026-08-02** — the Sheffield instruction.
- Job-type floors, hindrance, fuel marker, urgency premium, pools:
  **FRAMEWORK-V3**, 2026-07-20.

**Superseded, recorded rather than deleted:**
- Fee as a percentage *added to* the transport value (V5) → now the share of the
  customer price HAF keeps.
- Account reduction −4 / −7 (18 Jul) → −2.5 / −5 (31 Jul framework §5).
- The V4 percentage driver uplift skimmed out of HAF's fee → a pence-per-mile
  reward on the base rate.
- §7's "PLNA tier must not change the customer-facing vehicle mileage rate" →
  overtaken by Brent's 31 July instruction and renamed the **driver reward rate**
  on 2 August.
- The single destination-area zone factor → now the bottom rung of the lane
  ladder, kept byte-for-byte so behaviour is unchanged until evidence exists.

Nothing commercial is hard-coded into logic. Every figure lives in `config` and
is mirrored between the two engines, with tests that fail if they ever drift.
