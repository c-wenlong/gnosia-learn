<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


## Project documents

| Document | What it covers |
| --- | --- |
| [README.md](README.md) | The front door: what this is, install, the surfaces |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the code is shaped and why |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branch, test and PR conventions |
| [SECURITY.md](SECURITY.md) | Reporting a vulnerability |
| [learn/README.md](learn/README.md) | Pipeline internals: formulas, primitives, the `--json` shapes, known limits |
| [services/catalog/SCHEMA.md](services/catalog/SCHEMA.md) | The tables, and why each one is shaped that way |
| [services/catalog/LEARN.md](services/catalog/LEARN.md) | What each `learn/state/*` file became, and how to recover |
| [services/catalog/SCHEMA.md](services/catalog/SCHEMA.md) | The catalog: every table, why the links are typed, how `event` stays append-only, how to run migrations |
| [content/README.md](content/README.md) | The three content folders, and the rules for editing the topic vocabulary |
| [content/courses/README.md](content/courses/README.md) | The course YAML: the shape of a file and what the reader refuses |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | How production deploys, secrets, the Vercel CLI |
| [docs/CURRICULUM.md](docs/CURRICULUM.md) | Editing course data without breaking learner state |
| [tldraw-integration/](tldraw-integration/README.md) | The brief for `tools/tldrawkc/`: decisions, architecture, CLI, helpers, phase roadmap |

## The learning pipeline

This repo holds a Probe → Plan → Teach → Close tutoring loop. It is split in
two on purpose:

| Layer | Where | What |
| --- | --- | --- |
| Instructions | `learning` plugin, `learning` marketplace | The `/learn` and `/review` skills, plus the `concept-mapper`, `fact-checker` and `diagram-maker` subagents |
| Code and data | this repo | The `learn` CLI (entry point `scripts/learn/cli.mjs`, command `services/catalog/src/learn/`), the notes in `learn/`, the learner state in Postgres, the web view at `apps/web/src/app/learn/` |

The `/learn` and `/review` skills are not in this repo. They live in the
`learning` plugin under the `learning` marketplace, at
`~/.quiver/plugins/learning/learning` (marketplace, then plugin), installed
globally, so they are available in every project. They open by
running `npm run learn -- status` and stop if it fails, since without the CLI
nothing gets measured or written down.

Do not add copies of those skills or agents back under `.claude/`. A local copy
would shadow the plugin and the two would drift apart. Edit the plugin instead.

Architecture, primitives and the honest list of known limits are in
[learn/README.md](learn/README.md).

## Asset generation: tools/manimkc/

`tools/manimkc/` is a git **submodule** (its own repo,
github.com/c-wenlong/manimkc) that renders narrated animation videos with
manim: ManimGL as the primary flavour, a Manim Community port alongside it,
and a TTS narration layer synced to the animations. It exists so the
tutoring loop can produce assets beyond text and SVG when a concept has
moving parts.

Rules of engagement:

- **Read `tools/manimkc/AGENTS.md` before working in there.** It covers the GL vs
  Community split, the no-LaTeX constraint, the shared scene library, the
  narration cache and quota, and the render-then-look verification loop.
  None of that is guessable from this repo.
- **Commits inside `tools/manimkc/` belong to that repo.** Commit and push there
  first, then commit the updated submodule pointer here. Never commit a
  dirty submodule pointer.
- Its venvs (`.venv`, `.venv-ce`) are local artifacts. A fresh clone needs
  `git submodule update --init --recursive` (manim is a nested submodule)
  plus the venv setup in its AGENTS.md before anything renders.
- **Rendered videos, the TTS cache and manimkc's own state live under
  `$MANIMKC_HOME`, not necessarily inside the submodule.** That variable is
  manimkc's data root and it defaults to its checkout, so with nothing set
  deliverables sit at `tools/manimkc/out/<domain>/<subdomain>/<topic>/<name>.mp4`,
  mirroring `tools/manimkc/topics/`. All of it is gitignored on both sides,
  which is exactly why it can live elsewhere: moving this submodule from
  `manimkc/` into `tools/` on 2026-09-13 deleted 25 rendered videos and the whole
  clip cache, because git does not carry gitignored files across a move. Point
  `MANIMKC_HOME` outside the checkout (`manimkc home --migrate ~/.self-learn`)
  and a repo relayout cannot do that again.
- **Never join a manimkc path onto the submodule root.** `manimkc topics --json`
  and `manimkc mirrors --json` report a top-level absolute `outRoot`; a
  deliverable is `outRoot + path`, and the indexers in
  `services/catalog/src/index/` do exactly that. The `out/…` strings themselves
  are unchanged and remain the catalog's `asset.path` and the mirror ledger's
  join key. `--manimkc-root` still names the *checkout*, which is a different
  thing from where its output lands.
