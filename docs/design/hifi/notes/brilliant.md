# Brilliant reference extraction

Read from `docs/design/reference/brilliant/`: README.md, components.md, tokens.json. All hex values below are resolved from `tokens.json`'s `core.palette`, not left as token references. Line numbers are in `tokens.json` at this commit.

## Tokens to adopt

| Token | Light | Dark | tokens.json line (L / D) |
| --- | --- | --- | --- |
| Page background (`bg.primary`) | `#ffffff` | `#141414` | 3693 / 6338 |
| Card/surface background (`bg.elevated`, used for popovers, modals, dropdowns) | `#ffffff` | `#1e1e1e` | 3549 / 6194 |
| Secondary surface (`bg.secondary`, shelves, disabled fields) | `#f8f8f8` | `#1e1e1e` | 3751 / 6396 |
| Tertiary fill (`bg.tertiary`, selected nav items, secondary button3d face) | `#0000001a` (black 10%) | `#ffffff4d` (white 30%) | 3836 / 6481 |
| Border default (`border.primary`) | `#0000001a` (black 10%) | `#ffffff4d` (white 30%) | 4255 / 6900 |
| Border strong (`border.solid`, cards, course tiles) | `#e5e5e5` (gray.200) | `#4c4c4c` (gray.800) | 4314 / 6959 |
| Text primary (`text.primary`) | `#000000` | `#ffffff` | 3337 / 5982 |
| Text secondary (`text.secondary`) | `#00000099` (black 60%) | `#ffffff99` (white 60%) | 3359 / 6004 |
| Text muted (`text.tertiary`) | `#00000066` (black 40%) | `#ffffff66` (white 40%) | 3395 / 6040 |
| Text disabled (`text.disabled`) | `#00000033` (black 20%) | `#ffffff33` (white 20%) | 3245 / 5890 |
| Accent, primary action (`bg.blue-primary`, `text.blue-primary`) | bg `#456dff`, text `#294bc6` | bg `#456dff`, text `#7491ff` | 3470 / 6115, 3210 / 5855 |
| Accent alt, main CTA face (`component.button3d.primary-face`) | `#000000` (black) | `#e5e5e5` (gray.200) | see Components below |
| Success / correct (`bg.green-primary`, `text.green-primary`) | bg `#29cc57`, text `#009b2b` | bg `#29cc57`, text `#5ed981` | 3557 / 6202, 3253 / 5898 |
| Danger / incorrect (`bg.danger-primary`, `text.danger-primary`) | bg `#ff5d5d`, text `#c43939` | bg `#ff8585`, text `#ff8585` | 3513 / 6158, 3231 / 5876 |
| Warning (`bg.warning-primary`, `text.warning-primary`) | bg `#f7c325`, text `#b78900` | bg `#f9d25c`, text `#f9d25c` | 3865 / 6510, 3403 / 6048 |
| Disabled fill (`bg.disabled`) | `#0000000d` (black 5%) | `#ffffff0d` (white 5%) | 3541 / 6186 |

Palette steps used above, resolved: gray.200 `#e5e5e5`, gray.800 `#4c4c4c`, green.400 `#5ed981`, green.500 `#29cc57`, green.700 `#009b2b`, red.400 `#ff8585`, red.500 `#ff5d5d`, red.700 `#c43939`, yellow.400 `#f9d25c`, yellow.500 `#f7c325`, yellow.700 `#b78900`, blue.400 `#7491ff`, blue.500 `#456dff`, blue.700 `#294bc6`, blackAlpha/whiteAlpha steps as hex-with-alpha suffix above.

### Type

Two families, both proprietary and not committed; the reference's own fallback is Figtree for CoFo Brilliant and Georgia for CoFo Robert (README "Use in Figma" and the style guide's own fallback).

| Role | Family (fallback) | Weight | Line 1257 (Brilliant), 1265 (Robert) |
| --- | --- | --- | --- |
| UI text, body, labels | CoFo Brilliant, sans-serif (Figtree) | 400/500/700 | |
| Display headlines | CoFo Robert, sans-serif (Georgia) | 500 | |
| Lesson interactive tiles | CoFo Semi Mono, monospace | 500/700 | |

