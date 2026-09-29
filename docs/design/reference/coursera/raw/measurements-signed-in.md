# Raw measurements (computed styles, CSS px), coursera.org signed-in learner pages, 2026-09-29

Read from the 11 redacted static snapshots in `raw/snapshots/` (stylesheets inlined from the CSSOM, scripts stripped), rendered by `tools/capture/signed-in/measure.mjs` in headless Chromium at 1440x900 @2x, light theme. The full per-state data, including every painted child layer, the authored state rules that match each element and the `extra` sub-measurements, is in `raw/components-signed-in.json`; crops are in `components/crops/signed-in/<component>-<state>.png` (256 colours).

Colours are written as hex and mapped to `--cds-color-*` tokens by matching the light value of `light-dark()` in `raw/css-vars.json` (semantic names first, the palette name last; the `--cds-color-` prefix is dropped in the tables). "no token" means no token has that light value. Spacing, radius, font size and typography tokens are matched the same way.

## States

| State | How it was reached |
| --- | --- |
| default | at rest as captured |
| hover | real mouse hover, 450ms settle |
| focus-visible | real keyboard focus (focus, Shift+Tab, Tab); native :focus-visible rules only |
| focus-visible-cds | keyboard focus plus the CDS focusVisible class(es) its JavaScript adds; added by this script from the page's own rules (emulated) |
| pressed | real mouse button held down (:active), released over the page ground; clicks preventDefault()ed |
| other | selected / current / expanded / collapsed / ... are other elements captured in that state |

`focus-visible-cds` needs a note. CDS does not style `:focus-visible`: its focus ring rules are keyed on classes (`cds-buttonBase-focusVisible`, `cds-button-focusVisible`, `cds-link-focusVisible`, `cds-tab-focusVisible`) that its JavaScript adds on a keyboard focus. With scripts stripped, a real Tab gives only what native `:focus-visible` rules paint, which is the `focus-visible` column. The `focus-visible-cds` column adds the class the stylesheet pairs with the element's own Emotion class, so it shows the authored ring, and it is emulated.

Cells in a state column that repeat the default are written as `=`.

## Summary for the rebuild

The values that decide whether a rebuilt course list and course page read as Coursera. Each is measured in a table below.

- **Course page grid at 1440.** A 64px header sits on the page ground, #f2f5fa (`neutral-background-primary-weak`, grey-25); there is no header rule on course pages. Below it, three white cards with 16px gutters: sidebar 300 (x 16), main 716 (x 332), right rail 360 (x 1064), 16px to the right edge. Grades and Course info drop the rail and the main card grows to 1092. The body is a fixed 100vh layout; the sidebar, main column and rail scroll inside it.
- **Cards.** White, radius 16 (`border-radius-200`), no border, no shadow on the course pages. Padding: sidebar 16, main 24 top / 32 sides, rail cards 24, stacked 16 apart. On My Learning the page is white and cards carry the edge instead: 1px #c1cbdb (`neutral-stroke-primary-weak`, grey-200), radius 16, padding 24 (course cards 24 / 16), 24 apart.
- **Item pages.** Outline card 360 at x 16 (radius 16 by clipping), item card from x 392: 944 wide on a video (plus an 88px tool strip with a 1px #c1cbdb left rule, radius 0 16 16 0), 1032 on a reading or assignment. With the transcript open: item 700.5, a 10px drag separator, transcript pane 233.5, tool strip 88.
- **My Learning grid.** A 65px sticky white header with a 1px #c1cbdb bottom rule. Content container 1376 (32px margins), split two thirds / one third: left column 917.3, right 458.7, each with 16px inner padding, so cards are 885.3 and 426.7 wide.
- **Item row (module page).** A 668x60 link, padding 8, gap 8, radius 8, rows 2px apart (62px pitch). 20px status icon (completed: green check, #197d12 `feedback-success`), title Source Sans Pro 400 16/24 #0d0f12, meta line 400 14/20 #48546e (`neutral-primary-weak`), e.g. "Video • 5 min". Hover tints the row #f0f6ff (`interactive-background-primary-hover-weak`, blue-25); there is no :active rule, so pressed looks like hover.
- **Current item.** The same #f0f6ff tint at rest, the title goes to 600, and a primary "Resume" button (80.8x36) sits at the right end of the row. In the item outline each row is a 344px-wide wrapper with radius 8 inside a full-width link; the current one gets the #f0f6ff tint and its title steps from 400 14/20 to 600 16/24.
- **Sidebar rows.** Module rows 268x36 (the selected one 268x40), padding 8, radius 8, 2px apart; a 16px ring (1px #8495b0) in a 20px box, label 400 14/20. Selected: #f0f6ff background and the label steps up to 600 16/24. Grades, Notes and the other links are 268x40 rows, 400 16/24, same hover tint; the selected one (Grades, Course Info) gets the tint at rest.
- **Progress bar.** 8px tall, radius 8. Track #f2f5fa with a 1px #f2f5fa border, 425.7 wide under the course title (12px above it); fill #6f29e5 (`emphasis-quaternary-background-strong`, purple-750), radius 8.
- **Resume / primary button.** 36px tall, padding 8 / 16, radius 8, Source Sans Pro 600 14/20 with 0.14px tracking, white text. #0056d2 (`interactive-primary`, blue-800) at rest; hover #0b408b (`interactive-primary-hover`) plus an underline; pressed #3c0f8a (`interactive-primary-pressed`, purple-900). A 1px inset shadow in the rest colour; no transition. The large variant (reading, assignment) is 48px tall, padding 12 / 24, 600 16/24 with 0.16px tracking.
- **Tab bar (My Learning).** Tabs 48px tall, padding 12 / 0, 24px apart, label 400 16/24 #404b5e (`interactive-secondary-inactive`). The selected tab is 600 16/24 #0d0f12 with 0.16px tracking over a 4px #0d0f12 indicator (radius 2 2 0 0), which sits on a full-width 1px #c1cbdb rule. Hover darkens the label to #232b3a and draws a 4px #c1cbdb bar with the same radius.
- **Focus ring.** CDS buttons and tabs are styled from a class CDS's JavaScript adds on keyboard focus, so it is emulated here (the `focus-visible-cds` column): buttons get an ::after ring at inset -2px, radius 8, `box-shadow: 0 0 0 1px #804ee4, 0 0 0 2px #f0f6ff` (`interactive-stroke-primary-focus`, purple-600, then `interactive-stroke-primary-focus-invert`); tabs get a 1px solid #804ee4 outline at offset 2 with radius 8. List links (item rows, sidebar rows) use real `:focus-visible`: a 2px solid #804ee4 outline at offset -3.
- **Type scale in use.** Everything is Source Sans Pro. Reading title 400 44/52 (-0.1px); assignment title 600 36/42; My Learning greeting 600 30/36; Grades h1 600 28/36; video title and course info title 600 24/28; module title and sidebar course title 600 20/24; card and rail headings 600 16/20; body 400 16/24; meta and secondary text 400 14/20 in #48546e.

## What could not be reached

The snapshots have no scripts, so anything that needs JavaScript is missing: every menu (app switcher, help, language, notifications, avatar, Explore mega menu, the course overflow "…" menu), the Coursera AI chat panel, opening or closing any accordion or disclosure (only the states captured are measured: Course Material open and closed, objectives shown and hidden, outline modules open and closed), "Show more" expansions, the language select list, calendar month paging, tooltips, the Save note dialog, video playback (the player is a poster frame; the control bar's show/hide is scripted) and the transcript highlight moving. CDS's keyboard focus ring is emulated as described above. The reading in the snapshot has no subheadings, lists, code or tables; their styles come from a probe block the script inserts into the CML viewer (marked as such under "Reading: body paragraph"), plus the authored CML rules listed there. Dark theme was not measured.

## Page shells and grid

### Page shell: course home (module page)

Three white cards on a grey ground under a 64px header: course sidebar, main module column, right rail of two stacked cards. The body is a fixed 100vh layout; the sidebar, main column and rail scroll inside it.

Key `shell-course-home`. Read from `__m.ground()` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 1440×836 |
| Padding | 0 0 0 16px (spacing-200) |
| Gap | 16px (spacing-200) |
| Background | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | div.cds-1.cds-2 1440.0x836.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div 300.0x820.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 16px; div.cds-Avatar-base.cds-Avatar-organization 38.0x38.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 5px; div.cds-144.cds-129 0.0x0.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/shell-course-home-default.png) |

Sub-measurements:

- viewport: 1440x900
- documentHeight: 900
- bodyBg: rgb(255, 255, 255)
- ground: div 1440×836 at (0, 64), "Duke University Introduction to Machine ", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25), padding 0px 0px 0px 16px, gap 16px, overflow-y hidden
- header: nav 1440×64 at (0, 0), "E SEARCH IN COURSE Search L", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- cards: sidebar, div 300×820 at (16, 64), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px, padding 16px, overflow-y auto ; main, div 716×2990 at (332, 64), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px, padding 24px 32px, overflow-y hidden ; rail-goal, div 360×198 at (1064, 64), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px ; rail-timeline, div 360×440 at (1064, 278), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px, padding 24px
- gaps: between: sidebar → main; dx: 16 ; between: main → rail-goal; dx: 16 ; between: rail-goal ↓ rail-timeline; dy: 16
- scrollContainers: div 1108×836 at (332, 64), "Simple Introduction to Machine Learning ", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), overflow-y auto, scrollHeight 3006

### Page shell: grades

Two cards: sidebar and a wide main card; no right rail.

Key `shell-course-grades`. Read from `__m.ground()` on course-grades.

| Property | default |
| --- | --- |
| Size (w×h) | 1440×836 |
| Padding | 0 0 0 16px (spacing-200) |
| Gap | 16px (spacing-200) |
| Background | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | div.cds-1.cds-2 1440.0x836.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div 300.0x820.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 16px; div.cds-Avatar-base.cds-Avatar-organization 38.0x38.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 5px; div.cds-144.cds-129 0.0x0.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/shell-course-grades-default.png) |

Sub-measurements:

- viewport: 1440x900
- documentHeight: 900
- bodyBg: rgb(255, 255, 255)
- ground: div 1440×836 at (0, 64), "Duke University Introduction to Machine ", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25), padding 0px 0px 0px 16px, gap 16px, overflow-y hidden
- header: nav 1440×64 at (0, 0), "E SEARCH IN COURSE Search L", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- cards: sidebar, div 300×820 at (16, 64), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px, padding 16px, overflow-y auto ; main, div 1092×820 at (332, 64), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px, padding 24px 32px, overflow-y hidden ; rail-goal, div 1092×820 at (332, 64), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px, padding 24px 32px, overflow-y hidden
- gaps: between: sidebar → main; dx: 16
- scrollContainers (0):

### Page shell: course info

Same two-card layout as grades.

Key `shell-course-info`. Read from `__m.ground()` on course-info.

| Property | default |
| --- | --- |
| Size (w×h) | 1440×836 |
| Padding | 0 0 0 16px (spacing-200) |
| Gap | 16px (spacing-200) |
| Background | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | div.cds-1.cds-2 1440.0x836.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div 300.0x820.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 16px; div.cds-Avatar-base.cds-Avatar-organization 38.0x38.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 5px; div.cds-144.cds-129 0.0x0.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/shell-course-info-default.png) |

Sub-measurements:

- viewport: 1440x900
- documentHeight: 900
- bodyBg: rgb(255, 255, 255)
- ground: div 1440×836 at (0, 64), "Duke University Introduction to Machine ", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25), padding 0px 0px 0px 16px, gap 16px, overflow-y hidden
- header: nav 1440×64 at (0, 0), "E SEARCH IN COURSE Search L", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- cards: sidebar, div 300×820 at (16, 64), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px, padding 16px, overflow-y auto ; main, div 1092×1886 at (332, 64), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px, padding 24px 32px, overflow-y hidden ; rail-goal, div 1092×1886 at (332, 64), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px, padding 24px 32px, overflow-y hidden
- gaps: between: sidebar → main; dx: 16
- scrollContainers: div 1108×836 at (332, 64), "Introduction to Machine Learning  by Duk", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), overflow-y auto, scrollHeight 1922

### Page shell: video item

Item view: collapsible outline card on the left, the item card, then a tool strip (Transcript, Notes, Files) at the right edge. The header drops the search and shows the partner logo instead.

Key `shell-item-video`. Read from `__m.ground()` on item-video.

| Property | default |
| --- | --- |
| Size (w×h) | 1440×900 |
| Background | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | div 1440.0x900.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div.rc-GlobalPageHeaderContainer 1440.0x64.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div.cds-1.cds-2 1408.0x64.0 border T:1px solid #ffffff (neutral-stroke-primary-invert, neutral-primary-invert, white-0); div 1.0x26.0 border L:1px solid #a7b4c9 (neutral-disabled-strong, grey-300) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/shell-item-video-default.png) |

Sub-measurements:

- viewport: 1440x900
- documentHeight: 900
- bodyBg: rgb(255, 255, 255)
- ground: body 1440×0 at (0, 0), "L Introduction to Machine Learning Today", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0)
- header: nav 1440×64 at (0, 0), "L", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- cards: outline-clip, div 360×819 at (16, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 16px, overflow-y hidden ; outline, div 360×819 at (16, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) ; item-clip, div 960×819 at (376, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 0px 16px 0px 0px, overflow-y hidden ; item, div 944×819 at (392, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px 0px 0px 16px, margin 0px 0px 0px 16px, overflow-y hidden ; separator, div 0×819 at (1336, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) ; tool-strip, div 88×819 at (1336, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975) ; tool-strip-inner, div 88×819 at (1336, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), border L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 0px 16px 16px 0px, padding 8px, gap 8px
- gaps: between: outline → item-clip; dx: 0 ; between: item → tool-strip; dx: 0
- scrollContainers: div 360×611 at (16, 273), "Module 1 Simple Introduction to Machine ", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), overflow-y auto, scrollHeight 2993

### Page shell: video item with the transcript open

The tool pane opens between the item and the tool strip, behind a 10px drag separator.

Key `shell-item-video-transcript`. Read from `__m.ground()` on item-video-transcript.

| Property | default |
| --- | --- |
| Size (w×h) | 1440×900 |
| Background | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | div 1440.0x900.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div.rc-GlobalPageHeaderContainer 1440.0x64.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div.cds-1.cds-2 1408.0x64.0 border T:1px solid #ffffff (neutral-stroke-primary-invert, neutral-primary-invert, white-0); div 1.0x26.0 border L:1px solid #a7b4c9 (neutral-disabled-strong, grey-300) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/shell-item-video-transcript-default.png) |

Sub-measurements:

- viewport: 1440x900
- documentHeight: 900
- bodyBg: rgb(255, 255, 255)
- ground: body 1440×0 at (0, 0), "L Introduction to Machine Learning Today", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0)
- header: nav 1440×64 at (0, 0), "L", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- cards: outline-clip, div 360×819 at (16, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 16px, overflow-y hidden ; outline, div 360×819 at (16, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) ; item-clip, div 716.5×819 at (376, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 0px 16px 0px 0px, overflow-y hidden ; item, div 700.5×819 at (392, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px 0px 0px 16px, margin 0px 0px 0px 16px, overflow-y hidden ; tool-pane, div 233.5×819 at (1102.5, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), overflow-y hidden ; separator, div 10×819 at (1092.5, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) ; tool-strip, div 88×819 at (1336, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975) ; tool-strip-inner, div 88×819 at (1336, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), border L:1px solid transparent (no token), radius 0px 16px 16px 0px, padding 8px, gap 8px
- gaps: between: outline → item-clip; dx: 0 ; between: item → separator; dx: 0 ; between: separator → tool-pane; dx: 0 ; between: tool-pane → tool-strip; dx: 0
- scrollContainers: div 360×611 at (16, 273), "Module 1 Simple Introduction to Machine ", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), overflow-y auto, scrollHeight 2993 ; div 217.5×703 at (1118.5, 165), "Interactive Transcript - Enable basic tr", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), padding 4px 4px 0px, overflow-y auto, scrollHeight 4296

### Page shell: reading item

Outline card plus one wide item card; the reading column is centred inside it.

Key `shell-item-reading`. Read from `__m.ground()` on item-reading.

| Property | default |
| --- | --- |
| Size (w×h) | 1440×900 |
| Background | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | div 1440.0x900.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div.rc-GlobalPageHeaderContainer 1440.0x64.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div.cds-1.cds-2 1408.0x64.0 border T:1px solid #ffffff (neutral-stroke-primary-invert, neutral-primary-invert, white-0); div 1.0x26.0 border L:1px solid #a7b4c9 (neutral-disabled-strong, grey-300) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/shell-item-reading-default.png) |

Sub-measurements:

- viewport: 1440x900
- documentHeight: 900
- bodyBg: rgb(255, 255, 255)
- ground: body 1440×0 at (0, 0), "L Introduction to Machine Learning Today", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0)
- header: nav 1440×64 at (0, 0), "L", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- cards: outline-clip, div 360×819 at (16, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 16px, overflow-y hidden ; outline, div 360×819 at (16, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) ; item-clip, div 1048×819 at (376, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 0px 16px 16px 0px, padding 0px 16px 0px 0px, overflow-y hidden ; item, div 1032×819 at (392, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px 0px 0px 16px, margin 0px 0px 0px 16px, overflow-y hidden ; separator, div 0×819 at (1424, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0)
- gaps: between: outline → item-clip; dx: 0
- scrollContainers: div 360×611 at (16, 273), "Module 1 Simple Introduction to Machine ", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), overflow-y auto, scrollHeight 2993

### Page shell: assignment item

Outline card plus the item card holding the assignment cover.

Key `shell-item-assignment`. Read from `__m.ground()` on item-assignment.

| Property | default |
| --- | --- |
| Size (w×h) | 1440×900 |
| Background | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | div 1440.0x900.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div.rc-GlobalPageHeaderContainer 1440.0x64.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div.cds-1.cds-2 1408.0x64.0 border T:1px solid #ffffff (neutral-stroke-primary-invert, neutral-primary-invert, white-0); div 1.0x26.0 border L:1px solid #a7b4c9 (neutral-disabled-strong, grey-300) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/shell-item-assignment-default.png) |

Sub-measurements:

- viewport: 1440x900
- documentHeight: 900
- bodyBg: rgb(255, 255, 255)
- ground: body 1440×0 at (0, 0), "L Introduction to Machine Learning Today", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0)
- header: nav 1440×64 at (0, 0), "L", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- cards: outline-clip, div 360×819 at (16, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 16px, overflow-y hidden ; outline, div 360×819 at (16, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) ; item-clip, div 1048×819 at (376, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 0px 16px 16px 0px, padding 0px 16px 0px 0px, overflow-y hidden ; item, div 1032×819 at (392, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 16px 0px 0px 16px, margin 0px 0px 0px 16px, overflow-y hidden ; separator, div 0×819 at (1424, 65), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0)
- gaps: between: outline → item-clip; dx: 0
- scrollContainers: div 360×611 at (16, 273), "Module 1 Simple Introduction to Machine ", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), overflow-y auto, scrollHeight 2993

### Page shell: My Learning

White page, full-width sticky header with a bottom rule, a greeting band, tabs, then a two-column grid: course cards on the left, calendar/stats and certificates cards on the right.

Key `shell-my-learning`. Read from `__m.ground()` on my-learning.

| Property | default |
| --- | --- |
| Size (w×h) | 1440×2224.98 |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Painted layers | body 1440.0x2225.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0); div.rc-GlobalPageHeaderContainer 1440.0x65.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0); nav 1440.0x65.0 border B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200); div.cds-9.cds-10 1376.0x64.0 border T:1px solid #ffffff (neutral-stroke-primary-invert, neutral-primary-invert, white-0) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/shell-my-learning-default.png) |

Sub-measurements:

- viewport: 1440x900
- documentHeight: 2225
- bodyBg: rgb(255, 255, 255)
- ground: body 1440×2224.98 at (0, 0), "Explore My Learning Degrees ​  Career go", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0)
- header: nav 1440×65 at (0, 0), "Explore My Learning Degrees ​  Career go", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), border B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200)
- cards: container, div 1376×1502.98 at (32, 49), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin -16px ; left-column, div 917.33×1170 at (32, 350), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 16px ; right-column, div 458.66×1170 at (949.3, 350), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 16px ; program-card, div 885.33×760 at (48, 412), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 16px, overflow-y hidden ; course-card, div 885.33×132 at (48, 1196), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 16px, padding 24px 16px, overflow-y hidden ; calendar-card, div 426.66×503.8 at (965.3, 366), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 16px, padding 24px, margin 0px 0px 24px ; certificates-card, div 426.66×222 at (965.3, 893.8), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 16px, padding 24px, margin 0px 0px 24px ; header, div 1440×65 at (0, 0), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0)
- gaps: between: program-card ↓ course-card; dy: 24 ; between: course-card → right-column; dx: 16 ; between: calendar-card ↓ certificates-card; dy: 24
- scrollContainers (0):

## Top bar

### Course top bar

The in-course header: app switcher, Coursera wordmark, a 1px divider, the programme badge, the "Search in course" input with an attached Search button, and help, language, bell, AI and avatar icon buttons on the right. It sits on the grey ground with no bottom rule.

Key `topbar-course`. Read from `__m.q("[data-testid=page-header-wrapper]", 0)` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 1440×64 |
| Background | transparent (no token) |
| Painted layers | div.cds-1.cds-2 1392.0x64.0 border T:1px solid #ffffff (neutral-stroke-primary-invert, neutral-primary-invert, white-0); button.cds-105.cds-iconButton-small 32.0x32.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset; div 1.0x26.0 border L:1px solid #a7b4c9 (neutral-disabled-strong, grey-300); div 32.0x32.0 bg #00255d (no token) r 50% |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/topbar-course-default.png) |

Sub-measurements:

- bar: nav 1440×64 at (0, 0), "E SEARCH IN COURSE Search L", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- children: Switcher, button 32×32 at (24, 16.5), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 8px, shadow transparent 0px 0px 0px 1px inset ; Coursera for Example Program, a 192×32 at (72, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800) ; Example University, div 32×32 at (232, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), bg #00255d (no token), radius 50% ; Search in course, input 299.59×36 at (280, 14.5), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), border T:1px solid #53617e (grey-700) \| R:1px solid #53617e (grey-700) \| B:1px solid #53617e (grey-700) \| L:1px solid #53617e (grey-700), radius 4px 0px 0px 4px, padding 12px, overflow-y clip ; Search, button 73.98×36 at (579.6, 14.5), font 600 14px/20px Source Sans Pro ls 0.14px, colour #ffffff (neutral-primary-invert, neutral-background-primary, white-0), bg #0056d2 (interactive-primary, feedback-informative, blue-800), radius 0px 4px 4px 0px, padding 8px 16px, shadow #0056d2 0px 0px 0px 1px inset ; Help menu, button 32×32 at (1252, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset ; Select language: English, button 32×32 at (1284, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset ; Notifications, button 32×32 at (1316, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset ; Chat with Coursera AI, button 36×36 at (1348, 14.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 4px, shadow transparent 0px 0px 0px 1px inset ; User dropdown menu for Learner, button 32×32 at (1384, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset

### Top bar: app switcher (9-dot grid)

Ghost small icon button, 32x32 with a 24px icon.

