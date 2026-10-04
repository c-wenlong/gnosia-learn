# Claude component measurements

Computed styles read on 2026-10-04 by `tools/capture/signed-in/measure.mjs` from static copies of the signed-in claude.ai app (1440x900 (the mobile-* snapshots 390x844), deviceScaleFactor 2), and written here by `tools/capture/signed-in/build-measurements.mjs` from [components-computed.json](components-computed.json). Each copy was captured in the dark theme. Dark states have plain names; light states (`light`, `light-<state>`) were read from the same DOM with every [data-mode] element set to light. Every state records `theme` and `snapshot`.

Every component has one table per theme: a column per state, a row per property. A cell that repeats the first column reads `=`. Colours are hex, with `@ alpha` when translucent. "Painted layers" lists the first nodes inside the component that paint a fill, border, shadow or outline (Claude's cds Button paints its fill on an inner span, `.cds-btn-squish`, not the button itself); "Ancestor paint" the same for its parents. "Tokens" lists the `var(--x)` names the component's Tailwind classes use, with the value each resolved to in that theme.

States: `hover` is a real pointer hover; `focus-visible` a real keyboard focus (Shift+Tab, Tab), skipped where the element (a radio span of a segmented control) cannot take focus; the rest (`active`, `selected`, `checked`, `open`, `typed`, `enabled`, ...) are other elements or snapshots captured in that state. Light states are prefixed `light`. The 390 wide copies are measured at rest only.

132 components, 508 states (504 measured, 4 skipped, 0 not found).

## Shared values

Tallied over every measured state by the build script.

- **Radius scale** (element radius, times seen): 8px (194), 7px (40), 6px (30), 9999px (22), 12px (22), 20px (12), 5px (8), 14px (6), 4px (2), 5.5px (2), 16px (2), 10px (2).
- **Transitions**: `box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1)` (98), `outline 0.2s ease` (48), `background-color, border-color, box-shadow, opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)` (12), `box-shadow 0.06s ease` (8), `color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.2s cubic-bezier(0.4, 0, 0.2, 1)` (8), `color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter, display, content-visibility, overlay, pointer-events 0.06s cubic-bezier(0.4, 0, 0.2, 1)` (6), `transform, translate, scale, rotate 0.06s cubic-bezier(0.4, 0, 0.2, 1)` (4), `background-color 0.3s cubic-bezier(0.32, 0.72, 0, 1)` (2), `filter 0.12s ease-out` (2), `color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter, display, content-visibility, overlay, pointer-events 0.15s cubic-bezier(0.4, 0, 0.2, 1)` (2).
- **Font families**: anthropic-sans (622), Anthropicons-Variable (220), anthropic-serif (48), anthropic-mono (6).
- **Type sizes** (size/line-height weight of the first text): 20px/20px 433.25 (154), 14px/20px 400 (92), 16px/16px 533.25 (52), 14px/20px 500 (40), 14px/21px 400 (38), 15px/20px 400 (26), 16px/16px 700 (14), 13px/17px 400 (12), 13px/17px 500 (10), 24px/32px 500 (8), 13px/16px 400 (6), 16px/24px 400 (6), 12px/12px 400 (4), 12px/16px 400 (4).
- **Shadows**: `#151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px` (44); `#fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px` (44); `#151515 0px 0px 0px 1px inset` (16); `#fcfcfb 0px 0px 0px 1px inset` (16); `#0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px` (14); `#2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px` (12).
- **Focus-visible, dark** (35 focused states): shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px (20); nothing painted on the element (6); outline 2px solid #5598e7 offset 2px (4); outline 2px solid #5598e7 @ 0 offset 2px (3); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.075 0px 4px 20px 0px, #ffffff @ 0.2 0px 0px 0px 1px inset, #ffffff @ 0.2 0px 0px 0px 0px (1); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #20201f 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px (1).
- **Focus-visible, light** (35 focused states): shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px (20); nothing painted on the element (6); outline 2px solid #256abf offset 2px (4); outline 2px solid #256abf @ 0 offset 2px (3); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.075 0px 4px 20px 0px, #0b0b0b @ 0.2 0px 0px 0px 0px inset, #0b0b0b @ 0.2 0px 0px 0px 1px (1); shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px (1).
- **Hover changes, dark** (56 hovered components, 14 with no change on the element or its first painted layer): inner layer none → #ffffff @ 0.075 (12); backgroundColor #000000 @ 0 → #ffffff @ 0.075 (6); inner layer undefined → #ffffff @ 0.075 (3); inner layer #ffffff @ 0.1 → #ffffff @ 0.14 (2); inner layer #898781 → #898781 (1); backgroundColor #000000 @ 0 → #ffffff @ 0.1 (1); inner layer #c6613f → #d97757 (1); inner layer #ffffff @ 0.05 → #ffffff @ 0.05 (1).
- **Hover changes, light** (56 hovered components, 14 with no change on the element or its first painted layer): inner layer none → #0b0b0b @ 0.05 (12); backgroundColor #000000 @ 0 → #f0efec (4); inner layer undefined → #0b0b0b @ 0.05 (3); inner layer #ffffff @ 0.1 → #0b0b0b @ 0.05 (2); backgroundColor #000000 @ 0 → #0b0b0b @ 0.05 (2); inner layer #898781 → #898781 (1); backgroundColor #000000 @ 0 → #0b0b0b @ 0.1 (1); inner layer #c6613f → #d97757 (1).

### Tokens the measured components use

Every `var(--x)` named in a measured component's classes, with the value it resolved to in each theme.

| Token | Dark | Light |
|---|---|---|
| `--app-visual-viewport-height` | - | - |
| `--available-height` | 412.5px, 422.5px, 849px, 397px, 890px | 412.5px, 422.5px, 849px, 397px, 890px |
| `--available-width` | 1440px | 1440px |
| `--band-slot-lift` | - | - |
| `--cds-alpha-1` | hsl(from #fff h s l / 5%) | hsl(from #0b0b0b h s l / 5%) |
| `--cds-avatar-sm` | calc(1.5rem * 1) | calc(1.5rem * 1) |
| `--cds-bg-user-message` | hsl(from #fff h s l / 5%) | hsl(from #0b0b0b h s l / 5%) |
| `--cds-black` | #000 | #000 |
| `--cds-border` | hsl(from #fff h s l / 10%) | hsl(from #0b0b0b h s l / 10%) |
| `--cds-checkbox` | calc(1.25rem * 1) | calc(1.25rem * 1) |
| `--cds-checkbox-radius` | calc(.3125rem * 1) | calc(.3125rem * 1) |
| `--cds-cursor-interactive` | pointer, default | pointer, default |
| `--cds-fill-accent` | #2a78d6 | #2a78d6 |
| `--cds-font-size-body` | calc(.875rem * 1) | calc(.875rem * 1) |
| `--cds-font-size-footnote` | calc(.8125rem * 1) | calc(.8125rem * 1) |
| `--cds-h-control` | calc(2rem * 1) | calc(2rem * 1) |
| `--cds-h-control--xs` | calc(1.5rem * 1) | calc(1.5rem * 1) |
| `--cds-leading-body` | calc(1.25rem * 1) | calc(1.25rem * 1) |
| `--cds-leading-footnote` | calc(1.0625rem * 1) | calc(1.0625rem * 1) |
| `--cds-message-bubble-measure` | , 85% | , 85% |
| `--cds-message-bubble-pad-x` | , calc(1rem * 1) | , calc(1rem * 1) |
| `--cds-message-bubble-pad-y` | , calc(.75rem * 1) | , calc(.75rem * 1) |
| `--cds-message-bubble-radius` | , calc(calc(.5rem * 1) + calc(.25rem * 1)) | , calc(calc(.5rem * 1) + calc(.25rem * 1)) |
| `--cds-pad-md` | calc(.75rem * 1) | calc(.75rem * 1) |
| `--cds-page-bg` | #151515, #20201f | #fcfcfb, #fff |
| `--cds-page-header-title-leading` | calc(2rem * 1) | calc(2rem * 1) |
| `--cds-page-header-title-size` | calc(1.5rem * 1) | calc(1.5rem * 1) |
| `--cds-radius` | calc(.5rem * 1), calc(.4375rem * 1) | calc(.5rem * 1), calc(.4375rem * 1) |
| `--cds-rem-scale` | - | - |
| `--cds-resize-pill-force` | - | - |
| `--cds-ring-inner` | 0px, 1px | 0px |
| `--cds-ring-outer` | .5px | .5px |
| `--cds-segmented-control-thumb` | hsl(from #fff h s l / 10%) | #fff |
| `--cds-segmented-control-track` | hsl(from #fff h s l / 5%) | #f6f6f4, hsl(from #0b0b0b h s l / 5%) |
| `--cds-shortcut-cap-ink` | #a5a49a, currentColor, #898781 | #6d6b67, currentColor, #898781 |
| `--cds-switch-h` | calc(1.25rem * 1) | calc(1.25rem * 1) |
| `--cds-switch-knob` | #fff | #fff |
| `--cds-switch-track` | hsl(from #fff h s l / 10%) | hsl(from #0b0b0b h s l / 20%) |
| `--cds-switch-track-hover` | hsl(from #fff h s l / 20%) | hsl(from #0b0b0b h s l / 35%) |
| `--cds-text-muted` | #898781 | #898781 |
| `--chat-list-inset` | - | - |
| `--chorus-composer-lift` | - | - |
| `--composer-banners-h` | calc(0px + 0px) | calc(0px + 0px) |
| `--cp-top` | 25vh | 25vh |
| `--cp-visible-h` | - | - |
| `--df-ceded-gutter` | 0px, 8px | 0px, 8px |
| `--df-footer-btn-size` | 32px | 32px |
| `--df-header-start-inset` | - | - |
| `--df-hover` | hsl(from #fff h s l / 7.5%) | #f0efec |
| `--df-leading-slot` | 28px | 28px |
| `--df-nav-scrollbar-lane` | - | - |
| `--df-radius-pill` | 8px | 8px |
| `--df-row-ctl` | 24px, 36px | 24px, 36px |
| `--df-row-font` | 14px | 14px |
| `--df-row-gap` | 8px | 8px |
| `--df-row-h` | 32px, 44px | 32px, 44px |
| `--df-row-indent` | 0px | 0px |
| `--df-row-px` | 2px | 2px |
| `--df-selected` | hsl(from #fff h s l / 15%) | #edece8 |
| `--df-surface-primary` | 0 0% 14.9% | 0 0% 100% |
| `--hue` | - | - |
| `--ink` | - | - |
| `--list-header-scroll-offset` | 168px, 136px | 168px, 136px |
| `--msg-assistant-pb` | - | - |
| `--msg-block-inset` | 0px | 0px |
| `--msg-block-radius` | - | - |
| `--msg-gap` | - | - |
| `--msg-inset-end` | - | - |
| `--msg-pill-py` | - | - |
| `--msg-text-inset` | .25rem | .25rem |
| `--neutral` | - | - |
| `--new-page-card-px` | - | - |
| `--organization-banner-column-height` | - | - |
| `--prerender-activation-viewport-height` | - | - |
| `--tile-ring` | - | - |
| `--transcript-width` | - | - |

## Components

### Sidebar

#### sidebar

Sidebar (expanded). aside.dframe-sidebar, 288 wide (--df-sidebar-width) and full height, on its own ground (--df-web-sidebar-bg: #111111 in dark, a step darker than the page; #fbfbf9 in light), with no rule between it and the content.

Copy: `home-dark`. Finder: `() => S()`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 288 x 900 |
| Padding | 0px |
| Border | T: none; R: 1px solid #ffffff @ 0.1; B: none; L: none |
| Radius | 0px |
| Background | #111111 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #c3c2b7 |
| Transition | none |
| Icon | 68.33 x 20, colour #f0efec |
| Painted layers | aside.dframe-sidebar 288.0x900.0 bg #111111 border R:1px solid #ffffff @ 0.1; a.flex.items-center 68.3x20.0 outline 2px solid #5598e7 @ 0 offset 2px; div.df-pills.static-composer-boot-fade 271.0x32.0 bg #ffffff @ 0.06 r 8px; div.df-pill-indicator 136.0x30.0 bg #ffffff @ 0.1 r 7px shadow #ffffff @ 0.08 0px 0px 0px 0.5px inset, #000000 @ 0.3 0px 1px 2px 0px, #000000 @ 0.25 0px 2px 6px -1px; button.df-pill.hide-focus-ring 136.1x30.0 r 6px outline 2px solid #5598e7 @ 0 offset 2px; button.df-pill.hide-focus-ring 132.9x30.0 r 6px outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #151515; --cds-shortcut-cap-ink #a5a49a; --df-hover hsl(from #fff h s l / 7.5%); --df-nav-scrollbar-lane (unset); --df-radius-pill 8px; --df-row-ctl 24px; --df-row-font 14px; --df-row-gap 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 288 x 900 |
| Padding | 0px |
| Border | T: none; R: 1px solid #0b0b0b @ 0.1; B: none; L: none |
| Radius | 0px |
| Background | #fbfbf9 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #52514e |
| Transition | none |
| Icon | 68.33 x 20, colour #0b0b0b |
| Painted layers | aside.dframe-sidebar 288.0x900.0 bg #fbfbf9 border R:1px solid #0b0b0b @ 0.1; a.flex.items-center 68.3x20.0 outline 2px solid #256abf @ 0 offset 2px; div.df-pills.static-composer-boot-fade 271.0x32.0 bg #edece8 r 8px; div.df-pill-indicator 136.0x30.0 bg #f9f9f7 r 7px shadow #0b0b0b @ 0.1 0px 0px 0px 0.5px inset, #000000 @ 0.06 0px 1px 2px 0px, #000000 @ 0.05 0px 2px 6px -1px; button.df-pill.hide-focus-ring 136.1x30.0 r 6px outline 2px solid #256abf @ 0 offset 2px; button.df-pill.hide-focus-ring 132.9x30.0 r 6px outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #fcfcfb; --cds-shortcut-cap-ink #6d6b67; --df-hover #f0efec; --df-nav-scrollbar-lane (unset); --df-radius-pill 8px; --df-row-ctl 24px; --df-row-font 14px; --df-row-gap 8px |
| How | at rest |

Crops: `sidebar-default.png`, `sidebar-light.png`.

#### sidebar-titlebar

Sidebar title row. 44 tall: the "Claude" serif wordmark at the start, Hide sidebar and Search icon buttons at the end.

Copy: `home-dark`. Finder: `() => Q('aside .df-titlebar')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 287 x 44 |
| Padding | 4px 8px 0px 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #c3c2b7 |
| Transition | none |
| Icon | 68.33 x 20, colour #f0efec |
| Painted layers | a.flex.items-center 68.3x20.0 outline 2px solid #5598e7 @ 0 offset 2px |
| Ancestor paint | 1 up aside.dframe-sidebar bg #111111 |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #151515 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 287 x 44 |
| Padding | 4px 8px 0px 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #52514e |
| Transition | none |
| Icon | 68.33 x 20, colour #0b0b0b |
| Painted layers | a.flex.items-center 68.3x20.0 outline 2px solid #256abf @ 0 offset 2px |
| Ancestor paint | 1 up aside.dframe-sidebar bg #fbfbf9 |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #fcfcfb |
| How | at rest |

Crops: `sidebar-titlebar-default.png`, `sidebar-titlebar-light.png`.

#### sidebar-wordmark

Claude wordmark. An inline SVG, 68x20, in the text colour.

Copy: `home-dark`. Finder: `() => Q('aside a[aria-label=Home]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 68.33 x 20 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | 2px solid #5598e7 @ 0 offset 2px | = |
| Font | anthropic-sans 14px/21px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 68.33 x 20, colour #f0efec | = |
| Painted layers | a.flex.items-center 68.3x20.0 outline 2px solid #5598e7 @ 0 offset 2px | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 68.33 x 20 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | 2px solid #256abf @ 0 offset 2px | = |
| Font | anthropic-sans 14px/21px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Transition | none | = |
| Cursor | pointer | = |
| Icon | 68.33 x 20, colour #0b0b0b | = |
| Painted layers | a.flex.items-center 68.3x20.0 outline 2px solid #256abf @ 0 offset 2px | = |
| How | at rest | mouse hover |

Crops: `sidebar-wordmark-default.png`, `sidebar-wordmark-hover.png`, `sidebar-wordmark-light.png`, `sidebar-wordmark-light-hover.png`.

#### sidebar-icon-button

Sidebar icon button (Hide sidebar). A cds Button, ghost, 32x32 with a 16px glyph from the Anthropicons icon font.

Copy: `home-dark`. Finder: `() => Q('aside button[aria-label="Hide sidebar"]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #c3c2b7 | #ffffff | = |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #c3c2b7 | span: Anthropicons-Variable 16px/16px 533.25, #ffffff | = |
| Transition | none | = | outline 0.2s ease |
| Cursor | pointer | = | = |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #151515 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #ffffff @ 0.075 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #52514e | #0b0b0b | = |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #52514e | span: Anthropicons-Variable 16px/16px 533.25, #0b0b0b | = |
| Transition | none | = | outline 0.2s ease |
| Cursor | pointer | = | = |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #fcfcfb | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #f0efec r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |

Crops: `sidebar-icon-button-default.png`, `sidebar-icon-button-hover.png`, `sidebar-icon-button-focus-visible.png`, `sidebar-icon-button-light.png`, `sidebar-icon-button-light-hover.png`, `sidebar-icon-button-light-focus-visible.png`.

#### sidebar-search-button

Sidebar Search button.

Copy: `home-dark`. Finder: `() => Q('aside button[aria-label=Search]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #c3c2b7 | #ffffff |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #c3c2b7 | span: Anthropicons-Variable 16px/16px 533.25, #ffffff |
| Transition | none | = |
| Cursor | pointer | = |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #151515 | = |
| How | at rest | mouse hover |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #ffffff @ 0.075 r 8px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #52514e | #0b0b0b |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #52514e | span: Anthropicons-Variable 16px/16px 533.25, #0b0b0b |
| Transition | none | = |
| Cursor | pointer | = |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #fcfcfb | = |
| How | at rest | mouse hover |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #f0efec r 8px |

Crops: `sidebar-search-button-default.png`, `sidebar-search-button-hover.png`, `sidebar-search-button-light.png`, `sidebar-search-button-light-hover.png`.

#### mode-pills

Home/Code segmented control. Two pills (Home, Code) in a track the full width of the sidebar; a sliding indicator sits under the active one.

Copy: `home-dark`. Finder: `() => Q('aside .df-pills')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 271 x 32 |
| Padding | 1px |
| Gap | 0px |
| Border | none |
| Radius | 8px |
| Background | #ffffff @ 0.06 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: Anthropicons-Variable 16px/16px 700, #f0efec |
| Transition | none |
| Painted layers | div.df-pills.static-composer-boot-fade 271.0x32.0 bg #ffffff @ 0.06 r 8px; div.df-pill-indicator 136.0x30.0 bg #ffffff @ 0.1 r 7px shadow #ffffff @ 0.08 0px 0px 0px 0.5px inset, #000000 @ 0.3 0px 1px 2px 0px, #000000 @ 0.25 0px 2px 6px -1px; button.df-pill.hide-focus-ring 136.1x30.0 r 6px outline 2px solid #5598e7 @ 0 offset 2px; button.df-pill.hide-focus-ring 132.9x30.0 r 6px outline 2px solid #5598e7 @ 0 offset 2px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 271 x 32 |
| Padding | 1px |
| Gap | 0px |
| Border | none |
| Radius | 8px |
| Background | #edece8 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: Anthropicons-Variable 16px/16px 700, #0b0b0b |
| Transition | none |
| Painted layers | div.df-pills.static-composer-boot-fade 271.0x32.0 bg #edece8 r 8px; div.df-pill-indicator 136.0x30.0 bg #f9f9f7 r 7px shadow #0b0b0b @ 0.1 0px 0px 0px 0.5px inset, #000000 @ 0.06 0px 1px 2px 0px, #000000 @ 0.05 0px 2px 6px -1px; button.df-pill.hide-focus-ring 136.1x30.0 r 6px outline 2px solid #256abf @ 0 offset 2px; button.df-pill.hide-focus-ring 132.9x30.0 r 6px outline 2px solid #256abf @ 0 offset 2px |
| How | at rest |

Crops: `mode-pills-default.png`, `mode-pills-light.png`.

#### mode-pill

Mode pill.

Copy: `home-dark`. Finder: `() => Q('aside .df-pill:not([data-active])')`.

Dark theme.

| Property | default | hover | focus-visible | active |
|---|---|---|---|---|
| Size (w x h) | 132.89 x 30 | = | = | 136.11 x 30 |
| Padding | 0px 4px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | 6px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px | = |
| Outline | 2px solid #5598e7 @ 0 offset 2px | = | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #898781 | #f0efec | #f0efec | #f0efec |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #898781 | span: Anthropicons-Variable 16px/16px 533.25, #f0efec | span: Anthropicons-Variable 16px/16px 533.25, #f0efec | span: Anthropicons-Variable 16px/16px 700, #f0efec |
| Transition | box-shadow 0.06s ease | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button.df-pill.hide-focus-ring 132.9x30.0 r 6px outline 2px solid #5598e7 @ 0 offset 2px | = | button.df-pill.hide-focus-ring 132.9x30.0 r 6px shadow #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px outline 2px solid #5598e7 @ 0 offset 2px | button.df-pill.hide-focus-ring 136.1x30.0 r 6px outline 2px solid #5598e7 @ 0 offset 2px |
| Ancestor paint | 1 up div.df-pills.static-composer-boot-fade bg #ffffff @ 0.06 | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured active |

Light theme.

| Property | light | light-hover | light-focus-visible | light-active |
|---|---|---|---|---|
| Size (w x h) | 132.89 x 30 | = | = | 136.11 x 30 |
| Padding | 0px 4px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | 6px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px | = |
| Outline | 2px solid #256abf @ 0 offset 2px | = | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #898781 | #0b0b0b | #0b0b0b | #0b0b0b |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #898781 | span: Anthropicons-Variable 16px/16px 533.25, #0b0b0b | span: Anthropicons-Variable 16px/16px 533.25, #0b0b0b | span: Anthropicons-Variable 16px/16px 700, #0b0b0b |
| Transition | box-shadow 0.06s ease | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button.df-pill.hide-focus-ring 132.9x30.0 r 6px outline 2px solid #256abf @ 0 offset 2px | = | button.df-pill.hide-focus-ring 132.9x30.0 r 6px shadow #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px outline 2px solid #256abf @ 0 offset 2px | button.df-pill.hide-focus-ring 136.1x30.0 r 6px outline 2px solid #256abf @ 0 offset 2px |
| Ancestor paint | 1 up div.df-pills.static-composer-boot-fade bg #edece8 | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured active |

Other finders: active: `() => Q('aside .df-pill[data-active=true]')`; light-active: `() => Q('aside .df-pill[data-active=true]')`.

Crops: `mode-pill-default.png`, `mode-pill-hover.png`, `mode-pill-focus-visible.png`, `mode-pill-active.png`, `mode-pill-light.png`, `mode-pill-light-hover.png`, `mode-pill-light-focus-visible.png`, `mode-pill-light-active.png`.

#### mode-pill-indicator

Mode pill indicator.

Copy: `home-dark`. Finder: `() => Q('aside .df-pill-indicator')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 136 x 30 |
| Padding | 0px |
| Border | none |
| Radius | 7px |
| Background | #ffffff @ 0.1 |
| Box shadow | #ffffff @ 0.08 0px 0px 0px 0.5px inset, #000000 @ 0.3 0px 1px 2px 0px, #000000 @ 0.25 0px 2px 6px -1px |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | background-color 0.3s cubic-bezier(0.32, 0.72, 0, 1) |
| Transform | matrix(1, 0, 0, 1, 1, 0) |
| Painted layers | div.df-pill-indicator 136.0x30.0 bg #ffffff @ 0.1 r 7px shadow #ffffff @ 0.08 0px 0px 0px 0.5px inset, #000000 @ 0.3 0px 1px 2px 0px, #000000 @ 0.25 0px 2px 6px -1px |
| Ancestor paint | 1 up div.df-pills.static-composer-boot-fade bg #ffffff @ 0.06 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 136 x 30 |
| Padding | 0px |
| Border | none |
| Radius | 7px |
| Background | #f9f9f7 |
| Box shadow | #0b0b0b @ 0.1 0px 0px 0px 0.5px inset, #000000 @ 0.06 0px 1px 2px 0px, #000000 @ 0.05 0px 2px 6px -1px |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | background-color 0.3s cubic-bezier(0.32, 0.72, 0, 1) |
| Transform | matrix(1, 0, 0, 1, 1, 0) |
| Painted layers | div.df-pill-indicator 136.0x30.0 bg #f9f9f7 r 7px shadow #0b0b0b @ 0.1 0px 0px 0px 0.5px inset, #000000 @ 0.06 0px 1px 2px 0px, #000000 @ 0.05 0px 2px 6px -1px |
| Ancestor paint | 1 up div.df-pills.static-composer-boot-fade bg #edece8 |
| How | at rest |

Crops: `mode-pill-indicator-default.png`, `mode-pill-indicator-light.png`.

#### nav-new-row

New row. The first nav row: a 22px circle with a plus, "New", the ⇧⌘O shortcut, and a Quick task button at the end.

Copy: `home-dark`. Finder: `() => C(T('New', S()), 'div.group')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 271 x 32 | = | = |
| Padding | 0px 0px 0px 2px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | #ffffff @ 0.15 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span.text-secondary: Anthropicons-Variable 16px/16px 700, #f0efec | = | = |
| Transition | none | = | = |
| Painted layers | div.group.mt-1.flex 271.0x32.0 bg #ffffff @ 0.15 r 8px; a.flex.h-full.min-w-0 237.0x32.0 outline 2px solid #5598e7 @ 0 offset 2px | = | div.group.mt-1.flex 271.0x32.0 bg #ffffff @ 0.15 r 8px; a.flex.h-full.min-w-0 237.0x32.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #151515; --cds-shortcut-cap-ink #a5a49a; --df-hover hsl(from #fff h s l / 7.5%); --df-radius-pill 8px; --df-row-ctl 24px; --df-row-font 14px; --df-row-gap 8px; --df-row-h 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 271 x 32 | = | = |
| Padding | 0px 0px 0px 2px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | #edece8 | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span.text-secondary: Anthropicons-Variable 16px/16px 700, #0b0b0b | = | = |
| Transition | none | = | = |
| Painted layers | div.group.mt-1.flex 271.0x32.0 bg #edece8 r 8px; a.flex.h-full.min-w-0 237.0x32.0 outline 2px solid #256abf @ 0 offset 2px | = | div.group.mt-1.flex 271.0x32.0 bg #edece8 r 8px; a.flex.h-full.min-w-0 237.0x32.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #fcfcfb; --cds-shortcut-cap-ink #6d6b67; --df-hover #f0efec; --df-radius-pill 8px; --df-row-ctl 24px; --df-row-font 14px; --df-row-gap 8px; --df-row-h 32px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Crops: `nav-new-row-default.png`, `nav-new-row-hover.png`, `nav-new-row-focus-visible.png`, `nav-new-row-light.png`, `nav-new-row-light-hover.png`, `nav-new-row-light-focus-visible.png`.

#### nav-new-circle

New row circle.

Copy: `home-dark`. Finder: `() => Q('aside .df-new-circle')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 22 x 22 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 3.35544e+07px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/21px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Text node | span.text-secondary: Anthropicons-Variable 16px/16px 700, #f0efec | = |
| Transition | none | = |
| Cursor | pointer | = |
| Ancestor paint | 2 up a.flex.h-full.min-w-0 outline 2px solid #5598e7 @ 0 | = |
| How | at rest | mouse hover on its row |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 22 x 22 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 3.35544e+07px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/21px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Text node | span.text-secondary: Anthropicons-Variable 16px/16px 700, #0b0b0b | = |
| Transition | none | = |
| Cursor | pointer | = |
| Ancestor paint | 2 up a.flex.h-full.min-w-0 outline 2px solid #256abf @ 0 | = |
| How | at rest | mouse hover on its row |

Crops: `nav-new-circle-default.png`, `nav-new-circle-hover.png`, `nav-new-circle-light.png`, `nav-new-circle-light-hover.png`.

#### nav-shortcut

Shortcut hint. cds Shortcut, text variant: each key a <kbd> in caption size; held at opacity 0 until its row is hovered.

Copy: `home-dark`. Finder: `() => document.querySelector('aside [data-cds=Shortcut]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 39.78 x 12 | = |
| Padding | 0px | = |
| Gap | 3.6px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 12px/12px 400 | = |
| Letter spacing | normal | = |
| Colour | #898781 | = |
| Text node | span: anthropic-sans 12px/12px 400, #898781 | = |
| Transition | none | = |
| Opacity | 0 | - |
| Cursor | pointer | = |
| Ancestor paint | 1 up a.flex.h-full.min-w-0 outline 2px solid #5598e7 @ 0 | = |
| Tokens | --cds-shortcut-cap-ink currentColor; --df-radius-pill 8px | = |
| How | at rest | mouse hover on its row |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 39.8 x 12 | = |
| Padding | 0px | = |
| Gap | 3.6px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 12px/12px 400 | = |
| Letter spacing | normal | = |
| Colour | #898781 | = |
| Text node | span: anthropic-sans 12px/12px 400, #898781 | = |
| Transition | none | = |
| Opacity | 0 | - |
| Cursor | pointer | = |
| Ancestor paint | 1 up a.flex.h-full.min-w-0 outline 2px solid #256abf @ 0 | = |
| Tokens | --cds-shortcut-cap-ink currentColor; --df-radius-pill 8px | = |
| How | at rest | mouse hover on its row |

Crops: `nav-shortcut-default.png`, `nav-shortcut-hover.png`, `nav-shortcut-light.png`, `nav-shortcut-light-hover.png`.

#### nav-row

Nav row (Artifacts). 32 tall (--df-row-h), radius 8 (--df-radius-pill), a 20px glyph in a 28px leading slot, 14px text in text-secondary; hover fills --df-hover.

Copy: `home-dark`. Finder: `() => C(T('Artifacts', S()), 'div.group')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 271 x 32 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.075 | #ffffff @ 0.075 |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #c3c2b7 | = | = |
| Transition | none | = | = |
| Painted layers | a.w-full.shrink-0.border-none 271.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px | div.group.relative 271.0x32.0 bg #ffffff @ 0.075 r 8px; a.w-full.shrink-0.border-none 271.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px | div.group.relative 271.0x32.0 bg #ffffff @ 0.075 r 8px; a.w-full.shrink-0.border-none 271.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #151515; --df-hover hsl(from #fff h s l / 7.5%); --df-radius-pill 8px; --df-row-ctl 24px; --df-row-font 14px; --df-row-gap 8px; --df-row-h 32px; --df-row-px 2px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 271 x 32 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #f0efec | #f0efec |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #52514e | = | = |
| Transition | none | = | = |
| Painted layers | a.w-full.shrink-0.border-none 271.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px | div.group.relative 271.0x32.0 bg #f0efec r 8px; a.w-full.shrink-0.border-none 271.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px | div.group.relative 271.0x32.0 bg #f0efec r 8px; a.w-full.shrink-0.border-none 271.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #fcfcfb; --df-hover #f0efec; --df-radius-pill 8px; --df-row-ctl 24px; --df-row-font 14px; --df-row-gap 8px; --df-row-h 32px; --df-row-px 2px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Crops: `nav-row-default.png`, `nav-row-hover.png`, `nav-row-focus-visible.png`, `nav-row-light.png`, `nav-row-light-hover.png`, `nav-row-light-focus-visible.png`.

#### nav-row-more

More row.

Copy: `home-dark`, `artifacts-dark-more-menu`. Finder: `() => Q('aside button[aria-label="More navigation items"]')`.

Dark theme.

| Property | default | hover | focus-visible | open |
|---|---|---|---|---|
| Size (w x h) | 271 x 32 | = | = | = |
| Padding | 0px 2px | = | = | = |
| Gap | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #ffffff @ 0.075 | #ffffff @ 0.075 | #ffffff @ 0.075 |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px | = |
| Outline | 2px solid #5598e7 @ 0 offset 2px | = | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #c3c2b7 | = | = | = |
| Text node | span.opacity-50: Anthropicons-Variable 20px/20px 433.25, #c3c2b7 | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button.w-full.shrink-0.border-none 271.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px | button.w-full.shrink-0.border-none 271.0x32.0 bg #ffffff @ 0.075 r 8px outline 2px solid #5598e7 @ 0 offset 2px | button.w-full.shrink-0.border-none 271.0x32.0 bg #ffffff @ 0.075 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px outline 2px solid #5598e7 @ 0 offset 2px | button.w-full.shrink-0.border-none 271.0x32.0 bg #ffffff @ 0.075 r 8px outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-fill-accent #2a78d6; --df-hover hsl(from #fff h s l / 7.5%); --df-radius-pill 8px; --df-row-font 14px; --df-row-gap 8px; --df-row-h 32px; --df-row-px 2px; --df-selected hsl(from #fff h s l / 15%) | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |

Light theme.

| Property | light | light-hover | light-focus-visible | light-open |
|---|---|---|---|---|
| Size (w x h) | 271 x 32 | = | = | = |
| Padding | 0px 2px | = | = | = |
| Gap | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #f0efec | #f0efec | #f0efec |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px | = |
| Outline | 2px solid #256abf @ 0 offset 2px | = | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #52514e | = | = | = |
| Text node | span.opacity-50: Anthropicons-Variable 20px/20px 433.25, #52514e | = | = | = |
| Transition | none | = | = | = |
| Cursor | pointer | = | = | = |
| Painted layers | button.w-full.shrink-0.border-none 271.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px | button.w-full.shrink-0.border-none 271.0x32.0 bg #f0efec r 8px outline 2px solid #256abf @ 0 offset 2px | button.w-full.shrink-0.border-none 271.0x32.0 bg #f0efec r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px outline 2px solid #256abf @ 0 offset 2px | button.w-full.shrink-0.border-none 271.0x32.0 bg #f0efec r 8px outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-fill-accent #2a78d6; --df-hover #f0efec; --df-radius-pill 8px; --df-row-font 14px; --df-row-gap 8px; --df-row-h 32px; --df-row-px 2px; --df-selected #edece8 | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |

Other finders: open: `() => Q('aside button[aria-label="More navigation items"]')`; light-open: `() => Q('aside button[aria-label="More navigation items"]')`.

Crops: `nav-row-more-default.png`, `nav-row-more-hover.png`, `nav-row-more-focus-visible.png`, `nav-row-more-open.png`, `nav-row-more-light.png`, `nav-row-more-light-hover.png`, `nav-row-more-light-focus-visible.png`, `nav-row-more-light-open.png`.

#### section-label

Section label (Pinned). Caption-size text in text-muted with a caret that shows on hover.

Copy: `home-dark`. Finder: `() => C(T('Pinned', S()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 265 x 24 | = | = |
| Padding | 4px 0px 4px 4px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px |
| Outline | 2px solid #5598e7 @ 0 offset 2px | = | = |
| Font | anthropic-sans 13px/16px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #898781 | #c3c2b7 | = |
| Text node | span.min-w-0.truncate: anthropic-sans 13px/16px 400, #898781 | span.min-w-0.truncate: anthropic-sans 13px/16px 400, #c3c2b7 | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.hide-focus-ring.group/label.-my-1 265.0x24.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px | = | button.hide-focus-ring.group/label.-my-1 265.0x24.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-fill-accent #2a78d6; --df-radius-pill 8px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 265 x 24 | = | = |
| Padding | 4px 0px 4px 4px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px |
| Outline | 2px solid #256abf @ 0 offset 2px | = | = |
| Font | anthropic-sans 13px/16px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #898781 | #52514e | = |
| Text node | span.min-w-0.truncate: anthropic-sans 13px/16px 400, #898781 | span.min-w-0.truncate: anthropic-sans 13px/16px 400, #52514e | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.hide-focus-ring.group/label.-my-1 265.0x24.0 r 8px outline 2px solid #256abf @ 0 offset 2px | = | button.hide-focus-ring.group/label.-my-1 265.0x24.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #2a78d6 0px 0px 0px 1px inset, #2a78d6 @ 0.2 0px 0px 6px 0px outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-fill-accent #2a78d6; --df-radius-pill 8px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `section-label-default.png`, `section-label-hover.png`, `section-label-focus-visible.png`, `section-label-light.png`, `section-label-light-hover.png`, `section-label-light-focus-visible.png`.

#### section-action

Section action button (View all). Revealed when its section label row is hovered.

Copy: `home-dark`. Finder: `() => document.querySelector('aside button[aria-label="View all"]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 24 x 24 | = |
| Padding | 0px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 13px/19px 400 | = |
| Letter spacing | normal | = |
| Colour | #c3c2b7 | = |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #c3c2b7 | = |
| Transition | none | = |
| Opacity | 0 | = |
| Cursor | pointer | = |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #151515 | = |
| How | at rest | mouse hover on its row |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 24 x 24 | = |
| Padding | 0px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 6px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 13px/19px 400 | = |
| Letter spacing | normal | = |
| Colour | #52514e | = |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #52514e | = |
| Transition | none | = |
| Opacity | 0 | = |
| Cursor | pointer | = |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #fcfcfb | = |
| How | at rest | mouse hover on its row |

Crops: `section-action-default.png`, `section-action-hover.png`, `section-action-light.png`, `section-action-light-hover.png`.

#### chat-row

Chat row. A 6px hollow ring as the bullet (role=img "Idle"), the title faded at the end (.dframe-fade-label, a mask, not an ellipsis), a more button on hover.

Copy: `home-dark`, `thread-dark`. Finder: `() => C(T('MapReduce intuition explained', S()), 'div.group')`.

Dark theme.

| Property | default | hover | pinned | selected |
|---|---|---|---|---|
| Size (w x h) | 271 x 32 | = | = | = |
| Padding | 0px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #ffffff @ 0.075 | = | #ffffff @ 0.15 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #f0efec | = | = | = |
| Text node | span.inline-block.whitespace-nowrap.align-top: anthropic-sans 14px/21px 400, #c3c2b7 | = | = | span.inline-block.whitespace-nowrap.align-top: anthropic-sans 14px/21px 400, #f0efec |
| Transition | none | = | = | = |
| Painted layers | a.w-full.shrink-0.border-none 271.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px; span.block.rounded-full.border 6.0x6.0 border T:1px solid #898781 / R:1px solid #898781 / B:1px solid #898781 / L:1px solid #898781 r 3.35544e+07px opacity 0.5 | div.group.relative 271.0x32.0 bg #ffffff @ 0.075 r 8px; a.w-full.shrink-0.border-none 271.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px; span.block.rounded-full.border 6.0x6.0 border T:1px solid #898781 / R:1px solid #898781 / B:1px solid #898781 / L:1px solid #898781 r 3.35544e+07px opacity 0.5 | = | div.group.relative 271.0x32.0 bg #ffffff @ 0.15 r 8px; a.w-full.shrink-0.border-none 271.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px; span.block.rounded-full.border 6.0x6.0 border T:1px solid #898781 / R:1px solid #898781 / B:1px solid #898781 / L:1px solid #898781 r 3.35544e+07px opacity 0.5 |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #151515; --df-hover hsl(from #fff h s l / 7.5%); --df-radius-pill 8px; --df-row-ctl 24px; --df-row-font 14px; --df-row-gap 8px; --df-row-h 32px; --df-row-indent 0px | = | = | = |
| How | at rest | mouse hover | at rest, captured pinned | at rest, captured selected |

Light theme.

| Property | light | light-hover | light-pinned | light-selected |
|---|---|---|---|---|
| Size (w x h) | 271 x 32 | = | = | = |
| Padding | 0px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #f0efec | = | #edece8 |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #0b0b0b | = | = | = |
| Text node | span.inline-block.whitespace-nowrap.align-top: anthropic-sans 14px/21px 400, #52514e | = | = | span.inline-block.whitespace-nowrap.align-top: anthropic-sans 14px/21px 400, #0b0b0b |
| Transition | none | = | = | = |
| Painted layers | a.w-full.shrink-0.border-none 271.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px; span.block.rounded-full.border 6.0x6.0 border T:1px solid #898781 / R:1px solid #898781 / B:1px solid #898781 / L:1px solid #898781 r 3.35544e+07px opacity 0.5 | div.group.relative 271.0x32.0 bg #f0efec r 8px; a.w-full.shrink-0.border-none 271.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px; span.block.rounded-full.border 6.0x6.0 border T:1px solid #898781 / R:1px solid #898781 / B:1px solid #898781 / L:1px solid #898781 r 3.35544e+07px opacity 0.5 | = | div.group.relative 271.0x32.0 bg #edece8 r 8px; a.w-full.shrink-0.border-none 271.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px; span.block.rounded-full.border 6.0x6.0 border T:1px solid #898781 / R:1px solid #898781 / B:1px solid #898781 / L:1px solid #898781 r 3.35544e+07px opacity 0.5 |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #fcfcfb; --df-hover #f0efec; --df-radius-pill 8px; --df-row-ctl 24px; --df-row-font 14px; --df-row-gap 8px; --df-row-h 32px; --df-row-indent 0px | = | = | = |
| How | at rest | mouse hover | at rest, captured pinned | at rest, captured selected |

Other finders: pinned: `() => C(T('calendar-helper', S()), 'div.group')`; selected: `() => C(T("Documenting Linear's design system", S()), 'div.group')`; light-selected: `() => C(T("Documenting Linear's design system", S()), 'div.group')`; light-pinned: `() => C(T('calendar-helper', S()), 'div.group')`.

Crops: `chat-row-default.png`, `chat-row-hover.png`, `chat-row-pinned.png`, `chat-row-selected.png`, `chat-row-light.png`, `chat-row-light-hover.png`, `chat-row-light-pinned.png`, `chat-row-light-selected.png`.

#### chat-row-bullet

Chat row bullet.

Copy: `home-dark`. Finder: `() => Q('aside [aria-label=Idle] span')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 6 x 6 |
| Padding | 0px |
| Border | 1px solid #898781 |
| Radius | 3.35544e+07px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Opacity | 0.5 |
| Cursor | pointer |
| Painted layers | span.block.rounded-full.border 6.0x6.0 border T:1px solid #898781 / R:1px solid #898781 / B:1px solid #898781 / L:1px solid #898781 r 3.35544e+07px opacity 0.5 |
| Ancestor paint | 3 up a.w-full.shrink-0.border-none outline 2px solid #5598e7 @ 0 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 6 x 6 |
| Padding | 0px |
| Border | 1px solid #898781 |
| Radius | 3.35544e+07px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Opacity | 0.5 |
| Cursor | pointer |
| Painted layers | span.block.rounded-full.border 6.0x6.0 border T:1px solid #898781 / R:1px solid #898781 / B:1px solid #898781 / L:1px solid #898781 r 3.35544e+07px opacity 0.5 |
| Ancestor paint | 3 up a.w-full.shrink-0.border-none outline 2px solid #256abf @ 0 |
| How | at rest |

Crops: `chat-row-bullet-default.png`, `chat-row-bullet-light.png`.

#### chat-row-more

Chat row more button.

Copy: `home-dark`, `home-dark-chat-menu`. Finder: `() => document.querySelector('aside button[aria-label^="More options for MapReduce"]')`.

Dark theme.

| Property | default | hover | open |
|---|---|---|---|
| Size (w x h) | 24 x 24 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 6px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-sans 13px/19px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #c3c2b7 | = | #f0efec |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #c3c2b7 | = | span: Anthropicons-Variable 16px/16px 533.25, #f0efec |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #151515; --df-row-ctl 24px | = | = |
| How | at rest | mouse hover on its row | at rest, captured open |
| Painted layers | - | = | span.absolute.inset-0.duration-fast 24.0x24.0 bg #ffffff @ 0.075 r 6px |

Light theme.

| Property | light | light-hover | light-open |
|---|---|---|---|
| Size (w x h) | 24 x 24 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 6px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-sans 13px/19px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #52514e | = | #0b0b0b |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #52514e | = | span: Anthropicons-Variable 16px/16px 533.25, #0b0b0b |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| Cursor | pointer | = | = |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #fcfcfb; --df-row-ctl 24px | = | = |
| How | at rest | mouse hover on its row | at rest, captured open |
| Painted layers | - | = | span.absolute.inset-0.duration-fast 24.0x24.0 bg #0b0b0b @ 0.05 r 6px |

Other finders: open: `() => document.querySelector('aside button[aria-label^="More options for"][aria-expanded=true]') // document.querySelector('aside button[data-popup-open]')`; light-open: `() => document.querySelector('aside button[aria-label^="More options for"][aria-expanded=true]') // document.querySelector('aside button[data-popup-open]')`.

Crops: `chat-row-more-default.png`, `chat-row-more-hover.png`, `chat-row-more-open.png`, `chat-row-more-light.png`, `chat-row-more-light-hover.png`, `chat-row-more-light-open.png`.

#### account-row

Account row. Avatar, name, a dot and the plan ("Max") in text-muted, a chevron.

Copy: `home-dark`, `home-dark-user-menu`. Finder: `() => Q('[data-testid=user-menu-button]')`.

Dark theme.

| Property | default | hover | focus-visible | open |
|---|---|---|---|---|
| Size (w x h) | 164.11 x 32 | = | = | = |
| Padding | 0px 8px 0px 2px | = | = | = |
| Gap | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #ffffff @ 0.075 | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px | = |
| Outline | none | = | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #f0efec | = | = | = |
| Text node | span.whitespace-nowrap.text-secondary.max-w-full: anthropic-sans 14px/21px 400, #c3c2b7 | = | = | = |
| Transition | none | = | outline 0.2s ease | = |
| Cursor | pointer | = | = | = |
| Painted layers | span.inline-flex.shrink-0.select-none 24.0x24.0 bg #ffffff @ 0.1 r 3.35544e+07px | button.df-user-menu-btn.cds-reset.flex 164.1x32.0 bg #ffffff @ 0.075 r 8px; span.inline-flex.shrink-0.select-none 24.0x24.0 bg #ffffff @ 0.1 r 3.35544e+07px | button.df-user-menu-btn.cds-reset.flex 164.1x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.inline-flex.shrink-0.select-none 24.0x24.0 bg #ffffff @ 0.1 r 3.35544e+07px | = |
| Tokens | --cds-avatar-sm calc(1.5rem * 1); --cds-rem-scale (unset); --df-footer-btn-size 32px; --df-hover hsl(from #fff h s l / 7.5%); --df-leading-slot 28px; --df-radius-pill 8px; --df-row-font 14px; --df-row-gap 8px; --df-row-px 2px | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |

Light theme.

| Property | light | light-hover | light-focus-visible | light-open |
|---|---|---|---|---|
| Size (w x h) | 164.84 x 32 | = | = | = |
| Padding | 0px 8px 0px 2px | = | = | = |
| Gap | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | #f0efec | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px | = |
| Outline | none | = | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #0b0b0b | = | = | = |
| Text node | span.whitespace-nowrap.text-secondary.max-w-full: anthropic-sans 14px/21px 400, #52514e | = | = | = |
| Transition | none | = | outline 0.2s ease | = |
| Cursor | pointer | = | = | = |
| Painted layers | span.inline-flex.shrink-0.select-none 24.0x24.0 bg #0b0b0b @ 0.1 r 3.35544e+07px | button.df-user-menu-btn.cds-reset.flex 164.8x32.0 bg #f0efec r 8px; span.inline-flex.shrink-0.select-none 24.0x24.0 bg #0b0b0b @ 0.1 r 3.35544e+07px | button.df-user-menu-btn.cds-reset.flex 164.8x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.inline-flex.shrink-0.select-none 24.0x24.0 bg #0b0b0b @ 0.1 r 3.35544e+07px | = |
| Tokens | --cds-avatar-sm calc(1.5rem * 1); --cds-rem-scale (unset); --df-footer-btn-size 32px; --df-hover #f0efec; --df-leading-slot 28px; --df-radius-pill 8px; --df-row-font 14px; --df-row-gap 8px; --df-row-px 2px | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |

Other finders: open: `() => Q('[data-testid=user-menu-button]')`; light-open: `() => Q('[data-testid=user-menu-button]')`.

Crops: `account-row-default.png`, `account-row-hover.png`, `account-row-focus-visible.png`, `account-row-open.png`, `account-row-light.png`, `account-row-light-hover.png`, `account-row-light-focus-visible.png`, `account-row-light-open.png`.

#### account-avatar

Avatar.

Copy: `home-dark`. Finder: `() => Q('aside [data-cds=Avatar]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 24 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 3.35544e+07px |
| Background | #ffffff @ 0.1 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 9px/13.5px 500 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none |
| Cursor | pointer |
| Painted layers | span.inline-flex.shrink-0.select-none 24.0x24.0 bg #ffffff @ 0.1 r 3.35544e+07px |
| Tokens | --cds-avatar-sm calc(1.5rem * 1); --cds-rem-scale (unset) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 24 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 3.35544e+07px |
| Background | #0b0b0b @ 0.1 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 9px/13.5px 500 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none |
| Cursor | pointer |
| Painted layers | span.inline-flex.shrink-0.select-none 24.0x24.0 bg #0b0b0b @ 0.1 r 3.35544e+07px |
| Tokens | --cds-avatar-sm calc(1.5rem * 1); --cds-rem-scale (unset) |
| How | at rest |

Crops: `account-avatar-default.png`, `account-avatar-light.png`.

#### account-plan

Plan label.

Copy: `home-dark`. Finder: `() => T('Max', S())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 24.42 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 12px/18px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 24.69 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 12px/18px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Cursor | pointer |
| How | at rest |

Crops: `account-plan-default.png`, `account-plan-light.png`.

#### footer-apps-button

Get apps button.

Copy: `home-dark`. Finder: `() => Q('aside a[aria-label="Get apps and extensions"]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #c3c2b7 | #ffffff | = |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #c3c2b7 | span: Anthropicons-Variable 16px/16px 533.25, #ffffff | = |
| Transition | none | = | outline 0.2s ease |
| Cursor | pointer | = | = |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #151515 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #ffffff @ 0.075 r 8px | a.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #52514e | #0b0b0b | = |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #52514e | span: Anthropicons-Variable 16px/16px 533.25, #0b0b0b | = |
| Transition | none | = | outline 0.2s ease |
| Cursor | pointer | = | = |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #fcfcfb | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #f0efec r 8px | a.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |

Crops: `footer-apps-button-default.png`, `footer-apps-button-hover.png`, `footer-apps-button-focus-visible.png`, `footer-apps-button-light.png`, `footer-apps-button-light-hover.png`, `footer-apps-button-light-focus-visible.png`.

#### resize-handle

Sidebar resize handle.

Copy: `home-dark`. Finder: `() => Q('[data-cds=ResizeHandle]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 12 x 900 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/21px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Transition | none | = |
| Cursor | col-resize | = |
| Painted layers | div.absolute.top-1/2.left-1/2 3.0x48.0 bg #898781 r 3.35544e+07px opacity 0 | div.absolute.top-1/2.left-1/2 3.0x48.0 bg #898781 r 3.35544e+07px |
| Ancestor paint | 1 up aside.dframe-sidebar bg #111111 | = |
| Tokens | --cds-resize-pill-force (unset); --cds-ring-inner 0px; --cds-ring-outer .5px | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 12 x 900 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/21px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Transition | none | = |
| Cursor | col-resize | = |
| Painted layers | div.absolute.top-1/2.left-1/2 3.0x48.0 bg #898781 r 3.35544e+07px opacity 0 | div.absolute.top-1/2.left-1/2 3.0x48.0 bg #898781 r 3.35544e+07px |
| Ancestor paint | 1 up aside.dframe-sidebar bg #fbfbf9 | = |
| Tokens | --cds-resize-pill-force (unset); --cds-ring-inner 0px; --cds-ring-outer .5px | = |
| How | at rest | mouse hover |

Crops: none.

#### sidebar-collapsed

Sidebar hidden (the show button). Hidden, the sidebar leaves only a 32x32 box at 8,8 holding the Show sidebar button; the content pane takes the full width.

Copy: `home-dark-sidebar-collapsed`. Finder: `() => S()`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 32 x 32 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.text-secondary: Anthropicons-Variable 16px/16px 533.25, #c3c2b7 |
| Transition | none |
| Painted layers | div.dframe-sidebar-body.flex.flex-col 288.0x900.0 bg #20201f border T:1px solid #ffffff @ 0.1 / R:1px solid #ffffff @ 0.1 / B:1px solid #ffffff @ 0.1 / L:1px solid #ffffff @ 0.1 shadow #ffffff @ 0.08 0px 0px 0px 0.5px, #000000 @ 0.4 0px 4px 12px 0px, #000000 @ 0.5 0px 16px 40px 0px opacity 0; div.df-pills.static-composer-boot-fade 270.0x32.0 bg #ffffff @ 0.06 r 8px; div.df-pill-indicator 136.0x30.0 bg #ffffff @ 0.1 r 7px shadow #ffffff @ 0.08 0px 0px 0px 0.5px inset, #000000 @ 0.3 0px 1px 2px 0px, #000000 @ 0.25 0px 2px 6px -1px; button.df-pill.hide-focus-ring 135.6x30.0 r 6px outline 2px solid #5598e7 @ 0 offset 2px; button.df-pill.hide-focus-ring 132.4x30.0 r 6px outline 2px solid #5598e7 @ 0 offset 2px; div.group.mt-1.flex 270.0x32.0 bg #ffffff @ 0.15 r 8px |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #151515; --cds-shortcut-cap-ink #a5a49a; --df-hover hsl(from #fff h s l / 7.5%); --df-nav-scrollbar-lane (unset); --df-radius-pill 8px; --df-row-ctl 24px; --df-row-font 14px; --df-row-gap 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 32 x 32 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.text-secondary: Anthropicons-Variable 16px/16px 533.25, #52514e |
| Transition | none |
| Painted layers | div.dframe-sidebar-body.flex.flex-col 288.0x900.0 bg #ffffff border T:1px solid #0b0b0b @ 0.1 / R:1px solid #0b0b0b @ 0.1 / B:1px solid #0b0b0b @ 0.1 / L:1px solid #0b0b0b @ 0.1 shadow #000000 @ 0.06 0px 0px 0px 0.5px, #000000 @ 0.06 0px 4px 12px 0px, #000000 @ 0.08 0px 16px 40px 0px opacity 0; div.df-pills.static-composer-boot-fade 270.0x32.0 bg #edece8 r 8px; div.df-pill-indicator 136.0x30.0 bg #f9f9f7 r 7px shadow #0b0b0b @ 0.1 0px 0px 0px 0.5px inset, #000000 @ 0.06 0px 1px 2px 0px, #000000 @ 0.05 0px 2px 6px -1px; button.df-pill.hide-focus-ring 135.6x30.0 r 6px outline 2px solid #256abf @ 0 offset 2px; button.df-pill.hide-focus-ring 132.4x30.0 r 6px outline 2px solid #256abf @ 0 offset 2px; div.group.mt-1.flex 270.0x32.0 bg #edece8 r 8px |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #fcfcfb; --cds-shortcut-cap-ink #6d6b67; --df-hover #f0efec; --df-nav-scrollbar-lane (unset); --df-radius-pill 8px; --df-row-ctl 24px; --df-row-font 14px; --df-row-gap 8px |
| How | at rest |

Crops: `sidebar-collapsed-default.png`, `sidebar-collapsed-light.png`.

#### sidebar-show-button

Show sidebar button.

Copy: `home-dark-sidebar-collapsed`. Finder: `() => Q('[data-testid=sidebar-compact-trigger]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 24 x 24 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 6px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 13px/19px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span.text-secondary: Anthropicons-Variable 16px/16px 533.25, #c3c2b7 | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | pointer | = | = |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #151515 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 24.0x24.0 bg #ffffff @ 0.075 r 6px | button.cds-reset.group/btn.relative 24.0x24.0 r 6px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 24.0x24.0 r 6px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 24 x 24 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 6px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 13px/19px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span.text-secondary: Anthropicons-Variable 16px/16px 533.25, #52514e | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | pointer | = | = |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #fcfcfb | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 24.0x24.0 bg #0b0b0b @ 0.05 r 6px | button.cds-reset.group/btn.relative 24.0x24.0 r 6px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 24.0x24.0 r 6px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |

Crops: `sidebar-show-button-default.png`, `sidebar-show-button-hover.png`, `sidebar-show-button-focus-visible.png`, `sidebar-show-button-light.png`, `sidebar-show-button-light-hover.png`, `sidebar-show-button-light-focus-visible.png`.

### Header

#### pane-header

Content pane header. 48 tall (--df-header-h) across the content pane.

Copy: `home-dark`. Finder: `() => Q('header.dframe-header')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 1136 x 48 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none |
| Icon | 20 x 20, colour #f0efec |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 1136 x 48 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none |
| Icon | 20 x 20, colour #0b0b0b |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb |
| How | at rest |

Crops: `pane-header-default.png`, `pane-header-light.png`.

#### pane

Content pane. The content column: it starts 8px past the sidebar and paints nothing itself, so the page shows the app ground (surface-1).

Copy: `home-dark`. Finder: `() => Q('.dframe-pane-primary')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 1136 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.select-none: anthropic-serif 38px/47.5px 300, #f0efec |
| Transition | filter 0.12s ease-out |
| Icon | 20 x 20, colour #f0efec |
| Placeholder | "How can I help you today?" #898781, opacity 1, 15px |
| Painted layers | div.!box-content.flex.flex-col 672.0x120.0 bg #20201f border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px; div.relative.inline-flex.w-fit 119.2x28.0 bg #ffffff @ 0.05 r 7px; div.invisible.absolute.left-0 49.5x26.0 bg #ffffff @ 0.1 r 6px shadow #ffffff @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --app-visual-viewport-height (unset); --band-slot-lift (unset); --cds-cursor-interactive default; --cds-h-control--xs calc(1.5rem * 1); --cds-page-bg #151515; --chorus-composer-lift (unset); --new-page-card-px (unset); --organization-banner-column-height (unset); --prerender-activation-viewport-height (unset) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 1136 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.select-none: anthropic-serif 38px/47.5px 330, #0b0b0b |
| Transition | filter 0.12s ease-out |
| Icon | 20 x 20, colour #0b0b0b |
| Placeholder | "How can I help you today?" #898781, opacity 1, 15px |
| Painted layers | div.!box-content.flex.flex-col 672.0x120.0 bg #ffffff border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px; div.relative.inline-flex.w-fit 119.8x28.0 bg #f6f6f4 r 7px; div.invisible.absolute.left-0 49.5x26.0 bg #ffffff r 6px shadow #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --app-visual-viewport-height (unset); --band-slot-lift (unset); --cds-cursor-interactive default; --cds-h-control--xs calc(1.5rem * 1); --cds-page-bg #fcfcfb; --chorus-composer-lift (unset); --new-page-card-px (unset); --organization-banner-column-height (unset); --prerender-activation-viewport-height (unset) |
| How | at rest |

Crops: `pane-default.png`, `pane-light.png`.

#### incognito-button

Incognito button.

Copy: `home-dark`. Finder: `() => Q('button[aria-label="Use incognito"]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Icon | 20 x 20, colour #f0efec | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #ffffff @ 0.075 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Icon | 20 x 20, colour #0b0b0b | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #0b0b0b @ 0.05 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |

Crops: `incognito-button-default.png`, `incognito-button-hover.png`, `incognito-button-focus-visible.png`, `incognito-button-light.png`, `incognito-button-light-hover.png`, `incognito-button-light-focus-visible.png`.

#### chat-title-button

Chat title button.

Copy: `thread-dark`. Finder: `() => Q('[data-testid=chat-title-split] button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 258.36 x 28 | = | = |
| Padding | 0px 10px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 7px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span.min-w-0.truncate: anthropic-sans 14px/20px 400, #f0efec | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | text | = | = |
| Tokens | --cds-page-bg #151515 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 258.4x28.0 bg #ffffff @ 0.075 r 7px | button.cds-reset.group/btn.relative 258.4x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 258.4x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 260.13 x 28 | = | = |
| Padding | 0px 10px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 7px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span.min-w-0.truncate: anthropic-sans 14px/20px 400, #0b0b0b | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | text | = | = |
| Tokens | --cds-page-bg #fcfcfb | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 260.1x28.0 bg #0b0b0b @ 0.05 r 7px | button.cds-reset.group/btn.relative 260.1x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 260.1x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |

Crops: `chat-title-button-default.png`, `chat-title-button-hover.png`, `chat-title-button-focus-visible.png`, `chat-title-button-light.png`, `chat-title-button-light-hover.png`, `chat-title-button-light-focus-visible.png`.

#### chat-title-more

Chat title more button.

Copy: `thread-dark`. Finder: `() => Q('[data-testid=chat-title-split] button', 1)`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 28 x 28 | = |
| Padding | 0px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 7px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #f0efec | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | default | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = |
| How | at rest | mouse hover |
| Painted layers | - | span.absolute.inset-0.duration-fast 28.0x28.0 bg #ffffff @ 0.075 r 7px |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 28 x 28 | = |
| Padding | 0px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 7px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Text node | span: Anthropicons-Variable 16px/16px 533.25, #0b0b0b | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | default | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = |
| How | at rest | mouse hover |
| Painted layers | - | span.absolute.inset-0.duration-fast 28.0x28.0 bg #0b0b0b @ 0.05 r 7px |

Crops: `chat-title-more-default.png`, `chat-title-more-hover.png`, `chat-title-more-light.png`, `chat-title-more-light-hover.png`.

#### share-button

Share button.

Copy: `thread-dark`. Finder: `() => Q('[data-testid=wiggle-controls-actions-share]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 57.66 x 28 | = | = |
| Padding | 0px 10px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 7px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span.inline-flex.min-w-0.items-center: anthropic-sans 14px/20px 400, #f0efec | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Painted layers | span.absolute.inset-0.duration-fast 57.7x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px | span.absolute.inset-0.duration-fast 57.7x28.0 bg #ffffff @ 0.14 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px | button.cds-reset.group/btn.relative 57.7x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 57.7x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 58 x 28 | = | = |
| Padding | 0px 10px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 7px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span.inline-flex.min-w-0.items-center: anthropic-sans 14px/20px 400, #0b0b0b | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Painted layers | span.absolute.inset-0.duration-fast 58.0x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px | span.absolute.inset-0.duration-fast 58.0x28.0 bg #0b0b0b @ 0.05 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px | button.cds-reset.group/btn.relative 58.0x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 58.0x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `share-button-default.png`, `share-button-hover.png`, `share-button-focus-visible.png`, `share-button-light.png`, `share-button-light-hover.png`, `share-button-light-focus-visible.png`.

### Home and composer

#### greeting

Home greeting. Anthropic Serif at the display size (`.font-display`: 2.375rem, weight 300 with the "opsz" 48 axis in dark), the orange asterisk mark first.

Copy: `home-dark`. Finder: `() => Q('main .font-display')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 302.97 x 47.5 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 38px/47.5px 300 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.select-none: anthropic-serif 38px/47.5px 300, #f0efec |
| Transition | none |
| Icon | 36.47 x 36.47, colour #f0efec, fill #d97757 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 305.11 x 47.5 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 38px/47.5px 330 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.select-none: anthropic-serif 38px/47.5px 330, #0b0b0b |
| Transition | none |
| Icon | 36.47 x 36.47, colour #0b0b0b, fill #d97757 |
| How | at rest |

Crops: `greeting-default.png`, `greeting-light.png`.

#### greeting-mark

Greeting mark (the asterisk).

Copy: `home-dark`. Finder: `() => Q('main .font-display svg')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 36.47 x 36.47 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 38px/47.5px 300 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none |
| Icon | 36.47 x 36.47, colour #f0efec, fill #d97757 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 36.47 x 36.47 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 38px/47.5px 330 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none |
| Icon | 36.47 x 36.47, colour #0b0b0b, fill #d97757 |
| How | at rest |

Crops: `greeting-mark-default.png`, `greeting-mark-light.png`.

#### composer

Composer. A card on surface-3 with radius 20 (rounded-[20px]; 12 at compact), a 1px ring of --cds-border (border-strong on focus) and a soft 4/20 drop (shadow-composer); the editor (Tiptap) above a 32px tool row.

Copy: `home-dark`, `home-dark-composer-typed`, `thread-dark`, `project-dark`. Finder: `() => P(Q('[data-testid=chat-input]'))`.

Dark theme.

| Property | default | focus-visible | typed | thread | project |
|---|---|---|---|---|---|
| Size (w x h) | 672 x 120 | = | = | 768 x 100 | 680 x 120 |
| Padding | 0px | = | = | = | = |
| Border | 1px solid #000000 @ 0 | = | = | = | = |
| Radius | 20px | = | = | = | = |
| Background | #20201f | = | = | = | = |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.075 0px 4px 20px 0px, #ffffff @ 0.2 0px 0px 0px 1px inset, #ffffff @ 0.2 0px 0px 0px 0px | = | = | = |
| Outline | none | = | = | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #f0efec | = | = | = | = |
| Text node | span.col-start-1.row-start-1.block: anthropic-sans 15px/20px 400, #898781 | = | p: anthropic-sans 15px/20px 400, #f0efec | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | = |
| Transition | background-color, border-color, box-shadow, opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = | = |
| Cursor | text | = | = | = | = |
| Icon | 20 x 20, colour #f0efec | = | = | = | = |
| Placeholder | "How can I help you today?" #898781, opacity 1, 15px | = | "" #f0efec, opacity 1, 14px | "Write a message…" #898781, opacity 1, 15px | = |
| Painted layers | div.!box-content.flex.flex-col 672.0x120.0 bg #20201f border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px; div.relative.inline-flex.w-fit 119.2x28.0 bg #ffffff @ 0.05 r 7px; div.invisible.absolute.left-0 49.5x26.0 bg #ffffff @ 0.1 r 6px shadow #ffffff @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px | div.!box-content.flex.flex-col 672.0x120.0 bg #20201f border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.075 0px 4px 20px 0px, #ffffff @ 0.2 0px 0px 0px 1px inset, #ffffff @ 0.2 0px 0px 0px 0px; div.relative.inline-flex.w-fit 119.2x28.0 bg #ffffff @ 0.05 r 7px; div.invisible.absolute.left-0 49.5x26.0 bg #ffffff @ 0.1 r 6px shadow #ffffff @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px | div.!box-content.flex.flex-col 672.0x120.0 bg #20201f border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px; div.relative.inline-flex.w-fit 119.2x28.0 bg #ffffff @ 0.05 r 7px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px; span.absolute.inset-0.duration-fast 31.0x31.0 bg #c6613f r 8px | div.!box-content.flex.flex-col 768.0x100.0 bg #20201f border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px | div.!box-content.flex.flex-col 680.0x120.0 bg #20201f border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px; div.relative.inline-flex.w-fit 119.2x28.0 bg #ffffff @ 0.05 r 7px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-border hsl(from #fff h s l / 10%); --cds-cursor-interactive default; --cds-page-bg #151515; --cds-radius calc(.5rem * 1); --cds-segmented-control-thumb hsl(from #fff h s l / 10%); --cds-segmented-control-track hsl(from #fff h s l / 5%) | = | = | --cds-cursor-interactive default; --cds-page-bg #151515 | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab (on the field inside) | at rest, captured typed | at rest, captured thread | at rest, captured project |
| Ancestor paint | - | = | = | 1 up div.relative bg #151515 | = |

Light theme.

| Property | light | light-focus-visible | light-typed | light-thread | light-project |
|---|---|---|---|---|---|
| Size (w x h) | 672 x 120 | = | = | 768 x 100 | 680 x 120 |
| Padding | 0px | = | = | = | = |
| Border | 1px solid #000000 @ 0 | = | = | = | = |
| Radius | 20px | = | = | = | = |
| Background | #ffffff | = | = | = | = |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.075 0px 4px 20px 0px, #0b0b0b @ 0.2 0px 0px 0px 0px inset, #0b0b0b @ 0.2 0px 0px 0px 1px | = | = | = |
| Outline | none | = | = | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #0b0b0b | = | = | = | = |
| Text node | span.col-start-1.row-start-1.block: anthropic-sans 15px/20px 400, #898781 | = | p: anthropic-sans 15px/20px 400, #0b0b0b | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | = |
| Transition | background-color, border-color, box-shadow, opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) | = | = | = | = |
| Cursor | text | = | = | = | = |
| Icon | 20 x 20, colour #0b0b0b | = | = | = | = |
| Placeholder | "How can I help you today?" #898781, opacity 1, 15px | = | "" #0b0b0b, opacity 1, 14px | "Write a message…" #898781, opacity 1, 15px | = |
| Painted layers | div.!box-content.flex.flex-col 672.0x120.0 bg #ffffff border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px; div.relative.inline-flex.w-fit 119.8x28.0 bg #f6f6f4 r 7px; div.invisible.absolute.left-0 49.5x26.0 bg #ffffff r 6px shadow #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px | div.!box-content.flex.flex-col 672.0x120.0 bg #ffffff border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.075 0px 4px 20px 0px, #0b0b0b @ 0.2 0px 0px 0px 0px inset, #0b0b0b @ 0.2 0px 0px 0px 1px; div.relative.inline-flex.w-fit 119.8x28.0 bg #f6f6f4 r 7px; div.invisible.absolute.left-0 49.5x26.0 bg #ffffff r 6px shadow #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px | div.!box-content.flex.flex-col 672.0x120.0 bg #ffffff border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px; div.relative.inline-flex.w-fit 119.8x28.0 bg #f6f6f4 r 7px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px; span.absolute.inset-0.duration-fast 31.0x31.0 bg #c6613f r 8px | div.!box-content.flex.flex-col 768.0x100.0 bg #ffffff border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px | div.!box-content.flex.flex-col 680.0x120.0 bg #ffffff border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px; div.relative.inline-flex.w-fit 119.8x28.0 bg #f6f6f4 r 7px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-border hsl(from #0b0b0b h s l / 10%); --cds-cursor-interactive default; --cds-page-bg #fcfcfb; --cds-radius calc(.5rem * 1); --cds-segmented-control-thumb #fff; --cds-segmented-control-track #f6f6f4 | = | = | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab (on the field inside) | at rest, captured typed | at rest, captured thread | at rest, captured project |
| Ancestor paint | - | = | = | 1 up div.relative bg #fcfcfb | = |

Other finders: typed: `() => P(Q('[data-testid=chat-input]'))`; light-typed: `() => P(Q('[data-testid=chat-input]'))`; project: `() => P(Q('[data-testid=chat-input]'))`; light-project: `() => P(Q('[data-testid=chat-input]'))`; thread: `() => P(Q('[data-testid=chat-input]'))`; light-thread: `() => P(Q('[data-testid=chat-input]'))`.

Crops: `composer-default.png`, `composer-focus-visible.png`, `composer-typed.png`, `composer-thread.png`, `composer-project.png`, `composer-light.png`, `composer-light-focus-visible.png`, `composer-light-typed.png`, `composer-light-thread.png`, `composer-light-project.png`.

#### composer-placeholder

Composer placeholder. Two stacked spans that cross-fade ("How can I help you today?", "Type / for skills").

Copy: `home-dark`. Finder: `() => T('How can I help you today?', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 636 x 40 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 15px/20px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Cursor | text |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 636 x 40 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 15px/20px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Cursor | text |
| How | at rest |

Crops: `composer-placeholder-default.png`, `composer-placeholder-light.png`.

#### composer-text

Composer typed text.

Copy: `home-dark-composer-typed`. Finder: `() => Q('[data-testid=chat-input] p')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 636 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 15px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none |
| Cursor | text |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 636 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 15px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none |
| Cursor | text |
| How | at rest |

Crops: `composer-text-default.png`, `composer-text-light.png`.

#### composer-plus

Composer + button.

Copy: `home-dark`, `home-dark-plus-menu`. Finder: `() => Q('[data-testid=chat-input-attach]')`.

Dark theme.

| Property | default | hover | focus-visible | open |
|---|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = | = |
| Padding | 0px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px | = |
| Outline | none | = | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #f0efec | = | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | = | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease | = |
| Cursor | default | = | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #ffffff @ 0.075 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset | span.absolute.inset-0.duration-fast 32.0x32.0 bg #ffffff @ 0.075 r 8px |

Light theme.

| Property | light | light-hover | light-focus-visible | light-open |
|---|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = | = |
| Padding | 0px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px | = |
| Outline | none | = | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #0b0b0b | = | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | = | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease | = |
| Cursor | default | = | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #0b0b0b @ 0.05 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset | span.absolute.inset-0.duration-fast 32.0x32.0 bg #0b0b0b @ 0.05 r 8px |

Other finders: open: `() => Q('[data-testid=chat-input-attach]')`; light-open: `() => Q('[data-testid=chat-input-attach]')`.

Crops: `composer-plus-default.png`, `composer-plus-hover.png`, `composer-plus-focus-visible.png`, `composer-plus-open.png`, `composer-plus-light.png`, `composer-plus-light-hover.png`, `composer-plus-light-focus-visible.png`, `composer-plus-light-open.png`.

#### segmented-control

Chat/Cowork segmented control. cds SegmentedControl: a track of --cds-segmented-control-track, the checked option on --cds-segmented-control-thumb.

Copy: `home-dark`. Finder: `() => Q('main [data-cds=SegmentedControl][aria-label=Surface]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 119.17 x 28 |
| Padding | 1px |
| Border | none |
| Radius | 7px |
| Background | #ffffff @ 0.05 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.text-footnote.sr-only: anthropic-sans 13px/17px 400, #f0efec |
| Transition | none |
| Cursor | text |
| Placeholder | "" #f0efec, opacity 1, 14px |
| Painted layers | div.relative.inline-flex.w-fit 119.2x28.0 bg #ffffff @ 0.05 r 7px; div.invisible.absolute.left-0 49.5x26.0 bg #ffffff @ 0.1 r 6px shadow #ffffff @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-border hsl(from #fff h s l / 10%); --cds-radius calc(.4375rem * 1); --cds-segmented-control-thumb hsl(from #fff h s l / 10%); --cds-segmented-control-track hsl(from #fff h s l / 5%) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 119.78 x 28 |
| Padding | 1px |
| Border | none |
| Radius | 7px |
| Background | #f6f6f4 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.text-footnote.sr-only: anthropic-sans 13px/17px 400, #0b0b0b |
| Transition | none |
| Cursor | text |
| Placeholder | "" #0b0b0b, opacity 1, 14px |
| Painted layers | div.relative.inline-flex.w-fit 119.8x28.0 bg #f6f6f4 r 7px; div.invisible.absolute.left-0 49.5x26.0 bg #ffffff r 6px shadow #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-border hsl(from #0b0b0b h s l / 10%); --cds-radius calc(.4375rem * 1); --cds-segmented-control-thumb #fff; --cds-segmented-control-track #f6f6f4 |
| How | at rest |

Crops: `segmented-control-default.png`, `segmented-control-light.png`.

#### segment

Segment option.

Copy: `home-dark`. Finder: `() => Q('main [aria-label=Surface] [role=radio][aria-checked=false]')`.

Dark theme.

| Property | default | hover | focus-visible | checked |
|---|---|---|---|---|
| Size (w x h) | 67.45 x 26 | = | - | 49.72 x 26 |
| Padding | 0px 10px | = | - | = |
| Gap | 6px | = | - | = |
| Border | none | = | - | = |
| Radius | 5px | = | - | = |
| Background | transparent | = | - | = |
| Box shadow | none | = | - | = |
| Outline | none | = | - | = |
| Font | anthropic-sans 14px/20px 400 | = | - | = |
| Letter spacing | normal | = | - | = |
| Colour | #898781 | #f0efec | - | #f0efec |
| Text node | span.text-footnote.sr-only: anthropic-sans 13px/17px 400, #898781 | span.text-footnote.sr-only: anthropic-sans 13px/17px 400, #f0efec | - | span.text-footnote.sr-only: anthropic-sans 13px/17px 400, #f0efec |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | - | = |
| Cursor | default | = | - | = |
| Ancestor paint | 1 up div.relative.inline-flex.w-fit bg #ffffff @ 0.05 | = | - | = |
| Tokens | --cds-radius calc(.4375rem * 1) | = | - | = |
| How | at rest | mouse hover | - | at rest, captured checked |
| Skipped | - | = | not focusable in the static copy (no tabindex) | = |

Light theme.

| Property | light | light-hover | light-focus-visible | light-checked |
|---|---|---|---|---|
| Size (w x h) | 67.83 x 26 | = | - | 49.95 x 26 |
| Padding | 0px 10px | = | - | = |
| Gap | 6px | = | - | = |
| Border | none | = | - | = |
| Radius | 5px | = | - | = |
| Background | transparent | = | - | = |
| Box shadow | none | = | - | = |
| Outline | none | = | - | = |
| Font | anthropic-sans 14px/20px 400 | = | - | = |
| Letter spacing | normal | = | - | = |
| Colour | #898781 | #0b0b0b | - | #0b0b0b |
| Text node | span.text-footnote.sr-only: anthropic-sans 13px/17px 400, #898781 | span.text-footnote.sr-only: anthropic-sans 13px/17px 400, #0b0b0b | - | span.text-footnote.sr-only: anthropic-sans 13px/17px 400, #0b0b0b |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | - | = |
| Cursor | default | = | - | = |
| Ancestor paint | 1 up div.relative.inline-flex.w-fit bg #f6f6f4 | = | - | = |
| Tokens | --cds-radius calc(.4375rem * 1) | = | - | = |
| How | at rest | mouse hover | - | at rest, captured checked |
| Skipped | - | = | not focusable in the static copy (no tabindex) | = |

Other finders: checked: `() => Q('main [aria-label=Surface] [role=radio][aria-checked=true]')`; light-checked: `() => Q('main [aria-label=Surface] [role=radio][aria-checked=true]')`.

Crops: `segment-default.png`, `segment-hover.png`, `segment-checked.png`, `segment-light.png`, `segment-light-hover.png`, `segment-light-checked.png`.

#### model-selector

Model selector. "Opus 5.5" in text-primary, "Medium" (the effort) in text-muted, a chevron.

Copy: `home-dark`, `home-dark-model-menu`. Finder: `() => Q('[data-testid=model-selector-dropdown]')`.

Dark theme.

| Property | default | hover | focus-visible | open |
|---|---|---|---|---|
| Size (w x h) | 141.98 x 32 | = | = | = |
| Padding | 0px 12px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px | = |
| Outline | none | = | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #f0efec | = | = | = |
| Text node | span.truncate: anthropic-sans 14px/20px 400, #f0efec | = | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease | = |
| Cursor | default | = | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |
| Painted layers | - | span.absolute.inset-0.duration-fast 142.0x32.0 bg #ffffff @ 0.075 r 8px | button.cds-reset.group/btn.relative 142.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 142.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset | span.absolute.inset-0.duration-fast 142.0x32.0 bg #ffffff @ 0.075 r 8px |

Light theme.

| Property | light | light-hover | light-focus-visible | light-open |
|---|---|---|---|---|
| Size (w x h) | 142.5 x 32 | = | = | = |
| Padding | 0px 12px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px | = |
| Outline | none | = | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #0b0b0b | = | = | = |
| Text node | span.truncate: anthropic-sans 14px/20px 400, #0b0b0b | = | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease | = |
| Cursor | default | = | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured open |
| Painted layers | - | span.absolute.inset-0.duration-fast 142.5x32.0 bg #0b0b0b @ 0.05 r 8px | button.cds-reset.group/btn.relative 142.5x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 142.5x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset | span.absolute.inset-0.duration-fast 142.5x32.0 bg #0b0b0b @ 0.05 r 8px |

Other finders: open: `() => Q('[data-testid=model-selector-dropdown]')`; light-open: `() => Q('[data-testid=model-selector-dropdown]')`.

Crops: `model-selector-default.png`, `model-selector-hover.png`, `model-selector-focus-visible.png`, `model-selector-open.png`, `model-selector-light.png`, `model-selector-light-hover.png`, `model-selector-light-focus-visible.png`, `model-selector-light-open.png`.

#### mic-button

Dictation button.

Copy: `home-dark`. Finder: `() => Q('button[aria-label="Press and hold to record"]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px 6px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.1 | = |
| Box shadow | none | = | = |
| Outline | 2px solid #5598e7 @ 0 offset 2px | = | 2px solid #5598e7 offset 2px |
| Font | anthropic-sans 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.2s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | pointer | = | = |
| Painted layers | button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px | button.h-8.rounded-lg.overflow-hidden 32.0x32.0 bg #ffffff @ 0.1 r 8px outline 2px solid #5598e7 @ 0 offset 2px | button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 offset 2px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px 6px | = | = |
| Gap | 4px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #0b0b0b @ 0.1 | = |
| Box shadow | none | = | = |
| Outline | 2px solid #256abf @ 0 offset 2px | = | 2px solid #256abf offset 2px |
| Font | anthropic-sans 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.2s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | pointer | = | = |
| Painted layers | button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px | button.h-8.rounded-lg.overflow-hidden 32.0x32.0 bg #0b0b0b @ 0.1 r 8px outline 2px solid #256abf @ 0 offset 2px | button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf offset 2px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `mic-button-default.png`, `mic-button-hover.png`, `mic-button-focus-visible.png`, `mic-button-light.png`, `mic-button-light-hover.png`, `mic-button-light-focus-visible.png`.

#### voice-button

Voice mode button.

Copy: `home-dark`. Finder: `() => Q('button[aria-label="Use voice mode"]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.075 | = |
| Box shadow | none | = | = |
| Outline | 2px solid #5598e7 @ 0 offset 2px | = | 2px solid #5598e7 offset 2px |
| Font | anthropic-sans 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.2s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Icon | 20 x 20, colour #f0efec | = | = |
| Painted layers | button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px | button.h-8.rounded-lg.overflow-hidden 32.0x32.0 bg #ffffff @ 0.075 r 8px outline 2px solid #5598e7 @ 0 offset 2px | button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 offset 2px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #0b0b0b @ 0.05 | = |
| Box shadow | none | = | = |
| Outline | 2px solid #256abf @ 0 offset 2px | = | 2px solid #256abf offset 2px |
| Font | anthropic-sans 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to 0.2s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Icon | 20 x 20, colour #0b0b0b | = | = |
| Painted layers | button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px | button.h-8.rounded-lg.overflow-hidden 32.0x32.0 bg #0b0b0b @ 0.05 r 8px outline 2px solid #256abf @ 0 offset 2px | button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf offset 2px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `voice-button-default.png`, `voice-button-hover.png`, `voice-button-focus-visible.png`, `voice-button-light.png`, `voice-button-light-hover.png`, `voice-button-light-focus-visible.png`.

#### send-button

Send button. Takes the voice button's place once there is text: a filled clay (--cds-fill-brand) square with an arrow.

Copy: `home-dark-composer-typed`. Finder: `() => Q('[data-testid=chat-input-send]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #ffffff | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Painted layers | span.absolute.inset-0.duration-fast 31.0x31.0 bg #c6613f r 8px | span.absolute.inset-0.duration-fast 31.0x31.0 bg #d97757 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 31.0x31.0 bg #c6613f r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #ffffff | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #ffffff | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Painted layers | span.absolute.inset-0.duration-fast 31.0x31.0 bg #c6613f r 8px | span.absolute.inset-0.duration-fast 31.0x31.0 bg #d97757 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 31.0x31.0 bg #c6613f r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `send-button-default.png`, `send-button-hover.png`, `send-button-focus-visible.png`, `send-button-light.png`, `send-button-light-hover.png`, `send-button-light-focus-visible.png`.

#### disclaimer

Disclaimer under the composer.

Copy: `thread-dark`. Finder: `() => C(TS('Claude is AI and can make mistakes'), 'a')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 382.83 x 15 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | 2px solid #5598e7 @ 0 offset 2px |
| Font | anthropic-sans 12px/16px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter, display, content-visibility, overlay, pointer-events 0.15s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Painted layers | a.transition 382.8x15.0 outline 2px solid #5598e7 @ 0 offset 2px |
| Ancestor paint | 1 up div.pointer-events-auto.relative.z-0 bg #151515 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 385.66 x 15 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | 2px solid #256abf @ 0 offset 2px |
| Font | anthropic-sans 12px/16px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter, display, content-visibility, overlay, pointer-events 0.15s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Painted layers | a.transition 385.7x15.0 outline 2px solid #256abf @ 0 offset 2px |
| Ancestor paint | 1 up div.pointer-events-auto.relative.z-0 bg #fcfcfb |
| How | at rest |

Crops: `disclaimer-default.png`, `disclaimer-light.png`.

### Menus and dialogs

#### plus-menu

Plus menu. cds Menu: surface-popover, --cds-panel-radius, a ring plus --cds-shadow-popover; 4px inset, 32px rows.

Copy: `home-dark-plus-menu`. Finder: `() => MN()`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 228.33 x 379 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #20201f |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec |
| Transition | none |
| Icon | 20 x 20, colour #f0efec |
| Painted layers | div.cds-reset.draggable-none.group/menu-popup 228.3x379.0 bg #20201f r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px; div.min-h-0.overflow-y-auto.scroll-fade-y 228.3x379.0 border B:1px solid #000000 @ 0 r 12px; div.my-1.h-px.bg-border 200.3x1.0 bg #ffffff @ 0.1; div.my-1.h-px.bg-border 200.3x1.0 bg #ffffff @ 0.1 |
| Tokens | --available-height 412.5px; --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-ring-inner 1px; --cds-shortcut-cap-ink #a5a49a; --cds-text-muted #898781 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 229.22 x 378 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b |
| Transition | none |
| Icon | 20 x 20, colour #0b0b0b |
| Painted layers | div.cds-reset.draggable-none.group/menu-popup 229.2x378.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px; div.my-1.h-px.bg-border 201.2x1.0 bg #0b0b0b @ 0.1; div.my-1.h-px.bg-border 201.2x1.0 bg #0b0b0b @ 0.1 |
| Tokens | --available-height 412.5px; --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-ring-inner 0px; --cds-shortcut-cap-ink #6d6b67; --cds-text-muted #898781 |
| How | at rest |

Crops: `plus-menu-default.png`, `plus-menu-light.png`.

#### menu-item

Menu item. A 20px glyph, body text, an optional shortcut or chevron at the end; hover fills --cds-fill-ghost-hover.

Copy: `home-dark-plus-menu`. Finder: `() => C(T('Take a screenshot', MN()), '[role=menuitem]')`.

Dark theme.

| Property | default | hover | checkbox | submenu |
|---|---|---|---|---|
| Size (w x h) | 220.33 x 32 | = | = | = |
| Padding | 6px 10px | = | = | = |
| Gap | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #f0efec | = | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | = | = | = |
| Transition | none | = | = | = |
| Cursor | default | = | = | = |
| Ancestor paint | 2 up div.cds-reset.draggable-none.group/menu-popup bg #20201f shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px | = | = | = |
| Tokens | --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-text-muted #898781 | = | = | = |
| How | at rest | mouse hover | at rest, captured checkbox | at rest, captured submenu |

Light theme.

| Property | light | light-hover | light-checkbox | light-submenu |
|---|---|---|---|---|
| Size (w x h) | 221.22 x 32 | = | = | = |
| Padding | 6px 10px | = | = | = |
| Gap | 8px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | = | = |
| Outline | none | = | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #0b0b0b | = | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | = | = | = |
| Transition | none | = | = | = |
| Cursor | default | = | = | = |
| Ancestor paint | 2 up div.cds-reset.draggable-none.group/menu-popup bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px | = | = | = |
| Tokens | --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-text-muted #898781 | = | = | = |
| How | at rest | mouse hover | at rest, captured checkbox | at rest, captured submenu |

Other finders: checkbox: `() => Q('[data-testid=add-menu-web-search]')`; submenu: `() => Q('[data-testid=add-menu-skills]')`; light-checkbox: `() => Q('[data-testid=add-menu-web-search]')`; light-submenu: `() => Q('[data-testid=add-menu-skills]')`.

Crops: `menu-item-default.png`, `menu-item-hover.png`, `menu-item-checkbox.png`, `menu-item-submenu.png`, `menu-item-light.png`, `menu-item-light-hover.png`, `menu-item-light-checkbox.png`, `menu-item-light-submenu.png`.

#### menu-item-shortcut

Menu item shortcut.

Copy: `home-dark-plus-menu`. Finder: `() => Q('[role=menu] [data-cds=Shortcut]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 25.2 x 17 |
| Padding | 0px |
| Gap | 3.9px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 13px/17px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: anthropic-sans 13px/17px 400, #898781 |
| Transition | none |
| Cursor | default |
| Tokens | --cds-shortcut-cap-ink #898781 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 25.22 x 17 |
| Padding | 0px |
| Gap | 3.9px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 13px/17px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: anthropic-sans 13px/17px 400, #898781 |
| Transition | none |
| Cursor | default |
| Tokens | --cds-shortcut-cap-ink #898781 |
| How | at rest |

Crops: `menu-item-shortcut-default.png`, `menu-item-shortcut-light.png`.

#### model-menu

Model menu. Four models as two-line radio items (name, description in footnote), then Effort and More models as submenu rows.

Copy: `home-dark-model-menu`. Finder: `() => MN()`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 294.61 x 291 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #20201f |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.truncate: anthropic-sans 14px/20px 400, #f0efec |
| Transition | none |
| Painted layers | div.cds-reset.draggable-none.group/menu-popup 294.6x291.0 bg #20201f r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px; div.min-h-0.overflow-y-auto.scroll-fade-y 294.6x291.0 border B:1px solid #000000 @ 0 r 12px; div.cds-reset.flex.w-full 286.6x50.0 bg #ffffff @ 0.075 r 8px; div.my-1.h-px.bg-border 266.6x1.0 bg #ffffff @ 0.1; div.my-1.h-px.bg-border 266.6x1.0 bg #ffffff @ 0.1 |
| Tokens | --available-height 422.5px; --available-width 1440px; --cds-font-size-body calc(.875rem * 1); --cds-font-size-footnote calc(.8125rem * 1); --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-leading-footnote calc(1.0625rem * 1); --cds-ring-inner 1px; --cds-text-muted #898781 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 296.48 x 290 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.truncate: anthropic-sans 14px/20px 400, #0b0b0b |
| Transition | none |
| Painted layers | div.cds-reset.draggable-none.group/menu-popup 296.5x290.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px; div.cds-reset.flex.w-full 288.5x50.0 bg #0b0b0b @ 0.05 r 8px; div.my-1.h-px.bg-border 268.5x1.0 bg #0b0b0b @ 0.1; div.my-1.h-px.bg-border 268.5x1.0 bg #0b0b0b @ 0.1 |
| Tokens | --available-height 422.5px; --available-width 1440px; --cds-font-size-body calc(.875rem * 1); --cds-font-size-footnote calc(.8125rem * 1); --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-leading-footnote calc(1.0625rem * 1); --cds-ring-inner 0px; --cds-text-muted #898781 |
| How | at rest |

Crops: `model-menu-default.png`, `model-menu-light.png`.

#### model-menu-item

Model menu item.

Copy: `home-dark-model-menu`. Finder: `() => C(T('Sonnet 5.5', MN()), '[role=menuitemradio]')`.

Dark theme.

| Property | default | hover | checked |
|---|---|---|---|
| Size (w x h) | 286.61 x 50 | = | = |
| Padding | 6px 10px 7px 10px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span.truncate: anthropic-sans 14px/20px 400, #f0efec | = | = |
| Transition | none | = | = |
| Cursor | default | = | = |
| Ancestor paint | 3 up div.cds-reset.draggable-none.group/menu-popup bg #20201f shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px | = | = |
| Tokens | --cds-font-size-body calc(.875rem * 1); --cds-font-size-footnote calc(.8125rem * 1); --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-leading-footnote calc(1.0625rem * 1); --cds-text-muted #898781 | = | = |
| How | at rest | mouse hover | at rest, captured checked |

Light theme.

| Property | light | light-hover | light-checked |
|---|---|---|---|
| Size (w x h) | 288.48 x 50 | = | = |
| Padding | 6px 10px 7px 10px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span.truncate: anthropic-sans 14px/20px 400, #0b0b0b | = | = |
| Transition | none | = | = |
| Cursor | default | = | = |
| Ancestor paint | 3 up div.cds-reset.draggable-none.group/menu-popup bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px | = | = |
| Tokens | --cds-font-size-body calc(.875rem * 1); --cds-font-size-footnote calc(.8125rem * 1); --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-leading-footnote calc(1.0625rem * 1); --cds-text-muted #898781 | = | = |
| How | at rest | mouse hover | at rest, captured checked |

Other finders: checked: `() => C(T('Opus 5.5', MN()), '[role=menuitemradio]')`; light-checked: `() => C(T('Opus 5.5', MN()), '[role=menuitemradio]')`.

Crops: `model-menu-item-default.png`, `model-menu-item-hover.png`, `model-menu-item-checked.png`, `model-menu-item-light.png`, `model-menu-item-light-hover.png`, `model-menu-item-light-checked.png`.

#### model-menu-effort

Effort row.

Copy: `home-dark-model-menu`. Finder: `() => C(T('Effort', MN()), '[role=menuitem]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 286.61 x 32 | = |
| Padding | 6px 10px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Text node | span.min-w-0.flex-1.truncate: anthropic-sans 14px/20px 400, #f0efec | = |
| Transition | none | = |
| Cursor | default | = |
| Ancestor paint | 2 up div.cds-reset.draggable-none.group/menu-popup bg #20201f shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px | = |
| Tokens | --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-text-muted #898781 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 288.48 x 32 | = |
| Padding | 6px 10px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Text node | span.min-w-0.flex-1.truncate: anthropic-sans 14px/20px 400, #0b0b0b | = |
| Transition | none | = |
| Cursor | default | = |
| Ancestor paint | 2 up div.cds-reset.draggable-none.group/menu-popup bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px | = |
| Tokens | --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-text-muted #898781 | = |
| How | at rest | mouse hover |

Crops: `model-menu-effort-default.png`, `model-menu-effort-hover.png`, `model-menu-effort-light.png`, `model-menu-effort-light-hover.png`.

#### user-menu

Account menu. Opens above the account row: the email as a muted header, then Settings, Usage, Language, Get help, plans, apps, Learn more, API keys, Log out.

Copy: `home-dark-user-menu`. Finder: `() => MN()`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 272 x 367 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #20201f |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: anthropic-sans 13px/17px 500, #898781 |
| Transition | none |
| Painted layers | div.cds-reset.draggable-none.group/menu-popup 272.0x367.0 bg #20201f r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px; div.min-h-0.overflow-y-auto.scroll-fade-y 272.0x367.0 border B:1px solid #000000 @ 0 r 12px; div.cds-reset.flex.w-full 264.0x32.0 bg #ffffff @ 0.075 r 8px; div.my-1.h-px.bg-border 244.0x1.0 bg #ffffff @ 0.1; div.my-1.h-px.bg-border 244.0x1.0 bg #ffffff @ 0.1; div.my-1.h-px.bg-border 244.0x1.0 bg #ffffff @ 0.1 |
| Tokens | --available-height 849px; --cds-font-size-body calc(.875rem * 1); --cds-font-size-footnote calc(.8125rem * 1); --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-leading-footnote calc(1.0625rem * 1); --cds-ring-inner 1px; --cds-shortcut-cap-ink #a5a49a; --cds-text-muted #898781 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 272 x 366 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: anthropic-sans 13px/17px 500, #898781 |
| Transition | none |
| Painted layers | div.cds-reset.draggable-none.group/menu-popup 272.0x366.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px; div.cds-reset.flex.w-full 264.0x32.0 bg #0b0b0b @ 0.05 r 8px; div.my-1.h-px.bg-border 244.0x1.0 bg #0b0b0b @ 0.1; div.my-1.h-px.bg-border 244.0x1.0 bg #0b0b0b @ 0.1; div.my-1.h-px.bg-border 244.0x1.0 bg #0b0b0b @ 0.1 |
| Tokens | --available-height 849px; --cds-font-size-body calc(.875rem * 1); --cds-font-size-footnote calc(.8125rem * 1); --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-leading-footnote calc(1.0625rem * 1); --cds-ring-inner 0px; --cds-shortcut-cap-ink #6d6b67; --cds-text-muted #898781 |
| How | at rest |

Crops: `user-menu-default.png`, `user-menu-light.png`.

#### user-menu-header

Account menu header.

Copy: `home-dark-user-menu`. Finder: `() => Q('[data-testid=user-menu-header]').parentElement`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 264 x 25 |
| Padding | 4px 10px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 13px/17px 500 |
| Letter spacing | normal |
| Colour | #898781 |
| Text node | span: anthropic-sans 13px/17px 500, #898781 |
| Transition | none |
| Ancestor paint | 2 up div.cds-reset.draggable-none.group/menu-popup bg #20201f shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 264 x 25 |
| Padding | 4px 10px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 13px/17px 500 |
| Letter spacing | normal |
| Colour | #898781 |
| Text node | span: anthropic-sans 13px/17px 500, #898781 |
| Transition | none |
| Ancestor paint | 2 up div.cds-reset.draggable-none.group/menu-popup bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px |
| How | at rest |

Crops: `user-menu-header-default.png`, `user-menu-header-light.png`.

#### user-menu-item

Account menu item.

Copy: `home-dark-user-menu`. Finder: `() => Q('[data-testid=user-menu-settings]')`.

Dark theme.

| Property | default | hover | twoLine |
|---|---|---|---|
| Size (w x h) | 264 x 32 | = | 264 x 50 |
| Padding | 6px 10px | = | 6px 10px 7px 10px |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | #ffffff @ 0.075 | = | transparent |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | div.cds-reset.flex.w-full 264.0x32.0 bg #ffffff @ 0.075 r 8px | = | - |
| Ancestor paint | 2 up div.cds-reset.draggable-none.group/menu-popup bg #20201f shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px | = | = |
| Tokens | --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-shortcut-cap-ink #898781; --cds-text-muted #898781 | = | --cds-font-size-body calc(.875rem * 1); --cds-font-size-footnote calc(.8125rem * 1); --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-leading-footnote calc(1.0625rem * 1); --cds-text-muted #898781 |
| How | at rest | mouse hover | at rest, captured twoLine |

Light theme.

| Property | light | light-hover | light-twoLine |
|---|---|---|---|
| Size (w x h) | 264 x 32 | = | 264 x 50 |
| Padding | 6px 10px | = | 6px 10px 7px 10px |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | #0b0b0b @ 0.05 | = | transparent |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | = | = |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | div.cds-reset.flex.w-full 264.0x32.0 bg #0b0b0b @ 0.05 r 8px | = | - |
| Ancestor paint | 2 up div.cds-reset.draggable-none.group/menu-popup bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px | = | = |
| Tokens | --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-shortcut-cap-ink #898781; --cds-text-muted #898781 | = | --cds-font-size-body calc(.875rem * 1); --cds-font-size-footnote calc(.8125rem * 1); --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-leading-footnote calc(1.0625rem * 1); --cds-text-muted #898781 |
| How | at rest | mouse hover | at rest, captured twoLine |

Other finders: twoLine: `() => Q('[data-testid=user-menu-console]')`; light-twoLine: `() => Q('[data-testid=user-menu-console]')`.

Crops: `user-menu-item-default.png`, `user-menu-item-hover.png`, `user-menu-item-twoLine.png`, `user-menu-item-light.png`, `user-menu-item-light-hover.png`, `user-menu-item-light-twoLine.png`.

#### chat-menu

Chat row menu.

Copy: `home-dark-chat-menu`. Finder: `() => MN()`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 170.61 x 178 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #20201f |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec |
| Transition | none |
| Painted layers | div.cds-reset.draggable-none.group/menu-popup 170.6x178.0 bg #20201f r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px; div.min-h-0.overflow-y-auto.scroll-fade-y 170.6x178.0 border B:1px solid #000000 @ 0 r 12px; div.cds-reset.flex.w-full 162.6x32.0 bg #ffffff @ 0.075 r 8px; div.my-1.h-px.bg-border 142.6x1.0 bg #ffffff @ 0.1 |
| Tokens | --available-height 397px; --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-ring-inner 1px; --cds-shortcut-cap-ink #a5a49a; --cds-text-muted #898781 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 171.2 x 177 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b |
| Transition | none |
| Painted layers | div.cds-reset.draggable-none.group/menu-popup 171.2x177.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px; div.cds-reset.flex.w-full 163.2x32.0 bg #0b0b0b @ 0.05 r 8px; div.my-1.h-px.bg-border 143.2x1.0 bg #0b0b0b @ 0.1 |
| Tokens | --available-height 397px; --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-ring-inner 0px; --cds-shortcut-cap-ink #6d6b67; --cds-text-muted #898781 |
| How | at rest |

Crops: `chat-menu-default.png`, `chat-menu-light.png`.

#### chat-menu-item-danger

Chat menu Delete item.

Copy: `home-dark-chat-menu`. Finder: `() => Q('[data-testid=delete-chat-trigger]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 162.61 x 32 | = |
| Padding | 6px 10px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #ec7e7e | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #ec7e7e | = |
| Transition | none | = |
| Cursor | pointer | = |
| Ancestor paint | 2 up div.cds-reset.draggable-none.group/menu-popup bg #20201f shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px | = |
| Tokens | --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-shortcut-cap-ink #898781; --cds-text-muted #898781 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 163.2 x 32 | = |
| Padding | 6px 10px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #8e2626 | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #8e2626 | = |
| Transition | none | = |
| Cursor | pointer | = |
| Ancestor paint | 2 up div.cds-reset.draggable-none.group/menu-popup bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px | = |
| Tokens | --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-shortcut-cap-ink #898781; --cds-text-muted #898781 | = |
| How | at rest | mouse hover |

Crops: `chat-menu-item-danger-default.png`, `chat-menu-item-danger-hover.png`, `chat-menu-item-danger-light.png`, `chat-menu-item-danger-light-hover.png`.

#### more-menu

Sidebar More menu.

Copy: `artifacts-dark-more-menu`. Finder: `() => MN()`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 149.75 x 178 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #20201f |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec |
| Transition | none |
| Painted layers | div.cds-reset.draggable-none.group/menu-popup 149.8x178.0 bg #20201f r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px; div.min-h-0.overflow-y-auto.scroll-fade-y 149.8x178.0 border B:1px solid #000000 @ 0 r 12px; div.cds-reset.flex.w-full 141.8x32.0 bg #ffffff @ 0.075 r 8px; div.my-1.h-px.bg-border 121.8x1.0 bg #ffffff @ 0.1 |
| Tokens | --available-height 890px; --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-ring-inner 1px; --cds-text-muted #898781 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 150.23 x 177 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b |
| Transition | none |
| Painted layers | div.cds-reset.draggable-none.group/menu-popup 150.2x177.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px; div.cds-reset.flex.w-full 142.2x32.0 bg #0b0b0b @ 0.05 r 8px; div.my-1.h-px.bg-border 122.2x1.0 bg #0b0b0b @ 0.1 |
| Tokens | --available-height 890px; --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-ring-inner 0px; --cds-text-muted #898781 |
| How | at rest |

Crops: `more-menu-default.png`, `more-menu-light.png`.

#### more-menu-item

More menu item.

Copy: `artifacts-dark-more-menu`. Finder: `() => C(T('Projects', MN()), '[role=menuitem]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 141.75 x 32 | = |
| Padding | 6px 10px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | #ffffff @ 0.075 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | = |
| Transition | none | = |
| Cursor | pointer | = |
| Painted layers | div.cds-reset.flex.w-full 141.8x32.0 bg #ffffff @ 0.075 r 8px | = |
| Ancestor paint | 2 up div.cds-reset.draggable-none.group/menu-popup bg #20201f shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #000000 @ 0.32 0px 8px 24px 0px, #000000 @ 0.2 0px 2px 6px 0px | = |
| Tokens | --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-text-muted #898781 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 142.23 x 32 | = |
| Padding | 6px 10px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | #0b0b0b @ 0.05 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | = |
| Transition | none | = |
| Cursor | pointer | = |
| Painted layers | div.cds-reset.flex.w-full 142.2x32.0 bg #0b0b0b @ 0.05 r 8px | = |
| Ancestor paint | 2 up div.cds-reset.draggable-none.group/menu-popup bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #000000 @ 0.12 0px 8px 24px 0px, #000000 @ 0.08 0px 2px 6px 0px | = |
| Tokens | --cds-h-control calc(2rem * 1); --cds-leading-body calc(1.25rem * 1); --cds-text-muted #898781 | = |
| How | at rest | mouse hover |

Crops: `more-menu-item-default.png`, `more-menu-item-hover.png`, `more-menu-item-light.png`, `more-menu-item-light-hover.png`.

#### search-dialog

Search dialog. 672 wide, a field row over a list of results with a time group at the end of each row.

Copy: `home-dark-search`. Finder: `() => Q('[data-cds=Dialog]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 672 x 506.48 |
| Padding | 0px |
| Border | 1px solid #ffffff @ 0.2 |
| Radius | 12px |
| Background | #20201f |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.25 0px 25px 50px -12px |
| Outline | none |
| Font | anthropic-sans 16px/24px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.text-muted: Anthropicons-Variable 20px/20px 433.25, #898781 |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| ::after | 670px x 504.484px, absolute, bg #000000 @ 0.5, radius 12px |
| Painted layers | div.draggable-none.fixed.left-1/2 672.0x506.5 bg #20201f border T:1px solid #ffffff @ 0.2 / R:1px solid #ffffff @ 0.2 / B:1px solid #ffffff @ 0.2 / L:1px solid #ffffff @ 0.2 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.25 0px 25px 50px -12px; div.draggable-none.fixed.left-1/2::after 670pxx504.484px bg #000000 @ 0.5 r 12px opacity 0; textarea.flex-1.bg-transparent.border-none 544.0x20.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #f0efec 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px; div.absolute.inset-x-0.bottom-full 670.0x10.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.06 0px 2px 8px 0px; div.pointer-events-none.relative.z-2 670.0x10.0 bg #20201f; button.w-full.text-left.px-3 650.0x36.0 bg #ffffff @ 0.075 r 8px outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-black #000; --cds-cursor-interactive default; --cds-page-bg #20201f; --cp-top 25vh; --cp-visible-h (unset) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 672 x 506.48 |
| Padding | 0px |
| Border | 1px solid #0b0b0b @ 0.2 |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.25 0px 25px 50px -12px |
| Outline | none |
| Font | anthropic-sans 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.text-muted: Anthropicons-Variable 20px/20px 433.25, #898781 |
| Transition | none |
| Transform | matrix(1, 0, 0, 1, 0, 0) |
| ::after | 670px x 504.484px, absolute, bg #000000 @ 0.4, radius 12px |
| Painted layers | div.draggable-none.fixed.left-1/2 672.0x506.5 bg #ffffff border T:1px solid #0b0b0b @ 0.2 / R:1px solid #0b0b0b @ 0.2 / B:1px solid #0b0b0b @ 0.2 / L:1px solid #0b0b0b @ 0.2 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.25 0px 25px 50px -12px; div.draggable-none.fixed.left-1/2::after 670pxx504.484px bg #000000 @ 0.4 r 12px opacity 0; textarea.flex-1.bg-transparent.border-none 544.0x20.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px; div.absolute.inset-x-0.bottom-full 670.0x10.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.06 0px 2px 8px 0px; div.pointer-events-none.relative.z-2 670.0x10.0 bg #ffffff; button.w-full.text-left.px-3 650.0x36.0 bg #0b0b0b @ 0.05 r 8px outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-black #000; --cds-cursor-interactive default; --cds-page-bg #fff; --cp-top 25vh; --cp-visible-h (unset) |
| How | at rest |

Crops: `search-dialog-default.png`, `search-dialog-light.png`.

#### dialog-backdrop

Dialog backdrop.

Copy: `home-dark-search`. Finder: `() => Q('.fixed.inset-0.bg-backdrop')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 1440 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #000000 @ 0.5 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 16px/24px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none 0.2s cubic-bezier(0.165, 0.84, 0.44, 1) |
| Painted layers | div.draggable-none.fixed.inset-0 1440.0x900.0 bg #000000 @ 0.5 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 1440 x 900 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | #000000 @ 0.4 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none 0.2s cubic-bezier(0.165, 0.84, 0.44, 1) |
| Painted layers | div.draggable-none.fixed.inset-0 1440.0x900.0 bg #000000 @ 0.4 |
| How | at rest |

Crops: none.

#### search-field

Search field row.

Copy: `home-dark-search`. Finder: `() => Q('textarea[aria-label="Search chats and projects"]').parentElement`.

Dark theme.

| Property | default | focus-visible |
|---|---|---|
| Size (w x h) | 670 x 63.98 | = |
| Padding | 17.6px 10px 14.4px 24px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Text node | span.text-muted: Anthropicons-Variable 20px/20px 433.25, #898781 | = |
| Transition | none | = |
| Painted layers | textarea.flex-1.bg-transparent.border-none 544.0x20.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #f0efec 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #20201f | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Light theme.

| Property | light | light-focus-visible |
|---|---|---|
| Size (w x h) | 670 x 63.98 | = |
| Padding | 17.6px 10px 14.4px 24px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 16px/24px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Text node | span.text-muted: Anthropicons-Variable 20px/20px 433.25, #898781 | = |
| Transition | none | = |
| Painted layers | textarea.flex-1.bg-transparent.border-none 544.0x20.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fff | = |
| How | at rest | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Crops: `search-field-default.png`, `search-field-focus-visible.png`, `search-field-light.png`, `search-field-light-focus-visible.png`.

#### search-result

Search result row.

Copy: `home-dark-search`. Finder: `() => Q('[role=option][aria-selected=false]')`.

Dark theme.

| Property | default | hover | selected |
|---|---|---|---|
| Size (w x h) | 650 x 36 | = | = |
| Padding | 8px 12px | = | = |
| Gap | 12px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | #ffffff @ 0.075 |
| Box shadow | none | = | = |
| Outline | 2px solid #5598e7 @ 0 offset 2px | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #c3c2b7 | = | #f0efec |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #c3c2b7 | = | span: Anthropicons-Variable 20px/20px 433.25, #f0efec |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.w-full.text-left.px-3 650.0x36.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px | = | button.w-full.text-left.px-3 650.0x36.0 bg #ffffff @ 0.075 r 8px outline 2px solid #5598e7 @ 0 offset 2px |
| How | at rest | mouse hover | at rest, captured selected |

Light theme.

| Property | light | light-hover | light-selected |
|---|---|---|---|
| Size (w x h) | 650 x 36 | = | = |
| Padding | 8px 12px | = | = |
| Gap | 12px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | #0b0b0b @ 0.05 |
| Box shadow | none | = | = |
| Outline | 2px solid #256abf @ 0 offset 2px | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #52514e | = | #0b0b0b |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #52514e | = | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b |
| Transition | none | = | = |
| Cursor | pointer | = | = |
| Painted layers | button.w-full.text-left.px-3 650.0x36.0 r 8px outline 2px solid #256abf @ 0 offset 2px | = | button.w-full.text-left.px-3 650.0x36.0 bg #0b0b0b @ 0.05 r 8px outline 2px solid #256abf @ 0 offset 2px |
| How | at rest | mouse hover | at rest, captured selected |

Other finders: selected: `() => Q('[role=option][aria-selected=true]')`; light-selected: `() => Q('[role=option][aria-selected=true]')`.

Crops: `search-result-default.png`, `search-result-hover.png`, `search-result-selected.png`, `search-result-light.png`, `search-result-light-hover.png`, `search-result-light-selected.png`.

#### search-result-time

Search result time.

Copy: `home-dark-search`. Finder: `() => T('Today', Q('[data-cds=Dialog]'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 32.89 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 12px/16px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Cursor | pointer |
| Ancestor paint | 1 up button.w-full.text-left.px-3 outline 2px solid #5598e7 @ 0 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 32.89 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 12px/16px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Cursor | pointer |
| Ancestor paint | 1 up button.w-full.text-left.px-3 outline 2px solid #256abf @ 0 |
| How | at rest |

Crops: `search-result-time-default.png`, `search-result-time-light.png`.

#### dialog-close

Dialog close button.

Copy: `home-dark-search`. Finder: `() => Q('[data-cds=Dialog] button[aria-label=Close]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #20201f 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #20201f | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #ffffff @ 0.075 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #20201f 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #20201f 0px 0px 0px 1px inset |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fff | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #0b0b0b @ 0.05 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff 0px 0px 0px 1px inset |

Crops: `dialog-close-default.png`, `dialog-close-hover.png`, `dialog-close-focus-visible.png`, `dialog-close-light.png`, `dialog-close-light-hover.png`, `dialog-close-light-focus-visible.png`.

### Settings

#### settings-dialog

Settings dialog. 1024x800 at 1440: a 192 nav column with a right rule, the General pane to the right.

Copy: `settings-dark-general`. Finder: `() => Q('[data-cds=Dialog]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 1024 x 800 |
| Padding | 0px |
| Border | 1px solid #ffffff @ 0.05 |
| Radius | 12px |
| Background | #1a1a19 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.shrink-0.text-muted: Anthropicons-Variable 20px/20px 433.25, #898781 |
| Transition | opacity, scale 0.2s cubic-bezier(0.165, 0.84, 0.44, 1) |
| Icon | 20 x 20, colour #c3c2b7 |
| Placeholder | "Search" #898781, opacity 1, 14px |
| ::after | 1022px x 798px, absolute, bg #000000 @ 0.5, radius 12px |
| Painted layers | div.draggable-none.fixed.inset-0 1024.0x800.0 bg #1a1a19 border T:1px solid #ffffff @ 0.05 / R:1px solid #ffffff @ 0.05 / B:1px solid #ffffff @ 0.05 / L:1px solid #ffffff @ 0.05 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px; div.draggable-none.fixed.inset-0::after 1022pxx798px bg #000000 @ 0.5 r 12px opacity 0; nav.flex.w-48.shrink-0 192.0x798.0 bg #151515 border R:1px solid #ffffff @ 0.1; div.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.05 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset; button.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.15 r 8px outline 2px solid #5598e7 @ 0 offset 2px; button.flex.h-control.w-full 167.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 1024 x 800 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.shrink-0.text-muted: Anthropicons-Variable 20px/20px 433.25, #898781 |
| Transition | opacity, scale 0.2s cubic-bezier(0.165, 0.84, 0.44, 1) |
| Icon | 20 x 20, colour #52514e |
| Placeholder | "Search" #898781, opacity 1, 14px |
| ::after | 1024px x 800px, absolute, bg #000000 @ 0.4, radius 12px |
| Painted layers | div.draggable-none.fixed.inset-0 1024.0x800.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px; div.draggable-none.fixed.inset-0::after 1024pxx800px bg #000000 @ 0.4 r 12px opacity 0; nav.flex.w-48.shrink-0 192.0x800.0 bg #fcfcfb border R:1px solid #0b0b0b @ 0.1; div.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.5 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset; button.flex.h-control.w-full 167.0x32.0 bg #0b0b0b @ 0.1 r 8px outline 2px solid #256abf @ 0 offset 2px; button.flex.h-control.w-full 167.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px |
| How | at rest |

Crops: `settings-dialog-default.png`, `settings-dialog-light.png`.

#### settings-nav

Settings nav column.

Copy: `settings-dark-general`. Finder: `() => Q('nav[aria-label=Settings]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 192 x 798 |
| Padding | 0px |
| Gap | 12px |
| Border | T: none; R: 1px solid #ffffff @ 0.1; B: none; L: none |
| Radius | 0px |
| Background | #151515 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.shrink-0.text-muted: Anthropicons-Variable 20px/20px 433.25, #898781 |
| Transition | none |
| Icon | 20 x 20, colour #c3c2b7 |
| Placeholder | "Search" #898781, opacity 1, 14px |
| Painted layers | nav.flex.w-48.shrink-0 192.0x798.0 bg #151515 border R:1px solid #ffffff @ 0.1; div.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.05 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset; button.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.15 r 8px outline 2px solid #5598e7 @ 0 offset 2px; button.flex.h-control.w-full 167.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px; button.flex.h-control.w-full 167.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px; button.flex.h-control.w-full 167.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px |
| Ancestor paint | 1 up div.draggable-none.fixed.inset-0 bg #1a1a19 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 192 x 800 |
| Padding | 0px |
| Gap | 12px |
| Border | T: none; R: 1px solid #0b0b0b @ 0.1; B: none; L: none |
| Radius | 0px |
| Background | #fcfcfb |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.shrink-0.text-muted: Anthropicons-Variable 20px/20px 433.25, #898781 |
| Transition | none |
| Icon | 20 x 20, colour #52514e |
| Placeholder | "Search" #898781, opacity 1, 14px |
| Painted layers | nav.flex.w-48.shrink-0 192.0x800.0 bg #fcfcfb border R:1px solid #0b0b0b @ 0.1; div.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.5 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset; button.flex.h-control.w-full 167.0x32.0 bg #0b0b0b @ 0.1 r 8px outline 2px solid #256abf @ 0 offset 2px; button.flex.h-control.w-full 167.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px; button.flex.h-control.w-full 167.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px; button.flex.h-control.w-full 167.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px |
| Ancestor paint | 1 up div.draggable-none.fixed.inset-0 bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px |
| How | at rest |

Crops: `settings-nav-default.png`, `settings-nav-light.png`.

#### settings-search

Settings search field.

Copy: `settings-dark-general`. Finder: `() => Q('nav[aria-label=Settings] [role=button]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 167 x 32 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span.shrink-0.text-muted: Anthropicons-Variable 20px/20px 433.25, #898781 | = | = |
| Transition | none | = | = |
| Cursor | default | = | = |
| Placeholder | "Search" #898781, opacity 1, 14px | = | = |
| Painted layers | div.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.05 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset | div.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.05 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.2 0px 0px 0px 1px inset | div.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.05 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; input.cds-input.hide-focus-ring.min-w-0 119.0x20.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Ancestor paint | 3 up div.draggable-none.fixed.inset-0 bg #1a1a19 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 167 x 32 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span.shrink-0.text-muted: Anthropicons-Variable 20px/20px 433.25, #898781 | = | = |
| Transition | none | = | = |
| Cursor | default | = | = |
| Placeholder | "Search" #898781, opacity 1, 14px | = | = |
| Painted layers | div.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.5 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset | div.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.5 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.2 0px 0px 0px 1px inset | div.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.5 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; input.cds-input.hide-focus-ring.min-w-0 119.0x20.0 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px |
| Ancestor paint | 3 up div.draggable-none.fixed.inset-0 bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |

Crops: `settings-search-default.png`, `settings-search-hover.png`, `settings-search-focus-visible.png`, `settings-search-light.png`, `settings-search-light-hover.png`, `settings-search-light-focus-visible.png`.

#### settings-nav-label

Settings nav group label.

Copy: `settings-dark-general`. Finder: `() => T('Customize', Q('nav[aria-label=Settings]'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 167 x 29 |
| Padding | 12px 8px 0px 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 12px/17px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Ancestor paint | 3 up div.draggable-none.fixed.inset-0 bg #1a1a19 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 167 x 29 |
| Padding | 12px 8px 0px 8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 12px/17px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Ancestor paint | 3 up div.draggable-none.fixed.inset-0 bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px |
| How | at rest |

Crops: `settings-nav-label-default.png`, `settings-nav-label-light.png`.

#### settings-nav-item

Settings nav item.

Copy: `settings-dark-general`. Finder: `() => Q('[data-testid=account-settings]')`.

Dark theme.

| Property | default | hover | focus-visible | active | active-hover |
|---|---|---|---|---|---|
| Size (w x h) | 167 x 32 | = | = | = | = |
| Padding | 0px | = | = | = | = |
| Border | none | = | = | = | = |
| Radius | 0px | = | = | = | = |
| Background | transparent | = | = | = | = |
| Box shadow | none | = | = | = | = |
| Outline | none | = | = | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #f0efec | = | = | = | = |
| Text node | span.shrink-0.text-secondary: Anthropicons-Variable 20px/20px 433.25, #c3c2b7 | = | = | = | = |
| Transition | none | = | = | = | = |
| Painted layers | button.flex.h-control.w-full 167.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px | button.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.075 r 8px outline 2px solid #5598e7 @ 0 offset 2px | button.flex.h-control.w-full 167.0x32.0 r 8px outline 2px solid #5598e7 offset 2px | button.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.15 r 8px outline 2px solid #5598e7 @ 0 offset 2px | button.flex.h-control.w-full 167.0x32.0 bg #ffffff @ 0.15 r 8px outline 2px solid #5598e7 @ 0 offset 2px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) | at rest, captured active | mouse hover |

Light theme.

| Property | light | light-hover | light-focus-visible | light-active | light-active-hover |
|---|---|---|---|---|---|
| Size (w x h) | 167 x 32 | = | = | = | = |
| Padding | 0px | = | = | = | = |
| Border | none | = | = | = | = |
| Radius | 0px | = | = | = | = |
| Background | transparent | = | = | = | = |
| Box shadow | none | = | = | = | = |
| Outline | none | = | = | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #0b0b0b | = | = | = | = |
| Text node | span.shrink-0.text-secondary: Anthropicons-Variable 20px/20px 433.25, #52514e | = | = | = | = |
| Transition | none | = | = | = | = |
| Painted layers | button.flex.h-control.w-full 167.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px | button.flex.h-control.w-full 167.0x32.0 bg #0b0b0b @ 0.05 r 8px outline 2px solid #256abf @ 0 offset 2px | button.flex.h-control.w-full 167.0x32.0 r 8px outline 2px solid #256abf offset 2px | button.flex.h-control.w-full 167.0x32.0 bg #0b0b0b @ 0.1 r 8px outline 2px solid #256abf @ 0 offset 2px | button.flex.h-control.w-full 167.0x32.0 bg #0b0b0b @ 0.1 r 8px outline 2px solid #256abf @ 0 offset 2px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) | at rest, captured active | mouse hover |

Other finders: active: `() => Q('[data-testid=general-settings]')`; active-hover: `() => Q('[data-testid=general-settings]')`; light-active: `() => Q('[data-testid=general-settings]')`; light-active-hover: `() => Q('[data-testid=general-settings]')`.

Crops: `settings-nav-item-default.png`, `settings-nav-item-hover.png`, `settings-nav-item-focus-visible.png`, `settings-nav-item-active.png`, `settings-nav-item-active-hover.png`, `settings-nav-item-light.png`, `settings-nav-item-light-hover.png`, `settings-nav-item-light-focus-visible.png`, `settings-nav-item-light-active.png`, `settings-nav-item-light-active-hover.png`.

#### settings-section-title

Settings section title (h3).

Copy: `settings-dark-general`. Finder: `() => T('Appearance')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 87.94 x 20 |
| Padding | 0px |
| Gap | 4px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | h3.text-heading-semibold.text-primary.settings-row-title: anthropic-sans 15px/20px 580, #f0efec |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 88.47 x 20 |
| Padding | 0px |
| Gap | 4px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | h3.text-heading-semibold.text-primary.settings-row-title: anthropic-sans 15px/20px 580, #0b0b0b |
| Transition | none |
| How | at rest |

Crops: `settings-section-title-default.png`, `settings-section-title-light.png`.

#### settings-row

Settings row. Title (and an optional description) at the start, the control at the end; groups separated by hairlines (.settings-group-dividers).

Copy: `settings-dark-general`. Finder: `() => C(T('Theme', Q('[data-cds=Dialog]')), '[role=group]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 782 x 56 |
| Padding | 12px 0px |
| Gap | 28px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.settings-row-title.inline-block.align-top: anthropic-sans 14px/20px 400, #f0efec |
| Transition | none |
| Placeholder | "" #f0efec, opacity 1, 14px |
| Painted layers | div.relative.inline-flex.w-fit 92.0x32.0 bg #ffffff @ 0.05 r 8px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-border hsl(from #fff h s l / 10%); --cds-radius calc(.5rem * 1); --cds-segmented-control-thumb hsl(from #fff h s l / 10%); --cds-segmented-control-track hsl(from #fff h s l / 5%) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 784 x 56 |
| Padding | 12px 0px |
| Gap | 28px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.settings-row-title.inline-block.align-top: anthropic-sans 14px/20px 400, #0b0b0b |
| Transition | none |
| Placeholder | "" #0b0b0b, opacity 1, 14px |
| Painted layers | div.relative.inline-flex.w-fit 92.0x32.0 bg #0b0b0b @ 0.05 r 8px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-border hsl(from #0b0b0b h s l / 10%); --cds-radius calc(.5rem * 1); --cds-segmented-control-thumb #fff; --cds-segmented-control-track hsl(from #0b0b0b h s l / 5%) |
| How | at rest |

Crops: `settings-row-default.png`, `settings-row-light.png`.

#### settings-row-title

Settings row title.

Copy: `settings-dark-general`. Finder: `() => T('Chat font', Q('[data-cds=Dialog]'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 62.08 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 62.58 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none |
| How | at rest |

Crops: `settings-row-title-default.png`, `settings-row-title-light.png`.

#### settings-row-desc

Settings row description.

Copy: `settings-dark-general`. Finder: `() => TS('Get notified when Claude has finished')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 718 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 720 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| How | at rest |

Crops: `settings-row-desc-default.png`, `settings-row-desc-light.png`.

#### settings-divider-group

Settings row group.

Copy: `settings-dark-general`. Finder: `() => Q('.settings-group-dividers')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 782 x 182 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.settings-row-title.inline-block.align-top: anthropic-sans 14px/20px 400, #f0efec |
| Transition | none |
| Placeholder | "" #f0efec, opacity 1, 14px |
| Painted layers | div.relative.inline-flex.w-fit 92.0x32.0 bg #ffffff @ 0.05 r 8px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; div.flex.items-center.justify-between 782.0x57.0 border T:1px solid #ffffff @ 0.05; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-border hsl(from #fff h s l / 10%); --cds-radius calc(.5rem * 1); --cds-segmented-control-thumb hsl(from #fff h s l / 10%); --cds-segmented-control-track hsl(from #fff h s l / 5%) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 784 x 182 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.settings-row-title.inline-block.align-top: anthropic-sans 14px/20px 400, #0b0b0b |
| Transition | none |
| Placeholder | "" #0b0b0b, opacity 1, 14px |
| Painted layers | div.relative.inline-flex.w-fit 92.0x32.0 bg #0b0b0b @ 0.05 r 8px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; div.flex.items-center.justify-between 784.0x57.0 border T:1px solid #0b0b0b @ 0.05; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-border hsl(from #0b0b0b h s l / 10%); --cds-radius calc(.5rem * 1); --cds-segmented-control-thumb #fff; --cds-segmented-control-track hsl(from #0b0b0b h s l / 5%) |
| How | at rest |

Crops: `settings-divider-group-default.png`, `settings-divider-group-light.png`.

#### theme-picker

Theme picker. Three icon segments: System, Light, Dark.

Copy: `settings-dark-general`. Finder: `() => Q('[data-cds=SegmentedControl][aria-label=Theme]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 92 x 32 |
| Padding | 1px |
| Border | none |
| Radius | 8px |
| Background | #ffffff @ 0.05 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec |
| Transition | none |
| Placeholder | "" #f0efec, opacity 1, 14px |
| Painted layers | div.relative.inline-flex.w-fit 92.0x32.0 bg #ffffff @ 0.05 r 8px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-border hsl(from #fff h s l / 10%); --cds-radius calc(.5rem * 1); --cds-segmented-control-thumb hsl(from #fff h s l / 10%); --cds-segmented-control-track hsl(from #fff h s l / 5%) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 92 x 32 |
| Padding | 1px |
| Border | none |
| Radius | 8px |
| Background | #0b0b0b @ 0.05 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b |
| Transition | none |
| Placeholder | "" #0b0b0b, opacity 1, 14px |
| Painted layers | div.relative.inline-flex.w-fit 92.0x32.0 bg #0b0b0b @ 0.05 r 8px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-border hsl(from #0b0b0b h s l / 10%); --cds-radius calc(.5rem * 1); --cds-segmented-control-thumb #fff; --cds-segmented-control-track hsl(from #0b0b0b h s l / 5%) |
| How | at rest |

Crops: `theme-picker-default.png`, `theme-picker-light.png`.

#### theme-option

Theme option.

Copy: `settings-dark-general`. Finder: `() => Q('[role=radio][aria-label=Light]')`.

Dark theme.

| Property | default | hover | focus-visible | checked |
|---|---|---|---|---|
| Size (w x h) | 30 x 30 | = | - | = |
| Padding | 0px | = | - | = |
| Gap | 6px | = | - | = |
| Border | none | = | - | = |
| Radius | 6px | = | - | = |
| Background | transparent | = | - | = |
| Box shadow | none | = | - | = |
| Outline | none | = | - | = |
| Font | anthropic-sans 14px/20px 400 | = | - | = |
| Letter spacing | normal | = | - | = |
| Colour | #898781 | #f0efec | - | #f0efec |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #898781 | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | - | span: Anthropicons-Variable 20px/20px 433.25, #f0efec |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | - | = |
| Cursor | default | = | - | = |
| Ancestor paint | 1 up div.relative.inline-flex.w-fit bg #ffffff @ 0.05 | = | - | = |
| Tokens | --cds-radius calc(.5rem * 1) | = | - | = |
| How | at rest | mouse hover | - | at rest, captured checked |
| Skipped | - | = | not focusable in the static copy (no tabindex) | = |

Light theme.

| Property | light | light-hover | light-focus-visible | light-checked |
|---|---|---|---|---|
| Size (w x h) | 30 x 30 | = | - | = |
| Padding | 0px | = | - | = |
| Gap | 6px | = | - | = |
| Border | none | = | - | = |
| Radius | 6px | = | - | = |
| Background | transparent | = | - | = |
| Box shadow | none | = | - | = |
| Outline | none | = | - | = |
| Font | anthropic-sans 14px/20px 400 | = | - | = |
| Letter spacing | normal | = | - | = |
| Colour | #898781 | #0b0b0b | - | #0b0b0b |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #898781 | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | - | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | - | = |
| Cursor | default | = | - | = |
| Ancestor paint | 1 up div.relative.inline-flex.w-fit bg #0b0b0b @ 0.05 | = | - | = |
| Tokens | --cds-radius calc(.5rem * 1) | = | - | = |
| How | at rest | mouse hover | - | at rest, captured checked |
| Skipped | - | = | not focusable in the static copy (no tabindex) | = |

Other finders: checked: `() => Q('[role=radio][aria-label=System]')`; light-checked: `() => Q('[role=radio][aria-label=System]')`.

Crops: `theme-option-default.png`, `theme-option-hover.png`, `theme-option-checked.png`, `theme-option-light.png`, `theme-option-light-hover.png`, `theme-option-light-checked.png`.

#### text-segment

Text segmented control (Motion).

Copy: `settings-dark-general`. Finder: `() => Q('[data-cds=SegmentedControl][aria-label=Motion]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 156.42 x 32 |
| Padding | 1px |
| Border | none |
| Radius | 8px |
| Background | #ffffff @ 0.05 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.cds-reset.relative.inline-flex: anthropic-sans 14px/20px 400, #f0efec |
| Transition | none |
| Placeholder | "" #f0efec, opacity 1, 14px |
| Painted layers | div.relative.inline-flex.w-fit 156.4x32.0 bg #ffffff @ 0.05 r 8px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-border hsl(from #fff h s l / 10%); --cds-radius calc(.5rem * 1); --cds-segmented-control-thumb hsl(from #fff h s l / 10%); --cds-segmented-control-track hsl(from #fff h s l / 5%) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 157.22 x 32 |
| Padding | 1px |
| Border | none |
| Radius | 8px |
| Background | #0b0b0b @ 0.05 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.cds-reset.relative.inline-flex: anthropic-sans 14px/20px 400, #0b0b0b |
| Transition | none |
| Placeholder | "" #0b0b0b, opacity 1, 14px |
| Painted layers | div.relative.inline-flex.w-fit 157.2x32.0 bg #0b0b0b @ 0.05 r 8px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-border hsl(from #0b0b0b h s l / 10%); --cds-radius calc(.5rem * 1); --cds-segmented-control-thumb #fff; --cds-segmented-control-track hsl(from #0b0b0b h s l / 5%) |
| How | at rest |

Crops: `text-segment-default.png`, `text-segment-light.png`.

#### select

Select (Chat font). cds Combobox: the value and a chevron in a control-height field.

Copy: `settings-dark-general`. Finder: `() => Q('[data-cds=Combobox]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 140.36 x 32 | = | = |
| Padding | 0px 8px 0px 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #ffffff @ 0.075 | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span.block.truncate: anthropic-serif 14px/20px 400, #f0efec | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter, display, content-visibility, overlay, pointer-events 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |
| Painted layers | - | div.cds-reset.group/cbx.inline-flex 140.4x32.0 bg #ffffff @ 0.075 r 8px | div.cds-reset.group/cbx.inline-flex 140.4x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 141.42 x 32 | = | = |
| Padding | 0px 8px 0px 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | #0b0b0b @ 0.05 | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span.block.truncate: anthropic-serif 14px/20px 400, #0b0b0b | = | = |
| Transition | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter, display, content-visibility, overlay, pointer-events 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab (on the field inside) |
| Painted layers | - | div.cds-reset.group/cbx.inline-flex 141.4x32.0 bg #0b0b0b @ 0.05 r 8px | div.cds-reset.group/cbx.inline-flex 141.4x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |

Crops: `select-default.png`, `select-hover.png`, `select-focus-visible.png`, `select-light.png`, `select-light-hover.png`, `select-light-focus-visible.png`.

#### switch

Switch. 36x20 track (--cds-switch-track), a 16px knob with shadow-sm that slides on --cds-dur-snap.

Copy: `settings-dark-general`. Finder: `() => Q('[role=switch][aria-checked=false]')`.

Dark theme.

| Property | default | hover | focus-visible | on | on-hover |
|---|---|---|---|---|---|
| Size (w x h) | 36 x 20 | = | = | = | = |
| Padding | 2px | = | = | = | = |
| Border | none | = | = | = | = |
| Radius | 3.35544e+07px | = | = | = | = |
| Background | #ffffff @ 0.1 | #ffffff @ 0.2 | = | #2a78d6 | #3987e5 |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px | = | = |
| Outline | none | = | = | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #f0efec | = | = | = | = |
| Transition | none | = | = | = | = |
| Cursor | default | = | = | = | = |
| Painted layers | span.cds-reset.relative.inline-flex 36.0x20.0 bg #ffffff @ 0.1 r 3.35544e+07px; span.block.rounded-full.shadow-sm 16.0x16.0 bg #ffffff r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px | span.cds-reset.relative.inline-flex 36.0x20.0 bg #ffffff @ 0.2 r 3.35544e+07px; span.block.rounded-full.shadow-sm 16.0x16.0 bg #ffffff r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px | span.cds-reset.relative.inline-flex 36.0x20.0 bg #ffffff @ 0.1 r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.block.rounded-full.shadow-sm 16.0x16.0 bg #ffffff r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px | span.cds-reset.relative.inline-flex 36.0x20.0 bg #2a78d6 r 3.35544e+07px; span.block.rounded-full.shadow-sm 16.0x16.0 bg #ffffff r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px | span.cds-reset.relative.inline-flex 36.0x20.0 bg #3987e5 r 3.35544e+07px; span.block.rounded-full.shadow-sm 16.0x16.0 bg #ffffff r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px |
| Tokens | --cds-switch-h calc(1.25rem * 1); --cds-switch-knob #fff; --cds-switch-track hsl(from #fff h s l / 10%); --cds-switch-track-hover hsl(from #fff h s l / 20%) | = | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured on | mouse hover |

Light theme.

| Property | light | light-hover | light-focus-visible | light-on | light-on-hover |
|---|---|---|---|---|---|
| Size (w x h) | 36 x 20 | = | = | = | = |
| Padding | 2px | = | = | = | = |
| Border | none | = | = | = | = |
| Radius | 3.35544e+07px | = | = | = | = |
| Background | #0b0b0b @ 0.2 | #0b0b0b @ 0.35 | = | #2a78d6 | #3987e5 |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px | = | = |
| Outline | none | = | = | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #0b0b0b | = | = | = | = |
| Transition | none | = | = | = | = |
| Cursor | default | = | = | = | = |
| Painted layers | span.cds-reset.relative.inline-flex 36.0x20.0 bg #0b0b0b @ 0.2 r 3.35544e+07px; span.block.rounded-full.shadow-sm 16.0x16.0 bg #ffffff r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px | span.cds-reset.relative.inline-flex 36.0x20.0 bg #0b0b0b @ 0.35 r 3.35544e+07px; span.block.rounded-full.shadow-sm 16.0x16.0 bg #ffffff r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px | span.cds-reset.relative.inline-flex 36.0x20.0 bg #0b0b0b @ 0.2 r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.block.rounded-full.shadow-sm 16.0x16.0 bg #ffffff r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px | span.cds-reset.relative.inline-flex 36.0x20.0 bg #2a78d6 r 3.35544e+07px; span.block.rounded-full.shadow-sm 16.0x16.0 bg #ffffff r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px | span.cds-reset.relative.inline-flex 36.0x20.0 bg #3987e5 r 3.35544e+07px; span.block.rounded-full.shadow-sm 16.0x16.0 bg #ffffff r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px |
| Tokens | --cds-switch-h calc(1.25rem * 1); --cds-switch-knob #fff; --cds-switch-track hsl(from #0b0b0b h s l / 20%); --cds-switch-track-hover hsl(from #0b0b0b h s l / 35%) | = | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured on | mouse hover |

Other finders: on: `() => Q('[role=switch][aria-checked=true]')`; on-hover: `() => Q('[role=switch][aria-checked=true]')`; light-on: `() => Q('[role=switch][aria-checked=true]')`; light-on-hover: `() => Q('[role=switch][aria-checked=true]')`.

Crops: `switch-default.png`, `switch-hover.png`, `switch-focus-visible.png`, `switch-on.png`, `switch-on-hover.png`, `switch-light.png`, `switch-light-hover.png`, `switch-light-focus-visible.png`, `switch-light-on.png`, `switch-light-on-hover.png`.

#### switch-knob

Switch knob.

Copy: `settings-dark-general`. Finder: `() => Q('[role=switch] span')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 16 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 3.35544e+07px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | transform, translate, scale, rotate 0.12s cubic-bezier(0.34, 1.3, 0.64, 1) |
| Cursor | default |
| Painted layers | span.block.rounded-full.shadow-sm 16.0x16.0 bg #ffffff r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px |
| Ancestor paint | 1 up span.cds-reset.relative.inline-flex bg #ffffff @ 0.1 |
| Tokens | --cds-switch-h calc(1.25rem * 1); --cds-switch-knob #fff |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 16 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 3.35544e+07px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | transform, translate, scale, rotate 0.12s cubic-bezier(0.34, 1.3, 0.64, 1) |
| Cursor | default |
| Painted layers | span.block.rounded-full.shadow-sm 16.0x16.0 bg #ffffff r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px |
| Ancestor paint | 1 up span.cds-reset.relative.inline-flex bg #0b0b0b @ 0.2 |
| Tokens | --cds-switch-h calc(1.25rem * 1); --cds-switch-knob #fff |
| How | at rest |

Crops: `switch-knob-default.png`, `switch-knob-light.png`.

#### settings-close

Settings close button.

Copy: `settings-dark-general`. Finder: `() => Q('[data-cds=Dialog] button[aria-label=Close]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Ancestor paint | 3 up div.draggable-none.fixed.inset-0 bg #1a1a19 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #ffffff @ 0.075 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Ancestor paint | 3 up div.draggable-none.fixed.inset-0 bg #ffffff shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #0b0b0b @ 0.05 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |

Crops: `settings-close-default.png`, `settings-close-hover.png`, `settings-close-focus-visible.png`, `settings-close-light.png`, `settings-close-light-hover.png`, `settings-close-light-focus-visible.png`.

### Thread

#### transcript

Transcript column. 768 wide (--transcript-width 48rem), centred in the pane.

Copy: `thread-dark`. Finder: `() => Q('[data-testid=transcript-list]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 768 x 3162.5 |
| Padding | 4px 16px 0px 16px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | p.whitespace-pre-wrap.break-words: anthropic-sans 15px/20px 400, #f0efec |
| Transition | none |
| Icon | 32 x 32, colour #f0efec, fill #d97757 |
| Painted layers | div.relative.flex.min-w-0 623.0x308.0 bg #ffffff @ 0.05 r 12px; button.sr-only 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; button.group/status.flex.flex-1 732.0x28.0 outline 2px solid #5598e7 @ 0 offset 2px; div.relative.group/copy.bg-bg-000/50 736.0x834.5 bg #20201f @ 0.5 border T:1px solid #ffffff @ 0.1 / R:1px solid #ffffff @ 0.1 / B:1px solid #ffffff @ 0.1 / L:1px solid #ffffff @ 0.1 r 8px; table 728.0x355.0 border T:1px solid #ffffff @ 0.1 / R:1px solid #ffffff @ 0.1 / B:1px solid #ffffff @ 0.1 / L:1px solid #ffffff @ 0.1 r 8px; th 184.9x39.0 bg #ffffff @ 0.05 border B:1px solid #ffffff @ 0.1 r 7px 0px 0px |
| Tokens | --cds-bg-user-message hsl(from #fff h s l / 5%); --cds-message-bubble-measure (unset); --cds-message-bubble-pad-x (unset); --cds-message-bubble-pad-y (unset); --cds-message-bubble-radius (unset); --chat-list-inset (unset); --df-ceded-gutter 0px; --msg-assistant-pb (unset); --msg-block-inset 0px; --msg-gap (unset) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 768 x 3162.5 |
| Padding | 4px 16px 0px 16px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | p.whitespace-pre-wrap.break-words: anthropic-sans 15px/20px 400, #0b0b0b |
| Transition | none |
| Icon | 32 x 32, colour #0b0b0b, fill #d97757 |
| Painted layers | div.relative.flex.min-w-0 623.0x308.0 bg #0b0b0b @ 0.05 r 12px; button.sr-only 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; button.group/status.flex.flex-1 732.0x28.0 outline 2px solid #256abf @ 0 offset 2px; div.relative.group/copy.bg-bg-000/50 736.0x834.5 bg #ffffff @ 0.5 border T:1px solid #0b0b0b @ 0.1 / R:1px solid #0b0b0b @ 0.1 / B:1px solid #0b0b0b @ 0.1 / L:1px solid #0b0b0b @ 0.1 r 8px; table 728.0x355.0 border T:1px solid #0b0b0b @ 0.1 / R:1px solid #0b0b0b @ 0.1 / B:1px solid #0b0b0b @ 0.1 / L:1px solid #0b0b0b @ 0.1 r 8px; th 185.7x39.0 bg #0b0b0b @ 0.05 border B:1px solid #0b0b0b @ 0.1 r 7px 0px 0px |
| Tokens | --cds-bg-user-message hsl(from #0b0b0b h s l / 5%); --cds-message-bubble-measure (unset); --cds-message-bubble-pad-x (unset); --cds-message-bubble-pad-y (unset); --cds-message-bubble-radius (unset); --chat-list-inset (unset); --df-ceded-gutter 0px; --msg-assistant-pb (unset); --msg-block-inset 0px; --msg-gap (unset) |
| How | at rest |

Crops: `transcript-default.png`, `transcript-light.png`.

#### user-message

User message bubble. Right-aligned, at most 85% of the column (--cds-message-bubble-measure), --cds-bg-user-message, radius --cds-message-bubble-radius, padding pad-md / pad-lg.

Copy: `thread-dark`, `thread-dark-followup`. Finder: `() => P(Q('[data-testid=user-message]'))`.

Dark theme.

| Property | default | short |
|---|---|---|
| Size (w x h) | 623 x 308 | 285.83 x 44 |
| Padding | 12px 16px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | #ffffff @ 0.05 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 15px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Text node | p.whitespace-pre-wrap.break-words: anthropic-sans 15px/20px 400, #f0efec | = |
| Transition | none | = |
| Painted layers | div.relative.flex.min-w-0 623.0x308.0 bg #ffffff @ 0.05 r 12px | div.relative.flex.min-w-0 285.8x44.0 bg #ffffff @ 0.05 r 12px |
| Tokens | --cds-bg-user-message hsl(from #fff h s l / 5%); --cds-message-bubble-measure 85%; --cds-message-bubble-pad-x calc(1rem * 1); --cds-message-bubble-pad-y calc(.75rem * 1); --cds-message-bubble-radius calc(calc(.5rem * 1) + calc(.25rem * 1)) | = |
| How | at rest | at rest, captured short |

Light theme.

| Property | light | light-short |
|---|---|---|
| Size (w x h) | 623 x 308 | 287.8 x 44 |
| Padding | 12px 16px | = |
| Gap | 8px | = |
| Border | none | = |
| Radius | 12px | = |
| Background | #0b0b0b @ 0.05 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 15px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Text node | p.whitespace-pre-wrap.break-words: anthropic-sans 15px/20px 400, #0b0b0b | = |
| Transition | none | = |
| Painted layers | div.relative.flex.min-w-0 623.0x308.0 bg #0b0b0b @ 0.05 r 12px | div.relative.flex.min-w-0 287.8x44.0 bg #0b0b0b @ 0.05 r 12px |
| Tokens | --cds-bg-user-message hsl(from #0b0b0b h s l / 5%); --cds-message-bubble-measure 85%; --cds-message-bubble-pad-x calc(1rem * 1); --cds-message-bubble-pad-y calc(.75rem * 1); --cds-message-bubble-radius calc(calc(.5rem * 1) + calc(.25rem * 1)) | = |
| How | at rest | at rest, captured short |

Other finders: short: `() => P(Q('[data-testid=user-message]'))`; light-short: `() => P(Q('[data-testid=user-message]'))`.

Crops: `user-message-default.png`, `user-message-short.png`, `user-message-light.png`, `user-message-light-short.png`.

#### user-message-text

User message paragraph.

Copy: `thread-dark`. Finder: `() => Q('[data-testid=user-message] p')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 591 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 15px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 591 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 15px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none |
| How | at rest |

Crops: `user-message-text-default.png`, `user-message-text-light.png`.

#### user-message-li

User message list item.

Copy: `thread-dark`. Finder: `() => Q('[data-testid=user-message] li')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 559 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 15px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 559 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 15px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none |
| How | at rest |

Crops: `user-message-li-default.png`, `user-message-li-light.png`.

#### thinking-pill

Thought for 6s. The collapsed reasoning row: text-muted, a caret that shows on hover.

Copy: `thread-dark`. Finder: `() => Q('[data-testid=tool-status-pill]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 732 x 28 | = | = |
| Padding | 4px 0px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | 2px solid #5598e7 @ 0 offset 2px | = | 2px solid #5598e7 offset 2px |
| Font | anthropic-serif 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #898781 | #c3c2b7 | = |
| Text node | span.truncate.font-base: anthropic-sans 14px/20px 400, #898781 | span.truncate.font-base: anthropic-sans 14px/20px 400, #c3c2b7 | = |
| Transition | none | = | outline 0.2s ease |
| Cursor | pointer | = | = |
| Painted layers | button.group/status.flex.flex-1 732.0x28.0 outline 2px solid #5598e7 @ 0 offset 2px | = | button.group/status.flex.flex-1 732.0x28.0 outline 2px solid #5598e7 offset 2px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 732 x 28 | = | = |
| Padding | 4px 0px | = | = |
| Gap | 8px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | 2px solid #256abf @ 0 offset 2px | = | 2px solid #256abf offset 2px |
| Font | anthropic-serif 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #898781 | #52514e | = |
| Text node | span.truncate.font-base: anthropic-sans 14px/20px 400, #898781 | span.truncate.font-base: anthropic-sans 14px/20px 400, #52514e | = |
| Transition | none | = | outline 0.2s ease |
| Cursor | pointer | = | = |
| Painted layers | button.group/status.flex.flex-1 732.0x28.0 outline 2px solid #256abf @ 0 offset 2px | = | button.group/status.flex.flex-1 732.0x28.0 outline 2px solid #256abf offset 2px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `thinking-pill-default.png`, `thinking-pill-hover.png`, `thinking-pill-focus-visible.png`, `thinking-pill-light.png`, `thinking-pill-light-hover.png`, `thinking-pill-light-focus-visible.png`.

#### assistant-prose

Assistant prose block. The response in the chat font (Anthropic Serif by default, .font-claude-response).

Copy: `thread-dark-table`. Finder: `() => Q('[data-cds=Prose]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 736 x 1309.5 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 16px/24px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec |
| Transition | none |
| Painted layers | div.relative.group/copy.bg-bg-000/50 736.0x834.5 bg #20201f @ 0.5 border T:1px solid #ffffff @ 0.1 / R:1px solid #ffffff @ 0.1 / B:1px solid #ffffff @ 0.1 / L:1px solid #ffffff @ 0.1 r 8px; table 728.0x355.0 border T:1px solid #ffffff @ 0.1 / R:1px solid #ffffff @ 0.1 / B:1px solid #ffffff @ 0.1 / L:1px solid #ffffff @ 0.1 r 8px; th 184.9x39.0 bg #ffffff @ 0.05 border B:1px solid #ffffff @ 0.1 r 7px 0px 0px; th 231.8x39.0 bg #ffffff @ 0.05 border B:1px solid #ffffff @ 0.1; th 309.3x39.0 bg #ffffff @ 0.05 border B:1px solid #ffffff @ 0.1 r 0px 7px 0px 0px; td 184.9x63.0 border T:1px solid #ffffff @ 0.1 |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515; --msg-block-radius (unset) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 736 x 1309.5 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b |
| Transition | none |
| Painted layers | div.relative.group/copy.bg-bg-000/50 736.0x834.5 bg #ffffff @ 0.5 border T:1px solid #0b0b0b @ 0.1 / R:1px solid #0b0b0b @ 0.1 / B:1px solid #0b0b0b @ 0.1 / L:1px solid #0b0b0b @ 0.1 r 8px; table 728.0x355.0 border T:1px solid #0b0b0b @ 0.1 / R:1px solid #0b0b0b @ 0.1 / B:1px solid #0b0b0b @ 0.1 / L:1px solid #0b0b0b @ 0.1 r 8px; th 185.7x39.0 bg #0b0b0b @ 0.05 border B:1px solid #0b0b0b @ 0.1 r 7px 0px 0px; th 231.5x39.0 bg #0b0b0b @ 0.05 border B:1px solid #0b0b0b @ 0.1; th 308.8x39.0 bg #0b0b0b @ 0.05 border B:1px solid #0b0b0b @ 0.1 r 0px 7px 0px 0px; td 185.7x63.0 border T:1px solid #0b0b0b @ 0.1 |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb; --msg-block-radius (unset) |
| How | at rest |

Crops: none.

#### prose-paragraph

Assistant paragraph.

Copy: `thread-dark-table`. Finder: `() => T('What changed and why:')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 736 x 24 |
| Padding | 0px 32px 0px 4px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 16px/24px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 736 x 24 |
| Padding | 0px 32px 0px 4px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none |
| How | at rest |

Crops: `prose-paragraph-default.png`, `prose-paragraph-light.png`.

#### code-block

Code block. A half-strength --bg-000 fill, a 1px hairline (the class says border-border-400, which computes to --cds-border), radius 8 (--msg-block-radius); a "markdown" label row, a copy button shown on hover, then the <pre>.

Copy: `thread-dark`. Finder: `() => Q('[role=group][aria-label="markdown code"]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 736 x 834.5 |
| Padding | 0px |
| Border | 1px solid #ffffff @ 0.1 |
| Radius | 8px |
| Background | #20201f @ 0.5 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 16px/24px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec |
| Transition | none |
| Painted layers | div.relative.group/copy.bg-bg-000/50 736.0x834.5 bg #20201f @ 0.5 border T:1px solid #ffffff @ 0.1 / R:1px solid #ffffff @ 0.1 / B:1px solid #ffffff @ 0.1 / L:1px solid #ffffff @ 0.1 r 8px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515; --msg-block-radius (unset) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 736 x 834.5 |
| Padding | 0px |
| Border | 1px solid #0b0b0b @ 0.1 |
| Radius | 8px |
| Background | #ffffff @ 0.5 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b |
| Transition | none |
| Painted layers | div.relative.group/copy.bg-bg-000/50 736.0x834.5 bg #ffffff @ 0.5 border T:1px solid #0b0b0b @ 0.1 / R:1px solid #0b0b0b @ 0.1 / B:1px solid #0b0b0b @ 0.1 / L:1px solid #0b0b0b @ 0.1 r 8px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb; --msg-block-radius (unset) |
| How | at rest |

Crops: `code-block-default.png`, `code-block-light.png`.

#### code-label

Code block language label.

Copy: `thread-dark`. Finder: `() => T('markdown')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 734 x 31 |
| Padding | 14px 14px 0px 14px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 12px/17px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Ancestor paint | 1 up div.relative.group/copy.bg-bg-000/50 bg #20201f @ 0.5 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 734 x 31 |
| Padding | 14px 14px 0px 14px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 12px/17px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Ancestor paint | 1 up div.relative.group/copy.bg-bg-000/50 bg #ffffff @ 0.5 |
| How | at rest |

Crops: `code-label-default.png`, `code-label-light.png`.

#### code-copy

Code block copy button. Shown when the block is hovered.

Copy: `thread-dark`. Finder: `() => document.querySelector('button[aria-label="Copy to clipboard"]')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | default | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = |
| How | at rest | mouse hover on its row |
| Backdrop filter | - | blur(12px) |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 32 x 32 | = |
| Padding | 0px | = |
| Gap | 6px | = |
| Border | none | = |
| Radius | 8px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = |
| Cursor | default | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = |
| How | at rest | mouse hover on its row |
| Backdrop filter | - | blur(12px) |

Crops: `code-copy-default.png`, `code-copy-hover.png`, `code-copy-light.png`, `code-copy-light-hover.png`.

#### code-pre

Code block body.

Copy: `thread-dark`. Finder: `() => Q('pre.code-block__code')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 734 x 801.5 |
| Padding | 14px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-mono 14px/22.75px 400 |
| Letter spacing | normal |
| Colour | #eaecf0 |
| Text node | span: anthropic-mono 14px/22.75px 400, #d3d7de |
| Transition | none |
| Tokens | --msg-block-radius (unset) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 734 x 801.5 |
| Padding | 14px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-mono 14px/22.75px 400 |
| Letter spacing | normal |
| Colour | #eaecf0 |
| Text node | span: anthropic-mono 14px/22.75px 400, #d3d7de |
| Transition | none |
| Tokens | --msg-block-radius (unset) |
| How | at rest |

Crops: none.

#### code-token

Code token (heading marker). Syntax colours are inline styles from the highlighter and do not change with the theme; read them from the dark copy.

Copy: `thread-dark`. Finder: `() => T('#', Q('pre.code-block__code'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 8.41 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-mono 14px/22.75px 400 |
| Letter spacing | normal |
| Colour | #d3d7de |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 8.41 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-mono 14px/22.75px 400 |
| Letter spacing | normal |
| Colour | #d3d7de |
| Transition | none |
| How | at rest |

Crops: `code-token-default.png`, `code-token-light.png`.

#### table

Table.

Copy: `thread-dark-table`. Finder: `() => Q('[data-cds=Prose] table')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 728 x 355 |
| Padding | 0px |
| Border | 1px solid #ffffff @ 0.1 |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 16px/24px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | th: anthropic-serif 16px/24px 500, #f0efec |
| Transition | none |
| Painted layers | table 728.0x355.0 border T:1px solid #ffffff @ 0.1 / R:1px solid #ffffff @ 0.1 / B:1px solid #ffffff @ 0.1 / L:1px solid #ffffff @ 0.1 r 8px; th 184.9x39.0 bg #ffffff @ 0.05 border B:1px solid #ffffff @ 0.1 r 7px 0px 0px; th 231.8x39.0 bg #ffffff @ 0.05 border B:1px solid #ffffff @ 0.1; th 309.3x39.0 bg #ffffff @ 0.05 border B:1px solid #ffffff @ 0.1 r 0px 7px 0px 0px; td 184.9x63.0 border T:1px solid #ffffff @ 0.1; td 231.8x63.0 border T:1px solid #ffffff @ 0.1 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 728 x 355 |
| Padding | 0px |
| Border | 1px solid #0b0b0b @ 0.1 |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | th: anthropic-serif 16px/24px 500, #0b0b0b |
| Transition | none |
| Painted layers | table 728.0x355.0 border T:1px solid #0b0b0b @ 0.1 / R:1px solid #0b0b0b @ 0.1 / B:1px solid #0b0b0b @ 0.1 / L:1px solid #0b0b0b @ 0.1 r 8px; th 185.7x39.0 bg #0b0b0b @ 0.05 border B:1px solid #0b0b0b @ 0.1 r 7px 0px 0px; th 231.5x39.0 bg #0b0b0b @ 0.05 border B:1px solid #0b0b0b @ 0.1; th 308.8x39.0 bg #0b0b0b @ 0.05 border B:1px solid #0b0b0b @ 0.1 r 0px 7px 0px 0px; td 185.7x63.0 border T:1px solid #0b0b0b @ 0.1; td 231.5x63.0 border T:1px solid #0b0b0b @ 0.1 |
| How | at rest |

Crops: `table-default.png`, `table-light.png`.

#### table-th

Table header cell.

Copy: `thread-dark-table`. Finder: `() => T('Original')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 184.92 x 39 |
| Padding | 7px 12px |
| Border | T: none; R: none; B: 1px solid #ffffff @ 0.1; L: none |
| Radius | 7px 0px 0px 0px |
| Background | #ffffff @ 0.05 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 16px/24px 500 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none |
| Painted layers | th 184.9x39.0 bg #ffffff @ 0.05 border B:1px solid #ffffff @ 0.1 r 7px 0px 0px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 185.72 x 39 |
| Padding | 7px 12px |
| Border | T: none; R: none; B: 1px solid #0b0b0b @ 0.1; L: none |
| Radius | 7px 0px 0px 0px |
| Background | #0b0b0b @ 0.05 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 16px/24px 500 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none |
| Painted layers | th 185.7x39.0 bg #0b0b0b @ 0.05 border B:1px solid #0b0b0b @ 0.1 r 7px 0px 0px |
| How | at rest |

Crops: `table-th-default.png`, `table-th-light.png`.

#### table-td

Table cell.

Copy: `thread-dark-table`. Finder: `() => Q('[data-cds=Prose] td')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 184.92 x 62 |
| Padding | 7px 12px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 16px/24px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 185.72 x 62 |
| Padding | 7px 12px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 16px/24px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none |
| How | at rest |

Crops: `table-td-default.png`, `table-td-light.png`.

#### message-actions

Message actions. Copy, rating and retry icon buttons under a response; they reveal on hover of the row (--cds-message-actions-opacity).

Copy: `thread-dark-table`. Finder: `() => Q('[data-cds=MessageActions]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 738 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none |
| Painted layers | button.sr-only 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --msg-text-inset .25rem |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 738 x 24 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none |
| Painted layers | button.sr-only 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --msg-text-inset .25rem |
| How | at rest |

Crops: `message-actions-default.png`, `message-actions-light.png`.

#### message-action

Message action button.

Copy: `thread-dark-table`. Finder: `() => Q('[data-cds=MessageActions] button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 1 x 1 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | 2px solid #5598e7 @ 0 offset 2px | = | 2px solid #5598e7 offset 2px |
| Font | anthropic-sans 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Transition | none | = | outline 0.2s ease |
| Cursor | default | = | = |
| Painted layers | button.sr-only 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px | = | button.sr-only 1.0x1.0 outline 2px solid #5598e7 offset 2px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 1 x 1 | = | = |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | 2px solid #256abf @ 0 offset 2px | = | 2px solid #256abf offset 2px |
| Font | anthropic-sans 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Transition | none | = | outline 0.2s ease |
| Cursor | default | = | = |
| Painted layers | button.sr-only 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px | = | button.sr-only 1.0x1.0 outline 2px solid #256abf offset 2px |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `message-action-default.png`, `message-action-hover.png`, `message-action-focus-visible.png`, `message-action-light.png`, `message-action-light-hover.png`, `message-action-light-focus-visible.png`.

#### jump-to-latest

Scroll to bottom button. Held at opacity 0 at this scroll position; measured as found.

Copy: `thread-dark`. Finder: `() => document.querySelector('[data-testid=jump-to-latest]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 36 x 36 |
| Padding | 4px |
| Border | 1px solid #ffffff @ 0.1 |
| Radius | 3.35544e+07px |
| Background | #20201f @ 0.8 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.07 0px 2px 4px 0px, #000000 @ 0.24 0px 6px 16px 0px |
| Backdrop filter | blur(8px) |
| Outline | 2px solid #5598e7 @ 0 offset 2px |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.relative.mix-blend-luminosity: Anthropicons-Variable 20px/20px 433.25, #f0efec |
| Transition | opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) |
| Opacity | 0 |
| Cursor | default |
| ::before | 34px x 34px, absolute, bg #000000 @ 0, radius 0px |
| Painted layers | button.size-9.inline-flex.items-center 36.0x36.0 bg #20201f @ 0.8 border T:1px solid #ffffff @ 0.1 / R:1px solid #ffffff @ 0.1 / B:1px solid #ffffff @ 0.1 / L:1px solid #ffffff @ 0.1 r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.07 0px 2px 4px 0px, #000000 @ 0.24 0px 6px 16px 0px outline 2px solid #5598e7 @ 0 offset 2px opacity 0 |
| Tokens | --composer-banners-h calc(0px + 0px) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 36 x 36 |
| Padding | 4px |
| Border | 1px solid #0b0b0b @ 0.1 |
| Radius | 3.35544e+07px |
| Background | #ffffff @ 0.8 |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.07 0px 2px 4px 0px, #0b0b0b @ 0.08 0px 6px 16px 0px |
| Backdrop filter | blur(8px) |
| Outline | 2px solid #256abf @ 0 offset 2px |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.relative.mix-blend-luminosity: Anthropicons-Variable 20px/20px 433.25, #0b0b0b |
| Transition | opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) |
| Opacity | 0 |
| Cursor | default |
| ::before | 34px x 34px, absolute, bg #000000 @ 0, radius 0px |
| Painted layers | button.size-9.inline-flex.items-center 36.0x36.0 bg #ffffff @ 0.8 border T:1px solid #0b0b0b @ 0.1 / R:1px solid #0b0b0b @ 0.1 / B:1px solid #0b0b0b @ 0.1 / L:1px solid #0b0b0b @ 0.1 r 3.35544e+07px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.07 0px 2px 4px 0px, #0b0b0b @ 0.08 0px 6px 16px 0px outline 2px solid #256abf @ 0 offset 2px opacity 0 |
| Tokens | --composer-banners-h calc(0px + 0px) |
| How | at rest |

Crops: `jump-to-latest-default.png`, `jump-to-latest-light.png`.

### Pages

#### page-header

Page header. cds PageHeader on a 960 wide page: the title in Anthropic Serif (font-voice) 24/32, actions at the end.

Copy: `artifacts-dark`. Finder: `() => Q('[data-cds=PageHeader]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 960 x 96 |
| Padding | 0px |
| Gap | 16px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | h1.cds-reset.min-w-0.font-voice: anthropic-serif 24px/32px 500, #f0efec |
| Transition | none |
| Painted layers | button.relative.isolate.inline-flex::before 40.5469pxx32px bg #ffffff @ 0.075 r 8px; span.absolute.inset-0.duration-fast 130.8x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515; --cds-page-header-title-leading calc(2rem * 1); --cds-page-header-title-size calc(1.5rem * 1) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 960 x 96 |
| Padding | 0px |
| Gap | 16px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | h1.cds-reset.min-w-0.font-voice: anthropic-serif 24px/32px 500, #0b0b0b |
| Transition | none |
| Painted layers | button.relative.isolate.inline-flex::before 40.6562pxx32px bg #0b0b0b @ 0.05 r 8px; span.absolute.inset-0.duration-fast 131.4x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb; --cds-page-header-title-leading calc(2rem * 1); --cds-page-header-title-size calc(1.5rem * 1) |
| How | at rest |

Crops: `page-header-default.png`, `page-header-light.png`.

#### page-title

Page title (h1).

Copy: `artifacts-dark`, `chats-dark`, `projects-dark`. Finder: `() => Q('[data-cds=PageHeader] h1')`.

Dark theme.

| Property | default | chats | projects |
|---|---|---|---|
| Size (w x h) | 100.08 x 32 | 178.41 x 32 | 91.33 x 32 |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-serif 24px/32px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Transition | none | = | = |
| Tokens | --cds-page-header-title-leading calc(2rem * 1); --cds-page-header-title-size calc(1.5rem * 1) | = | = |
| How | at rest | at rest, captured chats | at rest, captured projects |

Light theme.

| Property | light | light-chats | light-projects |
|---|---|---|---|
| Size (w x h) | 101.06 x 32 | 179.91 x 32 | 92.17 x 32 |
| Padding | 0px | = | = |
| Border | none | = | = |
| Radius | 0px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | = |
| Outline | none | = | = |
| Font | anthropic-serif 24px/32px 500 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Transition | none | = | = |
| Tokens | --cds-page-header-title-leading calc(2rem * 1); --cds-page-header-title-size calc(1.5rem * 1) | = | = |
| How | at rest | at rest, captured chats | at rest, captured projects |

Other finders: chats: `() => Q('[data-cds=PageHeader] h1')`; light-chats: `() => Q('[data-cds=PageHeader] h1')`; projects: `() => Q('[data-cds=PageHeader] h1')`; light-projects: `() => Q('[data-cds=PageHeader] h1')`.

Crops: `page-title-default.png`, `page-title-chats.png`, `page-title-projects.png`, `page-title-light.png`, `page-title-light-chats.png`, `page-title-light-projects.png`.

#### tabs

Tabs.

Copy: `artifacts-dark`. Finder: `() => Q('main [data-cds=Tabs]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 233.64 x 32 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | button.relative.isolate.inline-flex: anthropic-sans 14px/20px 500, #f0efec |
| Transition | none |
| Painted layers | button.relative.isolate.inline-flex::before 40.5469pxx32px bg #ffffff @ 0.075 r 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 234.45 x 32 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | button.relative.isolate.inline-flex: anthropic-sans 14px/20px 500, #0b0b0b |
| Transition | none |
| Painted layers | button.relative.isolate.inline-flex::before 40.6562pxx32px bg #0b0b0b @ 0.05 r 8px |
| How | at rest |

Crops: `tabs-default.png`, `tabs-light.png`.

#### tab

Tab.

Copy: `artifacts-dark`. Finder: `() => C(T('Yours', M()), '[role=tab]')`.

Dark theme.

| Property | default | hover | focus-visible | selected | selected-hover |
|---|---|---|---|---|---|
| Size (w x h) | 61.33 x 32 | = | = | 41.55 x 32 | 41.55 x 32 |
| Padding | 0px 12px | = | = | = | = |
| Gap | 6px | = | = | = | = |
| Border | none | = | = | = | = |
| Radius | 0px | = | = | = | = |
| Background | transparent | = | = | = | = |
| Box shadow | none | = | = | = | = |
| Outline | none | = | = | = | = |
| Font | anthropic-sans 14px/20px 500 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #898781 | #c3c2b7 | = | #f0efec | #f0efec |
| Transition | none | = | outline 0.2s ease | = | = |
| Cursor | default | = | = | = | = |
| ::before | 59.3281px x 32px, absolute, bg #000000 @ 0, radius 8px | 59.3281px x 32px, absolute, bg #ffffff @ 0.075, radius 8px | 59.3281px x 32px, absolute, bg #000000 @ 0, radius 8px, shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px | 40.5469px x 32px, absolute, bg #ffffff @ 0.075, radius 8px | 40.5469px x 32px, absolute, bg #ffffff @ 0.075, radius 8px |
| How | at rest | mouse hover | keyboard: Shift keydown, then focus() | at rest, captured selected | mouse hover |
| Painted layers | - | button.relative.isolate.inline-flex::before 59.3281pxx32px bg #ffffff @ 0.075 r 8px | button.relative.isolate.inline-flex::before 59.3281pxx32px r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px | button.relative.isolate.inline-flex::before 40.5469pxx32px bg #ffffff @ 0.075 r 8px | button.relative.isolate.inline-flex::before 40.5469pxx32px bg #ffffff @ 0.075 r 8px |

Light theme.

| Property | light | light-hover | light-focus-visible | light-selected | light-selected-hover |
|---|---|---|---|---|---|
| Size (w x h) | 61.5 x 32 | = | = | 41.66 x 32 | 41.66 x 32 |
| Padding | 0px 12px | = | = | = | = |
| Gap | 6px | = | = | = | = |
| Border | none | = | = | = | = |
| Radius | 0px | = | = | = | = |
| Background | transparent | = | = | = | = |
| Box shadow | none | = | = | = | = |
| Outline | none | = | = | = | = |
| Font | anthropic-sans 14px/20px 500 | = | = | = | = |
| Letter spacing | normal | = | = | = | = |
| Colour | #898781 | #52514e | = | #0b0b0b | #0b0b0b |
| Transition | none | = | outline 0.2s ease | = | = |
| Cursor | default | = | = | = | = |
| ::before | 59.5px x 32px, absolute, bg #000000 @ 0, radius 8px | 59.5px x 32px, absolute, bg #0b0b0b @ 0.05, radius 8px | 59.5px x 32px, absolute, bg #000000 @ 0, radius 8px, shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px | 40.6562px x 32px, absolute, bg #0b0b0b @ 0.05, radius 8px | 40.6562px x 32px, absolute, bg #0b0b0b @ 0.05, radius 8px |
| How | at rest | mouse hover | keyboard: Shift keydown, then focus() | at rest, captured selected | mouse hover |
| Painted layers | - | button.relative.isolate.inline-flex::before 59.5pxx32px bg #0b0b0b @ 0.05 r 8px | button.relative.isolate.inline-flex::before 59.5pxx32px r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px | button.relative.isolate.inline-flex::before 40.6562pxx32px bg #0b0b0b @ 0.05 r 8px | button.relative.isolate.inline-flex::before 40.6562pxx32px bg #0b0b0b @ 0.05 r 8px |

Other finders: selected: `() => C(T('All', M()), '[role=tab]')`; selected-hover: `() => C(T('All', M()), '[role=tab]')`; light-selected: `() => C(T('All', M()), '[role=tab]')`; light-selected-hover: `() => C(T('All', M()), '[role=tab]')`.

Crops: `tab-default.png`, `tab-hover.png`, `tab-focus-visible.png`, `tab-selected.png`, `tab-selected-hover.png`, `tab-light.png`, `tab-light-hover.png`, `tab-light-focus-visible.png`, `tab-light-selected.png`, `tab-light-selected-hover.png`.

#### header-icon-button

Page header icon button.

Copy: `artifacts-dark`. Finder: `() => Q('button[aria-label="Search your artifacts"]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #ffffff @ 0.075 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #0b0b0b @ 0.05 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |

Crops: `header-icon-button-default.png`, `header-icon-button-hover.png`, `header-icon-button-focus-visible.png`, `header-icon-button-light.png`, `header-icon-button-light-hover.png`, `header-icon-button-light-focus-visible.png`.

#### header-button

Page header button (New project).

Copy: `projects-dark`, `chats-dark`. Finder: `() => C(T('New project', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible | link |
|---|---|---|---|---|
| Size (w x h) | 105.56 x 32 | = | = | 54.53 x 32 |
| Padding | 0px 12px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px | = |
| Outline | none | = | = | = |
| Font | anthropic-sans 14px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #0b0b0b | = | = | = |
| Text node | span.inline-flex.min-w-0.items-center: anthropic-sans 14px/20px 500, #0b0b0b | = | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease | = |
| Cursor | default | = | = | = |
| Painted layers | span.absolute.inset-0.duration-fast 104.6x31.0 bg #ffffff r 8px | span.absolute.inset-0.duration-fast 104.6x31.0 bg #e1e0d9 r 8px | button.cds-reset.group/btn.relative 105.6x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 104.6x31.0 bg #ffffff r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset | span.absolute.inset-0.duration-fast 53.5x31.0 bg #ffffff r 8px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured link |

Light theme.

| Property | light | light-hover | light-focus-visible | light-link |
|---|---|---|---|---|
| Size (w x h) | 105.92 x 32 | = | = | 54.63 x 32 |
| Padding | 0px 12px | = | = | = |
| Gap | 6px | = | = | = |
| Border | none | = | = | = |
| Radius | 8px | = | = | = |
| Background | transparent | = | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px | = |
| Outline | none | = | = | = |
| Font | anthropic-sans 14px/20px 500 | = | = | = |
| Letter spacing | normal | = | = | = |
| Colour | #ffffff | = | = | = |
| Text node | span.inline-flex.min-w-0.items-center: anthropic-sans 14px/20px 500, #ffffff | = | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease | = |
| Cursor | default | = | = | = |
| Painted layers | span.absolute.inset-0.duration-fast 104.9x31.0 bg #0b0b0b r 8px | span.absolute.inset-0.duration-fast 104.9x31.0 bg #2c2c2a r 8px | button.cds-reset.group/btn.relative 105.9x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 104.9x31.0 bg #0b0b0b r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset | span.absolute.inset-0.duration-fast 53.6x31.0 bg #0b0b0b r 8px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab | at rest, captured link |

Other finders: link: `() => Q('main a[data-cds=Button][href$="/new"]')`; light-link: `() => Q('main a[data-cds=Button][href$="/new"]')`.

Crops: `header-button-default.png`, `header-button-hover.png`, `header-button-focus-visible.png`, `header-button-link.png`, `header-button-light.png`, `header-button-light-hover.png`, `header-button-light-focus-visible.png`, `header-button-light-link.png`.

#### notice-card

Notice card.

Copy: `artifacts-dark`. Finder: `() => Q('main [data-cds=Card]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 960 x 138 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | h2.font-semibold.text-primary: anthropic-sans 14px/20px 580, #f0efec |
| Transition | none |
| ::after | 960px x 138px, absolute, bg #000000 @ 0, radius 12px, shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px |
| Painted layers | div.group/card.relative.isolate::after 960pxx138px r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px; span.cds-card-fill.pointer-events-none.absolute 960.0x138.0 bg #151515 r 12px; span.absolute.inset-0.duration-fast 242.3x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; span.absolute.inset-0.duration-fast 212.6x27.0 bg #ffffff r 7px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 960 x 138 |
| Padding | 0px |
| Border | none |
| Radius | 12px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | h2.font-semibold.text-primary: anthropic-sans 14px/20px 580, #0b0b0b |
| Transition | none |
| ::after | 960px x 138px, absolute, bg #000000 @ 0, radius 12px, shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px |
| Painted layers | div.group/card.relative.isolate::after 960pxx138px r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px; span.cds-card-fill.pointer-events-none.absolute 960.0x138.0 bg #fcfcfb r 12px; span.absolute.inset-0.duration-fast 243.8x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; span.absolute.inset-0.duration-fast 213.5x27.0 bg #0b0b0b r 7px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb |
| How | at rest |

Crops: `notice-card-default.png`, `notice-card-light.png`.

#### card-button

Secondary button in a card.

Copy: `artifacts-dark`. Finder: `() => C(TS('Visit the standalone homepage', M()), 'button')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 242.31 x 28 | = | = |
| Padding | 0px 10px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 7px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span.inline-flex.min-w-0.items-center: anthropic-sans 14px/20px 400, #f0efec | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Painted layers | span.absolute.inset-0.duration-fast 242.3x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px | span.absolute.inset-0.duration-fast 242.3x28.0 bg #ffffff @ 0.14 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px | button.cds-reset.group/btn.relative 242.3x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 242.3x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 243.83 x 28 | = | = |
| Padding | 0px 10px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 7px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span.inline-flex.min-w-0.items-center: anthropic-sans 14px/20px 400, #0b0b0b | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Painted layers | span.absolute.inset-0.duration-fast 243.8x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px | span.absolute.inset-0.duration-fast 243.8x28.0 bg #0b0b0b @ 0.05 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px | button.cds-reset.group/btn.relative 243.8x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 243.8x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `card-button-default.png`, `card-button-hover.png`, `card-button-focus-visible.png`, `card-button-light.png`, `card-button-light-hover.png`, `card-button-light-focus-visible.png`.

#### dismiss-button

Dismiss button.

Copy: `artifacts-dark`. Finder: `() => Q('main button[aria-label=Dismiss]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 28 x 28 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 7px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 28.0x28.0 bg #ffffff @ 0.075 r 7px | button.cds-reset.group/btn.relative 28.0x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 28.0x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 28 x 28 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 7px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 28.0x28.0 bg #0b0b0b @ 0.05 r 7px | button.cds-reset.group/btn.relative 28.0x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 28.0x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |

Crops: `dismiss-button-default.png`, `dismiss-button-hover.png`, `dismiss-button-focus-visible.png`, `dismiss-button-light.png`, `dismiss-button-light-hover.png`, `dismiss-button-light-focus-visible.png`.

#### section-caption

Section caption (Make something new).

Copy: `artifacts-dark`. Finder: `() => T('Make something new')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 960 x 17 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 12px/17px 500 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 960 x 17 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 12px/17px 500 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| How | at rest |

Crops: `section-caption-default.png`, `section-caption-light.png`.

#### template-card

Make something new card. 136 wide: a preview tile with --cds-radius-composer, then the name and a Beta badge.

Copy: `artifacts-dark`. Finder: `() => Q('button[aria-label="Docs, Beta"]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 136 x 119 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 14px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span.truncate: anthropic-sans 13px/17px 500, #f0efec | = | = |
| Transition | transform, translate, scale, rotate 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Icon | 5 x 5, colour #f0efec, stroke #ffffff 1.6px | = | = |
| Painted layers | span.w-34.relative.block 136.0x96.0 bg #1a1a19 r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px; span.w-34.relative.block::after 136pxx96px r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #000000 @ 0 0px 0px 0px 0px; span.absolute.inset-0.block 124.0x84.0 image linear-gradient(#256abf @ 0.24 0%, #256abf @ 0.15 35%, #256abf @ 0.07 70%, color(srgb 0.14; span.absolute.block.overflow-hidden 48.0x66.0 bg #588dce @ 0.183 r 5px shadow #ffffff @ 0.15 0px 0px 0px 1px, #256abf @ 0.12 0px 2px 6px 0px; span.absolute.block 22.0x5.0 bg #6294d1 r 9999px; span.absolute.block 23.0x3.5 bg #6294d1 @ 0.35 r 9999px | span.w-34.relative.block 136.0x96.0 bg #1a1a19 r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.07 0px 2px 4px 0px, #000000 @ 0.24 0px 6px 16px 0px; span.w-34.relative.block::after 136pxx96px r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #256abf @ 0.5 0px 0px 0px 1px inset, #000000 @ 0 0px 0px 0px 0px; span.absolute.inset-0.block 124.0x84.0 image linear-gradient(#256abf @ 0.24 0%, #256abf @ 0.15 35%, #256abf @ 0.07 70%, color(srgb 0.14; span.absolute.block.overflow-hidden 48.0x66.0 bg #588dce @ 0.183 r 5px shadow #ffffff @ 0.15 0px 0px 0px 1px, #256abf @ 0.12 0px 2px 6px 0px; span.absolute.block 22.0x5.0 bg #6294d1 r 9999px; span.absolute.block 23.0x3.5 bg #6294d1 @ 0.35 r 9999px | button.group.flex.w-34 136.0x119.0 r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.w-34.relative.block 136.0x96.0 bg #1a1a19 r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #000000 @ 0.24 0px 2px 8px 0px; span.w-34.relative.block::after 136pxx96px r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #000000 @ 0 0px 0px 0px 0px; span.absolute.inset-0.block 124.0x84.0 image linear-gradient(#256abf @ 0.24 0%, #256abf @ 0.15 35%, #256abf @ 0.07 70%, color(srgb 0.14; span.absolute.block.overflow-hidden 48.0x66.0 bg #588dce @ 0.183 r 5px shadow #ffffff @ 0.15 0px 0px 0px 1px, #256abf @ 0.12 0px 2px 6px 0px; span.absolute.block 22.0x5.0 bg #6294d1 r 9999px |
| Tokens | --cds-rem-scale (unset); --hue (unset); --ink (unset); --neutral (unset); --tile-ring (unset) | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 136 x 119 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 14px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/21px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span.truncate: anthropic-sans 13px/17px 500, #0b0b0b | = | = |
| Transition | transform, translate, scale, rotate 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Icon | 5 x 5, colour #0b0b0b, stroke #ffffff 1.6px | = | = |
| Painted layers | span.w-34.relative.block 136.0x96.0 bg #ffffff r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px; span.w-34.relative.block::after 136pxx96px r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0 0px 0px 0px 0px; span.absolute.inset-0.block 124.0x84.0 image linear-gradient(#256abf @ 0.24 0%, #256abf @ 0.15 35%, #256abf @ 0.07 70%, color(srgb 0.14; span.absolute.block.overflow-hidden 48.0x66.0 bg #ffffff r 5px shadow #0b0b0b @ 0.18 0px 0px 0px 1px, #256abf @ 0.12 0px 2px 6px 0px; span.absolute.block 22.0x5.0 bg #6b9ad3 r 9999px; span.absolute.block 23.0x3.5 bg #256abf @ 0.17 r 9999px | span.w-34.relative.block 136.0x96.0 bg #ffffff r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.07 0px 2px 4px 0px, #0b0b0b @ 0.08 0px 6px 16px 0px; span.w-34.relative.block::after 136pxx96px r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #256abf @ 0.5 0px 0px 0px 1px inset, #000000 @ 0 0px 0px 0px 0px; span.absolute.inset-0.block 124.0x84.0 image linear-gradient(#256abf @ 0.24 0%, #256abf @ 0.15 35%, #256abf @ 0.07 70%, color(srgb 0.14; span.absolute.block.overflow-hidden 48.0x66.0 bg #ffffff r 5px shadow #0b0b0b @ 0.18 0px 0px 0px 1px, #256abf @ 0.12 0px 2px 6px 0px; span.absolute.block 22.0x5.0 bg #6b9ad3 r 9999px; span.absolute.block 23.0x3.5 bg #256abf @ 0.17 r 9999px | button.group.flex.w-34 136.0x119.0 r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.w-34.relative.block 136.0x96.0 bg #ffffff r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.06 0px 1px 2px 0px, #0b0b0b @ 0.08 0px 2px 8px 0px; span.w-34.relative.block::after 136pxx96px r 14px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0 0px 0px 0px 0px; span.absolute.inset-0.block 124.0x84.0 image linear-gradient(#256abf @ 0.24 0%, #256abf @ 0.15 35%, #256abf @ 0.07 70%, color(srgb 0.14; span.absolute.block.overflow-hidden 48.0x66.0 bg #ffffff r 5px shadow #0b0b0b @ 0.18 0px 0px 0px 1px, #256abf @ 0.12 0px 2px 6px 0px; span.absolute.block 22.0x5.0 bg #6b9ad3 r 9999px |
| Tokens | --cds-rem-scale (unset); --hue (unset); --ink (unset); --neutral (unset); --tile-ring (unset) | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |

Crops: `template-card-default.png`, `template-card-hover.png`, `template-card-focus-visible.png`, `template-card-light.png`, `template-card-light-hover.png`, `template-card-light-focus-visible.png`.

#### badge

Badge (Beta).

Copy: `artifacts-dark`, `projects-dark`. Finder: `() => Q('main [data-cds=Badge]')`.

Dark theme.

| Property | default | project |
|---|---|---|
| Size (w x h) | 29.94 x 16 | 108.91 x 20 |
| Padding | 0px 4px | 0px 8px |
| Gap | 4px | = |
| Border | none | = |
| Radius | 4px | 5.5px |
| Background | #ffffff @ 0.05 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 10px/13px 500 | anthropic-sans 12px/15px 500 |
| Letter spacing | normal | = |
| Colour | #c3c2b7 | = |
| Text node | span: anthropic-sans 10px/12px 500, #c3c2b7 | span: anthropic-sans 12px/15px 500, #c3c2b7 |
| Transition | none | = |
| Cursor | default | - |
| Painted layers | span.inline-flex.items-center.gap-1 29.9x16.0 bg #ffffff @ 0.05 r 4px | span.inline-flex.items-center.gap-1 108.9x20.0 bg #ffffff @ 0.05 r 5.5px |
| Tokens | --cds-rem-scale (unset) | - |
| How | at rest | at rest, captured project |
| Ancestor paint | - | 2 up div.group.relative.flex bg #151515 shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px |

Light theme.

| Property | light | light-project |
|---|---|---|
| Size (w x h) | 30.03 x 16 | 109.41 x 20 |
| Padding | 0px 4px | 0px 8px |
| Gap | 4px | = |
| Border | none | = |
| Radius | 4px | 5.5px |
| Background | #0b0b0b @ 0.05 | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 10px/13px 500 | anthropic-sans 12px/15px 500 |
| Letter spacing | normal | = |
| Colour | #52514e | = |
| Text node | span: anthropic-sans 10px/12px 500, #52514e | span: anthropic-sans 12px/15px 500, #52514e |
| Transition | none | = |
| Cursor | default | - |
| Painted layers | span.inline-flex.items-center.gap-1 30.0x16.0 bg #0b0b0b @ 0.05 r 4px | span.inline-flex.items-center.gap-1 109.4x20.0 bg #0b0b0b @ 0.05 r 5.5px |
| Tokens | --cds-rem-scale (unset) | - |
| How | at rest | at rest, captured project |
| Ancestor paint | - | 2 up div.group.relative.flex bg #fcfcfb shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #0b0b0b @ 0.1 0px 0px 0px 0px |

Other finders: project: `() => Q('main [data-cds=Badge]')`; light-project: `() => Q('main [data-cds=Badge]')`.

Crops: `badge-default.png`, `badge-project.png`, `badge-light.png`, `badge-light-project.png`.

#### month-heading

List group heading (September).

Copy: `artifacts-dark`. Finder: `() => T('September', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 984 x 29 |
| Padding | 6px 12px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 12px/17px 500 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 984 x 29 |
| Padding | 6px 12px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 12px/17px 500 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| How | at rest |

Crops: `month-heading-default.png`, `month-heading-light.png`.

#### artifact-row

Artifact list row. Icon, title in text-primary, a muted line ("Shared with you"), then Pin, visibility, Created or Edited with the date, and a more button.

Copy: `artifacts-dark`. Finder: `() => C(T('What if you just did it', M()), 'li')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 984 x 52 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/21px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #c3c2b7 | = |
| Transition | none | = |
| Painted layers | div.flex.h-full.w-full 36.0x36.0 bg #ffffff @ 0.05; button.pointer-events-auto.relative.-my-1 24.0x24.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px opacity 0; span.inline-block.shrink-0.rounded-full 3.0x3.0 bg #ffffff @ 0.2 r 3.35544e+07px | div.grid.items-center.gap-x-md 984.0x52.0 bg #ffffff @ 0.075 r 8px; div.flex.h-full.w-full 36.0x36.0 bg #ffffff @ 0.05; button.pointer-events-auto.relative.-my-1 24.0x24.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px; span.inline-block.shrink-0.rounded-full 3.0x3.0 bg #ffffff @ 0.2 r 3.35544e+07px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515; --list-header-scroll-offset 168px | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 984 x 52 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/21px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #52514e | = |
| Transition | none | = |
| Painted layers | div.flex.h-full.w-full 36.0x36.0 bg #0b0b0b @ 0.05; button.pointer-events-auto.relative.-my-1 24.0x24.0 r 8px outline 2px solid #256abf @ 0 offset 2px opacity 0; span.inline-block.shrink-0.rounded-full 3.0x3.0 bg #0b0b0b @ 0.2 r 3.35544e+07px | div.grid.items-center.gap-x-md 984.0x52.0 bg #0b0b0b @ 0.05 r 8px; div.flex.h-full.w-full 36.0x36.0 bg #0b0b0b @ 0.05; button.pointer-events-auto.relative.-my-1 24.0x24.0 r 8px outline 2px solid #256abf @ 0 offset 2px; span.inline-block.shrink-0.rounded-full 3.0x3.0 bg #0b0b0b @ 0.2 r 3.35544e+07px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb; --list-header-scroll-offset 168px | = |
| How | at rest | mouse hover |

Crops: `artifact-row-default.png`, `artifact-row-hover.png`, `artifact-row-light.png`, `artifact-row-light-hover.png`.

#### artifact-row-meta

Artifact row subtitle.

Copy: `artifacts-dark`. Finder: `() => T('Shared with you', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 130.77 x 32 |
| Padding | 0px 12px |
| Gap | 6px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 500 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Cursor | default |
| ::before | 129.766px x 32px, absolute, bg #000000 @ 0, radius 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 131.3 x 32 |
| Padding | 0px 12px |
| Gap | 6px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 500 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Cursor | default |
| ::before | 130.297px x 32px, absolute, bg #000000 @ 0, radius 8px |
| How | at rest |

Crops: `artifact-row-meta-default.png`, `artifact-row-meta-light.png`.

#### artifact-row-time

Artifact row date.

Copy: `artifacts-dark`. Finder: `() => Q('main li time')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 42.47 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 13px/17px 400 |
| Letter spacing | normal |
| Colour | #c3c2b7 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 42.64 x 16 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 13px/17px 400 |
| Letter spacing | normal |
| Colour | #52514e |
| Transition | none |
| How | at rest |

Crops: `artifact-row-time-default.png`, `artifact-row-time-light.png`.

#### artifact-row-more

Artifact row more button.

Copy: `artifacts-dark`. Finder: `() => Q('main button[aria-label^="More options for What if"]')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515; --list-header-scroll-offset 168px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #ffffff @ 0.075 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 32 x 32 | = | = |
| Padding | 0px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 8px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb; --list-header-scroll-offset 168px | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 32.0x32.0 bg #0b0b0b @ 0.05 r 8px | button.cds-reset.group/btn.relative 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 32.0x32.0 r 8px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |

Crops: `artifact-row-more-default.png`, `artifact-row-more-hover.png`, `artifact-row-more-focus-visible.png`, `artifact-row-more-light.png`, `artifact-row-more-light-hover.png`, `artifact-row-more-light-focus-visible.png`.

#### chats-row

Chats list row. A cds Table row, 53 tall: title, then the relative time in text-muted and a more button.

Copy: `chats-dark`. Finder: `() => C(T('MapReduce intuition explained', M()), 'tr')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 984 x 53 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Text node | span: anthropic-sans 14px/20px 400, #f0efec | = |
| Transition | none | = |
| Transform | matrix(1, 0, 0, 1, 0, 0) | = |
| Cursor | default | = |
| Placeholder | "" #f0efec, opacity 1, 14px | = |
| Painted layers | td.h-7.box-content.px-md 984.0x53.0 border B:1px solid #000000 @ 0 | td.h-7.box-content.px-md 984.0x53.0 bg #ffffff @ 0.075 border B:1px solid #000000 @ 0 r 8px |
| Tokens | --cds-alpha-1 hsl(from #fff h s l / 5%); --cds-checkbox calc(1.25rem * 1); --cds-checkbox-radius calc(.3125rem * 1); --cds-cursor-interactive default; --cds-pad-md calc(.75rem * 1); --cds-page-bg #151515 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 984 x 53 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Text node | span: anthropic-sans 14px/20px 400, #0b0b0b | = |
| Transition | none | = |
| Transform | matrix(1, 0, 0, 1, 0, 0) | = |
| Cursor | default | = |
| Placeholder | "" #0b0b0b, opacity 1, 14px | = |
| Painted layers | td.h-7.box-content.px-md 984.0x53.0 border B:1px solid #000000 @ 0 | td.h-7.box-content.px-md 984.0x53.0 bg #0b0b0b @ 0.05 border B:1px solid #000000 @ 0 r 8px |
| Tokens | --cds-alpha-1 hsl(from #0b0b0b h s l / 5%); --cds-checkbox calc(1.25rem * 1); --cds-checkbox-radius calc(.3125rem * 1); --cds-cursor-interactive default; --cds-pad-md calc(.75rem * 1); --cds-page-bg #fcfcfb | = |
| How | at rest | mouse hover |

Crops: `chats-row-default.png`, `chats-row-hover.png`, `chats-row-light.png`, `chats-row-light-hover.png`.

#### chats-time

Chats row time.

Copy: `chats-dark`. Finder: `() => Q('main tr time')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 74.45 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Cursor | default |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 74.83 x 18 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| Cursor | default |
| How | at rest |

Crops: `chats-time-default.png`, `chats-time-light.png`.

#### project-card

Project card. Two columns of cards: name, an optional badge, a three-line description in text-secondary, the date.

Copy: `projects-dark`. Finder: `() => C(Q('a[href*="/project/"]', 0, M()), 'li')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 468 x 161 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/21px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Text node | a.min-w-0.truncate.text-body: anthropic-sans 14px/20px 500, #f0efec | = |
| Transition | none | = |
| Painted layers | div.group.relative.flex 468.0x161.0 bg #151515 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px; span.inline-flex.items-center.gap-1 108.9x20.0 bg #ffffff @ 0.05 r 5.5px | div.group.relative.flex 468.0x161.0 bg #1a1a19 r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px; span.inline-flex.items-center.gap-1 108.9x20.0 bg #ffffff @ 0.05 r 5.5px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515; --list-header-scroll-offset 136px | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 468 x 161 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/21px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Text node | a.min-w-0.truncate.text-body: anthropic-sans 14px/20px 500, #0b0b0b | = |
| Transition | none | = |
| Painted layers | div.group.relative.flex 468.0x161.0 bg #fcfcfb r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #0b0b0b @ 0.1 0px 0px 0px 0px; span.inline-flex.items-center.gap-1 109.4x20.0 bg #0b0b0b @ 0.05 r 5.5px | div.group.relative.flex 468.0x161.0 bg #ffffff r 12px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #0b0b0b @ 0.1 0px 0px 0px 0px; span.inline-flex.items-center.gap-1 109.4x20.0 bg #0b0b0b @ 0.05 r 5.5px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb; --list-header-scroll-offset 136px | = |
| How | at rest | mouse hover |

Crops: `project-card-default.png`, `project-card-hover.png`, `project-card-light.png`, `project-card-light-hover.png`.

#### breadcrumb

Project breadcrumb.

Copy: `project-dark`. Finder: `() => C(T('Projects', M()), 'a')`.

Dark theme.

| Property | default | hover | focus-visible |
|---|---|---|---|
| Size (w x h) | 75.22 x 28 | = | = |
| Padding | 0px 10px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 7px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #f0efec | = | = |
| Text node | span.min-w-0.truncate.font-base-bold: anthropic-sans 14px/20px 500, #f0efec | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 75.2x28.0 bg #ffffff @ 0.075 r 7px | a.cds-reset.group/btn.relative 75.2x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #184f95 @ 0.6 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 75.2x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #151515 0px 0px 0px 1px inset |

Light theme.

| Property | light | light-hover | light-focus-visible |
|---|---|---|---|
| Size (w x h) | 75.53 x 28 | = | = |
| Padding | 0px 10px | = | = |
| Gap | 6px | = | = |
| Border | none | = | = |
| Radius | 7px | = | = |
| Background | transparent | = | = |
| Box shadow | none | = | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px |
| Outline | none | = | = |
| Font | anthropic-sans 14px/20px 400 | = | = |
| Letter spacing | normal | = | = |
| Colour | #0b0b0b | = | = |
| Text node | span.min-w-0.truncate.font-base-bold: anthropic-sans 14px/20px 500, #0b0b0b | = | = |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) | = | outline 0.2s ease |
| Cursor | default | = | = |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb | = | = |
| How | at rest | mouse hover | keyboard: focus(), Shift+Tab, Tab |
| Painted layers | - | span.absolute.inset-0.duration-fast 75.5x28.0 bg #0b0b0b @ 0.05 r 7px | a.cds-reset.group/btn.relative 75.5x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset, #2a78d6 0px 0px 0px 1px, #cde2fb 0px 0px 6px 1px; span.absolute.inset-0.duration-fast 75.5x28.0 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #fcfcfb 0px 0px 0px 1px inset |

Crops: `breadcrumb-default.png`, `breadcrumb-hover.png`, `breadcrumb-focus-visible.png`, `breadcrumb-light.png`, `breadcrumb-light-hover.png`, `breadcrumb-light-focus-visible.png`.

#### project-title

Project title.

Copy: `project-dark`. Finder: `() => Q('main h1')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 185.13 x 31.19 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 24px/31.2px 500 |
| Letter spacing | normal |
| Colour | #f0efec |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 186.73 x 31.19 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 24px/31.2px 500 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Transition | none |
| How | at rest |

Crops: `project-title-default.png`, `project-title-light.png`.

#### project-section-title

Project section title (Recents).

Copy: `project-dark`. Finder: `() => T('Recents', M())`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 680 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 680 x 20 |
| Padding | 0px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #898781 |
| Transition | none |
| How | at rest |

Crops: `project-section-title-default.png`, `project-section-title-light.png`.

#### project-recent-row

Project recents row.

Copy: `project-dark`. Finder: `() => C(T('startup ideation', M()), 'tr')`.

Dark theme.

| Property | default | hover |
|---|---|---|
| Size (w x h) | 704 x 53 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Background image | linear-gradient(#ffffff @ 0.05, #ffffff @ 0.05) | - |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #f0efec | = |
| Text node | span.min-w-0.truncate.text-body: anthropic-sans 14px/20px 400, #f0efec | = |
| Transition | none | = |
| Transform | matrix(1, 0, 0, 1, 0, 0) | = |
| Cursor | default | = |
| Painted layers | tr.relative.text-body.font-normal 704.0x53.0 image linear-gradient(#ffffff @ 0.05, #ffffff @ 0.05); td.h-7.box-content.px-md 704.0x53.0 border B:1px solid #000000 @ 0 | td.h-7.box-content.px-md 704.0x53.0 bg #ffffff @ 0.075 border B:1px solid #000000 @ 0 r 8px |
| Tokens | --cds-alpha-1 hsl(from #fff h s l / 5%); --cds-cursor-interactive default; --cds-pad-md calc(.75rem * 1); --cds-page-bg #151515 | = |
| How | at rest | mouse hover |

Light theme.

| Property | light | light-hover |
|---|---|---|
| Size (w x h) | 704 x 53 | = |
| Padding | 0px | = |
| Border | none | = |
| Radius | 0px | = |
| Background | transparent | = |
| Background image | linear-gradient(#0b0b0b @ 0.05, #0b0b0b @ 0.05) | - |
| Box shadow | none | = |
| Outline | none | = |
| Font | anthropic-sans 14px/20px 400 | = |
| Letter spacing | normal | = |
| Colour | #0b0b0b | = |
| Text node | span.min-w-0.truncate.text-body: anthropic-sans 14px/20px 400, #0b0b0b | = |
| Transition | none | = |
| Transform | matrix(1, 0, 0, 1, 0, 0) | = |
| Cursor | default | = |
| Painted layers | tr.relative.text-body.font-normal 704.0x53.0 image linear-gradient(#0b0b0b @ 0.05, #0b0b0b @ 0.05); td.h-7.box-content.px-md 704.0x53.0 border B:1px solid #000000 @ 0 | td.h-7.box-content.px-md 704.0x53.0 bg #0b0b0b @ 0.05 border B:1px solid #000000 @ 0 r 8px |
| Tokens | --cds-alpha-1 hsl(from #0b0b0b h s l / 5%); --cds-cursor-interactive default; --cds-pad-md calc(.75rem * 1); --cds-page-bg #fcfcfb | = |
| How | at rest | mouse hover |

Crops: `project-recent-row-default.png`, `project-recent-row-hover.png`, `project-recent-row-light.png`, `project-recent-row-light-hover.png`.

#### instructions-card

Instructions card. The right rail: Instructions, Memory and Context cards, each an h3 with an edit action and a two-line muted preview.

Copy: `project-dark`. Finder: `() => P(T('Instructions', M()))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 352 x 559.5 |
| Padding | 0px |
| Border | 1px solid #ffffff @ 0.1 |
| Radius | 16px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | h3.text-secondary.font-base-bold: anthropic-sans 14px/20px 500, #c3c2b7 |
| Transition | none |
| Icon | 16 x 16, colour #898781 |
| Placeholder | "" #f0efec, opacity 1, 14px |
| Painted layers | div.border-0.5.border-border-300.rounded-2xl 352.0x559.5 border T:1px solid #ffffff @ 0.1 / R:1px solid #ffffff @ 0.1 / B:1px solid #ffffff @ 0.1 / L:1px solid #ffffff @ 0.1 r 16px; div.flex.flex-row.items-center 86.0x25.0 border T:1px solid #ffffff @ 0.1 / R:1px solid #ffffff @ 0.1 / B:1px solid #ffffff @ 0.1 / L:1px solid #ffffff @ 0.1 r 6px; div.text-center.bg-surface-0.rounded-2xl 306.0x160.0 bg #0b0b0b r 16px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #151515 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 352 x 559.5 |
| Padding | 0px |
| Border | 1px solid #0b0b0b @ 0.1 |
| Radius | 16px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | h3.text-secondary.font-base-bold: anthropic-sans 14px/20px 500, #52514e |
| Transition | none |
| Icon | 16 x 16, colour #898781 |
| Placeholder | "" #0b0b0b, opacity 1, 14px |
| Painted layers | div.border-0.5.border-border-300.rounded-2xl 352.0x559.5 border T:1px solid #0b0b0b @ 0.1 / R:1px solid #0b0b0b @ 0.1 / B:1px solid #0b0b0b @ 0.1 / L:1px solid #0b0b0b @ 0.1 r 16px; div.flex.flex-row.items-center 86.0x25.0 border T:1px solid #0b0b0b @ 0.1 / R:1px solid #0b0b0b @ 0.1 / B:1px solid #0b0b0b @ 0.1 / L:1px solid #0b0b0b @ 0.1 r 6px; div.text-center.bg-surface-0.rounded-2xl 306.0x160.0 bg #f9f9f7 r 16px |
| Tokens | --cds-cursor-interactive default; --cds-page-bg #fcfcfb |
| How | at rest |

Crops: `instructions-card-default.png`, `instructions-card-light.png`.

### Mobile

#### m-show-sidebar

Phone menu button.

Copy: `mobile-home-dark`. Finder: `() => Q('[data-testid=sidebar-compact-trigger]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 32 x 32 |
| Padding | 0px |
| Gap | 6px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.text-secondary: Anthropicons-Variable 16px/16px 533.25, #c3c2b7 |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #151515 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 32 x 32 |
| Padding | 0px |
| Gap | 6px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.text-secondary: Anthropicons-Variable 16px/16px 533.25, #52514e |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #fcfcfb |
| How | at rest |

Crops: `m-show-sidebar-default.png`, `m-show-sidebar-light.png`.

#### m-greeting

Phone greeting.

Copy: `mobile-home-dark`. Finder: `() => Q('main .font-display')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 271.59 x 37.5 |
| Padding | 0px 28.8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 30px/37.5px 300 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.select-none: anthropic-serif 30px/37.5px 300, #f0efec |
| Transition | none |
| Icon | 28.78 x 28.78, colour #f0efec, fill #d97757 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 273.3 x 37.5 |
| Padding | 0px 28.8px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-serif 30px/37.5px 330 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.select-none: anthropic-serif 30px/37.5px 330, #0b0b0b |
| Transition | none |
| Icon | 28.78 x 28.78, colour #0b0b0b, fill #d97757 |
| How | at rest |

Crops: `m-greeting-default.png`, `m-greeting-light.png`.

#### m-composer

Phone composer. Pinned to the bottom; the Chat/Cowork segments drop to icons below 360 px.

Copy: `mobile-home-dark`. Finder: `() => P(Q('[data-testid=chat-input]'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 358 x 100 |
| Padding | 0px |
| Border | 1px solid #000000 @ 0 |
| Radius | 20px |
| Background | #20201f |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.col-start-1.row-start-1.block: anthropic-sans 15px/20px 400, #898781 |
| Transition | background-color, border-color, box-shadow, opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | text |
| Icon | 20 x 20, colour #f0efec |
| Placeholder | "How can I help you today?" #898781, opacity 1, 15px |
| Painted layers | div.!box-content.flex.flex-col 358.0x100.0 bg #20201f border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #ffffff @ 0.1 0px 0px 0px 1px inset, #ffffff @ 0.1 0px 0px 0px 0px; div.relative.inline-flex.w-fit 74.0x28.0 bg #ffffff @ 0.05 r 7px; div.invisible.absolute.left-0 36.0x26.0 bg #ffffff @ 0.1 r 6px shadow #ffffff @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; input 1.0x1.0 outline 2px solid #5598e7 @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-border hsl(from #fff h s l / 10%); --cds-cursor-interactive pointer; --cds-page-bg #151515; --cds-radius calc(.5rem * 1); --cds-segmented-control-thumb hsl(from #fff h s l / 10%); --cds-segmented-control-track hsl(from #fff h s l / 5%) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 358 x 100 |
| Padding | 0px |
| Border | 1px solid #000000 @ 0 |
| Radius | 20px |
| Background | #ffffff |
| Box shadow | #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.col-start-1.row-start-1.block: anthropic-sans 15px/20px 400, #898781 |
| Transition | background-color, border-color, box-shadow, opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | text |
| Icon | 20 x 20, colour #0b0b0b |
| Placeholder | "How can I help you today?" #898781, opacity 1, 15px |
| Painted layers | div.!box-content.flex.flex-col 358.0x100.0 bg #ffffff border T:1px solid #000000 @ 0 / R:1px solid #000000 @ 0 / B:1px solid #000000 @ 0 / L:1px solid #000000 @ 0 r 20px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0.035 0px 4px 20px 0px, #0b0b0b @ 0.1 0px 0px 0px 0px inset, #0b0b0b @ 0.1 0px 0px 0px 1px; div.relative.inline-flex.w-fit 74.0x28.0 bg #f6f6f4 r 7px; div.invisible.absolute.left-0 36.0x26.0 bg #ffffff r 6px shadow #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; input 1.0x1.0 outline 2px solid #256abf @ 0 offset 2px; button.h-8.rounded-lg.overflow-hidden 32.0x32.0 r 8px outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-border hsl(from #0b0b0b h s l / 10%); --cds-cursor-interactive pointer; --cds-page-bg #fcfcfb; --cds-radius calc(.5rem * 1); --cds-segmented-control-thumb #fff; --cds-segmented-control-track #f6f6f4 |
| How | at rest |

Crops: `m-composer-default.png`, `m-composer-light.png`.

#### m-segment

Phone segment (icon only).

Copy: `mobile-home-dark`. Finder: `() => Q('main [aria-label=Surface] [role=radio][aria-checked=true]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 36 x 26 |
| Padding | 0px 10px |
| Gap | 6px |
| Border | none |
| Radius | 5px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.shrink-0: Anthropicons-Variable 16px/16px 533.25, #f0efec |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Ancestor paint | 1 up div.relative.inline-flex.w-fit bg #ffffff @ 0.05 |
| Tokens | --cds-radius calc(.4375rem * 1) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 36 x 26 |
| Padding | 0px 10px |
| Gap | 6px |
| Border | none |
| Radius | 5px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.shrink-0: Anthropicons-Variable 16px/16px 533.25, #0b0b0b |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Ancestor paint | 1 up div.relative.inline-flex.w-fit bg #f6f6f4 |
| Tokens | --cds-radius calc(.4375rem * 1) |
| How | at rest |

Crops: `m-segment-default.png`, `m-segment-light.png`.

#### m-drawer

Drawer sheet. The sidebar as a full-screen sheet: a close button and the wordmark, a full-width Search button, then the same rows at 44 tall.

Copy: `mobile-home-dark-drawer`. Finder: `() => Q('[data-testid=sidebar][role=dialog]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 390 x 844 |
| Padding | 0px 8px 8px 8px |
| Gap | 8px |
| Border | none |
| Radius | 0px |
| Background | #111111 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #f0efec |
| Transition | transform, visibility 0.3s, 0s cubic-bezier(0.165, 0.84, 0.44, 1), ease delay 0s, 0s |
| Icon | 68.33 x 20, colour #f0efec |
| Painted layers | div.dframe-sidebar-body.flex.flex-col 390.0x844.0 bg #111111; a.flex.items-center 68.3x20.0 outline 2px solid #5598e7 @ 0 offset 2px; span.absolute.inset-0.duration-fast 374.0x40.0 bg #ffffff @ 0.1 r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; div.df-pills.static-composer-boot-fade 374.0x32.0 bg #ffffff @ 0.06 r 8px; div.df-pill-indicator 188.0x30.0 bg #ffffff @ 0.1 r 7px shadow #ffffff @ 0.08 0px 0px 0px 0.5px inset, #000000 @ 0.3 0px 1px 2px 0px, #000000 @ 0.25 0px 2px 6px -1px; button.df-pill.hide-focus-ring 187.6x30.0 r 6px outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #151515; --cds-shortcut-cap-ink #a5a49a; --df-hover hsl(from #fff h s l / 7.5%); --df-nav-scrollbar-lane (unset); --df-radius-pill 8px; --df-row-ctl 36px; --df-row-font 14px; --df-row-gap 8px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 390 x 844 |
| Padding | 0px 8px 8px 8px |
| Gap | 8px |
| Border | none |
| Radius | 0px |
| Background | #fbfbf9 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #0b0b0b |
| Transition | transform, visibility 0.3s, 0s cubic-bezier(0.165, 0.84, 0.44, 1), ease delay 0s, 0s |
| Icon | 68.33 x 20, colour #0b0b0b |
| Painted layers | div.dframe-sidebar-body.flex.flex-col 390.0x844.0 bg #fbfbf9; a.flex.items-center 68.3x20.0 outline 2px solid #256abf @ 0 offset 2px; span.absolute.inset-0.duration-fast 374.0x40.0 bg #ffffff @ 0.1 r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px; div.df-pills.static-composer-boot-fade 374.0x32.0 bg #edece8 r 8px; div.df-pill-indicator 188.0x30.0 bg #f9f9f7 r 7px shadow #0b0b0b @ 0.1 0px 0px 0px 0.5px inset, #000000 @ 0.06 0px 1px 2px 0px, #000000 @ 0.05 0px 2px 6px -1px; button.df-pill.hide-focus-ring 187.6x30.0 r 6px outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #fcfcfb; --cds-shortcut-cap-ink #6d6b67; --df-hover #f0efec; --df-nav-scrollbar-lane (unset); --df-radius-pill 8px; --df-row-ctl 36px; --df-row-font 14px; --df-row-gap 8px |
| How | at rest |

Crops: `m-drawer-default.png`, `m-drawer-light.png`.

#### m-drawer-search

Drawer Search button.

Copy: `mobile-home-dark-drawer`. Finder: `() => [...document.querySelectorAll('[data-testid=sidebar] button[data-cds=Button]')].find((b) => b.getBoundingClientRect().width > 300)`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 374 x 40 |
| Padding | 0px 16px |
| Gap | 6px |
| Border | none |
| Radius | 10px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 15px/22px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.-ms-1: Anthropicons-Variable 20px/20px 433.25, #f0efec |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Painted layers | span.absolute.inset-0.duration-fast 374.0x40.0 bg #ffffff @ 0.1 r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #151515 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 374 x 40 |
| Padding | 0px 16px |
| Gap | 6px |
| Border | none |
| Radius | 10px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 15px/22px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.-ms-1: Anthropicons-Variable 20px/20px 433.25, #0b0b0b |
| Transition | box-shadow 0.06s cubic-bezier(0.4, 0, 0.2, 1) |
| Cursor | pointer |
| Painted layers | span.absolute.inset-0.duration-fast 374.0x40.0 bg #ffffff @ 0.1 r 10px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #fcfcfb |
| How | at rest |

Crops: `m-drawer-search-default.png`, `m-drawer-search-light.png`.

#### m-drawer-row

Drawer row.

Copy: `mobile-home-dark-drawer`. Finder: `() => C(T('Artifacts', Q('[role=dialog]')), 'div.group')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 374 x 44 |
| Padding | 0px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #c3c2b7 |
| Transition | none |
| Painted layers | a.w-full.shrink-0.border-none 374.0x44.0 r 8px outline 2px solid #5598e7 @ 0 offset 2px |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #151515; --df-hover hsl(from #fff h s l / 7.5%); --df-radius-pill 8px; --df-row-ctl 36px; --df-row-font 14px; --df-row-gap 8px; --df-row-h 44px; --df-row-px 2px |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 374 x 44 |
| Padding | 0px |
| Border | none |
| Radius | 8px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span: Anthropicons-Variable 20px/20px 433.25, #52514e |
| Transition | none |
| Painted layers | a.w-full.shrink-0.border-none 374.0x44.0 r 8px outline 2px solid #256abf @ 0 offset 2px |
| Tokens | --cds-cursor-interactive pointer; --cds-fill-accent #2a78d6; --cds-page-bg #fcfcfb; --df-hover #f0efec; --df-radius-pill 8px; --df-row-ctl 36px; --df-row-font 14px; --df-row-gap 8px; --df-row-h 44px; --df-row-px 2px |
| How | at rest |

Crops: `m-drawer-row-default.png`, `m-drawer-row-light.png`.

#### m-thread-header

Phone chat header.

Copy: `mobile-thread-dark`. Finder: `() => Q('[data-testid=chat-header]')`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 390 x 48 |
| Padding | 0px 20px 0px 56px |
| Gap | 12px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | span.min-w-0.truncate: anthropic-sans 14px/20px 400, #f0efec |
| Transition | none |
| Painted layers | div.df-header-backdrop.pointer-events-none.absolute 378.0x72.0 bg #151515; span.absolute.inset-0.duration-fast 57.7x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #151515; --df-ceded-gutter 8px; --df-header-start-inset (unset) |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 390 x 48 |
| Padding | 0px 20px 0px 56px |
| Gap | 12px |
| Border | none |
| Radius | 0px |
| Background | transparent |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 14px/21px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | span.min-w-0.truncate: anthropic-sans 14px/20px 400, #0b0b0b |
| Transition | none |
| Painted layers | div.df-header-backdrop.pointer-events-none.absolute 378.0x72.0 bg #fcfcfb; span.absolute.inset-0.duration-fast 58.0x28.0 bg #ffffff @ 0.1 r 7px shadow #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #000000 @ 0 0px 0px 0px 0px, #0b0b0b @ 0.1 0px 0px 0px 1px inset, #000000 @ 0.05 0px 1px 2px 0px |
| Tokens | --cds-cursor-interactive pointer; --cds-page-bg #fcfcfb; --df-ceded-gutter 8px; --df-header-start-inset (unset) |
| How | at rest |

Crops: `m-thread-header-default.png`, `m-thread-header-light.png`.

#### m-user-message

Phone user message.

Copy: `mobile-thread-dark`. Finder: `() => P(Q('[data-testid=user-message]'))`.

Dark theme.

| Property | default |
|---|---|
| Size (w x h) | 283 x 256 |
| Padding | 12px 16px |
| Gap | 8px |
| Border | none |
| Radius | 12px |
| Background | #ffffff @ 0.05 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 15px/20px 400 |
| Letter spacing | normal |
| Colour | #f0efec |
| Text node | p.whitespace-pre-wrap.break-words: anthropic-sans 15px/20px 400, #f0efec |
| Transition | none |
| Painted layers | div.relative.flex.min-w-0 283.0x256.0 bg #ffffff @ 0.05 r 12px |
| Tokens | --cds-bg-user-message hsl(from #fff h s l / 5%); --cds-cursor-interactive pointer; --cds-message-bubble-measure 85%; --cds-message-bubble-pad-x calc(1rem * 1); --cds-message-bubble-pad-y calc(.75rem * 1); --cds-message-bubble-radius calc(calc(.5rem * 1) + calc(.25rem * 1)); --cds-page-bg #151515 |
| How | at rest |

Light theme.

| Property | light |
|---|---|
| Size (w x h) | 283 x 256 |
| Padding | 12px 16px |
| Gap | 8px |
| Border | none |
| Radius | 12px |
| Background | #0b0b0b @ 0.05 |
| Box shadow | none |
| Outline | none |
| Font | anthropic-sans 15px/20px 400 |
| Letter spacing | normal |
| Colour | #0b0b0b |
| Text node | p.whitespace-pre-wrap.break-words: anthropic-sans 15px/20px 400, #0b0b0b |
| Transition | none |
| Painted layers | div.relative.flex.min-w-0 283.0x256.0 bg #0b0b0b @ 0.05 r 12px |
| Tokens | --cds-bg-user-message hsl(from #0b0b0b h s l / 5%); --cds-cursor-interactive pointer; --cds-message-bubble-measure 85%; --cds-message-bubble-pad-x calc(1rem * 1); --cds-message-bubble-pad-y calc(.75rem * 1); --cds-message-bubble-radius calc(calc(.5rem * 1) + calc(.25rem * 1)); --cds-page-bg #fcfcfb |
| How | at rest |

Crops: `m-user-message-default.png`, `m-user-message-light.png`.
