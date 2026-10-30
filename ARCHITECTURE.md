# Architecture

Gnosia (renamed from self-learn) is
a learning environment sharing one catalog. A
Next.js app renders course roadmaps and progress; a CLI runs a Probe → Plan →
Teach → Close tutoring loop over concept notes, which are rows in the catalog;
a native macOS app reads the same catalog through a SQLite snapshot and keeps
its own writable store; and two loopback services — the sidecar and the
studio runner — give the surfaces their agent calls. Postgres remains the one
authority for content and web-side learner state: the web app, the CLI and
the services all reach it through the same store, which is the only module
that writes it.

## The shape

The instruction layer plus this repo's code, data and tool layers. The
instructions are not in this repo at all.

```
   learning plugin                    this repo
   (installed globally)
     /learn   /review
         │
         │  npm run learn
         └──────────────► scripts/learn      apps/web/       apps/macos/
                          the CLI            the web app      the native app
                              │                  │                 │
                  reads/writes│      reads/writes│         spawns  │ reads
                              ▼                  ▼                 ▼
                        ┌────────────────────────────────────────────────────────┐
                        │ services/catalog: the content (courses, topics, tags,  │
                        │ notes, session logs, diagrams) and the learner state,  │
                        │ all in one SQLite file                                 │
                        └────────────────────────────────────────────────────────┘
                                   │                     │
                  the app calls    │   the app and the   │  npm run snapshot
                  both over        │   web's /studio     ▼
                  loopback         │   proxy call it  ~/.gnosia/app-catalog.db
                                   │   (connect-only)   (read-only mirror)
         services/sidecar          │            + ~/.gnosia/learner.db
         services/studio           │             (the app's writable half)
                    │              │
                    │ drives       │  the indexers read each
                    ▼              │  tool's topics --json
         tools/manimkc · remotionkc · revideokc · blenderkc · tldrawkc ──┘
         (five submodules, another repo each)
```

