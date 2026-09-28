# Architecture

self-learn is two programs and a knowledge base sharing one repository. A
Next.js app renders course roadmaps and progress; a CLI runs a Probe → Plan →
Teach → Close tutoring loop over concept notes on disk. They used to meet at
exactly one file and import nothing from each other. They now meet at one
database — the learner state half of the catalog — and both reach it through
the same store, which is the only module that writes it.

## The shape

Three layers plus two submodules. One layer is not in this repo at all.

```
   learning plugin                    this repo
   (installed globally)
     /learn   /review        ┌────────────┬──────────────┬──────────────┬──────────────────┐
         │                   │            │              │              │                  │
         │  npm run learn    │            │              │              │                  │
         └──────────────► scripts/learn  learn/      apps/web/   tools/manimkc/  tools/tldrawkc/
                          the CLI     the notes and  the web app    submodule       submodule
                              │        the sessions      │              │                  │
                              └──writes───►  ◄───reads───┘              └────writes────────┘
                                          learn/assets/
                              │                           │
                              └────► services/catalog ◄───┘
                                     the catalog: content indexed from files,
                                     learner state that lives only here
```

| Layer | Where | What |
| --- | --- | --- |
| Instructions | `learning` plugin, `learning` marketplace | The `/learn` and `/review` skills, plus the `concept-mapper`, `fact-checker` and `diagram-maker` subagents |
| Code | `scripts/learn/`, `apps/web/` | The pipeline CLI and the web app |
| Data | `learn/` | Concept notes, session logs, diagram assets, the event log and its derived caches |
| Assets | `tools/manimkc/` | A separate repo, wired in as a submodule, that renders narrated animation videos |
| Assets | `tools/tldrawkc/` | A separate repo, wired in as a submodule, that draws teaching diagrams on a tldraw canvas and exports SVG into `learn/assets/` |

The instruction layer lives at `~/.quiver/plugins/learning/learning` so the
skills work from any project, not just this one. Both skills open by running
`npm run learn -- status` and stop if it fails, so invoking `/learn` where the
pipeline does not exist says so rather than improvising a session that records
nothing. A local copy under `.claude/` would shadow the plugin and drift, so
there is none.

## The layout

Four top-level homes for code, and the rule that tells them apart: `apps/` is
what gets deployed, `packages/` is what several things import, `services/` is
what owns a connection or a command surface, and `tools/` is what belongs to
another repo.

| Directory | What lives there | npm workspace |
| --- | --- | --- |
| `apps/web/` | The Next.js app, its `public/`, `next.config.ts`, `vercel.json` | `@self-learn/web` |
| `packages/content/`, `packages/schema/`, `packages/blob/` | The content reader, the table shapes and the blob store | yes |
| `services/catalog/` | The connection, the migrations, the indexers, the `catalog` and `learn` CLIs | yes |
| `scripts/learn/` | The pipeline's pure maths, and the `npm run learn` entry point | no |
| `content/`, `learn/` | Authored data and the knowledge base. Files, not code. | no |
| `tools/manimkc/`, `tools/tldrawkc/` | Git submodules with their own repos, lockfiles and toolchains | no, deliberately |

`tools/` is outside the workspaces list on purpose: listing it would make
`npm ci` at the root try to install two trees this repo does not own.

`apps/web/` is the web app. Nothing under it knows the CLI exists.

