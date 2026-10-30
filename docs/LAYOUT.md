# Layout

Where everything in this repository lives, and which home a new file belongs
in. [ARCHITECTURE.md](../ARCHITECTURE.md) explains how the pieces behave; this
is the map you read first when the tree itself is the question.

The rule that sorts the top level: `apps/` is what a person runs,
`packages/` is what several things import, `services/` is what owns a
connection or a command surface of its own, `tools/` is what belongs to
another repository, and `scripts/` is what is left of the pipeline's maths
plus one-off jobs. `docs/` is what you are reading, `seed/` is the content a
fresh clone starts from, and `.studio/` is generated state, never source.

```
gnosia/                           the checkout
├── apps/
│   ├── web/                      the Next.js app, @gnosia/web
│   └── macos/                    the SwiftUI app, a SwiftPM package + an npm shell
├── packages/                     schema · content · blob · tutor
├── services/                     catalog · studio · sidecar
├── tools/                        five git submodules (another repo each)
├── scripts/                      learn's maths and shim, one-off jobs
├── seed/                         a content slice in the export format
├── docs/                         these documents
└── .studio/                      the studio runner's state, gitignored
```

## The rename

The product is Gnosia, renamed from self-learn: the workspace names are
`@gnosia/web`, `@gnosia/catalog`, `@gnosia/schema`, `@gnosia/content`,
`@gnosia/blob`, `@gnosia/tutor`, `@gnosia/studio`, `@gnosia/sidecar` and
`@gnosia/macos`. `GNOSIA_HOME` is the data-root variable everywhere, and
the web keeps the legacy storage key and cookies readable
(`self-learn:v1`, `self-learn-theme`, `self-learn-motion`).

## apps/web — the web app

Next.js, the app router, server components with client islands opted into
one at a time. Nothing under it knows the CLI exists; it reaches the catalog
through `@gnosia/catalog/state` and content through the reader seam in
`src/data/`, never the database directly.

```
apps/web/
├── src/
│   ├── app/                      routes, in two groups, plus api/
│   ├── components/               every React component
│   ├── lib/                      the logic the routes share
│   ├── data/                     server-only reads of the content half
│   ├── proxy.ts                  the front door (runs before every route)
│   └── test/                     helpers for the app-level vitest files
├── public/                       the brand images and the social card
├── next.config.ts                the /today → /home redirect lives here
└── vercel.json                   the production deploy's frame
```

`src/proxy.ts` is the session gate: every path except `/`, `/sign-in` and the
auth routes needs an owner cookie, a page gets a 307 to sign-in and an API
call a JSON 401. The matcher spares only Next's own static output and the
public images; `/api/` is deliberately inside it, since the learner routes
write the only copy of the study record.

`src/app/` splits on purpose:

- `(site)/` — the signed-out world: `page.tsx` (the landing at `/`),
  `sign-in/` (the form, `ProbeDemo.tsx` the demo on it), `site.ts`. Its own
  `layout.tsx`, so the landing ships none of the app's shell.
- `(app)/` — the signed-in shell, `layout.tsx` seeds `LearnerProvider` with
  the learner snapshot read on the server, which is why every page under it
  is dynamic. The destinations:

| Route | Directory | What it is |
| --- | --- | --- |
| `/home` | `home/` | The dashboard: threads to pick up, what they open next, due cards worth a recall, courses in progress |
| `/courses` | `courses/` | The cover-card grid, tag filter and search; `[slug]/` the course home, `[slug]/[module]/` the same page with the module named by the URL, `…/session/` the topic's tutor chat, `…/check/` the module's week check |
| `/learn` | `learn/` | The concept index; `[concept]/(workspace)/` the concept's workspace, `[concept]/session/` the session in focus mode |
| `/library` | `library/` | The asset grid, kind chips and search; `[id]/` one asset's page |
| `/review` | `review/` | The due cards in focus mode |
| `/ask` | `ask/` | The open tutor: a conversation that is not saved and moves no mastery |
| `/studio` | `studio/` | The studio surface: the runner's corpus and queue over its loopback API (see `api/[...segments]/` below, and `d/[name]/`, `made/[draft]/`) |
| `/settings` | `settings/` | Theme, tutor style, provider keys and the model chain, export and reset |

