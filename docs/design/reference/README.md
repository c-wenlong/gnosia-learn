# Design reference

Every folder here is a symlink into the design-systems library, a private
checkout that is not part of this repository. The packages hold captured
third-party assets (fonts, screenshots, raw dumps), so they live in the
library, not in this repo. The links are absolute, untracked (only LINKS and
this README are committed), and resolve only on a machine that has that
checkout. A fresh clone shows LINKS and nothing else until the script runs.

## Create or repair the links

    DESIGN_SYSTEMS_HOME=<library checkout> python3 scripts/link-design-systems.py            # create missing, repoint stale
    DESIGN_SYSTEMS_HOME=<library checkout> python3 scripts/link-design-systems.py --check    # report only, exit 1 on a problem

The script reads `catalog.json` in the library checkout `DESIGN_SYSTEMS_HOME`
names, repoints every existing link to the folder the catalog
gives for that slug, and creates a link for each slug in [LINKS](LINKS) that has
none yet. Rerun it after the library is reorganised.

To add a system, put its slug in `LINKS` and run the script.

## Moving a link

Move a link into a subfolder (for example `mobile/duolingo`) if you like. The
script finds links at any depth and uses the file name as the slug. Targets are
absolute, so a moved link keeps working. Update any Markdown links that point
into the old path.
