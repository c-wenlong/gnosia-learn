# Gnosia: the brand

The product was called gnosia; it is now **Gnosia**. This document is the
brand: what it should feel like, the palette and why each value was chosen,
how the mark is built, the rules for the mascot, and where each piece appears.
The app's own token and component contract is still
[IMPLEMENTATION.md](IMPLEMENTATION.md); the brand sits beside it.


## The idea

One sentence carries the whole brand: **"A book that grows as you do."**

Gnosia is a personal tome that changes as its owner learns. Underneath, it is
a knowledge system: it keeps a model of what you know, one concept at a time,
picks what you are ready for next, and folds notes, tutor conversations,
resources and study sessions back into that model. The feeling to aim for is
tending a body of knowledge over years, closer to a garden than to a database.

It should look like modern software that happens to be slightly magical:
calm, spacious, precise. The magic is carried by light, by slow motion and by
the recurring tree rings, never by decoration.

| Do | Don't |
| --- | --- |
| Terracotta, warm cream and deep earth | Parchment, leather, wax seals, ornate borders |
| Lots of white space, rounded geometry, soft gradients | Heavy grimoire or fantasy styling |
| Large type, short copy, one idea per section | "AI-powered", "second brain", feature soup |
| The ring for growth and for "this one is active" | Rings sprinkled as decoration everywhere |
| Say what the product does, and only that | Invented features, testimonials, metrics |

**Copy.** Short sentences. No em dashes (use a comma, a colon or a full
stop), no exclamation marks, no "AI-powered". The product is single-owner
for now, so there is no sign-up, pricing or email capture: the one call to
action is "Open your book", which goes to `/sign-in`.