`layout-frames.test.ts` sits in `(app)/` beside the layout because the shell's
`data-layout` widths are a page contract, and `error.tsx`/`not-found.tsx` are
the group's boundaries; the root `app/not-found.tsx` is the address nobody
matched.

- `app/api/` — the route handlers, enumerated fully in
  [API.md](API.md#the-web-app): `agent/` the four tutor turns, `learner/` the
  state writes and reads, `review/`, `assets/[id]/` the four byte routes,
  `concepts/` and `courses/` the two content reads, `auth/` sign-in and
  sign-out. Body-bearing routes go through `lib/learner-api.ts`'s `handler`
  or the agent guard's same-origin check and rate limit.

`src/components/` mirrors the surfaces rather than a design system taxonomy:
`shell/` the frame, `ui/` the redesign's primitives, and one folder per
surface — `home/`, `courses/` and `course-home/`, `learn/` and `workspace/`,
`library/` and `session/` (the focus-mode player), `review/`, `ask/`,
`settings/`, `studio/` — plus the cross-cutting leaves `AppShell`,
`ConceptGraph`, `VideoPlayer`, `NoteProse`, `markdown.ts`, `media.ts`,
`brand/` and `avatar/` (the mark, the mascot, the pickers). A component that
serves exactly one page lives beside it or in that folder; nothing here is
imported by `services/` or `packages/`.

`src/lib/` is the app's logic, every mutation behind it. The important
leaves:

| Module(s) | Owns |
| --- | --- |
| `learner-context.tsx`, `learner-store.ts`, `learner-api.ts` | The provider seeded with the snapshot, the pool and reads, and `handler()` — the shared same-origin, rate-limited, bounded-body envelope every learner route uses |
| `storage.ts` | The pure reducers: the optimistic half of every mutation, so what the UI shows and what the request body says cannot disagree |
| `agent/` | The request-side of the tutor: guards, prompts, objectives, providers view; the turns themselves moved to `packages/tutor` |
| `auth/` | `core.ts` the session cookie and config, `session.ts` the server read |
| `provider-keys/`, `tutor-models/`, `custom-providers/`, `providers/` | The BYOK seal, the model chain, the owner's own providers and how Settings views them |
| `asset-files.ts`, `blob-store.ts`, `asset-problems.ts`, `asset-library.ts`, `library*.ts` | An asset row to its bytes, the store the routes read, the refusal codes, and the library's reads and groupings |
| `concept-*.ts`, `concept-workspace*.ts`, `kb/` | The concept graph and the workspace's read model |
| `course-*.ts`, `module-path.ts`, `week-check*.ts` | The course home, the learning path and the week check's plan |
| `home*.ts`, `recent*.ts`, `ask*.ts`, `playback.ts`, `review-*.ts`, `domain-*.ts`, `learn-index.ts`, `map-reading.ts` | The surfaces' read models and arithmetic |
| `studio*.ts`, `conversation-*.ts`, `tutor-studio.ts`, `tutor-handoff*.ts` | The web half of the studio surface: the runner client, the corpus reads and the tutor→studio hand-off |
| `owner.ts`, `settings.ts`, `preference*.ts`, `theme-cookie.ts`, `byok-*.ts` | Owner scope, settings reads, the preference keys, the theme cookie |
| `transcript.ts`, `svg-text.ts`, `download-name.ts`, `days.ts`, `time-zone.ts` | Sidecar parsing, SVG text measurement, file names, date math |

`src/data/` is the composition root the pages import: `source.ts` picks the
content source (the database, or a refusal naming `catalog flip <type>`),
`courses/` the course lookups every page calls, `content.ts` the tags,
`topics.ts` the vocabulary. All `import "server-only"`.

## apps/macos — the native app

A SwiftPM executable package, `Package.swift` at its root and
`swift run Gnosia` or `scripts/bundle-app.sh` (which codesigns a `Gnosia.app`
bundle with an `Info.plist` and icon) to run it. The `package.json` beside it
exists only so the snapshot script's npm dependency (`better-sqlite3`)
resolves inside the workspaces: `npm run snapshot -w @gnosia/macos`
refreshes `app-catalog.db`.

```
apps/macos/
├── Package.swift                 the executable target and its C shim
├── Sources/
│   ├── CSQLite3/                 sqlite3's module map; no code of ours
│   └── Gnosia/                   the app, one file per surface or model
├── Resources/                    in Sources/Gnosia: the mark and wordmarks
├── scripts/
│   ├── catalog-snapshot.mjs      catalog.db → app-catalog.db
│   └── bundle-app.sh             .app bundle, adhoc-signed
└── package.json                  the snapshot script's npm shell
```

`Sources/Gnosia/` keeps one ownership per file, and the file's header comment
says which web surface it ports. The read model first:

| File | Owns |
| --- | --- |
| `CatalogStore.swift` | The whole read model: `app-catalog.db` opened read-only, `learner.db` merged over it, the catalog's paths resolved (see the data root below). `SQLiteDatabase` in the same file is the raw SQLite shell |
| `LearnModel.swift` | The learning arithmetic ported to the mirror: BKT buckets, the learn index, the review queue, home's threads — kept in step with the named `apps/web/src/lib/` modules |
| `LearnerStore.swift` | The writable half: `learner.db`'s `watch`, `favorite`, `asset_name`, `progress` marks and the `session`/`event`/`mastery`/`review` tables a check session writes, column for column the catalog's |
| `LearnerControls.swift` | The write affordances (star, mark watched, rename, topic tick); every write is `LearnerStore` then `refreshLearner()` |

The process clients and their lifecycles:

| File | Owns |
| --- | --- |
| `SidecarManager.swift` | Spawning `npx tsx services/sidecar/src/index.ts`, parsing the one `listening <port>` stdout line, handing the port to the client |
| `SidecarClient.swift` | Every call to the sidecar: `/api/health`, the four `/api/agent/*` turns, and the `/api/learner/provider-key*` and `/api/learner/tutor-model*` settings routes |
| `StudioManager.swift` | Connect-only: the port probe on 7250 and the five polled reads. It never launches the runner — the reasons are in its header |
| `StudioClient.swift` | The studio routes the surface uses: health, diagrams (+svg, verbs, commit), jobs (+log, shot, sheets, media, actions), videos, drafts (+messages, draw, abandon), mirrors POST, vocabulary |

The shell and destinations (`GnosiaApp.swift` is the entry point,
`RootView.swift` the `NavigationSplitView` sidebar):

| File | The destination it owns |
| --- | --- |
| `HomeView.swift` | The dashboard, in the web `/home`'s shape |
| `CoursesView.swift`, `CourseDetailView.swift`, `ModuleView.swift` | The cover grid, the course home, the module's learning path |
| `LearnView.swift`, `ConceptDetailView.swift` | The concept index, one concept's workspace |
| `SessionModel.swift`, `SessionView.swift` | The concept session in both modes (Teach me, Quiz me): plan, questions, the observe-equivalent write into `learner.db` |
| `ReviewView.swift` | The due queue, read-only — grading stays in the web app and CLI |
| `LibraryView.swift`, `AssetDetailView.swift`, `VideoDetailView.swift`, `MediaViews.swift` | The grid, the per-kind detail dispatch, the video page, and the AVKit/PDFKit/QuickLook surfaces |
| `AskView.swift`, `AssetAskPanel.swift` | The open tutor, and the asset chat as an inspector panel |
| `SettingsView.swift`, `TutorSettingsView.swift` | The ⌘, pane: where `app-catalog.db` is, and the tutor's keys and chain through the sidecar |
| `StudioView.swift`, `StudioDetails.swift`, `SvgRasterizer.swift` | The studio surface, its job/diagram/draft detail screens, and the one-WKWebView SVG rasterizer they share |
| `Theme.swift` | The brand palette, token for token from the web's `.gnosia` blocks |

## services/catalog — the catalog database and the CLIs

The only thing in the repo that talks to the catalog's SQLite file;
`drizzle-sqlite/` holds the generated migrations (`drizzle/` is the Postgres
set the port came from). `src/` divides by who a file serves:

| Directory | What lives there |
| --- | --- |
| `src/state/` | The learner store — the only writer of `event`, `mastery`, `review`, `progress`, `recap`, `preference`, `asset_name`, and the read-only content queries the web app imports (`knowledge-base.ts`, `assets.ts`, `recent.ts`, `drafts.ts`, …). The package's single published export |
| `src/content/` | The write seam: every change to the content half goes through it with an author, a reason and a revision, plus the readers (`readers/`) that turn rows back into `Course`s |
| `src/index/` | One indexer per source (the four video tools, diagrams, mirrors, sessions, vocabulary) plus `writer.ts`, the only module that issues their SQL |
| `src/commands/` | The `catalog` CLI's verbs, dispatched from `cli.ts` |
| `src/learn/` | The `learn` pipeline CLI (`cli.ts`, 17 commands), the vault (`vault.ts`, Obsidian pull/push), the course-edit commands and `paths.ts`, the only place a `LEARN_ROOT` tree's paths exist |
| `src/pdf/`, `src/poster/` | The upload-time recipes: a video's pages-as-PDF and its poster frame |
| `src/canvas.ts`, `src/env.ts`, `src/db.ts`, `src/migrations.ts` | The `npm run canvas` launcher, the env resolution every tool root goes through, the pool, and `catalog migrate` |

## services/sidecar — the tutor's loopback API

Five files, no framework, `node:http` on `127.0.0.1` only: `index.ts` binds
an ephemeral port (or `GNOSIA_SIDECAR_PORT`) and prints exactly one line,
`listening <port>`, on stdout — that is the contract `SidecarManager` parses.
`api.ts` is the route table (`TURNS`, method-aware), mapping the web app's
own `/api/agent/*` and `/api/learner/*` tutor paths to the same
`packages/tutor` `*Turn` functions; `guard.ts` the host/origin checks a
browser can't fake; `deps.ts` builds `TutorDeps` over the catalog's pool and
the blob store; `config.ts` the host, port and owner
(`GNOSIA_SIDECAR_OWNER`, default `local`). The macOS app launches it; its
routes are enumerated in [API.md](API.md#the-sidecar).

## services/studio — the runner

`npm run studio`: the job runner and loopback API on `127.0.0.1:7250`
(`STUDIO_PORT`), a process of its own and never inside Next — a queue in a
dev server dies on every hot reload. `src/api.ts` is the one route table;
`src/paths.ts` the only place a path is resolved (the layering rule the file
itself explains); `src/config.ts` the knobs; `src/index.ts` the process:
load, reconcile, listen.

Domain folders, per [SERVICES-STRUCTURE.md](SERVICES-STRUCTURE.md): `agent/`
the harnesses (`claude`, `codex`, BYOK), `diagram/` the diagram pipeline
(runner, brief, prompt, gate, compare), `drafts/` the planner conversations,
`canvas/` the tldrawkc wrapper and mirrors, `data/` the catalog client, blob
store and job records, `probes/` health and cached listings, `manual/` the
tldraw manual the drawing prompt is built from, `video/` the video pipeline
with a `backends/` seam and a folder per tool (`remotionkc/`, `revideokc/`).
Tests stay flat under `test/`.

## packages/

The bottom of the stack, npm workspaces, Node-only.

| Package | Owns |
| --- | --- |
| `packages/schema` | The Drizzle table definitions — the source of every migration — plus `shared.ts`, the subpath that imports nothing and so is safe inside `"use client"` |
| `packages/content` | The export-format reader: `loadCourses`, `loadTopics`, `loadTags`, the types and the `ContentSource`/`selectSource` seam. Reads files, connects to nothing |
| `packages/blob` | `BlobStore`, the `<owner>/<sha256>.<ext>` key scheme and the `fs` adapter under the data root's `blobs/` ([README](../packages/blob/README.md)) |
| `packages/tutor` | The tutor, split `src/` (the pure half: prompts, providers, session core, judges — most of it ported from `apps/web/src/lib`) and `src/server/` (`deps.ts`, `turns.ts` with the `*Turn` functions, credentials, model list). Both the web routes and the sidecar call the same functions |

## tools/

Five git submodules, each its own repository with its own AGENTS.md —
`manimkc/`, `remotionkc/`, `revideokc/`, `blenderkc/` (the video tools) and
`tldrawkc/` (the canvas). Deliberately outside the workspaces list: an
`npm ci` at the root must not try to install trees this repo does not own.
Three are private, so a clone without access leaves their directories empty
and needs nothing from them. Each has a `*_ROOT` variable naming the
checkout (`services/catalog/src/env.ts` resolves it) and a `*_HOME` naming
its data root, which the catalog never reads — the indexers take output
locations from each tool's `topics --json` `outRoot`.

## scripts/

`learn/` holds `cli.mjs`, the published `npm run learn` entry point — a shim
that spawns `services/catalog/src/learn/cli.ts`, kept because the skills and
docs name this path — and `lib/`, the pipeline's pure maths (`bkt`, `graph`,
`schedule`, `markdown`, `render`, `session-log`), imported by the TypeScript
CLI and by the web app. The rest are one-off jobs: `dev.sh`
(`dev:up`/`dev:down`, the dev processes), `nightly-export.mjs` (the dated
export under the data root's `archive/`), `e2e.mjs`, `demo-record.mjs` (a
PR's browser video, its scenarios in `demo-scenarios/`), `flip-rehearsal.mjs`,
`move-course-covers.mjs`, `update-gitmodules.sh`, `link-design-systems.py`,
`course-covers.json`, and `lib/` (the scripts' own helpers — `pg.mjs`,
`dev-env.mjs`, `cutover.mjs`, `flip-order.mjs`, and `app-harness.mjs`, the
seed catalog and `next start` that `e2e.mjs` and `demo-record.mjs` share).

## .studio/

The studio runner's `$STUDIO_HOME`, defaulting to `<repo>/.studio` and
gitignored, because a job workspace holds an agent transcript and a
permission file naming this machine's home directory. `jobs/<id>/` one
workspace per job (its `candidate/`, `scratch/`, `tmp/` and the before/after
shots), `work/` the diagram checkouts the canvas verbs run on, `drafts/` the
planner conversations, `manual/` the built manuals by hash, `cache/` the
last-good topic vocabulary, `byok.json` the runner's own provider keys. It
is created by `npm run studio` — a fresh clone has no `.studio/` — and
deleted at will: nothing in it is the only copy of anything.

## The data root — `~/.gnosia`

Not in the repository at all, and deliberately so: the data a generator
produces should not be pinned inside a checkout it can be moved out of.
Resolved as `GNOSIA_HOME`, then `~/.gnosia`. `GNOSIA_CATALOG` and
`GNOSIA_BLOBS` override the two files directly.

| Path | What it is |
| --- | --- |
| `blobs/` | The `fs` blob store: every asset's bytes keyed `<owner>/<sha256>.<ext>` |
| `catalog.db` | The live catalog database — the SQLite file `CATALOG_DB`/`DATABASE_URL` names, which `services/catalog` and the web app read and write |
| `app-catalog.db` | The snapshot `apps/macos/scripts/catalog-snapshot.mjs` mirrors out of `catalog.db`; the native app's read model, replaced wholesale each run |
| `learner.db` | The native app's writable store: its marks and the learning state its sessions write |
| `topics/` | A checkout per video tool of its topic sources (`topics/manimkc/` is itself a git repo holding `agentic-ai/`, `algorithms/`, …): authored material kept outside the submodules, so a tool's move or a fresh clone loses no source |
| `manimkc/`, `remotionkc/`, `revideokc/`, `blenderkc/` | The tools' `*_HOME` data roots when the owner keeps them here: renders, narration caches, state |
| `tool-checkouts/` | Second checkouts of the tools (`manimkc/`, `remotionkc/`, `revideokc/`), for runs that must not touch the repo's |
| `archive/` | The nightly export's dated copies |
| `vault/` | The Obsidian vault `learn vault pull` writes |
| `checkout/` | The owner's primary clone of this repository — the checkout the tools' rules resolve against |

Which of these a given machine has is convention, not code: the catalog reads
each tool's checkout from its `*_ROOT` variable and its output location from
the report's `outRoot`, so nothing in `services/` goes looking under
`~/.gnosia`. The two databases are not peers: `catalog.db` is the authority
and `app-catalog.db` a mirror of it, never the other way.
