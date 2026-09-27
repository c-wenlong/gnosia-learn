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
| [tools/tldrawkc/docs/](tools/tldrawkc/docs/README.md) | The tool's design docs: architecture, CLI contract, helpers, decisions, roadmap |
| [docs/TLDRAWKC-INTEGRATION.md](docs/TLDRAWKC-INTEGRATION.md) | The diagram studio at `/studio`: the session and job schema, the runner, the UI, and the decisions behind them |
| [docs/design/DESIGN.md](docs/design/DESIGN.md) | The redesign: sixteen decisions, the routes and screens, the hi-fi tokens and where each came from |
| [docs/design/IMPLEMENTATION.md](docs/design/IMPLEMENTATION.md) | Building the redesign: the phases and their status, the token and component contract, the shell (top bar, tab bar, `data-layout`), the habit data, `/courses`, and the screenshot tool |
| [docs/design/BRAND.md](docs/design/BRAND.md) | The Gnosia brand: the idea, the seven `--brand-*` tokens with their contrast ratios, how the mark is built, the mascot rules, and where each piece appears |

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
- **`MANIMKC_ROOT` and `MANIMKC_HOME` are different questions, and the catalog
  only answers one of them.** `MANIMKC_ROOT` is the checkout, the same variable
  and the same meaning manimkc's own CLI gives it, and
  `services/catalog/src/env.ts` reads it as the default for `--manimkc-root`
  and as where the pinned CLI runs from. `MANIMKC_HOME` is the data root and
  nothing in this repo reads it: the indexers take that from each report's
  `outRoot`. `TLDRAWKC_ROOT` is the same idea for the other submodule, read by
  `npm run canvas` as well so the two cannot run different builds. All three
  default to the paths in `.gitmodules`, so a clone configures nothing.
- **Drive it through its CLI, not by hand.** `tools/manimkc/tools/cli/manimkc` is
  stdlib-only Python, so it still runs when a venv is broken:
  `doctor` (venvs, ffmpeg, narration backend, output dirs), `home` (the data
  root and every path under it, plus `--migrate`), `api` (the palette
  and every `lib/` helper with a real usage line), `example`, `new` (scaffold a
  topic), `lint`, `preview`, `build`, `topics`, `mirrors`. Run it from any
  checkout, or install with `uv tool install -e tools/cli`.
- `tools/manimkc/server/` is a portable job server meant to run locally on macOS or
  Linux, keeping its state under `$MANIMKC_HOME/state/server/`. See
  [`tools/manimkc/server/DESIGN.md`](tools/manimkc/server/DESIGN.md) for what it needs from a machine and how it decides one can take a job.
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
  than in Node, the helper bag a snippet may call, and the nine lint rules.
  None of that is guessable from this repo. The design docs behind it are in
  [`tools/tldrawkc/docs/`](tools/tldrawkc/docs/README.md).
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
  `inspect`, `export`, `verify`, `from-mermaid`, `list`, `meta set`, and
  `serve`, which mirrors a document in a real browser tab for a human to
  watch. Exit code 3 means lints remain, and it is deliberate: a diagram is
  not finished until `inspect` exits 0.
- **The loop does not end at `export`.** Run `verify <file.svg>` on what got
  committed: it renders the SVG back to a PNG and checks it is
  self-contained, its fonts applied, its text visible and its declared size
  honest, then Read the PNG it wrote to confirm the diagram actually looks
  right before calling the diagram done.
- Outputs go to `learn/assets/<concept-id>.tldr` and
  `learn/assets/<concept-id>.svg`, and **both are committed**: the `.tldr` is
  the editable source the next session extends, the `.svg` is what the
  session log embeds as `![[<concept-id>.svg]]`. Iteration PNGs go to the
  scratchpad and are never committed.
- **`learn/map.md` stays mermaid, and is not a job for this tool.** It is a
  derived cache that `learn map` rebuilds from the event log, and the web app
  reads its string out of the index without rendering it. Only teaching
  diagrams go on the canvas.
- **Every `.tldr` needs a topic, or `catalog index` refuses it by name.** The
  topic and concepts live in `meta.tldrawkc` on the document record, written
  by `new --topic ...` or backfilled with
  `npm run --silent canvas -- meta set <file> --topic <slug>`, and the slug
  must exist in `content/topics.yaml`. Re-export the SVG afterwards, since
  `export --svg` stamps the title and topic onto it.
