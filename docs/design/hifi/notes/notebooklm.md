# NotebookLM reference extraction

Source: `docs/design/reference/notebooklm/` (captured 2026-09-25, legacy UI generation). All values below are computed styles unless flagged **estimated** (iframe surfaces, pixel-sampled from a screenshot).

## Tokens to adopt

| Token | Light | Dark | Source |
| --- | --- | --- | --- |
| `bg.page` | `#edeffa` | `#1a1d22` | `--nlm-fills-surface-page` |
| `surface.panel` | `#ffffff` | `#22262b` | `--nlm-fills-surface-panel` |
| `surface.card` | `#fafafd` | `#262a30` | `--nlm-fills-surface-card` |
| `surface.dialog` | `#ffffff` | `#131314` | computed `.mat-mdc-dialog-surface`; darker than panel in dark |
| `surface.selected` (container tint, user bubble, source hover) | `#edeffa` | `#2f334b` | `--nlm-brand-light-blue` |
| `surface.subtle` (discovery box, drop zone) | `#f9f9f9` | `#1a1d22` | `--nlm-fills-ui-light-grey-fill` |
| `surface.muted` (inline code) | `#f2f2f2` | `#3e4a59` | `--nlm-fills-ui-grey-fill` |
| `border.default` (hairline, cards, fields) | `#dde1eb` | `#37383b` | `--nlm-stroke-default` |
| `border.outline-variant` (table rules, toggle outline) | `#c4c7c5` | `#444746` | `--mat-sys-outline-variant` |
| `border.strong` (chat query box) | `#919191` | `#5e5e5e` | `--nlm-stroke-focus` |
| `border.focus-ring` (keyboard focus, 3px ring) | `#4259ff` | `#c3cafc` | `--mat-focus-indicator-border-color` |
| `text.title` (primary text, titles, labels) | `#1b1b1c` | `#f2f2f2` | `--nlm-text-titles-and-labels` |
| `text.body` (chat/model prose) | `#303030` | `#c7c7c7` | `--nlm-text-body-text` |
| `text.secondary` | `#5e5e5e` | `#ababab` | `--nlm-text-secondary-text` |
| `text.ghost` (muted, hints) | `#777777` | `#919191` | `--nlm-text-ghost-text` |
| `accent.primary` (filled buttons, brand blue, links) | `#4259ff` | `#4259ff` (same) | `--nlm-ctas-buttons-primary` |
| `accent.secondary` (tonal buttons: Create, Add note) | `#000000` | `#ffffff` | `--nlm-ctas-buttons-secondary` |
| `accent.m3-primary` (Material fields, dialog links, select) | `#0b57d0` | `#a8c7fa` | `--mat-sys-primary` |
| `status.error` | `#b3261e` | `#f2b8b5` | `--mat-sys-error` |
| `state.disabled-container` | `rgba(31,31,31,.12)` | `rgba(227,227,227,.12)` | computed; dark is an M3-rule estimate |
| `state.disabled-content` | `#5e5e5e` | `#ababab` | `--mat-button-disabled-label-text-color` |

Full palette (tiles, dataviz, pastel, gradients, skeleton) is in `tokens.json` under `light`/`dark`; not reproduced here since our app only needs one accent plus mastery buckets, not NotebookLM's nine-way tile palette.

**Type.** Families: `Google Sans` (display/headlines, fallback `Google Sans Flex`, then system-ui), `Google Sans Text` (body/labels, same fallback), `Google Sans Code` (inline code, monospace fallback), `Google Symbols` ligature icon font (fallback: Material Symbols Outlined). None of the three custom faces are publicly servable; the capture itself falls back to Google Sans Flex + Google Symbols variants from Google Fonts.

