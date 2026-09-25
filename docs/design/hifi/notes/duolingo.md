# Duolingo reference: extraction for hi-fi

Source: docs/design/reference/duolingo/ (captured 2026-09-25, both themes). Values
below are real captured or CSS-derived hex, not estimates, unless marked "derived"
(CSS default, never seen live) or "CSS only" (never captured in any dump).

## Tokens to adopt

**Colour**
| Token | Light | Dark |
| --- | --- | --- |
| background.page / surface.default | #ffffff | #131f24 |
| surface.subtle / hover (polar) | #f7f7f7 | #202f36 |
| surface.selected (iguana) | #ddf4ff | #202f36 (equals polar in dark) |
| surface.disabled / border.default (swan) | #e5e5e5 | #37464f |
| border.selected (blue-jay) | #84d8ff | #3f85a7 |
| border.focus (macaw) | #1cb0f6 | #49c0f8 |
| text.primary (eel) | #4b4b4b | #f1f7fb |
| text.body (black-text, default body colour) | #3c3c3c | #f1f7fb |
| text.secondary (wolf) | #777777 | #dce6ec |
| text.tertiary / disabled (hare) | #afafaf | #52656d |
| text.link (macaw) | #1cb0f6 | #49c0f8 |
| accent.primary face/lip (owl/tree-frog) | #58cc02 / #58a700 | #93d333 / #79b933 |
| accent.secondary face/lip (macaw/whale) | #1cb0f6 / #1899d6 | #49c0f8 / #1899d6 |
| accent.danger face/lip (cardinal/fire-ant) | #ff4b4b / #ea2b2b | #ee5555 / #d84848 |
| feedback.correct bg/text (sea-sponge/tree-frog) | #d7ffb8 / #58a700 | #202f36 / #79b933 |
| feedback.incorrect bg/text (walking-fish/fire-ant) | #ffdfe0* / #ea2b2b* | #202f36 / #d84848 |
| gamification.streak active/inactive (fox/swan) | #ff9600 / #e5e5e5 | #ffab33 / #37464f |
| unitColors.locked node face (swan) | #e5e5e5 | #37464f |

`*` = derived (CSS rule, no light "incorrect" capture existed). Unit-colour family
(path nodes, unit banners; identical hex both themes): owl #58cc02, macaw #1cb0f6,
starfish #ff86d0, cardinal #ff4b4b, fox #ff9600, grizzly-lite #dc8f47, beetle #ce82ff,
peacock #00cd9c, dragon #cc348d. Legendary gold (CSS only, never rendered): bee
#ffc800/#ffc700 face, guinea-pig-always-light #cd7900 lip @0.5.

**Type**: family `duolingo-sans` (proprietary, weights 400/700, one italic), fallback
`Nunito`. Body renders at weight 500 from the same upright file.
| Role | Size/line | Weight | Tracking | Case |
| --- | --- | --- | --- | --- |
| Page title / heading large | 32/36, 28/32 | 700 | normal | none |
| Heading medium (modal title) / small (card title) | 24/32, 20/24 | 700 | normal | none |
| Body default / spacious (lesson prose) | 20/28, 20/32 | 500 | normal | none |
| Caption (body copy) / caption bold (eyebrow, label) | 16/24 | 500 / 700 | normal | none |
| Label medium (uppercase micro-label) | 16/16 | 700 | 0.64px | uppercase |
| Nav label (sidebar) / stat counter (streak, gems) | 15/25, 15/20 | 700 | 0.8px / normal | uppercase / none |
| Button default (50px) / large (lesson footer) | 15/18, 17/20.4 | 700 | 0.8px | uppercase |
| Unit header title / lesson challenge header | 22/28, 32/40 | 700 | normal | none |

**Radii, spacing, borders, shadow, duration**
- Radius: 8 (small buttons), 12 (default button/card/tap token), 13 (unit banner), 15
  (popovers), 16 (cards, modals, 50px buttons, most-used), pill 9999px, circle 50%.
- Spacing in real use: 2, 4, 5, 6, 8, 10, 12, 14, 15, 16, 18, 20, 24px; 8 and 16 most common.
- Border width: 1 (thin outline buttons), 2 (default: cards, inputs, dividers), 3
  (avatar ring), 4 (lip reserve, filled buttons), 5 (lip reserve, thin outline).
