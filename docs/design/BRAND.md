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
| `--brand-teal` | `#0f5f61` | `#5cbab3` | The mark, the brand button's face, eyebrows, icon chips | Light: deep enough to carry cream text at 6.9:1 and to read as "deep teal" rather than green. Dark: lifted until it clears 7.9:1 on navy, since in dark it is a text colour too |
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
| `teal` on ground (eyebrows, mark) | 6.88 | 7.94 | 4.5 |
| `teal` on glass | 7.23 | 7.16 | 4.5 |
| Brand button label on its face (cream on teal, navy on teal) | 6.88 | 7.94 | 4.5 |
| `gold` star on ground | 3.11 | 9.86 | 3 (non-text) |
| Teal mark in the app's top bar (on `--surface`) | 7.42 | 7.25 | 3 (non-text) |

## The source art

The owner's art is the reference. Everything drawn in code is a flat
reduction of it, and where the two disagree the art wins.

| File | What it is | Used for |
| --- | --- | --- |
| [docs/design/brand/logo-sheet.png](brand/logo-sheet.png) | The primary lockup, the symbol alone, the wordmark alone, both on light and dark, and the app icon | The canonical mark and wordmark; `GnosiaMark` is drawn from it |
| [docs/design/brand/app-icon.png](brand/app-icon.png) | The app icon: the mark on a navy-to-teal rounded square, 1254px | Source of the three icon files below |
| [docs/design/brand/mascot-sheet.png](brand/mascot-sheet.png) | The mascot in six poses: neutral, happy, reading, curious, excited, sleepy | Reference only; the shipped poses come from the renders below |
| [docs/design/brand/mascot/](brand/mascot/) `{neutral,happy,reading,curious,excited,sleepy}.png` | The six poses as separate renders, one file per pose, 1254px square on a transparent ground | Source of the shipped poses below |
| [docs/design/brand/hero-lockup.png](brand/hero-lockup.png) | The mark, the wordmark, the tagline and the mascot together on cream | Source of the social card |
| [docs/design/brand/composite.png](brand/composite.png) | The lockup, the mascot and the icons on one board | Reference only |
| [docs/design/brand/world-staircase.png](brand/world-staircase.png) | The world: a staircase of books into a sky city, the mascot beside it | Source of `public/banner.png` |
| [docs/design/brand/pixel-art-sheet.png](brand/pixel-art-sheet.png) | A pixel-art take on the book, the wordmark and the world | **Campaign art only, never product UI.** It uses its own palette (royal blue, red ribbon) and its own letterforms, so it must not leak into the app or the landing page |
| [apps/web/src/app/icon.png](../../apps/web/src/app/icon.png) (512) | Cut from `app-icon.png`, transparent corners | Favicon and PWA icon |
| [apps/web/src/app/apple-icon.png](../../apps/web/src/app/apple-icon.png) (180) | Cut from `app-icon.png` | Home-screen icon |
| [apps/web/public/brand/app-icon-256.png](../../apps/web/public/brand/app-icon-256.png) | Cut from `app-icon.png` | Anywhere a 256px icon is wanted |
| [apps/web/public/brand/mascot/](../../apps/web/public/brand/mascot/) `{neutral,happy,reading,curious,excited,sleepy}.png` | Cut from the renders in `docs/design/brand/mascot/`: trimmed to the art plus 8px and scaled to 900px on the longest side (620 to 880px wide) | `GnosiaMascot` |
| [apps/web/public/opengraph-image.png](../../apps/web/public/opengraph-image.png) (1200 by 630) | Made from `hero-lockup.png` | The social card |
| [apps/web/public/banner.png](../../apps/web/public/banner.png) | Made from `world-staircase.png` | A wide banner, for the repository and campaign use |

The three icon files, the social card and the banner are cut by hand from
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
is the flat, three-fill reduction for the interface, on a 64 unit grid:

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

