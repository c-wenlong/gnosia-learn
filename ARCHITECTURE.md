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
| `packages/content/`, `packages/schema/` | The content reader and the table shapes | yes |
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
| `apps/web/src/components/` | Every React component: shell, sidebar, progress, checklists, recaps, the concept graph |
| `apps/web/src/lib/` | `learner-context.tsx` (the provider), `learner-store.ts` (the pool and the reads), `learner-api.ts` (the shared route guard), `asset-files.ts` (an asset row to a file on disk, safely), `storage.ts` (the pure reducers), `progress.ts`, `curriculum.ts`, `types.ts`, `theme-cookie.ts` |
| `apps/web/src/lib/agent/` | `providers.ts` (the provider cascade), `prompt.ts`, `objectives.ts`, `summary.ts`, `lookup.ts` |
| `apps/web/src/lib/kb/` | `load.ts` and `types.ts`: the concept graph as the hub reads it, straight from the catalog |
| `apps/web/src/data/courses/index.ts` | Server-only view of `content/courses/`: the course lookups every page calls |
| `apps/web/src/data/content.ts` | Server-only view of `content/tags.yaml`: the cross-course themes |

`packages/` and `services/` are npm workspaces, Node-only, with their own
tsconfigs.

| Directory | Owns |
| --- | --- |
| `packages/content/` | The reader for `content/`: `loadCourses`, `loadTopics`, `loadTags`, and the `Course` types |
| `packages/schema/` | Every table shape, and the row types inferred from them |
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
| `packages/content/` | `loadCourses`, `loadTopics`, `loadTags`, and the content types. Reads files, connects to nothing. |
| `packages/schema/` | The Drizzle table definitions and the row types inferred from them. Connects to nothing. |
| `services/catalog/` | `db.ts` (the pool), `migrations.ts`, `drizzle/` (generated SQL), `cli.ts`, `src/state/` (the learner store) and `src/learn/` (the `learn` CLI) |

`packages/schema` and `packages/content` are the bottom of that stack: one
imports `drizzle-orm`, the other `yaml`, and neither imports anything else of
ours. `services/catalog` imports both, owns the only connection string in the
repo, and is the only thing that talks to Postgres. The design and the
entity diagrams are in [services/catalog/SCHEMA.md](services/catalog/SCHEMA.md).

## The web app: routes

Five pages, a 404, and two API handlers. Pages are server components; the
interactive parts opt into the client one component at a time.

| Route | File | What it renders |
| --- | --- | --- |
| `/` | `page.tsx` | The course shortlist, grouped by theme tag |
| `/learn` | `learn/page.tsx` | The knowledge base view: stats, frontier, due reviews, the concept graph |
| `/courses/[slug]` | `courses/[slug]/page.tsx` | One course: its modules, progress, related courses |
| `/courses/[slug]/[module]` | `courses/[slug]/[module]/page.tsx` | One module: topic checklist, notes, resources, recaps |
| `/courses/[slug]/[module]/session` | `.../session/page.tsx` | The agent chat for one topic, hosted by `AgentSession` |
| not found | `not-found.tsx` | The 404 |
| `POST /api/agent/chat` | `api/agent/chat/route.ts` | One tutoring turn |
| `POST /api/agent/summarize` | `api/agent/summarize/route.ts` | A transcript condensed into a recap |
| `GET /api/assets/[id]/file` | `api/assets/[id]/file/route.ts` | The bytes of one indexed asset: a video, a diagram, a transcript |

The asset route is the one place the app reads a file the deployment does not
contain. A video sits under manimkc's data root and a diagram under
`learn/assets/`, so neither is servable by Next, and the URL carries an asset
id rather than a path: the id is a primary key, the row's `path` is joined onto
a root chosen by the row's own `source_repo`, and the result is proved to be
inside that root before and after symlinks are resolved. It is off unless
`ASSET_FILES_ENABLED` is set, the shape decision D11 in
[docs/TLDRAWKC-INTEGRATION.md](docs/TLDRAWKC-INTEGRATION.md) uses for the
studio, because production has none of these files. The reasoning for each
header it sets is in `apps/web/src/lib/asset-files.ts`.

