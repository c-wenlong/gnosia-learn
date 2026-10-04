# Manus design reference

A token set and component reference for Manus's web app (manus.im/app), for rethinking self-learn's shell and its content management: the multi-section sidebar that replaces a top bar, and the Library that organises every kind of file an agent made by type and by the day it was made. It was read on 2026-10-04 from the owner's signed-in account, in both themes, at 1440 wide and 390 wide: the home, the Library (list, grid, grouped by task, each type tab, the row menu, the view options, the document previewer), Creations, Computers, Agents, Automations, Plugins, a project page, a finished task (the thread, the deliverable card, the files dialog, the split view with its Files tab), the user menu, Settings (General and Shortcuts), search, notifications, every sidebar menu, and the phone layout (app gate, home, drawer, Library, task).

The earlier references cover learning products (Duolingo, Brilliant, NotebookLM, Coursera, Gauth). Manus is an agent product whose output is files, which is what self-learn has become too: notes, diagrams, videos, sessions and courses that pile up with no date to hang them on. Its Library is the model for that problem.

| File | What it is |
|---|---|
| [tokens.json](tokens.json) | W3C DTCG tokens in Tokens Studio's multi-set layout: `core` (114: font families and weights, the `--ui-*` type scale as sizes, line heights and 14 composite type styles, the `--ui-density-*` scale with its Compact override, radii, sizes, durations, easings, breakpoints and the measured layout), `light` (282) and `dark` (282): Manus's two palettes, grouped by role (text, icon, background, border, fill, function, button, tab, shadow, gradient, overlay, activity-indicator, illustration, game, accent), plus `$themes`. Every token carries `$extensions.source`; a value DTCG cannot carry is listed under the set's `$extensions.notTokenised` rather than dropped. |
| [style-guide.html](style-guide.html) | One self-contained page that renders every token and the main components (the shell, the collapsed rail, buttons and chips, the Library with its tabs, rows, grid card and menus, the task thread with its deliverable card and composer, settings controls, the phone layout) with the real values, states side by side, with a Light/Dark toggle that flips the same `dark` class Manus does. |
| [components.md](components.md) | The discovery list of every page and state captured, one entry per component with crops of the real product, the shared values (hover fills, radii, motion, focus) and the Gaps. |
| [components/crops/](components/crops) | Element screenshots, `{component}-{state}.png`, at 2x. |
| [icons/](icons) | 161 SVGs lifted from the pages, named by role in [icons/INDEX.tsv](icons/INDEX.tsv) (76 by role, the rest by their Lucide name or a hash), and the eight task-type glyphs Manus serves as images under `icons/session/`. Manus's marks are its property, kept for reference only. |
| [screenshots/](screenshots) | 89 `{page}-{theme}-{state}.png` captures. Desktop shots are 1440 x 900 at 2x, `-full` shots whole pages at 2x for the base pages only, `mobile-*` shots 390 x 844 at 2x. Every state exists in both themes. |
| [raw/](raw) | The unprocessed readings: every custom property the stylesheets declare, by file, selector and condition, with the font faces (`css-vars.json`); per-component computed styles (`components-computed.json`, and `measurements.md` built from it); the measured values the token builder reads (`component-tokens.json`); page geometry (`layout.json`) and the layout notes written from it (`pages.md`). |
| [tools/](tools) | The three builders and the capture kit. See Rebuild. |

## How the values were read

Manus is a Next.js app styled with Tailwind utilities over CSS variables: a class reads `bg-[var(--background-nav)]` or `rounded-[var(--ui-density-row-radius)]`, and nearly every colour on a page is a `var()` of one of 124 names a single stylesheet chunk declares on `:root` (light) and again on `.dark` (dark). So there was no palette to infer: the token file's `light` and `dark` sets are those two blocks, the `core` set is the `--ui-font-size-*` / `--ui-line-height-*` scale and the `--ui-density-*` scale from the main chunk, and only a dozen layout numbers (the 300 px sidebar, the 52 px rail, the 48 px bars, the 800 px thread column, the 28 px avatar) had to be measured on the elements. The stylesheets are served from files.manuscdn.com, cross-origin to the app, so the page's own CSSOM refuses to read them; [vars.mjs](tools/capture/vars.mjs) fetches the chunks and parses them in a headless Chromium instead.

The pages were captured without handing the account to a headless browser. In the signed-in tab, [snapshot.js](tools/capture/signed-in/snapshot.js) copied each page state's DOM with the same-origin styles inlined and the cross-origin stylesheets kept as links, replaced the account's name with "Learner" and its avatar photo with a plain disc (the redaction file lives outside the repository, shaped like [redact.example.json](tools/capture/signed-in/redact.example.json)), cut every signed URL back to its path, inlined the Library's thumbnails (the account's own files, served from a private CDN with a signed query, which the page may fetch) as small JPEG data URLs, and recorded the position of every inner scroller. [unsnap.py](tools/capture/signed-in/unsnap.py) refuses a copy in which a redacted string or a signing parameter survived. [render.mjs](tools/capture/signed-in/render.mjs) then renders each copy at 2x, and renders the light theme by removing the `dark` class from `<html>`, which is all Manus's own theme switch does, so no account setting was changed: the account was on Auto with a dark system, and every capture started dark.

Two things a static copy cannot do. The task thread is a virtualised list inside its own scroller: only the turns near the live scroll position exist in the copy, so the renderer restores that position (or scrolls to the first rendered turn), and a `-full` shot of a task page would be mostly empty, so there is none. And the slide preview inside a deliverable card is an iframe, which the copy keeps as a same-size dark box; the card's chrome is real, its contents are not.

