# Manus pages: layout notes

Written by hand from [layout.json](layout.json) (`tools/capture/layout.mjs`, read on 2026-10-04 from the static signed-in snapshots at 1440 x 900, and the `mobile-*` ones at 390 x 844) and the screenshots. Every number is a measured box in CSS pixels; x is from the left edge of the viewport. Colours are the dark theme first, then the light one, from [components-computed.json](components-computed.json).

## The app shell

| Part | 1440 | 390 |
|---|---|---|
| Sidebar | `nav`, 300 wide, full height, #1f1f1f (light #f0f0f0), a 1px rule drawn by `nav::after` at its end (white at 6% / black at 6%) | the same 300 wide `nav`, `position: fixed`, parked at x -300 and slid to x 0 as a drawer |
| Collapsed sidebar | a 52 wide rail of 36x36 icon tabs; the main column starts at x 52 and is 1388 wide | none |
| Main column | `#manus-home-page-session-content`, x 300, 1140 wide, `--background-gray-main` #1a1a1a (light #f8f8f7) | full width, under a 65 tall fixed app banner |
| Top bar | a sticky 48 tall row at the top of the main column: the model picker (154x32) at x 316, y 8; the right-hand cluster ends at x 1416, a 24 gutter | the same row, sticky at top 60 (under the banner), with a menu button at x 16 |