- Shadow is never blurred: every "shadow" is a solid `0 Npx 0` colour band, the 3D
  lip below. No elevation/blur shadow system to adopt.
- Duration: lip press 100ms linear, hover filter 200ms, entrance 300ms, progress
  fill 400ms, transform/opacity 500ms, celebration loops 1200-1500ms. Easing
  standard `(.42,0,.58,1)`; bounce `(.35,1.8,.35,.83)` for the feedback bar.

**The 3D button lip** (read before drawing any button): face (`::before`/`::after`)
plus a solid, zero-blur box-shadow lip, darker same-hue, on a transparent bottom
border reserving the space. Press = shadow removed + face translated down by the
lip width, 100ms linear.
| Variant | Border reserve | Lip shadow | Depth |
| --- | --- | --- | --- |
| Filled/primary | `0 0 4px 0` transparent | `0 4px 0` accent.lip | 4px |
| Outline/secondary | `2px 2px 4px` transparent | 2px border + `0 2px 0` border colour | 4px |
| Thin "juicy" 48px outline | `1px 1px 5px` | 1px border + `0 3px 0 1px` | 4px |
| Path node | none, radius 50% | `::after` `0 8px 0` black@0.2 over unit colour | 8px |
| Selected choice/tile | 2px border | `0 2px 0` border.selected | 2px visible |

No focus ring exists anywhere in the button system (global `outline:none`); rely on
selected/active colour states instead.

## Components that map onto ours

### App shell + left nav item -> our top bar / left nav
Left sidebar (token/behaviour donor, not a layout donor): 256px wide (88px
icon-rail 700-1159px, hidden below 700px), 2px right border. Nav item 222x52 (48px
icon-only below 1160), radius 12px, icon 32x32 + uppercase label. Default =
transparent border, label text.secondary; hover = surface.hover bg; selected =
surface.selected bg, 2px border.selected, label text.link.
Maps to: our five top-bar destinations + avatar menu. Keep the 8x8+2px-ring
notification dot for Review-due badges.

### Learn path unit header + Guidebook button -> our course-path unit card header
Sticky banner, unit-colour bg ("-always-light", identical in both themes), 2-col
grid, radius 13px (0 mobile), 480x90 (1200 viewport) / 592x90 (1384). Back link
("SECTION 4, UNIT 12", opacity 0.7) above the title (22/28 700). GUIDEBOOK button:
148x54, 2px sides/top + 4px bottom lip, radius 16px, face transparent (banner colour
shows through), lip black@0.2, icon 24x24, label hidden below 1100px.
Maps to: our unit-card header + Guidebook button directly. Keep the transparent-face,
black@0.2-lip treatment rather than a normal secondary button, so it reads as
sitting on top of the coloured banner.

### Path node, every state -> our path node
Button 70x65 (face 57px + 8px lip), face `::after` ellipse radius 50%, icon 42x34.
Zig-zag horizontal offsets from column centre: 0, +-44.884px, +-70px; vertical pitch
76.9px or 85.4px. First node of a unit: 24px top margin; current unit's first node:
67px (room for the START bubble).

| State | Face | Extras |
| --- | --- | --- |
| Locked | unitColors.locked | grey icon, no hover |
| Current | unit colour | 98x93 progress ring (track swan, arc = unit colour); 80x45 START bubble above |
| Completed | unit colour | shine overlay 56x51; check/book/trophy icon swap |
| Hover | unchanged | translateY(1.5px), lip 8px -> 6.5px |
| Active/pressed | unchanged | translateY(8px), lip and side band hidden |
| Legendary | bee gold | CSS only, never captured |
| Unit-test "jump" | next unit's colour | "JUMP HERE?" tooltip instead of START |
Maps to: our path node (mastery dot in a ring, active ring in accent) exactly. Our
mastery buckets are 3-state (mastered/learning/untouched); Duolingo is really
2-state (locked vs coloured) plus a ring for "current". Borrow the ring for
"learning". No literal connector line is drawn between nodes, only the zig-zag
offset implies the path; decide separately whether ours draws an explicit line.

