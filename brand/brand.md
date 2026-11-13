# Hermes Studio brand kit

Mark 2-3. Kit folder: `hermes-studio/brand/`. Marks are letter-free; only the lockups and banners carry the name.

## Palette

| Role | HEX | RGB |
|---|---|---|
| Background | #1C1B1F | 28 27 31 |
| Cream | #F2E0CC | 242 224 204 |
| Orange | #E54D0F | 229 77 15 |
| Mono cream / charcoal / black / white | #F2E0CC / #1C1B1F / #000000 / #FFFFFF | 242 224 204 / 28 27 31 / 0 0 0 / 255 255 255 |

The vector master has 3 colour layer(s). Within the 2 to 3 colour guideline (the charcoal layer is the outline/hole of the artwork and matches the background).

## Typeface

Fraunces (Google Fonts, SIL OFL 1.1): SemiBold (soft, opsz 48) for the name in lockups and banners, Regular (opsz 14) for text and captions. Soft, warm old-style serif that matches the hat's rounded shapes. Names are outlined in every SVG/PDF; install the TTFs in `fonts/` for new text. Licence: `fonts/OFL.txt`.

## Rules

- Clear space: x = 0.25 x mark height (tight bounding box) on all sides.
- Minimum size: 24 px tall (digital) / 8 mm (print). Below that use `png/favicon-16.png`.
- Do: use the supplied files; keep clear space; cream marks go on dark or mid backgrounds, use the light version (or mono charcoal) on light.
- Don't: stretch or skew, recolour, add shadows/glow/gradients, or place on busy backgrounds.

## Files

### `png/`
Raster set (avatars, logos, mark-transparent, favicons + .ico, apple-touch/PWA icons, maskable, social preview mark-only)

`apple-touch-icon-180.png`, `avatar-1024.png`, `avatar-500.png`, `favicon-16.png`, `favicon-32.png`, `favicon-48.png`, `favicon.ico`, `icon-192.png`, `icon-512.png`, `logo-rounded-160.png`, `logo-rounded.png`, `logo-square-2048.png`, `logo-square.png`, `mark-transparent-2048.png`, `mark-transparent.png`, `maskable-512.png`, `social-preview-1280x640.png`

### `svg/`
Vector masters: full colour on background, full colour transparent, one-colour versions. Palette-exact, one filled path per colour layer

`mark-color-on-bg.svg`, `mark-color.svg`, `mark-mono-black.svg`, `mark-mono-charcoal.svg`, `mark-mono-cream.svg`, `mark-mono-white.svg`

### `pdf/`
Vector PDFs generated from the SVGs

`mark-color-on-bg.pdf`, `mark-color.pdf`, `mark-mono-black.pdf`, `mark-mono-charcoal.pdf`, `mark-mono-cream.pdf`, `mark-mono-white.pdf`

### `mono/`
One-colour marks (cream #F2E0CC, charcoal #1C1B1F, black, white) as SVG and transparent PNG, with knockouts so the silhouette reads

`mono-black.png`, `mono-black.svg`, `mono-charcoal.png`, `mono-charcoal.svg`, `mono-cream.png`, `mono-cream.svg`, `mono-white.png`, `mono-white.svg`

### `lockups/`
Mark + name (set in the mark typeface, outlined). Horizontal and stacked x dark / light / transparent (for dark use) / transparent-onlight, as SVG, PDF and PNG

`hermes-studio-horizontal-dark.pdf`, `hermes-studio-horizontal-dark.png`, `hermes-studio-horizontal-dark.svg`, `hermes-studio-horizontal-light.pdf`, `hermes-studio-horizontal-light.png`, `hermes-studio-horizontal-light.svg`, `hermes-studio-horizontal-transparent-onlight.pdf`, `hermes-studio-horizontal-transparent-onlight.png`, `hermes-studio-horizontal-transparent-onlight.svg`, `hermes-studio-horizontal-transparent.pdf`, `hermes-studio-horizontal-transparent.png`, `hermes-studio-horizontal-transparent.svg`, `hermes-studio-stacked-dark.pdf`, `hermes-studio-stacked-dark.png`, `hermes-studio-stacked-dark.svg`, `hermes-studio-stacked-light.pdf`, `hermes-studio-stacked-light.png`, `hermes-studio-stacked-light.svg`, `hermes-studio-stacked-transparent-onlight.pdf`, `hermes-studio-stacked-transparent-onlight.png`, `hermes-studio-stacked-transparent-onlight.svg`, `hermes-studio-stacked-transparent.pdf`, `hermes-studio-stacked-transparent.png`, `hermes-studio-stacked-transparent.svg`

### `banners/`
README banner 1280x320 and social preview with name 1280x640, both on dark

`banner-readme-1280x320.png`, `banner-readme-1280x320.svg`, `social-preview-name-1280x640.png`, `social-preview-name-1280x640.svg`

### `fonts/`
Static TTFs for the mark's typeface (name and body weights) and the SIL OFL licence

`Fraunces-Regular.ttf`, `Fraunces-SemiBold.ttf`, `OFL.txt`

`brand-sheet.pdf`: one-page brand sheet (versions, palette, typeface, clear space, minimum size, dos and don'ts). `brand.md`: this file.

## Vector fidelity

SVG (rendered at 1024) vs the flat-palette raster: 0.035% of pixels differ by more than 40/255 away from colour edges (0.469% including the 1 px edge antialiasing); mean abs diff 0.45/255. Node counts: colour 664, mono 356.