Component values are computed styles read per state with Playwright from the rendered copies ([measure.mjs](tools/capture/signed-in/measure.mjs)): hover with the pointer, focus-visible with a real keyboard focus, both themes by toggling the class. States that need JavaScript (an open menu, the files dialog, the typed composer, the collapsed rail, the grid view, the group-by-task view) were each captured as their own copy in the live tab, so they are measured in the state they were captured in. The task titles and document titles in the screenshots are the owner's own; nothing was created, sent, deleted or changed in the account beyond opening menus, switching the Library's view options (and switching them back), typing a line into the composer and deleting it, and toggling the sidebar.

Screenshots are stored as 256-colour PNGs to keep the folder small. Flat UI colours are exact; read values from the tokens, not the images.

## Fonts

| Family | Weights | Used for |
|---|---|---|
| System stack (`-apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Helvetica, Arial`) | 400, 500, 600, 700 | Everything in the interface. Manus ships no web font for UI text. |
| Libre Baskerville | 400, 700 | The home's "What can I do for you?", the wordmark, the share banner's title, the document previewer's titles, promo cards. Self-hosted by Manus; the Chinese, Taiwanese and Japanese locales swap in Noto Serif SC, TC and JP through `--font-noto-serif-*`. |
| ui-monospace stack | 400 | File names, code, the terminal panel |
| KaTeX | | Maths in documents |

Libre Baskerville is open source, so the style guide loads it from Google Fonts; no font file is committed or needed.

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

`build_tokens.py` reads `raw/css-vars.json` and `raw/component-tokens.json` and writes `tokens.json`; it refuses an alias that points at nothing. `build_style_guide.py` renders `style-guide.html` from `tokens.json` and `tools/style-guide.template.html`, turning every token into a CSS variable so the page cannot drift from the file. `build_components_md.py` writes `components.md` from `raw/components-computed.json`, `raw/layout.json`, `tokens.json`, the screenshots and `icons/INDEX.tsv`. All three are deterministic.

`tools/capture/` holds the kit the captures came from. The Playwright scripts take `PLAYWRIGHT` as the path to a Playwright install's `index.mjs` (this repository has one under `tools/tldrawkc/node_modules/playwright/`), and the signed-in scripts take `SNAPS` as the directory of page copies, which are not committed since they hold the owner's content.

```bash
PLAYWRIGHT=$PWD/../../../../tools/tldrawkc/node_modules/playwright/index.mjs node tools/capture/vars.mjs
```

```bash
PLAYWRIGHT=... SNAPS=<dir> node tools/capture/signed-in/render.mjs <dir> library-dark full light
```

```bash
PLAYWRIGHT=... SNAPS=<dir> node tools/capture/signed-in/measure.mjs
```

```bash
SNAPS=<dir> node tools/capture/icons.mjs
```

`python3 tools/capture/quantize.py <dir of renders>` stores renders into `screenshots/`. To take a new page copy: open the page in a signed-in tab, paste `snapshot.js` into its console, call `await __inline()` on a page with thumbnails, then `__snap('<page>-dark-<state>', REDACT)` with the redaction file's contents, save the returned string to a file and run `unsnap.py <file> <dir>`.

## Use in Figma

Import `tokens.json` with Tokens Studio and choose the Light or Dark theme. Set the UI font to Inter or SF Pro (the system face Manus relies on is not a web font) and the display font to Libre Baskerville.

## Manus's surfaces and self-learn's

| Manus | Layout | self-learn |
|---|---|---|
| Sidebar | 300 px, one column: a logo row with search and collapse, eight nav tabs (New task, Computers, Agents, Library, Creations, Automations, Plugins, More), a Projects section of folders, a Tasks section of recent threads with their type glyph, a share banner, the account row with notifications. Collapses to a 52 px rail of glyphs; on a phone the same column slides in as a drawer. | The sidebar in `apps/web/src/components/shell/AppSidebar.tsx`, whose list (`DESTINATIONS` in `apps/web/src/lib/nav.ts`) is New chat, Home, Courses, Learn and Library, with the chat history where Manus puts projects and tasks |
| Library (`/app/documents`) | A title bar with search, view options and a grid/list switch; a strip of type tabs (All, Text & PDF, Slides, Spreadsheets, Images, Videos, Audio, Others); then groups by day, newest first, each a date with its count, each row an icon, the title, the task it came from, the time and a menu (Download, Save to, Share, Locate in task, Add to favorites, Send to Manus). View options switch the grouping to by task. Grid view shows thumbnails. A row opens a full-screen previewer. | `/library`, where notes, diagrams, videos, sessions and course files have kinds but no date groups |
| Task page | The thread (user bubble, agent turns with a step checklist, tool cards, a deliverable card with a preview and file chips, "View all files in this task", Task completed, rating, follow-up suggestions), the step footer over a 22 px-radius composer, and a split view to the right with Files, Slides, Canvas and Video tabs. | `/learn/<concept>` with its tutor and the studio's conversation |
| Creations | Tabs (All, Websites, Games, Mobile apps) and wide cards with a thumbnail, a title, the task it came from, a URL chip and Locate in task, Edit in new task, Make a copy. | the studio's diagram and video library |
| Project page | A header, the project's recent tasks, a composer, and a right rail of cards (Instructions, Connectors, Files & sources, Skills, Website, Triggered tasks). | a course page |
| Settings | A dialog with a left nav (Account, Settings, Capabilities, Assets, Data & Integrations) and a General pane with Language, a three-card Theme picker (Light, Dark, Auto), chat and communication preferences as toggle rows. | `/settings` |
