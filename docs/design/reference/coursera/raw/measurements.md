# Raw measurements (computed styles, CSS px), coursera.org, captured 2026-09-29T03:36:35.172Z

193 components, 397 component states, 352 crops in [components/crops/](../components/crops/). Every value below was read from the live public pages with `getComputedStyle` and `getBoundingClientRect`; nothing is estimated. The machine-readable copy is [components-computed.json](components-computed.json), keyed by component, then state. Tokens are matched against [css-vars.json](css-vars.json) (the light half of each `light-dark()` pair).

## How it was read

- Pages: `/search?query=machine%20learning`, `/learn/machine-learning`, `/specializations/machine-learning-introduction`, `/` (header, mega menu, footer), `/explore/generative-ai` (the compact course card, chip row, carousel and band headings; also read in a 390x844 mobile context, and in a 390 window with the desktop user agent for the arrow buttons).
- Headless Chromium (Playwright 1.63), desktop Chrome user agent, 1440x900 at deviceScaleFactor 2, 6.5s settle after `domcontentloaded`, one slow scroll through each page so lazy sections mount. The cookie banner is removed and the AI coach side panel is closed with its own close button (it opens by default and squeezes `<main>` to 1024px).
- States: `hover` is a real mouse hover with a 450ms settle. `focus-visible` is a real keyboard focus (focus, Shift+Tab, Tab), so CDS's `cds-buttonBase-focusVisible` class and the browser's `:focus-visible` both apply. `pressed` is `:active:hover` forced with the DevTools protocol (`CSS.forcePseudoState`); no mouse button is ever pressed, so no link, submit or Enroll button fires. `expanded`, `opened`, `checked` and `selected` come from clicking UI toggles only (accordions, the Explore menu, a filter checkbox with View never pressed, the select, the (i) help button). Nothing was signed into, enrolled in or submitted.
- Scripts: [tools/capture/measure.mjs](../tools/capture/measure.mjs) (measure and crop), [tools/capture/lib.mjs](../tools/capture/lib.mjs) (computed-style reader, crop and quantize), [tools/capture/build-measurements.mjs](../tools/capture/build-measurements.mjs) (this file), [tools/capture/explore.mjs](../tools/capture/explore.mjs) (class inventory pass).
- Hooks: most sections carry `data-testid`; the hero, its title, the Enroll button and the stats slot carry `data-e2e` instead (`[data-e2e=hero-module]`, `[data-e2e=hero-title]`, `[data-e2e=enroll-button]`, `[data-e2e=key-information]`). Several blocks exist twice in the DOM (a hidden mobile copy at 0x0 and the visible one); every measurement takes the visible one.

## Ten facts for a Coursera-style course list and course page

1. Type is one family, Source Sans Pro, at weights 400 / 600 / 700. Body is 16/24 400 (`--cds-typography-body1`), secondary lines 14/20 in `#48546e` (`--cds-color-neutral-primary-weak`), card metadata 12/18. Headings are 600 with slight negative tracking: hero title 44/52 -0.1px (`--cds-typography-display2`), section headings 20/28 or 20/24, "Build your subject-matter expertise" 28/36, module titles 20/28, FAQ questions and card titles 16/20 -0.048px. Primary text is `#0d0f12` (`--cds-color-grey-975`), not black.
2. Buttons are 8px radius (`--cds-border-radius-100`) with +0.01em label tracking; labels are 600, except the header's Log In and Explore ghosts (400) and Join for Free (700). Medium is 36px tall, padding 8px 16px, 14/20; large is 48px, padding 12px 24px, 16/24. Primary is `#0056d2` (`--cds-color-interactive-primary`), hover `#0b408b`, pressed `#3c0f8a` (a purple, `--cds-color-interactive-primary-pressed`). State changes are instant: the computed transition on every button is `none`.
3. The secondary (outlined) button draws its 1px edge with `box-shadow: inset 0 0 0 1px` in the label colour (its CSS border is 0): white fill and `#0056d2` at rest, `#f0f6ff` fill and `#0b408b` on hover, `#f9f5ff` and `#3c0f8a` pressed. Ghost buttons are transparent blue text that underlines on hover; the header's Explore/Degrees ghosts are grey `#48546e` and gain a `#f0f6ff` pill on hover and while the menu is open.
4. "Enroll for free" is the same primary button at 256x64: padding 11px 80px 13px, "Enroll for free" 16/24 600 over "Starts Sep 29" 12.8/16 600, both white. The sticky-nav copy is 180x60 with 32px side padding.
5. Focus ring (all CDS controls): two 1px rings outside the element, `0 0 0 1px #804ee4, 0 0 0 2px #f0f6ff` (`--cds-color-interactive-stroke-primary-focus` then `...-focus-invert`), painted on an `::after` inset -2px with the control's own radius, plus a transparent 1px outline for forced-colours mode. Links put the same two-ring box-shadow straight on the `<a>` with a 4px radius; the checkbox adds a 2px white gap first; the in-page tabs instead use `outline: 1px solid #0056d2; outline-offset: -1px`. The search results' filter pills are not CDS and fall back to the browser's blue `auto` outline.
6. Search product card: 335x416, white, 1px `#c1cbdb` border (`--cds-color-neutral-stroke-primary-weak`), 16px radius (`--cds-border-radius-200`), no shadow at rest. Hover adds `0 0 4px 0 #e9eef7, 0 4px 12px 4px rgba(15,17,20,.1)` (the geometry of `--cds-elevation-level2` with a grey-50 first layer), `transition: all .3s cubic-bezier(0,0,.5,1)`. The 16:9 image is inset 8px with an 8px radius. Four cards per row at 1440 with a 12px gutter; three at 1024, two at 768, one at 390.
7. Card contents: 38px partner logo in a 1px-bordered 5px-radius square, partner name 16/24, title 16/20 600, "Skills you'll gain" 12/18 `#48546e` clamped to three lines, metadata "★ 4.9 (39K) · Beginner · Specialization · 1 - 3 Months" 12/18 `#48546e`, then pill tags 20px tall, 14/18 600: Free trial `#f0f6ff` on `#0d2f60`, Top AI program `#e8d6ff` on `#2c0b65`.
8. Course hero: a full-bleed 2880x524 band at `rgba(0,86,210,.05)` (sampled `#f2f6fd` on white; no token) with a 566x465 decorative Coursera-C at the right in `#e3eeff` and `#6d7c99`. Partner logos 36px tall split by a 2x32 `#a7b4c9` rule; "Top Instructor" is 16/20 600 `#0d2f60` on `#cfe2ff`, radius 4, padding 1px 5px.
9. The stats card overlaps the hero bottom (`margin-top: -76px`): 1344x114, white, 1px `#e9eef7` border, 8px radius, `box-shadow: 0 8px 16px rgba(15,17,20,.2)` (no elevation token), cells separated by 1px `#e9eef7` left borders; values 20/24 600, sub-lines 14/20 `#48546e`.
10. Tab bar: 44px tall tabs, padding 10px 12px, 16/24 600, radius 4. Selected is `#0056d2` underlined text on `#f2f5fa`; hover is `#f0f6ff`. Past the hero a fixed 146px white sticky nav appears (`0 2px 12px rgba(0,0,0,.24)`), with title row, compact Enroll and the same tabs under a 2px `#e9eef7` rule. The module list sits in a 2px `#e9eef7` bordered, 8px-radius box with 2px `#e9eef7` rules between items; module headers are full-width 76px ghost buttons (hover `#f0f6ff`). FAQ items are split by 1px `#e9eef7` rules, with a leading 24px chevron that rotates in `150ms ease-in-out`.

## Gaps

- No left filter panel exists on the search page any more. Filters are pill dropdowns in a sticky bar (Topic, Duration, Learning Product, Language, Level, AI topic pills) opening a checkbox popover, plus a Filter & Sort side sheet. There is no sort dropdown: sort is the "Sort by" radio group (Best Match / Newest) at the top of that sheet, measured as `radio` and `filter-accordion`.
- `pill` hover: the home-page partner pills sit in a horizontal carousel and Playwright reports the pill outside the viewport even when centred, so only default and focus-visible were read.
- `select-option` focus-visible: after ArrowDown in the open select no option carried `:focus`, `data-focus-visible` or `data-focused`, so that state is missing; selected and hover are measured.
- The overflow chevron at the end of the in-page tab bar is not reported visible to Playwright at 1440, so it has no entry; its two gradient fades are in the `tab-bar` paint list.
- The contextual (i) next to "Recommended experience" opens a modal dialog, not a hover tooltip; both are measured (`help-dialog`, `tooltip`, `tooltip-icon`).
- No disabled primary button appeared on these pages; disabled ghost and disabled secondary were measured in the filter popover and sheet.
- The AI coach panel, cookie banner, sign-in and enrollment flows were deliberately not measured.

## Focus rings

Read in `focus-visible` (keyboard) state. CDS paints its ring on an absolutely positioned `::after`, so the element's own `outline` stays `none` unless the browser adds one.

| Element | Component | Ring |
|---|---|---|
| Button (secondary) | `button-secondary` | transparent 1px solid outline, offset 2px (visible only in forced-colors mode); box-shadow #0b408b 0px 0px 0px 1px inset (no elevation token); ::after 107.2 x 40.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Button (primary) | `button-primary` | transparent 1px solid outline, offset 2px (visible only in forced-colors mode); box-shadow #0056d2 0px 0px 0px 1px inset (no elevation token); ::after 65.3 x 40.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Ghost button (link element) | `button-ghost` | outline 5px auto #005fcc offset -2px; ::after 64.3 x 48.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Icon button | `icon-button-search` | transparent 1px solid outline, offset 2px (visible only in forced-colors mode); box-shadow #0b408b 0px 0px 0px 1px inset (no elevation token); ::after 40.0 x 40.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Inline link | `link-inline` | transparent 1px solid outline, offset 2px (visible only in forced-colors mode); box-shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token); on a.cds-119.cds-113: #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 4px |
| Standalone link | `link-standalone` | transparent 1px solid outline, offset 2px (visible only in forced-colors mode); box-shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token); on a.cds-119.cds-113: #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 4px |
| Product card (focus on title link) | `product-card` | on a.cds-119.cds-113: #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 4px |
| Product card title link | `product-card-title-link` | transparent 1px solid outline, offset 2px (visible only in forced-colors mode); box-shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token); ::before 333.0 x 416.3, inset 0px 0px 0px 0px, radius 0px, shadow none |
| Search input | `search-input` | on div::before.cds-167.cds-152 (inset -2px -2px -2px -2px): #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 24px |
| Select | `select` | transparent 1px solid outline, offset 2px (visible only in forced-colors mode); ::before 125.7 x 36.0, inset -2px -2px -2px -2px, radius 32px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Checkbox glyph | `checkbox-box` | on svg: #ffffff 0px 0px 0px 2px, #804ee4 0px 0px 0px 3px, #f0f6ff 0px 0px 0px 4px (no elevation token), radius 4px |
| Tab | `tab` | outline 1px solid #0056d2 offset -1px |
| Chip | `chip` | transparent 1px solid outline, offset 2px (visible only in forced-colors mode); ::after 77.3 x 34.0, inset -2px -2px -2px -2px, radius 32px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Skill chip | `skill-chip` | transparent 1px solid outline, offset 2px (visible only in forced-colors mode); box-shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token); on a.cds-119.cds-113: #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 50px |
| Accordion header | `module-accordion-header` | transparent 1px solid outline, offset 2px (visible only in forced-colors mode); ::after 847.3 x 80.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| FAQ header | `faq-accordion-header` | on ancestor +2 div::after.cds-AccordionRoot-container.cds-AccordionRoot-silent: #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 16px |

## Motion

Every distinct transition on the measured components (computed style, any state), then every transition declared on a CDS rule in the stylesheets.

| Duration | Easing | Properties | Components |
|---|---|---|---|
| 0.15s | cubic-bezier(0.4, 0, 0.2, 1) | background-color | checkbox-box |
| 0.15s | ease-in-out | transform | faq-chevron |
| 0.2s | ease-in-out | transform | header-container |
| 0.3s | cubic-bezier(0, 0, 0.5, 1) | all | pill, product-card, product-card-list, explore-card |

Declared on stylesheet rules (selector attributed to its `cds-*` class):

| Duration | Easing | Where (first 6) |
|---|---|---|
| 0.2s | cubic-bezier(0, 1, 0.9, 1) | cds-button-disableElevation cds-button-ghost (0.2s cubic-bezier(0, 1, 0.9, 1)) |
| 0.3s | cubic-bezier(0, 0, 0.5, 1) | cds-ProductCard-base (0.3s cubic-bezier(0, 0, 0.5, 1))<br>cds-Pill-root (0.3s cubic-bezier(0, 0, 0.5, 1)) |
| 0.3s | ease-in-out | cds-ContextualHelpIcon-customHelpIcon (transform 0.3s ease-in-out, fill, stroke)<br>cds-ContextualHelpIcon-background (transform 0.3s ease-in-out, fill, stroke)<br>cds-ContextualHelpIcon-neck (transform 0.3s ease-in-out, fill)<br>cds-ContextualHelpIcon-dot (transform 0.3s ease-in-out)<br>cds-ContextualHelpIcon-crosspath (transform 0.3s ease-in-out, fill) |
| 0.5s | linear | cds-Loader-container (stroke-dashoffset 0.5s linear) |
| 100ms | cubic-bezier(0, 0, 0.2, 1) | cds-206 (max-width 100ms cubic-bezier(0, 0, 0.2, 1) 50ms) |
| 150ms | cubic-bezier(0, 0, 0.2, 1) | cds-204 (width 150ms cubic-bezier(0, 0, 0.2, 1)) |
| 150ms | cubic-bezier(0.4, 0, 0.2, 1) | cds-294 (background-color 150ms cubic-bezier(0.4, 0, 0.2, 1)) |
| 150ms | ease-in-out | cds-AccordionHeader-chevron (transform 150ms ease-in-out)<br>cds-button-disableElevation cds-button-ghost (transform 150ms ease-in-out)<br>cds-ShowMoreContainer-ctaIcon (transform 150ms ease-in-out) |
| 200ms | cubic-bezier(0.4, 0, 0.2, 1) | cds-178 (opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)) |
| 300ms | ease-in-out | cds-ShowMoreList-ctaIcon (transform 300ms ease-in-out) |
| 50ms | cubic-bezier(0, 0, 0.2, 1) | cds-205 (max-width 50ms cubic-bezier(0, 0, 0.2, 1)) |

## Layout grid

Read on the course page (`.xdp-page-grid-container` > `.cds-9` row > `.cds-grid-item` columns) and the search grid, in fresh headless windows at each width.

| Viewport | Container max-width | Container padding L / R | Row margin | Column padding (half gutter) | Content starts at x | Main column (about) | Search cards per row | Search card li widths | Header bar padding / max |
|---|---|---|---|---|---|---|---|---|---|
| 390 | none | 16px / 16px | -4px | 4px | 16 | 366 (100%) | 1 | 366, 366 | 16px / none |
| 768 | none | 16px / 16px | -8px | 8px | 16 | 752 (100%) | 2 | 382, 382 | 16px / none |
| 1024 | none | 48px / 48px | -16px | 16px | 48 | 640 (66.6667%) | 3 | 324, 324 | 48px / none |
| 1440 | 1440px | 48px / 48px | -16px | 16px | 48 | 917.3 (66.6667%) | 4 | 347, 347 | 48px / 1440px |
| 1920 | 1440px | 48px / 48px | -16px | 16px | 288 | 917.3 (66.6667%) | 4 | 347, 347 | 48px / 1440px |

## Components

Each table has one column per state. "same" means unchanged from the first state. Colours are hex, then the `--cds-*` token whose light value matches (semantic first, palette second); "no token" means nothing in the dump matches. Fonts are family size/line-height weight, with the matching `--cds-typography-*` tokens. The "Painted" lines list every node inside the component that draws a background, border, shadow or outline, because CDS often paints borders on a child or pseudo-element.

### Global header

#### header-top-bar

Top audience bar: For Individuals / Businesses / Universities / Governments, dark.

