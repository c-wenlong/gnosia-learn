# Brilliant design reference

A token set and component reference for Brilliant's web app, for building mockups in Figma or Paper that match the product. It was extracted from brilliant.org on 2026-09-25, signed in to a new free account on the Math path, in the app's light and dark themes, at desktop width and (for public pages) at a 390px mobile width.

| File | What it is |
|---|---|
| [tokens.json](tokens.json) | W3C DTCG tokens in Tokens Studio's multi-set layout: `core` (174-step palette, 6 font families, 33 type styles, spacing, sizes, breakpoints, radii, border widths, blur, z-index, durations, easings, opacity) plus `light` and `dark` sets of 351 tokens each (semantic colour roles, gradients, shadows and component colours), and a `$themes` list. Every token carries `$extensions.source` naming where it was read. Import with Tokens Studio → Load from file. |
| [style-guide.html](style-guide.html) | One self-contained page that renders every token and component with the real values, in both themes (toggle top right, defaults to the system theme). Open it in a browser, or paste sections into Paper. |
| [components.md](components.md) | The discovery list of every page, view and overlay, one inventory entry per component with crops of the real product, the icon summary, and the Gaps. |
| [components/crops/](components/crops) | 82 per-component crops cut from the screenshots, in both themes where both were captured. |
| [icons/](icons) | 15 app glyphs saved from the signed-in pages (`icons/app/`, named by role and size) and 33 SVGs pulled from the public pages (`icons/public/`, named by hash, indexed in [components.md](components.md#icons)). Brilliant's property, kept for reference only. |
| [screenshots/](screenshots) | 73 `{page}-{theme}-{state}.png` captures of the real product at 2x, `mobile-*` at 390x844. |
| [raw/](raw) | The unprocessed readings: every Panda CSS variable in both themes (`css-vars-public.json`), all 432 colour variables resolved per theme (`colors.tsv`), the 33 text styles (`text-styles.tsv`), per-surface computed styles (`measurements.md`) and the headless dumps of the public and pricing pages. |
| [tools/](tools) | The two builders and the capture kit. See Rebuild. |

## How the values were read

Brilliant styles its app with Panda CSS, which writes every token onto `:root` as a custom property (`--panda-colors-bg-primary`, `--panda-radii-2xl`, `--panda-shadows-elevation-base`) and overrides the colour ones under `[data-theme="dark"]`. The token file is built from a dump of those variables, so every palette step, semantic colour, radius, spacing step, z-index, shadow and gradient traces to a named variable. Type styles come from Panda's `textStyle` rules in the production stylesheet.

Component measurements are computed styles read live in Chrome for each state: hover and focus were held with the pointer or keyboard, selected and disabled states were reached in the product, and pressed states were caught mid-transition. The theme was switched by setting `data-theme` on the page, never in account settings. Values that could only be sampled from a screenshot are marked "estimated from screenshot"; in the token file that is one token, `size.icon-md`, and in the specs it is the canvas-drawn Koji suggestion cards and the iridescent frames on the pricing page.

Panda defines no duration tokens that survive to production (`trs-dur_fast` compiles to invalid CSS), so `core.duration` lists the durations the app's transitions actually use, each with the rule it was read from. Springs are real variables: `--spring-smooth` is `cubic-bezier(.2,1.1,.36,1)` over .833s, with a `linear()` version in `easing-linear`.

The screenshots were converted from the display profile (Display P3 or the external monitor's) to sRGB and stored as 256-colour PNGs to keep the repo small. Flat UI colours are exact, but gradients can band slightly, so read exact values from the tokens, not from the images. The signed-in account's name and email were replaced with "Learner", "Example" and learner@example.com before every capture.

## Fonts

| Family | Weights | Used for |
|---|---|---|
| CoFo Brilliant | 400, 500, 700, with italics | All UI text |
| CoFo Robert | 500, with italic | Display headlines (`display.*` styles), fallback Georgia |
| CoFo Semi Mono | 500, 700 | Lesson interactive tiles |
| Source Code Pro | 400, 500, 700, with italics | Code |
| KaTeX_Main | 400, 700, with italics | Maths |
| Soleil | 400, 600, 700, 400 italic | Legacy Django pages only |

No `font-feature-settings` are set anywhere. The CoFo families are proprietary and are not committed. The style guide looks for them in a local `fonts/` folder next to it (gitignored) and falls back to Figtree and Georgia, showing a notice when it does.

## Rebuild

```bash
python3 tools/build_tokens.py
```

```bash
python3 tools/build_style_guide.py
```

`build_tokens.py` reads `raw/css-vars-public.json` and `raw/text-styles.tsv` and writes `tokens.json`; component colours and their sources are listed in its `comp()` block. `build_style_guide.py` renders `style-guide.html` from `tokens.json` and `tools/style-guide.template.html`, turning every token into a CSS variable so the page cannot drift from the file. Both are deterministic: re-running them on this commit reproduces both files byte for byte. Edit the raw inputs or the builders, never the generated files.

`tools/capture/` holds the kit the captures came from: the in-page helpers (`helpers.js`), the window screenshot cropper (`shot.sh`, with `wins.swift` to find the Chrome window), the sRGB converter (`srgb.py`), the crop list (`crops.py`), and headless Playwright scripts for the variable dump (`vars.cjs`), public pages (`public.cjs`), pricing (`pricing.cjs`), icons (`icons.cjs`) and the style guide check (`sg.cjs`). They were written for one session and take paths from their arguments or from `SP`.

## Use in Figma

Import `tokens.json` with Tokens Studio and choose the Light or Dark theme. Set fonts to CoFo Brilliant (or Figtree as a stand-in) and CoFo Robert (or Georgia) for display headlines.

The component to get right is the 3D button: a pill face lifted 4px over a same-hue darker lip, which drops to 0 on press over 100ms. Cards are flat with a 2px border and large radii (20 to 40). Elevation is a soft, unoffset black glow: `shadow.base` is `0 0 15px` in 10% black on light and 80% black on dark. The lesson's Koji areas stay dark in the light theme. Anything the capture could not reach is listed under Gaps in [components.md](components.md#gaps).
