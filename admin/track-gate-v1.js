/* ============================================================================
 * HAF — TRACK GATE  (TRACK-GATE-V1)
 *
 * The one gate that decides when a map is allowed back on screen.
 *
 * Brent, 29 Jul 2026: "Map only comes back on track of the jobs — i like it as
 * it is. Allow the same tracking system as before, the drivers just need to
 * share their location, select it on the track portal to track the route for
 * the driver."
 *
 * SO THERE ARE EXACTLY TWO WAYS A MAP EXISTS ON THIS PLATFORM
 *   1. A driver looking at the job they are working. They need the road.
 *   2. An account TRACKING ONE OF ITS OWN JOBS, and only while the driver on
 *      that job is actually sharing their location. Tracking is the map's only
 *      remaining reason to exist for a posting account.
 *
 * WHAT THIS GATE DELIBERATELY CANNOT DO
 *   It answers about ONE job at a time and nothing else — every answer carries
 *   scope:'job'. There is no code path here that returns a network map, a driver
 *   directory or a coverage board, so the tracking feature cannot become a back
 *   door to the network view that was taken out on 29 Jul. Those panes are still
 *   removed from the document for posting accounts; this gate never puts a node
 *   back, it only ever says yes or no to one job's route.
 *
 * THE RULES IT ENFORCES
 *   - No driver on the job yet -> no map. There is nothing to track.
 *   - Driver assigned but not sharing -> no map, and we say so plainly rather
 *     than showing an empty one.
 *   - Sharing has gone quiet (older than the freshness window) -> no map. A
 *     last-known dot left on screen is a lie that ages badly.
 *   - Delivered or closed -> no map. The proof of delivery is the record now.
 *   - Fresh position -> map allowed, for THIS job only.
 *   - An unknown role is treated as a posting account, never as a driver. If we
 *     are not sure who is asking, they get the strictest answer.
 *   - Consent lives with the driver: sharing is theirs to start and stop, so a
 *     'no' from this gate is a normal state, never an error to work around.
 *
 * Freshness windows, and why they differ:
 *   live position — 5 minutes. A moving van posts every few seconds; 5 minutes
 *   of silence means the screen is off, the signal is gone, or sharing stopped.
 *   dropped pin   — 60 minutes. A pin is one deliberate "here I am", not a
 *   stream, so it stays useful far longer than a stalled live feed.
 *
 * Works in browser + Node. No dependencies.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HAFTrackGate = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FRESH_LIVE_SEC = 300;   /* 5 minutes  */
  var FRESH_PIN_SEC = 3600;   /* 60 minutes */

  /* the placeholders the job records use when nobody is assigned yet */
  var NO_DRIVER = ["", "-", "—", "--", "tbc", "none", "unassigned"];
  var FINISHED = ["delivered", "closed", "cancelled"];
  var DRIVER_ROLES = ["driver"];

  function txt(v) { return String(v == null ? "" : v).trim(); }

  function hasDriver(job) {
    var n = txt(job && job.driverName).toLowerCase();
    return n !== "" && NO_DRIVER.indexOf(n) === -1;
  }

  function isFinished(job) {
    return FINISHED.indexOf(txt(job && job.status).toLowerCase()) !== -1;
  }

  /* plain-words age — the customer reads this, not a number of seconds */
  function ago(sec) {
    var s = Number(sec);
    if (!isFinite(s) || s < 0) return "";
    if (s < 10) return "just now";
    if (s < 60) return Math.round(s) + " seconds ago";
    var m = Math.round(s / 60);
    if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
    var h = Math.round(m / 60);
    return h + (h === 1 ? " hour ago" : " hours ago");
  }

  /* is what the tracker sent us still worth drawing? */
  function isFresh(feed) {
    if (!feed || feed.found === false) return false;
    var age = Number(feed.ageSec);
    if (!isFinite(age) || age < 0) return false;
    var kind = txt(feed.kind).toLowerCase() === "pin" ? "pin" : "live";
    return age <= (kind === "pin" ? FRESH_PIN_SEC : FRESH_LIVE_SEC);
  }

  function driverLabel(job) {
    return hasDriver(job) ? txt(job.driverName) : "The driver";
  }

  /* ── THE GATE ───────────────────────────────────────────────────────────── */
  function decide(o) {
    o = o || {};
    var role = txt(o.role).toLowerCase();
    var job = o.job || null;
    var feed = o.feed || null;
    var who = driverLabel(job);
    var out = { scope: "job", jobId: txt(job && job.id), mapAllowed: false, state: "", message: "", age: "" };

    if (!job) { out.state = "no-job"; out.message = "Open a job to track it."; return out; }

    /* 1. the driver working it — the road is theirs, nothing to gate */
    if (DRIVER_ROLES.indexOf(role) !== -1) {
      out.mapAllowed = true;
      out.state = "driver-road";
      out.message = "Your route for this job.";
      return out;
    }

    /* 2. everyone else is a posting account, tracking one job of their own */
    if (isFinished(job)) {
      out.state = "finished";
      out.message = "This one is complete — the proof of delivery is on this page.";
      return out;
    }
    if (!hasDriver(job)) {
      out.state = "no-driver";
      out.message = "No driver on this job yet, so there is nothing to track.";
      return out;
    }
    if (!feed || feed.found === false || feed.ageSec == null) {
      out.state = "waiting";
      out.message = who + " has not shared their location yet. The moment they do, you can follow the route here.";
      return out;
    }
    if (!isFresh(feed)) {
      out.age = ago(feed.ageSec);
      out.state = "stale";
      out.message = who + " last shared " + out.age + " — no live map until they share again.";
      return out;
    }

    out.mapAllowed = true;
    out.age = ago(feed.ageSec);
    out.state = "trackable";
    out.message = who + " is sharing — updated " + out.age + ".";
    return out;
  }

  /* ── THE PORTAL LIST — what you pick from before you track ───────────────
     One row per job the account can track, each saying whether its driver is
     sharing right now. feeds is a plain map of jobId -> the tracker's answer.
     Finished jobs are left out: their record is the proof, not a route. */
  function options(jobs, feeds, opts) {
    opts = opts || {};
    var role = txt(opts.role).toLowerCase();
    feeds = feeds || {};
    return (jobs || []).filter(function (j) { return j && !isFinished(j); }).map(function (j) {
      var d = decide({ role: role, job: j, feed: feeds[txt(j.id)] });
      return {
        id: txt(j.id),
        route: txt(j.from && j.from.name) + " → " + txt(j.to && j.to.name),
        driver: hasDriver(j) ? txt(j.driverName) : "",
        trackable: d.mapAllowed,
        state: d.state,
        note: d.state === "trackable" ? "sharing now" :
              d.state === "stale" ? "shared " + d.age :
              d.state === "no-driver" ? "no driver yet" : "not sharing",
        label: txt(j.id) + " · " + (hasDriver(j) ? txt(j.driverName) : "no driver yet")
      };
    });
  }

  function anyTrackable(list) {
    return (list || []).some(function (r) { return r && r.trackable; });
  }

  return {
    FRESH_LIVE_SEC: FRESH_LIVE_SEC,
    FRESH_PIN_SEC: FRESH_PIN_SEC,
    decide: decide,
    options: options,
    anyTrackable: anyTrackable,
    ago: ago,
    isFresh: isFresh,
    hasDriver: hasDriver,
    isFinished: isFinished
  };
});