Page: home (https://www.coursera.org/). Selector: `[data-testid=page-header-wrapper] > div:nth-child(1)`. States: default.
Crops: `header-top-bar-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1440 x 40 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | #0d0f12 `--cds-color-emphasis-neutral-background-xxstrong` / `--cds-color-grey-975` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span.forStyle: Source Sans Pro 16/40 400, ls normal |
| Text node colour | #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 1440.0x40.0, bg #0d0f12 `--cds-color-emphasis-neutral-background-xxstrong` / `--cds-color-grey-975`; a.cds-119.cds-113, 117.3x40.0, border B:6px solid #ffffff `--cds-color-neutral-stroke-primary-invert` / `--cds-color-white-0`; a.cds-119.cds-113, 114.6x40.0, border B:6px solid transparent; a.cds-119.cds-113, 119.6x40.0, border B:6px solid transparent; a.cds-119.cds-113, 131.2x40.0, border B:6px solid transparent; ancestor +2 div.rc-GlobalPageHeaderContainer, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

#### header-container

The sticky header wrapper (both bars, 105px): white, with a 1px rule on the <nav> underneath.

Page: home (https://www.coursera.org/). Selector: `.rc-GlobalPageHeaderContainer, nav[data-testid=page-header-wrapper]`. States: default.
Crops: `header-container-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1440 x 105 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span.forStyle: Source Sans Pro 16/40 400, ls normal |
| Text node colour | #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Transition | transform 0.2s ease-in-out |
| Icon | 127 x 32, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |

- Painted in `default`: div.rc-GlobalPageHeaderContainer, 1440.0x105.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`; nav, 1440.0x105.0, border B:1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`; div, 1440.0x40.0, bg #0d0f12 `--cds-color-emphasis-neutral-background-xxstrong` / `--cds-color-grey-975`; a.cds-119.cds-113, 117.3x40.0, border B:6px solid #ffffff `--cds-color-neutral-stroke-primary-invert` / `--cds-color-white-0`; a.cds-119.cds-113, 114.6x40.0, border B:6px solid transparent; a.cds-119.cds-113, 119.6x40.0, border B:6px solid transparent

- Extra (`default`): `{"nav":{"h":105,"borderBottom":"1px solid #c1cbdb"},"position":"sticky","top":"0px","zIndex":"3000"}`

#### header-audience-link

Audience tab in the top bar. The current audience is bold with a white underline bar.

Page: home (https://www.coursera.org/). Selector: `[data-testid=page-header-wrapper] > div:nth-child(1) a`. States: selected, default, hover, focus-visible, pressed.
Crops: `header-audience-link-selected.png`, `header-audience-link-default.png`, `header-audience-link-hover.png`, `header-audience-link-focus-visible.png`, `header-audience-link-pressed.png`.

| Property | selected | default | hover | focus-visible | pressed |
|---|---|---|---|---|---|
| Size (w x h) | 117.34 x 40 | 114.63 x 40 | 114.63 x 40 | 114.63 x 40 | 114.63 x 40 |
| Padding | 0 8px | same | same | same | same |
| Margin | 0 8px | same | same | same | same |
| Display | block | same | same | same | same |
| Border | B: 6px solid #ffffff `--cds-color-neutral-stroke-primary-invert` / `--cds-color-white-0` | B: 6px solid transparent | B: 6px solid transparent | B: 6px solid transparent | B: 6px solid transparent |
| Radius | 0px | same | same | 4px `--cds-border-radius-50` | same |
| Background | transparent | same | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` |
| Box shadow | none | same | same | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |
| Outline | none | same | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 16/40 600 | Source Sans Pro 16/40 400 | Source Sans Pro 16/40 400 | Source Sans Pro 16/40 400 | Source Sans Pro 16/40 400 |
| Text node font | span.forStyle: Source Sans Pro 16/40 400, ls normal | same | same | same | same |
| Text node colour | #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` | same | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer | same | same | same | same |

- Painted in `selected`: a.cds-119.cds-113, 117.3x40.0, border B:6px solid #ffffff `--cds-color-neutral-stroke-primary-invert` / `--cds-color-white-0`
- Painted in `default`: a.cds-119.cds-113, 114.6x40.0, border B:6px solid transparent
- Painted in `hover`: a.cds-119.cds-113, 114.6x40.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border B:6px solid transparent
- Painted in `focus-visible`: a.cds-119.cds-113, 114.6x40.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border B:6px solid transparent, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px
- Painted in `pressed`: a.cds-119.cds-113, 114.6x40.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border B:6px solid transparent

- Extra (`selected`): `{"after":{"content":"none","height":"auto","bottom":"auto","bg":"transparent","width":"auto"},"before":{"content":"none","height":"auto","bg":"transparent"},"spanWeight":"600"}`
- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### header-main-bar

Main white bar: logo, Explore, Degrees, search, AI button, Log In, Join for Free.

Page: home (https://www.coursera.org/). Selector: `[data-testid=page-header-wrapper] > div:nth-child(2) .main-nav-container`. States: default.
Crops: `header-main-bar-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1440 x 64 |
| Padding | 0 48px |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal |
| Text node colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 127 x 32, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |

- Painted in `default`: div.cds-9.cds-10, 1376.0x64.0, border T:1px solid #ffffff `--cds-color-neutral-stroke-primary-invert` / `--cds-color-white-0`; div.cds-167.cds-152, 480.0x44.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 24px; button.cds-149.cds-iconButton-small, 36.0x36.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 24px; button.cds-149.cds-iconButton-medium, 48.0x48.0, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 8px; a.cds-149.cds-button-disableElevation, 103.2x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px

#### header-logo

Coursera wordmark (svg) in the main bar.

Page: home (https://www.coursera.org/). Selector: `[data-testid=home-logo]`. States: default.
Crops: `header-logo-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 127 x 32 |
| Padding | 0 |
| Display | inline |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |
| Cursor | pointer |
| Icon | 127 x 32, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |

#### button-ghost-nav

Explore menu trigger: ghost button with a chevron end icon; turns into a tinted pill when the menu is open.

Page: home (https://www.coursera.org/). Selector: `[data-testid=megamenu-explore-button]`. States: default, hover, focus-visible, pressed, expanded.
Crops: `button-ghost-nav-default.png`, `button-ghost-nav-hover.png`, `button-ghost-nav-focus-visible.png`, `button-ghost-nav-pressed.png`, `button-ghost-nav-expanded.png`.

| Property | default | hover | focus-visible | pressed | expanded |
|---|---|---|---|---|---|
| Size (w x h) | 83.8 x 36 | same | same | same | same |
| Padding | 8px | same | same | same | same |
| Display | inline-flex row, align center, justify center | same | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same | same |
| Background | transparent | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` |
| Outline | none | same | 1px solid transparent offset 2px | same | same |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same | same | same |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal | same | same | same | same |
| Text node colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Cursor | pointer | same | same | same | same |
| Icon | 20 x 20, colour #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` | same | same | same | same |
| ::after |  | same | 87.8 x 40.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same | same |

- Painted in `hover`: button.cds-149.cds-button-disableElevation, 83.8x36.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px
- Painted in `focus-visible`: button.cds-149.cds-button-disableElevation, 83.8x36.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-button-disableElevation, 87.7969pxx40px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149.cds-button-disableElevation, 83.8x36.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover
- `expanded` reached by: clicked, menu open

#### header-degrees-link

Degrees: a ghost button rendered as a link.

Page: home (https://www.coursera.org/). Selector: `[data-testid=nav-link-grid-item-degrees]`. States: default, hover, focus-visible.
Crops: `header-degrees-link-default.png`, `header-degrees-link-hover.png`, `header-degrees-link-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 62.95 x 36 | same | same |
| Padding | 8px | same | same |
| Display | inline-flex row, align center, justify center | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same |
| Background | transparent | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` |
| Outline | none | same | 1px solid transparent offset 2px |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal | same | same |
| Text node colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Cursor | pointer | same | same |
| ::after |  | same | 67.0 x 40.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |

- Painted in `hover`: a.cds-149.cds-button-disableElevation, 63.0x36.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px
- Painted in `focus-visible`: a.cds-149.cds-button-disableElevation, 63.0x36.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, outline 1px solid transparent offset 2px, radius 8px; a::after.cds-149.cds-button-disableElevation, 66.9531pxx40px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab

#### search-input

Global search: rounded field (cds-Search-base) with a round primary icon button inside the right end.

Page: home (https://www.coursera.org/). Selector: `[data-testid=search-autocomplete]`. States: default, hover, focus-visible, filled.
Crops: `search-input-default.png`, `search-input-hover.png`, `search-input-focus-visible.png`, `search-input-filled.png`.

| Property | default | hover | focus-visible | filled |
|---|---|---|---|---|
| Size (w x h) | 480 x 44 | same | same | same |
| Padding | 0 | same | same | same |
| Margin | 0 0 0 4px | same | same | same |
| Display | inline-flex row, align normal, justify normal | same | same | same |
| Radius | 0px | same | same | same |
| Background | transparent | same | same | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Icon | 0 x 0, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |

- Painted in `default`: div.cds-167.cds-152, 480.0x44.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 24px; button.cds-149.cds-iconButton-small, 36.0x36.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 24px
- Painted in `hover`: div.cds-167.cds-152, 480.0x44.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 24px; button.cds-149.cds-iconButton-small, 36.0x36.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 24px
- Painted in `focus-visible`: div.cds-167.cds-152, 480.0x44.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, outline 1px solid transparent offset 2px, radius 24px; div::before.cds-167.cds-152, 482pxx46px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 24px, inset -2px -2px -2px -2px; button.cds-149.cds-iconButton-small, 36.0x36.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 24px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `filled` reached by: typed text, not submitted

#### search-input-outline

The notched-outline fieldset that paints the field border.

Page: home (https://www.coursera.org/). Selector: `[data-testid=search-autocomplete] fieldset`. States: default, hover, focus-visible.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 478 x 47 | same | same |
| Padding | 0 8px | same | same |
| Display | block | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same |
| Background | transparent | same | same |
| Font | Source Sans Pro 16/19.0016 400 | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Cursor | text | same | same |

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab

#### search-input-field

The <input>: text style and placeholder.

Page: home (https://www.coursera.org/). Selector: `[data-testid=search-autocomplete] input`. States: default, focus-visible.

| Property | default | focus-visible |
|---|---|---|
| Size (w x h) | 394 x 48 | same |
| Padding | 12px 0 12px 12px | same |
| Display | block | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Cursor | text | same |
| Placeholder | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750`, opacity 1 | same |

- `focus-visible` reached by: Shift+Tab, Tab

#### search-autocomplete

Autocomplete suggestions under the search field.

Page: home (https://www.coursera.org/). Selector: `[role=listbox]`. States: opened.
Crops: `search-autocomplete-opened.png`.

| Property | opened |
|---|---|
| Size (w x h) | 770 x 524 |
| Padding | 8px |
| Gap | 4px |
| Display | flex column, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | strong: Source Sans Pro 16/20 700, ls -0.048px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 20 x 20, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### search-autocomplete-option

One autocomplete suggestion row.

Page: home (https://www.coursera.org/). Selector: `[role=listbox] [role=option]`. States: default, hover.
Crops: `search-autocomplete-option-default.png`, `search-autocomplete-option-hover.png`.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 754 x 60 | same |
| Padding | 8px | same |
| Gap | 12px | same |
| Display | flex row, align stretch, justify flex-start | same |
| Radius | 8px `--cds-border-radius-100` | same |
| Background | transparent | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Text node font | strong: Source Sans Pro 16/20 700, ls -0.048px | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Cursor | pointer | same |

- Painted in `hover`: div.cds-149, 754.0x60.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px; ancestor +4 div.cds-popoverDropdown-paper, shadow #0f1114 @ 0.1 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px = `--cds-elevation-level2`, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px

#### icon-button-search

Round search submit inside the field: cds-iconButton-small primary, 36x36, 20px icon.

Page: home (https://www.coursera.org/). Selector: `[data-testid=search-autocomplete] .cds-Search-actionButtons button`. States: default, hover, focus-visible, pressed.
Crops: `icon-button-search-default.png`, `icon-button-search-hover.png`, `icon-button-search-focus-visible.png`, `icon-button-search-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 36 x 36 | same | same | same |
| Padding | 0 | same | same | same |
| Display | flex row, align center, justify center | same | same | same |
| Radius | 24px `--cds-border-radius-300` | same | same | same |
| Background | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850` | #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Box shadow | #0056d2 0px 0px 0px 1px inset (no elevation token) | #0b408b 0px 0px 0px 1px inset (no elevation token) | #0b408b 0px 0px 0px 1px inset (no elevation token) | #3c0f8a 0px 0px 0px 1px inset (no elevation token) |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same | same |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same | same |
| Cursor | pointer | same | same | same |
| Icon | 20 x 20, colour #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same | same |
| ::after |  | same | 40.0 x 40.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `default`: button.cds-149.cds-iconButton-small, 36.0x36.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 24px
- Painted in `hover`: button.cds-149.cds-iconButton-small, 36.0x36.0, bg #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850`, shadow #0b408b 0px 0px 0px 1px inset (no elevation token), radius 24px
- Painted in `focus-visible`: button.cds-149.cds-iconButton-small, 36.0x36.0, bg #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850`, shadow #0b408b 0px 0px 0px 1px inset (no elevation token), outline 1px solid transparent offset 2px, radius 24px; button::after.cds-149.cds-iconButton-small, 40pxx40px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149.cds-iconButton-small, 36.0x36.0, bg #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900`, shadow #3c0f8a 0px 0px 0px 1px inset (no elevation token), radius 24px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### mega-menu

Explore mega menu: full-width white sheet under the header, four link columns, a divider and a footer line. Page behind is dimmed.

Page: home (https://www.coursera.org/). Selector: `[data-testid=simplified-megaMenu-container]`. States: expanded.
Crops: `mega-menu-expanded.png`.

| Property | expanded |
|---|---|
| Size (w x h) | 1440 x 835 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | #000000 @ 0.2 no token |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h2: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `expanded`: div, 1440.0x835.0, bg #000000 @ 0.2 no token; div, 1440.0x458.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border T:1px solid #000000 @ 0.12 no token; hr, 1168.0x1.0, bg #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`

- Extra (`expanded`): `{"scrim":{"tag":"div","cls":"css-sz55a3","backgroundColor":"#000000 @ 0.2","backgroundImage":"none"},"section":{"tag":"div","classes":"","emotion":"css-1q353p0","text":"Explore roles\nData Analyst\nProject Manager\nCyber Security Analyst\nData Scientist","rect":{"x":120,"y":120.5,"w":1200,"h":360},"style":{"display":"block","position":"static","boxSizing":"border-box","width":"1200px","height":"360px","minWidth":"0px","maxWidth":"1200px","minHeight":"0px","paddingTop":"16px","paddingRight":"16px","paddingBottom":"16px","paddingLeft":"16px","marginTop":"0px","marginRight":"120px","marginBottom":"0px","marginLeft":"120px","gap":"normal 24px","rowGap":"normal","columnGap":"24px","flexDirection":"row","alignItems":"normal","justifyContent":"space-between","gridTemplateColumns":"none","borderTopWidth":"0px","borderTopStyle":"none","borderTopColor":"#0d0f12","borderRightWidth":"0px","borderRig`

#### mega-menu-heading

Column heading in the mega menu (Explore roles).

Page: home (https://www.coursera.org/). Selector: `[data-testid=simplified-megaMenu-section] h2`. States: default.
Crops: `mega-menu-heading-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 168.73 x 20 |
| Padding | 0 |
| Margin | 0 0 8px 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium` |
| Letter spacing | -0.048px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

#### mega-menu-link

Link in a mega menu column.

Page: home (https://www.coursera.org/). Selector: `a.rc-SimpleGoalItem`. States: default, hover, focus-visible.
Crops: `mega-menu-link-default.png`, `mega-menu-link-hover.png`, `mega-menu-link-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 72.55 x 36 | same | same |
| Padding | 8px 0 | same | same |
| Display | inline | same | same |
| Radius | 0px | same | same |
| Background | transparent | same | same |
| Outline | none | same | 1px auto #005fcc no token offset 1px |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Text decoration | none | underline | underline |
| Cursor | pointer | same | same |

- Painted in `focus-visible`: a.rc-SimpleGoalItem, 72.5x36.0, outline 1px auto #005fcc offset 1px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- Repeated items: 8 measured, sizes 72.5x24.0, 95.0x24.0, 130.3x24.0, 80.2x24.0, gaps dy 0, dy 0, dy 0, dy 0, dy 0, dy 0, dy 0

#### mega-menu-view-all

"View all" link under a column: underlined.

Page: home (https://www.coursera.org/). Selector: `[data-testid=simplified-megaMenu-section] a:text-is("View all")`. States: default, hover, focus-visible.
Crops: `mega-menu-view-all-default.png`, `mega-menu-view-all-hover.png`, `mega-menu-view-all-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 44.75 x 20 | same | same |
| Padding | 0 | same | same |
| Display | inline-block | same | same |
| Radius | 0px | same | same |
| Background | transparent | same | same |
| Outline | none | same | 1px auto #005fcc no token offset 1px |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Text decoration | underline | none | none |
| Cursor | pointer | same | same |

- Painted in `focus-visible`: a, 44.8x20.0, outline 1px auto #005fcc offset 1px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab

#### mega-menu-divider

Rule between the columns and the footer line of the mega menu.

Page: home (https://www.coursera.org/). Selector: `hr in the menu`. States: default.
Crops: `mega-menu-divider-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1168 x 1 |
| Padding | 0 |
| Margin | -16px 0 0 0 |
| Display | block |
| Radius | 0px |
| Background | #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #808080 no token |

- Painted in `default`: hr, 1168.0x1.0, bg #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`

#### search-clear-button

Clear (x) button inside a filled search field.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-SearchClearButton-searchClearButton`. States: default, hover, focus-visible, pressed.
Crops: `search-clear-button-default.png`, `search-clear-button-hover.png`, `search-clear-button-focus-visible.png`, `search-clear-button-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 36 x 36 | same | same | same |
| Padding | 0 | same | same | same |
| Display | flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | same | same | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Cursor | pointer | same | same | same |
| Icon | 20 x 20, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| ::after |  | same | 20.0 x 20.0, inset 8px 8px 8px 8px, radius 50%, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `focus-visible`: button.cds-149.cds-SearchClearButton-searchClearButton, 36.0x36.0, outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-SearchClearButton-searchClearButton, 20pxx20px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 50%, inset 8px 8px 8px 8px; ancestor +2 div.cds-167.cds-152, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 24px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### search-results-heading

Results for "machine learning" heading.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.rc-SearchResultsHeader h2`. States: default.
Crops: `search-results-heading-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 261.91 x 24 |
| Padding | 0 |
| Margin | 8px 0 16px 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm` |
| Letter spacing | -0.06px |
| Text node font | span: Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm`, ls -0.06px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### icon-button-ghost

Ghost icon button, medium (AI coach trigger in the header): 48x48, 24px icon.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-testid=two-panel-chat-trigger]`. States: default, hover, focus-visible, pressed.
Crops: `icon-button-ghost-default.png`, `icon-button-ghost-hover.png`, `icon-button-ghost-focus-visible.png`, `icon-button-ghost-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 48 x 48 | same | same | same |
| Padding | 0 | same | same | same |
| Display | flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25` |
| Box shadow | transparent 0px 0px 0px 1px inset (no elevation token) | same | same | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same | same |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Cursor | pointer | same | same | same |
| Icon | 24 x 24, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | 24 x 24, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | 24 x 24, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | 24 x 24, colour #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| ::after |  | same | 52.0 x 52.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `default`: button.cds-149.cds-iconButton-medium, 48.0x48.0, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 8px
- Painted in `hover`: button.cds-149.cds-iconButton-medium, 48.0x48.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 8px
- Painted in `focus-visible`: button.cds-149.cds-iconButton-medium, 48.0x48.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, shadow transparent 0px 0px 0px 1px inset (no elevation token), outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-iconButton-medium, 52pxx52px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149.cds-iconButton-medium, 48.0x48.0, bg #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25`, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 8px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

### Buttons

#### button-ghost

Ghost button (Log In in the header): no fill, blue label.

Page: home (https://www.coursera.org/). Selector: `[data-testid=page-header-wrapper] a.cds-button-ghost:has-text("Log In")`. States: default, hover, focus-visible, pressed.
Crops: `button-ghost-default.png`, `button-ghost-hover.png`, `button-ghost-focus-visible.png`, `button-ghost-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 60.27 x 44 | same | same | same |
| Padding | 12px | same | same | same |
| Display | block | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | same | same | same |
| Outline | none | same | 5px auto #005fcc no token offset -2px | same |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same | same |
| Letter spacing | 0.14px | same | same | same |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls 0.14px | same | same | same |
| Text node colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | same |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | same |
| Text decoration | none | underline | underline | underline |
| Cursor | pointer | same | same | same |
| ::after |  | same | 64.3 x 48.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `focus-visible`: a.cds-149.cds-button-disableElevation, 60.3x44.0, outline 5px auto #005fcc offset -2px, radius 8px; a::after.cds-149.cds-button-disableElevation, 64.2656pxx48px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### button-secondary

Secondary outlined button (Join for Free): white fill, 1px blue border, blue label.

Page: home (https://www.coursera.org/). Selector: `[data-testid=page-header-wrapper] a.cds-button-secondary`. States: default, hover, focus-visible, pressed.
Crops: `button-secondary-default.png`, `button-secondary-hover.png`, `button-secondary-focus-visible.png`, `button-secondary-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 103.17 x 36 | same | same | same |
| Padding | 8px 12px | same | same | same |
| Display | inline-flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25` |
| Box shadow | #0056d2 0px 0px 0px 1px inset (no elevation token) | #0b408b 0px 0px 0px 1px inset (no elevation token) | #0b408b 0px 0px 0px 1px inset (no elevation token) | #3c0f8a 0px 0px 0px 1px inset (no elevation token) |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/20 700 `--cds-typography-title4` | same | same | same |
| Letter spacing | 0.14px | same | same | same |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 700 `--cds-typography-title4`, ls 0.14px | same | same | same |
| Text node colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Cursor | pointer | same | same | same |
| ::after |  | same | 107.2 x 40.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `default`: a.cds-149.cds-button-disableElevation, 103.2x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px
- Painted in `hover`: a.cds-149.cds-button-disableElevation, 103.2x36.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, shadow #0b408b 0px 0px 0px 1px inset (no elevation token), radius 8px
- Painted in `focus-visible`: a.cds-149.cds-button-disableElevation, 103.2x36.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, shadow #0b408b 0px 0px 0px 1px inset (no elevation token), outline 1px solid transparent offset 2px, radius 8px; a::after.cds-149.cds-button-disableElevation, 107.172pxx40px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px
- Painted in `pressed`: a.cds-149.cds-button-disableElevation, 103.2x36.0, bg #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25`, shadow #3c0f8a 0px 0px 0px 1px inset (no elevation token), radius 8px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### button-disabled-ghost

Disabled ghost button (Clear All with nothing checked).

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-popoverFooter-root .cds-button-disabled`. States: disabled.
Crops: `button-disabled-ghost-disabled.png`.

| Property | disabled |
|---|---|
| Size (w x h) | 82.7 x 36 |
| Padding | 8px 16px |
| Display | inline-flex row, align center, justify center |
| Radius | 8px `--cds-border-radius-100` |
| Background | transparent |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` |
| Letter spacing | 0.14px |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px |
| Text node colour | #a7b4c9 `--cds-color-neutral-disabled-strong` / `--cds-color-grey-300` |
| Colour | #a7b4c9 `--cds-color-neutral-disabled-strong` / `--cds-color-grey-300` |
| Cursor | default |

#### button-primary

Primary filled button, medium (View in the filter popover): solid blue, white label, 8px radius.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=filter-view-button]`. States: default, hover, focus-visible, pressed.
Crops: `button-primary-default.png`, `button-primary-hover.png`, `button-primary-focus-visible.png`, `button-primary-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 61.3 x 36 | same | same | same |
| Padding | 8px 16px | same | same | same |
| Display | inline-flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850` | same | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Box shadow | #0056d2 0px 0px 0px 1px inset (no elevation token) | same | same | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | same | same | same |
| Letter spacing | 0.14px | same | same | same |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same | same | same |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same | same |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same | same |
| Cursor | pointer | same | same | same |
| ::after |  | same | 65.3 x 40.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `default`: button.cds-149.cds-button-disableElevation, 61.3x36.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px
- Painted in `hover`: button.cds-149.cds-button-disableElevation, 61.3x36.0, bg #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px
- Painted in `focus-visible`: button.cds-149.cds-button-disableElevation, 61.3x36.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-button-disableElevation, 65.2969pxx40px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149.cds-button-disableElevation, 61.3x36.0, bg #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### button-ghost-enabled

Clear All once a box is checked: enabled ghost button.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-popoverFooter-root .cds-button-ghost`. States: default.
Crops: `button-ghost-enabled-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 82.7 x 36 |
| Padding | 8px 16px |
| Display | inline-flex row, align center, justify center |
| Radius | 8px `--cds-border-radius-100` |
| Background | transparent |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` |
| Letter spacing | 0.14px |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px |
| Text node colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |
| Cursor | pointer |

#### icon-button-close

Close (x) in the sheet: cds-iconButton-medium ghostSecondary round.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-Dialog-dialog .cds-iconButton-round`. States: default, hover, focus-visible, pressed.
Crops: `icon-button-close-default.png`, `icon-button-close-hover.png`, `icon-button-close-focus-visible.png`, `icon-button-close-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 24 x 24 | same | same | same |
| Padding | 0 | same | same | same |
| Display | flex row, align center, justify center | same | same | same |
| Radius | 50px `--cds-border-radius-max` | same | same | same |
| Background | transparent | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` |
| Box shadow | transparent 0px 0px 0px 1px inset (no elevation token) | same | same | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Cursor | pointer | same | same | same |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| ::after |  | same | 28.0 x 28.0, inset -2px -2px -2px -2px, radius 50px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `default`: button.cds-149.cds-iconButton-medium, 24.0x24.0, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 50px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px
- Painted in `hover`: button.cds-149.cds-iconButton-medium, 24.0x24.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 50px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px
- Painted in `focus-visible`: button.cds-149.cds-iconButton-medium, 24.0x24.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, shadow transparent 0px 0px 0px 1px inset (no elevation token), outline 1px solid transparent offset 2px, radius 50px; button::after.cds-149.cds-iconButton-medium, 28pxx28px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 50px, inset -2px -2px -2px -2px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px
- Painted in `pressed`: button.cds-149.cds-iconButton-medium, 24.0x24.0, bg #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 50px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### button-show-more

"Show more" under a facet list: ghost button, 24px tall.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=expand-filter-items-button]`. States: default, hover, focus-visible, pressed.
Crops: `button-show-more-default.png`, `button-show-more-hover.png`, `button-show-more-focus-visible.png`, `button-show-more-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 67.61 x 24 | same | same | same |
| Padding | 0 | same | same | same |
| Display | flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25` |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/24 400 | same | same | same |
| Letter spacing | 0.14px | same | same | same |
| Text node font | span.cds-button-label: Source Sans Pro 14/24 400, ls 0.14px | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Text decoration | underline | same | same | same |
| Cursor | pointer | same | same | same |
| ::after |  | same | 71.6 x 28.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `hover`: button.cds-149.cds-button-disableElevation, 67.6x24.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px
- Painted in `focus-visible`: button.cds-149.cds-button-disableElevation, 67.6x24.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-button-disableElevation, 71.6094pxx28px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149.cds-button-disableElevation, 67.6x24.0, bg #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25`, radius 8px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### button-primary-block

Full-width primary button at the foot of the sheet (View).

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-Dialog-dialog .cds-button-primary`. States: default, hover, focus-visible.
Crops: `button-primary-block-default.png`, `button-primary-block-hover.png`, `button-primary-block-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 328 x 36 | same | same |
| Padding | 8px 16px | same | same |
| Display | flex row, align center, justify center | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same |
| Background | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850` | same |
| Box shadow | #0056d2 0px 0px 0px 1px inset (no elevation token) | same | same |
| Outline | none | same | 1px solid transparent offset 2px |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | same | same |
| Letter spacing | 0.14px | same | same |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same | same |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same |
| Cursor | pointer | same | same |
| ::after |  | same | 332.0 x 40.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |

- Painted in `default`: button.cds-149.cds-button-disableElevation, 328.0x36.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px
- Painted in `hover`: button.cds-149.cds-button-disableElevation, 328.0x36.0, bg #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px
- Painted in `focus-visible`: button.cds-149.cds-button-disableElevation, 328.0x36.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-button-disableElevation, 332pxx40px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab

#### button-disabled-secondary

Disabled secondary button (Clear all).

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-Dialog-dialog .cds-button-secondary.cds-button-disabled`. States: disabled.
Crops: `button-disabled-secondary-disabled.png`.

| Property | disabled |
|---|---|
| Size (w x h) | 328 x 36 |
| Padding | 8px 16px |
| Display | flex row, align center, justify center |
| Radius | 8px `--cds-border-radius-100` |
| Background | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` |
| Box shadow | #a7b4c9 0px 0px 0px 1px inset (no elevation token) |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` |
| Letter spacing | 0.14px |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px |
| Text node colour | #a7b4c9 `--cds-color-neutral-disabled-strong` / `--cds-color-grey-300` |
| Colour | #a7b4c9 `--cds-color-neutral-disabled-strong` / `--cds-color-grey-300` |
| Cursor | default |

- Painted in `disabled`: button.cds-149.cds-button-disableElevation, 328.0x36.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, shadow #a7b4c9 0px 0px 0px 1px inset (no elevation token), radius 8px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

#### button-ghost-inline

"+3 more" inline ghost button in the instructor row.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `hero button.cds-button-ghost`. States: default, hover, focus-visible, pressed.
Crops: `button-ghost-inline-default.png`, `button-ghost-inline-hover.png`, `button-ghost-inline-focus-visible.png`, `button-ghost-inline-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 55.47 x 20 | same | same | same |
| Padding | 0 | same | same | same |
| Margin | 0 0 0 2px | same | same | same |
| Display | inline-flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | same | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | same | same | same |
| Letter spacing | 0.14px | same | same | same |
| Text node font | span: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Text decoration | none | underline | underline | underline |
| Cursor | pointer | same | same | same |
| ::after |  | same | 59.5 x 24.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `focus-visible`: button.cds-149.cds-button-disableElevation, 55.5x20.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-button-disableElevation, 59.4688pxx24px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### button-enroll

"Enroll for free" large two-line CTA: primary filled, 64px tall, label plus a small "Starts <date>" line. It is a submit button; pressed is forced with CDP, it is never clicked.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#hero-primary-cta button.cds-button-primary`. States: default, hover, focus-visible, pressed.
Crops: `button-enroll-default.png`, `button-enroll-hover.png`, `button-enroll-focus-visible.png`, `button-enroll-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 256.39 x 64 | same | same | same |
| Padding | 11px 80px 13px 80px | same | same | same |
| Display | inline-flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850` | same | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Box shadow | #0056d2 0px 0px 0px 1px inset (no elevation token) | same | same | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary` | same | same | same |
| Letter spacing | 0.16px | same | same | same |
| Text node font | span: Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary`, ls 0.16px | same | same | same |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same | same |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same | same |
| Cursor | pointer | same | same | same |
| ::after |  | same | 260.4 x 68.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `default`: button.cds-149.cds-button-disableElevation, 256.4x64.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px
- Painted in `hover`: button.cds-149.cds-button-disableElevation, 256.4x64.0, bg #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px
- Painted in `focus-visible`: button.cds-149.cds-button-disableElevation, 256.4x64.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-button-disableElevation, 260.391pxx68px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149.cds-button-disableElevation, 256.4x64.0, bg #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px

- Extra (`default`): `{"line1":{"font":"600 16px / 24px \SSP","color":"#ffffff","letterSpacing":"0.16px"},"line2":{"font":"600 12.8px / 16px \SSP","color":"#ffffff"}}`
- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### contextual-help-button

Info (i) toggle next to "Recommended experience": 20px button, 16px icon.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.cds-ContextualHelp-helpToggleButton`. States: default, hover, focus-visible, pressed, expanded.
Crops: `contextual-help-button-default.png`, `contextual-help-button-hover.png`, `contextual-help-button-focus-visible.png`, `contextual-help-button-pressed.png`, `contextual-help-button-expanded.png`.

| Property | default | hover | focus-visible | pressed | expanded |
|---|---|---|---|---|---|
| Size (w x h) | 20 x 20 | same | same | same | same |
| Padding | 0 | same | same | same | same |
| Margin | -8px 0 0 2px | same | same | same | same |
| Display | flex row, align center, justify center | same | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same | same |
| Background | transparent | same | same | same | same |
| Outline | none | same | 1px solid transparent offset 2px | same | same |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` | same |
| Cursor | pointer | same | same | same | same |
| Icon | 16 x 16, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | 16 x 16, colour #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | 16 x 16, colour #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | 16 x 16, colour #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` | 22.63 x 22.63, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| ::after |  | same | 18.0 x 18.0, inset 1px 1px 1px 1px, radius 50%, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same | same |

- Painted in `focus-visible`: button.cds-149.cds-ContextualHelp-helpToggleButton, 20.0x20.0, outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-ContextualHelp-helpToggleButton, 18pxx18px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 50%, inset 1px 1px 1px 1px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### button-primary-dialog

OK in the help dialog: primary button, 48px tall.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[role=dialog] .cds-button-primary`. States: default.
Crops: `button-primary-dialog-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 68.66 x 48 |
| Padding | 12px 24px |
| Display | inline-flex row, align center, justify center |
| Radius | 8px `--cds-border-radius-100` |
| Background | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |
| Box shadow | #0056d2 0px 0px 0px 1px inset (no elevation token) |
| Font | Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary` |
| Letter spacing | 0.16px |
| Text node font | span.cds-button-label: Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary`, ls 0.16px |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Cursor | pointer |

- Painted in `default`: button.cds-149.cds-button-disableElevation, 68.7x48.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px; ancestor +1 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px; ancestor +2 div.cds-Dialog-dialog, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px

#### icon-button-dialog-close

Close (x) icon button in the dialog.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[role=dialog] icon button`. States: default, hover.
Crops: `icon-button-dialog-close-default.png`, `icon-button-dialog-close-hover.png`.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 24 x 24 | same |
| Padding | 0 | same |
| Display | flex row, align center, justify center | same |
| Radius | 50px `--cds-border-radius-max` | same |
| Background | transparent | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` |
| Box shadow | transparent 0px 0px 0px 1px inset (no elevation token) | same |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` |
| Cursor | pointer | same |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | 24 x 24, colour #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` |

- Painted in `default`: button.cds-149.cds-iconButton-medium, 24.0x24.0, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 50px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px
- Painted in `hover`: button.cds-149.cds-iconButton-medium, 24.0x24.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 50px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

- `hover` reached by: mouse hover

#### button-enroll-compact

Compact Enroll CTA in the sticky nav (180x60).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-testid=fixed-page-navigation] button.cds-button-primary`. States: default.
Crops: `button-enroll-compact-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 180 x 60 |
| Padding | 11px 32px 13px 32px |
| Display | flex row, align center, justify center |
| Radius | 8px `--cds-border-radius-100` |
| Background | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |
| Box shadow | #0056d2 0px 0px 0px 1px inset (no elevation token) |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` |
| Letter spacing | 0.14px |
| Text node font | span: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Cursor | pointer |

- Painted in `default`: button.cds-149.cds-button-disableElevation, 180.0x60.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px

#### button-ghost-secondary

Ghost secondary button (Show all after the skills): dark text, underlined.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-testid=show-all-skills]`. States: default, hover, focus-visible, pressed.
Crops: `button-ghost-secondary-default.png`, `button-ghost-secondary-hover.png`, `button-ghost-secondary-focus-visible.png`, `button-ghost-secondary-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 52.25 x 20 | same | same | same |
| Padding | 0 | same | same | same |
| Display | inline-flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | same | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | same | same | same |
| Letter spacing | 0.14px | same | same | same |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` |
| Text decoration | underline | none | same | none |
| Cursor | pointer | same | same | same |
| ::after |  | same | 56.3 x 24.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `focus-visible`: button.cds-149.cds-button-disableElevation, 52.3x20.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-button-disableElevation, 56.25pxx24px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### button-ghost-text

Text-sized ghost button ("30 languages available").

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#about button.cds-button-ghost`. States: default, hover, focus-visible, pressed.
Crops: `button-ghost-text-default.png`, `button-ghost-text-hover.png`, `button-ghost-text-focus-visible.png`, `button-ghost-text-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 138.92 x 20 | same | same | same |
| Padding | 0 | same | same | same |
| Display | inline-flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | same | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | same | same | same |
| Letter spacing | 0.14px | same | same | same |
| Text node font | span: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same | same | same |
| Text node colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Text decoration | none | underline | underline | underline |
| Cursor | pointer | same | same | same |
| ::after |  | same | 142.9 x 24.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `focus-visible`: button.cds-149.cds-button-disableElevation, 138.9x20.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-button-disableElevation, 142.922pxx24px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### button-text-toggle

Legacy "Show more" text toggle (button.bold.body-2-text) under long descriptions and reviews.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules .toggle-button-wrapper button`. States: default, hover, focus-visible, pressed.
Crops: `button-text-toggle-default.png`, `button-text-toggle-hover.png`, `button-text-toggle-focus-visible.png`, `button-text-toggle-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 77.27 x 21 | same | same | same |
| Padding | 0 | same | same | same |
| Display | inline-block | same | same | same |
| Radius | 0px | same | same | same |
| Background | transparent | same | same | same |
| Outline | none | same | 1px auto #005fcc no token offset 0px | same |
| Font | OpenSans 14/21 700 | same | same | same |
| Text node font | span: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px | same | same | same |
| Text node colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same | same | same |
| Colour | #136ef0 `--cds-color-callouts-background-primary` / `--cds-color-blue-700` | same | same | same |
| Cursor | pointer | same | same | same |

- Painted in `focus-visible`: button.bold.body-2-text, 77.3x21.0, outline 1px auto #005fcc offset 0px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### show-more-container-button

"Show info about module content": ghostSecondary with a 16px chevron (cds-ShowMoreContainer-ctaButton).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.cds-ShowMoreContainer-ctaButton`. States: default, hover, focus-visible, pressed, expanded.
Crops: `show-more-container-button-default.png`, `show-more-container-button-hover.png`, `show-more-container-button-focus-visible.png`, `show-more-container-button-pressed.png`, `show-more-container-button-expanded.png`.

| Property | default | hover | focus-visible | pressed | expanded |
|---|---|---|---|---|---|
| Size (w x h) | 220.55 x 20 | same | same | same | 214.97 x 20 |
| Padding | 0 | same | same | same | same |
| Margin | 0 0 8px 0 | same | same | same | same |
| Display | inline-flex row, align center, justify center | same | same | same | same |
| Radius | 4px `--cds-border-radius-50` | same | same | same | same |
| Background | transparent | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` |
| Outline | none | same | 1px solid transparent offset 2px | same | same |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | same | same | same | same |
| Letter spacing | 0.14px | same | same | same | same |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` |
| Text decoration | none | underline | underline | underline | underline |
| Cursor | pointer | same | same | same | same |
| Icon | 16 x 16, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | 16 x 16, colour #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | 16 x 16, colour #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | 16 x 16, colour #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` | 16 x 16, colour #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` |
| ::after |  | same | 224.5 x 24.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same | same |

- Painted in `hover`: button.cds-149.cds-ShowMoreContainer-ctaButton, 220.5x20.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, radius 4px
- Painted in `focus-visible`: button.cds-149.cds-ShowMoreContainer-ctaButton, 220.5x20.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, outline 1px solid transparent offset 2px, radius 4px; button::after.cds-149.cds-ShowMoreContainer-ctaButton, 224.547pxx24px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149.cds-ShowMoreContainer-ctaButton, 220.5x20.0, bg #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 4px
- Painted in `expanded`: button.cds-149.cds-ShowMoreContainer-ctaButton, 215.0x20.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, radius 4px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### button-ghost-bold

"View all 4 instructors": ghost button, bold, blue.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `instructor card button.cds-button-ghost`. States: default, hover, focus-visible, pressed.
Crops: `button-ghost-bold-default.png`, `button-ghost-bold-hover.png`, `button-ghost-bold-focus-visible.png`, `button-ghost-bold-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 127.55 x 20 | same | same | same |
| Padding | 0 | same | same | same |
| Margin | 24px 0 0 0 | same | same | same |
| Display | inline-flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | same | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | same | same | same |
| Letter spacing | 0.14px | same | same | same |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same | same | same |
| Text node colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Text decoration | none | underline | underline | underline |
| Cursor | pointer | same | same | same |
| ::after |  | same | 131.5 x 24.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `focus-visible`: button.cds-149.cds-button-disableElevation, 127.5x20.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-button-disableElevation, 131.547pxx24px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### spec-course-toggle

Chevron toggle button at the right of a course row.

Page: spec (https://www.coursera.org/specializations/machine-learning-introduction). Selector: `#courses [data-testid=accordion-item] button.cds-button-ghost`. States: default, hover, focus-visible, pressed.
Crops: `spec-course-toggle-default.png`, `spec-course-toggle-hover.png`, `spec-course-toggle-focus-visible.png`, `spec-course-toggle-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 56 x 77 | 155.33 x 77 | 155.33 x 77 | same |
| Padding | 12px 16px | same | same | same |
| Display | flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25` |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary` | same | same | same |
| Letter spacing | 0.16px | same | same | same |
| Text node font |  | span: Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary`, ls 0.16px | span: Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary`, ls 0.16px | same |
| Text node colour |  | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | same |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Text decoration | none | underline | underline | underline |
| Cursor | pointer | same | same | same |
| Icon | 20 x 20, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same | same | same |
| ::after |  | same | 159.3 x 81.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `hover`: button.cds-149.cds-button-disableElevation, 155.3x77.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px; ancestor +2 div.cds-AccordionRoot-container.cds-AccordionRoot-silent, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px
- Painted in `focus-visible`: button.cds-149.cds-button-disableElevation, 155.3x77.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-button-disableElevation, 159.328pxx81px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px; ancestor +2 div.cds-AccordionRoot-container.cds-AccordionRoot-silent, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px
- Painted in `pressed`: button.cds-149.cds-button-disableElevation, 56.0x77.0, bg #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25`, radius 8px; ancestor +2 div.cds-AccordionRoot-container.cds-AccordionRoot-silent, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### show-more-list-button

"Show all 25 frequently asked questions": cds-ShowMoreList-ctaButton, ghost with chevron.

Page: spec (https://www.coursera.org/specializations/machine-learning-introduction). Selector: `.cds-ShowMoreList-ctaButton`. States: default, hover, focus-visible, pressed.
Crops: `show-more-list-button-default.png`, `show-more-list-button-hover.png`, `show-more-list-button-focus-visible.png`, `show-more-list-button-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 259.05 x 20 | same | same | same |
| Padding | 0 | same | same | same |
| Margin | 16px 287.141px 0 287.141px | same | same | same |
| Display | flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | same | same | same |
| Letter spacing | 0.14px | same | same | same |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` |
| Text decoration | none | underline | underline | underline |
| Cursor | pointer | same | same | same |
| Icon | 16 x 16, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | 16 x 16, colour #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | 16 x 16, colour #232b3a `--cds-color-interactive-secondary-hover` / `--cds-color-grey-900` | 16 x 16, colour #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` |
| ::after |  | same | 263.0 x 24.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `hover`: button.cds-149.cds-ShowMoreList-ctaButton, 259.0x20.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, radius 8px
- Painted in `focus-visible`: button.cds-149.cds-ShowMoreList-ctaButton, 259.0x20.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, radius 8px; button::after.cds-149.cds-ShowMoreList-ctaButton, 263.047pxx24px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149.cds-ShowMoreList-ctaButton, 259.0x20.0, bg #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 8px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

### Links and breadcrumbs

#### breadcrumbs

Breadcrumb trail (cds-breadcrumbs-list): home icon button, chevron separators (20x28), grey links.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.cds-breadcrumbs-list`. States: default.
Crops: `breadcrumbs-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 904 x 36 |
| Padding | 0 |
| Margin | 4px 0 4px -8px |
| Display | flex row, align center, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | a.cds-119.cds-113: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal |
| Text node colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 20 x 20, colour #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` |

- Painted in `default`: a.cds-149.cds-breadcrumbs-homeIcon, 36.0x36.0, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 8px

- Extra (`default`): `{"separator":{"w":20,"h":28,"color":"#0d0f12","fill":"none"}}`
- Repeated items: 4 measured, sizes 36.0x36.0, 97.8x36.0, 110.7x36.0, 139.2x36.0, gaps dx 0, dx 0, dx 0

#### breadcrumb-link

Breadcrumb link.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.cds-breadcrumbs-link`. States: default, hover, focus-visible, pressed.
Crops: `breadcrumb-link-default.png`, `breadcrumb-link-hover.png`, `breadcrumb-link-focus-visible.png`, `breadcrumb-link-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 77.78 x 36 | same | same | same |
| Padding | 8px | same | same | same |
| Display | flex row, align normal, justify normal | same | same | same |
| Radius | 0px | same | 4px `--cds-border-radius-50` | same |
| Background | transparent | same | same | same |
| Box shadow | none | same | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same | same |
| Colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` | same | same | same |
| Text decoration | none | underline | underline | underline |
| Cursor | pointer | same | same | same |

- Painted in `focus-visible`: a.cds-119.cds-113, 77.8x36.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### breadcrumb-home

Home icon at the start of the trail: cds-iconButton-small ghostSecondary.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.cds-breadcrumbs-homeIcon`. States: default, hover, focus-visible, pressed.
Crops: `breadcrumb-home-default.png`, `breadcrumb-home-hover.png`, `breadcrumb-home-focus-visible.png`, `breadcrumb-home-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 36 x 36 | same | same | same |
| Padding | 0 | same | same | same |
| Display | flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` |
| Box shadow | transparent 0px 0px 0px 1px inset (no elevation token) | same | same | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same | same |
| Colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` | same | same | same |
| Text decoration | none | underline | underline | underline |
| Cursor | pointer | same | same | same |
| Icon | 20 x 20, colour #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` | same | same | same |
| ::after |  | same | 40.0 x 40.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `default`: a.cds-149.cds-breadcrumbs-homeIcon, 36.0x36.0, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 8px
- Painted in `hover`: a.cds-149.cds-breadcrumbs-homeIcon, 36.0x36.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 8px
- Painted in `focus-visible`: a.cds-149.cds-breadcrumbs-homeIcon, 36.0x36.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, shadow transparent 0px 0px 0px 1px inset (no elevation token), outline 1px solid transparent offset 2px, radius 8px; a::after.cds-149.cds-breadcrumbs-homeIcon, 40pxx40px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px
- Painted in `pressed`: a.cds-149.cds-breadcrumbs-homeIcon, 36.0x36.0, bg #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 8px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### link-inline

Inline link in body text (the specialization name in the hero): underlined, inherits colour.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `hero p a`. States: default, hover, focus-visible, pressed.
Crops: `link-inline-default.png`, `link-inline-hover.png`, `link-inline-focus-visible.png`, `link-inline-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 221.22 x 22 | same | same | same |
| Padding | 0 | same | same | same |
| Display | inline | same | same | same |
| Radius | 0px | same | 4px `--cds-border-radius-50` | same |
| Background | transparent | same | same | same |
| Box shadow | none | same | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same | same |
| Text node font | span: Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary`, ls normal | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Text decoration | underline | none | same | none |
| Cursor | pointer | same | same | same |

- Painted in `focus-visible`: a.cds-119.cds-113, 221.2x22.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### link-standalone

Standalone link in body copy (the specialization link in Outcomes): blue, no underline until hover.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#outcomes a`. States: default, hover, focus-visible, pressed.
Crops: `link-standalone-default.png`, `link-standalone-hover.png`, `link-standalone-focus-visible.png`, `link-standalone-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 221.22 x 22 | same | same | same |
| Padding | 0 | same | same | same |
| Display | inline | same | same | same |
| Radius | 0px | same | 4px `--cds-border-radius-50` | same |
| Background | transparent | same | same | same |
| Box shadow | none | same | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary` | same | same | same |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Text decoration | none | underline | underline | underline |
| Cursor | pointer | same | same | same |

- Painted in `focus-visible`: a.cds-119.cds-113, 221.2x22.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### instructor-name

Instructor name link (underlined, semibold).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `instructor card a`. States: default, hover, focus-visible.
Crops: `instructor-name-default.png`, `instructor-name-hover.png`, `instructor-name-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 74.39 x 22 | same | same |
| Padding | 0 | same | same |
| Display | inline | same | same |
| Radius | 0px | same | 4px `--cds-border-radius-50` |
| Background | transparent | same | same |
| Box shadow | none | same | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Outline | none | same | 1px solid transparent offset 2px |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same |
| Text node font | span: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Text decoration | underline | none | same |
| Cursor | pointer | same | same |

- Painted in `focus-visible`: a.cds-119.cds-113, 74.4x22.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab

#### link-view-more

"View more reviews" link.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#reviews a`. States: default, hover, focus-visible.
Crops: `link-view-more-default.png`, `link-view-more-hover.png`, `link-view-more-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 124.41 x 22 | same | same |
| Padding | 0 | same | same |
| Display | inline | same | same |
| Radius | 0px | same | 4px `--cds-border-radius-50` |
| Background | transparent | same | same |
| Box shadow | none | same | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Outline | none | same | 1px solid transparent offset 2px |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same |
| Text node font | span: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Text decoration | underline | none | same |
| Cursor | pointer | same | same |

- Painted in `focus-visible`: a.cds-119.cds-113, 124.4x22.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab

#### spec-course-title-link

Course title link in the series list.

Page: spec (https://www.coursera.org/specializations/machine-learning-introduction). Selector: `#courses h3 a`. States: default, hover, focus-visible.
Crops: `spec-course-title-link-default.png`, `spec-course-title-link-hover.png`, `spec-course-title-link-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 505.53 x 28 | same | same |
| Padding | 0 | same | same |
| Display | inline | same | same |
| Radius | 0px | same | 4px `--cds-border-radius-50` |
| Background | transparent | same | same |
| Box shadow | none | same | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Outline | none | same | 1px solid transparent offset 2px |
| Font | Source Sans Pro 20/28 600 `--cds-typography-title2` | same | same |
| Letter spacing | -0.1px | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Text decoration | underline | same | same |
| Cursor | pointer | same | same |

- Painted in `focus-visible`: a.cds-119.cds-113, 505.5x28.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab

### Search results: filters

#### chip-suggestion

"More to explore" suggestion chip: pill outlined button, 32px tall.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=nl-suggestions] button[data-testid=chip-button-inactive]`. States: default, hover, focus-visible, pressed.
Crops: `chip-suggestion-default.png`, `chip-suggestion-hover.png`, `chip-suggestion-focus-visible.png`, `chip-suggestion-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 209.13 x 32 | same | same | same |
| Padding | 8px 10px 8px 8px | same | same | same |
| Margin | 0 3px | same | same | same |
| Gap | 4px | same | same | same |
| Display | flex row, align center, justify normal | same | same | same |
| Border | 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100` | same | same | same |
| Radius | 20px | same | same | same |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | same | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` |
| Outline | none | same | 1px auto #005fcc no token offset 3px | same |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same | same |
| Letter spacing | 0.14px | same | same | same |
| Text node font | div: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls 0.14px | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Cursor | pointer | same | same | same |

- Painted in `default`: button, 209.1x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px
- Painted in `hover`: button, 209.1x32.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px
- Painted in `focus-visible`: button, 209.1x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, outline 1px auto #005fcc offset 3px, radius 20px
- Painted in `pressed`: button, 209.1x32.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover
- Repeated items: 8 measured, sizes 209.1x32.0, 198.8x32.0, 163.8x32.0, 149.1x32.0, gaps dx 14, dx 14, dx 14, dx 14, dx 14, dx 14, dx 14

#### chip-suggestion-label

"More to explore:" label before the chips.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=nl-suggestions] span`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 111.41 x 32 |
| Padding | 0 |
| Display | flex row, align center, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### filter-bar

Sticky filter bar: Filter & Sort button, a vertical divider, then a pill dropdown per facet and AI-suggested topic pills.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=sticky-filter-bar]`. States: default.
Crops: `filter-bar-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1392 x 96 |
| Padding | 8px |
| Margin | 0 -8px |
| Gap | 8px |
| Display | flex row, align center, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | div: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 16 x 16, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: button, 127.7x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px; hr, 1.0x36.0, bg #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`; button, 87.1x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px; button, 107.8x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px; button, 159.8x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px; button, 113.6x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px; ancestor +1 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

- Repeated items: 8 measured, sizes 127.7x36.0, 87.1x36.0, 107.8x36.0, 159.8x36.0, gaps dx 17, dx 8, dx 8, dx 8, dx 8, dx 8, dy 8

#### filter-bar-divider

Vertical rule after Filter & Sort.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=sticky-filter-bar] hr`. States: default.
Crops: `filter-bar-divider-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1 x 36 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #808080 no token |

- Painted in `default`: hr, 1.0x36.0, bg #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

#### filter-and-sort-button

Filter & Sort: pill outlined button with a 16px sliders icon.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=filter-and-sort-button]`. States: default, hover, focus-visible, pressed.
Crops: `filter-and-sort-button-default.png`, `filter-and-sort-button-hover.png`, `filter-and-sort-button-focus-visible.png`, `filter-and-sort-button-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 127.7 x 36 | same | same | same |
| Padding | 8px 16px | same | same | same |
| Gap | 4px | same | same | same |
| Display | flex row, align center, justify normal | same | same | same |
| Border | 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100` | same | same | same |
| Radius | 20px | same | same | same |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | same | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` |
| Outline | none | same | 1px auto #005fcc no token offset 3px | same |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | same | same | same |
| Letter spacing | 0.14px | same | same | same |
| Text node font | div: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Cursor | pointer | same | same | same |
| Icon | 16 x 16, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |

- Painted in `default`: button, 127.7x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px
- Painted in `hover`: button, 127.7x36.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px
- Painted in `focus-visible`: button, 127.7x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, outline 1px auto #005fcc offset 3px, radius 20px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px
- Painted in `pressed`: button, 127.7x36.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px; ancestor +2 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### filter-dropdown

Facet dropdown trigger (Topic, Duration, ...): pill outlined button with a 16px chevron.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=filter-dropdown-topic]`. States: default, hover, focus-visible, pressed, expanded.
Crops: `filter-dropdown-default.png`, `filter-dropdown-hover.png`, `filter-dropdown-focus-visible.png`, `filter-dropdown-pressed.png`, `filter-dropdown-expanded.png`.

| Property | default | hover | focus-visible | pressed | expanded |
|---|---|---|---|---|---|
| Size (w x h) | 87.06 x 36 | same | same | same | same |
| Padding | 8px 16px | same | same | same | same |
| Gap | 4px | same | same | same | same |
| Display | flex row, align center, justify normal | same | same | same | same |
| Border | 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100` | same | same | same | same |
| Radius | 20px | same | same | same | same |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | same | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | same |
| Outline | none | same | 1px auto #005fcc no token offset 3px | same | same |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | same | same | same | same |
| Letter spacing | 0.14px | same | same | same | same |
| Text node font | div: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same | same |
| Cursor | pointer | same | same | same | same |
| Icon | 16 x 16, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same | same |

- Painted in `default`: button, 87.1x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px
- Painted in `hover`: button, 87.1x36.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px
- Painted in `focus-visible`: button, 87.1x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, outline 1px auto #005fcc offset 3px, radius 20px
- Painted in `pressed`: button, 87.1x36.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px
- Painted in `expanded`: button, 87.1x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover
- `expanded` reached by: clicked, popover open

#### filter-ai-pill

AI-suggested topic pill in the filter bar, with a sparkle prefix icon.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.sticky-filter-bar button[data-testid=chip-button-inactive]`. States: default, hover, focus-visible.
Crops: `filter-ai-pill-default.png`, `filter-ai-pill-hover.png`, `filter-ai-pill-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 372.22 x 36 | same | same |
| Padding | 8px 16px | same | same |
| Gap | 4px | same | same |
| Display | flex row, align center, justify normal | same | same |
| Border | 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100` | same | same |
| Radius | 20px | same | same |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | same |
| Outline | none | same | 1px auto #005fcc no token offset 3px |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | same | same |
| Letter spacing | 0.14px | same | same |
| Text node font | div: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Cursor | pointer | same | same |
| Icon | 16 x 16, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |

- Painted in `default`: button, 372.2x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px
- Painted in `hover`: button, 372.2x36.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 20px
- Painted in `focus-visible`: button, 372.2x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, outline 1px auto #005fcc offset 3px, radius 20px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab

#### filter-popover

Facet popover (cds-popoverDropdown-paper): heading, scrolling checkbox list, footer with View (primary) and Clear All (ghost, disabled until something is checked).

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-popoverDropdown-paper`. States: opened.
Crops: `filter-popover-opened.png`.

| Property | opened |
|---|---|
| Size (w x h) | 384 x 372 |
| Padding | 8px |
| Margin | 8px 0 0 0 |
| Display | flex row, align normal, justify normal |
| Radius | 16px `--cds-border-radius-200` |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` |
| Box shadow | #0f1114 @ 0.2 0px 4px 12px 4px (no elevation token) |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h3: Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm`, ls -0.06px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #000000 @ 0.87 no token |
| Icon | 18 x 18, colour #8495b0 `--cds-color-neutral-stroke-primary` / `--cds-color-grey-400` |

- Painted in `opened`: div.cds-224.cds-208, 384.0x372.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, shadow #0f1114 @ 0.2 0px 4px 12px 4px (no elevation token), radius 16px; div.cds-popoverFooter-root, 384.0x53.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border T:1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`; button.cds-149.cds-button-disableElevation, 61.3x36.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px; ancestor +2 body, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

#### filter-popover-heading

Popover heading (h3 "Topic").

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-popoverDropdown-paper h3`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 352 x 24 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm` |
| Letter spacing | -0.06px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### filter-popover-footer

Popover footer row (cds-popoverFooter-root).

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-popoverFooter-root`. States: default.
Crops: `filter-popover-footer-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 384 x 53 |
| Padding | 8px 16px |
| Margin | 0 0 0 -8px |
| Display | block |
| Border | T: 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` |
| Radius | 0px |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Colour | #000000 @ 0.87 no token |

- Painted in `default`: div.cds-popoverFooter-root, 384.0x53.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border T:1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`; button.cds-149.cds-button-disableElevation, 61.3x36.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px; ancestor +4 div.cds-224.cds-208, shadow #0f1114 @ 0.2 0px 4px 12px 4px (no elevation token), bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px

#### checkbox

Filter checkbox row (cds-checkboxAndRadio-label): 18px box, label, count in brackets.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-popoverDropdown-paper [data-testid^="topic:"] label`. States: default, hover, focus-visible, checked.
Crops: `checkbox-default.png`, `checkbox-hover.png`, `checkbox-focus-visible.png`, `checkbox-checked.png`.

| Property | default | hover | focus-visible | checked |
|---|---|---|---|---|
| Size (w x h) | 360 x 32 | same | same | same |
| Padding | 4px 0 | same | same | same |
| Gap | 8px | same | same | same |
| Display | flex row, align flex-start, justify normal | same | same | same |
| Radius | 0px | same | same | same |
| Background | transparent | same | same | same |
| Font | Source Sans Pro 16/16 400 | same | same | same |
| Text node font | span: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Colour | #000000 @ 0.87 no token | same | same | same |
| Cursor | pointer | same | same | same |
| Icon | 18 x 18, colour #8495b0 `--cds-color-neutral-stroke-primary` / `--cds-color-grey-400` | 18 x 18, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | 18 x 18, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | 18 x 18, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |

- Painted in `focus-visible`: input.cds-267, 18.0x20.0, outline 1px dotted #0b408b offset -2px; svg, 18.0x18.0, shadow #ffffff 0px 0px 0px 2px, #804ee4 0px 0px 0px 3px, #f0f6ff 0px 0px 0px 4px (no elevation token), radius 4px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `checked` reached by: clicked the label; View not pressed
- Repeated items: 8 measured, sizes 360.0x32.0, 360.0x32.0, 360.0x32.0, 360.0x32.0, gaps dy 2, dy 2, dy 2, dy 2, dy 2, dy 2, dy 2

#### checkbox-box

The 18x18 checkbox glyph (svg) itself.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-popoverDropdown-paper [data-testid^="topic:"] label > span:first-child`. States: default, hover, focus-visible, checked, checked-focus-visible.
Crops: `checkbox-box-default.png`, `checkbox-box-hover.png`, `checkbox-box-focus-visible.png`, `checkbox-box-checked.png`, `checkbox-box-checked-focus-visible.png`.

| Property | default | hover | focus-visible | checked | checked-focus-visible |
|---|---|---|---|---|---|
| Size (w x h) | 18 x 20 | same | same | same | same |
| Padding | 1px 0 | same | same | same | same |
| Margin | 2px 0 | same | same | same | same |
| Display | flex row, align center, justify center | same | same | same | same |
| Radius | 4px `--cds-border-radius-50` | same | same | same | same |
| Background | transparent | same | same | same | same |
| Font | Source Sans Pro 24/24 400 | same | same | same | same |
| Colour | #8495b0 `--cds-color-neutral-stroke-primary` / `--cds-color-grey-400` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Transition | background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1) | same | same | same | same |
| Cursor | pointer | same | same | same | same |
| Icon | 18 x 18, colour #8495b0 `--cds-color-neutral-stroke-primary` / `--cds-color-grey-400` | 18 x 18, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | 18 x 18, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | 18 x 18, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | 18 x 18, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |

- Painted in `focus-visible`: input.cds-267, 18.0x20.0, outline 1px dotted #0b408b offset -2px; svg, 18.0x18.0, shadow #ffffff 0px 0px 0px 2px, #804ee4 0px 0px 0px 3px, #f0f6ff 0px 0px 0px 4px (no elevation token), radius 4px

- Extra (`default`): `"<svg aria-hidden=\"true\" fill=\"none\" focusable=\"false\" height=\"18px\" viewBox=\"0 0 20 20\" width=\"18px\" id=\"cds-react-aria5820569149-:r46:\" class=\"css-1u8qly9\"><rect fill=\"inherit\" height=\"18\" rx=\"3.3332\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.8667\" width=\"18\" x=\"1\" y=\"1\"></rect></svg>"`
- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- Extra (`checked`): `"<svg aria-hidden=\"true\" fill=\"none\" focusable=\"false\" height=\"18px\" viewBox=\"0 0 20 20\" width=\"18px\" id=\"cds-react-aria5820569149-:r5q:\" class=\"css-1u8qly9\"><rect fill=\"currentColor\" height=\"20\" rx=\"3.3333333334\" width=\"20\"></rect><path d=\"M8.10417 12.3128L14.3333 6.08366C14.4849 5.93088 14.6616 5.85449 14.8635 5.85449C15.0656 5.85449 15.2431 5.93088 15.3958 6.08366C15.5486 6.23644 15.625 6.41408 15.625 6.61658C15.625 6.81908 15.5513 6.99401 15.404 7.14137L8.64583 13.917C8.49431 14.0698 8.31757 14.1462 8.11562 14.1462C7.91354 14.1462 7.73611 14.0698 7.58333 13.917L4.60417 10.9378C4.45139 10.785 4.375 10.608 4.375 10.4066C4.375 10.2052 4.45139 10.0281 4.60417 9.87533C4.75694 9.72255 4.93521 9.64616 5.13896 9.64616C5.34257 9.64616 5.51847 9.72255 5.66667 9.87533L8.10417 12.3128Z\" fill=\"var(--cds-color-neutral-primary-invert)\"></path></svg>"`
- `checked` reached by: clicked
- `checked-focus-visible` reached by: checked, keyboard focus

#### checkbox-count

"( 2,841 )" result count after the label.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-popoverDropdown-paper [data-testid^="topic:"] .cds-checkboxAndRadio-labelContent span span`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 45.52 x 24 |
| Padding | 0 |
| Margin | 0 0 0 4px |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #53617e `--cds-color-grey-700` |
| Cursor | pointer |

#### checkbox-label

Checkbox label text.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-popoverDropdown-paper [data-testid^="topic:"] .cds-checkboxAndRadio-labelContent`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 334 x 24 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

#### filter-sheet

Filter & Sort side sheet (cds-Dialog-dialog): 360px panel from the right, full height, title, rule, accordion per facet (Sort by first, radio), sticky footer with View (primary, full width) and Clear all (secondary, disabled).

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-Dialog-dialog`. States: opened.
Crops: `filter-sheet-opened.png`.

| Property | opened |
|---|---|
| Size (w x h) | 360 x 900 |
| Padding | 0 |
| Display | grid |
| Radius | 0px |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h3: Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm`, ls -0.06px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `opened`: div.cds-Dialog-dialog, 360.0x900.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`; div, 24.0x24.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`; button.cds-149.cds-iconButton-medium, 24.0x24.0, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 50px; hr, 360.0x1.0, bg #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`; div.cds-AccordionRoot-container.cds-AccordionRoot-silent, 356.0x152.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid transparent, radius 16px; div.cds-AccordionRoot-container.cds-AccordionRoot-silent, 356.0x50.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid transparent, radius 16px

- Extra (`opened`): `{"backdrop":{"bg":"#636363 @ 0.5","opacity":"1","transition":"opacity 0.225s cubic-bezier(0.4, 0, 0.2, 1)"},"title":{"tag":"h3","classes":"","emotion":"css-ecljj","text":"Filter & Sort","rect":{"x":1209,"y":24,"w":101.91,"h":24},"style":{"display":"block","position":"absolute","boxSizing":"border-box","width":"101.906px","height":"24px","minWidth":"0px","maxWidth":"none","minHeight":"0px","paddingTop":"0px","paddingRight":"0px","paddingBottom":"0px","paddingLeft":"0px","marginTop":"0px","marginRight":"0px","marginBottom":"0px","marginLeft":"0px","gap":"normal","rowGap":"normal","columnGap":"normal","flexDirection":"row","alignItems":"normal","justifyContent":"normal","gridTemplateColumns":"none","borderTopWidth":"0px","borderTopStyle":"none","borderTopColor":"#0d0f12","borderRightWidth":"0px","borderRightStyle":"none","borderRightColor":"#0d0f12","borderBottomWidth":"0px","borderBottomSt`

#### filter-accordion

Facet group in the sheet: cds-AccordionRoot silent, header 48px, chevron at the end.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-Dialog-dialog .cds-AccordionRoot-container`. States: expanded, collapsed.
Crops: `filter-accordion-expanded.png`, `filter-accordion-collapsed.png`.

| Property | expanded | collapsed |
|---|---|---|
| Size (w x h) | 356 x 152 | 356 x 50 |
| Padding | 0 | same |
| Display | block | same |
| Border | 1px solid transparent | same |
| Radius | 16px `--cds-border-radius-200` | same |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Text node font | span: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px | span: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |

- Painted in `expanded`: div.cds-AccordionRoot-container.cds-AccordionRoot-silent, 356.0x152.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid transparent, radius 16px
- Painted in `collapsed`: div.cds-AccordionRoot-container.cds-AccordionRoot-silent, 356.0x50.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid transparent, radius 16px

- `expanded` reached by: Sort by, open by default

#### filter-accordion-header

Accordion header button in the sheet.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-Dialog-dialog .cds-AccordionHeader-button`. States: default, hover, focus-visible, pressed.
Crops: `filter-accordion-header-default.png`, `filter-accordion-header-hover.png`, `filter-accordion-header-focus-visible.png`, `filter-accordion-header-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 354 x 48 | same | same | same |
| Padding | 12px 16px | same | same | same |
| Display | flex row, align flex-start, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | same | same | same |
| Font | Source Sans Pro 30/36 600 `--cds-typography-title-small` | same | same | same |
| Text node font | span: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Cursor | pointer | same | same | same |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### radio

Sort radio (Best Match / Newest): 20px circle.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `.cds-Dialog-dialog [role=radiogroup] label`. States: checked, default, hover, focus-visible.
Crops: `radio-checked.png`, `radio-default.png`, `radio-hover.png`, `radio-focus-visible.png`.

| Property | checked | default | hover | focus-visible |
|---|---|---|---|---|
| Size (w x h) | 101.02 x 40 | same | same | same |
| Padding | 0 | same | same | same |
| Display | block | same | same | same |
| Radius | 0px | same | same | same |
| Background | transparent | same | same | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same | same |
| Text node font | span.cds-checkboxAndRadio-labelText: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal | same | same | same |
| Text node colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Icon | 20 x 20, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | 20 x 20, colour #8495b0 `--cds-color-neutral-stroke-primary` / `--cds-color-grey-400` | 20 x 20, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | 20 x 20, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |

- Painted in `focus-visible`: input.cds-293, 20.0x20.0, outline 1px dotted #0b408b offset -2px; svg, 20.0x20.0, shadow #ffffff 0px 0px 0px 2px, #804ee4 0px 0px 0px 3px, #f0f6ff 0px 0px 0px 4px (no elevation token), radius 50%

- Extra (`checked`): `"<svg aria-hidden=\"true\" fill=\"none\" focusable=\"false\" height=\"20\" viewBox=\"0 0 20 20\" width=\"20\" id=\"cds-react-aria5820569149-:r7g:\" class=\"css-1u8qly9\"><circle class=\"cds-radioInput-checkedIconBg\" cx=\"10\" cy=\"10\" fill=\"var(--radio-checked-icon-bg)\" r=\"9.1666663\" stroke=\"currentColor\" stroke-width=\"1.6666666667\"></circle><circle cx=\"10\" cy=\"10\" fill=\"currentColor\" r=\"5.83333\"></circle></svg>"`
- Extra (`default`): `"<svg aria-hidden=\"true\" fill=\"none\" focusable=\"false\" height=\"20\" viewBox=\"0 0 20 20\" width=\"20\" id=\"cds-react-aria5820569149-:r7j:\" class=\"css-1u8qly9\"><circle cx=\"10\" cy=\"10\" fill=\"inherit\" r=\"9.1666663\" stroke=\"currentColor\" stroke-width=\"1.6666666667\"></circle></svg>"`
- `hover` reached by: mouse hover
- `focus-visible` reached by: keydown then focus()

#### filter-sheet-footer

Sheet footer holding the two buttons.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `parent of the View button`. States: default.
Crops: `filter-sheet-footer-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 360 x 104 |
| Padding | 8px 16px 16px 16px |
| Gap | 8px |
| Display | flex column, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span.cds-button-label: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: button.cds-149.cds-button-disableElevation, 328.0x36.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px; button.cds-149.cds-button-disableElevation, 328.0x36.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, shadow #a7b4c9 0px 0px 0px 1px inset (no elevation token), radius 8px; ancestor +1 div, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px; ancestor +2 div.cds-Dialog-dialog, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

#### select

Select field ("All courses" in reviews): cds-input-root with notched outline, 16px chevron.

Page: spec (https://www.coursera.org/specializations/machine-learning-introduction). Selector: `.cds-select-select`. States: default, hover, focus-visible, opened.
Crops: `select-default.png`, `select-hover.png`, `select-focus-visible.png`, `select-opened.png`.

| Property | default | hover | focus-visible | opened |
|---|---|---|---|---|
| Size (w x h) | 121.66 x 32 | same | same | same |
| Padding | 0 | same | same | same |
| Display | flex row, align center, justify normal | same | same | same |
| Radius | 32px `--cds-border-radius-400` | same | same | same |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | same | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 16/19.0016 400 | same | same | same |
| Text node font | div.cds-226.cds-227: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Cursor | text | same | same | same |
| Icon | 16 x 16, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| ::before |  | same | 125.7 x 36.0, inset -2px -2px -2px -2px, radius 32px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `default`: div.cds-167.cds-152, 121.7x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 32px; input.cds-236, 121.7x25.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 2px inset #767676 no token; fieldset.cds-203.cds-161, 121.7x37.0, border 1px solid #8495b0 `--cds-color-neutral-stroke-primary` / `--cds-color-grey-400`, radius 32px
- Painted in `hover`: div.cds-167.cds-152, 121.7x32.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 32px; input.cds-236, 121.7x25.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 2px inset #767676 no token; fieldset.cds-203.cds-161, 121.7x37.0, border 1px solid #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850`, radius 32px
- Painted in `focus-visible`: div.cds-167.cds-152, 121.7x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, outline 1px solid transparent offset 2px, radius 32px; div::before.cds-167.cds-152, 125.656pxx36px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 32px, inset -2px -2px -2px -2px; input.cds-236, 121.7x25.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 2px inset #767676 no token; fieldset.cds-203.cds-161, 121.7x37.0, border 1px solid #8495b0 `--cds-color-neutral-stroke-primary` / `--cds-color-grey-400`, radius 32px
- Painted in `opened`: div.cds-167.cds-152, 121.7x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 32px; input.cds-236, 121.7x25.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 2px inset #767676 no token; fieldset.cds-203.cds-161, 121.7x37.0, border 1px solid #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850`, radius 32px

- Extra (`default`): `{"fieldset":{"border":"1px solid #8495b0","radius":"32px","boxShadow":"none","outline":"#0d0f12 none 3px"},"value":{"font":"600 14px / 20px \SSP","color":"#0d0f12","padding":"12px 44px 12px 12px"},"icon":{"w":16,"color":"#0d0f12"}}`
- Extra (`hover`): `{"fieldset":{"border":"1px solid #0b408b","radius":"32px","boxShadow":"none","outline":"#0d0f12 none 3px"},"value":{"font":"600 14px / 20px \SSP","color":"#0b408b","padding":"12px 44px 12px 12px"},"icon":{"w":16,"color":"#0d0f12"}}`
- `hover` reached by: mouse hover
- Extra (`focus-visible`): `{"fieldset":{"border":"1px solid #8495b0","radius":"32px","boxShadow":"none","outline":"#0d0f12 none 3px"},"value":{"font":"600 14px / 20px \SSP","color":"#0d0f12","padding":"12px 44px 12px 12px"},"icon":{"w":16,"color":"#0d0f12"}}`
- `focus-visible` reached by: Shift+Tab, Tab
- Extra (`opened`): `{"fieldset":{"border":"1px solid #0b408b","boxShadow":"none"}}`

#### select-menu

Open select menu (cds-select-paper / list).

Page: spec (https://www.coursera.org/specializations/machine-learning-introduction). Selector: `.cds-select-paper`. States: opened.
Crops: `select-menu-opened.png`.

| Property | opened |
|---|---|
| Size (w x h) | 400 x 252 |
| Padding | 0 |
| Margin | 8px 0 0 0 |
| Display | block |
| Radius | 16px `--cds-border-radius-200` |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` |
| Box shadow | #0f1114 @ 0.1 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px = `--cds-elevation-level2` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | div: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Colour | #000000 @ 0.87 no token |
| Icon | 20 x 20, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |

- Painted in `opened`: div.cds-241.cds-237, 400.0x252.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, shadow #0f1114 @ 0.1 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px = `--cds-elevation-level2`, radius 16px; li.cds-149.cds-277, 368.0x40.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px; div.cds-selectOption-container, 368.0x32.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 7px; li.cds-149.cds-277, 368.0x64.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 8px; li.cds-149.cds-277, 368.0x40.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 8px; li.cds-149.cds-277, 368.0x64.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 8px; ancestor +2 body, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

#### select-option

Option row in the select menu.

Page: spec (https://www.coursera.org/specializations/machine-learning-introduction). Selector: `[role=option]`. States: selected, hover, focus-visible.
Crops: `select-option-selected.png`, `select-option-hover.png`.

| Property | selected | hover |
|---|---|---|
| Size (w x h) | 368 x 40 | 368 x 64 |
| Padding | 4px 0 | same |
| Margin | 0 | 4px 0 0 0 |
| Display | flex row, align center, justify flex-start | same |
| Radius | 8px `--cds-border-radius-100` | same |
| Background | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Text node font | div: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal | same |
| Text node colour | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | same |
| Colour | #000000 @ 0.87 no token | same |
| Cursor | pointer | same |
| Icon | 20 x 20, colour #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |  |

- Painted in `selected`: li.cds-149.cds-277, 368.0x40.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px; div.cds-selectOption-container, 368.0x32.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 7px; ancestor +2 div.cds-241.cds-237, shadow #0f1114 @ 0.1 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px = `--cds-elevation-level2`, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px
- Painted in `hover`: li.cds-149.cds-277, 368.0x64.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px; div.cds-selectOption-container, 368.0x56.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 7px; ancestor +2 div.cds-241.cds-237, shadow #0f1114 @ 0.1 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px = `--cds-elevation-level2`, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px

- `focus-visible` not captured: locator.evaluate: Timeout 8000ms exceeded.
- Repeated items: 4 measured, sizes 368.0x40.0, 368.0x64.0, 368.0x40.0, 368.0x64.0, gaps dy 4, dy 4, dy 4

### Product cards and tags

#### product-card

Search result card (cds-ProductCard-grid): bordered white card, 16:9 image inset 8px, partner logo + name, title, skills line, metadata line, tags.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid`. States: default, hover, focus-visible, pressed.
Crops: `product-card-default.png`, `product-card-hover.png`, `product-card-focus-visible.png`, `product-card-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 335 x 418.31 | same | same | same |
| Padding | 0 | same | same | same |
| Display | flex column, align normal, justify space-between | same | same | same |
| Border | 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` | same | same | same |
| Radius | 16px `--cds-border-radius-200` | same | same | same |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | same | same | same |
| Box shadow | none | #e9eef7 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px (no elevation token) | same | #e9eef7 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px (no elevation token) |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same | same |
| Text node font | p.cds-ProductCard-partnerNames: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same |
| Transition | all 0.3s cubic-bezier(0, 0, 0.5, 1) | same | same | same |
| Cursor | pointer | same | same | same |

- Painted in `default`: div.cds-ProductCard-base.cds-ProductCard-grid, 335.0x418.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; span.cds-tag-medium.cds-tag-status, 106.8x20.0, bg #e8d6ff `--cds-color-purple-100`, radius 50px; span.cds-tag-medium.cds-tag-status, 71.5x20.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, border 1px solid #f0f6ff `--cds-color-interactive-stroke-primary-focus-invert` / `--cds-color-blue-25`, radius 50px
- Painted in `hover`: div.cds-ProductCard-base.cds-ProductCard-grid, 335.0x418.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, shadow #e9eef7 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px (no elevation token), radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; span.cds-tag-medium.cds-tag-status, 106.8x20.0, bg #e8d6ff `--cds-color-purple-100`, radius 50px; span.cds-tag-medium.cds-tag-status, 71.5x20.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, border 1px solid #f0f6ff `--cds-color-interactive-stroke-primary-focus-invert` / `--cds-color-blue-25`, radius 50px
- Painted in `focus-visible`: div.cds-ProductCard-base.cds-ProductCard-grid, 335.0x418.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; a.cds-119.cds-113, 301.0x20.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px; span.cds-tag-medium.cds-tag-status, 106.8x20.0, bg #e8d6ff `--cds-color-purple-100`, radius 50px; span.cds-tag-medium.cds-tag-status, 71.5x20.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, border 1px solid #f0f6ff `--cds-color-interactive-stroke-primary-focus-invert` / `--cds-color-blue-25`, radius 50px
- Painted in `pressed`: div.cds-ProductCard-base.cds-ProductCard-grid, 335.0x418.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, shadow #e9eef7 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px (no elevation token), radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; span.cds-tag-medium.cds-tag-status, 106.8x20.0, bg #e8d6ff `--cds-color-purple-100`, radius 50px; span.cds-tag-medium.cds-tag-status, 71.5x20.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, border 1px solid #f0f6ff `--cds-color-interactive-stroke-primary-focus-invert` / `--cds-color-blue-25`, radius 50px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover
- Repeated items: 8 measured, sizes 347.0x430.3, 347.0x430.3, 347.0x430.3, 347.0x430.3, gaps dx 0, dx 0, dx 0, dy 0, dx 0, dx 0, dx 0
- Grid: `{"ul":{"width":1388,"margin":"0px -6px","gridTemplateColumns":"none","display":"flex"},"li":{"width":347,"padding":"0px","flexBasis":"25%","maxWidth":"25%"}}`

#### product-card-click-area

The inner click area (holds the hover shadow / focus ring).

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid .cds-CommonCard-clickArea`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 333 x 416.31 |
| Padding | 0 |
| Display | flex column, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | p.cds-ProductCard-partnerNames: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

- Painted in `default`: div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; span.cds-tag-medium.cds-tag-status, 106.8x20.0, bg #e8d6ff `--cds-color-purple-100`, radius 50px; span.cds-tag-medium.cds-tag-status, 71.5x20.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, border 1px solid #f0f6ff `--cds-color-interactive-stroke-primary-focus-invert` / `--cds-color-blue-25`, radius 50px; ancestor +1 div.cds-ProductCard-base.cds-ProductCard-grid, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px

#### product-card-image-container

Image well: 16:9, inset 8px, rounded.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid .cds-ProductCard-gridPreviewContainer`. States: default.
Crops: `product-card-image-container-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 317 x 178.31 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

#### product-card-image

Preview image wrapper.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid .cds-CommonCard-previewImage`. States: default.
Crops: `product-card-image-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 317 x 178.31 |
| Padding | 0 |
| Display | block |
| Radius | 8px `--cds-border-radius-100` |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

#### product-card-content

Text column under the image.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid .cds-ProductCard-content`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 317 x 222 |
| Padding | 8px |
| Gap | 8px |
| Display | flex column, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | p.cds-ProductCard-partnerNames: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

- Painted in `default`: div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; span.cds-tag-medium.cds-tag-status, 106.8x20.0, bg #e8d6ff `--cds-color-purple-100`, radius 50px; span.cds-tag-medium.cds-tag-status, 71.5x20.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, border 1px solid #f0f6ff `--cds-color-interactive-stroke-primary-focus-invert` / `--cds-color-blue-25`, radius 50px

#### product-card-partner-logo

Partner logo avatar: bordered rounded square.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid .cds-ProductCard-partnerLogos .cds-Avatar-base`. States: default.
Crops: `product-card-partner-logo-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 38 x 38 |
| Padding | 2px |
| Display | block |
| Border | 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` |
| Radius | 5px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

- Painted in `default`: div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px

#### product-card-partner-name

Partner name next to the logo.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid .cds-ProductCard-partnerNames`. States: default.
Crops: `product-card-partner-name-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 124.42 x 24 |
| Padding | 0 |
| Display | flow-root |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

#### product-card-title

Card title (h3).

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid .cds-CommonCard-title`. States: default.
Crops: `product-card-title-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 301 x 20 |
| Padding | 0 |
| Display | flow-root |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium` |
| Letter spacing | -0.048px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

#### product-card-title-link

The title link (stretched to cover the card).

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid .cds-CommonCard-titleLink`. States: default, hover, focus-visible.
Crops: `product-card-title-link-hover.png`, `product-card-title-link-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 301 x 20 | same | same |
| Padding | 0 | same | same |
| Display | block | same | same |
| Radius | 0px | same | 4px `--cds-border-radius-50` |
| Background | transparent | same | same |
| Box shadow | none | same | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Outline | none | same | 1px solid transparent offset 2px |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same |
| Text node font | h3.cds-CommonCard-title: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Cursor | pointer | same | same |
| ::before | 333.0 x 416.3, inset 0px 0px 0px 0px, radius 0px, shadow none | same | same |

- Painted in `focus-visible`: a.cds-119.cds-113, 301.0x20.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab

#### product-card-skills

Skills you'll gain line: 3-line clamp.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid .cds-CommonCard-bodyContent p`. States: default.
Crops: `product-card-skills-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 301 x 54 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 12/18 400 `--cds-typography-body-tertiary` |
| Text node font | span: Source Sans Pro 12/18 400 `--cds-typography-body-tertiary`, ls normal |
| Text node colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` |
| Colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` |
| Cursor | pointer |

#### product-card-skills-label

"Skills you'll gain :" bold lead-in.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid .cds-CommonCard-bodyContent p span`. States: default.
Crops: `product-card-skills-label-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 85.78 x 17 |
| Padding | 0 |
| Display | inline |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 12/18 400 `--cds-typography-body-tertiary` |
| Colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` |
| Cursor | pointer |

#### product-card-metadata

Rating and metadata line: ★ 4.9 (39K) · Beginner · Specialization · 1 - 3 Months.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid .cds-CommonCard-metadata p`. States: default.
Crops: `product-card-metadata-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 301 x 18 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 12/18 400 `--cds-typography-body-tertiary` |
| Colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` |
| Cursor | pointer |

#### product-card-footer

Footer block holding metadata and tags.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[data-testid=product-card-cds] .cds-ProductCard-grid .cds-ProductCard-footer`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 301 x 64 |
| Padding | 0 |
| Gap | 4px |
| Display | flex column, align normal, justify flex-end |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | p: Source Sans Pro 12/18 400 `--cds-typography-body-tertiary`, ls normal |
| Text node colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

- Painted in `default`: span.cds-tag-medium.cds-tag-status, 106.8x20.0, bg #e8d6ff `--cds-color-purple-100`, radius 50px; span.cds-tag-medium.cds-tag-status, 71.5x20.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, border 1px solid #f0f6ff `--cds-color-interactive-stroke-primary-focus-invert` / `--cds-color-blue-25`, radius 50px

#### tag-free-trial

"Free trial" tag: cds-tag-status secondary highlight1.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `span[data-testid=tag-root].cds-tag-highlight1`. States: default.
Crops: `tag-free-trial-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 71.48 x 20 |
| Padding | 0 8px |
| Display | flex row, align center, justify normal |
| Border | 1px solid #f0f6ff `--cds-color-interactive-stroke-primary-focus-invert` / `--cds-color-blue-25` |
| Radius | 50px `--cds-border-radius-max` |
| Background | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 14/18 600 `--cds-typography-subtitle-small`, ls -0.042px |
| Text node colour | #0d2f60 `--cds-color-emphasis-primary-content-default` / `--cds-color-blue-900` |
| Colour | #0d2f60 `--cds-color-emphasis-primary-content-default` / `--cds-color-blue-900` |
| Cursor | pointer |

- Painted in `default`: span.cds-tag-medium.cds-tag-status, 71.5x20.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, border 1px solid #f0f6ff `--cds-color-interactive-stroke-primary-focus-invert` / `--cds-color-blue-25`, radius 50px

- Extra (`default`): `{"text":"Free trial","font":"600 14px / 18px \SSP","color":"#0d2f60"}`
- Repeated items: 8 measured, sizes 106.8x20.0, 71.5x20.0, 71.5x20.0, 44.1x22.0, gaps dx 4, dx 164.7, dx 275.5, dx 4, dx 227.4, dx 4, dy 410.3

#### tag-top-ai

"Top AI program" status tag.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `span[data-testid=tag-root].cds-tag-status:not(.cds-tag-highlight1)`. States: default.
Crops: `tag-top-ai-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 106.83 x 20 |
| Padding | 1px 8px |
| Display | flex row, align center, justify normal |
| Radius | 50px `--cds-border-radius-max` |
| Background | #e8d6ff `--cds-color-purple-100` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 14/18 600 `--cds-typography-subtitle-small`, ls -0.042px |
| Text node colour | #2c0b65 `--cds-color-emphasis-quaternary-content-default` / `--cds-color-purple-950` |
| Colour | #2c0b65 `--cds-color-emphasis-quaternary-content-default` / `--cds-color-purple-950` |
| Cursor | pointer |

- Painted in `default`: span.cds-tag-medium.cds-tag-status, 106.8x20.0, bg #e8d6ff `--cds-color-purple-100`, radius 50px

- Extra (`default`): `{"text":"Top AI program","font":"600 14px / 18px \SSP","color":"#2c0b65"}`

#### tag-category

Category tag (e.g. "New").

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `span[data-testid=tag-root].cds-tag-category`. States: default.
Crops: `tag-category-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 44.14 x 22 |
| Padding | 0 8px |
| Display | flex row, align center, justify normal |
| Border | 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` |
| Radius | 50px `--cds-border-radius-max` |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

- Painted in `default`: span.cds-tag-medium.cds-tag-category, 44.1x22.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 50px

- Extra (`default`): `{"text":"New","font":"14px / 20px \SSP","color":"#0d0f12"}`

#### product-card-list

List variant of the product card (cds-ProductCard-list): image left (315 wide), text right.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#recommendations .cds-ProductCard-list`. States: default, hover, focus-visible.
Crops: `product-card-list-default.png`, `product-card-list-hover.png`, `product-card-list-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 664 x 189 | same | same |
| Padding | 8px | same | same |
| Display | block | same | same |
| Border | 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` | same | same |
| Radius | 16px `--cds-border-radius-200` | same | same |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | same | same |
| Box shadow | none | #e9eef7 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px (no elevation token) | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same |
| Text node font | p.cds-ProductCard-partnerNames: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Transition | all 0.3s cubic-bezier(0, 0, 0.5, 1) | same | same |
| Cursor | pointer | same | same |

- Painted in `default`: div.cds-ProductCard-base.cds-ProductCard-list, 664.0x189.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-ProductCard-listPreviewImage, 315.0x171.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 8px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px
- Painted in `hover`: div.cds-ProductCard-base.cds-ProductCard-list, 664.0x189.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, shadow #e9eef7 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px (no elevation token), radius 16px; div.cds-ProductCard-listPreviewImage, 315.0x171.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 8px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px
- Painted in `focus-visible`: div.cds-ProductCard-base.cds-ProductCard-list, 664.0x189.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-ProductCard-listPreviewImage, 315.0x171.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 8px; div.cds-Avatar-base.cds-Avatar-organization, 38.0x38.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; a.cds-119.cds-113, 315.0x20.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- Repeated items: 2 measured, sizes 680.0x205.0, 680.0x205.0, gaps dx 0

#### product-card-list-image

List card image.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#recommendations .cds-ProductCard-list .cds-ProductCard-listPreviewImage`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 315 x 171 |
| Padding | 0 |
| Display | block |
| Radius | 8px `--cds-border-radius-100` |
| Background | #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

- Painted in `default`: div.cds-ProductCard-listPreviewImage, 315.0x171.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 8px

#### product-card-list-title

List card title.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#recommendations .cds-ProductCard-list .cds-CommonCard-title`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 315 x 20 |
| Padding | 0 |
| Display | flow-root |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium` |
| Letter spacing | -0.048px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

#### tag-skill

Skill tag in an expanded course (cds-tag-medium category primary default).

Page: spec (https://www.coursera.org/specializations/machine-learning-introduction). Selector: `#courses [data-testid=tag-root]`. States: default.
Crops: `tag-skill-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 132.2 x 22 |
| Padding | 0 8px |
| Display | flex row, align center, justify normal |
| Border | 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100` |
| Radius | 50px `--cds-border-radius-max` |
| Background | #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: span.cds-tag-medium.cds-tag-category, 132.2x22.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 50px

- Extra (`default`): `{"font":"14px / 20px \SSP","color":"#0d0f12"}`
- Repeated items: 8 measured, sizes 132.2x22.0, 129.5x22.0, 137.5x22.0, 135.3x22.0, gaps dx 16, dx 16, dx 16, dx 16, dy 16, dx 16, dx 16

### Explore page: compact card, chips and carousel

#### explore-band

Explore page band (Trusted AI Learning): a full-width grey wrapper holding a 20% heading column and an 80% column with the chip row over the card carousel. The wrapper paints the fill; the block inside it (1440 wide, radius 24) paints nothing here.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `[data-testid=block_layout] parent`. States: default, mobile.
Crops: `explore-band-default.png`, `explore-band-mobile.png`.

| Property | default | mobile |
|---|---|---|
| Size (w x h) | 1440 x 351.61 | 390 x 443.25 |
| Padding | 0 | same |
| Display | block | same |
| Radius | 0px | same |
| Background | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Text node font | h2: Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm`, ls -0.06px | a.cds-119.cds-113: Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm`, ls -0.06px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Icon | 0 x 0, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | 20 x 20, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 1440.0x351.6, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`; button.cds-149.cds-Chip-root, 92.7x32.0, bg #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, border 1px solid #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, radius 32px; button.cds-149.cds-Chip-root, 53.2x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px; button.cds-149.cds-Chip-root, 111.5x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px; button.cds-149.cds-Chip-root, 90.1x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px; button.cds-149.cds-Chip-root, 87.3x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px
- Painted in `mobile`: div, 390.0x443.3, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`; button.cds-149.cds-Chip-root, 92.7x32.0, bg #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, border 1px solid #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, radius 32px; button.cds-149.cds-Chip-root, 53.2x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px; button.cds-149.cds-Chip-root, 111.5x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px; button.cds-149.cds-Chip-root, 90.1x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px; button.cds-149.cds-Chip-root, 87.3x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px

- Extra (`default`): `{"block":{"w":1440,"padding":"32px 48px","borderRadius":"24px","maxWidth":"1440px","backgroundColor":"transparent"},"row":{"display":"flex","flexWrap":"wrap","justifyContent":"center","margin":"-16px","w":1376},"columns":[{"x":32,"w":275.2,"flexBasis":"20%","maxWidth":"20%","padding":"16px","alignItems":"normal"},{"x":307.2,"w":1100.8,"flexBasis":"80%","maxWidth":"80%","padding":"16px 8px","alignItems":"center"}]}`
- Extra (`mobile`): `{"block":{"w":390,"padding":"24px 16px","borderRadius":"24px"},"columns":[{"x":12,"w":366,"flexBasis":"100%","padding":"4px 4px 0px"},{"x":12,"w":366,"flexBasis":"100%","padding":"12px 4px 4px"}],"h2Displayed":false}`
- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)

#### explore-section-heading

Band heading (h2 "Trusted AI Learning") in the left column: 600 20/24 with the -0.003em tracking of the subtitle styles.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `block h2`. States: default.
Crops: `explore-section-heading-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 164.3 x 24 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm` |
| Letter spacing | -0.06px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### explore-section-sub

Sub text under the band heading: 400 16/24 in the primary ink, 4px below the heading, wrapping in the 243px column.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `block .cds-grid-item p`. States: default, mobile.
Crops: `explore-section-sub-default.png`, `explore-section-sub-mobile.png`.

| Property | default | mobile |
|---|---|---|
| Size (w x h) | 243.19 x 120 | 358 x 72 |
| Padding | 0 | same |
| Display | block | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |

- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)

#### explore-chip-row

Row of chips above the cards: flex, wrap, 8px between chips, 8px above the cards.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `parent of .cds-Chip-root`. States: default, mobile.
Crops: `explore-chip-row-default.png`, `explore-chip-row-mobile.png`.

| Property | default | mobile |
|---|---|---|
| Size (w x h) | 1084.8 x 32 | 358 x 72 |
| Padding | 0 | same |
| Margin | 0 0 8px 0 | same |
| Gap | 8px | same |
| Display | flex row, align normal, justify normal | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Text node font | span.cds-Chip-labelText: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |

- Painted in `default`: button.cds-149.cds-Chip-root, 92.7x32.0, bg #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, border 1px solid #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, radius 32px; button.cds-149.cds-Chip-root, 53.2x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px; button.cds-149.cds-Chip-root, 111.5x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px; button.cds-149.cds-Chip-root, 90.1x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px; button.cds-149.cds-Chip-root, 87.3x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px

- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)
- Repeated items: 5 measured, sizes 92.7x32.0, 53.2x32.0, 111.5x32.0, 90.1x32.0, gaps dx 8, dx 8, dx 8, dx 8

#### explore-chip

Idle chip (cds-Chip-root): white pill, 1px grey border, 400 14/20 label, 32 tall. Read as loaded: no chip was clicked.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `button.cds-Chip-root:not(.cds-Chip-selected)`. States: default, hover, focus-visible, pressed, mobile.
Crops: `explore-chip-default.png`, `explore-chip-hover.png`, `explore-chip-focus-visible.png`, `explore-chip-pressed.png`, `explore-chip-mobile.png`.

| Property | default | hover | focus-visible | pressed | mobile |
|---|---|---|---|---|---|
| Size (w x h) | 53.19 x 32 | same | same | same | same |
| Padding | 4px 12px | same | same | same | same |
| Display | flex row, align center, justify center | same | same | same | same |
| Border | 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` | 1px solid #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | same | 1px solid #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` | same |
| Radius | 32px `--cds-border-radius-400` | same | same | same | same |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | same | #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25` | same |
| Outline | none | same | 1px solid transparent offset 2px | same | same |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same | same | same |
| Text node font | span.cds-Chip-labelText: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal | same | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | same | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | same | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` | same |
| Cursor | pointer | same | same | same | same |
| ::after |  | same | 55.2 x 34.0, inset -2px -2px -2px -2px, radius 32px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same | same |

- Painted in `default`: button.cds-149.cds-Chip-root, 53.2x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px
- Painted in `hover`: button.cds-149.cds-Chip-root, 53.2x32.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, border 1px solid #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850`, radius 32px
- Painted in `focus-visible`: button.cds-149.cds-Chip-root, 53.2x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, outline 1px solid transparent offset 2px, radius 32px; button::after.cds-149.cds-Chip-root, 55.1875pxx34px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 32px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149.cds-Chip-root, 53.2x32.0, bg #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25`, border 1px solid #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900`, radius 32px
- Painted in `mobile`: button.cds-149.cds-Chip-root, 53.2x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover
- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)

#### explore-chip-selected

Selected chip (cds-Chip-selected): near-black fill, white 600 14/20 label with 0.14px tracking, same 32px height and 12px side padding as the idle chip.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `button.cds-Chip-root.cds-Chip-selected`. States: default, hover, focus-visible, pressed.
Crops: `explore-chip-selected-default.png`, `explore-chip-selected-hover.png`, `explore-chip-selected-focus-visible.png`, `explore-chip-selected-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 92.67 x 32 | same | same | same |
| Padding | 4px 12px | same | same | same |
| Display | flex row, align center, justify center | same | same | same |
| Border | 1px solid #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` | 1px solid #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | same | 1px solid #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Radius | 32px `--cds-border-radius-400` | same | same | same |
| Background | #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` | #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850` | same | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | same | same | same |
| Letter spacing | 0.14px | same | same | same |
| Text node font | span.cds-Chip-labelText: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | same | same | same |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same | same |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same | same |
| Cursor | pointer | same | same | same |
| ::after |  | same | 94.7 x 34.0, inset -2px -2px -2px -2px, radius 32px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `default`: button.cds-149.cds-Chip-root, 92.7x32.0, bg #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, border 1px solid #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, radius 32px
- Painted in `hover`: button.cds-149.cds-Chip-root, 92.7x32.0, bg #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850`, border 1px solid #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850`, radius 32px
- Painted in `focus-visible`: button.cds-149.cds-Chip-root, 92.7x32.0, bg #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, border 1px solid #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, outline 1px solid transparent offset 2px, radius 32px; button::after.cds-149.cds-Chip-root, 94.6719pxx34px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 32px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149.cds-Chip-root, 92.7x32.0, bg #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900`, border 1px solid #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900`, radius 32px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### explore-carousel

The card row (data-testid overflow-carousel): a flex wrapper with -8px -16px margins that holds the scroll container, the card grid inside it and two absolutely placed arrow buttons. With four cards and room for four it does not scroll and both arrows are 0x0.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `[data-testid=overflow-carousel]`. States: default, mobile, narrow.
Crops: `explore-carousel-default.png`, `explore-carousel-mobile.png`, `explore-carousel-narrow.png`.

| Property | default | mobile | narrow |
|---|---|---|---|
| Size (w x h) | 1116.8 x 263.61 | 390 x 218.25 | 390 x 218.25 |
| Padding | 0 | same | same |
| Margin | -8px -16px | same | same |
| Display | flex row, align center, justify normal | same | same |
| Radius | 0px | same | same |
| Background | transparent | same | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same |
| Text node font | p.cds-ProductCard-partnerNames: Source Sans Pro 14/24 400, ls normal | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Icon | 0 x 0, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |

- Painted in `default`: div.cds-ProductCard-base.cds-ProductCard-grid, 266.2x247.6, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 266.2x247.6, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 266.2x247.6, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px
- Painted in `mobile`: div.cds-ProductCard-base.cds-ProductCard-grid, 150.0x202.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 150.0x202.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 150.0x202.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, shadow #e9eef7 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px (no elevation token), radius 16px
- Painted in `narrow`: div.cds-ProductCard-base.cds-ProductCard-grid, 150.0x202.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 150.0x202.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 150.0x202.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px

- Extra (`default`): `{"cards":4,"cardWidth":266.2,"cardPitch":278.2,"fullyVisible":4,"partlyVisible":4,"next":{"display":"none","w":0,"h":0,"x":0,"padding":"0px 0px 0px 4px"},"previous":{"display":"none","w":0,"h":0,"x":0,"padding":"0px 4px 0px 0px"},"scroller":{"overflowX":"auto","scrollSnapType":"x mandatory","scrollSnapAlign":"start","scrollSnapStop":"always","scrollBehavior":"smooth","scrollbarWidth":"none","padding":"8px 0px","scrollWidth":1117,"clientWidth":1117,"scrollLeft":0},"content":{"display":"grid","columns":"266.188px 266.203px 266.203px 266.203px","gap":"12px","padding":"0px 0px 0px 16px","role":"list","itemRole":"listitem","itemSnapAlign":"none"}}`
- Extra (`mobile`): `{"cards":4,"cardWidth":150,"cardPitch":162,"fullyVisible":2,"partlyVisible":3,"next":{"display":"none","w":0,"h":0,"x":0,"padding":"0px 0px 0px 4px"},"previous":{"display":"none","w":0,"h":0,"x":0,"padding":"0px 4px 0px 0px"},"scroller":{"overflowX":"auto","scrollSnapType":"x mandatory","scrollSnapAlign":"start","scrollSnapStop":"always","scrollBehavior":"smooth","scrollbarWidth":"none","padding":"8px 0px","scrollWidth":652,"clientWidth":390,"scrollLeft":0},"content":{"display":"grid","columns":"150px 150px 150px 150px","gap":"12px","padding":"0px 0px 0px 16px","role":"list","itemRole":"listitem","itemSnapAlign":"none"}}`
- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)
- Extra (`narrow`): `{"cards":4,"cardWidth":150,"cardPitch":162,"fullyVisible":2,"partlyVisible":3,"next":{"display":"block","w":24,"h":202.3,"x":366,"padding":"0px 0px 0px 4px"},"previous":{"display":"none","w":0,"h":0,"x":0,"padding":"0px 4px 0px 0px"},"scroller":{"overflowX":"auto","scrollSnapType":"x mandatory","scrollSnapAlign":"start","scrollSnapStop":"always","scrollBehavior":"smooth","scrollbarWidth":"none","padding":"8px 0px","scrollWidth":652,"clientWidth":390,"scrollLeft":0},"content":{"display":"grid","columns":"150px 150px 150px 150px","gap":"12px","padding":"0px 0px 0px 16px","role":"list","itemRole":"listitem","itemSnapAlign":"none"}}`
- `narrow` reached by: 390x844 window with the desktop user agent
- Repeated items: 4 measured, sizes 266.2x247.6, 266.2x247.6, 266.2x247.6, 266.2x247.6, gaps dx 12, dx 12, dx 12

#### explore-carousel-content

The card grid (data-testid overflow-carousel-content, role list): grid with 12px gap (--cds-spacing-150), 16px left padding and four equal columns, or minmax(150px, 1fr) columns below 600.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `[data-testid=overflow-carousel-content]`. States: default, mobile.

| Property | default | mobile |
|---|---|---|
| Size (w x h) | 1116.8 x 247.61 | 652 x 202.25 |
| Padding | 0 0 0 16px | same |
| Gap | 12px | same |
| Display | grid | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Text node font | p.cds-ProductCard-partnerNames: Source Sans Pro 14/24 400, ls normal | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |

- Painted in `default`: div.cds-ProductCard-base.cds-ProductCard-grid, 266.2x247.6, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 266.2x247.6, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 266.2x247.6, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px
- Painted in `mobile`: div.cds-ProductCard-base.cds-ProductCard-grid, 150.0x202.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 150.0x202.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 150.0x202.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, shadow #e9eef7 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px (no elevation token), radius 16px

- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)

#### explore-card

Compact course card: the search product card (cds-ProductCard-grid) without the skills line or tags. 8px inset 16:9 cover image, partner row, title, one type line. Height follows the tallest card in the row.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `[data-testid=overflow-carousel-content] .cds-ProductCard-grid`. States: default, hover, focus-visible, pressed, mobile.
Crops: `explore-card-default.png`, `explore-card-hover.png`, `explore-card-focus-visible.png`, `explore-card-pressed.png`, `explore-card-mobile.png`.

| Property | default | hover | focus-visible | pressed | mobile |
|---|---|---|---|---|---|
| Size (w x h) | 266.19 x 247.61 | same | same | same | 150 x 202.25 |
| Padding | 0 | same | same | same | same |
| Display | flex column, align normal, justify space-between | same | same | same | same |
| Border | 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` | same | same | same | same |
| Radius | 16px `--cds-border-radius-200` | same | same | same | same |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | same | same | same | same |
| Box shadow | none | #e9eef7 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px (no elevation token) | same | #e9eef7 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px (no elevation token) | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same | same | same |
| Text node font | p.cds-ProductCard-partnerNames: Source Sans Pro 14/24 400, ls normal | same | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same | same |
| Transition | all 0.3s cubic-bezier(0, 0, 0.5, 1) | same | same | same | same |
| Cursor | pointer | same | same | same | same |

- Painted in `default`: div.cds-ProductCard-base.cds-ProductCard-grid, 266.2x247.6, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px
- Painted in `hover`: div.cds-ProductCard-base.cds-ProductCard-grid, 266.2x247.6, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, shadow #e9eef7 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px (no elevation token), radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px
- Painted in `focus-visible`: div.cds-ProductCard-base.cds-ProductCard-grid, 266.2x247.6, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; a.cds-119.cds-113, 232.2x20.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px
- Painted in `pressed`: div.cds-ProductCard-base.cds-ProductCard-grid, 266.2x247.6, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, shadow #e9eef7 0px 0px 4px 0px, #0f1114 @ 0.1 0px 4px 12px 4px (no elevation token), radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px
- Painted in `mobile`: div.cds-ProductCard-base.cds-ProductCard-grid, 150.0x202.3, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover
- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)

#### explore-card-click-area

The inner click area that holds the hover shadow and focus ring.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `.cds-ProductCard-grid .cds-CommonCard-clickArea`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 264.19 x 245.61 |
| Padding | 0 |
| Display | flex column, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | p.cds-ProductCard-partnerNames: Source Sans Pro 14/24 400, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

- Painted in `default`: div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; ancestor +1 div.cds-ProductCard-base.cds-ProductCard-grid, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px

#### explore-card-image-container

Image well: 16:9, inset 8px.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `.cds-ProductCard-grid .cds-ProductCard-gridPreviewContainer`. States: default, mobile.
Crops: `explore-card-image-container-default.png`, `explore-card-image-container-mobile.png`.

| Property | default | mobile |
|---|---|---|
| Size (w x h) | 248.19 x 139.59 | 132 x 74.25 |
| Padding | 0 | same |
| Display | block | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Cursor | pointer | same |

- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)

#### explore-card-image

Preview image wrapper: 16:9, radius 8, clips an img with object-fit cover.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `.cds-ProductCard-grid .cds-CommonCard-previewImage`. States: default, mobile.
Crops: `explore-card-image-default.png`, `explore-card-image-mobile.png`.

| Property | default | mobile |
|---|---|---|
| Size (w x h) | 248.19 x 139.59 | 132 x 74.25 |
| Padding | 0 | same |
| Display | block | same |
| Radius | 8px `--cds-border-radius-100` | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Cursor | pointer | same |

- Extra (`default`): `{"img":{"w":248.2,"h":139.6,"objectFit":"cover","radius":"0px"}}`
- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)

#### explore-card-content

Text column under the image: 8px padding, 8px between the header and the footer.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `.cds-ProductCard-grid .cds-ProductCard-content`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 248.19 x 90.02 |
| Padding | 8px |
| Gap | 8px |
| Display | flex column, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | p.cds-ProductCard-partnerNames: Source Sans Pro 14/24 400, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

- Painted in `default`: div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px

#### explore-card-partner-logo

Organisation avatar: 18px square, 1px border, radius 5, 2px padding around a 12px logo.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `.cds-ProductCard-grid .cds-ProductCard-partnerLogos .cds-Avatar-base`. States: default, mobile.
Crops: `explore-card-partner-logo-default.png`, `explore-card-partner-logo-mobile.png`.

| Property | default | mobile |
|---|---|---|
| Size (w x h) | 18 x 18 | same |
| Padding | 2px | same |
| Display | flex row, align center, justify center | same |
| Border | 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` | same |
| Radius | 5px | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Cursor | pointer | same |

- Painted in `default`: div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px

- Extra (`default`): `{"img":{"w":12,"h":12,"objectFit":"cover","radius":"4px"}}`
- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)

#### explore-card-partner-name

Organisation name beside the avatar: 400 14/24.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `.cds-ProductCard-grid .cds-ProductCard-partnerNames`. States: default, mobile.
Crops: `explore-card-partner-name-default.png`, `explore-card-partner-name-mobile.png`.

| Property | default | mobile |
|---|---|---|
| Size (w x h) | 41.41 x 24 | same |
| Padding | 0 | same |
| Display | flow-root | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 14/24 400 | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Cursor | pointer | same |

- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)

