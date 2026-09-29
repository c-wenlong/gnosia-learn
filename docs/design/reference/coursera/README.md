# Coursera design reference

A token set and component reference for Coursera's web product, for rebuilding our course list and course detail pages in the style of a real course platform. It was read from coursera.org on 2026-09-29: the public catalogue pages headless (home, search, browse, course, specialization, certificate and the Explore topic page with its compact course cards, chip rows and scrolling card rows), and the signed-in learner pages from one learner's account with one enrolled course, all at 1440 wide and (for public pages) 390 wide.

The earlier references (Duolingo, Brilliant, NotebookLM) are learning apps. Coursera is the one built around courses: a catalogue of product cards, a course landing page with modules and outcomes, and a course home where a learner works through modules, lessons and items with deadlines and grades. Those last screens map onto our `/courses` and course pages most directly.

| File | What it is |
|---|---|
| [tokens.json](tokens.json) | W3C DTCG tokens (every length is a single px or rem `dimension`, shorthands are split per side, an em letter-spacing is a `number` of ems, shadows are `shadow` layers) in Tokens Studio's multi-set layout: `core` (401: seven 15-step colour ramps plus ink and paper alpha ramps, one font family, 28 type styles with their breakpoint sizes, spacing, radius, breakpoints, motion, layout grids, component sizes, the focus ring) and `light` and `dark` (101 and 95: the semantic colour roles, elevation and component colours), plus `$themes`. Every token carries `$extensions.source`. |
| [style-guide.html](style-guide.html) | One self-contained page that renders every token and the course components with the real values, each state side by side, in both themes (toggle top right, defaults to the system theme). |
| [components.md](components.md) | The discovery list of every page and view, one entry per component with crops of the real product, the icon index, and the Gaps. |
| [components/crops/](components/crops) | 759 element screenshots: 352 from the public pages and 407 from the signed-in pages (`signed-in/`). |
| [icons/](icons) | 58 SVGs lifted from the public pages, named by role in [icons/INDEX.tsv](icons/INDEX.tsv). Coursera's property, kept for reference only. |
| [screenshots/](screenshots) | 90 `{page}-{theme}-{state}.png` captures. `learn-*` and `my-learning-*` are the signed-in pages, `mobile-*` are 390 wide. Viewport shots are 2x, `*-full` shots 1x. |
| [raw/](raw) | The unprocessed readings: every `--cds-*` variable by selector and media query with its computed value at four widths and both schemes (`css-vars.json`), per-component computed styles for the public pages (`measurements.md`, `components-computed.json`) and the signed-in pages (`measurements-signed-in.md`, `components-signed-in.json`), the component values the token file takes (`component-tokens.json`), per-page layout notes (`pages.md`), and the redacted DOM snapshots of the signed-in pages (`snapshots/`). |
| [tools/](tools) | The three builders and the capture kit. See Rebuild. |

## How the values were read

Coursera styles its product with CDS, the Coursera Design System, on Emotion. CDS writes its tokens onto `:root` as 386 custom properties (`--cds-color-interactive-primary`, `--cds-spacing-200`, `--cds-border-radius-100`, `--cds-typography-title-large`), and the signed-in course pages use exactly the same 386. So the palette, semantic colours, spacing, radii, type scale and elevation in the token file all trace to a named variable. The larger type styles shrink below 1024 and 600 wide through media-query overrides; each type token records its desktop size and those smaller sizes.

Every colour is a `light-dark(<light>, <dark>)` pair, and the ramps flip in the dark scheme: `blue.800` paints as `blue.300` does in light. `core.palette` holds each ramp's light values, and the light and dark sets alias the step each role paints in that scheme. Coursera does not offer learners a dark theme on any page captured (it ignores `prefers-color-scheme`); the dark set and the dark screenshots come from forcing the scheme on the page, so treat them as what CDS defines, not as a shipped design.

Component values are computed styles read per state with Playwright. Hover used the pointer, focus-visible used a real keyboard Tab, and pressed was either held with the mouse (signed-in) or forced through DevTools (public), so no button was ever clicked for real. Where CDS draws its focus ring from a class its own script adds on keyboard focus, the measurement adds that class and labels the state `focus-visible-cds`.

