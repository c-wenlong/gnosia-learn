# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project is continuously deployed and not versioned; entries are grouped by date.

## [Unreleased]

### Added

- **Open-source hygiene files.** MIT `LICENSE`, `CONTRIBUTING.md`,
  `SECURITY.md`, `ARCHITECTURE.md` and this changelog. `ARCHITECTURE.md` is
  written from the code rather than the README: the three layers, the
  directory tables, the localStorage schema, the provider cascade, every
  threshold in the BKT and SM-2 implementations, and a numbered set of
  layering rules each verified by grep.
- **GitHub templates and automation.** Bug report and feature request issue
  forms, a pull request template whose checklist covers the real gate
  (`lint`, `typecheck`, `test`, `build`, no secrets, no dirty submodule
  pointer), a template config that routes vulnerabilities to the security
  policy instead of a public issue, and a Dependabot config watching npm and
  GitHub Actions weekly with development dependencies grouped into one pull
  request.
- **Coverage reporting.** `npm run test:coverage` runs vitest with v8
  coverage scoped to `src/lib`, `src/data` and `scripts/learn`, and CI uploads
  the lcov report to Codecov. `codecov.yml` keeps the project status
  informational so a new baseline cannot block a merge, holds patch coverage
  at 80%, and ignores the App Router pages and React components, which are
  covered by the build rather than by unit tests.
- **A README header card** with the banner, the badges and a one-line
  statement of what the project is.

### Changed

- `HANDOFF.md` moved out of the repository root into `docs/`, renamed with the
  date of the handoff it records.

### Removed

- **The `deploy.yml` GitHub Actions workflow.** Vercel's Git integration has
  been deploying every push to `main` on its own (the deployment metadata
  says `source: git`, `githubCommitRef: main`), while the workflow failed on
  every run with an invalid `VERCEL_TOKEN`. Fixing the token would only have
  deployed each commit twice. With it gone, the only GitHub secret the repo
  needs is the optional `CODECOV_TOKEN`.

### Fixed

- Documentation audit: counts, paths and command names that had drifted from
  the code they describe.

## 2026-09-12

### Added

- **A pixel-art app icon, README banner and social card**
  ([#1](https://github.com/c-wenlong/self-learn/pull/1)). The icon and the
  touch icon use the Next file conventions; the Open Graph card is declared
  by hand in the root layout, because under Turbopack the
  `app/opengraph-image.png` convention ignores the documented
  `opengraph-image.alt.txt` sidecar and would ship the card with no alt text.
  `resolveSiteUrl()` computes `metadataBase` from `NEXT_PUBLIC_SITE_URL`, then
  Vercel's injected production domain, then localhost, warning rather than
  throwing on an unusable value.
- **The learning-system architecture notes** under `docs/`, alongside the
  roadmap.sh reference PDFs.
- **The `manimkc-video` skill**, linked into this project so a topic with
  moving parts can be turned into a narrated animation.

### Changed

- manimkc bumped several times: nine narrated topics committed, Tex rendering
  routed through Tectonic shims, a `test_tex` fix for apt `dvisvgm`, and a
  README refresh with two new explainers.

## 2026-09-06

### Changed

- manimkc bumped: its `tools/` tree reorganised by function with a test suite
  added, the publish destination resolved from `.env`, faststart deliverables,
  and a Google Drive publish step.

## 2026-09-03

### Changed

- manimkc bumped: a `topics/` taxonomy, six narration backends, and a
  knowledge tree.

## 2026-08-30

### Added

- **manimkc as a submodule**, documented as the repo's third part: asset
  generation. Its own `AGENTS.md` covers the ManimGL versus Manim Community
  split, the no-LaTeX constraint, the shared scene library, the narration
  cache and the render-then-look verification loop. A fresh clone needs
  `git submodule update --init --recursive`, since manim is nested inside it.

### Changed

- `AGENTS.md` and `CLAUDE.md` unified, so there is one set of project
  instructions and `CLAUDE.md` only imports it.

## 2026-08-22

### Changed

- The `/learn` and `/review` skills moved out of this repo into the `learning`
  plugin under the `learning` marketplace, installed globally so they work
  from any project. A copy under `.claude/` would shadow the plugin and drift,
  so there is none.

## 2026-08-20

### Added

- **Propagation.** A correct answer now moves belief in the concepts it rests
  on, each prerequisite counted once at its shortest hop distance, attenuated
  by 0.4 per hop and capped at 0.9 so indirect evidence can never confer
  mastery on its own.
- **Two kinds of edge.** `requires` gates teaching and carries evidence;
  `assumes` orders the plan and does neither. The split exists because one
  relation was doing both jobs and the strictest reading won.
- **A live session log.** The exchange is written into the session file as
  Obsidian callouts as it happens, rather than summarised at the end.
- **`learn void`**, to retract a session's evidence as unreliable, and varied
  multiple-choice answer positions.
- **Domain folders for concepts.** Notes sit one level deep under
  `concepts/<domain>/`, while ids stay bare slugs so edges, wikilinks and the
  event log keep resolving.
- **Two-way links between sessions and concepts**, and a review slot for every
  answered question.

### Fixed

- **SM-2 conformance:** a failed item restarts the interval sequence but its
  E-Factor is left untouched. Penalising ease on a lapse punished it twice.
- **The frontier gates on readiness (0.75), not mastery (0.95).** Gating on
  mastery meant answering every prerequisite to near-certainty before the
  system would teach the concept you actually came for.
- A false claim that `reviews.json` was rebuildable from the event log. It is
  not: review events are logged but nothing replays them.

## 2026-08-18

### Added

- **The Probe → Plan → Teach → Close learning pipeline.** The `learn` CLI in
  `scripts/learn/`, plain Node ESM with no dependencies, plus the knowledge
  base in `learn/`: concept notes, session logs, an append-only event log and
  the caches derived from it. Bayesian Knowledge Tracing for mastery, SM-2 for
  spaced repetition, a concept DAG for ordering, and a mermaid map and JSON
  index generated for the web hub.

## 2026-08-05

### Added

- **Per-topic session recaps**, persisted with the rest of learner state and
  clamped on the way in so one runaway session cannot fill the localStorage
  quota. Recaps survive a progress reset: clearing progress means "study this
  again", not "forget what I concluded".

## 2026-07-17

### Fixed

- GitHub Actions deploy secrets wiring.

## 2026-07-16

### Added

- **The initial study hub.** A Next.js App Router app over the AY2026/27
  course shortlist: courses, modules, topics, progress, notes and resources
  held in browser localStorage, with a free agent cascade (NVIDIA, then
  Gemini, then OpenRouter) behind the tutoring chat.
