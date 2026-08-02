# Where HAF makes its money — REVENUE-V1

**The one page that answers "where does the money come from?"** Built from
Brent's *"OTIS — HAF Network Pricing Formula"*, 2026-08-02, §10–§12, on his
instruction: *"use this framework to help guide where HAF makes the revenue for
the network and the business of HAF"*.

**Status: built and tested, PREVIEW — live pricing is untouched.**
**Source:** `admin/revenue-model-v1.js` · **Tests:** `node admin/revenue-model-v1.test.js` (114)
**Pairs with:** the pricing framework in `docs/PRICING_FRAMEWORK_V7.md`.

The pricing engine answers *what does this job cost the customer?*
This layer answers *what did HAF actually earn, and out of which pocket?*

---

## 1. The whole model in one line

> **HAF earns in four places. Only ONE of them is the delivery itself.**

| | Stream | What it is | Charged |
|---|---|---|---|
| **A** | **Delivery network revenue** | the network fee on every job moved | per job |
| **B** | **Account subscriptions** | PLNA Plus/Pro · Freight Plus/Pro · Fleet · paid KNECT membership · page subscriptions | recurring |
| **C** | **Payroll & processing** | payment-run block fees, authorised transaction fees | per invoice |
| **D** | **Additional services** | relay · storage · account management · credit · priority allocation · compliance · page builds · AI · admin | one-off |

**The hard rule (§12.6): B, C and D are never delivery margin.** The code
enforces it rather than trusting it — `deliveryMargin()` physically refuses to
sum a non-delivery line, and an unclassified pound is rejected outright instead
of landing in a bucket by accident. This matters because blending a £30
subscription into delivery margin makes the network look profitable when it
isn't, and that is the one lie that would take longest to find.

**Why it matters commercially:** stream A scales with *volume* and is capped by
what a customer will pay for a van. Streams B–D scale with *how many accounts
are on the network*, cost almost nothing per extra unit, and keep earning on a
week with no jobs in it. In the four-job worked month in the test suite, the
network fees came to **£163.58** and the business lines came to **£170** — the
business already out-earns the network at low volume. That is the shape to
build towards, not an accident to correct.

---

## 2. Stream A — how a delivery becomes revenue

Brent's core principle, unchanged and enforced end to end:

```
DRIVER PAYABLE PRICE  +  HAF NETWORK FEE  =  CUSTOMER PRICE (ex VAT)
```

**HAF's fee is never taken out of the driver's rate.** It sits on top of it and
is charged to the customer. Every job proves this: driver + fee + other charges
reconciles to the customer price exactly, checked across **512 priced jobs**
(8 vehicles × 4 job types × 4 account types × 4 distances).

### The fee is not the profit

§11 says so plainly, and this is the number that was missing until now:

```
HAF GROSS PROFIT PER JOB
= HAF network fee
− HAF-funded job costs        (a driver reward HAF pays for itself)
− payment processing costs    (only when actually incurred)
− network pool contributions  (money returned to the network)
− approved discounts          (promotional or goodwill, on top of the account rate)
```

Real jobs, from the live engine today:

| Job | Driver paid | HAF fee | Customer ex VAT | Into the pools | **HAF gross profit** | % of customer |
|---|---:|---:|---:|---:|---:|---:|
| Small van · 30 mi · same-day · free account | £50.00 | £12.50 | £62.50 | £3.13 | **£9.37** | 15.0% |
| LWB · 100 mi · same-day · Freight Plus | £110.00 | £23.33 | £133.33 | £5.83 | **£17.50** | 13.1% |
| Luton box · 120 mi · urgent · free account | £171.60 | £73.54 | £245.14 | £18.39 | **£55.15** | 22.5% |
| Luton tail lift · 200 mi · scheduled · Freight Pro | £280.00 | £49.41 | £329.41 | £12.35 | **£37.06** | 11.3% |

The gap between the headline percentage and the last column is **the network
pools** — currently 25% of margin in the trial phase (Brent's own 20 July
setting). A 20% job nets 15%. Both numbers are on every quote so they can never
drift apart unnoticed.

### Two traps this layer closes

**The double-count.** Under FRAMEWORK-V7 the engine already takes a HAF-funded
driver reward out of the network fee. Deducting it again as an "HAF-funded job
cost" would understate profit on every rewarded job. So the model reports the
fee *before* funding, the funding, and the fee *after* — three numbers that
reconcile, one deduction.

**The phantom discount.** A Freight Plus account's 2.5-point fee reduction is
already inside the effective percentage. It is reported as **revenue foregone**
(so the cost of the discount is visible) and *not* deducted a second time. Only
discounts applied on top of the account rate reduce profit.

