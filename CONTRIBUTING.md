# Contributing to gnosia

Thanks for your interest in contributing! gnosia is a Next.js study hub
with a tutoring pipeline beside it, both over one SQLite database file. Both
halves are meant to stay readable: every write is a revision with a reason,
and `catalog export` turns the content back into plain files at any time.

## Getting started

```bash
git clone https://github.com/c-wenlong/gnosia-learn.git
cd gnosia-learn
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
page that opens without them. The catalog needs no line at all: the app and
the catalog CLI both open `~/.gnosia/catalog.db` with no variable set
(`$GNOSIA_HOME/catalog.db` when that is set), and a `postgres://` value is
refused (`databasePath()` in `services/catalog/src/env.ts`). The app reads
every course, note and diagram from that file, so it has to be migrated,
imported and flipped first (README.md, "Install"); `npm run dev:up` stops
with that step named when the file is missing or empty. A different file is
`CATALOG_DB` in `services/catalog/.env` (copy
`services/catalog/.env.example`), which the catalog CLI and the app both
read; set in `apps/web/.env.local` alone, the app opens it while `migrate`
works on the default. The file matters for the agent chat too, which needs at least one
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
| `apps/web/src/lib/` | `learner-context.tsx` (the provider), `learner-store.ts` (the pool), `learner-api.ts` (the route guard), `asset-files.ts` (an asset row to its bytes: the blob store, or the row for a note, a log or a `.tldr`; nothing off the disk), `blob-store.ts` (the store the asset routes read), `asset-library.ts`, `library.ts` and `transcript.ts` (the `/library` pages' reads, taxonomy and sidecar parsing), `storage.ts` (pure reducers), `agent/` (prompts and providers), `site-url.ts` (where this deployment lives, for social cards and the OpenRouter referer), `kb/` (the concept graph, from the catalog) |
| `apps/web/src/data/` | The app's server-only view of the authored content, through the reader seam and from the database only: `getCourses()` and the course lookups in `courses/index.ts`, `getTags()` in `content.ts`, `getTopics()` in `topics.ts`, the seam's composition root in `source.ts`, which refuses a type nobody flipped |
| `seed/` | A small slice of the content in the export format: a fresh clone's database and the tests' fixture. The format is in its [README](seed/README.md), the course file in [COURSES.md](seed/COURSES.md) |
| `packages/content/` | The parsers the catalog imports an export's `content/` with, and the reader seam (`ContentSource`, `fileSource`, `selectSource`) the app and the studio read through; the app composes it with no file reader |
| `packages/schema/` | The Drizzle table definitions: the single source of the catalog's row shapes |
| `packages/blob/` | The blob store: one interface for where binaries live, and the `fs` adapter under `~/.gnosia/blobs` ([README](packages/blob/README.md)) |
| `eslint-rules/` | The web app's house rules as ESLint rules (`gnosia/*`: one kit piece per control, class lists through `cx`, sentence case, theme tokens, the studio's gate), each with the files it allows in `eslint.config.mjs` and its cases in `gnosia.test.mjs`. A rule about source text goes here, not into a test that walks the tree |
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
   still the gate that compiles the app the way it ships. CI builds only when
   a release is published (`deploy.yml`), so on a pull request the local
   build is the only one that runs before the merge.
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
3. Open a PR against `main` saying what changed and why. A change to an
   interaction on screen gets a browser video of it (see
   [Recording a PR video](#recording-a-pr-video)).
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
- No database server. A catalog file is needed only with `--copy`.
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
and counts as neither a pass nor a failure. `--copy` (or `E2E_TEMPLATE_DB=<file>`) copies
`$GNOSIA_HOME/catalog.db` (else `~/.gnosia/catalog.db`), or the file named,
instead, through SQLite's backup API so a file
another process holds open still copies whole (`copyDatabase` in
`scripts/lib/sqlite.mjs`); every content type must be flipped there. `--copy` reads neither
`CATALOG_DB` nor `DATABASE_URL` (`TEMPLATE_DB` in `scripts/e2e.mjs`), so a
catalog kept anywhere else is named with `E2E_TEMPLATE_DB`.
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

## Recording a PR video

`npm run demo:record` records one interaction in the built app as an mp4, so a
PR that changes what a person does on screen can show it:

```bash
npm run build
npm run demo:record -- --scenario scripts/demo-scenarios/concept-tutor-choice-checks.mjs --out ~/Desktop/choice-checks.mp4
```

It builds a scratch catalog from `seed/` (the same steps as the end-to-end
smoke, shared through `scripts/lib/app-harness.mjs`), starts `next start` from
the build with the test password, signs in before the recording starts, and
runs the scenario in Chromium with a visible pointer. Prerequisites are the
smoke's (a current build, playwright-core and a Playwright Chromium) plus
`ffmpeg` on `PATH`. The scratch directory goes under the OS temp directory and
is removed afterwards, `--keep` leaves it, and `--out` is refused inside the
checkout, so nothing lands in the tree. `--root <checkout>` records another
worktree's build, for a branch cut before this script existed.

**Tutor replies are scripted.** The server runs with every provider key blank,
so no model answers. A scenario hands `routeChat` the tutor's turns in order
(each the body `/api/agent/chat` sends: `content`, and a `check` when the turn
asks one), and `routeJson` the bodies of any other route it stubs, such as the
judge. Everything else is real: the page, the cards, and the writes into the
scratch catalog. Say so in the PR body when you attach a video.

A scenario is a module in `scripts/demo-scenarios/` that exports
`async run({ page, base, cursor, routeChat, routeJson })`. Move the pointer
with `cursor.click(locator)` and `cursor.type(locator, text)`, and give each
step time to be seen with `cursor.pause(ms)`; the header of
`scripts/demo-record.mjs` lists the rest. GitHub has no API to attach a video
to a PR, so drag the mp4 into the PR description in the browser, or send it to
the reviewer.

## Reporting bugs

Use the [bug report template](https://github.com/c-wenlong/gnosia-learn/issues/new?template=bug_report.yml)
and include your OS, Node version, browser and whether it was the live site or
`npm run dev`; the exact command or route that failed with its full output; and
steps to reproduce.

## Questions?

Read [README.md](README.md) for the tour, [ARCHITECTURE.md](ARCHITECTURE.md)
for how the layers fit together, and [docs/LEARN.md](docs/LEARN.md) for the
tutoring loop. Discussions are not enabled on this repo, so an
[issue](https://github.com/c-wenlong/gnosia-learn/issues) is the only channel.