#### explore-card-title

Card title (h3): 600 16/20, -0.048px tracking, three-line clamp.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `.cds-ProductCard-grid .cds-CommonCard-title`. States: default, mobile.
Crops: `explore-card-title-default.png`, `explore-card-title-mobile.png`.

| Property | default | mobile |
|---|---|---|
| Size (w x h) | 232.19 x 20 | 116 x 20 |
| Padding | 0 | same |
| Display | flow-root | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium` | same |
| Letter spacing | -0.048px | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Cursor | pointer | same |

- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)

#### explore-card-title-link

The title link; it is stretched over the whole card, so it takes the card focus ring.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `.cds-ProductCard-grid .cds-CommonCard-titleLink`. States: default, hover, focus-visible.
Crops: `explore-card-title-link-hover.png`, `explore-card-title-link-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 232.19 x 20 | same | same |
| Padding | 0 | same | same |
| Display | block | same | same |
| Radius | 0px | same | 4px `--cds-border-radius-50` |
| Background | transparent | same | same |
| Box shadow | none | same | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Outline | none | same | 1px solid transparent offset 2px |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same |
| Text node font | h3.cds-CommonCard-title: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Cursor | pointer | same | same |
| ::before | 264.2 x 245.6, inset 0px 0px 0px 0px, radius 0px, shadow none | same | same |