### What is deliberately NOT assumed

**Payment processing defaults to zero.** CleverPay charges only when an invoice
is generated — no work, no invoice, no charge — and the amount is the CleverPay
team's to set per driver per payment run, not per delivery (Brent, 2026-07-29).
Putting a guessed number here would push invented costs into HAF's profit on
every job. It is supplied when a real invoice exists, and the record says
whether it was supplied or defaulted.

---

## 3. Streams B, C and D — the business, not the network

These are recorded, never priced, here. The amounts belong elsewhere and two of
them are still contested:

- **Fleet bands** — his 31 July document says Lite free-to-5 · Middle £100-to-25 ·
  Pro £250-to-50; the account-fees module still carries free-to-3 · £50-to-10.
  Two records, one truth needed. *(PRICING_FRAMEWORK_V7 §9.4, still open.)*
- **Payment-run fees** are the CleverPay team's call, and payroll admin fees are
  partnership revenue — they sit outside HAF tier maths entirely.

**Landing pages appear in both §10.B and §10.D of Brent's document.** The rule
applied: classify by how it is *charged*. A recurring page fee is a
subscription; a one-off build is a service. Both codes exist so neither reading
is lost.

---

## 4. Every quote is now a financial record (§12.8)

Every job returns the seven lines his document demands, in his order:

```
Driver payable · HAF network fee · Other charges · Customer price ex VAT
· VAT · Final customer price · HAF gross profit
```

**Customer-specific charges** (§2) now reach the right pocket. Each carries a
destination — HAF, driver, or genuine pass-through — and the default for an
unclassified charge is **pass-through**, never HAF. A default that quietly
inflated margin would be the easiest possible way to overstate profit.

---

## 5. A confirmed quote never moves (§12.9 / §12.10)

Every calculation now snapshots the account types and fee rules **as they were
when the quote was made**, with a fingerprint. If the rules change later:

- a **confirmed** quote holds its own price, always, and the change is reported
  in plain words rather than silently re-pricing a live job;
- an **unconfirmed** quote requotes, as it should.

⚠️ A real bug was found building this: the audit record names its fields
differently from the pricing function's arguments (`vehicle` vs `vehicleCode`).
Replaying a quote through the wrong names priced a *different job* and reported
a £36 difference as "drift". The mapping is now explicit and tested.

---

## 6. 🔴 The one thing that needs Brent — the fee basis

**His new document defines the network fee the opposite way to what went live
this morning.** Both are defensible; they cannot both run.

| | **Add-on** (his new document §2, §8) | **Keep** (live since 2026-08-02) |
|---|---|---|
| The rule | fee = driver price × % | % = HAF's share of the customer price |
| His §8 example | driver £115 → fee £23 → **customer £138** | driver £115 → fee £28.75 → **customer £143.75** |
| HAF keeps | 16.7% of the customer price | 20% of the customer price |
| The driver is paid | **£115** | **£115** |

**The driver is unaffected either way.** The whole difference is £5.75 to the
customer on a £115 job — about 4%.

Why live is on "keep": his margin bands (*free accounts 20–30%, paid accounts
minimum 10–15%*) can only be true if the percentage is what HAF keeps. Under
add-on, a "20%" job leaves HAF keeping 16.7%, below his own band.

Why the new document says add-on: it defines the fee as a markup on the driver
price, and its worked examples do the arithmetic that way throughout.

**This is one word in the config** — `feeBasis` — and both settings are tested
and reconcile. It is Brent's call, not mine, because it moves every customer
price by ~4%.

---

## 7. Where each rule came from

- Four revenue streams, gross profit formula, the §12 rules: **Brent's "HAF
  Network Pricing Formula", 2026-08-02** (document b34c0c47).
- Vehicle ladder, job-type fees, account reductions, pools, lanes:
  **PRICING_FRAMEWORK_V7**, 2026-08-02 — live.
- CleverPay charges on invoice only, and is not a HAF pricing lever:
  **Brent, 2026-07-29** (wiki `cleverpay-fee-rule-invoice-only`).
- Driver reward paused and HAF-funded: **Brent, 2026-08-02** — *"offering more
  for a driver isn't right ... i'm happy to take less margin for HAF then make
  the customers pay more."*

**Checked, not claimed:** `node admin/revenue-model-v1.test.js` — 114 checks.
Full pricing suite re-run alongside it: 170 + 50 + 126 + 51 + 24 = **421**, all
passing. Nothing customer-facing changed, so no customer price moved.
