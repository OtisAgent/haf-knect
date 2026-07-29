/* Track Gate V1 — regression tests. Run: node track-gate-v1.test.js
 *
 * What these prove: a posting account only ever gets a map while it is tracking
 * one of its own jobs AND that job's driver is actually sharing — and that the
 * tracking feature can never hand back the network view that was taken out on
 * 29 Jul 2026.
 */
"use strict";
var G = require("./track-gate-v1.js");
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? " — " + JSON.stringify(extra) : "")); }
}

function job(over) {
  return Object.assign({
    id: "HAF-2858", status: "transit", driverName: "James W.",
    from: { name: "Sheffield S1" }, to: { name: "Leeds LS1" }
  }, over || {});
}
var LIVE_NOW = { found: true, kind: "live", ageSec: 4 };

console.log("Track Gate V1\n");

// ---------------------------------------------------------------------------
console.log("1. THE DRIVER KEEPS THEIR ROAD");
// ---------------------------------------------------------------------------
var d = G.decide({ role: "driver", job: job(), feed: null });
ok("a driver gets the map with no feed at all", d.mapAllowed === true, d);
ok("the driver's state is their own road", d.state === "driver-road", d);
ok("a driver on a job with no position still gets the map",
  G.decide({ role: "driver", job: job({ driverName: "—" }), feed: null }).mapAllowed === true);

// ---------------------------------------------------------------------------
console.log("\n2. A POSTING ACCOUNT GETS NO MAP UNTIL SOMEONE IS SHARING");
// ---------------------------------------------------------------------------
["business", "freight"].forEach(function (role) {
  ok(role + ": no feed means no map",
    G.decide({ role: role, job: job(), feed: null }).mapAllowed === false);
  ok(role + ": the tracker saying 'nobody here' means no map",
    G.decide({ role: role, job: job(), feed: { found: false } }).mapAllowed === false);
  ok(role + ": a fresh live position opens the map",
    G.decide({ role: role, job: job(), feed: LIVE_NOW }).mapAllowed === true);
});
ok("the waiting message names the driver so it reads like a person",
  G.decide({ role: "business", job: job(), feed: null }).message.indexOf("James W.") === 0);
ok("the waiting message never blames the customer or sounds like an error",
  !/error|failed|denied/i.test(G.decide({ role: "business", job: job(), feed: null }).message));

// ---------------------------------------------------------------------------
console.log("\n3. NO DRIVER, NOTHING TO TRACK");
// ---------------------------------------------------------------------------
["—", "-", "", "  ", "TBC", "unassigned"].forEach(function (n) {
  var r = G.decide({ role: "business", job: job({ driverName: n }), feed: LIVE_NOW });
  ok("driverName " + JSON.stringify(n) + " is treated as nobody assigned",
    r.mapAllowed === false && r.state === "no-driver", r);
});
ok("an unassigned job says so in plain words",
  G.decide({ role: "business", job: job({ driverName: "—" }) }).message.indexOf("nothing to track") !== -1);

// ---------------------------------------------------------------------------
console.log("\n4. A STALLED FEED IS NOT A LIVE ONE");
// ---------------------------------------------------------------------------
ok("a live position 4 minutes old still counts",
  G.decide({ role: "business", job: job(), feed: { found: true, kind: "live", ageSec: 240 } }).mapAllowed === true);
ok("a live position 6 minutes old does not",
  G.decide({ role: "business", job: job(), feed: { found: true, kind: "live", ageSec: 360 } }).mapAllowed === false);
ok("exactly on the 5-minute line still counts",
  G.decide({ role: "business", job: job(), feed: { found: true, kind: "live", ageSec: 300 } }).mapAllowed === true);
ok("a dropped pin lasts an hour",
  G.decide({ role: "business", job: job(), feed: { found: true, kind: "pin", ageSec: 3000 } }).mapAllowed === true);
ok("a dropped pin older than an hour does not",
  G.decide({ role: "business", job: job(), feed: { found: true, kind: "pin", ageSec: 4000 } }).mapAllowed === false);
ok("a stale feed says when they last shared, not a bare 'unavailable'",
  /last shared/.test(G.decide({ role: "business", job: job(), feed: { found: true, kind: "live", ageSec: 900 } }).message));
ok("a feed with no age is treated as no feed",
  G.decide({ role: "business", job: job(), feed: { found: true, kind: "live" } }).state === "waiting");
ok("a nonsense age never opens the map",
  G.decide({ role: "business", job: job(), feed: { found: true, ageSec: "soon" } }).mapAllowed === false);
ok("a negative age never opens the map",
  G.decide({ role: "business", job: job(), feed: { found: true, ageSec: -50 } }).mapAllowed === false);