- The end-to-end process is the `tldrawkc-diagram` skill, which lives in the
  submodule and is symlinked into `.claude/skills/tldrawkc-diagram`.
- **The `diagram-maker` agent drives the same CLI, and falls back when it is
  missing.** The `learning` plugin is global and shared across projects, so
  the agent checks `npm run --silent canvas -- doctor` first and reverts to
  the old hand-written SVG path when that fails. That keeps `/learn` working
  in a project that never adopted the submodule.
- **Every content edit to the plugin needs a version bump.** Claude Code
  reads the plugin from a cache under `~/.claude`, and `claude plugin update`
  refreshes it by comparing the version in `.claude-plugin/plugin.json`
  against the installed one. An edit that leaves the version alone is an edit
  nobody's session ever sees.

## Diagram studio: services/studio/

`services/studio/` is a local job runner and loopback API for the diagram
studio at `/studio`: a screen that browses `learn/assets/`, opens one on a
live tldraw canvas, and lets a person brief an agent to draw or extend a
diagram, review its work, and accept or discard it. It exists so drawing a
diagram can be delegated to an agent without a candidate ever landing on a
committed file until a person says so.

Rules of engagement:

- Run it with `npm run studio` from the repository root; it binds
  `127.0.0.1:7250` and nothing else. `/studio` routes 404 unless
  `STUDIO_ENABLED` is set. Studio thumbnails depend on that same flag alone,
  not on `ASSET_FILES_ENABLED`: from the browser they are served from
  `/studio/api/diagrams/{name}/svg` (the runner's own `/api/diagrams/{name}/svg`
  behind the `/studio/api/*` rewrite), deliberately not from
  `/api/assets/{id}/file`, because that route also needs the file indexed,
  and the one diagram a person most needs a tile for is the untopiced one
  with no asset row. `STUDIO_DAILY_USD` is a rolling 24-hour spend cap in
  dollars; unset, the default, means no cap.
