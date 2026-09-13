# Contributing to self-learn

Thanks for your interest in contributing! self-learn is a Next.js study hub
with a file-backed tutoring pipeline beside it. Both halves are meant to stay
readable: plain files, no hidden state.

## Getting started

```bash
git clone --recursive https://github.com/c-wenlong/self-learn.git
cd self-learn
npm ci
cp .env.example .env.local
npm run dev
npm test
```

The catalog is optional for the web app and required for its own tests:

```bash
createdb self_learn            # Homebrew Postgres 17, already running
npm run catalog -- migrate
npm run catalog -- status
```

Without a reachable Postgres the catalog tests skip themselves with a reason
and `npm test` still passes.

`.env.local` matters only for the agent chat, which needs at least one
provider key (`NVIDIA_API_KEY`, `GEMINI_API_KEY` or `OPENROUTER_API_KEY`).
With none set, the `/api/agent/*` routes answer `MISSING_API_KEY` and the rest
of the app works.

> **Clone with `--recursive`.** `tools/manimkc/` is a git submodule, and manim
> is a submodule inside that. An existing clone catches up with
> `git submodule update --init --recursive`. Without it the directory is empty,
> and so is the `AGENTS.md` in it that explains the ManimGL versus Manim
> Community split, the no-LaTeX constraint and the render loop.

> **A clone from before the re-layout needs a sync.** Both submodules moved
> from the repo root into `tools/`. Pull, then
> `git submodule sync --recursive && git submodule update --init`, and delete
> the empty `manimkc/` and `tldrawkc/` directories git leaves behind.

> **`npm run canvas` needs a build first.** `tools/tldrawkc/` is the second
> submodule, and the script runs `tools/tldrawkc/dist/cli/index.js`, which is
> build output and is not committed. So:
> `git submodule update --init tools/tldrawkc && (cd tools/tldrawkc && npm ci && npm run build)`.
> Only diagram work needs it. Its own conventions are in
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
| `apps/web/src/app/` | App Router routes: home, `/learn`, the course and module pages, the `/api/agent/*` handlers |
| `apps/web/src/components/` | Shell, sidebar, progress, checklists, recaps, the concept graph |
| `apps/web/src/lib/` | `learner-context.tsx` (the provider), `learner-store.ts` (the pool), `learner-api.ts` (the route guard), `storage.ts` (pure reducers), `progress.ts`, `agent/` (prompts and providers), `kb/` (the concept graph, from the catalog) |
| `apps/web/src/data/` | The app's server-only view of `content/`: course lookups in `courses/index.ts`, themes in `content.ts`, the repo root in `repo-root.ts` |
| `content/` | The curriculum itself: one YAML file per course, the topic vocabulary, the cross-course tags ([CURRICULUM.md](docs/CURRICULUM.md)) |
| `packages/content/` | The reader both the app and the catalog parse `content/` with |
| `packages/schema/` | The Drizzle table definitions: the single source of the catalog's row shapes |
| `services/catalog/` | Migrations, the database connection and the `catalog` CLI ([SCHEMA.md](services/catalog/SCHEMA.md)) |
| `scripts/learn/` | The `learn` pipeline's entry point and its pure maths modules; the command itself is `services/catalog/src/learn/` |
| `learn/` | The knowledge base's files: `concepts/<domain>/`, `sessions/`, `assets/`, `map.md`. The state is in Postgres |
| `tools/manimkc/` | Submodule for narrated animation videos, with its own repo and `AGENTS.md` |
| `tools/tldrawkc/` | Submodule for the tldraw diagram CLI behind `npm run canvas`, with its own repo, `AGENTS.md` and design docs in [`docs/`](tools/tldrawkc/docs/README.md). Needs `npm ci && npm run build` inside it before the script runs |
| `docs/`, `apps/web/public/` | Long-form notes, and static assets including the social card |

## What to contribute

Course data under `content/courses/`, new verbs or flags in
`scripts/learn/cli.mjs`, UI that makes progress and recaps easier to read, and
bug fixes or docs. All welcome.

## Guidelines

1. **Justify any new runtime dependency in the PR body.** The `learn` CLI has
   none, and the web app's four (`next`, `react`, `react-dom`,
   `@tailwindcss/typography`) are the whole list.
2. **`npm run build` has to pass, not just `npm run typecheck`.**
   `next-env.d.ts` imports `./.next/types/routes.d.ts`, which only `next dev`
   or `next build` generates, so route types are checked properly only once a
   build has run.
3. **The knowledge base is a real study record, and half of it is not in git.**
   The notes and the session logs under `learn/` are versioned on purpose; the
   event log, the mastery model and the schedule are rows in Postgres and have
   no second copy anywhere. A code PR should not carry changes to
   `learn/concepts/` or `learn/sessions/` unless the knowledge base is what the
   PR is about, and nothing in a PR should run `learn observe` against the real
   database to try something out — the tests create and drop their own.
4. **Never commit an `.env` file.** `.gitignore` covers `.env*` except
   `.env.example`. Provider keys are server-side only.
5. **Never commit a dirty `tools/manimkc/` or `tools/tldrawkc/` pointer.** Both submodules
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

## Reporting bugs

Use the [bug report template](https://github.com/c-wenlong/self-learn/issues/new?template=bug_report.yml)
and include your OS, Node version, browser and whether it was the live site or
`npm run dev`; the exact command or route that failed with its full output; and
steps to reproduce.

## Questions?

Read [README.md](README.md) for the tour, [ARCHITECTURE.md](ARCHITECTURE.md)
for how the layers fit together, and [learn/README.md](learn/README.md) for the
tutoring loop. Discussions are not enabled on this repo, so an
[issue](https://github.com/c-wenlong/self-learn/issues) is the only channel.
