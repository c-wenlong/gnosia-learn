# Duolingo design reference

A token set and component reference for Duolingo's web app, for building mockups in Figma or Paper that match the product. It was extracted from www.duolingo.com on 2026-09-25, signed in to a free account on the Japanese course, in both of the app's themes, at desktop width and at a 570px mobile width.

| File | What it is |
|---|---|
| [tokens.json](tokens.json) | W3C DTCG tokens in Tokens Studio's multi-set layout: `core` (the 300-colour palette for both themes under `palette.light` and `palette.dark`, type, spacing, radii, borders, shadows, opacity, motion, breakpoints, layout sizes, z-index) plus `light` and `dark` semantic sets of 95 roles each, and a `$themes` list. Import with Tokens Studio → Load from file. |
| [tokens-notes.md](tokens-notes.md) | How the token file is organised, the semantic colour table in both themes, the type scale, fonts, and the token gaps. |
| [style-guide.html](style-guide.html) | One self-contained page that renders every token and component with the real values, in both themes (toggle top right), each specimen beside a crop of the real product. Open it in a browser, or paste sections into Paper. |
| [components.md](components.md) | The discovery list, one inventory entry per component with its crops, the icon summary, and every Gap. |
| [components/](components) | The full specs: `core.md` (generic components, including a colour table for all 24 button variants) and `product.md` (54 Duolingo-specific components: app shell, learn path, lesson screens, gamification), their JSON twins, and the per-component crops. |
| [icons.md](icons.md), [icons/](icons) | 13 inline UI glyphs and 210 CDN illustration SVGs, with where each is used, its rendered size and its fill or stroke style. Duolingo's property, kept for reference only. |
| [screenshots/](screenshots) | `{page}-{theme}-{state}.png` captures of the real product at 2x. |
| [raw/](raw) | The unprocessed readings: the palette as it sits in the app's JS bundle, the live light-theme colour variables, CSS statistics across all 182 stylesheet chunks, the discovery list, and every per-state computed-style dump (`dumps.tar.gz`, cited throughout the specs as `dump#node`). |
| [tools/](tools) | The builders and the capture kit. See Rebuild. |

## How the values were read

Duolingo writes its whole palette onto `<html>` as `--color-NAME: r, g, b` triplets and swaps them when `data-duo-theme` changes. The palette in [tokens.json](tokens.json) comes straight from the object in the app's JS bundle that holds both values for every name. The light values were checked against the live variables (300 of 300 match), and the dark values against every node that used them. Component measurements are computed styles: a script walked every visible element at each page and state, and the result was saved as a dump. Hover, focus, selected and disabled states were held live where possible. Pressed states, and anything a static page cannot hold, come from the app's own CSS rules, found by matching each element's hashed class names in the downloaded stylesheets. Every token and spec row names its source. Nothing was sampled from a screenshot, so no token is marked estimated. Values derived from CSS where no live capture existed say `derived, not captured`.

The screenshots were converted from the display's P3 profile to sRGB and stored as 256-colour PNGs to keep the repo small. Flat UI colours are exact, but gradients in illustrations can band slightly, so read exact values from the tokens or the dumps, not from the images.

## Fonts

The app uses `duolingo-sans` for all UI text (one variable upright file serving 400 and 700, plus an italic) and `feather` 700 as a display face, seen on the logged-out marketing page. Both are proprietary and are not committed. The style guide looks for them in a local `fonts/` folder next to it (gitignored) and falls back to Nunito from Google Fonts, showing a notice when it does. [tokens-notes.md](tokens-notes.md#fonts) says which CDN file is which.

## Rebuild

```bash
python3 tools/build_style_guide.py
```

```bash
python3 tools/build_components_md.py
```

`build_style_guide.py` renders the page from `tokens.json` and `tools/style-guide.template.html`. `build_components_md.py` assembles `components.md` from `components/*.json`, `components/*.md`, `icons.md`, `tokens-notes.md` and `raw/discovery.md`. The token builder read the full scratch inputs and is not shipped, so edit `tokens.json` directly and re-run the style-guide builder. `tools/capture/` holds the in-page extraction script (`extract.js`), the local sink that saved dumps to disk (`sink.py`), the window screenshot cropper (`shot.py`), a dump query helper (`q.py`) and the CSS parser (`parse_css.py`).

## Use in Figma

Import `tokens.json` with Tokens Studio and choose the Light or Dark theme. Set fonts to duolingo-sans (or Nunito as a stand-in). The one component rule to get right is the 3D button: a solid face with a same-hue darker lip underneath (4px on primary buttons, 2px border plus a 2px lip on outline buttons), which collapses by that amount on press. Anything the capture could not reach is listed under Gaps in [components.md](components.md#gaps).
