# Gauth design reference

A token set and component reference for Gauth's web product, for building self-learn's courses, lessons and tutor in the style of a real AI learning app. It was read from www.gauth.com on 2026-10-04, signed out, in headless Chromium at 1440 wide and 390 wide: the Homework home, the Gauth Academy catalogue (Science Labs, Math Curriculum, History Signature, My Course and the Create a Course dialog), a math unit page, three lesson players (a science canvas, a math lesson and a history lesson), Atlas with a story page, and Insights.

The earlier references (Duolingo, Brilliant, NotebookLM, Coursera) each cover part of what self-learn does. Gauth covers most of it in one product: a course catalogue with an AI course builder, unit pages with a path of topics, narrated lessons with a tutor beside them, AI-generated visual stories, and a question-first home.

| File | What it is |
|---|---|
| [tokens.json](tokens.json) | W3C DTCG tokens (every length is a single px `dimension`, gradients are `gradient` stops with the angle in `$extensions`, shadows are `shadow` layers, a press scale is a `number`) in Tokens Studio's multi-set layout: `core` (288: Gauth's named colours and the literal ones it paints, grouped by where they belong, nine font families, the `--lesson-font-size-*` scale, 40 composite type styles, spacing, radius, sizes, layout widths, breakpoints, durations, easings, press scales, focus) and `light` (111: background, text, border and action roles, gradients, elevation and component colours), plus `$themes`. There is no dark set; see How the values were read. Every token carries `$extensions.source`. |
| [style-guide.html](style-guide.html) | One self-contained page that renders every token and the main components (sidebar, top bar buttons, Academy catalogue, unit page, the three lesson players, dialogs, Homework home, Atlas, Insights tabs) with the real values, states side by side. |
| [components.md](components.md) | The discovery list of every page and view, one entry per component (152) with crops of the real product, the shared values (focus, pressed, motion, layout grid, card shapes), the icon index, and the Gaps. |
| [components/crops/](components/crops) | 296 element screenshots, `{component}-{state}.png`, at 2x (large ones halved). |
| [icons/](icons) | 99 SVGs lifted from the pages, named by role in [icons/INDEX.tsv](icons/INDEX.tsv). Gauth's property, kept for reference only. |
| [screenshots/](screenshots) | 44 `{page}-light-{state}.png` captures. Desktop shots are 1440 x 900 at 1x, `-full` shots whole pages at 1x, `mobile-*` shots 390 x 844 at 2x. |
| [raw/](raw) | The unprocessed readings: every custom property the pages declare, sorted by owner, with font faces, loaded fonts and the dark-theme checks (`css-vars.json`); per-component computed styles (`components-computed.json`, and `measurements.md` built from it); the token tree the builder reads (`component-tokens.json`); page geometry at four widths (`layout.json`) and the layout notes written from it (`pages.md`). |
| [tools/](tools) | The three builders and the capture kit. See Rebuild. |

## How the values were read

Gauth's pages are React with CSS modules: a class reads `catalog_card__Xyz12`, so the kit selects by the stable `catalog_card` part. The stylesheets come from a CDN, which the CSSOM will not read cross-origin, so [vars.mjs](tools/capture/vars.mjs) keeps every stylesheet response and parses it in the page with a constructed `CSSStyleSheet`. The pages declare about 3,700 custom properties, and most are not Gauth's: 2,211 are Ant Design's CSS-variable theme (`--ant-*`, including its stock `#1677ff` primary that Gauth never paints), 244 are TikTok's TUX theme (`--Primary: #fe2c55` and friends, under `:root, [data-theme="light"]`), and the science lesson brings Astryx, a separate design system with its own "stone" theme. All of these are recorded in [raw/css-vars.json](raw/css-vars.json) by owner and none is promoted unless Gauth paints it.

Gauth's own 750 declarations are mostly the lesson system: the lesson palette (`--lesson-primary-*`, `--lesson-gray-*`, `--lesson-blue-*`, `--lesson-right-*`, `--lesson-wrong-*`, which the Academy pages also paint), the lesson type scale (`--lesson-font-size-*`, `--ugc-lesson-*`), a few layout widths, Atlas's `--aw-*` and the math player's `--gauth-*`. The token file uses these wherever one matches what a page paints, and otherwise takes the computed style of the real element, citing the component entry it was read from. So the palette is grouped by place (ink, paper, sand, slate, blue, green, gold, indigo for Homework, astryx for the science lesson, atlas) rather than as ramps, because Gauth has no ramps.

Component values are computed styles read per state with Playwright ([measure.mjs](tools/capture/measure.mjs)). Hover used the pointer, focus-visible a real keyboard Tab, and pressed was forced through DevTools (`CSS.forcePseudoState`), so no button was clicked for real. Text fields were typed into and cleared again, and Enter was never pressed. The only presses were dismissals (the promo dialog's close button, the audio dialog's Not now), the math player's Continue (which starts playback), tabs, Show more, the lesson's own Pause, Settings and chapters buttons, Create Course (which opens a dialog), and a story card's Explore (which opens a published story). Nothing was signed into, created, sent or uploaded.

Gauth paints one light theme. Its stylesheets declare dark values (TUX under `[data-theme="dark"]`, the lesson palette under `[data-lesson-style="dark"]`, Astryx as `light-dark()` pairs), but no page captured applies any of them, no control offers a switch, and every page painted the same with `prefers-color-scheme: dark` emulated. So the token file has a light set only, and the dark declarations stay in the raw file.

Screenshots are stored as 256-colour PNGs to keep the folder small. Flat UI colours are exact; read values from the tokens, not the images.