The session route declares `generateStaticParams()` over every course and
module pair, so the shell is prerendered and only the chat is live.

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
| `POST /api/learner/preference` | Theme, last visited, the learner's own links |
| `POST /api/learner/import` | The one-time carry-over of a browser's old document |

Every one of them is `handler()` from `apps/web/src/lib/learner-api.ts`: same-origin
through the existing `agent/guard.ts` helpers, a rate limit, a bounded body,
and validation. `/api/learner/preference` writes an allow-list of keys rather
than any key, because an unauthenticated open jsonb store is not something
"the learner owns their own row" excuses.

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
same function is what `catalog index` parses courses with, so the page and the
row cannot disagree about what a file means; before this there were TypeScript
literals on one side, a private `YamlCourse` interface on the other, and a
parity test that could only notice drift after it happened.

`apps/web/src/data/courses/index.ts` is the app's view of that: `import "server-only"`,
one `loadCourses()` at module scope (read once per process), and the lookups
pages call — `getCourse`, `getModule`, `findTopic`, `getCourseTopicIds`,
`getRelatedCourses`, `totalTopicCount`. `apps/web/src/data/content.ts` is the same shape
over `content/tags.yaml`.

**Server only, and enforced.** `server-only` makes a `"use client"` module that
reaches either of them fail the build with the import chain printed, rather
than shipping a YAML parser and every course file to the browser. So client
components take what they need as props: the module page resolves the course,
module and topic and hands them to `TopicChecklist` and `AgentSession`; the
root layout projects the shortlist into `CourseNavEntry[]` for the sidebar. The
arithmetic those components still do lives in `apps/web/src/lib/curriculum.ts` and
`apps/web/src/lib/progress.ts`, which are pure functions over a course the caller
already holds.

Each course carries an `inferred` flag. `true` means the syllabus was
reconstructed from the course announcement and the standard treatment of the
subject rather than read off an official document. Three of the ten are
inferred, and `packages/content/test/courses.test.ts` pins exactly which. A
page with `inferred` renders `InferredBanner`, and the agent prompt is told to
flag uncertainty for those courses.

Courses also carry an `order:`, which is the order the home page and the
sidebar render in. It is authored because the shortlist is curated: sorting ten
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

The prompt is assembled server-side from course data plus whatever recap the
browser sent along. `objectives.ts` derives the session's success criteria
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
| `apps/web/src/lib/learner-store.test.ts` | Reads degrading to empty with no database, and a write refusing to |
| `apps/web/src/app/learn/page.test.ts` | `/learn` rendering when the database is unreachable, and when it is simply empty |
| `apps/web/src/app/api/learner/routes.test.ts` | The six write routes: the origin guard, the allow-list, 400 versus 503 |
| `apps/web/src/lib/asset-files.test.ts` | Range arithmetic, containment, the closed content-type list. No database, so it is a gate everywhere |
| `apps/web/src/app/api/assets/asset-file.test.ts` | The asset file route end to end: a 200, a 206, a 416, the four refusals, a stale index, the production gate |
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
   learn/concepts/*.md ────┼──► catalog index ──► Postgres ──► catalog ls / show / path / search
   learn/sessions/*.md ────┤       (indexers)      (derived)          (agents read here)
   tldrawkc list  ─────────┤
   manimkc topics --json ──┤
   manimkc mirrors --json ─┘
```

**Everything in the content half is derived.** `topic`, `concept`,
`collection`, `curriculum_item`, `asset` and the seven link tables are rebuilt
from files in git by `npm run catalog -- index`. Drop the database and one index
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
   `catalog index` (rule 11). Anything that would *write* content from here is
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
    the store, and writes only `progress`, `recap` and `preference`. `event`,
    `mastery` and `review` are written by the CLI, never by a page. The only
    writer of the content tables is `npm run catalog -- index`, and the only
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
