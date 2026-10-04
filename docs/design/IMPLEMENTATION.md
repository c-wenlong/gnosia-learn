# Redesign: implementation

[DESIGN.md](DESIGN.md) says what the app becomes and [hifi/](hifi/) draws
it. This document is how it gets built: the phases, the contract phase 0
shipped for every later phase to build on (token names, component props,
the shell), and how to check a page against its hi-fi frame.

## Status

| Phase | Scope | Routes | Status |
| --- | --- | --- | --- |
| 0 | Foundation: tokens, primitives, habit data, the shell, Courses, the screenshot tool | `/courses`, `/` (redirect), `/review` and `/settings` (placeholders) | Done |
| 1a | Today and Settings | `/`, `/settings`, `GET /api/learner/today`, `GET /api/learner/export` | Done |
| 1b | Course path, absorbing the module page; rebuilt on 2026-09-29 as the Coursera-style course home (see [The course home](#the-course-home)) | `/courses/[slug]`, `/courses/[slug]/[module]` (a redirect to the unit until the rebuild, its own page since) | Done |
| 1c | Learn index and Concept workspace, with a concept-aware tutor chat | `/learn`, `/learn/[concept]`, `GET /api/concepts/[slug]`, `conceptSlug` on `POST /api/agent/chat` | Done |
| 1d | Session focus mode with graded probes writing BKT events, and the close screen | `/learn/[concept]/session`, `POST /api/learner/observe`, `POST /api/learner/session/close`, `POST /api/agent/session` | Done |
| 1e | Review | `/review`, `GET /api/review/due`, `POST /api/review/grade` | Done |
| 1f | Library and the asset page: concept links, Mark watched, text search | `/library`, `/library/[id]`, `POST /api/learner/watched` | Done |

Update the row when a phase merges.

## The phases

Phase 0 is one PR. The six phase-1 streams run in parallel after it, except
1d, which starts once 1c has merged because the session hangs off the
concept workspace. The routes, screens and API changes each phase owns are
in DESIGN.md's [Routes and screens](DESIGN.md#routes-and-screens) and
[API changes](DESIGN.md#api-changes) tables.

| Phase | Hi-fi frames | Builds on | Owns (new or rewritten) |
| --- | --- | --- | --- |
| 1a | 01, 12, 13 | habit data (`@/lib/habit`), `TargetBar`, `MasteryDot` | `app/page.tsx` (replaces the redirect), `app/settings/page.tsx` (replaces the placeholder), `GET /api/learner/today`, the `dailyTarget` and `dailyLeeway` validators in `api/learner/preference/route.ts`, a `StreakDay` component |
| 1b | 03 | `MasteryDot`, `bucketOf`, `Card`, `Chip` | `app/courses/[slug]/page.tsx`, the module page folding into it, `PathNode` and the unit header |
| 1c | 04, 09 | `Panel`, `MasteryDot`, `Chip`, `SearchField` | `app/learn/page.tsx`, `app/learn/[concept]/page.tsx`, `GET /api/concepts/[slug]`, the message and citation components |
| 1d | 05, 06, 07, 15 | `data-layout="focus"`, `StatTile`, `ProgressBar` | `app/learn/[concept]/session/page.tsx`, the choice row and feedback footer, `POST /api/learner/observe` |
| 1e | 08, 14 | `data-layout="focus"` | `app/review/page.tsx` (replaces the placeholder), the review API, the rating row |
| 1f | 10, 11 | `Card`, `Chip`, `Placeholder`, `SearchField` | `app/library/page.tsx`, `app/library/[id]/page.tsx`, the search endpoint, the `watched` event |

Two phases touching one file is a merge conflict waiting to happen, so the
split above is by route. The shell (`AppShell`, `components/shell/`) and the
primitives (`components/ui/`) belong to phase 0: a phase that needs one of
them changed makes the smallest change it can, says so in its PR, and does
not restyle a primitive for its own page.

## Tokens

Declared in [apps/web/src/app/globals.css](../../apps/web/src/app/globals.css),
light on `:root` and dark on `.dark` (the cookie-driven class on `<html>`).
The values and where each came from are the token table in DESIGN.md and
`TOKENS` in [kit/hifi.py](kit/hifi.py), which record the hi-fi frames as
drawn. Values the app has since moved for contrast, and the tokens the kit
never had, are measured in [BRAND.md](BRAND.md#contrast-checked).

**Four palettes.** `:root` is Classic light, `.dark` Classic dark, `.gnosia`
the brand's light theme and `.gnosia.dark` the brand's dark one, each
selected by the theme classes on `<html>`. A component never branches on the
class or writes a `.gnosia` selector for a colour: it reads tokens, and the
classes decide what they resolve to. `.gnosia` redefines only the tokens that
differ from `:root`; `.gnosia.dark` declares every token `.dark` or `.gnosia`
sets, so it never depends on which of the two comes later. Their values, the
reason for each and the contrast table are in
[BRAND.md](BRAND.md#the-gnosia-theme-inside-the-app).

| Group | Names |
| --- | --- |
| Grounds | `--page`, `--surface`, `--surface2`, `--tint` |
| Lines | `--border` (2px card and input borders), `--hair` (1px hairlines), `--track` (the empty part of a bar or meter: the border's value in the light palettes, black in the dark ones, where every fill needs 3:1 on it; draw it with `TRACK` from `classes.ts`, which adds the 1px `--border` edge that shows an empty bar on a dark page) |
| Text | `--text`, `--text2`, `--text3` |
| Accent | `--accent` (fills), `--accent-text` (links and ghost buttons) |
| Correct | `--ok` (fill), `--ok-lip`, `--ok-text`, `--ok-tint` |
| Not quite | `--warn` (fill), `--warn-lip`, `--warn-text`, `--warn-tint` |
| Error | `--danger` (a text colour) |
| Habit | `--streak` (the fill: discs, rings, the dot, the big number), `--streak-text` (the streak as small text, at 4.5:1 on the card) |
| Primary button | `--btn-face`, `--btn-lip`, `--btn-text` |
| Mastery | `--m-hi` (mastered), `--m-mid` (learning), `--m-lo` (untouched), `--lip-shade` (under an untouched path node) |
| Named kit literals | `--accent-lip`, `--ok-on`, `--warn-on` (labels on the green and yellow faces), `--m-hi-lip`, `--m-mid-lip` (path-node lips), `--violet` (the review-cards stat tile), `--on-tone` (small text on a saturated fill, black in every palette), `--streak-on`, `--m-hi-on` (the check on a done streak day and the mark on a mastered path node: white in the light palettes, the page colour in the dark ones) |

**Every token is also a Tailwind colour of the same name**, so write
`bg-surface2 text-text2 border-border`, not `bg-[var(--surface2)]`. The
utilities point at the variable, so they follow the theme class. Never write
a hex value in a component.

**Type.** `font-sans` is Figtree (next/font, self-hosted), the body default
at 15px/1.5. `font-display` is Georgia from the system: page titles at
28/700, concept titles at 26 to 32/700, the wordmark at 20/700. Card titles
16/700, eyebrows and small labels 12/600 in `--text2` (`LABEL` in
`components/ui/classes.ts`), button labels 15/600, dense rows 14, lesson
prose 17. `font-mono` is still Geist Mono, for code.

**Sentence case, everywhere.** No `uppercase`, no tracked-out label, no
title, badge, table head or button typed in capitals; an acronym stays one.
Until 2026-09-29 the eyebrows were 11/700 uppercase tracked and the stat
tile strip was uppercase; the owner retired both, with every label that
repeats what the layout, a heading or an icon already says. The rule and its
reasons are in [DESIGN.md](DESIGN.md#sentence-case-2026-09-29) and
AGENTS.md; `apps/web/src/lib/sentence-case.test.ts` enforces the styling.

**Radius.** 20 cards, 16 panels and unit headers, 12 choice rows and
placeholders, 8 inputs, a pill for buttons, chips, pills and search. No
shadows on any surface: the only box-shadow in the kit is the 3D button's lip.

**The old names are aliases.** `--background`, `--foreground`, `--muted`,
`--muted-strong`, `--surface-hover`, `--sidebar-bg`, `--header-bg`,
`--chip-bg`, `--nav-active-bg`, `--accent-strong`, `--surface-raised`,
`--warn-bg`, `--warn-border`, `--danger-bg`, `--danger-border` still resolve,
to the nearest new token, so the pages not yet redesigned keep rendering.
Six names are both old and new (`--border`, `--surface`, `--accent`, `--ok`,
`--warn`, `--danger`) and the new meaning won; the old uses of `--warn` and
`--ok` as a text colour were renamed to `--warn-text` and `--ok-text`. A
redesigned page uses only the new names. When the last old page goes,
delete the alias block.

## Components

Under [apps/web/src/components/ui/](../../apps/web/src/components/ui/), one
file each, all safe in a server component (no `"use client"`, no state or
effects; `Button` calls `useId`, which React allows there), except
`FilterMenu`, `Composer` and `MentionComposer`, which hold state and take an
`onChange`, so a client component renders them. `MentionComposer` is not in the
`@/components/ui` barrel: it carries Lexical, so it is imported from its file,
lazily, by the one page that uses it. The
class strings live in the React-free [classes.ts](../../apps/web/src/components/ui/classes.ts),
so a client component, a server component or a test can compose them.
Import from `@/components/ui` or from the file.

| Component | Props | Kit |
| --- | --- | --- |
| `Button` | `variant?: "primary" \| "secondary" \| "ghost" \| "ok" \| "warn" \| "accent" \| "brand"` (default primary), `size?: "md" \| "sm"` (44px or 36px), `block?: boolean`, `href?: string` (renders a `next/link`, plus `prefetch?`), `disabledReason?: string` (with `disabled`: why, as 12px text beside the button tied by `aria-describedby`, since a disabled button takes no focus and its `title` reaches nobody; omit it when the reason is already on screen), `className?`, and every `<button>` or `<a>` attribute. Default `type="button"`. A link has no disabled state | `Btn` |
| `Card` | `title?: ReactNode`, `action?: ReactNode`, `tight?: boolean` (padding 14), `as?: "section" \| "div" \| "article" \| "li"`, `className?`, `id?`, `aria-label?` | `Card` |
| `CardAction` | `href`, `children`: the "See all" link for a card's `action` slot | `Card` action |
| `Panel` | `title?`, `actions?` (a 48px header with a hairline under it), `as?: "section" \| "div" \| "aside"`, `className?`, `headerClassName?` (hide the header where a tab row already names the panel), `titleClassName?` (hide only the title, where the header's actions must still show), `bodyClassName?` | `Panel` |
| `Chip` | `active?: boolean`, `size?: "md" \| "sm"` (34px or 28px), `href?` (a link), `onClick?` (a toggle with `aria-pressed`), `title?`, `className?`. Neither `href` nor `onClick` renders a static label | `Chip` |
| `FilterMenu` | `label: string` ("Type"), `options: FilterOption[]` (`value`, `label`, `short?` for the trigger, `count?` at the right, `detail?` as a muted second line, `section?` heading), `value`, `defaultValue` (the "All" value; any other fills the trigger), `onChange(value)`, `busy?` (dims the trigger while a navigation runs), `className?`. A `Chip`-styled trigger reading "Label: Value" over an ARIA listbox: arrows, Home, End, typeahead, Enter or Space picks, Escape, Tab or a click outside closes. The first option is "All" and is how a filter is cleared. Single-select. A client component, the kit's only one; its model is the React-free `filter-menu.ts` | none (see Deviations) |
| `Composer` | `value`, `onChange(value)`, `onSubmit(value)`, `label` (screen-reader name), `placeholder?`, `maxLength?`, `disabled?` (the field and Send), `sendDisabled?` (Send only, as while a reply arrives), `disabledReason?` (12px under the field, tied by `aria-describedby`), `autoFocus?`, `inputRef?`, `onModEnter?` (Cmd/Ctrl+Enter; sends when absent), `maxRows?` (default 6), `sendLabel?`, `layout?` (`row`, the default, or `box`), `toolbar?` and `minRows?` (the box's). The chat input the concept tutor and the studio's planner share: a 52px textarea at radius 16 growing to six lines, Enter sends, Shift+Enter is a new line, and an IME's Enter is left alone. `layout="box"` draws it in `ComposerBox` instead: the field three lines tall over a row inside the frame holding `toolbar` and a round Send, radius 20 (D88 of docs/STUDIO-CHAT-FIRST.md). A client component; its key and height rules are the React-free `composer-keys.ts` | the tutor's input; Gauth's Atlas prompt box for the box |
| `MentionComposer` | `Composer`'s props with three changes: `value` and `onChange(value)` / `onSubmit(value)` take `{ text, mentions }` (each chip written into `text` as `@<kind>`, `mentions` its positions), `mentions` is the @ menu's entries (`{ id, name, description, icon?, aliases?, disabledReason? }`), and `handleRef` exposes `insertMention(kind)`, `focus()` and `keepCaretThrough(next, edit)` (the next value the parent sets keeps the caret where it was, moved by `edit`); plus `mentionHint?`, the menu's foot line. No `maxLength`, `autoFocus` or `inputRef`. The studio's chat input (docs/STUDIO-MENTIONS.md, D56): `Composer`'s frame, keys and six-line growth on a Lexical plain-text field whose only rich content is an inline chip per tag. `@` at the start or after a space, or the plus at the field's left, opens the menu above the field; arrows, Enter or Tab pick, Esc closes the menu and not the dialog, a pick replaces the `@query` in place, one chip per kind, Backspace takes a chip whole, undo puts the typed query back, paste is plain text, an IME's Enter is left alone. A polite live region says what `aria-activedescendant` alone would not. A value the parent sets that differs from the last one reported rebuilds the field. `layout="box"`, `toolbar` and `minRows` as `Composer`'s, with the plus first in the box's row and the menu opening under the box. Its rules are the React-free `mention-text.ts` | ChatGPT's composer; Gauth's Atlas prompt box for the box |
| `MentionChip` | `name`, `icon?: GlyphName`, `waiting?` (a quiet "waiting" while the tag's brief is owed), `className?`. A tag's chip, 14/600 `--accent-text` on `--tint` at radius 6, on the text's baseline, with a visually hidden " tag"; drawn in the field and in the sent message | none |
| `Glyph` | `name: GlyphName`, `size?` (default 20), `className?`. The kit's 20px outline marks (`diagram`, `video`, `add`, the course page's own), moved out of `course-home/icons.tsx`, which re-exports them | the course page's marks |
| `Pill` | Removed 2026-10-04 with the streak and target pills, its last users (H1 of [the Home proposal](../proposals/home-page.md)) | `Pill` |
| `Eyebrow` | `as?: "p" \| "span" \| "h2" \| "h3" \| "h4" \| "div"`, `className?`. 12/600 sentence case in `--text2` since 2026-09-29; only for a label the heading under it does not already say | `Eyebrow` |
| `MasteryDot` | `bucket: MasteryBucket`, `size?: number` (px, default 14), `showLabel?: boolean`, `pL?: number \| null` (printed with the label), `className?` | `Mastery`, `MasteryLabel` |
| `ProgressBar` | `percent?: number` (0 to 100) or `progress?: ProgressCounts`, `showLabel?` (defaults on only with `progress`), `size?: "md" \| "sm"` (8px or 6px), `tone?: "accent" \| "ok" \| "hi" \| "mid"` (`hi` and `mid` are the mastered and learning colours), `label?` (accessible name), `className?`. Full width of its container: size it with a wrapper, not `className` (see Gotchas) | `Bar` |
| `TargetBar` | Removed 2026-10-04 with Today's target card, its only user | `TargetBar` |
| `StreakDay` | Removed 2026-09-29 with Today's Streak card, its only user (see the Streak card rows under Deviations). The habit data still carries `streak.week` | `StreakDay` |
| `Input` | `pill?: boolean`, `className?`, every `<input>` attribute | `Input` |
| `SearchField` | `label: string` (screen-reader label, required), `name?` (default `q`), `className?` (the wrapper, e.g. a width), `inputClassName?`, every `<input>` attribute but `type` | `Input` with `pill` |
| `StatTile` | `value: ReactNode`, `label: string`, `tone: "ok" \| "accent" \| "violet" \| "streak"`, `className?` | `StatTile` |
| `Placeholder` | `label?: string` (lines split on `\|`), `height?: number \| string` (default 120), `className?`, `children?` | `Placeholder` |
| `Divider` | `vertical?: boolean`, `className?` | `HR` |
| `RatingButton` | `label`, `interval` (desktop), `short?` (phone, "4d"), `shortcut?` (the key, for `aria-keyshortcuts`), `suggested?` (tint and accent border: what Continue will record), `disabled?`, `onClick?`, `className?`. Four in a `flex` row make the rating row | `Rating` |
| `ChoiceRow` | `state?: "idle" \| "selected" \| "correct" \| "wrong"`, `shortcut?` (the number badge), `disabled?`, `onClick?`, `children` (the option text). Graded rows carry the "correct answer" and "your answer" tags | `Option` |
| `FeedbackBar` | `ok: boolean` (green, else yellow "not quite"), `title`, `detail?`, `note?`, `actions?` (the caller's ghost Why and coloured Continue). A `role="status"` live region; the actions drop under the text on a phone | `Feedback` |

`brand` is the Gnosia pill for the public pages (teal face, navy lip, cream label; navy label in dark), documented in [BRAND.md](BRAND.md); the app's own pages keep `primary`.

The pure helpers beside them:

| Module | Exports |
| --- | --- |
| [`@/components/ui/filter-menu`](../../apps/web/src/components/ui/filter-menu.ts) | `type FilterOption`, `sectionsOf`, `triggerText`, `nextIndexForKey`, `typeaheadIndex`, `popoverShift`: the option model and keyboard rules behind `FilterMenu` |
| [`@/components/ui/classes`](../../apps/web/src/components/ui/classes.ts) | `cx(...)`, `buttonClasses({ variant, size, block, className })`, `chipClasses({ active, size, interactive, className })`, `inputClasses({ pill, className })`, `cardClasses({ tight, className })` |
| [`@/lib/mastery-bucket`](../../apps/web/src/lib/mastery-bucket.ts) | `type MasteryBucket = "mastered" \| "learning" \| "untouched"`, `bucketOf({ mastery, observations? })`, `MASTERY_BUCKETS`, `MASTERY_BUCKET_LABEL`, `masteryCaption(bucket, pL?)` |
| [`@/lib/nav`](../../apps/web/src/lib/nav.ts) | `DESTINATIONS`, `type DestinationKey`, `activeDestination(pathname)` |
| [`@/lib/course-summary`](../../apps/web/src/lib/course-summary.ts) | `toCourseSummary(course, tags, coverSha256?)`, `coverUrl(slug, sha256)` (the cover route, versioned by the image's hash), `courseStatus(summary, completed, standing?)`, `continueLearning(...)` (the courses in progress, last opened first), `filterCourses(summaries, query, { tag })`, `coverLine(...)`, `courseCounts(...)`, `usedTags(...)`, `tagFilterOptions(tags, summaries)` (the Tag menu's options with their counts) |
| [`@/lib/days`](../../apps/web/src/lib/days.ts) | `dayKey`, `type LogEvent`: what outlived the habit layer's `habit-core` |
| [`@/lib/preferences`](../../apps/web/src/lib/preferences.ts) | the Settings vocabulary (`TUTOR_STYLES`, `MOTION_MODES`), and the validators the preference route runs (`validateTutorStyle`, `validateMotionMode`) |
| [`@/lib/ask-core`](../../apps/web/src/lib/ask-core.ts) | the Ask box's search: `rankAsk`, `normalize`, `askTutorHref`, `type AskEntry` |
| [`@/lib/home-core`](../../apps/web/src/lib/home-core.ts) | the Home model (`HomeModel`) and its pure parts: `homeThreads`, `conceptTouches`, `nextFromHere`, `nearThreads`, `recallPicks`, `recallHref`, `coursesInProgress`, `pastDayLabel`, `lastSeenLabel`, `clock` |

Maths is typeset by KaTeX, through two files. [`@/lib/math`](../../apps/web/src/lib/math.ts)
is React-free: `renderMath(source, display)` and `splitMath(text)`, which finds
`$...$` and `$$...$$` with the same rules the note parser uses (`mathSpanAt` in
`components/markdown.ts`). [`@/components/Math`](../../apps/web/src/components/Math.tsx)
has `MathText({ text, className? })` for any plain string that may hold maths
(a question, a choice, a summary, a chat bubble), and `InlineMath` and
`DisplayMath` for one expression. No hooks, so they work in server and client
components. Maths takes `currentColor`, so it follows the text in every palette;
its size is the `.katex` rule in `globals.css`.

`bucketOf` is the only way a page turns a concept into a colour: mastered
stays mastered, no observations is untouched, everything else is learning.
Pass `observations`; a missing count reads as zero.

`PathNode` and `UnitHeader` shipped with 1b and were deleted with the course path on 2026-09-29: the course home draws Coursera's item rows instead, from its own `components/course-home/`, and nothing else used either.

Not built yet, because one phase each needs them and none of the others do:
the tutor message and the citation pill (1c). Build them in
`components/ui/` from the kit function of the same name, with the same rules.
The choice row and the feedback footer are built (1e needed them for check
cards, as `ChoiceRow` and `FeedbackBar`), so 1d uses those rather than drawing
its own. The review page carries a small local `CitePill` in
`components/review/` until 1c's citation pill exists.

## The shell

[AppShell](../../apps/web/src/components/AppShell.tsx) is a server
component, drawn by the `(app)` route group's layout
([app/(app)/layout.tsx](../../apps/web/src/app/(app)/layout.tsx)), which
checks the session and reads the learner snapshot first. The `(site)` group
(the landing page and `/sign-in`) has no shell and no database read; the root
layout holds only the document, the fonts and the theme class. Its client parts are in
[components/shell/](../../apps/web/src/components/shell/): `ShellFrame`,
`AppSidebar`, `ChatHistory`, `AccountMenu`, `PhoneHeader`, `StoreBanner`,
`NavIcon`.

The app has one sidebar and no top bar (2026-10-04: the owner asked for a
chat app's layout, with the studio as the main page and the learning pages
folded into the studio's sidebar). Before that it had a 64px top bar with the
five destinations and Studio, a phone tab bar, and the studio drew its own
conversation list beside its pages.

- **Sidebar**, from 768px up, 260px on `--surface` with a hairline at its
  right, sticky beside a page that scrolls the window: the wordmark and the
  fold at the top; New chat (`/studio`, the studio's home and composer, only
  when `STUDIO_ENABLED` is set); the four destinations (`DESTINATIONS` in
  `lib/nav.ts`: Home, Courses, Learn, Library; Review left the list on
  2026-10-04, see DESIGN.md "Information architecture"; the current one on
  `--surface2`); the studio's conversations under "Chats", newest first by
  day; and the account row at the foot, showing the learner's name
  (`learner.display_name`, set under Settings, Profile, through
  `/api/learner/name`; "Account" until there is one), whose menu opens
  upwards (theme, Settings, Sign out). The fold narrows it to a 60px rail of icons and is
  the `gnosia-sidebar` cookie (`lib/sidebar-cookie.ts`), read by the layout so
  the first paint has the right width. Resting the mouse on the rail slides
  the full sidebar out over the page; the fold button then keeps it open.
- **Chats.** On `/studio` the page publishes its list, the open
  conversation, New chat and its in-browser navigation to the sidebar
  (`usePublishStudioChats` in `components/shell/shell-context.ts`, called by
  `PanelHost`), so a row opens its conversation without a server render.
  Anywhere else the sidebar reads the list itself through
  `/studio/api/drafts`, and a row is a link to `/studio?draft=`.
- **Phone**, below 768px: a 56px header with the sidebar's button, the
  wordmark and New chat; the sidebar is a drawer over the page, closed by a
  pick, the backdrop, Escape or a navigation. There is no tab bar.
- **Store banner** above the page when the database is unreachable or a
  write failed, as before.

**Six modes, two axes, two classes.** The theme is a palette (Classic or
Gnosia) and an appearance (Light, Dark or System), stored as one mode so the
cookie, the `theme` preference and the import each keep a single string:
`light`, `dark`, `system`, `gnosia`, `gnosia-dark`, `gnosia-system`
(`THEME_MODES` in `packages/schema/src/shared.ts`). The first four predate the
palette axis and keep their meaning, so a stored `gnosia` is Gnosia light and
a stored `system` is Classic. `paletteOf`, `appearanceOf` and `themeModeFor`
in the same file convert between a mode and its two halves. `<html>` carries
`gnosia` for the brand palette and `dark` for a dark appearance, both for
Gnosia dark; Classic light is the absence of both. Both system modes are
rendered light by the server (with `gnosia` already on for the brand one) and
`data-theme` naming the mode, and an inline script at the top of `<body>` adds
`dark` before paint when the device prefers it; `LearnerProvider` then follows
`prefers-color-scheme` changes while the page is open. The control is
`ThemeSwitch` (`apps/web/src/components/ThemeSwitch.tsx`): two segmented radio
groups, Palette and Appearance, stacked under one label, used small in the
account menu and full size on Settings. Changing one axis keeps the other. A
component never branches on the class: it reads tokens, and the palettes are
in `globals.css` (`:root`, `.dark`, `.gnosia`, `.gnosia.dark`).

**A page picks its layout with `data-layout` on its root element.** The
shell reads it with `has-*`, so no prop or context crosses the server and
client boundary.

| `data-layout` | Width | Chrome | For |
| --- | --- | --- | --- |
| `app` | up to 1392px, 24px gutters (16 on a phone), 24px top | full | every redesigned page |
| `focus` | the whole width, no padding | no sidebar from 768px up; the phone keeps its header | Session and Review (hi-fi 05 to 08, 14, 15) |
| `workspace` | as `app`; from 900px up the shell is fixed to the viewport and the page gets a `flex-1 min-h-0` region | full | the concept workspace, whose three panels scroll inside themselves |
| none | the old 48rem reading measure | full | pages not yet redesigned |
| `wide` | 72rem | full | the old library pages |
| `full` | the whole region, no padding, the shell fixed to the viewport | full | the studio's home, conversations and canvas |

A redesigned page starts `<div data-layout="app">`, puts its title in
`font-display text-[28px] font-bold`, and builds from `components/ui`.
[app/courses/page.tsx](../../apps/web/src/app/courses/page.tsx) is the
reference. Once every page has moved, `app` becomes the default and the old
values go.

## Motion

The owner's call on 2026-10-04, after the folded sidebar popped open on a
hover: every change that opens, closes, expands, collapses, appears or moves
is animated, and nothing moves for a reader who asked for less.

| Rule | How |
| --- | --- |
| One easing | `ease-soft`, `cubic-bezier(0.2, 0, 0, 1)` (`--ease-soft` in `globals.css`), the curve `ui/Collapse` already used. `ease-out` is fine for a plain fade |
| Durations | 100ms for colour on hover; 150ms for a fade, a menu or a popover; 200ms for a panel, a width or a dialog; 300ms for a fold (`Collapse`) or a drawer |
| Height | `ui/Collapse` (grid rows 0fr to 1fr, `inert` while shut). Never a bare `{open && …}` for something with height |
| Something that mounts | `animate-enter` (fade and a 6px rise: a message, a step, a page), `animate-pop-in` (a menu, a popover), `animate-fade-in` (a swap in place). They fill `backwards`, so no transform is left behind |
| Something that also leaves | Keep it mounted: `invisible opacity-0` and `inert` when closed. Transition `visibility` on the way out only (`transition-[opacity,translate,scale,visibility]` while closed, the same less `visibility` while open): out, it waits for the fade, so nothing takes focus once gone; in, it would still be hidden on the first frame, and focus moved there on opening would not land (measured on the phone drawer) |
| Tailwind 4 | `translate-*` and `scale-*` set the `translate` and `scale` properties, so transition those by name: `transition-[transform]` does nothing for them |
| Reduced motion | `motion-reduce:transition-none` or `motion-reduce:animate-none` beside each, and a global rule at the end of `globals.css` that finishes every transition and animation at once under `prefers-reduced-motion: reduce`, for anything that forgot or whose responsive variant outranks it |
| Checking it | A screenshot of the end state does not show motion. Sample the element's size or opacity every 25ms while it changes (the sidebar's PR did, in Playwright), or look at the computed `transition` |

The sidebar (`components/shell/AppSidebar.tsx`) is the worked example: one
element whose width animates, icons at a fixed place so only the labels fade
(`components/shell/motion.ts`), the account menu kept mounted and faded, the
phone drawer slid in by `translate`.

## Habit data

Removed 2026-10-04 (H1 of [the Home proposal](../proposals/home-page.md)):
the streak, the daily target, `@/lib/habit`, the top bar's pills and
Settings' Habit card. The `dailyTarget` and `dailyLeeway` preference rows are
left in the database, unread, and the preference route no longer accepts
them. What outlived it is the day key (`@/lib/days`) and the time zone
(`appTimeZone()` in `@/lib/time-zone`), which still reads `HABIT_TIME_ZONE`
so a deployment that sets it needs no change. Before then this section held
the `Habit` shape and the streak's rules; they are in the history of this
file.

## The screenshot tool

[kit/shots.mjs](kit/shots.mjs) screenshots routes of a running build at
1440x900 and 390x844, light and dark (the `self-learn-theme` cookie), full
page by default.

```bash
npm run build
cd apps/web && STUDIO_ENABLED=1 node ../../node_modules/next/dist/bin/next start -p 3121 &
node docs/design/kit/shots.mjs http://localhost:3121 /tmp/shots /courses /review
node docs/design/kit/svg2png.mjs /tmp/hifi docs/design/hifi/02-courses-*.svg   # the frames to compare with
```

Output is `<route>-<desktop|phone>-<theme>.png`. `SHOTS_VIEWPORTS`,
`SHOTS_THEMES` and `SHOTS_VIEWPORT_ONLY=1` narrow a run; `SHOTS_THEMES` takes
any of the six theme modes (`SHOTS_THEMES=gnosia-dark`), and the browser
prefers dark for `dark` and `gnosia-dark`. `SHOTS_COLOR_SCHEME=dark` forces
it, to see a system mode resolve dark; a system mode's file name ends in the
scheme it resolved under (`-gnosia-system-dark`), so the two runs do not
overwrite each other. It borrows
playwright-core from the tldrawkc submodule; in a checkout where that is not
installed (a fresh worktree), point `PLAYWRIGHT_CORE` at another checkout's
`tools/tldrawkc/node_modules/playwright-core/index.mjs`. It exits 1 if any
route answered 400 or more. Read every picture beside its hi-fi frame before
calling a page done; a build that passes proves nothing about how it looks.

## Phase 1c: Learn index, workspace, concept tutor

What 1c shipped, and the contract 1d (session focus mode) builds on.

### Modules

| Module | What it is |
| --- | --- |
| [`@/lib/concept-note-core`](../../apps/web/src/lib/concept-note-core.ts) | Pure. `parseConceptNote(source)` gives the frontmatter fields (`title`, `summary`, `requires`, `assumes`, `tags`, `topics`, `sources`) and the ```` ```check ```` blocks as `ConceptCheck { id, question, answer, why, source }`, the shape `review due --json` prints. A port of the CLI's parser (the web app never imports `scripts/`), pinned by its test |
| [`@/lib/concept-note`](../../apps/web/src/lib/concept-note.ts) | Server. `readConceptNote(slug)` reads the note from `concept.body` through the content seam, the database only since phase 2 of CONTENT-MIGRATION.md. Never throws; a failure is `{ ok: false, code: "no-note" \| "too-large" \| "not-flipped" \| "unreachable" }`. Phase 1e reads checks through it too |
| [`@/lib/concept-workspace-core`](../../apps/web/src/lib/concept-workspace-core.ts) | Pure. `buildConceptWorkspace(...)` assembles `ConceptWorkspace`; `toConceptPromptInput(workspace)` is the tutor's view of it; `isConceptSlug` guards every entry point |
| [`@/lib/concept-workspace`](../../apps/web/src/lib/concept-workspace.ts) | Server. `readConceptWorkspace(slug)` (and `loadConceptWorkspace` for pages) does the reads: the knowledge base, the note, the event log, the review card, the asset links. The page, `GET /api/concepts/[slug]` and the tutor all go through it |
| [`@/lib/concept-graph`](../../apps/web/src/lib/concept-graph.ts) | Pure. `neighbourhood`, `courseScope` (course, or the note's folder when it is in no course, with the transitive reduction applied), `dependantsOf`, `backlinksOf`, `defaultSelection`, `layoutGraph` |
| [`ConceptGraph`](../../apps/web/src/components/ConceptGraph.tsx) | The graph drawing, rewritten: mastery-bucket dots, prerequisites above, the selected concept ringed, its own edges in the accent. Nodes are links (`hrefFor`, server) or buttons (`onSelect`, client) |
| [`Cite`](../../apps/web/src/components/ui/Cite.tsx), [`TutorMessage`, `UserMessage`](../../apps/web/src/components/ui/Message.tsx) | The kit's citation chip and chat turns, server-safe, imported from their files. `TutorMessage`'s `label` ("Tutor", "Planner") names the turn for a screen reader only; the visible eyebrow over each reply went on 2026-09-29, since the turn's shape already says who is speaking |

**Backlinks** are the concepts whose `requires` or `assumes` names this one;
**dependants** ("Leads to") are the `requires` half only. **Check status** in
the Studio card comes from the latest observation whose question text equals
the check's question (whitespace and case folded): an observation records its
question as text, not a check id, so a reworded check reads as untried.

### `GET /api/concepts/[slug]`

200 with a `ConceptWorkspace` (every field is documented on the type):
`slug`, `title`, `summary`, `domain`, `bucket`, `pL`, `mastery`,
`observations`, `correct`, `lastSeen`, `place` (course, module and topic, or
null), `note` (`{ available: true, path, source }` or
`{ available: false, code, message }`), `sources`, `tags`, `requires`,
`assumes`, `dependants`, `backlinks` (each `{ slug, title, bucket, pL }`),
`checks` (`ConceptCheck` plus `status: "passed" | "missed" | "untried"`),
`history` (every direct observation outside a voided session, oldest first:
`{ at, correct, pLBefore, pLAfter, question, source }`), `review`
(`{ due, intervalDays, ease, repetitions, lapses, leech }` or null), `assets`
(`AssetRef[]`, the concept's own note left out), `graph` (the neighbourhood
as `{ nodes, edges }`), `frontier`. 400 `BAD_CONCEPT_SLUG`, 404
`CONCEPT_NOT_FOUND`, 503 `CONCEPT_UNAVAILABLE`. `Cache-Control: no-store`.

### The concept tutor API

`POST /api/agent/chat`, same route, same guards (same origin, the payload
bounds, 20 calls a minute per client), with `conceptSlug` in the body. When
`conceptSlug` is present the topic fields are ignored and not required.

```ts
// request
{
  conceptSlug: string;          // a concept id: /^[a-z0-9][a-z0-9-]{0,99}$/
  messages: { role: "user" | "assistant"; content: string }[];  // oldest first; a "system" entry is dropped
  learnerNote?: string;         // optional, appended to the system prompt, counted in the payload bound
}

// 200
{
  message: { role: "assistant"; content: string };  // may contain [n] citation markers
  model: string; provider: string; providerLabel: string; fallbackAttempts: number;
  concept: { slug: string; title: string };
  sources: { n: number; label: string; href: string | null }[];  // [1] is always the note ("Your note: <title>", href /learn/<slug>); frontmatter sources follow from [2]
  check: { question: string } | null;  // the reply asked a check: its `CHECK:` line, taken off `message.content`
}
```

A reply that asks a check (rule 6 of the concept prompt) ends with a
`CHECK: <question>` line, which the route removes and returns as `check`
(docs/proposals/recall-in-chat.md, phase 1). The learner's next message is
its answer: the page calls `POST /api/agent/judge` with `{ conceptSlug,
question, answer }` beside the chat call, which answers `{ verdict: {
correct, feedback } }` or `UNSTRUCTURED_REPLY` and writes nothing, and the
verdict row writes `POST /api/learner/observe` only on the learner's tap.

Errors: 400 `BAD_REQUEST` (slug or messages malformed, checked before
anything is read), 403 `ORIGIN_MISMATCH`, 413 and 429 from the guards, 404
`CONCEPT_NOT_FOUND`, 503 `CONCEPT_UNAVAILABLE` (database down), 503
`MISSING_API_KEY`, 502 `ALL_PROVIDERS_FAILED`.

The system prompt is built on the server by `buildConceptSessionContext` in
`lib/agent/prompt.ts` from `toConceptPromptInput(workspace)`: title,
summary, where it sits, requires, assumes and dependants with their mastery
labels, the learner's p(L), counts, last seen and next review, the five most
recent answers, the note body (frontmatter stripped, clipped at 8000
characters), the numbered sources with an instruction to cite as `[n]`, and
one line for the learner's `tutorStyle` (`TUTOR_STYLE_INSTRUCTIONS`, read on
the server by `readTutorStyle`). Nothing about the concept is taken from the
browser. `conceptCitationSources`
and `conceptSuggestedQuestions` are exported so a page renders the same
numbering and chips before the first turn. Citing is best effort: the page
turns a `[n]` that is in `sources` into a `Cite` chip (`citedNumbers` in
`lib/tutor-thread.ts`) and leaves any other number as text.

The chat writes no evidence. Grading a probe and calling `learn observe` is
1d's (`POST /api/learner/observe`), per DESIGN.md decision 12.

**The thread lives in `sessionStorage`** under `self-learn:tutor:<slug>`,
per tab, mirrored in memory when storage is refused, and cleared by "Start a
new thread". The browser sends at most the last 30 turns and 20000
characters (`trimForRequest`). Moving it to the database is future work.

## Phase 1d: the session and the observe path

What 1d shipped. A graded answer is evidence in an append-only log, so the
write path is the part to read first.

### Modules

| Module | What it is |
| --- | --- |
| [`state/observe.ts`](../../services/catalog/src/state/observe.ts) | `recordObservation(db, input)`: `learn observe` moved out of the CLI. The `observation` event (`correct`, `pLBefore`, `pLAfter`, `grade`, `scheduled`, `source`, `opportunity`, `question`, `answer`, `session`, and `chosen` and `requestId` when given), then the mastery row (a correct answer spread to the prerequisites with `propagateCorrect`), then the review card, all under the learner lock in one transaction. The CLI's `observe` now calls it; its `--json` shape is unchanged and still pinned. `openTutorSession` (the row and one `session-start`, idempotent) and `closeTutorSession` (one `session-close` and the row to `closed`, idempotent) are the database half of `learn session start` and `close` |
| `readConceptGraph` in [`state/knowledge-base.ts`](../../services/catalog/src/state/knowledge-base.ts) | The graph `propagateCorrect` walks, built from the catalog's `concept_prerequisite` rows, the same edges every page's frontier uses. The CLI still builds its graph from the notes on disk; the two agree except between editing a note's `requires:` and the next `learn index` |
| [`@/lib/session-core`](../../apps/web/src/lib/session-core.ts) | Pure. The step plan (`buildSessionPlan`), a check block as a question (`noteQuestion`), the wrong options (`distractorPool`, `wrongOptionsFor`), the teaching prose (`teachProse`), Keep going (`nextConcept`), and the feedback and close arithmetic |
| [`@/lib/agent/session`](../../apps/web/src/lib/agent/session.ts) | Pure. The question writer's system prompt and `parseSessionQuestion`, which accepts a JSON object (fenced or with a sentence around it) and refuses anything else rather than guess an answer key. It reshuffles the options, seeded by the question text, because models put the answer in slot one |
| [`@/lib/session-page`](../../apps/web/src/lib/session-page.ts) | Server. The plan, the teach step's asset, whether a model is configured, and the next concept |
| [`SessionFocus`](../../apps/web/src/components/session/SessionFocus.tsx), [`SessionClose`](../../apps/web/src/components/session/SessionClose.tsx) | The client session and its close screen |

### `POST /api/learner/observe`

```ts
// request
{
  conceptSlug: string;            // a concept id
  correct: boolean;
  source: "probe" | "teach";      // probe: asked before teaching, no BKT learning step. A review grade is /api/review/grade
  requestId: string;              // one per answer, resent on a retry: [A-Za-z0-9_-]{1,128}
  sessionId?: string;             // the first answer opens the session; a closed one is refused
  question?: string;              // the workspace's check status matches on this text
  answer?: string;                // the correct answer, as `learn observe --answer` means it
  chosen?: string | null;         // what the learner picked; null for "I don't know"
  closeSession?: boolean;         // close the session after recording (a page leaving mid-save)
}                                 // each text up to 2000 characters
// 200 { ok: true, result }
{
  concept, correct, pLBefore, pLAfter, delta, mastery, mastered, due,  // as `learn observe --json`
  propagated: { concept, title, hops, pLBefore?, pLAfter? }[],        // the numbers are absent on a replay
  card: { due, intervalDays, created } | null,
  session: string | null,
  replayed: boolean,                                                   // the request id was already recorded; nothing was written
  closed: boolean,                                                     // closeSession closed the session in this request
}
```

400 `BAD_REQUEST` (a malformed body, or a concept or session the catalog
cannot take), 403 `ORIGIN_MISMATCH`, 429, 503 `STORE_UNAVAILABLE`. The first
answer opens the session inside its own locked transaction
(`recordObservation`'s `openSession`), so a refused answer leaves no
`session-start`, and a close racing it either counts it or refuses it. The
page shows the verdict only once this answers, so the screen and the log
cannot disagree. Once Check is pressed the pick is fixed until the server
answers: a failed write keeps its request id and its pick, and Try again
resends both, so a response lost after the save is replayed with the verdict
of the answer actually sent. `learn observe --json`'s `logged` is not in the answer: the markdown
session log is the CLI's.

`POST /api/learner/session/close` with `{ sessionId }` answers `{ session,
closed, answered, correct, concepts }`; `closed: false` means it was already
closed or never opened, and nothing was written. The page sends it on
reaching the close screen (with one retry), and with `keepalive` when the
learner leaves mid-session (Exit, Ask the tutor, a closed tab), so an
answered session does not stay `running`. When an answer is still saving,
leaving sends that answer again with `closeSession: true` instead of a bare
close: `recordObservation` records it (or replays it, by its request id) and
closes the session in the same locked transaction, so the close can never
land first and have the answer refused, the two commit together or not at
all, and nothing has to run after `pagehide`.
Checked in a browser for Exit and for a tab closed mid-save. A tab that dies before either
still leaves one running, as a `learn session start` never closed does.

`POST /api/agent/session` with `{ conceptSlug, step: "probe" | "check",
avoid?: string[] }` answers `{ question, model, provider, providerLabel }`,
where `question` is the `SessionQuestion` the page renders. Guarded like the
chat (same origin, 20 a minute in its own bucket). 502 `UNSTRUCTURED_REPLY`
when the model answered in prose; the page then uses the plan's fallback (the
note's first check, reshuffled) or says there is no question.

### Which question a step asks

| Note has | Probe | Check (after Teach) |
| --- | --- | --- |
| two or more checks | the first | the second |
| one check | the check | the tutor's question; with no model or a prose reply, the same check, reshuffled |
| no checks | the tutor's question, or "no question" when it fails | the tutor's question, or "no question" when it fails |
| no checks, and no model configured | dropped | dropped |

A step nothing can fill is dropped on the server (`withoutEmptySteps` in
`session-core`), so the learner is never walked through empty cards: Teach me
becomes Teach then Close, and Quiz me opens on the close screen. Both say why
(`NOTHING_TO_ASK`), and nothing is recorded. The workspace says the same under
Teach me before a session starts (`sessionWillAsk`, which builds the same plan
through `sessionCanAsk`, so the two cannot disagree); the button stays live,
since the session still teaches, and a disabled kit button takes no pointer
events, so a `title` on it would never show. "No question" is left for a model
that fails at run time, which only a request finds out.

A probe is recorded as `source: probe` (no learning step), a check after
teaching as `teach`, and a Quiz me check as `probe`, since nothing was taught
in that session.

## The course home

`/courses/[slug]` and `/courses/[slug]/[module]` are one screen, rebuilt on
2026-09-29 in the layout of Coursera's signed-in course home
([reference/coursera/](reference/coursera/README.md), "Use in Figma") with
our tokens, Figtree and primitives. It replaced the stacked course path of
phase 1b. Each module has its own URL; the course's own URL shows the module
the learner is on.

| File | What it holds |
| --- | --- |
| [`lib/course-home.ts`](../../apps/web/src/lib/course-home.ts) | `loadCourseHome(course)`, server only: each topic's mastery, and per module the Guidebook concept, the assets and the description (the topic vocabulary's `summary` for the module's `topic:`). Both pages call it; every module is resolved, since the sidebar marks all of them |
| [`lib/course-path.ts`](../../apps/web/src/lib/course-path.ts) | the pure rules, unchanged where Today and Courses read them (`pathStatus`, the lock, `itemStanding`), plus `defaultModuleIndex`, `moduleHref`, `moduleMark`, `topicMark`, `topicMeta`, `moduleMeta`, `moduleObjectives`, `moduleConceptCount`, `doneLine` |
| [`lib/course-assets.ts`](../../apps/web/src/lib/course-assets.ts) | what each module's path places, as rows (title, kind label, icon family): the topic's videos, each concept's diagrams and videos, the listed videos resolved by id, whether the topic is shared, each note's check count, and the count and library link for everything filed under the topic. No thumbnails, so no blob reads |
| [`lib/module-path.ts`](../../apps/web/src/lib/module-path.ts) | `modulePath`, pure: the module as one ordered path (phase 3 of [module-learning-path.md](../proposals/module-learning-path.md)), and where each video lands, once per page |
| [`CourseHome`](../../apps/web/src/components/course-home/CourseHome.tsx) | the client half: the status from the ticks, which module to show, the grid |
| [`CourseSidebar`](../../apps/web/src/components/course-home/CourseSidebar.tsx), [`ModuleMain`](../../apps/web/src/components/course-home/ModuleMain.tsx), [`ModulePath`](../../apps/web/src/components/course-home/ModulePath.tsx), [`TopicRow`](../../apps/web/src/components/course-home/TopicRow.tsx), [`ModuleResources`](../../apps/web/src/components/course-home/ModuleResources.tsx), [`CourseRail`](../../apps/web/src/components/course-home/CourseRail.tsx) | the three columns and their rows; `rows.ts` holds the row classes, `icons.tsx` the glyphs and status marks |

**Layout.** Three `Panel`s (surface, radius 16, no border, no shadow) on the
page colour, 16 apart: from 1280px a 300px sidebar, the module, and a 360px
rail; from 1024px the rail drops under the module; below that the sidebar
becomes a picker (a button naming the module on screen, opening the list)
above the module, and the rail follows. The sidebar is sticky from 1024px.

**Which module `/courses/[slug]` shows.** The one holding the active topic
(`pathStatus`), else the first. It is chosen once, on the client, from the
ticks the page was served with, and kept: finishing a module's last topic
moves Continue on without pulling the page away. The ticks live in
`LearnerProvider`, so the server cannot choose without a second snapshot
read. The visit is recorded with the module only on a module's own URL.

**Rows.** Coursera's item row: at least 60px, 8px padding, radius 8, a 20px
status mark, a 16/24 title over a 14/20 `--text2` meta line, `--tint` on
hover and on the active topic. A topic's mark is done (a mastered disc with
a tick: mastered, or ticked when it has no concept), learning (the kit's
learning dot) or not started (a ring in `--text3`); its meta line is
"3 concepts · Learning", "Done" or "Not started". The whole row is a toggle
(a button whose `::after` covers the row) that opens the topic's tools,
which are the old node panel's: what it covers, Mark done, the tutor chat,
the recap and the note. Continue sits above the toggle at the row's right,
and under the title on a phone. A module row's mark is done, in progress (an
arc for the share done), not started, or a padlock while locked.

**The module as a path** (since phase 3 of
[module-learning-path.md](../proposals/module-learning-path.md)). Under the
objectives the module is one ordered list in Coursera's groups: Before you
start (unmastered prerequisites outside the module, `requires` first; only
when there are any), Watch (the videos the module lists, then its topic's;
only when there are any), Read alongside (readings with no `lessons:`, the
learner's own, and the add form), then one group per topic, its row as the
header and its steps under it on a hairline: each concept is one row, the
note's title over "Note · Learning" (plus " · 3 checks" when the note has
checks) with a Quiz me pill at its end, under the title on a phone; its
diagrams and videos follow as rows of their own, then the readings listed
on the topic. Practice comes last when there is any, then "All N in the
library" once. One icon per step kind: a bulb for a prerequisite, a page
for a note, the family glyph for an asset, the resource type's glyph for a
reading, a pencil for practice. The concepts left the topic panel, since the steps draw them.

## Deviations from the hi-fi

| Where | Hi-fi | Built | Why |
| --- | --- | --- | --- |
| Courses header | "Import syllabus" button | not drawn | there is no import feature to point it at |
| Phone header | the page title | the wordmark | the shell cannot know a page's title; the page prints its own under the header |
| Tab bar | grey discs as icons | outline glyphs | the discs were placeholders |
| Avatar | a plain disc | a disc with a person glyph | a bare disc does not read as a button |
| Store banner | not drawn | `--text` on `--warn-tint` with a `--warn` rule | `--warn-text` on `--warn-tint` is under 3:1 in light, too low for a sentence |
| Preference key | DESIGN.md's API table said `streakLeewayPerWeek` | `dailyLeeway` | the name the phase-0 brief set; DESIGN.md now matches |
| Stat tile label | white on the coloured strip in light | black (`--on-tone`) in both themes | white on the streak orange is about 2:1, and under 4.5:1 on the other three; black is at least 4.8:1 on all four |
| Path nodes (now topic rows) | one node per concept | one node per course topic, coloured by the concepts whose notes name it (all mastered is mastered, none observed is untouched, anything else learning; p(L) is the minimum) | the phase-1b brief; a course's topics are the unit of progress everywhere else. `content/topics.yaml` maps modules, not topics, so the per-topic link is the note's `topics:` frontmatter (`KbConcept.topics`) and `maps.concepts` only orders them |
| Path, topic with no concept | not drawn | the row shows the learner's tick: the done mark when ticked, the empty ring otherwise, with "Done" or "Not started" as its meta line | most courses have no concept notes yet; without this their rows would all read not started |
| Unit and header wording | "4 of 4 mastered", "40% mastered" | "mastered" only when every topic has a concept, else "done" | a tick is not mastery |
| Path, per-node tools | not drawn | any topic row opens the topic's concepts, subtopics, done tick, note, recap and tutor chat; the module's resources are item rows under the topics, with the learner's own and an add form | the module page's checklist and resource list folded in, so nothing it had is lost |
| Guidebook with no concept | a link | no Guidebook button; "Show learning objectives" lists the topics' subtopics for every module | the brief: no concept note to open. Before the Coursera rebuild the button toggled the same outline |
| Rail | three cards | Course progress (percent, bar, Continue, Reset), Next up only while the next topic is in another module, About this course (the summary from `notes`, track, prerequisites, capstone, the inferred-roadmap note; no credits, since every course is 4 MC), Related courses | what the old course page showed, kept, in Coursera's stacked rail cards |
| Course home, Coursera slots | partner logo, instructors, ratings, level, time left, deadlines, item types (video, reading), grades, the weekly target and course timeline, the Grades and Notes links | left out; the module's meta row counts topics, concepts, assets and done instead, and the sidebar's one secondary link is the course's assets in the library | no data behind any of them, and the owner's rule is not to invent it |
| Course home, type | Source Sans, the module title 600 20/24 | Figtree throughout, the module title 600 22/28 and not Georgia | our font; one family, as Coursera uses, since the page title sits in a column rather than over the page |
| Course home, asset rows | not drawn (the old rail had 72 by 48 thumbnails) | kind icons | Coursera's item rows carry a 20px icon, and a row per asset needs no poster read |
| Review, Again interval | "10 min" | "1 day" | the scheduler is SM-2 with no learning steps: a failed card comes back in a day. The buttons print what a grade will write |
| Review, the four intervals | Hard 1 day, Good 4, Easy 9 | often equal, and Hard can pass Good by a day | SM-2 only lets the grade change the interval from the third repetition on, and `schedule.mjs` fuzzes intervals of a week or more by up to 5% keyed on the interval itself. Honest, and a scheduler question, not a page one |
| Review, answer panel | a citation, Why?, Open concept on every card | the citation and Why? only when the check block has `source:` and `why:` | most notes have neither; nothing is invented to fill the slot |
| Review, before the answer | the answer already revealed | Show answer (space) in the rating row's place | the hi-fi draws the revealed state; recall needs the hidden one first |
| Review, check cards | options and a verdict, as in a session | wrong options drawn from other notes' check answers, then summaries | a check block has `q`, `a`, `why` and `source`, no distractors; a note too short of neighbours is asked as recall instead |
| Review, header | "CP4281 mostly" | the note folder ("mostly transformers") | a concept belongs to a folder for certain and to a course only through its topics; the folder is the honest label |
| Review, phone header | "Review" | the wordmark | the shell's rule, as on every phone page |
| Review, close screen | not drawn | title, three stat tiles (reviewed, again, next due), Back to Today | the brief's close screen, from the session close's parts |
| Learn index header | "Add concept" button | not drawn since 2026-09-29 (until then disabled, with the CLI command as its reason) | concepts are added by the `learn` CLI and the web app has no way to add one, so the owner's rule on controls for what the app cannot do applies |
| Learn index graph card | a placeholder with "toggle: full course" | a Neighbourhood / Course chip pair in the card header; Course reads "Folder" for a concept in no course | 24 of 32 concepts link to no curriculum item, so "course" falls back to the note's folder |
| Learn index table | no selected row | the selected row is tinted `--surface2`; clicking a row selects it, the title links to the workspace | the graph follows the selection, so the selection has to show |
| Course graph | not drawn | the transitive reduction of the edges | the algorithms folder drawn with every edge was a hairball |
| Workspace left panel | summary, links, sources, backlinks only | the same, plus the whole note behind "Read the whole note" | the panel is "Note & sources"; the note is closed by default to keep the drawn layout |
| Workspace sources | three coloured sources | "Your note" is always source [1], frontmatter sources follow | no note in the corpus fills `sources:` yet, so the note is the one source every concept has |
| Workspace tutor | "Learning guide · concise" | the stored tutor style's label ("Learning guide · concise" by default), as a link to Settings | the label is the style the prompt is given; the link says where it changes |
| Tutor turns | Save to note and Why? | Why? only; Save to note was drawn disabled with "Not built yet." until 2026-09-29, when the owner had every not-built control removed | extending `POST /api/learner/note` is not in 1c |
| Studio cards | "Generate flashcards", "Add source" | not drawn (disabled with a reason until 2026-09-29) | no feature behind them yet, and a control that only says so was removed |
| Workspace tutor | not drawn | `?ask=<text>` prefills the tutor's input (never sends it) and opens the Tutor tab on a phone | a session's "Ask the tutor" lands here with its question |
| Workspace panels | fixed three columns | 250 and 270px side panels from 900px, 290 and 310 from 1280px; tabs below 900px; each side panel collapses to a 48px rail | the brief's collapse and phone rules |
| Today, Streak card | the card, with its week of discs | not drawn since 2026-09-29; the top bar's streak pill stays, and is a button (`HabitPill`) whose popover and accessible name carry the free misses and today's fact | the card repeated the pill (the owner's call). Until then it drew the week with a fifth `forgiven` disc state and no "Calendar" link |
| Today, Streak strip | four disc states | a fifth, `forgiven`: a dashed `--streak` ring | the habit data has misses the leeway covered, and they should not read as either a done day or a plain miss |
| Today, Next up | "Next on your path · CP4281 · Module 2" | the course and module when a curriculum item links the concept, otherwise the note's folder ("Next on your path · algorithms") | most notes link no curriculum item yet |
| Today, Reviews due | Snooze to tomorrow | not drawn (disabled with "Not built yet." until 2026-09-29) | snoozing is out of scope for 1a |
| Today, Recent activity | one row per concept | one row per sitting (session and kind); a row over several concepts prints "p(L) 2 up · 5 down" instead of one before-and-after | a probe across seven concepts would otherwise fill the card with one session |
| Today, Full history | a history page | links to `/learn` | there is no history page yet |
| Today, phone | the page title in the header | "Today" printed under the header, visually hidden from 768px up | the shell's header shows the wordmark, as on Courses |
| Settings, Theme | System | Light or Dark | the theme is a two-value cookie the root layout reads; a system mode belongs to the shell |
| Settings, Reminders | "Facts only · 9:00" | not drawn (a disabled "Off" until 2026-09-29) | reminders are not built, and `reminders` is not a preference key yet |
| Settings, Model providers | "Order: 3 free tiers" | the configured providers' ids in order, the labels and models as a tooltip | the full labels do not fit the 300px box |
| Settings, field notes | notes under Daily target and BKT priors only | also under Tutor style and Motion | each says what the choice does today (Motion that it is not applied, Tutor style where it is used), so a stored choice does not pretend to do something |
| Filter rows on Learn and Library | a row of chips, one per option | one `FilterMenu` per group: Learn has Status, Library has Type and Course (and Topic while `?topic=` is set). Each option carries its count | the option count outgrew a row: Library showed twenty chips over three rows. Picking "All" clears a group, so there is no separate clear button. Courses had a Progress and a Tag menu too until 2026-09-29, when it moved to Coursera's layout with tag chips, and the Tag menu came back on 2026-10-04 (see "Courses" below) |

### Session focus mode (phase 1d)

| Where | Hi-fi | Built | Why |
| --- | --- | --- | --- |
| Steps | "Step 3 of 7", teaching and its question on one screen | four steps: Probe, Teach, Check, Close ("Step 2 of 4"); the check step shows the diagram again, smaller, above its question, which is the 05 and 06 layout | the brief's plan. Quiz me (`?mode=check`) is each of the note's checks (up to five) then Close |
| Teach prose | two sentences | the note's body without its frontmatter, title, check blocks, Checks, Sessions and Prerequisites sections, and empty template headings, through `NoteProse` | the answers to the next question live in the check blocks; most notes are still thin, so a teach step is often one paragraph |
| Widget slot | "interactive diagram" | the concept's first `diagram_svg` (on the light mat, via `EmbedImage`), else its first video (`VideoPlayer`), else the placeholder; the server's `WidgetFailure` when the file route is off or the file is gone | no interactive widget exists; the assets from `assetsForConcept` are what there is |
| Option rows on a phone | radio circles | the number badge, as on a desktop | `ChoiceRow` is 1e's primitive; restyling it for one page is not this phase's to do |
| Wrong options | authored | the note's other checks' answers and its neighbours' and folder's summaries; the far summaries closest in length only fill up to three | a check block has no distractors (the review page's rule, with neighbours first) |
| Why? | a disclosure | a note check opens the note's summary ("From your note: ..."); a tutor question opens its explanation. The reason line under the verdict is the check's `why:` or the explanation's first sentence | a check's answer is already the green row, so repeating it explains nothing |
| Feedback note | "this becomes a review card" | that for a concept's first card, else "next review tomorrow" (or the date) | every answer schedules the card; the note says what it did |
| Close, Scheduled | named checks, "review in 10 min, then 1 day" | one row per concept card the session wrote, "new card, review tomorrow" | cards are per concept and SM-2 has no learning steps (as on the review page) |
| Close, Review cards | cards created | concepts whose card the session created or moved | every answer reschedules; a count of created cards would read 0 on the second session |
| Close, Keep going | the next concept | the first frontier concept this one leads to, else one in its folder, else the frontier's first; "Back to the workspace" when the frontier holds nothing else | the frontier's own order put an algorithms concept after the dot product |
| Close, target | "1 / 2" | `habit.target` from the server's refresh after the last answer; a dash when the database is down | the same number the top bar shows |
| Phone header | "Session" | the wordmark | the shell's rule, as on every phone page |
| No model, no checks | not drawn | the step says there is no question and why (no model configured, or the tutor answered in prose), records nothing, and Continue goes on | the brief: the session works with no provider key |
| Session log | a markdown log per session | none from the web: the `session` row, `session-start`, the observations and `session-close` are the record | a page never writes under `learn/` (layering rule 3); the CLI still writes its log |

### Courses

Rebuilt on 2026-09-29 in the layout of Coursera (the owner's call), from the
reference in [reference/coursera/](reference/coursera/README.md): its
signed-in My Learning page for the courses under way, and the cover cards in
its explore carousels for the rest. The layout and components are Coursera's;
the colours, the type and the primitives are ours, so all six theme modes
hold.

A second catalogue layout, Gauth Academy's, was read on 2026-10-04 into
[reference/gauth/](reference/gauth/README.md); nothing on this page is built
from it.

The page is the title, then **Continue learning**, drawn only when a course
has a topic done and one left: one `Card` per course in My Learning's shape,
the course and "7 modules · 20 topics · 35% done" over a `ProgressBar` on the
left, and on the right an inset card naming the next topic and its module
with a Resume button. The course last opened (`lastVisited`) comes first,
then the furthest along. Under it, **All courses**: a Tag `FilterMenu` (All,
then each tag a course uses, with counts) with the search at its right, over a grid of
cover cards. A card is a 16:9 cover in an 8px frame, then the code
where Coursera names the partner, the title, and the type line
("Course · 6 modules · 13 topics", plus "35% done" or "Completed" once
started). The whole card links to `/courses/<slug>`. Four across at 1392px
(280px minimum), two on a phone.

**Inactive courses** (2026-10-04, the owner's call: ten courses crowded the
page when only a semester's three are being studied). Each cover card carries
Deactivate on its cover's corner, shown on hover or focus with a mouse and
always on a touch screen; it sits beside the card's link, not inside it. A
deactivated course leaves the grid for an **Inactive courses** section under
it, folded shut with its count, where the same corner button says Activate.
It also leaves Continue learning, here and on Today, and the tags only it
used leave the tag menu. A search or a tag opens the fold whenever an
inactive course matches, and its toggle still closes it; a fold closed by
hand opens again on the next search or tag. The list is the
`inactiveCourses` preference (an array of slugs, absent meaning every course
is active, so a new course starts active), written through
`POST /api/learner/preference`.

The covers are stock photos (960x540 WebP) kept in the blob store: the course
row names each by its blob key with its credit beside it (`catalog course
cover`, services/catalog/SCHEMA.md "Course covers"), `getCourseCovers()` in
`apps/web/src/data/course-covers.ts` says which courses have one, and the card
loads it from `/api/courses/<slug>/cover?v=<hash>`, cached for good since the
hash names the image. The `<Image>` is `unoptimized`: the route needs the
session cookie, and Next's optimizer fetches its source without forwarding
any header. A course with no photo, a page that cannot read the covers, or
a photo that fails to load (a deployment without the blob store) shows its
code in a `Placeholder` (`CourseCover`, which swaps on the image's `onError`
inside the same 16:9 frame).

| Where | Coursera | Built | Why |
| --- | --- | --- | --- |
| Greeting | an avatar, "Good morning, Learner", the career goal and an illustration | the page title | there is no career goal to print, and the top bar already carries the avatar |
| My Learning tabs | In progress, Completed, Certificates | none: the courses under way are the Continue learning block, and every course is in the grid, whose type line says how far along it is | ten courses fit one grid; tabs would hide most of them behind a click |
| Right column | a calendar of daily goals, "Last 4 weeks" stats, recent certificates | not drawn | the four-across grid needs the full width, and the top bar's streak and target pills already carry the habit numbers |
| Course card | partner logo, "Course 1 of 9", estimated completion, an overflow menu | the course and its counts; no logo, no programme position, no date, no menu | we have no partners, programmes or completion estimates, and the menu's actions do not exist here |
| Next item | its type and length ("Reading (4 minutes)") | the module it sits in ("Module 2 · Transforms") | a topic has no type or length |
| Chip row | Bestsellers, New, Trending, Staff picks, Top rated | a Tag `FilterMenu`: All, then each tag with its course count | the tags are how our courses group; nothing ranks them. A chip per tag ran to two rows at twelve tags, so it went back to a menu on 2026-10-04 |
| Selected tag | filled near-black | the menu's trigger filled with the accent (`FilterMenu` as it is) | the brief was not to restyle a shared primitive for one page |
| Cover card partner | an 18px logo and the partner's name | the code alone ("CS4263"), no logo box; the credits went with the rail's, every course being 4 MC | no course has a logo; the course's `track` is left off, being a sentence ("AI focus area, project-heavy") rather than a name |
| Cover card hover | a soft shadow over 0.3s | the 1px `--border` darkens to `--text3` over 0.3s | the kit has no shadows |
| Card borders and radii | 1px, radius 16, on a white page | the `Card` (2px, radius 20) for Continue learning; the cover card keeps Coursera's 1px `--border` at radius 16 | the kit's card for the block that behaves like our other cards; the cover card is the new component, drawn as measured |
| Ratings, level, duration, certificates | on Coursera's cards | not drawn | we have none of that data, and nothing is invented to fill the slot |

### Library and the asset page (phase 1f)

| Where | Hi-fi | Built | Why |
| --- | --- | --- | --- |
| Library filter row | six kind chips and three course chips on one line | a Type menu and a Course menu, then the sort and the search on the right; the companion kinds (captions, chapters, diagram source, transcript) are a "Companion files" section at the foot of the Type menu, and the count line says how many rows All kinds leaves out | ten courses and four companion kinds did not fit one line; the companion kinds are values of the same `?kind=`, so a second control for them would disagree with the Type trigger whenever one was chosen |
| Library card | a "video" label in the empty thumbnail, a lowercase kind chip, "concept note" on the meta line | an empty thumbnail box, the kind chip in sentence case ("Note"), and the meta line without "concept note"; "svg" is "SVG"; a note whose concept is itself shows the mastery label instead of its title a second time | the kind was printed up to three times on one card (2026-09-29) |
| Library course options | "CP4281" | the course code, with its title as a muted second line and its asset count at the right | the title was a tooltip on the old chips; in a list it has room to be read |
| Library count | "208 assets" | the standalone count (135), or "12 of 135 assets" once anything is filtered | the other 71 rows are companion files the default view leaves out |
| Library card meta | "4:12 · manim" | the tool and the size ("manim · 9.6 MB") | the catalog records no duration |
| Library card concept | a concept with a mastery dot on every card | the first concept from `asset_concept` with its dot and "+n" for more; with none, the asset's topic in plain text and no dot | only notes, sessions and the two diagrams have `asset_concept` rows; no video does yet |
| Library grid | fixed 300px cards | an auto-fill grid, 280px minimum | four across at 1392px and one on a phone |
| Library search | DESIGN.md's API table proposed a search endpoint | the page's own `?q=`, searched on the server during render; no JSON endpoint | the library is the only caller today; phase 1c's Learn search can lift `searchHits` and `readSearchText` behind a route when it needs one |
| Asset page eyebrow | "RENDERED 2026-09-12" | "indexed" and the day the row entered the catalog | the catalog knows when it indexed a file, not when manimkc rendered it |
| Asset page Mark watched | on a video | "Mark read" on anything that is not a video; a video has no button and records itself | one `watched` event kind either way; a video appends it once 90% of it has played (`POST /api/learner/playback`), since a button asked the reader to report something the player already knew |
| Asset page Add to note | always drawn | drawn only when the asset explains a concept, linking to that concept's workspace | with no concept there is no note to add to |
| Asset page Explains | always two rows | "No concept is linked to this asset yet." when there are none; "not started" in place of p(L) for a concept with no evidence | a prior is not a measurement |
| Asset page Derived from | one line of filenames | "Derived from" for the sources and "Companion files" for what was made from it, each a list of links | the rows the old page showed, restyled |
| Asset page catalog row | not drawn | the Details tab of the asset's tabbed card (`AssetTabs`): progress (Watched or Read), kind, indexed, id, path, source, size, topic chips | the old page's facts; a reader checking what to type still finds them |
| Asset page layout | two columns, a rail of cards beside the asset | one column for every kind: the asset, its title and actions (under a picture, above words), then one tabbed card (`AssetTabs`: Explains, Related, Files, Details; a video puts Transcript first) | the rail's cards piled up; one card with tabs takes less room and reads the same on every kind |

**Library search** runs on the server over `?q=`: every row's title,
filename and URL, plus the text of each note and transcript, read per
request through `readAssetText` (a note from its row, a transcript from the
blob store; one with no stored copy, or over `TEXT_PREVIEW_BYTES`, is searched
by name only). Every word
must appear, as a case-insensitive substring: no stemming, no ranking, no
typo tolerance. A line inside a transcript finds the transcript's video. It
reads about fifty-five small files per search, with no index and no cache,
which is right for a few hundred rows and the first thing to change if the
catalog grows by an order of magnitude.

## Sweep after phase 1

Once 1a to 1f had merged, every route was screenshotted from a clean build of
`main` with `kit/shots.mjs`: Today, Courses, a course path, Learn, a concept
workspace, a session, Review, Library, an asset page, Settings and Studio, at
1440x900 and 390x844, light and dark. Each picture was read beside its hi-fi
frame. One PR fixed what that turned up.

| Found | Fixed |
| --- | --- |
| The Learn index's Mastery column showed the p(L) number and no bar | The 160px bar is sized on its wrapper; its `w-full` had won over the width passed in `className`, leaving a flex item of zero width (see Gotchas). Mastered fills with `--m-hi`, learning with `--m-mid`, untouched is an empty track labelled "–", as hi-fi 09 draws it. `ProgressBar` gained the `hi` tone for it |
| The asset page's links to `/learn/<slug>` carried `prefetch={false}` | Removed. It was the stopgap for a route that did not exist yet. A dynamic route's default prefetch stops at the nearest `loading.js` (Next's `Link` docs), and the app has none, so the prefetch is cheap: in a browser the four prefetch requests from one asset page came back with empty bodies. The external link keeps it |
| Settings stored `tutorStyle` and nothing read it | The concept tutor's system prompt carries one instruction per style (`TUTOR_STYLE_INSTRUCTIONS` in `lib/agent/prompt.ts`), and the session's question writer writes its explanation to match (`SESSION_EXPLANATION_RULES` in `lib/agent/session.ts`). Both routes read the preference on the server with `readTutorStyle` in `lib/settings.ts`, after the concept read, and fall back to the concise guide if it cannot be read. The workspace's Tutor header shows the style, linking to Settings, and the Settings note says where it applies |
| The README's picture was the old sidebar catalog | A fresh 1440x900 light capture of Today, with alt text and the surfaces table to match |

Left on purpose:

- **Hard can land past Good on the review rating row.** SM-2's intervals
  are fuzzed by up to 5% on anything a week or longer, so the two can cross
  by a day. The fix, if any, belongs in the scheduler (`schedule.mjs`); the
  buttons print what a grade would really write.
- **The legacy topic session route still exists.**
  `/courses/[slug]/[module]/session` is behind the Tutor chat link in a path
  node's panel, and is where Continue goes for a topic with no concept note.
  It runs the old topic tutor, which does not read `tutorStyle`. Retiring it
  needs those topics to have concepts first, so it is its own change.
- **Reminders, snooze, Save to note, Add source and Generate flashcards are
  not built,** and since 2026-09-29 none of them is drawn: a disabled control
  that only says "Not built yet." was the owner's example of copy to remove.
  The Deviations rows above say where each belongs, and a one-line comment
  marks the spot where the code would not show it (Snooze, Save to note,
  Reminders).
- **`reducedMotion` is stored, not applied.** Only the system's
  `prefers-reduced-motion` is honoured, where a rule exists; the Settings
  note says so.
- **The primary button's hover is ours.** None of the reference apps drew
  one, so `hover:opacity-90` on the 3D pill is our own choice.

## Gotchas

- **A width passed to `ProgressBar` loses to its own `w-full`.** The bar's
  outer element is `w-full` plus your `className`, and in the stylesheet
  `.w-full` comes after `.w-[160px]`, so the bar stays 100% of its parent.
  Inside a flex row that parent is sized by its content, a percentage of
  nothing, so the track rendered 0px wide and the Learn index showed a p(L)
  with no bar beside it. Put the width (and `shrink-0`) on a wrapping
  element, as the Learn index does. A
  breakpoint width such as `md:w-[150px]` does win, because media rules come
  later, which is why the session close screen's bars were never affected.
- **A primitive sets its own `display`, so hide it with a wrapper.**
  `<Pill className="hidden md:inline-flex">` stays visible on a phone:
  `hidden` and the pill's `inline-flex` are equal-weight utilities and the
  later one in the stylesheet wins. Put `hidden md:flex` on a wrapping
  `<span>`. The top bar does exactly this.
- **An overflowing header hides a fixed tab bar on a phone.** When content
  is wider than 390px the mobile layout viewport grows, and a
  `position: fixed; bottom: 0` bar lands below the visible area. If the tab
  bar vanishes from a phone screenshot, look for horizontal overflow first.
- **`next start` runs as `next-server`,** so `pkill -f "next start"` misses
  it and the next `start` fails with `EADDRINUSE` while the old build keeps
  serving. Stop it by port: `lsof -ti :3121 | xargs kill`.
- **`shots.mjs` hangs on a page that links to a route that does not exist yet.**
  It waits for `networkidle`, and Next's prefetch of a 404 leaves the request
  open in Playwright's eyes, so the course path (whose Continue and Guidebook
  point at `/learn/<concept>` before 1c and 1d land) timed out at 30s. A copy
  of the tool waiting for `load` plus a second works; the real fix is the
  routes existing. The session route exists since 1d, so Teach me, Quiz me
  and Today's Continue are prefetched again; `prefetch={false}` is the stopgap for the next route
  that is linked before it lands.
- **A session's next concept keeps the old one's state without a key.**
  Keep going moves from `/learn/a/session` to `/learn/b/session`, the same
  page with a new param, and React keeps a client component's state across
  that. The page keys `SessionFocus` on the slug and mode, so the answers of
  one session never show on the next.
- **Test a model-written question without a key by pointing a provider at a
  stub.** `NVIDIA_API_KEY=stub NVIDIA_BASE_URL=http://localhost:<port>/v1`
  with a server that answers `{ choices: [{ message: { content } }] }` drives
  `POST /api/agent/session` end to end; a prose `content` exercises
  `UNSTRUCTURED_REPLY` and the fallback.
- **The habit numbers are read on every request,** `readEvents` in full. The
  log is small for one learner; if it grows into the tens of thousands, add a
  date-bounded read to the catalog rather than caching in the layout.
- **Driving `/review` or a session in a browser writes real evidence.** A
  rating is a `review` event in the learner's own log, which is append-only.
  Screenshot a page that grades against a copy of the database
  (`createdb -T self_learn self_learn_<phase>`, then start the server with
  `DATABASE_URL` pointing at it), never against `self_learn`.
- **On a check card the number keys mean two things.** Before the verdict 1
  to 4 pick an option; after it they rate. The review page keeps one phase
  per card so the second press of "2" is a rating, never a second pick.