Inside the sidebar: a 48 tall logo row (mark and wordmark at x 10, search and collapse buttons at x 222 and 258), then 36 tall nav tabs on a 37 pitch from y 56, 8 in from each edge (284 wide), then the scrolling list (y 130 to 798) holding the Projects and Tasks sections, whose headers are sticky at top 0 and the project row at top 36. The footer (y 798, 102 tall) holds the 54 tall share banner and the 32 tall account row. Nav tabs have radius 10; hover fills them white at 4% (light: #37352f at 4%), the current page white at 6% (light 6%).

## Home (`/app`)

- One 768 wide column, centred in the main column: x 486 at 1440 (it sits in an 800 max-width box with 16 padding). With the sidebar collapsed it moves to x 362.
- The logo (an h1 holding two SVGs, 376x64) at y 193, with the promo carousel card (252x56, radius 12, black) at the end of the same row (x 1002) and its two 14 wide dots stacked beside it.
- A two-column grid at y 285, columns 490 and 270, 8 apart (10 between rows): Build and Create cards (490x130 each) on the left, "Start from a local file" (270x270) spanning both rows on the right.
- The composer is sticky at the bottom: a 768x200 band from y 700 with a gradient to the ground and 48 top padding, holding the composer box (768x120 at y 748, radius 22, #242424 / white). Inside, a 50 tall editor (16 start padding) and a 32 tall tool row at y 823 (+ button, connector chips, Manus Desktop chip; agent mode, microphone and send at the end). The disclaimer line under it (y 876) is present but `invisible` on Home.

## Library (`/app/documents`)

- A 112 tall header band: the h1 "Library" (18/24 500) at x 324, y 12; at the end the search field (240x32 at x 1060), the view-options button (32x32 at x 1308) and the grid/list segmented control (68x32 at x 1348, two 32x28 options, a white thumb under the active one). The second row holds the type tabs: eight 32 tall tabs from x 370, y 56, 4 apart.
- The content column is a 1048 max-width box with 24 padding, so 1000 wide from x 370 to 1370. It scrolls inside its own 788 tall scroller (y 112 to 900).
- List view: a date heading ("May 3 (2)", 14/20 with a 12px grey count) 20 tall, rows 32 below it. Each row is 67 tall on a 67 pitch; its hover box bleeds 12 past the column on both sides (x 358, 1024 wide, radius 8) while the 1px `--border-main` rule stays on the inner 1000 row. Inside: a 24px file icon at x 378, the title (14px) and source task (13/18 grey) at x 414, the time (12px grey) right-aligned to x 1314, and a 32x32 more button at x 1338. Groups are 40 apart.
- Grid view (Images): three columns of 322.66 with 16 gaps inside the 1000 column; cards are 323x258 (radius 12, a 0.5px `--border-dark` hairline), a 56 tall title row over the thumbnail. "Group by task" swaps the date heading for a task-name link (16/22 500) with its date at the end.
- The row menu (280 wide), view options (192 wide) and account menu (284 wide) open as popovers next to their triggers.
- The document previewer is a 1200x820 panel at (120, 40) over a dimmed, 4px-blurred mask: a 48 tall header (title, "Last modified", five 28x28 tools), then a scroll area with 48 side padding and 20 top padding holding a 712 wide document column (x 364).

## Creations, Computers, Agents, Automations, Plugins

- Creations: the Library header band (112 tall, title, search, four tabs). Cards fill a 1000 wide column at x 370: each 1000x157, 12 padding, a 232x131 thumbnail then the title, "Created in", the URL chip and three small buttons, 12 apart vertically.
- Computers: a 48 tall title row with "Create cloud computer" at the end, then a 960 wide box at x 390: the heading (24/32 600) at y 84, a 3 column grid of 312 wide setup cards 12 apart (two rows of 299 tall cards at y 140 and 451), then two 474 wide bands 12 apart at y 774 (Customize, Connect your devices).
- Agents: a single 562 wide centred column at x 589: "Meet Cue" at y 168, the 16:9 video (562x316, radius 14) at y 286, two 40 tall buttons, the 66 tall waitlist banner, a footer link.
- Automations: a 960 wide box at x 390, the centred heading at y 137, then three 312x421 example cards 12 apart at y 227 and a 310 wide Get started button centred under the middle one (y 680).
- Plugins: a 768 wide column at x 486. A sideways carousel of 280x114 promo cards 16 apart at y 88, the search field (768x36) at y 226, category tabs at y 278, then a 2 column grid of 378x76 plugin rows, 12 apart both ways.

## Project (`/app/project/...`)

- A 1168 max-width grid with 18 padding: a 740 column at x 318 and a 320 rail at x 1102, 44 apart.
- The main column: a 48x48 icon tile and the 20px title at y 80, a meta line, "Recent" at y 160, then 52 tall task rows. The composer is the Home one at 740 wide (x 318, y 748).
- The rail stacks three cards 16 apart: Instructions plus Connectors (320x207), Files and Skills (320x278), Website (320x133), then Triggered tasks.

## Task (`/app/<id>`)

- The thread scrolls in one scroller under the 48 tall top bar (x 300, y 48, 1140x852; this thread is 10,599 tall). Its column is 736 wide at x 502, inside an 800 max-width box (x 470) whose 16 padding lines it up with the 768 composer at x 486.
- User messages are right-aligned bubbles at most 662 wide (radius 12, #242424 / white). An assistant turn opens with a 26 tall header (the 24px mark, wordmark, a "Lite" tag) then 16/24 text, 28 tall plan-step rows, 570 wide deliverable cards (radius 12) and a two-column grid of 280 wide file chips 8 apart.
- Above the composer a 61 tall step footer (radius 22 at the top, `--background-card-gray`) is tucked 20 under the composer box: "Deliver the final… Step 4/4".
- With the side panel open the main column splits in two equal halves: the thread on the left (x 300 to 870, its column 506 wide at x 332, the composer 538 wide at x 316) and the panel on the right (x 870, 570 wide, full height), divided by a 1px handle at x 869.5 that widens to 5px blue on hover. The panel has a 48 tall tab bar (tabs 160x32 from x 882, a 48x32 launcher after them, two 32px buttons at the end). In the files tab the tree is a 260 wide aside on the right (x 1180, below a second 48 tall bar) and the preview area fills the rest.
- The files dialog is 600x680 at (420, 110), radius 16; the settings dialog 1152x810 at (144, 45), radius 16, with a 221 wide nav column and a 768 content column at x 446.5.

## Phone (390 x 844)

- A 65 tall fixed app banner (icon, "Manus app", Open app) sits over everything; the page header is a sticky 48 tall row at top 60.
- Home: 16 side gutters. The serif hero "What can I do for you?" (28px) centred at y 277, the composer (358x120, radius 22) at y 347, a row of 40 tall suggestion chips at y 495 that runs off the edge, then a 350x98 carousel card at y 686 with four 8px dots at y 796.
- Drawer: the 300 wide sidebar slides in from x -300 to x 0 over a scrim.
- Library: 20 side gutters. The header keeps the title, a narrowed search, the view-options button and the segmented control; the type tabs become one "All" dropdown button (81x32 at y 116) that opens a 200 wide menu with a check on the current type. Rows are 350x67 at x 20, with no hover bleed.
- Task: the thread column is 326 wide at x 32 and the composer 358 wide at x 16, sticky at the bottom (y 676).
