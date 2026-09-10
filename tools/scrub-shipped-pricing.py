#!/usr/bin/env python3
"""Ship the pricing engine without shipping Brent's reasoning.

WHY THIS EXISTS
---------------
10 Sep 2026. Anyone could fetch https://knect.usehaf.co.uk/admin/pricing-matrix-v3.js
with no login and read the margin model complete with its own footnotes: names
against dated rulings, quoted decisions, superseded fee structures kept "so none
of them creeps back in".

The obvious fix — put /admin/ behind the owner sign-in — is WRONG here, and
checking saved me from breaking quoting for every customer. The public KNECT app
loads five of these files itself:

    index.html:11     admin/lane-factors-v1.js
    index.html:12837  admin/account-fees-v1.js
    index.html:12838  admin/pro-crown.js
    index.html:12840  admin/tier-identity-v1.js
    index.html:12875  admin/pricing-matrix-v3.js

Quoting happens in the browser, so the engine MUST be public. Which makes the
real rule the other one: **what ships carries no human commentary.** The numbers
have to be readable. The reasoning does not, and 78KB of it was going out with
them — 107 lines naming Brent or carrying a decision date.

WHAT IT DOES
------------
Removes comments from the five shipped engine files and keeps the fully-commented
originals under `.decisions/pricing-source/`. A leading dot means Cloudflare Pages
does not publish the folder, so our reasoning stays in the repo and out of the
browser. Nothing about the code changes: same statements, same numbers.

WHY A CHARACTER SCANNER AND NOT A REGEX
---------------------------------------
These files contain 44 backticks between them, so template literals span lines,
and a line-based stripper would happily delete a line of template content that
starts with `//` or `*`. It also has to survive a regex literal containing a
slash. So this walks the file one character at a time tracking which of quote /
template / regex / comment it is inside — and then every output is put through
`node --check` and the seven-file test suite before it is allowed to replace
anything. The tests are the proof, not the scanner.

Usage:  python3 tools/scrub-shipped-pricing.py [--apply]
Without --apply it reports and writes nothing.
"""
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEEP = os.path.join(REPO, ".decisions", "pricing-source")

# Exactly the files a browser is served. pro-crown.js is in the app's script
# list too but holds no commentary worth stripping; it is included so the rule is
# "every shipped engine file", not "the ones I happened to look at".
SHIPPED = ["admin/account-fees-v1.js", "admin/pricing-matrix-v3.js",
           "admin/lane-factors-v1.js", "admin/tier-identity-v1.js",
           "admin/revenue-model-v1.js", "admin/pro-crown.js",
           # Added after the first pass: it is loaded by index.html too and
           # carried a quoted instruction of Brent's in its header comment. The
           # list is "every engine file a browser is served", so anything new
           # under admin/ that index.html loads belongs here.
           "admin/tier-marks-v1.js"]

# 🔴 Scrubbing admin/ alone would have left the leak wide open. demo/ is a full
# second copy of the engine and it is SERVED: /demo/admin/pricing-matrix-v3.js
# answered 200 with all 65,042 original bytes while admin/ was already clean. Any
# copy a browser can fetch belongs in this list, so the list is built from what is
# on disk rather than from what I remembered putting there.
import glob as _glob
SHIPPED += sorted(
    os.path.relpath(p, REPO) for p in _glob.glob(os.path.join(REPO, "demo", "admin", "*.js"))
    if not p.endswith((".test.js", ".RETIRED.js")))

# The suites live under .tests/ — a dot folder, so Cloudflare Pages does not
# publish them. They used to sit in admin/ and were fetchable by anyone: 163KB
# spelling out the pricing rules in plain English with their expected values.
TESTS = [".tests/account-fees-v1.test.js", ".tests/fee-basis-lock.test.js",
         ".tests/lane-and-margin-v6.test.js", ".tests/pricing-framework-v6.test.js",
         ".tests/revenue-model-v1.test.js", ".tests/tier-identity-v1.test.js",
         ".tests/pricing-database.test.mjs"]

# A slash that follows one of these can only start a regex literal, never divide.
REGEX_OK_AFTER = set("(,=:[!&|?{};+-*%~^") | {"\n"}