Text styles (all `core.typography.*`, font-size / line-height / weight / letter-spacing):

| Style | Token | Size/LH | Weight | Letter-spacing | Line |
| --- | --- | --- | --- | --- | --- |
| Display (page hero) | `display.5xl` | 60px / 110% | 500 | -1.2px | 1807 |
| Page title | `heading.md` | 20px / 125% | 700 | 0px | 1405 |
| Card title | `heading.sm` | 16px / 140% | 700 | 0px | 1391 |
| Body | `body.base` | 16px / 150% | 400 | 0px | 1504 |
| Secondary/small body | `body.sm` | 14px / 150% | 400 | 0px | 1518 |
| Label / button text | `ui.actions.base` | 16px / 125% | 500 | 0px | 1563 |
| Label, uppercase (badges) | `ui.actions.sm` | 12px / 110% | 700 | .48px, uppercase | 1591 |
| Mono (lesson interactive) | `ui.interactives.semiMono.base` | 16px / 150% | 400 | 0px | 1723 |

### Radii, spacing, borders, shadows, motion

| Group | Value | Line |
| --- | --- | --- |
| Radius, card | `radius.2xl` = 20px | 2491 |
| Radius, pill/full | `radius.full` = 9999px | 2507 |
| Radius, flat button | `radius.button` = 54px | 2543 |
| Radius, button3d | `radius.button3d` = 56px | 2550 |
| Radius, input/small card | `radius.lg` = 12px, `radius.md` = 8px | 2475 / 2467 |
| Spacing step, card padding | `spacing.4` = 1rem (16px), `spacing.6` = 1.5rem (24px), `spacing.8` = 2rem (32px) | 1921 / 1949 / 1963 |
| Spacing step, gaps | `spacing.2` = .5rem (8px), `spacing.3` = .75rem (12px) | 1893 / 1907 |
| Border width, cards/inputs | `borderWidth.default` = 2px | 2587 |
| Border width, dividers | `borderWidth.thin` = 1px | 2580 |
| Border width, focus ring | `borderWidth.focus-ring` = 3px | 2595 |
| Shadow, elevation (popovers, modals, cards) | `0 0 15px 0 rgba(0,0,0,.10)` light, `0 0 15px 0 rgba(0,0,0,.80)` dark | 5331 / 7976 |
| Shadow, modal (heavier) | `0 0 25px 0 rgba(0,0,0,.20)` light, same alpha dark (`shadowColor.medium`) | 5347 / 7992 |
| Shadow, focus outline | `0 0 0 3px` in `border.select` (blue.500 `#456dff` light, blue.600 `#375ce3` dark) | 5363 / 8008 |
| Duration, press/instant | 100ms | 2965 |
| Duration, fast (menus, switches) | 150ms | 2972 |
| Duration, normal (progress fill) | 200ms | 2979 |
| Duration, spring (panel slide) | 833ms | 3007 |
| Easing, press | `ease-out` | 3049 |
| Easing, spring | `cubic-bezier(.2,1.1,.36,1)` (`--spring-smooth`) | 3073 |
| Easing, standard | `cubic-bezier(.4,0,.2,1)` | 3037 |

## Components that map onto ours

### Button3d (primary CTA)

Anatomy: a pill face lifted 4px over a same-hue darker "lip", `box-shadow: 0 4px 0 0 <lip>`; press animates lift and shadow 4px to 0 over 100ms ease-out.

- Height 48px, face radius `full` (56/60px per source note), padding 14 24, gap 8.
- Label: CoFo Brilliant 16/20 500 (`ui.actions.base`).
- Primary face: black `#000000` light, gray.200 `#e5e5e5` dark; lip is `shadowColor.cta-default` (black light, gray.400 `#b3b3b3` dark); text white light, black dark.
- Secondary face: `bg.tertiary` both themes; lip `shadowColor.cta-secondary-fill` (black 30% light, white 10% dark).
- Green (Continue after correct): face green.500 `#29cc57`, lip green.600 `#15b441`, both themes.
- Yellow (Try again after retry): face yellow.500 `#f7c325` with yellow.900 `#5c4400` text, lip yellow.700 `#b78900`.
- Disabled: face `bg.disabled`, text `text.disabled`, outer opacity .85, no lift.
- Focus: `0 0 0 3px` in `border.select`.
- Hover: no Chrome-visible change (Safari-only tint), a real gap for our own hover state.
- Crop: `components/crops/button3d-primary-dark.png`, `button3d-disabled-dark.png`, `lesson-footer-correct-dark.png` (green), `lesson-footer-retry-dark.png` (yellow).
- Maps to: our **Button, primary**.