| Style | Family | Size/Line | Weight | Used for |
| --- | --- | --- | --- | --- |
| `panel-header` | display | 16/52 | 400 | Panel titles (Sources/Chat/Studio headers); the 52px line-height is the 48h header, not leading |
| `headline-small` | display | 24/32 | 400 | Notebook card titles, page title "My notebooks" |
| `title-large` | display | 22/28 | 400 | Workspace/dialog/source-viewer titles |
| `body-large` | text | 16/24 | 400 | Chat body (model message), text fields, dialog body |
| `body-medium` | text | 14/20 | 400 | Dialog helper text, secondary body |
| `body-small` | text | 12/16 | 400, tracking .096 | Tooltip, meta captions |
| `label-large` | text | 14/20 | 500 | Button labels, menu items |
| `label-medium` | text | 12/16 | 500, tracking .096 | Studio tile labels |
| `label-small` | text | 11/16 | 500, tracking .096 | Citation chip digit |
| `code-inline` | code | 14/24 | 500 | Inline code span |

Model chat text uses weight 600 for inline bold (not the 700 in `text.body`'s normal styling); cited passage highlight uses weight 700.

**Radii.** `none` 0 · `xs` 4 (text fields) · `sm` 8 (menus, source rows) · `md` 12 (notebook/create cards, studio tiles, quiz options) · `lg` 16 (panels, dialogs, drop zone) · `chat-bubble` 20 (one corner square) · `chip` 24 (choice chips, section toggle) · `xl` 28 · `button` 96 (pill buttons) · `full` 9999 (icon buttons, search field).

**Spacing scale.** 2, 4, 6, 8, 12, 16, 20, 24, 32, 48 (px). No 10/14/18/20-style odd steps: NotebookLM's scale is tighter and rounder than our lo-fi's 4/6/8/10/12/14/16/18/20/24.

**Shadows.** Menus/selects: `shadow.menu` = `0 3px 1px -2px rgba(0,0,0,.2), 0 2px 2px rgba(0,0,0,.14), 0 1px 5px rgba(0,0,0,.12)`. Citation popover: `shadow.popover` = `0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)` (Google elevation 1, distinct from the Material `level*` shadows). Toast: `shadow.level3`. Dialogs and cards carry **no shadow**: radius plus a flat surface colour does all the separation. Dark-theme shadow colors are unchanged (still black-based), relying on the lighter panel/dialog contrast instead.

**Motion.** Durations: 45ms (instant) · 90ms (checkbox) · 150ms (short, dialog enter/label float) · 200ms (citation hover, panel resize) · 250–300ms (medium, card fade) · 280ms (button border/shadow) · 400ms (backdrop fade) · 500ms (long2). Standard easing `cubic-bezier(.4,0,.2,1)` dominates (34 uses); `decelerate` `(0,0,.2,1)` for entrances; `accelerate-sharp` `(.4,0,.6,1)` for exits; backdrop uses `(.25,.8,.25,1)`. `prefers-reduced-motion` disables card animations, worth carrying over.

## Components that map onto ours

### Three-panel workspace shell
Anatomy: 64h header (no fill) with brand mark, title, actions · three panels (`surface.panel`, radius 16, **no border, no shadow**), 16px gutter between them and from the viewport edge · 48h panel header with a 1px `border.default` rule and a title in `panel-header` style · 12/20 disclaimer footer.

Measurements at 1200px viewport: side panels (Sources, Studio) **289.8px** wide each, chat panel fills the remainder (**556.4px**); panel top y=64, height 710.6 (leaves ~22px for the disclaimer). Opening a Studio artifact widens Studio to **450px** (chat shrinks), transition `inline-size 200ms ease-in-out`. No stated min-width for a collapsed panel; panels collapse to hidden (icon-only trigger), not to a narrow rail. Below 600px the three panels collapse into a `mat-tab-header` (Sources/Chat/Studio tabs, 49h, 2px active indicator under the label). Screenshot: `notebook-light-default.png`; dark values only (no screenshot) in `raw/measurements.md`.

Maps to: our **Concept workspace** three-panel layout directly, this is the named reference for it. Our panels are Note/sources, Tutor, Studio, matching NotebookLM's Sources/Chat/Studio 1:1.

### Panel header
48h, `border-bottom` 1px `border.default`, title left-padded 16px in `panel-header` (16/52), a right-aligned icon action (dock/tune/more, 36×36 padding 6, icon 24). Same in both themes except the divider colour (`#dde1eb` → `#37383b`) and title colour (`#1b1b1c` → `#f2f2f2`).

Maps to: each of our three workspace panel headers.

### Source list item / source card
Row: 32h, padding 0 8, gap 4, radius 8. 24px coloured type icon (PDF `#db372d`, Markdown `#3271ea`, YouTube `#ff0000`, else favicon), title 14/24 `text.title` ellipsis, trailing checkbox (neutral grey style, not blue: "so a long list of ticked sources stays quiet"). Hover or opened state: fills `surface.selected` (`#edeffa` / dark `#1a1d22`) and reveals a `more_vert` icon button. Above the list: a full-width outlined "Add sources" button (245.8×32) and a web-discovery box (`surface.subtle`, 1px border, radius 16, padding 8, two 32h menu chips + a 32px search icon button). Screenshot: `notebook-light-message-actions-hover.png` (crop shows hover state); dark values computed only.

Maps to: our **Note and sources** panel's source rows, and the **Widget placeholder**/asset list rows in Library.

### Chat message (user and model)
User bubble: right-aligned, `surface.selected` fill (`#edeffa` / dark `#1a1d22`), radius **20 20 0 20** (bottom-right corner square, not rounded), padding 0 6 0 2, min-height 65, max-width 700, text 16/24 `text.title`. Model message: **no container**, 16/24 `text.body`, inline bold at weight 600, disc lists with 8px item gap, 20px gap after each message block. Screenshot: `notebook-light-default.png`.

Maps to: our **Message** component (who, body, citation, Save to note, Why). NotebookLM's asymmetry (bubble for user, bare text for model) is the pattern to copy: it keeps the tutor's prose from feeling boxed-in mid-lesson.

### Citation chip and hover
22px circle, `surface.subtle` fill, `text.secondary` colour, 11px/500 (`label-small`) digit centred, 4px left margin from the preceding text. Hover: opacity 0.5 over `200ms linear`. Stale/deleted citation: grey-70 at 0.5 opacity permanently. Clicking opens a 420px-wide popover (`surface.dialog`, radius 8, `shadow.popover`; header = filename 14/24/500 with a rule, body 16/24, footer "View source" link in `text.link`) **and** switches the source panel into a source-viewer view with the cited passage highlighted (`surface.selected` background, weight 700). Screenshots: `notebook-light-citation-popover.png`, `notebook-light-source-viewer-citation.png`.

Maps to: our citation chips on Tutor messages (`[n] source, locator`). NotebookLM's chip is a plain numbered circle, not a labelled pill. Our chip needs to hold more text (source and locator), so treat this as the colour/shape reference (circle, can flex to a short pill) rather than a literal copy.

### Suggested-question chips
**Not captured**: NotebookLM's chat has no suggested-question affordance; the only comparable chip family is the Configure Chat "choice chip" (`mat-button-toggle`, 42h at 1px border ≈ 40h content, radius 24, 1px `border.default`, label 14/500; selected fills `accent.primary` with white text and a leading check icon; hover state layer 8% on-surface; gap 8 between chips). Screenshot: `chip-toggle-light-states.png`.

Maps to: our suggested-question chips should borrow the choice-chip shape (pill, radius 24, 1px border, 40–42h) and hover/selected treatment, since there is no closer NotebookLM analog.

### Chat input (query box)
Container: 1px `border.strong` (`#919191` / dark `#5e5e5e`), radius 16, padding 16 (12 on mobile), 524×74 at desktop width. Placeholder 16/24 "Ask a question or create something", source-count label 12–14px, trailing 40x40 circular send button; idle state is an 8% state-layer fill with a `#5e5e5e` arrow icon (reads as disabled until text is entered). Screenshot: `notebook-light-default.png`.

Maps to: our Tutor input at the bottom of the centre panel.

### Studio tile grid
2-column grid, 8px gap; tile 126.9×56 (effectively full-bleed/2 at 289.8 panel width), radius 12, padding ~12. 16px icon top-left, `label-medium` (12/16/500, tracking .096) one-line label, trailing 20px chevron that swaps to an edit pencil on hover. Colour pairs per tile type from `tile.{name}.bg` / `tile.{name}.fg` (Audio=blue, Slide Deck=yellow, Video=green, Mind Map=pink, Reports=yellow, Flashcards=orange, Quiz=cyan, Infographic=pink, Data Table=blue); hover adds the `fg` colour at 8% as a state layer; disabled tiles fill `rgba(0,0,0,.08)` with `#919191` text. Screenshot: `studio-light-tile-hover.png`.

Maps to: our **Studio** right panel's action tiles (new check, new asset, etc., though we likely need far fewer than NotebookLM's nine tile types).

