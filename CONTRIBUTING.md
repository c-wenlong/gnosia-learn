# Contributing to gnosia

Thanks for your interest in contributing! gnosia is a Next.js study hub
with a tutoring pipeline beside it, both over one SQLite database file. Both
halves are meant to stay readable: every write is a revision with a reason,
and `catalog export` turns the content back into plain files at any time.

## Getting started

```bash
git clone https://github.com/c-wenlong/gnosia.git
cd gnosia
npm ci
cp .env.example apps/web/.env.local   # then fix its DATABASE_URL line (see below)
npm run dev
npm test
```

The web app reads everything from the catalog, and a fresh clone's catalog is
built from [`seed/`](seed/README.md), the only content the repository holds:

```bash
npm run catalog -- migrate   # creates the catalog file, ~/.gnosia/catalog.db by default
MANIMKC_ROOT=/nonexistent REMOTIONKC_ROOT=/nonexistent REVIDEOKC_ROOT=/nonexistent BLENDERKC_ROOT=/nonexistent npm run catalog -- import seed
for t in topics tags concepts sessions courses diagrams; do npm run catalog -- flip $t; done
npm run catalog -- status
```

README.md, "Install", says why each step is there. The tests do not use this
database.

The catalog is one SQLite file, so there is no database server to install or
start ([docs/SQLITE-MIGRATION.md](docs/SQLITE-MIGRATION.md)). The catalog
tests never read your catalog: each suite makes its own scratch file under the
OS temp directory and removes it (`services/catalog/test/scratch-database.ts`),
and the end-to-end suite
imports [`seed/`](seed/README.md), a small real slice of the content in the
export format. The repository's `content/` and `learn/` went in phase 3 of
[docs/CONTENT-MIGRATION.md](docs/CONTENT-MIGRATION.md). A suite that needs a
tree of files takes a temp one (`LEARN_ROOT` for the `learn` CLI's file half),
never the repository. No test may write into `seed/`, or bring back a
`content/` or `learn/` at the root: `vitest.setup.ts` lists all three before
each test file and fails the one that changed them. `seed/` is regenerated
only with `catalog export --subset`, as its README says, and `EXPECTED` in `services/catalog/test/catalog.test.ts`
moves with it in the same commit.

`apps/web/.env.local` is where Next reads variables from: the app lives in
`apps/web/`, and Next loads `.env*` files from the directory it starts in, so
a copy at the repository root is never read. Set `OWNER_PASSWORD` and
`AUTH_SECRET` first (`openssl rand -base64 32` for the secret), or `/sign-in`
refuses every password and says why: the landing page at `/` is the only
page that opens without them. Then fix the `DATABASE_URL` line the copy
carries: `.env.example` still names a `postgres://` URL, a leftover of the
port, and the catalog refuses one (`databasePath()` in
`services/catalog/src/env.ts`). Set it to the catalog's file,
`DATABASE_URL=~/.gnosia/catalog.db`, which is also the default the app and
the catalog CLI use with no variable set (`$GNOSIA_HOME/catalog.db` when that
is set); a path there also keeps `npm run dev:up`'s leftover Postgres check
out of the way. The app reads every course, note and
diagram from that file, so it has to be migrated, imported and flipped first
(README.md, "Install"). A different file goes in `services/catalog/.env` as
well (copy `services/catalog/.env.example`, whose `DATABASE_URL` line needs
the same fix), because the catalog CLI reads that file and never
`apps/web/.env.local`; set in one place only, `migrate` and the app talk to
different databases. The file matters for the agent chat too, which needs at least one
provider key (`NVIDIA_API_KEY`, `GEMINI_API_KEY` or `OPENROUTER_API_KEY`).
With none set, the `/api/agent/*` routes answer `MISSING_API_KEY` and the rest
of the app works.

> **Do not clone with `--recursive`.** `tools/manimkc/`, `tools/remotionkc/`
> and `tools/revideokc/` are private repositories, so a
> recursive clone fails on them; `tools/tldrawkc/` and `tools/blenderkc/`
> are the public ones. A plain clone leaves the private directories empty and the app, tests and seed
> import all work. On a machine with access,
> `git submodule update --init tools/manimkc` fetches one (manim is a
> submodule inside that, so add `--recursive` there), and the `AGENTS.md` in
> it explains the ManimGL versus Manim Community split, the no-LaTeX
> constraint and the render loop.

> **A clone from before the re-layout needs a sync.** The submodules moved
> from the repo root into `tools/`. Pull, then
> `git submodule sync --recursive && git submodule update --init`, and delete
> the empty directories git leaves behind at the old paths.

> **`npm run canvas` needs a build first.** `tools/tldrawkc/` is the second
> submodule, and the script runs `tools/tldrawkc/dist/cli/index.js`, which is
> build output and is not committed. So:
> `git submodule update --init tools/tldrawkc && (cd tools/tldrawkc && npm ci && npm run build)`.
> Only diagram work needs it. Set `TLDRAWKC_ROOT` to use a checkout somewhere
> else; the script and the diagram indexer read the same variable, so they
> cannot end up on different builds. Its own conventions are in
> [`tools/tldrawkc/AGENTS.md`](tools/tldrawkc/AGENTS.md); the design docs it was
> built from are in [`tools/tldrawkc/docs/`](tools/tldrawkc/docs/README.md).

## Project layout

Four homes for code: `apps/` is deployed, `packages/` is imported, `services/`
owns a connection or a command surface, `tools/` belongs to another repo. The
first three are npm workspaces, so one `npm ci` at the root installs
everything and `npm run lint`, `typecheck`, `test` and `build` all run from
there.

| Directory | Role |
| --- | --- |
| `apps/web/` | The Next.js app, and the only workspace with a `next.config.ts`, a `public/` and a `vercel.json` |
| `apps/web/src/app/` | App Router routes: `/courses`, `/learn`, `/library`, the course and module pages, the `/api/*` handlers |
| `apps/web/src/components/` | The shell, the redesign's primitives in `ui/` ([IMPLEMENTATION.md](docs/design/IMPLEMENTATION.md)), checklists, recaps, the concept graph |
| `apps/web/src/lib/` | `learner-context.tsx` (the provider), `learner-store.ts` (the pool), `learner-api.ts` (the route guard), `asset-files.ts` (an asset row to its bytes: the blob store, or the row for a note, a log or a `.tldr`; nothing off the disk), `blob-store.ts` (the store the asset routes read), `asset-library.ts`, `library.ts` and `transcript.ts` (the `/library` pages' reads, taxonomy and sidecar parsing), `storage.ts` (pure reducers), `progress.ts`, `agent/` (prompts and providers), `site-url.ts` (where this deployment lives, for social cards and the OpenRouter referer), `kb/` (the concept graph, from the catalog) |
| `apps/web/src/data/` | The app's server-only view of the authored content, through the reader seam and from the database only: `getCourses()` and the course lookups in `courses/index.ts`, `getTags()` in `content.ts`, `getTopics()` in `topics.ts`, the seam's composition root in `source.ts`, which refuses a type nobody flipped |
| `seed/` | A small slice of the content in the export format: a fresh clone's database and the tests' fixture. The format is in its [README](seed/README.md), the course file in [COURSES.md](seed/COURSES.md) |
| `packages/content/` | The parsers the catalog imports an export's `content/` with, and the reader seam (`ContentSource`, `fileSource`, `selectSource`) the app and the studio read through; the app composes it with no file reader |
| `packages/schema/` | The Drizzle table definitions: the single source of the catalog's row shapes |
| `packages/blob/` | The blob store: one interface for where binaries live, and the `fs` adapter under `~/.gnosia/blobs` ([README](packages/blob/README.md)) |
| `services/catalog/` | Migrations, the database connection and the `catalog` CLI ([SCHEMA.md](services/catalog/SCHEMA.md)) |
| `scripts/learn/` | The `learn` pipeline's entry point and its pure maths modules; the command itself is `services/catalog/src/learn/` |
| `tools/manimkc/` | Submodule for narrated animation videos, with its own repo and `AGENTS.md` |
| `tools/remotionkc/` | Submodule for narrated Remotion videos, the second video tool, with its own repo and `AGENTS.md` |
| `tools/revideokc/` | Submodule for narrated Revideo videos, the third video tool, with its own repo and `AGENTS.md` |
| `tools/blenderkc/` | Submodule for narrated photoreal 3D videos rendered by Blender's Cycles, the fourth video tool, with its own repo and design doc (`docs/DESIGN.md`) |
| `tools/tldrawkc/` | Submodule for the tldraw diagram CLI behind `npm run canvas`, with its own repo, `AGENTS.md` and design docs in [`docs/`](tools/tldrawkc/docs/README.md). Needs `npm ci && npm run build` inside it before the script runs |
| `docs/`, `apps/web/public/` | Long-form notes (the pipeline's is [LEARN.md](docs/LEARN.md)), and static assets including the social card |

## What to contribute

Course data (through `catalog course export` and `course import`, see
[CURRICULUM.md](docs/CURRICULUM.md)), new verbs or flags in
`scripts/learn/cli.mjs`, UI that makes progress and recaps easier to read, and
bug fixes or docs. All welcome.

## Guidelines

1. **Justify any new runtime dependency in the PR body.** The `learn` CLI has
   none, and the web app's third-party list is `next`, `react`, `react-dom`,
   `@tailwindcss/typography` and `katex` (maths typesetting, pinned exactly;
   see `apps/web/src/lib/math.ts` for why it earned its place).
2. **`npm run build` has to pass, not just `npm run typecheck`.** The web
   app's `typecheck` runs `next typegen` first: `next-env.d.ts` (untracked, as
   Next's docs say) and the route types under `.next/types/` it imports exist
   only once `next typegen`, `next dev` or `next build` has run, and without
   them a fresh clone's typecheck fails on every image import. The build is
   still the gate that compiles the app the way it ships.
3. **The knowledge base is a real study record, and none of it is in git.**
   The notes, the session logs and the diagrams are rows in the catalog with a
   revision per write, and the nightly export (`npm run export:nightly`) is
   their copy; the event log, the mastery model and the schedule are rows with
   no second copy anywhere. A PR carries no study data, and nothing in a PR
   should run `learn observe` or a content write against the real database to
   try something out: the tests create and drop their own.
4. **Never commit an `.env` file.** `.gitignore` covers `.env*` except
   `.env.example`. Provider keys are server-side only.
5. **Never commit a dirty `tools/manimkc/`, `tools/remotionkc/`, `tools/revideokc/`, `tools/blenderkc/` or `tools/tldrawkc/` pointer.** All five submodules
   follow the same rule: commit and push inside the submodule first, then
   commit the updated pointer here, and only ever to a commit that is already
   on the submodule's remote. `git diff --submodule=log <name>` before
   `git add <name>` says which commit you are about to pin.
   `scripts/update-gitmodules.sh` (`npm run gitmodules`) checks out each
   submodule's tracked branch tip for you and leaves the pointer in the
   working tree to review before that commit; `--check` reports what is
   behind without touching anything.
6. **Do not copy the `/learn` and `/review` skills into `.claude/`.** They live
   in the `learning` plugin, installed globally, so they work in every project.
   A local copy would shadow the plugin and the two would drift apart.
7. **Re-verify any doc that states a count or a path** when you change what it
   describes. Several docs quote concept counts, course counts and layouts.
8. **Add tests** for logic in `apps/web/src/lib/`, `apps/web/src/data/`,
   `packages/content/` or `scripts/learn/lib/`.
   Components and pages are checked by the build and by looking at the app.
9. **One concern per PR.** Easier to review and merge.

## Pull request process

1. Create a feature branch from `main`. Never commit to `main` directly.
2. Run the full gate locally, from the repo root:
   `npm run lint && npm run typecheck && npm test && npm run build`. All four
   span every workspace; none of them needs a `cd` into `apps/web`.
3. Open a PR against `main` saying what changed and why.
4. Wait for CI and for the Greptile review bot. Fix every CI failure and every
   valid review comment; reply on the threads you disagree with rather than
   leaving them open.
5. Squash merge once CI is green and every review thread is resolved.

## End-to-end smoke

`npm run e2e` starts the built app against a throwaway database and walks it in headless Chromium: the landing page to sign-in, a wrong and a
right password, one review card rated Good, `/learn`, a concept workspace and
its tutor with no provider key, a session walked to its close screen, Mark
watched on a video, a settings change, the dark theme, and sign-out. It is
not part of `npm test`, because it needs a build.

Prerequisites:

- A current production build: `npm run build`. The script never builds, and
  runs whatever `apps/web/.next` holds, so rebuild after changing the app.
- No database server. The catalog's own file is needed only with `--copy`.
- playwright-core from the tldrawkc submodule (`npm ci` inside
  `tools/tldrawkc`), or `PLAYWRIGHT_CORE` pointing at its `index.mjs`, and a
  Playwright Chromium in the cache or `CHROMIUM` pointing at one. This is the
  same lookup `docs/design/kit/shots.mjs` uses; the repo installs nothing for it.

**It never writes to your catalog.** A review rating, a session answer and
Mark watched all write real evidence, and the event log is append-only, so
the run works on a database file of its own,
`<OS temp dir>/gnosia_e2e_<pid>_<time>.db`, and removes it afterwards, on a
failure and on Ctrl-C too (`scripts/e2e.mjs`). `--keep-db` leaves it behind
to inspect, and prints the `rm` line; `--headed` shows the browser.

By default it builds that database from the seed, exactly as README.md,
"Install", builds a fresh clone's: an empty database, migrated, `catalog
import seed/`, all six types flipped, and one `learn observe` so a review card
is due, with the diagram's SVG in a temp blob store. The seed has no videos, so
the video step (play, pause, see the place saved) prints `SKIP` with the reason
and counts as neither a pass nor a failure. `--copy` (or `E2E_TEMPLATE_DB=<file>`) copies the catalog's
own file, or the file named, instead, through SQLite's backup API so a file
another process holds open still copies whole (`copyDatabase` in
`scripts/lib/sqlite.mjs`); every content type must be flipped there.
`--seed` is still accepted and means the default.

Reading a failure: the run prints one line per step and a final `PASS` or
`FAIL`, and exits 1 on any failure (2 when a prerequisite is missing). A
failed step names the locator it was waiting for and the path of a full-page
screenshot. The last row fails on any `console.error`, uncaught page error or
response of 400 or more, each tagged with the step it happened in; the 503
the `/api/agent/*` routes answer with no provider key is the one expected
failure. Screenshots and `server.log` (the output of `next start`) are in the
directory printed on the first line, under the OS temp directory, never in
the tree.

## Reporting bugs

Use the [bug report template](https://github.com/c-wenlong/gnosia/issues/new?template=bug_report.yml)
and include your OS, Node version, browser and whether it was the live site or
`npm run dev`; the exact command or route that failed with its full output; and
steps to reproduce.

## Questions?

Read [README.md](README.md) for the tour, [ARCHITECTURE.md](ARCHITECTURE.md)
for how the layers fit together, and [docs/LEARN.md](docs/LEARN.md) for the
tutoring loop. Discussions are not enabled on this repo, so an
[issue](https://github.com/c-wenlong/gnosia/issues) is the only channel.
