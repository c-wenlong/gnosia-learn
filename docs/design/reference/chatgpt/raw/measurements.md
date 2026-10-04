# ChatGPT component measurements

Computed styles read on 2026-10-04 by `tools/capture/signed-in/measure.mjs` from static page copies of the signed-in app (1440x900 (the mobile-* snapshots 390x844), deviceScaleFactor 2), and written here by `tools/capture/signed-in/build-measurements.mjs` from [components-computed.json](components-computed.json). Each copy was captured in the dark theme with the blue accent. Dark states have plain names; light states (`light`, `light-<state>`) were read from the same DOM with every `dark` class removed (on <html> and on each markdown body). Every state records `theme` and `snapshot`.

Every component has one table per theme: a column per state, a row per property. A cell that repeats the first column reads `=`. Colours are hex, with `@ alpha` when translucent. "Painted layers" lists the first nodes inside the component that paint a fill, border, shadow or outline (a hover or selection is sometimes painted on an inner layer, not the element itself); "Ancestor paint" the same for its parents. "Tokens" lists the custom properties the component's classes name (`bg-token-x` reads `--x`, `bg-(--x)`, `[var(--x)]`) and the inline `--menu-item-*` variables a row sets, with the value each resolved to in that theme.

States: `hover` is a real pointer hover; `focus-visible` a real keyboard focus (Shift+Tab, Tab), skipped where the element cannot take focus. ChatGPT draws most focus rings from `keyboard-focused:` variants that its own script turns on, so with scripts gone many focused states look like the rest state. The rest (`active`, `selected`, `checked`, `open`, `typed`, `highlighted`, ...) are other elements or copies captured in that state. Light states are prefixed `light`. The 390 wide copies are measured at rest only.

105 components, 426 states (426 measured, 0 skipped, 0 not found).

## Shared values

Tallied over every measured state by the build script.

- **Radius scale** (element radius, times seen): full (130), 8px (64), 10px (60), 16px (26), 12px (22), 28px (12), 20px (8), 22px (4), 26px (2).
- **Transitions**: `color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1)` (64), `opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1)` (20), `color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.2s cubic-bezier(0.4, 0, 0.2, 1)` (14), `opacity 0.15s steps(1, start)` (2).
- **Font families**: -apple-system-body (662), OpenAI Sans (14).
- **Type sizes** (size/line-height weight of the first text): 14px/20px 400 (138), 14px/20px 500 (98), 16px/24px 400 (76), 16px/26px 400 (34), 12px/17.1429px 600 (14), 18px/26px 600 (8), 18px/28px 600 (8), 14px/14px 400 (8), 12px/16px 500 (6), 14px/18px 400 (6), 14px/16px 600 (4), 9px/26px 400 (4), 12px/16px 400 (4), 24px/28px 400 (2).
- **Shadows**: `#ffffff @ 0.2 0px 0px 1px 0px inset` (22); `#000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px` (20); `#ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px` (12); `#000000 @ 0.32 0px 8px 16px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset, #000000 @ 0.62 0px 0px 1px 0px` (4); `#000000 @ 0.08 0px 8px 12px 0px, #000000 @ 0.62 0px 0px 1px 0px` (4); `#000000 @ 0.25 0px 14px 62px 0px` (4).
- **Focus-visible, dark** (36 focused states): outline 1px auto #99c8ff offset 0px (13); nothing painted on the element (12); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px (3); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset (1); outline 1px solid #ffffff offset 2px (1); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 2px, #ffffff 0px 0px 0px 4px, #000000 @ 0 0px 0px 0px 0px (1); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #afafaf 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px (1); outline 1px auto #63a8f8 offset 4px (1); outline 1px solid #ffffff @ 0.16 offset 2px (1); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 1px, #ffffff 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px (1); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #afafaf 0px 0px 0px 3px, #000000 @ 0 0px 0px 0px 0px (1).
- **Focus-visible, light** (36 focused states): outline 1px auto #005fcc offset 0px (13); nothing painted on the element (12); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px (3); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px (1); outline 1px solid #0d0d0d offset 2px (1); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 2px, #0d0d0d 0px 0px 0px 4px, #000000 @ 0 0px 0px 0px 0px (1); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #8f8f8f 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px (1); outline 1px auto #3a83f7 offset 4px (1); outline 1px solid #0d0d0d @ 0.12 offset 2px (1); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 1px, #0d0d0d 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px (1); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #8f8f8f 0px 0px 0px 3px, #000000 @ 0 0px 0px 0px 0px (1).
- **Hover changes, dark** (48 hovered components, 13 with no change on the element or its first painted layer): backgroundColor #ffffff @ 0 → #ffffff @ 0.1 (7); backgroundColor #000000 @ 0 → #ffffff @ 0.1 (6); backgroundColor #000000 @ 0 → #ffffff @ 0.15 (5); backgroundColor #000000 @ 0 → #a4cdfb @ 0.2 (1); backgroundColor #000000 @ 0 → #303030 (1); backgroundColor #000000 @ 0 → #ffffff @ 0.06 (1); backgroundColor #303030 → #676767 (1); backgroundColor #000000 @ 0 → #424242 (1).
- **Hover changes, light** (48 hovered components, 11 with no change on the element or its first painted layer): backgroundColor #000000 @ 0 → #000000 @ 0.05 (13); backgroundColor #000000 @ 0 → #000000 @ 0.07 (6); backgroundColor #ffffff → #f9f9f9 (2); backgroundColor #000000 @ 0 → #3a83f7 @ 0.09 (1); backgroundColor #000000 @ 0 → #0d0d0d @ 0.03 (1); backgroundColor #000000 @ 0 → #000000 @ 0.04 (1); backgroundColor #ffffff → #ececec (1); backgroundColor #0d0d0d → #212121 (1).

### Tokens the measured components use

Every custom property a measured component's classes or inline style name, with the value it resolved to in each theme.

| Token | Dark | Light |
|---|---|---|
| `--bg-elevated-primary` | #1b1b1b | #fff |
| `--bg-primary` | #212121 | #fff |
| `--bg-primary-inverted` | #fff | #000 |
| `--bg-secondary` | #303030 | #e8e8e8 |
| `--bg-tertiary` | #414141 | #f3f3f3 |
| `--border-default` | #ffffff26 | #0000001a |
| `--border-extra-light` | #ffffff1a | #0000000d |
| `--border-heavy` | #fff3 | #00000026 |
| `--border-light` | #ffffff0d | #0000000d |
| `--composer-surface-primary` | #212121 | #fff |
| `--end` | right | right |
| `--icon-accent` | #63a8f8 | #3a83f7 |
| `--icon-secondary` | #cdcdcd | #5d5d5d |
| `--icon-tertiary` | #afafaf | #8f8f8f |
| `--images-app-padding` | 16px | 16px |
| `--interactive-bg-secondary-hover` | #ffffff1a | #0000000d |
| `--interactive-bg-secondary-press` | #ffffff0d | #0000000d |
| `--interactive-bg-secondary-selected` | #ffffff1a | #0000000d |
| `--interactive-bg-tertiary-hover` | #181818 | #f9f9f9 |
| `--interactive-bg-tertiary-press` | #0d0d0d | #f3f3f3 |
| `--interactive-label-accent-default` | #63a8f8 | #3a83f7 |
| `--interactive-label-hover-secondary` | #ffffffe5 | #000000e5 |
| `--interactive-label-secondary-default` | #fff | #0d0d0d |
| `--interactive-label-tertiary-default` | #cdcdcd | #5d5d5d |
| `--main-surface-primary` | #000, #2f2f2f | #fcfcfc, #fff |
| `--main-surface-secondary` | #424242 | #ececec |
| `--main-surface-tertiary` | #676767 | #e3e3e3 |
| `--menu-item-active` | #ffffff1a | #0000000d |
| `--menu-item-background` | #fff0 | #0000 |
| `--menu-item-height` | calc(.25rem * 9) | calc(.25rem * 9) |
| `--menu-item-highlighted` | #ffffff1a | #0000000d |
| `--menu-item-icon-opacity` | 1 | 1 |
| `--menu-item-open` | #ffffff0d | #0000000d |
| `--menu-item-pressed` | #ffffff0d | #0000000d |
| `--page-table-checkbox-inset` | -45px | -45px |
| `--radix-align-offset` | -14px, -6px, -4px | -14px, -6px, -4px |
| `--radix-dropdown-menu-content-available-height` | 709.5px, 838px, 789px | 709.5px, 838px, 789px |
| `--radix-dropdown-menu-content-available-width` | 1428px, 378px | 1428px, 378px |
| `--radix-dropdown-menu-content-transform-origin` | 0% 270px, 0% 321.141px, 0% 0px | 0% 270px, 0% 321.141px, 0% 0px |
| `--radix-dropdown-menu-trigger-height` | 36px, 40px | 36px, 40px |
| `--radix-dropdown-menu-trigger-width` | 34px, 40px, 115.2265625px | 34px, 40px, 115.2265625px |
| `--radix-popper-available-height` | 434px | 434px |
| `--radix-popper-available-width` | 768px | 768px |
| `--radix-select-content-available-height` | 525.171875px | 525.171875px |
| `--radix-select-content-available-width` | 1420px | 1420px |
| `--radix-select-content-transform-origin` | 0% 0px | 0% 0px |
| `--radix-select-trigger-height` | 36px | 36px |
| `--radix-select-trigger-width` | 94.3125px | 94.3125px |
| `--sharp-edge-top-shadow` | 0 1px 0 #ffffff0d | 0 1px 0 #0000000d |
| `--sharp-edge-top-shadow-placeholder` | 0 1px 0 transparent | 0 1px 0 transparent |
| `--sidebar-rail-width` | calc(13 * .25rem) | calc(13 * .25rem) |
| `--sidebar-section-first-margin-top` | .5rem | .5rem |
| `--sidebar-surface-primary` | #000 | #fcfcfc |
| `--sidebar-width` | 260px | 260px |
| `--spacing` | .25rem | .25rem |
| `--surface-hover` | #ffffff26 | #00000012 |
| `--text-accent` | #63a8f8 | #3a83f7 |
| `--text-primary` | #fff | #0d0d0d |
| `--text-secondary` | #cdcdcd | #5d5d5d |
| `--text-tertiary` | #afafaf | #8f8f8f |
| `--theme-blue-background` | color(display-p3 .07451 .203922 .388235) | color(display-p3 .909804 .952941 .996078) |
| `--theme-submit-btn-bg` | #2c67c5 | #3a83f7 |
| `--thread-content-width` | min(calc(100cqw - 2 * calc(.25rem * 16)), 48rem) | min(calc(100cqw - 2 * calc(.25rem * 16)), 48rem) |
| `--to-end-unit` | 1 | 1 |
| `--trigger-width` | calc(34px - 2 * -14px), calc(40px - 2 * -6px), calc(115.2265625px - 2 * -4px) | calc(34px - 2 * -14px), calc(40px - 2 * -6px), calc(115.2265625px - 2 * -4px) |

## Components

### Sidebar

#### sidebar

Sidebar (expanded). `#stage-slideover-sidebar`, 260 wide (`--sidebar-width`), `--sidebar-surface-primary` fill and a 1px `--border-extra-light` rule at the inline end. The header and the account row are sticky inside it.

Page copy: `home-dark`. Finder: `() => S()`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 260 x 900 |
| Padding | 0px |
| Border | T: none; R: 1px solid #ffffff @ 0.1; B: none; L: none |
| Radius | 0px |
| Background | #000000 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div.h-6.w-6.shrink-0: -apple-system-body 12px/17.1429px 600, #ffffff |
| Transition | none |
| Icon | 20 x 20, colour #ffffff, fill #000000 |
| Painted layers | div.border-token-border-extra-light.bg-token-sidebar-surface-primary.relative 260.0x900.0 bg #000000 border R:1px solid #ffffff @ 0.1; a.group.__menu-item.border-b 36.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px; button.group.__menu-item.border-b 40.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px; button.group.__menu-item.border-b 40.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px; button.group.__menu-item.border-b 40.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px; div.group.__menu-item.border-b 40.0x40.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --bg-tertiary #414141; --border-extra-light #ffffff1a; --sidebar-rail-width calc(13 * .25rem); --sidebar-section-first-margin-top .5rem; --sidebar-surface-primary #000; --sidebar-width 260px; --surface-hover #ffffff26; --text-primary #fff; --text-tertiary #afafaf |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 260 x 900 |
| Padding | 0px |
| Border | T: none; R: 1px solid #000000 @ 0.05; B: none; L: none |
| Radius | 0px |
| Background | #fcfcfc |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div.h-6.w-6.shrink-0: -apple-system-body 12px/17.1429px 600, #ffffff |
| Transition | none |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 |
| Painted layers | div.border-token-border-extra-light.bg-token-sidebar-surface-primary.relative 260.0x900.0 bg #fcfcfc border R:1px solid #000000 @ 0.05; a.group.__menu-item.border-b 36.0x36.0 border B:1px solid #000000 @ 0 r 10px; button.group.__menu-item.border-b 40.0x36.0 border B:1px solid #000000 @ 0 r 10px; button.group.__menu-item.border-b 40.0x36.0 border B:1px solid #000000 @ 0 r 10px; button.group.__menu-item.border-b 40.0x36.0 border B:1px solid #000000 @ 0 r 10px; div.group.__menu-item.border-b 40.0x40.0 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --bg-tertiary #f3f3f3; --border-extra-light #0000000d; --sidebar-rail-width calc(13 * .25rem); --sidebar-section-first-margin-top .5rem; --sidebar-surface-primary #fcfcfc; --sidebar-width 260px; --surface-hover #00000012; --text-primary #0d0d0d; --text-tertiary #8f8f8f |
| How | at rest |

Crops: `sidebar-default.png`, `sidebar-light.png`.

#### sidebar-header

Sidebar header row. 52 tall (`--header-height`): the ChatGPT wordmark at the start, search and close icon buttons at the end.

Page copy: `home-dark`. Finder: `() => Q('#sidebar-header', 0, S())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 244 x 52 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | span: OpenAI Sans 18px/26px 600, #ffffff, ls -0.27px |
| Transition | none |
| Icon | 20 x 20, colour #afafaf, fill #000000 |
| Tokens | --surface-hover #ffffff26; --text-primary #fff; --text-tertiary #afafaf |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 244 x 52 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | span: OpenAI Sans 18px/26px 600, #0d0d0d, ls -0.27px |
| Transition | none |
| Icon | 20 x 20, colour #8f8f8f, fill #000000 |
| Tokens | --surface-hover #00000012; --text-primary #0d0d0d; --text-tertiary #8f8f8f |
| How | at rest |

Crops: `sidebar-header-default.png`, `sidebar-header-light.png`.

#### sidebar-wordmark

Wordmark link (ChatGPT). The only place the UI sets OpenAI Sans: `.header-wordmark`, 600 weight, -0.015em tracking.

Page copy: `home-dark`. Finder: `() => C(T('ChatGPT', S()), 'a')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 95.23 x 36 | = | = |
| Padding | 0px 10px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span: OpenAI Sans 18px/26px 600, #ffffff, ls -0.27px | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Tokens | --surface-hover #ffffff26; --text-primary #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 95.23 x 36 | = | = |
| Padding | 0px 10px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Text node | span: OpenAI Sans 18px/26px 600, #0d0d0d, ls -0.27px | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Tokens | --surface-hover #00000012; --text-primary #0d0d0d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `sidebar-wordmark-default.png`, `sidebar-wordmark-hover.png`, `sidebar-wordmark-focus-visible.png`, `sidebar-wordmark-light.png`, `sidebar-wordmark-light-hover.png`, `sidebar-wordmark-light-focus-visible.png`.

#### sidebar-icon-button

Sidebar icon button (Search). 36x36, radius 8, `--text-tertiary` icon; hover fills with `--surface-hover`.

Page copy: `home-dark`. Finder: `() => Q('button[aria-label="Search"]', 0, S())`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.15 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #afafaf | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #afafaf, fill #000000 | = | = |
| Tokens | --surface-hover #ffffff26; --text-tertiary #afafaf | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.text-token-text-tertiary.no-draggable.flex 36.0x36.0 bg #ffffff @ 0.15 r 8px | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #000000 @ 0.07 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #8f8f8f | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #8f8f8f, fill #000000 | = | = |
| Tokens | --surface-hover #00000012; --text-tertiary #8f8f8f | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.text-token-text-tertiary.no-draggable.flex 36.0x36.0 bg #000000 @ 0.07 r 8px | = |

Crops: `sidebar-icon-button-default.png`, `sidebar-icon-button-hover.png`, `sidebar-icon-button-focus-visible.png`, `sidebar-icon-button-light.png`, `sidebar-icon-button-light-hover.png`, `sidebar-icon-button-light-focus-visible.png`.

#### sidebar-close-button

Close sidebar button.

Page copy: `home-dark`. Finder: `() => Q('[data-testid=close-sidebar-button]', 0, S())`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.15 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #afafaf | = |
| Transition | none | = |
| Cursor | w-resize | = |
| Icon | 20 x 20, colour #afafaf, fill #000000 | = |
| Tokens | --surface-hover #ffffff26; --text-tertiary #afafaf | = |
| How | at rest | mouse hover |
| Painted layers | - | button.text-token-text-tertiary.no-draggable.flex 36.0x36.0 bg #ffffff @ 0.15 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #000000 @ 0.07 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #8f8f8f | = |
| Transition | none | = |
| Cursor | w-resize | = |
| Icon | 20 x 20, colour #8f8f8f, fill #000000 | = |
| Tokens | --surface-hover #00000012; --text-tertiary #8f8f8f | = |
| How | at rest | mouse hover |
| Painted layers | - | button.text-token-text-tertiary.no-draggable.flex 36.0x36.0 bg #000000 @ 0.07 r 8px |

Crops: `sidebar-close-button-default.png`, `sidebar-close-button-hover.png`, `sidebar-close-button-light.png`, `sidebar-close-button-light-hover.png`.

#### nav-row

Nav row (Images). A `.__menu-item` row, 36 tall, radius 10, 20px icon and 14/20 text, inset 6px from the sidebar edges. Its fills come from inline `--menu-item-*` variables pointing at `--interactive-bg-secondary-*`. The current page gets the selected fill (`active`).

Page copy: `home-dark`, `library-dark`. Finder: `() => Q('[data-testid=sidebar-item-library]', 0, S())`.

Dark theme.

| Property | default | hover | focus-visible | active | active-hover | active-library |
|---|---|---|---|---|---|---|
| Size (w x h) | 248 x 36 | = | = | = | = | = |
| Padding | 6px 10px | = | = | = | = | = |
| Gap | 6px | = | = | 8px | 8px | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none | = | = | = | = | = |
| Radius | 10px | = | = | = | = | = |
| Background | #ffffff @ 0 | #ffffff @ 0.1 | #ffffff @ 0.1 | #ffffff @ 0.1 | #ffffff @ 0.1 | #ffffff @ 0.1 |
| Box shadow | none | = | = | = | = | = |
| Outline | none | = | = | = | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = | = | = | = |
| Letter spacing | normal | = | = | = | = | = |
| Colour | #ffffff | = | = | = | = | = |
| Text node | div.truncate: -apple-system-body 14px/20px 400, #ffffff | = | = | = | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = | = | = |
| Cursor | pointer | = | = | = | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = | = | = | = |
| Painted layers | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --menu-item-active #ffffff1a; --menu-item-background #fff0; --menu-item-highlighted #ffffff1a; --menu-item-icon-opacity 1; --menu-item-open #ffffff0d; --menu-item-pressed #ffffff0d | = | = | --menu-item-active #ffffff1a; --menu-item-background #fff0; --menu-item-highlighted #ffffff1a; --menu-item-icon-opacity 1; --menu-item-open #ffffff0d; --menu-item-pressed #ffffff0d; --text-tertiary #afafaf | --menu-item-active #ffffff1a; --menu-item-background #fff0; --menu-item-highlighted #ffffff1a; --menu-item-icon-opacity 1; --menu-item-open #ffffff0d; --menu-item-pressed #ffffff0d; --text-tertiary #afafaf | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured active | mouse hover | at rest, captured active-library |

Light theme.

| Property | light | light-hover | light-focus-visible | light-active | light-active-hover | light-active-library |
|---|---|---|---|---|---|---|
| Size (w x h) | 248 x 36 | = | = | = | = | = |
| Padding | 6px 10px | = | = | = | = | = |
| Gap | 6px | = | = | 8px | 8px | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none | = | = | = | = | = |
| Radius | 10px | = | = | = | = | = |
| Background | transparent | #000000 @ 0.05 | #000000 @ 0.05 | #000000 @ 0.05 | #000000 @ 0.05 | #000000 @ 0.05 |
| Box shadow | none | = | = | = | = | = |
| Outline | none | = | = | = | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = | = | = | = |
| Letter spacing | normal | = | = | = | = | = |
| Colour | #0d0d0d | = | = | = | = | = |
| Text node | div.truncate: -apple-system-body 14px/20px 400, #0d0d0d | = | = | = | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = | = | = |
| Cursor | pointer | = | = | = | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = | = | = | = |
| Painted layers | a.group.__menu-item.border-b 248.0x36.0 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --menu-item-active #0000000d; --menu-item-background #0000; --menu-item-highlighted #0000000d; --menu-item-icon-opacity 1; --menu-item-open #0000000d; --menu-item-pressed #0000000d | = | = | --menu-item-active #0000000d; --menu-item-background #0000; --menu-item-highlighted #0000000d; --menu-item-icon-opacity 1; --menu-item-open #0000000d; --menu-item-pressed #0000000d; --text-tertiary #8f8f8f | --menu-item-active #0000000d; --menu-item-background #0000; --menu-item-highlighted #0000000d; --menu-item-icon-opacity 1; --menu-item-open #0000000d; --menu-item-pressed #0000000d; --text-tertiary #8f8f8f | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured active | mouse hover | at rest, captured active-library |

Other finders: active: `() => Q('[data-testid=create-new-chat-button]', 0, S())`; active-hover: `() => Q('[data-testid=create-new-chat-button]', 0, S())`; active-library: `() => Q('[data-testid=sidebar-item-recall]', 0, S())`; light-active-library: `() => Q('[data-testid=sidebar-item-recall]', 0, S())`; light-active: `() => Q('[data-testid=create-new-chat-button]', 0, S())`; light-active-hover: `() => Q('[data-testid=create-new-chat-button]', 0, S())`.

Crops: `nav-row-default.png`, `nav-row-hover.png`, `nav-row-focus-visible.png`, `nav-row-active.png`, `nav-row-active-hover.png`, `nav-row-active-library.png`, `nav-row-light.png`, `nav-row-light-hover.png`, `nav-row-light-focus-visible.png`, `nav-row-light-active.png`, `nav-row-light-active-hover.png`, `nav-row-light-active-library.png`.

#### nav-row-icon

Nav row icon. A sprite `<use>` icon, drawn in currentColor.

