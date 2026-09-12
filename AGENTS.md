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
| [learn/README.md](learn/README.md) | Pipeline internals: formulas, primitives, known limits |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | How production deploys, secrets, the Vercel CLI |
| [docs/CURRICULUM.md](docs/CURRICULUM.md) | Editing course data without breaking learner state |
| [tldraw-integration/](tldraw-integration/README.md) | The brief for `tldrawkc/`: decisions, architecture, CLI, helpers, phase roadmap |

## The learning pipeline

This repo holds a Probe → Plan → Teach → Close tutoring loop. It is split in
two on purpose:

| Layer | Where | What |
| --- | --- | --- |
| Instructions | `learning` plugin, `learning` marketplace | The `/learn` and `/review` skills, plus the `concept-mapper`, `fact-checker` and `diagram-maker` subagents |
| Code and data | this repo | The `learn` CLI in `scripts/learn/`, the knowledge base in `learn/`, the web view at `src/app/learn/` |

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

## Asset generation: manimkc/

`manimkc/` is a git **submodule** (its own repo,
github.com/c-wenlong/manimkc) that renders narrated animation videos with
manim: ManimGL as the primary flavour, a Manim Community port alongside it,
and a TTS narration layer synced to the animations. It exists so the
tutoring loop can produce assets beyond text and SVG when a concept has
moving parts.

Rules of engagement:

- **Read `manimkc/AGENTS.md` before working in there.** It covers the GL vs
  Community split, the no-LaTeX constraint, the shared scene library, the
  narration cache and quota, and the render-then-look verification loop.
  None of that is guessable from this repo.
- **Commits inside `manimkc/` belong to that repo.** Commit and push there
  first, then commit the updated submodule pointer here. Never commit a
  dirty submodule pointer.
- Its venvs (`.venv`, `.venv-ce`) are local artifacts. A fresh clone needs
  `git submodule update --init --recursive` (manim is a nested submodule)
  plus the venv setup in its AGENTS.md before anything renders.
- Rendered videos and the TTS cache are gitignored on both sides; deliverables
  live locally under `manimkc/out/`, which mirrors `manimkc/topics/`
  (`out/<domain>/<subdomain>/<topic>/<name>.mp4`).
- **Drive it through its CLI, not by hand.** `manimkc/tools/cli/manimkc` is
  stdlib-only Python, so it still runs when a venv is broken:
  `doctor` (venvs, ffmpeg, narration backend, output dirs), `api` (the palette
  and every `lib/` helper with a real usage line), `example`, `new` (scaffold a
  topic), `lint`, `preview`, `build`. Run it from any checkout, or install with
  `uv tool install -e tools/cli`.
- The end-to-end process is the `manimkc-video` skill, which lives in the
  submodule and is symlinked into `.claude/skills/manimkc-video`. That symlink
  and `launch.json` are the only things `.claude/` holds here.

## Gotchas

Traps that cost time once already. Each names the file, so the reasoning does
not have to be worked out again.

- **The OG image is declared by hand in `src/app/layout.tsx`.** Next 16 builds
  with Turbopack, which ignores the documented `app/opengraph-image.alt.txt`
  sidecar, so the file convention would ship a social card with no alt text.
  `metadata.openGraph.images` carries the alt instead. Do not "simplify" it
  back to the convention.
- **`??` does not fall through on an empty string.** `NEXT_PUBLIC_SITE_URL=""`
  once crashed the build through `new URL("")`. `resolveSiteUrl()` in
  `src/app/layout.tsx` now trims, defaults a missing scheme to `https://`, and
  falls back to localhost when parsing fails, because a bad value should cost a
  link preview and not the whole app.
- **`manimkc/` and `coverage/` are lint-ignored in `eslint.config.mjs`.**
  Without those entries a local `npm run lint` walks the submodule's Python
  virtualenvs and reports 100k+ findings from code this repo does not own.
  If lint output ever balloons, check that block first.
- **`tldrawkc/` is excluded twice, and both are load-bearing.** It is in the
  same ESLint ignore block, and also in `tsconfig.json`'s `exclude`, because
  unlike manimkc it is TypeScript: `"**/*.ts"` in the `include` list would
  otherwise typecheck a submodule this repo does not own against Next's
  compiler options, and `npm run typecheck` fails on it. Lint and typecheck
  the tool inside `tldrawkc/` with its own config.
- **Only bump the `manimkc/` pointer to a commit that is already pushed.**
  Check `git diff --submodule=log manimkc` before `git add manimkc`; staging a
  dirty or unpushed submodule leaves a pointer nobody else can resolve.
- **`npm run dev` fails in the desktop preview harness** with
  `EPERM: uv_cwd`. To look at the app, build first and serve the production
  output: `npm run build` then
  `node node_modules/next/dist/bin/next start -p <port>`.
- **Coverage is scoped to `src/lib`, `src/data` and `scripts/learn` on
  purpose.** `src/app` and `src/components` are view code and untested by
  design, and vitest 4 dropped `coverage.all`, so unmatched files do not appear
  at all. A low overall percentage is not a regression signal; the thresholds
  in `vitest.config.ts` are.