- The spawned agent does not inherit the runner's Anthropic credentials.
  `agentEnv` in `services/studio/src/agent.ts` strips the auth variables
  (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` and the rest, listed there) so
  `claude -p` uses the machine's logged-in account; `STUDIO_AGENT_AUTH=env`
  passes them through. Inheriting was wrong because `-p` uses an environment
  key without asking, where an interactive `claude` asks and remembers a
  refusal: a login shell exporting an unscoped organisation key made every job
  fail its first request with a 400 while `claude` worked fine by hand. Such a
  job now ends after one attempt as `error_kind: agent` with the API's message,
  instead of three attempts reported as a missing file.
- The runner is the only thing that spawns an agent; the UI's job is HTTP
  calls to the runner and nothing else. The agent's Bash permission is an
  allowlist of one command prefix, `Bash(npm run --silent canvas:*)`, not a
  deny list, because a deny list over `rm`, `mv`, `git` and the rest does not
  stop a shell redirect, `tee`, or a command substitution from writing
  anywhere in the tree. Read and write rules in
  `services/studio/src/settings.ts` are absolute paths resolved from
  `REPO_ROOT` at spawn time, not relative ones, because manimkc already
  shipped the bug where a relative rule stops matching the moment its data
  root moves.
- A job writes only to `learn/assets/.candidates/`; nothing under
  `learn/assets/` changes until a person presses Accept, and Accept never runs
  `git add`. It renames the candidate into place and tells the person the
  `git add` line to run themselves. `indexed: false` after an accept is a
  banner asking for a manual reindex, not a failure: the files are the output
  and the catalog row is derived from them.
- `job.cost_source` in `services/studio/src/cost.ts` says where `cost_usd`
  came from: `result` when the agent's session exited cleanly and reported its
  own `total_cost_usd`, `stream` when the runner accumulated it from
  per-message usage after a cancel, timeout or interrupt killed the session
  before it could report. A `stream` figure is always an under-estimate,
  measured between 80% and 93% of the true cost across the nine sessions on
  disk, and the runner never scales it up: a fudge factor would make the
  number unauditable against the CLI's own figure. An unpriceable model
  records `null`, never zero, so an unknown cost is not presented as a free
  job; the spend cap's real protection is the fallback that keeps pricing at
  the brief's own model when the stream names one the rate table has never
  heard of, so an all-null reading is a rare edge case rather than the
  ordinary path.
- The mirror iframe at `/studio/d/<name>` is cross-origin, so the studio has
  no channel to ask the live canvas anything; it derives the SVG-freshness
  pill by comparing file modification times instead. An open canvas sends a
  heartbeat, and a mirror nobody has asked about for `STUDIO_MIRROR_IDLE_MS`
  (15 minutes by default) is closed.
- Read [`docs/TLDRAWKC-INTEGRATION.md`](docs/TLDRAWKC-INTEGRATION.md) for the
  design this section is shortened from: the schema, the runner's full
  constraints, the gate, and the edge cases behind each rule above.

## Workflows

Procedures for the two submodules and the checkout they live in. Each step
below comes from a real failure, so the reason stays attached to the step
instead of being a bare command list.

### Workflow 1: move a submodule to a newer commit

Five separate things have to happen in order; skipping any one of them fails
quietly rather than loudly.

1. `npm run gitmodules -- --check` first. It is genuinely read-only: for a
   submodule that is not yet checked out it reads the pinned commit straight
   from the superproject's tree and the target from `git ls-remote`, so it
   neither fetches into nor checks out the submodule. It exits 1 when
   anything is behind, 0 otherwise.
2. Make sure the submodule sits on its own `main` before running the script
   for real. A squash merge writes a new commit id on `main`, so the branch
   commit that got merged is not an ancestor of it, and
   `scripts/update-gitmodules.sh` reports `(diverged, skipped)` rather than
   force-detaching and throwing local work away. Fix with
   `git -C tools/<name> checkout main`. That is correct behaviour, not a bug:
   the script cannot tell a merged branch from an unpushed one.
3. `npm run gitmodules`. It fetches, checks out the new commit in the
   submodule's working tree, and stops there. It stages nothing, commits
   nothing, and never writes `.gitmodules` or any git config.
4. Rebuild the tool if it ships build output. For tldrawkc that is
   `cd tools/tldrawkc && npm ci && npm run build`. `dist/` is gitignored, so
   no git operation ever refreshes it: after a pointer move the source is new
   and the code that actually runs is still old, with nothing warning you.
5. Commit the pointer on a branch and open a PR. An uncommitted pointer bump
   does not survive: checking out any branch re-syncs the submodule to
   whatever commit that branch records, silently undoing the bump. Before
   `git add`, run `git diff --submodule=log tools/<name>` and check it lists
   only commits that are already pushed.

### Workflow 2: verify a tool rebuild

Do not grep `dist/` for a function name to confirm a rebuild took. The page
bundle is minified into a single line of roughly 280,000 characters with
mangled internal names, so a grep can say yes on a stale build. Verify by
behaviour instead: run
`npm run --silent canvas -- from-mermaid <scratchpad-path>.tldr --source
tools/tldrawkc/test/fixtures/mermaid/subgraph-8-9.mmd`. A working build
prints `8 nodes, 9 edges, 1 container, 18 shapes` and exits 0; a broken or
stale one throws, prints a different shape count, or exits nonzero. That
exact line is the expected value, not just "some output changed". Behaviour
is the only honest check here; say so plainly rather than treating a grep as
proof.

### Workflow 3: working in a checkout other sessions share

Several Claude sessions can hold this checkout at once and move its branch
under you. Before any git decision, `git fetch origin` and read the file you
care about from `origin/main`, not the working tree, since the tree can be
mid-change from another session. Do PR work in a `git worktree` instead of
checking out a branch in the shared tree, so nobody's branch moves under
them. Never stage a submodule or a file you did not intend to change;
`git status` in a shared checkout routinely shows someone else's work in
progress.

### Workflow 4: resuming a stalled agent's PR

Twice in one session an agent building a phase was killed mid-review, once by
a rate limit and once by a stall. Both times the branch and the open PR
survived; the agent's own report of what it had done did not.

1. Find the branch and the PR: `gh pr list` and `git ls-remote --heads`.
2. Read the PR body and every review thread on GitHub itself, not from
   memory. A report you never saw is not evidence of anything.
3. Check the worktree for uncommitted changes before touching it further.
4. Resume from the branch rather than restarting the phase from scratch.
5. Re-verify the PR's own "Done when" checklist yourself. Do not merge on the
   strength of a report nobody read.

The one trap: a half-finished fix sitting in the worktree can look complete
on a skim, such as an `await` on a function whose return type is `void`,
which compiles clean and fixes nothing.

### Workflow 5: give the review bot time

PR #53 opened and merged in under seven minutes, and Greptile never ran on
it. A PR is not reviewed until the bot has posted a review; a merge before
that is a merge with no review at all. Check `gh pr view <n> --json reviews`
before merging. An empty list minutes after opening means the review has not
happened yet, not that the PR is clean.

### Where a submodule's commit lives

| Where | What it holds | How to read it |
| --- | --- | --- |
| The committed pointer | A tree entry, mode `160000`, at the path this repo tracks | `git ls-tree HEAD tools/<name>` |
| The staged pointer | The commit about to land if you commit right now | `git ls-files -s tools/<name>` |
| Your own checkout | The submodule's own `.git`, and its `HEAD` | `tools/<name>/.git` is a file whose `gitdir:` line names where the submodule's real git dir is; resolve it by reading the file rather than assuming the path, since it differs between a plain checkout (`../../.git/modules/<name>`) and a linked worktree (`.git/worktrees/<worktree>/modules/<name>`). The submodule's `HEAD` lives under that resolved path |
| `.gitmodules` | Path and URL only | Never a commit id |

## Gotchas

Traps that cost time once already. Each names the file, so the reasoning does
not have to be worked out again.

- **`/` is public and everything else is behind `apps/web/src/proxy.ts`.** The
  pages live in two route groups: `apps/web/src/app/(site)/` (the landing page
  and `/sign-in`, no shell, no database) and `apps/web/src/app/(app)/` (every
  other page, whose layout calls `requireSignedIn()` and then draws the
  shell). The Today dashboard is `/today`, not `/`. A new page goes in
  `(app)/`; a new public page goes in `(site)/` *and* in `isPublicPath` in
  `apps/web/src/lib/auth/core.ts`, or the proxy redirects it to sign-in.
  `OWNER_PASSWORD` and `AUTH_SECRET` must both be set or nobody can sign in,
  locally included: that is deliberate, see "Signing in" in
  `docs/DEPLOYMENT.md`.
- **The theme is six modes on two axes and two classes, and `dark:` is only
  one of them.** A mode is a palette (`classic`, `gnosia`) and an appearance
  (`light`, `dark`, `system`), stored as one string: `light`, `gnosia`,
  `dark`, `system`, `gnosia-dark`, `gnosia-system` in `THEME_MODES`
  (`packages/schema/src/shared.ts`), with `paletteOf`, `appearanceOf` and
  `themeModeFor` beside it. The first four keep the meaning they had before
  the palette axis (`gnosia` is Gnosia light, `system` is Classic), so never
  rename one. `<html>` gets `gnosia` for the brand palette and `dark` for a
  dark appearance, both for Gnosia dark. A component that hard-codes a colour
  for "light" is wrong under `gnosia`, so it reads tokens only, and a new
  token gets a value in every block of `apps/web/src/app/globals.css`
  (`:root`, `.dark`, `.gnosia`, `.gnosia.dark`) or it silently falls back.
  `.gnosia.dark` must declare every token `.gnosia` sets: under both classes
  the later of the two one-class blocks wins, so a token only `.gnosia`
  defines would leak its light value into the dark palette. Both system modes
  are resolved by an inline script in the root layout, not by CSS, so
  `matchMedia` is the only place `prefers-color-scheme` is read.
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
  else can resolve. Workflow 1 under [Workflows](#workflows) has the full
  sequence: `--check`, put the submodule back on `main`, run the script,
  rebuild, then commit.
- **The `event` append-only trigger is `FOR EACH ROW`, and must stay that way.**
  As `FOR EACH STATEMENT` (how migration `0001` first wrote it) it fired on the
  `ON DELETE SET NULL` that Postgres runs against `event.concept_slug` whenever
  any concept is deleted — even with `event` completely empty. The effect was
  that no `concept` row could ever be deleted, which breaks the indexers.
  Migration `0003_append_only_per_row` fixes it and
  `services/catalog/test/schema.test.ts` guards it.
- **`index_run.source_root` is not where a manimkc file is.** It is the
  directory the run *read*, which for manimkc is the checkout the CLI was
  pointed at, and for `concepts`, `diagrams` and `sessions` is a repo-relative
  folder. A `manimkc:` asset's `out/…` path resolves against manimkc's data
  root instead, which the run records on `index_run.metadata.outRoot` in
  `services/catalog/src/index/manimkc.ts`. Join the wrong one and every video
  404s at once, since with `MANIMKC_HOME` set the two are different
  directories. A row indexed before that value existed carries no `outRoot`,
  and the honest answer there is "re-run `npm run catalog -- index --only
  manimkc`", never a 404 that reads as a deleted file.
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
- **`.env.local` belongs in `apps/web/`, not the repository root.** Next loads
  `.env*` files from the directory it starts in, and since the move that is
  `apps/web/`. A root copy is silently ignored: the symptom is every video
  page saying to set `ASSET_FILES_ENABLED=1` while the variable sits in a file
  nothing reads. `.env.example` stays at the root because it documents the
  whole repo; copy it to `apps/web/.env.local`.
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
- **A drizzle error's message never says why the database failed.** drizzle
  wraps every driver error as `Failed query: <sql>` and puts the driver's error
  on `cause`, and a refused `localhost` connection arrives there as an
  `AggregateError` with an empty message. So a dead port, a bad password and a
  missing database all read the same. Read the `code` down the `cause` chain,
  as `services/catalog/src/connection-failure.ts` does; the catalog CLI turns
  it into exit 3 for unreachable, which is what the studio's D16 degrade keys
  on. A regex over the text is how the studio once refused every job with the
  database down.
- **Never edit an applied migration, including its comments.** drizzle keys
  migrations by the sha256 of the whole file, so rewording a comment in
  `services/catalog/drizzle/*.sql` makes it look unapplied and
  `npm run learn -- doctor` starts reporting the database as behind. Bundle 5
  did this to itself once, tidying a comment in 0004. Corrections go in
  `SCHEMA.md` or in the schema source, never in the SQL.
- **A `"use client"` module's exports are client references, functions
  included.** A server component that imports `assetKindLabel` from
  `AssetCard.tsx` type-checks, builds without a warning, and throws *Attempted
  to call assetKindLabel() from the server* on the first request: what the
  server holds is a stub for a function that lives in the browser bundle.
  `npm run build` does not catch it, so the only way to find it is to load the
  page. The pure half of a client component goes in its own React-free module —
  `apps/web/src/components/asset-meta.ts` beside `AssetCard.tsx`, the same shape
  as `media.ts` beside `VideoPlayer.tsx` — and the component imports it like
  anyone else.
- **A page's `params` are not URL-decoded; a route handler's are.**
  `/library/[id]` is handed `"link%3Acs3216-m3-r1"` while
  `/api/assets/[id]/file` is handed `"link:cs3216-m3-r1"`, for the same URL
  shape. The type is `string` on both sides and nothing says which you have, so
  a page that uses `params.id` as a primary key 404s on every row in the
  catalog and builds clean. `decodeAssetId` in `apps/web/src/lib/library.ts`
  does it, and swallows the `URIError` a malformed escape raises so a hand-typed
  URL is a 404 rather than a 500.
- **A poster needs `format=yuvj420p` in the filter chain, or ffmpeg writes
  nothing.** `apps/web/src/lib/asset-posters.ts` extracts a still frame as
  JPEG, and mjpeg refuses a limited-range YUV source outright: *Non full-range
  YUV is non-standard*, then *Could not open encoder before EOF*, then a
  zero-byte output and a non-zero exit. It looks exactly like a corrupt video.
  The manim renders happen to be full-range and worked without it; a clip from
  anywhere else does not. Its cache lives under the system temp root, never in
  the tree, for the same reason `$MANIMKC_HOME` exists: generated data that a
  `git clean` or a relayout can delete is generated data that will be deleted.
- **Coverage is scoped to `apps/web/src/lib`, `apps/web/src/data` and
  `scripts/learn` on purpose.** `apps/web/src/app` and
  `apps/web/src/components` are view code and untested by design, and vitest 4 dropped `coverage.all`, so unmatched files do not appear
  at all. A low overall percentage is not a regression signal; the thresholds
  in `vitest.config.ts` are.
- **Killing a spawned `npm run` child does not kill what it started.**
  `child.pid` in `services/studio/src/mirrors.ts` is the `npm` launcher; the
  process actually holding the port, `canvas serve`, is two levels down.
  `stopChild` in `services/studio/src/proc.ts` signals the whole process
  group, polls `kill(-pid, 0)` until nothing answers, and escalates to
  `SIGKILL` after `STUDIO_KILL_GRACE_MS` (5 seconds by default) before waiting
  again. "Told it to stop" and "it has stopped" are different facts, and only
  the second is safe to rename a file behind.
- **A GitHub Actions run that fails in single-digit seconds with zero steps
  run, on `main` as well as on a PR, is the billing limit, not the code.** The
  annotation reads "recent account payments have failed or your spending
  limit needs to be increased." Every PR since 2026-09-14 has merged on the
  local gate (`npm run lint && npm run typecheck && npm test && npm run
  build`, with Postgres up). Greptile is a separate service and still runs.
- **A `next.config.ts` rewrite does not strip the browser's `Origin` header;
  only a route handler can.** Measured in phase 2 (PR #60): proxying
  `/studio/api/*` to the runner through `rewrites()` forwards `Origin`
  verbatim, and the runner's own guard then answers every POST with 403,
  because a transparent proxy is byte-identical to the page behind it.
  `apps/web/src/app/studio/api/[...segments]/route.ts` is a route handler for
  two reasons together: it is the only form that can strip `Origin`,
  `Sec-Fetch-*`, `Cookie` and `Host` before forwarding, and the only form that
  can read `STUDIO_ENABLED` at request time, since `rewrites()` is evaluated
  when the config loads.
- **No test may write into the tracked tree, and `vitest.setup.ts` now fails one
  that does.** vitest runs test files in parallel workers against one checkout,
  so a fixture dropped into `learn/assets/` is visible to every other suite
  while it is there. `services/catalog/test/catalog.test.ts` indexes that
  directory three times and asserts the second pass deletes nothing, so a
  `.tldr` the studio's tests wrote and removed between two passes was pruned by
  the second one and failed a suite that had nothing to do with it, about once
  in eight full runs and never when run alone. Two overlapping `npm test` runs
  failed every time. The studio's paths are all repo-relative by design, so
  `STUDIO_REPO_ROOT` points `services/studio/src/paths.ts` at a symlink farm
  under the OS temp directory and the setup file checks the tracked listing
  after every test file. A new suite that needs a tree to write into takes a
  temp one, the way `LEARN_ROOT` and `STUDIO_HOME` already do.
- **A studio job reaching a terminal state does not mean the runner has
  finished writing it.** `Runner.finish` in `services/studio/src/runner.ts`
  does five things in order: put the new state in the store's in-memory map,
  persist `job.json`, call `job finish` on the catalog, write any catalog error
  back onto the record, and close the session. `JobStore.update` sets that map
  synchronously and only then awaits the write, so a poll on
  `store.get(id)?.state` sees `awaiting_review` with four of the five still
  outstanding. A test that read `jobFinish.mock.calls` at that point found the
  array empty, and one that edited `job.json` there had its edit overwritten by
  the runner's own terminal record moments later. That was eight failures in
  twenty runs of `services/studio/test/cap.test.ts` **on its own** with the
  machine loaded, on `Cannot read properties of undefined (reading 'costUsd')`.
  `Runner.settled(id)` resolves after the last of the five and is the thing to
  wait on. A `setTimeout` is the same bet at longer odds, not a fix. The waits
  themselves live in `services/studio/test/wait.ts`: `until` polls for a named
  condition, and `allSettled` is what a teardown needs before it deletes
  `STUDIO_HOME`, since `drain` stops the agents without waiting for the
  verdicts. Neutering `Runner.settled` fails `queue.test.ts` eight runs in
  eight under load, on a state read too early and on `ENOTEMPTY` from the
  teardown deleting a workspace mid-write, so those waits are a real gate.
