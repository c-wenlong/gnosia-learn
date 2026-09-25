# Duolingo web tokens: notes

Source: computed-style dumps of the logged-in web app (Japanese course, light and dark), the 182 CSS chunks, and the palette object in the JS bundle. Every token carries `$extensions.source` naming the dump + node (`dt=` or `cl=`), the CSS file + selector, or the palette file. `$extensions.estimated` is never set: no value was read off a screenshot.

## How the file is organised

| Set | Contents | Tokens |
| --- | --- | --- |
| `core` | `palette.light.*` and `palette.dark.*` (all 300 Duolingo colour names, per theme), fontFamily, fontWeight, typography, space, radius, borderWidth, shadow, blur, opacity, filter, duration, easing, breakpoint, size (layout), zIndex | 759 |
| `light` | Semantic colour roles aliasing `{palette.light.<name>}` | 95 |
| `dark` | The same keys aliasing `{palette.dark.<name>}` | 95 |

Core breakdown: palette 600, fontFamily 2, fontWeight 3, typography 39, space 18, radius 11, borderWidth 5, shadow 9, blur 1, opacity 7, filter 2, duration 9, easing 7, breakpoint 9, size 27, zIndex 10.

`$themes` holds Light (core=source, light=enabled) and Dark (core=source, dark=enabled); `$metadata.tokenSetOrder` is core, light, dark. Shadow tokens live in core but their colours reference semantic tokens (for example `{accent.primary.lip}`), so they resolve per theme.

## Importing into Tokens Studio

1. Plugin settings: set token format to W3C DTCG (`$value`/`$type`).
2. Load `out/tokens.json` as a single JSON file (Tools, Load from file, or a single-file sync provider). Sets and both themes appear.
3. Pick the Light or Dark theme. `core` is a source set: its palette feeds references but is not exported unless you enable it.
4. `background.scrim` and `border.onColor` are black with an alpha modifier in `$extensions["studio.tokens"].modify`. Colour modifiers are a paid Tokens Studio feature; without it they import as solid black.

## The 3D button lip

Every lip is a solid, zero-blur shadow on a pseudo-element. The button reserves space with a transparent bottom border (4px, or 5px on thin `.rdtAy` buttons) and draws its face on `::before`. Filled buttons put a solid `0 4px 0` shadow in the lip colour under the face. Outline buttons, tap tokens and choice cards give `::before` a 2px border plus a `0 2px 0` shadow in the border colour, so the lip still reads 4px. Path nodes use `0 8px 0` on `::after` with a black 20% layer over the unit colour. Pressing removes the shadow and translates the button down by the lip width over 100ms linear.

## Semantic colour roles

Resolved per theme from that theme's dumps. When several palette names share a hex (dark `#202f36` is polar, iguana, canary, sea-sponge, walking-fish and cheetah), the name comes from the CSS rule that styles the node.

