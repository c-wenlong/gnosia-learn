# Claude page layouts

Written by hand from [layout.json](layout.json), which [layout.mjs](../tools/capture/layout.mjs) read from the signed-in copies at 1440 x 900 and 390 x 844. Numbers are CSS pixels.

## The shell

Every desktop page is one `.dframe-root` holding the sidebar and a content column.

| Part | Geometry | Notes |
|---|---|---|
| Sidebar (`aside.dframe-sidebar`) | x 0, 288 wide, full height | Its own ground, `#111111` in dark and `#fbfbf9` in light, a step away from the page. No rule on its edge; a 12 wide resize handle overlaps the edge at x 281. |
| Sidebar title row | 44 tall | The 68 x 20 "Claude" wordmark at x 16, then Hide sidebar (x 215) and Search (x 247), both 32 x 32. |
| Home/Code pills | x 8, y 44, 271 x 32 | Two 30 tall pills; the indicator is a raised 136 x 30 card under the active one. |
| Sidebar rows | 271 wide, 32 tall, starting at y 88 | New, Artifacts, More, then the Pinned and "Chats and tasks" sections. Each section label row is 44 tall with the label at caption size. |
| Account row | y 852, 48 tall | A 24 avatar, the name, a dot and the plan in text-muted, a chevron; the Get apps button at x 247. |
| Content column (`.dframe-pane-primary`) | x 296 to 1432 (1136 wide) | Starts 8 past the sidebar. It paints nothing: the page ground is surface-1, `#151515` in dark and `#fcfcfb` in light. |
| Pane header | 48 tall | Empty on the home page apart from Use incognito at the far end; on a chat it holds the title button with its more button, and Share. |
| Hidden sidebar | a 32 x 32 box at 8, 8 | Holds the Show sidebar button; the content column runs from x 8 to 1432 (1424 wide). This is the account's own setting. |

## Home (`/new`)

| Part | Geometry |
|---|---|
| Greeting | Centred, y 285, 303 x 47.5: Anthropic Serif 38/47.5 at weight 300 (the size is `clamp(1.875rem, 1.2rem + 2vw, 2.375rem)`, 30 at 390 wide), led by the 36 px clay asterisk. |
| Composer | 672 x 120 at y 368.5, centred (Tailwind's `max-w-2xl`), radius 20. The editor row is 642 wide inside a 14 px inset (`m-3.5`); the tool row is 32 tall: + (32), the Chat/Cowork segments (119 x 28), then at the end the model selector (142 x 32), dictation and voice (32 each). |
| Typed composer | The voice button turns into the send button in place (x 1153). |

## Chat (`/chat/<id>`)

| Part | Geometry |
|---|---|
| Transcript | A 808 wide column (`48rem + 2.5rem`) centred in the pane, holding a 768 wide list (`--transcript-width`, 48rem) whose feed is 736 wide (16 in on each side). |
| User message | Right-aligned, at most 85% of the feed (623 of 736 here), radius 12, padding 12 / 16, a 5% wash of the text colour. |
| Assistant turn | Full feed width. "Thought for 6s" (a 28 tall row) above the prose; paragraphs are Anthropic Serif 16/24. |
| Code block | Full feed width, radius 8, a "markdown" label row 31 tall above the `<pre>`. |
| Table | 728 wide in the feed; header cells 39 tall with a 5% fill, body cells 62 to 63 tall, both padded 7 / 12. |
| Composer dock | 768 x 100 at y 768, the transcript width, pinned to the bottom; the disclaimer link sits under it at y 876. |
| Phone | The column is 374 wide (8 in from the edges) and the feed 334; the user bubble is 283 wide. |

## Artifacts, Chats and tasks, Projects

All three use the same `[data-cds=Page]`: a 1024 wide column (`max-w` 1024, padding 32) centred in the pane, so the content is 960 wide from x 384. The `PageHeader` puts the h1 (Anthropic Serif 24/32, weight 500) at y 56.

| Page | Body |
|---|---|
| Artifacts | Tabs (All, Yours, Shared with you) at y 112, 32 tall; the header actions (search, grid view, filter, "Claude Design") at the end. A 960 x 138 notice card, the "Make something new" caption and three 136 wide tiles, then month groups of 52 tall rows (984 wide, the hover fill bleeding 12 past the column). Each row is a grid of 36 / title / 198 columns with a 16 gap. |
| Chats and tasks | A cds Table of 53 tall rows, 984 wide: the title, then the relative time in text-muted and a 28 more button. |
| Projects | A two-column grid, 468 + 468 with a 24 gap; each card is 161 tall. |
| Project page | A 1136 wide column (`max-w` 1176, padding 24): the breadcrumb in the header, the h1 at y 72, the description, then a 680 wide composer and a "Recents" table (54 tall rows) on the left, and a 352 wide rail of cards (Instructions, Memory, Context) on the right. |

## Overlays

| Overlay | Geometry |
|---|---|
| Menus | Radius 12, a 4 px inset, 32 tall rows (50 for a two-line model row), 128 to 320 wide: the plus menu 228, the model menu 295, the account menu 272 (opening above the account row), the chat row menu 171, the More menu 150. |
| Search dialog | 672 wide, centred at y 225, radius 12, a 64 tall field row over 36 tall result rows; the backdrop is 50% black in dark, 40% in light. |
| Settings dialog | 1024 x 800 centred (x 208, y 50), radius 12: a 192 wide nav column with a right rule, the General pane from x 425, rows 782 wide and 56 to 69 tall. |

## Phone (390 x 844)

The sidebar is gone; a 32 Show sidebar button sits at 8, 8. The greeting is 30/37.5 and the composer 358 wide, pinned 40 above the bottom; its Chat/Cowork segments drop to icons. The drawer is the whole sidebar as a full-screen sheet (`role=dialog`, 390 x 844): a close button and the wordmark, a full-width 40 tall Search button, the pills, then rows at 44 tall.