### Note card / artifact row
NotebookLM has no dedicated "note card" component; the closest is the **artifact row** in the Studio library list: 64h, 24px icon in a 32px box (tinted with the tile's `fg` colour), title 14/16/500 (`title-small`), meta 12/16 tracking .096 `text.secondary` ("19 sources · 204d ago"), trailing `more_vert`. Failed/cancelled rows get a `grey-98` fill and radius 16; disabled rows sit at 50% opacity. The **note editor** itself (title input 22/32, toolbar with undo/redo/block-style/bold/italic between 1px rules, 14/24 body, "Convert to source" footer button) is the fuller analog for an editable note. Screenshot: `notebook-light-note-editor.png`.

Maps to: our mastery card / checks card / assets card in the Studio panel (as rows), and the concept note's editable body.

### Notebook card (home grid)
320×224, radius 12, 1px **transparent** border, no shadow, background cycles through six flat tile colours (`tile.{green,orange,pink,blue,cyan,yellow}.bg`). ~40px emoji, title `headline-small` (24/32) two-line clamp, meta 12/24 `#535559` with a 900-weight middle dot separator ("date, N sources"), 32px more-button. **No hover style exists in the live CSS** for this card: confirmed absence, not a capture gap. Create-card variant: outlined 1px `border.default`, radius 12, 64px `surface.selected` circle with an add icon, label 22/36. Screenshots: `home-light-grid.png`, `home-light-discover.png`, `home-light-collections-empty.png`.

Maps to: our Library grid cards and course cards on the Courses page.

### Buttons
| Variant | Height | Padding | Fill (light → dark) | Label | Border |
| --- | --- | --- | --- | --- | --- |
| Filled (primary) | 40 | 0 24 | `#4259ff` both themes | `#fff` | none |
| Tonal | 40/32 | 0 24 / 0 16 0 12 | `#000` → `#fff` | `#fff` → `#22262b` | none |
| Outlined | 40/32 | 0 16 (0 24 on source buttons) | transparent | `text.title` | 1px `border.default` |
| Text | 40 | 0 12 | none | `text.title` or `#0b57d0`/`#a8c7fa` | none |
| Icon | 40/36/32 | 8/6/4 | none | `text.title` or `text.secondary` | outlined variant only |

Radius 96 (pill) for all but icon buttons (full/circle). States: hover = currentColor state layer at 8%, pressed 12%, keyboard focus = 3px `border.focus-ring` ring drawn 5–6px outside the button, disabled = `state.disabled-container` fill / `state.disabled-content` label. Transition 280ms standard easing. **Destructive actions still use the brand blue filled button, not red**, confirmed in the delete-confirmation dialog. Screenshots: `modal-light-filled-states.png`, `home-light-delete-confirm-dialog.png`.

Maps to: our filled/outlined Button component. Note we only need two variants (primary filled, secondary outlined) per the DESIGN.md component table; NotebookLM's five-variant system is more than we need, but the state-layer percentages (8/12%) and the "destructive stays on-brand" rule are worth adopting.

### Chips
Choice chip: see Suggested-question chips above. Section-toggle pill (All/My notebooks/Discover/Collections): 40h radius 24, margin 4, selected = `surface.selected` fill + 1px `border.outline-variant` outline, unselected transparent, hover 8% on-surface. View toggle (grid/list): segmented control, 42h, 1px `border.outline-variant`, radius 16, 48px segments, selected shows a leading check with a 150ms label-shift animation.

Maps to: our filter Chip/Pill component (course filters, mastery filters on Learn index).

### Dialog
Surface `surface.dialog` (`#fff` / **`#131314`**, darker than panels), radius 16, **no shadow**, backdrop `rgba(0,0,0,.32)` (dark `.6`) fading over 400ms. Title 16/32/500 with a close icon button; body 14/24 or 16/24; footer right-aligned with the filled primary action last. Observed widths: 440 (Share), 544 (Create collection), 704 (Delete confirm), 720 (Configure Chat), 882 (Add sources), 1000 (Announcement). Screenshots: `notebook-light-configure-chat-dialog.png`, `notebook-light-share-dialog.png`, `notebook-light-announcement-modal.png`, `home-light-create-collection-modal.png`.

Maps to: any modal in our app (create/delete confirmations, settings sub-dialogs).

### Text field (outlined)
56h, padding 0 16, 1px `border.default` outline, radius 4 (the one component that stays on the tighter M3 radius, not our radius scale), input `body-large` (16/24) `#1f1f1f`. Label starts at 16px and floats to 12px on focus/filled; focus outline becomes 2px `accent.m3-primary`. Disabled state **not observed**: assume standard M3 38% opacity (flagged estimated in the source). Screenshot: `home-light-create-collection-modal.png`.

Maps to: our search field and any form input (Settings page, create-collection-equivalent dialogs).

### Menu
Panel `surface.panel`, radius 8, padding 8 0, `shadow.menu`. Item 48h, padding 0 12, 24px icon (`text.on-surface-variant`) + 12px gap, label `label-large`. Hover: `state.menu-hover` (light `rgba(66,89,255,.08)`, dark `rgba(255,255,255,.08)`, though one dark submenu trigger was observed at `.12`). Divider 1px, margin 8 0; submenu items carry a trailing chevron. Screenshots: `home-dark-settings-menu.png`, `home-dark-theme-submenu.png`, `home-light-sort-menu.png`, `home-light-card-menu.png`, `notebook-light-chat-menu.png`.

Maps to: our overflow/context menus (card menu, chat message menu).

### Tooltip
`surface.inverse` (`#303030` light, `#e3e3e3` dark, inverted per theme), text `#f2f2f2`/`#303030`, `body-small` (12/16, tracking .096), padding 4 8, radius 4, appears below the trigger after ~0.5s hover delay. Screenshot: `tooltip-light-default.png`.

Maps to: any tooltip we add (mastery dot detail, citation hover-preview).

### Flashcard / quiz surfaces, **estimated** (cross-origin iframe)
Flashcards: hint ~12px ghost text; card ~418×330, radius ~24; front `#303030` bg with white ~28/40 Google Sans text and a "N / total" counter; back white with 1px border and an "Explain" chip; prev/next are 48×40 outlined circles (next tinted `#4259ff`), wrong/right pills carry a red/green icon and count. Screenshots: `notebook-light-flashcards-front.png`, `notebook-light-flashcards-back.png`, `notebook-dark-flashcards-front.png` (front only, dark). Quiz: counter + 16/28/500 question, option cards full-width radius ~12 padding 16 on `grey-98` background, hover `grey-90`; "Next" is a filled blue **rounded rectangle** (not a pill: the one primary button in the whole system that breaks the 96px pill radius). Screenshots: `notebook-light-quiz-default.png`, `quiz-light-option-hover.png`. Mind map: horizontal tree, root ≈ `#c3cafc`, child nodes ≈ `#c2d3eb`, bezier edges ≈ `#7c8bf3`, expand badges; left control column (expand/zoom/download). Screenshot: `notebook-light-mindmap.png`.

Maps to: our **Review** rating card (flashcard analog) and the **neighbourhood graph** in Studio (mind-map analog, though ours is mastery-coloured rather than depth-coloured).

## Not in this system

NotebookLM has no equivalent for, and these need original design work:

- **Mastery dot / mastery-bucket colouring**: nothing in NotebookLM encodes a per-item proficiency state; its only "state" colouring is source-type icons and Studio tile categories, which are categorical, not a progress scale.
- **Rating row (Anki 4-button with interval preview)**: no spaced-repetition surface exists; the closest is the quiz's single "Next" action, which has no per-answer interval concept.
- **Stat tile / session-close numbers**: NotebookLM never shows a session-summary screen; Studio artifacts are generated once and browsed, not scored.
- **Step progress bar (focus-mode thin bar)**: no linear step-through experience; NotebookLM's closest progress affordance is the quiz's "N / total" counter text, not a bar.
- **Path node / unit card (course path)**: nothing sequences content into a locked/unlocked linear path.
- **Streak pill, target ring/pill**: no habit-loop UI at all.
- **Widget placeholder for a live asset (manim/tldraw embed)**: Studio artifacts render full-bleed in their own iframe view, not as an inline placeholder embedded in a longer flow.
- **Table row / notebook card hover**: confirmed absent in the live CSS, not just uncaptured (see Gaps).

## Gaps and estimated values

- **Iframe surfaces are pixel-estimated, not computed**: Flashcards, Quiz and Mind Map render in a cross-origin sandboxed iframe, so no computed style could be read. Every value for those three is sampled from a screenshot and drifts a few units from the true token (a known `#4259ff` sampled as `#4758f6`). Treat radii and exact greys there as approximate.
- **Text field disabled state is estimated** (assumed standard Material 38% opacity; never actually observed on a reachable screen).
- **Radio and switch controls have tokens only, no rendered instance**: no radio or on/off switch appears anywhere reachable in the product, so there is no layout/spacing reference, only the `--mat-radio-*` colour variables.
- **Toast/snackbar has no screenshot**: it closes before a window capture lands; values are computed-only (344x48 min, radius 16, `surface.toast`, `shadow.level3`).
- **Studio loading spinner**: presence noted (centred circular spinner, brand blue) but resolved before capture; colour not verified.
- **Most dark-theme overlays, the desktop dark workspace, and all mobile screenshots are values-only, no image**: a contamination incident (another session's capture ran in the same Chrome window) deleted 5 dark/mobile shots; the computed values in `raw/measurements.md` and `tokens.json` survive but there is nothing to eyeball.
- **Error states are entirely unreachable**: no failed upload, network-loss or 404 state could be triggered without actually breaking something; only the failed-artifact-row style (`grey-98` fill, radius 16) is known, from CSS.
- **A second design generation ("luminous-ui") sits dormant in the CSS** behind `body.luminous-ui` but was not enabled for this account and is not documented at all. Do not assume any luminous-specific class names apply.
- **Icons have no SVG source**: they're glyphs in a private ligature font (`Google Symbols`); the public substitute is Material Symbols Outlined, listed by ligature name in components.md.
- **Answered quiz states (correct/incorrect) are unreachable** without writing real progress into the account's notebook, so only default and hover option states exist.

---

**Six load-bearing values**: background `#edeffa` light / `#1a1d22` dark (`bg.page`). Panel `#ffffff` light / `#22262b` dark, radius 16, no border or shadow (`surface.panel`). Text primary `#1b1b1c` light / `#f2f2f2` dark (`text.title`). Accent `#4259ff`, identical in both themes (`accent.primary`). Radius scale runs 4/8/12/16 plus 96 for pill buttons and 9999 for icon buttons/search: no single "default card radius" outside that set. Font is Google Sans (display) + Google Sans Text (body/labels), both unavailable publicly, falling back to Google Sans Flex.

**Three-panel measurements** (1200px viewport, the closest to our 1440 desktop frame): side panels 289.8px each, centre panel 556.4px, 16px gutter all round, 64px header, 48px panel header, Studio widens to 450px when an artifact opens (200ms ease-in-out), collapsing to per-tab layout below 600px.

**Contradictory / surprising**: destructive actions (Delete) use the same brand-blue filled button as every other primary action; no red "danger" button exists anywhere in the system. The quiz's "Next" button is the one primary action that breaks the 96px pill radius, rendering as a rounded rectangle instead (estimated, so treat cautiously). Dialogs sit on a *darker* dark-theme surface (`#131314`) than the panels behind them (`#22262b`); the usual light-theme assumption that dialogs "float above" on a lighter surface flips in dark mode. Source-row checkboxes are deliberately styled in neutral grey rather than the brand blue used for every other checked/selected state, specifically so a fully-ticked source list "stays quiet." Notebook cards and table rows have **no hover style at all** in the live CSS, which is worth deciding on rather than copying; our library/table surfaces might want one.
