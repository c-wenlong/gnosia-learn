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
| 1b | Course path, absorbing the module page | `/courses/[slug]` | Not started |
| 1c | Learn index and Concept workspace, with a concept-aware tutor chat | `/learn`, `/learn/[concept]` | Not started |
| 1d | Session focus mode with graded probes writing BKT events, and the close screen | `/learn/[concept]/session` | Not started, needs 1c |
| 1e | Review | `/review`, `GET /api/review/due`, `POST /api/review/grade` | Not started |
| 1f | Library and the asset page: concept links, Mark watched, text search | `/library`, `/library/[id]` | Not started |

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
`TOKENS` in [kit/hifi.py](kit/hifi.py).

| Group | Names |
| --- | --- |
| Grounds | `--page`, `--surface`, `--surface2`, `--tint` |
| Lines | `--border` (2px card and input borders), `--hair` (1px hairlines) |
| Text | `--text`, `--text2`, `--text3` |
| Accent | `--accent` (fills), `--accent-text` (links and ghost buttons) |
| Correct | `--ok` (fill), `--ok-lip`, `--ok-text`, `--ok-tint` |
| Not quite | `--warn` (fill), `--warn-lip`, `--warn-text`, `--warn-tint` |
| Error | `--danger` (a text colour) |
| Habit | `--streak` |
| Primary button | `--btn-face`, `--btn-lip`, `--btn-text` |
| Mastery | `--m-hi` (mastered), `--m-mid` (learning), `--m-lo` (untouched), `--lip-shade` (under an untouched path node) |
| Named kit literals | `--accent-lip`, `--ok-on`, `--warn-on` (labels on the green and yellow faces), `--m-hi-lip`, `--m-mid-lip` (path-node lips), `--violet` (the review-cards stat tile), `--on-tone` (small text on a saturated fill, black in both themes) |

**Every token is also a Tailwind colour of the same name**, so write
`bg-surface2 text-text2 border-border`, not `bg-[var(--surface2)]`. The
utilities point at the variable, so they follow the theme class. Never write
a hex value in a component.

**Type.** `font-sans` is Figtree (next/font, self-hosted), the body default
at 15px/1.5. `font-display` is Georgia from the system: page titles at
28/700, concept titles at 26 to 32/700, the wordmark at 20/700. Card titles
16/700, eyebrows 11/700 uppercase, button labels 15/600, dense rows 14,
lesson prose 17. `font-mono` is still Geist Mono, for code.

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
file each, all safe in a server component (no `"use client"`, no hooks). The
class strings live in the React-free [classes.ts](../../apps/web/src/components/ui/classes.ts),
so a client component, a server component or a test can compose them.
Import from `@/components/ui` or from the file.