### Flat button (secondary)

Anatomy: h48, padding 12 22, radius 54, border 2px, `ui.actions.base` label, no lift.

- outline: transparent fill, border `border.primary`, text `text.primary`; hover fills `bg.hover` (black/white 10%).
- ghost: transparent, text `text.secondary`/`text.tertiary`; hover `bg.hover`.
- disabled: `bg.disabled` fill, `text.disabled` text, cursor not-allowed.
- Crop: `components/crops/button-primary-hover-dark.png`, `settings-email-badges-light.png`.
- Maps to: our **Button, secondary**.

### Choice card / quiz option

Anatomy: a card acting as a radio, 158-178 wide, height 228, radius 16, padding 32 24 24, default background `gradient.hue-shift-action-gray` (a subtle grayscale wash, not a flat colour), label `ui.actions.base` in `text.secondary`.

| State | Change |
| --- | --- |
| Default | gradient wash background, `text.secondary` label |
| Hover | flat `bg.hover`, gradient removed |
| Selected (`data-checked`) | label goes `text.primary`; a hue-shift gradient (teal or blue) paints via `::before`; subject-choice cards add `shadow.outline` (the blue focus ring) |
| Correct / Incorrect | **not present on choice cards themselves** in this reference; Brilliant signals correctness on the lesson frame and footer instead (see Lesson feedback below), not per-option |

Crops: `choice-card-states-dark.png`, `choice-card-hover-dark.png`, `choice-card-selected-dark.png`, `subject-card-selected-dark.png`, `level-option-cards-dark.png`.
Maps to: our **multiple-choice options** in focus-mode lesson layout. Gap: we need our own correct/incorrect per-option treatment since Brilliant signals it at panel level, not tile level (see Gaps below).

### Lesson feedback (the actual correct/incorrect signal)

| State | Panel border | Extra | Tutor bubble | Footer |
| --- | --- | --- | --- | --- |
| Correct | green.700 `#009b2b`, plus a 1s `borderGlow` animation (glow colour green.400 `#5ed981` light / `#22c55e` dark, an off-palette hex, see Gaps) | none | bg green.800 `#007c23`, border green.700 | "Why?" secondary button, "Continue" green button3d |
| Retry/incorrect | yellow.700 `#b78900`, plus a `.45s shakeX` shake animation | none | bg yellow.700, border yellow.700 | "Get help" secondary button, "Try again" yellow button3d |

The lesson panel itself: inset 34px, radius 24 (`radius.lesson-frame`), `bg.primary`, 2px border that switches colour per state above.
Crops: `lesson-answer-correct-badge-dark.png`, `lesson-answer-retry-badge-dark.png`, `lesson-frame-light.png`.
Maps to: our **inline Correct/Incorrect feedback with a "Why" button** and the **Check button** (which becomes "Continue"/"Try again" after grading, not a separate persistent control).

### Progress bar

`.panda-progress`, track radius full, indicator `bg.green-primary` (green.500 both themes), `width` transition 200ms ease.

| Size | Height | Where |
| --- | --- | --- |
| default | 8px (.5rem) | onboarding, 696px wide |
| lg | 12px (.75rem) | lesson top bar, 592px wide, followed by 16x12 upcoming-section dots |

The learning-plan intro splits one bar into 3 segments with 4px gaps, which is the closest analogue to our step-progress bar with per-step ticks.
Crops: `progress-onboarding-dark.png`, `lesson-topbar-light.png`.
Maps to: our **progress bar** and **thin step-progress bar** (lesson top bar variant, lg size, segmented).

### Course card / course tile and path node