**No all-caps labels.** Small tracked uppercase labels ("PROBE", "WHAT YOU
KNOW") read as generated. Of the four references, Brilliant and Khan Academy
use none; Duolingo uppercases only its buttons, and Masterclass only its one
hero headline. Labels, kickers and card headings on the public pages are
sentence case. Since 2026-09-29 the same holds on every page of the app,
and a label that only repeats the heading or the layout is left out
([DESIGN.md](DESIGN.md#sentence-case-2026-09-29)). The one exception is the
wordmark, whose spaced capitals are the logo's own lettering.

## Palette

The 8-5 tree-ring art supplied by the owner sets the palette: terracotta
`#c2603f` on cream `#faf6ec`. The art keeps those colours. For text and
buttons, a deeper terracotta clears 4.5:1, including the strongest page wash.
Dark mode uses pale terracotta on a warm earth ground.

Seven roles in `globals.css`, exposed as Tailwind colours. Every consumer
uses these names; the old teal, navy and gold names are retired.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--brand-terracotta` | `#9e4a2e` | `#edaa8e` | Links, text accents and brand button face |
| `--brand-earth` | `#211815` | `#211815` | Dark ground, button lip and dark-mode button label |
| `--brand-cream` | `#faf6ec` | `#f4ecdc` | Light ground and light-mode button label |
| `--brand-clay` | `#c2603f` | `#edaa8e` | Graphic accents, never small text in light mode |
| `--brand-clay-soft` | `#eac5b2` | `#dca084` | Translucent washes |
| `--brand-ink` | `#38251f` | `#f4ecdc` | Headings and body text |
| `--brand-mist` | `#66554d` | `#c7b2a5` | Secondary text |

### Contrast, checked

`node scripts/brand-contrast.mjs` computes WCAG 2 relative luminance from the
actual CSS. Its tests hold text to 4.5:1 and essential graphics to 3:1.
The public table includes both glows at full strength together, and glass
over that overlap, as conservative bounds. Text also passes on every
chapter wash. The supplied mark's cream ground travels with the artwork in
the app, so it is 3.86:1 in either appearance.

### Public brand: contrast

| Pair | Light | Dark | Needs |
| --- | --- | --- | --- |
| ink on ground | 13.40 | 14.82 | 4.5 |
| mist on ground | 6.55 | 8.57 | 4.5 |
| terracotta on ground | 5.60 | 8.91 | 4.5 |
| ink on glow | 11.44 | 9.58 | 4.5 |
| mist on glow | 5.59 | 5.54 | 4.5 |
| terracotta on glow | 4.78 | 5.76 | 4.5 |
| ink on glass | 14.08 | 13.07 | 4.5 |
| mist on glass | 6.88 | 7.56 | 4.5 |
| terracotta on glass | 5.89 | 7.86 | 4.5 |
| ink on glass over glow | 13.25 | 8.37 | 4.5 |
| mist on glass over glow | 6.48 | 4.84 | 4.5 |
| terracotta on glass over glow | 5.54 | 5.03 | 4.5 |
| ink on paper | 14.22 | 12.75 | 4.5 |
| mist on paper | 6.95 | 7.37 | 4.5 |
| terracotta on paper | 5.95 | 7.66 | 4.5 |
| ink on terracotta panel | 11.29 | 11.43 | 4.5 |
| mist on terracotta panel | 5.52 | 6.61 | 4.5 |
| terracotta on terracotta panel | 4.72 | 6.87 | 4.5 |
| ink on clay panel | 11.38 | 12.01 | 4.5 |
| mist on clay panel | 5.56 | 6.94 | 4.5 |
| terracotta on clay panel | 4.76 | 7.21 | 4.5 |
| ink on mist panel | 11.44 | 11.84 | 4.5 |
| mist on mist panel | 5.59 | 6.85 | 4.5 |
| terracotta on mist panel | 4.79 | 7.11 | 4.5 |
| button label on face | 5.60 | 8.91 | 4.5 |
| supplied mark on its cream ground | 3.86 | 3.86 | 3 |


## The source art

The owner's art is the reference. Everything drawn in code is a flat
reduction of it, and where the two disagree the art wins.

| File | What it is | Used for |
| --- | --- | --- |
| [docs/design/brand/logo-sheet.png](brand/logo-sheet.png) | The primary lockup, the symbol alone, the wordmark alone, both on light and dark, and the app icon | The original lockup reference; superseded for the interface by the logo files below. Historical reference only; `GnosiaMark.ts` and the preview kit now reproduce the supplied 8-5 rings |
| [docs/design/brand/app-icon.png](brand/app-icon.png) | The first app icon: the old mark on a navy-to-teal rounded square, 1254px | Reference only. Every shipped icon is now cut from `logo/mark.png` |
| [docs/design/brand/mascot-sheet.png](brand/mascot-sheet.png) | The mascot in six poses: neutral, happy, reading, curious, excited, sleepy | Reference only; the shipped poses come from the renders below |
| [docs/design/brand/mascot/](brand/mascot/) `{neutral,happy,reading,curious,excited,sleepy}.png` | The six refreshed poses as separate renders, one file per pose, refreshed in terracotta and cream on a transparent ground | Source of the shipped poses below |
| [docs/design/brand/hero-lockup.png](brand/hero-lockup.png) | The mark, the wordmark, the tagline and the mascot together on cream | Source of the social card |
| [docs/design/brand/composite.png](brand/composite.png) | The lockup, the mascot and the icons on one board | Reference only |
| [docs/design/brand/world-staircase.png](brand/world-staircase.png) | The world: a staircase of books into a sky city, the mascot beside it | Source of `public/banner.png` |
| [docs/design/brand/pixel-art-sheet.png](brand/pixel-art-sheet.png) | A pixel-art take on the book, the wordmark and the world | **Campaign art only, never product UI.** It uses its own palette (royal blue, red ribbon) and its own letterforms, so it must not leak into the app or the landing page. The [avatar sprites](#avatar-sprites) are pixel art too, but their own, in the brand palette |
| [docs/design/brand/logo/](brand/logo/) `mark.png`, `wordmark-ink.png`, `wordmark-cream.png` | The owner's logo art, 2026-09-27: the mark alone (1254px), and the GNOSIA letters in deep teal (for light grounds) and in cream (for dark grounds), 2172 by 724, all on transparent grounds | Source of the four files below |
| [apps/web/public/brand/](../../apps/web/public/brand/) `mark.png` (256), `mark.svg` | The mark, concept 8-5 "Bold medium thin": a terracotta-on-cream tree cross-section with one bold, one medium and one thin ring, supplied as final art. `wordmark-ink.png` is retained as the alpha-mask source for CSS-coloured lettering; the old cream raster is reference only | `GnosiaWordmark` and `GnosiaLockup` |
| [apps/web/src/app/icon.png](../../apps/web/src/app/icon.png) (512), `icon.svg`, `favicon.ico` | The new mark, supplied as final art: PNG, a hand-pixelled SVG and a multi-size ICO | Favicon and PWA icon |
| [apps/web/src/app/apple-icon.png](../../apps/web/src/app/apple-icon.png) (180) | The new mark on an opaque square, supplied as final art; opaque, because iOS fills a transparent home-screen icon with black, and square, because iOS rounds the corners itself | Home-screen icon |
| [apps/desktop/Resources/AppIcon.png](../../apps/desktop/Resources/AppIcon.png) (1024) | The new mark, supplied as final art; `scripts/bundle-app.sh` renders the `.icns` from it | macOS app icon |
| [apps/web/public/brand/mascot/](../../apps/web/public/brand/mascot/) `{neutral,happy,reading,curious,excited,sleepy}.png` | Cut from the refreshed renders in `docs/design/brand/mascot/`: alpha-trimmed, padded by 8px and scaled to 900px on the longest side | `GnosiaMascot` |
| [apps/web/public/opengraph-image.png](../../apps/web/public/opengraph-image.png) (1200 by 630) | Interim 8-5 mark and terracotta wordmark on cream, from `kit/social-card.svg` | The social card; the owner's hand-cut art replaces it later |
| [apps/web/public/banner.png](../../apps/web/public/banner.png) | Made from `world-staircase.png` | A wide banner, for the repository and campaign use |

The icon files and historical banner are supplied or cut by hand from
the art; do not regenerate them from code. Issue #662 authorizes the interim
social card in `kit/social-card.svg`, composed from the exact mark paths and
letter alpha mask. It will give way to the owner's hand-cut art.
[kit/render.mjs](kit/render.mjs)
(SVG or HTML to PNG, fonts loaded, optional transparent ground) and
[kit/gen-icons.mjs](kit/gen-icons.mjs) (the flat mark on a tile, read from
`GnosiaMark.ts`) exist for previews and for any size the art does not cover.

## The mark

Concept 8-5, **Bold medium thin**: a terracotta tree cross-section, one bold,
one medium and one thin irregular ring, with a crack. Growth accumulates
around a centre, as knowledge does. The owner's supplied art wins wherever
a reproduction disagrees with it.

`public/brand/mark.svg` is the supplied transparent vector on a 1024-unit
grid. `GnosiaMark.ts` exports its exact `MARK_RINGS` and `MARK_CREAM` paths
and `MARK_VIEWBOX`; the preview kit reads those constants. The cream path
uses the even-odd fill rule. There is no ribbon G, book-page contour or
`MARK_STAR` in the current mark. The landing page's next-step cue is a ring.

The shipped PNG and favicon variants remain the supplied files from #661.
Do not redraw, rotate, stretch, outline or add a drop shadow to the mark.
Leave clear space of at least a quarter of its width on every side.

### The wordmark and the lockup

The owner's GNOSIA letterforms remain unchanged: a light geometric sans with
an open G and an A without a crossbar. `GnosiaWordmark` uses the alpha channel
of the existing letter art as a CSS mask, deep terracotta on light grounds
and cream on dark ones. No font approximation or recoloured raster is needed.
The static import keeps the mask URL content-hashed.

The mark is decorative and the letters have one accessible name, Gnosia.
`GnosiaWordmark` places the mark beside the letters; `GnosiaLockup` stacks
them for sign-in. The mark stays at 1.9em and the lettering at 0.8em in bars.

## The mascot

A small living tome: terracotta covers folded into a hood, warm earth in
its shadow, cream pages, cream edge trim and glowing cream eyes. A cream
tree-ring emblem replaces the old star sigil. Hands and the long ribbon
tail keep their original shapes; the six expressions still carry the pose.

The 2026-11-09 refresh was generated from the owner's individual pose
renders and the supplied 8-5 logo, keeping the character, gestures and
composition. Sources remain in `docs/design/brand/mascot/` and the reviewed
six-pose sheet is `brand/mascot-terracotta-sheet.png`. The original teal
sheet is a historical reference, preserved alongside the new one.

The shipped copies are alpha-trimmed, padded by 8px and sized to 900px on
the longest side. `GnosiaMascot` uses static imports, so a replacement gets
a fresh content-hashed URL and its dimensions follow the file. Every pose
is decorative, with an empty alternative description.

| Pose | Where it goes |
| --- | --- |
| `neutral` | The default |
| `happy` | Sign-in; the landing page's chapter three (a review answered); later, a session closed or a concept mastered |
| `reading` | The landing page's chapter one (the probe); later, a lesson or a note being read |
| `curious` | The landing hero, peeking over the probe question; later, a probe question in the app |
| `excited` | The landing page's chapter two (the next concept lit); otherwise reserved for a real milestone (a course finished) |
| `sleepy` | Reserved for an empty state (nothing due today) |

Rules:

1. **Always decorative.** `alt=""` and `aria-hidden`, never the only carrier
   of meaning, never a button.
2. **One large mascot per screen.** Secondary poses are small (90 to 170px).
   On the landing page each chapter's mascot hangs off the outer bottom
   corner of its panel, half in the gap below, so it never lands on the
   product glimpse inside; the chapters are far enough apart that a phone
   never shows two at once.
3. **Slow.** Only the hero and sign-in mascots float (`float` prop: 9
   seconds, 10px, under `prefers-reduced-motion: no-preference`).
4. **Never redrawn.** Use the renders. A new pose comes from the owner's
   art, as its own render on a transparent ground, not from an SVG
   approximation or a crop of the sheet.

## Avatar sprites

Twelve pixel creatures a learner wears as their profile picture: the
library's familiars, the small animals that live among the books. Owl, cat,
bookworm, fox, hedgehog, raven, frog, mouse, moth, tortoise, rabbit and bat
(`AVATARS` in [shared.ts](../../packages/schema/src/shared.ts)), chosen by
the owner on 2026-10-04 over study objects, a garden and a night sky.

Each is a 16 by 16 grid in
[sprites.ts](../../apps/web/src/components/avatar/sprites.ts), outlined in
`--brand-earth` and drawn mostly in the brand's terracotta and cream, with a
few colours of the creatures' own (the fox's orange, the frog's greens), on
a light disc of its own tint. `PixelAvatar` draws one as SVG rects with
`crispEdges`, so the pixels stay square at any size. The colours are fixed,
like the mascot's: the same picture in every theme, on its disc.

Rules:

1. **Not the mascot.** The living tome is never redrawn (rule 4 above), so
   there is no tome among the sprites, and a sprite never stands in for it.
2. **Readable at 32px.** The sidebar shows one at 32px, so every new sprite
   is checked at that size: a face whose eyes vanish there is redrawn.
3. **Adding one is a migration.** `learner.avatar`'s check constraint and its
   random default are written from `AVATARS`, so a new name needs a migration
   as well as a grid.

## Motion and surfaces

The public pages allow what the app kit does not: soft shadows, translucent
cards (`.gnosia-glass`, frosted white on cream, a terracotta-tinted pane on earth,
now only on the sign-in card), sheets of paper (`.gnosia-paper`, the warm
white card every product glimpse on the landing page sits on) and three flat
chapter washes (`.gnosia-panel-terracotta`, `-clay`, `-mist`: 11 to 42% of a brand
colour mixed into the ground). The app keeps its flat, border-only kit. Motion is limited to the
mascot's float and a single 0.9 second rise on the hero text, all of it
behind `prefers-reduced-motion: no-preference`. Nothing moves on scroll.

**The ring as a state.** A small ring marks the next concept in the
landing page's frontier illustration. The old star glyph is retired.

## Where each piece appears

| Piece | Where |
| --- | --- |
| `GnosiaWordmark` | The app's top bar (links to `/home`), the public header (links to `/`) and footer |
| `GnosiaLockup` | The sign-in card |
| `GnosiaMascot` | Landing hero (`curious`), chapters one to three (`reading`, `excited`, `happy`), sign-in (`happy`) |
| `PixelAvatar` | The sidebar's account row (32px), and the picker on Settings' Profile tab (48px) |
| The brand button (`variant="brand"` in [classes.ts](../../apps/web/src/components/ui/classes.ts)) | The landing page's calls to action and the sign-in button. Deep terracotta face, earth lip and cream label in light; pale terracotta face and earth label in dark |
| `.gnosia-ground` | The `(site)` layout |
| `.gnosia-paper`, `.gnosia-panel-*` | The landing page's probe, chapter glimpses and chapter panels |
| `.gnosia-glass` | The sign-in card |
| Literata (`font-book`) | Every title on the public pages, the chapter and contents numerals, the colophon |
| The world art (`public/banner.png`) | The landing page's closing band |
| `ThemeToggle` (moon in light, sun in dark) | The public header, beside Sign in and on the sign-in page. Light is the default for a visitor with no cookie; a click flips the appearance and keeps the palette (Gnosia light and Gnosia dark, or Light and Dark), and writes the app's theme cookie; the saved row wins over that cookie in the app whenever the database answers, so signing in brings the saved theme back, and the row and other devices are untouched, since only the app's theme control (Settings and the avatar menu) saves it |
| Icons, social card, banner | See [The source art](#the-source-art) |

## The Gnosia theme inside the app

Palette (Classic or Gnosia) and appearance (Light, Dark or System) remain
separate choices. Classic keeps its existing blue palette. Gnosia light
(`.gnosia`) and Gnosia dark (`.gnosia.dark`) now carry terracotta, cream and
earth across every app page. Each block explicitly declares every app token,
so light values cannot leak into dark mode.

The brand button uses deep terracotta and cream in light, pale terracotta
and earth in dark. Accent fills use `#b95b3c` in both: white chip labels and
the black stat-tile strip both clear 4.5:1. Links use a separate text shade.
Mastered, learning and untouched nodes are ordered by lightness, with a
ring and mark providing additional state cues. Hints now also clear 4.5:1.

Semantic verdict colours retain their green, amber and red hues and their
labels and icons. The brand's terracotta never replaces a verdict colour.
Avatar sprites keep their shapes and species colours; their fixed brand
inks now follow terracotta, cream and earth.

### Gnosia light

| Token | Value |
| --- | --- |
| `--page` | `#faf6ec` |
| `--surface` | `#fffdf8` |
| `--surface2` | `#f3eee1` |
| `--skeleton` | `#eee8da` |
| `--skeleton-sheen` | `#faf7ef` |
| `--tint` | `#f5e4da` |
| `--border` | `#e6dfd0` |
| `--hair` | `#ede7da` |
| `--track` | `#e6dfd0` |
| `--text` | `#38251f` |
| `--text2` | `#66554d` |
| `--text3` | `#736359` |
| `--accent` | `#b95b3c` |
| `--accent-text` | `#9e4a2e` |
| `--accent-lip` | `#813a25` |
| `--btn-face` | `#9e4a2e` |
| `--btn-lip` | `#592f23` |
| `--btn-text` | `#faf6ec` |
| `--m-hi` | `#9e4a2e` |
| `--m-mid` | `#ab6d54` |
| `--m-lo` | `#ddd5c4` |
| `--lip-shade` | `#cbc1ad` |
| `--diagram-matte` | `#f7f6f3` |
| `--streak` | `#c2603f` |
| `--ok-text` | `#008024` |
| `--ok-on` | `#0b2e14` |
| `--ok` | `#29cc57` |
| `--ok-lip` | `#15b441` |
| `--ok-tint` | `#e6f8ec` |
| `--warn` | `#f7c325` |
| `--warn-lip` | `#b78900` |
| `--warn-text` | `#8c6800` |
| `--warn-tint` | `#fff5d6` |
| `--danger` | `#c43939` |
| `--m-hi-on` | `#ffffff` |
| `--warn-on` | `#5c4400` |
| `--violet` | `#8b5cf6` |
| `--on-tone` | `#000000` |

### Gnosia dark

| Token | Value |
| --- | --- |
| `--page` | `#211815` |
| `--surface` | `#2c201c` |
| `--surface2` | `#392a24` |
| `--skeleton` | `#3b2b25` |
| `--skeleton-sheen` | `#4a352c` |
| `--tint` | `#392a24` |
| `--border` | `#73574a` |
| `--hair` | `#4a382f` |
| `--track` | `#000000` |
| `--text` | `#f4ecdc` |
| `--text2` | `#c7b2a5` |
| `--text3` | `#b09a8c` |
| `--accent` | `#b95b3c` |
| `--accent-text` | `#edaa8e` |
| `--accent-lip` | `#813a25` |
| `--btn-face` | `#edaa8e` |
| `--btn-lip` | `#87533f` |
| `--btn-text` | `#211815` |
| `--m-hi` | `#edaa8e` |
| `--m-hi-on` | `#211815` |
| `--m-mid` | `#a46850` |
| `--m-lo` | `#73574a` |
| `--lip-shade` | `#160e0b` |
| `--diagram-matte` | `#f7f6f3` |
| `--streak` | `#edaa8e` |
| `--ok` | `#29cc57` |
| `--ok-lip` | `#15b441` |
| `--ok-text` | `#5ed981` |
| `--ok-tint` | `#17331f` |
| `--ok-on` | `#0b2e14` |
| `--warn` | `#f9d25c` |
| `--warn-lip` | `#b78900` |
| `--warn-text` | `#f9d25c` |
| `--warn-tint` | `#33300f` |
| `--warn-on` | `#5c4400` |
| `--danger` | `#ff8585` |
| `--violet` | `#8b5cf6` |
| `--on-tone` | `#000000` |

### Gnosia app: contrast

| Pair | Light | Dark | Needs |
| --- | --- | --- | --- |
| text on page | 13.40 | 14.82 | 4.5 |
| text2 on page | 6.55 | 8.57 | 4.5 |
| text3 on page | 5.32 | 6.51 | 4.5 |
| accent-text on page | 5.60 | 8.91 | 4.5 |
| text on surface | 14.22 | 13.44 | 4.5 |
| text2 on surface | 6.95 | 7.77 | 4.5 |
| text3 on surface | 5.65 | 5.90 | 4.5 |
| accent-text on surface | 5.95 | 8.07 | 4.5 |
| text on surface2 | 12.48 | 11.68 | 4.5 |
| text2 on surface2 | 6.10 | 6.76 | 4.5 |
| text3 on surface2 | 4.96 | 5.13 | 4.5 |
| accent-text on surface2 | 5.22 | 7.02 | 4.5 |
| text on tint | 11.70 | 11.68 | 4.5 |
| text2 on tint | 5.72 | 6.76 | 4.5 |
| text3 on tint | 4.65 | 5.13 | 4.5 |
| accent-text on tint | 4.89 | 7.02 | 4.5 |
| btn-text on btn-face | 5.60 | 8.91 | 4.5 |
| #ffffff on accent | 4.54 | 4.54 | 4.5 |
| on-tone on accent | 4.62 | 4.62 | 4.5 |
| on-tone on streak | 5.04 | 10.74 | 4.5 |
| ok-text on ok-tint | 4.62 | 7.66 | 4.5 |
| ok-text on page | 4.73 | 9.72 | 4.5 |
| warn-text on warn-tint | 4.71 | 9.17 | 4.5 |
| warn-text on page | 4.75 | 11.94 | 4.5 |
| warn-on on warn | 5.60 | 6.31 | 4.5 |
| ok-on on ok | 6.97 | 6.97 | 4.5 |
| danger on surface | 5.18 | 6.72 | 4.5 |
| danger on page | 4.87 | 7.42 | 4.5 |
| accent on surface | 4.47 | 3.48 | 3 |
| accent on page | 4.21 | 3.83 | 3 |
| accent on tint | 3.67 | 3.02 | 3 |
| accent on track | 3.42 | 4.62 | 3 |
| m-hi on surface | 5.95 | 8.07 | 3 |
| m-hi on page | 5.60 | 8.91 | 3 |
| m-hi on track | 4.56 | 10.74 | 3 |
| m-mid on surface | 4.09 | 3.51 | 3 |
| m-mid on page | 3.86 | 3.88 | 3 |
| m-mid on track | 3.14 | 4.67 | 3 |
| streak on page | 3.86 | 8.91 | 3 |
| streak on surface | 4.10 | 8.07 | 3 |
| m-hi-on on m-hi | 6.05 | 8.91 | 3 |
| #ffffff on m-mid | 4.16 | 4.49 | 3 |
| track on surface | 1.30 | 1.33 | (gap / reported) |
| track on page | 1.23 | 1.21 | (gap / reported) |
| border on surface | 1.30 | 2.40 | (gap / reported) |
| border on page | 1.23 | 2.65 | (gap / reported) |
| m-hi on m-mid | 1.45 | 2.30 | (gap / reported) |
| m-mid on m-lo | 2.85 | 1.46 | (gap / reported) |
| ok on track | 1.60 | 9.87 | (gap / reported) |

Rows marked gap / reported measure separation rather than text or graphics.
The unused green bar tone still has less than 3:1 against the light track;
no page draws it. Learning and mastered fills now clear 3:1 on the light
track as well as on the page and card. Every active pair has an automated
minimum; the pre-existing Classic palette measurements below are unchanged.

### Classic light

The Classic light palette on `:root` is the kit's, and its accent carried a
white label at 4.30:1: the active chips, the accent button, the agent
session and recap buttons and the studio's buttons all write white on it at
12 to 15px. One value fixes it, and the mastered blue, which is the same
colour, moves with it.

| Token | Was | Now | Why |
| --- | --- | --- | --- |
| `--accent` | `#456dff` | `#4168fa` | The same hue and chroma a step darker (OKLCH L 0.592 to 0.577, L* 51.2 to 49.4), the value `.dark` already uses: a white label clears 4.5:1 (4.58) and the black stat-tile strip still does (4.59) |
| `--m-hi` | `#456dff` | `#4168fa` | Mastered is the accent blue in this palette, so it stays equal to it |

**The window.** On the kit blue's hue and chroma, white clears 4.5:1 from
`#4269fb` (luminance 0.1823, white 4.52, black 4.65) and black clears it down
to `#4067f8` (0.1757, white 4.65, black 4.51). Any blue in between carries
both labels; nothing outside it does. The smallest darkening is `#4269fb`,
0.36 L* lighter than `#4168fa`, which no one can see. `#4168fa` sits in the
middle of the window, so neither label is left at the edge of 4.5:1, and it
is the value `.dark` chose for the same reason. So Classic has one accent in
both appearances, as Gnosia does.

**Every pair that reads the moved blue**, re-measured:

| Pair | Was | Now | Needs |
| --- | --- | --- | --- |
| White on `--accent` (chips, the accent button, the agent and studio buttons) | 4.30 | 4.58 | 4.5 |
| `--on-tone` (black) on `--accent` (the mastery stat tile) | 4.88 | 4.59 | 4.5 |
| `--accent` on `--surface` (focus ring, an active chip's edge) | 4.30 | 4.58 | 3 |
| `--accent` on `--page` (focus ring) | 4.05 | 4.31 | 3 |
| `--accent` on `--surface2` (focus ring on a raised row) | 3.87 | 4.13 | 3 |
| `--accent` on `--tint` (the selected row's border) | 3.82 | 4.07 | 3 |
| `--accent` on `--track` (the target bar) | 3.41 | 3.64 | 3 |
| `--m-hi` on `--surface` (a mastered dot, node or graph node) | 4.30 | 4.58 | 3 |
| `--m-hi` on `--page` | 4.05 | 4.31 | 3 |
| `--m-hi` on `--track` (a mastered bar) | 3.41 | 3.64 | 3 |
| White mark on a mastered node (`--m-hi-on`) | 4.30 | 4.58 | 3 |
| `--m-hi` against `--m-mid` (the ramp's top step) | 2.27 | 2.41 | (gap) |
| `--accent-lip` (`#2e4fd1`) against the face | 1.55 | 1.45 | (a darker lip) |
| `--accent-text` (`#294bc6`, links) on `--page`, `--surface`, `--tint` | 6.78, 7.20, 6.40 | unchanged | 4.5 |

Every pair still passes. Two went down: the black strip, still over 4.5,
and the lip step, since the face moved toward the lip. The lips
stay `#2e4fd1`: 10 L* below the new face (39.2 against 49.4), still visibly
the darker shade under the button and the mastered node. `--accent-text` is
its own darker blue and did not move.

**Why the mastered blue moved with it.** In `:root`, `--m-hi` has always
been the accent: the mastered dot and node are the same blue as the
selected chip and the target bar. No pair forces them apart, since every
`--m-hi` pair improves, and splitting them by 1.8 L* would make two blues
nobody can tell apart. The link colour here is `--accent-text`, not
`--m-hi` (that is `.dark`, where mastered and links share `#7491ff`), so
the links do not change.

**The warning text (2026-10-05).** `--warn-text` was `#b78900`, the lip's
amber, and failed 4.5:1 on every light ground it sits on, its own tint
included: a "not quite" verdict, a stale-export chip and the studio's warning
lines were all under the minimum. It now takes `#8c6800`, the amber Gnosia
light already chose, so both light palettes share one value and `.gnosia`
drops its override. `--warn-lip`, the button lip, stays `#b78900`: it is a
graphic, not text.

| Pair | Was | Now | Needs |
| --- | --- | --- | --- |
| `--warn-text` on `--warn-tint` | 2.93 | 4.71 | 4.5 |
| `--warn-text` on `--surface` | 3.19 | 5.13 | 4.5 |
| `--warn-text` on `--page` | 3.00 | 4.83 | 4.5 |
| `--warn-text` on `--surface2` | 2.87 | 4.62 | 4.5 |

### Classic dark

The Classic dark palette on `.dark` is the kit's (Brilliant's dark values),
and five of its pairs were under the minimum: white on `--accent` (4.30), the
learning blue on the card (2.03), the check on a done streak day (1.89), the
mark on a mastered path node (2.90) and the bars' fill on their track (1.88).
Five values fix them, and a sixth keeps the learning node's lip darker than
its new face. Every other `.dark`
pair in the table was re-measured after the change and still passes.

| Token | Was | Now | Why |
| --- | --- | --- | --- |
| `--accent` | `#456dff` | `#4168fa` | The same hue and chroma, a step darker (OKLCH L 0.592 to 0.577), to the one luminance where a white label and the black stat-tile strip both clear 4.5:1 (4.58 and 4.59). The focus ring stays over 3:1 on the card (3.64), the page (4.02) and the tint (3.05) |
| `--m-mid` | `#3a4a8f` | `#5266ad` | Learning, the same hue and chroma lifted until it clears 3:1 on the card (3.07) and the page (3.39) |
| `--m-hi-on` | `#ffffff` (from `:root`) | `#141414` | The mark on a mastered node is the page colour, 6.35:1 |
| `--track` | `#4c4c4c` (the bars read `--border`) | `#000000` | The empty part of a bar. The accent fill was 1.88:1 on the border; on black it is 4.59, and learning, the lowest fill, 3.86. Black is 1.26:1 from the card, as `:root`'s track is from its white card ([the track](#contrast-checked-1)) |

**Why the accent moved rather than the label.** The other way out was to
keep `#456dff` and write the black `--on-tone` on chips and the accent
button. The accent moved because more than two components write white on
it (the agent session and recap buttons and the studio's buttons do too),
and a darker step of the same blue fixes all of them at once. The step is
small enough (L* 51.2 to 49.4) that it does not read as a different or muddier
blue beside the mastered `#7491ff`.

**The mastery ramp.** Mastered stays `#7491ff`, the kit's value and the
link colour, at L* 62.7; learning is now L* 44.7 and untouched L* 32.3.
The gaps are 18.0 and 12.4 L*, luminance ratios of 1.87 and 1.58. The top
gap is narrower than Gnosia's 2.2 because it has a ceiling: mastered is
5.75:1 on the card, and learning has to clear 3:1 there, so the two can be
at most 5.75 / 3 = 1.92 apart. Widening it to 2.2 would mean lifting
mastered to about `#83a2ff`, away from the link colour; this change keeps
mastered where it is. The learning dot and path node carry a second cue
anyway: the dot is ringed in `--m-hi`, and the node's mark is white where
the mastered node's is dark.

## What the landing page may claim

Every line on `/` maps to something the product does today. Keep it that way
when editing the copy.

| Claim on the page | What backs it |
| --- | --- |
| A probability per concept that you know it | Bayesian Knowledge Tracing mastery, updated by graded answers, reviews and tutor probes |
| The frontier picks what comes next | The prerequisite graph; a concept is ready once its `requires` prerequisites clear the readiness bar |
| Spaced review with Again, Hard, Good, Easy; missed cards flagged | SM-2 scheduling and leech detection |
| A tutor that knows the concept and cites your notes | The concept-aware chat, whose source `[1]` is always the concept's note |
| Ten computer science courses from NUS | The course files in `content/courses/` |
| Animations, diagrams, notes, links, transcripts, with watched state | The library and the `watched` event |
| Pick up where you left off; no schedule, no streak, no leagues | Home: the module, video, draft and concept threads (docs/proposals/home-page.md) |
| One append-only event log; notes and model derived from it | The `event` table |
| A few questions before any teaching | The Probe phase of the tutoring loop |
| Remembered cards wait longer; missed ones come back sooner | SM-2: a pass grows the interval, a lapse resets it |
| "Good. See it again in 6 days." | SM-2's second interval is six days |

The hero's probe is interactive but local: `ProbeDemo` moves a softmax
estimate from 0.54 to 0.83 on a right answer or to 0.38 on a wrong one,
without calling the model. What is true is the direction, and the page says
the numbers are the book's estimate, nothing more. The chapter glimpses (the
estimates, the lit frontier, the review card) are illustrations built from
real concept names in `learn/concepts/`, not a live reading.

## The landing page

The first version was the stock template every generated landing page
shares: an eyebrow pill, a sans headline, glass stat cards floating round
the hero, three numbered steps, six icon cards, a closing card. The
redesign on 2026-09-27 kept the brand, the copy rules and the claims, and
changed the shape, after reading the landing pages of four learning
products (captured at 1440px on 2026-09-27):

| Product | What it does | What Gnosia took |
| --- | --- | --- |
| Brilliant | A serif display face (CoFo Robert, 76px, weight 500) over a plain sans; a warm off-white ground; large flat pastel panels, each holding a working piece of the product | Literata for titles over Figtree; the three flat chapter washes; a probe question you can answer in the hero instead of a picture of one |
| Duolingo | One character in every section, doing something different; alternating illustration and text rows; the lipped 3D button | A mascot pose per chapter; the alternating rows; the brand button kept |
| Masterclass | Cinematic: black, full-bleed imagery, a condensed display face | The world art as a full-bleed closing band, always dark, whatever the theme |
| Khan Academy | Editorial: Source Serif headings, Lato body, a mission line | The editorial register, carried by the book itself |

The book is the organising idea, so the page is laid out as one: a title
page with the probe, three chapters (Probe, Plan, Review), a contents page
numbered in roman numerals, a colophon naming the mechanics
and the typefaces, and the world as the last page. **Literata** was picked
because it was drawn for reading long-form books on screens; it is loaded by
`(site)/layout.tsx` only, so no signed-in page downloads it, and the
`font-book` utility names it. The closing band carries the `dark` class so
the brand values and the brand button inside it are the dark ones in every
theme.

**Two faces, no mono.** The public pages use Literata and Figtree only.
Numbers (the estimates, 0.54 and so on) are Figtree with tabular figures,
not a monospace: a book prints its numbers in its text face, and a mono face
on a landing page reads as a developer dashboard. The one monospace left is
the sign-in page's configuration error, which names environment variables
(real code, so mono is right there) and which any visitor can see while
sign-in is not configured.