// ---------------------------------------------------------------------------
console.log("\n5. A FINISHED JOB IS A RECORD, NOT A ROUTE");
// ---------------------------------------------------------------------------
["delivered", "closed", "cancelled"].forEach(function (s) {
  var r = G.decide({ role: "business", job: job({ status: s }), feed: LIVE_NOW });
  ok(s + " jobs get no map even with a fresh position", r.mapAllowed === false && r.state === "finished", r);
});
ok("the finished message points at the proof of delivery",
  /proof of delivery/i.test(G.decide({ role: "business", job: job({ status: "delivered" }) }).message));

// ---------------------------------------------------------------------------
console.log("\n6. THE STRICTEST ANSWER WHEN WE ARE NOT SURE WHO IS ASKING");
// ---------------------------------------------------------------------------
["", "  ", "admin", "fleet", "DRIVERS", "driverx", "owner", "guest", null, undefined].forEach(function (r) {
  ok("role " + JSON.stringify(r) + " is not treated as the driver",
    G.decide({ role: r, job: job(), feed: null }).mapAllowed === false);
});
ok("stray case and spacing around a real role still resolves it",
  G.decide({ role: " Driver ", job: job(), feed: null }).state === "driver-road");
ok("but an unknown role tracking a sharing driver on its own job still works",
  G.decide({ role: "fleet", job: job(), feed: LIVE_NOW }).mapAllowed === true);
ok("no job at all is answered, not thrown",
  G.decide({ role: "business", job: null, feed: LIVE_NOW }).state === "no-job");
ok("an empty call is answered, not thrown", G.decide().mapAllowed === false);

// ---------------------------------------------------------------------------
console.log("\n7. THE GATE CAN ONLY EVER TALK ABOUT ONE JOB");
// ---------------------------------------------------------------------------
var samples = [
  G.decide({ role: "driver", job: job(), feed: LIVE_NOW }),
  G.decide({ role: "business", job: job(), feed: LIVE_NOW }),
  G.decide({ role: "freight", job: job({ status: "delivered" }), feed: LIVE_NOW }),
  G.decide({ role: "business", job: job(), feed: null })
];
ok("every answer is scoped to one job", samples.every(function (r) { return r.scope === "job"; }));
ok("every answer names the job it is about",
  samples.every(function (r) { return r.jobId === "HAF-2858"; }));
ok("no answer can ask for a network map",
  samples.every(function (r) { return !/network|directory|coverage/i.test(JSON.stringify(r)); }));
ok("the gate exposes no way to widen the scope",
  Object.keys(G).every(function (k) { return !/network|all|everyone/i.test(k); }), Object.keys(G));

// ---------------------------------------------------------------------------
console.log("\n8. THE PORTAL LIST YOU PICK FROM");
// ---------------------------------------------------------------------------
var JOBS = [
  job(),
  job({ id: "HAF-2861", driverName: "David H.", status: "assigned" }),
  job({ id: "HAF-2870", driverName: "—", status: "awaiting" }),
  job({ id: "HAF-2851", driverName: "David H.", status: "delivered" })
];
var feeds = { "HAF-2858": LIVE_NOW, "HAF-2861": { found: true, kind: "live", ageSec: 1200 } };
var list = G.options(JOBS, feeds, { role: "business" });
ok("finished jobs are left off the tracking list", list.length === 3, list.map(function (r) { return r.id; }));
ok("the sharing job is offered", list[0].trackable === true && list[0].note === "sharing now");
ok("the quiet job is listed but not trackable", list[1].trackable === false);
ok("the quiet job says when it last shared", /^shared /.test(list[1].note), list[1].note);
ok("the driverless job says so", list[2].note === "no driver yet" && list[2].trackable === false);
ok("each row reads as a person, not an id", list[0].label === "HAF-2858 · James W.");
ok("each row carries its route in plain words", list[0].route === "Sheffield S1 → Leeds LS1");
ok("the portal knows when something is trackable", G.anyTrackable(list) === true);
ok("the portal knows when nothing is", G.anyTrackable(G.options(JOBS, {}, { role: "business" })) === false);
ok("an empty job list is answered, not thrown", G.options(null, null, {}).length === 0);
ok("a driver's list is not the tracking portal — every own job is their road",
  G.options(JOBS, {}, { role: "driver" }).every(function (r) { return r.trackable === true; }));

// ---------------------------------------------------------------------------
console.log("\n9. HOW LONG AGO, IN WORDS A CUSTOMER READS");
// ---------------------------------------------------------------------------
ok("under 10 seconds is 'just now'", G.ago(3) === "just now");
ok("seconds are seconds", G.ago(42) === "42 seconds ago");
ok("one minute is singular", G.ago(60) === "1 minute ago");
ok("minutes are minutes", G.ago(300) === "5 minutes ago");
ok("an hour is singular", G.ago(3600) === "1 hour ago");
ok("hours are hours", G.ago(7500) === "2 hours ago");
ok("nonsense gives nothing rather than 'NaN ago'", G.ago("later") === "" && G.ago(-4) === "");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