The signed-in pages were captured without handing the account to a headless browser. In the signed-in tab, [snapshot.js](tools/capture/signed-in/snapshot.js) copied each page's DOM with every stylesheet inlined from the CSSOM (Emotion inserts rules with `insertRule`, so the `<style>` tags alone are empty), stripped the scripts, kept the current video frame, cut every presigned URL back to its path (a reading's narration audio is served from S3 with a credential in the query), and replaced the learner's name, avatar initials, institution and programme with "Learner", "L", "Example University" and "Example Program". The values to replace come from a redaction file kept outside the repository (`~/.self-learn/coursera-redact.json` by default, shaped like [redact.example.json](tools/capture/signed-in/redact.example.json)), since the file itself names the learner. [unsnap.py](tools/capture/signed-in/unsnap.py) refuses a snapshot in which any redacted string or signing parameter survived. The snapshots were then rendered and measured headless at 2x; CSS hover and focus rules still apply to a static copy, but anything that needs JavaScript (menus, the AI chat panel, toggling an accordion) could only be measured in the state it was captured in. The discussion forums, messages and notes pages were not captured, since they hold other people's posts or the learner's own notes.

Screenshots are stored as 256-colour PNGs to keep the repo small. Flat UI colours are exact; read values from the tokens, not the images.

## Fonts

| Family | Weights | Used for |
|---|---|---|
| Source Sans Pro | 400, 600, 700, with italics | Every UI string. Coursera serves Source Sans 3 under this family name |
| Boutros Coursera | | Arabic script only |

Source Sans 3 is open source, so the style guide loads it from Google Fonts and needs no local font folder. Letter-spacing is 0 on the type tokens CDS uses today; the older `title*` and `display*` styles carry -0.1px and -0.2px, and the tracking some components add is in `core.tracking`.

## Rebuild

```bash
python3 tools/build_tokens.py
```

```bash
python3 tools/build_style_guide.py
```

```bash
python3 tools/build_components_md.py
```

`build_tokens.py` reads `raw/css-vars.json` and `raw/component-tokens.json` and writes `tokens.json`. `build_style_guide.py` renders `style-guide.html` from `tokens.json` and `tools/style-guide.template.html`, turning every token into a CSS variable so the page cannot drift from the file. `build_components_md.py` writes `components.md` from the measurement files. All three are deterministic: re-running them on this commit reproduces their files byte for byte. Edit the raw inputs or the builders, never the generated files.

`tools/capture/` holds the kit the captures came from, written for one session. `measure.mjs` takes page names, so `node tools/capture/measure.mjs explore` re-reads only the Explore page (it merges into `raw/components-computed.json`, then run `node tools/capture/build-measurements.mjs`), and `public.mjs light explore,mobile-explore` re-takes its three screenshots. The Playwright scripts take `PLAYWRIGHT` as the path to a Playwright install when `playwright` is not resolvable from where they run: `vars.mjs` (the variable dump), `public.mjs` and `layout.mjs` (public screenshots and grid measurements), `icons.mjs`, `measure.mjs` with `lib.mjs` and `build-measurements.mjs` (public components), and `quantize.py`. `tools/capture/signed-in/` holds the snapshot helper, `unsnap.py`, `render.mjs` and the signed-in `measure.mjs`.

## Use in Figma

Import `tokens.json` with Tokens Studio and choose the Light theme; Dark is available but is not a theme Coursera ships. Set the font to Source Sans 3.

The course home is the screen to get right. It sits on a `grey.25` (#f2f5fa) ground under a 64px bar, in three white cards with a 16 radius and no border or shadow: a 300px sidebar, a 716px module column and a 360px rail, 16 apart. An item row is 60 tall with a 20px status icon, a 16/24 title and a 14/20 grey meta line, and the current item carries a `blue.25` tint and a 36px primary Resume button. Buttons are 8-radius rectangles in `blue.800` (#0056d2) that go darker blue on hover and purple when pressed, with no transition. Catalogue cards have a 1px `grey.200` border, a 16 radius and gain a shadow on hover. Everything the capture could not reach is listed under Gaps in [components.md](components.md#gaps).