### Streak counter and calendar -> our Streak (Today, top bar)
Top-bar trigger: 68x44, flame icon 23x28, count 15/20 700 in gamification.streak
(active) or swan (inactive). Dropdown panel 388x651, 2px border, 15px radius, header
recolours per state (unextended/extended/frozen/society/milestone). Week calendar
card 344x87, day circle 34x34 radius 18: future/missed = swan, done = fox disc +
white check, today's label = fox.
Maps to: our forgiving streak + 7-day strip on Today. "Leeway remaining" has no
direct equivalent (theirs is paid streak-freeze); the frozen-header pair (light
#ddf4ff/#84d8ff, dark #2b70c9/#ffffff, CSS only) is a usable "at risk" treatment
without the monetisation.

### Daily quest / goal progress card -> our daily-target card
Page card 480x113, bar height 20 radius 10; rail card 368x165, bar height 18 radius
9. Bar: track swan, fill bee (#ffc800/#ffc700), min-width 1.5x height, white@0.2
shine stripe, centred "x / y" label drawn twice (track-colour half + fill-colour
half) so it stays legible across the clip edge. Chest icon opens on completion.
Maps to: our self-set daily target card (no XP). Keep the label-on-both-halves
trick; drop the chest reward art.

### Lesson top progress bar -> our Session focus mode step progress
Track 840x16, radius 8. Fill: full-width layer clipped by `clip-path: inset(0
calc(100% - value) 0 0 round 8px)`, min-width 24px, 400ms transition. Highlight
stripe white@0.2, 3px tall. Fill swaps owl (default) -> fox (correct-answer streak)
-> bee, via inline colour.
Maps to: our thin step-progress bar at the top of Session focus mode, directly.

### Lesson choice tiles (default, hover, selected) -> our question widgets
Word-bank tile: 52px tall (68 furigana), 2px border + 2px lip, radius 12px. Default
snow face/swan border. Hover is a deliberate no-op (filter forced `none`). Active:
translateY(2px), lip removed. Left-in-bank placeholder: face+border swan, label
transparent, no lip.
Choice row: 600x60 (70 furigana), radius 12px, same 2/2/4 border, 30x30
shortcut-number badge. Default snow/swan. Hover: face -> surface.hover. Active:
translateY(2px), border+lip+label -> selected triad. Selected: face iguana,
border+lip blue-jay, text whale. Correct: face sea-sponge, border turtle, text
tree-frog. Incorrect: 1.5s flash to walking-fish/flamingo/fire-ant, then reverts.
Maps to: our lesson choice tiles / MCQ options directly, correct/incorrect recolour
included, straight into our inline verdict.

### Feedback footer (correct/incorrect, explain-my-answer) -> our inline verdict bar
Replaces the lesson footer in place (140px, tinted, no top rule), matching our
inline-verdict decision exactly. 80x80 icon circle (check/cross), title (24/30 700),
solution text (incorrect only), TOO EASY / TOO DIFFICULT / REPORT ghost buttons
(20px icon + label, opacity 0.7 -> 1 on hover/pressed), CONTINUE (150x50, radius 16,
4px lip) recoloured to match state.
| Theme | State | Bar bg | Title/actions | CONTINUE face/lip/label |
| --- | --- | --- | --- | --- |
| Light | correct | #d7ffb8 | #58a700 | #58cc02 / #58a700 / #ffffff |
| Light | incorrect | #ffdfe0* | #ea2b2b* | #ff4b4b / #ea2b2b / #ffffff* |
| Dark | correct | #202f36 | #79b933 | #93d333 / #79b933 / #131f24 |
| Dark | incorrect | #202f36 | #d84848 | #ee5555 / #d84848 / #131f24 |

`*` derived. Entry: slides up from `translateY(100%)` over 200ms, bounce easing.
Maps to: our Correct/Incorrect bar with opt-in "Why" exactly. The TOO EASY/TOO
DIFFICULT/REPORT row is the closest match for "Why": same ghost-button-row
placement under the title, same opacity-hover behaviour. Below 700px the icon
circle is dropped and the bar becomes bottom-anchored text-only, useful for phone.

### Lesson-complete stat cards -> our Session close screen stat tiles
Title "Lesson Complete!" (32/20, coloured bee), row of 163x94 cards (gap 16, radius
16, overflow hidden): coloured outer frame strip, 24px uppercase label strip, 163x70
value box (2px border, icon + a counter that rolls digit-by-digit on entry). Colour
is per stat-kind (bee/owl/macaw/beetle/teal), not per correct/incorrect. Footer:
REVIEW LESSON (outline, left) + CONTINUE (primary owl, right).
Maps to: our session-close screen's four stat numbers (right, mastery moved, review
cards added, target progress), one coloured card per stat. Borrow the counter-roll
and coloured-card-per-metric idea; drop the XP framing.

### Practice hub cards -> our review queue
No dedicated component was captured: `/practice-hub` reuses the generic right-rail
card shell (snow/swan, 2px border, 16px radius) with no practice-hub-specific
anatomy. Nearest real spec is the **Section card** (sections page): two-column card
(516x161 to 516x346), left content + status link, right progress bar or preview,
action button keyed to state (REVIEW / CONTINUE / JUMP TO SECTION N).
Maps to: our review-queue card list. Treat Section card's three-state anatomy
(completed/in-progress/locked) as the donor, since practice hub has no distinct spec.

### Primary and outline 3D buttons, all variants -> our Button component
Full 24-variant table lives in components/core.md; the two we need:
| Variant | Light face/lip/text | Dark face/lip/text | Size |
| --- | --- | --- | --- |
| Primary (green) | #58cc02 / #58a700 / #ffffff | #93d333 / #79b933 / #131f24 | 150x50, r16, lip 4px |
| Secondary/outline | #ffffff face, #e5e5e5 border+lip, #afafaf text | #131f24 face, #37464f border+lip, #52656d text | 150x50, r16, lip 4px |
| Disabled | face swan, text hare, no lip, translated down by the lip width | same | unchanged size |

Hover: solid buttons `brightness(1.1)`; outline `brightness(0.9)`, hover-gated.
Press: translateY by the lip width, shadow removed.
Maps to: our primary (filled) / secondary (outlined) button, one primary per region:
the component we may borrow "for primary actions only". Apply the lip to Primary;
keep Secondary flat or with a shallow 2px lip so it doesn't compete.

### Quit modal -> nearest donor for a session-exit confirm
Centred dialog 384x387, 24px padding, 16px radius, backdrop black@0.4. Art 120x120,
title (24/32 700, 2 lines), KEEP LEARNING (primary macaw, full width, 50px, 4px lip),
END SESSION (ghost text, cardinal, 32px, no lip).
Maps to: no named screen in our route table today; if Session focus mode needs a
leave-confirm, this is the anatomy: one primary "stay" CTA over one ghost "leave"
CTA, not two equal-weight buttons.

## Not in this system

- **Concept workspace's notebook shape**: note+sources, tutor thread with citation
  chips, Save-to-note, prerequisite/dependant mastery dots, neighbourhood graph.
  Guidebook is a fixed phrase list, not a source-linked note; no citation chip exists.
- **Tutor chat itself.** No open-ended chat exists; dialogue challenge is fixed-choice
  roleplay, not freeform conversation with a per-turn Why toggle.
- **Review's four-button rating with the interval shown per button.** No
  spaced-repetition surface exists; "Practice" re-runs lessons, no SM-2 state.
- **Mastery probability p(L) and its observation history.** The crown-progress ring
  is a coarse completion counter, not a graphed probability trajectory.
- **Neighbourhood/full concept graph.** No graph view exists anywhere captured.
- **Library "Explains" panel and text search over transcripts/notes.** No
  media-library surface to compare against.

## Do not copy

- **Hearts**: top-bar trigger/dropdown, heart-lost pulse, hearts-refill upsells.
- **Gems/lingots**: top-bar trigger/dropdown, gem-spend flows.
- **Leagues and leaderboard**: whole page, badges, promotion/demotion rows.
- **XP and combo streaks as score**: XP counters, "5 in a row!" combo interstitial,
  fox/bee progress-bar recolour tied to answer streaks.
- **Friend streaks and social invites**: invite list, friend-streak card, kudos and
  friend-suggestion cards.
- **Streak freeze / streak society** as a monetised mechanic (colour pairs are fine
  to reuse; the paid-freeze feature is not).
- **Every Super/premium upsell surface**: Super promo, Super upsell screens, super
  button variants, ad-blocker card, chess promo, shop rows.
- **Monthly badges and achievement rows**, all badge artwork.
- **Legendary/gold path nodes and unit banners** tied to the crown/XP system.