- **Drive it through its CLI, not by hand.** `tools/manimkc/tools/cli/manimkc` is
  stdlib-only Python, so it still runs when a venv is broken:
  `doctor` (venvs, ffmpeg, narration backend, output dirs), `home` (the data
  root and every path under it, plus `--migrate`), `api` (the palette
  and every `lib/` helper with a real usage line), `example`, `new` (scaffold a
  topic), `lint`, `preview`, `build`, `topics`, `mirrors`. Run it from any
  checkout, or install with `uv tool install -e tools/cli`.
- The end-to-end process is the `manimkc-video` skill, which lives in the
  submodule and is symlinked into `.claude/skills/manimkc-video`. Everything
  `.claude/` holds here is either `launch.json` or a symlink into a submodule:
  that skill and `tldrawkc-diagram`.

## Diagrams: tools/tldrawkc/

`tools/tldrawkc/` is the second git **submodule** (its own repo,
github.com/c-wenlong/tldrawkc). It draws teaching diagrams on a real tldraw
canvas in headless Chromium, screenshots them so the agent can look, lints
them, and exports a self-contained SVG. It exists because hand-written SVG
shipped overlapping text and arrows pointing at nothing often enough that
reading the markup back was not catching it.

Rules of engagement:

- **Read `tools/tldrawkc/AGENTS.md` before working in there.** It covers the Node
  to browser bridge, why every shape is built inside a live `Editor` rather
  than in Node, the helper bag a snippet may call, and the eight lint rules.
  None of that is guessable from this repo.
- **Commits inside `tools/tldrawkc/` belong to that repo.** Commit and push there
  first, then commit the updated submodule pointer here. Never commit a
  dirty submodule pointer.
- Its `node_modules/` and `dist/` are local artefacts, and `dist/` is what
  `npm run canvas` actually executes. A fresh clone needs
  `git submodule update --init tools/tldrawkc` plus `npm ci && npm run build`
  inside it before any diagram command runs. Start with
  `npm run --silent canvas -- doctor`, which checks node, the page bundle,
  Chromium and the page itself.
- **Drive it through the CLI, not by hand.** From this repo that is
  `npm run --silent canvas -- <verb>`: `doctor`, `api` (every helper with a
  real usage line), `new`, `run` (a snippet plus `--shot`), `shot`,
  `inspect`, `export`, `from-mermaid`, `list`, `meta set`. `serve` is
  specified but not built. Exit code 3 means lints remain, and it is
  deliberate: a diagram is not finished until `inspect` exits 0.
- Outputs go to `learn/assets/<concept-id>.tldr` and
  `learn/assets/<concept-id>.svg`, and **both are committed**: the `.tldr` is
  the editable source the next session extends, the `.svg` is what the
  session log embeds as `![[<concept-id>.svg]]`. Iteration PNGs go to the
  scratchpad and are never committed.
- **Every `.tldr` needs a topic, or `catalog index` refuses it by name.** The
  topic and concepts live in `meta.tldrawkc` on the document record, written
  by `new --topic ...` or backfilled with
  `npm run --silent canvas -- meta set <file> --topic <slug>`, and the slug
  must exist in `content/topics.yaml`. Re-export the SVG afterwards, since
  `export --svg` stamps the title and topic onto it.
- The end-to-end process is the `tldrawkc-diagram` skill, which lives in the
  submodule and is symlinked into `.claude/skills/tldrawkc-diagram`.

## Gotchas

Traps that cost time once already. Each names the file, so the reasoning does
not have to be worked out again.

- **The OG image is declared by hand in `apps/web/src/app/layout.tsx`.** Next 16 builds
  with Turbopack, which ignores the documented `app/opengraph-image.alt.txt`
  sidecar, so the file convention would ship a social card with no alt text.
  `metadata.openGraph.images` carries the alt instead. Do not "simplify" it
  back to the convention.
- **`??` does not fall through on an empty string.** `NEXT_PUBLIC_SITE_URL=""`
  once crashed the build through `new URL("")`. `resolveSiteUrl()` in
  `apps/web/src/app/layout.tsx` now trims, defaults a missing scheme to
  `https://`, and
  falls back to localhost when parsing fails, because a bad value should cost a
  link preview and not the whole app.
- **Both submodules and `coverage/` are lint-ignored in `eslint.config.mjs`.**
  ESLint walks the whole tree from the repo root, so without those entries a
  local `npm run lint` walks manimkc's Python virtualenvs and reports 100k+
  findings from code this repo does not own, and lints tldrawkc's TypeScript
  against the wrong config. If lint output ever
  balloons, check that block first. Lint and typecheck either tool inside its
  own directory, with its own config.