Course tile (`data-inner-course-card`): 176px square at 2xl (152 to 217.6px by breakpoint), padding 22.72%, radius 20, 2px `border.solid` (gray.200 light / gray.800 dark), lifted 4px with a `border.solid`-coloured lip (the same 3D-lift pattern as button3d, applied to a card). Hover swaps border and lip to `border.hover`. Grade badge top-left, "NEW" badge top-right, label below.

Course path level header: 456x64 button, radius 18, over a 3D lip in the level's colour (blue.700 `#294bc6` for level 1), presses 4px on active press. Path nodes are 3D discs with a label to the right: current node glows blue with Koji drawn on top, locked nodes are grey with `text.tertiary` labels.

Crops: `courses-shelf-light.png`, `course-tile-hover-dark.png`, `course-path-dark.png`, `course-path-light-app.png`.
Maps to: our **path node and unit card**, and our course cards (decision: Brilliant is the reference for course cards).

### Streak display and stat pills

Stat pills (keys, streak, in the app header): height 47, padding 9 20, radius 54 (pill), 2px `border.primary`, `ui.actions.base` label, 24px icon. Clicking opens a popover (353-384px wide, `bg.elevated`, radius 8, `shadow.base`).
Crop: `app-header-light.png`, `popover-streak-light.png`, `popover-streak-dark.png`.
Maps to: our **top bar streak and target pills**. Note this is a quiet, numeric pill with an icon, not a badge or a flame graphic, which matches our decision "quiet streak."

### Chips / tags (badge)

`.panda-badge`, text `ui.actions.sm` (12/13.2 700 uppercase, .48px tracking).

| Variant | Padding/radius | Example |
| --- | --- | --- |
| subtle | 4 8, radius full | "RECOMMENDED" blue, "UNVERIFIED" yellow |
| solid | 4 8, radius 12 | "NEW" green.600, "SAVE xx%" purple.500 |
| minimal | none | grade eyebrows in `text.tertiary` |

Crop: `settings-email-badges-dark.png`, `home-recommended-card-light.png`.
Maps to: our **chip and pill** (citation chips, filter chips can borrow the subtle/minimal variants; the uppercase-tracked label style is distinctive and worth adopting for eyebrow labels).

### Text input

`data-slot=form-input`. Height 52 (`size.input-height`), padding 12 16, radius 8, border 2px `border.primary`, transparent background, `body.base` text. Placeholder `text.disabled`. Focus: border 2px `border.active` (black light / gray.200 dark) plus an inset 1px ring of the same colour, reading as a 3px ring, no browser outline. Disabled: `bg.secondary` fill, no border, `text.secondary`, field opacity .5. Label is 16/20 500 `text.primary`, 8px above the field.
Crop: `settings-inputs-light.png`, `input-focus-dark.png`, `login-form-light.png`.
Maps to: our **text input**.

### Search field

A button styled as a field: 340x52, radius full, border 2px `border.primary`, padding 4 4 4 16, 16px search icon, trailing disabled-look "Ask" pill. Hover `border.hover`; focus `border.active` plus the focus-ring shadow.
Crop: `courses-search-light.png`, `courses-search-dark.png`.
Maps to: our **search field**.

### Nav bar (app header)

Nav tabs: anchor, height 63, `ui.nav.default` 16/24 in `text.secondary`; selected tab is `text.primary` weight 500 with a 2px underline that slides up over 100ms linear. Right side carries the stat pills and a "Go Premium" button (not applicable to us) and an avatar/menu trigger.
Crop: `app-header-light.png`, `app-header-dark.png`.
Maps to: our **top bar with five destinations plus streak and target pills**. The underline-slide selected-state treatment is directly adoptable.

### Modal

Overlay `rgba(11,11,11,.8)` dark (from `special.overlay.default`), 150ms opacity fade. Content: max-width 448, `bg.elevated`, radius 20, `shadow.md` (the heavier 25px glow), padding 32 20 16, gap 24; title `heading.md`, body `body.base`; a full-width button3d plus a danger-ghost button.
Crop: `modal-quit-dark.png`, `modal-quit-danger-hover-dark.png`.
Maps to: closest thing we have to a modal is the **session-close screen**, though that is full-screen in our design, not an overlay; this component is a fallback reference for any confirm dialog we add (e.g. "quit session").