def strip_comments(src):
    """Remove // and /* */ comments, leaving everything else byte-identical."""
    out = []
    i, n = 0, len(src)
    quote = None          # ' " or ` when inside a string
    in_regex = False
    depth_tpl = []        # ${ } nesting inside template literals
    prev_significant = "\n"

    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""

        if quote:
            out.append(c)
            if c == "\\":
                if i + 1 < n:
                    out.append(nxt)
                    i += 2
                    continue
            elif c == quote:
                quote = None
            elif quote == "`" and c == "$" and nxt == "{":
                out.append(nxt)
                depth_tpl.append("`")
                quote = None
                i += 2
                continue
            i += 1
            continue

        if in_regex:
            out.append(c)
            if c == "\\":
                if i + 1 < n:
                    out.append(nxt)
                    i += 2
                    continue
            elif c == "/":
                in_regex = False
            elif c == "\n":
                # An unterminated regex cannot cross a line: we misread it.
                in_regex = False
            i += 1
            continue

        if c == "/" and nxt == "/":
            while i < n and src[i] != "\n":
                i += 1
            continue

        if c == "/" and nxt == "*":
            i += 2
            while i < n and not (src[i] == "*" and i + 1 < n and src[i + 1] == "/"):
                i += 1
            i += 2
            continue

        if c in "'\"`":
            quote = c
            out.append(c)
            prev_significant = c
            i += 1
            continue

        if c == "/" and prev_significant in REGEX_OK_AFTER:
            in_regex = True
            out.append(c)
            i += 1
            continue

        if c == "}" and depth_tpl:
            depth_tpl.pop()
            out.append(c)
            quote = "`"
            i += 1
            continue

        out.append(c)
        if not c.isspace():
            prev_significant = c
        elif c == "\n":
            prev_significant = "\n"
        i += 1

    # Comment removal leaves runs of blank lines. Collapse them to one: they are
    # structure for a reader and bytes to everyone else.
    lines, cleaned = out and "".join(out).split("\n") or [], []
    for line in lines:
        if line.strip() == "" and cleaned and cleaned[-1].strip() == "":
            continue
        cleaned.append(line.rstrip())
    return "\n".join(cleaned)


def node_check(path):
    r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
    return r.returncode == 0, (r.stderr or "").strip().splitlines()[:2]


def run_tests():
    """The seven suites, all of them. Returns (passed, failed, detail)."""
    passed, failed, detail = 0, 0, []
    for t in TESTS:
        p = os.path.join(REPO, t)
        if not os.path.exists(p):
            detail.append("%s MISSING" % t)
            failed += 1
            continue
        r = subprocess.run(["node", "--test", p], capture_output=True, text=True,
                           cwd=REPO)
        if r.returncode == 0:
            passed += 1
        else:
            failed += 1
            tail = [l for l in (r.stdout or "").splitlines()
                    if l.startswith("# fail") or "not ok" in l][:3]
            detail.append("%s FAILED: %s" % (t, " | ".join(tail)))
    return passed, failed, detail


def main():
    apply = "--apply" in sys.argv

    base_pass, base_fail, base_detail = run_tests()
    print("baseline suite: %d passed, %d failed" % (base_pass, base_fail))
    for d in base_detail:
        print("   ", d)
    if base_fail:
        # Never scrub on top of an already-red suite: a failure afterwards would
        # be unattributable, and "it was already broken" is not something I get
        # to claim after the fact.
        sys.exit("refusing to scrub while the suite is already red")

    os.makedirs(KEEP, exist_ok=True)
    plan, before, after = [], 0, 0
    for rel in SHIPPED:
        src_path = os.path.join(REPO, rel)
        if not os.path.exists(src_path):
            print("  MISSING  %s" % rel)
            continue
        original = open(src_path, encoding="utf-8").read()
        scrubbed = strip_comments(original)

        # Keep the .js extension: `node --check` refuses an unknown one, which
        # reads as a syntax error in the file rather than a naming mistake here.
        tmp = src_path.rsplit(".", 1)[0] + ".scrubcheck.js"
        open(tmp, "w", encoding="utf-8").write(scrubbed)
        ok, err = node_check(tmp)
        if not ok:
            os.unlink(tmp)
            sys.exit("node --check refused the scrubbed %s: %s" % (rel, err))

        before += len(original.encode())
        after += len(scrubbed.encode())
        plan.append((rel, src_path, tmp, original, scrubbed))
        print("  ok  %-30s %7d -> %7d bytes  (-%d)"
              % (rel, len(original.encode()), len(scrubbed.encode()),
                 len(original.encode()) - len(scrubbed.encode())))

    print("\nshipped engine: %d -> %d bytes, %d removed"
          % (before, after, before - after))

    if not apply:
        for _, _, tmp, _, _ in plan:
            os.unlink(tmp)
        print("\nreport only — nothing written. Re-run with --apply.")
        return 0

    for rel, src_path, tmp, original, scrubbed in plan:
        keep_at = os.path.join(KEEP, os.path.basename(rel))
        # NEVER overwrite a kept original. A second run reads the already-scrubbed
        # file as "the original" and would quietly replace the only copy of the
        # reasoning with a copy that has none of it — the one irreversible move in
        # this whole script.
        if not os.path.exists(keep_at):
            open(keep_at, "w", encoding="utf-8").write(original)
        else:
            print("  kept copy already exists, left alone: %s"
                  % os.path.basename(rel))
        os.replace(tmp, src_path)
    print("\noriginals kept in .decisions/pricing-source/ (a dot folder, so Pages "
          "does not publish it)")

    p, f, detail = run_tests()
    print("after scrub: %d passed, %d failed" % (p, f))
    for d in detail:
        print("   ", d)
    if f:
        print("!! THE SUITE WENT RED. Restore from .decisions/pricing-source/ "
              "before publishing anything.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