- Painted in `focus-visible`: a.cds-119.cds-113, 232.2x20.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab

#### explore-card-type

Type line under the title ("Professional Certificate", "Specialization", "Course"): 400 12/18 in the weak ink.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `.cds-ProductCard-grid .cds-CommonCard-metadata p`. States: default, mobile.
Crops: `explore-card-type-default.png`, `explore-card-type-mobile.png`.

| Property | default | mobile |
|---|---|---|
| Size (w x h) | 232.19 x 18 | 116 x 18 |
| Padding | 0 | same |
| Display | block | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 12/18 400 `--cds-typography-body-tertiary` | same |
| Colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` | same |
| Cursor | pointer | same |

- `mobile` reached by: 390x844 mobile context (touch, Android Chrome user agent)

#### explore-card-footer

Footer block that holds the type line; it has no gap in a carousel.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `.cds-ProductCard-grid .cds-ProductCard-footer`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 232.19 x 18.02 |
| Padding | 0 |
| Gap | 4px |
| Display | flex column, align normal, justify flex-end |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | p: Source Sans Pro 12/18 400 `--cds-typography-body-tertiary`, ls normal |
| Text node colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

#### explore-band-dark

Dark band (Learn AI with today's most popular certificates): a 1344 wide block with radius 24 on the grey-975 ground, a 20% heading column, an 80% card column, and decorative art absolutely placed behind. The white text and the ghost-invert link sit on it.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `[data-testid=block_layout] with a ghostInvert link`. States: default.
Crops: `explore-band-dark-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1344 x 306 |
| Padding | 16px 16px 16px 32px |
| Display | block |
| Radius | 24px `--cds-border-radius-300` |
| Background | #0d0f12 `--cds-color-emphasis-neutral-background-xxstrong` / `--cds-color-grey-975` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h2: Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm`, ls -0.06px |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Icon | 0 x 0, colour #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |

