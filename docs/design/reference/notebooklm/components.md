# Gemini Notebook (NotebookLM): component reference

Captured from notebook.google.com on 2026-09-25, signed in, legacy UI generation (the one live for this account). Each measurement is a computed style unless marked **estimated** (sampled from a screenshot because the element renders inside a cross-origin iframe). Token names refer to [tokens.json](tokens.json); the rendered versions are in [style-guide.html](style-guide.html). The raw per-element readings are in [raw/measurements.md](raw/measurements.md).

Screenshots are named `{page}-{theme}-{state}.png`. Desktop captures are 1200×797 CSS px at 2× (2400×1594). The two captures taken on the external display (`notebook-dark-flashcards-front`, `mobile-dark-configure-chat-dialog`) are 1×.

## Discovery list

Every page, view and overlay reached, and whether it was captured.

| # | Surface | Kind | Light | Dark | Notes |
|---|---|---|---|---|---|
| 1 | Home, My notebooks, list view | page | ✅ | ✅ | |
| 2 | Home, grid view | view | ✅ | values only | |
| 3 | Home, All tab (Recent + Featured) | view | values only | values only (mobile) | |
| 4 | Home, Discover tab | view | ✅ | – | featured cover cards |
| 5 | Home, Collections tab (empty state) | view / empty state | ✅ | – | |
| 6 | Home, search expanded + results | view | ✅ | – | |
| 7 | Settings menu | menu | – | ✅ | |
| 8 | Theme submenu (Light / Dark / Device) | menu | – | ✅ | |
| 9 | Sort menu | menu | ✅ | – | |
| 10 | Notebook card menu | menu | ✅ | – | |
| 11 | Create collection dialog (empty, filled, checked) | modal | ✅ | – | |
| 12 | Delete notebook confirmation | modal | ✅ | – | not confirmed |
| 13 | Tooltip | overlay | ✅ | – | |
| 14 | Announcement modal ("more flexibility and control") | modal | ✅ | – | shown once after update |
| 15 | Notebook workspace (3 panels) | page | ✅ | values only | |
| 16 | Source row hover | state | ✅ (crop) | values only | |
| 17 | Citation popover + source viewer | overlay / view | ✅ | values only | |
| 18 | Studio tiles hover + tile tooltip | state | ✅ | values only | |
| 19 | Studio artifact viewer, Flashcards (front, back) | view | ✅ | ✅ front | iframe, estimated |
| 20 | Studio artifact viewer, Quiz (default, option hover) | view | ✅ | – | iframe, estimated |
| 21 | Studio artifact viewer, Mind map | view | ✅ | – | iframe, estimated |
| 22 | Studio artifact loading spinner | loading state | ❌ | – | see Gaps |
| 23 | Note editor | view | ✅ | – | |
| 24 | Configure Chat dialog | modal | ✅ | ✅ (mobile) | |
| 25 | Chat overflow menu | menu | ✅ | – | |
| 26 | Share dialog + access select open | modal / select | ✅ | – | |
| 27 | Add sources dialog | modal | ✅ | – | |
| 28 | Toast ("Copied to clipboard.") | toast | values only | – | see Gaps |
| 29 | Message action row hover | state | ✅ | – | |
| 30 | Mobile notebook (tabs) | responsive | – | values only | |
| 31 | Mobile home | responsive | – | values only | |
| 32 | Error states | error | ❌ | ❌ | none reachable without breaking something |

Themes offered: **Light**, **Dark**, and **Device** (follows the OS). There is no high-contrast or custom theme; the CSS only has `forced-colors: active` rules for OS high-contrast modes.

---

## Core components

### Buttons
Anatomy: pill container · optional 18px leading icon (8px gap) · label `label-large` (Google Sans Text 14/20 500).