The sheet's `GNOSIA` is a light geometric sans with a wide, open G and an A
with no crossbar. The interface sets it in Figtree semibold, uppercase,
tracked at 0.3em: the closest the loaded face allows. The letters are live
text, not paths, so the A keeps its crossbar; the sheet's letterforms appear
only where the art itself is used (the social card, the icons).
[GnosiaWordmark](../../apps/web/src/components/brand/GnosiaWordmark.tsx) puts
the mark at 1.9em beside the letters and is sized by font size (15px in the
app bar, 13px in the footer). `GnosiaLockup` stacks the mark over the
letters, for the sign-in card. A screen reader hears "Gnosia" once: the mark
is hidden and the capitals are CSS.

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
| `GnosiaWordmark` | The app's top bar (links to `/today`), the public header (links to `/`) and footer |
| `GnosiaLockup` | The sign-in card |
| `GnosiaMascot` | Landing hero (`curious`), chapters one to three (`reading`, `excited`, `happy`), sign-in (`happy`) |
| The brand button (`variant="brand"` in [classes.ts](../../apps/web/src/components/ui/classes.ts)) | The landing page's calls to action and the sign-in button. Teal face, navy lip and cream label in light; in dark the lip is teal sunk halfway into navy and the label turns navy |
| `.gnosia-ground` | The `(site)` layout |
| `.gnosia-paper`, `.gnosia-panel-*` | The landing page's probe, chapter glimpses and chapter panels |
| `.gnosia-glass` | The sign-in card |
| Literata (`font-book`) | Every title on the public pages, the chapter and contents numerals, the colophon |
| The world art (`public/banner.png`) | The landing page's closing band |
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
| `--text` | `#15283a` | `#000000` | `--brand-ink` |
| `--text2` | `#605b54` | `#666666` | A warm muted ink |
| `--text3` | `#878276` | `#999999` | A lighter warm ink, for hints |
| `--accent` | `#148285` | `#456dff` | A mid teal for fills, focus rings and the selected border |
| `--accent-text` | `#0f5f61` | `#294bc6` | `--brand-teal`, for links and ghost buttons |
| `--accent-lip` | `#0f5f61` | `#2e4fd1` | `--brand-teal`, under the accent button |
| `--btn-face` | `#0f5f61` | `#111111` | `--brand-teal` |
| `--btn-lip` | `#0d1c2b` | `#000000` | `--brand-navy` |
| `--btn-text` | `#faf6ec` | `#ffffff` | `--brand-cream` |
| `--m-hi` | `#0f5f61` | `#456dff` | Mastered: `--brand-teal` |
| `--m-hi-lip` | `#0a4244` | `#2e4fd1` | A darker teal |
| `--m-mid` | `#529798` | `#a9b9ff` | Learning: a soft teal |
| `--m-mid-lip` | `#3b7475` | `#7e93e6` | A darker soft teal |
| `--m-lo` | `#ddd5c4` | `#e5e5e5` | Untouched: warm grey |
| `--lip-shade` | `#cbc1ad` | `#d4d4d4` | Under an untouched path node |
| `--streak` | `#b3842c` | `#ff9600` | `--brand-gold` |
| `--streak-text` | `#916a23` | `#b35a00` | The streak as small text: each palette's streak hue darkened until 11px text clears 4.5:1 on the card. `.dark` keeps its `--streak`, `#ffab33`, which is already 8.83:1 |
| `--ok-text` | `#008024` | `#009b2b` | Darkened to pass on cream and on its tint |
| `--ok-on` | `#0b2e14` | `#ffffff` | The dark label `.dark` already uses |
| `--warn-text` | `#8c6800` | `#b78900` | Darkened to pass on cream and on its tint |

**Why the accent is not the brand teal.** Two components put opposite labels
on `--accent`: chips and the accent button write white on it, and the close
screen's stat tile writes the black `--on-tone` strip on it. The deep brand
teal carries white at 7.4:1 but black at only 2.8:1. `#148285` is the brand
teal's hue lifted to the one lightness where both clear 4.5:1 (4.60 and 4.56),
the same trick `:root` plays with its blue. The deep teal still leads: it is
the link colour, the primary button and the mastered node.

### Contrast, checked

