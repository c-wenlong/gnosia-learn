# Architecture

self-learn is two programs and a knowledge base sharing one repository. A
Next.js app renders course roadmaps and progress in the browser; a Node CLI
runs a Probe → Plan → Teach → Close tutoring loop over plain files on disk.
They meet at exactly one file, and neither imports the other.

## The shape

Three layers plus two submodules. One layer is not in this repo at all.

```
   learning plugin                    this repo
   (installed globally)
     /learn   /review        ┌────────────┬────────────────┬──────────┬───────────┐
         │                   │            │                │          │           │
         │  npm run learn    │            │                │          │           │
         └──────────────► scripts/learn  learn/           src/    manimkc/   tldrawkc/
                          the CLI     the knowledge   the web app  submodule  submodule
                              │           base             │           │           │
                              └──writes───►  ◄────reads────┘           └─writes────┘
                                          learn/assets/
```

| Layer | Where | What |
| --- | --- | --- |
| Instructions | `learning` plugin, `learning` marketplace | The `/learn` and `/review` skills, plus the `concept-mapper`, `fact-checker` and `diagram-maker` subagents |
| Code | `scripts/learn/`, `src/` | The pipeline CLI and the web app |
| Data | `learn/` | Concept notes, session logs, diagram assets, the event log and its derived caches |
| Assets | `manimkc/` | A separate repo, wired in as a submodule, that renders narrated animation videos |
| Assets | `tldrawkc/` | A separate repo, wired in as a submodule, that draws teaching diagrams on a tldraw canvas and exports SVG into `learn/assets/` |

The instruction layer lives at `~/.quiver/plugins/learning/learning` so the
skills work from any project, not just this one. Both skills open by running
`npm run learn -- status` and stop if it fails, so invoking `/learn` where the
pipeline does not exist says so rather than improvising a session that records
nothing. A local copy under `.claude/` would shadow the plugin and drift, so
there is none.

## The layout

`src/` is the web app. Nothing under it knows the CLI exists.

| Directory | Owns |
| --- | --- |
| `src/app/` | Routes, the root layout and metadata, and the two agent API handlers |
| `src/components/` | Every React component: shell, sidebar, progress, checklists, recaps, the concept graph |
| `src/lib/` | `storage.ts`, `learner-context.tsx`, `progress.ts`, `curriculum.ts`, `types.ts` |
| `src/lib/agent/` | `providers.ts` (the provider cascade), `prompt.ts`, `objectives.ts`, `summary.ts`, `lookup.ts` |
| `src/lib/kb/` | `load.ts` and `types.ts`: the only place that reads `learn/` |
| `src/data/courses/index.ts` | Server-only view of `content/courses/`: the course lookups every page calls |
| `src/data/content.ts` | Server-only view of `content/tags.yaml`: the cross-course themes |

`packages/` and `services/` are npm workspaces, Node-only, with their own
tsconfigs.

| Directory | Owns |
| --- | --- |
| `packages/content/` | The reader for `content/`: `loadCourses`, `loadTopics`, `loadTags`, and the `Course` types |
| `packages/schema/` | Every table shape, and the row types inferred from them |
| `services/catalog/` | The connection, the migrations, the indexers and the `catalog` CLI |
| `content/` | Authored data: the topic vocabulary, the theme tags and the course YAML |

`scripts/learn/` is the pipeline. Plain ESM, no build step, no runtime
dependencies, so `node scripts/learn/cli.mjs` works on a clone with nothing
installed.

| Module | Owns |
| --- | --- |
| `cli.mjs` | Dispatch and presentation for all 17 commands (`init`, `status`, `concept`, `check`, `probe`, `observe`, `frontier`, `plan`, `teach`, `review`, `session`, `void`, `model`, `map`, `index`, `doctor`, `help`) |
| `lib/paths.mjs` | Every path under `learn/`; the single source of layout truth |
| `lib/store.mjs` | Reading and writing state and concept notes, atomically (temp file plus rename) |
| `lib/bkt.mjs` | Bayesian Knowledge Tracing: the belief update, information gain, propagation |
| `lib/graph.mjs` | The concept DAG: topological sort, cycles, ancestors, frontier, plan path |
| `lib/schedule.mjs` | SM-2 spaced repetition |
| `lib/markdown.mjs` | Frontmatter, wikilinks and `check` blocks, hand-rolled so no YAML parser is needed |
| `lib/render.mjs` | The mermaid map and the JSON index the web app reads |
| `lib/session-log.mjs` | Obsidian callout rendering for the live session log |