| Variant | Height | Padding | Fill | Label | Border | Where |
|---|---|---|---|---|---|---|
| Filled (primary) | 40 | 0 24 | `accent.primary` #4259ff (both themes) | #fff | – | Create, Save, Delete, Next |
| Tonal (black/white) | 40 / 32 | 0 24 / 0 16 0 12 | `accent.secondary` #000 → dark #fff | #fff → dark #22262b | – | Create new, Create notebook, Try it, Add note |
| Outlined | 40 / 32 | 0 16 (0 24 on source buttons) / 0 12 0 8 | transparent (#fff on drop-zone buttons) | `text.title` | 1px `border.default` #dde1eb / #37383b | Cancel, Add sources, View sources, Upload files |
| Outlined, rect | 40 | 0 24 | transparent | `text.title` | 1px, radius 16 | Good / Bad content, Convert to source |
| Text | 40 | 0 12 | – | `text.title` or `accent.m3-primary` #0b57d0 | – | Cancel, View all, search Cancel |
| Split | 40 | 0 24 + 0 10 | – | `text.link` #4259ff | 1px | Copy link (share) |
| Icon | 40 / 36 / 32 | 8 / 6 / 4 | – | `text.title` or `text.secondary` | outlined variant 1px | close, search, more_vert |

States: hover = currentColor state layer at 8%; pressed 12%; focus = 3px `border.focus-ring` (#4259ff light, #c3cafc dark) ring drawn 5px outside (6px for outlined), keyboard only; disabled = container rgba(31,31,31,.12), label #5e5e5e (dark #ababab). Transition `border`/`box-shadow` 280ms `cubic-bezier(.4,0,.2,1)`. Radius 96px (`radius.button`).

![Buttons in dialog, filled + text states](screenshots/modal-light-filled-states.png)
![Delete confirmation: outlined + filled](screenshots/home-light-delete-confirm-dialog.png)

### Text field (outlined)
56h, padding 0 16, outline 1px `border.default`, radius 4, input `body-large` 16/24 #1f1f1f. Label 16px `text.on-surface-variant`; floats to 12px on focus/filled. Focus: 2px `accent.m3-primary` #0b57d0 outline and label colour. Disabled not observed (standard M3 38% assumed, **estimated**).

![Create collection dialog, empty](screenshots/home-light-create-collection-modal.png)

### Select
Trigger: text 14/24 `text.on-surface` + 10×5 arrow; disabled at 38%. Panel: 212 wide, `surface.select-panel` (#f0f4f9), radius 0 0 4 4, `shadow.menu`, padding 8 0. Option 48h, padding 0 16, 16/20. Selected: rgba(31,31,31,.12) fill + trailing check in #0b57d0.

![Share access select open](screenshots/notebook-light-share-select-open.png)

### Checkbox
18×18 box in a 40×40 target, 2px border radius 2.
- Material style (dialogs): off border #444746; on fill+border #0b57d0, white check. Fill transition 90ms (`decelerate` on, `accent-sharp` off), checkmark 180ms.
- Source style (Sources panel): on fill+border `border.default` (#dde1eb / #37383b), check `text.secondary` (#5e5e5e / #ababab). Neutral on purpose, so a long list of ticked sources stays quiet.
- Hover: 40px circle state layer at 8%. Disabled: 38%.

### Radio
Only tokens (`--mat-radio-*`): selected `border.focus-ring` #4259ff / #c3cafc, unselected #5e5e5e / #ababab, hover #1b1b1c / #f2f2f2. No radio appeared on a reachable screen.

### Toggles
- **View toggle** (grid / list): segmented, 42h, 1px `border.outline-variant`, radius 16; segment 48 wide; selected `surface.selected` #edeffa with leading check (label shifts 30px, 150ms).
- **Section toggle** (All / My notebooks / Discover / Collections): pills 40h radius 24, margin 4; selected `surface.selected` + 1px `border.outline-variant` outline; hover 8% on-surface.
- **Choice chips** (Configure Chat): 42h, radius 24, 1px `border.default`, label 14/500; selected `accent.primary` fill, white text, leading check; hover 8% on-surface.
- There is no on/off switch control anywhere reachable.

![Choice chips: selected, hover, default](screenshots/chip-toggle-light-states.png)

### Tabs
Mobile only (&lt;600px): Sources / Chat / Studio. 48h, `label-large`, label #e3e3e3 (dark); active indicator 2px `accent.m3-primary` (#a8c7fa dark) under the label only (≈32px).

![Mobile dialog shows the tab row behind it](screenshots/mobile-dark-configure-chat-dialog.png)

### Badges and avatar
- PRO: 28.8×19.2, `surface.selected`, radius 8, padding 1.6 4.
- New!: 16h pill, `accent.secondary` (#000), white, `label-small` 11/16 500.
- Avatar: 32 circle.

### Tooltip
`surface.inverse` #303030, text #f2f2f2, `body-small` 12/16 tracking .096, padding 4 8, radius 4, below trigger after a hover delay.

![Tooltip](screenshots/tooltip-light-default.png)

### Menus
Panel `surface.panel`, radius 8, padding 8 0, `shadow.menu`. Item 48h, padding 0 12, 24px icon in `text.on-surface-variant` + 12 gap, label `label-large`. Hover `state.menu-hover` (light rgba(66,89,255,.08), dark rgba(255,255,255,.08); dark observed .12 on the highlighted submenu trigger). Divider 1px, margin 8 0. Submenu chevron trailing.

![Settings menu (dark)](screenshots/home-dark-settings-menu.png)
![Theme submenu (dark)](screenshots/home-dark-theme-submenu.png)
![Sort menu](screenshots/home-light-sort-menu.png)
![Card menu](screenshots/home-light-card-menu.png)
![Chat overflow menu with caption](screenshots/notebook-light-chat-menu.png)

### Modals
Surface `surface.dialog` (#fff light, **#131314** dark, darker than panels), radius 16, no shadow; backdrop rgba(0,0,0,.32) fading over 400ms `cubic-bezier(.25,.8,.25,1)`; enter transform 150ms decelerate. Title 16/32 500 with close icon button; body 14/24 or 16/24; footer right-aligned, filled primary last. The primary action is blue even when destructive. Widths: 440, 544, 704, 720, 882, 1000.

![Configure Chat (light)](screenshots/notebook-light-configure-chat-dialog.png)
![Share dialog](screenshots/notebook-light-share-dialog.png)
![Announcement modal](screenshots/notebook-light-announcement-modal.png)

### Toast
344×48 min, radius 16, `surface.toast` (#000 light / #fff dark), `shadow.level3`, label 14/20 400 in inverse colour, padding 14 8 14 16, bottom centre. Values only (see Gaps).

### Tables and lists
- Notebook table: header 56h (14/20 500), rows 52h (14/20 400), cells padding 0 16, 1px `border.outline-variant` rules, cursor pointer, emoji 16px before title, 32px more button.
- List option (dialogs): 48h, padding-left 16, trailing checkbox.
- Source row and artifact row: see product components.

![Home list (light)](screenshots/home-light-default.png)
![Home list (dark)](screenshots/home-dark-default.png)

### Cards
- **Notebook card**: 320×224, radius 12, 1px transparent border, no shadow, background cycles `tile.{green,orange,pink,blue,cyan,yellow}.bg`. Emoji ~40px, title `headline-small` 24/32 two-line clamp, meta 12/24 #535559 with a 900-weight middle dot. More button 32. No hover style in the live UI.
- **Create card**: outlined 1px `border.default`, radius 12, 64px `surface.selected` circle with `text.link` add icon, label Google Sans 22/36.
- **Featured cover card**: image with `gradient.cover-scrim`, white text, 32px publisher logo, globe icon; hover zooms the image to 1.08 over 300ms (expert-badge variant).

![Grid](screenshots/home-light-grid.png)
![Discover](screenshots/home-light-discover.png)
![Collections empty state](screenshots/home-light-collections-empty.png)
![Search results](screenshots/home-light-search-results.png)

---

## Product-specific components

### Workspace shell
Page `bg.page` (#edeffa / #1a1d22). Header 64h, no fill: 40px brand circle, notebook title Google Sans 22/36, then tonal "Create notebook" (32h), icon buttons 32 (copy, analytics, share, settings), PRO, apps grid, avatar. Three panels, `surface.panel`, radius 16, no border or shadow, 16px gutter; side panels 289.8 at a 1200 viewport, Studio widens to 450 when an artifact is open (200ms ease-in-out). Panel header 48h + 1px `border.default` rule, title Google Sans 16/52, collapse icon. Footer disclaimer 12/20.

![Workspace (light)](screenshots/notebook-light-default.png)

### Source list
- "Add sources" small outlined button, full width.
- Web discovery box: `surface.subtle` (#f9f9f9 / #1a1d22), 1px `border.default`, radius 16, padding 8, gap 16; placeholder 14/24; two 32h menu chips (source: Web; mode: Fast research) and a 32px search icon button with idle grey fill. Focused variant (Add sources dialog): border 1px #4259ff.
- Toolbar: two 18px icon buttons + "Select all" + source checkbox.
- Source row: 32h, padding 0 8, gap 4, radius 8; 24px type icon (PDF #db372d, Markdown #3271ea, YouTube #f00, else favicon), title 14/24 `text.title` ellipsis, trailing source checkbox. Hover or opened: `surface.selected` fill and a `more_vert` appears.

![Sources panel list (the 8% hover circle on the chat copy button shows the icon-button hover)](screenshots/notebook-light-message-actions-hover.png)

### Chat
- User message: right-aligned bubble, `surface.selected` (#edeffa; dark #1a1d22), radius 20 20 0 20, min-h 65, text 16/24 `text.title`.
- Model message: no container, 16/24 `text.body`, bold 600, disc lists with 8px item gap, 20px gap after each message.
- Inline code: Google Sans Code 14/24 500, `surface.muted` (#f2f2f2 / #3e4a59), padding 4.
- Citation marker: 22px circle, `surface.subtle`, `text.secondary`, 11px 500; hover opacity .5 (200ms linear); stale/deleted grey-70 at .5.
- Action row: keep (save to note), copy, thumb up, thumb down; 32px icon buttons.
- Timestamp divider: "Today • 2:07 PM", 12px centred.
- Query box: 1px `border.strong` (#919191 light; #37383b dark), radius 16, padding 16 (12 on mobile), placeholder 16/24 "Ask a question or create something", source count 12-14px, 40px send button with 8% fill and #5e5e5e arrow while idle.

![Workspace chat](screenshots/notebook-light-default.png)

### Citation popover and source viewer
Popover 420 wide, `surface.dialog`, radius 8, `shadow.popover`; header filename 14/24 500 with rule; body 16/24; footer "View source" link `text.link`. Clicking a citation also switches the Sources panel to the source viewer: title Google Sans 22/36, "Source guide" pill (`surface.selected`, radius 16, 40h), body 16/24, cited passage highlighted with `surface.selected` and weight 700.

![Citation popover](screenshots/notebook-light-citation-popover.png)
![Source viewer with cited passage](screenshots/notebook-light-source-viewer-citation.png)

### Studio
- Promo banner: `gradient.promo`, radius 8, padding 12, 12/16 500 text, tonal "Try it" (32h, weight 400), close.
- Create tiles: 2-column grid, gap 8; tile 56h radius 12; icon 16 top-left, label `label-medium` 12/16 one line, chevron 20 right (an edit pencil replaces it on hover). Colour pairs `tile.X.bg` / `tile.X.fg`: Audio=blue, Slide Deck=yellow, Video=green, Mind Map=pink, Reports=yellow, Flashcards=orange, Quiz=cyan, Infographic=pink, Data Table=blue. Hover adds `tile.X.hover` (fg at 8%). Disabled: rgba(0,0,0,.08) fill, #919191 text.
- Artifact row: 64h, 24px icon in the tile's fg colour, title 14/16 500, meta 12/16 `text.secondary`, more button. Failed/cancelled: grey-98 fill radius 16. Disabled .5.
- "Add note" floating pill: `accent.secondary`, 40h, padding 0 24.

![Studio tile hover and tooltip](screenshots/studio-light-tile-hover.png)

### Artifact viewers (iframe content, estimated)
Header: breadcrumb "Studio > App" in the panel header, title Google Sans ~22, share / fullscreen / more, "View N sources" small outlined button; feedback footer with rect outlined "Good content" / "Bad content".
- **Flashcards**: hint 12px ghost; card ~418×330 radius ~24, front #303030 with white Google Sans ~28/40, back white with 1px border and "Explain" chip; controls: prev/next 48×40 outlined circles (next in #4259ff), wrong/right pills with red/green icon + count.
- **Quiz**: counter, question 16/28 500, options radius ~12 padding 16 on grey-98, hover grey-90; "Next" filled blue rounded-rect.
- **Mind map**: horizontal tree, root ≈ #c3cafc, children ≈ #c2d3eb, bezier edges ≈ #7c8bf3, expand badges; left control column (expand, +, −, download).

![Flashcards front](screenshots/notebook-light-flashcards-front.png)
![Flashcards back](screenshots/notebook-light-flashcards-back.png)
![Flashcards (dark)](screenshots/notebook-dark-flashcards-front.png)
![Quiz](screenshots/notebook-light-quiz-default.png)
![Quiz option hover](screenshots/quiz-light-option-hover.png)
![Mind map](screenshots/notebook-light-mindmap.png)

### Note editor
Title input Google Sans 22/32, delete icon. Toolbar between 1px rules: undo, redo, "Normal" block menu (28h pill), bold, italic, more. Body 14/24. Footer "Convert to source" small rect outlined button.

![Note editor](screenshots/notebook-light-note-editor.png)

### Add sources
Two blurred glows (blue #4259ff left, green #45ec6d right, `blur.glow`) behind a centred Google Sans 24/32 title whose second line uses `gradient.headline-text`. Focused discovery box. Drop zone: `surface.subtle`, 2px dashed `border.default`, radius 16, padding 48, title 22/36, sub 14/24 `text.secondary`, outlined 40h source buttons. Source limit: 16h progress bar radius 16, track rgba(163,163,163,.2), fill #0b57d0, "21 / 300".

![Add sources dialog](screenshots/notebook-light-add-sources-dialog.png)

---

## Icons
- Set: **Google Symbols**, Google's internal superset of Material Symbols, loaded as a variable ligature font. Style **outlined** (FILL 0, wght 400, GRAD 0). The public equivalent is Material Symbols Outlined.
- Sizes: 16 (Studio tiles), 18 (button icons, toolbars), 20 (card and row actions), 24 (menus, header, source types). Stroke weight follows wght 400 (about 2px at 24px).
- Colour: inherits text colour; secondary actions use `text.secondary`; source types use `palette.icon.*`.
- Ligatures seen: add, content_copy, trending_up, share, settings, dock_to_right, dock_to_left, language, keyboard_arrow_down, search_spark, search, label_auto, sort, attach_file, markdown, more_vert, drive_pdf, tune, landscape_2, photo_spark, keep_pin, copy_all, thumb_up, thumb_down, arrow_forward, close, audio_magic_eraser, chevron_forward, tablet, subscriptions, flowchart, auto_tab_group, cards_star, quiz, stacked_bar_chart, table_view, sticky_note_2, grid_view, view_list, check, arrow_drop_down, public, edit, library_add, keep, delete, collapse_content.

---

## Gaps

| Gap | Why | What exists instead |
|---|---|---|
| Icon SVG export | Icons are glyphs in a ligature font (`Google Symbols`), not SVG elements, so there is nothing to export from the DOM; downloading the font or third-party SVGs needs your OK | Ligature list above; use Material Symbols Outlined (Apache 2.0) in Figma |
| Flashcard, quiz, mind-map internals | Rendered in a cross-origin sandboxed iframe, so computed styles can't be read | Pixel-sampled values marked estimated. Samples come from the display colour profile and drift a few units (#4259ff samples as #4758f6) |
| Quiz answered states (correct / incorrect) | Answering writes quiz progress into your notebook | Default and hover only |
| Toast screenshot | The snackbar closes before a window capture lands, and a cloned copy lost its styles | Full computed values; rendered in the style guide |
| Studio loading spinner screenshot | The spinner resolved before capture | Presence noted; colours not verified |
| Most dark-theme overlay screenshots, desktop dark workspace, mobile screenshots | Another Claude session drove Duolingo in the same Chrome window, then the tab's own window on the external display stopped repainting for `screencapture`. 5 contaminated shots were deleted | Computed dark values for panels, dialogs, popover, tiles, chat, controls and mobile layout are in raw/measurements.md and tokens.json |
| Error states | None reachable without breaking something (failed upload, network loss) | Failed artifact row style from CSS (`grey-98`, radius 16) |
| Luminous UI | A second design generation sits in the CSS behind `body.luminous-ui`, but it is not enabled for this account | Only the live (legacy) UI is documented |
| Radio control, switch control | No such control on a reachable screen | Radio tokens only |
| Hover on notebook cards and table rows | The live UI defines no hover style for them | The style guide's row tint is marked estimated |
| Exact product fonts in the HTML | Google Sans / Google Sans Text / Google Symbols are not publicly served | The page falls back to Google Sans Flex, Google Sans Code and Material Symbols Outlined from Google Fonts |