Key `topbar-switcher`. Read from `__m.q("[data-testid=SwitcherButton]", 0)` on course-module-1.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 32×32 | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) |
| Box shadow | transparent 0px 0px 0px 1px inset | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | button.cds-105.cds-iconButton-small 32.0x32.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | button.cds-105.cds-iconButton-small 32.0x32.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | = | button.cds-105.cds-iconButton-small 32.0x32.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-105.cds-iconButton-small 36pxx36px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-105.cds-iconButton-small 32.0x32.0 bg #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 24×24, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = |
| Crop | [png](../components/crops/signed-in/topbar-switcher-default.png) | [png](../components/crops/signed-in/topbar-switcher-hover.png) | [png](../components/crops/signed-in/topbar-switcher-focus-visible.png) | [png](../components/crops/signed-in/topbar-switcher-focus-visible-cds.png) | [png](../components/crops/signed-in/topbar-switcher-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-34gt8z+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.css-34gt8z:focus { outline: none; }`
- `.css-34gt8z.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-34gt8z.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-34gt8z.cds-iconButton-ghost:hover { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-34gt8z.cds-iconButton-ghost.cds-buttonBase-focusVisible { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-34gt8z.cds-iconButton-ghost:active { --iconButton-background: var( --cds-color-interactive-background-primary-pressed-weak ); --iconButton-color: var(--cds-color-interactive-primary-pressed); }`

### Top bar: logo link

Coursera wordmark (127x32 svg), a 1x26 divider, then the programme badge. One link.

Key `topbar-logo`. Read from `__m.q("[data-testid=home-logo]", 0)` on course-module-1.

| Property | default | hover | focus-visible | focus-visible-cds |
| --- | --- | --- | --- | --- |
| Size (w×h) | 192×32 | = | = | = |
| Background | transparent (no token) | = | = | = |
| Outline | none | = | 1px auto #005fcc (no token) offset 1px | 1px auto #005fcc (no token) offset 1px |
| Painted layers | div 1.0x26.0 border L:1px solid #a7b4c9 (neutral-disabled-strong, grey-300); div 32.0x32.0 bg #00255d (no token) r 50% | = | a 192.0x32.0 outline 1px auto rgb(0, 95, 204) offset 1px; div 1.0x26.0 border L:1px solid #a7b4c9 (neutral-disabled-strong, grey-300); div 32.0x32.0 bg #00255d (no token) r 50% | a 192.0x32.0 outline 1px auto rgb(0, 95, 204) offset 1px; div 1.0x26.0 border L:1px solid #a7b4c9 (neutral-disabled-strong, grey-300); div 32.0x32.0 bg #00255d (no token) r 50% |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | = | = | = |
| Text decoration | none | underline auto offset auto | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = |
| Icon | 127×32, fill #0056d2 (interactive-primary, feedback-informative, blue-800), color #0056d2 (interactive-primary, feedback-informative, blue-800) | = | = | = |
| Crop | [png](../components/crops/signed-in/topbar-logo-default.png) | [png](../components/crops/signed-in/topbar-logo-hover.png) | [png](../components/crops/signed-in/topbar-logo-focus-visible.png) | [png](../components/crops/signed-in/topbar-logo-focus-visible-cds.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; no CDS focusVisible rule names this element.

Sub-measurements:

- divider: div 1×26 at (215, 19.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), border L:1px solid #a7b4c9 (neutral-disabled-strong, grey-300), margin 0px 16px
- wordmark: svg 127×32 at (72, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), fill #0056d2 (interactive-primary, feedback-informative, blue-800), overflow-y hidden

### Top bar: programme badge

Round 32px navy disc with the programme initial.

Key `topbar-program-badge`. Read from `__m.q("[aria-label=\"Example University\"]", 0)` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 32×32 |
| Radius | 50% (border-radius-max) |
| Background | #00255d (no token) |
| Painted layers | div 32.0x32.0 bg #00255d (no token) r 50% |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) |
| Cursor | pointer |
| Crop | [png](../components/crops/signed-in/topbar-program-badge-default.png) |

Sub-measurements:

- text: span 32×36 at (232, 14.5), "E", font 600 20.8px/36px Source Sans Pro ls -0.1px, colour #ffffff (neutral-primary-invert, neutral-background-primary, white-0)

### Top bar: "Search in course" input

Square-cornered 300x36 input; its right edge meets the Search button.

Key `topbar-course-search-input`. Read from `__m.q("#rc-InCourseSearchBarInput-input", 0)` on course-module-1.

| Property | default | hover | focus-visible |
| --- | --- | --- | --- |
| Size (w×h) | 299.59×36 | = | = |
| Padding | 12px (spacing-150) | = | = |
| Border | 1px solid #53617e (grey-700) | = | 1px solid #227af9 (blue-600) |
| Radius | 4px (border-radius-50) 0px 0px 4px (border-radius-50) | = | = |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) | = | = |
| Painted layers | input._8jva4z 299.6x36.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #53617e (grey-700) \| R:1px solid #53617e (grey-700) \| B:1px solid #53617e (grey-700) \| L:1px solid #53617e (grey-700) r 4px 0px 0px 4px | = | input._8jva4z 299.6x36.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #227af9 (blue-600) \| R:1px solid #227af9 (blue-600) \| B:1px solid #227af9 (blue-600) \| L:1px solid #227af9 (blue-600) r 4px 0px 0px 4px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = |
| Cursor | text | = | = |
| Crop | [png](../components/crops/signed-in/topbar-course-search-input-default.png) | [png](../components/crops/signed-in/topbar-course-search-input-hover.png) | [png](../components/crops/signed-in/topbar-course-search-input-focus-visible.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab.

Sub-measurements:

- wrapper: div 299.59×36 at (280, 14.5), font 400 16px/24px OpenSans, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- form: form 361×36 at (280, 14.5), "SEARCH IN COURSE Search", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

Authored state rules that match this element (1, first 6; the rest are in the JSON):

- `._8jva4z:focus { border-color: var(--cds-color-blue-600, #2A73CC); outline: none; }`

### Top bar: attached Search button

Primary button, 36px tall, joined to the input.

Key `topbar-course-search-button`. Read from `__m.q("[data-track-component=search_button_click]", 0)` on course-module-1.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 73.98×36 | = | = | = | = |
| Padding | 8px (spacing-100) / 16px (spacing-200) | = | = | = | = |
| Radius | 0px 4px (border-radius-50) 4px (border-radius-50) 0px | = | = | = | = |
| Background | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) | = | = | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Box shadow | #0056d2 0px 0px 0px 1px inset | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | button.cds-105.cds-button-disableElevation 74.0x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 0px 4px 4px 0px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | button.cds-105.cds-button-disableElevation 74.0x36.0 bg #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) r 0px 4px 4px 0px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | = | button.cds-105.cds-button-disableElevation 74.0x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 0px 4px 4px 0px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-105.cds-button-disableElevation 77.9844pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-105.cds-button-disableElevation 74.0x36.0 bg #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) r 0px 4px 4px 0px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = | = | = |
| Colour | #ffffff (neutral-primary-invert, neutral-background-primary, white-0) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/topbar-course-search-button-default.png) | [png](../components/crops/signed-in/topbar-course-search-button-hover.png) | [png](../components/crops/signed-in/topbar-course-search-button-focus-visible.png) | [png](../components/crops/signed-in/topbar-course-search-button-focus-visible-cds.png) | [png](../components/crops/signed-in/topbar-course-search-button-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-1qcgpjh+.cds-buttonBase-focusVisible, button.css-1qcgpjh+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (9, first 6; the rest are in the JSON):

- `.css-1qcgpjh:focus { outline: none; }`
- `.css-1qcgpjh.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-1qcgpjh.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `@media (hover: hover) .css-1qcgpjh:hover { border-color: var(--cds-color-interactive-primary-hover); background-color: var(--cds-color-interactive-primary-hover); }`
- `.css-1qcgpjh:active { border-color: var(--cds-color-interactive-primary-pressed); background-color: var(--cds-color-interactive-primary-pressed); }`
- `.css-1qcgpjh:active.cds-button-disableElevation::after { content: unset; }`

### Top bar: help icon button

Ghost small icon button (help, language, bell and avatar share it): 32x32, 24px icon.

Key `topbar-icon-button`. Read from `__m.q("[data-testid=header-help-button]", 0)` on course-module-1.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 32×32 | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) |
| Box shadow | transparent 0px 0px 0px 1px inset | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | button.cds-105.cds-iconButton-small 32.0x32.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | button.cds-105.cds-iconButton-small 32.0x32.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | = | button.cds-105.cds-iconButton-small 32.0x32.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-105.cds-iconButton-small 36pxx36px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-105.cds-iconButton-small 32.0x32.0 bg #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Cursor | pointer | = | = | = | = |
| Icon | 24×24, fill none (no token), color #404b5e (interactive-secondary-inactive, grey-800) | = | = | = | = |
| Crop | [png](../components/crops/signed-in/topbar-icon-button-default.png) | [png](../components/crops/signed-in/topbar-icon-button-hover.png) | [png](../components/crops/signed-in/topbar-icon-button-focus-visible.png) | [png](../components/crops/signed-in/topbar-icon-button-focus-visible-cds.png) | [png](../components/crops/signed-in/topbar-icon-button-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-9jkubm+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground).

Sub-measurements:

- siblings: button 32×32 at (1284, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset ; button 32×32 at (1316, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset ; button 36×36 at (1348, 14.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 4px, shadow transparent 0px 0px 0px 1px inset ; button 32×32 at (1384, 16.5), "L", font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.css-9jkubm:focus { outline: none; }`
- `.css-9jkubm.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-9jkubm.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-9jkubm.cds-iconButton-ghost:hover { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-9jkubm.cds-iconButton-ghost.cds-buttonBase-focusVisible { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-9jkubm.cds-iconButton-ghost:active { --iconButton-background: var( --cds-color-interactive-background-primary-pressed-weak ); --iconButton-color: var(--cds-color-interactive-primary-pressed); }`

### Top bar: Coursera AI launcher

Ghost medium icon button, 36x36, holding a 24px sparkle image.

Key `topbar-ai-button`. Read from `__m.q("[data-testid=coach-chat-launcher-button]", 0)` on course-module-1.

| Property | default | hover |
| --- | --- | --- |
| Size (w×h) | 36×36 | = |
| Radius | 4px (border-radius-50) | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) |
| Box shadow | transparent 0px 0px 0px 1px inset | = |
| Painted layers | button.cds-105.cds-iconButton-medium 36.0x36.0 r 4px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | button.cds-105.cds-iconButton-medium 36.0x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 4px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) |
| Cursor | pointer | = |
| Crop | [png](../components/crops/signed-in/topbar-ai-button-default.png) | [png](../components/crops/signed-in/topbar-ai-button-hover.png) |

How: hover: mouse hover.

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.css-95crsg:focus { outline: none; }`
- `.css-95crsg.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-95crsg.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-95crsg.cds-iconButton-ghost:hover { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-95crsg.cds-iconButton-ghost.cds-buttonBase-focusVisible { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-95crsg.cds-iconButton-ghost:active { --iconButton-background: var( --cds-color-interactive-background-primary-pressed-weak ); --iconButton-color: var(--cds-color-interactive-primary-pressed); }`

### Top bar: avatar menu

User avatar, 24px navy disc with the initial, inside a 32px ghost icon button.

Key `topbar-avatar`. Read from `__m.q("[data-e2e=header-profile]", 0)` on course-module-1.

| Property | default | hover | focus-visible | focus-visible-cds |
| --- | --- | --- | --- | --- |
| Size (w×h) | 32×32 | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) |
| Box shadow | transparent 0px 0px 0px 1px inset | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px |
| Painted layers | button.cds-105.cds-iconButton-small 32.0x32.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset; div.cds-Avatar-initial 24.0x24.0 bg #002457 (callouts-background-primary-strong, emphasis-primary-background-xxstrong, blue-950) r 50% | button.cds-105.cds-iconButton-small 32.0x32.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset; div.cds-Avatar-initial 24.0x24.0 bg #002457 (callouts-background-primary-strong, emphasis-primary-background-xxstrong, blue-950) r 50% | = | button.cds-105.cds-iconButton-small 32.0x32.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-105.cds-iconButton-small 36pxx36px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px; div.cds-Avatar-initial 24.0x24.0 bg #002457 (callouts-background-primary-strong, emphasis-primary-background-xxstrong, blue-950) r 50% |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) |
| Cursor | pointer | = | = | = |
| Crop | [png](../components/crops/signed-in/topbar-avatar-default.png) | [png](../components/crops/signed-in/topbar-avatar-hover.png) | [png](../components/crops/signed-in/topbar-avatar-focus-visible.png) | [png](../components/crops/signed-in/topbar-avatar-focus-visible-cds.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-9jkubm+.cds-buttonBase-focusVisible.

Sub-measurements:

- avatar: div 24×24 at (1388, 20.5), "L", font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 50%, overflow-y hidden
- initial: span 8.05×16 at (1396, 24.5), "L", font 600 16px/16px Source Sans Pro, colour #ffffff (neutral-primary-invert, neutral-background-primary, white-0)

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.css-9jkubm:focus { outline: none; }`
- `.css-9jkubm.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-9jkubm.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-9jkubm.cds-iconButton-ghost:hover { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-9jkubm.cds-iconButton-ghost.cds-buttonBase-focusVisible { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-9jkubm.cds-iconButton-ghost:active { --iconButton-background: var( --cds-color-interactive-background-primary-pressed-weak ); --iconButton-color: var(--cds-color-interactive-primary-pressed); }`

### Item top bar

On item pages the header keeps only the wordmark, a divider and the partner logo on the left, and help, language, AI and avatar on the right.

Key `topbar-item`. Read from `__m.q("[data-testid=page-header-wrapper]", 0)` on item-video.

| Property | default |
| --- | --- |
| Size (w×h) | 1440×64 |
| Background | transparent (no token) |
| Painted layers | div.cds-1.cds-2 1408.0x64.0 border T:1px solid #ffffff (neutral-stroke-primary-invert, neutral-primary-invert, white-0); div 1.0x26.0 border L:1px solid #a7b4c9 (neutral-disabled-strong, grey-300); div 0.0x0.0 border L:1px solid #a7b4c9 (neutral-disabled-strong, grey-300); button.cds-116.cds-iconButton-small 32.0x32.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/topbar-item-default.png) |

Sub-measurements:

- bar: nav 1440×64 at (0, 0), "L", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- children: Coursera for Example Program, a 215×32 at (16, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800) ; img, img 55×24 at (176, 20.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), overflow-y clip ; Help menu, button 32×32 at (1294, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset ; Current language: English, button 32×32 at (1326, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset ; Chat with Coursera AI, button 32×32 at (1359, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset ; img, img 24×24 at (1363, 20.5), font 400 16px/0px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), overflow-y clip ; User dropdown menu for Learner, button 32×32 at (1392, 16.5), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset

### My Learning top bar

White sticky header with a 1px bottom rule: switcher, wordmark, Explore menu button, My Learning (current), Degrees, a pill search field with a round search button, then help, career goal link, language, bell and avatar.

Key `topbar-ml`. Read from `__m.q(".rc-GlobalPageHeaderContainer", 0)` on my-learning.

| Property | default |
| --- | --- |
| Size (w×h) | 1440×65 |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Painted layers | div.rc-GlobalPageHeaderContainer 1440.0x65.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0); nav 1440.0x65.0 border B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200); div.cds-9.cds-10 1376.0x64.0 border T:1px solid #ffffff (neutral-stroke-primary-invert, neutral-primary-invert, white-0); button.cds-113.cds-iconButton-small 32.0x32.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Transition | transform 0.2s ease-in-out |
| Crop | [png](../components/crops/signed-in/topbar-ml-default.png) |

Sub-measurements:

- bar: div 1440×65 at (0, 0), "Explore My Learning Degrees ​  Career go", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0)
- children: Switcher, button 32×32 at (48, 17), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 8px, shadow transparent 0px 0px 0px 1px inset ; Coursera, a 127×32 at (88, 17), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800) ; Explore our catalog, button 83.8×36 at (231, 15), font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), radius 8px, padding 8px ; nav-link-grid-item-my_learning, a 90.53×36 at (318.8, 15), font 600 14px/20px Source Sans Pro ls 0.14px, colour #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850), radius 8px, padding 8px ; nav-link-grid-item-degrees, a 62.95×36 at (417.3, 15), font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), radius 8px, padding 8px ; Search catalog, input 390.39×48 at (501.3, 9), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 12px 0px 12px 12px, overflow-y clip ; Search, button 36×36 at (935.7, 15), font 400 14px/20px Source Sans Pro, colour #ffffff (neutral-primary-invert, neutral-background-primary, white-0), bg #0056d2 (interactive-primary, feedback-informative, blue-800), radius 24px, shadow #0056d2 0px 0px 0px 1px inset ; Help menu, button 32×32 at (988.7, 17), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset ; Career goal: Software Develope, p 259.33×20 at (1028.7, 23), font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750) ; Career goal: Software Developer / Engineer, a 186.81×20 at (1101.2, 23), font 400 14px/20px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), decoration underline ; Select language: English, button 32×32 at (1296, 17), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset ; Notifications, button 32×32 at (1328, 17), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset ; User dropdown menu for Learner, button 32×32 at (1360, 17), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, shadow transparent 0px 0px 0px 1px inset

### Top bar: Explore

Ghost button with a 20px chevron end icon.

Key `topbar-ml-explore`. Read from `__m.q("[data-testid=megamenu-explore-button]", 0)` on my-learning.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 83.8×36 | = | = | = | = |
| Padding | 8px (spacing-100) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers |  | button.cds-113.cds-button-disableElevation 83.8x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | button.cds-113.cds-button-disableElevation 83.8x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | button.cds-113.cds-button-disableElevation 83.8x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-113.cds-button-disableElevation 87.7969pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-113.cds-button-disableElevation 83.8x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px |
| Font | Source Sans Pro 400 14px/20px (typography-body2, typography-body-secondary) | = | = | = | = |
| Colour | #48546e (neutral-primary-weak, grey-750) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) |
| Cursor | pointer | = | = | = | = |
| Icon | 20×20, fill none (no token), color #48546e (neutral-primary-weak, grey-750) | = | = | = | = |
| Crop | [png](../components/crops/signed-in/topbar-ml-explore-default.png) | [png](../components/crops/signed-in/topbar-ml-explore-hover.png) | [png](../components/crops/signed-in/topbar-ml-explore-focus-visible.png) | [png](../components/crops/signed-in/topbar-ml-explore-focus-visible-cds.png) | [png](../components/crops/signed-in/topbar-ml-explore-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-85fxzz+.cds-buttonBase-focusVisible, button.css-85fxzz+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (11, first 6; the rest are in the JSON):

- `.css-85fxzz:focus { outline: none; }`
- `.css-85fxzz.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-85fxzz.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-85fxzz:hover { text-decoration: underline; color: var(--cds-color-interactive-primary-hover); background-color: var( --cds-color-interactive-background-primary-hover-weak ); }`
- `.css-85fxzz.cds-button-focusVisible { text-decoration: underline; background-color: var( --cds-color-interactive-background-primary-hover-weak ); color: var(--cds-color-interactive-primary-hover); }`
- `.css-85fxzz:active { text-decoration: underline; color: var(--cds-color-interactive-primary-pressed); background-color: var( --cds-color-interactive-background-primary-pressed-weak ); }`

### Top bar: nav link (Degrees; My Learning is the current one)

Ghost buttons rendered as links. The current page (My Learning) is marked isCurrent and aria-current=page.

Key `topbar-ml-nav-link`. Read from `__m.q("[data-testid=nav-link-grid-item-degrees]", 0)` on my-learning.

| Property | default | hover | focus-visible | focus-visible-cds | pressed | current | current-default | current-hover |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 62.95×36 | = | = | = | = | 90.53×36 | 90.53×36 | 90.53×36 |
| Padding | 8px (spacing-100) | = | = | = | = | 8px (spacing-100) | 8px (spacing-100) | = |
| Radius | 8px (border-radius-100) | = | = | = | = | 8px (border-radius-100) | 8px (border-radius-100) | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | transparent (no token) | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = | none | none | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |  |  | = |
| Painted layers |  | a.cds-113.cds-button-disableElevation 63.0x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | a.cds-113.cds-button-disableElevation 63.0x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | a.cds-113.cds-button-disableElevation 63.0x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; a::after.cds-113.cds-button-disableElevation 66.9531pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | a.cds-113.cds-button-disableElevation 63.0x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px |  |  | a.cds-113.isCurrent 90.5x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px |
| Font | Source Sans Pro 400 14px/20px (typography-body2, typography-body-secondary) | = | = | = | = | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) |
| Colour | #48546e (neutral-primary-weak, grey-750) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) |
| Cursor | pointer | = | = | = | = | pointer | pointer | = |
| Crop | [png](../components/crops/signed-in/topbar-ml-nav-link-default.png) | [png](../components/crops/signed-in/topbar-ml-nav-link-hover.png) | [png](../components/crops/signed-in/topbar-ml-nav-link-focus-visible.png) | [png](../components/crops/signed-in/topbar-ml-nav-link-focus-visible-cds.png) | [png](../components/crops/signed-in/topbar-ml-nav-link-pressed.png) | [png](../components/crops/signed-in/topbar-ml-nav-link-current.png) | [png](../components/crops/signed-in/topbar-ml-nav-link-current-default.png) | [png](../components/crops/signed-in/topbar-ml-nav-link-current-hover.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-74qkcm+.cds-buttonBase-focusVisible, a.css-74qkcm+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground); current: at rest, captured current; current-default: at rest, captured current-default; current-hover: mouse hover.

Authored state rules that match this element (12, first 6; the rest are in the JSON):

- `.css-74qkcm:focus { outline: none; }`
- `.css-74qkcm.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-74qkcm.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-74qkcm:hover { text-decoration: underline; color: var(--cds-color-interactive-primary-hover); background-color: var( --cds-color-interactive-background-primary-hover-weak ); }`
- `.css-74qkcm.cds-button-focusVisible { text-decoration: underline; background-color: var( --cds-color-interactive-background-primary-hover-weak ); color: var(--cds-color-interactive-primary-hover); }`
- `.css-74qkcm:active { text-decoration: underline; color: var(--cds-color-interactive-primary-pressed); background-color: var( --cds-color-interactive-background-primary-pressed-weak ); }`

### Top bar: catalog search

Pill search field (cds-Search) 476x44, notched outline, with a round primary icon button at the right end.

Key `topbar-ml-search`. Read from `__m.q("#search-autocomplete-input", 0).parentElement` on my-learning.

| Property | default | hover | focus-visible |
| --- | --- | --- | --- |
| Size (w×h) | 476.39×44 | = | = |
| Border | 1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) | = | = |
| Radius | 24px (border-radius-300) | = | = |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = |
| Painted layers | div.cds-131.cds-116 476.4x44.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) \| R:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) \| B:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) \| L:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) r 24px; button.cds-113.cds-iconButton-small 36.0x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 24px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | div.cds-131.cds-116 476.4x44.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) border T:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) \| R:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) \| B:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) \| L:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) r 24px; button.cds-113.cds-iconButton-small 36.0x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 24px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | = |
| Font | Source Sans Pro 400 16px/19.0016px | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = |
| Cursor | text | = | = |
| Icon | 0×0, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = |
| Crop | [png](../components/crops/signed-in/topbar-ml-search-default.png) | [png](../components/crops/signed-in/topbar-ml-search-hover.png) | [png](../components/crops/signed-in/topbar-ml-search-focus-visible.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab.

Sub-measurements:

- input: input 390.39×48 at (501.3, 9), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 12px 0px 12px 12px, overflow-y clip
- outline: fieldset 474.39×47 at (501.3, 7), "​", font 400 16px/19.0016px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 8px, padding 0px 8px, overflow-y hidden
- placeholder: rgb(72, 84, 110)

Authored state rules that match this element (2, first 6; the rest are in the JSON):

- `.css-7uw4jt:focus { outline: none; }`
- `.css-7uw4jt:hover { background: var(--cds-color-interactive-background-primary-hover-weak); color: var(--cds-color-neutral-primary); }`

### Top bar: round search button

Primary small icon button, 36x36, 20px magnifier, fully round.

Key `topbar-ml-search-button`. Read from `__m.q("[data-testid=search-autocomplete] button[aria-label=Search]", 0)` on my-learning.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 36×36 | = | = | = | = |
| Radius | 24px (border-radius-300) | = | = | = | = |
| Background | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) | = | #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Box shadow | #0056d2 0px 0px 0px 1px inset | #0b408b 0px 0px 0px 1px inset | = | #0b408b 0px 0px 0px 1px inset | #3c0f8a 0px 0px 0px 1px inset |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | button.cds-113.cds-iconButton-small 36.0x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 24px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | button.cds-113.cds-iconButton-small 36.0x36.0 bg #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) r 24px shadow rgb(11, 64, 139) 0px 0px 0px 1px inset | = | button.cds-113.cds-iconButton-small 36.0x36.0 bg #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) r 24px shadow rgb(11, 64, 139) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-113.cds-iconButton-small 40pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-113.cds-iconButton-small 36.0x36.0 bg #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) r 24px shadow rgb(60, 15, 138) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 14px/20px (typography-body2, typography-body-secondary) | = | = | = | = |
| Colour | #ffffff (neutral-primary-invert, neutral-background-primary, white-0) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 20×20, fill none (no token), color #ffffff (neutral-primary-invert, neutral-background-primary, white-0) | = | = | = | = |
| Crop | [png](../components/crops/signed-in/topbar-ml-search-button-default.png) | [png](../components/crops/signed-in/topbar-ml-search-button-hover.png) | [png](../components/crops/signed-in/topbar-ml-search-button-focus-visible.png) | [png](../components/crops/signed-in/topbar-ml-search-button-focus-visible-cds.png) | [png](../components/crops/signed-in/topbar-ml-search-button-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-pneq06+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.css-pneq06:focus { outline: none; }`
- `.css-pneq06.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-pneq06.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-pneq06.cds-iconButton-primary:hover { --iconButton-background: var(--cds-color-interactive-primary-hover); --iconButton-boxShadowColor: var(--cds-color-interactive-primary-hover); }`
- `.css-pneq06.cds-iconButton-primary.cds-buttonBase-focusVisible { --iconButton-background: var(--cds-color-interactive-primary-hover); --iconButton-boxShadowColor: var(--cds-color-interactive-primary-hover); }`
- `.css-pneq06.cds-iconButton-primary:active { --iconButton-background: var(--cds-color-interactive-primary-pressed); --iconButton-boxShadowColor: var(--cds-color-interactive-primary-pressed); }`

### Top bar: career goal link

"Career goal:" label followed by an underlined link.

Key `topbar-ml-career-goal`. Read from `__m.q("[data-testid=career-goal-link]", 0)` on my-learning.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 186.81×20 | = | = | = | = |
| Radius | 0 | = | = | 4px (border-radius-50) | = |
| Background | transparent (no token) | = | = | = | = |
| Box shadow | none | = | = | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Painted layers |  | = | = | a.cds-179.cds-173 186.8x20.0 r 4px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px outline 1px solid rgba(0, 0, 0, 0) offset 2px | = |
| Font | Source Sans Pro 400 14px/20px (typography-body2, typography-body-secondary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) |
| Text decoration | underline auto offset auto | none | = | = | none |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/topbar-ml-career-goal-default.png) | [png](../components/crops/signed-in/topbar-ml-career-goal-hover.png) | [png](../components/crops/signed-in/topbar-ml-career-goal-focus-visible.png) | [png](../components/crops/signed-in/topbar-ml-career-goal-focus-visible-cds.png) | [png](../components/crops/signed-in/topbar-ml-career-goal-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-uwioxd+.cds-link-focusVisible; pressed: mouse button held down (released over the page ground).

Sub-measurements:

- label: p 259.33×20 at (1028.7, 23), "Career goal: Software Developer / Engine", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.cds-175:hover { text-decoration: underline; }`
- `.cds-175:hover { text-decoration: underline; }`
- `.css-uwioxd:hover { color: var(--cds-color-interactive-primary-hover); text-decoration: none; }`
- `.css-uwioxd.cds-link-focusVisible { color: var(--cds-color-interactive-primary-hover); }`
- `.css-uwioxd:focus { outline: none; }`
- `.css-uwioxd.cds-link-focusVisible { outline: transparent solid 1px; outline-offset: 2px; border-radius: var(--cds-border-radius-50); text-decoration: underline; box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-i`

## Course sidebar

### Course sidebar card

White card on the grey ground holding the partner row, the course title and the navigation.

Key `sidebar-card`. Read from `__m.paintUp(__m.q("[data-e2e=courseNavigation]", 0))` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 300×820 |
| Padding | 16px (spacing-200) |
| Radius | 16px (border-radius-200) |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Painted layers | div 300.0x820.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 16px; div.cds-Avatar-base.cds-Avatar-organization 38.0x38.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 5px; div.cds-144.cds-129 0.0x0.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px; button.cds-105.cds-iconButton-small 0.0x0.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/sidebar-card-default.png) |

Sub-measurements:

- moduleRows: 6 items, sizes 268.0x40.0 268.0x36.0 268.0x36.0 268.0x36.0, gaps dy 2 (pitch 42) dy 2 (pitch 38) dy 2 (pitch 38) dy 2 (pitch 38) dy 2 (pitch 38)
- navLinks: 6 items, sizes 268.0x272.0 268.0x40.0 268.0x40.0 268.0x40.0, gaps dy 2 (pitch 274) dy 2 (pitch 42) dy 2 (pitch 42) dy 2 (pitch 42) dy 2 (pitch 42)

### Sidebar: partner logo row

Organisation avatar (38px bordered square holding a 32px logo) and the partner name.

Key `sidebar-partner`. Read from `__m.q("[data-e2e=courseNavigation] .cds-Avatar-organization", 0).parentElement` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 252×38 |
| Gap | 8px (spacing-100) |
| Background | transparent (no token) |
| Painted layers | div.cds-Avatar-base.cds-Avatar-organization 38.0x38.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 5px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/sidebar-partner-default.png) |

Sub-measurements:

- avatar: div 38×38 at (40, 88), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 5px, padding 2px
- logo: img 32×32 at (43, 91), font 400 16px/24px Source Sans Pro, colour transparent (no token), radius 4px, overflow-y clip
- name: span 104.7×24 at (86, 95), "Duke University", font 400 16px/24px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

### Sidebar: course title

Course name, h2.

Key `sidebar-course-title`. Read from `__m.q("[data-e2e=courseNavigation] h2", 0)` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 252×48 |
| Background | transparent (no token) |
| Font | Source Sans Pro 600 20px/24px, -0.06px (typography-subtitle-large) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/sidebar-course-title-default.png) |

### Sidebar: "Course Material" collapsible heading

Full-width button with the label and a 20px chevron at the right; it opens and closes the module list.

Key `sidebar-course-material`. Read from `__m.q("[data-testid=week-collection-navigation-item] button", 0)` on course-module-1; `__m.q("[data-testid=week-collection-navigation-item] button", 0)` on course-grades.

| Property | default | hover | focus-visible | focus-visible-cds | pressed | collapsed |
| --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 268×40 | = | = | = | = | 268×40 |
| Padding | 8px (spacing-100) | = | = | = | = | 8px (spacing-100) |
| Gap | 8px (spacing-100) | = | = | = | = | 8px (spacing-100) |
| Radius | 8px (border-radius-100) | = | = | = | = | 8px (border-radius-100) |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | transparent (no token) |
| Pseudo element |  | = | = | ::after inset 0px 0px 0px 0px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 2px inset, radius 8px | = |  |
| Painted layers |  | button.cds-105 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | = | button::after.cds-105.cds-buttonBase-focusVisible 268pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 2px inset | button.cds-105 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px |  |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Cursor | pointer | = | = | = | = | pointer |
| Icon | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/sidebar-course-material-default.png) | [png](../components/crops/signed-in/sidebar-course-material-hover.png) | [png](../components/crops/signed-in/sidebar-course-material-focus-visible.png) | [png](../components/crops/signed-in/sidebar-course-material-focus-visible-cds.png) | [png](../components/crops/signed-in/sidebar-course-material-pressed.png) | [png](../components/crops/signed-in/sidebar-course-material-collapsed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-1ala1vj+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground); collapsed: at rest, captured collapsed.

Sub-measurements:

- label: span 224×24 at (40, 222), "Course Material", font 400 16px/24px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- chevron: svg 20×20 at (272, 224), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), fill none (no token), overflow-y hidden

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.css-1ala1vj:focus { outline: none; }`
- `.css-1ala1vj.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-1ala1vj.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `.css-1ala1vj:hover { background-color: var(--cds-color-blue-25); }`
- `.css-1ala1vj.cds-buttonBase-focusVisible { outline: none; }`
- `.css-1ala1vj.cds-buttonBase-focusVisible::after { inset: 0px; box-shadow: inset 0 0 0 2px var(--cds-color-interactive-stroke-primary-focus); }`

### Sidebar: module row

Module link with a 16px progress circle at the left. The current module gets a tinted background and a heavier, larger label.

Key `sidebar-module-row`. Read from `__m.q("[data-testid=rc-WeekNavigationItem] a", 1)` on course-module-1.

| Property | default | hover | focus-visible | focus-visible-cds | pressed | selected | selected-hover | selected-focus-visible | selected-focus-visible-cds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 268×36 | = | = | = | = | 268×40 | 268×40 | 268×40 | 268×40 |
| Padding | 8px (spacing-100) | = | = | = | = | 8px (spacing-100) | = | = | = |
| Gap | 8px (spacing-100) | = | = | = | = | 8px (spacing-100) | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = | 8px (border-radius-100) | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) |
| Outline | none | = | 2px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -3px | 2px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -3px | = | none | = | 2px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -3px | 2px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -3px |
| Painted layers | span 16.0x16.0 border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400) r 50% | a 268.0x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px; span 16.0x16.0 border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400) r 50% | a 268.0x36.0 r 8px outline 2px solid rgb(128, 78, 228) offset -3px; span 16.0x16.0 border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400) r 50% | a 268.0x36.0 r 8px outline 2px solid rgb(128, 78, 228) offset -3px; span 16.0x16.0 border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400) r 50% | a 268.0x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px; span 16.0x16.0 border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400) r 50% | a 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px; span 16.0x16.0 border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400) r 50% | a 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px; span 16.0x16.0 border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400) r 50% | a 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 2px solid rgb(128, 78, 228) offset -3px; span 16.0x16.0 border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400) r 50% | a 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 2px solid rgb(128, 78, 228) offset -3px; span 16.0x16.0 border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400) r 50% |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = |
| Cursor | pointer | = | = | = | = | pointer | = | = | = |
| Crop | [png](../components/crops/signed-in/sidebar-module-row-default.png) | [png](../components/crops/signed-in/sidebar-module-row-hover.png) | [png](../components/crops/signed-in/sidebar-module-row-focus-visible.png) | [png](../components/crops/signed-in/sidebar-module-row-focus-visible-cds.png) | [png](../components/crops/signed-in/sidebar-module-row-pressed.png) | [png](../components/crops/signed-in/sidebar-module-row-selected.png) | [png](../components/crops/signed-in/sidebar-module-row-selected-hover.png) | [png](../components/crops/signed-in/sidebar-module-row-selected-focus-visible.png) | [png](../components/crops/signed-in/sidebar-module-row-selected-focus-visible-cds.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; no CDS focusVisible rule names this element; pressed: mouse button held down (released over the page ground); selected: at rest, captured selected; selected-hover: mouse hover; selected-focus-visible: keyboard: focus(), Shift+Tab, Tab; selected-focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; no CDS focusVisible rule names this element.

Sub-measurements:

- circle: span 16×16 at (42, 308), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400), radius 50%
- circleWrap: span 20×20 at (40, 306), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- label: span 224×20 at (68, 306), "Module 2", font 400 14px/20px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

Sub-measurements, selected:

- circle: span 16×16 at (42, 268), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400), radius 50%
- circleWrap: span 20×20 at (40, 266), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- label: span 224×24 at (68, 264), "Module 1", font 600 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

Authored state rules that match this element (3, first 6; the rest are in the JSON):

- `.css-1ebbkpy:hover, .css-1ebbkpy:visited, .css-1ebbkpy:active, .css-1ebbkpy:focus { text-decoration: none; }`
- `.css-1ebbkpy:hover { background-color: var(--cds-color-blue-25); }`
- `.css-1ebbkpy:focus-visible { outline: 2px solid var(--cds-color-interactive-stroke-primary-focus); outline-offset: -3px; }`

### Sidebar: module progress circle (not started)

The 16px ring drawn inside a 20px box before each module name.

Key `sidebar-progress-circle`. Read from `__m.q("[data-testid=rc-WeekNavigationItem] a", 1).querySelector('span > span')` on course-module-1.

| Property | default | selected |
| --- | --- | --- |
| Size (w×h) | 16×16 | 16×16 |
| Border | 1px solid #8495b0 (neutral-stroke-primary, grey-400) | 1px solid #8495b0 (neutral-stroke-primary, grey-400) |
| Radius | 50% (border-radius-max) | 50% (border-radius-max) |
| Background | transparent (no token) | transparent (no token) |
| Painted layers | span 16.0x16.0 border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400) r 50% | span 16.0x16.0 border T:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| R:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| B:1px solid #8495b0 (neutral-stroke-primary, grey-400) \| L:1px solid #8495b0 (neutral-stroke-primary, grey-400) r 50% |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Cursor | pointer | pointer |
| Crop | [png](../components/crops/signed-in/sidebar-progress-circle-default.png) | [png](../components/crops/signed-in/sidebar-progress-circle-selected.png) |

How: selected: at rest, captured selected.

### Sidebar: secondary nav link (Grades, Notes, Discussion Forums, Messages, Course Info)

Plain full-width links under Course Material, 40px rows.

Key `sidebar-nav-link`. Read from `__m.q("[data-e2e=gradesNavigationItem] a", 0)` on course-module-1; `__m.q("[data-e2e=notesNavigationItem] a", 0)` on course-grades; `__m.q("[data-e2e=notesNavigationItem] a", 0)` on course-info.

