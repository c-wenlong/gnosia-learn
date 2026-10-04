# Gnosia: the brand

The product was called self-learn; it is now **Gnosia**. This document is the
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
one recurring star, never by decoration.

| Do | Don't |
| --- | --- |
| Deep teal and navy, warm cream, a little gold | Parchment, leather, wax seals, ornate borders |
| Lots of white space, rounded geometry, soft gradients | Heavy grimoire or fantasy styling |
| Large type, short copy, one idea per section | "AI-powered", "second brain", feature soup |
| The star for insight and for "this one is active" | Stars sprinkled as decoration everywhere |
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

Seven tokens, declared at the end of
[globals.css](../../apps/web/src/app/globals.css): light on `:root`, dark on
`.dark` (the theme cookie's class on `<html>`). Each is also a Tailwind colour
(`bg-brand-cream`, `text-brand-ink`, `border-brand-ink/10`), so a component
never writes a hex value.

They are roles, not only hues. `ink` and `mist` are the text colours and flip
between themes. `teal` lightens in dark so it still reads as text and as a
mark on navy. `cream` and `navy` are the two grounds: the public layout paints
cream in light and navy in dark.

| Token | Light | Dark | Role | Why this value |
| --- | --- | --- | --- | --- |
| `--brand-teal` | `#0f5f61` | `#5cbab3` | The mark, the brand button's face, chapter kickers, the check chips in the landing glimpses, and inline links and link hovers | Light: deep enough to carry cream text at 6.9:1 and to read as "deep teal" rather than green. Dark: lifted until it clears 7.9:1 on navy, since in dark it is a text colour too |
| `--brand-navy` | `#0d1c2b` | `#0a1621` | The dark ground, the brand button's lip, the label on a dark-mode teal button | A blue-black with enough blue to sit beside teal without looking like plain black; the dark value is a shade deeper so glass cards can lighten from it |
| `--brand-cream` | `#faf6ec` | `#f4ecdc` | The light ground, the mark's pages, the label on a light-mode teal button | Warm but close to white, so it reads as paper without becoming parchment. The dark value is the pages' colour on navy, a touch warmer so it does not glare |
| `--brand-gold` | `#b3842c` | `#e2b95e` | The star in the mark and wherever it appears alone | Graphics only, never body text. Light was darkened from a brighter gold until the star clears the 3:1 non-text minimum on cream (3.11:1); dark is the brighter gold at 9.9:1 |
| `--brand-gold-soft` | `#efd9a1` | `#e8c877` | Glows: the warm wash on the page, and the chapter-two panel's wash | Only ever used with transparency (radial gradients, `color-mix`), so it tints rather than fills |
| `--brand-ink` | `#15283a` | `#eee8dc` | Headings and body text on the brand grounds | A navy-tinted near-black on cream and a cream-tinted near-white on navy: softer than pure black or white, still 13.9:1 and 15.0:1 |
| `--brand-mist` | `#4f6173` | `#a3b2bf` | Secondary text: the hero sentence, card bodies, the footer | The quietest grey-blue that still clears AA (4.5:1) on every surface it sits on, including the teal glow |

### Contrast, checked

Computed with the WCAG 2 relative-luminance formula against each surface the
colour actually sits on. "Glass" is the translucent card (`.gnosia-glass`:
white at 62% over cream in light, teal at 7% over navy in dark, `#fdfcf8` and
`#10212b`); "glow" is the strongest point of the teal wash on the ground
(`#e0e5dd` and `#173038`).

| Pair | Light | Dark | Needs |
| --- | --- | --- | --- |
| `ink` on ground | 13.93 | 14.97 | 4.5 (text) |
| `ink` on glass | 14.65 | 13.50 | 4.5 |
| `mist` on ground | 5.91 | 8.42 | 4.5 |
| `mist` on glass | 6.22 | 7.59 | 4.5 |
| `mist` on the teal glow | 4.99 | 6.38 | 4.5 |
| `teal` on ground (kickers, mark) | 6.88 | 7.94 | 4.5 |
| `teal` on glass | 7.23 | 7.16 | 4.5 |
| Brand button label on its face (cream on teal, navy on teal) | 6.88 | 7.94 | 4.5 |
| `gold` star on ground | 3.11 | 9.86 | 3 (non-text) |
| Teal mark in the app's top bar (on `--surface`) | 7.42 | 7.25 | 3 (non-text) |

## The source art

The owner's art is the reference. Everything drawn in code is a flat
reduction of it, and where the two disagree the art wins.

| File | What it is | Used for |
| --- | --- | --- |
| [docs/design/brand/logo-sheet.png](brand/logo-sheet.png) | The primary lockup, the symbol alone, the wordmark alone, both on light and dark, and the app icon | The original lockup reference; superseded for the interface by the logo files below. `GnosiaMark`, the flat SVG reduction, is drawn from it and now only feeds the preview kit |
| [docs/design/brand/app-icon.png](brand/app-icon.png) | The first app icon: the old mark on a navy-to-teal rounded square, 1254px | Reference only. Every shipped icon is now cut from `logo/mark.png` |
| [docs/design/brand/mascot-sheet.png](brand/mascot-sheet.png) | The mascot in six poses: neutral, happy, reading, curious, excited, sleepy | Reference only; the shipped poses come from the renders below |
| [docs/design/brand/mascot/](brand/mascot/) `{neutral,happy,reading,curious,excited,sleepy}.png` | The six poses as separate renders, one file per pose, 1254px square on a transparent ground | Source of the shipped poses below |
| [docs/design/brand/hero-lockup.png](brand/hero-lockup.png) | The mark, the wordmark, the tagline and the mascot together on cream | Source of the social card |
| [docs/design/brand/composite.png](brand/composite.png) | The lockup, the mascot and the icons on one board | Reference only |
| [docs/design/brand/world-staircase.png](brand/world-staircase.png) | The world: a staircase of books into a sky city, the mascot beside it | Source of `public/banner.png` |
| [docs/design/brand/pixel-art-sheet.png](brand/pixel-art-sheet.png) | A pixel-art take on the book, the wordmark and the world | **Campaign art only, never product UI.** It uses its own palette (royal blue, red ribbon) and its own letterforms, so it must not leak into the app or the landing page. The [avatar sprites](#avatar-sprites) are pixel art too, but their own, in the brand palette |
| [docs/design/brand/logo/](brand/logo/) `mark.png`, `wordmark-ink.png`, `wordmark-cream.png` | The owner's logo art, 2026-09-27: the mark alone (1254px), and the GNOSIA letters in deep teal (for light grounds) and in cream (for dark grounds), 2172 by 724, all on transparent grounds | Source of the four files below |
| [apps/web/public/brand/](../../apps/web/public/brand/) `mark.png` (256), `wordmark-ink.png`, `wordmark-cream.png` (96px tall) | Cut from `docs/design/brand/logo/`: pixels under 32 alpha cleared (the faint haze round the art), cropped to the art, scaled | `GnosiaWordmark` and `GnosiaLockup` |
| [apps/web/src/app/icon.png](../../apps/web/src/app/icon.png) (512) | Cut from `logo/mark.png`: the same clean-up, squared with a 5% margin | Favicon and PWA icon |
| [apps/web/src/app/apple-icon.png](../../apps/web/src/app/apple-icon.png) (180) | `logo/mark.png` at 70% of the tile on a solid `--brand-navy` (`#0d1c2b`) square; opaque, because iOS fills a transparent home-screen icon with black, and square, because iOS rounds the corners itself | Home-screen icon |
| [apps/web/public/brand/mascot/](../../apps/web/public/brand/mascot/) `{neutral,happy,reading,curious,excited,sleepy}.png` | Cut from the renders in `docs/design/brand/mascot/`: trimmed to the art plus 8px and scaled to 900px on the longest side (620 to 880px wide) | `GnosiaMascot` |
| [apps/web/public/opengraph-image.png](../../apps/web/public/opengraph-image.png) (1200 by 630) | Made from `hero-lockup.png` | The social card |
| [apps/web/public/banner.png](../../apps/web/public/banner.png) | Made from `world-staircase.png` | A wide banner, for the repository and campaign use |

The two icon files, the social card and the banner are cut by hand from
the art; do not regenerate them from code. [kit/render.mjs](kit/render.mjs)
(SVG or HTML to PNG, fonts loaded, optional transparent ground) and
[kit/gen-icons.mjs](kit/gen-icons.mjs) (the flat mark on a tile, read from
`GnosiaMark.tsx`) exist for previews and for any size the art does not cover.

## The mark

The symbol on the logo sheet: a **G drawn as a ribbon** in deep teal, cut
at the top right into a flag-shaped terminal, sweeping round the left, with
an arm coming in from the right to a pointed tip. Its lower half **fans out
into an open book**: cream pages spread from a spine at the bottom centre,
thin at the spine and wide at the outer edges, and the ribbon closes under
them into a point. A **gold four-point star** sits in the counter, above the
spine. The book is accumulated knowledge, the star is insight rising out of
it, and the G makes the symbol Gnosia's own.

The art is rendered with gradients (teal into a lighter green along the
ribbon, a glow on the star). [GnosiaMark.tsx](../../apps/web/src/components/brand/GnosiaMark.tsx)
is a flat, three-fill reduction of it on a 64 unit grid. The interface no
longer draws it (it shows the owner's `logo/mark.png`); it stays because the
preview kit renders from it, and its star (`MARK_STAR`) is the landing
page's star glyph:

| Part | Fill | Construction |
| --- | --- | --- |
| The ribbon (`MARK_G`) | `currentColor` | One closed contour: the flag terminal at the top right (62, 4 to 54, 13), the outer bowl round to the left edge at x = 4, the two leaves meeting at (32, 61), the right side up to the arm, the arm's tip at (46, 21), and the counter traced back along the inside. No strokes, so it holds at 16px |
| The book (`MARK_BOOK`) | `--brand-cream` | Two pages a side, each thin at the spine (x = 32) and about 6 units wide at the outer end, the upper pair reaching to x = 5.5 and 58.5. Always inside the ribbon, never over the ground, because cream on the cream page would vanish |
| The star (`MARK_STAR`) | `--brand-gold` | Four points with concave sides, 19 units wide and 20 tall, centred in the counter at (32, 29) |

The pages stay cream in both themes (`--brand-cream` is `#faf6ec` and
`#f4ecdc`). The ribbon takes its colour from the caller: `text-brand-teal`
in the wordmark, which is the deep teal on cream and the lifted teal on
navy, as the logo sheet's dark card does.

**Sizes.** Smallest is the 16px favicon, where it reads as a teal shield
with a notch, a pale band and a gold point. At 44px (the sign-in lockup) and
up, the flag terminal, the arm and the two pages are all legible. Leave clear
space of at least a quarter of the mark's width on every side.

**Don't** outline it, add a drop shadow, rotate it, recolour the star to
anything but gold, or let the pages spill outside the ribbon.

### The wordmark and the lockup

`GNOSIA` is a light geometric sans with a wide, open G and an A with no
crossbar. Until 2026-09-27 the interface faked it in tracked Figtree
semibold, which kept the crossbar and never looked right; it now uses the
owner's own letter art from `docs/design/brand/logo/`, in two colourways:
deep teal on light grounds, cream on dark ones. The swap is CSS (`dark:`),
so the first paint is right in every theme.
[GnosiaWordmark](../../apps/web/src/components/brand/GnosiaWordmark.tsx) puts
the mark at 1.9em beside letters 0.8em tall and is sized by font size (15px
in the app bar, 13px in the footer). `GnosiaLockup` stacks the mark over the
letters, for the sign-in card. A screen reader hears "Gnosia" once: the mark
is decorative, and only one colourway is ever displayed.

## The mascot

A small living tome: teal covers folded into a **dark hood**, cream pages
fanned behind it, gold line accents along the cover, the **star sigil**
glowing on the brow, **two glowing crescent eyes** in the hood's shadow, two
small cloth hands, and a **ribbon tail** in teal and green trailing below.
Its expression lives in the eyes: closed smiles for neutral and happy,
round for reading and curious, squeezed shut for excited, downturned
crescents for sleepy. Happy and excited raise both hands with gold strokes
either side, and excited adds four-point sparkles; reading holds an open
book up, sleepy holds one low.

Each pose is its own render from the owner, 1254px square on a transparent
ground, kept in [docs/design/brand/mascot/](brand/mascot/). The renders have
no background, no fringe and no baked shadow, so the same file works on
cream and on navy. The copies the app ships are trimmed to the art plus 8px
and scaled to 900px on the longest side, which covers the 400px hero at 2x.
[GnosiaMascot](../../apps/web/src/components/brand/GnosiaMascot.tsx) renders
a pose from `public/brand/mascot/` with `next/image`, `alt=""`, sized by
height with a class. The poses are static imports, so each ships under a
content-hashed URL and `next/image` reads its pixel size from the file: a
replaced file needs no size edited anywhere and never leaves a browser on
the old picture.

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
`--brand-navy` and drawn mostly in the brand's teal, cream and gold, with a
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
cards (`.gnosia-glass`, frosted white on cream, a teal-tinted pane on navy,
now only on the sign-in card), sheets of paper (`.gnosia-paper`, the warm
white card every product glimpse on the landing page sits on) and three flat
chapter washes (`.gnosia-panel-teal`, `-gold`, `-mist`: 11 to 42% of a brand
colour mixed into the ground). The app keeps its flat, border-only kit. Motion is limited to the
mascot's float and a single 0.9 second rise on the hero text, all of it
behind `prefers-reduced-motion: no-preference`. Nothing moves on scroll.

**The star as a state.** The mark's star, drawn alone, marks the next concept
on the frontier in chapter two, and heads the colophon.
Reuse it the same way in the app: the active item, a mastered concept, an
insight. Not as a bullet or an ornament.

## Where each piece appears

| Piece | Where |
| --- | --- |
| `GnosiaWordmark` | The app's top bar (links to `/home`), the public header (links to `/`) and footer |
| `GnosiaLockup` | The sign-in card |
| `GnosiaMascot` | Landing hero (`curious`), chapters one to three (`reading`, `excited`, `happy`), sign-in (`happy`) |
| `PixelAvatar` | The sidebar's account row (32px), and the picker on Settings' Profile tab (48px) |
| The brand button (`variant="brand"` in [classes.ts](../../apps/web/src/components/ui/classes.ts)) | The landing page's calls to action and the sign-in button. Teal face, navy lip and cream label in light; in dark the lip is teal sunk halfway into navy and the label turns navy |
| `.gnosia-ground` | The `(site)` layout |
| `.gnosia-paper`, `.gnosia-panel-*` | The landing page's probe, chapter glimpses and chapter panels |
| `.gnosia-glass` | The sign-in card |
| Literata (`font-book`) | Every title on the public pages, the chapter and contents numerals, the colophon |
| The world art (`public/banner.png`) | The landing page's closing band |
| `ThemeToggle` (moon in light, sun in dark) | The public header, beside Sign in and on the sign-in page. Light is the default for a visitor with no cookie; a click flips the appearance and keeps the palette (Gnosia light and Gnosia dark, or Light and Dark), and writes the app's theme cookie, so it is this browser's theme in the app too (the cookie wins over the saved row there); the saved row and other devices are untouched, since only the app's theme control (Settings and the avatar menu) saves it |
| Icons, social card, banner | See [The source art](#the-source-art) |

## The Gnosia theme inside the app

The theme is two choices: a **palette**, Classic or Gnosia, and an
**appearance**, Light, Dark or System. That makes four palettes in
[globals.css](../../apps/web/src/app/globals.css): Classic light on `:root`
(Brilliant-derived: grey page, blue accent, black pill), Classic dark on
`.dark`, **Gnosia** on `.gnosia`, and **Gnosia dark** on `.gnosia.dark`
([below](#gnosia-dark)). Gnosia is the brand palette above applied to every
app page: cream paper, teal accent, navy ink, gold kept for the streak. It is
a light theme, so Tailwind's `dark:` variant stays off under it. The block
redefines only the tokens below; every other token falls through from `:root`.
The values are literal hex, with a comment naming the brand token where one
matches.

| Token | Gnosia | Replaces (`:root`) | Note |
| --- | --- | --- | --- |
| `--page` | `#faf6ec` | `#f8f8f8` | `--brand-cream` |
| `--surface` | `#fffdf8` | `#ffffff` | A whiter card, still warm |
| `--surface2` | `#f3eee1` | `#f3f3f3` | A deeper cream |
| `--tint` | `#e2efec` | `#eef1ff` | A pale teal wash |
| `--border` | `#e6dfd0` | `#e5e5e5` | Warm grey, 1.30:1 on the card (`:root` is 1.26) |
| `--hair` | `#ede7da` | `#ebebeb` | Warm grey |
| `--track` | `#e6dfd0` | `#e5e5e5` | The empty part of a bar or meter. In both light palettes it is the border's value, so nothing changed there; the dark palettes need their own ([the track](#contrast-checked-1)) |
| `--text` | `#15283a` | `#000000` | `--brand-ink` |
| `--text2` | `#605b54` | `#666666` | A warm muted ink |
| `--text3` | `#878276` | `#999999` | A lighter warm ink, for hints |
| `--accent` | `#148285` | `#4168fa` | A mid teal for fills, focus rings and the selected border |
| `--accent-text` | `#0f5f61` | `#294bc6` | `--brand-teal`, for links and ghost buttons |
| `--accent-lip` | `#0f5f61` | `#2e4fd1` | `--brand-teal`, under the accent button |
| `--btn-face` | `#0f5f61` | `#111111` | `--brand-teal` |
| `--btn-lip` | `#0d1c2b` | `#000000` | `--brand-navy` |
| `--btn-text` | `#faf6ec` | `#ffffff` | `--brand-cream` |
| `--m-hi` | `#0f5f61` | `#4168fa` | Mastered: `--brand-teal` |
| `--m-hi-lip` | `#0a4244` | `#2e4fd1` | A darker teal |
| `--m-mid` | `#529798` | `#a9b9ff` | Learning: a soft teal |
| `--m-mid-lip` | `#3b7475` | `#7e93e6` | A darker soft teal |
| `--m-lo` | `#ddd5c4` | `#e5e5e5` | Untouched: warm grey |
| `--lip-shade` | `#cbc1ad` | `#d4d4d4` | Under an untouched path node |
| `--streak` | `#b3842c` | `#ff9600` | `--brand-gold` |
| `--streak-text` | `#916a23` | `#b35a00` | The streak as small text: each palette's streak hue darkened until 11px text clears 4.5:1 on the card. `.dark` keeps its `--streak`, `#ffab33`, which is already 8.83:1 |
| `--ok-text` | `#008024` | `#009b2b` | Darkened to pass on cream and on its tint |
| `--ok-on` | `#0b2e14` | `#ffffff` | The dark label `.dark` already uses |

**Why the accent is not the brand teal.** Two components put opposite labels
on `--accent`: chips and the accent button write white on it, and the close
screen's stat tile writes the black `--on-tone` strip on it. The deep brand
teal carries white at 7.4:1 but black at only 2.8:1. `#148285` is the brand
teal's hue lifted to the one lightness where both clear 4.5:1 (4.60 and 4.56),
the same trick `.dark` plays with its blue ([Classic dark](#classic-dark)).
The deep teal still leads: it is the link colour, the primary button and the
mastered node.

### Contrast, checked

WCAG 2 relative luminance, computed with a script rather than read off a
picker. Text needs 4.5:1; graphics, focus rings and hints need 3:1. Both
Gnosia palettes and Classic dark (`.dark`, [below](#classic-dark)) pass
every pair but two in Gnosia light: the learning and green fills on the
light track (see the note after the table). The `:root` column is Classic
light, for comparison; several of its pairs are still under the minimum
([Classic light](#classic-light) has the ones fixed so far).

| Pair | Gnosia | Gnosia dark | Needs | `:root` | `.dark` |
| --- | --- | --- | --- | --- | --- |
| `--text` on `--page` | 13.93 | 14.97 | 4.5 | 19.77 | 18.42 |
| `--text` on `--surface` | 14.79 | 13.41 | 4.5 | 21.00 | 16.67 |
| `--text` on `--tint` | 12.74 | 12.03 | 4.5 | 18.66 | 13.99 |
| `--text2` on `--page` | 6.23 | 8.42 | 4.5 | 5.41 | 7.30 |
| `--text2` on `--surface` | 6.62 | 7.54 | 4.5 | 5.74 | 6.61 |
| `--text2` on `--surface2` | 5.81 | 6.57 | 4.5 | 5.17 | 5.77 |
| `--text2` on `--tint` | 5.70 | 6.77 | 4.5 | 5.10 | 5.54 |
| `--text3` on `--surface` (hints, so 3:1) | 3.77 | 4.15 | 3 | 2.85 | 3.88 |
| `--text3` on `--page` | 3.55 | 4.64 | 3 | 2.68 | 4.29 |
| `--text3` on `--surface2` | 3.31 | 3.62 | 3 | 2.57 | 3.39 |
| `--accent-text` on `--page` | 6.88 | 7.94 | 4.5 | 6.78 | 6.35 |
| `--accent-text` on `--surface` | 7.30 | 7.11 | 4.5 | 7.20 | 5.75 |
| `--accent-text` on `--tint` | 6.29 | 6.38 | 4.5 | 6.40 | 4.82 |
| `--btn-text` on `--btn-face` | 6.88 | 7.94 | 4.5 | 18.88 | 16.67 |
| White on `--accent` (chips, accent button) | 4.60 | 4.60 | 4.5 | 4.58 | 4.58 |
| `--on-tone` (black) on `--accent` (stat tile) | 4.56 | 4.56 | 4.5 | 4.59 | 4.59 |
| `--ok-text` on `--ok-tint` | 4.62 | 7.66 | 4.5 | 3.32 | 7.66 |
| `--ok-text` on `--page` | 4.73 | 10.19 | 4.5 | 3.45 | 10.28 |
| `--warn-text` on `--warn-tint` | 4.71 | 9.17 | 4.5 | 4.71 | 9.17 |
| `--warn-text` on `--page` | 4.75 | 12.53 | 4.5 | 4.83 | 12.63 |
| `--warn-on` on `--warn` | 5.60 | 6.31 | 4.5 | 5.60 | 6.31 |
| `--ok-on` on `--ok` | 6.97 | 6.97 | 4.5 | 2.13 | 6.97 |
| `--danger` on `--surface` | 5.18 | 6.97 | 4.5 | 5.26 | 7.10 |
| `--danger` on `--page` | 4.87 | 7.78 | 4.5 | 4.95 | 7.85 |
| `--accent` on `--surface` (focus ring) | 4.53 | 3.55 | 3 | 4.58 | 3.64 |
| `--accent` on `--page` (focus ring) | 4.27 | 3.97 | 3 | 4.31 | 4.02 |
| `--accent` on `--tint` (selected row border) | 3.90 | 3.19 | 3 | 4.07 | 3.05 |
| `--accent` on `--track` (the target bar, and every bar's default fill) | 3.47 | 4.56 | 3 | 3.64 | 4.59 |
| `--ok` on `--track` (a bar's `ok` tone; no page uses it yet) | 1.60 | 9.87 | 3 | 1.69 | 9.87 |
| `--m-hi` on `--track` (a mastered bar) | 5.59 | 9.13 | 3 | 3.64 | 7.24 |
| `--m-mid` on `--track` (a learning bar) | 2.54 | 4.14 | 3 | 1.51 | 3.86 |
| `--track` against `--surface` (an empty bar on a card) | 1.30 | 1.28 | (gap) | 1.26 | 1.26 |
| `--track` against `--page` (the session and review strips) | 1.23 | 1.15 | (gap) | 1.19 | 1.14 |
| The track's 1px `--border` edge against `--surface` | 1.30 | 1.86 | (gap) | 1.26 | 1.94 |
| The track's 1px `--border` edge against `--page` | 1.23 | 2.07 | (gap) | 1.19 | 2.15 |
| `--m-hi` on `--surface` | 7.30 | 7.11 | 3 | 4.58 | 5.75 |
| `--m-mid` on `--surface` | 3.31 | 3.23 | 3 | 1.90 | 3.07 |
| `--m-mid` on `--page` | 3.12 | 3.60 | 3 | 1.79 | 3.39 |
| `--m-hi` against `--m-mid` | 2.20 | 2.20 | (gap) | 2.41 | 1.87 |
| `--m-mid` against `--m-lo` | 2.31 | 1.74 | (gap) | 1.51 | 1.58 |
| `--streak` on `--page` (the dot, the day rings) | 3.11 | 9.86 | 3 | 2.06 | 9.76 |
| `--streak` on `--surface` | 3.30 | 8.83 | 3 | 2.18 | 8.83 |
| `--streak-text` on `--surface` (today's day letter, 11px) | 4.82 | 8.83 | 4.5 | 4.80 | 8.83 |
| `--streak-text` on `--page` | 4.54 | 9.86 | 4.5 | 4.52 | 9.76 |
| Check on a `--streak` disc (`--streak-on`) | 3.36 | 9.86 | 3 | 2.18 | 9.76 |
| Mark on a mastered path node (`--m-hi-on`) | 7.42 | 7.94 | 3 | 4.58 | 6.35 |
| White mark on a learning path node | 3.37 | 5.07 | 3 | 1.90 | 5.44 |

**The track.** Every bar (`TargetBar`, `ProgressBar`, the session and
review strips) draws its fill on `--track`. They used to draw it on
`--border`, where in both dark palettes the accent fill was under 3:1 (1.88
and 1.91), and no accent could fix that without losing its white label. A
darker `--border` would have moved every card outline and input with it, so
the bars got their own token instead.

In the dark palettes the track is darker than the card. A lighter track
cannot work: the accent is only 3.64:1 on `.dark`'s card and
3.55:1 on Gnosia dark's, so a track any lighter than the card leaves it
under 3:1 before the track is even visible. Darker, every fill passes, and
the lowest, learning, is 3.86 and 4.14. Black is as far from the card as a
darker track can get, 1.26:1 and 1.28:1, the step `:root` has between its
`#e5e5e5` track and the white card. A navy tint for Gnosia dark would sit
under L* 1, where no one can see it, and would give up some of that step.

On the page black is only 1.14:1 and 1.15:1 apart, so an empty session or
review strip would all but vanish. Every track therefore carries a 1px inset
ring in `--border` (`TRACK` in
[classes.ts](../../apps/web/src/components/ui/classes.ts)), which marks its
extent at 1.94:1 on `.dark`'s card and 2.15:1 on its page, what the old
`--border` track gave. The fill is drawn over the ring, so the ring never
sits between the fill and the track. In the light palettes the ring is the
track's own colour and cannot be seen.

In the light palettes the track is the border's value, unchanged. The
accent and mastered fills pass on it; the learning and green fills do not
(`:root` 1.51 and 1.69, Gnosia 2.54 and 1.60), and no light track can fix
that, since `:root`'s learning blue is only 1.90:1 on the white card itself.
The fix for those belongs to the light mastery ramp. Every bar that
shows p(L) prints the number beside it, and no page draws the green tone.

Two pairs used to fall short. Each was fixed without moving a token another
component depends on:

1. **The stat tile's "right" strip.** Darkening `--ok-text` so the answer
   text passes brings the black `--on-tone` label on it to 4.11:1, and no
   green can do both jobs over a visible tint. `StatTile` frames the `ok`
   tile in `--ok`, the green face, instead (black on it is 9.9:1).
2. **Today's day letter in the streak strip.** It is 11px text, and in
   `--streak` it was 3.30:1 on the card here and 2.18:1 in orange under
   `:root`. It reads `--streak-text` now, a darker step of the same hue in
   every palette, so the gold and the orange stay the fill (discs, rings,
   and the large streak number, which is large text at 3:1) and only the
   small letter darkens.

### The primary button

The pill is the landing page's brand button: teal face, navy lip, cream
label (6.88:1). The sign-in page already presses it, so the app pressing the
same button makes the two feel like one product, and a black pill on cream
reads as Brilliant rather than Gnosia. The accent button stays distinct from
it: mid teal over a deep teal lip, white label.

### The mastery ramp

Mastered is the deep brand teal, learning a soft teal, untouched a warm
grey. The three are stepped by lightness so a reader who cannot tell hues
apart still can: L* 36.3, 58.2 and 85.5, gaps of 22.0 and 27.3, luminance
ratios of 2.20 and 2.31. `:root` has 2.41 and 1.51, so the bottom step is
wider than before. Learning cannot be paler than it is and still clear 3:1 on
the card, which is why it reads as soft rather than pale.

Against the green verdict colour the ramp is apart in both lightness and
hue. Simulated for deuteranopia (Machado 2009, full severity), `--m-hi` and
`--m-mid` become slate blue-greys (`#4c5261`, `#838899`) while `--ok` becomes
an olive (`#bdad60`): ΔE 62 and 53, L* gaps of 36 and 14. The one close pair
is the gold streak against the green `--ok` under deuteranopia (ΔE 15, where
orange was 35); they never share a component, and the streak always carries
a label or a check.

### What did not change

The signal colours keep their `:root` hues: `--ok`, `--ok-lip` and
`--ok-tint` green, `--warn`, `--warn-lip` and `--warn-tint` yellow, `--danger`
red, `--violet`, and the black `--on-tone`. Right, not quite and wrong have to
mean the same thing in every theme, and they have to stay unmistakable beside
teal and gold, so they are kept as saturated as the kit drew them. Only three
labels moved, each because it was under 4.5:1: `--ok-text` and `--warn-text`
darkened just far enough within their own hue, and `--ok-on`, the label on a
green face, became the dark green `.dark` already uses. `--warn-text` has since
moved in `:root` too ([Classic light](#classic-light)), so `.gnosia` no longer
needs its own. The `--brand-*` tokens
are not redefined by `.gnosia`; their `:root` values are the light ones, which
is what this theme wants.

### Gnosia dark

The brand's navy as a dark palette, selected by both classes on `<html>`,
`gnosia` and `dark`. So Tailwind's `dark:` variant is on, `color-scheme` is
dark, and the `--brand-*` tokens take their `.dark` values: the top bar's mark
is the lifted teal on navy (7.11:1), as on the public pages. The block sits
after `.dark` and `.gnosia` and outranks both, since two classes beat one.
It also declares every token either of them sets. Otherwise a token that only
`.gnosia` defines (`--accent-lip`, the path-node lips, `--ok-text`) would
leak its light value into the dark palette, because between two one-class
rules the later one wins.

| Token | Gnosia dark | Note |
| --- | --- | --- |
| `--page` | `#0a1621` | `--brand-navy` in dark: the public pages' dark ground, so the app and the site sit on the same navy |
| `--surface` | `#102131` | The navy's hue lifted to OKLCH L 0.24, the lightness of `.dark`'s card; a step above `#0d1c2b` |
| `--surface2` | `#1b2c3c` | L 0.285, as `.dark`'s `--surface2` |
| `--tint` | `#112c32` | A teal wash sunk into navy, dark enough that the accent border still clears 3:1 on it |
| `--border` | `#3d4c5b` | Navy-grey, 1.86:1 on the card (`.dark` is 1.94) |
| `--hair` | `#263645` | Navy-grey |
| `--track` | `#000000` | The empty part of a bar, darker than the card so every fill clears 3:1 on it (the accent 4.56, learning 4.14); 1.28:1 from the card, the most a darker track can be ([the track](#contrast-checked-1)) |
| `--text` | `#eee8dc` | `--brand-ink` in dark |
| `--text2` | `#a3b2bf` | `--brand-mist` in dark |
| `--text3` | `#74828f` | A quieter grey-blue for hints |
| `--accent` | `#148285` | Gnosia's mid teal, unchanged: the one teal that carries a white label and the black stat-tile strip |
| `--accent-text` | `#5cbab3` | `--brand-teal` in dark, for links and ghost buttons |
| `--accent-lip` | `#0f5f61` | The deep brand teal, under the accent button |
| `--btn-face` | `#5cbab3` | The brand button in dark: lifted teal face |
| `--btn-lip` | `#33686a` | The teal sunk halfway into navy, as `variant="brand"` draws it |
| `--btn-text` | `#0a1621` | Navy label |
| `--m-hi` | `#5cbab3` | Mastered: the lifted brand teal |
| `--m-hi-lip` | `#36908a` | A darker teal |
| `--m-hi-on` | `#0a1621` | The mark on a mastered node turns navy, since white on the bright teal is 2.30:1 |
| `--m-mid` | `#187b78` | Learning: a deep teal |
| `--m-mid-lip` | `#025f5d` | A darker deep teal |
| `--m-lo` | `#3d4c5b` | Untouched: the border's navy-grey |
| `--lip-shade` | `#05101c` | Under an untouched path node, darker than the page |
| `--streak` | `#e2b95e` | `--brand-gold` in dark |
| `--streak-text` | `#e2b95e` | The same gold: 8.83:1 on the card, so the letter needs no darker step |
| `--streak-on` | `#0a1621` | The check on a done day turns navy, since white on the bright gold is 1.85:1 |
| Signal colours | as `.dark` | `--ok`, `--ok-lip`, `--ok-text`, `--ok-tint`, `--ok-on`, `--warn`, `--warn-lip`, `--warn-text`, `--warn-tint`, `--warn-on`, `--danger`, `--violet`, `--on-tone`: every pair passes on navy, so none moved |

**The mastery ramp on navy.** Mastered is the brightest step, as in `.dark`,
so the thing earned is the thing that stands out on the dark card: L* 69.9,
46.6 and 31.6, luminance ratios of 2.20 (the same gap as Gnosia light) and
1.74 (`:root` has 1.51, `.dark` 1.58). Learning cannot be much lighter and
still sit clearly below mastered, or much darker and still clear 3:1 on the
card, so the bottom gap is the narrower one. Untouched is the border colour,
as it is in `.dark`, since it is drawn as an empty ring.

**Marks on a bright fill.** A bright mastered teal and a bright gold carry a
white mark at only 2.30:1 and 1.85:1. `--m-hi-on` and `--streak-on` name
those two marks: white in both light palettes, so they are declared once on
`:root`, and navy here (7.94:1 and 9.86:1). Classic dark has the same
problem and the same fix, in its own page colour.

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
| `--accent-lip` and `--m-hi-lip` (`#2e4fd1`) against the face | 1.55 | 1.45 | (a darker lip) |
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
| `--m-mid-lip` | `#7e93e6` (from `:root`) | `#3a4a8f` | The lip under a learning node. `.dark` never set it, so it fell through to the light value, a lip lighter than its face; the old learning blue is the darker shade now |
| `--streak-on` | `#ffffff` (from `:root`) | `#141414` | The check on the orange disc is the page colour, 9.76:1 |
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