`paths.mjs` is the bottom of this stack: it imports nothing from the project.
`store.mjs` imports `paths`, `markdown` and `bkt`; `graph` imports `bkt`;
`render` imports `bkt` and `graph`. `cli.mjs` is the only module that prints.

`packages/` and `services/` are npm workspaces, added for the catalog. `src/`
imports `packages/content` and nothing else from them: the web app is a reader
of the same content files, not a client of the database.

| Workspace | Owns |
| --- | --- |
| `packages/content/` | `loadCourses`, `loadTopics`, `loadTags`, and the content types. Reads files, connects to nothing. |
| `packages/schema/` | The Drizzle table definitions and the row types inferred from them. Connects to nothing. |
| `services/catalog/` | `db.ts` (the pool), `migrations.ts`, `drizzle/` (generated SQL), and `cli.ts` |

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

The session route declares `generateStaticParams()` over every course and
module pair, so the shell is prerendered and only the chat is live.

## Learner state

Everything the learner does in the browser lives in one localStorage entry:
key `self-learn:v1`, schema version 2 (`CURRENT_STATE_VERSION` in
`src/lib/types.ts`). Nothing is sent to a server and there is no account.

`src/lib/storage.ts` owns the whole shape. Every mutation is a pure function
from state to state (`toggleTopic`, `setNote`, `recordKnowledge`,
`resetCourseProgress`, ...), which is what makes the module unit-testable
without a DOM. `migrateState` brings any older persisted shape forward; v1 to
v2 was purely additive (it added `knowledge`), so old progress survives.

Recaps are the part that can grow without bound, so they are clamped on the
way in by `KNOWLEDGE_LIMITS`:

| Limit | Value | Applies to |
| --- | --- | --- |
| `summaryChars` | 1200 | The recap summary |
| `listItems` | 8 | Key points, misconceptions, open questions |
| `itemChars` | 300 | Each item in those lists |

`saveState` returns a result rather than throwing, because a full quota is a
real failure mode the UI has to surface. `src/lib/learner-context.tsx` wraps
all of this in a `useSyncExternalStore` subscription: one module-level
snapshot, a listener set, and a `LearnerProvider` that hands components
`state` plus named actions. The server snapshot is `defaultState()`, so the
first render matches on both sides and hydration is quiet. `AppShell` (a
client component) consumes the same context for the global progress bar and
the theme toggle.

Theme is the one piece of state read outside React: the root layout injects a
tiny inline script that reads `self-learn:v1` and sets the `dark` class before
first paint, so a dark-mode reload does not flash white.

## The course data model

Ten courses, one YAML file each under `content/courses/`, read by
`loadCourses()` in `packages/content`. A course holds modules, a module holds
topics, a topic holds subtopics and the module holds curated resources. The
same function is what `catalog index` parses courses with, so the page and the
row cannot disagree about what a file means; before this there were TypeScript
literals on one side, a private `YamlCourse` interface on the other, and a
parity test that could only notice drift after it happened.

`src/data/courses/index.ts` is the app's view of that: `import "server-only"`,
one `loadCourses()` at module scope (read once per process), and the lookups
pages call — `getCourse`, `getModule`, `findTopic`, `getCourseTopicIds`,
`getRelatedCourses`, `totalTopicCount`. `src/data/content.ts` is the same shape
over `content/tags.yaml`.