- **`eslint.config.mjs` sets `settings.next.rootDir` to `apps/web/`.** Next is
  not installed at the repo root any more, and without it
  `@next/eslint-plugin-next` cannot find the app directory: the rules that need
  to know where the routes live stop checking anything and say nothing.
- **The tsconfig exclusion for `tldrawkc` is gone, and that is correct.** The
  root config used to be the app's, with `"**/*.ts"` walking into a submodule
  this repo does not own. It is now a small file whose `include` is flat
  (`*.ts`), and the app's config lives in `apps/web/` where it cannot reach
  `tools/` at all. Do not re-add an exclude for a directory nothing includes.
- **`npm run canvas` needs `--silent`, or `--json` is unparseable.** npm
  prints a two-line banner (`> self-learn@0.1.0 canvas` and the resolved
  command) on stdout before the tool writes anything, so
  `npm run canvas -- inspect x.tldr --json | jq` fails on the first token.
  `npm run --silent canvas -- ...` suppresses it. The same applies to
  `npm run learn`.
- **`canvas export --svg` takes the output path, it is not a flag.**
  `export x.tldr --svg` fails with "argument missing"; the call is
  `export x.tldr --svg x.svg`. Re-exporting in place after a `meta set` is
  the usual reason to run it, and passing the same path back is correct.
- **The two submodules moved to `tools/`, so an existing clone needs a sync.**
  `git pull` rewrites `.gitmodules` but not `.git/config`, so the next
  `git submodule update` still looks at the old path and quietly does nothing.
  After pulling this change, run
  `git submodule sync --recursive && git submodule update --init`, then delete
  the empty `manimkc/` and `tldrawkc/` directories git leaves at the root. A
  fresh clone needs none of this.
- **Only bump a submodule pointer to a commit that is already pushed.**
  Check `git diff --submodule=log tools/manimkc` (or `tools/tldrawkc`) before
  `git add`; staging a dirty or unpushed submodule leaves a pointer nobody
  else can resolve.
- **The `event` append-only trigger is `FOR EACH ROW`, and must stay that way.**
  As `FOR EACH STATEMENT` (how migration `0001` first wrote it) it fired on the
  `ON DELETE SET NULL` that Postgres runs against `event.concept_slug` whenever
  any concept is deleted — even with `event` completely empty. The effect was
  that no `concept` row could ever be deleted, which breaks the indexers.
  Migration `0003_append_only_per_row` fixes it and
  `services/catalog/test/schema.test.ts` guards it.
- **A catalog indexer must never `continue` past an unresolved slug.** The rule
  is refuse, with the file and the slug named; `IndexErrors` collects them so
  one run reports all of them. A skipped row is an asset that is silently
  missing from the catalog, and the audit in #27 recorded that happening once
  already.
- **Course content is read at runtime, not imported, so file tracing needs a
  hand.** `packages/content` calls `readFileSync(path.join(root, …))`, which
  Next cannot trace: it follows `import` statements. Most routes are
  prerendered and never look again, but the session page and the two agent
  routes are server-rendered on demand, and without
  `outputFileTracingIncludes` in `apps/web/next.config.ts` they deploy without
  the course files and 500 in production while every build and every static
  preview looks fine. Since the move, that entry needs `outputFileTracingRoot`
  beside it: tracing starts at `apps/web/`, so `content/` is outside the world
  unless the root is widened to the repo.
- **The app does not run from the repo root, so it cannot default to
  `process.cwd()`.** `@self-learn/content` does, which was right while the app
  *was* the root. `apps/web/src/data/repo-root.ts` walks up to the directory
  holding `content/courses` and every reader in the app is handed it. A new
  reader that calls `loadCourses()` with no `root` will work on a laptop
  running vitest from the repo root and fail in `next build`.