| Directory | Owns |
| --- | --- |
| `apps/web/src/app/` | Routes, the root layout and metadata, and the two agent API handlers |
| `apps/web/src/components/` | Every React component: the shell (`AppShell` and `shell/`), the redesign's primitives (`ui/`), checklists, recaps, the concept graph |
| `apps/web/src/lib/` | `learner-context.tsx` (the provider), `learner-store.ts` (the pool and the reads), `learner-api.ts` (the shared route guard), `asset-files.ts` (an asset row to its bytes, safely: the blob store first, then a file on disk), `blob-store.ts` (the store the routes read), `asset-posters.ts` (a stored poster, or a frame out of a video, cached and bounded), `asset-library.ts` (the library's reads of the content half), `library.ts` (what the library shows and how it links), `transcript.ts` (a sidecar to cues, defensively), `storage.ts` (the pure reducers), `progress.ts`, `curriculum.ts`, `types.ts`, `theme-cookie.ts` |
| `apps/web/src/lib/agent/` | `providers.ts` (the provider cascade), `prompt.ts`, `objectives.ts`, `summary.ts`, `lookup.ts` |
| `apps/web/src/lib/kb/` | `load.ts` and `types.ts`: the concept graph as the hub reads it, straight from the catalog |
| `apps/web/src/data/source.ts` | The content seam's composition root: `contentSource()`, one selected source per request, files unless a type resolves to the database |
| `apps/web/src/data/courses/index.ts` | Server-only `getCourses()` and the course lookups every page calls |
| `apps/web/src/data/content.ts` | Server-only `getTags()`: the cross-course themes |
| `apps/web/src/data/topics.ts` | Server-only `getTopics()`: the shared vocabulary, and the maps and picker options the studio builds from it |

`packages/` and `services/` are npm workspaces, Node-only, with their own
tsconfigs.

| Directory | Owns |
| --- | --- |
| `packages/content/` | The reader for `content/`: `loadCourses`, `loadTopics`, `loadTags`, the `Course` types, and the reader seam (`ContentSource`, `fileSource`, `selectSource`) |
| `packages/schema/` | Every table shape, and the row types inferred from them |
| `packages/blob/` | The `BlobStore` interface, the `<owner_id>/<sha256>.<ext>` key scheme, the `fs` adapter and the conformance suite any later adapter must pass ([README](packages/blob/README.md)) |
| `services/catalog/` | The connection, the migrations, the indexers and the `catalog` CLI |
| `content/` | Authored data: the topic vocabulary, the theme tags and the course YAML |

`scripts/learn/` is what is left of the pipeline once its state moved into
Postgres: the maths, and the published entry point.

| Module | Owns |
| --- | --- |
| `cli.mjs` | A shim. Spawns `services/catalog/src/learn/cli.ts`, which is the command. It stays because `npm run learn` and the two skills name this path. |
| `lib/bkt.mjs` | Bayesian Knowledge Tracing: the belief update, information gain, propagation |
| `lib/graph.mjs` | The concept DAG: topological sort, cycles, ancestors, frontier, plan path |
| `lib/schedule.mjs` | SM-2 spaced repetition |
| `lib/markdown.mjs` | Frontmatter, wikilinks and `check` blocks, hand-rolled so no YAML parser is needed |
| `lib/render.mjs` | The mermaid map, and `buildIndex` for `learn index --json` |
| `lib/session-log.mjs` | Obsidian callout rendering for the live session log |

These are pure: data in, data out, no filesystem and no connection. They keep
their own conformance tests and are imported by the TypeScript CLI rather than
rewritten, because a second implementation of a Bayesian update is a second
thing to keep correct. `graph` imports `bkt`; `render` imports `bkt` and
`graph`; nothing else imports anything.

`lib/paths.mjs` and `lib/store.mjs` are gone. The file half of `store.mjs` is
`services/catalog/src/learn/files.ts`, its state half is
`services/catalog/src/state/`, and `paths.mjs` is
`services/catalog/src/learn/paths.ts` with the four state-file constants
removed.

| Module | Owns |
| --- | --- |
| `services/catalog/src/learn/cli.ts` | Dispatch and presentation for all 17 commands (`init`, `status`, `concept`, `check`, `probe`, `observe`, `frontier`, `plan`, `teach`, `review`, `session`, `void`, `model`, `map`, `index`, `doctor`, `help`) |
| `services/catalog/src/learn/files.ts` | Concept notes and session logs: the scanning rules that make an id a filename |
| `services/catalog/src/learn/paths.ts` | Every path under `learn/`, and the `LEARN_ROOT` override the tests use |
| `services/catalog/src/learn/replay.ts` | Rebuilding the schedule from the event log |

`packages/` and `services/` are npm workspaces, added for the catalog.
`apps/web/` imports `packages/content` for the course files and
`services/catalog/src/state/` for the learner state, the concept graph and the
assets, and nothing else from either: it is a reader of the content files and a
client of the store, never of the database directly.

| Workspace | Owns |
| --- | --- |
| `packages/content/` | `loadCourses`, `loadTopics`, `loadTags`, and the content types; `ContentSource`, the async interface every reader holds, with `fileSource(root)` over those parsers and `selectSource` choosing files or the database per type. Reads files, connects to nothing: the database implementation, `dbSource`, is the catalog's. |
| `packages/schema/` | The Drizzle table definitions and the row types inferred from them. Connects to nothing. |
| `packages/blob/` | `BlobStore`, `key()` and `fsStore()`: bytes under `$SELF_LEARN_HOME/blobs`, outside the repo. Imports nothing but Node. Nothing uses it yet; the catalog's upload command is next. |
| `services/catalog/` | `db.ts` (the pool), `migrations.ts`, `drizzle/` (generated SQL), `cli.ts`, `src/state/` (the learner store) and `src/learn/` (the `learn` CLI) |

`packages/schema`, `packages/content` and `packages/blob` are the bottom of
that stack: the first imports `drizzle-orm`, the second `yaml`, the third only
Node's own modules, and none imports anything else of ours.
`services/catalog` imports the first two, owns the only connection string in the
repo, and is the only thing that talks to Postgres. The design and the
entity diagrams are in [services/catalog/SCHEMA.md](services/catalog/SCHEMA.md).

## The web app: routes

Twelve pages, a 404, and the API handlers below. Pages are server components;
the interactive parts opt into the client one component at a time. The app
is mid-redesign: [docs/design/IMPLEMENTATION.md](docs/design/IMPLEMENTATION.md)
says which pages are on the new design and which phase replaces the rest.

| Route | File | What it renders |
| --- | --- | --- |
| `/` | `page.tsx` | Today: the next concept on the frontier, the first reviews due, recent activity by sitting, the target, the streak week, the courses in progress |
| `/courses` | `courses/page.tsx` | Every course as a card: search, filter chips by theme, progress, the next topic |
| `/review` | `review/page.tsx` | The review session in focus mode: the due cards one at a time, the four ratings with their intervals, a close screen. `?concept=<slug>` puts that concept first |
| `/settings` | `settings/page.tsx` | The daily target, streak leeway, theme, tutor style and motion, each saved on change; the BKT priors and provider order read-only; export and reset |
| `/learn` | `learn/page.tsx` | The Learn index: every concept in a table with search and mastery filters, and the neighbourhood (or course) graph of the selected row |
| `/learn/[concept]` | `learn/[concept]/page.tsx` | The concept workspace: the note and its sources, the concept tutor, mastery with its history, checks, assets and the neighbourhood graph. `?ask=` prefills the tutor's input |
| `/learn/[concept]/session` | `learn/[concept]/session/page.tsx` | Session focus mode: probe, teach (the note's prose and its diagram or video), check, close. Every graded answer is evidence through `POST /api/learner/observe`; the close screen shows what moved and what got scheduled. `?mode=check` asks the note's checks only |
| `/library` | `library/page.tsx` | Every indexed asset as a card grid: text search (`?q=`), kind and course chips, a newest or title sort, the concept each card explains |
| `/library/[id]` | `library/[id]/page.tsx` | One asset (a player with chapters and transcript, a diagram, a file's words, or a link) with Mark watched, the concepts it explains, related assets and its derivations |
| `/courses/[slug]` | `courses/[slug]/page.tsx` | The course path: one unit card per module with a node per topic, coloured by the mastery of the concepts whose notes name it (or by the tick when none does), one active node with Continue, and a rail with the course header, the module list and the current module's assets. Each node opens its note, recap, tick and tutor chat; each unit its resources |
| `/courses/[slug]/[module]` | `courses/[slug]/[module]/page.tsx` | A 307 to `/courses/[slug]#<module-slug>`: the module page folded into the path as a unit |
| `/courses/[slug]/[module]/session` | `.../session/page.tsx` | The agent chat for one topic, hosted by `AgentSession` |
| not found | `not-found.tsx` | The 404 |
| `POST /api/agent/chat` | `api/agent/chat/route.ts` | One tutoring turn, for a course topic or, with `conceptSlug`, for one concept note |
| `POST /api/agent/session` | `api/agent/session/route.ts` | One multiple-choice question for a session step, written by the tutor model as JSON and refused if it is not; writes nothing |
| `GET /api/concepts/[slug]` | `api/concepts/[slug]/route.ts` | Everything the concept workspace shows about one concept, as JSON |
| `POST /api/agent/summarize` | `api/agent/summarize/route.ts` | A transcript condensed into a recap |
| `GET /api/review/due` | `api/review/due/route.ts` | The due cards as the review page renders them (`?concept=` first), with the next due instant |
| `POST /api/review/grade` | `api/review/grade/route.ts` | One rating (0 Again to 3 Easy) recorded as `learn review grade` records it |
| `GET /api/assets/[id]/file` | `api/assets/[id]/file/route.ts` | The bytes of one indexed asset: a video, a diagram, a transcript |
| `GET /api/assets/[id]/poster` | `api/assets/[id]/poster/route.ts` | One still frame from a video asset, as a JPEG |
| `GET /api/assets/[id]/status` | `api/assets/[id]/status/route.ts` | Why the file or poster route would refuse an asset, as a code, without sending it |
| `GET /api/learner/today` | `api/learner/today/route.ts` | The Today dashboard as JSON, the same `TodayModel` the page renders; degrades to `reachable: false` |
| `GET /api/learner/export` | `api/learner/export/route.ts` | The learner snapshot, every preference row and the whole event log as a JSON download; a 503 when the database is down |
| `POST /api/learner/watched` | `api/learner/watched/route.ts` | Append a `watched` event for one asset: study for the streak, never evidence |
| `POST /api/learner/observe` | `api/learner/observe/route.ts` | One graded session answer recorded as `learn observe` records it (`recordObservation`): the event, the mastery with propagation, the card. The first answer opens the session |
| `POST /api/learner/session/close` | `api/learner/session/close/route.ts` | Close a session: one `session-close` event and the row to `closed`, once |

The asset route is the one place the app reads a file the deployment does not
contain. A video sits under manimkc's data root and a diagram under
`learn/assets/`, so neither is servable by Next, and the URL carries an asset
id rather than a path: the id is a primary key, the row's `path` is joined onto
a root chosen by the row's own `source_repo`, and the result is proved to be
inside that root before and after symlinks are resolved. That file branch is
off unless `ASSET_FILES_ENABLED` is set, the shape decision D11 in
[docs/TLDRAWKC-INTEGRATION.md](docs/TLDRAWKC-INTEGRATION.md) uses for the
studio, because production has none of these files. The reasoning for each
header it sets is in `apps/web/src/lib/asset-files.ts`.

A row that names a `blob_key` never reaches that branch: `resolveAsset` serves
it from the blob store first ([docs/CONTENT-MIGRATION.md](docs/CONTENT-MIGRATION.md),
Track E), whatever the switch says. A store that signs URLs gets a 302 to one,
good for an hour and never cached, so a cloud store's bytes never stream
through a function; the laptop's `fs` store signs nothing, so the route streams
it with the same Range answers. A `pending` blob, or one the store has lost, is
a 404 `not-uploaded`, never a quiet fall back to a file that may have been
re-rendered since. `catalog asset upload` is what fills the store and sets the
keys, and `catalog blob audit` is what checks the two agree.

After the blob store comes the row: once the database owns notes, session logs
or diagrams, a `note`, `session` or `diagram_source` asset is served from its
row (the note as its row renders it, the log as its entries concatenated, the
`.tldr` as its canonical document), also whatever the switch says, since the
file under `learn/` is at best the export as of the flip.

The poster route asks for the stored poster first: `catalog asset upload` cuts
one per video on the laptop, with the recipe in
`services/catalog/src/poster/recipe.ts`, and records it as a `poster` asset
derived from the video, served like any blob with its sha256 as the tag. For a
video with none it is the file resolver's second reader, on the same gate, and
it resolves nothing itself: it hands the id to `resolveAssetFile` and refuses
anything that does not come back a video. manimkc writes no thumbnail, so
without a stored one the frame is extracted here, fifteen seconds
in rather than at the start, because frame 0 of a narrated render is a fade-in
and three seconds in is a title card the card already prints as text. One
ffmpeg per video, never per request: the result is cached under the system temp
root, outside the repository where no git operation can reach it, bounded by
bytes and by count and written through a rename so a half-made poster cannot be
served. A machine with no ffmpeg is an ordinary 503 that names the variable to
set, and the card keeps the placeholder it already had. A video ffmpeg finds
no frame in is recorded, never inferred: only when every offset exits cleanly
with nothing does a `<key>.fail` marker go beside where the poster would be,
written through the same rename, pruned under the same bounds and believed for
an hour, and only by the ffmpeg binary that wrote it (its path, size and mtime
are in the marker), so fixing or replacing ffmpeg clears every verdict at once. A timeout, a spawn error or a killed process records nothing, so an
empty cache reads as "not made yet" and a retry, never as a broken video.
`apps/web/src/lib/asset-posters.ts` carries the frame, format, cache and
concurrency reasoning.

The session route renders on demand, like every page: it used to declare
`generateStaticParams()` over every course and module pair, and that went when
the course list became a per-request read (the root layout already made every
page dynamic, so nothing was being prerendered from it).

**Today** reads everything in one pass through `apps/web/src/lib/today.ts`: the
knowledge base, the event log, the preferences, the due queue and the snapshot,
through `learner-store`'s pool, and hands them to the pure
`apps/web/src/lib/today-core.ts`. It runs `computeHabit` over the same rows
rather than calling `loadHabit` again, so the page and the top bar agree. The
check count beside each due review comes from the concept's note, found by the
path `catalog import` recorded (`notePaths` in the store) rather than a path the
app builds under `learn/` (layering rule 6); a note it cannot read counts as a
plain recall.

**The shell.** `AppShell` is a server component: a 64px top bar (the
wordmark, the five destinations Today, Courses, Learn, Library and Review,
the streak and target pills, and an avatar menu holding the theme toggle,
Settings and, behind `STUDIO_ENABLED`, Studio), the store banner, the page,
and below 768px a bottom tab bar in place of the destinations. The streak
and target come from `@/lib/habit`, which the root layout reads on every
request next to the learner snapshot and passes down as a prop, degrading
to zeros when the database is down. A page picks its width with
`data-layout` on its root element (`app` for the redesigned pages, `focus`
for focus mode, `full` for the studio canvas, none for the old reading
measure), which the shell reads with `has-*` so nothing crosses the client
boundary to say it. The table of values is in `AppShell.tsx` and in
IMPLEMENTATION.md.

The two library routes are that route's reader, and reach the catalog through
`apps/web/src/lib/asset-library.ts`, which is `learner-store.ts`'s shape for the
content half: `connection()` before every read, an unreachable database
degrading to empty with a `reachable` flag beside it, and one pool for the
process, borrowed from `learner-store` rather than opened a second time.

**The default view is 135 of 206 rows, and the page says so.** Sixty-nine
assets are a caption track, a transcript and a chapter list written beside each
of the thirty videos, and two more are the `.tldr` each diagram was exported
from; shown flat they would sort above the videos and bury them. The rule is a
set of kinds in `apps/web/src/lib/library.ts` — not "anything `asset_derivation`
derives", which would keep the sidecars and drop the two drawings, since a video
is the *source* of its companions and an SVG is *derived* from its canvas. Every
companion kind keeps its chip, its count, its `?kind=` view and its place on the
page of what it belongs to.

**Search, concepts and watching.** `?q=` is searched on the server, over every
row's title, filename and URL and over the words of each note and transcript,
read through `readAssetText` with its switch and byte cap; a line inside a
transcript finds the transcript's video through `derivationSources`. The limits
are in [docs/design/IMPLEMENTATION.md](docs/design/IMPLEMENTATION.md). The
concept chip on a card and the asset page's Explains card come from
`conceptsForAssets`, the reverse of `assetsForConcept`, joined to the knowledge
base for the mastery dot. Mark watched appends a `watched` event through
`POST /api/learner/watched`: it counts as a study day for the streak and is
never evidence, since both replays read only `observation` and `review`.

**Both pages treat unavailable files as a state.** `ASSET_FILES_ENABLED` unset,
manimkc never indexed here, and a manimkc index older than the run that recorded
its data root are three different answers with three different fixes, and the
first is what a fresh clone and production both look like. Nothing renders a
dead player or a broken image in any of them. Each is decided per row, through
the route's own resolver: an asset in the blob store or a row the database owns
shows whatever the switch says, and only a legacy file waits on it.

`apps/web/src/lib/transcript.ts` parses the sidecars, defensively: a malformed
one costs the transcript panel and leaves the video playing. Its cues are read
on the server and passed to `TranscriptPanel` as props, so there is no loading
state and no second round trip for text the render already had a request in
which to read.

**A failed asset says why, and the server decides it when it can.** A browser's
`onError` carries no status and no body, so every refusal the file and poster
routes make carries a machine-readable `code` (`@/lib/asset-problems`), and
`/api/assets/[id]/status` reports that code in a few bytes of JSON without
reading the file or starting ffmpeg. The detail page decides everything it can
before render with `readFileProblems`: the switch, the manimkc index, a file
already gone, an embed whose name no row has. Those render the failure panel on
the server with no probe. Only a failure nobody could predict (a card's
thumbnail, a file that is served but will not decode) costs the browser one
probe, after `onError` and never before. Every surface renders the same
`WidgetFailure` panel, the failure state of the Widget placeholder in
[docs/design/DESIGN.md](docs/design/DESIGN.md). `NoteProse` stays a server
component: only `EmbedImage`, the `<img>` inside an embed's figure, is a client
island, and a note with no pictures never renders it.

**A page's dynamic segment is not decoded.** `/library/[id]` is handed
`"link%3Acs3216-m3-r1"`, not `"link:cs3216-m3-r1"`, so it calls `decodeAssetId`
before the lookup. Route handlers differ — `/api/assets/[id]/file` is given a
decoded id — and nothing about the types says so, so copying one into the other
is a 404 on every asset that builds without a word.

## Learner state

The learner's ticks, notes, recaps and preferences are rows in Postgres, and
`services/catalog/src/state/` is the only module that writes them. There is
still no account: one `learner` row, id `local`, created on first use.

```
  server component ──► loadLearnerSnapshot() ──► readLearnerSnapshot() ──► progress
        │                (apps/web/src/lib/learner-store.ts)   (the store)          recap
        │  initialState                                                    preference
        ▼
  LearnerProvider ──► optimistic reducer ──► POST /api/learner/* ──► the store
   (client)            (apps/web/src/lib/storage.ts)
```

The root layout reads the snapshot and hands it to `LearnerProvider` as
`initialState`, which is why every page is dynamic: a provider seeded with
zeros and corrected after hydration is a progress bar that visibly jumps.
Nothing reads the database at build time — every read calls `connection()`
first — so `npm run build` succeeds with no database at all, which Vercel needs
until the cloud one exists.

`apps/web/src/lib/storage.ts` still owns the pure reducers (`toggleTopic`, `setNote`,
`recordKnowledge`, `resetCourseProgress`, ...). They are the optimistic half of
every mutation: the reducer runs at the call site so a checkbox ticks
immediately, and its output is also what the request body is built from, so
what the UI shows and what the server is told cannot disagree. `loadState`,
`saveState` and `migrateState` are gone with localStorage.

| Route | Writes |
| --- | --- |
| `POST /api/learner/progress` | A tick, on or off |
| `POST /api/learner/note` | The scratch note on one curriculum item |
| `POST /api/learner/reset` | Clears a course's ticks and notes, bumps the epoch |
| `POST /api/learner/recap` | Writes, replaces or clears one recap |
| `POST /api/learner/preference` | Theme, last visited, the learner's own links, and Settings' `dailyTarget`, `dailyLeeway`, `tutorStyle` and `reducedMotion` |
| `POST /api/learner/import` | The one-time carry-over of a browser's old document |
| `POST /api/review/grade` | One review grade: a `review` event, the card, the mastery entry |

Every one of them is `handler()` from `apps/web/src/lib/learner-api.ts`: same-origin
through the existing `agent/guard.ts` helpers, a rate limit, a bounded body,
and validation. `/api/learner/preference` writes an allow-list of keys rather
than any key, because an unauthenticated open jsonb store is not something
"the learner owns their own row" excuses.

`/api/review/grade` is the one route here that writes evidence, and it writes
it by calling `gradeReview` in `services/catalog/src/state/review.ts`, the
function `learn review grade` itself calls since phase 1e: the event first, then
the card and the mastery entry, under the learner lock. The page sends the
button (0 Again, 1 Hard, 2 Good, 3 Easy); `REVIEW_RATINGS` beside it maps that
onto SM-2's 1, 3, 4 and 5, so the log holds the same scale whichever door the
grade came through, and `review rebuild` replays both. The page reads its queue
through `reviewQueue` in the same module, which also returns the interval each
button would give, computed by the scheduler a grade runs.

Recaps are clamped by `KNOWLEDGE_LIMITS`, twice and from one definition in
`@self-learn/schema/shared`: as CHECK constraints, so nothing can put an
unbounded summary in the column whatever wrote it, and in application code, so
a long recap is trimmed and saved rather than refused with a 23514 the learner
reads as "save failed".

| Limit | Value | Applies to |
| --- | --- | --- |
| `summaryChars` | 1200 | The recap summary |
| `listItems` | 8 | Key points, misconceptions, open questions |
| `itemChars` | 300 | Each item in those lists |

**Failure is visible.** A read that cannot reach the database yields an empty
snapshot and a `reachable: false` beside it, because a page showing zero
progress and a page that could not ask look identical to a learner and are not
the same thing. A write that fails leaves the optimistic value in place and
raises a banner in `AppShell`: someone who has just typed three paragraphs into
a note should not watch them vanish, and the text is still there to copy.

**Two things are not in the database.** The theme is a cookie the root layout
reads while composing the document, because it has to be known before the first
byte or a dark-mode reload flashes white; the `preference` row is the durable
copy and the fallback when the cookie is missing. And on first mount the
provider checks for the old `self-learn:v1` localStorage key, posts it to
`/api/learner/import`, and removes it on success. The merge rules are in the
store rather than the route: the database wins, and a curriculum item id the
catalog no longer has is skipped and counted rather than costing the learner
the rest of the document.

## The course data model

Ten courses, one YAML file each under `content/courses/`, read by
`loadCourses()` in `packages/content`. A course holds modules, a module holds
topics, a topic holds subtopics and the module holds curated resources. The
same function is what `catalog import` parses courses with, so the page and the
row cannot disagree about what a file means; before this there were TypeScript
literals on one side, a private `YamlCourse` interface on the other, and a
parity test that could only notice drift after it happened.

`apps/web/src/data/courses/index.ts` is the app's view of that: `import "server-only"`,
`getCourses()` (async, wrapped in React's `cache()` so a render reads once),
and the lookups pages call: `getCourse`, `getModule`, `findTopic`,
`getCourseTopicIds`, `getRelatedCourses`, `totalTopicCount`. The ones that need
every course take the list as an argument, so a page reads it once and the
helpers under `lib/` stay synchronous. `apps/web/src/data/content.ts`
(`getTags()`) and `apps/web/src/data/topics.ts` (`getTopics()`) are the same
shape over the themes and the vocabulary.

**Through the reader seam.** None of the three calls a parser. They ask
`contentSource()` in `apps/web/src/data/source.ts`, which hands back
`selectSource` over `fileSource(REPO_ROOT)` and, for any type that resolves to
it, the catalog's `dbSource`. Every type resolves to files today; the plan in
[docs/CONTENT-MIGRATION.md](docs/CONTENT-MIGRATION.md) moves them into
Postgres one track at a time, and this is the one place in the app that
changes when it does. The file source keeps its last parse until a file it
read changes, so a per-request read costs a `stat` per file rather than a YAML
parse, and a course file edited while the server runs shows on the next
request.

**Server only, and enforced.** `server-only` makes a `"use client"` module that
reaches either of them fail the build with the import chain printed, rather
than shipping a YAML parser and every course file to the browser. So client
components take what they need as props: the course page resolves the course,
each topic's mastery and each module's assets and hands them to `CoursePath`;
the session page resolves the course, module and topic for `AgentSession`; the
Courses page projects each course into a `CourseSummary` for its card grid. The
arithmetic those components still do lives in `apps/web/src/lib/curriculum.ts` and
`apps/web/src/lib/progress.ts`, which are pure functions over a course the caller
already holds.

Each course carries an `inferred` flag. `true` means the syllabus was
reconstructed from the course announcement and the standard treatment of the
subject rather than read off an official document. Three of the ten are
inferred, and `packages/content/test/courses.test.ts` pins exactly which. A
course path with `inferred` says so under its header, and the agent prompt is
told to flag uncertainty for those courses.

**A course topic's concepts come from the concept notes, not from
`content/topics.yaml`.** That file's `maps.courses` names modules, so it can
say which concepts a module is about but not which of the module's topics each
belongs to. The per-topic link is a note's `topics:` frontmatter, which
`catalog import` writes to `concept_curriculum_item` and `readKnowledgeBase`
returns as `KbConcept.topics`. The course path reads that link, orders a
topic's concepts by the module topic's `maps.concepts`, and falls back to that
list for a unit's Guidebook. The arithmetic (the bucket, the active node, the
lock rule) is `apps/web/src/lib/course-path.ts`.

Courses also carry an `order:`, which is the order the Courses page renders
them in. It is authored because the shortlist is curated: sorting ten
files by name gives a different sequence and nothing would say so.

## The agent chat API

Both routes run on the Node runtime and share `apps/web/src/lib/agent/providers.ts`,
which is the whole networking layer. Three OpenAI-compatible providers are
tried in a fixed order, and a provider is only in the list when its key is set:

| Order | Provider | Default model | Key |
| --- | --- | --- | --- |
| 1 | NVIDIA NIM | `meta/llama-3.1-8b-instruct` | `NVIDIA_API_KEY` |
| 2 | Google Gemini | `gemini-2.5-flash` | `GEMINI_API_KEY` |
| 3 | OpenRouter | `openrouter/free` | `OPENROUTER_API_KEY` |

`completeWithFallback` walks that list and moves on from a rate limit, a 5xx
or an empty reply, collecting each failure so the caller can report what was
tried. No key at all returns `MISSING_API_KEY`, which the chat route turns
into a 503; every provider failing returns `ALL_PROVIDERS_FAILED` and a 502.

The chat route has two tutors. The topic tutor (the course session) builds its
prompt from course data plus whatever recap the browser sent along. The
concept tutor (the workspace, `conceptSlug` in the body) builds it from the
concept note, its neighbours and the learner's mastery and recent answers,
all read on the server through `lib/concept-workspace.ts`, plus the
`tutorStyle` preference from Settings (`readTutorStyle` in `lib/settings.ts`,
which also shapes the explanation of a session question), and asks the model
to cite a numbered source list as `[n]`; the request and response shapes are
in [docs/design/IMPLEMENTATION.md](docs/design/IMPLEMENTATION.md#the-concept-tutor-api).

For the topic tutor, `objectives.ts` derives the session's success criteria
deterministically, `prompt.ts` builds the system prompt around them, and
`summary.ts` parses the model's recap back into the same `KnowledgeInput`
shape that `storage.ts` persists. The chat route re-clamps the incoming recap
with `KNOWLEDGE_LIMITS` before it reaches the prompt, because that payload
came from a browser.

## The learn CLI

`services/catalog/src/learn/cli.ts` parses with `node:util`'s `parseArgs` in
strict mode, dispatches on the first positional, and runs `ensureDirs()` before
every command. Every command takes `--json`, and the five shapes the `/learn`
and `/review` skills parse are documented in
[learn/README.md](learn/README.md#the-json-shapes) and pinned by golden tests.
Anything that carries evidence appends to `event` first and updates the
projections after.

The connection is lazy. `concept add`, `check add` and `session log` touch only
files, so they work with the database down; `status` — which both skills open
with and stop on — does not, which is the intended gate. A session that cannot
record anything should not start.

`learn observe` is the step that matters: it records one answer, applies the
Bayesian update, propagates the evidence to prerequisites, schedules the
concept for review, and (with `--session` and `--question`) writes the whole
exchange into the session log as Obsidian callouts while the session is still
running.

## The knowledge base on disk

```
learn/
  concepts/<domain>/<id>.md    atomic concept notes, the durable knowledge
  sessions/<id>.md             one log per session, appended live
  assets/<id>.tldr             the editable canvas a diagram was drawn on
  assets/<id>.svg              that canvas exported, embedded in the session log
  map.md                       the mermaid knowledge map       (derived)
```

`learn/state/` was retired in bundle 5. `events.jsonl`, `model.json` and
`reviews.json` are the `event`, `mastery` and `review` tables; `index.json` is
a query. The mapping is in
[services/catalog/LEARN.md](services/catalog/LEARN.md).

Today that holds 32 concepts across four domains (algorithms 21, transformers
7, agents 2, foundations 2) and three session logs.

The folder is presentation only: a concept's id stays the bare slug, because
ids appear in every `requires:` edge, every wikilink, and the `concept_slug`
column of `event`, `mastery` and `review`. Moving a note between domains would
otherwise orphan its whole history — which, now that the history is a foreign
key, would be a constraint error rather than a silent loss. The domain is read
back from the path rather than stored in frontmatter, so the two can never
disagree, and nesting is one level deep.

`event` is the database. `mastery`, `review` and `map.md` are projections that
`learn model --rebuild`, `learn review rebuild` and `learn map` re-derive from
it, which is what makes changing a BKT parameter safe. The schedule became
rebuildable in bundle 5; before that, review grades were logged and nothing
replayed them, so deleting `reviews.json` lost every scheduled review
permanently.

`assets/` is the one folder the CLI neither writes nor reads. Diagrams have
always been written there by the `diagram-maker` subagent at a path it chose,
and `tools/tldrawkc/` keeps that behaviour: it writes the pair and the session log
embeds the SVG by name. The `.tldr` is committed beside the `.svg` so the next
session can open the canvas and extend it instead of redrawing. An exported
SVG is self-contained, which means the two fonts it uses are inlined as
base64 and a small diagram lands around 440 kB.

A `.tldr` also carries what it is about, in `meta.tldrawkc` on its tldraw
document record: the topic slug, the concepts, a title and what prompted it.
That is what the catalog files a diagram by, and `tldrawkc export --svg` copies
the title and topic onto the SVG so the export can say what it is when it turns
up on its own. Stamp one with `npm run canvas -- meta set <file> --topic <slug>`,
which needs no browser.

## The numbers

Every constant below is defined once, in the file named.

| Constant | Value | Where |
| --- | --- | --- |
| `pL0` prior | 0.25 | `lib/bkt.mjs` `DEFAULT_PARAMS` |
| `pT` transit | 0.15 | same |
| `pG` guess | 0.2 | same |
| `pS` slip | 0.1 | same |
| `MASTERY_THRESHOLD` | 0.95 | `lib/bkt.mjs` |
| `READY_THRESHOLD` | 0.75 | `lib/bkt.mjs` |
| `GAP_THRESHOLD` | 0.4 | `lib/bkt.mjs` |
| `PROPAGATION_DECAY` | 0.4 per hop | `lib/bkt.mjs` |
| `PROPAGATION_CEILING` | 0.9 | `lib/bkt.mjs` |
| `DEFAULT_EASE` | 2.5 | `lib/schedule.mjs` |
| `MIN_EASE` | 1.3 | `lib/schedule.mjs` |
| `PASS_GRADE` | 3 of 0 to 5 | `lib/schedule.mjs` |
| `LEECH_THRESHOLD` | 4 lapses | `lib/schedule.mjs` |
| `MAX_INTERVAL_DAYS` | 36500 | `lib/schedule.mjs` |

Two of those pairs carry a decision rather than a tuning knob.

Mastery and readiness are deliberately different thresholds. "Have they
finished with this?" needs 0.95. "Can they follow an explanation resting on
this?" needs 0.75, and `frontier()` gates on the second, because gating
teaching on mastery meant answering every prerequisite to near-certainty
before the system would teach the one thing you came for.

The propagation ceiling sits below the mastery threshold on purpose. Indirect
evidence can raise confidence to just short of mastered and no further, so a
long correct streak high in the graph can never mark a concept mastered that
the learner was never actually asked about.

SM-2 intervals go 1 day, then 6, then previous times ease, fuzzed by about 5%
once the interval reaches a week so same-day clusters spread out. A failed
item restarts the interval sequence and leaves its E-Factor alone, which is
the detail in the published specification that is easiest to get wrong.

## How the layers talk

One direction for content, one door for state.

```
   /learn   /review                      the skills call the CLI, never the files
        │
        │  npm run learn -- <command>
        ▼
   scripts/learn/cli.mjs ──spawns──► services/catalog/src/learn/cli.ts
                                          │                    │
                              reads/writes│                    │through
                                          ▼                    ▼
                            learn/concepts   learn/sessions   services/catalog/src/state/
                            learn/map.md                              │
                                                                      ▼
                                                        event · mastery · review
                                                        progress · recap · preference
                                                                      ▲
   apps/web/src/app  ──► apps/web/src/lib/learner-store.ts ──► @self-learn/catalog/state ┘
       │              (the pool, the degradation)
       └──► /api/learner/* ──► apps/web/src/lib/learner-api.ts ──► the same store
```

Both halves reach the same tables through the same module. That is the change
bundle 5 made: before it, the CLI owned files under `learn/state/` and the web
app owned a localStorage document, and the two models of the same learner never
spoke. `apps/web/src/lib/kb/load.ts` is still the only place in the app that
reads the concept graph, and it is a query now rather than a `readFileSync` of a snapshot
— so a study session shows up on `/learn` immediately instead of at the next
deploy.

`ConceptGraph` renders the DAG as plain SVG with a longest-path layering. No
graph library, and server-safe, so the whole graph ships as static markup.

## Metadata and assets

`apps/web/src/app/icon.png` and `apps/web/src/app/apple-icon.png` use the Next
file conventions, so the favicon and the touch icon need no markup.

The social card does not. `apps/web/public/opengraph-image.png` is declared by
hand in `apps/web/src/app/layout.tsx` because under Turbopack the
`app/opengraph-image.png` convention ignores the documented
`opengraph-image.alt.txt` sidecar, and the card would ship with no alt text.

`resolveSiteUrl()` in the same file computes `metadataBase`: it prefers
`NEXT_PUBLIC_SITE_URL`, falls back to Vercel's injected
`VERCEL_PROJECT_PRODUCTION_URL`, adds `https://` when the value has no scheme,
and falls back to `http://localhost:3000` on anything unparseable. It warns
instead of throwing, because it runs while the root layout loads and a bad
value should cost a link preview rather than the whole app.

## Testing

`npm test` runs vitest over `apps/**/*.test.ts`, `scripts/**/*.test.mjs`,
`services/**/*.test.ts` and `packages/**/*.test.ts`, in the `node` environment,
with `@` aliased to `apps/web/src`. One config at the root covers every
workspace, so `npm test` from the repo root is the whole suite.

| File | Covers |
| --- | --- |
| `apps/web/src/lib/storage.test.ts` | Clamping and every pure state reducer |
| `apps/web/src/lib/progress.test.ts` | Counting completed topics per module and course |
| `apps/web/src/lib/course-path.test.ts` | The course path: a topic's concepts and its bucket, the active node, the lock rule, the labels and links |
| `apps/web/src/lib/learner-store.test.ts` | Reads degrading to empty with no database, and a write refusing to |
| `apps/web/src/app/learn/page.test.ts` | `/learn` rendering when the database is unreachable, and when it is simply empty |
| `apps/web/src/app/api/learner/routes.test.ts` | The six write routes: the origin guard, the allow-list, 400 versus 503 |
| `apps/web/src/app/api/review/routes.test.ts` | The review routes: the origin guard, the rating range, a rating landing in the log on SM-2's scale, the due list with its focus and intervals |
| `apps/web/src/lib/review-core.test.ts`, `review-queue.test.ts` | A review card's options (deterministic, the answer among them), check versus recall, and the interval and date wording |
| `services/catalog/test/review-grade.test.ts` | `gradeReview`, `reviewQueue` and the rating mapping: the grade moved out of the CLI unchanged, and a web grade replays exactly |
| `apps/web/src/lib/asset-files.test.ts` | Range arithmetic, containment, the closed content-type list. No database, so it is a gate everywhere |
| `apps/web/src/app/api/assets/asset-file.test.ts` | The asset file route end to end: a 200, a 206, a 416, the four refusals, a stale index, the production gate |
| `apps/web/src/app/api/assets/asset-unreachable.test.ts` | The three asset routes and the page's pre-render check with the catalog down: `catalog-unreachable` everywhere |
| `apps/web/src/lib/asset-problems.test.ts` | The reason table (no paths, no em dashes, a fix per fixable code) and the probe's mapping of every answer |
| `apps/web/src/components/asset-failure.test.ts`, `NoteProse.island.test.ts` | Each asset surface falling back to the shared panel with its reason, and a note without pictures rendering no client island |
| `apps/web/src/app/api/assets/asset-blob.test.ts` | The asset routes from the blob store with the file switch off: a 200, a 206, a 416, a `pending` blob and a lost object as `not-uploaded`, the legacy branch still gated, a stored poster with its 304, a stored transcript read for the page |
| `apps/web/src/app/api/assets/asset-blob-redirect.test.ts` | A store that signs URLs: the 302 carries the store's URL and no path, lives an hour, and a Range request at it returns 206 |
| `services/catalog/test/asset-blobs-0009.test.ts` | The blob readers on a database still at 0009: no blob, no poster, one warning to migrate, so the routes fall back to the file instead of answering `catalog-unreachable` |
| `services/catalog/test/asset-upload.test.ts` | `catalog asset upload` and `catalog blob audit`: every row pointed at bytes equal to its `content_hash`, a rerun that does nothing, a pending upload finished, a re-render refused, a re-index keeping its keys, and each audit finding with what `--fix` does |
| `apps/web/src/app/api/assets/asset-poster.test.ts` | The poster route, against a fake ffmpeg that counts its own runs: a hit, a second hit from cache, a 304, a non-video, no ffmpeg, the gate, and a burst of ten sharing one process |
| `apps/web/src/lib/agent/*.test.ts` | The provider cascade, the assembled prompt, recap formatting, the route guards |
| `packages/content/test/courses.test.ts` | Curriculum invariants (the shortlist, unique ids, which syllabi are inferred) and every refusal the reader makes |
| `apps/web/src/data/courses/index.test.ts` | The lookups the pages call, over whatever the reader returned |
| `services/catalog/test/state.test.ts` | The store: progress, recaps, preferences, the append-only log, replay, the import merge rules |
| `services/catalog/test/learn-cli.test.ts` | The CLI end to end, with the five `--json` shapes pinned |
| `services/catalog/test/backfill.test.ts` | The backfill's assertion, its idempotency, and the synthesis it does and does not do |
| `services/catalog/test/*.test.ts` | The schema's constraints, the indexers, the writer, the read commands |
| `scripts/learn/lib/*.test.mjs` | BKT, the concept DAG, SM-2 conformance, frontmatter round-trips |

Anything touching Postgres creates and drops its own scratch database and skips
itself, with a reason, when no server is reachable. CI runs a `postgres:17`
service so they are a gate there.

Coverage is scoped to `apps/web/src/lib`, `apps/web/src/data` and
`scripts/learn` by design. Components and pages are verified by
`npm run build` and by looking at the running app, so counting their lines
would only dilute the number that matters.
The thresholds are deliberately not raised to meet the current number:
`learner-api.ts` and `learner-store.ts` are in scope and are covered by suites
that need a database, so the measured value now moves with the environment.

## The catalog

`services/catalog/` and `packages/schema/` are a derived index over the content
trees, in Postgres 17. Full reasoning in
[services/catalog/SCHEMA.md](services/catalog/SCHEMA.md); the shape of it is:

```
   content/topics.yaml ────┐
   content/courses/*.yaml ─┤
   learn/concepts/*.md ────┼──► catalog import ──► Postgres ──► catalog ls / show / path / search
   learn/sessions/*.md ────┤       (indexers)      (derived)          (agents read here)
   tldrawkc list  ─────────┤
   manimkc topics --json ──┤
   manimkc mirrors --json ─┘
```

**Everything in the content half is derived.** `topic`, `concept`,
`collection`, `curriculum_item`, `asset` and the seven link tables are rebuilt
from files in git by `npm run catalog -- import`. Drop the database and one index
run restores it exactly. Nothing is authored in Postgres, which is why the
indexers may delete: a row the source no longer produces is not history, it is a
stale row, and the whole point of the catalog is that a rendered video cannot
outlive its source without anything saying so.

**Assets are rows about files, never the files.** An `asset` row holds a path,
a size and a hash; a 13 MB video, a 450 kB SVG and the words of a note stay in
git and are read from there. What the catalog adds is the joins those files
cannot carry: which topic an asset is about, which `.tldr` an SVG came out of,
and, through `mirror`, whether the copy on Google Drive or Seafile is the same
file as the one here. A `.tldr` says which topic it is about in its own
metadata, which `tldrawkc list --json` reads back, so the filename is a
filename again.

**Mirror rows are observations, not content.** `mirror` and `index_run` are the
operational half: what an indexer saw, rather than what the trees hold. A
destination the audit could not reach keeps its old rows and its old
`checked_at`, and the run records which ones it could actually see, so a stale
count is never read as a fresh one.

**The state half is the opposite.** `learner`, `event`, `mastery`, `review`,
`progress`, `recap` and `preference` are the only copy of what a learner did.
`event` is append-only, enforced by a trigger, and `mastery` and `review` are
projections that can be rebuilt by replaying it. Bundle 5 filled them:
`npm run catalog -- backfill` moved `learn/state/` in and asserted the result,
and the web app's one-time import brings a browser's old localStorage document
over on first mount.

| Piece | Where | What |
| --- | --- | --- |
| Table shapes | `packages/schema/src/` | `content.ts`, `state.ts`, `operations.ts`. Connects to nothing. |
| Migrations | `services/catalog/drizzle/` | Generated from the schema, applied by `catalog migrate`. |
| Indexers | `services/catalog/src/index/` | One module per source, each a pure "read files, return rows" function, plus one shared writer. |
| Read commands | `services/catalog/src/commands/` | `status`, `index`, `backfill`, `ls`, `show`, `path`, `search`, all with `--json`. |
| The learner store | `services/catalog/src/state/` | The only writer of the state tables, plus the read-only content queries the web app needs (`knowledge-base.ts`, `assets.ts`). Imported by the `learn` CLI, the backfill and the web app. |

Each indexer owns an asset id namespace (`note:`, `link:`, `manimkc:`,
`diagram:`, `session:`) and a set of tables. `mirrors` is the one that owns
neither: it writes `mirror` rows against ids `manimkc` produced, and is scoped
by the destinations it declares it audited instead.

The `manimkc:` ids are the CLI's own `out/<domain>/…` strings, stored verbatim
as `asset.path` — which is also the literal key `mirrors` matches ledger
entries on, so neither side may rewrite them. **What those strings are relative
to is not the submodule.** Both commands report a top-level absolute `outRoot`,
manimkc's `$MANIMKC_HOME`, and the indexers resolve a file as `outRoot + path`.
It defaults to the submodule checkout, so with nothing configured the two are
the same directory; set it and the videos live somewhere a repo relayout cannot
delete, which is why it exists. `--manimkc-root` names the checkout to index,
never where its output landed. The run writes that `outRoot` to
`index_run.metadata`, because the path on the row resolves against nothing
without it and no consumer may go looking in `$MANIMKC_HOME` for itself; the
asset file route is the first thing to read it back. That ownership is what lets the
writer prune safely: a source may delete only rows it could have produced, so
one indexer can never remove another's. `--only` expands to include everything
downstream of what it names, because a prune cascades and a half-run index is
worse than none: it looks complete and answers with fewer rows.

### Where the tools are

Two of the indexers shell out to a submodule, and neither hard-codes where the
submodule is. `services/catalog/src/env.ts` resolves both roots the way it
resolves `DATABASE_URL`: the shell environment, then `services/catalog/.env`,
then a default that needs no configuration.

| Variable | Names | Default |
| --- | --- | --- |
| `MANIMKC_ROOT` | The manimkc checkout: where the pinned CLI runs from, and the default for `--manimkc-root`. manimkc's own CLI reads the same variable for the same thing. Not `MANIMKC_HOME`, which is where its renders land and which only ever arrives as a report's `outRoot`. | `tools/manimkc` |
| `TLDRAWKC_ROOT` | The tldrawkc checkout, whose `dist/` build reads the `.tldr` files. `npm run canvas` reads it too, so the tool and the indexer cannot end up on different builds. | `tools/tldrawkc` |
| `LEARN_ROOT` | The knowledge base's repo root, for tests. A fixture tree plus a scratch `DATABASE_URL` is what keeps a test run off the real `learn/`. | this repo |

A relative value resolves against the repo root rather than the working
directory, because a variable is set once and read by commands run from
anywhere; `--manimkc-root` is typed at a prompt and still resolves against the
cwd. All three are in
[services/catalog/.env.example](services/catalog/.env.example).

### How agents read it

The command surface is deliberately layered, and no layer returns a whole tree.
An agent runs `status` to see what exists and how fresh it is, `ls` to get
titles and counts, `show` for one entity, and then reads the file at the path
`show` gave it. `show` never returns a body: the database holds paths and
metadata, git holds the words, and keeping a second copy of every note in
Postgres would put a staler one in front of the agent.

## Layering rules

1. **`apps/web/` imports the pipeline's *store*, and nothing else of it.** The web
   app reaches learner state through `@self-learn/catalog/state`, the single
   export that workspace publishes. It does not import the `learn` CLI, the
   indexers or the migrations, and it never imports from `scripts/`. Before
   bundle 5 the two halves met at one JSON file; they now meet at one module,
   because two writers of the same tables with two ideas of what a recap may
   contain is exactly the drift a shared store prevents.
2. **`scripts/learn/lib/` imports nothing from the project.** Those six modules
   are the maths: data in, data out, no filesystem and no connection. The
   TypeScript CLI imports them; they import nothing back, which is what lets
   the web app compute the frontier with the same `frontier()` the CLI does.
3. **The CLI is the only writer of `learn/`, except `learn/assets/`.** The
   carve-out is `assets/`, where the diagram agent has always written the file
   it names directly and `tools/tldrawkc/` now writes the `.tldr` and `.svg` pair.
   Nothing in `learn/concepts/` has a second writer.
4. **`services/catalog/src/state/` is the only writer of the state tables.**
   The `learn` CLI, the backfill and the web app all go through it. It is where
   "an event first, the projections after" is enforced, and where the clamps
   live, so no caller can record evidence a different way.

   It is not *only* the state tables, and the name undersells it: it is also
   the one door out of this package, so the read-only content queries the web
   app needs live behind it too. `knowledge-base.ts` reads `concept` and its
   edges, `assets.ts` reads `asset` and the link tables. Neither writes
   anything, and the content half still has exactly one writer, which is
   `catalog import` (rule 11). Anything that would *write* content from here is
   the violation this rule is about; a query is not.
5. **A module that reads content or reaches the database says
   `import "server-only"`.** `apps/web/src/data/courses/index.ts`, `apps/web/src/data/content.ts`
   and `apps/web/src/lib/learner-store.ts` all do. Without it a `"use client"` import
   would compile — shipping a YAML parser, every course file, or a Postgres
   driver to the browser — and would only be noticed by whoever looked at a
   bundle report. With it the build fails and prints the import chain. Client
   components get resolved objects as props; pure arithmetic over a course they
   already hold lives in `apps/web/src/lib/curriculum.ts`, and pure reducers over state
   they already hold live in `apps/web/src/lib/storage.ts`.
6. **Nothing outside `src/learn/paths.ts` builds a path under `learn/`.**
   `learn/assets/` is outside the rule entirely, for the same reason as rule 3:
   the diagram agent picks `learn/assets/<concept-id>` and passes it to
   `tldrawkc`, which is a command run from the repo root.
7. **The skills never edit the knowledge base directly.** They go through
   `npm run learn -- <command>`, which is what keeps the event log complete.
8. **`src/learn/cli.ts` is the only module in the pipeline that prints.**
   Everything under `lib/` and `src/state/` takes data and returns data.
9. **`packages/schema` connects to nothing.** It defines table shapes and
   exports the types inferred from them. Its `./shared` subpath goes further
   and imports nothing at all — that is what makes the recap limits and the
   learner-state types safe in a `"use client"` module without dragging a
   Postgres driver into the browser bundle.
10. **The schema is the source of the SQL, never the other way round.** Change
    `packages/schema/src/`, then `npm run generate -w @self-learn/catalog`. A
    migration that has been applied is never edited: drizzle keys them by file
    hash.
11. **The web app never writes the *content* half.** It reads the course files
    through `packages/content`, reads `concept`, `mastery` and `review` through
    the store, and writes `progress`, `recap` and `preference`. `event`,
    `mastery` and `review` are written only through the store's own evidence
    functions, never assembled by a caller: the CLI's commands, and the two
    page-facing evidence writes, `POST /api/review/grade`, which calls the same
    `gradeReview` that `learn review grade` does, and `POST /api/learner/observe`,
    which calls the same `recordObservation` that `learn observe` does. The only
    writer of the content tables is `npm run catalog -- import`, and the only
    thing it writes from is files in git. A page that could write a derived
    table would make it a source of truth no index run could reproduce.
12. **An indexer reads files and returns rows; it never touches a connection.**
    `services/catalog/src/index/*.ts` export a pure `read(context)`, and
    `writer.ts` is the only module that issues SQL for them. That seam is why
    the indexer tests need no Postgres and the writer tests need no files.
13. **An unresolved reference is a refusal, never a skip.** A concept, module or
    video whose topic does not resolve stops the index run with the file and the
    slug named. A skipped row is an asset that is silently absent from the
    catalog, which is the exact failure the catalog exists to catch.
14. **Reads degrade, writes do not.** A page that cannot reach the database
    renders empty and says so; a mutation that cannot reach it fails and is
    shown as unsaved. An optimistic tick that silently never persisted is worse
    than an error, and the study record is the one thing in this repo with no
    second copy.
