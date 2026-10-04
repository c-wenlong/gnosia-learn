# ChatGPT pages: layout notes

Written by hand from [layout.json](layout.json) (`tools/capture/layout.mjs`, read on 2026-10-04 from the static signed-in page copies at 1440 x 900, and the `mobile-*` ones at 390 x 844) and the screenshots. Every number is a measured box in CSS pixels; x is from the left edge of the viewport. Colours are the dark theme first, then the light one, from [components-computed.json](components-computed.json).

## The app shell

| Part | 1440 | 390 |
|---|---|---|
| Sidebar | `#stage-slideover-sidebar`, 260 wide (`--sidebar-width`), full height, `--sidebar-surface-primary` #000000 (light #fcfcfc), a 1px `--border-extra-light` rule at its end (white at 10% / black at 5%) | `#stage-popover-sidebar`, the same 260 wide column as a fixed `role=dialog` drawer over the page, a 0 0 64px shadow at 7% |
| Tiny rail | `#stage-sidebar-tiny-bar`, 52 wide (`--sidebar-rail-width`, 13 spacing units; 56 on a coarse pointer): open sidebar, new chat, search, then the avatar at the bottom, 36x36 buttons from x 8 | none |
| Page ground | `<body>`, `--main-surface-primary` #000000 (light #fcfcfc); the main column `main#main` starts at x 260 and is 1180 wide | full width from y 53 |
| Page header | `#page-header`, sticky, 52 tall (`--header-height`), padding 8: the Chat / Work toggle (two 130x36 segments) centred at x 720, Upgrade (106x34) and a 36x36 button at the end, a 8 gutter | the same 52 tall row: the menu button at x 8, the model switcher (115x36) at x 44, Upgrade and one or two 36x36 buttons at the end |

Inside the sidebar: the 52 tall header (the wordmark link 95x36 at x 8, search and close at x 180 and 216), then nav rows from y 60, 248 wide at x 6, 36 tall on a 36 pitch. Section labels (Pinned at y 324, Projects at y 484, Chats at y 680) are 32 tall buttons with the label at x 16, 20px (`--sidebar-section-margin-top`, 1.25rem) above each. The account row is 248x52 at y 842, sticky at the bottom over a hairline. Rows have radius 10; hover and the current page fill them with `--interactive-bg-secondary-hover` and `-selected` (white at 10% / black at 5%).

The collapsed copy kept the expanded 260 wide container (its width is animated by script, and no frame ran) with the rail drawn inside it, so the main column did not move to x 52 there. In the product the main column starts at the rail's edge.

## Home (`/`)

- One 768 wide column centred in the main column: x 466 at 1440 with the sidebar open (`div.mx-auto.flex-1`, max-width 768).
- The heading ("What's on the agenda today?" or "How can I help, Learner?") is `text-heading-2` at 400 weight, 24/28, centred at y 314.
- The composer sits under it at y 378: 768x52, radius 28, #212121 (light #ffffff). Inside, the + button (36x36) at x 474, the ProseMirror field (523 wide, 16/26) at x 517, the Think chip (92x36) at x 1050, dictation at x 1146 and the voice button at x 1190, all on y 386. In dark the box carries a 1px inset ring of white at 20%; in light a 1px ring of black at 4% and two soft layers.
- Three suggestion rows follow at y 454, each 768x52, 52 apart.

## Thread (`/c/<id>`)

- The thread scrolls inside its own scroller under the header. Its column is 768 wide at x 466 (`group/turn-messages`, max-width 768); each turn is a `section` the full 1180 wide.
- The composer is pinned at the bottom, 768x52 at y 824, over the end of the thread.
- The user bubble is right-aligned at most 70% of the column (`--user-chat-width`), here 538 wide, radius 22, padding 10/16, 16/24 text, `--theme-user-msg-bg` #173e76 on #f6fafe (light #e8f3fe on #0c274a).
- The answer is the `.markdown` body, 768 wide, 16/26. Headings are 18/28 600, tables 14/24 with 8/24 cell padding and the header row 14/16 600. Citation pills are 18 tall inline chips. The map widget is 768x416.
- Only five turns exist in the copy (the virtualised list rendered turns 6 to 10); the first five are placeholders.

## Library (`/library`)

- A 137 tall sticky toolbar band at the top of the main column holds the h1 "Library" (24/28 500) at x 308, y 80, and at the end the filter, grid and list buttons (36x36 at x 878, 939, 979), the 240x36 search field, New (77x36, inverted) at x 1279 and settings at x 1364. The pill tabs run from x 308 at y 140, 36 tall.
- The content is 1092 wide from x 308 (48 padding on each side of the 1180 column). The list header is 42 tall at y 189 with a three column grid, 814, 160 and 64 wide, 16 apart: Name, Last activity, actions.
- Rows are 60 tall on a 60 pitch from y 231, a 32x32 tile (thumbnail or type icon, radius 8) then the 14/20 name at x 366, the date in the second column.

## Images (`/images`)

- The 800 wide `max-w-app-content` box at x 450: the title "Images" (28/34) at y 176, the composer (768x52) at y 224 with its own placeholder, then Trending and Templates tabs at y 335.
- Template cards are 186x233 with radius 16, four to a row from x 466, 194 apart (8 between cards), rows 240 apart from y 380.

## Plugins (`/plugins`)

- The same 800 wide box. The h1 "Plugins" (28/36 500) at x 466, y 168, the subtitle under it, the 240x36 search field at x 946 and a 36x36 round add button at x 1198 on the same row.
- Sections (Installed, Popular, New & Noteworthy) are 14/20 500 labels; each holds a two column grid of 384 wide rows, 8 apart across and on a 72 pitch down. A row is 384x56, radius 16, padding 8: a 40x40 icon tile (radius 12), the name over a one line description, and a 32x32 + at the end.

## Project (`/g/<project>/project`)

- The 800 wide box again: the project icon button (36x36) at x 466 and the title (28/34 500) at x 508, y 116; Share (88x36, outline pill) and a 36x36 details button at the end.
- The composer (768x52) at y 176 with "New chat in Research".
- Chats and Sources tabs at y 260 (38 tall), then chat rows 768x65 from y 314: a 14/20 500 title over a one line preview, the date at the end, hairlines between rows.

## Dialogs

- Settings: 680x600 at (380, 133), radius 16, #212121 (light #ffffff). A 209 wide nav column (tabs 197x36 from x 386, y 237, under a close button and a search field) and a 470 wide pane at x 590 whose rows are 438x60.
- Search: a 720x462 panel at (360, 195), radius 16, with a 64 tall input row and 48 tall result rows inset 12.
- Menus: the chat row menu 206 wide and the user menu 248 wide (radius 20, padding 10, #353535 in dark), the accent listbox 220x300 (radius 16), the + menu 768x376 at the composer's width (radius 20, #212121).

## Phone (390 x 844)

- The header is the 52 tall row with the menu button and the model switcher; there is no sidebar until the menu button opens the drawer.
- The composer is 358x87 at x 16, y 733, radius 26, in two rows: the field over a tool row (+ at x 24, dictation at x 286, voice at x 330).
- In the thread the column is 358 wide at x 16 and the user bubble keeps 70% of it (251 wide).
- The drawer is the 260 wide sidebar at x 0 over the page; the copy had its slide-in transform set to its end state by hand.