**Server only, and enforced.** `server-only` makes a `"use client"` module that
reaches either of them fail the build with the import chain printed, rather
than shipping a YAML parser and every course file to the browser. So client
components take what they need as props: the module page resolves the course,
module and topic and hands them to `TopicChecklist` and `AgentSession`; the
root layout projects the shortlist into `CourseNavEntry[]` for the sidebar. The
arithmetic those components still do lives in `src/lib/curriculum.ts` and
`src/lib/progress.ts`, which are pure functions over a course the caller
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

Both routes run on the Node runtime and share `src/lib/agent/providers.ts`,
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

`cli.mjs` parses with `node:util`'s `parseArgs` in strict mode, dispatches on
the first positional, and runs `ensureDirs()` before every command. Every
command takes `--json`. Anything that carries evidence appends to the event
log first and updates the caches after.

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
  state/
    events.jsonl               every observation, append-only  (SOURCE OF TRUTH)
    model.json                 mastery per concept             (derived)
    reviews.json               the SM-2 schedule               (NOT rebuildable)
    index.json                 the snapshot the web app reads  (derived)
  map.md                       the mermaid knowledge map       (derived)
```

Today that holds 32 concepts across four domains (algorithms 21, transformers
7, agents 2, foundations 2) and three session logs.

The folder is presentation only: a concept's id stays the bare slug, because
ids appear in every `requires:` edge, every wikilink, `reviews.json` and
`events.jsonl`. Moving a note between domains would otherwise orphan its whole
history. The domain is read back from the path rather than stored in
frontmatter, so the two can never disagree, and nesting is one level deep.

`events.jsonl` is the database. `model.json`, `index.json` and `map.md` are
caches that `learn model --rebuild`, `learn index` and `learn map` re-derive
from it, which is what makes changing a BKT parameter safe. `reviews.json` is
the documented exception: review events are logged, but no command replays
them, so deleting that file loses every scheduled review permanently.

`assets/` is the one folder the CLI neither writes nor reads. Diagrams have
always been written there by the `diagram-maker` subagent at a path it chose,
and `tldrawkc/` keeps that behaviour: it writes the pair and the session log
embeds the SVG by name. The `.tldr` is committed beside the `.svg` so the next
session can open the canvas and extend it instead of redrawing. An exported
SVG is self-contained, which means the two fonts it uses are inlined as
base64 and a small diagram lands around 440 kB.

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

One direction, one file, no imports across the boundary.

```
   /learn   /review                       the skills call the CLI, never the files
        │
        │  npm run learn -- <command>
        ▼
   scripts/learn/cli.mjs
        │
        │  reads and writes
        ▼
   learn/concepts   learn/sessions   learn/state   learn/map.md
                                          │
                                          │  learn index  writes state/index.json
                                          ▼
   src/lib/kb/load.ts     readFileSync, server-only, never writes
        │
        ▼
   src/app/learn         renders stats, frontier, due reviews, the SVG graph
```

`loadKnowledgeBase()` reads `learn/state/index.json` relative to `process.cwd()`,
normalizes every field, and drops any edge whose endpoints are not both present.
A missing or malformed file yields `EMPTY_KB` rather than failing, because a
fresh clone that has not run the pipeline is a legitimate state, not an error.
`/learn` sets no dynamic marker, so the page is prerendered and the snapshot is
baked in at build time: a pipeline run does not change the deployed page until
the next deploy.

`ConceptGraph` renders the DAG as plain SVG with a longest-path layering. No
graph library, and server-safe, so the whole graph ships as static markup.

## Metadata and assets

`src/app/icon.png` and `src/app/apple-icon.png` use the Next file conventions,
so the favicon and the touch icon need no markup.

The social card does not. `public/opengraph-image.png` is declared by hand in
`src/app/layout.tsx` because under Turbopack the `app/opengraph-image.png`
convention ignores the documented `opengraph-image.alt.txt` sidecar, and the
card would ship with no alt text.

`resolveSiteUrl()` in the same file computes `metadataBase`: it prefers
`NEXT_PUBLIC_SITE_URL`, falls back to Vercel's injected
`VERCEL_PROJECT_PRODUCTION_URL`, adds `https://` when the value has no scheme,
and falls back to `http://localhost:3000` on anything unparseable. It warns
instead of throwing, because it runs while the root layout loads and a bad
value should cost a link preview rather than the whole app.

