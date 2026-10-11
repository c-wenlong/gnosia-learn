#!/usr/bin/env python3
"""Keep docs/design/reference/ symlinks pointing into the design-systems library.

    python3 scripts/link-design-systems.py [--check]

The library is $DESIGN_SYSTEMS_HOME, else the default path below. Its
catalog.json lists every package; an entry's `entry` field is
`<folder>/README.md`, so the package folder is dirname(entry).

* Every symlink anywhere under docs/design/reference/ (recursive) is repointed,
  by its file name taken as the slug, at the catalog's folder for that slug.
  Move a link into a subfolder and it is still found.
* Every slug in docs/design/reference/LINKS (one per line, # comments allowed)
  that has no link anywhere yet gets a new link docs/design/reference/<slug>.
* --check changes nothing; it exits 1 if a link is missing, dangling, or
  points somewhere other than the catalog's folder.

Targets are absolute on purpose: a link survives being moved inside this repo,
and a rerun repoints every link after the library is reorganised.
"""
import json
import os
import sys

DEFAULT_HOME = "/Users/owner/Desktop/Personal/Internal/Projects/ai-engineering/design/design-systems"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "docs", "design", "reference")
LINKS_FILE = os.path.join(REF, "LINKS")


def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(2)


def load_catalog(home):
    path = os.path.join(home, "catalog.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError) as e:
        die(f"cannot read {path}: {e}")
    folders = {}
    for s in data.get("systems", []):
        slug, entry = s.get("slug"), s.get("entry")
        if slug and entry:
            folders[slug] = os.path.join(home, os.path.dirname(entry))
    return folders


def find_links():
    """All symlinks under REF, as (path, slug)."""
    found = []
    for dirpath, dirnames, filenames in os.walk(REF, followlinks=False):
        for name in dirnames + filenames:
            p = os.path.join(dirpath, name)
            if os.path.islink(p):
                found.append((p, name))
    return sorted(found)


def wanted_slugs():
    if not os.path.exists(LINKS_FILE):
        return []
    with open(LINKS_FILE, encoding="utf-8") as f:
        lines = (ln.split("#", 1)[0].strip() for ln in f)
        return [ln for ln in lines if ln]


def main():
    args = sys.argv[1:]
    if any(a not in ("--check",) for a in args):
        die("usage: link-design-systems.py [--check]")
    check = "--check" in args

    home = os.path.abspath(os.environ.get("DESIGN_SYSTEMS_HOME") or DEFAULT_HOME)
    if not os.path.isdir(home):
        die(f"design-systems library not found at {home} (set DESIGN_SYSTEMS_HOME)")
    folders = load_catalog(home)

    bad = 0
    existing = find_links()
    have = {slug for _, slug in existing}
    todo = [(p, slug) for p, slug in existing]
    for slug in wanted_slugs():
        if slug not in have:
            todo.append((os.path.join(REF, slug), slug))

    for path, slug in todo:
        rel = os.path.relpath(path, ROOT)
        target = folders.get(slug)
        if target is None:
            print(f"UNKNOWN   {rel}: slug '{slug}' not in catalog")
            bad += 1
            continue
        if not os.path.isdir(target):
            print(f"NO-FOLDER {rel}: catalog folder {target} does not exist")
            bad += 1
            continue
        if os.path.islink(path):
            current = os.readlink(path)
            if current == target:
                print(f"ok        {rel} -> {target}")
                continue
            if check:
                state = "DANGLING " if not os.path.exists(path) else "WRONG    "
                print(f"{state} {rel} -> {current} (want {target})")
                bad += 1
                continue
            tmp = path + ".tmp-link"
            os.symlink(target, tmp)
            os.replace(tmp, path)
            print(f"repointed {rel} -> {target} (was {current})")
        elif os.path.lexists(path):
            print(f"BLOCKED   {rel}: exists and is not a symlink")
            bad += 1
        elif check:
            print(f"MISSING   {rel} (want -> {target})")
            bad += 1
        else:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            os.symlink(target, path)
            print(f"created   {rel} -> {target}")

    if not todo:
        print("nothing to link")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