| Property | default | hover | focus-visible | focus-visible-cds | pressed | selected-grades | selected-grades-hover | selected-grades-focus-visible | selected-grades-focus-visible-cds | selected-course-info |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 268×40 | = | = | = | = | 268×40 | = | = | = | 268×40 |
| Padding | 8px (spacing-100) | = | = | = | = | 8px (spacing-100) | = | = | = | 8px (spacing-100) |
| Gap | 8px (spacing-100) | = | = | = | = | 8px (spacing-100) | = | = | = | 8px (spacing-100) |
| Radius | 8px (border-radius-100) | = | = | = | = | 8px (border-radius-100) | = | = | = | 8px (border-radius-100) |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) |
| Outline | none | = | 2px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -3px | 2px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -3px | = | none | = | 2px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -3px | 2px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -3px | none |
| Painted layers |  | a 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | a 268.0x40.0 r 8px outline 2px solid rgb(128, 78, 228) offset -3px | a 268.0x40.0 r 8px outline 2px solid rgb(128, 78, 228) offset -3px | a 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | a 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | a 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | a 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 2px solid rgb(128, 78, 228) offset -3px | a 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 2px solid rgb(128, 78, 228) offset -3px | a 268.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Cursor | pointer | = | = | = | = | pointer | = | = | = | pointer |
| Crop | [png](../components/crops/signed-in/sidebar-nav-link-default.png) | [png](../components/crops/signed-in/sidebar-nav-link-hover.png) | [png](../components/crops/signed-in/sidebar-nav-link-focus-visible.png) | [png](../components/crops/signed-in/sidebar-nav-link-focus-visible-cds.png) | [png](../components/crops/signed-in/sidebar-nav-link-pressed.png) | [png](../components/crops/signed-in/sidebar-nav-link-selected-grades.png) | [png](../components/crops/signed-in/sidebar-nav-link-selected-grades-hover.png) | [png](../components/crops/signed-in/sidebar-nav-link-selected-grades-focus-visible.png) | [png](../components/crops/signed-in/sidebar-nav-link-selected-grades-focus-visible-cds.png) | [png](../components/crops/signed-in/sidebar-nav-link-selected-course-info.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; no CDS focusVisible rule names this element; pressed: mouse button held down (released over the page ground); selected-grades: at rest, captured selected-grades; selected-grades-hover: mouse hover; selected-grades-focus-visible: keyboard: focus(), Shift+Tab, Tab; selected-grades-focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; no CDS focusVisible rule names this element; selected-course-info: at rest, captured selected-course-info.

Authored state rules that match this element (3, first 6; the rest are in the JSON):

- `.css-1ebbkpy:hover, .css-1ebbkpy:visited, .css-1ebbkpy:active, .css-1ebbkpy:focus { text-decoration: none; }`
- `.css-1ebbkpy:hover { background-color: var(--cds-color-blue-25); }`
- `.css-1ebbkpy:focus-visible { outline: 2px solid var(--cds-color-interactive-stroke-primary-focus); outline-offset: -3px; }`

## Module page

### Module page: module title

Module name, h2 at the top of the main card.

Key `module-title`. Read from `__m.q("section.rc-ModuleSection h2", 0)` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 347.38×24 |
| Background | transparent (no token) |
| Font | Source Sans Pro 600 20px/24px, -0.06px (typography-subtitle-large) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/module-title-default.png) |

### Module page: meta row

"2h 8m of videos left • 5 min of readings left • 1 graded assessment left": each part is a 16px outline icon and a label; parts after the first are preceded by a bullet.

Key `module-meta-row`. Read from `__m.q("section.rc-ModuleSection h2", 0).parentElement.nextElementSibling` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 652×24 |
| Gap | 8px 12px (spacing-100) |
| Background | transparent (no token) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Icon | 16×16, fill none (no token), color #48546e (neutral-primary-weak, grey-750) |
| Crop | [png](../components/crops/signed-in/module-meta-row-default.png) |

Sub-measurements:

- parts: div 132.91×20 at (364, 130), font 400 16px/24px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), gap 4px [text: span 112.91×20 at (384, 130), "2h 8m of videos left", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)] [icon: svg 16×16 at (364, 132), font 400 16px/24px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), fill none (no token), overflow-y hidden] ; div 158.52×24 at (508.9, 128), font 400 16px/24px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), gap 4px [text: span 121.64×20 at (545.8, 130), "5 min of readings left", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)] [icon: svg 16×16 at (525.8, 132), font 400 16px/24px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), fill none (no token), overflow-y hidden] [before: "•" 4.875px×24px static inset auto auto auto auto bg transparent (no token) border 0px none rgb(72, 84, 110) left 0px none rgb(72, 84, 110) radius 0px] ; div 180.56×24 at (679.4, 128), font 400 16px/24px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), gap 4px [text: span 143.69×20 at (716.3, 130), "1 graded assessment left", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)] [icon: svg 16×16 at (696.3, 132), font 400 16px/24px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), fill none (no token), overflow-y hidden] [before: "•" 4.875px×24px static inset auto auto auto auto bg transparent (no token) border 0px none rgb(72, 84, 110) left 0px none rgb(72, 84, 110) radius 0px]

### Module page: description

Instructor note under the meta row.

Key `module-description`. Read from `__m.q("[data-testid=instructor-note-body]", 0)` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 652×120 |
| Background | transparent (no token) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/module-description-default.png) |

### Module page: "Show Learning Objectives" toggle

Ghost secondary button (cds-ShowMoreContainer) with a 16px chevron end icon.

Key `module-objectives-toggle`. Read from `__m.q(".rc-InstructorModuleNote .cds-ShowMoreContainer-ctaButton", 0)` on course-module-1; `__m.q(".rc-InstructorModuleNote .cds-ShowMoreContainer-ctaButton", 0)` on course-module-1-objectives.

| Property | default | hover | focus-visible | focus-visible-cds | pressed | expanded |
| --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 178.42×20 | = | = | = | = | 172.86×20 |
| Radius | 4px (border-radius-50) | = | = | = | = | 4px (border-radius-50) |
| Background | transparent (no token) | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) | = | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) | #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) | transparent (no token) |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = | none |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |  |
| Painted layers |  | button.cds-105.cds-ShowMoreContainer-ctaButton 178.4x20.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 4px | = | button.cds-105.cds-ShowMoreContainer-ctaButton 178.4x20.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 4px outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-105.cds-ShowMoreContainer-ctaButton 182.422pxx24px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-105.cds-ShowMoreContainer-ctaButton 178.4x20.0 bg #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) r 4px |  |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = | = | = | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | = | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | #1c2026 (interactive-secondary-pressed, interactive-secondary-selected, grey-950) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Text decoration | none | underline auto offset auto | = | underline auto offset auto | underline auto offset auto | none |
| Cursor | pointer | = | = | = | = | pointer |
| Icon | 16×16, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 16×16, fill none (no token), color #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | = | 16×16, fill none (no token), color #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | 16×16, fill none (no token), color #1c2026 (interactive-secondary-pressed, interactive-secondary-selected, grey-950) | 16×16, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/module-objectives-toggle-default.png) | [png](../components/crops/signed-in/module-objectives-toggle-hover.png) | [png](../components/crops/signed-in/module-objectives-toggle-focus-visible.png) | [png](../components/crops/signed-in/module-objectives-toggle-focus-visible-cds.png) | [png](../components/crops/signed-in/module-objectives-toggle-pressed.png) | [png](../components/crops/signed-in/module-objectives-toggle-expanded.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-310jm7+.cds-buttonBase-focusVisible, button.css-310jm7+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground); expanded: at rest, captured expanded.

Authored state rules that match this element (10, first 6; the rest are in the JSON):

- `.css-310jm7:focus { outline: none; }`
- `.css-310jm7.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-310jm7.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-310jm7:hover { text-decoration: underline; background-color: var( --cds-color-interactive-background-secondary-hover-weak ); color: var(--cds-color-interactive-secondary-hover); }`
- `.css-310jm7.cds-button-focusVisible { text-decoration: underline; background-color: var( --cds-color-interactive-background-secondary-hover-weak ); color: var(--cds-color-interactive-secondary-hover); }`
- `.css-310jm7:active { text-decoration: underline; color: var(--cds-color-interactive-secondary-pressed); background-color: var( --cds-color-interactive-background-secondary-pressed-weak ); }`

### Module page: lesson group header

Collapsible header for a lesson group: label and a 20px chevron, full width, 40px tall.

Key `lesson-header`. Read from `__m.q("[data-testid=rc-ItemGroupLesson] h2 button", 0)` on course-module-1.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 668×40 | = | = | = | = |
| Padding | 8px (spacing-100) | = | = | = | = |
| Gap | 8px (spacing-100) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) |
| Pseudo element |  | = | = | ::after inset 0px 0px 0px 0px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 2px inset, radius 8px | = |
| Painted layers |  | button.cds-105 668.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | = | button::after.cds-105.cds-buttonBase-focusVisible 668pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 2px inset | button.cds-105 668.0x40.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = |
| Crop | [png](../components/crops/signed-in/lesson-header-default.png) | [png](../components/crops/signed-in/lesson-header-hover.png) | [png](../components/crops/signed-in/lesson-header-focus-visible.png) | [png](../components/crops/signed-in/lesson-header-focus-visible-cds.png) | [png](../components/crops/signed-in/lesson-header-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-1ala1vj+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground).

Sub-measurements:

- label: span 624×24 at (364, 352), "Logistic Regression", font 400 16px/24px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- chevron: svg 20×20 at (996, 354), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), fill none (no token), overflow-y hidden
- h2: h2 668×40 at (356, 344), "Logistic Regression", font 400 16px/24px Source Sans Pro ls -0.08px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.css-1ala1vj:focus { outline: none; }`
- `.css-1ala1vj.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-1ala1vj.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `.css-1ala1vj:hover { background-color: var(--cds-color-blue-25); }`
- `.css-1ala1vj.cds-buttonBase-focusVisible { outline: none; }`
- `.css-1ala1vj.cds-buttonBase-focusVisible::after { inset: 0px; box-shadow: inset 0 0 0 2px var(--cds-color-interactive-stroke-primary-focus); }`

### Module page: divider between lesson groups

A presentational <li> holding an <hr>.

Key `lesson-divider`. Read from `__m.q("[data-testid=named-item-list-list] > li[role=presentation]", 0)` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 668×9 |
| Padding | 4px (spacing-50) / 8px (spacing-100) |
| Background | transparent (no token) |
| Painted layers | hr 652.0x1.0 bg #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/lesson-divider-default.png) |

Sub-measurements:

- hr: hr 652×1 at (364, 481), font 400 16px/24px Source Sans Pro, colour #808080 (no token), bg #c1cbdb (neutral-stroke-primary-weak, grey-200)

### Module page: item row

One learning item: a 20px status icon (green check when done, the item-type icon otherwise), title, and a meta line ("Video • 5 min"). The whole row is a link.

Key `item-row`. Read from `__m.q(".rc-WeekSingleItemDisplayRefresh a", 0)` on course-module-1; `__m.q(".rc-WeekSingleItemDisplayRefresh a", 0)` on course-module-2.

| Property | default | hover | focus-visible | focus-visible-cds | pressed | current | current-hover | current-focus-visible | current-focus-visible-cds | current-pressed | not-started |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 668×60 | = | = | = | = | 668×60 | = | = | = | = | 668×60 |
| Padding | 8px (spacing-100) | = | = | = | = | 8px (spacing-100) | = | = | = | = | 8px (spacing-100) |
| Gap | 8px (spacing-100) | = | = | = | = | 8px (spacing-100) | = | = | = | = | 8px (spacing-100) |
| Radius | 8px (border-radius-100) | = | = | = | = | 8px (border-radius-100) | = | = | = | = | 8px (border-radius-100) |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | transparent (no token) |
| Outline | none | = | 2px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -3px | 2px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -3px | = | none | = | 2px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -3px | 2px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -3px | = | none |
| Painted layers |  | a 668.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | a 668.0x60.0 r 8px outline 2px solid rgb(128, 78, 228) offset -3px | a 668.0x60.0 r 8px outline 2px solid rgb(128, 78, 228) offset -3px | a 668.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | a 668.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px; span.cds-105.cds-button-disableElevation 80.8x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | a 668.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px; span.cds-105.cds-button-disableElevation 80.8x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | a 668.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 2px solid rgb(128, 78, 228) offset -3px; span.cds-105.cds-button-disableElevation 80.8x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | a 668.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 2px solid rgb(128, 78, 228) offset -3px; span.cds-105.cds-button-disableElevation 80.8x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | a 668.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px; span.cds-105.cds-button-disableElevation 80.8x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset |  |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Cursor | pointer | = | = | = | = | pointer | = | = | = | = | pointer |
| Icon | 20×24, fill none (no token), color #197d12 (feedback-success, green-750) | = | = | = | = | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/item-row-default.png) | [png](../components/crops/signed-in/item-row-hover.png) | [png](../components/crops/signed-in/item-row-focus-visible.png) | [png](../components/crops/signed-in/item-row-focus-visible-cds.png) | [png](../components/crops/signed-in/item-row-pressed.png) | [png](../components/crops/signed-in/item-row-current.png) | [png](../components/crops/signed-in/item-row-current-hover.png) | [png](../components/crops/signed-in/item-row-current-focus-visible.png) | [png](../components/crops/signed-in/item-row-current-focus-visible-cds.png) | [png](../components/crops/signed-in/item-row-current-pressed.png) | [png](../components/crops/signed-in/item-row-not-started.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; no CDS focusVisible rule names this element; pressed: mouse button held down (released over the page ground); current: at rest, captured current; current-hover: mouse hover; current-focus-visible: keyboard: focus(), Shift+Tab, Tab; current-focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; no CDS focusVisible rule names this element; current-pressed: mouse button held down (released over the page ground); not-started: at rest, captured not-started.

Sub-measurements:

- rows: 11 items, sizes 668.0x60.0 668.0x60.0 668.0x60.0 668.0x60.0, gaps dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62)
- icon: svg 20×24 at (364, 404), font 400 16px/24px Source Sans Pro, colour #197d12 (feedback-success, green-750), fill none (no token), overflow-y hidden
- iconBox: span 20×20 at (364, 406), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- title: span 616×24 at (392, 394), "Course Information", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- meta: span 96.86×20 at (392, 418), "Reading • 10 min", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- li: li 668×60 at (356, 386), "Course Information Reading • 10 min", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

Sub-measurements, current:

- rows: 11 items, sizes 668.0x60.0 668.0x60.0 668.0x60.0 668.0x60.0, gaps dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62) dy 2 (pitch 62)
- icon: svg 20×20 at (364, 468.5), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), fill none (no token), overflow-y hidden
- iconBox: span 20×20 at (364, 472), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- title: span 535.19×24 at (392, 460), "Report a problem with the course", font 600 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- meta: span 89.89×20 at (392, 484), "Reading • 5 min", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- li: li 668×60 at (356, 452), "Report a problem with the course Reading", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

Authored state rules that match this element (3, first 6; the rest are in the JSON):

- `.css-1ebbkpy:hover, .css-1ebbkpy:visited, .css-1ebbkpy:active, .css-1ebbkpy:focus { text-decoration: none; }`
- `.css-1ebbkpy:hover { background-color: var(--cds-color-blue-25); }`
- `.css-1ebbkpy:focus-visible { outline: 2px solid var(--cds-color-interactive-stroke-primary-focus); outline-offset: -3px; }`

### Module page: "Resume" button on the current item

Primary button (a span with role=button inside the row link) at the right end of the current item.

Key `item-resume-button`. Read from `__m.q(".rc-WeekSingleItemDisplayRefresh a[aria-current=page] [role=button]", 0)` on course-module-1.

| Property | default | hover | pressed |
| --- | --- | --- | --- |
| Size (w×h) | 80.81×36 | = | = |
| Padding | 8px (spacing-100) / 16px (spacing-200) | = | = |
| Radius | 8px (border-radius-100) | = | = |
| Background | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Box shadow | #0056d2 0px 0px 0px 1px inset | = | = |
| Painted layers | span.cds-105.cds-button-disableElevation 80.8x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | span.cds-105.cds-button-disableElevation 80.8x36.0 bg #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | span.cds-105.cds-button-disableElevation 80.8x36.0 bg #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = |
| Colour | #ffffff (neutral-primary-invert, neutral-background-primary, white-0) | = | = |
| Cursor | pointer | = | = |
| Crop | [png](../components/crops/signed-in/item-resume-button-default.png) | [png](../components/crops/signed-in/item-resume-button-hover.png) | [png](../components/crops/signed-in/item-resume-button-pressed.png) |

How: hover: mouse hover; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (9, first 6; the rest are in the JSON):

- `.css-mmnv32:focus { outline: none; }`
- `.css-mmnv32.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-mmnv32.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-mmnv32:hover { border-color: var(--cds-color-interactive-primary-hover); background-color: var(--cds-color-interactive-primary-hover); }`
- `.css-mmnv32:active { border-color: var(--cds-color-interactive-primary-pressed); background-color: var(--cds-color-interactive-primary-pressed); }`
- `.css-mmnv32:active.cds-button-disableElevation::after { content: unset; }`

### Module page: item status icons

Completed check (filled green circle), and the outline type icons shown before an item is done.

Key `item-status-icon`. Read from `__m.q(".rc-WeekSingleItemDisplayRefresh a", 0).querySelector('svg')` on course-module-1; `__m.q(".rc-WeekSingleItemDisplayRefresh svg", 0)` on course-module-2.

| Property | completed | reading-current | video | practice | graded | lab |
| --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 20×24 | 20×20 | 20×20 | 20×20 | 20×20 | 20×20 |
| Background | transparent (no token) | transparent (no token) | transparent (no token) | transparent (no token) | transparent (no token) | transparent (no token) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #197d12 (feedback-success, green-750) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Cursor | pointer | pointer | pointer | pointer | pointer | pointer |
| Icon | 20×24, fill none (no token), color #197d12 (feedback-success, green-750) | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/item-status-icon-completed.png) | [png](../components/crops/signed-in/item-status-icon-reading-current.png) | [png](../components/crops/signed-in/item-status-icon-video.png) | [png](../components/crops/signed-in/item-status-icon-practice.png) | [png](../components/crops/signed-in/item-status-icon-graded.png) | [png](../components/crops/signed-in/item-status-icon-lab.png) |

How: completed: at rest, captured completed; reading-current: at rest, captured reading-current; video: at rest, captured video; practice: at rest, captured practice; graded: at rest, captured graded; lab: at rest, captured lab.

### Module page: due-date tag on a graded item

"Due, Sep 30, 11:59 PM +08" as a small status tag inline after the meta text.

Key `item-due-tag`. Read from `__m.q(".rc-WeekSingleItemDisplayRefresh [data-testid=tag-root]", 0)` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 146.86×18 |
| Padding | 0 / 6px (spacing-75) |
| Border | 1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) |
| Radius | 50px (border-radius-max) |
| Background | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | span.cds-tag-small.cds-tag-status 146.9x18.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| R:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| B:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| L:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) r 50px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #48546e (neutral-primary-weak, grey-750) |
| Cursor | pointer |
| Crop | [png](../components/crops/signed-in/item-due-tag-default.png) |

Sub-measurements:

- text: span 132.86×18 at (584.1, 578), "Due, Sep 30, 11:59 PM +08", font 600 12px/18px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- meta: span 181.11×20 at (392, 577), "Graded Assignment • Grade: -- •", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

### Module page: "1 graded assessment left" tag in a lesson header

Small status tag (cds-tag-small, secondary, default) before the chevron.

Key `lesson-header-tag`. Read from `__m.q("[data-testid=rc-ItemGroupLesson] h2 [data-testid=tag-root]", 0)` on course-module-2.

| Property | default |
| --- | --- |
| Size (w×h) | 140.8×18 |
| Padding | 0 / 6px (spacing-75) |
| Border | 1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) |
| Radius | 50px (border-radius-max) |
| Background | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | span.cds-tag-small.cds-tag-status 140.8x18.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| R:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| B:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| L:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) r 50px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #48546e (neutral-primary-weak, grey-750) |
| Cursor | pointer |
| Crop | [png](../components/crops/signed-in/lesson-header-tag-default.png) |

Sub-measurements:

- text: span 126.8×18 at (854.2, 567), "1 graded assessment left", font 600 12px/18px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

### Module page: learning objectives list (expanded)

Numbered list; the number and its period are separate spans in an 8px gutter.

Key `module-objectives-list`. Read from `__m.q(".cds-ShowMoreContainer-content ol", 0)` on course-module-1-objectives.

| Property | default |
| --- | --- |
| Size (w×h) | 652×48 |
| Background | transparent (no token) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/module-objectives-list-default.png) |

Sub-measurements:

- items: 2 items, sizes 652.0x24.0 652.0x24.0, gaps dy 0 (pitch 24)
- li: li 652×24 at (364, 320), "1. Explain why machine learning is excit", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), gap normal 8px
- number: span 11.94×24 at (364, 320), "1.", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- text: span 272.06×24 at (383.9, 320), "Explain why machine learning is exciting", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

## Right rail

### Right rail: weekly learning target card

White card: heading, a sentence, seven day circles, and an "Edit my weekly learning target" link button.

Key `rail-goal-card`. Read from `__m.paintUp(__m.q("[data-testid=unified-goal-card] section", 0))` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 360×198 |
| Radius | 16px (border-radius-200) |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Painted layers | div.unified-goal-card-content 360.0x198.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 16px; div 22.0x22.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 50%; div 22.0x22.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 50%; div 22.0x22.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 50% |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Transition | all 0.25s ease-in-out |
| Crop | [png](../components/crops/signed-in/rail-goal-card-default.png) |

Sub-measurements:

- heading: h2 312×20 at (1088, 88), "Weekly learning target", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- text: p 312×40 at (1088, 120), "I'm committed to learning 5 days a week ", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), padding 0px 8px 0px 0px, margin 12px 0px 0px
- days: 7 items, sizes 22.0x22.0 22.0x22.0 22.0x22.0 22.0x22.0, gaps dx 12 dx 12 dx 12 dx 12 dx 12 dx 12

### Right rail: day circle

22px ringed circle with the weekday initial. Today (Tuesday) is marked only in its hidden label.

Key `rail-day-circle`. Read from `__m.q("[data-testid=non-completed-mo]", 0)` on course-module-1.

| Property | default | today |
| --- | --- | --- |
| Size (w×h) | 22×22 | 22×22 |
| Border | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Radius | 50% (border-radius-max) | 50% (border-radius-max) |
| Background | transparent (no token) | transparent (no token) |
| Painted layers | div 22.0x22.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 50% | div 22.0x22.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 50% |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/rail-day-circle-default.png) | [png](../components/crops/signed-in/rail-day-circle-today.png) |

How: today: at rest, captured today.

Sub-measurements:

- letter: p 10.58×20 at (1093.7, 177), "M", font 600 14px/20px Source Sans Pro ls 0.14px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

Sub-measurements, today:

- letter: p 7.8×20 at (1129.1, 177), "T", font 600 14px/20px Source Sans Pro ls 0.14px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

### Right rail: "Edit my weekly learning target"

Link-styled button.

Key `rail-goal-edit`. Read from `__m.q("[data-testid=goal-card-edit-goal-cta]", 0)` on course-module-1.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 208.52×24 | = | = | = | = |
| Radius | 0 | = | = | 4px (border-radius-50) | = |
| Background | transparent (no token) | = | = | = | = |
| Box shadow | none | = | = | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Painted layers |  | = | = | button.cds-179.cds-173 208.5x24.0 r 4px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px outline 1px solid rgba(0, 0, 0, 0) offset 2px | = |
| Font | Source Sans Pro 600 16px/24px (typography-title3, typography-action-primary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) |
| Text decoration | none | underline auto offset auto | = | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/rail-goal-edit-default.png) | [png](../components/crops/signed-in/rail-goal-edit-hover.png) | [png](../components/crops/signed-in/rail-goal-edit-focus-visible.png) | [png](../components/crops/signed-in/rail-goal-edit-focus-visible-cds.png) | [png](../components/crops/signed-in/rail-goal-edit-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-70ox5i+.cds-link-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (5, first 6; the rest are in the JSON):

- `.cds-175:hover { text-decoration: underline; }`
- `.css-70ox5i:hover { color: var(--cds-color-interactive-primary-hover); text-decoration: underline; }`
- `.css-70ox5i.cds-link-focusVisible { color: var(--cds-color-interactive-primary-hover); }`
- `.css-70ox5i:focus { outline: none; }`
- `.css-70ox5i.cds-link-focusVisible { outline: transparent solid 1px; outline-offset: 2px; border-radius: var(--cds-border-radius-50); text-decoration: underline; box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-i`

### Right rail: course timeline card

Heading, a green "Right on schedule!" callout, then a timeline: start date, the next two deadlines (link, due tag, type), estimated end date, joined by a dashed vertical line between two 16px icons.

Key `rail-timeline-card`. Read from `__m.q("[data-testid=course-timeline-card]", 0)` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 360×440 |
| Padding | 24px (spacing-300) |
| Radius | 16px (border-radius-200) |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Painted layers | div 360.0x440.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 16px; section 312.0x128.0 bg #e0f4dc (feedback-background-success-weak, feedback-success-invert-weak, green-50) r 8px; div::after 1pxx190px; span.cds-tag-medium.cds-tag-status 179.7x38.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) border T:1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) \| R:1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) \| B:1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) \| L:1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) r 50px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/rail-timeline-card-default.png) |

Sub-measurements:

- heading: h2 107.42×20 at (1088, 288), "Course timeline", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 0px 0px 4px
- timeline: div 312×230 at (1088, 448), "Start date: February 25, 2024  Your next", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 8px 0px 0px, gap 0px 12px
- startIcon: svg 16×16 at (1088, 450), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), fill none (no token), overflow-y hidden
- line: div 16×190 at (1088, 468), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- lineBefore: none
- lineAfter: "" 1px×190px absolute inset 0px 7px 0px 8px bg transparent (no token) border 0px none rgb(13, 15, 18) left 0px none rgb(13, 15, 18) radius 0px bg-image repeating-linear-gradient(rgb(72, 84, 110), rgb(72, 84, 110) 6px, rgba(0, 0, 0, 0) 6px, rgba(0, 0, 0, 0) 12px)
- startText: p 284×20 at (1116, 448), "Start date: February 25, 2024", font 400 14px/20px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- nextLabel: p 284×20 at (1116, 476), "Your next two deadlines", font 400 14px/20px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- typeText: span 100.28×40 at (1299.7, 531), "Graded Assignment", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- deadlines: 2 items, sizes 284.0x86.0 284.0x68.0, gaps dy 0 (pitch 86)

### Right rail: "Right on schedule!" callout

Green tinted box with a bold heading and a muted sentence.

Key `rail-timeline-callout`. Read from `__m.q("[data-testid=course-timeline-card] section", 0)` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 312×128 |
| Padding | 16px (spacing-200) |
| Radius | 8px (border-radius-100) |
| Background | #e0f4dc (feedback-background-success-weak, feedback-success-invert-weak, green-50) |
| Painted layers | section 312.0x128.0 bg #e0f4dc (feedback-background-success-weak, feedback-success-invert-weak, green-50) r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/rail-timeline-callout-default.png) |

Sub-measurements:

- heading: p 280×20 at (1104, 344), "Right on schedule!", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 0px 0px 4px
- text: span 230.23×68 at (1104, 371), "You're making great progress! Keep this ", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

### Right rail: timeline dashed line

The 16px-wide column between the start and end icons that draws the dashed rule.

Key `rail-timeline-line`. Read from `__m.q("[data-testid=course-timeline-card] section + div", 0).children[1]` on course-module-1.

| Property | default |
| --- | --- |
| Size (w×h) | 16×190 |
| Background | transparent (no token) |
| Pseudo element | ::after inset 0px 7px 0px 8px |
| Painted layers | div::after 1pxx190px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/rail-timeline-line-default.png) |

### Right rail: deadline link

Underlined blue link to the graded item.

Key `rail-deadline-link`. Read from `__m.q("[data-testid=schedule-card-deadline-link]", 0)` on course-module-1.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 135.94×20 | = | = | = | = |
| Radius | 0 | = | = | 4px (border-radius-50) | = |
| Background | transparent (no token) | = | = | = | = |
| Box shadow | none | = | = | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Painted layers |  | = | = | a.cds-179.cds-173 135.9x20.0 r 4px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px outline 1px solid rgba(0, 0, 0, 0) offset 2px | = |
| Font | Source Sans Pro 400 14px/20px (typography-body2, typography-body-secondary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) |
| Text decoration | underline auto offset auto | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/rail-deadline-link-default.png) | [png](../components/crops/signed-in/rail-deadline-link-hover.png) | [png](../components/crops/signed-in/rail-deadline-link-focus-visible.png) | [png](../components/crops/signed-in/rail-deadline-link-focus-visible-cds.png) | [png](../components/crops/signed-in/rail-deadline-link-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-1tixbza+.cds-link-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (5, first 6; the rest are in the JSON):

- `.cds-175:hover { text-decoration: underline; }`
- `.css-1tixbza:hover { color: var(--cds-color-interactive-primary-hover); text-decoration: underline; }`
- `.css-1tixbza.cds-link-focusVisible { color: var(--cds-color-interactive-primary-hover); }`
- `.css-1tixbza:focus { outline: none; }`
- `.css-1tixbza.cds-link-focusVisible { outline: transparent solid 1px; outline-offset: 2px; border-radius: var(--cds-border-radius-50); text-decoration: underline; box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-`

### Right rail: due tag

Medium status tag, highlight1 (blue tint): "Due tomorrow by 11:59 PM +08" wraps to two lines in the rail; "Due in 3 days" fits on one.

Key `rail-due-tag`. Read from `__m.q("[data-testid=course-timeline-card] [data-testid=tag-root]", 1)` on course-module-1.

| Property | default | two-line |
| --- | --- | --- |
| Size (w×h) | 96.25×20 | 179.72×38 |
| Padding | 0 / 8px (spacing-100) | 0 / 8px (spacing-100) |
| Border | 1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) | 1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) |
| Radius | 50px (border-radius-max) | 50px (border-radius-max) |
| Background | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) |
| Painted layers | span.cds-tag-medium.cds-tag-status 96.3x20.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) border T:1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) \| R:1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) \| B:1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) \| L:1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) r 50px | span.cds-tag-medium.cds-tag-status 179.7x38.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) border T:1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) \| R:1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) \| B:1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) \| L:1px solid #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) r 50px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d2f60 (callouts-tertiary, emphasis-primary-content-default, blue-900) | #0d2f60 (callouts-tertiary, emphasis-primary-content-default, blue-900) |
| Crop | [png](../components/crops/signed-in/rail-due-tag-default.png) | [png](../components/crops/signed-in/rail-due-tag-two-line.png) |

How: two-line: at rest, captured two-line.

Sub-measurements:

- text: span 78.25×18 at (1125, 473), "Due in 3 days", font 600 14px/18px Source Sans Pro ls -0.042px, colour #0d2f60 (callouts-tertiary, emphasis-primary-content-default, blue-900)

Sub-measurements, two-line:

- text: span 161.72×36 at (1125, 464), "Due tomorrow by 11:59 PM +08", font 600 14px/18px Source Sans Pro ls -0.042px, colour #0d2f60 (callouts-tertiary, emphasis-primary-content-default, blue-900)

## Grades

### Grades: page title

