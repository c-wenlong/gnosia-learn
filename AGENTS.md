<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


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
  live in `manimkc/out/final/` locally.