| Component | Props | Kit |
| --- | --- | --- |
| `Button` | `variant?: "primary" \| "secondary" \| "ghost" \| "ok" \| "warn" \| "accent"` (default primary), `size?: "md" \| "sm"` (44px or 36px), `block?: boolean`, `href?: string` (renders a `next/link`, plus `prefetch?`), `className?`, and every `<button>` or `<a>` attribute. Default `type="button"` | `Btn` |
| `Card` | `title?: ReactNode`, `action?: ReactNode`, `tight?: boolean` (padding 14), `as?: "section" \| "div" \| "article" \| "li"`, `className?`, `id?`, `aria-label?` | `Card` |
| `CardAction` | `href`, `children`: the "See all" link for a card's `action` slot | `Card` action |
| `Panel` | `title?`, `actions?` (a 48px header with a hairline under it), `as?: "section" \| "div" \| "aside"`, `className?`, `bodyClassName?` | `Panel` |
| `Chip` | `active?: boolean`, `size?: "md" \| "sm"` (34px or 28px), `href?` (a link), `onClick?` (a toggle with `aria-pressed`), `title?`, `className?`. Neither `href` nor `onClick` renders a static label | `Chip` |
| `Pill` | `dot?: string` (a CSS colour, e.g. `"var(--streak)"`), `title?`, `className?` | `Pill` |
| `Eyebrow` | `as?: "p" \| "span" \| "h2" \| "h3" \| "div"`, `className?` | `Eyebrow` |
| `MasteryDot` | `bucket: MasteryBucket`, `size?: number` (px, default 14), `showLabel?: boolean`, `pL?: number \| null` (printed with the label), `className?` | `Mastery`, `MasteryLabel` |
| `ProgressBar` | `percent?: number` (0 to 100) or `progress?: ProgressCounts`, `showLabel?` (defaults on only with `progress`), `size?: "md" \| "sm"` (8px or 6px), `tone?: "accent" \| "ok" \| "mid"`, `label?` (accessible name), `className?` | `Bar` |
| `TargetBar` | `done: number`, `total: number`, `label?`, `className?`: a 20px track with "x / y" beside it | `TargetBar` |
| `StreakDay` | `letter: string`, `state: StreakDayState` (`done`, `forgiven`, `missed`, `today`, `future`), `isToday?`, `description: string` (what a screen reader hears), `className?`. Feed it from `streakStrip` in `@/lib/today-core` | `StreakDay` |
| `Input` | `pill?: boolean`, `className?`, every `<input>` attribute | `Input` |
| `SearchField` | `label: string` (screen-reader label, required), `name?` (default `q`), `className?` (the wrapper, e.g. a width), `inputClassName?`, every `<input>` attribute but `type` | `Input` with `pill` |
| `StatTile` | `value: ReactNode`, `label: string`, `tone: "ok" \| "accent" \| "violet" \| "streak"`, `className?` | `StatTile` |
| `Placeholder` | `label?: string` (lines split on `\|`), `height?: number \| string` (default 120), `className?`, `children?` | `Placeholder` |
| `Divider` | `vertical?: boolean`, `className?` | `HR` |

The pure helpers beside them:

| Module | Exports |
| --- | --- |
| [`@/components/ui/classes`](../../apps/web/src/components/ui/classes.ts) | `cx(...)`, `buttonClasses({ variant, size, block, className })`, `chipClasses({ active, size, interactive, className })`, `inputClasses({ pill, className })`, `cardClasses({ tight, className })` |
| [`@/lib/mastery-bucket`](../../apps/web/src/lib/mastery-bucket.ts) | `type MasteryBucket = "mastered" \| "learning" \| "untouched"`, `bucketOf({ mastery, observations? })`, `MASTERY_BUCKETS`, `MASTERY_BUCKET_LABEL`, `masteryCaption(bucket, pL?)` |
| [`@/lib/nav`](../../apps/web/src/lib/nav.ts) | `DESTINATIONS`, `type DestinationKey`, `activeDestination(pathname)` |
| [`@/lib/course-summary`](../../apps/web/src/lib/course-summary.ts) | `toCourseSummary(course, tags)`, `courseStatus(summary, completed)`, `filterCourses(...)`, `usedTags(...)` |
| [`@/lib/habit-core`](../../apps/web/src/lib/habit-core.ts) | the `Habit` types, `computeHabit`, `computeStreak`, `computeTarget`, `habitLabels`, `dayKey`, `weekStart`, `addDays`, `parseDailyTarget`, `parseLeeway` |
| [`@/lib/preferences`](../../apps/web/src/lib/preferences.ts) | the Settings vocabulary (`TUTOR_STYLES`, `MOTION_MODES`), the validators the preference route runs (`validateDailyTarget`, `validateLeeway`, `validateTutorStyle`, `validateMotionMode`), and the words (`describeTarget`, `describeLeeway`, `targetChoices`) |
| [`@/lib/today-core`](../../apps/web/src/lib/today-core.ts) | the Today model (`TodayModel`) and its pure parts: `activityRows`, `dueLabel`, `countCheckBlocks`, `streakStrip`, `targetRows`, `coursesInProgress`, `pastDayLabel`, `futureDayLabel` |

`bucketOf` is the only way a page turns a concept into a colour: mastered
stays mastered, no observations is untouched, everything else is learning.
Pass `observations`; a missing count reads as zero.

Not built yet, because one phase each needs them and none of the others do:
`PathNode` and the unit header (1b), the tutor message and
the citation pill (1c), the choice row and the feedback footer (1d), the
rating row (1e). Build them in `components/ui/` from the kit function of the
same name, with the same rules.