| Token | Light | Dark | Token | Light | Dark |
| --- | --- | --- | --- | --- | --- |
| `background.page` | snow `#ffffff` | snow `#131f24` | `feedback.incorrect.text` | fire-ant `#ea2b2b` | fire-ant `#d84848` |
| `background.scrim` | black `#000000` @0.4 | black `#000000` @0.4 | `feedback.incorrect.buttonFace` | cardinal `#ff4b4b` | cardinal `#ee5555` |
| `background.lessonFooter` | snow `#ffffff` | snow `#131f24` | `feedback.incorrect.buttonLip` | fire-ant `#ea2b2b` | fire-ant `#d84848` |
| `surface.default` | snow `#ffffff` | snow `#131f24` | `feedback.tile.correctFace` | sea-sponge `#d7ffb8` | sea-sponge `#202f36` |
| `surface.raised` | snow `#ffffff` | snow `#131f24` | `feedback.tile.correctBorder` | turtle `#a5ed6e` | turtle `#5f8428` |
| `surface.subtle` | polar `#f7f7f7` | polar `#202f36` | `feedback.tile.correctText` | tree-frog `#58a700` | tree-frog `#79b933` |
| `surface.hover` | polar `#f7f7f7` | polar `#202f36` | `feedback.neutral.text` | guinea-pig `#cd7900` | guinea-pig `#d79433` |
| `surface.selected` | iguana `#ddf4ff` | iguana `#202f36` | `feedback.tile.selectedBorder` | blue-jay `#84d8ff` | blue-jay `#3f85a7` |
| `surface.disabled` | swan `#e5e5e5` | swan `#37464f` | `feedback.tile.wrongBorder` | flamingo `#ffb2b2` | flamingo `#945151` |
| `border.default` | swan `#e5e5e5` | swan `#37464f` | `feedback.tile.wrongText` | fire-ant `#ea2b2b` | fire-ant `#d84848` |
| `border.divider` | swan `#e5e5e5` | swan `#37464f` | `gamification.streak` | fox `#ff9600` | fox `#ffab33` |
| `border.selected` | blue-jay `#84d8ff` | blue-jay `#3f85a7` | `gamification.streakInactive` | swan `#e5e5e5` | swan `#37464f` |
| `border.focus` | macaw `#1cb0f6` | macaw `#49c0f8` | `gamification.gems` | macaw `#1cb0f6` | macaw `#49c0f8` |
| `border.onColor` | black `#000000` @0.2 | black `#000000` @0.2 | `gamification.hearts` | cardinal `#ff4b4b` | cardinal `#ee5555` |
| `text.primary` | eel `#4b4b4b` | eel `#f1f7fb` | `gamification.xp` | bee `#ffc800` | bee `#ffc700` |
| `text.body` | black-text `#3c3c3c` | black-text `#f1f7fb` | `gamification.combo` | fox `#ff9600` | fox `#ffab33` |
| `text.secondary` | wolf `#777777` | wolf `#dce6ec` | `gamification.super.face` | cosmos `#3c4dff` | cosmos `#3c4dff` |
| `text.tertiary` | hare `#afafaf` | hare `#52656d` | `gamification.super.lip` | nebula `#3f22ec` | nebula `#3f22ec` |
| `text.disabled` | hare `#afafaf` | hare `#52656d` | `gamification.super.surface` | eclipse `#000437` | eclipse `#000437` |
| `text.link` | macaw `#1cb0f6` | macaw `#49c0f8` | `gamification.super.label` | nova `#cf17c8` | nova `#cf17c8` |
| `text.selected` | whale `#1899d6` | whale `#1899d6` | `gamification.league.promotion` | tree-frog `#58a700` | tree-frog `#79b933` |
| `text.onPrimary` | snow `#ffffff` | snow `#131f24` | `gamification.league.demotion` | fire-ant `#ea2b2b` | fire-ant `#d84848` |
| `text.onColor` | snow-always-light `#ffffff` | snow-always-light `#ffffff` | `gamification.league.currentUserRow` | swan `#e5e5e5` | swan `#37464f` |
| `accent.primary.face` | owl `#58cc02` | owl `#93d333` | `gamification.league.promotedRow` | sea-sponge `#d7ffb8` | sea-sponge `#202f36` |
| `accent.primary.lip` | tree-frog `#58a700` | tree-frog `#79b933` | `gamification.league.demotedRow` | walking-fish `#ffdfe0` | polar `#202f36` |
| `accent.secondary.face` | macaw `#1cb0f6` | macaw `#49c0f8` | `gamification.league.diamond` | diamond `#38d0d0` | diamond `#38d0d0` |
| `accent.secondary.lip` | whale `#1899d6` | whale `#1899d6` | `dataViz.progress.track` | swan `#e5e5e5` | swan `#37464f` |
| `accent.neutral.face` | snow `#ffffff` | snow `#131f24` | `dataViz.progress.fill` | owl `#58cc02` | owl `#93d333` |
| `accent.neutral.border` | swan `#e5e5e5` | swan `#37464f` | `dataViz.progress.fillSecondary` | bee `#ffc800` | bee `#ffc700` |
| `accent.neutral.text` | hare `#afafaf` | hare `#52656d` | `dataViz.progress.shine` | snow-always-light `#ffffff` | snow-always-light `#ffffff` |
| `accent.danger.face` | cardinal `#ff4b4b` | cardinal `#ee5555` | `dataViz.progress.labelOnTrack` | hare-always-light `#afafaf` | hare-always-light `#afafaf` |
| `accent.danger.lip` | fire-ant `#ea2b2b` | fire-ant `#d84848` | `dataViz.progress.labelOnFill` | guinea-pig-always-light `#cd7900` | guinea-pig-always-light `#cd7900` |
| `accent.danger.text` | cardinal `#ff4b4b` | cardinal `#ee5555` | `dataViz.avatar.purple` | beetle `#ce82ff` | beetle `#ce82ff` |
| `status.success` | owl `#58cc02` | owl `#93d333` | `dataViz.avatar.orange` | fox `#ff9600` | fox `#ffab33` |
| `status.successText` | tree-frog `#58a700` | tree-frog `#79b933` | `dataViz.avatar.red` | cardinal `#ff4b4b` | cardinal `#ee5555` |
| `status.successBackground` | sea-sponge `#d7ffb8` | sea-sponge `#202f36` | `unitColors.green` | owl-always-light `#58cc02` | owl-always-light `#58cc02` |
| `status.danger` | cardinal `#ff4b4b` | cardinal `#ee5555` | `unitColors.blue` | macaw-always-light `#1cb0f6` | macaw-always-light `#1cb0f6` |
| `status.dangerText` | fire-ant `#ea2b2b` | fire-ant `#d84848` | `unitColors.pink` | starfish `#ff86d0` | starfish `#ff86d0` |
| `status.dangerBackground` | walking-fish `#ffdfe0` | walking-fish `#202f36` | `unitColors.orange` | fox-always-light `#ff9600` | fox-always-light `#ff9600` |
| `status.warning` | fox `#ff9600` | fox `#ffab33` | `unitColors.purple` | beetle `#ce82ff` | beetle `#ce82ff` |
| `status.warningBackground` | canary `#fff5d3` | canary `#202f36` | `unitColors.magenta` | dragon `#cc348d` | dragon `#cc348d` |
| `status.info` | macaw `#1cb0f6` | macaw `#49c0f8` | `unitColors.teal` | peacock `#00cd9c` | peacock `#00cd9c` |
| `status.infoBackground` | iguana `#ddf4ff` | iguana `#202f36` | `unitColors.red` | cardinal-always-light `#ff4b4b` | cardinal-always-light `#ff4b4b` |
| `feedback.correct.background` | sea-sponge `#d7ffb8` | sea-sponge `#202f36` | `unitColors.brown` | grizzly-lite `#dc8f47` | grizzly-lite `#dc8f47` |
| `feedback.correct.text` | tree-frog `#58a700` | tree-frog `#79b933` | `unitColors.legendary` | bee `#ffc800` | bee `#ffc700` |
| `feedback.correct.buttonFace` | owl `#58cc02` | owl `#93d333` | `unitColors.locked` | swan `#e5e5e5` | swan `#37464f` |
| `feedback.correct.buttonLip` | tree-frog `#58a700` | tree-frog `#79b933` | `unitColors.foreground` | snow `#ffffff` | snow `#131f24` |
| `feedback.incorrect.background` | walking-fish `#ffdfe0` | walking-fish `#202f36` | | | |

