# Claude design reference

A token set and component reference for the Claude web app (claude.ai), for self-learn's chat surfaces: the tutor chat on a concept, the sidebar, the library of things the agent made, courses as projects, and settings. It was read on 2026-10-04 from the owner's signed-in account (Max plan), in both themes, at 1440 wide and 390 wide: the home page with its greeting and composer, a chat (the user bubble, Claude's reply with a code block and a table, the message actions), Artifacts, Chats and tasks, Projects and a project page, the Settings dialog, search, every composer and sidebar menu, the hidden sidebar, and the phone layout (home, the drawer sheet, a chat).

The earlier references cover learning products (Duolingo, Brilliant, NotebookLM, Coursera, Gauth) and one agent product (Manus). self-learn's tutor is a chat with a model, and claude.ai is the chat it is most often compared with: a quiet shell, a serif voice for the model and a sans for the interface, one composer that travels between the home page, a chat and a project. This is the reference for getting those surfaces to feel finished.

| File | What it is |
|---|---|
| [tokens.json](tokens.json) | W3C DTCG tokens in Tokens Studio's multi-set layout: `core` (733: the nine 35-step colour ramps, the brand pigments and the role scales; font families including the chat font options; weights with their dark-mode variation axis; the seven type roles as sizes, line heights and 24 composite styles; the cds density scale with its compact value in `$extensions.compact`; the control size steps; durations, easings, z-index, opacity; the sidebar frame's geometry; Tailwind's theme; and the measured layout, radii and sizes), `light` (368) and `dark` (368): the semantic palette grouped by role (surface, text, fill, bg, border, on, alpha, neutral, chart, shadow, control, pictogram, git, editor), the sidebar frame's colours, the older palette Claude still reads (`legacy`), and measured shadows (`component`), plus `$themes`. Every token carries `$extensions.source`; a value DTCG cannot carry is listed under the set's `$extensions.notTokenised`. |
| [style-guide.html](style-guide.html) | One self-contained page that renders every token and the main components (the shell with the sidebar, the composer at rest and typed, buttons, menus, the thread, Artifacts, project cards, settings, the phone layout) with the real values, states side by side, with a Light/Dark toggle that sets `data-mode` the way Claude does. |
| [components.md](components.md) | The discovery list of every page and state captured, one entry per component (132) with crops of the real product, the shared values (hover washes, radii, focus ring, motion, rings), the icon index, and the Gaps. |
| [components/crops/](components/crops) | 494 element screenshots, `{component}-{state}.png`, at 2x. |
| [icons/](icons) | 72 SVGs: 62 glyphs drawn from Claude's icon font (Anthropicons-Variable) and 10 inline SVGs from the pages, named by role, indexed in [icons/INDEX.tsv](icons/INDEX.tsv). They are Anthropic's property, kept for reference only. |
| [screenshots/](screenshots) | 42 `{page}-{theme}-{state}.png` captures. Desktop shots are 1440 x 900 at 2x, `-full` shots whole pages for the dark Artifacts and Chats pages, `mobile-*` shots 390 x 844 at 2x. Every state exists in both themes. |
| [raw/](raw) | The unprocessed readings: every custom property the stylesheets declare, by selector and condition and sorted into Claude's own (`cds`, `app`), one-off utility overrides and Tailwind's internals, with each name resolved on a light, a dark and a compact root, and the font faces (`css-vars.json`); per-component computed styles (`components-computed.json`, and `measurements.md` built from it); the measured values the token builder reads (`component-tokens.json`); page geometry (`layout.json`) and the layout notes written from it (`pages.md`). |
| [tools/](tools) | The three builders and the capture kit. See Rebuild. |

## How the values were read

Claude's interface is built on its design system, cds: every themed root carries `class="cds-root"` and `data-theme="claude"`, `data-mode="light|dark|system"` (system follows `prefers-color-scheme`), `data-density="comfortable|compact"`, `data-font="anthropic|system"` and `data-color-version="v2"`. One stylesheet bundle declares nine colour ramps and the `--cds-role-*` scales on `:where(:root, :host)`, the semantic names on `.cds-root` for light and again under `data-mode="dark"`, and the density scale with a comfortable override (compact is the default when no density is set). The stylesheets are served from assets-proxy.anthropic.com with CORS headers, so the signed-in page's CSSOM could read them and the page copies carry them inline. [vars.mjs](tools/capture/vars.mjs) parses those blocks from the copies (they are identical in every copy and are deduplicated) in a headless Chromium with a constructed CSSStyleSheet, keeps every custom property with its selector and enclosing condition, and then resolves each name the way the browser does on a probe document with Claude's own root attributes, so a value like `hsl(from var(--cds-neutral-900) h s l / 10%)` comes back as `rgba(11, 11, 11, 0.1)`. The token builder aliases a token to another when its declaration is a plain `var()` of a token with the same resolved value.

The pages were captured in the built-in browser pane of the desktop app, signed in, without handing the account to a headless browser. In each page state, [snapshot.js](tools/capture/signed-in/snapshot.js) copied the DOM with every stylesheet inlined from the CSSOM, replaced the account's name and email by the patterns in a redaction file that lives outside the repository (shaped like [redact.example.json](tools/capture/signed-in/redact.example.json)), cut every signed URL back to its path, and marked every scrolled element. [unsnap.py](tools/capture/signed-in/unsnap.py) refuses a copy in which a redacted string or a signing parameter survived. The copies themselves hold the owner's chats, so they stay outside the repository too. [render.mjs](tools/capture/signed-in/render.mjs) renders each copy at 2x, and renders the light theme by setting every `[data-mode]` element to `light`, which is all Claude's own switch does, so no account setting changed: the account was on dark, and every capture started dark.

Claude's popups are Base UI. A closing popup is marked `data-ending-style` (with `data-closed`) and an opening one `data-starting-style`, and Base UI clears both from an animation frame. The pane was hidden while capturing, so no frame ran: closed menus stayed mounted and new ones stayed at their starting style. The copy drops the first and settles the second. The same frozen frames are why modal backdrops may render undimmed, and why the phone drawer could not be closed (it was hidden by hand before the phone chat was copied).

Component values are computed styles read per state with Playwright from the rendered copies ([measure.mjs](tools/capture/signed-in/measure.mjs)): hover with the pointer, focus-visible with a real keyboard focus, both themes by setting every `[data-mode]` to light as render.mjs does. States that need JavaScript (an open menu, the search dialog, the typed composer, the hidden sidebar, the settings dialog, the drawer) were each captured as their own copy, so they are measured in the state they were captured in. The chat is not virtualised, so one copy is read at three scroll positions. The sidebar is hidden in the account's own setting; it was shown for the captures and hidden again afterwards. Nothing was sent, created or deleted: a line was typed into the composer and deleted, and menus were opened and closed. Chat and artifact titles are the owner's own; the name reads "Learner", and two health-related titles were replaced with neutral ones.

Two things to read with care. Syntax-highlighted code keeps the dark theme's inline colours, so code colours in the light renders are wrong; read them from the dark copies. Artifact previews are iframes, kept as dark boxes.

Screenshots are stored as 256-colour PNGs to keep the folder small. Flat UI colours are exact; read values from the tokens, not the images.

## Fonts

| Family | Used for |
|---|---|
| Anthropic Sans (`anthropic-sans`) | Everything in the interface, at the cds type roles: caption 12, footnote 13, body 14, heading 15, title 22 (comfortable). Semibold is 580, bold 600. |
| Anthropic Serif (`anthropic-serif`, `--cds-font-voice`) | The "Claude" wordmark, the home greeting (38/47.5 at weight 300 with the opsz 48 axis), page titles (24/32, 500), and Claude's replies at 16/24, the chat font's default. |
| Anthropic Mono (`anthropic-mono`) | Code blocks and code spans. |
| Anthropicons-Variable | Every icon: one character per glyph, its weight thinned as the size grows. |
| System, OpenDyslexic | The other chat font options in Settings > Appearance (System, Dyslexic friendly); `data-font="system"` swaps the UI sans for the platform face. |

In dark mode the variable faces are drawn lighter: each weight also sets `font-variation-settings` to a lower `wght` (regular 360, medium 460, semibold 540, bold 560), recorded on each `fontWeight` token as `$extensions.darkVariationAxis`.

All four are Anthropic's own faces. No font file is committed or needed: the style guide falls back to the system sans, to Source Serif 4 from Google Fonts as a stand-in for the serif (named as such on the page), and to ui-monospace.

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

`build_tokens.py` reads `raw/css-vars.json` and `raw/component-tokens.json` and writes `tokens.json`; it refuses an alias that points at nothing, an alias to a token of another type, and a dimension that is not one px or rem length. `build_style_guide.py` renders `style-guide.html` from `tokens.json` and `tools/style-guide.template.html`, turning every token into a CSS variable so the page cannot drift from the file. `build_components_md.py` writes `components.md` from `raw/components-computed.json`, `raw/layout.json`, `tokens.json`, the screenshots and `icons/INDEX.tsv`. All three are deterministic.

`tools/capture/` holds the kit the captures came from. The Playwright scripts take `PLAYWRIGHT` as the path to a Playwright install's `index.mjs` (this repository has one under `tools/tldrawkc/node_modules/playwright/`), and the signed-in scripts take `SNAPS` as the directory of page copies, which are not committed. Fonts and images the copies load come from assets-proxy.anthropic.com through a cache beside the copies (`<SNAPS>-cdn-cache`); nothing is requested from claude.ai.

```bash
PLAYWRIGHT=$PWD/../../../../tools/tldrawkc/node_modules/playwright/index.mjs SNAPS=<dir> node tools/capture/vars.mjs
```

```bash
PLAYWRIGHT=... SNAPS=<dir> tools/capture/signed-in/render-all.sh && python3 tools/capture/quantize.py <dir>/renders
```

```bash
PLAYWRIGHT=... SNAPS=<dir> node tools/capture/signed-in/measure.mjs && node tools/capture/signed-in/build-measurements.mjs
```

```bash
PLAYWRIGHT=... SNAPS=<dir> node tools/capture/layout.mjs
```

```bash
PLAYWRIGHT=... HB=<harfbuzzjs dir> WAWOFF2=<wawoff2 dir> SNAPS=<dir> node tools/capture/icons.mjs
```

`icons.mjs` draws the icon-font glyphs with harfbuzzjs after decompressing the font with wawoff2; both default to the copies under `tools/tldrawkc/node_modules/`. Names come from [icon-names.tsv](tools/capture/icon-names.tsv). To take a new page copy: open the page in a signed-in tab, paste `snapshot.js` into its console, call `__snap('<page>-dark-<state>', REDACT)` with the redaction file's contents, save the returned string to a file and run `unsnap.py <file> <dir>`; add the label to [shots.tsv](tools/capture/signed-in/shots.tsv).

## Use in Figma

Import `tokens.json` with Tokens Studio and choose the Light or Dark theme. Set the UI font to Inter or SF Pro and the serif to a book serif such as Source Serif 4 or Tiempos (Anthropic's faces are not available). Sizes are the comfortable density; the compact values are in each token's `$extensions.compact`.

## Claude's surfaces and self-learn's

| Claude | Layout | self-learn |
|---|---|---|
| Sidebar | 288 px on its own ground, a step darker than the page in dark: the serif wordmark with Hide sidebar and Search, the Home/Code pills, New (⇧⌘O), Artifacts and More, a Pinned section, "Chats and tasks" whose rows lead with a 6px hollow ring and fade at the end, the account row with the plan. Hidden, it leaves one button in the corner; on a phone it is a full-screen sheet. | The sidebar in `apps/web/src/components/shell/AppSidebar.tsx`, whose list is New chat (the studio) and `DESTINATIONS` in `apps/web/src/lib/nav.ts` (Home, Courses, Learn, Library), with the studio's conversations where Claude puts its chats |
| Home greeting and composer | The serif greeting led by the clay asterisk, over a 672 px composer: radius 20 on surface-3 with a 1px ring, the editor, then +, a Chat/Cowork segmented control, the model and effort, dictation and voice; typing swaps voice for the clay send button. | `/home` and its Ask box, and the new-chat screen of the studio |
| Chat | A 768 px transcript: the user's right-aligned bubble (a 5% wash, radius 12), "Thought for 6s", the reply in Anthropic Serif 16/24 with code blocks and tables, actions that show on hover, the composer docked at the bottom with the disclaimer under it. | the tutor on `/learn/<concept>` and `/ask` |
| Artifacts | A 960 px page: a serif title, tabs (All, Yours, Shared with you), Make something new tiles, then month groups of rows (icon, title, a muted line, visibility, date, more). | `/library` and the studio's diagrams and videos |
| Projects and a project page | A two-column grid of cards; a project has a breadcrumb, a title, its own composer, Recents, and a right rail of Instructions, Memory and Context cards. | courses (`/courses` and a course page) |
| Settings | A 1024 x 800 dialog: a 192 px nav with search and two groups, a pane of titled groups whose rows put the control at the end (a System/Light/Dark icon picker, selects, switches). | `/settings` |

## The screen to get right

The chat. Everything Claude does to make a model feel calm happens there: the reply is set in a serif at reading size on a 768 px measure, the user's words sit in a faint bubble at the right edge, the reasoning folds into one muted line, and the controls (copy, rating, retry) stay hidden until the pointer reaches the turn. The composer is the only raised object on the page, a 20 px card with a hairline ring that darkens on focus, and the one colour in the whole view is the clay of the send button. self-learn's tutor on `/learn/<concept>` has to read the same way: a serif voice for the tutor, a sans for the interface, one docked composer, and nothing coloured except the action that sends.
