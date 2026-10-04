# ChatGPT design reference

A token set and component reference for ChatGPT's web app (chatgpt.com), for self-learn's chat surfaces: the concept tutor's thread and composer, the sidebar with its chat history, the Library and the settings. ChatGPT is the product most learners already know a chat by, so its sizes and states are the baseline a tutor chat gets compared with. It was read on 2026-10-04 from the owner's signed-in account (Free plan), captured dark with the blue accent, at 1440 wide and 390 wide: the home (at rest, with the + menu, a chat row's menu, the user menu, the search dialog, a typed composer and the collapsed sidebar), a thread (a table answer, a user turn with the reasoning disclosure and a map, the bottom), the Library, Images, Plugins, a project page, the settings dialog with its accent listbox, and the phone layout (home, drawer, thread, model menu).

The earlier references cover learning products (Duolingo, Brilliant, NotebookLM, Coursera, Gauth) and an agent product (Manus). ChatGPT is the plain chat they all borrow from.

| File | What it is |
|---|---|
| [tokens.json](tokens.json) | W3C DTCG tokens in Tokens Studio's multi-set layout: `core` (313: the primitive grey and hue scales, font families and weights, Tailwind's size scale and ChatGPT's 32 named text styles as composite typography, spacing, radii, shadows, blur, containers, breakpoints, durations, easings, and the layout variables with the measured sizes), `light` (751) and `dark` (754): ChatGPT's two palettes by role (bg, text, icon, border, surface, theme, accent, chart, misc, interactive, component) and `chatTheme`, the accent palette, one group per `data-chat-theme` value, plus `$themes`. Every token carries `$extensions.source`; display-p3 values, the high-contrast override and coarse-pointer sizes sit in `$extensions`; a value DTCG cannot carry is listed under the set's `$extensions.notTokenised`. |
| [style-guide.html](style-guide.html) | One self-contained page that renders every token and the main components (the shell, the rail, buttons, the composer and its states, the thread with a bubble, markdown, a table and pills, the menus, search and settings, the Library, Images, Plugins and project page, the phone) with the real values, states side by side. Its Dark toggle flips the `dark` class and its Accent picker sets `data-chat-theme`, which is how ChatGPT switches both. |
| [components.md](components.md) | The discovery list of every page and state captured, one entry per component with crops of the real product, the shared values (hover fills, radii, motion, focus), the icon index and the Gaps. |
| [components/crops/](components/crops) | Element screenshots, `{component}-{state}.png`, at 2x. |
| [icons/](icons) | 77 SVGs lifted from the sprite symbols inlined in the page copies, named by sprite id, with [icons/INDEX.tsv](icons/INDEX.tsv). They are OpenAI's icons, kept for reference only. |
| [screenshots/](screenshots) | 43 `{page}-{theme}-{state}.png` captures. Desktop shots are 1440 x 900 at 2x, `-full` shots whole pages at 2x for the home, Library and Plugins, `mobile-*` shots 390 x 844 at 2x. Every state exists in both themes. |
| [raw/](raw) | The unprocessed readings: every custom property the stylesheets declare, by sheet, selector and condition, with the font faces and the value each root-level name computes to in both themes and every accent (`css-vars.json`); per-component computed styles (`components-computed.json`, and `measurements.md` built from it); the measured values the token builder reads (`component-tokens.json`); page geometry (`layout.json`) and the layout notes written from it (`pages.md`). |
| [tools/](tools) | The three builders and the capture kit. See Rebuild. |

## How the values were read

ChatGPT is a React app styled with Tailwind 4 over CSS variables. A class reads `bg-token-main-surface-primary` (a Tailwind theme key for `--main-surface-primary`), `bg-(--sidebar-surface-primary)` or `[--code-block-surface:var(--bg-elevated-secondary)]`, and the palette is declared on `html, .light, .dark .light` (light) and `.dark` (dark), so a `.light` box inside a dark page renders light. The declarations are spread over several cascade layers and most are var() chains into a primitive scale (`--gray-*`, `--blue-*` and so on). So [vars.mjs](tools/capture/vars.mjs) records two things: every declaration, by sheet, selector and enclosing condition, and the value each root-level name actually computes to on `<html>` in each theme and under each of the eight `data-chat-theme` values. The token builder takes each value from the computed reading and writes it as an alias only where the name's own declaration points at another token with the same value. Display-p3 overrides for the accent hues are read separately and kept beside the sRGB value.

The pages were captured without handing the account to a headless browser. In the signed-in built-in browser pane, [snapshot.js](tools/capture/signed-in/snapshot.js) copied each page state's DOM with every same-origin stylesheet inlined from the CSSOM (chatgpt.com serves its CSS from its own origin, so all of it was readable), copied the symbols of the external icon sprites into a hidden `<svg data-sprites>` at the end of `<body>` and pointed each `<use>` at them, replaced the account's name with "Learner" and its photo with a grey disc, cut every signed URL back to its path, and inlined the Library's thumbnails (the account's own files) as small JPEG data URLs, leaving out the thumbnails of a screenshot and of two agreements, whose titles the redaction also shortened. The redaction file lives outside the repository, shaped like [redact.example.json](tools/capture/signed-in/redact.example.json); the emoji the account's display name begins with is removed by a rule of its own, and the page copies themselves stay outside the repository too. [unsnap.py](tools/capture/signed-in/unsnap.py) refuses a copy in which a redacted string, a signing parameter or the account photo's URL survived.