- Painted in `default`: div.cds-1.cds-2, 1344.0x306.0, bg #0d0f12 `--cds-color-emphasis-neutral-background-xxstrong` / `--cds-color-grey-975`, radius 24px; div.cds-ProductCard-base.cds-ProductCard-grid, 242.0x274.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 242.0x274.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 242.0x274.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px

- Extra (`default`): `{"block":{"w":1344,"padding":"16px 16px 16px 32px","borderRadius":"24px","overflow":"hidden"},"parent":{"w":1344,"padding":"0px","backgroundColor":"transparent"}}`

#### explore-section-heading-inverse

Band heading on the dark band: the same 600 20/24 style in white.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `dark block h2`. States: default.
Crops: `explore-section-heading-inverse-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 233.59 x 48 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm` |
| Letter spacing | -0.06px |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |

#### explore-section-sub-inverse

Sub text on the dark band: 400 16/24 in white.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `dark block .cds-grid-item p`. States: default.
Crops: `explore-section-sub-inverse-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 233.59 x 48 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |

#### explore-section-link

The "Explore programs" arrow link under the sub text: cds-button-ghostInvert, a link styled as a button (48 tall, 600 16/24, 0.16px tracking) with a 24px arrow end icon; its left margin is -16px so the text lines up with the heading.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `a.cds-button-ghostInvert`. States: default, hover, focus-visible, pressed.
Crops: `explore-section-link-default.png`, `explore-section-link-hover.png`, `explore-section-link-focus-visible.png`, `explore-section-link-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 183.66 x 48 | same | same | same |
| Padding | 12px 16px | same | same | same |
| Margin | 0 0 0 -16px | same | same | same |
| Display | inline-flex row, align center, justify center | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same |
| Background | transparent | same | same | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary` | same | same | same |
| Letter spacing | 0.16px | same | same | same |
| Text node font | span.cds-button-label: Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary`, ls 0.16px | same | same | same |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same | same |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same | same |
| Text decoration | none | underline | underline | underline |
| Cursor | pointer | same | same | same |
| Icon | 24 x 24, colour #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same | same | same |
| ::after |  | same | 187.7 x 52.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `focus-visible`: a.cds-149.cds-button-disableElevation, 183.7x48.0, outline 1px solid transparent offset 2px, radius 8px; a::after.cds-149.cds-button-disableElevation, 187.656pxx52px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### explore-carousel-dark