## The shell

[AppShell](../../apps/web/src/components/AppShell.tsx) is a server
component. Its client parts are in
[components/shell/](../../apps/web/src/components/shell/): `TopBar`,
`TabBar`, `AvatarMenu`, `StoreBanner`, `NavIcon`.

- **Top bar**, 64px on `--surface` with a hairline under it: the wordmark
  linking to `/`, the five destinations (Today `/`, Courses, Learn, Library,
  Review; the selected one in `--text` over a 2px underline), the streak
  pill, the target pill, and the avatar menu (theme, Settings, and Studio
  when `STUDIO_ENABLED` is set). Between 768 and 1024px the streak pill
  shows the number only.
- **Phone**, below 768px: a 56px header with the wordmark, the number-only
  streak pill and the avatar; the destinations move to a 68px tab bar fixed
  to the bottom.
- **Store banner** under the bar when the database is unreachable or a
  write failed, as before.

**A page picks its layout with `data-layout` on its root element.** The
shell reads it with `has-*`, so no prop or context crosses the server and
client boundary.

| `data-layout` | Width | Chrome | For |
| --- | --- | --- | --- |
| `app` | up to 1392px, 24px gutters (16 on a phone), 24px top | full | every redesigned page |
| `focus` | the whole width, no padding | no top bar from 768px up; the phone keeps its header and tab bar | Session and Review (hi-fi 05 to 08, 14, 15) |
| none | the old 48rem reading measure | full | pages not yet redesigned |
| `wide` | 72rem | full | the old library pages |
| `full` | the whole region, no padding, the shell fixed to the viewport | tab bar hidden | the studio canvas |

A redesigned page starts `<div data-layout="app">`, puts its title in
`font-display text-[28px] font-bold`, and builds from `components/ui`.
[app/courses/page.tsx](../../apps/web/src/app/courses/page.tsx) is the
reference. Once every page has moved, `app` becomes the default and the old
values go.

## Habit data

[`@/lib/habit`](../../apps/web/src/lib/habit.ts) (server only) reads the
event log, the preferences and the due queue through `learner-store`'s pool
and hands them to the pure `computeHabit`. The root layout calls
`loadHabit()` on every request and passes the result to the shell; a page
that needs the same numbers (Today) calls `loadHabit()` itself.

```ts
interface Habit {
  streak: {
    days: number;          // active days in the current run; forgiven days do not add
    leeway: number;        // free misses per Monday-to-Sunday week
    leewayLeft: number;    // left this week
    activeToday: boolean;
    week: { date: string; state: "done" | "forgiven" | "missed" | "today" | "future" }[]; // Mon..Sun
  };
  target: {
    target: { concepts: number; reviews: boolean };
    conceptsDone: number;  // distinct concepts with a teach or probe observation today
    dueReviews: number;
    reviewsCleared: boolean;
    done: number;          // units met; the review queue is one unit
    total: number;
  };
  reachable: boolean;      // false: every number is zero and nothing claims to be done
  asOf: string;            // ISO instant the numbers were computed
}
```