WCAG 2 relative luminance, computed with a script rather than read off a
picker. Text needs 4.5:1; graphics, focus rings and hints need 3:1. Both
Gnosia palettes pass every pair. The last two columns are the same pair in
the Classic palettes, for comparison.

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
| White on `--accent` (chips, accent button) | 4.60 | 4.60 | 4.5 | 4.30 | 4.30 |
| `--on-tone` (black) on `--accent` (stat tile) | 4.56 | 4.56 | 4.5 | 4.88 | 4.88 |
| `--ok-text` on `--ok-tint` | 4.62 | 7.66 | 4.5 | 3.32 | 7.66 |
| `--ok-text` on `--page` | 4.73 | 10.19 | 4.5 | 3.45 | 10.28 |
| `--warn-text` on `--warn-tint` | 4.71 | 9.17 | 4.5 | 2.93 | 9.17 |
| `--warn-text` on `--page` | 4.75 | 12.53 | 4.5 | 3.00 | 12.63 |
| `--warn-on` on `--warn` | 5.60 | 6.31 | 4.5 | 5.60 | 6.31 |
| `--ok-on` on `--ok` | 6.97 | 6.97 | 4.5 | 2.13 | 6.97 |
| `--danger` on `--surface` | 5.18 | 6.97 | 4.5 | 5.26 | 7.10 |
| `--danger` on `--page` | 4.87 | 7.78 | 4.5 | 4.95 | 7.85 |
| `--accent` on `--surface` (focus ring) | 4.53 | 3.55 | 3 | 4.30 | 3.88 |
| `--accent` on `--tint` (selected row border) | 3.90 | 3.19 | 3 | 3.82 | 3.25 |
| `--m-hi` on `--surface` | 7.30 | 7.11 | 3 | 4.30 | 5.75 |
| `--m-mid` on `--surface` | 3.31 | 3.23 | 3 | 1.90 | 2.03 |
| `--m-mid` on `--page` | 3.12 | 3.60 | 3 | 1.79 | 2.24 |
| `--m-hi` against `--m-mid` | 2.20 | 2.20 | (gap) | 2.27 | 2.83 |
| `--m-mid` against `--m-lo` | 2.31 | 1.74 | (gap) | 1.51 | 1.05 |
| `--streak` on `--page` (the dot, the day rings) | 3.11 | 9.86 | 3 | 2.06 | 9.76 |
| `--streak` on `--surface` | 3.30 | 8.83 | 3 | 2.18 | 8.83 |
| `--streak-text` on `--surface` (today's day letter, 11px) | 4.82 | 8.83 | 4.5 | 4.80 | 8.83 |
| `--streak-text` on `--page` | 4.54 | 9.86 | 4.5 | 4.52 | 9.76 |
| Check on a `--streak` disc (`--streak-on`) | 3.36 | 9.86 | 3 | 2.18 | 1.89 |
| Mark on a mastered path node (`--m-hi-on`) | 7.42 | 7.94 | 3 | 4.30 | 2.90 |
| White mark on a learning path node | 3.37 | 5.07 | 3 | 1.90 | 8.22 |

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
ratios of 2.20 and 2.31. `:root` has 2.27 and 1.51, so the bottom step is
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
green face, became the dark green `.dark` already uses. The `--brand-*` tokens
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
1.74 (`:root` has 1.51, `.dark` 1.05). Learning cannot be much lighter and
still sit clearly below mastered, or much darker and still clear 3:1 on the
card, so the bottom gap is the narrower one. Untouched is the border colour,
as it is in `.dark`, since it is drawn as an empty ring.

**Marks on a bright fill.** A bright mastered teal and a bright gold carry a
white mark at only 2.30:1 and 1.85:1. `--m-hi-on` and `--streak-on` name
those two marks: white in every other palette, so they are declared once on
`:root`, and navy here (7.94:1 and 9.86:1).

**What `.dark` still misses.** The Classic dark palette falls short on four
pairs in the table: white on `--accent` (4.30), `--m-mid` on the card
(2.03), the check on a streak disc (1.89) and the mark on a mastered node
(2.90). None of them is new, and changing `.dark` is outside this palette's
scope. The last two are now a one-line value for `--streak-on` and
`--m-hi-on` in `.dark`.

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
| Next up, reviews due, a forgiving streak, a self-set target; no XP, hearts or leagues | The Today dashboard and the habit data |
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
whose "page numbers" are the app's routes, a colophon naming the mechanics
and the typefaces, and the world as the last page. **Literata** was picked
because it was drawn for reading long-form books on screens; it is loaded by
`(site)/layout.tsx` only, so no signed-in page downloads it, and the
`font-book` utility names it. The closing band carries the `dark` class so
the brand values and the brand button inside it are the dark ones in every
theme.