h1 "Grades".

Key `grades-title`. Read from `__m.q("[data-testid=assignments-page] h1", 0)` on course-grades.

| Property | default |
| --- | --- |
| Size (w×h) | 1028×36 |
| Background | transparent (no token) |
| Font | Source Sans Pro 600 28px/36px, -0.1px (typography-title1) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/grades-title-default.png) |

### Grades: table

Rounded bordered table (div role=table): a grey header row, then one 68px row per graded item. Columns: Item, Status, Due, Weight, Grade.

Key `grades-table`. Read from `__m.q("[role=table]", 0)` on course-grades.

| Property | default |
| --- | --- |
| Size (w×h) | 966×324 |
| Background | transparent (no token) |
| Painted layers | div 966.0x48.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div 966.0x69.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200); div 966.0x69.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200); div 966.0x69.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/grades-table-default.png) |

Sub-measurements:

- wrapper: div 968×326 at (394, 140), "Assignments table Item Status Due Weight", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 16px, overflow-y auto
- columns: [object Object], div 506×48 at (395, 141), font 600 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 12px 16px ; [object Object], div 140×48 at (901, 141), font 600 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 12px 16px ; [object Object], div 120×48 at (1041, 141), font 600 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 12px 16px ; [object Object], div 100×48 at (1161, 141), font 600 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 12px 16px ; [object Object], div 100×48 at (1261, 141), font 600 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 12px 16px
- rows: 4 items, sizes 966.0x69.0 966.0x69.0 966.0x69.0 966.0x69.0, gaps dy 0 (pitch 69) dy 0 (pitch 69) dy 0 (pitch 69)

### Grades: header row

Grey band with the column labels.

Key `grades-header-row`. Read from `__m.q("[role=table] [role=row]", 0)` on course-grades.

| Property | default |
| --- | --- |
| Size (w×h) | 966×48 |
| Background | transparent (no token) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/grades-header-row-default.png) |

Sub-measurements:

- cell: div 506×48 at (395, 141), "Item", font 600 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 12px 16px
- label: span 31.45×22 at (411, 154), "Item", font 600 16px/20px Source Sans Pro ls -0.048px, colour #48546e (neutral-primary-weak, grey-750)
- weight: div 100×48 at (1161, 141), "Weight", font 600 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 12px 16px

### Grades: row

One graded item: title link and type on the left, then status, due date (date over time), weight and grade.

Key `grades-row`. Read from `__m.q("[data-testid=ungrouped-non-peer-assignment-row]", 0)` on course-grades.

| Property | default | hover |
| --- | --- | --- |
| Size (w×h) | 966×69 | = |
| Border | T: 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) | = |
| Background | transparent (no token) | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | div 966.0x69.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) | div 966.0x69.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = |
| Crop | [png](../components/crops/signed-in/grades-row-default.png) | [png](../components/crops/signed-in/grades-row-hover.png) |

How: hover: mouse hover.

Sub-measurements:

- rowheader: div 506×68 at (395, 190), "Week 1 Comprehensive Graded Assignment", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 12px 16px
- type: span 155.36×20 at (411, 226), "Graded Assignment", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- status: div 9.95×24 at (917, 212), "--", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- due: span 75.91×24 at (1057, 202), "Sep 30", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- dueTime: span 75.91×20 at (1057, 226), "11:59 PM +08", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- weight: span 29.11×24 at (1215.9, 212), "25%", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- grade: span 9.95×24 at (1335, 212), "--", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

Authored state rules that match this element (1, first 6; the rest are in the JSON):

- `.css-1qd65r:hover { background-color: var(--cds-color-neutral-background-primary-weak); }`

### Grades: item title link

Link styled as plain text (cds Link, no underline at rest).

Key `grades-item-link`. Read from `__m.q("[data-testid=item-title-text] a", 0)` on course-grades.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 155.36×22 | = | = | = | = |
| Radius | 0 | = | = | 4px (border-radius-50) | = |
| Background | transparent (no token) | = | = | = | = |
| Box shadow | none | = | = | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Painted layers |  | = | = | a.cds-173.cds-203 155.4x22.0 r 4px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px outline 1px solid rgba(0, 0, 0, 0) offset 2px | = |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | = | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) |
| Text decoration | none | underline auto offset auto | underline auto offset auto | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/grades-item-link-default.png) | [png](../components/crops/signed-in/grades-item-link-hover.png) | [png](../components/crops/signed-in/grades-item-link-focus-visible.png) | [png](../components/crops/signed-in/grades-item-link-focus-visible-cds.png) | [png](../components/crops/signed-in/grades-item-link-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-t7yg2z+.cds-link-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (5, first 6; the rest are in the JSON):

- `.cds-205:hover { text-decoration: underline; }`
- `.css-t7yg2z:hover { color: var(--cds-color-interactive-secondary-hover); text-decoration: underline; }`
- `.css-t7yg2z.cds-link-focusVisible { color: var(--cds-color-interactive-secondary-hover); }`
- `.css-t7yg2z:focus { outline: none; }`
- `.css-t7yg2z.cds-link-focusVisible { outline: transparent solid 1px; outline-offset: 2px; border-radius: var(--cds-border-radius-50); text-decoration: underline; box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-i`

## Course info

### Course info: title and byline

Course name (h1) and "by Duke University".

Key `info-title`. Read from `__m.q("section.rc-CourseInfoPage2016 h1", 0)` on course-info.

| Property | default |
| --- | --- |
| Size (w×h) | 339.22×28 |
| Background | transparent (no token) |
| Font | Source Sans Pro 600 24px/28px, -0.12px (typography-title-x-small) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/info-title-default.png) |

Sub-measurements:

- byline: p 124.17×24 at (364, 120), "by Duke University", font 400 16px/24px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

### Course info: About this Course

h2, a paragraph clamped to three lines, and a "Show more" ghost button.

Key `info-about`. Read from `__m.q(".rc-AboutBox", 0)` on course-info.

| Property | default |
| --- | --- |
| Size (w×h) | 968×160 |
| Background | transparent (no token) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/info-about-default.png) |

Sub-measurements:

- heading: span 150.69×28 at (394, 158), "About this Course", font 600 20px/24px Source Sans Pro ls -0.06px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- text: p 968×72 at (394, 192), "This course provides a foundational unde", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 8px 0px, overflow-y hidden
- clamp: 3

### Course info: "Show more" button

Ghost button, 48px tall, blue label.

Key `info-show-more`. Read from `__m.q(".rc-AboutBox button", 0)` on course-info.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 111.14×48 | = | = | = | = |
| Padding | 12px (spacing-150) / 16px (spacing-200) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers |  | button.cds-105.cds-button-disableElevation 111.1x48.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | = | button.cds-105.cds-button-disableElevation 111.1x48.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-105.cds-button-disableElevation 115.141pxx52px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-105.cds-button-disableElevation 111.1x48.0 bg #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) r 8px |
| Font | Source Sans Pro 600 16px/24px, 0.16px (typography-title3, typography-action-primary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Text decoration | none | underline auto offset auto | = | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/info-show-more-default.png) | [png](../components/crops/signed-in/info-show-more-hover.png) | [png](../components/crops/signed-in/info-show-more-focus-visible.png) | [png](../components/crops/signed-in/info-show-more-focus-visible-cds.png) | [png](../components/crops/signed-in/info-show-more-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-1c9bx41+.cds-buttonBase-focusVisible, button.css-1c9bx41+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (10, first 6; the rest are in the JSON):

- `.css-1c9bx41:focus { outline: none; }`
- `.css-1c9bx41.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-1c9bx41.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `@media (hover: hover) .css-1c9bx41:hover { text-decoration: underline; color: var(--cds-color-interactive-primary-hover); background-color: var( --cds-color-interactive-background-primary-hover-weak ); }`
- `.css-1c9bx41.cds-button-focusVisible { text-decoration: underline; background-color: var( --cds-color-interactive-background-primary-hover-weak ); color: var(--cds-color-interactive-primary-hover); }`
- `.css-1c9bx41:active { text-decoration: underline; color: var(--cds-color-interactive-primary-pressed); background-color: var( --cds-color-interactive-background-primary-pressed-weak ); }`

### Course info: instructor row

32px round photo, name link over a muted title line.

Key `info-instructor`. Read from `__m.q(".rc-InstructorInfo", 0)` on course-info.

| Property | default |
| --- | --- |
| Size (w×h) | 968×44 |
| Gap | 16px (spacing-200) |
| Background | transparent (no token) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/info-instructor-default.png) |

Sub-measurements:

- rows: 4 items, sizes 968.0x44.0 968.0x44.0 968.0x44.0 968.0x44.0, gaps dy 8 (pitch 52) dy 8 (pitch 52) dy 8 (pitch 52)
- label: p 968×32 at (394, 376), "Taught by:", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 0px 0px 8px
- avatar: div 32×32 at (394, 414), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 50%, overflow-y hidden
- name: span 105.36×22 at (442, 409), "Lawrence Carin", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- title: p 351.73×20 at (442, 432), "Provost of King Abdullah University, Sci", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

### Course info: instructor name link

Bold link styled as text.

Key `info-instructor-link`. Read from `__m.q(".rc-InstructorInfo a", 0)` on course-info.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 351.73×24 | = | = | = | = |
| Radius | 0 | = | = | 4px (border-radius-50) | = |
| Background | transparent (no token) | = | = | = | = |
| Box shadow | none | = | = | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Painted layers |  | = | = | a.cds-173.cds-203 351.7x24.0 r 4px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px outline 1px solid rgba(0, 0, 0, 0) offset 2px | = |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) |
| Text decoration | none | underline auto offset auto | underline auto offset auto | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/info-instructor-link-default.png) | [png](../components/crops/signed-in/info-instructor-link-hover.png) | [png](../components/crops/signed-in/info-instructor-link-focus-visible.png) | [png](../components/crops/signed-in/info-instructor-link-focus-visible-cds.png) | [png](../components/crops/signed-in/info-instructor-link-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-15wx6v4+.cds-link-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (5, first 6; the rest are in the JSON):

- `.cds-205:hover { text-decoration: underline; }`
- `.css-15wx6v4:hover { color: var(--cds-color-interactive-primary-hover); text-decoration: underline; }`
- `.css-15wx6v4.cds-link-focusVisible { color: var(--cds-color-interactive-primary-hover); }`
- `.css-15wx6v4:focus { outline: none; }`
- `.css-15wx6v4.cds-link-focusVisible { outline: transparent solid 1px; outline-offset: 2px; border-radius: var(--cds-border-radius-50); text-decoration: underline; box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-`

### Course info: details box

Rounded bordered box of label/value rows (Level, Commitment, Language, How To Pass, User Ratings) split by 1px rules; each label has a 20px icon.

Key `info-details`. Read from `__m.q("#basic-info-row-label-level", 0).parentElement.parentElement` on course-info.

| Property | default |
| --- | --- |
| Size (w×h) | 968×326 |
| Padding | 16px (spacing-200) |
| Border | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Radius | 16px (border-radius-200) |
| Background | transparent (no token) |
| Painted layers | div 968.0x326.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 16px; hr 934.0x1.0 bg #c1cbdb (neutral-stroke-primary-weak, grey-200); hr 934.0x1.0 bg #c1cbdb (neutral-stroke-primary-weak, grey-200); hr 934.0x1.0 bg #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/info-details-default.png) |

Sub-measurements:

- rows: 5 items, sizes 934.0x24.0 934.0x24.0 934.0x96.0 934.0x24.0, gaps dy 25 (pitch 49) dy 25 (pitch 49) dy 25 (pitch 121) dy 25 (pitch 49)
- row: div 934×24 at (411, 304), "Level Intermediate", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), gap 16px
- label: div 140×24 at (411, 304), "Level", font 600 16px/24px Source Sans Pro ls 0.16px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), gap 8px
- icon: svg 20×20 at (411, 306), font 600 16px/24px Source Sans Pro ls 0.16px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), fill none (no token), overflow-y hidden
- value: div 778×24 at (567, 304), "Intermediate", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- rule: hr 934×1 at (411, 340), font 400 16px/24px Source Sans Pro, colour #808080 (no token), bg #c1cbdb (neutral-stroke-primary-weak, grey-200), margin 12px 0px
- rating: div 43.91×24 at (567, 572), "4.7 Rating, 4.7 out of 5 stars", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), gap 4px
- star: svg 20×20 at (567, 574), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), fill none (no token), overflow-y hidden

### Course info: syllabus module card

Bordered card with a grey header strip ("Module 1"), then the module title, description, a "23 videos, 3 readings" disclosure and the graded item.

Key `info-syllabus-module`. Read from `__m.q("[data-testid=rc-WeekView]", 0).firstElementChild` on course-info.

| Property | default |
| --- | --- |
| Size (w×h) | 968×270 |
| Border | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Radius | 16px (border-radius-200) |
| Background | transparent (no token) |
| Painted layers | div 968.0x270.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 16px; div 966.0x44.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/info-syllabus-module-default.png) |

Sub-measurements:

- heading: h2 968×24 at (394, 267), "Syllabus", font 600 20px/24px Source Sans Pro ls -0.06px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- header: div 966×44 at (395, 316), "Module 1", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25), padding 12px 16px
- headerText: span 62.09×22 at (411, 327), "Module 1", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- title: h4 934×20 at (411, 376), "Simple Introduction to Machine Learning", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 0px 0px 8px
- text: p 934×96 at (411, 404), "The focus of this module is to introduce", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- disclosure: button 147.94×20 at (411, 516), "23 videos, 3 readings", font 600 14px/20px Source Sans Pro ls 0.14px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 4px, margin 0px 0px 8px
- graded: div 934×20 at (411, 548), "Graded: Week 1 Comprehensive", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), gap 4px

### Course info: "View the course in catalog"

Secondary (outlined) button, 48px tall.

Key `info-catalog-button`. Read from `__m.q("a.cds-button-secondary", 0)` on course-info.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 229.69×48 | = | = | = | = |
| Padding | 12px (spacing-150) / 24px (spacing-300) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) |
| Box shadow | #0056d2 0px 0px 0px 1px inset | #0b408b 0px 0px 0px 1px inset | = | #0b408b 0px 0px 0px 1px inset | #3c0f8a 0px 0px 0px 1px inset |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | a.cds-105.cds-button-disableElevation 229.7x48.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | a.cds-105.cds-button-disableElevation 229.7x48.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgb(11, 64, 139) 0px 0px 0px 1px inset | = | a.cds-105.cds-button-disableElevation 229.7x48.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgb(11, 64, 139) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; a::after.cds-105.cds-button-disableElevation 233.688pxx52px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | a.cds-105.cds-button-disableElevation 229.7x48.0 bg #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) r 8px shadow rgb(60, 15, 138) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 600 16px/24px, 0.16px (typography-title3, typography-action-primary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Text decoration | none | underline auto offset auto | underline auto offset auto | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/info-catalog-button-default.png) | [png](../components/crops/signed-in/info-catalog-button-hover.png) | [png](../components/crops/signed-in/info-catalog-button-focus-visible.png) | [png](../components/crops/signed-in/info-catalog-button-focus-visible-cds.png) | [png](../components/crops/signed-in/info-catalog-button-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-ly2oq7+.cds-buttonBase-focusVisible, a.css-ly2oq7+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (10, first 6; the rest are in the JSON):

- `.css-ly2oq7:focus { outline: none; }`
- `.css-ly2oq7.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-ly2oq7.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-ly2oq7:hover { color: var(--cds-color-interactive-primary-hover); box-shadow: inset 0 0 0 1px var(--cds-color-interactive-primary-hover); background-color: var( --cds-color-interactive-background-primary-hover-weak ); }`
- `.css-ly2oq7.cds-button-focusVisible { box-shadow: inset 0 0 0 1px var(--cds-color-interactive-primary-hover); background-color: var( --cds-color-interactive-background-primary-hover-weak ); color: var(--cds-color-interactive-primary-hover); }`
- `.css-ly2oq7:active { color: var(--cds-color-interactive-primary-pressed); box-shadow: inset 0 0 0 1px var(--cds-color-interactive-primary-pressed); background-color: var( --cds-color-interactive-background-primary-pressed-weak ); }`

## Item outline panel

### Item outline panel

Left card on item pages: course title with a close (collapse) button, the "Today's goal" accordion, then one accordion per module listing lesson headings and item rows.

Key `outline-panel`. Read from `__m.paintUp(__m.q("[data-testid=left-nav] > div", 0))` on item-video.

| Property | default |
| --- | --- |
| Size (w×h) | 360×819 |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Painted layers | div 360.0x819.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0); div 360.0x69.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border B:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50); button.cds-116.cds-iconButton-small 36.0x36.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset; div 360.0x139.0 border B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Transition | transform 0.225s cubic-bezier(0.2, opacity 0.225s 0, visibility 0s 0 |
| Crop | [png](../components/crops/signed-in/outline-panel-default.png) |

Sub-measurements:

- header: div 360×69 at (16, 65), "Introduction to Machine Learning", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), border B:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50), padding 18px 12px 14px 16px
- headerRule: div 332×36 at (32, 83), "Introduction to Machine Learning", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- items: 111 items, sizes 360.0x60.0 360.0x60.0 360.0x56.0 360.0x56.0, gaps dy 0 (pitch 60) dy 0 (pitch 60) dy 0 (pitch 56) dy 0 (pitch 56) dy 0 (pitch 56) dy 0 (pitch 56) dy 0 (pitch 56) dy 0 (pitch 56) dy 0 (pitch 56)

### Outline: course title link

Course name at the top of the outline, a link back to the course home.

Key `outline-course-link`. Read from `__m.q("[data-testid=left-nav] a", 0)` on item-video.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 283.97×28 | = | 295.97×32 | 295.97×32 | = |
| Padding | 0 | = | 2px (spacing-25) / 6px (spacing-75) | 2px (spacing-25) / 6px (spacing-75) | = |
| Radius | 0 | = | 8px (border-radius-100) | 8px (border-radius-100) | = |
| Background | transparent (no token) | = | = | = | = |
| Outline | none | = | 1px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -2px | 1px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -2px | = |
| Painted layers |  | = | a.cds-150.cds-144 296.0x32.0 r 8px outline 1px solid rgb(128, 78, 228) offset -2px | a.cds-150.cds-144 296.0x32.0 r 8px outline 1px solid rgb(128, 78, 228) offset -2px | = |
| Font | Source Sans Pro 600 20px/24px, -0.06px (typography-subtitle-large) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = |
| Text decoration | none | underline auto offset auto | = | = | = |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/outline-course-link-default.png) | [png](../components/crops/signed-in/outline-course-link-hover.png) | [png](../components/crops/signed-in/outline-course-link-focus-visible.png) | [png](../components/crops/signed-in/outline-course-link-focus-visible-cds.png) | [png](../components/crops/signed-in/outline-course-link-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-1tnsfv8+.cds-link-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (7, first 6; the rest are in the JSON):

- `.cds-146:hover { text-decoration: underline; }`
- `.css-1tnsfv8:hover { color: var(--cds-color-interactive-primary-hover); text-decoration: underline; }`
- `.css-1tnsfv8.cds-link-focusVisible { color: var(--cds-color-interactive-primary-hover); }`
- `.css-1tnsfv8:focus { outline: none; }`
- `.css-1tnsfv8.cds-link-focusVisible { outline: transparent solid 1px; outline-offset: 2px; border-radius: var(--cds-border-radius-50); text-decoration: underline; box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-`
- `.css-1tnsfv8.css-1tnsfv8.css-1tnsfv8:focus { text-decoration: none; }`

### Outline: collapse button (X)

Ghost small icon button, 36x36 with a 20px icon.

Key `outline-close`. Read from `__m.q("[aria-label=\"Collapse course outline\"]", 0)` on item-video.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 36×36 | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) |
| Box shadow | transparent 0px 0px 0px 1px inset | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | button.cds-116.cds-iconButton-small 36.0x36.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | button.cds-116.cds-iconButton-small 36.0x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | = | button.cds-116.cds-iconButton-small 36.0x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-iconButton-small 40pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-116.cds-iconButton-small 36.0x36.0 bg #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = |
| Crop | [png](../components/crops/signed-in/outline-close-default.png) | [png](../components/crops/signed-in/outline-close-hover.png) | [png](../components/crops/signed-in/outline-close-focus-visible.png) | [png](../components/crops/signed-in/outline-close-focus-visible-cds.png) | [png](../components/crops/signed-in/outline-close-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-8pivq4+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.css-8pivq4:focus { outline: none; }`
- `.css-8pivq4.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-8pivq4.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-8pivq4.cds-iconButton-ghost:hover { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-8pivq4.cds-iconButton-ghost.cds-buttonBase-focusVisible { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-8pivq4.cds-iconButton-ghost:active { --iconButton-background: var( --cds-color-interactive-background-primary-pressed-weak ); --iconButton-color: var(--cds-color-interactive-primary-pressed); }`

### Outline: "Today's goal" accordion

Standard CDS accordion with a 1px border: header "Today's goal • 0/3 items" plus a flag illustration and chevron; body "Complete 3 items today to stay at a good pace!".

Key `outline-goal-card`. Read from `__m.q(".cds-AccordionRoot-standard", 0)` on item-video.

| Property | default |
| --- | --- |
| Size (w×h) | 328×102 |
| Border | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Radius | 8px (border-radius-100) |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Painted layers | div.cds-AccordionRoot-container.cds-AccordionRoot-standard 328.0x102.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 8px; h3 326.0x48.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px 8px 0px 0px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Icon | 24×24, fill #48546e (neutral-primary-weak, grey-750), color #48546e (neutral-primary-weak, grey-750) |
| Crop | [png](../components/crops/signed-in/outline-goal-card-default.png) |

Sub-measurements:

- header: button 326×56 at (35, 149), "Today's goal • 0/3 items", font 600 30px/36px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 8px, padding 16px
- label: span 158.77×20 at (51, 168), "Today's goal • 0/3 items", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), overflow-y hidden
- illustration: svg 63×62 at (248, 161), font 600 30px/36px Source Sans Pro ls -0.15px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), fill none (no token), overflow-y hidden
- chevron: svg 24×24 at (321, 165), font 600 30px/36px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), margin 0px 0px 0px 12px, fill #48546e (neutral-primary-weak, grey-750), overflow-y hidden
- body: div 294×36 at (51, 201), "Complete 3 items today to stay at a good", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 16px 0px 0px
- bodyText: p 294×20 at (51, 217), "Complete 3 items today to stay at a good", font 400 14px/20px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- focusContainer: div 332×106 at (32, 150), "Today's goal • 0/3 items  Complete 3 ite", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 2px

### Outline: "Today's goal" accordion header

The accordion header button.

Key `outline-goal-header`. Read from `__m.q("[data-testid=daily-goals-tracker-header] button", 0)` on item-video.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 326×56 | = | = | = | = |
| Padding | 16px (spacing-200) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers |  | = | = | button.cds-116.cds-AccordionHeader-button 326.0x56.0 r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-AccordionHeader-button 330pxx60px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | = |
| Font | Source Sans Pro 600 30px/36px (typography-title-small) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 24×24, fill #48546e (neutral-primary-weak, grey-750), color #48546e (neutral-primary-weak, grey-750) | 24×24, fill #0d0f12 (neutral-primary, interactive-secondary, grey-975), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | 24×24, fill #0d0f12 (neutral-primary, interactive-secondary, grey-975), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/outline-goal-header-default.png) | [png](../components/crops/signed-in/outline-goal-header-hover.png) | [png](../components/crops/signed-in/outline-goal-header-focus-visible.png) | [png](../components/crops/signed-in/outline-goal-header-focus-visible-cds.png) | [png](../components/crops/signed-in/outline-goal-header-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-5ljz9g+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (3, first 6; the rest are in the JSON):

- `.css-5ljz9g:focus { outline: none; }`
- `.css-5ljz9g.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-5ljz9g.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`

### Outline: module accordion header

Silent CDS accordion header: "Module 1" small label over the module title, 24px chevron.

Key `outline-module-header`. Read from `__m.q(".cds-AccordionRoot-silent h3 button", 0)` on item-video.

| Property | default | hover | focus-visible | focus-visible-cds | pressed | collapsed |
| --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 360×76 | = | = | = | = | 360×76 |
| Padding | 16px (spacing-200) | = | = | = | = | 16px (spacing-200) |
| Background | transparent (no token) | = | = | = | = | transparent (no token) |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = | none |
| Pseudo element | ::before inset 2px 2px 2px 2px, radius 8px | ::before inset 2px 2px 2px 2px, bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25), radius 8px | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | ::before inset 2px 2px 2px 2px, bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25), radius 8px | ::before inset 2px 2px 2px 2px, radius 8px |
| Painted layers |  | button::before.cds-116.cds-AccordionHeader-button 356pxx72px bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | = | button.cds-116.cds-AccordionHeader-button 360.0x76.0 outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-AccordionHeader-button 364pxx80px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button::before.cds-116.cds-AccordionHeader-button 356pxx72px bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px |  |
| Font | Source Sans Pro 600 30px/36px (typography-title-small) | = | = | = | = | Source Sans Pro 600 30px/36px (typography-title-small) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Cursor | pointer | = | = | = | = | pointer |
| Icon | 24×24, fill #48546e (neutral-primary-weak, grey-750), color #48546e (neutral-primary-weak, grey-750) | 24×24, fill #0d0f12 (neutral-primary, interactive-secondary, grey-975), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | 24×24, fill #0d0f12 (neutral-primary, interactive-secondary, grey-975), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 24×24, fill #48546e (neutral-primary-weak, grey-750), color #48546e (neutral-primary-weak, grey-750) |
| Crop | [png](../components/crops/signed-in/outline-module-header-default.png) | [png](../components/crops/signed-in/outline-module-header-hover.png) | [png](../components/crops/signed-in/outline-module-header-focus-visible.png) | [png](../components/crops/signed-in/outline-module-header-focus-visible-cds.png) | [png](../components/crops/signed-in/outline-module-header-pressed.png) | [png](../components/crops/signed-in/outline-module-header-collapsed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-5ljz9g+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground); collapsed: at rest, captured collapsed.

Sub-measurements:

- number: div 54.34×18 at (32, 291), "Module 1", font 600 14px/18px Source Sans Pro ls -0.042px, colour #5e6f92 (emphasis-neutral-content-default, emphasis-neutral-stroke-default, grey-600), margin 0px 0px 4px
- title: span 277.91×20 at (32, 313), "Simple Introduction to Machine Learning", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- chevron: svg 24×24 at (336, 289), font 600 30px/36px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), margin 0px 0px 0px 12px, fill #48546e (neutral-primary-weak, grey-750), overflow-y hidden

Sub-measurements, collapsed:

- number: div 54.34×18 at (32, 558), "Module 2", font 600 14px/18px Source Sans Pro ls -0.042px, colour #5e6f92 (emphasis-neutral-content-default, emphasis-neutral-stroke-default, grey-600), margin 0px 0px 4px
- title: span 167.97×20 at (32, 580), "Basics of Model Learning", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- chevron: svg 24×24 at (336, 556), font 600 30px/36px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), margin 0px 0px 0px 12px, fill #48546e (neutral-primary-weak, grey-750), overflow-y hidden

Authored state rules that match this element (4, first 6; the rest are in the JSON):

