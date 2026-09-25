# Raw measurements (computed styles, CSS px), brilliant.org, 2026-09-25

Signed-in pages were read in Chrome at a 1384x797 viewport @2x (DPR 2); public pages in headless Chromium at 1440x900.
Theme is noted per block. Panda atomic class names are kept where they name a token (e.g. `textStyle_ui.actions.base`, `bg_bg.green.primary`).

## Global
- `<html lang=en data-theme=dark|light data-reduced-motion=false>`. Theme follows the system by default (`#color-mode-with-system-script`); dark tokens apply under `[data-theme="dark"]`, light under `:root`. No high-contrast theme; see Gaps.
- Toasts are Sonner (`[data-sonner-toaster]`), cookie consent is OneTrust (third-party, not documented).

## Onboarding (NUX), dark
- Page bg #141414 (bg.primary dark = gray.950).
- Progress (`panda-progress--size_default`): 696x8 at y26, track rgba(255,255,255,.2) radius 9999; indicator bg.green.primary rgb(41,204,87) radius full, `transition: width 200ms ease`.
- Back chevron left of progress bar.
- Title `p.textStyle_ui.actions.lg`: CoFo Brilliant 20/25 500 #fff. Subtitle `textStyle_body.base` 16/24 400 #fff.
- Intro line "I'm Koji, your personal tutor." CoFo Brilliant ~24px 500 (display text over mascot), centred.
- Button3d (primary CTA, `data-slot=button3d`, testid nux-continue-button): 280x48, outer radius 56px, `focusVisible: box-shadow elevation.outline` (0 0 0 3px border.select).
  - Face (`data-slot=button3d-face`): bg rgb(229,229,229) (dark CTA = gray.200-ish), text #000, CoFo Brilliant 16/20 500 (`ui.actions.base`), padding 14px 24px (py 3.5, px 6), gap 8, radius 60px, `box-shadow: 0 4px 0 0 var(--button3d-shadow-color)` = rgb(179,179,179) (elevation.shadow.cta.default), `transform: translateY(-4px)` (face sits 4px above its shadow), `transition: transform .1s ease-out, box-shadow .1s ease-out`.
  - Disabled (`data-disabled`): outer opacity .85, face bg rgba(255,255,255,.05), text rgba(255,255,255,.2), no lift (translate 0, no shadow).
  - Hover (pointer): no computed change on the face bg in dark; tint comes from `--button3d-hover-tint` (see CSS rules).
- Choice card (voice option, `button[data-unchecked]`): 158x228, radius 16 (xl), padding 32 24 24 (pbs 8 at lg, px 6 at lg / 5 md / 4 sm), bg linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.024)), label `ui.actions.base` 16/20 500 rgba(255,255,255,.6) (text.secondary dark), illustration 110x144.
- Switch (`data-slot=switch`, checked): 48x32 track, radius full, padding 4, checked bg = linear-gradient(0deg, rgb(160,220,213), rgb(18,71,64)) (teal), `transition: background .15s ease, outline-color .15s ease`, ring 3px transparent. Thumb 24x24 #fff circle, checked translateX(calc(100% - 8px)) = 16px, `transition: transform .15s ease`. Unchecked track bg.disabled. Label "Voice on" body.sm left of switch.
- Choice card selected (`data-checked`, `aria-selected`): label turns #fff; `::before` overlay paints linear-gradient(90deg, #1e1e1e, transparent) over linear-gradient(to bottom, rgb(8,15,40) → rgb(160,220,213)) (hueShift teal/blue), radius 16. Hover: bg rgba(255,255,255,.1) (bg.hover dark = whiteAlpha.200), gradient removed.
- Subject card (Math / CS): outer `button` unstyled, transform scale(.95) at rest; inner `[data-slot=box]` bg.primary + `bg-grad hueShift.action.gray`, radius xl 16, h228, gap 20, `transition: opacity .3s ease`. Selected adds `bg-grad hueShift.color.blue.primary` + `box-shadow elevation.outline` (0 0 0 3px border.select).
- Level option card (Arithmetic..Calculus): same choice card, 178x228; title `ui.actions.base` 16/20 500 #fff, description `body.sm` 14/21 text.secondary rgba(255,255,255,.6), illustration svg 110x64, gap 16.
- Icon button (`data-slot=icon-button`, speaker): 46x46, border 2px transparent, radius 6px (xs .375rem), padding 12, icon #fff; disabled: bg transparent, text.disabled.
- Hue-shift button (`data-slot=hue-shift-button`, No / Maybe / Yes pills): h52, min-w 96 (sizes.24), padding 16 24, radius full, `ui.actions.base` 16/20 500 #fff, bg linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.024)) = gradients.hueShift.action.gray (dark). Has a hidden loading layer with spinner.
- Spinner (`data-slot=spinner`): 16x16, border 2px, top border currentColor, other sides color-mix(currentColor 25%, transparent), radius 50%, `animation: spin 600ms linear infinite`.
- Figure card (question illustration, `data-slot=box`): 353x353, bg.elevated #1e1e1e (dark), border 1px border.primary rgba(255,255,255,.2), radius 3xl 32px, padding 24, `box-shadow: elevation.base` 0 0 15px 0 rgba(0,0,0,.1).
- Koji speech line: mascot 40px left + `p.textStyle_ui.actions.lg` 20/25 500 #fff, max ~430 wide.

