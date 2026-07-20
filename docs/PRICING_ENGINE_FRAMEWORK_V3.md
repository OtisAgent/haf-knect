# HAF KNECT Pricing Engine — FRAMEWORK V3

**Status:** Agreed with Brent 2026-07-20 · implemented in `pricing-matrix-v3.js` · 33/33 tests passing (`pricing-matrix-v3.test.js`)
**Lives in:** the KNECT back office — every order in Quotes & Approvals flows through it before a price is sent.

---

## The model in one picture

```
PLNA (driver side)     |    HAF MARGIN     |   KNECT (customer side)
Free   0% uplift       |  firm % by job    |   Free   0% uplift · 3 direct bookings/mo
Plus   2.5% uplift     |  type, floors     |   Member 5% uplift · unlimited direct
Pro    5% uplift       |  always held      |          (£50 one-off, for life)
```

Either side of the margin is determined by the account they hold. The two sides
never stack — the **higher** uplift wins. Customers are never discounted;
commitment buys the driver a better rate and buys the customer priority,
access and direct-booking freedom.

## Locked rules (change = version bump + Brent's sign-off)

1. **Formula:** driver pay = miles × vehicle base rate × hindrance multiplier + supplements, then uplift; customer = driver pay ÷ (1 − margin%), + 20% VAT.
2. **Margins are firm by job type** — Groupage 10% (floor 8), Flex Same-Day 15% (10), Standard Same-Day 20% (15), Timed 25% (18), Urgent 30% (22). No account ever buys through a floor.
3. **Uplift viability:** a tier uplift is withheld (and logged) if it would push margin under the job-type floor.
4. **Market band:** price more than 15% above the local median → manual review. We never price drivers out of their area's market.
5. **Hindrance pays the driver** (weight, handling, stops £5, waiting £15/h), automated cap 1.40x → manual review above.
6. **Fuel protection:** live price ≥8% over market average → base rates +4% automatically (max +10%). Logged, not announced — it's a guardrail, not a tier change.
7. **Direct bookings:** HAF margin 0%. KNECT Free = 3/month then gated; Member = unlimited. This is the anti-bypass gate.
8. **Minimum network charge:** £40 + VAT.
9. **Vehicles:** Small Van → Luton only (£0.75 / 0.85 / 0.95 / 1.05 / 1.10 / 1.20 per loaded mile). No bikes, no cars.
10. **Every calculation returns a full audit record** — inputs, rates, uplift decision, flags, reasons, override, pools. Transparent and auditable, always.

## Network pools

- **TRIAL phase (now):** 25% of HAF margin flows back — affiliate 7, driver pool 7, freight pool 6, relay & storage 5 (pts of margin). Funds the network build: referral rewards, driver bonuses, freight incentives, container collective.
- **PRODUCTION phase (after builder criteria):** locked 5% — driver pool 2.5 / relay & storage 2.5.
- Both splits are computed on **every** job so "who would have got what" is always answerable.
- Pool **access** is a KNECT Member benefit (affiliate rewards, freight pooling, container collective).

## Flexible within the frame (no announcements needed)

- Fuel marker values (market avg, live price, thresholds)
- Local market medians per lane
- Per-account margin overrides — admin only, **reason required**, clamped at the job-type floor, logged to the audit trail
- Pool split percentages and phase flag

## Stability promise

The structure above does not change casually. If the framework itself must
change: version bump (V3 → V3.1), effective date, advance notice, quarterly
review cadence at most. Drivers and customers can plan on it.

## Where things live

- `pricing-matrix-v3.js` — the engine (config + price() + demo scenarios)
- `pricing-matrix-v3.test.js` — 33-test regression suite (must pass before deploy)
- `app.html` → Quotes & Approvals — the embedded order-flow matrix, override panel, audit trail
- tier_config seed v3 (DB mirror) — pending promotion once Brent approves the preview