A carousel that overflows (20 cards at 242 wide, fixed columns): the scroll container has overflow-x auto, scroll-snap-type x mandatory and no scrollbar. The Next arrow appears at the right end; after one click the Previous arrow appears at the left end and the row has scrolled by four cards.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `[data-testid=overflow-carousel] (dark band)`. States: default, scrolled.
Crops: `explore-carousel-dark-default.png`, `explore-carousel-dark-scrolled.png`.

| Property | default | scrolled |
|---|---|---|
| Size (w x h) | 1062.39 x 290 | same |
| Padding | 0 | same |
| Margin | -8px -16px | same |
| Display | flex row, align center, justify normal | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Text node font | p.cds-ProductCard-partnerNames: Source Sans Pro 14/24 400, ls normal | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | same |
| Icon | 0 x 0, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div.cds-ProductCard-base.cds-ProductCard-grid, 242.0x274.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 242.0x274.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px; div.cds-ProductCard-base.cds-ProductCard-grid, 242.0x274.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 16px; div.cds-Avatar-base.cds-Avatar-organization, 18.0x18.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 5px

- Extra (`default`): `{"snapProbe":{"requested":100,"settled":100},"cards":20,"cardWidth":242,"cardPitch":254,"fullyVisible":4,"partlyVisible":5,"next":{"display":"block","w":24,"h":274,"x":1368,"padding":"0px 0px 0px 4px"},"previous":{"display":"block","w":24,"h":274,"x":329.6,"padding":"0px 4px 0px 0px"},"scroller":{"overflowX":"auto","scrollSnapType":"x mandatory","scrollSnapAlign":"start","scrollSnapStop":"always","scrollBehavior":"smooth","scrollbarWidth":"none","padding":"8px 0px","scrollWidth":5100,"clientWidth":1062,"scrollLeft":0},"content":{"display":"grid","columns":"242px x 20","gap":"12px","padding":"0px 16px","role":"list","itemRole":"listitem","itemSnapAlign":"none"}}`
- Extra (`scrolled`): `{"cards":20,"cardWidth":242,"cardPitch":254,"fullyVisible":4,"partlyVisible":6,"next":{"display":"block","w":24,"h":274,"x":1368,"padding":"0px 0px 0px 4px"},"previous":{"display":"block","w":24,"h":274,"x":329.6,"padding":"0px 4px 0px 0px"},"scroller":{"overflowX":"auto","scrollSnapType":"x mandatory","scrollSnapAlign":"start","scrollSnapStop":"always","scrollBehavior":"smooth","scrollbarWidth":"none","padding":"8px 0px","scrollWidth":5100,"clientWidth":1062,"scrollLeft":1016},"content":{"display":"grid","columns":"242px x 20","gap":"12px","padding":"0px 16px","role":"list","itemRole":"listitem","itemSnapAlign":"none"}}`
- `scrolled` reached by: clicked Next once from scrollLeft 0, read after the smooth scroll settled
- Repeated items: 8 measured, sizes 242.0x274.0, 242.0x274.0, 242.0x274.0, 242.0x274.0, gaps dx 12, dx 12, dx 12, dx 12, dx 12, dx 12, dx 12

#### explore-carousel-next

Next arrow: a 24px wide button the height of the row, pinned to the right end, a 24px chevron over a white fade (linear-gradient to the right, 0 to 0.8 alpha; hover and pressed swap in a stronger fade), padding 0 0 0 4px. 0x0 when the row does not overflow. Clicking scrolls the row by four cards (1016px at 254 pitch) with scroll-behavior smooth.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `[data-testid=overflow-carousel] button "Next"`. States: default, hover, focus-visible, pressed, narrow.
Crops: `explore-carousel-next-default.png`, `explore-carousel-next-hover.png`, `explore-carousel-next-focus-visible.png`, `explore-carousel-next-pressed.png`, `explore-carousel-next-narrow.png`.

| Property | default | hover | focus-visible | pressed | narrow |
|---|---|---|---|---|---|
| Size (w x h) | 24 x 274 | same | same | same | 24 x 202.25 |
| Padding | 0 0 0 4px | same | same | same | same |
| Display | block | same | same | same | same |
| Radius | 0px | same | same | same | same |
| Background | transparent + linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 80%) | transparent + linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.8) 40%, rgb(255, 255, 255) 100%) | same | transparent + linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.8) 40%, rgb(255, 255, 255) 100%) | same |
| Outline | none | same | 1px solid transparent offset 2px | same | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same |
| Cursor | pointer | same | same | same | same |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | 24 x 24, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same | 24 x 24, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same |
| ::after |  | same | 28.0 x 278.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same | same |

- Painted in `default`: button.cds-149, 24.0x274.0, bg-image linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 80%)
- Painted in `hover`: button.cds-149, 24.0x274.0, bg-image linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.8) 40%, rgb(255, 255, 255) 100%)
- Painted in `focus-visible`: button.cds-149.cds-151, 24.0x274.0, bg-image linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 80%), outline 1px solid transparent offset 2px; button::after.cds-149.cds-151, 28pxx278px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149, 24.0x274.0, bg-image linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.8) 40%, rgb(255, 255, 255) 100%)
- Painted in `narrow`: button.cds-149, 24.0x202.3, bg-image linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 80%)

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift key press, then focus() without scrolling (:focus-visible matches)
- `pressed` reached by: CDP forcePseudoState :active:hover
- `narrow` reached by: 390x844 window with the desktop user agent

#### explore-carousel-prev

Previous arrow: mirror of the Next arrow at the left end (white fade to the left, padding 0 4px 0 0). It is 0x0 until the row has scrolled.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `[data-testid=overflow-carousel] button "Previous"`. States: default, hover, focus-visible, pressed.
Crops: `explore-carousel-prev-default.png`, `explore-carousel-prev-hover.png`, `explore-carousel-prev-focus-visible.png`, `explore-carousel-prev-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 24 x 274 | same | same | same |
| Padding | 0 4px 0 0 | same | same | same |
| Display | block | same | same | same |
| Radius | 0px | same | same | same |
| Background | transparent + linear-gradient(270deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 80%) | transparent + linear-gradient(90deg, rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0.8) 40%, rgba(255, 255, 255, 0.1) 100%) | same | transparent + linear-gradient(90deg, rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0.8) 40%, rgba(255, 255, 255, 0.1) 100%) |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |
| Cursor | pointer | same | same | same |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | 24 x 24, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same | 24 x 24, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |
| ::after |  | same | 28.0 x 278.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `default`: button.cds-149, 24.0x274.0, bg-image linear-gradient(270deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 80%)
- Painted in `hover`: button.cds-149, 24.0x274.0, bg-image linear-gradient(90deg, rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0.8) 40%, rgba(255, 255, 255, 0.1) 100%)
- Painted in `focus-visible`: button.cds-149.cds-151, 24.0x274.0, bg-image linear-gradient(270deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 80%), outline 1px solid transparent offset 2px; button::after.cds-149.cds-151, 28pxx278px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149, 24.0x274.0, bg-image linear-gradient(90deg, rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0.8) 40%, rgba(255, 255, 255, 0.1) 100%)

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift key press, then focus() without scrolling (:focus-visible matches)
- `pressed` reached by: CDP forcePseudoState :active:hover

#### explore-section-heading-link

Below 600 the h2 collapses to 0x0 and the heading is shown as a link: the same 600 20/24 text with a chevron icon (4px margin) after it, on the band's own link. Read in the 390 context only.

Page: explore (https://www.coursera.org/explore/generative-ai). Selector: `block .cds-grid-item a (below 600)`. States: default, focus-visible.
Crops: `explore-section-heading-link-default.png`, `explore-section-heading-link-focus-visible.png`.

| Property | default | focus-visible |
|---|---|---|
| Size (w x h) | 188.3 x 28 | same |
| Padding | 0 | same |
| Display | inline | same |
| Radius | 0px | 4px `--cds-border-radius-50` |
| Background | transparent | same |
| Box shadow | none | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Outline | none | 1px solid transparent offset 2px |
| Font | Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm` | same |
| Letter spacing | -0.06px | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Text decoration | none | underline |
| Cursor | pointer | same |
| Icon | 20 x 20, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |

- Painted in `focus-visible`: a.cds-119.cds-113, 188.3x28.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px

- `focus-visible` reached by: Shift+Tab, Tab

### Chips and pills

#### pill

cds-Pill-root: partner or domain pill on the home page.

Page: home (https://www.coursera.org/). Selector: `.cds-Pill-root`. States: default, hover, focus-visible.
Crops: `pill-default.png`, `pill-focus-visible.png`.

| Property | default | focus-visible |
|---|---|---|
| Size (w x h) | 100.08 x 42 | same |
| Padding | 8px 12px | same |
| Gap | 8px | same |
| Display | inline-flex row, align center, justify center | same |
| Border | 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` | same |
| Radius | 100px | same |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | same |
| Outline | none | 1px solid transparent offset 2px |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same |
| Text node font | span: Source Sans Pro 14/18 600 `--cds-typography-subtitle-small`, ls -0.042px | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Text decoration | none | underline |
| Transition | all 0.3s cubic-bezier(0, 0, 0.5, 1) | same |
| Cursor | pointer | same |
| ::after |  | 98.1 x 40.0, inset 0px 0px 0px 0px, radius 100px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |

- Painted in `default`: a.cds-149.cds-Pill-root, 100.1x42.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 100px
- Painted in `focus-visible`: a.cds-149.cds-Pill-root, 100.1x42.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, outline 1px solid transparent offset 2px, radius 100px; a::after.cds-149.cds-Pill-root, 98.0781pxx40px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 100px, inset 0px 0px 0px 0px

- `hover` not captured: locator.hover: Element is outside of the viewport
- `focus-visible` reached by: Shift+Tab, Tab

#### chip-home

cds-Chip-root on the home page (collection filter chips).

Page: home (https://www.coursera.org/). Selector: `.cds-Chip-root`. States: default.
Crops: `chip-home-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 95.66 x 32 |
| Padding | 4px 12px |
| Display | flex row, align center, justify center |
| Border | 1px solid #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` |
| Radius | 32px `--cds-border-radius-400` |
| Background | #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` |
| Letter spacing | 0.14px |
| Text node font | span.cds-Chip-labelText: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Cursor | pointer |

- Painted in `default`: button.cds-149.cds-Chip-root, 95.7x32.0, bg #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, border 1px solid #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, radius 32px

#### skill-chip

"Skills you'll gain" chip: grey-filled pill link, 30px tall.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-testid=skills-section] a`. States: default, hover, focus-visible, pressed.
Crops: `skill-chip-default.png`, `skill-chip-hover.png`, `skill-chip-focus-visible.png`, `skill-chip-pressed.png`.

| Property | default | hover | focus-visible | pressed |
|---|---|---|---|---|
| Size (w x h) | 126.89 x 30 | same | same | same |
| Padding | 4px 12px | same | same | same |
| Display | block | same | same | same |
| Border | 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100` | same | same | same |
| Radius | 50px `--cds-border-radius-max` | same | same | same |
| Background | #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100` | same | same | same |
| Box shadow | none | same | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |
| Outline | none | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | same |
| Text decoration | none | underline | underline | underline |
| Cursor | pointer | same | same | same |

- Painted in `default`: a.cds-119.cds-113, 126.9x30.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 50px
- Painted in `focus-visible`: a.cds-119.cds-113, 126.9x30.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 50px
- Painted in `pressed`: a.cds-119.cds-113, 126.9x30.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 50px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover
- Repeated items: 8 measured, sizes 126.9x30.0, 145.5x30.0, 129.2x30.0, 137.5x30.0, gaps dx 8, dx 8, dx 8, dx 8, dx 8, dy 8, dx 8

#### chip

Filter chip used as a tab (cds-Chip-root): Related / Degrees; the selected one is filled.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#recommendations .cds-Chip-root`. States: selected, default, hover, focus-visible, pressed.
Crops: `chip-selected.png`, `chip-default.png`, `chip-hover.png`, `chip-focus-visible.png`, `chip-pressed.png`.

| Property | selected | default | hover | focus-visible | pressed |
|---|---|---|---|---|---|
| Size (w x h) | 72.84 x 32 | 75.28 x 32 | 75.28 x 32 | 75.28 x 32 | 75.28 x 32 |
| Padding | 4px 12px | same | same | same | same |
| Display | flex row, align center, justify center | same | same | same | same |
| Border | 1px solid #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` | 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` | 1px solid #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` | 1px solid #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Radius | 32px `--cds-border-radius-400` | same | same | same | same |
| Background | #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950` | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` | #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25` |
| Outline | none | same | same | 1px solid transparent offset 2px | same |
| Font | Source Sans Pro 14/20 600 `--cds-typography-action-secondary` | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` |
| Letter spacing | 0.14px | normal | normal | normal | normal |
| Text node font | span.cds-Chip-labelText: Source Sans Pro 14/20 600 `--cds-typography-action-secondary`, ls 0.14px | span.cds-Chip-labelText: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal | span.cds-Chip-labelText: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal | span.cds-Chip-labelText: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal | span.cds-Chip-labelText: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` |
| Cursor | pointer | same | same | same | same |
| ::after |  | same | same | 77.3 x 34.0, inset -2px -2px -2px -2px, radius 32px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same |

- Painted in `selected`: button.cds-149.cds-Chip-root, 72.8x32.0, bg #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, border 1px solid #1c2026 `--cds-color-interactive-secondary-selected` / `--cds-color-grey-950`, radius 32px
- Painted in `default`: button.cds-149.cds-Chip-root, 75.3x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 32px
- Painted in `hover`: button.cds-149.cds-Chip-root, 75.3x32.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, border 1px solid #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850`, radius 32px
- Painted in `focus-visible`: button.cds-149.cds-Chip-root, 75.3x32.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, outline 1px solid transparent offset 2px, radius 32px; button::after.cds-149.cds-Chip-root, 77.2812pxx34px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 32px, inset -2px -2px -2px -2px
- Painted in `pressed`: button.cds-149.cds-Chip-root, 75.3x32.0, bg #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25`, border 1px solid #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900`, radius 32px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover
- Repeated items: 2 measured, sizes 72.8x32.0, 75.3x32.0, gaps dx 8

### Course hero and stats card

#### tooltip

cds-Tooltip: dark inverted tooltip shown on hovering the partner logos of a product card.

Page: search (https://www.coursera.org/search?query=machine%20learning). Selector: `[role=tooltip]`. States: opened.
Crops: `tooltip-opened.png`.

| Property | opened |
|---|---|
| Size (w x h) | 200 x 61 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | div.cds-195.cds-Tooltip-tooltip: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Transform | matrix(1, 0, 0, 1, 53, 496) |

- Painted in `opened`: div.cds-195.cds-Tooltip-tooltip, 200.0x48.0, bg #002457 `--cds-color-emphasis-primary-background-xxstrong` / `--cds-color-blue-950`, radius 4px; span::before.cds-197.cds-Tooltip-arrow, 20pxx8px, bg #002457 `--cds-color-emphasis-primary-background-xxstrong` / `--cds-color-blue-950`, radius 3px 0px; ancestor +1 body, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

- Extra (`opened`): `[{"tag":"div","cls":"cds-192 cds-193 cds-194","bg":"transparent","shadow":"none","radius":"0px","padding":"0px","font":"16px / 24px \SSP","color":"#0d0f12","maxWidth":"none","w":200,"h":61,"transition":"all","opacity":"1"},{"tag":"div","cls":"cds-195 cds-Tooltip-tooltip cds-201 cds-Tooltip-placementTop cds-196","bg":"#002457","shadow":"none","radius":"4px","padding":"4px 8px","font":"14px / 20px \SSP","color":"#ffffff","maxWidth":"200px","w":200,"h":48,"transition":"opacity cubic-bezier(0.4, 0, 0.2, 1), transform cubic-bezier(0.4, 0, 0.2, 1)","opacity":"1"},{"tag":"span","cls":"cds-197 cds-Tooltip-arrow","bg":"transparent","shadow":"none","radius":"0px","padding":"0px","font":"14px / 20px \SSP","color":"#002457","maxWidth":"none","w":20,"h":8,"transition":"all","opacity":"1"}]`
- `opened` reached by: hover on .cds-ProductCard-partnerLogos

#### course-hero

Course hero: pale blue full-bleed band with a large decorative Coursera-C graphic at the right, partner logos, title, part-of line, instructors, the Enroll CTA and the enrolled count.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-e2e=hero-module]`. States: default.
Crops: `course-hero-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1360 x 372 |
| Padding | 0 |
| Margin | -8px |
| Display | flex row, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 44/52 600 `--cds-typography-display2`, ls -0.1px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 2.0x32.0, bg #a7b4c9 `--cds-color-neutral-disabled-strong` / `--cds-color-grey-300`; div, 36.0x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 50%; div, 36.0x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 50%; div, 36.0x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 50%; div, 106.1x22.0, bg #cfe2ff `--cds-color-blue-100`, radius 4px; button.cds-149.cds-button-disableElevation, 256.4x64.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px

- Extra (`default`): `{"bgAt_60_300":{"tag":"body","cls":"","backgroundColor":"#ffffff","backgroundImage":"none"},"bgAt_1300_500":{"tag":"body","cls":"","backgroundColor":"#ffffff","backgroundImage":"none"},"bgAt_60_140":{"tag":"section","cls":"css-oe7dxw","backgroundColor":"#ffffff","backgroundImage":"none"}}`

#### course-hero-background

The hero tint: an absolutely positioned 2880px-wide div at z-index -1 behind the hero grid, filled with the primary blue at 5% alpha (#f2f6fd over white, sampled).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `div (z-index -1, 2880 wide) behind [data-e2e=hero-module]`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 2880 x 524 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | #0056d2 @ 0.05 no token |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 2880.0x524.0, bg #0056d2 @ 0.05 no token

#### course-hero-art

Decorative Coursera-C graphic at the right of the hero (inline svg).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-e2e=hero-module] svg (566 wide)`. States: default.
Crops: `course-hero-art-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 566 x 465 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 566 x 465, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Extra (`default`): `["#e3eeff / none / 1","#6d7c99 / none / 1"]`

#### hero-partner-logo

Partner logo in the hero (cds-LogoWrapper mediumPaddingOutside), 36px tall.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-e2e=hero-module] .cds-LogoWrapper-base`. States: default.
Crops: `hero-partner-logo-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 149.5 x 36 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Repeated items: 3 measured, sizes 149.5x36.0, 2.0x32.0, 148.0x36.0, gaps dy -34, dy -34

#### hero-partner-divider

Vertical rule between two partner logos.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-testid=partner-co-branding-divider]`. States: default.
Crops: `hero-partner-divider-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 2 x 32 |
| Padding | 0 |
| Margin | 0 24px |
| Display | block |
| Radius | 0px |
| Background | #a7b4c9 `--cds-color-neutral-disabled-strong` / `--cds-color-grey-300` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 2.0x32.0, bg #a7b4c9 `--cds-color-neutral-disabled-strong` / `--cds-color-grey-300`

#### hero-title

Course title h1.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-e2e=hero-title]`. States: default.
Crops: `hero-title-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 777.33 x 104 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 44/52 600 `--cds-typography-display2` |
| Letter spacing | -0.1px |
| Text node font | span: Source Sans Pro 44/52 600 `--cds-typography-display2`, ls -0.1px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### hero-part-of

"This course is part of <Specialization>" line.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `hero p containing "part of"`. States: default.
Crops: `hero-part-of-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 777.33 x 24 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### hero-instructors

Instructor row: overlapping 30px avatars in 36px rings, "Instructors:" label, name link, +3 more, Top Instructor badge.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `hero row containing "Instructors:"`. States: default.
Crops: `hero-instructors-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 777.33 x 36 |
| Padding | 0 |
| Display | flex row, align center, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 36.0x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 50%; div, 36.0x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 50%; div, 36.0x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 50%; div, 106.1x22.0, bg #cfe2ff `--cds-color-blue-100`, radius 4px

#### hero-avatar

Instructor avatar in the hero stack.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `hero instructor row img`. States: default.
Crops: `hero-avatar-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 30 x 30 |
| Padding | 0 |
| Display | inline |
| Radius | 50% |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Extra (`default`): `{"wrapper":{"w":36,"bg":"#ffffff","border":"1px solid #e9eef7","radius":"50%","marginLeft":"0px","boxShadow":"none"},"next":"-12px"}`

#### badge-top-instructor

"Top Instructor" badge: light blue fill, dark blue text, 2px radius... see values.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `hero div "Top Instructor"`. States: default.
Crops: `badge-top-instructor-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 96.13 x 20 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium` |
| Letter spacing | -0.048px |
| Colour | #0d2f60 `--cds-color-emphasis-primary-content-default` / `--cds-color-blue-900` |

- Extra (`default`): `{"parent":{"bg":"#cfe2ff","padding":"1px 5px","radius":"4px","w":106.125,"h":22}}`

#### hero-enrolled-count

"1,253,410 already enrolled": number bold.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `hero p "already enrolled"`. States: default.
Crops: `hero-enrolled-count-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 777.33 x 24 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 16/24 700 `--cds-typography-title3-strong`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Extra (`default`): `{"strong":"700"}`

