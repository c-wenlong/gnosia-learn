# Proposal: Home replaces Today

Status: proposed, 2026-10-04. Decisions H1 to H3 are the owner's and
settled. Nothing here is implemented.

## The problem

Today (`/today`, decision 9 of [DESIGN.md](../design/DESIGN.md)) answers
scheduling questions: what is due, what comes next on a path, whether the
daily target is met and how long the streak is. The owner does not learn on a
schedule. Courses are worked through when there is time, the tutor and the
studio are opened on a whim, and videos are watched in pieces. Measured on
the owner's database on 2026-10-04:

| Card | What it does | What the data shows |
| --- | --- | --- |
| Next up | The first entry of `frontier()` ([graph.mjs:240](../../scripts/learn/lib/graph.mjs)), which sorts every ready concept by lowest p(L), then by id. Today passes no goal | 121 concepts on the frontier and 295 untouched at the same prior of 0.25, so the pick is the one concept answered wrongly (Big-O), then the alphabet (A/B testing, Affordances and signifiers) |
| Reviews due | The SM-2 queue, five rows with "overdue Nd" | 11 cards, each scheduled a day out on 20 Aug and never graded. All read "overdue 44d" and the number only grows |
| Recent activity | `activityRows` over `observation`, `review` and `watched` events ([today-core.ts](../../apps/web/src/lib/today-core.ts)) | 37 events in six weeks. It cannot see the 12 studio drafts (the latest today), the 7 videos stopped partway with a saved position, or the CS3230 module opened yesterday |
| Courses in progress | Courses with at least one topic done (mastered, or ticked) | `progress` has no rows, so the card is empty while CS3230 is being worked through |
| Target and streak | A daily quota of concepts taught and reviews cleared, and a streak with weekly leeway | Unmet on any day without a review session, which is most days |

Every card reads as a debt or as a guess. What the owner actually did, and
would want to go back to, is in the database already and on no card.

## Decisions

**H1. The streak and the daily target are removed.** Owner's call,
2026-10-04: "remove streak and daily target for now". They go from every
surface, not only from Home (the scope is under "What is removed"). The
stored preferences are left in the database, unread, so bringing either back
later loses nothing.

**H2. Today is renamed Home, at `/home`.** `/today` answers with a permanent
redirect to `/home`, so a bookmark or an old link still lands. The API route
`GET /api/learner/today` becomes `GET /api/learner/home`; the `learning`
plugin does not call it (checked), so nothing outside the repository breaks.

**H3. Recall changes only what the web app shows (option A).** Owner's
call, 2026-10-04. SM-2, the `review` table and `review due --json` stay as
they are. The options are under "Recall" below.

## The page

Four parts, top to bottom. The phone layout is the same column.

### 1. Ask (phase 3)

A box at the top: "What do you want to learn?". Typing searches concepts,
courses and the library by title. Picking a result opens it. When nothing
matches, Enter starts a tutor chat on the text as typed. This is the entry
for learning whatever comes to mind, and it is the largest piece, so it ships
last. Open question for phase 3: a tutor chat on a topic with no concept row
cannot record mastery (`event.concept_slug` is a foreign key), so the chat
either drafts a concept first or stays unrecorded until one exists.

### 2. Pick up where you left off (phase 1)

The last few threads, newest first, at most five. A thread is anything the
owner touched that has a place to return to:

| Thread | Source, already stored | Resumes at |
| --- | --- | --- |
| A course module | The `lastVisited` preference (course and module slugs, time) | `/courses/<slug>/<module>` |
| A video | `playback:<asset>` preferences (position, ranges, `updatedAt`), only when not finished | The library page, at the saved position |
| A studio draft | `draft` rows (`updated_at`), when the studio is enabled | `/studio?draft=<id>` |
| A concept | The newest `observation` events per concept | `/learn/<concept>`, the concept's page |

