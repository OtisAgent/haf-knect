#!/usr/bin/env python3
"""
READ THE LIVE PRICING MATRIX. The Demo Centre never types a rate from memory.

Brent, 11 Sep: "put the pricing engine behind it the new pricing matrix".

Two reads, and they have to agree:

  /api/pricing                  what the live network is quoting with right now
  admin/pricing-matrix-v3.js    the engine this build runs to produce the example
                                prices (via scripts/quote_grid.mjs)

If the two versions differ the build REFUSES. That is the whole guard: a Demo
Centre quoting MATRIX-V8 while the product has moved to V9 would be a price
promised on a call that the product will not honour.

What comes back here is deliberately the CUSTOMER's half of the matrix — the
vehicle ladder, the service levels, the extras, VAT. HAF's own commercials live
in the same response (what each job type earns, the fee floor, the pool splits)
and this module does not return them, so they cannot reach the page by accident.

Run on its own to see what the live matrix currently says:

    python3 scripts/demo_pricing_read.py
"""
import json
import pathlib
import re
import sys
import urllib.request

API = "https://knect.usehaf.co.uk/api/pricing"
ENGINE = pathlib.Path(__file__).resolve().parent.parent / "admin" / "pricing-matrix-v3.js"

UA = {"User-Agent": "HAF-demo-build/1.0 (+usehaf.co.uk)"}


class ReadFailed(Exception):
    """A live read the page depends on did not come back — never draw a guess."""


def live_matrix():
    try:
        req = urllib.request.Request(API, headers=UA)
        with urllib.request.urlopen(req, timeout=45) as r:
            body = json.loads(r.read().decode("utf8", "replace"))
    except Exception as e:
        raise ReadFailed("could not read the live pricing matrix at %s — %s" % (API, e))
    if not body.get("ok") or not body.get("config"):
        raise ReadFailed("%s answered, but not with a pricing framework" % API)
    return body


def engine_version():
    """The version of the engine file this build actually runs."""
    if not ENGINE.exists():
        raise ReadFailed("the pricing engine is not in this checkout at %s" % ENGINE)
    m = re.search(r'version:\s*"([^"]+)"', ENGINE.read_text(encoding="utf8"))
    if not m:
        raise ReadFailed("the pricing engine file does not state its version")
    return m.group(1)


def money(n):
    """£5 not £5.00, £12.50 stays £12.50."""
    f = float(n)
    return "£%d" % int(f) if f == int(f) else "£%.2f" % f


def read():
    live = live_matrix()
    cfg = live["config"]
    v_live, v_file = live.get("version"), engine_version()
    if v_live != v_file:
        raise ReadFailed(
            "the live network is quoting %s but this build's engine is %s. The Demo "
            "Centre would show prices the product will not honour. Update the engine "
            "file from the live site before building." % (v_live, v_file))

    veh = [v for v in cfg.get("vehicles", []) if v.get("active") is not False]
    if len(veh) < 4:
        raise ReadFailed("the live matrix lists only %d vehicles" % len(veh))
    jobs = [j for j in cfg.get("jobTypes", []) if j.get("active")]
    if len(jobs) < 2:
        raise ReadFailed("the live matrix lists only %d live service levels" % len(jobs))

    h = cfg.get("hindrance") or {}
    fuel = cfg.get("fuel") or {}
    local = cfg.get("localHandling") or {}
    acc = cfg.get("accountLevels") or {}

    for key, where in (("stopFeeGbp", h), ("waitingPerHourGbp", h),
                       ("maxAutoMultiplier", h), ("maxUpliftPct", fuel),
                       ("bandAtMiles", local), ("maxReductionPct", local)):
        if where.get(key) is None:
            raise ReadFailed("the live matrix has no %s any more" % key)
    if cfg.get("vatPct") is None:
        raise ReadFailed("the live matrix does not state VAT")

    return {
        "version": v_live,
        "effective_from": live.get("effectiveFrom") or cfg.get("effectiveFrom"),
        "vat_pct": cfg["vatPct"],
        # name + the smallest this vehicle is ever charged at. baseRate is the
        # ladder between vehicles and is shown as a multiple of a small van,
        # which is how a customer reads it anyway.
        "vehicles": [{"name": v["name"], "rate": v["baseRate"],
                      "min": v["minTransportValue"]} for v in veh],
        "job_types": [{"name": j["name"],
                       "premium_pct": round((float(j.get("servicePremiumMult") or 1) - 1) * 100)}
                      for j in jobs],
        "extras": {
            "stop": money(h["stopFeeGbp"]),
            "waiting": money(h["waitingPerHourGbp"]),
            "cap_pct": round((float(h["maxAutoMultiplier"]) - 1) * 100),
            "weight_max_pct": round((max(float(x) for x in (h.get("weight") or {1: 1}).values()) - 1) * 100),
            "handling_max_pct": round((max(float(x) for x in (h.get("handling") or {1: 1}).values()) - 1) * 100),
        },
        "fuel": {
            "cap_pct": fuel["maxUpliftPct"],
            "trigger_pct": fuel.get("surgeThresholdPct"),
            "at_pump": fuel.get("currentPencePerLitre"),
            "market": fuel.get("marketAvgPencePerLitre"),
        },
        "local": {
            "band_miles": local["bandAtMiles"],
            "full_from_miles": local.get("fullMinimumFromMiles"),
            "max_off_pct": local["maxReductionPct"],
        },
        # 0 / 2.5 / 5 points. The POINTS are not put on the page — what the page
        # shows is the price difference they make, which is the same fact in the
        # language a customer uses.
        "account_levels": {k: {"name": v.get("name"), "rank": v.get("rank")}
                           for k, v in acc.items()},
    }


if __name__ == "__main__":
    try:
        print(json.dumps(read(), indent=2))
    except ReadFailed as e:
        print("READ FAILED: %s" % e, file=sys.stderr)
        raise SystemExit(1)