## Promo (returning learner offer, /welcome/recommendations), dark
- Full-bleed bg `bg-grad paywall.iridescentBgFlipped` fixed 100dvw x 100dvh: linear-gradient(0deg, #141414 49.19%, transparent), rgba(20,20,20,.7) wash, linear-gradient(66deg, blue.400 rgb(55,92,227) 14.55%, pink.400 rgb(224,95,188) 42.56%, yellow.500 73.53%). (Light theme uses white in place of #141414.)
- Column: max-w 560, padding 56 24 24 (md pt 14), gap 24, centred.
- Badge `panda-badge--colorPalette_premium --variant_solid`: h25.2, padding 6px 20px, radius 12, bg linear-gradient(80.7deg, pink.300 rgb(255,189,236) 4.7%, yellow.400 rgb(249,210,92) 94.9%), text #000 CoFo Brilliant 12/13.2 700 tracking .48px uppercase (`ui.actions.sm`).
- Heading `h1.textStyle_display.2xl`: CoFo Robert 36/39.6 500, tracking -.36px, #fff.
- Sub `p.textStyle_body.lg`: CoFo Brilliant 20/30 400 #fff. Stack gap 16.

## Paywall comparison (/welcome/recommendations)
- Auto-advanced before it could be measured or saved. The same Free/Premium table is on /subscribe/ and was measured there; see "Free vs Premium comparison" at the end of this file.

## Learning plan preview (#llp-preview-intro), dark
- Segmented progress: 3 `progress-track` segments of 229.3x8 with 4px gaps across 696px; complete segments full green; current segment indicator width animates (`width 200ms ease`).
- Eyebrow `h1`: 12/13.2 700, tracking .48px (wider .04em), uppercase, text.secondary rgba(255,255,255,.6).
- Title `ui.actions.lg` 20/25 500 centred.
- Graph card 393x393 (bg.elevated, border.primary, radius 3xl) sitting on a full-bleed 4px horizon line: linear-gradient(to right, transparent, border.secondary 20%, border.secondary 80%, transparent) (5%/95% below md). border.secondary dark = rgba(255,255,255,.05).
- Graph (SVG, 272 wide): gridlines #fff at 0.71px, axes #fff 1.42px, line series blue rgb(69,109,255) and teal rgb(44,176,161) at 2.13px (2.84px for the emphasised series; teal emphasised rgb(39,155,141)), draggable points = white discs with drop shadow (feGaussianBlur filters). Legend chip under graph.

## Learning path (#learning-path), dark
- Title `h1` `heading.lg` → `lg: heading.xl` CoFo Brilliant 30/37.5 700 #fff, course icon before it.
- Course tile (`data-course-tile`): column 176 wide, gap 17, mx 10. Artwork well 176x174, radius 36px, padding 36 (p 9), bg.primary.
  - Current/unlocked: `bg-grad hueShift.color.blue.primary` = linear-gradient(90deg, #1e1e1e, transparent), linear-gradient(to bottom, rgb(9,35,32) → rgb(116,145,255)).
  - Locked: bg.primary + 2px solid border.secondary rgba(255,255,255,.05); artwork dimmed; label text.disabled rgba(255,255,255,.2).
  - Label `body.base` 16/24, max-w 165, centred, text.primary.
  - Tiles joined by short 2px connector lines (border.secondary).
- "START HERE" tag: pill bg gray.900 rgb(56,56,56), radius 176, padding 6 8, sits on the tile top edge (top -14px, centred); text `ui.actions.sm` 12/13.2 700 uppercase tracking .04em painted with gradient text (gray.100 → transparent over teal.100 → blue.400, background-clip text).
- Bottom action bar (fixed): bg.elevated #1e1e1e, box-shadow elevation.base, padding 16 20 (+ safe-area), gap 16, h120 incl. bottom padding spacing.16 on mobile; centred button3d "Start learning" 272 wide, Koji peeking above.

## Lesson player (/courses/<course>/<chapter>/<lesson>/), dark, 1384x797
- Page bg.primary #141414. Lesson frame: inset 34px left/right, top 66, radius 24px, bg.primary, overflow hidden; 1px frame edge painted by gradient layer rgba(255,255,255,.05) (content-scroll-shadow: linear-gradient masks of #141414 at 5px top and 8%/92% sides). Slides are Swiper slides (`swiper-slide`), transform transition.
- Content column 540 wide (`--content-scroll-shadow-width: min(100%, 540px + 40px)`), padding 20.
- Top bar (outside frame, h64): close icon-button 48x48 (padding 16, radius 6, border 2px transparent) at x42; progress `panda-progress--size_lg` 592x12 radius full track rgba(255,255,255,.2)?, indicator bg.green.primary, inner track overlay width transition 100ms ease-in-out; after it, upcoming-section dots 16x12 (w 3 → lg w 4, h 3) radius full bg rgba(255,255,255,.05) `transition: all 200ms`, ring-offset 3px.
- XP counter: CoFo Brilliant 16/22.4 500 (fs xl declared, lh 1.4), text.disabled rgba(255,255,255,.2), becomes text.secondary when `data-earned-xp`; sparkle icon; streak bolt button 32x32 radius 54 (`data-testid=streaks_button`, popover trigger).
- Left rail glass buttons (flag = report, speaker = voice): `data-slot=glass-button` 48x48, radius 54, border .5px transparent, bg transparent, `backdrop-filter: blur(20px) saturate(1.8)`, icon text.disabled rgba(255,255,255,.2), padding 12 22.
- Prompt text: `p` CoFo Brilliant 16/25.6 400 #fff, 540 wide.
- "Start over" button (`data-slot=button`, ghost): h48, padding 12 22, radius xs 6, border 2px transparent, `ui.actions.base` 16/20 500, rotate-ccw icon + label, colour rgba(255,255,255,.4); disabled cursor not-allowed.
- Check button (button3d, full 367 wide, h48, x508): disabled until an answer is placed.
- Koji mascot dock bottom-left 84x84 (draggable, `data-collapsed`), with a chat bubble ("Welcome to Linear Equations.") and a split glass pill: chat button 60x52 radius 9999 0 0 9999 + mic button 60x52 radius 0 9999 9999 0, border .5px, icons text.disabled.

### Interactive (`<custom-interactive>` web component, open shadow root, CSS-module classes, font CoFo Semi Mono)
- Tile ("tappy tile"): 32x32, bg #141414, border 2px #808080 (gray.600), radius 5, box-shadow 0 1px 0 0 #808080, padding 2 5; label CoFo Semi Mono 16/16 500 #fff. Variable letters sit in a chip: bg rgb(56,29,102) border 1px rgb(90,46,163) radius 2 (purple variable colour).
- Operator tile: same but radius 999 (circle), padding 0 4, glyph 12x24 svg.
- Tile well (bank slot) under each tile: rgba(255,255,255,.05), radius 4 (or 999 for operators); stacked depth layer bg rgb(56,56,56) border 2px rgb(56,56,56) with `box-shadow: 0 3px 0 0 #666`, translateY(3px), so a stack reads as a 3D key.
- Bank tray: 196x112, bg rgba(255,255,255,.1), radius 12, padding 16, gap 16.
- Answer slot (empty): 32x32, bg rgb(56,56,56), border 2px dashed #666, radius 4 (square) or 999 (circle), row gap 4 in a 2px rgba(255,255,255,.3) frame.
- Figure frame: border 2px rgba(255,255,255,.3), radius 12, padding 12.
- Algebra tiles: variable bar 22x66 bg linear-gradient(rgb(191,81,160), rgb(224,95,188)) border 2px rgb(224,95,188) radius 4 (pink.400); unit square 22x22 bg linear-gradient(#666, #808080) border 2px #808080 radius 4; stack gap 4; `transition: height .1s, width .1s, opacity .1s, background .1s`.

### Lesson evaluation: correct (dark)
- Lesson panel (`data-panel`, `data-evaluation=correct`, `data-animate`): 1320x701 at (32,64), lg: border 2px, radius 24px; border-color border.primary at rest (rgba(255,255,255,.2)) → evaluation colour, `transition: border-color .3s ease`. Correct → rgb(0,155,43) (green.700) plus an outer glow animation `borderGlow` with `--border-glow-color` green.400 (dark: #22C55E). Children fade: `data-fade-in=false` → opacity 0 .1s ease-in; true → opacity 1 .2s ease-out.
- Tutor feedback bubble (`data-type=tutor-correct`): bg rgb(0,124,35) (green.800), border .5px rgb(0,155,43), radius 16 16 16 4 (tail corner bottom-left 4px), padding 12 20 (pt/pb 2 + inner), CoFo Brilliant 16/24 500 #fff, `transition: background-color .2s, border-color .2s, color .2s`. Older chat bubbles fade to opacity .5.
- Answer row gets a green check badge at its top-right corner; placed tiles get a green 2px outline (green.500).
- XP counter: "15" with `data-earned-xp` → text.secondary rgba(255,255,255,.6), sparkle icon turns green (bg.green.primary).
- Footer buttons: "Why?" button3d secondary fill: face bg rgba(255,255,255,.2) (bg.tertiary dark), text #fff, shadow 0 4px 0 elevation.shadow.cta.secondary.fill rgba(255,255,255,.05), 100 wide. "Continue" button3d green: face bg rgb(41,204,87) (green.500), text #fff, shadow 0 4px 0 green.600 rgb(21,180,65), 259 wide. Gap 8 between.
- Button3d press: face `--button3d-translate-y` animates from -4px to 0 with shadow-y 4px → 0 (seen mid-press at -3.37px / .843 alpha), `transition: transform .1s ease-out, box-shadow .1s ease-out`.

### Lesson evaluation: incorrect, retry allowed (dark)
- Panel `data-evaluation=incorrect-retry`: border 2px rgb(183,137,0) (yellow.700 = border.warning.secondary light / text.warning.primary light), `animation: shakeX .45s`. A warm yellow glow rises from the bottom edge of the viewport (radial glow, estimated from screenshot).
- Tutor bubble `data-type=tutor-incorrect`: bg rgb(183,137,0), border .5px same, text #fff 16/24 500, "Not quite, but that's okay! If you're not making mistakes, you're not learning."
- Answer row gets a yellow ✕ badge at its top-right corner.
- Footer: "Get help" button3d secondary fill (as "Why?"), "Try again" button3d yellow: face bg rgb(247,195,37) (yellow.500), text rgb(92,68,0) (yellow.900 = text.yellow.secondary), shadow 0 4px 0 yellow.700 rgb(183,137,0).
- Neutral tutor bubble (`data-type=tutor-viewed-problem`): bg rgba(23,35,38,.88) (bg.quip dark #172326e0), border .5px rgb(62,106,116) (border.quip dark #3e6a74), 16/24 400.
- Evaluation colour tokens (special.lesson.feedback.*): correct #d4f5dd / dark #00370f, incorrect #e5e5e5 / #383838, retryable #fce49d / #403000; lesson icons correct #15b441 / #29cc57, incorrect #e14b4b / #ff5d5d, retryable #d7a613 / #f7c325.

### Koji tutor chat (opened by "Get help"), dark
- Layout: the lesson panel slides right (left edge x236 at 1384 wide) and the chat column occupies the left 400px; `transition: .833s var(--spring-smooth)` (CSS `linear()` spring curve, see motion tokens). A resize handle sits between: 4x34 pill rgba(255,255,255,.3) (icon.tertiary), hover → icon.primary / whiteAlpha.500.
- Message types (`data-type`): tutor-viewed-problem, tutor-message (bg.quip + border.quip), tutor-correct (green), tutor-incorrect (yellow), user-message.
- User message: right aligned, max-w 85%, bg.tertiary rgba(255,255,255,.1), border .5px #666, radius 16 (all corners), padding 12 20, text text.secondary 16/24. Earlier messages fade to opacity .5.
- Tutor message: 262 wide, radius 16 16 16 4, padding 12 20.
- Chat input: wrapper h53 radius 24, bg autoflip.black.100 (rgba(255,255,255,.1) dark / #0000000d light), border .5px autoflip.black.200, padding-left 20, padding-right 52 (46 below lg); textarea `body.base` 16/24, placeholder "How can I help?" (text.placeholder #999), auto-resizing, radius md 8, no ring.
- Send button (icon-button 32x32 radius full, inside input at right): empty = transparent, icon text.disabled; with text = bg `gradients.kojiSendButton` linear-gradient(0deg, #0003, #0003), linear-gradient(193deg, blue.400 #7491ff -91.21%, mint.500 #5cf0b6 113.42%), arrow icon #fff; `transition: transform .1s ease-out`.
- Keyboard hint row under input: "to type [/]  for voice [v]" with `kbd` keycaps: h21, padding 0 6 2, radius 5, border 1px (2px bottom) bg.tertiary, 12/12 text.disabled.
- Tutor highlight on a board slot (`data-tutor-highlight`, synced to a pulse timer): overlay radius 4, `box-shadow: 0 0 8px 0 rgba(255,255,255,.6)` pulsing; the slot outline tints teal in the capture.

### Modal: quit confirmation (`data-slot=modal-content`), dark
- Overlay `data-slot=modal-overlay`: fixed inset 0, bg blackAlpha.600 light / darkGrayAlpha rgba(11,11,11,.8) dark (special.overlay.default), `transition: opacity 150ms ease-in-out`, opacity 0 on `data-starting-style`/`data-ending-style` (Base UI).
- Content: 390x273 (max-w 448), bg.elevated #1e1e1e, radius 2xl 20px, `box-shadow: elevation.md` 0 0 25px 0 rgba(0,0,0,.2) (shadow.medium), padding 32 20 16 (p 8 declared), gap 24, centred with translate(-50%,-50%), `transition: opacity 150ms ease-in-out, transform 150ms ease-in-out`.
- Title `h3.textStyle_heading.md` 20/25 700; body `body.base` 16/24; header stack gap 16 (md 24), md centred text; content/actions gap 20 (md 40).
- Actions: full-width button3d primary "Keep learning" 350x48; "Quit" danger ghost button (`data-slot=button`): h48 radius 54, padding 12 22, border 2px transparent, `ui.actions.base`, colour text.danger.primary (#ff8585 dark / #c43939 light); hover bg bg.danger.secondary.hover (#270b0b dark / #ffefef light).

## App header (all signed-in pages except lesson player), dark
- Sticky header: h65 (64 + 1px bottom border), bg.elevated #1e1e1e, border-bottom 1px border.primary, `box-shadow: elevation.subtle` (0 1px 3px #0000000a) → lg `elevation.base`, padding 0 24 (md 32), z appBar, transition `common` normal ease-in.
- Logo wordmark 114x24 (lg only), text.primary.
- Nav tabs (Home / Courses / You, each with a 16px outline icon + label, gap ~6): `a` h63, `textStyle_ui.nav.default` 16/24 400, colour text.secondary; hover → text.primary and underline lifts; selected (`data-selected=true`) → text.primary, weight 500 (`ui.nav.selected`), 2px underline bg text.primary. Underline is `::after` 2px bar at top:100% that `translateY(-2px)` into view, `transition: transform 100ms linear`; unselected underline colour text.disabled.
- "Go Premium" (`data-slot=premium-button`): h41, padding 8 16, radius full, 2px gradient border (bg padding-box bg.primary, border-box linear-gradient(86deg, blue.400 #7491ff, pink.400 #ff90e0 50%, yellow.400 #f9d25c)), text 14/21 500 text.iridescent.secondary (#fff dark / #381d66 light). Active: gray.100 fill with darker gradient (#5D74CC, #CC73B3 47%, #C69C1E).
- Stat pills (keys "2 🔑", streak "0 ⚡", popover triggers): h47, padding 9 20 (py 3 px 5.5), radius 54, border 2px rgba(255,255,255,.2) (border.primary), bg transparent, `ui.actions.base` 16/20 500, gap 8, focus-visible box-shadow elevation.outline.
- Menu trigger (`data-slot=dropdown-menu-trigger`): 40x40, padding 12 (sm) / 8, radius md 8, hover and open → bg.hover, `transition: background-color 100ms linear`.
- Promo banner under header: min-h 48, padding 0 16, gap 12, centred; dark bg linear-gradient(rgba(20,20,20,.8)) over linear-gradient(90deg, rgba(116,145,255,.25), rgba(255,144,224,.25) 56%, rgba(247,195,37,.25) 118%) on bg.primary; light: rgba(255,255,255,.8) wash over #7491FF → #FF90E0 56% → #F7C325 118%, text purple.900. Copy `body.sm` → md `body.base`, 500, tabular-nums; inline underlined link.

## Course page (/courses/<slug>/), dark
- Two columns at 1384: hero card 487 wide (xl) at x188, path column 456 wide at x723.
- Hero card: bg.primary, xl border 2px border.primary, radius 2xl 20, padding 32 (pt 52 below xl), gap 16, max-w 590 → 487 xl; course icon ~64; title `h2 heading.lg` 24/30 700 (centred below xl, left at xl); description `body.base` text.secondary; meta row `body.sm` 14/21 with 16px icons ("68 Lessons", "1136 Exercises").
- Level header (sticky within path column): button 456x64, bg.primary, radius 18, 3D shadow sibling `level-header-shadow` 460x72 radius 20 bg = level colour (blue: rgb(41,75,198) = blue.700) sitting 2px above/behind; hover shadow opacity .8; active: button translateY(4px) and shadow shrinks to 68px. Eyebrow "LEVEL 1" `ui.actions.sm` 12/13.2 700 uppercase tracking .48 in level colour; title `body.base` 500 lh 1.4. Sticky fade: `::before`/`::after` gradients bg.primary → transparent 64px.
- Path nodes: circular 3D disc buttons (~64 wide) on a winding path, label to the right `body.base` 16/24: current → text.primary, locked → text.tertiary rgba(255,255,255,.4) (group hover → text.secondary). Current node is lit blue with a glow ring and Koji perched on top; locked nodes are grey discs.
- Fixed footer card (`data-testid=icp-fixed-footer-card`): 456x152, bg.elevated, border 2px border.solid #4c4c4c, radius 40, padding 24 16 16, gap 16; title "Variables" `heading.sm`-ish centred; full-width button3d blue "Start": face bg blue.500 #456dff, shadow blue.600 rgb(55,92,227), text #fff; `transition: transform var(--button3d-transition-duration, 100ms) ease-out`; Safari hover tint autoflip.white.200.

## Dropdown menu (header "☰", `data-slot=dropdown-menu-content`), dark
- Panel 280 wide, bg.elevated, radius md 8, `box-shadow: elevation.base`, mt 16, no padding; opens from scale(.95)/opacity 0 → scale(1)/1 with `transition: opacity 150ms ease-in-out, transform 150ms ease-in-out`, transform-origin from trigger.
- Items (`dropdown-menu-item`): h48, padding 12 16, `body.base` 16/24 text.primary; highlighted (hover/keyboard) bg.hover rgba(255,255,255,.1) (#0000001a light); disabled text.disabled.
- Separators 1px border.secondary between groups. Items: Settings | About, Help | Log out.

## Popover (keys, `data-slot=popover-content`), dark
- 353 wide, bg.elevated, radius md 8, `box-shadow: elevation.base`, padding 0 (content padded ~20), arrow `popover-arrow` 20x10 filled bg.elevated; enter/exit opacity 0 + scale(.95) with `transition: opacity 150ms ease-in-out, transform 150ms ease-in-out`.
- Content: big number `heading.4xl` 60/75 700 + key illustration; title `h4 heading.md` 20/25 700; body 16/24.
- Iridescent inset button (button3d variant "premium"): full width 313x52, face bg linear-gradient(86deg, blue.400 #7491ff, pink.400 #ff90e0 50%, yellow.400 #f9d25c), text #170b29 (text.iridescent.primary), padding 14 24 18, flat (no lift) with `box-shadow: inset 0 -4px 0 0 rgba(20,37,99,.3)`; press transitions box-shadow / margin-top / padding-bottom 100ms ease-out; hover opacity .85.

## Streak popover, dark
- 384 wide (w 96), same popover shell. Big count `heading.3xl` 48/60 700 + bolt icon; "Solve 1 problem to start a streak." 16/24 (number bold).
- Week row: 5 day columns, each 48 wide, gap 8: bolt-in-circle icon 48x48 (empty: fill rgba(255,255,255,.2), 1.5px white stroke ring on today; completed: pear.500 fill per `--streak-icon-fill` colors.pear.500, no stroke), day label `body.base` lh short padding 4: today bold text.primary, other days 400 text.secondary.
- Stats box: bg.disabled rgba(255,255,255,.05), radius lg 12, padding 16 0, gap 16; number 16/24 700, label text.placeholder #999.

## Home (/home/), dark, 1384x797
- Content column x192..1192 (1000 wide). "Welcome, <name>!" `body.lg` 20/30 700, nowrap, above the cards; Koji-course icon row floats above the recommended card.
- Card height token `--home-card-height: clamp(320px, 50dvh + banner, 500px)` (398.5 here); cards use container queries (`recommended-card`, `gamification-card`).
- Gamification card (streak + leagues, lg only): 384 wide, bg.primary, border 2px border.solid #4c4c4c, radius 3xl 32, overflow hidden. Streak header like the popover (0 + bolt, charge icons), divider, league shield illustration, "Unlock Leagues" `body.base` 700, "0 of 175 XP" `body.sm` text.secondary. Footer strip (premium upsell): iridescent faded bg, "Unlock all learning with Premium" `body.sm` + "Explore" pill button: h31.6, padding 6 16, radius 54, `heading.xs` 14/19.6 700, text #170b29, bg `gradients.iridescentFrame` (86deg blue.400 -7.44%, pink.400 44.8%, yellow.500 102.54%), shadow elevation.md.
- Recommended course card (`data-slot=card`): 592 wide, bg.primary, border 2px border.solid, radius 24, overflow clip, h var(--home-card-height, 440px) (386 below lg). Badge "RECOMMENDED" `panda-badge colorPalette_blue variant_subtle` radius full, padding 4 8, 12/13.2 700 uppercase tracking .48: light bg blue.200 text blue.700, dark bg blue.900 rgb(20,37,99) text blue.200 rgb(218,226,255). Course art 64, title `h3 heading.lg` at 28/35 700 centred (20px at container max-h 360), eyebrow "LEVEL 1" `ui.actions.sm` in level colour.
- Lesson rows in card: 3D path node (48) + label `body.base`; current row bold 700, next rows 400; trailing status dot 16px (bg.tertiary). Full-width blue button3d "Start" at the bottom (padding 24).
- Ask-Koji pill (fixed bottom, 552x68): radius 3xl 32, border 2px border.secondary, padding 14, `box-shadow: elevation.base`; dark bg color-mix(in srgb, autoflip.black.1000 15%, transparent) = rgba(255,255,255,.15), hover 22%; light bg color-mix(white 95%) and hover bg.elevated + border.primary; idle opacity .65; focused adds `backdrop-filter: blur(24px)` and opacity 1; `transition: background, border-color, backdrop-filter, opacity 150ms ease`. Placeholder "What do you need help with?" / "Something else..." text.secondary; trailing + and mic icons 16 text.disabled.
- Koji prompt open state: page cards slide out to the sides, heading "Hey, <name>! How can I help?" `body.lg` 20/30 600 centred, Koji mascot centre with suggestion cards (Learn Python, Prepare for a test, Learn algebra, Help with quadratics) floating around it. The suggestion cards are drawn on a `<canvas>`: ~130x84, radius ~12, bg ~rgba(255,255,255,.05), active card border 1px blue.400 with blue glow, icon 12 + 14/18 600 label (estimated from screenshot). Close ✕ and speaker glass buttons at left.

## You / progress (/you/), dark
- Content x116..1268 (1152 wide, container-lg 1216 minus padding). Section headings `h2 heading.md` 20/25 700.
- Weekly summary card (`section`): 1152 wide, min-h 208 → lg 256, border 2px border.primary, radius 2xl 20, padding 24 → md 36 (pbe 80 → lg 36), bg linear-gradient(180deg, autoflip.green.100 → autoflip.green.50) (light #eafaee→#f4fcf7; dark #004e16→#001f09). Title `heading.md` → md `heading.lg` 24/30 700; date `body.sm` text.secondary; bulleted summary `body.base`; Koji mascot peeking bottom-left.
- Segmented control (time range): track bg.secondary #1e1e1e (#f8f8f8 light), radius full, padding 4, gap 4; segment min-w 60, padding 8 12, radius full, `body.sm` 14/21, text.tertiary; checked → bg.primary + `box-shadow: elevation.base` + text.primary; `transition: background-color, box-shadow, color .15s ease-out`; focus-visible elevation.outline.
- Stat card: bg.primary, border 2px border.primary, radius 2xl 20, padding 16 24, gap 4 → lg 8, min-h 91 → lg 107; label `body.sm` text.secondary + info icon 16 at right; value `heading.lg` → lg `heading.xl` 30/37.5 700.
- Bar chart card ("Problems solved"): same card shell; title `heading.sm` → lg `heading.md`, subtitle `body.sm` text.secondary. Plain divs, not SVG: bars bg.blue.primary #456dff, width 62.5% of the column (max 56), radius base 4 on top corners only, height via `--bar-height`, zero values drawn as a 2px bar; y labels `body.sm` lh 1 text.secondary right-aligned; x labels `body.sm` centred text.secondary; faint horizontal gridlines (border.secondary). An accessible data table sits under it.
- Strength chip (`tooltip-trigger`): h40, padding 8 16, radius full, border 1px border.primary, bg.primary, `body.sm`, gap 10, arrow-up icon + label + delta pill ("+1": `body.xs` 12/18 700, padding 2 8, radius full, bg.green.secondary #004e16 dark / #d4f5dd light, text.green.primary #5ed981 / #009b2b).
- Tooltip (`data-slot=tooltip-content`): max-w 280, padding 12 16, radius lg 12, bg.elevated, `box-shadow: elevation.base`, text-align start, gap 4; title `heading.sm` 16/22.4 700, body `body.sm` text.secondary; arrow = 10x10 square rotated 45deg, radius sm 2, bg.elevated + elevation.base; opens opacity 0/scale .95 → 1 with `transition: opacity 150ms ease-in-out, transform 150ms ease-in-out`, side top.
- Empty state "No course progress yet." `body.base` italic text.secondary, left aligned under "Your learning progress".

## Courses catalog (/courses/), dark
- Container: max-w 1216 (container-lg) at lg, 432 (container-sm/md) below; mx 24 (md 0, lg 32), pt 48 → md 64. Page title `h2 heading.xl` 30/37.5 700; subtitle `body.sm` → md `body.base` text.secondary, mt 4.
- Search/ask field (a button that opens Koji): 340x52 (lg), radius full, border 2px border.primary, bg.primary, padding 4 4 4 16, gap 8; search icon 16, placeholder `body.sm` text.tertiary one line; trailing "Ask" pill (disabled look: bg.disabled, text.disabled). Hover border.hover; focus-visible border.active + elevation.outline.
- Section title `h2 heading.lg` 24/30 700. Path header row: path art 64 + eyebrow badge (`badge gray variant_minimal`: no padding, 12/13.2 700 uppercase .48 tracking, text.tertiary) + `h3 heading.md` + `body.base` text.secondary; favourite star icon-button 44x44 radius full padding 10, bg.secondary.
- Course shelf: bg.secondary #1e1e1e, radius 12 (2xl breakpoint), mt 20 (lg 12), horizontally scrollable row of course tiles joined by 2px connectors.
- Course tile (`data-slot=card`, `data-inner-course-card`): 176x176 at 2xl (152 base, 208 sm, 152 md, 217.6 lg), padding 22.72%, bg.primary, border 2px border.solid #4c4c4c, radius 2xl 20, 3D lift: `transform: translateY(-4px)` with `box-shadow: 0 4px 0 0 border.solid`; hover → border and shadow rgba(255,255,255,.3) (border.hover); `transition: transform .1s ease-out, box-shadow .1s ease-out, border-color .2s, background-color .2s`. Grade badge top-left 12px inset (gray minimal, text.tertiary); "NEW" badge top-right (`badge gray variant_solid` overridden to green.600 #15b441, padding 4 8, radius 12, #fff). Label under tile `body.base` centred; whole tile is a link-overlay.

## Settings (/settings/account/), dark
- Two columns: side menu 280 wide (`--settings-menu-width`), sticky at top appBar + 32, column gap `--settings-column-gap: spacing.8` (32); form column 592 wide.
- Side menu: bg.primary, border 1px border.primary, radius lg 12, padding 16, gap 4. Items (`data-slot=button`, ghost): h40, padding 8 16, radius md 8, left aligned; default `ui.nav.default` 16/24 400 text.secondary; selected `ui.nav.selected` 500 text.primary on bg.tertiary rgba(255,255,255,.2).
- Section title `h2 heading.lg` 24/30 700, mb 24. Sections separated by 1px border.secondary rules.
- Field (`data-slot=field`): column gap 8. Label (`field-label`) 16/20 500 text.primary; disabled field opacity .5 + not-allowed; invalid → text.danger.primary.
- Text input (`data-slot=form-input`): h52, padding 12 16, radius md 8, border 2px border.primary rgba(255,255,255,.2) (light #0000001a), bg transparent, `body.base`, placeholder text.disabled, ellipsis; focus: border 2px border.active (#e5e5e5 dark / #000 light) + inset 0 0 0 1px same colour (reads as a 3px ring), no outline; disabled: bg.secondary, no border, text.secondary.
- Flat button (`data-slot=button`), all h48, padding 12 22, radius 54, `ui.actions.base` 16/20 500, border 2px:
  - primary / inverse: bg.inverse.primary (#f2f2f2 dark / #000 light), text.inverse (#000 / #fff); hover opacity .78.
  - outline: transparent bg, border.primary border, text.primary ("Send verification", compact pill).
  - disabled: bg.disabled rgba(255,255,255,.05), text.disabled.
  - danger (disabled shown): bg.danger.disabled #270b0b, text rgb(196,57,57) (text.danger.disabled dark).
  - ghost: transparent (see "Start over", "Quit").
- Email row box: border 1px border.primary, radius md 8, padding 16; badges `badge yellow subtle` "UNVERIFIED" (dark bg yellow.950 #251b00 text yellow.400 #f9d25c; light bg yellow.100 text yellow.700) and `badge blue subtle` "PRIMARY" (dark bg blue.950 #080f28 text blue.400 #7491ff).

## Settings / Preferences (/settings/preferences/), dark
- Themes offered: Auto (system), Light, Dark. Reduce motion: On / Off / Auto (sets `data-reduced-motion` on `<html>`). No high-contrast or custom theme.
- Setting row: 592 wide, border 1px border.primary, radius xl 16, padding 18 16, gap 16, label `body.base` flex 1, control right (column below lg). Group headings ("Streaks", "Leagues"…) `body.base` 700.
- Segmented control (`data-slot=segment`): track bg.secondary, radius full, h44 (h 11), padding 6, gap 4, max-w 239. Segment h32, padding 0 10, radius full, border 1px, `ui.nav.selected` 16/24 500; unchecked text.tertiary, transparent border; checked bg.primary, border border.primary, text.primary, `box-shadow: elevation.base`; `transition: background-color, border-color, box-shadow, color .15s ease-out`.
- Switch (`data-slot=switch`): 48x32 track, padding 4, radius full; off bg.disabled rgba(255,255,255,.05) (#0000000d light); on bg.green.primary #29cc57; thumb 24 #fff, on translateX(16px), `transition: transform .15s ease`; track `transition: background .15s ease, outline-color .15s ease`, focus ring 3px; hit area extends 8/12px (`::after` inset -8 -12); disabled not-allowed, disabled+checked bg.disabled, thumb bg.primary. (The onboarding voice switch uses a teal gradient instead of green.)
- Icon button (play voice sample): 44x44 radius full, padding 12, bg.hover rgba(255,255,255,.1), border 2px transparent; disabled bg.disabled text.disabled; focus-visible elevation.outline + bg.hover.
- Email notification preferences are all switches; the app has no visible checkbox or radio component (onboarding choice cards act as radios).

## Public pages (headless Chromium 1440x900 and 390x844, `prefers-color-scheme` light and dark; full dumps in public-computed.json and pricing-computed.json)
- Landing (/) and signup (/signup → /welcome/) are light only: they ignore `prefers-color-scheme: dark`. The 404 page is the legacy Django UI, light only.
- Public header: "Sign in" outline button (h48, padding 16 24, radius 54, border 2px border.primary, `ui.actions.base`) + "Sign up" green button (bg.green.primary #29cc57, text #fff, padding 16 20, radius 54). Landing variant "Sign in": h40, padding 8 14.
- Landing hero: headline CoFo Robert serif (see screenshot), CTA pair h60 radius full padding 12 20, 20/25 500 (`ui.actions.lg`), `box-shadow: 0 4px 7px 0 rgba(0,0,0,.05)`: "I'm a learner" bg.green.primary text #fff; "I'm a parent or teacher" bg #fff text text.tertiary (#0006).
- Login: column 448 wide, padding 80 0 64. Title `h2 heading.xl` 30/37.5 700. Social row: 3 outline icon-buttons 144x48 radius full border 2px border.primary padding 16, gap 8. "OR" divider: `ui.actions.sm` 12/13.2 700 uppercase tracking .48 text.secondary with padding 8 between 1px rules (padding 16 0). Inputs `form-input` 448x52 (focused: border 2px border.active + inset 1px ring: #000 light / #e5e5e5 dark). Submit is a full-width button3d (disabled until filled). Footer links `slot=link` 16/24 with padding 0 4; "Sign up" 700 underlined; "Reset password" underlined. Cloudflare Turnstile widget (third-party) sits above the submit.
- Pricing (/subscribe/): hero headline `h1` CoFo Robert (next/font family `coFoRobertFont`, fallback Georgia, serif) 60/66 500 tracking -1.2px (display.5xl); sub `body.lg` 20/30. Hero bg `gradients.paywall.iridescentBgFlipped` (light: white fade 62.11% over rgba(255,255,255,.8) over the 66deg iridescent; dark: #141414 fade over rgba(20,20,20,.7)).
  - Billing tabs (Base UI Tabs, horizontal): 390x48, tabs 193 wide, padding 0 24, gap 10, 16/24; inactive 400 text.primary, active 500 text.purple.primary (#7139cc light / #b689ff dark) with an underline indicator; "SAVE xx%" badge solid purple.500 #9d62ff, #fff, padding 4 8, radius 12.
  - Plan cards (radio group, `data-checked`): 330x129; Koji "looking down" peeks over the checked card (svg 40x26 slides up from translateY(26px)/opacity 0). Checked card framed with the iridescent gradient border and a "MOST POPULAR" tab; plan name 20/24 700; price 16 700 + "/month*" text.secondary. Frame values estimated from screenshot (gradient = `gradients.iridescentFrame`).
  - Primary CTA "Subscribe now": 438x52 iridescent flat button3d (see keys popover).
  - Feature list tabs (vertical): 393x56 items radius md 8, active bg gray.100 #f2f2f2 light / rgba(255,255,255,.1) dark.
  - "Guided paths" section (always dark): subject pills h40 radius full padding 0 20, 16/20 500, bg linear-gradient(0deg, rgba(255,255,255,.1), rgba(255,255,255,.05)); active pill text #000 on a `::before` fill of linear-gradient(90deg, #f2f2f2, transparent) over linear-gradient(0deg, <hue>.400, <tint>) for blue / purple / yellow / orange; inactive text rgba(255,255,255,.5).
  - Section headings `h2` 36/54 700.
- 404 (legacy): h1 22/30.8 500 #333, body 15/24 #161616, "Go home" pill bg #f0f0f0 radius 54 padding 3 16 15/500; y=|x| graph illustration in teal. Not part of the Panda system.

### Lesson interactive, light theme (values read with `data-theme="light"` set on the page; `lesson-light-default.png` shows the idle state, the correct and retry states have no light screenshot, see Gaps)
- Tile: bg #fff, border 2px #ccc (gray.300), box-shadow 0 1px 0 #ccc. Stacked lip: 0 3px 0 #e5e5e5 (gray.200). Bank well rgba(0,0,0,.05). Tray rgba(0,0,0,.024).
- Empty slot: bg #f8f8f8 (gray.50), 2px dashed #ccc. Figure frame 2px rgba(0,0,0,.1).
- Unit tile linear-gradient(#e5e5e5, #ccc) border #ccc; variable bar linear-gradient(pink.300 #ffbdec, pink.400 #ff90e0) border pink.400; variable chip bg purple.100 #f5efff border purple.200 #ebe0ff.
- Lesson panel border 2px rgba(0,0,0,.1) (border.primary); disabled Check face rgba(0,0,0,.05) text rgba(0,0,0,.2).
- Tutor chat bubble stays dark in light theme: bg rgba(23,35,38,.88) border rgb(62,106,116), text #fff. The Koji area is always dark.

## Free vs Premium comparison (pricing page and in-app paywall), headless 1440 wide
- The in-app paywall shown during onboarding moved on before it could be saved; `components/crops/premium-comparison-*.png` is the same table from /subscribe/.
- Heading `h2` 36/45 700, "Premium" in gradient text: `gradients.iridescent-premium-copy-wide` linear-gradient(30deg, blue.400 21.95%, pink.400 67.27%, yellow.500 110%), background-clip text.
- Table 620 wide (padding-left 16). Benefits column 368; header `h3` 16/22.4 700 padding 20 0 24; rows h60 padding 20 0, `body.base`. Free column 108 wide, header text.secondary; Premium column framed by the iridescent gradient (border ~4px, radius ~16, estimated from screenshot) with a dark inner panel; cells hold 24px check (orange circle) or cross (grey circle) icons.