- A day counts when it has a study event: an `observation` or a `review`
  (`STUDY_EVENT_TYPES`), outside a voided session. `session-start` and
  `session-close` are bookkeeping and do not count, so opening a session and
  leaving does not make a streak day. A new kind of study (1f's `watched`)
  joins that list. Today with nothing done is not a miss; the streak carries
  through yesterday.
- **A page that writes a study event calls `router.refresh()` after the
  write.** The root layout computes the numbers and Next keeps a layout
  mounted across client-side navigation, so without it the pills show the
  old values. `useHabitRefresh` in the top bar is only the backstop: it
  refreshes when a tab comes back or every few minutes, once the numbers are
  older than 30 minutes or the day has turned.
- The preference keys are `dailyTarget` (`{ concepts, reviews }`, default
  `{ concepts: 1, reviews: true }`, concepts clamped to 0 to 20) and
  `dailyLeeway` (0 to 7, default 1), both in `PREFERENCE_KEYS`. Settings
  writes them through `POST /api/learner/preference`, whose validators
  (`@/lib/preferences`) refuse a value out of those ranges rather than
  clamping it. Phase 1a added `tutorStyle` and `reducedMotion` beside them;
  both are stored and nothing reads them yet.
- Days are counted in `HABIT_TIME_ZONE` (an IANA name) when it is set,
  otherwise in the server's zone. On a host that runs in UTC, set it.

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

Output is `<route>-<desktop|phone>-<light|dark>.png`. `SHOTS_VIEWPORTS`,
`SHOTS_THEMES` and `SHOTS_VIEWPORT_ONLY=1` narrow a run. It borrows
playwright-core from the tldrawkc submodule; in a checkout where that is not
installed (a fresh worktree), point `PLAYWRIGHT_CORE` at another checkout's
`tools/tldrawkc/node_modules/playwright-core/index.mjs`. It exits 1 if any
route answered 400 or more. Read every picture beside its hi-fi frame before
calling a page done; a build that passes proves nothing about how it looks.

## Deviations from the hi-fi

| Where | Hi-fi | Built | Why |
| --- | --- | --- | --- |
| Courses header | "Import syllabus" button | not drawn | there is no import feature to point it at |
| Courses cover | a box reading "cover" | the course code in the same box | no course has cover art; the code is the only honest label |
| Courses grid | three fixed 420px cards | an auto-fill grid, 360px minimum | fills 1392px with three columns and reflows to one on a phone |
| Phone header | the page title | the wordmark | the shell cannot know a page's title; the page prints its own under the header |
| Tab bar | grey discs as icons | outline glyphs | the discs were placeholders |
| Avatar | a plain disc | a disc with a person glyph | a bare disc does not read as a button |
| Store banner | not drawn | `--text` on `--warn-tint` with a `--warn` rule | `--warn-text` on `--warn-tint` is under 3:1 in light, too low for a sentence |
| Preference key | DESIGN.md's API table said `streakLeewayPerWeek` | `dailyLeeway` | the name the phase-0 brief set; DESIGN.md now matches |
| Stat tile label | white on the coloured strip in light | black (`--on-tone`) in both themes | white on the streak orange is about 2:1, and under 4.5:1 on the other three; black is at least 4.8:1 on all four |
| Today, Streak card | "Calendar" link in the title row | not drawn | there is no calendar page to open |
| Today, Streak card | "Reminders state facts, never guilt" under the strip | "Studied today." or "Nothing recorded yet today." | reminders are not built; the line states today's fact instead |
| Today, Streak strip | four disc states | a fifth, `forgiven`: a dashed `--streak` ring | the habit data has misses the leeway covered, and they should not read as either a done day or a plain miss |
| Today, Next up | "Next on your path · CP4281 · Module 2" | the course and module when a curriculum item links the concept, otherwise the note's folder ("Next on your path · algorithms") | most notes link no curriculum item yet |
| Today, Reviews due | Snooze to tomorrow | drawn, disabled, with a tooltip | snoozing is out of scope for 1a |
| Today, Recent activity | one row per concept | one row per sitting (session and kind); a row over several concepts prints "p(L) 2 up · 5 down" instead of one before-and-after | a probe across seven concepts would otherwise fill the card with one session |
| Today, Full history | a history page | links to `/learn` | there is no history page yet |
| Today, phone | the page title in the header | "Today" printed under the header, visually hidden from 768px up | the shell's header shows the wordmark, as on Courses |
| Settings, Theme | System | Light or Dark | the theme is a two-value cookie the root layout reads; a system mode belongs to the shell |
| Settings, Reminders | "Facts only · 9:00" | a disabled select reading "Off", with a note that nothing is stored | reminders are not built, and `reminders` is not a preference key yet |
| Settings, Model providers | "Order: 3 free tiers" | the configured providers' ids in order, the labels and models as a tooltip | the full labels do not fit the 300px box |
| Settings, field notes | notes under Daily target and BKT priors only | also under Reminders, Tutor style and Motion | each says what is not wired up yet, so a stored choice does not pretend to do something |

## Gotchas

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
- **The habit numbers are read on every request,** `readEvents` in full. The
  log is small for one learner; if it grows into the tens of thousands, add a
  date-bounded read to the catalog rather than caching in the layout.