- `.css-5ljz9g:focus { outline: none; }`
- `.css-5ljz9g.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-5ljz9g.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `.css-ijv9ue h3:hover .cds-AccordionHeader-button::before { background-color: var(--cds-color-interactive-background-primary-hover-weak); }`

### Outline: lesson heading

h4 above each lesson's item rows, flush with the card edge.

Key `outline-lesson-heading`. Read from `__m.q("[data-testid=left-nav] h4", 0)` on item-video.

| Property | default |
| --- | --- |
| Size (w×h) | 360×26 |
| Padding | 8px (spacing-100) 0 0 0 |
| Background | transparent (no token) |
| Font | Source Sans Pro 600 14px/18px, -0.042px (typography-subtitle-small) |
| Colour | #48546e (neutral-primary-weak, grey-750) |
| Crop | [png](../components/crops/signed-in/outline-lesson-heading-default.png) |

### Outline: item row

Item link: 20px status icon, title, and a type • duration line. The link spans the card; the visible row (tint, radius) is its inner content wrapper, which is what is measured here. The current item is tinted.

Key `outline-item`. Read from `__m.q("[data-testid=left-nav] ul li a .outline-single-item-content-wrapper", 0)` on item-video.

| Property | default | hover | focus-visible | focus-visible-cds | pressed | selected | selected-hover | selected-focus-visible | selected-focus-visible-cds | not-started |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 344×60 | = | = | = | = | 344×60 | = | = | = | 344×56 |
| Padding | 12px (spacing-150) 16px (spacing-200) 8px (spacing-100) 16px (spacing-200) | = | = | = | = | 8px (spacing-100) / 16px (spacing-200) | 8px (spacing-100) / 16px (spacing-200) | 8px (spacing-100) / 16px (spacing-200) | 8px (spacing-100) / 16px (spacing-200) | 8px (spacing-100) / 16px (spacing-200) |
| Gap | 12px (spacing-150) | = | = | = | = | 12px (spacing-150) | = | = | = | 12px (spacing-150) |
| Radius | 8px (border-radius-100) | = | = | = | = | 8px (border-radius-100) | = | = | = | 8px (border-radius-100) |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Outline | none | = | 1px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -1px | 1px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -1px | = | none | = | 1px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -1px | 1px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset -1px | none |
| Painted layers | div.outline-single-item-content-wrapper 344.0x60.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px | div.outline-single-item-content-wrapper 344.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | div.outline-single-item-content-wrapper 344.0x60.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px outline 1px solid rgb(128, 78, 228) offset -1px | div.outline-single-item-content-wrapper 344.0x60.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px outline 1px solid rgb(128, 78, 228) offset -1px | div.outline-single-item-content-wrapper 344.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | div.outline-single-item-content-wrapper 344.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | div.outline-single-item-content-wrapper 344.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | div.outline-single-item-content-wrapper 344.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 1px solid rgb(128, 78, 228) offset -1px | div.outline-single-item-content-wrapper 344.0x60.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 1px solid rgb(128, 78, 228) offset -1px | div.outline-single-item-content-wrapper 344.0x56.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | = | = | = | = | #0056d2 (interactive-primary, feedback-informative, blue-800) | = | = | = | #0056d2 (interactive-primary, feedback-informative, blue-800) |
| Cursor | pointer | = | = | = | = | pointer | = | = | = | pointer |
| Icon | 20×20, fill none (no token), color #197d12 (feedback-success, green-750) | = | = | = | = | 20×20, fill none (no token), color #197d12 (feedback-success, green-750) | = | = | = | 20×20, fill none (no token), color #0056d2 (interactive-primary, feedback-informative, blue-800) |
| Crop | [png](../components/crops/signed-in/outline-item-default.png) | [png](../components/crops/signed-in/outline-item-hover.png) | [png](../components/crops/signed-in/outline-item-focus-visible.png) | [png](../components/crops/signed-in/outline-item-focus-visible-cds.png) | [png](../components/crops/signed-in/outline-item-pressed.png) | [png](../components/crops/signed-in/outline-item-selected.png) | [png](../components/crops/signed-in/outline-item-selected-hover.png) | [png](../components/crops/signed-in/outline-item-selected-focus-visible.png) | [png](../components/crops/signed-in/outline-item-selected-focus-visible-cds.png) | [png](../components/crops/signed-in/outline-item-not-started.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; no CDS focusVisible rule names this element; pressed: mouse button held down (released over the page ground); selected: at rest, captured selected; selected-hover: mouse hover; selected-focus-visible: keyboard: focus(), Shift+Tab, Tab; selected-focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; no CDS focusVisible rule names this element; not-started: at rest, captured not-started.

Sub-measurements:

- link: a 360×60 at (16, 375), "Course Information Reading . Duration: 1", font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), padding 0px 8px
- icon: svg 20×20 at (40, 397), font 400 16px/24px Source Sans Pro, colour #197d12 (feedback-success, green-750), fill none (no token), overflow-y hidden
- title: div 113.25×20 at (72, 387), "Course Information", font 400 14px/20px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- meta: div 113.25×20 at (72, 407), "Reading . Duration: 10 minutes 10 min", font 400 14px/20px Source Sans Pro, colour #5e6f92 (emphasis-neutral-content-default, emphasis-neutral-stroke-default, grey-600)
- duration: span 51.69×20 at (119.6, 407), ". Duration: 10 minutes 10 min", font 400 14px/20px Source Sans Pro, colour #5e6f92 (emphasis-neutral-content-default, emphasis-neutral-stroke-default, grey-600)

Sub-measurements, selected:

- link: a 360×60 at (16, 435), "Why Machine Learning Is Exciting Video .", font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), padding 0px 8px
- icon: svg 20×20 at (40, 455), font 400 16px/24px Source Sans Pro, colour #197d12 (feedback-success, green-750), fill none (no token), overflow-y hidden
- title: div 226.13×24 at (72, 443), "Why Machine Learning Is Exciting", font 600 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- meta: div 226.13×20 at (72, 467), "Video . Duration: 5 minutes 5 min", font 400 14px/20px Source Sans Pro, colour #5e6f92 (emphasis-neutral-content-default, emphasis-neutral-stroke-default, grey-600)
- duration: span 44.73×20 at (105, 467), ". Duration: 5 minutes 5 min", font 400 14px/20px Source Sans Pro, colour #5e6f92 (emphasis-neutral-content-default, emphasis-neutral-stroke-default, grey-600)

Sub-measurements, not-started:

- link: a 360×56 at (16, 550), "Report a problem with the course Reading", font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), padding 0px 8px
- icon: svg 20×20 at (40, 568), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), fill none (no token), overflow-y hidden
- title: div 194.8×20 at (72, 558), "Report a problem with the course", font 400 14px/20px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- meta: div 194.8×20 at (72, 578), "Reading . Duration: 5 minutes 5 min", font 400 14px/20px Source Sans Pro, colour #5e6f92 (emphasis-neutral-content-default, emphasis-neutral-stroke-default, grey-600)
- duration: span 44.73×20 at (119.6, 578), ". Duration: 5 minutes 5 min", font 400 14px/20px Source Sans Pro, colour #5e6f92 (emphasis-neutral-content-default, emphasis-neutral-stroke-default, grey-600)

Authored state rules that match this element (2, first 6; the rest are in the JSON):

- `.css-173s09n:hover .outline-single-item-content-wrapper { background-color: var(--cds-color-interactive-background-primary-hover-weak); }`
- `.css-173s09n:focus-visible .outline-single-item-content-wrapper { outline: 1px solid var(--cds-color-interactive-stroke-primary-focus); outline-offset: -1px; }`

### Outline: rule between lessons

1px rule inset 16px at each side.

Key `outline-divider`. Read from `__m.q("[data-testid=left-nav] h4", 0).parentElement.lastElementChild` on item-video.

| Property | default |
| --- | --- |
| Size (w×h) | 328×1 |
| Border | T: 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Background | transparent (no token) |
| Painted layers | div 328.0x1.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/outline-divider-default.png) |

## Video item

### Video player frame

The player container (the video itself is a poster frame in the snapshot): centre play button, control bar with a progress rail.

Key `video-player`. Read from `__m.q("[data-testid=playerContainer]", 0)` on item-video.

| Property | default |
| --- | --- |
| Size (w×h) | 912×483 |
| Border | 2px solid transparent (no token) |
| Radius | 16px (border-radius-200) |
| Background | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | div 912.0x483.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) border T:2px solid transparent (no token) \| R:2px solid transparent (no token) \| B:2px solid transparent (no token) \| L:2px solid transparent (no token) r 16px; picture 908.0x479.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25); div 95.8x95.8 bg rgba(0,0,0,0.66) (no token) r 50%; div 908.0x479.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Transition | border-color 0.2s linear |
| Crop | [png](../components/crops/signed-in/video-player-default.png) |

Sub-measurements:

- video: video 908×479 at (410, 83), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), overflow-y clip
- play: div 95.8×95.8 at (816.1, 274.6), font 400 16px/24px Source Sans Pro, colour #ffffff (neutral-primary-invert, neutral-background-primary, white-0), bg rgba(0,0,0,0.66) (no token), radius 50%
- playIcon: svg 70×70 at (829, 287.5), font 400 16px/24px Source Sans Pro, colour #ffffff (neutral-primary-invert, neutral-background-primary, white-0), fill none (no token), overflow-y hidden
- controls: div 908×60 at (410, 502), "0:12 / 5:08 1x", font 400 16px/24px Source Sans Pro, colour #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25), bg rgba(0,0,0,0.33) (no token)
- rail: span 892×3 at (418, 494.5), font 400 16px/24px Source Sans Pro, colour #3587fc (emphasis-primary-stroke-default, blue-500), radius 2px
- track: span 34.64×3 at (418, 494.5), font 400 16px/24px Source Sans Pro, colour #3587fc (emphasis-primary-stroke-default, blue-500), bg #3587fc (emphasis-primary-stroke-default, blue-500), radius 2px
- thumb: span 9.6×9.6 at (447.8, 491.5), font 400 16px/24px Source Sans Pro, colour #3587fc (emphasis-primary-stroke-default, blue-500), bg #3587fc (emphasis-primary-stroke-default, blue-500), radius 50%, margin -5px 0px 0px -8px
- controlButton: button 48×48 at (418, 510.5), font 400 16px/24px Source Sans Pro, colour #ffffff (neutral-primary-invert, neutral-background-primary, white-0), radius 8px
- time: span 29.97×22 at (582, 523.5), "0:12", font 700 16px/24px Source Sans Pro ls -0.048px, colour #ffffff (neutral-primary-invert, neutral-background-primary, white-0)

Authored state rules that match this element (1, first 6; the rest are in the JSON):

- `.css-ok2qt2:hover { --video-player-border-color: var(--cds-color-blue-300); }`

### Video: centre play button

Full-frame button; the visible part is a 74px dark disc with a 70px play glyph.

Key `video-play-button`. Read from `__m.q("[data-testid=centerPlayButton]", 0)` on item-video.

| Property | default | hover |
| --- | --- | --- |
| Size (w×h) | 908×479 | = |
| Radius | 8px (border-radius-100) | = |
| Background | transparent (no token) | = |
| Painted layers | div 95.8x95.8 bg rgba(0,0,0,0.66) (no token) r 50% | = |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = |
| Transition | opacity 0.15s ease-out | = |
| Cursor | pointer | = |
| Crop | [png](../components/crops/signed-in/video-play-button-default.png) | [png](../components/crops/signed-in/video-play-button-hover.png) |

How: hover: mouse hover.

Sub-measurements:

- disc: div 95.8×95.8 at (816.1, 274.6), font 400 16px/24px Source Sans Pro, colour #ffffff (neutral-primary-invert, neutral-background-primary, white-0), bg rgba(0,0,0,0.66) (no token), radius 50%

Authored state rules that match this element (3, first 6; the rest are in the JSON):

- `.css-70xb3w:focus { outline: none; }`
- `.css-70xb3w.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-70xb3w.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`

### Video: item title

h1.video-name under the player.

Key `video-title`. Read from `__m.q("h1.video-name", 0)` on item-video.

| Property | default |
| --- | --- |
| Size (w×h) | 335.34×28 |
| Background | transparent (no token) |
| Font | Source Sans Pro 600 24px/28px, -0.12px (typography-title-x-small) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/video-title-default.png) |

### Video: "Save note"

Ghost button, 48px tall, 16px pencil start icon.

Key `video-save-note`. Read from `__m.q("#save-note-button", 0)` on item-video.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 120.58×48 | = | = | = | = |
| Padding | 12px (spacing-150) / 16px (spacing-200) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers |  | button.cds-116.cds-button-disableElevation 120.6x48.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | = | button.cds-116.cds-button-disableElevation 120.6x48.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-button-disableElevation 124.578pxx52px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-116.cds-button-disableElevation 120.6x48.0 bg #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) r 8px |
| Font | Source Sans Pro 600 16px/24px, 0.16px (typography-title3, typography-action-primary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Text decoration | none | underline auto offset auto | = | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Icon | 16×16, fill none (no token), color #0056d2 (interactive-primary, feedback-informative, blue-800) | 16×16, fill none (no token), color #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | 16×16, fill none (no token), color #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | 16×16, fill none (no token), color #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Crop | [png](../components/crops/signed-in/video-save-note-default.png) | [png](../components/crops/signed-in/video-save-note-hover.png) | [png](../components/crops/signed-in/video-save-note-focus-visible.png) | [png](../components/crops/signed-in/video-save-note-focus-visible-cds.png) | [png](../components/crops/signed-in/video-save-note-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-17sfdk0+.cds-buttonBase-focusVisible, button.css-17sfdk0+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (10, first 6; the rest are in the JSON):

- `.css-17sfdk0:focus { outline: none; }`
- `.css-17sfdk0.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-17sfdk0.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `@media (hover: hover) .css-17sfdk0:hover { text-decoration: underline; color: var(--cds-color-interactive-primary-hover); background-color: var( --cds-color-interactive-background-primary-hover-weak ); }`
- `.css-17sfdk0.cds-button-focusVisible { text-decoration: underline; background-color: var( --cds-color-interactive-background-primary-hover-weak ); color: var(--cds-color-interactive-primary-hover); }`
- `.css-17sfdk0:active { text-decoration: underline; color: var(--cds-color-interactive-primary-pressed); background-color: var( --cds-color-interactive-background-primary-pressed-weak ); }`

### Video: "Dive deeper on this topic" AI panel

Grey rounded disclosure: sparkle icon and heading, chevron at the right, then the suggestion chips.

Key `ai-panel`. Read from `__m.q(".disclosure.brandUpdate", 0)` on item-video.

| Property | default |
| --- | --- |
| Size (w×h) | 912×108 |
| Radius | 16px (border-radius-200) |
| Background | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | div.disclosure.expanded 912.0x108.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 16px; button.cds-116.coach-secondary-button 196.4x36.0 r 8px; button::before.cds-116.coach-secondary-button 192.406pxx32px bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 6px; button.cds-116.coach-secondary-button 234.8x36.0 r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/ai-panel-default.png) |

Sub-measurements:

- header: div 912×56 at (408, 632), "Dive deeper on this topic", font 600 20px/24px Source Sans Pro ls -0.06px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 16px, padding 16px 24px
- icon: svg 20×20 at (432, 650), font 600 20px/24px Source Sans Pro ls -0.06px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), fill none (no token), overflow-y hidden
- heading: p 165.2×24 at (460, 648), "Dive deeper on this topic", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- toggle: svg 20×20 at (1276, 650), font 600 20px/24px Source Sans Pro ls -0.06px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), fill none (no token), overflow-y hidden
- footer: div 912×52 at (408, 688), "Give me practice questions Explain this ", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 0px 24px 16px
- group: div 864×36 at (432, 688), "Give me practice questions Explain this ", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), gap 8px
- chips: 4 items, sizes 196.4x36.0 234.8x36.0 152.3x36.0 193.1x36.0, gaps dx 8 dx 8 dx 8

### AI panel: header

The disclosure header (role=button).

Key `ai-panel-header`. Read from `__m.q(".disclosure-header", 0)` on item-video.

| Property | default | hover | focus-visible | pressed |
| --- | --- | --- | --- | --- |
| Size (w×h) | 912×56 | = | = | = |
| Padding | 16px (spacing-200) / 24px (spacing-300) | = | = | = |
| Radius | 16px (border-radius-200) | = | = | = |
| Background | transparent (no token) | = | = | = |
| Box shadow | none | = | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px | = |
| Painted layers |  | = | div.disclosure-header 912.0x56.0 r 16px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | = |
| Font | Source Sans Pro 600 20px/24px, -0.06px (typography-subtitle-large) | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = |
| Crop | [png](../components/crops/signed-in/ai-panel-header-default.png) | [png](../components/crops/signed-in/ai-panel-header-hover.png) | [png](../components/crops/signed-in/ai-panel-header-focus-visible.png) | [png](../components/crops/signed-in/ai-panel-header-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (2, first 6; the rest are in the JSON):

- `.css-1yi6vvh .disclosure-header:focus-visible { outline: none; box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-primary-focus-invert); }`
- `.css-1yi6vvh.collapsible .disclosure-header:hover { cursor: pointer; }`

### AI panel: suggestion chip

Secondary button (outlined) used as a chip: "Give me practice questions".

Key `ai-chip`. Read from `__m.q(".coach-secondary-button", 0)` on item-video.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 196.41×36 | = | = | = | 192.48×35.28 |
| Padding | 8px (spacing-100) / 16px (spacing-200) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | 12px |
| Background | transparent (no token) + linear-gradient(279deg, rgb(13, 47, 96) -5.78%, rgb(19, 110, 240) 83.48%) | transparent (no token) + linear-gradient(310deg, rgb(13, 47, 96) -10.46%, rgb(19, 110, 240) 78.54%, rgb(126, 216, 116) 116.68%) | = | transparent (no token) + linear-gradient(310deg, rgb(13, 47, 96) -10.46%, rgb(19, 110, 240) 78.54%, rgb(126, 216, 116) 116.68%) | transparent (no token) + linear-gradient(310deg, rgb(13, 47, 96) -10.46%, rgb(19, 110, 240) 78.54%, rgb(126, 216, 116) 116.68%) |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element | ::before inset 2px 2px 2px 2px, bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 6px | = | = | ::after inset -2px -2px -2px -2px, shadow #002457 (callouts-background-primary-strong, emphasis-primary-background-xxstrong, blue-950) 0px 0px 0px 1px, #e3eeff (callouts-background-primary-weak, emphasis-primary-background-weak, blue-50) 0px 0px 0px 2px, radius 10px | ::before inset 2px 2px 2px 2px, bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0), radius 10px |
| Painted layers | button.cds-116.coach-secondary-button 196.4x36.0 r 8px; button::before.cds-116.coach-secondary-button 192.406pxx32px bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 6px | = | = | button.cds-116.coach-secondary-button 196.4x36.0 r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::before.cds-116.coach-secondary-button 192.406pxx32px bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 6px; button::after.cds-116.coach-secondary-button 200.406pxx40px r 10px shadow rgb(0, 36, 87) 0px 0px 0px 1px, rgb(227, 238, 255) 0px 0px 0px 2px | button.cds-116.coach-secondary-button 192.5x35.3 r 12px; button::before.cds-116.coach-secondary-button 192.406pxx32px bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 10px |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Transform | none | = | = | = | matrix3d(0.98, 0, 0, 0, 0, 0.98, 0, 0, 0, 0, 0.98, 0, 0, 0, 0, 1) |
| Transition | none | = | = | = | all 0.2s cubic-bezier(0 |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/ai-chip-default.png) | [png](../components/crops/signed-in/ai-chip-hover.png) | [png](../components/crops/signed-in/ai-chip-focus-visible.png) | [png](../components/crops/signed-in/ai-chip-focus-visible-cds.png) | [png](../components/crops/signed-in/ai-chip-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-td12fb+.cds-buttonBase-focusVisible, button.css-td12fb+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (16, first 6; the rest are in the JSON):

- `.css-td12fb:focus { outline: none; }`
- `.css-td12fb.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-td12fb.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-td12fb:hover { color: var(--cds-color-interactive-primary-hover); box-shadow: inset 0 0 0 1px var(--cds-color-interactive-primary-hover); background-color: var( --cds-color-interactive-background-primary-hover-weak ); }`
- `.css-td12fb.cds-button-focusVisible { box-shadow: inset 0 0 0 1px var(--cds-color-interactive-primary-hover); background-color: var( --cds-color-interactive-background-primary-hover-weak ); color: var(--cds-color-interactive-primary-hover); }`
- `.css-td12fb:active { color: var(--cds-color-interactive-primary-pressed); box-shadow: inset 0 0 0 1px var(--cds-color-interactive-primary-pressed); background-color: var( --cds-color-interactive-background-primary-pressed-weak ); }`

### Item feedback icon button (like, dislike, flag)

Ghost-secondary small icon buttons, 36x36 with 20px icons, in a row under the AI panel.

Key `item-feedback-icon`. Read from `__m.q("[data-testid=like-button] button", 0)` on item-video.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 36×36 | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) | = | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) | #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) |
| Box shadow | transparent 0px 0px 0px 1px inset | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | button.cds-116.cds-iconButton-small 36.0x36.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | button.cds-116.cds-iconButton-small 36.0x36.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | = | button.cds-116.cds-iconButton-small 36.0x36.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-iconButton-small 40pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-116.cds-iconButton-small 36.0x36.0 bg #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | = | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | #1c2026 (interactive-secondary-pressed, interactive-secondary-selected, grey-950) |
| Cursor | pointer | = | = | = | = |
| Icon | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | = | 20×20, fill none (no token), color #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | 20×20, fill none (no token), color #1c2026 (interactive-secondary-pressed, interactive-secondary-selected, grey-950) |
| Crop | [png](../components/crops/signed-in/item-feedback-icon-default.png) | [png](../components/crops/signed-in/item-feedback-icon-hover.png) | [png](../components/crops/signed-in/item-feedback-icon-focus-visible.png) | [png](../components/crops/signed-in/item-feedback-icon-focus-visible-cds.png) | [png](../components/crops/signed-in/item-feedback-icon-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-9jkubm+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground).

Sub-measurements:

- row: div 72×36 at (408, 764), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- dislike: button 36×36 at (444, 764), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 8px, shadow transparent 0px 0px 0px 1px inset
- flag: button 36×36 at (480, 764), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 8px, shadow transparent 0px 0px 0px 1px inset

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.css-9jkubm:focus { outline: none; }`
- `.css-9jkubm.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-9jkubm.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-9jkubm.cds-iconButton-ghostSecondary:hover { --iconButton-background: var( --cds-color-interactive-background-secondary-hover-weak ); --iconButton-color: var(--cds-color-interactive-secondary-hover); }`
- `.css-9jkubm.cds-iconButton-ghostSecondary.cds-buttonBase-focusVisible { --iconButton-background: var( --cds-color-interactive-background-secondary-hover-weak ); --iconButton-color: var(--cds-color-interactive-secondary-hover); }`
- `.css-9jkubm.cds-iconButton-ghostSecondary:active { --iconButton-background: var( --cds-color-interactive-background-secondary-pressed-weak ); --iconButton-color: var(--cds-color-interactive-secondary-pressed); }`

### "Go to next item" (footer)

Primary button with a 20px arrow end icon, bottom right of the item card.

Key `next-item-button`. Read from `__m.q("button[aria-label=\"Go to next item\"]", 0)` on item-video.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 149.08×36 | = | = | = | = |
| Padding | 8px (spacing-100) / 16px (spacing-200) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) | = | = | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Box shadow | #0056d2 0px 0px 0px 1px inset | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | button.cds-116.cds-button-disableElevation 149.1x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | button.cds-116.cds-button-disableElevation 149.1x36.0 bg #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | = | button.cds-116.cds-button-disableElevation 149.1x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-button-disableElevation 153.078pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-116.cds-button-disableElevation 149.1x36.0 bg #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = | = | = |
| Colour | #ffffff (neutral-primary-invert, neutral-background-primary, white-0) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 20×20, fill none (no token), color #ffffff (neutral-primary-invert, neutral-background-primary, white-0) | = | = | = | = |
| Crop | [png](../components/crops/signed-in/next-item-button-default.png) | [png](../components/crops/signed-in/next-item-button-hover.png) | [png](../components/crops/signed-in/next-item-button-focus-visible.png) | [png](../components/crops/signed-in/next-item-button-focus-visible-cds.png) | [png](../components/crops/signed-in/next-item-button-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-1gs53gi+.cds-buttonBase-focusVisible, button.css-1gs53gi+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Sub-measurements:

- footer: div 181.08×68 at (1146.9, 816), "Go to next item", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 0px 8px 0px 0px

Authored state rules that match this element (9, first 6; the rest are in the JSON):

- `.css-1gs53gi:focus { outline: none; }`
- `.css-1gs53gi.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-1gs53gi.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `@media (hover: hover) .css-1gs53gi:hover { border-color: var(--cds-color-interactive-primary-hover); background-color: var(--cds-color-interactive-primary-hover); }`
- `.css-1gs53gi:active { border-color: var(--cds-color-interactive-primary-pressed); background-color: var(--cds-color-interactive-primary-pressed); }`
- `.css-1gs53gi:active.cds-button-disableElevation::after { content: unset; }`

### Tool strip (Transcript, Notes, Files)

Right-edge column of 72x72 buttons: a 20px icon over a small label.

Key `tool-strip`. Read from `__m.q("[role=toolbar][aria-label=\"Item actions\"]", 0)` on item-video.

| Property | default |
| --- | --- |
| Size (w×h) | 88×819 |
| Padding | 8px (spacing-100) |
| Gap | 8px (spacing-100) |
| Border | L: 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Radius | 0px 16px (border-radius-200) 16px (border-radius-200) 0px |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Painted layers | div 88.0x819.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 0px 16px 16px 0px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/tool-strip-default.png) |

Sub-measurements:

- buttons: 3 items, sizes 72.0x72.0 72.0x72.0 72.0x72.0, gaps dy 8 (pitch 80) dy 8 (pitch 80)
- icon: div 20×20 at (1371, 89), font 400 16px/24px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- label: div 67.34×21.19 at (1347.3, 113), "Transcript", font 400 16px/19.2px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), padding 2px 0px 0px

### Tool strip button

72x72 button, icon over label. The open tool gets a tinted square.

Key `tool-strip-button`. Read from `__m.q("[data-testid=item-tool-panel-button-notes]", 0)` on item-video; `__m.q("[data-testid=item-tool-panel-button-notes]", 0)` on item-video-transcript.

| Property | default | hover | focus-visible | focus-visible-cds | pressed | selected | selected-hover | selected-focus-visible |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 72×72 | = | = | = | = | 72×72 | = | = |
| Padding | 16px (spacing-200) | = | = | = | = | 16px (spacing-200) | = | = |
| Gap | 4px (spacing-50) | = | = | = | = | 4px (spacing-50) | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = | 8px (border-radius-100) | = | = |
| Background | transparent (no token) | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) | = | = | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) | #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) | #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) | #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) |
| Outline | none | = | 1px solid #925ceb (emphasis-quaternary-stroke-default, purple-500) offset 1px | 1px solid #925ceb (emphasis-quaternary-stroke-default, purple-500) offset 1px | = | none | = | 1px solid #925ceb (emphasis-quaternary-stroke-default, purple-500) offset 1px |
| Painted layers |  | button 72.0x72.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px | button 72.0x72.0 r 8px outline 1px solid rgb(146, 92, 235) offset 1px | button 72.0x72.0 r 8px outline 1px solid rgb(146, 92, 235) offset 1px | button 72.0x72.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px | button 72.0x72.0 bg #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) r 8px | button 72.0x72.0 bg #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) r 8px | button 72.0x72.0 bg #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) r 8px outline 1px solid rgb(146, 92, 235) offset 1px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = |
| Transition | background-color 0.2s ease | = | = | = | = | background-color 0.2s ease | = | = |
| Cursor | pointer | = | = | = | = | pointer | = | = |
| Icon | 20×20, fill none (no token), color #48546e (neutral-primary-weak, grey-750) | = | = | = | = | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/tool-strip-button-default.png) | [png](../components/crops/signed-in/tool-strip-button-hover.png) | [png](../components/crops/signed-in/tool-strip-button-focus-visible.png) | [png](../components/crops/signed-in/tool-strip-button-focus-visible-cds.png) | [png](../components/crops/signed-in/tool-strip-button-pressed.png) | [png](../components/crops/signed-in/tool-strip-button-selected.png) | [png](../components/crops/signed-in/tool-strip-button-selected-hover.png) | [png](../components/crops/signed-in/tool-strip-button-selected-focus-visible.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; no CDS focusVisible rule names this element; pressed: mouse button held down (released over the page ground); selected: at rest, captured selected; selected-hover: mouse hover; selected-focus-visible: keyboard: focus(), Shift+Tab, Tab.

Sub-measurements:

- icon: div 20×20 at (1371, 169), font 400 16px/24px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- label: div 38.59×21.19 at (1361.7, 193), "Notes", font 400 16px/19.2px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), padding 2px 0px 0px

Authored state rules that match this element (2, first 6; the rest are in the JSON):

- `.css-3fstzr:hover { background: var(--cds-color-interactive-background-secondary-hover-weak); }`
- `.css-3fstzr:focus-visible { outline: 1px solid var(--cds-color-emphasis-quaternary-stroke-default); outline-offset: 1px; }`

### Tool pane separator

10px drag handle (role=separator) between the item and the transcript pane.

Key `tool-panel-separator`. Read from `__m.q("[role=separator]", 0)` on item-video-transcript.

| Property | default | hover |
| --- | --- | --- |
| Size (w×h) | 10×819 | = |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) | = |
| Pseudo element | ::before inset 0px 4px 0px 5px, bg #c1cbdb (neutral-stroke-primary-weak, grey-200) | ::before inset 0px 3px 0px 5px, bg #0056d2 (interactive-primary, feedback-informative, blue-800) |
| Painted layers | div 10.0x819.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0); div::before 1pxx819px bg #c1cbdb (neutral-stroke-primary-weak, grey-200) | div 10.0x819.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0); div::before 2pxx819px bg #0056d2 (interactive-primary, feedback-informative, blue-800) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = |
| Transition | width 0.225s cubic-bezier(0.2 | = |
| Cursor | auto | ew-resize |
| Crop | none | none |

How: hover: mouse hover.

Sub-measurements:

- before: "" 1px×819px absolute inset 0px 4px 0px 5px bg #c1cbdb (neutral-stroke-primary-weak, grey-200) border 0px none rgb(13, 15, 18) left 0px none rgb(13, 15, 18) radius 0px
- after: none
- children (0):

Authored state rules that match this element (2, first 6; the rest are in the JSON):

- `.css-nvdnwd:hover { cursor: ew-resize; }`
- `.css-nvdnwd:hover::before, .css-nvdnwd[data-resize-handle-state="hover"]::before, .css-nvdnwd[data-resize-handle-state="focus"]::before, .css-nvdnwd[data-resize-handle-state="drag"]::before { width: 2px; background-color: var(--cds-color-feedback-informative);`

## Transcript

### Transcript panel

Tool pane: "Transcript" heading, close button, "Language: English" silent select, then the interactive transcript (a timestamp per paragraph, phrases as inline buttons).

Key `transcript-panel`. Read from `__m.q("[data-testid=item-tool-panel-layout-tool-content-panel]", 0)` on item-video-transcript.

| Property | default |
| --- | --- |
| Size (w×h) | 233.5×819 |
| Background | transparent (no token) |
| Painted layers | div 233.5x819.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0); div 233.5x819.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0); div 233.5x819.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0); button.cds-116.cds-iconButton-small 36.0x36.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/transcript-panel-default.png) |

Sub-measurements:

- heading: h2 69.22×20 at (1118.5, 89), "Transcript", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- close: button 36×36 at (1300, 81), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 8px, shadow transparent 0px 0px 0px 1px inset
- select: div 135.5×32 at (1118.5, 109), "Language: English ​", font 400 16px/19.0016px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 8px
- selectLabel: span 66.58×20 at (1118.5, 116), "Language:", font 600 14px/20px Source Sans Pro ls 0.14px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- selectValue: span 44.92×20 at (1185.1, 116), "English", font 600 14px/20px Source Sans Pro ls 0.14px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- body: div 209.5×4292 at (1122.5, -3424), "Play video starting at :: and follow tra", font 400 16px/26px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- paragraph: div 209.5×926 at (1122.5, -3424), "Play video starting at :: and follow tra", font 400 16px/26px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 0px 0px 16px
- paragraphs: 5 items, sizes 209.5x926.0 209.5x926.0 209.5x1212.0 209.5x952.0, gaps dy 0 (pitch 926) dy 0 (pitch 926) dy 0 (pitch 1212) dy 0 (pitch 952)

### Transcript: close button

Ghost-secondary small icon button, 36x36 with a 20px X.

