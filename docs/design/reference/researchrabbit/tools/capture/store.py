#!/usr/bin/env python3
"""Store rendered snapshots: screenshots as 256-colour PNGs, snapshots gzipped outside the repo.

usage: python3 tools/capture/store.py SNAP_DIR

SNAP_DIR holds <label>.html, <label>.json and <label>.png from unsnap.py and render.mjs. Each
label is renamed to the reference's {page}-light-{state} scheme (NAMES below) and written to
screenshots/ quantized to 256 colours; flat UI colours stay exact, so read values from tokens.json,
not the images. The HTML snapshots carry the signed-in pages, so they are gzipped into
$RR_SNAPSHOTS (default ~/.self-learn/researchrabbit-snapshots), never into the repository;
measure.mjs reads them from there.
"""
import gzip, os, pathlib, shutil, sys
from PIL import Image

NAMES = {
    'graph-split-default': 'search-split-light-default',
    'graph-split-hover-input': 'search-split-light-hover-input',
    'graph-split-hover-result': 'search-split-light-hover-result',
    'graph-split-hover-list-card': 'search-split-light-hover-list-card',
    'graph-split-hover-legend-inputs': 'search-split-light-hover-legend-inputs',
    'graph-split-hover-legend-results': 'search-split-light-hover-legend-results',
    'graph-split-inspect-node': 'search-split-light-inspect-node',
    'graph-map-default': 'search-map-light-default',
    'graph-map-zoomed-in': 'search-map-light-zoomed-in',
    'graph-map-inspect-node': 'search-map-light-inspect-node',
    'graph-map-settings-x-axis': 'search-map-light-settings-x-axis',
    'graph-map-settings-y-axis': 'search-map-light-settings-y-axis',
    'graph-map-settings-size': 'search-map-light-settings-size',
    'graph-map-settings-advanced': 'search-map-light-settings-advanced',
    'graph-map-filter-popover': 'search-map-light-filter-popover',
    'search-list-default': 'search-list-light-default',
    'library-collection-map': 'library-map-light-default',
    'library-collection-map-hover': 'library-map-light-hover',
    'library-collection-map-positions-moved': 'library-map-light-positions-moved',
    'library-collection-map-positions-reset-menu': 'library-map-light-positions-reset-menu',
    'library-collection-list': 'library-list-light-default',
    'home-default': 'home-light-default',
}

REF = pathlib.Path(__file__).resolve().parent.parent.parent
SNAP = pathlib.Path(sys.argv[1])
OUT = REF / 'screenshots'
ARCH = pathlib.Path(os.environ.get('RR_SNAPSHOTS', '~/.self-learn/researchrabbit-snapshots')).expanduser()
OUT.mkdir(exist_ok=True)
ARCH.mkdir(parents=True, exist_ok=True)
for label, name in sorted(NAMES.items()):
    png = SNAP / f'{label}.png'
    if not png.exists():
        print('missing', label)
        continue
    Image.open(png).convert('RGB').quantize(256, dither=Image.Dither.NONE).save(OUT / f'{name}.png', optimize=True)
    for ext in ('html', 'json'):
        with open(SNAP / f'{label}.{ext}', 'rb') as src, gzip.GzipFile(ARCH / f'{name}.{ext}.gz', 'wb', mtime=0) as dst:
            shutil.copyfileobj(src, dst)
    print(name)