## Testing

`npm test` runs vitest over both halves: `src/**/*.test.ts` and
`scripts/**/*.test.mjs`, in the `node` environment, with `@` aliased to `src`.
Eleven test files, split six and five.

| File | Covers |
| --- | --- |
| `src/lib/storage.test.ts` | Migration, clamping, every state mutation |
| `src/lib/progress.test.ts` | Counting completed topics per module, course and globally |
| `src/lib/agent/providers.test.ts` | Which providers resolve from which keys, and the fallback walk |
| `src/lib/agent/prompt.test.ts` | The assembled system prompt, session context, and topic lookup |
| `src/lib/agent/summary.test.ts` | Transcript formatting and parsing a recap back out |
| `packages/content/test/courses.test.ts` | Curriculum invariants (the shortlist, unique ids, which syllabi are inferred) and every refusal the reader makes |
| `src/data/courses/index.test.ts` | The lookups the pages call, over whatever the reader returned |
| `scripts/learn/cli.test.mjs` | `void` retracting a session's evidence, and `observe` writing the session log |
| `scripts/learn/lib/bkt.test.mjs` | Posterior, transit, entropy, information gain, propagation |
| `scripts/learn/lib/graph.test.mjs` | Cycles, dangling edges, topological order, frontier, plan |
| `scripts/learn/lib/schedule.test.mjs` | SM-2 conformance, including the ease-on-lapse rule |
| `scripts/learn/lib/markdown.test.mjs` | Frontmatter round-trips, wikilinks, check blocks |

Coverage is scoped to `src/lib`, `src/data` and `scripts/learn` by design.
Components and pages are verified by `npm run build` and by looking at the
running app, so counting their lines would only dilute the number that matters.

## The catalog

`services/catalog/` and `packages/schema/` are a derived index over the content
trees, in Postgres 17. Full reasoning in
[services/catalog/SCHEMA.md](services/catalog/SCHEMA.md); the shape of it is:

```
   content/topics.yaml ─┐
   content/courses/*.yaml ─┤
   learn/concepts/*.md ─┼──► catalog index ──► Postgres ──► catalog ls / show / path / search
   learn/assets/* ──────┤       (indexers)      (derived)          (agents read here)
   learn/sessions/*.md ─┤
   manimkc topics --json ┘
```

**Everything in the content half is derived.** `topic`, `concept`,
`collection`, `curriculum_item`, `asset` and the seven link tables are rebuilt
from files in git by `npm run catalog -- index`. Drop the database and one index
run restores it exactly. Nothing is authored in Postgres, which is why the
indexers may delete: a row the source no longer produces is not history, it is a
stale row, and the whole point of the catalog is that a rendered video cannot
outlive its source without anything saying so.

**The state half is the opposite.** `learner`, `event`, `mastery`, `review`,
`progress`, `recap` and `preference` are the only copy of what a learner did.
`event` is append-only, enforced by a trigger, and `mastery` and `review` are
projections that can be rebuilt by replaying it. Bundle 5 backfills these from
`learn/state/` and the browser's localStorage; until then they are empty.

| Piece | Where | What |
| --- | --- | --- |
| Table shapes | `packages/schema/src/` | `content.ts`, `state.ts`, `operations.ts`. Connects to nothing. |
| Migrations | `services/catalog/drizzle/` | Generated from the schema, applied by `catalog migrate`. |
| Indexers | `services/catalog/src/index/` | One module per source, each a pure "read files, return rows" function, plus one shared writer. |
| Read commands | `services/catalog/src/commands/` | `status`, `index`, `ls`, `show`, `path`, `search`, all with `--json`. |

Each indexer owns an asset id namespace (`note:`, `link:`, `manimkc:`,
`diagram:`, `session:`) and a set of tables. That ownership is what lets the
writer prune safely: a source may delete only rows it could have produced, so
one indexer can never remove another's. `--only` expands to include everything
downstream of what it names, because a prune cascades and a half-run index is
worse than none: it looks complete and answers with fewer rows.