#### stats-card

Floating stats card that overlaps the bottom of the hero: modules, rating, level, schedule, with vertical dividers; white, rounded, elevated.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.xdp-key-information-slot div (first with a box-shadow)`. States: default.
Crops: `stats-card-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1344 x 114 |
| Padding | 0 |
| Margin | -76px 0 0 0 |
| Display | block |
| Border | 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` |
| Radius | 8px `--cds-border-radius-100` |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` |
| Box shadow | #0f1114 @ 0.2 0px 8px 16px 0px (no elevation token) |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | a.cds-119.cds-113: Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm`, ls -0.06px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975`, underline |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 0 x 0, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 1344.0x114.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, shadow #0f1114 @ 0.2 0px 8px 16px 0px (no elevation token), radius 8px; hr, 0.0x0.0, bg #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`; div, 292.1x64.0, border L:1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`; div, 349.3x64.0, border L:1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`; div, 329.5x64.0, border L:1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`

- Extra (`default`): `{"cells":[{"w":0,"h":0,"padding":"0px","borderRight":"0px none #0d0f12","borderLeft":"0px none #0d0f12","after":null,"before":null},{"w":1342,"h":112,"padding":"24px 0px","borderRight":"0px none #0d0f12","borderLeft":"0px none #0d0f12","after":null,"before":null}]}`

#### stats-card-link

"3 modules" heading link (underlined, 20px semibold).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.xdp-key-information-slot`. States: default, hover, focus-visible.
Crops: `stats-card-link-hover.png`, `stats-card-link-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 88.14 x 28 | same | same |
| Padding | 0 | same | same |
| Display | inline | same | same |
| Radius | 0px | same | 4px `--cds-border-radius-50` |
| Background | transparent | same | same |
| Box shadow | none | same | #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) |
| Outline | none | same | 1px solid transparent offset 2px |
| Font | Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm` | same | same |
| Letter spacing | -0.06px | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Text decoration | underline | none | same |
| Cursor | pointer | same | same |

- Painted in `focus-visible`: a.cds-119.cds-113, 88.1x28.0, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), outline 1px solid transparent offset 2px, radius 4px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab

#### stats-card-value

"Beginner level" value line.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.xdp-key-information-slot`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 177.25 x 24 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm` |
| Letter spacing | -0.06px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### stats-card-sub

"32,925 reviews" secondary line.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.xdp-key-information-slot`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 120 x 20 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` |
| Colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` |

#### stats-card-rating

"4.9" rating number with a star.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.xdp-key-information-slot`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 25.84 x 28 |
| Padding | 0 |
| Display | inline |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm` |
| Letter spacing | -0.06px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### stats-card-star

Star icon after the rating.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.xdp-key-information-slot svg`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 20 x 20 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 20 x 20, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### help-dialog

The (i) next to "Recommended experience" opens a small modal dialog (not a hover tooltip): title, level, text, primary OK and a close icon button; the page behind is dimmed.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[role=dialog]`. States: opened.
Crops: `help-dialog-opened.png`.

| Property | opened |
|---|---|
| Size (w x h) | 568 x 280 |
| Padding | 0 |
| Display | grid |
| Radius | 16px `--cds-border-radius-200` |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` |
| Text node font | h2: Source Sans Pro 30/36 600 `--cds-typography-title-small`, ls -0.15px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` |
| Transform | matrix(1, 0, 0, 1, -284, -140) |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `opened`: div.cds-Dialog-dialog, 568.0x280.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px; div, 48.0x104.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`; button.cds-149.cds-iconButton-medium, 24.0x24.0, shadow transparent 0px 0px 0px 1px inset (no elevation token), radius 50px; div, 520.0x104.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`; div, 568.0x88.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`; button.cds-149.cds-button-disableElevation, 68.7x48.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px

- Extra (`opened`): `{"scrim":{"tag":"div","cls":"cds-222 cds-Modal-backdrop","backgroundColor":"#636363 @ 0.5","backgroundImage":"none"},"parts":[{"tag":"button","text":"","font":"14px / 20px \SSP","color":"#0d0f12","bg":"transparent","radius":"50px","w":24,"h":24},{"tag":"h2","text":"Recommended experience","font":"600 30px / 36px \SSP","color":"#0d0f12","bg":"transparent","radius":"0px","w":472,"h":36},{"tag":"p","text":"Beginner level","font":"16px / 24px \SSP","color":"#0d0f12","bg":"transparent","radius":"0px","w":472,"h":24},{"tag":"button","text":"OK","font":"600 16px / 24px \SSP","color":"#ffffff","bg":"#0056d2","radius":"8px","w":68.65625,"h":48}]}`

#### tooltip-icon

Hover tooltip (cds-Tooltip) naming an icon button, shown on hovering .cds-breadcrumbs-homeIcon.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[role=tooltip]`. States: opened.
Crops: `tooltip-icon-opened.png`.

| Property | opened |
|---|---|
| Size (w x h) | 51.27 x 41 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | div.cds-195.cds-Tooltip-tooltip: Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary`, ls normal |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Transform | matrix(1, 0, 0, 1, 32, 68) |

- Painted in `opened`: div.cds-195.cds-Tooltip-tooltip, 51.3x28.0, bg #002457 `--cds-color-emphasis-primary-background-xxstrong` / `--cds-color-blue-950`, radius 4px; span::before.cds-197.cds-Tooltip-arrow, 20pxx8px, bg #002457 `--cds-color-emphasis-primary-background-xxstrong` / `--cds-color-blue-950`, radius 3px 0px; ancestor +1 body, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 0px

- Extra (`opened`): `[{"cls":"cds-192 cds-193 cds-194","bg":"transparent","shadow":"none","radius":"0px","padding":"0px","font":"16px / 24px \SSP","color":"#0d0f12","w":51.265625,"h":41,"transform":"matrix(1, 0, 0, 1, 32, 68)"},{"cls":"cds-195 cds-Tooltip-tooltip cds-201 cds-Tooltip-placementTop cds-196","bg":"#002457","shadow":"none","radius":"4px","padding":"4px 8px","font":"14px / 20px \SSP","color":"#ffffff","w":51.265625,"h":28,"transform":"matrix(1, 0, 0, 1, 0, 0)"},{"cls":"cds-197 cds-Tooltip-arrow","bg":"transparent","shadow":"none","radius":"0px","padding":"0px","font":"14px / 20px \SSP","color":"#002457","w":20,"h":8,"transform":"none"}]`

#### spec-hero

Specialization hero (same module as the course hero).

Page: spec (https://www.coursera.org/specializations/machine-learning-introduction). Selector: `[data-e2e=hero-module]`. States: default.
Crops: `spec-hero-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1360 x 368 |
| Padding | 0 |
| Margin | -8px |
| Display | flex row, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 44/52 600 `--cds-typography-display2`, ls -0.1px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 2.0x32.0, bg #a7b4c9 `--cds-color-neutral-disabled-strong` / `--cds-color-grey-300`; div, 36.0x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 50%; div, 36.0x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 50%; div, 36.0x36.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 50%; div, 106.1x22.0, bg #cfe2ff `--cds-color-blue-100`, radius 4px; button.cds-149.cds-button-disableElevation, 256.4x64.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px

- Extra (`default`): `{"bgAt_60_300":{"tag":"body","cls":"","backgroundColor":"#ffffff","backgroundImage":"none"}}`

### In-page tab bar and sticky nav

#### tab-bar

In-page section nav (About, Outcomes, Modules, ...): links 44px tall; selected tab gets a tinted fill and an underlined blue label. A rule sits under the bar. A chevron button scrolls the overflow.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.cds-212 nav [data-testid=overflow-carousel]`. States: default.
Crops: `tab-bar-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 885.33 x 68 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | a: Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary`, ls normal |
| Text node colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, underline |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 0 x 0, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: a, 65.4x44.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, radius 4px; button.cds-149, 0.0x0.0, bg-image linear-gradient(270deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 80%); button.cds-149, 0.0x0.0, bg-image linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 80%)

- Extra (`default`): `[{"tag":"div","borderBottom":"0px none #0d0f12","after":null,"h":68},{"tag":"nav","borderBottom":"0px none #0d0f12","after":null,"h":68},{"tag":"div","borderBottom":"0px none #0d0f12","after":null,"h":68},{"tag":"div","borderBottom":"0px none #0d0f12","after":null,"h":68}]`
- Repeated items: 6 measured, sizes 65.4x44.0, 93.5x44.0, 82.0x44.0, 152.9x44.0, gaps dx 32, dx 32, dx 32, dx 32, dx 32

#### tab

One section tab link.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-testid=overflow-carousel] [role=listitem] a`. States: selected, default, hover, focus-visible, pressed, selected-sticky.
Crops: `tab-selected.png`, `tab-default.png`, `tab-hover.png`, `tab-focus-visible.png`, `tab-pressed.png`, `tab-selected-sticky.png`.

| Property | selected | default | hover | focus-visible | pressed | selected-sticky |
|---|---|---|---|---|---|---|
| Size (w x h) | 65.41 x 44 | 81.97 x 44 | 81.97 x 44 | 81.97 x 44 | 81.97 x 44 | same |
| Padding | 10px 12px | same | same | same | same | same |
| Display | block | same | same | same | same | same |
| Radius | 4px `--cds-border-radius-50` | same | same | same | same | same |
| Background | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` | transparent | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | same |
| Outline | none | same | same | 1px solid #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` offset -1px | same | same |
| Font | Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary` | same | same | same | same | same |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same | same |
| Text decoration | underline | none | none | none | none | same |
| Cursor | pointer | same | same | same | same | same |

- Painted in `selected`: a, 65.4x44.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, radius 4px
- Painted in `hover`: a, 82.0x44.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 4px
- Painted in `focus-visible`: a, 82.0x44.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, outline 1px solid #0056d2 offset -1px, radius 4px
- Painted in `pressed`: a, 82.0x44.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 4px
- Painted in `selected-sticky`: a, 65.4x44.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, radius 4px

- Extra (`selected`): `{"ariaCurrent":"true","cls":"css-15p6ss1","parentBg":"transparent"}`
- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### sticky-nav

Sticky course nav that replaces the header once the hero scrolls away: partner marks + course title, a compact Enroll button at the right, the tab bar under it; white with a drop shadow, fixed at top 0.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-testid=fixed-page-navigation]`. States: sticky.
Crops: `sticky-nav-sticky.png`.

| Property | sticky |
|---|---|
| Size (w x h) | 1440 x 146 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0` |
| Box shadow | #000000 @ 0.24 0px 2px 12px 0px (no elevation token) |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h2: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 0 x 0, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `sticky`: div, 1440.0x146.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, shadow #000000 @ 0.24 0px 2px 12px 0px (no elevation token); div, 1344.0x78.0, border B:2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`; div, 2.0x28.0, bg #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`; button.cds-149.cds-button-disableElevation, 180.0x60.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px; a, 65.4x44.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, radius 4px; button.cds-149, 0.0x0.0, bg-image linear-gradient(270deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 80%)

- Extra (`sticky`): `[{"tag":"div","cls":"css-jiiwdw","bg":"#ffffff","shadow":"#000000 @ 0.24 0px 2px 12px 0px","borderBottom":"0px none #0d0f12","h":146,"transition":"all","transform":"matrix(1, 0, 0, 1, 0, 0)"},{"tag":"div","cls":"css-1qy2fd5","bg":"#e9eef7","shadow":"none","borderBottom":"0px none #0d0f12","h":28,"transition":"all","transform":"none"},{"tag":"button","cls":"cds-149 cds-button-disableElevation cds-button-primary css-1","bg":"#0056d2","shadow":"#0056d2 0px 0px 0px 1px inset","borderBottom":"0px none #ffffff","h":60,"transition":"none","transform":"none"},{"tag":"a","cls":"css-15p6ss1","bg":"#f2f5fa","shadow":"none","borderBottom":"0px none #0056d2","h":44,"transition":"all","transform":"none"}]`

#### sticky-nav-title

Course title in the sticky nav.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-testid=fixed-page-navigation] h2`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 406.28 x 20 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium` |
| Letter spacing | -0.048px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### sticky-nav-rule

Rule between the title row and the tabs in the sticky nav.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `first bordered child of the sticky nav`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 1344 x 78 |
| Padding | 8px 0 |
| Gap | 32px |
| Display | flex row, align center, justify space-between |
| Border | B: 2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h2: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 1344.0x78.0, border B:2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`; div, 2.0x28.0, bg #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`; button.cds-149.cds-button-disableElevation, 180.0x60.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, shadow #0056d2 0px 0px 0px 1px inset (no elevation token), radius 8px

### About: learn, skills, details

#### learn-checklist

"What you'll learn": two-column list, 24px check icon, body text.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#about ul`. States: default.
Crops: `learn-checklist-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 901.33 x 88 |
| Padding | 0 |
| Margin | -8px |
| Display | flex row, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Repeated items: 8 measured, sizes 450.7x88.0, 450.7x88.0, 126.9x30.0, 145.5x30.0, gaps dx 0, dy 64, dx 8, dx 8, dx 8, dx 8, dx 8

#### section-heading

Section heading h2 (What you'll learn).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#about h2`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 885.33 x 28 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 20/28 600 `--cds-typography-title2` |
| Letter spacing | -0.1px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### section-heading-small

Smaller section heading (Skills you'll gain, Details to know).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#about div > h2:not(.cds-Typography-base)`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 885.33 x 24 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm` |
| Letter spacing | -0.06px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### learn-checklist-item

One checklist item: icon + text.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#about ul li > div`. States: default.
Crops: `learn-checklist-item-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 434.66 x 48 |
| Padding | 0 |
| Gap | 12px |
| Display | flex row, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Extra (`default`): `{"gap":"12px","iconColor":"#0d0f12","iconFill":"none","text":{"font":"16px / 24px \SSP","color":"#0d0f12"}}`

#### details-to-know

"Details to know": 2-column grid of icon tiles (24px icon, title, sub line).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#about h2 "Details to know" + grid`. States: default.
Crops: `details-to-know-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 901.33 x 120 |
| Padding | 0 |
| Margin | -8px |
| Display | flex row, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | div: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### details-tile

One tile: icon, title, supporting line.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[data-m=dtk] > div`. States: default.
Crops: `details-tile-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 450.66 x 52 |
| Padding | 8px |
| Margin | 8px 0 0 0 |
| Display | flex row, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | div: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Extra (`default`): `[{"tag":"span","w":24,"h":24,"font":"16px / 24px \SSP","color":"#0d0f12","margin":"0px"},{"tag":"div","w":398.65625,"h":36,"font":"600 16px / 20px \SSP","color":"#0d0f12","margin":"-36px 0px 0px 36px"},{"tag":"p","w":161.734375,"h":20,"font":"14px / 20px \SSP","color":"#48546e","margin":"-8px 0px 0px 36px"}]`

#### outcomes-section

"Build your subject-matter expertise": heading, part-of line, bullet list, image at right.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#outcomes`. States: default.
Crops: `outcomes-section-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1344 x 236 |
| Padding | 0 |
| Display | flex row, align center, justify space-between |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h2.cds-119.cds-Typography-base: Source Sans Pro 28/36 600 `--cds-typography-title1`, `--cds-typography-title-medium-sm`, ls -0.1px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### heading-lg

Large section heading (h2.cds-Typography-base in #outcomes).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#outcomes h2`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 640 x 36 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 28/36 600 `--cds-typography-title1`, `--cds-typography-title-medium-sm` |
| Letter spacing | -0.1px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### outcomes-image

Outcomes image.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#outcomes img`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 560 x 220.2 |
| Padding | 0 |
| Display | inline |
| Radius | 8px `--cds-border-radius-100` |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### bullet-list

Bulleted list under the outcomes heading.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#outcomes ul`. States: default.
Crops: `bullet-list-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 616 x 120 |
| Padding | 0 |
| Margin | 16px 0 0 24px |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | li: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Extra (`default`): `{"listStyle":"outside none disc","liMargin":"8px 0px 0px","liFont":"16px / 24px \SSP"}`

### Modules and course list

#### modules-heading

"There are 3 modules in this course" h2.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules h2`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 885.33 x 24 |
| Padding | 0 |
| Display | flex row, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm` |
| Letter spacing | -0.06px |
| Text node font | span: Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm`, ls -0.06px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### module-list

Bordered box holding the module accordions (a card around the list).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules [data-testid=accordion-item] parent x2`. States: default.
Crops: `module-list-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 885.33 x 432 |
| Padding | 0 |
| Display | block |
| Border | 2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` |
| Radius | 8px `--cds-border-radius-100` |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h3.cds-119.cds-121: Source Sans Pro 20/28 600 `--cds-typography-title2`, ls -0.1px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 20 x 20, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |

- Painted in `default`: div, 885.3x432.0, border 2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 8px; div.cds-AccordionRoot-container.cds-AccordionRoot-silent, 813.3x78.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid transparent, radius 16px; div, 817.3x92.0, border T:2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`; div.cds-AccordionRoot-container.cds-AccordionRoot-silent, 813.3x78.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid transparent, radius 16px

- Repeated items: 3 measured, sizes 817.3x82.0, 817.3x92.0, 817.3x92.0, gaps dy 8, dy 8

#### module-accordion

Module accordion item (cds-AccordionRoot silent): header row is a full-width ghost button with h3, a meta line ("Week 1 • 7 hours to complete"), "Module details" and a chevron. Items are separated by a rule.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules [data-testid=accordion-item]`. States: collapsed, expanded.
Crops: `module-accordion-collapsed.png`, `module-accordion-expanded.png`.

| Property | collapsed | expanded |
|---|---|---|
| Size (w x h) | 817.33 x 82 | 817.33 x 290 |
| Padding | 0 | same |
| Display | block | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Text node font | h3.cds-119.cds-121: Source Sans Pro 20/28 600 `--cds-typography-title2`, ls -0.1px | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Icon | 20 x 20, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same |

- Painted in `collapsed`: div.cds-AccordionRoot-container.cds-AccordionRoot-silent, 813.3x78.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid transparent, radius 16px
- Painted in `expanded`: div.cds-AccordionRoot-container.cds-AccordionRoot-silent, 813.3x286.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid transparent, radius 16px; button.cds-149.cds-button-disableElevation, 843.3x76.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px

- Extra (`collapsed`): `[{"cls":"","borderBottom":"0px none #0d0f12","borderTop":"0px none #0d0f12","padding":"0px","margin":"0px","h":82},{"cls":"css-1g2m9vy","borderBottom":"0px none #0d0f12","borderTop":"0px solid #e9eef7","padding":"0px","margin":"0px","h":82},{"cls":"cds-AccordionRoot-focusContainer","borderBottom":"0px none #0d0f12","borderTop":"0px none #0d0f12","padding":"2px","margin":"0px","h":82},{"cls":"cds-AccordionRoot-container cds-AccordionRoot-silent","borderBottom":"1px solid transparent","borderTop":"1px solid transparent","padding":"0px","margin":"0px","h":78},{"cls":"","borderBottom":"0px none #0d0f12","borderTop":"0px none #0d0f12","padding":"0px","margin":"0px","h":76},{"cls":"css-yllq6p","borderBottom":"0px none #0056d2","borderTop":"0px none #0056d2","padding":"0px","margin":"0px","h":52}]`

#### module-accordion-header

The header button of a module accordion.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules [data-testid=accordion-item] button.cds-button-ghost`. States: default, hover, focus-visible, pressed, expanded.
Crops: `module-accordion-header-default.png`, `module-accordion-header-hover.png`, `module-accordion-header-focus-visible.png`, `module-accordion-header-pressed.png`, `module-accordion-header-expanded.png`.

| Property | default | hover | focus-visible | pressed | expanded |
|---|---|---|---|---|---|
| Size (w x h) | 843.33 x 76 | same | same | same | same |
| Padding | 12px 16px | same | same | same | same |
| Margin | 0 -16px | same | same | same | same |
| Display | flex row, align center, justify space-between | same | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same | same |
| Background | transparent | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` | #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25` | #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25` |
| Outline | none | same | 1px solid transparent offset 2px | same | same |
| Font | Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary` | same | same | same | same |
| Letter spacing | 0.16px | same | same | same | same |
| Text node font | h3.cds-119.cds-121: Source Sans Pro 20/28 600 `--cds-typography-title2`, ls -0.1px | same | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same | same |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` | #3c0f8a `--cds-color-interactive-primary-selected` / `--cds-color-purple-900` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Cursor | pointer | same | same | same | same |
| Icon | 20 x 20, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same | same | same | same |
| ::after |  | same | 847.3 x 80.0, inset -2px -2px -2px -2px, radius 8px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token) | same | same |

- Painted in `hover`: button.cds-149.cds-button-disableElevation, 843.3x76.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px; ancestor +2 div.cds-AccordionRoot-container.cds-AccordionRoot-silent, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px
- Painted in `focus-visible`: button.cds-149.cds-button-disableElevation, 843.3x76.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, outline 1px solid transparent offset 2px, radius 8px; button::after.cds-149.cds-button-disableElevation, 847.328pxx80px, shadow #804ee4 0px 0px 0px 1px, #f0f6ff 0px 0px 0px 2px (no elevation token), radius 8px, inset -2px -2px -2px -2px; ancestor +2 div.cds-AccordionRoot-container.cds-AccordionRoot-silent, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px
- Painted in `pressed`: button.cds-149.cds-button-disableElevation, 843.3x76.0, bg #f9f5ff `--cds-color-interactive-background-primary-selected-weak` / `--cds-color-purple-25`, radius 8px; ancestor +2 div.cds-AccordionRoot-container.cds-AccordionRoot-silent, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px
- Painted in `expanded`: button.cds-149.cds-button-disableElevation, 843.3x76.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px; ancestor +2 div.cds-AccordionRoot-container.cds-AccordionRoot-silent, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, radius 16px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### module-title

Module title h3.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules [data-testid=accordion-item] h3`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 352.36 x 28 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 20/28 600 `--cds-typography-title2` |
| Letter spacing | -0.1px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

#### module-meta

Item-count / duration line under the module title.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules h3 + div`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 352.36 x 20 |
| Padding | 0 |
| Margin | 4px 0 0 0 |
| Display | flex row, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` |
| Colour | #48546e `--cds-color-neutral-primary-weak` / `--cds-color-grey-750` |
| Cursor | pointer |

#### module-details-label

"Module details" label at the right of the header.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules span "Module details"`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 160 x 24 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary` |
| Letter spacing | 0.16px |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |
| Cursor | pointer |
| Opacity | 0 |

#### module-chevron

Chevron (end icon) of a module header.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules .cds-button-endIcon`. States: collapsed, expanded.

| Property | collapsed | expanded |
|---|---|---|
| Size (w x h) | 20 x 20 | same |
| Padding | 0 | same |
| Margin | 0 0 0 4px | same |
| Display | flex row, align normal, justify normal | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/24 600 `--cds-typography-title3`, `--cds-typography-action-primary` | same |
| Letter spacing | 0.16px | same |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | #0b408b `--cds-color-interactive-primary-hover` / `--cds-color-blue-850` |
| Cursor | pointer | same |
| Icon | 20 x 20, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same |

#### module-panel

Expanded panel: description, "What's included" h4, a row of counts with 24px icons, then "Show info about module content".

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules [role=region]`. States: expanded.
Crops: `module-panel-expanded.png`.

| Property | expanded |
|---|---|
| Size (w x h) | 811.33 x 208 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | p: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### module-included

Row of item counts ("20 videos", "1 reading", ...), each a 24px circle icon and label.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules h4 "What's included" + p`. States: default.
Crops: `module-included-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 811.33 x 24 |
| Padding | 0 |
| Margin | 0 0 8px 0 |
| Gap | 32px |
| Display | flex row, align center, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Extra (`default`): `{"itemGap":"32px","itemMargin":"0px","icon":{"w":24,"circleFill":"#e9eef7","pathFill":"#0d0f12"},"label":"16px / 24px \SSP","labelColor":"#0d0f12"}`
- Repeated items: 5 measured, sizes 94.7x24.0, 94.0x24.0, 127.3x24.0, 102.5x24.0, gaps dx 32, dx 32, dx 32, dx 32

#### module-h4

"What's included" h4.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules h4`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 811.33 x 20 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium` |
| Letter spacing | -0.048px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### module-item-list

Expanded module content: per type an h5 ("20 videos • Total 147 minutes") with icon, then a list of items "Title • 3 minutes".

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.cds-ShowMoreContainer-content`. States: expanded.
Crops: `module-item-list-expanded.png`.

| Property | expanded |
|---|---|
| Size (w x h) | 811.33 x 856 |
| Padding | 16px 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Extra (`expanded`): `{"h5":{"font":"600 16px / 20px \SSP","color":"#0d0f12","margin":"0px"},"h5Label":"600 16px / 20px \SSP","li":{"font":"16px / 24px \SSP","color":"#0d0f12","padding":"0px","margin":"0px","h":24,"listStyle":"outside none none","ulPadding":"0px"},"dur":{"font":"16px / 24px \SSP","color":"#48546e"}}`

