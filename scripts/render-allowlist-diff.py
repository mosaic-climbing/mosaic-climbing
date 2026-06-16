#!/usr/bin/env python3
"""Render a human-readable allowlist-diff section for the calendar-allowlist
GitHub Action's PR body.

Pipes `git diff src/portal-visible-plan-ids.js` into stdin, joins the +/-
planId lines against a plans catalog JSON (StorefrontPlansQuery result),
emits a markdown section listing the added/removed programs by name + slug
on stdout.

Usage (in the workflow):

    git --no-pager diff src/portal-visible-plan-ids.js \\
      | python3 scripts/render-allowlist-diff.py /tmp/plans.json \\
      > /tmp/named-diff.md

When a planId in the diff isn't in the catalog (e.g. the plan was archived
upstream and no longer appears in `plans(first: 200)`), we still list it
with a "(plan no longer in catalog)" label and the raw planId so the reviewer
can see what's going on.
"""

from __future__ import annotations
import json
import re
import sys


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: render-allowlist-diff.py <plans.json>", file=sys.stderr)
        return 2

    try:
        catalog = json.load(open(sys.argv[1]))
        edges = catalog.get("data", {}).get("plans", {}).get("edges", [])
        by_id = {e["node"]["id"]: e["node"] for e in edges}
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as e:
        # If the catalog is malformed, fall back to an empty lookup so the
        # diff still renders (just with "(plan no longer in catalog)" labels).
        print(f"warning: catalog parse failed: {e}", file=sys.stderr)
        by_id = {}

    added: list[tuple[str, str, str]] = []
    removed: list[tuple[str, str, str]] = []

    # Match +/- lines that look like JSON-quoted planId entries. Skip the
    # file headers (+++ / ---).
    pattern = re.compile(r'^([+\-])\s*"([A-Za-z0-9+/=]+)"')
    for line in sys.stdin.read().splitlines():
        if line.startswith("+++") or line.startswith("---"):
            continue
        m = pattern.match(line)
        if not m:
            continue
        sign, pid = m.groups()
        plan = by_id.get(pid)
        name = plan["name"] if plan else "(plan no longer in catalog)"
        slug = plan["slug"] if plan else ""
        (added if sign == "+" else removed).append((name, slug, pid))

    # Stable order so the same diff produces the same body across runs.
    added.sort(key=lambda t: (t[0].lower(), t[2]))
    removed.sort(key=lambda t: (t[0].lower(), t[2]))

    print("### Added — now visible on the portal calendar")
    print()
    if added:
        for name, slug, pid in added:
            slug_part = f" — slug `{slug}`" if slug else ""
            print(f"- **{name}**{slug_part}")
    else:
        print("_(none)_")

    print()
    print("### Removed — no longer on the portal calendar")
    print()
    if removed:
        for name, slug, pid in removed:
            slug_part = f" — slug `{slug}`" if slug else ""
            print(f"- **{name}**{slug_part}")
    else:
        print("_(none)_")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