Each row says what it is, where it stopped ("2:17 of 11:36", "Module 6 ·
Randomized algorithms") and when. This replaces Recent activity: both read
the same history, and a row you can resume says more than a row you can only
read.

Two limits of the stored data shape this list:

- **Modules.** `lastVisited` holds one module, and its writer
  (`/api/learner/preference`) and reader (`asLastVisited` in
  [snapshot.ts](../../services/catalog/src/state/snapshot.ts)) both refuse
  anything but a single object. Phase 1 leaves that key and both paths alone,
  since the course list resumes from it, and adds a new key,
  `recentModules`: a list of the same objects, newest first, at most five,
  with its own validator and reader. The course page writes both on a visit.
  While `recentModules` is absent (every owner before phase 1), Home reads
  `lastVisited` as a list of one, so no visit recorded before the change is
  lost.
- **Tutor chats are not a thread.** A tutor `session` row names no concept,
  and the chat itself lives in the browser's session storage
  ([tutor-thread.ts](../../apps/web/src/lib/tutor-thread.ts)), so it is gone
  once the tab closes. A chat that recorded answers already shows up as its
  concept, through the `observation` events, and that row opens the
  concept's page, not the conversation. Restoring a chat would mean storing
  it on the server, which is out of scope here.

### 3. Next from here (phase 2)

For each of the top threads, the two or three concepts it opens up, instead
of one global pick:

- after a concept: the concepts whose `requires` include it and whose other
  prerequisites are ready, using the same readiness rule `frontier()` uses;
- after a course module: the next topic in that module not yet done, then the
  first topic of the next module.

A thread with nothing after it shows nothing. When there are no threads at
all (a fresh account), the card falls back to the first course's first topic
rather than the alphabetical frontier. `frontier()` itself and the
`frontier --json` shape are unchanged; this is a separate function over the
same graph.

### 4. Worth a quick recall (phase 2)

At most three review cards, chosen from those whose concepts are on or next
to the threads above, then by how long since they were last seen. No count of
the whole queue and no "overdue" wording. One button, "Recall these", opens
`/review` with just those cards. `/review` takes one `?concept=` today, so
phase 2 lets it take a short list.

## Recall: H3

SM-2 ([schedule.mjs](../../scripts/learn/lib/schedule.mjs)) gives every card
a due date: a day after the first review, then about six, then growing by the
card's ease each time it is passed. A card nobody reviews keeps its date, so
the queue says it is "overdue", and the overdue count grows every day the
owner learns something else.

| | A: change what Home shows | B: change the scheduler |
| --- | --- | --- |
| What changes | Only how the web app picks and words cards. SM-2 and the `review` table stay | The due date gives way to a strength estimate: how likely the owner still remembers the concept, falling with time since the last review |
| What "overdue" means | Still exists in the data; Home and `/review` stop saying it | Gone. A card is only weaker or stronger |
| `/review` in Claude Code | Still sees "11 due" from `review due --json` | Ranks by weakness too |
| Cost | Small, web only | Rewrites `schedule.mjs`, migrates `review`, and changes `review due --json`, which the `learning` plugin parses ([LEARN.md](../LEARN.md#the-json-shapes)) |

Chosen: A. It removes the debt from the screen the owner sees every day, and
B can follow if the plugin's queue becomes the problem too.

## What is removed (H1)

| Surface | Change |
| --- | --- |
| Top bar | The streak pill and the target pill go ([TopBar.tsx](../../apps/web/src/components/shell/TopBar.tsx), `HabitPill`, `use-habit-refresh`) |
| The `(app)` layout | Stops reading `loadHabit()` |
| Settings | The Daily target and Streak leeway fields go |
| Session close | The Target stat tile goes |
| Today | `TargetCard` and `PhoneTargetStat` go with the page |
| Landing page | The Today feature copy ("a forgiving streak and a target you set") is rewritten for Home |
| `habit.ts`, `habit-core.ts` | Whatever only the streak and the target read is deleted; `dayKey` and the time zone stay, since the activity and review labels use them |

Kept: the `dailyTarget` and `dailyLeeway` preference rows (unread, not
deleted), the `--streak` colour token where it is used as a plain colour, and
every event type.

## What stays

- The `--json` shapes of `status`, `frontier`, `plan`, `observe` and
  `review due`. Nothing here changes a contract with the plugin.
- `/review` as the full queue for anyone who wants it.
- The owner scoping: every read Home makes takes `currentOwner()`, as Today's
  do.

## Phases

| Phase | Ships | Done when |
| --- | --- | --- |
| 1 | H1 and H2, and Home with Pick up where you left off. Reviews due and Next up stay as they are, worded without "overdue" | `/today` redirects; no streak or target anywhere; the owner's page lists the CS3230 module, the unfinished videos and today's draft; a module visited before the change still appears |
| 2 | Next from here and Worth a quick recall (option A, H3) | Next up follows the threads; recall shows at most three cards and no queue count |
| 3 | Ask | Search finds a concept, a course and a video by title; a miss starts a tutor chat |

Each phase is its own PR. DESIGN.md decision 9 and the Today section of
[IMPLEMENTATION.md](../design/IMPLEMENTATION.md) are updated in phase 1 to
say Home superseded them.