Key `transcript-close`. Read from `__m.q("[aria-label=\"Close panel\"]", 0)` on item-video-transcript.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 36×36 | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) | = | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) | #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) |
| Box shadow | transparent 0px 0px 0px 1px inset | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | button.cds-116.cds-iconButton-small 36.0x36.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | button.cds-116.cds-iconButton-small 36.0x36.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | = | button.cds-116.cds-iconButton-small 36.0x36.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-iconButton-small 40pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-116.cds-iconButton-small 36.0x36.0 bg #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | = | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | #1c2026 (interactive-secondary-pressed, interactive-secondary-selected, grey-950) |
| Cursor | pointer | = | = | = | = |
| Icon | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | = | 20×20, fill none (no token), color #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | 20×20, fill none (no token), color #1c2026 (interactive-secondary-pressed, interactive-secondary-selected, grey-950) |
| Crop | [png](../components/crops/signed-in/transcript-close-default.png) | [png](../components/crops/signed-in/transcript-close-hover.png) | [png](../components/crops/signed-in/transcript-close-focus-visible.png) | [png](../components/crops/signed-in/transcript-close-focus-visible-cds.png) | [png](../components/crops/signed-in/transcript-close-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-9jkubm+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.css-9jkubm:focus { outline: none; }`
- `.css-9jkubm.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-9jkubm.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-9jkubm.cds-iconButton-ghostSecondary:hover { --iconButton-background: var( --cds-color-interactive-background-secondary-hover-weak ); --iconButton-color: var(--cds-color-interactive-secondary-hover); }`
- `.css-9jkubm.cds-iconButton-ghostSecondary.cds-buttonBase-focusVisible { --iconButton-background: var( --cds-color-interactive-background-secondary-hover-weak ); --iconButton-color: var(--cds-color-interactive-secondary-hover); }`
- `.css-9jkubm.cds-iconButton-ghostSecondary:active { --iconButton-background: var( --cds-color-interactive-background-secondary-pressed-weak ); --iconButton-color: var(--cds-color-interactive-secondary-pressed); }`

### Transcript: language select

Silent select: bold label and value, 24px chevron, no visible box.

Key `transcript-language`. Read from `__m.q("[data-testid=track-chooser-select]", 0)` on item-video-transcript.

| Property | default | hover | focus-visible |
| --- | --- | --- | --- |
| Size (w×h) | 135.5×32 | = | = |
| Radius | 8px (border-radius-100) | = | = |
| Background | transparent (no token) | = | = |
| Painted layers | input.cds-215 135.5x25.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:2px inset #767676 (no token) \| R:2px inset #767676 (no token) \| B:2px inset #767676 (no token) \| L:2px inset #767676 (no token) | input.cds-215 135.5x25.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:2px inset #767676 (no token) \| R:2px inset #767676 (no token) \| B:2px inset #767676 (no token) \| L:2px inset #767676 (no token); fieldset.cds-251.cds-225 135.5x37.0 border B:2px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 8px 8px 0px 0px | = |
| Font | Source Sans Pro 400 16px/19.0016px | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = |
| Cursor | text | = | = |
| Icon | 24×24, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = |
| Crop | [png](../components/crops/signed-in/transcript-language-default.png) | [png](../components/crops/signed-in/transcript-language-hover.png) | [png](../components/crops/signed-in/transcript-language-focus-visible.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab.

Authored state rules that match this element (5, first 6; the rest are in the JSON):

- `.css-1wqasdw .cds-silentSelect-input:hover { background: transparent; }`
- `.css-uk9ky9:focus { outline: none; }`
- `.css-uk9ky9:hover { background: var(--cds-color-interactive-background-primary-hover-weak); color: var(--cds-color-neutral-primary); }`
- `.css-uk9ky9.cds-select-focusVisible { position: relative; outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-uk9ky9.cds-select-focusVisible::before { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); z-index: 0; user-select: none; transform: scale(1, 1); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-foc`

### Transcript: timestamp

Paragraph timestamp as a button ("0:00").

Key `transcript-timestamp`. Read from `__m.q("button.timestamp", 0)` on item-video-transcript.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 25.95×20 | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers |  | = | = | button.cds-116.timestamp 26.0x20.0 r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.timestamp 29.9531pxx24px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | = |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = |
| Text decoration | none | underline auto offset auto | = | = | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/transcript-timestamp-default.png) | [png](../components/crops/signed-in/transcript-timestamp-hover.png) | [png](../components/crops/signed-in/transcript-timestamp-focus-visible.png) | [png](../components/crops/signed-in/transcript-timestamp-focus-visible-cds.png) | [png](../components/crops/signed-in/transcript-timestamp-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-1jzufww+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (4, first 6; the rest are in the JSON):

- `.css-1jzufww:focus { outline: none; }`
- `.css-1jzufww.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-1jzufww.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `.css-1jzufww:hover { text-decoration: underline; }`

### Transcript: phrase

Each sentence fragment is an inline role=button span. The current phrase gets a 1px blue outline box; hover tints a phrase.

Key `transcript-phrase`. Read from `__m.q(".rc-Phrase", 5)` on item-video-transcript.

| Property | default | hover | focus-visible | pressed | current |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 192.06×48 | = | = | = | 192.31×74 |
| Background | transparent (no token) | #e3eeff (callouts-background-primary-weak, emphasis-primary-background-weak, blue-50) | = | #e3eeff (callouts-background-primary-weak, emphasis-primary-background-weak, blue-50) | #e3eeff (callouts-background-primary-weak, emphasis-primary-background-weak, blue-50) |
| Outline | none | = | = | = | 1px solid #3587fc (emphasis-primary-stroke-default, blue-500) offset 0px |
| Painted layers |  | span.rc-Phrase 192.1x48.0 bg #e3eeff (callouts-background-primary-weak, emphasis-primary-background-weak, blue-50) | = | span.rc-Phrase 192.1x48.0 bg #e3eeff (callouts-background-primary-weak, emphasis-primary-background-weak, blue-50) | span.rc-Phrase 192.3x74.0 bg #e3eeff (callouts-background-primary-weak, emphasis-primary-background-weak, blue-50) outline 1px solid rgb(53, 135, 252) offset 0px |
| Font | Source Sans Pro 400 16px/26px | = | = | = | Source Sans Pro 400 16px/26px |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Cursor | text | = | = | = | text |
| Crop | [png](../components/crops/signed-in/transcript-phrase-default.png) | [png](../components/crops/signed-in/transcript-phrase-hover.png) | [png](../components/crops/signed-in/transcript-phrase-focus-visible.png) | [png](../components/crops/signed-in/transcript-phrase-pressed.png) | [png](../components/crops/signed-in/transcript-phrase-current.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; pressed: mouse button held down (released over the page ground); current: at rest, captured current.

Authored state rules that match this element (2, first 6; the rest are in the JSON):

- `.css-nhymx3:focus { outline: none; }`
- `.css-nhymx3:hover { background-color: var(--cds-color-emphasis-primary-background-weak); }`

## Reading item

### Reading: title

Large h1 (cds Typography display) over the reading column.

Key `reading-title`. Read from `__m.q(".reading-title h1", 0)` on item-reading.

| Property | default |
| --- | --- |
| Size (w×h) | 770×52 |
| Background | transparent (no token) |
| Font | Source Sans Pro 400 44px/52px, -0.1px (typography-display2-weak) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/reading-title-default.png) |

Sub-measurements:

- column: div 770×517 at (515, 113), "Math for Data Science 0:00 / 0:16 1x  If", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- columnParent: div 770×517 at (515, 113), "Math for Data Science 0:00 / 0:16 1x  If", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

### Reading: audio player

Grey pill bar: play button, time, a progress rail with a thumb, playback rate, mute and settings.

Key `reading-audio-player`. Read from `__m.q("[data-testid=audio-player]", 0)` on item-reading.

| Property | default |
| --- | --- |
| Size (w×h) | 770×54 |
| Radius | 50px (border-radius-max) |
| Background | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Painted layers | div 770.0x54.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 50px; span.cds-186.audio-player-slider-rail 474.8x4.0 bg #c1cbdb (neutral-stroke-primary-weak, grey-200) r 2px; span.cds-187.audio-player-slider-track 0.0x4.0 bg #0d0f12 (emphasis-neutral-background-xxstrong, neutral-primary, grey-975) r 2px; span.cds-190.audio-player-slider-thumb 12.0x12.0 bg #0d0f12 (emphasis-neutral-background-xxstrong, neutral-primary, grey-975) r 50% |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Icon | 28×28, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/reading-audio-player-default.png) |

Sub-measurements:

- controls: div 770×54 at (515, 237), "0:00 / 0:16 1x", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 0px 16px, gap 8px
- play: button 36×36 at (531, 246), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 8px
- playIcon: svg 28×28 at (535, 250), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), fill none (no token), overflow-y hidden
- time: span 25.23×18 at (575, 255), "0:00", font 600 14px/18px Source Sans Pro ls -0.042px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- rail: span 474.75×4 at (654.3, 262), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 2px
- thumb: span 12×12 at (648.3, 258), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #0d0f12 (emphasis-neutral-background-xxstrong, neutral-primary, grey-975), radius 50%, margin -4px 0px 0px -6px
- rate: span 13.83×18 at (1156.1, 255), "1x", font 600 14px/18px Source Sans Pro ls -0.042px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

Authored state rules that match this element (1, first 6; the rest are in the JSON):

- `.css-g7575k:hover, .css-g7575k:focus-within { outline: 2px solid var(--cds-color-interactive-primary); }`

### Reading: body paragraph

CML paragraph. This reading has no subheadings or lists, so only the paragraph and link styles are on the page.

Key `reading-body`. Read from `__m.q("[data-testid=cml-viewer] p", 0)` on item-reading.

| Property | default |
| --- | --- |
| Size (w×h) | 770×72 |
| Background | transparent (no token) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Icon | 16×16, fill none (no token), color #0056d2 (interactive-primary, feedback-informative, blue-800) |
| Crop | [png](../components/crops/signed-in/reading-body-default.png) |

Sub-measurements:

- span: span 760.69×22 at (515, 364), "If the math notation used in this course", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- probe:
  - note: probe elements inserted by measure.mjs into the CML viewer; not in the captured reading
  - h1: h1 770×36 at (515, 467), "Heading 1", font 600 28px/36px Source Sans Pro ls -0.1px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 32px 0px 24px, margin-top 32px, margin-bottom 24px, padding-left 0px, list-style disc
  - h2: h2 770×28 at (515, 535), "Heading 2", font 600 20px/28px Source Sans Pro ls -0.1px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 32px 0px 16px, margin-top 32px, margin-bottom 16px, padding-left 0px, list-style disc
  - h3: h3 770×24 at (515, 595), "Heading 3", font 700 16px/24px Source Sans Pro ls -0.1px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 32px 0px 12px, margin-top 32px, margin-bottom 12px, padding-left 0px, list-style disc
  - h4: h4 770×20 at (515, 643), "Heading 4", font 700 14px/20px Source Sans Pro ls -0.1px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 24px 0px 8px, margin-top 24px, margin-bottom 8px, padding-left 0px, list-style disc
  - p: p 770×24 at (515, 671), "Paragraph", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 8px 0px 16px, margin-top 8px, margin-bottom 16px, padding-left 0px, list-style disc
  - ul: ul 770×56 at (515, 711), "Bullet item  Bullet item", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 0px 0px 0px 32px, margin 0px 0px 16px, margin-top 0px, margin-bottom 16px, padding-left 32px, list-style disc
  - ul li: li 738×24 at (547, 711), "Bullet item", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 0px 0px 0px 8px, margin 0px 0px 8px, margin-top 0px, margin-bottom 8px, padding-left 8px, list-style disc
  - ol: ol 770×24 at (515, 783), "Numbered item", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 0px 0px 0px 32px, margin 0px 0px 16px, margin-top 0px, margin-bottom 16px, padding-left 32px, list-style decimal
  - ol li: li 738×24 at (547, 783), "Numbered item", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 0px 0px 0px 8px, margin 0px 0px 8px, margin-top 0px, margin-bottom 8px, padding-left 8px, list-style decimal
  - pre: pre 770×30 at (515, 823), "code()", font 400 14px/16px Menlo, colour #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900), bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25), border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200), margin 0px 0px 16px, overflow-y hidden, margin-top 0px, margin-bottom 16px, padding-left 0px, list-style disc
  - code: code 768×18 at (516, 824), "code()", font 400 14px/16px Menlo, colour #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900), bg #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50), border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200), margin 0px 0px 10px, overflow-y hidden, margin-top 0px, margin-bottom 10px, padding-left 0px, list-style disc
  - table: table 770×83 at (515, 869), "Head     Cell", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 0px 0px 24px, margin-top 0px, margin-bottom 24px, padding-left 0px, list-style disc
  - th: th 769×41 at (515.5, 869.5), "Head", font 400 14px/20px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), border T:1px solid #404b5e (interactive-secondary-inactive, grey-800) \| R:1px solid #404b5e (interactive-secondary-inactive, grey-800) \| B:1px solid #404b5e (interactive-secondary-inactive, grey-800) \| L:1px solid #404b5e (interactive-secondary-inactive, grey-800), padding 4px 16px, margin-top 0px, margin-bottom 0px, padding-left 16px, list-style disc
  - td: td 769×41 at (515.5, 910.5), "Cell", font 400 14px/20px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), border T:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) \| R:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) \| B:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) \| L:1px solid #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50), padding 4px 16px, margin-top 0px, margin-bottom 0px, padding-left 16px, list-style disc
- sheetRules (49):
  - `.css-1wvi3yz strong { font-family: unset; }`
  - `.css-1wvi3yz h1, .css-1wvi3yz h1[data-heading-variant="h1semibold"] { font-size: var(--cds-font-size-title1-lg); line-height: var(--cds-line-height-title1-lg); font-family: var(--cds-font-family-source-sans-pro); font-weight: var(--cds-font-weight-600); letter-spacing: var(--cds-letter-spacing-125);`
  - `.css-1wvi3yz h1, .css-1wvi3yz h1[data-heading-variant="h1semibold"] { font-size: var(--cds-font-size-title1-xs); line-height: var(--cds-line-height-title1-xs); }`
  - `.css-1wvi3yz h1[data-heading-variant="h1regular"] { font-size: var(--cds-font-size-title1-lg); line-height: var(--cds-line-height-title1-lg); font-family: var(--cds-font-family-source-sans-pro); font-weight: var(--cds-font-weight-400); letter-spacing: var(--cds-letter-spacing-125); }`
  - `.css-1wvi3yz h1[data-heading-variant="h1regular"] { font-size: var(--cds-font-size-title1-xs); line-height: var(--cds-line-height-title1-xs); }`
  - `.css-1wvi3yz h2, .css-1wvi3yz h2[data-heading-variant="h2semibold"] { font-size: var(--cds-font-size-title2); line-height: var(--cds-line-height-title2); font-family: var(--cds-font-family-source-sans-pro); font-weight: var(--cds-font-weight-600); letter-spacing: var(--cds-letter-spacing-125); margi`
  - `.css-1wvi3yz h2[data-heading-variant="h2regular"] { font-size: var(--cds-font-size-title2); line-height: var(--cds-line-height-title2); font-family: var(--cds-font-family-source-sans-pro); font-weight: var(--cds-font-weight-400); letter-spacing: var(--cds-letter-spacing-125); }`
  - `.css-1wvi3yz h3, .css-1wvi3yz h3[data-heading-variant="h3bold"] { font-size: var(--cds-font-size-title3); line-height: var(--cds-line-height-title3); font-family: var(--cds-font-family-source-sans-pro); font-weight: var(--cds-font-weight-700); letter-spacing: var(--cds-letter-spacing-125); margin: v`
  - `.css-1wvi3yz h3[data-heading-variant="h3semibold"] { font-size: var(--cds-font-size-title3); line-height: var(--cds-line-height-title3); font-family: var(--cds-font-family-source-sans-pro); font-weight: var(--cds-font-weight-600); letter-spacing: var(--cds-letter-spacing-125); }`
  - `.css-1wvi3yz h4, .css-1wvi3yz h4[data-heading-variant="h4bold"] { font-size: var(--cds-font-size-title4); line-height: var(--cds-line-height-title4); font-family: var(--cds-font-family-source-sans-pro); font-weight: var(--cds-font-weight-700); letter-spacing: var(--cds-letter-spacing-125); margin: v`
  - `.css-1wvi3yz > :first-child, .css-1wvi3yz > :first-child h1, .css-1wvi3yz > :first-child h2, .css-1wvi3yz > :first-child h3, .css-1wvi3yz > :first-child h4 { margin-top: 0px !important; }`
  - `.css-1wvi3yz p, .css-1wvi3yz p[data-text-variant="body1"] { letter-spacing: 0px; font-size: var(--cds-font-size-body1); line-height: var(--cds-line-height-body1); font-family: var(--cds-font-family-source-sans-pro); font-weight: var(--cds-font-weight-400); margin-bottom: var(--cds-spacing-200); min-`
  - `.css-1wvi3yz p[data-text-variant="body2"] { letter-spacing: 0px; font-size: var(--cds-font-size-body2); line-height: var(--cds-line-height-body2); font-family: var(--cds-font-family-source-sans-pro); font-weight: var(--cds-font-weight-400); }`
  - `.css-1wvi3yz a { color: var(--cds-color-blue-800); text-decoration: underline; }`
  - `.css-1wvi3yz a:hover { color: var(--cds-color-blue-800); }`
  - `.css-1wvi3yz .cml-asset a { text-decoration: none; }`
  - `.css-1wvi3yz pre, .css-1wvi3yz code { border: 1px solid var(--cds-color-grey-200); border-radius: 0px; font-size: 0.875rem; line-height: 16px; margin-bottom: var(--cds-spacing-200); overflow-y: hidden; padding: 0px; }`
  - `.css-1wvi3yz code { position: relative; display: block; margin: 0px 0px 10px; word-break: break-all; overflow-wrap: break-word; background-color: var(--cds-color-grey-50); }`
  - `.css-1wvi3yz figure { margin: 0px !important; }`
  - `.css-1wvi3yz figure.selected { outline: 2px solid var(--cds-color-green-500); }`
  - `.css-1wvi3yz figure::selection { background: none; }`
  - `.css-1wvi3yz figure img { max-width: 100%; }`
  - `.css-1wvi3yz img { max-width: 100%; margin: 0 0 var(--cds-spacing-300) 0; }`
  - `.css-1wvi3yz img.cml-image-small { width: 180px; }`
  - `.css-1wvi3yz img.cml-image-fullWidth { width: 100%; }`
  - `.css-1wvi3yz ul { list-style-type: disc; }`
  - `.css-1wvi3yz ul ul, .css-1wvi3yz ul > li[aria-level="2"] { list-style-type: circle !important; }`
  - `.css-1wvi3yz ul ul ul, .css-1wvi3yz ul > li[aria-level="3"] { list-style-type: square !important; }`
  - `.css-1wvi3yz ul ul ul ul, .css-1wvi3yz ul > li[aria-level="4"] { list-style-type: disc !important; }`
  - `.css-1wvi3yz ul ul ul ul ul, .css-1wvi3yz ul > li[aria-level="5"] { list-style-type: circle !important; }`
  - `.css-1wvi3yz ol ol, .css-1wvi3yz ol > li[aria-level="2"] { list-style-type: lower-alpha !important; }`
  - `.css-1wvi3yz ol ol ol, .css-1wvi3yz ol > li[aria-level="3"] { list-style-type: lower-roman !important; }`
  - `.css-1wvi3yz ol ol ol ol, .css-1wvi3yz ol > li[aria-level="4"] { list-style-type: decimal !important; }`
  - `.css-1wvi3yz ol ol ol ol ol, .css-1wvi3yz ol > li[aria-level="5"] { list-style-type: lower-alpha !important; }`
  - `.css-1wvi3yz ol li[aria-posinset]::marker { content: attr(aria-posinset) '. '; }`
  - `.css-1wvi3yz ul, .css-1wvi3yz ol { letter-spacing: 0px; font-size: var(--cds-font-size-body1); line-height: var(--cds-line-height-body1); font-family: var(--cds-font-family-source-sans-pro); font-weight: var(--cds-font-weight-400); padding-left: var(--cds-spacing-400); margin-left: 0px; }`
  - `.css-1wvi3yz ul li, .css-1wvi3yz ol li { margin-bottom: var(--cds-spacing-100); padding-left: var(--cds-spacing-100); }`
  - `.css-1wvi3yz ul li ul, .css-1wvi3yz ol li ul, .css-1wvi3yz ul li ol, .css-1wvi3yz ol li ol { margin-top: var(--cds-spacing-100); }`
  - `.css-1wvi3yz ul li[aria-level="2"], .css-1wvi3yz ol li[aria-level="2"] { margin-left: 32px !important; }`
  - `.css-1wvi3yz ul li[aria-level="3"], .css-1wvi3yz ol li[aria-level="3"] { margin-left: 64px !important; }`
  - `.css-1wvi3yz ul li[aria-level="4"], .css-1wvi3yz ol li[aria-level="4"] { margin-left: 96px !important; }`
  - `.css-1wvi3yz ul li[aria-level="5"], .css-1wvi3yz ol li[aria-level="5"] { margin-left: 128px !important; }`
  - `.css-1wvi3yz ul li p, .css-1wvi3yz ol li p { margin-bottom: 0px; }`
  - `.css-1wvi3yz table { margin: 0 0 var(--cds-spacing-300) 0; width: 100%; border-collapse: collapse; }`
  - `.css-1wvi3yz table th, .css-1wvi3yz table td { letter-spacing: 0px; font-size: var(--cds-font-size-body2); line-height: var(--cds-line-height-body2); font-family: var(--cds-font-family-source-sans-pro); font-weight: var(--cds-font-weight-400); padding: var(--cds-spacing-50) var(--cds-spacing-200); t`
  - `.css-1wvi3yz table th, .css-1wvi3yz table thead td { border: 1px solid var(--cds-color-grey-800); }`
  - `.css-1wvi3yz table thead td p, .css-1wvi3yz table thead th p { font-weight: bold; }`
  - `.css-1wvi3yz table td { border: 1px solid var(--cds-color-grey-50); }`
  - `.css-1wvi3yz table p { margin-bottom: 0px; }`

### Reading: inline link

Underlined blue link with a 16px external-link icon after it.

Key `reading-link`. Read from `__m.q("[data-testid=cml-viewer] a", 0)` on item-reading.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 184.64×24 | = | = | = | = |
| Background | transparent (no token) | = | = | = | = |
| Outline | none | = | 1px auto #005fcc (no token) offset 1px | 1px auto #005fcc (no token) offset 1px | = |
| Painted layers |  | = | a 184.6x24.0 outline 1px auto rgb(0, 95, 204) offset 1px | a 184.6x24.0 outline 1px auto rgb(0, 95, 204) offset 1px | = |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | = | = | = | = |
| Text decoration | underline auto offset auto | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 16×16, fill none (no token), color #0056d2 (interactive-primary, feedback-informative, blue-800) | = | = | = | = |
| Crop | [png](../components/crops/signed-in/reading-link-default.png) | [png](../components/crops/signed-in/reading-link-hover.png) | [png](../components/crops/signed-in/reading-link-focus-visible.png) | [png](../components/crops/signed-in/reading-link-focus-visible-cds.png) | [png](../components/crops/signed-in/reading-link-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; no CDS focusVisible rule names this element; pressed: mouse button held down (released over the page ground).

Sub-measurements:

- icon: svg 16×16 at (683.6, 391), font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800), margin 0px 0px 0px 8px, fill none (no token), overflow-y hidden
- text: span 160.64×24 at (515, 387), "Data Science Math Skills", font 400 16px/24px Source Sans Pro, colour #0056d2 (interactive-primary, feedback-informative, blue-800)

Authored state rules that match this element (1, first 6; the rest are in the JSON):

- `.css-1wvi3yz a:hover { color: var(--cds-color-blue-800); }`

### Reading: "Go to next item" (large)

Primary large button (48px) at the end of the reading, followed by a green "Completed" check.

Key `reading-next-button`. Read from `__m.q("[data-testid=next-item]", 0)` on item-reading.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 154.36×48 | = | = | = | = |
| Padding | 12px (spacing-150) / 24px (spacing-300) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) | = | = | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Box shadow | #0056d2 0px 0px 0px 1px inset | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | button.cds-116.cds-button-disableElevation 154.4x48.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | button.cds-116.cds-button-disableElevation 154.4x48.0 bg #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | = | button.cds-116.cds-button-disableElevation 154.4x48.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-button-disableElevation 158.359pxx52px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-116.cds-button-disableElevation 154.4x48.0 bg #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 600 16px/24px, 0.16px (typography-title3, typography-action-primary) | = | = | = | = |
| Colour | #ffffff (neutral-primary-invert, neutral-background-primary, white-0) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/reading-next-button-default.png) | [png](../components/crops/signed-in/reading-next-button-hover.png) | [png](../components/crops/signed-in/reading-next-button-focus-visible.png) | [png](../components/crops/signed-in/reading-next-button-focus-visible-cds.png) | [png](../components/crops/signed-in/reading-next-button-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-1k9sfj8+.cds-buttonBase-focusVisible, button.css-1k9sfj8+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (9, first 6; the rest are in the JSON):

- `.css-1k9sfj8:focus { outline: none; }`
- `.css-1k9sfj8.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-1k9sfj8.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `@media (hover: hover) .css-1k9sfj8:hover { border-color: var(--cds-color-interactive-primary-hover); background-color: var(--cds-color-interactive-primary-hover); }`
- `.css-1k9sfj8:active { border-color: var(--cds-color-interactive-primary-pressed); background-color: var(--cds-color-interactive-primary-pressed); }`
- `.css-1k9sfj8:active.cds-button-disableElevation::after { content: unset; }`

### Reading: "Completed" marker

24px check and an h3 label in the success colour.

Key `reading-completed`. Read from `__m.q("[data-testid=completed-text]", 0)` on item-reading.

| Property | default |
| --- | --- |
| Size (w×h) | 127.03×24 |
| Background | transparent (no token) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Icon | 24×24, fill none (no token), color #197d12 (feedback-success, green-750) |
| Crop | [png](../components/crops/signed-in/reading-completed-default.png) |

Sub-measurements:

- icon: svg 24×24 at (685.4, 479), font 400 16px/24px Source Sans Pro, colour #197d12 (feedback-success, green-750), fill none (no token), overflow-y hidden
- label: h3 75.03×24 at (713.4, 479), "Completed", font 600 16px/20px Source Sans Pro ls -0.048px, colour #197d12 (feedback-success, green-750), margin 0px 24px 0px 4px

### Reading: feedback row (Like, Dislike, Report an issue)

Below a top rule, ghost buttons with 20px start icons.

Key `reading-feedback-row`. Read from `__m.q(".rc-ReadingItem", 0).children[1]` on item-reading.

| Property | default |
| --- | --- |
| Size (w×h) | 770×67 |
| Padding | 15px / 0 |
| Border | T: 1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) |
| Background | transparent (no token) |
| Painted layers | div 770.0x67.0 border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Icon | 20×20, fill none (no token), color #0056d2 (interactive-primary, feedback-informative, blue-800) |
| Crop | [png](../components/crops/signed-in/reading-feedback-row-default.png) |

Sub-measurements:

- buttons: 3 items, sizes 65.3x36.0 81.0x36.0 134.5x36.0, gaps dx 16 dx 16

### Item feedback text button (Like)

Ghost button with a 20px start icon, 36px tall.

Key `item-feedback-text-button`. Read from `__m.q("[data-testid=like-button] button", 0)` on item-reading.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 65.33×36 | = | = | = | = |
| Padding | 8px (spacing-100) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers |  | button.cds-116.cds-button-disableElevation 65.3x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | = | button.cds-116.cds-button-disableElevation 65.3x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-button-disableElevation 69.3281pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-116.cds-button-disableElevation 65.3x36.0 bg #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) r 8px |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Text decoration | none | underline auto offset auto | = | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Icon | 20×20, fill none (no token), color #0056d2 (interactive-primary, feedback-informative, blue-800) | = | = | = | = |
| Crop | [png](../components/crops/signed-in/item-feedback-text-button-default.png) | [png](../components/crops/signed-in/item-feedback-text-button-hover.png) | [png](../components/crops/signed-in/item-feedback-text-button-focus-visible.png) | [png](../components/crops/signed-in/item-feedback-text-button-focus-visible-cds.png) | [png](../components/crops/signed-in/item-feedback-text-button-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-6mzlst+.cds-buttonBase-focusVisible, button.css-6mzlst+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (10, first 6; the rest are in the JSON):

- `.css-6mzlst:focus { outline: none; }`
- `.css-6mzlst.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-6mzlst.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-6mzlst:hover { text-decoration: underline; color: var(--cds-color-interactive-primary-hover); background-color: var( --cds-color-interactive-background-primary-hover-weak ); }`
- `.css-6mzlst.cds-button-focusVisible { text-decoration: underline; background-color: var( --cds-color-interactive-background-primary-hover-weak ); color: var(--cds-color-interactive-primary-hover); }`
- `.css-6mzlst:active { text-decoration: underline; color: var(--cds-color-interactive-primary-pressed); background-color: var( --cds-color-interactive-background-primary-pressed-weak ); }`

### Item footer bar

The 68px footer that holds "Go to next item" at the bottom right of the item card.

Key `item-footer`. Read from `__m.q("[data-testid=course-frame-footer-wrapper]", 0)` on item-reading.

| Property | default |
| --- | --- |
| Size (w×h) | 1032×68 |
| Background | transparent (no token) |
| Painted layers | button.cds-116.cds-button-disableElevation 149.1x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/item-footer-default.png) |

## Assignment item

### Assignment: cover

Rounded bordered article: a blue-tinted header (type, title, primary action, AI button, illustration), then a white body with the result banner, "What to expect" card and Report an issue.

Key `assignment-cover`. Read from `__m.q("[data-testid=assignment-cover-redesign]", 0)` on item-assignment.

| Property | default |
| --- | --- |
| Size (w×h) | 900×522 |
| Border | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Radius | 16px (border-radius-200) |
| Background | transparent (no token) |
| Painted layers | article 900.0x522.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 16px; div 898.0x280.0 bg #e3eeff (callouts-background-primary-weak, emphasis-primary-background-weak, blue-50); button.cds-116.cds-button-disableElevation 112.5x48.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset; div 250.0x118.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/assignment-cover-default.png) |

Sub-measurements:

- header: div 898×280 at (451, 114), "Practice Assignment  Intro to Machine Le", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #e3eeff (callouts-background-primary-weak, emphasis-primary-background-weak, blue-50), padding 0px 392px 0px 0px, overflow-y hidden
- body: div 898×240 at (451, 394), "What to expect Due Sep 23, 11:59 PM +08 ", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 32px, gap 32px
- illustration: svg 0×0 at (0, 0), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), fill none (no token), overflow-y hidden

### Assignment: type eyebrow

"Practice Assignment" over the title.

Key `assignment-type`. Read from `__m.q("[data-testid=cover-page-header-assignment-type]", 0)` on item-assignment.

| Property | default |
| --- | --- |
| Size (w×h) | 391.17×24 |
| Background | transparent (no token) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #48546e (neutral-primary-weak, grey-750) |
| Crop | [png](../components/crops/signed-in/assignment-type-default.png) |

### Assignment: title

h1 in the cover header.

Key `assignment-title`. Read from `__m.q("[data-testid=cover-page-header] h1", 0)` on item-assignment.

| Property | default |
| --- | --- |
| Size (w×h) | 391.17×42 |
| Background | transparent (no token) |
| Font | Source Sans Pro 600 36px/42px, -0.18px (typography-title-medium) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/assignment-title-default.png) |

### Assignment: "Try again"

Primary large button (48px).

Key `assignment-primary`. Read from `__m.q("[data-testid=CoverPageActionButton]", 0)` on item-assignment.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 112.5×48 | = | = | = | = |
| Padding | 12px (spacing-150) / 24px (spacing-300) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) | = | = | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Box shadow | #0056d2 0px 0px 0px 1px inset | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | button.cds-116.cds-button-disableElevation 112.5x48.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | button.cds-116.cds-button-disableElevation 112.5x48.0 bg #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | = | button.cds-116.cds-button-disableElevation 112.5x48.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-button-disableElevation 116.5pxx52px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-116.cds-button-disableElevation 112.5x48.0 bg #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 600 16px/24px, 0.16px (typography-title3, typography-action-primary) | = | = | = | = |
| Colour | #ffffff (neutral-primary-invert, neutral-background-primary, white-0) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/assignment-primary-default.png) | [png](../components/crops/signed-in/assignment-primary-hover.png) | [png](../components/crops/signed-in/assignment-primary-focus-visible.png) | [png](../components/crops/signed-in/assignment-primary-focus-visible-cds.png) | [png](../components/crops/signed-in/assignment-primary-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-g3vqgc+.cds-buttonBase-focusVisible, button.css-g3vqgc+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (9, first 6; the rest are in the JSON):

- `.css-g3vqgc:focus { outline: none; }`
- `.css-g3vqgc.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-g3vqgc.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-g3vqgc:hover { border-color: var(--cds-color-interactive-primary-hover); background-color: var(--cds-color-interactive-primary-hover); }`
- `.css-g3vqgc:active { border-color: var(--cds-color-interactive-primary-pressed); background-color: var(--cds-color-interactive-primary-pressed); }`
- `.css-g3vqgc:active.cds-button-disableElevation::after { content: unset; }`

### Assignment: "Help me practice"

Ghost large button with a 24px sparkle start icon, dark label.

Key `assignment-ai-button`. Read from `__m.q("[aria-label^=\"Help me practice\"]", 0)` on item-assignment.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 177.8×48 | = | = | = | 174.24×47.04 |
| Padding | 12px (spacing-150) / 16px (spacing-200) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | 12px |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #002457 (callouts-background-primary-strong, emphasis-primary-background-xxstrong, blue-950) 0px 0px 0px 1px, #e3eeff (callouts-background-primary-weak, emphasis-primary-background-weak, blue-50) 0px 0px 0px 2px, radius 10px | = |
| Painted layers |  | button.cds-116.cds-button-disableElevation 177.8x48.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | = | button.cds-116.cds-button-disableElevation 177.8x48.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-button-disableElevation 181.797pxx52px r 10px shadow rgb(0, 36, 87) 0px 0px 0px 1px, rgb(227, 238, 255) 0px 0px 0px 2px | button.cds-116.cds-button-disableElevation 174.2x47.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 12px |
| Font | Source Sans Pro 600 16px/24px, 0.16px (typography-title3, typography-action-primary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Transform | none | = | = | = | matrix3d(0.98, 0, 0, 0, 0, 0.98, 0, 0, 0, 0, 0.98, 0, 0, 0, 0, 1) |
| Transition | none | = | = | = | all 0.2s cubic-bezier(0 |
| Cursor | pointer | = | = | = | = |
| Icon | 24×24, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | 23.52×23.52, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/assignment-ai-button-default.png) | [png](../components/crops/signed-in/assignment-ai-button-hover.png) | [png](../components/crops/signed-in/assignment-ai-button-focus-visible.png) | [png](../components/crops/signed-in/assignment-ai-button-focus-visible-cds.png) | [png](../components/crops/signed-in/assignment-ai-button-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-1yujlnc+.cds-buttonBase-focusVisible, button.css-1yujlnc+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (15, first 6; the rest are in the JSON):

- `.css-1yujlnc:focus { outline: none; }`
- `.css-1yujlnc.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-1yujlnc.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `@media (hover: hover) .css-1yujlnc:hover { text-decoration: underline; color: var(--cds-color-interactive-primary-hover); background-color: var( --cds-color-interactive-background-primary-hover-weak ); }`
- `.css-1yujlnc.cds-button-focusVisible { text-decoration: underline; background-color: var( --cds-color-interactive-background-primary-hover-weak ); color: var(--cds-color-interactive-primary-hover); }`
- `.css-1yujlnc:active { text-decoration: underline; color: var(--cds-color-interactive-primary-pressed); background-color: var( --cds-color-interactive-background-primary-pressed-weak ); }`