#### spec-course-accordion

Specialization course list item: 94x53 thumbnail, title link (h3), "Course 1 • 33 hours", chevron button at the right; expands to What you'll learn and skill tags.

Page: spec (https://www.coursera.org/specializations/machine-learning-introduction). Selector: `#courses [data-testid=accordion-item]`. States: collapsed, expanded.
Crops: `spec-course-accordion-collapsed.png`, `spec-course-accordion-expanded.png`.

| Property | collapsed | expanded |
|---|---|---|
| Size (w x h) | 817.33 x 83 | 817.33 x 435 |
| Padding | 0 | same |
| Display | block | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Text node font | a.cds-119.cds-113: Source Sans Pro 20/28 600 `--cds-typography-title2`, ls -0.1px | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975`, underline | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Icon | 20 x 20, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same |

- Painted in `collapsed`: div.cds-AccordionRoot-container.cds-AccordionRoot-silent, 813.3x79.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid transparent, radius 16px; span.cds-tag-medium.cds-tag-category, 132.2x22.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 50px; span.cds-tag-medium.cds-tag-category, 129.5x22.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 50px; span.cds-tag-medium.cds-tag-category, 137.5x22.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 50px; span.cds-tag-medium.cds-tag-category, 135.3x22.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 50px; span.cds-tag-medium.cds-tag-category, 162.5x22.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 50px
- Painted in `expanded`: div.cds-AccordionRoot-container.cds-AccordionRoot-silent, 813.3x431.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid transparent, radius 16px; button.cds-149.cds-button-disableElevation, 155.3x77.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 8px; span.cds-tag-medium.cds-tag-category, 132.2x22.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 50px; span.cds-tag-medium.cds-tag-category, 129.5x22.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 50px; span.cds-tag-medium.cds-tag-category, 137.5x22.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 50px; span.cds-tag-medium.cds-tag-category, 135.3x22.0, bg #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, border 1px solid #dae1ed `--cds-color-neutral-disabled` / `--cds-color-grey-100`, radius 50px

- Extra (`collapsed`): `{"img":{"w":94,"h":53,"radius":"0px","border":"0px none #0d0f12"},"title":{"font":"600 20px / 28px \SSP","color":"#0d0f12","decoration":"underline"},"meta":{"font":"14px / 20px \SSP","color":"#48546e","decoration":"none"}}`
- Repeated items: 3 measured, sizes 817.3x83.0, 817.3x93.0, 817.3x93.0, gaps dy 8, dy 8

#### credits-callout

"Build toward a degree" callout under the course list.

Page: spec (https://www.coursera.org/specializations/machine-learning-introduction). Selector: `#credits`. States: default.
Crops: `credits-callout-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 817.33 x 96 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h3: Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm`, ls -0.06px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 34 x 34, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |

- Painted in `default`: div, 76.0x54.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`, radius 8px

### Instructors, testimonials, reviews, FAQ

#### testimonials-home

Home page testimonials band.

Page: home (https://www.coursera.org/). Selector: `[data-testid=testimonials]`. States: default.
Crops: `testimonials-home-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1440 x 294 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h2: Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm`, ls -0.06px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 0 x 0, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 324.0x226.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 8px; div, 324.0x226.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 8px; div, 324.0x226.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 8px; div, 324.0x226.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 8px; button.cds-149, 0.0x0.0, bg-image linear-gradient(270deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 80%); button.cds-149, 0.0x0.0, bg-image linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 80%)

#### instructor-card

Instructors card in the right column beside Modules: heading, ratings line with (i), avatar + Top Instructor badge + name link + org + counts, "View all 4 instructors", rule, then "Offered by".

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#modules right column, bordered box`. States: default.
Crops: `instructor-card-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 426.66 x 502 |
| Padding | 8px 32px |
| Display | block |
| Border | 2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` |
| Radius | 8px `--cds-border-radius-100` |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm`, ls -0.06px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 16 x 16, colour #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` |

- Painted in `default`: div, 426.7x502.0, border 2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 8px; div, 50.0x50.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 50%; div, 106.1x22.0, bg #cfe2ff `--cds-color-blue-100`, radius 4px; div, 358.7x226.0, border T:2px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`; div, 50.0x50.0, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 8px; div, 50.0x50.0, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 8px

#### instructor-avatar

Instructor photo in the card.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `instructor card img`. States: default.
Crops: `instructor-avatar-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 44 x 44 |
| Padding | 0 |
| Display | inline |
| Radius | 50% |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Extra (`default`): `{"wrapper":{"w":50,"h":50,"border":"1px solid #e9eef7","radius":"50%","bg":"#ffffff","shadow":"none"}}`

#### testimonial-card

Testimonial card: 64px round photo, name (h3), "Learner since", quote.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#testimonials .cds-grid-item > div`. States: default.
Crops: `testimonial-card-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 312 x 202 |
| Padding | 16px |
| Display | block |
| Border | 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200` |
| Radius | 8px `--cds-border-radius-100` |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h3: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 312.0x202.0, border 1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`, radius 8px

- Extra (`default`): `{"img":{"w":64,"radius":"100%"},"name":{"font":"600 16px / 20px \SSP","color":"#0d0f12","letterSpacing":"-0.048px","margin":"0px"},"since":{"font":"16px / 24px \SSP","color":"#48546e","letterSpacing":"normal","margin":"0px"},"quote":{"font":"16px / 24px \SSP","color":"#48546e","letterSpacing":"normal","margin":"0px"},"heading":{"font":"600 30px / 36px \SSP","color":"#0d0f12","letterSpacing":"-0.15px","margin":"0px 0px 24px"}}`
- Repeated items: 4 measured, sizes 344.0x234.0, 344.0x234.0, 344.0x234.0, 344.0x234.0, gaps dx 0, dx 0, dx 0

#### ratings-summary

Ratings summary: star + big "4.9", "32,925 reviews", then a 5-row bar graph (6px bars, percent labels).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#reviews left column`. States: default.
Crops: `ratings-summary-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 426.66 x 304 |
| Padding | 32px 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span.cds-119.cds-Typography-base: Source Sans Pro 28/36 600 `--cds-typography-title1`, `--cds-typography-title-medium-sm`, ls -0.1px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 20 x 20, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: li, 315.0x28.0, border B:8px solid transparent; div, 212.0x6.0, bg #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 8px; div, 194.1x6.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, radius 8px; li, 315.0x32.0, border B:8px solid transparent; div, 212.0x6.0, bg #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 8px; div, 15.4x6.0, bg #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800`, radius 8px

- Extra (`default`): `{"big":{"font":"600 28px / 36px \SSP","color":"#0d0f12"},"star":{"w":20,"color":"#0d0f12","fill":"none"},"track":{"w":212,"h":6,"bg":"#e9eef7","radius":"8px"},"fill":{"bg":"#0056d2","radius":"8px"},"label":{"font":"600 16px / 20px \SSP","color":"#0d0f12"},"pct":{"font":"14px / 20px \SSP","color":"#0d0f12"},"rowGap":"normal"}`
- Repeated items: 5 measured, sizes 315.0x28.0, 315.0x32.0, 315.0x32.0, 315.0x32.0, gaps dy 0, dy 0, dy 0, dy 0

#### review-card

Review card: initial avatar circle, initials, star line (16px stars) · date, review text, Show more.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `#reviews review row`. States: default.
Crops: `review-card-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 885.33 x 202 |
| Padding | 24px 32px |
| Display | flex row, align normal, justify normal |
| Border | 2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` |
| Radius | 8px `--cds-border-radius-100` |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | div: Source Sans Pro 30/36 600 `--cds-typography-title-small`, ls -0.15px |
| Text node colour | #ffffff `--cds-color-neutral-primary-invert` / `--cds-color-white-0` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 16 x 16, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 885.3x202.0, border 2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 8px; div, 60.0x60.0, bg #0b408b `--cds-color-emphasis-primary-background-xstrong` / `--cds-color-blue-850`, radius 200px

- Extra (`default`): `{"avatar":{"w":60,"h":60,"bg":"#0b408b","radius":"200px","border":"0px none #0d0f12"},"initial":{"font":"600 30px / 36px \SSP","color":"#ffffff"},"star":{"w":16,"color":"#0d0f12","fill":"none"},"starGap":"18px pitch","num":{"font":"700 14px / 18px \SSP","color":"#0d0f12"},"date":{"font":"14px / 20px \SSP","color":"#0d0f12"},"body":{"font":"16px / 24px \SSP","color":"#0d0f12"},"cardBg":"transparent","cardBorder":"2px solid #e9eef7","cardRadius":"8px","cardPadding":"24px 32px"}`
- Repeated items: 4 measured, sizes 885.3x202.0, 885.3x202.0, 885.3x202.0, 885.3x24.0, gaps dy 24, dy 24, dy 24

#### faq-accordion

FAQ item (cds-AccordionRoot with a leading 24px chevron, question 16px semibold); items are separated by rules.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.cds-ShowMoreList-listContainer [role=listitem]`. States: collapsed, expanded.
Crops: `faq-accordion-collapsed.png`, `faq-accordion-expanded.png`.

| Property | collapsed | expanded |
|---|---|---|
| Size (w x h) | 825.33 x 71 | 825.33 x 191 |
| Padding | 0 | same |
| Display | block | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same |
| Text node font | span: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |

- Painted in `collapsed`: div, 825.3x71.0, border B:1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`; div.cds-AccordionRoot-container.cds-AccordionRoot-silent, 821.3x58.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid transparent, radius 16px
- Painted in `expanded`: div, 825.3x191.0, border B:1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`; div.cds-AccordionRoot-container.cds-AccordionRoot-silent, 821.3x178.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid transparent, radius 16px; h3, 819.3x56.0, bg #f0f6ff `--cds-color-interactive-background-primary-hover-weak` / `--cds-color-blue-25`, radius 16px

- Extra (`collapsed`): `[{"cls":"","borderBottom":"0px none #0d0f12","borderTop":"0px none #0d0f12","bg":"transparent","radius":"0px","padding":"0px","h":71},{"cls":"css-d101lu","borderBottom":"1px solid #e9eef7","borderTop":"0px none #0d0f12","bg":"transparent","radius":"0px","padding":"0px 0px 8px","h":71},{"cls":"css-d44ocx","borderBottom":"0px none #0d0f12","borderTop":"0px none #0d0f12","bg":"transparent","radius":"0px","padding":"0px","h":62},{"cls":"cds-AccordionRoot-focusContainer","borderBottom":"0px none #0d0f12","borderTop":"0px none #0d0f12","bg":"transparent","radius":"0px","padding":"2px","h":62},{"cls":"cds-AccordionRoot-container cds-AccordionRoot-silent","borderBottom":"1px solid transparent","borderTop":"1px solid transparent","bg":"#ffffff","radius":"16px","padding":"0px","h":58}]`
- Repeated items: 3 measured, sizes 825.3x71.0, 825.3x71.0, 825.3x62.0, gaps dy 0, dy 0

#### faq-accordion-header

FAQ header button (cds-AccordionHeader-button).

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.cds-AccordionHeader-button`. States: default, hover, focus-visible, pressed, expanded.
Crops: `faq-accordion-header-default.png`, `faq-accordion-header-hover.png`, `faq-accordion-header-focus-visible.png`, `faq-accordion-header-pressed.png`.

| Property | default | hover | focus-visible | pressed | expanded |
|---|---|---|---|---|---|
| Size (w x h) | 819.33 x 56 | same | same | same | same |
| Padding | 16px | same | same | same | same |
| Display | flex row, align flex-start, justify center | same | same | same | same |
| Radius | 8px `--cds-border-radius-100` | same | same | same | same |
| Background | transparent | same | same | same | same |
| Font | Source Sans Pro 30/36 600 `--cds-typography-title-small` | same | same | same | same |
| Text node font | span: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px | same | same | same | same |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same | same |
| Cursor | pointer | same | same | same | same |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same | same | same |

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- `pressed` reached by: CDP forcePseudoState :active:hover

#### faq-question

Question label.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.cds-AccordionHeader-labelDetails`. States: default.

| Property | default |
|---|---|
| Size (w x h) | 383.47 x 20 |
| Padding | 0 |
| Display | flex column, align flex-start, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 30/36 600 `--cds-typography-title-small` |
| Text node font | span: Source Sans Pro 16/20 600 `--cds-typography-subtitle-medium`, ls -0.048px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Cursor | pointer |

#### faq-chevron

Leading chevron in the FAQ header.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `.cds-AccordionHeader-chevron`. States: collapsed, expanded.

| Property | collapsed | expanded |
|---|---|---|
| Size (w x h) | 24 x 24 | same |
| Padding | 0 | same |
| Margin | 0 12px 0 0 | same |
| Display | block | same |
| Radius | 0px | same |
| Background | transparent | same |
| Font | Source Sans Pro 30/36 600 `--cds-typography-title-small` | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |
| Transition | transform 0.15s ease-in-out | same |
| Cursor | pointer | same |
| Transform | none | matrix(-1, 0, 0, -1, 0, 0) |
| Icon | 24 x 24, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same |

#### faq-panel

FAQ answer panel.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `[role=region]`. States: expanded.

| Property | expanded |
|---|---|
| Size (w x h) | 819.33 x 96 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary`, ls normal |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Extra (`expanded`): `{"p":{"font":"16px / 24px \SSP","color":"#0d0f12"}}`

#### more-questions

"More questions" aside next to the FAQ.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `h3 "More questions" container`. States: default.
Crops: `more-questions-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 426.66 x 238 |
| Padding | 32px 24px |
| Display | block |
| Border | 2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` |
| Radius | 8px `--cds-border-radius-100` |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h3.cds-119.cds-Typography-base: Source Sans Pro 20/28 600 `--cds-typography-title2`, ls -0.1px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Icon | 20 x 20, colour #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 426.7x238.0, border 2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 8px; div.rc-FinaidLink.reset, 374.7x50.0, border T:2px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`

#### promo-band

"See how employees at top companies..." promo band with a logo strip.

Page: course (https://www.coursera.org/learn/machine-learning). Selector: `container of the Coursera for Business link`. States: default.
Crops: `promo-band-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1278 x 116 |
| Padding | 0 |
| Display | flex row, align normal, justify normal |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h1.cds-119.cds-121: Source Sans Pro 28/36 600 `--cds-typography-title1`, `--cds-typography-title-medium-sm`, ls -0.1px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### instructor-card-spec

Instructors + Offered by aside on the specialization page.

Page: spec (https://www.coursera.org/specializations/machine-learning-introduction). Selector: `#courses right column`. States: default.
Crops: `instructor-card-spec-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 426.66 x 482 |
| Padding | 8px 32px |
| Display | block |
| Border | 2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50` |
| Radius | 8px `--cds-border-radius-100` |
| Background | transparent |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | span: Source Sans Pro 20/24 600 `--cds-typography-subtitle-large`, `--cds-typography-title-x-small-sm`, ls -0.06px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: div, 426.7x482.0, border 2px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 8px; div, 50.0x50.0, bg #ffffff `--cds-color-neutral-background-primary` / `--cds-color-white-0`, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 50%; div, 106.1x22.0, bg #cfe2ff `--cds-color-blue-100`, radius 4px; div, 358.7x226.0, border T:2px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`; div, 50.0x50.0, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 8px; div, 50.0x50.0, border 1px solid #e9eef7 `--cds-color-interactive-background-secondary-pressed-weak` / `--cds-color-grey-50`, radius 8px

### Footer

#### footer

Global footer: link columns (Skills, Certificates, ...), then a bottom row with the copyright, app badges and social icons.

Page: home (https://www.coursera.org/). Selector: `footer.rc-SeoGlobalFooter`. States: default.
Crops: `footer-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 1440 x 1217 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25` |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` |
| Text node font | h2.rc-SubFooterSection__header.lohp-rebrand: Source Sans Pro 20/28 600 `--cds-typography-title2`, ls -0.1px |
| Text node colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

- Painted in `default`: footer.rc-SeoGlobalFooter.lohp-rebrand, 1440.0x1217.0, bg #f2f5fa `--cds-color-interactive-background-secondary-hover-weak` / `--cds-color-grey-25`; div.rc-SeoGlobalFooter__social-media-and-copyright.lohp-rebrand, 1376.0x141.0, border T:1px solid #c1cbdb `--cds-color-neutral-stroke-primary-weak` / `--cds-color-grey-200`

- Extra (`default`): `{"bg":"#f2f5fa","top":4600.796875,"height":1217}`
- Columns: 7, sizes 344.0x344.0, 344.0x344.0, 344.0x344.0, 344.0x344.0, gaps dx 0, dx 0, dx 0, dy 60, dx 0, dx 0

#### footer-heading

Footer column heading.

Page: home (https://www.coursera.org/). Selector: `footer.rc-SeoGlobalFooter .rc-SubFooterSection__header`. States: default.
Crops: `footer-heading-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 304 x 28 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 20/28 600 `--cds-typography-title2` |
| Letter spacing | -0.1px |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### footer-link

Footer column link.

Page: home (https://www.coursera.org/). Selector: `footer.rc-SeoGlobalFooter .rc-SubFooterSection__content-column-link-text`. States: default, hover, focus-visible.
Crops: `footer-link-default.png`, `footer-link-hover.png`, `footer-link-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 65.53 x 20 | same | same |
| Padding | 0 | same | same |
| Display | inline | same | same |
| Radius | 0px | same | same |
| Background | transparent | same | same |
| Outline | none | same | 1px auto #005fcc no token offset 1px |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` | same | same |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` | same | same |
| Text decoration | none | underline | underline |
| Cursor | pointer | same | same |

- Painted in `focus-visible`: a.rc-SubFooterSection__content-column-link-text, 65.5x20.0, outline 1px auto #005fcc offset 1px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab
- Repeated items: 8 measured, sizes 286.0x20.0, 286.0x20.0, 286.0x20.0, 286.0x20.0, gaps dy 10, dy 10, dy 10, dy 10, dy 10, dy 10, dy 10

#### footer-copyright

Copyright line in the footer bottom row.

Page: home (https://www.coursera.org/). Selector: `footer text "© 2026 Coursera Inc."`. States: default.
Crops: `footer-copyright-default.png`.

| Property | default |
|---|---|
| Size (w x h) | 231.23 x 20 |
| Padding | 0 |
| Display | block |
| Radius | 0px |
| Background | transparent |
| Font | Source Sans Pro 14/20 400 `--cds-typography-body2`, `--cds-typography-body-secondary` |
| Colour | #0d0f12 `--cds-color-interactive-secondary` / `--cds-color-grey-975` |

#### footer-social-icon

Social icon link in the footer bottom row.

Page: home (https://www.coursera.org/). Selector: `footer a[href*=facebook]`. States: default, hover, focus-visible.
Crops: `footer-social-icon-default.png`, `footer-social-icon-hover.png`, `footer-social-icon-focus-visible.png`.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 28 x 28 | same | same |
| Padding | 0 | same | same |
| Display | inline | same | same |
| Radius | 0px | same | same |
| Background | transparent | same | same |
| Outline | none | same | 1px auto #005fcc no token offset 1px |
| Font | Source Sans Pro 16/24 400 `--cds-typography-body1`, `--cds-typography-body-primary` | same | same |
| Colour | #0056d2 `--cds-color-interactive-primary` / `--cds-color-blue-800` | same | same |
| Text decoration | none | underline | underline |
| Cursor | pointer | same | same |

- Painted in `focus-visible`: a, 28.0x28.0, outline 1px auto #005fcc offset 1px

- `hover` reached by: mouse hover
- `focus-visible` reached by: Shift+Tab, Tab

## CDS class names in the stylesheets

Union of every `cds-*` class named in a stylesheet selector on the five pages (571 names; 246 of them are numbered `cds-<n>` Emotion labels with no component meaning, not listed). Grouped by component, modifiers after the colon.

- `cds-AccordionGroup`: itemSpacing
- `cds-AccordionHeader`: button, chevron, content, expanded, freeContent, hasTitleIcon, labelDetails, labelGroup, positionEnd, titleIcon
- `cds-AccordionPanel`: notPadded
- `cds-AccordionRoot`: container, focus, focusContainer, hover, silent, standard
- `cds-AutocompleteOption`: checkboxIcon, checked, content, disabled, focused, loading, prefix, suffix
- `cds-AutocompleteSearch`: fullWidth
- `cds-Avatar`: base, initial, initialText, organization, showBorder, user
- `cds-breadcrumbs`: actionOverflowTrigger, disableNowrap, hide, homeIcon, link, list, listItem, pendingOverflowCalculation
- `cds-button`: disableElevation, disabled, endIcon, focusVisible, label, loadingOpacity, secondary, startIcon
- `cds-buttonBase`: focusVisible
- `cds-ChatResponseField`: actionRow, actionRowRight, charLimit, charLimitAnnouncement, charLimitError, charLimitHidden, contextRow, dragAnnouncement, dragging, focusRing, hiddenFileInput, leadingAction, maxLengthDescription, micAnnouncement, multiLine, streaming, streamingAnnouncement, textMeasure, textRow, textarea, trailingActionsWrapper
- `cds-checkboxAndRadio`: checked, disabled, error, focusVisible, hasIcon, icon, indeterminate, input, label, labelContent, labelSuffix, labelText, nonInteractiveSpace, success, supportText
- `cds-Chip`: deletable, deleteIcon, label, labelText, root, selected, startIcon
- `cds-choiceInput`: checked, disabled, focusVisible, indeterminate
- `cds-CommonCard`: avatar, bodyContent, category, clickArea, creditType, dotSeparator, icon, interactiveArea, linkFocusVisible, metadata, previewImage, title, titleLink, watchNow, watchNowIconLabel
- `cds-ContextualHelp`: container, helpToggleButton, inverted, label, tooltipActions, tooltipCloseButton, tooltipContainer, tooltipExpanded
- `cds-ContextualHelpIcon`: background, crosspath, dot, expanded, i, inverted, neck
- `cds-Dialog`: dialog
- `cds-Divider`: dark, white
- `cds-formControl`: formLabel, formStatusText, formSupportText, formValidationStatus, root
- `cds-formGroup`: groupWrapper, groupWrapperThreeColumns, groupWrapperTwoColumns, hasCardsInTheGroup
- `cds-grid`: item
- `cds-iconButton`: disabled, ghost, ghostInvert, ghostSecondary, medium, primary, primaryInvert, round, secondary, secondaryInvert, secondaryNeutral, small
- `cds-inlineNotification`: inlineNotificationTitle, inlineSeverityIcon
- `cds-input`: adornedEnd, adornedStart, disabled, focused, input, invalid, multiline, notchedOutline, onDark, onLight, placeholder, readOnly, root, valid
- `cds-inputAdornment`: center, end, filled, hasSeparator, hiddenLabel, invalid, standard, start, top, valid
- `cds-link`: focusVisible, icon
- `cds-Loader`: backgroundCircle, container, fillCircle, imageContainer, invert, label, mainCircle, overlayHidden, secondaryCircle, status, tertiaryCircle
- `cds-localNotification`: actions, content, contentInner, dismissible, hasActions, hasDismiss, iconContentInner, inlineAction, inlineActionContainer
- `cds-LogoWrapper`: base, mediumPaddingInside, mediumPaddingOutside, noPadding, smallPaddingInside, smallPaddingOutside
- `cds-Modal`: backdrop, container
- `cds-multiSelectGroup`: divider, label, list
- `cds-Pill`: root
- `cds-popoverContainer`: inner
- `cds-popoverDropdown`: error, paper, success
- `cds-popoverFooter`: root
- `cds-ProductCard`: adminContent, alwaysSmallImage, base, body, compact, content, footer, grid, gridCard, gridPreviewContainer, gridSkeleton, gridSkeletonBody, gridSkeletonFooter, gridSkeletonHeader, gridSkeletonPreview, header, headerBodySlot, list, listCard, listContentContainer, listPreviewImage, listSkeleton, listSkeletonContent, listSkeletonFooter, listSkeletonPreview, listSkeletonPreviewContainer, listSkeletonSection, partnerInfo, partnerLogos, partnerNames, partners, statusTags, statusTagsOverlay, statusTagsSimple
- `cds-radioInput`: checkedIconBg, disabled, focusVisible
- `cds-Search`: actionButtons, base, clearPlaceholder, focused, inputRoot, notchedOutline, prefix, rounded, silent, suffix
- `cds-SearchClearButton`: searchClearButton, searchClearIcon
- `cds-select`: field-formSupportText, field-formValidationStatus, field-label, field-readOnly, field-root, focusVisible, icon, list, opened, paper, readOnly, select
- `cds-selectOption`: button, container, focusVisible, icon, root, selected
- `cds-ShowMoreContainer`: content, ctaButton, ctaIcon, silent, standard
- `cds-ShowMoreList`: ctaButton, ctaIcon, expanded, firstExpandedItem, listContainer
- `cds-Skeleton`: circle, fitContent, heightAuto, root, text, withChildren
- `cds-tag`: ai, category, default, error, hasIcon, highlight1, highlight2, medium, primary, secondary, small, status, success, warning
- `cds-Tooltip`: arrow, inverted, placementBottom, placementTop, tooltip
- `cds-Typography`: alignCenter, alignJustify, alignLeft, alignRight, displayBlock, displayInline