## Type scale

Family is duolingo-sans for every rendered node. Sizes are px as rendered at desktop width; `--text-*` rows match the `:root` scale in app-f2ef02f8.css.

| Token | Size / line | Weight | Tracking | Case | Nodes | Where |
| --- | --- | --- | --- | --- | --- | --- |
| `pageTitle.small` | 32px / 36px | 700 | normal | none | 24 | Settings page titles (Courses, Profile, Preferences). |
| `heading.large` | 28px / 32px | 700 | normal | none | 1 | Large heading; one rendered instance. |
| `heading.medium` | 24px / 32px | 700 | normal | none | 103 | Section headings (settings groups Account/Subscription, lesson interstitials). |
| `heading.small` | 20px / 24px | 700 | normal | none | 458 | Card and panel titles (sidebar promo, settings side-nav, profile sections). |
| `heading.xsmall` | 16px / 20px | 700 | normal | none | 2 | Small heading; two rendered instances. |
| `body.default` | 20px / 28px | 500 | normal | none | 113 | Lesson sentence text, sections page, settings body. |
| `body.bold` | 20px / 28px | 700 | normal | none | 24 | Emphasised body (settings avatar label, Super feature list). |
| `body.spacious` | 20px / 32px | 500 | normal | none | 30 | Characters tips, lesson explanations. |
| `body.spaciousBold` | 20px / 32px | 700 | normal | none | 8 | Streak-goal options (7/14/30 day streak). |
| `body.compact` | 16px / 20px | 500 | normal | none | 47 | Profile and user-search secondary lines. |
| `caption.default` | 16px / 24px | 500 | normal | none | 539 | Most common body copy on desktop pages (card descriptions, ruby romaji, notes). |
| `caption.bold` | 16px / 24px | 700 | normal | none | 57 | Unit eyebrow (SECTION 4, UNIT 12), course count, form labels. |
| `label.medium` | 16px / 16px | 700 | 0.64px | uppercase | 20 | Uppercase labels (New word, Export my data, Delete my account). |
| `app.bodyDefault` | 17px / 20px | 500 | normal | none | 299 | Inherited default for any unstyled text (guidebook glyphs, leaderboard names). |
| `app.bodyStrong` | 17px / 20px | 700 | normal | none | 279 | Bold inline text (leaderboard rank sentence, numbers). |
| `app.railBody` | 17px / 25px | 500 | normal | none | 81 | Right-rail and sidebar card copy (No ads, personalized practice...). |
| `app.cardTitle` | 19px / 28px | 700 | normal | none | 133 | Right-rail card titles (Daily Quests, Try Super for free, Bronze League). |
| `app.navLabel` | 15px / 25px | 700 | 0.8px | uppercase | 656 | Sidebar navigation labels (LEARN, CHARACTERS...). |
| `app.statCounter` | 15px / 20px | 700 | normal | none | 162 | Top-bar counters: streak, gems, hearts. |
| `app.footerLink` | 13px / 16px | 700 | normal | uppercase | 409 | Right-rail footer links (ABOUT, BLOG, STORE...). |
| `app.eyebrow` | 15px / 18px | 700 | 0.6px | uppercase | 45 | Small uppercase status labels (Up next, Completed!). |
| `app.labelSmall` | 15px / 20px | 700 | 0.8px | uppercase | 81 | Follow buttons, Promotion Zone divider label. |
| `app.progressLabel` | 14px / 18px | 700 | 0.56px | uppercase | 84 | Quest bar counts (0 / 10). |
| `app.tooltipLabel` | 17px / 17px | 700 | 0.51px | uppercase | 54 | Path tooltips (START, Jump here?). |
| `app.statValue` | 20px / 20px | 700 | normal | none | 45 | Profile statistic values and league name, Invite friends. |
| `app.sectionTitle` | 24px / 26px | 700 | normal | none | 46 | Profile section titles (Statistics, Friend suggestions). |
| `app.modalTitle` | 24px / 30px | 700 | normal | none | 44 | Feedback bar title (Nice job!), ad-block card title, interstitial titles. |
| `app.promoTitle` | 25px / 34px | 700 | normal | none | 44 | Promo and welcome titles (Welcome Back!, Start a family plan). |
| `path.sectionTitle` | 25px / 32px | 700 | normal | none | 29 | Section title card on the learn path (Section 5). |
| `path.unitHeaderTitle` | 22px / 28px | 700 | normal | none | 27 | Sticky unit header title (Talk about favorite movies). |
| `path.unitDivider` | 19px / 26.6px | 700 | normal | none | 118 | Unit name between path units (line-height 1.4). |
| `button.default` | 15px / 18px | 700 | 0.8px | uppercase | 323 | 50px buttons across the app (Try Super for free, View all). |
| `button.large` | 17px / 20.4px | 700 | 0.8px | uppercase | 67 | Lesson footer buttons (CHECK, SKIP, CONTINUE). |
| `button.medium` | 16px / 44px | 700 | 0.64px | uppercase | 57 | 48px buttons (Save changes, Remove, Log out). rdtAy variant uses line-height 42px. |
| `button.small` | 14px / 28px | 700 | 0.56px | uppercase | 90 | 32px buttons (Try Chess, INVITE). |
| `lesson.challengeHeader` | 32px / 40px | 700 | normal | none | 28 | Lesson prompt (Write this in English). |
| `lesson.token` | 19px / 21.85px | 500 | normal | none | 271 | Word-bank tap tokens and ruby base text (line-height 1.15). |
| `characters.glyph` | 19px / 19px | 500 | 0.8px | none | 575 | Kana grid glyphs on /characters. |
| `characters.romaji` | 15px / 15px | 500 | 0.8px | none | 575 | Romaji under kana on /characters. |