- **`@self-learn/content` needs no `transpilePackages` entry.** Next 16 builds
  with Turbopack, which transpiles npm workspace packages automatically
  (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/transpilePackages.md`).
  Adding one would be cargo cult. The package ships raw TypeScript with
  `exports` pointing at `src/index.ts`, same as `packages/schema`.
- **`server-only` is aliased in `vitest.config.ts`, and has to be.**
  `apps/web/src/data/courses/index.ts` and `apps/web/src/data/content.ts`
  import it so a
  `"use client"` module reaching them fails the build. Next resolves that
  specifier itself; vitest does not, and the npm package's default entry throws
  on import by design, so every test touching course data would die. The alias
  points at the package's own `empty.js`, which is the module Next substitutes.
- **`npm run dev` fails in the desktop preview harness** with
  `EPERM: uv_cwd`. To look at the app, build first and serve the production
  output: `npm run build` then, from `apps/web/`,
  `node ../../node_modules/next/dist/bin/next start -p <port>`.
- **`apps/*`, `packages/*` and `services/*` are npm workspaces, and each needs
  two things.** Its own `tsconfig.json`, because a single set of compiler
  options cannot serve DOM-and-JSX app code and Node-only libraries, and a
  `typecheck` script so the root `npm run typecheck` picks it up through
  `--workspaces`. Miss either and the workspace is never type-checked at all.
  They are NOT eslint-ignored: unlike the two submodules they are ours, and the
  root config lints them correctly.
- **The catalog needs a database before its tests do anything.**
  `createdb self_learn` against the Homebrew Postgres 17, then
  `npm run catalog -- migrate`. Without a reachable Postgres the schema tests
  skip themselves with a named reason and `npm test` still passes, so a green
  local run is not proof the schema is sound. CI runs a `postgres:17` service
  and is where they are a real gate.
- **Never edit a migration under `services/catalog/drizzle/` once it has been
  applied.** drizzle keys applied migrations by the sha256 of the file, so an
  edit makes it look unapplied on every database that already ran it. Change
  `packages/schema/src/`, then `npm run generate -w @self-learn/catalog`.
- **`learn/state/` is gone, and `learn` needs Postgres.** `events.jsonl`,
  `model.json` and `reviews.json` are the `event`, `mastery` and `review`
  tables; `index.json` is a query. `npm run learn -- status` fails when the
  database is down, which is deliberate — both skills open with it and stop.
  `concept add`, `check add` and `session log` still work without it, because
  they only touch files. The file-to-table mapping is
  [services/catalog/LEARN.md](services/catalog/LEARN.md).
- **A new note cannot carry evidence until it is indexed.**
  `mastery.concept_slug` and `event.concept_slug` are foreign keys, so
  `learn observe` on a note that no index run has taken in refuses, `--force`
  included. `learn index` refuses in turn if the note is in no topic's
  `maps.concepts` in `content/topics.yaml`. The order is: write the note, add
  the mapping, `npm run learn -- index`, then observe. `concept add` prints the
  reminder at the point the note is written.
- **The `--json` shapes are a contract with a plugin outside this repo.**
  `status`, `frontier`, `plan`, `observe` and `review due` are parsed by
  `/learn` and `/review`, documented in
  [learn/README.md](learn/README.md#the-json-shapes), and pinned by golden
  tests in `services/catalog/test/learn-cli.test.ts`. Changing one is a
  breaking change to the plugin, not a refactor.
- **The web app imports `@self-learn/catalog/state`, and `pg` stays external.**
  `serverExternalPackages: ["pg"]` in `apps/web/next.config.ts` is
  load-bearing: the
  driver resolves its optional native binding through a runtime `require` no
  bundler can follow. `transpilePackages` is deliberately *not* there —
  Turbopack transpiles workspace packages on its own, verified by removing an
  entry and building. A client component must take the shared constants from
  `@self-learn/schema/shared`, which imports nothing; taking them from
  `@self-learn/schema` would drag drizzle into the browser bundle, and
  `apps/web/src/lib/learner-store.ts` carries `import "server-only"` so that mistake
  fails the build rather than shipping a Postgres driver.
- **Every page is dynamic, and that is the point.** The root layout reads the
  theme cookie and the learner snapshot, so nothing is prerendered. Nothing
  reads the database at build time either — every read calls `connection()`
  first — so `npm run build` succeeds with no database, which is what Vercel
  has today. Verify both after touching the layout: build with `DATABASE_URL`
  pointed at a dead port, then serve it and load a page.
- **Never edit an applied migration, including its comments.** drizzle keys
  migrations by the sha256 of the whole file, so rewording a comment in
  `services/catalog/drizzle/*.sql` makes it look unapplied and
  `npm run learn -- doctor` starts reporting the database as behind. Bundle 5
  did this to itself once, tidying a comment in 0004. Corrections go in
  `SCHEMA.md` or in the schema source, never in the SQL.
- **Coverage is scoped to `apps/web/src/lib`, `apps/web/src/data` and
  `scripts/learn` on purpose.** `apps/web/src/app` and
  `apps/web/src/components` are view code and untested by design, and vitest 4 dropped `coverage.all`, so unmatched files do not appear
  at all. A low overall percentage is not a regression signal; the thresholds
  in `vitest.config.ts` are.