## Fonts

| Family | Weights | Used for |
|---|---|---|
| Playfair Display | 600, 700, 800 | "Gauth Academy", lesson titles, the promo dialog, the math slide titles |
| Libre Baskerville | 400, 700 | The Homework hero (served as "Gauth Home Libre Baskerville"), the Atlas title, the science canvas's chapter titles (served as "Canvas Chapter") |
| SF Pro | 400, 590, 700 | Academy controls, the unit page, Atlas; Gauth declares it over `local()` only, so it is Apple's system face |
| System stack | | Everything the CSS modules inherit: `-apple-system, "system-ui", "Google Sans", Roboto, Arial` |
| Inter | 400, 500, 600 | Math unit cards, the Ask gauth field, Astryx dialogs |
| Satoshi | 500 | The science canvas's text and headings (served as "Canvas Print" and "Canvas Heading") |
| Shantell Sans | 500, 600 | The canvas tutor's handwriting (served as "Canvas Tutor") |
| KaTeX | | Maths |

Playfair Display, Libre Baskerville, Inter and Shantell Sans are open source, so the style guide loads them from Google Fonts. SF Pro is Apple's and Satoshi is from Fontshare, so the guide falls back to the system font for both, and no font file is committed or needed.

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

`build_tokens.py` reads `raw/css-vars.json` and `raw/component-tokens.json` and writes `tokens.json`; it refuses a value that is not the DTCG type it claims and an alias that points at nothing. `build_style_guide.py` renders `style-guide.html` from `tokens.json` and `tools/style-guide.template.html`, turning every token into a CSS variable so the page cannot drift from the file. `build_components_md.py` writes `components.md` from `raw/components-computed.json`, `raw/layout.json`, `tokens.json`, the screenshots and `icons/INDEX.tsv`. All three are deterministic: re-running them on this commit reproduces their files byte for byte. Edit the raw inputs or the builders, never the generated files.

`tools/capture/` holds the kit the captures came from. The Playwright scripts take `PLAYWRIGHT` as the path to a Playwright install's `index.mjs` when `playwright` is not resolvable from where they run.

```bash
PLAYWRIGHT=/path/to/playwright/index.mjs node tools/capture/measure.mjs academy unit
```

`measure.mjs` takes page names (`promo home academy create unit science math history atlas story news mobile`) and merges into `raw/components-computed.json`, dropping the entries a re-run page no longer produces; then `node tools/capture/build-measurements.mjs` rewrites `raw/measurements.md`. `public.mjs` takes the screenshot names to re-take (`RAW=<scratch dir> node tools/capture/public.mjs academy-math,mobile-atlas`), and `python3 tools/capture/quantize.py <scratch dir>` stores them. `vars.mjs`, `icons.mjs` (with `icon-names.tsv` naming icons by geometry hash) and `layout.mjs` rewrite their raw files whole. The science lesson takes about four minutes to reach its quiz, so `measure.mjs science` is slow. `lib.mjs` holds the shared helpers.

## Use in Figma

Import `tokens.json` with Tokens Studio and choose the Light theme. Set the display fonts to Playfair Display and Libre Baskerville and the UI font to SF Pro (or Inter where SF Pro is not installed).

## Gauth's surfaces and self-learn's

| Gauth | Layout | self-learn |
|---|---|---|
| Academy catalogue (`/course/<tab>`) | A Playfair title and Create Course over category tabs, then course sections, each a heading row and a three-column card grid | `/courses` |
| Unit page (`/course/math/<course>?unit=`) | A course banner, a sticky unit rail at the left, a path of topic coins at the right, a floating Start panel | the course page, `/courses/[slug]` |
| Lesson player and Ask Tutor (`/course/<subject>/<lesson>/learn`) | Full screen, no shell. Science: a narrated canvas, a section rail at the right, an Ask Tutor pill docked at the bottom. Math: a 360px tutor column with an Ask gauth field beside the slide | `/learn/<concept>` |
| Atlas (`/atlas`) | A prompt box that turns a topic into an illustrated story, recommendation chips, a grid of story cards with Video badges, and a story page | the studio, `/studio` |
| Homework home (`/`) | A serif hero, one large question field, an upload panel and subject chips, then marketing bands | Home, `/home` (formerly `/today`) |
| Create a Course dialog | A warm sheet with suggested topics and a single prompt field | the studio's chat, and making a course |

## The screen to get right

The Academy catalogue is the screen to get right. It sits on a warm `#faf9f5` ground (`--lesson-gray-bg`) that the 220px sidebar shares, with the current sidebar item and the current tab in beige `#f4ebe5` (`--lesson-primary-fill-2`) at radius 10 and 12. "Gauth Academy" is Playfair Display 700 at 36px; Create Course is a 37px pale blue button with a 1px `#d5e3f4` border at radius 12. The column is 1025 wide, and each course section is a 22/28.6 600 heading beside an 80px cover over three 326px cards, 24 apart. Cards are white with a 1px `rgba(0, 0, 0, 0.08)` border, radius 16 and a `0 4px 7px rgba(0, 0, 0, 0.04)` shadow that deepens to `0 8px 10px rgba(0, 0, 0, 0.08)` on hover in 160ms; text is `#21252e` with `#757c88` meta. The primary button is `#21252e` at radius 12, lightens to `#333943` on hover and scales to 0.98 when pressed. Most of Gauth's own controls draw no focus ring, which a rebuild should not copy. Everything the capture could not reach is listed under Gaps in [components.md](components.md#gaps).