Page copy: `home-dark`. Finder: `() => Q('[data-testid=sidebar-item-library] svg', 0, S())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 20 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| Cursor | pointer |
| Icon | 20 x 20, colour #ffffff, fill #000000 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 20 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| Cursor | pointer |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 |
| How | at rest |

Crops: `nav-row-icon-default.png`, `nav-row-icon-light.png`.

#### section-label

Section label (Pinned). A collapsible header: `.__menu-label` text in `--text-tertiary`; the row shows a chevron on hover.

Page copy: `home-dark`. Finder: `() => C(T('Pinned', S()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 254 x 32 | = | = |
| Padding | 6px 16px | = | = |
| Gap | 2px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #afafaf | = | = |
| Text node | h2.__menu-label.font-medium: -apple-system-body 14px/20px 500, #afafaf | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 12 x 12, colour #afafaf, fill #000000 | = | = |
| Tokens | --text-tertiary #afafaf | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | = | button.text-token-text-tertiary.flex.w-full 254.0x32.0 outline 1px auto #99c8ff offset 0px |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 254 x 32 | = | = |
| Padding | 6px 16px | = | = |
| Gap | 2px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #8f8f8f | = | = |
| Text node | h2.__menu-label.font-medium: -apple-system-body 14px/20px 500, #8f8f8f | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 12 x 12, colour #8f8f8f, fill #000000 | = | = |
| Tokens | --text-tertiary #8f8f8f | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | = | button.text-token-text-tertiary.flex.w-full 254.0x32.0 outline 1px auto #005fcc offset 0px |

Crops: `section-label-default.png`, `section-label-hover.png`, `section-label-focus-visible.png`, `section-label-light.png`, `section-label-light-hover.png`, `section-label-light-focus-visible.png`.

#### section-label-text

Section label text.

Page copy: `home-dark`. Finder: `() => Q('h2.__menu-label', 0, S())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 45.47 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 500 |
| Letter spacing | normal |
| Colour | #afafaf |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 45.47 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 500 |
| Letter spacing | normal |
| Colour | #8f8f8f |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Crops: `section-label-text-default.png`, `section-label-text-light.png`.

#### chat-row

Chat row (pinned). Pinned chats carry a speech-bubble icon; plain history rows (Chats) have none. Hover reveals the options button at the end. The open chat gets the selected fill (`active`).

Page copy: `home-dark`, `thread-dark-table`. Finder: `() => C(T('[CTX] Internship Reflections', S()), 'a')`.

Dark theme.

| Property | default | hover | focus-visible | active |
|---|---|---|---|---|
| Size (w x h) | 248 x 36 | = | = | = |
| Padding | 6px 10px | = | = | = |
| Gap | 8px | = | = | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none | = | = | = |
| Radius | 10px | = | = | = |
| Background | #ffffff @ 0 | #ffffff @ 0.1 | #ffffff @ 0.1 | #ffffff @ 0.1 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Text node | span._NCija_content: -apple-system-body 14px/20px 400, #ffffff | = | = | = |
| Transition | opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = | = |
| Painted layers | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --interactive-label-hover-secondary #ffffffe5; --menu-item-active #ffffff1a; --menu-item-background #fff0; --menu-item-highlighted #ffffff1a; --menu-item-icon-opacity 1; --menu-item-open #ffffff0d; --menu-item-pressed #ffffff0d; --text-tertiary #afafaf | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured active |

Light theme.

| Property | light | light-hover | light-focus-visible | light-active |
|---|---|---|---|---|
| Size (w x h) | 248 x 36 | = | = | = |
| Padding | 6px 10px | = | = | = |
| Gap | 8px | = | = | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none | = | = | = |
| Radius | 10px | = | = | = |
| Background | transparent | #000000 @ 0.05 | #000000 @ 0.05 | #000000 @ 0.05 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #0d0d0d | = | = | = |
| Text node | span._NCija_content: -apple-system-body 14px/20px 400, #0d0d0d | = | = | = |
| Transition | opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = | = |
| Painted layers | a.group.__menu-item.border-b 248.0x36.0 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --interactive-label-hover-secondary #000000e5; --menu-item-active #0000000d; --menu-item-background #0000; --menu-item-highlighted #0000000d; --menu-item-icon-opacity 1; --menu-item-open #0000000d; --menu-item-pressed #0000000d; --text-tertiary #8f8f8f | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured active |

Other finders: active: `() => C(T('[P] KL Hikes', S()), 'a')`; light-active: `() => C(T('[P] KL Hikes', S()), 'a')`.

Crops: `chat-row-default.png`, `chat-row-hover.png`, `chat-row-focus-visible.png`, `chat-row-active.png`, `chat-row-light.png`, `chat-row-light-hover.png`, `chat-row-light-focus-visible.png`, `chat-row-light-active.png`.

#### history-row

History row (Chats).

Page copy: `home-dark`. Finder: `() => C(T('List Singapore celebrations', S()), 'a')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 248 x 36 | = |
| Padding | 6px 10px | = |
| Gap | 8px | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none | = |
| Radius | 10px | = |
| Background | #ffffff @ 0 | #ffffff @ 0.1 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Text node | span._NCija_content: -apple-system-body 14px/20px 400, #ffffff | = |
| Transition | opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #afafaf, fill #000000 | = |
| Painted layers | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --interactive-label-hover-secondary #ffffffe5; --menu-item-active #ffffff1a; --menu-item-background #fff0; --menu-item-highlighted #ffffff1a; --menu-item-open #ffffff0d; --menu-item-pressed #ffffff0d; --text-tertiary #afafaf | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 248 x 36 | = |
| Padding | 6px 10px | = |
| Gap | 8px | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none | = |
| Radius | 10px | = |
| Background | transparent | #000000 @ 0.05 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Text node | span._NCija_content: -apple-system-body 14px/20px 400, #0d0d0d | = |
| Transition | opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #8f8f8f, fill #000000 | = |
| Painted layers | a.group.__menu-item.border-b 248.0x36.0 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --interactive-label-hover-secondary #000000e5; --menu-item-active #0000000d; --menu-item-background #0000; --menu-item-highlighted #0000000d; --menu-item-open #0000000d; --menu-item-pressed #0000000d; --text-tertiary #8f8f8f | = |
| How | at rest | mouse hover |

Crops: `history-row-default.png`, `history-row-hover.png`, `history-row-light.png`, `history-row-light-hover.png`.

#### chat-row-options

Chat row options button. Hidden until its row is hovered; measured while the row is hovered.

Page copy: `home-dark`. Finder: `() => S().querySelector('[data-testid=history-item-0-options]')`.

Dark theme.

| Property | hover |
|---|---|
| Size (w x h) | 34 x 36 |
| Padding | 0px 6px 0px 4px |
| Border | none |
| Radius | 0px 10px 10px 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #afafaf |
| Transition | none |
| Cursor | pointer |
| Icon | 16 x 16, colour #afafaf, fill #000000 |
| Tokens | --interactive-label-hover-secondary #ffffffe5; --text-tertiary #afafaf |
| How | mouse hover on its row |

Light theme.

| Property | light-hover |
|---|---|
| Size (w x h) | 34 x 36 |
| Padding | 0px 6px 0px 4px |
| Border | none |
| Radius | 0px 10px 10px 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #8f8f8f |
| Transition | none |
| Cursor | pointer |
| Icon | 16 x 16, colour #8f8f8f, fill #000000 |
| Tokens | --interactive-label-hover-secondary #000000e5; --text-tertiary #8f8f8f |
| How | mouse hover on its row |

Crops: `chat-row-options-hover.png`, `chat-row-options-light-hover.png`.

#### project-row

Project row. Each project keeps its own icon and colour; hover reveals "Open project home" and options.

Page copy: `home-dark`, `project-dark`. Finder: `() => C(T('Introspection', S()), '[role=button]')`.

Dark theme.

| Property | default | hover | focus-visible | active |
|---|---|---|---|---|
| Size (w x h) | 248 x 36 | = | = | = |
| Padding | 6px 10px | 6px 64px 6px 10px | 6px 64px 6px 10px | = |
| Gap | 6px | = | = | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none | = | = | = |
| Radius | 10px | = | = | = |
| Background | #ffffff @ 0 | #ffffff @ 0.1 | #ffffff @ 0.1 | #ffffff @ 0.1 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Text node | span._NCija_content: -apple-system-body 14px/20px 400, #ffffff | = | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = | = |
| Painted layers | div.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px | div.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px | div.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px | div.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --menu-item-active #ffffff1a; --menu-item-background #fff0; --menu-item-highlighted #ffffff1a; --menu-item-icon-opacity 1; --menu-item-open #ffffff0d; --menu-item-pressed #ffffff0d | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured active |

Light theme.

| Property | light | light-hover | light-focus-visible | light-active |
|---|---|---|---|---|
| Size (w x h) | 248 x 36 | = | = | = |
| Padding | 6px 10px | 6px 64px 6px 10px | 6px 64px 6px 10px | = |
| Gap | 6px | = | = | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none | = | = | = |
| Radius | 10px | = | = | = |
| Background | transparent | #000000 @ 0.05 | #000000 @ 0.05 | #000000 @ 0.05 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #0d0d0d | = | = | = |
| Text node | span._NCija_content: -apple-system-body 14px/20px 400, #0d0d0d | = | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = | = |
| Painted layers | div.group.__menu-item.border-b 248.0x36.0 border B:1px solid #000000 @ 0 r 10px | div.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px | div.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px | div.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --menu-item-active #0000000d; --menu-item-background #0000; --menu-item-highlighted #0000000d; --menu-item-icon-opacity 1; --menu-item-open #0000000d; --menu-item-pressed #0000000d | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured active |

Other finders: active: `() => C(T('Research', S()), '[role=button]')`; light-active: `() => C(T('Research', S()), '[role=button]')`.

Crops: `project-row-default.png`, `project-row-hover.png`, `project-row-focus-visible.png`, `project-row-active.png`, `project-row-light.png`, `project-row-light-hover.png`, `project-row-light-focus-visible.png`, `project-row-light-active.png`.

#### account-row

Account row. 52 tall: a 24px avatar, the name over the plan in `--text-tertiary`, and the Upgrade pill at the end; sticky at the bottom over a hairline.

Page copy: `home-dark`, `home-dark-user-menu`. Finder: `() => Q('[data-testid=accounts-profile-button]', 0, S())`.

Dark theme.

| Property | default | hover | open |
|---|---|---|---|
| Size (w x h) | 248 x 52.14 | = | = |
| Padding | 6px 10px 6px 8px | = | = |
| Gap | 8px | = | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none | = | = |
| Radius | 10px | = | = |
| Background | #ffffff @ 0 | #ffffff @ 0.1 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | div.h-6.w-6.shrink-0: -apple-system-body 12px/17.1429px 600, #ffffff | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | div.group.__menu-item.border-b 248.0x52.1 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px; div.flex.overflow-hidden.select-none 24.0x24.0 bg #414141 r full; div.h-6.w-6.shrink-0 24.0x24.0 bg #8a8a8a r 9999px; span.btn-secondary.btn.btn-small 71.9x28.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full | div.group.__menu-item.border-b 248.0x52.1 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px; div.flex.overflow-hidden.select-none 24.0x24.0 bg #414141 r full; div.h-6.w-6.shrink-0 24.0x24.0 bg #8a8a8a r 9999px; span.btn-secondary.btn.btn-small 71.9x28.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full | div.group.__menu-item.border-b 248.0x52.1 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px; div.overflow-hidden.rounded-full.bg-gray-500/30 24.0x24.0 bg #414141 r full; div.h-6.w-6.shrink-0 24.0x24.0 bg #8a8a8a r 9999px; span.btn-secondary.btn.btn-small 71.9x28.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full |
| Tokens | --bg-tertiary #414141; --interactive-label-hover-secondary #ffffffe5; --menu-item-active #ffffff1a; --menu-item-background #fff0; --menu-item-highlighted #ffffff1a; --menu-item-icon-opacity 1; --menu-item-open #ffffff0d; --menu-item-pressed #ffffff0d; --text-secondary #cdcdcd; --text-tertiary #afafaf | = | = |
| How | at rest | mouse hover | at rest, captured open |

Light theme.

| Property | light | light-hover | light-open |
|---|---|---|---|
| Size (w x h) | 248 x 52.14 | = | = |
| Padding | 6px 10px 6px 8px | = | = |
| Gap | 8px | = | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none | = | = |
| Radius | 10px | = | = |
| Background | transparent | #000000 @ 0.05 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Text node | div.h-6.w-6.shrink-0: -apple-system-body 12px/17.1429px 600, #ffffff | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Painted layers | div.group.__menu-item.border-b 248.0x52.1 border B:1px solid #000000 @ 0 r 10px; div.flex.overflow-hidden.select-none 24.0x24.0 bg #f3f3f3 r full; div.h-6.w-6.shrink-0 24.0x24.0 bg #8a8a8a r 9999px; span.btn-secondary.btn.btn-small 71.9x28.0 bg #ffffff border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full | div.group.__menu-item.border-b 248.0x52.1 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px; div.flex.overflow-hidden.select-none 24.0x24.0 bg #f3f3f3 r full; div.h-6.w-6.shrink-0 24.0x24.0 bg #8a8a8a r 9999px; span.btn-secondary.btn.btn-small 71.9x28.0 bg #ffffff border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full | div.group.__menu-item.border-b 248.0x52.1 border B:1px solid #000000 @ 0 r 10px; div.overflow-hidden.rounded-full.bg-gray-500/30 24.0x24.0 bg #f3f3f3 r full; div.h-6.w-6.shrink-0 24.0x24.0 bg #8a8a8a r 9999px; span.btn-secondary.btn.btn-small 71.9x28.0 bg #ffffff border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full |
| Tokens | --bg-tertiary #f3f3f3; --interactive-label-hover-secondary #000000e5; --menu-item-active #0000000d; --menu-item-background #0000; --menu-item-highlighted #0000000d; --menu-item-icon-opacity 1; --menu-item-open #0000000d; --menu-item-pressed #0000000d; --text-secondary #5d5d5d; --text-tertiary #8f8f8f | = | = |
| How | at rest | mouse hover | at rest, captured open |

Other finders: open: `() => Q('[data-testid=accounts-profile-button]', 0, S())`; light-open: `() => Q('[data-testid=accounts-profile-button]', 0, S())`.

Crops: `account-row-default.png`, `account-row-hover.png`, `account-row-open.png`, `account-row-light.png`, `account-row-light-hover.png`, `account-row-light-open.png`.

#### avatar

Avatar. Redacted to a grey disc with an L; the real one is the account photo at 24px.

Page copy: `home-dark`. Finder: `() => Q('[data-testid=accounts-profile-button] .rounded-full', 0, S())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 24 x 24 |
| Padding | 0px |
| Border | none |
| Radius | full |
| Background | #414141 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div.h-6.w-6.shrink-0: -apple-system-body 12px/17.1429px 600, #ffffff |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.flex.overflow-hidden.select-none 24.0x24.0 bg #414141 r full; div.h-6.w-6.shrink-0 24.0x24.0 bg #8a8a8a r 9999px |
| Tokens | --bg-tertiary #414141 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 24 x 24 |
| Padding | 0px |
| Border | none |
| Radius | full |
| Background | #f3f3f3 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div.h-6.w-6.shrink-0: -apple-system-body 12px/17.1429px 600, #ffffff |
| Transition | none |
| Cursor | pointer |
| Painted layers | div.flex.overflow-hidden.select-none 24.0x24.0 bg #f3f3f3 r full; div.h-6.w-6.shrink-0 24.0x24.0 bg #8a8a8a r 9999px |
| Tokens | --bg-tertiary #f3f3f3 |
| How | at rest |

Crops: `avatar-default.png`, `avatar-light.png`.

#### sidebar-upgrade

Upgrade pill (account row). An outline pill: a `--border-default` ring, 13px 500 text.

Page copy: `home-dark`. Finder: `() => C(T('Upgrade', S()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 97.89 x 51.14 | = | = |
| Padding | 6px 10px 6px 8px | = | = |
| Border | none | = | = |
| Radius | 0px 10px 10px 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #afafaf | #ffffff @ 0.898 | #ffffff @ 0.898 |
| Text node | span.btn-secondary.btn.btn-small: -apple-system-body 12px/16px 500, #ffffff | = | = |
| Transition | none | = | = |
| Cursor | default | = | = |
| Painted layers | span.btn-secondary.btn.btn-small 71.9x28.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full | = | = |
| Tokens | --interactive-label-hover-secondary #ffffffe5; --text-tertiary #afafaf | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 97.89 x 51.14 | = | = |
| Padding | 6px 10px 6px 8px | = | = |
| Border | none | = | = |
| Radius | 0px 10px 10px 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #8f8f8f | #000000 @ 0.898 | #000000 @ 0.898 |
| Text node | span.btn-secondary.btn.btn-small: -apple-system-body 12px/16px 500, #0d0d0d | = | = |
| Transition | none | = | = |
| Cursor | default | = | = |
| Painted layers | span.btn-secondary.btn.btn-small 71.9x28.0 bg #ffffff border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full | span.btn-secondary.btn.btn-small 71.9x28.0 bg #f9f9f9 border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full | = |
| Tokens | --interactive-label-hover-secondary #000000e5; --text-tertiary #8f8f8f | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `sidebar-upgrade-default.png`, `sidebar-upgrade-hover.png`, `sidebar-upgrade-focus-visible.png`, `sidebar-upgrade-light.png`, `sidebar-upgrade-light-hover.png`, `sidebar-upgrade-light-focus-visible.png`.

#### sidebar-rail

Sidebar collapsed to the tiny rail. `#stage-sidebar-tiny-bar`, 52 wide (`--sidebar-rail-width`, 13 spacing units): open sidebar, new chat, search, images, library, then the avatar at the bottom.

Page copy: `home-dark-sidebar-collapsed`. Finder: `() => RAIL()`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 52 x 900 |
| Padding | 0px 0px 6px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div.h-6.w-6.shrink-0: -apple-system-body 12px/17.1429px 600, #ffffff |
| Transition | opacity 0.15s steps(1, start) |
| Cursor | e-resize |
| Icon | 20 x 20, colour #ffffff, fill #000000 |
| Painted layers | a.group.__menu-item.border-b 36.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px; button.group.__menu-item.border-b 40.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px; button.group.__menu-item.border-b 40.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px; button.group.__menu-item.border-b 40.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px; div.group.__menu-item.border-b 40.0x40.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px; div.overflow-hidden.rounded-full.bg-gray-500/30 24.0x24.0 bg #414141 r full |
| Tokens | --bg-tertiary #414141; --sidebar-rail-width calc(13 * .25rem); --sidebar-section-first-margin-top .5rem; --surface-hover #ffffff26; --text-primary #fff |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 52 x 900 |
| Padding | 0px 0px 6px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div.h-6.w-6.shrink-0: -apple-system-body 12px/17.1429px 600, #ffffff |
| Transition | opacity 0.15s steps(1, start) |
| Cursor | e-resize |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 |
| Painted layers | a.group.__menu-item.border-b 36.0x36.0 border B:1px solid #000000 @ 0 r 10px; button.group.__menu-item.border-b 40.0x36.0 border B:1px solid #000000 @ 0 r 10px; button.group.__menu-item.border-b 40.0x36.0 border B:1px solid #000000 @ 0 r 10px; button.group.__menu-item.border-b 40.0x36.0 border B:1px solid #000000 @ 0 r 10px; div.group.__menu-item.border-b 40.0x40.0 border B:1px solid #000000 @ 0 r 10px; div.overflow-hidden.rounded-full.bg-gray-500/30 24.0x24.0 bg #f3f3f3 r full |
| Tokens | --bg-tertiary #f3f3f3; --sidebar-rail-width calc(13 * .25rem); --sidebar-section-first-margin-top .5rem; --surface-hover #00000012; --text-primary #0d0d0d |
| How | at rest |

Crops: `sidebar-rail-default.png`, `sidebar-rail-light.png`.

#### rail-button

Rail button (New chat).

Page copy: `home-dark-sidebar-collapsed`. Finder: `() => Q('[data-testid=create-new-chat-button]', 0, RAIL())`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none | = | = |
| Radius | 10px | = | = |
| Background | #ffffff @ 0 | #ffffff @ 0.1 | #ffffff @ 0.1 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| Painted layers | a.group.__menu-item.border-b 36.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 36.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 36.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --menu-item-active #ffffff1a; --menu-item-background #fff0; --menu-item-highlighted #ffffff1a; --menu-item-icon-opacity 1; --menu-item-open #ffffff0d; --menu-item-pressed #ffffff0d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none | = | = |
| Radius | 10px | = | = |
| Background | transparent | #000000 @ 0.05 | #000000 @ 0.05 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = |
| Painted layers | a.group.__menu-item.border-b 36.0x36.0 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 36.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px | a.group.__menu-item.border-b 36.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --menu-item-active #0000000d; --menu-item-background #0000; --menu-item-highlighted #0000000d; --menu-item-icon-opacity 1; --menu-item-open #0000000d; --menu-item-pressed #0000000d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `rail-button-default.png`, `rail-button-hover.png`, `rail-button-focus-visible.png`, `rail-button-light.png`, `rail-button-light-hover.png`, `rail-button-light-focus-visible.png`.

#### rail-open-sidebar

Rail open-sidebar button.

Page copy: `home-dark-sidebar-collapsed`. Finder: `() => Q('button[aria-label="Open sidebar"]', 0, RAIL())`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.15 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Transition | none | = |
| Cursor | e-resize | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = |
| Tokens | --surface-hover #ffffff26; --text-primary #fff | = |
| How | at rest | mouse hover |
| Painted layers | - | button.text-token-text-primary.no-draggable.flex 36.0x36.0 bg #ffffff @ 0.15 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #000000 @ 0.07 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Transition | none | = |
| Cursor | e-resize | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = |
| Tokens | --surface-hover #00000012; --text-primary #0d0d0d | = |
| How | at rest | mouse hover |
| Painted layers | - | button.text-token-text-primary.no-draggable.flex 36.0x36.0 bg #000000 @ 0.07 r 8px |

Crops: `rail-open-sidebar-default.png`, `rail-open-sidebar-hover.png`, `rail-open-sidebar-light.png`, `rail-open-sidebar-light-hover.png`.

### Top bar

#### page-header

Page header. 52 tall, sticky, 8px padding; the mode toggle centred, actions at the end.

Page copy: `home-dark`. Finder: `() => Q('#page-header')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 1180 x 52 |
| Padding | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | button.box-border.flex.h-full: -apple-system-body 14px/20px 500, #ffffff |
| Transition | none |
| Icon | 12 x 12, colour #63a8f8, fill #000000 |
| Painted layers | header.draggable.no-draggable-children.sticky 1180.0x52.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px; div.bg-token-bg-primary.relative.rounded-full 260.6x36.0 bg #212121 r full; div.bg-token-text-primary/3.pointer-events-none.absolute 258.6x34.0 bg #131313 r full; div.bg-token-bg-primary.absolute.rounded-full 139.3x37.0 bg #1b1b1b border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px; div.translucent-surface.rounded-lg 106.2x34.0 bg #000000 @ 0.6 r 8px; button.button-glimmer-cta.relative.flex 106.2x34.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px |
| Tokens | --bg-elevated-primary #1b1b1b; --bg-primary #212121; --icon-accent #63a8f8; --interactive-label-accent-default #63a8f8; --surface-hover #ffffff26; --text-primary #fff; --text-secondary #cdcdcd |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 1180 x 52 |
| Padding | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | button.box-border.flex.h-full: -apple-system-body 14px/20px 500, #0d0d0d |
| Transition | none |
| Icon | 12 x 12, colour #3a83f7, fill #000000 |
| Painted layers | header.draggable.no-draggable-children.sticky 1180.0x52.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px; div.bg-token-bg-primary.relative.rounded-full 260.6x36.0 bg #ffffff r full; div.bg-token-text-primary/3.pointer-events-none.absolute 258.6x34.0 bg #0d0d0d @ 0.03 r full; div.bg-token-bg-primary.absolute.rounded-full 139.3x37.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.05 0px 1px 6px 0px; div.translucent-surface.rounded-lg 106.2x34.0 bg #fcfcfc @ 0.6 r 8px; button.button-glimmer-cta.relative.flex 106.2x34.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px |
| Tokens | --bg-elevated-primary #fff; --bg-primary #fff; --icon-accent #3a83f7; --interactive-label-accent-default #3a83f7; --surface-hover #00000012; --text-primary #0d0d0d; --text-secondary #5d5d5d |
| How | at rest |

Crops: `page-header-default.png`, `page-header-light.png`.

#### mode-toggle

Chat / Work segmented toggle. A pill track with two 130x36 radio segments; the selected one carries a filled thumb.

Page copy: `home-dark`. Finder: `() => P(Q('#page-header [role=radio]').parentElement)`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 260.56 x 36 |
| Padding | 0px |
| Border | none |
| Radius | full |
| Background | #212121 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | button.box-border.flex.h-full: -apple-system-body 14px/20px 500, #ffffff |
| Transition | none |
| Cursor | pointer |
| Icon | 12 x 12, colour #63a8f8, fill #000000 |
| Painted layers | div.bg-token-bg-primary.relative.rounded-full 260.6x36.0 bg #212121 r full; div.bg-token-text-primary/3.pointer-events-none.absolute 258.6x34.0 bg #131313 r full; div.bg-token-bg-primary.absolute.rounded-full 139.3x37.0 bg #1b1b1b border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Ancestor paint | 3 up header.draggable.no-draggable-children.sticky shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Tokens | --bg-elevated-primary #1b1b1b; --bg-primary #212121; --interactive-label-accent-default #63a8f8; --text-primary #fff; --text-secondary #cdcdcd |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 260.56 x 36 |
| Padding | 0px |
| Border | none |
| Radius | full |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | button.box-border.flex.h-full: -apple-system-body 14px/20px 500, #0d0d0d |
| Transition | none |
| Cursor | pointer |
| Icon | 12 x 12, colour #3a83f7, fill #000000 |
| Painted layers | div.bg-token-bg-primary.relative.rounded-full 260.6x36.0 bg #ffffff r full; div.bg-token-text-primary/3.pointer-events-none.absolute 258.6x34.0 bg #0d0d0d @ 0.03 r full; div.bg-token-bg-primary.absolute.rounded-full 139.3x37.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.05 0px 1px 6px 0px |
| Ancestor paint | 3 up header.draggable.no-draggable-children.sticky shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Tokens | --bg-elevated-primary #fff; --bg-primary #fff; --interactive-label-accent-default #3a83f7; --text-primary #0d0d0d; --text-secondary #5d5d5d |
| How | at rest |

Crops: `mode-toggle-default.png`, `mode-toggle-light.png`.

#### mode-segment

Mode segment (Work, not selected). Work is drawn in the accent blue with a sparkle.

Page copy: `home-dark`. Finder: `() => Q('#page-header [role=radio][aria-checked=false]')`.

Dark theme.

| Property | default | hover | focus-visible | selected | selected-hover |
|---|---|---|---|---|---|
| Size (w x h) | 130.28 x 36 | = | = | = | = |
| Padding | 8px 44px 8px 36px | = | = | 8px 36px 8px 44px | 8px 36px 8px 44px |
| Border | none | = | = | = | = |
| Radius | full | = | = | = | = |
| Background | transparent | = | = | = | = |
| Box shadow | none | = | = | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px | = | = |
| Font | -apple-system-body 14px/20px 500 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #cdcdcd | #ffffff | #ffffff | #ffffff | #ffffff |
| Text node | span.relative.inline-flex.items-center: -apple-system-body 14px/20px 500, #63a8f8 | = | = | - | - |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 12 x 12, colour #63a8f8, fill #000000 | = | = | - | - |
| Tokens | --interactive-label-accent-default #63a8f8; --text-primary #fff; --text-secondary #cdcdcd | = | = | --text-primary #fff; --text-secondary #cdcdcd | --text-primary #fff; --text-secondary #cdcdcd |
| How | at rest | mouse hover | keyboard: Shift keydown, then focus() | at rest, captured selected | mouse hover |
| Painted layers | - | = | button.box-border.flex.h-full 130.3x36.0 r full outline 1px auto #99c8ff offset 0px | = | = |

Light theme.

| Property | light | light-hover | light-focus-visible | light-selected | light-selected-hover |
|---|---|---|---|---|---|
| Size (w x h) | 130.28 x 36 | = | = | = | = |
| Padding | 8px 44px 8px 36px | = | = | 8px 36px 8px 44px | 8px 36px 8px 44px |
| Border | none | = | = | = | = |
| Radius | full | = | = | = | = |
| Background | transparent | = | = | = | = |
| Box shadow | none | = | = | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px | = | = |
| Font | -apple-system-body 14px/20px 500 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #5d5d5d | #0d0d0d | #0d0d0d | #0d0d0d | #0d0d0d |
| Text node | span.relative.inline-flex.items-center: -apple-system-body 14px/20px 500, #3a83f7 | = | = | - | - |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = | = |
| Cursor | pointer | = | = | = | = |
| Icon | 12 x 12, colour #3a83f7, fill #000000 | = | = | - | - |
| Tokens | --interactive-label-accent-default #3a83f7; --text-primary #0d0d0d; --text-secondary #5d5d5d | = | = | --text-primary #0d0d0d; --text-secondary #5d5d5d | --text-primary #0d0d0d; --text-secondary #5d5d5d |
| How | at rest | mouse hover | keyboard: Shift keydown, then focus() | at rest, captured selected | mouse hover |
| Painted layers | - | = | button.box-border.flex.h-full 130.3x36.0 r full outline 1px auto #005fcc offset 0px | = | = |

Other finders: selected: `() => Q('#page-header [role=radio][aria-checked=true]')`; selected-hover: `() => Q('#page-header [role=radio][aria-checked=true]')`; light-selected: `() => Q('#page-header [role=radio][aria-checked=true]')`; light-selected-hover: `() => Q('#page-header [role=radio][aria-checked=true]')`.

Crops: `mode-segment-default.png`, `mode-segment-hover.png`, `mode-segment-focus-visible.png`, `mode-segment-selected.png`, `mode-segment-selected-hover.png`, `mode-segment-light.png`, `mode-segment-light-hover.png`, `mode-segment-light-focus-visible.png`, `mode-segment-light-selected.png`, `mode-segment-light-selected-hover.png`.

#### header-upgrade

Upgrade button (header). Transparent pill, accent-blue sparkle and label (`.button-glimmer-cta`).

Page copy: `home-dark`. Finder: `() => Q('#page-header .button-glimmer-cta')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 106.16 x 34 | = | = |
| Padding | 0px 12px | = | = |
| Gap | 3px | = | = |
| Border | 1px solid #000000 @ 0 | 1px solid #3a83f7 @ 0.00999999 | = |
| Radius | 8px | = | = |
| Background | transparent | #a4cdfb @ 0.2 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #63a8f8 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #63a8f8, fill #000000 | = | = |
| Painted layers | button.button-glimmer-cta.relative.flex 106.2x34.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px | button.button-glimmer-cta.relative.flex 106.2x34.0 bg #a4cdfb @ 0.2 border T:1px solid #3a83f7 @ 0.00999999 / R:1px solid #3a83f7 @ 0.00999999 / B:1px solid #3a83f7 @ 0.00999999 / L:1px solid #3a83f7 @ 0.00999999 r 8px | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Backdrop filter | - | blur(38.571px) | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 106.16 x 34 | = | = |
| Padding | 0px 12px | = | = |
| Gap | 3px | = | = |
| Border | 1px solid #000000 @ 0 | 1px solid #3a83f7 @ 0.00999999 | = |
| Radius | 8px | = | = |
| Background | transparent | #3a83f7 @ 0.09 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #3a83f7 | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #3a83f7, fill #000000 | = | = |
| Painted layers | button.button-glimmer-cta.relative.flex 106.2x34.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px | button.button-glimmer-cta.relative.flex 106.2x34.0 bg #3a83f7 @ 0.09 border T:1px solid #3a83f7 @ 0.00999999 / R:1px solid #3a83f7 @ 0.00999999 / B:1px solid #3a83f7 @ 0.00999999 / L:1px solid #3a83f7 @ 0.00999999 r 8px | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Backdrop filter | - | blur(38.571px) | = |

Crops: `header-upgrade-default.png`, `header-upgrade-hover.png`, `header-upgrade-focus-visible.png`, `header-upgrade-light.png`, `header-upgrade-light-hover.png`, `header-upgrade-light-focus-visible.png`.

#### header-icon-button

Header icon button (Temporary chat).

Page copy: `home-dark`. Finder: `() => Q('#page-header button[aria-label="Temporary chat"]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | full | = | = |
| Background | transparent | #ffffff @ 0.15 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| Tokens | --surface-hover #ffffff26; --text-primary #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.text-token-text-primary.no-draggable.flex 36.0x36.0 bg #ffffff @ 0.15 r full | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | full | = | = |
| Background | transparent | #000000 @ 0.07 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = |
| Tokens | --surface-hover #00000012; --text-primary #0d0d0d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.text-token-text-primary.no-draggable.flex 36.0x36.0 bg #000000 @ 0.07 r full | = |

Crops: `header-icon-button-default.png`, `header-icon-button-hover.png`, `header-icon-button-focus-visible.png`, `header-icon-button-light.png`, `header-icon-button-light-hover.png`, `header-icon-button-light-focus-visible.png`.

#### share-button

Share button (thread).

Page copy: `thread-dark-table`. Finder: `() => Q('[data-testid=share-chat-button]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 88.22 x 36 | = | = |
| Padding | 0px 12px | = | = |
| Border | 1px solid #000000 @ 0 | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.1 | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px |
| Font | -apple-system-body 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | div.flex.w-full.items-center: -apple-system-body 14px/20px 500, #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| Painted layers | button.btn.relative.btn-ghost 88.2x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px | button.btn.relative.btn-ghost 88.2x36.0 bg #ffffff @ 0.1 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px | button.btn.relative.btn-ghost 88.2x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px outline 1px auto #99c8ff offset 0px |
| Tokens | --surface-hover #ffffff26; --text-primary #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 88.22 x 36 | = | = |
| Padding | 0px 12px | = | = |
| Border | 1px solid #000000 @ 0 | = | = |
| Radius | 8px | = | = |
| Background | transparent | #000000 @ 0.05 | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px |
| Font | -apple-system-body 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Text node | div.flex.w-full.items-center: -apple-system-body 14px/20px 500, #0d0d0d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = |
| Painted layers | button.btn.relative.btn-ghost 88.2x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px | button.btn.relative.btn-ghost 88.2x36.0 bg #000000 @ 0.05 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px | button.btn.relative.btn-ghost 88.2x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px outline 1px auto #005fcc offset 0px |
| Tokens | --surface-hover #00000012; --text-primary #0d0d0d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `share-button-default.png`, `share-button-hover.png`, `share-button-focus-visible.png`, `share-button-light.png`, `share-button-light-hover.png`, `share-button-light-focus-visible.png`.

#### conversation-options

Conversation options (…) button.

Page copy: `thread-dark-table`. Finder: `() => Q('[data-testid=conversation-options-button]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #ffffff @ 0.15 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = |
| Tokens | --surface-hover #ffffff26; --text-primary #fff | = |
| How | at rest | mouse hover |
| Painted layers | - | button.text-token-text-primary.no-draggable.flex 36.0x36.0 bg #ffffff @ 0.15 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #000000 @ 0.07 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = |
| Tokens | --surface-hover #00000012; --text-primary #0d0d0d | = |
| How | at rest | mouse hover |
| Painted layers | - | button.text-token-text-primary.no-draggable.flex 36.0x36.0 bg #000000 @ 0.07 r 8px |

Crops: `conversation-options-default.png`, `conversation-options-hover.png`, `conversation-options-light.png`, `conversation-options-light-hover.png`.

### Home

#### home-heading

Home heading. `text-heading-2` at 400 weight (28/34 here), centred over the composer.

Page copy: `home-dark`. Finder: `() => Q('h1', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 306.97 x 42 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 24px/28px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div.px-1.text-pretty.whitespace-pre-wrap: -apple-system-body 24px/28px 400, #ffffff |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 306.97 x 42 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 24px/28px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div.px-1.text-pretty.whitespace-pre-wrap: -apple-system-body 24px/28px 400, #0d0d0d |
| Transition | none |
| How | at rest |

Crops: `home-heading-default.png`, `home-heading-light.png`.

#### suggestion-row

Suggestion row. 768x52 rows under the composer, icon and 16px secondary text; hover fills with `text-primary` at 3%.

Page copy: `home-dark`. Finder: `() => C(T('Create an image or sticker'), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 768 x 52 | = | = |
| Padding | 0px 44px 0px 9px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.06 | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span.text-token-text-tertiary.min-w-0.overflow-hidden: -apple-system-body 16px/26px 400, #afafaf | span.text-token-text-tertiary.min-w-0.overflow-hidden: -apple-system-body 16px/26px 400, #ffffff | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #afafaf, fill #000000 | 20 x 20, colour #ffffff, fill #000000 | = |
| Tokens | --icon-tertiary #afafaf; --text-primary #fff; --text-tertiary #afafaf | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.group.relative.flex 768.0x52.0 bg #ffffff @ 0.06 r 8px | button.group.relative.flex 768.0x52.0 r 8px outline 1px auto #99c8ff offset 0px |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 768 x 52 | = | = |
| Padding | 0px 44px 0px 9px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #0d0d0d @ 0.03 | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Text node | span.text-token-text-tertiary.min-w-0.overflow-hidden: -apple-system-body 16px/26px 400, #8f8f8f | span.text-token-text-tertiary.min-w-0.overflow-hidden: -apple-system-body 16px/26px 400, #0d0d0d | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #8f8f8f, fill #000000 | 20 x 20, colour #0d0d0d, fill #000000 | = |
| Tokens | --icon-tertiary #8f8f8f; --text-primary #0d0d0d; --text-tertiary #8f8f8f | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.group.relative.flex 768.0x52.0 bg #0d0d0d @ 0.03 r 8px | button.group.relative.flex 768.0x52.0 r 8px outline 1px auto #005fcc offset 0px |

Crops: `suggestion-row-default.png`, `suggestion-row-hover.png`, `suggestion-row-focus-visible.png`, `suggestion-row-light.png`, `suggestion-row-light-hover.png`, `suggestion-row-light-focus-visible.png`.

### Composer

#### composer

Composer. A pill on the home page (radius 28, 768 wide, `--composer-bar_width`), one row: + button, the ProseMirror field, Think chip, dictation, voice. `--bg-primary` fill (#212121 dark) with a hairline shadow.

Page copy: `home-dark`, `home-dark-composer-typed`, `thread-dark-bottom`, `project-dark`, `images-dark`. Finder: `() => P(Q('#prompt-textarea'))`.

Dark theme.

| Property | default | focus-visible | typed | thread | project | images |
|---|---|---|---|---|---|---|
| Size (w x h) | 768 x 52 | = | = | = | = | = |
| Padding | 0px | = | = | = | = | = |
| Border | none | = | = | = | = | = |
| Radius | 28px | = | = | = | = | = |
| Background | #212121 | = | = | = | = | = |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset | = | = | = | = | = |
| Outline | none | = | = | = | = | = |
| Font | -apple-system-body 16px/24px 400 | = | = | = | = | = |
| Letter spacing | normal | = | = | = | = | = |
| Colour | #ffffff | = | = | = | = | = |
| Text node | span.max-w-40.truncate: -apple-system-body 16px/26px 400, #afafaf | = | p: -apple-system-body 16px/26px 400, #ffffff | span.max-w-40.truncate: -apple-system-body 16px/26px 400, #63a8f8 | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.2s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = | = | = |
| Cursor | text | = | = | = | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = | = | = | = |
| Placeholder | "Ask anything" #ffffff, opacity 1, 16px | = | - | = | "New chat in Research" #ffffff, opacity 1, 16px | "Describe a new image" #ffffff, opacity 1, 16px |
| Painted layers | div.bg-(--composer-surface-primary).grid.cursor-text 768.0x52.0 bg #212121 r 28px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset; button.composer-submit-button-color.text-submit-btn-text.relative 36.0x36.0 bg #2c67c5 r full | = | div.bg-(--composer-surface-primary).grid.cursor-text 768.0x52.0 bg #212121 r 28px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset; button.composer-submit-btn.composer-submit-button-color.h-9 36.0x36.0 bg #2c67c5 r full | div.bg-(--composer-surface-primary).grid.cursor-text 768.0x52.0 bg #212121 r 28px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset; button.__composer-pill.__composer-pill--neutral.text-body-regular! 92.0x36.0 bg #394a5b @ 0.5 r full; button.composer-submit-button-color.text-submit-btn-text.relative 36.0x36.0 bg #2c67c5 r full | = | = |
| Tokens | --composer-surface-primary #212121; --spacing .25rem; --text-primary #fff | = | = | = | = | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab (on the field inside) | at rest, captured typed | at rest, captured thread | at rest, captured project | at rest, captured images |

Light theme.

| Property | light | light-focus-visible | light-typed | light-thread | light-project | light-images |
|---|---|---|---|---|---|---|
| Size (w x h) | 768 x 52 | = | = | = | = | = |
| Padding | 0px | = | = | = | = | = |
| Border | none | = | = | = | = | = |
| Radius | 28px | = | = | = | = | = |
| Background | #ffffff | = | = | = | = | = |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px | = | = | = | = | = |
| Outline | none | = | = | = | = | = |
| Font | -apple-system-body 16px/24px 400 | = | = | = | = | = |
| Letter spacing | normal | = | = | = | = | = |
| Colour | #0d0d0d | = | = | = | = | = |
| Text node | span.max-w-40.truncate: -apple-system-body 16px/26px 400, #8f8f8f | = | p: -apple-system-body 16px/26px 400, #0d0d0d | span.max-w-40.truncate: -apple-system-body 16px/26px 400, #3a83f7 | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.2s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = | = | = |
| Cursor | text | = | = | = | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = | = | = | = |
| Placeholder | "Ask anything" #0d0d0d, opacity 1, 16px | = | - | = | "New chat in Research" #0d0d0d, opacity 1, 16px | "Describe a new image" #0d0d0d, opacity 1, 16px |
| Painted layers | div.bg-(--composer-surface-primary).grid.cursor-text 768.0x52.0 bg #ffffff r 28px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px; button.composer-submit-button-color.text-submit-btn-text.relative 36.0x36.0 bg #3a83f7 r full | = | div.bg-(--composer-surface-primary).grid.cursor-text 768.0x52.0 bg #ffffff r 28px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px; button.composer-submit-btn.composer-submit-button-color.h-9 36.0x36.0 bg #3a83f7 r full | div.bg-(--composer-surface-primary).grid.cursor-text 768.0x52.0 bg #ffffff r 28px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px; button.__composer-pill.__composer-pill--neutral.text-body-regular! 92.0x36.0 bg #ebf4ff @ 0.5 r full; button.composer-submit-button-color.text-submit-btn-text.relative 36.0x36.0 bg #3a83f7 r full | = | = |
| Tokens | --composer-surface-primary #fff; --spacing .25rem; --text-primary #0d0d0d | = | = | = | = | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab (on the field inside) | at rest, captured typed | at rest, captured thread | at rest, captured project | at rest, captured images |

Other finders: typed: `() => P(Q('#prompt-textarea'))`; light-typed: `() => P(Q('#prompt-textarea'))`; images: `() => P(Q('#prompt-textarea'))`; light-images: `() => P(Q('#prompt-textarea'))`; project: `() => P(Q('#prompt-textarea'))`; light-project: `() => P(Q('#prompt-textarea'))`; thread: `() => P(Q('#prompt-textarea'))`; light-thread: `() => P(Q('#prompt-textarea'))`.

Crops: `composer-default.png`, `composer-focus-visible.png`, `composer-typed.png`, `composer-thread.png`, `composer-project.png`, `composer-images.png`, `composer-light.png`, `composer-light-focus-visible.png`, `composer-light-typed.png`, `composer-light-thread.png`, `composer-light-project.png`, `composer-light-images.png`.

#### composer-placeholder

Composer placeholder. "Ask anything", drawn by `p[data-placeholder]::before`.

Page copy: `home-dark`. Finder: `() => Q('#prompt-textarea p')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 523.03 x 26 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/26px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| Cursor | text |
| Placeholder | "Ask anything" #ffffff, opacity 1, 16px |
| ::after | auto x auto, relative, bg #000000 @ 0, radius 0px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 523.03 x 26 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/26px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| Cursor | text |
| Placeholder | "Ask anything" #0d0d0d, opacity 1, 16px |
| ::after | auto x auto, relative, bg #000000 @ 0, radius 0px |
| How | at rest |

Crops: `composer-placeholder-default.png`, `composer-placeholder-light.png`.

#### composer-plus

Composer + button. 36x36 round `.composer-btn`.

Page copy: `home-dark`. Finder: `() => Q('#composer-plus-btn')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | full | = | = |
| Background | transparent | #ffffff @ 0.1 | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| ::before | 36px x 36px, absolute, bg #000000 @ 0, radius 0px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.composer-btn 36.0x36.0 bg #ffffff @ 0.1 r full | button.composer-btn 36.0x36.0 r full outline 1px auto #99c8ff offset 0px |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | full | = | = |
| Background | transparent | #000000 @ 0.05 | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = |
| ::before | 36px x 36px, absolute, bg #000000 @ 0, radius 0px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.composer-btn 36.0x36.0 bg #000000 @ 0.05 r full | button.composer-btn 36.0x36.0 r full outline 1px auto #005fcc offset 0px |

Crops: `composer-plus-default.png`, `composer-plus-hover.png`, `composer-plus-focus-visible.png`, `composer-plus-light.png`, `composer-plus-light-hover.png`, `composer-plus-light-focus-visible.png`.

#### think-chip

Think chip. `.__composer-pill--neutral`: 36 tall, full radius, brain icon and 16px label.

Page copy: `home-dark`, `thread-dark-bottom`. Finder: `() => Q('.__composer-pill')`.

Dark theme.

| Property | default | hover | focus-visible | thread |
|---|---|---|---|---|
| Size (w x h) | 91.97 x 36 | = | = | = |
| Padding | 0px 14px 0px 12px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | full | = | = | = |
| Background | transparent | #303030 | = | #394a5b @ 0.5 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system-body 16px/26px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #afafaf | = | = | #63a8f8 |
| Text node | span.max-w-40.truncate: -apple-system-body 16px/26px 400, #afafaf | = | = | span.max-w-40.truncate: -apple-system-body 16px/26px 400, #63a8f8 |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20 x 20, colour #afafaf | = | = | 20 x 20, colour #63a8f8 |
| ::before | 91.9688px x 36px, absolute, bg #000000 @ 0, radius 0px | = | = | = |
| ::after | 99.9688px x 36px, absolute, bg #000000 @ 0, radius 0px | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured thread |
| Painted layers | - | button.__composer-pill.__composer-pill--neutral.text-body-regular! 92.0x36.0 bg #303030 r full | = | button.__composer-pill.__composer-pill--neutral.text-body-regular! 92.0x36.0 bg #394a5b @ 0.5 r full |

Light theme.

| Property | light | light-hover | light-focus-visible | light-thread |
|---|---|---|---|---|
| Size (w x h) | 91.97 x 36 | = | = | = |
| Padding | 0px 14px 0px 12px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | full | = | = | = |
| Background | transparent | #000000 @ 0.05 | = | #ebf4ff @ 0.5 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system-body 16px/26px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #8f8f8f | = | = | #3a83f7 |
| Text node | span.max-w-40.truncate: -apple-system-body 16px/26px 400, #8f8f8f | = | = | span.max-w-40.truncate: -apple-system-body 16px/26px 400, #3a83f7 |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20 x 20, colour #8f8f8f | = | = | 20 x 20, colour #3a83f7 |
| ::before | 91.9688px x 36px, absolute, bg #000000 @ 0, radius 0px | = | = | = |
| ::after | 99.9688px x 36px, absolute, bg #000000 @ 0, radius 0px | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured thread |
| Painted layers | - | button.__composer-pill.__composer-pill--neutral.text-body-regular! 92.0x36.0 bg #000000 @ 0.05 r full | = | button.__composer-pill.__composer-pill--neutral.text-body-regular! 92.0x36.0 bg #ebf4ff @ 0.5 r full |

Other finders: thread: `() => Q('.__composer-pill')`; light-thread: `() => Q('.__composer-pill')`.

Crops: `think-chip-default.png`, `think-chip-hover.png`, `think-chip-focus-visible.png`, `think-chip-thread.png`, `think-chip-light.png`, `think-chip-light-hover.png`, `think-chip-light-focus-visible.png`, `think-chip-light-thread.png`.

#### dictation-button

Dictation button.

Page copy: `home-dark`. Finder: `() => Q('button[aria-label="Start dictation"]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | full | = |
| Background | transparent | #ffffff @ 0.1 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = |
| ::before | 36px x 36px, absolute, bg #000000 @ 0, radius 0px | = |
| ::after | 44px x 36px, absolute, bg #000000 @ 0, radius 0px | = |
| How | at rest | mouse hover |
| Painted layers | - | button.composer-btn.h-9.min-h-9 36.0x36.0 bg #ffffff @ 0.1 r full |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | full | = |
| Background | transparent | #000000 @ 0.05 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = |
| ::before | 36px x 36px, absolute, bg #000000 @ 0, radius 0px | = |
| ::after | 44px x 36px, absolute, bg #000000 @ 0, radius 0px | = |
| How | at rest | mouse hover |
| Painted layers | - | button.composer-btn.h-9.min-h-9 36.0x36.0 bg #000000 @ 0.05 r full |

Crops: `dictation-button-default.png`, `dictation-button-hover.png`, `dictation-button-light.png`, `dictation-button-light-hover.png`.

#### voice-button

Voice button. 36x36 circle in `--theme-submit-btn-bg`, the accent (blue-500 dark, blue-400 light).

Page copy: `home-dark`. Finder: `() => Q('button[aria-label="Start Voice"]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | full | = | = |
| Background | #2c67c5 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| ::after | 44px x 36px, absolute, bg #000000 @ 0, radius 0px | = | = |
| Painted layers | button.composer-submit-button-color.text-submit-btn-text.relative 36.0x36.0 bg #2c67c5 r full | button.composer-submit-button-color.text-submit-btn-text.relative 36.0x36.0 bg #2c67c5 r full opacity 0.7 | button.composer-submit-button-color.text-submit-btn-text.relative 36.0x36.0 bg #2c67c5 r full outline 1px auto #99c8ff offset 0px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.7 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | full | = | = |
| Background | #3a83f7 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| ::after | 44px x 36px, absolute, bg #000000 @ 0, radius 0px | = | = |
| Painted layers | button.composer-submit-button-color.text-submit-btn-text.relative 36.0x36.0 bg #3a83f7 r full | button.composer-submit-button-color.text-submit-btn-text.relative 36.0x36.0 bg #3a83f7 r full opacity 0.7 | button.composer-submit-button-color.text-submit-btn-text.relative 36.0x36.0 bg #3a83f7 r full outline 1px auto #005fcc offset 0px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Opacity | - | 0.7 | = |

Crops: `voice-button-default.png`, `voice-button-hover.png`, `voice-button-focus-visible.png`, `voice-button-light.png`, `voice-button-light-hover.png`, `voice-button-light-focus-visible.png`.

#### send-button

Send button (typed). Replaces the voice button once there is text: same circle and accent, an up arrow.

Page copy: `home-dark-composer-typed`. Finder: `() => Q('[data-testid=send-button]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | full | = | = |
| Background | #2c67c5 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| ::after | 44px x 36px, absolute, bg #000000 @ 0, radius 0px | = | = |
| Painted layers | button.composer-submit-btn.composer-submit-button-color.h-9 36.0x36.0 bg #2c67c5 r full | = | button.composer-submit-btn.composer-submit-button-color.h-9 36.0x36.0 bg #2c67c5 r full outline 1px auto #99c8ff offset 0px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | full | = | = |
| Background | #3a83f7 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| ::after | 44px x 36px, absolute, bg #000000 @ 0, radius 0px | = | = |
| Painted layers | button.composer-submit-btn.composer-submit-button-color.h-9 36.0x36.0 bg #3a83f7 r full | = | button.composer-submit-btn.composer-submit-button-color.h-9 36.0x36.0 bg #3a83f7 r full outline 1px auto #005fcc offset 0px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `send-button-default.png`, `send-button-hover.png`, `send-button-focus-visible.png`, `send-button-light.png`, `send-button-light-hover.png`, `send-button-light-focus-visible.png`.

### Thread

#### user-bubble

User message bubble. Right-aligned, max 70% (`--user-chat-width`), radius 22, padding 10/16, with `--theme-user-msg-bg` / `--theme-user-msg-text`: the blue accent paints it blue-700 on blue-25 dark, blue-50 on blue-900 light. `data-ds-colored-user-message-bubbles` on <html> switches the colouring on.

Page copy: `thread-dark-user-turn`. Finder: `() => P(TS('Compile these into'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 537.59 x 116 |
| Padding | 10px 16px |
| Border | none |
| Radius | 22px |
| Background | #173e76 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #f6fafe |
| Text node | div.max-w-full.min-w-0.whitespace-pre-wrap: -apple-system-body 16px/24px 400, #f6fafe |
| Transition | none |
| Painted layers | div.corner-superellipse/0.98.relative.min-w-0 537.6x116.0 bg #173e76 r 22px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 537.59 x 116 |
| Padding | 10px 16px |
| Border | none |
| Radius | 22px |
| Background | #e8f3fe |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0c274a |
| Text node | div.max-w-full.min-w-0.whitespace-pre-wrap: -apple-system-body 16px/24px 400, #0c274a |
| Transition | none |
| Painted layers | div.corner-superellipse/0.98.relative.min-w-0 537.6x116.0 bg #e8f3fe r 22px |
| How | at rest |

Crops: `user-bubble-default.png`, `user-bubble-light.png`.

#### markdown

Assistant markdown body. The `.markdown.prose` block, 768 wide, 16/28 body.

Page copy: `thread-dark-table`. Finder: `() => Q('.markdown')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 636 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/26px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | p: -apple-system-body 16px/26px 400, #ffffff |
| Transition | none |
| Icon | 20 x 20, colour #cdcdcd, fill #000000 |
| Painted layers | thead 835.0x33.0 border B:1px solid #4a5565; th 192.0x33.0 border B:1px solid #ffffff @ 0.15; th 130.3x33.0 border B:1px solid #ffffff @ 0.15; th 128.0x33.0 border B:1px solid #ffffff @ 0.15; th 128.0x33.0 border B:1px solid #ffffff @ 0.15; th 128.7x33.0 border B:1px solid #ffffff @ 0.15 |
| Tokens | --bg-tertiary #414141; --text-secondary #cdcdcd |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 636 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/26px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | p: -apple-system-body 16px/26px 400, #0d0d0d |
| Transition | none |
| Icon | 20 x 20, colour #5d5d5d, fill #000000 |
| Painted layers | thead 835.0x33.0 border B:1px solid #d1d5dc; th 192.0x33.0 border B:1px solid #000000 @ 0.15; th 130.3x33.0 border B:1px solid #000000 @ 0.15; th 128.0x33.0 border B:1px solid #000000 @ 0.15; th 128.0x33.0 border B:1px solid #000000 @ 0.15; th 128.7x33.0 border B:1px solid #000000 @ 0.15 |
| Tokens | --bg-tertiary #f3f3f3; --text-secondary #5d5d5d |
| How | at rest |

Crops: `markdown-default.png`, `markdown-light.png`.

#### md-paragraph

Markdown paragraph.

Page copy: `thread-dark-table`. Finder: `() => Q('.markdown p')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 26 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/26px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 26 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/26px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| How | at rest |

Crops: `md-paragraph-default.png`, `md-paragraph-light.png`.

#### md-h3

Markdown h3.

Page copy: `thread-dark-table`. Finder: `() => Q('.markdown h3')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 28 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 18px/28px 600 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 28 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 18px/28px 600 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| How | at rest |

Crops: `md-h3-default.png`, `md-h3-light.png`.

#### md-strong

Markdown strong.

Page copy: `thread-dark-table`. Finder: `() => Q('.markdown strong')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 338.39 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/26px 600 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 338.39 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/26px 600 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| How | at rest |

Crops: `md-strong-default.png`, `md-strong-light.png`.

#### md-table

Markdown table.

Page copy: `thread-dark-table`. Finder: `() => Q('.markdown table')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 835 x 184 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/24.0001px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | th: -apple-system-body 14px/16px 600, #ffffff |
| Transition | none |
| Painted layers | thead 835.0x33.0 border B:1px solid #4a5565; th 192.0x33.0 border B:1px solid #ffffff @ 0.15; th 130.3x33.0 border B:1px solid #ffffff @ 0.15; th 128.0x33.0 border B:1px solid #ffffff @ 0.15; th 128.0x33.0 border B:1px solid #ffffff @ 0.15; th 128.7x33.0 border B:1px solid #ffffff @ 0.15 |
| Tokens | --thread-content-width min(calc(100cqw - 2 * calc(.25rem * 16)), 48rem) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 835 x 184 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/24.0001px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | th: -apple-system-body 14px/16px 600, #0d0d0d |
| Transition | none |
| Painted layers | thead 835.0x33.0 border B:1px solid #d1d5dc; th 192.0x33.0 border B:1px solid #000000 @ 0.15; th 130.3x33.0 border B:1px solid #000000 @ 0.15; th 128.0x33.0 border B:1px solid #000000 @ 0.15; th 128.0x33.0 border B:1px solid #000000 @ 0.15; th 128.7x33.0 border B:1px solid #000000 @ 0.15 |
| Tokens | --thread-content-width min(calc(100cqw - 2 * calc(.25rem * 16)), 48rem) |
| How | at rest |

Crops: `md-table-default.png`, `md-table-light.png`.

#### md-th

Table header cell.

Page copy: `thread-dark-table`. Finder: `() => Q('.markdown th')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 192 x 33 |
| Padding | 8px 24px 8px 0px |
| Border | T: none; R: none; B: 1px solid #ffffff @ 0.15; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/16px 600 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| Painted layers | th 192.0x33.0 border B:1px solid #ffffff @ 0.15 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 192 x 33 |
| Padding | 8px 24px 8px 0px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0.15; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/16px 600 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| Painted layers | th 192.0x33.0 border B:1px solid #000000 @ 0.15 |
| How | at rest |

Crops: `md-th-default.png`, `md-th-light.png`.

#### md-td

Table cell.

Page copy: `thread-dark-table`. Finder: `() => Q('.markdown td')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 192 x 69 |
| Padding | 10px 24px 10px 0px |
| Border | T: none; R: none; B: 1px solid #ffffff @ 0.05; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/24.0001px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | strong: -apple-system-body 14px/24.0001px 600, #ffffff |
| Transition | none |
| Painted layers | td 192.0x69.0 border B:1px solid #ffffff @ 0.05 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 192 x 69 |
| Padding | 10px 24px 10px 0px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0.05; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/24.0001px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | strong: -apple-system-body 14px/24.0001px 600, #0d0d0d |
| Transition | none |
| Painted layers | td 192.0x69.0 border B:1px solid #000000 @ 0.05 |
| How | at rest |

Crops: `md-td-default.png`, `md-td-light.png`.

#### citation-pill

Citation pill. Inline source chip after a sentence: favicon, domain and a +n count.

Page copy: `thread-dark-table`. Finder: `() => Q('[data-testid=webpage-citation-pill]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 98.31 x 18 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/26px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Text node | span.grow.truncate.overflow-hidden: -apple-system-body 9px/26px 400, #cdcdcd | = |
| Transition | none | = |
| Painted layers | a.flex.overflow-hidden.rounded-xl 98.3x18.0 bg #303030 r 12px | = |
| Tokens | --text-secondary #cdcdcd | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 98.31 x 18 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/26px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Text node | span.grow.truncate.overflow-hidden: -apple-system-body 9px/26px 400, #5d5d5d | = |
| Transition | none | = |
| Painted layers | a.flex.overflow-hidden.rounded-xl 98.3x18.0 bg #f4f4f4 r 12px | = |
| Tokens | --text-secondary #5d5d5d | = |
| How | at rest | mouse hover |

Crops: `citation-pill-default.png`, `citation-pill-hover.png`, `citation-pill-light.png`, `citation-pill-light-hover.png`.

#### worked-for

"Worked for 22s" disclosure. The collapsed reasoning header above an answer, secondary text and a chevron.

Page copy: `thread-dark-user-turn`. Finder: `() => C(TS('Worked for'), 'button') // TS('Worked for')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 130.81 x 24 | = |
| Padding | 0px | = |
| Gap | 4px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #cdcdcd | #ffffff |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #cdcdcd, fill #000000 | 16 x 16, colour #ffffff, fill #000000 |
| Tokens | --interactive-label-tertiary-default #cdcdcd; --text-primary #fff; --text-tertiary #afafaf | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 130.81 x 24 | = |
| Padding | 0px | = |
| Gap | 4px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #8f8f8f | #0d0d0d |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #8f8f8f, fill #000000 | 16 x 16, colour #0d0d0d, fill #000000 |
| Tokens | --interactive-label-tertiary-default #5d5d5d; --text-primary #0d0d0d; --text-tertiary #8f8f8f | = |
| How | at rest | mouse hover |

Crops: `worked-for-default.png`, `worked-for-hover.png`, `worked-for-light.png`, `worked-for-light-hover.png`.

#### map-widget

Map widget (iframe, kept as a box). An iframe in the product; the copy keeps a same-size dark box. Its frame and radius are real, its contents are not.

Page copy: `thread-dark-user-turn`. Finder: `() => Q('[data-testid=businesses-map-widget]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 416 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/26px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| Painted layers | div 768.0x400.0 bg #262b3d @ 0.5 r 30px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 416 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/26px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| Painted layers | div 768.0x400.0 bg #f4f0ef @ 0.5 r 30px |
| How | at rest |

Crops: `map-widget-default.png`, `map-widget-light.png`.

#### turn-action

Turn action button (Copy). Copy, read aloud, share and more sit under an answer at opacity 0 and appear when the turn is hovered; measured while the turn is hovered.

Page copy: `thread-dark-bottom`. Finder: `() => document.querySelector('[data-testid=copy-turn-action-button]')`.

Dark theme.

| Property | hover |
|---|---|
| Size (w x h) | 32 x 32 |
| Padding | 0px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #cdcdcd |
| Transition | none |
| Cursor | pointer |
| Icon | 20 x 20, colour #cdcdcd, fill #000000 |
| Tokens | --surface-hover #ffffff26; --text-secondary #cdcdcd |
| How | mouse hover on its row |

Light theme.

| Property | light-hover |
|---|---|
| Size (w x h) | 32 x 32 |
| Padding | 0px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #5d5d5d |
| Transition | none |
| Cursor | pointer |
| Icon | 20 x 20, colour #5d5d5d, fill #000000 |
| Tokens | --surface-hover #00000012; --text-secondary #5d5d5d |
| How | mouse hover on its row |

Crops: `turn-action-hover.png`, `turn-action-light-hover.png`.

#### thread-disclaimer

Thread disclaimer.

Page copy: `thread-dark-bottom`. Finder: `() => Q('[data-testid=thread-disclaimer]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 1180 x 40 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div: -apple-system-body 12px/16px 400, #afafaf |
| Transition | none |
| Painted layers | div.select-none.pointer-events-auto.m-auto 290.3x16.0 bg #000000 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 0px 0px 8px 8px |
| Tokens | --main-surface-primary #000; --spacing .25rem; --text-tertiary #afafaf |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 1180 x 40 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div: -apple-system-body 12px/16px 400, #8f8f8f |
| Transition | none |
| Painted layers | div.select-none.pointer-events-auto.m-auto 290.3x16.0 bg #fcfcfc r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfc 0px 0px 8px 8px |
| Tokens | --main-surface-primary #fcfcfc; --spacing .25rem; --text-tertiary #8f8f8f |
| How | at rest |

Crops: `thread-disclaimer-default.png`, `thread-disclaimer-light.png`.

### Menus

#### plus-menu

Composer + menu. Opens below the composer at its full width: a row per action with a title and a grey hint, then the installed plugins, then "Type to search…".

Page copy: `home-dark-plus-menu`. Finder: `() => C(T('Add photos & files'), '.popover')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 376 |
| Padding | 8px 0px |
| Border | none |
| Radius | 20px |
| Background | #212121 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | span.max-w-full.min-w-0.shrink-0: -apple-system-body 14px/20px 400, #ffffff |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 60) |
| Icon | 20 x 20, colour #ffffff, fill #000000 |
| Painted layers | div.z-50.popover.bg-token-main-surface-primary 768.0x376.0 bg #212121 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset; div.group.__menu-item.gap-1.5 752.0x36.0 bg #ffffff @ 0.1 r 12px |
| Tokens | --bg-primary #212121; --main-surface-primary #2f2f2f; --menu-item-height calc(.25rem * 9); --radix-popper-available-height 434px; --radix-popper-available-width 768px; --text-primary #fff; --text-tertiary #afafaf |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 376 |
| Padding | 8px 0px |
| Border | none |
| Radius | 20px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | span.max-w-full.min-w-0.shrink-0: -apple-system-body 14px/20px 400, #0d0d0d |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 60) |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 |
| Painted layers | div.z-50.popover.bg-token-main-surface-primary 768.0x376.0 bg #ffffff r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px; div.group.__menu-item.gap-1.5 752.0x36.0 bg #000000 @ 0.04 r 12px |
| Tokens | --bg-primary #fff; --main-surface-primary #fff; --menu-item-height calc(.25rem * 9); --radix-popper-available-height 434px; --radix-popper-available-width 768px; --text-primary #0d0d0d; --text-tertiary #8f8f8f |
| How | at rest |

Crops: `plus-menu-default.png`, `plus-menu-light.png`.

#### plus-menu-item

+ menu item. 36 tall, radius 12, inset 8px; the first row opens highlighted with the `--interactive-bg-secondary-hover` fill.

Page copy: `home-dark-plus-menu`. Finder: `() => C(T('Add from library'), '.__menu-item')`.

Dark theme.

| Property | default | hover | highlighted |
|---|---|---|---|
| Size (w x h) | 752 x 36 | = | = |
| Padding | 6px 8px | = | = |
| Gap | 12px | = | = |
| Border | none | = | = |
| Radius | 12px | = | = |
| Background | transparent | = | #ffffff @ 0.1 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span.max-w-full.min-w-0.shrink-0: -apple-system-body 14px/20px 400, #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| Ancestor paint | 3 up div.z-50.popover.bg-token-main-surface-primary bg #212121 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset | = | = |
| Tokens | --menu-item-icon-opacity 1; --text-primary #fff; --text-tertiary #afafaf | = | = |
| How | at rest | mouse hover | at rest, captured highlighted |
| Painted layers | - | = | div.group.__menu-item.gap-1.5 752.0x36.0 bg #ffffff @ 0.1 r 12px |

Light theme.

| Property | light | light-hover | light-highlighted |
|---|---|---|---|
| Size (w x h) | 752 x 36 | = | = |
| Padding | 6px 8px | = | = |
| Gap | 12px | = | = |
| Border | none | = | = |
| Radius | 12px | = | = |
| Background | transparent | = | #000000 @ 0.04 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Text node | span.max-w-full.min-w-0.shrink-0: -apple-system-body 14px/20px 400, #0d0d0d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = |
| Ancestor paint | 3 up div.z-50.popover.bg-token-main-surface-primary bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px | = | = |
| Tokens | --menu-item-icon-opacity 1; --text-primary #0d0d0d; --text-tertiary #8f8f8f | = | = |
| How | at rest | mouse hover | at rest, captured highlighted |
| Painted layers | - | = | div.group.__menu-item.gap-1.5 752.0x36.0 bg #000000 @ 0.04 r 12px |

Other finders: highlighted: `() => C(T('Add photos & files'), '.__menu-item')`; light-highlighted: `() => C(T('Add photos & files'), '.__menu-item')`.

Crops: `plus-menu-item-default.png`, `plus-menu-item-hover.png`, `plus-menu-item-highlighted.png`, `plus-menu-item-light.png`, `plus-menu-item-light-hover.png`, `plus-menu-item-light-highlighted.png`.

#### chat-menu

Chat row menu. `.popover`, `--main-surface-primary` fill (#353535 in dark), radius 16; Share, Rename, Pin chat, Archive, Delete (danger), Move to project.

Page copy: `home-dark-chat-menu`. Finder: `() => Q('[role=menu]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 205.88 x 270 |
| Padding | 10px 0px |
| Border | none |
| Radius | 20px |
| Background | #353535 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div.group.__menu-item.gap-1.5: -apple-system-body 14px/20px 400, #ffffff |
| Transition | none |
| Icon | 20 x 20, colour #ffffff, fill #000000 |
| Painted layers | div.z-50.popover.bg-token-main-surface-primary 205.9x270.0 bg #353535 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset; div::before 173.875pxx1px bg #ffffff @ 0.15; div.bg-token-border-default.h-px.mx-4 173.9x1.0 bg #ffffff @ 0.15 |
| Tokens | --border-default #ffffff26; --main-surface-primary #2f2f2f; --radix-align-offset -14px; --radix-dropdown-menu-content-available-height 709.5px; --radix-dropdown-menu-content-available-width 1428px; --radix-dropdown-menu-content-transform-origin 0% 270px; --radix-dropdown-menu-trigger-height 36px; --radix-dropdown-menu-trigger-width 34px; --trigger-width calc(34px - 2 * -14px) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 205.88 x 270 |
| Padding | 10px 0px |
| Border | none |
| Radius | 20px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div.group.__menu-item.gap-1.5: -apple-system-body 14px/20px 400, #0d0d0d |
| Transition | none |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 |
| Painted layers | div.z-50.popover.bg-token-main-surface-primary 205.9x270.0 bg #ffffff r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px; div::before 173.875pxx1px bg #000000 @ 0.1; div.bg-token-border-default.h-px.mx-4 173.9x1.0 bg #000000 @ 0.1 |
| Tokens | --border-default #0000001a; --main-surface-primary #fff; --radix-align-offset -14px; --radix-dropdown-menu-content-available-height 709.5px; --radix-dropdown-menu-content-available-width 1428px; --radix-dropdown-menu-content-transform-origin 0% 270px; --radix-dropdown-menu-trigger-height 36px; --radix-dropdown-menu-trigger-width 34px; --trigger-width calc(34px - 2 * -14px) |
| How | at rest |

Crops: `chat-menu-default.png`, `chat-menu-light.png`.

#### menu-item

Menu item. `.__menu-item`, 36 tall, radius 10, icon and 14px label.

Page copy: `home-dark-chat-menu`. Finder: `() => Q('[role=menu] [role=menuitem]', 1)`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 185.88 x 36 | = |
| Padding | 6px 32px 6px 10px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = |
| Ancestor paint | 2 up div.z-50.popover.bg-token-main-surface-primary bg #353535 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset | = |
| Tokens | --menu-item-icon-opacity 1 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 185.88 x 36 | = |
| Padding | 6px 32px 6px 10px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = |
| Ancestor paint | 2 up div.z-50.popover.bg-token-main-surface-primary bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px | = |
| Tokens | --menu-item-icon-opacity 1 | = |
| How | at rest | mouse hover |

Crops: `menu-item-default.png`, `menu-item-hover.png`, `menu-item-light.png`, `menu-item-light-hover.png`.

#### menu-item-danger

Menu item (danger).

Page copy: `home-dark-chat-menu`. Finder: `() => Q('[data-testid=delete-chat-menu-item]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 185.88 x 36 | = |
| Padding | 6px 32px 6px 10px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #fa423e | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #fa423e, fill #000000 | = |
| Ancestor paint | 2 up div.z-50.popover.bg-token-main-surface-primary bg #353535 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset | = |
| Tokens | --menu-item-icon-opacity 1 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 185.88 x 36 | = |
| Padding | 6px 32px 6px 10px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #ff002a | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #ff002a, fill #000000 | = |
| Ancestor paint | 2 up div.z-50.popover.bg-token-main-surface-primary bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px | = |
| Tokens | --menu-item-icon-opacity 1 | = |
| How | at rest | mouse hover |

Crops: `menu-item-danger-default.png`, `menu-item-danger-hover.png`, `menu-item-danger-light.png`, `menu-item-danger-light-hover.png`.

#### menu-separator

Menu separator.

Page copy: `home-dark-chat-menu`. Finder: `() => Q('[role=menu] [role=separator]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 173.88 x 1 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #ffffff @ 0.15 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| Painted layers | div.bg-token-border-default.h-px.mx-4 173.9x1.0 bg #ffffff @ 0.15 |
| Ancestor paint | 2 up div.z-50.popover.bg-token-main-surface-primary bg #353535 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset |
| Tokens | --border-default #ffffff26 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 173.88 x 1 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #000000 @ 0.1 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| Painted layers | div.bg-token-border-default.h-px.mx-4 173.9x1.0 bg #000000 @ 0.1 |
| Ancestor paint | 2 up div.z-50.popover.bg-token-main-surface-primary bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px |
| Tokens | --border-default #0000001a |
| How | at rest |

Crops: `menu-separator-default.png`, `menu-separator-light.png`.

#### user-menu

User menu. Opens upward over the account row at its width: the account, Upgrade plan, Personalization, Profile, Settings, Help, Log out.

Page copy: `home-dark-user-menu`. Finder: `() => Q('[role=menu]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 248 x 321.14 |
| Padding | 10px 0px |
| Border | none |
| Radius | 20px |
| Background | #353535 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div.h-6.w-6.shrink-0: -apple-system-body 12px/17.1429px 600, #ffffff |
| Transition | none |
| Icon | 16 x 16, colour #ffffff, fill #000000 |
| Painted layers | div.z-50.popover.bg-token-main-surface-primary 248.0x321.1 bg #353535 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset; div.flex.overflow-hidden.select-none 24.0x24.0 bg #9b9b9b @ 0.3 r full; div.h-6.w-6.shrink-0 24.0x24.0 bg #8a8a8a r 9999px; div.bg-token-border-default.h-px.mx-4 216.0x1.0 bg #ffffff @ 0.15; div.bg-token-border-default.h-px.mx-4 216.0x1.0 bg #ffffff @ 0.15 |
| Tokens | --border-default #ffffff26; --interactive-bg-secondary-selected #ffffff1a; --main-surface-primary #2f2f2f; --radix-align-offset -6px; --radix-dropdown-menu-content-available-height 838px; --radix-dropdown-menu-content-available-width 1428px; --radix-dropdown-menu-content-transform-origin 0% 321.141px; --radix-dropdown-menu-trigger-height 40px; --radix-dropdown-menu-trigger-width 40px; --sidebar-width 260px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 248 x 321.14 |
| Padding | 10px 0px |
| Border | none |
| Radius | 20px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div.h-6.w-6.shrink-0: -apple-system-body 12px/17.1429px 600, #ffffff |
| Transition | none |
| Icon | 16 x 16, colour #0d0d0d, fill #000000 |
| Painted layers | div.z-50.popover.bg-token-main-surface-primary 248.0x321.1 bg #ffffff r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px; div.flex.overflow-hidden.select-none 24.0x24.0 bg #9b9b9b @ 0.3 r full; div.h-6.w-6.shrink-0 24.0x24.0 bg #8a8a8a r 9999px; div.bg-token-border-default.h-px.mx-4 216.0x1.0 bg #000000 @ 0.1; div.bg-token-border-default.h-px.mx-4 216.0x1.0 bg #000000 @ 0.1 |
| Tokens | --border-default #0000001a; --interactive-bg-secondary-selected #0000000d; --main-surface-primary #fff; --radix-align-offset -6px; --radix-dropdown-menu-content-available-height 838px; --radix-dropdown-menu-content-available-width 1428px; --radix-dropdown-menu-content-transform-origin 0% 321.141px; --radix-dropdown-menu-trigger-height 40px; --radix-dropdown-menu-trigger-width 40px; --sidebar-width 260px |
| How | at rest |

Crops: `user-menu-default.png`, `user-menu-light.png`.

#### accent-menu

Accent colour menu. Default, Blue, Green, Yellow, Pink, Orange, Purple, White (`data-chat-theme="black"`), each with a 10px dot.

Page copy: `settings-dark-accent-menu`. Finder: `() => C(T('Purple'), '[role=menu],[role=listbox]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 220 x 300 |
| Padding | 6px 0px |
| Border | none |
| Radius | 16px |
| Background | #353535 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 16px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset, #000000 @ 0.62 0px 0px 1px 0px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div.flex.items-center.gap-1.5: -apple-system-body 14px/20px 400, #ffffff |
| Transition | none |
| Icon | 16 x 16, colour #ffffff, fill #000000 |
| Painted layers | div.z-50.popover.bg-token-main-surface-primary 220.0x300.0 bg #353535 r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 16px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset, #000000 @ 0.62 0px 0px 1px 0px; div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #9b9b9b r full; div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #2c67c5 r full; div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #48a04c r full; div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #d9a337 r full; div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #f077af r full |
| Tokens | --main-surface-primary #2f2f2f; --radix-select-content-available-height 525.171875px; --radix-select-content-available-width 1420px; --radix-select-content-transform-origin 0% 0px; --radix-select-trigger-height 36px; --radix-select-trigger-width 94.3125px; --theme-submit-btn-bg #2c67c5 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 220 x 300 |
| Padding | 6px 0px |
| Border | none |
| Radius | 16px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.08 0px 8px 12px 0px, #000000 @ 0.62 0px 0px 1px 0px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div.flex.items-center.gap-1.5: -apple-system-body 14px/20px 400, #0d0d0d |
| Transition | none |
| Icon | 16 x 16, colour #0d0d0d, fill #000000 |
| Painted layers | div.z-50.popover.bg-token-main-surface-primary 220.0x300.0 bg #ffffff r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.08 0px 8px 12px 0px, #000000 @ 0.62 0px 0px 1px 0px; div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #b4b4b4 r full; div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #3a83f7 r full; div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #53b559 r full; div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #f6c543 r full; div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #f077af r full |
| Tokens | --main-surface-primary #fff; --radix-select-content-available-height 525.171875px; --radix-select-content-available-width 1420px; --radix-select-content-transform-origin 0% 0px; --radix-select-trigger-height 36px; --radix-select-trigger-width 94.3125px; --theme-submit-btn-bg #3a83f7 |
| How | at rest |

Crops: `accent-menu-default.png`, `accent-menu-light.png`.

#### accent-option

Accent option.

Page copy: `settings-dark-accent-menu`. Finder: `() => C(T('Green'), '[role=menuitemradio],[role=option],[role=menuitem]')`.

Dark theme.

| Property | default | hover | checked |
|---|---|---|---|
| Size (w x h) | 208 x 36 | = | = |
| Padding | 6px 32px 6px 10px | = | 6px 10px |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | div.flex.items-center.gap-1.5: -apple-system-body 14px/20px 400, #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #48a04c r full | = | div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #2c67c5 r full |
| Ancestor paint | 2 up div.z-50.popover.bg-token-main-surface-primary bg #353535 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 16px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset, #000000 @ 0.62 0px 0px 1px 0px | = | = |
| Tokens | --theme-submit-btn-bg #2c67c5 | = | = |
| How | at rest | mouse hover | at rest, captured checked |
| Gap | - | = | 24px |
| Icon | - | = | 16 x 16, colour #ffffff, fill #000000 |

Light theme.

| Property | light | light-hover | light-checked |
|---|---|---|---|
| Size (w x h) | 208 x 36 | = | = |
| Padding | 6px 32px 6px 10px | = | 6px 10px |
| Border | none | = | = |
| Radius | 10px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Text node | div.flex.items-center.gap-1.5: -apple-system-body 14px/20px 400, #0d0d0d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #53b559 r full | = | div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #3a83f7 r full |
| Ancestor paint | 2 up div.z-50.popover.bg-token-main-surface-primary bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.08 0px 8px 12px 0px, #000000 @ 0.62 0px 0px 1px 0px | = | = |
| Tokens | --theme-submit-btn-bg #3a83f7 | = | = |
| How | at rest | mouse hover | at rest, captured checked |
| Gap | - | = | 24px |
| Icon | - | = | 16 x 16, colour #0d0d0d, fill #000000 |

Other finders: checked: `() => C(T('Blue', C(T('Purple'), '[role=menu],[role=listbox]')), '[role=menuitemradio],[role=option],[role=menuitem]')`; light-checked: `() => C(T('Blue', C(T('Purple'), '[role=menu],[role=listbox]')), '[role=menuitemradio],[role=option],[role=menuitem]')`.

Crops: `accent-option-default.png`, `accent-option-hover.png`, `accent-option-checked.png`, `accent-option-light.png`, `accent-option-light-hover.png`, `accent-option-light-checked.png`.

#### model-menu

Model menu (phone). ChatGPT Plus with an Upgrade pill, and ChatGPT (checked).

Page copy: `mobile-thread-dark-model-menu`. Finder: `() => C(T('ChatGPT Plus'), '[role=menu]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 318.08 x 122.28 |
| Padding | 10px 0px |
| Border | none |
| Radius | 20px |
| Background | #353535 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | span.flex.items-center.gap-1: -apple-system-body 14px/20px 400, #ffffff |
| Transition | none |
| Icon | 20 x 20, colour #ffffff, fill #000000 |
| Painted layers | div.z-50.popover.bg-token-main-surface-primary 318.1x122.3 bg #353535 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset; button.btn.relative.btn-secondary 71.9x28.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full |
| Tokens | --main-surface-primary #2f2f2f; --radix-align-offset -4px; --radix-dropdown-menu-content-available-height 789px; --radix-dropdown-menu-content-available-width 378px; --radix-dropdown-menu-content-transform-origin 0% 0px; --radix-dropdown-menu-trigger-height 40px; --radix-dropdown-menu-trigger-width 115.2265625px; --text-primary #fff; --text-secondary #cdcdcd; --text-tertiary #afafaf |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 318.08 x 122.28 |
| Padding | 10px 0px |
| Border | none |
| Radius | 20px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | span.flex.items-center.gap-1: -apple-system-body 14px/20px 400, #0d0d0d |
| Transition | none |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 |
| Painted layers | div.z-50.popover.bg-token-main-surface-primary 318.1x122.3 bg #ffffff r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 80px 8px; button.btn.relative.btn-secondary 71.9x28.0 bg #ffffff border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full |
| Tokens | --main-surface-primary #fff; --radix-align-offset -4px; --radix-dropdown-menu-content-available-height 789px; --radix-dropdown-menu-content-available-width 378px; --radix-dropdown-menu-content-transform-origin 0% 0px; --radix-dropdown-menu-trigger-height 40px; --radix-dropdown-menu-trigger-width 115.2265625px; --text-primary #0d0d0d; --text-secondary #5d5d5d; --text-tertiary #8f8f8f |
| How | at rest |

Crops: `model-menu-default.png`, `model-menu-light.png`.

### Search

#### search-dialog

Search dialog. A centred 718 wide panel: the input row, then "Recent chats" rows.

Page copy: `home-dark-search`. Finder: `() => C(Q('#global-search-modal-input'), '.popover')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 720 x 462 |
| Padding | 0px |
| Border | 1px solid #ffffff @ 0.15 |
| Radius | 16px |
| Background | #212121 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.25 0px 14px 62px 0px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | h3.F_cuGW_zeroStateSectionTitle: -apple-system-body 14px/20px 400, #cdcdcd |
| Transition | none |
| Icon | 20 x 20, colour #ffffff, fill #000000 |
| Placeholder | "Search..." #afafaf, opacity 1, 16px |
| Painted layers | div.popover.F_cuGW_dialogPanel 720.0x462.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.25 0px 14px 62px 0px; div.F_cuGW_modalContent 718.0x460.0 bg #212121 r 16px; div.F_cuGW_modalHeader 718.0x64.0 border B:1px solid #000000 @ 0; button.interactive-button-secondary.F_cuGW_iconButton.F_cuGW_closeButton 36.0x36.0 r full outline 1px solid #000000 @ 0 offset 2px |
| Tokens | --spacing .25rem |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 720 x 462 |
| Padding | 0px |
| Border | 1px solid #000000 @ 0.1 |
| Radius | 16px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.25 0px 14px 62px 0px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | h3.F_cuGW_zeroStateSectionTitle: -apple-system-body 14px/20px 400, #5d5d5d |
| Transition | none |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 |
| Placeholder | "Search..." #8f8f8f, opacity 1, 16px |
| Painted layers | div.popover.F_cuGW_dialogPanel 720.0x462.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.25 0px 14px 62px 0px; div.F_cuGW_modalContent 718.0x460.0 bg #ffffff r 16px; div.F_cuGW_modalHeader 718.0x64.0 border B:1px solid #000000 @ 0; button.interactive-button-secondary.F_cuGW_iconButton.F_cuGW_closeButton 36.0x36.0 r full outline 1px solid #000000 @ 0 offset 2px |
| Tokens | --spacing .25rem |
| How | at rest |

Crops: `search-dialog-default.png`, `search-dialog-light.png`.

#### search-input

Search input.

Page copy: `home-dark-search`. Finder: `() => Q('#global-search-modal-input')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 642 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | -0.32px |
| Colour | #ffffff |
| Transition | none |
| Cursor | text |
| Placeholder | "Search..." #afafaf, opacity 1, 16px |
| Ancestor paint | 3 up div.popover.F_cuGW_dialogPanel bg #212121 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.25 0px 14px 62px 0px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 642 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | -0.32px |
| Colour | #0d0d0d |
| Transition | none |
| Cursor | text |
| Placeholder | "Search..." #8f8f8f, opacity 1, 16px |
| Ancestor paint | 3 up div.popover.F_cuGW_dialogPanel bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.25 0px 14px 62px 0px |
| How | at rest |

Crops: `search-input-default.png`, `search-input-light.png`.

#### search-section-title

Search section title.

Page copy: `home-dark-search`. Finder: `() => Q('[data-testid=modal-global-search] h3')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 718 x 36 |
| Padding | 8px 24px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #cdcdcd |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 718 x 36 |
| Padding | 8px 24px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #5d5d5d |
| Transition | none |
| How | at rest |

Crops: `search-section-title-default.png`, `search-section-title-light.png`.

#### search-result

Search result row.

Page copy: `home-dark-search`. Finder: `() => Q('[data-testid=modal-global-search] a', 1)`.

Dark theme.

| Property | default | hover | first |
|---|---|---|---|
| Size (w x h) | 694 x 48 | = | = |
| Padding | 8px 12px | = | = |
| Gap | 12px | = | = |
| Border | none | = | = |
| Radius | 12px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span: -apple-system-body 14px/20px 400, #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| How | at rest | mouse hover | at rest, captured first |

Light theme.

| Property | light | light-hover | light-first |
|---|---|---|---|
| Size (w x h) | 694 x 48 | = | = |
| Padding | 8px 12px | = | = |
| Gap | 12px | = | = |
| Border | none | = | = |
| Radius | 12px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Text node | span: -apple-system-body 14px/20px 400, #0d0d0d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = |
| How | at rest | mouse hover | at rest, captured first |

Other finders: first: `() => Q('[data-testid=modal-global-search] a', 0)`; light-first: `() => Q('[data-testid=modal-global-search] a', 0)`.

Crops: `search-result-default.png`, `search-result-hover.png`, `search-result-first.png`, `search-result-light.png`, `search-result-light-hover.png`, `search-result-light-first.png`.

### Settings

#### settings-dialog

Settings dialog. Centred, radius 16 (`--radius-2xl`), `--bg-elevated-primary` fill: a left nav column and the pane.

Page copy: `settings-dark-general`. Finder: `() => C(T('Appearance'), '[role=dialog]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 680 x 600 |
| Padding | 0px |
| Border | none |
| Radius | 16px |
| Background | #212121 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 16px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset, #000000 @ 0.62 0px 0px 1px 0px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div.truncate: -apple-system-body 14px/20px 400, #ffffff |
| Transition | none |
| Icon | 20 x 20, colour #ffffff, fill #000000 |
| Placeholder | "Search settings" #afafaf, opacity 1, 14px |
| Painted layers | div.popover.bg-token-bg-primary.relative 680.0x600.0 bg #212121 r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 16px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset, #000000 @ 0.62 0px 0px 1px 0px; header.min-h-header-height.flex.justify-between 26.0x52.0 border B:1px solid #ffffff @ 0.05; div.border-token-border-extra-light.flex.shrink-0 210.0x600.0 border R:1px solid #ffffff @ 0.1; button.flex.h-9.w-9 36.0x36.0 bg #303030 r 8px; input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 189.0x36.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full; button.group.__menu-item.hoverable 197.0x36.0 bg #303030 r 10px |
| Tokens | --bg-primary #212121; --bg-secondary #303030; --border-default #ffffff26; --border-extra-light #ffffff1a; --border-heavy #fff3; --border-light #ffffff0d; --end right; --icon-tertiary #afafaf; --main-surface-tertiary #676767; --surface-hover #ffffff26 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 680 x 600 |
| Padding | 0px |
| Border | none |
| Radius | 16px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.08 0px 8px 12px 0px, #000000 @ 0.62 0px 0px 1px 0px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div.truncate: -apple-system-body 14px/20px 400, #0d0d0d |
| Transition | none |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 |
| Placeholder | "Search settings" #8f8f8f, opacity 1, 14px |
| Painted layers | div.popover.bg-token-bg-primary.relative 680.0x600.0 bg #ffffff r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.08 0px 8px 12px 0px, #000000 @ 0.62 0px 0px 1px 0px; header.min-h-header-height.flex.justify-between 26.0x52.0 border B:1px solid #000000 @ 0.05; div.border-token-border-extra-light.flex.shrink-0 210.0x600.0 border R:1px solid #000000 @ 0.05; input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 189.0x36.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r full; button.group.__menu-item.hoverable 197.0x36.0 bg #000000 @ 0.04 r 10px; div.bg-token-bg-primary.text-token-text-primary.relative 470.0x600.0 bg #ffffff |
| Tokens | --bg-primary #fff; --bg-secondary #e8e8e8; --border-default #0000001a; --border-extra-light #0000000d; --border-heavy #00000026; --border-light #0000000d; --end right; --icon-tertiary #8f8f8f; --main-surface-tertiary #e3e3e3; --surface-hover #00000012 |
| How | at rest |

Crops: `settings-dialog-default.png`, `settings-dialog-light.png`.

#### settings-close

Settings close button.

Page copy: `settings-dark-general`. Finder: `() => C(Q('[data-testid=modal-settings] [data-testid=close-button]'), 'button') // Q('[data-testid=modal-settings] [data-testid=close-button]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | #303030 | #676767 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = |
| Painted layers | button.flex.h-9.w-9 36.0x36.0 bg #303030 r 8px | button.flex.h-9.w-9 36.0x36.0 bg #676767 r 8px |
| Tokens | --bg-secondary #303030; --main-surface-tertiary #676767; --surface-hover #ffffff26 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 36 x 36 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | #000000 @ 0.07 |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = |
| Tokens | --bg-secondary #e8e8e8; --main-surface-tertiary #e3e3e3; --surface-hover #00000012 | = |
| How | at rest | mouse hover |
| Painted layers | - | button.flex.h-9.w-9 36.0x36.0 bg #000000 @ 0.07 r 8px |

Crops: `settings-close-default.png`, `settings-close-hover.png`, `settings-close-light.png`, `settings-close-light-hover.png`.

#### settings-search

Settings search field.

Page copy: `settings-dark-general`. Finder: `() => P(Q('[data-testid=modal-settings] input'))`.

Dark theme.

| Property | default | focus-visible |
|---|---|---|
| Size (w x h) | 189 x 36 | = |
| Padding | 8px 12px 8px 36px | = |
| Border | 1px solid #ffffff @ 0.15 | 1px solid #ffffff @ 0.2 |
| Radius | full | = |
| Background | #212121 | = |
| Box shadow | none | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Transition | none | = |
| Cursor | text | = |
| Placeholder | "Search settings" #afafaf, opacity 1, 14px | = |
| Painted layers | input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 189.0x36.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full | input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 189.0x36.0 bg #212121 border T:1px solid #ffffff @ 0.2 / R:1px solid #ffffff @ 0.2 / B:1px solid #ffffff @ 0.2 / L:1px solid #ffffff @ 0.2 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Tokens | --bg-primary #212121; --border-default #ffffff26; --border-heavy #fff3; --text-primary #fff; --text-tertiary #afafaf | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-focus-visible |
|---|---|---|
| Size (w x h) | 189 x 36 | = |
| Padding | 8px 12px 8px 36px | = |
| Border | 1px solid #000000 @ 0.1 | 1px solid #000000 @ 0.15 |
| Radius | full | = |
| Background | #ffffff | = |
| Box shadow | none | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Transition | none | = |
| Cursor | text | = |
| Placeholder | "Search settings" #8f8f8f, opacity 1, 14px | = |
| Painted layers | input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 189.0x36.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r full | input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 189.0x36.0 bg #ffffff border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Tokens | --bg-primary #fff; --border-default #0000001a; --border-heavy #00000026; --text-primary #0d0d0d; --text-tertiary #8f8f8f | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab |

Crops: `settings-search-default.png`, `settings-search-focus-visible.png`, `settings-search-light.png`, `settings-search-light-focus-visible.png`.

#### settings-tab

Settings nav tab.

Page copy: `settings-dark-general`. Finder: `() => Q('[data-testid=notifications-tab]') // C(T('Notifications', D()), '[role=tab],button')`.

Dark theme.

| Property | default | hover | focus-visible | selected |
|---|---|---|---|---|
| Size (w x h) | 197 x 36 | = | = | = |
| Padding | 6px 10px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | 10px | = | = | = |
| Background | transparent | #ffffff @ 0.1 | #ffffff @ 0.1 | #303030 |
| Box shadow | none | = | = | = |
| Outline | none | = | 1px solid #ffffff offset 2px | = |
| Font | -apple-system-body 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Text node | div.truncate: -apple-system-body 14px/20px 400, #ffffff | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = | = |
| Tokens | --bg-secondary #303030; --menu-item-icon-opacity 1 | = | = | = |
| How | at rest | mouse hover | keyboard: Shift keydown, then focus() | at rest, captured selected |
| Painted layers | - | button.group.__menu-item.hoverable 197.0x36.0 bg #ffffff @ 0.1 r 10px | button.group.__menu-item.hoverable 197.0x36.0 bg #ffffff @ 0.1 r 10px outline 1px solid #ffffff offset 2px | button.group.__menu-item.hoverable 197.0x36.0 bg #303030 r 10px |

Light theme.

| Property | light | light-hover | light-focus-visible | light-selected |
|---|---|---|---|---|
| Size (w x h) | 197 x 36 | = | = | = |
| Padding | 6px 10px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | 10px | = | = | = |
| Background | transparent | #000000 @ 0.04 | #000000 @ 0.04 | #000000 @ 0.04 |
| Box shadow | none | = | = | = |
| Outline | none | = | 1px solid #0d0d0d offset 2px | = |
| Font | -apple-system-body 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #0d0d0d | = | = | = |
| Text node | div.truncate: -apple-system-body 14px/20px 400, #0d0d0d | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = | = |
| Tokens | --bg-secondary #e8e8e8; --menu-item-icon-opacity 1 | = | = | = |
| How | at rest | mouse hover | keyboard: Shift keydown, then focus() | at rest, captured selected |
| Painted layers | - | button.group.__menu-item.hoverable 197.0x36.0 bg #000000 @ 0.04 r 10px | button.group.__menu-item.hoverable 197.0x36.0 bg #000000 @ 0.04 r 10px outline 1px solid #0d0d0d offset 2px | button.group.__menu-item.hoverable 197.0x36.0 bg #000000 @ 0.04 r 10px |

Other finders: selected: `() => C(T('General', Q('[data-testid=modal-settings] [role=tablist]')), '[role=tab],button')`; light-selected: `() => C(T('General', Q('[data-testid=modal-settings] [role=tablist]')), '[role=tab],button')`.

Crops: `settings-tab-default.png`, `settings-tab-hover.png`, `settings-tab-focus-visible.png`, `settings-tab-selected.png`, `settings-tab-light.png`, `settings-tab-light-hover.png`, `settings-tab-light-focus-visible.png`, `settings-tab-light-selected.png`.

#### settings-pane-title

Settings pane title.

Page copy: `settings-dark-general`. Finder: `() => [...document.querySelectorAll('[data-testid=modal-settings] h3, [data-testid=modal-settings] h2')].find((e) => e.innerText.trim() === 'General')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 62.44 x 28 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 18px/28px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div.truncate.select-none: -apple-system-body 18px/28px 400, #ffffff |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 62.44 x 28 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 18px/28px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div.truncate.select-none: -apple-system-body 18px/28px 400, #0d0d0d |
| Transition | none |
| How | at rest |

Crops: `settings-pane-title-default.png`, `settings-pane-title-light.png`.

#### settings-row

Settings row (Appearance). A label at the start and a control at the end, divided by a hairline.

Page copy: `settings-dark-general`. Finder: `() => CK(T('Appearance'), 'min-h-15')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 438 x 60 |
| Padding | 8px 0px |
| Border | T: none; R: none; B: 1px solid #ffffff @ 0.05; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div: -apple-system-body 14px/20px 400, #ffffff |
| Transition | none |
| Icon | 16 x 16, colour #ffffff, fill #000000 |
| Painted layers | div.border-token-border-light.flex.min-h-15 438.0x60.0 border B:1px solid #ffffff @ 0.05; button.text-token-text-primary.border.border-transparent 93.8x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px |
| Tokens | --border-light #ffffff0d; --main-surface-secondary #424242; --text-primary #fff; --text-secondary #cdcdcd; --text-tertiary #afafaf |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 438 x 60 |
| Padding | 8px 0px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0.05; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div: -apple-system-body 14px/20px 400, #0d0d0d |
| Transition | none |
| Icon | 16 x 16, colour #0d0d0d, fill #000000 |
| Painted layers | div.border-token-border-light.flex.min-h-15 438.0x60.0 border B:1px solid #000000 @ 0.05; button.text-token-text-primary.border.border-transparent 93.8x36.0 bg #ffffff border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px |
| Tokens | --border-light #0000000d; --main-surface-secondary #ececec; --text-primary #0d0d0d; --text-secondary #5d5d5d; --text-tertiary #8f8f8f |
| How | at rest |

Crops: `settings-row-default.png`, `settings-row-light.png`.

#### settings-select

Settings select button.

Page copy: `settings-dark-general`, `settings-dark-accent-menu`. Finder: `() => C(T('System', CK(T('Appearance'), 'min-h-15')), 'button')`.

Dark theme.

| Property | default | hover | focus-visible | open |
|---|---|---|---|---|
| Size (w x h) | 93.84 x 36 | = | = | 94.31 x 36 |
| Padding | 0px 12px | = | = | = |
| Gap | 4px | = | = | = |
| Border | 1px solid #000000 @ 0 | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #424242 | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system-body 14px/14px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Text node | span: -apple-system-body 14px/14px 400, #ffffff | = | = | div.flex.items-center.gap-1.5: -apple-system-body 14px/14px 400, #ffffff |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 16 x 16, colour #ffffff, fill #000000 | = | = | = |
| Painted layers | button.text-token-text-primary.border.border-transparent 93.8x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px | button.text-token-text-primary.border.border-transparent 93.8x36.0 bg #424242 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px | = | button.text-token-text-primary.border.border-transparent 94.3x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px; div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #2c67c5 r full |
| Tokens | --main-surface-secondary #424242; --text-primary #fff; --text-secondary #cdcdcd; --text-tertiary #afafaf | = | = | --main-surface-secondary #424242; --text-primary #fff; --text-secondary #cdcdcd; --text-tertiary #afafaf; --theme-submit-btn-bg #2c67c5 |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |

Light theme.

| Property | light | light-hover | light-focus-visible | light-open |
|---|---|---|---|---|
| Size (w x h) | 93.84 x 36 | = | = | 94.31 x 36 |
| Padding | 0px 12px | = | = | = |
| Gap | 4px | = | = | = |
| Border | 1px solid #000000 @ 0 | = | = | = |
| Radius | 8px | = | = | = |
| Background | #ffffff | #ececec | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | -apple-system-body 14px/14px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #0d0d0d | = | = | = |
| Text node | span: -apple-system-body 14px/14px 400, #0d0d0d | = | = | div.flex.items-center.gap-1.5: -apple-system-body 14px/14px 400, #0d0d0d |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 16 x 16, colour #0d0d0d, fill #000000 | = | = | = |
| Painted layers | button.text-token-text-primary.border.border-transparent 93.8x36.0 bg #ffffff border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px | button.text-token-text-primary.border.border-transparent 93.8x36.0 bg #ececec border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px | = | button.text-token-text-primary.border.border-transparent 94.3x36.0 bg #ffffff border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px; div.h-2.5.w-2.5.rounded-full 10.0x10.0 bg #3a83f7 r full |
| Tokens | --main-surface-secondary #ececec; --text-primary #0d0d0d; --text-secondary #5d5d5d; --text-tertiary #8f8f8f | = | = | --main-surface-secondary #ececec; --text-primary #0d0d0d; --text-secondary #5d5d5d; --text-tertiary #8f8f8f; --theme-submit-btn-bg #3a83f7 |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |

Other finders: open: `() => C(T('Blue', CK(T('Accent color'), 'min-h-15')), 'button')`; light-open: `() => C(T('Blue', CK(T('Accent color'), 'min-h-15')), 'button')`.

Crops: `settings-select-default.png`, `settings-select-hover.png`, `settings-select-focus-visible.png`, `settings-select-open.png`, `settings-select-light.png`, `settings-select-light-hover.png`, `settings-select-light-focus-visible.png`, `settings-select-light-open.png`.

#### settings-toggle

Settings toggle (on). Accent-filled track when on, white thumb.

Page copy: `settings-dark-general`. Finder: `() => Q('[data-testid=modal-settings] [role=switch]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 20 | = | = |
| Padding | 2px | = | = |
| Border | none | = | = |
| Radius | full | = | = |
| Background | #3a83f7 | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 2px, #ffffff 0px 0px 0px 4px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.interactive-bg-control.relative.box-content 32.0x20.0 bg #3a83f7 r full; span.flex.aspect-square.h-full 16.0x16.0 bg #ffffff r full | = | button.interactive-bg-control.relative.box-content 32.0x20.0 bg #3a83f7 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 2px, #ffffff 0px 0px 0px 4px, #000000 @ 0 0px 0px 0px 0px; span.flex.aspect-square.h-full 16.0x16.0 bg #ffffff r full |
| Tokens | --text-primary #fff; --to-end-unit 1 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 20 | = | = |
| Padding | 2px | = | = |
| Border | none | = | = |
| Radius | full | = | = |
| Background | #3a83f7 | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 2px, #0d0d0d 0px 0px 0px 4px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.interactive-bg-control.relative.box-content 32.0x20.0 bg #3a83f7 r full; span.flex.aspect-square.h-full 16.0x16.0 bg #ffffff r full | = | button.interactive-bg-control.relative.box-content 32.0x20.0 bg #3a83f7 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 2px, #0d0d0d 0px 0px 0px 4px, #000000 @ 0 0px 0px 0px 0px; span.flex.aspect-square.h-full 16.0x16.0 bg #ffffff r full |
| Tokens | --text-primary #0d0d0d; --to-end-unit 1 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `settings-toggle-default.png`, `settings-toggle-hover.png`, `settings-toggle-focus-visible.png`, `settings-toggle-light.png`, `settings-toggle-light-hover.png`, `settings-toggle-light-focus-visible.png`.

#### settings-description

Settings row description.

Page copy: `settings-dark-general`. Finder: `() => T('Use dictation in the chat composer.')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 398 x 16 |
| Padding | 0px 48px 0px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 12px/16px 400 |
| Letter spacing | normal |
| Colour | #afafaf |
| Transition | none |
| Tokens | --text-tertiary #afafaf |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 398 x 16 |
| Padding | 0px 48px 0px 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 12px/16px 400 |
| Letter spacing | normal |
| Colour | #8f8f8f |
| Transition | none |
| Tokens | --text-tertiary #8f8f8f |
| How | at rest |

Crops: `settings-description-default.png`, `settings-description-light.png`.

### Library

#### library-title

Library page title.

Page copy: `library-dark`. Finder: `() => T('Library', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 74.11 x 36 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 24px/28px 500 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | span.-my-1.block.min-w-0: -apple-system-body 24px/28px 500, #ffffff |
| Transition | none |
| Tokens | --text-primary #fff |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 74.11 x 36 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 24px/28px 500 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | span.-my-1.block.min-w-0: -apple-system-body 24px/28px 500, #0d0d0d |
| Transition | none |
| Tokens | --text-primary #0d0d0d |
| How | at rest |

Crops: `library-title-default.png`, `library-title-light.png`.

#### library-tab

Library tab. Pill tabs; the selected one is filled with `--bg-secondary`.

Page copy: `library-dark`. Finder: `() => C(T('Favorites', M()), 'button,[role=tab],a')`.

Dark theme.

| Property | default | hover | focus-visible | selected |
|---|---|---|---|---|
| Size (w x h) | 94.03 x 36 | = | = | 105.28 x 36 |
| Padding | 0px 16px | = | = | = |
| Border | 1px solid #000000 @ 0 | = | = | = |
| Radius | full | = | = | = |
| Background | transparent | = | = | #414141 |
| Box shadow | none | = | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px | = |
| Font | -apple-system-body 14px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #cdcdcd | #ffffff | = | #ffffff |
| Text node | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #cdcdcd | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #ffffff | = | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #ffffff |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button.btn.relative.btn-ghost 94.0x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full | = | button.btn.relative.btn-ghost 94.0x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full outline 1px auto #99c8ff offset 0px | button.btn.relative.btn-primary-inverse 105.3x36.0 bg #414141 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full |
| Tokens | --text-primary #fff; --text-secondary #cdcdcd | = | = | --bg-tertiary #414141; --border-heavy #fff3; --text-primary #fff |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured selected |

Light theme.

| Property | light | light-hover | light-focus-visible | light-selected |
|---|---|---|---|---|
| Size (w x h) | 94.03 x 36 | = | = | 105.28 x 36 |
| Padding | 0px 16px | = | = | = |
| Border | 1px solid #000000 @ 0 | = | = | = |
| Radius | full | = | = | = |
| Background | transparent | = | = | #f3f3f3 |
| Box shadow | none | = | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px | = |
| Font | -apple-system-body 14px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #5d5d5d | #0d0d0d | = | #0d0d0d |
| Text node | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #5d5d5d | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #0d0d0d | = | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #0d0d0d |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button.btn.relative.btn-ghost 94.0x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full | = | button.btn.relative.btn-ghost 94.0x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full outline 1px auto #005fcc offset 0px | button.btn.relative.btn-primary-inverse 105.3x36.0 bg #f3f3f3 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full |
| Tokens | --text-primary #0d0d0d; --text-secondary #5d5d5d | = | = | --bg-tertiary #f3f3f3; --border-heavy #00000026; --text-primary #0d0d0d |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured selected |

Other finders: selected: `() => C(T('Suggested', M()), 'button,[role=tab],a')`; light-selected: `() => C(T('Suggested', M()), 'button,[role=tab],a')`.

Crops: `library-tab-default.png`, `library-tab-hover.png`, `library-tab-focus-visible.png`, `library-tab-selected.png`, `library-tab-light.png`, `library-tab-light-hover.png`, `library-tab-light-focus-visible.png`, `library-tab-light-selected.png`.

#### library-icon-button

Library toolbar icon button (grid view). 36x36, radius full; the current view (List) is filled with `--bg-secondary`.

Page copy: `library-dark`. Finder: `() => Q('button[aria-label="Grid view"]', 0, M())`.

Dark theme.

| Property | default | hover | focus-visible | selected |
|---|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = | = |
| Padding | 0px | = | = | = |
| Border | none | = | = | = |
| Radius | full | = | = | = |
| Background | transparent | #ffffff @ 0.1 | = | #414141 |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #afafaf 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px | = |
| Outline | none | = | = | = |
| Font | -apple-system-body 14px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #afafaf | = | = | #ffffff |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20 x 20, colour #afafaf, fill #000000 | = | = | 20 x 20, colour #ffffff, fill #000000 |
| Tokens | --icon-tertiary #afafaf; --text-primary #fff | = | = | --bg-tertiary #414141; --text-primary #fff |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured selected |
| Painted layers | - | button.btn.relative.btn-ghost 36.0x36.0 bg #ffffff @ 0.1 r full | button.btn.relative.btn-ghost 36.0x36.0 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #afafaf 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px | button.btn.relative.btn-ghost 36.0x36.0 bg #414141 r full |

Light theme.

| Property | light | light-hover | light-focus-visible | light-selected |
|---|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = | = |
| Padding | 0px | = | = | = |
| Border | none | = | = | = |
| Radius | full | = | = | = |
| Background | transparent | #000000 @ 0.05 | = | #f3f3f3 |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #8f8f8f 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px | = |
| Outline | none | = | = | = |
| Font | -apple-system-body 14px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #8f8f8f | = | = | #0d0d0d |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Icon | 20 x 20, colour #8f8f8f, fill #000000 | = | = | 20 x 20, colour #0d0d0d, fill #000000 |
| Tokens | --icon-tertiary #8f8f8f; --text-primary #0d0d0d | = | = | --bg-tertiary #f3f3f3; --text-primary #0d0d0d |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured selected |
| Painted layers | - | button.btn.relative.btn-ghost 36.0x36.0 bg #000000 @ 0.05 r full | button.btn.relative.btn-ghost 36.0x36.0 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #8f8f8f 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px | button.btn.relative.btn-ghost 36.0x36.0 bg #f3f3f3 r full |

Other finders: selected: `() => Q('button[aria-label="List view"]', 0, M())`; light-selected: `() => Q('button[aria-label="List view"]', 0, M())`.

Crops: `library-icon-button-default.png`, `library-icon-button-hover.png`, `library-icon-button-focus-visible.png`, `library-icon-button-selected.png`, `library-icon-button-light.png`, `library-icon-button-light-hover.png`, `library-icon-button-light-focus-visible.png`, `library-icon-button-light-selected.png`.

#### library-search

Library search field.

Page copy: `library-dark`. Finder: `() => P(Q('input[placeholder="Search library"]'))`.

Dark theme.

| Property | default | focus-visible |
|---|---|---|
| Size (w x h) | 240 x 36 | = |
| Padding | 8px 12px 8px 36px | = |
| Border | 1px solid #ffffff @ 0.15 | 1px solid #ffffff @ 0.2 |
| Radius | full | = |
| Background | #212121 | = |
| Box shadow | none | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Transition | none | = |
| Cursor | text | = |
| Placeholder | "Search library" #afafaf, opacity 1, 14px | = |
| Painted layers | input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 240.0x36.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full | input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 240.0x36.0 bg #212121 border T:1px solid #ffffff @ 0.2 / R:1px solid #ffffff @ 0.2 / B:1px solid #ffffff @ 0.2 / L:1px solid #ffffff @ 0.2 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Tokens | --bg-primary #212121; --border-default #ffffff26; --border-heavy #fff3; --text-primary #fff; --text-tertiary #afafaf | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-focus-visible |
|---|---|---|
| Size (w x h) | 240 x 36 | = |
| Padding | 8px 12px 8px 36px | = |
| Border | 1px solid #000000 @ 0.1 | 1px solid #000000 @ 0.15 |
| Radius | full | = |
| Background | #ffffff | = |
| Box shadow | none | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Transition | none | = |
| Cursor | text | = |
| Placeholder | "Search library" #8f8f8f, opacity 1, 14px | = |
| Painted layers | input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 240.0x36.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r full | input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 240.0x36.0 bg #ffffff border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Tokens | --bg-primary #fff; --border-default #0000001a; --border-heavy #00000026; --text-primary #0d0d0d; --text-tertiary #8f8f8f | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab |

Crops: `library-search-default.png`, `library-search-focus-visible.png`, `library-search-light.png`, `library-search-light-focus-visible.png`.

#### library-new

New button (Library). The one inverted control on the page: `--interactive-bg-primary-default` (white in dark) with a chevron.

Page copy: `library-dark`. Finder: `() => C(T('New', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 77.34 x 36 | = | = |
| Padding | 0px 12px | = | = |
| Border | 1px solid #000000 @ 0 | = | = |
| Radius | full | = | = |
| Background | #f9f9f9 | #ececec | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px |
| Font | -apple-system-body 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Text node | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #0d0d0d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #0d0d0d, fill #000000 | = | = |
| Painted layers | button.btn.relative.btn-primary 77.3x36.0 bg #f9f9f9 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full | button.btn.relative.btn-primary 77.3x36.0 bg #ececec border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full | button.btn.relative.btn-primary 77.3x36.0 bg #f9f9f9 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full outline 1px auto #99c8ff offset 0px |
| Tokens | --text-primary #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 77.34 x 36 | = | = |
| Padding | 0px 12px | = | = |
| Border | 1px solid #000000 @ 0 | = | = |
| Radius | full | = | = |
| Background | #0d0d0d | #212121 | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px |
| Font | -apple-system-body 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 16 x 16, colour #ffffff, fill #000000 | = | = |
| Painted layers | button.btn.relative.btn-primary 77.3x36.0 bg #0d0d0d border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full | button.btn.relative.btn-primary 77.3x36.0 bg #212121 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full | button.btn.relative.btn-primary 77.3x36.0 bg #0d0d0d border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full outline 1px auto #005fcc offset 0px |
| Tokens | --text-primary #0d0d0d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `library-new-default.png`, `library-new-hover.png`, `library-new-focus-visible.png`, `library-new-light.png`, `library-new-light-hover.png`, `library-new-light-focus-visible.png`.

#### library-list-header

Library list header.

Page copy: `library-dark`. Finder: `() => Q('[data-testid=artifacts-surface-library-list-header]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 1078 x 42 |
| Padding | 12px 8px 12px 0px |
| Gap | 16px |
| Border | T: none; R: none; B: 1px solid #ffffff @ 0.05; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 13px/20px 400 |
| Letter spacing | normal |
| Colour | #cdcdcd |
| Text node | button.flex.items-center.gap-1: -apple-system-body 13px/20px 400, #cdcdcd |
| Transition | none |
| Placeholder | "" #1f4e94, opacity 1, 13px |
| Painted layers | div.text-token-text-secondary.group.relative 1078.0x42.0 border B:1px solid #ffffff @ 0.05; input.peer.border-token-icon-secondary/20.bg-token-bg-primary 18.0x18.0 bg #212121 border T:1px solid #cdcdcd @ 0.2 / R:1px solid #cdcdcd @ 0.2 / B:1px solid #cdcdcd @ 0.2 / L:1px solid #cdcdcd @ 0.2 r 4px |
| Tokens | --bg-primary #212121; --icon-secondary #cdcdcd; --page-table-checkbox-inset -45px; --text-secondary #cdcdcd |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 1078 x 42 |
| Padding | 12px 8px 12px 0px |
| Gap | 16px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0.05; L: none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 13px/20px 400 |
| Letter spacing | normal |
| Colour | #5d5d5d |
| Text node | button.flex.items-center.gap-1: -apple-system-body 13px/20px 400, #5d5d5d |
| Transition | none |
| Placeholder | "" #1f4e94, opacity 1, 13px |
| Painted layers | div.text-token-text-secondary.group.relative 1078.0x42.0 border B:1px solid #000000 @ 0.05; input.peer.border-token-icon-secondary/20.bg-token-bg-primary 18.0x18.0 bg #ffffff border T:1px solid #5d5d5d @ 0.2 / R:1px solid #5d5d5d @ 0.2 / B:1px solid #5d5d5d @ 0.2 / L:1px solid #5d5d5d @ 0.2 r 4px |
| Tokens | --bg-primary #fff; --icon-secondary #5d5d5d; --page-table-checkbox-inset -45px; --text-secondary #5d5d5d |
| How | at rest |

Crops: `library-list-header-default.png`, `library-list-header-light.png`.

#### library-row

Library row. Grid row: a 32px tile (thumbnail or type icon), the file name, the last activity; a hairline between rows.

Page copy: `library-dark`. Finder: `() => W(T('Futuristic Glass Media Icon Concepts.png', M()), 1000)`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 1078 x 60 | = |
| Padding | 10px 8px 10px 0px | = |
| Gap | 16px | = |
| Border | T: none; R: none; B: 1px solid #ffffff @ 0.05; L: none | T: none; R: none; B: 1px solid #000000 @ 0; L: none |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Text node | span.absolute.inset-0.overflow-hidden: -apple-system-body 14px/20px 400, #ffffff | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #afafaf, fill #000000 | = |
| Placeholder | "" #1f4e94, opacity 1, 16px | = |
| ::before | 1102px x 61px, absolute, bg #ffffff @ 0.1, radius 16px | = |
| ::after | 1102px x 61px, absolute, bg #000000 @ 0, radius 16px | = |
| Painted layers | div.group.EhAptG_selectableRow.artifacts-surface-library-selectable-row 1078.0x60.0 border B:1px solid #ffffff @ 0.05; div.group.EhAptG_selectableRow.artifacts-surface-library-selectable-row::before 1102pxx61px bg #ffffff @ 0.1 r 16px opacity 0; div.group.EhAptG_selectableRow.artifacts-surface-library-selectable-row::after 1102pxx61px border T:2px solid #ffffff / R:2px solid #ffffff / B:2px solid #ffffff / L:2px solid #ffffff r 16px opacity 0; input.peer.border-token-icon-secondary/20.bg-token-bg-primary 18.0x18.0 bg #212121 border T:1px solid #cdcdcd @ 0.2 / R:1px solid #cdcdcd @ 0.2 / B:1px solid #cdcdcd @ 0.2 / L:1px solid #cdcdcd @ 0.2 r 4px; div.border-token-border-default.bg-token-bg-primary.flex 32.0x32.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r 8px | div.group.EhAptG_selectableRow.artifacts-surface-library-selectable-row 1078.0x60.0 border B:1px solid #000000 @ 0; div.group.EhAptG_selectableRow.artifacts-surface-library-selectable-row::before 1102pxx61px bg #ffffff @ 0.1 r 16px; div.group.EhAptG_selectableRow.artifacts-surface-library-selectable-row::after 1102pxx61px border T:2px solid #ffffff / R:2px solid #ffffff / B:2px solid #ffffff / L:2px solid #ffffff r 16px opacity 0; input.peer.border-token-icon-secondary/20.bg-token-bg-primary 18.0x18.0 bg #212121 border T:1px solid #cdcdcd @ 0.2 / R:1px solid #cdcdcd @ 0.2 / B:1px solid #cdcdcd @ 0.2 / L:1px solid #cdcdcd @ 0.2 r 4px; div.border-token-border-default.bg-token-bg-primary.flex 32.0x32.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r 8px |
| Tokens | --bg-primary #212121; --bg-tertiary #414141; --border-default #ffffff26; --icon-secondary #cdcdcd; --icon-tertiary #afafaf; --page-table-checkbox-inset -45px; --text-primary #fff; --text-secondary #cdcdcd | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 1078 x 60 | = |
| Padding | 10px 8px 10px 0px | = |
| Gap | 16px | = |
| Border | T: none; R: none; B: 1px solid #000000 @ 0.05; L: none | T: none; R: none; B: 1px solid #000000 @ 0; L: none |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Text node | span.absolute.inset-0.overflow-hidden: -apple-system-body 14px/20px 400, #0d0d0d | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 20 x 20, colour #8f8f8f, fill #000000 | = |
| Placeholder | "" #1f4e94, opacity 1, 16px | = |
| ::before | 1102px x 61px, absolute, bg #000000 @ 0.05, radius 16px | = |
| ::after | 1102px x 61px, absolute, bg #000000 @ 0, radius 16px | = |
| Painted layers | div.group.EhAptG_selectableRow.artifacts-surface-library-selectable-row 1078.0x60.0 border B:1px solid #000000 @ 0.05; div.group.EhAptG_selectableRow.artifacts-surface-library-selectable-row::before 1102pxx61px bg #000000 @ 0.05 r 16px opacity 0; div.group.EhAptG_selectableRow.artifacts-surface-library-selectable-row::after 1102pxx61px border T:2px solid #0d0d0d / R:2px solid #0d0d0d / B:2px solid #0d0d0d / L:2px solid #0d0d0d r 16px opacity 0; input.peer.border-token-icon-secondary/20.bg-token-bg-primary 18.0x18.0 bg #ffffff border T:1px solid #5d5d5d @ 0.2 / R:1px solid #5d5d5d @ 0.2 / B:1px solid #5d5d5d @ 0.2 / L:1px solid #5d5d5d @ 0.2 r 4px; div.border-token-border-default.bg-token-bg-primary.flex 32.0x32.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 8px | div.group.EhAptG_selectableRow.artifacts-surface-library-selectable-row 1078.0x60.0 border B:1px solid #000000 @ 0; div.group.EhAptG_selectableRow.artifacts-surface-library-selectable-row::before 1102pxx61px bg #000000 @ 0.05 r 16px; div.group.EhAptG_selectableRow.artifacts-surface-library-selectable-row::after 1102pxx61px border T:2px solid #0d0d0d / R:2px solid #0d0d0d / B:2px solid #0d0d0d / L:2px solid #0d0d0d r 16px opacity 0; input.peer.border-token-icon-secondary/20.bg-token-bg-primary 18.0x18.0 bg #ffffff border T:1px solid #5d5d5d @ 0.2 / R:1px solid #5d5d5d @ 0.2 / B:1px solid #5d5d5d @ 0.2 / L:1px solid #5d5d5d @ 0.2 r 4px; div.border-token-border-default.bg-token-bg-primary.flex 32.0x32.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 8px |
| Tokens | --bg-primary #fff; --bg-tertiary #f3f3f3; --border-default #0000001a; --icon-secondary #5d5d5d; --icon-tertiary #8f8f8f; --page-table-checkbox-inset -45px; --text-primary #0d0d0d; --text-secondary #5d5d5d | = |
| How | at rest | mouse hover |

Crops: `library-row-default.png`, `library-row-hover.png`, `library-row-light.png`, `library-row-light-hover.png`.

#### library-row-icon

Library row type icon (text file).

Page copy: `library-dark`. Finder: `() => P(Q('svg', 0, W(T('Pasted text(5).txt', M()), 1000)))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 32 x 32 |
| Padding | 0px |
| Border | 1px solid #ffffff @ 0.15 |
| Radius | 8px |
| Background | #212121 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| Cursor | pointer |
| Icon | 20 x 20, colour #0285ff |
| Painted layers | div.border-token-border-default.bg-token-bg-primary.flex 32.0x32.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r 8px |
| Tokens | --bg-primary #212121; --border-default #ffffff26 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 32 x 32 |
| Padding | 0px |
| Border | 1px solid #000000 @ 0.1 |
| Radius | 8px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| Cursor | pointer |
| Icon | 20 x 20, colour #0285ff |
| Painted layers | div.border-token-border-default.bg-token-bg-primary.flex 32.0x32.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 8px |
| Tokens | --bg-primary #fff; --border-default #0000001a |
| How | at rest |

Crops: `library-row-icon-default.png`, `library-row-icon-light.png`.

#### library-row-date

Library row date.

Page copy: `library-dark`. Finder: `() => TS('Modified 3w ago', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 160 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #cdcdcd |
| Transition | none |
| Cursor | pointer |
| Tokens | --text-secondary #cdcdcd |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 160 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #5d5d5d |
| Transition | none |
| Cursor | pointer |
| Tokens | --text-secondary #5d5d5d |
| How | at rest |

Crops: `library-row-date-default.png`, `library-row-date-light.png`.

### Images

#### images-title

Images page title.

Page copy: `images-dark`. Finder: `() => T('Images', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 119.88 x 19.73 |
| Padding | 0px 16px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 28px/34px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| Tokens | --images-app-padding 16px; --text-primary #fff |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 119.88 x 19.73 |
| Padding | 0px 16px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 28px/34px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| Tokens | --images-app-padding 16px; --text-primary #0d0d0d |
| How | at rest |

Crops: `images-title-default.png`, `images-title-light.png`.

#### images-tab

Images tab.

Page copy: `images-dark`. Finder: `() => C(T('Templates', M()), 'button,[role=tab],a')`.

Dark theme.

| Property | default | hover | focus-visible | selected |
|---|---|---|---|---|
| Size (w x h) | 102.16 x 36 | = | = | 92.25 x 36 |
| Padding | 0px 16px | = | = | = |
| Border | 1px solid #000000 @ 0 | = | = | = |
| Radius | full | = | = | = |
| Background | transparent | = | = | #414141 |
| Box shadow | none | = | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px | = |
| Font | -apple-system-body 14px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #cdcdcd | #ffffff | = | #ffffff |
| Text node | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #cdcdcd | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #ffffff | = | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #ffffff |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button.btn.relative.btn-ghost 102.2x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full | = | button.btn.relative.btn-ghost 102.2x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full outline 1px auto #99c8ff offset 0px | button.btn.relative.btn-primary-inverse 92.3x36.0 bg #414141 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full |
| Tokens | --text-primary #fff; --text-secondary #cdcdcd | = | = | --bg-tertiary #414141; --border-heavy #fff3; --text-primary #fff |
| How | at rest | mouse hover | keyboard: Shift keydown, then focus() | at rest, captured selected |

Light theme.

| Property | light | light-hover | light-focus-visible | light-selected |
|---|---|---|---|---|
| Size (w x h) | 102.16 x 36 | = | = | 92.25 x 36 |
| Padding | 0px 16px | = | = | = |
| Border | 1px solid #000000 @ 0 | = | = | = |
| Radius | full | = | = | = |
| Background | transparent | = | = | #f3f3f3 |
| Box shadow | none | = | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px | = |
| Font | -apple-system-body 14px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #5d5d5d | #0d0d0d | = | #0d0d0d |
| Text node | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #5d5d5d | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #0d0d0d | = | div.flex.items-center.justify-center: -apple-system-body 14px/20px 500, #0d0d0d |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button.btn.relative.btn-ghost 102.2x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full | = | button.btn.relative.btn-ghost 102.2x36.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full outline 1px auto #005fcc offset 0px | button.btn.relative.btn-primary-inverse 92.3x36.0 bg #f3f3f3 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r full |
| Tokens | --text-primary #0d0d0d; --text-secondary #5d5d5d | = | = | --bg-tertiary #f3f3f3; --border-heavy #00000026; --text-primary #0d0d0d |
| How | at rest | mouse hover | keyboard: Shift keydown, then focus() | at rest, captured selected |

Other finders: selected: `() => C(T('Trending', M()), 'button,[role=tab],a')`; light-selected: `() => C(T('Trending', M()), 'button,[role=tab],a')`.

Crops: `images-tab-default.png`, `images-tab-hover.png`, `images-tab-focus-visible.png`, `images-tab-selected.png`, `images-tab-light.png`, `images-tab-light-hover.png`, `images-tab-light-focus-visible.png`, `images-tab-light-selected.png`.

#### template-card

Template card. A tall tile with radius 24, a photo, and a label over a dark gradient at the bottom.

Page copy: `images-dark`. Finder: `() => C(T('Aerial view', M()), 'button,a,[role=button]')`.

Dark theme.

| Property | default | hover | focus-visible | blank |
|---|---|---|---|---|
| Size (w x h) | 186 x 232.5 | = | = | = |
| Padding | 0px | = | = | = |
| Gap | 10px | = | = | = |
| Border | none | = | = | = |
| Radius | 16px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | 1px auto #63a8f8 offset 4px | = |
| Font | -apple-system-body 16px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Text node | span: -apple-system-body 14px/20px 500, #ffffff | = | = | = |
| Transition | opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | div.bg-token-interactive-bg-tertiary-hover.corner-superellipse/1.25.text-token-text-secondary 186.0x232.5 bg #181818 r 24px; div.pointer-events-none.absolute.inset-x-0 186.0x61.0 image linear-gradient(to top, #000000 @ 0.8 0%, #000000 @ 0.3 50%, #000000 @ 0 100%) | div.bg-token-interactive-bg-tertiary-hover.corner-superellipse/1.25.text-token-text-secondary 186.0x232.5 bg #0d0d0d r 24px; div.pointer-events-none.absolute.inset-x-0 186.0x61.0 image linear-gradient(to top, #000000 @ 0.8 0%, #000000 @ 0.3 50%, #000000 @ 0 100%) | button.group/button.corner-superellipse/1.25.flex 186.0x232.5 r 16px outline 1px auto #63a8f8 offset 4px; div.bg-token-interactive-bg-tertiary-hover.corner-superellipse/1.25.text-token-text-secondary 186.0x232.5 bg #181818 r 24px; div.pointer-events-none.absolute.inset-x-0 186.0x61.0 image linear-gradient(to top, #000000 @ 0.8 0%, #000000 @ 0.3 50%, #000000 @ 0 100%) | div.bg-token-interactive-bg-tertiary-hover.corner-superellipse/1.25.text-token-text-secondary 186.0x232.5 bg #181818 r 24px; div.loading-results-shimmer.bg-token-bg-secondary.absolute 186.0x232.5 bg #303030; div.pointer-events-none.absolute.inset-x-0 186.0x61.0 image linear-gradient(to top, #000000 @ 0.8 0%, #000000 @ 0.3 50%, #000000 @ 0 100%) |
| Tokens | --bg-primary-inverted #fff; --interactive-bg-tertiary-hover #181818; --interactive-bg-tertiary-press #0d0d0d; --spacing .25rem; --text-secondary #cdcdcd | = | = | --bg-primary-inverted #fff; --bg-secondary #303030; --interactive-bg-tertiary-hover #181818; --interactive-bg-tertiary-press #0d0d0d; --spacing .25rem; --text-secondary #cdcdcd |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured blank |

Light theme.

| Property | light | light-hover | light-focus-visible | light-blank |
|---|---|---|---|---|
| Size (w x h) | 186 x 232.5 | = | = | = |
| Padding | 0px | = | = | = |
| Gap | 10px | = | = | = |
| Border | none | = | = | = |
| Radius | 16px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | 1px auto #3a83f7 offset 4px | = |
| Font | -apple-system-body 16px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #0d0d0d | = | = | = |
| Text node | span: -apple-system-body 14px/20px 500, #ffffff | = | = | = |
| Transition | opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | div.bg-token-interactive-bg-tertiary-hover.corner-superellipse/1.25.text-token-text-secondary 186.0x232.5 bg #f9f9f9 r 24px; div.pointer-events-none.absolute.inset-x-0 186.0x61.0 image linear-gradient(to top, #000000 @ 0.8 0%, #000000 @ 0.3 50%, #000000 @ 0 100%) | div.bg-token-interactive-bg-tertiary-hover.corner-superellipse/1.25.text-token-text-secondary 186.0x232.5 bg #f3f3f3 r 24px; div.pointer-events-none.absolute.inset-x-0 186.0x61.0 image linear-gradient(to top, #000000 @ 0.8 0%, #000000 @ 0.3 50%, #000000 @ 0 100%) | button.group/button.corner-superellipse/1.25.flex 186.0x232.5 r 16px outline 1px auto #3a83f7 offset 4px; div.bg-token-interactive-bg-tertiary-hover.corner-superellipse/1.25.text-token-text-secondary 186.0x232.5 bg #f9f9f9 r 24px; div.pointer-events-none.absolute.inset-x-0 186.0x61.0 image linear-gradient(to top, #000000 @ 0.8 0%, #000000 @ 0.3 50%, #000000 @ 0 100%) | div.bg-token-interactive-bg-tertiary-hover.corner-superellipse/1.25.text-token-text-secondary 186.0x232.5 bg #f9f9f9 r 24px; div.loading-results-shimmer.bg-token-bg-secondary.absolute 186.0x232.5 bg #e8e8e8; div.pointer-events-none.absolute.inset-x-0 186.0x61.0 image linear-gradient(to top, #000000 @ 0.8 0%, #000000 @ 0.3 50%, #000000 @ 0 100%) |
| Tokens | --bg-primary-inverted #000; --interactive-bg-tertiary-hover #f9f9f9; --interactive-bg-tertiary-press #f3f3f3; --spacing .25rem; --text-secondary #5d5d5d | = | = | --bg-primary-inverted #000; --bg-secondary #e8e8e8; --interactive-bg-tertiary-hover #f9f9f9; --interactive-bg-tertiary-press #f3f3f3; --spacing .25rem; --text-secondary #5d5d5d |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured blank |

Other finders: blank: `() => C(T('Caricature', M()), 'button,a,[role=button]')`; light-blank: `() => C(T('Caricature', M()), 'button,a,[role=button]')`.

Crops: `template-card-default.png`, `template-card-hover.png`, `template-card-focus-visible.png`, `template-card-blank.png`, `template-card-light.png`, `template-card-light-hover.png`, `template-card-light-focus-visible.png`, `template-card-light-blank.png`.

### Plugins

#### plugins-title

Plugins page title. `text-heading-app` (28/34), 500.

Page copy: `plugins-dark`. Finder: `() => Q('h1', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 464 x 36 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 28px/36px 500 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| Tokens | --text-primary #fff |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 464 x 36 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 28px/36px 500 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| Tokens | --text-primary #0d0d0d |
| How | at rest |

Crops: `plugins-title-default.png`, `plugins-title-light.png`.

#### plugins-subtitle

Plugins subtitle.

Page copy: `plugins-dark`. Finder: `() => T('Work with ChatGPT across your favorite tools.')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 464 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #cdcdcd |
| Transition | none |
| Tokens | --text-secondary #cdcdcd |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 464 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #5d5d5d |
| Transition | none |
| Tokens | --text-secondary #5d5d5d |
| How | at rest |

Crops: `plugins-subtitle-default.png`, `plugins-subtitle-light.png`.

#### plugins-search

Plugins search field.

Page copy: `plugins-dark`. Finder: `() => P(Q('input[placeholder="Search plugins"]'))`.

Dark theme.

| Property | default | focus-visible |
|---|---|---|
| Size (w x h) | 240 x 36 | = |
| Padding | 8px 12px 8px 36px | = |
| Border | 1px solid #ffffff @ 0.15 | 1px solid #ffffff @ 0.2 |
| Radius | full | = |
| Background | #212121 | = |
| Box shadow | none | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Transition | none | = |
| Cursor | text | = |
| Placeholder | "Search plugins" #afafaf, opacity 1, 14px | = |
| Painted layers | input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 240.0x36.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full | input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 240.0x36.0 bg #212121 border T:1px solid #ffffff @ 0.2 / R:1px solid #ffffff @ 0.2 / B:1px solid #ffffff @ 0.2 / L:1px solid #ffffff @ 0.2 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Tokens | --bg-primary #212121; --border-default #ffffff26; --border-heavy #fff3; --text-primary #fff; --text-tertiary #afafaf | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-focus-visible |
|---|---|---|
| Size (w x h) | 240 x 36 | = |
| Padding | 8px 12px 8px 36px | = |
| Border | 1px solid #000000 @ 0.1 | 1px solid #000000 @ 0.15 |
| Radius | full | = |
| Background | #ffffff | = |
| Box shadow | none | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Transition | none | = |
| Cursor | text | = |
| Placeholder | "Search plugins" #8f8f8f, opacity 1, 14px | = |
| Painted layers | input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 240.0x36.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r full | input.text-token-text-primary.border-token-border-default.bg-token-bg-primary 240.0x36.0 bg #ffffff border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 0px, #1f4e94 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Tokens | --bg-primary #fff; --border-default #0000001a; --border-heavy #00000026; --text-primary #0d0d0d; --text-tertiary #8f8f8f | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab |

Crops: `plugins-search-default.png`, `plugins-search-focus-visible.png`, `plugins-search-light.png`, `plugins-search-light-focus-visible.png`.

#### plugins-add

Round + button (beside search).

Page copy: `plugins-dark`. Finder: `() => Q('button[aria-label="Add plugin"]', 0, M())`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | 1px solid #ffffff @ 0.15 | = | = |
| Radius | full | = | = |
| Background | #ffffff @ 0 | #ffffff @ 0.1 | #ffffff @ 0.1 |
| Box shadow | none | = | = |
| Outline | 1px solid #000000 @ 0 offset 2px | = | 1px solid #ffffff @ 0.16 offset 2px |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | #ffffff @ 0.898 | #ffffff @ 0.898 |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | 20 x 20, colour #ffffff @ 0.898, fill #000000 | 20 x 20, colour #ffffff @ 0.898, fill #000000 |
| Painted layers | button.interactive-button.interactive-button-secondary.inline-flex 36.0x36.0 bg #ffffff @ 0 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full outline 1px solid #000000 @ 0 offset 2px | button.interactive-button.interactive-button-secondary.inline-flex 36.0x36.0 bg #ffffff @ 0.1 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full outline 1px solid #000000 @ 0 offset 2px | button.interactive-button.interactive-button-secondary.inline-flex 36.0x36.0 bg #ffffff @ 0.1 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full outline 1px solid #ffffff @ 0.16 offset 2px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | 1px solid #000000 @ 0.1 | 1px solid #000000 @ 0.05 | = |
| Radius | full | = | = |
| Background | transparent | #000000 @ 0.05 | #000000 @ 0.05 |
| Box shadow | none | = | = |
| Outline | 1px solid #000000 @ 0 offset 2px | = | 1px solid #0d0d0d @ 0.12 offset 2px |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | #000000 @ 0.898 | #000000 @ 0.898 |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | 20 x 20, colour #000000 @ 0.898, fill #000000 | 20 x 20, colour #000000 @ 0.898, fill #000000 |
| Painted layers | button.interactive-button.interactive-button-secondary.inline-flex 36.0x36.0 border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r full outline 1px solid #000000 @ 0 offset 2px | button.interactive-button.interactive-button-secondary.inline-flex 36.0x36.0 bg #000000 @ 0.05 border T:1px solid #000000 @ 0.05 / R:1px solid #000000 @ 0.05 / B:1px solid #000000 @ 0.05 / L:1px solid #000000 @ 0.05 r full outline 1px solid #000000 @ 0 offset 2px | button.interactive-button.interactive-button-secondary.inline-flex 36.0x36.0 bg #000000 @ 0.05 border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r full outline 1px solid #0d0d0d @ 0.12 offset 2px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `plugins-add-default.png`, `plugins-add-hover.png`, `plugins-add-focus-visible.png`, `plugins-add-light.png`, `plugins-add-light-hover.png`, `plugins-add-light-focus-visible.png`.

#### plugins-section

Plugins section title (Popular).

Page copy: `plugins-dark`. Finder: `() => T('Popular', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 50.55 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | h2.text-token-text-primary.text-sm.leading-5: -apple-system-body 14px/20px 500, #ffffff |
| Transition | none |
| Tokens | --text-primary #fff |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 50.55 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | h2.text-token-text-primary.text-sm.leading-5: -apple-system-body 14px/20px 500, #0d0d0d |
| Transition | none |
| Tokens | --text-primary #0d0d0d |
| How | at rest |

Crops: `plugins-section-default.png`, `plugins-section-light.png`.

#### plugin-row

Plugin row. 384x56 (two columns): a 40px icon tile, name over a one-line description, a + at the end; the whole row is a link.

Page copy: `plugins-dark`. Finder: `() => Q('a[aria-label="Open Gmail"]').parentElement`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 384 x 56 | = | = |
| Padding | 8px | = | = |
| Border | none | = | = |
| Radius | 16px | = | = |
| Background | transparent | #ffffff @ 0.1 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | div.text-token-text-primary.min-w-0.truncate: -apple-system-body 14px/18px 400, #ffffff | = | = |
| Transition | none | = | = |
| Icon | 12 x 12, colour #007aff, fill #000000 | = | = |
| Painted layers | div.bg-token-bg-primary.relative.flex 40.0x40.0 bg #212121 border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 12px; span.absolute.-end-2.5.-bottom-1 20.0x20.0 bg #ddedff border T:1px solid #a4cdfb @ 0.35 / R:1px solid #a4cdfb @ 0.35 / B:1px solid #a4cdfb @ 0.35 / L:1px solid #a4cdfb @ 0.35 r full | article.relative.flex.items-center 384.0x56.0 bg #ffffff @ 0.1 r 16px; div.bg-token-bg-primary.relative.flex 40.0x40.0 bg #212121 border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 12px; span.absolute.-end-2.5.-bottom-1 20.0x20.0 bg #ddedff border T:1px solid #a4cdfb @ 0.35 / R:1px solid #a4cdfb @ 0.35 / B:1px solid #a4cdfb @ 0.35 / L:1px solid #a4cdfb @ 0.35 r full | a.absolute.inset-0.z-0 384.0x56.0 r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 1px, #ffffff 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px; div.bg-token-bg-primary.relative.flex 40.0x40.0 bg #212121 border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 12px; span.absolute.-end-2.5.-bottom-1 20.0x20.0 bg #ddedff border T:1px solid #a4cdfb @ 0.35 / R:1px solid #a4cdfb @ 0.35 / B:1px solid #a4cdfb @ 0.35 / L:1px solid #a4cdfb @ 0.35 r full |
| Tokens | --bg-primary #212121; --interactive-bg-secondary-hover #ffffff1a; --text-accent #63a8f8; --text-primary #fff; --text-tertiary #afafaf; --theme-blue-background color(display-p3 .07451 .203922 .388235) | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 384 x 56 | = | = |
| Padding | 8px | = | = |
| Border | none | = | = |
| Radius | 16px | = | = |
| Background | transparent | #000000 @ 0.05 | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Text node | div.text-token-text-primary.min-w-0.truncate: -apple-system-body 14px/18px 400, #0d0d0d | = | = |
| Transition | none | = | = |
| Icon | 12 x 12, colour #3a83f7, fill #000000 | = | = |
| Painted layers | div.bg-token-bg-primary.relative.flex 40.0x40.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 12px; span.absolute.-end-2.5.-bottom-1 20.0x20.0 bg color(display-p3 0.909804 0.952941 0.996078) border T:1px solid #3a83f7 @ 0.15 / R:1px solid #3a83f7 @ 0.15 / B:1px solid #3a83f7 @ 0.15 / L:1px solid #3a83f7 @ 0.15 r full | article.relative.flex.items-center 384.0x56.0 bg #000000 @ 0.05 r 16px; div.bg-token-bg-primary.relative.flex 40.0x40.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 12px; span.absolute.-end-2.5.-bottom-1 20.0x20.0 bg color(display-p3 0.909804 0.952941 0.996078) border T:1px solid #3a83f7 @ 0.15 / R:1px solid #3a83f7 @ 0.15 / B:1px solid #3a83f7 @ 0.15 / L:1px solid #3a83f7 @ 0.15 r full | a.absolute.inset-0.z-0 384.0x56.0 r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 1px, #0d0d0d 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px; div.bg-token-bg-primary.relative.flex 40.0x40.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 12px; span.absolute.-end-2.5.-bottom-1 20.0x20.0 bg color(display-p3 0.909804 0.952941 0.996078) border T:1px solid #3a83f7 @ 0.15 / R:1px solid #3a83f7 @ 0.15 / B:1px solid #3a83f7 @ 0.15 / L:1px solid #3a83f7 @ 0.15 r full |
| Tokens | --bg-primary #fff; --interactive-bg-secondary-hover #0000000d; --text-accent #3a83f7; --text-primary #0d0d0d; --text-tertiary #8f8f8f; --theme-blue-background color(display-p3 .909804 .952941 .996078) | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Crops: `plugin-row-default.png`, `plugin-row-hover.png`, `plugin-row-focus-visible.png`, `plugin-row-light.png`, `plugin-row-light-hover.png`, `plugin-row-light-focus-visible.png`.

#### plugin-icon

Plugin icon tile.

Page copy: `plugins-dark`. Finder: `() => Q('[data-testid=plugin-icon-wrapper]', 0, Q('a[aria-label="Open Gmail"]').parentElement)`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 40 x 40 |
| Padding | 0px |
| Border | 1px solid #000000 @ 0.1 |
| Radius | 12px |
| Background | #212121 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| Painted layers | div.bg-token-bg-primary.relative.flex 40.0x40.0 bg #212121 border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 12px |
| Tokens | --bg-primary #212121 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 40 x 40 |
| Padding | 0px |
| Border | 1px solid #000000 @ 0.1 |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| Painted layers | div.bg-token-bg-primary.relative.flex 40.0x40.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 12px |
| Tokens | --bg-primary #fff |
| How | at rest |

Crops: `plugin-icon-default.png`, `plugin-icon-light.png`.

#### plugin-add

Plugin row + button.

Page copy: `plugins-dark`. Finder: `() => Q('button', 0, Q('a[aria-label="Open Gmail"]').parentElement)`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | full | = | = |
| Background | transparent | #212121 | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| Tokens | --bg-primary #212121; --text-primary #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.interactive-button.text-token-text-primary.relative 32.0x32.0 bg #212121 r full | button.interactive-button.text-token-text-primary.relative 32.0x32.0 r full outline 1px auto #99c8ff offset 0px |
| Ancestor paint | - | 1 up article.relative.flex.items-center bg #ffffff @ 0.1 | = |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | full | = | = |
| Background | transparent | #ffffff | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px |
| Font | -apple-system-body 16px/24px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = |
| Tokens | --bg-primary #fff; --text-primary #0d0d0d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | button.interactive-button.text-token-text-primary.relative 32.0x32.0 bg #ffffff r full | button.interactive-button.text-token-text-primary.relative 32.0x32.0 r full outline 1px auto #005fcc offset 0px |
| Ancestor paint | - | 1 up article.relative.flex.items-center bg #000000 @ 0.05 | = |

Crops: `plugin-add-default.png`, `plugin-add-hover.png`, `plugin-add-focus-visible.png`, `plugin-add-light.png`, `plugin-add-light-hover.png`, `plugin-add-light-focus-visible.png`.

#### plugins-see-more

"See Outlook Email, Notion, and more" link.

Page copy: `plugins-dark`. Finder: `() => C(TS('See Outlook'), 'a')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 768 x 48 | = | = |
| Padding | 8px | = | = |
| Gap | 12px | = | = |
| Border | none | = | = |
| Radius | 16px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 1px, #ffffff 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #cdcdcd | #ffffff | = |
| Text node | span.min-w-0.truncate: -apple-system-body 14px/20px 400, #cdcdcd | span.min-w-0.truncate: -apple-system-body 14px/20px 400, #ffffff | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | div.bg-token-bg-primary.relative.flex 24.0x24.0 bg #212121 border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 6px; div.bg-token-bg-primary.relative.flex 24.0x24.0 bg #212121 border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 6px; div.bg-token-bg-primary.relative.flex 24.0x24.0 bg #212121 border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 6px | = | a.interactive-button.text-token-text-secondary.-ms-2 768.0x48.0 r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 1px, #ffffff 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px; div.bg-token-bg-primary.relative.flex 24.0x24.0 bg #212121 border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 6px; div.bg-token-bg-primary.relative.flex 24.0x24.0 bg #212121 border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 6px; div.bg-token-bg-primary.relative.flex 24.0x24.0 bg #212121 border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 6px |
| Tokens | --bg-primary #212121; --text-primary #fff; --text-secondary #cdcdcd | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 768 x 48 | = | = |
| Padding | 8px | = | = |
| Gap | 12px | = | = |
| Border | none | = | = |
| Radius | 16px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 1px, #0d0d0d 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = | = |
| Font | -apple-system-body 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #5d5d5d | #0d0d0d | = |
| Text node | span.min-w-0.truncate: -apple-system-body 14px/20px 400, #5d5d5d | span.min-w-0.truncate: -apple-system-body 14px/20px 400, #0d0d0d | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | div.bg-token-bg-primary.relative.flex 24.0x24.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 6px; div.bg-token-bg-primary.relative.flex 24.0x24.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 6px; div.bg-token-bg-primary.relative.flex 24.0x24.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 6px | = | a.interactive-button.text-token-text-secondary.-ms-2 768.0x48.0 r 16px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 1px, #0d0d0d 0px 0px 0px 2px, #000000 @ 0 0px 0px 0px 0px; div.bg-token-bg-primary.relative.flex 24.0x24.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 6px; div.bg-token-bg-primary.relative.flex 24.0x24.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 6px; div.bg-token-bg-primary.relative.flex 24.0x24.0 bg #ffffff border T:1px solid #000000 @ 0.1 / R:1px solid #000000 @ 0.1 / B:1px solid #000000 @ 0.1 / L:1px solid #000000 @ 0.1 r 6px |
| Tokens | --bg-primary #fff; --text-primary #0d0d0d; --text-secondary #5d5d5d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `plugins-see-more-default.png`, `plugins-see-more-hover.png`, `plugins-see-more-focus-visible.png`, `plugins-see-more-light.png`, `plugins-see-more-light-hover.png`, `plugins-see-more-light-focus-visible.png`.

### Project

#### project-title

Project title.

Page copy: `project-dark`. Finder: `() => Q('h1', 0, M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 577.78 x 36 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 28px/34px 500 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | button.font-inherit.leading-inherit.min-w-0: -apple-system-body 28px/34px 500, #ffffff |
| Transition | none |
| Tokens | --text-primary #fff |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 577.78 x 36 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 28px/34px 500 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | button.font-inherit.leading-inherit.min-w-0: -apple-system-body 28px/34px 500, #0d0d0d |
| Transition | none |
| Tokens | --text-primary #0d0d0d |
| How | at rest |

Crops: `project-title-default.png`, `project-title-light.png`.

#### project-share

Project Share button.

Page copy: `project-dark`. Finder: `() => C(T('Share', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 88.22 x 36 | = | = |
| Padding | 0px 12px | = | = |
| Border | 1px solid #ffffff @ 0.15 | = | = |
| Radius | full | = | = |
| Background | #212121 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px |
| Font | -apple-system-body 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span: -apple-system-body 14px/20px 500, #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| Painted layers | button.btn.relative.btn-secondary 88.2x36.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full | = | button.btn.relative.btn-secondary 88.2x36.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full outline 1px auto #99c8ff offset 0px |
| Tokens | --text-primary #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 88.22 x 36 | = | = |
| Padding | 0px 12px | = | = |
| Border | 1px solid #000000 @ 0.15 | = | = |
| Radius | full | = | = |
| Background | #ffffff | #f9f9f9 | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px |
| Font | -apple-system-body 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Text node | span: -apple-system-body 14px/20px 500, #0d0d0d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = |
| Painted layers | button.btn.relative.btn-secondary 88.2x36.0 bg #ffffff border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full | button.btn.relative.btn-secondary 88.2x36.0 bg #f9f9f9 border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full | button.btn.relative.btn-secondary 88.2x36.0 bg #ffffff border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full outline 1px auto #005fcc offset 0px |
| Tokens | --text-primary #0d0d0d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `project-share-default.png`, `project-share-hover.png`, `project-share-focus-visible.png`, `project-share-light.png`, `project-share-light-hover.png`, `project-share-light-focus-visible.png`.

#### project-more

Project details (…) button.

Page copy: `project-dark`. Finder: `() => Q('button[aria-label="Show project details"]', 0, M())`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | 1px solid #ffffff @ 0.15 | = | = |
| Radius | full | = | = |
| Background | #212121 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #99c8ff offset 0px |
| Font | -apple-system-body 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #ffffff, fill #000000 | = | = |
| Painted layers | button.btn.relative.btn-secondary 36.0x36.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full | = | button.btn.relative.btn-secondary 36.0x36.0 bg #212121 border T:1px solid #ffffff @ 0.15 / R:1px solid #ffffff @ 0.15 / B:1px solid #ffffff @ 0.15 / L:1px solid #ffffff @ 0.15 r full outline 1px auto #99c8ff offset 0px |
| Tokens | --text-primary #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 36 x 36 | = | = |
| Padding | 0px | = | = |
| Border | 1px solid #000000 @ 0.15 | = | = |
| Radius | full | = | = |
| Background | #ffffff | #f9f9f9 | = |
| Box shadow | none | = | = |
| Outline | none | = | 1px auto #005fcc offset 0px |
| Font | -apple-system-body 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0d0d0d | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 | = | = |
| Painted layers | button.btn.relative.btn-secondary 36.0x36.0 bg #ffffff border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full | button.btn.relative.btn-secondary 36.0x36.0 bg #f9f9f9 border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full | button.btn.relative.btn-secondary 36.0x36.0 bg #ffffff border T:1px solid #000000 @ 0.15 / R:1px solid #000000 @ 0.15 / B:1px solid #000000 @ 0.15 / L:1px solid #000000 @ 0.15 r full outline 1px auto #005fcc offset 0px |
| Tokens | --text-primary #0d0d0d | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `project-more-default.png`, `project-more-hover.png`, `project-more-focus-visible.png`, `project-more-light.png`, `project-more-light-hover.png`, `project-more-light-focus-visible.png`.

#### project-tab

Project tab (Sources).

Page copy: `project-dark`. Finder: `() => C(T('Sources', M()), 'button,[role=tab],a')`.

Dark theme.

| Property | default | hover | focus-visible | selected |
|---|---|---|---|---|
| Size (w x h) | 85.86 x 38 | = | = | 70.47 x 38 |
| Padding | 9px 16px | = | = | = |
| Border | none | = | = | = |
| Radius | full | = | = | = |
| Background | transparent | #ffffff @ 0.0611765 | = | #ffffff @ 0.05 |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #afafaf 0px 0px 0px 3px, #000000 @ 0 0px 0px 0px 0px | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 0px 1px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = | = | = |
| Font | -apple-system-body 14px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #afafaf | = | = | #ffffff |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Tokens | --border-heavy #fff3; --interactive-bg-secondary-hover #ffffff1a; --interactive-bg-secondary-press #ffffff0d; --interactive-label-secondary-default #fff; --text-tertiary #afafaf | = | = | = |
| How | at rest | mouse hover | keyboard: Shift keydown, then focus() | at rest, captured selected |
| Painted layers | - | button.rounded-full.px-4.py-2.25 85.9x38.0 bg #ffffff @ 0.0611765 r full | button.rounded-full.px-4.py-2.25 85.9x38.0 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #afafaf 0px 0px 0px 3px, #000000 @ 0 0px 0px 0px 0px | button.rounded-full.px-4.py-2.25 70.5x38.0 bg #ffffff @ 0.05 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 0px 1px, #000000 @ 0 0px 0px 0px 0px |

Light theme.

| Property | light | light-hover | light-focus-visible | light-selected |
|---|---|---|---|---|
| Size (w x h) | 85.86 x 38 | = | = | 70.47 x 38 |
| Padding | 9px 16px | = | = | = |
| Border | none | = | = | = |
| Radius | full | = | = | = |
| Background | transparent | #000000 @ 0.0305882 | = | #000000 @ 0.05 |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #8f8f8f 0px 0px 0px 3px, #000000 @ 0 0px 0px 0px 0px | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.15 0px 0px 0px 1px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none | = | = | = |
| Font | -apple-system-body 14px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #8f8f8f | = | = | #0d0d0d |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = |
| Cursor | pointer | = | = | = |
| Tokens | --border-heavy #00000026; --interactive-bg-secondary-hover #0000000d; --interactive-bg-secondary-press #0000000d; --interactive-label-secondary-default #0d0d0d; --text-tertiary #8f8f8f | = | = | = |
| How | at rest | mouse hover | keyboard: Shift keydown, then focus() | at rest, captured selected |
| Painted layers | - | button.rounded-full.px-4.py-2.25 85.9x38.0 bg #000000 @ 0.0305882 r full | button.rounded-full.px-4.py-2.25 85.9x38.0 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px, #8f8f8f 0px 0px 0px 3px, #000000 @ 0 0px 0px 0px 0px | button.rounded-full.px-4.py-2.25 70.5x38.0 bg #000000 @ 0.05 r full shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.15 0px 0px 0px 1px, #000000 @ 0 0px 0px 0px 0px |

Other finders: selected: `() => C(T('Chats', M()), 'button,[role=tab],a')`; light-selected: `() => C(T('Chats', M()), 'button,[role=tab],a')`.

Crops: `project-tab-default.png`, `project-tab-hover.png`, `project-tab-focus-visible.png`, `project-tab-selected.png`, `project-tab-light.png`, `project-tab-light-hover.png`, `project-tab-light-focus-visible.png`, `project-tab-light-selected.png`.

#### project-chat-row

Project chat row. Title over a one-line preview of the last message, a date at the end, hairlines between rows.

Page copy: `project-dark`. Finder: `() => W(T('Skill Trends and Pay', M()), 740)`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 744 x 40 | = |
| Padding | 0px | = |
| Gap | 16px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Text node | div.text-sm.font-medium: -apple-system-body 14px/20px 500, #ffffff | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #ffffff, fill #000000 | = |
| Tokens | --text-primary #fff; --text-secondary #cdcdcd; --text-tertiary #afafaf | = |
| How | at rest | mouse hover |
| Ancestor paint | - | 1 up li.group/project-item.flex.min-h-16 bg #ffffff @ 0.1 |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 744 x 40 | = |
| Padding | 0px | = |
| Gap | 16px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Text node | div.text-sm.font-medium: -apple-system-body 14px/20px 500, #0d0d0d | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #0d0d0d, fill #000000 | = |
| Tokens | --text-primary #0d0d0d; --text-secondary #5d5d5d; --text-tertiary #8f8f8f | = |
| How | at rest | mouse hover |
| Ancestor paint | - | 1 up li.group/project-item.flex.min-h-16 bg #000000 @ 0.05 |

Crops: `project-chat-row-default.png`, `project-chat-row-hover.png`, `project-chat-row-light.png`, `project-chat-row-light-hover.png`.

#### project-chat-date

Project chat date.

Page copy: `project-dark`. Finder: `() => Q('[data-testid=project-conversation-overflow-date]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 37.8 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #afafaf |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 37.8 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #8f8f8f |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Crops: `project-chat-date-default.png`, `project-chat-date-light.png`.

### Mobile

#### m-header

Phone header. Menu button, the ChatGPT model switcher with a chevron, Upgrade and the temporary-chat button.

Page copy: `mobile-home-dark`. Finder: `() => Q('#page-header') // Q('header')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 390 x 52 |
| Padding | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | span.header-wordmark: OpenAI Sans 18px/28px 600, #ffffff, ls -0.27px |
| Transition | none |
| Icon | 24 x 24, colour #cdcdcd, fill #000000 |
| Painted layers | header.draggable.no-draggable-children.sticky 390.0x52.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px; div.flex.items-center.translucent-surface 151.2x36.0 bg #000000 @ 0.6 r 8px; div.translucent-surface.rounded-lg 106.2x34.0 bg #000000 @ 0.6 r 8px; button.button-glimmer-cta.relative.flex 106.2x34.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px; div.flex.items-center.justify-center 36.0x36.0 bg #000000 @ 0.6 r 8px |
| Tokens | --icon-accent #63a8f8; --surface-hover #ffffff26; --text-primary #fff; --text-secondary #cdcdcd; --text-tertiary #afafaf |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 390 x 52 |
| Padding | 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | span.header-wordmark: OpenAI Sans 18px/28px 600, #0d0d0d, ls -0.27px |
| Transition | none |
| Icon | 24 x 24, colour #5d5d5d, fill #000000 |
| Painted layers | header.draggable.no-draggable-children.sticky 390.0x52.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px; div.flex.items-center.translucent-surface 151.2x36.0 bg #fcfcfc @ 0.6 r 8px; div.translucent-surface.rounded-lg 106.2x34.0 bg #fcfcfc @ 0.6 r 8px; button.button-glimmer-cta.relative.flex 106.2x34.0 border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 8px; div.flex.items-center.justify-center 36.0x36.0 bg #fcfcfc @ 0.6 r 8px |
| Tokens | --icon-accent #3a83f7; --surface-hover #00000012; --text-primary #0d0d0d; --text-secondary #5d5d5d; --text-tertiary #8f8f8f |
| How | at rest |

Crops: `m-header-default.png`, `m-header-light.png`.

#### m-open-sidebar

Phone open-sidebar button.

Page copy: `mobile-home-dark`. Finder: `() => Q('[data-testid=open-sidebar-button]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 36 x 36 |
| Padding | 0px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | none |
| Cursor | pointer |
| Icon | 24 x 24, colour #cdcdcd, fill #000000 |
| Tokens | --surface-hover #ffffff26; --text-primary #fff; --text-secondary #cdcdcd |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 36 x 36 |
| Padding | 0px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | none |
| Cursor | pointer |
| Icon | 24 x 24, colour #5d5d5d, fill #000000 |
| Tokens | --surface-hover #00000012; --text-primary #0d0d0d; --text-secondary #5d5d5d |
| How | at rest |

Crops: `m-open-sidebar-default.png`, `m-open-sidebar-light.png`.

#### m-model-switcher

Phone model switcher.

Page copy: `mobile-home-dark`, `mobile-thread-dark-model-menu`. Finder: `() => Q('[data-testid=model-switcher-dropdown-button]')`.

Dark theme.

| Property | default | open |
|---|---|---|
| Size (w x h) | 115.23 x 36 | = |
| Padding | 0px 10px | = |
| Gap | 4px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 18px/28px 400 | = |
| Letter spacing | normal | = |
| Colour | #ffffff | = |
| Text node | span.header-wordmark: OpenAI Sans 18px/28px 600, #ffffff, ls -0.27px | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #afafaf, fill #000000 | = |
| Ancestor paint | 1 up div.flex.items-center.translucent-surface bg #000000 @ 0.6; 3 up header.draggable.no-draggable-children.sticky shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px | = |
| Tokens | --surface-hover #ffffff26; --text-tertiary #afafaf | = |
| How | at rest | at rest, captured open |

Light theme.

| Property | light | light-open |
|---|---|---|
| Size (w x h) | 115.23 x 36 | = |
| Padding | 0px 10px | = |
| Gap | 4px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | -apple-system-body 18px/28px 400 | = |
| Letter spacing | normal | = |
| Colour | #0d0d0d | = |
| Text node | span.header-wordmark: OpenAI Sans 18px/28px 600, #0d0d0d, ls -0.27px | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 16 x 16, colour #8f8f8f, fill #000000 | = |
| Ancestor paint | 1 up div.flex.items-center.translucent-surface bg #fcfcfc @ 0.6; 3 up header.draggable.no-draggable-children.sticky shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px | = |
| Tokens | --surface-hover #00000012; --text-tertiary #8f8f8f | = |
| How | at rest | at rest, captured open |

Other finders: open: `() => Q('[data-testid=model-switcher-dropdown-button]')`; light-open: `() => Q('[data-testid=model-switcher-dropdown-button]')`.

Crops: `m-model-switcher-default.png`, `m-model-switcher-open.png`, `m-model-switcher-light.png`, `m-model-switcher-light-open.png`.

#### m-composer

Phone composer. Two rows on a phone: the field over the tool row (+, dictation, voice), radius 28.

Page copy: `mobile-home-dark`. Finder: `() => P(Q('#prompt-textarea'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 358 x 87 |
| Padding | 0px |
| Border | none |
| Radius | 26px |
| Background | #212121 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.2s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | text |
| Icon | 20 x 20, colour #ffffff, fill #000000 |
| Placeholder | "Ask anything" #ffffff, opacity 1, 16px |
| Painted layers | div.bg-(--composer-surface-primary).grid.cursor-text 358.0x87.0 bg #212121 r 26px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 1px 0px inset; button.composer-submit-button-color.text-submit-btn-text.relative 36.0x36.0 bg #2c67c5 r full |
| Tokens | --composer-surface-primary #212121; --spacing .25rem; --text-primary #fff |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 358 x 87 |
| Padding | 0px |
| Border | none |
| Radius | 26px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 40px 8px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.2s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | text |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 |
| Placeholder | "Ask anything" #0d0d0d, opacity 1, 16px |
| Painted layers | div.bg-(--composer-surface-primary).grid.cursor-text 358.0x87.0 bg #ffffff r 26px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.04 0px 0px 0px 1px, #000000 @ 0.04 0px 2px 8px 0px, #000000 @ 0.024 0px 4px 40px 8px; button.composer-submit-button-color.text-submit-btn-text.relative 36.0x36.0 bg #3a83f7 r full |
| Tokens | --composer-surface-primary #fff; --spacing .25rem; --text-primary #0d0d0d |
| How | at rest |

Crops: `m-composer-default.png`, `m-composer-light.png`.

#### m-drawer

Phone drawer. The same sidebar in `#stage-popover-sidebar`, sliding over the page; the slide-in transform was set to its end state by hand before the copy.

Page copy: `mobile-home-dark-drawer`. Finder: `() => C(Q('[data-testid=create-new-chat-button]', 0, Q('#stage-popover-sidebar')), '[role=dialog]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 260 x 844 |
| Padding | 0px |
| Border | T: none; R: 1px solid #ffffff @ 0.1; B: none; L: none |
| Radius | 0px |
| Background | #000000 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.07 0px 0px 64px 0px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div.truncate: -apple-system-body 14px/20px 400, #ffffff |
| Transition | none |
| Icon | 20 x 20, colour #ffffff, fill #000000 |
| Painted layers | div.border-token-border-extra-light.bg-token-sidebar-surface-primary.fixed 260.0x844.0 bg #000000 border R:1px solid #ffffff @ 0.1 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.07 0px 0px 64px 0px; div.sticky.top-0.z-30 260.0x52.0 bg #000000; div.pt-(--sidebar-section-first-margin-top).bg-token-sidebar-surface-primary 260.0x44.0 bg #000000; a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px; div.pointer-events-none.absolute.start-0 260.0x6.0 bg #000000 shadow #000000 @ 0 0px 1px 0px 0px opacity 0; a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0 border B:1px solid #000000 @ 0 r 10px |
| Ancestor paint | 1 up body bg #000000 |
| Tokens | --border-extra-light #ffffff1a; --sharp-edge-top-shadow 0 1px 0 #ffffff0d; --sharp-edge-top-shadow-placeholder 0 1px 0 transparent; --sidebar-section-first-margin-top .5rem; --sidebar-surface-primary #000; --sidebar-width 260px; --surface-hover #ffffff26; --text-primary #fff; --text-tertiary #afafaf |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 260 x 844 |
| Padding | 0px |
| Border | T: none; R: 1px solid #000000 @ 0.05; B: none; L: none |
| Radius | 0px |
| Background | #fcfcfc |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.07 0px 0px 64px 0px |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div.truncate: -apple-system-body 14px/20px 400, #0d0d0d |
| Transition | none |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 |
| Painted layers | div.border-token-border-extra-light.bg-token-sidebar-surface-primary.fixed 260.0x844.0 bg #fcfcfc border R:1px solid #000000 @ 0.05 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.07 0px 0px 64px 0px; div.sticky.top-0.z-30 260.0x52.0 bg #fcfcfc; div.pt-(--sidebar-section-first-margin-top).bg-token-sidebar-surface-primary 260.0x44.0 bg #fcfcfc; a.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px; div.pointer-events-none.absolute.start-0 260.0x6.0 bg #fcfcfc shadow #000000 @ 0 0px 1px 0px 0px opacity 0; a.group.__menu-item.border-b 248.0x36.0 border B:1px solid #000000 @ 0 r 10px |
| Ancestor paint | 1 up body bg #fcfcfc |
| Tokens | --border-extra-light #0000000d; --sharp-edge-top-shadow 0 1px 0 #0000000d; --sharp-edge-top-shadow-placeholder 0 1px 0 transparent; --sidebar-section-first-margin-top .5rem; --sidebar-surface-primary #fcfcfc; --sidebar-width 260px; --surface-hover #00000012; --text-primary #0d0d0d; --text-tertiary #8f8f8f |
| How | at rest |

Crops: `m-drawer-default.png`, `m-drawer-light.png`.

#### m-drawer-row

Phone drawer row.

Page copy: `mobile-home-dark-drawer`. Finder: `() => Q('[data-testid=create-new-chat-button]', 0, Q('#stage-popover-sidebar'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 248 x 36 |
| Padding | 6px 10px |
| Gap | 8px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none |
| Radius | 10px |
| Background | #ffffff @ 0.1 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #ffffff |
| Text node | div.truncate: -apple-system-body 14px/20px 400, #ffffff |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Icon | 20 x 20, colour #ffffff, fill #000000 |
| Painted layers | a.group.__menu-item.border-b 248.0x36.0 bg #ffffff @ 0.1 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --menu-item-active #ffffff1a; --menu-item-background #fff0; --menu-item-highlighted #ffffff1a; --menu-item-icon-opacity 1; --menu-item-open #ffffff0d; --menu-item-pressed #ffffff0d; --text-tertiary #afafaf |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 248 x 36 |
| Padding | 6px 10px |
| Gap | 8px |
| Border | T: none; R: none; B: 1px solid #000000 @ 0; L: none |
| Radius | 10px |
| Background | #000000 @ 0.05 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0d0d0d |
| Text node | div.truncate: -apple-system-body 14px/20px 400, #0d0d0d |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Icon | 20 x 20, colour #0d0d0d, fill #000000 |
| Painted layers | a.group.__menu-item.border-b 248.0x36.0 bg #000000 @ 0.05 border B:1px solid #000000 @ 0 r 10px |
| Tokens | --menu-item-active #0000000d; --menu-item-background #0000; --menu-item-highlighted #0000000d; --menu-item-icon-opacity 1; --menu-item-open #0000000d; --menu-item-pressed #0000000d; --text-tertiary #8f8f8f |
| How | at rest |

Crops: `m-drawer-row-default.png`, `m-drawer-row-light.png`.

#### m-user-bubble

Phone user bubble.

Page copy: `mobile-thread-dark`. Finder: `() => P(TS('Compile these into'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 250.59 x 236 |
| Padding | 10px 16px |
| Border | none |
| Radius | 22px |
| Background | #173e76 |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #f6fafe |
| Text node | div.max-w-full.min-w-0.whitespace-pre-wrap: -apple-system-body 16px/24px 400, #f6fafe |
| Transition | none |
| Painted layers | div.corner-superellipse/0.98.relative.min-w-0 250.6x236.0 bg #173e76 r 22px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 250.59 x 236 |
| Padding | 10px 16px |
| Border | none |
| Radius | 22px |
| Background | #e8f3fe |
| Box shadow | none |
| Outline | none |
| Font | -apple-system-body 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0c274a |
| Text node | div.max-w-full.min-w-0.whitespace-pre-wrap: -apple-system-body 16px/24px 400, #0c274a |
| Transition | none |
| Painted layers | div.corner-superellipse/0.98.relative.min-w-0 250.6x236.0 bg #e8f3fe r 22px |
| How | at rest |

Crops: `m-user-bubble-default.png`, `m-user-bubble-light.png`.