### How agents read it

The command surface is deliberately layered, and no layer returns a whole tree.
An agent runs `status` to see what exists and how fresh it is, `ls` to get
titles and counts, `show` for one entity, and then reads the file at the path
`show` gave it. `show` never returns a body: the database holds paths and
metadata, git holds the words, and keeping a second copy of every note in
Postgres would put a staler one in front of the agent.

## Layering rules

1. **`src/` never imports from `scripts/`.** The web app does not know the CLI
   exists; the only mention is a comment in `src/lib/kb/load.ts` explaining who
   writes the file it reads.
2. **`scripts/` never imports from `src/`.** The pipeline runs on a clone with
   nothing installed, so it cannot depend on TypeScript, on the `@` alias, or
   on anything Next provides.
3. **The CLI is the only writer of `learn/`, except `learn/assets/`.** Every
   write goes through `lib/store.mjs`, which writes to a temp file and renames,
   so an interrupted run cannot truncate state. The carve-out is `assets/`,
   where the diagram agent has always written the file it names directly and
   `tldrawkc/` now writes the `.tldr` and `.svg` pair. Nothing in `learn/state/`
   or `learn/concepts/` has a second writer.
4. **The web app reads `learn/` and never writes it.** `src/lib/kb/load.ts` is
   the only file in `src/` that imports `node:fs`, and it only calls
   `readFileSync`. Course content is read the same way, one layer out: through
   `packages/content`, never with a `fs` call in `src/`.
5. **A module that reads content says `import "server-only"`.**
   `src/data/courses/index.ts` and `src/data/content.ts` both do. Without it a
   `"use client"` import would compile, ship a YAML parser and every course
   file to the browser, and only be noticed by whoever looked at a bundle
   report. With it the build fails and prints the import chain. Client
   components get resolved objects as props; pure arithmetic over a course they
   already hold lives in `src/lib/curriculum.ts`.
6. **Nothing in the pipeline outside `lib/paths.mjs` builds a path under
   `learn/`.** One exception is live inside the pipeline: `cli.mjs` composes
   `INDEX_FILE` from `STATE_DIR` as a template string instead of importing a
   constant. `learn/assets/` is outside the rule entirely, for the same reason
   as rule 3: the diagram agent picks `learn/assets/<concept-id>` and passes it
   to `tldrawkc`, which is a command run from the repo root and knows nothing
   about `paths.mjs`. Routing SVG bytes through `scripts/learn` to satisfy the
   rule would buy nothing the rule exists for.
7. **The skills never edit the knowledge base directly.** They go through
   `npm run learn -- <command>`, which is what keeps the event log complete.
8. **`cli.mjs` is the only module in the pipeline that prints.** Everything
   under `lib/` takes data and returns data.
9. **`packages/schema` connects to nothing.** It defines table shapes and
   exports the types inferred from them. The pool, the connection string and
   every query live in `services/catalog`, so the schema can be imported by the
   web app without dragging a database driver into the browser bundle.
10. **The schema is the source of the SQL, never the other way round.** Change
   `packages/schema/src/`, then `npm run generate -w @self-learn/catalog`. A
   migration that has been applied is never edited: drizzle keys them by file
   hash.
11. **The web app never writes the catalog.** `src/` may read it, through
    `packages/schema`'s types; today it reads the same content files the
    catalog indexes, through `packages/content`. The only writer is
    `npm run catalog -- index`, and the only thing it writes from is files in
    git. A page that could write the content half would make a derived table
    into a source of truth that no index run could reproduce.
12. **An indexer reads files and returns rows; it never touches a connection.**
    `services/catalog/src/index/*.ts` export a pure `read(context)`, and
    `writer.ts` is the only module that issues SQL for them. That seam is why
    the indexer tests need no Postgres and the writer tests need no files.
13. **An unresolved reference is a refusal, never a skip.** A concept, module or
    video whose topic does not resolve stops the index run with the file and the
    slug named. A skipped row is an asset that is silently absent from the
    catalog, which is the exact failure the catalog exists to catch.
