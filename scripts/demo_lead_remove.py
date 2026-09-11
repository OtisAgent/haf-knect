#!/usr/bin/env python3
"""Take one address back out of the demo sign-up list.

WHY THIS EXISTS.
The visitor walk goes in through the REAL front door on purpose — a probe through
a side entrance proves nothing about the door a person uses. But that means my own
test address is born looking exactly like a real lead, and the nightly sync would
put it in front of Brent as a warm contact and email it an access code.

On 11 Sep one of mine reached the live table and I took it out by hand. By hand is
not a control, so the walk now calls this and says what it removed.

Run:  python3 scripts/demo_lead_remove.py <email>
Exit: 0 removed (or nothing to remove), 1 could not tell — never "probably fine".
"""
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_demo_showroom as build  # noqa: E402  (its reader knows the database)


def main():
    if len(sys.argv) != 2 or "@" not in sys.argv[1]:
        print("usage: demo_lead_remove.py <email>", file=sys.stderr)
        return 1
    email = sys.argv[1]

    # A test address, and nothing else. A cleanup that can reach a real lead is a
    # worse problem than the one it is solving.
    if not (email.startswith("otis-") and email.endswith("@usehaf.co.uk")):
        print("refusing: %s is not one of my own test addresses (otis-…@usehaf.co.uk)"
              % email, file=sys.stderr)
        return 1

    try:
        url = build.dburl()
    except build.ReadFailed as e:
        print("could not reach the demo list to clean up: %s" % e, file=sys.stderr)
        return 1

    p = subprocess.run(["psql", url, "-At", "-c",
                        "delete from public.knect_demo_lead where email = %s;"
                        % sql_quote(email)],
                       capture_output=True, text=True)
    if p.returncode != 0:
        print("cleanup failed: %s" % (p.stderr.strip() or p.stdout.strip()), file=sys.stderr)
        return 1
    print(p.stdout.strip() or "DELETE 0")
    return 0


def sql_quote(s):
    return "'%s'" % s.replace("'", "''")


if __name__ == "__main__":
    raise SystemExit(main())