### Assignment: result banner

Blue-tinted box: "Submitted — results pending", two secondary-neutral buttons, and the submission time.

Key `assignment-result-banner`. Read from `__m.q("[data-testid=result-banner]", 0)` on item-assignment.

| Property | default |
| --- | --- |
| Size (w×h) | 552×116 |
| Padding | 12px (spacing-150) / 16px (spacing-200) |
| Gap | 8px (spacing-100) |
| Radius | 8px (border-radius-100) |
| Background | #e3eeff (callouts-background-primary-weak, emphasis-primary-background-weak, blue-50) |
| Painted layers | div 552.0x116.0 bg #e3eeff (callouts-background-primary-weak, emphasis-primary-background-weak, blue-50) r 8px; button.cds-116.cds-button-disableElevation 134.1x36.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px shadow rgb(193, 203, 219) 0px 0px 0px 1px inset; button.cds-116.cds-button-disableElevation 120.5x36.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px shadow rgb(193, 203, 219) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/assignment-result-banner-default.png) |

Sub-measurements:

- heading: p 520×20 at (499, 438), "Submitted — results pending", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- note: p 520×20 at (499, 510), "Submitted Feb 25, 12:36 AM +08.", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), gap 8px

### Assignment: "View submission" (secondary neutral)

White outlined button with a dark label, 36px tall.

Key `assignment-secondary-button`. Read from `__m.q("[data-testid=view-submission-button]", 0)` on item-assignment.

| Property | default | hover | focus-visible | focus-visible-cds | pressed | disabled | disabled-hover |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 134.06×36 | = | = | = | = | 120.45×36 | 120.45×36 |
| Padding | 8px (spacing-100) / 16px (spacing-200) | = | = | = | = | 8px (spacing-100) / 16px (spacing-200) | = |
| Radius | 8px (border-radius-100) | = | = | = | = | 8px (border-radius-100) | = |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) | #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) |
| Box shadow | #c1cbdb 0px 0px 0px 1px inset | #8495b0 0px 0px 0px 1px inset | = | #8495b0 0px 0px 0px 1px inset | #8495b0 0px 0px 0px 1px inset | #c1cbdb 0px 0px 0px 1px inset | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = | none | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |  | = |
| Painted layers | button.cds-116.cds-button-disableElevation 134.1x36.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px shadow rgb(193, 203, 219) 0px 0px 0px 1px inset | button.cds-116.cds-button-disableElevation 134.1x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgb(132, 149, 176) 0px 0px 0px 1px inset | = | button.cds-116.cds-button-disableElevation 134.1x36.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px shadow rgb(132, 149, 176) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-button-disableElevation 138.062pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-116.cds-button-disableElevation 134.1x36.0 bg #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) r 8px shadow rgb(132, 149, 176) 0px 0px 0px 1px inset | button.cds-116.cds-button-disableElevation 120.5x36.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px shadow rgb(193, 203, 219) 0px 0px 0px 1px inset | button.cds-116.cds-button-disableElevation 120.5x36.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px shadow rgb(193, 203, 219) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = | = | = | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | = | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | #1c2026 (interactive-secondary-pressed, interactive-secondary-selected, grey-950) | #a7b4c9 (neutral-disabled-strong, grey-300) | #a7b4c9 (neutral-disabled-strong, grey-300) |
| Cursor | pointer | = | = | = | = | default | default |
| Crop | [png](../components/crops/signed-in/assignment-secondary-button-default.png) | [png](../components/crops/signed-in/assignment-secondary-button-hover.png) | [png](../components/crops/signed-in/assignment-secondary-button-focus-visible.png) | [png](../components/crops/signed-in/assignment-secondary-button-focus-visible-cds.png) | [png](../components/crops/signed-in/assignment-secondary-button-pressed.png) | [png](../components/crops/signed-in/assignment-secondary-button-disabled.png) | [png](../components/crops/signed-in/assignment-secondary-button-disabled-hover.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-1lrggq7+.cds-buttonBase-focusVisible, button.css-1lrggq7+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground); disabled: at rest, captured disabled; disabled-hover: mouse hover.

Authored state rules that match this element (10, first 6; the rest are in the JSON):

- `.css-1lrggq7:focus { outline: none; }`
- `.css-1lrggq7.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-1lrggq7.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `@media (hover: hover) .css-1lrggq7:hover { color: var(--cds-color-interactive-secondary-hover); box-shadow: inset 0 0 0 1px var(--cds-color-neutral-stroke-primary); background-color: var( --cds-color-interactive-background-primary-hover-weak ); }`
- `.css-1lrggq7.cds-button-focusVisible { color: var(--cds-color-interactive-secondary-hover); box-shadow: inset 0 0 0 1px var(--cds-color-neutral-stroke-primary); background-color: var( --cds-color-interactive-background-secondary-hover-weak ); }`
- `.css-1lrggq7:active { color: var(--cds-color-interactive-secondary-pressed); box-shadow: inset 0 0 0 1px var(--cds-color-neutral-stroke-primary); background-color: var( --cds-color-interactive-background-secondary-selected-weak ); }`

### Assignment: "What to expect" card

Bordered card: heading, then rows of a 20px icon and a line of text.

Key `assignment-expect-card`. Read from `__m.q("[data-testid=what-to-expect-card]", 0)` on item-assignment.

| Property | default |
| --- | --- |
| Size (w×h) | 250×118 |
| Padding | 16px (spacing-200) |
| Gap | 8px (spacing-100) |
| Border | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Radius | 8px (border-radius-100) |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Painted layers | div 250.0x118.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Icon | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/assignment-expect-card-default.png) |

Sub-measurements:

- heading: h2 216×20 at (1084, 443), "What to expect", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- rows: 2 items, sizes 216.0x24.0 216.0x24.0, gaps dy 8 (pitch 32)
- icon: svg 20×20 at (1084, 473), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 2px 0px 0px, fill none (no token), overflow-y hidden
- text: span 168.06×24 at (1112, 471), "Due Sep 23, 11:59 PM +08", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

### Assignment: "Report an issue"

Ghost-secondary button with a 20px flag start icon.

Key `assignment-report`. Read from `__m.q("[data-testid=rc-CoverPageContainer] [aria-label=\"Report an issue\"]", 0)` on item-assignment.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 134.48×36 | = | = | = | = |
| Padding | 8px (spacing-100) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) | = | #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) | #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers |  | button.cds-116.cds-button-disableElevation 134.5x36.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px | = | button.cds-116.cds-button-disableElevation 134.5x36.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-116.cds-button-disableElevation 138.484pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-116.cds-button-disableElevation 134.5x36.0 bg #e9eef7 (emphasis-neutral-background-weak, interactive-background-secondary-pressed-weak, grey-50) r 8px |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | = | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | #1c2026 (interactive-secondary-pressed, interactive-secondary-selected, grey-950) |
| Text decoration | none | underline auto offset auto | = | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Icon | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | 20×20, fill none (no token), color #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | = | 20×20, fill none (no token), color #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | 20×20, fill none (no token), color #1c2026 (interactive-secondary-pressed, interactive-secondary-selected, grey-950) |
| Crop | [png](../components/crops/signed-in/assignment-report-default.png) | [png](../components/crops/signed-in/assignment-report-hover.png) | [png](../components/crops/signed-in/assignment-report-focus-visible.png) | [png](../components/crops/signed-in/assignment-report-focus-visible-cds.png) | [png](../components/crops/signed-in/assignment-report-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-lco7kh+.cds-buttonBase-focusVisible, button.css-lco7kh+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (10, first 6; the rest are in the JSON):

- `.css-lco7kh:focus { outline: none; }`
- `.css-lco7kh.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-lco7kh.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-lco7kh:hover { text-decoration: underline; background-color: var( --cds-color-interactive-background-secondary-hover-weak ); color: var(--cds-color-interactive-secondary-hover); }`
- `.css-lco7kh.cds-button-focusVisible { text-decoration: underline; background-color: var( --cds-color-interactive-background-secondary-hover-weak ); color: var(--cds-color-interactive-secondary-hover); }`
- `.css-lco7kh:active { text-decoration: underline; color: var(--cds-color-interactive-secondary-pressed); background-color: var( --cds-color-interactive-background-secondary-pressed-weak ); }`

## My Learning

### My Learning: greeting

64px navy avatar with the initial, "Good morning, Learner" (h1), and the career goal line with an underlined link and an "Edit goal" ghost button. An isometric illustration sits at the right.

Key `ml-greeting`. Read from `__m.q("main h1", 0).parentElement.parentElement` on my-learning.

| Property | default |
| --- | --- |
| Size (w×h) | 1104.64×80 |
| Background | transparent (no token) |
| Painted layers | div.cds-Avatar-initial 64.0x64.0 bg #002457 (callouts-background-primary-strong, emphasis-primary-background-xxstrong, blue-950) r 50% |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/ml-greeting-default.png) |

Sub-measurements:

- avatar: div 64×64 at (48, 123), "L", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), radius 50%, overflow-y hidden
- initial: span 16.08×40 at (72, 135), "L", font 600 32px/40px Source Sans Pro, colour #ffffff (neutral-primary-invert, neutral-background-primary, white-0)
- heading: h1 812.47×36 at (128, 125), "Good morning, Learner", font 600 30px/36px Source Sans Pro ls -0.15px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), overflow-y hidden
- goal: span 581.19×22 at (128, 162), "Your career goal is to explore topics ou", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- illustration: div 239.36×199.98 at (1152.6, 81), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), margin 0px 0px -52px 16px

### My Learning: career goal link

Underlined dark link inside the sentence.

Key `ml-career-goal-link`. Read from `__m.q("[data-testid=career-goal-message] a", 0)` on my-learning.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 207.47×22 | = | = | = | = |
| Radius | 0 | = | = | 4px (border-radius-50) | = |
| Background | transparent (no token) | = | = | = | = |
| Box shadow | none | = | = | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Painted layers |  | = | = | a.cds-179.cds-173 207.5x22.0 r 4px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px outline 1px solid rgba(0, 0, 0, 0) offset 2px | = |
| Font | Source Sans Pro 600 16px/24px, -0.048px (typography-title3, typography-action-primary) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = |
| Text decoration | underline auto offset auto | none | = | = | none |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/ml-career-goal-link-default.png) | [png](../components/crops/signed-in/ml-career-goal-link-hover.png) | [png](../components/crops/signed-in/ml-career-goal-link-focus-visible.png) | [png](../components/crops/signed-in/ml-career-goal-link-focus-visible-cds.png) | [png](../components/crops/signed-in/ml-career-goal-link-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-1r6a78y+.cds-link-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (7, first 6; the rest are in the JSON):

- `.cds-175:hover { text-decoration: underline; }`
- `.cds-175:hover { text-decoration: underline; }`
- `.css-1r6a78y:hover { color: var(--cds-color-interactive-primary-hover); text-decoration: none; }`
- `.css-1r6a78y.cds-link-focusVisible { color: var(--cds-color-interactive-primary-hover); }`
- `.css-1r6a78y:focus { outline: none; }`
- `.css-1r6a78y.cds-link-focusVisible { outline: transparent solid 1px; outline-offset: 2px; border-radius: var(--cds-border-radius-50); text-decoration: underline; box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-`

### My Learning: "Edit goal"

Ghost button with no padding, blue label.

Key `ml-edit-goal`. Read from `__m.q("[data-testid=career-goal-message]", 0).nextElementSibling` on my-learning.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 53.64×24 | = | = | = | = |
| Padding | 4px (spacing-50) 0 0 0 | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers |  | a.cds-113.cds-button-disableElevation 53.6x24.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | = | a.cds-113.cds-button-disableElevation 53.6x24.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; a::after.cds-113.cds-button-disableElevation 57.6406pxx28px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | a.cds-113.cds-button-disableElevation 53.6x24.0 bg #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) r 8px |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Text decoration | none | underline auto offset auto | underline auto offset auto | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/ml-edit-goal-default.png) | [png](../components/crops/signed-in/ml-edit-goal-hover.png) | [png](../components/crops/signed-in/ml-edit-goal-focus-visible.png) | [png](../components/crops/signed-in/ml-edit-goal-focus-visible-cds.png) | [png](../components/crops/signed-in/ml-edit-goal-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-1ytvykv+.cds-buttonBase-focusVisible, a.css-1ytvykv+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (10, first 6; the rest are in the JSON):

- `.css-1ytvykv:focus { outline: none; }`
- `.css-1ytvykv.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-1ytvykv.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `@media (hover: hover) .css-1ytvykv:hover { text-decoration: underline; color: var(--cds-color-interactive-primary-hover); background-color: var( --cds-color-interactive-background-primary-hover-weak ); }`
- `.css-1ytvykv.cds-button-focusVisible { text-decoration: underline; background-color: var( --cds-color-interactive-background-primary-hover-weak ); color: var(--cds-color-interactive-primary-hover); }`
- `.css-1ytvykv:active { text-decoration: underline; color: var(--cds-color-interactive-primary-pressed); background-color: var( --cds-color-interactive-background-primary-pressed-weak ); }`

### My Learning: tab bar

In Progress / Completed / Certificates: text tabs over a full-width 1px rule; the selected tab has a 4px dark indicator.

Key `ml-tabs`. Read from `__m.q("[data-testid=tabs-root]", 0)` on my-learning.

| Property | default |
| --- | --- |
| Size (w×h) | 1344×49 |
| Border | B: 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Background | transparent (no token) |
| Painted layers | div.cds-209 1344.0x49.0 border B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200); span.cds-230.cds-232 78.4x4.0 bg #0d0f12 (emphasis-neutral-background-xxstrong, neutral-primary, grey-975) r 2px 2px 0px 0px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/ml-tabs-default.png) |

Sub-measurements:

- list: div 1344×48 at (48, 293), "In Progress Completed Certificates", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- scroller: div 1347×51 at (45, 290), "In Progress Completed Certificates", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), padding 3px 0px 0px 3px, margin -3px 0px 0px -3px, overflow-y auto
- indicator: span 78.36×4 at (48, 337), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #0d0f12 (emphasis-neutral-background-xxstrong, neutral-primary, grey-975), radius 2px 2px 0px 0px, margin -4px 0px 0px
- tabs: 3 items, sizes 78.4x48.0 73.8x48.0 75.4x48.0, gaps dx 24 dx 24

### My Learning: tab

Unselected tab ("Completed"); the selected one is "In Progress".

Key `ml-tab`. Read from `__m.q("[role=tab][aria-selected=false]", 0)` on my-learning; `__m.q("[role=tab][aria-selected=false]", 0)` on my-learning-completed.

| Property | default | hover | focus-visible | focus-visible-cds | pressed | selected | selected-hover | selected-focus-visible | selected-focus-visible-cds | selected-pressed | selected-completed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 73.81×48 | = | = | = | = | 78.36×48 | 78.36×48 | 78.36×48 | 78.36×48 | 78.36×48 | 76.91×48 |
| Padding | 12px (spacing-150) / 0 | = | = | = | = | 12px (spacing-150) / 0 | = | = | = | = | 12px (spacing-150) / 0 |
| Radius | 0 | 4px (border-radius-50) | = | 8px (border-radius-100) | 4px (border-radius-50) | 0 | 4px (border-radius-50) | = | 8px (border-radius-100) | 4px (border-radius-50) | 0 |
| Background | transparent (no token) | = | = | = | = | transparent (no token) | = | = | = | = | transparent (no token) |
| Outline | none | = | = | 1px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset 2px | = | none | = | = | 1px solid #804ee4 (interactive-stroke-primary-focus, purple-600) offset 2px | = | none |
| Pseudo element |  | ::after inset 44px 0px 0px 0px, bg #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 2px 2px 0px 0px | = | = | ::after inset 44px 0px 0px 0px, bg #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 2px 2px 0px 0px |  | ::after inset 44px 0px 0px 0px, bg #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 2px 2px 0px 0px | = | = | ::after inset 44px 0px 0px 0px, bg #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 2px 2px 0px 0px |  |
| Painted layers |  | button::after.cds-113.cds-220 73.8125pxx4px bg #c1cbdb (neutral-stroke-primary-weak, grey-200) r 2px 2px 0px 0px | = | button.cds-113.cds-220 73.8x48.0 r 8px outline 1px solid rgb(128, 78, 228) offset 2px | button::after.cds-113.cds-220 73.8125pxx4px bg #c1cbdb (neutral-stroke-primary-weak, grey-200) r 2px 2px 0px 0px |  | button::after.cds-113.cds-220 78.3594pxx4px bg #c1cbdb (neutral-stroke-primary-weak, grey-200) r 2px 2px 0px 0px | = | button.cds-113.cds-220 78.4x48.0 r 8px outline 1px solid rgb(128, 78, 228) offset 2px | button::after.cds-113.cds-220 78.3594pxx4px bg #c1cbdb (neutral-stroke-primary-weak, grey-200) r 2px 2px 0px 0px |  |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = | Source Sans Pro 600 16px/24px, 0.16px (typography-title3, typography-action-primary) | Source Sans Pro 600 16px/24px, 0.16px (typography-title3, typography-action-primary) | Source Sans Pro 600 16px/24px, 0.16px (typography-title3, typography-action-primary) | Source Sans Pro 600 16px/24px, 0.16px (typography-title3, typography-action-primary) | Source Sans Pro 600 16px/24px, 0.16px (typography-title3, typography-action-primary) | Source Sans Pro 600 16px/24px, 0.16px (typography-title3, typography-action-primary) |
| Colour | #404b5e (interactive-secondary-inactive, grey-800) | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | = | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Cursor | pointer | = | = | = | = | pointer | = | = | = | = | pointer |
| Crop | [png](../components/crops/signed-in/ml-tab-default.png) | [png](../components/crops/signed-in/ml-tab-hover.png) | [png](../components/crops/signed-in/ml-tab-focus-visible.png) | [png](../components/crops/signed-in/ml-tab-focus-visible-cds.png) | [png](../components/crops/signed-in/ml-tab-pressed.png) | [png](../components/crops/signed-in/ml-tab-selected.png) | [png](../components/crops/signed-in/ml-tab-selected-hover.png) | [png](../components/crops/signed-in/ml-tab-selected-focus-visible.png) | [png](../components/crops/signed-in/ml-tab-selected-focus-visible-cds.png) | [png](../components/crops/signed-in/ml-tab-selected-pressed.png) | [png](../components/crops/signed-in/ml-tab-selected-completed.png) |

How: hover: mouse hover; focus-visible: keyboard: Shift keydown, then focus(); focus-visible-cds: keyboard: Shift keydown, then focus(); emulated CDS JS: added button.css-xuc6go+.cds-tab-focusVisible; pressed: mouse button held down (released over the page ground); selected: at rest, captured selected; selected-hover: mouse hover; selected-focus-visible: keyboard: focus(), Shift+Tab, Tab; selected-focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-xuc6go+.cds-tab-focusVisible; selected-pressed: mouse button held down (released over the page ground); selected-completed: at rest, captured selected-completed.

Sub-measurements:

- label: span 73.81×24 at (150.4, 305), "Completed", font 400 16px/24px Source Sans Pro, colour #404b5e (interactive-secondary-inactive, grey-800)

Sub-measurements, selected:

- label: span 78.36×24 at (48, 305), "In Progress", font 600 16px/24px Source Sans Pro ls 0.16px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

Authored state rules that match this element (5, first 6; the rest are in the JSON):

- `.css-xuc6go:focus { outline: none; }`
- `.css-xuc6go:hover { border-radius: var(--cds-border-radius-50); text-decoration: none; color: var(--cds-color-interactive-secondary-hover); }`
- `.css-xuc6go:hover::after { content: ""; position: absolute; bottom: 0px; left: 0px; width: 100%; height: var(--cds-spacing-50); border-radius: var(--cds-border-radius-25) var(--cds-border-radius-25) 0 0; background-color: var(--cds-color-neutral-stroke-primary`
- `.css-xuc6go.cds-tab-focusVisible { border-width: medium; border-style: none; border-color: currentcolor; border-image: none; border-radius: var(--cds-border-radius-100); color: var(--cds-color-interactive-secondary-hover); outline: solid 1px var(--cds-color-in`
- `@media (forced-colors: active) .css-xuc6go.cds-tab-focusVisible { text-decoration: underline; }`

### My Learning: programme (specialization) header

30px partner logo, the programme title (h3) and "Offered by ..." above its card.

Key `ml-program-header`. Read from `__m.q(".rc-PathwayCardModule .pathway-card-title", 0)` on my-learning.

| Property | default |
| --- | --- |
| Size (w×h) | 885.33×34 |
| Gap | 8px (spacing-100) |
| Background | transparent (no token) |
| Painted layers | div.cds-Avatar-base.cds-Avatar-organization 30.0x30.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 4px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Transition | all 0.25s ease-in-out |
| Crop | [png](../components/crops/signed-in/ml-program-header-default.png) |

Sub-measurements:

- logo: div 30×30 at (48, 368), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 4px, padding 2px
- title: h3 200.23×20 at (88, 366), "Google Cybersecurity", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- offered: p 200.23×14 at (88, 386), "Offered by Example University", font 400 16px/14px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

### My Learning: programme card

Bordered rounded card holding one row per course in the programme, split by 1px rules.

Key `ml-program-card`. Read from `__m.q(".pathway-card-container", 0)` on my-learning.

| Property | default |
| --- | --- |
| Size (w×h) | 885.33×760 |
| Border | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Radius | 16px (border-radius-200) |
| Background | transparent (no token) |
| Painted layers | div.pathway-card-container 885.3x760.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 16px; div.cds-9.rc-PathwayCardCourseItemModule 883.3x110.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0); div 425.7x8.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| R:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| B:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| L:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) r 8px; div 12.7x8.0 bg #6f29e5 (emphasis-quaternary-background-strong, purple-750) r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Transition | all 0.25s ease-in-out |
| Crop | [png](../components/crops/signed-in/ml-program-card-default.png) |

Sub-measurements:

- rows: 9 items, sizes 883.3x110.0 883.3x81.0 883.3x81.0 883.3x81.0, gaps dy 0 (pitch 110) dy 0 (pitch 81) dy 0 (pitch 81) dy 0 (pitch 81) dy 0 (pitch 81) dy 0 (pitch 81) dy 0 (pitch 81) dy 0 (pitch 81)

### My Learning: programme course row

Title link, then "Course 2 of 9 · Not started"; the overflow button at the right. The first row also has a progress bar and the next-item card.

Key `ml-course-row`. Read from `__m.q(".rc-PathwayCardCourseItemModule", 1)` on my-learning.

| Property | default | hover | in-progress | in-progress-hover |
| --- | --- | --- | --- | --- |
| Size (w×h) | 883.33×81 | = | 883.33×110 | 883.33×110 |
| Padding | 16px (spacing-200) | = | 16px (spacing-200) | = |
| Border | T: 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) | = | none | none |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) | = | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) | = |
| Painted layers | div.cds-9.rc-PathwayCardCourseItemModule 883.3x81.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200); button.cds-113.cds-iconButton-medium 48.0x48.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset; button.cds-113.cds-iconButton-medium 0.0x0.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | div.cds-9.rc-PathwayCardCourseItemModule 883.3x81.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200); a 235.1x20.0 border B:1px solid #0d0f12 (neutral-primary, interactive-secondary, grey-975); span 235.1x23.0 border B:1px solid #0d0f12 (neutral-primary, interactive-secondary, grey-975); button.cds-113.cds-iconButton-medium 48.0x48.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | div.cds-9.rc-PathwayCardCourseItemModule 883.3x110.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0); div 425.7x8.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| R:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| B:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| L:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) r 8px; div 12.7x8.0 bg #6f29e5 (emphasis-quaternary-background-strong, purple-750) r 8px; section 350.0x78.0 border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| R:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| B:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| L:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) r 12px | div.cds-9.rc-PathwayCardCourseItemModule 883.3x110.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0); div 425.7x8.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| R:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| B:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| L:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) r 8px; div 12.7x8.0 bg #6f29e5 (emphasis-quaternary-background-strong, purple-750) r 8px; section 350.0x78.0 border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| R:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| B:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| L:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) r 12px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = |
| Crop | [png](../components/crops/signed-in/ml-course-row-default.png) | [png](../components/crops/signed-in/ml-course-row-hover.png) | [png](../components/crops/signed-in/ml-course-row-in-progress.png) | [png](../components/crops/signed-in/ml-course-row-in-progress-hover.png) |

How: hover: mouse hover; in-progress: at rest, captured in-progress; in-progress-hover: mouse hover.

Sub-measurements:

- left: div 425.66×44 at (65, 429), "Play It Safe: Manage Security Risks  Cou", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- title: span 235.14×22 at (65, 428), "Play It Safe: Manage Security Risks", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- meta: p 74.78×20 at (65, 453), "Course 2 of 9", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- dot: p 3.5×20 at (143.8, 453), "·", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

Sub-measurements, in-progress:

- left: div 425.66×64 at (65, 418), "Foundations of Cybersecurity  Course 1 o", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- title: span 200.03×22 at (65, 417), "Foundations of Cybersecurity", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- meta: p 74.78×20 at (65, 442), "Course 1 of 9", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- dot: p 3.5×20 at (143.8, 442), "·", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

### My Learning: course title link

Course name as a link, bold, dark, no underline at rest.

Key `ml-course-title-link`. Read from `__m.q(".rc-PathwayCourseMetadata a", 0)` on my-learning.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 374.8×20 | = | = | = | = |
| Border | none | B: 1px solid #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | B: 1px solid #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Background | transparent (no token) | = | = | = | = |
| Outline | none | = | 1px auto #005fcc (no token) offset 1px | 1px auto #005fcc (no token) offset 1px | = |
| Painted layers |  | a 374.8x20.0 border B:1px solid #0d0f12 (neutral-primary, interactive-secondary, grey-975); span 200.0x23.0 border B:1px solid #0d0f12 (neutral-primary, interactive-secondary, grey-975) | a 374.8x20.0 outline 1px auto rgb(0, 95, 204) offset 1px | a 374.8x20.0 outline 1px auto rgb(0, 95, 204) offset 1px | a 374.8x20.0 border B:1px solid #0d0f12 (neutral-primary, interactive-secondary, grey-975); span 200.0x23.0 border B:1px solid #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | = | = | = | = |
| Text decoration | none | = | underline auto offset auto | underline auto offset auto | = |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/ml-course-title-link-default.png) | [png](../components/crops/signed-in/ml-course-title-link-hover.png) | [png](../components/crops/signed-in/ml-course-title-link-focus-visible.png) | [png](../components/crops/signed-in/ml-course-title-link-focus-visible-cds.png) | [png](../components/crops/signed-in/ml-course-title-link-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; no CDS focusVisible rule names this element; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (1, first 6; the rest are in the JSON):

- `.css-8y02kk:hover { text-decoration: none; border-bottom: 1px solid var(--cds-color-neutral-primary); }`

### My Learning: progress bar

Pill track with a purple fill ("3% complete"); 8px tall.

Key `ml-progress-bar`. Read from `__m.q("[data-testid=progress-bar]", 0)` on my-learning.

| Property | default | course-card |
| --- | --- | --- |
| Size (w×h) | 12.7×8 | 38.13×8 |
| Radius | 8px (border-radius-100) | 8px (border-radius-100) |
| Background | #6f29e5 (emphasis-quaternary-background-strong, purple-750) | #6f29e5 (emphasis-quaternary-background-strong, purple-750) |
| Painted layers | div 12.7x8.0 bg #6f29e5 (emphasis-quaternary-background-strong, purple-750) r 8px | div 38.1x8.0 bg #6f29e5 (emphasis-quaternary-background-strong, purple-750) r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/ml-progress-bar-default.png) | [png](../components/crops/signed-in/ml-progress-bar-course-card.png) |

How: course-card: at rest, captured course-card.

Sub-measurements:

- track: div 425.66×8 at (65, 445), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25), border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| R:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| B:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| L:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25), radius 8px, margin 12px 0px 0px
- trackPaint: node: div; size: 425.7x8.0; bg: rgb(242, 245, 250); radius: 8px; border: 1px solid rgb(242, 245, 250) ; node: div; size: 12.7x8.0; bg: rgb(111, 41, 229); radius: 8px