## Fonts

The app registers its faces in JS. `fonts/f2331bbf...woff2` is duolingo-sans upright, one variable file registered for both 400 and 700 (canvas metrics match the live 400 face exactly). `fonts/3bbe299f...woff2` is the duolingo-sans italic, also both weights. `fonts/68d22534...woff2` is feather 700 (exact metric match). Body text asks for weight 500 (`--text-body-weight`) and is drawn from the same upright file. The CDN serves the files gzip-wrapped; decompress before installing them locally. `font-feature-settings` never differs from the default on any node.

## Gaps

- **Inferred, not observed:** `status.warning` in light. The dark value comes from the "Previous mistake" label, whose colour is set inline (no class rule); there is no light capture, so light uses the same palette name (fox).
- **CSS only, never rendered in that theme:** light `feedback.incorrect.*`, `status.danger{Text,Background}` and `feedback.tile.wrong*` (no light wrong-answer capture; from `._3FB5S._2cfV0`, `.o-3Ru`, `._3S8jJ`, `._2noWf`); dark `feedback.tile.correct*` (`._3v-Hx`), `gamification.combo` (`._1xB7m`), `dataViz.avatar.red` (`.XS0Dh`); light `gamification.streakInactive` (`._2HAQo`); both themes for `gamification.league.{demotion,promotedRow,demotedRow,diamond}` and `unitColors.{orange,purple,magenta,teal,red,brown,legendary,foreground}`.
- **Not tokenised:** league tier colours (Bronze to Diamond badges are SVG images with no CSS colour); charts (no chart was on any captured screen). A dark-theme rule sets `--path-unit-background-color` to polar-always-dark on unit sections, but no rendered node used it.
- **Colours matching no palette entry:** `#8ce31b` (profile avatar banner, the user's chosen avatar colour, 12 nodes); 58 distinct fills in inline SVG illustrations and icons (3,883 path nodes). Excluded as capture artefacts: the Claude-in-Chrome overlay (`#d97757`, `#faf9f5`, `#111111`) and the UA link blue `#0000ee` inherited by anchor wrappers with no text.
- **Palette:** light values were checked against the live `<html>` vars (300/300 match); dark values were only checked where a dump used them (no dark root-var capture). The JS palette names `refresh` and `refresh-progress-bar` are `--color-daily_refresh*` live.
- **Typography:** `--text-pageTitle-*-large` (40/44) and `--text-label-*-large` (24/24 uppercase) are declared but not rendered, so they are not tokens. feather is not rendered in the app (marketing page only).
- **Layout:** every desktop capture is 1200px or wider, so the compact 88px sidebar (700 to 1159px) is CSS only, and the breakpoint that hides the right rail was not identified. Breakpoint names other than 700px (mobile/desktop split) and 1160px (sidebar labels) describe what their rules mostly change, taken from rule counts.
- **Resolution method:** names shared by one hex were picked from the CSS rule on the node (or an ancestor's custom property). Three tokens (`border.divider`, `status.danger`, `feedback.tile.selectedBorder`) had no class rule; their name is the only palette entry matching both the light and the dark observation.
