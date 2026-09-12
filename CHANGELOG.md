# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project is continuously deployed and not versioned; entries are grouped by date.

## [Unreleased]

### Added

- **The catalog's indexers and read commands.** `npm run catalog -- index`
  fills Postgres from six sources: `content/topics.yaml`, `content/courses/`,
  `learn/concepts/`, `manimkc topics --json`, `learn/assets/` and
  `learn/sessions/`. Each is a pure "read files, return rows" module behind one
  shared writer that upserts in a single transaction per source and prunes what
  the source no longer produces. An unresolved topic or concept slug stops the
  run with the file and the slug named, and every unresolved reference in a
  source is reported at once rather than one per run.
- **`content/topics.yaml`, the shared topic vocabulary.** 81 topics across 22
  domains, each with aliases and the manimkc folders, course modules and
  concept notes it covers. It is the join the three content trees never had:
  every video, note, diagram, session and curriculum item now points at the same
  `topic` row. Every module id and concept slug appears in exactly one entry,
  and `catalog index` refuses a mapping claimed by two topics.
- **`content/courses/*.yaml`.** The ten courses as data, generated from the
  TypeScript objects rather than transcribed. They are now the only copy: the
  web app reads them too.
- **Four read commands, all `--json` and all bounded.** `ls` gives domains,
  topics or a collection's tree as titles and counts; `show` gives one topic,
  concept, collection, curriculum item or asset with everything pointing at it;
  `path` gives the prerequisite chain between two concepts in learning order,
  and says so when the arguments are the wrong way round; `search` covers topic
  titles and aliases, concept titles and asset titles, top 20. `show` returns
  paths, never bodies — the database says which file to read, git holds the
  words.
- **`status` grew a `sources` block**, backed by a new `index_run` table, so
  "is the manimkc half of this database stale" has an answer that is not
  "re-index and diff".
- **`topic.aliases`**, so `search "common data bus"` finds Tomasulo's algorithm.
- **`index --only` expands to the sources downstream of what it names**, and
  says which it added. Pruning a topic cascades into the links every other
  source owns, so running one source alone could leave the rest silently
  unlinked.
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
  GitHub Actions monthly, with version-locked families grouped so a bump
  cannot arrive unable to install, and `@types/node` majors ignored while the
  runtime is Node 22.
- `@types/node` moved from `^20` to `^22`, matching the Node 22 the `engines`
  field and CI already required.
- **Coverage reporting.** `npm run test:coverage` runs vitest with v8
  coverage scoped to `src/lib`, `src/data` and `scripts/learn`, and CI uploads
  the lcov report to Codecov. `codecov.yml` keeps the project status
  informational so a new baseline cannot block a merge, holds patch coverage
  at 80%, and ignores the App Router pages and React components, which are
  covered by the build rather than by unit tests.
- **A README header card** with the banner, the badges and a one-line
  statement of what the project is.
- **`packages/content`, one reader for `content/`.** `loadCourses`,
  `loadTopics` and `loadTags`, plus the `Course`/`Module`/`Topic`/`Resource`/
  `TagMeta` types, imported by both the web app and `catalog index`. The
  validation the parity test used to do after the fact now happens on the way
  in: unique course, module, topic and resource ids across every file, a
  `topic:` that resolves against `content/topics.yaml`, required slugs, a real
  boolean for `inferred`, a known resource type, and a filename that matches
  the course code. Every refusal names the file, and unresolved topics are
  reported together rather than one per run.
- **`content/tags.yaml`.** The eight cross-course themes, moved out of
  `src/data/tags.ts`.

### Changed

- **The web app reads `content/`, and `src/` holds no course data.** The ten
  `src/data/courses/*.ts` files and `src/data/tags.ts` are gone;
  `src/data/courses/index.ts` is a thin `server-only` module over
  `loadCourses()`, memoised per process, keeping the same exported lookups.
  `server-only` means a `"use client"` module reaching course data fails the
  build with the import chain printed instead of shipping a YAML parser and
  the whole curriculum to the browser, so the sidebar and the header progress
  bar take a nav projection as a prop from the root layout, and `TagChip` takes
  the resolved theme rather than its id. Every one of the 135 routes renders
  byte-identical text to before; the only markup difference is one fewer
  client chunk.
- **Courses carry an `order:`.** The shortlist's reading order used to be the
  order of an array in `index.ts`. Sorting ten files by name is a different
  sequence and nothing would have said so, so the key is authored, unique, and
  checked.
- `HANDOFF.md` moved out of the repository root into `docs/`, renamed with the
  date of the handoff it records.

### Security

- **Bounded what an anonymous call to the agent routes can cost.** Both
  `/api/agent/*` routes spend the owner's provider quota and the app has no
  user accounts, so there was nothing stopping anyone with the URL from
  driving them. `src/lib/agent/guard.ts` adds three cheap ceilings, checked
  cheapest first so a refused request never reaches a provider: a same-origin
  comparison of the request's own `Origin` and `Host` (403), a payload ceiling
  of 40 messages and 24000 characters (413), and a per-IP fixed window of 20
  requests a minute for chat and 6 for summarize (429, with `Retry-After`).
  The character budget counts the learner note, which reaches the system
  prompt unclamped, and measures non-string message content by its serialised
  length, since the chat route forwards content of any shape. Each limit is
  documented with what it does not stop.

### Removed

- **`src/data/courses/*.ts`, `src/data/tags.ts` and
  `src/data/courses/parity.test.ts`.** The parity test existed to keep two
  representations of the same courses in step; with one representation left
  there is nothing for it to compare. Its curriculum invariants moved to
  `packages/content/test/courses.test.ts`, where they assert on the files
  rather than on a TypeScript literal.
- **`globalProgress()` from `src/lib/progress.ts`.** It reached into the course
  data to find every topic id, which a client component can no longer do.
  `AppShell` calls `countsFromIds` over the ids the server layout handed it.
- **The `deploy.yml` GitHub Actions workflow.** Vercel's Git integration has
  been deploying every push to `main` on its own (the deployment metadata
  says `source: git`, `githubCommitRef: main`), while the workflow failed on
  every run with an invalid `VERCEL_TOKEN`. Fixing the token would only have
  deployed each commit twice. With it gone, the only GitHub secret the repo
  needs is the optional `CODECOV_TOKEN`.

### Fixed

- **`concept` rows could never be deleted.** The `event` append-only guard was
  written `FOR EACH STATEMENT`, so it fired on the `ON DELETE SET NULL` that
  Postgres runs against `event.concept_slug` whenever any concept is deleted —
  even with `event` completely empty. Migration `0003_append_only_per_row`
  makes both triggers `FOR EACH ROW`, which keeps the guarantee and drops the
  false positive. It was invisible until the indexers became the first thing to
  try deleting a concept.
- `catalog status` failed against a partially migrated database instead of
  reporting the outstanding migrations: `head` is non-null at 0000 or 0001 but
  `index_run` does not exist until 0002, so the row counts threw "relation does
  not exist".
- `catalog show <concept>` read mastery filtered by concept alone and took the
  first row, which would have returned another learner's belief once there is
  more than one. Now scoped to the learner explicitly.
- `catalog ls <collection>` reported only direct children, so a deeper level
  would have been silently absent. It stays one level deep, deliberately, but
  now counts what is below each child and names the command to see it.
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