[render.mjs](tools/capture/signed-in/render.mjs) renders each copy at 2x, refusing any `backend-api` request, and renders the light theme by removing `dark` from every element (ChatGPT puts it on `<html>` and again on each message's markdown body), so no account setting changed. Component values are computed styles read per state with Playwright from the rendered copies ([measure.mjs](tools/capture/signed-in/measure.mjs)): hover with the pointer, focus-visible with a real keyboard focus, both themes by removing the class. States that need script (an open menu, the dialogs, the typed composer, the collapsed sidebar, the drawer) were each captured as their own copy, so they are measured in the state they were captured in.

The pane was hidden during capture, so no animation frame ran. Entrance animations froze where they started: modal backdrops render undimmed, the phone drawer's slide-in transform was set to its end state by hand before the copy, and the collapsed sidebar kept its 260 wide container with the rail drawn inside it. The thread is a virtualised list and only the last turns were rendered, so there is no shot of a thread's top. The map widget is an iframe, kept as a dark box, and lazy template thumbnails on Images stayed blank. No code block appeared in any of the account's threads, so code-block styling comes from its CSS only. Nothing was sent, created or deleted: a line was typed into the composer and deleted, menus were opened and closed, and the sidebar was collapsed and reopened. Chat titles in the screenshots are the owner's own.

Screenshots and crops are stored as 256-colour PNGs to keep the folder small. Flat UI colours are exact; read values from the tokens, not the images.

## Fonts

| Family | Weights | Used for |
|---|---|---|
| System stack (`-apple-system-body, ui-sans-serif, -apple-system, system-ui, Segoe UI, Helvetica, Arial`) | 400, 500, 600 | Everything in the interface. `--font-sans` is this stack unless `body[data-type-stack="openaisans"]` is set, which it was not on the captured account. |
| OpenAI Sans | 600 | The sidebar's "ChatGPT" wordmark only (`.header-wordmark`, `.font-oai`). OpenAI's own face, served from cdn.openai.com in 300 to 700 with Greek, Cyrillic, Arabic and other script files. |
| ui-monospace stack | 400 | Code (`--font-mono`). |
| OpenDyslexic | 400, 700 | An accessibility option the stylesheet declares (`body[data-type-stack="open-dyslexic"]`). |

OpenAI Sans is proprietary, so the style guide falls back to the system face and no font file is committed or needed.

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

`build_tokens.py` reads `raw/css-vars.json` and `raw/component-tokens.json` and writes `tokens.json`; it refuses an alias that points at nothing, an alias whose type differs, and a dimension that is not one px or rem length. `build_style_guide.py` renders `style-guide.html` from `tokens.json` and `tools/style-guide.template.html`, turning every token into a CSS variable so the page cannot drift from the file. `build_components_md.py` writes `components.md` from `raw/components-computed.json`, `raw/layout.json`, `tokens.json`, the screenshots and `icons/INDEX.tsv`. All three are deterministic.

`tools/capture/` holds the kit the captures came from. The Playwright scripts take `PLAYWRIGHT` as the path to a Playwright install's `index.mjs` (this repository has one under `tools/tldrawkc/node_modules/playwright/`) and `SNAPS` as the directory of page copies, which are not committed since they hold the owner's content.

```bash
PLAYWRIGHT=$PWD/../../../../tools/tldrawkc/node_modules/playwright/index.mjs SNAPS=<dir> node tools/capture/vars.mjs
```

```bash
PLAYWRIGHT=... SNAPS=<dir> tools/capture/signed-in/render-all.sh [label ...]
```

```bash
PLAYWRIGHT=... SNAPS=<dir> node tools/capture/signed-in/measure.mjs [label ...]
```

```bash
node tools/capture/signed-in/build-measurements.mjs
```

```bash
PLAYWRIGHT=... SNAPS=<dir> node tools/capture/layout.mjs
```

```bash
PLAYWRIGHT=... SNAPS=<dir> node tools/capture/icons.mjs
```

`python3 tools/capture/quantize.py <dir of renders>` stores renders into `screenshots/`. To take a new page copy: open the page in a signed-in tab, paste `snapshot.js` into its console, `await __sprites()` (and `await __inline()` on a page with thumbnails), then `__snap('<page>-dark-<state>', REDACT)` with the redaction file's contents, save the returned string to a file and run `unsnap.py <file> <dir>`. Labels and their scroll positions are in [shots.tsv](tools/capture/signed-in/shots.tsv).

## Use in Figma

Import `tokens.json` with Tokens Studio and choose the Light or Dark theme. Set the UI font to SF Pro or Inter (the system face ChatGPT relies on is not a web font). The accent palette is the `chatTheme` group of each set; pick the accent's group for the bubble and send button.

## ChatGPT's surfaces and self-learn's

| ChatGPT | Layout | self-learn |
|---|---|---|
| Sidebar | 260 px: the wordmark with search and close, nav rows (New chat, Images, Library, Scheduled, Plugins, Codex, More), collapsible Pinned, Projects and Chats sections, the account row with an Upgrade pill. Closes to a 52 px rail; on a phone the same column is a drawer. | The sidebar in [AppSidebar.tsx](../../../../apps/web/src/components/shell/AppSidebar.tsx), whose list is `DESTINATIONS` in [nav.ts](../../../../apps/web/src/lib/nav.ts) (Home, Courses, Learn, Library) under New chat, with the studio's conversations where ChatGPT puts its chat history |
| Thread and composer | A 768 wide column: the user bubble in the accent colour (radius 22, 70% max), the answer as 16/26 markdown with tables and citation pills, a "Worked for" disclosure, actions under a turn on hover, and the pill composer (radius 28) with +, Think, dictation and voice or send. | The concept tutor at `/learn/<concept>` |
| Library | A title with filter, grid and list buttons, search and New; pill tabs (Suggested, Favorites, Folders, Images, All); a list of files with a type tile or thumbnail and the last activity, 60 tall rows. | `/library` |
| Project page | The project's icon and title, Share and details, its own composer ("New chat in Research"), Chats and Sources tabs, and its chats with a preview line and date. | A course page |
| Settings dialog | A 680 x 600 dialog: close, a search field and a left nav of tabs, then a pane of rows with select buttons and toggles (Appearance, Contrast, Accent color, Language, Dictation). | `/settings` |

## The screen to get right

The thread. Everything else in ChatGPT is a frame around one 768 wide column where a grey-on-black (or black-on-white) answer at 16/26 sits under a single coloured bubble, with the composer pinned under both at the same width. The colour is spent only on the learner's own words and the send button; the answer, the sidebar and every control stay grey, and hover is a 5 to 10% fill. A tutor chat that adds colour, cards or chrome to the answer side reads as busier than the thing learners compare it with, so `/learn/<concept>` should match this column, bubble and composer first and add its own pieces (checks, diagrams, the review card) inside that frame.
