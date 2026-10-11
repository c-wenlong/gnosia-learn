# Design reference

Every folder here is a symlink into the design-systems library
(`ai-engineering/design/design-systems/systems/<slug>`). The packages hold
captured third-party assets (fonts, screenshots, raw dumps), so they live in
the library, not in this repo. The links only resolve on a machine that has
that checkout.

## Create or repair the links

    python3 scripts/link-design-systems.py            # create missing, repoint stale
    python3 scripts/link-design-systems.py --check    # report only, exit 1 on a problem

The script reads `catalog.json` in the library (`DESIGN_SYSTEMS_HOME` overrides
the default location), repoints every existing link to the folder the catalog
gives for that slug, and creates a link for each slug in [LINKS](LINKS) that has
none yet. Rerun it after the library is reorganised.

To add a system, put its slug in `LINKS` and run the script.

## Moving a link

Move a link into a subfolder (for example `mobile/duolingo`) if you like. The
script finds links at any depth and uses the file name as the slug. Targets are
absolute, so a moved link keeps working. Update any Markdown links that point
into the old path.
