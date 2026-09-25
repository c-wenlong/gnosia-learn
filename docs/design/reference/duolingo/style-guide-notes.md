# Style guide: build and verification notes

`style-guide.html` is generated. Edit `tools/style-guide.template.html` or `tokens.json`, then run
`cd tools && python3 build_style_guide.py`. `--only <section>` and `--out <file>` build a partial preview
(sections: tokens, buttons, core, shell, lesson, gamification).

## Fonts

The page loads the product fonts from `fonts/` (local copies, not committed) and falls back to Nunito from
Google Fonts. A notice appears at the top when either product face fails to load.

The font mapping in the brief and in `tokens.json` (`fontFamily.body` description) is wrong. The app's own
registration code (webpack module 91009 in the captured `index.html`) shows:

| File | Registered as |
| --- | --- |
| `f2331bbfd902cdf8971c4d3184a44283.woff2` | duolingo-sans, normal, both weight 400 and 700 (one variable file) |
| `3bbe299f41d8289a47d91773fee0cb6a.woff2` | duolingo-sans, italic, both weights |
| `68d22534874c554b0c9ebabea379fc60.woff2` | feather 700 (feather 900 reuses the upright duolingo-sans file for ru/uk/vi) |

The page declares the faces that way. With the brief's mapping every bold label rendered italic. The files in
`$DUO/fonts/` are gzip-wrapped (saved with their transfer encoding); `out/fonts/` holds the decompressed woff2.

## Verification

Each specimen has a `.shot[data-shot][data-crop]` element. The harness (`$DUO/sg/shoot.js` +
`$DUO/sg/compare.py`, Playwright chromium) renders the page at 2x in both themes with the product fonts loaded,
screenshots each shot plus 4px on every side (the same framing as the crops) and writes
specimen | crop sheets to `$DUO/sg/compare/`.

- 118 shot elements, 204 comparisons (97 light, 107 dark; one-theme shots only run in their theme).
- 190 of 204 match the crop's CSS size within 1px.
- The 14 others are crops cut off by the capture window, so the crop is missing its padding on one side
  (sidebar-nav, sidebar-nav--more-open, sidebar-nav--more-item-hover, mobile-top-bar, mobile-tab-bar,
  mobile-tab-bar--leaderboard-active, section-end-card, button-secondary-macaw). The content lines up.
- At 400px wide the page does not scroll sideways; wide specimens scroll inside their own stage.

## Residual differences

Colour
- The crops are Display P3 screen captures saved untagged, so in the page they look washed out beside the
  sRGB specimens (owl `#58CC02` shows as about `#78C93D`). The compare sheets convert crops P3 to sRGB, and after
  conversion the colours match the tokens. The page says so in the Buttons intro.

Art that was not captured, replaced by a placeholder or a nearby asset
- User photo avatars (profile, search rows, following row, leaderboard rows, avatar edit): placeholder circles.
- Path characters (Duo and friends are animations): the path-node slice uses a static Duo SVG; completed
  slices and popovers leave them out. Unit-header scene art is left out.
- Image-select pictures and the lesson-complete illustration: placeholders.
- Quit modal owl uses `icons/cdn/sad.svg`, which is not the same art as the product's.
- Four lesson glyphs that were inline in the product and never exported (NEW WORD badge, TOO EASY,
  TOO DIFFICULT, target) are rough inline stand-ins.
- The refilling heart in the hearts dropdown is an approximation of an animated asset.

Capture artefacts in the crops (not reproduced)
- The capture tool's mouse pointer and its orange glow at viewport edges.
- Bottom fades on path and section-end crops, ghost text under the starfish unit header, page content showing
  through beside popovers, menus and mobile bars, the caret in the focused input.

Small offsets kept on purpose
- START bubble sits 1.5px (light) and 5px (dark) lower in the crops than in the dump rects (probably a bob
  animation); the specimen follows the dump.
- A few labels (challenge title, some ruby labels, tooltip) differ by about 1px vertically.
- Radio-card rows (dark) and the dark achievement crop sit 1 to 2px off their dump rects (captured mid-motion).
- Follow button label is about 1px lower than in the crop.

Not shot
- bottom-sheet light: the 1384px sheet is wider than the harness viewport minus the page gutter, so only the
  dark (1200px) capture is compared.
- The light achievement shot is clipped to 277px because its crop is cut by the viewport; dark shows all rows.
- The leaderboard slice (header, medal rows, promotion divider) is laid out from the dump and checked once
  against the full crop, but only the row-hover and current-user rows are compared automatically.
- Toast: never captured, so there is no specimen.

## Token build scripts

The scripts in `$DUO/tk/` (build.py and helpers) were not copied into `tools/`: they read `palettes-raw.json`,
`css/`, `dumps/` and a pickled rule cache from the scratch root, so they cannot run from this folder.