| Layer | Where | What |
| --- | --- | --- |
| Instructions | `learning` plugin, `learning` marketplace | The `/learn` and `/review` skills, plus the `concept-mapper`, `fact-checker` and `diagram-maker` subagents |
| Code | `scripts/learn/`, `apps/web/`, `apps/macos/` | The pipeline CLI, the web app and the native macOS app |
| Data | SQLite, through `services/catalog/`; `~/.gnosia/` for the local half | Courses, topics, tags, concept notes, session logs and diagrams, the event log and its projections in the catalog; the blob store, the `app-catalog.db` snapshot and the app's `learner.db` under the data root. The repository holds only `seed/`, a small slice in the export format |
| Assets | `tools/manimkc/` | A separate repo, wired in as a submodule, that renders narrated animation videos |
| Assets | `tools/remotionkc/` | A separate repo, wired in as a submodule, that renders narrated explainer videos with Remotion; its `topics --json` is manimkc's report shape |
| Assets | `tools/revideokc/` | A separate repo, wired in as a submodule, that renders narrated explainer videos with Revideo; its `topics --json` is manimkc's report shape too |
| Assets | `tools/blenderkc/` | A separate repo, wired in as a submodule, that renders narrated explainer videos in photoreal 3D with Blender's Cycles; its `topics --json` is manimkc's report shape too |
| Assets | `tools/tldrawkc/` | A separate repo, wired in as a submodule, that draws teaching diagrams on a tldraw canvas and exports the SVG that `catalog diagram commit` stores |

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
| `apps/web/` | The Next.js app, its `public/`, `next.config.ts`, `vercel.json` | `@gnosia/web` |
| `apps/macos/` | The SwiftUI app: a SwiftPM package under `Sources/Gnosia/`, the snapshot script, the `.app` bundler | `@gnosia/macos` (an npm shell for the snapshot script's two dependencies; the app itself is SwiftPM) |
| `packages/content/`, `packages/schema/`, `packages/blob/`, `packages/tutor/` | The content reader, the table shapes, the blob store and the tutor core | yes |
| `services/catalog/` | The connection, the migrations, the indexers, the `catalog` and `learn` CLIs | yes |
| `services/studio/` | The diagram and video runner: its jobs, drafts, canvas verbs and loopback API on `127.0.0.1:7250` | yes |
| `services/sidecar/` | The tutor's loopback API for the native app | yes |
| `scripts/learn/` | The pipeline's pure maths, and the `npm run learn` entry point | no |
| `seed/` | A small slice of the content in the export format ([README](seed/README.md)): a fresh clone's database and the tests' fixture. Files, not code. | no |
| `tools/manimkc/`, `tools/remotionkc/`, `tools/revideokc/`, `tools/blenderkc/`, `tools/tldrawkc/` | Git submodules with their own repos, lockfiles and toolchains | no, deliberately |

`tools/` is outside the workspaces list on purpose: listing it would make
`npm ci` at the root try to install two trees this repo does not own.

`apps/web/` is the web app. Nothing under it knows the CLI exists.

| Directory | Owns |
| --- | --- |
| `apps/web/src/app/` | Routes in two groups — `(site)/` the signed-out landing and sign-in, `(app)/` the signed-in shell and its destinations (home, courses, learn, library, review, ask, studio, settings) — plus `api/` and the root layout and metadata |
| `apps/web/src/proxy.ts` | The front door: the owner-cookie check that runs before every route the matcher lets through, including every `/api/` path |
| `apps/web/src/components/` | Every React component: the shell (`AppShell` and `shell/`), the redesign's primitives (`ui/`), and one folder per surface (`home`, `courses`/`course-home`, `learn`/`workspace`, `library`, `session`, `review`, `ask`, `settings`, `studio`) |
| `apps/web/src/lib/` | `learner-context.tsx` (the provider), `learner-store.ts` (the pool and the reads), `learner-api.ts` (`handler`, the shared route guard), `asset-files.ts` (an asset row to its bytes: the blob store, or the row for a note, a log or a `.tldr`, and a stored poster; nothing off the disk), `blob-store.ts` (the store the routes read), `asset-library.ts` (the library's reads of the content half), `library.ts` (what the library shows and how it links), `transcript.ts` (a sidecar to cues, defensively), `storage.ts` (the pure reducers), the surfaces' read models (`home`, `recent`, `ask`, `review-*`, `learn-index`, `domain-map`, `course-path`, `module-path`, `week-check`), the studio client and corpus reads (`studio*.ts`, `conversation-*.ts`), the settings seams (`settings.ts`, `provider-keys/`, `tutor-models/`, `custom-providers/`, `providers/`, `byok-*.ts`), `types.ts`, `theme-cookie.ts` |
| `apps/web/src/lib/agent/` | The request side of the tutor. Most files are `export * from "@gnosia/tutor/…"` shims keeping the `@/lib/agent/*` paths working — the prompts, the providers cascade, the judge and session-question parsing moved to `packages/tutor` so the sidecar imports the same code. The web-only glue stays here: `guard.ts` (same-origin, rate limit), `courses.ts` (the route's course list), `credentials.ts` (BYOK against the app's pool), `env.ts` (`tutorDeps`, the `TutorDeps` builder) |
| `apps/web/src/lib/kb/` | `load.ts` and `types.ts`: the concept graph as the hub reads it, straight from the catalog |
| `apps/web/src/lib/auth/` | `core.ts` (the session cookie, `OWNER_PASSWORD`/`AUTH_SECRET` config) and `session.ts` (the server read) |
| `apps/web/src/data/source.ts` | The content seam's composition root: `contentSource()`, one selected source per request, from the database only; a type not flipped is refused by name |
| `apps/web/src/data/courses/index.ts` | Server-only `getCourses()` and the course lookups every page calls |
| `apps/web/src/data/content.ts` | Server-only `getTags()`: the cross-course themes |
| `apps/web/src/data/topics.ts` | Server-only `getTopics()`: the shared vocabulary, and the pure maps and picker options the studio builds from the runner's copy of it |

`apps/macos/` is the native half — a SwiftPM package, not a Next anything.
`Sources/Gnosia/` keeps one file per surface, mirroring the web's
destinations; `Sources/CSQLite3/` is only sqlite3's module map. The two
scripts beside it matter more than they look: `catalog-snapshot.mjs` is how
the catalog reaches the app (below), and `bundle-app.sh` turns the package
into a signed `Gnosia.app`.

`packages/` and `services/` are npm workspaces, Node-only, with their own
tsconfigs.

| Directory | Owns |
| --- | --- |
| `packages/content/` | The reader for an export's `content/`: `loadCourses`, `loadTopics`, `loadTags`, the `Course` types, and the reader seam (`ContentSource`, `fileSource`, `selectSource`) |
| `packages/schema/` | Every table shape, and the row types inferred from them |
| `packages/blob/` | The `BlobStore` interface, the `<owner_id>/<sha256>.<ext>` key scheme, the `fs` adapter and the conformance suite any later adapter must pass ([README](packages/blob/README.md)) |
| `packages/tutor/` | The tutor's core: prompts, providers, BYOK credentials, the model chain, and the `*Turn` functions — the four agent turns plus the provider-key and model-chain turns — the web routes and the sidecar both call. Returns `TurnReply`s — status plus a JSON body — so nothing in it knows Next.js |
| `services/catalog/` | The connection, the migrations, the indexers and the `catalog` CLI |
| `services/studio/` | The studio's job runner and loopback API, on `127.0.0.1:7250`. Diagrams first, then video jobs through `src/video/` on the same surface (`POST /api/jobs` dispatches on the body's `kind`), and planner conversations (`src/drafts/`). It reads the topic vocabulary only through `catalog topic ls`, with the last good read cached under `$STUDIO_HOME/cache/topics.json` (D13), and opens no database connection of its own. Each job draws in its own workspace, `$STUDIO_HOME/jobs/<id>/candidate/`, never in the working tree, and Accept lands the candidate with `catalog diagram put --job`. Its repo root is where its code sits, not a walk up to `content/` ([docs/TLDRAWKC-INTEGRATION.md](docs/TLDRAWKC-INTEGRATION.md)) |
| `services/sidecar/` | The tutor as a standalone loopback service for the native app: `node:http` on `127.0.0.1`, an ephemeral port (or `GNOSIA_SIDECAR_PORT`), and one `listening <port>` line on stdout once bound — the spawn contract `SidecarManager` parses. Its `TURNS` table serves the web app's `/api/agent/*` and `/api/learner/*` tutor paths verbatim plus the two settings reads the web does server-side, all through the same `packages/tutor` `*Turn` functions over the catalog pool, so the macOS client (`apps/macos/Sources/Gnosia/SidecarClient.swift`) reuses the BYOK, model-chain and provider-fallback contract rather than reimplementing it. Plain JSON both ways — the tutor endpoints never streamed |

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
| `services/catalog/src/learn/files.ts` | Concept notes and session logs: rows when the database owns them, and otherwise the files of a `LEARN_ROOT` tree, with the scanning rules that make an id a filename. With neither, a refusal naming the fix |
| `services/catalog/src/learn/paths.ts` | Every path under a `LEARN_ROOT` tree, the only tree of files the CLI touches since the cut-over |
| `services/catalog/src/learn/replay.ts` | Rebuilding the schedule from the event log |

`packages/` and `services/` are npm workspaces, added for the catalog.
`apps/web/` imports `packages/content` for the content types and the reader
seam, and `services/catalog/src/state/` for the learner state, the concept
graph and the assets, and nothing else from either: it reads content through
the seam and state through the store, never the database directly.

| Workspace | Owns |
| --- | --- |
| `packages/content/` | `loadCourses`, `loadTopics`, `loadTags`, and the content types; `ContentSource`, the async interface every reader holds, with `fileSource(root)` over those parsers and `selectSource` choosing files or the database per type. Reads files, connects to nothing: the database implementation, `dbSource`, is the catalog's. |
| `packages/schema/` | The Drizzle table definitions and the row types inferred from them. Connects to nothing. |
| `packages/blob/` | `BlobStore`, `key()` and `fsStore()`: bytes under `$GNOSIA_HOME/blobs`, outside the repo. Imports nothing but Node. `catalog asset upload` writes it; the web's asset routes, the catalog commands and the sidecar all read through it. |
| `services/catalog/` | `db.ts` (the pool), `migrations.ts`, `drizzle/` (generated SQL), `cli.ts`, `src/state/` (the learner store) and `src/learn/` (the `learn` CLI) |
| `packages/tutor/` | Everything the tutor endpoints share, grown out of `apps/web/src/lib/` so the sidecar imports the same code: `src/` is the pure half (`providers.ts` with the provider configs, `keyFor`, `completeWithFallback`; `prompt.ts` and the per-shape builders; `session-core`, `judge`, `review-core`, `concept-graph`, the markdown and media helpers), `src/server/` is the half that touches things — `deps.ts` (`TutorDeps`/`TurnSeams`), `turns.ts` (the `*Turn` functions: four agent turns, then provider-key save/remove/status/test, the model-chain add/set/remove/move/provider moves/chain/test and `modelList`), `credentials.ts`, `provider-keys.ts`, `tutor-models.ts`, `model-list.ts`, `asset-detail.ts` and friends. The pure half imports no I/O; the server half takes the database as a promise so a dead pool degrades per read |
| `services/sidecar/` | `src/index.ts` (the process: bind, `listening <port>`, signal close), `src/api.ts` (path → `*Turn` table, JSON in/out), `src/guard.ts` (loopback host/origin checks), `src/deps.ts` (`TutorDeps` over the catalog pool and blob store), `src/config.ts` (`HOST`, `GNOSIA_SIDECAR_PORT`) |

`packages/schema`, `packages/content` and `packages/blob` are the bottom of
that stack: the first imports `drizzle-orm`, the second `yaml`, the third only
Node's own modules, and none imports anything else of ours.
`services/catalog` imports the first two, owns the only connection string in the
repo, and is the only thing that talks to Postgres. The design and the
entity diagrams are in [services/catalog/SCHEMA.md](services/catalog/SCHEMA.md).

## The web app: routes

The pages below plus the signed-out pair — `(site)/page.tsx` the landing at
`/` and `(site)/sign-in/` the one form — and two 404s. `src/proxy.ts` decides
which side of that line a request lands on: a signed-in visitor asking for
`/` or `/sign-in` is redirected to `/home`; everything else asks for the
session cookie. Pages are server components;
the interactive parts opt into the client one component at a time.

| Route | File | What it renders |
| --- | --- | --- |
| `/home` | `home/page.tsx` | Home: the threads to pick up (module pages, unfinished videos, studio drafts, concepts answered on), what they open up (Next from here), at most three due cards worth a quick recall, the courses in progress. `/today` is a permanent redirect here (`next.config.ts`) |
| `/courses` | `courses/page.tsx` | Every course as a card: search, filter chips by theme, progress, the next topic |
| `/ask` | `ask/page.tsx` | The open tutor on `?q=`, the subject typed into Home's Ask box when nothing matched; a chat that is not saved and records no mastery (H4 of the Home proposal) |
| `/review` | `review/page.tsx` | The review session in focus mode: the due cards one at a time, the four ratings with their intervals, a close screen. `?concept=<slug>` puts that concept first; `?only=a,b,c` asks just those due cards (Home's recall card linked here until it moved into the chat, #381) |
| `/settings` | `settings/page.tsx` | The theme, tutor style and motion, each saved on change; the providers card (BYOK keys and the model chain, written through the `learner/provider-key*` and `learner/tutor-model*` routes), the BKT priors read-only; export and reset |
| `/studio` | `studio/page.tsx` | The studio surface over the runner's loopback API: the conversation composer, the corpus (diagrams, videos), the job queue, `d/[name]` a diagram's detail |
| `/learn` | `learn/page.tsx` | The Learn index: every concept in a table with search and mastery filters, and the neighbourhood (or course) graph of the selected row |
| `/learn/[concept]` | `learn/[concept]/(workspace)/page.tsx` | The concept workspace: the note and its sources, the concept tutor, mastery with its history, checks, assets and the neighbourhood graph. `?ask=` prefills the tutor's input |
| `/learn/[concept]/session` | `learn/[concept]/session/page.tsx` | Session focus mode: probe, teach (the note's prose and its diagram or video), check, close. Every graded answer is evidence through `POST /api/learner/observe`; the close screen shows what moved and what got scheduled. `?mode=check` asks the note's checks only |
| `/library` | `library/page.tsx` | Every indexed asset as a card grid: text search (`?q=`), kind and course chips, a newest or title sort, the concept each card explains |
| `/library/[id]` | `library/[id]/page.tsx` | One asset (a video that resumes where it stopped, with chapters on its scrub bar and subtitles; a diagram; a file's words; or a link) with Mark read for anything not a video, and under it one tabbed card shared by every kind (`components/library/AssetTabs.tsx`: Explains, Related, Files, Details; a video puts its Transcript first) |
| `/courses/[slug]` | `courses/[slug]/page.tsx` | The course home: one unit card per module with a node per topic, coloured by the mastery of the concepts whose notes name it (or by the tick when none does), one active node with Continue, and a rail with the course header, the module list and the current module's assets. Each node opens its note, recap, tick and tutor chat; each unit its resources |
| `/courses/[slug]/[module]` | `courses/[slug]/[module]/page.tsx` | The same course home with the module named by the URL instead of chosen from the learner's ticks — one ordered learning path (module material, a lesson per concept step, practice, the week check) per `docs/proposals/module-learning-path.md` |
| `/courses/[slug]/[module]/check` | `.../check/page.tsx` | The module's week check: `SessionFocus` in `module` mode, the module's concepts asked in path order, every answer a probe through `observe` naming the module |
| `/courses/[slug]/[module]/session` | `.../session/page.tsx` | The agent chat for one topic, hosted by `AgentSession` |
| not found | `not-found.tsx`, `(app)/not-found.tsx` | The 404: the root one for an address no route matches, the `(app)` one, inside the shell, for a `notFound()` from a page under it |

Every handler under `app/api/` — 39 route files — is enumerated in
[docs/API.md](docs/API.md) with its methods and body shapes: `agent/` the
four tutor turns (`chat`, `session`, `judge`, `summarize`), `learner/` the
state writes (`progress`, `note`, `reset`, `recap`, `preference`, `import`,
`watched`, `playback`, `observe`, `session/close`, `asset-name`, `favorite`,
`name`, `avatar`, `recent`'s pin/unpin), the reads (`home`, `ask`, `export`,
`recent`) and the settings routes (`provider-key*`, `tutor-model*`,
`custom-provider`), `review/` due and grade, `assets/[id]/` the four byte
routes (`file`, `poster`, `pdf`, `status`), `concepts/` and `courses/` the
two content reads, `auth/` sign-in and sign-out. The studio's edge in the
app is two handlers outside `api/`: `(app)/studio/api/[...segments]`, the
proxy to `127.0.0.1:7250`, and `(app)/studio/made/[draft]`, the assets a
conversation landed.

The rows a page calls most, in the order the surfaces use them:

| Route | File | What it does |
| --- | --- | --- |
| `POST /api/agent/chat` | `api/agent/chat/route.ts` | One tutoring turn, for a course topic, with `conceptSlug` for one concept note, with `assetId` for the asset panel, or with `subject` for the open tutor (`/ask`), which reads no note and records nothing |
| `POST /api/agent/session` | `api/agent/session/route.ts` | One multiple-choice question for a session step, written by the tutor model as JSON and refused if it is not; writes nothing |
| `GET /api/concepts/[slug]` | `api/concepts/[slug]/route.ts` | Everything the concept workspace shows about one concept, as JSON |
| `POST /api/agent/summarize` | `api/agent/summarize/route.ts` | A transcript condensed into a recap |
| `GET /api/review/due` | `api/review/due/route.ts` | The due cards as the review page renders them (`?concept=` first), with the next due instant |
| `POST /api/review/grade` | `api/review/grade/route.ts` | One rating (0 Again to 3 Easy) recorded as `learn review grade` records it |
| `GET /api/assets/[id]/file` | `api/assets/[id]/file/route.ts` | The bytes of one indexed asset: a video, a diagram, a transcript |
| `GET /api/assets/[id]/poster` | `api/assets/[id]/poster/route.ts` | The still frame `catalog asset upload` stored for a video, as a JPEG |
| `GET /api/assets/[id]/status` | `api/assets/[id]/status/route.ts` | Why the file or poster route would refuse an asset, as a code, without sending it |
| `GET /api/learner/home` | `api/learner/home/route.ts` | Home as JSON, the same `HomeModel` the page renders; degrades to `reachable: false` |
| `GET /api/learner/ask` | `api/learner/ask/route.ts` | Home's Ask box: concepts, courses, modules and videos whose titles match `?q=`, best first (`rankAsk` in `lib/ask-core.ts`); a source that cannot be read adds nothing |
| `GET /api/learner/export` | `api/learner/export/route.ts` | The learner snapshot, every preference row and the whole event log as a JSON download; a 503 when the database is down |
| `POST /api/learner/watched` | `api/learner/watched/route.ts` | Append a `watched` event for one asset: study, never evidence |
| `POST /api/learner/playback` | `api/learner/playback/route.ts` | Save a video's position and the stretches that played (a `playback:<asset id>` preference), and append the `watched` event once 90% has played |
| `POST /api/learner/observe` | `api/learner/observe/route.ts` | One graded session answer recorded as `learn observe` records it (`recordObservation`): the event, the mastery with propagation, the card. The first answer opens the session |
| `POST /api/learner/session/close` | `api/learner/session/close/route.ts` | Close a session: one `session-close` event and the row to `closed`, once |

The asset route is the one door from an `asset` row to its bytes, and it
reads no file off the disk. The URL carries an asset id rather than a path:
the id is a primary key, and what the row names decides where the bytes come
from. A row with a `blob_key` is served from the blob store
([docs/CONTENT-MIGRATION.md](docs/CONTENT-MIGRATION.md), Track E). A store
that signs URLs gets a 302 to one, good for an hour and never cached, so a
cloud store's bytes never stream through a function; the laptop's `fs` store
signs nothing, so the route streams it with the same Range answers. A
`pending` blob, or one the store has lost, is a 404 `not-uploaded`.
`catalog asset upload` is what fills the store and sets the keys, and
`catalog blob audit` is what checks the two agree. The reasoning for each
header the route sets is in `apps/web/src/lib/asset-files.ts`.

Otherwise a `note`, `session` or `diagram_source` asset is served from its
row, through the same reader seam the pages use: the note as its row renders
it, the log as its entries concatenated, the `.tldr` as its canonical
document. A row with neither is `not-uploaded`, and a note, log or `.tldr`
whose type this database has not flipped is a 503 `not-flipped`. Until phase 2
a third branch read the file itself, under the repository or manimkc's data
root, behind `ASSET_FILES_ENABLED`; it went with the switch, since the files
are an export now and phase 3 deletes them.

The poster route serves the poster `catalog asset upload` stored: one frame
per video, cut on the laptop with the recipe in
`services/catalog/src/poster/recipe.ts`, recorded as a `poster` asset derived
from the video, and served like any blob with its sha256 as the tag. A video
with no stored poster is a 404 `not-uploaded`, and its card keeps the
placeholder: nothing cuts a frame at request time any more, because that read
the video's file off the disk.

The session route renders on demand, like every page: it used to declare
`generateStaticParams()` over every course and module pair, and that went when
the course list became a per-request read (the root layout already made every
page dynamic, so nothing was being prerendered from it).

**Home** ([docs/proposals/home-page.md](docs/proposals/home-page.md)) reads
everything in one pass through `apps/web/src/lib/home.ts`: the knowledge base,
the event log, the preferences, the due queue, the snapshot and, with a
studio, the owner's titled drafts (`recentDrafts`), through `learner-store`'s
pool, and hands them to the pure `apps/web/src/lib/home-core.ts`. The threads
under "Pick up where you left off" merge the `recentModules` preference (kept
by `POST /api/learner/preference` beside every `lastVisited` write), the
`playback:<asset id>` preferences with somewhere to resume, the drafts and the
latest answer per concept, newest first. "Next from here" (`nextFromHere`)
lists, per thread, the frontier concepts that require a concept thread and
the open topics after a module thread; "Worth a quick recall" (`recallPicks`)
takes at most three due cards, nearest the threads first, then the longest
unseen. The single frontier pick (`nextUp`) is drawn only when no thread
opens anything.

**The shell.** `AppShell` is a server component: a 64px top bar (the
wordmark, the five destinations Home, Courses, Learn, Library and Review,
and an avatar menu holding the theme toggle, Settings and, behind
`STUDIO_ENABLED`, Studio), the store banner, the page, and below 768px a
bottom tab bar in place of the destinations. The streak and target pills went
with the habit layer (H1 of the Home proposal). A page picks its width with
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
read through `readAssetText` with its byte cap; a line inside a
transcript finds the transcript's video through `derivationSources`. The limits
are in [docs/design/IMPLEMENTATION.md](docs/design/IMPLEMENTATION.md). The
concept chip on a card and the asset page's Explains card come from
`conceptsForAssets`, the reverse of `assetsForConcept`, joined to the knowledge
base for the mastery dot. A `watched` event is study and never evidence,
since both replays read only `observation` and `review`. Mark read appends one through `POST /api/learner/watched` for
anything that is not a video. A video has no button: the player posts its
position and the stretches that actually played to `POST
/api/learner/playback`, which merges them into a `playback:<asset id>`
preference, and the save that takes coverage past 90% appends the event
(`apps/web/src/lib/playback.ts` holds the rule). Scrubbing to the end is not
watching, since coverage counts only what played.

**Both pages treat unserved bytes as a state, per row.** An asset whose bytes
are a `present` blob or a row the database owns draws; one with nothing stored
shows its placeholder, and the grid says once how many rows in the view have
no stored copy and names `catalog asset upload`. Nothing renders a dead player
or a broken image. The page asks the route's own resolver (`resolveAsset`,
batched as `servedAssets` for a grid), so the page and the route cannot give
one asset two answers.

`apps/web/src/lib/transcript.ts` parses the sidecars, defensively: a malformed
one costs the transcript panel and leaves the video playing. Its cues are read
on the server and passed to `TranscriptPanel` as props, so there is no loading
state and no second round trip for text the render already had a request in
which to read.

**A failed asset says why, and the server decides it when it can.** A browser's
`onError` carries no status and no body, so every refusal the file and poster
routes make carries a machine-readable `code` (`@/lib/asset-problems`), and
`/api/assets/[id]/status` reports that code in a few bytes of JSON without
reading the bytes. The detail page decides everything it can before render
with `readFileProblems`: nothing uploaded, a type not flipped, an embed whose
name no row has. Those render the failure panel on
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
`services/catalog/src/state/` is the only module that writes them — for the
web app and the CLI; the native app's own writes land in `learner.db`, the
split the end of this section explains. There is
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
`@gnosia/schema/shared`: as CHECK constraints, so nothing can put an
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
provider checks for the old `gnosia:v1` localStorage key, posts it to
`/api/learner/import`, and removes it on success. The merge rules are in the
store rather than the route: the database wins, and a curriculum item id the
catalog no longer has is skipped and counted rather than costing the learner
the rest of the document.

**The native app splits this in two.** `app-catalog.db` is a mirror — the
snapshot below — and a mirror that a snapshot run replaces wholesale cannot
be the writable store: anything the learner wrote into it would vanish at the
next refresh. So the app's own writes land in `learner.db`, a second SQLite
file beside it, owned by `LearnerStore`. The small marks are its own
(`watch`, `favorite`, `asset_name`, `progress`); the learning-state tables a
check session writes (`session`, `event`, `mastery`, `review`) are column
for column the catalog tables the snapshot mirrors, so `recordSessionAnswer`
is the web's `POST /api/learner/observe` as a local equivalent and a later
sync has nothing to reshape. `CatalogStore` reads both files into one
model — the snapshot's catalog-side learner rows plus the app's own — and
`refreshLearner()` re-reads the file after each write, so the read model can
never show a state the write did not land. The tutor's settings are a
different door: provider keys and the model chain are owner configuration in
the catalog, and the app edits them through the sidecar's `/api/learner/*`
routes, the same contract the web Settings page writes against.

## The course data model

Ten courses, `collection` and `curriculum_item` rows since the courses flip,
exported as one YAML file each by `catalog course export` (the format is
[seed/COURSES.md](seed/COURSES.md)). A course holds
modules, a module holds topics, a topic holds subtopics and the module holds
curated resources. `loadCourses()` in `packages/content` is what `catalog
import` parses a course file with, and the catalog's courses reader returns
what that parser returns for the database's own export, so the page and the
file cannot disagree about what a course means.

`apps/web/src/data/courses/index.ts` is the app's view of that: `import "server-only"`,
`getCourses()` (async, wrapped in React's `cache()` so a render reads once),
and the lookups pages call: `getCourse`, `getModule`, `findTopic`,
`getAllTopicIds`, `getRelatedCourses`. The ones that need
every course take the list as an argument, so a page reads it once and the
helpers under `lib/` stay synchronous. `apps/web/src/data/content.ts`
(`getTags()`) and `apps/web/src/data/topics.ts` (`getTopics()`) are the same
shape over the themes and the vocabulary.

**Through the reader seam, from the database only.** None of the three calls
a parser. They ask `contentSource()` in `apps/web/src/data/source.ts`, which
hands back `selectSource` over the catalog's `dbSource` and no file reader
(phase 2 of [docs/CONTENT-MIGRATION.md](docs/CONTENT-MIGRATION.md)). A type
whose `content_source` row does not say `db` is refused with an error naming
`catalog flip <type>`, and a database that does not answer is refused too;
`app/(app)/error.tsx` renders either inside the shell, and the server log says
which. The rows are read once per request, so a flip shows on the next one.

**Server only, and enforced.** `server-only` makes a `"use client"` module that
reaches either of them fail the build with the import chain printed, rather
than shipping a Postgres driver to the browser. So client
components take what they need as props: the course page resolves the course,
each topic's mastery and each module's assets and hands them to `CoursePath`;
the session page resolves the course, module and topic for `AgentSession`; the
Courses page projects each course into a `CourseSummary` for its card grid. The
arithmetic those components still do lives in `apps/web/src/lib/course-path.ts`
and `apps/web/src/lib/course-summary.ts`, which are pure functions over a course
or a summary the caller already holds.

Each course carries an `inferred` flag. `true` means the syllabus was
reconstructed from the course announcement and the standard treatment of the
subject rather than read off an official document. Three of the ten are
inferred; `packages/content/test/courses.test.ts` pins the seed's one course,
which is not. A
course path with `inferred` says so under its header, and the agent prompt is
told to flag uncertainty for those courses.

**A course topic's concepts come from the course's own rows.** A vocabulary
topic's `maps.courses` names modules, so it can say which concepts a module is
about but not which of the module's topics each belongs to. The per-topic link
is the item's `concepts:` list, which `catalog course import` writes to
`concept_curriculum_item` and `readKnowledgeBase` returns as
`KbConcept.topics`. The course path draws a row's concepts in the row's own
order, breaks ties by the module topic's `maps.concepts`, and falls back to
that list for a unit's Guidebook. The arithmetic (the bucket, the active node, the
lock rule) is `apps/web/src/lib/course-path.ts`.

Courses also carry an `order:`, which is the order the Courses page renders
them in. It is authored because the shortlist is curated: sorting ten
files by name gives a different sequence and nothing would say so.

## The agent chat API

The four routes — `chat`, `session`, `judge`, `summarize` — run on the Node
runtime and delegate to the `*Turn` functions in
`packages/tutor/src/server/turns.ts`; each route file keeps only the
request-side guards and the validation that must answer before the rate
limiter is touched. The model the turn bills is the owner's chain: an ordered
list of provider/model pairs in `tutor_model`, edited in Settings' Providers
card and tried top to bottom, with `completeWithFallback` moving on from a
rate limit, a 5xx or an empty reply and collecting each failure
([docs/TUTOR-MODELS.md](docs/TUTOR-MODELS.md), [docs/BYOK.md](docs/BYOK.md)).
With no chain the built-in default order applies — NVIDIA NIM, Google
Gemini, OpenRouter, each skipped when its key is unset — and a provider the
owner added through `learner/custom-provider` slots in beside them.

No key at all returns `MISSING_API_KEY`, which the chat route turns into a
503; every provider failing returns `ALL_PROVIDERS_FAILED` and a 502.

The chat route picks its tutor by which fields the body carries. The topic
tutor (the course session) builds its prompt from course data plus whatever
recap the browser sent along. The concept tutor (the workspace,
`conceptSlug` in the body) builds it from the concept note, its neighbours
and the learner's mastery and recent answers, all read on the server through
`lib/concept-workspace.ts`, plus the `tutorStyle` preference from Settings
(`readTutorStyle` in `lib/settings.ts`, which also shapes the explanation of
a session question), and asks the model to cite a numbered source list as
`[n]`; the request and response shapes are in
[docs/design/IMPLEMENTATION.md](docs/design/IMPLEMENTATION.md#the-concept-tutor-api).
`subject` names the open tutor, which reads no note and records nothing —
that is the point of `/ask`. `assetId` names the asset tutor behind the
library's Ask panel, which reads the asset's own words on the server: a
video's transcript, a note's markdown, a diagram's labels, and the `at`
seconds the player sent along.

For the topic tutor, `objectives.ts` derives the session's success criteria
deterministically, `prompt.ts` builds the system prompt around them, and
`summary.ts` parses the model's recap back into the same `KnowledgeInput`
shape that `storage.ts` persists. The chat route re-clamps the incoming recap
with `KNOWLEDGE_LIMITS` before it reaches the prompt, because that payload
came from a browser.

## The native app

`apps/macos/` is the catalog on the laptop as a Mac app: a SwiftPM package,
`swift run Gnosia` or `scripts/bundle-app.sh` for the `.app` bundle. Its
shell is a `NavigationSplitView` (`RootView.swift`) over the same
destinations the web has — Home, Courses, Learn, Library, Review, Ask,
Studio, plus ⌘, Settings — and its screens deliberately mirror the pages:
each file's header names the surface it ports and what it declines to fake.
The gaps are declared, not hidden: grading stays in the web app and the CLI
(the review queue is read-only there), the studio's SSE streams are a
four-second poll, and the studio's settings routes are the web's, so the
native pane lets the runner apply its own defaults.

**The catalog reaches it as a file, not a connection.**
`apps/macos/scripts/catalog-snapshot.mjs` (`npm run snapshot -w
@gnosia/macos`) resolves the catalog the way every command does — `CATALOG_DB`,
then `DATABASE_URL`, `services/catalog/.env` filling the gaps, the shell
winning, then the live file under the data home — and writes
`<data home>/app-catalog.db`, where the data home is `GNOSIA_HOME`, then
`~/.gnosia`; `GNOSIA_CATALOG` or `--out` overrides
the file itself. `app-catalog.db`, not `catalog.db`: the live database owns
that name now, and the script refuses when source and target would be one
file. The write is a `.partial` file renamed into place, so a reader never
meets a half-written snapshot. `PRAGMA user_version = 3` and a
`snapshot_meta` table (generator, `schema_version`, `source`, `taken_at`,
`source_database` — the source file's path, which can carry no secret) say
where the file came from. Column names mirror
`packages/schema/src/content.ts`; the live schema's millisecond-integer
instants go over as `REAL` seconds since the epoch, JSON columns as the text
they already are, booleans 0/1, and `asset.generated_by` is the one
computed column — which tool made a row, so the app never repeats that join.

The mirrored tables are the content half plus the learner rows the catalog
holds: `asset`, `asset_derivation`, `asset_topic`, `asset_concept`, `topic`,
`concept`, `concept_prerequisite`, `collection`, `curriculum_item`,
`collection_item`, `concept_curriculum_item`, `curriculum_item_asset`,
`tag`, `collection_tag`, and `mastery`, `review`, `progress`, `recap`,
`preference`, `event`, `asset_name`. The mirror carries every owner's rows
unscoped; the app reads it under its own learner id and merges
`learner.db`'s native writes over it. Two files, two answers to one
question — what can be regenerated? Everything the catalog knows is in
`app-catalog.db`, opened read-only and replaced wholesale by the next
snapshot run; what the app itself writes is in `learner.db`, which no
snapshot touches.

**The sidecar is the tutor boundary.** Anything needing a provider call —
the chat tutors, the session questions, the judge — goes to
`services/sidecar`, not to the catalog's file and not to a provider directly,
so the macOS code holds no credential logic at all. `SidecarManager` spawns
`npx tsx services/sidecar/src/index.ts` from the repo root and reads stdout
for exactly one line, `listening <port>` — printed once the socket is
bound, on an ephemeral port by default so nothing has to be known ahead of
time and nothing collides. Everything else on stdout is shell noise and
skipped; a 20-second wait bounds the whole spawn. The client then talks to
`127.0.0.1:<port>` — the web contract's own paths, served by the same
`*Turn` functions, which is why the app's tutor and Settings pane cannot
drift from the site's. The sidecar's own catalog failure is a request-time
degradation, not a boot failure, so the line a slow database never blocks is
the one the app is waiting for.

**The studio is connect-only.** `StudioManager` never spawns the runner:
the studio binds a fixed loopback port (7250) rather than printing a
`listening` line, and launching it is an owner's call — it starts paid
agent sessions, and a child killed with the app would mark its in-flight
jobs `interrupted`, the state the runner's own reconcile pass is careful to
leave for a person. The manager is a port probe plus five polled reads
(health, diagrams, jobs, videos, drafts); `StudioClient` holds the verbs
(`API.md` lists them and the SSE, settings and mirror routes the app
deliberately does not call — the canvas itself still opens in the browser,
a mirror being a `canvas serve` page rather than something the runner
renders).

## The learn CLI

`services/catalog/src/learn/cli.ts` parses with `node:util`'s `parseArgs` in
strict mode, dispatches on the first positional, and runs `ensureDirs()` before
every command, which creates folders only in a `LEARN_ROOT` tree. Every command
takes `--json`, and the five shapes the `/learn` and `/review` skills parse are
documented in [docs/LEARN.md](docs/LEARN.md#the-json-shapes) and pinned by
golden tests.
Anything that carries evidence appends to `event` first and updates the
projections after.

The connection is lazy, and every command that reads or writes a note or a log
needs it, since those are rows. `status`, which both skills open with and stop
on, is the intended gate: a session that cannot record anything should not
start.

`learn observe` is the step that matters: it records one answer, applies the
Bayesian update, propagates the evidence to prerequisites, schedules the
concept for review, and (with `--session` and `--question`) writes the whole
exchange into the session log as Obsidian callouts while the session is still
running.

## The knowledge base

```
concept              atomic concept notes, the durable knowledge
session_log_entry    one log per session, appended live
diagram, asset       the editable canvas a diagram was drawn on, and its SVG
                     (in the blob store), embedded in the session log
learn map            the mermaid knowledge map, printed          (derived)
```

In an export they are `learn/concepts/<domain>/<id>.md`,
`learn/sessions/<id>.md` and `learn/assets/<id>.tldr` and `.svg`
([seed/README.md](seed/README.md#the-export-format)), and the vault
`learn vault pull` writes uses the same layout without the `learn/` prefix.
The repository itself has held none of them since phase 3.

`learn/state/` was retired in bundle 5. `events.jsonl`, `model.json` and
`reviews.json` are the `event`, `mastery` and `review` tables; `index.json` is
a query. The mapping is in
[services/catalog/LEARN.md](services/catalog/LEARN.md).

The seed holds 11 concepts across three domains and one session log; the
owner's own count is whatever `learn status` says.

The folder is presentation only: a concept's id stays the bare slug, because
ids appear in every `requires:` edge, every wikilink, and the `concept_slug`
column of `event`, `mastery` and `review`. Moving a note between domains would
otherwise orphan its whole history — which, now that the history is a foreign
key, would be a constraint error rather than a silent loss. The domain is a
column of the row rather than a frontmatter key, and an export's folder is
written from it, so the two can never disagree; nesting is one level deep.

`event` is the database. `mastery`, `review` and the map are projections that
`learn model --rebuild`, `learn review rebuild` and `learn map` re-derive from
it, which is what makes changing a BKT parameter safe. The schedule became
rebuildable in bundle 5; before that, review grades were logged and nothing
replayed them, so deleting `reviews.json` lost every scheduled review
permanently.

Diagrams are `diagram` rows, written by `catalog diagram put|commit` (which
the `learn diagram` verbs and the studio's Accept call). The `diagram-maker`
subagent draws with `tools/tldrawkc/` in the file `learn diagram checkout`
prints, under the gitignored `$STUDIO_HOME/work/`, and commits it; the session log embeds the SVG
by name. The `.tldr` is stored beside the `.svg` so the next session can check
the canvas out and extend it instead of redrawing. An exported
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
                            concept · session_log_entry       services/catalog/src/state/
                            (rows, the write seam)                    │
                                                                      ▼
                                                        event · mastery · review
                                                        progress · recap · preference
                                                                      ▲
   apps/web/src/app  ──► apps/web/src/lib/learner-store.ts ──► @gnosia/catalog/state ┘
       │              (the pool, the degradation)
       └──► /api/learner/* ──► apps/web/src/lib/learner-api.ts ──► the same store

   apps/macos ──► app-catalog.db (read-only mirror) + learner.db (writable)
       │
       ├──► services/sidecar (spawned; the tutor turns over the same catalog pool)
       └──► services/studio (connect-only: the runner is already up or the surface says so)
```

Both web halves reach the same tables through the same module. That is the
change bundle 5 made: before it, the CLI owned files under `learn/state/` and
the web app owned a localStorage document, and the two models of the same
learner never spoke. The native app sits beside them rather than inside
them: its writes land in `learner.db` today, and a bridge that lifts those
rows into the catalog is a different branch's work — deliberately not described
here, since this branch has none. `apps/web/src/lib/kb/load.ts` is still the only place in the app that
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
| `apps/web/src/lib/course-path.test.ts` | The course path: a topic's concepts and its bucket, the active node, the lock rule, the labels and links |
| `apps/web/src/lib/learner-store.test.ts` | Reads degrading to empty with no database, and a write refusing to |
| `apps/web/src/app/(app)/learn/page.test.ts` | `/learn` rendering when the database is unreachable, and when it is simply empty |
| `apps/web/src/app/api/learner/routes.test.ts` | The six write routes: the origin guard, the allow-list, 400 versus 503 |
| `apps/web/src/app/api/review/routes.test.ts` | The review routes: the origin guard, the rating range, a rating landing in the log on SM-2's scale, the due list with its focus and intervals |
| `apps/web/src/lib/review-core.test.ts`, `review-queue.test.ts` | A review card's options (deterministic, the answer among them), check versus recall, and the interval and date wording |
| `services/catalog/test/review-grade.test.ts` | `gradeReview`, `reviewQueue` and the rating mapping: the grade moved out of the CLI unchanged, and a web grade replays exactly |
| `apps/web/src/lib/asset-files.test.ts` | Range arithmetic, header-safe filenames, the closed content-type list, the byte-counted stream. No database, so it is a gate everywhere |
| `apps/web/src/app/api/assets/asset-file.test.ts` | The asset file route's refusals and headers: a video on disk under the recorded data root still answers `not-uploaded`, the SVG sandbox, a 416 on an empty object, an id never joined onto a path, an undeclared extension |
| `apps/web/src/app/api/assets/asset-rows.test.ts` | Notes, logs and `.tldr`s served from rows on a flipped database, and `not-flipped` by name when a row or `CONTENT_SOURCE` says files |
| `apps/web/src/data/source.test.ts` | The content seam once per request, a type not flipped refused naming `catalog flip`, an unreachable database refused rather than read from files |
| `apps/web/src/app/api/assets/asset-unreachable.test.ts` | The three asset routes and the page's pre-render check with the catalog down: `catalog-unreachable` everywhere |
| `apps/web/src/lib/asset-problems.test.ts` | The reason table (no paths, no em dashes, a fix per fixable code) and the probe's mapping of every answer |
| `apps/web/src/components/asset-failure.test.ts`, `NoteProse.island.test.ts` | Each asset surface falling back to the shared panel with its reason, and a note without pictures rendering no client island |
| `apps/web/src/app/api/assets/asset-blob.test.ts` | The asset routes from the blob store: a 200, a 206, a 416, a `pending` blob, a lost object and a video never uploaded as `not-uploaded`, a stored poster with its 304 and none cut for a video without one, a stored transcript read for the page |
| `apps/web/src/app/api/assets/asset-blob-redirect.test.ts` | A store that signs URLs: the 302 carries the store's URL and no path, lives an hour, and a Range request at it returns 206 |
| `services/catalog/test/asset-blobs-0009.test.ts` | The blob readers on a database still at 0009: no blob, no poster, one warning to migrate, so the routes answer `not-uploaded` instead of `catalog-unreachable` |
| `services/catalog/test/asset-upload.test.ts` | `catalog asset upload` and `catalog blob audit`: every row pointed at bytes equal to its `content_hash`, a rerun that does nothing, a pending upload finished, a re-render refused, a re-index keeping its keys, and each audit finding with what `--fix` does |
| `apps/web/src/lib/agent/*.test.ts` | The provider cascade, the assembled prompt, recap formatting, the route guards |
| `packages/content/test/courses.test.ts` | The seed's curriculum (its one course, unique ids, every module topic and tag resolving) and every refusal the reader makes |
| `apps/web/src/data/courses/index.test.ts` | The lookups the pages call, over whatever the reader returned |
| `services/catalog/test/state.test.ts` | The store: progress, recaps, preferences, the append-only log, replay, the import merge rules |
| `services/catalog/test/learn-cli.test.ts` | The CLI end to end, with the five `--json` shapes pinned |
| `services/catalog/test/backfill.test.ts` | The backfill's assertion, its idempotency, and the synthesis it does and does not do |
| `services/catalog/test/after-cutover.test.ts` | The repository after the cut-over: a database owning every type, no `LEARN_ROOT`, a learn session, `concept add --item`, a topic write and a bare import, none of which recreates `content/` or `learn/` |
| `services/catalog/test/nightly-export.test.ts` | `scripts/nightly-export.mjs`: an export into a dated folder, the `latest` link, pruning to `--keep`, and its refusals (a relative `GNOSIA_HOME`, an archive inside the checkout) |
| `services/catalog/test/*.test.ts` | The schema's constraints, the indexers, the writer, the read commands |
| `scripts/learn/lib/*.test.mjs` | BKT, the concept DAG, SM-2 conformance, frontmatter round-trips |

Every catalog suite makes its own scratch SQLite file under the OS temp
directory, so CI needs no database service and the suites are a gate
everywhere they run.

Coverage is scoped to `apps/web/src/lib`, `apps/web/src/data` and
`scripts/learn` by design. Components and pages are verified by
`npm run build` and by looking at the running app, so counting their lines
would only dilute the number that matters.
The thresholds are deliberately not raised to meet the current number:
`learner-api.ts` and `learner-store.ts` are in scope and are covered by suites
that need a database, so the measured value now moves with the environment.

## The catalog

`services/catalog/` and `packages/schema/` are the database that owns the
content and the learner state, in Postgres 17. Full reasoning in
[services/catalog/SCHEMA.md](services/catalog/SCHEMA.md); the shape of it is:

```
   catalog topic · tag · course · item ──┐
   learn concept · session · observe ────┼──► the write seam ──┐
   catalog diagram · the studio ─────────┤    (a revision      │
   catalog import <dir> (export, seed/) ─┘     per change)     ├──► Postgres ──► catalog ls / show / path / search
   manimkc topics --json ────────────────┬──► the indexers ────┘                  (agents read here)
   remotionkc topics --json ─────────────┤
   revideokc topics --json ──────────────┤
   blenderkc topics --json ──────────────┤
   manimkc mirrors --json ───────────────┘
```

**The content half is authored here.** Since the phase 3 cut-over `topic`,
`tag`, `concept`, `collection`, `curriculum_item`, the diagrams and their link
tables are the truth, written only through the write seam with an author and a
reason, and `catalog history` shows every revision. `catalog export --out
<dir>` writes them out as files, and the nightly export
(`npm run export:nightly`) keeps a dated copy under
`$GNOSIA_HOME/archive/`; importing one into an empty database restores it.
The rows an indexer still owns are the ones read from outside, manimkc's,
remotionkc's, revideokc's and blenderkc's renders and the mirror ledger, and there the indexer may delete: a row the
source no longer produces is a stale row, and the whole point of the catalog is
that a rendered video cannot outlive its source without anything saying so.

**Bytes live in the blob store, never in a row.** An `asset` row holds a key, a
size and a hash; a 13 MB video and a 450 kB SVG are objects under
`$GNOSIA_HOME/blobs`, and a note's words are its `concept.body`. What the
catalog adds is the joins those files cannot carry: which topic an asset is
about, which `.tldr` an SVG came out of, and, through `mirror`, whether the copy on Google Drive or Seafile is the same
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
`remotionkc:`, `revideokc:`, `blenderkc:`, `diagram:`, `session:`) and a set of tables. `mirrors` is the one that owns
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

The `remotionkc:` ids are the same thing for the second video tool: its CLI
answers `topics --json` with manimkc's report shape, relative to its own
`$REMOTIONKC_HOME`, and one reader (`services/catalog/src/index/video-tool.ts`)
turns either report into rows. What differs is a descriptor: the name, the
checkout and how its CLI runs, and where a folder's topic comes from, which
for remotionkc is its topic.yml's required `topic:` rather than a vocabulary
map. The `revideokc:` ids are the third video tool's, with remotionkc's rules
exactly: the same report relative to `$REVIDEOKC_HOME`, and a required
`topic:` in each topic.yml. The `blenderkc:` ids are the fourth's, with the
same rules again relative to `$BLENDERKC_HOME`; its CLI is Python and runs
with `python3`, as manimkc's does.

### Where the tools are

Five of the indexers shell out to a submodule, and none hard-codes where the
submodule is. `services/catalog/src/env.ts` resolves every root the way it
resolves `DATABASE_URL`: the shell environment, then `services/catalog/.env`,
then a default that needs no configuration.

| Variable | Names | Default |
| --- | --- | --- |
| `MANIMKC_ROOT` | The manimkc checkout: where the pinned CLI runs from, and the default for `--manimkc-root`. manimkc's own CLI reads the same variable for the same thing. Not `MANIMKC_HOME`, which is where its renders land and which only ever arrives as a report's `outRoot`. | `tools/manimkc` |
| `REMOTIONKC_ROOT` | The remotionkc checkout, the same way: where `tools/cli/remotionkc.mjs` runs from with plain node, and the default for `--remotionkc-root`. Not `REMOTIONKC_HOME`, which arrives as the report's `outRoot`. | `tools/remotionkc` |
| `REVIDEOKC_ROOT` | The revideokc checkout, the same way: where `tools/cli/revideokc.mjs` runs from with plain node, and the default for `--revideokc-root`. Not `REVIDEOKC_HOME`, which arrives as the report's `outRoot`. | `tools/revideokc` |
| `BLENDERKC_ROOT` | The blenderkc checkout, the same way: where `tools/cli/blenderkc` runs from with `python3`, and the default for `--blenderkc-root`. Not `BLENDERKC_HOME`, which arrives as the report's `outRoot`. | `tools/blenderkc` |
| `TLDRAWKC_ROOT` | The tldrawkc checkout, whose `dist/` build reads the `.tldr` files. `npm run canvas` reads it too, so the tool and the indexer cannot end up on different builds. | `tools/tldrawkc` |
| `LEARN_ROOT` | A tree of files for the `learn` CLI's file half, for tests and scratch copies. Unset, the CLI works on rows only, refuses a type the database does not own, and never creates `learn/` in the repository. | unset |

A relative value resolves against the repo root rather than the working
directory, because a variable is set once and read by commands run from
anywhere; `--manimkc-root`, `--remotionkc-root`, `--revideokc-root` and
`--blenderkc-root` are typed at a prompt and still resolve against the cwd.
All six are in
[services/catalog/.env.example](services/catalog/.env.example). The data
root is a second family of variables: the snapshot script, the app and the
blob store's resolver all read `GNOSIA_HOME` then default to `~/.gnosia`.
`GNOSIA_CATALOG`, `GNOSIA_BLOBS` and `GNOSIA_REPO` (the repo
path the app spawns the sidecar from) name the pieces directly.

### How agents read it

The command surface is deliberately layered, and no layer returns a whole tree.
An agent runs `status` to see what exists and how fresh it is, `ls` to get
titles and counts, `show` for one entity, and then reads the one body it needs
with the command made for it (`learn concept show`, `catalog course export`).
`show` never returns a body, so no layer hands an agent a whole tree.

## Layering rules

1. **`apps/web/` imports the pipeline's *store*, and nothing else of it.** The web
   app reaches learner state through `@gnosia/catalog/state`, the single
   export that workspace publishes. It does not import the `learn` CLI, the
   indexers or the migrations, and it never imports from `scripts/`. Before
   bundle 5 the two halves met at one JSON file; they now meet at one module,
   because two writers of the same tables with two ideas of what a recap may
   contain is exactly the drift a shared store prevents.
2. **`scripts/learn/lib/` imports nothing from the project.** Those six modules
   are the maths: data in, data out, no filesystem and no connection. The
   TypeScript CLI imports them; they import nothing back, which is what lets
   the web app compute the frontier with the same `frontier()` the CLI does.
3. **The `learn` CLI is the only writer of the notes and logs.** It writes
   them through the catalog's write seam (`vault push` included, since it is a
   `learn` verb). Diagrams are the carve-out: `catalog diagram` and the studio
   write them. Nothing else writes a `concept` or `session_log_entry` row.
4. **`services/catalog/src/state/` is the only writer of the state tables.**
   The `learn` CLI, the backfill and the web app all go through it. It is where
   "an event first, the projections after" is enforced, and where the clamps
   live, so no caller can record evidence a different way.

   It is not *only* the state tables, and the name undersells it: it is also
   the one door out of this package, so the read-only content queries the web
   app needs live behind it too. `knowledge-base.ts` reads `concept` and its
   edges, `assets.ts` reads `asset` and the link tables. Neither writes
   anything, and the content half is still written only through the write
   seam (rule 11). Anything that would *write* content from here is
   the violation this rule is about; a query is not.
5. **A module that reads content or reaches the database says
   `import "server-only"`.** `apps/web/src/data/courses/index.ts`, `apps/web/src/data/content.ts`
   and `apps/web/src/lib/learner-store.ts` all do. Without it a `"use client"` import
   would compile — shipping a YAML parser, every course file, or a Postgres
   driver to the browser — and would only be noticed by whoever looked at a
   bundle report. With it the build fails and prints the import chain. Client
   components get resolved objects as props; pure arithmetic over a course they
   already hold lives in `apps/web/src/lib/course-path.ts`, and pure reducers over state
   they already hold live in `apps/web/src/lib/storage.ts`.
6. **Nothing outside `src/learn/paths.ts` builds a path into a `LEARN_ROOT`
   tree.** Diagrams are outside the rule, for the same reason as rule 3: the
   diagram agent draws in the path `learn diagram checkout` prints, under
   `$STUDIO_HOME/work/`, and passes it to `tldrawkc`.
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
    `packages/schema/src/`, then `npm run generate -w @gnosia/catalog`. A
    migration that has been applied is never edited: drizzle keys them by file
    hash.
11. **The web app never writes the *content* half.** It reads the content
    through the seam, from the database only, reads `concept`, `mastery` and `review` through
    the store, and writes `progress`, `recap`, `preference` and `asset_name` (the
    learner's own name for an asset, read in place of its source's title). `event`,
    `mastery` and `review` are written only through the store's own evidence
    functions, never assembled by a caller: the CLI's commands, and the two
    page-facing evidence writes, `POST /api/review/grade`, which calls the same
    `gradeReview` that `learn review grade` does, and `POST /api/learner/observe`,
    which calls the same `recordObservation` that `learn observe` does. The
    content tables are written only through the catalog's write seam, by the
    `catalog` and `learn` commands and the studio's runner, each write with an
    author, a reason and a revision. A page that wrote one would be a writer
    with none of the three.
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
15. **The native app writes `learner.db`, never the catalog.** `app-catalog.db`
    is the snapshot's file — regenerated wholesale, opened read-only — so the
    app's marks and its session's learning state go to the second file beside
    it. When a native write does have to reach the catalog (provider keys, the
    model chain) it goes through the sidecar's routes, not a connection of
    the app's own, so the credential and store logic stays shared with the
    web. A surface that cannot write a thing does not pretend: grading stays
    off the review screen, and locks stay off the module path, rather than
    drawing a state nothing can change.