Sub-measurements, course-card:

- track: div 425.66×8 at (65, 445), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25), border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| R:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| B:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| L:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25), radius 8px, margin 12px 0px 0px
- trackPaint: node: div; size: 425.7x8.0; bg: rgb(242, 245, 250); radius: 8px; border: 1px solid rgb(242, 245, 250) ; node: div; size: 38.1x8.0; bg: rgb(111, 41, 229); radius: 8px

### My Learning: next-item inset card

Bordered inset card inside a course row: next item title, a 16px type icon and "Reading (4 minutes)", and the Resume / Get started button.

Key `ml-next-item-card`. Read from `__m.q(".rc-PathwayCardCourseItemModule section", 0)` on my-learning.

| Property | default | hover |
| --- | --- | --- |
| Size (w×h) | 350×78 | = |
| Padding | 16px (spacing-200) | = |
| Gap | 16px (spacing-200) | = |
| Border | 1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) | = |
| Radius | 12px | = |
| Background | transparent (no token) | = |
| Painted layers | section 350.0x78.0 border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| R:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| B:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| L:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) r 12px; a.cds-113.cds-button-disableElevation 80.8x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | = |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = |
| Icon | 16×16, fill none (no token), color #48546e (neutral-primary-weak, grey-750) | = |
| Crop | [png](../components/crops/signed-in/ml-next-item-card-default.png) | [png](../components/crops/signed-in/ml-next-item-card-hover.png) |

How: hover: mouse hover.

Sub-measurements:

- title: span 136.3×20 at (523.7, 428), "Course 1 overview", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), overflow-y hidden
- icon: svg 16×16 at (523.7, 454), font 400 16px/24px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750), fill none (no token), overflow-y hidden
- meta: p 116.3×20 at (543.7, 452), "Reading (4 minutes)", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- duration: span 65.92×20 at (594, 452), "(4 minutes)", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- button: a 80.81×36 at (758.8, 432), "Resume", font 600 14px/20px Source Sans Pro ls 0.14px, colour #ffffff (neutral-primary-invert, neutral-background-primary, white-0), bg #0056d2 (interactive-primary, feedback-informative, blue-800), radius 8px, padding 8px 16px, shadow #0056d2 0px 0px 0px 1px inset

### My Learning: Resume / Get started

Primary button, 36px tall.

Key `ml-resume-button`. Read from `__m.q("a[aria-label^=\"Resume\"]", 0)` on my-learning.

| Property | default | hover | focus-visible | focus-visible-cds | pressed | get-started |
| --- | --- | --- | --- | --- | --- | --- |
| Size (w×h) | 80.81×36 | = | = | = | = | 99.94×36 |
| Padding | 8px (spacing-100) / 16px (spacing-200) | = | = | = | = | 8px (spacing-100) / 16px (spacing-200) |
| Radius | 8px (border-radius-100) | = | = | = | = | 8px (border-radius-100) |
| Background | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) | = | = | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) | #0056d2 (interactive-primary, feedback-informative, blue-800) |
| Box shadow | #0056d2 0px 0px 0px 1px inset | = | = | = | = | #0056d2 0px 0px 0px 1px inset |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = | none |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |  |
| Painted layers | a.cds-113.cds-button-disableElevation 80.8x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | a.cds-113.cds-button-disableElevation 80.8x36.0 bg #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | = | a.cds-113.cds-button-disableElevation 80.8x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; a::after.cds-113.cds-button-disableElevation 84.8125pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | a.cds-113.cds-button-disableElevation 80.8x36.0 bg #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | a.cds-113.cds-button-disableElevation 99.9x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = | = | = | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) |
| Colour | #ffffff (neutral-primary-invert, neutral-background-primary, white-0) | = | = | = | = | #ffffff (neutral-primary-invert, neutral-background-primary, white-0) |
| Text decoration | none | underline auto offset auto | underline auto offset auto | underline auto offset auto | underline auto offset auto | none |
| Cursor | pointer | = | = | = | = | pointer |
| Crop | [png](../components/crops/signed-in/ml-resume-button-default.png) | [png](../components/crops/signed-in/ml-resume-button-hover.png) | [png](../components/crops/signed-in/ml-resume-button-focus-visible.png) | [png](../components/crops/signed-in/ml-resume-button-focus-visible-cds.png) | [png](../components/crops/signed-in/ml-resume-button-pressed.png) | [png](../components/crops/signed-in/ml-resume-button-get-started.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-18xaltk+.cds-buttonBase-focusVisible, a.css-18xaltk+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground); get-started: at rest, captured get-started.

Authored state rules that match this element (9, first 6; the rest are in the JSON):

- `.css-18xaltk:focus { outline: none; }`
- `.css-18xaltk.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-18xaltk.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `@media (hover: hover) .css-18xaltk:hover { border-color: var(--cds-color-interactive-primary-hover); background-color: var(--cds-color-interactive-primary-hover); }`
- `.css-18xaltk:active { border-color: var(--cds-color-interactive-primary-pressed); background-color: var(--cds-color-interactive-primary-pressed); }`
- `.css-18xaltk:active.cds-button-disableElevation::after { content: unset; }`

### My Learning: overflow "…" button

Ghost medium icon button, 48x48 with a 24px blue dots icon.

Key `ml-overflow-button`. Read from `__m.q("[data-e2e=dropdown-menu]", 0)` on my-learning.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 48×48 | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) |
| Box shadow | transparent 0px 0px 0px 1px inset | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | button.cds-113.cds-iconButton-medium 48.0x48.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | button.cds-113.cds-iconButton-medium 48.0x48.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | = | button.cds-113.cds-iconButton-medium 48.0x48.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-113.cds-iconButton-medium 52pxx52px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-113.cds-iconButton-medium 48.0x48.0 bg #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Cursor | pointer | = | = | = | = |
| Icon | 24×24, fill none (no token), color #0056d2 (interactive-primary, feedback-informative, blue-800) | 24×24, fill none (no token), color #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | 24×24, fill none (no token), color #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | 24×24, fill none (no token), color #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Crop | [png](../components/crops/signed-in/ml-overflow-button-default.png) | [png](../components/crops/signed-in/ml-overflow-button-hover.png) | [png](../components/crops/signed-in/ml-overflow-button-focus-visible.png) | [png](../components/crops/signed-in/ml-overflow-button-focus-visible-cds.png) | [png](../components/crops/signed-in/ml-overflow-button-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-9jkubm+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.css-9jkubm:focus { outline: none; }`
- `.css-9jkubm.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-9jkubm.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-9jkubm.cds-iconButton-ghost:hover { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-9jkubm.cds-iconButton-ghost.cds-buttonBase-focusVisible { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-9jkubm.cds-iconButton-ghost:active { --iconButton-background: var( --cds-color-interactive-background-primary-pressed-weak ); --iconButton-color: var(--cds-color-interactive-primary-pressed); }`

### My Learning: standalone course card

Bordered rounded card: partner logo and name, "Offered by", course title link, "Course · 9% complete · Estimated completion", progress bar, next-item card and overflow button.

Key `ml-course-card`. Read from `__m.q(".rc-CourseCardModule > div", 0)` on my-learning.

| Property | default | hover | with-progress |
| --- | --- | --- | --- |
| Size (w×h) | 885.33×132 | = | 885.33×152 |
| Padding | 24px (spacing-300) / 16px (spacing-200) | = | 24px (spacing-300) / 16px (spacing-200) |
| Border | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) | = | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Radius | 16px (border-radius-200) | = | 16px (border-radius-200) |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) | = | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Painted layers | div.cds-9.cds-10 885.3x132.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 16px; div.cds-Avatar-base.cds-Avatar-organization 30.0x30.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 4px; section 350.0x82.0 border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| R:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| B:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| L:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) r 12px; a.cds-113.cds-button-disableElevation 99.9x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | = | div.cds-9.cds-10 885.3x152.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 16px; div.cds-Avatar-base.cds-Avatar-organization 30.0x30.0 border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 4px; div 425.7x8.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) border T:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| R:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| B:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) \| L:1px solid #f2f5fa (neutral-disabled-weak, neutral-background-primary-weak, grey-25) r 8px; div 38.1x8.0 bg #6f29e5 (emphasis-quaternary-background-strong, purple-750) r 8px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/ml-course-card-default.png) | [png](../components/crops/signed-in/ml-course-card-hover.png) | [png](../components/crops/signed-in/ml-course-card-with-progress.png) |

How: hover: mouse hover; with-progress: at rest, captured with-progress.

Sub-measurements:

- cards: 2 items, sizes 885.3x132.0 885.3x152.0, gaps dy 24 (pitch 156)
- logo: div 30×30 at (65, 411), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 4px, padding 2px
- partner: span 91.61×20 at (101, 409), "Duke University", font 400 14px/20px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- offered: p 200.23×14 at (101, 429), "Offered by Example University", font 400 16px/14px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- title: span 208.14×22 at (65, 446), "Cloud Computing Foundations", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- meta: p 40.81×20 at (65, 471), "Course", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

Sub-measurements, with-progress:

- cards: 2 items, sizes 885.3x132.0 885.3x152.0, gaps dy 24 (pitch 156)
- logo: div 30×30 at (65, 401), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200), radius 4px, padding 2px
- partner: span 91.61×20 at (101, 399), "Duke University", font 400 14px/20px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- offered: p 200.23×14 at (101, 419), "Offered by Example University", font 400 16px/14px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- title: span 227.17×22 at (65, 436), "Introduction to Machine Learning", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- meta: p 40.81×20 at (65, 461), "Course", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

### My Learning: calendar and stats card

Bordered card: month title with previous/next icon buttons, a 7-column grid (weekday header row, 32px day cells, today ringed), a legend, a rule, then "Last 4 weeks" with three stats.

Key `ml-calendar`. Read from `__m.q("[aria-label=\"Previous month\"]", 0).closest('.cds-grid-item')` on my-learning.

| Property | default |
| --- | --- |
| Size (w×h) | 426.66×503.8 |
| Padding | 24px (spacing-300) |
| Border | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Radius | 16px (border-radius-200) |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Painted layers | div.cds-9.cds-11 426.7x503.8 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 16px; button.cds-113.cds-iconButton-small 36.0x36.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset; button.cds-113.cds-iconButton-small 36.0x36.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset; div 32.0x32.0 border T:2px solid transparent (no token) \| R:2px solid transparent (no token) \| B:2px solid transparent (no token) \| L:2px solid transparent (no token) r 50% |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/ml-calendar-default.png) |

Sub-measurements:

- month: h2 111.08×20 at (990.3, 231), "September 2026", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- weekday: span 17.78×20 at (1008.3, 263), "Mo", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- weekdayCell: div 53.8×20 at (990.3, 263), "Monday Mo", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- dayCells: 38 items, sizes 53.8x20.0 53.8x20.0 53.8x20.0 53.8x20.0, gaps dx 0 dx 0 dx 0 dx 0 dx 0 dx 0 dy 8 (pitch 28) dx 0 dx 0
- legendDot: div 5×5 at (990.3, 506.5), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #6f29e5 (emphasis-quaternary-background-strong, purple-750), radius 50px
- legendLine: div 16×2 at (1159.5, 508), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #6f29e5 (emphasis-quaternary-background-strong, purple-750), radius 50px
- legendText: span 144.16×20 at (999.3, 499), "1+ daily goals completed", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- rule: hr 424.66×1 at (966.3, 543), font 400 16px/24px Source Sans Pro, colour #808080 (no token), bg #c1cbdb (neutral-stroke-primary-weak, grey-200), margin 16px -24px
- statsHeading: h3 376.66×20 at (990.3, 568), "Last 4 weeks", font 600 16px/20px Source Sans Pro ls -0.048px, colour #48546e (neutral-primary-weak, grey-750)
- statNumber: span 125.31×28.8 at (990.3, 604), "0", font 600 24px/28.8px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- statLabel: span 125.31×40 at (990.3, 636.8), "Daily goals completed", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

### My Learning: calendar previous/next

Ghost small icon buttons, 36x36 with 20px chevrons.

Key `ml-calendar-nav`. Read from `__m.q("[aria-label=\"Next month\"]", 0)` on my-learning.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 36×36 | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) |
| Box shadow | transparent 0px 0px 0px 1px inset | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | button.cds-113.cds-iconButton-small 36.0x36.0 r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | button.cds-113.cds-iconButton-small 36.0x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset | = | button.cds-113.cds-iconButton-small 36.0x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; button::after.cds-113.cds-iconButton-small 40pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | button.cds-113.cds-iconButton-small 36.0x36.0 bg #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) r 8px shadow rgba(0, 0, 0, 0) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 20×20, fill none (no token), color #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = | = | = | = |
| Crop | [png](../components/crops/signed-in/ml-calendar-nav-default.png) | [png](../components/crops/signed-in/ml-calendar-nav-hover.png) | [png](../components/crops/signed-in/ml-calendar-nav-focus-visible.png) | [png](../components/crops/signed-in/ml-calendar-nav-focus-visible-cds.png) | [png](../components/crops/signed-in/ml-calendar-nav-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added button.css-hwjvpa+.cds-buttonBase-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (8, first 6; the rest are in the JSON):

- `.css-hwjvpa:focus { outline: none; }`
- `.css-hwjvpa.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-hwjvpa.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-hwjvpa.cds-iconButton-ghost:hover { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-hwjvpa.cds-iconButton-ghost.cds-buttonBase-focusVisible { --iconButton-background: var( --cds-color-interactive-background-primary-hover-weak ); --iconButton-color: var(--cds-color-interactive-primary-hover); }`
- `.css-hwjvpa.cds-iconButton-ghost:active { --iconButton-background: var( --cds-color-interactive-background-primary-pressed-weak ); --iconButton-color: var(--cds-color-interactive-primary-pressed); }`

### My Learning: calendar day cell

32px circle cell with the date; today (29) gets a purple ring and a heavier number.

Key `ml-calendar-day`. Read from `__m.q("[data-testid=day-28]", 0).parentElement` on my-learning.

| Property | default | today |
| --- | --- | --- |
| Size (w×h) | 32×32 | 32×32 |
| Border | 2px solid transparent (no token) | 2px solid #925ceb (emphasis-quaternary-stroke-default, purple-500) |
| Radius | 50% (border-radius-max) | 50% (border-radius-max) |
| Background | transparent (no token) | transparent (no token) |
| Painted layers | div 32.0x32.0 border T:2px solid transparent (no token) \| R:2px solid transparent (no token) \| B:2px solid transparent (no token) \| L:2px solid transparent (no token) r 50% | div 32.0x32.0 border T:2px solid #925ceb (emphasis-quaternary-stroke-default, purple-500) \| R:2px solid #925ceb (emphasis-quaternary-stroke-default, purple-500) \| B:2px solid #925ceb (emphasis-quaternary-stroke-default, purple-500) \| L:2px solid #925ceb (emphasis-quaternary-stroke-default, purple-500) r 50% |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/ml-calendar-day-default.png) | [png](../components/crops/signed-in/ml-calendar-day-today.png) |

How: today: at rest, captured today.

Sub-measurements:

- number: span 13.92×20 at (1010.3, 440), "28", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)

Sub-measurements, today:

- number: span 14.28×18 at (1063.9, 441), "29", font 600 14px/18px Source Sans Pro ls -0.042px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

### My Learning: recent certificates card

Bordered card: heading, then rows of a 48px logo in a 60px tile, the course name, an "Add to LinkedIn" ghost-invert button and a "View certificate" link.

Key `ml-certificates-card`. Read from `__m.text('span', 'Recent Certificates').closest('.cds-grid-item')` on my-learning.

| Property | default |
| --- | --- |
| Size (w×h) | 426.66×222 |
| Padding | 24px (spacing-300) |
| Border | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) |
| Radius | 16px (border-radius-200) |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) |
| Painted layers | div.cds-9.cds-11 426.7x222.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 16px; div 60.0x60.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 4px; div 60.0x60.0 bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25) r 4px |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) |
| Crop | [png](../components/crops/signed-in/ml-certificates-card-default.png) |

Sub-measurements:

- heading: span 127.83×22 at (990.3, 364.8), "Recent Certificates", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- rows: 2 items, sizes 96.1x24.0 96.1x24.0, gaps dy 52 (pitch 76)
- tile: div 60×60 at (990.3, 399.8), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #f2f5fa (neutral-background-primary-weak, emphasis-neutral-background-xweak, grey-25), radius 4px
- logo: img 48×48 at (996.3, 405.8), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), overflow-y clip
- title: span 204.17×24 at (1066.3, 403.3), "The Science of Well-Being", font 600 16px/24px Source Sans Pro ls 0.16px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

### My Learning: "Add to LinkedIn" (ghost invert, compact)

Ghost-invert button with no padding, 24px tall.

Key `ml-cert-linkedin`. Read from `__m.q("[data-testid=add-to-linkedin-button]", 0)` on my-learning.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 96.11×24 | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | transparent (no token) | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers |  | = | = | a.cds-113.cds-button-disableElevation 96.1x24.0 r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; a::after.cds-113.cds-button-disableElevation 100.109pxx28px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | = |
| Font | Source Sans Pro 600 14px/24px, 0.14px | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | = | = | = | = |
| Text decoration | none | underline auto offset auto | underline auto offset auto | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/ml-cert-linkedin-default.png) | [png](../components/crops/signed-in/ml-cert-linkedin-hover.png) | [png](../components/crops/signed-in/ml-cert-linkedin-focus-visible.png) | [png](../components/crops/signed-in/ml-cert-linkedin-focus-visible-cds.png) | [png](../components/crops/signed-in/ml-cert-linkedin-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-vb5r37+.cds-buttonBase-focusVisible, a.css-vb5r37+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (11, first 6; the rest are in the JSON):

- `.css-vb5r37:focus { outline: none; }`
- `.css-vb5r37.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-vb5r37.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-vb5r37:hover { background: transparent; text-decoration: underline; }`
- `.css-vb5r37.cds-button-focusVisible { text-decoration: underline; }`
- `.css-vb5r37:active { text-decoration: underline; }`

### My Learning: "View certificate" link

cds Link, bold blue.

Key `ml-cert-view`. Read from `__m.q("[data-testid=add-to-linkedin-button]", 0).nextElementSibling` on my-learning.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 92.06×25 | = | = | = | = |
| Radius | 0 | = | = | 4px (border-radius-50) | = |
| Background | transparent (no token) | = | = | = | = |
| Box shadow | none | = | = | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Painted layers |  | = | = | a.cds-179.cds-173 92.1x25.0 r 4px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px outline 1px solid rgba(0, 0, 0, 0) offset 2px | = |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = | = | = | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | = | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) | #232b3a (interactive-secondary-hover, emphasis-neutral-background-xstrong, grey-900) |
| Text decoration | none | underline auto offset auto | underline auto offset auto | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/ml-cert-view-default.png) | [png](../components/crops/signed-in/ml-cert-view-hover.png) | [png](../components/crops/signed-in/ml-cert-view-focus-visible.png) | [png](../components/crops/signed-in/ml-cert-view-focus-visible-cds.png) | [png](../components/crops/signed-in/ml-cert-view-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-t7yg2z+.cds-link-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (6, first 6; the rest are in the JSON):

- `.cds-175:hover { text-decoration: underline; }`
- `.cds-175:hover { text-decoration: underline; }`
- `.css-t7yg2z:hover { color: var(--cds-color-interactive-secondary-hover); text-decoration: underline; }`
- `.css-t7yg2z.cds-link-focusVisible { color: var(--cds-color-interactive-secondary-hover); }`
- `.css-t7yg2z:focus { outline: none; }`
- `.css-t7yg2z.cds-link-focusVisible { outline: transparent solid 1px; outline-offset: 2px; border-radius: var(--cds-border-radius-50); text-decoration: underline; box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-i`

### My Learning, Completed tab: course card

Wide bordered card: a 26px green check disc, partner, title and "Course · 100% complete"; the actions (Add to LinkedIn primary, View certificate, or Purchase Certificate) and the overflow button at the right.

Key `mlc-course-card`. Read from `__m.q(".rc-CourseCardModule > div", 0)` on my-learning-completed.

| Property | default | hover |
| --- | --- | --- |
| Size (w×h) | 1344×118 | = |
| Padding | 24px (spacing-300) / 16px (spacing-200) | = |
| Border | 1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) | = |
| Radius | 16px (border-radius-200) | = |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) | = |
| Painted layers | div.cds-9.cds-10 1344.0x118.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) border T:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| R:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| B:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) \| L:1px solid #c1cbdb (neutral-stroke-primary-weak, grey-200) r 16px; div 26.0x26.0 bg #197d12 (feedback-success, green-750) r 50%; a.cds-113.cds-button-disableElevation 128.1x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset; a.cds-113.primary 126.3x36.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px | = |
| Font | Source Sans Pro 400 16px/24px (typography-body1, typography-body-primary) | = |
| Colour | #0d0f12 (neutral-primary, interactive-secondary, grey-975) | = |
| Crop | [png](../components/crops/signed-in/mlc-course-card-default.png) | [png](../components/crops/signed-in/mlc-course-card-hover.png) |

How: hover: mouse hover.

Sub-measurements:

- cards: 3 items, sizes 1344.0x118.0 1344.0x128.0 1344.0x132.0, gaps dy 24 (pitch 142) dy 24 (pitch 152)
- check: div 26×26 at (65, 412), font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975), bg #197d12 (feedback-success, green-750), radius 50%, padding 5px, margin 0px 12px 0px 0px
- checkIcon: svg 16×20 at (70, 415), font 400 16px/24px Source Sans Pro, colour #ffffff (neutral-primary-invert, neutral-background-primary, white-0), fill none (no token), overflow-y hidden
- partner: span 85.06×20 at (103, 391), "Yale University", font 400 14px/20px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- title: span 174.3×22 at (103, 414), "The Science of Well-Being", font 600 16px/20px Source Sans Pro ls -0.048px, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)
- meta: p 40.81×20 at (103, 439), "Course", font 400 14px/20px Source Sans Pro, colour #48546e (neutral-primary-weak, grey-750)
- ctas: div 529.83×36 at (736, 407), "Add to LinkedIn View certificate", font 400 16px/24px Source Sans Pro, colour #0d0f12 (neutral-primary, interactive-secondary, grey-975)

### Completed tab: "Add to LinkedIn" (primary)

Primary button, 36px tall.

Key `mlc-linkedin-button`. Read from `__m.q("a[data-track-component=add_to_linkedin]", 0)` on my-learning-completed.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 128.11×36 | = | = | = | = |
| Padding | 8px (spacing-100) / 16px (spacing-200) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) | = | = | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Box shadow | #0056d2 0px 0px 0px 1px inset | = | = | = | = |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | a.cds-113.cds-button-disableElevation 128.1x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | a.cds-113.cds-button-disableElevation 128.1x36.0 bg #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | = | a.cds-113.cds-button-disableElevation 128.1x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset outline 1px solid rgba(0, 0, 0, 0) offset 2px; a::after.cds-113.cds-button-disableElevation 132.109pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | a.cds-113.cds-button-disableElevation 128.1x36.0 bg #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = | = | = |
| Colour | #ffffff (neutral-primary-invert, neutral-background-primary, white-0) | = | = | = | = |
| Text decoration | none | underline auto offset auto | underline auto offset auto | underline auto offset auto | underline auto offset auto |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/mlc-linkedin-button-default.png) | [png](../components/crops/signed-in/mlc-linkedin-button-hover.png) | [png](../components/crops/signed-in/mlc-linkedin-button-focus-visible.png) | [png](../components/crops/signed-in/mlc-linkedin-button-focus-visible-cds.png) | [png](../components/crops/signed-in/mlc-linkedin-button-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-bws60f+.cds-buttonBase-focusVisible, a.css-bws60f+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (9, first 6; the rest are in the JSON):

- `.css-bws60f:focus { outline: none; }`
- `.css-bws60f.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-bws60f.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-bws60f:hover { border-color: var(--cds-color-interactive-primary-hover); background-color: var(--cds-color-interactive-primary-hover); }`
- `.css-bws60f:active { border-color: var(--cds-color-interactive-primary-pressed); background-color: var(--cds-color-interactive-primary-pressed); }`
- `.css-bws60f:active.cds-button-disableElevation::after { content: unset; }`

### Completed tab: "View certificate"

Legacy link button (primary invert classes, not a cds-button): blue text, no fill.

Key `mlc-view-certificate`. Read from `__m.q(".card-action-button-viewcertificate", 0)` on my-learning-completed.

| Property | default | hover | focus-visible | focus-visible-cds | pressed |
| --- | --- | --- | --- | --- | --- |
| Size (w×h) | 126.3×36 | = | = | = | = |
| Padding | 8px (spacing-100) / 16px (spacing-200) | = | = | = | = |
| Radius | 8px (border-radius-100) | = | = | = | = |
| Background | #ffffff (neutral-background-primary, neutral-primary-invert, white-0) | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | = | #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) | #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) |
| Outline | none | = | = | 1px solid transparent (no token) offset 2px | = |
| Pseudo element |  | = | = | ::after inset -2px -2px -2px -2px, shadow #804ee4 (interactive-stroke-primary-focus, purple-600) 0px 0px 0px 1px, #f0f6ff (interactive-stroke-primary-focus-invert, emphasis-primary-background-xweak, blue-25) 0px 0px 0px 2px, radius 8px | = |
| Painted layers | a.cds-113.primary 126.3x36.0 bg #ffffff (neutral-background-primary, neutral-primary-invert, white-0) r 8px | a.cds-113.primary 126.3x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px | = | a.cds-113.primary 126.3x36.0 bg #f0f6ff (emphasis-primary-background-xweak, interactive-background-primary-hover-weak, blue-25) r 8px outline 1px solid rgba(0, 0, 0, 0) offset 2px; a::after.cds-113.primary 130.297pxx40px r 8px shadow rgb(128, 78, 228) 0px 0px 0px 1px, rgb(240, 246, 255) 0px 0px 0px 2px | a.cds-113.primary 126.3x36.0 bg #f9f5ff (callouts-background-secondary-weak, emphasis-quaternary-background-xweak, purple-25) r 8px |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = | = | = | = |
| Colour | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | = | #0b408b (interactive-primary-hover, emphasis-primary-background-xstrong, blue-850) | #3c0f8a (interactive-primary-pressed, interactive-primary-selected, purple-900) |
| Text decoration | none | underline auto offset auto | underline auto offset auto | underline auto offset auto | underline auto offset auto |
| Transition | none | all 0.25s ease-in-out | = | = | all 0.25s ease-in-out |
| Cursor | pointer | = | = | = | = |
| Crop | [png](../components/crops/signed-in/mlc-view-certificate-default.png) | [png](../components/crops/signed-in/mlc-view-certificate-hover.png) | [png](../components/crops/signed-in/mlc-view-certificate-focus-visible.png) | [png](../components/crops/signed-in/mlc-view-certificate-focus-visible-cds.png) | [png](../components/crops/signed-in/mlc-view-certificate-pressed.png) |

How: hover: mouse hover; focus-visible: keyboard: focus(), Shift+Tab, Tab; focus-visible-cds: keyboard: focus(), Shift+Tab, Tab; emulated CDS JS: added a.css-17wsbtq+.cds-buttonBase-focusVisible, a.css-17wsbtq+.cds-button-focusVisible; pressed: mouse button held down (released over the page ground).

Authored state rules that match this element (10, first 6; the rest are in the JSON):

- `.css-17wsbtq:focus { outline: none; }`
- `.css-17wsbtq.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-17wsbtq.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pr`
- `@media (hover: hover) .css-17wsbtq:hover { color: var(--cds-color-interactive-primary-hover); background-color: var( --cds-color-interactive-background-primary-hover-weak ); }`
- `.css-17wsbtq.cds-button-focusVisible { background-color: var( --cds-color-interactive-background-primary-hover-weak ); color: var(--cds-color-interactive-primary-hover); }`
- `.css-17wsbtq:active { color: var(--cds-color-interactive-primary-pressed); background-color: var( --cds-color-interactive-background-primary-pressed-weak ); }`

### Completed tab: "Purchase Certificate"

Primary button.

Key `mlc-purchase`. Read from `__m.q("a[data-track-component=purchase_certificate]", 0)` on my-learning-completed.

| Property | default | hover |
| --- | --- | --- |
| Size (w×h) | 155.72×36 | = |
| Padding | 8px (spacing-100) / 16px (spacing-200) | = |
| Radius | 8px (border-radius-100) | = |
| Background | #0056d2 (interactive-primary, feedback-informative, blue-800) | #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) |
| Box shadow | #0056d2 0px 0px 0px 1px inset | = |
| Painted layers | a.cds-113.cds-button-disableElevation 155.7x36.0 bg #0056d2 (interactive-primary, feedback-informative, blue-800) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset | a.cds-113.cds-button-disableElevation 155.7x36.0 bg #0b408b (emphasis-primary-background-xstrong, interactive-primary-hover, blue-850) r 8px shadow rgb(0, 86, 210) 0px 0px 0px 1px inset |
| Font | Source Sans Pro 600 14px/20px, 0.14px (typography-action-secondary) | = |
| Colour | #ffffff (neutral-primary-invert, neutral-background-primary, white-0) | = |
| Text decoration | none | underline auto offset auto |
| Cursor | pointer | = |
| Crop | [png](../components/crops/signed-in/mlc-purchase-default.png) | [png](../components/crops/signed-in/mlc-purchase-hover.png) |

How: hover: mouse hover.

Authored state rules that match this element (9, first 6; the rest are in the JSON):

- `.css-bws60f:focus { outline: none; }`
- `.css-bws60f.cds-buttonBase-focusVisible { outline: transparent solid 1px; outline-offset: 2px; }`
- `.css-bws60f.cds-buttonBase-focusVisible::after { content: ""; position: absolute; inset: -2px; border-radius: var(--cds-border-radius-100); box-shadow: 0 0 0 1px var(--cds-color-interactive-stroke-primary-focus),0 0 0 2px var(--cds-color-interactive-stroke-pri`
- `@media (hover: hover) .css-bws60f:hover { border-color: var(--cds-color-interactive-primary-hover); background-color: var(--cds-color-interactive-primary-hover); }`
- `.css-bws60f:active { border-color: var(--cds-color-interactive-primary-pressed); background-color: var(--cds-color-interactive-primary-pressed); }`
- `.css-bws60f:active.cds-button-disableElevation::after { content: unset; }`

