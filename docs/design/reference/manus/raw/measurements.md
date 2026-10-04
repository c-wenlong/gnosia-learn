# Manus component measurements

Computed styles read on 2026-10-04 by `tools/capture/signed-in/measure.mjs` from static snapshots of the signed-in app (1440x900 (the mobile-* snapshots 390x844), deviceScaleFactor 2), and written here by `tools/capture/signed-in/build-measurements.mjs` from [components-computed.json](components-computed.json). Each snapshot was captured in the dark theme. Dark states have plain names; light states (`light`, `light-<state>`) were read from the same DOM with the `dark` class removed from <html>. Every state records `theme` and `snapshot`.

Every component has one table per theme: a column per state, a row per property. A cell that repeats the first column reads `=`. Colours are hex, with `@ alpha` when translucent. "Painted layers" lists the first nodes inside the component that paint a fill, border, shadow or outline (Manus often paints a hover or selection on an inner layer, not the element itself); "Ancestor paint" the same for its parents. "Tokens" lists the `var(--x)` names the component's Tailwind classes use, with the value each resolved to in that theme.

States: `hover` is a real pointer hover; `focus-visible` a real keyboard focus (Shift+Tab, Tab), skipped where the element (a div with role=button) cannot take focus; the rest (`active`, `selected`, `checked`, `open`, `typed`, `enabled`, ...) are other elements or snapshots captured in that state. Light states are prefixed `light`. The 390 wide snapshots are measured at rest only.

233 components, 842 states (842 measured, 0 skipped, 0 not found).

## Shared values

Tallied over every measured state by the build script.

- **Radius scale** (element radius, times seen): 8px (298), 12px (116), 9999px (66), 10px (52), 6px (48), 22px (18), 5px (8), 100px (6), 4px (6), 16px (4), 20px (2), 14px (2).
- **Transitions**: `color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1)` (198), `background-color 0.15s cubic-bezier(0, 0, 0.2, 1)` (14), `transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)` (10), `color, background-color, border-color, text-decoration-color, fill, stroke 0.2s cubic-bezier(0.4, 0, 0.2, 1)` (8), `opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1)` (6), `box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)` (6), `opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)` (4), `color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0, 0, 0.2, 1)` (4), `width, background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1)` (4), `all 0.15s cubic-bezier(0.4, 0, 0.2, 1)` (4).
- **Font families**: -apple-system (1340), LibreBaskerville (24), ui-sans-serif (2).
- **Type sizes** (size/line-height weight of the first text): 16px/24px 400 (206), 14px/20px 400 (180), 14px/20px 500 (90), 14px/18px 500 (56), 13px/18px 400 (52), 12px/16px 400 (42), 14px/21px 400 (32), 16px/22px 500 (30), 13px/18px 500 (22), 13px/19.5px 400 (14), 14px/21px 500 (14), 12px/18px 600 (12), 12px/20px 600 (10), 14px/18px 400 (10).
- **Shadows**: `#000000 @ 0.02 0px 12px 32px 0px` (24); `#ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px` (24); `#000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px` (24); `#000000 @ 0.06 0px 8px 16px 0px` (14); `#000000 @ 0.16 0px 3px 10px 0px` (8); `#000000 @ 0.04 0px 3px 10px 0px` (8).
- **Focus-visible, dark** (51 focused states): nothing painted on the element (36); outline 1px solid #ffffff @ 0.12 offset -1px (7); outline 2px solid #1a93fe offset 2px (3); outline 1px solid #ffffff @ 0.06 offset -1px (2); outline 2px solid #b3b3b3 offset 0px (1); outline 2px solid #000000 @ 0 offset 2px (1); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px (1).
- **Focus-visible, light** (51 focused states): nothing painted on the element (36); outline 1px solid #000000 @ 0.12 offset -1px (7); outline 2px solid #0081f2 offset 2px (3); outline 1px solid #000000 @ 0.06 offset -1px (2); outline 2px solid #4d4d4d offset 0px (1); outline 2px solid #000000 @ 0 offset 2px (1); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px (1).
- **Hover changes, dark** (108 hovered components, 23 with no change on the element or its first painted layer): backgroundColor #000000 @ 0 → #ffffff @ 0.04 (44); backgroundColor #000000 @ 0 → #ffffff @ 0.06 (14); backgroundColor #ffffff @ 0.04 → #ffffff @ 0.06 (4); backgroundColor #242424 → #ffffff @ 0.06 (3); backgroundColor #242424 → #1c1c1c (2); backgroundColor #0081f2 @ 0.08 → #0081f2 @ 0.12 (1); backgroundColor #242424 → #1a1a1a (1); backgroundColor #ffffff @ 0.06 → #ffffff @ 0.04 (1).
- **Hover changes, light** (108 hovered components, 23 with no change on the element or its first painted layer): backgroundColor #000000 @ 0 → #37352f @ 0.04 (44); backgroundColor #000000 @ 0 → #37352f @ 0.06 (14); backgroundColor #37352f @ 0.04 → #37352f @ 0.06 (4); backgroundColor #ffffff → #ffffff @ 0.08 (3); backgroundColor #ffffff → #f8f8f7 (2); backgroundColor #0081f2 @ 0.08 → #0081f2 @ 0.12 (1); backgroundColor #ffffff → #fafafa (1); backgroundColor #37352f @ 0.06 → #37352f @ 0.04 (1).

### Tokens the measured components use

Every `var(--x)` named in a measured component's classes, with the value it resolved to in each theme.

| Token | Dark | Light |
|---|---|---|
| `--accent-send-button` | #fffffff2 | #1a1a19 |
| `--available-width` | 1124px | 1124px |
| `--background-card` | #1c1c1c | #fafafa |
| `--background-card-gray` | #1c1c1c | #fafafa |
| `--background-dialog-mask` | #0009 | #0000004d |
| `--background-game-promo` | #000 | #1a1a19 |
| `--background-game-promo-preview` | #041b47 | #041b47 |
| `--background-gray-main` | #1a1a1a | #f8f8f7 |
| `--background-mask-black` | #00000073 | #000000a6 |
| `--background-mask-white` | #3f3f3f52 | #ffffffa6 |
| `--background-menu-gray` | #1a1a1a | #f8f8f7 |
| `--background-menu-tooltips` | #000000e6 | #000000e6 |
| `--background-menu-white` | #242424 | #fff |
| `--background-nav` | #1f1f1f | #f0f0f0 |
| `--background-tsp-menu-white` | #ffffff0f | #ffffff14 |
| `--border-dark` | #ffffff1f | #00000024 |
| `--border-game-promo-preview` | #8f8f8f4f | #8f8f8f4f |
| `--border-input-active` | #ffffff52 | #0000004d |
| `--border-light` | #ffffff08 | #0000000a |
| `--border-main` | #ffffff0f | #0000000f |
| `--border-white` | #00000014 | #fff3 |
| `--Button-black` | #fffffff2 | #1a1a19 |
| `--Button-blue` | #1a93fe | #0081f2 |
| `--Button-border-secondary` | #ffffff1f | #0000001f |
| `--dlg-enter-scale` | 1 | 1 |
| `--dlg-enter-y` | 0px | 0px |
| `--fill-black` | #28282973 | #28282973 |
| `--fill-gray` | #1c1c1c | #f8f8f7 |
| `--fill-tsp-gray-dark` | #0000004d | #37352f14 |
| `--fill-tsp-gray-main` | #0003 | #37352f0a |
| `--fill-tsp-white-dark` | #ffffff14 | #37352f14 |
| `--fill-tsp-white-light` | #ffffff0a | #37352f0a |
| `--fill-tsp-white-main` | #ffffff0f | #37352f0f |
| `--fill-white` | #242424 | #fff |
| `--fill-white-primary` | #404040 | #fff |
| `--function-error` | #eb4d4d | #fb494f |
| `--function-success` | #5eb92d | #25ba3b |
| `--icon-blue` | #1a93fe | #0081f2 |
| `--icon-disable` | #595959 | #a6a6a6 |
| `--icon-primary` | #e6e6e6 | #1a1a1a |
| `--icon-secondary` | #b3b3b3 | #4d4d4d |
| `--icon-tertiary` | #8c8c8c | #737373 |
| `--icon-white` | #fff | #fff |
| `--illustration-studio-create-paper` | linear-gradient(180deg, #ffffff0a 0%, #ffffff1a 100%), linear-gradient(180deg, #0000001a 0%, #00000005 100%) | linear-gradient(180deg, #ffffff0a 0%, #ffffff1a 100%), linear-gradient(180deg, #0000001a 0%, #00000005 100%) |
| `--scroll-shadow-background` | none,  | none,  |
| `--scroll-shadow-block-end-offset` | -669px,  | -669px,  |
| `--scroll-shadow-block-start-offset` | 0px,  | 0px,  |
| `--scroll-shadow-height` | 669px,  | 669px,  |
| `--scroll-shadow-inline-end-offset` | calc(-100% - 0px),  | calc(-100% - 0px),  |
| `--scroll-shadow-inline-start-offset` | 0px,  | 0px,  |
| `--scroll-shadow-width` | calc(100% + 0px),  | calc(100% + 0px),  |
| `--scroll-shadow-z-index` | 1,  | 1,  |
| `--shadow-M` | #00000047 | #0000000f |
| `--shadow-S` | #00000029 | #0000000a |
| `--shadow-XS` | #00000014 | #00000005 |
| `--shadows-drop-2` | #0003 | #16191d0a |
| `--simplebar-scrollbar-width` | - | - |
| `--tab-close-width` | - | - |
| `--tab-fill` | #ffffff0a | #0000000a |
| `--tab-title-mask` | - | - |
| `--text-blue` | #1a93fe | #0081f2 |
| `--text-disable` | #595959 | #a6a6a6 |
| `--text-onblack` | #000000e5 | #fff |
| `--text-primary` | #e6e6e6 | #1a1a1a |
| `--text-primary-hover` | - | - |
| `--text-secondary` | #b3b3b3 | #4d4d4d |
| `--text-tertiary` | #8c8c8c | #737373 |
| `--text-white` | #fff | #fff |
| `--text-white-tsp` | #fff9 | #fff9 |
| `--ui-density-bubble-padding-y` | 12px | 12px |
| `--ui-density-card-radius` | 12px | 12px |
| `--ui-density-composer-radius` | 22px | 22px |
| `--ui-density-content-padding` | 12px | 12px |
| `--ui-density-home-input-editor-min-height` | 50px | 50px |
| `--ui-density-input-editor-min-height` | 50px | 50px |
| `--ui-density-input-gap` | 10px | 10px |
| `--ui-density-menu-item-padding-y` | 8px | 8px |
| `--ui-density-nav-icon-box-size` | 20px | 20px |
| `--ui-density-nav-item-gap` | 8px | 8px |
| `--ui-density-nav-item-padding-start` | 8px | 8px |
| `--ui-density-outer-padding` | 8px | 8px |
| `--ui-density-row-gap` | 8px | 8px |
| `--ui-density-row-height` | 36px | 36px |
| `--ui-density-row-radius` | 10px | 10px |
| `--ui-density-section-gap` | 12px | 12px |
| `--ui-density-section-padding-start` | 10px | 10px |
| `--ui-density-section-row-gap` | 12px | 12px |
| `--ui-density-small-radius` | 8px | 8px |
| `--ui-density-small-row-height` | 32px | 32px |
| `--ui-density-suggestion-padding-y` | 9px | 9px |
| `--ui-font-size-label` | 13px | 13px |
| `--ui-font-size-sm` | 14px | 14px |
| `--ui-font-size-title-base` | 16px | 16px |
| `--ui-line-height-label` | 18px | 18px |
| `--ui-line-height-sm` | 20px | 20px |
| `--ui-line-height-title-base` | 22px | 22px |
| `--ui-line-height-xs` | 16px | 16px |

## Components

### Sidebar

#### sidebar

Sidebar (expanded). 300 wide, full height, its own --background-nav fill; a 1px rule drawn by nav::after at the inline end.

Snapshot: `home-dark`. Finder: `() => Q('nav')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 300 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #1f1f1f |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.truncate: -apple-system 14px/21px 400, #e6e6e6 |
| Transition | transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) |
| Icon | 28 x 28, colour #e6e6e6 |
| ::after | 1px x 900px, absolute, bg #ffffff @ 0.06, radius 0px |
| Painted layers | nav.relative.flex.flex-col 300.0x900.0 bg #1f1f1f; nav.relative.flex.flex-col::after 1pxx900px bg #ffffff @ 0.06; div.pointer-events-none.absolute.inset-x-0 300.0x1.0 border T:1px solid #ffffff @ 0.03 opacity 0; span.flex.h-5.shrink-0 40.4x20.0 bg #ffffff @ 0.08 r 9999px; div.flex.flex-col.gap-px 284.0x77.0 bg #1f1f1f; div.group.group/nav-section.flex 284.0x36.0 bg #1f1f1f |
| Tokens | --background-nav #1f1f1f; --border-light #ffffff08; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-nav-item-padding-start 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 300 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #f0f0f0 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.truncate: -apple-system 14px/21px 400, #1a1a1a |
| Transition | transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) |
| Icon | 28 x 28, colour #1a1a1a |
| ::after | 1px x 900px, absolute, bg #000000 @ 0.06, radius 0px |
| Painted layers | nav.relative.flex.flex-col 300.0x900.0 bg #f0f0f0; nav.relative.flex.flex-col::after 1pxx900px bg #000000 @ 0.06; div.pointer-events-none.absolute.inset-x-0 300.0x1.0 border T:1px solid #000000 @ 0.04 opacity 0; span.flex.h-5.shrink-0 40.4x20.0 bg #37352f @ 0.08 r 9999px; div.flex.flex-col.gap-px 284.0x77.0 bg #f0f0f0; div.group.group/nav-section.flex 284.0x36.0 bg #f0f0f0 |
| Tokens | --background-nav #f0f0f0; --border-light #0000000a; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d; --text-primary #1a1a1a; --text-tertiary #737373; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-nav-item-padding-start 8px |
| How | at rest |

Crops: `sidebar-default.png`, `sidebar-light.png`.

#### sidebar-logo-row

Sidebar logo row. 48 tall: the mark and wordmark at the start, search and collapse icon buttons at the end.

Snapshot: `home-dark`. Finder: `() => Q('nav').querySelector('div > div')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 300 x 48 |
| Padding | 8px 10px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Icon | 28 x 28, colour #e6e6e6 |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 300 x 48 |
| Padding | 8px 10px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Icon | 28 x 28, colour #1a1a1a |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d |
| How | at rest |

Crops: `sidebar-logo-row-default.png`, `sidebar-logo-row-light.png`.

#### sidebar-logo

Sidebar logo (mark and wordmark).

Snapshot: `home-dark`. Finder: `() => K('clickable', 0, Q('nav'))`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 94.83 x 28 | = |
| Padding | 0px | = |
| Gap | 2px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 28 x 28, colour #e6e6e6 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 94.83 x 28 | = |
| Padding | 0px | = |
| Gap | 2px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 28 x 28, colour #1a1a1a | = |
| How | at rest | mouse hover |

Crops: `sidebar-logo-default.png`, `sidebar-logo-hover.png`, `sidebar-logo-light.png`, `sidebar-logo-light-hover.png`.

#### sidebar-search-button

Sidebar search icon button. 32x32, radius 6, the hover fill is --fill-tsp-white-light.

Snapshot: `home-dark`. Finder: `() => C(Q('nav .lucide-search'), '.cursor-pointer')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #b3b3b3, stroke #b3b3b3 2px | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3 | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.04 r 6px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #4d4d4d, stroke #4d4d4d 2px | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.04 r 6px |

Crops: `sidebar-search-button-default.png`, `sidebar-search-button-hover.png`, `sidebar-search-button-light.png`, `sidebar-search-button-light-hover.png`.

#### sidebar-collapse-button

Sidebar collapse icon button.

Snapshot: `home-dark`. Finder: `() => C(Q('nav .lucide-panel-left'), '.cursor-pointer')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #b3b3b3, stroke #b3b3b3 2px | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3 | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.04 r 6px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #4d4d4d, stroke #4d4d4d 2px | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.04 r 6px |

Crops: `sidebar-collapse-button-default.png`, `sidebar-collapse-button-hover.png`, `sidebar-collapse-button-light.png`, `sidebar-collapse-button-light-hover.png`.

#### nav-tab

Nav tab. A `.group/nav-tab` row, 36 tall at this density, an 18px icon in a 20px box and 14px text. Hover reveals the shortcut hint (⌘⇧O). The current page gets a filled row (`active`, from the Library snapshot).

Snapshot: `home-dark`, `library-dark`. Finder: `() => CK(T('New task', Q('nav')), 'group/nav-tab')`.

Dark theme.

| Property | default | hover | active | active-hover |
|---|---|---|---|---|
| Size (w x h) | 284 x 36 | = | = | = |
| Padding | 0px 2px 0px 8px | = | = | = |
| Gap | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 10px | = | = | = |
| Background | transparent | #ffffff @ 0.04 | #ffffff @ 0.06 | #ffffff @ 0.04 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/24px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #e6e6e6 | = | = | = |
| Text node | span.truncate: -apple-system 14px/21px 400, #e6e6e6 | = | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 18 x 18, colour #e6e6e6, stroke #e6e6e6 2px | = | = | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-nav-item-padding-start 8px; --ui-density-row-height 36px; --ui-density-row-radius 10px; --ui-font-size-sm 14px | = | --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-nav-item-padding-start 8px; --ui-density-row-height 36px; --ui-density-row-radius 10px; --ui-font-size-sm 14px | --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-nav-item-padding-start 8px; --ui-density-row-height 36px; --ui-density-row-radius 10px; --ui-font-size-sm 14px |
| How | at rest | mouse hover | at rest, captured active | mouse hover |
| Painted layers | - | div.group/nav-tab.flex.items-center 284.0x36.0 bg #ffffff @ 0.04 r 10px | div.group/nav-tab.flex.items-center 284.0x36.0 bg #ffffff @ 0.06 r 10px | div.group/nav-tab.flex.items-center 284.0x36.0 bg #ffffff @ 0.04 r 10px |

Light theme.

| Property | light | light-hover | light-active | light-active-hover |
|---|---|---|---|---|
| Size (w x h) | 284 x 36 | = | = | = |
| Padding | 0px 2px 0px 8px | = | = | = |
| Gap | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 10px | = | = | = |
| Background | transparent | #37352f @ 0.04 | #37352f @ 0.06 | #37352f @ 0.04 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/24px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #1a1a1a | = | = | = |
| Text node | span.truncate: -apple-system 14px/21px 400, #1a1a1a | = | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 18 x 18, colour #1a1a1a, stroke #1a1a1a 2px | = | = | = |
| Tokens | --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-nav-item-padding-start 8px; --ui-density-row-height 36px; --ui-density-row-radius 10px; --ui-font-size-sm 14px | = | --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-nav-item-padding-start 8px; --ui-density-row-height 36px; --ui-density-row-radius 10px; --ui-font-size-sm 14px | --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-nav-item-padding-start 8px; --ui-density-row-height 36px; --ui-density-row-radius 10px; --ui-font-size-sm 14px |
| How | at rest | mouse hover | at rest, captured active | mouse hover |
| Painted layers | - | div.group/nav-tab.flex.items-center 284.0x36.0 bg #37352f @ 0.04 r 10px | div.group/nav-tab.flex.items-center 284.0x36.0 bg #37352f @ 0.06 r 10px | div.group/nav-tab.flex.items-center 284.0x36.0 bg #37352f @ 0.04 r 10px |

Other finders: active: `() => CK(T('Library', Q('nav')), 'group/nav-tab')`; active-hover: `() => CK(T('Library', Q('nav')), 'group/nav-tab')`; light-active: `() => CK(T('Library', Q('nav')), 'group/nav-tab')`; light-active-hover: `() => CK(T('Library', Q('nav')), 'group/nav-tab')`.

Crops: `nav-tab-default.png`, `nav-tab-hover.png`, `nav-tab-active.png`, `nav-tab-active-hover.png`, `nav-tab-light.png`, `nav-tab-light-hover.png`, `nav-tab-light-active.png`, `nav-tab-light-active-hover.png`.

#### nav-tab-shortcut

Nav tab shortcut hint. Opacity 0 at rest, shown with group-hover; measured while its row is hovered.

Snapshot: `home-dark`. Finder: `() => CK(T('New task', Q('nav')), 'group/nav-tab').querySelector('.ms-auto')`.

Dark theme.

| Property | hover |
|---|---|
| Size (w x h) | 35.59 x 16.5 |
| Padding | 0px 6px 0px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 11px/16.5px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Ancestor paint | 1 up div.group/nav-tab.flex.items-center bg #ffffff @ 0.04 |
| Tokens | --text-tertiary #8c8c8c |
| How | mouse hover on its row |

Light theme.

| Property | light-hover |
|---|---|
| Size (w x h) | 35.59 x 16.5 |
| Padding | 0px 6px 0px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 11px/16.5px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Ancestor paint | 1 up div.group/nav-tab.flex.items-center bg #37352f @ 0.04 |
| Tokens | --text-tertiary #737373 |
| How | mouse hover on its row |

Crops: `nav-tab-shortcut-hover.png`, `nav-tab-shortcut-light-hover.png`.

#### nav-badge-cue

Nav badge (Cue!).

Snapshot: `home-dark`. Finder: `() => CK(T('Agents', Q('nav')), 'group/nav-tab').querySelector('span.rounded-full')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 40.39 x 20 |
| Padding | 0px 8px |
| Border | none |
| Radius | 9999px |
| Background | #ffffff @ 0.08 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/21px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| Icon | 24.39 x 9.2, colour #e6e6e6 |
| Painted layers | span.flex.h-5.shrink-0 40.4x20.0 bg #ffffff @ 0.08 r 9999px |
| Tokens | --fill-tsp-white-dark #ffffff14; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 40.39 x 20 |
| Padding | 0px 8px |
| Border | none |
| Radius | 9999px |
| Background | #37352f @ 0.08 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/21px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Cursor | pointer |
| Icon | 24.39 x 9.2, colour #1a1a1a |
| Painted layers | span.flex.h-5.shrink-0 40.4x20.0 bg #37352f @ 0.08 r 9999px |
| Tokens | --fill-tsp-white-dark #37352f14; --text-primary #1a1a1a |
| How | at rest |

Crops: `nav-badge-cue-default.png`, `nav-badge-cue-light.png`.

#### nav-section-header

Nav section header (Projects). A label in --text-tertiary; hover fills the row and reveals its action buttons (new project, more).

Snapshot: `home-dark`. Finder: `() => C(T('Projects', Q('nav')), '[role=button]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 284 x 36 | = |
| Padding | 2px 2px 2px 10px | = |
| Gap | 12px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | #1f1f1f | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span.font-medium.min-w-0.truncate: -apple-system 13px/18px 500, #8c8c8c, ls -0.091px | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 14 x 14, colour #e6e6e6, stroke #8c8c8c 2px | = |
| Painted layers | div.group.group/nav-section.flex 284.0x36.0 bg #1f1f1f; div.absolute.inset-0.opacity-0 284.0x36.0 bg #ffffff @ 0.08 r 10px opacity 0 | div.group.group/nav-section.flex 284.0x36.0 bg #1f1f1f; div.absolute.inset-0.opacity-0 284.0x36.0 bg #ffffff @ 0.04 r 10px |
| Ancestor paint | 1 up div.flex.flex-col.gap-px bg #1f1f1f | = |
| Tokens | --background-nav #1f1f1f; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --icon-tertiary #8c8c8c; --text-tertiary #8c8c8c; --ui-density-row-height 36px; --ui-density-row-radius 10px; --ui-density-section-padding-start 10px; --ui-density-section-row-gap 12px | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 284 x 36 | = |
| Padding | 2px 2px 2px 10px | = |
| Gap | 12px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | #f0f0f0 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span.font-medium.min-w-0.truncate: -apple-system 13px/18px 500, #737373, ls -0.091px | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 14 x 14, colour #1a1a1a, stroke #737373 2px | = |
| Painted layers | div.group.group/nav-section.flex 284.0x36.0 bg #f0f0f0; div.absolute.inset-0.opacity-0 284.0x36.0 bg #37352f @ 0.08 r 10px opacity 0 | div.group.group/nav-section.flex 284.0x36.0 bg #f0f0f0; div.absolute.inset-0.opacity-0 284.0x36.0 bg #37352f @ 0.04 r 10px |
| Ancestor paint | 1 up div.flex.flex-col.gap-px bg #f0f0f0 | = |
| Tokens | --background-nav #f0f0f0; --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --icon-tertiary #737373; --text-tertiary #737373; --ui-density-row-height 36px; --ui-density-row-radius 10px; --ui-density-section-padding-start 10px; --ui-density-section-row-gap 12px | = |
| How | at rest | mouse hover |

Crops: `nav-section-header-default.png`, `nav-section-header-hover.png`, `nav-section-header-light.png`, `nav-section-header-light-hover.png`.

#### nav-section-header-tasks

Nav section header (Tasks). Same row; three actions on hover (filter, sort, new).

Snapshot: `home-dark`. Finder: `() => C(T('Tasks', Q('nav')), '[role=button]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 284 x 36 | = |
| Padding | 2px 2px 2px 10px | = |
| Gap | 12px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | #1f1f1f | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span.font-medium.min-w-0.truncate: -apple-system 13px/18px 500, #8c8c8c, ls -0.091px | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 14 x 14, colour #e6e6e6, stroke #8c8c8c 2px | = |
| Painted layers | div.group.group/nav-section.flex 284.0x36.0 bg #1f1f1f; div.absolute.inset-0.opacity-0 284.0x36.0 bg #ffffff @ 0.08 r 10px opacity 0 | div.group.group/nav-section.flex 284.0x36.0 bg #1f1f1f; div.absolute.inset-0.opacity-0 284.0x36.0 bg #ffffff @ 0.04 r 10px |
| Ancestor paint | 1 up div.flex.flex-col.gap-px bg #1f1f1f | = |
| Tokens | --background-nav #1f1f1f; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a; --icon-tertiary #8c8c8c; --text-tertiary #8c8c8c; --ui-density-row-height 36px; --ui-density-row-radius 10px; --ui-density-section-padding-start 10px; --ui-density-section-row-gap 12px; --ui-font-size-label 13px | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 284 x 36 | = |
| Padding | 2px 2px 2px 10px | = |
| Gap | 12px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | #f0f0f0 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span.font-medium.min-w-0.truncate: -apple-system 13px/18px 500, #737373, ls -0.091px | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 14 x 14, colour #1a1a1a, stroke #737373 2px | = |
| Painted layers | div.group.group/nav-section.flex 284.0x36.0 bg #f0f0f0; div.absolute.inset-0.opacity-0 284.0x36.0 bg #37352f @ 0.08 r 10px opacity 0 | div.group.group/nav-section.flex 284.0x36.0 bg #f0f0f0; div.absolute.inset-0.opacity-0 284.0x36.0 bg #37352f @ 0.04 r 10px |
| Ancestor paint | 1 up div.flex.flex-col.gap-px bg #f0f0f0 | = |
| Tokens | --background-nav #f0f0f0; --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a; --icon-tertiary #737373; --text-tertiary #737373; --ui-density-row-height 36px; --ui-density-row-radius 10px; --ui-density-section-padding-start 10px; --ui-density-section-row-gap 12px; --ui-font-size-label 13px | = |
| How | at rest | mouse hover |

Crops: `nav-section-header-tasks-default.png`, `nav-section-header-tasks-hover.png`, `nav-section-header-tasks-light.png`, `nav-section-header-tasks-light-hover.png`.

#### nav-section-action

Nav section action button. A 28x28 icon button shown once the section header is hovered (hovering it also hovers the header).

Snapshot: `home-dark`. Finder: `() => C(T('Tasks', Q('nav')), '[role=button]').querySelector('.h-7.w-7')`.

Dark theme.

| Property | hover |
|---|---|
| Size (w x h) | 28 x 28 |
| Padding | 0px |
| Border | none |
| Radius | 6px |
| Background | #ffffff @ 0.04 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| Icon | 18 x 18, colour #8c8c8c, stroke #8c8c8c 2px |
| Painted layers | div.flex.h-7.w-7 28.0x28.0 bg #ffffff @ 0.04 r 6px |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-tertiary #8c8c8c |
| How | mouse hover |

Light theme.

| Property | light-hover |
|---|---|
| Size (w x h) | 28 x 28 |
| Padding | 0px |
| Border | none |
| Radius | 6px |
| Background | #37352f @ 0.04 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Cursor | pointer |
| Icon | 18 x 18, colour #737373, stroke #737373 2px |
| Painted layers | div.flex.h-7.w-7 28.0x28.0 bg #37352f @ 0.04 r 6px |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-tertiary #737373 |
| How | mouse hover |

Crops: `nav-section-action-hover.png`, `nav-section-action-light-hover.png`.

#### nav-project-row

Project row. The folder icon swaps for a chevron on hover, and a more button appears at the end.

Snapshot: `home-dark`. Finder: `() => Q('.nav-bar-project-item-header')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 284 x 36 | = | = |
| Padding | 0px 2px 0px 8px | = | = |
| Gap | 12px | = | = |
| Border | none | = | = |
| Radius | 0px | 10px | = |
| Background | #1f1f1f | = | = |
| Box shadow | none | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.04 0px 0px 0px 100px inset | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span.text-sm.truncate: -apple-system 14px/20px 400, #e6e6e6 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 18 x 18, colour #e6e6e6, stroke #e6e6e6 2px | = | = |
| Painted layers | div.nav-bar-project-item-header.w-full.flex 284.0x36.0 bg #1f1f1f | div.nav-bar-project-item-header.w-full.flex 284.0x36.0 bg #1f1f1f r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.04 0px 0px 0px 100px inset | = |
| Tokens | --background-nav #1f1f1f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-nav-item-padding-start 8px; --ui-density-row-height 36px; --ui-density-row-radius 10px; --ui-density-section-row-gap 12px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 284 x 36 | = | = |
| Padding | 0px 2px 0px 8px | = | = |
| Gap | 12px | = | = |
| Border | none | = | = |
| Radius | 0px | 10px | = |
| Background | #f0f0f0 | = | = |
| Box shadow | none | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #37352f @ 0.04 0px 0px 0px 100px inset | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span.text-sm.truncate: -apple-system 14px/20px 400, #1a1a1a | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 18 x 18, colour #1a1a1a, stroke #1a1a1a 2px | = | = |
| Painted layers | div.nav-bar-project-item-header.w-full.flex 284.0x36.0 bg #f0f0f0 | div.nav-bar-project-item-header.w-full.flex 284.0x36.0 bg #f0f0f0 r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #37352f @ 0.04 0px 0px 0px 100px inset | = |
| Tokens | --background-nav #f0f0f0; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-nav-item-padding-start 8px; --ui-density-row-height 36px; --ui-density-row-radius 10px; --ui-density-section-row-gap 12px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `nav-project-row-default.png`, `nav-project-row-hover.png`, `nav-project-row-focus-visible.png`, `nav-project-row-light.png`, `nav-project-row-light-hover.png`, `nav-project-row-light-focus-visible.png`.

#### nav-task-row

Task row. Inside `[data-context-menu=session]`; the title is masked at the end by a scroll-shadow gradient, not an ellipsis.

Snapshot: `home-dark`, `task-dark-completed`. Finder: `() => K('group/nav-tab', 0, Q('[data-context-menu=session]'))`.

Dark theme.

| Property | default | hover | active |
|---|---|---|---|
| Size (w x h) | 284 x 36 | = | = |
| Padding | 0px 2px 0px 8px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | transparent | #ffffff @ 0.04 | #ffffff @ 0.06 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span.inline-block: -apple-system 14px/21px 400, #e6e6e6 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | div.min-h-0.min-w-0.overflow-hidden::before 238pxx21px image linear-gradient(to left, #1f1f1f 0%, #000000 @ 0 100%) | div.group/nav-tab.flex.items-center 284.0x36.0 bg #ffffff @ 0.04 r 10px; div.min-h-0.min-w-0.overflow-hidden::before 206pxx21px image linear-gradient(to left, #282828 0%, #000000 @ 0 100%) | div.group/nav-tab.flex.items-center 284.0x36.0 bg #ffffff @ 0.06 r 10px; div.min-h-0.min-w-0.overflow-hidden::before 238pxx21px image linear-gradient(to right, #2c2c2c 0%, #000000 @ 0 100%) |
| Tokens | --background-nav #1f1f1f; --fill-tsp-white-light #ffffff0a; --scroll-shadow-background none; --scroll-shadow-block-end-offset -669px; --scroll-shadow-block-start-offset 0px; --scroll-shadow-height 669px; --scroll-shadow-inline-end-offset calc(-100% - 0px); --scroll-shadow-inline-start-offset 0px; --scroll-shadow-width calc(100% + 0px); --scroll-shadow-z-index 1 | = | --background-nav #1f1f1f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --scroll-shadow-background none; --scroll-shadow-block-end-offset -669px; --scroll-shadow-block-start-offset 0px; --scroll-shadow-height 669px; --scroll-shadow-inline-end-offset calc(-100% - 0px); --scroll-shadow-inline-start-offset 0px; --scroll-shadow-width calc(100% + 0px) |
| How | at rest | mouse hover | at rest, captured active |
| Icon | - | 18 x 18, colour #e6e6e6, stroke #8c8c8c 2px | = |

Light theme.

| Property | light | light-hover | light-active |
|---|---|---|---|
| Size (w x h) | 284 x 36 | = | = |
| Padding | 0px 2px 0px 8px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | transparent | #37352f @ 0.04 | #37352f @ 0.06 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span.inline-block: -apple-system 14px/21px 400, #1a1a1a | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | div.min-h-0.min-w-0.overflow-hidden::before 238pxx21px image linear-gradient(to left, #f0f0f0 0%, #000000 @ 0 100%) | div.group/nav-tab.flex.items-center 284.0x36.0 bg #37352f @ 0.04 r 10px; div.min-h-0.min-w-0.overflow-hidden::before 206pxx21px image linear-gradient(to left, #e9e9e8 0%, #000000 @ 0 100%) | div.group/nav-tab.flex.items-center 284.0x36.0 bg #37352f @ 0.06 r 10px; div.min-h-0.min-w-0.overflow-hidden::before 238pxx21px image linear-gradient(to right, #e5e5e5 0%, #000000 @ 0 100%) |
| Tokens | --background-nav #f0f0f0; --fill-tsp-white-light #37352f0a; --scroll-shadow-background none; --scroll-shadow-block-end-offset -669px; --scroll-shadow-block-start-offset 0px; --scroll-shadow-height 669px; --scroll-shadow-inline-end-offset calc(-100% - 0px); --scroll-shadow-inline-start-offset 0px; --scroll-shadow-width calc(100% + 0px); --scroll-shadow-z-index 1 | = | --background-nav #f0f0f0; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --scroll-shadow-background none; --scroll-shadow-block-end-offset -669px; --scroll-shadow-block-start-offset 0px; --scroll-shadow-height 669px; --scroll-shadow-inline-end-offset calc(-100% - 0px); --scroll-shadow-inline-start-offset 0px; --scroll-shadow-width calc(100% + 0px) |
| How | at rest | mouse hover | at rest, captured active |
| Icon | - | 18 x 18, colour #1a1a1a, stroke #737373 2px | = |

Other finders: active: `() => painted(document.querySelectorAll('nav [data-context-menu=session] .group\\/nav-tab'))`; light-active: `() => painted(document.querySelectorAll('nav [data-context-menu=session] .group\\/nav-tab'))`.

Crops: `nav-task-row-default.png`, `nav-task-row-hover.png`, `nav-task-row-active.png`, `nav-task-row-light.png`, `nav-task-row-light-hover.png`, `nav-task-row-light-active.png`.

#### nav-task-icon

Task row icon. An 18px glyph tinted grey with a CSS filter on an <img>.

Snapshot: `home-dark`. Finder: `() => Q('[data-context-menu=session] .nav-bar-density-icon-glyph')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 18 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Cursor | pointer |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 18 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Cursor | pointer |
| How | at rest |

Crops: `nav-task-icon-default.png`, `nav-task-icon-light.png`.

#### nav-task-running

Task row status spinner (running task). A dotted amber ring in place of the task icon.

Snapshot: `home-dark`. Finder: `() => CK(TS('Best AI Coding Plans Under', Q('nav')), 'group/nav-tab').querySelector('.nav-bar-density-icon-glyph')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 18 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Cursor | pointer |
| Icon | 18 x 18, colour #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 18 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Cursor | pointer |
| Icon | 18 x 18, colour #1a1a1a |
| How | at rest |

Crops: `nav-task-running-default.png`, `nav-task-running-light.png`.

#### nav-skeleton

Task list loading skeleton. Pulsing rows at the end of the task list while more load; the list is scrolled to its end to show them.

Snapshot: `home-dark`. Finder: `() => K('animate-pulse', 0, Q('nav'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 268 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 6px |
| Background | #ffffff @ 0.04 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Painted layers | div.animate-pulse.w-full 268.0x20.0 bg #ffffff @ 0.04 r 6px |
| Tokens | --fill-tsp-white-light #ffffff0a |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 268 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 6px |
| Background | #37352f @ 0.04 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Painted layers | div.animate-pulse.w-full 268.0x20.0 bg #37352f @ 0.04 r 6px |
| Tokens | --fill-tsp-white-light #37352f0a |
| How | at rest |

Crops: `nav-skeleton-default.png`, `nav-skeleton-light.png`.

#### share-banner

Share banner ("Share Manus with a friend"). Radius 12, a 0.5px --border-dark hairline, --background-mask-white fill; serif title over a 12px grey line, a chevron at the end.

Snapshot: `home-dark`. Finder: `() => Q('.onboarding-primary-action').parentElement`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 284 x 54 | = | = |
| Padding | 0px | = | = |
| Border | 1px solid #ffffff @ 0.12 | = | = |
| Radius | 12px | = | = |
| Background | #3f3f3f @ 0.32 | = | = |
| Box shadow | none | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.04 0px 0px 0px 100px inset | = |
| Outline | none | = | = |
| Font | -apple-system 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span.font-serif.truncate.w-full: LibreBaskerville 14px/20px 400, #e6e6e6 | = | = |
| Transition | box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Icon | 18 x 18, colour #e6e6e6, stroke #e6e6e6 2px | = | = |
| Painted layers | div.relative.flex.w-full 284.0x54.0 bg #3f3f3f @ 0.32 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px | div.relative.flex.w-full 284.0x54.0 bg #3f3f3f @ 0.32 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.04 0px 0px 0px 100px inset | = |
| Tokens | --background-mask-white #3f3f3f52; --border-dark #ffffff1f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-density-menu-item-padding-y 8px; --ui-density-section-row-gap 12px; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 284 x 54 | = | = |
| Padding | 0px | = | = |
| Border | 1px solid #000000 @ 0.14 | = | = |
| Radius | 12px | = | = |
| Background | #ffffff @ 0.65 | = | = |
| Box shadow | none | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #37352f @ 0.04 0px 0px 0px 100px inset | = |
| Outline | none | = | = |
| Font | -apple-system 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span.font-serif.truncate.w-full: LibreBaskerville 14px/20px 400, #1a1a1a | = | = |
| Transition | box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Icon | 18 x 18, colour #1a1a1a, stroke #1a1a1a 2px | = | = |
| Painted layers | div.relative.flex.w-full 284.0x54.0 bg #ffffff @ 0.65 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px | div.relative.flex.w-full 284.0x54.0 bg #ffffff @ 0.65 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #37352f @ 0.04 0px 0px 0px 100px inset | = |
| Tokens | --background-mask-white #ffffffa6; --border-dark #00000024; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373; --ui-density-menu-item-padding-y 8px; --ui-density-section-row-gap 12px; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Crops: `share-banner-default.png`, `share-banner-hover.png`, `share-banner-focus-visible.png`, `share-banner-light.png`, `share-banner-light-hover.png`, `share-banner-light-focus-visible.png`.

#### sidebar-footer

Sidebar footer account row. Avatar, name, then the desktop and bell icon buttons.

Snapshot: `home-dark`. Finder: `() => W(T('Learner', Q('nav')), 284)`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 284 x 32 |
| Padding | 0px 2px 0px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/20px 600, #e6e6e6 |
| Transition | none |
| Icon | 18 x 18, colour #e6e6e6 |
| Painted layers | div.w-full.h-full.object-cover 28.0x28.0 bg #ffffff @ 0.08 |
| Ancestor paint | 1 up div.relative.flex.shrink-0 bg #1f1f1f |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-primary #e6e6e6; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 284 x 32 |
| Padding | 0px 2px 0px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/20px 600, #1a1a1a |
| Transition | none |
| Icon | 18 x 18, colour #1a1a1a |
| Painted layers | div.w-full.h-full.object-cover 28.0x28.0 bg #37352f @ 0.08 |
| Ancestor paint | 1 up div.relative.flex.shrink-0 bg #f0f0f0 |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-primary #1a1a1a; --text-primary #1a1a1a |
| How | at rest |

Crops: `sidebar-footer-default.png`, `sidebar-footer-light.png`.

#### sidebar-account

Account button (avatar and name).

Snapshot: `home-dark`. Finder: `() => C(T('Learner', Q('nav')), '.clickable') // T('Learner', Q('nav')).parentElement`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 90.52 x 32 | = |
| Padding | 2px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 500 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/20px 600, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Painted layers | div.w-full.h-full.object-cover 28.0x28.0 bg #ffffff @ 0.08 | = |
| Tokens | --text-primary #e6e6e6 | = |
| How | at rest | mouse hover |
| Opacity | - | 0.7 |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 90.52 x 32 | = |
| Padding | 2px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 500 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/20px 600, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Painted layers | div.w-full.h-full.object-cover 28.0x28.0 bg #37352f @ 0.08 | = |
| Tokens | --text-primary #1a1a1a | = |
| How | at rest | mouse hover |
| Opacity | - | 0.7 |

Crops: `sidebar-account-default.png`, `sidebar-account-hover.png`, `sidebar-account-light.png`, `sidebar-account-light-hover.png`.

#### sidebar-avatar

Avatar (letter).

Snapshot: `home-dark`. Finder: `() => K('rounded-full overflow-hidden font-bold', 0, Q('nav'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 28 x 28 |
| Padding | 0px |
| Border | none |
| Radius | 9999px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 700 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/20px 600, #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.w-full.h-full.object-cover 28.0x28.0 bg #ffffff @ 0.08 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 28 x 28 |
| Padding | 0px |
| Border | none |
| Radius | 9999px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 700 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/20px 600, #1a1a1a |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.w-full.h-full.object-cover 28.0x28.0 bg #37352f @ 0.08 |
| How | at rest |

Crops: `sidebar-avatar-default.png`, `sidebar-avatar-light.png`.

#### sidebar-desktop-button

Desktop app icon button.

Snapshot: `home-dark`. Finder: `() => K('size-[28px] rounded-[8px]', 0, Q('nav'))`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 28 x 28 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #e6e6e6 | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-primary #e6e6e6 | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 28.0x28.0 bg #ffffff @ 0.04 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 28 x 28 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #1a1a1a | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-primary #1a1a1a | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 28.0x28.0 bg #37352f @ 0.04 r 8px |

Crops: `sidebar-desktop-button-default.png`, `sidebar-desktop-button-hover.png`, `sidebar-desktop-button-light.png`, `sidebar-desktop-button-light-hover.png`.

#### sidebar-bell-button

Notifications bell button.

Snapshot: `home-dark`, `home-dark-notifications`. Finder: `() => Q('#js-update-notification-button')`.

Dark theme.

| Property | default | hover | open |
|---|---|---|---|
| Size (w x h) | 28 x 28 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.04 | #ffffff @ 0.04 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 18 x 18, colour #e6e6e6 | = | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-primary #e6e6e6 | = | = |
| How | at rest | mouse hover | at rest, captured open |
| Painted layers | - | div.flex.items-center.justify-center 28.0x28.0 bg #ffffff @ 0.04 r 8px | div.flex.items-center.justify-center 28.0x28.0 bg #ffffff @ 0.04 r 8px |

Light theme.

| Property | light | light-hover | light-open |
|---|---|---|---|
| Size (w x h) | 28 x 28 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.04 | #37352f @ 0.04 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 18 x 18, colour #1a1a1a | = | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-primary #1a1a1a | = | = |
| How | at rest | mouse hover | at rest, captured open |
| Painted layers | - | div.flex.items-center.justify-center 28.0x28.0 bg #37352f @ 0.04 r 8px | div.flex.items-center.justify-center 28.0x28.0 bg #37352f @ 0.04 r 8px |

Other finders: open: `() => Q('#js-update-notification-button')`; light-open: `() => Q('#js-update-notification-button')`.

Crops: `sidebar-bell-button-default.png`, `sidebar-bell-button-hover.png`, `sidebar-bell-button-open.png`, `sidebar-bell-button-light.png`, `sidebar-bell-button-light-hover.png`, `sidebar-bell-button-light-open.png`.

#### sidebar-collapsed

Sidebar collapsed to a rail. 52 wide: icon-only nav tabs (36x36), a 28px divider in place of the sections, the footer buttons stacked.

Snapshot: `home-dark-sidebar-collapsed`. Finder: `() => Q('nav')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 52 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #1f1f1f |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/20px 600, #e6e6e6 |
| Transition | transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | e-resize |
| Icon | 28 x 28, colour #e6e6e6 |
| ::after | 1px x 900px, absolute, bg #ffffff @ 0.06, radius 0px |
| Painted layers | nav.relative.flex.flex-col 52.0x900.0 bg #1f1f1f; nav.relative.flex.flex-col::after 1pxx900px bg #ffffff @ 0.06; div.pointer-events-none.absolute.inset-x-0 52.0x1.0 border T:1px solid #ffffff @ 0.03 opacity 0; div.mx-auto 28.0x1.0 bg #ffffff @ 0.06; div.relative.flex.shrink-0 52.0x112.0 bg #1f1f1f; div.w-full.h-full.object-cover 28.0x28.0 bg #ffffff @ 0.08 |
| Tokens | --background-nav #1f1f1f; --border-light #ffffff08; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --scroll-shadow-background (unset); --scroll-shadow-block-end-offset (unset); --scroll-shadow-block-start-offset (unset); --scroll-shadow-height (unset); --scroll-shadow-inline-end-offset (unset); --scroll-shadow-inline-start-offset (unset) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 52 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #f0f0f0 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/20px 600, #1a1a1a |
| Transition | transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | e-resize |
| Icon | 28 x 28, colour #1a1a1a |
| ::after | 1px x 900px, absolute, bg #000000 @ 0.06, radius 0px |
| Painted layers | nav.relative.flex.flex-col 52.0x900.0 bg #f0f0f0; nav.relative.flex.flex-col::after 1pxx900px bg #000000 @ 0.06; div.pointer-events-none.absolute.inset-x-0 52.0x1.0 border T:1px solid #000000 @ 0.04 opacity 0; div.mx-auto 28.0x1.0 bg #000000 @ 0.06; div.relative.flex.shrink-0 52.0x112.0 bg #f0f0f0; div.w-full.h-full.object-cover 28.0x28.0 bg #37352f @ 0.08 |
| Tokens | --background-nav #f0f0f0; --border-light #0000000a; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --scroll-shadow-background (unset); --scroll-shadow-block-end-offset (unset); --scroll-shadow-block-start-offset (unset); --scroll-shadow-height (unset); --scroll-shadow-inline-end-offset (unset); --scroll-shadow-inline-start-offset (unset) |
| How | at rest |

Crops: `sidebar-collapsed-default.png`, `sidebar-collapsed-light.png`.

#### sidebar-collapsed-tab

Collapsed rail nav tab.

Snapshot: `home-dark-sidebar-collapsed`. Finder: `() => K('group/nav-tab', 0, Q('nav'))`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 10px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #e6e6e6, stroke #e6e6e6 2px | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-outer-padding 8px; --ui-density-row-height 36px; --ui-density-row-radius 10px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.group/nav-tab.flex.items-center 36.0x36.0 bg #ffffff @ 0.04 r 10px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 10px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #1a1a1a, stroke #1a1a1a 2px | = |
| Tokens | --fill-tsp-white-light #37352f0a; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-outer-padding 8px; --ui-density-row-height 36px; --ui-density-row-radius 10px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.group/nav-tab.flex.items-center 36.0x36.0 bg #37352f @ 0.04 r 10px |

Crops: `sidebar-collapsed-tab-default.png`, `sidebar-collapsed-tab-hover.png`, `sidebar-collapsed-tab-light.png`, `sidebar-collapsed-tab-light-hover.png`.

### Top bar

#### model-picker

Model picker trigger. Title-size 18/22 500 text and a 16px chevron that turns 180° when the menu is open.

Snapshot: `home-dark`, `home-dark-model-menu`. Finder: `() => C(T('Manus 2.0 Lite', M()), '.clickable')`.

Dark theme.

| Property | default | hover | open |
|---|---|---|---|
| Size (w x h) | 154.09 x 32 | = | = |
| Padding | 7px 6px 7px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.06 | #ffffff @ 0.06 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span.truncate: -apple-system 18px/22px 500, #e6e6e6 | = | = |
| Transition | background-color 0.15s cubic-bezier(0, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #8c8c8c | = | = |
| Tokens | --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6 | = | = |
| How | at rest | mouse hover | at rest, captured open |
| Painted layers | - | div.flex.h-8.justify-center 154.1x32.0 bg #ffffff @ 0.06 r 8px | div.flex.h-8.justify-center 154.1x32.0 bg #ffffff @ 0.06 r 8px |

Light theme.

| Property | light | light-hover | light-open |
|---|---|---|---|
| Size (w x h) | 154.09 x 32 | = | = |
| Padding | 7px 6px 7px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.06 | #37352f @ 0.06 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span.truncate: -apple-system 18px/22px 500, #1a1a1a | = | = |
| Transition | background-color 0.15s cubic-bezier(0, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #737373 | = | = |
| Tokens | --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a | = | = |
| How | at rest | mouse hover | at rest, captured open |
| Painted layers | - | div.flex.h-8.justify-center 154.1x32.0 bg #37352f @ 0.06 r 8px | div.flex.h-8.justify-center 154.1x32.0 bg #37352f @ 0.06 r 8px |

Other finders: open: `() => C(T('Manus 2.0 Lite', M()), '.clickable')`; light-open: `() => C(T('Manus 2.0 Lite', M()), '.clickable')`.

Crops: `model-picker-default.png`, `model-picker-hover.png`, `model-picker-open.png`, `model-picker-light.png`, `model-picker-light-hover.png`, `model-picker-light-open.png`.

#### plan-chip

Plan chip (Free plan | Upgrade).

Snapshot: `home-dark`. Finder: `() => CK(T('Free plan'), 'rounded-[8px]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 166.7 x 32 |
| Padding | 4px 12px |
| Gap | 6px |
| Border | 1px solid #ffffff @ 0.06 |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.min-w-0.truncate: -apple-system 14px/21px 400, #8c8c8c |
| Transition | none |
| Painted layers | div.desktop-no-drag.relative.inline-flex 166.7x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px; div.h-4.w-px.shrink-0 1.0x16.0 bg #ffffff @ 0.12 |
| Tokens | --border-dark #ffffff1f; --border-main #ffffff0f; --text-blue #1a93fe; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 166.7 x 32 |
| Padding | 4px 12px |
| Gap | 6px |
| Border | 1px solid #000000 @ 0.06 |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.min-w-0.truncate: -apple-system 14px/21px 400, #737373 |
| Transition | none |
| Painted layers | div.desktop-no-drag.relative.inline-flex 166.7x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px; div.h-4.w-px.shrink-0 1.0x16.0 bg #000000 @ 0.14 |
| Tokens | --border-dark #00000024; --border-main #0000000f; --text-blue #0081f2; --text-tertiary #737373 |
| How | at rest |

Crops: `plan-chip-default.png`, `plan-chip-light.png`.

#### upgrade-link

Upgrade link in the plan chip. Blue text, hover drops opacity to 0.8.

Snapshot: `home-dark`. Finder: `() => C(T('Upgrade', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 56 x 21 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a93fe | = | = |
| Text node | span: -apple-system 14px/21px 400, #1a93fe | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Tokens | --text-blue #1a93fe | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.8 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 56 x 21 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0081f2 | = | = |
| Text node | span: -apple-system 14px/21px 400, #0081f2 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Tokens | --text-blue #0081f2 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.8 | = |

Crops: `upgrade-link-default.png`, `upgrade-link-hover.png`, `upgrade-link-focus-visible.png`, `upgrade-link-light.png`, `upgrade-link-light-hover.png`, `upgrade-link-light-focus-visible.png`.

#### credits-pill

Credits pill.

Snapshot: `home-dark`. Finder: `() => C(T('341', M()), '.clickable')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 65.88 x 32 | = |
| Padding | 0px 12px 0px 8px | = |
| Gap | 4px | = |
| Border | 1px solid #ffffff @ 0.06 | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 500 | = |
| Letter spacing | -0.15px | = |
| Colour | #e6e6e6 | = |
| Text node | span.text-end.font-medium.whitespace-nowrap: -apple-system 14px/20px 500, #e6e6e6, ls -0.15px | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #e6e6e6 | = |
| Painted layers | div.clickable.flex.h-8 65.9x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px | div.clickable.flex.h-8 65.9x32.0 bg #ffffff @ 0.06 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px |
| Tokens | --border-main #ffffff0f; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 65.88 x 32 | = |
| Padding | 0px 12px 0px 8px | = |
| Gap | 4px | = |
| Border | 1px solid #000000 @ 0.06 | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 500 | = |
| Letter spacing | -0.15px | = |
| Colour | #1a1a1a | = |
| Text node | span.text-end.font-medium.whitespace-nowrap: -apple-system 14px/20px 500, #1a1a1a, ls -0.15px | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #1a1a1a | = |
| Painted layers | div.clickable.flex.h-8 65.9x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px | div.clickable.flex.h-8 65.9x32.0 bg #37352f @ 0.06 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px |
| Tokens | --border-main #0000000f; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a | = |
| How | at rest | mouse hover |

Crops: `credits-pill-default.png`, `credits-pill-hover.png`, `credits-pill-light.png`, `credits-pill-light-hover.png`.

#### upgrade-button-task

Upgrade button (task page). On a task the plan chip collapses to one tinted Upgrade button.

Snapshot: `task-dark-completed`. Finder: `() => C(T('Upgrade', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 90.88 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | #0081f2 @ 0.08 | #0081f2 @ 0.12 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 13px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span: -apple-system 13px/18px 500, #0081f2, ls -0.091px | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #e6e6e6 | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 90.9x32.0 bg #0081f2 @ 0.08 r 10px | button.inline-flex.items-center.justify-center 90.9x32.0 bg #0081f2 @ 0.12 r 10px | = |
| Tokens | --text-primary #e6e6e6 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 90.88 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | #0081f2 @ 0.08 | #0081f2 @ 0.12 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 13px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span: -apple-system 13px/18px 500, #0081f2, ls -0.091px | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #1a1a1a | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 90.9x32.0 bg #0081f2 @ 0.08 r 10px | button.inline-flex.items-center.justify-center 90.9x32.0 bg #0081f2 @ 0.12 r 10px | = |
| Tokens | --text-primary #1a1a1a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `upgrade-button-task-default.png`, `upgrade-button-task-hover.png`, `upgrade-button-task-focus-visible.png`, `upgrade-button-task-light.png`, `upgrade-button-task-light-hover.png`, `upgrade-button-task-light-focus-visible.png`.

#### share-button

Share button.

Snapshot: `task-dark-completed`. Finder: `() => C(T('Share', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 74.22 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.06 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span: -apple-system 14px/18px 500, #b3b3b3 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #b3b3b3 | = | = |
| Tokens | --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --text-secondary #b3b3b3 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.inline-flex.items-center.justify-center 74.2x32.0 bg #ffffff @ 0.06 r 8px | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 74.22 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.06 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span: -apple-system 14px/18px 500, #4d4d4d | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #4d4d4d | = | = |
| Tokens | --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --text-secondary #4d4d4d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.inline-flex.items-center.justify-center 74.2x32.0 bg #37352f @ 0.06 r 8px | = |

Crops: `share-button-default.png`, `share-button-hover.png`, `share-button-focus-visible.png`, `share-button-light.png`, `share-button-light-hover.png`, `share-button-light-focus-visible.png`.

#### topbar-more-button

More (…) button.

Snapshot: `task-dark-completed`. Finder: `() => C(at(1376, 24), '.cursor-pointer')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #b3b3b3, stroke #b3b3b3 2px | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3 | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.04 r 6px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #4d4d4d, stroke #4d4d4d 2px | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.04 r 6px |

Crops: `topbar-more-button-default.png`, `topbar-more-button-hover.png`, `topbar-more-button-light.png`, `topbar-more-button-light-hover.png`.

#### panel-toggle

Side panel toggle.

Snapshot: `task-dark-completed`. Finder: `() => C(at(1412, 24), '.cursor-pointer')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #b3b3b3, stroke #b3b3b3 2px | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3 | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.04 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #4d4d4d, stroke #4d4d4d 2px | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.04 r 8px |

Crops: `panel-toggle-default.png`, `panel-toggle-hover.png`, `panel-toggle-light.png`, `panel-toggle-light-hover.png`.

### Home

#### home-logo

Home logo (mark and wordmark). An h1 holding two SVGs, 376x64, with "Manus Studio" as sr-only text.

Snapshot: `home-dark`. Finder: `() => Q('h1', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 376 x 64 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 376 x 64 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| How | at rest |

Crops: `home-logo-default.png`, `home-logo-light.png`.

#### promo-card

Promo carousel card. Black (--background-game-promo) radius 12, 56 tall; a framed 38x30 preview, a serif 13/18 bold title and a 12/16 subtitle in white.

Snapshot: `home-dark`. Finder: `() => C(T('Turn your idea into a game'), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 252 x 56 | = | = |
| Padding | 1px 14px 1px 10px | = | = |
| Border | 1px solid #000000 @ 0 | = | = |
| Radius | 12px | = | = |
| Background | #000000 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | 2px solid #1a93fe offset 2px |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span.truncate.font-serif.font-bold: LibreBaskerville 13px/18px 700, #ffffff | = | = |
| Transition | transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.group.clickable.desktop-no-drag 252.0x56.0 bg #000000 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 12px; span.absolute.inset-px 250.0x54.0 bg #000000 r 12px; span.absolute.overflow-hidden 38.0x30.0 bg #041b47 border T:1px solid #8f8f8f @ 0.31 / R:1px solid #8f8f8f @ 0.31 / B:1px solid #8f8f8f @ 0.31 / L:1px solid #8f8f8f @ 0.31 r 4px | = | button.group.clickable.desktop-no-drag 252.0x56.0 bg #000000 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 12px outline 2px solid #1a93fe offset 2px; span.absolute.inset-px 250.0x54.0 bg #000000 r 12px; span.absolute.overflow-hidden 38.0x30.0 bg #041b47 border T:1px solid #8f8f8f @ 0.31 / R:1px solid #8f8f8f @ 0.31 / B:1px solid #8f8f8f @ 0.31 / L:1px solid #8f8f8f @ 0.31 r 4px |
| Tokens | --background-game-promo #000; --background-game-promo-preview #041b47; --border-game-promo-preview #8f8f8f4f; --text-blue #1a93fe; --text-white #fff; --text-white-tsp #fff9 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 252 x 56 | = | = |
| Padding | 1px 14px 1px 10px | = | = |
| Border | 1px solid #000000 @ 0 | = | = |
| Radius | 12px | = | = |
| Background | #1a1a19 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | 2px solid #0081f2 offset 2px |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span.truncate.font-serif.font-bold: LibreBaskerville 13px/18px 700, #ffffff | = | = |
| Transition | transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.group.clickable.desktop-no-drag 252.0x56.0 bg #1a1a19 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 12px; span.absolute.inset-px 248.0x52.0 bg #1a1a19 r 11px; span.absolute.overflow-hidden 38.0x30.0 bg #041b47 border T:1px solid #8f8f8f @ 0.31 / R:1px solid #8f8f8f @ 0.31 / B:1px solid #8f8f8f @ 0.31 / L:1px solid #8f8f8f @ 0.31 r 4px | = | button.group.clickable.desktop-no-drag 252.0x56.0 bg #1a1a19 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 12px outline 2px solid #0081f2 offset 2px; span.absolute.inset-px 248.0x52.0 bg #1a1a19 r 11px; span.absolute.overflow-hidden 38.0x30.0 bg #041b47 border T:1px solid #8f8f8f @ 0.31 / R:1px solid #8f8f8f @ 0.31 / B:1px solid #8f8f8f @ 0.31 / L:1px solid #8f8f8f @ 0.31 r 4px |
| Tokens | --background-game-promo #1a1a19; --background-game-promo-preview #041b47; --border-game-promo-preview #8f8f8f4f; --text-blue #0081f2; --text-white #fff; --text-white-tsp #fff9 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `promo-card-default.png`, `promo-card-hover.png`, `promo-card-focus-visible.png`, `promo-card-light.png`, `promo-card-light-hover.png`, `promo-card-light-focus-visible.png`.

#### promo-dot

Promo carousel dot. A 5px track in --fill-tsp-white-dark with an --icon-secondary fill that grows as the slide plays; the dots stack vertically at the card end.

Snapshot: `home-dark`. Finder: `() => Q('button.w-\\[14px\\]', 0)`.

Dark theme.

| Property | default | focus-visible | inactive |
|---|---|---|---|
| Size (w x h) | 14 x 18 | = | 14 x 12 |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 9999px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | 2px solid #b3b3b3 offset 0px | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | default |
| Painted layers | span.relative.block.overflow-hidden 5.0x18.0 bg #ffffff @ 0.08 r 9999px; span.absolute.inset-0.origin-top 5.0x3.6 bg #b3b3b3 r 9999px | button.desktop-no-drag.flex.items-center 14.0x18.0 r 9999px outline 2px solid #b3b3b3 offset 0px; span.relative.block.overflow-hidden 5.0x18.0 bg #ffffff @ 0.08 r 9999px; span.absolute.inset-0.origin-top 5.0x3.6 bg #b3b3b3 r 9999px | span.relative.block.overflow-hidden 5.0x5.0 bg #ffffff @ 0.08 r 9999px; span.absolute.inset-0.origin-top 5.0x1.0 bg #b3b3b3 r 9999px opacity 0 |
| Tokens | --fill-tsp-white-dark #ffffff14; --icon-secondary #b3b3b3 | = | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab | at rest, captured inactive |

Light theme.

| Property | light | light-focus-visible | light-inactive |
|---|---|---|---|
| Size (w x h) | 14 x 18 | = | 14 x 12 |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 9999px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | 2px solid #4d4d4d offset 0px | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | default |
| Painted layers | span.relative.block.overflow-hidden 5.0x18.0 bg #37352f @ 0.08 r 9999px; span.absolute.inset-0.origin-top 5.0x3.6 bg #4d4d4d r 9999px | button.desktop-no-drag.flex.items-center 14.0x18.0 r 9999px outline 2px solid #4d4d4d offset 0px; span.relative.block.overflow-hidden 5.0x18.0 bg #37352f @ 0.08 r 9999px; span.absolute.inset-0.origin-top 5.0x3.6 bg #4d4d4d r 9999px | span.relative.block.overflow-hidden 5.0x5.0 bg #37352f @ 0.08 r 9999px; span.absolute.inset-0.origin-top 5.0x1.0 bg #4d4d4d r 9999px opacity 0 |
| Tokens | --fill-tsp-white-dark #37352f14; --icon-secondary #4d4d4d | = | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab | at rest, captured inactive |

Other finders: inactive: `() => Q('button.w-\\[14px\\]', 1)`; light-inactive: `() => Q('button.w-\\[14px\\]', 1)`.

Crops: `promo-dot-default.png`, `promo-dot-focus-visible.png`, `promo-dot-inactive.png`, `promo-dot-light.png`, `promo-dot-light-focus-visible.png`, `promo-dot-light-inactive.png`.

#### build-card

Build card. 490x130, --fill-tsp-white-light, hover --fill-tsp-white-main; a 16/22 500 title with a chevron, a 14/20 grey line, an illustration bleeding off the end.

Snapshot: `home-dark`. Finder: `() => C(T('Build', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 490 x 130 | = | = |
| Padding | 0px 0px 0px 20px | = | = |
| Border | none | = | = |
| Radius | 12px | = | = |
| Background | #ffffff @ 0.04 | #ffffff @ 0.06 | = |
| Box shadow | none | = | #ffffff 0px 0px 0px 0px, #ffffff @ 0.12 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = | 2px solid #000000 @ 0 offset 2px |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | div.flex.items-center.font-medium: -apple-system 16px/22px 500, #e6e6e6 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 18 x 18, colour #e6e6e6 | = | = |
| Painted layers | button.clickable.desktop-no-drag.group 490.0x130.0 bg #ffffff @ 0.04 r 12px; div.absolute.inset-0 150.0x150.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 4px | button.clickable.desktop-no-drag.group 490.0x130.0 bg #ffffff @ 0.06 r 12px; div.absolute.inset-0 150.0x150.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 4px | button.clickable.desktop-no-drag.group 490.0x130.0 bg #ffffff @ 0.04 r 12px shadow #ffffff 0px 0px 0px 0px, #ffffff @ 0.12 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px outline 2px solid #000000 @ 0 offset 2px; div.absolute.inset-0 150.0x150.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 4px |
| Tokens | --border-dark #ffffff1f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 490 x 130 | = | = |
| Padding | 0px 0px 0px 20px | = | = |
| Border | none | = | = |
| Radius | 12px | = | = |
| Background | #37352f @ 0.04 | #37352f @ 0.06 | = |
| Box shadow | none | = | #ffffff 0px 0px 0px 0px, #000000 @ 0.14 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = | 2px solid #000000 @ 0 offset 2px |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | div.flex.items-center.font-medium: -apple-system 16px/22px 500, #1a1a1a | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 18 x 18, colour #1a1a1a | = | = |
| Painted layers | button.clickable.desktop-no-drag.group 490.0x130.0 bg #37352f @ 0.04 r 12px; div.absolute.inset-0 150.0x150.0 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 4px | button.clickable.desktop-no-drag.group 490.0x130.0 bg #37352f @ 0.06 r 12px; div.absolute.inset-0 150.0x150.0 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 4px | button.clickable.desktop-no-drag.group 490.0x130.0 bg #37352f @ 0.04 r 12px shadow #ffffff 0px 0px 0px 0px, #000000 @ 0.14 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px outline 2px solid #000000 @ 0 offset 2px; div.absolute.inset-0 150.0x150.0 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 4px |
| Tokens | --border-dark #00000024; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --text-tertiary #737373 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `build-card-default.png`, `build-card-hover.png`, `build-card-focus-visible.png`, `build-card-light.png`, `build-card-light-hover.png`, `build-card-light-focus-visible.png`.

#### create-card

Create card.

Snapshot: `home-dark`. Finder: `() => C(T('Create', M()), 'button')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 490 x 130 | = |
| Padding | 0px 0px 0px 20px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | #ffffff @ 0.04 | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.flex.items-center.font-medium: -apple-system 16px/22px 500, #e6e6e6 | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #e6e6e6 | = |
| Painted layers | button.clickable.desktop-no-drag.group 490.0x130.0 bg #ffffff @ 0.04 r 12px; div 156.9x110.3 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 4px; div 163.2x128.5 image linear-gradient(#ffffff @ 0.04 0%, #ffffff @ 0.1 100%), linear-gradient(#000000 @ 0.1 0%,  border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 4px; div.border-dashed 170.7x90.7 border T:1px dashed #ffffff @ 0.12 / R:1px dashed #ffffff @ 0.12 / B:1px dashed #ffffff @ 0.12 / L:1px dashed #ffffff @ 0.12 r 4px; div 177.6x134.9 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 4px | button.clickable.desktop-no-drag.group 490.0x130.0 bg #ffffff @ 0.06 r 12px; div 156.9x110.3 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 4px; div 163.2x128.5 image linear-gradient(#ffffff @ 0.04 0%, #ffffff @ 0.1 100%), linear-gradient(#000000 @ 0.1 0%,  border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 4px; div.border-dashed 170.7x90.7 border T:1px dashed #ffffff @ 0.12 / R:1px dashed #ffffff @ 0.12 / B:1px dashed #ffffff @ 0.12 / L:1px dashed #ffffff @ 0.12 r 4px; div 177.6x134.9 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 4px |
| Tokens | --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --illustration-studio-create-paper linear-gradient(180deg, #ffffff0a 0%, #ffffff1a 100%), linear-gradient(180deg, #0000001a 0%, #00000005 100%); --text-primary #e6e6e6; --text-tertiary #8c8c8c | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 490 x 130 | = |
| Padding | 0px 0px 0px 20px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | #37352f @ 0.04 | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.flex.items-center.font-medium: -apple-system 16px/22px 500, #1a1a1a | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #1a1a1a | = |
| Painted layers | button.clickable.desktop-no-drag.group 490.0x130.0 bg #37352f @ 0.04 r 12px; div 156.9x110.3 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 4px; div 163.2x128.5 image linear-gradient(#ffffff @ 0.04 0%, #ffffff @ 0.1 100%), linear-gradient(#000000 @ 0.1 0%,  border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 4px; div.border-dashed 170.7x90.7 border T:1px dashed #000000 @ 0.14 / R:1px dashed #000000 @ 0.14 / B:1px dashed #000000 @ 0.14 / L:1px dashed #000000 @ 0.14 r 4px; div 177.6x134.9 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 4px | button.clickable.desktop-no-drag.group 490.0x130.0 bg #37352f @ 0.06 r 12px; div 156.9x110.3 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 4px; div 163.2x128.5 image linear-gradient(#ffffff @ 0.04 0%, #ffffff @ 0.1 100%), linear-gradient(#000000 @ 0.1 0%,  border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 4px; div.border-dashed 170.7x90.7 border T:1px dashed #000000 @ 0.14 / R:1px dashed #000000 @ 0.14 / B:1px dashed #000000 @ 0.14 / L:1px dashed #000000 @ 0.14 r 4px; div 177.6x134.9 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 4px |
| Tokens | --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --illustration-studio-create-paper linear-gradient(180deg, #ffffff0a 0%, #ffffff1a 100%), linear-gradient(180deg, #0000001a 0%, #00000005 100%); --text-primary #1a1a1a; --text-tertiary #737373 | = |
| How | at rest | mouse hover |

Crops: `create-card-default.png`, `create-card-hover.png`, `create-card-light.png`, `create-card-light-hover.png`.

#### local-file-card

Start from a local file card.

Snapshot: `home-dark`. Finder: `() => C(T('Start from a local file'), 'button')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 270 x 270 | = |
| Padding | 12px | = |
| Gap | 20px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | #ffffff @ 0.04 | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span.absolute.flex.items-center: -apple-system 12px/16px 400, #b3b3b3 | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Painted layers | button.clickable.desktop-no-drag.group 270.0x270.0 bg #ffffff @ 0.04 r 12px; span.absolute.flex.items-center 75.5x20.0 bg #ffffff @ 0.06 r 9999px; div.absolute.opacity-0 49.0x34.0 bg #404040 r 1px opacity 0; div.absolute.opacity-0 54.0x35.0 bg #404040 r 1px opacity 0 | button.clickable.desktop-no-drag.group 270.0x270.0 bg #ffffff @ 0.06 r 12px; span.absolute.flex.items-center 75.5x20.0 bg #ffffff @ 0.06 r 9999px; div.absolute.opacity-0 49.0x34.0 bg #404040 r 1px opacity 0; div.absolute.opacity-0 54.0x35.0 bg #404040 r 1px opacity 0 |
| Tokens | --border-dark #ffffff1f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --fill-white-primary #404040; --text-primary #e6e6e6; --text-secondary #b3b3b3; --text-tertiary #8c8c8c | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 270 x 270 | = |
| Padding | 12px | = |
| Gap | 20px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | #37352f @ 0.04 | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span.absolute.flex.items-center: -apple-system 12px/16px 400, #4d4d4d | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Painted layers | button.clickable.desktop-no-drag.group 270.0x270.0 bg #37352f @ 0.04 r 12px; span.absolute.flex.items-center 75.5x20.0 bg #37352f @ 0.06 r 9999px; div.absolute.opacity-0 49.0x34.0 bg #ffffff r 1px opacity 0; div.absolute.opacity-0 54.0x35.0 bg #ffffff r 1px opacity 0 | button.clickable.desktop-no-drag.group 270.0x270.0 bg #37352f @ 0.06 r 12px; span.absolute.flex.items-center 75.5x20.0 bg #37352f @ 0.06 r 9999px; div.absolute.opacity-0 49.0x34.0 bg #ffffff r 1px opacity 0; div.absolute.opacity-0 54.0x35.0 bg #ffffff r 1px opacity 0 |
| Tokens | --border-dark #00000024; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --fill-white-primary #fff; --text-primary #1a1a1a; --text-secondary #4d4d4d; --text-tertiary #737373 | = |
| How | at rest | mouse hover |

Crops: `local-file-card-default.png`, `local-file-card-hover.png`, `local-file-card-light.png`, `local-file-card-light-hover.png`.

#### studio-only-badge

Studio only badge.

Snapshot: `home-dark`. Finder: `() => T('Studio only')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 75.45 x 20 |
| Padding | 0px 6px |
| Border | none |
| Radius | 9999px |
| Background | #ffffff @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #b3b3b3 |
| Transition | none |
| Cursor | pointer |
| Painted layers | span.absolute.flex.items-center 75.5x20.0 bg #ffffff @ 0.06 r 9999px |
| Ancestor paint | 1 up button.clickable.desktop-no-drag.group bg #ffffff @ 0.04 |
| Tokens | --fill-tsp-white-main #ffffff0f; --text-secondary #b3b3b3 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 75.45 x 20 |
| Padding | 0px 6px |
| Border | none |
| Radius | 9999px |
| Background | #37352f @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #4d4d4d |
| Transition | none |
| Cursor | pointer |
| Painted layers | span.absolute.flex.items-center 75.5x20.0 bg #37352f @ 0.06 r 9999px |
| Ancestor paint | 1 up button.clickable.desktop-no-drag.group bg #37352f @ 0.04 |
| Tokens | --fill-tsp-white-main #37352f0f; --text-secondary #4d4d4d |
| How | at rest |

Crops: `studio-only-badge-default.png`, `studio-only-badge-light.png`.

### Composer

#### composer

Composer. 768 wide, radius from --ui-density-composer-radius, --background-menu-white fill; a 50 tall editor above a 32px tool row.

Snapshot: `home-dark`, `home-dark-composer-typed`, `task-dark-completed`. Finder: `() => P(Q('[contenteditable=true]'))`.

Dark theme.

| Property | default | focus-visible | typed | task |
|---|---|---|---|---|
| Size (w x h) | 768 x 120 | = | = | = |
| Padding | 12px 0px | = | = | = |
| Gap | 12px | = | = | = |
| Border | 1px solid #ffffff @ 0.06 | 1px solid #ffffff @ 0.12 | = | = |
| Radius | 22px | = | = | = |
| Background | #242424 | = | = | = |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/24px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #e6e6e6 | = | = | = |
| Text node | span.block.truncate: -apple-system 14px/18px 400, #b3b3b3 | = | p: -apple-system 16px/24px 400, #e6e6e6 | span.truncate: -apple-system 12px/16px 400, #8c8c8c |
| Transition | none | = | = | = |
| Icon | 17 x 17, colour #b3b3b3, stroke #b3b3b3 2px | = | = | = |
| Placeholder | "Assign a task or type / for more" #8c8c8c, opacity 1, 16px | = | - | "Message Manus" #8c8c8c, opacity 1, 16px |
| Painted layers | div.flex.flex-col.relative 768.0x120.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 22px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px; button.justify-center.whitespace-nowrap.font-medium 72.0x32.0 r 100px outline 1px solid #ffffff @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 136.5x32.0 r 9999px outline 1px solid #ffffff @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.08 r 9999px | div.flex.flex-col.relative 768.0x120.0 bg #242424 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 22px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px; button.justify-center.whitespace-nowrap.font-medium 72.0x32.0 r 100px outline 1px solid #ffffff @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 136.5x32.0 r 9999px outline 1px solid #ffffff @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.08 r 9999px | div.flex.flex-col.relative 768.0x120.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 22px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px; button.justify-center.whitespace-nowrap.font-medium 72.0x32.0 r 100px outline 1px solid #ffffff @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 136.5x32.0 r 9999px outline 1px solid #ffffff @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.95 r 9999px | div.flex.flex-col.relative 768.0x120.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 22px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px; div.flex.cursor-pointer.items-center 89.1x32.0 r 100px outline 1px solid #ffffff @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 136.5x32.0 r 9999px outline 1px solid #ffffff @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.08 r 9999px |
| Ancestor paint | 1 up div.relative bg #1a1a1a | = | = | = |
| Tokens | --accent-send-button #fffffff2; --background-menu-white #242424; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a; --icon-primary #e6e6e6; --icon-secondary #b3b3b3; --text-onblack #000000e5; --text-primary #e6e6e6 | = | = | --accent-send-button #fffffff2; --background-menu-white #242424; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --icon-primary #e6e6e6; --icon-secondary #b3b3b3; --text-onblack #000000e5 |
| How | at rest | keyboard: focus(), Shift+Tab, Tab (on the field inside) | at rest, captured typed | at rest, captured task |

Light theme.

| Property | light | light-focus-visible | light-typed | light-task |
|---|---|---|---|---|
| Size (w x h) | 768 x 120 | = | = | = |
| Padding | 12px 0px | = | = | = |
| Gap | 12px | = | = | = |
| Border | 1px solid #e5e7eb | 1px solid #000000 @ 0.2 | = | = |
| Radius | 22px | = | = | = |
| Background | #ffffff | = | = | = |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/24px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #1a1a1a | = | = | = |
| Text node | span.block.truncate: -apple-system 14px/18px 400, #4d4d4d | = | p: -apple-system 16px/24px 400, #1a1a1a | span.truncate: -apple-system 12px/16px 400, #737373 |
| Transition | none | = | = | = |
| Icon | 17 x 17, colour #4d4d4d, stroke #4d4d4d 2px | = | = | = |
| Placeholder | "Assign a task or type / for more" #737373, opacity 1, 16px | = | - | "Message Manus" #737373, opacity 1, 16px |
| Painted layers | div.flex.flex-col.relative 768.0x120.0 bg #ffffff border T:1px solid #e5e7eb / R:1px solid #e5e7eb / B:1px solid #e5e7eb / L:1px solid #e5e7eb r 22px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px; button.justify-center.whitespace-nowrap.font-medium 72.0x32.0 r 100px outline 1px solid #000000 @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 136.5x32.0 r 9999px outline 1px solid #000000 @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.08 r 9999px | div.flex.flex-col.relative 768.0x120.0 bg #ffffff border T:1px solid #000000 @ 0.2 / R:1px solid #000000 @ 0.2 / B:1px solid #000000 @ 0.2 / L:1px solid #000000 @ 0.2 r 22px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px; button.justify-center.whitespace-nowrap.font-medium 72.0x32.0 r 100px outline 1px solid #000000 @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 136.5x32.0 r 9999px outline 1px solid #000000 @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.08 r 9999px | div.flex.flex-col.relative 768.0x120.0 bg #ffffff border T:1px solid #e5e7eb / R:1px solid #e5e7eb / B:1px solid #e5e7eb / L:1px solid #e5e7eb r 22px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px; button.justify-center.whitespace-nowrap.font-medium 72.0x32.0 r 100px outline 1px solid #000000 @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 136.5x32.0 r 9999px outline 1px solid #000000 @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 32.0x32.0 bg #1a1a19 r 9999px | div.flex.flex-col.relative 768.0x120.0 bg #ffffff border T:1px solid #e5e7eb / R:1px solid #e5e7eb / B:1px solid #e5e7eb / L:1px solid #e5e7eb r 22px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px; div.flex.cursor-pointer.items-center 89.1x32.0 r 100px outline 1px solid #000000 @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 136.5x32.0 r 9999px outline 1px solid #000000 @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.08 r 9999px |
| Ancestor paint | 1 up div.relative bg #f8f8f7 | = | = | = |
| Tokens | --accent-send-button #1a1a19; --background-menu-white #fff; --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a; --icon-primary #1a1a1a; --icon-secondary #4d4d4d; --text-onblack #fff; --text-primary #1a1a1a | = | = | --accent-send-button #1a1a19; --background-menu-white #fff; --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --icon-primary #1a1a1a; --icon-secondary #4d4d4d; --text-onblack #fff |
| How | at rest | keyboard: focus(), Shift+Tab, Tab (on the field inside) | at rest, captured typed | at rest, captured task |

Other finders: typed: `() => P(Q('[contenteditable=true]'))`; light-typed: `() => P(Q('[contenteditable=true]'))`; task: `() => P(Q('[contenteditable=true]'))`; light-task: `() => P(Q('[contenteditable=true]'))`.

Crops: `composer-default.png`, `composer-focus-visible.png`, `composer-typed.png`, `composer-task.png`, `composer-light.png`, `composer-light-focus-visible.png`, `composer-light-typed.png`, `composer-light-task.png`.

#### composer-placeholder

Composer placeholder. Tiptap draws it with p.is-editor-empty::before from data-placeholder.

Snapshot: `home-dark`. Finder: `() => Q('[contenteditable=true] p')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 742 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Placeholder | "Assign a task or type / for more" #8c8c8c, opacity 1, 16px |
| ::before | 225.484px x 0px, static, bg #000000 @ 0, radius 0px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 742 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Placeholder | "Assign a task or type / for more" #737373, opacity 1, 16px |
| ::before | 225.484px x 0px, static, bg #000000 @ 0, radius 0px |
| How | at rest |

Crops: `composer-placeholder-default.png`, `composer-placeholder-light.png`.

#### composer-text

Composer typed text.

Snapshot: `home-dark-composer-typed`. Finder: `() => Q('[contenteditable=true] p')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 742 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 742 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| How | at rest |

Crops: `composer-text-default.png`, `composer-text-light.png`.

#### composer-plus

Composer + button. A 32px circle with a 1px --border-main ring.

Snapshot: `home-dark`, `home-dark-attach-menu`. Finder: `() => P(Q('[contenteditable=true]')).querySelectorAll('button')[0]`.

Dark theme.

| Property | default | hover | focus-visible | open |
|---|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = | = |
| Padding | 0px | = | = | = |
| Gap | 4px | = | = | - |
| Border | 1px solid #ffffff @ 0.06 | = | = | none |
| Radius | 9999px | = | = | = |
| Background | transparent | #ffffff @ 0.04 | = | #ffffff @ 0.04 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 12px/16px 400 | = | = | -apple-system 16px/24px 400 |
| Letter spacing | normal | = | = | = |
| Colour | #b3b3b3 | = | = | #e6e6e6 |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | - |
| Icon | 17 x 17, colour #b3b3b3, stroke #b3b3b3 2px | = | = | = |
| Painted layers | button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px | button.rounded-full.border.inline-flex 32.0x32.0 bg #ffffff @ 0.04 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px | = | div.rounded-full 32.0x32.0 bg #ffffff @ 0.04 r 9999px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px |
| Tokens | --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --text-secondary #b3b3b3; --ui-density-small-row-height 32px | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |

Light theme.

| Property | light | light-hover | light-focus-visible | light-open |
|---|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = | = |
| Padding | 0px | = | = | = |
| Gap | 4px | = | = | - |
| Border | 1px solid #000000 @ 0.06 | = | = | none |
| Radius | 9999px | = | = | = |
| Background | transparent | #37352f @ 0.04 | = | #37352f @ 0.04 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 12px/16px 400 | = | = | -apple-system 16px/24px 400 |
| Letter spacing | normal | = | = | = |
| Colour | #4d4d4d | = | = | #1a1a1a |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | - |
| Icon | 17 x 17, colour #4d4d4d, stroke #4d4d4d 2px | = | = | = |
| Painted layers | button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px | button.rounded-full.border.inline-flex 32.0x32.0 bg #37352f @ 0.04 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px | = | div.rounded-full 32.0x32.0 bg #37352f @ 0.04 r 9999px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px |
| Tokens | --border-main #0000000f; --fill-tsp-white-light #37352f0a; --text-secondary #4d4d4d; --ui-density-small-row-height 32px | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |

Other finders: open: `() => P(Q('[contenteditable=true]')).querySelectorAll('button')[0].parentElement`; light-open: `() => P(Q('[contenteditable=true]')).querySelectorAll('button')[0].parentElement`.

Crops: `composer-plus-default.png`, `composer-plus-hover.png`, `composer-plus-focus-visible.png`, `composer-plus-open.png`, `composer-plus-light.png`, `composer-plus-light-hover.png`, `composer-plus-light-focus-visible.png`, `composer-plus-light-open.png`.

#### composer-connectors

Connector chips button. Overlapping 16px app icons in a pill.

Snapshot: `home-dark`. Finder: `() => P(Q('[contenteditable=true]')).querySelectorAll('button')[1]`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 72 x 32 | = | = |
| Padding | 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 100px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #ffffff @ 0.06 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.justify-center.whitespace-nowrap.font-medium 72.0x32.0 r 100px outline 1px solid #ffffff @ 0.06 offset -1px | button.justify-center.whitespace-nowrap.font-medium 72.0x32.0 bg #ffffff @ 0.04 r 100px outline 1px solid #ffffff @ 0.06 offset -1px opacity 0.9 | = |
| Tokens | --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --ui-density-outer-padding 8px; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 72 x 32 | = | = |
| Padding | 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 100px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #000000 @ 0.06 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.justify-center.whitespace-nowrap.font-medium 72.0x32.0 r 100px outline 1px solid #000000 @ 0.06 offset -1px | button.justify-center.whitespace-nowrap.font-medium 72.0x32.0 bg #37352f @ 0.04 r 100px outline 1px solid #000000 @ 0.06 offset -1px opacity 0.9 | = |
| Tokens | --border-main #0000000f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --ui-density-outer-padding 8px; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Crops: `composer-connectors-default.png`, `composer-connectors-hover.png`, `composer-connectors-focus-visible.png`, `composer-connectors-light.png`, `composer-connectors-light-hover.png`, `composer-connectors-light-focus-visible.png`.

#### composer-desktop-chip

Manus Desktop chip.

Snapshot: `home-dark`. Finder: `() => C(T('Manus Desktop'), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 136.52 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 9999px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #ffffff @ 0.06 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #b3b3b3 | = | = |
| Text node | span.block.truncate: -apple-system 14px/18px 400, #b3b3b3 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #b3b3b3, stroke #b3b3b3 2px | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 136.5x32.0 r 9999px outline 1px solid #ffffff @ 0.06 offset -1px | button.inline-flex.items-center.justify-center 136.5x32.0 bg #ffffff @ 0.04 r 9999px outline 1px solid #ffffff @ 0.06 offset -1px opacity 0.9 | = |
| Tokens | --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --icon-primary #e6e6e6; --icon-secondary #b3b3b3; --text-secondary #b3b3b3; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 136.52 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 9999px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #000000 @ 0.06 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #4d4d4d | = | = |
| Text node | span.block.truncate: -apple-system 14px/18px 400, #4d4d4d | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #4d4d4d, stroke #4d4d4d 2px | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 136.5x32.0 r 9999px outline 1px solid #000000 @ 0.06 offset -1px | button.inline-flex.items-center.justify-center 136.5x32.0 bg #37352f @ 0.04 r 9999px outline 1px solid #000000 @ 0.06 offset -1px opacity 0.9 | = |
| Tokens | --border-main #0000000f; --fill-tsp-white-light #37352f0a; --icon-primary #1a1a1a; --icon-secondary #4d4d4d; --text-secondary #4d4d4d; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Crops: `composer-desktop-chip-default.png`, `composer-desktop-chip-hover.png`, `composer-desktop-chip-focus-visible.png`, `composer-desktop-chip-light.png`, `composer-desktop-chip-light-hover.png`, `composer-desktop-chip-light-focus-visible.png`.

#### composer-skill-button

Composer agent-mode icon button.

Snapshot: `home-dark`. Finder: `() => K('rounded-full clickable px-2', 0, P(Q('[contenteditable=true]')))`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px 8px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 9999px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #b3b3b3 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #b3b3b3 | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3 | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-1.5 32.0x32.0 bg #ffffff @ 0.04 r 9999px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px 8px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 9999px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #4d4d4d | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #4d4d4d | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-1.5 32.0x32.0 bg #37352f @ 0.04 r 9999px |

Crops: `composer-skill-button-default.png`, `composer-skill-button-hover.png`, `composer-skill-button-light.png`, `composer-skill-button-light-hover.png`.

#### composer-mic

Composer microphone button.

Snapshot: `home-dark`. Finder: `() => K('flex-shrink-0 rounded-full cursor-pointer', 0, P(Q('[contenteditable=true]')))`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 9999px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #b3b3b3, stroke #b3b3b3 2px | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3; --ui-density-small-row-height 32px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.04 r 9999px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 9999px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #4d4d4d, stroke #4d4d4d 2px | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d; --ui-density-small-row-height 32px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.04 r 9999px |

Crops: `composer-mic-default.png`, `composer-mic-hover.png`, `composer-mic-light.png`, `composer-mic-light-hover.png`.

#### composer-send

Composer send button. Disabled (opacity 0.5) while the composer is empty; `enabled` once text is typed.

Snapshot: `home-dark`, `home-dark-composer-typed`. Finder: `() => { const b = P(Q('[contenteditable=true]')).querySelectorAll('button'); return b[b.length - 1]; }`.

Dark theme.

| Property | default | enabled | enabled-hover | enabled-focus-visible |
|---|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = | = |
| Padding | 0px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | 9999px | = | = | = |
| Background | #ffffff @ 0.08 | #ffffff @ 0.95 | #ffffff @ 0.95 | #ffffff @ 0.95 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 14px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #000000 @ 0.898 | = | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | not-allowed | pointer | pointer | pointer |
| Icon | 15 x 15, colour #000000 @ 0.898 | = | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.08 r 9999px | button.inline-flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.95 r 9999px | button.inline-flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.95 r 9999px opacity 0.9 | button.inline-flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.95 r 9999px |
| Tokens | --accent-send-button #fffffff2; --fill-tsp-white-dark #ffffff14; --text-onblack #000000e5; --ui-density-small-row-height 32px | = | = | = |
| How | at rest | at rest, captured enabled | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | = | 0.9 | = |

Light theme.

| Property | light | light-enabled | light-enabled-hover | light-enabled-focus-visible |
|---|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = | = |
| Padding | 0px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | 9999px | = | = | = |
| Background | #37352f @ 0.08 | #1a1a19 | #1a1a19 | #1a1a19 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 14px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | not-allowed | pointer | pointer | pointer |
| Icon | 15 x 15, colour #ffffff | = | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.08 r 9999px | button.inline-flex.items-center.justify-center 32.0x32.0 bg #1a1a19 r 9999px | button.inline-flex.items-center.justify-center 32.0x32.0 bg #1a1a19 r 9999px opacity 0.9 | button.inline-flex.items-center.justify-center 32.0x32.0 bg #1a1a19 r 9999px |
| Tokens | --accent-send-button #1a1a19; --fill-tsp-white-dark #37352f14; --text-onblack #fff; --ui-density-small-row-height 32px | = | = | = |
| How | at rest | at rest, captured enabled | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | = | 0.9 | = |

Other finders: enabled: `() => { const b = P(Q('[contenteditable=true]')).querySelectorAll('button'); return b[b.length - 1]; }`; enabled-hover: `() => { const b = P(Q('[contenteditable=true]')).querySelectorAll('button'); return b[b.length - 1]; }`; enabled-focus-visible: `() => { const b = P(Q('[contenteditable=true]')).querySelectorAll('button'); return b[b.length - 1]; }`; light-enabled: `() => { const b = P(Q('[contenteditable=true]')).querySelectorAll('button'); return b[b.length - 1]; }`; light-enabled-hover: `() => { const b = P(Q('[contenteditable=true]')).querySelectorAll('button'); return b[b.length - 1]; }`; light-enabled-focus-visible: `() => { const b = P(Q('[contenteditable=true]')).querySelectorAll('button'); return b[b.length - 1]; }`.

Crops: `composer-send-default.png`, `composer-send-enabled.png`, `composer-send-enabled-hover.png`, `composer-send-enabled-focus-visible.png`, `composer-send-light.png`, `composer-send-light-enabled.png`, `composer-send-light-enabled-hover.png`, `composer-send-light-enabled-focus-visible.png`.

#### disclaimer

Footer disclaimer. Present but `invisible` on the home page; shown under the composer on a task.

Snapshot: `task-dark-completed`. Finder: `() => TS('Manus is an AI Agent and can make mistakes')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | none |
| Ancestor paint | 1 up div.relative bg #1a1a1a |
| Tokens | --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | none |
| Ancestor paint | 1 up div.relative bg #f8f8f7 |
| Tokens | --text-tertiary #737373 |
| How | at rest |

Crops: `disclaimer-default.png`, `disclaimer-light.png`.

### Menus and dialogs

#### model-menu

Model menu. 366 wide, 4px padding, --background-menu-white, shadow-menu, a 40px backdrop blur.

Snapshot: `home-dark-model-menu`. Finder: `() => D().firstElementChild`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 366 x 232 |
| Padding | 4px |
| Gap | 4px |
| Border | none |
| Radius | 12px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Backdrop filter | blur(40px) |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.text-sm.flex.items-center: -apple-system 14px/20px 400, #e6e6e6 |
| Transition | none |
| Icon | 18 x 18, colour #e6e6e6 |
| Painted layers | div.shadow-menu.flex.flex-col 366.0x232.0 bg #242424 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px; div.inline-flex.items-center.justify-center 34.5x18.0 bg #ffffff @ 0.06 r 5px; div.inline-flex.items-center.justify-center 34.5x18.0 bg #ffffff @ 0.06 r 5px; span.flex.items-center.border 40.3x18.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px 10px 10px 0px |
| Tokens | --available-width 1124px; --background-menu-white #242424; --border-dark #ffffff1f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --text-secondary #b3b3b3; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 366 x 232 |
| Padding | 4px |
| Gap | 4px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Backdrop filter | blur(40px) |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.text-sm.flex.items-center: -apple-system 14px/20px 400, #1a1a1a |
| Transition | none |
| Icon | 18 x 18, colour #1a1a1a |
| Painted layers | div.shadow-menu.flex.flex-col 366.0x232.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px; div.inline-flex.items-center.justify-center 34.5x18.0 bg #37352f @ 0.06 r 5px; div.inline-flex.items-center.justify-center 34.5x18.0 bg #37352f @ 0.06 r 5px; span.flex.items-center.border 40.3x18.0 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 8px 10px 10px 0px |
| Tokens | --available-width 1124px; --background-menu-white #fff; --border-dark #00000024; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --text-secondary #4d4d4d; --text-tertiary #737373 |
| How | at rest |

Crops: `model-menu-default.png`, `model-menu-light.png`.

#### model-menu-item

Model menu item. Title 14/20 with a serif Pro badge, a 12px description in --text-tertiary. The current model carries a check (`checked`).

Snapshot: `home-dark-model-menu`. Finder: `() => C(TS('Versatile agent', D()), '[role=button]')`.

Dark theme.

| Property | default | hover | checked | checked-hover |
|---|---|---|---|---|
| Size (w x h) | 358 x 52 | = | = | = |
| Padding | 8px 8px 8px 12px | = | = | = |
| Gap | 16px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #ffffff @ 0.04 | = | #ffffff @ 0.04 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/24px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #e6e6e6 | = | = | = |
| Text node | div.text-sm.flex.items-center: -apple-system 14px/20px 400, #e6e6e6 | = | = | = |
| Transition | background-color 0.15s cubic-bezier(0, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | div.inline-flex.items-center.justify-center 34.5x18.0 bg #ffffff @ 0.06 r 5px | div.w-full.flex.gap-4 358.0x52.0 bg #ffffff @ 0.04 r 8px; div.inline-flex.items-center.justify-center 34.5x18.0 bg #ffffff @ 0.06 r 5px | - | div.w-full.flex.gap-4 358.0x52.0 bg #ffffff @ 0.04 r 8px |
| Ancestor paint | 2 up div.shadow-menu.flex.flex-col bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px | = | = | = |
| Tokens | --border-dark #ffffff1f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = | --border-dark #ffffff1f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c | --border-dark #ffffff1f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c |
| How | at rest | mouse hover | at rest, captured checked | mouse hover |
| Icon | - | = | 18 x 18, colour #e6e6e6 | 18 x 18, colour #e6e6e6 |

Light theme.

| Property | light | light-hover | light-checked | light-checked-hover |
|---|---|---|---|---|
| Size (w x h) | 358 x 52 | = | = | = |
| Padding | 8px 8px 8px 12px | = | = | = |
| Gap | 16px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #37352f @ 0.04 | = | #37352f @ 0.04 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/24px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #1a1a1a | = | = | = |
| Text node | div.text-sm.flex.items-center: -apple-system 14px/20px 400, #1a1a1a | = | = | = |
| Transition | background-color 0.15s cubic-bezier(0, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | div.inline-flex.items-center.justify-center 34.5x18.0 bg #37352f @ 0.06 r 5px | div.w-full.flex.gap-4 358.0x52.0 bg #37352f @ 0.04 r 8px; div.inline-flex.items-center.justify-center 34.5x18.0 bg #37352f @ 0.06 r 5px | - | div.w-full.flex.gap-4 358.0x52.0 bg #37352f @ 0.04 r 8px |
| Ancestor paint | 2 up div.shadow-menu.flex.flex-col bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px | = | = | = |
| Tokens | --border-dark #00000024; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --text-tertiary #737373 | = | --border-dark #00000024; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373 | --border-dark #00000024; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373 |
| How | at rest | mouse hover | at rest, captured checked | mouse hover |
| Icon | - | = | 18 x 18, colour #1a1a1a | 18 x 18, colour #1a1a1a |

Other finders: checked: `() => C(T('Manus 2.0 Lite', D()), '[role=button]')`; checked-hover: `() => C(T('Manus 2.0 Lite', D()), '[role=button]')`; light-checked: `() => C(T('Manus 2.0 Lite', D()), '[role=button]')`; light-checked-hover: `() => C(T('Manus 2.0 Lite', D()), '[role=button]')`.

Crops: `model-menu-item-default.png`, `model-menu-item-hover.png`, `model-menu-item-checked.png`, `model-menu-item-checked-hover.png`, `model-menu-item-light.png`, `model-menu-item-light-hover.png`, `model-menu-item-light-checked.png`, `model-menu-item-light-checked-hover.png`.

#### model-menu-pro-badge

Pro badge.

Snapshot: `home-dark-model-menu`. Finder: `() => T('Pro', D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 34.45 x 18 |
| Padding | 1px 6px |
| Border | none |
| Radius | 5px |
| Background | #ffffff @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | LibreBaskerville 12px/16px 700 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.inline-flex.items-center.justify-center 34.5x18.0 bg #ffffff @ 0.06 r 5px |
| Tokens | --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 34.45 x 18 |
| Padding | 1px 6px |
| Border | none |
| Radius | 5px |
| Background | #37352f @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | LibreBaskerville 12px/16px 700 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.inline-flex.items-center.justify-center 34.5x18.0 bg #37352f @ 0.06 r 5px |
| Tokens | --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a |
| How | at rest |

Crops: `model-menu-pro-badge-default.png`, `model-menu-pro-badge-light.png`.

#### model-menu-beta-badge

Beta badge.

Snapshot: `home-dark-model-menu`. Finder: `() => T('Beta', D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 40.34 x 18 |
| Padding | 0px 6px |
| Border | 1px solid #ffffff @ 0.12 |
| Radius | 8px 10px 10px 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 500 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | none |
| Cursor | pointer |
| Painted layers | span.flex.items-center.border 40.3x18.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px 10px 10px 0px |
| Tokens | --border-dark #ffffff1f; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 40.34 x 18 |
| Padding | 0px 6px |
| Border | 1px solid #000000 @ 0.14 |
| Radius | 8px 10px 10px 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 500 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | none |
| Cursor | pointer |
| Painted layers | span.flex.items-center.border 40.3x18.0 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 8px 10px 10px 0px |
| Tokens | --border-dark #00000024; --text-tertiary #737373 |
| How | at rest |

Crops: `model-menu-beta-badge-default.png`, `model-menu-beta-badge-light.png`.

#### attach-menu

Attach (+) menu.

Snapshot: `home-dark-attach-menu`. Finder: `() => D().firstElementChild`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 198.88 x 269 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.flex-1.min-w-0.truncate: -apple-system 14px/20px 400, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6 |
| Painted layers | div.shadow-menu.p-1.w-max 198.9x269.0 bg #242424 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px; div.my-1 166.9x1.0 bg #ffffff @ 0.06 |
| Tokens | --background-menu-white #242424; --border-main #ffffff0f; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 198.88 x 269 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.flex-1.min-w-0.truncate: -apple-system 14px/20px 400, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a |
| Painted layers | div.shadow-menu.p-1.w-max 198.9x269.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px; div.my-1 166.9x1.0 bg #000000 @ 0.06 |
| Tokens | --background-menu-white #fff; --border-main #0000000f; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Crops: `attach-menu-default.png`, `attach-menu-light.png`.

#### menu-item

Menu item (attach menu). The shared menu row: 36 tall, 8px horizontal padding, an icon then 14px text, radius 8, hover --fill-tsp-white-main.

Snapshot: `home-dark-attach-menu`. Finder: `() => CK(T('Add from Google Drive', D()), 'rounded-[8px]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 190.88 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #e6e6e6 | = |
| Ancestor paint | 3 up div.shadow-menu.p-1.w-max bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px | = |
| Tokens | --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-menu-item-padding-y 8px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-2 190.9x36.0 bg #ffffff @ 0.06 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 190.88 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #1a1a1a | = |
| Ancestor paint | 3 up div.shadow-menu.p-1.w-max bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px | = |
| Tokens | --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-menu-item-padding-y 8px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-2 190.9x36.0 bg #37352f @ 0.06 r 8px |

Crops: `menu-item-default.png`, `menu-item-hover.png`, `menu-item-light.png`, `menu-item-light-hover.png`.

#### menu-divider

Menu divider.

Snapshot: `home-dark-attach-menu`. Finder: `() => K('h-[1px]', 0, D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 166.88 x 1 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #ffffff @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Painted layers | div.my-1 166.9x1.0 bg #ffffff @ 0.06 |
| Ancestor paint | 1 up div.shadow-menu.p-1.w-max bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Tokens | --border-main #ffffff0f |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 166.88 x 1 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #000000 @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Painted layers | div.my-1 166.9x1.0 bg #000000 @ 0.06 |
| Ancestor paint | 1 up div.shadow-menu.p-1.w-max bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Tokens | --border-main #0000000f |
| How | at rest |

Crops: `menu-divider-default.png`, `menu-divider-light.png`.

#### search-dialog

Search tasks dialog. 680 wide, centred, over a transparent overlay (no dim).

Snapshot: `home-dark-search`. Finder: `() => D()`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 680 x 440 |
| Padding | 0px |
| Border | none |
| Radius | 20px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Outline | 2px solid #000000 @ 0 offset 2px |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.block.min-w-0.truncate: -apple-system 14px/20px 400, #e6e6e6 |
| Transition | none |
| Icon | 18 x 18, colour #e6e6e6, stroke #b3b3b3 2px |
| Placeholder | "Search tasks..." #8c8c8c, opacity 1, 16px |
| Painted layers | div.@container/dialog.overflow-auto.outline-none 680.0x440.0 bg #242424 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px outline 2px solid #000000 @ 0 offset 2px; h3.flex.items-center.gap-4 680.0x67.0 border B:1px solid #ffffff @ 0.06; li.mx-2.flex.items-center 664.0x36.0 bg #ffffff @ 0.04 r 8px |
| Tokens | --background-menu-white #242424; --border-dark #ffffff1f; --border-main #ffffff0f; --dlg-enter-scale 1; --dlg-enter-y 0px; --fill-tsp-white-light #ffffff0a; --icon-tertiary #8c8c8c; --text-primary #e6e6e6; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 680 x 440 |
| Padding | 0px |
| Border | none |
| Radius | 20px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Outline | 2px solid #000000 @ 0 offset 2px |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.block.min-w-0.truncate: -apple-system 14px/20px 400, #1a1a1a |
| Transition | none |
| Icon | 18 x 18, colour #1a1a1a, stroke #4d4d4d 2px |
| Placeholder | "Search tasks..." #737373, opacity 1, 16px |
| Painted layers | div.@container/dialog.overflow-auto.outline-none 680.0x440.0 bg #ffffff r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px outline 2px solid #000000 @ 0 offset 2px; h3.flex.items-center.gap-4 680.0x67.0 border B:1px solid #000000 @ 0.06; li.mx-2.flex.items-center 664.0x36.0 bg #37352f @ 0.04 r 8px |
| Tokens | --background-menu-white #fff; --border-dark #00000024; --border-main #0000000f; --dlg-enter-scale 1; --dlg-enter-y 0px; --fill-tsp-white-light #37352f0a; --icon-tertiary #737373; --text-primary #1a1a1a; --text-tertiary #737373 |
| How | at rest |

Crops: `search-dialog-default.png`, `search-dialog-light.png`.

#### search-input

Search dialog field row.

Snapshot: `home-dark-search`. Finder: `() => C(Q('input[placeholder="Search tasks..."]'), 'h3')`.

Dark theme.

| Property | default | focus-visible |
|---|---|---|
| Size (w x h) | 680 x 67 | = |
| Padding | 20px 12px 18px 20px | = |
| Gap | 16px | = |
| Border | T: none; R: none; B: 1px solid #ffffff @ 0.06; L: none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Icon | 18 x 18, colour #e6e6e6, stroke #b3b3b3 2px | = |
| Placeholder | "Search tasks..." #8c8c8c, opacity 1, 16px | = |
| Painted layers | h3.flex.items-center.gap-4 680.0x67.0 border B:1px solid #ffffff @ 0.06 | h3.flex.items-center.gap-4 680.0x67.0 border B:1px solid #ffffff @ 0.06; input.overflow-hidden.w-full.ring-inset 570.0x24.0 shadow #ffffff 0px 0px 0px 0px inset, #ffffff @ 0.12 0px 0px 0px 0px inset, #000000 @ 0 0px 0px 0px 0px |
| Ancestor paint | 1 up div.@container/dialog.overflow-auto.outline-none bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px outline 2px solid #000000 @ 0 | = |
| Tokens | --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --icon-tertiary #8c8c8c; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Light theme.

| Property | light | light-focus-visible |
|---|---|---|
| Size (w x h) | 680 x 67 | = |
| Padding | 20px 12px 18px 20px | = |
| Gap | 16px | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0.06; L: none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Icon | 18 x 18, colour #1a1a1a, stroke #4d4d4d 2px | = |
| Placeholder | "Search tasks..." #737373, opacity 1, 16px | = |
| Painted layers | h3.flex.items-center.gap-4 680.0x67.0 border B:1px solid #000000 @ 0.06 | h3.flex.items-center.gap-4 680.0x67.0 border B:1px solid #000000 @ 0.06; input.overflow-hidden.w-full.ring-inset 570.0x24.0 shadow #ffffff 0px 0px 0px 0px inset, #000000 @ 0.14 0px 0px 0px 0px inset, #000000 @ 0 0px 0px 0px 0px |
| Ancestor paint | 1 up div.@container/dialog.overflow-auto.outline-none bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px outline 2px solid #000000 @ 0 | = |
| Tokens | --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --icon-tertiary #737373; --text-primary #1a1a1a; --text-tertiary #737373 | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Crops: `search-input-default.png`, `search-input-focus-visible.png`, `search-input-light.png`, `search-input-light-focus-visible.png`.

#### search-result

Search result row.

Snapshot: `home-dark-search`. Finder: `() => Q('li.clickable', 1, D())`.

Dark theme.

| Property | default | hover | selected |
|---|---|---|---|
| Size (w x h) | 664 x 52 | = | 664 x 36 |
| Padding | 8px 12px | = | = |
| Gap | 16px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.04 | #ffffff @ 0.04 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span.block.min-w-0.truncate: -apple-system 14px/20px 400, #e6e6e6 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Ancestor paint | 2 up div.@container/dialog.overflow-auto.outline-none bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px outline 2px solid #000000 @ 0 | = | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = | --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6 |
| How | at rest | mouse hover | at rest, captured selected |
| Painted layers | - | li.mx-2.flex.items-center 664.0x52.0 bg #ffffff @ 0.04 r 8px | li.mx-2.flex.items-center 664.0x36.0 bg #ffffff @ 0.04 r 8px |
| Icon | - | = | 18 x 18, colour #e6e6e6, stroke #e6e6e6 2px |

Light theme.

| Property | light | light-hover | light-selected |
|---|---|---|---|
| Size (w x h) | 664 x 52 | = | 664 x 36 |
| Padding | 8px 12px | = | = |
| Gap | 16px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.04 | #37352f @ 0.04 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span.block.min-w-0.truncate: -apple-system 14px/20px 400, #1a1a1a | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Ancestor paint | 2 up div.@container/dialog.overflow-auto.outline-none bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px outline 2px solid #000000 @ 0 | = | = |
| Tokens | --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373 | = | --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a |
| How | at rest | mouse hover | at rest, captured selected |
| Painted layers | - | li.mx-2.flex.items-center 664.0x52.0 bg #37352f @ 0.04 r 8px | li.mx-2.flex.items-center 664.0x36.0 bg #37352f @ 0.04 r 8px |
| Icon | - | = | 18 x 18, colour #1a1a1a, stroke #1a1a1a 2px |

Other finders: selected: `() => Q('li.clickable', 0, D())`; light-selected: `() => Q('li.clickable', 0, D())`.

Crops: `search-result-default.png`, `search-result-hover.png`, `search-result-selected.png`, `search-result-light.png`, `search-result-light-hover.png`, `search-result-light-selected.png`.

#### search-group-label

Search group label (Older).

Snapshot: `home-dark-search`. Finder: `() => T('Older', D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 680 x 39.5 |
| Padding | 12px 20px 8px 20px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/19.5px 500 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | none |
| Ancestor paint | 2 up div.@container/dialog.overflow-auto.outline-none bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px outline 2px solid #000000 @ 0 |
| Tokens | --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 680 x 39.5 |
| Padding | 12px 20px 8px 20px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/19.5px 500 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | none |
| Ancestor paint | 2 up div.@container/dialog.overflow-auto.outline-none bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px outline 2px solid #000000 @ 0 |
| Tokens | --text-tertiary #737373 |
| How | at rest |

Crops: `search-group-label-default.png`, `search-group-label-light.png`.

#### notifications-panel

Notifications popover. 400x600, radius 12, a 0.5px border, the All/Updates/Messages tabs, then entries split by rules.

Snapshot: `home-dark-notifications`. Finder: `() => D().firstElementChild`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 400 x 600 |
| Padding | 0px |
| Border | 1px solid #ffffff @ 0.12 |
| Radius | 12px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.08 0px 0px 0px 1px, #000000 @ 0.16 0px 4px 32px 0px |
| Backdrop filter | blur(40px) |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | h3.shrink-0.whitespace-nowrap.font-medium: -apple-system 18px/24px 500, #e6e6e6 |
| Transition | none |
| Icon | 60 x 60, colour #e6e6e6 |
| Painted layers | div.flex.flex-col.overflow-hidden 400.0x600.0 bg #242424 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.08 0px 0px 0px 1px, #000000 @ 0.16 0px 4px 32px 0px; button.clickable.flex.h-8 48.0x32.0 bg #ffffff @ 0.08 r 8px; div.space-y-3.py-4.border-b 366.0x364.9 border B:1px solid #ffffff @ 0.06; svg.absolute.top-1/2.left-1/2 60.0x60.0 bg #282829 @ 0.45 r 9999px; div.space-y-3.py-4.border-b 366.0x404.9 border B:1px solid #ffffff @ 0.06; svg.absolute.top-1/2.left-1/2 60.0x60.0 bg #282829 @ 0.45 r 9999px |
| Tokens | --background-mask-black #00000073; --background-menu-white #242424; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-black #28282973; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a; --shadow-S #00000029; --shadow-XS #00000014; --simplebar-scrollbar-width (unset) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 400 x 600 |
| Padding | 0px |
| Border | 1px solid #000000 @ 0.14 |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 0px 0px 1px, #000000 @ 0.04 0px 4px 32px 0px |
| Backdrop filter | blur(40px) |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | h3.shrink-0.whitespace-nowrap.font-medium: -apple-system 18px/24px 500, #1a1a1a |
| Transition | none |
| Icon | 60 x 60, colour #1a1a1a |
| Painted layers | div.flex.flex-col.overflow-hidden 400.0x600.0 bg #ffffff border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 0px 0px 1px, #000000 @ 0.04 0px 4px 32px 0px; button.clickable.flex.h-8 48.0x32.0 bg #37352f @ 0.08 r 8px; div.space-y-3.py-4.border-b 366.0x364.9 border B:1px solid #000000 @ 0.06; svg.absolute.top-1/2.left-1/2 60.0x60.0 bg #282829 @ 0.45 r 9999px; div.space-y-3.py-4.border-b 366.0x404.9 border B:1px solid #000000 @ 0.06; svg.absolute.top-1/2.left-1/2 60.0x60.0 bg #282829 @ 0.45 r 9999px |
| Tokens | --background-mask-black #000000a6; --background-menu-white #fff; --border-dark #00000024; --border-main #0000000f; --fill-black #28282973; --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a; --shadow-S #0000000a; --shadow-XS #00000005; --simplebar-scrollbar-width (unset) |
| How | at rest |

Crops: `notifications-panel-default.png`, `notifications-panel-light.png`.

#### notification-item

Notification entry.

Snapshot: `home-dark-notifications`. Finder: `() => K('space-y-3 py-4', 0, D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 366 x 364.88 |
| Padding | 16px 0px |
| Border | T: none; R: none; B: 1px solid #ffffff @ 0.06; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.w-full.font-medium.transition: -apple-system 14px/20px 500, #e6e6e6 |
| Transition | none |
| Icon | 60 x 60, colour #e6e6e6 |
| Painted layers | div.space-y-3.py-4.border-b 366.0x364.9 border B:1px solid #ffffff @ 0.06; svg.absolute.top-1/2.left-1/2 60.0x60.0 bg #282829 @ 0.45 r 9999px |
| Tokens | --background-mask-black #00000073; --border-main #ffffff0f; --fill-black #28282973; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 366 x 364.88 |
| Padding | 16px 0px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0.06; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.w-full.font-medium.transition: -apple-system 14px/20px 500, #1a1a1a |
| Transition | none |
| Icon | 60 x 60, colour #1a1a1a |
| Painted layers | div.space-y-3.py-4.border-b 366.0x364.9 border B:1px solid #000000 @ 0.06; svg.absolute.top-1/2.left-1/2 60.0x60.0 bg #282829 @ 0.45 r 9999px |
| Tokens | --background-mask-black #000000a6; --border-main #0000000f; --fill-black #28282973; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373 |
| How | at rest |

Crops: `notification-item-default.png`, `notification-item-light.png`.

#### tooltip

Tooltip.

Snapshot: `home-dark-notifications`. Finder: `() => Q('[role=tooltip]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 87.67 x 24 |
| Padding | 4px 8px |
| Border | none |
| Radius | 8px |
| Background | #000000 @ 0.9 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| Painted layers | span.pointer-events-none.w-max.min-w-10 87.7x24.0 bg #000000 @ 0.9 r 8px |
| Tokens | --background-menu-tooltips #000000e6; --text-white #fff |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 87.67 x 24 |
| Padding | 4px 8px |
| Border | none |
| Radius | 8px |
| Background | #000000 @ 0.9 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| Painted layers | span.pointer-events-none.w-max.min-w-10 87.7x24.0 bg #000000 @ 0.9 r 8px |
| Tokens | --background-menu-tooltips #000000e6; --text-white #fff |
| How | at rest |

Crops: `tooltip-default.png`, `tooltip-light.png`.

#### view-options-menu

View options menu. 192 wide; a 13px grey heading, then Group by task and Favorites only. No item carries a check in this capture.

Snapshot: `library-dark-images-grid-view-options`. Finder: `() => D().firstElementChild`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 192 x 111.5 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.px-3.pb-1.pt-2: -apple-system 13px/19.5px 400, #8c8c8c |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6 |
| Painted layers | div.shadow-menu.p-1 192.0x111.5 bg #242424 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Tokens | --background-menu-white #242424; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 192 x 111.5 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.px-3.pb-1.pt-2: -apple-system 13px/19.5px 400, #737373 |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a |
| Painted layers | div.shadow-menu.p-1 192.0x111.5 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Tokens | --background-menu-white #fff; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --text-tertiary #737373; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Crops: `view-options-menu-default.png`, `view-options-menu-light.png`.

#### view-options-item

View options item.

Snapshot: `library-dark-images-grid-view-options`. Finder: `() => C(T('Group by task', D()), '[role=button]')`.

Dark theme.

| Property | default | hover | second |
|---|---|---|---|
| Size (w x h) | 184 x 36 | = | = |
| Padding | 8px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.06 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #e6e6e6 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #e6e6e6 | = | 16 x 16, colour #e6e6e6, stroke #e6e6e6 2px |
| Ancestor paint | 1 up div.shadow-menu.p-1 bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px | = | = |
| Tokens | --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-menu-item-padding-y 8px | = | = |
| How | at rest | mouse hover | at rest, captured second |
| Painted layers | - | div.flex.items-center.gap-2 184.0x36.0 bg #ffffff @ 0.06 r 8px | = |

Light theme.

| Property | light | light-hover | light-second |
|---|---|---|---|
| Size (w x h) | 184 x 36 | = | = |
| Padding | 8px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.06 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #1a1a1a | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #1a1a1a | = | 16 x 16, colour #1a1a1a, stroke #1a1a1a 2px |
| Ancestor paint | 1 up div.shadow-menu.p-1 bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px | = | = |
| Tokens | --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-menu-item-padding-y 8px | = | = |
| How | at rest | mouse hover | at rest, captured second |
| Painted layers | - | div.flex.items-center.gap-2 184.0x36.0 bg #37352f @ 0.06 r 8px | = |

Other finders: second: `() => C(T('Favorites only', D()), '[role=button]')`; light-second: `() => C(T('Favorites only', D()), '[role=button]')`.

Crops: `view-options-item-default.png`, `view-options-item-hover.png`, `view-options-item-second.png`, `view-options-item-light.png`, `view-options-item-light-hover.png`, `view-options-item-light-second.png`.

#### row-menu

Library row menu. 280 min width; Download, Save to, Share, a divider, Locate in task, Add to favorites, Send to Manus.

Snapshot: `library-dark-row-menu`. Finder: `() => D().firstElementChild`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 280 x 229 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 14px/20px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6, stroke #e6e6e6 2px |
| Painted layers | div.shadow-menu.p-1.text-sm 280.0x229.0 bg #242424 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px; div 256.0x1.0 bg #ffffff @ 0.06 |
| Tokens | --background-menu-white #242424; --border-main #ffffff0f; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 280 x 229 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 14px/20px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a, stroke #1a1a1a 2px |
| Painted layers | div.shadow-menu.p-1.text-sm 280.0x229.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px; div 256.0x1.0 bg #000000 @ 0.06 |
| Tokens | --background-menu-white #fff; --border-main #0000000f; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Crops: `row-menu-default.png`, `row-menu-light.png`.

#### row-menu-item

Library row menu item.

Snapshot: `library-dark-row-menu`. Finder: `() => CK(T('Download', D()), 'rounded-[8px]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 272 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #e6e6e6 2px | = |
| Ancestor paint | 1 up div.shadow-menu.p-1.text-sm bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px | = |
| Tokens | --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-menu-item-padding-y 8px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-2 272.0x36.0 bg #ffffff @ 0.06 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 272 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #1a1a1a 2px | = |
| Ancestor paint | 1 up div.shadow-menu.p-1.text-sm bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px | = |
| Tokens | --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-menu-item-padding-y 8px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-2 272.0x36.0 bg #37352f @ 0.06 r 8px |

Crops: `row-menu-item-default.png`, `row-menu-item-hover.png`, `row-menu-item-light.png`, `row-menu-item-light-hover.png`.

#### user-menu

Account menu. 284 wide, opening above the account row.

Snapshot: `library-dark-user-menu`. Finder: `() => D().firstElementChild`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 284 x 418 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/18px 600, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #8c8c8c, stroke #8c8c8c 2px |
| Painted layers | div.p-0.shadow-menu 284.0x418.0 bg #242424 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px; div.relative.flex.items-center 28.0x28.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px; div.w-full.h-full.object-cover 26.0x26.0 bg #ffffff @ 0.08; div.flex.w-full.flex-col 276.0x80.0 bg #ffffff @ 0.04 r 8px; button.inline-flex.items-center.justify-center 69.0x28.0 bg #ffffff @ 0.95 r 8px; div.mx-2.my-1.h-px 260.0x1.0 bg #ffffff @ 0.06 |
| Tokens | --Button-black #fffffff2; --background-menu-white #242424; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-onblack #000000e5; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-density-small-row-height 32px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 284 x 418 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/18px 600, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #737373, stroke #737373 2px |
| Painted layers | div.p-0.shadow-menu 284.0x418.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px; div.relative.flex.items-center 28.0x28.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px; div.w-full.h-full.object-cover 26.0x26.0 bg #37352f @ 0.08; div.flex.w-full.flex-col 276.0x80.0 bg #37352f @ 0.04 r 8px; button.inline-flex.items-center.justify-center 69.0x28.0 bg #1a1a19 r 8px; div.mx-2.my-1.h-px 260.0x1.0 bg #000000 @ 0.06 |
| Tokens | --Button-black #1a1a19; --background-menu-white #fff; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-onblack #fff; --text-primary #1a1a1a; --text-tertiary #737373; --ui-density-small-row-height 32px |
| How | at rest |

Crops: `user-menu-default.png`, `user-menu-light.png`.

#### user-menu-header

Account menu header (avatar, name, workspace).

Snapshot: `library-dark-user-menu`. Finder: `() => C(T('Personal', D()), '.clickable')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 276 x 52 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/18px 600, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #8c8c8c, stroke #8c8c8c 2px | = |
| Painted layers | div.relative.flex.items-center 28.0x28.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px; div.w-full.h-full.object-cover 26.0x26.0 bg #ffffff @ 0.08 | div.clickable.flex.w-full 276.0x52.0 bg #ffffff @ 0.04 r 8px; div.relative.flex.items-center 28.0x28.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px; div.w-full.h-full.object-cover 26.0x26.0 bg #ffffff @ 0.08 |
| Ancestor paint | 2 up div.p-0.shadow-menu bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px | = |
| Tokens | --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 276 x 52 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/18px 600, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #737373, stroke #737373 2px | = |
| Painted layers | div.relative.flex.items-center 28.0x28.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px; div.w-full.h-full.object-cover 26.0x26.0 bg #37352f @ 0.08 | div.clickable.flex.w-full 276.0x52.0 bg #37352f @ 0.04 r 8px; div.relative.flex.items-center 28.0x28.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px; div.w-full.h-full.object-cover 26.0x26.0 bg #37352f @ 0.08 |
| Ancestor paint | 2 up div.p-0.shadow-menu bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px | = |
| Tokens | --border-main #0000000f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373 | = |
| How | at rest | mouse hover |

Crops: `user-menu-header-default.png`, `user-menu-header-hover.png`, `user-menu-header-light.png`, `user-menu-header-light-hover.png`.

#### user-menu-plan

Account menu plan card.

Snapshot: `library-dark-user-menu`. Finder: `() => K('rounded-[8px] bg-[var(--fill-tsp-white-light)]', 0, D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 276 x 80 |
| Padding | 0px |
| Border | none |
| Radius | 8px |
| Background | #ffffff @ 0.04 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.font-serif.font-bold.whitespace-nowrap: LibreBaskerville 14px/20px 700, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6 |
| Painted layers | div.flex.w-full.flex-col 276.0x80.0 bg #ffffff @ 0.04 r 8px; button.inline-flex.items-center.justify-center 69.0x28.0 bg #ffffff @ 0.95 r 8px |
| Ancestor paint | 3 up div.p-0.shadow-menu bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Tokens | --Button-black #fffffff2; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-onblack #000000e5; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-density-small-row-height 32px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 276 x 80 |
| Padding | 0px |
| Border | none |
| Radius | 8px |
| Background | #37352f @ 0.04 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.font-serif.font-bold.whitespace-nowrap: LibreBaskerville 14px/20px 700, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a |
| Painted layers | div.flex.w-full.flex-col 276.0x80.0 bg #37352f @ 0.04 r 8px; button.inline-flex.items-center.justify-center 69.0x28.0 bg #1a1a19 r 8px |
| Ancestor paint | 3 up div.p-0.shadow-menu bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Tokens | --Button-black #1a1a19; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-onblack #fff; --text-primary #1a1a1a; --text-tertiary #737373; --ui-density-small-row-height 32px |
| How | at rest |

Crops: `user-menu-plan-default.png`, `user-menu-plan-light.png`.

#### user-menu-upgrade

Account menu Upgrade button.

Snapshot: `library-dark-user-menu`. Finder: `() => C(T('Upgrade', D()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 68.95 x 28 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | #ffffff @ 0.95 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 13px/18px 500 | = | = |
| Letter spacing | -0.08px | = | = |
| Colour | #000000 @ 0.898 | = | = |
| Text node | span: -apple-system 13px/18px 500, #000000 @ 0.898, ls -0.08px | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 69.0x28.0 bg #ffffff @ 0.95 r 8px | button.inline-flex.items-center.justify-center 69.0x28.0 bg #ffffff @ 0.95 r 8px opacity 0.9 | = |
| Tokens | --Button-black #fffffff2; --text-onblack #000000e5; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 68.95 x 28 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | #1a1a19 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 13px/18px 500 | = | = |
| Letter spacing | -0.08px | = | = |
| Colour | #ffffff | = | = |
| Text node | span: -apple-system 13px/18px 500, #ffffff, ls -0.08px | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 69.0x28.0 bg #1a1a19 r 8px | button.inline-flex.items-center.justify-center 69.0x28.0 bg #1a1a19 r 8px opacity 0.9 | = |
| Tokens | --Button-black #1a1a19; --text-onblack #fff; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Crops: `user-menu-upgrade-default.png`, `user-menu-upgrade-hover.png`, `user-menu-upgrade-focus-visible.png`, `user-menu-upgrade-light.png`, `user-menu-upgrade-light-hover.png`, `user-menu-upgrade-light-focus-visible.png`.

#### user-menu-item

Account menu item. Hover also shows the shortcut hint (⌘⇧,).

Snapshot: `library-dark-user-menu`. Finder: `() => K('group/profileMenuItem', 0, D()) && CK(T('Settings', D()), 'group/profileMenuItem')`.

Dark theme.

| Property | default | hover | link | link-focus-visible |
|---|---|---|---|---|
| Size (w x h) | 276 x 36 | = | = | = |
| Padding | 8px | = | = | = |
| Gap | 4px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #ffffff @ 0.04 | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #e6e6e6 | = | = | = |
| Text node | span.min-w-0.flex-1.truncate: -apple-system 14px/20px 400, #e6e6e6 | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #e6e6e6 2px | = | = | = |
| Ancestor paint | 2 up div.p-0.shadow-menu bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px | = | = | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = | --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6 | --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6 |
| How | at rest | mouse hover | at rest, captured link | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | div.group/profileMenuItem.clickable.flex 276.0x36.0 bg #ffffff @ 0.04 r 8px | = | = |

Light theme.

| Property | light | light-hover | light-link | light-link-focus-visible |
|---|---|---|---|---|
| Size (w x h) | 276 x 36 | = | = | = |
| Padding | 8px | = | = | = |
| Gap | 4px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #37352f @ 0.04 | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #1a1a1a | = | = | = |
| Text node | span.min-w-0.flex-1.truncate: -apple-system 14px/20px 400, #1a1a1a | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #1a1a1a 2px | = | = | = |
| Ancestor paint | 2 up div.p-0.shadow-menu bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px | = | = | = |
| Tokens | --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373 | = | --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a | --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a |
| How | at rest | mouse hover | at rest, captured link | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | div.group/profileMenuItem.clickable.flex 276.0x36.0 bg #37352f @ 0.04 r 8px | = | = |

Other finders: link: `() => C(T('Docs', D()), 'a')`; link-focus-visible: `() => C(T('Docs', D()), 'a')`; light-link: `() => C(T('Docs', D()), 'a')`; light-link-focus-visible: `() => C(T('Docs', D()), 'a')`.

Crops: `user-menu-item-default.png`, `user-menu-item-hover.png`, `user-menu-item-link.png`, `user-menu-item-link-focus-visible.png`, `user-menu-item-light.png`, `user-menu-item-light-hover.png`, `user-menu-item-light-link.png`, `user-menu-item-light-link-focus-visible.png`.

#### context-menu

Project context menu.

Snapshot: `plugins-dark-project-context-menu`. Finder: `() => D().firstElementChild`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 132.33 x 116 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6, stroke #e6e6e6 2px |
| Painted layers | div.shadow-menu.p-1 132.3x116.0 bg #242424 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Tokens | --background-menu-white #242424; --fill-tsp-white-main #ffffff0f; --function-error #eb4d4d; --text-primary #e6e6e6; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 132.33 x 116 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a, stroke #1a1a1a 2px |
| Painted layers | div.shadow-menu.p-1 132.3x116.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Tokens | --background-menu-white #fff; --fill-tsp-white-main #37352f0f; --function-error #fb494f; --text-primary #1a1a1a; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Crops: `context-menu-default.png`, `context-menu-light.png`.

#### context-menu-item-danger

Context menu Delete item.

Snapshot: `plugins-dark-project-context-menu`. Finder: `() => CK(T('Delete', D()), 'rounded-[8px]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 124.33 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #eb4d4d | = |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #eb4d4d | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #eb4d4d, stroke #eb4d4d 2px | = |
| Ancestor paint | 1 up div.shadow-menu.p-1 bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px | = |
| Tokens | --fill-tsp-white-main #ffffff0f; --function-error #eb4d4d; --ui-density-menu-item-padding-y 8px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-2 124.3x36.0 bg #ffffff @ 0.06 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 124.33 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #fb494f | = |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #fb494f | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #fb494f, stroke #fb494f 2px | = |
| Ancestor paint | 1 up div.shadow-menu.p-1 bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px | = |
| Tokens | --fill-tsp-white-main #37352f0f; --function-error #fb494f; --ui-density-menu-item-padding-y 8px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-2 124.3x36.0 bg #37352f @ 0.06 r 8px |

Crops: `context-menu-item-danger-default.png`, `context-menu-item-danger-hover.png`, `context-menu-item-danger-light.png`, `context-menu-item-danger-light-hover.png`.

#### more-menu

Sidebar More menu. The one menu on --background-menu-gray rather than --background-menu-white.

Snapshot: `plugins-dark-more-menu`. Finder: `() => D().firstElementChild`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 190 x 116 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #1a1a1a |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6 |
| Painted layers | div.shadow-menu.p-1 190.0x116.0 bg #1a1a1a r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Tokens | --background-menu-gray #1a1a1a; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 190 x 116 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #f8f8f7 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a |
| Painted layers | div.shadow-menu.p-1 190.0x116.0 bg #f8f8f7 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Tokens | --background-menu-gray #f8f8f7; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Crops: `more-menu-default.png`, `more-menu-light.png`.

#### more-menu-item

Sidebar More menu item.

Snapshot: `plugins-dark-more-menu`. Finder: `() => CK(T('Skills', D()), 'rounded-[8px]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 182 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #e6e6e6 | = |
| Ancestor paint | 1 up div.shadow-menu.p-1 bg #1a1a1a shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px | = |
| Tokens | --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-menu-item-padding-y 8px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-2 182.0x36.0 bg #ffffff @ 0.06 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 182 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #1a1a1a | = |
| Ancestor paint | 1 up div.shadow-menu.p-1 bg #f8f8f7 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px | = |
| Tokens | --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-menu-item-padding-y 8px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-2 182.0x36.0 bg #37352f @ 0.06 r 8px |

Crops: `more-menu-item-default.png`, `more-menu-item-hover.png`, `more-menu-item-light.png`, `more-menu-item-light-hover.png`.

#### task-menu

Sidebar task menu.

Snapshot: `task-dark-sidebar-task-menu`. Finder: `() => D().firstElementChild`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 200 x 424 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6 |
| Painted layers | div.shadow-menu.p-1 200.0x424.0 bg #242424 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px; div 176.0x1.0 bg #ffffff @ 0.06; div 176.0x1.0 bg #ffffff @ 0.06; div 176.0x1.0 bg #ffffff @ 0.06; div 176.0x1.0 bg #ffffff @ 0.06 |
| Tokens | --background-menu-white #242424; --border-main #ffffff0f; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 200 x 424 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a |
| Painted layers | div.shadow-menu.p-1 200.0x424.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px; div 176.0x1.0 bg #000000 @ 0.06; div 176.0x1.0 bg #000000 @ 0.06; div 176.0x1.0 bg #000000 @ 0.06; div 176.0x1.0 bg #000000 @ 0.06 |
| Tokens | --background-menu-white #fff; --border-main #0000000f; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Crops: `task-menu-default.png`, `task-menu-light.png`.

#### task-menu-item-danger

Sidebar task menu Delete item.

Snapshot: `task-dark-sidebar-task-menu`. Finder: `() => CK(T('Delete', D()), 'rounded-[8px]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 192 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #eb4d4d | = |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #eb4d4d | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #eb4d4d, stroke #eb4d4d 2px | = |
| Ancestor paint | 1 up div.shadow-menu.p-1 bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px | = |
| Tokens | --fill-tsp-white-main #ffffff0f; --function-error #eb4d4d; --ui-density-menu-item-padding-y 8px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-2 192.0x36.0 bg #ffffff @ 0.06 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 192 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #fb494f | = |
| Text node | div.flex-1.flex.items-center: -apple-system 14px/20px 400, #fb494f | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #fb494f, stroke #fb494f 2px | = |
| Ancestor paint | 1 up div.shadow-menu.p-1 bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px | = |
| Tokens | --fill-tsp-white-main #37352f0f; --function-error #fb494f; --ui-density-menu-item-padding-y 8px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-2 192.0x36.0 bg #37352f @ 0.06 r 8px |

Crops: `task-menu-item-danger-default.png`, `task-menu-item-danger-hover.png`, `task-menu-item-danger-light.png`, `task-menu-item-danger-light-hover.png`.

#### files-dialog

Files in this task dialog. 600x680, radius 16, --background-gray-main over --background-dialog-mask with a 4px blur.

Snapshot: `task-dark-files-dialog`. Finder: `() => D()`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 600 x 680 |
| Padding | 0px |
| Border | none |
| Radius | 16px |
| Background | #1a1a1a |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Outline | 2px solid #000000 @ 0 offset 2px |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | h1.flex-1.text-lg.font-semibold: -apple-system 18px/28px 600, #e6e6e6 |
| Transition | none |
| Icon | 18 x 18, colour #b3b3b3 |
| Painted layers | div.@container/dialog.overflow-auto.outline-none 600.0x680.0 bg #1a1a1a r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px outline 2px solid #000000 @ 0 offset 2px; button.clickable.flex.h-8 48.0x32.0 bg #ffffff @ 0.08 r 8px |
| Tokens | --background-gray-main #1a1a1a; --dlg-enter-scale 1; --dlg-enter-y 0px; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3; --icon-tertiary #8c8c8c; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-density-small-row-height 32px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 600 x 680 |
| Padding | 0px |
| Border | none |
| Radius | 16px |
| Background | #f8f8f7 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Outline | 2px solid #000000 @ 0 offset 2px |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | h1.flex-1.text-lg.font-semibold: -apple-system 18px/28px 600, #1a1a1a |
| Transition | none |
| Icon | 18 x 18, colour #4d4d4d |
| Painted layers | div.@container/dialog.overflow-auto.outline-none 600.0x680.0 bg #f8f8f7 r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px outline 2px solid #000000 @ 0 offset 2px; button.clickable.flex.h-8 48.0x32.0 bg #37352f @ 0.08 r 8px |
| Tokens | --background-gray-main #f8f8f7; --dlg-enter-scale 1; --dlg-enter-y 0px; --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d; --icon-tertiary #737373; --text-primary #1a1a1a; --text-tertiary #737373; --ui-density-small-row-height 32px |
| How | at rest |

Crops: `files-dialog-default.png`, `files-dialog-light.png`.

#### files-dialog-row

Files dialog file row.

Snapshot: `task-dark-files-dialog`. Finder: `() => C(T('pasted_content.txt', D()), '.clickable')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 576 x 56 | = |
| Padding | 10px 12px | = |
| Gap | 12px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span.inline-block.whitespace-nowrap.text-sm: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Icon | 32 x 32, colour #e6e6e6 | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-tertiary #8c8c8c; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-3 576.0x56.0 bg #ffffff @ 0.04 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 576 x 56 | = |
| Padding | 10px 12px | = |
| Gap | 12px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span.inline-block.whitespace-nowrap.text-sm: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Icon | 32 x 32, colour #1a1a1a | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-tertiary #737373; --text-primary #1a1a1a; --text-tertiary #737373 | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.gap-3 576.0x56.0 bg #37352f @ 0.04 r 8px |

Crops: `files-dialog-row-default.png`, `files-dialog-row-hover.png`, `files-dialog-row-light.png`, `files-dialog-row-light-hover.png`.

#### dialog-mask

Dialog backdrop.

Snapshot: `task-dark-files-dialog`. Finder: `() => K('fixed inset-0 backdrop-blur-[4px]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 1440 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #000000 @ 0.6 |
| Box shadow | none |
| Backdrop filter | blur(4px) |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Painted layers | div.w-full.h-full.fixed 1440.0x900.0 bg #000000 @ 0.6 |
| Tokens | --background-dialog-mask #0009 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 1440 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #000000 @ 0.3 |
| Box shadow | none |
| Backdrop filter | blur(4px) |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Painted layers | div.w-full.h-full.fixed 1440.0x900.0 bg #000000 @ 0.3 |
| Tokens | --background-dialog-mask #0000004d |
| How | at rest |

Crops: none.

#### dialog-close

Dialog close button (files dialog).

Snapshot: `task-dark-files-dialog`. Finder: `() => K('cursor-pointer rounded-md', 1, D())`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #b3b3b3, stroke #b3b3b3 2px | = |
| Ancestor paint | 3 up div.@container/dialog.overflow-auto.outline-none bg #1a1a1a shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px outline 2px solid #000000 @ 0 | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3; --ui-density-small-row-height 32px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.04 r 6px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #4d4d4d, stroke #4d4d4d 2px | = |
| Ancestor paint | 3 up div.@container/dialog.overflow-auto.outline-none bg #f8f8f7 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px outline 2px solid #000000 @ 0 | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d; --ui-density-small-row-height 32px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.04 r 6px |

Crops: `dialog-close-default.png`, `dialog-close-hover.png`, `dialog-close-light.png`, `dialog-close-light-hover.png`.

### Library

#### page-title

Page title (h1). 18/24 500 in --text-primary, in a 112 tall header band.

Snapshot: `library-dark`. Finder: `() => Q('h1', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 57.63 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 18px/24px 500 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Tokens | --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 57.63 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 18px/24px 500 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Tokens | --text-primary #1a1a1a |
| How | at rest |

Crops: `page-title-default.png`, `page-title-light.png`.

#### library-search

Search field.

Snapshot: `library-dark`. Finder: `() => C(Q('input[placeholder="Search files"]'), '.group')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 240 x 32 | = | = |
| Padding | 4px 6px 4px 12px | = | = |
| Gap | 10px | = | = |
| Border | 1px solid #ffffff @ 0.12 | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Transition | none | = | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #b3b3b3 2px | = | = |
| Placeholder | "Search files" #595959, opacity 1, 14px | = | = |
| Painted layers | div.group.overflow-hidden.text-sm 240.0x32.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px | = | = |
| Tokens | --Button-border-secondary #ffffff1f; --text-disable #595959; --text-primary #e6e6e6; --ui-density-input-gap 10px; --ui-density-small-radius 8px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 240 x 32 | = | = |
| Padding | 4px 6px 4px 12px | = | = |
| Gap | 10px | = | = |
| Border | 1px solid #000000 @ 0.12 | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Transition | none | = | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #4d4d4d 2px | = | = |
| Placeholder | "Search files" #a6a6a6, opacity 1, 14px | = | = |
| Painted layers | div.group.overflow-hidden.text-sm 240.0x32.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px | = | = |
| Tokens | --Button-border-secondary #0000001f; --text-disable #a6a6a6; --text-primary #1a1a1a; --ui-density-input-gap 10px; --ui-density-small-radius 8px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Crops: `library-search-default.png`, `library-search-hover.png`, `library-search-focus-visible.png`, `library-search-light.png`, `library-search-light-hover.png`, `library-search-light-focus-visible.png`.

#### view-options-button

View options button.

Snapshot: `library-dark`. Finder: `() => K('size-8 rounded-lg border', 0, M())`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Border | 1px solid #ffffff @ 0.12 | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.06 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #b3b3b3 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #b3b3b3 | = | = |
| Painted layers | button.clickable.flex.size-8 32.0x32.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px | button.clickable.flex.size-8 32.0x32.0 bg #ffffff @ 0.06 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px | = |
| Tokens | --Button-border-secondary #ffffff1f; --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Border | 1px solid #000000 @ 0.12 | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.06 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #4d4d4d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #4d4d4d | = | = |
| Painted layers | button.clickable.flex.size-8 32.0x32.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px | button.clickable.flex.size-8 32.0x32.0 bg #37352f @ 0.06 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px | = |
| Tokens | --Button-border-secondary #0000001f; --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `view-options-button-default.png`, `view-options-button-hover.png`, `view-options-button-focus-visible.png`, `view-options-button-light.png`, `view-options-button-light-hover.png`, `view-options-button-light-focus-visible.png`.

#### view-toggle

Grid/list segmented control. 68x32, radius 8, 1px --border-main, --fill-tsp-gray-main; a white thumb (radius 6, a 0.5px-offset shadow) slides under the active option.

Snapshot: `library-dark`. Finder: `() => K('h-8 p-[1px] items-stretch', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 68 x 32 |
| Padding | 1px |
| Border | 1px solid #ffffff @ 0.06 |
| Radius | 8px |
| Background | #000000 @ 0.2 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #8c8c8c, stroke #8c8c8c 2px |
| Painted layers | div.h-8.flex.items-stretch 68.0x32.0 bg #000000 @ 0.2 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px; div.absolute.inset-0 32.0x28.0 bg #242424 r 6px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.16 0px 0.5px 3px 0px |
| Tokens | --border-main #ffffff0f; --fill-tsp-gray-main #0003; --fill-white #242424; --shadow-S #00000029; --text-primary #e6e6e6; --text-secondary #b3b3b3; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 68 x 32 |
| Padding | 1px |
| Border | 1px solid #000000 @ 0.06 |
| Radius | 8px |
| Background | #37352f @ 0.04 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #737373, stroke #737373 2px |
| Painted layers | div.h-8.flex.items-stretch 68.0x32.0 bg #37352f @ 0.04 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px; div.absolute.inset-0 32.0x28.0 bg #ffffff r 6px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0.5px 3px 0px |
| Tokens | --border-main #0000000f; --fill-tsp-gray-main #37352f0a; --fill-white #fff; --shadow-S #0000000a; --text-primary #1a1a1a; --text-secondary #4d4d4d; --text-tertiary #737373 |
| How | at rest |

Crops: `view-toggle-default.png`, `view-toggle-light.png`.

#### view-toggle-option

Segmented control option.

Snapshot: `library-dark`. Finder: `() => K('h-8 p-[1px] items-stretch', 0, M()).querySelectorAll('button')[0]`.

Dark theme.

| Property | default | hover | focus-visible | active |
|---|---|---|---|---|
| Size (w x h) | 32 x 28 | = | = | = |
| Padding | 0px 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 0px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 13px/18px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #8c8c8c | #b3b3b3 | = | #e6e6e6 |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.2s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 16 x 16, colour #8c8c8c, stroke #8c8c8c 2px | 16 x 16, colour #b3b3b3, stroke #8c8c8c 2px | = | 16 x 16, colour #e6e6e6, stroke #e6e6e6 2px |
| Tokens | --text-primary #e6e6e6; --text-secondary #b3b3b3; --text-tertiary #8c8c8c | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured active |

Light theme.

| Property | light | light-hover | light-focus-visible | light-active |
|---|---|---|---|---|
| Size (w x h) | 32 x 28 | = | = | = |
| Padding | 0px 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 0px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 13px/18px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #737373 | #4d4d4d | = | #1a1a1a |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.2s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 16 x 16, colour #737373, stroke #737373 2px | 16 x 16, colour #4d4d4d, stroke #737373 2px | = | 16 x 16, colour #1a1a1a, stroke #1a1a1a 2px |
| Tokens | --text-primary #1a1a1a; --text-secondary #4d4d4d; --text-tertiary #737373 | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured active |

Other finders: active: `() => K('h-8 p-[1px] items-stretch', 0, M()).querySelectorAll('button')[1]`; light-active: `() => K('h-8 p-[1px] items-stretch', 0, M()).querySelectorAll('button')[1]`.

Crops: `view-toggle-option-default.png`, `view-toggle-option-hover.png`, `view-toggle-option-focus-visible.png`, `view-toggle-option-active.png`, `view-toggle-option-light.png`, `view-toggle-option-light-hover.png`, `view-toggle-option-light-focus-visible.png`, `view-toggle-option-light-active.png`.

#### view-toggle-thumb

Segmented control thumb.

Snapshot: `library-dark`. Finder: `() => K('absolute inset-0 rounded-[6px]', 0, K('h-8 p-[1px] items-stretch', 0, M()))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 32 x 28 |
| Padding | 0px |
| Border | none |
| Radius | 6px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.16 0px 0.5px 3px 0px |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Painted layers | div.absolute.inset-0 32.0x28.0 bg #242424 r 6px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.16 0px 0.5px 3px 0px |
| Tokens | --fill-white #242424; --shadow-S #00000029 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 32 x 28 |
| Padding | 0px |
| Border | none |
| Radius | 6px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0.5px 3px 0px |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Painted layers | div.absolute.inset-0 32.0x28.0 bg #ffffff r 6px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0.5px 3px 0px |
| Tokens | --fill-white #fff; --shadow-S #0000000a |
| How | at rest |

Crops: `view-toggle-thumb-default.png`, `view-toggle-thumb-light.png`.

#### type-tab

Type tab. 32 tall, radius 8, 14px; the label is drawn twice (a hidden 500-weight copy reserves the width, so selecting does not shift the row).

Snapshot: `library-dark`. Finder: `() => C(T('Text & PDF', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible | selected | selected-hover |
|---|---|---|---|---|---|
| Size (w x h) | 92.17 x 32 | = | = | 48 x 32 | 48 x 32 |
| Padding | 0px 10px | = | = | = | = |
| Border | none | = | = | = | = |
| Radius | 8px | = | = | = | = |
| Background | transparent | #ffffff @ 0.04 | = | #ffffff @ 0.08 | #ffffff @ 0.08 |
| Box shadow | none | = | = | = | = |
| Outline | none | = | = | = | = |
| Font | -apple-system 14px/20px 400 | = | = | -apple-system 14px/20px 500 | -apple-system 14px/20px 500 |
| Letter spacing | normal | = | = | = | = |
| Colour | #8c8c8c | = | = | #e6e6e6 | #e6e6e6 |
| Text node | span.absolute.inset-0.flex: -apple-system 14px/20px 400, #8c8c8c | = | = | span.absolute.inset-0.flex: -apple-system 14px/20px 500, #e6e6e6 | span.absolute.inset-0.flex: -apple-system 14px/20px 500, #e6e6e6 |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --text-tertiary #8c8c8c | = | = | --fill-tsp-white-dark #ffffff14; --text-primary #e6e6e6 | --fill-tsp-white-dark #ffffff14; --text-primary #e6e6e6 |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured selected | mouse hover |
| Painted layers | - | button.clickable.flex.h-8 92.2x32.0 bg #ffffff @ 0.04 r 8px | = | button.clickable.flex.h-8 48.0x32.0 bg #ffffff @ 0.08 r 8px | button.clickable.flex.h-8 48.0x32.0 bg #ffffff @ 0.08 r 8px |

Light theme.

| Property | light | light-hover | light-focus-visible | light-selected | light-selected-hover |
|---|---|---|---|---|---|
| Size (w x h) | 92.17 x 32 | = | = | 48 x 32 | 48 x 32 |
| Padding | 0px 10px | = | = | = | = |
| Border | none | = | = | = | = |
| Radius | 8px | = | = | = | = |
| Background | transparent | #37352f @ 0.04 | = | #37352f @ 0.08 | #37352f @ 0.08 |
| Box shadow | none | = | = | = | = |
| Outline | none | = | = | = | = |
| Font | -apple-system 14px/20px 400 | = | = | -apple-system 14px/20px 500 | -apple-system 14px/20px 500 |
| Letter spacing | normal | = | = | = | = |
| Colour | #737373 | = | = | #1a1a1a | #1a1a1a |
| Text node | span.absolute.inset-0.flex: -apple-system 14px/20px 400, #737373 | = | = | span.absolute.inset-0.flex: -apple-system 14px/20px 500, #1a1a1a | span.absolute.inset-0.flex: -apple-system 14px/20px 500, #1a1a1a |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Tokens | --fill-tsp-white-light #37352f0a; --text-tertiary #737373 | = | = | --fill-tsp-white-dark #37352f14; --text-primary #1a1a1a | --fill-tsp-white-dark #37352f14; --text-primary #1a1a1a |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured selected | mouse hover |
| Painted layers | - | button.clickable.flex.h-8 92.2x32.0 bg #37352f @ 0.04 r 8px | = | button.clickable.flex.h-8 48.0x32.0 bg #37352f @ 0.08 r 8px | button.clickable.flex.h-8 48.0x32.0 bg #37352f @ 0.08 r 8px |

Other finders: selected: `() => C(T('All', M()), 'button')`; selected-hover: `() => C(T('All', M()), 'button')`; light-selected: `() => C(T('All', M()), 'button')`; light-selected-hover: `() => C(T('All', M()), 'button')`.

Crops: `type-tab-default.png`, `type-tab-hover.png`, `type-tab-focus-visible.png`, `type-tab-selected.png`, `type-tab-selected-hover.png`, `type-tab-light.png`, `type-tab-light-hover.png`, `type-tab-light-focus-visible.png`, `type-tab-light-selected.png`, `type-tab-light-selected-hover.png`.

#### date-heading

Date group heading with count.

Snapshot: `library-dark`. Finder: `() => Q('h2', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 59.67 x 20 |
| Padding | 0px |
| Gap | 4px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.truncate: -apple-system 14px/20px 400, #e6e6e6 |
| Transition | none |
| Tokens | --text-primary #e6e6e6; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 59.67 x 20 |
| Padding | 0px |
| Gap | 4px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.truncate: -apple-system 14px/20px 400, #1a1a1a |
| Transition | none |
| Tokens | --text-primary #1a1a1a; --text-tertiary #737373 |
| How | at rest |

Crops: `date-heading-default.png`, `date-heading-light.png`.

#### file-row

File list row. 67 tall; the hover fill extends 12px past the column on both sides (radius 8); a 1px --border-main rule under the inner row.

Snapshot: `library-dark`. Finder: `() => C(Q('time', 0, M()), '[role=button]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 1024 x 67 | = |
| Padding | 0px 12px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 24 x 24, colour #e6e6e6 | = |
| Painted layers | div.w-full.flex.items-center 1000.0x67.0 border B:1px solid #ffffff @ 0.06 | div.clickable.relative.group 1024.0x67.0 bg #ffffff @ 0.04 r 8px; div.w-full.flex.items-center 1000.0x67.0 border B:1px solid #ffffff @ 0.06 |
| Tokens | --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 1024 x 67 | = |
| Padding | 0px 12px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 24 x 24, colour #1a1a1a | = |
| Painted layers | div.w-full.flex.items-center 1000.0x67.0 border B:1px solid #000000 @ 0.06 | div.clickable.relative.group 1024.0x67.0 bg #37352f @ 0.04 r 8px; div.w-full.flex.items-center 1000.0x67.0 border B:1px solid #000000 @ 0.06 |
| Tokens | --border-main #0000000f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373 | = |
| How | at rest | mouse hover |

Crops: `file-row-default.png`, `file-row-hover.png`, `file-row-light.png`, `file-row-light-hover.png`.

#### file-row-icon

File row icon.

Snapshot: `library-dark`. Finder: `() => C(Q('time', 0, M()), '[role=button]').querySelector('svg, img')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 24 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| Icon | 24 x 24, colour #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 24 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Cursor | pointer |
| Icon | 24 x 24, colour #1a1a1a |
| How | at rest |

Crops: `file-row-icon-default.png`, `file-row-icon-light.png`.

#### file-row-title

File row title.

Snapshot: `library-dark`. Finder: `() => TS('Competitor Deep Dive', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 493.38 x 17 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 493.38 x 17 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Crops: `file-row-title-default.png`, `file-row-title-light.png`.

#### file-row-source

File row source task.

Snapshot: `library-dark`. Finder: `() => K('max-w-full truncate text-[13px]', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 331.67 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | none |
| Cursor | pointer |
| Tokens | --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 331.67 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | none |
| Cursor | pointer |
| Tokens | --text-tertiary #737373 |
| How | at rest |

Crops: `file-row-source-default.png`, `file-row-source-light.png`.

#### file-row-time

File row time.

Snapshot: `library-dark`. Finder: `() => Q('time', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 55.11 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | none |
| Cursor | pointer |
| Tokens | --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 55.11 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | none |
| Cursor | pointer |
| Tokens | --text-tertiary #737373 |
| How | at rest |

Crops: `file-row-time-default.png`, `file-row-time-light.png`.

#### file-row-menu

File row more button.

Snapshot: `library-dark`, `library-dark-row-menu`. Finder: `() => C(Q('time', 0, M()), '[role=button]').querySelector('button')`.

Dark theme.

| Property | default | hover | focus-visible | open |
|---|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = | = |
| Padding | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #ffffff @ 0.04 | = | #ffffff @ 0.04 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/24px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #e6e6e6 | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #8c8c8c 2px | = | = | = |
| Tokens | --fill-tsp-white-light #ffffff0a | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |
| Painted layers | - | button.flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.04 r 8px | = | button.flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.04 r 8px |

Light theme.

| Property | light | light-hover | light-focus-visible | light-open |
|---|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = | = |
| Padding | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #37352f @ 0.04 | = | #37352f @ 0.04 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/24px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #1a1a1a | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #737373 2px | = | = | = |
| Tokens | --fill-tsp-white-light #37352f0a | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |
| Painted layers | - | button.flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.04 r 8px | = | button.flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.04 r 8px |

Other finders: open: `() => C(Q('time', 0, M()), '[role=button]').querySelector('button')`; light-open: `() => C(Q('time', 0, M()), '[role=button]').querySelector('button')`.

Crops: `file-row-menu-default.png`, `file-row-menu-hover.png`, `file-row-menu-focus-visible.png`, `file-row-menu-open.png`, `file-row-menu-light.png`, `file-row-menu-light-hover.png`, `file-row-menu-light-focus-visible.png`, `file-row-menu-light-open.png`.

#### grid-card

Grid card. 323x258, radius 12, a 0.5px --border-dark hairline on --background-menu-white; a title row (icon, name, extension, source, more) over the thumbnail.

Snapshot: `library-dark-images-grid`. Finder: `() => CK(T('dealer_flow', M()), 'rounded-[12px]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 322.66 x 258.41 | = |
| Padding | 0px | = |
| Border | 1px solid #ffffff @ 0.12 | = |
| Radius | 12px | = |
| Background | #242424 | = |
| Box shadow | none | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 0.5px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 24 x 24, colour #e6e6e6 | = |
| Painted layers | div.clickable.relative.flex 322.7x258.4 bg #242424 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px | div.clickable.relative.flex 322.7x258.4 bg #242424 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 0.5px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Tokens | --background-menu-white #242424; --border-dark #ffffff1f; --fill-tsp-gray-dark #0000004d; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 322.66 x 258.41 | = |
| Padding | 0px | = |
| Border | 1px solid #000000 @ 0.14 | = |
| Radius | 12px | = |
| Background | #ffffff | = |
| Box shadow | none | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 0.5px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 24 x 24, colour #1a1a1a | = |
| Painted layers | div.clickable.relative.flex 322.7x258.4 bg #ffffff border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px | div.clickable.relative.flex 322.7x258.4 bg #ffffff border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 0.5px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Tokens | --background-menu-white #fff; --border-dark #00000024; --fill-tsp-gray-dark #37352f14; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373 | = |
| How | at rest | mouse hover |

Crops: `grid-card-default.png`, `grid-card-hover.png`, `grid-card-light.png`, `grid-card-light-hover.png`.

#### grid-card-thumb

Grid card thumbnail area.

Snapshot: `library-dark-images-grid`. Finder: `() => { const c = CK(T('dealer_flow', M()), 'rounded-[12px]'); return [...c.children].sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0]; }`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 320.66 x 200.41 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| Ancestor paint | 1 up div.clickable.relative.flex bg #242424 |
| Tokens | --fill-tsp-gray-dark #0000004d |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 320.66 x 200.41 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Cursor | pointer |
| Ancestor paint | 1 up div.clickable.relative.flex bg #ffffff |
| Tokens | --fill-tsp-gray-dark #37352f14 |
| How | at rest |

Crops: `grid-card-thumb-default.png`, `grid-card-thumb-light.png`.

#### grid-card-title

Grid card name and extension.

Snapshot: `library-dark-images-grid`. Finder: `() => T('dealer_flow', M()).parentElement`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 74.69 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span: -apple-system 14px/20px 400, #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 74.69 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span: -apple-system 14px/20px 400, #1a1a1a |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Crops: `grid-card-title-default.png`, `grid-card-title-light.png`.

#### task-group-heading

Group-by-task heading. The task name as a 16/22 500 link (underline on hover) with its date at the end.

Snapshot: `library-dark-images-grid-by-task`. Finder: `() => Q('a[href*="/app/"]', 0, M()).parentElement`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 1000 x 34 |
| Padding | 12px 0px 0px 0px |
| Gap | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | a.min-w-0.truncate.font-medium: -apple-system 16px/22px 500, #e6e6e6 |
| Transition | none |
| Tokens | --text-primary #e6e6e6; --text-secondary #b3b3b3 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 1000 x 34 |
| Padding | 12px 0px 0px 0px |
| Gap | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | a.min-w-0.truncate.font-medium: -apple-system 16px/22px 500, #1a1a1a |
| Transition | none |
| Tokens | --text-primary #1a1a1a; --text-secondary #4d4d4d |
| How | at rest |

Crops: `task-group-heading-default.png`, `task-group-heading-light.png`.

#### task-group-link

Group-by-task heading link.

Snapshot: `library-dark-images-grid-by-task`. Finder: `() => Q('a[href*="/app/"]', 0, M())`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 96.56 x 22 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/22px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Tokens | --text-primary #e6e6e6 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 96.56 x 22 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/22px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Tokens | --text-primary #1a1a1a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `task-group-link-default.png`, `task-group-link-hover.png`, `task-group-link-focus-visible.png`, `task-group-link-light.png`, `task-group-link-light-hover.png`, `task-group-link-light-focus-visible.png`.

### Document previewer

#### previewer

Document previewer. 1200x820 at 1440 (inset 120/40), --background-gray-main, over --background-dialog-mask with a 4px blur.

Snapshot: `library-dark-preview-doc`. Finder: `() => H(T('Last modified: May 3'), 800)`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 1200 x 820 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #1a1a1a |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 0px 8px 0px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.min-w-0.truncate: -apple-system 16px/22px 500, #e6e6e6, ls -0.31px |
| Transition | none |
| Icon | 14 x 14, colour #8c8c8c, stroke #8c8c8c 1.5px |
| Painted layers | div.overflow-hidden.overscroll-x-contain.flex 1200.0x820.0 bg #1a1a1a shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 0px 8px 0px; div.flex.shrink-0.items-center 1200.0x48.0 bg #1a1a1a border B:1px solid #ffffff @ 0.06; div.w-px 1.0x16.0 bg #ffffff @ 0.12; div.overflow-auto.overscroll-x-contain.relative 1200.0x772.0 bg #1a1a1a; div.w-full 712.0x1.0 bg #ffffff @ 0.06; div.w-full 712.0x1.0 bg #ffffff @ 0.06 |
| Tokens | --background-gray-main #1a1a1a; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3; --text-primary #e6e6e6; --text-secondary #b3b3b3; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 1200 x 820 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #f8f8f7 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 0px 8px 0px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.min-w-0.truncate: -apple-system 16px/22px 500, #1a1a1a, ls -0.31px |
| Transition | none |
| Icon | 14 x 14, colour #737373, stroke #737373 1.5px |
| Painted layers | div.overflow-hidden.overscroll-x-contain.flex 1200.0x820.0 bg #f8f8f7 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 0px 8px 0px; div.flex.shrink-0.items-center 1200.0x48.0 bg #f8f8f7 border B:1px solid #000000 @ 0.06; div.w-px 1.0x16.0 bg #000000 @ 0.14; div.overflow-auto.overscroll-x-contain.relative 1200.0x772.0 bg #f8f8f7; div.w-full 712.0x1.0 bg #000000 @ 0.06; div.w-full 712.0x1.0 bg #000000 @ 0.06 |
| Tokens | --background-gray-main #f8f8f7; --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d; --text-primary #1a1a1a; --text-secondary #4d4d4d; --text-tertiary #737373 |
| How | at rest |

Crops: `previewer-default.png`, `previewer-light.png`.

#### previewer-header

Previewer header.

Snapshot: `library-dark-preview-doc`. Finder: `() => CK(T('Last modified: May 3'), 'h-[48px]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 1200 x 48 |
| Padding | 6px 12px 6px 20px |
| Gap | 8px |
| Border | T: none; R: none; B: 1px solid #ffffff @ 0.06; L: none |
| Radius | 0px |
| Background | #1a1a1a |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.min-w-0.truncate: -apple-system 16px/22px 500, #e6e6e6, ls -0.31px |
| Transition | none |
| Icon | 14 x 14, colour #8c8c8c, stroke #8c8c8c 1.5px |
| Painted layers | div.flex.shrink-0.items-center 1200.0x48.0 bg #1a1a1a border B:1px solid #ffffff @ 0.06; div.w-px 1.0x16.0 bg #ffffff @ 0.12 |
| Ancestor paint | 1 up div.overflow-hidden.overscroll-x-contain.flex bg #1a1a1a shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 0px 8px 0px |
| Tokens | --background-gray-main #1a1a1a; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3; --text-primary #e6e6e6; --text-secondary #b3b3b3; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 1200 x 48 |
| Padding | 6px 12px 6px 20px |
| Gap | 8px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0.06; L: none |
| Radius | 0px |
| Background | #f8f8f7 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.min-w-0.truncate: -apple-system 16px/22px 500, #1a1a1a, ls -0.31px |
| Transition | none |
| Icon | 14 x 14, colour #737373, stroke #737373 1.5px |
| Painted layers | div.flex.shrink-0.items-center 1200.0x48.0 bg #f8f8f7 border B:1px solid #000000 @ 0.06; div.w-px 1.0x16.0 bg #000000 @ 0.14 |
| Ancestor paint | 1 up div.overflow-hidden.overscroll-x-contain.flex bg #f8f8f7 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 0px 8px 0px |
| Tokens | --background-gray-main #f8f8f7; --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d; --text-primary #1a1a1a; --text-secondary #4d4d4d; --text-tertiary #737373 |
| How | at rest |

Crops: `previewer-header-default.png`, `previewer-header-light.png`.

#### previewer-title

Previewer title.

Snapshot: `library-dark-preview-doc`. Finder: `() => TS('Competitor Deep Dive', CK(T('Last modified: May 3'), 'h-[48px]'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 542.88 x 22 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/22px 500 |
| Letter spacing | -0.31px |
| Colour | #e6e6e6 |
| Transition | none |
| Tokens | --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 542.88 x 22 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/22px 500 |
| Letter spacing | -0.31px |
| Colour | #1a1a1a |
| Transition | none |
| Tokens | --text-primary #1a1a1a |
| How | at rest |

Crops: `previewer-title-default.png`, `previewer-title-light.png`.

#### previewer-meta

Previewer last-modified line.

Snapshot: `library-dark-preview-doc`. Finder: `() => T('Last modified: May 3')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 118.03 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 118.03 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | none |
| How | at rest |

Crops: `previewer-meta-default.png`, `previewer-meta-light.png`.

#### previewer-tool

Previewer toolbar icon button.

Snapshot: `library-dark-preview-doc`. Finder: `() => K('size-[28px] rounded-[8px]', 0, CK(T('Last modified: May 3'), 'h-[48px]'))`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 28 x 28 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #b3b3b3 | = |
| Tokens | --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3 | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 28.0x28.0 bg #ffffff @ 0.06 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 28 x 28 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #4d4d4d | = |
| Tokens | --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 28.0x28.0 bg #37352f @ 0.06 r 8px |

Crops: `previewer-tool-default.png`, `previewer-tool-hover.png`, `previewer-tool-light.png`, `previewer-tool-light-hover.png`.

#### previewer-body

Previewer document column. 712 wide, centred in the scroll area.

Snapshot: `library-dark-preview-doc`. Finder: `() => Q('[role=textbox][contenteditable=true]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 712 x 3058.89 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span: LibreBaskerville 30px/39px 600, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #8c8c8c, stroke #8c8c8c 2px |
| Painted layers | div.w-full 712.0x1.0 bg #ffffff @ 0.06; div.w-full 712.0x1.0 bg #ffffff @ 0.06; div.w-full 712.0x1.0 bg #ffffff @ 0.06 |
| Tokens | --border-main #ffffff0f |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 712 x 3058.89 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span: LibreBaskerville 30px/39px 600, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #737373, stroke #737373 2px |
| Painted layers | div.w-full 712.0x1.0 bg #000000 @ 0.06; div.w-full 712.0x1.0 bg #000000 @ 0.06; div.w-full 712.0x1.0 bg #000000 @ 0.06 |
| Tokens | --border-main #0000000f |
| How | at rest |

Crops: `previewer-body-default.png`, `previewer-body-light.png`.

#### doc-h1

Document h1.

Snapshot: `library-dark-preview-doc`. Finder: `() => Q('[role=textbox] h1')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 712 x 84 |
| Padding | 3px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | LibreBaskerville 30px/39px 600 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span: LibreBaskerville 30px/39px 600, #e6e6e6 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 712 x 84 |
| Padding | 3px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | LibreBaskerville 30px/39px 600 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span: LibreBaskerville 30px/39px 600, #1a1a1a |
| Transition | none |
| How | at rest |

Crops: `doc-h1-default.png`, `doc-h1-light.png`.

#### doc-h2

Document h2.

Snapshot: `library-dark-preview-doc`. Finder: `() => Q('[role=textbox] h2')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 712 x 37.19 |
| Padding | 3px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 24px/31.2px 600 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span: -apple-system 24px/31.2px 600, #e6e6e6 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 712 x 37.19 |
| Padding | 3px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 24px/31.2px 600 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span: -apple-system 24px/31.2px 600, #1a1a1a |
| Transition | none |
| How | at rest |

Crops: `doc-h2-default.png`, `doc-h2-light.png`.

#### doc-h3

Document h3.

Snapshot: `library-dark-preview-doc`. Finder: `() => Q('[role=textbox] h3')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 712 x 32 |
| Padding | 3px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 20px/26px 600 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span: -apple-system 20px/26px 600, #e6e6e6 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 712 x 32 |
| Padding | 3px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 20px/26px 600 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span: -apple-system 20px/26px 600, #1a1a1a |
| Transition | none |
| How | at rest |

Crops: `doc-h3-default.png`, `doc-h3-light.png`.

#### doc-paragraph

Document paragraph.

Snapshot: `library-dark-preview-doc`. Finder: `() => C(TS('This report provides', Q('[role=textbox]')), 'p, div')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 712 x 54 |
| Padding | 3px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span: -apple-system 16px/24px 400, #e6e6e6 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 712 x 54 |
| Padding | 3px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span: -apple-system 16px/24px 400, #1a1a1a |
| Transition | none |
| How | at rest |

Crops: `doc-paragraph-default.png`, `doc-paragraph-light.png`.

#### doc-bullet

Document bullet.

Snapshot: `library-dark-preview-doc`. Finder: `() => Q('[role=textbox] .li-decorator')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 24 x 30 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.font-sans.font-normal: ui-sans-serif 24px/36px 400, #e6e6e6 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 24 x 30 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.font-sans.font-normal: ui-sans-serif 24px/36px 400, #1a1a1a |
| Transition | none |
| How | at rest |

Crops: `doc-bullet-default.png`, `doc-bullet-light.png`.

#### doc-rule

Document horizontal rule.

Snapshot: `library-dark-preview-doc`. Finder: `() => K('w-full h-[1px]', 0, Q('[role=textbox]'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 712 x 1 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #ffffff @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Painted layers | div.w-full 712.0x1.0 bg #ffffff @ 0.06 |
| Tokens | --border-main #ffffff0f |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 712 x 1 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #000000 @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Painted layers | div.w-full 712.0x1.0 bg #000000 @ 0.06 |
| Tokens | --border-main #0000000f |
| How | at rest |

Crops: `doc-rule-default.png`, `doc-rule-light.png`.

### Settings

#### settings-dialog

Settings dialog. 1152x810 at 1440, radius 16, shadow-menu; a 221 nav column with a right rule, the content column scrolls.

Snapshot: `settings-dark-general`. Finder: `() => D()`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 1152 x 810 |
| Padding | 0px |
| Border | none |
| Radius | 16px |
| Background | #1a1a1a |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Outline | 2px solid #000000 @ 0 offset 2px |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/18px 600, #e6e6e6 |
| Transition | none |
| Icon | 20 x 20, colour #8c8c8c, stroke #8c8c8c 2px |
| Placeholder | "Search" #595959, opacity 1, 14px |
| Painted layers | div.@container/dialog.outline-none.shadow-menu 1152.0x810.0 bg #1a1a1a r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px outline 2px solid #000000 @ 0 offset 2px; div.overflow-x-auto.pb-2.relative 221.0x810.0 border R:1px solid #ffffff @ 0.06; div.animate-pulse.w-full.h-8 180.0x32.0 bg #000000 @ 0.2 r 4px; div.relative.flex.items-center 32.0x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px; div.w-full.h-full.object-cover 30.0x30.0 bg #ffffff @ 0.08; div.flex.h-8.items-center 196.0x32.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px |
| Tokens | --Button-border-secondary #ffffff1f; --background-gray-main #1a1a1a; --border-input-active #ffffff52; --border-main #ffffff0f; --dlg-enter-scale 1; --dlg-enter-y 0px; --fill-tsp-gray-main #0003; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 1152 x 810 |
| Padding | 0px |
| Border | none |
| Radius | 16px |
| Background | #f8f8f7 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Outline | 2px solid #000000 @ 0 offset 2px |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/18px 600, #1a1a1a |
| Transition | none |
| Icon | 20 x 20, colour #737373, stroke #737373 2px |
| Placeholder | "Search" #a6a6a6, opacity 1, 14px |
| Painted layers | div.@container/dialog.outline-none.shadow-menu 1152.0x810.0 bg #f8f8f7 r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px outline 2px solid #000000 @ 0 offset 2px; div.overflow-x-auto.pb-2.relative 221.0x810.0 border R:1px solid #000000 @ 0.06; div.animate-pulse.w-full.h-8 180.0x32.0 bg #37352f @ 0.04 r 4px; div.relative.flex.items-center 32.0x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px; div.w-full.h-full.object-cover 30.0x30.0 bg #37352f @ 0.08; div.flex.h-8.items-center 196.0x32.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px |
| Tokens | --Button-border-secondary #0000001f; --background-gray-main #f8f8f7; --border-input-active #0000004d; --border-main #0000000f; --dlg-enter-scale 1; --dlg-enter-y 0px; --fill-tsp-gray-main #37352f0a; --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d |
| How | at rest |

Crops: `settings-dialog-default.png`, `settings-dialog-light.png`.

#### settings-close

Settings close button.

Snapshot: `settings-dark-general`. Finder: `() => K('h-7 w-7 cursor-pointer', 0, D())`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 28 x 28 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #8c8c8c, stroke #8c8c8c 2px | = |
| Ancestor paint | 2 up div.@container/dialog.outline-none.shadow-menu bg #1a1a1a shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px outline 2px solid #000000 @ 0 | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-tertiary #8c8c8c | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.h-7.w-7 28.0x28.0 bg #ffffff @ 0.04 r 6px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 28 x 28 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #737373, stroke #737373 2px | = |
| Ancestor paint | 2 up div.@container/dialog.outline-none.shadow-menu bg #f8f8f7 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px outline 2px solid #000000 @ 0 | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-tertiary #737373 | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.h-7.w-7 28.0x28.0 bg #37352f @ 0.04 r 6px |

Crops: `settings-close-default.png`, `settings-close-hover.png`, `settings-close-light.png`, `settings-close-light-hover.png`.

#### settings-account

Settings account header.

Snapshot: `settings-dark-general`. Finder: `() => W(T('Personal', D()), 180)`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 180 x 36 | = |
| Padding | 0px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/18px 600, #e6e6e6 | = |
| Transition | opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1) delay 0.15s | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #b3b3b3, stroke #b3b3b3 2px | = |
| Painted layers | div.relative.flex.items-center 32.0x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px; div.w-full.h-full.object-cover 30.0x30.0 bg #ffffff @ 0.08 | div.relative.flex.items-center 32.0x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px; div.w-full.h-full.object-cover 30.0x30.0 bg #ffffff @ 0.08; div.p-1.flex-shrink-0 24.0x24.0 bg #ffffff @ 0.04 r 6px |
| Tokens | --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 180 x 36 | = |
| Padding | 0px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.w-full.h-full.object-cover: -apple-system 12px/18px 600, #1a1a1a | = |
| Transition | opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1) delay 0.15s | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #4d4d4d, stroke #4d4d4d 2px | = |
| Painted layers | div.relative.flex.items-center 32.0x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px; div.w-full.h-full.object-cover 30.0x30.0 bg #37352f @ 0.08 | div.relative.flex.items-center 32.0x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px; div.w-full.h-full.object-cover 30.0x30.0 bg #37352f @ 0.08; div.p-1.flex-shrink-0 24.0x24.0 bg #37352f @ 0.04 r 6px |
| Tokens | --border-main #0000000f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373 | = |
| How | at rest | mouse hover |

Crops: `settings-account-default.png`, `settings-account-hover.png`, `settings-account-light.png`, `settings-account-light-hover.png`.

#### settings-search

Settings search field.

Snapshot: `settings-dark-general`. Finder: `() => C(Q('input[placeholder=Search]', 0, D()), 'div')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 196 x 32 | = | = |
| Padding | 0px 8px 0px 11px | = | = |
| Gap | 8px | = | = |
| Border | 1px solid #ffffff @ 0.12 | = | 1px solid #ffffff @ 0.32 |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Transition | none | = | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #b3b3b3 2px | = | = |
| Placeholder | "Search" #595959, opacity 1, 14px | = | = |
| Painted layers | div.flex.h-8.items-center 196.0x32.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px; input.min-w-0.flex-1.bg-transparent 151.0x20.0 outline 2px solid #000000 @ 0 offset 2px | = | div.flex.h-8.items-center 196.0x32.0 border T:1px solid #ffffff @ 0.32 / R:1px solid #ffffff @ 0.32 / B:1px solid #ffffff @ 0.32 / L:1px solid #ffffff @ 0.32 r 8px; input.min-w-0.flex-1.bg-transparent 151.0x20.0 outline 2px solid #000000 @ 0 offset 2px |
| Tokens | --Button-border-secondary #ffffff1f; --border-input-active #ffffff52; --text-disable #595959; --text-primary #e6e6e6 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 196 x 32 | = | = |
| Padding | 0px 8px 0px 11px | = | = |
| Gap | 8px | = | = |
| Border | 1px solid #000000 @ 0.12 | = | 1px solid #000000 @ 0.3 |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Transition | none | = | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #4d4d4d 2px | = | = |
| Placeholder | "Search" #a6a6a6, opacity 1, 14px | = | = |
| Painted layers | div.flex.h-8.items-center 196.0x32.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px; input.min-w-0.flex-1.bg-transparent 151.0x20.0 outline 2px solid #000000 @ 0 offset 2px | = | div.flex.h-8.items-center 196.0x32.0 border T:1px solid #000000 @ 0.3 / R:1px solid #000000 @ 0.3 / B:1px solid #000000 @ 0.3 / L:1px solid #000000 @ 0.3 r 8px; input.min-w-0.flex-1.bg-transparent 151.0x20.0 outline 2px solid #000000 @ 0 offset 2px |
| Tokens | --Button-border-secondary #0000001f; --border-input-active #0000004d; --text-disable #a6a6a6; --text-primary #1a1a1a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Crops: `settings-search-default.png`, `settings-search-hover.png`, `settings-search-focus-visible.png`, `settings-search-light.png`, `settings-search-light-hover.png`, `settings-search-light-focus-visible.png`.

#### settings-nav-label

Settings nav section label.

Snapshot: `settings-dark-general`. Finder: `() => K('hidden md:block', 0, D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 75.97 x 34 |
| Padding | 12px 12px 4px 14px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | none |
| Tokens | --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 75.97 x 34 |
| Padding | 12px 12px 4px 14px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | none |
| Tokens | --text-tertiary #737373 |
| How | at rest |

Crops: `settings-nav-label-default.png`, `settings-nav-label-light.png`.

#### settings-nav-item

Settings nav item.

Snapshot: `settings-dark-general`. Finder: `() => C(T('Account', D()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible | active | active-hover |
|---|---|---|---|---|---|
| Size (w x h) | 196 x 32 | = | = | = | = |
| Padding | 8px 16px 8px 14px | = | = | = | = |
| Gap | 8px | = | = | = | = |
| Border | none | = | = | = | = |
| Radius | 8px | = | = | = | = |
| Background | transparent | #ffffff @ 0.04 | = | #ffffff @ 0.06 | #ffffff @ 0.06 |
| Box shadow | none | = | = | = | = |
| Outline | none | = | = | = | = |
| Font | -apple-system 14px/20px 400 | = | = | -apple-system 14px/20px 500 | -apple-system 14px/20px 500 |
| Letter spacing | normal | = | = | = | = |
| Colour | #e6e6e6 | = | = | = | = |
| Text node | span.truncate: -apple-system 14px/20px 400, #e6e6e6 | = | = | span.truncate: -apple-system 14px/20px 500, #e6e6e6 | span.truncate: -apple-system 14px/20px 500, #e6e6e6 |
| Transition | none | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 16 x 16, colour #b3b3b3, stroke #b3b3b3 2px | = | = | 16 x 16, colour #e6e6e6, stroke #e6e6e6 2px | 16 x 16, colour #e6e6e6, stroke #e6e6e6 2px |
| Tokens | --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3; --text-primary #e6e6e6; --ui-density-row-gap 8px; --ui-density-small-radius 8px; --ui-density-small-row-height 32px; --ui-font-size-sm 14px; --ui-line-height-sm 20px | = | = | --Button-black #fffffff2; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-main #ffffff0f; --icon-primary #e6e6e6; --text-primary #e6e6e6; --ui-density-row-gap 8px; --ui-density-small-radius 8px; --ui-density-small-row-height 32px; --ui-font-size-sm 14px; --ui-line-height-sm 20px | --Button-black #fffffff2; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-main #ffffff0f; --icon-primary #e6e6e6; --text-primary #e6e6e6; --ui-density-row-gap 8px; --ui-density-small-radius 8px; --ui-density-small-row-height 32px; --ui-font-size-sm 14px; --ui-line-height-sm 20px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured active | mouse hover |
| Painted layers | - | button.flex.py-2.items-center 196.0x32.0 bg #ffffff @ 0.04 r 8px | = | button.flex.py-2.items-center 196.0x32.0 bg #ffffff @ 0.06 r 8px | button.flex.py-2.items-center 196.0x32.0 bg #ffffff @ 0.06 r 8px |

Light theme.

| Property | light | light-hover | light-focus-visible | light-active | light-active-hover |
|---|---|---|---|---|---|
| Size (w x h) | 196 x 32 | = | = | = | = |
| Padding | 8px 16px 8px 14px | = | = | = | = |
| Gap | 8px | = | = | = | = |
| Border | none | = | = | = | = |
| Radius | 8px | = | = | = | = |
| Background | transparent | #37352f @ 0.04 | = | #37352f @ 0.06 | #37352f @ 0.06 |
| Box shadow | none | = | = | = | = |
| Outline | none | = | = | = | = |
| Font | -apple-system 14px/20px 400 | = | = | -apple-system 14px/20px 500 | -apple-system 14px/20px 500 |
| Letter spacing | normal | = | = | = | = |
| Colour | #1a1a1a | = | = | = | = |
| Text node | span.truncate: -apple-system 14px/20px 400, #1a1a1a | = | = | span.truncate: -apple-system 14px/20px 500, #1a1a1a | span.truncate: -apple-system 14px/20px 500, #1a1a1a |
| Transition | none | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 16 x 16, colour #4d4d4d, stroke #4d4d4d 2px | = | = | 16 x 16, colour #1a1a1a, stroke #1a1a1a 2px | 16 x 16, colour #1a1a1a, stroke #1a1a1a 2px |
| Tokens | --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d; --text-primary #1a1a1a; --ui-density-row-gap 8px; --ui-density-small-radius 8px; --ui-density-small-row-height 32px; --ui-font-size-sm 14px; --ui-line-height-sm 20px | = | = | --Button-black #1a1a19; --fill-tsp-white-dark #37352f14; --fill-tsp-white-main #37352f0f; --icon-primary #1a1a1a; --text-primary #1a1a1a; --ui-density-row-gap 8px; --ui-density-small-radius 8px; --ui-density-small-row-height 32px; --ui-font-size-sm 14px; --ui-line-height-sm 20px | --Button-black #1a1a19; --fill-tsp-white-dark #37352f14; --fill-tsp-white-main #37352f0f; --icon-primary #1a1a1a; --text-primary #1a1a1a; --ui-density-row-gap 8px; --ui-density-small-radius 8px; --ui-density-small-row-height 32px; --ui-font-size-sm 14px; --ui-line-height-sm 20px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured active | mouse hover |
| Painted layers | - | button.flex.py-2.items-center 196.0x32.0 bg #37352f @ 0.04 r 8px | = | button.flex.py-2.items-center 196.0x32.0 bg #37352f @ 0.06 r 8px | button.flex.py-2.items-center 196.0x32.0 bg #37352f @ 0.06 r 8px |

Other finders: active: `() => C(T('General', D()), 'button')`; active-hover: `() => C(T('General', D()), 'button')`; light-active: `() => C(T('General', D()), 'button')`; light-active-hover: `() => C(T('General', D()), 'button')`.

Crops: `settings-nav-item-default.png`, `settings-nav-item-hover.png`, `settings-nav-item-focus-visible.png`, `settings-nav-item-active.png`, `settings-nav-item-active-hover.png`, `settings-nav-item-light.png`, `settings-nav-item-light-hover.png`, `settings-nav-item-light-focus-visible.png`, `settings-nav-item-light-active.png`, `settings-nav-item-light-active-hover.png`.

#### settings-title

Settings page title.

Snapshot: `settings-dark-general`. Finder: `() => Q('h1', 0, D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 30 |
| Padding | 0px |
| Gap | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 24px/30px 500 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Tokens | --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 30 |
| Padding | 0px |
| Gap | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 24px/30px 500 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Tokens | --text-primary #1a1a1a |
| How | at rest |

Crops: `settings-title-default.png`, `settings-title-light.png`.

#### settings-section-title

Settings section title.

Snapshot: `settings-dark-general`. Finder: `() => T('Appearance', D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 22 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/22px 500 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Tokens | --text-primary #e6e6e6; --ui-font-size-title-base 16px; --ui-line-height-title-base 22px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 22 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/22px 500 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Tokens | --text-primary #1a1a1a; --ui-font-size-title-base 16px; --ui-line-height-title-base 22px |
| How | at rest |

Crops: `settings-section-title-default.png`, `settings-section-title-light.png`.

#### settings-field-label

Settings field label.

Snapshot: `settings-dark-general`. Finder: `() => T('Language', D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| How | at rest |

Crops: `settings-field-label-default.png`, `settings-field-label-light.png`.

#### language-select

Language select.

Snapshot: `settings-dark-general`. Finder: `() => C(T('English', D()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 208 x 36 | = | = |
| Padding | 0px 12px | = | = |
| Border | 1px solid #000000 @ 0.08 | = | = |
| Radius | 8px | = | = |
| Background | #ffffff @ 0.04 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span.text-sm: -apple-system 14px/20px 400, #e6e6e6 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #e6e6e6 2px | = | = |
| Painted layers | button.h-9.px-3.rounded-lg 208.0x36.0 bg #ffffff @ 0.04 border T:1px solid #000000 @ 0.08 / R:1px solid #000000 @ 0.08 / B:1px solid #000000 @ 0.08 / L:1px solid #000000 @ 0.08 r 8px | = | = |
| Tokens | --border-white #00000014; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 208 x 36 | = | = |
| Padding | 0px 12px | = | = |
| Border | 1px solid #ffffff @ 0.2 | = | = |
| Radius | 8px | = | = |
| Background | #37352f @ 0.04 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span.text-sm: -apple-system 14px/20px 400, #1a1a1a | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #1a1a1a 2px | = | = |
| Painted layers | button.h-9.px-3.rounded-lg 208.0x36.0 bg #37352f @ 0.04 border T:1px solid #ffffff @ 0.2 / R:1px solid #ffffff @ 0.2 / B:1px solid #ffffff @ 0.2 / L:1px solid #ffffff @ 0.2 r 8px | = | = |
| Tokens | --border-white #fff3; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `language-select-default.png`, `language-select-hover.png`, `language-select-focus-visible.png`, `language-select-light.png`, `language-select-light-hover.png`, `language-select-light-focus-visible.png`.

#### theme-card

Theme option card. 110x62 with a small preview glyph over the label.

Snapshot: `settings-dark-general`. Finder: `() => C(T('Light', D()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible | selected |
|---|---|---|---|---|
| Size (w x h) | 110 x 62 | = | = | = |
| Padding | 12px 8px 8px 8px | = | = | = |
| Border | 1px solid #ffffff @ 0.12 | = | = | 1px solid #ffffff @ 0.95 |
| Radius | 10px | = | = | = |
| Background | transparent | #ffffff @ 0.04 | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/24px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #b3b3b3 | #e6e6e6 | = | #e6e6e6 |
| Text node | span.font-medium: -apple-system 14px/20px 500, #b3b3b3 | span.font-medium: -apple-system 14px/20px 500, #e6e6e6 | = | span.font-medium: -apple-system 14px/20px 500, #e6e6e6 |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 18 x 18, colour #b3b3b3, stroke #b3b3b3 2px | 18 x 18, colour #e6e6e6, stroke #e6e6e6 2px | = | 18 x 18, colour #e6e6e6, stroke #e6e6e6 2px |
| Painted layers | button.clickable.flex.flex-col 110.0x62.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 10px | button.clickable.flex.flex-col 110.0x62.0 bg #ffffff @ 0.04 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 10px | = | button.clickable.flex.flex-col 110.0x62.0 border T:1px solid #ffffff @ 0.95 / R:1px solid #ffffff @ 0.95 / B:1px solid #ffffff @ 0.95 / L:1px solid #ffffff @ 0.95 r 10px |
| Tokens | --Button-border-secondary #ffffff1f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --text-secondary #b3b3b3; --ui-density-content-padding 12px; --ui-density-outer-padding 8px; --ui-density-row-radius 10px; --ui-density-small-row-height 32px; --ui-font-size-sm 14px | = | = | --Button-black #fffffff2; --text-primary #e6e6e6; --ui-density-content-padding 12px; --ui-density-outer-padding 8px; --ui-density-row-radius 10px; --ui-density-small-row-height 32px; --ui-font-size-sm 14px; --ui-line-height-sm 20px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured selected |

Light theme.

| Property | light | light-hover | light-focus-visible | light-selected |
|---|---|---|---|---|
| Size (w x h) | 110 x 62 | = | = | = |
| Padding | 12px 8px 8px 8px | = | = | = |
| Border | 1px solid #000000 @ 0.12 | = | = | 1px solid #1a1a19 |
| Radius | 10px | = | = | = |
| Background | transparent | #37352f @ 0.04 | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system 16px/24px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #4d4d4d | #1a1a1a | = | #1a1a1a |
| Text node | span.font-medium: -apple-system 14px/20px 500, #4d4d4d | span.font-medium: -apple-system 14px/20px 500, #1a1a1a | = | span.font-medium: -apple-system 14px/20px 500, #1a1a1a |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 18 x 18, colour #4d4d4d, stroke #4d4d4d 2px | 18 x 18, colour #1a1a1a, stroke #1a1a1a 2px | = | 18 x 18, colour #1a1a1a, stroke #1a1a1a 2px |
| Painted layers | button.clickable.flex.flex-col 110.0x62.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 10px | button.clickable.flex.flex-col 110.0x62.0 bg #37352f @ 0.04 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 10px | = | button.clickable.flex.flex-col 110.0x62.0 border T:1px solid #1a1a19 / R:1px solid #1a1a19 / B:1px solid #1a1a19 / L:1px solid #1a1a19 r 10px |
| Tokens | --Button-border-secondary #0000001f; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --text-secondary #4d4d4d; --ui-density-content-padding 12px; --ui-density-outer-padding 8px; --ui-density-row-radius 10px; --ui-density-small-row-height 32px; --ui-font-size-sm 14px | = | = | --Button-black #1a1a19; --text-primary #1a1a1a; --ui-density-content-padding 12px; --ui-density-outer-padding 8px; --ui-density-row-radius 10px; --ui-density-small-row-height 32px; --ui-font-size-sm 14px; --ui-line-height-sm 20px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured selected |

Other finders: selected: `() => C(T('Auto', D()), 'button')`; light-selected: `() => C(T('Auto', D()), 'button')`.

Crops: `theme-card-default.png`, `theme-card-hover.png`, `theme-card-focus-visible.png`, `theme-card-selected.png`, `theme-card-light.png`, `theme-card-light-hover.png`, `theme-card-light-focus-visible.png`, `theme-card-light-selected.png`.

#### settings-select

Settings inline select (Send without interrupting).

Snapshot: `settings-dark-general`. Finder: `() => CK(T('Send without interrupting', D()), 'clickable')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 230 x 36 | = |
| Padding | 0px 0px 0px 12px | = |
| Gap | 8px | = |
| Border | 1px solid #000000 @ 0 | = |
| Radius | 10px | = |
| Background | #ffffff @ 0.04 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.flex-1: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #8c8c8c 2px | = |
| Painted layers | div.flex.items-center.clickable 230.0x36.0 bg #ffffff @ 0.04 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 10px | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --ui-density-content-padding 12px; --ui-density-row-gap 8px; --ui-density-row-radius 10px; --ui-density-small-row-height 32px; --ui-font-size-sm 14px; --ui-line-height-sm 20px | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 230 x 36 | = |
| Padding | 0px 0px 0px 12px | = |
| Gap | 8px | = |
| Border | 1px solid #000000 @ 0 | = |
| Radius | 10px | = |
| Background | #37352f @ 0.04 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.flex-1: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #737373 2px | = |
| Painted layers | div.flex.items-center.clickable 230.0x36.0 bg #37352f @ 0.04 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 10px | = |
| Tokens | --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --ui-density-content-padding 12px; --ui-density-row-gap 8px; --ui-density-row-radius 10px; --ui-density-small-row-height 32px; --ui-font-size-sm 14px; --ui-line-height-sm 20px | = |
| How | at rest | mouse hover |

Crops: `settings-select-default.png`, `settings-select-hover.png`, `settings-select-light.png`, `settings-select-light-hover.png`.

#### settings-row-title

Settings row title.

Snapshot: `settings-dark-general`. Finder: `() => T('Browser notifications', D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 139.59 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 500 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Tokens | --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 139.59 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 500 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Tokens | --text-primary #1a1a1a |
| How | at rest |

Crops: `settings-row-title-default.png`, `settings-row-title-light.png`.

#### settings-row-desc

Settings row description.

Snapshot: `settings-dark-general`. Finder: `() => TS('Get notified in your browser', D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 726 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | none |
| Tokens | --text-tertiary #8c8c8c; --ui-font-size-label 13px; --ui-line-height-label 18px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 726 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | none |
| Tokens | --text-tertiary #737373; --ui-font-size-label 13px; --ui-line-height-label 18px |
| How | at rest |

Crops: `settings-row-desc-default.png`, `settings-row-desc-light.png`.

#### toggle

Toggle switch. 26x16 track, a 14px white knob that slides 10px; off --icon-disable, on --icon-blue.

Snapshot: `settings-dark-general`. Finder: `() => Q('[role=switch]', 0, D())`.

Dark theme.

| Property | default | hover | focus-visible | on | disabled |
|---|---|---|---|---|---|
| Size (w x h) | 26 x 16 | = | = | = | = |
| Padding | 0px | = | = | = | = |
| Gap | 8px | = | = | = | = |
| Border | none | = | = | = | = |
| Radius | 0px | = | = | = | = |
| Background | transparent | = | = | = | = |
| Box shadow | none | = | = | = | = |
| Outline | none | = | = | = | = |
| Font | -apple-system 16px/24px 400 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #e6e6e6 | = | = | = | = |
| Transition | none | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Painted layers | div.transition-colors 26.0x16.0 bg #595959 r 16px; span.block.pointer-events-none.rounded-full 14.0x14.0 bg #ffffff r 9999px | = | = | div.transition-colors 26.0x16.0 bg #1a93fe r 16px; span.block.pointer-events-none.rounded-full 14.0x14.0 bg #ffffff r 9999px | div.transition-colors.opacity-50.cursor-not-allowed 26.0x16.0 bg #595959 r 16px opacity 0.5; span.block.pointer-events-none.rounded-full 14.0x14.0 bg #ffffff r 9999px |
| Tokens | --icon-disable #595959; --icon-white #fff | = | = | --icon-blue #1a93fe; --icon-white #fff | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured on | at rest, captured disabled |

Light theme.

| Property | light | light-hover | light-focus-visible | light-on | light-disabled |
|---|---|---|---|---|---|
| Size (w x h) | 26 x 16 | = | = | = | = |
| Padding | 0px | = | = | = | = |
| Gap | 8px | = | = | = | = |
| Border | none | = | = | = | = |
| Radius | 0px | = | = | = | = |
| Background | transparent | = | = | = | = |
| Box shadow | none | = | = | = | = |
| Outline | none | = | = | = | = |
| Font | -apple-system 16px/24px 400 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #1a1a1a | = | = | = | = |
| Transition | none | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Painted layers | div.transition-colors 26.0x16.0 bg #a6a6a6 r 16px; span.block.pointer-events-none.rounded-full 14.0x14.0 bg #ffffff r 9999px | = | = | div.transition-colors 26.0x16.0 bg #0081f2 r 16px; span.block.pointer-events-none.rounded-full 14.0x14.0 bg #ffffff r 9999px | div.transition-colors.opacity-50.cursor-not-allowed 26.0x16.0 bg #a6a6a6 r 16px opacity 0.5; span.block.pointer-events-none.rounded-full 14.0x14.0 bg #ffffff r 9999px |
| Tokens | --icon-disable #a6a6a6; --icon-white #fff | = | = | --icon-blue #0081f2; --icon-white #fff | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured on | at rest, captured disabled |

Other finders: on: `() => Q('[role=switch]', 2, D())`; disabled: `() => Q('[role=switch]', 1, D())`; light-on: `() => Q('[role=switch]', 2, D())`; light-disabled: `() => Q('[role=switch]', 1, D())`.

Crops: `toggle-default.png`, `toggle-hover.png`, `toggle-focus-visible.png`, `toggle-on.png`, `toggle-disabled.png`, `toggle-light.png`, `toggle-light-hover.png`, `toggle-light-focus-visible.png`, `toggle-light-on.png`, `toggle-light-disabled.png`.

#### settings-rule

Settings section rule.

Snapshot: `settings-dark-general`. Finder: `() => K('w-full h-[1px]', 0, D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 1 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #ffffff @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Painted layers | div.w-full 768.0x1.0 bg #ffffff @ 0.06 |
| Tokens | --border-main #ffffff0f |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 1 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #000000 @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Painted layers | div.w-full 768.0x1.0 bg #000000 @ 0.06 |
| Tokens | --border-main #0000000f |
| How | at rest |

Crops: `settings-rule-default.png`, `settings-rule-light.png`.

#### shortcut-row

Shortcut row.

Snapshot: `settings-dark-shortcuts`. Finder: `() => W(T('Voice input', D()), 760)`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 36 |
| Padding | 0px |
| Gap | 16px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.block.truncate.text-sm: -apple-system 14px/20px 500, #e6e6e6 |
| Transition | none |
| Icon | 14 x 14, colour #8c8c8c, stroke #8c8c8c 2px |
| Painted layers | div.flex.items-center.rounded-lg 230.0x36.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px; span.flex.items-center.justify-center 26.0x26.0 bg #1c1c1c border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 6px; span.flex.items-center.justify-center 26.0x26.0 bg #1c1c1c border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 6px |
| Tokens | --background-card #1c1c1c; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --icon-tertiary #8c8c8c; --text-primary #e6e6e6; --text-secondary #b3b3b3 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 36 |
| Padding | 0px |
| Gap | 16px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.block.truncate.text-sm: -apple-system 14px/20px 500, #1a1a1a |
| Transition | none |
| Icon | 14 x 14, colour #737373, stroke #737373 2px |
| Painted layers | div.flex.items-center.rounded-lg 230.0x36.0 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 8px; span.flex.items-center.justify-center 26.0x26.0 bg #fafafa border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 6px; span.flex.items-center.justify-center 26.0x26.0 bg #fafafa border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 6px |
| Tokens | --background-card #fafafa; --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --icon-tertiary #737373; --text-primary #1a1a1a; --text-secondary #4d4d4d |
| How | at rest |

Crops: `shortcut-row-default.png`, `shortcut-row-light.png`.

#### shortcut-field

Shortcut key field.

Snapshot: `settings-dark-shortcuts`. Finder: `() => CK(T('D', D()), 'rounded-lg')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 230 x 36 | = |
| Padding | 0px 4px 0px 6px | = |
| Gap | 4px | = |
| Border | 1px solid #ffffff @ 0.12 | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span.flex.items-center.justify-center: -apple-system 13px/19.5px 400, #b3b3b3 | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Icon | 14 x 14, colour #8c8c8c, stroke #8c8c8c 2px | = |
| Painted layers | div.flex.items-center.rounded-lg 230.0x36.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px; span.flex.items-center.justify-center 26.0x26.0 bg #1c1c1c border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 6px; span.flex.items-center.justify-center 26.0x26.0 bg #1c1c1c border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 6px | div.flex.items-center.rounded-lg 230.0x36.0 bg #ffffff @ 0.04 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px; span.flex.items-center.justify-center 26.0x26.0 bg #1c1c1c border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 6px; span.flex.items-center.justify-center 26.0x26.0 bg #1c1c1c border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 6px |
| Tokens | --background-card #1c1c1c; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --icon-tertiary #8c8c8c; --text-primary #e6e6e6; --text-secondary #b3b3b3 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 230 x 36 | = |
| Padding | 0px 4px 0px 6px | = |
| Gap | 4px | = |
| Border | 1px solid #000000 @ 0.14 | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span.flex.items-center.justify-center: -apple-system 13px/19.5px 400, #4d4d4d | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Icon | 14 x 14, colour #737373, stroke #737373 2px | = |
| Painted layers | div.flex.items-center.rounded-lg 230.0x36.0 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 8px; span.flex.items-center.justify-center 26.0x26.0 bg #fafafa border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 6px; span.flex.items-center.justify-center 26.0x26.0 bg #fafafa border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 6px | div.flex.items-center.rounded-lg 230.0x36.0 bg #37352f @ 0.04 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 8px; span.flex.items-center.justify-center 26.0x26.0 bg #fafafa border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 6px; span.flex.items-center.justify-center 26.0x26.0 bg #fafafa border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 6px |
| Tokens | --background-card #fafafa; --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --icon-tertiary #737373; --text-primary #1a1a1a; --text-secondary #4d4d4d | = |
| How | at rest | mouse hover |

Crops: `shortcut-field-default.png`, `shortcut-field-hover.png`, `shortcut-field-light.png`, `shortcut-field-light-hover.png`.

#### keycap

Keycap.

Snapshot: `settings-dark-shortcuts`. Finder: `() => T('D', D())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 26 x 26 |
| Padding | 0px 6px |
| Border | 1px solid #ffffff @ 0.06 |
| Radius | 6px |
| Background | #1c1c1c |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/19.5px 400 |
| Letter spacing | normal |
| Colour | #b3b3b3 |
| Transition | none |
| Cursor | pointer |
| Painted layers | span.flex.items-center.justify-center 26.0x26.0 bg #1c1c1c border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 6px |
| Tokens | --background-card #1c1c1c; --border-main #ffffff0f; --text-secondary #b3b3b3 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 26 x 26 |
| Padding | 0px 6px |
| Border | 1px solid #000000 @ 0.06 |
| Radius | 6px |
| Background | #fafafa |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/19.5px 400 |
| Letter spacing | normal |
| Colour | #4d4d4d |
| Transition | none |
| Cursor | pointer |
| Painted layers | span.flex.items-center.justify-center 26.0x26.0 bg #fafafa border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 6px |
| Tokens | --background-card #fafafa; --border-main #0000000f; --text-secondary #4d4d4d |
| How | at rest |

Crops: `keycap-default.png`, `keycap-light.png`.

#### shortcut-clear

Shortcut clear button.

Snapshot: `settings-dark-shortcuts`. Finder: `() => { const b = CK(T('D', D()), 'rounded-lg').querySelectorAll('button'); return b[b.length - 1]; }`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 24 x 24 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 6px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #8c8c8c | #e6e6e6 | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 14 x 14, colour #8c8c8c, stroke #8c8c8c 2px | 14 x 14, colour #e6e6e6, stroke #e6e6e6 2px | = |
| Tokens | --icon-tertiary #8c8c8c; --text-primary #e6e6e6 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Ancestor paint | - | 1 up div.flex.items-center.rounded-lg bg #ffffff @ 0.04 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 24 x 24 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 6px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #737373 | #1a1a1a | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 14 x 14, colour #737373, stroke #737373 2px | 14 x 14, colour #1a1a1a, stroke #1a1a1a 2px | = |
| Tokens | --icon-tertiary #737373; --text-primary #1a1a1a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Ancestor paint | - | 1 up div.flex.items-center.rounded-lg bg #37352f @ 0.04 | = |

Crops: `shortcut-clear-default.png`, `shortcut-clear-hover.png`, `shortcut-clear-focus-visible.png`, `shortcut-clear-light.png`, `shortcut-clear-light-hover.png`, `shortcut-clear-light-focus-visible.png`.

#### reset-button

Reset to defaults button (outline).

Snapshot: `settings-dark-shortcuts`. Finder: `() => C(T('Reset to defaults', D()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 127.7 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #ffffff @ 0.12 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span: -apple-system 14px/18px 500, #e6e6e6 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 127.7x32.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 127.7x32.0 bg #ffffff @ 0.04 r 8px outline 1px solid #ffffff @ 0.12 offset -1px opacity 0.9 | = |
| Tokens | --Button-border-secondary #ffffff1f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 127.7 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #000000 @ 0.12 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span: -apple-system 14px/18px 500, #1a1a1a | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 127.7x32.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 127.7x32.0 bg #37352f @ 0.04 r 8px outline 1px solid #000000 @ 0.12 offset -1px opacity 0.9 | = |
| Tokens | --Button-border-secondary #0000001f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Crops: `reset-button-default.png`, `reset-button-hover.png`, `reset-button-focus-visible.png`, `reset-button-light.png`, `reset-button-light-hover.png`, `reset-button-light-focus-visible.png`.

### Creations

#### creations-search

Creations search field.

Snapshot: `creations-dark`. Finder: `() => C(Q('input[placeholder="Search creations"]'), '.group')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 240 x 32 |
| Padding | 4px 6px 4px 12px |
| Gap | 10px |
| Border | 1px solid #ffffff @ 0.12 |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6, stroke #b3b3b3 2px |
| Placeholder | "Search creations" #595959, opacity 1, 14px |
| Painted layers | div.group.overflow-hidden.text-sm 240.0x32.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px |
| Tokens | --Button-border-secondary #ffffff1f; --text-disable #595959; --text-primary #e6e6e6; --ui-density-input-gap 10px; --ui-density-small-radius 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 240 x 32 |
| Padding | 4px 6px 4px 12px |
| Gap | 10px |
| Border | 1px solid #000000 @ 0.12 |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a, stroke #4d4d4d 2px |
| Placeholder | "Search creations" #a6a6a6, opacity 1, 14px |
| Painted layers | div.group.overflow-hidden.text-sm 240.0x32.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px |
| Tokens | --Button-border-secondary #0000001f; --text-disable #a6a6a6; --text-primary #1a1a1a; --ui-density-input-gap 10px; --ui-density-small-radius 8px |
| How | at rest |

Crops: `creations-search-default.png`, `creations-search-light.png`.

#### creation-card

Creation card. 1000 wide, radius 12, 0.5px --border-dark, --background-menu-white, 12 padding: a 232x131 thumbnail, the title, "Created in", the URL chip and three actions.

Snapshot: `creations-dark`. Finder: `() => CK(T('UnidBox AI', M()), 'group/website')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 1000 x 156.5 | = |
| Padding | 12px | = |
| Gap | 16px | = |
| Border | 1px solid #ffffff @ 0.12 | = |
| Radius | 12px | = |
| Background | #242424 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #b3b3b3 2px | = |
| Painted layers | div.group/website.relative.flex 1000.0x156.5 bg #242424 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px; button.clickable.relative.shrink-0 232.0x130.5 bg #ffffff @ 0.06 r 8px; a.mt-2.flex.max-w-full 208.0x20.0 bg #ffffff @ 0.06 r 4px; button.inline-flex.items-center.justify-center 107.6x32.0 bg #ffffff @ 0.95 r 8px; button.inline-flex.items-center.justify-center 121.6x32.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px; button.inline-flex.items-center.justify-center 100.5x32.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px | = |
| Tokens | --Button-black #fffffff2; --Button-border-secondary #ffffff1f; --background-menu-white #242424; --border-dark #ffffff1f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-onblack #000000e5; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-density-small-row-height 32px | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 1000 x 156.5 | = |
| Padding | 12px | = |
| Gap | 16px | = |
| Border | 1px solid #000000 @ 0.14 | = |
| Radius | 12px | = |
| Background | #ffffff | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #4d4d4d 2px | = |
| Painted layers | div.group/website.relative.flex 1000.0x156.5 bg #ffffff border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px; button.clickable.relative.shrink-0 232.0x130.5 bg #37352f @ 0.06 r 8px; a.mt-2.flex.max-w-full 208.0x20.0 bg #37352f @ 0.06 r 4px; button.inline-flex.items-center.justify-center 107.6x32.0 bg #1a1a19 r 8px; button.inline-flex.items-center.justify-center 121.6x32.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px; button.inline-flex.items-center.justify-center 100.5x32.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px | = |
| Tokens | --Button-black #1a1a19; --Button-border-secondary #0000001f; --background-menu-white #fff; --border-dark #00000024; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-onblack #fff; --text-primary #1a1a1a; --text-tertiary #737373; --ui-density-small-row-height 32px | = |
| How | at rest | mouse hover |

Crops: `creation-card-default.png`, `creation-card-hover.png`, `creation-card-light.png`, `creation-card-light-hover.png`.

#### creation-thumb

Creation thumbnail.

Snapshot: `creations-dark`. Finder: `() => CK(T('UnidBox AI', M()), 'group/website').querySelector('button')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 232 x 130.5 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | #ffffff @ 0.06 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Painted layers | button.clickable.relative.shrink-0 232.0x130.5 bg #ffffff @ 0.06 r 8px | = |
| Ancestor paint | 1 up div.group/website.relative.flex bg #242424 | = |
| Tokens | --fill-tsp-white-main #ffffff0f | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 232 x 130.5 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | #37352f @ 0.06 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Painted layers | button.clickable.relative.shrink-0 232.0x130.5 bg #37352f @ 0.06 r 8px | = |
| Ancestor paint | 1 up div.group/website.relative.flex bg #ffffff | = |
| Tokens | --fill-tsp-white-main #37352f0f | = |
| How | at rest | mouse hover |

Crops: `creation-thumb-default.png`, `creation-thumb-hover.png`, `creation-thumb-light.png`, `creation-thumb-light-hover.png`.

#### creation-url

Creation URL chip.

Snapshot: `creations-dark`. Finder: `() => Q('a[href*="manus.space"]', 0, M())`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 208 x 20 | = | = |
| Padding | 2px 4px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 4px | = | = |
| Background | #ffffff @ 0.06 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 12px/16px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #8c8c8c | #e6e6e6 | = |
| Text node | span.truncate: -apple-system 12px/16px 400, #8c8c8c | span.truncate: -apple-system 12px/16px 400, #e6e6e6 | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 14 x 14, colour #8c8c8c | 14 x 14, colour #e6e6e6 | = |
| Painted layers | a.mt-2.flex.max-w-full 208.0x20.0 bg #ffffff @ 0.06 r 4px | = | = |
| Tokens | --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 208 x 20 | = | = |
| Padding | 2px 4px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 4px | = | = |
| Background | #37352f @ 0.06 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 12px/16px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #737373 | #1a1a1a | = |
| Text node | span.truncate: -apple-system 12px/16px 400, #737373 | span.truncate: -apple-system 12px/16px 400, #1a1a1a | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 14 x 14, colour #737373 | 14 x 14, colour #1a1a1a | = |
| Painted layers | a.mt-2.flex.max-w-full 208.0x20.0 bg #37352f @ 0.06 r 4px | = | = |
| Tokens | --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --text-tertiary #737373 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `creation-url-default.png`, `creation-url-hover.png`, `creation-url-focus-visible.png`, `creation-url-light.png`, `creation-url-light-hover.png`, `creation-url-light-focus-visible.png`.

#### creation-action-primary

Locate in task (filled small button).

Snapshot: `creations-dark`. Finder: `() => C(T('Locate in task', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 107.58 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | #ffffff @ 0.95 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #000000 @ 0.898 | = | = |
| Text node | span: -apple-system 14px/18px 500, #000000 @ 0.898 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 107.6x32.0 bg #ffffff @ 0.95 r 8px | button.inline-flex.items-center.justify-center 107.6x32.0 bg #ffffff @ 0.95 r 8px opacity 0.9 | = |
| Tokens | --Button-black #fffffff2; --text-onblack #000000e5; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 107.58 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | #1a1a19 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span: -apple-system 14px/18px 500, #ffffff | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 107.6x32.0 bg #1a1a19 r 8px | button.inline-flex.items-center.justify-center 107.6x32.0 bg #1a1a19 r 8px opacity 0.9 | = |
| Tokens | --Button-black #1a1a19; --text-onblack #fff; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Crops: `creation-action-primary-default.png`, `creation-action-primary-hover.png`, `creation-action-primary-focus-visible.png`, `creation-action-primary-light.png`, `creation-action-primary-light-hover.png`, `creation-action-primary-light-focus-visible.png`.

#### creation-action

Edit in new task (ghost small button).

Snapshot: `creations-dark`. Finder: `() => C(T('Edit in new task', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 121.56 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | 1px solid #ffffff @ 0.12 | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.06 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span: -apple-system 14px/18px 500, #e6e6e6 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 121.6x32.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px | button.inline-flex.items-center.justify-center 121.6x32.0 bg #ffffff @ 0.06 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px | = |
| Tokens | --Button-border-secondary #ffffff1f; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 121.56 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | 1px solid #000000 @ 0.12 | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.06 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span: -apple-system 14px/18px 500, #1a1a1a | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 121.6x32.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px | button.inline-flex.items-center.justify-center 121.6x32.0 bg #37352f @ 0.06 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px | = |
| Tokens | --Button-border-secondary #0000001f; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `creation-action-default.png`, `creation-action-hover.png`, `creation-action-focus-visible.png`, `creation-action-light.png`, `creation-action-light-hover.png`, `creation-action-light-focus-visible.png`.

#### creation-star

Creation favourite (star) button.

Snapshot: `creations-dark`. Finder: `() => K('size-7 rounded-lg', 0, CK(T('UnidBox AI', M()), 'group/website'))`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 28 x 28 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #b3b3b3 2px | = | = |
| Tokens | --fill-tsp-white-light #ffffff0a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.clickable.flex.size-7 28.0x28.0 bg #ffffff @ 0.04 r 8px | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 28 x 28 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #4d4d4d 2px | = | = |
| Tokens | --fill-tsp-white-light #37352f0a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.clickable.flex.size-7 28.0x28.0 bg #37352f @ 0.04 r 8px | = |

Crops: `creation-star-default.png`, `creation-star-hover.png`, `creation-star-focus-visible.png`, `creation-star-light.png`, `creation-star-light-hover.png`, `creation-star-light-focus-visible.png`.

### Computers

#### computers-cta

Create cloud computer button.

Snapshot: `computers-dark`. Finder: `() => C(T('Create cloud computer', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 189.58 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #ffffff @ 0.12 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span: -apple-system 14px/18px 500, #e6e6e6 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #e6e6e6 2px | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 189.6x32.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 189.6x32.0 bg #ffffff @ 0.04 r 8px outline 1px solid #ffffff @ 0.12 offset -1px opacity 0.9 | = |
| Tokens | --Button-border-secondary #ffffff1f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 189.58 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #000000 @ 0.12 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span: -apple-system 14px/18px 500, #1a1a1a | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #1a1a1a 2px | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 189.6x32.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 189.6x32.0 bg #37352f @ 0.04 r 8px outline 1px solid #000000 @ 0.12 offset -1px opacity 0.9 | = |
| Tokens | --Button-border-secondary #0000001f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Crops: `computers-cta-default.png`, `computers-cta-hover.png`, `computers-cta-focus-visible.png`, `computers-cta-light.png`, `computers-cta-light-hover.png`, `computers-cta-light-focus-visible.png`.

#### computers-heading

Computers section heading.

Snapshot: `computers-dark`. Finder: `() => Q('h2', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 960 x 32 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 24px/32px 600 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Tokens | --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 960 x 32 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 24px/32px 600 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Tokens | --text-primary #1a1a1a |
| How | at rest |

Crops: `computers-heading-default.png`, `computers-heading-light.png`.

#### setup-card

Setup card. 312x299, radius 12, 1px --border-main on --background-menu-white; a 173 tall illustration band on --fill-tsp-gray-main, title, two-line description and OS badges.

Snapshot: `computers-dark`. Finder: `() => C(T('Run automations', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 312 x 299 | = | = |
| Padding | 0px | = | = |
| Border | 1px solid #ffffff @ 0.06 | 1px solid #ffffff @ 0.12 | = |
| Radius | 12px | = | = |
| Background | #242424 | #1c1c1c | = |
| Box shadow | none | = | = |
| Outline | none | = | 2px solid #1a93fe offset 2px |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span.text-base.font-semibold: -apple-system 16px/22px 600, #e6e6e6 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #e6e6e6 | = | = |
| Painted layers | button.flex.min-w-0.flex-col 312.0x299.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px; div.w-full.shrink-0.px-5 310.0x173.0 bg #000000 @ 0.2; span.inline-flex.items-center.gap-1 66.1x24.0 bg #ffffff @ 0.06 r 6px | button.flex.min-w-0.flex-col 312.0x299.0 bg #1c1c1c border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px; div.w-full.shrink-0.px-5 310.0x173.0 bg #000000 @ 0.2; span.inline-flex.items-center.gap-1 66.1x24.0 bg #ffffff @ 0.06 r 6px | button.flex.min-w-0.flex-col 312.0x299.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px outline 2px solid #1a93fe offset 2px; div.w-full.shrink-0.px-5 310.0x173.0 bg #000000 @ 0.2; span.inline-flex.items-center.gap-1 66.1x24.0 bg #ffffff @ 0.06 r 6px |
| Tokens | --Button-blue #1a93fe; --background-card #1c1c1c; --background-menu-white #242424; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-gray-main #0003; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --text-secondary #b3b3b3 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 312 x 299 | = | = |
| Padding | 0px | = | = |
| Border | 1px solid #000000 @ 0.06 | 1px solid #000000 @ 0.14 | = |
| Radius | 12px | = | = |
| Background | #ffffff | #fafafa | = |
| Box shadow | none | = | = |
| Outline | none | = | 2px solid #0081f2 offset 2px |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span.text-base.font-semibold: -apple-system 16px/22px 600, #1a1a1a | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #1a1a1a | = | = |
| Painted layers | button.flex.min-w-0.flex-col 312.0x299.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px; div.w-full.shrink-0.px-5 310.0x173.0 bg #37352f @ 0.04; span.inline-flex.items-center.gap-1 66.1x24.0 bg #37352f @ 0.06 r 6px | button.flex.min-w-0.flex-col 312.0x299.0 bg #fafafa border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px; div.w-full.shrink-0.px-5 310.0x173.0 bg #37352f @ 0.04; span.inline-flex.items-center.gap-1 66.1x24.0 bg #37352f @ 0.06 r 6px | button.flex.min-w-0.flex-col 312.0x299.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px outline 2px solid #0081f2 offset 2px; div.w-full.shrink-0.px-5 310.0x173.0 bg #37352f @ 0.04; span.inline-flex.items-center.gap-1 66.1x24.0 bg #37352f @ 0.06 r 6px |
| Tokens | --Button-blue #0081f2; --background-card #fafafa; --background-menu-white #fff; --border-dark #00000024; --border-main #0000000f; --fill-tsp-gray-main #37352f0a; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --text-secondary #4d4d4d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `setup-card-default.png`, `setup-card-hover.png`, `setup-card-focus-visible.png`, `setup-card-light.png`, `setup-card-light-hover.png`, `setup-card-light-focus-visible.png`.

#### setup-badge

OS badge.

Snapshot: `computers-dark`. Finder: `() => T('Linux', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 66.08 x 24 |
| Padding | 4px 8px |
| Gap | 4px |
| Border | none |
| Radius | 6px |
| Background | #ffffff @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #b3b3b3 |
| Transition | none |
| Cursor | pointer |
| Icon | 16 x 16, colour #e6e6e6 |
| Painted layers | span.inline-flex.items-center.gap-1 66.1x24.0 bg #ffffff @ 0.06 r 6px |
| Tokens | --fill-tsp-white-main #ffffff0f |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 66.08 x 24 |
| Padding | 4px 8px |
| Gap | 4px |
| Border | none |
| Radius | 6px |
| Background | #37352f @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #4d4d4d |
| Transition | none |
| Cursor | pointer |
| Icon | 16 x 16, colour #1a1a1a |
| Painted layers | span.inline-flex.items-center.gap-1 66.1x24.0 bg #37352f @ 0.06 r 6px |
| Tokens | --fill-tsp-white-main #37352f0f |
| How | at rest |

Crops: `setup-badge-default.png`, `setup-badge-light.png`.

#### computers-customize

Customize band (bottom CTA).

Snapshot: `computers-dark`. Finder: `() => C(T('Have a setup in mind?', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 474 x 86 | = | = |
| Padding | 12px | = | = |
| Gap | 12px | = | = |
| Border | 1px solid #ffffff @ 0.06 | = | = |
| Radius | 12px | = | = |
| Background | #242424 | #1a1a1a | = |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.16 0px 3px 10px 0px | = | = |
| Outline | none | = | 2px solid #1a93fe offset 2px |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span.text-sm.font-medium.leading-5: -apple-system 14px/20px 500, #e6e6e6, ls -0.15px | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #e6e6e6 | = | = |
| Painted layers | button.clickable.flex.min-w-0 474.0x86.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.16 0px 3px 10px 0px; span.flex.size-7.shrink-0 28.0x28.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 6px | button.clickable.flex.min-w-0 474.0x86.0 bg #1a1a1a border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.16 0px 3px 10px 0px; span.flex.size-7.shrink-0 28.0x28.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 6px | button.clickable.flex.min-w-0 474.0x86.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.16 0px 3px 10px 0px outline 2px solid #1a93fe offset 2px; span.flex.size-7.shrink-0 28.0x28.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 6px |
| Tokens | --Button-blue #1a93fe; --background-menu-gray #1a1a1a; --background-menu-white #242424; --border-main #ffffff0f; --shadow-S #00000029; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 474 x 86 | = | = |
| Padding | 12px | = | = |
| Gap | 12px | = | = |
| Border | 1px solid #000000 @ 0.06 | = | = |
| Radius | 12px | = | = |
| Background | #ffffff | #f8f8f7 | = |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 3px 10px 0px | = | = |
| Outline | none | = | 2px solid #0081f2 offset 2px |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span.text-sm.font-medium.leading-5: -apple-system 14px/20px 500, #1a1a1a, ls -0.15px | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #1a1a1a | = | = |
| Painted layers | button.clickable.flex.min-w-0 474.0x86.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 3px 10px 0px; span.flex.size-7.shrink-0 28.0x28.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 6px | button.clickable.flex.min-w-0 474.0x86.0 bg #f8f8f7 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 3px 10px 0px; span.flex.size-7.shrink-0 28.0x28.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 6px | button.clickable.flex.min-w-0 474.0x86.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 3px 10px 0px outline 2px solid #0081f2 offset 2px; span.flex.size-7.shrink-0 28.0x28.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 6px |
| Tokens | --Button-blue #0081f2; --background-menu-gray #f8f8f7; --background-menu-white #fff; --border-main #0000000f; --shadow-S #0000000a; --text-primary #1a1a1a; --text-tertiary #737373 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `computers-customize-default.png`, `computers-customize-hover.png`, `computers-customize-focus-visible.png`, `computers-customize-light.png`, `computers-customize-light-hover.png`, `computers-customize-light-focus-visible.png`.

#### computers-connect

Connect your devices band.

Snapshot: `computers-dark`. Finder: `() => C(T('Connect your devices', M()), 'section')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 474 x 86 |
| Padding | 12px |
| Gap | 12px 16px |
| Border | 1px solid #ffffff @ 0.06 |
| Radius | 12px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.16 0px 3px 10px 0px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | p.min-w-0.text-sm.font-medium: -apple-system 14px/20px 500, #e6e6e6 |
| Transition | none |
| Icon | 14 x 14, colour #b3b3b3 |
| Painted layers | section.flex.min-w-0.flex-wrap 474.0x86.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.16 0px 3px 10px 0px; button.inline-flex.items-center.justify-center 177.4x28.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px; button.inline-flex.items-center.justify-center 184.0x28.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px |
| Tokens | --Button-border-secondary #ffffff1f; --background-menu-white #242424; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --shadow-S #00000029; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 474 x 86 |
| Padding | 12px |
| Gap | 12px 16px |
| Border | 1px solid #000000 @ 0.06 |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 3px 10px 0px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | p.min-w-0.text-sm.font-medium: -apple-system 14px/20px 500, #1a1a1a |
| Transition | none |
| Icon | 14 x 14, colour #4d4d4d |
| Painted layers | section.flex.min-w-0.flex-wrap 474.0x86.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 3px 10px 0px; button.inline-flex.items-center.justify-center 177.4x28.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px; button.inline-flex.items-center.justify-center 184.0x28.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px |
| Tokens | --Button-border-secondary #0000001f; --background-menu-white #fff; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --shadow-S #0000000a; --text-primary #1a1a1a |
| How | at rest |

Crops: `computers-connect-default.png`, `computers-connect-light.png`.

#### computers-small-button

Connect new computer (outline small button).

Snapshot: `computers-dark`. Finder: `() => C(T('Connect new computer', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 177.38 x 28 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #ffffff @ 0.12 offset -1px | = | = |
| Font | -apple-system 13px/18px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span: -apple-system 13px/18px 400, #e6e6e6 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 14 x 14, colour #b3b3b3 | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 177.4x28.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 177.4x28.0 bg #ffffff @ 0.04 r 8px outline 1px solid #ffffff @ 0.12 offset -1px opacity 0.9 | = |
| Ancestor paint | 2 up section.flex.min-w-0.flex-wrap bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.16 0px 3px 10px 0px | = | = |
| Tokens | --Button-border-secondary #ffffff1f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 177.38 x 28 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #000000 @ 0.12 offset -1px | = | = |
| Font | -apple-system 13px/18px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span: -apple-system 13px/18px 400, #1a1a1a | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 14 x 14, colour #4d4d4d | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 177.4x28.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 177.4x28.0 bg #37352f @ 0.04 r 8px outline 1px solid #000000 @ 0.12 offset -1px opacity 0.9 | = |
| Ancestor paint | 2 up section.flex.min-w-0.flex-wrap bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 3px 10px 0px | = | = |
| Tokens | --Button-border-secondary #0000001f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Crops: `computers-small-button-default.png`, `computers-small-button-hover.png`, `computers-small-button-focus-visible.png`, `computers-small-button-light.png`, `computers-small-button-light-hover.png`, `computers-small-button-light-focus-visible.png`.

### Agents

#### cue-title

Meet Cue title.

Snapshot: `agents-dark`. Finder: `() => Q('h1', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 562 x 34 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 34px/34px 500 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Tokens | --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 562 x 34 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 34px/34px 500 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Tokens | --text-primary #1a1a1a |
| How | at rest |

Crops: `cue-title-default.png`, `cue-title-light.png`.

#### cue-video

Cue video frame.

Snapshot: `agents-dark`. Finder: `() => K('aspect-video rounded-[14px]', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 562 x 316.13 |
| Padding | 0px |
| Border | none |
| Radius | 14px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Icon | 24 x 24, colour #ffffff |
| Painted layers | button.clickable.desktop-no-drag.relative 64.0x64.0 bg #000000 @ 0.6 r 9999px |
| Tokens | --background-dialog-mask #0009; --icon-white #fff |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 562 x 316.13 |
| Padding | 0px |
| Border | none |
| Radius | 14px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Icon | 24 x 24, colour #ffffff |
| Painted layers | button.clickable.desktop-no-drag.relative 64.0x64.0 bg #000000 @ 0.3 r 9999px |
| Tokens | --background-dialog-mask #0000004d; --icon-white #fff |
| How | at rest |

Crops: `cue-video-default.png`, `cue-video-light.png`.

#### cue-play

Play video button.

Snapshot: `agents-dark`. Finder: `() => C(T('Play video', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 64 x 64 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 9999px | = | = |
| Background | #000000 @ 0.6 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 24 x 24, colour #ffffff | = | = |
| Painted layers | button.clickable.desktop-no-drag.relative 64.0x64.0 bg #000000 @ 0.6 r 9999px | = | = |
| Tokens | --background-dialog-mask #0009; --icon-white #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 64 x 64 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 9999px | = | = |
| Background | #000000 @ 0.3 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 24 x 24, colour #ffffff | = | = |
| Painted layers | button.clickable.desktop-no-drag.relative 64.0x64.0 bg #000000 @ 0.3 r 9999px | = | = |
| Tokens | --background-dialog-mask #0000004d; --icon-white #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `cue-play-default.png`, `cue-play-hover.png`, `cue-play-focus-visible.png`, `cue-play-light.png`, `cue-play-light-hover.png`, `cue-play-light-focus-visible.png`.

#### cue-download

Download for desktop (primary).

Snapshot: `agents-dark`. Finder: `() => C(T('Download for desktop', M()), 'a')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 197.02 x 40 | = | = |
| Padding | 8px 20px 8px 12px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | #ffffff @ 0.95 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 13px/18px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #000000 @ 0.898 | = | = |
| Text node | span: -apple-system 13px/18px 400, #000000 @ 0.898 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | a.desktop-no-drag.inline-flex.min-h-10 197.0x40.0 bg #ffffff @ 0.95 r 10px | = | = |
| Tokens | --Button-black #fffffff2; --text-onblack #000000e5 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 197.02 x 40 | = | = |
| Padding | 8px 20px 8px 12px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | #1a1a19 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 13px/18px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span: -apple-system 13px/18px 400, #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | a.desktop-no-drag.inline-flex.min-h-10 197.0x40.0 bg #1a1a19 r 10px | = | = |
| Tokens | --Button-black #1a1a19; --text-onblack #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `cue-download-default.png`, `cue-download-hover.png`, `cue-download-focus-visible.png`, `cue-download-light.png`, `cue-download-light-hover.png`, `cue-download-light-focus-visible.png`.

#### cue-mobile

Get the mobile app (black).

Snapshot: `agents-dark`. Finder: `() => C(T('Get the mobile app', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 179.2 x 40 | = | = |
| Padding | 8px 20px 8px 12px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | #ffffff @ 0.95 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 13px/18px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #000000 @ 0.898 | = | = |
| Text node | span: -apple-system 13px/18px 400, #000000 @ 0.898 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.desktop-no-drag.inline-flex.min-h-10 179.2x40.0 bg #ffffff @ 0.95 r 10px | = | = |
| Tokens | --Button-black #fffffff2; --text-onblack #000000e5 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 179.2 x 40 | = | = |
| Padding | 8px 20px 8px 12px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | #1a1a19 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 13px/18px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span: -apple-system 13px/18px 400, #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.desktop-no-drag.inline-flex.min-h-10 179.2x40.0 bg #1a1a19 r 10px | = | = |
| Tokens | --Button-black #1a1a19; --text-onblack #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `cue-mobile-default.png`, `cue-mobile-hover.png`, `cue-mobile-focus-visible.png`, `cue-mobile-light.png`, `cue-mobile-light-hover.png`, `cue-mobile-light-focus-visible.png`.

#### waitlist-banner

Waitlist banner.

Snapshot: `agents-dark`. Finder: `() => W(C(T('Join waitlist', M()), 'button'), 560)`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 562 x 66 |
| Padding | 12px |
| Gap | 10px |
| Border | 1px solid #ffffff @ 0.12 |
| Radius | 12px |
| Background | #242424 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | p.min-w-0.flex-1.whitespace-pre-line: -apple-system 14px/20px 400, #e6e6e6 |
| Transition | none |
| Icon | 20 x 20, colour #e6e6e6 |
| Painted layers | div.flex.w-full.flex-wrap 562.0x66.0 bg #242424 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px; div.flex.size-10.shrink-0 40.0x40.0 bg #1a93fe r 8px; button.inline-flex.items-center.justify-center 102.1x36.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px |
| Tokens | --Button-border-secondary #ffffff1f; --background-menu-white #242424; --border-dark #ffffff1f; --fill-tsp-white-light #ffffff0a; --icon-blue #1a93fe; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 562 x 66 |
| Padding | 12px |
| Gap | 10px |
| Border | 1px solid #000000 @ 0.14 |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | p.min-w-0.flex-1.whitespace-pre-line: -apple-system 14px/20px 400, #1a1a1a |
| Transition | none |
| Icon | 20 x 20, colour #1a1a1a |
| Painted layers | div.flex.w-full.flex-wrap 562.0x66.0 bg #ffffff border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px; div.flex.size-10.shrink-0 40.0x40.0 bg #0081f2 r 8px; button.inline-flex.items-center.justify-center 102.1x36.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px |
| Tokens | --Button-border-secondary #0000001f; --background-menu-white #fff; --border-dark #00000024; --fill-tsp-white-light #37352f0a; --icon-blue #0081f2; --text-primary #1a1a1a |
| How | at rest |

Crops: `waitlist-banner-default.png`, `waitlist-banner-light.png`.

#### waitlist-button

Join waitlist button.

Snapshot: `agents-dark`. Finder: `() => C(T('Join waitlist', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 102.09 x 36 | = | = |
| Padding | 0px 12px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #ffffff @ 0.12 offset -1px | = | = |
| Font | -apple-system 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span: -apple-system 14px/20px 500, #e6e6e6 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 102.1x36.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 102.1x36.0 bg #ffffff @ 0.04 r 8px outline 1px solid #ffffff @ 0.12 offset -1px opacity 0.9 | = |
| Ancestor paint | 1 up div.flex.w-full.flex-wrap bg #242424 | = | = |
| Tokens | --Button-border-secondary #ffffff1f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 102.09 x 36 | = | = |
| Padding | 0px 12px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #000000 @ 0.12 offset -1px | = | = |
| Font | -apple-system 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span: -apple-system 14px/20px 500, #1a1a1a | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 102.1x36.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 102.1x36.0 bg #37352f @ 0.04 r 8px outline 1px solid #000000 @ 0.12 offset -1px opacity 0.9 | = |
| Ancestor paint | 1 up div.flex.w-full.flex-wrap bg #ffffff | = | = |
| Tokens | --Button-border-secondary #0000001f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Crops: `waitlist-button-default.png`, `waitlist-button-hover.png`, `waitlist-button-focus-visible.png`, `waitlist-button-light.png`, `waitlist-button-light-hover.png`, `waitlist-button-light-focus-visible.png`.

#### cue-link

Visit our website link.

Snapshot: `agents-dark`. Finder: `() => Q('a[href="https://cue.im/"]', 0, M())`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 116.25 x 18 | = | = |
| Padding | 0px | = | = |
| Gap | 2px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 13px/18px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #b3b3b3 | = | = |
| Text node | span.underline.underline-offset-2: -apple-system 13px/18px 400, #b3b3b3 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 14 x 14, colour #b3b3b3 | = | = |
| Tokens | --text-secondary #b3b3b3 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 116.25 x 18 | = | = |
| Padding | 0px | = | = |
| Gap | 2px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 13px/18px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #4d4d4d | = | = |
| Text node | span.underline.underline-offset-2: -apple-system 13px/18px 400, #4d4d4d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 14 x 14, colour #4d4d4d | = | = |
| Tokens | --text-secondary #4d4d4d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `cue-link-default.png`, `cue-link-hover.png`, `cue-link-focus-visible.png`, `cue-link-light.png`, `cue-link-light-hover.png`, `cue-link-light-focus-visible.png`.

### Automations

#### automations-heading

Create your first automation heading.

Snapshot: `automations-dark`. Finder: `() => Q('h2', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 344.75 x 34 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 28px/34px 500 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Tokens | --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 344.75 x 34 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 28px/34px 500 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Tokens | --text-primary #1a1a1a |
| How | at rest |

Crops: `automations-heading-default.png`, `automations-heading-light.png`.

#### automation-card

Automation example card. 312x421, radius 12, 1px --border-main; an animated illustration band over a 16/22 title and a description.

Snapshot: `automations-dark`. Finder: `() => CK(T('Schedule', M()), 'max-w-[400px]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 312 x 421 | = |
| Padding | 0px | = |
| Border | 1px solid #ffffff @ 0.06 | = |
| Radius | 12px | = |
| Background | #242424 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.flex.shrink-0.items-center: -apple-system 14px/20px 500, #e6e6e6 | = |
| Transition | none | = |
| Icon | 12 x 12, colour #8c8c8c | = |
| Painted layers | div.flex.w-full.flex-col 312.0x421.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px; div.w-full.shrink-0.overflow-hidden 310.0x320.0 bg #ffffff @ 0.06; div.flex.w-full.shrink-0 240.0x101.0 bg #242424 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.28 0px 8px 16px 0px; span.rounded-full 5.0x5.0 bg #ffffff @ 0.08 r 9999px; span.rounded-full 5.0x5.0 bg #ffffff @ 0.08 r 9999px; span.rounded-full 5.0x5.0 bg #ffffff @ 0.08 r 9999px | = |
| Tokens | --background-menu-white #242424; --border-main #ffffff0f; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-main #ffffff0f; --icon-primary #e6e6e6; --shadow-M #00000047; --text-onblack #000000e5; --text-primary #e6e6e6; --text-secondary #b3b3b3; --text-tertiary #8c8c8c | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 312 x 421 | = |
| Padding | 0px | = |
| Border | 1px solid #000000 @ 0.06 | = |
| Radius | 12px | = |
| Background | #ffffff | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.flex.shrink-0.items-center: -apple-system 14px/20px 500, #1a1a1a | = |
| Transition | none | = |
| Icon | 12 x 12, colour #737373 | = |
| Painted layers | div.flex.w-full.flex-col 312.0x421.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px; div.w-full.shrink-0.overflow-hidden 310.0x320.0 bg #37352f @ 0.06; div.flex.w-full.shrink-0 240.0x101.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.06 0px 8px 16px 0px; span.rounded-full 5.0x5.0 bg #37352f @ 0.08 r 9999px; span.rounded-full 5.0x5.0 bg #37352f @ 0.08 r 9999px; span.rounded-full 5.0x5.0 bg #37352f @ 0.08 r 9999px | = |
| Tokens | --background-menu-white #fff; --border-main #0000000f; --fill-tsp-white-dark #37352f14; --fill-tsp-white-main #37352f0f; --icon-primary #1a1a1a; --shadow-M #0000000f; --text-onblack #fff; --text-primary #1a1a1a; --text-secondary #4d4d4d; --text-tertiary #737373 | = |
| How | at rest | mouse hover |

Crops: `automation-card-default.png`, `automation-card-hover.png`, `automation-card-light.png`, `automation-card-light-hover.png`.

#### automation-card-title

Automation card title.

Snapshot: `automations-dark`. Finder: `() => T('Schedule', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 69.11 x 22 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/22px 500 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Tokens | --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 69.11 x 22 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/22px 500 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Tokens | --text-primary #1a1a1a |
| How | at rest |

Crops: `automation-card-title-default.png`, `automation-card-title-light.png`.

#### get-started

Get started button (black).

Snapshot: `automations-dark`. Finder: `() => C(T('Get started', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 310 x 36 | = | = |
| Padding | 0px 12px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | #ffffff @ 0.95 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #000000 @ 0.898 | = | = |
| Text node | span: -apple-system 14px/20px 500, #000000 @ 0.898 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 310.0x36.0 bg #ffffff @ 0.95 r 8px | button.inline-flex.items-center.justify-center 310.0x36.0 bg #ffffff @ 0.95 r 8px opacity 0.9 | = |
| Tokens | --Button-black #fffffff2; --text-onblack #000000e5 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 310 x 36 | = | = |
| Padding | 0px 12px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | #1a1a19 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span: -apple-system 14px/20px 500, #ffffff | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 310.0x36.0 bg #1a1a19 r 8px | button.inline-flex.items-center.justify-center 310.0x36.0 bg #1a1a19 r 8px opacity 0.9 | = |
| Tokens | --Button-black #1a1a19; --text-onblack #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Crops: `get-started-default.png`, `get-started-hover.png`, `get-started-focus-visible.png`, `get-started-light.png`, `get-started-light-hover.png`, `get-started-light-focus-visible.png`.

### Plugins

#### plugins-header-button

Manage Connectors (outline).

Snapshot: `plugins-dark`. Finder: `() => C(T('Manage Connectors', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 148.8 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #ffffff @ 0.12 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span: -apple-system 14px/18px 500, #e6e6e6 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 148.8x32.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 148.8x32.0 bg #ffffff @ 0.04 r 8px outline 1px solid #ffffff @ 0.12 offset -1px opacity 0.9 | = |
| Tokens | --Button-border-secondary #ffffff1f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 148.8 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #000000 @ 0.12 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span: -apple-system 14px/18px 500, #1a1a1a | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 148.8x32.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 148.8x32.0 bg #37352f @ 0.04 r 8px outline 1px solid #000000 @ 0.12 offset -1px opacity 0.9 | = |
| Tokens | --Button-border-secondary #0000001f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Crops: `plugins-header-button-default.png`, `plugins-header-button-hover.png`, `plugins-header-button-focus-visible.png`, `plugins-header-button-light.png`, `plugins-header-button-light-hover.png`, `plugins-header-button-light-focus-visible.png`.

#### plugins-header-primary

Header primary button.

Snapshot: `plugins-dark`. Finder: `() => C(T('Manage Connectors', M()), 'button').nextElementSibling`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 80.05 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #ffffff @ 0.12 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #e6e6e6 2px | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 80.0x32.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 80.0x32.0 bg #ffffff @ 0.04 r 8px outline 1px solid #ffffff @ 0.12 offset -1px opacity 0.9 | = |
| Tokens | --Button-border-secondary #ffffff1f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 80.05 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #000000 @ 0.12 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #1a1a1a 2px | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 80.0x32.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 80.0x32.0 bg #37352f @ 0.04 r 8px outline 1px solid #000000 @ 0.12 offset -1px opacity 0.9 | = |
| Tokens | --Button-border-secondary #0000001f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |

Crops: `plugins-header-primary-default.png`, `plugins-header-primary-hover.png`, `plugins-header-primary-focus-visible.png`, `plugins-header-primary-light.png`, `plugins-header-primary-light-hover.png`, `plugins-header-primary-light-focus-visible.png`.

#### plugin-promo

Plugin promo card.

Snapshot: `plugins-dark`. Finder: `() => CK(TS('Bring email, docs', M()), 'w-[280px]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 280 x 114 |
| Padding | 12px |
| Gap | 8px |
| Border | 1px solid #ffffff @ 0.06 |
| Radius | 12px |
| Background | #1c1c1c |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | p.w-full.font-medium: -apple-system 14px/20px 500, #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.flex.flex-col.gap-2 280.0x114.0 bg #1c1c1c border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px; div.flex.items-center.justify-center 40.0x40.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px |
| Tokens | --background-card-gray #1c1c1c; --background-menu-white #242424; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 280 x 114 |
| Padding | 12px |
| Gap | 8px |
| Border | 1px solid #000000 @ 0.06 |
| Radius | 12px |
| Background | #fafafa |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | p.w-full.font-medium: -apple-system 14px/20px 500, #1a1a1a |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.flex.flex-col.gap-2 280.0x114.0 bg #fafafa border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px; div.flex.items-center.justify-center 40.0x40.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px |
| Tokens | --background-card-gray #fafafa; --background-menu-white #fff; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a |
| How | at rest |

Crops: `plugin-promo-default.png`, `plugin-promo-light.png`.

#### carousel-forward

Carousel scroll-forward button. Held at opacity 0 until the carousel is hovered; measured as found, then hovered.

Snapshot: `plugins-dark`. Finder: `() => M().querySelector('[aria-label="Scroll forward"]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | 1px solid #ffffff @ 0.06 | = |
| Radius | 9999px | = |
| Background | #242424 | #1c1c1c |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.06 0px 8px 16px 0px | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Transform | matrix(1, 0, 0, 1, 0, -16) | = |
| Opacity | 0 | - |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #b3b3b3 2px | = |
| Painted layers | button.clickable.absolute.top-1/2 32.0x32.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.06 0px 8px 16px 0px opacity 0 | button.clickable.absolute.top-1/2 32.0x32.0 bg #1c1c1c border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.06 0px 8px 16px 0px |
| Tokens | --border-main #ffffff0f; --fill-gray #1c1c1c; --fill-white #242424 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Border | 1px solid #000000 @ 0.06 | = |
| Radius | 9999px | = |
| Background | #ffffff | #f8f8f7 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.06 0px 8px 16px 0px | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Transform | matrix(1, 0, 0, 1, 0, -16) | = |
| Opacity | 0 | - |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #4d4d4d 2px | = |
| Painted layers | button.clickable.absolute.top-1/2 32.0x32.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.06 0px 8px 16px 0px opacity 0 | button.clickable.absolute.top-1/2 32.0x32.0 bg #f8f8f7 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.06 0px 8px 16px 0px |
| Tokens | --border-main #0000000f; --fill-gray #f8f8f7; --fill-white #fff | = |
| How | at rest | mouse hover |

Crops: `carousel-forward-default.png`, `carousel-forward-hover.png`, `carousel-forward-light.png`, `carousel-forward-light-hover.png`.

#### plugins-search

Plugins search field.

Snapshot: `plugins-dark`. Finder: `() => C(Q('input[placeholder=Search]', 0, M()), 'div')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 768 x 36 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 6px | = | = |
| Border | 1px solid #ffffff @ 0.12 | = | 1px solid #ffffff @ 0.32 |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Transition | none | = | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #8c8c8c 2px | = | = |
| Placeholder | "Search" #595959, opacity 1, 14px | = | = |
| Painted layers | div.flex.items-center.h-9 768.0x36.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px; input.flex-1.min-w-0.bg-transparent 724.0x21.0 outline 2px solid #000000 @ 0 offset 2px | = | div.flex.items-center.h-9 768.0x36.0 border T:1px solid #ffffff @ 0.32 / R:1px solid #ffffff @ 0.32 / B:1px solid #ffffff @ 0.32 / L:1px solid #ffffff @ 0.32 r 8px; input.flex-1.min-w-0.bg-transparent 724.0x21.0 outline 2px solid #000000 @ 0 offset 2px |
| Tokens | --Button-border-secondary #ffffff1f; --border-input-active #ffffff52; --text-disable #595959; --text-primary #e6e6e6 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 768 x 36 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 6px | = | = |
| Border | 1px solid #000000 @ 0.12 | = | 1px solid #000000 @ 0.3 |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Transition | none | = | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #737373 2px | = | = |
| Placeholder | "Search" #a6a6a6, opacity 1, 14px | = | = |
| Painted layers | div.flex.items-center.h-9 768.0x36.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px; input.flex-1.min-w-0.bg-transparent 724.0x21.0 outline 2px solid #000000 @ 0 offset 2px | = | div.flex.items-center.h-9 768.0x36.0 border T:1px solid #000000 @ 0.3 / R:1px solid #000000 @ 0.3 / B:1px solid #000000 @ 0.3 / L:1px solid #000000 @ 0.3 r 8px; input.flex-1.min-w-0.bg-transparent 724.0x21.0 outline 2px solid #000000 @ 0 offset 2px |
| Tokens | --Button-border-secondary #0000001f; --border-input-active #0000004d; --text-disable #a6a6a6; --text-primary #1a1a1a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Crops: `plugins-search-default.png`, `plugins-search-hover.png`, `plugins-search-focus-visible.png`, `plugins-search-light.png`, `plugins-search-light-hover.png`, `plugins-search-light-focus-visible.png`.

#### category-tab

Category tab.

Snapshot: `plugins-dark`. Finder: `() => C(T('Productivity', M()), 'button')`.

Dark theme.

| Property | default | hover | selected |
|---|---|---|---|
| Size (w x h) | 99.86 x 32 | = | 48 x 32 |
| Padding | 0px 10px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.04 | #ffffff @ 0.08 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/20px 400 | = | -apple-system 14px/20px 500 |
| Letter spacing | normal | = | = |
| Colour | #8c8c8c | = | #e6e6e6 |
| Text node | span.absolute.inset-0.flex: -apple-system 14px/20px 400, #8c8c8c | = | span.absolute.inset-0.flex: -apple-system 14px/20px 500, #e6e6e6 |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --text-tertiary #8c8c8c | = | --fill-tsp-white-dark #ffffff14; --text-primary #e6e6e6 |
| How | at rest | mouse hover | at rest, captured selected |
| Painted layers | - | button.clickable.flex.h-8 99.9x32.0 bg #ffffff @ 0.04 r 8px | button.clickable.flex.h-8 48.0x32.0 bg #ffffff @ 0.08 r 8px |

Light theme.

| Property | light | light-hover | light-selected |
|---|---|---|---|
| Size (w x h) | 99.86 x 32 | = | 48 x 32 |
| Padding | 0px 10px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.04 | #37352f @ 0.08 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/20px 400 | = | -apple-system 14px/20px 500 |
| Letter spacing | normal | = | = |
| Colour | #737373 | = | #1a1a1a |
| Text node | span.absolute.inset-0.flex: -apple-system 14px/20px 400, #737373 | = | span.absolute.inset-0.flex: -apple-system 14px/20px 500, #1a1a1a |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Tokens | --fill-tsp-white-light #37352f0a; --text-tertiary #737373 | = | --fill-tsp-white-dark #37352f14; --text-primary #1a1a1a |
| How | at rest | mouse hover | at rest, captured selected |
| Painted layers | - | button.clickable.flex.h-8 99.9x32.0 bg #37352f @ 0.04 r 8px | button.clickable.flex.h-8 48.0x32.0 bg #37352f @ 0.08 r 8px |

Other finders: selected: `() => C(T('All', M()), 'button')`; light-selected: `() => C(T('All', M()), 'button')`.

Crops: `category-tab-default.png`, `category-tab-hover.png`, `category-tab-selected.png`, `category-tab-light.png`, `category-tab-light-hover.png`, `category-tab-light-selected.png`.

#### plugin-row

Plugin row. 378x76, radius 12, 1px --border-main, hover --fill-tsp-white-light; a 40px icon tile, name and two-line description, a 28px add button for plugins not yet added.

Snapshot: `plugins-dark`. Finder: `() => CK(T('Instagram', M()), 'h-[76px]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 378 x 76 | = |
| Padding | 12px | = |
| Gap | 12px | = |
| Border | 1px solid #ffffff @ 0.06 | = |
| Radius | 12px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span: -apple-system 14px/20px 500, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 14 x 14, colour #e6e6e6, stroke #e6e6e6 2px | = |
| Painted layers | div.flex.items-center.gap-3 378.0x76.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px; div.flex.items-center.justify-center 40.0x40.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px; div.flex.items-center.justify-center 28.0x28.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px | div.flex.items-center.gap-3 378.0x76.0 bg #ffffff @ 0.04 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px; div.flex.items-center.justify-center 40.0x40.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px; div.flex.items-center.justify-center 28.0x28.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px |
| Tokens | --background-menu-white #242424; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --icon-primary #e6e6e6; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 378 x 76 | = |
| Padding | 12px | = |
| Gap | 12px | = |
| Border | 1px solid #000000 @ 0.06 | = |
| Radius | 12px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span: -apple-system 14px/20px 500, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 14 x 14, colour #1a1a1a, stroke #1a1a1a 2px | = |
| Painted layers | div.flex.items-center.gap-3 378.0x76.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px; div.flex.items-center.justify-center 40.0x40.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px; div.flex.items-center.justify-center 28.0x28.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px | div.flex.items-center.gap-3 378.0x76.0 bg #37352f @ 0.04 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px; div.flex.items-center.justify-center 40.0x40.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px; div.flex.items-center.justify-center 28.0x28.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px |
| Tokens | --background-menu-white #fff; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --icon-primary #1a1a1a; --text-primary #1a1a1a; --text-tertiary #737373 | = |
| How | at rest | mouse hover |

Crops: `plugin-row-default.png`, `plugin-row-hover.png`, `plugin-row-light.png`, `plugin-row-light-hover.png`.

#### plugin-icon

Plugin icon tile.

Snapshot: `plugins-dark`. Finder: `() => K('size-10', 0, CK(T('Instagram', M()), 'h-[76px]'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 40 x 40 |
| Padding | 0px |
| Border | 1px solid #ffffff @ 0.06 |
| Radius | 8px |
| Background | #242424 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.flex.items-center.justify-center 40.0x40.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px |
| Tokens | --background-menu-white #242424; --border-main #ffffff0f |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 40 x 40 |
| Padding | 0px |
| Border | 1px solid #000000 @ 0.06 |
| Radius | 8px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.flex.items-center.justify-center 40.0x40.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px |
| Tokens | --background-menu-white #fff; --border-main #0000000f |
| How | at rest |

Crops: `plugin-icon-default.png`, `plugin-icon-light.png`.

#### plugin-name

Plugin name.

Snapshot: `plugins-dark`. Finder: `() => T('Instagram', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 66.31 x 17 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 500 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span: -apple-system 14px/20px 500, #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 66.31 x 17 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 500 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span: -apple-system 14px/20px 500, #1a1a1a |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Crops: `plugin-name-default.png`, `plugin-name-light.png`.

#### plugin-desc

Plugin description.

Snapshot: `plugins-dark`. Finder: `() => TS('Generate and publish Posts', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 254.72 x 31 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Text node | span: -apple-system 12px/16px 400, #8c8c8c |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 254.72 x 31 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Text node | span: -apple-system 12px/16px 400, #737373 |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Crops: `plugin-desc-default.png`, `plugin-desc-light.png`.

#### plugin-add

Plugin add (+) button.

Snapshot: `plugins-dark`. Finder: `() => K('size-7', 0, CK(T('Instagram', M()), 'h-[76px]'))`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 28 x 28 | = |
| Padding | 0px | = |
| Border | 1px solid #ffffff @ 0.06 | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 14 x 14, colour #e6e6e6, stroke #e6e6e6 2px | = |
| Painted layers | div.flex.items-center.justify-center 28.0x28.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px | div.flex.items-center.justify-center 28.0x28.0 bg #ffffff @ 0.04 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px |
| Tokens | --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --icon-primary #e6e6e6 | = |
| How | at rest | mouse hover |
| Ancestor paint | - | 1 up div.flex.items-center.gap-3 bg #ffffff @ 0.04 |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 28 x 28 | = |
| Padding | 0px | = |
| Border | 1px solid #000000 @ 0.06 | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 14 x 14, colour #1a1a1a, stroke #1a1a1a 2px | = |
| Painted layers | div.flex.items-center.justify-center 28.0x28.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px | div.flex.items-center.justify-center 28.0x28.0 bg #37352f @ 0.04 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px |
| Tokens | --border-main #0000000f; --fill-tsp-white-light #37352f0a; --icon-primary #1a1a1a | = |
| How | at rest | mouse hover |
| Ancestor paint | - | 1 up div.flex.items-center.gap-3 bg #37352f @ 0.04 |

Crops: `plugin-add-default.png`, `plugin-add-hover.png`, `plugin-add-light.png`, `plugin-add-light-hover.png`.

### Project

#### project-icon

Project icon tile.

Snapshot: `project-dark`. Finder: `() => K('p-[12px] rounded-[12px]', 0, M())`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 48 x 48 | = |
| Padding | 12px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | #ffffff @ 0.06 | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 24 x 24, colour #e6e6e6, stroke #e6e6e6 2px | = |
| Painted layers | div.shrink-0.flex.items-center 48.0x48.0 bg #ffffff @ 0.06 r 12px | div.shrink-0.flex.items-center 48.0x48.0 bg #ffffff @ 0.04 r 12px |
| Tokens | --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 48 x 48 | = |
| Padding | 12px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | #37352f @ 0.06 | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 24 x 24, colour #1a1a1a, stroke #1a1a1a 2px | = |
| Painted layers | div.shrink-0.flex.items-center 48.0x48.0 bg #37352f @ 0.06 r 12px | div.shrink-0.flex.items-center 48.0x48.0 bg #37352f @ 0.04 r 12px |
| Tokens | --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f | = |
| How | at rest | mouse hover |

Crops: `project-icon-default.png`, `project-icon-hover.png`, `project-icon-light.png`, `project-icon-light-hover.png`.

#### project-title

Project title.

Snapshot: `project-dark`. Finder: `() => T('Hackathons', M())`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 107.38 x 28 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 20px/28px 500 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Tokens | --text-primary #e6e6e6; --text-primary-hover (unset) | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 107.38 x 28 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 20px/28px 500 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Tokens | --text-primary #1a1a1a; --text-primary-hover (unset) | = |
| How | at rest | mouse hover |

Crops: `project-title-default.png`, `project-title-hover.png`, `project-title-light.png`, `project-title-light-hover.png`.

#### project-meta

Project meta line.

Snapshot: `project-dark`. Finder: `() => T('Created by Learner', M()).parentElement`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 648 x 16 |
| Padding | 0px |
| Gap | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Text node | span.overflow-hidden.text-ellipsis: -apple-system 12px/16px 400, #8c8c8c |
| Transition | none |
| Painted layers | div.shrink-0.rounded-full 3.0x3.0 bg #595959 r 9999px |
| Tokens | --icon-disable #595959; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 648 x 16 |
| Padding | 0px |
| Gap | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Text node | span.overflow-hidden.text-ellipsis: -apple-system 12px/16px 400, #737373 |
| Transition | none |
| Painted layers | div.shrink-0.rounded-full 3.0x3.0 bg #a6a6a6 r 9999px |
| Tokens | --icon-disable #a6a6a6; --text-tertiary #737373 |
| How | at rest |

Crops: `project-meta-default.png`, `project-meta-light.png`.

#### project-recent-label

Recent label.

Snapshot: `project-dark`. Finder: `() => T('Recent', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 43.23 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 500 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | none |
| Tokens | --text-tertiary #8c8c8c; --ui-font-size-label 13px; --ui-line-height-label 18px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 43.23 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 500 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | none |
| Tokens | --text-tertiary #737373; --ui-font-size-label 13px; --ui-line-height-label 18px |
| How | at rest |

Crops: `project-recent-label-default.png`, `project-recent-label-light.png`.

#### project-session

Project task row.

Snapshot: `project-dark`. Finder: `() => Q('.session-item', 0, M())`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 724 x 52 | = |
| Padding | 12px 8px | = |
| Gap | 12px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span.text-sm.font-normal.min-w-0: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 14 x 14, colour #e6e6e6, stroke #8c8c8c 2px | = |
| Painted layers | div.absolute 706.0x1.0 bg #ffffff @ 0.03 | div.session-item.px-2.flex 724.0x52.0 bg #ffffff @ 0.04 r 8px; div.absolute 706.0x1.0 bg #ffffff @ 0.03 opacity 0 |
| Tokens | --border-light #ffffff08; --fill-tsp-white-light #ffffff0a; --icon-tertiary #8c8c8c; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-line-height-sm 20px; --ui-line-height-xs 16px | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 724 x 52 | = |
| Padding | 12px 8px | = |
| Gap | 12px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span.text-sm.font-normal.min-w-0: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 14 x 14, colour #1a1a1a, stroke #737373 2px | = |
| Painted layers | div.absolute 706.0x1.0 bg #000000 @ 0.04 | div.session-item.px-2.flex 724.0x52.0 bg #37352f @ 0.04 r 8px; div.absolute 706.0x1.0 bg #000000 @ 0.04 opacity 0 |
| Tokens | --border-light #0000000a; --fill-tsp-white-light #37352f0a; --icon-tertiary #737373; --text-primary #1a1a1a; --text-tertiary #737373; --ui-line-height-sm 20px; --ui-line-height-xs 16px | = |
| How | at rest | mouse hover |

Crops: `project-session-default.png`, `project-session-hover.png`, `project-session-light.png`, `project-session-light-hover.png`.

#### project-rail-card

Right rail card (Instructions, Connectors). 320 wide, radius 12, 1px --border-main, clickable sections that fill on hover.

Snapshot: `project-dark`. Finder: `() => CK(T('Instructions', M()), 'rounded-[12px]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 320 x 207 |
| Padding | 0px |
| Border | 1px solid #ffffff @ 0.06 |
| Radius | 12px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.text-sm.truncate: -apple-system 14px/20px 500, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6, stroke #b3b3b3 2px |
| Painted layers | div.border.overflow-hidden.w-full 320.0x207.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px; button.inline-flex.items-center.justify-center 64.4x32.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px; div.border-t.p-4.pe-3 318.0x69.0 border T:1px solid #ffffff @ 0.06; div.flex.h-9.min-h-9 290.0x36.0 bg #ffffff @ 0.04 r 8px |
| Tokens | --Button-border-secondary #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --text-secondary #b3b3b3; --text-tertiary #8c8c8c; --ui-density-small-row-height 32px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 320 x 207 |
| Padding | 0px |
| Border | 1px solid #000000 @ 0.06 |
| Radius | 12px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.text-sm.truncate: -apple-system 14px/20px 500, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a, stroke #4d4d4d 2px |
| Painted layers | div.border.overflow-hidden.w-full 320.0x207.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px; button.inline-flex.items-center.justify-center 64.4x32.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px; div.border-t.p-4.pe-3 318.0x69.0 border T:1px solid #000000 @ 0.06; div.flex.h-9.min-h-9 290.0x36.0 bg #37352f @ 0.04 r 8px |
| Tokens | --Button-border-secondary #0000001f; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --text-secondary #4d4d4d; --text-tertiary #737373; --ui-density-small-row-height 32px |
| How | at rest |

Crops: `project-rail-card-default.png`, `project-rail-card-light.png`.

#### project-rail-section

Right rail card section.

Snapshot: `project-dark`. Finder: `() => CK(T('Instructions', M()), 'clickable')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 318 x 136 | = |
| Padding | 16px 12px 16px 16px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span.text-sm.truncate: -apple-system 14px/20px 500, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #b3b3b3 2px | = |
| Painted layers | button.inline-flex.items-center.justify-center 64.4x32.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px | div.p-4.pe-3.clickable 318.0x136.0 bg #ffffff @ 0.04; button.inline-flex.items-center.justify-center 64.4x32.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px |
| Tokens | --Button-border-secondary #ffffff1f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-density-small-row-height 32px | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 318 x 136 | = |
| Padding | 16px 12px 16px 16px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span.text-sm.truncate: -apple-system 14px/20px 500, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #4d4d4d 2px | = |
| Painted layers | button.inline-flex.items-center.justify-center 64.4x32.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px | div.p-4.pe-3.clickable 318.0x136.0 bg #37352f @ 0.04; button.inline-flex.items-center.justify-center 64.4x32.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px |
| Tokens | --Button-border-secondary #0000001f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373; --ui-density-small-row-height 32px | = |
| How | at rest | mouse hover |

Crops: `project-rail-section-default.png`, `project-rail-section-hover.png`, `project-rail-section-light.png`, `project-rail-section-light-hover.png`.

#### project-add-button

Rail Add button (outline small).

Snapshot: `project-dark`. Finder: `() => C(T('Add', CK(T('Instructions', M()), 'rounded-[12px]')), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 64.39 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #ffffff @ 0.12 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span: -apple-system 14px/18px 500, #e6e6e6 | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #e6e6e6 | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 64.4x32.0 r 8px outline 1px solid #ffffff @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 64.4x32.0 bg #ffffff @ 0.04 r 8px outline 1px solid #ffffff @ 0.12 offset -1px opacity 0.9 | = |
| Tokens | --Button-border-secondary #ffffff1f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |
| Ancestor paint | - | 1 up div.p-4.pe-3.clickable bg #ffffff @ 0.04 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 64.39 x 32 | = | = |
| Padding | 0px 8px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | 1px solid #000000 @ 0.12 offset -1px | = | = |
| Font | -apple-system 14px/18px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span: -apple-system 14px/18px 500, #1a1a1a | = | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #1a1a1a | = | = |
| Painted layers | button.inline-flex.items-center.justify-center 64.4x32.0 r 8px outline 1px solid #000000 @ 0.12 offset -1px | button.inline-flex.items-center.justify-center 64.4x32.0 bg #37352f @ 0.04 r 8px outline 1px solid #000000 @ 0.12 offset -1px opacity 0.9 | = |
| Tokens | --Button-border-secondary #0000001f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --ui-density-small-row-height 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.9 | = |
| Ancestor paint | - | 1 up div.p-4.pe-3.clickable bg #37352f @ 0.04 | = |

Crops: `project-add-button-default.png`, `project-add-button-hover.png`, `project-add-button-focus-visible.png`, `project-add-button-light.png`, `project-add-button-light-hover.png`, `project-add-button-light-focus-visible.png`.

#### project-connectors

Connectors row.

Snapshot: `project-dark`. Finder: `() => CK(T('Connectors', M()), 'clickable')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 290 x 36 | = |
| Padding | 8px 12px | = |
| Gap | 4px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | #ffffff @ 0.04 | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span.flex-1.text-sm: -apple-system 14px/20px 500, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #b3b3b3 2px | = |
| Painted layers | div.flex.h-9.min-h-9 290.0x36.0 bg #ffffff @ 0.04 r 8px | div.flex.h-9.min-h-9 290.0x36.0 bg #ffffff @ 0.06 r 8px |
| Tokens | --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --text-secondary #b3b3b3 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 290 x 36 | = |
| Padding | 8px 12px | = |
| Gap | 4px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | #37352f @ 0.04 | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span.flex-1.text-sm: -apple-system 14px/20px 500, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #4d4d4d 2px | = |
| Painted layers | div.flex.h-9.min-h-9 290.0x36.0 bg #37352f @ 0.04 r 8px | div.flex.h-9.min-h-9 290.0x36.0 bg #37352f @ 0.06 r 8px |
| Tokens | --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --text-secondary #4d4d4d | = |
| How | at rest | mouse hover |

Crops: `project-connectors-default.png`, `project-connectors-hover.png`, `project-connectors-light.png`, `project-connectors-light-hover.png`.

#### project-composer

Project composer.

Snapshot: `project-dark`. Finder: `() => P(Q('[contenteditable=true]'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 740 x 120 |
| Padding | 12px 0px |
| Gap | 12px |
| Border | 1px solid #ffffff @ 0.06 |
| Radius | 22px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.truncate: -apple-system 12px/16px 500, #8c8c8c |
| Transition | none |
| Icon | 17 x 17, colour #b3b3b3, stroke #b3b3b3 2px |
| Placeholder | "Start a task in this project" #8c8c8c, opacity 1, 16px |
| Painted layers | div.flex.flex-col.relative 740.0x120.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 22px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px; button.justify-center.whitespace-nowrap.font-medium 89.5x32.0 r 100px outline 1px solid #ffffff @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 136.5x32.0 r 9999px outline 1px solid #ffffff @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.08 r 9999px |
| Ancestor paint | 1 up div.relative bg #1a1a1a |
| Tokens | --accent-send-button #fffffff2; --background-menu-white #242424; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a; --icon-primary #e6e6e6; --icon-secondary #b3b3b3; --text-onblack #000000e5; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 740 x 120 |
| Padding | 12px 0px |
| Gap | 12px |
| Border | 1px solid #e5e7eb |
| Radius | 22px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.truncate: -apple-system 12px/16px 500, #737373 |
| Transition | none |
| Icon | 17 x 17, colour #4d4d4d, stroke #4d4d4d 2px |
| Placeholder | "Start a task in this project" #737373, opacity 1, 16px |
| Painted layers | div.flex.flex-col.relative 740.0x120.0 bg #ffffff border T:1px solid #e5e7eb / R:1px solid #e5e7eb / B:1px solid #e5e7eb / L:1px solid #e5e7eb r 22px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px; button.justify-center.whitespace-nowrap.font-medium 89.5x32.0 r 100px outline 1px solid #000000 @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 136.5x32.0 r 9999px outline 1px solid #000000 @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.08 r 9999px |
| Ancestor paint | 1 up div.relative bg #f8f8f7 |
| Tokens | --accent-send-button #1a1a19; --background-menu-white #fff; --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a; --icon-primary #1a1a1a; --icon-secondary #4d4d4d; --text-onblack #fff; --text-primary #1a1a1a |
| How | at rest |

Crops: `project-composer-default.png`, `project-composer-light.png`.

### Task

#### user-bubble

User message bubble. Right-aligned, at most 662 wide, radius from --ui-density-card-radius on --fill-tsp-white-main.

Snapshot: `task-dark-thread-top`. Finder: `() => CK(TS('This is for my singapore', Q('.group\\/turn')), 'max-w-full overflow-hidden')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 662.39 x 72 |
| Padding | 12px |
| Border | none |
| Radius | 12px 12px 4px 12px |
| Background | #242424 |
| Box shadow | none |
| Outline | 1px solid #ffffff @ 0.03 offset 0px |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.limited-markdown-content.u-break-words.whitespace-pre-wrap: -apple-system 16px/24px 400, #e6e6e6 |
| Transition | none |
| Painted layers | div.relative.max-w-full.overflow-hidden 662.4x72.0 bg #242424 r 12px 12px 4px outline 1px solid #ffffff @ 0.03 offset 0px |
| Tokens | --border-light #ffffff08; --text-primary #e6e6e6; --ui-density-bubble-padding-y 12px; --ui-density-card-radius 12px; --ui-density-content-padding 12px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 662.39 x 72 |
| Padding | 12px |
| Border | none |
| Radius | 12px 12px 4px 12px |
| Background | #ffffff |
| Box shadow | none |
| Outline | 1px solid #000000 @ 0.04 offset 0px |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.limited-markdown-content.u-break-words.whitespace-pre-wrap: -apple-system 16px/24px 400, #1a1a1a |
| Transition | none |
| Painted layers | div.relative.max-w-full.overflow-hidden 662.4x72.0 bg #ffffff r 12px 12px 4px outline 1px solid #000000 @ 0.04 offset 0px |
| Tokens | --border-light #0000000a; --text-primary #1a1a1a; --ui-density-bubble-padding-y 12px; --ui-density-card-radius 12px; --ui-density-content-padding 12px |
| How | at rest |

Crops: `user-bubble-default.png`, `user-bubble-light.png`.

#### user-attachment

Attachment chip (in the thread).

Snapshot: `task-dark-thread-top`. Finder: `() => CK(T('CourseOutline_2026.docx', M()), 'group/attach')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 280 x 56 | = |
| Padding | 8px 10px 8px 8px | = |
| Gap | 6px | = |
| Border | 1px solid #ffffff @ 0.12 | = |
| Radius | 12px | = |
| Background | #242424 | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.text-sm.truncate.flex-1: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 32 x 32, colour #e6e6e6 | = |
| Painted layers | div.flex.items-center.gap-1.5 280.0x56.0 bg #242424 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px | div.flex.items-center.gap-1.5 280.0x56.0 bg #ffffff @ 0.06 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px |
| Tokens | --background-menu-white #242424; --background-tsp-menu-white #ffffff0f; --border-dark #ffffff1f; --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 280 x 56 | = |
| Padding | 8px 10px 8px 8px | = |
| Gap | 6px | = |
| Border | 1px solid #000000 @ 0.14 | = |
| Radius | 12px | = |
| Background | #ffffff | #ffffff @ 0.08 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.text-sm.truncate.flex-1: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 32 x 32, colour #1a1a1a | = |
| Painted layers | div.flex.items-center.gap-1.5 280.0x56.0 bg #ffffff border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px | div.flex.items-center.gap-1.5 280.0x56.0 bg #ffffff @ 0.08 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px |
| Tokens | --background-menu-white #fff; --background-tsp-menu-white #ffffff14; --border-dark #00000024; --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d; --text-primary #1a1a1a; --text-tertiary #737373 | = |
| How | at rest | mouse hover |

Crops: `user-attachment-default.png`, `user-attachment-hover.png`, `user-attachment-light.png`, `user-attachment-light-hover.png`.

#### message-time

Message time. Shown with the copy button only while the message is hovered.

Snapshot: `task-dark-thread-top`. Finder: `() => Q('.group\\/turn').querySelector('.float-right')`.

Dark theme.

| Property | hover |
|---|---|
| Size (w x h) | 35.61 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, -webkit-backdrop-filter, backdrop-filter 0.15s cubic-bezier(0.4, 0, 0.2, 1) |
| Tokens | --text-tertiary #8c8c8c |
| How | mouse hover on its row |

Light theme.

| Property | light-hover |
|---|---|
| Size (w x h) | 35.61 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, -webkit-backdrop-filter, backdrop-filter 0.15s cubic-bezier(0.4, 0, 0.2, 1) |
| Tokens | --text-tertiary #737373 |
| How | mouse hover on its row |

Crops: `message-time-hover.png`, `message-time-light-hover.png`.

#### assistant-header

Assistant turn header (logo, wordmark, Lite tag).

Snapshot: `task-dark-thread-top`. Finder: `() => T('Lite', M()).parentElement`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 136.91 x 24 |
| Padding | 0px |
| Gap | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.text-xs.flex.h-5: -apple-system 12px/16px 400, #8c8c8c |
| Transition | none |
| Icon | 24 x 24, colour #e6e6e6 |
| Painted layers | span.text-xs.flex.h-5 34.9x20.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 6px |
| Tokens | --border-dark #ffffff1f; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 136.91 x 24 |
| Padding | 0px |
| Gap | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.text-xs.flex.h-5: -apple-system 12px/16px 400, #737373 |
| Transition | none |
| Icon | 24 x 24, colour #1a1a1a |
| Painted layers | span.text-xs.flex.h-5 34.9x20.0 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 6px |
| Tokens | --border-dark #00000024; --text-tertiary #737373 |
| How | at rest |

Crops: `assistant-header-default.png`, `assistant-header-light.png`.

#### lite-tag

Lite tag.

Snapshot: `task-dark-thread-top`. Finder: `() => T('Lite', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 34.91 x 20 |
| Padding | 2px 6px |
| Gap | 4px |
| Border | 1px solid #ffffff @ 0.12 |
| Radius | 6px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | none |
| Painted layers | span.text-xs.flex.h-5 34.9x20.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 6px |
| Tokens | --border-dark #ffffff1f; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 34.91 x 20 |
| Padding | 2px 6px |
| Gap | 4px |
| Border | 1px solid #000000 @ 0.14 |
| Radius | 6px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 12px/16px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | none |
| Painted layers | span.text-xs.flex.h-5 34.9x20.0 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 6px |
| Tokens | --border-dark #00000024; --text-tertiary #737373 |
| How | at rest |

Crops: `lite-tag-default.png`, `lite-tag-light.png`.

#### assistant-text

Assistant message text.

Snapshot: `task-dark-thread-top`. Finder: `() => TS("I've received your course outline", M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 736 x 48 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.whitespace-pre-wrap.u-break-words: -apple-system 16px/24px 400, #e6e6e6 |
| Transition | none |
| Tokens | --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 736 x 48 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.whitespace-pre-wrap.u-break-words: -apple-system 16px/24px 400, #1a1a1a |
| Transition | none |
| Tokens | --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a |
| How | at rest |

Crops: `assistant-text-default.png`, `assistant-text-light.png`.

#### step-row

Plan step row. 28 tall, 14px --text-secondary, a 17px round dot on --fill-tsp-white-dark holding a check; the time shows on hover.

Snapshot: `task-dark-thread-top`. Finder: `() => C(TS('Extract and analyze the Economy', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 736 x 28 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #b3b3b3 | #e6e6e6 | = |
| Text node | span.min-w-0.max-w-full.overflow-hidden: -apple-system 14px/20px 400, #b3b3b3 | span.min-w-0.max-w-full.overflow-hidden: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 9 x 9, colour #8c8c8c | = | = |
| Painted layers | div.rounded-full.flex.items-center 17.0x17.0 bg #ffffff @ 0.08 r 9999px | = | = |
| Tokens | --fill-tsp-white-dark #ffffff14; --icon-tertiary #8c8c8c; --text-primary #e6e6e6; --text-secondary #b3b3b3; --text-tertiary #8c8c8c | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 736 x 28 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #4d4d4d | #1a1a1a | = |
| Text node | span.min-w-0.max-w-full.overflow-hidden: -apple-system 14px/20px 400, #4d4d4d | span.min-w-0.max-w-full.overflow-hidden: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 9 x 9, colour #737373 | = | = |
| Painted layers | div.rounded-full.flex.items-center 17.0x17.0 bg #37352f @ 0.08 r 9999px | = | = |
| Tokens | --fill-tsp-white-dark #37352f14; --icon-tertiary #737373; --text-primary #1a1a1a; --text-secondary #4d4d4d; --text-tertiary #737373 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `step-row-default.png`, `step-row-hover.png`, `step-row-focus-visible.png`, `step-row-light.png`, `step-row-light-hover.png`, `step-row-light-focus-visible.png`.

#### step-dot

Plan step dot.

Snapshot: `task-dark-thread-top`. Finder: `() => K('rounded-full size-[17px]', 0, C(TS('Extract and analyze the Economy', M()), 'button'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 17 x 17 |
| Padding | 0px |
| Border | none |
| Radius | 9999px |
| Background | #ffffff @ 0.08 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/21px 400 |
| Letter spacing | normal |
| Colour | #b3b3b3 |
| Transition | none |
| Cursor | pointer |
| Icon | 9 x 9, colour #8c8c8c |
| Painted layers | div.rounded-full.flex.items-center 17.0x17.0 bg #ffffff @ 0.08 r 9999px |
| Tokens | --fill-tsp-white-dark #ffffff14; --icon-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 17 x 17 |
| Padding | 0px |
| Border | none |
| Radius | 9999px |
| Background | #37352f @ 0.08 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/21px 400 |
| Letter spacing | normal |
| Colour | #4d4d4d |
| Transition | none |
| Cursor | pointer |
| Icon | 9 x 9, colour #737373 |
| Painted layers | div.rounded-full.flex.items-center 17.0x17.0 bg #37352f @ 0.08 r 9999px |
| Tokens | --fill-tsp-white-dark #37352f14; --icon-tertiary #737373 |
| How | at rest |

Crops: `step-dot-default.png`, `step-dot-light.png`.

#### message-action

Message action icon button.

Snapshot: `task-dark-thread-top`. Finder: `() => C(at(516, 472), '.cursor-pointer')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 28 x 28 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | #ffffff @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #8c8c8c, stroke #8c8c8c 2px | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-tertiary #8c8c8c | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 28.0x28.0 bg #ffffff @ 0.04 r 6px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 28 x 28 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #737373, stroke #737373 2px | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-tertiary #737373 | = |
| How | at rest | mouse hover |
| Painted layers | - | div.flex.items-center.justify-center 28.0x28.0 bg #37352f @ 0.04 r 6px |

Crops: `message-action-default.png`, `message-action-hover.png`, `message-action-light.png`, `message-action-light-hover.png`.

#### deliverable-card

Deliverable card. 570 wide, radius 12, a 0.5px --border-dark hairline on --background-menu-white; a 61 tall header (icon, 14px 500 title, download and more) over a 16:9 preview.

Snapshot: `task-dark-completed`. Finder: `() => K('border-solid rounded-[12px] overflow-hidden', 0, M())`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 570 x 382.5 | = |
| Padding | 0px | = |
| Border | 1px solid #ffffff @ 0.12 | = |
| Radius | 12px | = |
| Background | #242424 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.font-medium.leading-5.overflow-hidden: -apple-system 14px/20px 500, #e6e6e6, ls -0.154px | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 27 x 27, colour #e6e6e6 | = |
| Painted layers | div.border-solid.overflow-hidden.flex 570.0x382.5 bg #242424 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px; div.flex.items-center.justify-between 568.0x61.0 border B:1px solid #ffffff @ 0.06; div.relative.flex.w-full 568.0x319.5 bg #ffffff @ 0.06; div.absolute 252.8x142.2 bg #0d0f12 | = |
| Tokens | --background-menu-white #242424; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 570 x 382.5 | = |
| Padding | 0px | = |
| Border | 1px solid #000000 @ 0.14 | = |
| Radius | 12px | = |
| Background | #ffffff | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.font-medium.leading-5.overflow-hidden: -apple-system 14px/20px 500, #1a1a1a, ls -0.154px | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 27 x 27, colour #1a1a1a | = |
| Painted layers | div.border-solid.overflow-hidden.flex 570.0x382.5 bg #ffffff border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px; div.flex.items-center.justify-between 568.0x61.0 border B:1px solid #000000 @ 0.06; div.relative.flex.w-full 568.0x319.5 bg #37352f @ 0.06; div.absolute 252.8x142.2 bg #0d0f12 | = |
| Tokens | --background-menu-white #fff; --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a | = |
| How | at rest | mouse hover |

Crops: `deliverable-card-default.png`, `deliverable-card-hover.png`, `deliverable-card-light.png`, `deliverable-card-light-hover.png`.

#### deliverable-header

Deliverable card header.

Snapshot: `task-dark-completed`. Finder: `() => K('border-solid rounded-[12px] overflow-hidden', 0, M()).firstElementChild`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 568 x 61 |
| Padding | 14px 12px |
| Border | T: none; R: none; B: 1px solid #ffffff @ 0.06; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.font-medium.leading-5.overflow-hidden: -apple-system 14px/20px 500, #e6e6e6, ls -0.154px |
| Transition | none |
| Cursor | pointer |
| Icon | 27 x 27, colour #e6e6e6 |
| Painted layers | div.flex.items-center.justify-between 568.0x61.0 border B:1px solid #ffffff @ 0.06 |
| Ancestor paint | 1 up div.border-solid.overflow-hidden.flex bg #242424 |
| Tokens | --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 568 x 61 |
| Padding | 14px 12px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0.06; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.font-medium.leading-5.overflow-hidden: -apple-system 14px/20px 500, #1a1a1a, ls -0.154px |
| Transition | none |
| Cursor | pointer |
| Icon | 27 x 27, colour #1a1a1a |
| Painted layers | div.flex.items-center.justify-between 568.0x61.0 border B:1px solid #000000 @ 0.06 |
| Ancestor paint | 1 up div.border-solid.overflow-hidden.flex bg #ffffff |
| Tokens | --border-main #0000000f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a |
| How | at rest |

Crops: `deliverable-header-default.png`, `deliverable-header-light.png`.

#### deliverable-menu

Deliverable more button.

Snapshot: `task-dark-completed`. Finder: `() => { const b = K('border-solid rounded-[12px] overflow-hidden', 0, M()).firstElementChild.querySelectorAll('button'); return b[b.length - 1]; }`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 8px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #8c8c8c 2px | = | = |
| Tokens | --fill-tsp-white-light #ffffff0a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.04 r 8px | = |
| Ancestor paint | - | 3 up div.border-solid.overflow-hidden.flex bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 0.5px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 8px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #737373 2px | = | = |
| Tokens | --fill-tsp-white-light #37352f0a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.04 r 8px | = |
| Ancestor paint | - | 3 up div.border-solid.overflow-hidden.flex bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 0.5px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px | = |

Crops: `deliverable-menu-default.png`, `deliverable-menu-hover.png`, `deliverable-menu-focus-visible.png`, `deliverable-menu-light.png`, `deliverable-menu-light-hover.png`, `deliverable-menu-light-focus-visible.png`.

#### deliverable-doc

Deliverable card (document preview).

Snapshot: `task-dark-thread-top`. Finder: `() => K('border-solid rounded-[12px] overflow-hidden', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 570 x 382.5 |
| Padding | 0px |
| Border | 1px solid #ffffff @ 0.12 |
| Radius | 12px |
| Background | #242424 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.text-sm.truncate.overflow-hidden: -apple-system 14px/20px 500, #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| Icon | 24 x 24, colour #e6e6e6 |
| Painted layers | div.border-solid.overflow-hidden.flex 570.0x382.5 bg #242424 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px; div.flex.items-center.border-b 568.0x61.0 border B:1px solid #ffffff @ 0.06; div.pointer-events-none.absolute.left-0 568.0x40.0 image linear-gradient(#1f1f1f @ 0 0%, #1f1f1f 100%) |
| Tokens | --background-menu-white #242424; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 570 x 382.5 |
| Padding | 0px |
| Border | 1px solid #000000 @ 0.14 |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.text-sm.truncate.overflow-hidden: -apple-system 14px/20px 500, #1a1a1a |
| Transition | none |
| Cursor | pointer |
| Icon | 24 x 24, colour #1a1a1a |
| Painted layers | div.border-solid.overflow-hidden.flex 570.0x382.5 bg #ffffff border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px; div.flex.items-center.border-b 568.0x61.0 border B:1px solid #000000 @ 0.06; div.pointer-events-none.absolute.left-0 568.0x40.0 image linear-gradient(#1f1f1f @ 0 0%, #1f1f1f 100%) |
| Tokens | --background-menu-white #fff; --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a |
| How | at rest |

Crops: `deliverable-doc-default.png`, `deliverable-doc-light.png`.

#### file-chip

File chip. 280x56, radius 12, 0.5px border; a 32px file icon, name over type and size, a download button that appears on hover.

Snapshot: `task-dark-completed`. Finder: `() => CK(T('Markdown · 9.64 KB', M()), 'group/attach')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 280 x 56 | = |
| Padding | 8px 10px 8px 8px | = |
| Gap | 6px | = |
| Border | 1px solid #ffffff @ 0.12 | = |
| Radius | 12px | = |
| Background | #242424 | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.text-sm.truncate.flex-1: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 32 x 32, colour #e6e6e6 | = |
| Painted layers | div.flex.items-center.gap-1.5 280.0x56.0 bg #242424 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px | div.flex.items-center.gap-1.5 280.0x56.0 bg #ffffff @ 0.06 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px |
| Tokens | --background-menu-white #242424; --background-tsp-menu-white #ffffff0f; --border-dark #ffffff1f; --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 280 x 56 | = |
| Padding | 8px 10px 8px 8px | = |
| Gap | 6px | = |
| Border | 1px solid #000000 @ 0.14 | = |
| Radius | 12px | = |
| Background | #ffffff | #ffffff @ 0.08 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.text-sm.truncate.flex-1: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 32 x 32, colour #1a1a1a | = |
| Painted layers | div.flex.items-center.gap-1.5 280.0x56.0 bg #ffffff border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px | div.flex.items-center.gap-1.5 280.0x56.0 bg #ffffff @ 0.08 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px |
| Tokens | --background-menu-white #fff; --background-tsp-menu-white #ffffff14; --border-dark #00000024; --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d; --text-primary #1a1a1a; --text-tertiary #737373 | = |
| How | at rest | mouse hover |

Crops: `file-chip-default.png`, `file-chip-hover.png`, `file-chip-light.png`, `file-chip-light-hover.png`.

#### view-all-files

View all files in this task button.

Snapshot: `task-dark-completed`. Finder: `() => CK(T('View all files in this task', M()), 'cursor-pointer')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 280 x 55 | = |
| Padding | 0px 6px 0px 16px | = |
| Gap | 6px | = |
| Border | 1px solid #ffffff @ 0.12 | = |
| Radius | 12px | = |
| Background | #242424 | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span.text-sm: -apple-system 14px/20px 400, #b3b3b3 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #b3b3b3 2px | = |
| Painted layers | div.ps-4.pe-1.5.w-full 280.0x55.0 bg #242424 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px | div.ps-4.pe-1.5.w-full 280.0x55.0 bg #ffffff @ 0.06 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px |
| Tokens | --background-menu-white #242424; --background-tsp-menu-white #ffffff0f; --border-dark #ffffff1f; --icon-secondary #b3b3b3 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 280 x 55 | = |
| Padding | 0px 6px 0px 16px | = |
| Gap | 6px | = |
| Border | 1px solid #000000 @ 0.14 | = |
| Radius | 12px | = |
| Background | #ffffff | #ffffff @ 0.08 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span.text-sm: -apple-system 14px/20px 400, #4d4d4d | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #4d4d4d 2px | = |
| Painted layers | div.ps-4.pe-1.5.w-full 280.0x55.0 bg #ffffff border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px | div.ps-4.pe-1.5.w-full 280.0x55.0 bg #ffffff @ 0.08 border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px |
| Tokens | --background-menu-white #fff; --background-tsp-menu-white #ffffff14; --border-dark #00000024; --icon-secondary #4d4d4d | = |
| How | at rest | mouse hover |

Crops: `view-all-files-default.png`, `view-all-files-hover.png`, `view-all-files-light.png`, `view-all-files-light-hover.png`.

#### task-completed

Task completed status.

Snapshot: `task-dark-completed`. Finder: `() => CK(T('Task completed', M()), 'rounded-full')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 133.89 x 20 |
| Padding | 0px 8px 0px 0px |
| Gap | 8px |
| Border | none |
| Radius | 9999px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 400 |
| Letter spacing | normal |
| Colour | #5eb92d |
| Text node | span: -apple-system 14px/20px 400, #5eb92d |
| Transition | none |
| Icon | 16 x 16, colour #5eb92d, stroke #5eb92d 2px |
| Tokens | --function-success #5eb92d |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 133.89 x 20 |
| Padding | 0px 8px 0px 0px |
| Gap | 8px |
| Border | none |
| Radius | 9999px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 400 |
| Letter spacing | normal |
| Colour | #25ba3b |
| Text node | span: -apple-system 14px/20px 400, #25ba3b |
| Transition | none |
| Icon | 16 x 16, colour #25ba3b, stroke #25ba3b 2px |
| Tokens | --function-success #25ba3b |
| How | at rest |

Crops: `task-completed-default.png`, `task-completed-light.png`.

#### rating

Rating row (How was this result?).

Snapshot: `task-dark-completed`. Finder: `() => T('How was this result?', M()).parentElement`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 252.27 x 32 |
| Padding | 6px 0px |
| Gap | 8px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.text-sm: -apple-system 14px/20px 400, #b3b3b3 |
| Transition | none |
| Icon | 16 x 16, colour #ffffff @ 0.12 |
| Tokens | --text-secondary #b3b3b3 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 252.27 x 32 |
| Padding | 6px 0px |
| Gap | 8px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.text-sm: -apple-system 14px/20px 400, #4d4d4d |
| Transition | none |
| Icon | 16 x 16, colour #000000 @ 0.14 |
| Tokens | --text-secondary #4d4d4d |
| How | at rest |

Crops: `rating-default.png`, `rating-light.png`.

#### rating-star

Rating star.

Snapshot: `task-dark-completed`. Finder: `() => { const s = T('How was this result?', M()).parentElement.querySelector('svg'); return C(s, 'button, [role=button], span, div') // s; }`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 20 x 20 | = |
| Padding | 2px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #ffffff @ 0.12 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 20 x 20 | = |
| Padding | 2px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #000000 @ 0.14 | = |
| How | at rest | mouse hover |

Crops: `rating-star-default.png`, `rating-star-hover.png`, `rating-star-light.png`, `rating-star-light-hover.png`.

#### suggestion-row

Follow-up suggestion row.

Snapshot: `task-dark-completed`. Finder: `() => CK(TS('Make the process we used', M()), 'clickable')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 760 x 38 | = |
| Padding | 9px 12px | = |
| Gap | 16px | = |
| Border | none | = |
| Radius | 0px | 10px |
| Background | transparent | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span.text-sm.flex-1.min-w-0: -apple-system 14px/20px 400, #b3b3b3 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #8c8c8c | = |
| ::after | 736px x 1px, absolute, bg #ffffff @ 0.06, radius 0px | auto x 1px, absolute, bg #ffffff @ 0.06, radius 0px |
| Painted layers | div.+.12px)].flex::after 736pxx1px bg #ffffff @ 0.06 | div.+.12px)].flex 760.0x38.0 bg #ffffff @ 0.06 r 10px; div.+.12px)].flex::after autox1px bg #ffffff @ 0.06 |
| Tokens | --border-main #ffffff0f; --fill-tsp-white-main #ffffff0f; --text-secondary #b3b3b3; --ui-density-suggestion-padding-y 9px | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 760 x 38 | = |
| Padding | 9px 12px | = |
| Gap | 16px | = |
| Border | none | = |
| Radius | 0px | 10px |
| Background | transparent | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span.text-sm.flex-1.min-w-0: -apple-system 14px/20px 400, #4d4d4d | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #737373 | = |
| ::after | 736px x 1px, absolute, bg #000000 @ 0.06, radius 0px | auto x 1px, absolute, bg #000000 @ 0.06, radius 0px |
| Painted layers | div.+.12px)].flex::after 736pxx1px bg #000000 @ 0.06 | div.+.12px)].flex 760.0x38.0 bg #37352f @ 0.06 r 10px; div.+.12px)].flex::after autox1px bg #000000 @ 0.06 |
| Tokens | --border-main #0000000f; --fill-tsp-white-main #37352f0f; --text-secondary #4d4d4d; --ui-density-suggestion-padding-y 9px | = |
| How | at rest | mouse hover |

Crops: `suggestion-row-default.png`, `suggestion-row-hover.png`, `suggestion-row-light.png`, `suggestion-row-light-hover.png`.

#### step-footer

Step footer above the composer. A rounded-top (22) card on --background-card-gray tucked 20px under the composer, with a thumbnail of the computer, the current step and "Step 4/4".

Snapshot: `task-dark-completed`. Finder: `() => CK(T('Step 4/4', M()), 'rounded-t-[22px] border')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 61 |
| Padding | 0px 0px 19px 0px |
| Border | 1px solid #ffffff @ 0.06 |
| Radius | 22px 22px 0px 0px |
| Background | #1c1c1c |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.08 0px 8px 16px 0px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | button.inline-flex.items-center.justify-center: -apple-system 12px/16px 400, #8c8c8c |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6, stroke #5eb92d 2px |
| Painted layers | div.border.-mb-5 768.0x61.0 bg #1c1c1c border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 22px 22px 0px 0px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.08 0px 8px 16px 0px; div.clickable.overflow-hidden.group::after 30pxx20px r 4px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.12 0px 0px 0px 0.5px inset; div.flex.flex-col.overflow-hidden 30.0x20.0 bg #1a1a1a r 4px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.2 0px 4px 32px 0px; div.backdrop-blur-3xl.inline-flex.h-7 16.0x2.0 bg #ffffff @ 0.04 r 8px; button.inline-flex.items-center.justify-center 6.2x1.7 bg #242424 r 6px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.16 0px 0px 2px 0px; div.flex-1.min-h-0.h-full 30.0x16.9 outline 2px solid #000000 @ 0 offset 2px |
| Tokens | --background-card-gray #1c1c1c; --background-gray-main #1a1a1a; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-white #242424; --shadow-S #00000029; --shadow-XS #00000014; --shadows-drop-2 #0003; --tab-fill #ffffff0a; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 61 |
| Padding | 0px 0px 19px 0px |
| Border | 1px solid #000000 @ 0.06 |
| Radius | 22px 22px 0px 0px |
| Background | #fafafa |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 8px 16px 0px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | button.inline-flex.items-center.justify-center: -apple-system 12px/16px 400, #737373 |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a, stroke #25ba3b 2px |
| Painted layers | div.border.-mb-5 768.0x61.0 bg #fafafa border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 22px 22px 0px 0px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 8px 16px 0px; div.clickable.overflow-hidden.group::after 30pxx20px r 4px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.14 0px 0px 0px 0.5px inset; div.flex.flex-col.overflow-hidden 30.0x20.0 bg #f8f8f7 r 4px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #16191d @ 0.04 0px 4px 32px 0px; div.backdrop-blur-3xl.inline-flex.h-7 16.0x2.0 bg #000000 @ 0.04 r 8px; button.inline-flex.items-center.justify-center 6.2x1.7 bg #ffffff r 6px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 2px 0px; div.flex-1.min-h-0.h-full 30.0x16.9 outline 2px solid #000000 @ 0 offset 2px |
| Tokens | --background-card-gray #fafafa; --background-gray-main #f8f8f7; --border-dark #00000024; --border-main #0000000f; --fill-white #fff; --shadow-S #0000000a; --shadow-XS #00000005; --shadows-drop-2 #16191d0a; --tab-fill #0000000a; --text-primary #1a1a1a |
| How | at rest |

Crops: `step-footer-default.png`, `step-footer-light.png`.

#### step-footer-row

Step footer row.

Snapshot: `task-dark-completed`. Finder: `() => CK(T('Step 4/4', M()), 'clickable group')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 766 x 40 | = |
| Padding | 10px 16px | = |
| Border | none | = |
| Radius | 22px 22px 0px 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | div.min-w-0.truncate.text-sm: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #e6e6e6, stroke #5eb92d 2px | = |
| Ancestor paint | 3 up div.border.-mb-5 bg #1c1c1c shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.08 0px 8px 16px 0px | = |
| Tokens | --icon-tertiary #8c8c8c; --text-tertiary #8c8c8c | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 766 x 40 | = |
| Padding | 10px 16px | = |
| Border | none | = |
| Radius | 22px 22px 0px 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | div.min-w-0.truncate.text-sm: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #1a1a1a, stroke #25ba3b 2px | = |
| Ancestor paint | 3 up div.border.-mb-5 bg #fafafa shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 8px 16px 0px | = |
| Tokens | --icon-tertiary #737373; --text-tertiary #737373 | = |
| How | at rest | mouse hover |

Crops: `step-footer-row-default.png`, `step-footer-row-hover.png`, `step-footer-row-light.png`, `step-footer-row-light-hover.png`.

#### step-footer-count

Step count.

Snapshot: `task-dark-completed`. Finder: `() => T('Step 4/4', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 51.77 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | none |
| Cursor | pointer |
| Tokens | --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 51.77 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 13px/18px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | none |
| Cursor | pointer |
| Tokens | --text-tertiary #737373 |
| How | at rest |

Crops: `step-footer-count-default.png`, `step-footer-count-light.png`.

#### side-panel

Side panel. 570 wide at 1440, beside a 570 thread column, split by a 1px handle that widens to 5px blue on hover.

Snapshot: `task-dark-side-panel`. Finder: `() => W(at(1150, 500), 569)`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 570 x 852 |
| Padding | 32px 24px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div: -apple-system 14px/21px 500, #e6e6e6 |
| Transition | none |
| Icon | 22 x 22, colour #b3b3b3, stroke #b3b3b3 2px |
| Painted layers | div.flex.items-center.justify-center 44.0x44.0 bg #ffffff @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px |
| Tokens | --background-menu-white #242424; --border-main #ffffff0f; --fill-tsp-gray-main #0003; --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3; --text-primary #e6e6e6; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 570 x 852 |
| Padding | 32px 24px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div: -apple-system 14px/21px 500, #1a1a1a |
| Transition | none |
| Icon | 22 x 22, colour #4d4d4d, stroke #4d4d4d 2px |
| Painted layers | div.flex.items-center.justify-center 44.0x44.0 bg #37352f @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px |
| Tokens | --background-menu-white #fff; --border-main #0000000f; --fill-tsp-gray-main #37352f0a; --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d; --text-primary #1a1a1a; --text-tertiary #737373 |
| How | at rest |

Crops: `side-panel-default.png`, `side-panel-light.png`.

#### side-panel-tabbar

Side panel tab bar.

Snapshot: `task-dark-side-panel`. Finder: `() => CK(Q('[data-context-menu=sidebar-tab]'), 'h-[48px]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 570 x 48 |
| Padding | 0px 12px 0px 0px |
| Gap | 4px |
| Border | T: none; R: none; B: 1px solid #ffffff @ 0.06; L: none |
| Radius | 0px |
| Background | #1a1a1a |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.min-w-0.flex-1.overflow-hidden: -apple-system 13px/19.5px 400, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #b3b3b3, stroke #b3b3b3 2px |
| Painted layers | div.desktop-drag.flex.shrink-0 570.0x48.0 bg #1a1a1a border B:1px solid #ffffff @ 0.06; div.desktop-no-drag.group.relative 160.0x32.0 bg #ffffff @ 0.06 r 8px |
| Tokens | --background-gray-main #1a1a1a; --border-main #ffffff0f; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3; --icon-tertiary #8c8c8c; --tab-close-width (unset); --tab-title-mask (unset); --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 570 x 48 |
| Padding | 0px 12px 0px 0px |
| Gap | 4px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0.06; L: none |
| Radius | 0px |
| Background | #f8f8f7 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.min-w-0.flex-1.overflow-hidden: -apple-system 13px/19.5px 400, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #4d4d4d, stroke #4d4d4d 2px |
| Painted layers | div.desktop-drag.flex.shrink-0 570.0x48.0 bg #f8f8f7 border B:1px solid #000000 @ 0.06; div.desktop-no-drag.group.relative 160.0x32.0 bg #37352f @ 0.06 r 8px |
| Tokens | --background-gray-main #f8f8f7; --border-main #0000000f; --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d; --icon-tertiary #737373; --tab-close-width (unset); --tab-title-mask (unset); --text-primary #1a1a1a |
| How | at rest |

Crops: `side-panel-tabbar-default.png`, `side-panel-tabbar-light.png`.

#### side-panel-tab

Side panel tab.

Snapshot: `task-dark-side-panel`. Finder: `() => Q('[data-context-menu=sidebar-tab]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 160 x 32 | = |
| Padding | 0px 5px | = |
| Gap | 2px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | #ffffff @ 0.06 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 13px/19.5px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span.min-w-0.flex-1.overflow-hidden: -apple-system 13px/19.5px 400, #e6e6e6 | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0, 0, 0.2, 1) | = |
| Cursor | default | = |
| Icon | 16 x 16, colour #b3b3b3, stroke #b3b3b3 2px | = |
| Painted layers | div.desktop-no-drag.group.relative 160.0x32.0 bg #ffffff @ 0.06 r 8px | = |
| Tokens | --fill-tsp-white-dark #ffffff14; --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3; --icon-tertiary #8c8c8c; --tab-close-width (unset); --tab-title-mask (unset); --text-primary #e6e6e6 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 160 x 32 | = |
| Padding | 0px 5px | = |
| Gap | 2px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | #37352f @ 0.06 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 13px/19.5px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span.min-w-0.flex-1.overflow-hidden: -apple-system 13px/19.5px 400, #1a1a1a | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0, 0, 0.2, 1) | = |
| Cursor | default | = |
| Icon | 16 x 16, colour #4d4d4d, stroke #4d4d4d 2px | = |
| Painted layers | div.desktop-no-drag.group.relative 160.0x32.0 bg #37352f @ 0.06 r 8px | = |
| Tokens | --fill-tsp-white-dark #37352f14; --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d; --icon-tertiary #737373; --tab-close-width (unset); --tab-title-mask (unset); --text-primary #1a1a1a | = |
| How | at rest | mouse hover |

Crops: `side-panel-tab-default.png`, `side-panel-tab-hover.png`, `side-panel-tab-light.png`, `side-panel-tab-light-hover.png`.

#### side-panel-launcher

New tab launcher (+ and chevron).

Snapshot: `task-dark-side-panel`. Finder: `() => K('group/launcher')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 48 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Icon | 16 x 16, colour #b3b3b3, stroke #b3b3b3 2px | = |
| Tokens | --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3; --ui-density-small-row-height 32px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.group/launcher.flex.shrink-0 48.0x32.0 bg #ffffff @ 0.06 r 8px; div.flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.08; div.flex.items-center.justify-center 16.0x32.0 bg #ffffff @ 0.04 |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 48 x 32 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Icon | 16 x 16, colour #4d4d4d, stroke #4d4d4d 2px | = |
| Tokens | --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d; --ui-density-small-row-height 32px | = |
| How | at rest | mouse hover |
| Painted layers | - | div.group/launcher.flex.shrink-0 48.0x32.0 bg #37352f @ 0.06 r 8px; div.flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.08; div.flex.items-center.justify-center 16.0x32.0 bg #37352f @ 0.04 |

Crops: `side-panel-launcher-default.png`, `side-panel-launcher-hover.png`, `side-panel-launcher-light.png`, `side-panel-launcher-light-hover.png`.

#### new-tab-empty

New tab empty state.

Snapshot: `task-dark-side-panel`. Finder: `() => T('New tab').parentElement`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 440 x 273 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div: -apple-system 14px/21px 500, #e6e6e6 |
| Transition | none |
| Icon | 22 x 22, colour #b3b3b3, stroke #b3b3b3 2px |
| Painted layers | div.flex.items-center.justify-center 44.0x44.0 bg #ffffff @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px |
| Tokens | --background-menu-white #242424; --border-main #ffffff0f; --fill-tsp-gray-main #0003; --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3; --text-primary #e6e6e6; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 440 x 273 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div: -apple-system 14px/21px 500, #1a1a1a |
| Transition | none |
| Icon | 22 x 22, colour #4d4d4d, stroke #4d4d4d 2px |
| Painted layers | div.flex.items-center.justify-center 44.0x44.0 bg #37352f @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px; div.flex.w-full.cursor-pointer 216.0x72.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px |
| Tokens | --background-menu-white #fff; --border-main #0000000f; --fill-tsp-gray-main #37352f0a; --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d; --text-primary #1a1a1a; --text-tertiary #737373 |
| How | at rest |

Crops: `new-tab-empty-default.png`, `new-tab-empty-light.png`.

#### start-tile

Start from scratch tile.

Snapshot: `task-dark-side-panel`. Finder: `() => CK(T('Files'), 'min-h-[72px]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 216 x 72 | = |
| Padding | 12px | = |
| Gap | 8px | = |
| Border | 1px solid #ffffff @ 0.06 | = |
| Radius | 12px | = |
| Background | #242424 | #000000 @ 0.2 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span.min-w-0.flex-1.truncate: -apple-system 13px/18px 400, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #e6e6e6, stroke #b3b3b3 2px | = |
| Painted layers | div.flex.w-full.cursor-pointer 216.0x72.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px | div.flex.w-full.cursor-pointer 216.0x72.0 bg #000000 @ 0.2 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 12px |
| Tokens | --background-menu-white #242424; --border-main #ffffff0f; --fill-tsp-gray-main #0003; --text-primary #e6e6e6 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 216 x 72 | = |
| Padding | 12px | = |
| Gap | 8px | = |
| Border | 1px solid #000000 @ 0.06 | = |
| Radius | 12px | = |
| Background | #ffffff | #37352f @ 0.04 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span.min-w-0.flex-1.truncate: -apple-system 13px/18px 400, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 18 x 18, colour #1a1a1a, stroke #4d4d4d 2px | = |
| Painted layers | div.flex.w-full.cursor-pointer 216.0x72.0 bg #ffffff border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px | div.flex.w-full.cursor-pointer 216.0x72.0 bg #37352f @ 0.04 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 12px |
| Tokens | --background-menu-white #fff; --border-main #0000000f; --fill-tsp-gray-main #37352f0a; --text-primary #1a1a1a | = |
| How | at rest | mouse hover |

Crops: `start-tile-default.png`, `start-tile-hover.png`, `start-tile-light.png`, `start-tile-light-hover.png`.

#### resize-handle

Thread/panel resize handle.

Snapshot: `task-dark-side-panel`. Finder: `() => K('mx-auto h-full w-px')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 1 x 900 | 5 x 900 |
| Padding | 0px | = |
| Border | none | = |
| Radius | 9999px | = |
| Background | #ffffff @ 0.06 | #1a93fe |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | width, background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | ew-resize | = |
| Painted layers | div.mx-auto.h-full.w-px 1.0x900.0 bg #ffffff @ 0.06 r 9999px | div.mx-auto.h-full.w-px 5.0x900.0 bg #1a93fe r 9999px |
| Tokens | --border-main #ffffff0f; --icon-blue #1a93fe | = |
| How | at rest | mouse hover on its row |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 1 x 900 | 5 x 900 |
| Padding | 0px | = |
| Border | none | = |
| Radius | 9999px | = |
| Background | #000000 @ 0.06 | #0081f2 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | width, background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | ew-resize | = |
| Painted layers | div.mx-auto.h-full.w-px 1.0x900.0 bg #000000 @ 0.06 r 9999px | div.mx-auto.h-full.w-px 5.0x900.0 bg #0081f2 r 9999px |
| Tokens | --border-main #0000000f; --icon-blue #0081f2 | = |
| How | at rest | mouse hover on its row |

Crops: none.

#### file-tree

Files tab tree.

Snapshot: `task-dark-files-tab`. Finder: `() => Q('aside')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 260 x 804 |
| Padding | 4px |
| Border | none |
| Radius | 0px |
| Background | #1a1a1a |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.min-w-0.flex-1.truncate: -apple-system 14px/21px 500, #e6e6e6 |
| Transition | none |
| Icon | 14 x 14, colour #8c8c8c, stroke #8c8c8c 2px |
| Placeholder | "Search files" #595959, opacity 1, 14px |
| Painted layers | aside.flex.h-full.w-full 260.0x804.0 bg #1a1a1a; div.group.overflow-hidden.text-sm 244.0x32.0 bg #242424 r 8px shadow #ffffff 0px 0px 0px 0px inset, #ffffff @ 0.06 0px 0px 0px 1px inset, #000000 @ 0 0px 0px 0px 0px; div.flex.w-full.items-center 252.0x30.0 bg #1a1a1a r 6px |
| Tokens | --background-gray-main #1a1a1a; --background-menu-white #242424; --border-input-active #ffffff52; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3; --icon-tertiary #8c8c8c; --text-disable #595959; --text-primary #e6e6e6; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 260 x 804 |
| Padding | 4px |
| Border | none |
| Radius | 0px |
| Background | #f8f8f7 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.min-w-0.flex-1.truncate: -apple-system 14px/21px 500, #1a1a1a |
| Transition | none |
| Icon | 14 x 14, colour #737373, stroke #737373 2px |
| Placeholder | "Search files" #a6a6a6, opacity 1, 14px |
| Painted layers | aside.flex.h-full.w-full 260.0x804.0 bg #f8f8f7; div.group.overflow-hidden.text-sm 244.0x32.0 bg #ffffff r 8px shadow #ffffff 0px 0px 0px 0px inset, #000000 @ 0.06 0px 0px 0px 1px inset, #000000 @ 0 0px 0px 0px 0px; div.flex.w-full.items-center 252.0x30.0 bg #f8f8f7 r 6px |
| Tokens | --background-gray-main #f8f8f7; --background-menu-white #fff; --border-input-active #0000004d; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d; --icon-tertiary #737373; --text-disable #a6a6a6; --text-primary #1a1a1a; --text-tertiary #737373 |
| How | at rest |

Crops: `file-tree-default.png`, `file-tree-light.png`.

#### file-tree-header

Files tab tree header.

Snapshot: `task-dark-files-tab`. Finder: `() => C(T('Files in this task', Q('aside')), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 252 x 30 | = | = |
| Padding | 0px 4px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 6px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/21px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span.min-w-0.flex-1.truncate: -apple-system 14px/21px 500, #e6e6e6 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 12 x 12, colour #8c8c8c, stroke #8c8c8c 2px | = | = |
| Ancestor paint | 1 up div.flex.w-full.items-center bg #1a1a1a | = | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3; --icon-tertiary #8c8c8c; --text-primary #e6e6e6; --text-tertiary #8c8c8c | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.clickable.flex.h-full 252.0x30.0 bg #ffffff @ 0.04 r 6px | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 252 x 30 | = | = |
| Padding | 0px 4px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 6px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/21px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span.min-w-0.flex-1.truncate: -apple-system 14px/21px 500, #1a1a1a | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 12 x 12, colour #737373, stroke #737373 2px | = | = |
| Ancestor paint | 1 up div.flex.w-full.items-center bg #f8f8f7 | = | = |
| Tokens | --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d; --icon-tertiary #737373; --text-primary #1a1a1a; --text-tertiary #737373 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.clickable.flex.h-full 252.0x30.0 bg #37352f @ 0.04 r 6px | = |

Crops: `file-tree-header-default.png`, `file-tree-header-hover.png`, `file-tree-header-focus-visible.png`, `file-tree-header-light.png`, `file-tree-header-light-hover.png`, `file-tree-header-light-focus-visible.png`.

#### file-tree-item

Files tab tree item.

Snapshot: `task-dark-files-tab`. Finder: `() => Q('[data-context-menu=file-preview-sidebar-file]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 234 x 28 | = | = |
| Padding | 0px 5px | = | = |
| Gap | 5px | = | = |
| Border | none | = | = |
| Radius | 5px | = | = |
| Background | transparent | #ffffff @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #e6e6e6 | = | = |
| Text node | span.min-w-0.overflow-hidden.text-ellipsis: -apple-system 14px/20px 400, #e6e6e6 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 14 x 14, colour #e6e6e6 | = | = |
| Tokens | --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.clickable.flex.w-full 234.0x28.0 bg #ffffff @ 0.04 r 5px | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 234 x 28 | = | = |
| Padding | 0px 5px | = | = |
| Gap | 5px | = | = |
| Border | none | = | = |
| Radius | 5px | = | = |
| Background | transparent | #37352f @ 0.04 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #1a1a1a | = | = |
| Text node | span.min-w-0.overflow-hidden.text-ellipsis: -apple-system 14px/20px 400, #1a1a1a | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 14 x 14, colour #1a1a1a | = | = |
| Tokens | --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.clickable.flex.w-full 234.0x28.0 bg #37352f @ 0.04 r 5px | = |

Crops: `file-tree-item-default.png`, `file-tree-item-hover.png`, `file-tree-item-focus-visible.png`, `file-tree-item-light.png`, `file-tree-item-light-hover.png`, `file-tree-item-light-focus-visible.png`.

#### preview-empty

Select a file to preview.

Snapshot: `task-dark-files-tab`. Finder: `() => T('Select a file to preview').parentElement`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 197.34 x 77 |
| Padding | 0px 24px |
| Gap | 12px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div: -apple-system 14px/21px 500, #e6e6e6 |
| Transition | none |
| Icon | 22 x 22, colour #b3b3b3, stroke #b3b3b3 2px |
| Painted layers | div.flex.items-center.justify-center 44.0x44.0 bg #ffffff @ 0.06 r 12px |
| Tokens | --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 197.34 x 77 |
| Padding | 0px 24px |
| Gap | 12px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div: -apple-system 14px/21px 500, #1a1a1a |
| Transition | none |
| Icon | 22 x 22, colour #4d4d4d, stroke #4d4d4d 2px |
| Painted layers | div.flex.items-center.justify-center 44.0x44.0 bg #37352f @ 0.06 r 12px |
| Tokens | --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d; --text-primary #1a1a1a |
| How | at rest |

Crops: `preview-empty-default.png`, `preview-empty-light.png`.

### Mobile

#### m-app-banner

App banner.

Snapshot: `mobile-home-dark`. Finder: `() => CK(T('Manus app'), 'fixed')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 390 x 65 |
| Padding | 12px 16px 12px 6px |
| Gap | 6px |
| Border | T: none; R: none; B: 1px solid #ffffff @ 0.06; L: none |
| Radius | 0px |
| Background | #1a1a1a |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.text-base: -apple-system 16px/22px 600, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6, stroke #595959 2px |
| Painted layers | div.top-0.left-0.w-full 390.0x65.0 bg #1a1a1a border B:1px solid #ffffff @ 0.06; div.relative.size-10.rounded-lg 40.0x40.0 bg #000000 @ 0.85 r 8px; button.inline-flex.items-center.justify-center 80.1x32.0 bg #ffffff @ 0.95 r 8px |
| Ancestor paint | 1 up body bg #242424 |
| Tokens | --Button-black #fffffff2; --background-gray-main #1a1a1a; --border-main #ffffff0f; --text-onblack #000000e5; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-density-small-row-height 32px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 390 x 65 |
| Padding | 12px 16px 12px 6px |
| Gap | 6px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0.06; L: none |
| Radius | 0px |
| Background | #f8f8f7 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.text-base: -apple-system 16px/22px 600, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a, stroke #a6a6a6 2px |
| Painted layers | div.top-0.left-0.w-full 390.0x65.0 bg #f8f8f7 border B:1px solid #000000 @ 0.06; div.relative.size-10.rounded-lg 40.0x40.0 bg #ffffff r 8px; button.inline-flex.items-center.justify-center 80.1x32.0 bg #1a1a19 r 8px |
| Ancestor paint | 1 up body bg #ffffff |
| Tokens | --Button-black #1a1a19; --background-gray-main #f8f8f7; --border-main #0000000f; --text-onblack #fff; --text-primary #1a1a1a; --text-tertiary #737373; --ui-density-small-row-height 32px |
| How | at rest |

Crops: `m-app-banner-default.png`, `m-app-banner-light.png`.

#### m-open-app

Open app button.

Snapshot: `mobile-home-dark`. Finder: `() => C(T('Open app'), 'button')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 80.06 x 32 |
| Padding | 0px 8px |
| Gap | 4px |
| Border | none |
| Radius | 8px |
| Background | #ffffff @ 0.95 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/18px 500 |
| Letter spacing | normal |
| Colour | #000000 @ 0.898 |
| Text node | span: -apple-system 14px/18px 500, #000000 @ 0.898 |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Painted layers | button.inline-flex.items-center.justify-center 80.1x32.0 bg #ffffff @ 0.95 r 8px |
| Ancestor paint | 1 up div.top-0.left-0.w-full bg #1a1a1a |
| Tokens | --Button-black #fffffff2; --text-onblack #000000e5; --ui-density-small-row-height 32px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 80.06 x 32 |
| Padding | 0px 8px |
| Gap | 4px |
| Border | none |
| Radius | 8px |
| Background | #1a1a19 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/18px 500 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | span: -apple-system 14px/18px 500, #ffffff |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Painted layers | button.inline-flex.items-center.justify-center 80.1x32.0 bg #1a1a19 r 8px |
| Ancestor paint | 1 up div.top-0.left-0.w-full bg #f8f8f7 |
| Tokens | --Button-black #1a1a19; --text-onblack #fff; --ui-density-small-row-height 32px |
| How | at rest |

Crops: `m-open-app-default.png`, `m-open-app-light.png`.

#### m-header

Mobile header row.

Snapshot: `mobile-home-dark`. Finder: `() => W(C(T('Manus 2.0 Lite', M()), '.clickable'), 358)`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 390 x 48 |
| Padding | 8px 20px 8px 16px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none |
| Radius | 0px |
| Background | #1a1a1a |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.truncate: -apple-system 16px/20px 500, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #b3b3b3, stroke #b3b3b3 2px |
| Painted layers | div.flex.w-full.shrink-0 390.0x48.0 bg #1a1a1a border B:1px solid #000000 @ 0; div.desktop-no-drag.relative.inline-flex 136.5x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px; div.h-4.w-px.shrink-0 1.0x16.0 bg #ffffff @ 0.12; div.clickable.flex.items-center 32.0x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px |
| Tokens | --background-gray-main #1a1a1a; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --icon-secondary #b3b3b3; --text-blue #1a93fe; --text-primary #e6e6e6; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 390 x 48 |
| Padding | 8px 20px 8px 16px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none |
| Radius | 0px |
| Background | #f8f8f7 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.truncate: -apple-system 16px/20px 500, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #4d4d4d, stroke #4d4d4d 2px |
| Painted layers | div.flex.w-full.shrink-0 390.0x48.0 bg #f8f8f7 border B:1px solid #000000 @ 0; div.desktop-no-drag.relative.inline-flex 136.5x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px; div.h-4.w-px.shrink-0 1.0x16.0 bg #000000 @ 0.14; div.clickable.flex.items-center 32.0x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px |
| Tokens | --background-gray-main #f8f8f7; --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --icon-secondary #4d4d4d; --text-blue #0081f2; --text-primary #1a1a1a; --text-tertiary #737373 |
| How | at rest |

Crops: `m-header-default.png`, `m-header-light.png`.

#### m-hero-title

Hero title (serif).

Snapshot: `mobile-home-dark`. Finder: `() => Q('h1', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 319.66 x 42 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | LibreBaskerville 28px/42px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | none |
| Tokens | --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 319.66 x 42 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | LibreBaskerville 28px/42px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | none |
| Tokens | --text-primary #1a1a1a |
| How | at rest |

Crops: `m-hero-title-default.png`, `m-hero-title-light.png`.

#### m-composer

Mobile composer.

Snapshot: `mobile-home-dark`. Finder: `() => P(Q('[contenteditable=true]'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 358 x 120 |
| Padding | 12px 0px |
| Gap | 12px |
| Border | 1px solid #ffffff @ 0.06 |
| Radius | 22px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.truncate: -apple-system 12px/16px 500, #8c8c8c |
| Transition | none |
| Icon | 17 x 17, colour #b3b3b3, stroke #b3b3b3 2px |
| Placeholder | "Assign a task or type / for more" #8c8c8c, opacity 1, 15px |
| Painted layers | div.flex.flex-col.relative 358.0x120.0 bg #242424 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 22px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px; button.justify-center.whitespace-nowrap.font-medium 51.1x32.0 r 100px outline 1px solid #ffffff @ 0.06 offset -1px; button.whitespace-nowrap.font-medium.transition-colors 32.0x32.0 r 9999px outline 1px solid #ffffff @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 32.0x32.0 bg #ffffff @ 0.08 r 9999px |
| Ancestor paint | 1 up div.relative bg #1a1a1a |
| Tokens | --accent-send-button #fffffff2; --background-menu-white #242424; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a; --icon-primary #e6e6e6; --icon-secondary #b3b3b3; --text-onblack #000000e5; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 358 x 120 |
| Padding | 12px 0px |
| Gap | 12px |
| Border | 1px solid #e5e7eb |
| Radius | 22px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.truncate: -apple-system 12px/16px 500, #737373 |
| Transition | none |
| Icon | 17 x 17, colour #4d4d4d, stroke #4d4d4d 2px |
| Placeholder | "Assign a task or type / for more" #737373, opacity 1, 15px |
| Painted layers | div.flex.flex-col.relative 358.0x120.0 bg #ffffff border T:1px solid #e5e7eb / R:1px solid #e5e7eb / B:1px solid #e5e7eb / L:1px solid #e5e7eb r 22px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.02 0px 12px 32px 0px; button.rounded-full.border.inline-flex 32.0x32.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px; button.justify-center.whitespace-nowrap.font-medium 51.1x32.0 r 100px outline 1px solid #000000 @ 0.06 offset -1px; button.whitespace-nowrap.font-medium.transition-colors 32.0x32.0 r 9999px outline 1px solid #000000 @ 0.06 offset -1px; button.inline-flex.items-center.justify-center 32.0x32.0 bg #37352f @ 0.08 r 9999px |
| Ancestor paint | 1 up div.relative bg #f8f8f7 |
| Tokens | --accent-send-button #1a1a19; --background-menu-white #fff; --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a; --icon-primary #1a1a1a; --icon-secondary #4d4d4d; --text-onblack #fff; --text-primary #1a1a1a |
| How | at rest |

Crops: `m-composer-default.png`, `m-composer-light.png`.

#### m-chip

Suggestion chip.

Snapshot: `mobile-home-dark`. Finder: `() => Q('[role=button].rounded-full', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 136.09 x 40 |
| Padding | 7px 12px |
| Gap | 8px |
| Border | 1px solid #ffffff @ 0.06 |
| Radius | 9999px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.font-normal: -apple-system 14px/21px 400, #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| Icon | 18 x 18, colour #8c8c8c |
| Painted layers | div.h-10.rounded-full.border 136.1x40.0 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 9999px |
| Tokens | --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 136.09 x 40 |
| Padding | 7px 12px |
| Gap | 8px |
| Border | 1px solid #000000 @ 0.06 |
| Radius | 9999px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.font-normal: -apple-system 14px/21px 400, #1a1a1a |
| Transition | none |
| Cursor | pointer |
| Icon | 18 x 18, colour #737373 |
| Painted layers | div.h-10.rounded-full.border 136.1x40.0 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 9999px |
| Tokens | --border-main #0000000f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a |
| How | at rest |

Crops: `m-chip-default.png`, `m-chip-light.png`.

#### m-carousel-card

Carousel card.

Snapshot: `mobile-home-dark`. Finder: `() => CK(TS('Personalize your', M()), 'w-[540px]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 350 x 98 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #ffffff @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Text node | span.text-base: -apple-system 16px/22px 500, #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.max-w-full.flex.flex-row 350.0x98.0 bg #ffffff @ 0.06 r 12px |
| Tokens | --fill-tsp-white-dark #ffffff14; --fill-tsp-white-main #ffffff0f; --icon-tertiary #8c8c8c; --text-primary #e6e6e6; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 350 x 98 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #37352f @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #737373 |
| Text node | span.text-base: -apple-system 16px/22px 500, #1a1a1a |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.max-w-full.flex.flex-row 350.0x98.0 bg #37352f @ 0.06 r 12px |
| Tokens | --fill-tsp-white-dark #37352f14; --fill-tsp-white-main #37352f0f; --icon-tertiary #737373; --text-primary #1a1a1a; --text-tertiary #737373 |
| How | at rest |

Crops: `m-carousel-card-default.png`, `m-carousel-card-light.png`.

#### m-carousel-dot

Carousel dot.

Snapshot: `mobile-home-dark`. Finder: `() => Q('button.size-2')`.

Dark theme.

| Property | default | active |
|---|---|---|
| Size (w x h) | 8 x 8 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 9999px | = |
| Background | #ffffff @ 0.08 | #595959 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Transition | all 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Painted layers | button.size-2.rounded-full.transition-all 8.0x8.0 bg #ffffff @ 0.08 r 9999px | button.size-2.rounded-full.transition-all 8.0x8.0 bg #595959 r 9999px |
| Tokens | --fill-tsp-white-dark #ffffff14; --fill-tsp-white-light #ffffff0a | --icon-disable #595959 |
| How | at rest | at rest, captured active |

Light theme.

| Property | light | light-active |
|---|---|---|
| Size (w x h) | 8 x 8 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 9999px | = |
| Background | #37352f @ 0.08 | #a6a6a6 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Transition | all 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Painted layers | button.size-2.rounded-full.transition-all 8.0x8.0 bg #37352f @ 0.08 r 9999px | button.size-2.rounded-full.transition-all 8.0x8.0 bg #a6a6a6 r 9999px |
| Tokens | --fill-tsp-white-dark #37352f14; --fill-tsp-white-light #37352f0a | --icon-disable #a6a6a6 |
| How | at rest | at rest, captured active |

Other finders: active: `() => [...document.querySelectorAll('button.size-2')].find((b) => /icon-disable/.test(b.className))`; light-active: `() => [...document.querySelectorAll('button.size-2')].find((b) => /icon-disable/.test(b.className))`.

Crops: `m-carousel-dot-default.png`, `m-carousel-dot-active.png`, `m-carousel-dot-light.png`, `m-carousel-dot-light-active.png`.

#### m-drawer

Drawer.

Snapshot: `mobile-home-dark-drawer`. Finder: `() => Q('nav')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 300 x 844 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #1f1f1f |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span.truncate: -apple-system 14px/21px 400, #e6e6e6 |
| Transition | width, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Icon | 28 x 28, colour #e6e6e6 |
| ::after | 1px x 844px, absolute, bg #ffffff @ 0.06, radius 0px |
| Painted layers | nav.flex.flex-col.duration-200 300.0x844.0 bg #1f1f1f; nav.flex.flex-col.duration-200::after 1pxx844px bg #ffffff @ 0.06; div.pointer-events-none.absolute.inset-x-0 300.0x1.0 border T:1px solid #ffffff @ 0.03 opacity 0; span.flex.h-5.shrink-0 40.4x20.0 bg #ffffff @ 0.08 r 9999px; div.flex.flex-col.gap-px 284.0x77.0 bg #1f1f1f; div.group.group/nav-section.flex 284.0x36.0 bg #1f1f1f |
| Tokens | --background-nav #1f1f1f; --border-light #ffffff08; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --icon-secondary #b3b3b3; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-nav-item-padding-start 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 300 x 844 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #f0f0f0 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span.truncate: -apple-system 14px/21px 400, #1a1a1a |
| Transition | width, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| Icon | 28 x 28, colour #1a1a1a |
| ::after | 1px x 844px, absolute, bg #000000 @ 0.06, radius 0px |
| Painted layers | nav.flex.flex-col.duration-200 300.0x844.0 bg #f0f0f0; nav.flex.flex-col.duration-200::after 1pxx844px bg #000000 @ 0.06; div.pointer-events-none.absolute.inset-x-0 300.0x1.0 border T:1px solid #000000 @ 0.04 opacity 0; span.flex.h-5.shrink-0 40.4x20.0 bg #37352f @ 0.08 r 9999px; div.flex.flex-col.gap-px 284.0x77.0 bg #f0f0f0; div.group.group/nav-section.flex 284.0x36.0 bg #f0f0f0 |
| Tokens | --background-nav #f0f0f0; --border-light #0000000a; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --icon-secondary #4d4d4d; --text-primary #1a1a1a; --text-tertiary #737373; --ui-density-nav-icon-box-size 20px; --ui-density-nav-item-gap 8px; --ui-density-nav-item-padding-start 8px |
| How | at rest |

Crops: `m-drawer-default.png`, `m-drawer-light.png`.

#### m-drawer-scrim

Drawer scrim.

Snapshot: `mobile-home-dark-drawer`. Finder: `() => K('absolute inset-0 z-[15]', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 390 x 844 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #000000 @ 0.45 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Transition | visibility, background-color 0.1s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Painted layers | div.absolute.inset-0.clickable 390.0x844.0 bg #000000 @ 0.45 |
| Ancestor paint | 1 up div.flex-1.min-w-0.h-full bg #1a1a1a |
| Tokens | --background-mask-black #00000073 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 390 x 844 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #000000 @ 0.65 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Transition | visibility, background-color 0.1s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Painted layers | div.absolute.inset-0.clickable 390.0x844.0 bg #000000 @ 0.65 |
| Ancestor paint | 1 up div.flex-1.min-w-0.h-full bg #f8f8f7 |
| Tokens | --background-mask-black #000000a6 |
| How | at rest |

Crops: none.

#### m-library-header

Mobile Library header.

Snapshot: `mobile-library-dark`. Finder: `() => CK(Q('h1', 0, M()), '@container')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 390 x 112 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #1a1a1a |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | h1.min-w-0.truncate.font-medium: -apple-system 18px/24px 500, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #b3b3b3, stroke #b3b3b3 2px |
| Placeholder | "Search files" #595959, opacity 1, 14px |
| Painted layers | div.@container.shrink-0 390.0x112.0 bg #1a1a1a; div.group.overflow-hidden.text-sm 58.0x32.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px; button.clickable.flex.size-8 32.0x32.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px; div.h-8.flex.items-stretch 68.0x32.0 bg #000000 @ 0.2 border T:1px solid #ffffff @ 0.06 / R:1px solid #ffffff @ 0.06 / B:1px solid #ffffff @ 0.06 / L:1px solid #ffffff @ 0.06 r 8px; div.absolute.inset-0 32.0x28.0 bg #242424 r 6px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.16 0px 0.5px 3px 0px; button.clickable.flex.h-8 81.1x32.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px |
| Tokens | --Button-border-secondary #ffffff1f; --background-gray-main #1a1a1a; --border-main #ffffff0f; --fill-tsp-gray-main #0003; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --fill-white #242424; --icon-secondary #b3b3b3; --shadow-S #00000029; --text-disable #595959 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 390 x 112 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #f8f8f7 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | h1.min-w-0.truncate.font-medium: -apple-system 18px/24px 500, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #4d4d4d, stroke #4d4d4d 2px |
| Placeholder | "Search files" #a6a6a6, opacity 1, 14px |
| Painted layers | div.@container.shrink-0 390.0x112.0 bg #f8f8f7; div.group.overflow-hidden.text-sm 58.0x32.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px; button.clickable.flex.size-8 32.0x32.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px; div.h-8.flex.items-stretch 68.0x32.0 bg #37352f @ 0.04 border T:1px solid #000000 @ 0.06 / R:1px solid #000000 @ 0.06 / B:1px solid #000000 @ 0.06 / L:1px solid #000000 @ 0.06 r 8px; div.absolute.inset-0 32.0x28.0 bg #ffffff r 6px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0.5px 3px 0px; button.clickable.flex.h-8 81.1x32.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px |
| Tokens | --Button-border-secondary #0000001f; --background-gray-main #f8f8f7; --border-main #0000000f; --fill-tsp-gray-main #37352f0a; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --fill-white #fff; --icon-secondary #4d4d4d; --shadow-S #0000000a; --text-disable #a6a6a6 |
| How | at rest |

Crops: `m-library-header-default.png`, `m-library-header-light.png`.

#### m-type-dropdown

Type dropdown button.

Snapshot: `mobile-library-dark`, `mobile-library-dark-type-menu`. Finder: `() => C(T('All', M()), 'button')`.

Dark theme.

| Property | default | open |
|---|---|---|
| Size (w x h) | 81.11 x 32 | = |
| Padding | 0px 8px 0px 12px | = |
| Gap | 6px | = |
| Border | 1px solid #ffffff @ 0.12 | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 13px/18px 400 | = |
| Letter spacing | normal | = |
| Colour | #b3b3b3 | = |
| Text node | span: -apple-system 13px/18px 400, #b3b3b3 | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #b3b3b3, stroke #b3b3b3 2px | = |
| Painted layers | button.clickable.flex.h-8 81.1x32.0 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px | button.clickable.flex.h-8 81.1x32.0 bg #ffffff @ 0.06 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 8px |
| Tokens | --Button-border-secondary #ffffff1f; --fill-tsp-white-main #ffffff0f; --text-secondary #b3b3b3 | = |
| How | at rest | at rest, captured open |

Light theme.

| Property | light | light-open |
|---|---|---|
| Size (w x h) | 81.11 x 32 | = |
| Padding | 0px 8px 0px 12px | = |
| Gap | 6px | = |
| Border | 1px solid #000000 @ 0.12 | = |
| Radius | 8px | = |
| Background | transparent | #37352f @ 0.06 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 13px/18px 400 | = |
| Letter spacing | normal | = |
| Colour | #4d4d4d | = |
| Text node | span: -apple-system 13px/18px 400, #4d4d4d | = |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #4d4d4d, stroke #4d4d4d 2px | = |
| Painted layers | button.clickable.flex.h-8 81.1x32.0 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px | button.clickable.flex.h-8 81.1x32.0 bg #37352f @ 0.06 border T:1px solid #000000 @ 0.12 / R:1px solid #000000 @ 0.12 / B:1px solid #000000 @ 0.12 / L:1px solid #000000 @ 0.12 r 8px |
| Tokens | --Button-border-secondary #0000001f; --fill-tsp-white-main #37352f0f; --text-secondary #4d4d4d | = |
| How | at rest | at rest, captured open |

Other finders: open: `() => C(T('All', M()), 'button')`; light-open: `() => C(T('All', M()), 'button')`.

Crops: `m-type-dropdown-default.png`, `m-type-dropdown-open.png`, `m-type-dropdown-light.png`, `m-type-dropdown-light-open.png`.

#### m-type-menu

Type menu.

Snapshot: `mobile-library-dark-type-menu`. Finder: `() => D().firstElementChild`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 200 x 296 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #242424 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span: -apple-system 14px/20px 400, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6, stroke #b3b3b3 2px |
| Painted layers | div.shadow-menu.p-1.max-w-content 200.0x296.0 bg #242424 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px |
| Tokens | --background-menu-white #242424; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 200 x 296 |
| Padding | 4px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span: -apple-system 14px/20px 400, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a, stroke #4d4d4d 2px |
| Painted layers | div.shadow-menu.p-1.max-w-content 200.0x296.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px |
| Tokens | --background-menu-white #fff; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-menu-item-padding-y 8px |
| How | at rest |

Crops: `m-type-menu-default.png`, `m-type-menu-light.png`.

#### m-type-menu-item

Type menu item.

Snapshot: `mobile-library-dark-type-menu`. Finder: `() => CK(T('Slides', D()), 'rounded-[8px]')`.

Dark theme.

| Property | default | checked |
|---|---|---|
| Size (w x h) | 192 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #e6e6e6 | = |
| Text node | span: -apple-system 14px/20px 400, #e6e6e6 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #b3b3b3 | 16 x 16, colour #e6e6e6, stroke #b3b3b3 2px |
| Ancestor paint | 1 up div.shadow-menu.p-1.max-w-content bg #242424 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.14 0px 0px 0px 1px, #000000 @ 0.28 0px 0px 0px 1px, #000000 @ 0.16 0px 24px 24px -12px, #000000 @ 0.28 0px 3px 3px -1.5px, #000000 @ 0.16 0px 10px 20px 1px | = |
| Tokens | --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6; --ui-density-menu-item-padding-y 8px | = |
| How | at rest | at rest, captured checked |

Light theme.

| Property | light | light-checked |
|---|---|---|
| Size (w x h) | 192 x 36 | = |
| Padding | 8px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #1a1a1a | = |
| Text node | span: -apple-system 14px/20px 400, #1a1a1a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #4d4d4d | 16 x 16, colour #1a1a1a, stroke #4d4d4d 2px |
| Ancestor paint | 1 up div.shadow-menu.p-1.max-w-content bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #000000 @ 0.06 0px 0px 0px 1px, #000000 @ 0.04 0px 24px 24px -12px, #000000 @ 0.06 0px 3px 3px -1.5px, #000000 @ 0.04 0px 10px 20px 1px | = |
| Tokens | --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a; --ui-density-menu-item-padding-y 8px | = |
| How | at rest | at rest, captured checked |

Other finders: checked: `() => CK(T('All', D()), 'rounded-[8px]')`; light-checked: `() => CK(T('All', D()), 'rounded-[8px]')`.

Crops: `m-type-menu-item-default.png`, `m-type-menu-item-checked.png`, `m-type-menu-item-light.png`, `m-type-menu-item-light-checked.png`.

#### m-file-row

Mobile file row.

Snapshot: `mobile-library-dark`. Finder: `() => Q('[role=button].group', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 350 x 67 |
| Padding | 0px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | span: -apple-system 14px/20px 400, #e6e6e6 |
| Transition | none |
| Cursor | pointer |
| Icon | 24 x 24, colour #e6e6e6 |
| Painted layers | div.w-full.flex.items-center 350.0x67.0 border B:1px solid #ffffff @ 0.06 |
| Tokens | --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --text-primary #e6e6e6; --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 350 x 67 |
| Padding | 0px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | span: -apple-system 14px/20px 400, #1a1a1a |
| Transition | none |
| Cursor | pointer |
| Icon | 24 x 24, colour #1a1a1a |
| Painted layers | div.w-full.flex.items-center 350.0x67.0 border B:1px solid #000000 @ 0.06 |
| Tokens | --border-main #0000000f; --fill-tsp-white-light #37352f0a; --text-primary #1a1a1a; --text-tertiary #737373 |
| How | at rest |

Crops: `m-file-row-default.png`, `m-file-row-light.png`.

#### m-task-deliverable

Mobile deliverable card. Scrolled to the middle of the viewport first: at the captured scroll it sits under the fixed app banner.

Snapshot: `mobile-task-dark`. Finder: `() => K('border-solid rounded-[12px] overflow-hidden', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 326 x 245.25 |
| Padding | 0px |
| Border | 1px solid #ffffff @ 0.12 |
| Radius | 12px |
| Background | #242424 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.font-medium.leading-5.overflow-hidden: -apple-system 14px/20px 500, #e6e6e6, ls -0.154px |
| Transition | none |
| Cursor | pointer |
| Icon | 27 x 27, colour #e6e6e6 |
| Painted layers | div.border-solid.overflow-hidden.flex 326.0x245.3 bg #242424 border T:1px solid #ffffff @ 0.12 / R:1px solid #ffffff @ 0.12 / B:1px solid #ffffff @ 0.12 / L:1px solid #ffffff @ 0.12 r 12px; div.flex.items-center.justify-between 324.0x61.0 border B:1px solid #ffffff @ 0.06; div.relative.flex.w-full 324.0x182.3 bg #ffffff @ 0.06; div.absolute 82.5x46.4 bg #0d0f12 |
| Tokens | --background-menu-white #242424; --border-dark #ffffff1f; --border-main #ffffff0f; --fill-tsp-white-light #ffffff0a; --fill-tsp-white-main #ffffff0f; --text-primary #e6e6e6 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 326 x 245.25 |
| Padding | 0px |
| Border | 1px solid #000000 @ 0.14 |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.font-medium.leading-5.overflow-hidden: -apple-system 14px/20px 500, #1a1a1a, ls -0.154px |
| Transition | none |
| Cursor | pointer |
| Icon | 27 x 27, colour #1a1a1a |
| Painted layers | div.border-solid.overflow-hidden.flex 326.0x245.3 bg #ffffff border T:1px solid #000000 @ 0.14 / R:1px solid #000000 @ 0.14 / B:1px solid #000000 @ 0.14 / L:1px solid #000000 @ 0.14 r 12px; div.flex.items-center.justify-between 324.0x61.0 border B:1px solid #000000 @ 0.06; div.relative.flex.w-full 324.0x182.3 bg #37352f @ 0.06; div.absolute 82.5x46.4 bg #0d0f12 |
| Tokens | --background-menu-white #fff; --border-dark #00000024; --border-main #0000000f; --fill-tsp-white-light #37352f0a; --fill-tsp-white-main #37352f0f; --text-primary #1a1a1a |
| How | at rest |

Crops: `m-task-deliverable-default.png`, `m-task-deliverable-light.png`.

#### m-app-gate

App gate screen.

Snapshot: `mobile-home-dark-app-gate`. Finder: `() => K('fixed inset-0 z-[1]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 390 x 844 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #1a1a1a |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #e6e6e6 |
| Text node | div.text-base: -apple-system 16px/22px 600, #e6e6e6 |
| Transition | none |
| Icon | 16 x 16, colour #e6e6e6, stroke #595959 2px |
| Painted layers | div.w-full.h-full.min-h-screen 390.0x844.0 bg #1a1a1a; div.top-0.left-0.w-full 390.0x65.0 bg #1a1a1a border B:1px solid #ffffff @ 0.06; div.relative.size-10.rounded-lg 40.0x40.0 bg #000000 @ 0.85 r 8px; button.inline-flex.items-center.justify-center 80.1x32.0 bg #ffffff @ 0.95 r 8px; button.inline-flex.items-center.justify-center 298.0x48.0 bg #ffffff @ 0.95 r 12px |
| Tokens | --Button-black #fffffff2; --background-gray-main #1a1a1a; --border-main #ffffff0f; --text-onblack #000000e5; --text-primary #e6e6e6; --text-tertiary #8c8c8c; --ui-density-small-row-height 32px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 390 x 844 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #f8f8f7 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 400 |
| Letter spacing | normal |
| Colour | #1a1a1a |
| Text node | div.text-base: -apple-system 16px/22px 600, #1a1a1a |
| Transition | none |
| Icon | 16 x 16, colour #1a1a1a, stroke #a6a6a6 2px |
| Painted layers | div.w-full.h-full.min-h-screen 390.0x844.0 bg #f8f8f7; div.top-0.left-0.w-full 390.0x65.0 bg #f8f8f7 border B:1px solid #000000 @ 0.06; div.relative.size-10.rounded-lg 40.0x40.0 bg #ffffff r 8px; button.inline-flex.items-center.justify-center 80.1x32.0 bg #1a1a19 r 8px; button.inline-flex.items-center.justify-center 298.0x48.0 bg #1a1a19 r 12px |
| Tokens | --Button-black #1a1a19; --background-gray-main #f8f8f7; --border-main #0000000f; --text-onblack #fff; --text-primary #1a1a1a; --text-tertiary #737373; --ui-density-small-row-height 32px |
| How | at rest |

Crops: `m-app-gate-default.png`, `m-app-gate-light.png`.

#### m-gate-download

Download app button (large black).

Snapshot: `mobile-home-dark-app-gate`. Finder: `() => C(T('Download app'), 'button')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 298 x 48 |
| Padding | 0px 24px |
| Gap | 6px |
| Border | none |
| Radius | 12px |
| Background | #ffffff @ 0.95 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 500 |
| Letter spacing | normal |
| Colour | #000000 @ 0.898 |
| Text node | span: -apple-system 16px/24px 500, #000000 @ 0.898 |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Painted layers | button.inline-flex.items-center.justify-center 298.0x48.0 bg #ffffff @ 0.95 r 12px |
| Tokens | --Button-black #fffffff2; --text-onblack #000000e5 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 298 x 48 |
| Padding | 0px 24px |
| Gap | 6px |
| Border | none |
| Radius | 12px |
| Background | #1a1a19 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 16px/24px 500 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | span: -apple-system 16px/24px 500, #ffffff |
| Transition | color, background-color, border-color, text-decoration-color, fill, stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Painted layers | button.inline-flex.items-center.justify-center 298.0x48.0 bg #1a1a19 r 12px |
| Tokens | --Button-black #1a1a19; --text-onblack #fff |
| How | at rest |

Crops: `m-gate-download-default.png`, `m-gate-download-light.png`.

#### m-gate-continue

Continue with web link.

Snapshot: `mobile-home-dark-app-gate`. Finder: `() => C(T('Continue with web'), 'button')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 122.27 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 500 |
| Letter spacing | normal |
| Colour | #8c8c8c |
| Transition | none |
| Cursor | pointer |
| Tokens | --text-tertiary #8c8c8c |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 122.27 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system 14px/20px 500 |
| Letter spacing | normal |
| Colour | #737373 |
| Transition | none |
| Cursor | pointer |
| Tokens | --text-tertiary #737373 |
| How | at rest |

Crops: `m-gate-continue-default.png`, `m-gate-continue-light.png`.