### Lesson layout measurements

Lesson panel inset 34px from the frame edge (`size.lesson-frame-radius-inset`), radius 24 (`radius.lesson-frame`), `bg.primary`, 2px state-coloured border. Lesson column width 540px (`size.lesson-column`), narrower than our agreed 720px focus column, so treat as a lower bound, not a target. Top bar carries the lg (12px) progress bar at 592px wide plus upcoming-unit dots, and a close icon button.
Crop: `lesson-frame-light.png`, `lesson-topbar-dark.png`.
Maps to: our **focus-mode lesson layout** (720px column, prose, widget, options, Check, feedback).

## Not in this system

Brilliant has no equivalent for, or handles very differently from, these of ours:

- **Filter chips as a multi-select control**: Brilliant's badges are display-only labels (grade, "NEW", "RECOMMENDED"), never interactive filters.
- **Table rows**: no data table anywhere in the captured product (confirmed in Gaps: "Select, checkbox, radio, avatar, data table: the app has none").
- **Four-button rating row (spaced repetition)**: Brilliant has no review/recall surface; closest analogue is the hue-shift pill row (No/Maybe/Yes, 3 options), a different interaction (quick qualitative answer, not SM-2 grading).
- **Chat message with citation chip**: the Koji tutor chat has plain message bubbles (tutor/user), no citation UI at all; our citation-chip pattern is new territory.
- **Widget placeholder as a generic asset slot**: Brilliant's "widget" is always the bespoke `<custom-interactive>` web component built per lesson; there is no generic placeholder pattern to borrow, only the frame that hosts it.
- **Mastery dot (3-bucket)**: Brilliant colours whole path nodes (locked, current, complete) rather than showing a compact per-item mastery dot separate from the node itself.

## Gaps and estimated values

- **Button3d hover** is explicitly a gap: the hover tint (`--button3d-hover-tint`) only renders in Safari, so Chrome captures show no visible hover change. We need to design our own hover state for Button primary.
- **`palette.gray.600`** resolves to the literal CSS value `"gray"` (the browser's named-color keyword, effectively `#808080`) instead of a hex, per its own `$extensions.source` (`css-var --panda-colors-gray-600`, tokens.json line 34-ish in the gray block). This looks like an unresolved computed-style read, not a deliberate value; do not treat it as a designed token, re-derive gray.600 by interpolation if we need that step (between gray.500 `#999999` and gray.700 `#666666`).
- **`component.lesson.glow-correct`** is `green.400` (`#5ed981`) in light but a bare off-palette `#22c55e` in dark (not a `green.*` step), flagged only implicitly, not in the Gaps table. Treat the dark value as an estimate rather than a system colour if we adopt the correct-answer glow.
- **Quiz option correct/incorrect states** (selected + graded, both colours on the tile itself) are not in this reference at all: Brilliant signals grading on the lesson panel and footer, never on the option tile. This is a real gap against our spec, which asks for a graded state on the option itself; we will need to originate that combination (most likely: keep the selected-state treatment and add a thin colored edge or icon, informed by the panel border colours: green.700 correct / yellow.700 retry).
- **Onboarding, promo, plan, learning-path light theme**: captured dark only; light values inferred from the shared token set, not screenshot-verified.
- **Lesson correct/retry, tutor chat, quit dialog in light theme**: not captured live (tile drags didn't register in a backgrounded tab); light values are read from CSS/computed styles only, not screenshot-verified.
- **Koji prompt suggestion cards**: canvas-drawn, no DOM, so their ~130x84 radius-12 card spec is "estimated from screenshot," not measured.
- **Pricing plan-card and comparison-table iridescent frames**: "estimated from screenshot," not applicable to our one-accent decision anyway.
- **Duration tokens are reconstructed, not sourced from a real Panda variable**: Panda's own duration tokens (`trs-dur_fast`/`normal`) compile to invalid CSS in production, so `core.duration.*` lists durations actually observed in transition rules, not a canonical token. Safe to reuse the values (100/150/200/300ms etc.) but know they are empirical, not authored.
